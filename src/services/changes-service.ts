import {
  ArgoApplication,
  ManifestChangeStatus,
  ManifestChangesResult,
  ManifestFieldChange,
  ManifestResourceChange,
  ManifestResponse,
} from '../models/trace';
import {
  ManifestComparisonKind,
  revisionComparisonPlan,
} from './revision-service';

const MAX_RESOURCE_CHANGES = 200;
const MAX_FIELD_CHANGES = 50;
const MAX_DISPLAY_VALUE_CHARS = 240;
const MAX_MANIFEST_CHARS = 12000;
const MAX_CACHE_ENTRIES = 20;

const manifestCache = new Map<string, ManifestResponse>();
const manifestPromiseCache = new Map<string, Promise<ManifestResponse>>();

type JsonObject = {[key: string]: unknown};

interface ParsedManifest {
  key: string;
  apiVersion: string;
  kind: string;
  namespace?: string;
  name: string;
  value: JsonObject;
  canonical: string;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;

  const result: JsonObject = {};
  Object.keys(value)
    .sort()
    .forEach(key => {
      result[key] = stableValue(value[key]);
    });
  return result;
}

function stableStringify(value: unknown, pretty = false): string {
  return JSON.stringify(stableValue(value), null, pretty ? 2 : 0);
}

function apiGroup(apiVersion: string): string {
  const separator = apiVersion.indexOf('/');
  return separator === -1 ? '' : apiVersion.slice(0, separator);
}

function truncate(value: string, max: number): {value: string; truncated: boolean} {
  if (value.length <= max) return {value, truncated: false};
  return {value: `${value.slice(0, Math.max(0, max - 1))}…`, truncated: true};
}

function displayValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return truncate(value, MAX_DISPLAY_VALUE_CHARS).value;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return truncate(stableStringify(value), MAX_DISPLAY_VALUE_CHARS).value;
}

function pathSegment(base: string, key: string): string {
  const simple = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
  if (simple) return base ? `${base}.${key}` : key;
  return `${base || '$'}[${JSON.stringify(key)}]`;
}

function arrayPath(base: string, index: number): string {
  return `${base || '$'}[${index}]`;
}

function pushFieldChange(
  changes: ManifestFieldChange[],
  state: {truncated: boolean},
  path: string,
  before: unknown,
  after: unknown
): void {
  if (changes.length >= MAX_FIELD_CHANGES) {
    state.truncated = true;
    return;
  }

  let status: ManifestChangeStatus = 'modified';
  if (before === undefined) status = 'added';
  if (after === undefined) status = 'deleted';

  changes.push({
    path: path || '$',
    status,
    before: displayValue(before),
    after: displayValue(after),
  });
}

function diffValues(
  before: unknown,
  after: unknown,
  path: string,
  changes: ManifestFieldChange[],
  state: {truncated: boolean}
): void {
  if (state.truncated) return;
  if (stableStringify(before) === stableStringify(after)) return;

  if (isObject(before) && isObject(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    for (const key of keys) {
      diffValues(before[key], after[key], pathSegment(path, key), changes, state);
      if (state.truncated) return;
    }
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      diffValues(before[index], after[index], arrayPath(path, index), changes, state);
      if (state.truncated) return;
    }
    return;
  }

  pushFieldChange(changes, state, path, before, after);
}

function parseManifest(raw: string, index: number): ParsedManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Argo CD returned an invalid manifest at position ${index + 1}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!isObject(value)) {
    throw new Error(`Argo CD returned a non-object manifest at position ${index + 1}.`);
  }

  const metadata = isObject(value.metadata) ? value.metadata : {};
  const apiVersion = typeof value.apiVersion === 'string' ? value.apiVersion : 'unknown';
  const kind = typeof value.kind === 'string' ? value.kind : 'Unknown';
  const namespace = typeof metadata.namespace === 'string' ? metadata.namespace : undefined;
  const name = typeof metadata.name === 'string' ? metadata.name : `unnamed-${index + 1}`;
  // Kubernetes object identity uses API group, kind, namespace and name. The
  // version is deliberately excluded so v1beta1 -> v1 is one modified object,
  // not a misleading delete/add pair.
  const key = `${apiGroup(apiVersion)}|${kind}|${namespace || ''}|${name}`;

  return {
    key,
    apiVersion,
    kind,
    namespace,
    name,
    value,
    canonical: stableStringify(value),
  };
}

