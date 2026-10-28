# Saltwind Highway (`roadster-hours-port`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. The game keeps the HDR render chain in 4.5.0 and its canvas read-back already goes through `app.capture()`, so nothing breaks. The one real behaviour change is that `quality` now defaults to `"auto"` (bloom pass fusion applies), and the code's `qualityProfile: "production"` does not mean what it looks like; pin `quality` explicitly and re-check the frames.

## What this game uses

- `apps/showcase-roadster-hours-port/src/main.ts`: 3 lines. Imports `apps/showcase-port-shared/diag` and mounts `examples/roadster-hours-port/main`. No game code lives in the app folder. `package.json` is already pinned to `4.5.0` (`@aura3d/engine: workspace:*`).
- `apps/showcase-port-shared/diag.ts`: `?diag=1` panel from `@aura3d/debug` (`installSafetyNet`). It reads `drawCalls`, `backend`, `tier` from the `window.__AURA_ROADSTER_HOURS__` QA hook. It does not touch the canvas.
- `examples/roadster-hours-port/main.ts:337-343`: one `createAuraApp(canvas, { autoStart: false, resize: false, pixelRatio: 1, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, output: { toneMapping: "aces", dither: false }, scene })`. No `quality`, no `preserveDrawingBuffer`.
- `examples/roadster-hours-port/world.ts:442-453`: two `lights.directional` (sun with `shadow: { cascades: 1, maxDistance: 90 }`, and a fill), `environments.preset(...)` (`night` / `sunset` / `outdoor`, `background: false`, line 446), `effects.fog`, and when `?post` is not `0`: `effects.bloom`, `effects.colorGrade`, `effects.vignette`, `effects.antiAlias({ mode: "fxaa" })` (lines 448-454).
- Custom GLSL: `material.custom(...)` for sky, road, water, terrain, ramps, town, beams and plumes (`examples/roadster-hours-port/materials.ts`, `shaders.ts`).
- Primitives: `primitives.sphere/plane/cylinder/box` with only `name`, `position`, `rotation`, `size`, `params`, `material`, `castShadow` (`world.ts:461, 498-500, 585, 594-607`). `geometry.custom` / `geometry.dynamic` are also used (kickers and shortcuts `world.ts:472, 476`, the player car body, scatter geometry) with `name`, `material`, `castShadow`; they are outside the OPTION_IGNORED scope.
- `instances.custom(...)` for generated-model scenery (palms, pines, boulders, lighthouse, houses) with `name`, `material`, `transforms` (`world.ts:523-529`). Counts are small: about 60 palms/pines over a 2800-3300 m route, a few dozen boulders.
- `batched.mesh(...)` for the 92 vehicles (`world.ts:643-677`), written per frame with `setMatrixAt`, `setVisibleAt`, `setColorAt`.
- Camera driven by `app.camera.setPose(...)` (`world.ts:849`). The game has no `interactions.*`, no skinned animation, no `physics`, no `Clock`, `AnimationClip`, `ShapeGeometry` or `SphericalHarmonics3`.
- Canvas read-back: `readFrame()` calls `app.capture({ type: "png-blob" })` (`main.ts:241-246`) and uses the bitmap for `stats()` and `frame()`. `frameJpeg` calls `toDataURL` on a separate 2D canvas (`main.ts:290`), not the WebGL canvas; `getImageData` at `main.ts:251` also reads a 2D canvas.
- Own loop: `createFixedStepLoop` plus `app.step(0)` every rendered frame (`main.ts:185, 202`).
- Debug query flags: `?post=0`, `?env=0`, `?fog=0`, `?shadow=0`, `?meshy=0`, `?foliage=`, `?manual=1`, `?autostart=1`, `?autopilot=1`, `?level=` (0 = Sunbreak Coast, 1 = Redline Canyon, 2 = Halo Skyway; `data.ts` `LEVELS`, `main.ts:19`).

## What changes for this game in 4.5.0

### 1. Render path: the game stays on the HDR chain, but now under `quality: "auto"`

