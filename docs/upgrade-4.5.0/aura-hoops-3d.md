# Aura Hoops 3D (`aura-hoops-3d`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. Nothing in the code has to change for the game to build and run on 4.5.0, but `effects.contactShadows` is now a real mask that darkens the floor, and the Shanghai and Orbit courts change their ambient fill. Both change how the game looks, so re-judge the six courts and refresh any stored screenshots.

## What this game uses

- Entry point: `apps/showcase-aura-hoops-3d/index.html` loads `src/main.ts` (3306 lines). Other files: `src/aura-assets.route.ts` (typed assets), `src/shotPhysics.ts`, `src/dribble.ts`, `src/hitStop.ts`, `src/locomotionRates.ts`. It imports `apps/showcase-port-shared/quickbar.css` only. There is no `apps/common` import.
- One `createAuraApp("#app", ...)` call at `src/main.ts:814-819`. Options: `scene`, `...looks.appOptions(venue.look)`, `qualityRebuild: { flags: ["game"] }`, `diagnostics: false`. There is no `quality`, `output`, `preserveDrawingBuffer` or `renderer.bloomFusion` option.
- `looks.appOptions()` returns `renderer: { qualityProfile: "production" }` and a `pixelRatio` when the look expansion is v0 (`packages/engine/src/agent-api/looks/looks.ts:424-432`; it returns `{}` if the expansion resolves to `v1-contracts`, `looks.ts:425`). `qualityProfile` is the deprecated pixel-ratio preset, not a pipeline request (`packages/engine/src/agent-api/app/renderPath.ts:138`, `requestedQuality`, which reads only `?aura3d-render=` and `options.quality`). Quality is therefore `"auto"`. `apps/showcase-aura-hoops-3d/route-health.json` still says `renderer.mode: "production"`; that is descriptive text and does not set anything.
- Six courts, each rebuilt through `auraApp.setScene(buildScene(venue))` (`src/main.ts:3133`). Look per court (`src/main.ts:218-250`): Rucker and Venice `golden-hour`, Athens `outdoor-day`, Manila `interior-warm`, Shanghai `night-city`, Orbit `neon-arcade`.
- Scene (`buildScene`, `src/main.ts:780-806`): `looks.preset(v.look, { fogDensityScale: 0, exposureEv: 0.16 })`, `effects.contactShadows({ intensity: 0.7, length: 0.28 })`, `effects.vignette(...)`, a perspective camera, then venue dressing.
- Every look expands to a colour-grade, ambient-occlusion and bloom effect, a shadow-casting directional "look key light", and either an HDRI environment or a procedural fill (`packages/engine/src/agent-api/looks/lookPresets.ts:60`, `looks.ts:286-350`).
- Extra lights: `lights.spot` floodlights (Manila `src/main.ts:700`, Rucker `:741`) and `lights.point` fills (Shanghai `:710-711`, Orbit `:732`). There is no hemisphere or ambient light.
- Other nodes: `effects.lightCone` (Orbit, `:733`), `decals.project` court scuffs (`:758`), `model(assets.*)` for athletes, hoop, court shell and set dressing, and `primitives.box/plane/cylinder/torus/sphere` with only `name`, `size` and `material` (for example `:509-516`, `:591-595`, `:623-626`).
- Transparent materials (`opacity < 1`) on the court logo (`:516`), net skirt, rim halo, ball and athlete shadow blobs, ring and aura (`:593`, `:595`, `:604`, `:623-626`).
- One instanced node: the Orbit starfield, `(instances as any).sphere({ name: "starfield", transforms: starT, material })` with 140 transforms (`:722-730`).
- Animation: `.animate({ clip: "Crouch_Idle_Loop" })` on each athlete (`:966`), `handle.setAnimation` / `setAnimationPose` (`:970`, `:2655`), and `animation.socket(bone)` reads (`:904`, `:1246`, `:2515`). There is no `playLayer`, `addClipsFrom` or mask use.
- Canvas read-back inside the game: none. The only canvas reader is `installBlackFrameGuard()` from `@aura3d/debug` (`:52`, `:62`), which samples in the same task as the GL draw (`packages/debug/src/safety/guard.ts` header comment). Its source is unchanged in 4.5.0 apart from `package.json`.
- Diagnostic URL flags handled by the game: `?diag=1`, `qaDt`, `qaStep`, `qaCam`, `simsteps`, `court`, `mode`, `menu` (`:427-438`, `:3278-3282`).
- Not used: `interactions.*`, `physics`, `Clock`, `AnimationClip`, `ShapeGeometry`, `SphericalHarmonics3`, custom shaders, transmission, scene kits, `environments.*` authored directly, explicit `output`/exposure options, `renderer.bloomFusion`.
- Package pin: `apps/showcase-aura-hoops-3d/package.json` is already `"version": "4.5.0"` with `@aura3d/engine: workspace:*`.
- `node tools/game-checks/run.mjs aura-hoops-3d` reported 0 errors and 0 warnings on this tree (re-run during verification).

