## Code debt

The ceiling is architectural. Aura3D has no single place where "the renderer" can be fixed. Rendering features
reach pixels only if someone hand-wires them into one 18.7k-line bridge. When that bridge throws, it silently swaps
in a different renderer. The release process measures liveness, not appearance, so none of this ever registered as
a failure. Line counts come from `wc -l` at HEAD `c08d8acb` unless a research file is cited.

### D1. Renderer sprawl: 11+ front-ends, 2 devices, 4 live pipelines

- Front-ends (research/13 §2.1):
  - `Renderer`, `ProductionWebGL2Renderer`, `ProductionWebGPURenderer`, `ProductionRuntimeRenderer`
  - `CurrentRoutesInteractiveRenderer`, `AdvancedRenderer` (73 lines of pure delegation)
  - two different classes named `A3DRenderer` (`engine/src/advanced-runtime/A3DRenderer.ts:41`, `engine/src/production-runtime/index.ts:175`)
  - `LeanProductionRenderer`, `LeanProductRenderer`
  - an inline raw-WebGL2 renderer with its own GLSL and GLB parser (`agent-api/index.ts:15982-~17040`)
- Devices: `WebGL2Device.ts` (4,769) and `LeanWebGL2Device.ts` (4,537). The second is a ~92% copy-fork with
  only 346 differing lines, added in `efe051c0` to pass a bundle budget. Every device fix has to be made twice.
- Pipelines a game can actually land on (research/18 Q4):
  - the production bridge;
  - the silent `safe-basic` fallback, used when the bridge throws (`index.ts:12529-12548`; one light, no shadows,
    no IBL, `CULL_FACE` disabled);
  - the lean path, where lights and environment are no-op intents (`packages/lean/src/base.ts:252-259`);
  - the compat-source preset path, which runs rgba8 + Reinhard (Aura Clash only, research/19 C15).
- WebGPU: `WebGPUDevice.ts` (4,001) software-rasterizes every triangle inside `draw()`, caps instancing at 4, and
  is used by 0 games (research/07 §2.3-2.5).

### D2. The agent-api monolith

`packages/engine/src/agent-api/index.ts` is **18,733 lines**. It holds the builder vocabulary, scene flattening,
the production bridge, the fallback renderer, a GLB parser, the prompt compiler and diagnostics, with about 74
`export *` statements. A leaf imports it back (`Decals.ts ↔ index.ts`, research/13 §9).

Most of the verified look-killers live in this one file (research/19):

| Defect | Location |
|---|---|
| Ambient light zeroes IBL (15/18 games) | `:12693-12707` |
| DPR fixed at 1 | `:4256`, `:11133` |
| Tint strips textures and adds emissive | `:13567-13580` |
| Shadow strength 0.24-0.38 | `:12966-12968` |
| Exposure hard-coded to 1, colorGrade.exposure dropped | `:12898-12904` |
| Additive-Euler group transforms | `:17982-18006` |
| `createProductionInstanceTransforms` omits `node.size` (benchmark 16 bug, research/22) | `:14747` |
| No `environmentBackground` ever set | (absent from file) |
| Effect nodes declared "non-pixel-backed" | `:13722` |
| Prompt-plan fields ignored but echoed back | `:10118-10289` |

Because one file owns every concern, each look fix touches the same hot spot as every other workstream.

### D3. Most of the rendering package never reaches pixels

- **227 of 285** rendering files (**43.6k of 73.2k lines, 60%**) are outside the production renderer's import
  closure.
- The engine imports **57 of 632** runtime values from `@aura3d/rendering`.
- **31 files (4,928 lines)** have no consumer anywhere: `PbrReference.ts`, `ReflectionSurfaces.ts`, `VoxelWorld.ts`,
  `ScreenSpaceReflectionPass.ts`, `performance/{LOD,Octree,FrustumCuller}.ts`, and others. `Octree` returns
  `{bounds, items}` (research/13 §2.4).
- CSM, SSR, planar reflection, `EffectComposer`, `ReflectionProbe` and `TerrainTiles` are exported, tested and listed
  in feature lists, but none of them is on the game path.

### D4. Copy-pasted shaders

- `ShaderLibrary.ts` (3,331) and `ShaderLibraryCore.ts` (904) hold six hand-written programs: base PBR, textured,
  normal-mapped, instanced, skinned, and skinned-8. The lighting code is pasted into each with drift. For example,
  the rough-floor term is `mix(0.04,0.38,r)` in one and `mix(0.012,0.16,r)` plus extra stripes in another
  (research/02 §3, :122).
- Every program declares every sampler because of runtime-uniform branching. Each new feature costs about five
  edits.
- `pbr-direct.frag.glsl` is dead, yet reports cited it as the live shader (research/18 C3).
- Divergence bugs this produced:
  - Lights 17+ are silently dropped in the extension-textured variants (`ShaderLibrary.ts:3140-3147`, research/18 §2).
  - The single position-only `DepthPass` shader (`ShaderLibraryCore.ts:784-805`) ignores skinning, instancing,
    morphs and alpha-cutout (research/19 C4).
  - "AgX" and "Neutral" are per-channel curves, not the real operators (`WebGL2Device.ts:3541-3550`).

