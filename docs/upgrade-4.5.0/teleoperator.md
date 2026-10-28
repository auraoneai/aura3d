# Grid Dispatch (`teleoperator`): upgrading to Aura3D 4.5.0

**Verdict:** No change needed. The game uses post effects and an HDRI look (`looks.preset("outdoor-day")`), so it stays on the HDR chain and has an environment node. It makes no canvas read-backs and no animation, physics, instancing or interaction calls. The only 4.5.0 changes it picks up are rendering-internal. Re-capture it once to confirm the look.

## What this game uses

- Entry: `apps/showcase-teleoperator/index.html` loads `src/main.ts` (3027 lines). `src/collision.ts` holds the traffic-contact code. The game does not import `apps/showcase-port-shared` or `apps/common`. Its only repo-level import is `../../../src/aura-assets` (`main.ts:15`).
- One `createAuraApp(canvas, { scene, renderer: { quality: "high" }, qualityRebuild: { flags: ["game"] } })` call at `src/main.ts:1436-1440`. `renderer.quality: "high"` is the pixel-ratio/draw-budget tier. It is not the pipeline selector, which is the top-level `quality` option. No top-level `quality`, `output`, or `preserveDrawingBuffer` is passed, so the pipeline selector is the new default `"auto"`. `qualityRebuild.flags: ["game"]` only adds the `game` flag on top of the default-on flags.
- Scene (`buildGridDispatchScene`, `src/main.ts:546-585`):
  - `looks.preset("outdoor-day", { fogDensityScale: 0, exposureEv: 0.1 })` at line 548.
  - `lights.ambient` (559), `lights.hemisphere` (561), `lights.directional({ shadow: true })` (568), `lights.point` (576).
  - `effects.bloom` (583), `effects.vignette` (584), `effects.colorGrade` (585).
  - No `environments.*` call in the game itself.
- What `outdoor-day` expands to (`packages/engine/src/agent-api/looks/looks.ts:277-353`, `lookPresets.ts:108-123`):
  - An `environments.hdri` node (`autumn_field_puresky_1k`, `looks.ts:291-298`).
  - A second shadowed directional, "look key light".
  - Colour grade, ambient occlusion (`looks.ts:343-345`) and bloom effects.
  - Fog is skipped because `fogDensityScale` is 0.
  - So the scene has two bloom nodes, two colour-grade nodes and two shadowed directionals. That duplication already existed in 4.3.7.
- Geometry:
  - 64 `primitives.box/sphere/cylinder/torus` calls (33 box, 16 cylinder, 11 sphere, 3 torus; one is the fallback box in `buildingNode`, `main.ts:538-541`). Every one passes only `name`, `size` and `material`. I extracted the keys with a script.
  - 16 `model(assets.x, ...)` calls.
  - `game.runtimeNode(...)` handles, resolved with `auraApp.nodes.require` (about 80).
  - Runtime `setMaterial` calls: beacon at about `src/main.ts:1858-1873`, weather at `2185-2192`. `scene.background` is assigned at 2184.
- Other engine surface:
  - `installBlackFrameGuard` from `@aura3d/debug` (`main.ts:16`, called at 34).
  - `installGameBeacon`, `createCameraShake`, `createHitStop` from `@aura3d/engine/game`.
  - `createCueBank` from `@aura3d/engine/audio`.
  - `createImpactWorld` and `createImpactFeedback` in `collision.ts:1`.
  - A 2D HUD minimap canvas (`main.ts:2299`).
  - `window.__AURA3D_SHOWCASE_TELEOPERATOR__` at 2983, exposing `app`, QA drive helpers and `qaCollisions`.
- Not used anywhere in the game: `instances.*`, `interactions.*`, `effects.contactShadows`, animation layers or masks, physics, `Clock`, `AnimationClip`, `ShapeGeometry`, custom shaders, `readPixels`, `toDataURL`, `toBlob`, `drawImage` on the WebGL canvas.
- `package.json` already pins `"version": "4.5.0"` and `@aura3d/engine: workspace:*`. The only diff against `main` in this app folder is that version bump.
- `node tools/game-checks/run.mjs teleoperator` reports 0 errors and 0 warnings on `beat3js2/integration`.

## What changes for this game in 4.5.0

### 1. Render path: the game stays on the HDR chain (no behaviour change)

- **What happens now:** `renderPathBlockers` (`packages/engine/src/agent-api/app/renderPath.ts`) lists any effect that is not `fog`, any `hdri` environment node, and some material kinds. The game authors `bloom`, `vignette` and `colorGrade` (`main.ts:583-585`), and the look adds `hdri`, `ambientOcclusion`, `colorGrade` and `bloom`. With `quality` at its default `"auto"`, `resolveRenderPath` (`packages/rendering/src/quality/DirectPath.ts:58-59`) returns `path: "hdr-msaa"`. The silhouette-edge difference from direct-path canvas MSAA therefore does not apply.
- **What to do:** Nothing. Do not add `quality: "production"`. The game gains nothing from it, and it would turn off bloom fusion and cascade skipping (items 2 and 3).
- **How to check:** In the console run `window.__AURA3D_SHOWCASE_TELEOPERATOR__.app.diagnostics().renderPath`. Expect `path: "hdr-msaa"`, `quality: "auto"`. The `reason` string starts with `scene needs the HDR target:` followed by the blockers, including `hdri environment` and `effect "bloom"`. If `path` reads `"direct"` with a reason starting `A3D_QR_CORE is off`, the legacy LDR route is active (`resolveAppRenderPath`). That can only happen if `A3D_QR_CORE` was overridden, since it is default-on.
- **A/B option:** Load the page with `?aura3d-render=production` to compare against the old pipeline.

