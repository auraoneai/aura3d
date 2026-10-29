# Aura Diamond 3D (`aura-diamond-3d`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes (visual review only). Nothing breaks and no code edit is required. Skyline and Lunar Park are lit by the look's explicit neutral-room fill instead of the implicit one, which measured within 5% of 4.3.7 on a remote software-GL capture. Contact shadows are now a real screen-space mask that darkens only the sun's direct light, so the ground contact areas need a look-over. A small `exposureEv` retune is only needed if the on-screen comparison shows a problem.

## What this game uses

- Package pin: `apps/showcase-aura-diamond-3d/package.json` is already `4.5.0` (`@aura3d/engine: workspace:*`). `main.ts` also imports `@aura3d/debug` (`main.ts:51`), which is not in that package's `dependencies`; this predates 4.5.0 and is only noted here.
- Entry: `src/main.ts` (4156 lines), plus `src/batter-pose.ts` (grip/pose math from `@aura3d/engine/game`), `src/contact.ts`, `src/aura-assets.route.ts` (typed `assets.*`). Shared CSS only: `../showcase-port-shared/quickbar.css`. `showcase-port-shared/diag.ts` is not imported by this game.
- One `createAuraApp("#app", {...})` call at `main.ts:999-1003`: `scene`, `qualityRebuild: { flags: ["game","animation"] }`, `renderer: { quality: "high" }`. No top-level `quality`, `output` or `preserveDrawingBuffer`. `renderer.quality: "high"` is the renderer tier (`rendererOptions.ts:195`), separate from the top-level pipeline `quality` option (`renderPath.ts:138-150`), so the pipeline `quality` stays at the 4.5.0 default `"auto"`.
- Six ballparks built by `buildParkScene` (`main.ts:956-989`) and swapped with `app.setScene(...)` in `setPark` (`main.ts:1768-1772`). Look presets per park (`main.ts:190, 209, 228, 247, 266, 285`): sandlot `golden-hour`, skyline `night-city`, canyon `overcast`, ivy `outdoor-day`, dome `interior-industrial`, lunar `polar-night`. Each is `looks.preset(park.look, { fogDensityScale: 0, exposureEv: 0.10..0.16 })` (`main.ts:959-966, 977`).
- Scene effects: `effects.contactShadows({ intensity: 0.75, length: 0.3 })` (`main.ts:979`), `effects.vignette` (`main.ts:980`), `effects.lightCone` per floodlight (`main.ts:727`), `effects.trail` (`main.ts:929`), three `effects.particles` fountains (`main.ts:948-950`). Every look preset also expands to colorGrade, ambient occlusion and bloom nodes (`V0_EFFECTS` in `packages/engine/src/agent-api/looks/lookPresets.ts:60`, emitted in `looks.ts:333-349`).
- Lights: `lights.spot` floodlights (`main.ts:726`) plus the look's own shadow-casting directional key light (`looks.ts:303-311`, `shadow: true` at line 310). No `environments.*` node and no `output.exposure` is authored by the game; environments come only from the look presets. There are no ambient or hemisphere lights.
- Transparent material: `ball-shadow` cylinder with `opacity: 0.28` (`main.ts:928`).
- Primitives only with `name`, `size`, `material` (all valid options, `main.ts:537-946`). Many `model(...)` nodes with `.animate({ clip, loop, speed })` (`main.ts:704, 850, 882`) and runtime clip switching through `handle.setAnimation` / `crossFadeTo` / `play` (`main.ts:1090-1107`).
- Not used: `instances.*` (imported at `main.ts:28` but never called), `interactions.*`, physics, `playLayer`, masks, `addClipsFrom`, `Clock`, `AnimationClip`, `ShapeGeometry`, `SphericalHarmonics3`, scene kits, custom shaders, transmission, and canvas read-back in `src/` (no `readPixels`, `toDataURL`, `toBlob`, `drawImage`). One read-back does exist in a dependency: `installBlackFrameGuard()` from `@aura3d/debug` draws the canvas to a probe canvas (`packages/debug/src/safety/blackFrame.ts:244-245`). See "Changes that do not affect this game".
- Debug/QA: `installBlackFrameGuard()` (`main.ts:51, 59`), `installGameBeacon` (`main.ts:55`), `?park=`/`?mode=` URL params (`main.ts:3934-3936, 4138-4141`), `data-ready` on the canvas (`main.ts:3957`).

