# Apex Overdrive (`roadster-rush`): 5.0.1 upgrade guide

Source: plan section 5.2 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-roadster-rush`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 41 `material.custom`/GLSL hits across `src/main.ts` (13), `render/{wakes,decals,towers}.ts`, `art/{shield,sky,plume,ground}.ts`; no `looks.preset` (hand-built rig), hand-rolled sky parameters (`art/sky.ts`), 1 `effects.motionBlur`, `effects.volumetricFog`, lens flare; DOM HUD via `game.updateHud`.
- Effort and risk: S for wave 1 (verify), L for A4. Visual risk: medium (motion blur + custom shaders reading `a3d_lights`).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row, 5.0.3 pass)

- [x] A1 real boot progress: the `#boot` meter and percent label follow `createLoadingProgress` (scene build, `auraApp.ready()`, program warm-up) instead of a fixed 1.4 s animation over a static "100%" (`src/main.ts` `paintBootProgress`; frames `evidence/game-upgrades-503/roadster-rush/after-boot.png` when captured)
- [x] A6 motion blur (centered taps) and volumetric fog verified on real-GPU Chrome, default view unchanged and no new console errors: `evidence/game-upgrades-503/roadster-rush/{before,after}.png`
- [ ] A9 `camera.depth` log/reversed: no far-plane z-fighting seen in the 960x540 frames, so not a default. Lab flag `?depth=reversed|logarithmic` wired (default off, `labCameraOptions`); flagged frame not captured
- [ ] A10 wide gamut: lab flag `?gamut=p3` wired (default off); flagged frame not captured
- [ ] A3 backend: skipped. `art/sky.ts`, `art/ground.ts`, `render/towers.ts`, `render/decals.ts`, `render/wakes.ts`, `art/plume.ts` and the `main.ts` custom materials have no WGSL twin, so `?backend=` is deliberately not forwarded
- [x] A4 shield: paired GLSL + WGSL (`art/shield.ts`, `wgsl:` twin, unit test `tests/unit/roadster-rush-native/shield-portable.test.ts`). WebGL2 still draws the GLSL, so pixels are identical by construction; the WGSL half is NOT proven on a real WebGPU device
- [ ] A4 decals, wakes, plume: skipped. All three read `instanceMatrix` (instanced planes/cylinders); the documented `material.custom` WGSL contract (`AuraCustomMaterialSpec`) defines no instance-matrix inputs, so a WGSL twin cannot be written faithfully. Needs an engine contract (recorded as an engine issue)
- [ ] A4 sky, ground: left last by plan, untouched
- [x] A2 overlay (shared `?diag=1` panel wired in 5.0.2)
- [ ] A5, A7, A8, A11-A17: not in this game's plan row (no `looks.preset`, no imported-GLB re-materialing target, no text/physics/splat use); not applicable
- [ ] W-3/W-4: `environments.neutral` is not used by this game (HDRI look); nothing to pin

Verification

- [x] `node tools/game-checks/run.mjs roadster-rush`: 0 errors (2 pre-existing warnings: stale card poster, unchecked guide boxes)
- [x] `pnpm typecheck` in the game dir clean; `tests/unit/roadster-rush-native` 22/22 files pass (audio-wiring needs `--testTimeout=60000` on this loaded Mac: pre-existing 5 s flake)
- [x] Before/after frames: `evidence/game-upgrades-503/roadster-rush/` (REA capture_browser_scenario, 960x540, `?capture=1`, 11.5 s)
- [ ] Catalog digests refresh (parent, W-5)
