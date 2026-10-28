# Bunker Zero (`bunker-zero`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. No API in this game breaks, but the scene lighting resolves differently under 4.5.0. The `night-city` look now adds its own night environment fill, which the game did not have in 4.3.7, so the game will probably render brighter and needs a visual re-check and possibly a small lighting retune. The hemisphere light does not newly contribute in this game (see item 1).

All findings come from reading the code in `/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/integration2` (branch `beat3js2/integration`) against `main` (4.3.7). Nothing was built or run, so the size of the brightness change is **unknown** until a frame is captured. Instance counts below were computed by running the same loops as `main.ts` over `src/maps.ts`.

## What this game uses

- Entry point: `apps/showcase-bunker-zero/src/main.ts` (single route, `index.html` loads it). Helpers: `src/sim.ts` (`createCountedRng` from `@aura3d/engine`), `src/maps.ts`, `src/enemy-facing.ts` (`faceTowards` from `@aura3d/engine/game`), `src/weapons-view.ts`. Shared CSS only from `apps/showcase-port-shared/quickbar.css` (no shared TS is imported).
- One `createGame({...})` call, `main.ts:462`. It passes no `quality`, no `renderer`, no `output`, no `preserveDrawingBuffer`, so it runs with the 4.5.0 defaults (`quality: "auto"`, buffer not preserved). It does pass `qualityRebuild: { flags: ["game"] }` (`main.ts:476`). That only turns on `A3D_QR_GAME`; `A3D_QR_LIGHTING` and `A3D_QR_COMPILER` are default-on and stay on.
- Look: `LOOK_ID = "night-city"` (`main.ts:37`), applied as `looks.preset(LOOK_ID, { fogDensityScale: 0.28, exposureEv: 0.42 })` (`main.ts:70`).
- Lights, all authored: `lights.ambient` 0.9 (`main.ts:72`), `lights.hemisphere` 1.0 (`main.ts:73`), two `lights.directional` (`main.ts:74-75`), two runtime `lights.point` (`main.ts:76-78`), muzzle and boom point lights (`main.ts:350-352`). No `environments.*` node of its own; the only one in the scene is the look's fill.
- Effects: `effects.contactShadows({ intensity: 0.55, length: 0.35 })`, `effects.fog`, `effects.filmGrain`, `effects.vignette`, `effects.bloom` (`main.ts:382-386`). The look adds `colorGrade`, `ambientOcclusion`, `bloom` and `antiAlias-msaa` on top (`packages/engine/src/agent-api/looks/lookPresets.ts:60` `V0_EFFECTS`, applied in `looks.ts:335-345`).
- Instancing: `primitives.box({ instances, instanceColors })` for walls and accent walls (`main.ts:134-135`), trim strips (`main.ts:140-146`), ceiling work lights (`main.ts:149-155`), alt floor cells (`main.ts:158`). Every floor map is 22 x 16 = 352 cells. Counted per floor (floors 1 to 6): walls at most 165, accent walls at most 6, floor-alt at most 14, work lights at most 26, trim strips 189 / 244 / 247 / 265 / 264 / 222. No instanced node reaches 512.
- Primitive options used: `name`, `material`, `size`, `position`, `castShadow`, `receiveShadow`, `instances`, `instanceColors` on `primitives.box` / `primitives.sphere`.
- Materials: `material.pbr`, `material.emissive`, `model(..., { materialOverrides })`. No custom shader materials and no transmission found in `main.ts`.
- Animation: `node.setAnimation({ clip, loop: true, speed })` on enemy models (`main.ts:502`). No `playLayer`, masks or `addClipsFrom`.
- Canvas access: `document.querySelector("#app canvas")` only for pointer lock (`main.ts:585`). `main.ts` has no `toDataURL`, `toBlob`, `readPixels`, `getImageData`, `drawImage`, `capture()` or `screenshot()` call. `installBlackFrameGuard()` from `@aura3d/debug` (import `main.ts:21`, call `main.ts:23`) reads pixels with `drawImage` + `getImageData` inside the debug package.
- Not used: physics, `interactions.*`, `camera.orbit` (camera is `camera.perspective`, `main.ts:387`), `Clock`, `AnimationClip`, `ShapeGeometry`, `SphericalHarmonics3`, scene kits, `setInstanceTransforms`.
- `package.json`: `@aura3d/engine` is `workspace:*` (no literal version pin). `@aura3d/debug` is imported by `main.ts` but is not listed in this app's `package.json`; this is unchanged from 4.3.7.
- Handles for the console: `app` is a module-scoped const in `main.ts` (`const app = mg.app`) and is not on `window`. The only global is the `window.__AURA3D_GAME__` beacon. To call `app.diagnostics()` from the console, add a temporary `(window as any).__app = app` in a local dev build and remove it afterwards.

