# Security policy

## Supported versions

| Version | Security fixes |
| ------- | -------------- |
| `1.8.x` | Supported      |
| `< 1.8` | Not supported  |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's **Report a vulnerability** option in the repository Security tab.
Include:

- affected version and Argo CD version;
- impact and realistic attack scenario;
- minimal reproduction steps;
- relevant logs or payloads with credentials and private infrastructure data
  removed;
- any proposed mitigation.

Maintainers will acknowledge a complete report, investigate it, and coordinate
disclosure and a fix when the issue is confirmed. No response-time guarantee is
made for this volunteer-maintained project.

## Security model

Trace executes in the Argo CD browser origin and uses the signed-in user's
session. It does not contain a backend or receive Kubernetes/Git credentials.
Secret `data` and `stringData` values are redacted by the extension, but Argo CD
RBAC and browser access controls remain the primary security boundary.