## What changes for this game in 4.5.0

### 1. `effects.contactShadows` is now a real shadow mask (visible look change)

- **Before (4.3.7):** `effects.contactShadows()` lowered to the SSAO pass, so it behaved like extra ambient occlusion on top of the look's own AO.
- **Now:** it no longer lowers to the SSAO pass (`packages/engine/src/agent-api/compiler/postprocess.ts:70-71`). It marches a screen-space mask along the shadow-casting sun, and forward lighting samples it (`packages/rendering/src/passes/Prd02ContactShadowsContributor.ts:1-18`). It adds a half-resolution depth pass.
- **Applies because:** `src/main.ts:783` calls `effects.contactShadows({ intensity: 0.7, length: 0.28 })`. Every look adds a shadow-casting directional light (`looks.ts:304-311`), which the mask needs. Floors and court lines are `primitives.*` with `receiveShadow` defaulting to true (`packages/engine/src/agent-api/nodes/primitives.ts:89`), so they sample it. Options `intensity` and `length` are valid (`packages/engine/src/agent-api/nodes/effects.lighting.ts:8-14`; defaults 1 and 0.25).
- **Expect:** darker contact under the athletes, ball, hoop base and court lines. The mask only darkens the sun's light, so the spot floodlights (Manila, Rucker) and point fills (Shanghai, Orbit) are not affected by it. The game also draws its own blob shadows (`ball-shadow` `:604`, `${id}-shadow` `:623`), so the two can stack. I have not rendered it, so the size of the change is unknown.
- **When it does not run:** at quality tier `low` (`Prd02ContactShadowsContributor.ts:99`), or when vetoed by `A3D_QR_LIGHTING_CONTACT=off` / `?a3dLighting=contact=off`.
- **Materials that skip the mask:** the contributor's own warning (`Prd02ContactShadowsContributor.ts:230`) says textured-PBR materials with glTF extension textures (clearcoat, transmission and similar) do not sample the mask. Whether the athlete GLBs (`assets.hoopsAthleteGuard`, `assets.hoopsAthleteBig`) are in that group is unknown.
- **What to do:** capture all six courts before and after. If the floor reads too dark, lower `intensity` and let the existing blobs carry the contact shadow:
  ```ts
  .add(effects.contactShadows({ intensity: 0.4, length: 0.28 }))
  ```
  or remove the `effects.contactShadows` line and keep only the blob shadows.
- **How to check:** the mask is reported through the lighting extension; `app.lighting.diagnostics().contactShadows` returns `{ passExecuted, depthSource, unavailable? }` (`packages/engine/src/lanes/prd02.ts:272`). `unavailable` should be absent. If it is `no-drawn-program-samples-the-mask`, a `[prd02.contactShadows]` `console.warn` also appears once. Compare a `?capture=1` screenshot of each `?court=` value against 4.3.7 (see the checklist for how to produce both sets).
- **Cost:** the extra depth pass runs every frame. Check frame time on a mid-range device on all six courts; do not assume which one is heaviest (Rucker has the densest crowd and four floodlights, Athens loads a GLB venue).

### 2. Night City and Neon Arcade looks now carry a procedural fill (Shanghai, Orbit)

