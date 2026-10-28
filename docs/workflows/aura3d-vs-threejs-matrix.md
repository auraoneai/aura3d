# Aura3D 4.2.0 candidate vs three.js 0.185.1: feature and ecosystem matrix

Status: v3, 2026-10-25 (4.2.0 candidate on `game-rework`; rows say which version a number comes from). Companion documents: `threejs-parity-gaps.md` (gap register, per-game results), `game-conversion-playbook.md`, `evidence/vs-threejs/RESULTS.md` (measured size and performance, software GL) and `aura3d-vs-threejs-analysis-and-plan.md`. Rows quote measured figures only where they cite RESULTS.

## 0. How to read this

- three.js version is the one installed in `node_modules/three` (0.185.1). Aura3D version is the 4.2.0 candidate (`game-rework`) in this repo; bench timings are Aura3D 4.1.2 and say so.
- **Confidence** has three levels:
  - `verified in code`: I read the source in `node_modules/three` or in this repo and the member/behaviour exists as stated.
  - `doc claim only`: stated in a repo document or evidence README; I did not re-run it.
  - `unknown`: not measured here.
- **Verdict** is about the capability as a developer meets it today, not about aspiration. "Aura3D better" means Aura3D does the job with less code, fewer footguns, or better tooling for an agent-driven workflow. It does not mean faster at runtime unless the evidence says so.
- Everything in the Aura3D column was verified against the software-WebGL2 (SwiftShader) path, plus the owner's own Apple M4 Max screenshots for three games. There is no automated real-GPU proof (see section 6).
- Aura3D wraps a three.js-compatible renderer lineage (the engine is not a ground-up renderer). Where the two share a code path, the verdict is "tie".

## 1. Feature matrix

### 1.1 Rendering core

| # | Capability | three.js 0.185.1 | Aura3D (4.2.0 candidate unless a row says otherwise) | Verdict | Evidence | Confidence |
|---|---|---|---|---|---|---|
| 1 | WebGL2 renderer | `WebGLRenderer`, mature, widest hardware coverage | WebGL2 pinned by default | tie | `three/src/renderers/WebGLRenderer.js`; engine backend default in `createAuraApp` | verified in code |
| 2 | WebGPU renderer | First-class `WebGPURenderer` + node materials, `three/src/renderers/webgpu` | Not the default; legacy WebGPU path has failing mocks in the baseline test run | three.js better | `three/src/renderers/webgpu`; parity doc backend notes | verified in code (three), doc claim only (Aura3D status) |
| 3 | Automatic WebGL fallback from WebGPU | `webgl-fallback` renderer in `three/src/renderers` | Not applicable: WebGL2 is the default | three.js better | `three/src/renderers/webgl-fallback` | verified in code |
| 4 | WebXR | Built-in `WebXRManager` | Present in packages; real-headset use untested | three.js better | `three/src/renderers/webxr`; parity doc lists real-headset WebXR as untestable here | verified in code (three), unknown (Aura3D on hardware) |
| 5 | Tone mapping operators | ACESFilmic, AgX, Cineon, Neutral, Reinhard (constants) | `AuraToneMappingOperator` contract, names re-exported from rendering | tie | `three/src/constants.js`; `packages/engine/src/contracts/output.ts` | verified in code (three), unknown (full operator list in Aura3D) |
| 6 | Shader compile error reporting | `onShaderError` hook exists | Custom-material failures were silent until 4.1.x diagnostics; now reported | tie | `WebGLRenderer.js` (2 `onShaderError` hits); changelog 4.1.x shader diagnostics | verified in code (three), doc claim only (Aura3D fix) |
| 7 | Renderer-level black-frame self-heal | None | Safety net with frame tap, quality rung fallback, `?diag=1` panel | Aura3D only | `installSafetyNet`, `installFrameTap` exported from `@aura3d/debug`; fix in 4.1.2 | verified in code |
| 8 | Shadow maps (directional, spot, point) | All, plus VSM/PCF variants | Typed `shadows` node; directional receiver depth clamp fixed during the program | tie | `agent-api/nodes/shadows.ts`; parity doc engine findings | verified in code |
| 9 | Post-processing | `EffectComposer` and a large addon pass set (bloom, SSAO/GTAO, SSR, SSGI, DoF, etc.) | `effects` and `effects.post` typed nodes; deprecated legacy post chain still darkens frames (open, 4.2 candidate) | three.js better | `agent-api/nodes/effects*.ts`; parity doc open item | verified in code |
| 10 | Screen-space GI/AO/reflection depth | GTAO, SSR, SSGI passes | Approximated with Aura effects; gap register tracks | three.js better | gap register in `threejs-parity-gaps.md` section 3 | doc claim only |

