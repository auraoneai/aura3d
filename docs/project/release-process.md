# Release Process

Version: 1.0.0

## Process

1. Make code and docs changes.
2. Regenerate generated docs or reports that are affected by the change.
3. Run focused tests for the affected packages/routes.
4. Run broader gates before publishing public claims.
5. Update `docs/project/threejs-superiority-status.md` with the actual generated report state.
6. Keep release notes and public copy narrower than the evidence.

## Useful Commands

```sh
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:browser
pnpm build
pnpm verify:api-docs -- --write
pnpm threejs-parity
pnpm superiority
```

## Report Storage

Generated reports stay local under `tests/reports/`, which is ignored by git. The release source of truth is the documented command sequence, and CI or release operators must regenerate the reports during the release run. Release notes should record the command, date, and run context that produced the evidence instead of implying that JSON report artifacts are checked in.

Small checked-in summaries can be added later if the release process needs immutable review artifacts, but the current policy is regenerated local/CI evidence plus release-run logs or attached artifacts outside the repository.

## Rollback

Use `docs/project/deployment-rollback.md` for hosted demos or package artifacts. A local build is not enough evidence for a public deployment claim.

Release wording and public-claim boundaries are governed by `docs/project/product-studio-claim-registry.md`.