### D5. Duplicate implementations and duplicate exports

| Concern | Count | Evidence |
|---|---:|---|
| Scene representations | 6 | `Scene`, `A3DScene`, `AuraSceneSnapshot`, ECS `World`, lean builder, `Object3DCompat` (research/13 §6) |
| glTF/GLB parsers | ≥4 (+4 in template scripts) | `GLTFLoader.ts` (4,389), agent-api `parseGlb`, two asset corpora |
| Material preset registries | 6 | agent-api `material.*`, `MaterialPresets`, `CinematicMaterialPresets`, `ArchitecturalMaterialCatalog`, `AnimationMaterialStyle`, `@aura3d/materials` (used by nothing) |
| Math implementations / `Vec3` types | 4 / 5 | `@aura3d/math`, `scene/MathTypes`, `animation/Keyframe`, `physics/Shape` |
| Controls | 2 | `@aura3d/controls`, `@aura3d/input/controls` |
| `AnimationController` | 2 | engine 3,368 lines vs animation 1,017 lines; only the engine copy is live |
| Names exported by >1 package | 397 (53 with different declarations) | research/13 §5 |
| Alias subpath pairs | 4 | `engine`/`engine-runtime` and 3 more |
| Root "." exports | 1,726 vs three r185's 441 | 130 of them are evidence/report/audit types |
| Repo-only symbols (absent from the published "." entry) | 77 | 4 `external-parity-*` templates would break when installed from npm |

### D6. The evidence apparatus outweighs the engine

| Area | Size | Source |
|---|---:|---|
| `tools/` | 454 dirs, 126.6k LOC | research/14 §1 |
| `tests/unit` + `tests/browser` | 115.7k + 116.2k LOC | research/14 §1 |
| `benchmark(s)/` | 21.1k LOC | research/14 §1 |
| **Evidence total** | **~381k LOC, 5.2× `packages/rendering/src` (72.9k)** | research/14 §1 |
| Tool dirs that only aggregate prior JSON (no browser, no pixel decode) | 340 of 449 (76%) | research/14 §1.1 |
| Tool dirs that decode a pixel at all | 40 (9%) | research/14 §1.1 |
| Root `package.json` scripts | 560 (7 point at missing files) | research/14 §4 #30 |
| Unit tests asserting source substrings | 141 | research/14 §1.2 |
| `tests/reports` on disk | 9.5 GB, git-ignored, 60 files tracked | research/14 §1 |
| Commits that are evidence/claims/gates/PRD/amendments | 562/1,207 (47%); only 6.9% touched rendering source | research/01 §1.4 |

The suites that sit at the top of the release gate are fabricated or hand-labelled:
- `three-compat:compare-threejs` uses constant scores and Canvas2D "screenshots" (research/19 C18).
- The "54/54 matched" matrix is built from literal strings (research/14 §0.4).
- `superiorityTargetsMet` is vacuously true (research/14 §0.5).

### D7. Route-level debt in the 18 games

- 87.7k LOC across the 18 routes. **34% is evidence/proof/capture plumbing**: pulse-tunnel 65%, gravity-post 48%,
  aura-clash 47% (research/16).
- `?capture=review` is parsed in **16/18 routes** and branched on **395 times**. Review mode changes lights,
  emissives, materials, scale and pose, so evidence frames are not the player's frame (research/16 §3; research/11 #11).
- `createGameAudio` is wrapped 17 times in about 3.3k LOC of near-identical code.
- 13 copies of `write-performance-report.ts`, 13 hand-rolled RNGs, and 31+ `window.__X__` globals.
- **0** routes mount `game.effects().nodes()`, so engine juice draws nothing (research/16 §4, research/19 C8).
- The engine fps counter reports 60 while the harness measures 0.5-15 fps (research/20, Deep Recovery and others).

### D8. Fake public surfaces

- `@aura3d/three-compat` imports nothing from rendering. `createThreeCompatRenderer` does not exist. The 8
  `templates/three-compat-*` apps are 2-line files that a bundler can drop.
- `@aura3d/environments` exports two diagnostics and no environment.
- `@aura3d/materials` `NodeMaterial` returns a string.
- `@aura3d/lean` lights and environments are inert, and it is the default `create-aura3d` template path
  (research/13 §3, §7; research/19 C7).

### D9. Asset debt

- 71 of 131 `release` models contain no images, and 13 are 4-triangle `KHR_materials_unlit` cards.
- The release gate waives texture evidence when `suitabilityReason` matches
  `/stylized|flat-color|untextured/` (`packages/aura3d-cli/src/index.ts:3376-3382`, research/19 C19).
- 0 Draco/Meshopt/KTX2 assets, and no optimize stage.
- 1.7 GB of `public/aura-assets` is copied into every app's `dist` (research/11 §8).

### Why the debt blocks progress

1. **No composition point.** A rendering feature exists in up to five places: the shader copies, two devices, the
   bridge, and the fallback. Shipping it means wiring every one of them, and missing one fails silently.
