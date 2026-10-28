# Cross Hop (`cross-hop`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. No source edit is required to run on 4.5.0, but `effects.contactShadows` is now a real screen-space mask that changes how the lanes look, and no `quality` setting restores the 4.3.7 look. The game needs a visual check and possibly an `intensity`/`length` retune.

## What this game uses

- One entry point: `apps/showcase-cross-hop/src/main.ts`. It calls `createGame(...)` from `@aura3d/engine/game` (main.ts:29-72). That resolves to `packages/game/src/createGame.ts`, which calls `createGameApp` and then `createAuraApp`. The game passes no `quality`, `renderer`, `output` or `preserveDrawingBuffer` option, so 4.5.0 uses `quality: "auto"`. The only render-related option it does pass is `qualityRebuild: { flags: ["game"] }` (main.ts:65). That turns on `A3D_QR_GAME` only. The default-on `A3D_QR_CORE` and `A3D_QR_LIGHTING` stay on, so the HDR chain and the contact-shadow lane are available.
- Scene is built in `src/game/core.ts` `buildScene()` (core.ts:304-400). `probeScene()` (core.ts:280) is a `?probe=N` bisection scene.
- Post effects authored on the scene: `effects.contactShadows({ intensity: 0.7, length: 0.3 })` (core.ts:310), `effects.bloom({ intensity: 0.16, threshold: 0.86, radius: 0.3 })` (core.ts:312), `effects.vignette(...)` (core.ts:313), and `effects.fog(...)` (core.ts:270). The preset's own bloom and fog are filtered out in `buildLookGroup` (core.ts:243-270).
- Lights: `lights.ambient` (core.ts:314), two `lights.directional` with no `shadow` option (core.ts:317-318), plus the look preset's "look key light" (`shadow: true`, looks.ts:306) and rim light.
- Looks: `looks.preset(th.look, ...)` for six themes: `outdoor-day`, `overcast`, `golden-hour`, `night-city`, `neon-arcade`, `character-showcase` (themes.ts:42, 58, 74, 90, 106, 122). `buildLookGroup` keeps the preset's environment node and clamps it to intensity 0.58 with `background: false`. `swapLook()` (core.ts:641-647) removes and re-adds the `look` group at runtime. The mount scene is always theme 0 (`outdoor-day`, core.ts:308).
- Instancing: 21 `instances.box/cylinder/sphere/model` pools (core.ts:366-386). The largest pool capacity is `CAP.detail = 260` (core.ts:15-21). Pools are refilled every frame with `nodes.require("pool-*").setInstances(specs, cols)` (core.ts:848-851). The game does not use the typed-array path.
- Models: `model(assets.hop|hawk|rescuePod)` with `.animate({ clip: "Idle", loop: true })` on the player (core.ts:387-396; the probe copy is at core.ts:295). No `playLayer`, masks, `addClipsFrom`, root motion or physics.
- Output overlay: `app.output?.setOutputOverlay(...)` (core.ts:835-836). FX: `app.effects?.burst("debris", ...)` (main.ts:128).
- Canvas read-back: none in the game. `installBlackFrameGuard()` from `@aura3d/debug` (main.ts:10) is the only canvas reader. It samples with `drawImage` inside the GL draw call (`packages/debug/src/safety/blackFrame.ts:244`; the `guard.ts` header comment documents the draw-call tap).
- Not used anywhere in `apps/showcase-cross-hop/src`: `Clock`, `AnimationClip`, `ShapeGeometry`, `SphericalHarmonics3`, `interactions.*`, custom shaders, transmission, `output`/`exposure` options. The only shared import is `../../showcase-port-shared/quickbar.css`; `showcase-port-shared/diag.ts` is not imported.
- `package.json` depends on `@aura3d/engine` as `workspace:*` (version `0.1.0`), so there is no 4.x pin to bump.

## What changes for this game in 4.5.0

### 1. Render path: `auto` resolves to the HDR chain (no pixel change expected)

- **Now:** `quality` defaults to `"auto"`. `renderPathBlockers` (`packages/engine/src/agent-api/app/renderPath.ts`) lists any effect other than `fog` as a blocker, and also lists an `hdri` environment. The scene has `contactShadows`, `bloom` and `vignette` effects (core.ts:310-313) and the outdoor-day look carries an HDRI, so the mount stays on `hdr-msaa` and does not take the direct canvas path. The canvas-MSAA silhouette differences do not apply.
- **Do:** nothing. `quality: "production"` pins the 4.3.7 render path and bloom passes (add it to the `createGame({...})` options; `AuraCreateGameAppOptions` extends `AuraCreateAppOptions`). It does NOT restore the 4.3.7 contact shadows (see section 3).
- **Check:** in the page console, `__AURA3D_LIVE_APPS__.all()[0].diagnostics().renderPath` should report `path: "hdr-msaa"`, `quality: "auto"`. The game does not expose `app` on `window`, but `__AURA3D_LIVE_APPS__` is registered by the engine.

