# Changelog

Version: 4.5.0

Public claims and release wording are governed by `docs/project/product-studio-claim-registry.md`.

## Unreleased

Fixes from the live-games and 4.5.0 audit (`docs/audits/live-games-4.5.0-audit-2026-10-29.md`). Draft: this entry lists what has landed on the audit-fix branches so far and is updated as the lanes merge. All browser measurements are software WebGL2 on the remote runner; no real-GPU run has been made.

- **4.5.0 gate result, stated (docs).** The 4.5.0 benchmark gate passed 7 targets, failed 7 and had no data for 1; it fails on T1 (81 of 125 rows where three.js is better, limit 30). `evidence/vs-threejs/RESULTS-4.5.0.md` section 0.
- **Look-fill calibration, restated per game (docs).** The 4.5.0 entry said the no-HDRI looks stay "within about 5% of 4.3.7 ... inside the games". Measured at steady state the change ranges from +2.8% to +6.4% in the games captured before release (Aura Diamond Skyline 71.0 to 74.5, Lunar 82.8 to 86.1; Aura Hoops Shanghai 53.5 to 55.6, Orbit 109.4 to 113.3; Pip's Big Leap w6 108.1 to 111.1; Iron Crown Neo-Tokyo 31.4 to 33.4). Glint Courier reads +18% (25.0 to 29.5) because its hemisphere light now counts next to its ambient, not because of the fill. The pre-fix Skyline reading is 71.0 to 2.6 in the game capture; the 68.7 to 5.9 in the look-fill test header was an earlier build. Every other game is measured by the capture below.
- **Steady-state luma capture for every game and lighting variant (tests).** `tests/browser/game-luma-capture.spec.ts` now covers all 25 live games and every park, court, course, venue, stage, world and theme (61 targets, `tests/browser/game-luma-targets.ts`), logs a 3x3 region grid and the clipped fraction per shot, and runs in shell-safe groups (`--grep=@g1` to `@g7`). A unit test keeps the list in step with the inventory and with each game's variant ids.
- **New game-checks (tools).** `touch-input` warns when gameplay input is keyboard-only or a touch binding names no declared action; `lighting` warns on lights with no environment or look, a hemisphere next to an environment or look, and a look added at runtime next to an authored ambient; `shared-catalog` warns when a game imports the repository-wide asset catalogue; `screens-fresh` warns when a card frame predates the latest minor release. All four are warnings while the game fixes land.
- **"Built with Aura3D" credit stays off game controls (site).** The credit on the eleven renamed game pages picks a corner that overlaps no control, re-checks after the game mounts its controls and on resize, fades on the first key or pointer press, and carries `no-steer`. It sat over Chroma Roll's mute button and The Bellkeeper's Walk joystick. Pages pick it up on the next `node tools/showcase-port-pages/sync.mjs`.
- **Comparison copy uses the 4.5.0 run (docs, site).** The README, the engine npm page, the homepage, the comparison page and `llms.txt` quote scene source size from `RESULTS-4.5.0.md` (PBR viewer 23 lines against 49, 1 import against 8; all five benchmark scenes 17% to 53% shorter, one author). The benchmark viewer is no longer described as "HDR lighting": its HDRI node does not load. `RESULTS.md` (4.1.2) is marked superseded, and `claims-and-boundaries.md` states that only scene source size may sit next to three.js while T1 fails.

## 4.5.0 (2026-10-28)

A release with two visual changes: the default render path and the exposure calibration. Read both before upgrading. All timings below are software WebGL2 on a remote runner; no real-GPU run has been made.

Benchmark gate at 4.5.0: 7 PASS, 7 FAIL, 1 NO-DATA; it fails on T1 (81 of 125 rows where three.js is better, limit 30). `evidence/vs-threejs/RESULTS-4.5.0.md`.

- **Visual change: `createAuraApp` takes `quality` and picks a cheaper render path for plain scenes (engine, rendering).** `quality: "auto" | "production" | "safe-basic" | "cinematic"` (default `auto`). A scene with no post-processing, output options, transmission or custom shader draws in one pass to the canvas; every other scene, and `quality: "production"`, uses the HDR chain exactly as before (the production call sequence is unchanged and covered by `render-path-selection.test.ts`). `app.diagnostics().renderPath` and its reason say which one ran. `setOutput` on a direct-path app now warns instead of silently doing nothing. Measured on the cube scene: steady frame 42.9 ms to about 6 ms, first frame 954 ms to about 450 ms, 2 draw calls to 1.
- **`preserveDrawingBuffer` can be requested and is on for capture pages (engine).** In 4.3.7 the renderer profiles listed `preserveDrawingBuffer: true` but the value never reached the WebGL context, which was always created without it. 4.5.0 adds a `preserveDrawingBuffer` option to `createAuraApp` and turns it on for `?capture=1` and `?qa=1` pages; every other page keeps the 4.3.7 behaviour. `app.screenshot()` now re-renders before reading, so screenshots and the stock `check-deploy --browser` black-frame check work on any page. If you read the canvas yourself outside a render call, pass `preserveDrawingBuffer: true` or use `app.capture()` / `app.screenshot()`.
- **Bloom fuses draws without adding fill on the `auto` and `cinematic` paths; `renderer.bloomFusion` selects the mode (engine, rendering).** `bloomFusion: "separable"` (default) folds the bright extract into the level-0 downsample, sums the mips in one pass and folds the last upsample into the composite, and blurs mips 3 and 4 in 2-D only within a tap budget: the PBR viewer drops from 33 to 25 draw calls with frames within 0.001/255 mean and 1/255 max of `production` in three remote runs, and frame time at parity with `production` within runner noise (strictly lower is not established). `bloomFusion: "fused-2d"` (opt-in, also `?aura3d-bloom-fusion=`) blurs mips 1 to 4 in 2-D as well (23 draws) and costs 45% to 52% more frame time on software WebGL2, so it is off until a real-GPU run exists. An invalid value throws. `app.diagnostics().renderPath.bloomFusion` reports the mode that ran and says `off` when no fused pass can run (`production`, `safe-basic`, or no bloom). `quality: "production"` keeps the separable chain unchanged.
- **Per-frame cost (engine, rendering).** The GL error check runs on the first frames, after resource changes and every 60th frame (every frame in `strict` and `?diag=1`), the default lighting probe builds faster with bit-identical output, and per-frame report objects are built on read. See the next entries for the second round of cuts.
- **Per-frame JS memoisation and allocation cut on the direct path (engine, rendering).** Program keys, the registry's active list, the derived core-output-off flags, the page-URL flag and shadow lookups, and the WebGL2 state-cache bookkeeping no longer rebuild or re-serialise what has not changed. On the cube scene this cut allocation from 385 KB to 235 KB per frame and CPU in `frame()` from 0.17 to 0.12 ms in the deterministic budget test (`frame-submission-budget`). The remote A/B on software WebGL2 did not reach the 0.5 ms target for the cube frame (1.5 to 1.1 ms gate figure, 1.0 to 0.8 ms settled); `evidence/vs-threejs/wp5-frame-submission.md` has the profile and the floor.
- **Shadow cascades no visible item can sample are skipped, and the program warm stops compiling variants nothing draws (rendering).** On `auto` and `cinematic` only (`production` still draws every cascade), the game-loop scene goes from 38 to 20 draws and from 6 to 4 programs, and the skinned character from 8 to 4 programs, with `production` pixels byte-identical on both frames. Frame time did not improve on software WebGL2 (both scenes are fill-bound there). See `evidence/vs-threejs/wp7/README.md`.
- **Dense instanced shadow casters draw depth in one call per node per cascade (rendering).** Nodes with 1,024 or more instances that use the engine's instanced shadow proxy go from batches of 64 to one instanced depth draw per cascade: the 10,000-instance forest goes from 569 to 11 draws, pixel-identical on the remote runner. A leak in the vertex-array eviction index (one empty set per disposed instance buffer) is fixed. Opt out with `__A3D_DENSE_DEPTH_DRAWS__ = "off"`.
- **Shadow PCF tap tiers are opt-in (rendering).** `?shadowtaps=32|16|8` caps the kernel length of the forward shadow filter; `?qualitytaps=on` maps the quality tier (low 8, medium 16) and `?densetaps=on` sends scenes with 8,192 or more shadow-casting instances to 8 taps. Nothing changes unless one is set. Measured on the 18,000-instance forest the 8-tap tier changes the frame by 0 to 2% on software WebGL2 (the kernel is already 9 taps) and differs by up to 9/255 at penumbrae, so no tier is applied by default.
- **Time to first frame of the cube (rendering).** The analytic floor probe is built and turned into its equirect without per-texel work, and the baked default probe decodes after the first frame has been submitted (a 3 s timeout, and no wait where no renderer exists). Settled frames are bit-identical (SHA-256 equal on all 15 loads). On software WebGL2 through the unbundled dev server, `createAuraApp` to first frame went from 407-491 ms to 209-252 ms and navigation to first frame from 755-873 ms to 596-649 ms. The 500 ms target holds for the first and not for the second: about 390 ms of navigation is the dev server loading the module graph. The deferral of the baked probe showed no measurable difference in that harness. See `evidence/vs-threejs/wp8-first-frame.md`.
- **Exposure gaps against three.js are attributed, not calibrated (docs, tests).** Remote ablations of the cube, PBR viewer and forest scenes trace each difference to the benchmark sources or documented defaults; no engine change was made. See `evidence/exposure-parity`.
- **Options that were accepted and ignored now say so (engine).** `primitives.*`, `instances.*` and `interactions.*` raise an `OPTION_IGNORED` diagnostic, naming the valid keys, for an option they do not read (in `app.diagnostics()`; strict mode throws). `primitive()` now forwards `renderOrder`, `frustumCulled`, `layers`, `userData`, `rotationOrder` and `quaternion`, which it used to drop. `interactions.orbit` accepts a node name or a world point plus `position` and `autoRotate`.
- **Instancing at scale (engine, rendering).** `setInstanceTransforms(typedArray)` is the per-frame path (about 0.3 ms of CPU for 18,000 instances), unchanged instance buffers skip the upload, and large instanced draws send only the instances inside the camera frustum. Dense shadow-casting instanced nodes (1,024 or more instances of a builtin primitive) use a coarser shadow stand-in, so their shadows are more faceted; opt out with `shadowproxy=off`. The 10,000-instance forest now completes on software GL in about 4 minutes (it did not finish before); it is still 3.3x to 3.9x the frame time of the same scene in three.js there.
- **Animation layers, root motion, retargeting and two-bone IK work from the root with receipts (engine, animation).** Fixes found on the way: `playLayer` no longer activates its clip as a base action (masks leaked onto the whole body), `mask: { humanoid, exclude }` is honoured, `addClipsFrom` accepts a model node handle or id, and the retarget worker falls back to an in-process bake when it cannot start. See `docs/api/animation-root.md`.
- **Root physics collision for box, sphere and capsule bodies has a receipt (engine).** A bare capsule or cylinder physics spec now gets a collider that spans the visible size; `physics: { bindNodes: true }` makes stepping `app.physics` move the visible nodes.
- **Scene kits and effects have pixel receipts (engine).** Nine scene kits and the ambient-occlusion, colour-grade, vignette and depth-of-field effects have software-WebGL2 receipts. `effects.contactShadows` produced identical frames in 4.3.7; it is now a real screen-space contact-shadow mask (next entry). Three kits reported problems against their own defaults (particle readiness gate, the solar-system sun check, neon-tunnel ring count) and are fixed; the built-in humanoid GLB is no longer rejected as an unsafe URL. See `docs/agents/effects-and-scene-kits.md`.
- **`effects.contactShadows()` builds a screen-space contact-shadow mask that forward lighting samples (rendering).** It replaces the interim lowering to the ambient-occlusion pass. The mask is built from scene depth before the forward pass, marched along the sun direction, and multiplied into the visibility of the shadow-casting directional light only (an absent mask is exactly 1.0). It needs a directional light with `shadow: true` and a shadow caster: with a spot or point light only, or none, the effect renders nothing, `diagnostics().shadows.contactShadows.unavailable` says why and one warning is logged. Orthographic cameras are supported. The glTF extension variants (clearcoat, transmission and similar) do not sample the mask, and a blocker deeper than twice the march length is ignored by design. Receipt `evidence/receipts/effects-contact-shadows/4.5.0.json` (software WebGL2, 600x400): the near-base floor darkens where the mask acts, the far floor and the spot and no-caster pairs are unchanged, and no ambient-occlusion pass is requested. Where the shadow map already shadows the receiver the mask adds little; the large effect is in the scene where the subject is outside the shadow map.
- **`@aura3d/react`: `AuraCanvas` renders its children and keeps its app across parent re-renders (react).** Before, `useAuraFrame`, `useAuraApp` and `<Model suspendOnLoad>` inside it never ran and the app was recreated on every parent render. The package stays experimental; mount, cleanup and StrictMode have not run in a browser.
- **`aura3d migrate three`: fidelity is tested and reported (cli).** Every `exact` row names a fixture that runs against real three.js; 48 rows are exact (21 before), 150 approximate, 47 none and 0 pending (3 before). 14 math rows (`Vector2/3/4`, `Matrix3/4`, `Quaternion`, `Euler`, `Color`, `Box3`, `Sphere`, `Plane`, `Ray`, `Frustum`, `Triangle`) became exact by pointing at the new mutable subpath below; at option sites the codemod still emits the hex string or tuple.
- **New `@aura3d/math/three` subpath: mutable, three.js-shaped math (math).** `Vector2/3/4`, `Matrix3/4`, `Quaternion`, `Euler`, `Color`, `Box3`, `Sphere`, `Plane`, `Ray`, `Frustum` and `Triangle` mutate in place, return `this`, take target out-parameters and return `null` on a miss, with `fromImmutable` / `toImmutable` to cross to the immutable `@aura3d/math` classes, which are unchanged. 453 method-level goldens taken from three@0.185.1 back `tests/unit/math/three-compat-parity.test.ts`. See `evidence/vs-threejs/wp2-math-compat.md`. Fixed on the way: `Clock.start()` resets elapsed time, step tracks return the key's own value at its keyframe time, `ShapeGeometry` drops the repeated closing vertex, and `SphericalHarmonics3.getBasisAt(normal, target)` fills its target.
- **Capability audit and gates (docs, tools).** The audit's `Proof` column names the receipt or test behind each `shipped` row, and `node tools/receipts/check.mjs` fails a missing proof and lists receipts to regenerate when the minor version moves. `tools/docs-codeblocks` typechecks the effect, scene-kit and genre-kit examples and now resolves `@aura3d/engine/physics`. The benchmark gate is `tools/bench-vs-threejs/gate.mjs`.

- **Look presets with no HDRI keep their brightness (engine).** `night-city`, `polar-night`, `neon-arcade`, `space` and `underwater` used to be lit by the implicit neutral-room fill; they now carry an explicit `environments.neutral` fill (`AuraLookV0Expansion.fill`, `preset: "neutral"`, intensity 0.85 for the three night looks, 1.0 for `space`, 0.65 for `underwater`, calibrated on steady-state captures), so their mean luma stays within about 5% of 4.3.7 in the standard look scene; in the games measured at steady state it reads +2.8% to +6.4% (per-game numbers in the Unreleased entry). The first cut used the baked `night`/`studio` probes, whose diffuse irradiance is about 30x (night) and 0.8x (studio) of the neutral room: they read right on the first frame, while the analytic neutral floor was still bound, and dropped to near black once the baked probe loaded (Aura Diamond 3D Skyline 71 to 2.6, Hoops Shanghai 53.5 to 5.7). Like the implicit fill it replaces, the fill is dropped when the scene authors a `lights.ambient`. The other ten presets bring an HDRI and are unchanged.
- **Visual change: a scene that authors its own lights and no environment is now lit by those lights only (engine).** A directional light of intensity I on a Lambert surface of albedo A gives `A * I / PI`, ambient gives `A * I / PI`, and a hemisphere light gives `A * mean(ground, sky) * I / PI` (three.js r185's value on a horizontal normal; up- and down-facing surfaces differ by half the sky/ground gap). Before this, the scene category's implicit studio/daylight environment was stacked on top of the authored lights, which made the same nominal lights 2x to 13x brighter in linear light (measured on software WebGL2: one grey plane, directional intensity 1 gave linear 0.434 against three.js 0.069; the skinned-character bench scene read mean luma 192.5 against three.js 144.0). Scenes with an `environments.*` node, scenes with no lights at all, and scenes with a light probe are unchanged. To get the old fill back, add `environments.studio()` (or any `environments.*`); to brighten or darken the whole frame, set `output: { exposure }` on `createAuraApp`. Hemisphere lights now contribute in this mode (they were dropped before).
- **Ambient occlusion and depth of field read real depth (rendering).** `createRenderTarget` gave RGBA32F colour targets linear filters, which makes them texture-incomplete until `OES_texture_float_linear` is enabled, so the v2 post chain's view-space depth read as zero: ambient occlusion darkened the frame by a constant factor with no crease structure and depth of field read the same zeros. `renderTargetSampleFilter` enables the extension and falls back to NEAREST for RGBA32F without it; RGBA8 and RGBA16F are unchanged, and scenes that never create an RGBA32F target are unchanged. This is an intended change to `quality: "production"` output, for scenes with ambient occlusion, god rays, depth of field, TAA, motion blur or auto-exposure.
- **`WEIGHTS_0` rescaling of rounding noise no longer logs a console warning (assets).** Skin weights whose sum is within 5% of 1 (export rounding on unmodified assets; the three.js Soldier has 52 vertices up to 2% off) are renormalized silently with one `console.debug` line per primitive; real defects (degenerate or badly scaled weights) still warn.

## 4.3.7 (2026-10-28)

A CLI feature release. `@aura3d/cli` gains a browser pass for `check-deploy`; the engine and the other packages carry no runtime change from 4.3.6 (their version, README and doc-path updates only).

- **`aura3d check-deploy --browser` loads the built site in a headless browser (cli).** It serves `dist` from a local static server with no SPA fallback, opens each route (`/` by default; repeat `--route /play/`), and fails on a 4xx/5xx response, a request that did not complete, an uncaught exception, a console error, or a `data-aura3d-error` boot error on `<body>`. A missing favicon is a warning only. Playwright is resolved from the project being checked (`npm i -D playwright`), so projects without it keep the static check. `--browser-timeout` and `--browser-settle` tune the wait. Tested against real Chromium (clean site, broken site, boot error, multi-route, CLI exit codes).
- **The four retired V2 game builds are deleted from the repository (site).** `/apps/showcase-{roadster-rush,heatsink,teleoperator,top-tennis}-v2/` keep answering with a permanent redirect to the current game; the folders, the V2-only camera spec and the V2 entries in the smoke tests and stage scripts are gone.
- **The troubleshooting guide no longer names versions that cannot be installed (docs).** The build-error, plane-subdivision, shader-failure and context-loss entries describe current behaviour only.
- **Measured comparison and agent-trial records are added under `evidence/` (not shipped).** A complete game written twice (271 authored lines on Aura3D against 373 on plain three.js, one author, one small game, software WebGL2) and a cold-start trial of fresh agents on the same task. They stay internal; the site and READMEs make no agent-speed claim.

## 4.3.6 (2026-10-27)

A documentation and site release. The published packages carry no runtime change from 4.3.5; their READMEs (the npm pages) and one source comment are updated.

- **The site and docs lead with what Aura3D ships (site, docs).** The homepage hero is now "A lit 3D product in 10 lines of TypeScript", shown next to the matching three.js app (38 lines before orbit controls). Both scenes are in `tools/bench-vs-threejs/tagline/` and were built and rendered on the remote runner against the stock `create-aura3d` product-viewer scaffold (`evidence/vs-threejs/tagline-check/`). The comparison page is now "Why Aura3D over three.js"; the README, the engine, create-aura3d and cli npm pages and the feature guides say what each gives you versus assembling it yourself. `docs/comparisons/threejs-positioning.md` holds the claim table and the evidence for each number; `docs/comparisons/aura3d-capability-audit.md` labels every capability shipped, partial or experimental.
- **Homepage code samples compile again (site).** The SDK and typed-asset samples used `orbitCamera`, `environment.studio` and `createAuraApp({ target, scene: [...] })`, none of which exist. They are replaced by the verified hello-world and hero scenes.
- **`check-deploy` is described as the static check it is (site).** The homepage said it loads a route and reports failed requests and console errors. It checks the build output against the asset manifest (missing hashed assets, unreferenced files in `dist`) and, with `--release`, the licence and quality gates.
- **References to releases that can no longer be installed are gone (site, docs, npm pages).** The create-aura3d npm page no longer talks about 4.0.x, `llms.txt` no longer carries the 4.1.2 build warning, `docs/project/migration.md` no longer sends people to the retired `@aura3d/three-compat` package, `docs/agents/api-surface.md` no longer lists the live scatter helpers as deprecated, and the guides for 2.0, 4.0 and 4.1 moved to `docs/archive/`. Version stamps across `docs/` are restamped or dropped.
- **The three "V2" game builds redirect to the current games (site).** `/apps/showcase-{roadster-rush,heatsink,teleoperator,top-tennis}-v2/` answer with a permanent redirect to the game they replaced and are out of the inventory, the sitemap and `llms-full.txt`. The live game count stays 25.
- **New social card and site checks (site).** The card carries the new headline. `marketing/scripts/check-site.mjs` now fails on old release numbers, version-numbered build names, deprecated APIs in code samples and unbacked `check-deploy` claims, and `tools/site/scan-live-site.mjs` runs the same rules against the live site.

## 4.3.5 (2026-10-26)

- **`app.effects.runtime = "off" | "on"` switches runtime-spawned effects per app (engine).** With `"off"`, `effects.burst`, `effects.spawn`, game effects and impact presets create no particles; the camera and light feedback still run, authored scene effects are untouched, and the library default stays `"on"`. The URL's `?vfx=on` and `?vfx=off` override the app either way, and `window.__AURA_VFX_DEBUG__` (`?vfxdebug=1`) still lists live emitters. Tests: `tests/qr/prd07/unit/runtime-effects-switch.test.ts`.
- **Runtime effects are off by default in Aura Links 3D, Aura FC 3D and Iron Crown (games).** The cause of the floating yellow/white and blue/gold bubbles the owner sees on a real GPU is still unproven. Open any of the three with `?vfx=on` to re-enable the effects for diagnosis, together with `?vfxdebug=1`. Aura Hoops and Aura Diamond also use runtime effects (hit sparks and bursts); no bubbles were reported there, so they stay on.
- **Camera-following weather sprites (snow, rain) are capped on screen and fade near the lens (engine, rendering).** They have a world-space size, so a flake passing 0.3 m from the camera projected to a disc of about 390 px (rain streaks about 290 px). Snow is now capped at 1.55 percent of the viewport height (14 px at 900 px), rain at 4 percent, both fade out under 1 m, and `VOLUME_SPRITE_LIMITS` and `volumeSpriteScreenSize` (the CPU model of the vertex math) carry the numbers for rain, snow, marine snow (8 px) and dust motes (8 px). Aura Links 3D, Aura FC 3D and Iron Crown do not enable any weather or dust volume (their looks carry none, and their light cones are beams), so this does not explain the owner's bubbles in those games; it protects every game that does use weather. Tests: `tests/unit/rendering/volume-sprite-limits.test.ts`.
- **Correction to the 4.3.4 note on point sizes.** SwiftShader reports `ALIASED_POINT_SIZE_RANGE` as [1, 1023], so the explanation that software GL hides oversized points was wrong. The 4.3.4 on-screen cap (12 percent of the render height) is a safety net only and does not shrink 20 to 60 px bubbles.

## 4.3.4 (2026-10-26)

- **Particles and points can no longer grow into screen-filling discs on real GPUs (engine, rendering).** SwiftShader clamps `gl_PointSize` tightly, while real GPUs (ANGLE/Metal) allow very large point sizes, so a size-attenuated point that passed close to the camera, or had a large authored size, drew as a giant soft disc. Attenuated `points()` are now capped at 12% of the render height with a near cull, fixed-pixel points at 256 px, and billboard particle batches default to a 10% screen cap (`DEFAULT_PARTICLE_MAX_SCREEN`) and drop any particle behind the camera. Unit tests mirror the vertex math and pin the shader source.
- **Links golfer: the right (trail) arm is drawn in front of the torso, not inside it (games).** An offline sweep (`tools/aura-athletes/links-arm-sweep.ts`, `links-arm-visibility.ts`, `links-arm-render.ts`: the game's own swing solve through the shipped golfer GLB, CPU-skinned, four views) showed the arm lengths were always right but the right arm lay half inside the rebuilt jersey torso in the putting stroke and the backswing/downswing (only 8 to 37 percent of it visible from the best side), which read as a shoulder stub with no arm. The trail-arm solve is pinned by the club (palm plus shaft angle), so its elbow could not move; the drawn right arm now reaches the same grip point through a free elbow (`ARM_POLES`, pointing forward and down like the lead arm) while the club still follows the exact solve. Worst visible fraction over every phase went from 0.19 to 0.54 (right) and 0.57 to 0.76 (left), putting from 0.55 to 0.77. New `tests/unit/aura-links-3d/arm-sweep.test.ts` sweeps every phase and club and the aim yaws and fails on a collapsed, detached or hidden arm. The aim yaw cannot collapse an arm: the arms are solved in the golfer frame and the aim only rotates the whole node.

## 4.3.3 (2026-10-26)

- **The Hoops, Diamond, Links and FC athletes have a neck again (games).** The shared torso-tube rebuild closed the collar under the chin, which left the head floating 5 to 7 cm above the shoulders in every clip. `tools/aura-athletes/add-neck.ts` appends a short skin tube from inside the collar into the base of the head (Chest to Head weight ramp, skin colour); it only adds vertices, so palm points and head-bone positions are unchanged and every shipped clip still stretches at most 1.6x.
- **Aura Diamond 3D: the batter stands and swings like a baseball hitter, not a barbell across the head.** The grip was right but the pose was not: the bat lay at 30 degrees across the back of the head with the arms straight out. The ready stance is now a real one: feet a little wider than the shoulders, knees bent, weight on the back leg, chest turned toward the plate, head turned to the pitcher, hands together 20 cm in front of and above the rear shoulder, rear elbow out at shoulder height, bat upright (67 degrees) and leaning back over the rear shoulder (never closer than 25 cm to the head). The swing runs load (hands back, front foot lifts, bat 50 degrees), stride (foot lands), slot (hips and chest open first, hands lead, barrel lags), contact (bat level in front of the front hip, any pitch within reach), through and a high finish with the bat wrapped over the front shoulder. Hand targets are interpolated in the turning chest's own frame and kept off the shoulder and inside the arm's reachable cone, so no elbow folds. Legs are IK-planted (`legBones` in `src/batter-pose.ts`) with a front-foot stride; the walk-up still plays the clip. `tests/unit/aura-diamond/batter-pose.test.ts` asserts the pose (bat elevation 55 to 80 degrees in the stance, barrel above hands and rear shoulder, 8 cm head clearance, both hands on the handle). Evidence: `evidence/aura-diamond-3d/bat-fix/pose/`.
- **Grounding sweep of every game for the Hoops "origin as centre" bug (games).** `tests/browser/fit-grounding-sweep.spec.ts` loads all 25 live games on the remote runner and lists every runtime node with its position and drawn box; the static `fit-grounding` check covers the literal pattern. Found and fixed beyond Hoops: the Aura FC ball (a fitted model placed at its centre height, so it rolled 11 cm above the pitch; the node is now placed so its centre is the sim ball whatever its spin), the Aura Links golf ball (resting 5 cm above the turf), the Aura Diamond ball (about 7 cm high at rest and on the ground) and the Cumulus Dash rolling boulders (a 3.8 m fitted rock drawn 1.9 m above the road, pivoting about its base). Checked and left as they were: Slingshot Siege, Pips' Big Leap, Bunker Zero, Iron Crown, Top Tennis, Teleoperator, Drift and Deliver, Shadowstep Gauntlet and Last Train (their actors already stand on their floor).
- **`game-checks` gains `fit-grounding`.** It flags fitted (`scaleMode: "fit"`) models placed at half their height (the Hoops origin-as-centre bug) and models moved by a constant equal to half their height; the Hoops ball rack and trophy case and the Diamond ivy trophy no longer hover.
- **Particle emission and life are proven frame-rate independent (test).** `tests/qr/prd07/unit/emitter-frame-rate-invariance.test.ts` runs the CPU emitter and the runtime effect system at 30, 60, 120 and 144 fps and asserts the same particles per second for a continuous emitter and the same peak with nothing alive past the design life for every one-shot preset. The emitter already used time-based emission with fixed sub-steps; frame-rate dependence is not the cause of the floating bubbles.
- **Impact-preset particles have a maximum on-screen size (engine, rendering).** `app.effects` presets now carry `maxScreen`, the largest particle diameter as a share of the viewport height (5% by default, 6% for aura-burst, 12 to 20% for explosions and flashes), clamped in the particle vertex shader so a soft glow disc can never grow into a bubble at any distance, resolution or pixel ratio. Authored `effects.particles` nodes accept `maxScreen` too; absent or 0 leaves them uncapped.
- **Dev diagnostics for effects that outlive their design (engine).** A runtime emitter still emitting 5 s after it was spawned reports `VFX_UNSTOPPED_EMITTER`, and more than 24 runtime particles alive 3 s after the last spawn report `VFX_LINGERING_PARTICLES` (both appear in the effect diagnostics report; one-shot presets never trip them). On a live page, `?vfx=off` drops every runtime-spawned effect (to show whether floating dots come from impact effects or from the scene) and `?vfxdebug=1` publishes `window.__AURA_VFX_DEBUG__()` with each live runtime emitter, its age and particle count. Note: the production frames read at DPR 1 on the software-GL runner (Links, FC, Iron Crown idle) showed no bubble columns; the owner's real-GPU frames did, so the source on a real GPU is still unconfirmed.
- **`tools/real-gpu`: capture the live games on a real GPU.** Every earlier visual check ran on software GL, which hid the real-browser regressions of 4.3.0. `tools/real-gpu/run.sh` (and `capture.mjs`, per-game `scenarios.json`) opens production in Chrome at DPR 2, probes the WebGL renderer string, refuses to run on SwiftShader/llvmpipe, and writes screenshots plus `report.json` (console and page errors, failed or 4xx requests). It runs on a Mac or on a GPU VM; see `tools/real-gpu/README.md`.

## 4.3.2 (2026-10-26)

- **The rebuilt Hoops, Diamond and Links athletes lose the shoulder balls and dark arm bands.** The arm and sleeve tubes of the 4.3.1 rebuild (and of the FC rebuild tool) were wound inside out, so the engine drew their inner faces dark: the "elbow band" and dark sleeves. The tubes are now outward-facing, the shoulder spheres are gone (the Aura FC striker and goalkeeper get the same fix plus a clean torso tube in place of the ragged Meshy shell, `rebuild-arms.mjs --taper --cap-sleeves --cap-radius 0 --torso-tube`), the arm and sleeve roots taper into the torso so no rim shows, and the shoulder slopes smoothly into a short sleeve. Hands stay within 1 cm of the previous palm points.
- **Teleoperator renders again.** The four generated building models were never admitted in `aura.assets.json`, so the production build did not copy them (404 live) and `auraApp.ready()` rejected, leaving the 3D canvas black in 4.3.0 and 4.3.1. They are admitted now, both Teleoperator variants fall back to plain boxes if a building model is unreachable and no longer stop the simulation when `ready()` fails, and a new `deployable-assets` game check fails when a game references a `/aura-assets/` model the build would not copy.
- **The 4.2.0 shadow and post behaviour is the default again (hotfix, real GPUs).** Aura Slam rendered dark with dense stripes on a Mac GPU after 4.3.0 while software WebGL2 looked fine, so everything 4.3.0 changed on that path is switchable and off by default: the cascade fit (casters widen the ortho, camera near/far as given), the oversize-caster skip, instanced casters through the attribute buffer (`__A3D_SHADOW_FIT__ = "current"` or `?shadowfit=current` opts in; the 4000 m sky dome in Shadowstep Gauntlet needs it), and the linear-light vignette in the OUT stage (`__A3D_LINEAR_VIGNETTE__` or `?linearvig=1`). A large flat floor is never an oversize shell. Legacy mode keeps the 4.2.0 depth shader source and program keys, so frames match 4.2.0.
- **The OutputPass HDR route for post chains is opt-in again.** 4.3.0 sent chains made of only bloom and tone mapping through a new rgba16f target and the shared OutputPass; it was proven on software WebGL2 only and real GPUs rendered some scenes dark (Teleoperator black, Aura Slam dark). The fused present of 4.2.0 is the default again; opt in with `globalThis.__A3D_HDR_OUTPUT_PASS__ = true` or `?hdrout=1`. The route also requires `EXT_color_buffer_float` or `EXT_color_buffer_half_float` on a real WebGL2 context. Linear-light vignette, one tone map and the 4.3.0 luma numbers on the fused path are unchanged.
- **`tests/browser/shadow-banding.spec.ts`** captures every sun-shadow game (and the live Aura Slam page) at DPR 1 and 2 on the remote runner; `tests/browser/shadow-banding.config.json` lets it drive the production URL. Software WebGL2 did not reproduce the real-GPU stripes: the frames are the evidence, the stripe number is a smoke check.
- **Hoops: the athletes no longer hover 0.96 m above the floor, so the hand is on the ball.** The athletes and the ball are `scaleMode: "fit"` models, which the renderer grounds on their lowest point, but the game placed them as if their origin were their centre (`y + 0.96`, and the ball at its centre height), so every player was drawn a metre above his ring, shadow and the bouncing ball and the ball bounced a metre below the drawn hand in every pose (the probes read the bones in the model's own space, so they agreed with themselves, not with the screen). Athletes now sit at floor height, the ball node is placed so its centre is the sim ball whatever its spin, and the dribble probe now projects the drawn palm and the ball through the live camera (`tests/browser/hoops-dribble-screen.spec.ts`, `?diag=1&qaStep=1`).

## 4.3.1 (2026-10-26)

- **Teleoperator: `showcase-teleoperator-v2` gets the generated buildings, and the shuttle pod holds up in every camera.** The four building models now line the v2 street too. The pod's window openings are filled with one dark tinted cabin box in place of the generated seats and inner walls, and the Roof LiDAR and Bumper cameras, which sat inside the taller pod and showed its shell polygons, now use pod-specific offsets (`PLAYABLE_FLEET.waymo.cams`) in both variants. Verified on the remote runner in all four cameras for `showcase-teleoperator`; `-v2` renders nothing in that harness even on 4.3.0's source, so it is unseen. Evidence: `evidence/teleoperator/art-pass/`.

- **Impact presets are one-shots that use their own life, size and spread; no more floating bubbles (engine).** `app.effects.spawn("spark")` and every other named preset started a continuous emitter, and both `spawn` and `burst` dropped the preset's life, size and spread, so each hit spark, dust puff, ring and aura burst lived 1.2 to 2.4 s as a 5 to 14 cm glowing disc: the gold, blue, yellow and white bubbles over Iron Crown and FC. Presets now burst once with their own parameters (`scale` multiplies size); only an authored spec object loops. Attenuated `points()` no longer applies the device pixel ratio twice (2x too large at DPR 2). Contract in `docs/api/vfx-presets.md`, lesson R15.
- **Aura FC 3D: the ball moves like a football.** Passes and driven passes launched at 20 to 28 degrees (median apex 1.28 m), so every pass was a bouncing lob. They are now weighted ground passes (2 to 4 degrees, speed from the receiver's distance), with quadratic air drag, a rest threshold for hops, dt-correct Magnus curl and an orientation that rolls v/r about the axis perpendicular to travel (quaternion, exported as the engine's ZYX Euler). Free-ball physics moved to `game/ballPhysics.ts` with measured-trajectory tests.
- **Game effects are one-shot bursts and no longer shake the camera by themselves (engine).** `createGameEffects` forwarded every hit, kick and goal to `app.effects.spawn`, a continuous emitter that was never stopped: each event left a fountain running at its spot (26 live particles after 0.2 s grew to 190 after 3 s from four effects). That was the white and yellow clusters scattered over the FC pitch. Bound game effects now stop each emitter when the effect's duration is over (`update()`), and pass `camera: false` so the preset shake no longer stacks on game feel. The trauma layer gains `maxTrauma`. FC: shake only on goals, tackles and the woodwork (rotation under 0.5 degrees, settled in under 0.4 s), no shake on passes or shots, `?shake=0` and reduced-motion switch it off, smaller bursts, dust on the turf.
- **`createTwoHandGrip` and `measureGrip` in `@aura3d/engine/game`: a bat, club, racket or staff held in both hands.** The Aura Diamond batter solver is now a library kit: two-bone IK for both arms onto grip points `gripSpread` apart on the object's axis, the elbow orbit and forearm twist that roll the object onto the wanted direction, hand-off (`release` lets the top hand go and relax), left-handed mirror, deterministic `step`/`state`/`reset`, bones for the engine (`twoHandGripBonesForEngine`: objects, not tuples), and ZYX/XYZ quaternion conversions (route nodes use ZYX). `measureGrip` reports knob-to-bottom-palm and top-palm-to-axis per phase (<= 0.06 m, 0.08 m follow-through) and `handCentroid` measures against the CPU-skinned drawn hand. Aura Diamond runs on the kit with its numbers unchanged (a golden test replays 112 recorded solves to 1e-12). Docs: `docs/api/motion-two-hand-grip.md`, recipe 7, lessons M17.
- **Hoops dribble: the ball bounces under the hand, in every pose.** In the owner's 4.3.0 frames the ball sat on the floor about 0.4 m beside the handler while the hand hung at hip height. The ball now always rides the palm as drawn (also when the athlete is not in a dribble pose), its XZ is the palm's XZ (a runner's ball lands ahead along travel by at most 0.10 m, never beyond 0.25 m from the palm), the standing handler crouches 0.36 m with deeper waist bend so the palm reaches 0.5 m at the bounce, and the running profile lowers the palm to about 0.54 m. `measureHandBall` now enforces ball-under-hand (XZ), palm touching the ball at the meet, palm height at the floor contact and maximum XZ offset, for standing and running (`RUNNING_HAND_BOUNCE_LIMITS`).
- **Bunker Zero enemies face the player, and the library has `faceTowards`.** Every enemy was drawn with its back to the player: the sim yaw treats -Z as forward and the Meshy GLBs look down +Z, so each actor was exactly 180 degrees off. `@aura3d/engine/game` now exports `faceTowards`, `yawToFace`, `facingError`, `visualHeading` and `wrapAngle` (a per-model forward axis plus a turn rate; `docs/api/motion-facing.md`). Bunker Zero declares each model's forward axis, turns enemies toward the player at a limited rate, and the alert state now faces the player as well. A remote probe stages each enemy kind in front of the player and prints the angle between where it looks and the player.
- **The Hoops, Diamond and Links athletes are rebuilt, not patched.** The 4.3.0 repair gave stretched triangles their own rigid vertices, which passed the numeric check but left white hairline tears on the shorts and shoulders. `tools/aura-athletes/rebuild-athlete.ts` now rebuilds each athlete in the straight pose its skeleton assumes, like the FC fix: a clean jersey tube measured from the old torso, thigh, shin, shorts or pants, socks, sleeves, arm tubes and hands with smooth weights; head, hair, eyes and shoes keep their geometry. The forearm follows shoulder, elbow and the games' calibrated palm point, so the dribble, bat and club grips keep their palm points (within 1 cm). Zero triangles stretch past 1.6x in any shipped clip, with no cuts or splits.

## 4.3.0 (2026-10-25)

- **Aura Diamond 3D: the batter stands on the ground and both drawn hands hold the bat in every phase.** Every athlete was placed at `y + 0.94` although `scaleMode: "fit"` already grounds the model, so all of them hovered a metre above the dirt and the swing was built to hit a ball a metre too low. The top hand used the right arm's bind directions (23 cm off the bat), the grip point was a stale estimate (now the posed centroid of the hand's skinned vertices), the engine's bone attachment let the bat drift 14 to 76 cm from the hands in fast segments, and the bat node was rotated in XYZ instead of the engine's ZYX order. The solver and swing keys now live in `src/batter-pose.ts`; the bat is placed from the same solve as the arms; the stance is a real ready position. Drawn palms (CPU-skinned hand vertices on the repaired athlete GLB) stay within 4.7 cm of the bat axis in every phase (`tests/unit/aura-diamond/drawn-grip.test.ts`, `tests/browser/diamond-bat-fix.spec.ts`). Evidence: `evidence/aura-diamond-3d/bat-fix/`.
- **Sun shadows are back in Shadowstep Gauntlet and Ion Circuit.** Shadowstep Gauntlet (2 cascades, 90 m, village models, trees and actors cast, 127 draw calls against its 133 budget) and Ion Circuit (custom road, terrain and props receive through `a3d_shadow`). `?shadow=0` restores the previous look. Mean luma with the shadow is within 2 points of the no-shadow frame in both.
- **Sun shadows are back in Serpentine Sky Run** (toon surfaces drop to the lowest band in shadow; 1 cascade, 80 m; luma within 0.1 of the no-shadow frame).
- **Large instanced shadow casters draw as one batch per cascade.** Instances beyond the 64-matrix uniform array ride a per-instance vertex-attribute buffer: Shadowstep Gauntlet's village frame fell from 127 to 107 draw calls. Gameplay props and flat decals (strike targets, gates, cells, hazards, kickers) no longer cast in Ion Circuit (133 to 69 draw calls) and Saltwind Highway (215 to 110 with one cascade).
- **Sun shadows are back in Saltwind Highway and Craterline GP** (custom road, terrain, track and prop surfaces receive through `a3d_shadow`; mean luma within 0.1 of the no-shadow frame; `?shadow=0` restores the previous look).
- **Fix: GL feedback loop (0x502) when a custom receiver and an alpha-masked caster shared a frame.** The depth pass left `u_baseColorTexture` unbound for alpha casters without a map, so it read texture unit 0, which a custom receiver program fills with the cascade's own depth texture. The depth pass now binds an empty texture.
- **Consumers can bundle the engine without top-level await.** The published solver init was a top-level `await`, which broke esbuild/Vite `es2020` targets and `iife`/`cjs` output (and, reachable from an import cycle, produced "Unexpected reserved word"). The default build is unchanged (`app.physics` stays synchronous); the new `aura3d-no-tla` bundler condition selects a lazy init, with `ensurePhysics()` and `physicsInitMode` exported from `@aura3d/engine/physics` and `@aura3d/physics`. `pnpm verify:no-tla` (in `verify:npm-release`) fails on any other top-level await in shipped dist, and `tests/unit/consumer-bundle/no-tla.test.ts` bundles the built engine at es2020/es2022, esm/iife, with and without the condition. The prd13 `run.ts` dev entry no longer awaits at the top level.
- **The Hoops, Diamond and Links athletes pass `aura3d assets validate --skin`.** The Hoops and Diamond athletes had up to 31x stretched triangles in the clips their games play; every stretched or flap triangle now has its own rigidly skinned vertices (`tools/aura-athletes/split-bridges.ts`), the rest pose and clips are unchanged. The Links golfer's mesh was baked with folded arms and a welded club (73x); it is now the Diamond body in the Links palette. Their `aura.skin-allow.json` entries are gone.
- **`assets repair-skin --refit-skeleton` repairs textured single-mesh rigs; Bunker Zero and Slingshot Siege characters no longer tear.** The Meshy auto-rigs of the Bunker guard, gunner and warden and the Slingshot Siege hero gull and raider boss were bound to a template skeleton whose joints sat 10 to 30 cm off the mesh (up to 302x triangle stretch in the clips the games play). `--refit-skeleton` moves each joint to where the mesh bends, recomputes the inverse bind matrices, keeps knees in front of the hip-ankle line and re-targets the clips by world delta; `--keep-clips` ships only the clips the game plays; `--smooth-rounds`, `--smooth-rings` and `--smooth-threshold` tune the weight smoothing. Worst stretch is now 1.8x to 2.3x with 3 to 9 triangles past 1.6x (allowance 0.1%), no flaps. The Bunker hound (a quadruped on a humanoid skeleton) is re-rigged as a bounding body with `tools/skin-fixes/bounding-quadruped.ts` (1.16x). An Aura FC "gallerySecurityGuardMeshy" asset that no game used was deleted. `aura.skin-allow.json` lists none of them any more.
- **Example dev server no longer serves an unparseable esbuild bundle.** A game whose graph reaches `@aura3d/physics-rapier` (top-level `await` in an import cycle) got `await` inside non-async wrappers and failed with `Unexpected reserved word`; the server now parses each bundle and falls back to per-module serving. dot-dash-3d now mounts in the harness; the deployed site was never affected. New `dot-dash-page-error` spec; luma shards fail on any page error.
- **`aura3d assets validate --skin` and `assets repair-skin` catch and repair the rig defect that tore the Aura FC athletes.** The check poses every rigged GLB through the clips it ships and fails on stretched triangles (`SKIN_STRETCH`), thin flaps (`SKIN_FLAP`), bad or distant weights, a mesh modelled in another pose than its skeleton (`SKIN_BIND_MISMATCH`) and impossible humanoid joint ranges, per material, with JSON output and stable codes. `validate --release`, `check-deploy --release` and `tools/game-checks` (new global `skin` check) run it; known defects ship in `aura.skin-allow.json` with a required reason (11 Meshy rigs in 6 games today, F11 and F12 in `docs/audit/game-leftovers.md`). `repair-skin` offers opt-in normalise, prune-distant, smooth-bridges and cut-stretch steps, and `--rebuild-limbs` rebuilds the legs of a recognised humanoid (the FC fix, generalised and scaled to the rig: it reproduces the shipped FC striker triangle counts). Exports `analyzeSkin`, `repairSkin`, `rebuildLimbs`.
- **`createHandBounce` and `measureHandBall` in `@aura3d/engine/game`: a ball that is really dribbled by hand.** Promoted from the Aura Hoops dribble. One phase cycle drives the ball (centre exactly at `floorY + ballRadius` at the bounce) and the palm target, positioned from the palm as rendered; standing and running profiles; `overlay()` returns upper-body-only bend (never leg bones); `release()` hands the ball over at the hand with its own velocity, `pickup()` takes a loose ball; fixed-step and deterministic, `state()` for probes. `measureHandBall` reports palm-to-ball at the meet and the floor contact, floor error and maximum distance against the Hoops limits. Aura Hoops now runs on the kit (behaviour and numbers unchanged). Docs: `docs/api/motion-hand-bounce.md`, recipe 6, build-a-game table, skill reference.
- **PostGraph v2: chain frames tone-map and encode in the `OutputPass`.** A chain whose remaining descriptors are bloom and tone mapping now runs the HDR stages, an HDR bloom into a pooled rgba16f target (`presentHdrBloom`), then the shared `OutputPass` (one operator, one sRGB encode, a linear-light vignette) instead of the fused native tone program. Software-WebGL2 three-scene mean luma equals the old route within 0.1, Aura Slam G3 passes (117 to 125 draw calls), and 25 games measured before and after differ by at most 3.9% on one animated frame (20 identical): `evidence/post-graph-migration/`. `OutputPass` gained a vignette and a full-coverage option. On chain frames the agx, neutral and cineon operators now use the same three.js r185 ports as the no-chain route (the fused program used approximations); aces, linear and reinhard are unchanged. Chains with a legacy colour-grade, FXAA, SSR or outline descriptor keep the fused present. `effects.*` is unchanged.
- **Iron Crown: Boulder Kane, Seraph Lin and Sovereign no longer have photographic faces.** Their baked atlases carried realistic faces (a recognisable-looking wrestler, a woman in a surgical mask, a helmeted knight). `tools/iron-crown-restyle/flatface.mjs` now gives each a flat stylised face (own skin, hair, brows, eyes, scar or lash lines) in the same style as Kenji and Mara; Seraph's mask and Sovereign's helmet keep their original material. Skeleton, the 10 fight clips and every non-head triangle are unchanged, and the GLBs got slightly smaller (the tool now prunes orphaned accessors). Jinx Oko keeps his painted mask face, which is already stylised.
- **`material.custom` receives the sun shadow.** Set `receiveShadow: true` on the spec (or `#include <a3d_shadow>`) and multiply the lit term by `a3dSunShadowAuto(worldPos, normal)`; `a3dSunShadow(worldPos, normal, toLight)` takes the light direction yourself. The light's cascades, bias, normalBias and filter apply exactly as for PBR surfaces, and the factor is 1 with no shadow map. Serpentine Sky Run, Saltwind Highway, Ion Circuit and Craterline GP use it.
- **Fix: a sky dome as a caster darkened the whole frame (Shadowstep Gauntlet's "shadow darkens everything" report).** The 4000 m sky sphere cast into the sun cascades, so every receiver was shadowed. Non-instanced casters larger than 4 shadow distances (floor 100 m) are now skipped and reported as `shadow.caster.oversize:<label>` in `droppedFeatures`. Measured on the real scene: mean luma with the sun shadow 157.46, identical to the no-shadow 157.46 (it was 142.79).
- **Sun cascades fit the camera slice, not the casters.** Casters no longer widen a cascade's x/y (a scene-spanning instanced set inflated every cascade to kilometres, so shadows were 1 m blobs); they only extend the depth range toward the light, capped at 8 slice radii (min 200 m). The cascade slice now uses the view-projection's own clip range when the caller's `near`/`far` disagree with it.
- **Cumulus Dash: the hero's feet now plant at every running speed.** The Meshy run clip plants a foot at 3.3 m/s while the sim runs 14.5 m/s (up to 19.6 boosted), so 4.2.0 still slid (planted-foot p95 3.4 to 8.5 m/s on the library `createFootSlideMeter`). `gait.ts` drives hips and both legs by two-bone IK from 2.2 m/s up: stance feet pinned to the ground, cadence from speed, a straight-up/zero-speed/straight-down swing foot, hip dip and lean; the arms stay locked to the stride, the finale walk runs the same gait at its real 8 m/s, and each side uses its own bone lengths (the Meshy skeleton is asymmetric). Planted-foot p95 is now 0.00 to 0.02 m/s at 4.2 to 19.6 m/s at 30, 60 and 120 Hz (threshold 0.15), with 27 to 140 planted samples per foot over 8 s so the feet really land. Sim values and replays unchanged. The unlistened part is the look: frames were read from the real game on software GL, not a real GPU.
- **Shadowstep Gauntlet art pass: the placeholder scenery is replaced with ten generated models.** Four house designs (stone cottage, timber townhouse added), market stalls, a two-tier teahouse, granite and sandstone valley cliffs, mossy boulders, shrubs, a forested horizon ridge and rail fences replace the box houses and stalls, flat-faceted cliff planes, cone tufts, low-poly rocks, sphere hills and stone-slab fences. Render-only (course, colliders and replay unchanged); draw calls go down by 2 to 4 per frame, model files grow from 17.5 to 28.3 MB (lazy loaded). Frames in `evidence/ninja-runner-port/art-pass/`.
- **`warmPrograms` waits for pending texture upgrades.** A material that gains its texture switches to a textured program variant that compiles asynchronously, so a ground or facade could drop out of frames after the game believed it was settled. New options `waitForTextures` (default true) and `textureTimeoutMs`, and `textureFrames` / `texturesReady` on the result, mirror the HDRI wait. Behaviour is unchanged when nothing is pending. Gridlock Courier also fixes `roadPlane(cells)`, which mis-mapped the lane paint for most cell counts (the shipped single quad was right); the road-flip report itself did not reproduce, see `evidence/drift-and-deliver-port/road-fix/README.md`.
- **Teleoperator art pass: original vehicles and real buildings.** The hero (a rounded driverless shuttle pod), hatch, notchback sedan, wedge coupe, van, pickup and box truck are regenerated through Meshy so none reads as a specific real car, with emblems the generator invented covered and checked on orthographic renders of every side. The 16 single-colour box buildings are now four generated building models (Victorian townhouse, brick mid-rise, glass tower, art-deco tower). GL draw calls per frame went from about 691 to 630; software-GL wall-clock per frame is higher (unreliable across workers, no real-GPU run). Render-only; `showcase-teleoperator-v2` keeps box buildings. Provenance and numbers: `evidence/teleoperator/art-pass/`; recaptured screens and card in `evidence/teleoperator/screens/final/`. Meshy credits for the `teleoperator` tag went from 255 to 735 (uncapped by owner decision).

- **Red Zone 3D is removed (25 live games).** The football game had no real playable loop, so it is deleted rather than kept: the app, its route and card previews, its eight Meshy model entries (`rzQuarterbackMeshy`, `rzDefenderLinemanMeshy` and the stadium props) in `aura.assets.json` and `src/aura-assets.ts`, their files in `public/aura-assets` and `aura-evidence/meshy`, and its browser specs. `/apps/showcase-red-zone-3d/` now redirects (308) to the homepage. The generated inventory, showcase index, sitemap and `llms*.txt` read 25 games.
- **Aura Hoops dribble: the ball now stays with the hand and the floor.** The cycle drove the ball from the IK target palm, but the arm (0.55 m reach) never got below about 1.0 m, so at the bounce the ball was about 0.9 m under a hand that stayed high. The handler now sinks into a crouch (hips 0.28 m with folded knees, feet planted) during the push and holds it until the ball has met the floor, the palm heights fit the arm's reach, and the ball rides, leaves and is caught by the palm as rendered (forearm bone). Floor contact is centre-at-radius. `?diag=1&qaDt=` fixes the sim step for measurement; the beacon adds `handProbe`. New probe: `tests/browser/hoops-dribble-probe.spec.ts`. The running dribble gets an upper-body-only overlay (waist bend that deepens into each push, shorter period, lower apex, ball landing ahead of a low hand) that leaves legs and foot-slide on the run clip: palm 1.0 m to 0.61 m high at the floor contact, palm-to-ball 0.9 m to 0.54 m.
- **Fix: frames with `effects.vignette()` are no longer 25 to 40% darker.** Measured on software WebGL2 (three scenes, `tests/browser/post-luma.spec.ts`, `evidence/post-graph-migration/`): bloom changes the mean luma of a frame by under 1%, tone mapping already ran once, and the darkening was the vignette, which multiplied display-referred bytes in the LDR tail after the tone map. It now multiplies linear light inside the single tone-map and encode stage (PostGraph v2 `OUT`), so `effects.vignette({ intensity: 0.16, smoothness: 0.65 })` costs about 6% to 18% of mean luma (was about 27%) and keeps more saturation. Frames with no vignette are unchanged (identical mean luma and chroma in the probe). The `effects.*` API is unchanged. Software-GL evidence only; check on a real GPU.
- **Removed: the `POSTPROCESS_V2_UNMIGRATED` console warning and skip record.** Any configured chain used to be labelled "unmigrated" even when PostGraph v2 ran it. A chain v2 cannot run (`compat.post: "3.0"`, `-post`, WebGPU, `cpu-deterministic`, passes the fused LDR set cannot order) is now reported as `post-legacy-route:<reason>` in `diagnostics().output.postSkipped` and `diagnostics().post.skipped` (`POSTPROCESS_LEGACY_ROUTE:<reason>`), with no console output.
- **Meshy spend is uncapped (owner decision, 2026-10-25) and `aura3d meshy ledger` reconciles against Kiro Prism.** There is no default per-game or global cap: credits are tracked for visibility and the only automatic stop is a zero Prism balance. Caps are opt-in (`--cap`, `--game-cap`, `--global-cap`, `AURA3D_MESHY_GAME_CAP`, `AURA3D_MESHY_GLOBAL_CAP`, `config --global-cap N|off`) and, once set, hard-stop with the credits left and the flag that raises them; `reserve --dry-run --op preview,refine,rigging` prices a chain without writing; `settle --exit-code 6 --error-text` counts a 429 on a poll (task exists) and not a 429 on a create; `baseline` and `reconcile` compare the ledger with the Prism pool (`--apply` books the delta); `config` stores or removes opt-in caps in the ledger. The ledger lives at `~/.aura3d/meshy-ledger.jsonl`, not `/tmp`. The reconciliation (ledger 4,530 vs Prism 4,855, +325) is in `docs/audit/meshy-reconciliation.md`; the game-checks `meshy-cap` check reads this ledger and prints credits per tag as information only (never a warning).
- **Saltwind Highway (Roadster Hours) vehicles are back on `batched.mesh`.** All 68 traffic and lineup vehicles are batched instances again (one textured batched mesh per generated model, baked cars per material group, rigs in their own mesh); the per-model `instances.custom` nodes and the instance pool are gone. Software WebGL2: 65 draw calls with every vehicle shown before and after, same GL frame, replay unchanged. Multi-draw needs the engine batching tier (`A3D_QR_TIERS_BATCHING`, off by default), so the spec bounds the vehicles at one draw per pooled geometry when it is off.
- **Shadowstep Gauntlet sun shadows stay off, with the reason recorded.** Re-enabling the cascaded sun shadow (111 draw calls against 56) darkened every lit receiver by about 8 mean luma points whatever the casters, cascades, fit, bias or filter (`evidence/ninja-runner-port/parity-closeout/`); an engine-side directional receive defect, still open.
- **`aura3d meshy ledger` is now a hard stop and reconciles against Kiro Prism.** A tag past its cap (default 420, `--cap`, `--game-cap`, `AURA3D_MESHY_GAME_CAP`) or the global cap is refused with the credits left and the flag that raises it; `reserve --dry-run --op preview,refine,rigging` prices a chain without writing; `settle --exit-code 6 --error-text` counts a 429 on a poll (task exists) and not a 429 on a create; `baseline` and `reconcile` compare the ledger with the Prism pool (`--apply` books the delta); `config` stores the caps in the ledger. The ledger lives at `~/.aura3d/meshy-ledger.jsonl`, not `/tmp`. The reconciliation (ledger 4,530 vs Prism 4,855, +325) is in `docs/audit/meshy-reconciliation.md`; the game-checks `meshy-cap` check reads this ledger.
- **Ports and index games use the library kits instead of local copies.** Ten port model tables (Splat Rush, Drift and Deliver, HEATSINK, Cloud Runner, Last Train, Ninja Runner props, Serpentine Sky Run, Strange Orbit, Where the Wind Wanders, Silt and Signal) are declared with `defineModelAssets` (same-origin URL, sha256, format, bounds and licence unchanged; a unit test compares every ref against the hand-written tables). The shared `apps/showcase-port-shared/blackframe.ts` and Drift's `blackframe.ts` are gone: every game imports `installBlackFrameGuard`, `createBlackFrameWatch`, `healParams` and `healStage` from `@aura3d/debug` (Drift keeps its own storage key).
- **More port audio runs on `createCueBank`:** all eleven Roadster Hours effects, the seven Last Train event cues, five Ninja Runner effects and thirteen Strange Orbit tone cues, each with a parameter-level equivalence unit test (oscillator types, start times, gain envelopes, glides; noise filters and samples for Roadster Hours). Nobody listened to them. Noise-bearing, stereo-panned and continuous voices stay hand-written (`docs/audit/game-leftovers.md`).
- **FC athletes rebuilt: intact shorts, straight believable legs and clean arms (striker and goalkeeper).** The Meshy mesh was modelled mid-stride (knee bent, thigh swung forward, spine bent about 30 degrees, arms bent) but bound to a straight skeleton, so every clip rotated the legs and arms about joints 10 to 20 cm from the limbs and the shorts, thighs and sleeves tore into shards (the run-cycle joint ranges were never the cause). `tools/aura-fc/rebuild-legs.mjs` rebuilds the lower body and `rebuild-arms.mjs` the upper body in the straight pose: thigh, shin, forearm and upper-arm skin tubes, thigh shorts, pelvis skirt, ankle socks, shoulder caps, kit sleeves and mitten hands around the real bone axes with smooth hip, knee, ankle, shoulder and elbow weights, boots flattened under the shin, torso and head stood upright. No triangle of any material stretches past 1.6x in any of the 26 clips in the files (before: 327 past 1.6x on the striker, worst 120x); each athlete is still 6 materials and the GLBs shrank from 2.4 MB to 1.8 MB. Also `raster.mjs` (GPU-free posed silhouettes), `gait-limits.mjs`, `swap-asset.mjs`, `bridge-cut.mjs`. Hoops, Diamond and Links athletes have the same mismatch and are unchanged (docs/audit/game-leftovers.md F11).

## 4.2.0 (2026-10-25)

- **Animation Studio no longer calls the retired asset-index worker.** `animation-scene cast add --query` and `prop add --query`, and `build-clip-library`, now resolve from open licence-clear sources at build time through `aura3d assets search` (new `scripts/open-source-search.ts`; the template depends on `@aura3d/cli`). Accepted files keep the licence and author the provider reported (no more hard-coded `CC-BY-4.0`), the sha256, rig grading and weight-normalising loader. When nothing matches, the command says so and names the next steps: `--file ./rigged.glb` / `aura3d assets add`, or Meshy with `--allow-meshy --budget N` (opt-in, never a silent fallback to a network endpoint). Cast provenance is now `open-source-resolved` or `meshy-generated`; documents that say `catalog-resolved` still read the same.
- **Athletes and Links polish:** round eyes with a pupil instead of dark bars, one clean waist line and 6 mm hems, smooth normals and matte cloth on the Hoops, Diamond, Links, FC and Red Zone athletes (fit to each shipped model); the Links camera frames the golfer on phones; matte golf cart. Diamond bat grip: bone attachments now read the final pose and the grip is measured frame-matched (knob to palm 2 to 5 cm for most of the swing; the held-swing run still shows 17 cm at 0.476 and 14.6 cm at the end of the follow-through, see `evidence/aura-diamond-3d/rework/grip/README.md`).
- **Group B last fixes (layout, material, palette).** Gridlock Courier: a phone layout (minimap under the score at the top right, speed readout bottom right, nitro bottom left, so nothing overlaps) and a cleaner hero car: glass, light and underside regions only apply to outward-facing triangles of the double-shell mesh (inner-shell fragments take the body colour) and the paint carries a subtle vertical COLOR_0 gradient. Craterline GP: the phone title screen has a backdrop panel and an anchored tagline, and the track paint is world-space triplanar noise, so there is no directional streak stretch. Serpentine Sky Run: the default runner is a teal suit with silver trim (the orange gi and teal sash are gone), the surge shell is far less solid and the emissive wash is lower so the runner is no longer washed out, and the Slide, Fly and Surge touch buttons are 48 px, high contrast, with a shape icon. Chroma Roll: the start card fits a 390 px viewport. Ion Circuit: the countdown sits at the top centre and the objective card hides while it shows.
- **Links, FC and the repainted athletes: stroke counter, bag, cart, faces, hems, kits, referee, camera.** The Links stroke counter climbed to about 19 per swing because the swing meter reports `committed` on every frame of the downswing; `commitStroke` now counts one stroke per shot. The golfer "bag" was a basketball ball rack (now a plain bag) and the golf cart's baked shard atlas is repainted flat. `tools/hoops-athlete-retexture/retexture-face.mjs` repaints the 15-joint athletes with clean hems and a flat face (Hoops, Diamond, Links, Red Zone, FC); FC keeps named materials so team tints work, and its skin weights are now smoothed over the whole mesh (triangles past 2x stretch: 750 and 869 down to 140 and 12; worst case 120x down to 5.2x). FC tints shorts, socks and skin per team, the referee is the player body in a yellow and black kit instead of a sci-fi guard model, and the broadcast camera is tighter (9.5 m up, 20 m back, 38 degrees). Verified by unit tests and CPU model renders; in-game frames are software GL where noted in `evidence/<game>/rework/play-fix/`.

A feature release: the games get real physics, animation and objectives, every game has its own name, render interpolation makes 120 and 144 Hz displays smooth, photographic and brand textures are gone from served assets, and the library gains the kits those fixes needed. It also carries the fixes that were planned as 4.1.4 (Hoops freeze, Cumulus Dash 2x crop, partial first frame, neutral-environment 404, canvas growth, `onFrame` errors). Everything here was verified on software WebGL2 unless a line says otherwise; none of it is real-GPU evidence.

### Fixes

- **Bone attachments follow the final pose of the frame.** Overlay poses, IK and procedural bone overrides written after the clip only dirtied local transforms, so `handle.attach`/`attachToBone` sockets and `socket(bone)` reads used the clip pose: a held item (the Diamond bat) left the hands as soon as a procedural swing diverged from the clip. The bone lookup now refreshes the actor's world transforms (dirty-tracked) before reading. Test: `tests/unit/agent-api/actor-bone-attach-pose-order.test.ts`.

- **Asset search keeps working when the hosted index is down, and returns relevant models.** `aura3d assets search` and `resolve` now always run the open zero-auth sources (Khronos samples, Poly Haven, jsDelivr CC0 mirror of Kenney and Quaternius, OS3A) beside the hosted index, so a dead index no longer leaves only the built-in starter pack; texture sets, HDRIs and images are hidden from model queries unless the query asks for a surface or environment; and catalog popularity or screened-hero bonuses no longer rank an asset that matches no query term ("Garbage Truck" no longer appears for "sword"). On 20 realistic prompts, a clearly relevant first result went from 3 (published 4.1.3, which also logs `asset-index fetch failed 404`) to 13. Also fixes a `"polyhaven"` vs `"poly-haven"` adapter id mismatch. Audit and the asset resolution plan: `docs/audit/asset-catalog-claim.md`, `docs/workflows/asset-resolution-plan.md`. The hosted index Worker itself is not deployed (see the audit).

- **Gridlock Courier: the road no longer goes missing in the first frames.** `await app.ready()` settles the mount, not the shader programs: programs compile asynchronously and a draw whose program is still compiling is skipped, so the first frame the player saw drew 47 of its 113 draw calls (no road). It is intermittent and not tied to canvas size (three 1440x900 loads were bit-identical; a cold 1280x720 load had no road). New `warmPrograms(app)` in `@aura3d/engine/game` settles the programs, steps a frame so the renderer kicks the exact feature records, settles again, then steps frames until the draw-call count is stable (`diagnostics().drawCalls`); the port awaits it before it marks itself ready and exposes `settle()` on its QA hook for captures after a teleport. `?warm=0` keeps the old behaviour for diagnostics. Regression spec: `tests/browser/fixgrid.spec.ts`. Every other game that renders right after `ready()` has the same exposure. Not fixed here: after a long jump the road can still flip in and out of consecutive frames on a loaded software-GL runner (cause not found), and the hypercar still reads as translucent (texture smoothing and a paint override had no measurable effect); both are written up in `evidence/drift-and-deliver-port/rework/render-fix/README.md`.
- **`warmPrograms` also waits for a pending environment HDRI** (`waitForEnvironment`, `environmentTimeoutMs`; the result gains `environmentFrames` and `environmentReady`). When the HDRI lands every material switches to its image-based-lighting program variant (the diagnostics showed `programs.reused` jump from about 1,500 to 3,000), which dropped frames after a game believed it was settled.
- **Fix: with `resize: false`, a canvas backing size set after mount no longer leaves the picture in a corner of the buffer.** The renderer's viewport and targets were sized from the backing store at mount, so a game that capped its own device pixel ratio after `app.ready()` (Cumulus Dash at 1.5 on a 2x display) drew into 720 of 1080 pixels: the 3D view filled the lower-left two thirds of the frame. The frame loop now forwards a changed backing size to the renderer (`authoredBackingResize`). Cumulus Dash itself now lets the engine size the canvas (`pixelRatio` capped at 1.5, no hand-written resize), so it also follows a window resize, which the pinned inline CSS size used to block. This class of bug is also present in code released as 4.1.3 (Cumulus Dash on any display with a pixel ratio above 1).
- **A renderer mount failure that is not strict now prints `RENDERER_MOUNT_FAILED` to the console.** One model failing to load (a 404 on a GLB) rejects the whole mount, `app.ready()` still resolves in non-strict mode, and the page showed a black canvas with only the browser's "Failed to load resource". The text was already in `app.diagnostics().errors`; it is now also one `console.error` line that says nothing will draw and points at `strict: true`. Apex Overdrive, with its `/aura-assets` GLBs blocked, reproduces the black canvas; its GLBs are tracked and ship in a clean deploy, so the live site is not affected unless an asset request fails. This behaviour (one failed model blanks every node) is unchanged and is in code released as 4.1.3.
- **Fix: a throwing `app.onFrame` callback no longer stops the frame loop.** The exception used to unwind the render loop, so nothing was drawn again and the page stayed blank (found by the cold-start agent trial: a cube whose `onFrame` called `app.nodes.require("cube")` on a node without `.runtime({ id, mutable: true })` rendered black with 0 draw calls). The error is now caught per callback, reported once as `onFrame callback threw: ...` (console and `diagnostics().errors`), and the other callbacks and later frames keep running. Unit test `tests/unit/agent-api/on-frame-errors.test.ts`.
- **Fix: a canvas beside a HUD no longer grows until nothing draws.** The app sizes its canvas to its parent. When the parent is an auto-height `<body>` or wrapper that also holds a HUD `<div>`, every resize grew the parent and so the canvas again, until the backing store passed GPU limits and the frame was black although draws were issued (the cold-start game-loop task, 2 of 3 runs). `createParentFit` now detects a write that moves the parent and keeps the mounted size on that axis; parents with a definite size are followed as before. Passing `resize: false` is no longer needed as a workaround. Tests: `tests/unit/parent-fit`.
- **Fix: published-package apps no longer request `/aura-environments/neutral.*` (a 404 and a console error in every app).** The baked `neutral` environment is embedded in `@aura3d/rendering` as its own lazily loaded chunk (gzip + base64, decoded with `DecompressionStream`) and applied with no fetch; other presets still load from `/aura-environments`. The embedded copy keeps 5 significant mantissa bits on mip 0 (the sharp reflection) and 4 on the blurred mips, which is comparable to the bake's own Monte-Carlo noise (about 1.7% neighbour difference), so the chunk is 141 KB raw (about 100 KB gzip) and not the 703 KB of the first version: the stock cube app is 3,395 kB raw / 1,062 kB gzip against 3,258 / 963 on 4.1.3. Tolerance, enforced per texel in `tests/unit/environment-embedded`: at most half a quantization step against the smallest normalised max-channel mantissa (3.5% of the texel's peak on mip 0, 6.6% on the other mips; mean error under 1.5%). Frames on software GL (two scenes, same build otherwise): Silt & Signal rings differ by 0.074/255 mean absolute (0.04% of pixels by more than 8 levels, max 50, mean luma 76.441 to 76.442); Ninja Runner differs by 0.229/255, the same as two runs of the unchanged build against each other (0.226/255), so it is animation timing, not the environment. Regenerate with `node tools/environments/embed-neutral.mjs`.
- **Fix: a `material.custom` fragment that declares its own `precision highp float;` no longer fails to compile.** The engine only injected a default precision when the author had none, but its own prelude (`uniform float ...`) sits before the author's line, so the shader failed with `No precision specified for (float)` and the object drew nothing (found by the cold-start water task). The default is now always declared first; a later author declaration still governs their code. Tests: `tests/unit/custom-shader-precision`.
- **Fix: `fetchBytes` tolerates a response without `headers`** (two HDRI loader tests failed on stubbed fetches).

### Games
- **Gridlock Courier: the player car is a new solid hatchback.** The old Meshy car was thin overlapping plates with gaps, so the interior showed through whatever material it wore. It is replaced by a freshly generated compact courier hatchback (text prompt only, no marks): one closed shell (0 open edges), 37.5k triangles, 1.8 MB, baked to the port's car convention by `tools/gridlock-courier-bake/bake.mjs`; the retexture tool for the old car is retired. Sim, collider and steering are unchanged.

- **Links, FC and the repainted athletes: stroke counter, bag, cart, faces, hems, kits, referee, camera.** The Links stroke counter climbed to about 19 per swing because the swing meter reports `committed` on every frame of the downswing; `commitStroke` now counts one stroke per shot. The golfer "bag" was a basketball ball rack (now a plain bag) and the golf cart's baked shard atlas is repainted flat. `tools/hoops-athlete-retexture/retexture-face.mjs` repaints the 15-joint athletes with clean hems and a flat face (Hoops, Diamond, Links, Red Zone, FC); FC keeps named materials so team tints work, and its skin weights are now smoothed over the whole mesh (triangles past 2x stretch: 750 and 869 down to 140 and 12; worst case 120x down to 5.2x). FC tints shorts, socks and skin per team, the referee is the player body in a yellow and black kit instead of a sci-fi guard model, and the broadcast camera is tighter (9.5 m up, 20 m back, 38 degrees). Verified by unit tests and CPU model renders; in-game frames are software GL where noted in `evidence/<game>/rework/play-fix/`.
- **Teleoperator, Iron Crown and Cross Hop last fixes (game-rework).** Teleoperator's fare card is a compact collapsible bottom sheet on phones (14.8% of the height, 4% collapsed) and its name tags move clear of panels and of each other with a leader line (0 overlaps measured, was up to 2,800 px^2). The robotaxi is repainted into flat region materials with recomputed smooth normals (33.5k triangles, no baked atlas). Iron Crown's fighters Kenji and Mara get flat stylised faces (`tools/iron-crown-restyle/flatface.mjs`), and phones show first names on the health plates. Cross Hop gets the shared quick bar with six world buttons. Software-WebGL2 checks only.
- **Dot Dash 3D is now Glint Courier, its own game.** The arcade-derived maze layouts (Relay Grid, Smelter Rows, Overgrowth) were redrawn and the other boards renamed. The hero is a faceted drone with a spinning ring, the four sentries have distinct silhouettes (cone, cube, ring, saucer), pickups are datachips and surge cells, the bonus items are gems, the palette is a graphite board with amber and cyan traces, and the title, HUD, mode and message wording is new. The 11 unused Meshy models (6.4 MB) and their manifest are removed. The simulation and its rules are unchanged; sounds are still the shared library effects, not new cue-bank parameters.
- **Gridlock Courier: the hero car no longer reads as see-through, and the terrain no longer lies under the road.** The hero car's Meshy GLB baked glass, interior and reflections into a shard atlas on a shell with a second layer of inward-facing triangles, so it looked translucent; `tools/gridlock-car-retexture/` splits the same mesh by region (body, glass, tyres, rims, lights, underbody) into flat PBR materials: geometry unchanged, 2.46 MB to 1.73 MB, no textures, no credits (car region mean luma 144 against 92 to 94 before; software GL). The model's `envMapIntensity` override never reached it (it writes the legacy ambient uniform, not the image-based reflection term), so the paint override is gone. The terrain around the road is now a frame around the road square instead of a plane 3 cm under it (hardening against a depth tie; the intermittent road-less first frames were **not** reproduced with either layout, so their root cause is still open, see `evidence/drift-and-deliver-port/rework/render-fix/README.md`).
- **Group C visible names and mobile layouts.** The Bellkeeper's Walk title card no longer shows the old name; Cumulus Dash drops the inspiration-derived title, chapter name ("Mount Paozu" is now "Cumulus Ridge") and "star orbs" (now "sky pearls"); Apex Overdrive loses a stale "AURA3D 4.0" pill. At 390x844, Duneglide, Saltwind Highway, Lamplight Line and The Bellkeeper's Walk no longer overlap their own HUD panels; Duneglide gets a real results card (time, lamps restored, field notes, impacts, rating). Apex Overdrive now fills the viewport (the canvas had no CSS size and stayed 1280x800), its quick-switcher is a single scrolling row at the top, and the Meshy box truck and carrier are width-fitted to the lane (the box truck was 1.72x wider than its sim width). The Cumulus Dash runner palette changed (teal tunic, gold sash, plum hair) with `tools/kid-goku/recolor-hero.py`. Evidence in `evidence/<game>/rework/ui-fix/` (software WebGL2, not real-GPU).
- **Sports games: Diamond, Hoops, Links, Red Zone and FC use the shared quick bar; overlaps fixed.** The bar is one sideways-scrolling row (never three or four rows over the scoreboard on a phone) and carries one "Built with Aura3D" credit link; each game's HUD now sits below it. Diamond's strike zone is an outline, not a grey slab over the batter. Red Zone's play-call cards are a compact strip with a collapse toggle, and the sheet is rebuilt only when it changes (it was rebuilt every frame, which could swallow clicks). Hoops' intro message also ends on wall-clock time so it cannot linger on slow frames. Slingshot Siege keeps its own bar but it no longer wraps, and the ammo tray sits above the hint footer.
- **Bunker Zero: the pistol is a pistol, and enemies and pickups keep their textures.** The `pistol` viewmodel was the pulse-rifle model; a sidearm was generated through Meshy (30 credits, admitted with sha256 and provenance) and a single table (`src/weapons-view.ts`) now picks the model in hand per weapon, with a test that no two weapons share a model. Seven near-black models (gunner, guard, hound, warden, armor, crate, barrel) get Bunker Zero-local copies with the base-colour atlas lifted (`tools/bunker-zero-lift/lift.mjs`), and the pickups' full-material replacements are texture-preserving tints. Evidence: `evidence/showcase-bunker-zero/rework/content-fix/`.
- **Duneglide: QA hooks refresh the HUD.** `stepFrames`, `replay` and `render` left the speed readout at its last live value (0 in manual runs while the rider flew at 41 m/s). Live play was already correct.
- **Five games: old names and "port" wording gone from the UI, HUD overlaps fixed, scenery stretch and track smear reduced.** Chroma Roll's title card, Craterline GP's title screen, Serpentine Sky Run's title text and two taglines no longer name the games they were inspired by. Ion Circuit hides its HUD and countdown behind the title card and wraps its top row under 900 px; Craterline GP's standings list and banner sit below the top row; Chroma Roll's popups start under the HUD and scale to the viewport width; Serpentine Sky Run's distance bar moves to the bottom on phones and the touch buttons hide behind its cards; Shadowstep Gauntlet's forms, abilities and sound pill stack in rows on phones. Meshy houses, towers and gates keep their proportions within about 1.6x (they were stretched up to about 3x, which smeared their textures), and the Craterline GP track's brush streaks are 5:1 instead of 10:1. Software-GL frames only; evidence under `evidence/<game>/rework/ui-fix/`.
- **Cross Hop: log, lily-pad and stone platforms no longer render near-black, and vehicle textures are 1024 px.** The instanced mover pools applied their colour twice (base material colour times per-instance colour, a `#8b5a2b` log came out `#472c14`); they now use a white base like the other pools. The ten vehicle GLBs (cars, tram, train) had three 2048 px textures each: 70 MB became 9.6 MB (`tools/asset-optimize/texture-downscale.mjs`), the app's assets went from 95 MB to 43 MB, and on software WebGL2 the game is ready in about 22 s instead of about 40 s and runs about 2.9 s per frame instead of about 3.7 s (the rest is software rasterisation; this is not real-GPU data). Evidence: `evidence/cross-hop/rework/content-fix/`.
- **Iron Crown: Kenji and Volt restyled, kit marker slabs removed, stage text made generic.** Kenji's baked texture is recoloured by colour family (`tools/iron-crown-restyle/recolor.mjs`): white gi to deep teal, red headband to hair, so he no longer reads as a known fighting-game character; Volt goes burgundy and amber. The fighting kit's debug-style nodes (camera safe-zone posts, centre aura beam, start-lane slabs) are replaced by spawn rings. `Bangkok Dock Market`, `Desert Airbase` and `Himalayan Monastery` are now `Lantern Dock Market`, `Dustline Airstrip` and `Cloudstep Monastery`. Evidence: `evidence/iron-crown/rework/content-fix/`.
- **Teleoperator: every vehicle is now an original, generic Meshy-generated design.** The Jaguar-style robotaxi with lettering, the Cybercab, Corvette, Cybertruck-style and roadster hero cars and the sedan, SUV, taxi, van, pickup and bus traffic models (photo-style atlases of real vehicles) are replaced by eight generated vehicles (robotaxi, compact hatch, sedan, sports coupe, delivery van, pickup truck, box truck, roadster; 14k to 38k triangles each, about 14.5 MB in total against about 59 MB before). Badges and door marks the generator invented were covered with plain discs, the traffic yaw now matches the new front-facing models, and the traffic sizes and collision footprints follow the new bodies (the box truck replaces the 11.8 m bus at 7.6 m, the hatch replaces the SUV at 3.9 m). `tests/unit/likeness-audit/teleop-vehicles.test.ts` locks the manifest hashes, the removal of the old files and a 42k-triangle budget; `qaSetYaw` is a new QA hook for framing a vehicle from every side. The Cable Car is not part of this swap. Evidence, prompts, task ids and credits are in `evidence/teleoperator/rework/vehicles/README.md`.
- **Kid Goku (Cloud Runner): the runner no longer reads as sliding.** The Meshy run clip plants a foot at about 3.3 m/s while the sim moves the kid at about 14.5 m/s, and the old playback rate left the feet delivering about 4.7 m/s. Cadence and phase now come from `createLocomotion`, a leg-bone overlay widens the swing up to 1.8x, and footstep dust fires on foot touchdowns. Feet are planted up to 10.7 m/s of ground speed; at full sprint about 23% of the ground speed still slides (measured from the clip constants, not rendered bones). Evidence in `evidence/kid-goku-beyond-the-clouds-port/rework/`.
- **Aura Hoops 3D: the game no longer freezes after the first basket, athletes are clean, shots are decided by the physics.** The juice hit-stop counted down on game time while frozen game time stands still, so the first made basket or dunk froze the simulation forever (found by a 10-minute remote run: 183 of 186 frames stuck in a dunk, 0-0); it now uses the library `createHitStop` on the frame clock. The athlete model's texture atlas tore single triangles across the whole map (shard artefacts, torn hems) and contained a photographic face, lettering and a brand mark; both athletes are re-skinned with a flat palette strip and boundary-subdivided region cuts (`tools/hoops-athlete-retexture`). Makes and misses come from the library impact kit: a 28-sphere rim ring and glass box resolve a ballistic shot launched with aim error from the release read (3000-shot Monte Carlo: 100% made at a perfect release, 99.3% green, 59% at 0.75, 27% at 0.55; rim rolls, rim misses, banks and airballs all occur); the ball integrates in fixed 1/240 s substeps with a compensated launch. The ball sits on the palm at contact at any speed (median palm-to-ball 0.209 m to 0.110 m), locomotion clips play at ground speed over measured clip speed, idle arms hang nearly straight instead of bowed. `@aura3d/debug` gains `createFrameErrorBoundary`. Evidence: `evidence/aura-hoops-3d/rework/`.
- **Teleoperator: cars are solid.** The player used to drive straight through traffic. Contact now runs through the impact kit (`createImpactWorld` in each car's own frame, hit-stop, camera shake, a synthesized hit cue and a spark burst), the speed change comes from the collision (no scripted slow-down), and the ride takes a penalty: comfort rides lose comfort, street rides lose a multiplier step and bounty. Rear-end, head-on and side hits at 8, 16 and 30 m/s each raise exactly one impact with zero penetration (`evidence/teleoperator/rework/`). The game has no replay, so no reference was regenerated.
- **Drift & Deliver no longer stands still on every second frame on 120 and 144 Hz displays.** The car, the traffic and the headlight beams are drawn between the last two 60 Hz simulation steps (`createRenderInterpolator`), and the chase camera follows that smoothed car. Measured with the real simulation and loop: at 120 Hz the old presentation drew an unchanged car on 479 of 960 frames, now on none. Teleports and wrapped traffic snap instead of smearing. Software-WebGL2 browser check pending; the refresh-rate harness is `tools/motion-audit/refresh-audit.mts`.
- **Every game has its own name.** The eleven games previously titled as ports now carry unique names (Craterline GP, Chroma Roll, Serpentine Sky Run, Gridlock Courier, Ion Circuit, Shadowstep Gauntlet, Lamplight Line, Saltwind Highway, The Bellkeeper's Walk, Duneglide, Cumulus Dash). Titles, UI, metadata, the index cards and the sitemap no longer say "port", "reconstruction" or name another game; each game shows one neutral "Built with Aura3D" credit. New public URLs are `/apps/<name>/`; the old `/apps/showcase-<slug>-port/` roots redirect (308). Mapping: `tools/showcase-port-pages/names.json`; record and name screen: `docs/workflows/game-names.md`.
- **Strange Orbit: solid scenery has consequences in zero-G flight.** Gate pillars and lintels, rim boulders and spires, the lander and the observatories are now colliders (built from the same frames as the meshes via `examples/strange-orbit-port/obstacles.ts`), and a rider flying up under the track bounces instead of passing through. Impacts run through the library `createImpactWorld`, hit-stop, camera shake and cue; one impact event and one penalised hit per contact (energy -10, combo reset, 1 s cooldown). Measured: 18 surface-and-speed cases and 3 underside cases, one impact each, none passes through (`evidence/strange-orbit-port/rework/`). Replay references unchanged.
- **Serpentine Sky Run no longer shakes on 120 and 144 Hz displays.** The 60 Hz simulation stepped the runner, its run cycle and the chase camera on some display frames and not on others, so the runner stood still on every second frame and the rigged runner flipped between its run and idle clips about 1,200 times in 10 seconds. The renderer now blends the last two simulation steps with the game kit's `createRenderInterpolator`, the run cycle follows the blended distance, and the procedural fallback runner's pelvis bob is nearly halved. Measured on the real simulation and fixed-step loop (`evidence/saiyan-snake-way-port/rework/`): per-frame speed variation 1.00 to 0.054 at 120 Hz, camera acceleration 0.48 to 0.0004 m per frame squared, clip flips 1,196 to 0 per 10 seconds. The simulation and its replay are unchanged.
- **HEATSINK has something to do: a strike layer on the Time Trial.** 16 sentry and heavy drones per lap hover over the road, 12 barrels are now shootable, and the player's existing heat-limited gun fires bolts (`F`, `J` or click). Kills score with a chain multiplier (x1 to x5, 3 s window), style points for boost pads, checkpoints and pickups, a clean-lap bonus, bronze, silver and gold medals at 16, 30 and 42 kills of 48 (finishing required), a score, multiplier and targets HUD, a stated objective from the countdown, a results screen with medal, accuracy and best chain, bolt tracers, bursts, camera shake and synthesised cues. Additive: the movement replay still matches the original within 1e-6, and the strike replay (reference movement with the gun held down) is pinned by its own hash. `examples/heatsink-port/{operation,audio}.ts`, `tests/unit/heatsink-port/strike.test.ts`, `tests/browser/heatsink-strike.spec.ts`.
- **Where the Wind Wanders: the traveller's feet now move at the pace of the ground.** The hero animator re-issued `play` with a fresh crossfade and a moving `captureTime` every frame, so the clip phase ran 2.4x to 3.8x too fast (planted-foot slide 5.5 u/s against 3.2 u/s of ground speed, ratio 1.72, derived from the recorded commands and the rig's forward kinematics). It now uses the library's `createLocomotion`, fed the real ground speed once per sim step with a pinned stride phase and a crossfade only on a gait change: phase rate exact, median slide 0.15 u/s (ratio 0.05). The authored walk clip still skates a little on its own (toe p95 about 0.5 to 0.65 u/s); stride warping or foot IK is the follow-up. Unit tests recompute the gait table from `hero.glb` and run the library foot-slide meter; evidence and frame strips in `evidence/where-the-wind-wanders-port/rework/`. Software GL only; real-GPU feel is the owner's to confirm.
- **Aura Links 3D: the golfer no longer reads as slanted, and the club head decides the strike.** The legs were children of the hips, so the hip hinge rotated them too: at address the thighs leaned 17 degrees and both ankles sat 0.23 m behind the stance, on top of 36.7 degrees of trunk flex. Two-bone leg IK now keeps the ankles planted with the knees bent toward the ball (about 32 degrees of flex), and the spine reads about 28 degrees from the hips with the head over the ball. The ball now launches when the club head's swept path meets it (`game/contact.ts`), with a timed fallback so a missed contact can never soft-lock the hole, and the club is attached through the library `attachToBone`. Software-GL frames only; real-GPU look is unchecked.
- **Ninja Runner: crates and beams are solid.** With the reworked contact rules (default in the game; `?rules=original` keeps the original's pass-through), an unavoided hit stops the runner, knocks it back (bump 0.55 m, crash 0.95 m past 21.5 m/s) and breaks the obstacle into physical debris (planks bounce, slide and fade); a dash or attack still breaks it cleanly. Feedback runs through the library impact kit (`createImpactFeedback`, `createHitStop`, `createCameraShake`): hit-stop, trauma shake, a tier cue. The original-rules replay is unchanged (`tests/unit/ninja-runner-port`, 86 tests).
- **Aura Diamond 3D: the batter holds the bat, fielders wear gloves, the bat helps decide the hit.** The game passed its hand-pose bones as arrays where the engine reads `{ x, y, z, w }` objects, so the arms never moved while the bat floated beside him; fixed, with the bat and gloves attached through `attachToBone` (a failed attach is now loud, the route-side fallback that put the bat on the ground is deleted). The pitch now reflects about the swinging bat's face (`batContact`, bounded to 14 and 9 degrees from the timing model), and the swing accelerates into contact instead of stopping there. Software-GL measurements in `evidence/aura-diamond-3d/rework/`; not real-GPU.
- **Aura FC 3D: the players now actually kick, and the doubled legs are gone.** Four causes, all measured. (1) The GLBs' `Shoot` clip is not a kick (the right foot travels 0.28 m at a peak 1 m/s), so the game drove procedural shorts and sock boxes through a real swing beside legs that barely moved: that was the double frame. The boxes and the procedural limb pose are removed; the athlete is one skinned body. (2) New `KickTap` / `KickPass` / `KickShot` clips are baked into both athlete GLBs with analytic two-bone leg IK (`tools/aura-fc/bake-kick.mjs`, no new Meshy credits): plant foot fixed (under 1.2 cm drift), boot back, accelerating through the ball, follow-through, boot tip inside the ball radius at the sim's launch fraction. The clip phase is the swing progress (`kickT / kickDur`), so the boot meets the ball on the exact frame the sim launches it (error under one frame across 95 simulated kicks) and a hit-stop freezes the swing. (3) The default animation path ignores `AuraAnimationSpec.speed`, so every clip speed the game set was a no-op and a planted foot slid 0.3 to 1.2 m/s; run cycles now advance with distance travelled (planted-foot slide RMS 0.05 to 0.11 m/s from jog to sprint, 0.14 to 0.35 m/s on the walk clip). (4) The pale slabs and flaps at the hips (the other half of the double-framed look) are bridging triangles the Meshy auto-rig left between body parts that move independently (left thigh to right thigh across the shorts seam, hand to hip); in a kick pose 328 triangles stretched past 3x and some past 100x. `tools/aura-fc/skin.mjs` softens the skin weights around them (no geometry removed): across the walk, run, sprint, kick, jump and tackle clips only 21 triangles of the striker (17 of the keeper) stretch past 2x and none past 5x. Sim fixes found on the way: the kicker now turns to face the kick line during the swing (up to 176 degrees off before) and is planted for it; a swing interrupted by a tackle, steal or stun no longer fires later as a phantom pass in a stale direction (seen 7 to 68 s after the swing in every simulated match); the AI no longer starts a swing during the kickoff countdown, where the ball launched a second after the animation ended. New unit tests `tests/unit/aura-fc-3d/` (29), a QA hook (`window.__AURA_AURA_FC_3D__`: `freezeAtKick`, `step`, `focusFastest`) and a remote filmstrip spec `tests/browser/rework-fc.spec.ts`. Known limits: the shirt colour is a whole-mesh tint (the shorts and socks kit blocks are gone until runtime nodes expose bone sockets); the library `createLocomotion` is not used because its midpoint clip switching and 0.6 rate clamp slide 3 to 7 times more than the game's switch points on this rig (numbers in `locomotion-sync.test.ts`); crosses still use the pass swing.

### Likeness and brand

- **Borrowed lore renamed at the source in Serpentine Sky Run, Shadowstep Gauntlet and Cumulus Dash; the runtime label masking is gone.** The three games no longer hide another game's character, move, item and place names behind `installNeutralLabels` (deleted, with `apps/showcase-port-shared/neutralLabels.ts` and Serpentine's `displayText` layer): every identifier, string, QA hook and test now uses the games' own names (for example Surge, Vital Seed, Grapple Staff, the Serpent Hall, Spirit, Spiral Orb, Beast form, Lantern Village, Sky Pearls, Glider, Cumulus Ridge; QA globals `__AURA_SERPENTINE_SKY_RUN__`, `__AURA_CUMULUS_DASH__`, `__lanternhold`). Behaviour is unchanged: all 247 unit tests of the three games pass and the replays still match the captured original runs, which stay as captured; `tests/unit/_support/legacy-names.ts` maps the captured names in tests only, and `courseDigest` takes an optional type-name mapper so the Shadowstep test reproduces the captured digest exactly. Also: hand-typed `engineVersion` strings dropped (Hoops, Diamond, Links, Red Zone, Teleoperator), licensed font stacks in FC, Iron Crown and Aura Slam, the Red Zone cup asset key renamed `rzChampionCupMeshy`, `.vercelignore` patterns anchored (same ignore set) plus `/evidence/` so a clean deploy stays under the file limit, and the game-checks lore list extended.
- **Likeness and brand cleanup of shared models.** The trophy cabinet (framed photographs of people), the rooftop athlete face scans and the Bean Brawl Race yellow bean (a Pikachu-like face) no longer carry those textures: base-colour atlases are softened or the marks painted out, with new hash-named files, updated manifests and content-based tests (`tests/unit/likeness-audit`). A texture-by-texture audit of every served GLB is in `docs/audit/likeness-brand-audit.md`.
- **Iron Crown: the Crown Arena no longer shows framed photographic portraits.** The shared trophy-cabinet model's baked atlas holds small framed photographs of people; the arena now builds its two cabinets from instanced primitives (wood frame, shelves, gold cups, flat crimson banners with gold borders; eight draws) and `tests/unit/likeness-audit/iron-crown-stage-props.test.ts` fails if the scanned cabinet, its hash or its bytes come back into the app. The other Iron Crown stage props were scanned for photographs and real marks: only generic signage ("RAMEN") and small panels, no faces or brands found. Evidence: `evidence/iron-crown/rework/portraits/`.
- **Athlete models repainted in Diamond, FC, Links and Red Zone (no photographic faces, lettering, crests or brand marks).** `diamondAthlete`, `fcSoccerStrikerMeshy`, `fcGoalkeeperMeshy`, `linksGolferAthleteMeshy`, `rzQuarterbackMeshy` and `rzDefenderLinemanMeshy` now point at flat-colour models painted by body region (same rig and 23 clips, no textures), generated with `tools/hoops-athlete-retexture/retexture.mjs` (new per-sport config). The eight original athlete GLBs were removed. FC's team tint targets the kit material only. `docs/audit/likeness-brand-audit.md` lists what else still ships real marks (Teleoperator vehicles, rooftop face scans, race textures).
- **Fix: real brand marks and photographic likeness removed from served assets.** The six athlete models (Hoops, Diamond, Links, FC, Red Zone) are repainted in flat region colours (no face, lettering, crest or swoosh); the Formula opponent livery and tyre lettering, the Tsukuba circuit logos and a Dunlop arch texture are cleaned; the unused rooftop face-scan GLBs are smeared and their unreferenced duplicates deleted. Geometry is unchanged, so body shapes that replicate real vehicles still need new art (`docs/audit/likeness-brand-audit.md`).

### Library

- **`clearCameraEye` and `createCameraClearance` (`@aura3d/engine/game`): a chase camera that does not sit inside scenery.** Pulls the eye back along the focus-to-eye line to just before the first solid sample, fast in and slow out. Duneglide uses it with its chapter colliders plus tree, rock and pier columns (trees and rocks have no sim collider, and a camera inside a crown fills the view with it): on the chapter-0 flight the unobstructed chase eye was inside scenery on 153 of 300 sampled steps; with clearance, 3 (all at the 2.5 m minimum distance behind a rider hugging a crown). The eye keeps 1.8 m from colliders, the most the rider's own 1.85 m wall clearance always allows. QA stepping (`stepFrames`, `replay`) now cuts the camera to the chase pose instead of easing from its previous pose, so QA frames show the real camera. `docs/api/motion-camera-clear.md`.
- **`summarizeTextureUpgrade` and `texturedNodesReady` (`@aura3d/engine/game`): wait for textures before capturing.** Textured materials upgrade one at a time after mount, so an early frame, or any frame on a software-rendered runner where each new shader takes tens of seconds, shows plain white models. Saltwind Highway's QA hook now reports `textures()`, and its player car is added to the scene first so it is the first model textured (it used to be last: 12 of 15 textures were in by 480 s on SwiftShader and the car was not). No regression: the same pace was measured on the commits from the Meshy art pass through 4.1.3.
- **One shared quick-switcher bar (`apps/showcase-port-shared/quickbar.css`) replaces the per-game bars in Aura Slam, Iron Crown, Pips Big Leap, Dot Dash 3D, Thermal Drift and Bunker Zero.** It is a single row that scrolls sideways instead of wrapping to four rows on a phone, reserves its height in `--a3d-bar-space` so HUDs sit below it, and has an opt-in centred pill layout for wide screens. Iron Crown moves its fighter and venue pickers into a toggled panel, Thermal Drift's command bar moves from the bottom of phones to the top and its HUD shrinks to fit, and Teleoperator's fleet dock collapses into one chip with stacked cards on phones. The "AURA3D ENGINE" chip and stale "Aura3D 4.0.x" text are gone from the game UIs, replaced by one "Built with Aura3D" link.
- **Smooth on 120 and 144 Hz displays: `createFixedStepPresenter`, `createRecordBlend`, `runMotionGate` and `createFixedStepLoop().alpha`.** Additive. A 60 Hz sim drawn without interpolation stood still on every second frame at 120 Hz and flipped animation clips; the presenter draws between the last two steps (replays and `stepFrames` untouched), and `runMotionGate` fails a game that does not. Defaults of `createFixedStepLoop` are unchanged. Docs: `docs/api/motion-presenter.md`.
- **Motion kit in `@aura3d/engine/game` (additive).** `attachToBone` (role-resolved bone sockets with a loud `ATTACH_BONE_NOT_FOUND`), `createLocomotion` and `proceduralLegSwing` (stride-synced gaits), `createFootSlideMeter` (planted-foot drift and legs-not-stepping check), `createImpactWorld`, `createImpactFeedback`, `createHitStop` and `createCameraShake` (swept collision with one event per contact plus hit-stop, shake, cue, particles and damage), `smoothDamp`, `createSmoothFollow3`, `createRenderInterpolator` and `jitterReport`, and `checkDoubleFrame`. `attachToBone` bone matching is case-, punctuation- and rig-prefix-insensitive with forearm, upper-arm, shoulder, thigh, shin, foot and hips roles for Mixamo, Meshy, Rigify, Unreal, glTF Avatar and Biped naming, and `ATTACH_BONE_NOT_FOUND` lists the tried names. Docs: `docs/api/motion-*.md`. These are pure TypeScript with no DOM, so they run in unit tests and QA hooks.
- **API: `.position`, `.rotate` and `.lookAt` on scene node builders (and instanced and batched handles) accept an array as well as separate numbers**, like `.scale` already did (`primitives.box().position([1, 2, 3])`). The array form was the most common first-draft type error after `app.camera` and `setUniform` being optional; the signatures are overloads, so existing calls are unchanged.

### Docs and tooling

- **Docs: `docs/agents/recipes.md`** (complete compiled scenes for the five common tasks) and the `.runtime({ id, mutable: true })` rule in the quickstart. In the cold-start trial, 8 of 15 runs spent all 40 turns reading `dist/` without writing a scene; with the recipes the median dropped from 40 to 13 turns (see `evidence/agent-eval/REPORT-after.md`).
- **Docs: type traps table in `docs/agents/recipes.md`** for the strict `tsc` errors agents hit on a first draft (`app.camera` and `setUniform` are optional, `translate` is on the runtime handle, `geometry.define` has no `kind`, `material.custom` option shapes).
- **Docs: black frame checklist** in `docs/agents/troubleshooting.md` and the sized-wrapper advice in `docs/agents/recipes.md`.
- **Tests: three stale test doubles fixed** (`prd03-s18c-custom-passes`, two cases in `prd03-t0-16-statecache-invalidate`). Their fake WebGL host lacked `lifecycle.bindOutput`, which `runV2LdrTail` has called since 4.0.4; they fail the same way on the commit before the frame-cost change, so they were never a regression of it.
- **Tooling: the cold-start scorer scores the forest task on a reduced canvas and frame plan** so the 10,000-instance scene completes on software GL.

- **Lessons learned and automated game checks.** `docs/agents/lessons-learned.md` catalogues every mistake from the 4.1.x and 4.2.0 programs (rendering, motion, game design, assets and likeness, naming and copy, build and deploy, verification, agent process) with the API or check that prevents it; `docs/agents/new-game-checklist.md` is the one-page pre-flight and acceptance list. `node tools/game-checks/run.mjs <game-slug|--all>` runs 13 per-game checks (old names and "port" wording, engine chip, own quick bar, canvas size after ready, fixed-step without presenter, hit-stop on frozen time, array bone poses, brand and lore terms, asset sha256, hand-rolled kits, three.js and vendored bundles, runtime text masking, fonts, tracked screenshots) and 3 repo-wide checks (unanchored `.vercelignore`, hand-typed game counts, Meshy caps). Baseline over the 26 games in `docs/audit/game-checks-baseline.md` (23 errors, all runtime label masking of borrowed lore in three games; 32 warnings).

### Site

- **Site and docs: an honest three.js comparison.** The homepage comparison and `/docs/aura3d-vs-threejs.html` are rewritten as a side-by-side with where Aura3D wins (scene source length in 4 of 5 bench scenes, game kit, safety, agent workflow), where three.js wins (7.7x to 8.7x smaller bundle, first frame, frame time, cold-start authoring speed 4 vs 10 median turns, breadth, maturity), ties, when to choose which, what the evidence does not prove, and how each number was measured; every row names its version and caveat (software GL, one author, n). The code panels are the real bench PBR viewer sources (49 vs 24 lines). Unsupported claims are removed from the comparison surfaces: `~120 lines vs 18`, `83% less code`, `15 / 15`, `zero-dependency` (the engine depends on 15 sibling packages), `14 fragile packages`. `docs/aura3d-vs-threejs.md` is v3 and the capability matrix is v3 (60 rows; row 16 corrected, since cube, array, stereo and chase cameras exist; new rows for the motion kit, render interpolation, `warmPrograms`, the judge CLI, cold-start authoring and frame cost).
- **Site claims corrected (marketing, docs, llms files).** The unverified "800K+ catalog assets" / "~850K catalog" figure is removed everywhere (homepage stat, docs, llms-full, CLI index label, template comments) and replaced by the counted 652 admitted assets in the repo manifest; "zero-dependency", "MIT licensed" (the repo has no LICENSE file: copy now says MIT is declared in package.json), "WebGPU compute" and several per-game card claims (Aura Slam World Tour, Apex vehicle count, Thermal Drift cannons) are corrected or softened. `marketing/scripts/check-site.mjs` now fails if the homepage packages or admitted-assets stat disagrees with its counted source or the retracted figure returns. Audit: `docs/audit/site-claims.md`.
- **The site states the true game count, generated from one inventory.** `docs/workflows/game-inventory.json` (built by `tools/site/gen-game-inventory.mjs` from the catalog and the routes the production build serves) lists 26 live games and counts the three V2 builds (Thermal Drift, Apex Overdrive, Grid Dispatch) as variants, not extra games. The homepage ("4 playable games", "Fifteen games"), the showcase index, README, `llms.txt` and the social-card generator read that number instead of hand-typing it, `marketing/scripts/check-site.mjs` fails when any user-facing file states a different count, and the showcase index is regenerated by `tools/site/gen-showcase-index.mjs`, grouped by genre with 1x and 2x card images built from the final screenshots (`tools/site/build-card-images.mjs`).

### Known issues

- Teleoperator: every vehicle is now an original generic design, but the hatch, the wagon-style sedan and the van still read as familiar real shapes, and some Meshy-added emblem-like marks are covered by thin plain discs (flat dots up close). `docs/audit/likeness-brand-audit.md` lists live games that still carry content for an owner's review (Aura Clash face textures, Courier vehicle atlases, a trophy name in Red Zone). Name clearance: the new game names have had a web screen only, not trademark clearance.
- Gridlock Courier: after a long jump the road can appear in one screenshot and vanish in the next; the first frames that showed no road were not reproduced after the fixes above and the root cause is still open (4.2.0 work).
- All evidence is software WebGL2; none is real-GPU evidence. The legacy post chain still darkens frames with bloom or vignette on (see 4.1.2).

## 4.1.3 (2026-10-24)

A patch release: the stock-build fix, a large software-WebGL2 frame-cost cut, library kits extracted from the games, corrected API deprecation annotations, a remote-first `look capture`, a rewritten documentation set, and the native Aura Slam route polish. No export is removed or renamed.

### Fixes

- **Fix: root `@deprecated` annotations corrected (annotation-only, no export removed or renamed).** 24 live public-path names are no longer marked deprecated: the scatter and merge planners (`scatterAlongPath`, `scatterInArea`, `scatterTransforms`, `splitScatterByDistance`, `createScatterRandom`, `mergeStatic`, `mergeStaticByKey`), `createAnimationController`, the `sky`, `water`, `weather`, `character`, `decals`, `editor` and `navigation` builders, `compilePromptPlan`, the evidence helpers (`collectAuraSceneEvidence`, `collectPromptAnimationEvidence`, `evaluatePromptAnimationPublishReadiness`, `createCaptionTimingProof`), and `AuraColor`, `AuraNodeBuilder`, `GamePlatformerEvent`, `validatePlatformerMotion`, which shipped templates, games, docs and skills import from the root. 47 annotations remain, and every message now names a replacement that exists (`@aura3d/engine/renderer`, `@aura3d/engine/devtools`, `@aura3d/animation`, `@aura3d/assets`, `@aura3d/workflows`, `createAuraApp`, typed `model(assets.x)`) or says there is none. Two earlier messages pointed at subpaths that were never in the package exports (`@aura3d/engine/animation`, `@aura3d/engine/assets`). Root exports now: 282 value exports, 240 live, 42 deprecated (`docs/api/root-exports.md`).
- **`aura3d look capture` now defaults to a remote runner, and template `npm test` no longer starts a local browser.** `--runner remote` (new default) starts no browser on the developer machine: it writes `capture-request.json` and prints the remote-run steps, runs a configured runner (`--remote-cmd` or `AURA3D_REMOTE_RUNNER`), or collects a finished remote run with `--from <reports-dir>`. `--runner local` and `--runner gh-actions` still work and now print a warning (additive; nothing removed). In all 27 templates that ran `playwright test`, `npm test` now prints the remote-runner instruction and runs `typecheck`; the browser specs moved to `npm run test:browser` for the remote machine. 8 new unit tests; `tools/package-clean-install` now calls `test:browser`.
- **The game beacon now serializes.** `window.__AURA3D_GAME__` publishes `app`, `scene` and `session` as non-enumerable properties, so `JSON.stringify` and remote capture no longer fail on the circular `app.post`; the handles stay reachable for audit lanes. Cross Hop's local sanitizing setter is deleted; the shared black-frame wrappers import `@aura3d/debug` instead of relative source paths; the four starter templates' HUDs use the licensed Graphik face (Medium) instead of Inter 600. The leftover audit of all 26 games is in `docs/audit/game-leftovers.md`.
- **Frame cost on software WebGL2: cube 666 -> 50 ms, 18,000-instance forest 38.4 s -> 6.4 s per frame.** Three engine causes found by profiling on the remote CPU runner: the legacy LDR postprocess uber-shader (one fullscreen draw ~600 ms, now compiled per feature variant, `LdrPostprocessShader.ts`); single-object tessellation on every instance of `instances.*` (a node whose instances x triangles exceed 262,144 now halves its default segments, never below 16x8 for a sphere; up to 64 instances and authored `params.*Segments` are untouched); and ~15 allocations per instance in the caster/cull bounds (`instancedWorldBounds`, 243 -> 37 ms JS at 18,000). Software WebGL2 only; open items and method in `evidence/perf-frame-cost/README.md`.
- **A stock `vite build` / `vite dev` of an app on the published `@aura3d/engine` no longer fails with `"readFileSync" is not exported by "__vite-browser-external"`.** The root entry statically reached `dist/assets/index.js` (which re-exports Node-only loaders and asset corpora) through `ModelTextureShare`; it now imports `@aura3d/assets/browser`, so no `node:*` module is reachable from the browser entry. New gate `tools/release/consumer-build-smoke.mjs` installs the packed tarballs into a temp project outside the repo and runs `vite build` and `vite dev` for `mini-game`, `racing-starter`, `falling-blocks-starter`, `product-viewer` and a config-less `createAuraApp` hello-world. Verified on packed tarballs with stock `vite build` and `vite dev` for the cube app, mini-game, racing-starter, falling-blocks-starter and product-viewer on Vite 7.3.2 and 7.3.7 (`evidence/stock-build/`); `consumer-build-smoke.mjs` gained `--vite`.
- **Aura Slam menu and portrait layout fixed on the live route.** The menu CSS read type, spacing and column tokens (`--text-*`, `--space-*`, `--leading-*`, `--content-*`) that nothing defined, so every declaration using one was dropped (menu padding 0, headings 16px, cards touching); they are now defined in `examples/aura-slam/ui/styles.css` and a unit test fails on any undefined `var(--x)`. The menu masthead brand gets its styles, the controls hint hides while the menu is open, and the quick-switch bar no longer covers the scoreboard or pause button (portrait: one scrollable row whose height is reserved above the scoreboard via `--quick-bar-space`; desktop: ends left of the pause button). Frames and measured geometry: `evidence/live-slam/ui-fix/`.

### New and promoted library kits

- **Library kits: `installQaHooks` keeps getter extras live, and noise cue layers take `attack` and `loop`.** Both are additive. A hook object with live getters (`ready`, `frames`) now stays live instead of being frozen at install time, and a `NoiseLayer` can ramp up over `attack` seconds and loop the shared 0.4 s noise buffer for its whole `dur` (defaults keep the old full-level, single-pass behaviour). Strange Orbit, Serpentine Sky Run and Where the Wind Wanders now use `installQaHooks` and `createFixedStepLoop`, and Serpentine Sky Run's sound effects run on `createCueBank`: a test replays the original synth and the cue-bank version against the same fake context and finds identical gain, frequency and filter automation for all 11 cues (parameter-level only; not listened to). The other two ports keep their audio because it pans, uses `Math.random`, runs a compressor or needs speed-driven beds the cue bank does not express.
- **Game beacon: `installGameBeacon().publishEvidence(evidence)`.** Routes that do not use `createGame` can publish their per-frame evidence on the frozen library beacon instead of assigning `window.__AURA3D_GAME__` by hand. The beacon fields (`route`, `state`, `frame`, ...) merge under the evidence fields (evidence wins), getters stay lazy, `evidenceGlobals` fills legacy aliases such as `__AURA3D_GAME_EVIDENCE__`, and the live `app`/`scene` handles stay non-enumerable. `getState`, `getFrame` and `getFirstFrameAt` are now optional. Nine index games (links, hoops, fc, diamond, red-zone, heatsink, teleoperator, roadster-rush, slingshot-siege) moved onto it and Dot Dash dropped its sanitizer. Verified on a remote software-WebGL2 spec for Heatsink, Roadster Rush, Aura Hoops and Dot Dash (every evidence key still readable, beacon frozen and JSON-serializable, no errors, guard never reloaded). Slingshot Siege and the other five games are covered by type and unit checks only.
- **`aura3d evidence judge`: the blind A/B model judge is now a CLI command.** `aura3d evidence judge --a <dir> --b <dir> --trials 48 --seed 20261023` runs a seeded, balanced blind comparison of two folders of matched frames through Kiro Prism, reports accuracy, Wilson 95% interval, exact binomial p-value and pixel metrics, and labels every result "model judge" (not human). Replaces the per-game scripts' shared logic in `tools/crayon-capture/`; see `docs/api/cli-asset-tools.md`.
- **One mulberry32 for the games: `createCountedRng` now also exposes `draws`, and `SeededRandom` counts `draws`.** Bunker Zero, Dot Dash, Iron Crown, Apex Overdrive, HEATSINK, Drift & Deliver and Splat Rush dropped their inline mulberry32 copies for `createCountedRng`; a golden test proves every stream is bit-identical to the old code over 2,000 draws per seed (`tests/unit/rng-consolidation/`). `SeededRandom` is xorshift32, a different sequence, so it was not swapped in (that would change every replay).
- **`effects.toon({ bands, outline })` cel pass promoted from Silt & Signal.** Luma banding plus a Sobel outline as a post pass (`docs/api/toon.md`, `tests/unit/toon/`); options are range-checked and throw instead of being ignored. The Silt & Signal port now uses it instead of its own shader.
- **`cameras.chase` gameplay chase camera rig.** A pure, deterministic rig (offset mode with heading smoothing, speed-driven back distance and fov kick, shake; framed mode with exponential smoothing, first-frame snap and a `cut` flag) extracted from six ports. Drift & Deliver keeps only its constants and matches its original camera within 1e-9 over a scripted drive; Ninja Runner, Roadster Hours, Kid Goku, Last Train and HEATSINK drive their own framing through it. See `docs/api/camera-rig.md`.
- **`prefabs.objectiveMarker`, `compassBearing`/`updateCompass` and `drawCanvasMinimap` extracted from the ports.** The Silt & Signal beacon (ring, rim, halo, light column) and compass and the Drift & Deliver minimap now come from the library instead of per-game code; see `docs/api/objective-marker.md`.
- **`attachRootRenderSource`, `RootRenderSourceBridge` and `TypedGLBActor` are exported from the `@aura3d/engine` root.** Skinned-actor games no longer need the deprecated `@aura3d/engine/production-runtime` subpath; Saiyan Snake Way, Ninja Runner and `parity-animation` are migrated (`docs/api/skinned-actors.md`).

### Games and ports

- **Ports on the QA and fixed-step kits: Silt & Signal, Ninja Runner, Last Train and Roadster Hours.** They now install their QA hooks and run their live loops through `installQaHooks` and `createFixedStepLoop`; steps per frame match the old accumulators on 20,000 seeded frames each, replay paths are untouched, and their audio stays hand-written (continuous driven voices are not in `createCueBank` yet).
- **Ports on the QA and audio kits: Drift & Deliver, HEATSINK and Kid Goku.** `installQaHooks` (all three; Kid Goku keeps its own `ready` getter and event-returning `stepFrames` as extras), `createFixedStepLoop` (all three) and `createCueBank` for the oscillator-only cues (Drift chimes and thud, 17 Kid Goku events; the noise-bearing cues stay hand-written). `createFixedStepLoop` gains `resetAccumulator()` so a restart does not inherit a partial step. Replay and unit suites are unchanged and green; the audio equivalence is parameter-level only (see `docs/audit/game-leftovers.md`).

### Documentation

- **Documentation rewritten for agents and developers.** `README.md` (48 KB to 8 KB), `llms.txt` (a one-screen fast path; the long guide moved to `llms-full.txt`), `AGENTS.md` (a Fast path section after the policy block), one canonical `docs/agents/agent-quickstart.md` (about 1.8k tokens), `docs/agents/build-a-game.md` with a compiling sample, `docs/agents/asset-workflow.md`, `docs/migration/from-threejs.md`, a rewritten `docs/aura3d-vs-threejs.md` that uses only the measured, software-GL, one-author figures, and a script-generated `docs/api/root-exports.md` (checked by `tools/docs/check-root-exports.mjs`). The core read path for a new agent is about 9.4k tokens, down from 14.9k (bytes/4 estimate). Docs no longer teach nonexistent commands or import paths, dead links are fixed, 28 history-only files moved to `docs/archive/`, and the skill sources and mirrors are in sync (`docs/audit/RESULT.md`). The Aura3D vs three.js analysis and execution plan is `docs/workflows/aura3d-vs-threejs-analysis-and-plan.md`.

### Known issues

- The legacy post chain tone-maps and encodes on its own and bypasses `OutputPass` until PostGraph v2 migrates it, so frames with bloom or vignette on are about 25 to 40% darker and less saturated than with post off. Unchanged from 4.1.2.
- `primitives.plane({ params: { widthSegments, heightSegments } })` is accepted by the types but renders a single quad (found by the 4.1.2 benchmark; not fixed in this release).
- The Aura3D bundle is much larger than three.js for a one-cube app (about 3.3 MB raw JS and 963 kB gzip in the stock-build smoke) and the default frame cost on software WebGL2 is still higher than three.js after the 4.1.3 cut (measured: `evidence/vs-threejs/RESULTS.md`, `evidence/perf-frame-cost/`). These are software-WebGL2 figures, not real-GPU figures.
- `aura3d migrate three` emits an annotated worklist, not compiling code (for the benchmark PBR viewer it leaves `const scene = scene()` and `renderer.*` and `THREE.*` references). See `docs/migration/from-threejs.md`.
- Camera, objective-marker, toon and port-kit migrations were verified by unit and replay tests and remote software-GL specs; frame equivalence was not diffed pixel by pixel for the camera rig on the five non-Drift ports, and HEATSINK and Last Train never finish under software GL, so those two are unchecked in a browser.
- Audio migrations to `createCueBank` are parameter-level equivalence only (nobody listened); noise-bearing and continuous cues in most ports stay hand-written (`docs/audit/game-leftovers.md`).
- Real-GPU confirmation is still pending for several ports (Drift & Deliver, Silt & Signal, Last Train's full Enter, E, W path, HEATSINK) and for the native Aura Slam route; all automated checks ran on software WebGL2.
- Aura Slam in portrait shows less court width (the camera uses a fixed 15 degree vertical field of view pinned by the G3 render gate).
- Remaining leftovers in games (hand-rolled QA hooks in a few ports, own fixed-step loops, hand-written audio, an LCG copy in 19 places, system-font fallbacks) are listed in `docs/audit/game-leftovers.md`. The `create-aura3d` templates name the Graphik font but do not ship its files, so they fall back to `sans-serif`.
- The repository has no `LICENSE` file although `package.json` declares MIT.

## 4.1.2 (2026-10-24)

A patch release for the black-frame guard misfiring on healthy games in the 4.1.1 production build. No API removals; one new export (`installFrameTap`).

### Fixes

- **Fix: the black-frame guard no longer reloads healthy games.** 4.1.1's guard sampled the world canvas after every `requestAnimationFrame` callback. A WebGL canvas without `preserveDrawingBuffer` reads as zeros outside the task that drew it, so on pages with several animation-frame callbacks per frame (or draws from timers) the guard read black from healthy games and walked them down the ladder; on the 4.1.1 production build Cross Hop, Iron Crown and Bunker Zero each reloaded three times (`?a3d-qr=game,-vfxFog,-post,-compiler`) although `?heal=0` pages rendered fully. The guard now taps the GL draw calls (`installFrameTap`, exported from `@aura3d/debug`) and samples in the task that drew to the default framebuffer, before the browser composites. Draws into an offscreen framebuffer do not count, minimap and HUD canvases are never judged, and `installBlackFrameGuard({ sampling: "raf" })` keeps the old behaviour for pages without WebGL draw calls. A scene that draws but outputs black still reloads exactly once per page load.
- **Verified:** unit tests with a fake GL (draw task, offscreen framebuffer, multi-draw, small canvases, observer errors, dispose) and a simulated browser with HUD callbacks that never draw; a remote spec with a real WebGL2 context without `preserveDrawingBuffer` (lit, sparse draws, timer-driven draws, offscreen-pass-first, dark: no reload; black output: one reload); and the new guard injected into the live 4.1.1 Cross Hop, Iron Crown and Bunker Zero pages (no navigation, rung 0, 4-6 sampled frames each, none black; the same guard reloads Cross Hop exactly once when colour writes are masked). Before/after evidence is in `evidence/guard-fix/`. Software WebGL2 only: not run on a real GPU.

### Tooling and tests (not published packages)

- **Evidence and docs:** live verification of 4.1.0 and 4.1.1 on the production site (`evidence/live-410/`, `evidence/live-411/`), the pin-regression analysis (`evidence/regress-fix/`: Cross Hop and Iron Crown were not rendering regressions, the guard misfired during slow loads) and the guard fix before and after (`evidence/guard-fix/`); `docs/workflows/threejs-parity-gaps.md` is at v10.
- **Specs:** a real-canvas WebGL2 lab for the guard and live-game guard specs (`tests/browser/guard-canvas.spec.ts`, `guard-real-games.spec.ts`, `guardfix-probe.spec.ts`; `selfheal.spec.ts` keeps the synthetic cases).

### Known issues

- The legacy post chain tone-maps and encodes on its own and bypasses `OutputPass` until PostGraph v2 migrates it, so frames with bloom or vignette on are about 25 to 40% darker and less saturated than with post off. This is an engine finding and is not patched in 4.1.2.
- Phase B (a blind model judge cannot tell a Crayon port from its original) is still not met: the judge still separates every port from its original.
- Real-GPU confirmation is pending for several ports (Drift & Deliver, Silt & Signal, Last Train's full Enter, E, W path, HEATSINK and Last Train in an automated run); all automated checks ran on software WebGL2, including the guard fix.

## 4.1.1 (2026-10-24)

A patch release for the problems found by live verification of 4.1.0 and by the Apex Overdrive art pass. No API removals.

### Fixes

- **Fix: the black-frame self-heal no longer fires on healthy pages.** Live verification of 4.1.0 showed it reloading Aura Slam while the loading overlay was still up and a slow CPU renderer had not drawn its first frame, and dark valid scenes could read as black. The watch now waits for readiness (loaded document, no visible loading overlay, no in-flight asset fetches, the app's own `isReady`), counts frames from that moment, samples a 48x32 nearest-neighbour grid instead of a blurred 16x16 copy, calls a frame black only when 0.2% or fewer of the samples are lit, and requires that to persist for 12 samples over at least `max(4 s, 40 x the median frame time)`, so slow renderers wait longer. It steps down once per page load and records why (`?diag=1`, `SAFETY_COMPAT_MODE`). The showcase games and Drift & Deliver share this one implementation. `installBlackFrameGuard` (for pages driven by the `a3d-qr` flag ladder), `QR_HEAL_LADDER`, `qrHealStage`, `qrHealRungName` and `qrHealUrl` are now exported from `@aura3d/debug`. Docs: `docs/api/safety-net.md`.
- **Fix: a custom shader that fails to compile or link no longer blanks the whole frame, and the failure is no longer silent.** A duplicate GLSL variable in one `material.custom` sky shader threw out of the draw loop and took every other draw with it; only the black-frame self-heal noticed. Compile, link and (WebGPU) missing-WGSL failures now get the stable codes `CUSTOM_SHADER_COMPILE_FAILED`, `CUSTOM_SHADER_LINK_FAILED` and `CUSTOM_SHADER_WGSL_MISSING`, a once-per-material `console.error` with the driver log and the offending source lines (mapped back to your own GLSL line when possible), structured `app.diagnostics().shaderFailures` plus a summary in `errors` (so route health and `check-deploy` report `error`), and a line in the `?diag=1` panel. The failing item is skipped (flat magenta with `?diag=1` or `renderer.shaderFailures: "magenta"`) while every other draw continues; strict mode (`strict`, `A3D_QR_STRICT`, `renderer.materialStrictness: "strict"`, or `renderer.shaderFailures: "throw"`) fails the frame with `AuraRuntimeError("custom-shader-compile-failed")` (recorded in `diagnostics().errors` by the async production renderer). `effects.shaderPass` compile failures are reported through the same record. A failed program is not recompiled every frame. Docs: `docs/api/shader-diagnostics.md`; `@aura3d/rendering` exports `getShaderFailures`, `clearShaderFailures`, `setShaderFailureMode`, `formatShaderFailure`, `parseShaderLog`.

### Tooling and tests (not published packages)

- **Test: `public-example-boundary` accepts `url: new URL("./x.glb", import.meta.url)`** as a typed asset definition (the form the Apex Overdrive vehicles use, with a sha256 alongside), instead of flagging it as a raw model URL.
- **Live verification of 4.1.0** (`evidence/live-410/`, `tests/browser/live-index-games.spec.ts`): software-WebGL2 smoke over the Crayon ports and the 15 index games, with hero frames and a results file. Two index games (Cross Hop, Iron Crown) looked near-black in that capture; the regression probe (`tests/browser/pinregress.spec.ts`, `evidence/regress-fix/`) showed both render fully at engine defaults, and the dark frames were the old guard escalating during a 95 MB and 38 MB asset load. That is what the guard fix above addresses.

### Known issues

- The legacy post chain tone-maps and encodes on its own and bypasses `OutputPass` until PostGraph v2 migrates it, so frames with bloom or vignette on are about 25 to 40% darker and less saturated than with post off. This is an engine finding and is not patched in 4.1.1.
- Phase B (a blind model judge cannot tell a Crayon port from its original) is still not met: the judge still separates every port from its original (it picks the original in 73% to 100% of trials, except Splat Rush where it picked the port as the original in 83%, a reversed result, not a pass).
- Real-GPU confirmation is pending for several ports (Drift & Deliver, Silt & Signal, Last Train's full Enter, E, W path, HEATSINK and Last Train in an automated run); all automated checks ran on software WebGL2.

## 4.1.0 (2026-10-24)

A large release: eight reusable kits extracted from the eleven Crayon game ports and the Aura Slam 3D conversion, plus the engine fixes those games exposed. Everything below is in the published `@aura3d/*` packages unless it is listed under Tooling and examples.

### Highlights

- **Library kits for games:** a published game kit that defaults on at `@aura3d/engine/game`, a QA and replay hook kit, an opt-in runtime safety net (`?diag=1`, black-frame self-heal), a procedural audio synth kit, a production model loader, a GLSL chunk library, seeded scatter planning with static merge, and racket-sport kits (exact ball flight, scoring, athlete rig).
- **Engine fixes found on real hardware and in production builds:** sun shadows no longer darken far more than the caster's footprint, instanced and batched meshes show their textures, empty instance arrays no longer blank the canvas, custom shaders are NaN-safe on Apple GPUs, and repeated `model()` nodes share decoded textures.
- **CLI asset tools:** `assets optimize`, `assets merge-clips`, an isolated `assets import-meshy`, and a `meshy ledger` command.
- **Deprecations extended:** the ten deprecated `@aura3d/engine/*` subpaths and the deprecated root symbols are now planned for removal in 5.0.0, not 4.1.0 (see Deprecations).

### Library kits

- **New: `game.racketSports().scoring(rules?)`** (`createRacketScoring`): a pure game/match/tiebreak scoring state machine for rally sports. The defaults are the Aura Slam tennis rules (4 points win by 2, first to 3 games leading by 2, tiebreak to 7 win by 2 at 3-3); `pointsToGame`, `winBy`, `gamesToMatch`, `matchWinBy` and `tiebreak` are configurable, so table-tennis style formats work too. `awardPoint(state, side)` returns a new state plus `gameWon`/`matchWon`/`tiebreakStarted`, and `label(own, opponent)` gives 0/15/30/40/AD. Verified point for point against the original tennis simulation over 2,000 seeded matches.
- **New: `game.racketSports().ballFlight(config)`** is an exact, frame-rate independent ball-flight kit for racket sports (x lateral, y along the court, z up): closed-form flight under gravity and drag, exact-time bounce/net/tape/board events, surface rebound and rolling, a shot solver that clears the net, a serve solver and a loose-ball settle. It was extracted from the Aura Slam 3D simulation and reproduces the original game's physics to 1e-12 (`docs/api/ball-flight.md`). The existing `stepBallPhysics` remains as the simple model.
- **New: `game.racketSports().athleteRig`** (`docs/api/racket-athlete-rig.md`): a procedural racket-sport athlete extracted from the Aura Slam port. `locomotion()` is a pure stride/split-step/slide/planted-stance solver and `applyLimbs()` poses leg, arm (two-bone IK) and racket cylinders from root-local points; `solveKnee()` is the knee helper. Verified bit-identical against the original game's pose code (60,000 cases). The five existing geometry helpers moved to an internal module and are re-exported unchanged.
- **New: `createBindingStore` in the game kit (`packages/game`)**: validated, persisted, rebindable input bindings (keyboard primary + optional alternate keys, controller buttons), reserved keys with custom messages, conflict detection, per-device fallback on corrupt or wrong-version storage, and `saved: false` instead of throwing on write failure. Extracted from the Aura Slam 3D controls store; an equivalence test shows it validates, persists and restores identically when configured with that game's actions. It is exported from `@aura3d/game` (private until the game kit is published through `@aura3d/engine/game`).
- **New: QA and replay kit** (`docs/api/qa-kit.md`): `installQaHooks`, `createFixedStepLoop` (alias `fixedStepLoop`), `readQaParams`, `createCountedRng` and the hook-name helpers, exported from `@aura3d/engine`. They replace the `window.__AURA_<GAME>__` hooks and fixed-timestep loops that every Crayon port copied into its own `main.ts`. The Splat Rush port is migrated as the reference.
- **New: opt-in runtime safety net in `@aura3d/debug`** (`installSafetyNet`, `resolveQualitySwitches`, `createBlackFrameWatch`, `installDiagnosticsPanel`). Parses the shared quality URL switches (`?post=0 ?shadow=0 ?env=0 ?sky=0 ?aa=0 ?quality=low ?tm=aces ?heal=0 ?diag=1`), reloads one rung down a compatibility ladder when the canvas stays black (`SAFETY_BLACK_FRAME` / `SAFETY_COMPAT_MODE`), and shows a GPU diagnostics panel (renderer, limits, draw calls, shader compile/link failures, context loss, last errors). Nothing runs unless `safety` is set; see `docs/api/safety-net.md`.
- **New: `defineModelAssets(manifest, options?)` and `modelsEnabledFromUrl()`** declare a game's GLBs once with the sha256 and same-origin URL the production bridge requires, validate them at definition time (a bad hash or cross-origin URL used to draw nothing silently), return typed refs, and carry the procedural-fallback switch (`?models=0`, or `enabled`) as an option. See `docs/api/model-loader.md`.
- **New: procedural audio synth kit in `@aura3d/audio` (also `@aura3d/engine/audio`).** `createCueBank({ cues })` plays sample-free cues built from oscillator and filtered-noise layers (envelopes, pitch glides, delays, detune) on the page's single `AudioContextManager`, with first-gesture unlock, a master mute and key binding (`install()`), SFX/music buses, a voice budget with priorities, per-cue cooldown/concurrency limits and music ducking. `createStepSequencer` is a lookahead music scheduler, `createToneLoop` a parameter-driven bed (engine drone, wind, pad), and `midiToHz`, `noteFrom`, `SCALES`, `scaleSemitones` and a deterministic `createNoiseSource` cover pitch and noise. It replaces the hand-rolled Web Audio code the ports each carried; the Splat Rush port now uses it. See `docs/api/audio-synth.md`.
- **New: recorded takes in the synth kit** (`createSampleSlices`, `SampleSlices`; docs in `docs/api/audio-synth.md`). Plays one slice of a sprite sheet per call on the cue bank's buses, never repeating the previous take, through an optional low-pass, gain and stereo panner, with a procedural fallback until the sheet decodes. `CuePlayParams.data` carries a free-form payload to a cue's layer function. Extracted from Aura Slam's `tennis-audio.js`.
- **New: author GLSL chunk library for `material.custom`** (`docs/api/glsl-chunks.md`). `#include <a3d_math>` (saturate, safe divide/sqrt/acos/normalize, remap, `a3dFinite`), `<a3d_noise>` (sin-free hashes, value and simplex noise, fbm, ridged), `<a3d_sky>`, `<a3d_fog>` (linear, exp2, analytic height fog), `<a3d_triplanar>`, `<a3d_toon>`, plus `<colorspace_decode>` and the new `<colorspace_encode>`. All are GLSL ES 3.00, `a3d`-prefixed, NaN-safe and `pow`-free; a material `patch` or `registerShaderChunk` still overrides them. Verified on the mock device and on a real WebGL2 context (every chunk links; known-value probes render exact colours). They are GLSL only, so a material that includes them has no WGSL twin.
- **New: scatter planning and static merge** (`scatterAlongPath`, `scatterInArea`, `splitScatterByDistance`, `scatterTransforms`, `createScatterRandom`, `mergeStatic`, `mergeStaticByKey`; docs in `docs/api/scatter-merge.md`). Seeded, filter-stable placement along paths or over areas (exclusion zones, minimum spacing, height and slope filters, radius LOD bands) that feeds `instances.*`, and a transform-and-tint baker that turns many static parts into one geometry per material. Extracted from the hand-written placement and merge code in the Crayon ports; the Cloud Runner mesa layout is reproduced exactly for its seed in `tests/unit/scatter`.

### Engine fixes

- **Fix: `material.custom` shaders are NaN-safe on real GPUs.** GLSL leaves `pow(x, y)` undefined for a negative base; software GL evaluates it, but Apple/Metal GPUs return NaN, which blending writes into the HDR target and bloom smears over the whole frame (a black scene on an Apple M4 Max in one port). Custom shaders whose source uses `pow` now get a total `a3dPow` (`pow(max(abs(x), 1e-30), y)`, applied through a `pow` macro), and the output stage and the bloom downsample drop non-finite samples (`a3dFinite`). A negative base now yields `pow(abs(x), y)` instead of NaN. Not yet confirmed on the reporting machine.
- **Fix: the game kit imported the deprecated `@aura3d/engine/contracts` subpath**, so every game using `@aura3d/engine/game` printed a deprecation warning that said removal in 4.1.0; it now imports from the `@aura3d/engine` root.
**Fix: directional (sun) shadows no longer darken far more than the caster's footprint.** The forward path samples one cascade per render item, and a large receiver such as a ground plane has fragments whose light-space depth lies beyond that cascade's fitted depth range; the manual depth compare treated them as shadowed against the cleared depth of 1.0, so one small caster shadowed a whole half of the ground (about 80,000 of 230,400 pixels at fov 15; about 500 after). The receiver depth is now clamped to [0, 1] in every directional sampler (generated forward chunk, legacy core library, packaged `pbr-direct`, WebGPU forward), like a hardware compare sampler. `tests/browser/shadow-footprint.spec.ts` and `examples/shadow-lab/` reproduce and guard it. Projects that switched sun shadows off because every receiver rendered fully shadowed (for example the Ninja Runner port) can switch them back on.
- **Fix: `instances.mesh` and `batched.mesh` now honour the material's texture maps.** The batched/instanced handler only built the scalar PBR material, so `texture`, `normalMap`, `emissiveMap` and the other map slots (URLs, asset refs and `texture.*` handles) were dropped and the surface rendered white; ordinary primitives got them from the post-mount textured upgrade, which batched nodes never joined. The handler now runs the same upgrade once per node and swaps in the `TexturedPBRMaterial` when it resolves (the scalar material until then); dispose releases it. Also: a multi-geometry `batched.mesh` drew nothing unless `qualityRebuild.flags` enabled `tiers.batching`, because the packed multi-draw route's marker items need that submit path; without the flag it now uses per-geometry instancing (`fallbackReason: "tiers-batching-off"`). A `texture.data` handle used as a base-colour map must declare `colorSpace: "srgb"` (binding validation rejects linear base-colour textures).
- **Fix: `createGame` from `@aura3d/engine/game` returned the headless stub unless the caller passed `qualityRebuild: { flags: ["game"] }`.** That entry point is itself the opt-in to the real game kit, so the `game` lane now defaults on there; `-game`, `none`, the `?a3d-qr=-game` URL and `A3D_QR_GAME=0` env still turn it off. The root `createGame` in `@aura3d/engine` stays the headless stub and now logs `CREATE_GAME_STUB` once, pointing to `@aura3d/engine/game`. The game kit imports from the `@aura3d/engine` root instead of the deprecated `@aura3d/engine/contracts` subpath (removal is planned for 5.0.0). The kit was already published as the `@aura3d/engine/game` subpath of the root tarball (no new package); a `racing-starter` build against the published 4.0.8 tarball was used as the check. Docs: `docs/api/game-kit.md`.
- **Fix: an empty instanced node no longer blanks the canvas.** `instances.<primitive>` and `instances.model` with zero transforms used to throw at build time, and a zero-length instance array threw `INSTANCING_CONTRACT` inside `ForwardPass` (before sorting), which stopped the frame. Zero instances is now valid: the compiler skips the node and reports `INSTANCES_EMPTY`, `batched.mesh`/`instances.mesh` with no live members emit nothing, and `ForwardPass` drops zero-length instanced items. A geometry `drawRange` of count 0 (three's `setDrawRange(0, 0)`) draws nothing instead of throwing.
- **Fix: empty `points` / `lines` no longer throw.** Zero positions builds and compiles to nothing and reports `GEOMETRY_EMPTY`; a one-point polyline is still an authoring error.
- **Perf: repeated `model()` nodes of one GLB share decoded textures.** `createTypedGLBActor` now takes a ref-counted `GLTFSharedTextureCache` per (asset url/id/sha256, decode options) when none is passed, so N nodes decode and upload each glTF image once instead of N times (20 actors of a 3-image GLB: 60 decodes before, 3 after). Textures are freed when the last actor disposes; `shareTextures: false` opts out and `cloneSkinned` keeps its own cache. Geometry buffers are still per node.
- **Fix: example and app entry modules survive production bundles with plain imports.** The root `sideEffects` allowlist now covers `./examples/**`, `./apps/**` and `./templates/**`, so the eleven port wrappers dropped their `__AURA_PORT_MODULES__` workaround.
- **Fix: the cue bank's mute key did nothing unless an `onMuteChange` callback was passed.** `install()` evaluated `options.onMuteChange?.(this.toggleMute())`, which skips the toggle when the callback is absent. It now toggles first and then notifies.

### Behaviour changes

- **Directional shadows cover less ground.** After the shadow depth fix scenes with a `shadow: true` sun look different: the large dark areas on ground planes shrink to the casters' footprints. Check scenes that were tuned around the old darkening.
- **`createGame` from `@aura3d/engine/game` now has the game lane on by default**; the root `createGame` stays a headless stub and logs `CREATE_GAME_STUB`. Opt out with `-game`, `none`, `?a3d-qr=-game` or `A3D_QR_GAME=0`.
- **Fix: `handle.setUniform` on a model node no longer throws.** Without a custom material it is a once-per-uniform `MODEL_SETUNIFORM_NOOP` warning; with `material.custom` it writes as before.
- **Fix: `scene({ children })` no longer returns an empty scene.** `scene(init)` accepts `children`, `background`, `camera`, `timeline` and `diagnostics`; any other key or a non-object throws `invalid-scene-options`.
- **A multi-geometry `batched.mesh` without `qualityRebuild.flags` enabling `tiers.batching`** now falls back to per-geometry instancing (`fallbackReason: "tiers-batching-off"`) instead of drawing nothing. Base-colour maps on instanced nodes need `colorSpace: "srgb"`.
- **`material.custom` colour output is linear light** that the output stage encodes (and the default ACES operator tones down); use `#include <colorspace_decode>` with `toneMapping: "none"` to get the authored colours. The default is unchanged.

### CLI

- **New: CLI asset tools** (`docs/api/cli-asset-tools.md`). `aura3d assets optimize --file in.glb --out out.glb --role hero|vehicle|character|prop|background` (role vertex and texture budgets, float32 geometry kept), `aura3d assets merge-clips --base rig --out file.glb name=clip ...` (merge Meshy animate clips into one rig by node name; a foreign skeleton is rejected), `aura3d assets import-meshy <dir> --into <assets-dir> --prefix <game> --name <role>` (isolated admission in a temporary project; it is the default inside the Aura3D monorepo, so shared `aura.assets.json`, `src/aura-assets.ts`, `public/aura-assets/*` and `aura-evidence/*` are never written; `--shared-manifest` opts out), and `aura3d meshy ledger status|reserve|settle|reconcile|list` (per-game and global credit caps under a lock; a rate-limited or timed-out call stays `unconfirmed` and keeps counting instead of being recorded as a failure). The `meshy-cli` and `aura3d-assets` skills point to the new commands.

### Deprecations

- The ten deprecated subpaths `@aura3d/engine/{contracts, media-node, apps, rendering, rendering/production-runtime, rendering/webgpu, production-runtime, advanced-runtime, assets/browser, workflows/production}` and the deprecated root symbols in `packages/engine/src/public/index.ts` keep working in 4.1.0. Their announced removal moves from 4.1.0 to **5.0.0**: the warning text, `removeIn` in `aura.exports.json` and the `@deprecated` notes now say 5.0.0. Replacements are listed in `docs/migration/4.0-to-4.1.md`.

### Tooling and examples (not published packages)

- **Aura Slam 3D native port** (`examples/aura-slam/`, wrapper `apps/showcase-aura-slam/`, not routed): a typed, differential-tested simulation (physics, strokes, rules, AI, swipe, input), pose and rig, renderer, audio and UI shell. The live route is not swapped: Auto mode does not yet match the original's autoplay, the live-game replay gate and matched-tick render parity are not met, desktop draw calls (about 261) are above the 150 budget, and the tour, tournament and online screens are deferred.
- **Meshy art pass over the eleven Crayon ports** (about 4.2k credits at last count by the helper ledger, which undercounts rate-limited calls) and the look-spec extractor under `tools/crayon-capture/`.
- **Apex Overdrive** (`showcase-roadster-rush` and `-v2`) runs on a native Aura3D simulation; the 1.1 MB third-party `engine.js` bundle is gone.
- **The 15 index games** dropped their blanket post, compiler and fog pins and share a black-frame self-heal; every port page supports `?diag=1`. Strict live-port smoke specs, a hi-dpi spec and the port page generator were added.
- Docs: `docs/archive/docs/whats-new-4.1.md`, `docs/archive/docs/migration/4.0-to-4.1.md`, `docs/workflows/game-conversion-playbook.md`, `docs/aura-slam/ARCHITECTURE.md`, and the topic pages under `docs/api/`.

### Verified vs not verified

- **Verified:** unit and differential tests (see each kit's tests), typecheck, build, public-API contract, surface diff, export and import checks, and remote runs on software WebGL2 (SwiftShader) in headless and headed Chromium.
- **Verified on real hardware for some ports only:** an Apple M4 Max (ANGLE/Metal, WebGL2) was used by the owner for Drift & Deliver, Silt & Signal and Last Train via `?diag=1`. The NaN fix for the black Drift scene and the new Silt rings are not yet confirmed there.
- **Not verified:** any hardware-GPU run of the full port set (blocked on cloud GPU quota), real-headset WebXR, and performance on weak GPUs (several ports use 130 to 1,400 draw calls).
- **The Crayon ports are not indistinguishable from the originals.** Under the blind model-judge protocol (a model, not a human; seed 20261023) the judge still separated every port from its original (original identified in 35 of 48 trials for HEATSINK, the best result, 39 of 48 for Roadster Hours and 47 or 48 of 48 for most others; for Splat Rush the result reversed to 8 of 48 because the original's cards overflow at the test size); structural metrics improved but Phase B of `docs/workflows/threejs-parity-gaps.md` is unmet.

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
