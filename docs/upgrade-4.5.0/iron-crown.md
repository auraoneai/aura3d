# Iron Crown (`iron-crown`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. Nothing in the code fails to build or runs differently by contract, but the render now differs from 4.3.7 in three places (contact shadows, the Neo-Tokyo stage's lighting, fused bloom), so re-check the six stages by eye and re-baseline any pixel or luma comparisons.

Scope: `apps/showcase-iron-crown/` on branch `beat3js2/integration`. `apps/showcase-iron-crown/package.json:3` already pins version `4.5.0`. The game imports only `../../showcase-port-shared/quickbar.css` from the shared port folder (`src/main.ts:1`), not `diag.ts`. It imports `../../../../src/aura-assets` for shared assets in `src/game/stages.ts:2`. Nothing from `apps/common` is imported.

## What this game uses

- **Entry point:** `src/main.ts`, one `createGame({...})` call at `src/main.ts:301` (from `@aura3d/engine/game`, which resolves to `packages/game/src/index.ts`). It passes no `quality`, no `renderer`, no `output`, no `preserveDrawingBuffer`. Options present: `qualityRebuild: { flags: ["game"] }` (`:345`) and `diagnostics: { overlay: false, performancePanel: false }` (`:305`). The app handle is `const app = fightingGame.app` (`:357`).
- **Scene:** `buildArena()` in `src/main.ts` (about lines 195-290). It builds `looks.preset(s.lookId, s.lookOverrides)` (`:233`) plus the fighting-kit stage nodes, stage dressing, two `model()` fighters, and these nodes:
  - `effects.contactShadows({ intensity: 0.75, length: 0.3 })` (`:239`)
  - `effects.vignette` (`:240`)
  - `effects.bloom` (`:241`)
  - two `effects.lightCone` (`:242`, `:252`)
  - `lights.directional` "iron crown rim" (`:262`) and two `lights.spot` (`:263`, `:274`); the light list ends at `:284`
  - a `camera.perspective` (`:286`)
  - No `environments.*` node and no hemisphere light are authored directly.
- **Stages** (`src/game/stages.ts`), with the line of the look id inside each `makeStage(...)` call:

  | Stage | Look line | Look |
  |---|---|---|
  | Neo-Tokyo | 312 | `night-city` |
  | Bangkok | 338 | `golden-hour` |
  | Colosseum | 362 | `outdoor-day` |
  | Airbase | 386 | `overcast` |
  | Monastery | 409 | `alpine-snow` |
  | Crown arena | 588 | `arena-fight` |

  Stages are swapped at runtime with `fightingGame.setScene(buildArena(config).toJSON())` (`main.ts:609`).
- **Instancing:** `primitives.box/sphere/cylinder({ instances, instanceColors, ... })` only in stage dressing, all with `castShadow: false`:
  - Every stage: `buildArenaFloorDeck` adds `-stage-ring` (56 instances), `-stage-ring-inner` (56) and `-stage-star` (a dozen or so spokes) (`stages.ts:142-216`).
  - Crown arena only: `cr-cabinet-*` (`:463-471`), `cr-crowd-bodies/heads` (`:526-527`) and `cr-crowd-lights` (`:540`). The crowd is 30 columns (x from -11.4 to 11.4 step 0.78) times 3 tiers (`tierZ`, `:499`), so 90 bodies, 90 heads and 42 lights. Cabinet part counts are small and not counted here.
  - `createGame` also adds an FX pool of `instances.sphere/plane` nodes (`packages/game/src/juice/fxPoolLayer.ts:27-40`, applied at `packages/game/src/createGame.ts:100`). It is small, `castShadow: false`, and `fx.tick` writes it with the typed-array `setInstanceTransforms(Float32Array, count, colors)`. Iron Crown never calls `fx.burst`.
- **Animation:** `AnimationController` from the engine (`src/game/fighters.ts:384`) with `crossFade(..., { layer })` (`main.ts:1294`), then `runtimeNode.setAnimation({ clip, loop, speed })` (`main.ts:1307`). The game does not call `playLayer`, `mask` or `addClipsFrom`.
- **Physics:** none. The game uses `game.combatWorld()` and `game.collider.capsule` as data (`main.ts:1682`), not the physics world.
- **Canvas read-back:** none in the game source (no `readPixels`, `drawImage`, `toDataURL`, `toBlob`, `capture()`, `screenshot()`), and none in `packages/game/src`. The one reader is `installBlackFrameGuard()` from `@aura3d/debug` (`main.ts:55`), which samples in the same task as the GL draw (`packages/debug/src/safety/guard.ts`).
- **Not used:** custom shader materials, transmission, `interactions.*`, `Clock`, `ShapeGeometry`, `SphericalHarmonics3`, `@aura3d/math`. The only `instances.*` use is the engine-owned FX pool above. The fighting-kit stage nodes are raw node objects (`packages/engine/src/agent-api/game-kits/fighting.ts:651-669`), not builder calls.