### 1.2 Materials, lights, cameras

| # | Capability | three.js 0.185.1 | Aura3D (4.2.0 candidate unless a row says otherwise) | Verdict | Evidence | Confidence |
|---|---|---|---|---|---|---|
| 11 | PBR (Standard/Physical) | `MeshStandardMaterial`, `MeshPhysicalMaterial` | `material.*` typed builders | tie | `agent-api/nodes/material.ts` | verified in code |
| 12 | Toon, Matcap, Lambert, Phong, Normal, Depth, Distance, Shadow materials | All built in | No toon, Matcap, Lambert, Phong, Normal, Depth or Distance material builders; a screen-space `effects.toon` pass (bands, outline) exists since 4.1.3; codemod rows for these are `none` | three.js better | `agent-api/nodes/effects.toon.ts`; `migrate-three/mappings.ts` (47 `none` rows) | verified in code |
| 13 | Custom GLSL materials | `ShaderMaterial`, `RawShaderMaterial` | `customMaterial` with `#include` chunk registry (safe pow, colorspace decode, noise, hash, sky gradient) | Aura3D better | `agent-api/compiler/customMaterial.ts`; chunk library | verified in code |
| 14 | Node/TSL materials | Full TSL, about 638 exported names | `tsl` subset, 62 supported names | three.js better | `agent-api/nodes/tsl/index.ts` (`TSL_SUPPORTED_NAMES` has 62 entries) | verified in code |
| 15 | Lights | Ambient, Hemisphere, Directional, Point, Spot, RectArea, LightProbe | Typed `lights` node plus helpers `directionalLight/spotLight/pointLight` | tie | `agent-api/nodes/lights.ts`, `helpers.ts` | verified in code |
| 16 | Cameras | Perspective, Orthographic, Array, Cube, Stereo | `cameras.chase` (offset and framed modes), `cameras.cube`, `cameras.array`, `cameras.stereo` and `camera.orbit` | tie | `agent-api/nodes/cameras.ts`, `chaseCamera.ts`; `docs/api/camera-rig.md` | verified in code |
| 17 | Environment maps / IBL | `PMREMGenerator`, `RGBELoader`, `EXRLoader` | `environments.*` presets and typed HDRI asset admission | tie | skill `aura3d-materials-environments` | doc claim only |
| 18 | Sky, weather, water presets | Addon `Sky`, `Water`, `Water2`, `Reflector`, `Refractor` (assemble yourself) | `sky.dayNight`, `weather`, `water` one-call typed nodes | Aura3D better (convenience) | `agent-api/nodes/{sky,weather,water}.ts`; `three/examples/jsm/objects` | verified in code |
| 19 | Lens flare, marching cubes, shadow mesh, grounded skybox | Addons present | No equivalent found in typed API | three only | `three/examples/jsm/objects` | verified in code |

### 1.3 Geometry, instancing, compute

