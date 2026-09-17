export interface OwnerReference {
  apiVersion?: string;
  kind?: string;
  name?: string;
  uid?: string;
  controller?: boolean;
}

export interface ApplicationSource {
  [key: string]: unknown;
  repoURL?: string;
  targetRevision?: string;
  path?: string;
  chart?: string;
  ref?: string;
  directory?: Record<string, unknown>;
  kustomize?: Record<string, unknown>;
  plugin?: Record<string, unknown>;
  helm?: {
    [key: string]: unknown;
    releaseName?: string;
    valueFiles?: string[];
  };
}

export interface ResourceRef {
  group?: string;
  kind?: string;
  namespace?: string;
  name?: string;
}

export interface SyncResultResource extends ResourceRef {
  version?: string;
  status?: string;
  message?: string;
  hookPhase?: string;
  syncPhase?: string;
}

export interface ApplicationStatusResource extends ResourceRef {
  version?: string;
  status?: string;
  requiresPruning?: boolean;
  hook?: boolean;
  health?: {
    status?: string;
    message?: string;
  };
}

export interface RevisionHistoryEntry {
  id?: number;
  revision?: string;
  revisions?: string[];
  deployedAt?: string;
  deployStartedAt?: string;
  initiatedBy?: {
    username?: string;
    automated?: boolean;
  };
  source?: ApplicationSource;
  sources?: ApplicationSource[];
}

export interface ArgoApplication {
  metadata?: {
    name?: string;
    namespace?: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
    ownerReferences?: OwnerReference[];
    resourceVersion?: string;
  };
  spec?: {
    project?: string;
    source?: ApplicationSource;
    sources?: ApplicationSource[];
    destination?: {
      namespace?: string;
      name?: string;
      server?: string;
    };
    syncPolicy?: {
      automated?: Record<string, unknown>;
    };
  };
  status?: {
    sourceType?: string;
    sourceTypes?: string[];
    sync?: {
      status?: 'Synced' | 'OutOfSync' | 'Unknown' | string;
      revision?: string;
      revisions?: string[];
    };
    history?: RevisionHistoryEntry[];
    operationState?: {
      phase?: string;
      startedAt?: string;
      finishedAt?: string;
      message?: string;
      syncResult?: {
        revision?: string;
        revisions?: string[];
        resources?: SyncResultResource[];
      };
      operation?: {
        initiatedBy?: {
          username?: string;
          automated?: boolean;
        };
        sync?: {
          revision?: string;
          revisions?: string[];
          prune?: boolean;
          resources?: ResourceRef[];
          syncOptions?: string[];
        };
      };
    };
    resources?: ApplicationStatusResource[];
    reconciledAt?: string;
  };
}

export type GitProviderName = 'GitLab' | 'GitHub' | 'Git';

export interface SourceLinks {
  repository?: string;
  revision?: string;
  path?: string;
  commit?: string;
  history?: string;
}

export interface TraceSource {
  index: number;
  source: ApplicationSource;
  provider: GitProviderName;
  sourceType: string;
  repositoryUrl?: string;
  repositoryName: string;
  revision: string;
  deployedRevision?: string;
  deployedRevisionBasis?: 'sync-status' | 'deployment-history';
  isHelmRepository: boolean;
  links: SourceLinks;
}

export interface RevisionMetadata {
  author?: string;
  date?: string;
  message?: string;
  tags?: string[];
}

export type DeploymentEventType = 'deployment' | 'revision-restored';

export type DeploymentChangeStatus =
  | 'changed'
  | 'unchanged'
  | 'first-deployment'
  | 'unavailable';

export interface DeploymentChangeSummary {
  status: DeploymentChangeStatus;
  baseRevisions: string[];
  targetRevisions: string[];
  resourceCount: number;
  fieldCount: number;
  added: number;
  modified: number;
  deleted: number;
  comparedResources: number;
  error?: string;
  warning?: string;
}

