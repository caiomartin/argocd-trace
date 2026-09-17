import {describe, expect, it} from 'vitest';
import {ArgoApplication} from '../models/trace';
import {
  latestOperationSummary,
  operationResourceState,
} from './operation-service';

describe('operation result classification', () => {
  it('treats PruneSkipped as skipped, not failed', () => {
    expect(operationResourceState({status: 'PruneSkipped'})).toBe('skipped');
  });

  it('keeps running hooks in a running state', () => {
    expect(
      operationResourceState({status: 'Synced', hookPhase: 'Running'}, 'Running')
    ).toBe('running');
  });

  it('treats SyncFailed as failed', () => {
    expect(operationResourceState({status: 'SyncFailed'})).toBe('failed');
  });

  it('does not claim an unreported successful resource was applied', () => {
    expect(operationResourceState({}, 'Succeeded')).toBe('unknown');
  });

  it('does not label a failed attempt at an old revision as restored', () => {
    const app: ArgoApplication = {
      spec: {source: {repoURL: 'https://github.com/example/repo.git'}},
      status: {
        history: [
          {id: 3, revision: 'aaa', deployedAt: '2026-02-03T00:00:00Z'},
          {id: 2, revision: 'bbb', deployedAt: '2026-02-02T00:00:00Z'},
          {id: 1, revision: 'aaa', deployedAt: '2026-02-01T00:00:00Z'},
        ],
        operationState: {
          phase: 'Failed',
          operation: {sync: {revision: 'aaa'}},
          syncResult: {revision: 'aaa'},
        },
      },
    };

    expect(latestOperationSummary(app).kind).toBe('full-sync');
  });
});
