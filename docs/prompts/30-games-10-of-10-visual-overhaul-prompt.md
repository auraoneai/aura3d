# Prompt: 30 Showcase Games — 10/10 Blender-Grade Visual, Graphics & UI/UX Overhaul Blueprint (Aura3D 5.5.1)

Audit the Aura3D 5.5.1 documentation and all 30 live showcase games in this repository, then author a comprehensive, execution-ready Markdown blueprint at `docs/project/30-games-10-of-10-visual-overhaul.md` detailing everything required to elevate every single game to a **10/10 Blender Eevee-grade realtime visual, lighting, VFX, animation, and UI/UX standard**—visibly richer than stock Three.js—using **100% native `@aura3d/engine` 5.5.1 and `@aura3d/engine/game` APIs** (zero fake CSS hacks, zero hallucinated exports, and zero Three.js anywhere in the codebase or packages).

---

## Hard Non-Negotiable Rule — Zero Three.js Whatsoever (Code, Packages, Build & Tooling)

- **No Three.js in any `package.json` or lockfile:** Never add, install, reference, or keep `three`, `@types/three`, `three/*` (`three/addons/*`, `three/examples/*`, `three/webgpu`, `three/tsl`), `@react-three/*` (`@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`), `postprocessing`, `troika-three-text`, or any Three.js-ecosystem library in `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies` across the root workspace, `packages/*`, `apps/*`, `examples/*`, or any build/helper script.
- **No Three.js imports, globals, or bridges:** Never import `three` at runtime or build time, never touch `window.THREE`, never propose `GLTFLoader` / `RGBELoader` / `EffectComposer` / `ShaderMaterial`, and **never** use `aura3d import-three` or `aura3d migrate three` bridges to generate assets or scenes.
- **100% Standalone Aura3D Engine Only:** `@aura3d/engine` and `@aura3d/rendering` are a standalone WebGPU + WebGL2 engine with zero `three` dependency. Every single recommendation—geometry, PBR lobes, custom GLSL 3.00 + WGSL shaders, IBL/HDRI, shadows, post-processing, rigged animation, particles, physics, audio, and HUD—must be authored exclusively on native Aura3D 5.5.1 APIs (or specified as a native first-party addition in `packages/game`, `apps/showcase-port-shared`, `packages/engine`, or `packages/rendering` if shared helpers are needed).

---

## Phase 1 — Ground in Aura3D 5.5.1 Capabilities & Rules First

Before inspecting games or proposing changes, read:
1. **Core 5.5.1 surface & capabilities:** `llms.txt`, `llms-full.txt`, `CHANGELOG.md` (5.5.1, 5.5.0, 5.3.0), `docs/aura3d-vs-threejs.md`, `docs/agents/README.md`, and `docs/agents/api-signatures.md`.
2. **Visual, material & post-processing contracts:** `docs/agents/art-direction.md`, `docs/rendering/postprocess.md`, `docs/rendering/material-matrix.md`, `docs/rendering/lighting-environment-color.md`, `docs/api/glsl-chunks.md`, `docs/api/toon.md`, and `docs/api/scatter-merge.md`.
3. **Game shell, motion, UI & QA standards:** `docs/api/game-kit.md`, `docs/api/motion-presenter.md`, `docs/agents/new-game-checklist.md`, `docs/agents/lessons-learned.md`, `docs/upgrade-5.0.0/README.md`, and `/Users/gurbakshchahal/.config/agent-policy/reference/ui-typography-density.md`.
4. **Canonical Aura3D skills in `packages/aura3d-cli/skills/`:** `aura3d-art-direction`, `aura3d-materials-environments`, `aura3d-game-art`, `aura3d-character-animation`, `aura3d-retexture`, `aura3d-browser-game`, and `aura3d-performance`.

---

## Phase 2 — Parallel Source + Screenshot Audit of All 30 Games

