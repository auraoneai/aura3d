# The Bellkeeper's Walk (`where-the-wind-wanders-port`): 5.0.1 upgrade guide

Source: plan section 5.23 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-where-the-wind-wanders-port`, arcade). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 62 custom hits (`world.ts` 31, `paper-pass.ts` post pass), `sky.setUniform` x6, `geometry.dynamic` x13, `createLocomotion` x4, `qualityProfile` x2, `?` paper-grain `effects.shaderPass`.
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH (paper pass reads depth/color; temporal rewrite).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [x] `environments.neutral`/`capture` exposure resolved (W-4): the game lights with `environments.hdri` (`valley ibl`, `world.ts:371`) and never names `environments.neutral`/`capture`, so there is nothing to pin; before/after frames at the title view match (`evidence/game-upgrades-503/where-the-wind-wanders-port/{before,after}.png`)
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A6: `paper-pass.ts` reconciled with the custom-pass input contract: declares exactly `inputs: ["color"]` (the display-tail input; `normal`/`velocity`/`reactive` are HDR-anchor only and would refuse at `after-tonemap`, so deliberately not requested), exports `paperScale`/`PAPER_PASS_NAME`, and `main.ts` now re-fits `u_paperScale` through `app.post.setPassUniform` on every canvas resize (before, the grain size was frozen at the boot canvas size). Test `tests/unit/where-the-wind-wanders-port/paper-pass.test.ts`; frames `evidence/game-upgrades-503/where-the-wind-wanders-port/{before,after}.png` (same view, no new console output). A "normal"-input rewrite of the paper was not done: the display tail cannot provide it and it would not change the look.
- [ ] A8 for hero (skipped, 5.0.3: the hero has no custom surface: it renders its own GLB materials with `materialOverrides` (`PAINTED_OVERRIDES.hero`), which is the stable path; a per-slot custom shader would be a new look, not a replacement of existing code, and `createHeroAnimator` is owned by lane/503-bugs)
- [ ] A4 for world shaders (L) (skipped, 5.0.3: not one of the three designated pilots, so by the 5.0.3 rule the GLSL stays and the game is marked WebGL2-only: `material.custom` GLSL in `shaders.ts`/`world.ts` plus the GLSL `paper-pass.ts` have no WGSL twin, so `?backend=` is not offered for this game)

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs where-the-wind-wanders-port` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