## What changes for this game in 4.5.0

### 1. The game stays on the HDR chain, with fused bloom (changes 1 and 7)

- **What happens now:** `quality` defaults to `"auto"`. `renderPathBlockers` (`packages/engine/src/agent-api/app/renderPath.ts`) lists any effect except `fog` as a blocker, and this scene has `contactShadows`, `vignette`, `bloom` and `lightCone`, plus the look's `colorGrade`, `ambientOcclusion` and `bloom`. So the path is the HDR one, same as 4.3.7, and the canvas-MSAA silhouette difference from the direct path does not apply.
  - Bloom fusion is allowed on `auto` (`bloomFusionAllowed("auto")` is true), and `reportedBloomFusion` returns the mode when the scene has a bloom effect. The default mode is `"separable"`. The fused pyramid also needs a five-mip-or-fewer plan that depends on the canvas size and is decided at render time, so the frame-time gain is not promised here. Frames should match 4.3.7 within about 1/255 on the bloom itself.
- **Evidence:** `src/main.ts:239-241`; `renderPath.ts` `renderPathBlockers` and `reportedBloomFusion`. The look adds its own bloom node through `V0_EFFECTS` (`packages/engine/src/agent-api/looks/lookPresets.ts:60`), so there are two bloom nodes, as in 4.3.7.
- **What to do:** nothing is required. To restore the 4.3.7 render path and turn bloom fusion off, add `quality: "production"` to the `createGame({...})` options at `src/main.ts:301`. This does not undo the contact-shadow mask (section 2) or the Neo-Tokyo night fill (section 3), which are not gated by quality. `quality` is declared on `AuraCreateAppOptions` (`packages/engine/src/agent-api/nodes/types/runtime.ts:481`) and `createGame` accepts those options (`packages/game/src/createGame.ts:80-81`), so it should typecheck; run `pnpm --filter @aura3d/showcase-iron-crown typecheck` to confirm.
  ```ts
  const fightingGame = createGame({
    id: "showcase-iron-crown",
    quality: "production", // optional: 4.3.7 render path, no bloom fusion
    ...
  ```
- **How to check:** temporarily log `app.diagnostics().renderPath` after `fightingGame.start()`. Expect `path: "hdr-msaa"` and `bloomFusion: "separable"`, with a reason that names the effects. `?aura3d-render=production` (URL) compares the two pipelines without a rebuild.

### 2. Contact shadows are now a real mask (change 8)

- **What happens now:** `effects.contactShadows` no longer lowers to an SSAO pass. It produces a screen-space mask that forward lighting samples (`packages/engine/src/agent-api/compiler/postprocess.ts:70`; `packages/rendering/src/passes/Prd02ContactShadowsContributor.ts`). `A3D_QR_LIGHTING` is `default-on` (`packages/rendering/src/contracts/flags.state.ts:21`), so it is active. Every look adds a shadow-casting directional light ("look key light", `looks.ts` `v0Children`, `shadow: true`), so the "needs a shadow-casting directional light" condition holds and no `unavailable` or console warning is expected. Fighters will show a different contact darkening (marched along the key light) under their feet and on the stage floor than in 4.3.7.
  - Two conditions to know: the pass does not run on the `low` quality tier (`Prd02ContactShadowsContributor.ts:98-99`), and programs for textured-PBR materials with glTF extension textures (clearcoat, transmission) do not sample the mask. The stage floor medallion uses `clearcoat` (`stages.ts`, `-stage-medallion`), and the fighters are GLBs, so a missing shadow on one of those surfaces is expected, not a bug.
- **Evidence:** `src/main.ts:239` (`intensity: 0.75, length: 0.3`); options `length`, `thickness`, `steps` (8, 12 or 16), `intensity`, `lights` ("sun" or "shadowed") in `packages/engine/src/agent-api/nodes/effects.lighting.ts`.
- **What to do:** look at the feet and floor on all six stages. If the shadow is too strong or too long, adjust the numbers at `main.ts:239`, for example:
  ```ts
  effects.contactShadows({ intensity: 0.6, length: 0.25, steps: 12, lights: "sun" })
  ```
