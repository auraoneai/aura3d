# Cumulus Dash (`cloud-runner-port`): upgrading to Aura3D 4.5.0

**Verdict:** The game runs on 4.5.0 without code changes. It keeps the HDR render chain (it authors bloom, colour grade, vignette, output options and custom shaders), reads pixels only through `app.capture()`, and passes only options that the builders read. The "no change" claim for the `sky-fill` hemisphere light was wrong: 4.5.0 dropped it (see section 3). The 2026-10-29 audit fixes (lane g25, `docs/audits/lanes/g25.md`) changed the game and record the measured before and after numbers.

**Update 2026-10-29 (audit lane g25):** the QA hook is now `installQaHooks("cumulus-dash", ...)`, which publishes `window.__AURA_CUMULUS_DASH__`. Where this guide says `__AURA_KID_GOKU__`, use `__AURA_CUMULUS_DASH__` on current builds. `bloom.radius` was removed and the look sun now points along the authored sun. The vignette stays: it renders through the post-v2 bridge although `diagnostics().effects` lists it with consumer `none`; removing it raised mean luma from 131 to 199 (remote A/B run `g25-abvig-*`).

## What this game uses

- `apps/showcase-cloud-runner-port/src/main.ts` is a 3-line shim. It imports `apps/showcase-port-shared/diag.ts` (the `?diag=1` panel, built on `@aura3d/debug`) and mounts `examples/kid-goku-beyond-the-clouds-port/main.ts`. All game code lives in that example folder. `apps/showcase-cloud-runner-port/package.json` already pins `4.5.0`.
- **App creation:** one `createAuraApp(canvas, {...})` call at `examples/kid-goku-beyond-the-clouds-port/main.ts:266-272`. It sets `autoStart: false`, `pixelRatio: min(dpr, 1.5)`, `renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }` and `output: { toneMapping: "aces", dither: false }`. It sets no `quality`, no `preserveDrawingBuffer` and no `bloomFusion`.
- **Scene, `world.ts:58-65`:**
  - `looks.preset("outdoor-day", { sun: {...}, fogDensityScale: 0 })`.
  - A `lights.directional` sun with `shadow: { cascades: 3, maxDistance: 120, blend: 0.14 }`.
  - A `lights.hemisphere` named `sky-fill`, intensity 0.7.
  - `effects.fog`, `effects.bloom`, `effects.colorGrade` and `effects.vignette`.
  - There is no `environments.*` call. `environments` is imported at `world.ts:8` but never called.
- **Materials:** almost everything uses `material.custom(...)` shader specs (`materials.ts`, `shaders.ts`: sky, valley, water, scenery, warning decals, glow points, ball, shadow blob). The road is `material.pbr`.
- **Primitives:** `primitives.sphere` is called only with `name`, `size`, `castShadow` and `material` (`world.ts:76`, `140`, `141`). The rest is `geometry.custom` / `geometry.dynamic` and `model(MESHY.x, {...})`.
- **Instancing:** four `instances.model` nodes (`world.ts:99-102`). Counts are capped by `HERO_TREE_CAP = 150`, `HERO_ROCK_CAP = 90` (`terrain.ts:165`) and `HERO_MESA_CAP = 46` (`props.ts:48`). Transforms are built once at mount.
- **Animation:** `hero.play(clip, { loop, captureTime, crossFade })` and `hero.setAnimationPose(...)` (`world.ts:195`, `207`, `211`, `215`), plus the game's own planted-foot gait (`gait.ts`). There is no `playLayer`, `addClipsFrom` or mask use.
- **Other APIs:**
  - `createFixedStepLoop`, `installQaHooks("kid-goku", ...)` and `createAuraRouteHealthSnapshot` (`main.ts:9`, `110`, `137`, `141`).
  - `createLocomotion` from `@aura3d/engine/game` (`world.ts:12`).
  - There are no `interactions.*`, no physics, no `Clock`, `AnimationClip` or `ShapeGeometry`, and no `effects.contactShadows`.