2. **Failure is masked.** The bridge falls back instead of throwing. Builders accept parameters and drop them
   (lean `_options`, prompt-plan fields, colorGrade exposure). Diagnostics report success (fps 60, `visualSystems`
   echoes the input).
3. **Gates reward the status quo.** The composition QA was calibrated on current frames (research/14 §2.2). Pixel
   gates pass at 82% changed pixels / MAE 64. Review mode lets routes stage a different frame for evidence.
4. **The repo and npm resolve differently**, so in-repo tests cannot catch consumer breakage (research/13 §4).

---

## What should be deleted or replaced

Scope: rewrite or replace about **38k lines** and delete about **13k lines** of `packages/` (about 51k of 257k, about
20%). Delete about 250k LOC of evidence tooling and tests. Preserve the remaining ~80% of `packages/`, which includes
most of the code that is actually correct. The PRD IDs below are proposed; reconcile them with the PRD index section.

Proposed PRDs: **QR-01** single renderer + scene compiler · **QR-02** look-baseline defaults · **QR-03** shader/material
generator · **QR-04** shadows · **QR-05** HDR post chain · **QR-06** VFX/particles · **QR-07** instancing, perf and
tiers · **QR-08** animation authority · **QR-09** asset optimize + admission · **QR-10** evidence reset + quality bar ·
**QR-11** agent authoring path · **QR-12** shared game layer + portfolio · **QR-13** package surface.

### Delete / replace / rewrite

