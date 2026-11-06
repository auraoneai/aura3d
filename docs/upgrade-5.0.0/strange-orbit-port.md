# Craterline GP (`strange-orbit-port`): 5.0.1 upgrade guide

Source: plan section 5.15 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-strange-orbit-port`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 41 custom hits; `shaders.ts` (GLSL, `#include <a3d_lights>`, `a3d_scene`), `materials.ts` (`CustomSpec`), `world.ts` (8 `material.custom`): track ribbon (`geometry.dynamic` + author attributes), solids, minerals, points, atmos, nebula, veil, rider-shadow; `?look=original|gouache` switch; `pixelRatio: 1` + `qualityProfile` comment at `main.ts:627-629`; `environments.neutral` x1.
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH for the gouache look (custom lighting math `HEMI_GAIN` calibrated to 4.6.1 exposure; `a3dSunShadowAuto` reads fully shadowed on the software runner, `materials.ts` comment).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A8 per-slot custom shader for the GLB riders (replaces re-materialing code in `world.ts`), A4 (L; start with `POINTS_*`, `VEIL_*`, `RIDER_SHADOW_*`, keep `track`/`mineral` GLSL), A6 verify motion blur + DoF
- [ ] note that `environments.neutral` is regenerated (S5-WP04-05): this is the first place a pixel shift will show

Verification

- [ ] GC, UT (the spec bake/compile test `materials.ts` is written to be unit-tested), CAP both looks
- [ ] `node tools/game-checks/run.mjs strange-orbit-port` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
