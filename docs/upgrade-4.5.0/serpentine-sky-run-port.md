# Serpentine Sky Run (`serpentine-sky-run-port`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. Nothing in the source breaks on 4.5.0, but the game now renders at quality `"auto"` instead of the old pipeline, and its lighting convention changed, so the lit GLB models need a visual check and the `createAuraApp` options should be made explicit.

## What this game uses

- `apps/showcase-serpentine-sky-run-port/src/main.ts` (3 lines): imports `apps/showcase-port-shared/diag.ts` and then mounts `examples/saiyan-snake-way-port/main.ts`. The app's `package.json` is already `4.5.0`. The app has no code of its own and `apps/common` is not imported.
- `examples/saiyan-snake-way-port/main.ts:380-387`: one `createAuraApp(canvas, { autoStart:false, resize:false, pixelRatio:1, renderer:{ mode:"production", qualityProfile:"production", fallback:"safe-basic" }, output:{ toneMapping:"none", dither:false }, scene })`. No `quality`, no `preserveDrawingBuffer`, no `strict`. The loop calls `app.step(0)` every frame (`main.ts:246`).
- `examples/saiyan-snake-way-port/world.ts:155-159`: `scene().background("#f2c6de")`, `lights.hemisphere` (intensity 1.1), `lights.directional` "sun" (intensity 2.2, `shadow: { cascades: 1, maxDistance: 80 }`, or `false` with `?shadow=0`). There is no `environments.*` node and no `looks.*` preset.
- `world.ts:253-254`: `effects.bloom` (intensity 0.12) and `effects.antiAlias` (fxaa). No AO, depth of field, god rays, TAA, motion blur, auto exposure or contact shadows.
- `world.ts:177-236`: `geometry.custom(geometry.dynamic(...))` for the road. `primitives.sphere/box/cylinder/capsule/cone/polyhedron` use only `name`, `size`, `params` and `material`. Every primitive uses `material.custom(...)` (toon-shaded custom shaders from `materials.ts` and `shaders.ts`; they read the sun shadow map through `a3dSunShadowAuto`, `shaders.ts:86`, but not the authored lights or the environment fill). Props are pooled and moved with `.position()`/`.runtime({ id })`. The only surfaces lit by the scene lighting are the GLB models: `model(MESHY.lantern/island/entity)` (`world.ts:223-224, 245`) and the rigged runner.
- Rigged runner: `cloneSkinned(...)` (`world.ts:114`), `attachRootRenderSource` (`world.ts:272`), and `runner.actor.playClip(clip, t)` driven by a local counter (`world.ts:340-342`). There are no animation layers, masks, `addClipsFrom` or physics.
- Canvas read-back: only `app.capture({ type: "png-blob" })` in the QA hook (`main.ts:357-359`). The example has no `readPixels`, `toDataURL`, `toBlob` or `drawImage(canvas)`.
- `apps/showcase-port-shared/diag.ts`: with `?diag=1` it calls `installSafetyNet` from `@aura3d/debug` (`selfHeal:false, panel:true`). `@aura3d/debug`'s black-frame probe does `drawImage(canvas)` (`packages/debug/src/safety/blackFrame.ts:244`).
- No `instances.*`, `interactions.*`, `Clock`, `AnimationClip`, `ShapeGeometry` or `SphericalHarmonics3`. Only `examples/saiyan-snake-way-port/world.ts:270` has a local variable named `actorClock`.
- Tests: `tests/unit/saiyan-snake-way-port/*` (pure, with `world.test.ts` building the scene without a GPU), and browser specs `tests/browser/saiyan-snake-way-*.spec.ts`, `port-sun-shadows-serpentine-sky-run.spec.ts`, `shotsb-serpentine.spec.ts`, `live-ports-smoke.spec.ts`.

## What changes for this game in 4.5.0

### 1. Quality is now `"auto"`, so the bloom optimisation switches on (changes 1, 7, 6 in part)

What happens now: `quality` is not set, so `requestedQuality()` returns `undefined` and the app resolves to `"auto"` (`packages/engine/src/agent-api/app/renderPath.ts:138-153, 155-156`; blockers evaluated at 168). `renderer.mode: "production"` and `renderer.qualityProfile: "production"` do NOT select quality `"production"`. The code comment (`renderPath.ts:151`) says `qualityProfile` is a pixel-ratio/draw-budget preset, not a pipeline request.

