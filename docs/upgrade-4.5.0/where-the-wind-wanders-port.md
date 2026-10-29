# The Bellkeeper's Walk (`where-the-wind-wanders-port`): upgrading to Aura3D 4.5.0

**Verdict:** No change needed. The game authors output options, post effects and custom shader materials, so it stays on the HDR chain. It has no authored lights, so the exposure change does not reach it. Its canvas read-backs run in the same task as the render. Only bloom fusion (a visual difference of at most 1/255 per channel, measured on the PBR viewer, not on this scene) is new, and it is worth confirming once. Everything below comes from reading the code. The checks were run on 2026-10-29 by audit lane G23 (remote software WebGL2; results in the checklist and in `evidence/where-the-wind-wanders-port/audit-fix/README.md`): fused and unfused bloom differ by at most 1/255 on this scene.

## What this game uses

- `apps/showcase-where-the-wind-wanders-port/src/main.ts` is a 3-line wrapper. It imports `apps/showcase-port-shared/diag.ts` and the real game in `examples/where-the-wind-wanders-port/main.ts`. `apps/showcase-where-the-wind-wanders-port/package.json` is already at 4.5.0 (`@aura3d/engine` is `workspace:*`).
- One `createAuraApp` call, at `examples/where-the-wind-wanders-port/main.ts:302-309`:
  - `autoStart: false`, `resize: false`, `pixelRatio: 1`.
  - `renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }`.
  - `output: { toneMapping: "aces", exposure: 1.25, dither: false }`.
  - There is no `quality` option, so it resolves to `"auto"` in 4.5.0.
  - There is no `preserveDrawingBuffer` option.
- The frame is drawn by a manual `app.step(0)` inside `render()` (`main.ts:140`).
- The scene sets `.background("#b8d0bd")` (`world.ts:177`). It does not opt out of tone mapping, so it is not a render-path blocker.
- Post effects (`examples/where-the-wind-wanders-port/world.ts:376-378`): `effects.bloom` (intensity 0.32, threshold 1.05, radius 0.55), `effects.colorGrade` and `effects.vignette`.
- About 15 custom GLSL materials (`world.ts:23-117`: `material.custom` with wind, paint, sea, sky, prop, traveller, glow, mote, haze, stream, shaft and blob shaders). Several are transparent or additive.
- Instanced GLB models via `instances.model` for pines (`models.ts:38`), oaks (`models.ts:39`) and shrubs (`models.ts:41`), all with `castShadow: false`. Cottages (`models.ts:33-35`), belltower (`models.ts:36`), stones (`models.ts:42`), and hero, wisp, boat and letters (`models.ts:46-49`) are plain `model()` nodes.
- No `lights.*` or `environments.*` nodes anywhere in the example. The only engine imports are `camera, effects, geometry, material, scene` in `world.ts:10`, `instances, model` in `models.ts:5` and `createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks` in `main.ts:9`. A grep for lights, environments, ambient, hemisphere, directional, sky and looks found only GLSL shader code.
- The hero animation uses `hero.play(gait, { loop: false, captureTime, crossFade })` (`models.ts:79`) and `createLocomotion` from `@aura3d/engine/game` (`models.ts:63`). It does not use `playLayer`, masks or `addClipsFrom`.
- Fixed-step helpers: `createFixedStepLoop` (`main.ts:144`) and `createFixedStepPresenter` (`presentation.ts`).
- Canvas read-back code: `__AURA_WIND__.pixels()` (`main.ts:226-238`) and `.frame()` (`main.ts:275-284`) both call `render()` and then `drawImage(canvas, ...)`.
- QA hooks via `installQaHooks("wind", ...)` (`main.ts:214`).
- A `?diag=1` panel in `apps/showcase-port-shared/diag.ts`. It reads the page's `__AURA_WIND__` hook and does not call the engine directly.
- Tests that touch it: `tests/browser/where-the-wind-wanders-port.spec.ts`, `tests/browser/where-the-wind-wanders-port-motion.spec.ts`, and `tests/unit/where-the-wind-wanders-port/*.test.ts`.

## What changes for this game in 4.5.0

### 1. Bloom fusion now applies (change 7). Visual effect: at most 1/255 per channel on the PBR viewer; unmeasured here.

