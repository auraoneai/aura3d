# Release Process

Version: 1.0.0

## Process

Current release state: `benchmark/results/round-12-decision.md` is a no-ship
decision. The Round 13 amendment/sign-off files are approved for a
`PRD-AMENDMENT:` repair commit, but Round 13 still has no passing prompt
benchmark result. Do not publish or tag a public release from this state.

1. Make code and docs changes.
2. Regenerate generated docs or reports that are affected by the change.
3. Run focused tests for the affected packages/routes.
4. Run broader gates before publishing public claims.
5. Run the final proof pipeline in
   `docs/project/final-proof-release-readiness.md`.
6. Update release notes to cite the passing benchmark result files.
7. Run the release-proof guard for the passing round before publishing:
   `pnpm check:release-proof <round-number>`.
8. Keep release notes and public copy narrower than the evidence.

## Useful Commands

```sh
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:browser
pnpm build
pnpm verify:api-docs -- --write
pnpm verify:package-install-smoke:fresh
pnpm verify:package-provenance
pnpm verify:release:quick
pnpm verify:release
pnpm check:release-proof <round-number>
```

The competitive proof commands are not package scripts. They are the frozen
benchmark procedure in `FinalizedPromptPlan.md`, `benchmark/protocol.md`,
`benchmark/runner/README.md`, `benchmark/scoring/README.md`, and
`benchmark/engine/README.md`.

## Hosted Demo Deployment

The checked-in hosted demo path is the manual GitHub Pages workflow in `.github/workflows/public-demo-deploy.yml`. It builds the versioned external static demos with `pnpm build:external-demos`, smokes the static export with `pnpm verify:static-demo-server-smoke`, uploads the artifact from `release-artifacts/external-demos/<version>`, deploys it with GitHub Pages, and verifies the public URL with `pnpm verify:public-demo-deployment`.

The public deployment verifier requires `A3D_PUBLIC_DEMO_URL` to be a durable public HTTPS URL. Localhost, private, reserved, or placeholder origins are rejected.

No Docker, Docker Compose, Vercel, Netlify, Render, Fly.io, Railway, Cloudflare Workers/Wrangler, or env-example deployment path is checked in. The `marketing/` app is a separate local Vite app with `pnpm dev`, `pnpm build`, and `pnpm preview`, but it has no checked-in hosting workflow.

## CI Caveat

Some older non-release GitHub workflows still contain stale commands or copy,
including `pnpm test:coverage`, `pnpm lint`, and `pnpm test:bench`. Those do
not match the current root package scripts. Treat the commands in this document
and `docs/project/release-checklist.md` as the current release command set
until those workflows are updated.

The release workflow itself runs `tools/release-proof-guard.mjs` before publish.
That guard intentionally blocks npm/GitHub release creation unless the selected
round has prompt, engine, and decision result files, the decision file contains
a standalone `Decision: ship` line with user signature, `REMAINING.md` tasks 12
and 17 are checked, and `CHANGELOG.md` cites the passing result files without
contradictory failed/no-ship wording for that round. Without an explicit round
argument, the guard evaluates the latest decision round rather than falling
back to an older passing round. While Task 12 is still open, the guard must
fail. Local release operators can run the same guard with
`pnpm check:release-proof <round-number>`.

## Report Storage

Generated reports stay local under `tests/reports/`, which is ignored by git. The release source of truth is the documented command sequence, and CI or release operators must regenerate the reports during the release run. Release notes should record the command, date, and run context that produced the evidence instead of implying that JSON report artifacts are checked in.

Small checked-in summaries can be added later if the release process needs immutable review artifacts, but the current policy is regenerated local/CI evidence plus release-run logs or attached artifacts outside the repository.

## Rollback

Use `docs/project/deployment-rollback.md` for hosted demos or package artifacts. A local build is not enough evidence for a public deployment claim.

Release wording and public-claim boundaries are governed by
`docs/project/final-proof-release-readiness.md` and
`docs/project/product-studio-claim-registry.md`.
