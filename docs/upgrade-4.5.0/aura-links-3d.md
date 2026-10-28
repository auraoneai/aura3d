# Aura Links 3D (`aura-links-3d`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. Nothing in the source has to change to build or run on 4.5.0, but two courses (`night-city`, `space`) get a different environment fill, contact shadows now render as a real mask, and the render path, canvas read-back and shadow behaviour should be confirmed once on 4.5.0.

## What this game uses

- `apps/showcase-aura-links-3d/package.json`: `@aura3d/engine` as `workspace:*`, game version already `4.5.0`. The only 4.5.0 package change is the version number.
- `apps/showcase-aura-links-3d/src/main.ts` (2591 lines) is the only file that calls the engine's scene API. `src/game/*.ts` is pure math plus `rig.ts` (GLB golfer rig).
- One `createAuraApp("#app", {...})` call at `src/main.ts:2510-2514`. It passes `scene`, `...looks.appOptions(state.course.look)` and `qualityRebuild: { flags: ["game"] }`. There is no `quality`, `output`, `preserveDrawingBuffer` or `renderer.*` option of its own. `looks.appOptions` returns `renderer: { qualityProfile: "production" }` plus `pixelRatio` (`packages/engine/src/agent-api/looks/looks.ts:424-431`). The renderer reads `qualityProfile` only as a deprecated pixel-ratio/draw-budget preset, not as a render-path request (`renderPath.ts:151`). So the effective quality is `auto` (`renderPath.ts:156`).
- Hole scene is built in `buildHoleScene` (`src/main.ts:787-980`) and re-mounted per hole with `app.setScene` (`src/main.ts:1731`).
- Looks: `looks.preset(course.look, ...)` at `src/main.ts:961`. The six courses are, in order (`src/game/courses.ts:178, 325, 466, 607, 748, 889`): `stAuroras` (`outdoor-day`), `mapleHollow` (`outdoor-day`), `cinderRim` (`golden-hour`), `cloudTerrace` (`alpine-snow`), `neonBay` (`night-city`), `mareCourse` (`space`). The `look:` line of each course is the line cited; its `lookOverrides` is the next line.
- Authored lights (`src/main.ts:931-933`): ambient, hemisphere and a non-shadow directional "course rim fill". The night-city course adds 4 spot lights (`src/main.ts:720`). The shadow-casting key light comes from the look ("look key light", `looks.ts:306`, `shadow: true`).
- Effects authored in the scene (`src/main.ts:944-951`): `effects.fog`, `effects.contactShadows({ intensity: 0.62, length: 0.32, steps: 12, lights: "sun" })`, `effects.vignette`. The look preset adds `colorGrade`, `ambientOcclusion` and `bloom` (`lookPresets.ts:60` `V0_EFFECTS`, expanded in `looks.ts:333-350`). Also `effects.trail` (`src/main.ts:875`).
- Instancing: `instances.cylinder/sphere` for conifers (`src/main.ts:360-363`), `instances.model` for pines, rocks and gallery fans (`src/main.ts:627, 660, 772`). Counts are small (6 fans, tens of trees/rocks), all `castShadow: true`.
- Primitives, `geometry.custom`, `text3D` (`src/main.ts:509`, options `size, depth, letterSpacing, backend, material`), `material.pbr/emissive`. Several materials use `opacity < 1`: `ball-shadow` (`src/main.ts:874`), `aim-line` (`877`), `read-arrow-*` (`893`), `golfer-shadow` (`src/game/rig.ts:108`).
- Animation: GLB golfer with `.animate({clip})`, `animation.attach` sockets and `setAnimationPose({ mode: "overlay" })` (`src/game/rig.ts:4-15, 125-136`). No `playLayer`, masks or `addClipsFrom`.
- No canvas read-back anywhere in `src/`. The game never calls `readPixels`, `drawImage(canvas)`, `toDataURL`, `toBlob`, `app.screenshot` or `app.capture` (rg over `src`, `index.html`, `scripts`).
- No physics options, no `interactions.*`, no `Clock`, `AnimationClip`, `ShapeGeometry` or `SphericalHarmonics3`.
- Evidence modes: `?still=N` steps `app.step(1/60)` N times with the loop paused (`src/main.ts:2572-2588`), `installGameBeacon` (`src/main.ts:95`).

