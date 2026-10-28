# Slingshot Siege (`slingshot-siege`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. Nothing breaks: the scene has effects, transparent materials and an HDRI environment, so it stays on the HDR chain and keeps its lighting. But it now runs under the new default `quality: "auto"` (bloom fusion, shadow-cascade skipping), so verify the render path and decide whether to pin `quality: "production"`.

## What this game uses

- App entry: `apps/showcase-slingshot-siege/src/main.ts:61` calls `createGameApp("#app", {...})`. Its options are `diagnostics`, `renderer: { qualityProfile: "production" }`, `qualityRebuild: { flags: ["game"] }`, `input`, `loop` and `scene`. There is no top-level `quality`, `output`, `preserveDrawingBuffer` or `renderer.output`.
- Scene: `src/game/stage.ts` (`buildStage`, `buildScene`). `showcase-port-shared` and `apps/common` are not imported.
- Look and lights (`stage.ts:137-149`):
  - `looks.preset("outdoor-day", { fogDensityScale: 0, exposureEv: -0.08, ... })`. In `packages/engine/src/agent-api/looks/looks.ts` this expands (v0 expansion; `LOOK_QR_UPGRADES` is empty at `looks.ts:243`) to an `environments.hdri` (`autumn_field_puresky_1k`, `looks.ts:291-298`), a key light (`looks.ts:304-311`), `effects.colorGrade` (`looks.ts:333-342`), `effects.ambientOcclusion` (`looks.ts:343-345`) and `effects.bloom` (`looks.ts:346-350`). `V0_EFFECTS` is at `lookPresets.ts:60`.
  - Authored `lights.ambient`, `lights.hemisphere` and three `lights.directional`.
- Scene background: `stage.ts:504` `scene().background(..., { toneMapped: false })`.
- Effects: `stage.ts:485-490` adds `effects.vignette` and `effects.antiAlias({ mode: "fxaa" })`. They are skipped when `REDUCED` (`?still=1` or prefers-reduced-motion).
- Materials: transparent PBR for glass and ice (`stage.ts:82`) and for puffs (`stage.ts:102`, opacity 0.75). No custom shaders and no transmission.
- Primitives: `primitives.box/sphere/cylinder` with `name`, `material`, `castShadow`, `receiveShadow`, `instances`, `instanceColors`. Instanced groups are small (7 path, 46+18 tufts, 34 foam, a few mounds, patches, pebbles and headlands), at `stage.ts:256-273`.
- Models: Meshy and prop GLBs via `model(...)`, with `.animate({ clip, loop, speed })` at `stage.ts:343-394` and `node.setAnimation(...)` at `main.ts:102`. There are no animation layers, masks or `addClipsFrom`.
- Physics: standalone `physics.world` with `physics.box` and `physics.sphere` only (`src/game/sim.ts:194-512`). It does not use the scene-bound `physics:{ bindNodes }` option or capsule/cylinder colliders.
- Camera: `camera.perspective` driven each frame by `app.camera?.setPose` (`main.ts:299`). It does not use `camera.orbit` or `interactions.orbit`.
- Canvas read-back: none in `src/`. `installBlackFrameGuard()` from `@aura3d/debug` is imported at `main.ts:26` and called at `main.ts:29`. Evidence hooks are `installGameBeacon`, `__SS_STATE__` and `__SS_PUMP__` (`main.ts:1244-1262`).
- Tests: `tests/smoke.spec.ts` is headless and exercises `SiegeSim` only, with no renderer.
- Version: `package.json` already pins `4.5.0` for `@aura3d/engine` (`workspace:*`, version `4.5.0`).

## What changes for this game in 4.5.0

### 1. Render path: default `quality: "auto"` (applies, but the game stays on HDR)