- **What happens now:**
  - Quality defaults to `"auto"`, and `bloomFusionAllowed("auto")` is true (`packages/engine/src/agent-api/app/renderPath.ts:24-26`).
  - The game has a bloom effect (`world.ts:376`) and runs on the HDR path, so the fused bloom chain is used with the default mode `"separable"` (`renderPath.ts:33-39`).
  - The 4.5.0 notes say frames stay within 1/255 of the unfused result, measured on the PBR viewer. Measured on this scene on 2026-10-29 (remote run g23-after2, letter-glow frame at 640x360, default against `?aura3d-render=production`, two frames 60 steps apart): mean absolute difference 0.0001 to 0.0002 per channel, maximum 1/255, no channel more than 2/255 apart.
  - The code behind the difference is the new bloom prefilter-downsample and composite programs in `packages/rendering/src/webgl2/LegacyPost.ts` and `packages/rendering/src/webgl2/BloomFusion.ts`.
- **Evidence:** `main.ts:302-309` sets no `quality`. `world.ts:376` adds the bloom. `renderPath.ts:33-39` reports `bloomFusion` only when the path is `hdr-msaa` and the scene has a bloom effect.
- **What to do:** nothing is required. To keep the 4.3.7 pass sequence exactly, add `quality: "production"` to the `createAuraApp` options at `main.ts:302`:

```ts
app = createAuraApp(canvas, {
  autoStart: false,
  resize: false,
  pixelRatio: 1,
  quality: "production", // restores the pre-4.5.0 pipeline; no bloom fusion
  renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
  output: { toneMapping: "aces", exposure: 1.25, dither: false },
  scene: world.scene
});
```

  Under `"auto"` there is no renderer option that turns fusion off. `renderer.bloomFusion` accepts only `"separable"` (the default, which is still the fused chain) or `"fused-2d"` (opt-in alternative). The only ways to get the unfused chain are `quality: "production"` (or `"safe-basic"`) and the URL override `?aura3d-render=production`, which also compares the two paths without a rebuild.
- **How to check:** load `/apps/showcase-where-the-wind-wanders-port/?start=1` and read `window.__AURA_WIND__.diagnostics.renderPath` (the QA hook exposes `app.diagnostics()` at `main.ts:269`). Expect `{ path: "hdr-msaa", quality: "auto", bloomFusion: "separable" }`. A value of `"off"` is not caused by canvas size, because the five-mip plan is only known at render time and is not reflected in the report. `"off"` means the quality is production/safe-basic, the path is not `hdr-msaa`, the legacy LDR route is active, or no bloom effect was found, so investigate those. Then run `tests/browser/where-the-wind-wanders-port.spec.ts` on the remote runner (`tools/remote-acr/run.sh`) and compare frames against the 4.3.7 captures.

### 2. Render path: the game stays on the HDR chain (change 1). No action; this is a confirmation.

- **What happens now:** `renderPathBlockers` (`renderPath.ts:103-136`) lists several reasons for the HDR target, and this scene hits at least four:
  - output options are authored (`main.ts:307`);
  - effects `bloom`, `colorGrade` and `vignette` (`world.ts:376-378`);
  - custom shader materials (`world.ts:23-117`);
  - transparent materials (`seaSpec`, `glowSpec`, `blobSpec` and others set `transparent: true`).
- So `resolveAppRenderPath` reports `hdr-msaa`, the same chain as 4.3.7. The canvas-MSAA silhouette difference (up to 48/255 on 0.1-0.3% of pixels) belongs to the direct path and does not apply.
- **What to do:** nothing. Do not remove the effects or `output` options without checking `diagnostics().renderPath`. If you did, the scene would move to the direct path and its tone encoding and blending order would change.
- **How to check:** `__AURA_WIND__.diagnostics.renderPath.path === "hdr-msaa"` (see item 1).

### 3. Canvas read-back and `preserveDrawingBuffer` (change 2). Safe as written; there is one trap to avoid.

- **What happens now:** the drawing buffer is no longer preserved unless the page URL has `?capture=1` or `?qa=1` (`renderPath.ts:181-192`). A canvas read after an `await` can come back blank.
- **Why this game is safe:**
  - `pixels()` and `frame()` are marked `async`, but there is no `await` between `render(VIRTUAL_STEP_MS)` and `drawImage` / `toDataURL` (`main.ts:226-238, 275-284`).
  - `render()` calls `app.step(0)`, which renders synchronously (`packages/engine/src/agent-api/app/createAuraApp.ts:763-800`). The buffer is therefore populated in the same task as the read.
  - `installQaHooks` captures through `app.capture()` (`packages/engine/src/qa/hooks.ts:101-104`), which re-renders before reading.
  - The specs use `page.screenshot` (`tests/browser/where-the-wind-wanders-port.spec.ts:214`), which reads the page compositor and not the WebGL buffer.
- **What to do:** nothing today. Keep it this way: if you ever add an `await` between `render()` and the canvas read, pass `preserveDrawingBuffer: true` to `createAuraApp` or use `app.screenshot()`. Do not read the canvas from a later callback.
- **How to check:** run the browser spec, which calls `frame()` and `pixels()` (`where-the-wind-wanders-port.spec.ts:88-94`). A blank frame there means this changed. Also load the page once with `?capture=1` and once without, and compare a `__AURA_WIND__.frame()` result.

