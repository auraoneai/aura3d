# Aura Slam 3D (`top-tennis`): upgrading to Aura3D 4.5.0

**Verdict:** One decision needed. The game compiles and runs on 4.5.0 unchanged. The sun/ambient fill gets brighter, about 1.75x, because the hemisphere light now contributes. Decide whether to accept that look or lower the ambient light. The canvas read-back in the safety net behaves as it did on 4.3.7 (see change 2), so it needs a check, not a code change.

Read-only review of `apps/showcase-top-tennis/` (branch `beat3js2/integration`, worktree `integration2`) and the shared code it mounts. The review itself built and ran nothing; the checklist at the end was closed later with remote captures (2026-10-29).

## What this game uses

- `apps/showcase-top-tennis/src/main.ts`: 6-line wrapper. It imports `apps/showcase-port-shared/quickbar.css` and `examples/aura-slam/main` (the whole game lives in `examples/aura-slam/`). `apps/showcase-port-shared/` contributes CSS only.
- `apps/showcase-top-tennis/package.json:3`: `"version": "4.5.0"`, dependency `@aura3d/engine: workspace:*`. Already bumped.
- The shipped game has one `createAuraApp` call: `examples/aura-slam/view/renderer.ts:91-95`, with `renderer: { quality: "high" }` and `qualityRebuild: { flags: ["game"] }` (`view/lighting.ts:35`). A second call exists in the lab page `view/rigparity/main.ts:69` (see "Changes that do not affect this game"). No top-level `quality`, `output` or `preserveDrawingBuffer` option is passed. `renderer.quality: "high"` is the quality tier, not the 4.5.0 render-path `quality` option.
- Lights (`view/lighting.ts:19-22`): ambient `#dce8f2` 0.62, hemisphere `#eef6ff`/`#4d6358` 0.72, directional 1.95 with `shadow: { cascades: 1 }` by default (`?cascades=auto|1..4` overrides, `lighting.ts:8-14`), point 1.4. No `environments.*` node anywhere in `examples/aura-slam/view/`.
- Post stack (`view/lighting.ts:28-30`): `effects.bloom`, `effects.vignette`, `effects.colorGrade`. No AO, DoF, TAA, motion blur, contact shadows or god rays.
- Geometry: `primitives.{plane,box,cylinder,capsule,sphere,torus}` with only the options `name`, `size`, `material`, `castShadow` (`view/scene.ts`, `view/ball.ts`, `view/athleteRig.ts`), `geometry.custom` merged static boxes (`view/statics.ts:69`), three `model(...)` set-dressing GLBs (`view/scene.ts:192-221`).
- One instanced node: `instances.capsule` "spectators", 24 instances, `castShadow: false`, updated every frame with `handle.setInstances(transforms)` (`view/spectators.ts:26-53`).
- Animation is hand-written: a 2-bone-IK athlete built from primitives and driven by node-handle `setPosition/setRotation/setMaterial` calls (`view/athleteRig.ts`, `view/pose.ts`). No `AnimationClip`, mixer, layers or masks.
- Physics is the game's own simulation (`sim/physics.ts`, uses `game.racketSports()` ball flight). The engine `physics:` option is not used.
- Loop and QA: `createFixedStepLoop` (`shell/loop.ts`), `createFixedStepPresenter` (`shell/presentation.ts`), `installQaHooks` (`shell/qa.ts`). Neither uses `Clock`.
- Safety net: `installSafetyNet` from `@aura3d/debug` (`view/renderer.ts:114-119`), sampled by hand each rendered frame (`view/renderer.ts:189`, `net?.sample(frames)`). The game never calls `app.step`; the engine's own `requestAnimationFrame` loop draws.
- Pixel read-back code: only `view/rigparity/main.ts:83-96` (a lab page, not the shipped game). Playwright specs under `tests/browser/aura-slam-*.spec.ts` read PNG screenshots, not the live canvas.

## What changes for this game in 4.5.0

### 1. Fill light is brighter: the hemisphere light now contributes (change 3, applies in a different direction than "darker")