Use parallel read-only research subagents to inspect all **30 live games** listed in `docs/workflows/game-inventory.json` and `tools/site/games.catalog.json`:
- **19 standalone showcase apps** in `apps/showcase-<slug>/`: Aura Slam 3D, Apex Overdrive, Thermal Drift, Grid Dispatch, Iron Crown, Pip's Big Leap, Aura Hoops 3D, Aura Diamond 3D, Aura FC 3D, Aura Links 3D, Bunker Zero, Slingshot Siege, Glint Courier, Cross Hop, Shape Shift Sprint, Number Surge, Splat Turf, Polarity Orbs, Beat Hopper.
- **11 `replay-verified` ports** (inspect both the wrapper in `apps/showcase-*-port/` and the real game implementation in `examples/<folder>/` mapped by `tools/showcase-port-pages/names.json`): Craterline GP, Splat, Serpentine Sky Run, Gridlock Courier, Ion Circuit, Shadowstep Gauntlet, Lamplight Line, Saltwind Highway, The Bellkeeper's Walk, Duneglide, Cumulus Dash.
- For **every game**, inspect its actual scene/material/shader/HUD/camera source code, its `package.json` (confirming zero `three` packages), its `aura.assets.json` / `src/aura-assets.ts` models, its `docs/upgrade-5.0.0/<slug>.md` notes, and its current retained frames in `evidence/<evidenceFolder>/screens/final/` (both desktop `1280x720` and mobile `390x844` where present).

---

## Phase 3 — Define the "10/10 Blender-Grade in Aura3D 5.5.1" Bar Across 5 Pillars

Evaluate every game and prescribe concrete, code-level upgrades using real Aura3D 5.5.1 APIs across all five pillars:

1. **Physically Plausible Lighting, Atmosphere & Post Stack (Blender Eevee Look):**
   - Bespoke HDRI/IBL (`looks.preset(id, overrides)`, `environments.hdri/outdoor/room/nightCinematic/studio`, `looks.heroStage`), directional PCF key shadows (`lights.key`) paired with `effects.contactShadows`, GTAO/SSAO (`effects.ambientOcclusion` / `effects.contactOcclusion`), `effects.screenSpaceReflections` (wet asphalt, courts, polished floors, water), native WebGPU-batched `effects.depthOfField`, `effects.godRays` / `effects.volumetricBeam` / `effects.volumetricFog` / distance-calibrated `looks.fogForExtent`, `sky.preetham` / `sky.dayNight`, `effects.cinematicBloom`, `output.preset` filmic/AgX color grading, reversed depth, and optional `?gamut=p3` Display-P3 wide-gamut tuning—with zero ambient-light IBL flattening (`aura3d look lint` clean).
2. **Sculpted Geometry, Multi-Lobe PBR Materials, Retextured GLBs & Dual-Backend Shaders:**
   - Replace flat untextured primitive soup and washed-out grey-beige Meshy atlases with silhouette-rich typed GLBs (`model(assets.x)` admitted via `@aura3d/cli`), region-repainted PBR texture sets (`aura3d-retexture`, KTX2 compression), native procedural bevel/lathe/extrude/strata meshes (`primitives.roundedBox`, `primitives.lathe`, `primitives.extrude`, `geometry.define`), and multi-lobe physical materials (`material.physical`, `carPaint`, `clearcoatPaint`, `brushedMetal`, `studioGlass`, `fabric`, `felt`, `lacquer`, `ceramic`, `strata`, `caustics`, `toon`) with authored tangents, roughness variation, clearcoat, sheen, anisotropy, and emissive accents.
   - Where custom shaders (`material.custom` or `effects.shaderPass`) are proposed, require **paired native Aura3D GLSL 3.00 + WGSL twins** (`a3d_math`, `a3d_noise`, `a3d_sky`, `a3d_fog`, `a3d_toon`) so WebGPU (`backend: "auto"`) and WebGL2 render identically without any Three.js shader chunks or TSL.
3. **Rigged Animation, High-Refresh Motion, VFX & Camera/Impact Choreography:**
   - `AnimationController` layered clips/crossfades, `createLocomotion` with `createFootSlideMeter` under threshold, 2-bone IK / `attachToBone` (no rigid sliding meshes or secondary primitive limbs), `createFixedStepPresenter` for 0%-stalled 120/144 Hz motion, `createCameraClearance`, dynamic FOV/dolly framing (`camera.auto` / `camera.framePose`), `createHitStop` + `createJuice`, GPU-instanced set dressing (`instances.*`), and layered VFX (`effects.particles`, `trail`, `flipbook` sprite sheets, `auroraRibbon`, `meshParticles`, `rain`, `snow`).