## What changes for this game in 4.5.0

### 1. Lighting resolves differently (change 3): likely brighter
- **What happens now.**
  - The environment is resolved by the C-09 source chain (`compiler/compileScene.ts` around lines 510-545; sources registered in `compiler/environment.ts`, `registerPrd02EnvironmentSources`). `A3D_QR_LIGHTING` and `A3D_QR_COMPILER` are both default-on (`packages/rendering/src/contracts/flags.state.ts`), so this is the active path.
  - In 4.3.7 `night-city` had no fill (`lookPresets.ts` on `main`), so the scene had no `environments.*` node. `createProductionRuntimeEnvironment` took its authored-ambient branch, which zeroes the environment-map intensities, so the neutral-room probe added no IBL. Only the additive ambient term (`lights.ambient` 0.9) filled the scene. The hemisphere light was not part of it.
  - In 4.5.0 `night-city` carries `fill: { preset: "night", intensity: 1.0 }` (`lookPresets.ts:164-170`), and `looks.ts:299-302` emits `environments.nightCinematic(...)` for it. The scene now has an explicit environment node, so the `prd02.explicit` source binds the night probe at intensity 1.0 (diffuse and specular IBL), in addition to the ambient 0.9.
  - The hemisphere light does **not** newly contribute here. The explicit source builds its ambient with `prd02AmbientTerm(snapshot)` and no `includeHemisphere` (`environment.ts:541`). Only the neutral-room source (`environment.ts:558`) and the lights-only branch (`environment.ts:172-181`) sum the hemisphere, and both apply only to scenes with no `environments.*` node. `CHANGELOG.md:25` says scenes with an `environments.*` node are unchanged by the "lights only" rule. I found no code in `packages/` that reads the `prd02.hemisphere` output, so `lights.hemisphere` (`main.ts:73`) should stay without visible effect, as in 4.3.7.
  - The "no implicit scene-category fill" change (change 3 headline) does not apply to this game, because the look supplies an environment node.
  - Net effect: a night IBL fill that did not exist before, on top of ambient 0.9 and `exposureEv: 0.42` that were tuned against the 4.3.7 look. Expect lifted shadows, less contrast in the dark corridors and extra specular on metals. The amount is unknown.
- **Evidence.** `apps/showcase-bunker-zero/src/main.ts:37`, `:70-75`; `packages/engine/src/agent-api/looks/lookPresets.ts:156-171`; `looks.ts:299-302`; `compiler/environment.ts:541` and `:558`; `compiler/compileScene.ts` (probe bind block); `packages/rendering/src/contracts/flags.state.ts`.
- **What to do.**
  1. Capture the same frames on 4.3.7 and 4.5.0 (floor 1 start, a corridor with a door, the silo on floor 6, the boss) and compare.
  2. If 4.5.0 is too bright, retune with options that exist: lower `exposureEv` in the look overrides (accepted range -2..2, clamped at `looks.ts:161`) or lower the `intensity` of `lights.ambient` (`main.ts:72`). Changing `lights.hemisphere` intensity will not help in this scene. The look fill intensity itself cannot be overridden through `looks.preset` (the override keys are `sun`, `exposureEv`, `fogDensityScale`, `accent`, `background`).
  ```ts
  const b = scene().add(looks.preset(LOOK_ID, { fogDensityScale: 0.28, exposureEv: 0.2 })); // was 0.42; tune from captures
  lights.ambient({ name: "bunker ambient", color: "#c2d6ee", intensity: 0.6 }) // was 0.9; tune from captures
  ```
  The values above are placeholders; pick them from the comparison, not from this note.