### 2. Bloom pass fusion is on by default under `auto`

- **Now:** `bloomFusionAllowed("auto")` is true and the scene has a bloom effect, so the bloom chain uses the fused passes (`renderer.bloomFusion` defaults to `"separable"`). The 4.5.0 notes say frames stay within 1/255 of 4.3.7.
- **Do:** nothing. `renderer: { bloomFusion: "fused-2d" }` is an opt-in and is not needed here.
- **Check:** `diagnostics().renderPath.bloomFusion` should be `"separable"`. Compare a coin-and-pod frame against a 4.3.7 capture (bloom intensity is only 0.16, so a difference should be hard to see).

### 3. `effects.contactShadows` is now a real mask sampled by forward lighting (visible change)

- **Now:** In 4.3.7 this effect ran as an `after-opaque` contributor. In 4.5.0 the explicit opt-in at core.ts:310 runs a pass in the `shadows` phase before the forward pass (`packages/rendering/src/passes/Prd02ContactShadowsContributor.ts` header). The mask darkens the shadow-casting sun's light on materials that receive shadows. The mask is marched along the shadow-casting directional light. The game has one: the look preset's "look key light" (`shadow: true`). The two `lights.directional` calls at core.ts:317-318 do not cast shadows. `swapLook` re-adds the look group on theme change, so the key light survives theme swaps. The key light differs a lot per theme (night-city and neon-arcade use 0.5 to 0.7 intensity at a different angle), so the contact darkness will differ per theme. Expect darker contact under cars, logs, critters and coins with `length: 0.3` and `intensity: 0.7`.
- **Risks:**
  - Low quality tier: for an explicit opt-in the pass is skipped (Prd02ContactShadowsContributor.ts:99). There is no `unavailable` value and no warning in that case, only `passExecuted: false`. The game ships touch controls, so check a low-end or mobile profile too.
  - If nothing draws with the mask (for example textured-PBR critter GLBs with glTF extension textures, which the contributor comment says do not sample it), the engine reports `diagnostics.unavailable = "no-drawn-program-samples-the-mask"` and logs one `console.warn("[prd02.contactShadows] ...")`. Whether the Meshy critter GLBs hit this case is unknown.
  - If the key light is removed, `unavailable` is `"no-shadow-casting-directional-light"` plus one warn.
- **Do:** run the game and look at the lanes. If the contact is too strong, lower `intensity`; `length` is in metres (default 0.25):

  ```ts
  .add(effects.contactShadows({ intensity: 0.5, length: 0.25 }))
  ```

  There is no way to get the 4.3.7 contact look back. Removing the line removes contact shadows entirely (only the Ultra-tier default still runs the old `after-opaque` path). `quality: "production"` does not change this, because the mask is not gated on `quality`. Accept the new look and retune, or remove the effect.
- **Check:** `__AURA3D_LIVE_APPS__.all()[0].lighting.diagnostics().contactShadows` (from `packages/engine/src/lanes/prd02.ts`) should show `passExecuted: true` and no `unavailable` on Medium tier and above. The browser console should have no `[prd02.contactShadows]` warning. Take a `?capture=1` screenshot (e.g. `?capture=1&autoplay=1&seed=7`). Regenerate the 4.3.7 reference from main first: `apps/showcase-cross-hop/evidence/captures/seed7` holds only JSON files (evidence.json, game-beacon.json, last-result.json, metrics.json), not an image.

### 4. Shadow cascades no receiver selects are skipped; per-frame cost changes (no pixel change)

- **Now:** because the mount is `auto`, `skipUnusedShadowCascades` is enabled (`packages/engine/src/agent-api/compiler/renderer.ts:126`, set when fused bloom passes are allowed), and the GL error is sampled instead of read every frame (unless `?diag=1` or strict mode). Also unused warm programs are removed. All of this is pixel-identical per the release notes.
- **Do:** nothing.
- **Check:** compare `diagnostics()` draw counts before and after if you track a budget.

### 5. Drawing buffer is no longer preserved (safe for this game)

- **Now:** `preserveDrawingBuffer` defaults to false unless `?capture=1` or `?qa=1` (`wantsPreservedDrawingBuffer`, renderPath.ts). The game never calls `readPixels`, `drawImage(canvas)`, `toDataURL` or `toBlob`. `installBlackFrameGuard` samples inside the draw call, which is the case the guard documents as compatible with a non-preserved buffer.
- **Do:** nothing for the game. Any external harness that grabs the canvas after an `await` must load the page with `?capture=1` (or call `app.screenshot()` / `app.capture()`).
- **Check:** load `/?capture=1` and take the screenshot; load without it and confirm no `SAFETY_COMPAT_MODE` reload happens (the black-frame guard logs that code).