## What changes for this game in 4.5.0

### 1. Skyline and Lunar Park: the look's neutral-room fill replaces the implicit fill (change 3)

- What happens now: `night-city` (Skyline) and `polar-night` (Lunar Park) have no HDRI (`hdri: null`). `looks.preset` adds an `environments.neutral` fill for them at intensity 0.85 (`lookPresets.ts` `fill`, `looks.ts` `v0Children`).
- What it replaces: in 4.3.7 these two scenes had no environment node and no ambient light. The C-09 `prd02.neutral-room` source bound the neutral room probe at intensity 1, and that bright room is what the park art was tuned against. 4.5.0 removes that implicit room for scenes with authored lights and no `environments.*` node, so the look now supplies the same neutral room explicitly.
- Measured (remote software GL, 1280x720, steady state, `tests/browser/game-luma-capture.spec.ts`): Skyline mean luma 71.0 on 4.3.7, 74.5 on 4.5.0. Lunar Park 82.8 on 4.3.7, 86.1 on 4.5.0. The HDRI parks drift upward by a similar amount from the other 4.5.0 changes. An earlier 4.5.0 build that used the baked `night` probe as the fill read 2.6 and 5.1 here; it was fixed before release, and a guide written against it is wrong.
- Why the "authored lights and no environment renders darker" change does not hit this game: every look emits an environment node (an HDRI for the other four parks, the neutral fill for these two), so the lights-only branch (`compiler/environment.ts`, `implicitFill === false`) is never reached. There is no hemisphere light, so that change does not apply either. The game authors no `output.exposure`, and the `exposureEv` values only feed the look's colorGrade node (`looks.ts` colorGrade).
- Caveat: this describes the `v0` look expansion, which is what `looks.preset` produces unless every look-contract flag is on. With the `v1-contracts` expansion it returns a `look` node and the fill comes from a different path that was not checked here.
- What to do: capture before/after and compare. Only if Skyline or Lunar now looks clearly off, adjust the override at `main.ts:961` and `main.ts:965` (`exposureEv` 0.12 and 0.16).
- How to check: `?park=skyline&capture=1` and `?park=lunar&capture=1` screenshots against the 4.3.7 build (`main` branch), then `node tools/game-checks/run.mjs aura-diamond-3d`. `?capture=1` only keeps the drawing buffer readable for screenshots; it does not change the render path.

### 2. Contact shadows are now a real screen-space mask (change 8)

- What happens now: `effects.contactShadows({ intensity: 0.75, length: 0.3 })` at `main.ts:979` produces a screen-space mask that forward lighting samples in 4.5.0 (`packages/rendering/src/forward/contactShadowMaskStore.ts`, `packages/rendering/src/program/chunks/shadow_forward.glsl.ts:75`). The mask multiplies only the shadow-casting directional light's direct visibility; it never touches ambient, environment, spot or point light (`contactShadowMaskStore.ts:8-11`). So the floodlight spots (`main.ts:726`) are unaffected, and the night parks (key light intensity 0.5-0.7) will show a weaker effect than the day parks. Feet, bases, bat and ball contact areas lit by the sun can look darker or more defined than before.
- Requirement: a shadow-casting directional light. Every look preset adds one (`looks.ts:303-311`), so the effect should be available in all six parks. If it is not, 4.5.0 reports `diagnostics.unavailable` and one `console.warn` ("effects.contactShadows() has no visible effect: the scene has no shadow-casting directional light", `packages/rendering/src/passes/Prd02ContactShadowsContributor.ts:296-305`).
- What to do: no code change needed. If the ground looks too dark, reduce `intensity` (valid option, `packages/engine/src/agent-api/nodes/effects.lighting.ts:9-15`), for example `effects.contactShadows({ intensity: 0.5, length: 0.3 })`.
- How to check: console has no contact-shadow warning in each park (`setPark` rebuilds the scene, so switch through all six); compare a close-up of the batter's box.