- **What happens now:** `createAuraApp` resolves `quality` to `"auto"` when `options.quality` is absent (`packages/engine/src/agent-api/app/renderPath.ts:155-172`, `resolveAppRenderPath`: `requestedQuality(options) ?? "auto"`). `renderer.qualityProfile` is explicitly documented there (`requestedQuality`, 138-153) as "a deprecated pixel-ratio/draw-budget preset, not a pipeline request". So `qualityProfile: "production"` (`main.ts:339`) does not select the old pipeline. Under `auto`, `renderPathBlockers` (`renderPath.ts:103-135`) is consulted. This game hits several blockers: authored `output` options (`main.ts:340`), `effect "bloom"`, `"colorGrade"`, `"vignette"`, `"antiAlias"` (`world.ts:450-453`) and `shader material` custom GLSL on nearly every surface (`fog` alone is not a blocker). Even with `?post=0` the `output` option and the custom shaders keep it on HDR. The game therefore uses the HDR multisampled target, as in 4.3.7. It does not go direct, and the 0.1-0.3% silhouette-edge difference from canvas MSAA does not apply.
- **What does differ:** `auto` allows bloom pass fusion (`bloomFusionAllowed`, `renderPath.ts:24-26`). With `bloom` present on the HDR route, `diagnostics().renderPath.bloomFusion` reads `"separable"` (the default). Per the release notes, frames stay within 1/255 of the old chain with fewer draws.
- **What to do:** If you want the 4.3.7 pipeline byte-for-byte, say so in code:
    ```ts
    app = createAuraApp(canvas, {
      autoStart: false, resize: false, pixelRatio: 1,
      quality: "production",
      output: { toneMapping: "aces", dither: false },
      scene: world.scene
    });
    ```
    `quality` is a real `AuraCreateAppOptions` field (`packages/engine/src/agent-api/nodes/types/runtime.ts:481`) accepting `"auto" | "production" | "safe-basic" | "cinematic"`. If you prefer the 4.5.0 behaviour, set `quality: "auto"` explicitly instead. In both cases the `renderer` block is optional cleanup, with one caveat. `renderer.mode` (deprecated, `types.ts:1161-1164`) and `renderer.fallback` (deprecated, `types.ts:1166-1170`; both throw `AuraMigrationError` under `A3D_QR_STRICT`) can be removed with no effect: every quality profile has `rendererMode: "production"` (`rendererOptions.ts:119`). `renderer.qualityProfile` is deprecated only by the runtime warning (`rendererOptions.ts:244-246`), and removing it switches the resolved profile from `production` (pixelRatio 1.5, maxRecommendedDrawCalls 260) to the default `safe-basic` (pixelRatio 1, maxRecommendedDrawCalls 180) (`rendererOptions.ts:43-70, 109-110`). The game passes an explicit `pixelRatio: 1`, which is expected to win (`pixelRatio.ts:33`, checked only for the non-flag branch), so no pixel change is expected, but the profile and draw budget reported in diagnostics will change. Compare diagnostics before and after.
- **How to check:** in the page console run `__AURA_ROADSTER_HOURS__.diagnostics().renderPath`. Expect `{ path: "hdr-msaa", quality: "auto" | "production", bloomFusion: "separable" | "off" }`. With `quality: "production"` it must report `bloomFusion: "off"` (`reportedBloomFusion`, `renderPath.ts:33-39`). Compare a `?capture=1&autostart=1&level=0` screenshot against the 4.3.7 frame. A URL override also exists for A/B: `?aura3d-render=production` or `?aura3d-render=auto` (`renderPath.ts:138-147`).

### 2. Bloom fusion (change 7)

- **What happens now:** Applies because of change 1. The bloom effect is at `world.ts:450` and the route is `hdr-msaa` under `auto`, so the bloom chain is fused in the default `"separable"` mode (`reportedBloomFusion`, `renderPath.ts:33-39`). The Halo Skyway route (`?level=2`) has the strongest bloom of the looks checked (`look.ts` halo: intensity 0.85, threshold 0.7, against 0.5 / 0.85 for the earlier look), so it is where a difference would show first.
- **What to do:** Nothing if `auto` is acceptable. To keep the old bloom passes use `quality: "production"` (see 1). To try the 2D variant: `renderer: { bloomFusion: "fused-2d" }` (`types.ts:1183`) or `?aura3d-bloom-fusion=fused-2d` (`rendererOptions.ts:256-274`). Do not do this without a reason; it is opt-in.
- **How to check:** `diagnostics().renderPath.bloomFusion`; capture level 2 (`?level=2`) before and after and compare. Also run `node tools/game-checks/run.mjs roadster-hours-port` (verified to resolve this slug: 0 errors, 0 warnings in 4.5.0).

### 3. Draw-call counts shift (consequence of 1 and 7, and change 13)