- **Canvas read-back:** only through `app.capture({ type: "png-blob" })` (`main.ts:199-236`: `capture()`, `pixels()`, `frame()`). `pixels()` and `frame()` call `render(STEP)` first. The `drawImage` and `getImageData` calls run on an `OffscreenCanvas` copy of the captured blob, not on the WebGL canvas. A search of the example folder and `apps/showcase-port-shared` found no `toDataURL`, `toBlob`, `readPixels` or `drawImage(canvas)` on the WebGL canvas.

## What changes for this game in 4.5.0

Nothing needs editing in the game. These are the behaviour changes that do reach this game, all automatic:

### 1. Quality is now `auto`, but the scene stays on the HDR chain
- **What happens now:** `createAuraApp` resolves quality to `auto` because the game does not pass `quality`. `renderer.qualityProfile: "production"` does not select the pipeline. `packages/engine/src/agent-api/app/renderPath.ts:151` calls it "a deprecated pixel-ratio/draw-budget preset, not a pipeline request". `renderPathBlockers` (`renderPath.ts:103-136`) finds these blockers here:
  - `output options` (`main.ts:270` sets `output`);
  - `effect "bloom"`, `"colorGrade"` and `"vignette"` (`world.ts:63-65`);
  - `shader material "..."` (custom materials);
  - `hdri environment` (from the look).

  `resolveRenderPath` (`packages/rendering/src/quality/DirectPath.ts:50`) then returns `hdr-msaa`. So there is no switch to the direct path and no canvas-MSAA silhouette change.
- **What does change:** under `auto`, bloom pass fusion (`bloomFusionAllowed`, `renderPath.ts:24-26`: `auto` or `cinematic` only) and, per the 4.5.0 notes, "skip shadow cascades that no receiver selects" (`packages/rendering/src/shadows/CascadeUse.ts`) are allowed. Bloom fusion defaults to `"separable"`, which the 4.5.0 notes describe as frames within 1/255 of the old chain. Cascade skipping removes shadow draws and should not change pixels. Both are performance changes. I verified the bloom gate in code. I did not read the code that applies the cascade skipping.
- **What to do:** nothing. Optional: if you want the old pipeline exactly, as the 4.3.7 build had it, pin it:
  ```ts
  app = createAuraApp(canvas, {
    quality: "production",            // 4.5.0: no bloom fusion (and, per the notes, no cascade skipping)
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "aces", dither: false },
    // ...
  });
  ```
  `?aura3d-render=production` does the same for a one-off comparison without a rebuild (`renderPath.ts:138-149`).
- **How to check:** in a browser console, run `window.__AURA_KID_GOKU__.diagnostics()` and read `renderPath`. Expect `path: "hdr-msaa"`, `quality: "auto"` and a `reason` listing the blockers. Also expect `bloomFusion: "separable"`, because bloom is present and the path is HDR. Then compare `?capture=1` frames at the same `place(...)` positions between `?aura3d-render=production` and the default, both on 4.5.0. Differences should be at most 1/255.
- **Hook-name mismatch (pre-existing, not caused by 4.5.0):** `main.ts:137` calls `installQaHooks("kid-goku", ...)`, which publishes `window.__AURA_KID_GOKU__` (`packages/engine/src/qa/hooks.ts:74-76`). Three Playwright specs still read the old name `window.__AURA_CUMULUS_DASH__` and cannot find the hook: `tests/browser/kid-goku-beyond-the-clouds-port.spec.ts` (lines 41, 57, 61, 89, 96, 111, 140, 142, 143), `tests/browser/kid-goku-art-frames.spec.ts` (line 34 onward) and `tests/browser/framecmp-kid.spec.ts` (line 4). `tests/browser/kid-goku-rework.spec.ts:24-25` documents the rename and reads both names. The only skip in the main spec (line 148) depends on the replay fixture, not on the hook name. Fix by reading `__AURA_KID_GOKU__ ?? __AURA_CUMULUS_DASH__`, as `kid-goku-rework.spec.ts` does.