### 3. Render path stays on HDR; bloom fusion (changes 1 and 7)

- What happens now: the scene carries post effects (look bloom/colorGrade/AO, `vignette`, `contactShadows`, `lightCone`, `trail`, `particles`) and a transparent material, and five of its six looks emit an `hdri` environment node, so `renderPathBlockers` (`packages/engine/src/agent-api/app/renderPath.ts:103-136`) keeps the HDR chain. Any one of these effects is enough to block the direct path. The game does not move to the direct path and the silhouette-edge difference (canvas MSAA) does not apply. Bloom fusion is allowed on `auto`; the default `renderer.bloomFusion` is `"separable"` (`app/rendererOptions.ts:256-264`), so the expected difference is within 1/255.
- What to do: nothing. To confirm, read the report in the console after boot.
- How to check: `app.diagnostics().renderPath` should report `path: "hdr-msaa"` and `quality: "auto"` (fields `path`, `quality`, `reason`, `bloomFusion`; `renderPath.ts:20, 172`). The game does not expose `app` globally (`auraApp` is local to `boot()` at `main.ts:997`), so add a temporary `console.log(app.diagnostics().renderPath)` after `main.ts:1005`. Remove it afterwards.
- Optional: for a bit-identical comparison against 4.3.7, load the page with `?aura3d-render=production` (URL override, `renderPath.ts:138-143`), or set `quality: "production"` in the `createAuraApp` options at `main.ts:999`. This restores the 4.3.7 pipeline byte-for-byte. It is not needed for normal use.

### 4. Ambient occlusion on devices without float linear filtering (change 9)

- What happens now: the look presets include `ambientOcclusion` (and bloom). On devices lacking float linear filtering (`OES_texture_float_linear`) the AO target is now point-sampled, so AO becomes visible where it did nothing before. Those devices will look slightly darker in crevices (stands, dugouts, base bags).
- What to do: no code change. Be aware that a baseline screenshot taken on a device without float filtering will differ from one taken on a device that has it.
- How to check: compare the same park on a device with and without `OES_texture_float_linear` (check `gl.getSupportedExtensions()` in the browser console). There is no engine diagnostic field for this that was verified; the effect is capability-based, so it only shows up on such hardware.

### 5. Per-frame cost and shadow cascade skipping (changes 6 partial, 13)

- What happens now: `getError` is sampled instead of called every frame (default `sampled`, `packages/rendering/src/WebGL2Device.ts:117-119`), which lowers per-frame CPU cost slightly. Shadow cascades that no receiver selects are skipped on `auto`/`cinematic` (this game is `auto`), which can reduce shadow draws in the stadium. The instancing parts of change 6 do not apply (no `instances.*`).
- What to do: nothing. Re-measure draw calls only if you track a budget.
- How to check: compare `app.diagnostics()` draw-call counts in 4.3.7 and 4.5.0 on `?park=dome`; `node tools/game-checks/run.mjs aura-diamond-3d`.

## Changes that do not affect this game

