# Aura Links 3D (`aura-links-3d`): 5.0.1 upgrade guide

Source: plan section 5.10 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-aura-links-3d`, sports). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: water shaders (`game/water.ts` 2 hits, `src/main.ts` 1), `scatterInDisc` x2 + `scatter` x10 hand-rolled course dressing, 7 `looks.*` calls, 14 GLB, `instances.model` x7, `effects.depthOfField`, `game.accessibility`, many `text3D` signs (`src/main.ts:513,988`).
- Effort and risk: M-L. Visual risk: medium (water, fog, depth of field).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A4 water to shader graph (best A4 case: also unlocks WebGPU for the whole game)
- [ ] A12 `splitScatterByDistance` + `mergeStatic` to cut draw calls (M, changes placement unless the same seed/stream is replayed: evaluate by diffing placements in a unit test before switching)
- [ ] A9 `camera.depth` log only if far-course flicker exists
- [ ] A13 KTX2 for course textures if bundle budget exceeded
- [ ] A1 (14 GLB)

Verification

- [ ] GC, UT, CAP
- [ ] before/after draw-call count via A2
- [ ] `node tools/game-checks/run.mjs aura-links-3d` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