## Changes that do not affect this game

- **Direct-path silhouette differences (change 1, second half):** the scene has post effects, so it never takes the direct path. Runtime HDR switching is not triggered because the scene never adds post after mount.
- **Implicit environment fill removed / hemisphere lights (change 3):** the mount scene (`outdoor-day`) carries an HDRI environment node (core.ts:308, themes.ts:42; the renderer is built with `implicitFill: false`, renderer.ts:152) and an ambient light (core.ts:314), so the scene is not "lights only" and does not get darker. No hemisphere light is authored. The new procedural fill for `night-city` and `neon-arcade` (`fill: { preset: "night" }`, lookPresets.ts:167 and :358) is added by `looks.preset` (looks.ts:299-302) as an `environments.nightCinematic` node at intensity 1.0, clamped to 0.58 by buildLookGroup. Themes 3 and 4 are only added later through `swapLook`; the renderer takes its environment lighting from the mount snapshot (`currentEnvironmentLighting`, renderer.ts:157, replaced only by the HDRI upgrade at renderer.ts:177). Whether a runtime-added environment node changes the lighting was not confirmed, so check `?theme=3` and `?theme=4` against 4.3.7 by eye.
- **OPTION_IGNORED (change 4):** every option passed to the primitive and instance builders appears in `PRIMITIVE_OPTION_KEYS` (primitives.ts:58) or the `instances.*` rows in `optionCoverage.ts`. Primitives use `name`, `size`, `material`, `castShadow`, `receiveShadow` (core.ts:333-365, 650-668). Instance pools use `name`, `size`, `material`, `transforms`, `castShadow`, `receiveShadow`, `targetMaxDimension`, `targetHeight` (core.ts:366-386); `targetLength` is used only in `probeScene` (core.ts:292). `.runtime()`, `.position()` and so on are chained methods, not options. `interactions.*` is not used. `app.diagnostics()` should show no `option-ignored` entries from these builders.
- **`interactions.orbit` (change 5):** no interactions and no orbit camera.
- **Instancing changes (change 6):** the game uses `setInstances`, not the typed-array path, and its largest pool is 260 instances. That is below the per-instance culling minimum (`MIN_CULLED_INSTANCES = 512`) and below the shadow proxy and dense-depth minimum (1024, `DENSE_DEPTH_INSTANCE_MIN`). The 8192-caster cascade cap is far out of range. Switching to `Float32Array` upload is optional and not needed.
- **AO, depth of field, god rays, TAA, motion blur, auto exposure (change 9):** none of these effects are authored.
- **Animation and physics (change 10):** only a base `Idle` loop via `.animate(...)` (core.ts:389, 395-ish). No layers, masks, `addClipsFrom` or physics.
- **Math and animation fixes (change 11):** no `Clock`, step tracks, `ShapeGeometry` or `SphericalHarmonics3`.
- **Scene kits and built-in humanoid (change 12):** no scene kits or built-in humanoid.
- **Package pins (change 14):** the app uses `workspace:*`; there is no 4.3.7 pin in `package.json`.

## Checklist

- [ ] Run `pnpm --filter @aura3d/showcase-cross-hop typecheck`. The package has no `test` script, so run `tests/lanes.test.ts` with vitest from the app directory (it only covers lane and theme logic, not rendering). Builds and browser runs go through the remote runner, `tools/remote-acr/run.sh`, not local Playwright.
- [ ] Run `node tools/game-checks/run.mjs cross-hop` and fix any error findings.
- [ ] Load the game and check `__AURA3D_LIVE_APPS__.all()[0].diagnostics().renderPath`: expect `path: "hdr-msaa"`, `quality: "auto"`, `bloomFusion: "separable"`.
- [ ] Check `__AURA3D_LIVE_APPS__.all()[0].lighting.diagnostics().contactShadows`: `passExecuted: true`, no `unavailable`, and no `[prd02.contactShadows]` console warning (on the Low tier `passExecuted: false` with no warning is expected).
- [ ] Capture 4.3.7 reference screenshots of all six themes from main, then take `?capture=1` screenshots of the same themes (`?theme=0` to `?theme=5`) on 4.5.0 and compare. Retune `effects.contactShadows` `intensity`/`length` (core.ts:310) if the contact shadows read too dark; check the night themes separately.
- [ ] Look specifically at `?theme=3` (night-city) and `?theme=4` (neon-arcade) for brightness changes from the look presets' new fill.
- [ ] Confirm `app.diagnostics()` lists no `option-ignored` degradations.
- [ ] Confirm the page does not reload into a `SAFETY_COMPAT_MODE` rung (black-frame guard) when loaded without `?capture=1`.
- [ ] Optional: add `quality: "production"` to the `createGame` options in main.ts to pin the 4.3.7 render path and bloom passes. It will not restore the old contact-shadow look, so still compare screenshots.
