import {
  ArgoApplication,
  CurrentDifferencesSummary,
  LatestOperationKind,
  LatestOperationResource,
  LatestOperationSummary,
  ResourceRef,
  SyncResultResource,
} from '../models/trace';
import {
  applicationSourceCount,
  deploymentSnapshots,
  operationRevisionSet,
  sameRevisionSet,
} from './revision-service';

function resourceKey(resource: ResourceRef): string {
  return [
    resource.group || '',
    resource.kind || '',
    resource.namespace || '',
    resource.name || '',
  ].join('|');
}

function initiatedBy(app: ArgoApplication): string | undefined {
  const initiated = app.status?.operationState?.operation?.initiatedBy;
  return initiated?.username || (initiated?.automated ? 'Automated sync' : undefined);
}

export function operationResourceState(
  resource: SyncResultResource,
  operationPhase?: string
): LatestOperationResource['state'] {
  const status = (resource.status || '').toLowerCase();
  const hookPhase = (resource.hookPhase || '').toLowerCase();
  const phase = (operationPhase || '').toLowerCase();

  if (['failed', 'error'].includes(hookPhase) || status === 'syncfailed') {
    return 'failed';
  }
  if (
    ['running', 'progressing', 'pending', 'waiting', 'terminating'].includes(
      hookPhase
    )
  ) {
    return 'running';
  }
  if (status === 'pruneskipped') return 'skipped';
  if (
    ['synced', 'pruned'].includes(status) &&
    (!hookPhase || hookPhase === 'succeeded')
  ) {
    return 'applied';
  }
  if (
    !status &&
    ['running', 'progressing', 'pending', 'waiting', 'terminating'].includes(
      phase
    )
  ) {
    return 'running';
  }
  return 'unknown';
}

function operationKind(
  app: ArgoApplication,
  revisions: string[],
  selective: boolean
): LatestOperationKind {
  if (selective) return 'selective-sync';

  // Failed or running operations did not establish a new deployment. Avoid
  // labelling an attempted old revision as a successful restore or re-sync.
  if (app.status?.operationState?.phase !== 'Succeeded') return 'full-sync';

  const deployments = deploymentSnapshots(app, 3);
  const latest = deployments[0];
  if (!latest) return 'full-sync';

  if (
    latest.eventType === 'revision-restored' &&
    sameRevisionSet(latest.revisions, revisions)
  ) {
    return 'revision-restored';
  }

  if (latest.resyncCount > 0 && sameRevisionSet(latest.revisions, revisions)) {
    return 'resync';
  }

  return 'full-sync';
}

function buildOperationResources(app: ArgoApplication): LatestOperationResource[] {
  const operation = app.status?.operationState;
  const selected = operation?.operation?.sync?.resources || [];
  const results = operation?.syncResult?.resources || [];
  const selective = selected.length > 0;

  const resultByKey = new Map(results.map(resource => [resourceKey(resource), resource]));
  const rows: LatestOperationResource[] = [];

  for (const result of results) {
    rows.push({
      group: result.group,
      kind: result.kind || 'Resource',
      namespace: result.namespace,
      name: result.name || 'Unknown',
      state: operationResourceState(result, operation?.phase),
      status: result.status,
      message: result.message,
    });
  }

  if (selective) {
    for (const resource of selected) {
      const key = resourceKey(resource);
      if (resultByKey.has(key)) continue;
      rows.push({
        group: resource.group,
        kind: resource.kind || 'Resource',
        namespace: resource.namespace,
        name: resource.name || 'Unknown',
        state: 'unknown',
        message: 'Selected for this Sync, but no individual result was reported.',
      });
    }

    const selectedKeys = new Set(selected.map(resourceKey));
    for (const resource of app.status?.resources || []) {
      if (
        selectedKeys.has(resourceKey(resource)) ||
        resultByKey.has(resourceKey(resource))
      ) {
        continue;
      }
      rows.push({
        group: resource.group,
        kind: resource.kind || 'Resource',
        namespace: resource.namespace,
        name: resource.name || 'Unknown',
        state: resource.status === 'OutOfSync' ? 'out-of-sync' : 'not-selected',
        status: resource.status,
        message:
          resource.status === 'OutOfSync'
            ? 'Not selected in the latest Sync and still differs from desired state.'
            : 'Not selected in the latest Sync.',
      });
    }
  }

  return rows;
}

export function latestOperationSummary(app: ArgoApplication): LatestOperationSummary {
  const operation = app.status?.operationState;
  if (!operation) {
    return {
      available: false,
      kind: 'unknown',
      revisions: [],
      selective: false,
      selectedCount: 0,
      resultCount: 0,
      appSyncStatus: app.status?.sync?.status,
      resources: [],
    };
  }

  const count = applicationSourceCount(app);
  const revisions = count ? operationRevisionSet(app, count) : [];
  const selected = operation.operation?.sync?.resources || [];
  const results = operation.syncResult?.resources || [];
  const selective = selected.length > 0;

  return {
    available: true,
    kind: operationKind(app, revisions, selective),
    phase: operation.phase,
    startedAt: operation.startedAt,
    finishedAt: operation.finishedAt,
    initiatedBy: initiatedBy(app),
    revisions,
    selective,
    selectedCount: selected.length,
    resultCount: results.length,
    appSyncStatus: app.status?.sync?.status,
    resources: buildOperationResources(app),
    message: operation.message,
  };
}

export function currentDifferencesSummary(app: ArgoApplication): CurrentDifferencesSummary {
  const differences = (app.status?.resources || [])
    .filter(resource => {
      return (
        !resource.hook &&
        (resource.status === 'OutOfSync' ||
          resource.requiresPruning === true ||
          resource.health?.status === 'Missing')
      );
    })
    .map(resource => ({
      group: resource.group,
      kind: resource.kind || 'Resource',
      namespace: resource.namespace,
      name: resource.name || 'Unknown',
      state:
        resource.health?.status === 'Missing'
          ? ('missing' as const)
          : resource.requiresPruning
            ? ('requires-prune' as const)
            : ('out-of-sync' as const),
      healthStatus: resource.health?.status,
    }));

  return {
    syncStatus: app.status?.sync?.status,
    differences,
  };
}
