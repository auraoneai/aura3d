# Release Process

Version: 4.7.1

Current release: Aura3D 4.7.1.

Public claims and release wording are governed by `docs/project/product-studio-claim-registry.md`.

Date: 2026-10-15
Status: release-candidate process

The release process starts by choosing the release track. Package releases,
showcase releases, marketing launches, and benchmark/superiority claims have
different evidence requirements.

## Process

1. Select a track in `docs/project/release-tracks.md`.
2. Read `docs/project/status/current-state.md`, `docs/project/status/known-limits.md`, and
   `docs/project/claim-guidelines.md`.
3. Update `README.md`, package/template READMEs, route READMEs, and release
   docs so public copy matches the selected track.
4. Make the code or docs change.
5. Regenerate any generated docs, route-health files, screenshots, reports, or
   package artifacts affected by the change.
6. Run focused tests for the touched packages/routes.
7. Run the selected track's release gates from `docs/project/release/release-checklist.md`.
8. Review public copy against `docs/project/launch-positioning.md`.
9. Record evidence paths, command names, dates, and environment in release notes.
10. Do not widen claims beyond the evidence that passed.

## Package Track Commands

```sh
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:browser
pnpm build
pnpm verify:api-docs -- --write
pnpm verify:package-install-smoke:fresh
pnpm verify:package-provenance
npm pack --dry-run --json
node tools/release/publish-all.mjs --pack-only
node tools/release/consumer-build-smoke.mjs
```

Site deploys have two asset gates. `pnpm verify:asset-urls` runs at the end of the marketing build (it is part of `marketing/package.json` `build`, so Vercel fails the deploy) and checks that every asset URL a live game references exists in `marketing/dist` with the same size. After the deploy run `node tools/verify-asset-urls/index.mjs --base https://aura3d.auraone.ai` to HEAD every referenced URL on production (status, content type, size). 4.3.0 and 4.3.5 shipped four 404ing Teleoperator building models and a black 3D canvas because neither check existed (lessons-learned B9).

`consumer-build-smoke.mjs` is a required gate: it installs the packed tarballs into a temp project outside the
repository and runs a stock `vite build` and `vite dev` for the `mini-game`, `racing-starter`,
`falling-blocks-starter` and `product-viewer` templates plus a config-less `createAuraApp` hello-world, and fails
if a `node:*` import is reachable from the engine browser entry. It runs offline once the npm cache holds `vite`.

Run only the commands relevant to the selected package change for local
iteration. Run the full package gate before publishing.

For the current monorepo package release, use the repository publish helper
instead of ad hoc package commands:

```sh
NPM_CONFIG_USERCONFIG=/path/outside/repo/.npmrc node tools/release/publish-all.mjs --dry-run
NPM_CONFIG_USERCONFIG=/path/outside/repo/.npmrc node tools/release/publish-all.mjs
```

The npm token must live outside the repository. Do not commit `.npmrc` or print
the token in release logs.

## Showcase Track Commands

The exact command names may evolve, but the release run must generate or verify:

- source scan results for unsafe asset/rendering patterns;
- asset validation with durable source/license/provenance;
- route-health JSON for each promoted route;
- desktop and mobile screenshots;
- screenshot subject-readability checks;
- interaction/state checks for non-game routes;
- keyboard gameplay checks for game routes;
- copy review against `docs/project/claim-guidelines.md`.

Nonblank screenshots alone are not release evidence.
Route-primary, deploy, and gameplay proof are also not enough for public game
routes. Public racing and platformer examples require certified game geometry, pair composition, gameplay, automated visual QA, manual review, and deploy evidence. Turbo Drift Circuit and Skyline Runner require fresh evidence for that bounded chain and independent review of the exact 4.0.0 artifacts; prior automated receipts do not constitute that approval. The diagnostic proof routes remain non-public.

## Hosted Demo Deployment

Hosted demo claims require a durable public HTTPS origin and deployment checks.
Localhost, private URLs, reserved origins, and draft artifact URLs cannot be
used as public deployment evidence.

The release notes must record:

- the deployed URL;
- the build command;
- the deploy/check command;
- route/asset HTTP status checks;
- screenshot or route-health evidence generated from the hosted origin.

Use `docs/project/release/deployment-rollback.md` for rollback steps.

## Report Storage

Generated reports under `tests/reports/` are local/CI artifacts and may be
ignored by git. Public release notes must record how reports were regenerated and
where immutable release artifacts are attached or committed.

Checked-in summaries are acceptable only when they are explicitly tied to the
command that produced them and do not overstate the claim.

## Claim Review

Before public release, every claim must answer:

- What path does this claim apply to?
- Is it `proven`, `partial`, `prototype`, `internal`, `planned`, or `blocked`?
- Which command/test/screenshot/report proves it?
- Does the evidence import only public `@aura3d/engine` when the claim targets
  the root API?
- Does `docs/project/status/known-limits.md` list any limitation that narrows the claim?

If any answer is missing, keep the claim internal or prototype-only.