## What changes for this game in 4.5.0

### 1. Night-city and space courses get an explicit environment fill (looks change)

- **What happens now:** the `night-city` and `space` look presets have no HDRI (`hdri: null`). On 4.3.7 they emitted no environment node, so the scene-category fill applied. In 4.5.0 they emit one: `environments.nightCinematic` (intensity 1.0) for `night-city` and `environments.studio` (intensity 0.75) for `space`. Evidence: `looks.ts:299-302`, `lookPresets.ts:167` and `lookPresets.ts:271`. Courses 5 (`neonBay`, night-city) and 6 (`mareCourse`, space) therefore get a different amount of ambient/IBL light than on 4.3.7. The other four courses (`stAuroras`, `mapleHollow`, `cinderRim`, `cloudTerrace`, on the `outdoor-day`, `golden-hour` and `alpine-snow` looks) already had an HDRI environment and are not changed by this. The direction and size of the brightness shift is unknown without rendering it.
- **What to do:** Capture before/after and compare. If a course reads too dark or too bright, tune the existing per-course override, which the game already uses (`exposureEv` at `courses.ts:749` for night-city and `courses.ts:890` for space; the default `exposureEv: -0.06` at `src/main.ts:956`). For example, in the `neonBay` course spec:
  ```ts
  lookOverrides: { fogDensityScale: 0, exposureEv: 0.1 },
  ```
  Alternatively adjust the game's own fill lights (`src/main.ts:918-929`, `fill.ambientI` / `fill.hemiI` for the `night-city` and `space` branches).
- **How to check:** Render `neonBay` and `mareCourse` on 4.3.7 (`main`) and 4.5.0 with `?course=neonBay&still=60&capture=1` and `?course=mareCourse&still=60&capture=1` and compare the frames (the URL param is `course`, read at `src/main.ts:2500`). Then `node tools/game-checks/run.mjs aura-links-3d` (verified to resolve this game; 0 errors, 0 warnings on `beat3js2/integration`).

### 2. Render path stays on the HDR chain; bloom fusion and cascade skipping apply under `auto`

- **What happens now:** The game does not set `quality`, so 4.5.0 uses `auto` (`renderPath.ts:156`). `auto` only picks the direct canvas path when `renderPathBlockers` is empty. This scene always has blockers: effect nodes (`vignette`, `contactShadows`, `colorGrade`, `ambientOcclusion`, `bloom`; only `fog` is exempt, `renderPath.ts:117`), an `hdri` environment on the `outdoor-day`, `golden-hour` and `alpine-snow` looks (`renderPath.ts:125`) and transparent materials (`renderPath.ts:133`). So the game stays on the HDR chain on every course and the "up to 48/255 on 0.1-0.3% of pixels" silhouette difference of the direct path does not apply. What does apply under `auto` is bloom pass fusion (section 3) and the cascade rules (section 5). The HDR chain relies on `A3D_QR_CORE` being on. It is: the game's `qualityRebuild: { flags: ["game"] }` only sets `A3D_QR_GAME`, and `resolveQrFlags` then applies the default-on states (`packages/engine/src/contracts/flags.ts:189-`, `flags.state.ts:18`), so `A3D_QR_CORE` stays on. Only a URL `?a3d-qr=none` or `-core` would turn it off (the report would then show the legacy LDR route).
- **What to do:** Nothing is required. To keep the 4.3.7 pipeline unchanged (no bloom fusion, no `auto` heuristics) pin it:
  ```ts
  auraApp = createAuraApp("#app", {
    scene: buildHoleScene(...),
    ...looks.appOptions(state.course.look),
    quality: "production",
    qualityRebuild: { flags: ["game"] }
  } as any);
  ```
  (`src/main.ts:2510`; `quality` is accepted as `auto | production | safe-basic | cinematic`, `renderPath.ts:138-149`.) Pinning is optional; it does not undo sections 1 and 4, which are independent of quality.