- The direct canvas path is not taken. `renderPathBlockers` (`renderPath.ts:~117-131`) lists the game's `output` option (`main.ts:385`), `effects.bloom` and `effects.antiAlias` (`world.ts:253-254`), and the custom materials. The game keeps the HDR chain (`path: "hdr-msaa"`).
- Because quality is `"auto"` on the HDR route with a bloom effect, bloom pass fusion is on (mode `separable`, the default). The change notes say frames stay within 1/255.
- `packages/engine/src/agent-api/compiler/renderer.ts:125-126` turns on `skipUnusedShadowCascades` for `auto`. With `cascades: 1` this does nothing: `unusedCascadeIndices()` returns `undefined` when there are fewer than two cascades (`packages/rendering/src/shadows/CascadeUse.ts`, the `fits.length < 2` guard), so every cascade is still drawn.
- Under strict mode, `renderer.mode` and `renderer.fallback` throw `AuraMigrationError` (`createAuraApp.ts:117-128`). The game does not set `strict`, so nothing throws today. (The error text suggests `renderer.quality`; that is the low/medium/high/ultra/auto tier setting, not the top-level pipeline option `quality` used below.)

What to do: choose one of these.
- Keep `"auto"` (recommended, since it is the new default) and drop the deprecated fields:
```ts
app = createAuraApp(canvas, {
  autoStart: false,
  resize: false,
  pixelRatio: 1,
  quality: "auto",
  output: { toneMapping: "none", dither: false },
  scene: world.scene
});
```
- Or pin the old render path: add `quality: "production"` to the same options. This restores the HDR target / pass sequence, but NOT the old lighting. The 4.5.0 lighting convention in section 2 is applied regardless of quality (`compiler/renderer.ts:152` passes `implicitFill: false` unconditionally).

