import * as React from 'react';
import {useEffect, useState} from 'react';
import {ApplicationHierarchy} from './components/ApplicationHierarchy';
import {ApplicationChanges} from './components/ApplicationChanges';
import {CurrentDifferences} from './components/CurrentDifferences';
import {LatestOperation} from './components/LatestOperation';
import {RecentDeployments} from './components/RecentDeployments';
import {SourcePanel} from './components/SourcePanel';
import {ArgoApplication} from './models/trace';
import {refreshApplication} from './services/application-service';
import {resolveSources} from './services/source-service';

export interface TraceProps {
  application?: ArgoApplication;
  resource?: unknown;
  tree?: unknown;
}

export const Trace = ({application}: TraceProps) => {
  const [effectiveApplication, setEffectiveApplication] = useState<
    ArgoApplication | undefined
  >(application);
  const [refreshError, setRefreshError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setEffectiveApplication(application);
    setRefreshError(undefined);

    if (!application?.metadata?.name) return;

    const controller = new AbortController();

    refreshApplication(application, controller.signal)
      .then(refreshed => {
        setEffectiveApplication(refreshed);
        setRefreshError(undefined);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('Trace could not refresh the Application.', error);
        setRefreshError(error instanceof Error ? error.message : String(error));
      });

    return () => controller.abort();
  }, [
    application?.metadata?.name,
    application?.metadata?.namespace,
    application?.spec?.project,
    JSON.stringify(application?.spec?.source || null),
    JSON.stringify(application?.spec?.sources || []),
    JSON.stringify(application?.status?.sync || null),
    JSON.stringify(application?.status?.history || []),
    JSON.stringify(application?.status?.operationState || null),
    JSON.stringify(application?.status?.resources || []),
  ]);

  const app = effectiveApplication;

  if (!app) {
    return (
      <div className='trace'>
        <section className='trace-panel'>
          <div className='trace-empty-state'>
            Application data is unavailable.
          </div>
        </section>
      </div>
    );
  }

  const sources = resolveSources(app);

  return (
    <div className='trace'>
      {refreshError && (
        <div className='trace-refresh-warning'>
          <i className='fa fa-exclamation-triangle' aria-hidden='true' />
          <span>
            The latest Application refresh failed. Trace is showing the snapshot already loaded by the Argo CD UI. {refreshError}
          </span>
        </div>
      )}

      {sources.length === 0 ? (
        <section className='trace-panel'>
          <div className='trace-empty-state'>
            No source was found in <code>spec.source</code> or{' '}
            <code>spec.sources</code>.
          </div>
        </section>
      ) : (
        sources.map(source => (
          <SourcePanel
            key={`source-${source.index}`}
            source={source}
            total={sources.length}
          />
        ))
      )}

      <div className='trace-dashboard-grid'>
        <LatestOperation app={app} />
        <CurrentDifferences app={app} />
        <ApplicationChanges app={app} />

        {sources.map(source => (
          <RecentDeployments
            key={`recent-deployments-${source.index}`}
            app={app}
            source={source}
          />
        ))}
      </div>

      <ApplicationHierarchy app={app} />
    </div>
  );
};
