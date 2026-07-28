# Aura3D Go-Live Checklist

Audit date: 2026-07-23

Scope: `/Users/gurbakshchahal/platforms/aura3d` — browser-native TypeScript 3D SDK,
npm packages, showcase apps, marketing site, and release evidence.

Status legend: `[x]` complete from current repo-local evidence · `[ ]` open · `[~]`
partially complete or environment-dependent.

## Two-document model

| Owns | Document |
| --- | --- |
| **Release-candidate package/showcase gates** | `docs/project/release-checklist.md`, `docs/project/release-tracks.md` |
| **External npm/deploy/marketing proof** | **This file (`GoLiveCheckList.md`)** |

## Current Verdict

- [x] **The 2026-07-23 public developer-product distribution went live**: 26 npm packages resolved to
  version **1.4.5**, GitHub release `v1.4.5` is public, and
  `https://aura3d.auraone.ai` serves the production marketing/docs/showcase build.
- [x] This is an npm SDK, CLI, scaffold, documentation, and showcase launch. It is
  intentionally not classified as a hosted multi-tenant SaaS cutover.
- [x] Registry smoke, package provenance, public route health, desktop/mobile visual
  checks, promoted showcase canvas checks, DNS/TLS, and rollback evidence are recorded.
- [x] Claim-safe public API scope remains bounded by
  `docs/project/current-state.md`, `docs/project/known-limits.md`, and the automated
  claim registry.
- [~] **Current repo revalidation (2026-07-27) is held**: the focused retained
  racing visual-QA unit test has two failing assertions because its screenshot
  hash is stale. The historical publication and deployment receipts below are
  not evidence that the current worktree is release-ready.

## 2026-07-23 Go-Live Snapshot Score

**100 / 100**

Repo-local release gates and external production-distribution gates were green
for the recorded 2026-07-23 snapshot. This score is not the current worktree
verdict.

## Repo-Local Completion

- [x] pnpm monorepo with engine, CLI, scaffolds, React adapter, asset pipeline, and docs.
- [x] Marketing site and static docs under `marketing/` targeting `aura3d.auraone.ai`.
- [x] Release checklist and claim registry govern public copy (`docs/project/product-studio-claim-registry.md`).
- [x] Extensive Vitest/Playwright/evidence tooling and release automation scripts.
- [x] Public showcase route library passes technical gates (`node tools/showcase-library/build-and-check.mjs`).
- [x] Game visual QA evidence hash sync fixed for `showcase-public-racing-presentation-proof`.
- [x] Platform-level external proof tracker exists in this file.

## Repo-Local Verification Evidence (2026-07-23)

- [x] `pnpm typecheck:raw` — pass
- [x] `pnpm test:unit` — 328 files / 2,072 tests pass
- [x] `node tools/showcase-library/build-and-check.mjs` — 7/7 public release candidates pass
- [x] `pnpm check:marketing-truth` and `pnpm check:marketing-links` — pass
- [x] `pnpm verify:claims` — pass with 0 violations
- [x] `pnpm verify:package-provenance` — pass
- [x] `pnpm --dir marketing build` — pass
- [x] Published-package engine, `create-aura3d`, and CLI verification — pass against
  npm registry artifacts at version 1.4.5

These checked items are dated receipts. Current release promotion additionally
requires a fresh passing full unit suite and current performance evidence for
any performance/parity wording.

## External / Live Go-Live Gates

- [x] npm publication — 26/26 public packages resolve to `1.4.5`; representative
  launch packages use the `latest` dist-tag.
- [x] Post-publish registry smoke — published engine contents, generated fighting-game
  scaffold install/build/Playwright, and published CLI behavior pass.
- [x] Canonical Vercel marketing/showcase deployment — Ready and aliased to the
  branded domain.
- [x] Deployed route and screenshot evidence — 15/15 route probes return HTTP 200;
  10/10 desktop/mobile/showcase visual checks pass.
- [x] Promoted Aura Clash proof — 3/3 public aliases render a nonblank WebGL canvas,
  load both GLB fighter models and four audio assets, expose release 1.4.5, and respond
  to controls.
- [x] DNS/TLS/HTTPS — branded CNAME/A records resolve, certificate SAN matches,
  HTTP redirects to HTTPS, and HSTS is enabled.
- [x] Rollback — previous Ready deployment is retained and an exact alias rollback
  command is documented in `docs/project/deployment-rollback.md`.
- [x] Claim safety — `pnpm verify:claims` reports 0 violations after narrowing
  unsupported parity and validation wording.
- [x] Public promotion state — npm `latest`, a non-draft/non-prerelease GitHub release,
  and the production alias all point to the 1.4.5 launch track.

## Production Receipts (2026-07-23)

| Surface | Receipt |
| --- | --- |
| npm | 26/26 public packages resolve at version 1.4.5 |
| GitHub | Public `v1.4.5` release; 26 assets; published 2026-07-21 |
| Production deployment | `dpl_HbEsEz44zJSnu8R1zkvg2RmmXG9b` |
| Immutable deployment URL | `https://marketing-1q5qqbfdf-veerone.vercel.app` |
| Branded production URL | `https://aura3d.auraone.ai` |
| Rollback deployment | `dpl_6xp2zFcQ8ryLoFxfuKhReebzJzLg` |
| Route health | 15/15 public routes return HTTP 200 |
| Marketing/showcase visual proof | 10/10 checks pass; desktop and 390px mobile have no horizontal overflow |
| Aura Clash visual/runtime proof | 3/3 public routes pass canvas, resource, release, and interaction checks |
| Evidence bundle | `docs/project/production-evidence/2026-07-23/` |

## Required Evidence Before Marking Public Go-Live

- [x] Published npm version receipts and fresh-install smoke against registry artifacts.
- [x] Deployed URL screenshots for marketing home and every promoted showcase route.
- [x] Claim-registry verification that live copy matches allowed release-track language.
- [x] Public package/marketing promotion evidenced by npm `latest`, public GitHub release,
  and the branded production alias.