Dropping `renderer: { mode, qualityProfile, fallback }` is safe for rendering: the pixel ratio stays 1 because the explicit option wins (`app/pixelRatio.ts:33`, so the profile's 1.5 is not what the game uses today), and `renderer.mode` defaults to `"production"` for every profile (`app/rendererOptions.ts:118-120`). The only side effects are the look-lint `production` flag (`createAuraApp.ts:385`) and the profile id shown in `diagnostics().renderer`.

How to check:
- In a page, read `app.diagnostics().renderPath` (the QA hook at `main.ts:324-328` exposes `app`). Expect `path: "hdr-msaa"`, `quality: "auto"` (or `"production"` if you pin it) and `bloomFusion: "separable"` (or `"off"` when pinned).
- `?aura3d-render=production` (`renderPath.ts:139-143`) switches only the render path on the same build. It does not reproduce 4.3.7 lighting, so it cannot be used to isolate the lighting change in section 2.
- Run `tests/browser/port-sun-shadows-serpentine-sky-run.spec.ts` and `tests/browser/saiyan-snake-way-port.spec.ts` on the remote runner (`tools/remote-acr/run.sh`).

### 2. Lighting: no implicit scene fill, hemisphere light now counts (change 3)

What happens now: the scene has authored lights (hemisphere and directional, `world.ts:158-159`) and no `environments.*` node. The renderer calls `createProductionRuntimeEnvironment(snapshot, flags, { implicitFill: false })` (`packages/engine/src/agent-api/compiler/renderer.ts:152`). That lights the scene from the authored lights only (`compiler/environment.ts:172-181`, preset `authored-lights`), with `environmentMapIntensity: 0` and `environmentMapSpecularIntensity: 0`. The hemisphere light enters as a uniform term, the mean of its sky and ground colour times its intensity, in linear light (`environment.ts:55-68`: `(#f6d0e6 + #b98a2e) / 2 * 1.1`). In 4.3.7 this setup got the scene-category studio/gameplay fill and the hemisphere light was not summed in (only ambient lights were), so the old fill is gone and the hemisphere term is new.

Which parts change: only the surfaces lit by the scene lighting, meaning the rigged runner, the Meshy lanterns and floating islands, and the Meshy entity props. The `material.custom` surfaces and the sky and road do not read the authored lights or the environment fill, so they should not change (their sun-shadow lookups are covered in the checks below). Expected direction: darker GLB models with no environment specular. The comment on the new code (`environment.ts:34-44`) says the old fill lifted other scenes roughly 2x to 6x; the size for this scene was not measured.

What to do: compare before and after. If the GLB models look too dark, pick one:
- Raise the hemisphere or sun intensity. This is a light change and keeps the no-IBL look.
- Add `output.exposure` (a linear multiplier, default 1, `packages/engine/src/contracts/output.ts`) to the existing `output` object. The game already authors `output`, so this does not change the render path. Not verified: whether exposure has any effect while `toneMapping` is `"none"`; check on a frame.
- Add `environments.studio()` to restore a studio fill with image-based lighting. It is exported from `@aura3d/engine` (`agent-api/index.ts:285`), takes optional `{ name, intensity, color, background }`, and uses `background: false` by default so the clear colour stays:
```ts
import { environments } from "@aura3d/engine";
// in buildWorld(): builder.add(environments.studio());
```
  This also restores specular reflections on the GLBs, so it changes them more than an exposure or intensity bump.

How to check: capture the same frames (runner on the road, lanterns, islands) with `?capture=1` on the 4.3.7 checkout (`main`) and on `beat3js2/integration`, using the reference frames the `saiyan-snake-way-art` / `-match` specs use, and compare. Also compare the sun-shadow frames from `port-sun-shadows-serpentine-sky-run.spec.ts`, since the custom shaders sample the sun shadow map and the shadow contrast on the lit GLBs changes with the fill. Run `node tools/game-checks/run.mjs serpentine-sky-run-port` for the game checks.

### 3. Canvas read-back (change 2): works, with one low-risk caveat

- `preserveDrawingBuffer` now defaults to `false` except under `?capture=1` / `?qa=1` (`renderPath.ts:181-193`). The game's only read-back is `app.capture({ type: "png-blob" })` (`main.ts:359`). That path renders one frame synchronously with `app.step()` and calls `readPixels` in the same task (`packages/engine/src/lanes/prd01/outputSurface.ts:250-266`), so it does not depend on the preserved buffer. No code change is needed.
- Browser specs use Playwright `page.screenshot`, and the QA hook's `frame()`/`pixels()`, which are built on `app.capture()` and draw the returned bitmap, not the canvas (`packages/engine/src/qa/hooks.ts:101-143`; `tests/browser/port-sun-shadows-lib.ts:74-87`). Neither reads the drawing buffer after an await.
- Caveat: `?diag=1` (`apps/showcase-port-shared/diag.ts`) installs `@aura3d/debug`'s black-frame watch, which does `drawImage(canvas)`. That file documents that it must sample in the same task as the draw. This game passes a hook-derived app, not a frame tap, and `selfHeal:false`, so I expect no effect. I did not run it, so treat that as unverified. If the diag panel reports black frames, add `preserveDrawingBuffer: true` to the options only for `?diag=1`.

### 4. Package version (change 14)

`apps/showcase-serpentine-sky-run-port/package.json` is already `"version": "4.5.0"` with `@aura3d/engine: workspace:*`. No change needed.

## Changes that do not affect this game

- Direct render path (change 1, first half): not taken, because `output` options, effects and custom materials block it (`main.ts:385`, `world.ts:253-254`).
- OPTION_IGNORED (change 4): every `primitives.*` call uses only `name`, `size`, `params`, `material` and `position`, all in `PRIMITIVE_OPTION_KEYS` (`nodes/primitives.ts:58-64`). The game uses no `instances.*` or `interactions.*`. Check `app.diagnostics()` for `option-ignored` once to confirm, since I did not run it.
- `interactions.orbit` (change 5): not used.
- Instancing, shadow proxy, dense depth batching, cascade cap (change 6): no `instances.*`, no `setInstanceTransforms`. The only shadow caster is one directional light with a single cascade, and cascade skipping needs at least two (see section 1).
- `effects.contactShadows` (change 8): not used. The "contact-shadow" in `world.ts:233` is a `material.custom` blob cylinder.
- AO, depth of field, god rays, TAA, motion blur, auto exposure float-target fix (change 9): none of these effects are in the scene.
- Animation and physics fixes (change 10): the game uses `playClip` on a single clip, with no `playLayer`, masks, `addClipsFrom` or physics.
- Math and animation fixes (change 11): no `Clock`, keyframe step tracks, `ShapeGeometry` or `SphericalHarmonics3` in the game.
- Scene kits and built-in humanoid provenance (change 12): no scene kits; the runner is the example's own `assets/runner.glb`.
- Per-frame cost (change 13): applies automatically and needs no code change. `getError` is sampled unless frame/strict mode or `?diag=1` is on.

## Checklist

- [ ] Replace `renderer: { mode, qualityProfile, fallback }` in `examples/saiyan-snake-way-port/main.ts:384` with an explicit `quality: "auto"` (or `quality: "production"` to keep the old render path; lighting still changes either way), keeping `pixelRatio: 1` and `output`.
- [ ] Read `app.diagnostics().renderPath` and confirm `path: "hdr-msaa"` and `bloomFusion: "separable"` (`"off"` if pinned to production).
- [ ] Capture `?capture=1` frames of the runner, lanterns and islands on `main` (4.3.7) and on `beat3js2/integration` (4.5.0) at the same game state and compare. If the GLB models are too dark, raise the light intensities, add `output.exposure`, or add `environments.studio()` (see section 2).
- [ ] Compare the sun-shadow frames from `port-sun-shadows-serpentine-sky-run.spec.ts` on both versions.
- [ ] Open `?diag=1`, let the game run a few seconds, and check the diag panel shows no black-frame report; if it does, add `preserveDrawingBuffer: true` for `?diag=1` only.
- [ ] Check `app.diagnostics()` for any `option-ignored` entries.
- [ ] Run `pnpm vitest run tests/unit/saiyan-snake-way-port` (not run here; read-only task).
- [ ] Run the browser specs on the remote runner (`tools/remote-acr/run.sh`): `port-sun-shadows-serpentine-sky-run`, `saiyan-snake-way-port`, `saiyan-snake-way-art`, `live-ports-smoke`.
- [ ] Run `node tools/game-checks/run.mjs serpentine-sky-run-port`.
