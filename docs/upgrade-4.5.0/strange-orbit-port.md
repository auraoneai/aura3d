# Craterline GP (`strange-orbit-port`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. Nothing breaks at build or boot (the app pin is already `4.5.0` and the code uses no removed API), but the game now runs under quality `auto` instead of the old pipeline. The Meshy GLB models (riders, gate pylons, boulders, lander, observatory, moon rocks) will probably render at a different brightness, and bloom now uses the fused draw-removing chain. Pin the old pipeline (optional), add an explicit environment, then compare screenshots. Paths below are relative to the repo root unless they start with `packages/`.

## What this game uses

- `apps/showcase-strange-orbit-port/src/main.ts` only imports `../../showcase-port-shared/diag` and `../../../examples/strange-orbit-port/main`. All game code is in `examples/strange-orbit-port/`.
- `apps/showcase-strange-orbit-port/package.json` pins `@aura3d/engine` as `workspace:*` and the app version as `4.5.0`.
- `examples/strange-orbit-port/main.ts:475-482`: a single `createAuraApp` call with `autoStart: false`, `resize: false`, `pixelRatio: 1`, `renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }`, `output: { toneMapping: "aces", dither: false }`.
  - It does not set `quality`.
  - It does not set `preserveDrawingBuffer`.
  - It renders by calling `app.step(0)` from its own `requestAnimationFrame` loop (`main.ts:251`, loop at `main.ts:262` and `main.ts:501`).
- `examples/strange-orbit-port/world.ts:185-193`:
  - Lights: `lights.hemisphere` (`skyColor`/`groundColor`, intensity 1.1), a shadow-casting `lights.directional` key (`shadow: { cascades: 2, maxDistance: 160 }`) and a non-shadow directional fill.
  - Effects: `effects.bloom`, `effects.colorGrade`, `effects.vignette`.
  - There is no `environments.*` node.
- `examples/strange-orbit-port/world.ts:79-82, 197-216, 341-361, 419-423`: the track, rails, islands, ramps, sky, planet, atmosphere, point-cloud and halo surfaces, and the primitive gate pylons/lintels/crystals and the primitive riders used with `?meshy=0` (`world.ts:275-411`), use `material.custom(...)` with hand-written GLSL (`shaders.ts`, `materials.ts`). Lighting is evaluated inline in the shader (`shaders.ts:28-41`). The key-light shadow is sampled with `a3dSunShadowAuto` (`shaders.ts:123,153,189`).
- `world.ts:272,318,332,373`: `model(...)` GLBs through `models.ts` (`MESHY.*`) and `ROCK_ASSET`. These are the only surfaces lit by the engine's own PBR path.
- `world.ts:275-421`: `primitives.*` builders with options `name, position, rotation, scale, size, params, material` only.
- Runtime node updates (`world.ts:444-640`): `app.nodes.require`, `setPosition/setRotation/setScale/setVisible`, `setUniform` and `updateAttribute` on `geometry.dynamic` point clouds. `app.camera.setPose`.
- `main.ts:394-447`: `installQaHooks("strange-orbit", ...)` exposes `window.__AURA_STRANGE_ORBIT__`, and `routeHealth` calls `createAuraRouteHealthSnapshot(app, ...)`.
- `apps/showcase-port-shared/diag.ts`: `?diag=1` only, via `installSafetyNet({ safety: { selfHeal: false, panel: true } })` from `@aura3d/debug`.
- The game has no `instances.*`, `interactions.*`, `effects.contactShadows`, animation layers, masks, physics, `Clock`, `AnimationClip` or `ShapeGeometry` use. A repo search of `examples/strange-orbit-port` found none of these, and none of `readPixels`, `drawImage`, `toDataURL`, `toBlob`, `screenshot` or `capture`.

## What changes for this game in 4.5.0

### A. Quality now defaults to `auto`, not the old pipeline (change 1, 7, 6 in part)

What happens now: `renderer.mode`, `renderer.qualityProfile` and `renderer.fallback` are not the pipeline request. `requestedQuality()` reads only `?aura3d-render=` and the top-level `options.quality` (`packages/engine/src/agent-api/app/renderPath.ts`, `requestedQuality`), and `resolveAppRenderPath` falls back to `"auto"`. The option is `AuraCreateAppOptions.quality` (`packages/engine/src/agent-api/nodes/types/runtime.ts:481`). So this game is now on `auto`.