4. **Broadcast / Console-Quality UI/UX, HUD, Audio & Mobile Ergonomics:**
   - Tactile title screens, instant 1-second objective readability, diegetic/clean DOM HUDs (`@aura3d/engine/game`, `apps/showcase-port-shared/quickbar.css`), rich results/lab/studio screens, and responsive procedural/SFX cue banks (`createCueBank`, `sfxUrl`).
   - Strict AuraOne typography & density compliance: self-hosted licensed `.woff2` fonts only (`Whitney` with `tnum` & lowercase `smcp`, `DIN Pro` for HUD scores/speeds/timers/deltas, `Monument Grotesk Mono` for seeds/diagnostics; `font-synthesis: none`; zero Inter, Roboto, Google Fonts, or bare system stacks).
   - Full `1280x720` desktop and `390x844` mobile parity (`44px` coarse-pointer touch controls, safe-area insets, collapsible panels, zero HUD overlap).
5. **WebGPU + Worker Performance & Hard Constraints:**
   - Preserve `renderer: { backend: "auto" }` (WebGPU default >= 0.92x WebGL2 with 0 errors), `?backend=webgl2` parity, and `?worker=1` worker rendering across all 30 games.
   - Address known 5.5.1 engine/scene bottlenecks (e.g., per-frame `update: "once"` reflection-probe re-captures in Glint Courier and Lamplight Line, headless draw/shader hotspots in Thermal Drift, Pip's Big Leap, and Splat Turf).
   - **Replay-parity hard rule:** For all 11 `replay-verified` ports, keep the deterministic fixed-step simulation (`1e-6` to `1e-12` reference trajectory parity) 100% untouched—decouple all visual, rig, camera-juice, shader, VFX, and HUD upgrades strictly into the presentation/render layer, and put source edits in `examples/<folder>/` followed by `node tools/showcase-port-pages/sync.mjs`.

---

## Phase 4 — Required Structure of `docs/project/30-games-10-of-10-visual-overhaul.md`

Do **not** modify game source code in this pass—produce only the exhaustive Markdown blueprint structured so a follow-up `"execute docs/project/30-games-10-of-10-visual-overhaul.md"` swarm can ship it directly:
1. **Executive Architecture & Visual Gap Matrix:** Summary table scoring all 30 games today (`Current Score /10` across Lighting/Post, Materials/Assets, VFX/Animation, UI/UX/Typography, Perf/WebGPU) and naming each game's #1 visual bottleneck.
2. **`WP-00` — Shared Cross-Game Visual, Shader, VFX & HUD Foundation (100% Native Aura3D):** Reusable upgrades in `packages/game`, `apps/showcase-port-shared`, shared native WGSL+GLSL shader chunks, flipbook/LUT/HDRI packs, and licensed HUD typography tokens that lift all 30 games at once with zero `three` dependencies.
3. **`WP-01` through `WP-30` — Deep-Dive Blueprint for Every Single Game (No Skipping or Grouping):**
   For each of the 30 games, include:
   - **Paths & Mode:** Exact `apps/showcase-...` (and `examples/...-port` if applicable) files, genre look recipe, current rendering diagnosis from real code + `evidence/.../screens/final/` frames, and replay-parity constraints.
   - **Blender-Grade Visual & Lighting Recipe:** Exact `looks.preset` / `environments.*`, key/fill/rim/local lights, `effects.*` post stack, sky/fog/water/weather parameters, and exposure/grade targets.
   - **Geometry, Materials, Retexturing & Custom Shaders:** Specific meshes/GLBs to replace or retexture, exact `material.*` presets/lobes, `instances.*` set-dressing additions, and dual native GLSL+WGSL shader specs (zero Three.js APIs or packages).
   - **Animation, Camera Choreography & Game Juice:** Rig/IK/locomotion fixes, camera framing/FOV/punch curves, hit-stop, particles/trails/flipbooks, and audio cues.
   - **UI/UX, HUD & Mobile Polish:** Title/HUD/results redesign, `Whitney` + `DIN Pro` metric typography layout, onboarding clarity, and `390x844` touch ergonomics.
   - **Executable Checklist (`- [ ]`) & Verification Gates:** Concrete implementation checkboxes plus exact verification commands (`aura3d look lint --json`, `node tools/game-checks/run.mjs <slug>`, zero-`three` package/import gate across `package.json` and source files, unit/replay vitest suite, real-GPU WebGPU vs WebGL2 + `?worker=1` frame check, and fresh desktop/mobile card & gameplay captures).
