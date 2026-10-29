# Shadowstep Gauntlet (`ninja-runner-port`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. Nothing in the game breaks or needs a code change to run on 4.5.0. The scene keeps the HDR post chain, so most of the render-path work does not apply. One lighting change needs a before/after screenshot check. The `lights.hemisphere` "sky fill" is handled differently, and the game's `environments.hdri` is probably not loading its HDR file (pre-existing). Together these may shift the overall brightness in either direction.

## What this game uses

- Entry point: `apps/showcase-ninja-runner-port/src/main.ts` imports `apps/showcase-port-shared/diag.ts` (the `?diag=1` GPU panel, via `@aura3d/debug` `installSafetyNet`) and then `examples/ninja-runner-port/main.ts`. The app folder contains no game code.
- `package.json` is already `4.5.0`, with only `@aura3d/engine` as a dependency. `diag.ts` also imports `@aura3d/debug`; that is resolved through the root `tsconfig.base.json` path map, not through this `package.json`.
- One `createAuraApp(canvas, {...})` call at `examples/ninja-runner-port/main.ts:418`. It sets `autoStart:false`, `resize:false`, `pixelRatio:1`, `renderer:{ mode:"production", qualityProfile:"production", fallback:"safe-basic" }` and `output:{ toneMapping:"aces", dither:false }` (`main.ts:423`). There is no `quality` option and no `preserveDrawingBuffer` option. No `createGameApp` call.
- Rendering is driven by the game: `app.step(0)` once per frame in `render()` (`main.ts:220`).
- Scene (`examples/ninja-runner-port/world.ts:227-240`):
  - `environments.hdri` ("sky ibl", `intensity:0.7`, `background:false`, `world.ts:229`). Its `texture` is a raw `{ type:"texture", format:"hdr", url:"/hdri/autumn_field_puresky_1k.hdr" } as never` object, not a `defineAuraAssets` ref (see section 3).
  - `lights.directional` "sun" with `shadow:{ cascades:2, maxDistance:90 }` (`world.ts:231`)
  - `lights.hemisphere` "sky fill" (intensity 0.5, `world.ts:232`)
  - `lights.directional` "cool rim" (`world.ts:233`)
  - `effects.fog` (`world.ts:234`)
  - `effects.ambientOcclusion` (only when `quality !== "low"`, which is the game's own `?quality=low` URL parameter, `world.ts:235`)
  - `effects.bloom`, `effects.colorGrade`, `effects.vignette`, `effects.antiAlias({ mode:"fxaa" })` (`world.ts:237-240`)
- Instancing (`world.ts:267-285`): one `instances.mesh(defineShape(...), layerMaterial(spec), count)` per scenery layer (`LAYERS` in `scenery.ts:27-43`), and `instances.model(PROP_ASSETS[...], { name, castShadow, transforms, colors })` for Meshy props. The scenery test asserts 8,000 to 60,000 total placements (`tests/unit/ninja-runner-port/scenery.test.ts:72-74`). Per-layer counts are unknown without running.
- Primitives (`world.ts:289` to about `350`): `primitives.box` and `primitives.sphere`, using only `name`, `size`, `material` and `castShadow`, plus `.runtime({ id })`. The 4000 m `sky` sphere (`world.ts:289`) uses `material.custom`. Ground, river, falls, blob discs, points use `geometry.custom` / `geometry.dynamic`.
- Custom shader materials (`materials.ts`): ground, solid, sky, water, falls, ball, aura, sparks, flame, particles. Several are `transparent` or additive.
- Characters: `cloneSkinned` is called at `world.ts:177` inside `loadActors` (`world.ts:168+`) and gives 13 `TypedGLBActor`s (`ACTOR_COUNT`, `world.ts:25`). They are posed with `actor.playClip(clip, t)` (`world.ts:~428`) and tinted with `actor.setTint` (`setTint` helper, `world.ts:411-414`). They are attached with `attachRootRenderSource` (`world.ts:438`).
- Shadow fit: `world.ts:219` sets `globalThis.__A3D_SHADOW_FIT__ = "current"` (unless `?shadow=0`), because the 4000 m sky dome needs the 4.3.0 fit.
- Read-back: `main.ts:337-357` (`api.frame()` and `api.pixels()`) call `app.capture({ type:"png-blob" })`, then draw the result into a separate 2D canvas / `OffscreenCanvas`. `installQaHooks("ninja-runner", ...)` is at `main.ts:398`. There is no `readPixels`, `toDataURL` or `drawImage` on the WebGL canvas itself.
- Not used: `interactions.*`, `physics`, `playLayer`, `addClipsFrom`, `Clock`, `AnimationClip`, `ShapeGeometry`, `effects.contactShadows`, `effects.depthOfField`, TAA, scene kits, `postPresets`, `looks.*`.

## What changes for this game in 4.5.0

### 1. Render path: the game stays on the HDR chain (no pixel change expected from the direct path)

- **What happens now:** `quality` is not set, so it resolves to `"auto"` (`packages/engine/src/agent-api/app/renderPath.ts`, `resolveAppRenderPath`; `requestedQuality` at `renderPath.ts:138-153`). `renderPathBlockers` (`renderPath.ts:103-136`) lists several blockers for this scene, so it keeps the HDR chain (`hdr-msaa`). The blockers are:
  - `output` is authored (`main.ts:423`)
  - effects bloom, colorGrade, vignette, antiAlias and ambientOcclusion (`world.ts:235-240`; only `fog` is forward-only)
  - an `hdri` environment (`world.ts:229`; the blocker triggers for any `hdri` node, even with `background:false`)
  - `shader material` and `transparent material` (`materials.ts`)
- **The `renderer` block is not a pipeline request.** `renderer.mode` and `renderer.fallback` are marked `@deprecated` in `packages/engine/src/agent-api/nodes/types.ts:1160-1170`. `renderer.qualityProfile` (`types.ts:1171`) is deprecated by a runtime warning (`app/rendererOptions.ts:245-246`) and is "a pixel-ratio/draw-budget preset, not a pipeline request" (`renderPath.ts:151`). So the game gets `auto`, and `auto` still draws through the HDR chain here.
- **What to do:** No change needed. If you want the pre-4.5.0 pipeline (no bloom fusion, no cascade skipping), add `quality: "production"` to the `createAuraApp` options. Note that `quality:"production"` does not turn off per-instance frustum culling (section 7).

```ts
app = createAuraApp(canvas, {
  autoStart: false,
  resize: false,
  pixelRatio: 1,
  quality: "production",   // new in 4.5.0: HDR chain, no bloom fusion, no cascade skipping
  renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
  output: { toneMapping: "aces", dither: false },
  scene: world.scene
});
```

- **How to check:** In the console, `window.__AURA_NINJA_RUNNER__.diagnostics().renderPath` (the game's QA hook returns `app.diagnostics()`, `main.ts:335`). Expect `path: "hdr-msaa"`, `quality: "auto"`. Compare with `?aura3d-render=production` (supported in `requestedQuality`).
- **Silhouette note:** The 0.1-0.3% silhouette edge difference only applies to the direct path, so it does not apply here. `effects.antiAlias fxaa` is unchanged.

### 2. Bloom fusion and cascade skipping are on under `auto` (recommended: check, not change)

- **What happens now:** Because the game is on `auto` with a bloom effect on `hdr-msaa`, `reportedBloomFusion` (`renderPath.ts:33`) returns the configured mode, `"separable"` by default. The bloom chain is fused (draw count drops; frames stay within 1/255 per the 4.5.0 notes).
- **Cascade skipping:** `renderer.ts:126` sets `skipUnusedShadowCascades` whenever fused bloom passes are allowed (`auto`/`cinematic`). The sun has two explicit cascades (`world.ts:231`), so a cascade that no receiver selects may be skipped. This is not tied to `__A3D_SHADOW_FIT__`: `ShadowSystem.ts:190` calls `unusedCascadeIndices` (`CascadeUse.ts:32`) from `Prd02ShadowBridge.ts:331-346`. The only bail-outs are a receiver that uses the prd02 lookup chunk (`prd02LookupConsumerExists`), a missing camera eye / view matrix, or every cascade being used. Which cascades the game's receivers pick is unknown without running.
- **What to do:** Nothing is required. If a shadow or bloom difference shows in your comparison, `quality:"production"` (snippet in section 1) turns both off. `renderer: { bloomFusion: "separable" }` is already the default.
- **How to check:** `diagnostics().renderPath.bloomFusion` should read `"separable"`. Then run the browser specs `tests/browser/port-sun-shadows-ninja-runner.spec.ts` and `tests/browser/ninja-runner-port.spec.ts` on the remote runner (`tools/remote-acr/run.sh`, never local Playwright).

### 3. Hemisphere "sky fill" and the HDRI node: lighting changes, direction unknown (verify the look)

- **What happens now:** The game authors an `environments.hdri` (`world.ts:229`), so the implicit scene-category fill removal in 4.5.0 does not apply. The legacy `createProductionRuntimeEnvironment` (`environment.ts`) takes its authored-environment branch (about `environment.ts:94-170`) and never reaches the `implicitFill:false` branch (`environment.ts:172`).
- **The HDRI probably does not load (pre-existing, same in 4.3.7).** The node's `texture` is a raw object with no `kind:"aura-asset-ref"`. Both the legacy branch (`environment.ts:89`) and the prd02 explicit source (`explicitEnvironmentResolution`, `environment.ts:~348`) require `kind === "aura-asset-ref"` to get a url. Without it the renderer adds the warning "hdri environment has no texture asset ref; studio procedural fallback retained" (`renderer.ts`, `hdriWarnings`), and the prd02 explicit source returns `undefined`, so resolution falls through to the neutral-room source. Check `diagnostics().warnings` for that string.
- **Hemisphere handling:**
  - In 4.3.7 (`main`) a hemisphere light fell through to a rect spot proxy in `createProductionRuntimeLightDescriptors` (`observations.ts`). The "sky fill" has no `position`, so the proxy sat at the world origin pointing straight down with a range of about 3.25. It lit only geometry within a few metres of the origin and was effectively a no-op elsewhere.
  - In 4.5.0, `renderer.ts:188` passes `hemisphereAsEnvironment: true` and `observations.ts:333` returns `[]` for a hemisphere light, so the spot proxy is gone.
  - The hemisphere's mean(sky, ground) irradiance is added through `prd02AmbientTerm(snapshot, { includeHemisphere: true })` only in the neutral-room source (`environment.ts:558`). The explicit-environment source calls `prd02AmbientTerm(snapshot)` without it (`environment.ts:541`).
- **Net effect, from reading the code (not run):**
  - If the game resolves through the explicit source (the HDRI ref were valid), the hemisphere contributes nothing in 4.5.0, and since it contributed almost nothing in 4.3.7 either, the change is small.
  - Since the texture ref is not valid, the neutral-room source is the likely path when `A3D_QR_LIGHTING` is on (the default). Then the hemisphere adds roughly mean(sky, ground) x 0.5 of uniform ambient, and the scene can get brighter in 4.5.0, not darker.
  - The neutral-room resolution uses a fixed `intensity: 1`, so the authored hdri `intensity` of 0.7 may not scale it.
- **What to do:** Take a before/after screenshot. Do not change anything until you have seen it. If the scene is brighter than you want, reduce the "sky fill" `intensity` (`world.ts:232`). If it is darker, add a `lights.ambient` of similar colour (ambient lights are added in every path through `prd02AmbientTerm`, `environment.ts:~248-285`). Raising `environments.hdri` `intensity` may have no effect on the neutral-room path. Separately, consider building the texture with `defineAuraAssets` so the HDRI actually loads; that changes the look in 4.3.7 and 4.5.0 alike, so treat it as its own change.
- **How to check:** Render the same frame on `main` and on 4.5.0 with `?autostart=1&autopilot=1` (the game's own flags, `main.ts:7-8`), using `window.__AURA_NINJA_RUNNER__.stepFrames(...)` (`main.ts:295`) for a deterministic frame. Compare mean luma by eye or with `tools/crayon-capture/ninja-runner-compare.ts`. Read `diagnostics().warnings` on both for the HDRI warning.

### 4. Look presets with a procedural fill

- Not used. See "Changes that do not affect this game".

### 5. Effects: ambient occlusion on devices without float linear filtering

- **What happens now:** The game adds `effects.ambientOcclusion({ name: "ao" })` when `quality !== "low"` (`world.ts:235`). In 4.5.0 the RGBA32F AO target is point-sampled when float linear filtering is unavailable (commit `fcfefd2de`, in `beat3js2/integration`), so AO now actually appears on those devices. On devices with float linear filtering nothing changes.
- **Practical effect:** The same page can look slightly darker in creases on devices that previously showed no AO. This includes the SwiftShader software WebGL2 that `route-health.json` was verified in ("Verified in remote software WebGL2 (SwiftShader)", `route-health.json:28`), if that does not expose float linear filtering (unknown).
- **What to do:** Nothing. If you do not want AO anywhere, remove the `effects.ambientOcclusion` line or use the game's own `?quality=low`.
- **How to check:** Compare a `?quality=low` frame with a default frame; the difference is the AO (plus the `quality=low` pixel-ratio cap in `sizeCanvas`, `main.ts:~408`).

### 6. Canvas read-back: already safe

- **What happens now:** `preserveDrawingBuffer` now defaults to `false` except under `?capture=1` / `?qa=1` (`renderPath.ts:181-192`, `wantsPreservedDrawingBuffer`, used at `frameLoop.ts:95`). The game's `api.frame()` and `api.pixels()` (`main.ts:337-357`) call `app.capture({ type:"png-blob" })`. That renders one frame with `app.step()` and runs `readPixels` in the same task (`packages/engine/src/lanes/prd01/outputSurface.ts:250-262`), then they draw the returned bitmap into a different canvas. They never read the live WebGL canvas, so they are unaffected.
- **`?diag=1` panel:** `diag.ts` installs `installSafetyNet` (the frame tap wraps draw calls and reads in a microtask before compositing, `packages/debug/src/safety/frameTap.ts`), so it is designed for a non-preserved buffer.
- **External tools (audited):** `tools/crayon-capture/ninja-runner*.ts` and `tests/browser/ninja-runner*.ts` contain no `toDataURL`, `readPixels` or `drawImage` on the WebGL canvas. The art specs use `__AURA_NINJA_RUNNER__.frame()` (`tests/browser/ninja-runner-art-lib.ts:67,145`). `tests/browser/port-sun-shadows-lib.ts:74-86` uses the `frame()` hook, falling back to a Playwright element screenshot, then a `drawImage` of a decoded bitmap. All are safe with `preserveDrawingBuffer` off. `tools/crayon-capture/ninja-runner.ts` drives the original game's `window.__konoha` hook and is unrelated to this canvas.
- **What to do:** Nothing.
- **How to check:** `__AURA_NINJA_RUNNER__.pixels()` should return a non-zero `litPixels`. Or run `tests/browser/ninja-runner-port.spec.ts` on the remote runner.

### 7. Instancing: per-instance frustum culling applies (at every quality), shadow proxy and dense depth batching do not

- **Frustum culling (applies):** `ForwardPass.ts:552-563` (`cullInstancesToView`) is new in 4.5.0 (`InstanceFrustumCull.ts` does not exist on `main`). It compacts instances outside the view frustum for draws with at least 512 instances (`MIN_CULLED_INSTANCES`, `InstanceFrustumCull.ts:14`). It is skipped for custom shader materials, skinned/morphed items, items with extra instance attributes or a draw range, and items with `frustumCulled:false`. It has no quality or flag gate, so `quality:"production"` does NOT turn it off. The scenery layers are plain PBR / emissive `instances.mesh` draws (`world.ts:267-274`, `layerMaterial` at `world.ts:108-112`), so layers with 512+ placements are culled. It is documented as pixel-identical and cheaper. Which layers pass the threshold is unknown without running.
- **Shadow proxy (does not apply):** `qrPrimitiveShadowGeometryFor` (`compiler/primitives.ts:539-560`) requires a builtin primitive (not `node.geometry`, not `primitive === "custom"`) with at least 1,024 instances. The game's instancing uses `instances.mesh` with custom shapes and `instances.model`, neither of which gets a proxy.
- **Dense depth batching (does not apply):** `depthUsesInstanceAttributes` (`Prd02DepthShaderLibrary.ts:46-55`) only changes the legacy-fit path for nodes with a proxy. The game uses the `"current"` fit (`world.ts:219`), where every instanced caster above 64 instances already took the instance-attribute path in 4.3.7, so there is no change.
- **Auto cascade cap at 8192 casters (does not apply):** The sun has an explicit `cascades:2`, and explicit counts are never capped (`compiler/shadows.ts:150-153`, `259-269`; `casterInstances` is 0 when `cascadesOpt` is a number). `shadowCastingInstanceCount` (`shadows.ts:215-224`) also counts only `kind:"primitive"` nodes, not the game's model nodes.
- **What to do:** Nothing. `?densedepth=off&shadowproxy=off` are no-ops for this game; they will not disable culling.
- **How to check:** `diagnostics()` draw counts and instance counts before and after should be equal or lower. `node tools/game-checks/run.mjs ninja-runner-port` reports 0 errors, 0 warnings on `beat3js2/integration` (run during this review).

### 8. Per-frame cost changes

- `getError` is now sampled (`WebGL2ContextLifecycle`, 30 warm-up frames, then every 60th frame, or on resource changes), except when the device is created in `frame` mode: with a root render source already attached to the canvas, a strict app, or `?diag=1` (`compiler/renderer.ts:107-109`). The game attaches its render source in `world.bind(app)` (`world.ts:438`) after `await app.ready()`, so it is sampled unless `?diag=1` (the safety net in `diag.ts:35-43`) is on. Nothing in the game reads `getError` itself.
- Per-frame allocation and memoisation changes (WP-5) and the removal of unused warm programs (WP-7) are internal. The game's custom shaders (`materials.ts`) are not warm programs the engine owns, so nothing to change. Expect equal or lower frame cost.

## Changes that do not affect this game

- **Direct-path silhouette differences (change 1):** The game is on the HDR chain, so canvas MSAA edges are not used (see section 1).
- **Runtime switch to HDR when post is added later:** The game adds all post effects at build time (`world.ts:235-240`), so there is no runtime switch.
- **Implicit scene-category environment fill removal (change 3):** The game authors an `environments.hdri` node (`world.ts:229`), so the "authored lights without any `environments.*` node" case does not apply. Only the hemisphere light and HDRI-ref behaviour apply (section 3).
- **Look presets (night-city, polar-night, neon-arcade, space, underwater):** No `looks.*` call anywhere in the game.
- **`OPTION_IGNORED` (change 4):** Every `primitives.box` and `primitives.sphere` call passes only `name`, `size`, `material` and `castShadow`, all in `PRIMITIVE_OPTION_KEYS` (`nodes/primitives.ts:58-65`). `instances.mesh` takes positional arguments. `instances.model` options (`name`, `castShadow`, `transforms`, `colors`) are read by `instances.model` / `model()`. There are no `interactions.*` calls. Entries show up as degradations with code `option-ignored` (`compileScene.ts:366`), so check that `__AURA_NINJA_RUNNER__.diagnostics().degradations` has none from builders.
- **`primitive()` now forwarding `renderOrder`, `frustumCulled`, `layers`, `userData`, `rotationOrder`, `quaternion`:** The game passes none of them to primitives.
- **`interactions.orbit` name/point/position/autoRotate:** The game uses `cameras.chase`, not `camera.orbit` or any interaction.
- **`setInstanceTransforms(Float32Array)`, skip upload when unchanged:** The game fills instances once with `setMatrixAt` / `setColorAt` (`world.ts:271`) and never updates them per frame.
- **`effects.contactShadows` screen-space mask (change 8):** Not used. The comment at `world.ts:3` mentions contact shadows, but the code uses blob disc meshes (`blob-${i}`, `world.ts:335`), not the effect.
- **Animation fixes (`playLayer`, mask `{humanoid, exclude}`, `addClipsFrom`, retarget worker):** Characters use `actor.playClip(clip, t)` only. No layers, masks or retargeting.
- **Physics (capsule/cylinder collider sizes, `bindNodes`):** No `physics` option. Debris physics in `impact.ts` is the game's own pure code.
- **Math and animation fixes (`Clock.start()`, step tracks, `ShapeGeometry`, `SphericalHarmonics3`, `@aura3d/math/three`):** The game's `loopClock` (`world.ts:364`) is a plain number array, not the `Clock` class. It has no `AnimationClip`, `ShapeGeometry` or spherical harmonics use. Its shapes come from its own `shapes.ts`.
- **Scene kit fixes and `provenance.builtIn` on the built-in humanoid GLB:** No scene kits. Characters are Meshy GLBs (`models.ts`), not the built-in humanoid.
- **Package versions:** `apps/showcase-ninja-runner-port/package.json` is already `4.5.0`.

## Measured on 4.5.0 (2026-10-29, lane G20)

All numbers come from remote SwiftShader (software WebGL2) runs of `tests/browser/audit-fix/ninja-runner-port.spec.ts` on the example page, at a fixed sim state (`begin()` then `stepFrames(300)`, s = 45 m, 1280x720), with the game's frame loop stopped and the frame rendered through the QA hook. Mean is canvas-only luma (0-255). Frames and per-shot JSON are in `evidence/ninja-runner-port/audit-2026-10-29/`. Nothing here is real-GPU evidence.

| Build and query | Mean | p5 / p95 | Draw calls |
|---|---|---|---|
| v4.3.7, default | 111.98 | 41 / 162 | 98 |
| v4.3.7, `?aura3d-render=production` | 111.27 | 41 / 162 | 98 |
| v4.3.7, `?quality=low` (no AO) | 118.71 | 52 / 170 | 98 |
| 4.5.0 base (31f8945ad), default (`quality: auto`, `bloomFusion: separable`) | 118.22 | 52 / 169 | 98 |
| 4.5.0 base, `?aura3d-render=production` (bloom fusion off) | 117.64 | 52 / 168 | 98 |
| 4.5.0 base, `?quality=low` (no AO) | 119.61 | 54 / 171 | 98 |
| 4.5.0 base, `?shadow=0` | 118.57 | 48 / 170 | 46 |
| 4.5.0 base, `?shadowfit=legacy` (4.2.0 fit) | 112.62 | n/a | 132 |

- 4.3.7 to 4.5.0: the frame is 6.2 levels brighter on average and the darkest 5% lifts from 41 to 52, with nothing clipped (p95 169). The cause is the ambient occlusion change (section 5), not the hemisphere: without AO (`?quality=low`) the two releases differ by only 0.9 levels (118.71 vs 119.61), while AO darkens the 4.3.7 frame by 6.7 levels and the 4.5.0 frame by 1.4. So the hemisphere change in section 3 is under one level here. The 4.5.0 frame reads slightly flatter, not wrong, so nothing is retuned.
- Bloom fusion (RP-05): fused vs production differ by 0.58 levels on the base and 0.01 on the lane branch (118.07 vs 118.08), under the 2-level line. The game stays on `quality: auto`; pinning `quality: "production"` buys nothing measurable.
- AO (LIGHT-06): AO on vs off (`?quality=low`) is 1.4 levels darker with AO on 4.5.0 and 6.7 levels on 4.3.7. `diagnostics().renderPath` lists no dropped passes.
- Shadow fit: the 4.2.0 fit darkens the whole frame by about 6 levels with no visible shadow shapes, because every instanced scenery node spans the 2.6 km course and that fit widens each cascade to all casters. The game keeps its 4.3.0 fit opt-in (`world.ts`), and the sky dome now opts out of casting.
- `?ibl=hdri` (new) loads the authored HDRI through a real asset ref: 111.5 mean on the branch, about the 4.3.7 level. The default stays on the neutral room.
- The capture path (`app.capture` inside `api.frame()` and `pixels()`) works with `preserveDrawingBuffer` off: every run above read lit frames.

## Checklist

- [x] `node tools/game-checks/run.mjs ninja-runner-port` reports 0 errors, 0 warnings (re-run on `audit-fix/g20`).
- [x] `diagnostics().renderPath` on 4.5.0: `path: "hdr-msaa"`, `bloomFusion: "separable"` (every G20 run).
- [x] `diagnostics().warnings` holds only "Scene has no interactions"; the HDRI-ref warning does not reach `diagnostics().warnings`, but the code path in section 3 is confirmed by the `?ibl=hdri` frame differing from the default.
- [x] Same frame on 4.3.7 and 4.5.0: 111.98 vs 118.22 mean (table above).
- [x] Look judged at the lift (it comes from AO, not the "sky fill"): kept as is; the "sky fill" stays at 0.5.
- [x] HDRI ref: `?ibl=hdri` added as a deliberate, opt-in look change; the default is unchanged.
- [x] AO contribution: 1.4 levels on 4.5.0, 6.7 levels on 4.3.7 (default vs `?quality=low`).
- [x] `quality: "production"` not added (fused vs production differ by 0.58 levels).
- [x] `app.capture()` path works with `preserveDrawingBuffer` off.
- [x] Browser checks ran remotely (`tools/remote-acr/run.sh`): `tests/browser/audit-fix/ninja-runner-port.spec.ts`, which replaces the older specs for these checks.
- [x] Unit tests in `tests/unit/ninja-runner-port/` pass (115 tests, 12 files).
- [x] `route-health.json` updated (route `/apps/shadowstep-gauntlet/`, current limits).
- [ ] Real-GPU frame (`tools/real-gpu/run.sh`). This needs a Mac or GPU VM run by the owner; agents may not run local Chrome.