### 2. Fewer, lighter per-frame costs (no action)
- **What happens now:** `getError` is sampled instead of called every frame, and the per-frame allocation and program-warming changes (WP-5, WP-7) are automatic. The game's per-frame code (`render()` at `main.ts:91-103`, `app.step(0)`) is unchanged.
- **What to do:** nothing.
- **How to check:** `?diag=1` still works. `portDiagnostics` in `apps/showcase-port-shared/diag.ts` reads draw calls and backend from the QA hook. If you need `getError` every frame while debugging, `?diag=1` turns it on.

### 3. Hemisphere light: dropped in 4.5.0 (the original "no change" below was wrong)

**Correction (2026-10-29 audit, row CR-3):** in 4.3.7 the `sky-fill` hemisphere was turned into a direct spot proxy. In 4.5.0 it is dropped as a direct light, and the explicit-environment route does not add it to the ambient term, so it contributed nothing (live diagnostics: `lightsEvaluated 2`, `hemisphere:false`). Lane E2 fixes the engine path; with that fix the light contributes again, measured at +1.0% mean luma (110.66 to 111.72). The game keeps `sky-fill` at 0.7. The text below is the original analysis, kept for the record.
- **What happens now:** 4.5.0 makes hemisphere lights contribute (mean of sky and ground) on the authored-lights-only path and the neutral-room path (`packages/engine/src/agent-api/compiler/environment.ts`: `explicitLightFillFree` at `:50`, the `implicitFill === false` branch at `:172`, and `prd02AmbientTerm(snapshot, { includeHemisphere: true })` at `:558`). This game has an authored environment node, because `looks.preset("outdoor-day")` emits `environments.hdri` (`packages/engine/src/agent-api/looks/lookPresets.ts:108-121`, `packages/engine/src/agent-api/looks/looks.ts:291-297`). So it takes the explicit-environment route. That route calls `prd02AmbientTerm(snapshot)` without hemisphere (`environment.ts:541`), and the older bridge branch (`if (authoredEnvironment)` at `environment.ts:95`) returns before the `implicitFill` code at `:172`. The `sky-fill` light at `world.ts:61` should therefore render as it did in 4.3.7.
- **What to do:** nothing. If the ground or the hero looks brighter or bluer than in 4.3.7, change `intensity` on `sky-fill` (`world.ts:61`).
- **How to check:** take one `?capture=1&autostart=1` frame via `__AURA_KID_GOKU__.capture()` on 4.3.7 and on 4.5.0 with `?aura3d-render=production`, at the same `place(s)`, and compare mean luma. I did not run the renderer, so the "no change" part is derived from the code, not measured.

## Changes that do not affect this game