### 4. Console deprecation warning for `renderer.qualityProfile` (not new in 4.5.0, but visible)

- **Observation:** `renderer.qualityProfile: "production"` (`main.ts:306`) is deprecated and logs a warning (`packages/engine/src/agent-api/app/rendererOptions.ts:245-247`). `git diff main...beat3js2/integration` shows that line is unchanged, so this is not a 4.5.0 regression.
- **What it does not do:** in 4.5.0 it is not read as a pipeline request. `requestedQuality` ignores it (`renderPath.ts:151-152`), which is why this game ends up on `auto`.
- **Optional:** if you want it quiet, replace it with the documented `renderer.quality` option, but only after confirming the pixel-ratio and draw-budget behaviour you want. This game also forces `pixelRatio: 1`. Effect on the look is unknown; check before changing.

### 5. Bloom/colour-grade/vignette receipts (git history note)

- The 4.5.0 history says the colour-grade and vignette receipts were regenerated and the causes recorded. In `git diff main...beat3js2/integration`, the post-process changes are: `packages/engine/src/agent-api/compiler/postprocess.ts` (a 2-line comment about contact shadows), the new `packages/rendering/src/webgl2/BloomFusion.ts`, and `packages/rendering/src/webgl2/LegacyPost.ts` (about 290 lines, all bloom prefilter-downsample, weighted-mip and composite programs). I found no change to the grade, vignette or dither shaders this game uses. `Samplers.ts` changes are allocation/memoisation only, and `TextureFormats.ts` adds point-sampling for RGBA32F effect targets (change 9), which the game does not use.

## Changes that do not affect this game

- **Exposure / implicit environment fill (change 3):** the scene has no authored light nodes. `explicitLightFillFree` returns null when there are zero lights (`packages/engine/src/agent-api/compiler/environment.ts:50-53`, called under the `implicitFill === false` gate at `environment.ts:172-173`), so the old category fallback path is still taken. The new look-preset fills (`night-city`, `polar-night`, `neon-arcade`, `space`, `underwater`) are not used; there are no `looks.*` calls. The authored `.background(...)` does not change this.
- **`OPTION_IGNORED` (change 4):** the game calls no `primitives.*` or `interactions.*`. `instances.model` hands its options to `model()`, which does not record `OPTION_IGNORED` (`packages/engine/src/agent-api/nodes/instances.ts`, and only `primitives.ts` / `interactions.ts` import `ignoredOptionsNote` from `optionDiagnostics`). The options it passes (`name`, `targetHeight`, `transforms`, `castShadow`, `receiveShadow`, `collider`) are ordinary model options. The new `primitive()` forwarding of `renderOrder`, `frustumCulled` and similar does not apply.
- **`interactions.orbit` (change 5):** not used. The camera is a `camera.perspective` driven by `cam.setPose` (`world.ts:178, 510, 521`).
- **Instancing changes (change 6):**
  - The game uses no `setInstanceTransforms`; transforms are fixed at build time.
  - The shadow proxy needs shadow-casting built-in primitives with at least 1024 instances. The game's instances are GLB models with `castShadow: false`, and there are no lights.
  - Cascade capping, dense depth batching and skipped shadow cascades are all shadow work, and the scene has no shadow-casting light.
  - Per-instance frustum culling only starts at 512 instances (`packages/rendering/src/renderer/InstanceFrustumCull.ts`, `MIN_CULLED_INSTANCES`). Shrubs are 5 per cottage with 2 cottages (about 10). Trees come from `tryPlace` targets summing to 158 (`scenery.ts:352-356`) plus the loops at `scenery.ts:362` and `400`, split between pines and oaks, so each draw is very likely under 512. This is unmeasured; `stats.trees` confirms it. If any draw crosses 512, culling is documented as pixel-identical and only cheaper.
