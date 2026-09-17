import * as React from 'react';
import {useEffect, useMemo, useState} from 'react';
import {
  ArgoApplication,
  ManifestChangeStatus,
  ManifestChangesResult,
  ManifestResourceChange,
} from '../models/trace';
import {loadApplicationChanges} from '../services/changes-service';
import {
  applicationSourceCount,
  completeRevisionSet,
  desiredRevisionSet,
  operationRevisionSet,
  revisionComparisonPlan,
  sameRevisionSet,
} from '../services/revision-service';
import {Section} from './Section';

const DEFAULT_VISIBLE_ROWS = 8;

interface FlatManifestChange {
  key: string;
  resource: ManifestResourceChange;
  path: string;
  status: ManifestChangeStatus;
  before?: string;
  after?: string;
}

function statusLabel(status: ManifestChangeStatus): string {
  if (status === 'added') return 'Added';
  if (status === 'deleted') return 'Removed';
  return 'Modified';
}

function short(value: string): string {
  return value.length > 8 ? value.slice(0, 7) : value;
}

function revisionSet(values: string[]): string {
  return values.filter(Boolean).map(short).join(', ') || '—';
}

function flatRows(resources: ManifestResourceChange[]): FlatManifestChange[] {
  return resources.flatMap(resource => {
    if (resource.status === 'modified') {
      return resource.fieldChanges.map((change, index) => ({
        key: `${resource.key}-${change.path}-${index}`,
        resource,
        path: change.path,
        status: change.status,
        before: change.before,
        after: change.after,
      }));
    }

    return [
      {
        key: `${resource.key}-$resource`,
        resource,
        path: '$resource',
        status: resource.status,
        before: resource.status === 'added' ? undefined : 'Present',
        after: resource.status === 'deleted' ? undefined : 'Present',
      },
    ];
  });
}

function fieldValue(value: string | undefined, empty: string): React.ReactNode {
  if (value === undefined) return <span className='trace-muted'>{empty}</span>;
  return <code className='trace-diff-value'>{value}</code>;
}