- **How to check:** After `ready`, log `app.diagnostics().renderPath`. It should report `path: "hdr-msaa"`, `quality: "auto"` (or `"production"` if pinned). Add it to the existing route-state log at `src/main.ts:2561-2567`:
  ```ts
  console.log("[links] renderPath:", JSON.stringify(diag?.renderPath));
  ```

### 3. Bloom fusion is on for this game under `auto`

- **What happens now:** Every look adds a `bloom` effect (`lookPresets.ts:60`, `looks.ts:346-350`), and the path is `hdr-msaa`, so under `quality: "auto"` the bloom chain is fused with mode `"separable"` (default). Evidence: `renderPath.ts:33-37` (`reportedBloomFusion`). The task notes frames within 1/255 of the old chain; this game was not measured.
- **What to do:** Nothing. The opt-in 2-D variant is `renderer: { ...looks.appOptions(...).renderer, bloomFusion: "fused-2d" }` (`AuraBloomFusion`, `nodes/types.ts:1183`). Do not enable it without a visual check.
- **How to check:** `app.diagnostics().renderPath.bloomFusion` should be `"separable"`. With `quality: "production"` it reports `"off"`.

### 4. Contact shadows are now a real screen-space mask (visible change on every course)

- **What happens now:** `effects.contactShadows(...)` at `src/main.ts:950` now produces a mask sampled by forward lighting and darkens the shadow-casting sun's light on shadow-receiving materials (`Prd02ContactShadowsContributor.ts:11`, `:223-231`). The game's sun is the look's "look key light" with `shadow: true` (`looks.ts:306`), so the effect has a light to work on. The "course rim fill" directional (`src/main.ts:933`) has no shadow and is not the sun. Expect extra darkening where the ball, tee markers, bleachers, clubhouse and trees touch the turf, with `intensity: 0.62`, `length: 0.32`, `steps: 12`. If a visible result is missing, the contributor reports `unavailable` with one `console.warn`: `no-shadow-casting-directional-light` (`Prd02ContactShadowsContributor.ts:70, 300-305`) or `no-drawn-program-samples-the-mask` (`:71, :229-231`). Textured PBR GLB materials with extension textures (clearcoat, transmission and similar) may not sample the mask (warning text at `:231`); whether the Meshy golfer and props are affected is unknown.
- **What to do:** Review the look. If the contact darkening is too strong, lower `intensity` (the only knob that is a pure strength control):
  ```ts
  effects.contactShadows({ intensity: 0.4, length: 0.32, steps: 12, lights: "sun" }),
  ```
- **How to check:** `app.diagnostics()` should show `contactShadows` without an `unavailable` field. Check the console for `[prd02.contactShadows]` warnings, and compare a `?still=60&capture=1` frame against 4.3.7 on a hole with bleachers and trees.

### 5. Shadow cascades no receiver selects are skipped under `auto` (check shadow edges)

- **What happens now:** On `auto`/`cinematic`, cascades that no receiver selects are skipped. The look key light is shadow-casting and the scene has tens of casting instances and a large terrain, so cascade selection can change on distant geometry (far tree belts, backdrops). Instance counts here are far below the 1024 and 8192 thresholds for shadow-proxy geometry, capped cascades and dense instanced depth batching, so those do not trigger.
- **What to do:** Nothing unless distant shadows disappear or pop. Then pin `quality: "production"` as in section 2 and compare.
- **How to check:** Fly the camera (autopilot ball cam) over a hole with a long fairway on a tree course (`mapleHollow`, `stAuroras`, `cloudTerrace`) and compare distant tree shadows with 4.3.7. The volcanic (`cinderRim`) and lunar (`mareCourse`) courses place no trees, so they are not useful for this check.

