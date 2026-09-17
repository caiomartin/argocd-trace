import {describe, expect, it} from 'vitest';
import {ArgoApplication, ApplicationSource} from '../models/trace';
import {
  activeRevisionSet,
  deploymentSnapshotResult,
  revisionComparisonPlan,
} from './revision-service';

const source = (path = 'apps/api', targetRevision = 'main'): ApplicationSource => ({
  repoURL: 'https://github.com/example/platform.git',
  path,
  targetRevision,
});

describe('deployment history accuracy', () => {
  it('omits incomplete multi-source history instead of borrowing source 1', () => {
    const app: ArgoApplication = {
      spec: {sources: [source('apps/a'), source('apps/b')]},
      status: {
        history: [
          {id: 2, revisions: ['a2'], deployedAt: '2026-02-02T00:00:00Z'},
          {
            id: 1,
            revisions: ['a1', 'b1'],
            deployedAt: '2026-02-01T00:00:00Z',
          },
        ],
      },
    };

    const result = deploymentSnapshotResult(app);
    expect(result.omittedIncompleteEntries).toBe(1);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].revisions).toEqual(['a1', 'b1']);
  });

  it('collapses identical consecutive syncs into a re-sync count', () => {
    const currentSource = source();
    const app: ArgoApplication = {
      spec: {source: currentSource},
      status: {
        sync: {status: 'Synced', revision: 'aaa'},
        history: [
          {id: 2, revision: 'aaa', source: currentSource, deployedAt: '2026-02-02T00:00:00Z'},
          {id: 1, revision: 'aaa', source: currentSource, deployedAt: '2026-02-01T00:00:00Z'},
        ],
      },
    };

    expect(deploymentSnapshotResult(app).snapshots[0].resyncCount).toBe(1);
    expect(revisionComparisonPlan(app)).toMatchObject({
      available: true,
      kind: 'resync',
      baseRevisions: ['aaa'],
      targetRevisions: ['aaa'],
    });
  });

  it('calls a repeated older revision restored without claiming rollback', () => {
    const currentSource = source();
    const app: ArgoApplication = {
      spec: {source: currentSource},
      status: {
        sync: {status: 'Synced', revision: 'aaa'},
        history: [
          {id: 3, revision: 'aaa', source: currentSource, deployedAt: '2026-02-03T00:00:00Z'},
          {id: 2, revision: 'bbb', source: currentSource, deployedAt: '2026-02-02T00:00:00Z'},
          {id: 1, revision: 'aaa', source: currentSource, deployedAt: '2026-02-01T00:00:00Z'},
        ],
      },
    };

    expect(deploymentSnapshotResult(app).snapshots[0].eventType).toBe(
      'revision-restored'
    );
  });

  it('blocks an exact historical comparison when source settings changed', () => {
    const historicalSource = source('apps/old');
    const app: ArgoApplication = {
      spec: {source: source('apps/new')},
      status: {
        sync: {status: 'Synced', revision: 'bbb'},
        history: [
          {id: 2, revision: 'bbb', source: historicalSource, deployedAt: '2026-02-02T00:00:00Z'},
          {id: 1, revision: 'aaa', source: historicalSource, deployedAt: '2026-02-01T00:00:00Z'},
        ],
      },
    };

    const plan = revisionComparisonPlan(app);
    expect(plan.available).toBe(false);
    expect(plan.reason).toContain('source configuration changed');
  });

  it('ignores targetRevision changes when assessing render settings', () => {
    const historicalSource = source('apps/api', 'release');
    const app: ArgoApplication = {
      spec: {source: source('apps/api', 'main')},
      status: {
        sync: {status: 'Synced', revision: 'bbb'},
        history: [
          {id: 2, revision: 'bbb', source: historicalSource, deployedAt: '2026-02-02T00:00:00Z'},
          {id: 1, revision: 'aaa', source: historicalSource, deployedAt: '2026-02-01T00:00:00Z'},
        ],
      },
    };

    expect(revisionComparisonPlan(app).available).toBe(true);
  });

  it('uses sync status only when Argo CD reports the app Synced', () => {
    const base: ArgoApplication = {
      spec: {source: source()},
      status: {
        sync: {status: 'Synced', revision: 'desired'},
        history: [{id: 1, revision: 'deployed'}],
      },
    };

    expect(activeRevisionSet(base)).toEqual({
      revisions: ['desired'],
      basis: 'sync-status',
    });

    const outOfSync: ArgoApplication = {
      ...base,
      status: {...base.status, sync: {status: 'OutOfSync', revision: 'desired'}},
    };
    expect(activeRevisionSet(outOfSync)).toEqual({
      revisions: ['deployed'],
      basis: 'deployment-history',
    });
  });

  it('does not collapse equal revisions when recorded source settings differ', () => {
    const app: ArgoApplication = {
      spec: {source: source('apps/new')},
      status: {
        history: [
          {id: 2, revision: 'aaa', source: source('apps/new'), deployedAt: '2026-02-02T00:00:00Z'},
          {id: 1, revision: 'aaa', source: source('apps/old'), deployedAt: '2026-02-01T00:00:00Z'},
        ],
      },
    };

    expect(deploymentSnapshotResult(app).snapshots).toHaveLength(2);
  });

  it('does not fall back to a past deployment when desired multi-source revisions are incomplete', () => {
    const app: ArgoApplication = {
      spec: {sources: [source('apps/a'), source('apps/b')]},
      status: {
        sync: {status: 'OutOfSync', revisions: ['a2']},
        history: [
          {
            id: 1,
            revisions: ['a1', 'b1'],
            sources: [source('apps/a'), source('apps/b')],
          },
        ],
      },
    };

    expect(revisionComparisonPlan(app)).toMatchObject({
      available: false,
      kind: 'pending',
    });
  });

  it('does not call the oldest retained row the first deployment unless its ID is zero', () => {
    const currentSource = source();
    const prunedHistory: ArgoApplication = {
      spec: {source: currentSource},
      status: {
        sync: {status: 'Synced', revision: 'bbb'},
        history: [{id: 7, revision: 'bbb', source: currentSource}],
      },
    };
    expect(revisionComparisonPlan(prunedHistory)).toMatchObject({
      available: false,
      kind: 'deployment',
    });

    const actualFirst: ArgoApplication = {
      ...prunedHistory,
      status: {
        ...prunedHistory.status,
        history: [{id: 0, revision: 'bbb', source: currentSource}],
      },
    };
    expect(revisionComparisonPlan(actualFirst).kind).toBe('first-deployment');
  });
});
