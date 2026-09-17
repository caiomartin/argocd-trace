import {
  ApplicationSource,
  ArgoApplication,
  RevisionHistoryEntry,
} from '../models/trace';

export type DeploymentEventType = 'deployment' | 'revision-restored';

export interface RevisionSnapshot {
  revisions: string[];
  deployedAt?: string;
  initiatedBy?: string;
  versionId?: number;
  eventType: DeploymentEventType;
  resyncCount: number;
  sourceConfiguration?: ApplicationSource[];
}

export interface DeploymentSnapshotResult {
  snapshots: RevisionSnapshot[];
  omittedIncompleteEntries: number;
}

export type ManifestComparisonKind =
  | 'pending'
  | 'deployment'
  | 'revision-restored'
  | 'resync'
  | 'first-deployment';

export interface RevisionComparisonPlan {
  available: boolean;
  kind: ManifestComparisonKind;
  reason?: string;
  warning?: string;
  baseRevisions: string[];
  targetRevisions: string[];
  syncStatus?: string;
}

export interface ActiveRevisionSet {
  revisions: string[];
  basis?: 'sync-status' | 'deployment-history';
}

export interface SourceConfigurationAssessment {
  reliable: boolean;
  reason?: string;
  warning?: string;
}

interface RawRevisionSnapshot {
  revisions: string[];
  deployedAt?: string;
  initiatedBy?: string;
  versionId?: number;
  sourceConfiguration?: ApplicationSource[];
}

export function applicationSources(app: ArgoApplication): ApplicationSource[] {
  if (Array.isArray(app.spec?.sources) && app.spec.sources.length > 0) {
    return app.spec.sources;
  }
  return app.spec?.source ? [app.spec.source] : [];
}

export function applicationSourceCount(app: ArgoApplication): number {
  return applicationSources(app).length;
}

export function historyRevisionSet(
  entry: RevisionHistoryEntry,
  count: number
): string[] {
  if (count > 1) {
    return Array.from({length: count}, (_, index) => entry.revisions?.[index] || '');
  }
  return [entry.revision || entry.revisions?.[0] || ''];
}

export function desiredRevisionSet(app: ArgoApplication, count: number): string[] {
  if (count > 1) {
    return Array.from(
      {length: count},
      (_, index) => app.status?.sync?.revisions?.[index] || ''
    );
  }

  return [app.status?.sync?.revision || app.status?.sync?.revisions?.[0] || ''];
}

export function operationRevisionSet(app: ArgoApplication, count: number): string[] {
  const operation = app.status?.operationState;

  if (count > 1) {
    return Array.from(
      {length: count},
      (_, index) =>
        operation?.syncResult?.revisions?.[index] ||
        operation?.operation?.sync?.revisions?.[index] ||
        ''
    );
  }

  return [
    operation?.syncResult?.revision ||
      operation?.syncResult?.revisions?.[0] ||
      operation?.operation?.sync?.revision ||
      operation?.operation?.sync?.revisions?.[0] ||
      '',
  ];
}

export function successfulOperationRevisionSet(
  app: ArgoApplication,
  count: number
): string[] {
  if (app.status?.operationState?.phase !== 'Succeeded') {
    return Array.from({length: count}, () => '');
  }

  return operationRevisionSet(app, count);
}

export function completeRevisionSet(revisions: string[], count: number): boolean {
  return revisions.length === count && revisions.every(value => Boolean(value?.trim()));
}

