import {
  ApplicationSource,
  ArgoApplication,
  TraceSource,
} from '../models/trace';
import {
  buildLinks,
  providerOf,
  repositoryDisplayName,
  toWebUrl,
} from '../providers/git-provider';
import {
  activeRevisionSet,
  applicationSources,
} from './revision-service';

export function annotation(
  app: ArgoApplication,
  name: string
): string | undefined {
  const annotations = app.metadata?.annotations || {};

  return (
    annotations[`trace.argocd.io/${name}`] ||
    annotations[`navigator.argocd.io/${name}`]
  );
}

function sourceAnnotation(
  app: ArgoApplication,
  sourceIndex: number,
  name: string
): string | undefined {
  const annotations = app.metadata?.annotations || {};

  return (
    annotations[`trace.argocd.io/source-${sourceIndex}-${name}`] ||
    annotations[`trace.argocd.io/${name}`] ||
    annotations[`navigator.argocd.io/source-${sourceIndex}-${name}`] ||
    annotations[`navigator.argocd.io/${name}`]
  );
}

function publicRepositoryUrl(
  app: ArgoApplication,
  source: ApplicationSource,
  sourceIndex: number
): string | undefined {
  return (
    sourceAnnotation(app, sourceIndex, 'repository-web-url') ||
    toWebUrl(source.repoURL)
  );
}

function normalizedDetectedSourceType(value?: string): string | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'helm') return 'Helm Chart';
  if (normalized === 'kustomize') return 'Kustomize';
  if (normalized === 'directory') return 'Directory';
  if (normalized === 'plugin') return 'Plugin';

  return value;
}

export function sourceType(
  source: ApplicationSource,
  detectedSourceType?: string
): string {
  if (source.chart) {
    return 'Helm repository';
  }

  const detected = normalizedDetectedSourceType(detectedSourceType);
  if (detected) {
    return detected;
  }

  if (source.plugin) {
    return 'Plugin';
  }
  if (source.helm) {
    return 'Helm Chart';
  }
  if (source.kustomize) {
    return 'Kustomize';
  }
  if (source.directory || source.path !== undefined) {
    return 'Directory';
  }
  return 'Unknown';
}

export function resolveSources(app: ArgoApplication): TraceSource[] {
  const sourceList = applicationSources(app);
  const activeRevision = activeRevisionSet(app);

  return sourceList.map((source, index) => {
    const deployedRevision = activeRevision.revisions[index];

    const repositoryUrl = publicRepositoryUrl(app, source, index);
    const revision = source.targetRevision || 'HEAD';
    const isHelmRepository = Boolean(source.chart);
    const detectedSourceType =
      sourceList.length > 1
        ? app.status?.sourceTypes?.[index]
        : app.status?.sourceType || app.status?.sourceTypes?.[0];

    return {
      index,
      source,
      provider: providerOf(repositoryUrl),
      sourceType: sourceType(source, detectedSourceType),
      repositoryUrl,
      repositoryName: repositoryDisplayName(repositoryUrl, source.repoURL),
      revision,
      deployedRevision,
      deployedRevisionBasis: deployedRevision
        ? activeRevision.basis
        : undefined,
      isHelmRepository,
      links: isHelmRepository
        ? {repository: repositoryUrl}
        : buildLinks(
            repositoryUrl,
            revision,
            source.path,
            deployedRevision
          ),
    };
  });
}

export function resolveOrigin(app: ArgoApplication): {
  type: string;
  name?: string;
} {
  const applicationSet = app.metadata?.ownerReferences?.find(
    owner => owner.kind === 'ApplicationSet'
  );

  if (applicationSet) {
    return {
      type: 'ApplicationSet',
      name: applicationSet.name,
    };
  }

  const parent = annotation(app, 'parent-application');
  if (parent) {
    return {
      type: 'App of Apps',
      name: parent,
    };
  }

  return {type: 'Standalone'};
}