- **`effects.contactShadows` (change 8):** not used. The game draws its own blob shadow (`blobSpec`, `world.ts:354`).
- **AO, depth of field, god rays, TAA, motion blur, auto exposure float targets (change 9):** none of these effects is in the scene.
- **Animation and physics (change 10):** the game calls `hero.play(...)` only (`models.ts:79`). The changes are to `playLayer` masks, `addClipsFrom` and the retarget worker, none of which it calls. The diff of `actorAnimationHandle.ts` touches only those two methods. There is no physics.
- **Math and animation fixes (change 11):** the example imports nothing from `@aura3d/math` and does not use `Clock`, `AnimationClip`, `ShapeGeometry` or `SphericalHarmonics3`. Its geometry is built by its own `meshkit.ts`.
- **Scene kits and built-in humanoid provenance (change 12):** no scene kit is used. The hero is a Meshy GLB (`assets/models/hero.glb`), not the built-in humanoid.
- **Per-frame cost changes (change 13):** these do not change what is drawn. `getError` is now sampled by default, but the engine switches it to every frame for render-source (evidence/QA) runs, strict apps, and any page loaded with `?diag=1` (`packages/engine/src/agent-api/compiler/renderer.ts:107-110`). That switch is made by the engine from the URL and does not depend on the game's diag panel (`apps/showcase-port-shared/diag.ts`), which only reads `drawCalls`, `backend` and tier fields from the page hook. Frame-time numbers may differ, especially with `?diag=1`.
- **Package version pins (change 14):** already done. `apps/showcase-where-the-wind-wanders-port/package.json` is `4.5.0`.

## Checklist

- [x] Confirm `apps/showcase-where-the-wind-wanders-port/package.json` still says `4.5.0` and `pnpm install` resolves `@aura3d/engine` to the workspace.
- [x] Run `pnpm --filter @aura3d/showcase-where-the-wind-wanders-port typecheck`. (2026-10-29: `tsc -p apps/showcase-where-the-wind-wanders-port/tsconfig.json --noEmit`, 0 errors.)
- [x] Run `node tools/game-checks/run.mjs where-the-wind-wanders-port` and confirm 0 errors. (2026-10-29: 0 errors, 0 warnings.) The runner accepts a slug, app folder name or title, and `where-the-wind-wanders-port` is listed in `tools/game-checks/data`, so no fallback should be needed.
- [x] On the remote runner (`tools/remote-acr/run.sh`), load the page and read `__AURA_WIND__.diagnostics.renderPath`. (2026-10-29: `hdr-msaa`, `auto`, `separable`, as expected.) Expect `path: "hdr-msaa"`, `quality: "auto"`, `bloomFusion: "separable"`. Any other `bloomFusion` value (including `"off"`) means the render path or quality is not what this guide assumes; investigate before continuing.
- [x] Run the remote capture on the remote runner (2026-10-29: `tests/browser/audit-fix/where-the-wind-wanders-port.spec.ts`, which reads the canvas the same way as `frame()`; every frame non-blank, steady-state mean luma 164.5 at 1280x720 on both builds, bloom fusion within 1/255). Originally: run `tests/browser/where-the-wind-wanders-port.spec.ts` and `where-the-wind-wanders-port-motion.spec.ts` on the remote runner. Confirm `frame()` and `pixels()` return non-blank images and compare against the 4.3.7 captures. Expect differences of at most 1/255 from bloom fusion (unmeasured on this scene; treat a larger difference as a finding).
- [x] Run the unit tests in `tests/unit/where-the-wind-wanders-port/` (2026-10-29: 9 files, 79 tests pass) (sim, locomotion, presentation, hero-animator, shaders-compile, reference-replay).
- [x] Read `__AURA_WIND__.diagnostics.warnings` and the console after boot. (2026-10-29: no `OPTION_IGNORED` or `QUALITY_OPTION_INVALID`; console warnings are only the SwiftShader ReadPixels stall.) Confirm no new `OPTION_IGNORED` or `QUALITY_OPTION_INVALID` entry, and note the existing `qualityProfile` deprecation message.
- [x] Read `__AURA_WIND__.stats.trees` (the audit found 535 instanced pines, above 512, so per-instance culling runs on that draw; frames are unchanged between builds and the allocation is engine row SI-2) to confirm the tree count (pines plus oaks) stays under 512 per instanced draw (shrubs are about 10). If a draw is above 512, confirm frames are unchanged and frame time did not get worse.
- [x] Decided 2026-10-29: keep `quality` unset (fused bloom), because the measured difference is at most 1/255. Decide whether to keep `quality` unset (fused bloom) or add `quality: "production"` at `examples/where-the-wind-wanders-port/main.ts:302` to keep the 4.3.7 pipeline exactly. There is no per-option way to disable fusion under `"auto"`. If you add it, re-run the checks above.
- [x] Kept: no `await` was added between `render()` and the canvas read. Before adding any `await` between `render()` and `drawImage` / `toDataURL` in `pixels()` or `frame()`, add `preserveDrawingBuffer: true` to the `createAuraApp` options.
- [x] Kept: effects, `output` and the custom materials are unchanged, and `renderPath` still reports `hdr-msaa`. Do not remove `effects.*`, `output` or the custom shader materials without re-checking `diagnostics().renderPath`; doing so could move the scene to the direct path.