### 6. Canvas read-back: only an issue for external capture tooling

- **What happens now:** `preserveDrawingBuffer` now defaults to `false` unless the URL has `?capture=1` or `?qa=1` (`renderPath.ts:181-195`, `wantsPreservedDrawingBuffer`). The game itself reads no pixels (no matches in `src/`). `?still=N` (`src/main.ts:2572-2588`) steps frames and publishes evidence without reading the canvas. External tools that call `canvas.toDataURL()` or grab the canvas after an `await` can now get blank frames. `tools/filmstrip/capture-films.mjs` tries a CDP screenshot first and `toDataURL` as fallback (`:157-171`); its fallback can return black without the flag.
- **What to do:** Add `capture=1` to the URLs used for screenshots and evidence runs of this game (for example `/apps/showcase-aura-links-3d/?capture=1&still=60`). If the game ever needs to read the canvas itself, pass `preserveDrawingBuffer: true` in the `createAuraApp` options or use `app.capture()` / `app.screenshot()` instead of reading the canvas.
- **How to check:** Capture one frame via the quality-rebuild capture entry for `showcase-aura-links-3d` (`tools/quality-rebuild-capture/games.json:1322`) with and without `capture=1`; the frame must not be blank. `readySelector` in `route-health.json` (`body[data-aura3d-ready="true"]`) is set by the game and unaffected.

### 7. Per-frame cost and diagnostics changes (informational)

- **What happens now:** `getError` is now sampled instead of read every frame (every frame only with `?diag=1` or strict/frame mode), and the engine reduces per-frame allocations and removes unused warm programs. Nothing in the game depends on this. The game reads `diag?.drawCalls`, `diag?.errors` and `diag?.warnings` once after `ready` (`src/main.ts:2561-2567`). Errors that were previously caught each frame may surface later. Draw-call numbers can differ from 4.3.7 because of bloom fusion (section 3) and skipped cascades (section 5).
- **What to do:** If `route-health.json` budgets (`maxModelNodes: 48`, `minFps: 30`, `maxBootMs: 9000`, lines 54-56) are re-measured, re-measure on 4.5.0; the numbers in the file were generated 2026-10-17 against the old build.
- **How to check:** Read `app.diagnostics()` at `ready` and compare `drawCalls` with 4.3.7.

## Changes that do not affect this game