- **How to check:** a `?capture=1` screenshot per stage, compared with 4.3.7. In the console, `app.lighting.diagnostics().contactShadows` should have `passExecuted: true` and no `unavailable` (the possible values are `no-shadow-casting-directional-light` and `no-drawn-program-samples-the-mask`).

### 3. Neo-Tokyo (`night-city`) lighting source changed (change 3)

- **What happens now:** a scene with authored lights and no `environments.*` node no longer gets the implicit scene-category fill (`createProductionRuntimeEnvironment(snapshot, flags, { implicitFill: false })`, `packages/engine/src/agent-api/compiler/renderer.ts:152`). Five of the six looks add an HDRI environment node, so they are unaffected: `golden-hour`, `outdoor-day`, `overcast`, `alpine-snow` and `arena-fight` all have an `hdri` in `lookPresets.ts`. `night-city` has `hdri: null`, and in 4.5.0 it gets an explicit procedural fill, `environments.nightCinematic({ intensity: 1.0 })` (`lookPresets.ts` `night-city` `fill`; `looks.ts` `v0Children`). So Neo-Tokyo is lit by an explicit night fill instead of the implicit category fill. How different it looks is unknown from code alone; it has to be viewed.
- **Evidence:** `src/game/stages.ts:308-313`; `src/main.ts:233`. The scene authors its own lights at `main.ts:262-284` but no `environments.*` node, which is why the look's fill matters.
- **What to do:** look at Neo-Tokyo against 4.3.7, both as the first stage loaded and after switching to it with `setScene`. If it reads darker or brighter, tune through the override already in use rather than adding a node. Stage overrides are passed as `s.lookOverrides` and include `exposureEv` (see `stages.ts:328`, which has `exposureEv: 0.05`); `exposureEv` is clamped to [-2, 2] (`looks.ts` `clampLookOverrides`). Alternatively add an environment node in `buildArena`, for example `environments.studio({ intensity: 0.5 })` inside the `addMany([...])` list.
- **How to check:** compare the Neo-Tokyo frame from 4.3.7 and 4.5.0; `tests/browser/post-luma-games.json` and `tests/browser/exposure-scenes.json` both list `iron-crown` (`?heal=0`), so the luma and exposure gates will cover it when they run on the remote runner.

### 4. Ambient occlusion on devices without float linear filtering (change 9)

- **What happens now:** every look adds `effects.ambientOcclusion` (`V0_EFFECTS`, `lookPresets.ts:60`; `looks.ts` `v0Children`). Its RGBA32F target is now point-sampled when float linear filtering is unavailable. On such devices AO now shows, where it did nothing before, so the arena can look slightly darker there than on 4.3.7. No change on devices with float linear filtering.
- **Evidence:** `packages/rendering/src/webgl2/Samplers.ts` and `TextureFormats.ts` are in the 4.5.0 diff; the game has no code that touches this.
- **What to do:** nothing in code. If a mobile or software-GL capture looks darker, that is the cause.
- **How to check:** a screenshot from a device or runner without `OES_texture_float_linear` (unknown which runners lack it).

### 5. Capture and QA scripts that read the canvas (change 2)

- **What happens now:** `preserveDrawingBuffer` defaults to false except under `?capture=1` and `?qa=1`. The game itself reads no pixels, and the black-frame guard samples inside the draw task (`packages/debug/src/safety/guard.ts` header comment), so the running game is not affected.
- **Evidence:** no read-back in `src/` or `packages/game/src`; `src/main.ts:55`.
- **What to do:**
  - `tools/filmstrip/capture-films.mjs` is affected. It opens `/apps/showcase-iron-crown/?autoplay=1` (line 111) and falls back to `canvas.toDataURL` after an await (line 171) when the CDP capture is black. Change the URL to `?autoplay=1&capture=1`. Its header comment (line 9) that the context has `preserveDrawingBuffer` is stale.
  - `tools/quality-rebuild-capture/capture-games.mjs` uses `page.screenshot` (compositor), so it is not affected.
  - `tests/browser/guardfix-probe.spec.ts` only observes the guard's own `drawImage` probe; it does not need the flag.
  - Any other external probe that reads the canvas after an `await` needs `?capture=1` or `?qa=1`.
- **How to check:** run the filmstrip script on the remote runner (not locally) and confirm the frames are not black.

### 6. Per-frame cost changes you will see in numbers only (change 13)