- Change 2, `preserveDrawingBuffer` default false: the game's own `src/` reads no pixels (no `readPixels`/`toDataURL`/`toBlob`/`drawImage`, no `app.capture`/`screenshot`). `installBlackFrameGuard` does read the canvas (`packages/debug/src/safety/blackFrame.ts:244-245`), but only from a microtask queued right after the draw (`packages/debug/src/safety/frameTap.ts:1-8`; `blackFrame.ts:221-222`), so it still sees the finished frame with the buffer not preserved. Only external tooling is affected: `tools/filmstrip/capture-films.mjs` comments that its `toDataURL` path relied on a preserved buffer (lines 9, 122, 171), so add `?capture=1` there if it ever falls back from CDP capture.
- Change 4, OPTION_IGNORED: every `primitives.*` call passes only `name`, `size`, `material` (all in `PRIMITIVE_OPTION_KEYS`, `packages/engine/src/agent-api/nodes/primitives.ts:57-65`). No `instances.*` or `interactions.*` calls. The `size: [...] as any` on torus/plane are in-range for `size`. Check `app.diagnostics()` for `option-ignored` once to confirm; none is expected.
- Change 5, `interactions.orbit` options: no `interactions.*` and no `camera.orbit` (camera is `camera.perspective`, `main.ts:981`).
- Change 6, instancing, shadow proxy, dense depth batching, cascade cap: no `instances.*` calls.
- Change 10, animation/physics: no `playLayer`, masks, `addClipsFrom`, retarget or `physics`. Clip playback goes through `.animate({clip})` and `setAnimation`/`crossFadeTo`/`play` (`main.ts:1090-1107`), none of which changed per the task notes.
- Change 11, math/animation fixes: no `Clock`, `AnimationClip`, `ShapeGeometry`, `SphericalHarmonics3` or `@aura3d/math/three` in `src/`. The game does its own timing.
- Change 12, scene kits: no `sceneKits.*`; the built-in humanoid GLB is not used (the athlete is `assets.diamondAthlete`).
- Change 14, package pins: already `4.5.0` in `package.json`.

## Checklist

Closed on 2026-10-29 by lane G08 (`audit-fix/g08`). Captures ran remotely on software WebGL2 (SwiftShader) at steady state, 45 s after ready; numbers are in `evidence/aura-diamond-3d/audit-fix/{before,after}/meta.jsonl`. "Before" is 4.5.0 `audit-fix/integration` (`b2dba3713`), "after" is the lane branch. Line numbers in the sections above refer to the 4.5.0 release source; on the lane branch `createAuraApp` is at `main.ts:847`, the per-park `exposureEv` table at `main.ts:802-807` and `effects.contactShadows` at `main.ts:826`.

- [x] Render path. No temporary `console.log` was needed: the remote spec reads `app.diagnostics().renderPath` through `__AURA3D_LIVE_APPS__`. Every park, before and after, reports `path: "hdr-msaa"`.
- [x] Skyline and Lunar Park. The 4.3.7 to 4.5.0 numbers above (Skyline 71.0 to 74.5, Lunar 82.8 to 86.1) were not re-run here. This lane measured 4.5.0 before and after its fixes: Skyline mean luma 74.49 then 73.74, Lunar 86.07 then 84.15 (1280x720). Neither looks off in the frames, so `exposureEv` stays at 0.12 and 0.16.
- [x] Other four parks, mean luma before then after: Sandlot 85.65 then 85.98, Canyon 110.19 then 109.52, Ivy 122.07 then 121.55, Dome 67.30 then 67.25. No darkening.
- [x] All six parks switched with `setPark` (`dia-probe-parks`, runs `g08-w2-before-grp4` and `g08-w2-after-grp4`). No contact-shadow warning and no `option-ignored` or other degradation in any park. The only diagnostics warning is the generic "Scene has no interactions" hint, which does not apply to a game with its own input.
- [x] Contact shadows near the plate in a day park. Ivy at 1280x720 with and without `effects.contactShadows` (`?qa-contact=0`): crop means at the batter's feet 155.28 and 155.38, at the catcher's feet 131.07 and 131.00. The mask changes these areas by under 0.1 of 255, so it is not too heavy and `intensity` stays 0.75. The weak effect is the engine behaviour tracked as LIGHT-09 (lane E2). Ambient occlusion does show: switching it off (`?qa-ao=0`) lifts the mound crop from 167.34 to 171.07 in Ivy and from 108.68 to 114.94 in Skyline.
- [x] `node tools/game-checks/run.mjs aura-diamond-3d`: 0 errors, 0 warnings.
- [x] Unit tests under `tests/unit/aura-diamond/` (now also `rules.test.ts` and `motion-gate.test.ts`) ran locally with vitest, which the lane rules allow for unit tests: 6 files, 58 tests passed.
- [x] Baseline screenshots retaken: `evidence/aura-diamond-3d/screens/final/` (run `g08-w2-after-shotsa`, same file names and sizes). `route-health.json` still records `mode: "production"`; the game keeps `renderer: { quality: "high" }` and does not switch to `quality: "production"`.
