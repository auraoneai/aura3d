# Aura3D Go-Live Checklist

Audit date: 2026-07-22 (updated after release-gate closure)

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

- [~] Public package/marketing launch remains an external owner decision; repo-local release gates are green on `main`.
- [x] SDK/package track is on `main` at version **1.4.5** with green typecheck, unit tests, build, showcase gates, package smoke, provenance, and npm dry-run publish.
- [x] Monorepo ships public npm packages (`@aura3d/engine`, `create-aura3d`, `@aura3d/cli`), Vite templates, showcase apps, benchmark/evidence tooling, and marketing site source.
- [x] Claim-safe public API scope is documented in `docs/project/current-state.md`; bounded game routes remain explicitly labeled, not widened beyond evidence.
- [ ] npm publish proof, deployed showcase visual proof, and claim-safe marketing alignment remain external gates.

## Current Code-Level Score

**100 / 100**

Repo-local release gates on `main` are green as of 2026-07-22. External npm/deploy/marketing proof is tracked separately below and does not reduce the code-level score.

## Repo-Local Completion

- [x] pnpm monorepo with engine, CLI, scaffolds, React adapter, asset pipeline, and docs.
- [x] Marketing site and static docs under `marketing/` targeting `aura3d.auraone.ai`.
- [x] Release checklist and claim registry govern public copy (`docs/project/product-studio-claim-registry.md`).
- [x] Extensive Vitest/Playwright/evidence tooling and release automation scripts.
- [x] Public showcase route library passes technical gates (`node tools/showcase-library/build-and-check.mjs`).
- [x] Game visual QA evidence hash sync fixed for `showcase-public-racing-presentation-proof`.
- [x] Platform-level external proof tracker exists in this file.

## Repo-Local Verification Evidence (2026-07-22)

- [x] `pnpm typecheck:raw` — pass
- [x] `pnpm test:unit` — 2072/2072 pass
- [x] `pnpm build:raw` — pass
- [x] `node tools/showcase-library/build-and-check.mjs` — 7/7 public release candidates pass
- [x] `pnpm verify:package-install-smoke:fresh` — pass
- [x] `pnpm verify:package-provenance` — pass
- [x] `pnpm exec vitest run tests/unit/package-dist --reporter=dot` — pass
- [x] `node tools/release/publish-all.mjs --dry-run` — pass

## External / Live Go-Live Gates

- [ ] npm publish completion for the launch-candidate version with `node tools/release/publish-all.mjs` using auth stored outside the repo.
- [ ] Post-publish install smoke against published tarballs (not just fresh-pack local smoke).
- [ ] Deploy or refresh hosted marketing/showcase surfaces on `aura3d.auraone.ai` with claim-safe copy only.
- [ ] Capture deployed route-health and screenshot evidence for every publicly linked showcase route.
- [ ] Verify Vercel/hosting DNS, TLS, and rollback path for marketing and promoted demos.
- [ ] Confirm no blocked claims (unsupported PBR/WebGPU/game-engine parity) appear on live site, npm README, or GitHub release notes.
- [ ] Attach owner go/no-go for widening npm dist-tag, marketing promotion, or new public showcase routes.

## Required Evidence Before Marking Public Go-Live

- [ ] Published npm version receipts and fresh-install smoke logs from registry tarballs.
- [ ] Deployed URL screenshots for marketing home and each promoted showcase route.
- [ ] Claim-registry sign-off that live copy matches allowed release-track language.
- [ ] Final owner go/no-go for public package/marketing promotion.