export function sameRevisionSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function deploymentTime(entry: RevisionHistoryEntry): number {
  const timestamp = new Date(entry.deployedAt || entry.deployStartedAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function newestFirst(left: RevisionHistoryEntry, right: RevisionHistoryEntry): number {
  const timeDifference = deploymentTime(right) - deploymentTime(left);
  if (timeDifference !== 0) return timeDifference;
  return (right.id ?? -1) - (left.id ?? -1);
}

function initiatedBy(entry: RevisionHistoryEntry): string | undefined {
  return (
    entry.initiatedBy?.username ||
    (entry.initiatedBy?.automated ? 'Automated sync' : undefined)
  );
}

function historySourceConfiguration(
  entry: RevisionHistoryEntry,
  count: number
): ApplicationSource[] | undefined {
  if (
    Array.isArray(entry.sources) &&
    entry.sources.length === count &&
    entry.sources.every(Boolean)
  ) {
    return entry.sources;
  }

  if (count === 1) {
    const source = entry.source || entry.sources?.[0];
    return source ? [source] : undefined;
  }

  return undefined;
}

function normalizedConfigValue(value: unknown, key?: string): unknown {
  if (key === 'targetRevision' || value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const items = value
      .map(item => normalizedConfigValue(item))
      .filter(item => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>)
      .sort()
      .forEach(childKey => {
        const child = normalizedConfigValue(
          (value as Record<string, unknown>)[childKey],
          childKey
        );
        if (child !== undefined) output[childKey] = child;
      });
    return Object.keys(output).length > 0 ? output : undefined;
  }

  if (value === '') return undefined;
  return value;
}

function sourceConfigurationFingerprint(sources: ApplicationSource[]): string {
  return JSON.stringify(
    sources.map(source => normalizedConfigValue(source) || {})
  );
}

function sameRecordedSourceConfiguration(
  left?: ApplicationSource[],
  right?: ApplicationSource[]
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return sourceConfigurationFingerprint(left) === sourceConfigurationFingerprint(right);
}

/**
 * Argo CD's manifests endpoint accepts revision overrides, but not historical
 * source settings. A historical comparison is reproducible only when every
 * recorded source configuration still matches the current Application spec.
 */
export function assessSourceConfigurations(
  app: ArgoApplication,
  snapshots: RevisionSnapshot[]
): SourceConfigurationAssessment {
  const currentSources = applicationSources(app);
  const currentFingerprint = sourceConfigurationFingerprint(currentSources);
  let unavailableCount = 0;

  for (const snapshot of snapshots) {
    if (!snapshot.sourceConfiguration) {
      unavailableCount += 1;
      continue;
    }

    if (
      snapshot.sourceConfiguration.length !== currentSources.length ||
      sourceConfigurationFingerprint(snapshot.sourceConfiguration) !==
        currentFingerprint
    ) {
      return {
        reliable: false,
        reason:
          'The Application source configuration changed between these deployments. ' +
          'Argo CD 3.2 can render historical revisions only with the current source settings, ' +
          'so an exact historical comparison is not available.',
      };
    }
  }

  return {
    reliable: true,
    warning:
      unavailableCount > 0
        ? 'Historical source settings were not recorded for every revision. The comparison uses the current Application source configuration.'
        : undefined,
  };
}

function rawHistoryEntries(app: ArgoApplication): Array<{
  complete: boolean;
  snapshot: RawRevisionSnapshot;
}> {
  const count = applicationSourceCount(app);
  if (!count) return [];

  return [...(app.status?.history || [])]
    .sort(newestFirst)
    .map(entry => {
      const revisions = historyRevisionSet(entry, count);
      return {
        complete: completeRevisionSet(revisions, count),
        snapshot: {
          revisions,
          deployedAt: entry.deployedAt || entry.deployStartedAt,
          initiatedBy: initiatedBy(entry),
          versionId: entry.id,
          sourceConfiguration: historySourceConfiguration(entry, count),
        },
      };
    });
}

function eventTypeAt(
  snapshots: Array<RawRevisionSnapshot & {resyncCount: number}>,
  index: number
): DeploymentEventType {
  const current = snapshots[index];
  const previousDistinct = snapshots[index + 1];

  if (!previousDistinct || sameRevisionSet(previousDistinct.revisions, current.revisions)) {
    return 'deployment';
  }

  const wasDeployedBefore = snapshots
    .slice(index + 2)
    .some(snapshot => sameRevisionSet(snapshot.revisions, current.revisions));

  return wasDeployedBefore ? 'revision-restored' : 'deployment';
}

export function deploymentSnapshotResult(
  app: ArgoApplication,
  limit = Number.POSITIVE_INFINITY
): DeploymentSnapshotResult {
  const entries = rawHistoryEntries(app);
  const groups: Array<RawRevisionSnapshot & {resyncCount: number}> = [];
  let omittedIncompleteEntries = 0;
  let hasIncompleteBoundary = false;

  for (const entry of entries) {
    if (!entry.complete) {
      omittedIncompleteEntries += 1;
      hasIncompleteBoundary = true;
      continue;
    }

    const current = groups[groups.length - 1];
    if (
      !hasIncompleteBoundary &&
      current &&
      sameRevisionSet(current.revisions, entry.snapshot.revisions) &&
      sameRecordedSourceConfiguration(
        current.sourceConfiguration,
        entry.snapshot.sourceConfiguration
      )
    ) {
      current.resyncCount += 1;
      continue;
    }

    groups.push({...entry.snapshot, resyncCount: 0});
    hasIncompleteBoundary = false;
  }

  const snapshots = groups.slice(0, limit).map((snapshot, index) => ({
    ...snapshot,
    eventType: eventTypeAt(groups, index),
  }));

  return {snapshots, omittedIncompleteEntries};
}

/** Returns complete full-deployment revisions in newest-first order. */
export function deploymentSnapshots(
  app: ArgoApplication,
  limit = 3
): RevisionSnapshot[] {
  return deploymentSnapshotResult(app, limit).snapshots;
}

export function activeRevisionSet(app: ArgoApplication): ActiveRevisionSet {
  const count = applicationSourceCount(app);
  if (!count) return {revisions: []};

  const synced = desiredRevisionSet(app, count);
  if (
    app.status?.sync?.status === 'Synced' &&
    completeRevisionSet(synced, count)
  ) {
    return {revisions: synced, basis: 'sync-status'};
  }

  const latestDeployment = deploymentSnapshots(app, 1)[0];
  if (latestDeployment) {
    return {
      revisions: latestDeployment.revisions,
      basis: 'deployment-history',
    };
  }

  return {revisions: Array.from({length: count}, () => '')};
}

function unavailableFromAssessment(input: {
  assessment: SourceConfigurationAssessment;
  kind: ManifestComparisonKind;
  baseRevisions: string[];
  targetRevisions: string[];
  syncStatus?: string;
}): RevisionComparisonPlan | undefined {
  if (input.assessment.reliable) return undefined;
  return {
    available: false,
    kind: input.kind,
    reason: input.assessment.reason,
    baseRevisions: input.baseRevisions,
    targetRevisions: input.targetRevisions,
    syncStatus: input.syncStatus,
  };
}

export function revisionComparisonPlan(app: ArgoApplication): RevisionComparisonPlan {
  const count = applicationSourceCount(app);
  const syncStatus = app.status?.sync?.status;

  if (!count) {
    return {
      available: false,
      kind: 'deployment',
      reason: 'Application source is unavailable.',
      baseRevisions: [],
      targetRevisions: [],
      syncStatus,
    };
  }

  const deployments = deploymentSnapshots(app, 2);
  const latestDeployment = deployments[0];

  if (!latestDeployment) {
    return {
      available: false,
      kind: 'deployment',
      reason:
        'A complete full-deployment revision set is not available in status.history.',
      baseRevisions: [],
      targetRevisions: [],
      syncStatus,
    };
  }

  const desired = desiredRevisionSet(app, count);
  if (syncStatus === 'OutOfSync' && !completeRevisionSet(desired, count)) {
    return {
      available: false,
      kind: 'pending',
      reason:
        'Argo CD reports the Application OutOfSync but did not provide a complete desired revision set for every source.',
      baseRevisions: latestDeployment.revisions,
      targetRevisions: desired,
      syncStatus,
    };
  }

  const hasPendingRevision =
    syncStatus === 'OutOfSync' &&
    completeRevisionSet(desired, count) &&
    !sameRevisionSet(latestDeployment.revisions, desired);

  if (hasPendingRevision) {
    const assessment = assessSourceConfigurations(app, [latestDeployment]);
    const unavailable = unavailableFromAssessment({
      assessment,
      kind: 'pending',
      baseRevisions: latestDeployment.revisions,
      targetRevisions: desired,
      syncStatus,
    });
    if (unavailable) return unavailable;

    return {
      available: true,
      kind: 'pending',
      warning: assessment.warning,
      baseRevisions: latestDeployment.revisions,
      targetRevisions: desired,
      syncStatus,
    };
  }

  if (latestDeployment.resyncCount > 0) {
    const assessment = assessSourceConfigurations(app, [latestDeployment]);
    const unavailable = unavailableFromAssessment({
      assessment,
      kind: 'resync',
      baseRevisions: latestDeployment.revisions,
      targetRevisions: latestDeployment.revisions,
      syncStatus,
    });
    if (unavailable) return unavailable;

    return {
      available: true,
      kind: 'resync',
      warning: assessment.warning,
      baseRevisions: latestDeployment.revisions,
      targetRevisions: latestDeployment.revisions,
      syncStatus,
    };
  }

  const previousDeployment = deployments[1];
  if (!previousDeployment) {
    const firstRecordedDeployment = latestDeployment.versionId === 0;
    return {
      available: false,
      kind: firstRecordedDeployment ? 'first-deployment' : 'deployment',
      reason: firstRecordedDeployment
        ? 'This is the first complete deployment recorded for this Application.'
        : 'An older complete deployment is not available in status.history, so the transition baseline cannot be reconstructed.',
      baseRevisions: [],
      targetRevisions: latestDeployment.revisions,
      syncStatus,
    };
  }

  const assessment = assessSourceConfigurations(app, [
    previousDeployment,
    latestDeployment,
  ]);
  const unavailable = unavailableFromAssessment({
    assessment,
    kind: latestDeployment.eventType,
    baseRevisions: previousDeployment.revisions,
    targetRevisions: latestDeployment.revisions,
    syncStatus,
  });
  if (unavailable) return unavailable;

  return {
    available: true,
    kind: latestDeployment.eventType,
    warning: assessment.warning,
    baseRevisions: previousDeployment.revisions,
    targetRevisions: latestDeployment.revisions,
    syncStatus,
  };
}