- **What happens now:** `drawCalls` falls when bloom is fused. The tests and `?diag=1` panel read `drawCalls` from the QA hook. `tests/browser/roadster-hours-port.spec.ts:157` asserts `probe.delta <= 2 * probe.geometries` only when the batching tier is off; with the tier on, lines 158-166 assert relative multi-draw bounds instead (`gl.md` between 1 and `2 * geometries`, `mdMembers >= 0.6 * slots`). `:170` asserts `drawCalls > 0`. A lower frame total does not fail any of them. The in-game `probeBatchedDraws` (`world.ts:800-807`) measures a delta between hidden and visible vehicles, which fusion does not change.
- **What to do:** If any report or doc quotes an absolute draw count for this game, regenerate it. I could not locate the "3 multi-draw calls instead of 92 draws" figure (no JSON containing "multi-draw" under the example, app or evidence folders), so treat any such quote as unverified; it is about the vehicle batch, not the frame total, and I have no evidence it changes. Mark as unknown until re-measured.
- **How to check:** `__AURA_ROADSTER_HOURS__.probeBatchedDraws()` and `.batching()` in the console; `npx playwright test tests/browser/roadster-hours-port.spec.ts` on the remote runner (never local Playwright on this Mac).

### 4. `?env=0` debug flag renders darker (change 3, QA-only)

- **What happens now:** The default scene has `environments.preset(...)` (`world.ts:446`), so the new "authored lights, no `environments.*` node" rule does not apply. It applies only when the page is opened with `?env=0`, which skips that node (`world.ts:446`) and leaves two directional lights. In 4.5.0 that case no longer receives the implicit scene-category fill (`packages/engine/src/agent-api/compiler/environment.ts:35-47` convention comment, `50` `explicitLightFillFree`, `172-180` the `implicitFill === false` branch) and is darker than in 4.3.7.
- **What to do:** Nothing for shipped play. If anyone compares `?env=0` captures with old baselines, re-baseline them. There is no hemisphere light and no look preset (`night-city` etc.) in this game, so those parts of change 3 do not apply.
- **How to check:** `?env=0&capture=1` screenshot vs the default one.

### 5. Verify the read-back path under `preserveDrawingBuffer: false` (change 2, no code change required)

- **What happens now:** `preserveDrawingBuffer` is false unless `?capture=1` or `?qa=1` (`renderPath.ts:181-198`, `wantsPreservedDrawingBuffer`). The game never sets it. Its only read of the WebGL canvas is `app.capture({ type: "png-blob" })` after an `await` (`main.ts:241-246`). In 4.5.0 `capture` renders one frame synchronously (`app.step()`) and calls `gl.readPixels` in the same task (`packages/engine/src/lanes/prd01/outputSurface.ts:250-270`), so it does not depend on the preserved buffer. `stats()` and `frame()` stay valid.
- **What to do:** Nothing. Do not replace `app.capture` with `canvas.toDataURL` or `drawImage(canvas)`; those would read a blank buffer after an await. The Playwright specs that use `page.screenshot` (`roadster-hours-meshy.spec.ts:63`, `roadster-hours-art-frames.spec.ts:64`) capture the composited page and do not read the drawing buffer.
- **How to check:** In the console, `await __AURA_ROADSTER_HOURS__.stats()` must return `lumaStd` clearly above 0 and `colorBuckets` well above 1 (a blank frame gives 0 and 1). Repeat once with a delay after a user input. Open the page with `?capture=1` to compare.

## Changes that do not affect this game