| Subsystem | Verdict | Reason | Evidence | PRD |
|---|---|---|---|---|
| `LeanWebGL2Device.ts` (4,537) | **delete** | 92% fork that exists only to meet a bundle number | research/13 §2.2 | QR-01 |
| Inline safe-basic renderer + GLB parser in agent-api (~1,050 lines, `:15982-17040`) and the silent fallback in `createProductionSceneRenderer` | **delete**; a bridge failure must throw visibly | Swaps in a one-light, no-shadow, no-IBL renderer on any exception | research/13 §2.3 | QR-01 |
| `AdvancedRenderer`, `CurrentRoutesInteractiveRenderer`, both `A3DRenderer`s, `LeanProductionRenderer`, `LeanProductRenderer` | **delete**; fold `ProductionWebGL2Renderer`/`ProductionRuntimeRenderer` into `Renderer` as backend selection | 11 front-ends with no owner | research/13 §2.1, §12.1 | QR-01 |
| `agent-api/index.ts` (18,733) | **rewrite**: split into a node-spec/builder layer (keep the vocabulary) and one `SceneSnapshot → RenderSource` compiler next to the renderer. Rule: nothing is exported until the compiler emits it | Monolith that hosts most of the verified look defects | research/13 §12.3, D2 above | QR-01 |
| `composeAuraTransform` additive Euler (`:17982-18006`) | **rewrite** as matrix hierarchy | Scaled and rotated groups render wrong (Courier city collapses ×6) | research/19 C6 | QR-01 |
| Default look path: ambient-zeroes-IBL, DPR 1, shadow 0.24-0.38, exposure 1, tint wipe + 0.28 emissive, solid-colour background, fog density 0.12 | **rewrite defaults**: ambient is additive; `min(dpr,2)`; shadow strength 1.0; exposure wired; tint multiplies `baseColorFactor` only; `environmentBackground` set; fog ~0.015 | Same defects in every `createAuraApp` scene | research/19 C1-C3, C9, C11, C12; research/02 §8 | QR-02 |
| Default environment (128×64 procedural, Reinhard→sRGB8 before prefilter, bound with non-mip `linear`) | **replace** with GPU PMREM of an HDR RoomEnvironment-equivalent in RGBA16F; read the mips; bind SH irradiance | Roughness has no effect on WebGL2; "IBL" is a flat gradient | research/19 C10; research/18 C4 | QR-02 |
| `ShaderLibrary.ts` + `ShaderLibraryCore.ts` six-program copy-paste (4,235) | **rewrite** as a chunk-assembled program generator keyed on a feature hash (three-style `getProgramCacheKey`); spec-correct sheen, clearcoat, transmission; no 16-light cap | Drift between copies; benchmarks 04/05/07 fail on material correctness | research/02 §7.1; research/23 (04: 4.5 vs 6.5, 05: 3 vs 6, 07: 3 vs 6) | QR-03 |
| `DepthPass` / `ShadowPass` / single-map fit / manual NEAREST PCF | **rewrite**: depth variants (skin, instance, morph, cutout); `sampler2DShadow`; CSM on the root path with texel-snapped fit; casters gathered from the light frustum | Bind-pose shadows, one-copy instanced shadows, faint and over-blurred shadows; **9 of 18** benchmark scenes cite shadows | research/19 C4, C5; research/23 (01, 02, 08, 09, 10, 12, 15, 17, 18) | QR-04 |
| Post: "FXAA" 4-tap blur on MSAA, raw-depth SSAO, bloom ×7 hidden gain with threshold ≤1, fake AgX/Neutral, CPU `*Pixels` kernels in `PostProcessPass.ts` (2,750) | **rewrite** as an HDR chain: GTAO/SSAO on linear depth, SMAA or TAA, a bloom pyramid with HDR threshold and no hidden gain, real AgX and Khronos Neutral, tone map last; **delete** the CPU kernels | No AO at gameplay distances; mid-tones bloom; aliasing | research/19 C12-C14; research/05 | QR-05 |
| Particles / rain / snow / flipbook / beam effect nodes (0 production pixels); single alpha-over blend | **replace** with a billboard/flipbook pass, additive and premultiplied blend modes, soft particles, and node add after mount | Benchmark 14: Aura 1/10; no game shows rendered particles | research/19 C8; research/23 (14) | QR-06 |
| Instancing: 64-uniform cap, per-frame VBOs plus a VAO leak, per-frame "static batching", WebGPU cap of 4, missing `node.size` | **rewrite**: persistent instance buffers, merge-once batching, VAO eviction | Benchmark 16: Aura 2.5/10, SSIM 0.399; draw-call-bound games at 5-8 fps | research/07 §3.3; research/22 (16) | QR-07 |
| Declarative performance budgets (`sceneKitPerformanceBudgets`, `gpuReady`, fps self-report) | **delete**; replace with measured rAF/`RendererTiming` values | Constants presented as measurements; the engine says 60 at 0.5 fps | research/07 §7; research/20 | QR-07 |
| `WebGPUDevice.ts` (4,001) as the production WebGPU path | **replace** (three r185 `WebGPURenderer` + TSL, Option A) **or freeze** until a material IR exists. Delete the CPU rasterizer in `draw()` and the marker-sniffing translation | Zero visual effect on games; would make them look worse if enabled | research/07 §10 | QR-07 |
| Animation: two `AnimationController`s, empty-pose freeze, no crossfade, 1 s defaulted durations | **rewrite** into one sampler/blender authority; `index.ts:13871` requires non-empty bones | Gallery Shift and the fighting template freeze; the taught skill pattern triggers it | research/19 C16; research/09 §9 | QR-08 |
| Asset admission: stylized regex waiver, 4-triangle release cards, JS-vertex-array "release" art, no optimize stage | **replace** with `aura3d assets optimize` (gltf-transform/gltfpack, KTX2, Meshopt, tangents, LOD) and a look-gated admission bar; demote code-built meshes to `proxy` | 71/131 release models have no textures | research/19 C19; research/11 §9 | QR-09 |
| Fabricated parity suites: `benchmarks/three-compat/shared/scenes.ts`, the 2 three-compat specs, 2 three-compat tools, `external-parity-roadmap-visual-quality`, "SSIM proxy", hand-labelled `parity-matrix.md`, `superiority-*` decisions, `external-parity-unity-unreal-parity` | **delete now** | Constants, Canvas2D paintings, vacuous truth | research/14 §6; research/19 C18 | QR-10 |
| ~340 report-aggregator tools; 141 source-substring unit tests; 560 scripts | **delete** down to ≤10 aggregators; keep only tests that guard real invariants; keep scripts under ~80 | Self-referential gates many hops from any pixel | research/14 §1, §6 | QR-10 |
| `?capture=review` forks (395 ternaries) | **delete**; add an engine `capture` mode that may set only camera pose, clock, seed and scenario, enforced by a lint on capture-conditioned look values | Evidence frames are not the shipped frame | research/16 §3 | QR-10, QR-12 |
| `@aura3d/three-compat`, 8 `templates/three-compat-*` stubs, `@aura3d/environments`, `@aura3d/materials` `NodeMaterial`, toy `Octree`/`FrustumCuller`/`LOD`, 31 orphan rendering files (4,928) | **delete**, or rebuild three-compat on the real renderer behind a working `WebGLRenderer` shim | No draw path; the ledger's "faithful" ratings are false | research/13 §6-7, §2.4 | QR-13 |
| `@aura3d/lean*` second builder API | **delete**, or make it a thin re-export of the one builder API, code-split | Same names with different semantics; the default template renders lightless | research/13 §3; research/19 C7 | QR-11, QR-13 |
| Root exports (1,726), alias subpaths, `ExternalParity*` (83) and evidence types, `dist/index.js`, tests/tools compiled into `dist` | **rewrite surface**: under ~400 runtime exports on "."; evidence types move to a `@aura3d/devtools` subpath; tsconfig/Vite paths generated from `exports` | Agents cannot tell which renderer is real; repo resolution ≠ npm | research/13 §4-5, §12 | QR-13 |
| Prompt-plan recipes that ignore camera/lighting/effects and echo them as `visualSystems`; name-based `material.visualQA` | **rewrite** to consume the fields, or drop them from the type | Lies to screenshot-repair loops | research/19 C17; research/12 §0 | QR-11 |
| Skills text (6× more evidence lines than craft lines) and the near-black ambient+directional starter recipe | **rewrite**: add an art-direction skill with a per-genre look recipe; give agents a remote screenshot loop | The recommended path converges on the retro look | research/12 §0, P1 | QR-11 |
| Per-route audio wrappers, RNGs, pause/visibility, performance-report copies | **replace** with a shared game layer (`game.audio` cue sets, `SeededRandom` on root, lifecycle) | ~3.3k + 1.1k duplicated LOC | research/16 | QR-12 |
| Orbital Defense | **delete** from the portfolio | 418 LOC; 1.5/10; silent | research/21; research/20 | QR-12 |

