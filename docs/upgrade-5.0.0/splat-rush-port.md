# Splat (`splat-rush-port`): 5.0.1 upgrade guide

Source: plan section 5.16 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-splat-rush-port`, platformer). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 46 custom hits (`world.ts` 11, `pickups.ts` 2, 9 `glsl:` blocks); hand-rolled particle pool (`sim.ts:167` `this.particles.push`, `world.ts:867,1070-1073` `particles.setTone/place/collapse` through instanced nodes); hand-built sky stages (`sky.stages`, `sky.cirrus`); `environments.neutral` + `hdri`; `effects.outline`; `pixelRatio` x6 (`quality` ladder).
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH (neutral environment regenerated, bespoke GLSL).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

5.0.3 pass (full row, item by item):

- [x] A1 loading/readiness UI: shared `createLoadingProgress` drives a bar under PLAY NOW until programs are warm (`examples/splat-rush-port/main.ts` boot, `index.html`, `apps/showcase-splat-rush-port/index.html`); evidence `evidence/game-upgrades-503/splat-rush-port/{before,after}.png` (same look, no console regressions; the bar is only on screen during boot so it is not visible in the settled frames)
- [x] A2 diagnostics: already wired (`?diag=1` via `apps/showcase-port-shared/diag`), no change needed
- [x] A3 backend and A10 wide gamut: lab flags `?backend=` / `?gamut=` already default-off (5.0.2); stay EXPERIMENTAL, not default
- [x] A6 verify outline: ink outline, bloom, grade, vignette render correctly in the 5.0.3 frame (`after.png`); no code change needed
- [ ] Particle pool to `effects.particles`: skipped. Sim-owned particles (`sim.ts` pool, seeded, replay-tested) are posed per frame with per-particle tone/collapse through the batch; an emitter-driven effect cannot take externally simulated poses, so it would change what the player sees on a replay and add a second particle system. No visible gain.
- [ ] A4 shader-graph port of the splat/toon/sky GLSL: skipped. Not one of the three designated pilots (last-train-port, silt-and-signal-port water, roadster-rush); GLSL stays and is WebGL2-only.
- [ ] A5 lighting (probe grid, IES, projected spot, clustered, voxel GI), A7 workers, A9 depth, A11 add-ons, A12 scatter/merge, A13 KTX2, A14 formats, A16 physics, A17 splats/volumes: skipped. The look is bespoke toon GLSL that does not read engine light probes or photometric data (no visible effect), the GLBs are standard PBR props (no hand-rolled re-materialing, so A8 does not apply), and the rest are EXPERIMENTAL or have no use here.
- [ ] W-4 neutral environment pin: not done. No 4.x build was available to prove drift; `game-checks` look-identity and luma-band pass on the current look, so no pin was applied.

Verification

- [x] GC (0 errors), UT (`tests/unit/splat-rush-port` 122 passed), CAP (`evidence/game-upgrades-503/splat-rush-port/`)
- [x] `node tools/game-checks/run.mjs splat-rush-port` clean (0 errors, 2 pre-existing warnings)
- [x] Before/after frames attached (evidence/game-upgrades-502/splat-rush-port/{before,after}.png, 960x540 headless capture, autostart+autopilot)