- **Direct path / canvas MSAA edge differences (1, partial):** the scene has custom shaders, effects and authored `output`, so it never goes direct (`renderPath.ts:103-135`).
- **Runtime switch to HDR when post is added later (1):** the game is on HDR from mount, and post effects are all added at build time (`world.ts:448-454`).
- **OPTION_IGNORED (4):** every option passed is in `PRIMITIVE_OPTION_KEYS` (`packages/engine/src/agent-api/nodes/primitives.ts:60-65`): `name, position, rotation, size, params, material, castShadow` for primitives and `name, material, transforms` for `instances.custom` (which goes through `instancedPrimitive` and `primitive()`; the key list also contains `transforms`, `colors`, `geometry`). Sphere `params` use only `widthSegments/heightSegments`, which are allowed. `app.diagnostics()` should show no `option-ignored` entry. The game uses no `interactions.*`.
- **`primitive()` now forwards `renderOrder`, `frustumCulled`, `layers`, `userData`, `rotationOrder`, `quaternion` (4):** the game passes none of them.
- **`interactions.orbit` options (5):** no `interactions.*` and the camera is `camera.perspective` driven by `setPose`.
- **Instancing: typed-array `setInstanceTransforms`, upload skip, per-instance frustum culling, shadow proxy, cascade cap, dense depth batching (6):** the scatter instances are static and far below the thresholds (frustum cull needs 512 instances, `packages/rendering/src/renderer/InstanceFrustumCull.ts:14`; shadow proxy needs 1024, `compiler/geometry.ts:259` `INSTANCED_SHADOW_PROXY_MIN_INSTANCES`; cascade cap needs 8192 casters). The sun uses `cascades: 1` explicitly. Vehicles use `batched.mesh`, not `instances.*`. Unselected-cascade skipping on `auto` could in principle touch the one cascade; the shadow-receiver result is unknown without a capture. `tests/browser/port-sun-shadows-roadster-hours.spec.ts` (`/examples/roadster-hours-port/?manual=1&level=0`) is the check that exercises it.
- **`effects.contactShadows` (8):** not used (`world.ts:444-453`).
- **AO, depth of field, god rays, TAA, motion blur, auto exposure float-target fix (9):** none are used; only fog, bloom, colorGrade, vignette, antiAlias.
- **Animation layers, masks, `addClipsFrom`, retarget worker, physics collider sizes, `bindNodes` (10):** no animation clips or physics in the game (`rg` over `examples/roadster-hours-port/*.ts` finds none).
- **`Clock.start()`, step tracks, `ShapeGeometry`, `SphericalHarmonics3`, `@aura3d/math/three` (11):** not used. The game uses `createFixedStepLoop`, not `Clock`.
- **Scene kits and built-in humanoid provenance (12):** no scene kits and no humanoid.
- **Per-frame cost changes: `getError` sampling, allocation and memoisation, removed warm programs (13):** internal and behaviour-neutral. The `getError` sampling is the only visible change: GL errors are checked every frame only with `?diag=1`, strict or frame mode, so a GL error that previously surfaced every frame in `diagnostics().errors` may appear later or only under `?diag=1`.
- **Package pins (14):** already done: `apps/showcase-roadster-hours-port/package.json` is `4.5.0`, and the git diff against `main` for the game's example, app and shared folders is that one line.

## Checklist

- [ ] In `examples/roadster-hours-port/main.ts:337-343`, add an explicit `quality` (`"production"` for the old pipeline, or `"auto"` to accept 4.5.0 behaviour). Optionally drop `renderer.mode` and `renderer.fallback` (no effect); dropping `renderer.qualityProfile` changes the reported profile and draw budget (see 1), so compare diagnostics if you do.
- [ ] After the change, read `__AURA_ROADSTER_HOURS__.diagnostics().renderPath` and confirm `path: "hdr-msaa"` and the expected `bloomFusion`.
- [ ] Capture `?level=0`, `?level=1`, `?level=2` (2 = Halo Skyway) with `&capture=1&autostart=1` before (main) and after (4.5.0); compare, paying attention to the Halo Skyway bloom and the single shadow cascade near the car.
- [ ] Confirm `__AURA_ROADSTER_HOURS__.diagnostics().warnings` contains no `OPTION_IGNORED` entry and `errors` is empty.
- [ ] Confirm `await __AURA_ROADSTER_HOURS__.stats()` is not blank (`lumaStd` > 0, `colorBuckets` > 1) with and without `?capture=1`.
- [ ] Re-baseline any `?env=0` capture and any stored absolute `drawCalls` number for this game.
- [ ] Run `node tools/game-checks/run.mjs roadster-hours-port` (resolves this slug; 0 errors, 0 warnings on 4.5.0).
- [ ] Run the specs `tests/browser/roadster-hours-port.spec.ts`, `roadster-hours-meshy.spec.ts`, `roadster-hours-art-l0.spec.ts`, `port-sun-shadows-roadster-hours.spec.ts` on the remote runner (`tools/remote-acr/run.sh`), not locally. Also check the other specs that load this game: `render-fix-regression.spec.ts:121`, the `exposure-scenes-*.spec.ts` entry for `roadster-hours-port` (`exposure-scenes.json:87`) and `fit-grounding-sweep.spec.ts:17`; any luma/exposure baselines there may move.
- [ ] `pnpm --filter @aura3d/showcase-roadster-hours-port typecheck`.