- **Render path: stays HDR.** The scene has post effects, an `output` option, and `material.custom` shaders, and `renderPathBlockers` lists all of these (`options.output`, `effect "..."`, shader/custom material). `resolveRenderPath` then returns `hdr-msaa`. The game will not take the direct (canvas MSAA) path, so the edge differences from change 1 do not apply.
  - Evidence: `main.ts:480` (`output`), `world.ts:191-193` (effects), `world.ts:79-82` (custom materials).
- **Bloom fusion is on.** Under `auto`, `reportedBloomFusion` returns the default mode `"separable"` (the draw-removing fold; `"fused-2d"` is opt-in) because the path is `hdr-msaa` and the scene has `effects.bloom` (`world.ts:191`). The release notes say frames stay within 1/255 of the old chain; the 25 vs 33 draw-call figures come from the PBR viewer, not this game. Fewer draw calls is the expected benefit.
- **Unselected shadow cascades are skipped.** `skipUnusedShadowCascades` is set whenever fused bloom passes are allowed, i.e. `auto`/`cinematic` (`packages/engine/src/agent-api/compiler/renderer.ts:126`; `packages/rendering/src/shadows/Prd02ShadowBridge.ts:262,332`). The key light has 2 cascades (`world.ts:188`), so cascade 1 may not be redrawn on frames where no receiver selects it. The skip is disabled when any receiver uses the PRD-02 lookup uniform (`Prd02ShadowBridge.ts:156`); the custom shaders use the legacy per-draw `u_shadowMap*` chunk (`packages/rendering/src/shaders/chunks/author/shadow.glsl.ts` header), so they are eligible and the skip is meant to change no pixels. I could not run it to confirm.
- **Cap and proxy changes do not apply.** There are far fewer than 8192 casters and no instanced nodes.
- **Existing deprecation warnings.** `renderer.mode` and `renderer.fallback` are `@deprecated` in the types (`packages/engine/src/agent-api/nodes/types.ts:1161-1170`) and throw `AuraMigrationError` under `A3D_QR_STRICT`. `renderer.qualityProfile` has no `@deprecated` tag but emits a runtime deprecation warning (`packages/engine/src/agent-api/app/rendererOptions.ts:245`). These predate 4.5.0 and none of them selects the render path.

What to do: if you want the 4.3.7 pipeline byte-for-byte, pass `quality: "production"` and drop the renderer keys:

```ts
app = createAuraApp(canvas, {
  autoStart: false,
  resize: false,
  pixelRatio: 1,
  quality: "production",
  output: { toneMapping: "aces", dither: false },
  scene: world.scene
});
```

If you are happy with `auto`, keep `quality` unset and just remove the three `renderer` keys.

