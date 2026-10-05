# PRD 03: Postprocessing, Anti-Aliasing, Tone Mapping, Cinematic Pipeline

Status: draft for implementation. Branch of record: `aura3d-quality-rebuild/audit`.
Evidence base: research reports 02, 05, 06, 18, 19, 20, 21, 22, 23 in
`docs/project/aura3d-quality-rebuild/research/`. Captures come from GH Actions run 37289688772
(macos-14, ANGLE Metal, Apple Paravirtual GPU).

This PRD covers everything between "the forward pass wrote an HDR pixel" and "the browser
composited the canvas": pass ordering and formats, AO, SSR placement, TAA/upscaling, bloom, DOF,
motion blur, exposure, tone mapping, grading/LUT, vignette/grain/CA, dithering, output encode,
post-AA, the CPU-readback fallbacks, cinematic presets, and how all of this maps onto quality tiers.

Read this first. Post work is necessary but it will not make the games competitive by itself. The
vision judge says so directly for several games: "Post-processing and camera tweaks alone won't lift
this above about 4" (21, turbo-drift verdict). In the same-scene benchmark, most of the Aura-vs-three
gap comes from shadows and IBL (PRD 02), not post (23). This PRD is done when the post chain stops
*subtracting* quality (blur-AA, mid-tone bloom haze, dropped exposure, zero-output AO, 8-bit
banding, CPU readback stalls) and can *add* the modern HDR look that well-built three.js work
ships. The shipped-app gate belongs to PRD 14.

---

## 1. Problem statement

The post chain the 18 games run every frame has five problems. It lowers image quality, it
misreports what it does, and in one game it destroys the frame rate.

1. **Anti-aliasing blurs the image.** 17 of 18 games author `effects.antiAlias({mode:"fxaa"})`
   (18 §C11). That runs a thresholded 4-tap cross blur, not FXAA, on top of 4× MSAA that has already
   run (19 §C14). The default DPR path ignores `devicePixelRatio`, so on HiDPI displays the
   softening lands on a frame with 1/4 of the native pixels (19 §C2).
2. **Bloom washes out mid-tones and erases hero objects.** The repo-wide recipe
   `quality:"balanced", softKnee:0.5, shoulder:0.6` is the validator maximum. Combined with a hidden
   ×7 (balanced) or ×17 (cinematic) response gain, it blooms linear luma from 0.05–0.34 upward
   (19 §C13). Vision judgment confirms it on shipped frames. Courier Rush's "player van [is] almost
   entirely clipped to white by bloom"; Deep Recovery shows "a huge overexposed bloom blob"; Mech
   Hangar's emissive strips are "blown to near-white" (21). On benchmark scene 18 the orb halo is
   "much larger and stronger" than three (23 §18). The harness uses `quality:"cinematic"`, which
   puts ×17 on the authored strength (`benchmarks/quality-rebuild/aura3d/common.ts:255`).
