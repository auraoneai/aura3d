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
- [ ] `environments.neutral`/`capture` exposure resolved (W-4): not applicable, the shipped band and original looks use `environments.hdri` (neutral only under the `?fx=nohdri` debug switch), so no neutral pin is needed
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A1 shared loading progress (`createLoadingProgress`, no visual change), B2 partial `AuraApp` cast removed (typed `app.info`/`diagnostics()`), lab flags `?backend=`/`?gamut=` via the shared parser, default OFF (5.0.2 lane, frames in `evidence/game-upgrades-502/last-train-port/`)
- [x] A4 pilot game, pattern converted: the rain streaks (author `fade` attribute -> `uv0.x`, tint uniform, alpha) are now a portable shader-graph `material.node({ graph })` with GLSL + WGSL twins, default ON (`examples/last-train-port/materials.ts` `rainGraphSpec`, `world.ts` `RAIN_PORTABLE`; `?fx=rainglsl` keeps the GLSL baseline). Gate on real-GPU WebGL2 (Apple M4 Max, ANGLE Metal): portable vs GLSL max channel diff 0 (identical to the run-to-run dither noise floor of max 3), clear weather vs base build diff 0. Frames: `evidence/game-upgrades-503/last-train-port/{before,after}-a4-rain*.png`
- [ ] A4 remaining shaders: skipped. Sky dome and cloud sea (hash/fbm noise, `cameraPosition`, 8 `sky.setUniform` drivers) and the snow/mote points (`gl_PointSize`, `gl_PointCoord`, which graph builtins cannot express) stay GLSL and WebGL2-only; one pattern is the pilot scope
- [x] A6 verify DoF/AO: tilt-shift DoF and AO stay on in the band look; real-GPU WebGL2 frames (`after.png`, `after-a4-rain.png`) render with both, pixel-identical to the 5.0.2 build in clear weather; no new console errors (pre-existing DEPTH_ALPHA_HASH_DEGRADED / CONTACT_SHADOW_PARTIAL warnings unchanged)

Verification

- [x] GC, UT, CAP: `tests/unit/last-train-port` 21 files / 125 tests pass; capture via headless Chrome CDP on Apple M4 Max (REA `capture_browser_scenario` returns the PNG inline only, cannot be saved to a file)
- [x] A4 pilot: pixel diff of the converted rain material vs the GLSL baseline on WebGL2: max diff 0 (see above). WebGPU is not enabled for the game: sky, clouds and points have no WGSL twin
- [x] `node tools/game-checks/run.mjs last-train-port`: no new errors; the stale `art-direction` audit hash is refreshed (test rerun, committed); `screens-fresh` / unticked-items warnings remain
- [x] Before/after frames attached: `evidence/game-upgrades-503/last-train-port/` (capture: `?manual=1&title=0&fx=forcerain[,rainglsl][,nograin]`, 960x540)