### 2. Bloom fusion is on for this game (look-neutral, within 1/255)

- **What happens now:** The path is `hdr-msaa`, quality is `auto`, and the scene has bloom nodes. `reportedBloomFusion` in `renderPath.ts` therefore returns the selected mode, default `"separable"`, and `configureBloomFusionDevice` fuses the bloom passes.
- **What to do:** Nothing. `renderer.bloomFusion: "fused-2d"` is opt-in and not recommended without a capture. To compare against the previous pass sequence, load with `?aura3d-render=production`.
- **How to check:** `app.diagnostics().renderPath.bloomFusion` should read `"separable"`. Take a `?capture=1` screenshot and compare it with a 4.3.7 frame. Expect differences of at most 1/255 on the bloom pixels.

### 3. Unused shadow cascades are skipped (pixel-identical)

- **What happens now:** `compiler/renderer.ts:126` sets `skipUnusedShadowCascades` whenever fusion is allowed (`auto` or `cinematic`). The game has a shadow-casting directional (`main.ts:568-572`) and the look adds a second one, so sun cascades that no receiver selects are no longer redrawn.
- **What to do:** Nothing. This is a frame-cost gain only.
- **How to check:** Compare `app.diagnostics()` draw calls before and after, or load with `?aura3d-render=production` for the old count.

### 4. Ambient occlusion now renders on devices without float linear filtering

- **What happens now:** `outdoor-day` includes `effects.ambientOcclusion` (`looks.ts:343-345`). The RGBA32F AO target is now point-sampled when float linear filtering is unavailable. Previously AO did nothing visible on those devices. They now get AO darkening in the street and building crevices, so frames on such devices will look slightly darker than the 4.3.7 captures. Devices with float linear filtering are unchanged.
- **What to do:** Nothing is required. The look adds AO with no options (`looks.ts:343-345`) and the look overrides are only `sun`, `fogDensityScale`, `background`, `accent` and `exposureEv`, so AO strength cannot be tuned through the preset. If a reviewer finds the darkening too strong, the only lever is to stop using the preset's AO, which would mean replacing the preset. I did not test that.
- **How to check:** Find out whether a device is affected: `document.getElementById("c").getContext("webgl2").getExtension("OES_texture_float_linear")` returns `null` on an affected device (same extension as `packages/rendering/src/webgl2/TextureFormats.ts:86`). Then capture the `chase` shot on it. `tools/real-gpu/scenarios.json` already has a `teleoperator` scenario (`chase`, `far`, `bumper`) that can run on a remote GPU.

### 5. Hemisphere light: no change in the default build

- **What happens now:** The game authors `lights.hemisphere({ skyColor: "#8ed0ff", groundColor: "#2d3748", intensity: 0.92 })` (`main.ts:561-566`). 4.5.0 passes `hemisphereAsEnvironment: true` (`compiler/renderer.ts:188`) so the legacy light builder no longer turns a hemisphere into a spot proxy (`compiler/observations.ts:333`). That option is only read by the legacy path. `A3D_QR_COMPILER` and `A3D_QR_LIGHTING` are both default-on (`packages/rendering/src/contracts/flags.state.ts:21`, `:45`, unchanged vs `main`), so `createProductionRuntimeCollectedLights` takes the physical branch (`observations.ts:~262-270`) and returns before the option is read. That branch already drops hemisphere lights (`compiler/lights.ts:308`). The spot proxy was therefore not drawn in 4.3.7 either, and nothing near world `(0, 1, 0)` changes.
- **Environment side:** The scene has an authored HDRI environment from the look, so `createProductionRuntimeEnvironment` takes the authored-environment branch. The "hemisphere now contributes (mean of sky/ground)" improvement lives in the no-environment branches (`explicitLightFillFree`, and `prd02AmbientTerm` with `includeHemisphere` in the neutral-room source), so it does not apply here.
- **When it would matter:** Only if the flags are overridden off. The black-frame guard's last heal rung reloads with `-vfxFog,-post,-compiler` (`packages/debug/src/safety/guard.ts`, `QR_HEAL_LADDER`). On that rung the legacy path runs, and the hemisphere spot proxy is gone compared with 4.3.7. That is a failure-recovery path only.
- **What to do:** Nothing. The `lights.ambient` and `lights.hemisphere` lights add nothing next to the HDRI in the default build; removing them is optional cleanup that I did not test.
- **How to check:** Optional. Compare 4.3.7 and 4.5.0 `?capture=1` frames at the spawn point (`playerX = 3.4`, `main.ts:1539`). Expect no difference from this item.

