import {
  ArgoApplication,
  LiveDifferencesResult,
  LiveFieldDifference,
  ManagedResourceDiff,
  ManagedResourcesResponse,
} from '../models/trace';

const MAX_LIVE_DIFFERENCES = 120;
const MAX_VALUE_CHARS = 220;

type JsonObject = {[key: string]: unknown};

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

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function truncate(value: string): string {
  if (value.length <= MAX_VALUE_CHARS) return value;
  return `${value.slice(0, MAX_VALUE_CHARS - 1)}…`;
}

function displayValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return truncate(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return truncate(stableStringify(value));
}

function pathSegment(base: string, key: string): string {
  const simple = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
  if (simple) return base ? `${base}.${key}` : key;
  return `${base || '$'}[${JSON.stringify(key)}]`;
}

function arrayPath(base: string, index: number): string {
  return `${base || '$'}[${index}]`;
}

type ParsedState =
  | {kind: 'absent'}
  | {kind: 'valid'; value: unknown}
  | {kind: 'invalid'};

function parseState(raw?: string): ParsedState {
  if (raw === undefined || raw === '') return {kind: 'absent'};
  try {
    const value = JSON.parse(raw) as unknown;
    return value === null ? {kind: 'absent'} : {kind: 'valid', value};
  } catch {
    return {kind: 'invalid'};
  }
}

