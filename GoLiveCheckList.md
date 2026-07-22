# Aura3D Go-Live Checklist

Audit date: 2026-07-22

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

- [ ] Public package/marketing launch is not approved from this audit.
- [~] SDK/package track is mature on branch `release/1.4.5`; local checkout may diverge from `main`.
- [x] Monorepo ships 26 public npm packages (`@aura3d/engine`, `create-aura3d`, `@aura3d/cli`), Vite templates, showcase apps, benchmark/evidence tooling, and marketing site source.
- [~] Claim-safe public API scope is documented in `docs/project/current-state.md`; some renderer/game parity claims remain bounded or blocked.
- [ ] npm publish proof, deployed showcase visual proof, and claim-safe marketing alignment remain external gates.

## Current Code-Level Score

**88 / 100**

Weighted toward package maturity, test/evidence infrastructure, and showcase route health.
Capped because production renderer bridge parity, full PBR/HDR via root API, some game-route
visual quality gates, and live npm/deploy receipts are not fully closed.

## Repo-Local Completion

- [x] pnpm monorepo with engine, CLI, scaffolds, React adapter, asset pipeline, and docs.
- [x] Marketing site and static docs under `marketing/` targeting `aura3d.auraone.ai`.
- [x] Release checklist and claim registry govern public copy (`docs/project/product-studio-claim-registry.md`).
- [x] Extensive Vitest/Playwright/evidence tooling and release automation scripts.
- [~] Public showcase route library passes technical gates; some game-category visual quality reviews remain bounded.
- [ ] Platform-level external proof tracker did not exist before this audit; use this file going forward.

## Open Repo-Local Verification Items

- [ ] Confirm `release/1.4.5` (or chosen launch candidate) passes `docs/project/release-checklist.md` end-to-end.
- [ ] Run `pnpm verify:npm-release` and attach published-version smoke receipts for packages being promoted.
- [ ] Run showcase visual review for promoted routes (including bounded game routes such as Turbo Drift / Skyline Runner).
- [ ] Align `README.md`, `llms.txt`, route READMEs, and marketing copy to the selected release track only.
- [ ] Resolve or document any open items in `AURA3D_KILL_OR_REPAIR_AUDIT.md` before widening public claims.

## External / Live Go-Live Gates

- [ ] npm publish completion for the launch-candidate version with `node tools/release/publish-all.mjs` using auth stored outside the repo.
- [ ] Post-publish install smoke: `pnpm verify:package-install-smoke:fresh` against published tarballs.
- [ ] Deploy or refresh hosted marketing/showcase surfaces on `aura3d.auraone.ai` with claim-safe copy only.
- [ ] Capture deployed route-health and screenshot evidence for every publicly linked showcase route.
- [ ] Verify Vercel/hosting DNS, TLS, and rollback path for marketing and promoted demos.
- [ ] Confirm no blocked claims (unsupported PBR/WebGPU/game-engine parity) appear on live site, npm README, or GitHub release notes.
- [ ] Attach owner go/no-go for widening npm dist-tag, marketing promotion, or new public showcase routes.

## Required Evidence Before Marking Go-Live

- [ ] Green release-checklist commands on the launch candidate (`typecheck`, unit/integration/browser tests as applicable, `build`, package smoke).
- [ ] Published npm version receipts and fresh-install smoke logs.
- [ ] Deployed URL screenshots for marketing home and each promoted showcase route.
- [ ] Claim-registry sign-off that live copy matches allowed release-track language.
- [ ] Final owner go/no-go for public package/marketing promotion.