function manifestMap(response: ManifestResponse): Map<string, ParsedManifest> {
  const result = new Map<string, ParsedManifest>();
  (response.manifests || []).forEach((raw, index) => {
    const parsed = parseManifest(raw, index);
    // Argo CD gives precedence to the later source when duplicate resource identities occur.
    result.set(parsed.key, parsed);
  });
  return result;
}

function manifestUrl(app: ArgoApplication, revisions: string[]): string {
  const appName = app.metadata?.name;
  if (!appName) throw new Error('Application name is unavailable.');

  const sources = Array.isArray(app.spec?.sources)
    ? app.spec?.sources || []
    : app.spec?.source
      ? [app.spec.source]
      : [];

  if (sources.length === 0) throw new Error('Application source is unavailable.');
  if (revisions.length !== sources.length || revisions.some(revision => !revision)) {
    throw new Error('The deployment history does not contain a complete revision set.');
  }

  const params = new URLSearchParams();
  if (app.metadata?.namespace) params.set('appNamespace', app.metadata.namespace);
  if (app.spec?.project) params.set('project', app.spec.project);

  if (sources.length === 1) {
    params.set('revision', revisions[0]);
  } else {
    revisions.forEach((revision, index) => {
      params.append('sourcePositions', String(index + 1));
      params.append('revisions', revision);
    });
  }

  const endpoint = `api/v1/applications/${encodeURIComponent(appName)}/manifests`;
  const url = new URL(endpoint, document.baseURI);
  url.search = params.toString();
  return url.toString();
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {message?: string; error?: string};
    return payload.message || payload.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function remember(url: string, response: ManifestResponse): void {
  manifestCache.set(url, response);
  while (manifestCache.size > MAX_CACHE_ENTRIES) {
    const oldest = manifestCache.keys().next().value as string | undefined;
    if (!oldest) break;
    manifestCache.delete(oldest);
  }
}

function manifestCacheKey(app: ArgoApplication, url: string): string | undefined {
  // resourceVersion changes whenever the Application spec/status changes and
  // avoids putting inline Helm values or plugin parameters into an in-memory
  // cache key. Without it, skip caching rather than risk stale renders.
  const resourceVersion = app.metadata?.resourceVersion;
  return resourceVersion ? `${url}|rv=${resourceVersion}` : undefined;
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, {once: true});
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

async function loadManifestResponse(
  app: ArgoApplication,
  revisions: string[],
  signal?: AbortSignal
): Promise<ManifestResponse> {
  const url = manifestUrl(app, revisions);
  const cacheKey = manifestCacheKey(app, url);
  const cached = cacheKey ? manifestCache.get(cacheKey) : undefined;
  if (cached) return cached;

  const pending = cacheKey ? manifestPromiseCache.get(cacheKey) : undefined;
  if (pending) return withAbort(pending, signal);

  const request = fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {Accept: 'application/json'},
  })
    .then(async response => {
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as ManifestResponse;
      if (cacheKey) remember(cacheKey, payload);
      return payload;
    })
    .finally(() => {
      if (cacheKey) manifestPromiseCache.delete(cacheKey);
    });

  if (cacheKey) manifestPromiseCache.set(cacheKey, request);
  return withAbort(request, signal);
}

function redactedSecretManifest(value: JsonObject): JsonObject {
  if (String(value.kind || '').toLowerCase() !== 'secret') return value;

  const copy: JsonObject = {...value};
  for (const field of ['data', 'stringData']) {
    const entries = value[field];
    if (isObject(entries)) {
      copy[field] = Object.fromEntries(
        Object.keys(entries).map(key => [key, '<redacted>'])
      );
    }
  }
  return copy;
}

