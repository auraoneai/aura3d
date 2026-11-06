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

Adoption (5.0 adoption row)

- [ ] A6 verify motion blur (centered-tap change) and volumetric fog
- [ ] A9 `camera.depth` log/reversed only if far-plane z-fighting is observed (flag, EXPERIMENTAL)
- [ ] A3 not possible until the 7 GLSL sources have WGSL twins (A4)
- [ ] A4 candidates in order: `decals.ts`, `wakes.ts`, `plume.ts`, `shield.ts` (small unlit/additive), leave `sky.ts`/`ground.ts` for last
- [x] A2 overlay (shared `?diag=1` panel wired; default view unchanged; before/after frames in `evidence/game-upgrades-502/roadster-rush/`)

Verification

- [ ] GC, UT, CAP
- [ ] for A4 paired frames per shader
- [ ] `node tools/game-checks/run.mjs roadster-rush` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
