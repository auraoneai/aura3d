# Ion Circuit (`heatsink-port`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. Nothing in the game breaks on 4.5.0, but the lit Meshy models (drone, pickups, barrels, pylons, scenery) will probably render darker and lose their reflections, because the scene has authored lights and no `environments.*` node. Re-check the look and, if it is darker or flatter than you want, add an environment.

I only read code. I did not build or run anything, so the size of the brightness change is unknown.

## What this game uses

- Entry: `apps/showcase-heatsink-port/src/main.ts`. It imports `apps/showcase-port-shared/diag.ts` (the `?diag=1` panel from `@aura3d/debug`) and `examples/heatsink-port/main.ts`. There is no `apps/common` import. The same `examples/heatsink-port` code is also served at `/examples/heatsink-port/`.
- Package pin: `apps/showcase-heatsink-port/package.json` is already `4.5.0` (`@aura3d/engine` is `workspace:*`). That is the only file in this game that differs between `main` and `beat3js2/integration`.
- One `createAuraApp(canvas, {...})` call at `examples/heatsink-port/main.ts:248-254`:
  - `renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }`
  - `output: { toneMapping: "aces", dither: false }`
  - `autoStart: false`, `resize: false`, `pixelRatio: 1`
  - There is no `quality` option and no `preserveDrawingBuffer` option. The frame is driven by `app.step(0)` (`main.ts:120`).
- Scene (`examples/heatsink-port/world.ts`):
  - `geometry.custom(geometry.dynamic(...))` with `material.custom(...)` for the road, terrain, rails, arches, veils, pads, bolts, streaks and exhaust points (lines 83-174).
  - A `primitives.sphere` sky dome with `material.custom` (line 98), and `primitives.sphere`/`torus` strike targets (lines 133-134). Some drone parts use additive transparent `material.custom` (lines 150-153).
  - `lights.hemisphere` intensity 1.1 (line 101) and `lights.directional` with a 2-cascade shadow (line 102).
  - `effects.bloom`, `effects.colorGrade` and `effects.vignette` (lines 176-178).
  - No `environments.*` node and no `looks.*` or post preset.
- Lit models (`examples/heatsink-port/models.ts`): `model(...)` for the drone, barrels and pickups (lines 29-36). `instances.model(...)` for scenery (4 classes, line 63) and gate pylons (line 90). All have `castShadow: false`, and the instance counts are small (dozens).
- Canvas read-back: `grabCanvas()` at `main.ts:157-167` does `drawImage(canvas)`, `getImageData` and `toDataURL`. `replayTo(..., grab)` at `main.ts:225` calls it right after `render()`. `installQaHooks("heatsink", ...)` at `main.ts:171` provides `frame()` and `pixels()`.
- Not used anywhere in the game: `interactions.*`, animation layers/masks/`addClipsFrom`, physics, `Clock`, `AnimationClip`, `ShapeGeometry`, `SphericalHarmonics3`, `effects.contactShadows`, `setInstanceTransforms`. `track.ts` imports only `CatmullRomCurve3` and `Vector3` from `@aura3d/math`.

## What changes for this game in 4.5.0

### 1. Lit models lose the implicit environment fill (change 3) — visual change, probably darker and less reflective
- **What happens now:** the scene has authored lights (`world.ts:101-102`) and no `environments.*` node. In 4.5.0 `createProductionRuntimeEnvironment(snapshot, flags, { implicitFill: false })` (`packages/engine/src/agent-api/compiler/renderer.ts:152`) takes the `authored-lights` branch (`compiler/environment.ts:172-180`). Lighting then comes only from the two lights, and the scene-category studio/daylight fill is no longer added. The hemisphere light is now counted as the mean of its sky and ground colours (rule documented at `environment.ts:35-44`, implemented in `explicitLightFillFree`, `environment.ts:50-78`, hemisphere loop at lines 63-68).
- **Reflections go too:** the `authored-lights` result sets `environmentMapIntensity: 0` and `environmentMapSpecularIntensity: 0`. The hemisphere fill becomes a flat uniform ambient term, so metallic or glossy parts of the Meshy models (check the drone hull, barrels and pylons first) lose environment reflections, not only diffuse fill.
- **What is affected:** only the PBR `model(...)` and `instances.model(...)` nodes. The road, terrain, sky, neon and veils use unlit `material.custom` and ignore lights (see `PORTING-NOTES.md`, "Meshy art pass").
- **Unknown:** how much darker the models get. The old fill depended on the scene category, which I did not resolve for this scene. The 1.1 hemisphere light now contributes as a mean of sky and ground. `color-grade` exposure is 1.05, but that is a whole-frame grade and is not a substitute for the lost fill.
- **What to do:** capture before and after. If the models are too dark or look flat, add an environment node to the scene in `world.ts` (the `Scene` builder `b`):
  ```ts
  import { environments } from "@aura3d/engine"; // add to the existing import on world.ts:8
  b.add(environments.studio({ name: "fill" }));  // next to the lights, around world.ts:101
  ```
  `environments.studio` exists (`packages/engine/src/agent-api/nodes/environments.ts:158`). It defaults to `background: false` (`environments.ts:143-152`), so the authored `#02040a` background is unchanged. It lights only the PBR models, so the unlit surfaces do not change. It is not guaranteed to match the 4.3.7 fill; tune `intensity` (default 1) if it is too bright or too dim. Do not use `output.exposure` for this, because it would also scale the unlit shader surfaces (`AuraOutputOptions.exposure`, `packages/engine/src/contracts/output.ts:11`).