### 6. Frame-loop cost changes (automatic)

- **What happens now:** The GL error query is sampled instead of read every frame (it is read every frame only in frame/strict mode or `?diag=1`, `compiler/renderer.ts:~108`). Per-frame allocation and memoisation changes also land here.
- **What to do:** Nothing. The game does not use `strict` and passes no `onDegradation`.
- **How to check:** Optional. Run the game with `?diag=1` to get per-frame GL errors back if you suspect a GL fault.

## Changes that do not affect this game

- **preserveDrawingBuffer default false:** The game has no `readPixels`, `drawImage(canvas)`, `toDataURL`, `toBlob` or screenshot code on the WebGL canvas. The only `getContext` call is the 2D minimap (`main.ts:2299`).
  - `installBlackFrameGuard` does read the live WebGL canvas: `packages/debug/src/safety/blackFrame.ts:244` calls `drawImage(canvas, ...)`. It is safe because `installFrameTap` runs that read in a microtask in the same task as the first default-framebuffer draw, before compositing (`frameTap.ts:3-10`, `guard.ts:3-8`). That holds on the HDR path too, where the final blit is the default-framebuffer draw. It would not be safe with the guard's `sampling: "raf"` option, which the game does not use.
  - `installGameBeacon` (`packages/game/src/evidence/beacon.ts`) has no canvas reads.
  - The external Playwright specs (`tests/browser/live-teleoperator-black.spec.ts` and similar) call `drawImage` on a decoded screenshot image (line 45) and on a scratch 2D canvas (line 50), not on the live canvas. `fixdl-teleoperator.spec.ts` uses `page.screenshot`, which is unaffected.
- **Exposure (no implicit environment fill):** The look adds `environments.hdri` (`looks.ts:291-298`), so the scene has an environment node, takes the authored-environment branch in `createProductionRuntimeEnvironment`, and keeps its lighting. The new look procedural fills (night-city, polar-night, neon-arcade, space, underwater) are not used, since the game uses `outdoor-day`.
- **OPTION_IGNORED:** All 64 `primitives.*` calls pass only `name`, `size` and `material`, all in `PRIMITIVE_OPTION_KEYS` (`packages/engine/src/agent-api/nodes/primitives.ts:58-65`). The game has no `instances.*` or `interactions.*`. `app.diagnostics()` should show no `option-ignored` entries from the game.
- **interactions.orbit:** The game does not use `interactions.*`. Camera is `camera.perspective` driven by game code.
- **Instancing:** No `instances.*`, `setInstanceTransforms`, instanced shadow proxy, or dense-depth batching.
- **contactShadows:** `effects.contactShadows` is not used. The `player-contact-shadow` node (`main.ts:1226`) is a plain primitive.
- **Animation / physics:** No `playLayer`, `addClipsFrom`, masks, retargeting or physics colliders.
- **Math / animation fixes:** No `Clock`, step tracks, `ShapeGeometry` or `SphericalHarmonics3`. `formatClock` (`main.ts:1886`) is the game's own time formatter.
- **Scene kits / humanoid:** No scene kit or built-in humanoid.
- **Package versions:** Already 4.5.0 in `apps/showcase-teleoperator/package.json`.
- **Impact and audio helpers:** `createImpactWorld`, `createImpactFeedback`, `createCueBank` and `installGameBeacon` are unchanged on `beat3js2/integration`. `packages/game`, `packages/audio`, `packages/engine/src/game` and `packages/engine/src/audio` have no code diffs, only `package.json` version bumps. `instanceTransforms.ts` changed, but it lives in `packages/engine/src/agent-api/nodes/game/` and the game does not use it.

## Checklist

- [ ] Run `node tools/game-checks/run.mjs teleoperator` and confirm 0 errors (0 errors and 0 warnings on `beat3js2/integration` when checked).
- [ ] Load the built game and run `window.__AURA3D_SHOWCASE_TELEOPERATOR__.app.diagnostics().renderPath`. Expect `path: "hdr-msaa"`, `quality: "auto"`, `bloomFusion: "separable"`, and a reason starting `scene needs the HDR target:`.
- [ ] Check `app.diagnostics()` for any `option-ignored` degradation. Expect none.
- [ ] Capture a `?capture=1` frame at spawn and compare it with a 4.3.7 frame. Expect at most 1/255 on bloom pixels and no other change.
- [ ] Re-run `tools/real-gpu/scenarios.json` scenario `teleoperator` (`chase`, `far`, `bumper`) on the remote runner, and compare against the previous receipt.
- [ ] On a device where `getExtension("OES_texture_float_linear")` is `null`, check that the AO darkening looks acceptable.
- [ ] Do not add `quality: "production"` or `preserveDrawingBuffer` unless a measured reason appears.
- [ ] Optional: decide whether to drop the unused `lights.ambient` and `lights.hemisphere` (`main.ts:559-566`) or keep them as-is.
- [ ] Run `typecheck` and `build` for `@aura3d/showcase-teleoperator` on the remote runner (`tools/remote-acr/run.sh`) before release.
