# Aura FC 3D (`aura-fc-3d`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. Nothing in the source has to change to build or run (the pins are already 4.5.0 and every option the game passes is read by its builder). `effects.contactShadows` now renders differently, the look's ambient-occlusion node may now be visible on some devices, and the HDR-chain frame should be re-checked against the old captures.

## What this game uses

- Entry: `apps/showcase-aura-fc-3d/index.html` loads `src/main.ts`. One `createAuraApp("#app", {...})` call at `src/main.ts:56-60`. Options passed: `scene`, `...looks.appOptions(LOOK_ID)`, `qualityRebuild: { flags: ["game"] }`. No `quality`, `output`, `preserveDrawingBuffer` or `renderer.bloomFusion` is set by the game.
- `looks.appOptions("interior-industrial")` returns `renderer: { qualityProfile: "production" }` and a `pixelRatio` capped at 2 (`packages/engine/src/agent-api/looks/looks.ts:424-431`). It returns `{}` instead when the look expands through the v1-contracts path (`looks.ts:426`). That is the renderer profile, not the `quality` option. In `renderPath.ts:151` ("`renderer.qualityProfile` is a deprecated pixel-ratio/draw-budget preset, not a pipeline request"), so `quality` resolves to `"auto"`.
- Scene (`src/game/scene.ts:377-394`): `looks.preset("interior-industrial", { fogDensityScale: 0.5, exposureEv: 0.08 })`, then `effects.contactShadows({ intensity: 0.85, length: 0.32 })` (line 390), `effects.motionBlur({ intensity: 0.1 })`, `effects.bloom({ intensity: 0.22, threshold: 0.82 })` (line 392), a perspective camera.
- Effects added by the look itself (v0 expansion, `looks.ts:337-351`, `V0_EFFECTS` at `lookPresets.ts:60`): `color-grade` (exposure `2^0.08`), `ambient-occlusion` and a second `bloom` ("look bloom"). The interior-industrial look has no fog.
- Other effect nodes: `effects.lightCone` (x4, `scene.ts:260`), `effects.particles` (`scene.ts:338`), `effects.trail` (`scene.ts:355`), `decals.project` (`scene.ts:333`).
- Lights: the look expands to an HDRI environment (`studio_small_08_1k`, preset at `lookPresets.ts:242-254`, node pushed at `looks.ts:291-298`) plus a shadow-casting directional key light named "look key light" (`looks.ts:304-312`). Four `lights.spot` flood lights are authored in `scene.ts:259`.
- Primitives (`primitives.box/plane/cylinder/torus/capsule`) pass only `name`, `size` and `material`, then `.position/.rotate/.scale/.runtime` (`scene.ts`, `rig.ts:119-121`). Several materials use `opacity < 1` (`rig.ts:119`, `scene.ts:283`, `scene.ts:353`).
- Instancing: one `instances.capsule` call, `fc-crowd`, with `name`, `transforms`, `colors`, `material` (`scene.ts:236`). `MAX_TIERS = 4` (`scene.ts:183`), so the crowd is a few hundred instances. It is built once and never updated per frame (`fc-crowd` is only looked up at `scene.ts:431`).
- Characters: 10 skinned athletes via `model(...)` with `animation: { clip: "Ready" }` (`rig.ts:106-110`), driven per frame by `body.setAnimation({ clip, loop, duration, startTime, crossFade: false })` (`rig.ts:179`). No `playLayer`, masks, `addClipsFrom` or root motion. Kick clips are baked offline by `tools/aura-fc/bake-kick.mjs`.
- Canvas read-back: none in the game source. `installBlackFrameGuard()` from `@aura3d/debug` (`main.ts:30,38`) samples the canvas. `installQaHooks("aura-fc-3d", ...)` (`main.ts:646`) provides `frame()` and `pixels()` through `app.capture()` (`packages/engine/src/qa/hooks.ts:101-137`).
- Not used: physics, `interactions.*`, custom shader materials, transmission, `Clock`, `AnimationClip`, `ShapeGeometry`, `SphericalHarmonics3`, `setInstanceTransforms`, `environments.*` nodes authored by hand, `output`/exposure options.
- Shared code: `main.ts:21` imports only `../../showcase-port-shared/quickbar.css` (CSS). No `apps/common` imports.
- Version pin: `package.json` has `"version": "4.5.0"` and `"@aura3d/engine": "workspace:*"`.

## What changes for this game in 4.5.0

### 1. Render path "auto": the game stays on the HDR chain (verify, no code change)