- **Check:** run the game at 4.3.7 (`main`) and 4.5.0 with `?autostart=1&capture=1` and compare the drone, pylons and scenery, including their reflective parts. `tests/browser/exposure-scenes.json` lists both `heatsink-port` (line 75, `/apps/showcase-heatsink-port/?heal=0`) and `examples-heatsink-port` (line 151, `/examples/heatsink-port/?heal=0`) for the exposure scene sweep (`tests/browser/exposure-scenes-*.spec.ts`).

### 2. Render path stays on HDR; default quality is now "auto" (change 1) — no visual change expected, add a check
- **What happens now:** `createAuraApp` gets no `quality` option, so it resolves to `auto` (`renderPath.ts:resolveAppRenderPath`). `renderer.qualityProfile: "production"` is documented there as "a deprecated pixel-ratio/draw-budget preset, not a pipeline request", so it does not select the old pipeline. `renderPathBlockers` (`renderPath.ts:103`) returns blockers for this game, so it keeps the HDR chain, not the direct path:
  - `output` is authored (`main.ts:253`).
  - Effects: `effect "bloom"`, `effect "colorGrade"` and `effect "vignette"` (`world.ts:176-178`).
  - `custom material` (every `material.custom`, whose `material.kind` is `"custom"`).
  - `transparent material` (the additive drone parts).
- **What to do:** nothing is required. To pin the old pipeline byte-for-byte, add `quality: "production"` to the `createAuraApp` options at `main.ts:248`. Do not pass the game's own `config.quality` (`"high"|"low"`, `main.ts:21`) to it, because `createAuraApp.quality` only accepts `auto|production|safe-basic|cinematic`.
- **Check:** `app.diagnostics().renderPath` should report `path: "hdr-msaa"`, `quality: "auto"`, with a `reason` that starts `scene needs the HDR target:` and lists the blockers above. Also `?aura3d-render=production` switches the page to the old pipeline for a before/after comparison.

### 3. Bloom pass fusion is on under "auto" (change 7)
- **What happens now:** the scene has `effects.bloom` (`world.ts:176`), the path is `hdr-msaa`, and quality is `auto`, so the fused bloom chain applies. The default mode is `"separable"`. Measured on this game (audit lane E1, RP-05; software WebGL2 on the remote runner, the same paused frame rendered as mounted and with the production pass sequence, so the fused bloom and the cascade skip are switched off together): the mean per-pixel difference was 1.92/255 and 1.24/255 in two runs, against a repeat-of-the-same-mode noise floor of 1.10/255 and 0.86/255. That is about 0.8/255 and 0.4/255 above the floor, under the audit's 2/255 bar, but above the floor in both runs. The largest single-pixel difference was 128-129/255 (bloom-lit edges), and 16-22% of pixels differed by more than 2/255 (11-13% in the noise floor). Runs `e1-before3-r3`/`e1-after3-r3` and `e1-before4`/`e1-after4`; records in `evidence/audit-fix/e1/{before,after}/records.json` on the E1 lane branch.
- **What to do:** nothing. To opt out, pass `quality: "production"`.
- **Check:** `app.diagnostics().renderPath.bloomFusion` should be `"separable"` (it reads `"off"` under `production`).

### 4. Unused shadow cascades are skipped (change 6, last clause) — performance only
- **What happens now:** the directional light uses `{ cascades: 2, maxDistance: 160 }` (`world.ts:102`). `compiler/renderer.ts:125-126` sets `skipUnusedShadowCascades` only when the fused bloom chain is active (`isFusedBloomPasses(canvas)`), which holds here because of `auto` + HDR path + `effects.bloom`. Cascades that no receiver selects are then not redrawn. The result is pixel-identical and only the draw count drops. `quality: "production"` turns this off together with bloom fusion.
- **What to do:** nothing. `?shadow=0` (`world.ts:102`) still turns shadows off.
- **Check:** compare `diagnostics().drawCalls` against `?aura3d-render=production`.

