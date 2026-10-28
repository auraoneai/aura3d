# Thermal Drift (`heatsink`): upgrading to Aura3D 4.5.0

**Verdict:** No change needed. The game already pins 4.5.0. It stays on the HDR render path because it authors bloom, vignette and colour grade, and because its look adds an HDRI environment and an ambient-occlusion effect. It has an environment node (from `looks.preset`), reads no canvas pixels, and passes only valid primitive options. Only a visual re-check is recommended.

## What this game uses

- Single entry point: `apps/showcase-heatsink/index.html` loads `apps/showcase-heatsink/src/main.ts` (2013 lines). One `createAuraApp` call at `src/main.ts:929`.
- App options (`src/main.ts:929-934`): `scene`, `renderer: { quality: "high" }` (the renderer tier, not the render-path `quality`), `qualityRebuild: { flags: ["game"] }`, `diagnostics: false`. No top-level `quality`, `output`, `preserveDrawingBuffer`, `renderer.bloomFusion`, or `strict`. The `"game"` flag turns on the dev-state `A3D_QR_GAME` lane; default-on flags such as `A3D_QR_CORE` still apply (`packages/engine/src/contracts/flags.ts`, `resolveQrFlags` applies `applyDefaultOnStates`).
- Scene (`buildThermalDriftScene`, `src/main.ts:599-621`):
  - `looks.preset("outdoor-day", { fogDensityScale: 0, exposureEv: 0.12 })` at line 601 (added first, before every other node).
  - Lights: `lights.ambient`, `lights.hemisphere`, `lights.directional({ shadow: true })`, and two `lights.point` (lines 613-617).
  - Effects authored in the scene: `effects.bloom`, `effects.vignette`, `effects.colorGrade` (lines 618-620).
  - No `environments.*` call is authored directly.
- What the look preset adds (`packages/engine/src/agent-api/looks/looks.ts`, `v0Children` at line 278, with `V0_EFFECTS` in `looks/lookPresets.ts:60`): an `environments.hdri` node (`/hdri/autumn_field_puresky_1k.hdr`, present in the repo `public/hdri/`; looks.ts:291-298), a shadow-casting key directional light, a colour grade with exposure 2^0.12 (about line 335), an `ambientOcclusion` effect (343-345) and a `bloom` effect (346-350). Fog is skipped because `fogDensityScale` is 0.
- Geometry: 18 `primitives.*` call sites (`box`, `cylinder`, `torus`, `sphere`) at `src/main.ts:624-810`. Two sit inside loops (laser bolts at 780, rain streaks at 810), so more primitive nodes exist at runtime. They pass only `name`, `size` and `material`. The materials are `material.pbr` and `material.emissive` (no custom shaders, no transmission, no opacity below 1). There are 30 `model(...)` nodes (`src/main.ts:828-880`) using `role`, `scaleMode`, `targetMaxDimension`. Most nodes carry `.runtime(game.runtimeNode(...))`.
- No `instances.*`, no `interactions.*`, no physics, no animation layers or masks, no `Clock`, `AnimationClip` or `ShapeGeometry`.
- Frame loop: `auraApp.ready()` (1448), `auraApp.onFrame` (1451), `auraApp.step(1/60)` and `auraApp.resume()` (2007, 2010). Handles come from `auraApp.nodes.require`.
- Canvas read-back: none. The only `getContext` is the 2D minimap canvas (`src/main.ts:926`). There is no `readPixels`, `toDataURL`, `toBlob` or screenshot call. `installBlackFrameGuard()` (`src/main.ts:29`) samples the world canvas inside the same task as the GL draw (`packages/debug/src/safety/guard.ts`), so it does not depend on `preserveDrawingBuffer`.
- Shared code: `apps/showcase-port-shared/quickbar.css` (CSS only). `apps/showcase-port-shared/diag.ts` is not imported by this game. `src/aura-assets` supplies the asset catalogue. `apps/common` is not imported.
- Package: `apps/showcase-heatsink/package.json` is `4.5.0` with `@aura3d/engine: workspace:*` (it is `4.3.7` on `main`).
- Route health: `apps/showcase-heatsink/route-health.json` (budgets `maxModelNodes: 32`, `minFps: 30`, `maxBootMs: 8000`).

## What changes for this game in 4.5.0

Nothing needs editing. These four changes touch this game's pixels or cost, so they are worth a re-check.

