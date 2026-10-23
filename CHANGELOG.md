# Changelog

Version: 4.0.8

Public claims and release wording are governed by `docs/project/product-studio-claim-registry.md`.

## 4.0.9 (unreleased)

- **Fix: `instances.mesh` and `batched.mesh` now honour the material's texture maps.** The batched/instanced handler only built the scalar PBR material, so `texture`, `normalMap`, `emissiveMap` and the other map slots (URLs, asset refs and `texture.*` handles) were dropped and the surface rendered white; ordinary primitives got them from the post-mount textured upgrade, which batched nodes never joined. The handler now runs the same upgrade once per node and swaps in the `TexturedPBRMaterial` when it resolves (the scalar material until then); dispose releases it. Also: a multi-geometry `batched.mesh` drew nothing unless `qualityRebuild.flags` enabled `tiers.batching`, because the packed multi-draw route's marker items need that submit path; without the flag it now uses per-geometry instancing (`fallbackReason: "tiers-batching-off"`). A `texture.data` handle used as a base-colour map must declare `colorSpace: "srgb"` (binding validation rejects linear base-colour textures).
- **Fix: `createGame` from `@aura3d/engine/game` returned the headless stub unless the caller passed `qualityRebuild: { flags: ["game"] }`.** That entry point is itself the opt-in to the real game kit, so the `game` lane now defaults on there; `-game`, `none`, the `?a3d-qr=-game` URL and `A3D_QR_GAME=0` env still turn it off. The root `createGame` in `@aura3d/engine` stays the headless stub and now logs `CREATE_GAME_STUB` once, pointing to `@aura3d/engine/game`. The game kit imports from the `@aura3d/engine` root instead of the deprecated `@aura3d/engine/contracts` subpath (removed in 4.1.0). The kit was already published as the `@aura3d/engine/game` subpath of the root tarball (no new package); a `racing-starter` build against the published 4.0.8 tarball was used as the check. Docs: `docs/api/game-kit.md`.
- **New: `game.racketSports().scoring(rules?)`** (`createRacketScoring`): a pure game/match/tiebreak scoring state machine for rally sports. The defaults are the Aura Slam tennis rules (4 points win by 2, first to 3 games leading by 2, tiebreak to 7 win by 2 at 3-3); `pointsToGame`, `winBy`, `gamesToMatch`, `matchWinBy` and `tiebreak` are configurable, so table-tennis style formats work too. `awardPoint(state, side)` returns a new state plus `gameWon`/`matchWon`/`tiebreakStarted`, and `label(own, opponent)` gives 0/15/30/40/AD. Verified point for point against the original tennis simulation over 2,000 seeded matches.
- **New: `createBindingStore` in the game kit (`packages/game`)**: validated, persisted, rebindable input bindings (keyboard primary + optional alternate keys, controller buttons), reserved keys with custom messages, conflict detection, per-device fallback on corrupt or wrong-version storage, and `saved: false` instead of throwing on write failure. Extracted from the Aura Slam 3D controls store; an equivalence test shows it validates, persists and restores identically when configured with that game's actions. It is exported from `@aura3d/game` (private until the game kit is published through `@aura3d/engine/game`).
- **New: `game.racketSports().athleteRig`** (`docs/api/racket-athlete-rig.md`): a procedural racket-sport athlete extracted from the Aura Slam port. `locomotion()` is a pure stride/split-step/slide/planted-stance solver and `applyLimbs()` poses leg, arm (two-bone IK) and racket cylinders from root-local points; `solveKnee()` is the knee helper. Verified bit-identical against the original game's pose code (60,000 cases). The five existing geometry helpers moved to an internal module and are re-exported unchanged.
- **New: `game.racketSports().ballFlight(config)`** is an exact, frame-rate independent ball-flight kit for racket sports (x lateral, y along the court, z up): closed-form flight under gravity and drag, exact-time bounce/net/tape/board events, surface rebound and rolling, a shot solver that clears the net, a serve solver and a loose-ball settle. It was extracted from the Aura Slam 3D simulation and reproduces the original game's physics to 1e-12 (`docs/api/ball-flight.md`). The existing `stepBallPhysics` remains as the simple model.