1. **Direct render path (change 1, silhouette edges):** not used. The scene is blocked from the direct path (see above), so there is no canvas-MSAA edge difference.
2. **`preserveDrawingBuffer` default false:** the game reads pixels only through `app.capture()` (`main.ts:199-236`). In 4.5.0 `capture()` re-renders and reads the framebuffer in the same task (`packages/engine/src/lanes/prd01/outputSurface.ts:250-266`: `app.step()` at 260, `readPixels` at 266). The game never uses `toDataURL`, `readPixels` or `drawImage(canvas)` on the WebGL canvas. No opt-in is needed in the game. Test-side exception to check: `tests/browser/kid-goku-art-frames.spec.ts:50` uses `page.screenshot` after awaited settles. Confirm those screenshots are not blank under the new default (the spec is also affected by the hook-name mismatch above).
3. **Exposure and implicit scene fill:** the look supplies an `environments.hdri` node, so the scene is not "authored lights and no environment". `output.exposure` is not set either. The new darker-by-default path (`options.implicitFill === false` branch) is not reached.
4. **Look presets that gained a procedural fill (night-city, polar-night, neon-arcade, space, underwater):** the game uses `outdoor-day`, which already has an HDRI and gained no fill (`lookPresets.ts`).
5. **`OPTION_IGNORED`:** `primitives.sphere` receives only `name`, `size`, `castShadow` and `material`, all in `PRIMITIVE_OPTION_KEYS` (`packages/engine/src/agent-api/nodes/primitives.ts:58-64`). `instances.model` has no unread-option guard in 4.5.0 (`packages/engine/src/agent-api/nodes/instances.ts`). There are no `interactions.*` calls. `app.diagnostics()` should list no `OPTION_IGNORED` entries. Check with `__AURA_KID_GOKU__.diagnostics()`.
6. **`interactions.orbit` target, position and autoRotate:** the game has no interactions and uses a chase camera (`cameras.chase()`, `world.ts:180`).
7. **Instancing changes (typed-array transforms, per-instance culling, shadow proxy at 1024 or more instances, auto cascade cap at 8192 or more casters, dense depth batching):** the four instanced nodes hold at most 150, 150, 90 and 46 instances. They are `instances.model` nodes, not built-in primitive instances, so the shadow proxy does not apply. They are far below the other thresholds. The game never calls `setInstanceTransforms`.
8. **Bloom fusion option:** the game does not set `renderer.bloomFusion`. The default `"separable"` applies and is covered under change 1. `"fused-2d"` is opt-in and not used.
9. **`effects.contactShadows`:** not used. The hero blob shadow is a custom mesh (`hero-shadow`, `world.ts`).
10. **Float-target filtering fix (AO, depth of field, god rays, TAA, motion blur, auto exposure):** the game uses none of these effects.
11. **Animation and physics (`playLayer` masks, `addClipsFrom` handle, retarget worker, collider sizes, `bindNodes`):** the game uses only `play` and `setAnimationPose`, and has no physics.
12. **Math and animation fixes (`Clock.start()`, step-track values, `ShapeGeometry`, `SphericalHarmonics3.getBasisAt`, `@aura3d/math/three`):** none of these are used. The game's time comes from `createFixedStepLoop` and its own accumulators.
13. **Scene kits (`particleFountain`, `solarSystem`, `neonTunnel`) and the built-in humanoid provenance:** the game uses no scene kits and loads its own Meshy models.
14. **Package versions:** `apps/showcase-cloud-runner-port/package.json` is already `4.5.0`. The game's source lives in `examples/kid-goku-beyond-the-clouds-port/`, which has no `package.json`. I did not check its `index.html` for version pins.

## Checklist

- [x] Run `node tools/game-checks/run.mjs cloud-runner-port` and confirm 0 errors (0 errors, 0 warnings on 2026-10-29).
- [ ] Load the game with `?autostart=1` and read `diagnostics().renderPath`. Expect `path: "hdr-msaa"`, `quality: "auto"` and `bloomFusion: "separable"`.
- [ ] Confirm `diagnostics()` shows no `OPTION_IGNORED` or other new degradation entries.
- [ ] On 4.5.0, compare one `capture()` frame at a `place(s)` position between `?aura3d-render=production` and the default. Expect differences of at most 1/255 on bloom edges.
- [ ] Compare the same `place(s)` frame between 4.3.7 and 4.5.0 with `?aura3d-render=production`. Expect no change in overall brightness (this checks the hemisphere light and exposure assumptions).
- [x] Decide whether to pin `quality: "production"`: not pinned. The default stays (decision recorded in `docs/audits/lanes/g25.md`).
- [x] Run the unit tests in `tests/unit/kid-goku-beyond-the-clouds-port/` (106 passed on 2026-10-29) (replay, gait, game, presentation, scenery, audio-cues, shader-compile, locomotion and sim). They do not touch the render path.
- [x] Hook-name mismatch: resolved the other way round. The game now publishes `__AURA_CUMULUS_DASH__` again (`installQaHooks("cumulus-dash", ...)`, audit row CR-8), which is the name those three specs already read. The specs that read both names keep working.
