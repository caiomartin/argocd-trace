# Navigator → Trace migration

The extension was renamed from **Argo CD Navigator** to **Argo CD Trace**.

## User-facing extension

- Tab label: `Navigator` → `Trace`
- Main component: `Navigator` → `Trace`
- CSS namespace: `navigator-*` → `trace-*`

## Build artifact

- `extension-navigator.js` → `extension-trace.js`
- Vite library name: `ArgoCdNavigator` → `ArgoCdTrace`

## Container

- Image: `argocd-navigator` → `argocd-trace`
- Init container: `install-navigator` → `install-trace`
- Runtime path: `/opt/navigator` → `/opt/trace`

## Optional annotations

New keys use:

```text
trace.argocd.io/*
```

The old keys remain readable for backward compatibility:

```text
navigator.argocd.io/*
```

## kind update

```bash
export ARGOCD_NAMESPACE=argocd

docker build -t argocd-trace:v1.8.0 .
kind load docker-image argocd-trace:v1.8.0 --name kind
kubectl set image deployment/argocd-server \
  -n "$ARGOCD_NAMESPACE" \
  install-trace=argocd-trace:v1.8.0
kubectl rollout status deployment/argocd-server -n "$ARGOCD_NAMESPACE"
```