- **What happens now:** The "no `environments.*` node renders darker" rule does not describe this game. The scene already authored an ambient light, so on 4.3.7 it took the `authored-ambient` branch: only the ambient light (0.62, tinted `#dce8f2`) was added as fill and the hemisphere light contributed nothing. On 4.5.0 `createProductionRuntimeEnvironment(..., { implicitFill: false })` (`packages/engine/src/agent-api/compiler/renderer.ts:152`) takes the new `authored-lights` branch (`packages/engine/src/agent-api/compiler/environment.ts:172-182`, using `explicitLightFillFree` at `environment.ts:50-78`). That branch sums the ambient light plus the hemisphere light as the mean of sky and ground colour. The PRD-02 path does the same (`prd02AmbientTerm(snapshot, { includeHemisphere: true })`, `environment.ts:558`).
- **Size (my arithmetic from the colours and intensities, not a measurement):** old fill = ambient only = about (0.44, 0.50, 0.55) in linear light. New fill = ambient plus hemisphere (0.33, 0.38, 0.40) = about (0.78, 0.88, 0.95). That is roughly 1.75x. The directional (1.95) and point (1.4) lights are unchanged. Expect lifted shadows and a flatter, brighter court and stands. The vignette and colour grade are unchanged.
- **Evidence:** `examples/aura-slam/view/lighting.ts:19-22` (ambient plus hemisphere, no environment); CHANGELOG 4.5.0 "Visual change: a scene that authors its own lights and no environment..." ("Hemisphere lights now contribute in this mode").
- **What to do:** Either accept the brighter look, or keep the 4.3.7 fill by moving weight out of the ambient light. Lowering the ambient to about 0.15 makes the sum match the old fill (about 0.44, 0.52, 0.57). Ambient 0.25 leaves it about 1.15x brighter. Check the result by eye:
    ```ts
    // examples/aura-slam/view/lighting.ts
    lights.ambient({ color: "#dce8f2", intensity: 0.15 }),   // was 0.62; 0.25 keeps a slightly brighter look
    lights.hemisphere({ skyColor: "#eef6ff", groundColor: "#4d6358", intensity: 0.72 }),
    ```
    The same edit is needed in `view/rigparity/main.ts` if you want the lab page to match. To dim or brighten the whole frame instead, `createAuraApp(..., { output: { exposure: 0.9 } })` (`AuraOutputOptions.exposure`, `packages/engine/src/contracts/output.ts:11`). Exposure also scales the directional and point lights, so it cannot restore the old balance exactly. Passing `output` is a render-path blocker (see change 3), which is harmless here because the game already uses the HDR chain.
- **How to check:** Capture the same venue and frame on 4.3.7 and 4.5.0 (`/examples/aura-slam/view/harness.html?venue=hard`, or `tools/real-gpu` scenario `top-tennis`) and compare mean luma and a side-by-side screenshot. Run them on the remote runner (`tools/remote-acr/run.sh`). `tests/browser/aura-slam-render.spec.ts` logs `SLAMR_METRICS` per venue and size for this. Its active assertions are not blank (luma > 8), not blown out (luma < 245), no console errors and draw calls <= 150 (`aura-slam-render.spec.ts:91`). Its parity thresholds (lines 76-81) are not applied today, because `evidence/aura-slam/frames-reference.json` rows are keyed by `name`, not `venue`, and the spec logs "matched 0 rows". `aura-slam-native-vs-live.spec.ts` asserts only the row count and no console errors (lines 164-165). If you accept the new look, regenerate `evidence/aura-slam/native-vs-live-metrics.json` (the G3 comparison artifact) and the native frames after review.

### 2. Black-frame safety net reads the canvas outside the draw task (change 2, behaviour unchanged for the shipped page, verify only)

