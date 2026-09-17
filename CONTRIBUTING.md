# Contributing to Argo CD Trace

Thanks for helping make deployment information more accurate and useful.

## Before opening an issue

- Search existing issues.
- Use the bug form for incorrect or failing behavior.
- Use the feature form for a new capability or presentation change.
- Remove repository URLs, cluster names, tokens, Secrets, and other sensitive
  data from screenshots and payloads.
- For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a
  public issue.

## Development setup

Requirements:

- Node.js `22.12+` (Node `24` recommended; `.nvmrc` is included).
- npm `10+`.

```bash
git clone https://github.com/caiomartin/argocd-trace.git
cd argocd-trace
nvm use
npm ci
npm run check
```

Use `npm run dev` for a local Vite build loop and `npm run test:watch` while
changing service logic. The production bundle is `dist/extension-trace.js`.

## Project map

| Path             | Responsibility                                      |
| ---------------- | --------------------------------------------------- |
| `src/components` | React presentation and user states                  |
| `src/services`   | Argo CD API reads and interpretation rules          |
| `src/providers`  | Git-provider URL handling                           |
| `src/models`     | Minimal Argo CD and Trace types                     |
| `src/styles`     | Embedded extension styles                           |
| `k8s`            | Installation patch                                  |
| `docs`           | Architecture, accuracy and operations documentation |

## Accuracy requirements

Changes that interpret Argo CD state must preserve these rules:

1. Do not infer a successful deployment from an attempted or running operation.
2. Do not infer the Rollback API from a repeated revision.
3. Do not mix Git authors with Sync initiators.
4. Require complete revision sets for multi-source comparisons.
5. Report unavailable/partial data explicitly.
6. Redact Secret values before display or caching.
7. Make every truncation visible to the user.

Add or update tests for changes to revision selection, operation
classification, live differences, manifest comparison, or hierarchy.

## Pull request workflow

1. Fork the repository and create a focused branch.
2. Make the smallest coherent change.
3. Add tests and documentation when behavior changes.
4. Run `npm run check`.
5. Complete the pull request template and explain the data source behind any
   new displayed value.

Conventional Commit-style subjects are recommended, for example:

```text
fix: keep incomplete multi-source history out of comparisons
feat: show partial hierarchy reason
docs: clarify installer image workflow
```

Maintainers may ask for a smaller scope, additional fixtures, or wording that
avoids conclusions unsupported by Argo CD data.

## Generated artifact

`dist/extension-trace.js` is intentionally tracked because it is the file
consumed by the lightweight runtime image. Rebuild it whenever source changes:

```bash
npm run build
```

## License

By submitting a contribution, you agree that it is licensed under the Apache
License 2.0 used by this repository.
