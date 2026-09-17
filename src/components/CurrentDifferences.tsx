import * as React from 'react';
import {useEffect, useState} from 'react';
import {ArgoApplication, LiveFieldDifference} from '../models/trace';
import {loadCurrentDifferences} from '../services/managed-resources-service';
import {currentDifferencesSummary} from '../services/operation-service';
import {Section} from './Section';

const DEFAULT_VISIBLE_ROWS = 8;

function typeLabel(difference: LiveFieldDifference): string {
  if (difference.type === 'missing') return 'Missing';
  if (difference.type === 'requires-prune') return 'Prune';
  if (difference.type === 'unavailable') return 'Unavailable';
  return 'Modified';
}

function value(value: string | undefined, empty: string): React.ReactNode {
  if (value === undefined) return <span className='trace-muted'>{empty}</span>;
  return <code className='trace-diff-value'>{value}</code>;
}

export const CurrentDifferences = ({app}: {app: ArgoApplication}) => {
  const resourceSummary = currentDifferencesSummary(app);
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    differences?: LiveFieldDifference[];
    resourceCount?: number;
    truncated?: boolean;
  }>({loading: true});

  useEffect(() => {
    if (app.status?.sync?.status !== 'OutOfSync' && resourceSummary.differences.length === 0) {
      setState({loading: false, differences: [], resourceCount: 0});
      return;
    }

    const controller = new AbortController();
    setState({loading: true});

    loadCurrentDifferences({app, signal: controller.signal})
      .then(result => {
        setState({
          loading: false,
          differences: result.differences,
          resourceCount: result.resourceCount,
          truncated: result.truncated,
        });
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          differences: [],
          resourceCount: resourceSummary.differences.length,
        });
      });

    return () => controller.abort();
  }, [
    app.metadata?.name,
    app.metadata?.namespace,
    app.spec?.project,
    app.status?.sync?.status,
    JSON.stringify(app.status?.resources || []),
  ]);

  if (app.status?.sync?.status !== 'OutOfSync' && resourceSummary.differences.length === 0) {
    return null;
  }

  const differences = state.differences || [];
  const visible = expanded
    ? differences
    : differences.slice(0, DEFAULT_VISIBLE_ROWS);

  const resourceCount = state.resourceCount ?? resourceSummary.differences.length;
  const differenceCount = differences.length;
  const unavailableCount = differences.filter(
    difference => difference.type === 'unavailable'
  ).length;
  const resourceCountLabel = state.truncated ? `${resourceCount}+` : resourceCount;
  const differenceCountLabel = state.truncated
    ? `${differenceCount}+`
    : differenceCount || resourceSummary.differences.length;

  const fallbackRows = resourceSummary.differences.slice(
    0,
    expanded ? 50 : DEFAULT_VISIBLE_ROWS
  );

  const action =
    differenceCount > DEFAULT_VISIBLE_ROWS ? (
      <button
        type='button'
        className='trace-button trace-button--compact'
        onClick={() => setExpanded(value => !value)}>
        {expanded ? 'COLLAPSE' : 'EXPAND ALL'}
      </button>
    ) : undefined;

  return (
    <Section
      title='CURRENT DIFFERENCES'
      description='Field-level comparison of Argo CD’s rendered desired state and the live cluster; unparseable states are marked unavailable.'
      action={action}>
      <div className='trace-diff-section'>
        <div className='trace-diff-metrics'>
          <div>
            <strong>{resourceCountLabel}</strong>
            <span>resource{resourceCount === 1 ? '' : 's'} out of sync</span>
          </div>
          <div>
            <strong>{differenceCountLabel}</strong>
            <span>field/status row{differenceCount === 1 ? '' : 's'}</span>
          </div>
          <div className='trace-diff-metrics__status'>
            <span className='trace-status-dot trace-status-dot--warning' />
            <strong>{app.status?.sync?.status || 'Unknown'}</strong>
          </div>
        </div>

        {state.loading && (
          <div className='trace-empty-state trace-empty-state--inside'>
            <i className='fa fa-circle-notch fa-spin' aria-hidden='true' />
            Loading live resource differences…
          </div>
        )}

        {!state.loading && differences.length > 0 && (
          <div className='trace-flat-table-wrap'>
            <table className='trace-flat-table trace-flat-table--current'>
              <thead>
                <tr>
                  <th>RESOURCE</th>
                  <th>NAMESPACE</th>
                  <th>FIELD</th>
                  <th>DESIRED (RENDERED)</th>
                  <th aria-label='Direction' />
                  <th>LIVE (CLUSTER)</th>
                  <th>TYPE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((difference, index) => (
                  <tr
                    key={`${difference.resourceKey}-${difference.path}-${index}`}
                    title={difference.reason}>
                    <td>
                      <span className='trace-resource-cell'>
                        <i className='fa fa-cube' aria-hidden='true' />
                        <strong>{difference.kind}/{difference.name}</strong>
                      </span>
                    </td>
                    <td>{difference.namespace || '—'}</td>
                    <td><code className='trace-path-value'>{difference.path}</code></td>
                    <td>{value(difference.desired, 'not present')}</td>
                    <td className='trace-arrow-cell'>→</td>
                    <td className='trace-live-value'>{value(difference.live, 'not present')}</td>
                    <td>
                      <span className={`trace-type-badge trace-type-badge--${difference.type}`}>
                        {typeLabel(difference)}
                      </span>
                    </td>
                    <td>
                      <span className='trace-status-inline trace-status-inline--warning'>
                        <span className='trace-status-dot trace-status-dot--warning' />
                        {difference.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!state.loading && differences.length === 0 && fallbackRows.length > 0 && (
          <div className='trace-operation-resources'>
            {fallbackRows.map((difference, index) => (
              <div
                className={`trace-operation-resource trace-operation-resource--${difference.state}`}
                key={`${difference.group || ''}-${difference.kind}-${difference.namespace || ''}-${difference.name}-${index}`}>
                <i className='fa fa-exclamation-circle' aria-hidden='true' />
                <div className='trace-operation-resource__identity'>
                  <strong>{difference.kind}/{difference.name}</strong>
                  <span>{difference.namespace ? `Namespace: ${difference.namespace}` : 'Cluster scoped or namespace not declared'}</span>
                </div>
                <span className='trace-operation-resource__state'>OUT OF SYNC</span>
              </div>
            ))}
          </div>
        )}

        {state.error && (
          <div className='trace-inline-info trace-inline-info--warning'>
            <i className='fa fa-info-circle' aria-hidden='true' />
            <span>
              Field-level live diff could not be loaded. Resource-level status is still shown. {state.error}
            </span>
          </div>
        )}

        {!state.loading && unavailableCount > 0 && (
          <div className='trace-inline-info trace-inline-info--warning'>
            <i className='fa fa-info-circle' aria-hidden='true' />
            <span>
              {unavailableCount} row{unavailableCount === 1 ? '' : 's'} could not be parsed and therefore {unavailableCount === 1 ? 'is' : 'are'} not classified as missing, modified, or requiring prune.
            </span>
          </div>
        )}

        {state.truncated && (
          <div className='trace-inline-info'>
            <i className='fa fa-info-circle' aria-hidden='true' />
            <span>The live diff was truncated after 120 field differences.</span>
          </div>
        )}

        <p className='trace-change-footnote'>
          Current Differences compares Argo CD managed resource state. It does not infer whether drift came from Git, a manual live edit, or another cluster-side change.
        </p>
      </div>
    </Section>
  );
};