- **What happens now:** In 4.5.0 `preserveDrawingBuffer` is false unless the page has `?capture=1` or `?qa=1` or the option is set (`packages/engine/src/agent-api/app/renderPath.ts:181-196`, wired at `frameLoop.ts:95`). This is not a change for the normal game page. On 4.3.7 the default was already false (`packages/rendering/src/WebGL2Device.ts:375` on main, `?? false`, and main's `frameLoop.ts` passes no option). The only 4.5.0 difference is that `?capture=1` and `?qa=1` now preserve the buffer.
- **Why it still deserves a look:** The game builds the safety net with a canvas, which creates a black-frame watch (`packages/debug/src/safety/index.ts:70-71`), and calls `net?.sample(frames)` from the game's own render function (`view/renderer.ts:189`). `sample()` reads the canvas with `ctx.drawImage(canvas, ...)` + `getImageData` (`packages/debug/src/safety/blackFrame.ts:245-246`). `packages/debug/src/safety/frameTap.ts:1-8` documents that without `preserveDrawingBuffer` such a read returns zeros unless it happens in the same task as the draw (or, in practice, in the same frame before the browser composites). The engine's `requestAnimationFrame` loop is registered at `createAuraApp`, before the game's fixed-step loop starts, so the game's sample most likely runs after the engine draw in the same frame. I could not confirm that without running it. `view/renderer.ts` passes no `getDrawCalls` or draw-tap, so nothing gates the sample. This is identical on 4.3.7 and 4.5.0 (`packages/debug` has no source diff between them).
- **What to do:** Nothing, unless the check below fails. If `blackSamples` is above 0, opt in at the single `createAuraApp` call:
    ```ts
    // examples/aura-slam/view/renderer.ts:91
    app = createAuraApp(target, {
      scene: buildTennisScene(rig),
      renderer: { quality: "high" },
      qualityRebuild: QUALITY_REBUILD,
      preserveDrawingBuffer: true   // AuraCreateAppOptions.preserveDrawingBuffer
    });
    ```
    The cost is that the browser keeps the buffer each frame (a small per-frame cost). The alternative, `safety: { selfHeal: false }` (`SafetySettings.selfHeal`, `packages/debug/src/safety/index.ts:23`, via `SceneRendererOptions.safety`), is not recommended because it removes the black-frame heal.
- **How to check:** Load the page with `?diag=1` and, after 10 s of play, read `window.__AURA_SAFETY__()`: `observed.blackSamples` must stay 0, `stage` must stay 0, `rung` must stay `"full"` and `escalated` must stay false. (`window.__AURA3D_HEAL__` is set only by `installBlackFrameGuard`, not by `installSafetyNet`, so it is not available in this game.) Do this on a remote runner or the cloud browser, not local Playwright.

### 3. Render path stays HDR; bloom is now fused (changes 1 and 7, applies, no code change needed)

- **What happens now:** `quality` is not set, so it resolves to `"auto"` (`renderPath.ts:156`) and the blockers are evaluated (`renderPath.ts:168`). The scene has `effect` nodes `bloom`, `vignette` and `colorGrade`; `renderPathBlockers` (`renderPath.ts:103`) lists each one (the only forward-only effect is `fog`, `renderPath.ts:99`; the effect branch is at `renderPath.ts:116-118`). The mount therefore chooses `hdr-msaa`, not `direct`. `A3D_QR_CORE` is default-on, so the legacy LDR route is not taken. Switching to the direct path is not possible without removing the post stack. Because quality is `auto` and the scene has bloom, the bloom chain is fused (`bloomFusionAllowed` and `reportedBloomFusion` in `renderPath.ts`), default mode `"separable"`. The changelog states frames stay within 1/255 of `production`, measured on the PBR viewer, not on this game.
- **What to do:** Nothing is required. To keep the exact 4.3.7 pass sequence, pass `quality: "production"` to `createAuraApp` (`AuraCreateAppOptions.quality`, `packages/engine/src/agent-api/nodes/types/runtime.ts:481`). It restores the old pipeline and disables fusion. It does not restore the old fill light (change 1 is independent of `quality`).
- **How to check:** In the console after `await app.ready()`: `app.diagnostics().renderPath` should report `{ path: "hdr-msaa", quality: "auto", bloomFusion: "separable" }`. The draw-call budget assertion (`aura-slam-render.spec.ts:91`, <= 150) should be equal or lower.

### 4. Per-frame GL error check is sampled (change 13, applies, informational)

- **What happens now:** `getError` no longer runs every frame. The default `errorCheckMode` is `sampled` (first 30 frames, any frame that creates or releases a GPU resource, every 60th frame, and while an error is outstanding; documented at `packages/rendering/src/WebGL2Device.ts` near lines 113-116, option in `packages/engine/src/contracts/output.ts`). `?diag=1` turns it back on every frame. The game itself sets no `errorCheckMode`. The per-frame allocation and memoisation changes need nothing from the game. Expect slightly lower CPU per frame; no measurement exists for this game.
- **How to check:** `?diag=1` still reports GL errors; open the page with it once.

## Changes that do not affect this game

- 4 (`OPTION_IGNORED`): every `primitives.*` and `instances.*` call passes only `name`, `size`, `material`, `castShadow` (plus `transforms`, `colors` on the instanced node). All are in `PRIMITIVE_OPTION_KEYS` (`packages/engine/src/agent-api/nodes/primitives.ts:59-65`), so no diagnostic fires. No `interactions.*` is used. The game also passes no `renderOrder`, `frustumCulled`, `layers`, `userData`, `rotationOrder` or `quaternion`, so the newly forwarded fields change nothing.
- 5 (`interactions.orbit`): not used; the camera is `camera.perspective` (`view/camera.ts:11`).
- 6 (instancing): the only instanced node has 24 instances, far below the 512 culling floor (`packages/rendering/src/renderer/InstanceFrustumCull.ts:14`) and the 1,024 shadow-proxy floor, and it does not cast shadows. `setInstances` (not the typed-array path) keeps working (`view/spectators.ts:52`). The default single shadow cascade (`lighting.ts:21`) means "skip unselected cascades" has nothing to skip unless the page is opened with `?cascades=2..4`. The new PCF tap-tier code in `forward/Lighting.ts` is opt-in and leaves the shadow kernel unchanged here.
- 8 (`effects.contactShadows`): not used.
- 9 (float-target point sampling for AO, DoF, god rays, TAA, motion blur, auto exposure): none of these effects are used. Bloom, vignette and colour grade are not on that list.
- 10 (animation and physics): no layers, masks, `addClipsFrom`, retargeting or engine `physics:` option; the rig is procedural (`view/athleteRig.ts`) and the ball sim is the game's own (`sim/physics.ts`).
- 11 (math/animation): no `Clock`, step tracks, `ShapeGeometry`, `SphericalHarmonics3` or `@aura3d/math/three` import. The loop uses `createFixedStepLoop` and `createFixedStepPresenter`, which have no diff between `main` and this branch.
- 12 (scene kits, built-in humanoid): no scene kit and no built-in humanoid GLB is used; the three GLBs are typed set-dressing assets (`view/scene.ts:192-221`).
- 14 (package pins): already `4.5.0` (`apps/showcase-top-tennis/package.json:3`). `examples/aura-slam/` has no diff against `main`.
- Rig parity lab page (`view/rigparity/main.ts:69` for `createAuraApp`, `:83-96` for read-back): `app.step()` x2 then `canvas.toDataURL` in the same task, so it does not read a cleared buffer. Its scene authors the same ambient 0.62 plus hemisphere 0.72 with bloom and vignette (so it also gets brighter, and also stays on the HDR path), with `autoStart: false` and `qualityRebuild` flags `["game","-compiler","-post","-vfxFog"]`. I did not verify how its parity thresholds react to the brightness change, so check its output once. It is not part of the shipped game page.
- Playwright specs: they decode `page.screenshot()` PNGs (`tests/browser/aura-slam-render.spec.ts`, `decode` helper near lines 30-40), not the live canvas, so `preserveDrawingBuffer` does not affect them.

## Checklist

Closed on 2026-10-29 by audit lane G01 (branch `audit-fix/g01`). Captures ran on the remote runner (software WebGL2, SwiftShader), measured at steady state; numbers and frames are in `evidence/aura-slam/audit-2026-10-29/`.

- [x] `pnpm -C apps/showcase-top-tennis exec tsc -p tsconfig.json --noEmit` passes, and `node tools/game-checks/run.mjs top-tennis` reports 0 errors and 0 warnings.
- [x] `app.diagnostics().renderPath` on `?autoplay=1&diag=1` is `{ path: "hdr-msaa", quality: "auto", bloomFusion: "separable" }`, and the diagnostics carry no `OPTION_IGNORED` entry (`tt-state-auto`, run `g01-final-124319-state`).
- [x] Fill light decision: keep the 4.5.0 look. Measured on the live route at 1280x720, steady state: whole-frame mean luma 44.4 on v4.3.7 and 50.4 on the 4.5.0 base (+13.6%, median 48 to 54), not the computed 1.75x of the ambient term, because the directional and point lights dominate. Pixels below luma 12 fell from 9.9% to 8.3% and nothing clips. The frame stays dark rather than flat, so the hemisphere intensity stays at 0.72 (`LIGHT-03`).
- [x] Safety net: `window.__AURA_SAFETY__()` after 70 s on `?diag=1` reports `blackSamples 0`, `stage 0`, `rung "full"`, `escalated false`. No `preserveDrawingBuffer` change is needed.
- [x] The game's capture spec `tests/browser/audit-fix/top-tennis.spec.ts` replaced the render and native-vs-live re-runs for this release check: 1280x720 and 390x844 play, the results screen, the menu, six venues, the production render path and context loss. `evidence/aura-slam/native-vs-live-metrics.json` was not regenerated: the scene changed on purpose (coloured crowd, see-through net, venue palette, stand scale), so live parity with the pre-fix page is no longer the target.
- [x] All six venues captured with `?capture=1` (`tt-venue-*`, run `g01-final3-*`).
- [x] Bloom: the scene stays on `quality: "auto"` with separable bloom fusion. `?aura3d-render=production` measured within 0.01 mean luma of the default at the same state (53.29 against 53.28), so no `quality: "production"` pin is needed.
