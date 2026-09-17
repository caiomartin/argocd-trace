import * as React from 'react';
import {ArgoApplication, LatestOperationKind, LatestOperationResource} from '../models/trace';
import {latestOperationSummary} from '../services/operation-service';
import {Section} from './Section';

function short(value: string): string {
  return value.length > 8 ? value.slice(0, 7) : value;
}

function revisionSet(values: string[]): string {
  return values.filter(Boolean).map(short).join(', ') || '—';
}

function operationLabel(kind: LatestOperationKind): string {
  if (kind === 'selective-sync') return 'Selective Sync';
  if (kind === 'revision-restored') return 'Previous revision restored';
  if (kind === 'resync') return 'Re-sync';
  if (kind === 'full-sync') return 'Full Sync';
  return 'Sync operation';
}

function stateLabel(resource: LatestOperationResource): string {
  if (resource.state === 'applied') return resource.status || 'Applied';
  if (resource.state === 'failed') return resource.status || 'Failed';
  if (resource.state === 'running') return resource.status || 'Running';
  if (resource.state === 'skipped') return resource.status || 'Skipped';
  if (resource.state === 'not-selected') return 'Not selected';
  if (resource.state === 'out-of-sync') return 'Not selected · OutOfSync';
  return resource.status || 'Unknown';
}

function stateIcon(resource: LatestOperationResource): string {
  if (resource.state === 'applied') return 'fa-check-circle';
  if (resource.state === 'failed') return 'fa-times-circle';
  if (resource.state === 'running') return 'fa-circle-notch fa-spin';
  if (resource.state === 'skipped') return 'fa-forward';
  if (resource.state === 'out-of-sync') return 'fa-exclamation-circle';
  if (resource.state === 'not-selected') return 'fa-circle-o';
  return 'fa-question-circle';
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function duration(start?: string, finish?: string): string {
  if (!start || !finish) return '—';
  const startMs = new Date(start).getTime();
  const finishMs = new Date(finish).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(finishMs) || finishMs < startMs) return '—';
  const seconds = Math.round((finishMs - startMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export const LatestOperation = ({app}: {app: ArgoApplication}) => {
  const operation = latestOperationSummary(app);
  if (!operation.available) return null;

  const title = operationLabel(operation.kind);
  const phase = operation.phase || 'Unknown';
  const resources = operation.resources.slice(0, 12);
  const showResourceDetails = operation.selective || phase !== 'Succeeded';
  const succeeded = phase === 'Succeeded';
  const appOutOfSync = operation.appSyncStatus === 'OutOfSync';

  return (
    <Section
      title='LATEST OPERATION'
      description='The most recent Argo CD operation, independent from the deployment history.'>
      <div className='trace-latest-operation'>
        <div className='trace-operation-summary trace-operation-summary--dense'>
          <div>
            <span>Operation</span>
            <strong>{title}</strong>
          </div>
          <div>
            <span>Phase</span>
            <strong className={succeeded ? 'trace-text-success' : undefined}>{phase}</strong>
          </div>
          <div>
            <span>Revision</span>
            <code className='trace-link-color'>{revisionSet(operation.revisions)}</code>
          </div>
          <div>
            <span>Application state</span>
            <strong>{operation.appSyncStatus || 'Unknown'}</strong>
          </div>
          <div>
            <span>Initiated by</span>
            <strong>{operation.initiatedBy || 'Unknown'}</strong>
          </div>
          <div>
            <span>Started</span>
            <strong>{formatDate(operation.startedAt)}</strong>
          </div>
          <div>
            <span>Duration</span>
            <strong>{duration(operation.startedAt, operation.finishedAt)}</strong>
          </div>
        </div>

        {succeeded && (
          <div className='trace-operation-banner trace-operation-banner--success'>
            <i className='fa fa-check-circle' aria-hidden='true' />
            <strong>Sync succeeded</strong>
          </div>
        )}

        {succeeded && appOutOfSync && (
          <div className='trace-inline-info'>
            <i className='fa fa-info-circle' aria-hidden='true' />
            <span>Sync succeeded, but the Application currently has live differences.</span>
          </div>
        )}

        {operation.selective && (
          <div className='trace-selective-notice'>
            <i className='fa fa-info-circle' aria-hidden='true' />
            <div>
              <strong>Selective Sync</strong>
              <span>
                Only selected resources were requested. The Application can remain OutOfSync even when this operation succeeds.
              </span>
            </div>
          </div>
        )}

        {operation.kind === 'revision-restored' && (
          <div className='trace-inline-info'>
            <i className='fa fa-info-circle' aria-hidden='true' />
            <span>
              Argo CD history confirms that a previously deployed revision became
              active again. It does not expose whether this happened through the
              Rollback action or a regular Sync to an older revision.
            </span>
          </div>
        )}

        {showResourceDetails && resources.length > 0 && (
          <div className='trace-operation-resources'>
            {resources.map((resource, index) => (
              <div
                className={`trace-operation-resource trace-operation-resource--${resource.state}`}
                key={`${resource.group || ''}-${resource.kind}-${resource.namespace || ''}-${resource.name}-${index}`}>
                <i className={`fa ${stateIcon(resource)}`} aria-hidden='true' />
                <div className='trace-operation-resource__identity'>
                  <strong>{resource.kind}/{resource.name}</strong>
                  <span>
                    {resource.namespace ? `Namespace: ${resource.namespace}` : 'Cluster scoped or namespace not declared'}
                    {resource.message ? ` · ${resource.message}` : ''}
                  </span>
                </div>
                <span className='trace-operation-resource__state'>{stateLabel(resource)}</span>
              </div>
            ))}
            {operation.resources.length > resources.length && (
              <div className='trace-operation-more'>
                +{operation.resources.length - resources.length} more resources
              </div>
            )}
          </div>
        )}

        {operation.message && (
          <div className='trace-operation-message'>{operation.message}</div>
        )}
      </div>
    </Section>
  );
};
