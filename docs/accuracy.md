# Accuracy model and limitations

Trace prefers an explicit unavailable or partial state over a confident but
unsupported conclusion.

## Revision terminology

| Term              | Meaning in Trace                                                                 |
| ----------------- | -------------------------------------------------------------------------------- |
| Target revision   | The branch, tag, chart version or symbolic value configured in `spec`            |
| Active revision   | Complete revision set from `status.sync`, when available                         |
| Deployed revision | A complete full-deployment entry from `status.history`                           |
| Revision restored | A revision appears, another revision follows it, then it appears again           |
| Rollback          | Not asserted from history alone; the same sequence can result from a normal Sync |

For multi-source Applications, a revision set is usable only when it has
exactly one non-empty revision for each configured source. Incomplete history
entries are counted and omitted.

## Desired versus deployed

Trace performs a normal Application refresh before choosing comparison
revisions. This allows `status.sync.revision(s)` to reflect the newest revision
detected for the configured target revision.

An `OutOfSync` desired revision does not replace the last successful deployed
revision. Selective syncs are identified from the operation resource list and
are not presented as a completed full deployment.

## Historical rendering limitation

The Argo CD 3.2 manifests endpoint can override revisions but cannot recreate
arbitrary historical source settings. Therefore:

- if a history entry records source settings that conflict with the current
  spec, Trace refuses the historical comparison;
- if historical source settings are absent, Trace can compare with the current
  settings but displays a warning;
- a revision change that renders identical Kubernetes objects remains visible
  and is described as an identical render, not “no deployment”.

## Operation identity

Commit authors come from revision metadata. Sync initiators come from
`operationState.operation.initiatedBy` or deployment history. They are shown as
separate fields because the person who authored a commit is not necessarily the
person or automation that synchronized it.

A failed attempt at an older revision is not classified as a restored revision.
The label is used only when completed deployment history supports it.

## Current drift

Current differences use Argo CD's managed-resources response. Invalid JSON is
reported as unavailable; it is never converted into a missing or prune result.
Hooks and `PruneSkipped` resources preserve their operation context.

The UI caps current field differences at 120. A truncation marker is displayed
when more exist, so the visible count is not presented as the total.

## Rendered-manifest changes

Rendered changes are compared by Kubernetes identity: API group, kind,
namespace, and name. Limits protect the browser:

| Item                          |             Limit |
| ----------------------------- | ----------------: |
| Changed resources displayed   |               200 |
| Field changes per resource    |                50 |
| Display value                 |    240 characters |
| Stored full manifest per side | 12,000 characters |
| Manifest response cache       |        20 entries |

Each exceeded limit produces a truncation indicator or aggregate count; it is
not silently represented as a complete list.

## Secret handling

For Kubernetes `Secret` objects, values under `data` and `stringData` are
replaced with `<redacted>` in both live and historical comparisons. Redaction
happens before values or full manifests enter the in-memory comparison cache.

This safeguard reduces accidental exposure but does not replace Argo CD RBAC,
browser security, or secret-management controls.

## Known boundaries

- Runtime compatibility is currently validated only with Argo CD `3.2.12`.
- Trace reports the data retained by Argo CD; pruned history cannot be rebuilt.
- Git-provider links are derived from repository URLs and support GitHub and
  GitLab patterns. Trace does not query those providers.
- Hierarchy can be partial when the signed-in user cannot list or read parent
  Applications.
- All caches are browser-memory only and disappear on page reload.
