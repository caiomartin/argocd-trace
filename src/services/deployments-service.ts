import {
  ArgoApplication,
  DeploymentChangeSummary,
  DeploymentSummary,
  TraceSource,
  RecentDeploymentsResult,
  RevisionMetadata,
} from '../models/trace';
import {buildCompareUrl, buildLinks} from '../providers/git-provider';
import {compareApplicationRevisions} from './changes-service';
import {
  activeRevisionSet,
  applicationSourceCount,
  assessSourceConfigurations,
  completeRevisionSet,
  deploymentSnapshotResult,
  RevisionSnapshot,
  sameRevisionSet,
} from './revision-service';

const MAX_DEPLOYMENTS = 3;
const HISTORY_LOOKAHEAD = MAX_DEPLOYMENTS + 1;

function revisionForSource(
  snapshot: RevisionSnapshot,
  source: TraceSource
): string | undefined {
  return snapshot.revisions[source.index];
}

function metadataUrl(input: {
  app: ArgoApplication;
  source: TraceSource;
  snapshot: RevisionSnapshot;
  revision: string;
}): string {
  const {app, source, snapshot, revision} = input;
  const appName = app.metadata?.name;

  if (!appName) {
    throw new Error('Application name is unavailable.');
  }

  const params = new URLSearchParams();
  if (app.metadata?.namespace) {
    params.set('appNamespace', app.metadata.namespace);
  }
  if (app.spec?.project) {
    params.set('project', app.spec.project);
  }

  const multiSource = applicationSourceCount(app) > 1;
  if (multiSource) {
    params.set('sourceIndex', String(source.index));
  }
  if (snapshot.versionId !== undefined) {
    params.set('versionId', String(snapshot.versionId));
  }

  const endpoint =
    `api/v1/applications/${encodeURIComponent(appName)}` +
    `/revisions/${encodeURIComponent(revision)}/metadata`;
  const url = new URL(endpoint, document.baseURI);
  url.search = params.toString();
  return url.toString();
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string;
      error?: string;
    };
    return payload.message || payload.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function loadMetadata(input: {
  app: ArgoApplication;
  source: TraceSource;
  snapshot: RevisionSnapshot;
  revision: string;
  signal?: AbortSignal;
}): Promise<RevisionMetadata> {
  const response = await fetch(metadataUrl(input), {
    method: 'GET',
    credentials: 'same-origin',
    headers: {Accept: 'application/json'},
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as RevisionMetadata;
}

function firstLine(value?: string): string {
  return value?.split('\n')[0].trim() || 'Revision deployed';
}

function revisionWebUrl(
  source: TraceSource,
  revision: string
): string | undefined {
  return buildLinks(
    source.repositoryUrl,
    source.revision,
    source.source.path,
    revision
  ).commit;
}

function emptyChangeSummary(input: {
  status: DeploymentChangeSummary['status'];
  baseRevisions?: string[];
  targetRevisions: string[];
  error?: string;
  warning?: string;
}): DeploymentChangeSummary {
  return {
    status: input.status,
    baseRevisions: input.baseRevisions || [],
    targetRevisions: input.targetRevisions,
    resourceCount: 0,
    fieldCount: 0,
    added: 0,
    modified: 0,
    deleted: 0,
    comparedResources: 0,
    error: input.error,
    warning: input.warning,
  };
}

async function loadChangeSummary(input: {
  app: ArgoApplication;
  snapshot: RevisionSnapshot;
  previous?: RevisionSnapshot;
  signal?: AbortSignal;
}): Promise<DeploymentChangeSummary> {
  const {snapshot, previous} = input;

  if (!previous) {
    return emptyChangeSummary({
      status: snapshot.versionId === 0 ? 'first-deployment' : 'unavailable',
      targetRevisions: snapshot.revisions,
      error:
        snapshot.versionId === 0
          ? undefined
          : 'No older complete history entry is available for this transition.',
    });
  }

  const assessment = assessSourceConfigurations(input.app, [previous, snapshot]);
  if (!assessment.reliable) {
    return emptyChangeSummary({
      status: 'unavailable',
      baseRevisions: previous.revisions,
      targetRevisions: snapshot.revisions,
      error: assessment.reason,
    });
  }

  if (sameRevisionSet(previous.revisions, snapshot.revisions)) {
    return emptyChangeSummary({
      status: 'unchanged',
      baseRevisions: previous.revisions,
      targetRevisions: snapshot.revisions,
      warning: assessment.warning,
    });
  }

  try {
    const result = await compareApplicationRevisions({
      app: input.app,
      baseRevisions: previous.revisions,
      targetRevisions: snapshot.revisions,
      comparisonKind: snapshot.eventType,
      warning: assessment.warning,
      signal: input.signal,
    });

    return {
      status: result.resourceChangeCount > 0 ? 'changed' : 'unchanged',
      baseRevisions: result.baseRevisions,
      targetRevisions: result.targetRevisions,
      resourceCount: result.resourceChangeCount,
      fieldCount: result.resources.reduce((total, resource) => total + (resource.status === 'modified' ? resource.fieldChanges.length : 1), 0),
      added: result.added,
      modified: result.modified,
      deleted: result.deleted,
      comparedResources: result.comparedResources,
      warning:
        result.warning ||
        (result.truncated || result.resources.some(resource => resource.fieldChangesTruncated)
          ? 'Some change details were truncated; aggregate resource counts remain complete.'
          : undefined),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    return emptyChangeSummary({
      status: 'unavailable',
      baseRevisions: previous.revisions,
      targetRevisions: snapshot.revisions,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function loadRecentDeployments(input: {
  app: ArgoApplication;
  source: TraceSource;
  signal?: AbortSignal;
}): Promise<RecentDeploymentsResult> {
  // One extra event is loaded so the oldest visible row can still describe
  // what changed compared with its immediately preceding deployment.
  const historyResult = deploymentSnapshotResult(input.app);
  const snapshots = historyResult.snapshots.slice(0, HISTORY_LOOKAHEAD);
  const visibleSnapshots = snapshots.slice(0, MAX_DEPLOYMENTS);
  const active = activeRevisionSet(input.app);
  const sourceCount = applicationSourceCount(input.app);
  const activeMatchIndex =
    active.basis === 'sync-status' &&
    completeRevisionSet(active.revisions, sourceCount)
      ? historyResult.snapshots.findIndex(snapshot =>
          sameRevisionSet(snapshot.revisions, active.revisions)
        )
      : -1;
  const activeRevisionNotInHistory =
    active.basis === 'sync-status' && activeMatchIndex === -1;

  const deployments = await Promise.all(
    visibleSnapshots.map(async (snapshot, index) => {
      const previous = snapshots[index + 1];
      const revision = revisionForSource(snapshot, input.source) || '';
      const previousRevision = previous
        ? revisionForSource(previous, input.source)
        : undefined;

      const metadataPromise: Promise<{
        metadata?: RevisionMetadata;
        metadataError?: string;
      }> = input.source.isHelmRepository
        ? Promise.resolve({})
        : loadMetadata({
            ...input,
            snapshot,
            revision,
          })
            .then(metadata => ({metadata}))
            .catch(error => {
              if (error instanceof DOMException && error.name === 'AbortError') {
                throw error;
              }
              return {
                metadata: undefined,
                metadataError:
                  error instanceof Error ? error.message : String(error),
              };
            });

      const [metadataResult, changeSummary] = await Promise.all([
        metadataPromise,
        loadChangeSummary({
          app: input.app,
          snapshot,
          previous,
          signal: input.signal,
        }),
      ]);

      const metadata = metadataResult.metadata;
      const compareUrl = buildCompareUrl(
        input.source.repositoryUrl,
        previousRevision,
        revision
      );

      return {
        revision,
        previousRevision,
        shortRevision: revision.slice(0, 7),
        shortPreviousRevision: previousRevision?.slice(0, 7),
        message: input.source.isHelmRepository
          ? `Chart version ${revision}`
          : firstLine(metadata?.message),
        author: input.source.isHelmRepository
          ? 'Not applicable'
          : metadata?.author || 'Unavailable',
        authoredAt: metadata?.date,
        deployedAt: snapshot.deployedAt,
        initiatedBy: snapshot.initiatedBy,
        versionId: snapshot.versionId,
        current: index === activeMatchIndex,
        latestRecorded: index === 0,
        eventType: snapshot.eventType,
        resyncCount: snapshot.resyncCount,
        webUrl: revisionWebUrl(input.source, revision),
        compareUrl,
        changeSummary,
        metadataError: metadataResult.metadataError,
      } satisfies DeploymentSummary;
    })
  );

  return {
    deployments,
    omittedIncompleteEntries: historyResult.omittedIncompleteEntries,
    activeRevisionNotInHistory,
  };
}
