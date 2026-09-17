# Installation and troubleshooting

## Requirements

- Argo CD `3.2.12` for the currently validated runtime.
- Access to patch the `argocd-server` Deployment.
- Node.js `22.12+` and npm for source builds, or Docker for container builds.
- A shared `/tmp` volume in `argocd-server` (the standard manifests use a
  volume named `tmp`).

Argo CD discovers JavaScript files in `/tmp/extensions` when their filenames
match `extension*.js`. The provided init container copies
`extension-trace.js` into that directory before the server starts.

## Build options

### Reproducible container build

```bash
docker build -f Dockerfile.build -t argocd-trace:v1.8.0 .
```

This uses Node 24 and `npm ci` in the build stage, then copies only the bundle
into a non-root BusyBox installer image.

### Build locally

```bash
nvm use
npm ci
npm run check
docker build -t argocd-trace:v1.8.0 .
```

The default `Dockerfile` packages the already-built `dist/extension-trace.js`.

## Load a local image

For kind:

```bash
kind load docker-image argocd-trace:v1.8.0 --name kind
```

For another local cluster, use its image-loading mechanism or push the image
to a registry and replace `image: argocd-trace:v1.8.0` in the patch.

## Patch argocd-server

```bash
export ARGOCD_NAMESPACE=argocd

kubectl patch deployment argocd-server \
  -n "$ARGOCD_NAMESPACE" \
  --type strategic \
  --patch-file k8s/argocd-server-patch.yaml

kubectl rollout status deployment/argocd-server \
  -n "$ARGOCD_NAMESPACE"
```

If your Deployment or Helm chart uses a different `/tmp` volume name, adjust
the `volumeMounts[].name` in the patch before applying it.

## Verify

```bash
kubectl get pods -n "$ARGOCD_NAMESPACE" \
  -l app.kubernetes.io/name=argocd-server

kubectl logs -n "$ARGOCD_NAMESPACE" \
  deployment/argocd-server \
  -c install-trace

kubectl exec -n "$ARGOCD_NAMESPACE" \
  deployment/argocd-server \
  -c argocd-server -- \
  ls -l /tmp/extensions/extension-trace.js
```

Expected installer output:

```text
Trace installed at /tmp/extensions/extension-trace.js
```

Then perform a hard refresh in the browser, open an Application, select its
resource details, and choose **Trace**.

## Remote registry

Tag and push the image to your registry:

```bash
docker tag argocd-trace:v1.8.0 REGISTRY/OWNER/argocd-trace:v1.8.0
docker push REGISTRY/OWNER/argocd-trace:v1.8.0
```

Update the image field in `k8s/argocd-server-patch.yaml`. Configure an
`imagePullSecret` on the Argo CD service account when the registry is private.

## RBAC behavior

Trace calls the Argo CD API with the current browser session. A user needs the
same Application read permissions required by the equivalent Argo CD UI/API
views. Resolving an ApplicationSet/App-of-Apps chain can require listing or
reading additional Applications; when that is denied, Trace marks the
hierarchy as partial instead of inventing a parent.

## Troubleshooting

### The Trace tab is missing

1. Confirm the init container completed successfully.
2. Confirm `/tmp/extensions/extension-trace.js` exists in `argocd-server`.
3. Verify the filename starts with `extension` and ends in `.js`.
4. Hard-refresh the browser and inspect its console for extension load errors.
5. Confirm the viewed resource is `argoproj.io/Application`.

### The init container cannot find the image

- Load it into the local cluster or publish it to a registry.
- Confirm the tag in the patch matches the built tag.
- Use `imagePullPolicy: Always` for mutable remote tags, or immutable version
  tags/digests for production.

### A section says data is unavailable

- Inspect the browser Network tab for the failing `/api/v1/applications/...`
  request.
- Check Argo CD RBAC for Application read/list permissions.
- Confirm the Application has complete revision history for every source.
- Read [Accuracy model](accuracy.md); some comparisons are intentionally
  refused rather than shown with misleading data.

### A new bundle is not visible

Restart `argocd-server` so the init container copies the current bundle, then
hard-refresh the browser. Prefer immutable image tags in shared environments.
