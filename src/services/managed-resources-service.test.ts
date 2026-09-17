import {describe, expect, it} from 'vitest';
import {summarizeManagedResources} from './managed-resources-service';

describe('managed resource differences', () => {
  it('reports invalid JSON as unavailable instead of missing or prune', () => {
    const result = summarizeManagedResources([
      {
        kind: 'Deployment',
        name: 'api',
        modified: true,
        targetState: '{invalid',
        liveState: '{}',
      },
    ]);

    expect(result.differences).toHaveLength(1);
    expect(result.differences[0]).toMatchObject({
      type: 'unavailable',
      status: 'Unknown',
    });
  });

  it('classifies explicit JSON null as an absent side', () => {
    const missing = summarizeManagedResources([
      {
        kind: 'Service',
        name: 'api',
        modified: true,
        targetState: '{}',
        liveState: 'null',
      },
    ]);
    expect(missing.differences[0].type).toBe('missing');

    const prune = summarizeManagedResources([
      {
        kind: 'Service',
        name: 'old',
        modified: true,
        targetState: 'null',
        liveState: '{}',
      },
    ]);
    expect(prune.differences[0].type).toBe('requires-prune');
  });

  it('redacts Secret values in field-level live differences', () => {
    const result = summarizeManagedResources([
      {
        kind: 'Secret',
        namespace: 'default',
        name: 'credentials',
        modified: true,
        targetState: JSON.stringify({kind: 'Secret', data: {password: 'new-secret'}}),
        liveState: JSON.stringify({kind: 'Secret', data: {password: 'old-secret'}}),
      },
    ]);

    expect(result.differences[0]).toMatchObject({
      path: 'data.password',
      desired: '<redacted>',
      live: '<redacted>',
    });
  });

  it('excludes hook resources from current drift', () => {
    const result = summarizeManagedResources([
      {
        kind: 'Job',
        name: 'migration',
        hook: true,
        modified: true,
        targetState: '{}',
        liveState: '{"changed":true}',
      },
    ]);
    expect(result.differences).toEqual([]);
  });
});
