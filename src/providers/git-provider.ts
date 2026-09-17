import {GitProviderName, SourceLinks} from '../models/trace';

const trimGitSuffix = (value: string): string => value.replace(/\.git$/, '');

export function toWebUrl(repoURL?: string): string | undefined {
  if (!repoURL) {
    return undefined;
  }

  const value = trimGitSuffix(repoURL.trim());
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const scpMatch = value.match(/^git@([^:]+):(.+)$/);
  if (scpMatch) {
    return `https://${scpMatch[1]}/${scpMatch[2]}`;
  }

  const sshMatch = value.match(/^ssh:\/\/git@([^/]+)\/(.+)$/);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  return undefined;
}

export function providerOf(repositoryUrl?: string): GitProviderName {
  if (!repositoryUrl) {
    return 'Git';
  }

  try {
    const host = new URL(repositoryUrl).hostname.toLowerCase();
    if (host.includes('gitlab')) {
      return 'GitLab';
    }
    if (host.includes('github')) {
      return 'GitHub';
    }
  } catch {
    // An internal URL can still be displayed even when provider detection fails.
  }

  return 'Git';
}

export function repositoryDisplayName(
  repositoryUrl?: string,
  fallback?: string
): string {
  const value = trimGitSuffix(repositoryUrl || fallback || '');

  try {
    const path = new URL(value).pathname.replace(/^\/|\/$/g, '');
    return path || value;
  } catch {
    const match = value.match(/[:/]([^/:]+\/[^/]+)$/);
    return match?.[1] || value || 'Not available';
  }
}

const encodePath = (value?: string): string =>
  String(value || '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

const joinUrl = (base: string, suffix: string): string =>
  `${base.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;


export function buildCompareUrl(
  repositoryUrl: string | undefined,
  baseRevision: string | undefined,
  targetRevision: string | undefined
): string | undefined {
  if (!repositoryUrl || !baseRevision || !targetRevision || baseRevision === targetRevision) {
    return undefined;
  }

  const provider = providerOf(repositoryUrl);
  const base = encodeURIComponent(baseRevision);
  const target = encodeURIComponent(targetRevision);

  if (provider === 'GitLab') {
    return joinUrl(repositoryUrl, `-/compare/${base}...${target}`);
  }

  if (provider === 'GitHub') {
    return joinUrl(repositoryUrl, `compare/${base}...${target}`);
  }

  return undefined;
}

export function buildLinks(
  repositoryUrl: string | undefined,
  revision: string,
  path: string | undefined,
  deployedRevision?: string
): SourceLinks {
  if (!repositoryUrl) {
    return {};
  }

  const provider = providerOf(repositoryUrl);
  const encodedRevision = encodeURIComponent(revision || 'HEAD');
  const encodedPath = encodePath(path);
  const encodedCommit = deployedRevision
    ? encodeURIComponent(deployedRevision)
    : undefined;

  if (provider === 'GitLab') {
    return {
      repository: repositoryUrl,
      revision: joinUrl(repositoryUrl, `-/tree/${encodedRevision}`),
      path: path
        ? joinUrl(repositoryUrl, `-/tree/${encodedRevision}/${encodedPath}`)
        : repositoryUrl,
      commit: encodedCommit
        ? joinUrl(repositoryUrl, `-/commit/${encodedCommit}`)
        : undefined,
      history: path
        ? joinUrl(repositoryUrl, `-/commits/${encodedRevision}/${encodedPath}`)
        : joinUrl(repositoryUrl, `-/commits/${encodedRevision}`),
    };
  }

  if (provider === 'GitHub') {
    return {
      repository: repositoryUrl,
      revision: joinUrl(repositoryUrl, `tree/${encodedRevision}`),
      path: path
        ? joinUrl(repositoryUrl, `tree/${encodedRevision}/${encodedPath}`)
        : repositoryUrl,
      commit: encodedCommit
        ? joinUrl(repositoryUrl, `commit/${encodedCommit}`)
        : undefined,
      history: path
        ? joinUrl(repositoryUrl, `commits/${encodedRevision}/${encodedPath}`)
        : joinUrl(repositoryUrl, `commits/${encodedRevision}`),
    };
  }

  return {repository: repositoryUrl};
}
