import {ArgoApplication} from '../models/trace';

function applicationUrl(app: ArgoApplication): string {
  const appName = app.metadata?.name;
  if (!appName) throw new Error('Application name is unavailable.');

  const params = new URLSearchParams();
  params.set('refresh', 'normal');

  if (app.metadata?.namespace) {
    params.set('appNamespace', app.metadata.namespace);
  }

  if (app.spec?.project) {
    // `project` is retained by the Argo CD API for backwards compatibility.
    params.set('project', app.spec.project);
  }

  const endpoint = `api/v1/applications/${encodeURIComponent(appName)}`;
  const url = new URL(endpoint, document.baseURI);
  url.search = params.toString();
  return url.toString();
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {message?: string; error?: string};
    return payload.message || payload.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}



function applicationReadUrl(name: string, namespace?: string): string {
  const params = new URLSearchParams();
  if (namespace) params.set('appNamespace', namespace);

  const endpoint = `api/v1/applications/${encodeURIComponent(name)}`;
  const url = new URL(endpoint, document.baseURI);
  url.search = params.toString();
  return url.toString();
}

export async function getApplication(
  name: string,
  namespace?: string,
  signal?: AbortSignal
): Promise<ArgoApplication> {
  const response = await fetch(applicationReadUrl(name, namespace), {
    method: 'GET',
    credentials: 'same-origin',
    headers: {Accept: 'application/json'},
    signal,
  });

  if (!response.ok) {
    throw new Error(`Unable to load Application “${name}”: ${await readError(response)}`);
  }

  return (await response.json()) as ArgoApplication;
}

export async function listApplications(
  signal?: AbortSignal
): Promise<ArgoApplication[]> {
  const url = new URL('api/v1/applications', document.baseURI);
  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: {Accept: 'application/json'},
    signal,
  });

  if (!response.ok) {
    throw new Error(`Unable to list Applications: ${await readError(response)}`);
  }

  const payload = (await response.json()) as
    | ArgoApplication[]
    | {items?: ArgoApplication[]};

  return Array.isArray(payload) ? payload : payload.items || [];
}
/**
 * Requests a normal Argo CD refresh and waits for the refreshed Application.
 * This makes status.sync.revision(s) reflect the newest revision detected in
 * the configured targetRevision before the Trace selects the comparison.
 */
export async function refreshApplication(
  app: ArgoApplication,
  signal?: AbortSignal
): Promise<ArgoApplication> {
  const response = await fetch(applicationUrl(app), {
    method: 'GET',
    credentials: 'same-origin',
    headers: {Accept: 'application/json'},
    signal,
  });

  if (!response.ok) {
    throw new Error(`Unable to refresh Application: ${await readError(response)}`);
  }

  return (await response.json()) as ArgoApplication;
}