- **Now:** the `night-city` and `neon-arcade` presets gained `fill: { preset: "night", intensity: 1.0 }` (`lookPresets.ts:167` and `:358`). `looks.ts:299-303` adds `environments.nightCinematic` for them. In 4.3.7 these two courts relied on the scene category's implicit fill. 4.5.0 no longer adds that implicit fill when lights are authored and no environment node exists (`packages/engine/src/agent-api/compiler/environment.ts`, `implicitFill`, line 172).
- **Applies because:** Shanghai uses `night-city` (`src/main.ts:242`) and Orbit uses `neon-arcade` (`:248`). Both presets have `hdri: null`. The other four courts use presets with an HDRI, so they still have an `environments.hdri` node and keep their ambient (`lookPresets.ts` golden-hour, outdoor-day, interior-warm).
- **Net effect:** neither court should get the "scene goes dark" regression, because the look supplies its own environment node. The replacement fill is not guaranteed to match the old implicit fill brightness, so these two courts may be slightly brighter or darker. Unknown until compared.
- **What to do:** compare Shanghai and Orbit against 4.3.7 captures. If either is off, adjust the look override rather than adding lights:
  ```ts
  looks.preset(v.look, { fogDensityScale: 0, exposureEv: 0.16 })   // tune exposureEv per venue if needed
  ```
  or add an `environments.*` node after the look in `buildScene`.
- **How to check:** `?court=shanghai` and `?court=orbit` with `?capture=1`, before and after, at the same camera.

### 3. Render path stays on the HDR chain (confirm it, no action)

- **Now:** with quality `"auto"`, any effect node other than fog keeps the HDR chain (`renderPath.ts:117`, `renderPathBlockers`); transparent materials also block the direct path (`renderPath.ts:133`).
- **Applies because:** every court has colour-grade, AO, bloom (from the look), contact shadows and vignette (`src/main.ts:782-784`). So all six courts keep the HDR path and the "direct" canvas path never applies. The silhouette-edge difference from direct-path MSAA does not apply. The render path is re-decided on every `setScene` (`frameLoop.ts:83-85`).
- **What to do:** nothing. If you want the 4.3.7 pipeline byte-for-byte, add `quality: "production"` to the `createAuraApp` options at `src/main.ts:814`. You can also test it without a code change with `?aura3d-render=production` in the URL.
- **How to check:** `auraApp.diagnostics().renderPath` should report `path: "hdr-msaa"`. The game passes `diagnostics: false`, which only controls the overlay (`createAuraApp.ts:150`); I did not run `diagnostics()` in a browser, so confirm it in a dev build.

### 4. Bloom fusion and ambient-occlusion target fix (automatic, look-neutral)