- Now: `renderPathBlockers` (`packages/engine/src/agent-api/app/renderPath.ts:103-135`) lists blockers for this scene: effect nodes `bloom`, `motion-blur`, `contact-shadows`, `light-cone`, `particles`, `trail`, `color-grade`, `ambient-occlusion` (anything not `fog`), an "hdri environment", and transparent materials (`opacity < 1`, `rig.ts:119`, `scene.ts:283`, `scene.ts:353`). Any one keeps the HDR chain, so the game does not take the direct path and the canvas-MSAA edge difference does not apply.
- Evidence: `src/game/scene.ts:390-392`, `renderPath.ts:103-135`.
- To check: in the console, `app.diagnostics().renderPath` should report `path: "hdr-msaa"`, `quality: "auto"`. If it reports `direct`, a blocker was removed. `?aura3d-render=production` forces the old pipeline for an A/B capture.
- Optional: set `quality: "production"` in the `createAuraApp` options (a valid `AuraQualityMode`) only if you want the 4.3.7 pass sequence byte-for-byte. The game does not need it for correctness.

### 2. `effects.contactShadows` is now a real screen-space mask (visual change)

- Now: it no longer lowers to the SSAO pass (`packages/engine/src/agent-api/compiler/postprocess.ts:70-72`). It produces a mask sampled by forward lighting (`packages/rendering/src/forward/contactShadowMaskStore.ts`). The game's `intensity: 0.85, length: 0.32` (`scene.ts:390`) will look different under players, ball and goals.
- Scope: the mask multiplies only the shadow-casting directional light's visibility. It never affects ambient/environment light or the four flood spots (`scene.ts:259`). On the night venues, where the spots dominate, the visible change comes from the look key light only.
- It needs a shadow-casting directional light. In the v0 expansion the key light ("look key light") is `shadow: true` (`looks.ts:304-312`), so it is available. In the v1-contracts expansion `looks.preset` returns a `look` node (`looks.ts:381-383`) and `appOptions` returns `{}`; confirm the key light exists by checking for a "look key light" node or the absence of the contact-shadow `unavailable` entry. The mask is also off on the Low tier and with `?a3dLighting=contact=off`.
- What to do: compare the pitch and player grounding before and after. The game also has its own blob shadows (`${id}-shadow` cylinders at `rig.ts:119`, `fc-ball-shadow` at `scene.ts:353`) and the look adds an ambient-occlusion node (see change 3). If the new mask doubles up with them, lower the mask first: `effects.contactShadows({ intensity: 0.6, length: 0.32 })`. Both options exist (`effects.lighting.ts:8-14`). `lights: "sun" | "shadowed"` is also available.
- How to check: `app.diagnostics()` should not list contact shadows under `unavailable` and the console should show no contact-shadow `console.warn`. Then compare `?capture=1` screenshots against the 4.3.7 shots in `evidence/aura-fc-3d/`.

### 3. Frames must be re-baselined (visual change, HDR chain)

- Now: with `auto` on the HDR chain, bloom is fused (separable by default) and the AO/DoF/god-ray/TAA/motion-blur/auto-exposure float targets are point-sampled where linear float filtering is missing.
- Bloom: the scene has two bloom nodes (look bloom and the authored `effects.bloom`). `bloomFusion` is reported as `"separable"` (`renderPath.ts:24-36`). Frames are expected to match within 1/255 on bloom, per the 4.5.0 notes; check this on the flood-light cones.
- AO and motion blur: the look emits `ambient-occlusion` and the game adds `motion-blur`. On a device without float linear filtering, AO previously did nothing visible; in 4.5.0 it will. Expect slightly darker contact areas on those devices only. No code change is needed, but re-baseline captures from such a device.
- What to do: nothing to change. If a diff shows in bloom, `createAuraApp({ ..., renderer: { ...looks.appOptions(LOOK_ID).renderer, bloomFusion: "separable" } })` is the explicit default. Do not add `"fused-2d"` unless you want it (opt-in).
- To check: `app.diagnostics().renderPath.bloomFusion` should be `"separable"`.

### 4. preserveDrawingBuffer defaults to false (no code change, but keep capture flags)

- Now: the game does not read the canvas itself. The black-frame guard samples in the draw call (`installFrameTap`, `packages/debug/src/safety/guard.ts:1-9`), which is built for canvases without `preserveDrawingBuffer`. The QA hooks use `app.capture()` (`qa/hooks.ts:101-105`).
- What to do: nothing in the source. External tools that read the canvas after an `await` must load the page with `?capture=1` or `?qa=1` (`renderPath.ts:181-195`). `tests/browser/shotsa-aura-fc-3d.spec.ts` navigates with `?demo=1` and uses `page.screenshot()` through `shotsa-lib` (compositor output, safe). The fcball-fx, fclegs-fc and rework-fc specs contain no canvas reads. `live-index-games.spec.ts` decodes a Playwright PNG, not the WebGL canvas.
- To check: run the existing browser specs and `window.__AURA3D_HEAL__.observation()` after load; the rung should stay 0.