function secretField(resource: ManagedResourceDiff, path: string): boolean {
  if ((resource.kind || '').toLowerCase() !== 'secret') return false;
  return /(^|\.)(data|stringData)(\.|\[|$)/.test(path);
}

function safeDisplayValue(
  resource: ManagedResourceDiff,
  path: string,
  value: unknown
): string | undefined {
  if (value === undefined) return undefined;
  return secretField(resource, path) ? '<redacted>' : displayValue(value);
}

function resourceKey(resource: ManagedResourceDiff): string {
  return [
    resource.group || '',
    resource.kind || '',
    resource.namespace || '',
    resource.name || '',
  ].join('|');
}

function readError(response: Response): Promise<string> {
  return response
    .json()
    .then((payload: {message?: string; error?: string}) =>
      payload.message || payload.error || `HTTP ${response.status}`
    )
    .catch(() => `HTTP ${response.status}`);
}

function managedResourcesUrl(app: ArgoApplication): string {
  const name = app.metadata?.name;
  if (!name) throw new Error('Application name is unavailable.');

  const params = new URLSearchParams();
  if (app.metadata?.namespace) params.set('appNamespace', app.metadata.namespace);
  if (app.spec?.project) params.set('project', app.spec.project);

  const url = new URL(
    `api/v1/applications/${encodeURIComponent(name)}/managed-resources`,
    document.baseURI
  );
  url.search = params.toString();
  return url.toString();
}

function pushDifference(
  output: LiveFieldDifference[],
  state: {truncated: boolean},
  resource: ManagedResourceDiff,
  path: string,
  desired: unknown,
  live: unknown,
  type: LiveFieldDifference['type'] = 'modified',
  reason?: string
): void {
  if (output.length >= MAX_LIVE_DIFFERENCES) {
    state.truncated = true;
    return;
  }

  output.push({
    resourceKey: resourceKey(resource),
    group: resource.group,
    kind: resource.kind || 'Resource',
    namespace: resource.namespace,
    name: resource.name || 'Unknown',
    path: path || '$',
    desired: safeDisplayValue(resource, path, desired),
    live: safeDisplayValue(resource, path, live),
    type,
    status: type === 'unavailable' ? 'Unknown' : 'OutOfSync',
    reason,
  });
}

function diffValues(
  desired: unknown,
  live: unknown,
  path: string,
  resource: ManagedResourceDiff,
  output: LiveFieldDifference[],
  state: {truncated: boolean}
): void {
  if (state.truncated) return;
  if (stableStringify(desired) === stableStringify(live)) return;

  if (isObject(desired) && isObject(live)) {
    const keys = Array.from(
      new Set([...Object.keys(desired), ...Object.keys(live)])
    ).sort();

    for (const key of keys) {
      diffValues(
        desired[key],
        live[key],
        pathSegment(path, key),
        resource,
        output,
        state
      );
      if (state.truncated) return;
    }
    return;
  }

  if (Array.isArray(desired) && Array.isArray(live)) {
    const length = Math.max(desired.length, live.length);
    for (let index = 0; index < length; index += 1) {
      diffValues(
        desired[index],
        live[index],
        arrayPath(path, index),
        resource,
        output,
        state
      );
      if (state.truncated) return;
    }
    return;
  }

  pushDifference(output, state, resource, path, desired, live);
}

function resourceDifferences(
  resource: ManagedResourceDiff,
  output: LiveFieldDifference[],
  state: {truncated: boolean}
): void {
  if (resource.hook || resource.modified === false) return;

  const target = parseState(resource.targetState);
  const live = parseState(resource.liveState);

  if (target.kind === 'invalid' || live.kind === 'invalid') {
    pushDifference(
      output,
      state,
      resource,
      '$resource',
      target.kind === 'invalid' ? 'Invalid response payload' : 'Desired state',
      live.kind === 'invalid' ? 'Invalid response payload' : 'Live state',
      'unavailable',
      'Argo CD returned a managed-resource state that could not be parsed.'
    );
    return;
  }

  // Argo CD may serialize a missing side as the JSON literal `null` rather
  // than omitting the field. Treat both null and undefined as absent so a
  // deleted resource is rendered as a resource-level state instead of a
  // giant `$ -> null` field diff.
  if (target.kind === 'valid' && live.kind === 'absent') {
    pushDifference(
      output,
      state,
      resource,
      '—',
      'Exists in desired state',
      'Missing from cluster',
      'missing'
    );
    return;
  }

  if (target.kind === 'absent' && live.kind === 'valid') {
    pushDifference(
      output,
      state,
      resource,
      '—',
      'Removed from desired state',
      'Exists in cluster',
      'requires-prune'
    );
    return;
  }

  // Argo CD recommends NormalizedLiveState + PredictedLiveState for rendering
  // managed-resource differences. Falling back to target/live keeps this
  // compatible with older responses.
  const predicted = parseState(resource.predictedLiveState);
  const normalized = parseState(resource.normalizedLiveState);

  if (predicted.kind === 'invalid' || normalized.kind === 'invalid') {
    pushDifference(
      output,
      state,
      resource,
      '$resource',
      'Desired state',
      'Live state',
      'unavailable',
      'Argo CD returned normalized diff data that could not be parsed.'
    );
    return;
  }

  const desiredForDiff =
    predicted.kind === 'valid'
      ? predicted.value
      : target.kind === 'valid'
        ? target.value
        : undefined;
  const liveForDiff =
    normalized.kind === 'valid'
      ? normalized.value
      : live.kind === 'valid'
        ? live.value
        : undefined;

  if (desiredForDiff === undefined || liveForDiff === undefined) {
    pushDifference(
      output,
      state,
      resource,
      '$resource',
      'Desired state unavailable',
      'Live state unavailable',
      'unavailable',
      'Argo CD marked the resource as modified but did not provide both states.'
    );
    return;
  }

  const before = output.length;
  diffValues(desiredForDiff, liveForDiff, '', resource, output, state);

  // If Argo CD marked the resource as modified but its normalized payloads
  // are unavailable/equal, keep the resource visible rather than hiding drift.
  if (output.length === before && resource.modified) {
    pushDifference(
      output,
      state,
      resource,
      '$resource',
      'Desired state',
      'Live state differs'
    );
  }
}

export function summarizeManagedResources(
  items: ManagedResourceDiff[]
): LiveDifferencesResult {
  const differences: LiveFieldDifference[] = [];
  const state = {truncated: false};

  for (const resource of items) {
    resourceDifferences(resource, differences, state);
    if (state.truncated) break;
  }

  const resources = new Set(differences.map(item => item.resourceKey));

  return {
    resourceCount: resources.size,
    differenceCount: differences.length,
    differences,
    truncated: state.truncated,
  };
}

export async function loadCurrentDifferences(input: {
  app: ArgoApplication;
  signal?: AbortSignal;
}): Promise<LiveDifferencesResult> {
  const response = await fetch(managedResourcesUrl(input.app), {
    method: 'GET',
    credentials: 'same-origin',
    headers: {Accept: 'application/json'},
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error(`Unable to load managed resource differences: ${await readError(response)}`);
  }

  const payload = (await response.json()) as ManagedResourcesResponse;
  return summarizeManagedResources(payload.items || []);
}
