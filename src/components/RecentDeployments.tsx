import * as React from 'react';
import {useEffect, useState} from 'react';
import {
  ArgoApplication,
  DeploymentSummary,
  TraceSource,
  RecentDeploymentsResult,
} from '../models/trace';
import {loadRecentDeployments} from '../services/deployments-service';
import {applicationSourceCount} from '../services/revision-service';
import {ExternalLink} from './ExternalLink';
import {Section} from './Section';

function formatRelativeDate(value?: string): string {
  if (!value) return '—';

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function ChangeSummary({
  deployment,
  applicationWide,
}: {
  deployment: DeploymentSummary;
  applicationWide: boolean;
}) {
  const summary = deployment.changeSummary;
  const transition = deployment.shortPreviousRevision
    ? `${deployment.shortPreviousRevision} → ${deployment.shortRevision}`
    : deployment.shortRevision;

  if (summary.status === 'first-deployment') {
    return (
      <div className='trace-deployment-change trace-deployment-change--first'>
        <code>{transition}</code>
        <span>First deployment</span>
      </div>
    );
  }

  if (summary.status === 'unavailable') {
    return (
      <div
        className='trace-deployment-change trace-deployment-change--unavailable'
        title={summary.error || summary.warning}>
        <code>{transition}</code>
        <span>Comparison unavailable</span>
      </div>
    );
  }

  if (summary.status === 'unchanged') {
    return (
      <div
        className='trace-deployment-change trace-deployment-change--unchanged'
        title={summary.warning}>
        <code>{transition}</code>
        <span>{applicationWide ? 'Application-wide · ' : ''}No rendered changes</span>
      </div>
    );
  }

  const count = summary.resourceCount;
  const details = [
    summary.added ? `${summary.added} added` : undefined,
    summary.modified ? `${summary.modified} modified` : undefined,
    summary.deleted ? `${summary.deleted} removed` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className='trace-deployment-change trace-deployment-change--changed'
      title={[details, summary.warning].filter(Boolean).join(' — ') || undefined}>
      <code>{transition}</code>
      <span>
        {applicationWide ? 'Application-wide · ' : ''}
        {count} resource{count === 1 ? '' : 's'} · {summary.fieldCount} field{summary.fieldCount === 1 ? '' : 's'}
      </span>
    </div>
  );
}

function actionLabel(deployment: DeploymentSummary, source: TraceSource): string {
  if (!deployment.compareUrl) return 'VIEW REVISION';
  if (source.provider === 'GitLab') return 'COMPARE IN GITLAB';
  if (source.provider === 'GitHub') return 'COMPARE IN GITHUB';
  return 'COMPARE';
}

export const RecentDeployments = ({
  app,
  source,
}: {
  app: ArgoApplication;
  source: TraceSource;
}) => {
  const sourceCount = applicationSourceCount(app);
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    data?: RecentDeploymentsResult;
  }>({loading: true});

  useEffect(() => {
    const controller = new AbortController();
    setState({loading: true});

    loadRecentDeployments({app, source, signal: controller.signal})
      .then(data => setState({loading: false, data}))
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
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
    JSON.stringify(app.status?.history || []),
    source.index,
    source.repositoryUrl,
  ]);

  return (
    <Section
      title={sourceCount > 1 ? `RECENT DEPLOYMENTS — SOURCE ${source.index + 1}` : 'RECENT DEPLOYMENTS'}
      description={
        sourceCount > 1
          ? 'Commit metadata is source-specific; rendered change counts cover the entire multi-source Application.'
          : 'The latest synchronization events and the rendered impact of each transition.'
      }
      action={
        <ExternalLink href={source.links.history}>
          VIEW REPOSITORY HISTORY
        </ExternalLink>
      }>
      {state.loading && (
        <div className='trace-empty-state'>
          <i className='fa fa-circle-notch fa-spin' aria-hidden='true' />
          <span>Loading deployment history and change summaries…</span>
        </div>
      )}

      {state.error && (
        <div className='trace-empty-state trace-empty-state--error'>
          <i className='fa fa-exclamation-circle' aria-hidden='true' />
          <span>{state.error}</span>
        </div>
      )}

      {!state.loading &&
        !state.error &&
        state.data?.deployments.length === 0 && (
          <div className='trace-empty-state'>
            <i className='fa fa-history' aria-hidden='true' />
            <span>No synchronized revision history is available.</span>
          </div>
        )}

      {!state.loading &&
        !state.error &&
        state.data &&
        state.data.deployments.length > 0 && (
          <>
            {state.data.omittedIncompleteEntries > 0 && (
              <div className='trace-inline-info trace-inline-info--warning'>
                <i className='fa fa-info-circle' aria-hidden='true' />
                <span>
                  {state.data.omittedIncompleteEntries} history entr{state.data.omittedIncompleteEntries === 1 ? 'y was' : 'ies were'} omitted because Argo CD did not record a complete revision set for every source.
                </span>
              </div>
            )}
            {state.data.activeRevisionNotInHistory && (
              <div className='trace-inline-info trace-inline-info--warning'>
                <i className='fa fa-info-circle' aria-hidden='true' />
                <span>The revision reported as active by sync status is not present in the available deployment history.</span>
              </div>
            )}
            <div className='trace-table-wrapper'>
            <table className='trace-table'>
              <thead>
                <tr>
                  <th className='trace-table__commit'>REVISION</th>
                  <th>MESSAGE</th>
                  <th className='trace-table__author'>COMMIT AUTHOR / SYNC ACTOR</th>
                  <th className='trace-table__changes'>CHANGES</th>
                  <th className='trace-table__date'>DEPLOYED</th>
                  <th className='trace-table__action' />
                </tr>
              </thead>
              <tbody>
                {state.data.deployments.map((deployment, index) => {
                  const actionHref = deployment.compareUrl || deployment.webUrl;

                  return (
                    <tr
                      key={`${deployment.revision}-${deployment.versionId ?? 'current'}-${index}`}>
                      <td className='trace-table__commit'>
                        <ExternalLink code href={deployment.webUrl}>
                          {deployment.shortRevision || '—'}
                        </ExternalLink>{' '}
                        {deployment.current && (
                          <span className='trace-badge'>ACTIVE</span>
                        )}
                        {!deployment.current && deployment.latestRecorded && (
                          <span className='trace-badge trace-badge--neutral'>LATEST RECORDED</span>
                        )}
                        {deployment.eventType === 'revision-restored' && (
                          <span
                            className='trace-event-badge trace-event-badge--revision-restored'
                            title='This revision appeared earlier in history; the history does not distinguish a Rollback API action from a normal Sync.'>
                            REVISION RESTORED
                          </span>
                        )}
                        {deployment.resyncCount > 0 && (
                          <span className='trace-event-badge trace-event-badge--resync'>
                            RE-SYNC ×{deployment.resyncCount}
                          </span>
                        )}
                      </td>
                      <td title={deployment.metadataError}>
                        {deployment.message}
                        {deployment.metadataError && (
                          <i
                            className='fa fa-info-circle trace-inline-warning'
                            aria-label={`Metadata unavailable: ${deployment.metadataError}`}
                          />
                        )}
                      </td>
                      <td className='trace-table__author'>
                        {deployment.author}
                        {deployment.initiatedBy && (
                          <span className='trace-secondary-value'>Sync: {deployment.initiatedBy}</span>
                        )}
                      </td>
                      <td className='trace-table__changes'>
                        <ChangeSummary
                          deployment={deployment}
                          applicationWide={sourceCount > 1}
                        />
                      </td>
                      <td className='trace-table__date'>
                        {formatRelativeDate(deployment.deployedAt)}
                        {deployment.resyncCount > 0 && (
                          <span className='trace-secondary-value'>latest re-sync</span>
                        )}
                      </td>
                      <td className='trace-table__action'>
                        <ExternalLink href={actionHref}>
                          {actionLabel(deployment, source)}
                        </ExternalLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
    </Section>
  );
};