- **Bloom:** the looks include bloom, so on `auto` the bloom chain is fused (`renderPath.ts:24` `bloomFusionAllowed`; the PBR viewer measurement was 25 vs 33 draws, within 1/255). The default mode is `"separable"`. You get this with no change. Check `diagnostics().renderPath.bloomFusion`.
- **Ambient occlusion:** every look includes `ambientOcclusion` (`looks.ts:343`). On devices without float linear filtering, AO previously had no visible effect and now samples point-filtered. That can darken crevices (under the net, athlete feet) on those devices. On desktop GPUs with float linear filtering nothing changes.
- **How to check:** run one software-GL capture on the remote runner (no float linear filtering there is likely but not guaranteed; confirm with the device's reported extensions) and compare it with 4.3.7 under the same conditions.

### 5. Per-frame cost, shadows and camera-facing diagnostics (automatic)

- Per-frame `getError` is now sampled, allocations are reduced and unused warm programs are dropped. The game benefits with no change. `?diag=1` forces `getError` every frame, so frame-time numbers taken with `?diag=1` (the game's own QA flags need it) are not comparable to normal runs.
- Shadow cascades that no receiver selects are skipped on auto/cinematic. Whether this fires on any court is unknown. The look shadows are visible on the floor and athletes, so expect no visual change; compare once.

### 6. Capture tooling that reads the canvas

- **Game code:** nothing reads pixels, so the `preserveDrawingBuffer` default change does not break the game. `installBlackFrameGuard` samples inside the draw task and is unaffected.
- **Repo tooling:** `tools/filmstrip/capture-films.mjs:160-181` tries CDP `Page.captureScreenshot` first (line 161), then falls back to `canvas.toDataURL` (line 171). The fallback returns a blank canvas unless the page is opened with `?capture=1` or `?qa=1` (`renderPath.ts` `wantsPreservedDrawingBuffer`). The comment at `capture-films.mjs:9` saying the engine context has `preserveDrawingBuffer` is stale. `tools/filmstrip/probe-capture.mjs:55` does the same `toDataURL` read. Open the game with `?capture=1` when using those scripts. Do not set `preserveDrawingBuffer: true` in the game itself; it costs frame time and the CDP route does not need it.

## Changes that do not affect this game

- Direct render path and canvas MSAA edge differences (1): effects, bloom and transparent materials keep the HDR chain on all six courts.
- `preserveDrawingBuffer` default (2): no read-back in `src/` (see item 6 above for tooling only).
- Implicit environment removal causing darker scenes (3): every look supplies an `environments.*` node. The hemisphere-light contribution fix does not apply because the game has no hemisphere light. The `polar-night`, `space` and `underwater` fills do not apply because the game does not use those looks.
- `OPTION_IGNORED` and the `primitive()` forwarding fix (4): the game passes only `name`, `size` and `material` to `primitives.*`, and `name`, `transforms`, `material` to `instances.sphere`, all valid (`primitives.ts:58-64`; `instances.sphere` goes through the same primitive option check). No `interactions.*` calls.
- `interactions.orbit` (5): not used. The Orbit court's camera is custom code (`src/main.ts:2681-2699`).
- Instancing changes (6): the only instanced node is 140 starfield spheres. The shadow proxy needs at least 1024 shadow-casting instances, the cascade cap needs 8192, and `setInstanceTransforms` is not called.
- Animation `playLayer`, masks, `addClipsFrom`, retarget worker, physics colliders (10): none are used. The game uses `.animate`, `setAnimation`, `setAnimationPose` and `animation.socket` only.
- `Clock`, step tracks, `ShapeGeometry`, `SphericalHarmonics3`, `@aura3d/math/three` (11): not imported.
- Scene kit fixes, built-in humanoid provenance (12): no scene kits and no built-in humanoid.
- Effects fix for depth of field, god rays, TAA, motion blur, auto exposure (9, other than AO): none of those effects are authored.

## Checklist

- [ ] Run `node tools/game-checks/run.mjs aura-hoops-3d` and confirm it still shows 0 errors and 0 warnings.
- [ ] Produce paired captures on the remote runner (`tools/remote-acr/run.sh`; no local Playwright): serve the game from `/Users/gurbakshchahal/platforms/aura3d` (main, 4.3.7) and from the `beat3js2/integration` worktree, open each of `?court=rucker`, `venice`, `athens`, `manila`, `shanghai`, `orbit` with `?capture=1` at the same viewport, and compare. Look first at floor contact darkness, then Shanghai and Orbit brightness.
- [ ] Decide on `effects.contactShadows` at `src/main.ts:783`: keep, lower `intensity` (for example 0.4), or remove it in favour of the blob shadows.
- [ ] Read `app.lighting.diagnostics().contactShadows` and confirm `passExecuted: true` and no `unavailable`; confirm there is no `[prd02.contactShadows]` warning in the console.
- [ ] Read `auraApp.diagnostics().renderPath` and confirm `path: "hdr-msaa"` on all six courts, including after a `setScene` switch.
- [ ] If you need old-pipeline parity for a release comparison, add `quality: "production"` at `src/main.ts:814`, or test with `?aura3d-render=production`.
- [ ] Measure frame time on all six courts without `?diag=1` (same device, same camera, several seconds of steady play), because the extra contact-shadow depth pass and the reduced per-frame overhead pull in opposite directions.
- [ ] Re-run `tools/filmstrip/capture-films.mjs` with `?capture=1` if its CDP route fails and falls back to `toDataURL`.
- [ ] Update `apps/showcase-aura-hoops-3d/route-health.json` only after a fresh visual pass; its `renderer.mode: "production"` text does not match the code's `auto` quality.
- [ ] Do one software-GL run on the remote runner to confirm ambient occlusion on a device without float linear filtering looks acceptable.