| # | Capability | three.js 0.185.1 | Aura3D (4.2.0 candidate unless a row says otherwise) | Verdict | Evidence | Confidence |
|---|---|---|---|---|---|---|
| 20 | Primitive set | Box, Sphere, Plane, Cylinder, Capsule, Torus, TorusKnot, Cone, Circle, Ring, Tube, Lathe, Extrude, Shape, Polyhedron family, Edges, Wireframe | `primitives`: box sphere plane cylinder capsule torus cone circle ring tube lathe extrude shape torusKnot polyhedron roundedBox | tie | `agent-api/nodes/primitives.ts` | verified in code |
| 21 | Instancing | `InstancedMesh` | `instances.mesh` | tie | `agent-api/nodes/instances.ts` | verified in code |
| 22 | Batching | `BatchedMesh` | `batched.mesh`; textures in instanced/batched meshes rendered white before the program fixed it | tie | `agent-api/nodes/instances.ts`; parity doc | verified in code |
| 23 | Static merge and scatter planners | `BufferGeometryUtils.mergeGeometries`; no scatter planner | `instances.scatter`, `geometry.mergeStatic` (promoted from games) | Aura3D better (convenience) | `packages/engine/src/public/index.ts` exports; `three/examples/jsm/utils/BufferGeometryUtils.js` | verified in code |
| 24 | Surface sampling | `MeshSurfaceSampler` addon | Scatter planner covers placement; no direct sampler | three.js better | `three/examples/jsm/math/MeshSurfaceSampler.js` | verified in code |
| 25 | LOD | `LOD` object | `distanceLod` (per performance skill) | tie | skill `aura3d-performance` | doc claim only |
| 26 | Compute | `WebGPURenderer` compute via TSL | `compute` node | unknown | `agent-api/nodes/compute.ts` exists; practical coverage not measured | unknown |
| 27 | Debug helpers | Axes, Grid, PolarGrid, Box3, Arrow, Camera, light helpers | Same set in `helpers` | tie | `agent-api/nodes/helpers.ts` | verified in code |

### 1.4 Assets, animation, audio

