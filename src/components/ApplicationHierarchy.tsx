import * as React from 'react';
import {ArgoApplication, ApplicationHierarchyResult} from '../models/trace';
import {resolveApplicationHierarchy} from '../services/hierarchy-service';
import {Section} from './Section';

function nodeIcon(kind: 'Application' | 'ApplicationSet'): string {
  return kind === 'ApplicationSet' ? 'fa-layer-group' : 'fa-cube';
}

export const ApplicationHierarchy = ({app}: {app: ArgoApplication}) => {
  const [result, setResult] = React.useState<ApplicationHierarchyResult | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const identity = `${app.metadata?.namespace || 'argocd'}/${app.metadata?.name || ''}`;
  const trackingIdentity = [
    app.metadata?.annotations?.['argocd.argoproj.io/tracking-id'] || '',
    app.metadata?.labels?.['argocd.argoproj.io/instance'] || '',
    app.metadata?.labels?.['app.kubernetes.io/instance'] || '',
    (app.metadata?.ownerReferences || [])
      .map(owner => `${owner.kind || ''}:${owner.name || ''}`)
      .join(','),
  ].join('|');

  React.useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError(undefined);

    resolveApplicationHierarchy(app, controller.signal)
      .then(setResult)
      .catch(reason => {
        if (reason?.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => controller.abort();
  }, [identity, trackingIdentity]);

  return (
    <Section
      title='APPLICATION HIERARCHY'
      description='Management path for this Application.'>
      {!result && !error && (
        <div className='trace-empty-state'>
          <i className='fa fa-circle-notch fa-spin' aria-hidden='true' />
          Resolving hierarchy…
        </div>
      )}

      {error && (
        <div className='trace-empty-state trace-empty-state--error'>
          Unable to resolve the Application hierarchy: {error}
        </div>
      )}

      {result && (
        <div className='trace-hierarchy-wrap'>
          <div className='trace-hierarchy' role='list' aria-label='Application hierarchy'>
            {result.nodes.map((node, index) => {
              const role = node.current
                ? 'Current'
                : index === 0
                  ? 'Parent'
                  : index === result.nodes.length - 1
                    ? 'Leaf'
                    : node.kind;

              const content = (
                <>
                  <span className='trace-hierarchy__icon' aria-hidden='true'>
                    <i className={`fa ${nodeIcon(node.kind)}`} />
                  </span>
                  <span className='trace-hierarchy__text'>
                    <span className='trace-hierarchy__kind'>{node.kind}</span>
                    <strong>{node.name}</strong>
                    {node.namespace && (
                      <span className='trace-hierarchy__namespace'>
                        {node.namespace}
                      </span>
                    )}
                  </span>
                  {node.current && (
                    <span className='trace-hierarchy__current'>Current</span>
                  )}
                </>
              );

              return (
                <React.Fragment key={`${node.kind}-${node.namespace || ''}-${node.name}`}>
                  {index > 0 && (
                    <span className='trace-hierarchy__connector' aria-hidden='true'>
                      <i className='fa fa-chevron-right' />
                    </span>
                  )}
                  <div className='trace-hierarchy__item' role='listitem'>
                    {node.href && !node.current ? (
                      <a className='trace-hierarchy__node' href={node.href} data-role={role}>
                        {content}
                      </a>
                    ) : (
                      <div className='trace-hierarchy__node' data-role={role}>{content}</div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {result.partial && result.reason && (
            <p className='trace-hierarchy__note'>
              <i className='fa fa-info-circle' aria-hidden='true' />{' '}
              {result.reason}
            </p>
          )}
        </div>
      )}
    </Section>
  );
};