### Preserve (correct subsystems to build on)

| Subsystem | Why it is kept | Evidence |
|---|---|---|
| `Renderer` + `WebGL2Device` RGBA16F/MSAA/depth-texture targets and resolve (`WebGL2Device.ts:640-785`) | Correct HDR render-target core | research/02 §9 |
| BRDF chunk: GGX, height-correlated Smith, Burley, split-sum with Fdez-Agüera multi-scatter (`ShaderChunks.ts:43-245`) and the BRDF LUT | Benchmark 03 (helmet) 6.5 vs 7.0 and 11 (multi-light) 5 vs 5 show direct shading is near parity | research/04 §11; research/23 |
| ACES fit matching three r185 (`WebGL2Device.ts:3495-3517`), linear workflow, per-slot sRGB, single-encode present | Correct | research/05 §12 |
| `PBRHDRPipeline.ts` HDRI → RGBA16F PMREM chain + RGBE parser | Becomes the default environment instead of an unused option | research/02 §9; research/04 §11 |
| glTF loader breadth (clearcoat, specular, transmission, specGloss, animation pointer, KHR texture transform, tangents) | Asset side already feeds it | research/11 §10 |
| `WebGL2StateCache.ts`, `RenderGraph.ts`, `RendererTiming.ts`, `RenderItemSorting.ts`, VAO cache design (fix keying) | Correct infrastructure | research/07 §11 |
| `NativeBloomPyramid` planner (replace kernels and gain), CSM split and stable-fit math (`CascadedShadowMaps.ts`, `CascadeHysteresis.ts`), `EnvironmentBackgroundPass` (needs root wiring), fog chunk | Correct; currently unreachable or misconfigured | research/04 §11; research/08 §13 |
| `ResidentGPUParticleRenderer`, `GPUParticleBackend` WGSL kernels, CPU `ParticleSystem` + modules, `ProjectedDecalGeometry`, `TerrainHeightfield`, `OceanSurface` Gerstner, `WebGPUTemporal` TAA WGSL | Real implementations awaiting a scene pass | research/07 §11; research/08 §13 |
| `GLTFAnimationRuntime`, `skinning_common` (4/8 influences, data texture), clip events, `Inertialization`, `SpringBones`, two-bone/foot IK, Aura Clash combat→clip mapping | Correct math; mostly unwired | research/09 §10 |
| `createGameInput` (actions, buffering, gamepad, touch, replay), `PlatformerMotion`, `VehicleChassis`, `GameCameraRigs` math, `FrameLoop` + physics interpolation | Controls score 5-6 in research/20, the fleet's best non-visual category | research/10 §14 |
| `@aura3d/audio` `SpatialAudio`/`PositionalEmitter`, bus ducking, `createGameAudio` typed cues | Architecture is sound; the content is synthesized (17/18 games use oscillator WAVs) | research/10 §14; research/18 C12 |
| `@aura3d/physics` + `physics-rapier` + `navigation-recast` | Physics-feel highs (Vault Breakers 5.75, Siege Golf 6, Rooftop 5.75) come from Rapier | research/13 §13; research/20 |
| Typed assets (`model(assets.x)`), provenance ledger, content-hashed paths, `assets inspect`, Meshy spend controls | Prevents hallucinated assets; orthogonal to looks | research/11 §10; research/12 §11 |
| Genre kits (`game.platformer/racing/fallingBlocks/fighting`) as rules engines | The defects are in presentation, not rules | research/12 §11 |
| Package tiering (no package-level cycles), ESM + `sideEffects:false`, WebGPU behind a dynamic import | Correct packaging pattern | research/13 §13 |
| `benchmarks/quality-rebuild/` (18-scene same-input harness vs three@0.185.1), `tools/quality-rebuild-capture/` + `.github/workflows/quality-rebuild-capture.yml`, analytic pixel tests (`tests/visual/rendering-pixels.spec.ts`), head-to-head harness, hash-bound human-review workflow, premium-indie refs | The only evidence that measures appearance | research/14 §6; research/22 (harness verified fair) |

---

## The Aura3D Quality Bar

"Three.js-level" means a panel of judges looking at the **shipped default path** cannot rank Aura3D below a
well-built three.js r185 scene with the same input. The bar is defined on pixels judged by people and a vision
model. Gates, matrices and claim labels do not count toward it. Each domain has a **pass** threshold. All
thresholds hold on the default URL with engine defaults, captured on the remote harness.

### Where 3.0.1 stands (baseline for every threshold)