| # | Capability | three.js 0.185.1 | Aura3D (4.2.0 candidate unless a row says otherwise) | Verdict | Evidence | Confidence |
|---|---|---|---|---|---|---|
| 28 | glTF/GLB loading | `GLTFLoader` (+ Draco, KTX2, Meshopt) | Typed `model(assets.x)`; raw string URLs rejected by boundary test | Aura3D better (safety) | `tests/unit/agent-api/public-example-boundary.test.ts` | verified in code |
| 29 | Other formats (FBX, OBJ, USD, 3DS, Collada, etc.) | Many loaders in addons | Excluded by design (parity doc section 4) | three.js better | `three/examples/jsm/loaders`; parity doc exclusions | doc claim only |
| 30 | Asset provenance and integrity | None | Production bridge needs same-origin URL + sha256 + provenance, else draws nothing | Aura3D only | production bridge rules; `assets validate` | verified in code |
| 31 | Getting assets for a need | None (bring your own files or write geometry) | No catalog. `aura3d assets resolve "<need>"` picks, at build time, an admitted project asset, a licence-clear open-source file (Poly Haven, ambientCG, Khronos samples, a CC0 mirror), Meshy generation (opt-in, budgeted) or a primitives recipe | Aura3D only | `packages/aura3d-cli/src/resolve-ladder.ts`, `tests/unit/aura3d-cli/resolve-ladder.test.ts`; 10 real needs: 7 open-source, 2 recipes, 1 none (`docs/audit/asset-catalog-claim.md`) | verified in code |
| 32 | AI asset generation pipeline | None | Meshy through Kiro Prism with ledger caps, isolated admission and attribution records | Aura3D only | `meshy-cli` skill; `/tmp/meshy` ledger (not in repo) | doc claim only |
| 33 | Skeletal animation | `AnimationMixer`, clips, `SkeletonUtils` | `AnimationController`, `cloneSkinned`, clip events, morph/viseme state | tie | skill `aura3d-character-animation` | doc claim only |
| 34 | Positional/spatial audio | `Audio`, `PositionalAudio`, `AudioListener` | `@aura3d/audio` mixer, `AudioContextManager`, game sound engine | tie | `packages/audio` | doc claim only |
| 35 | Procedural audio cue kit | None | `createCueBank`, `midiToHz`, `melody`, gesture unlock | Aura3D only | promoted from 9 games (promote candidates #4) | verified in code |

### 1.5 Developer experience and agent workflow

| # | Capability | three.js 0.185.1 | Aura3D (4.2.0 candidate unless a row says otherwise) | Verdict | Evidence | Confidence |
|---|---|---|---|---|---|---|
| 36 | Typed scene API | Imperative object graph | Declarative `scene({...})` with typed nodes; one `createAuraApp` entry | Aura3D better | `packages/engine/src/agent-api/nodes/*` | verified in code |
| 37 | TypeScript types | Separate `@types/three` package (DefinitelyTyped) | Types ship with packages | Aura3D better (minor) | `node_modules/@types/three` present; public engine `.d.ts` | verified in code |
| 38 | Agent-readable docs | None official | `llms.txt` (a one-screen fast path), `llms-full.txt`, `docs/agents/*` with compiled recipes, claims-and-boundaries, 14 skills synced to `.cursor/.claude/.agents` | Aura3D only | `AGENTS.md`; `check:skills` gate; `docs/agents/recipes.md` | verified in code |
| 39 | Project scaffolding | `create-vite` templates in the community | `create-aura3d` with game templates (mini-game, racing, falling-blocks, fighting, character-controller) | Aura3D better | `packages/create-aura3d/templates` | verified in code |
| 40 | Deploy/route health checks | None | `check-deploy`, route-health, evidence collection (`collectAuraSceneEvidence`) | Aura3D only | CLI; `aura3d-evidence-review` skill | doc claim only |
| 41 | Game test hooks, deterministic replay and a game beacon | None | `installQaHooks`, `createFixedStepLoop`, seeded replay with `createCountedRng` (draw counter), `installGameBeacon().publishEvidence` | Aura3D only | promoted QA kit; replay tests across the ports; `docs/api/game-cheatsheet.md` | verified in code |
| 42 | Migration tooling | N/A | `aura3d migrate three` codemod: 245 rows (48 exact, 150 approximate, 47 none, 0 pending) | Aura3D only | `migrate-three/mappings.ts` | verified in code |
| 43 | Game kit (HUD, touch, juice, session) | None | `@aura3d/engine/game`: HUD widgets (including compass and canvas minimap), touch controls, juice, session, accessibility, audio cue bank, safety net, QA hooks; a worked sample in `docs/agents/build-a-game.md` | Aura3D better (convenience) | `docs/api/game-kit.md`; `docs/api/game-cheatsheet.md` | verified in code |
| 44 | Examples and learning material | Huge official examples and manual | Fewer, agent-oriented docs | three.js better | `three/examples`; repo docs | verified in code |

### 1.6 Ecosystem, maturity, risk

| # | Capability | three.js 0.185.1 | Aura3D (4.2.0 candidate unless a row says otherwise) | Verdict | Evidence | Confidence |
|---|---|---|---|---|---|---|
| 45 | Adoption | 15,202,672 weekly npm downloads | 391 weekly (`@aura3d/engine`) | three.js better | npm downloads API, week 2026-10-16 to 2026-10-22 | verified (snapshot) |
| 46 | Release history | 314 published versions | 43 published versions (`@aura3d/engine`) | three.js better | `npm view`, 2026-10-25 | verified (snapshot) |
| 47 | Third-party ecosystem (R3F, drei, tutorials, jobs) | Very large | Essentially none outside this repo | three.js better | n/a | doc claim only |
| 48 | Core bundle size | Tree-shakable; a minimal app is small (one-cube app 495.7 KB raw, 124.8 KB gzip, 1 file in the 4.1.2 bench) | Stock hello-world 3,262 kB raw / 964 kB gzip at 4.1.3, 3,395 kB / 1,062 kB with the embedded neutral environment (4.2.0 candidate); 4.1.2 bench: 3,841 KB raw / 1,089 KB gzip in 25 files; the engine core fails its own published budget | three.js better | `evidence/stock-build/`, `evidence/neutral-embedded/`, `evidence/vs-threejs/RESULTS.md` section 4, `BUNDLE_SIZES.md` | verified (measured; methods differ between rows, see the labels) |
| 49 | Source size for the same scene | Verbose imperative code | Shorter scene source in 4 of 5 scenes (non-blank lines: 24 vs 49, 49 vs 71, 45 vs 62, 61 vs 82); cube 18 vs 15 and water 87 vs 86 not shorter; extra build files needed in 4.1.2; one author, software-GL harness | Aura3D better (scene source only) | `evidence/vs-threejs/RESULTS.md` sections 1 to 3 | verified in code (counted; one-author caveat) |
| 50 | API hygiene | Stable, slowly evolving | Root surface has 240 live value exports and 42 deprecated value exports (47 `@deprecated` annotations including types; each names a replacement or says there is none) | three.js better | `packages/engine/src/public/index.ts` | verified in code |
| 51 | Test baseline | Large upstream suite | 2,080 unit tests pass across 212 of 215 test files on the 4.2.0 candidate; 6 failures in 3 files (among them three `aura3d-cli` asset-screening and two `game-runtime` contract tests) also fail on clean `main` | three.js better | integration run on `game-rework` (`06cf4f7eb`) | verified (run) |
| 52 | Real-GPU verification | Upstream CI plus massive field use | Software WebGL2 only; three real-device checks came from the owner's M4 Max | three.js better | evidence folders; parity doc | doc claim only |
| 53 | Bugs found on real hardware during this program | n/a | NaN from `pow(negative)` on Apple GPUs, empty-instance throws, white instanced textures, silent shader failures, black-frame guard misfire (fixed in 4.1.2) | three.js better | changelog 4.0.8 to 4.1.2 | doc claim only |
| 54 | Provenance/legal posture for assets and claims | Not applicable | Claim labels, boundary doc, text-only Meshy prompts | Aura3D better | `docs/agents/claims-and-boundaries.md` | doc claim only |

### 1.7 Added or measured since the 4.1.2 matrix

| # | Capability | three.js 0.185.1 | Aura3D | Verdict | Evidence | Confidence |
|---|---|---|---|---|---|---|
| 55 | Gameplay motion kit (bone attach, stride-synced locomotion, foot-slide meter, impact response with hit-stop and shake, pose smoothing, double-frame detector) | None built in (`AnimationMixer` and manual attachment) | `attachToBone`, `createLocomotion`, `createFootSlideMeter`, `createImpactWorld`, `createHitStop`, `createCameraShake`, `smoothDamp`, `checkDoubleFrame` from `@aura3d/engine/game` | Aura3D better (convenience) | `docs/api/motion-*.md`; used by the rework of the shipped games | verified in code (new in 4.2.0; checked on software GL) |
| 56 | High-refresh render interpolation | None (apps write their own) | `createRenderInterpolator`, `createFixedStepPresenter`, `runMotionGate`: a 60 Hz sim no longer stands still on every second frame at 120 Hz (50% before, 0% after; 58% before at 144 Hz) | Aura3D only | `docs/api/motion-presenter.md`; `docs/audit/motion-audit.md` | verified (simulated 60/120/144 Hz; a real 120 Hz display was not tested) |
| 57 | Safe first frame and frame errors | None | `warmPrograms(app)` waits for shader programs and the environment; `createFrameErrorBoundary` reports a throwing frame and keeps drawing | Aura3D only | `docs/api/game-kit.md`; `@aura3d/debug` | verified in code (new in 4.2.0) |
| 58 | Blind A/B judge for look comparisons | None | `aura3d evidence judge` (a model judge through Kiro Prism, not a human) | Aura3D only | `docs/api/cli-asset-tools.md` | verified in code |
| 59 | Agent authoring speed (cold start) | Median 4 turns; 15 of 15 first-try builds; 15 of 15 final renders non-black | Median 10 turns (40 at baseline); 15 of 15 first-try builds; 14 of 15 final renders non-black; 13 of 15 first-try typechecks | three.js better | `evidence/agent-eval/baseline1/NOTES.md` | verified (claude-sonnet-5.5, n=15, 40-turn budget, software GL; three.js has far more training data) |
| 60 | Frame cost on software GL | Cube 0.9 ms | Cube 623 ms at 4.1.2, about 50 ms after the 4.1.3 fixes; forest (18,000 instances) 38 s to 6.4 s per frame | three.js better | `evidence/perf-frame-cost/` | verified (software GL only) |

## 2. Row counts by verdict

Counts are computed from the table above by the verdict column (see section 8 for the command).

| Verdict | Rows |
|---|---|
| Aura3D better | 11 |
| three.js better | 20 |
| tie | 15 |
| Aura3D only | 12 |
| three only | 1 |
| unknown (verdict withheld) | 1 |

Counting rows is not a score. The three.js-better rows are the ones a heavy graphics project hits first; the Aura3D rows are mostly workflow and safety advantages.

## 3. What three.js has that Aura3D lacks or approximates

Ranked by how often a browser game runs into it. Gap ids refer to `threejs-parity-gaps.md` section 3; "codemod" is the status in `mappings.ts`.

1. **Non-PBR material family** (Toon, Matcap, Lambert, Phong, Normal, Depth, Distance, Shadow). Codemod: `none`. Games get toon looks through a custom shader pass (Silt) rather than a material. Promotion candidate #11 (`effects.toon`).
2. **Post-processing depth** (GTAO, SSR, SSGI, DoF pass set). Codemod: approximate. The legacy post chain still darkens output (open, 4.2 candidate).
3. **TSL breadth** (62 names against about 638). Codemod: approximate.
4. **First-class WebGPU renderer.** Aura3D pins WebGL2.
5. **Camera variety** (Array, Cube, Stereo) and ready-made gameplay rigs.
6. **Addon objects** (Lensflare, MarchingCubes, ShadowMesh, GroundedSkybox, Reflector/Refractor as objects). Codemod: mostly `none`.
7. **Format loaders beyond glTF.** Deliberately excluded.
8. **Surface sampler** (`MeshSurfaceSampler`).
9. **Ecosystem and field testing.** Downloads, third-party libraries, tutorials, years of hardware reports.
10. **Bundle size.** Aura3D fails its own published budgets.

## 4. What Aura3D has that three.js lacks out of the box

Separated into genuinely unique and convenience wrappers over things three.js can also do.

### 4.1 Unique (no first-party three.js equivalent)

- Agent-readable documentation set (`llms.txt`, anti-hallucination boundaries, mirrored skills with a CI-style gate).
- Production asset bridge: same-origin URL, sha256, provenance, otherwise nothing draws.
- `check-deploy` and route-health collection for shipped routes.
- Runtime safety net: black-frame self-heal with quality ladder and `?diag=1` panel.
- Deterministic game QA hooks and fixed-step replay used by 11 ports.
- Meshy admission pipeline with ledger caps and attribution records.
- three.js to Aura3D codemod with an honest exact/approximate/none classification.
- `aura3d assets resolve`: build-time asset ladder (project, open CC0 sources, Meshy, primitives recipe).

### 4.2 Convenience wrappers (three.js can do it, with more code)

- Declarative typed scene API and one-call `createAuraApp`.
- `sky.dayNight`, `weather`, `water` presets.
- Scatter and static-merge planners.
- Procedural audio cue bank.
- Game kit (HUD, touch controls, juice, session lifecycle).
- Project templates for five game genres.
- Shader chunk library with safe math helpers.

## 5. Maturity and risk facts

- Aura3D is 24 public packages (4.1.3) with the 4.2.0 candidate adding no new package; the root `@aura3d/engine` surface has 240 live value exports and 42 deprecated value exports (47 `@deprecated` annotations including types).
- Release cadence in this program: 4.0.8, 4.1.0, 4.1.1, 4.1.2, 4.1.3 within days (4.2.0 is the next release). Each patch fixed a real defect found after publish (for example the 4.1.1 self-heal misfire from rAF reads on a non-preserved drawing buffer).
- Documented weaknesses, all open at time of writing: bundle budgets failing (a stock hello-world is 7x to 8x larger than three.js), 6 unit-test failures in 3 files that also fail on clean `main`, software-GL-only verification, legacy post chain darkening, two of the games (HEATSINK port, Last Train) not completing automated checks under software GL.
- Risk if adopting today: you carry the migration cost and the verification gap; you gain a typed API and agent tooling. Risk if staying on three.js: none of Aura3D's safety rails, more code per scene.

## 6. What the shipped games and the Aura Slam conversion prove, and do not

**Proves (as far as the evidence in the repo goes):**
- Aura3D can express a wide range of browser games: the 15 index games and 11 renamed Crayon-style games (the live count is generated from `docs/workflows/game-inventory.json`), on the 4.x lineage with Meshy art and no host engine pins. Each has an evidence folder and screenshots under `evidence/<game>/screens/`.
- A real, complex game (Aura Slam) can be reproduced on Aura3D modules with a simulation bit-identical in differential tests against the original scripts and pose output pixel-identical (`evidence/aura-slam/`).
- Deterministic replay of simulation state to within tolerance (for example the HEATSINK port at 1e-6).
- Live-site smoke runs for the 4.1.x deployments (`evidence/live-410`, `live-411`, `live-412`, `live-413`), all on software GL.
- A cold-start agent trial (`evidence/agent-eval/`): 15 of 15 first-try builds and 14 of 15 non-black final renders for Aura3D from docs only, against 15 of 15 and 15 of 15 for three.js; median 10 turns against 4.

**Does not prove:**
- Render parity on real GPUs. Parity metrics (luma/RGB JSD, edge density, mean luma delta) were collected on SwiftShader.
- Human-perceived equality. The blind judge is a model (claude-sonnet-5.5 through Kiro Prism, seed 20261023, 48 trials); for HEATSINK it picked the original in 35 of 48 trials, so the art is still visibly different.
- Aura Slam on real GPUs. The swap is done: the native route is live (merge `09ccc9518`), G1 replay and G3 render gates passed, and `evidence/live-slam/` shows 119 draw calls against the 150 budget with 0 console errors, but that live check ran on software GL. Tournament, online play and character select are not in the native game.
- Performance advantage. Frame times were not measured on real hardware here.
- That three.js is gone from every app in the repo. The 15 index games and 11 ports scan clean (no three.js code, vendored engine bundles, internal imports or patch markers; `docs/workflows/aura3d-only-audit.md`); apps outside those 26 were not re-scanned.

## 7. Caveats

- The npm download and version counts are a snapshot (downloads for 2026-10-16 to 2026-10-22, versions on 2026-10-25); refresh before quoting externally.
- Rows marked `doc claim only` or `unknown` should not be used in public claims until checked. The repo's `claims-and-boundaries.md` applies.
- This document compares capabilities, not tutorials, community, or hiring pool. Those favour three.js and are not scored.

## 8. Reproducing the counts

```sh
awk -F'|' '/^\| [0-9]+ \|/ {v=$6; gsub(/^ +| +$/,"",v); sub(/ \(.*/,"",v); print v}' docs/workflows/aura3d-vs-threejs-matrix.md | sort | uniq -c
```