- **Now:** `renderer.qualityProfile` is not a pipeline request (`packages/engine/src/agent-api/app/renderPath.ts:151`), so this game resolves to `quality: "auto"`. `A3D_QR_CORE` is default-on (`flags.state.ts:18`) and the `game` flag only adds `A3D_QR_GAME`, so the legacy LDR route is not taken and `renderPathBlockers` is evaluated.
- **Blockers:** `renderPathBlockers` (`renderPath.ts:103-136`) finds several in this scene. Any one of them keeps the HDR chain:
  - Effects (`vignette`, `antiAlias`, and the look's colorGrade, ambientOcclusion and bloom).
  - A background with `toneMapped:false` (`stage.ts:504`).
  - Transparent materials (`stage.ts:82`, `stage.ts:102`).
  - An `hdri` environment.
- **Result:** The scene should report `path: "hdr-msaa"`, and silhouette-edge MSAA differences from the direct path should not appear. This is expected from reading the code, not measured.
- **Do:** Run the page and, in the browser console, evaluate `window.__AURA3D_GAME__.app.diagnostics().renderPath`. Confirm `path` is `"hdr-msaa"` and `quality` is `"auto"`. (The beacon is replaced on every publish, so re-read `window.__AURA3D_GAME__` each time.)
- **Optional pin:** To keep the 4.3.7 pipeline byte-for-byte (which also turns off bloom fusion and cascade skipping in items 3 and 4), add a top-level `quality` option. This is a different knob from `renderer.quality`.
    ```ts
    const gameApp = createGameApp("#app", {
      quality: "production",
      // ...existing options
    });
    ```
    `renderPath.ts:145-149` reads `options.quality`; `?aura3d-render=production` (`renderPath.ts:139-144`) does the same from the URL for a one-off comparison and wins over the option.
- **Also:** `renderer.qualityProfile: "production"` was already deprecated in 4.3.7 (`rendererOptions.ts:245`, same text on `main`) and still logs a deprecation warning. It is safe to leave. If you remove it, expect pixel ratio and draw-budget defaults to change, so re-check frame cost.

### 2. `preserveDrawingBuffer` now false (applies in principle; no action required in game code)

- **Now:** Default is false except `?capture=1` / `?qa=1` (`renderPath.ts:181-194`, `wantsPreservedDrawingBuffer`). The game has no `readPixels`, `drawImage(canvas)`, `toDataURL` or `toBlob`.
- **Black-frame guard:** `installBlackFrameGuard()` samples inside the same task as the draw via a WebGL frame tap (`packages/debug/src/safety/guard.ts:5-7`), so it is designed for canvases without `preserveDrawingBuffer`.
- **Capture tooling:** `tools/filmstrip/capture-films.mjs` builds the page URL at `:111` (`/apps/${cfg.route}/?autoplay=1`; the `siege` entry is at `:66-70`). It grabs frames with CDP `Page.captureScreenshot` first (`:160-166`) and falls back to `canvas.toDataURL` (`:171`); only that fallback is affected by the new default. The exposure-parity evidence run (`evidence/exposure-parity/frames/scenes.json:477`, duplicated at `:1157`) loads `/apps/showcase-slingshot-siege/?heal=0`. Whether a plain screenshot of that URL is blank without `?capture=1` is unknown, and I did not run it.
- **Do:** Add `&capture=1` to the URL at `capture-films.mjs:111` and to the `scenes.json` URLs for this game, or use `app.screenshot()` / `app.capture()`. Don't add `preserveDrawingBuffer: true` to the game itself unless a probe fails.
- **Check:** Capture frames with and without `?capture=1` and compare; confirm the black-frame guard does not reload the page (no `?aura3d-...` rung-down reload).

### 3. Look preset and bloom/AO/colorGrade effects get 4.5.0 render fixes (applies, automatic)

- **Bloom fusion (change 7):** The look adds `effects.bloom` (`looks.ts:346-350`), the path is `hdr-msaa`, and quality is `auto`, so fused bloom is allowed (`renderPath.ts` `bloomFusionAllowed`, `reportedBloomFusion`). `renderer.bloomFusion` defaults to `"separable"`. Frames are stated to stay within 1/255, but I did not measure this game.
- **Check:** `app.diagnostics().renderPath.bloomFusion` should be `"separable"`, and `"off"` if you pin `quality: "production"`.
- **AO float targets (change 9):** The look adds `effects.ambientOcclusion` (`looks.ts:343-345`). On devices without float linear filtering, AO now samples with point filtering, so the AO term becomes visible there where it previously did nothing. Compare on a device or software-GL profile without `OES_texture_float_linear`.
- **Do:** Re-capture the chapter 1 and chapter 6 first frames with `?capture=1` and compare against the 4.3.7 frames for ground contact darkening. Expect a darker AO term on such devices, not elsewhere.

### 4. Shadow cascades no receiver selects are skipped (applies, automatic, `auto` only)

- **Now:** The look adds `lights.directional({ name: "look key light", shadow: true })` (`looks.ts:304-311`). The game has receivers at `stage.ts:256-273`. On `auto`/`cinematic`, unselected cascades are skipped.
- **Instancing items in change 6 do not apply:** every instanced node in the game has `castShadow: false` (`stage.ts:267-273`), so the `>= 1024` shadow-proxy rule cannot trigger. The shadow casters are non-instanced primitives (for example `stage.ts:455`, `468-472`) and GLB models, and the pools in `POOL` are far below the 8192-caster cascade cap.
- **Do:** Compare the shadow edges of towers and gulls in a capture; if you see a difference, pin `quality: "production"`.

## Changes that do not affect this game

- **Exposure / implicit environment fill (3):** The look preset adds an `environments.hdri` node (`looks.ts:291-298`; `LOOK_QR_UPGRADES` is empty, so it is always the v0 `autumn_field_puresky_1k`), so `createProductionRuntimeEnvironment` takes the authored-environment branch (`packages/engine/src/agent-api/compiler/environment.ts:94-170`) and never reaches the new lights-only path. The hemisphere-contribution change applies only to the no-environment lights-only source, so it does not change this scene. `exposureEv: -0.08` still goes through the look's colorGrade. The new `fill` presets cover night-city, polar-night, neon-arcade, space and underwater only, not `outdoor-day`. If chapters override the look to one of those presets, check that chapter. I only saw `outdoor-day` used.
- **Look expansion (3):** `resolveLookExpansion` (`looks.ts:116-129`) returns the v0 expansion unless every look contract is provided and flagged on. `A3D_QR_LOOKS` is dev (off) and this game only sets the `game` flag, so the v0 expansion described above is what runs. If the first frame is still darker than 4.3.7, check `diagnostics()`.
- **OPTION_IGNORED (4):** Every option the game passes to `primitives.*` (`name`, `material`, `castShadow`, `receiveShadow`, `instances`, `instanceColors`) is in `PRIMITIVE_OPTION_KEYS` (`nodes/primitives.ts:58-64`). No `instances.*` or `interactions.*` builders are used. `app.diagnostics()` should show zero `OPTION_IGNORED` entries (verify; I did not run it).
- **`interactions.orbit` (5):** Not used. The camera is `camera.perspective` with `app.camera.setPose`.
- **Instancing (6):** No `setInstanceTransforms`; the largest instanced group is 64 tufts, below the 1024 shadow-proxy and 8192 cascade thresholds, and none cast shadows.
- **Contact shadows (8):** No `effects.contactShadows`.
- **Animation and physics (10):** No `playLayer`, masks, `addClipsFrom` or retargeting. Animation uses `.animate` and `setAnimation` only. Physics uses `physics.world` with box and sphere shapes, not scene-bound `bindNodes` or capsule/cylinder colliders.
- **Math/animation (11):** No `Clock`, `AnimationClip`, `ShapeGeometry` or `SphericalHarmonics3` use in `src/`.
- **Scene kits (12):** No scene kits and no built-in humanoid GLB; the models are Meshy and prop assets.
- **Per-frame cost (13):** Applies automatically (sampled `getError`, fewer allocations, unused warm programs removed). No code change. Compare frame cost only if you suspect a regression.
- **Package versions (14):** Already `4.5.0` in `apps/showcase-slingshot-siege/package.json`.

## Checklist

- [ ] Run `node tools/game-checks/run.mjs slingshot-siege` and confirm zero errors.
- [ ] Load the app on a remote runner (`tools/remote-acr/run.sh`, not local Playwright) and evaluate `window.__AURA3D_GAME__.app.diagnostics().renderPath`; confirm `path: "hdr-msaa"` and `quality: "auto"`.
- [ ] Confirm `app.diagnostics()` lists no `OPTION_IGNORED` degradations.
- [ ] Capture chapter 1 and chapter 6 frames with `?capture=1` and compare to 4.3.7 (bloom, AO, shadow edges, overall brightness).
- [ ] Add `&capture=1` to the URL built at `tools/filmstrip/capture-films.mjs:111` and to the `slingshot-siege` URLs in `evidence/exposure-parity/frames/scenes.json` (`:477`, `:1157`).
- [ ] Confirm the black-frame guard does not trigger a reload on a normal boot.
- [ ] Decide: keep `auto` (default) or add top-level `quality: "production"` in `createGameApp` (`main.ts:61`) to match 4.3.7 exactly. Optionally remove the deprecated `renderer.qualityProfile` and re-check frame cost.
- [ ] Run `npx vitest run apps/showcase-slingshot-siege/tests/smoke.spec.ts` (headless physics, unaffected by render changes).
- [ ] Run `npm run typecheck` and `npm run build` in `apps/showcase-slingshot-siege` on the remote runner.
