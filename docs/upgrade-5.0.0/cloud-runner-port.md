# Cumulus Dash (`cloud-runner-port`): 5.0.1 upgrade guide

Source: plan section 5.25 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-cloud-runner-port`, platformer). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 52 custom hits (`world.ts` 15, `materials.ts` 11, `fx.ts` 1), `sky.rainbow/towers/sunDir` custom sky, `game.reducedMotion` handling (keep), `createLocomotion` x3, motion blur + DoF; example folder name carries a legacy brand (`kid-goku...`); only first-party visible text matters.
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A1 shared loading progress (loader text), B2 typed `app.quality` cast removed, lab flags `?backend=`/`?gamut=` wired default OFF via `apps/showcase-cloud-runner-port/src/lab.ts` (`?worker`/`?depth` not wired: no worker/camera seam touched)
- [ ] A4 limited (fx, sky): skipped. Cumulus Dash is not one of the three designated shader-graph pilots (last-train-port, silt-and-signal-port water, roadster-rush); no GLSL-vs-portable pixel-diff was run, so GLSL is kept (WebGL2-only, unchanged)
- [x] A6 verify motion blur taps: glider ride (`?chapterStart=200&qaglide=1`, QA-only param, default off) captured on 5.0.2 real GPU; frames `evidence/game-upgrades-503/cloud-runner-port/before-motion-blur-glide.png` and `after-motion-blur-glide.png`. Headless Chrome did not reach the High tier, so the blur chain itself did not render and the taps remain unproven; no visual change from this item
- [x] TEXTURE_FLIPY_DEGRADED: app-side workaround found. `texture.load(..., { flipY: false })` for the rock and grass maps (examples/kid-goku-beyond-the-clouds-port/main.ts) declares the pixels 4.x actually uploaded (WebGL ignores UNPACK_FLIP_Y for ImageBitmap), so the warning is gone (console in `after-motion-blur-glide` capture: 5 messages, no TEXTURE_FLIPY_DEGRADED; base: 6 with it). Pixels identical by construction
- [ ] A10 skip (plan says skip; not applicable)

Verification

- [x] GC (no new errors), UT (156 pass); CAP: title frame only, see evidence/game-upgrades-502/cloud-runner-port
- [x] `node tools/game-checks/run.mjs cloud-runner-port`: 1 pre-existing error (art-direction audit stale, unchanged vs origin/main), no new errors; tsc clean; 19 unit files / 156 tests pass
- [x] Before/after frames: `evidence/game-upgrades-503/cloud-runner-port/{before,after}.png` (title flyover, animated so camera moment differs) and `{before,after}-motion-blur-glide.png`; REA capture_browser_scenario, 960x540, real GPU headless Chrome