- **What happens now:** `getError` is sampled instead of checked every frame (still every frame with `?diag=1`, strict mode, or evidence runs) (`packages/engine/src/agent-api/compiler/renderer.ts:106-110`). Per-frame allocation and warm-program changes also apply. No code change.
- **How to check:** any frame-time or draw-call baseline for this game will move slightly; re-baseline rather than compare to 4.3.7 figures.

## Changes that do not affect this game

- **4 (OPTION_IGNORED, `primitive()` forwards extras):** stage dressing passes only `name`, `material`, `instances`, `instanceColors`, `castShadow`, `receiveShadow` (plus `.position/.scale`), all in `PRIMITIVE_OPTION_KEYS` (`packages/engine/src/agent-api/nodes/primitives.ts:58`). The FX pool passes `name`, `material`, `castShadow`, `receiveShadow`, `transforms`, `colors`, also in that list. Kit nodes are raw objects, not builder calls. No `interactions.*` calls. Nothing should appear in `app.diagnostics()`. A quick check: look for `OPTION_IGNORED` in diagnostics.
- **5 (`interactions.orbit`):** no interactions; the camera is `camera.perspective` (`main.ts:286`).
- **6 (instancing/shadow-proxy/dense-depth/cascade cap):** the thresholds are 1024 (shadow proxy) and 8192 (cascade cap). The largest instanced node is 90 (crowd) and every instanced primitive has `castShadow: false` (`stages.ts:162-214, 463-471, 526-540`), so none of those paths run. "Shadow cascades no receiver selects are skipped" is enabled on auto/cinematic and is stated as pixel-identical; no action. The typed-array `setInstanceTransforms` path is used only by the engine-owned FX pool and only when an FX burst runs, which this game does not trigger.
- **10 (animation masks, `addClipsFrom`, retarget, physics):** the game never calls `playLayer`, `mask` or `addClipsFrom`. The `bodyMask: "upper-body"` in `fighters.ts` is a field of the engine `AnimationController` layer config (`fighters.ts:340-341, 390-393`), not the actor `mask` that was changed (`animationMask.ts`, `actorAnimationHandle.ts`), and the engine `AnimationController` file is not in the 4.5.0 diff. `setAnimation({ clip, loop, speed })` passes no `mask`. No physics world is used.
- **11 (Clock, step tracks, ShapeGeometry, SphericalHarmonics3, `@aura3d/math/three`):** none used (`rg` over `src/`).
- **12 (scene kits, built-in humanoid):** no `sceneKits.*`. The fighting kit is `games.fighting.stagePreset`, not one of the kits fixed.
- **14 (package versions):** already `4.5.0` (`package.json:3`).
- **3, hemisphere and other look fills:** no hemisphere light is authored; the other look fills (`polar-night`, `neon-arcade`, `space`, `underwater`) are not used by any stage.
- **1, `preserveDrawingBuffer` at the app level and runtime HDR switch:** post effects are present from the first scene, so there is no later switch. `setScene` rebuilds with the same effect set.

## Checklist

- [ ] Run `node tools/game-checks/run.mjs iron-crown` and confirm 0 errors (not run for this guide).
- [ ] Run `pnpm --filter @aura3d/showcase-iron-crown typecheck` and `build` on the remote runner (`tools/remote-acr/run.sh`), not locally.
- [ ] Log `app.diagnostics().renderPath` once; expect `hdr-msaa` and `bloomFusion: "separable"`.
- [ ] Capture all six stages with `?capture=1` and compare against 4.3.7: Neo-Tokyo (lighting source, loaded first and reached by `setScene`), floor and feet (contact shadows), bloom halo on the light cones and crowd lights.
- [ ] If Neo-Tokyo or the contact shadow is off, tune `lookOverrides.exposureEv` in `src/game/stages.ts` or the `effects.contactShadows` numbers at `src/main.ts:239`.
- [ ] Confirm `app.diagnostics()` has no `OPTION_IGNORED` entry and `app.lighting.diagnostics().contactShadows` has no `unavailable`.
- [ ] Update luma or pixel baselines that include `iron-crown` (`tests/browser/post-luma-games.json`, `tests/browser/exposure-scenes.json`).
- [ ] In `tools/filmstrip/capture-films.mjs`, change the Iron Crown URL (line 111) to add `&capture=1` so the `toDataURL` fallback is not black; confirm `tools/quality-rebuild-capture/capture-games.mjs` frames are non-black (it uses `page.screenshot`).
- [ ] Optional: add `quality: "production"` to the `createGame` options if you need the 4.3.7 render path and no bloom fusion while re-baselining. The contact-shadow and Neo-Tokyo changes remain either way.
