# Lamplight Line (`last-train-port`): 5.0.1 upgrade guide

Source: plan section 5.21 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-last-train-port`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 21 custom hits (smallest custom set among ports: `materials.ts` 4, `world.ts` 5), `sky.setUniform` x8 (hand-driven sky), rain via `weather.updateAttribute` x3, `pixelRatio: DPR` (`main.ts:525`), `resize: false`, `autoStart: false`; `environments.neutral` + `hdri`; imports only `@aura3d/engine/{audio,game}` and `game/art`.
- Effort and risk: S wave 1, M-L for A4 pilot. Visual risk: medium (neutral environment, rain particles).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A1 shared loading progress (`createLoadingProgress`, no visual change), B2 partial `AuraApp` cast removed (typed `app.info`/`diagnostics()`), lab flags `?backend=`/`?gamut=` via the shared parser, default OFF (5.0.2 lane, frames in `evidence/game-upgrades-502/last-train-port/`)
- [ ] A4 pilot game (fewest shaders; rain + sky + materials): skipped, EXPERIMENTAL portable-material rewrite risks pixels (D1/D4)
- [ ] A6 verify DoF/AO: not verified in this lane (no DoF/AO frames captured)

Verification

- [ ] GC, UT, CAP
- [ ] A4 pilot: pixel diff of each converted material vs the GLSL baseline on WebGL2 before enabling WebGPU
- [ ] `node tools/game-checks/run.mjs last-train-port` clean: no new errors; the pre-existing `art-direction` stale-audit error and the `screens-fresh` / unticked-items warnings remain
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
