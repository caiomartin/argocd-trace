import * as React from 'react';
import {TraceSource} from '../models/trace';
import {ExternalLink} from './ExternalLink';
import {Section} from './Section';

function shortRevision(value?: string): string {
  if (!value) return 'Not available';
  return value.length > 8 ? value.slice(0, 7) : value;
}

function SummaryItem({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`trace-source-summary__item ${className}`.trim()}>
      <span className='trace-source-summary__label'>{label}</span>
      <div className='trace-source-summary__value'>{children}</div>
    </div>
  );
}

export const SourcePanel = ({
  source,
  total,
}: {
  source: TraceSource;
  total: number;
}) => {
  const title = total > 1 ? `SOURCE ${source.index + 1}` : 'SOURCE';

  if (source.isHelmRepository) {
    return (
      <Section
        title={title}
        description='Helm source context for this Application.'>
        <div className='trace-source-summary trace-source-summary--helm'>
          <SummaryItem label='Source type'>
            <strong>{source.sourceType}</strong>
          </SummaryItem>

          <SummaryItem label='Chart repository' className='trace-source-summary__item--wide'>
            <ExternalLink href={source.links.repository} title='Open chart repository'>
              {source.repositoryName}
            </ExternalLink>
            {source.source.repoURL && (
              <span className='trace-source-summary__secondary'>{source.source.repoURL}</span>
            )}
          </SummaryItem>

          <SummaryItem label='Chart'>
            <strong>{source.source.chart || 'Not available'}</strong>
          </SummaryItem>

          <SummaryItem label='Target version'>
            <code>{source.revision}</code>
          </SummaryItem>

          <SummaryItem
            label={
              source.deployedRevisionBasis === 'sync-status'
                ? 'Active chart version'
                : 'Last deployed chart version'
            }>
            {source.deployedRevision ? (
              <>
                <code>{source.deployedRevision}</code>
                <span className='trace-source-summary__secondary'>
                  {source.deployedRevisionBasis === 'sync-status'
                    ? 'Reported Synced by Argo CD'
                    : 'From status.history'}
                </span>
              </>
            ) : (
              <span className='trace-muted'>Not available</span>
            )}
          </SummaryItem>

          <SummaryItem label='Release name'>
            <strong>{source.source.helm?.releaseName || 'Default'}</strong>
          </SummaryItem>

          <SummaryItem label='Value files' className='trace-source-summary__item--wide'>
            <span>{source.source.helm?.valueFiles?.length ? source.source.helm.valueFiles.join(', ') : 'Default values'}</span>
          </SummaryItem>
        </div>
      </Section>
    );
  }

  return (
    <Section
      title={title}
      description='Git context for this Application.'
      action={
        <ExternalLink
          href={source.links.history}
          title='Open the commit history for this source path'>
          {source.source.path ? 'VIEW PATH HISTORY' : 'VIEW REVISION HISTORY'}
        </ExternalLink>
      }>
      <div className='trace-source-summary'>
        <SummaryItem label='Provider'>
          <strong>{source.provider}</strong>
        </SummaryItem>

        <SummaryItem label='Repository' className='trace-source-summary__item--wide'>
          <ExternalLink href={source.links.repository} title='Open repository'>
            {source.repositoryName}
          </ExternalLink>
          <span className='trace-source-summary__secondary'>
            {source.source.repoURL || source.repositoryUrl || 'Not available'}
          </span>
        </SummaryItem>

        <SummaryItem label='Revision'>
          <ExternalLink href={source.links.revision}>{source.revision}</ExternalLink>
        </SummaryItem>

        <SummaryItem label='Path' className='trace-source-summary__item--wide'>
          <ExternalLink href={source.links.path}>{source.source.path || '(root)'}</ExternalLink>
        </SummaryItem>

        <SummaryItem
          label={
            source.deployedRevisionBasis === 'sync-status'
              ? 'Active revision'
              : 'Last full deployment'
          }>
          {source.deployedRevision ? (
            <>
              <ExternalLink code href={source.links.commit}>
                {shortRevision(source.deployedRevision)}
              </ExternalLink>
              <span className='trace-source-summary__secondary'>
                {source.deployedRevisionBasis === 'sync-status'
                  ? 'Reported Synced by Argo CD'
                  : 'From status.history'}
              </span>
            </>
          ) : (
            <span className='trace-muted'>Not available</span>
          )}
        </SummaryItem>

        <SummaryItem label='Source type'>
          <strong>{source.sourceType}</strong>
        </SummaryItem>
      </div>
    </Section>
  );
};