### 5. Look preset exposure and fill (does not trigger, listed for the record)

- `interior-industrial` emits an HDRI environment node (`looks.ts:291-298`), so the "authored lights, no `environments.*`" darkening does not apply. The new `fill` only exists for night-city, polar-night, neon-arcade, space, underwater (`looks.ts:299-303` branch applies only when `hdri` is null), none of which this game uses (`LOOK_ID = "interior-industrial"`, `scene.ts:20`).
- To check: if the look is ever switched to one of those, compare exposure. Nothing to do now.

### 6. Per-frame cost and shadow changes (automatic, no code change)

- The shadow cascade skip for unselected receivers, unchanged-upload skip for instances, per-frame allocation changes, sampled `getError`, and removal of unused warm programs apply to the game automatically. The key light casts shadows. The frame-time effect is unmeasured for this game.
- How to check: compare `app.diagnostics()` draw-call and frame timings on `?diag=1` on both versions. No baseline number exists for this game.

## Changes that do not affect this game

- Direct render path / canvas MSAA edge differences (change 1, edges): the game stays on the HDR chain (blockers listed above).
- OPTION_IGNORED on `primitives.*`, `instances.*`, `interactions.*`: every option the game passes (`name`, `size`, `material`, `transforms`, `colors`) is a covered field (`optionCoverage.ts` rows for `primitives.box/plane/cylinder/torus/capsule`; `instances.capsule` takes `AuraPrimitiveOptions` plus `transforms`/`colors`, `instances.ts:26`). No degradation expected. Check anyway with `app.diagnostics()` after load.
- `primitive()` now forwarding `renderOrder`, `frustumCulled`, `layers`, `userData`, `rotationOrder`, `quaternion`: the game passes none of them.
- `interactions.orbit` options: the game uses no `interactions.*` and its camera is `camera.perspective`.
- Instancing changes (typed-array `setInstanceTransforms`, shadow proxy, auto cascade cap, dense depth batching): the only instanced node is the crowd, a few hundred instances, below the 1024 shadow-proxy and 8192 cascade thresholds, and it is not updated per frame.
- Effects float-target filtering fix for DoF, god rays, TAA and auto exposure: the game uses none of them. (AO and motion blur do apply, see change 3.)
- Animation layer/mask/`addClipsFrom`/retarget fallback and physics collider changes: the game uses `setAnimation` on a single clip, no layers, no physics.
- Math/animation fixes (`Clock.start()`, step tracks, `ShapeGeometry`, `SphericalHarmonics3`, `@aura3d/math/three`): not used in `src/`. The offline `tools/aura-fc/bake-kick.mjs` was not audited for step tracks; the baked clips are unchanged by this release.
- Scene kit fixes and humanoid GLB `provenance.builtIn`: the game uses no scene kits and its athletes are its own admitted GLBs.
- Package pins: already `4.5.0` in `apps/showcase-aura-fc-3d/package.json`.

## Checklist

- [ ] `pnpm --filter @aura3d/showcase-aura-fc-3d typecheck` passes (remote runner for heavy builds, per repo rules).
- [ ] `node tools/game-checks/run.mjs aura-fc-3d` has no new errors.
- [ ] All of `tests/unit/aura-fc-3d/*` pass (athlete-rig, ball-physics, gait-limits, kick-clips, locomotion-sync, pass-flight, sim-kick, skin-repair).
- [ ] Load the game and confirm `app.diagnostics().renderPath` is `path: "hdr-msaa"`, `quality: "auto"`, `bloomFusion: "separable"`.
- [ ] Confirm `app.diagnostics()` lists no `OPTION_IGNORED` and no contact-shadow `unavailable` entry; no new `console.warn`.
- [ ] Capture `?capture=1` frames (quick match, shootout lab, each venue) and compare with the 4.3.7 captures in `evidence/aura-fc-3d/`; look specifically at player and ball grounding (contact shadows and look AO) and bloom on the flood-light cones.
- [ ] If the contact-shadow mask doubles with the blob shadows, lower `intensity` in `effects.contactShadows(...)` at `src/game/scene.ts:390` and re-capture. If grounding is still too dark, the look's ambient-occlusion node is the other source.
- [ ] Confirm the black-frame guard stays on rung 0 (`window.__AURA3D_HEAL__.name`) on a normal load.
- [ ] Optional A/B: load with `?aura3d-render=production` and diff against the default load to see exactly what the new path changed.
