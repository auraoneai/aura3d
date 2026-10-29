# Lamplight Line (`last-train-port`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. The game needs no code change to build or run on 4.5.0, but it reads the canvas outside a render call, its bloom/AO output can shift slightly, and one QA probe should be made safe against the new `preserveDrawingBuffer` default.

## What this game uses

- Entry point: `apps/showcase-last-train-port/src/main.ts` (3 lines). It imports `apps/showcase-port-shared/diag.ts` and mounts `examples/last-train-port/main.ts`. The page title is "Lamplight Line". Nothing is imported from `apps/common`.
- `apps/showcase-last-train-port/package.json` already pins `@aura3d/engine` to `workspace:*` and the package version is `4.5.0`. No dependency edit is needed.
- One `createAuraApp` call at `examples/last-train-port/main.ts:360`:
  - `autoStart: false`, `resize: false`, `pixelRatio: 1`.
  - `renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }` (line 362). `mode` and `fallback` are deprecated options (`packages/engine/src/agent-api/nodes/types.ts:1160-1170`). `qualityProfile` is described in `renderPath.ts:151` as a deprecated pixel-ratio/draw-budget preset. In 4.5.0 `renderer.qualityProfile` is not read as a pipeline request (`packages/engine/src/agent-api/app/renderPath.ts:151`). No top-level `quality` is passed, so the app runs at `quality: "auto"`.
  - `output: { toneMapping: "none" (or ?tm=), exposure: 1 (or ?ev=), dither: false }` (line 363).
  - Two scenes (day and night) built by `buildScene` in `examples/last-train-port/world.ts:168`. Night swaps the whole scene.
- Frame driving: `createFixedStepLoop` calls `render()`, which calls `runtime.update(...)` and then `app.step(0)` (`main.ts:203-206`).
- Lighting and post in `world.ts:176-183`:
  - `environments.hdri` (intensity 0.8 day, 0.2 night, `background: false`).
  - One cascaded-shadow `lights.directional` (sun or moon, `cascades: 3`).
  - `effects.fog`, `effects.ambientOcclusion`, `effects.bloom`, `effects.colorGrade`, `effects.vignette`.
- Custom shader materials: `material.custom` for the sky dome, cloud sea, and the weather/rain/mote points (`world.ts:186-193, 441-454`, built from `materials.ts` and `shaders.ts`).
- Instanced primitives (`world.ts:204-208, 387-419`). Every option passed to `primitives.*` is one of `name`, `size`, `instances`, `instanceColors`, `material`, `castShadow`, `params`. Approximate counts:
  - Sleepers: about 1,694 (route length about 3,558 m at 2.1 m spacing, computed from `data/route.json`).
  - Pylons: about 136. Masts: about 84.
  - Trees: at most 22 per town across 6 towns, so at most 132.
  - Shadow casters among them: tree canopies, tree pines, platform canopies. All are well under 1,024.
- Meshy GLB models (`models.ts`) and `geometry.custom` meshes; node motion goes through `.runtime({ id })` handles.
- Canvas read-back code in the QA hooks (`main.ts`):
  - `pixels()` at lines 274-283: `drawImage(canvas)` then `getImageData`.
  - `frame()` at lines 315-321: calls `render()`, then `drawImage(canvas)` and `toDataURL` (line 320).
- `?diag=1` (`apps/showcase-port-shared/diag.ts`) installs `@aura3d/debug` `installSafetyNet`. Its black-frame probe reads the canvas with `drawImage` (`packages/debug/src/safety/blackFrame.ts:244`), documented as called in the same task as the draw.
- Not used: `interactions.*`, `instances.*`, `setInstanceTransforms`, animation layers/clips/masks, physics, `Clock`, `ShapeGeometry`, `SphericalHarmonics3`, look presets, `effects.contactShadows`, scene kits, `@aura3d/math`.

## What changes for this game in 4.5.0

### 1. Render path: this game stays on the HDR chain; bloom is now fused (change 1 and 7)

- **What happens now:** `quality` defaults to `"auto"`. `renderPathBlockers` (`renderPath.ts:103-136`) lists blockers for this scene. It authors `output` options (`main.ts:363`), has effect nodes (AO, bloom, grade, vignette), an `hdri` environment, and `material.custom` shader materials. The result is the HDR chain (`hdr-msaa`), not the direct canvas path. The silhouette-edge difference (canvas MSAA) therefore does not apply. Fog alone would not block the direct path, but the other blockers do.
- **What does change:** on `auto` the bloom chain is fused. The bloom mode defaults to `renderer.bloomFusion: "separable"` (`packages/rendering/src/contracts/quality.ts:29`, read in `rendererOptions.ts:264`) and is reported as `diagnostics().renderPath.bloomFusion` (`renderPath.ts:33-38`). That report is `"off"` when the scene has no bloom node (for example `?fx=nobloom`) and when quality is not `auto`/`cinematic`. The 4.5.0 notes say frames stay within 1/255 on the PBR viewer. That figure has not been measured on this scene, so treat it as unknown here.
- **Evidence:** `examples/last-train-port/main.ts:360-363`, `world.ts:176-183`, `packages/engine/src/agent-api/app/renderPath.ts`.
- **What to do:** nothing is required. To keep the old pipeline byte-for-byte, add the top-level option. The existing `renderer.qualityProfile: "production"` does not do this.
    ```ts
    app = createAuraApp(canvas, {
      autoStart: false, resize: false, pixelRatio: 1,
      quality: "production",
      // ...existing renderer/output/scene options
    });
    ```
  With `quality: "production"` the path is still `hdr-msaa`, but `bloomFusion` reports `"off"` and the bloom passes are unfused. `?aura3d-render=production` forces this at runtime without a rebuild, so you can compare both paths first.