- **New: QA and replay kit** (`docs/api/qa-kit.md`): `installQaHooks`, `createFixedStepLoop` (alias `fixedStepLoop`), `readQaParams`, `createCountedRng` and the hook-name helpers, exported from `@aura3d/engine`. They replace the `window.__AURA_<GAME>__` hooks and fixed-timestep loops that every Crayon port copied into its own `main.ts`. The Splat Rush port is migrated as the reference.
- **New: opt-in runtime safety net in `@aura3d/debug`** (`installSafetyNet`, `resolveQualitySwitches`, `createBlackFrameWatch`, `installDiagnosticsPanel`). Parses the shared quality URL switches (`?post=0 ?shadow=0 ?env=0 ?sky=0 ?aa=0 ?quality=low ?tm=aces ?heal=0 ?diag=1`), reloads one rung down a compatibility ladder when the canvas stays black (`SAFETY_BLACK_FRAME` / `SAFETY_COMPAT_MODE`), and shows a GPU diagnostics panel (renderer, limits, draw calls, shader compile/link failures, context loss, last errors). Nothing runs unless `safety` is set; see `docs/api/safety-net.md`.
- **New: CLI asset tools** (`docs/api/cli-asset-tools.md`). `aura3d assets optimize --file in.glb --out out.glb --role hero|vehicle|character|prop|background` (role vertex and texture budgets, float32 geometry kept), `aura3d assets merge-clips --base rig --out file.glb name=clip ...` (merge Meshy animate clips into one rig by node name; a foreign skeleton is rejected), `aura3d assets import-meshy <dir> --into <assets-dir> --prefix <game> --name <role>` (isolated admission in a temporary project; it is the default inside the Aura3D monorepo, so shared `aura.assets.json`, `src/aura-assets.ts`, `public/aura-assets/*` and `aura-evidence/*` are never written; `--shared-manifest` opts out), and `aura3d meshy ledger status|reserve|settle|reconcile|list` (per-game and global credit caps under a lock; a rate-limited or timed-out call stays `unconfirmed` and keeps counting instead of being recorded as a failure). The `meshy-cli` and `aura3d-assets` skills point to the new commands.
- **New: `defineModelAssets(manifest, options?)` and `modelsEnabledFromUrl()`** declare a game's GLBs once with the sha256 and same-origin URL the production bridge requires, validate them at definition time (a bad hash or cross-origin URL used to draw nothing silently), return typed refs, and carry the procedural-fallback switch (`?models=0`, or `enabled`) as an option. See `docs/api/model-loader.md`.
- **Fix: `handle.setUniform` on a model node no longer throws.** Without a custom material it is a once-per-uniform `MODEL_SETUNIFORM_NOOP` warning; with `material.custom` it writes as before.
- **Fix: `scene({ children })` no longer returns an empty scene.** `scene(init)` accepts `children`, `background`, `camera`, `timeline` and `diagnostics`; any other key or a non-object throws `invalid-scene-options`.
- **Fix: example and app entry modules survive production bundles with plain imports.** The root `sideEffects` allowlist now covers `./examples/**`, `./apps/**` and `./templates/**`, so the eleven port wrappers dropped their `__AURA_PORT_MODULES__` workaround.
- **Fix: an empty instanced node no longer blanks the canvas.** `instances.<primitive>` and `instances.model` with zero transforms used to throw at build time, and a zero-length instance array threw `INSTANCING_CONTRACT` inside `ForwardPass` (before sorting), which stopped the frame. Zero instances is now valid: the compiler skips the node and reports `INSTANCES_EMPTY`, `batched.mesh`/`instances.mesh` with no live members emit nothing, and `ForwardPass` drops zero-length instanced items. A geometry `drawRange` of count 0 (three's `setDrawRange(0, 0)`) draws nothing instead of throwing.
- **Fix: empty `points` / `lines` no longer throw.** Zero positions builds and compiles to nothing and reports `GEOMETRY_EMPTY`; a one-point polyline is still an authoring error.
- **Perf: repeated `model()` nodes of one GLB share decoded textures.** `createTypedGLBActor` now takes a ref-counted `GLTFSharedTextureCache` per (asset url/id/sha256, decode options) when none is passed, so N nodes decode and upload each glTF image once instead of N times (20 actors of a 3-image GLB: 60 decodes before, 3 after). Textures are freed when the last actor disposes; `shareTextures: false` opts out and `cloneSkinned` keeps its own cache. Geometry buffers are still per node.
- **New: procedural audio synth kit in `@aura3d/audio` (also `@aura3d/engine/audio`).** `createCueBank({ cues })` plays sample-free cues built from oscillator and filtered-noise layers (envelopes, pitch glides, delays, detune) on the page's single `AudioContextManager`, with first-gesture unlock, a master mute and key binding (`install()`), SFX/music buses, a voice budget with priorities, per-cue cooldown/concurrency limits and music ducking. `createStepSequencer` is a lookahead music scheduler, `createToneLoop` a parameter-driven bed (engine drone, wind, pad), and `midiToHz`, `noteFrom`, `SCALES`, `scaleSemitones` and a deterministic `createNoiseSource` cover pitch and noise. It replaces the hand-rolled Web Audio code the ports each carried; the Splat Rush port now uses it. See `docs/api/audio-synth.md`.
- **New: scatter planning and static merge** (`scatterAlongPath`, `scatterInArea`, `splitScatterByDistance`, `scatterTransforms`, `createScatterRandom`, `mergeStatic`, `mergeStaticByKey`; docs in `docs/api/scatter-merge.md`). Seeded, filter-stable placement along paths or over areas (exclusion zones, minimum spacing, height and slope filters, radius LOD bands) that feeds `instances.*`, and a transform-and-tint baker that turns many static parts into one geometry per material. Extracted from the hand-written placement and merge code in the Crayon ports; the Cloud Runner mesa layout is reproduced exactly for its seed in `tests/unit/scatter`.
- **New: author GLSL chunk library for `material.custom`** (`docs/api/glsl-chunks.md`). `#include <a3d_math>` (saturate, safe divide/sqrt/acos/normalize, remap, `a3dFinite`), `<a3d_noise>` (sin-free hashes, value and simplex noise, fbm, ridged), `<a3d_sky>`, `<a3d_fog>` (linear, exp2, analytic height fog), `<a3d_triplanar>`, `<a3d_toon>`, plus `<colorspace_decode>` and the new `<colorspace_encode>`. All are GLSL ES 3.00, `a3d`-prefixed, NaN-safe and `pow`-free; a material `patch` or `registerShaderChunk` still overrides them. Verified on the mock device and on a real WebGL2 context (every chunk links; known-value probes render exact colours). They are GLSL only, so a material that includes them has no WGSL twin.
- **New: recorded takes in the synth kit** (`createSampleSlices`, `SampleSlices`; docs in `docs/api/audio-synth.md`). Plays one slice of a sprite sheet per call on the cue bank's buses, never repeating the previous take, through an optional low-pass, gain and stereo panner, with a procedural fallback until the sheet decodes. `CuePlayParams.data` carries a free-form payload to a cue's layer function. Extracted from Aura Slam's `tennis-audio.js`.
- **Fix: the cue bank's mute key did nothing unless an `onMuteChange` callback was passed.** `install()` evaluated `options.onMuteChange?.(this.toggleMute())`, which skips the toggle when the callback is absent. It now toggles first and then notifies.

## 4.0.8 (2026-10-23)

Fixes found by taking the eleven Crayon ports through the production build and a real browser.

- **Fix: `material.custom` shaders now receive real `u_viewMatrix` / `u_projectionMatrix` on the app path.** They were identity matrices, so view-space effects (a headlight beam, view-dependent fog, billboards) drew nothing. The camera now supplies view and projection alongside the view-projection matrix. Cube-camera and mirror passes still hand custom shaders the bare view-projection.
- **Fix: self-registering `agent-api` modules (`instancedMesh` and similar) are no longer tree-shaken out of production bundles.** A `sideEffects` allowlist dropped them, so instanced scenes drew nothing in a built app while working in dev.
- **Fix: `material.custom` no longer silently skips a draw when a declared vertex attribute is unused.** The GL compiler drops an attribute the shader never reads; binding now warns `CUSTOM_ATTRIBUTE_UNUSED` and draws. A missing `a_position` still fails loudly.
- **New: `#include <colorspace_decode>` for `material.custom`** defines `a3dSrgbToLinear(vec3|vec4)`. A custom shader writes linear light that the output stage sRGB-encodes (and the default ACES operator tones down), so the visible colour was not the authored hex; `docs/api/public-api.md` now says so. To get authored colours, include the chunk, wrap the output in `a3dSrgbToLinear` and set `output: { toneMapping: "none" }`. The default is unchanged.
- **Known, not reproduced:** a report that sun `shadow: true` rendered one large instanced/skinned scene fully shadowed could not be reproduced on a minimal scene (`tests/browser/shadow-large-scene.spec.ts` guards the simple case); the Ninja Runner port ships with sun shadows off.
- **Tooling and examples (not published packages):** strict live-port gameplay smoke with render checks, the port page generator, the look-spec extractor, and the art-fidelity pass over the eleven ports (per-game results and remaining gaps in `docs/workflows/threejs-parity-gaps.md`).

## 4.0.7 (2026-10-23)

Fixes found by porting eleven Crayon games and by verifying WebXR, WebGPU compute and the batching path on a real browser.

- **Fix: `batched.mesh` / `instances.mesh` multi-draw was broken on a real WebGL2 context.** The draw-data texture was bound as a raw `Texture`; `u_drawId` was uploaded with `uniform1f`; the shader extension name was wrong (`GL_ANGLE_multi_draw`; `WEBGL_multi_draw` is now enabled at device creation); and `canMultiDraw` compared `TextureBinding`s by identity so no scene ever merged. A 92-vehicle frame went from 92 per-vehicle draws to 3 multi-draw calls carrying 552 members.
- **Fix: `material.custom` no longer silently skips a draw when a declared uniform is unused.** The GLSL compiler optimises unused uniforms out; they are now flagged optimisable, the draw proceeds, and the material reports `CUSTOM_UNIFORM_UNUSED`. A genuinely missing required binding still fails with a named error.
- **Fix: WebXR runtime** (verified against the independent `iwer` WebXR emulator in remote headless Chromium, not a headset): the `local-floor` reference space is now requested as a session feature; a failed reference-space request no longer leaks the XR session; per-eye viewports are persistent instead of being reset by `beginFrame`; zero-width views (mono devices) are skipped instead of failing the session; `xr.button({ app })` accepts a plain `AuraApp`.
- **Verified: WebGPU compute** (`compute.*`) runs on a real software-WebGPU device: vector add over 65,536 elements, a shared-memory reduction and 2D/3D dispatches read back exactly. WebGPU canvas presentation works in headed Chromium under Xvfb (add `@headed-xvfb` to `SPECS` on the remote runner); headless Chromium + SwiftShader still destroys the device at the first presented frame.
- **Codemod:** the `VRButton`, `ARButton` and `WebXRManager` rows are now `approximate` (emulator-verified; real-headset behaviour, frame pacing and the opaque-framebuffer path are untested).
- **Tooling and examples (not published packages):** a slim remote-runner build context (209 MB instead of 1.9 GB); deterministic capture tooling and ports of eleven Crayon games under `examples/*-port/` with replay-verified simulations (see `docs/workflows/threejs-parity-gaps.md` for per-game scope and gaps).

## 4.0.6 (2026-10-23)

- **Fix: `texture2d` uniforms on `material.custom` and `material.node` now bind the real authored texture.** In 4.0.5 a `texture.*` handle passed as a `texture2d` uniform (and therefore `tsl.texture(...)`) was lowered to a non-required binding, so the shader sampled the white fallback. Handles, raw textures (including `createRenderTarget` colour attachments) and texture asset refs now resolve to real textures and bind with their own sampler state; `needsUpdate` re-uploads without a program rebuild and `setUniform(name, newHandle)` swaps the texture. A uniform with no texture still samples white and is now reported as `CUSTOM_TEXTURE_UNBOUND`. Limits: a handle's `repeat`, `offset` and `rotation` are not applied (custom shaders receive raw UVs), and asset refs bind after mount, for primitive nodes only (`model(...)` nodes keep the fallback).
- **Verification:** `material.node` was run on a remote software-WebGL2 runner (SwiftShader, not a hardware GPU): constant colour, `uniform` + `setUniform` with no program growth, time-driven graphs, `positionNode` displacement, `Fn`/`If`/`Loop` graphs against the JS interpreter, the unsupported-node error, and authored-texel sampling all pass.
- **Note:** the TSL `time` node is wall-clock (`performance.now()` when each frame graph is built), not `app.step(dt)` time, so stepped runs do not give a deterministic time phase.

## 4.0.5 (2026-10-22)

- **`tsl` node-graph subset and `material.node({ colorNode, emissiveNode, opacityNode, positionNode, transparent, side, ... })`** (SH-01): author a material as a TSL-style graph (`positionLocal/World`, `normalLocal/World`, `uv()`, `time`, `cameraPosition`, `uniform`, `uniformArray`, `texture`, `color`, `float/int/bool/vec2-4` with swizzles, math and comparison nodes, `Fn`, `If/ElseIf/Else`, `Loop`) and the engine emits GLSL 300 es into the existing `material.custom` path, with type inference and constant folding. `tsl.supportedNames` lists exactly what is supported.
  - Limits, all reported with named errors rather than silently ignored: `normalNode`, `roughnessNode` and `metalnessNode` are not supported (custom materials have no scene-light access); any other three/tsl name throws `tsl-unsupported-node`; `uv(1)` is not supported; WGSL is not emitted (`tsl-requires-glsl-backend`). The emitted GLSL is verified on the mock device, not yet on a real GPU.
  - `aura3d migrate three` maps `MeshStandardNodeMaterial`, `MeshBasicNodeMaterial` and `NodeMaterial` to `material.node` as approximate, with notes naming the unsupported nodes.

## 4.0.4 (2026-10-22)

three.js parity: the engine surface that Crayon-style three.js ports need, behind the curated `@aura3d/engine` API. Every item below has a unit test; GPU behaviour was verified on a remote WebGL2 runner unless noted. Tracked in `docs/workflows/threejs-parity-gaps.md`.

### Shading and materials

- **`material.custom({ glsl, wgsl?, uniforms, defines, transparent, depthWrite, side, blending, fog, patch? })`** compiles GLSL (required) and optional WGSL into a `PortableShaderMaterial`; `handle.setUniform(name, value)` updates without recompiling. `registerShaderChunk(name, glsl, wgsl?)` adds `#include` chunks. `PortableShaderMaterial`, `ShaderPreprocessor` and `registerShaderChunk` are exported from `@aura3d/engine/renderer`.
- **`effects.shaderPass({ glsl, wgsl?, uniforms, order })`** adds a custom post pass with named slots (`before-bloom`, `after-bloom`, `before-tonemap`, `after-tonemap`) or a numeric order. On WebGL2, `after-bloom` and `before-tonemap` passes now run after the bloom composite, matching WebGPU (they previously ran before bloom).
- **Per-material `fog: false`** opt-out, Cineon tone mapping, `createRenderTarget` (render a scene into a target and sample it as a material map).
- **`scene().overrideMaterial(spec | null)`** replaces every mesh material in the scene without mutating authored nodes.
- **`lights.lensFlare(...)`**, `lights.rectArea` and `lights.lightProbe` (SH9). Lens flare placement follows three; unlike three it does not fade by depth occlusion because the engine has no depth readback.

### Geometry, instancing, lines

- **Primitives:** `cone`, `circle`, `ring`, `tube`, `lathe`, `extrude`, `shape`, `torusKnot`, `polyhedron`, `roundedBox`, with vertex and index counts checked against three 0.185.1.
- **Geometry authoring:** `geometry.dynamic` (typed arrays, colours, groups, draw range, per-frame in-place `updateAttribute`/`setGeometry`), custom per-vertex `attributes` readable from `material.custom` shaders, `topology: "points"`, `geometry.edges`, `geometry.wireframe`, `geometry.merge`, `geometry.toNonIndexed`, `geometry.convex`.
- **`instances.mesh`** and **`batched.mesh`** write the GPU instance buffer directly; multi-draw is used only when the device really supports `WEBGL_multi_draw`, and the report says so when it does not. `lines.*` (thin, fat, dashed), `points`, `sprites`, `helpers.*`.
- **`A3D_PARITY_BATCHING` and `A3D_PARITY_LINES` are now default-on.** They gate only the new `batched`, `line`, `points` and `sprite` node kinds, so no existing scene is affected. The other four `A3D_PARITY_*` flags gate nothing and stay `dev`.

### Textures, loaders, math, animation, audio

- **`texture.data/canvas/video/compressed/depth/cube/dataArray/load`** with full handle semantics (`wrapS/T`, `repeat`, `offset`, `rotation`, `anisotropy`, filters, `flipY`, `needsUpdate`); WebGPU honours revisions and uploads every array layer. EXR decoder (none, RLE, ZIPS, ZIP, PIZ; half and float), `FileLoader`, `ImageBitmapLoader`, `DataTextureLoader`, asset progress and error callbacks.
- **`@aura3d/math`:** full curve family with cached arc length and Frenet frames, `Path`/`Shape`, `ShapeUtils`, `Line3`, `Triangle`, `Spherical`, `Cylindrical`, all six `Euler` orders, `MathUtils`, HSL colour methods, `SphericalHarmonics3`, `OBB`, `Capsule`, `ConvexHull`, `Octree`; values are tested against three over seeded cases.
- **Animation:** `clampWhenFinished`, negative `timeScale`, `finished` events, `PropertyBinding`, `AnimationUtils`, `AnimationObjectGroup`, colour tracks, `morphTargetDictionary`, `cloneSkinned` with shared textures.
- **Audio:** fixed double distance attenuation on positional emitters, `distanceModel`, cone and orientation, `AudioListener` now drives `ctx.listener`, `AudioAnalyser`.
- **Runtime:** `Clock`, `raycast` options, `app.info`, `app.precompile`, `setPixelRatio`, `setClearColor`, texture/cube backgrounds, node `layers`/`renderOrder`/`traverse`, `cameras.cube`, `surfaces.mirror`.

### New in this release, with limits

- **`cameras.array` and `cameras.stereo`** (three's ArrayCamera and StereoCamera) with viewport and scissor on the render device; stereo eye matrices are tested against three.
- **`xr.button()` and `app.xr`** (WebXR enter/exit, per-view rendering into the XR layer). Tested with fake XR objects only; not yet verified on a headset or browser.
- **`compute.*`** (WebGPU-only compute: pipelines, buffers, dispatch). Tested against a fake GPU device only; WebGL2 apps get a clear `compute-requires-webgpu` error.
- WebGPU canvas presentation is unverified on the remote runner (software WebGPU destroys the device at the first presented frame); WebGPU material and post paths are verified through offscreen readback.

### Behaviour changes

- `primitives.box/sphere/plane/cylinder/capsule/torus` now throw `invalid-primitive-params` for params they do not use (previously ignored silently); size them with `size`.
- `material.custom` rejects uniform names that lower into a reserved built-in (for example `time` becomes `u_time`) at authoring time instead of failing at GLSL compile.
- Shader compile errors now include the first lines of the GLSL info log in the message.
- Camera layer masks (`camera.perspective({ layers })`) now hide non-intersecting nodes; a cube-camera reflection is no longer scaled to nothing by a zero scene environment intensity; static batching keeps an item's cube binding.
- Camera `Spline` now uses `@aura3d/math` curves (open-spline arc length is within 2% per sixth).

### Tooling

- `aura3d migrate three` gains rows for the new surface and a scanner fix for multi-line constructs; a test now fails if any mapping target is not exported.
- Crayon probe v2 (live scene capture from the sandboxed game frame), the deterministic capture tool, and a Strange Orbit reference and port example under `examples/strange-orbit-port/`.

## 4.0.3 (2026-10-20)

Round-2 showcase motion fixes plus the engine capabilities they needed.

### Engine — runtime-node animation composition (PRD-06 follow-through)

- **`AnimationPose.mode: "overlay"`** — a pose with `mode: "overlay"` evaluates the node's clip first and writes only its own bones on top, every frame, after clip evaluation. A live pose no longer has to suppress clip playback: routes can layer procedural upper-body poses (dribble arms, grips) over run/idle clips while the clip keeps the legs (`docs/animation/runtime-support.md`, `tests/unit/agent-api/production-actor-dispatch.test.ts`).
- **`node.animation.attach({ socket, target, position, rotation, scale })`** — bone-socket attachment for props: the render pipeline composes `modelMatrix × boneWorld × offset` from the current frame's bone matrix and writes the decomposed transform onto the target root-level node each frame — rigid through fast swings, no on-frame lag (`tests/unit/agent-api/actor-bone-attach.test.ts`).
- **`socket(bone).bindWorldMatrix()`** — each bone's world matrix frozen at GLB load, so routes derive exact bind geometry (segment lengths, bone-space palm offsets) from rigs with non-identity bind rotations instead of hand-measured constants.

### Showcase games — "make the motion read as real sports"

- **Aura Hoops 3D** — one phase-coupled dribble cycle drives palm and ball together (ride down, throw, floor, meet the same hand every bounce; palm travel ~0.57 m against the ball's ~0.77 m); the moving handler dribbles via an overlay pose over the run clip; arm geometry derived at runtime from bind-pose sockets.
- **Aura Diamond 3D** — bat socketed to the right forearm at the calibrated hand offset (knob in both hands, stance on the back shoulder); load → stride → rotation through the zone → wrap-around follow-through with contact solved onto the predicted pitch position; exactly one crouched catcher behind the plate with a socketed mitt; camera holds the whole batter and bat through the swing.
- **Aura FC 3D** — contrasting fixed kits (deep red vs sky, keepers yellow/purple, team rings, shorts/socks blocks) and foot-driven kick physics: the swing carries the ball to its contact frame, launch profiles per kick type on lofted arcs, restitution 0.55 bounces, rolling friction, travel-axis spin, ball riding the grass at fixed size.
- **Aura Links 3D** — real golf swing from a pure grip-trajectory solve with the club bone-socketed to the forearm and both hands on the shaft; backswing above the shoulders, clubhead 0.003 m from the ball at the impact frame, launch fired exactly at impact; camera holds through the strike.
- **Slingshot Siege** — clamped back-pull draw with fork-plane sag, visibly stretching bands, trajectory preview + power meter from the one shared solver, under-damped snap-back release, and deterministic auto-aim autoplay.

### Tooling and CI

- `tools/filmstrip/capture-films.mjs` + `showcase-filmstrip.yml`: real-time filmstrip verification (live page, never paused) in CI against the local build and production; `side-by-side.mjs` composes the user's reference screenshots against the after footage.
- Stale-corpus CI failures cleared (regenerated `derived-ids.txt`, removed tests of deleted arcade-slate apps, re-sized the admission-gates corpus bound, pinned `playwright` to `1.59.1` matching `@playwright/test`).
- Marketing build can degrade gitignored local-only advanced-gallery fixtures behind `AURA3D_ALLOW_MISSING_FIXTURES=1` for CI builds; production builds unchanged.

## 4.0.0 (2026-10-15)

Published across all 24 active public packages on npm (with all `< 4.0.0` versions and the 5 retired pre-4.0 packages `@aura3d/lean`, `@aura3d/three-compat`, `@aura3d/materials`, `@aura3d/environments`, and `@aura3d/editor` deprecated in full on npm) and on GitHub at https://github.com/auraoneai/aura3d/releases/tag/v4.0.0:

- **Single `@aura3d/engine@4.0.0` package surface**: removes the retired `@aura3d/lean`, `@aura3d/three-compat`, `@aura3d/materials`, `@aura3d/environments`, and `@aura3d/editor` compatibility packages and consolidates the public runtime surface (`createAuraApp`, `model(assets.x)`, `scene`, `camera`, `lights`, `effects`, `atmosphere`, `environments`, `shadows`, `game.*`, `sceneKits.*`, `prefabs.*`, `primitives.*`, `animation`, `createPhysicsRuntime`) on `@aura3d/engine`, serving the core primitive path directly from `.` via code-split internals (`docs/migration-4.0.md`);
- **Complete `effects.*` post-processing, atmospheric, particle, weather, and VFX suite**: documents and ships `effects.bloom`, `effects.neonBloom`, `effects.cinematicBloom`, `effects.ambientOcclusion`, `effects.contactOcclusion`, `effects.contactShadows`, `effects.screenSpaceReflections`, `effects.depthOfField`, `effects.motionBlur`, `effects.colorGrade`, `effects.vignette`, `effects.filmGrain`, `effects.chromaticAberration`, `effects.antiAlias`, `effects.outline`, `effects.fog`, `effects.depthFog`, `effects.volumetricFog`, `effects.fogVolume`, `effects.lightCone`, `effects.auroraRibbon`, `effects.particles`, `effects.meshParticles`, `effects.rain`, `effects.snow`, `effects.flipbook`, `effects.trail`, `effects.beam`, `atmosphere.setSky`, `atmosphere.setWetness`, and `game.feel` / `app.feel` triggers;
- **19 upgraded 3D browser games and showcases**: upgrades all 19 browser game and showcase routes (`Aura Clash Arena` development showcase, `Neon Corridor Strike`, `Turbo Drift Circuit`, `Rooftop Buckets`, `Vault Breakers`, `Mech Hangar`, `Patrol Wing`, `Deep Recovery`, `Aurora Lander`, `Gallery Shift`, `Siege Golf`, `Skyline Runner`, `Gravity Post`, `Neon Swarm`, `Bank Shot`, `Blockfall Reactor`, `Orbital Defense`, `Pulse Tunnel`, `Courier Rush`) with 38+ custom Meshy 3D PBR GLB hero vehicles, rigged/posed characters, architectural setpieces, and interactive gameplay loops;
- **WebGPU `ResidentGPUParticleRenderer` compute pipeline export**: exports `ResidentGPUParticleRenderer`, `RESIDENT_PARTICLE_CAMERA`, and `residentLifecycleShader` for resident GPU compute particle simulation alongside the WebGL2 runtime and deterministic fixed-step game simulation;
- **Same-origin fixture and asset delivery**: serves GLB/glTF models, Draco decoders, and environment fixtures from same-origin paths for static deployments without external runtime fetches;
- **PBR material and HDR/IBL pipeline improvements**: physical PBR materials (clearcoat, sheen, transmission, anisotropy, iridescence), GGX PMREM HDR/IBL environment lighting, multi-mip bloom, and look presets (`looks.preset`, `looks.appOptions`);
- **CLI and agent workflow upgrades**: updates `create-aura3d@4.0.0` scaffolds, `@aura3d/cli@4.0.0` typed asset commands (`aura3d assets add/resolve/import-meshy/validate/typegen`), look-dev loop tooling (`aura3d look capture/judge/rubric/lint`), Three.js migration codemod (`aura3d migrate three`), and `aura3d check-deploy`.

## 3.0.1 (2026-09-12)

Published across all 29 public packages with the GitHub release at https://github.com/auraoneai/aura3d/releases/tag/v3.0.1.

Measured win: the `@aura3d/lean` core primitive critical path compresses to `77458` gzip bytes against its 80,000-byte budget, from `tests/reports/bundle-size.json`.

Measured loss: the compatibility-root observation bundle is over budget at `575343` gzip bytes against the same 80,000-byte budget, from `tests/reports/bundle-size.json`.

Both figures are measured on the exact 3.0.1 packages and bound by SHA-256 to the L01 package receipt `tests/reports/muse3jsparity/l01/f4049f235500c8a98f7bc0a86ecf9f1a9d8cbe68/l01.receipt.json`; they establish bundle-size facts only, not a universal performance ranking.

## 3.0.0 (2026-09-05, candidate — K2/publish gates pending, see docs/project/aura3d-300-release-notes.md)

Agent-era major: the public API surface, parity evidence, and claim boundaries accumulated since 2.0, coordinated across root + 28 packages:

- root `createAuraApp` API additions since 2.0 (prompt→game/animation builders, game feel, camera rigs, vehicle chassis/driver AI, platformer rigs, GPU particles, SDF text, navmesh crowds, visual-scripting catalog, editor surface) with per-part browser evidence where Parts A–K record green and bounded wording where they do not;
- rendering package proofs (native fused LDR postprocess, bloom pyramid + presets, exact sRGB OETF, anisotropic-GGX, CSM/PCF shadows, GGX PMREM IBL) with shader-reference vectors pinning the math;
- three.js comparison stays bounded: repository-locked `three@0.185.1` head-to-head reports only, no universal superiority claim (see docs/project/aura3d-300-release-notes.md non-claims);
- showcase routes remain individually gated: machine-green routes are still promotion-blocked until hash-bound independent human review covers their exact final artifacts;
- production-runtime, physics, and ecosystem claims unchanged except where K evidence records receipts.

## 2.0.4 (2026-09-02)

All notable changes for Aura3D are tracked here. Public release claims must stay scoped to the evidence recorded in the matching release-gate documents. Version `2.0.4` is the coordinated Meshy CLI asset-pipeline patch across all 29 public packages; `2.0.3`, `2.0.2`, `2.0.1`, and `2.0.0` remain historical. Package, showcase, visual, current-Three.js comparison, and hosted-site claims remain independently evidence-gated.

Current evidence note (2026-08-11): release entries below record what shipped
and the evidence accepted for that release. They are not a current-worktree
verdict. Blockfall Reactor, Turbo Drift Circuit, and Skyline Runner now have
materially rebuilt gameplay and current automated evidence, but remain
promotion-blocked until hash-bound independent review covers their exact final
artifacts. Their prior release receipts remain history, not approval of the
current worktree.
Comparison wording for the 1.6.0 entry is historical and limited to the named
`three@0.165.0` workloads and reports. It must not be described as current or
broadened into universal engine or ecosystem superiority. The current
`three@0.185.1` comparison remains bounded by the published comparison reports
and claim guidelines.

## 2.0.4 (2026-09-02)

Meshy CLI asset-pipeline integration for the coordinated 2.0.4 release:

- adds candidate-only `assets import-meshy`, reusing Aura3D's existing add, inspect, hash, manifest, provenance, and type-generation path;
- records sanitized Meshy task, settings, credit, and supplied rights evidence while rejecting credential-like metadata and temporary signed query strings;
- adds bounded prop, environment, vehicle, and humanoid admission diagnostics without treating missing measurements as passes;
- adds pinned setup, agent-launcher, optional MCP, Keychain-launcher, secret-scan, and protected manual live-smoke surfaces;
- proves one typed relic collection/reset pilot as a `prototype`, with collision explicitly unproven;
- leaves renderer, engine, PBR, WebGPU, animation, physics, and universal comparison claims unchanged.

## 2.0.3 (2026-08-16)

Showcase and test-harness patch for the coordinated 2.0.3 release:

- strips Vite 7 ANSI color codes before the gallery and wow screenshot harnesses match their ready lines, restoring 11 previously blocked gallery tests and the wow spec;
- restores Smart City Stress Test density to 328 medium-level instances while retaining its Littlest Tokyo-only hero, authored keepout, and excluded tram/train/bus layer;
- adds the promised interactive draw-range control to the geometry example through ↑/↓/Space/click while keeping every range partial;
- removes 390px mobile overflow from the examples catalog and geometry-drawrange route;
- adds favicon links to 15 route entry points, removing local-dev 404 noise while leaving the production favicon unchanged;
- keeps the 2.0.2 claim boundaries intact: this patch changes showcase presentation, evidence harnesses, responsive chrome, and release documentation, not renderer or engine capability.

## 2.0.2 (2026-08-15)

Patch release for shipped showcase, catalog, and documentation corrections:

- widens Turbo Drift Circuit visual asphalt so the player can pass the rival on tarmac, with Rapier still owning solid contact;
- adds Skyline Runner coins, score, and ember volleys through `game.platformer`, with jump-release applied once and a 70–115 second Level 1 window (authored 95 seconds);
- corrects homepage and catalog posters so Product Configurator shows the headphone studio and Control Room shows the control-room capture;
- keeps Smart City Stress Test on the Littlest Tokyo hero, excludes tram/train/bus authored nodes, and drops extra district GLBs;
- unifies the examples catalog with homepage type and the orbital Aura3D mark;
- lowers robot-rig and Damaged Helmet studio exposure;
- serves the Draco decoder from `/assets/draco` and ships a real favicon;
- pins all 19 public scaffolds to the packed 2.0.2 dependency graph;
- updates `/docs` and retained Markdown to the shipped 2.0.2 behavior without broadening claim labels.

## 2.0.1 (2026-08-14)

Patch release with corrected Turbo Drift Circuit vehicle contact:

- aligns Rapier oriented boxes with the rendered vehicle footprints;
- feeds solved contact positions back into gameplay state;
- adds one-shot momentum transfer, impact recovery, hit-stop, and visible yaw response;
- proves direct first contact, non-interpenetration, reaction, and separation in browser evidence;
- removes internal planning, PRD, roadmap, and handoff Markdown from the public repository surface.

## 2.0.0 (2026-08-12)

Competitive replatform and public-surface consolidation:

- narrows the public example inventory to retained routes with explicit claim
  boundaries, while moving duplicate, contract-only, misleading, or visually
  rejected hosts into internal fixtures or archive records;
- keeps typed GLB assets and the safe `createAuraApp` root API as the public
  authoring path while labeling lower-level rendering-package diagnostics as
  such;
- repairs material, PBR-variant, postprocess, renderer-stress, large-scene,
  character-animation, and product-configurator presentation defects found by
  per-route canvas and full-page inspection;
- removes the distorted `game-slice`, racing, fake editor-output, fake asset
  gallery, primitive interior, duplicate product/material/character, public
  WebGPU capability, HDR contract, and shadow contract routes from the public
  example surface without deleting their useful internal contract tests;
- changes the major version because the final program consolidates ownership,
  removes or internalizes public-facing surfaces, and changes the supported
  competitive contract rather than presenting that work as a minor upgrade;
- proves all 19 public scaffolds through both 149/149 source checks and 149/149
  clean exact-2.0-tarball lifecycle checks, and exercises the documented 2.0
  migration against all 29 exact tarballs in a clean consumer;
- records the complete public-surface diff from `v1.5.2`, including every
  removal class, relocation, compatibility alias, schema/CLI/template invariant,
  and declaration change;
- publishes all 29 packages in lockstep, deprecates all 396 pre-2.0 package
  versions, tags the immutable release commit, and publishes the bounded
  release notes without asserting universal Three.js ecosystem parity.

## 1.6.0 (2026-08-08)

Architecture, compatibility, and evidence release:

- adds the recommended `@aura3d/engine/lean`, `./lean-product`, and
  `./lean-game` entries while retaining the compatibility-heavy root entry;
- consolidates production physics ownership on the `cannon-es` path, raises
  the solver-iteration default, and corrects capsule grounding plus
  rotation-aware ray/sphere queries;
- preserves the published input action-binding fixture surface with deprecated
  compatibility exports, so the minor release does not silently remove 1.5.2
  symbols;
- restores scoped WebGL2 evidence routes for glTF variants, OBJ, anisotropy,
  postprocessing, trackball controls, draw ranges, picking, and multiple camera
  views, with an explicitly injected-session-only WebXR example;
- closes the selected historical `three@0.165.0` 54-row example inventory with zero
  high-priority rows open, without claiming universal Three.js replacement;
- hardens browser, visual, demo, package-export, architecture, source-cleanliness,
  requirements-trace, and comparison gates so missing or stale evidence fails
  closed;
- keeps Blockfall Reactor, Skyline Runner, and Turbo Drift Circuit
  `prototype-blocked`; this package release does not promote them.

## 1.5.2 (2026-08-04)

Library release. Adds orthographic and isometric cameras plus bounds-derived asset
sizing to the public surface, fixes three instances of a hardcoded-geometry defect
class, and unblocks two visual-parity suites that previously could not produce a
measurement at all.

The four `release-ready candidate` showcase routes carry independent human visual
approval recorded in `docs/project/showcase-visual-review.json`. The three
prototype-blocked game routes (Blockfall Reactor, Skyline Runner, Turbo Drift
Circuit) were **not** approved and remain blocked with their retained blocking
issues.

### Added

- **Orthographic camera framing in `@aura3d/rendering`.** `computeOrthographicCameraFrame`
  derives a parallel-projection frustum from scene bounds, and `computeOrthographicCameraView`
  builds an explicit frustum for callers reproducing a reference render or a fixed
  drawing scale. `RenderSource.cameraProjection` selects `"perspective"` (default,
  unchanged) or `"orthographic"` for renderer auto-framing.

  Previously `createAutoFrameCamera` could only call `computePerspectiveCameraFrame`,
  so a scene that needed a parallel projection silently received a perspective one.
  This affected CAD and technical views, isometric games, floor plans, sprite bakes,
  and product turntables. `OrthographicCameraFrameFitMode` (`contain`, `fit-vertical`,
  `fit-horizontal`, `stretch`) makes the aspect-reconciliation choice explicit, since
  an orthographic frustum has no field of view to absorb a mismatch.

- **`camera.orthographic()` and `camera.isometric()` on the public agent API**, with an
  `orthographicSize` field on `AuraCameraSpec`. `AuraCameraMode` previously offered only
  perspective modes and `createViewProjection` hardcoded a perspective matrix, so a
  developer could not request a parallel projection through the safe surface at all.
  `camera.isometric()` uses the true `atan(1/√2)` elevation, at which the three world
  axes project to equal screen lengths.

- **`fitSizeToRegion()` in the public agent API** (`SpatialAnchoring`). Returns a
  `targetMaxDimension` sizing an asset to a chosen fraction of a region it occupies.
  Placement was already bounds-derived via `resolveSemanticRegion`, but sizing was not,
  so a route had no correct alternative to inventing a scale multiplier. A target
  dimension is an absolute world-space statement the renderer resolves against the
  asset's real bounds, unlike a scale factor which is only meaningful relative to
  unknown raw dimensions.

### Fixed

- **`showcase-smart-city-control` hero vehicle occluded the city.** `.scale(1.58)`
  rendered the vehicle at 2.45 units in a 3.8-unit city — 64% of the entire footprint.
  Now sized through `fitSizeToRegion` at 25%. Classified as an **API design defect**:
  the library could not express bounds-derived sizing.
- **Hardcoded cameras in `showcase-smart-city-control` and `showcase-data-galaxy`.**
  Both used fixed eye positions unrelated to scene or asset bounds; the smart-city
  "command" view sat inside the city, and data-galaxy cropped its hero off the top of
  the frame. Now use the existing `camera.autoFrame` and `camera.frameAsset` helpers.
- **Route-primary evidence could not isolate a hero in a full-bleed scene.** Added an
  `application` composition-probe category, so a non-game route can measure its declared
  hero by subject-difference without supplying gameplay play-space or ground-contact
  geometry. Previously such routes fell back to whole-canvas foreground analysis, which
  for a full-frame scene reports subject bounds equal to the crop and therefore always
  `clipped`. Route-primary probes: **12/12 pass** (was 9/12). Data-galaxy's measured
  hero readability went 34 → 91 once the probe measured the hero rather than a 51×13
  label fragment.
- **Stale `showcaseParticleCore` release asset probe** (pre-existing): manifest
  `renderedProbe` sha256 and colour-bucket count did not match the artifact on disk.
  Re-generated and synchronized.

### Notes

- Product visual-parity diff against Three.js improved from **0.914 to 0.331**
  changed-pixel ratio (MAE 36.2 → 17.4) and against Babylon from **0.913 to 0.272**
  (MAE 36.4 → 13.6), purely from honouring the shared scene descriptor's declared
  orthographic camera. **No threshold was changed**; the strict 0.15 / MAE 8 gate still
  fails, so same-asset product render parity remains an unproven claim.
- No analyzer logic was modified, so producer/verifier pixel parity
  (`png-foreground-parity.test.ts`) is intact.

### Also in this release

- **Discontinued example routes removed.** `showcase-racing-game-layer-proof` and
  `showcase-platformer-game-layer-proof` are deleted, along with their retained
  evidence, fixtures, compiler reports, six doc reports, and two writer tools that
  had no other consumers. Their release-gate coverage was repointed onto the real
  game routes (Turbo Drift Circuit and Blockfall Reactor) rather than dropped.
- **`showcase-data-galaxy` reclassified** from `internal-diagnostic` to
  `removed-from-public-showcase`. Its only diagnostic reason was
  `internal-diagnostic-route-primary-anchor-too-small`; the anchor is now readable
  (581x639 hero, readability 92), so no honest blocker remained. It is deliberately
  not promoted to a release candidate.
- **glTF-loader visual parity: 170/170 diffs pass** (`ok: true`), previously
  unrunnable. Fixed a browser-bundle resolution failure (14 Node built-ins pulled in
  via the assets package root instead of `browser-index.ts`), a `data:`-base URL
  failure on relative buffer URIs, reference cameras that framed only
  `external-url` assets, and an orthographic branch that moved the camera without
  sizing the frustum.
- **WebGPU visual parity passes**, previously unmeasured. Route health went 4/6 to
  6/6 after pointing fixture fetches at the local dev server, and the producer now
  writes captures to the path the auditor reads. Evidence is real GPU work on an
  `apple metal-3` adapter. This checks route render and evidence presence, not a
  WebGPU-vs-WebGL2 pixel comparison.
- **Product visual parity references now honour the shared descriptor's material
  model.** Three.js uses `MeshPhysicalMaterial` and Babylon
  `PBRMetallicRoughnessMaterial` with studio lighting matched to
  `externalParityEnvironmentDescriptor("studio")`, instead of forcing every material
  unlit. Babylon diff improved from 0.272 to 0.228 (MAE 13.6 to 12.7); Three.js
  holds at 0.331. The strict 0.15 / MAE 8 gate still fails, so same-asset product
  render parity remains **unproven** and no threshold was changed.

### Known limitations

- Same-asset product render parity against Three.js and Babylon is unproven.
- Hard capability gaps: morph targets, context loss recovery, text rendering.
- Unproven capabilities: tone mapping / colour management, LOD, contact shadows,
  raycasting, character controller, joints / constraints, continuous collision
  detection, physics debug rendering, cinematic sequencing, project scaffolding.
- Blockfall Reactor, Skyline Runner and Turbo Drift Circuit remain
  prototype-blocked.

### Evidence-correctness work carried in this release

Evidence-correctness patch. The pixel analysis behind every showcase screenshot gate estimated
background colour from a single four-corner average. On a gradient sky that estimate is wrong for
most of the frame: rows near the horizon were compared against a colour sampled from the top of the
frame, so sky pixels were admitted as subject and every derived measurement — silhouette extent,
foreground ratio, subject centroid — was computed against an inflated mask.

### Fixed

- **`analyzeForegroundPng` misclassified gradient backgrounds as foreground.** Background is now
  estimated per row from the median of that row's left and right margins, so the estimate tracks a
  vertical gradient and stays robust to a prop or HUD edge intruding into one margin.
  `tools/showcase-library/png-foreground.mjs` re-derives the same metrics from the written PNG and
  compares for exact equality, so the two implementations must agree pixel-for-pixel; that parity
  is now pinned by `tests/unit/tools/png-foreground-parity.test.ts` across gradient,
  flat-background, off-centre-subject and HUD-crop cases.
- **Aura Clash evidence route cited superseded artifacts.** `evidenceModel.ts` now points at the
  current arena proof files and schema pin, and its contract test asserts every required signal
  resolves to a field of the current schema.

### Verification

- 2914 unit and integration tests pass across 393 files.
- Producer/verifier parity asserted by equality, not by tolerance, in four independent cases.

## 1.5.1 (2026-08-02)

Product-remediation release. Three reported interaction defects and four reported game-runtime
defects were root-caused at the library level and fixed with reusable systems, each backed by unit
tests and a runtime probe rather than by a screenshot.

### Interaction defects fixed

- **Focus indicator rendered as a flat bar.** Aura3D's torus is a ring in local **XY** with its
  tube on **Z**. A route scaled `[1.22, 0.08, 0.78]`, squashing the ring's own Y radius, then
  rotated the sliver flat. Primitive local axes were undocumented and no reusable focus system
  existed, so every route invented its own indicator geometry.
  Added `focusObject`, `focusSemanticRegion`, `focusCameraIntent`, `clearFocus` and the published
  `AURA_PRIMITIVE_AXES` convention. Indicator correctness is asserted per result.
- **`labels.callout(...)` never rendered in any public route.** Labels were drawn only by the
  canvas2d fallback; every route with a typed GLB takes the production WebGL2 path, which ignored
  `kind: "label"`. Scene evidence counted label *nodes*, so reports stayed green while the screen
  showed none. Added a world-anchored screen-space label layer wired into the production renderer,
  plus `AuraLabelNode.anchorWorldPosition`, `offscreenPolicy`, and `AuraDiagnostics.labels`
  reporting the labels actually placed on screen.
- **Procedural geometry floating beside a scene.** Helper elements sat at literal world
  coordinates never re-derived after an asset changed. Added `placedBoundsFromAsset`, 19 bounds
  anchors, `resolveSemanticRegion`, deterministic distribution and `checkSpatialInvariants`.

### Game-runtime defects fixed

- **Vehicle sinking into the road, with no suspension.** Height was pinned to a literal that
  cannot respond to the surface beneath it. Added `createVehicleChassis`: four contact points,
  spring-damper suspension, attitude derived from spring state, a hard ground-contact constraint,
  and `groundedPosition` for `scaleMode: "fit"` models. Geometry derives from the asset's own
  rendered bounds via `vehicleChassisSpecFromBounds`.
- **Opponent driving sideways off the circuit.** The controller steered only on present lateral
  offset, which cannot turn into a corner before reaching it. Added `createVehicleDriverAi` with a
  look-ahead racing line, curvature-based corner speeds, reaction delay and recovery.
- **Floaty jumping and arbitrary session length.** A level shipped a 1.245-unit apex over
  0.216-unit platform steps — a 5.76x overshoot — and passed every gate because the level was
  *solvable*. Added `solvePlatformerMotion` and `validatePlatformerMotion`, enforced by
  `game.assetBoundPlatformerLevel`. Measured after: apex-to-step ratio 1.9x, airtime 0.52s.
- **Unrealistic combat.** Frame data was inverted: 12–32 active frames against 4–5 recovery, where
  real frame data is 2–5 active against 10–30 recovery. Every move was safe on block, so there was
  no spacing game and nothing to punish. Added `solveCombatFrameData`,
  `validateCombatFrameData`, `combatFrameAdvantage` and `createCombatAi`.

### Added

- `ApplicationKits.ts`: five reusable kits — product configurator, digital twin, architecture,
  smart city, cinematic. Each publishes a `capabilities` report naming what it deliberately does
  **not** own, rather than returning empty geometry for it.
- `SceneQueries.ts`: raycasts, sphere casts and ground probes reachable from the public API.
  Previously implemented in `@aura3d/physics` and unreachable from a route.
- `GamePlatformerInput.reset`, for consistency with `GameRacingInput`.
- `GameRacingSceneBinding.toGamePoint`, the inverse of `toScenePoint`.

### Verification

- 2903 of 2904 unit and integration tests pass, identical across two serial runs. The single
  failure is a pre-existing artifact-binding gate, verified present at the 1.5.0 baseline with a
  byte-identical checker (which fails nine classifications against this tree's four).
- 87 of 87 public controls and 47 of 47 keyboard bindings verified **by operation** across 13
  routes, with zero console errors.
- 21 of 21 combined quality gates pass with zero unproven. Missing evidence is reported as
  `unproven`, never as a pass.
- Four clean-room projects built against the public surface only: 137, 142, 122 and 99 authored
  lines against budgets of 200, 200, 300 and 300; one package imported each; zero private imports.

### Migration

- A route passing a chassis pose to a `scaleMode: "fit"` model must use
  `VehiclePose.groundedPosition`, not `position`. Passing the body centre lifts the model by its
  full ride height.
- `game.assetBoundPlatformerLevel` now **rejects** motion tuning inconsistent with the level's own
  geometry. A level whose jump overshoots or cannot clear its own gaps will throw at construction
  with the suggested fix in the message.

### Still not resolved

- `showcase-blockfall-reactor`, `showcase-skyline-runner` and `showcase-turbo-drift-circuit`
  remain **prototype-blocked**. Physics and frame data are correct; whether they are good games is
  a judgement their visual review has not yet made.
- `aura-clash-showcase` is **not in the route-gate registry**, so the showcase-wide gates do not
  cover it. It carries its own 23-spec suite.
- `@aura3d/engine-runtime` still declares 322 exports duplicating other packages; 51 exported
  symbol names have more than one owning package.
- Five physics capabilities remain unreachable from the public API: penetration resolution,
  friction, restitution, constraints, continuous collision detection.
- Frame-time and memory budgets are not independently measured. Draw calls are (776 max against a
  2000 budget).

The consolidated 2.0 product boundary and evidence are documented in
`docs/project/status/current-state.md` and
`docs/project/verification-evidence.md`.

## 1.5.0 (2026-08-01)

Public showcase curation and asset-correctness release. Two superseded public game routes were
**deleted**, the racing hero asset was replaced after its own release probe proved it structurally
broken, and the Aura Clash arena now renders the purpose-built typed environment it always shipped
with. Route and package claim boundaries are unchanged: the named presentations remain
evidence-bounded examples, not a claim of production game-engine or renderer parity.

### Removed

- **Deleted `showcase-public-racing-presentation-proof` and
  `showcase-public-platformer-presentation-proof`.** Both were superseded by Turbo Drift Circuit and
  Skyline Runner and had been carried as `removed-from-public-showcase` "historical certification
  evidence". Retaining them kept two low-quality routes shippable and consuming screenshot, review and
  gate budget. Removed from `apps/`, `route-gates.json` (15 -> 13 routes), the showcase index,
  `tools/agent-examples`, the geometry/composition/speed-contract producers, and their gameplay-proof
  browser tests. The marketing build keeps them in its prune list so a stale `dist/` is still cleaned.

### Fixed

- **Turbo Drift Circuit hero asset was structurally broken and is replaced.**
  `showcaseTexturedSportsCar` renders all four tyres detached from the hull on visible stalks at
  roughly truck scale, with an untextured brown cockpit. This was confirmed in the asset's **own
  isolated release probe**, so no route framing, lighting or scaling could correct it. Replaced with
  `showcaseCityVehicle` (role `vehicle`, `quality: release`, CC-BY-4.0, Objaverse provenance, 4
  textures, 2.10 length/width ratio). A prior release note claiming the tyres "read as complete
  rounded wheels resting on the asphalt" was incorrect and is retracted.
- **Aura Clash arena renders the typed multi-building environment.** `arenaNeonDowntown` -- authored
  for this route, carrying its emerald floor rails, neon signage and arena lights alongside streets,
  six buildings and props -- was unused because 84 of its 131 materials omit `metallicFactor`, which
  glTF defaults to 1.0; with `kd = 1 - metallic` the whole block rendered as a black mirror. The prior
  workaround averaged the textures into flat factors on a single-mesh cutout, producing the flat
  facade. The real maps are now attached (`scripts/build-textured-arena-glb.mjs`, mapping read from the
  source pack's own glTF), at 8.88 MB and 91 draw calls / 60 FPS.
- **Two chase/follow cameras were zoomed to satisfy the wrong gate.** Turbo (1.15) and Skyline (3.2)
  had been pulled in to clear `readabilityRuleForRole` floors, which are evaluated against each
  asset's *isolated* probe, not the route camera. The zoom could never satisfy them and caused both
  the "oversized mascot" and cropped-circuit framing. Both reframed against
  `routePrimaryProbeThresholds`, the gate that does apply.
- **Skyline Runner's typed world now carries the level.** Seven hand-authored primitives (a sky wall,
  five rotated "peak" boxes, a valley occluder and a shadow shelf) sat in front of the typed world's
  own 8 mountains, 18 clouds, 22 cliff rocks and 11 trees, so the flat boxes were the mountains a
  viewer saw. Removed; draw calls fell 172 -> 162.
- **Blockfall Reactor's game-over beat hid the final board.** The wash was pinned to full board height
  for as long as the game-over state held, covering the stack that ended the run. It now plays its
  sweep and settles into a top band.
- **`lighting.readable` was a source-authored boolean.** It compared `auraClashLightingPreset`'s own
  literals against fixed thresholds, so it could not be false -- and that preset is never rendered
  (its only consumer has no callers). It is now derived from the rig actually submitted to the
  renderer, with 6 negative controls proving it can fail.
- **`performance-budget.spec.ts` measured the wrong things and had never passed.** The JS budget summed
  every chunk on disk across all six routes; it now measures the eager graph a visitor downloads
  (810 KB against a 1.4 MB budget) while still bounding the on-disk total. The heap budget compared raw
  `usedJSHeapSize` readings, so it measured GC scheduling rather than retention; both ends now collect
  first. Retained growth measured at +1.7 MB across ~54 interactions.
- **The external demo exporter hardcoded `examples/<id>/main.ts`**, reporting `product-configurator`
  as missing though its page declares `./src/main.ts`. The entry is now resolved from each page's own
  `<script src>`.

### Added

- Aura Clash camera responds to combat: hit-stop punch-in and widened round-over framing as real
  renderer state, published as measurable `camera` evidence and proven by a browser test that requires
  an idle round to show zero response frames.
- Per-fighter emerald/cyan rim lights that track each fighter, so edge separation survives a cross-up.
- Grounded stage practicals and lane-boundary markers replacing floating banner slabs and a loose
  portal ring; the lane markers sit exactly on the clamp the simulation enforces.
- A declared `performanceBudget` on the side-view game render preset, naming the passes it was measured
  with so an unmeasured addition is detectable.
- Named-state capture assertions for Aura Clash (first frame, combat, block, KO, reset, mobile), each
  bound to the mounted runtime state its filename claims.
- Mobile fighting-game HUD for Aura Clash: both fighters' vitals side by side with the round clock,
  cutting HUD chrome 405px -> 162px and raising the arena's share of the page 37% -> 48.6%.

### Reusable engine layer (architectural remediation pass)

The showcase games proved gameplay kits and evidence plumbing existed, but visual quality, asset fitness
and art direction were still hand-authored per route. This pass moved that work into reusable packages.

- **Layered scene composition** (`@aura3d/engine`): `planLayeredSceneComposition` and
  `platformerCompositionSpec` plan deterministic foreground/midground/far-background prop distribution
  from declarative intent -- span, gameplay depth, prop vocabulary, protected zones, density scale.
  Seeded, so retained screenshots are reproducible frame-for-frame.
- **Banded sky backdrop**: `planSkyBackdrop`, `blendSkyBandColor` and `skyBandCountForRamp` replace
  hand-authored sky planes. Grades both sides of the horizon, and derives band count from the colour
  ramp so a gradient cannot read as a visible stair. Proven across five generated scenes at materially
  different scales, not only against its first consumer.
- **Reusable touch controls**: `bindGameTouchControls` replaces pointer-to-keyboard wiring that had been
  duplicated byte-for-byte between two routes. Idempotent per element, releases held keys on teardown,
  and reports missing element ids instead of yielding a dead button.
- **Typed subject placement**: `resolveSubjectPlacementFacts` derives ground contact, visual centre, a
  named centre-of-mass *approximation*, framing bounds and a wheel/foot contact region from typed
  manifest bounds, so route code no longer restates asset dimensions.
- **Role-aware asset admission** (`@aura3d/cli`): 21 distinct recorded checks against a requested role
  rather than one global pass/fail. Adds normalization requirement, orientation evidence, front/rear
  inference, origin/pivot sanity and material completeness. Orientation is never inferred -- absent
  evidence is reported, not guessed.
- **Deterministic candidate selection**: `assets resolve --index <n>` and `--candidate-id <provider:id>`
  with loud failure on out-of-range or unknown ids, and no silent fallback to the top result.
- **Per-primitive submission diagnostics** (`@aura3d/rendering`): `auditPrimitiveSubmission` records 18
  fields per primitive, including index component type, alpha mode/cutoff/effective opacity, texture
  readiness and optional glTF provenance, so a missing part is attributable rather than inferred.
- **Documented empty-flat-region budget**: a `flat-region-budget` visual-QA check measuring quantised
  colour-bucket concentration. Existing image checks measure the frame relative to its background colour
  and flat sky *is* the background, so they could not see this class of defect.
- **Evidence freshness is now itself retained**: `pnpm explain:staleness` writes
  `tests/reports/evidence-freshness/staleness-audit.json`, declared in the producer registry like every
  other producer, with a machine-readable reason required for every stale verdict.
- **Replicability metrics** (`pnpm report:replicability`) measure all 11 named dimensions, including
  repeated code clusters, asset-admission pass/fail counts, average screening attempts per intent, and
  evidence-freshness failures.

Measured: reusable visual-layer ratio **9.33x -> 6.08x** (2.16x excluding the Aura Clash outlier);
repeated cross-route code clusters **6 -> 0**; route-specific exceptions in engine code **0**.

### Claim Boundary

This release corrects asset, framing, evidence and measurement defects in the retained public routes.
It does not establish arbitrary asset-to-game conversion, general collision or vehicle physics,
reusable production game kits, AI opponents, netcode, production game-engine parity, or root-wide
renderer parity. Blockfall Reactor, Turbo Drift Circuit and Skyline Runner remain
**prototype-blocked**, and Aura Clash remains a **development showcase**: their hash-bound independent
visual review is still pending and no machine gate may grant it. Comparative performance and
Unity/Unreal parity wording remains blocked pending missing report inputs and real editor captures.

## 1.4.5 (2026-07-20)

Maintenance release for the public game runtime, production showcase, and release infrastructure. The package and route claim boundaries remain unchanged: the named presentations are evidence-bounded examples, not a claim of production game-engine or renderer parity.

- Added a bounded racing `paceMultiplier`, grounded platformer checkpoint respawns, and finish-surface validation to the public game genre kits.
- Corrected Skyline Runner hazard placement, character scale/facing, event handling, and generated geometry; corrected Turbo Drift Circuit pacing and speed presentation.
- Curated promotion to seven distinct route-library candidates plus Aura Clash while retaining superseded proofs, duplicate tools, and diagnostics as accessible but unpromoted evidence.
- Added complete production preview imagery and responsive marketing/showcase presentation, with corrected nested Aura Clash links and deployment paths.
- Aligned GitHub Actions with Node 22, pnpm 11.1.3, and current artifact actions; replaced the stale coverage job with the supported source-package suite.
- Bumped all 26 public packages, private workspace package metadata, templates, API docs, governance docs, and current marketing metadata to 1.4.5.

### Claim Boundary

This patch improves the named runtime helpers and retained public routes. It does not establish arbitrary asset-to-game conversion, general collision or vehicle physics, AI opponents, netcode, production game-engine parity, or root-wide renderer parity.

## 1.4.4 (2026-07-19)

Game-geometry certification, composition validation, generated immutable route contracts, and retained visual QA now form one fail-closed public game release chain. Turbo Drift Circuit and Skyline Runner were rebuilt against release-certified Kenney asset pairs and join the two established racing/platformer presentation proofs as bounded public examples. The full marketing website replaces the accidentally deployed static example registry at `https://aura3d.auraone.ai`.

- Added CLI-owned game-geometry certification and route-evidence binding with current asset hashes, retained probes, provenance, and atomic manifest updates.
- Added category-specific racing topology and platformer playable-surface extraction, asset-pair composition validation, scene-scale/pacing contracts, and compiler-emitted geometry modules.
- Rebuilt Turbo Drift Circuit and Skyline Runner with certified assets, evidence-selected cameras, reusable contact queries, 30-second category floors, gameplay proof, and accepted desktop/mobile presentation.
- Added fail-closed six-check automated visual QA with manual downward-only review; the three current public game routes and one superseded historical proof retain independent reports.
- Updated the public showcase to 9/9 current release candidates, retained one superseded historical platformer proof, and kept two internal diagnostics plus two game-layer diagnostic harnesses outside the public count.
- Restored the complete multi-page marketing/docs/showcase deployment and aligned package, API, agent, route, governance, and release documentation to 1.4.4.

### Claim Boundary

This patch proves bounded stylized racing/platformer presentations for the named certified routes. It does not claim arbitrary GLB-to-game conversion, production physics, AI opponents, netcode, production game-engine parity, or root-wide renderer parity.

## 1.4.3 (2026-07-18)

Current maintenance release metadata, public API documentation, and governance references are aligned to the 1.4.3 package set. Public release language remains governed by `docs/project/product-studio-claim-registry.md`; route and runtime claims require their named retained gates.

## 1.3.3 (2026-06-10)

ECS rendering bridge, expanded humanoid animation vocabulary, Aura Clash combat-system wiring, Animation Studio prompt/render pipeline fixes, agent-API demo features, and create-aura3d template repairs. All 26 packages (`@aura3d/*` + `create-aura3d`) publish in lockstep at `1.3.3`.

- **ECS:** new camera/light/mesh/world-transform components plus `TransformSystem` and `CameraSystem`; `ECSRenderSource` render bridge with a corrected inverse-transpose normal matrix, shadow-light source objects, safe empty-world queries, and ambient-light handling.
- **Animation:** 14-clip standard humanoid vocabulary (adds `wave`, `sit`, `shrug`, `cross_arms`, `salute`, `shake_head`); performance state graph with true held-loop `sit`/`cross_arms` states.
- **Aura Clash showcase:** combo, guard-break, knockdown, and match systems wired into the arena with corrected single-source damage, working wakeup invulnerability, functional input buffering, and seeded deterministic rival AI.
- **Animation Studio:** prompt-driven scene generation; SSE render progress (stale-progress fix, atomic writes, EventSource lifecycle); accurate console command vocabulary; drag-retime on the Shots track; bundled template Studio re-synced with a drift-guard test.
- **Agent API:** 12 demo prefab/character features with GLB-accurate humanoid metadata and clamped particle counts.
- **Physics:** fixed constraint anchor rotation in the custom solver; the gallery physics playground is pinned to the deterministic aura-js backend.
- **Rendering/assets:** skinned-lit material no longer declares unsupported extension-texture uniforms (crash fix); KTX2 transcoding restored to the production-safe main-thread path; neutral-gray default material fallback.
- **create-aura3d:** 8 functional three-compat templates (real scenes, runnable specs, correct engine pins); fixed the published `files` list; removed a duplicate template entry.
- **Test gates restored:** template import assertions, benchmark sha256 verification, public-API contract audit (examples are now self-contained), and the `./engine` export assertion.
- **Tooling:** checked-in `tools/release/publish-all.mjs` publish-flow guard.

## 1.3.2

Minor documentation, benchmark, and runtime polish release.

- Updated governance docs and claim guidelines to version `1.3.2`.
- Added benchmark evidence files for Round 50 (`round-50.md`, `round-50-engine.md`, `round-50-decision.md`).
- Fixed `App.tsx` auto-render in animation-studio-web.
- Fixed Aura Clash KO mop-up accidental damage (`health <= 12`) and AI guard against KO'd opponents.
- Fixed `HitboxSystem` heavy/special damage values to match engine combat spec.
- Changed default GLTF fallback material from pure white to neutral gray to prevent blow-out.
- Added loading indicator to advanced-examples-gallery authored-asset route.
- Verified external CLI asset commands work outside the monorepo.

## 1.3.1

Patch release over 1.3.0. **Fixes the `create-aura3d` scaffolder pinning a stale engine version:** new projects generated by `npx create-aura3d` declared `@aura3d/engine@1.0.10` (a hardcoded fallback literal that was never bumped) regardless of the template's own dependency. The scaffolder now writes the template's declared engine version (the published release), falling back to the release version only as a last resort. All 26 packages are re-published at 1.3.1 in lockstep so a scaffolded project resolves a matching, published engine. No API changes from 1.3.0.

## 1.3.0

The 1.3.0 release bundles three feature waves on top of 1.1.x: the **Animation Studio** (prompt → rendered short), the **Animation Engine** (locomotion graph + layered playback + templates), and the **Believable-Motion Track** (critically-damped transitions, foot IK, spring bones, event tracks, morph targets, 96-joint WebGPU skinning). Every item is verified in the worktree (typecheck clean; per-feature gates green).

### 1.3.0 Highlights — Animation Studio

The Animation Studio turns a natural-language prompt into a deterministic, rendered animated short. Documented in `docs/animation-studio/` (README, quickstart, guide, studio-app, quality-and-limitations).

- **Prompt → EpisodeDocument → render.** `animation-scene new --prompt "…" --full` (template `animation-studio`) compiles a data-driven `EpisodeDocument` (cast / set / props / dialogue / blocking / camera); a generic `scene-player.ts` (zero scene constants) renders it. The director is the user's own coding agent driving a validated Scene-Tool CLI — **no bundled LLM, no API key**.
- **Prompt-specific scenes.** `parseCast` binds prompt nouns to curated graded-A humanoid rigs (neutral cast, never the moon-garden fixture); `pickSetForPrompt` keyword-routes distinct interiors (garage/office/kitchen), meadow, space-station, moon-garden, else a neutral studio — **no moon-garden default**.
- **Motion.** A shared standard clip library (idle/talk/gesture/point/nod/walk/run/react) retargeted per character, **velocity-gated locomotion** (legs cycle only while actually translating), and director acting rules (questions→react/nod, emphasis→gesture, movement→walk). Procedural motion is the stable default; extracted catalog mocap is opt-in per rig (`AURA_EXTRACTED`).
- **Dialogue & captions** timed by `estimateSpeechDuration` (≈165 wpm + punctuation pauses) — not fixed windows. Renders are **silent by design**; the pipeline emits the timed dialogue/caption/viseme track for **AuraVoice** to voice.
- **Rendering.** `AURA_QUALITY=preview|final`, `AURA_RENDER_STYLE=toon|pbr`, cel + HDRI/IBL + contact shadows; deterministic (same document → byte-identical frame).
- **Web studio app** (`apps/animation-studio-web`): a three-pane NLE (Outliner / Stage / Inspector / Timeline / Director Console) whose dev backend runs real validated Scene-Tool commands and real renders against the same working document the CLI writes.
- **10-gate quality suite** (`pnpm animation-studio:gate-suite`): no-fake-proof, rig-validity, body-motion (excl. mouth/caption/camera), motion-quality, lip-sync-timing, subtitle-timing, prompt-specificity, visual-quality, performance-budget, no-fake-proof-chain — fails on stiff/lip-only motion, lingering captions, moon fallback, mock UI, and hard-coded proof. Plus a determinism gate and a clean-room packaging check (verified from local tarballs).
- **Higher fidelity** is a `cast add --file <glb>` away — bring a real rigged character and the pipeline grades, render-probes, and drives it.

### 1.3.0 Highlights — Believable-Motion Track

- **T1.1 Inertialization (`@aura3d/animation`):** new `Inertialization.ts` — a pure, deterministic critically-damped decay of the pose offset captured at a transition (`createInertializer`/`recordTransition`/`sampleInertialized`, plus scalar/vec3/quaternion primitives and `inertializedTransitionWeight`). `fighterInertializedWeights` is the default fighter transition (linear `fighterCrossfadeWeights` retained as fallback); `AnimationMixer.inertialCrossFade`, `AnimationStateMachine.stateBlend`, and `LocomotionKit` `stateTransition` route transitions through it. Aura Clash move-swaps use it (`__AURA_CLASH_INERTIALIZATION_PROOF__`) with the deterministic replay checksum unchanged. Gate: `animation-engine:inertialization`.
- **T1.2 Foot IK + foot-lock (`@aura3d/animation`):** new `FootIk.ts` (`createFootIkRig` on `solveTwoBoneIk` + an injected `GroundRaycaster`; foot-lock holds a planted foot in world space and releases on lift; `kneePoleHint` helper). `FootIkSample` unified with the fixture (fixture `claimBoundary` now points at the real runtime); `@aura3d/physics` adds a `groundHeightRaycaster` adapter; `LocomotionKit`/`LocomotionController` expose an optional `footIk` hook. Browser proof: no foot sliding on uneven ground. Gate: `animation-engine:foot-ik`.
- **T1.3 Spring bones (`@aura3d/animation`):** new `SpringBones.ts` (`createSpringChain`, semi-implicit Euler + distance constraint + sphere/capsule push-out, deterministic with fixed `dt`); `Bone.springChain` tagging + `Skeleton.springChainIndices`/`writeSpringChainBack`; the fixture `springSample()` oracle is retained. Browser proof: a chain reacts to character motion and settles. Gate: `animation-engine:spring-bones`.
- **T2.2 Animation-event tracks (`@aura3d/animation` + `@aura3d/editor-runtime`):** `AnimationEventTrackContainer` (named lanes of typed markers + active-frame windows) on the existing dispatcher/sampler; `EventTrackEditor` authoring controller (add/move/delete + serialize to `animation-event-tracks/v1`). Aura Clash move data carries hitbox/footstep/vfx tracks and the arena derives the hitbox active window from authored clip events (`__AURA_CLASH_EVENT_TRACKS_PROOF__`) — replay checksum unchanged. Browser proof in the studio editor. Gate: `animation-engine:event-tracks`.
- **T2.3 Morph-target hardening (`@aura3d/rendering` + `@aura3d/assets` + `@aura3d/engine`):** new `MorphTargetPlan.ts` (`createMorphTargetPlan`/`planMorphTargets`: uniform fast path ≤4/64, texture-backed plan for larger facial rigs sized to device limits, CPU fallback beyond) — the 4/64 GPU cap is lifted (over-cap now falls back to the CPU morph instead of throwing) and the morph shader gains a texture-sampling branch. The CPU morph morphs normals/tangents (lighting follows the deformation); the glTF loader exposes all morph targets + `mesh.extras.targetNames`; `node.morphInfluence(name, weight)` API; viseme-driven blendshape lip-sync (`applyVisemeMorphInfluences`). Browser proof: a >4-blendshape face with lighting following the morph + viseme lip-sync. Gate: `animation-engine:morph-targets`.
- **T2.1 WebGPU 96-joint skinning parity (`@aura3d/rendering`):** the WebGPU path now carries a 96-joint palette (`MAX_WEBGPU_SKINNING_JOINTS = 96`, matching WebGL2 `u_jointMatrices[96]`) — the WGSL `DrawUniforms` carries `joints: array<mat4x4<f32>, 96>`, the draw uniform packing uploads the full palette, and the emulation rasterizer now skins the full palette (previously capped at 2 and not skinned in the rasterizer). Parity proof: a vertex bound to joint #80/#95 drives the render. Gate: `rendering:webgpu-skinning-parity`. Real-device WGSL execution stays evidence-bound.
- **Aggregate gate:** `pnpm animation-engine:believable-motion` runs all six per-feature gates.

Honest scope: Tier 3 stays a documented non-goal — no motion matching, no production ragdoll, no general full-body IK (FABRIK/CCD), no Mecanim/Control-Rig editor parity. `docs/project/status/known-limits.md` is updated only for the items genuinely proven (morph cap + WebGPU 96-joint skinning).

## 1.2.0 — Animation Engine (shipped within 1.3.0)

The 1.2.0 work was never published as its own release; it shipped as part of 1.3.0. Implements the Animation Engine track: `pnpm animation-engine:readiness` + `pnpm animation-studio:readiness` are green, typecheck is clean, ~80 tests pass, and browser proofs cover the editor, skinned preview, template routes, and the Aura Clash motion.

### 1.2.0 Highlights — Animation Engine

- **`@aura3d/animation` additions:** `createLocomotionAnimationStateGraph` (idle/walk/run preset), `createLocomotionKit` (speed → blended idle/walk/run clip weights via `BlendTree1D` + the locomotion state graph), a generic `validateAnimationClipMap`, a `createAnimationClipRegistry` export, a path-follow `LocomotionController` usage example, and a shared fighter-animation adapter (`resolveFighterClip` / `fighterCrossfadeWeights`).
- **Per-clip bone-mask blending:** `GLTFSceneAnimationClipSample.mask` (include/exclude) in `applyClips`, enabling layered playback such as an upper-body attack over a lower-body locomotion base.
- **CLI:** `aura3d assets validate-animation` validates a character's required action→clip map against its available clips.
- **Templates:** new `animation-studio` (typed character → `anim:plan/preview/profile/package/verify` pipeline, locomotion preview route, kit-driven skinned-character preview render) and `character-controller` (input → kinematic speed → locomotion kit) starters. Both routes boot in-browser; the published-package scaffold smoke runs after the 1.2.0 publish.
- **Visual editor:** a browser authoring UI wired to the headless `editor-runtime` controllers (DOM timeline scrub, deterministic curve editing, state-graph view, serialization round-trip).
- **Gates:** `pnpm animation-engine:readiness` (plus `animation-engine:dead-code` and `animation-engine:docs-claims`) and `pnpm animation-studio:readiness`.

### 1.2.0 — Aura Clash motion upgrade

- The deployed arena now **crossfades** between locomotion/guard states (no hard clip snaps), **varies hit reactions** by attack weight (light/heavy) **and** grounded/airborne state, and **layers attacks on an upper-body bone mask over a walking lower body** while moving — all browser-verified, with deterministic combat replay still stable. The arena proof version records the motion upgrade.

### 1.2.0 — Removed / housekeeping

- Removed the dead `apps/aura-clash-showcase/src/fighters/{FighterController,FighterAI}.ts` and the legacy `packages/animation/src/Retargeting.ts` stub (its public export dropped; superseded by `HumanoidRetargeting`). A dead-code gate enforces no production import resolves to them.
- Documented unsupported animation areas (motion matching, ragdoll, full-body IK, inertialization, no parity with Unity Mecanim or Unreal Control Rig, cloth/hair) in `docs/project/status/known-limits.md`, enforced by `animation-engine-docs-claims`.

### 1.2.0 — Honest scope

- Aura3D 1.2 is an animation-engine + tooling release. It is not Unity/Unreal/Babylon parity, not motion matching, not full-body IK or ragdoll, and not finished authored game art. The motion-matching and secondary-animation paths remain explicitly-labeled deterministic fixtures. Aura Clash gained a real motion upgrade (transitions, reactions, layering) but no new fighter art.

## 1.1.0

### 1.1.0 Highlights

- Shipped the Aura3D 1.1 **Animation Studio** vertical slice: typed animation assets, episode plan/show-bible, shot timeline, captions (VTT/SRT), amplitude-based visemes, render queue, WebM episode export, episode package folder, motion-quality and visual-quality gates, and a human review package.
- Added animation production stretch adapters as honest, capability-probed contracts: optional external phoneme analyzer, cloud render adapter, YouTube upload adapter, webcam/mocap performance-capture session, and a manifest-backed asset-library browser. Missing credentials/providers produce diagnostics rather than fake success.
- Added editor-runtime review tooling: episode review panel, visual review dashboard, multi-user review/quorum workflow, camera path editor, and a source-level nonlinear animation editor.
- Bumped all 28 published workspace packages to `1.1.0`.

### 1.1.0 Release Notes — scope and honest limits

- **Animation Studio is a structured vertical slice, not Pixar.** The Moon Garden sample renders a real WebM and package, but the bundled character assets are **placeholder-grade**: `miko` and `luma` share a base GLB, `luma` uses a generic `humanoid-fixture.glb`, and the motion-gate frames are a 2D stylized representation. These are starter/CI assets, not finished authored characters.
- **Aura Clash was NOT newly authored in 1.1.** The showcase was rebuilt against the 1.1 animation engine and re-deployed, but it has **no new fighter assets and no gameplay redesign** this cycle; the gameplay/feel pass remains outstanding. It is still a development showcase and browser-runtime proof target, not a flagship-quality fighting game.
- Aura3D 1.1 is a scoped runtime + animation-production release. It is not a Unity/Unreal/Babylon parity claim, not a magic image-to-video engine, and not a full animation studio.

## 1.0.9

### 1.0.9 Highlights

- Published `@aura3d/engine`, `@aura3d/cli`, `@aura3d/asset-index`, and `create-aura3d` at `1.0.9`.
- Added the scoped Aura Clash Arena release path with contextual source names, typed fighter assets, deployed route proof, performance gates, and npm/package-readiness reports.
- Added `TypedGLBActor` production-runtime support as the public source direction for typed, skinned GLB actor evidence.
- Tightened the AI asset-catalog CLI profile flow for fighting-character search, resolve, and validation, including rejection diagnostics for unsuitable candidates.
- Updated public docs, README, `llms.txt`, marketing copy, and deployed routes to use scoped 1.0.9 wording.
- Deprecated older npm versions below 1.0.9 to reduce accidental installs of the broken earlier release line.

### 1.0.9 Release Notes

- Aura3D 1.0.9 is a scoped runtime-foundation release. It is not a Unity replacement, Unreal competitor, Babylon.js parity claim, or mature commercial game-engine claim.
- Aura Clash Arena is a development showcase and browser runtime proof target. It is not yet a flagship-quality fighting game.
- Current published artifact evidence is recorded in `docs/project/release-artifacts.json`.
- Current release gates are recorded in
  `docs/project/release/release-checklist.md`.

## 1.0.6 - 1.0.8

### Iteration Notes

- These internal release lines covered the hard reset from failed Aura Clash route attempts to contextual `playable/` source, release-gate tooling, docs-claim scanning, versioned-source-name checks, CLI/catalog profile proof, and deployment proof.
- The detailed gap analysis remains in `docs/project/aura3d-106-game-engine-and-showcase-prd.md` and `docs/project/aura3d-107-prd.md`; not every peer-grade game-engine task in those planning docs is complete.

## 1.0.5

### 1.0.5 Highlights

- Added release evidence for skeletal animation playback, clip restart, clip blending, animation events, and viseme/blendshape synchronization.
- Added editor-runtime timeline, inspector, project serialization, and visual graph bridge evidence for the first 1.0.5 authoring-tools release lane.
- Added visual scripting runtime bridge evidence for deterministic frame, animation-event, combat, camera, and snapshot graph hooks.
- Added strict Aura Clash asset provenance evidence with typed asset names, source paths, CC0 license evidence, sha256 checksums, and no-placeholder validation.
- Added fighting-game, animation-channel, and prompt-animation-channel starter smoke evidence with browser-generated first-frame screenshots.

### 1.0.5 Release Candidate Notes

- Public package metadata is aligned on `1.0.5` across the workspace package manifests.
- The 1.0.5 readiness report passes with concrete reports and PNG evidence under `tests/reports/aura3d105/`.
- Aura Clash launch screenshots remain optional showcase evidence in the 1.0.5 verifier, not package-release blockers.
- Broad production, marketplace, or engine-superiority claims remain governed by the existing claim registry and external proof policies.

## 1.0.4

### 1.0.4 Highlights

- Added the federated Aura3D asset catalog release track through `@aura3d/asset-index`, the hosted Cloudflare `/search` endpoint, source adapters, semantic ranking seams, license normalization, and refresh/index interfaces.
- Wired the Aura3D CLI asset workflow to the hosted catalog through `assets search` and `assets resolve`, so AI agents can resolve named real-world objects to license-aware, typed GLB/glTF assets instead of primitives or hallucinated URLs.
- Added prompt-plan intent resolution to the public agent API with unresolved intent subjects, resolved asset subjects, resolver injection, subject type guards, and compile-time refusal for unresolved prompt assets.
- Updated `llms.txt` and agent docs with catalog-first, no-three.js, no-`GLTFLoader`, no raw-URL guidance for prompt-to-3D workflows.
- Folded the Aura3D game-runtime and prompt-animation source contracts into the 1.0.4 release line, including frame-loop, input, fighting-game source helpers, runtime evidence, prompt episode, caption, AuraVoice bridge, viseme, and deterministic screenshot metadata APIs.
- Added 1.0.4 release documentation for the catalog worker, D1 index, source adapters, CLI bridge, prompt resolver seam, operational proof gates, and known loose ends.

### 1.0.4 Release Candidate Notes

- Public package metadata is aligned on `1.0.4` across the workspace package manifests.
- Current docs, governance checklists, and public API reference metadata now target the `1.0.4` release line.
- Publication remains blocked until fresh install/build/typecheck/smoke/browser/deployment/catalog proof evidence is generated from this exact source tree.
- Broad competitive or production superiority claims remain blocked unless they cite current, committed, neutral evidence. The catalog and runtime work support the launch story, but do not replace release proof gates.

## 1.0.0

### 1.0.0 Highlights

- Agent-friendly TypeScript browser 3D SDK for prompt-to-code workflows.
- Scene kits for AI-generated physics, particles, data visualization, material labs, mini-games, cities, humanoids, and typed product viewers.
- Typed GLB/glTF asset workflow through the Aura3D CLI, generated refs, hashed assets, and anti-hallucination rules.
- Vite starter templates for product viewers, cinematic browser 3D scenes, and interactive mini-games.
- Public `@aura3d/engine` API surface for scenes, cameras, lights, materials, effects, interactions, physics, UI, and diagnostics.
- Route-health diagnostics, screenshot evidence, and static deploy checks for browser 3D apps.
- Scoped claim boundaries that separate the SDK/product-context launch path from the unfinished frozen benchmark-superiority proof.

### Current Release Candidate Notes

- Aligned public package metadata, API documentation, tutorials, examples, and governance docs on the 1.0.0 release line.
- Kept bounded claim language tied to generated evidence and current readiness reports.
- Added the final proof and go-live inventory for the frozen
  `UnifiedPRD.md` benchmark standard.


### Scoped SDK/Product-Context Candidate Notes

These notes are scoped to the original AI-agent SDK/product-context launch track only. They do not claim that Aura3D has passed the frozen AI-agent benchmark against manual renderer code.

Completed scoped evidence currently includes:

- Public agent-facing API and typed asset workflow documentation.
- Scene-kit-first guidance in `llms.txt` and agent docs.
- Prompt-plan compile/repair guidance for agent-authored apps.
- Starter template, deployment, screenshot, and diagnostics documentation.
- Fresh Round 50 prompt PNG/contact-sheet artifacts under `benchmark/runs/round-50/`, including 40/40 prompt screenshots and comparison contact sheets.
- Round 50 local visual-QA prompt-matrix smoke preflight, tone proof, engine parity summary, review/scoring packet, release-readiness inventory, user-approval artifact, and scoped owner bypass artifact.
- Benchmark tooling updates for `UnifiedPRD.md` as the single source of truth, scoring handoff docs, prompt-matrix setup, prompt capture, and renderer-proof artifacts.
- Round 50 result-file paths are now created for handoff and traceability: `benchmark/results/round-50.md`, `benchmark/results/round-50-engine.md`, and `benchmark/results/round-50-decision.md`. The prompt benchmark and decision are recorded as `pending` because neutral review and external scoring were owner-skipped.

Still not completed for broad launch:

- Neutral-human visual review was owner-skipped for the current move-on workstream; `benchmark/runs/round-50/human-review.json` is not present and the frozen benchmark pass is not proven.
- External prompt score files were owner-skipped for the current move-on workstream; `benchmark/scoring/round-50-scores/*.json` is not present and the frozen benchmark pass is not proven.
- Round 50 decision remains `Decision: pending`, not `Decision: ship`.
- Release-proof guard pass.
- npm publish or public go-live evidence.

### Round 50 Scoped Move-On Boundary

- `benchmark/results/round-50-benchmark-gate-bypass.md` records the owner direction to skip `benchmark/runs/round-50/human-review.json` and `benchmark/scoring/round-50-scores/*.json` for the next workstream.
- This scoped move-on boundary allows package/docs/release-prep work to continue, but it does not support the claim that Aura3D passed the frozen externally scored Aura3D-vs-manual renderer code benchmark.
- Any public launch copy must stay on the scoped SDK/product-context claim unless the skipped neutral-review and external-scoring artifacts are later supplied and the release-proof guard passes.

### Release Proof Gate

- 1.0.0 is not go-live ready until a full neutral benchmark round passes and
  the release notes cite the passing `benchmark/results/round-N.md`,
  `benchmark/results/round-N-engine.md`, and
  `benchmark/results/round-N-decision.md` files.
- `benchmark/results/round-12.md` and
  `benchmark/results/round-12-decision.md` record the latest complete failed
  prompt round and cannot be used as shipping evidence.
- `benchmark/results/round-12-engine.md` records a passing engine benchmark,
  but it is not enough to ship without a passing prompt benchmark.
- Round 13 repair work was committed in `d1a533f`, but explicit human sign-off
  for that benchmark standard is not currently recorded. Round 13 is not a
  passing result and cannot be cited as shipping evidence.

## 0.1.0-alpha.0

### Governance

- Added product studio governance requirements for support, security, contribution, release, migration, compatibility, and claim-guideline documentation.
- Public release language for this version must follow `docs/project/product-studio-claim-registry.md`.
- Strong claims such as production-ready, better than manual renderer code, Unity/Unreal replacement, full WebGPU support, or PBR parity remain disallowed unless the product studio gates later approve exact scoped wording.

### Release Status

- `0.1.0-alpha.0` is an internal experimental rebuild version.
- A release candidate requires current report JSON files generated from the same release-run ID and a passing final release verifier.
