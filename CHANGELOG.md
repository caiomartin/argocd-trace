# Changelog

## Unreleased

- Adds English and Brazilian Portuguese documentation for installation,
  architecture, accuracy, security, contribution, support, and releases.
- Adds GitHub Actions CI for Node.js 22.12 and 24.
- Adds issue forms, a pull request template, Dependabot, and community health
  files for public contributions.
- Makes the Kubernetes patch namespace-neutral and the container build
  reproducible with Node 24 and `npm ci`.
- Updates development tooling to security-maintained Vite and Vitest releases.

## 1.8.0 — Information accuracy

- Uses only complete revision sets for multi-source Applications.
- Distinguishes active sync status from the latest retained history entry.
- Separates commit author metadata from the Argo CD Sync initiator.
- Labels a repeated historical revision as `revision restored` without assuming a Rollback action.
- Refuses historical comparisons when recorded render settings conflict with the current Application source configuration.
- Keeps pending comparisons visible when two revisions render identical manifests.
- Handles `PruneSkipped`, running hooks, invalid managed-resource JSON, API version migrations, and truncated aggregate counts accurately.
- Redacts Secret `data` and `stringData` values in both historical and live comparisons.
- Adds 21 automated regression tests for revision, operation, live-diff, and manifest-comparison behavior.
