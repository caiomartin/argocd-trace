import {describe, expect, it} from 'vitest';
import {ManifestResponse} from '../models/trace';
import {compareManifestResponses} from './changes-service';

function response(manifests: object[]): ManifestResponse {
  return {manifests: manifests.map(manifest => JSON.stringify(manifest))};
}

function configMap(name: string, value: string) {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {namespace: 'default', name},
    data: {value},
  };
}

describe('rendered manifest comparison', () => {
  it('treats an API version migration in the same group as one modified resource', () => {
    const base = response([
      {
        apiVersion: 'apps/v1beta1',
        kind: 'Deployment',
        metadata: {namespace: 'default', name: 'api'},
        spec: {replicas: 1},
      },
    ]);
    const target = response([
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {namespace: 'default', name: 'api'},
        spec: {replicas: 2},
      },
    ]);

    const result = compareManifestResponses(
      base,
      target,
      ['aaa'],
      ['bbb'],
      'deployment'
    );

    expect(result.resourceChangeCount).toBe(1);
    expect(result.modified).toBe(1);
    expect(result.added).toBe(0);
    expect(result.deleted).toBe(0);
  });

  it('redacts Secret field values and stored full manifests', () => {
    const base = response([
      {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {namespace: 'default', name: 'credentials'},
        data: {password: 'old-secret'},
      },
    ]);
    const target = response([
      {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {namespace: 'default', name: 'credentials'},
        data: {password: 'new-secret'},
      },
      {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {namespace: 'default', name: 'added'},
        stringData: {token: 'raw-token'},
      },
    ]);

    const result = compareManifestResponses(
      base,
      target,
      ['aaa'],
      ['bbb'],
      'deployment'
    );
    const modified = result.resources.find(resource => resource.name === 'credentials')!;
    const added = result.resources.find(resource => resource.name === 'added')!;

    expect(modified.fieldChanges[0]).toMatchObject({
      before: '<redacted>',
      after: '<redacted>',
    });
    expect(added.afterManifest).toContain('<redacted>');
    expect(added.afterManifest).not.toContain('raw-token');
  });

  it('keeps aggregate counts complete when displayed rows are truncated', () => {
    const base = response(
      Array.from({length: 205}, (_, index) => configMap(`item-${index}`, 'old'))
    );
    const target = response(
      Array.from({length: 205}, (_, index) => configMap(`item-${index}`, 'new'))
    );

    const result = compareManifestResponses(
      base,
      target,
      ['aaa'],
      ['bbb'],
      'deployment'
    );

    expect(result.truncated).toBe(true);
    expect(result.resources).toHaveLength(200);
    expect(result.resourceChangeCount).toBe(205);
    expect(result.modified).toBe(205);
  });
});