function secretFieldPath(kind: string, path: string): boolean {
  return (
    kind.toLowerCase() === 'secret' &&
    /(^|\.)(data|stringData)(\.|\[|$)/.test(path)
  );
}

function resourceChange(
  before: ParsedManifest | undefined,
  after: ParsedManifest | undefined
): ManifestResourceChange | undefined {
  if (!before && !after) return undefined;

  const resource = after || before!;
  if (!before && after) {
    const manifest = truncate(
      stableStringify(redactedSecretManifest(after.value), true),
      MAX_MANIFEST_CHARS
    );
    return {
      key: resource.key,
      apiVersion: resource.apiVersion,
      kind: resource.kind,
      namespace: resource.namespace,
      name: resource.name,
      status: 'added',
      fieldChanges: [],
      fieldChangesTruncated: false,
      afterManifest: manifest.value,
      manifestTruncated: manifest.truncated,
    };
  }

  if (before && !after) {
    const manifest = truncate(
      stableStringify(redactedSecretManifest(before.value), true),
      MAX_MANIFEST_CHARS
    );
    return {
      key: resource.key,
      apiVersion: resource.apiVersion,
      kind: resource.kind,
      namespace: resource.namespace,
      name: resource.name,
      status: 'deleted',
      fieldChanges: [],
      fieldChangesTruncated: false,
      beforeManifest: manifest.value,
      manifestTruncated: manifest.truncated,
    };
  }

  if (before!.canonical === after!.canonical) return undefined;

  const fieldChanges: ManifestFieldChange[] = [];
  const state = {truncated: false};
  diffValues(before!.value, after!.value, '', fieldChanges, state);

  const safeFieldChanges = fieldChanges.map(change =>
    secretFieldPath(resource.kind, change.path)
      ? {...change, before: change.before === undefined ? undefined : '<redacted>', after: change.after === undefined ? undefined : '<redacted>'}
      : change
  );

  return {
    key: resource.key,
    apiVersion: resource.apiVersion,
    kind: resource.kind,
    namespace: resource.namespace,
    name: resource.name,
    status: 'modified',
    fieldChanges: safeFieldChanges,
    fieldChangesTruncated: state.truncated,
  };
}

export function compareManifestResponses(
  base: ManifestResponse,
  target: ManifestResponse,
  baseRevisions: string[],
  targetRevisions: string[],
  comparisonKind: ManifestComparisonKind,
  syncStatus?: string,
  warning?: string
): ManifestChangesResult {
  const before = manifestMap(base);
  const after = manifestMap(target);
  const keys = Array.from(new Set([...before.keys(), ...after.keys()])).sort((left, right) => {
    const leftResource = after.get(left) || before.get(left)!;
    const rightResource = after.get(right) || before.get(right)!;
    return `${leftResource.kind}/${leftResource.namespace || ''}/${leftResource.name}`.localeCompare(
      `${rightResource.kind}/${rightResource.namespace || ''}/${rightResource.name}`
    );
  });

  const resources: ManifestResourceChange[] = [];
  let resourceChangeCount = 0;
  let added = 0;
  let modified = 0;
  let deleted = 0;
  let truncated = false;

  for (const key of keys) {
    const change = resourceChange(before.get(key), after.get(key));
    if (!change) continue;
    resourceChangeCount += 1;
    if (change.status === 'added') added += 1;
    if (change.status === 'modified') modified += 1;
    if (change.status === 'deleted') deleted += 1;
    if (resources.length >= MAX_RESOURCE_CHANGES) {
      truncated = true;
      continue;
    }
    resources.push(change);
  }

  return {
    available: true,
    comparisonKind,
    syncStatus,
    baseRevisions,
    targetRevisions,
    resources,
    resourceChangeCount,
    comparedResources: keys.length,
    added,
    modified,
    deleted,
    truncated,
    warning,
  };
}

export async function compareApplicationRevisions(input: {
  app: ArgoApplication;
  baseRevisions: string[];
  targetRevisions: string[];
  comparisonKind: ManifestComparisonKind;
  syncStatus?: string;
  warning?: string;
  signal?: AbortSignal;
}): Promise<ManifestChangesResult> {
  const [base, target] = await Promise.all([
    loadManifestResponse(input.app, input.baseRevisions, input.signal),
    loadManifestResponse(input.app, input.targetRevisions, input.signal),
  ]);

  return compareManifestResponses(
    base,
    target,
    input.baseRevisions,
    input.targetRevisions,
    input.comparisonKind,
    input.syncStatus,
    input.warning
  );
}

export async function loadApplicationChanges(input: {
  app: ArgoApplication;
  signal?: AbortSignal;
}): Promise<ManifestChangesResult> {
  const plan = revisionComparisonPlan(input.app);

  if (!plan.available) {
    return {
      available: false,
      comparisonKind: plan.kind,
      syncStatus: plan.syncStatus,
      reason: plan.reason,
      baseRevisions: plan.baseRevisions,
      targetRevisions: plan.targetRevisions,
      resources: [],
      resourceChangeCount: 0,
      comparedResources: 0,
      added: 0,
      modified: 0,
      deleted: 0,
      truncated: false,
    };
  }

  const primaryResult = await compareApplicationRevisions({
    app: input.app,
    baseRevisions: plan.baseRevisions,
    targetRevisions: plan.targetRevisions,
    comparisonKind: plan.kind,
    syncStatus: plan.syncStatus,
    warning: plan.warning,
    signal: input.signal,
  });

  return primaryResult;
}