- **Renderer benchmark** (research/23, vision-judged, 18 scenes):
  - Aura mean **3.6**, three mean **5.4**.
  - Only **2/18** scenes are within 0.5: 03 helmet (6.5 vs 7.0) and 11 multi-light (5 vs 5).
  - 16/18 carry a major-deficiency or implementation-bug classification.
  - Worst scenes: 14 particles **1 vs 4**, 16 instancing **2.5 vs 4.5**, 05 transmission **3 vs 6**, 07 sheen
    **3 vs 6**, 06 roughness sweep **4 vs 7**.
  - The three.js scores are themselves capped at 4-7 by programmer-art content. Matching them is necessary but not
    sufficient (see R4).
  - Pass-1 code+metrics judges (research/22) scored three higher (about 6.5-8.5). Research/23 is the authoritative
    number.
- **Games** (research/21, vision-judged): overall **1.5-4/10**, median **3**, no game at 5. fps on the macos-14 runner
  is mostly 5-15. Deep Recovery runs 0.5-1, and only Orbital Defense and Vault Breakers reach about 60 (report.slim.json).
- **Perceptual metrics do not discriminate.** Whole-frame SSIM is **≥0.95 on 14/18** scenes, and MAE is 2.6-17.6,
  while the vision gap is 1-3 points (evidence/benchmark/report.json). SSIM only fell where the subject was missing
  (14: 0.558; 16: 0.399). This is why perceptual metrics are secondary signals here, never the gate.

### Renderer (same-scene benchmark)

Harness: `benchmarks/quality-rebuild/`, same SceneSpec, three@0.185.1 reference. Research/22 found it fair.

- **R1. Score.** For every scene, the panel score (protocol below) is **≥ three.js score − 0.5**.
- **R2. No disqualifying class.** No difference on any scene is classified `major-aura3d-deficiency`,
  `implementation-bug` or `missing-capability` (research/23 taxonomy).
- **R3. Region metrics as secondary signals.** Masks are generated from the SceneSpec geometry.
  - Shadow contrast under casters: receiver/caster-shadow luma ratio within ±15% of three. Today three is 19-27 on
    ground 127, while Aura is 122-124 on ground 134-137 (research/22 01).
  - FLIP (luminance) per object mask ≤ 0.10 and ΔE2000 ≤ 3 in lit regions.
  - Specular energy on metal masks within ±20%.
  - Each metric must reject a broken control (IBL off, shadows off, DPR 0.5, AA off) before it counts.
- **R4. Benchmark v2.** Add 6 "well-built" reference scenes in which three.js uses PMREM/RoomEnvironment, soft
  shadows with normalBias, GTAO, bloom, SMAA/TAA and AgX or Neutral, and scores **≥7**. R1-R2 apply to them too.
  This keeps the bar from becoming "match a dark test card" (research/14 §0.6).
- **R5. Cost.** Time to first frame ≤ 1.5× three on the same scene. Today it is 1.3-13× (06: 2,892 ms vs 218 ms).
  Draw calls ≤ 1.2× three.

### Product viewer

Input: a valid PBR GLB, `createAuraApp(scene().add(model(assets.x)))`, and **no lighting, environment or camera
authored**.

| Criterion | Pass condition |
|---|---|
| Lighting | Default HDR environment with prefiltered specular (roughness visibly varies), additive ambient, no flat-grey fill |
| Grounding | Contact shadow or AO under the object; cast-shadow strength 1.0 when a key light exists |
| Background | Neutral studio gradient or blurred env, not a solid void |
| Fidelity | Authored textures preserved; tint never drops maps; clearcoat, transmission and sheen match spec (research/23 04/05/07 classes ≤ minor) |
| Output | `min(dpr,2)` backing store, AA with no edge crawl at 1× zoom, ACES/Neutral tone mapping with highlights rolling off (no hard clip on chrome, research/23 02) |
| Camera | Auto-framed: subject fills 45-70% of frame height; orbit at ≥58 fps on Medium tier |
| Score | Panel ≥ **7.0** and ≥ three r185 (RoomEnvironment + ContactShadows reference) − 0.5 on each of 10 Khronos samples: DamagedHelmet, FlightHelmet, AntiqueCamera, WaterBottle, Corset, ToyCar, SheenChair, ClearCoatCarPaint, TransmissionTest, MetalRoughSpheres |

### Character

| Criterion | Pass condition |
|---|---|
| Playback | Clip actually sampled on the visible actor (`tracksApplied > 0`); real GLB durations; 0.2 s default crossfade; no empty-pose freeze |
| Shadows | Skinned shadow matches the posed silhouette: shadow-mask IoU ≥ 0.9 against a reference posed render |
| Motion | Foot slide < 2 cm per planted step; no per-bone angular-velocity spike > 3× clip median at transitions |
| Presentation | Rim/key separation from the background; textures and normal maps visible; never a 4-triangle card in a `character` role |
| Score | Panel ≥ **6.5** and ≥ three − 0.5 on benchmarks 08 and 15 and two v2 character scenes |

### Environment