3. **Tone mapping and grading are fixed and misreported.** The root path hard-codes ACES at
   exposure 1 (`index.ts:12898-12904`). `colorGrade.exposure`, which 16 root games set, is dropped.
   So are `shadows/highlights/lut`. AgX and Neutral are per-channel stand-ins. Aura Clash takes a
   different path, `GameRenderPreset`, and gets rgba8 + Reinhard (19 §C12, §C15). Diagnostics report
   an exposure preset that is never applied (05 §2.3). The vision judge scores tone mapping 2–4 on
   most games ("murky mid-grey", "clipped whites next to murky mid-blue", "hard white clipping on the
   van … while the rest is crushed"; 21).
4. **Depth effects compute nothing or the wrong thing.** SSAO compares raw non-linear depth with a
   raw bias of 0.025. At the default near 0.05 / far 100, occlusion is effectively zero beyond about
   2 m (19 §C14). It runs on 7 games. Every depth pass is linearized with a hard-coded 0.1/1000
   range, because `Renderer` never passes the camera's real range (02 §3.7). SSAO, SSR, DOF, motion
   blur, TAA and outline run on 8-bit tone-mapped data (06 §5).
5. **Some passes read back to the CPU every frame.** `volumetric-light`, `chromatic-aberration`,
   `film-grain` and `contact-shadow` are not fusable (`Renderer.ts:2111-2118`). They force
   `readPixels` → JS kernel → upload (`Renderer.ts:1245-1280`). Deep Recovery, the one game using
   `effects.volumetricFog`, measured **0.5 fps at 1920×1080 and 1.1 fps at 1280×720** on the capture
   runner (evidence/games/report.slim.json). On that path its bloom is replaced by a 1–4 px
   hard-threshold JS blur (05 §5.4).

There are also missing capabilities that modern three.js work treats as baseline: real FXAA,
SMAA, HDR TAA with motion vectors for skinned and instanced geometry, a working GTAO, a bloom mip
pyramid with an HDR threshold, real AgX and Khronos Neutral, 3D LUTs, vignette/grain on the GPU,
output dithering (none exists, 05 §7), user-insertable passes, and cinematic presets that map onto
quality tiers. Today the "tiers" only change DPR (06 §3).

## 2. Evidence from current code (path:line)

All paths are relative to `/Users/gurbakshchahal/platforms/aura3d/`.

### 2.1 Pipeline shape

| Finding | Location |
|---|---|
| Root always submits post: `targetFormat:"rgba16f"`, ACES, exposure 1, whitePoint 1 | `packages/engine/src/agent-api/index.ts:12797-12935` (tone mapping at `:12898-12904`) |
| Fixed pass order `bloom → tone-mapping → volumetric-light → color-grade → chromatic-aberration → film-grain → depth-of-field → motion-blur → contact-shadow → ssao → ssr → taa → outline → fxaa` | `packages/rendering/src/RendererPostprocessPlan.ts:178-223` |
| Fusable set excludes volumetric-light/CA/grain/contact-shadow; rank order forces DOF/MB/SSAO/SSR/TAA after tone-map | `packages/rendering/src/Renderer.ts:2111-2137` |
| CPU readback per-pass path (`readPixels` → JS kernel → write) | `packages/rendering/src/Renderer.ts:1245-1280` (sync), async variant following |
| Fusion is all-or-nothing: if any pass is non-fusable, `executeFusedLdrPostprocess` returns false (`Renderer.ts:993`) and the **whole** chain runs the fallback loop (`:994-1067`). HDR bloom + tone map then run as `readFloatPixels` → `bloomFloatPixels` → `toneMapFloatPixels` on the CPU (`:996-1028`), and every later pass gets a fresh `rgba8` target allocated per frame (`:1030-1037`) | `packages/rendering/src/Renderer.ts:977-1067` |
| GPU uber-chain in device: resolve → bloom → tone-map+grade into ping-pong → DOF → MB → SSAO → SSR → TAA → outline → FXAA to canvas | `packages/rendering/src/WebGL2Device.ts:871-1110` |
| Ping-pong targets are rgba8 unless `sourceIsHdr && bloom` | `packages/rendering/src/WebGL2Device.ts:946-948` |
| Bloom pyramid composites to a full-res ping-pong with `intensity * resolveBloomPyramidResponseGain(plan)` | `packages/rendering/src/WebGL2Device.ts:1004-1007`, `:2434` |
| Same shader set duplicated in the lean device | `packages/rendering/src/LeanWebGL2Device.ts` (FXAA ~`:3390-3410`, SSAO ~`:3009-3032`, bloom extract `:2752-2756`, AgX/Neutral `:3320-3338`) |
| `EffectComposer` is a CPU readback composer, not on the game path | `packages/rendering/src/postprocess/EffectComposer.ts:149-160, 315-333` |
| `cinematic/*Pass.ts` (Bloom, Vignette, FilmGrain, DepthHaze) are data descriptors with no pixel work | `packages/rendering/src/cinematic/` (05 §10) |
| Aura Clash bypasses root post: `postprocess: compatibility?.source.postprocess ?? createProductionRuntimePostprocess(...)` | `packages/engine/src/agent-api/index.ts:14001`; preset `packages/engine/src/production-runtime/GameRenderPreset.ts:372-386` and the second preset at `:448-452` (both `targetFormat:"rgba8"`, no `toneMapping`, so the plan's `tone-mapping {}` pass falls to the device default `"reinhard"`) |

### 2.2 Anti-aliasing and resolution

| Finding | Location |
|---|---|
| "FXAA" = `if (maxLuma-minLuma < u_edgeThreshold) return center; else mix(center, avg(N,S,E,W), u_subpixelBlend)` | `packages/rendering/src/WebGL2Device.ts:3611-3631` |
| Defaults `edgeThreshold 0.125`, `subpixelBlend 0.75`; bridge passes `fxaa: {}` | `WebGL2Device.ts:1921-1922`; `index.ts:12924` |
| `effects.antiAlias` defaults `mode:"fxaa"`; root `fxaaRequested = (mode ?? "fxaa") === "fxaa"` | `index.ts:3561-3568`, `:12859` |
| Forward `sampleCount = postprocess.sampleCount ?? (taa && temporal ? 1 : webgpu && depth ? 1 : 4)` | `packages/rendering/src/Renderer.ts:611`, `:780` |
| Canvas created `antialias:true`, `preserveDrawingBuffer:true` for every profile | `index.ts:13586-13597`; profiles `:4232-4302`; `WebGL2Device.ts:351-355` |
| DPR: `options.pixelRatio ?? profile.pixelRatio ?? devicePixelRatioSafe()`; profile always defines it (safe-basic 1, production/cinematic 1.5) | `index.ts:11133`, `:12280`, `:4256`, `:4271`, `:4286`; dead fallback `:18699` |
| Skyline Runner forces `pixelRatio: 0.7` | `apps/showcase-skyline-runner/src/main.ts:1879` |
| TAA velocity is a separate re-draw of every item; it throws on skinned, morphed, instanced or blended items | `packages/rendering/src/TemporalHistory.ts:71-93` (throw at `:73-74`) |
| TAA jitter sequence and history targets (rgba16f velocity, history-a/b) | `TemporalHistory.ts:54`, `:64` |
| TAA shader (Catmull-Rom history, AABB clamp, depth reject) runs on LDR; bridge only enables it when `temporalRequested` and passes `taa: { blend: .9 }` | `WebGL2Device.ts:3305-3410` (`taaProgram` `:3305`, `taaPresentationProgram` `:3388`); `index.ts:12865-12869` |
| SMAA: not implemented anywhere | 05 §4.6 |

### 2.3 Bloom

| Finding | Location |
|---|---|
| Engine clamps threshold to `[0,1]`, default 0.78; radius mapped to 1..4 px | `index.ts:12872-12884`; `resolveNativeBloomRadius` `index.ts:12791-12795` |
| Device throws on threshold > 1 and on softKnee > 0.5 | `WebGL2Device.ts:4484-4496` (`normalizeNativeBloomOptions` at `:4481`) |
| Knee: `smoothstep(max(t-k,0), min(t+k,1), luma)` on the HDR source | `WebGL2Device.ts:2838-2851` |
| Quality defaults to `"performance"` (1 mip, full-res, 1–4 px) | `packages/rendering/src/postprocess/NativeBloomPyramid.ts:33-37`, `:52-61` |
| Hidden gain 7 (balanced) / 17 (cinematic) | `NativeBloomPyramid.ts:106-109` |
| Bridge drops `color`, `maxIntensity`, `antiBlowout`; `effects.bloom` clamps intensity to `[0.05, maxIntensity=0.92]` when `antiBlowout` (default true) | `index.ts:12870-12884`; factory `index.ts:3450-3468` |
| Device throw on `softKnee > 0.5` happens inside the first `renderer.render()`, is recorded in `diagnostics.errors` and not rethrown, so a bad value yields a black canvas with no console error | comment at `apps/showcase-courier-rush/src/main.ts:286-295` |
| `neonBloom` defaults intensity 0.72, threshold 0.68, color `#ff42c8` | `index.ts:3482-3493` |
| CPU bloom (readback path): hard threshold, single-scale, ignores quality/knee | `packages/rendering/src/PostProcessPass.ts:1694-1740` |

### 2.4 Tone mapping, exposure, grade, output

| Finding | Location |
|---|---|
| ACES (Hill fit) matches three r185 `ACESFilmicToneMapping` (same matrices, `/0.6` prescale) | `WebGL2Device.ts:3495-3517` (`acesRrtAndOdtFit` `:3495`, `acesFilmic` `:3501`) |
| Device already has an `u_exposure` uniform and applies it inside the tone curve; only the root bridge pins it to 1 | `WebGL2Device.ts:3553`, `:3567`; `index.ts:12898-12904` |
| Fake AgX (`log2(1+x)/log2(17)` + smoothstep per channel), fake Neutral | `WebGL2Device.ts:3541-3550`; CPU copy `PostProcessPass.ts:2558-2568` |
| Device default operator is `"reinhard"` when none is given | `WebGL2Device.ts:1906`; `WebGPUDevice.ts:1466`; `PostProcessPass.ts:461` |
| `colorGrade` node stores exposure/shadows/highlights/lut; bridge forwards contrast+saturation only; warning string at `:4547` | `index.ts:3543-3555`, `:12905-12910`, `:4547` |
| Scene exposure presets 0.78–1.24 are diagnostics only; overlay prints `tone: aces-filmic @ <preset>` | `index.ts:4204-4214`, `:4481`, `:18657` |
| Diagnostic type is the literal `toneMapping: "aces-filmic"` | `index.ts:1801` |
| `AuraCreateAppOptions` has no tone-mapping/exposure/output field | `index.ts:10773-10808` |
| Present shader grade runs after the OETF in display space (contrast pivot 0.5, temperature, saturation, vibrance, vignette, sharpening); only contrast/sat are reachable | `WebGL2Device.ts:3571-3600` |
| Clear color is pre-inverted through ACES so the background "lands" on its authored value | `index.ts:15400-15418` |
| No dithering anywhere in the present path | 05 §7 (grep of `WebGL2Device.ts`, `ShaderLibrary*.ts`) |
| Forward shader has its own Narkowicz ACES for the no-post path | `ShaderLibraryCore.ts:588-593`, `ShaderLibrary.ts:406-411` |
| WebGPU grade applies `exp2(exposure)`; WebGPU "FXAA" is a 2-tap directional blend | `packages/rendering/src/webgpu/WebGPUPostShaders.ts:253`, `:262-316` |

### 2.5 Depth effects and CPU-only passes

| Finding | Location |
|---|---|
| SSAO raw depth: `clamp((center - sample - u_bias)/(0.14 + r*0.04))`, 8 taps, multiplies tone-mapped color; comment "SSAO keeps its legacy response" | `WebGL2Device.ts:3091-3129`, `:906-909` |
| Bridge SSAO radius `round(r*8)` px, bias 0.025; `contactOcclusion` maps to the same pass | `index.ts:12886-12896` |
| Default camera near 0.05 / far 100 | `packages/engine/src/agent-api/RootRuntimeSupport.ts:16-21` |
| `normalizeLdrDepthRange(undefined)` → 0.1/1000; `Renderer.ts` never supplies `depthRange` | `WebGL2Device.ts:4567-4574`, `:909`; no `depthRange` in `Renderer.ts` |
| DOF linearized CoC, uniform disc ≤8 px on LDR; bridge `focusDepth` is a 0..1 fraction | `WebGL2Device.ts:3210-3262`; `index.ts:12931-12936` |
| Motion blur ≤16 taps on LDR, no tile max | `WebGL2Device.ts:3264-3299` |
| SSR on LDR, bridge `maxDistance 18` | `WebGL2Device.ts:3131-3208`; `index.ts:12925-12930` |
| Volumetric "fog" = CPU radial blur at fixed screen position `[0.5,0.18]`; authored color ignored | `packages/rendering/src/VolumetricFog.ts:105-144`; `index.ts:12810-12822` |
| Outline = full-frame Sobel on 8-bit luma (not selection-based) | `WebGL2Device.ts:3004-3091` (`outlineProgram`) |

### 2.6 Game census (corrected counts, 18/19)

| Pattern | Games |
|---|---|
| FXAA node on top of MSAA | 17/18: all except orbital-defense |
| `softKnee:0.5, shoulder:0.6, quality:"balanced"` bloom | 16 live root games. Aura Clash's copy is in dead code (`apps/aura-clash-showcase/src/rendering/GamePostProcess.ts:89-107`); its live preset is `GameRenderPreset` bloom thr 0.78 / int 0.32 / radius 2 on rgba8 |
| Bloom thresholds | 0.55 blockfall; 0.62 gravity-post, vault-breakers; 0.68 courier, bank-shot, gallery-shift, siege-golf, skyline, turbo-drift, rooftop; 0.70 neon-swarm; 0.72 aurora, mech-hangar, deep-recovery; 0.74/0.84 pulse-tunnel; 0.84 patrol-wing |
| `colorGrade({exposure})` ignored | 16 root games (list in 19 §C12 skeptic 2) |
| AO node (no-op SSAO) | bank-shot, blockfall-reactor, turbo-drift-circuit, neon-swarm, mech-hangar (contact only), vault-breakers, skyline-runner |
| `volumetricFog` (CPU path) | deep-recovery |
| `qualityProfile:"production"` (DPR 1.5) | aura-clash, mech-hangar, vault-breakers, rooftop-buckets; skyline-runner `safe-basic` + 0.7 |
| rgba8 + Reinhard | aura-clash (only) |

### 2.7 Pixel and timing evidence

- Desktop game captures ran at `deviceScaleFactor: 1` (report.slim.json `games[].runs[].deviceScaleFactor`),
  so **the desktop DPR loss is not visible in the current evidence.** The `mobile-390x844` run is
  already at DSF 3 for all 18 games, and there the loss *is* recorded. `runs[].canvas` shows a
  backing store of 1× CSS for the profile-default games (e.g. courier-rush 390×844 for a 390×844
  CSS canvas on a DSF-3 screen), 1.5× for the `production` profile games (mech-hangar 585×676 for
  390×451 CSS), and 0.82× for skyline-runner (320×591 for 390×844 CSS). The vision judge's "mobile
  is visibly soft or blurry" (21, skyline-runner) is this. Phase 0 adds a DSF-2 desktop run.
- Desktop 1920×1080 fps on the paravirtual Metal runner: deep-recovery 0.5, gravity-post 6.4,
  courier-rush 7.1, siege-golf 7.1, rooftop 7.6, mech-hangar 9.3, blockfall 9.8, gallery-shift 10.1,
  aura-clash 11.1, skyline 11.4, bank-shot 14.9, patrol-wing 15.8, turbo-drift 19.7, pulse-tunnel
  23.5, neon-swarm 25.8, aurora-lander 52.2, vault-breakers 57.4, orbital-defense 59.6. This GPU
  is a paravirtual device. Absolute numbers are not a performance reference. Relative deltas from
  toggling passes are usable.
- Vision tone_mapping / postprocessing / anti_aliasing scores (21), all 18 games: Aura Clash
  3 / 2 / 4. Aurora Lander 3.5 / 3 / 5. Bank Shot 4 / 2 / 5. Blockfall 6 / 5 / 6, the best tone
  score, a game with saturated blocks and no clipping. Courier Rush 2 / 2 / 5. Deep Recovery
  3 / 3 / 5. Gallery Shift 4 / 4 / 5. Gravity Post 3 / 1 / 4, "the sun is a flat LDR disc". Mech
  Hangar 5 / 4 / 5. Neon Swarm 4 / 4 / 5. Orbital Defense 2.5 / 0.5 / 4, "no bloom, vignette,
  grading". Patrol Wing 4 / 3 / 5, "bloom on the ring blows out". Pulse Tunnel 4 / 2 / 5, "no
  bloom on a neon game". Rooftop Buckets 4 / 4 / 5, bloom "over-tuned: streaky smears on mobile".
  Siege Golf 5 / 4 / 6. Skyline Runner 4 / 4 / 5. Turbo Drift 4 / 3.5 / 5. Vault Breakers
  4 / 1 / 5, with no visible bloom because nothing is emissive above threshold.
- Benchmark (23). AA differences are flagged on scene 02 (pedestal edge aliasing/streaks), 06
  (aliased silhouettes), 08 (stripe stair-stepping) and 13 ("jagged edges on spheres and floor
  edge"). Scene 18 has an overblown bloom halo and a hazier, lower-contrast tone. Most other scenes
  are "equivalent" on AA and tone. The harness was verified fair (22). It passes the same DPR to
  both engines (`benchmarks/quality-rebuild/aura3d/common.ts:292`, `three/common.ts:124`). three
  gets `UnrealBloomPass` on a `HalfFloatType` target with `samples: 4` (`three/common.ts:336-342`).

## 3. Root cause

1. **The post chain was built to match CPU references bit for bit, not to look good.** The
   kernels use integer LUTs, 24-bit limb arithmetic and "legacy response" retention (05 §1.4,
   `WebGL2Device.ts:2851-2873`, `:3004-3091`, `:906-909`). That is why the chain stays in display
   space after tone mapping, why SSAO was never linearized, and why bloom gains were "calibrated
   against the frozen r185 workload" (`NativeBloomPyramid.ts:98-105`) instead of derived.
2. **The pipeline is a fixed uber-chain inside the device, not a graph.** Order is encoded twice:
   in `RendererPostprocessPlan.ts` and in `ldrFusionPassRank` (`Renderer.ts:2122-2135`). Formats
   are implicit and rgba8 unless bloom. Anything that does not fit falls through to a CPU readback
   path that the frame loop never refuses to run.
3. **The public API is wider than the executed API, and drops fields silently.** The bridge
   forwards a subset (`index.ts:12866-12935`), and diagnostics report values that never reach
   uniforms (`index.ts:4481`, `:18657`). The engine never fails on an unexecuted field. Agents then
   tune around the symptoms ("giant white bloom blob" fixes by lowering intensity, 05 §9).
4. **The defaults are wrong, and agents copy them.** The bloom quality default is "performance",
   the knee validator maximum became convention, the FXAA node is on by convention, DPR comes from
   the profile, and exposure is pinned at 1. The tail of 16 game mains is one cargo-culted recipe
   (05 §9.1).
5. **Temporal and depth infrastructure is incomplete.** No velocity exists for skinned, instanced
   or morphed geometry (`TemporalHistory.ts:73`). Linearization never receives the camera range.
   There is no normal or indirect-light information for AO, so AO can only multiply the final color.

## 4. Affected packages

- `@aura3d/rendering` (`packages/rendering`): new post graph, all post shaders, the WebGL2 and
  WebGPU device post entry points, TemporalHistory, forward-pass MRT outputs, bloom planner,
  tone/grade/LUT, and retirement of the CPU kernels.
- `@aura3d/engine` (`packages/engine`): agent-api `effects.*` factories, the
  `createProductionRuntimePostprocess` bridge, `AuraCreateAppOptions.output`, quality tiers,
  diagnostics, the `GameRenderPreset` post, and the production-runtime product-viewer post settings.
- `@aura3d/lean` (`packages/lean`) and `LeanWebGL2Device.ts`: shared shader sources, either
  imported or deleted per PRD 15.
- `apps/showcase-*` and `apps/aura-clash-showcase`: migration codemod.
- `benchmarks/quality-rebuild`: post scenes and the bloom parameter mapping.
- `tools/quality-rebuild-capture`, `.github/workflows/quality-rebuild-capture.yml`: DSF-2 runs and
  post filmstrips.
- `packages/aura3d-cli/skills/*`: postfx guidance (PRD 13 owns the text; this PRD owns the facts).

## 5. Affected files and directories

New:
- `packages/rendering/src/post/` (new directory)
  - `PostGraph.ts`: stage list, resource allocation, format policy, insertion points.
  - `PostResources.ts`: pooled render targets keyed by (w, h, format, samples).
  - `PostQualityTiers.ts`: tier → `PostPipelineOptions` mapping.
  - `shaders/common.glsl.ts`: fullscreen VS, `linearizeDepth`, `reconstructViewPos`,
    `octDecode`, luma, YCoCg, Karis weight, `srgbOetf`, `triangularDither`.
  - `shaders/gtao.glsl.ts`, `shaders/gtaoDenoise.glsl.ts`, `shaders/depthDownsample.glsl.ts`.
  - `shaders/taa.glsl.ts` (TAA + TAAU), `shaders/velocityDilate.glsl.ts`.
  - `shaders/bloom.glsl.ts` (prefilter, 13-tap downsample, 9-tap tent upsample).
  - `shaders/dof.glsl.ts` (CoC, half-res prefilter, gather, composite).
  - `shaders/motionBlur.glsl.ts` (tile max, neighbor max, reconstruction).
  - `shaders/exposure.glsl.ts` (log-luminance reduction, adaptation).
  - `shaders/lutBake.glsl.ts` (grade + tone → 3D LUT), `shaders/composite.glsl.ts` (uber).
  - `shaders/fxaa.glsl.ts` (port of three r185 `FXAAShader.js`, see 6.5), `shaders/smaa.glsl.ts`,
    `shaders/finalize.glsl.ts` (grain + dither + write).
  - `shaders/godrays.glsl.ts` (GPU volumetric light shafts).
  - `shaders/*.wgsl.ts`: WGSL equivalents (Phase 7).
  - `ToneOperators.ts`: TS reference implementations of ACES/AgX/Neutral/Reinhard, used by
    tests and the CPU reference.
  - `CubeLut.ts`: `.cube` parser → `Float32Array` 3D LUT.
  - `smaa/`: lazy-loaded AreaTex/SearchTex binaries plus loader.
- `packages/engine/src/agent-api/postPresets.ts`: cinematic presets.
- `packages/engine/src/agent-api/postBridge.ts`: replaces `createProductionRuntimePostprocess`.
- `tools/quality-rebuild/codemods/post-v2.mjs`: showcase migration.
- `tests/unit/rendering/post-*.test.ts`, `tests/browser/post-*.spec.ts`.
- `.github/workflows/post-quality.yml`: macos-14 remote browser job.

Modified:
- `packages/rendering/src/Renderer.ts`: `executePostprocess` (`:977`), forward target
  (`:595-618`, `:928-944`), fusable logic (`:2111-2137`, deleted), pixel passes (`:993-1067`,
  `:1245-1280`, gated to `execution:"cpu-deterministic"`).
- `packages/rendering/src/RendererPostprocessPlan.ts`: pass catalog and order.
- `packages/rendering/src/WebGL2Device.ts`: `presentLdrPostprocess` (`:871-1110`) is replaced by
  `executePostGraph`. Bloom, FXAA, SSAO, DOF, MB, TAA and present shaders (`:2838-3633`) are
  deleted after migration. `normalizeNativeBloomOptions` (`:4481`) is rewritten.
- `packages/rendering/src/WebGPUDevice.ts`, `webgpu/WebGPUPostShaders.ts`.
- `packages/rendering/src/TemporalHistory.ts`: velocity moves into the forward MRT.
- `packages/rendering/src/ForwardPass.ts`, `ShaderLibrary.ts`, `ShaderLibraryCore.ts`: velocity
  and indirect-fraction outputs, previous-frame bone and instance inputs, unified tone curve for
  the no-post path.
- `packages/rendering/src/postprocess/NativeBloomPyramid.ts`: planner kept, gains deleted.
- `packages/rendering/src/VolumetricFog.ts`: CPU kernel → GPU pass descriptor.
- `packages/rendering/src/PostProcessPass.ts`: CPU kernels move to `@aura3d/rendering/reference`.
- `packages/engine/src/agent-api/index.ts`: `effects` (`:3441-3630`), `AuraCreateAppOptions`
  (`:10773`), `AuraRendererDiagnosticReport` (`:1793-1810`), bridge (`:12791-12935`), clear-color
  inversion (`:15400-15418`), profiles (`:4232-4310`), overlay (`:18657`).
- `packages/engine/src/production-runtime/GameRenderPreset.ts:264-466`.
- `packages/engine/src/production-runtime/index.ts:1454-1641` (product-viewer FXAA/exposure).
- `benchmarks/quality-rebuild/aura3d/common.ts:131-135`, `:254-256`, plus the new post scenes in
  `benchmarks/quality-rebuild/shared/scenes.ts`.
- `apps/showcase-*/src/main.ts` for the 17 game showcases only (aurora-lander, bank-shot,
  blockfall-reactor, courier-rush, deep-recovery, gallery-shift, gravity-post, mech-hangar,
  neon-swarm, orbital-defense, patrol-wing, pulse-tunnel, rooftop-buckets, siege-golf,
  skyline-runner, turbo-drift-circuit, vault-breakers). The glob `apps/showcase-*` also matches 10
  non-game apps (asset-audition, cinematic-architecture, data-galaxy, digital-twin-ops, index,
  material-asset-inspector, meshy-relic-pilot, product-configurator, smart-city-control,
  webgpu-particle-lab), which are not migrated by this PRD. Plus
  `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:898,1422`.
- `packages/rendering/src/postprocess/NativeLdrEffectLuts.ts`: deleted in Phase 8.

---

## 6. Architecture proposal

### 6.1 The HDR post graph

Post becomes a declarative stage list executed by `PostGraph` on the device. It is not a free-form
node graph. Stage order is fixed where physics requires it, and user passes enter at four named
insertion points. Every stage declares its inputs, outputs, formats and resolution, so a pass
cannot silently degrade the format of a later pass. Nothing between the forward pass and the
composite runs in 8-bit or display space.

```
Forward pass (scene-linear HDR)
  color0  RGBA16F   rgb = scene radiance, a = indirect fraction f_ind (see 6.3)
  color1  RG16F     screen-space velocity (taa mode or motion blur on; sampleCount 1)
  color2  R8        reactive mask (taa mode only; written by transparent/additive draws, see 6.5)
  depth   DEPTH24   (sampleable texture; MSAA renderbuffer + blit-resolve on MSAA tiers)
  MSAA 4x on "msaa" AA mode; 1x + sub-pixel jitter on "taa" mode
    │
[S0] Resolve (MSAA tiers): blitFramebuffer color+depth                       (existing path)
[S1] Depth prep: linearize with REAL camera near/far/projection → R32F full res
     + half-res min/max (RG32F) for GTAO/DOF/SSR/god rays
    ── insertion point "after-depth" (custom HDR passes reading depth)
[S2] GTAO (half res, R8) → bilateral denoise (2 passes, depth-aware) → upsample (joint bilateral)
     → applied to HDR: rgb *= mix(1, multiBounce(ao, albedoProxy), f_ind)
[S3] SSR (half res, HDR) — placement owned here, algorithm quality owned by PRD 02
[S4] God rays (half res, HDR, GPU) — replaces CPU volumetric-light
    ── insertion point "before-taa"
[S5] TAA / TAAU (HDR, Karis-weighted, YCoCg variance clip, velocity dilation, reactive mask)
     output at display resolution; history RGBA16F x2
    ── insertion point "after-taa" (stable HDR)
[S6] DOF (half res, CoC from physical lens, near/far separated gather, HDR → bokeh highlights)
[S7] Motion blur (tile-max 16px, neighbor-max, 12-tap reconstruction, HDR)
[S8] Auto-exposure (optional): log2-luminance downsample chain → 1x1 adapted EV (GPU only)
[S9] Bloom: prefilter (threshold + soft knee in HDR, Karis on first downsample, firefly clamp)
     → 13-tap downsample x N (N = 4..6) → 9-tap tent progressive upsample (R11G11B10F or RGBA16F)
    ── insertion point "before-tonemap" (HDR, exposure not yet applied)
[S10] Composite (one pass): exposure → + bloom·intensity·tint → chromatic aberration (scene taps)
      → shaper (log2) → 3D LUT [baked: white balance, operator, contrast/saturation/vibrance,
      lift/gamma/gain, shadows/midtones/highlights, user .cube] → vignette → write display-referred
      RGBA8 (luma in alpha if post-AA follows) — background passthrough for solid clear colors
    ── insertion point "after-tonemap" (display-referred LDR)
[S11] Post-AA (only when AA mode is "fxaa"/"smaa"): FXAA (three r185 port) or SMAA 1x (3 passes)
[S12] Finalize: film grain → triangular-PDF dither (±1 LSB of 8-bit) → default framebuffer
      (S11 and S12 fuse into one pass when post-AA is FXAA)
```

Ordering decisions that differ from the task brief, and why:

- **Bloom runs after DOF and motion blur, not before.** Bloom computed after DOF spreads the
  defocused highlight, which is what a lens does. Computing it before DOF leaves sharp bloom on top
  of blurred geometry. UE uses this order: DOF → motion blur → bloom → tonemap. It also means bloom
  reads TAA-stable input, which removes the specular "sparkle" (05 §5.2, no Karis average today).
- **AO is applied to HDR radiance weighted by the indirect fraction, not multiplied into the final
  color.** See 6.3. This is the cheapest way to get "AO darkens ambient/IBL only" in a forward
  renderer with no G-buffer. It needs no depth-normal prepass, so it adds no CPU draw calls. That
  matters because draw-call ratios versus three are already 1.9–7× (18, from 15 §4.1).
- **Post-AA (FXAA/SMAA) is an alternative to MSAA/TAA, never stacked on top of them.** One AA
  method is active per frame (6.5).

Every major recommendation carries a cost card. Costs are estimates at 1920×1080 render pixels on
an M1-class integrated GPU. They must be re-measured (section 17).

| Stage | Visual benefit | GPU | CPU | Memory @1080p | Bundle (gz) | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Native DPR (Phase 1, PRD 01 owns long-term) | Removes the 1/4-pixel softening on HiDPI; biggest single AA win | ×(DPR²) on *every* pass incl. forward: DSF 2 is 4× pixels | ~0 | ×DPR² on all targets (MSAA guard, 6.2) | 0.3 KB | capped at 2 (section 19) | tier DPR cap; `renderScale` |
| Velocity MRT (forward) | Required input for TAA/MB on all geometry classes | +0.2–0.4 ms forward (extra RT write, extra VS math) | +0.05 ms (prev matrices upload) | RG16F 8.3 MB + R8 reactive 2.1 MB | 2 KB (shader defines) | High only | msaa (no velocity) |
| S1 depth prep | Correct depth math for every depth effect (fixes 0.1/1000 mismatch) | 0.1 ms | ~0 | R32F 8.3 MB + half RG32F 4.1 MB | 1 KB | same | none needed; always on when any depth stage runs |
| S2 GTAO | Contact grounding; 7 games currently get ~0 AO | 0.8–1.2 ms half-res | <0.05 ms | 0.5 MB AO + 1 MB denoise | 5 KB | half-res mandatory, 4 directions × 2 steps | off on Low |
| S3 SSR (placement only) | Reflections computed in HDR, before TAA | 0.8–1.5 ms half-res (algorithm cost owned by PRD 02) | <0.05 ms | RGBA16F half 4.2 MB | 0 (existing shader moved) | off | off |
| S4 God rays | Replaces the 0.5 fps CPU volumetric path in Deep Recovery | 0.2–0.4 ms half-res, 32–64 samples | <0.05 ms (light projection) | RGBA16F half 4.2 MB | 1.5 KB | Medium+ 32 samples | off |
| S5 TAA/TAAU | Stable sub-pixel edges, specular stability, enables render scale < 1 | 0.4 ms | 0.1 ms (matrices) | history 2×16.6 MB + velocity 8.3 MB | 6 KB (+velocity VS) | allowed High; enables 0.67 scale | MSAA 4x |
| S6 DOF | Cinematic focus; HDR bokeh highlights | 0.6–0.9 ms half-res | ~0 | 4–6 MB | 4 KB | High only, 0.5 scale | off |
| S7 Motion blur | Speed feel in racers/runners | 0.4–0.6 ms | ~0 | tiles 0.1 MB | 3 KB | off on mobile Low/Medium | off |
| S8 Auto-exposure | Usable exposure across dark/bright scenes | 0.05 ms | 0 | <0.1 MB | 1.5 KB | yes | manual exposure |
| S9 Bloom | Real HDR glow only on HDR highlights; no mid-tone haze | 0.3–0.6 ms | <0.05 ms | 2.8–5.5 MB | 3 KB | 4 mips, half-res start | 4-mip half-res |
| S10 Composite + LUT | Selectable operator, exposure, grade, LUT, vignette at one fetch | 0.15–0.25 ms (+0.05 ms rebake on change) | <0.05 ms | 33³ RGBA16F LUT 0.29 MB | 6 KB (+2 KB lazy .cube) | yes | analytic operator path on devices without 3D-texture float filtering |
| S10 CA + vignette | Lens character for presets; CA replaces a CPU readback pass | CA +0.05 ms (2 extra taps), vignette ~0 | 0 | 0 | 0.5 KB | vignette all tiers; CA Medium+ | off |
| S11 FXAA (three r185 port) | Edge AA without blurring low-contrast interiors | 0.25 ms | ~0 | RGBA8 8.3 MB | 2.5 KB | Low tier default | none |
| S11 SMAA 1x | Better edges than FXAA, no temporal artifacts | 0.6–0.8 ms | ~0 | edges RG8 4.1 MB + weights RGBA8 8.3 MB + 0.2 MB LUTs | 7 KB code + ≤45 KB lazy textures | Medium mobile option | FXAA |
| S12 Dither + grain | Removes 8-bit banding on dark fog gradients | <0.05 ms | 0 | 0 | 0.5 KB | yes | none |
| S12 RCAS sharpen | Restores TAA/upscale softness | 0.05–0.1 ms | 0 | 0 | 1 KB | yes | off |
| S0/S1 canvas `antialias:false`, `preserveDrawingBuffer:false` | None visible; removes a redundant default-framebuffer MSAA resolve and the swap-chain copy | −0.1 to −0.5 ms (saved) | 0 | −8 to −33 MB (saved) | 0 | yes | `capture:true` |

### 6.2 Formats and resolution policy

- Scene color is RGBA16F always. `EXT_color_buffer_float` is required, as it already is for the
  root path. If it is unavailable, the device falls back to RGBA8 forward output, with the
  *selected* operator applied in the forward shader. This replaces the hard-coded Narkowicz curve at
  `ShaderLibraryCore.ts:588-593`, so no entry point gets a different tone curve.
- Bloom mips use R11G11B10F when `EXT_color_buffer_float` reports it renderable, otherwise RGBA16F.
- Linear depth uses R32F. 16F loses too much precision at far ranges.
- No ping-pong RGBA8 target exists before S10.
- **MSAA memory guard:** MSAA 4x on RGBA16F costs 66 MB of color plus 33 MB of depth at 1080p,
  and four times that at 4K. Once PRD 01/11 makes DPR native, MSAA is allowed only when
  `renderWidth × renderHeight ≤ 2.4 Mpx`. Above that the tier switches to TAA, or to SMAA on tiers
  without TAA. This rule is tested (section 15).
- **Render scale:** `renderScale ∈ [0.5, 1]` multiplies the DPR-derived backing size. With TAA,
  S5 upsamples to display resolution (TAAU: Catmull-Rom history plus a 9-tap Blackman-Harris
  (Gaussian-approximation) reconstruction of the jittered current-frame samples, as in three r185
  `examples/jsm/tsl/display/TAAUNode.js`). Without TAA, S10 samples bilinearly and S12 applies RCAS
  sharpening (AMD FSR1 RCAS, MIT license, ~40 lines GLSL). The dynamic-resolution governor is
  PRD 11; this PRD provides the upsample stage.
- Canvas context: `antialias:false` whenever the scene renders to an offscreen target, which is
  every root frame. `preserveDrawingBuffer:false` unless `capture: true` is set. Today both are
  hard-coded `true` (`index.ts:13591`, `:13593`; every profile at `index.ts:4232-4302`).
- `app.screenshot()` is synchronous today and is `captureAuraScreenshot(canvas)` →
  `canvas.toDataURL` (`index.ts:11701-11703`, return type `AuraScreenshot` at `:10821`). It keeps
  its synchronous signature. When `capture` is false it calls the renderer's synchronous
  `renderFrameNow()` (re-renders the last submitted scene state with the same camera, no
  simulation step) and calls `toDataURL` in the same task, before the browser composites. WebGL
  guarantees drawing-buffer contents until compositing, so no `preserveDrawingBuffer` is needed.
  Playwright `page.screenshot()` (used by `tools/quality-rebuild-capture`) reads the composited
  page and is unaffected.

### 6.3 AO without a G-buffer: the indirect fraction

The forward PBR shader already computes direct (punctual) and indirect (ambient + IBL
diffuse/specular) terms separately, and adds emissive. It writes:

```
radiance = direct + indirect + emissive
f_ind    = luminance(indirect) / max(luminance(radiance), 1e-4)        // stored in color0.a
```

S2 then applies `rgb *= mix(1.0, aoMB, f_ind)` with `aoMB = multiBounce(ao, albedoProxy)`
(Jimenez 2016 polynomial with `albedoProxy = 0.5`). Emissive pixels, the sky and direct-lit
surfaces are barely affected. Ambient-dominated surfaces get full occlusion. Transparent and
additive draws use `blendFuncSeparate(srcRGB, dstRGB, ZERO, ONE)` so they keep the surface's
`f_ind`. Normals for GTAO are reconstructed from the linear depth using the 5-tap
smallest-discontinuity method (Turánszki) at half resolution. No normal MRT is needed.

This is weaker than Filament-style in-shader AO for specular occlusion. The Ultra-tier
alternative, a depth-normal prepass with AO sampled in the forward shader, is noted in section 24
and not built here.

### 6.4 Exposure and tone mapping

- Exposure is a linear multiplier, the same as three `toneMappingExposure`, so existing
  `colorGrade({exposure: 1.04})` keeps its meaning. Final exposure is
  `output.exposure × colorGrade.exposure × exp2(autoEv)` (`autoEv = 0` when auto-exposure is
  off), and the value actually sent is reported in diagnostics. The WebGPU grade today treats
  `exposure` as EV (`exp2(u_grade.exposure)`, `WebGPUPostShaders.ts:253`); Phase 7 changes it to
  the same linear multiplier.
- Operators (TS reference in `post/ToneOperators.ts`, GLSL in the LUT bake):
  - `aces`: the existing Hill fit (`WebGL2Device.ts:3495-3517`), unchanged.
  - `agx`: a verbatim port of three r185 `AgXToneMapping`
    (`node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js:113-168`).
    That is: linear sRGB → Rec.2020, inset matrix, log2 encode in [−12.47393, 4.026069] EV, 6th-order
    sigmoid polynomial, outset matrix, `pow(2.2)` linearize, Rec.2020 → sRGB.
  - `neutral`: a verbatim port of Khronos PBR Neutral (`:170-197`): `StartCompression = 0.8 − 0.04`,
    `Desaturation = 0.15`, min-channel toe offset (`x < 0.08 ? x − 6.25x² : 0.04`, subtracted from
    every channel, so the curve is *not* identity below the knee), peak compression, then
    desaturation toward `newPeak`.
  - `reinhard`, `none`. `filmic`/`uncharted2` are removed from the public union and remain
    available only in `@aura3d/rendering/reference`.
- The default operator stays `aces` for one minor release so nothing shifts silently. Cinematic
  presets select per scene type (6.8).
- The clear-color pre-inversion (`colorToAcesInputClearColor`, `index.ts:15400-15418`) is replaced
  by **background passthrough**. In S10, pixels with `depth == far` and no environment background
  output the authored sRGB clear color directly. That holds for any operator.

### 6.5 Anti-aliasing policy

| Mode | Forward target | Post-AA | When |
|---|---|---|---|
| `msaa` | 4x RGBA16F | none | Medium default; any tier where velocity is not available for all opaque geometry and pixels ≤ 2.4 Mpx |
| `taa` | 1x + jitter, velocity MRT | none (TAA sharpening 0–0.25) | High/Ultra default when every opaque item has velocity (rigid, instanced, skinned, morph after Phase 4) |
| `smaa` | 1x | SMAA 1x | Fallback when MSAA is blocked by the pixel guard and TAA is unsupported |
| `fxaa` | 1x | FXAA (three r185 `FXAAShader.js` port) | Low tier; explicit opt-in |
| `off` | 1x | none | Explicit only |

The current blur shader is deleted. The replacement is a port of three r185
`node_modules/three/examples/jsm/shaders/FXAAShader.js` (MIT). That file is **not** NVIDIA FXAA
3.11 Quality preset 12. It is Jasper Flick's Catlike Coding FXAA (GLSL port by Dave Hoskins),
derived from the FXAA whitepaper. Porting it verbatim keeps the benchmark comparison
apples-to-apples. Constants, verified against the r185 file: `_ContrastThreshold 0.0312`,
`_RelativeThreshold 0.063`, `_SubpixelBlending 1.0`, `EDGE_STEP_COUNT 6`,
`EDGE_STEPS 1.0, 1.5, 2.0, 2.0, 2.0, 4.0`, `EDGE_GUESS 8.0`, luminance
`dot(rgb, vec3(0.3, 0.59, 0.11))`. The algorithm: 3×3 luma neighbourhood, contrast test
`contrast < max(contrastThreshold, relativeThreshold × highest)` → skip, subpixel blend factor
from the 3×3 low-pass filter (smoothstep squared × subpixelBlending), horizontal/vertical edge
decision, edge-end search along the edge with the stepped offsets, then a blend of the larger of
the edge and subpixel factors. The only deliberate difference from three: the composite stores
luma in alpha, so the port reads `.a` instead of recomputing luma per tap (≤ 1 LSB difference,
covered by the FXAA spec). This is a closer match to three, not stronger than it. If FXAA 3.11
Quality-12 is wanted later, it is a separate shader variant with its own spec.

SMAA ports three r185 `SMAAShader.js`/`SMAAPass.js` (MIT) verbatim. The r185 port uses
**colour** edge detection (`SMAAColorEdgeDetectionPS`, max channel delta), `SMAA_THRESHOLD 0.1`,
`SMAA_MAX_SEARCH_STEPS 8`, `SMAA_AREATEX_MAX_DISTANCE 16`, and no diagonal search or
local-contrast adaptation. That is roughly SMAA 1x MEDIUM, not HIGH. AreaTex (160×560) and
SearchTex (64×16) come from a lazy-loaded chunk, not the root bundle. three's `SMAAPass.js` is
50,379 B raw, most of it base64 textures.

TAA changes (from `WebGL2Device.ts:3305-3410`):
- It runs in HDR before tone mapping, with Karis weighting `w = 1/(1+luma)` on history and current.
- YCoCg variance clipping (γ = 1.0, 3×3) replaces the AABB min/max clamp. three r185 `TRAANode`
  uses a motion-dependent γ `mix(0.5, 1, (1 − motion)²)`. Use the same formula, so TaaOptions
  `varianceGamma` is the static-pixel γ (default 1.0).
- Velocity is dilated from the closest-depth texel in a 3×3 neighbourhood.
- A reactive mask in a dedicated `color2` R8 attachment lowers history weight on blended pixels.
  Transparent and additive draws output `vec4(alpha)` to it. WebGL2 has no per-attachment blend
  or colour-mask state without `OES_draw_buffers_indexed`, so the attachment receives the same
  blend as colour; the value is therefore approximate accumulated coverage, which is enough for a
  feedback weight. It is cleared to 0 each frame. A stencil bit is not used: WebGL2 cannot
  sample stencil in a shader, and the TAAU output resolution differs from the scene
  depth-stencil.
- History is rejected on disocclusion using previous linear depth reprojection.
- Jitter keeps the existing irrational-increment sequence (`TemporalHistory.ts:54`).
- The fixed 1.04 unsharp is removed in favour of an exposed `sharpness` (0–1, default 0.2) applied
  in S12 through RCAS.

### 6.6 Bloom

Prefilter, S9 first pass (half-res output):
```
// Karis-averaged 13-tap from full-res HDR (after exposure-independent prescale)
c = clamp13TapKaris(src)                                // firefly clamp: min(c, clampLuminance)
br = max3(c)                                            // max channel, as Unity/UE
knee = threshold * kneeRatio                            // kneeRatio default 0.25  -> window [0.75,1.25]·threshold
soft = clamp(br - threshold + knee, 0, 2*knee); soft = soft*soft / (4*knee + 1e-5)
w = max(soft, br - threshold) / max(br, 1e-5)
out = c * w * tint
```
Downsample: 13-tap (Jimenez 2014) for N−1 further mips. Upsample: progressive 9-tap tent
(`radiusTexels = scatter`), `up_i = down_i + tent(up_{i+1})`. The final bloom is normalised by an
analytic factor `k(N)` computed in `NativeBloomPyramid.ts` so that a constant above-threshold
input of excess `E` produces `bloom = E`. Composite: `hdr + bloom * intensity`. **There is no
other gain.** Defaults: `threshold 1.0` (linear HDR, upper bound 64), `kneeRatio 0.25`,
`intensity 0.25`, `scatter 0.7`, `clampLuminance 64`, mip count by tier (Low 4, Medium 5,
High/Ultra 6). `color` is a tint on the prefilter output. `maxIntensity`/`antiBlowout` are
deprecated. They map to `clampLuminance`, and the 0.05 intensity floor is removed.

Consequence for emissive authoring (PRD 04 dependency): the default `material.emissive` strength
is 1.35 (05 §2.1). Cyan `#38d6ff` has linear luma ≈ 0.56, so luma × 1.35 ≈ 0.76, which is below
threshold 1.0. **Under correct bloom, today's neon will not glow.** That is correct behaviour, and
it is what vision saw in Vault Breakers. The migration codemod (Phase 5) therefore raises
neon/practical emissive strength to 3–8 per game. PRD 04 must make emissive strength an
HDR-unbounded multiplier, and presets document the expected emissive range.

### 6.7 Grading and LUT

LUT bake (S10a, runs only when grade params change, 33 draws into a 33³ RGBA16F `TEXTURE_3D`):
input is a log2 shaper over [−10, +6.5] EV around 0.18. Per texel:
```
lin  = shaperDecode(uvw)
lin  = whiteBalance(lin, temperature, tint)             // Bradford CAT in LMS, linear
lin  = channelMixer / liftGammaGain / shadows-midtones-highlights (ASC-CDL style, linear)
disp = toneOperator(lin)                                // aces | agx | neutral | reinhard | none
disp = contrast(disp, pivot 0.5), saturation, vibrance  // display-referred, as today
disp = mix(disp, userLut(disp), lutIntensity)           // optional .cube (sRGB-encoded domain)
store srgbOetf(disp)
```
Per pixel in S10: `uvw = shaperEncode(exposure*hdr + bloom)` → one trilinear 3D fetch. A test
checks that the LUT path is within 1 LSB of the analytic path on a 4096-step ramp (section 15).
WebGPU bakes the same LUT through a compute pass into a 3D storage texture.

### 6.8 Cinematic presets and quality tiers

Presets are plain data `AuraPostPreset` objects in `packages/engine/src/agent-api/postPresets.ts`.
They expand into `output` plus effect nodes. The table gives *initial* values, which Phase 5 tunes
against vision review. They are starting points, not claims.

| Preset | Operator | Exposure | Bloom (thr / knee / int) | AO | Grade | Vignette / grain / CA | Notes |
|---|---|---|---|---|---|---|---|
| `product-studio` | neutral | 1.0 | off | GTAO r 0.35 m | none | 0 / 0 / 0 | brand-color fidelity |
| `daylight-outdoor` | agx | 1.0 | 1.5 / 0.25 / 0.08 | r 0.8 m | contrast 1.05, sat 1.05 | 0.15 / 0 / 0 | |
| `neon-night` | aces | 1.1 | 1.0 / 0.25 / 0.35 | r 0.5 m | sat 1.0 | 0.25 / 0.03 / 0.0015 | emissive 3–8 |
| `space` | aces | 1.2 | 1.2 / 0.2 / 0.25 | off | lift −0.01 | 0.2 / 0.02 / 0 | |
| `underwater` | agx | 0.9 | 1.0 / 0.3 / 0.2 | r 0.6 m | temp −15, tint +5 | 0.35 / 0.03 / 0.002 | god rays on |
| `arena-fight` | aces | 1.0 | 1.2 / 0.2 / 0.2 | r 0.5 m | contrast 1.1 | 0.2 / 0 / 0 | MB off |
| `cinematic-film` | agx | 1.0 | 1.0 / 0.25 / 0.15 | r 0.6 m | contrast 1.05 | 0.3 / 0.06 / 0.002 | DOF on |

Tier mapping lives in `post/PostQualityTiers.ts`. A preset declares intent; the tier decides cost:

| Feature | Low | Medium | High | Ultra |
|---|---|---|---|---|
| DPR cap (PRD 01/11 owns detection) | 1.0 | 1.5 | 2.0 | 2.0 |
| AA | fxaa | msaa (guard → smaa) | taa (fallback msaa) | taa |
| Render scale | 1.0 | 1.0 | 1.0 (0.75 when > 3.7 Mpx) | 1.0 |
| GTAO | off | half-res, 2 dirs × 4 steps | half-res, 4 × 4, temporal | full-res, 4 × 6, temporal |
| SSR | off | off | off | half-res (if PRD 02 enables) |
| God rays | off | half-res 32 samples | half-res 48 | half-res 64 |
| DOF | off | off | half-res | full CoC, half-res gather 2 rings |
| Motion blur | off | off | 8 taps | 12 taps |
| Bloom mips | 4 | 5 | 6 | 6 |
| Auto-exposure | off | if preset | if preset | if preset |
| LUT | yes | yes | yes | yes |
| Grain/CA/vignette | vignette only | all | all | all |
| Dither | yes | yes | yes | yes |

`renderer.quality: "auto"` (default) picks the tier through the PRD 11 device heuristic. The
existing `qualityProfile` ids map as `safe-basic → medium`, `production → high`,
`cinematic → ultra`, `experimental-webgpu → high`, with a deprecation warning.

### 6.9 CPU readback removal

The interactive frame loop never calls `readPixels`/`readFloatPixels` for post. The rules:
- `Renderer.executePixelPostprocessPass` and its async variant run only when
  `postprocess.execution === "cpu-deterministic"`. That option exists already
  (`Renderer.ts:658`). Any other request for a non-GPU pass throws `POSTPROCESS_PASS_NOT_GPU`
  in dev builds. In production builds the pass is skipped and recorded in
  `diagnostics().renderer.post.skipped` as an error.
- `volumetric-light` becomes GPU S4 god rays. The light position is projected from the strongest
  directional light or sun (`lights.directional` position or `sky` sun), not fixed `[0.5,0.18]`.
  Occluders are derived from linear depth (`depth == far` or emissive luma > threshold). The
  authored `color` is honored. Froxel volumetric fog is PRD 07.
- `film-grain` and `chromatic-aberration` move into S12 and S10.
- The `contact-shadow` post pass is deleted. Screen-space contact shadows are a forward-shading
  feature in PRD 02.
- CPU kernels in `PostProcessPass.ts` (2,750 lines), `EffectComposer.ts`,
  `postprocess/SSAOPass.ts` and the synthetic-depth `runExternalParitySSAO` move to the
  `@aura3d/rendering/reference` subpath, which the root entry no longer imports.

### 6.10 Velocity for all geometry classes (TAA, motion blur)

`TemporalHistory.prepare` (`TemporalHistory.ts:57-94`) re-draws every item in a separate pass and
throws on skinned, morphed or instanced items. That is replaced by a forward-pass MRT output:
- Every lit and unlit forward shader variant gets `AURA_VELOCITY` (compile-time define). The
  vertex stage computes `clipPrev = u_prevViewProjection * prevWorldPos` and
  `clipCurr = u_unjitteredViewProjection * worldPos`. The fragment writes
  `velocity = (clipCurr.xy/clipCurr.w - clipPrev.xy/clipPrev.w) * 0.5` to `color1` (RG16F).
- Rigid: `prevWorldPos = u_prevModelMatrix * pos`.
- Instanced: a second instance attribute stream `a_prevInstanceMatrix0..3`, bound to last frame's
  instance buffer (double-buffered in `SceneOptimization`/batching). Static batches use
  `prev = curr`.
- Skinned: a previous-frame joint texture `u_prevJointTexture` (same layout as the current one,
  swapped per frame by the skinning system, PRD 06).
- Morph: a `u_prevMorphWeights` uniform array.
- Transparent/particles: velocity is not written (`drawBuffers([COLOR_ATTACHMENT0, NONE,
  COLOR_ATTACHMENT2])`), and the reactive mask is written to `color2` instead.
- Camera cuts: `app.cutCamera()` (7.1) or `|Δcamera position| > cutThreshold` (default 5 m per
  frame) resets history.

### 6.11 Depth linearization

`Renderer.executePostprocess` passes `{ near, far, projection: "perspective" | "orthographic" }`
from the active camera to the device. This is new plumbing, since today nothing is passed and the
device uses 0.1/1000. The root bridge passes the resolved clipping from `resolveCameraClipping`.
The shared GLSL:
```glsl
float linearizeDepth(float d, float n, float f, bool ortho) {
  float z = d * 2.0 - 1.0;
  return ortho ? mix(n, f, d) : (2.0 * n * f) / (f + n - z * (f - n));   // view-space metres
}
```
All depth stages consume metres. Every "normalized 0..1 depth fraction" option is removed or
converted in the bridge. For example, `depthOfField.focus` fraction becomes
`focusDistance = near + focus*(far-near)` with a deprecation warning.

### 6.12 Custom passes

```ts
renderer.addPostPass({ name: "scanlines", insertAt: "after-tonemap", fragment: { glsl, wgsl }, uniforms })
```
Custom passes are fullscreen fragments with `u_color`, `u_depthLinear`, `u_velocity`,
`u_texelSize` and `u_time` available. Resources are pooled by `PostResources`. A pass that
declares `insertAt: "before-tonemap"` receives RGBA16F; `after-tonemap` receives display-referred
RGBA8. This replaces the need to edit `WebGL2Device.ts` to add an effect (05 §11 item 10).

---

## 7. APIs to add, change, remove

### 7.1 Engine (`@aura3d/engine`, `packages/engine/src/agent-api/index.ts`)

```ts
// ---- added ----
export type AuraQualityTier = "low" | "medium" | "high" | "ultra";
export type AuraToneMappingOperator = "aces" | "agx" | "neutral" | "reinhard" | "none";
export type AuraAntiAliasMode = "auto" | "msaa" | "taa" | "smaa" | "fxaa" | "off";

export interface AuraAutoExposureOptions {
  readonly minEv?: number;            // default -4
  readonly maxEv?: number;            // default 4
  readonly compensationEv?: number;   // default 0
  readonly speedUp?: number;          // EV/s, default 3
  readonly speedDown?: number;        // EV/s, default 1
}

export interface AuraOutputOptions {
  /** Linear multiplier, same semantics as three `toneMappingExposure`. Default 1. */
  readonly exposure?: number;
  readonly autoExposure?: false | AuraAutoExposureOptions;
  /** Default "aces" in 3.x; presets choose otherwise. */
  readonly toneMapping?: AuraToneMappingOperator;
  /** Triangular-PDF ±1 LSB dither before 8-bit write. Default true. */
  readonly dither?: boolean;
  /** Solid clear colors bypass tone mapping (replaces colorToAcesInputClearColor). Default true. */
  readonly backgroundPassthrough?: boolean;
  readonly preset?: AuraPostPresetId;
}

export type AuraPostPresetId =
  | "product-studio" | "daylight-outdoor" | "neon-night" | "space"
  | "underwater" | "arena-fight" | "cinematic-film";

export interface AuraPostPreset {
  readonly id: AuraPostPresetId;
  readonly output: Required<Pick<AuraOutputOptions, "exposure" | "toneMapping">> & AuraOutputOptions;
  readonly effects: readonly AuraNodeBuilder<AuraEffectNode>[];
  /** Documented expected emissive strength range for bloom to engage. */
  readonly emissiveStrengthRange: readonly [number, number];
}

export interface AuraCreateAppOptions {
  // existing fields unchanged …
  readonly output?: AuraOutputOptions;                      // NEW
  /** Number keeps today's meaning (fixed ratio). Object form caps native DPR. */
  readonly pixelRatio?: number | { readonly max?: number; readonly min?: number }; // CHANGED (union)
  /** Capture mode: keeps preserveDrawingBuffer for evidence tooling only. Default false. */
  readonly capture?: boolean;                               // NEW
  /** One-minor escape hatch: "3.0" restores the legacy uber-chain. */
  readonly compat?: { readonly post?: "3.0" };              // NEW (removed in 5.0)
}

export interface AuraCreateAppRendererOptions {
  // existing fields …
  readonly quality?: AuraQualityTier | "auto";              // NEW, default "auto"
  readonly renderScale?: number;                            // NEW, [0.5, 1]
}

export interface AuraApp {
  // existing …
  setOutput(options: Partial<AuraOutputOptions>): void;     // NEW, applied next frame, rebakes LUT
  setQualityTier(tier: AuraQualityTier | "auto"): void;     // NEW
  cutCamera(): void;                                        // NEW, resets temporal history
  addPostPass(pass: AuraCustomPostPass): () => void;        // NEW, returns remover
  // screenshot(): AuraScreenshot — signature UNCHANGED (sync); implementation per 6.2
}

export interface AuraCustomPostPass {
  readonly name: string;
  readonly insertAt: "after-depth" | "before-taa" | "after-taa" | "before-tonemap" | "after-tonemap";
  readonly fragment: { readonly glsl: string; readonly wgsl?: string };
  readonly uniforms?: Readonly<Record<string, number | readonly number[]>>;
  readonly inputs?: readonly ("color" | "depth" | "velocity")[];
}

export const postPresets: Readonly<Record<AuraPostPresetId, AuraPostPreset>>; // NEW export
```

`effects.*` option changes (factories at `index.ts:3441-3630`). `AuraEffectNode` (`:1567`) gains
the listed fields. Unknown or unexecuted fields **throw** `AuraRuntimeError("POST_FIELD_UNSUPPORTED")`
at scene compile time instead of being stored and warned.

How "unknown" is decided: `AuraEffectNode` is one shared bag type for every effect, so the type
system cannot reject a field that belongs to a different effect. `postBridge.ts` therefore exports
`POST_EFFECT_FIELDS: Readonly<Record<AuraEffectKind, readonly string[]>>`, one allowlist per
`effect` value, plus `POST_EFFECT_DEPRECATED_FIELDS` (accepted with a diagnostic). Any other own
key on the node, apart from the common keys `kind/effect/name/id/intensity/enabled` and the
transform keys inherited from `AuraTransformSpec`, throws. The throw has to reach the author.
It must happen in `createAuraApp`/`app.setScene` before the first frame, so that
`await app.ready()` rejects with the error. It must not happen inside `renderer.render()`, where
today's errors are swallowed into `diagnostics.errors` and leave a black canvas (2.3).

```ts
effects.bloom(options?: {
  threshold?: number;        // linear HDR, default 1.0, range [0, 64]   (was clamped [0,1])
  knee?: number;             // fraction of threshold, default 0.25, [0,1] (NEW)
  intensity?: number;        // default 0.25, [0, 4]; NO hidden gain
  scatter?: number;          // upsample radius 0..1, default 0.7 (NEW; `radius` alias)
  color?: AuraColor;         // tint, now honored
  clampLuminance?: number;   // firefly clamp, default 64 (NEW)
  /** @deprecated ignored with diagnostic; tier decides mip count */ quality?: "performance" | "balanced" | "cinematic";
  /** @deprecated ignored with diagnostic (was absolute knee) */ softKnee?: number;
  /** @deprecated ignored */ shoulder?: number;
  /** @deprecated maps to clampLuminance */ maxIntensity?: number; antiBlowout?: boolean;
});
effects.neonBloom(o)    // = bloom({ threshold: 1.0, knee: 0.3, intensity: 0.35, scatter: 0.75, ...o })
effects.cinematicBloom(o) // = bloom({ threshold: 1.0, knee: 0.25, intensity: 0.2, scatter: 0.7, ...o })

effects.ambientOcclusion(options?: {
  radius?: number;           // world metres, default 0.5 (was px-mapped)
  intensity?: number;        // default 1.0 [0, 2]
  falloff?: number;          // 0..1 fraction of radius, default 0.3
  multiBounce?: boolean;     // default true
});
/** @deprecated alias: ambientOcclusion({ radius: 0.2 }) */ effects.contactOcclusion(o);

effects.antiAlias(options?: { mode?: AuraAntiAliasMode /* default "auto" (was "fxaa") */; sharpness?: number });

effects.colorGrade(options?: {
  exposure?: number;          // linear multiplier, NOW APPLIED
  temperature?: number;       // -100..100, Bradford CAT
  tint?: number;              // -100..100
  contrast?: number; saturation?: number; vibrance?: number;
  lift?: AuraRgb; gamma?: AuraRgb; gain?: AuraRgb;          // ASC-CDL style, default [0,0,0]/[1,1,1]/[1,1,1]
  shadows?: AuraRgb; midtones?: AuraRgb; highlights?: AuraRgb; // NOW APPLIED
  lut?: AuraAssetRef | string; lutIntensity?: number;          // .cube, NOW APPLIED
});
effects.vignette(options?: { intensity?: number; smoothness?: number; roundness?: number; color?: AuraColor }); // NEW
effects.filmGrain(options?: { intensity?: number; size?: number; luminanceResponse?: number });               // NEW (GPU)
effects.chromaticAberration(options?: { intensity?: number });                                              // NEW (GPU)
effects.depthOfField(options?: {
  focusDistance?: number;     // metres (NEW)
  fStop?: number;             // default 2.8 (NEW)
  focalLength?: number;       // mm, default from camera fov & 36 mm sensor (NEW)
  maxBlur?: number;           // px at 1080p, default 12 (was ≤8)
  /** @deprecated 0..1 fraction; converted with real near/far */ focus?: number; aperture?: number;
});
effects.motionBlur(options?: { intensity?: number /* shutter fraction, default 0.5 */; maxBlur?: number /* px, default 32 */ });
effects.volumetricFog(o)  // unchanged signature; executes GPU god rays (S4); `color` honored; lightPosition derived when omitted
```

Diagnostics (`AuraRendererDiagnosticReport`, `index.ts:1793`):
```ts
readonly toneMapping: AuraToneMappingOperator;     // CHANGED from literal "aces-filmic"
readonly exposure: { readonly applied: number; readonly source: "output" | "grade" | "auto"; readonly autoEv?: number }; // CHANGED: actually-sent value
readonly post: {
  readonly tier: AuraQualityTier;
  readonly antiAlias: Exclude<AuraAntiAliasMode, "auto">;
  readonly renderPixels: readonly [number, number]; readonly pixelRatio: number; readonly renderScale: number;
  readonly stages: readonly { name: string; format: string; width: number; height: number; gpuMs?: number }[];
  readonly skipped: readonly { name: string; reason: string }[];
  readonly velocityCoverage: { readonly items: number; readonly withVelocity: number };
};
```
Removed: `sceneExposurePresets` as a diagnostics value (`index.ts:4204-4214`). The color-management
`defaultExposure` (`:4197`) is either applied as the `output.exposure` default or deleted. The
decision is applied (value 1.0), so the report never shows a number that is not sent.
`tone: aces-filmic @ <preset>` overlay text (`:18657`) prints `diagnostics.toneMapping` and
`exposure.applied`.

### 7.2 Renderer (`@aura3d/rendering`)

```ts
// packages/rendering/src/post/PostGraph.ts
export interface PostPipelineOptions {
  readonly antiAliasing: { readonly mode: "none" | "msaa" | "taa" | "smaa" | "fxaa"; readonly sharpness?: number };
  readonly renderScale?: number;
  readonly depthRange: { readonly near: number; readonly far: number; readonly projection: "perspective" | "orthographic" };
  readonly ao?: GtaoOptions | false;
  readonly ssr?: SsrOptions | false;
  readonly godRays?: GodRayOptions | false;
  readonly taa?: TaaOptions;
  readonly dof?: DofOptions | false;
  readonly motionBlur?: MotionBlurOptions | false;
  readonly exposure: { readonly value: number; readonly auto?: AutoExposureOptions | false };
  readonly bloom?: BloomOptionsV2 | false;
  readonly toneMapping: { readonly operator: "aces" | "agx" | "neutral" | "reinhard" | "none" };
  readonly grade?: ColorGradeOptionsV2;
  readonly lut?: LutTexture3D | null;
  readonly vignette?: VignetteOptions | false;
  readonly filmGrain?: FilmGrainOptions | false;
  readonly chromaticAberration?: ChromaticAberrationOptions | false;
  readonly dither: boolean;
  readonly backgroundPassthrough?: { readonly color: readonly [number, number, number] } | false;
  readonly customPasses?: readonly CustomPostPass[];
}
export interface GtaoOptions { radius: number; intensity: number; falloff: number; directions: 2 | 4; steps: 4 | 6; halfRes: boolean; temporal: boolean; multiBounce: boolean }
export interface BloomOptionsV2 { threshold: number; knee: number; intensity: number; scatter: number; tint: readonly [number, number, number]; clampLuminance: number; mips: 4 | 5 | 6 }
export interface TaaOptions { feedbackMin: number /*0.88*/; feedbackMax: number /*0.97*/; varianceGamma: number /*1.0*/; upscale: boolean }
export interface DofOptions { focusDistance: number; fStop: number; focalLengthMm: number; sensorHeightMm: number; maxBlurPx: number; halfRes: boolean }
export interface MotionBlurOptions { shutter: number; maxBlurPx: number; samples: 8 | 12 | 16; tileSize: 16 | 20 }
export interface ColorGradeOptionsV2 { temperature: number; tint: number; contrast: number; saturation: number; vibrance: number; lift: Rgb; gamma: Rgb; gain: Rgb; shadows: Rgb; midtones: Rgb; highlights: Rgb; lutIntensity: number }
export interface LutTexture3D { readonly size: number; readonly data: Float32Array /* size³×4, sRGB-encoded domain */ }
export function parseCubeLut(text: string): LutTexture3D;                  // post/CubeLut.ts
export function resolvePostTier(tier: "low" | "medium" | "high" | "ultra", ctx: PostTierContext): Partial<PostPipelineOptions>;
export function bloomNormalization(mips: number, scatter: number): number; // NativeBloomPyramid.ts, replaces resolveBloomPyramidResponseGain

// RenderDevice (WebGL2Device / WebGPUDevice)
executePostGraph(source: SceneTargets, options: PostPipelineOptions, output: RenderTarget | null): PostGraphReport; // NEW
/** @deprecated legacy uber-chain, compat:"3.0" only */ presentLdrPostprocess(...): void;

// Renderer
export interface RendererPostProcessOptions { /* existing fields */ readonly pipeline?: "v2" | "legacy"; readonly v2?: PostPipelineOptions }

// Velocity
export interface RenderItem { /* existing */ readonly previousModelMatrix?: Float32Array; readonly previousInstanceTransforms?: Float32Array; readonly previousJointTexture?: TextureHandle; readonly previousMorphWeights?: Float32Array }
```

Removed from public `@aura3d/rendering` root exports and moved to `@aura3d/rendering/reference`:
`EffectComposer`, `BloomPass` (CPU), `FXAAPass`, `ToneMappingPass`, `toneMapPixels`,
`toneMapFloatPixels`, `colorGradePixels`, `chromaticAberrationPixels`, `filmGrainPixels`,
`ssaoPixels`, `ssrPixels`, `taaPixels`, `outlinePixels`, `volumetricLightPixels`,
`contactShadowPixels`, `runExternalParitySSAO`, plus `cinematic/{Bloom,Vignette,FilmGrain,DepthHaze}Pass`
descriptors. `resolveBloomPyramidResponseGain` is deleted.

---

## 8. Shader changes (GLSL ES 3.00; WGSL mirrors in Phase 7)

Each item names the file it lands in and the exact algorithmic content. Constants not listed are
copied verbatim from the cited reference.

1. **`post/shaders/common.glsl.ts`.** Fullscreen triangle VS. `linearizeDepth` (6.11).
   `reconstructViewPos(uv, linZ, invProj)`. `luma709`. `rgb2ycocg`/`ycocg2rgb`.
   `karisWeight(c) = 1/(1+luma(c))`. `srgbOetf` (piecewise, the vec3 form of `linearToSrgb` at
   `WebGL2Device.ts:3482-3484`). `triangularDither(fragCoord, frame)`, which sums two uniform
   hashes (`fract(sin(dot(...)))` replaced by PCG2D integer hash) minus 1 and scales by 1/255.
   `octEncode`/`octDecode` (reserved).
2. **Forward shaders (`ShaderLibraryCore.ts`, `ShaderLibrary.ts`).**
   - `layout(location=0) out vec4 o_color` writes `.a = f_ind` (6.3) when
     `u_outputColorSpace == 0` (post on).
   - `#ifdef AURA_VELOCITY`: `layout(location=1) out vec2 o_velocity`. The vertex stage adds
     `uniform mat4 u_prevModelMatrix, u_prevViewProjection, u_unjitteredViewProjection` and, under
     `AURA_SKINNING`, `uniform highp sampler2D u_prevJointTexture` with the same `getJointMatrix`
     fetch as current. Under `AURA_INSTANCING` it adds `in vec4 a_prevInstance0..3`. Under morph
     it adds `uniform float u_prevMorphWeights[N]`.
   - Transparent/additive variants (under `AURA_VELOCITY`) declare
     `layout(location=2) out vec4 o_reactive` and write `o_reactive = vec4(alpha)`. They draw with
     `drawBuffers([COLOR_ATTACHMENT0, NONE, COLOR_ATTACHMENT2])`, so velocity is untouched.
     Opaque variants write `o_reactive = vec4(0)` (or rely on the per-frame clear) through
     `drawBuffers([COLOR_ATTACHMENT0, COLOR_ATTACHMENT1, NONE])`. No stencil is involved.
   - The no-post path tone curve (`a3dPbrEncodeOutput`, `ShaderLibraryCore.ts:588-593`,
     `ShaderLibrary.ts:406-411`) is replaced by `#include toneOperator(u_toneOperator)` sharing the
     same functions as the LUT bake. The Narkowicz curve is deleted.
3. **Depth prep (`depthDownsample.glsl.ts`).** Pass A: `R32F = linearizeDepth(texelFetch(depth))`.
   Pass B: half-res `RG32F = (min, max)` of the 2×2 quad (`texelFetch`, no filtering).
4. **GTAO (`gtao.glsl.ts`).** Ported from three r185 `GTAOShader.js`/`GTAONode.js` (MIT): slice
   directions `{2,4}` rotated by a 4×4 interleaved-gradient noise plus the TAA frame index,
   horizon search with `steps` samples along each direction within `radius` metres projected to
   pixels (`radiusPx = radius * projScale / viewZ`, clamped 4..96 px), cosine-weighted integration
   of the visible arc against the reconstructed normal, distance falloff
   `saturate((radius - d)/ (falloff*radius))`, output `ao` in R8. Denoise (`gtaoDenoise.glsl.ts`):
   two 1D bilateral passes, 5 taps, weights
   `exp(-|Δz|/(0.05*z))·gauss`. With TAA it adds a temporal accumulation with velocity
   reprojection and depth rejection (feedback 0.9). Apply: joint-bilateral upsample using
   full-res linear depth, then `hdr.rgb *= mix(1.0, aoMB, hdr.a)` with
   `aoMB = max(ao, ((ao*a + b)*ao + c)*ao)`, where `a = 2.0404*ρ-0.3324`,
   `b = -4.7951*ρ+0.6417`, `c = 2.7552*ρ+0.6903`, ρ = 0.5.
   This replaces `WebGL2Device.ts:3091-3129` entirely.
5. **God rays (`godrays.glsl.ts`).** Half-res. The occlusion source is
   `src = (linZ >= far*0.999 || luma(hdr) > 4.0) ? hdr.rgb : 0` with the light disk mask
   `smoothstep(r1, r0, |uv - lightUv|)`. Radial march of `samples` steps toward `lightUv` with
   `decay^i * weight`, multiplied by `color * intensity` and added to HDR. If `lightUv` is
   off-screen or behind the camera, the intensity fades by
   `saturate(1 - (|lightUv-0.5|-0.5)*4) * step(0, lightClip.w)`. This replaces
   `VolumetricFog.ts:105-144` and `volumetricLightPixels`.
6. **TAA (`taa.glsl.ts`).** Inputs: current HDR, history HDR, velocity, linear depth, previous
   linear depth.
   - Find the closest-depth texel in 3×3 and use its velocity.
   - `uvPrev = uv - v`.
   - Sample history with 5-tap Catmull-Rom. The existing Catmull-Rom code in `taaProgram`
     (`WebGL2Device.ts:3305-3387`) is moved into `taa.glsl.ts`.
   - Neighbourhood in YCoCg: `μ, σ` over 3×3. Clip the history toward the centre to the AABB
     `μ ± γσ` (clip, not clamp), `γ = mix(0.5, varianceGamma, (1 − motionFactor)²)`.
   - Disocclusion: `|prevLinZ(uvPrev) - expectedZ| > 0.1*z` sets the history weight to 0.
   - Feedback `mix(feedbackMin, feedbackMax, 1 - saturate(|v|·size / 2px))`, then
     `feedback = mix(feedback, 0.5, texture(u_reactive, uv).r)`.
   - Resolve with Karis weights in HDR.
   - TAAU variant: the current frame is reconstructed at output resolution with a 9-tap
     Blackman-Harris (Gaussian-approximation) kernel weighted by distance to each jittered sample
     position, as in three r185 `TAAUNode.js`.
7. **DOF (`dof.glsl.ts`).** Physical CoC, all lengths in **metres** inside the formula:
   `f = focalLengthMm / 1000`, `A = f / fStop` (aperture diameter), `z` and `zf = focusDistance`
   are view-space metres from S1. `cocSensor = A · f · (z − zf) / (z · (zf − f))` is in metres on
   the sensor, and `cocPx = cocSensor · 1000 · (heightPx / sensorHeightMm)`, with
   `sensorHeightMm = 24` (36×24 full frame). `cocPx` is the CoC *diameter*. Signed (near
   negative), clamped to `±maxBlurPx` (also a diameter).
   Worked example for the scene 23 test: f = 50 mm, N = 2.8, zf = 3 m, z = 30 m, 1080 px gives
   `A = 0.017857`, `cocSensor = 0.017857·0.05·27/(30·2.95) = 2.724e-4 m`, so
   `cocPx = 0.2724 · 45 = 12.3 px`. Half-res prefilter stores color plus `|coc|`, with a
   separate near-field max-dilated CoC (tile 8 px). Gather: 2 rings (Medium) or 3 rings (High) of
   Vogel-disc samples (24/48 taps), CoC-weighted to prevent background bleeding onto in-focus
   foreground, run in HDR so highlights produce bokeh. Composite with `smoothstep` on `|coc|`
   1–2 px. Replaces `WebGL2Device.ts:3210-3262`.
8. **Motion blur (`motionBlur.glsl.ts`).** McGuire 2012. Tile max of velocity magnitude per 16 px
   tile, then neighbor max over 3×3 tiles. Reconstruction: `samples` taps along the neighbor-max
   direction with soft depth comparison (`softDepthCompare` with 0.05 m extent), jittered by
   interleaved-gradient noise. Velocity is scaled by
   `shutter * (targetFrameTime / actualFrameTime)` so blur is frame-rate independent, clamped to
   `maxBlurPx`. Replaces `WebGL2Device.ts:3264-3299`.
9. **Auto-exposure (`exposure.glsl.ts`).** Pass 1 writes `log2(max(luma, 1e-5))` into a 1/4-res R16F
   with a centre-weighted mask. A mip chain reduces it to 1×1 by average. Adaptation writes a 1×1
   R32F ping-pong:
   `ev = mix(evPrev, clamp(-avgLog2 + log2(0.18) + comp, minEv, maxEv), 1 - exp(-dt·speed))`.
   The composite reads the 1×1 texel. **No readback.**
10. **Bloom (`bloom.glsl.ts`).** 6.6. Prefilter uses the 13-tap pattern (Jimenez 2014) as five
    overlapping 2×2 boxes: the centre box weighted 0.5 and four corner boxes weighted 0.125 each.
    Each box average is Karis-weighted by `1/(1+luma)` before summing. Downsample is the same
    13-tap pattern without Karis.
    Upsample is the 9-tap tent with radius `scatter`, accumulated additively. Normalisation
    uniform `u_bloomNorm = bloomNormalization(N, scatter)`. Replaces
    `WebGL2Device.ts:2838-2873`, `:2941-2957`, the LDR bit-LUT bloom path and the
    `performance` single-scale path.
11. **LUT bake (`lutBake.glsl.ts`).** 6.7. Rendered with `framebufferTextureLayer` into a
    `TEXTURE_3D` RGBA16F, 33 layers. Operator functions are verbatim ports, listed in 6.4. The
    current fake AgX/Neutral (`WebGL2Device.ts:3541-3560`) and `LeanWebGL2Device.ts:3320-3338` are
    deleted. On devices where RGBA16F 3D textures lack linear filtering
    (`OES_texture_half_float_linear` is core in WebGL2, so this is expected never), the analytic
    path is compiled with `#define AURA_ANALYTIC_GRADE`.
12. **Composite (`composite.glsl.ts`).**
    - `c = texture(u_hdr, uv_ca(uv)) * u_exposure * autoExp + bloom(uv) * u_bloomIntensity`.
    - Chromatic aberration samples R/G/B at `uv ± dir·intensity·|uv-0.5|²`, 3 taps total, when
      CA is enabled.
    - `disp = texture(u_lut3d, shaperEncode(c))`.
    - Vignette: `disp *= mix(1, vignetteColor, pow(saturate(len·intensity), smoothness))` with
      roundness-aspect correction.
    - Background passthrough: `linZ >= far*0.999 && !envBackground` gives `disp = clearColorSrgb`.
    - `o = vec4(disp, luma(disp))`, with luma for FXAA.
    - It runs the old `finalColorAt` once per pixel, not 5×
      (`WebGL2Device.ts:3611-3631` today evaluates tone map + grade up to 25 times per pixel).
13. **FXAA (`fxaa.glsl.ts`).** 6.5. Verbatim port of three r185 `FXAAShader.js` using
    `textureLod` with bilinear filtering on the RGBA8 composite and luma read from `.a`. Constants:
    `contrastThreshold 0.0312`, `relativeThreshold 0.063`, `subpixelBlending 1.0`, edge steps
    `1.0, 1.5, 2.0, 2.0, 2.0, 4.0`, edge guess `8.0`. They are exposed as `FxaaOptions` with these
    defaults; the legacy `edgeThreshold/subpixelBlend` names are removed.
14. **SMAA (`smaa.glsl.ts`).** Three passes ported verbatim from three r185 `SMAAShader.js`: colour
    edge detection (`SMAA_THRESHOLD 0.1`), blending-weight calculation (AreaTex 160×560 RG8,
    SearchTex 64×16 R8, `SMAA_MAX_SEARCH_STEPS 8`, no diagonal search), neighbourhood blending.
15. **Finalize (`finalize.glsl.ts`).** Film grain is
    `n = (hash(uv*size + frame) - 0.5) * intensity * mix(1, 1 - luma, luminanceResponse)`, added in
    display space. Then RCAS sharpening when TAA/TAAU sharpness > 0 or renderScale < 1 (FSR1
    RCAS, limit 0.25). Then `+ triangularDither`. Writes to the default framebuffer. Fused with
    FXAA when the mode is fxaa.

## 9. Rendering changes

- `Renderer.executePostprocess` (`Renderer.ts:977`) builds `PostPipelineOptions` from
  `RendererPostProcessOptions.v2` and calls `device.executePostGraph`. With `pipeline:"legacy"` it
  calls `presentLdrPostprocess` unchanged. `canFuseLdrPostprocess`/`ldrFusionPassRank`
  (`:2111-2137`) are deleted with the legacy path in Phase 8.
- Forward target allocation (`Renderer.ts:595-618`, `:928-944`) adds the RG16F velocity
  attachment in taa mode and when motion blur is on. MSAA is 4 only in msaa mode and only if the
  pixel guard passes. Depth is always a sampleable texture when any depth stage runs.
- `TemporalHistory` keeps history ownership (history-a/b, jitter, commit/reset) but no longer draws
  geometry. `prepare()` returns jittered and unjittered matrices and the per-item previous
  matrices, which `ForwardPass` binds. The throw at `TemporalHistory.ts:73-74` is replaced by
  per-item capability. Items without velocity support (custom shaders without `AURA_VELOCITY`) are
  counted in `velocityCoverage`, and the tier falls back to msaa if coverage < 100% of opaque
  items.
- `ForwardPass` uses `drawBuffers([COLOR_ATTACHMENT0, COLOR_ATTACHMENT1, NONE])` for opaque and
  `[COLOR_ATTACHMENT0, NONE, COLOR_ATTACHMENT2]` for transparent/additive when the velocity MRT is
  bound, and `[COLOR_ATTACHMENT0]` otherwise. `color1` is cleared to `(0,0)` and `color2` to `0`
  each frame with `clearBufferfv`.
- Root bridge `createProductionRuntimePostprocess` (`index.ts:12797-12935`) is replaced by
  `postBridge.ts:createRootPostPipeline(snapshot, camera, output, tier)`. It reads every
  `effects.*` field listed in 7.1, throws on unsupported fields, passes real camera clipping, and
  resolves the AA mode by tier.
- `GameRenderPreset.ts:372-386`, `:450`: `targetFormat` → `"rgba16f"`, explicit
  `toneMapping: { operator: "aces" }` (or preset), bloom translated to V2 values
  (`threshold 1.0`, `intensity 0.25`). Aura Clash then joins the HDR path. Its vision tone score of
  3 ("murky mid-grey") is the target to beat.
- Product viewer (`production-runtime/index.ts:1454-1641`): the FXAA default `fxaa !== false` with
  `edgeThreshold 0.09/subpixelBlend 0.24` becomes the msaa/taa tier policy. Exposure default 0.9 is
  retained as `output.exposure` with operator `neutral`.
- Canvas creation (`index.ts:13586-13597`, profiles `:4232-4302`): `antialias:false`,
  `preserveDrawingBuffer: options.capture === true`. `app.screenshot()` keeps its synchronous
  signature and uses `renderFrameNow()` + same-task `toDataURL` (6.2).
- `WebGPUDevice`: `executePostGraph` with WGSL stages in Phase 7. Until then, root WebGPU (PRD 11)
  must not be enabled with `pipeline:"v2"` unless every requested stage has WGSL.
- `LeanWebGL2Device.ts`: either imports the same `post/shaders/*.glsl.ts` strings or is deleted
  (PRD 15). It must not keep its own copy of the bloom/FXAA/SSAO/tone shaders.

---

## 10. Migration plan

1. **Ship v2 behind a flag.** `RendererPostProcessOptions.pipeline` defaults to `"legacy"`. The
   capture harness and benchmarks run both, and A/B evidence is produced (Phases 1–4).
2. **Flip the default to v2** in the minor release that lands Phase 5. `compat: { post: "3.0" }`
   restores legacy for one minor release.
3. **Codemod `tools/quality-rebuild/codemods/post-v2.mjs`** (new directory). It runs on an
   explicit file list, not a glob: the 17 game `apps/showcase-<id>/src/main.ts` files named in
   section 5, `apps/aura-clash-showcase/src/**`, `examples/neon-corridor-strike/**` and
   `templates/**`. The 10 non-game `apps/showcase-*` apps are excluded and listed in the dry-run
   output as "not migrated". It does the following:
   - Removes `softKnee`, `shoulder` and `quality` from `bloom/neonBloom/cinematicBloom` calls.
   - Rewrites `threshold` values < 1 to `1.0` and leaves a `// post-v2: was <old>` comment.
   - Removes `effects.antiAlias({ mode: "fxaa" })` (tier auto).
   - Rewrites `effects.contactOcclusion(o)` to `effects.ambientOcclusion({ radius: 0.2, ...o })`,
     so an authored radius such as mech-hangar's `0.6` (`apps/showcase-mech-hangar/src/main.ts:717`)
     is kept. The graph has one AO stage. Six games (bank-shot, blockfall-reactor, neon-swarm,
     skyline-runner, turbo-drift-circuit, vault-breakers) author both `ambientOcclusion` and
     `contactOcclusion`. For those, the codemod keeps the `ambientOcclusion` call, deletes the
     `contactOcclusion` call, and leaves a `// post-v2: merged contactOcclusion(<args>)` comment.
     The bridge throws `POST_DUPLICATE_STAGE` if two AO nodes reach it.
   - Removes `pixelRatio: 0.7` from skyline-runner and records the reason in the PR body.
   - Inserts `output: { preset: <mapped> }` using this mapping: courier, turbo, rooftop,
     skyline, neon-swarm, gallery-shift, pulse-tunnel, vault-breakers, blockfall, bank-shot →
     `neon-night`; aurora-lander, orbital-defense, gravity-post → `space`; deep-recovery →
     `underwater`; aura-clash, mech-hangar → `arena-fight`; siege-golf, patrol-wing →
     `daylight-outdoor`.
   - Prints, per game, the material calls whose emissive luma × strength < 1.0. A human or agent
     then raises those values (6.6). The codemod does not auto-edit emissive values.
4. Per-game tuning and evidence happen in PRD 14. This PRD delivers the codemod, the per-game
   list of emissive calls to adjust, and before/after captures.
5. Skills/templates (PRD 13) replace the cargo-culted tail with `output: { preset }`. They
   document "do not" rules: no FXAA with MSAA/TAA, no bloom threshold < 1 on lit scenes, emissive
   ≥ 2.5 for glow, and do not fix bloom blobs by lowering intensity.

## 11. Backward compatibility

| Surface | Change | Compatibility measure |
|---|---|---|
| `effects.bloom` threshold > 1 | now allowed | additive |
| `softKnee/shoulder/quality/maxIntensity/antiBlowout` | ignored or mapped | accepted with `deprecated` diagnostic for one minor release, then type error |
| `effects.antiAlias()` default mode | `"fxaa"` → `"auto"` | `mode:"fxaa"` still works and now means real FXAA *instead of* MSAA |
| `colorGrade.exposure/shadows/highlights/lut` | now applied | visible change (intended); games pass 1.02–1.06 → +2–6% brightness (19 §C12) |
| `effects.depthOfField.focus/aperture` | converted with real near/far | deprecated |
| `contactOcclusion` | alias | deprecated |
| `AuraRendererDiagnosticReport.toneMapping` | literal → union | widening; consumers comparing to `"aces-filmic"` must update (search `tests/**`, `tools/**`) |
| `qualityProfile` | mapped to tiers | deprecated |
| `pixelRatio: number` | unchanged meaning | object form added |
| `preserveDrawingBuffer` | false by default | `capture:true`; evidence tools (`tools/quality-rebuild-capture`, `tests/browser/*screenshot*`) must use `app.screenshot()` or set `capture:true` |
| CPU post exports | moved to `@aura3d/rendering/reference` | re-export with `@deprecated` from the old path for one minor release; root entry does not import them |
| `renderer.render` with `postprocess.execution:"cpu-deterministic"` | unchanged | still supported for golden tests |
| Legacy look | `compat:{post:"3.0"}` | one minor release |

Semver: the default flip is a visible-output change. It ships as a minor with `compat` if PRD 15
keeps 3.x, otherwise in 4.0. PRD 15 owns that decision.

## 12. Dependencies on other PRDs

- **PRD 01 (Rendering Core / Color / HDR).** DPR default `min(devicePixelRatio, cap)` with
  resize/matchMedia re-evaluation. Camera clipping exposure to the renderer. `#rgb`/CSS color
  parsing (affects the vignette/tint/clear color). Shared tone operator for the no-post path.
  This PRD lands the DPR change itself in Phase 1 if PRD 01 has not, because the AA policy and
  the MSAA memory guard depend on it.
- **PRD 02 (Lighting / IBL / Reflections / Shadows).** Forward shader separation of direct vs
  indirect terms (needed for `f_ind`). SSR algorithm quality. Screen-space contact shadows
  (replaces the deleted contact-shadow post). HDR IBL, so highlights exist to bloom and to tone
  map (02 §2: the default IBL is Reinhard-tonemapped 8-bit). Ambient-kills-IBL fix (15 of 18 games,
  19 §C1). That fix changes `f_ind` distributions, so AO tuning comes after it.
- **PRD 04 (Materials / glTF).** Emissive strength as an unbounded HDR multiplier, and the
  `KHR_materials_emissive_strength` import. Without it, threshold 1.0 bloom has nothing to bloom.
- **PRD 06 (Animation / Skinning).** Previous-frame joint texture for skinned velocity. Morph
  weight history.
- **PRD 07 (VFX / Particles / Atmospherics).** Particle shaders write the `color2` reactive mask and no
  velocity. Froxel volumetric fog. Fog defaults (06 §3: 40% haze at 10 m flattens contrast before
  tone mapping).
- **PRD 08 (Camera / Game Feel).** `cutCamera()` on teleports and cuts. Motion blur and DOF
  presets for chase cameras.
- **PRD 11 (WebGPU / Performance Tiers).** Device-tier heuristic for `quality:"auto"`. The
  dynamic-resolution governor drives `renderScale`. WGSL root enablement. A real-device
  performance lab.
- **PRD 12 (Visual Benchmark + Regression).** New post scenes 19–25 (section 16.1). DSF-2 capture
  runs. Pixel metrics (bloom energy, banding, edge crawl). Vision-judge prompts for post criteria.
- **PRD 13 (Agent Authoring).** Skill text and template defaults using presets.
- **PRD 14 (18-Game Rebuild).** Per-game emissive retune and final sign-off.
- **PRD 15 (API / Package Consolidation).** Semver of the default flip, deletion of
  `LeanWebGL2Device` duplication, and the `@aura3d/rendering/reference` subpath.

---

## 13. Implementation phases

Each phase merges independently. "Captured" means a run of `.github/workflows/quality-rebuild-capture.yml`
(macos-14, ANGLE Metal) whose artifacts are committed under
`docs/project/aura3d-quality-rebuild/evidence/prd03/<phase>/`.

**Phase 0: baseline and truthful diagnostics (no pixel change).**
Add a DSF-2 desktop run (1440×900 @2) to the capture tool. The DSF-3 mobile run (390×844 @3)
already exists (2.7), so only its backing-size recording is checked.
Add `diagnostics().renderer.post` (7.1) reporting what actually executes, including exposure
applied and per-stage GPU ms where `EXT_disjoint_timer_query_webgl2` exists. Add benchmark
scenes 19–25 (16.1) with three.js references.
*Exit:* a baseline capture of 18 games × {DSF1, DSF2, mobile DSF3} and 25 benchmark scenes is
committed. Diagnostics for all 18 games list the executed stage set and match the census in 2.6.
For example, deep-recovery shows `volumetric-light: cpu-readback` (and, because fusion is
all-or-nothing, every other pass in its chain as `cpu-readback` too), and 16 games show
`exposure.applied: 1` despite authored 1.02–1.06. The bundle baseline for every gated target in
`tests/reports/bundle-size.json` is recorded in `evidence/prd03/phase0/bundle.json`.

**Phase 1: correctness fixes on the existing chain (small diffs, all games change).**
Wire exposure. Real AgX/Neutral with operator selection. Pass the real camera depth range. Dither.
Real FXAA (three r185 port) replaces the blur, and FXAA is never stacked on MSAA. FXAA cannot
stay inside the present shader: it would re-run tone map + grade (`finalColorAt`) for each of its
~20 taps. So the legacy present becomes two draws, (1) tone map + grade into the existing
ping-pong RGBA8 target with luma in alpha, then (2) FXAA to the output. Canvas `antialias:false`,
`preserveDrawingBuffer` capture-only. DPR from the device with a cap (unless PRD 01 already
landed it). Aura Clash preset to rgba16f + explicit operator.
*Exit:* unit tests in 15.1 for these items pass. Benchmark scene 21 (tone ramp) matches three
r185 per operator within ΔE2000 mean ≤ 1.0. Scene 20 (thin geometry) edge-crawl ≤ three × 1.2.
Banding scene 25 has no contour steps > 1 LSB. All 18 games captured. Vision review shows no game
whose `anti_aliasing` or `tone_mapping` score drops versus baseline.

**Phase 2: PostGraph, HDR ordering, bloom V2, LUT composite (behind `pipeline:"v2"`).**
`PostGraph`, `PostResources`, S1, S9, S10 (LUT bake + composite), S12. Root bridge rewrite
(`postBridge.ts`) with throw-on-unsupported. `bloomNormalization` replaces the gains.
*Exit:* on v2, benchmark scene 18 bloom halo energy is within ±15% of three, measured as
(bloom-on − bloom-off) luminance summed over the halo mask. Scene 18 is held out: the
`mapThreeUnrealBloom` calibration (Phase 2 checklist) is fitted on scene 19 only and frozen
before scene 18 is measured. Scene 03 (helmet emissive) is a second held-out check at ±20%.
Scene 19 (HDR bloom) shows zero bloom
contribution on surfaces with linear luma < 0.75: mean added luma ≤ 0.5% of surface luma. The LUT
path is within 1 LSB of the analytic path. Courier Rush v2 capture: van region has ≤ 2% pixels
at (255,255,255), against the vision report of "almost entirely clipped". `pnpm check:bundle-size`
passes for every gated target. The cinematic-scene starter is at 398,503 B against a 400,000 B
limit today (1,497 B headroom), so v2 shader modules must be reachable only through a dynamic
`import()` taken when `pipeline:"v2"` is selected, until the Phase 3 kernel move frees space.

**Phase 3: GTAO, GPU god rays, grain/CA/vignette, CPU readback removal.**
S2 GTAO with `f_ind`, S4 god rays, CA in S10, grain in S12, `effects.vignette/filmGrain/chromaticAberration`.
Interactive `readPixels` post path blocked. CPU kernels move to `@aura3d/rendering/reference`.
*Exit:* Deep Recovery desktop 1280×720 median frame time drops from 849.9 ms to ≤ 50 ms on the
same runner (≥ 17× improvement), with god rays visible. No `readPixels` call during 300
interactive frames in any of the 18 games, asserted by a browser spy. Scene 22 (AO grounding)
vision-judged "equivalent or better" than three `GTAOPass` on contact darkening. The 7 AO games
show measurable contact darkening: luminance within 10 cm of contact ≥ 15% darker than with AO
off.

**Phase 4: velocity for all geometry, HDR TAA/TAAU, motion blur, DOF.**
Forward MRT velocity (rigid, instanced, skinned, morph). TemporalHistory refactor. S5, S6, S7.
`cutCamera()`.
*Exit:* `velocityCoverage.withVelocity == items` for benchmark scenes 08, 15, 16, 18 and for
aura-clash, mech-hangar and skyline-runner. Scene 24 (TAA motion) shows ghost-trail length
≤ 2 px behind a skinned character running at 4 m/s over 16 frames, and three `TRAANode`-equivalent
or better under vision review. Motion blur frame-rate independence: blur length at 30 vs 60 fps
within 10%. DOF scene 23 shows no in-focus foreground halo, vision-judged.

**Phase 5: presets, tiers, codemod, default flip.**
`postPresets`, `PostQualityTiers`, `quality:"auto"`, `setQualityTier`, the codemod and the
per-game emissive lists. Default `pipeline:"v2"`. `compat:{post:"3.0"}`.
*Exit:* all 18 games captured on v2 at DSF1/DSF2/mobile. Vision post-attributable categories
(tone_mapping, anti_aliasing, postprocessing) are ≥ baseline in 18/18 games and ≥ +1.5 points
mean. No game shows a new black frame or crash, and console errors are none. On the reference
runner, each game's DSF1 median frame time is no worse than its Phase 0 baseline by more than
10%. The exception is a stage newly enabled by the tier (e.g. GTAO, TAA), whose cost is reported
separately as an on/off toggle delta. Deep Recovery is judged by the Phase 3 target instead.
The runner is paravirtual, so absolute section 17 budgets are not
judged there. Absolute budgets are signed off on the PRD 11 real-device lab (section 19) for
Low/Medium/High before the default flip merges.

**Phase 6: SMAA, auto-exposure, custom passes.**
S11 SMAA with lazy textures, S8 auto-exposure, `addPostPass`.
*Exit:* SMAA edge quality on scene 20 is ≥ FXAA and within 10% of three `SMAAPass` on the
edge-error metric. Auto-exposure converges within 1.5 s on an indoor→outdoor cut (scene 21b) with
no readback. The custom pass example (`apps/postprocessing-custom`) renders through the
`after-tonemap` insertion point.

**Phase 7: WGSL parity.**
Every v2 stage gets a WGSL mirror in `post/shaders/*.wgsl.ts`. `WebGPUDevice.executePostGraph`.
WebGPU exposure becomes a linear multiplier (today `exp2`, `WebGPUPostShaders.ts:253`).
*Exit:* `.github/workflows/native-webgpu-functional-301.yml` (or its PRD 11 successor) runs scenes
18–25 on WebGPU, and WebGL2-vs-WebGPU per-pixel difference is ≤ 2 LSB mean and ≤ 1% pixels
> 8 LSB.

**Phase 8: legacy removal.**
Delete `presentLdrPostprocess`, the legacy shaders in `WebGL2Device.ts:2838-3633`, the LDR bloom
LUTs, `canFuseLdrPostprocess`, `resolveBloomPyramidResponseGain`, the duplicated shaders in
`LeanWebGL2Device.ts`, and `compat:{post}`.
*Exit:* every gated target in `tests/reports/bundle-size.json` (lean core ≤ 80,000 B,
product-viewer ≤ 250,000 B, cinematic-scene ≤ 400,000 B, mini-game ≤ 250,000 B gzip) is at or
below its Phase 0 baseline, and the informational engine compatibility root (575,343 B gzip
today) has a delta ≤ 0. `rg` finds no `presentLdrPostprocess`, `subpixelBlend` or `ResponseGain`
in `packages/`.

---

## 14. Task checklist

Phase 0
- [ ] `tools/quality-rebuild-capture/`: add viewport preset `desktop-1440x900@2` (Playwright
  `deviceScaleFactor: 2`) next to the existing `desktop-1920x1080`, `desktop-1280x720` and
  `mobile-390x844` (DSF 3) runs. Canvas backing size is already recorded per run
  (`runs[].canvas.{w,h,cssW,cssH}`); add `backingRatio = w / cssW` to the slim report. Test:
  `tests/unit/tools/quality-rebuild-capture-viewports.test.ts` asserts the four presets are
  emitted with their DSF.
- [ ] `packages/engine/src/agent-api/index.ts`: add `post` to `AuraRendererDiagnosticReport`
  (`:1793`). Populate it from `Renderer` diagnostics of the executed plan, not the authored nodes.
  Test: `tests/unit/agent-api/post-diagnostics.test.ts` builds a scene with `colorGrade({exposure:1.05})`
  and asserts `exposure.applied === 1` on the legacy pipeline (truthful), then `1.05` after Phase 1.
- [ ] `packages/rendering/src/WebGL2Device.ts`: add `PostTimer`. It wraps each stage in
  `EXT_disjoint_timer_query_webgl2` queries when available and reports `gpuMs`, or `undefined`
  when unavailable. Test: a browser spec asserts no exception when the extension is absent.
- [ ] `benchmarks/quality-rebuild/shared/scenes.ts`: add scenes 19–25 per 16.1, with Aura
  (`aura3d/19-*.ts`…) and three (`three/*`) implementations. three side for passes in
  `examples/jsm/postprocessing` (`UnrealBloomPass`, `GTAOPass`, `BokehPass`, `FXAAPass`,
  `SMAAPass`): `EffectComposer` + `RenderPass` + named pass + `OutputPass` on `HalfFloatType` with
  `samples:4`, the same pattern as `three/common.ts:336-342`. `TRAANode` and `TAAUNode` exist only
  as TSL nodes (`examples/jsm/tsl/display/`) and need `WebGPURenderer`. Scenes 20 (taa mode) and
  24 use `new WebGPURenderer({ forceWebGL: true })` with a TSL `PostProcessing` chain, so both
  engines run on WebGL2 on the same runner.
- [ ] Commit the baseline capture artifacts to `evidence/prd03/phase0/`.

Phase 1
- [ ] `index.ts` `createProductionRuntimePostprocess` (`:12898-12904`): set
  `toneMapping.exposure = (options.output?.exposure ?? 1) * (authoredColorGrade?.exposure ?? 1)`
  and `operator = options.output?.toneMapping ?? "aces"`. Delete the warning at `:4547`. Test:
  `post-diagnostics.test.ts` asserts the bridge output `toneMapping.exposure === 1.05` for
  `colorGrade({exposure:1.05})`.
- [ ] `index.ts`: add `output?: AuraOutputOptions` to `AuraCreateAppOptions` (`:10773`) and thread
  it to `startProductionRender`. `app.setOutput()` updates it per frame. Test: unit test via a fake
  renderer captures options.
- [ ] `packages/rendering/src/post/ToneOperators.ts`: TS `aces`, `agx`, `neutral`, `reinhard`
  ports. Constants are copied from `node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js:46-200`.
  Test: `tests/unit/rendering/post-tone-operators.test.ts` checks 64 golden input→output triples
  per operator. Goldens are generated once by running the three GLSL in a headless WebGL capture
  on macos-14 and committed with the generating script.
- [ ] `WebGL2Device.ts:3541-3560` and `LeanWebGL2Device.ts:3320-3338`: replace `agx()`/`neutral()`
  with GLSL ports, applied to the RGB vector (not per channel). Delete `toneMapChannel` usage for
  these operators. Browser test: `tests/browser/post-tone-ramp.spec.ts` renders an HDR ramp
  0..16 for each operator and compares readback with `ToneOperators.ts` within 1 LSB.
- [ ] `Renderer.ts` `executePostprocess` (`:977`): pass
  `depthRange: { near, far, projection }` from the camera to `presentLdrPostprocess`. The root
  passes `resolveCameraClipping` values. Test: `tests/unit/rendering/post-depth-range.test.ts`
  asserts the device receives 0.05/100 for a default root camera. A browser test checks DOF
  focus at 10 m on a 0.05/100 camera.
- [ ] `WebGL2Device.ts:3611-3631`: delete the cross blur. Split the legacy present into two draws
  (Phase 1 text above): the present program writes tone-mapped + graded RGBA8 with luma in alpha
  into the ping-pong target, then a new FXAA program (`post/shaders/fxaa.glsl.ts`, three r185
  port per 6.5 and 8.13) writes the output. Replace the defaults at `:1921-1922` with
  `contrastThreshold 0.0312 / relativeThreshold 0.063 / subpixelBlending 1.0`. Test:
  `tests/browser/post-fxaa.spec.ts` renders the same inputs through Aura's FXAA and through three
  r185 `FXAAPass` (from the benchmark three harness) and asserts three things.
  (a) A 1-px white line on black at 3°: per-column max luma is ≥ 0.9× three's in every column,
  and mean absolute difference from three's output is ≤ 2 LSB. The old shader fails (a)
  because it only blends the 4-neighbour average.
  (b) A low-contrast texture (uniform noise ±0.012 luma around 0.5, below the 0.0312 contrast
  threshold) is unchanged within 1 LSB.
  (c) A 1-px black/white checkerboard is *expected* to be blurred by FXAA, as three's is. It
  must match three within 2 LSB mean. It is not asserted unchanged, because no FXAA variant can
  tell texture edges from geometry edges.
- [ ] `index.ts:12859`, `:12924`: `effects.antiAlias` default mode `"auto"`. In the bridge,
  `mode:"fxaa"` sets `postprocess.sampleCount = 1`. `auto` resolves to msaa (Phase 1) and emits
  no `fxaa`. Test: unit test asserts no plan contains both `sampleCount 4` and `fxaa`.
- [ ] `WebGL2Device.ts` present shader (`:3453-3633`): add `triangularDither` before the final
  write. `output.dither` defaults true. Test: `tests/browser/post-banding.spec.ts` renders scene
  25 and asserts the longest run of identical 8-bit values along the gradient ≤ 1.5× the ideal
  quantization run, and that no contour edge exists (Sobel on 8-bit luma with threshold 1 finds
  < 0.5% pixels).
- [ ] `index.ts:13591`, `:13593` and profiles `:4232-4302`: `antialias:false`,
  `preserveDrawingBuffer: options.capture === true`. Add `capture?: boolean` to
  `AuraCreateAppOptions`. `app.screenshot()` (`:11701-11703`) stays synchronous: when not in
  capture mode it calls `productionController.renderFrameNow()` and then `toDataURL` in the same
  task (6.2). Audit `tests/browser/**` and `tools/**` for direct `canvas.toDataURL`,
  `gl.readPixels` or `drawImage(canvas)` calls made outside a frame callback
  (`rg -n "toDataURL|readPixels|drawImage\(" tests/browser tools`). Each hit switches to
  `app.screenshot()` or passes `capture:true`, and the PR lists them. Test:
  `tests/browser/post-context-attributes.spec.ts` asserts
  `gl.getContextAttributes()` gives `{antialias:false, preserveDrawingBuffer:false}` by default and
  `{preserveDrawingBuffer:true}` with `capture:true`. It also asserts that `app.screenshot()` called
  from a `setTimeout` (outside rAF) returns an image whose mean luma is within 1 LSB of a
  `capture:true` screenshot of the same frame.
- [ ] DPR (only if PRD 01 has not landed it): `index.ts:11133`, `:12280`. Resolve
  `pixelRatio = typeof o === "number" ? o : min(devicePixelRatio, o?.max ?? tierCap)`.
  Profiles contribute the cap only. Re-evaluate on `resize` and on
  `matchMedia("(resolution: Xdppx)")` change in `resizeRenderer` (`:12294-12310`). Test: unit test
  with a mocked `devicePixelRatio=2` gives backing = 2× CSS. A browser test at DSF 2 asserts
  `canvas.width === 2*clientWidth`.
- [ ] `Renderer.ts` forward target: MSAA memory guard. If `w*h > 2.4e6` and mode msaa, downgrade to
  `smaa` (Phase 6) or `fxaa` (until Phase 6), and record it in `post.skipped`. Test: unit test with
  3840×2160 asserts mode != msaa.
- [ ] `GameRenderPreset.ts:373`, `:450`: `targetFormat:"rgba16f"`,
  `toneMapping:{operator:"aces", exposure:1}`. Test: unit test asserts the preset output. Aura
  Clash capture.
- [ ] `apps/showcase-skyline-runner/src/main.ts:1879`: remove `pixelRatio: 0.7`. Capture before
  and after.

Phase 2
- [ ] Create `packages/rendering/src/post/PostGraph.ts` with `executePostGraph` orchestration,
  stage descriptors `{name, inputs, outputs:{format, scale}, enabled(options)}`, and the fixed
  order from 6.1. Test: `tests/unit/rendering/post-graph-order.test.ts` asserts the stage order for
  every option combination (2^10 enumerations) and that no stage before S10 has an `rgba8` output.
- [ ] Create `post/PostResources.ts` with a pool keyed `(w,h,format,samples)`. Release on resize.
  Test: unit test counts allocations across 100 frames as constant.
- [ ] `post/shaders/bloom.glsl.ts`: prefilter, downsample and upsample per 6.6.
  `NativeBloomPyramid.ts`: delete `resolveBloomPyramidResponseGain` (`:106-109`). Add
  `bloomNormalization(mips, scatter)`. Mips start at half resolution. Test:
  `tests/unit/rendering/native-bloom-pyramid.test.ts` gains a normalization test: a constant input
  E above threshold yields composite bloom E ±2%, computed through a TS mirror of the up/down
  weights. Browser test: a constant-color HDR quad (luma 2.0, threshold 1.0, knee 0) gives a
  measured bloom contribution of 1.0 ±3% × intensity.
- [ ] `WebGL2Device.ts:4481-4509` `normalizeNativeBloomOptions`: accept threshold [0,64] and
  knee [0,1]. Remove the softKnee ≤ 0.5 throw. Map deprecated fields per 7.1. Test: unit tests for
  each mapping and a deprecation diagnostic.
- [ ] `post/shaders/lutBake.glsl.ts` + `composite.glsl.ts`: per 6.7 and 8.11–8.12. LUT 33³
  RGBA16F `TEXTURE_3D`, rebaked only when a grade hash changes. Test:
  `tests/browser/post-lut.spec.ts` checks a 4096-step ramp LUT vs analytic within 1 LSB for each
  operator, and that rebake count = 1 across 60 frames with constant params.
- [ ] `post/CubeLut.ts` `parseCubeLut`: supports `LUT_3D_SIZE`, `DOMAIN_MIN/MAX`, comments. Throws
  on 1D LUTs and size > 65. Test: `tests/unit/rendering/post-cube-lut.test.ts` with an identity
  LUT and a fixture `tests/fixtures/luts/teal-orange-33.cube`.
- [ ] `post/shaders/finalize.glsl.ts`: dither + grain + RCAS. Fused with FXAA. Test: covered by
  the banding and FXAA specs on v2.
- [ ] `packages/engine/src/agent-api/postBridge.ts` `createRootPostPipeline(snapshot, camera,
  output, tier)`: reads every 7.1 field and throws `POST_FIELD_UNSUPPORTED` on unsupported ones.
  `index.ts:14001` uses it when `pipeline:"v2"`. Test:
  `tests/unit/agent-api/post-bridge.test.ts` covers one case per field (exposure, lut, shadows,
  highlights, bloom color, threshold > 1) asserting it is present in the output pipeline. It
  asserts that an unknown field throws, iterating `POST_EFFECT_FIELDS` so that every allowlisted
  field has a "reaches the pipeline" assertion (the test fails if a field is allowlisted but
  unasserted). It asserts that the throw rejects `app.ready()` rather than landing in
  `diagnostics.errors`.
- [ ] Bundle gate for v2: `post/` modules are loaded by `import()` from `Renderer` only when
  `pipeline:"v2"`. Test: `pnpm check:bundle-size` passes for all gated targets, and an esbuild
  metafile assertion in `tests/unit/rendering/post-bundle-split.test.ts` shows `post/shaders/*` in a
  deferred chunk, not in the critical path of the cinematic-scene and mini-game starters.
- [ ] Background passthrough: delete the `colorToAcesInputClearColor` use (`index.ts:15400-15418`)
  on v2. The composite outputs the authored clear color for far-depth pixels. Test: browser test
  for clear `#030711` with each operator gives readback within 1 LSB of `(3,7,17)`.
- [ ] `benchmarks/quality-rebuild/aura3d/common.ts:254-256`: map three
  `UnrealBloomPass(strength, radius, threshold)` through
  `mapThreeUnrealBloom(strength, radius, threshold): BloomOptionsV2` (new, in
  `benchmarks/quality-rebuild/aura3d/`). Calibrate once on scene 19 to ±10% halo energy and commit
  the calibration log. Remove `quality:"cinematic"`. Update the capability-log lines at `:131-135`
  to "supported" once exposure and tone selection work.

Phase 3
- [ ] `ShaderLibraryCore.ts` / `ShaderLibrary.ts` PBR fragment: write
  `o_color.a = f_ind`, with `indirect` = ambient + IBL diffuse + IBL specular as computed there
  (coordinate with PRD 02's light-term refactor). `ForwardPass`: transparent and additive use
  `blendFuncSeparate(..., ZERO, ONE)`. Test: browser test with an emissive-only quad gives
  `a ≈ 0`, an ambient-only lit quad gives `a ≈ 1`, read back from the forward target in a debug
  view `post.debugView = "indirect-fraction"`.
- [ ] `post/shaders/depthDownsample.glsl.ts`, `gtao.glsl.ts`, `gtaoDenoise.glsl.ts` per 8.3–8.4.
  Delete SSAO at `WebGL2Device.ts:3091-3129` on v2. Test: browser test on scene 22 with a 1 m cube
  on a plane, camera at 8 m, near 0.05/far 100. AO texture mean in a 10 cm band at the contact
  edge ≤ 0.75, and ≥ 0.97 on open floor 1 m away. The old shader gives ~1.0 everywhere at this
  distance (19 §C14).
- [ ] `effects.ambientOcclusion` (`index.ts:3518`): radius in metres. `contactOcclusion` (`:3528`)
  becomes an alias. Test: bridge unit test.
- [ ] `post/shaders/godrays.glsl.ts` per 8.5. `VolumetricFog.ts`: `resolveVolumetricFog` returns a
  GPU stage descriptor with `lightUv` projected from the strongest directional light. The bridge
  passes `color` (`index.ts:12810-12822`). Test: browser spec on scene 25b, a sun behind pillars,
  asserts radial streak luminance > 0 and `readPixels` call count 0.
- [ ] `effects.vignette`, `effects.filmGrain`, `effects.chromaticAberration` factories in
  `index.ts` `effects`. Bridge mapping. GPU in S10/S12. Test: bridge unit test plus a browser
  spec, e.g. vignette 0.5 gives corner luma ≤ 0.6 × centre on a flat field.
- [ ] `Renderer.ts:1245-1280` and the async variant: throw `POSTPROCESS_PASS_NOT_GPU` unless
  `execution === "cpu-deterministic"`. In production builds (`import.meta.env.PROD` /
  `process.env.NODE_ENV === "production"`), skip and record instead. Test: unit test with a fake
  device asserting the throw. Browser spec
  `tests/browser/post-no-readback.spec.ts` wraps `WebGL2RenderingContext.prototype.readPixels` and
  asserts 0 calls across 300 frames for each of the 18 games (local-build mode of the capture
  tool).
- [ ] Move CPU kernels: `PostProcessPass.ts` kernels, `postprocess/EffectComposer.ts`,
  `postprocess/SSAOPass.ts`, and `cinematic/{BloomPass,VignettePass,FilmGrainPass,DepthHazePass}.ts`
  go to `packages/rendering/src/reference/`. Add a `"./reference"` export in
  `packages/rendering/package.json`. Leave `@deprecated` re-exports. Test:
  `pnpm check:bundle-size` shows the root no longer includes them. Assert with esbuild metafile
  that the inputs list excludes `reference/`.
- [ ] Delete the `contact-shadow` post pass from `RendererPostprocessPlan.ts:204-206` and the
  `Renderer.ts` dispatch. The engine emits a deprecation diagnostic if requested. Test: plan unit
  test.

Phase 4
- [ ] `ShaderLibraryCore.ts`: add the `AURA_VELOCITY` define to all forward variants (lit, unlit,
  instanced-unlit, skinned, morph). Vertex math per 6.10, fragment `layout(location=1) out vec2`.
  Test: `tests/unit/rendering/shader-variants-velocity.test.ts` compiles all variant keys through
  the shader-library key generator and asserts the define is present. Browser compile test on
  macos-14.
- [ ] `ForwardPass.ts`: bind `u_prevModelMatrix`, `u_prevViewProjection` and
  `u_unjitteredViewProjection` per item from `TemporalHistory`. `drawBuffers` per 9. Test: browser
  spec where a rigid cube moving +0.1 NDC/frame produces velocity readback 0.05 ±0.002 in the
  centre.
- [ ] Instancing: `SceneOptimization.ts` (`:207-217`) double-buffers instance transforms and
  exposes `previousInstanceTransforms`. `ForwardPass` binds `a_prevInstance0..3`. Test: browser
  spec on benchmark scene 16 asserting non-zero velocity on moved instances. This depends on the
  `node.size` instancing bug fix (22, `index.ts:14747`), owned by PRD 01.
- [ ] Skinning: the skinning system (PRD 06) exposes `previousJointTexture`. `ForwardPass` binds
  `u_prevJointTexture`. Test: browser spec on scene 15 asserting limb velocity magnitude > 0 while
  the root is static.
- [ ] Morph: `u_prevMorphWeights`. Test: a morph quad animated 0→1 gives non-zero velocity.
- [ ] `TemporalHistory.ts:57-94`: remove the re-draw (`:89-92`) and the unsupported-geometry throw
  (`:73-74`). Return matrices only. Test: `tests/unit/rendering/temporal-history-lifecycle.test.ts`
  is updated to assert no `ForwardPass` is constructed.
- [ ] `post/shaders/taa.glsl.ts` per 8.6, HDR at S5, plus `velocityDilate.glsl.ts`. The reactive
  `color2` R8 attachment is allocated in taa mode (9). Test: `tests/browser/post-taa.spec.ts` renders scene 24 for 32 frames:
  (a) static camera, a 1-px line's temporal luma stddev ≤ 0.01; (b) a moving skinned character's
  ghost trail ≤ 2 px (pixels behind the silhouette differing from background by > 4 LSB);
  (c) a camera cut via `cutCamera()` clears history (frame after cut equals a no-history frame
  within 2 LSB); (d) a translucent particle quad moving across a static background leaves a trail
  ≤ 2 px with the reactive mask on, and the test asserts that the trail is > 2 px with
  `color2` forced to 0 (so the mask is shown to do something).
- [ ] TAAU: `renderScale < 1` with taa outputs display resolution. Test: scene 20 at scale 0.67
  has edge error ≤ 1.3× full-res TAA.
- [ ] `post/shaders/motionBlur.glsl.ts` per 8.8. `effects.motionBlur` maps `intensity → shutter`.
  Test: browser spec where the blur length of a rigid bar at 60 vs 30 simulated fps differs ≤ 10%.
- [ ] `post/shaders/dof.glsl.ts` per 8.7. `effects.depthOfField` physical params plus legacy
  conversion. Test: browser spec on scene 23 (f 50 mm, N 2.8, focus 3 m, 1080 px,
  `maxBlur: 32` so the clamp is not hit). Focus plane pixels are within 2 LSB of the no-DOF
  render. A background point light at 30 m produces a bokeh disc whose diameter is 12.3 px (the
  8.7 worked example; the thin-lens formula gives the CoC *diameter*) ±15%.
- [ ] `app.cutCamera()` in `index.ts`, wired to `TemporalHistory.reset()`. Test: unit test.

Phase 5
- [ ] `packages/engine/src/agent-api/postPresets.ts`: the 7 presets of 6.8 as `AuraPostPreset`
  data. `output.preset` expands them in the bridge, and explicit effect nodes override preset
  values field by field. Test: `tests/unit/agent-api/post-presets.test.ts` asserts that expansion
  and the override order are deterministic.
- [ ] `packages/rendering/src/post/PostQualityTiers.ts` `resolvePostTier` per the 6.8 table.
  `renderer.quality` and `setQualityTier`. Profile → tier mapping with a deprecation diagnostic.
  Test: unit table test covering every tier × feature cell.
- [ ] `tools/quality-rebuild/codemods/post-v2.mjs` per section 10, plus
  `--dry-run` printing a diff and the emissive report. Test:
  `tests/unit/tools/post-v2-codemod.test.ts` runs fixtures copied from
  `apps/showcase-courier-rush/src/main.ts:295-297` (neonBloom with `softKnee`, colorGrade,
  antiAlias), `apps/showcase-deep-recovery/src/main.ts:270-285` (bloom tail, colorGrade, antiAlias,
  volumetricFog), and a bank-shot excerpt with both `ambientOcclusion` and `contactOcclusion`
  (merge rule, section 10). It also asserts that the file list contains exactly the 17 game
  showcases plus aura-clash, and that no non-game `apps/showcase-*` file is touched.
- [ ] Run the codemod on the 17 game showcase mains, `apps/aura-clash-showcase` and
  `examples/neon-corridor-strike`. Commit per game with before/after captures. Emissive changes are
  applied per the report and reviewed per game in PRD 14.
- [ ] Flip `RendererPostProcessOptions.pipeline` default to `"v2"`. Add
  `compat:{post:"3.0"}` handling. Test: unit test for both.
- [ ] `packages/aura3d-cli/skills/*`: hand the postfx facts list (section 10 item 5) to PRD 13.
  `templates/mini-game` gets `output:{preset:"neon-night"}` once PRD 13/15 move it off the inert
  lean renderer (05 §9.5).

Phase 6
- [ ] `post/shaders/smaa.glsl.ts` plus `post/smaa/` lazy chunk (`import()` of AreaTex/SearchTex
  binaries ported from three r185 `SMAAPass.js`, MIT notice kept). Test: browser spec on scene 20
  comparing the edge-error metric with three `SMAAPass`. Bundle check that the textures are absent
  from the root chunk.
- [ ] `post/shaders/exposure.glsl.ts` per 8.9 and `output.autoExposure`. Test: scene 21b, a
  dark→bright step. EV reaches within 0.1 of target in ≤ 1.5 s at speedUp 3. `readPixels` calls 0.
- [ ] `app.addPostPass` and `Renderer` custom pass insertion. Test: browser spec with a
  red-channel-invert pass at `after-tonemap` produces the expected readback. A pass at
  `before-tonemap` receives an RGBA16F input (values > 1 preserved).
- [ ] `apps/postprocessing-bloom/src/main.ts:100-104`: replace the threshold-0.08 Reinhard demo
  with an HDR emissive demo on `createAuraApp` using `neon-night`. Add
  `apps/postprocessing-custom`.

Phase 7
- [ ] A WGSL mirror for each `post/shaders/*.glsl.ts`. `WebGPUDevice.executePostGraph`. LUT bake
  via compute into `texture_storage_3d<rgba16float, write>`. Delete the 2-tap "FXAA"
  (`WebGPUPostShaders.ts:262-316`) and the soft-knee mirror without the cap (`:224`). Test: a
  WebGPU-vs-WebGL2 diff spec on scenes 18–25 in the WebGPU workflow.

Phase 8
- [ ] Delete the legacy chain: `WebGL2Device.ts` `presentLdrPostprocess` (`:871-1110`) and the
  shaders at `:2838-3633` that v2 replaced, `ensureBloomLutTextures`,
  `ensureOutlineBlendLutTexture` (if outline moved), `postprocess/NativeLdrEffectLuts.ts`,
  `Renderer.canFuseLdrPostprocess`/`ldrFusionPassRank`, the LeanWebGL2Device duplicates, and
  `compat.post`. Test: full unit and browser suites on remote CI. Bundle report.

---

## 15. Test requirements

### 15.1 Unit (vitest, `tests/unit/**`, run in `.github/workflows/test.yml` on ubuntu-latest; light enough to also run locally)

- `rendering/post-tone-operators.test.ts`: goldens per operator; monotonicity on [0, 64]; AgX
  output ∈ [0,1]; Neutral matches the three formula including the min-channel toe offset (for
  peak < 0.76 the output is `color − offset`, not `color`).
- `rendering/native-bloom-pyramid.test.ts`: mip sizes start at half resolution; normalization;
  no function named `*ResponseGain` exported.
- `rendering/post-graph-order.test.ts`: stage order and format invariants (no rgba8 before S10;
  depth stages require S1).
- `rendering/post-depth-range.test.ts`: real near/far plumbing; ortho path.
- `rendering/post-cube-lut.test.ts`: parser.
- `rendering/post-tiers.test.ts`: tier table; MSAA pixel guard; velocity-coverage fallback.
- `rendering/temporal-history-lifecycle.test.ts`: updated, no geometry re-draw.
- `rendering/shader-variants-velocity.test.ts`.
- `agent-api/post-bridge.test.ts`: every 7.1 field reaches the pipeline; unsupported throws;
  deprecated fields emit diagnostics.
- `agent-api/post-diagnostics.test.ts`: diagnostics equal executed values.
- `agent-api/post-presets.test.ts`.
- `tools/post-v2-codemod.test.ts`.

### 15.2 Browser (Playwright, remote only, per machine policy)

New workflow `.github/workflows/post-quality.yml`. It runs `runs-on: macos-14` with
`QRC_GPU_ARGS: "--use-angle=metal --enable-gpu --ignore-gpu-blocklist"`, the same as
`quality-rebuild-capture.yml`. Projects: chromium (ANGLE Metal), webkit and firefox. It triggers
on PRs touching `packages/rendering/src/post/**`, `WebGL2Device.ts`, `Renderer.ts`,
`ShaderLibrary*.ts`, `TemporalHistory.ts` or `agent-api/postBridge.ts`. No secrets. Artifacts
(PNG readbacks, JSON metrics) always upload. Specs in `tests/browser/`:
`post-tone-ramp`, `post-fxaa`, `post-banding`, `post-lut`, `post-bloom-energy`, `post-gtao`,
`post-godrays`, `post-no-readback`, `post-taa`, `post-motion-blur`, `post-dof`, `post-smaa`,
`post-auto-exposure`, `post-custom-pass`, `post-context-attributes`, `post-dpr`. Each spec builds a
minimal `createAuraApp` page under `tests/browser/fixtures/post/` and reads pixels through
`app.screenshot()` (capture mode). Pixel assertions use the thresholds stated in section 14. The
WebGPU mirrors run in the PRD 11 WebGPU workflow (Phase 7).

### 15.3 What is not a pass

Green unit/browser suites, non-blank screenshots, "routes 200" and parity matrices are
engineering gates only. A phase is not complete until section 16's vision and human review is
recorded.

## 16. Visual acceptance tests

### 16.1 Benchmark scenes (`benchmarks/quality-rebuild`, three@0.185.1 same-input reference)

Existing scenes used: 02 (pedestal edge AA), 03 (helmet emissive bloom), 06 (silhouette AA), 08
(skinned stripes, TAA), 09 (outdoor tone/haze), 13 (sphere AA), 15 (skinned TAA velocity), 16
(instancing velocity), 18 (game scene bloom/tone). New scenes, added in Phase 0 and coordinated
with PRD 12:

| Id | Content | Criterion |
|---|---|---|
| 19-hdr-bloom | Unlit emissive spheres (black base colour, emissive `#ffffff`, so linear luma = strength) at strength 0.5/1/2/4/8 at threshold 1.0, knee 0.25; one diffuse white wall lit so its rendered linear luma is ≤ 0.6. This scene is also the `mapThreeUnrealBloom` calibration scene. | Strength 0.5 and the wall: added luma ≤ 0.5% (both below the knee window [0.75, 1.25]). Strength 1 lies inside the knee and is not asserted. Strength 2/4/8: halo energy is proportional to the excess (strength − 1 = 1/3/7) within ±10%, which verifies the "no hidden gain" normalization (6.6). No three comparison on this scene, because it is the calibration input. |
| 20-thin-aa | Wires, rails, 1-px lane markers, text decal, rotating slowly; DSF 1 and 2 | Edge-crawl (temporal stddev on edge pixels over 16 frames) ≤ three × 1.2, comparing like with like (msaa vs three `antialias:true`, fxaa vs three `FXAAPass`, smaa vs `SMAAPass`, taa vs `TRAANode`). Text-decal interior SSIM vs a 16× supersampled reference: msaa/taa ≥ 0.98; fxaa/smaa ≥ three's same-mode SSIM − 0.01 (post-AA blurs high-contrast texture by design) |
| 21-tone-ramp | Grey and saturated (cyan #38d6ff, magenta #ff42c8) ramps 0..16 linear, per operator; 21b dark→bright cut | ΔE2000 mean ≤ 1.0 vs three per operator (ACES/AgX/Neutral); auto-exposure convergence |
| 22-ao-grounding | Furniture/clutter room, camera 6–10 m | Pixel: luminance within 10 cm of each contact ≥ 15% darker than AO-off; open floor ≥ 1 m from geometry changes ≤ 2%; emissive and sky pixels change ≤ 1 LSB (f_ind gating). Vision: contact darkening "equivalent or better" vs three `GTAOPass`; no halo on far side of silhouettes |
| 23-dof-bokeh | Hero at 3 m, background lights at 30 m | Pixel: focus-plane pixels within 2 LSB of no-DOF; bokeh diameter 12.3 px ±15% (Phase 4 checklist). Vision: no foreground bleed, bokeh shape ≥ three `BokehPass` |
| 24-taa-motion | Running skinned character + instanced crowd + camera pan | Ghost ≤ 2 px; vision ≥ three `TRAANode` |
| 25-night-fog-banding | `#030711` background, exp² fog, dim lights; 25b sun behind pillars | Banding metric (Phase 1 checklist: longest equal-value run ≤ 1.5× ideal, Sobel-contour pixels < 0.5%); 25b: mean added luma in the shaft mask between pillars ≥ 3% with god rays on vs off, ≤ 0.5% added in the occluded pillar mask, and 0 `readPixels` calls |

Judging: each scene is captured side by side and scored by the vision model using the 23 prompt
format, with post-specific criteria added. Threshold: **Aura score ≥ three score − 0.5** on every
post scene, and no post-attributable "major-aura3d-deficiency" row in the difference table. A
human reviewer signs each scene in `evidence/prd03/<phase>/signoff.md`. A vision pass without the
human sign-off is not acceptance.

### 16.2 Games (`tools/quality-rebuild-capture`, 18 games, DSF1 + DSF2 + mobile)

Every game gets a row. "Nodes" is the `effects.*` census from each game's main file (all 17
showcase mains also author `fog`, except mech-hangar). "Preset" is the codemod mapping (section
10); PRD 14 may override it per game. "Tier" is what `quality:"auto"` resolves to on the M1
reference, or the mapped tier when a `qualityProfile` is authored. Scores are tone / post / AA
from 21.

| Game | Nodes today | Profile → tier | Preset | Baseline T/P/AA | What this PRD changes for it | Main risk | Post-attributable acceptance |
|---|---|---|---|---|---|---|---|
| aura-clash | bloom, colorGrade, antiAlias (+ live `GameRenderPreset` rgba8 path) | default → auto | arena-fight | 3 / 2 / 4 | rgba8+Reinhard → rgba16f + operator; joins root HDR chain; grade exposure applied | contrast shift in the arena UI | tone ≥ 5; post ≥ 4; AA ≥ 6 at DSF2 |
| aurora-lander | bloom, colorGrade, fog, antiAlias | default → auto | space | 3.5 / 3 / 5 | Real bloom threshold removes the stray-dot bloom; AgX/ACES roll-off on the flame | flame dims until the emissive retune | flame core shows hue roll-off, not flat white; no isolated bloom blob < 4 px source; tone ≥ 5 |
| bank-shot | neonBloom, AO + contactOcclusion, colorGrade, fog, antiAlias | default → auto | neon-night | 4 / 2 / 5 | GTAO grounds balls on felt (the AO is a no-op today); rail "light leaks" stop blooming below threshold | felt over-darkened by AO | ball contact ≥ 15% darker than AO-off; mobile lamp hotspot ≤ 2% clipped px; post ≥ 4 |
| blockfall-reactor | neonBloom, AO + contactOcclusion, colorGrade, fog, antiAlias | default → auto | neon-night | 6 / 5 / 6 | Bloom threshold 0.55 → 1.0 with emissive retune; dither on dark background | the best tone score regresses | no regression: tone ≥ 6, post ≥ 5, AA ≥ 6 |
| courier-rush | neonBloom, colorGrade, fog, antiAlias | default → auto | neon-night | 2 / 2 / 5 | Bloom stops swallowing the van (thr 0.68 → 1.0, no ×7 gain); exposure 1.05 applied | lane markers lose glow until retune | van region ≤ 2% px at 255; tone ≥ 5, post ≥ 5 |
| deep-recovery | neonBloom, volumetricFog, colorGrade, fog, antiAlias | default → auto | underwater | 3 / 3 / 5 | CPU readback chain → GPU god rays; whole chain returns to GPU | residual slowness not caused by post | ≥ 20 fps at 1280×720 on runner; no bloom region > 3% of frame at > 250 luma; tone ≥ 5 |
| gallery-shift | neonBloom, colorGrade, fog, antiAlias | default → auto | neon-night | 4 / 4 / 5 | Signage/ring keep hue under AgX/ACES roll-off instead of flat white | darker mids after real bloom | signage ≤ 2% px at 255 with hue preserved; tone ≥ 5 |
| gravity-post | neonBloom, colorGrade, fog, antiAlias | default → auto | space | 3 / 1 / 4 | Sun becomes HDR emissive (codemod report) so bloom engages | needs PRD 04 emissive multiplier | sun shows bloom halo; post ≥ 4 |
| mech-hangar | bloom, contactOcclusion, colorGrade, antiAlias | production → high (TAA) | arena-fight | 5 / 4 / 5 | Strips retain hue; contact AO actually darkens; TAA default (skinned/instanced velocity needed) | TAA ghosting on mechs before PRD 06 velocity → falls back to msaa | strips not near-white (≤ 2% px at 255); velocityCoverage 100% or msaa fallback recorded; post ≥ 5 |
| neon-swarm | bloom, AO + contactOcclusion, colorGrade, fog, antiAlias | default → auto | neon-night | 4 / 4 / 5 | Crushed blacks lifted by dither + exposure; AO grounding | swarm particles ghost under TAA | blacks not crushed (≤ 30% px at 0); tone ≥ 5 |
| orbital-defense | bloom, fog (no antiAlias node) | default → auto | space | 2.5 / 0.5 / 4 | Bloom engages once the sun/planet emissive is retuned; tier AA | no FXAA today, so the AA change is MSAA-only | visible HDR bloom on sun; post ≥ 3; tone ≥ 4 |
| patrol-wing | neonBloom, colorGrade, fog, antiAlias | default → auto | daylight-outdoor | 4 / 3 / 5 | Ring blow-out removed (thr 0.84 → 1.0, no gain); AgX flattens less | lower contrast under AgX | ring ≤ 2% px at 255; tone ≥ 5 |
| pulse-tunnel | neonBloom, particles, colorGrade, fog, antiAlias | default → auto | neon-night | 4 / 2 / 5 | Neon finally blooms after emissive retune; motion blur available (opt-in) | particle ghosting on TAA tiers | visible selective bloom on arches; post ≥ 4 |
| rooftop-buckets | neonBloom, colorGrade, fog, antiAlias | production → high (TAA) | neon-night | 4 / 4 / 5 | Streaky mobile bloom smears removed (pyramid starts half-res, no gain); backboard roll-off | TAA ghosting on the ball arc | no streak artefacts on mobile; backboard ≤ 2% px at 255; post ≥ 5 |
| siege-golf | neonBloom, colorGrade, fog, antiAlias | default → auto | daylight-outdoor | 5 / 4 / 6 | Mobile softness fixed by DPR; AgX daylight | AA ≥ 6 already, must not regress | tone ≥ 5, AA ≥ 6; mobile backing = 2× CSS at DSF3 on High (cap 2) |
| skyline-runner | neonBloom, AO + contactOcclusion, colorGrade, fog, antiAlias; `pixelRatio: 0.7` | safe-basic → medium | neon-night | 4 / 4 / 5 | `pixelRatio: 0.7` removed; overdriven pickup haze removed | fill cost at native DPR | backing ≥ 1× CSS at DSF1, ≥ 1.5× at DSF2 (medium cap); pickups ≤ 2% px at 255; post ≥ 5 |
| turbo-drift-circuit | neonBloom, AO + contactOcclusion, particles, colorGrade, fog, antiAlias | default → auto | neon-night | 4 / 3.5 / 5 | Smeary lane-strip bloom and haze removed; motion blur available for speed feel | grey-washed mids are partly fog (PRD 07) | lane strips not smeared (halo ≤ 3× strip width); post ≥ 5 |
| vault-breakers | neonBloom, AO + contactOcclusion, colorGrade, fog, antiAlias | production → high (TAA) | neon-night | 4 / 1 / 5 | Neon blooms only after the emissive retune (correct bloom shows nothing today) | owner perceives "still no glow" before PRD 04 | after retune: visible selective bloom; post ≥ 4 |
| all 18 | — | — | — | AA 4–6 (mostly inferred) | Real AA policy, native DPR | — | AA ≥ 6 at DSF2 crops; no game regresses in any post-attributable category vs Phase 0 |

Visual categories are judged on the actual screenshots, not on code or pixel statistics (21 is
authoritative for visual categories; 20 is not). Each game's "competitive with modern three.js?"
verdict is owned by PRD 14. This PRD's acceptance is limited to the post-attributable categories
above.

## 17. Performance budgets

Reference: 1920×1080 render pixels. The "desktop" column is an Apple M1-class integrated GPU.
"Mobile" is an A15/Adreno 650-class device at the tier's resolution. The macos-14 runner is a
paravirtual GPU, so its absolute timings are used only as regression deltas (±10% vs the
committed baseline). A real-device run (PRD 11 lab) is required before High/Ultra sign-off. CPU ms
counts post encoding only (uniforms, binds, draws; no readback). Memory counts post-owned
targets at 1080p; scale linearly with pixel count.

| Tier | GPU post ms desktop | GPU post ms mobile | CPU post ms | Post memory @1080p | Bundle gz (post code in root path) | Notes |
|---|---|---|---|---|---|---|
| Low | ≤ 1.2 | ≤ 2.5 @ ≤1.3 Mpx | ≤ 0.2 | ≤ 45 MB (scene 16.6 + depth 8.3 + lin-depth 8.3 if used + bloom 2.8 + LDR 8.3) | ≤ 18 KB | FXAA, bloom 4 mips, LUT, dither |
| Medium | ≤ 2.5 | ≤ 4.5 | ≤ 0.3 | ≤ 140 MB (MSAA4 color 66 + MSAA depth 33 + resolves 25 + AO/bloom 8) | ≤ 24 KB (+GTAO) | MSAA guard ≤ 2.4 Mpx |
| High | ≤ 4.0 | ≤ 7.0 (30 fps target) | ≤ 0.5 | ≤ 95 MB (scene 16.6 + depth 8.3 + velocity 8.3 + reactive 2.1 + history 33.2 + lin-depth 12.4 + AO 1.5 + god rays 4.2 + bloom 5.5 = 92.1) | ≤ 32 KB (+TAA/DOF/MB) | TAA; scale 0.75 above 3.7 Mpx |
| Ultra | ≤ 6.0 | not offered | ≤ 0.7 | ≤ 105 MB (+SSR 4.2, full-res AO 2.1) | ≤ 34 KB | desktop discrete/M-series only |

Per-stage budgets (desktop, 1080p, re-measured in Phase 5): S1 0.1; S2 1.0 (half) / 1.8 (full);
S4 0.3; S5 0.4; S6 0.8; S7 0.5; S8 0.05; S9 0.5; S10 0.2 (+0.05 rebake); S11 FXAA 0.25 /
SMAA 0.7; S12 0.05. Lazy chunks (SMAA textures ≤ 45 KB, `.cube` parser 2 KB) are not counted in
the root path. The "Bundle gz" column is the post code on the critical path of the
cinematic-scene and mini-game starters, measured from the esbuild metafile. The gated
`tests/reports/bundle-size.json` targets are the binding limits: cinematic-scene starter
≤ 400,000 B gzip (398,503 today, 1,497 B headroom), mini-game ≤ 250,000 B (213,946 today),
product-viewer ≤ 250,000 B (207,889 today), lean core ≤ 80,000 B (77,458 today). Until the CPU
kernels leave the root path (Phase 3), v2 post code is deferred via `import()` (Phase 2 checklist).
After Phase 8, every gated target must be ≤ its Phase 0 baseline, and the informational engine
compatibility root (575,343 B gzip) must not grow. The overall frame budget is PRD 11's: post must not exceed 25% of
the tier frame budget (16.7 ms → 4.2 ms at High).

## 18. Browser coverage

- Chrome/Edge stable on macOS (ANGLE Metal): primary. Remote macos-14.
- Safari 17+ on macOS (WebKit, Metal): Playwright webkit on macos-14. Verify `TEXTURE_3D`
  RGBA16F linear filtering and R11G11B10F renderability. Fallbacks are RGBA16F bloom and the
  analytic grade define.
- Firefox stable on macOS: Playwright firefox on macos-14.
- Windows Chrome (ANGLE D3D11): `windows-latest` runners have no GPU (WARP), so only functional
  correctness is checked there and no timing is gathered. A real-GPU Windows run goes through PRD
  11/12 remote infrastructure.
- Required: WebGL2 + `EXT_color_buffer_float`. Optional: `EXT_disjoint_timer_query_webgl2` for
  timings. Without float color buffers, the forward-tonemap fallback uses the same operator
  (6.2), tested by a spec that disables the extension via an init hook.
- WebGPU (Chrome 113+, Safari 26 where available): Phase 7 only.

## 19. Mobile coverage

- Emulated: Playwright webkit and chromium at 390×844 DSF 3 on macos-14. This checks layout,
  DPR and tier selection only.
- Real devices (required before Phase 5 exit for the Low/Medium/High mobile budgets): iPhone
  (A15+) Safari, a mid Android (Adreno 6xx) Chrome, and a Mali-G7x Chrome, through PRD 11/12 device
  infrastructure (AWS Device Farm or equivalent, provisioned per the machine policy). No mobile
  device has ever been tested (18). Until this runs, mobile budgets are targets, not claims.
- Mobile defaults: tier `auto` caps at High. Ultra is never offered. DPR cap 2. MSAA guard
  applies, and at 1170×2532 (DPR 3) MSAA is blocked. Motion blur is off on Low/Medium. GTAO is
  half-res only.
- Thermal: a 5-minute sustained run on a real device must not drop more than 20% fps with the
  tier fixed. If it does, PRD 11's governor lowers `renderScale` first, then the tier.

## 20. Screenshots and evidence required

Committed under `docs/project/aura3d-quality-rebuild/evidence/prd03/<phase>/`:
1. Side-by-side Aura vs three for scenes 02, 03, 06, 08, 09, 13, 15, 16, 18–25 (`*-side-by-side.jpg`)
   plus `report.json` with metrics.
2. 18-game contact sheets at DSF1, DSF2 and mobile DSF3, before and after
   (`<id>-contact.jpg`, `<id>-mid.jpg`, `report.slim.json` with fps and backing size).
3. Pass filmstrips per game for the post stages it uses: off/on for bloom, AO, AA, grade.
4. 4× nearest-neighbour zoom crops of thin geometry (scene 20, plus courier lane markers, vault
   rails) at DSF 1 and 2, for each AA mode.
5. 16-frame temporal strips for TAA scenes (24) and one moving game (turbo-drift).
6. Exposure sweep strip (−2..+2 EV) and operator strip (ACES/AgX/Neutral) on scene 21 and on
   courier-rush.
7. Diagnostics JSON per game: `post.stages`, `post.skipped`, `exposure.applied`,
   `velocityCoverage`, `gpuMs`.
8. Vision judgments in the 21/23 format and human `signoff.md` per phase.
9. Bundle report diff (`tests/reports/bundle-size.json`).

## 21. Completion criteria

All of the following hold:
1. Phases 0–6 have met their exit criteria. Phase 7 has met its exit criteria, or WebGPU root is
   still disabled by PRD 11 and v2 refuses WebGPU with a clear error. Phase 8 is complete, or
   scheduled within one minor release with `compat` documented.
2. Zero silent drops: every `effects.*` post field either reaches a uniform or throws (bridge unit
   test passes on the full field list).
3. Zero per-frame CPU readback in interactive mode in all 18 games (post-no-readback spec).
4. No 8-bit or display-referred target exists before tone mapping (graph-order test).
5. No AA stacking: the plan never contains MSAA > 1 together with FXAA/SMAA (tier test).
6. Diagnostics report only executed values: no exposure preset or tone label without a matching
   uniform.
7. Benchmark post scenes meet 16.1 thresholds with human sign-off.
8. Games meet 16.2 post-attributable thresholds with human sign-off, and no game regresses in any
   post-attributable vision category versus Phase 0 baseline.
9. Performance budgets in section 17 are met on the reference runner (deltas) and on at least one
   real desktop and one real mobile device for the tiers offered there.
10. Skills/templates (PRD 13) no longer contain `softKnee`, `antiAlias({mode:"fxaa"})` or bloom
    thresholds < 1 (`rg` over `packages/aura3d-cli/skills`, `templates`, `apps`).

This PRD's completion does not mean the games are competitive. It means post no longer caps them.

## 22. Rollback considerations

- `pipeline:"legacy"` (renderer) and `compat:{post:"3.0"}` (app) restore the old chain without a
  redeploy of engine code until Phase 8. Keep both until Phase 5 has shipped for one minor release
  with no P0 regressions.
- Per-feature kill switches via options: `antiAlias:"msaa"` (disables TAA), `ambientOcclusion`
  removal, `output.dither:false`, `output.toneMapping:"aces"`, `bloom:false`. A tier downgrade
  through `setQualityTier("low")` is the universal fallback.
- Each game's codemod commit is separate, so one game can be reverted without touching others.
- Phase 1 changes to the legacy chain (FXAA, exposure, dither, depth range, AgX/Neutral) are
  isolated commits. Reverting a single commit restores the prior shader.
- Phase 8 deletion is the point of no return. It is gated on two releases without legacy use in
  the 18 games and templates (`rg "compat:\s*{\s*post"`).

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Games look *darker / less glowy* after correct bloom because emissives are < 1.0 (6.6) | high | owner perceives regression | codemod emissive report; PRD 04 emissive strength; presets document ranges; A/B captures before flip |
| ANGLE Metal / Safari lacks R11G11B10F renderable or RGBA16F 3D-texture filtering | medium | bloom or LUT path fails | capability probe at init; RGBA16F fallback; analytic grade define |
| `f_ind` alpha corrupted by transparent blending or custom shaders | medium | AO on emissive/sky | `blendFuncSeparate`; custom shaders default `a=0` (no AO); debug view |
| TAA ghosting on particles/UI-in-world | medium | smeared VFX in pulse-tunnel, turbo-drift, neon-swarm | `color2` reactive mask (approximate under shared blend state, 6.5); TAA spec case (d); msaa fallback per scene |
| `preserveDrawingBuffer:false` breaks a caller that reads the canvas outside a frame | medium | blank screenshots in tools/tests | sync `screenshot()` re-renders first (6.2); `capture:true`; `rg` audit task in Phase 1 |
| Bundle headroom: cinematic-scene starter has 1,497 B left under 400,000 B | high | `check:bundle-size` fails in Phase 2 | v2 behind `import()` until Phase 3 removes CPU kernels; per-phase bundle gate |
| FXAA parity target is three's Catlike variant, not NVIDIA 3.11 | low | reviewers expect 3.11 quality | documented in 6.5; SMAA/TAA are the quality modes; 3.11 Quality-12 is a possible follow-up variant |
| Velocity for skinned depends on PRD 06 timeline | medium | TAA unavailable in character games | tier falls back to msaa on velocity coverage < 100% |
| MRT + MSAA cost on mobile tilers | medium | frame time | velocity MRT only in taa mode (sampleCount 1); msaa mode never writes velocity |
| Timer queries unavailable on ANGLE Metal | high | no per-stage GPU ms in CI | A/B frame-time deltas with stage toggles; real-device lab |
| Paravirtual runner timings misleading | high | wrong budget conclusions | use deltas only; real-device sign-off required |
| Bundle growth from new shaders | medium | root over budget | CPU kernels leave root; lazy SMAA; per-phase bundle diff gate |
| WebGL2/WebGPU drift | medium | two looks | single TS reference; diff spec ≤ 2 LSB |
| Lean device keeps old shaders | medium | templates look different | PRD 15 deletion or shared shader import; rg gate |
| Vision judge variance | medium | flaky acceptance | fixed prompt, 2 judge runs, human sign-off decides |
| Deep Recovery's slowness is not only post | medium | fps target missed | Phase 3 exit measures with god rays on vs off; residual attributed to PRD 07/11 with evidence |

## 24. Explicitly out of scope

- Froxel/raymarched volumetric fog and fog defaults (PRD 07). This PRD only replaces the CPU
  screen-space radial blur with a GPU one.
- Shadow quality and screen-space contact shadows (PRD 02). This PRD deletes the contact-shadow
  post pass.
- SSR algorithm quality: roughness cones, temporal resolve, hierarchical-Z (PRD 02). This PRD
  fixes only its placement (HDR, pre-TAA) and its depth range.
- Emissive units and `KHR_materials_emissive_strength` (PRD 04).
- DPR detection heuristics, the dynamic-resolution governor and device-tier detection (PRD 11).
  This PRD provides the upsample/AA stages and tier contents. It lands the minimal DPR fix only
  if PRD 01 has not.
- HDR display output (`display-p3`, `rgba16float` canvas, `toneMapping: "extended"`). It is
  tracked separately once v2 lands.
- Selection-based outline. The current full-frame Sobel (`WebGL2Device.ts:3004-3091`) stays
  unchanged in the after-tonemap stage until a follow-up PRD. It is not part of the default look.
- Depth-normal prepass with in-shader specular occlusion (Ultra AO alternative, 6.3), lens
  flares, SSGI, letterboxing, and screen-space subsurface scattering.
- Per-game art direction and final competitiveness sign-off (PRD 14).