- **Direct render path as the final path:** Scene always carries effect nodes, an HDRI environment on three looks and opacity < 1 materials, so it stays on the HDR chain (section 2). No silhouette-edge difference from canvas MSAA.
- **Lights without an environment render darker:** Not applicable. Every course goes through `looks.preset`, which emits an environment node (HDRI, or the new fill for `night-city`/`space`), so the "authored lights only" branch (`environment.ts` `explicitLightFillFree`, used when no `environments.*` node exists) is not reached. The only environment-related change is the night-city/space fill (section 1).
- **Hemisphere light contribution:** The game has a hemisphere light (`src/main.ts:932`), but because an environment node exists the engine uses the `prd02.explicit` source, which calls `prd02AmbientTerm(snapshot)` without `includeHemisphere` (`environment.ts:541`). The hemisphere term only enters the neutral-room source (`environment.ts:558`). No change expected. Confirm by screenshot comparison in section 1.
- **Look presets `polar-night`, `neon-arcade`, `underwater` gaining fill:** The game uses none of them (looks listed above).
- **OPTION_IGNORED on `primitives.*` / `instances.*` / `interactions.*`:** All options the game passes are in the builder's read list (`PRIMITIVE_OPTION_KEYS`, `primitives.ts:58-64`: `name, size, material, castShadow, transforms, colors, ...`). `instances.model` options (`name, transforms, targetHeight, castShadow`) are read by the model builder. `text3D` options `depth, letterSpacing, backend` are stripped before they reach `primitive()` (`text3d.ts:20-33`), so they do not produce a note. `geometry.custom` options are `name, material, castShadow`. `effects.trail` (`src/main.ts:875`, cast `as any`) is an effect, not covered by this check. Expect no `OPTION_IGNORED` entries; `app.diagnostics()` will show if one was missed.
- **`primitive()` forwarding `renderOrder`, `frustumCulled`, `layers`, `userData`, `rotationOrder`, `quaternion`:** The game passes none of them.
- **`interactions.orbit` node/point/autoRotate:** The game does not use `interactions.*`. The orbit camera in the game is hand-written (`cam.orbit`, `src/main.ts:1150, 1191`).
- **Instancing: `setInstanceTransforms(Float32Array)`, shadow proxy (>= 1024), cascade cap (>= 8192 casters), dense instanced depth (WP-9):** Instance counts are tens of trees/rocks and 6 fans (`src/main.ts:627, 660, 772`), and the game never calls `setInstanceTransforms`. Per-instance frustum culling applies automatically and needs no change.
- **Effects RGBA32F point-sampling fallback (AO, DoF, god rays, TAA, motion blur, auto exposure):** Ambient occlusion is in every look (`lookPresets.ts:60`) so devices without float linear filtering will now show AO; this is a fix, not a regression. No action. Other listed effects are not used.
- **Animation (`playLayer`, masks, `addClipsFrom`, retarget worker) and physics (capsule/cylinder colliders, `bindNodes`):** The game uses `.animate`, `animation.attach` and overlay pose only (`src/game/rig.ts:4-15`) and has no physics options.
- **Math/animation (`Clock.start()`, step tracks, `ShapeGeometry`, `SphericalHarmonics3.getBasisAt`, `@aura3d/math/three`):** No uses in `src/`.
- **Scene kits (`particleFountain`, `solarSystem`, `neonTunnel`) and built-in humanoid GLB provenance:** No scene kits and no built-in humanoid; the golfer is `assets.linksGolferAthleteMeshy`.
- **Package version pins:** Already `4.5.0` (`apps/showcase-aura-links-3d/package.json`).

## Checklist

- [ ] Run `node tools/game-checks/run.mjs aura-links-3d` on `beat3js2/integration` (verified to resolve this game: 0 errors, 0 warnings).
- [ ] Log `app.diagnostics().renderPath` at `ready` (`src/main.ts:2561`) and confirm `path: "hdr-msaa"`, `quality: "auto"`, `bloomFusion: "separable"`.
- [ ] Confirm `app.diagnostics()` has no `OPTION_IGNORED` entries and no `contactShadows.unavailable` field; check the console for `[prd02.contactShadows]` warnings.
- [ ] Compare the `neonBay` (night-city) and `mareCourse` (space) courses before and after (`?course=<id>&still=60&capture=1`); adjust `lookOverrides.exposureEv` in `src/game/courses.ts:749` / `:890` if the new fill changes the look.
- [ ] Compare one frame per remaining course (`stAuroras`/`mapleHollow` outdoor-day, `cinderRim` golden-hour, `cloudTerrace` alpine-snow) for the contact-shadow change; lower the `intensity` at `src/main.ts:950` if needed.
- [ ] Check distant tree/backdrop shadows on `mapleHollow`, `stAuroras` and `cloudTerrace`; if they differ and matter, set `quality: "production"` in the `createAuraApp` call at `src/main.ts:2510`.
- [ ] Add `?capture=1` to every screenshot or evidence URL used for this game (capture scripts, `tools/quality-rebuild-capture`, filmstrip fallback).
- [ ] Re-measure `route-health.json` budgets (`minFps`, `maxBootMs`) on 4.5.0 if the file is regenerated.
- [ ] Confirm the build still passes: `tsc -p apps/showcase-aura-links-3d/tsconfig.json --noEmit` (the package's `build` script; run on the remote runner per repo policy).