- **How to check.** `?capture=1` screenshots before and after (see item 3), and `node tools/game-checks/run.mjs showcase-bunker-zero` (the repo's per-game checks; whether any of them measure brightness is unknown).

### 2. Render path stays on the HDR chain (change 1): informational, no code change
- **What happens now.** Under `quality: "auto"` the direct path is used only when `renderPathBlockers` returns nothing. This scene returns blockers: `effect "bloom"`, `"vignette"`, `"filmGrain"`, `"contactShadows"` and the look's `colorGrade` / `ambientOcclusion` (every effect except `fog` blocks, `renderPath.ts`, `FORWARD_ONLY_EFFECTS` and `renderPathBlockers`). So the route takes `hdr-msaa`, as before. The output should be unchanged by this item (the "up to 48/255 on 0.1-0.3% of pixels" silhouette difference applies only to the direct path).
- **Evidence.** `main.ts:382-386`; `packages/engine/src/agent-api/app/renderPath.ts` (`renderPathBlockers`, `resolveAppRenderPath`).
- **What to do.** Nothing. Do not add `quality: "production"` unless a capture shows a regression you cannot fix by tuning; it restores the old pipeline but also turns off the bloom fusion in item 4.
- **How to check.** With `app` exposed as described under "What this game uses", `app.diagnostics().renderPath` should report `path: "hdr-msaa"`, `quality: "auto"`.

### 3. Canvas read-back and evidence capture (change 2): safe in game code, check the capture tooling
- **What happens now.** `preserveDrawingBuffer` now defaults to false unless the URL has `?capture=1` or `?qa=1` (`renderPath.ts`, `wantsPreservedDrawingBuffer`). Game code does no canvas read-back of its own (no `readPixels`, `toDataURL`, `toBlob`, `getImageData`, `drawImage(canvas)`, `capture()` or `screenshot()` in `main.ts`). The one reader is `installBlackFrameGuard()` (`main.ts:23`); `createBlackFrameWatch` documents that `sample()` is called "right after a frame was drawn, in the same task" (`packages/debug/src/safety/blackFrame.ts:221`), which is valid with a non-preserved buffer. The guard needs no change.
- **What to do.** For evidence captures that read the canvas after an `await` (anything reading pixels or `toDataURL` outside the frame), add `?capture=1`, e.g. `/apps/showcase-bunker-zero/?demo=1&capture=1`. `tools/remote-capture.sh` is documented with the URL `"/apps/showcase-bunker-zero/?demo=1"` (line 12). Whether its capture server reads the canvas directly or takes browser-level screenshots is unknown; if frames come back blank, add `capture=1`.
- **How to check.** Run the remote capture once with and without `&capture=1`; both should give a non-black frame. The console must not show `SAFETY_COMPAT_MODE` (logged by the black-frame guard, `blackFrame.ts:297`).

### 4. Bloom fusion (change 7): applies automatically
- **What happens now.** The game has bloom (its own plus the look's), runs on `hdr-msaa`, quality is `auto`, so the fused bloom chain is used (`renderPath.ts`, `bloomFusionAllowed` and `reportedBloomFusion`). Default mode is `"separable"`; frames are stated to match within 1/255.
- **What to do.** Nothing. To compare, load with `?aura3d-render=production` (documented in `renderPath.ts`, `requestedQuality`).
- **How to check.** `app.diagnostics().renderPath.bloomFusion` is `"separable"` (not `"off"`).

### 5. Contact shadows are now a real mask (change 8): applies, visual change
- **What happens now.** `effects.contactShadows({ intensity: 0.55, length: 0.35 })` (`main.ts:382`) now produces a screen-space mask that forward lighting samples. It needs a shadow-casting directional light; the look's key light is created with `shadow: true` (`looks.ts`, key light block), so it should be available. If the mask cannot be drawn the effect records `unavailable` and logs one `console.warn` starting with `[prd02.contactShadows]` (`packages/rendering/src/passes/Prd02ContactShadowsContributor.ts:63-67`, `:223-231`). The warning text says glTF-extension textured PBR materials (clearcoat, transmission) do not sample the mask; the Meshy GLBs here are probably plain PBR but this is unknown.
- **What to do.** Look at the contact between props (crates, barrels, columns) and the floor on 4.5.0. If too dark, lower `intensity` (0.55). Option names `intensity` and `length` exist (`Prd02ContactShadowsContributor.ts`, `request.intensity`).
- **How to check.** The console has no `[prd02.contactShadows]` warning. The structured value (`contactShadows` in the lighting diagnostics, `packages/engine/src/lanes/prd02.ts:272`) is not reachable from `main.ts` as written, so treat the console warning plus a visual check as the practical test.

### 6. AO fix on devices without float linear filtering (change 9): applies indirectly
- **What happens now.** The `night-city` look adds `ambientOcclusion` (`looks.ts:343-345`; the game authors no AO itself). On devices without float linear filtering AO previously did nothing visible; now the RGBA32F target is point-sampled and AO shows. Those devices will see more AO darkening than in 4.3.7.
- **What to do.** Nothing unless a low-end capture looks too dark; then retune per item 1.
- **How to check.** Compare a capture from a device with and without `OES_texture_float_linear` (which devices lack it here is unknown).

### 7. Primitive option coverage (change 4): no diagnostics expected, one thing to confirm
- **What happens now.** All options passed to `primitives.box` / `primitives.sphere` (`name`, `material`, `size`, `position`, `castShadow`, `receiveShadow`, `instances`, `instanceColors`) are listed as read in `compiler/optionCoverage.ts` (rows for `primitives.box` and `primitives.sphere`). No `OPTION_IGNORED` is expected. `model(...)` is not covered by this change.
- **How to check.** `app.diagnostics()` after boot: no entry with code `OPTION_IGNORED`.

## Changes that do not affect this game

- Change 3, implicit-fill removal: the headline rule (authored lights and no `environments.*` node) does not apply, because the look supplies an environment node. The look-fill effect is covered in item 1.
- Change 5 (`interactions.orbit` node/point/position/autoRotate): no `interactions.*`; camera is `camera.perspective` (`main.ts:387`).
- Change 6 (instancing): no `setInstanceTransforms` call. The shadow proxy needs at least 1024 shadow-casting instances (`packages/engine/src/agent-api/compiler/geometry.ts:259`), per-instance culling needs at least 512 (`packages/rendering/src/renderer/InstanceFrustumCull.ts:14`), and the cascade cap needs at least 8192 casters (`compiler/shadows.ts:153`). The largest instanced node is the trim strips at 265 instances (walls at most 165), so none of the three applies. Trim and work-light strips set `castShadow: false` (`main.ts:144`, `:153`). Upload-skip-when-unchanged helps the static instance arrays but needs no action. Skipping of unused shadow cascades is automatic.
- Change 10 (animation layers, masks, `addClipsFrom`, retarget worker, physics colliders): the game uses `setAnimation` with one clip (`main.ts:502`) and no physics.
- Change 11 (`Clock.start()`, step tracks, `ShapeGeometry`, `SphericalHarmonics3`, `@aura3d/math/three`): none used.
- Change 12 (scene kits, built-in humanoid GLB provenance): no scene kits; enemies are Meshy GLBs.
- Change 13 (sampled `getError`, per-frame allocation, warm programs): automatic, no game code involved. `getError` is checked every frame only in frame/strict mode or with `?diag=1`.
- Change 14 (package pins): `package.json` uses `workspace:*` for `@aura3d/engine`, so there is no version pin to bump. `packages/engine/package.json` is `4.5.0`.

## Checklist

- [ ] Build and open the game on 4.5.0 (with `app` exposed temporarily if you want the diagnostics checks); confirm `app.diagnostics().renderPath` is `{ path: "hdr-msaa", quality: "auto" }` and `bloomFusion` is not `"off"`.
- [ ] Capture the same frames on 4.3.7 (`main`) and 4.5.0 for floors 1 and 6 and the boss (`tools/remote-capture.sh showcase-bunker-zero <dist> <out> "/apps/showcase-bunker-zero/?demo=1&capture=1" 8000 4`), run on the remote runner, not locally.
- [ ] If 4.5.0 is visibly brighter, retune `exposureEv` in the `looks.preset` call (`main.ts:70`), then `lights.ambient` intensity (`main.ts:72`), and re-capture. Do not spend time on `lights.hemisphere` intensity; it has no effect in this scene.
- [ ] Check contact shadows at prop bases; adjust `effects.contactShadows` intensity if needed; confirm no `[prd02.contactShadows]` console warning.
- [ ] Confirm `app.diagnostics()` has no `OPTION_IGNORED` entries.
- [ ] Confirm no `SAFETY_COMPAT_MODE` message (black-frame guard) in the console during a demo run.
- [ ] Use `?capture=1` on any evidence run that reads the canvas after an `await`.
- [ ] Run `node tools/game-checks/run.mjs showcase-bunker-zero` (the runner accepts a slug, app folder or title) and fix any error finding.
- [ ] Re-run the enemy facing QA rig (`window.__AURA_BUNKER_ZERO_QA__`, assigned at `main.ts:1155`) to confirm the enemy facing evidence still holds after the lighting retune (lighting only; no logic changed).
