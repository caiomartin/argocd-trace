# Release process

## Prepare

1. Create a release branch.
2. Update the version in `package.json` and `package-lock.json`.
3. Move relevant entries from `Unreleased` into a dated changelog section.
4. Update image tags in examples when the minor/major version changes.
5. Run:

```bash
npm ci
npm run check
npm audit --omit=dev
docker build -f Dockerfile.build -t argocd-trace:VERSION .
```

6. Test the bundle in the currently supported Argo CD version.

## Publish

Merge the release pull request, then create and push an annotated tag:

```bash
git switch main
git pull --ff-only
git tag -a vVERSION -m "Argo CD Trace vVERSION"
git push origin vVERSION
```

Create a GitHub Release from the tag with generated notes reviewed against the
changelog. Attach `dist/extension-trace.js` and, when container publishing is
configured, publish an immutable image tag and digest.

## Verify

- Download the release artifact and compare its checksum with the local build.
- Deploy the immutable image to a test Argo CD instance.
- Confirm source, operation, live differences, manifest changes, history, and
  hierarchy sections load.
- Publish any compatibility change in the README.