| Criterion | Pass condition |
|---|---|
| Sky | Visible HDRI or analytic sky behind geometry (benchmarks 09/13 currently flag `hdri-background` missing) |
| Shadows | Cascaded, stable under camera motion, covering ≥ 100 m; no shadow-band artifacts (research/23 18) |
| Depth | Fog colour derived from sky/background; AO visible at 3-30 m gameplay distances |
| Detail | Tiled ground with mipmapped, anisotropic, repeat-wrapped textures (today `minFilter: linear`, clamp; research/06 #37) |
| Score | Panel ≥ **6.5** and ≥ three − 0.5 on benchmarks 09, 10, 17 and two v2 outdoor/indoor scenes |

### Games

Rubric: the 27 visual categories from research/21 (vision-judged) plus 6 non-visual categories from research/20:
sound_audio, controls, physics_feel, game_feel, loading_transitions, performance.

- **G1.** Overall ≥ **7.0/10**.
- **G2.** No category < **5**.
- **G3.** Measured rAF p50 ≥ **58 fps** and p95 frame ≤ **20 ms** on the game's declared tier hardware at that tier's
  DPR cap. Engine self-reported fps is inadmissible.
- **G4.** Desktop 1920×1080 and mobile 390×844 are both judged. Mobile must have touch controls and a full-bleed
  canvas (mobile_presentation ≥ 5).
- **G5.** Frames come from the **default URL only**. A capture mode may change camera, clock, seed and scenario,
  nothing else.
- **G6.** Sampled or designed audio. Oscillator-only cue sets cap sound_audio at 4, and the scores from oscillator
  sets in research/20 sit at 0-5.

Today **0/18** games pass G1. Every game fails G2. Typical fails are shadows 2, ibl_reflections 1.5-2,
postprocessing 1.5-2, vfx/particles 1-2 and performance 0.5-3 (research/20, 21).

### Agent-generated output

- **A1.** A fresh agent with no repo-internal knowledge uses only `create-aura3d` plus the installed skills and the
  recommended API. It runs on **12 standard prompts**: 3 product, 2 character, 2 environment, 4 game genres
  (platformer, racing, fighting, arcade) and 1 cinematic. Each prompt runs 3 times with different seeds.
- **A2.** Median panel score ≥ **6.5**, no prompt median < 5.
- **A3.** Zero renderer-knowledge escapes in the output: no `pixelRatio`, shadow strength, raw shader or
  `qualityProfile` overrides needed to pass. If an agent had to set them, the defaults have failed.
- **A4.** Each prompt's report fields describe only what was rendered. A `visualSystems` entry that does not
  correspond to pixels fails the run (research/19 C17).

### Scoring protocol

1. **Capture.** Remote GPU harness only: `.github/workflows/quality-rebuild-capture.yml` (macos-14, ANGLE Metal),
   plus a named tier device for G3. Never SwiftShader, never a local Docker host. Each frame is bound to its commit
   SHA, the harness run ID and the asset hashes.
2. **Rubric.**
   - Benchmark scenes use the research/23 template: per-image description, a difference table with the 6-class
     taxonomy (`equivalent`, `aura3d-better`, `minor-aura3d-deficiency`, `major-aura3d-deficiency`,
     `implementation-bug`, `missing-capability`), a 0-10 score per renderer, and a harness-fairness check.
   - Games use the research/21 template: 27 categories, a dominant-cause split, and a verdict. The research/20
     non-visual categories are added from measured data.
3. **Panel.** 2 humans (one art director, one rendering engineer, both named in the record) plus 1 vision model
   (claude-opus-5.5 via Kiro Prism, using the research/21/23 prompt).
   - Score = median of the three. A difference class stands if 2 of 3 assign it.
   - Any category with a judge spread > 2 is re-scored after a written reconciliation.
   - The vision model alone can never produce a pass.
4. **Calibration set.** Judges score it blind at the start of every round:
   - Known-bad: 3.0.1 Orbital Defense 1.5, benchmark 14 Aura 1.0.
   - Known-mid: three r185 benchmark frames at 4.5-7.
   - Known-good: v2 reference scenes plus the premium-indie stills from `tests/reports/_visual-critic-refs/`, moved
     into tracked `benchmarks/quality-rebuild/refs/` with licence records.
   - Broken controls: an IBL-off, shadow-off, DPR-0.5 or AA-off variant of a known-good frame must score ≥ 2 points
     below its source.
   - A judge whose calibration scores drift > 1.0 from the panel's frozen baseline is replaced for that round.
5. **No amendment mid-round.** Thresholds are frozen per round, and changing them requires a new PRD revision. The
   1.0 era amended the bar 25 times in 13 failing rounds (research/01 row 3).
6. **Admitted loss fails.** If any judge's prose or a harness verdict string records a visible loss, the item cannot
   pass (research/14 §7.7).

---

## Performance tiers

Nothing in the repo measures tier cost today. `AuraPerformanceQuality` is set by one game, budgets are constants,
and no mobile device has ever been tested (research/07 §7; research/18 §2.3). The values below are **targets** for
QR-07. Each target must be replaced by a measured value per tier on a named device before any tier claim.

The CI runner (Apple M1 Virtual, paravirtual Metal GPU, 3 vCPU, 7 GB) sits below Medium. Treat it as the **Low-desktop
proxy**: a Low-tier game must reach ≥ 55 fps there, which Orbital Defense and Vault Breakers already do.

| Setting | Low | Medium (default) | High | Ultra-Cinematic |
|---|---|---|---|---|
| Target hardware | Integrated GPUs (Intel UHD 620 / Iris Xe), mid-range mobile (iPhone 12-class, Snapdragon 7-series), CI runner proxy | Apple M1 / iPhone 14-class, GTX 1650 / RX 6500 | M2 Pro / M3, RTX 3060 / RX 6700 | RTX 4070+ / M3 Max; capture or offline use allowed |
| Frame target | 60 fps desktop, 30 fps floor mobile | 60 fps at 1080p | 60 fps at 1440p | 30-60 fps realtime; any rate for capture |
| DPR cap / resolution | min(dpr, 1.0); dynamic res 0.67-1.0 | min(dpr, 1.5); dynamic 0.75-1.0 | min(dpr, 2.0); dynamic 0.85-1.0 | native dpr; supersample 1.5× for capture |
| AA | MSAA 2× (no FXAA on top) | MSAA 4× or SMAA | TAA + MSAA resolve | TAA with 8× jitter accumulation for capture |
| Environment / IBL | PMREM 128 px cube, SH diffuse | PMREM 256 px | PMREM 512 px + visible HDRI | 1024 px + HDRI background at 2k |
| Shadows | 1 directional, 1 cascade 1024², HW PCF 4-tap; spots unshadowed | 2-3 cascades 2048², PCF 9-tap; 1 spot shadow | 4 cascades 2048², PCSS-lite; 4 local shadows | 4 cascades 4096², PCSS; contact shadows |
| AO | none (baked or contact blobs only) | SSAO half-res, linear depth | GTAO full-res | GTAO + bent normals |
| Bloom / post | 3-mip bloom, no gain, threshold ≥1 HDR; ACES/Neutral | 5-mip bloom; colour grade; vignette | 6-mip + lens dirt option; SSR on flagged surfaces | full pyramid; SSR; DoF; motion blur; 3D LUT |
| Lights (per view) | ≤ 4 dynamic | ≤ 16 clustered | ≤ 64 clustered | ≤ 128 clustered |
| Particles (live) | ≤ 2k CPU billboards | ≤ 10k | ≤ 50k GPU | ≤ 200k GPU, soft + lit |
| Draw calls / visible triangles | ≤ 150 / ≤ 300k | ≤ 400 / ≤ 1.5M | ≤ 1,000 / ≤ 4M | ≤ 2,500 / ≤ 10M |
| Texture max / VRAM | 1024, KTX2 ETC1S / ≤ 256 MB | 2048, KTX2 UASTC normals / ≤ 768 MB | 2048-4096 / ≤ 1.5 GB | 4096 / ≤ 3 GB |
| CPU frame budget (main thread) | ≤ 8 ms | ≤ 6 ms | ≤ 6 ms | ≤ 10 ms |
| Load (first interactive frame) | ≤ 3 s on 10 Mbps, ≤ 8 MB transfer | ≤ 3 s, ≤ 20 MB | ≤ 4 s, ≤ 40 MB | no limit for capture |

Bundle targets apply to all tiers, measured on the published package:
- Core renderer + builder API ≤ the three r185 equivalent + 20%, gzip. Today root "." is 575,343 B gzip against an
  80,000 B budget that is labelled "informational" (research/13 §9).
- Tier features (CSM, GTAO, TAA, SSR, GPU particles) load as lazy chunks, never as a second API with different
  semantics.

Today's numbers against these budgets (research/20; report.slim.json):
- Courier Rush makes about 1,530 draw calls at title, and Gravity Post 1,230-1,294, both at 5-8 fps. Both are over
  the High budget.
- Gravity Post loads 46.8 MB before ready.
- Aura Clash runs 11-13 fps with about 12.7 MB loaded.

Tier selection must be automatic. A GPU-tier probe picks the starting tier, and a frame-time governor driven by
`RendererTiming` steps resolution first, then AO, then shadows. Apps may pin a tier, but `safe-basic` DPR 1 must not
be the silent default.

---

## Engineering gates are not quality

These gates remain, and each one means only what is listed here:

| Gate | What it means |
|---|---|
| Typecheck, unit tests, packed-tarball template build | The code compiles and behaves as unit-specified, and consumers can install it |
| Route health 200, zero page errors, non-blank canvas | The route is alive |
| `check-deploy`, bundle-size budget | Shipping hygiene |
| Analytic GPU pixel tests (e.g. shadow < plane − 120) and golden-image regression per route on the remote GPU runner | **Regressions** against an already-approved frame. They cannot certify the first frame as good |
| Measured rAF/`RendererTiming` budgets | Performance. Engine self-reported fps is not admissible |

None of these is a quality claim, and none may appear in README, release notes or skills as one. "Visual QA PASS
17/17" passed three routes its own document called washed-out, bloom-blown and empty (research/14 §0.9). That is
exactly the failure being removed. Hand-labelled parity matrices, constant-scored suites and existence-checking
architecture verifiers are deleted rather than kept as gates.

The only release-blocking quality decision is the panel score against the bar above, on the shipped default path.
