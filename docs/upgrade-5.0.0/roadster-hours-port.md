# Saltwind Highway (`roadster-hours-port`): 5.0.1 upgrade guide

Source: plan section 5.22 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-roadster-hours-port`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: **82 custom hits** (largest: `world.ts` 27, `materials.ts` 13, 13 `glsl:`, `art/post.ts` shaderPass), `scatterTransform` x5 + `scatter` x15, `geometry.dynamic` x10, vfx burst/trail, `pixelRatio` x6; Meshy sedan/bus assets with provenance (`assets/provenance/saltwind*Salt.meta.json`, touched in `ccdc9cfe7`).
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A8 per-slot custom shader on the vehicles (skipped: pixel risk on a HIGH-risk GLSL port, no shader rewrite)
- [ ] (skipped: changes placement/pixels) A12 scatter via root planner (same seed stream, test placement diff), A4 long-tail, A9 optional (long highway sight lines)

Verification

- [ ] GC, UT, CAP (UT: 27 files / 316 tests pass; typecheck clean; parent-owned CAP/GC not claimed)
- [ ] provenance sidecars must stay hash-consistent (`asset-provenance`, `S5-WP07-01`)
- [ ] `node tools/game-checks/run.mjs roadster-hours-port` clean (1 pre-existing error: stale `art/direction.audit.json`, untouched here; skipped)
- [x] Before/after frames attached: `evidence/game-upgrades-502/roadster-hours-port/{before,after}.png` (raw-CDP headless Chrome on Metal GPU, 960x540, 11 s settle, `?level=0&autostart=1&manual=1`; identical, no console errors beyond 404s)

5.0.2 stable adoption (wave 4): A1 shared loading helper wired in the app wrapper (`data-progress` on `#loading`, no visual change); W-8 lab flags `?backend=`/`?gamut=` wired, default OFF (`?backend=auto` currently fails with RENDERER_MOUNT_FAILED on WebGPU point depth for `plume-dust`: EXPERIMENTAL, recorded as engine issue). B2 partial AuraApp cast: none present in this game. A2 diagnostics: `?diag=1` already installed via `diag.ts`.