export const ApplicationChanges = ({app}: {app: ArgoApplication}) => {
  const plan = revisionComparisonPlan(app);
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    data?: ManifestChangesResult;
  }>({loading: true});

  useEffect(() => {
    const controller = new AbortController();
    setState({loading: true});

    loadApplicationChanges({app, signal: controller.signal})
      .then(data => setState({loading: false, data}))
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => controller.abort();
  }, [
    app.metadata?.name,
    app.metadata?.namespace,
    app.spec?.project,
    JSON.stringify(app.spec?.source || null),
    JSON.stringify(app.spec?.sources || []),
    JSON.stringify(app.status?.sync || null),
    JSON.stringify(app.status?.history || []),
  ]);

  const data = state.data;
  const comparisonKind = data?.comparisonKind || plan.kind;
  const pending = comparisonKind === 'pending';
  const sourceCount = applicationSourceCount(app);
  const desiredRevisions = desiredRevisionSet(app, sourceCount);
  const latestOperationRevisions = operationRevisionSet(app, sourceCount);
  const latestSelectiveSync = Boolean(
    app.status?.operationState?.operation?.sync?.resources?.length
  );
  const partiallyApplied = Boolean(
    pending &&
      latestSelectiveSync &&
      app.status?.operationState?.phase === 'Succeeded' &&
      completeRevisionSet(desiredRevisions, sourceCount) &&
      completeRevisionSet(latestOperationRevisions, sourceCount) &&
      sameRevisionSet(desiredRevisions, latestOperationRevisions)
  );
  const restored = comparisonKind === 'revision-restored';
  const resync = comparisonKind === 'resync';
  const firstDeployment = comparisonKind === 'first-deployment';
  const totalResources = data?.resourceChangeCount || 0;

  const rows = useMemo(() => flatRows(data?.resources || []), [data?.resources]);
  const visibleRows = expanded ? rows : rows.slice(0, DEFAULT_VISIBLE_ROWS);

  const title = pending
    ? partiallyApplied
      ? 'DESIRED CHANGES SINCE LAST FULL DEPLOYMENT'
      : 'PENDING CHANGES — NOT DEPLOYED'
    : restored
      ? 'CHANGES WHEN A PREVIOUS REVISION WAS RESTORED'
      : resync
        ? 'RE-SYNC RESULT'
        : firstDeployment
          ? 'FIRST DEPLOYMENT'
          : 'CHANGES IN LAST DEPLOYMENT';

  const description = pending
    ? partiallyApplied
      ? 'Compares the last full deployment with the desired revision. Some resources may already have been applied by the latest Selective Sync.'
      : 'Compares the latest deployed revision with the desired revision detected by Argo CD.'
    : restored
      ? 'Compares the preceding deployment with a revision that appears earlier in deployment history. History alone does not identify whether this used the Rollback API or a normal Sync.'
      : resync
        ? 'Compares the two latest synchronization events for the same revision.'
        : firstDeployment
          ? 'This is the first synchronized revision of this Application.'
          : 'One row per rendered field changed between the two latest synchronized deployments.';

  const baseLabel = pending ? 'Deployed' : resync ? 'Previous sync' : 'Previous';
  const targetLabel = pending
    ? 'Desired'
    : restored
      ? 'Revision restored'
      : resync
        ? 'Re-synced'
        : 'Deployed';

  const hideEmptyComparison =
    !state.loading &&
    !state.error &&
    Boolean(data) &&
    !data!.available &&
    data!.comparisonKind === 'first-deployment';

  if (hideEmptyComparison) return null;

  const action =
    rows.length > DEFAULT_VISIBLE_ROWS ? (
      <button
        type='button'
        className='trace-button trace-button--compact'
        onClick={() => setExpanded(value => !value)}>
        {expanded ? 'COLLAPSE' : 'EXPAND ALL'}
      </button>
    ) : undefined;

  return (
    <Section title={title} description={description} action={action}>
      {state.loading && (
        <div className='trace-empty-state'>
          <i className='fa fa-circle-notch fa-spin' />
          <span>Comparing rendered manifests…</span>
        </div>
      )}

      {state.error && (
        <div className='trace-empty-state trace-empty-state--error'>
          <i className='fa fa-exclamation-circle' />
          <span>{state.error}</span>
        </div>
      )}

      {!state.loading && !state.error && data?.warning && (
        <div className='trace-inline-info trace-inline-info--warning'>
          <i className='fa fa-info-circle' aria-hidden='true' />
          <span>{data.warning}</span>
        </div>
      )}

      {!state.loading &&
        !state.error &&
        data &&
        !data.available &&
        data.comparisonKind !== 'first-deployment' && (
          <div className='trace-change-empty'>
            <i className='fa fa-history' aria-hidden='true' />
            <div>
              <strong>Comparison unavailable.</strong>
              <span>{data.reason}</span>
            </div>
          </div>
        )}

      {!state.loading &&
        !state.error &&
        data?.available &&
        rows.length === 0 && (
          <div className='trace-change-empty'>
            <i className='fa fa-check-circle' aria-hidden='true' />
            <div>
              <strong>No rendered manifest changes.</strong>
              <span>
                {pending
                  ? 'The desired revision differs, but it renders the same Kubernetes manifests for this Application.'
                  : resync
                    ? 'The same revision was synchronized again and rendered identically.'
                    : 'The revision transition rendered identical Kubernetes manifests.'}
              </span>
            </div>
          </div>
        )}

      {!state.loading && !state.error && data?.available && rows.length > 0 && (
        <div className='trace-diff-section'>
          {pending && (
            <div className='trace-pending-notice'>
              <i className='fa fa-exclamation-circle' aria-hidden='true' />
              <div>
                <strong>
                  {partiallyApplied
                    ? 'The desired revision is only partially applied.'
                    : 'These changes have not been synchronized.'}
                </strong>
                <span>
                  {partiallyApplied
                    ? 'See Latest Operation and Current Differences to identify which resources were applied and which still differ.'
                    : 'The deployed revision remains unchanged until a successful full Sync completes.'}
                </span>
              </div>
            </div>
          )}

          <div className='trace-deployment-header'>
            <div className='trace-deployment-revisions'>
              <div>
                <span>{baseLabel}</span>
                <code>{revisionSet(data.baseRevisions)}</code>
              </div>
              <i className='fa fa-arrow-right' aria-hidden='true' />
              <div>
                <span>{targetLabel}</span>
                <code>{revisionSet(data.targetRevisions)}</code>
              </div>
            </div>

            <div className='trace-diff-metrics trace-diff-metrics--compact'>
              <div>
                <strong>{totalResources}</strong>
                <span>resource{totalResources === 1 ? '' : 's'} changed</span>
              </div>
              <div>
                <strong>
                  {rows.length}
                  {(data.truncated ||
                    data.resources.some(resource => resource.fieldChangesTruncated))
                    ? '+'
                    : ''}
                </strong>
                <span>field{rows.length === 1 ? '' : 's'} changed</span>
              </div>
              {restored && (
                <span className='trace-event-badge trace-event-badge--revision-restored'>
                  REVISION RESTORED
                </span>
              )}
              {resync && (
                <span className='trace-event-badge trace-event-badge--resync'>RE-SYNC</span>
              )}
              {pending && (
                <span className='trace-pending-badge'>
                  {partiallyApplied ? 'PARTIALLY APPLIED' : 'NOT DEPLOYED'}
                </span>
              )}
            </div>
          </div>

          <div className='trace-flat-table-wrap'>
            <table className='trace-flat-table trace-flat-table--deployment'>
              <thead>
                <tr>
                  <th>RESOURCE</th>
                  <th>FIELD</th>
                  <th>{baseLabel.toUpperCase()} ({revisionSet(data.baseRevisions)})</th>
                  <th aria-label='Direction' />
                  <th>{targetLabel.toUpperCase()} ({revisionSet(data.targetRevisions)})</th>
                  <th>TYPE</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(row => (
                  <tr key={row.key}>
                    <td>
                      <span className='trace-resource-cell'>
                        <i className='fa fa-cube' aria-hidden='true' />
                        <span>
                          <strong>{row.resource.kind}/{row.resource.name}</strong>
                          <small>{row.resource.namespace || 'Namespace not declared'}</small>
                        </span>
                      </span>
                    </td>
                    <td><code className='trace-path-value'>{row.path}</code></td>
                    <td>{fieldValue(row.before, 'not present')}</td>
                    <td className='trace-arrow-cell'>→</td>
                    <td>{fieldValue(row.after, 'not present')}</td>
                    <td>
                      <span className={`trace-type-badge trace-type-badge--${row.status}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(data.truncated || data.resources.some(resource => resource.fieldChangesTruncated)) && (
            <div className='trace-inline-info'>
              <i className='fa fa-info-circle' aria-hidden='true' />
              <span>Some manifest or field differences were truncated.</span>
            </div>
          )}

          <p className='trace-change-footnote'>
            This is a rendered Kubernetes manifest comparison, not a Git file diff. Trace redacts Secret data and stringData values.
          </p>
        </div>
      )}
    </Section>
  );
};