### 1. Bloom pass fusion (change 7): applies, default behaviour changes
- **Now:** the scene has bloom, so it takes the HDR route (`renderPathBlockers`, `packages/engine/src/agent-api/app/renderPath.ts:103`, lists `effect "bloom"` at line 117; the look's `hdri environment` is a further blocker at line 125). The render-path `quality` defaults to `auto` (`renderPath.ts:156`), and `bloomFusionAllowed("auto")` is true (`renderPath.ts:24`). The bloom chain is therefore fused with the default `separable` mode. The release claim is frames within 1/255 and fewer draws; I have not measured this game.
- **Evidence:** `src/main.ts:618` (`effects.bloom`), plus the look's own bloom node (`looks/looks.ts:346-350`).
- **Which bloom and colour grade are used (pre-existing, same in 4.3.7):** the scene carries two bloom nodes and two colour-grade nodes (authored plus look). The compiler takes the FIRST match with `nodes.find(...)` (`compiler/postprocess.ts:41` for bloom, `:78` for colour grade). The look is added first and its group flattens in place, so the look's bloom (defaults: intensity 0.3, threshold 0.78) and the look's colour grade (contrast 1.05, saturation 1.0) most likely win. The authored `effects.bloom({ intensity: 0.32, threshold: 0.72, radius: 0.5 })` and `effects.colorGrade({ contrast: 1.08, saturation: 1.12 })` are then unused. `postprocess.ts` has no relevant change between `main` and `beat3js2/integration`, so this is not an upgrade regression. It is a tuning issue to review separately. I derived it statically and did not run the game.
- **To keep the old pass sequence exactly:** change `src/main.ts:929-934` to
  ```ts
  const auraApp = createAuraApp("#app", {
    scene: buildThermalDriftScene(),
    quality: "production",
    renderer: { quality: "high" },
    qualityRebuild: { flags: ["game"] },
    diagnostics: false
  });
  ```
  Only do this if a visual diff shows a problem. You can also compare without a rebuild using `?aura3d-render=production`.
- **Check:** temporarily expose the app (`(window as any).__app = auraApp;` after line 934) and read `__app.diagnostics().renderPath`. Expect `{ path: "hdr-msaa", quality: "auto", bloomFusion: "separable" }`. If `bloomFusion` is `"off"`, or `path` is `"direct"` with a `reason` containing "legacy LDR route", then `A3D_QR_CORE` (or `A3D_QR_CORE_OUTPUT`) is off and the legacy LDR route applies (`renderPath.ts:158-165`). Note that `path: "direct"` alone is not proof of this: read `reason`. For the legacy route I cannot say what the effect is. Compare `?aura3d-render=production` against the default at the same camera state.

### 2. Ambient occlusion float targets (change 9): applies on some devices
- **Now:** the `outdoor-day` look injects an `ambientOcclusion` effect (`V0_EFFECTS` in `looks/lookPresets.ts:60`, emitted at `looks/looks.ts:343-345`). In 4.5.0 the RGBA32F AO target is point-sampled when float linear filtering is unavailable. Before, AO did nothing visible on such devices (mostly mobile or some integrated GPUs). On those devices the road and drones may now look darker than they did in 4.3.7. Devices with float linear filtering are unchanged.
- **What to do:** nothing in code. If the darker look is unwanted on those devices, I found no `looks.preset` option that switches the look's AO off. A later authored AO node would not help, because the compiler takes the first AO node (`postprocess.ts:67`, `find`) and the look's node comes first. Treat an override as unavailable unless the engine adds one.
- **Check:** open the game on a device or browser without `OES_texture_float_linear` (or `?aura3d-render=production` for comparison) and compare a screenshot. `app.diagnostics().warnings` should have no new float-target warnings.

### 3. Shadow cascade skipping and per-frame cost (changes 6, 13): applies, no pixel change expected
- **Now:** when bloom fusion is allowed (quality `auto` or `cinematic`) the renderer sets `skipUnusedShadowCascades = true` (`packages/engine/src/agent-api/compiler/renderer.ts:126`, gated by `isFusedBloomPasses`, which is set from `bloomFusionAllowed`). The game has a shadow-casting directional light (`src/main.ts:615`) and another from the look. Cascades that no receiver selects are not redrawn. `getError` is sampled instead of checked every frame unless `?diag=1`, `strict`, or a render-source run (`renderer.ts:106-109`). The release says output is pixel-identical.
- **What to do:** nothing.
- **Check:** `route-health.json` budgets (`minFps: 30`, `maxBootMs: 8000`) should still pass. Run `node tools/game-checks/run.mjs heatsink`.

### 4. Exposure and lighting (change 3): does not shift this game, but verify once
- See the "do not affect" list: the game has an environment node, so the implicit-fill removal does not trigger. I traced this statically only. A before/after screenshot comparison is the cheap confirmation.

## Changes that do not affect this game

1. **Direct render path (change 1):** the scene authors `effects.bloom`, `effects.vignette` and `effects.colorGrade` (`src/main.ts:618-620`), and each is an `effect "..."` blocker in `renderPathBlockers` (`renderPath.ts:117`). The look also adds an `hdri environment` blocker (`renderPath.ts:125`) and an `ambientOcclusion` effect blocker. The game stays on the HDR route, so the up-to-48/255 silhouette difference from canvas MSAA does not occur. The "runtime switch to HDR when post is added" diagnostic is not relevant because post is present from the start.
2. **`preserveDrawingBuffer` default false (change 2):** no `readPixels`, `drawImage(canvas)`, `toDataURL`, `toBlob` or `screenshot`/`capture` call in `src/main.ts` or `index.html`. The black-frame guard samples in the draw task, by design. Note: external QA scripts that screenshot the page without `?capture=1` or `?qa=1` are outside this repo's game code; if you run one, add `?capture=1`.
3. **Implicit environment fill removed (change 3):** the scene already has an `environments.hdri` node from `looks.preset("outdoor-day")` (`looks/looks.ts:291-298`), so `createProductionRuntimeEnvironment` takes the authored-environment branch (`compiler/environment.ts:94-95`) and never reaches the new `implicitFill: false` code (`environment.ts:172-181`). The `A3D_QR_LOOKS` flag is `dev`/off by default (`packages/rendering/src/contracts/flags.state.ts:42`), so the look is expanded as a group with the same children. The HDRI file exists at `public/hdri/autumn_field_puresky_1k.hdr`.
4. **Hemisphere light contribution (change 3, part):** the new hemisphere term is added only on the no-environment neutral-room source (`environment.ts:558`, `includeHemisphere: true`). This game's explicit environment uses `prd02AmbientTerm(snapshot)` without it (`environment.ts:541`), and `compiler/lights.ts` has no hemisphere change in the diff (only a URL-parse cache). `lights.hemisphere` at `src/main.ts:614` is unaffected.
5. **Look preset procedural fill (change 3, part):** only `night-city`, `polar-night`, `neon-arcade`, `space`, `underwater` gained a fill. This game uses `outdoor-day`, which has an HDRI.
6. **`OPTION_IGNORED` (change 4):** every `primitives.*` call passes only `name`, `size`, `material` (verified for all 18 call sites), all in `PRIMITIVE_OPTION_KEYS` (`nodes/primitives.ts:58-65`). No `interactions.*` or `instances.*` calls. `model()` is not covered by this change. `app.diagnostics()` should show no `OPTION_IGNORED` entries.
7. **`interactions.orbit` (change 5):** no `interactions.*` and the camera is `camera.perspective` (`src/main.ts:603`).
8. **Instancing (change 6, instancing parts):** no `instances.*` or `setInstanceTransforms` in the game. Shadow proxy, dense instanced depth and the >=8192 cascade cap need instanced casters. Rain streaks (`src/main.ts:805-818`) and laser bolts are individual `primitives.*` nodes, not instances.
9. **Contact shadows (change 8):** no `effects.contactShadows`.
10. **Animation and physics (change 10):** no `playLayer`, `addClipsFrom`, masks, retargeting or `physics:` option. The "Lateral & vertical flight physics" comment at `src/main.ts:1573` is hand-written motion code, not the engine physics.
11. **Math and animation (change 11):** no `Clock`, `AnimationClip`, `ShapeGeometry` or `SphericalHarmonics3`. The `@aura3d/math/three` subpath is not imported.
12. **Scene kits (change 12):** no `sceneKits.*`, `particleFountain`, `solarSystem`, `neonTunnel` or built-in humanoid.
13. **WP-7 warm programs and WP-5 allocation (change 13, remainder):** engine-internal. No API used by the game changed.
14. **Package versions (change 14):** `apps/showcase-heatsink/package.json` is already `4.5.0` on the integration branch (it is `4.3.7` on `main`), produced by `tools/release/prepare-version.mjs`.

## Checklist

- [ ] Confirm `apps/showcase-heatsink/package.json` still says `"version": "4.5.0"` and `@aura3d/engine` is `workspace:*`.
- [ ] Run `node tools/game-checks/run.mjs heatsink` and confirm 0 errors.
- [ ] Run the package typecheck (`pnpm --filter @aura3d/showcase-heatsink build`, which is `tsc --noEmit`) on the remote runner (`tools/remote-acr/run.sh`), not locally.
- [ ] On the remote runner, load `/apps/showcase-heatsink/?capture=1&autoplay=1` and take a screenshot at the same camera state as 4.3.7. Compare the road, drones and bloom glow; expect differences of at most 1/255 from bloom fusion.
- [ ] Temporarily expose `auraApp` and confirm `app.diagnostics().renderPath` is `hdr-msaa`, `auto`, `separable`. If `path` is `direct`, read `reason` to tell the legacy LDR route apart. Remove the debug line afterwards.
- [ ] Confirm `app.diagnostics().warnings` and `errors` contain no `OPTION_IGNORED` entry and no new warning.
- [ ] Optional tuning review (not an upgrade regression): decide whether the look's bloom and colour grade (which win under `find`) are what you want, or whether the authored bloom and colour-grade values at `src/main.ts:618,620` should take effect.
- [ ] Repeat the screenshot on a device or browser without float linear filtering and check that the AO now visible does not darken the road too much. If it does, decide whether to accept it or stop using `looks.preset` for this scene (no look option disables its AO).
- [ ] Optional: compare `?aura3d-render=production` against the default to isolate any visual difference to the render path.
- [ ] Confirm `route-health.json` budgets still hold (30 FPS minimum, 8000 ms boot, at most 32 model nodes; the scene has 30).