### 5. Canvas read-back no longer survives past the frame (change 2) — currently safe, keep it that way
- **What happens now:** `preserveDrawingBuffer` now defaults to `false` unless the URL has `?capture=1` or `?qa=1` (`renderPath.ts:wantsPreservedDrawingBuffer`, used at `frameLoop.ts:95`). `grabCanvas()` (`main.ts:157-167`) reads the canvas in the same task as `render()`/`app.step(0)` (`main.ts:225`; the comment at `main.ts:213-214` says so), so it should still get real pixels. The `frame()` and `pixels()` QA hooks use `capturePng()` (`packages/engine/src/qa/hooks.ts:101,127-145`), not the live canvas. The repo's heatsink specs load the page with `?manual=1` (no `capture=1`) and rely on that same-task read.
- **Risk:** any external probe that reads the canvas after an `await` or a later `requestAnimationFrame` can get a blank frame.
- **What to do:** keep `grabCanvas()` in the same task as the render. If you add a read-back after an `await`, either load the page with `?capture=1` or add `preserveDrawingBuffer: true` to the `createAuraApp` options. For screenshots prefer `app.screenshot()`, which re-renders first (it is declared at `nodes/types/runtime.ts:398`).
- **Check:** run `replayTo(target, 30, true)` through the `__AURA_HEATSINK__` hook and confirm `shot.lit` is above 0. `tests/browser/heatsink-port.spec.ts` and `heatsink-port-meshy.spec.ts` exercise the hooks (`st.shot` not null, line 105).

### 6. Package pin (change 14)
- Already done: `apps/showcase-heatsink-port/package.json` has `"version": "4.5.0"`. Nothing to do.

## Changes that do not affect this game

- **4 (OPTION_IGNORED, primitive option forwarding):** every option used is in the allowed list (`PRIMITIVE_OPTION_KEYS`, `packages/engine/src/agent-api/nodes/primitives.ts:56-64`, which includes `geometry`, so `geometry.custom` is covered). The game passes `name`, `size`, `material` and `castShadow` to `primitives.*` (`world.ts:98,133,134,150-153`). Only `primitives.ts` and `interactions.ts` call `ignoredOptionsNote`, so `instances.model` has no ignored-option check. No `interactions.*` are used. Expect no `option-ignored` entries in `app.diagnostics()`; confirm that.
- **5 (interactions.orbit):** no `interactions.*` and no `camera.orbit`. The camera is `camera.perspective` (`world.ts:81`) driven by `cameras.chase()`.
- **6 (instancing, rest):** the instance counts are small and nothing is a shadow-casting built-in primitive instance (`models.ts:63,90`), so the shadow proxy (needs 1024 or more), dense depth batching and the 8192-caster cascade cap do not apply. There is no `setInstanceTransforms` call.
- **8 (contactShadows):** no `effects.contactShadows`.
- **9 (float-target effects):** the game uses bloom, color grade and vignette only, none of which is AO, depth of field, god rays, TAA, motion blur or auto exposure.
- **10 (animation/physics):** no animation layers, masks, `addClipsFrom` or engine physics in the game (grep of `examples/heatsink-port`; the "physics" in `PORTING-NOTES.md` is the game's own simulation).
- **11 (Clock, step tracks, ShapeGeometry, SphericalHarmonics3, `@aura3d/math/three`):** none used. The `@aura3d/math` imports in `track.ts` are `CatmullRomCurve3` and `Vector3`, which this change does not touch.
- **12 (scene kits, built-in humanoid):** no scene kits or humanoid.
- **13 (per-frame cost):** engine-internal, nothing to change. `getError` is sampled only in frame/strict mode or with `?diag=1`, and `showcase-port-shared/diag.ts` only reads the panel.

## Checklist

- [ ] Confirm `apps/showcase-heatsink-port/package.json` shows `4.5.0` (it does).
- [ ] Run `node tools/game-checks/run.mjs heatsink-port` and fix any errors.
- [ ] Run `pnpm -C apps/showcase-heatsink-port typecheck`.
- [ ] Run the unit tests in `tests/unit/heatsink-port/`, especially `reference-replay.test.ts` and `strike.test.ts` (simulation only, so they should be unaffected).
- [ ] Remote runner (`tools/remote-acr/run.sh`): load `/apps/showcase-heatsink-port/?autostart=1&capture=1` and `/examples/heatsink-port/?autostart=1&capture=1` on `main` (4.3.7) and on 4.5.0, and compare the lit models (drone, pickups, barrels, pylons, scenery) for darkening and lost reflections.
- [ ] If they are too dark or flat, add `b.add(environments.studio({ name: "fill" }))` in `world.ts` (and `environments` to the import on line 8), tune its `intensity` if needed, and recapture. Do not use `output.exposure`.
- [ ] In the browser, check `app.diagnostics().renderPath` is `{ path: "hdr-msaa", quality: "auto", bloomFusion: "separable" }` (with a `reason` listing the effect, custom-material and transparent-material blockers) and that `diagnostics()` has no `option-ignored` entries.
- [ ] Run `replayTo(n, 30, true)` through `__AURA_HEATSINK__` and confirm the grabbed `shot.lit` is above 0.
- [ ] If you need the 4.3.7 pipeline exactly, add `quality: "production"` at `main.ts:248` (and keep it separate from the game's `config.quality`).
- [ ] Re-run `tests/browser/heatsink-port.spec.ts` and the `heatsink-port` and `examples-heatsink-port` entries of `tests/browser/exposure-scenes-*.spec.ts` on the remote runner.