export interface DeploymentSummary {
  revision: string;
  previousRevision?: string;
  shortRevision: string;
  shortPreviousRevision?: string;
  message: string;
  author: string;
  authoredAt?: string;
  deployedAt?: string;
  initiatedBy?: string;
  versionId?: number;
  current: boolean;
  latestRecorded: boolean;
  eventType: DeploymentEventType;
  resyncCount: number;
  webUrl?: string;
  compareUrl?: string;
  changeSummary: DeploymentChangeSummary;
  metadataError?: string;
}

export interface RecentDeploymentsResult {
  deployments: DeploymentSummary[];
  omittedIncompleteEntries: number;
  activeRevisionNotInHistory: boolean;
}

export interface ManifestResponse {
  manifests?: string[];
  revision?: string;
  sourceType?: string;
}

export type ManifestChangeStatus = 'added' | 'modified' | 'deleted';

export interface ManifestFieldChange {
  path: string;
  status: ManifestChangeStatus;
  before?: string;
  after?: string;
}

export interface ManifestResourceChange {
  key: string;
  apiVersion: string;
  kind: string;
  namespace?: string;
  name: string;
  status: ManifestChangeStatus;
  fieldChanges: ManifestFieldChange[];
  fieldChangesTruncated: boolean;
  beforeManifest?: string;
  afterManifest?: string;
  manifestTruncated?: boolean;
}

export interface ManifestChangesResult {
  available: boolean;
  comparisonKind: 'pending' | 'deployment' | 'revision-restored' | 'resync' | 'first-deployment';
  syncStatus?: string;
  reason?: string;
  baseRevisions: string[];
  targetRevisions: string[];
  resources: ManifestResourceChange[];
  resourceChangeCount: number;
  comparedResources: number;
  added: number;
  modified: number;
  deleted: number;
  truncated: boolean;
  warning?: string;
}

export type ApplicationHierarchyNodeKind = 'Application' | 'ApplicationSet';

export interface ApplicationHierarchyNode {
  kind: ApplicationHierarchyNodeKind;
  name: string;
  namespace?: string;
  current?: boolean;
  href?: string;
}

export interface ApplicationHierarchyResult {
  nodes: ApplicationHierarchyNode[];
  partial?: boolean;
  reason?: string;
}

export type LatestOperationKind =
  | 'full-sync'
  | 'selective-sync'
  | 'resync'
  | 'revision-restored'
  | 'unknown';

export interface LatestOperationResource {
  group?: string;
  kind: string;
  namespace?: string;
  name: string;
  state:
    | 'applied'
    | 'failed'
    | 'running'
    | 'skipped'
    | 'not-selected'
    | 'out-of-sync'
    | 'unknown';
  status?: string;
  message?: string;
}

export interface LatestOperationSummary {
  available: boolean;
  kind: LatestOperationKind;
  phase?: string;
  startedAt?: string;
  finishedAt?: string;
  initiatedBy?: string;
  revisions: string[];
  selective: boolean;
  selectedCount: number;
  resultCount: number;
  appSyncStatus?: string;
  resources: LatestOperationResource[];
  message?: string;
}

export interface CurrentDifference {
  group?: string;
  kind: string;
  namespace?: string;
  name: string;
  state: 'missing' | 'out-of-sync' | 'requires-prune';
  healthStatus?: string;
}

export interface CurrentDifferencesSummary {
  syncStatus?: string;
  differences: CurrentDifference[];
}

export interface ManagedResourceDiff {
  group?: string;
  kind?: string;
  namespace?: string;
  name?: string;
  targetState?: string;
  liveState?: string;
  normalizedLiveState?: string;
  predictedLiveState?: string;
  modified?: boolean;
  hook?: boolean;
}

export interface ManagedResourcesResponse {
  items?: ManagedResourceDiff[];
}

export type LiveDifferenceType =
  | 'modified'
  | 'missing'
  | 'requires-prune'
  | 'unavailable';

export interface LiveFieldDifference {
  resourceKey: string;
  group?: string;
  kind: string;
  namespace?: string;
  name: string;
  path: string;
  desired?: string;
  live?: string;
  type: LiveDifferenceType;
  status: 'OutOfSync' | 'Unknown';
  reason?: string;
}

export interface LiveDifferencesResult {
  resourceCount: number;
  differenceCount: number;
  differences: LiveFieldDifference[];
  truncated: boolean;
}