Removing the renderer keys is behaviour-neutral for this game: without `qualityProfile` the profile becomes `safe-basic` (pixel ratio 1 instead of the `production` profile's 1.5, `rendererOptions.ts:112`), but the explicit `pixelRatio: 1` wins (`packages/engine/src/agent-api/app/pixelRatio.ts:33`) and the profile is otherwise only reported in diagnostics. Expect `app.diagnostics().renderer.qualityProfile` to read `safe-basic` afterwards. `pixelRatio: 1` and the manual `canvas.width/height` in `sizeCanvas()` (`main.ts:463-467`) can stay; I found no 4.5.0 change that touches them.

How to check: call `window.__AURA_STRANGE_ORBIT__.app().diagnostics().renderPath` (the QA hook's `app` accessor is at `main.ts:400`). Expect `path: "hdr-msaa"`. With `auto`: `quality: "auto"`, `bloomFusion: "separable"`. With `quality: "production"` (or `?aura3d-render=production`): `quality: "production"`, `bloomFusion: "off"`. Compare a screenshot with `?manual=1&autostart=1&mode=trial` against the 4.3.7 screenshot. `?aura3d-render=production` switches a page to the old pipeline without a rebuild, so you can A/B it.

### B. Exposure: no `environments.*` node, so the GLB models get less light (change 3)

What happens now: the scene has authored lights and no `environments.*` node. At mount `createProductionRuntimeEnvironment(snapshot, flags, { implicitFill: false })` is used (`packages/engine/src/agent-api/compiler/renderer.ts:152`, `packages/engine/src/agent-api/compiler/environment.ts:172-181`), so the scene-category studio/gameplay fill is no longer added. `explicitLightFillFree` (`environment.ts:50`) builds the only uniform fill from ambient and hemisphere lights: here the hemisphere light, as the mean of sky and ground colour times 1.1. The key and fill directional lights (`world.ts:188-189`) still light surfaces by direction, but nothing else adds a uniform or specular environment term. This is independent of the quality setting, so `quality: "production"` does not restore the old fill.

Who is affected:
- The `material.custom` surfaces (track, sky, planet, rails, islands, ramps, and the primitive gate parts and primitive riders) compute their own light in GLSL (`shaders.ts:28-41`) and are not affected.
- The `model(...)` GLBs are affected: the player and rival bikes and skate rider (`world.ts:373`), gate pylons (`world.ts:272`), boulders, lander and observatory (`world.ts:318`), and moon rocks (`world.ts:332`). Direction and size of the change: unknown; I did not render it. The notes only say scenes with lights and no environment render darker.

What to do: add an explicit environment and compare. `environments.studio` defaults to `background: false`, so it will not replace the `#05060d` clear colour or the sky dome:

```ts
import { camera, effects, environments, lights, /* ... */ } from "@aura3d/engine";

const builder = scene()
  .background("#05060d")
  .camera(/* unchanged */)
  .add(environments.studio({ intensity: 0.6 }));   // start at 0.6, step by 0.2 per screenshot
```

Alternative: leave the scene as is and add `exposure` to the existing `output` object (`output: { toneMapping: "aces", dither: false, exposure: 1.2 }`). That scales the whole frame, including the custom-shader surfaces, which already apply their own `1.2` factor at `shaders.ts:28-41`, so the environment node is the narrower fix.

How to check: capture the menu view (`autostart` off) and a racing frame on a bike (`?manual=1&autostart=1&mode=trial`), then compare the rider and gate-pylon brightness against the 4.3.7 build. Also try `?meshy=0` (`models.ts`, falls back to the primitive riders) to confirm the custom-shader surfaces did not change. Then run `tests/browser/strange-orbit-port.spec.ts`: it asserts pixel statistics (`nonBackground`, `colors`, `lumaMean`, `warm`; around lines 108-128 and 206-210) that a brightness change can move.

### C. Canvas read-back: no game code affected, but external screenshot tools should be checked (change 2)

What happens now: `preserveDrawingBuffer` defaults to `false` except with `?capture=1` or `?qa=1` (`packages/engine/src/agent-api/app/renderPath.ts` `wantsPreservedDrawingBuffer`, used at `packages/engine/src/agent-api/app/frameLoop.ts:95`). The game never sets the option (`main.ts:475-482`) and does not read the canvas itself (no `readPixels`/`drawImage(canvas)`/`toDataURL` in `examples/strange-orbit-port`).
- The QA hook `frame()`/`pixels()` use `app.capture({ type: "png-blob" })` (`packages/engine/src/qa/hooks.ts:101-105, 123-140`), which now re-renders first, so they are fine. `tests/browser/strange-orbit-port.spec.ts` and `tests/browser/strange-orbit-rework.spec.ts` use these hooks, and `strange-orbit-port.spec.ts` also uses `page.screenshot` (compositor capture, not a JS canvas read).
- `diag.ts` only enables the black-frame watch with `?diag=1` and `selfHeal: false`. `@aura3d/debug` samples the canvas in the same task that drew it (`packages/debug/src/safety/guard.ts` header), so this is also fine. `?diag=1` also makes the renderer check `getError` every frame (change 13).

What to do: nothing in the game. If you have an external script that reads the canvas after an `await` (for example `tools/crayon-capture` or a probe in a Playwright spec), run it with `?capture=1` or switch it to `__AURA_STRANGE_ORBIT__.frame()/pixels()`. I did not find such a script for this game: the strange-orbit specs use the QA hook, and the `drawImage` calls in `tests/browser/live-ports-smoke.spec.ts` and `live-ports-hidpi.spec.ts` draw a decoded PNG, not the WebGL canvas.

How to check: run `tests/browser/strange-orbit-port.spec.ts`, `tests/browser/strange-orbit-rework.spec.ts`, `tests/browser/port-sun-shadows-strange-orbit.spec.ts` and `tests/browser/live-ports-smoke.spec.ts` on the remote runner (`tools/remote-acr/run.sh`) and confirm the strange-orbit screenshots are non-black.

### D. Per-frame cost changes (change 13)

`getError` is now sampled and some per-frame allocation was reduced. Nothing to change. The game's own per-frame work (`world.ts:614-640`) allocates a `Float32Array` for `stardust` every frame (`world.ts:603`); this is its own allocation and unaffected.

## Changes that do not affect this game

1. Direct render path and edge differences (change 1): the scene has post effects, an `output` option and custom shader materials, so it stays on `hdr-msaa` (`world.ts:79-82,191-193`, `main.ts:480`).
2. OPTION_IGNORED (change 4): every `primitives.*` call passes only `name, position, rotation, scale, size, params, material`, all in `PRIMITIVE_OPTION_KEYS` (`packages/engine/src/agent-api/nodes/primitives.ts:58-65`). The game has no `instances.*` or `interactions.*` calls. `lights.hemisphere`/`lights.directional` are not covered by the new guard (only `primitives.*`, `instances.*`, `interactions.*`). Check `app.diagnostics()` for `OPTION_IGNORED` after upgrading; I expect none.
3. `interactions.orbit` (change 5): no `interactions.*` calls; the camera is `camera.perspective` driven by `cameraController.setPose` (`world.ts:183,610`).
4. Instancing (change 6): no `instances.*` or `instances:` option; the point clouds use `geometry.dynamic` (`world.ts:228-259,341-361`). Shadow proxy, dense depth and the cascade cap for 8192 casters do not trigger.
5. `effects.contactShadows` (change 8): not used.
6. Float-target point sampling for AO, DoF, god rays, TAA, motion blur and auto exposure (change 9): none of those effects are used; the game uses only `bloom`, `colorGrade` and `vignette`.
7. Animation and physics (change 10): no `playLayer`, masks, `addClipsFrom` or `physics`; the riders are posed by hand with `setPosition`/`setRotation`.
8. Math and animation fixes (change 11): no `Clock`, `AnimationClip`, step tracks, `ShapeGeometry` or `SphericalHarmonics3`. The game uses its own `Vec3` (`vec3.ts`), not `@aura3d/math/three`.
9. Scene kits and built-in humanoid GLB (change 12): no `sceneKits.*`.
10. Package versions (change 14): `apps/showcase-strange-orbit-port/package.json` already says `4.5.0` and `workspace:*` for the engine. Nothing to bump.

## Checklist

- [ ] Run `pnpm typecheck` (root `tsc -p tsconfig.check.json --noEmit`) and the unit tests `tests/unit/strange-orbit-port` (e.g. `pnpm exec vitest run tests/unit/strange-orbit-port`). I did not run them.
- [ ] Run `node tools/game-checks/run.mjs strange-orbit-port`.
- [ ] Decide the pipeline: add `quality: "production"` to `createAuraApp` at `main.ts:475` to keep the 4.3.7 pipeline, or leave `quality` unset to accept `auto`. Remove `renderer: { mode, qualityProfile, fallback }` either way (safe because `pixelRatio: 1` is explicit).
- [ ] Add `environments.studio({ intensity: 0.6 })` to the scene builder at `world.ts:181-183` (or `exposure` in `output`), and step the intensity by 0.2 until the bike/skate riders, gate pylons and boulders match the 4.3.7 screenshots.
- [ ] Log `app.diagnostics().renderPath` and confirm `path: "hdr-msaa"`, and `quality`/`bloomFusion` of `auto`/`separable` (or `production`/`off`).
- [ ] Confirm `app.diagnostics()` shows no `OPTION_IGNORED` entries and no unexpected degradations.
- [ ] Capture the menu and a racing frame with `?manual=1&autostart=1&mode=trial` in `quality=high` and `quality=low` (the game's own URL parameter), and compare against 4.3.7 (bloom should match within 1/255 per the notes).
- [ ] Run `tests/browser/strange-orbit-port.spec.ts`, `tests/browser/strange-orbit-rework.spec.ts`, `tests/browser/port-sun-shadows-strange-orbit.spec.ts` and `tests/browser/live-ports-smoke.spec.ts` on the remote runner (`tools/remote-acr/run.sh`); never local Playwright. If the pixel-statistics assertions in `strange-orbit-port.spec.ts` fail after the exposure change, tune the environment first, and change thresholds only if the new look is intended.
- [ ] Re-run the replay test (`tests/unit/strange-orbit-port/reference-replay.test.ts`) to confirm the 283.683 s, 7-lap, 35-checkpoint result is unchanged (simulation code is not touched by 4.5.0, so a failure here would be unexpected).
- [ ] If any external capture script reads the WebGL canvas after an `await`, add `?capture=1` or switch it to `__AURA_STRANGE_ORBIT__.frame()/pixels()`.
- [ ] If screenshots change, regenerate `apps/showcase-strange-orbit-port/route-health.json` through the route-health tooling (`scripts/check-route-health.mjs`, `tools/current-routes-route-health/index.ts`). I did not confirm which of these writes the file.