- **Optional cleanup:** `renderer.mode` and `renderer.fallback` are marked `@deprecated` in `packages/engine/src/agent-api/nodes/types.ts:1160-1170` (the 4.0.0 removal note says they throw `AuraMigrationError` under `A3D_QR_STRICT`). They are not new in 4.5.0, but 4.5.0 is a reasonable time to remove them. `renderer.qualityProfile` (types.ts:1171) has no `@deprecated` tag; `renderPath.ts:151` calls it a pixel-ratio/draw-budget preset. Removing it changes that preset, so compare captures first.
- **How to check:** add `renderPath` to `diag()` (see the note below), load the page, and call `window.__AURA_LAST_TRAIN__.diag()`. It should report `path: "hdr-msaa"`, `quality: "auto"` and `bloomFusion: "separable"`. Compare day and night screenshots against the 4.3.7 baseline with `?capture=1`.
- **Note:** the QA hook `diag()` in `main.ts:293-297` does not expose `renderPath`. The simplest check is a one-line addition to that function: `renderPath: (app?.diagnostics() as { renderPath?: unknown } | undefined)?.renderPath` (extend the return type to match). The same line can also return the `option-ignored` entries from `app.diagnostics()`.

### 2. Canvas read-back and `preserveDrawingBuffer` (change 2)

- **What happens now:** `preserveDrawingBuffer` defaults to `false` unless the URL has `?capture=1` or `?qa=1` (`renderPath.ts:181-196`, applied at `frameLoop.ts:95`). This game does not pass the option.
- **Safe today:**
  - `frame()` (`main.ts:315-321`) calls `render()` and then reads the canvas in the same synchronous task, so the buffer is still populated.
  - The Playwright specs `tests/browser/last-train-port.spec.ts:84` and `tests/browser/last-train-art.spec.ts:62` call `a.frame(...)` and then `a.pixels()` inside one `page.evaluate`. That is also one task, so `pixels()` sees the frame `frame()` just drew.
  - `tests/browser/last-train-ui.spec.ts` uses Playwright `page.screenshot` (compositor read), and `last-train-play.spec.ts` does not read the canvas. Neither is affected.
  - The `@aura3d/debug` black-frame probe samples right after a draw in the same task.
- **At risk:** `pixels()` called alone (without a preceding `frame()` or `render()` in the same task) reads a cleared buffer. It would report `litFraction` near 0, which the port spec treats as an empty frame (`expect(dayDock.litFraction).toBeGreaterThan(0.6)`, line 92). The specs do not load the page with `?qa=1` or `?capture=1` (they use `?manual=1`), so they rely on the same-task order.
- **What to do:** make `pixels()` render first, like `frame()` does (`render(); updateHud();` before the `drawImage`). Alternative: pass `preserveDrawingBuffer: true` in the `createAuraApp` options. That costs a small amount of performance in normal play, so prefer the first fix.
    ```ts
    function pixels() {
      render();
      const probe = document.createElement("canvas");
      // ...unchanged
    }
    ```
- **How to check:** open the page (no `?qa=1`), then call `__AURA_LAST_TRAIN__.pixels()` from the console in a separate task from any frame. Before the fix it can return `litFraction: 0`; after, it should match `frame()`-then-`pixels()`. Run `tests/browser/last-train-port.spec.ts` on the remote runner (`tools/remote-acr/run.sh`), not locally.

### 3. AO and other float-target effects (change 9)

- **What happens now:** AO uses an RGBA32F target. It is now point-sampled where float linear filtering is unavailable. Before, AO did nothing visible on such devices.
- **Applies because:** `effects.ambientOcclusion({ name: "ao" })` is in both scenes (`world.ts:180`). On devices without float linear filtering, AO will now appear. That can darken crevices around houses, platforms and the tram. Whether the remote software-GL (SwiftShader) runner has float linear filtering is unknown.
- **What to do:** nothing required. If the darker look is unwanted on those devices, lower the AO strength or remove the node. The `?fx=noao` switch (`world.ts:180`) toggles it for comparison.
- **How to check:** capture day and night with `?capture=1` before and after on the same device and compare. Run `node tools/game-checks/run.mjs last-train-port` for the repo's own checks.

### 4. Debug-only: `?fx=nohdri` (change 3)

- **What happens now:** a scene with authored lights and no `environments.*` node no longer gets the implicit scene-category environment fill. In normal play this scene always has `environments.hdri` (`world.ts:176`), so nothing changes.
- **Applies only when:** `?fx=nohdri` is used (`world.ts:176`). That look-dev switch removes the only environment node, so the result renders darker than on 4.3.7.
- **What to do:** if that switch is still wanted for look-dev, add a fallback `environments.studio()` when `nohdri` is set. Otherwise leave it.
- **How to check:** load with `?fx=nohdri` before and after and compare brightness.

## Changes that do not affect this game

- Direct render path / canvas MSAA edge differences (change 1): the scene is blocked from the direct path by authored `output`, effects, `hdri` and shader materials (`renderPath.ts:103-136`).
- Runtime HDR switch when post is added later: post is present from the first frame.
- OPTION_IGNORED (change 4): every `primitives.*` call uses only valid keys (`name`, `size`, `instances`, `instanceColors`, `material`, `castShadow`, `params`; list at `packages/engine/src/agent-api/nodes/primitives.ts:58-64`). No `instances.*` or `interactions.*`. `model()` and `geometry.custom()` options are outside this change (only `primitives.*` and `interactions.*` call `ignoredOptionsNote`). Confirm by reading `app.diagnostics()` for `option-ignored` entries after load (for example through the `diag()` addition above); none are expected.
- `interactions.orbit` (change 5): not used. The title-screen orbit is a hand-written camera move in `world.ts:556-570`.
- Instancing (change 6): no `setInstanceTransforms`. The shadow proxy needs shadow-casting built-in primitives with at least 1,024 instances; the casters here have at most about 132 (sleepers at about 1,694 are `castShadow: false`, `world.ts:204`). Auto cascades cap at 2 only for at least 8,192 casters. Per-instance frustum culling of large instanced draws may apply to the sleepers; its effect on this scene is unknown, but it is a performance change only. Dense depth batching and unselected-cascade skipping are internal; they could change draw counts, which `diag()` in `main.ts:293` reports.
- `effects.contactShadows` (change 8): not used.
- Animation and physics (change 10): no clips, layers, masks, `addClipsFrom` or physics. (`physics` in `sim.ts:15` is a data field name for route data.)
- Math/animation (change 11): no `Clock`, `AnimationClip`, `ShapeGeometry` or `SphericalHarmonics3`. The loop uses `createFixedStepLoop`.
- Scene kits (change 12): none used. The built-in humanoid GLB is not used; the game's GLBs are its own Meshy assets (`models.ts`).
- Per-frame cost (change 13): `getError` is now sampled; nothing in the game depends on it. No code change needed.
- Package versions (change 14): `apps/showcase-last-train-port/package.json` is already at `4.5.0` (commit `19d133584`).
- Hemisphere lights and look-preset fills (change 3): no hemisphere lights, no look presets.

## Checklist

- [x] Decide whether to keep the new default (`quality: "auto"`, fused bloom) or pin `quality: "production"` in `createAuraApp` (`examples/last-train-port/main.ts:360`). Done: the game passes `quality: "auto"` explicitly and keeps fused bloom (audit fix D-13).
- [x] Add `renderPath` to the `diag()` hook (`main.ts:293`) and confirm `path: "hdr-msaa"`, `quality: "auto"`, `bloomFusion: "separable"` on both day and night scenes (night swaps the scene, so check after `setTimeOfDay("night")`; `?fx=nobloom` reports `"off"`).
- [x] Make `pixels()` (`main.ts:274`) call `render()` before `drawImage`, or pass `preserveDrawingBuffer: true`. Done: `pixels()` calls `render()` first (audit fix D-07; remote run g21w2-after-163943).
- [ ] Run `tests/browser/last-train-port.spec.ts` (and `last-train-art`, `last-train-ui`, `last-train-play`) on the remote runner via `tools/remote-acr/run.sh`; confirm the `litFraction > 0.6` assertion still holds.
- [ ] Capture day and night with `?capture=1` and compare with the 4.3.7 captures for bloom and AO differences.
- [ ] Read `app.diagnostics()` after load (via the extended `diag()`) and confirm no `option-ignored` or new warnings.
- [x] Run `node tools/game-checks/run.mjs last-train-port`. 0 errors, 0 warnings (2026-10-29).
- [x] Optional: remove the deprecated `renderer.mode` and `renderer.fallback` options (and `renderer.qualityProfile` only after comparing captures, since it selects a pixel-ratio/draw-budget preset). Done: all three removed; the pixel ratio is now set by the game (min(devicePixelRatio, 1.5), audit E-02).
- [x] Optional: give `?fx=nohdri` an `environments.studio()` fallback if the switch is still used. Done with `environments.neutral({ intensity })` (the current builder; `studio` is a legacy alias).
