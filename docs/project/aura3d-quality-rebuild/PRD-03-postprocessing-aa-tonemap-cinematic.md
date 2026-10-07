# PRD 03: Postprocessing, Anti-Aliasing, Tone Mapping, Cinematic Pipeline

Status: draft for implementation, parallelized against `CONTRACTS.md` (lane `prd03`, flag `A3D_QR_POST`).
Branch of record: `aura3d-quality-rebuild/audit`. Code references were checked at `7992a0dd`.
Evidence base: research reports 02, 05, 06, 18, 19, 20, 21, 22, 23 in
`docs/project/aura3d-quality-rebuild/research/`. Captures come from GH Actions run 37289688772
(macos-14, ANGLE Metal, Apple Paravirtual GPU).

**Parallel-execution rule for this PRD.** This lane starts on day 0 (2026-10-05) after PR 0a only.
It never waits for another lane. It provides C-13 (PostPass registry, post pipeline, presets) and
C-14 (velocity, temporal history). It consumes C-01, C-02, C-04, C-05, C-08, C-18, C-22, C-23,
C-27, C-28, C-29, C-30, C-31, C-33, C-36, C-38, C-39 and C-40 through their PR 0 stubs (§12). It
writes only the paths CONTRACTS §4.1 assigns to lane 03 (§"Parallel execution"). Anything in a
file owned by another lane is either reached through that file's seam or filed as a non-blocking
request (§12.3). Where this document names another PRD below, it is naming the owner of a
contract or a file, not a prerequisite. Acceptance is split into standalone acceptance, which
gates merges and needs only stubs, and integrated acceptance, which is evaluated at CONTRACTS §7
checkpoints and never blocks.

Conflict resolutions from CONTRACTS §0 that changed this PRD:
- **R1.** `AuraQualityTier` and the tier table come from C-27 (PRD 11). This PRD maps C-27 settings
  to post stages. It does not define tiers.
- **R2.** There is exactly one tone map, in PRD 01's `OutputPass` (C-05). This PRD owns everything
  upstream of it (post graph, auto-exposure, presets) and the display-referred stages after it.
  `post/ToneOperators.ts` is a CPU reference for tests only. The AgX/Neutral GLSL ports, the
  operator enum, dithering inside OutputPass and `app.setOutput` are PRD 01's.
- **R20/R21.** Templates, skills and game routes are not edited here. This lane ships the
  `post-v2` codemod (C-39), facts (C-40) and reports. PRD 13 and PRD 14 apply them.
- **§3.8.** The benchmark scene numbering "19-25" is withdrawn. Scenes are `prd03-<slug>` (C-30).

This PRD covers everything between "the forward pass wrote an HDR pixel" and "the browser
composited the canvas": pass ordering and formats, AO, SSR placement, TAA/upscaling, bloom, DOF,
motion blur, exposure, tone mapping, grading/LUT, vignette/grain/CA, dithering, output encode,
post-AA, the CPU-readback fallbacks, cinematic presets, and how all of this maps onto quality tiers.

Read this first. Post work is necessary but it will not make the games competitive by itself. The
vision judge says so directly for several games: "Post-processing and camera tweaks alone won't lift
this above about 4" (21, turbo-drift verdict). In the same-scene benchmark, most of the Aura-vs-three
gap comes from shadows and IBL (C-09/C-11, lane 02), not post (23). This PRD is done when the post
chain stops *subtracting* quality (blur-AA, mid-tone bloom haze, dropped exposure, zero-output AO,
8-bit banding, CPU readback stalls) and can *add* the modern HDR look that well-built three.js
work ships. The shipped-app gate is lane 14's (C-35). It is evaluated at checkpoints, not here.

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
- `@aura3d/lean` (`packages/lean`) and `LeanWebGL2Device.ts` (owner 15): must stop carrying its own
  bloom/FXAA/SSAO/tone shaders. This lane publishes the shader strings from its own
  `post/shaders/*.glsl.ts`; the import or deletion is request Q-15-3.
- `apps/showcase-*` and `apps/aura-clash-showcase` (owner 14): reached only through the `post-v2`
  codemod (C-39) and reports. Lane 14 runs them (R21).
- `benchmarks/quality-rebuild`: lane 03 scenes in `scenes/prd03/`, `aura3d/scenes/prd03/` and
  `three/scenes/prd03/` (C-30). Shared files stay lane 12's.
- `tools/quality-rebuild-capture`, `.github/workflows/quality-rebuild-capture.yml` (owner 12): used
  through `--flags`/`qr_flags` (C-33). The DSF-2 viewport is request Q-12-1.
- `packages/aura3d-cli/skills/*` (owner 13): facts F-03-* in CONTRACTS Appendix B (C-40).

## 5. Affected files and directories

New:
- `packages/rendering/src/post/` (new directory)
  - `PostGraph.ts`: stage list, resource allocation, format policy, insertion points.
  - `PostResources.ts`: pooled render targets keyed by (w, h, format, samples).
  - `PostQualityTiers.ts`: C-27 `AuraQualityTierSettings` → `PostPipelineOptions` mapping.
  - `PostAntiAlias.ts`: AA mode resolution, MSAA pixel guard, velocity-coverage fallback. Its output
    is the existing `RendererPostProcessOptions.sampleCount` (`Renderer.ts:611`), so the forward
    target code (lane 01) needs no edit.
  - `LegacyOutputAdapter.ts`: the C-05 `OutputPassLike` stand-in used while C-05 is a stub. It
    drives the existing present program (lane 01's `ensureLdrPostprocessProgram`) through the
    `webgl2/LegacyPost.ts` carve with grade, bloom and FXAA disabled, so one tone map runs (R2).
  - `chunks/velocity.glsl.ts`, `chunks/indirectFraction.glsl.ts`: C-02 chunks registered as
    features `prd03.velocity` and `prd03.indirectFraction`. They have no pixel effect until C-02
    `generateProgram` is real.
  - `shaders/common.glsl.ts`: fullscreen VS, `linearizeDepth`, `reconstructViewPos`,
    `octDecode`, luma, YCoCg, Karis weight, `srgbOetf`, `triangularDither`.
  - `shaders/gtao.glsl.ts`, `shaders/gtaoDenoise.glsl.ts`, `shaders/depthDownsample.glsl.ts`.
  - `shaders/taa.glsl.ts` (TAA + TAAU), `shaders/velocityDilate.glsl.ts`.
  - `shaders/bloom.glsl.ts` (prefilter, 13-tap downsample, 9-tap tent upsample).
  - `shaders/dof.glsl.ts` (CoC, half-res prefilter, gather, composite).
  - `shaders/motionBlur.glsl.ts` (tile max, neighbor max, reconstruction).
  - `shaders/exposure.glsl.ts` (log-luminance reduction, adaptation).
  - `shaders/composite.glsl.ts` (linear HDR: exposure, bloom, CA, linear grade; feeds OutputPass),
    `shaders/lutBake.glsl.ts` + `shaders/displayGrade.glsl.ts` (display-referred 3D LUT applied
    after OutputPass, see 6.7).
  - `shaders/fxaa.glsl.ts` (port of three r185 `FXAAShader.js`, see 6.5), `shaders/smaa.glsl.ts`,
    `shaders/finalize.glsl.ts` (grain + dither + write).
  - `shaders/godrays.glsl.ts` (GPU volumetric light shafts).
  - `shaders/*.wgsl.ts`: WGSL equivalents (Phase 7).
  - `ToneOperators.ts`: TS reference implementations of ACES/AgX/Neutral/Reinhard, used by
    tests, by the C-05 conformance suite (CONTRACTS C-05 "Conformance") and as golden source for
    lane 01's GLSL. Never on the GPU path (R2).
  - `CubeLut.ts`: `.cube` parser → `Float32Array` 3D LUT.
  - `smaa/`: lazy-loaded AreaTex/SearchTex binaries plus loader.
- `packages/engine/src/agent-api/postPresets.ts`: cinematic presets. The C-13 contract file
  re-exports `postPresets` from here once it exists (C-13 stub paragraph).
- `packages/engine/src/agent-api/postBridge.ts`: `createRootPostPipeline`, `POST_EFFECT_FIELDS`,
  the C-38 `post` app extension (`addPostPass`, `setQualityTier`, `cutCamera`).
- `packages/engine/src/agent-api/compiler/diagnosticOnly.prd03.ts`, `src/lanes/prd03.ts` in
  `packages/{rendering,engine}`: lane barrel with `postSlot.provide`, `velocitySlot.provide`,
  `registerAppExtension`, `registerDiagnosticsSection("post" | "exposure")`.
- `packages/aura3d-cli/src/commands/prd03/index.ts`: registers the `post-v2` codemod (C-39).
- `tools/quality-rebuild/codemods/post-v2.mjs`: codemod implementation (pure, C-39 `AuraCodemod`).
- `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd03/`: lane scenes and
  `aura3d/scenes/prd03/bloomMapping.ts` (`mapThreeUnrealBloom`).
- `tests/qr/prd03/**`, `tests/unit/contracts/impl/prd03-*.test.ts`, `tests/unit/rendering/post-*.test.ts`,
  `tests/browser/post-*.spec.ts` (new files belong to the creating lane, CONTRACTS §4.1 "creator").
- `.github/workflows/post-quality.yml` and `.github/workflows/qr-prd03-captures.yml`: macos-14
  remote jobs.
- `apps/postprocessing-custom/` (new; `apps/postprocessing-*` is lane 03's).

Modified, in files lane 03 owns (CONTRACTS §4.1):
- `packages/rendering/src/renderer/PostprocessExecution.ts`: PR 0b-2 verbatim carve of
  `Renderer.ts:977-1330` (`executePostprocess`, fused path `:993`, fallback loop `:994-1067`, pixel
  passes `:1245-1280`). The v2 branch, the depth-range plumbing and the readback block land here.
- `packages/rendering/src/webgl2/LegacyPost.ts`: PR 0b-2 carve of `WebGL2Device.ts:871-1110` and
  `:2838-3409` (`presentLdrPostprocess`, bloom/outline LUTs, legacy SSAO/SSR/DOF/MB/TAA programs).
  Its orchestration is where the Phase 1 FXAA split happens.
- `packages/rendering/src/RendererPostprocessPlan.ts`: pass catalog and order.
- `packages/rendering/src/TemporalHistory.ts`: no geometry re-draw under `A3D_QR_POST`.
- `packages/rendering/src/forward/Velocity.ts`: the `bindVelocityUniforms` seam that `ForwardPass`
  calls per draw (PR 0b-2, no-op stub).
- `packages/rendering/src/postprocess/NativeBloomPyramid.ts`: planner kept, gains deleted under the
  flag. `postprocess/NativeLdrEffectLuts.ts` is deleted at flag removal (§5.4).
- `packages/rendering/src/PostProcessPass.ts`, `postprocess/EffectComposer.ts`,
  `postprocess/SSAOPass.ts`, `cinematic/{BloomPass,VignettePass,FilmGrainPass,DepthHazePass}.ts`:
  CPU kernels move to `packages/rendering/src/reference/` (`@aura3d/rendering/reference`, subpath
  reserved by PR 0a).
- `packages/rendering/src/webgpu/WebGPUPostShaders.ts`: WGSL post shaders.
- `packages/engine/src/agent-api/compiler/postprocess.ts`: PR 0b-1 carve of
  `createProductionRuntimePostprocess` (`index.ts:12797-12941`, with its helper
  `resolveNativeBloomRadius` `:12791-12795` moved under the §3.1 helper rule). Exposure,
  depth range, AA mode, god rays and the v2 switch land here.
- `packages/engine/src/agent-api/nodes/effects.post.ts`: PR 0b-1 carve of the post factories
  (`bloom` `index.ts:3450`, `neonBloom` `:3482`, `ambientOcclusion` `:3518`, `contactOcclusion`
  `:3528`, `colorGrade` `:3543`, `antiAlias` `:3561-3568`) plus the new keys `vignette`,
  `filmGrain`, `chromaticAberration`. Factories cannot see flags (they run before `createAuraApp`),
  so their defaults stay byte-identical. Each lane 03 factory adds only the inert field
  `postAuthored: readonly string[]` (the keys the caller actually passed), which the legacy bridge
  ignores and the v2 bridge uses to tell authored values from factory defaults.
  `cinematicBloom` `:3470`, `volumetricFog` `:3499`, `outline` `:3573`,
  `screenSpaceReflections` `:3587`, `depthOfField` `:3599` and `motionBlur` `:3613` fall under
  "everything else" in the §3.2 carve and land in lane 07's `nodes/effects.ts`. `depthOfField`
  drops every option except `focus/aperture/maxBlur/intensity`, so the physical DOF fields cannot
  reach the bridge until request Q-07-2 lands (ownership conflict, see §12.3).

Reached only through a seam or a request (owned by another lane, never edited here):
- `Renderer.ts` forward target (`:595-618`, `:928-944`) and `canFuseLdrPostprocess`/
  `ldrFusionPassRank` (`:2111-2137`), owner 01: the AA sample count goes through the existing
  `postprocess.sampleCount` field; velocity attachments through C-14 and
  `RenderTargetDescriptor.colorAttachments` (Q-01-2); deletion of the fusion helpers is Q-01-5.
- `WebGL2Device.ts` present shader `:3440-3640` (operators, FXAA blur at `:3611-3631`, grade), owner 01:
  C-05 real replaces it. Phase 1 bypasses its FXAA branch by setting `u_hasFxaa = 0` from
  `LegacyPost.ts` and running this lane's FXAA program afterwards.
- `ForwardPass.ts`, `ShaderLibrary.ts`, `ShaderLibraryCore.ts`, `SceneOptimization.ts`, owner 01:
  velocity and indirect fraction arrive as C-02 features; the no-post Narkowicz curve
  (`ShaderLibraryCore.ts:588-593`) is C-05 real; instance history is Q-01-3.
- `VolumetricFog.ts`, owner 07: the CPU kernel stays until lane 07 removes it (Q-07-1). The bridge
  maps `effects.volumetricFog` straight to S4 under the flag, so the CPU path no longer runs.
- `WebGPUDevice.ts`, owner 11: `executePostGraph` WGSL twin (Q-11-2, C-13 "PRD 11 adds the WGSL twin").
- `GameRenderPreset.ts:372-386`, `:448-452`, owner 11: Q-11-1.
- `agent-api/index.ts` remainder, owner 15: the types section is frozen (fields pre-declared in
  PR 0a); the `createRendererDiagnosticReport` warning `:4547`, overlay `:18657`, clear-color
  inversion `:15400-15418`, canvas creation `:13586-13597` (inside `compiler/renderer.ts`) and
  product-viewer post (`production-runtime/index.ts:1454-1641`) are Q-15-1 and Q-15-2.
- `agent-api/app/rendererOptions.ts` (profiles `index.ts:4225-4327`), owner 11: Q-11-1.
- `agent-api/app/colorManagement.ts` (`sceneExposurePresets` `index.ts:4192-4214`), owner 01: Q-01-4.
- `benchmarks/quality-rebuild/shared/scenes.ts`, `aura3d/common.ts:131-135`, `:254-256`, owner 12: Q-12-2.
- `apps/showcase-*/src/main.ts` for the 17 game showcases (aurora-lander, bank-shot,
  blockfall-reactor, courier-rush, deep-recovery, gallery-shift, gravity-post, mech-hangar,
  neon-swarm, orbital-defense, patrol-wing, pulse-tunnel, rooftop-buckets, siege-golf,
  skyline-runner, turbo-drift-circuit, vault-breakers) and
  `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:898,1422`, owner 14: codemod plus
  request Q-14-1. The glob `apps/showcase-*` also matches 10 non-game apps (asset-audition,
  cinematic-architecture, data-galaxy, digital-twin-ops, index, material-asset-inspector,
  meshy-relic-pilot, product-configurator, smart-city-control, webgpu-particle-lab). The codemod
  does not touch them.
- `templates/**`, `examples/**`, `packages/create-aura3d/**`, skills, owner 13: Q-13-1 and C-40.

---

## 6. Architecture proposal

### 6.1 The HDR post graph

Post becomes a declarative stage list executed by `PostGraph` on the device. It is not a free-form
node graph. Stage order is fixed where physics requires it, and user passes enter at four named
insertion points. Every stage declares its inputs, outputs, formats and resolution, so a pass
cannot silently degrade the format of a later pass. Nothing between the forward pass and the
composite runs in 8-bit or display space.

```
Forward pass (scene-linear HDR; lane 01's ForwardPass, today's RGBA16F post target)
  color0  RGBA16F   rgb = scene radiance, a = indirect fraction f_ind (C-02 feature
                    prd03.indirectFraction; until real, AO uses the fallback in 6.3)
  color1  RG16F     per-object velocity (C-14 MRT; until real, S1 derives camera velocity)
  color2  R8        reactive mask (C-14 `writesReactive`; until real, absent and TAA uses
                    the luminance-delta heuristic in 6.5)
  depth   DEPTH24   (sampleable texture; MSAA renderbuffer + blit-resolve on MSAA tiers)
  MSAA 4x on "msaa" AA mode; 1x + sub-pixel jitter on "taa" mode (sampleCount set by
  post/PostAntiAlias.ts through the existing postprocess.sampleCount field)
    │
[S0] Resolve (MSAA tiers): blitFramebuffer color+depth                       (existing path)
[S1] Depth prep: linearize with REAL camera near/far/projection → R32F full res
     + half-res min/max (RG32F) for GTAO/DOF/SSR/god rays
     + camera-reprojection velocity RG16F (from depth and C-14 prev/unjittered matrices)
       when the C-14 MRT is absent
    ── insertion point "after-depth" (custom HDR passes reading depth)
[S2] GTAO (half res, R8) → bilateral denoise (2 passes, depth-aware) → upsample (joint bilateral)
     → applied to HDR: rgb *= mix(1, multiBounce(ao, albedoProxy), f_ind)
[S3] SSR (half res, HDR) — placement owned here (C-13 `before-taa` registration by lane 02);
     algorithm quality is lane 02's
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
[S10] Composite (one pass, linear HDR): exposure → + bloom·intensity·tint → chromatic aberration
      (scene taps) → linear grade (white balance, lift/gamma/gain, shadows/midtones/highlights,
      analytic ALU) → RGBA16F
    ── insertion point "before-tonemap" (linear HDR, exposure applied; C-13 registrations from
       lanes 07/08/10 land here, e.g. underwater tint, screen-feel uniforms)
[OUT] C-05 OutputPass (lane 01): the single tone map + single sRGB encode, exposure already
      applied upstream so OutputPass receives exposure 1; `dithering:false` when S10b/S11/S12
      follow; background coverage = S1 far-depth mask. Stub: post/LegacyOutputAdapter.ts
    ── insertion point "after-tonemap" (display-referred LDR)
[S10b] Display grade: contrast/saturation/vibrance + user .cube through one 33³ 3D LUT, vignette
      (fused into S11 or S12 when either runs)
[S11] Post-AA (only when AA mode is "fxaa"/"smaa"): FXAA (three r185 port) or SMAA 1x (3 passes)
[S12] Finalize: film grain → triangular-PDF dither (±1 LSB of 8-bit) → default framebuffer
      (S10b, S11 and S12 fuse into one pass when post-AA is FXAA)
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
| Native DPR (C-27 `maxPixelRatio`, implemented by lane 01; consumed here for the AA policy) | Removes the 1/4-pixel softening on HiDPI; biggest single AA win | ×(DPR²) on *every* pass incl. forward: DSF 2 is 4× pixels | ~0 | ×DPR² on all targets (MSAA guard, 6.2) | 0.3 KB | capped at 2 on mobile (section 19) | tier DPR cap; `renderScale` |
| Velocity MRT (forward, C-14 real; needs C-02 real) | Per-object velocity for TAA/MB on all geometry classes | +0.2–0.4 ms forward (extra RT write, extra VS math) | +0.05 ms (prev matrices upload) | RG16F 8.3 MB + R8 reactive 2.1 MB | 2 KB (chunk) | Ultra only (C-27) | S1 camera-reprojection velocity (static geometry) or msaa |
| S1 camera velocity (standalone) | TAA on static geometry without any forward change | +0.05 ms (fused into S1) | ~0 | RG16F 8.3 MB (same slot as MRT velocity) | 0.5 KB | same | msaa when moving items lack C-14 data |
| S1 depth prep | Correct depth math for every depth effect (fixes 0.1/1000 mismatch) | 0.1 ms | ~0 | R32F 8.3 MB + half RG32F 4.1 MB | 1 KB | same | none needed; always on when any depth stage runs |
| S2 GTAO | Contact grounding; 7 games currently get ~0 AO | 0.8–1.2 ms half-res | <0.05 ms | 0.5 MB AO + 1 MB denoise | 5 KB | half-res mandatory, 4 directions × 2 steps | off on Low (C-27 `ambientOcclusion: off`) |
| S3 SSR (placement only) | Reflections computed in HDR, before TAA | 0.8–1.5 ms half-res (algorithm cost is lane 02's) | <0.05 ms | RGBA16F half 4.2 MB | 0 (existing shader moved) | off | off (C-27 `ssr: off` on Low/Medium) |
| S4 God rays | Replaces the 0.5 fps CPU volumetric path in Deep Recovery | 0.2–0.4 ms half-res, 32–64 samples | <0.05 ms (light projection) | RGBA16F half 4.2 MB | 1.5 KB | Medium+ 32 samples | off |
| S5 TAA/TAAU | Stable sub-pixel edges, specular stability, enables render scale < 1 | 0.4 ms | 0.1 ms (matrices) | history 2×16.6 MB + velocity 8.3 MB | 6 KB (+velocity VS) | not on mobile (C-27: `postAntiAlias:"taa"` only on Ultra; CCR-03-4 proposes High) | MSAA 4x |
| S6 DOF | Cinematic focus; HDR bokeh highlights | 0.6–0.9 ms half-res | ~0 | 4–6 MB | 4 KB | High only, 0.5 scale | off |
| S7 Motion blur | Speed feel in racers/runners | 0.4–0.6 ms | ~0 | tiles 0.1 MB | 3 KB | off on mobile Low/Medium | off |
| S8 Auto-exposure | Usable exposure across dark/bright scenes | 0.05 ms | 0 | <0.1 MB | 1.5 KB | yes | manual exposure |
| S9 Bloom | Real HDR glow only on HDR highlights; no mid-tone haze | 0.3–0.6 ms | <0.05 ms | 2.8–5.5 MB | 3 KB | C-27 `bloomMipLevels` 3 (Low) / 5 (Medium), half-res start | 3-mip half-res |
| S10 Composite (linear) + OutputPass + S10b display LUT | Selectable operator, exposure, grade, LUT, vignette; one tone map (R2) | 0.2–0.3 ms (+0.05 ms rebake on change); one more full-screen write than a fused uber-pass | <0.05 ms | 33³ RGBA8 LUT 0.14 MB + RGBA16F composite 16.6 MB (pooled) | 6 KB (+2 KB lazy .cube) | yes | analytic display grade (`AURA_ANALYTIC_GRADE`) |
| S10 CA + vignette | Lens character for presets; CA replaces a CPU readback pass | CA +0.05 ms (2 extra taps), vignette ~0 | 0 | 0 | 0.5 KB | vignette all tiers; CA Medium+ | off |
| S11 FXAA (three r185 port) | Edge AA without blurring low-contrast interiors | 0.25 ms | ~0 | RGBA8 8.3 MB | 2.5 KB | Low tier default | none |
| S11 SMAA 1x | Better edges than FXAA, no temporal artifacts | 0.6–0.8 ms | ~0 | edges RG8 4.1 MB + weights RGBA8 8.3 MB + 0.2 MB LUTs | 7 KB code + ≤45 KB lazy textures | Medium mobile option | FXAA |
| S12 Dither + grain | Removes 8-bit banding on dark fog gradients | <0.05 ms | 0 | 0 | 0.5 KB | yes | none |
| S12 RCAS sharpen | Restores TAA/upscale softness | 0.05–0.1 ms | 0 | 0 | 1 KB | yes | off |
| S0/S1 canvas `antialias:false`, `preserveDrawingBuffer:false` (request Q-15-1; C-05 `capture()` replaces readers) | None visible; removes a redundant default-framebuffer MSAA resolve and the swap-chain copy | −0.1 to −0.5 ms (saved) | 0 | −8 to −33 MB (saved) | 0 | yes | C-05 `app.capture()` |

### 6.2 Formats and resolution policy

- Scene color is RGBA16F whenever post is active. That is already the case today
  (`defaultPostprocessTargetFormat`, `Renderer.ts:583`, defined `:2148`; CONTRACTS §8 row 03), so the standalone graph needs no forward
  change. `EXT_color_buffer_float` is required, as it already is for the root path. Without it,
  C-05 `probeHdrTargetFormat` returns `"rgba8"`, the graph is skipped with
  `POST_GRAPH_SKIPPED:no-float-target`, and the forward shader's tone curve applies. Making that
  fallback use the *selected* operator instead of the hard-coded Narkowicz curve
  (`ShaderLibraryCore.ts:588-593`) is C-05 real (lane 01), not this lane's edit.
- Bloom mips use R11G11B10F when `EXT_color_buffer_float` reports it renderable, otherwise RGBA16F.
- Linear depth uses R32F. 16F loses too much precision at far ranges.
- No RGBA8 target exists before OutputPass. This is C-13's invariant "every pass between MSAA
  resolve and OutputPass is linear-hdr", and `registerPostPass` rejects a `display` pass before
  tonemap with `POSTPROCESS_SPACE_INVALID:<id>`.
- **MSAA memory guard** (`post/PostAntiAlias.ts`): MSAA 4x on RGBA16F costs 66 MB of color plus
  33 MB of depth at 1080p, and four times that at 4K. Native DPR comes from C-27
  `maxPixelRatio` (1 / 1.5 / 2 / 3), so MSAA is allowed only when
  `renderWidth × renderHeight ≤ 2.4 Mpx`. Above that the mode switches to TAA where C-27 allows it
  (Ultra) and velocity coverage passes, otherwise to SMAA (FXAA until SMAA lands). The guard sets
  `postprocess.sampleCount = 1`. This rule is tested (section 15).
- **Render scale:** `renderScale ∈ [C-27 minRenderScale, 1]` multiplies the DPR-derived backing
  size. With TAA, S5 upsamples to display resolution (TAAU: Catmull-Rom history plus a 9-tap
  Blackman-Harris (Gaussian-approximation) reconstruction of the jittered current-frame samples,
  as in three r185 `examples/jsm/tsl/display/TAAUNode.js`). Without TAA, S10b samples bilinearly
  and S12 applies RCAS sharpening (AMD FSR1 RCAS, MIT license, ~40 lines GLSL). The
  dynamic-resolution governor is C-27 `forceRenderScale` (lane 11). This lane provides only the
  upsample stage and reads the scale at its next resolve.
- Canvas context (request Q-15-1, not edited here): `antialias:false` whenever the scene renders to
  an offscreen target, which is every root frame, and `preserveDrawingBuffer:false`. Today both are
  hard-coded `true` (`index.ts:13591`, `:13593`, inside the PR 0b carve `compiler/renderer.ts`;
  every profile at `index.ts:4232-4302`, inside `app/rendererOptions.ts`).
- Screenshots: C-05 `capture()` (lane 01) renders the frame now and reads it back, and "never sets
  `preserveDrawingBuffer`". `app.screenshot()` (`index.ts:11701-11703`, `captureAuraScreenshot(canvas)`
  → `canvas.toDataURL`, return type `AuraScreenshot` at `:10821`) keeps its synchronous signature;
  switching its body to render-then-read is part of Q-15-1. Playwright `page.screenshot()` (used by
  `tools/quality-rebuild-capture`) reads the composited page and is unaffected. This lane's own
  browser specs read pixels through `gl.readPixels` inside a frame callback, so they work with
  either context setting.

### 6.3 AO without a G-buffer: the indirect fraction

The forward PBR shader already computes direct (punctual) and indirect (ambient + IBL
diffuse/specular) terms separately, and adds emissive. It writes:

```
radiance = direct + indirect + emissive
f_ind    = luminance(indirect) / max(luminance(radiance), 1e-4)        // stored in color0.a
```

S2 then applies `rgb *= mix(1.0, aoMB, f_ind)` with `aoMB = multiBounce(ao, albedoProxy)`
(Jimenez 2016 polynomial with `albedoProxy = 0.5`). Emissive pixels, the sky and direct-lit
surfaces are barely affected. Ambient-dominated surfaces get full occlusion. Normals for GTAO are
reconstructed from the linear depth using the 5-tap smallest-discontinuity method (Turánszki) at
half resolution. No normal MRT is needed.

Who writes `f_ind`. The forward shaders belong to lane 01 (legacy `ShaderLibrary*.ts` is frozen,
CONTRACTS §3.7), and the direct/indirect split is lane 02's lighting chunks. This lane registers
C-02 feature `prd03.indirectFraction` (`post/chunks/indirectFraction.glsl.ts`). The chunk reads the
`a3dIndirectRadiance` value the lane 02 lighting chunk exposes (request Q-02-1) and writes
`o_color.a`. Transparent and additive draws need `blendFuncSeparate(srcRGB, dstRGB, ZERO, ONE)` so
they keep the surface's `f_ind`. That is a C-04 `RenderCommandState` value set by lane 01
(request Q-01-1). None of this exists until C-02 `generateProgram` is real.

Standalone fallback (day 0, no other lane needed). When the program feature is not active, the
graph reports `AO_INDIRECT_FRACTION_PENDING` in `diagnostics().post.skipped` and applies
`rgb *= mix(1.0, aoMB, u_aoFallbackStrength)`. `u_aoFallbackStrength` defaults to 0.6. The sky is
excluded (`linZ ≥ 0.999·far`), and so are pixels whose HDR luma exceeds 4.0, which is the emissive
proxy also used by S4. This darkens direct light in creases somewhat, which is the known cost of
the fallback. It is still a large step up from today's output, which is effectively zero AO
beyond about 2 m (19 §C14). The 22-ao-grounding criteria in §16.1 that gate on `f_ind` (emissive
and sky pixels ≤ 1 LSB) are integrated. The contact-darkening criteria are standalone.

This is weaker than Filament-style in-shader AO for specular occlusion. The Ultra-tier
alternative, a depth-normal prepass with AO sampled in the forward shader, is noted in section 24
and not built here.

### 6.4 Exposure and tone mapping

R2 governs this section. Exposure, auto-exposure and presets are this lane's. The tone operator
and the sRGB encode run once, in C-05 `OutputPass` (lane 01).

- Exposure is a linear multiplier, the same as three `toneMappingExposure`, so existing
  `colorGrade({exposure: 1.04})` keeps its meaning. Final exposure is
  `output.exposure × colorGrade.exposure × exp2(autoEv)` (`autoEv = 0` when auto-exposure is
  off). S10 applies it, so OutputPass receives `exposure: 1`. C-05 says "PRD 03 auto-exposure and
  grade produce the value, and OutputPass applies it". Applying it in S10 instead is equivalent,
  because the exposure multiply comes before the operator either way and bloom must see exposed
  HDR. The value is reported through C-05 `AuraOutputDiagnostics.exposure` (`source:
  "output" | "grade" | "auto"`) and this lane's `exposure` section (C-31). On the legacy chain
  (flag off, or v2 with C-05 stubbed) the bridge writes the product into the existing
  `toneMapping.exposure` field (`index.ts:12898-12904`, now `compiler/postprocess.ts`), and the
  present shader's `u_exposure` (`WebGL2Device.ts:3553`, `:3567`) applies it. The WebGPU grade
  today treats `exposure` as EV (`exp2(u_grade.exposure)`, `WebGPUPostShaders.ts:253`). Phase 7
  changes it to the same linear multiplier.
- Operators. The engine union is C-05 `AuraToneMappingOperator` (`none | linear | reinhard | aces |
  agx | neutral`). This lane provides the TS references in `post/ToneOperators.ts` and the
  64-triple goldens per operator. Lane 01 provides the GLSL (`output/ToneMappingOperators.glsl.ts`).
  - `aces`: the existing Hill fit (`WebGL2Device.ts:3495-3517`), unchanged.
  - `agx`: a verbatim port of three r185 `AgXToneMapping`
    (`node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js:113-168`).
    That is: linear sRGB → Rec.2020, inset matrix, log2 encode in [−12.47393, 4.026069] EV, 6th-order
    sigmoid polynomial, outset matrix, `pow(2.2)` linearize, Rec.2020 → sRGB.
  - `neutral`: a verbatim port of Khronos PBR Neutral (`:170-197`): `StartCompression = 0.8 − 0.04`,
    `Desaturation = 0.15`, min-channel toe offset (`x < 0.08 ? x − 6.25x² : 0.04`, subtracted from
    every channel, so the curve is *not* identity below the knee), peak compression, then
    desaturation toward `newPeak`.
  - `reinhard`, `linear`, `none`. `filmic`/`uncharted2` remain available only in
    `@aura3d/rendering/reference`.
  - Until C-05 is real, the stub maps unsupported operators to `aces` with `capability-degraded`.
    The legacy present shader's fake AgX/Neutral (`WebGL2Device.ts:3541-3550`) are therefore never
    selected on the v2 path, and AgX/Neutral parity criteria are integrated.
- The default operator is C-05 `DEFAULT_TONE_MAPPING = "aces"` (frozen). Cinematic presets select
  per scene type (6.8).
- **Background passthrough** replaces the clear-color pre-inversion (`colorToAcesInputClearColor`,
  `index.ts:15400-15418`, lane 15's code; removal is Q-15-2). This lane produces the coverage mask
  (S1 far-depth with no environment background) and passes it as the `coverage` argument of
  C-05 `OutputPassLike.execute`. Lane 01's OutputPass outputs the authored sRGB clear color there
  for any operator. Until both land, the pre-inversion keeps working for `aces`. For other
  operators the background is reported as `BACKGROUND_PASSTHROUGH_PENDING`.

### 6.5 Anti-aliasing policy

The tier defaults are C-27's frozen `msaaSamples / postAntiAlias` row: Low `0 / fxaa`, Medium and
High `4 / none`, Ultra `4 / taa` ("MSAA fallback w/o motion vectors"). `post/PostAntiAlias.ts`
turns that row plus runtime facts into one mode per frame:

| Mode | Forward target | Post-AA | When |
|---|---|---|---|
| `msaa` | 4x RGBA16F | none | Medium/High default (C-27); Ultra when velocity coverage fails; any tier while pixels ≤ 2.4 Mpx |
| `taa` | 1x + jitter; velocity from C-14 MRT when real, else S1 camera reprojection | none (TAA sharpening 0–0.25) | Ultra default (C-27). Explicit `antiAlias({mode:"taa"})` on any tier. Allowed only when every item that moved since the last frame has C-14 previous-frame data (§6.10); static scenes always qualify |
| `smaa` | 1x | SMAA 1x | When MSAA is blocked by the pixel guard and TAA is not allowed |
| `fxaa` | 1x | FXAA (three r185 `FXAAShader.js` port) | Low (C-27); explicit opt-in |
| `off` | 1x | none | Explicit only |

Moving High to TAA is CCR-03-4, a value change to the C-27 table that needs lane 11's approval
and checkpoint evidence that High has full velocity coverage. It is not assumed anywhere in this
PRD's standalone acceptance.

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
the edge and subpixel factors. On the Phase 1 legacy path the port recomputes luma per tap,
exactly as three does, because the legacy present program's alpha is scene alpha
(`WebGL2Device.ts:3613`). On v2 the only deliberate difference from three applies: S10b stores luma
in alpha, so the port reads `.a` instead of recomputing luma per tap (≤ 1 LSB difference, covered
by the FXAA spec). This is a closer match to three, not stronger than it. If FXAA 3.11
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
- Velocity source. With C-14 real (forward MRT, needs C-02 real), per-object velocity comes from
  `color1`. Before that, S1 writes camera-only velocity by reprojecting each pixel's linear depth
  with the C-14 `prepare()` unjittered and previous matrices. That is exact for static geometry.
  Items whose model matrix changed since the last frame are counted by `forward/Velocity.ts`
  (the `bindVelocityUniforms` seam sees every draw). If any moving item lacks C-14 previous data,
  `PostAntiAlias.ts` drops to msaa for that frame and records `TAA_VELOCITY_COVERAGE` in
  `post.skipped`.
- A reactive mask in a dedicated `color2` R8 attachment lowers history weight on blended pixels.
  C-14 items with `writesReactive` (particles and transparents; lane 07 sets it) output
  `vec4(alpha)` to it. WebGL2 has no per-attachment blend or colour-mask state without
  `OES_draw_buffers_indexed`, so the attachment receives the same blend as colour. The value is
  therefore approximate accumulated coverage, which is enough for a feedback weight. It is cleared
  to 0 each frame. A stencil bit is not used: WebGL2 cannot sample stencil in a shader, and the
  TAAU output resolution differs from the scene depth-stencil. Before C-14 MRT is real, the
  reactive input is absent. TAA then uses a luminance-delta heuristic instead: feedback drops
  toward 0.5 where `|luma(current) − luma(history)| > 0.25·luma(history)`. The reactive-mask test
  (Phase 4 case d) is integrated.
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
`intensity 0.25`, `scatter 0.7`, `clampLuminance 64`, mip count from C-27 `bloomMipLevels`
(Low 3, Medium 5, High/Ultra 6). `color` is a tint on the prefilter output.
`maxIntensity`/`antiBlowout` are deprecated. They map to `clampLuminance`, and the 0.05
intensity floor is removed. Factory defaults stay byte-identical (factories cannot see flags), so
the v2 bridge applies the v2 defaults to every bloom field that is absent from the node's
`postAuthored` list. For example, `neonBloom()` with no options gets threshold 1.0, not its legacy
0.68. An authored `threshold < 1` is honoured as linear HDR and reported with
`BLOOM_THRESHOLD_BELOW_HDR_WHITE` (diagnostic only).

Consequence for emissive authoring. Emissive strength is C-15 material data (lane 04): the
`KHR_materials_emissive_strength` import and an HDR-unbounded multiplier. This lane consumes
C-15 as it is. Today's default `material.emissive` strength is 1.35 (05 §2.1). Cyan `#38d6ff` has
linear luma ≈ 0.56, so luma × 1.35 ≈ 0.76, which is below threshold 1.0. **Under correct bloom,
today's neon will not glow.** That is correct behaviour, and it is what vision saw in Vault
Breakers. The `post-v2` codemod therefore prints a per-game emissive report. Lane 14 raises
neon/practical emissive strength to 3–8 per game from it (Q-14-1). Presets document the expected
range in `emissiveStrengthRange` (C-13). Benchmark scenes owned by this lane author emissive
strength explicitly, so standalone bloom acceptance does not depend on C-15.

### 6.7 Grading and LUT

R2 forbids a second tone map, so the grade is split around C-05 `OutputPass`:
- **Linear grade (S10, before tonemap).** White balance (Bradford CAT in LMS),
  lift/gamma/gain and shadows/midtones/highlights (ASC-CDL style), evaluated analytically per
  pixel on exposed HDR. This is about 40 ALU ops, so no LUT is needed.
- **Display grade (S10b, after tonemap).** Contrast (pivot 0.5), saturation, vibrance and the
  optional user `.cube` (sRGB-encoded domain), baked into one 33³ RGBA8 `TEXTURE_3D` over the
  display-referred [0,1]³ cube. The bake runs only when display-grade params change: 33 draws with
  `framebufferTextureLayer`. Per pixel it is one trilinear fetch of `texture(u_lut3d, disp)`.

```
// bake, per texel (display domain)
disp = uvw
disp = contrast(disp, pivot 0.5), saturation, vibrance   // as today's present grade
disp = mix(disp, userLut(disp), lutIntensity)
store disp
```
A test checks that the display LUT is within 1 LSB of the analytic display grade on a 4096-step
ramp (section 15). WebGPU bakes the same LUT through a compute pass into a 3D storage texture.
Cost versus the earlier single-LUT design: one extra full-screen RGBA16F read in OutputPass
(≈ 0.05 ms at 1080p desktop). S10b fuses with S11/S12, so the number of passes is unchanged
whenever post-AA or finalize run.

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

Presets that name `agx` or `neutral` render with `aces` and report `capability-degraded` until
C-05 is real (6.4). Their preset acceptance is therefore integrated. `neon-night`, `space` and
`arena-fight` use `aces` and are testable standalone.

Tier mapping lives in `post/PostQualityTiers.ts`. The tier itself is C-27 (lane 11, frozen table).
Rows marked "C-27" are read from `AuraQualityTierSettings`. The other rows are this lane's
derived post parameters, keyed by the C-27 tier id. A preset declares intent; the tier decides
cost:

| Feature | Source | Low | Medium | High | Ultra |
|---|---|---|---|---|---|
| DPR cap | C-27 `maxPixelRatio` (applied by lane 01) | 1.0 | 1.5 | 2.0 | 3.0 (backing ≤ 8.3 MP) |
| AA | C-27 `msaaSamples/postAntiAlias` + 6.5 | fxaa | msaa (guard → smaa) | msaa (guard → smaa) | taa (fallback msaa) |
| Render scale floor | C-27 `minRenderScale` | 0.5 | 0.6 | 0.7 | 0.75 |
| GTAO | C-27 `ambientOcclusion` off/low/medium/high | off | half-res, 2 dirs × 4 steps | half-res, 4 × 4, temporal if taa | full-res, 4 × 6, temporal |
| SSR placement | C-27 `ssr` | off | off | half-res (medium) | half-res (high) |
| God rays | lane 03 | off | half-res 32 samples | half-res 48 | half-res 64 |
| DOF | lane 03 | off | off | half-res | full CoC, half-res gather 2 rings |
| Motion blur | lane 03 | off | off | 8 taps | 12 taps |
| Bloom mips | C-27 `bloomMipLevels` | 3 | 5 | 6 | 6 |
| Auto-exposure | lane 03 | off | if preset | if preset | if preset |
| Display LUT | lane 03 | yes | yes | yes | yes |
| Grain/CA/vignette | lane 03 | vignette only | all | all | all |
| Dither | lane 03 (S12) / C-05 (OutputPass) | yes | yes | yes | yes |

Tier selection. `renderer.quality` (`AuraQualityTier | "auto"`, pre-declared by C-38) resolves
through C-27. The stub resolves `"auto"` to `high` on desktop and to `medium` for a coarse pointer.
Lane 11's device heuristic replaces that without any change here, because `PostQualityTiers.ts`
re-reads `app.quality.settings` on `onChange`. The legacy `qualityProfile` ids map as
`safe-basic → medium`, `production → high`, `cinematic → ultra`, `experimental-webgpu → high`, with
a deprecation warning. That mapping lives in lane 11's `app/rendererOptions.ts`. This lane only
consumes the resolved tier.

### 6.9 CPU readback removal

The interactive frame loop never calls `readPixels`/`readFloatPixels` for post. The rules, all in
this lane's `renderer/PostprocessExecution.ts` (the `Renderer.ts:977-1330` carve):
- `executePixelPostprocessPass` and its async variant run only when
  `postprocess.execution === "cpu-deterministic"`. That option exists already
  (`Renderer.ts:658`). With `A3D_QR_POST` on, any other request for a non-GPU pass throws
  `POSTPROCESS_PASS_NOT_GPU` in dev builds. In production builds the pass is skipped and recorded
  in `diagnostics().post.skipped` as an error. With the flag off, behaviour is unchanged (CONTRACTS
  §6.1 "No PR changes flag-off behaviour").
- `volumetric-light` becomes GPU S4 god rays. The bridge (`compiler/postprocess.ts`) maps
  `effects.volumetricFog` to S4 and no longer emits the `volumetric-light` pass, so
  `VolumetricFog.ts` (lane 07) is not called. Its deletion is Q-07-1. The light position is
  projected from the strongest directional light in the compiled RenderSource (C-10 stub = legacy
  lights) or from the C-21 sky sun when a sky is present, not from the fixed `[0.5,0.18]`.
  Occluders are derived from linear depth (`depth == far` or emissive luma > threshold). The
  authored `color` is honored. Froxel volumetric fog is lane 07's (C-21). If lane 07 registers a
  volumetric composite through C-13, it replaces S4 for that node.
- `film-grain` and `chromatic-aberration` move into S12 and S10.
- The `contact-shadow` post pass is deleted from `RendererPostprocessPlan.ts:204-206` under the
  flag. Screen-space contact shadows are lane 02's forward feature (C-11, C-27 `shadow.contact`).
- CPU kernels in `PostProcessPass.ts` (2,750 lines), `EffectComposer.ts`,
  `postprocess/SSAOPass.ts` and the synthetic-depth `runExternalParitySSAO` move to
  `packages/rendering/src/reference/` (subpath `@aura3d/rendering/reference`, reserved by PR 0a).
  The root barrel `packages/rendering/src/index.ts` is lane 15's, so removing the root re-exports
  is Q-15-4. Until then they stay re-exported with `@deprecated`.

### 6.10 Velocity for all geometry classes (TAA, motion blur)

`TemporalHistory.prepare` (`TemporalHistory.ts:57-94`) re-draws every item in a separate pass and
throws on skinned, morphed or instanced items (`:73-74`). Under `A3D_QR_POST` the re-draw is
removed (`:89-92`). The existing `prepare(device, width, height, items, viewProjection, …)` signature
stays for the flag-off caller. A new method, `prepareMatrices(viewProjection, jitter)`, returns
`{ jittered, unjittered, previous }` matrices only. `asTemporalHistoryLike()` adapts it to the C-14
`TemporalHistoryLike.prepare` shape. Both live in `TemporalHistory.ts`, which is this lane's file. The jitter is still applied at the existing `Renderer`
call site, unchanged. Velocity then comes from one of two sources:
- **Standalone (day 0):** S1 camera-reprojection velocity (6.5). It is exact for static geometry.
- **Forward MRT (C-14 real).** This needs C-02 `generateProgram` real and
  `RenderTargetDescriptor.colorAttachments` real (lane 01, Q-01-2). Feature `prd03.velocity`
  (`post/chunks/velocity.glsl.ts`, define `AURA_VELOCITY` from C-14 `VELOCITY_MRT`) is included by
  the generator in every lit and unlit variant. The vertex stage computes
  `clipPrev = u_prevViewProjection * prevWorldPos` and `clipCurr = u_unjitteredViewProjection * worldPos`.
  The fragment writes `velocity = (clipCurr.xy/clipCurr.w - clipPrev.xy/clipPrev.w) * 0.5` to
  location 1 (RG16F). `forward/Velocity.ts` `bindVelocityUniforms(item, uniforms)` binds the
  previous matrices per draw from the C-14 `RenderItem` fields:
  - Rigid: `previousModelMatrix`. `forward/Velocity.ts` keeps a per-label cache, so a rigid item
    needs nothing from any other lane.
  - Instanced: `previousInstanceTransforms` → `a_prevInstance0..3`. The producer of instance
    buffers fills it (lane 01 `SceneOptimization.ts:207-217`, Q-01-3; lane 10/11 through C-07).
    Static batches use `prev = curr`.
  - Skinned: `previousJointTexture` (C-18 `palette.previous`, lane 06).
  - Morph: `previousMorphWeights` (lane 06).
  - Transparent/particles: `writesReactive` items write `color2` instead of velocity.
- Items without previous data count against `velocityCoverage`. If any of them moved, the frame
  uses msaa (6.5).
- Camera cuts: C-14 `resetTemporalHistory(reason)` is real in this lane and exposed as
  `app.cutCamera()` (C-38 flattened method). Lane 08's `app.camera.cut()` calls it (C-22). History
  is also reset when `|Δcamera position| > cutThreshold` (default 5 m per frame), on resize, on
  tier change and on scene swap.

### 6.11 Depth linearization

The C-08 stub keeps the `{ near: 0.1, far: 1000 }` literal at `WebGL2Device.ts:865`, and
`normalizeLdrDepthRange(undefined)` (`:909`, `:4567-4574`) returns 0.1/1000, because today nothing
supplies a range. This lane fixes it without waiting for C-08. The bridge (`compiler/postprocess.ts`)
reads the camera clipping that `resolveCameraClipping` (`RootRuntimeSupport.ts:16-21`, defaults
0.05/100) produces for the compiled camera. It sets `PostPipelineOptions.depthRange` on v2 and, on
the legacy chain, the `depthRange` that `presentLdrPostprocess` already accepts (`:909`). That
field reaches the device through the additive field `RendererPostProcessOptions.depthRange?`
(CCR-03-1). `PostprocessExecution.ts` forwards it. When C-08 is real, the frame camera's
near/far/projection takes precedence. The shared GLSL:
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
app.addPostPass({ name: "scanlines", insertAt: "after-tonemap", fragment: { glsl, wgsl }, uniforms })
// = C-13 registerPostPass({ id: "app.scanlines", owner, flag: "A3D_QR_POST", space: "display", gpuOnly: true, ... })
```
Custom passes are fullscreen fragments with `u_color`, `u_depthLinear`, `u_velocity`,
`u_texelSize` and `u_time` available. Resources are pooled by `PostResources`, which caches on top
of the C-28 `renderTargetPoolSlot` (the stub allocates on every acquire, so the cache keeps
allocations constant either way). A pass that declares `insertAt: "before-tonemap"` receives
RGBA16F; `after-tonemap` receives display-referred RGBA8. The same registry carries the other
lanes' passes: lane 02 SSR (`before-taa`), lane 07 god rays / volumetric composite, lane 08
screen-feel uniforms, lane 10 underwater. This replaces the need to edit `WebGL2Device.ts` to add an
effect (05 §11 item 10). With the flag off, registered passes are listed in `post.skipped` with
reason `post-graph-v2-pending` (C-13 stub).

---

## 7. APIs to add, change, remove

### 7.1 Engine (`@aura3d/engine`)

Shared types are not redefined here. They come from the frozen contract files PR 0a creates:
`packages/engine/src/contracts/{output,post,app,diagnostics,compiler}.ts` and
`packages/rendering/src/contracts/{quality,post,velocity,output}.ts`. This lane's implementations
live in `agent-api/{postBridge,postPresets}.ts`, `agent-api/compiler/postprocess.ts` and
`agent-api/nodes/effects.post.ts`. The `index.ts` types section is frozen except by CCR, and the
fields below are pre-declared optional and inert in PR 0a (CONTRACTS §3.1 item 3).

```ts
// ---- consumed, defined elsewhere (do not redeclare) ----
import type { AuraQualityTier } from "@aura3d/rendering/contracts";          // C-27 (R1)
import type { AuraToneMappingOperator, AuraOutputOptions, AuraOutputDiagnostics } from "@aura3d/engine/contracts"; // C-05 (R2)
// AuraOutputOptions (C-05): toneMapping?, exposure?, dither?, backgroundPassthrough?, autoExposure?, preset?
//   This lane owns the semantics of `preset` and `autoExposure` (C-13) and of how `exposure` combines (6.4).
//   `app.setOutput()` is implemented by lane 01 (C-05). Forwarding preset/autoExposure from it into the
//   post surface is request Q-01-6; until then they are read at create time from options.output.

// ---- provided by this lane (C-13 / C-14 types, packages/engine/src/contracts/post.ts) ----
export type AuraAntiAliasMode = "auto" | "msaa" | "taa" | "smaa" | "fxaa" | "off";
export type AuraPostPresetId =
  | "product-studio" | "daylight-outdoor" | "neon-night" | "space"
  | "underwater" | "arena-fight" | "cinematic-film";
export interface AuraAutoExposureOptions {
  readonly minEv?: number;            // default -4
  readonly maxEv?: number;            // default 4
  readonly speedUp?: number;          // EV/s, default 3
  readonly speedDown?: number;        // EV/s, default 1
  readonly meteringMask?: "center-weighted" | "average";   // default "center-weighted"
  readonly compensationEv?: number;   // default 0 — CCR-03-2 (additive optional field)
}
export interface AuraPostPreset {
  readonly id: AuraPostPresetId;
  readonly output: AuraOutputOptions;                        // C-13 frozen shape
  readonly effects: readonly AuraNodeBuilder<AuraEffectNode>[];
  /** Documented expected emissive strength range for bloom to engage. */
  readonly emissiveStrengthRange: readonly [number, number];
}
export const postPresets: Readonly<Record<AuraPostPresetId, AuraPostPreset>>; // values in agent-api/postPresets.ts
export interface AuraCustomPostPass {
  readonly name: string;
  readonly insertAt: "after-depth" | "before-taa" | "after-taa" | "before-tonemap" | "after-tonemap";
  readonly fragment: { readonly glsl: string; readonly wgsl?: string };
  readonly uniforms?: Readonly<Record<string, number | readonly number[]>>;
  readonly inputs?: readonly ("color" | "depth" | "velocity")[];
}
export interface AuraPostSurface {                             // C-38 member `post`, owner prd03
  addPostPass(p: AuraCustomPostPass): () => void;              // = registerPostPass
  setQualityTier(t: AuraQualityTier | "auto"): void;           // delegates to C-27 app.quality.set
}

// ---- pre-declared by PR 0a, wired by this lane (C-38 flattened members / options) ----
// AuraApp.addPostPass, AuraApp.setQualityTier          (from AuraPostSurface)
// AuraApp.cutCamera(): void                              (C-14 resetTemporalHistory("camera-cut"))
// AuraCreateAppOptions.output?: AuraOutputOptions        (C-05 type; read by compiler/postprocess.ts)
// AuraCreateAppOptions.pixelRatio?: number | { max?; min? } (C-38; applied by lane 01/15, not here)
// AuraCreateAppOptions.compat?: { post?: "3.0" }         (this lane: forces pipeline "legacy")
// AuraCreateAppRendererOptions.quality?, renderScale?    (C-27/C-38; consumed)
// Removed from this PRD's earlier draft: `capture?: boolean` (not in C-38; C-05 `capture()` covers it).
```

`effects.*` option changes. Factories sit at `index.ts:3441-3728` today and move in PR 0b-1 to
lane 03's `nodes/effects.post.ts` (bloom, neonBloom, ambientOcclusion, contactOcclusion,
colorGrade, antiAlias, plus new vignette/filmGrain/chromaticAberration) and lane 07's
`nodes/effects.ts` (cinematicBloom, volumetricFog, depthOfField, motionBlur, outline,
screenSpaceReflections; see Q-07-2). `AuraEffectNode` (`:1567`) gains the listed fields as
pre-declared optional fields (C-13 "field lists frozen in PRD 03 §APIs"; anything PR 0a missed is
CCR-03-3). C-13 fixes the strictness rule: with `A3D_QR_POST` on, unknown or unexecuted fields
**throw** `AuraRuntimeError("POST_FIELD_UNSUPPORTED")` before the first frame. With the flag off
they warn (`option-ignored`), as today. Factory defaults do not change (6.6); v2 defaults apply in
the bridge to fields missing from `postAuthored`. Each unexecuted field is listed in
`compiler/diagnosticOnly.prd03.ts` until it is wired (C-36 option coverage).

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
effects.neonBloom(o)    // v2 bridge defaults: threshold 1.0, knee 0.3, intensity 0.35, scatter 0.75 (fields not in o.postAuthored)
effects.cinematicBloom(o) // lane 07 file; v2 defaults threshold 1.0, knee 0.25, intensity 0.2, scatter 0.7 after Q-07-2

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
effects.depthOfField(options?: {   // factory is lane 07's (nodes/effects.ts); new fields reach the bridge only after Q-07-2
  focusDistance?: number;     // metres (NEW)
  fStop?: number;             // default 2.8 (NEW)
  focalLength?: number;       // mm, default from camera fov & 36 mm sensor (NEW)
  maxBlur?: number;           // px at 1080p, default 12 (was ≤8)
  /** @deprecated 0..1 fraction; converted with real near/far */ focus?: number; aperture?: number;
});
effects.motionBlur(options?: { intensity?: number /* shutter fraction, default 0.5 */; maxBlur?: number /* px, default 32 */ }); // lane 07 factory; `maxBlur` needs Q-07-2
effects.volumetricFog(o)  // lane 07 factory, unchanged; the lane 03 bridge executes it as GPU god rays (S4); `color` honored; lightPosition derived when omitted
```

Diagnostics. The report type `AuraRendererDiagnosticReport` (`index.ts:1793`) is frozen. New data
reaches `app.diagnostics()` through C-31 sections. This lane registers the keys `"post"` and
`"exposure"` (CONTRACTS C-31 line "`"post" | "exposure"` // PRD 03") from `src/lanes/prd03.ts`:
```ts
// section "post" = C-13 AuraPostDiagnostics
{ tier: AuraQualityTier; antiAlias: AuraAntiAliasMode; renderPixels: number; pixelRatio: number; renderScale: number;
  stages: PostGraphReport["stages"]; skipped: PostGraphReport["skipped"]; velocityCoverage: { items: number; withVelocity: number } }
// section "exposure" (this lane): the actually-sent value, same shape as C-05 AuraOutputDiagnostics.exposure
{ applied: number; source: "output" | "grade" | "auto"; autoEv?: number }
```
The `toneMapping` label is C-05's (`AuraOutputDiagnostics.toneMapping`, lane 01). The literal
`toneMapping: "aces-filmic"` (`index.ts:1801`) stays until lane 01/15 widen it. The other
truthfulness fixes are requests, because the code belongs to other lanes:
- `sceneExposurePresets` (`index.ts:4204-4214`, `app/colorManagement.ts`, lane 01): remove it, or
  apply it as the `output.exposure` default, so the report never shows a number that is not
  sent (Q-01-4).
- The `createRendererDiagnosticReport` warning "color-grade exposure is recorded but has no native
  grade target yet" (`index.ts:4547`, lane 15): delete it when `exposure.applied` reports the
  real value (Q-15-2).
- The `tone: aces-filmic @ <preset>` overlay text (`:18657`, lane 15): print the C-05 label and
  `exposure.applied` (Q-15-2).

### 7.2 Renderer (`@aura3d/rendering`)

```ts
// Frozen in packages/rendering/src/contracts/post.ts (C-13; quoted, not redefined):
//   PostPipelineOptions { antiAliasing: "msaa"|"taa"|"smaa"|"fxaa"|"off"; renderScale?; depthRange: {near, far, projection};
//     ao?, ssr?, godRays?, taa?, dof?, motionBlur?: unknown; exposure: number; bloom?: unknown;
//     toneMapping: AuraToneMappingOperatorLike; grade?, lut?, vignette?, filmGrain?, chromaticAberration?: unknown;
//     dither: boolean; backgroundPassthrough?: boolean; customPasses?: readonly PostPassDescriptor[] }
//   registerPostPass, PostPassDescriptor, PostGraphReport, PostInsertAt, PostSpace
//   RendererPostProcessOptions.pipeline?: "v2" | "legacy"; .v2?: PostPipelineOptions        (PR 0a, Renderer.ts:378)
//   RenderDevice.executePostGraph?(source: SceneTargets, options, output): PostGraphReport  (PR 0a optional member)
// `exposure` is the final multiplier (6.4). `toneMapping` is forwarded untouched to C-05 OutputPass.

// packages/rendering/src/post/PostGraph.ts — concrete types for the `unknown` members.
// Replacing `unknown` with these is CCR-03-3 ("concrete types replacing unknown placeholders" is an allowed CCR);
// until it merges, PostGraph narrows with runtime validators (`assertGtaoOptions`, …) and throws POST_FIELD_UNSUPPORTED.
export interface GtaoOptions { radius: number; intensity: number; falloff: number; directions: 2 | 4; steps: 4 | 6; halfRes: boolean; temporal: boolean; multiBounce: boolean; fallbackStrength: number /* 0.6, 6.3 */ }
export interface BloomOptionsV2 { threshold: number; knee: number; intensity: number; scatter: number; tint: readonly [number, number, number]; clampLuminance: number; mips: 3 | 5 | 6 /* C-27 bloomMipLevels */ }
export interface TaaOptions { feedbackMin: number /*0.88*/; feedbackMax: number /*0.97*/; varianceGamma: number /*1.0*/; upscale: boolean; sharpness: number /*0.2*/ }
export interface DofOptions { focusDistance: number; fStop: number; focalLengthMm: number; sensorHeightMm: number; maxBlurPx: number; halfRes: boolean }
export interface MotionBlurOptions { shutter: number; maxBlurPx: number; samples: 8 | 12 | 16; tileSize: 16 | 20 }
export interface GodRayOptions { samples: 32 | 48 | 64; decay: number; weight: number; color: readonly [number, number, number]; intensity: number; lightWorld?: readonly [number, number, number] }
export interface ColorGradeOptionsV2 { temperature: number; tint: number; contrast: number; saturation: number; vibrance: number; lift: Rgb; gamma: Rgb; gain: Rgb; shadows: Rgb; midtones: Rgb; highlights: Rgb; lutIntensity: number }
export interface LutTexture3D { readonly size: number; readonly data: Float32Array /* size³×4, display (sRGB-encoded) domain */ }
export interface AutoExposureOptionsV2 { minEv: number; maxEv: number; speedUp: number; speedDown: number; compensationEv: number; meteringMask: "center-weighted" | "average" }
// PostPipelineOptions.autoExposure?: AutoExposureOptionsV2 | false  — CCR-03-2 (additive optional field)
export function parseCubeLut(text: string): LutTexture3D;                  // post/CubeLut.ts
export function resolvePostTier(settings: AuraQualityTierSettings, tier: AuraQualityTier, ctx: PostTierContext): Partial<PostPipelineOptions>; // post/PostQualityTiers.ts, C-27 input
export function resolvePostAntiAlias(input: { settings: AuraQualityTierSettings; tier: AuraQualityTier; authored: AuraAntiAliasMode; renderPixels: number; velocity: { moving: number; movingWithHistory: number } }): { mode: PostPipelineOptions["antiAliasing"]; sampleCount: 1 | 4; reason?: string }; // post/PostAntiAlias.ts
export function bloomNormalization(mips: number, scatter: number): number; // NativeBloomPyramid.ts, replaces resolveBloomPyramidResponseGain
export function createLegacyOutputPass(device: WebGL2Device): OutputPassLike; // webgl2/LegacyPost.ts; C-05 stand-in (6.4, CCR-03-5)

// RenderDevice: the WebGL2 implementation is `executePostGraphWebGL2(device, source, options, output)` in lane 03's
// webgl2/LegacyPost.ts (the carve already receives the device's GL internals as parameters, CONTRACTS §3.1).
// PostprocessExecution.ts calls it directly when `device.kind === "webgl2"`, so WebGL2Device.ts needs no edit.
// If PR 0b-2 also wires `WebGL2Device.executePostGraph` as a delegate (C-13 seam), both paths call the same function.
// WGSL twin on WebGPUDevice.ts is lane 11's (Q-11-2).
/** @deprecated legacy uber-chain; `pipeline:"legacy"` / compat:"3.0" */ presentLdrPostprocess(...): void;

// Renderer: RendererPostProcessOptions.depthRange?: { near; far; projection }  — CCR-03-1 (additive; legacy chain)

// Velocity: C-14 (packages/rendering/src/contracts/velocity.ts), provided real by this lane:
//   RenderItem.previousModelMatrix? / previousInstanceTransforms? / previousJointTexture? / previousMorphWeights? / writesReactive?
//   VELOCITY_MRT, TemporalHistoryLike, resetTemporalHistory(reason)
export function bindVelocityUniforms(item: RenderItem, uniforms: UniformSink): void; // forward/Velocity.ts seam, called by ForwardPass per draw
```

Removed from public `@aura3d/rendering` root exports and moved to `@aura3d/rendering/reference`:
`EffectComposer`, `BloomPass` (CPU), `FXAAPass`, `ToneMappingPass`, `toneMapPixels`,
`toneMapFloatPixels`, `colorGradePixels`, `chromaticAberrationPixels`, `filmGrainPixels`,
`ssaoPixels`, `ssrPixels`, `taaPixels`, `outlinePixels`, `volumetricLightPixels`,
`contactShadowPixels`, `runExternalParitySSAO`, plus `cinematic/{Bloom,Vignette,FilmGrain,DepthHaze}Pass`
descriptors. The move into `reference/` is this lane's work. Dropping the root re-exports from
`packages/rendering/src/index.ts` is lane 15's (Q-15-4). Until that lands they stay `@deprecated`
re-exports. `resolveBloomPyramidResponseGain` is deleted at flag removal (Phase 8).

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
2. **Forward-shader features (C-02 chunks in lane 03 files; no edit to `ShaderLibraryCore.ts` or
   `ShaderLibrary.ts`, which are lane 01's and frozen, CONTRACTS §3.7).** Both chunks are
   validated in `ChunkHarness` (C-02) on day 0. They affect pixels only once C-02
   `generateProgram` is real (`A3D_QR_CORE=v2`).
   - `post/chunks/indirectFraction.glsl.ts` (feature `prd03.indirectFraction`): writes
     `o_color.a = f_ind` (6.3) from the `a3dIndirectRadiance` symbol of lane 02's lighting chunk
     (Q-02-1). When post is off, the feature is not requested.
   - `post/chunks/velocity.glsl.ts` (feature `prd03.velocity`, define `AURA_VELOCITY` =
     C-14 `VELOCITY_MRT.define`): `layout(location=1) out vec2 o_velocity`. The vertex part adds
     `uniform mat4 u_prevModelMatrix, u_prevViewProjection, u_unjitteredViewProjection`. Under the
     C-18 skinning feature it adds `uniform highp sampler2D u_prevJointTexture`, fetched with the
     deform chunk's joint-fetch function. Under instancing it adds `in vec4 a_prevInstance0..3`.
     Under morph it adds `uniform float u_prevMorphWeights[N]`. The chunk declares its dependency
     on the `deform` chunk so the generator orders it after C-18.
   - Items with `writesReactive` declare `layout(location=2) out vec4 o_reactive` and write
     `o_reactive = vec4(alpha)` with `drawBuffers([COLOR_ATTACHMENT0, NONE, COLOR_ATTACHMENT2])`, so
     velocity is untouched. Opaque items use `drawBuffers([COLOR_ATTACHMENT0, COLOR_ATTACHMENT1,
     NONE])`. Selecting `drawBuffers` per draw happens in `forward/Velocity.ts` through the
     `bindVelocityUniforms` seam. No stencil is involved.
   - Not in this lane: the no-post tone curve (`a3dPbrEncodeOutput`, `ShaderLibraryCore.ts:588-593`,
     `ShaderLibrary.ts:406-411`, Narkowicz) is replaced by the selected operator as part of C-05 real
     (lane 01).
3. **Depth prep (`depthDownsample.glsl.ts`).** Pass A: `R32F = linearizeDepth(texelFetch(depth))`.
   Pass B: half-res `RG32F = (min, max)` of the 2×2 quad (`texelFetch`, no filtering).
   Pass C, only when TAA or motion blur is active and the C-14 MRT is absent: camera velocity
   `v = (ndcCurr − ndcPrev)·0.5`, where `ndcPrev = (u_prevViewProjection · u_invUnjitteredViewProjection · ndcCurr(uv, depth))`,
   into RG16F. This gives the same units and sign as C-14.
4. **GTAO (`gtao.glsl.ts`).** Ported from three r185 `GTAOShader.js`/`GTAONode.js` (MIT): slice
   directions `{2,4}` rotated by a 4×4 interleaved-gradient noise plus the TAA frame index,
   horizon search with `steps` samples along each direction within `radius` metres projected to
   pixels (`radiusPx = radius * projScale / viewZ`, clamped 4..96 px), cosine-weighted integration
   of the visible arc against the reconstructed normal, distance falloff
   `saturate((radius - d)/ (falloff*radius))`, output `ao` in R8. Denoise (`gtaoDenoise.glsl.ts`):
   two 1D bilateral passes, 5 taps, weights
   `exp(-|Δz|/(0.05*z))·gauss`. With TAA it adds a temporal accumulation with velocity
   reprojection and depth rejection (feedback 0.9). Apply: joint-bilateral upsample using
   full-res linear depth, then `hdr.rgb *= mix(1.0, aoMB, w)` with `w = hdr.a` when feature
   `prd03.indirectFraction` is active, else `w = u_aoFallbackStrength · (1 − sky) · step(luma(hdr), 4.0)`
   (6.3), and
   `aoMB = max(ao, ((ao*a + b)*ao + c)*ao)`, where `a = 2.0404*ρ-0.3324`,
   `b = -4.7951*ρ+0.6417`, `c = 2.7552*ρ+0.6903`, ρ = 0.5.
   This replaces the legacy SSAO (`WebGL2Device.ts:3091-3129`, now in `webgl2/LegacyPost.ts`) on v2.
5. **God rays (`godrays.glsl.ts`).** Half-res. The occlusion source is
   `src = (linZ >= far*0.999 || luma(hdr) > 4.0) ? hdr.rgb : 0` with the light disk mask
   `smoothstep(r1, r0, |uv - lightUv|)`. Radial march of `samples` steps toward `lightUv` with
   `decay^i * weight`, multiplied by `color * intensity` and added to HDR. If `lightUv` is
   off-screen or behind the camera, the intensity fades by
   `saturate(1 - (|lightUv-0.5|-0.5)*4) * step(0, lightClip.w)`. On the v2 path this supersedes
   `VolumetricFog.ts:105-144` (lane 07's file; the bridge stops calling it, deletion is Q-07-1) and
   `volumetricLightPixels`.
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
     `feedback = mix(feedback, 0.5, reactive)`, where `reactive = texture(u_reactive, uv).r` when
     the C-14 reactive attachment exists, else the luminance-delta heuristic of 6.5.
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
   Worked example for the `prd03-dof-bokeh` test: f = 50 mm, N = 2.8, zf = 3 m, z = 30 m, 1080 px gives
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
11. **Display LUT bake (`lutBake.glsl.ts`).** 6.7. Rendered with `framebufferTextureLayer` into a
    33³ RGBA8 `TEXTURE_3D` over the display-referred cube: contrast/saturation/vibrance plus the
    optional `.cube`. **No tone operator in this lane's GLSL (R2).** Where 3D-texture linear
    filtering is unavailable (RGBA8 3D textures filter in core WebGL2, so this is not expected),
    `#define AURA_ANALYTIC_GRADE` evaluates the same math per pixel. Deleting the fake AgX/Neutral
    (`WebGL2Device.ts:3541-3550`, lane 01) and `LeanWebGL2Device.ts:3320-3338` (lane 15) is C-05
    real and Q-15-3. It is not this lane's edit.
12. **Composite (`composite.glsl.ts`, linear HDR, before OutputPass).**
    - `c = texture(u_hdr, uv_ca(uv)) * u_exposure * autoExp + bloom(uv) * u_bloomIntensity`.
    - Chromatic aberration samples R/G/B at `uv ± dir·intensity·|uv-0.5|²`, 3 taps total, when
      CA is enabled.
    - Linear grade: Bradford white balance, then `pow(max(c·gain + lift, 0), 1/gamma)` per
      channel, then shadows/midtones/highlights weights `(1−s)², 2s(1−s), s²` with
      `s = saturate(log2(luma/0.18)/8 + 0.5)`.
    - Output RGBA16F to C-05 `OutputPassLike.execute(input, coverage, { toneMapping, exposure: 1,
      dithering: false when S10b/S11/S12 follow, backgroundCoverage: true }, target)`.
      `coverage` is the S1 far-depth mask (`linZ >= far*0.999 && !envBackground`).
    - **S10b display grade (`displayGrade.glsl.ts`, after OutputPass, fused into S11/S12 when
      present).** `disp = texture(u_lut3d, disp)`. Vignette:
      `disp *= mix(1, vignetteColor, pow(saturate(len·intensity), smoothness))` with
      roundness-aspect correction. Then `o = vec4(disp, luma(disp))`, with luma for FXAA.
    - Tone map and grade run once per pixel, not up to 5 times as in today's
      `finalColorAt`-per-tap FXAA (`WebGL2Device.ts:3611-3631`).
13. **FXAA (`fxaa.glsl.ts`).** 6.5. Verbatim port of three r185 `FXAAShader.js` using
    `textureLod` with bilinear filtering on the RGBA8 input. Luma is read from `.a` on v2 and
    recomputed per tap on the Phase 1 legacy path (6.5). Constants:
    `contrastThreshold 0.0312`, `relativeThreshold 0.063`, `subpixelBlending 1.0`, edge steps
    `1.0, 1.5, 2.0, 2.0, 2.0, 4.0`, edge guess `8.0`. They are exposed as `FxaaOptions` with these
    defaults; the legacy `edgeThreshold/subpixelBlend` names are removed.
14. **SMAA (`smaa.glsl.ts`).** Three passes ported verbatim from three r185 `SMAAShader.js`: colour
    edge detection (`SMAA_THRESHOLD 0.1`), blending-weight calculation (AreaTex 160×560 RG8,
    SearchTex 64×16 R8, `SMAA_MAX_SEARCH_STEPS 8`, no diagonal search), neighbourhood blending.
15. **Finalize (`finalize.glsl.ts`).** Film grain is
    `n = (hash(uv*size + frame) - 0.5) * intensity * mix(1, 1 - luma, luminanceResponse)`, added in
    display space. Then RCAS sharpening when TAA/TAAU sharpness > 0 or renderScale < 1 (FSR1
    RCAS, limit 0.25). Then `+ triangularDither` (this lane's dither for the post path; the
    no-post dither inside OutputPass is C-05). Writes to the default framebuffer. Fused with
    FXAA when the mode is fxaa. On the Phase 1 legacy path the FXAA program (13) also applies
    `triangularDither`, because it is the last write.

## 9. Rendering changes

Every change below is gated by `A3D_QR_POST` (sub-flags `A3D_QR_POST_TAA`, `_SSR`, `_AO`, `_DOF`)
and lives in a lane 03 file unless marked "request". Flag off is byte-identical to today
(CONTRACTS §6.1). The PR 0b sentinel identity check proves it.

- `renderer/PostprocessExecution.ts` (carve of `Renderer.ts:977-1330`): with the flag on and
  `pipeline:"v2"`, it resolves the AA mode (`PostAntiAlias.ts`) and runs C-13 `registerPostPass`
  entries at their insertion points. It calls `executePostGraphWebGL2` (WebGL2) or
  `device.executePostGraph` (when lane 11 provides the WGSL twin). With `pipeline:"legacy"` or
  the flag off it runs today's chain unchanged. Forwarding `depthRange` (CCR-03-1) to
  `presentLdrPostprocess` is a declared correctness fix. It applies only with the flag on, so
  flag-off DOF/SSAO pixels are unchanged.
- Forward target (`Renderer.ts:595-618`, `:928-944`, lane 01) is **not edited**. The sample count
  arrives through the existing `postprocess.sampleCount` field (`Renderer.ts:611`). The RG16F
  velocity and R8 reactive attachments are requested from lane 01 as `RenderTargetDescriptor.colorAttachments`
  (pre-declared in PR 0a; the stub throws `RENDER_TARGET_FEATURE_PENDING:colorAttachments`,
  CONTRACTS §3.4). Until then S1 camera velocity is used (Q-01-2).
- `TemporalHistory.ts` keeps history ownership (history-a/b, jitter, commit/reset) but, with the
  flag on, no longer draws geometry (`:89-92`) and no longer throws on skinned/morph/instanced items
  (`:73-74`). `prepare()` returns the C-14 matrices. Coverage is reported in `velocityCoverage`. If
  a moving item lacks previous data, the frame uses msaa.
- `forward/Velocity.ts` (seam called by lane 01's `ForwardPass` per draw): it binds previous-frame
  uniforms, keeps the rigid previous-matrix cache, selects `drawBuffers` and counts moving items. It
  is a no-op unless the forward target has velocity attachments.
- `compiler/postprocess.ts` (carve of `createProductionRuntimePostprocess`) becomes
  `createRootPostPipeline(snapshot, camera, output, tierSettings)` from `postBridge.ts` when the flag
  is on. It reads every `effects.*` field of 7.1, throws on unsupported ones before the first frame,
  passes real camera clipping, expands `output.preset`, and resolves the AA mode by tier. The
  call site at `index.ts:14001` (lane 15's `compiler/renderInput.ts`) is unchanged, because the
  carved function keeps its name and signature.
- Aura Clash bypasses the root bridge through `GameRenderPreset.ts:372-386`/`:448-452`
  (`targetFormat:"rgba8"`, no operator → device default `"reinhard"` at `WebGL2Device.ts:1906`).
  The fix is lane 11's file: request Q-11-1 asks for `targetFormat` from C-05 `probeHdrTargetFormat`,
  an explicit operator, and V2 bloom values (`threshold 1.0`, `intensity 0.25`). Aura Clash joins
  the HDR path when it lands. Its vision tone score of 3 ("murky mid-grey") is the target to beat
  (integrated).
- Product viewer (`production-runtime/index.ts:1454-1641`, lane 15): its FXAA default
  `fxaa !== false` (`:1467`) with `edgeThreshold 0.09/subpixelBlend 0.24` (`:1641`) should follow
  the tier AA policy, and its exposure default 0.9 (`:1454`) should become `output.exposure` with
  operator `neutral`. This is request Q-15-2.
- Canvas creation (`index.ts:13586-13597`, `compiler/renderer.ts`, lane 15) and profiles
  (`app/rendererOptions.ts`, lane 11): `antialias:false`, `preserveDrawingBuffer:false`, and
  `app.screenshot()` via render-then-read (C-05 `capture()`). These are requests Q-15-1 and Q-11-1.
  The 6.1 cost card counts the saving but no standalone criterion depends on it.
- `WebGPUDevice.ts` (lane 11): `executePostGraph` WGSL twin from this lane's
  `post/shaders/*.wgsl.ts` (Q-11-2). Until it exists, `pipeline:"v2"` on WebGPU throws
  `POST_GRAPH_BACKEND_UNSUPPORTED:webgpu` before the first frame, unless every requested stage has
  WGSL.
- `LeanWebGL2Device.ts` (lane 15): imports the `post/shaders/*.glsl.ts` strings or is deleted
  (Q-15-3). It must not keep its own copy of the bloom/FXAA/SSAO/tone shaders.
---

## 10. Migration plan

1. **Ship v2 behind `A3D_QR_POST`.** With the flag off, everything is the legacy chain. With the
   flag on, `RendererPostProcessOptions.pipeline` defaults to `"v2"` (alias `pipeline:"v2"`;
   `compat:{post:"3.0"}` forces `"legacy"`). Any capture opts in with `--flags post` /
   `?a3d-qr=post` (C-33, CONTRACTS §5.2), so routes need no edit to be measured.
2. **Default flip** follows the CONTRACTS §5.3 flag states, not a phase of this PRD:
   `dev` → `standalone-accepted` when §"Standalone acceptance" passes in this lane's CI →
   `integrated-accepted` at a G-PANEL checkpoint → `default-on` after two clean checkpoints. Lane 15
   records the state. `compat: { post: "3.0" }` and `-post` restore legacy until removal (§5.4).
3. **Codemod `post-v2`** (`tools/quality-rebuild/codemods/post-v2.mjs`, registered through C-39
   `registerCodemod` from `packages/aura3d-cli/src/commands/prd03/index.ts`, run as
   `aura3d codemod post-v2 <files> --report|--write|--dry-run`). It is pure (`source → code + rows`).
   This lane runs it only in `--report`/`--dry-run` mode, on fixtures and on read-only copies.
   Lane 14 runs `--write` on routes (R21) and lane 13 on templates and examples (R20). Its default
   file list, not a glob, is: the 17 game `apps/showcase-<id>/src/main.ts` files named in section 5,
   `apps/aura-clash-showcase/src/**`, `examples/neon-corridor-strike/**` and `templates/**`. The
   10 non-game `apps/showcase-*` apps are excluded and listed in the dry-run output as
   "not migrated". It does the following:
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
   - Reports (does not remove) `pixelRatio: 0.7` in skyline-runner (`apps/showcase-skyline-runner/src/main.ts:1879`)
     as a `mapping: "approximate"` row with the reason. Removing it is lane 14's decision (Q-14-1).
   - Inserts `output: { preset: <mapped> }` using this mapping: courier, turbo, rooftop,
     skyline, neon-swarm, gallery-shift, pulse-tunnel, vault-breakers, blockfall, bank-shot →
     `neon-night`; aurora-lander, orbital-defense, gravity-post → `space`; deep-recovery →
     `underwater`; aura-clash, mech-hangar → `arena-fight`; siege-golf, patrol-wing →
     `daylight-outdoor`. Lane 14 may override any mapping per route (C-35 art direction).
   - Prints, per game, the material calls whose emissive luma × strength < 1.0. Lane 14 raises
     those values (6.6). The codemod does not auto-edit emissive values.
4. Per-game tuning, route edits and game evidence are lane 14's (C-35). This lane delivers the
   codemod, the per-game emissive report, flag-on captures of unmodified routes (`?a3d-qr=post`),
   and the facts below.
5. Skills/templates are lane 13's (R20). This lane appends C-40 facts to CONTRACTS Appendix B
   (append-only, no CCR): F-03-01 "`output: { preset }` replaces the bloom/grade/antiAlias tail";
   F-03-02 "never stack FXAA on MSAA/TAA; `antiAlias` default is `auto`"; F-03-03 "bloom
   threshold is linear HDR, default 1.0; do not author < 1 on lit scenes"; F-03-04 "emissive
   ≥ 2.5 to glow under neon-night"; F-03-05 "do not fix bloom blobs by lowering intensity; raise
   threshold or lower emissive". Each row stays `proposed` until its evidence column cites a passing
   test or capture run id.

## 11. Backward compatibility

| Surface | Change | Compatibility measure |
|---|---|---|
| `effects.bloom` threshold > 1 | now allowed | additive |
| `softKnee/shoulder/quality/maxIntensity/antiBlowout` | ignored or mapped | accepted with `deprecated` diagnostic for one minor release, then type error |
| `effects.antiAlias()` default mode | `"fxaa"` → `"auto"` | `mode:"fxaa"` still works and now means real FXAA *instead of* MSAA |
| `colorGrade.exposure/shadows/highlights/lut` | now applied | visible change (intended); games pass 1.02–1.06 → +2–6% brightness (19 §C12) |
| `effects.depthOfField.focus/aperture` | converted with real near/far | deprecated |
| `contactOcclusion` | alias | deprecated |
| `AuraRendererDiagnosticReport.toneMapping` | literal → C-05 union (lane 01) | widening; consumers comparing to `"aces-filmic"` must update (search `tests/**`, `tools/**`); this lane's new data is additive C-31 sections `post`/`exposure` |
| `qualityProfile` | mapped to C-27 tiers (lane 11) | deprecated |
| `pixelRatio: number` | unchanged meaning | object form added (C-38, lane 01/15) |
| `preserveDrawingBuffer` | false by default (Q-15-1, not this lane) | C-05 `capture()`; evidence tools (`tools/quality-rebuild-capture`, `tests/browser/*screenshot*`) must use `app.screenshot()`/`app.capture()` |
| CPU post exports | moved to `@aura3d/rendering/reference` | re-export with `@deprecated` from the old path until flag removal; dropping the root re-exports is Q-15-4 |
| `renderer.render` with `postprocess.execution:"cpu-deterministic"` | unchanged | still supported for golden tests |
| Legacy look | `A3D_QR_POST` off, `-post` in the flag list, or `compat:{post:"3.0"}` | until `A3D_QR_POST` is `removed` (CONTRACTS §5.4) |

Semver: the default flip is a visible-output change. It happens only through the CONTRACTS §5.3
state machine (`default-on` after two clean checkpoints). Whether it ships as a 3.x minor with
`compat` or in 4.0 is lane 15's release decision. It does not gate any lane 03 work.

## 12. Contracts consumed / provided

The earlier "Dependencies on other PRDs" list is replaced by contracts. Lane 03 builds against each
consumed contract's PR 0 stub and never waits for the provider's real implementation. What the stub
can and cannot show decides whether a criterion is standalone or integrated (§"Standalone
acceptance", §"Integrated acceptance").

### 12.1 Contracts provided

| ID | Name | Surface lane 03 provides | Stub that must keep working (PR 0a/0b, unchanged when `A3D_QR_POST` is off) | Real (lane 03 files) | Consumers |
|---|---|---|---|---|---|
| C-13 | PostPass registry, post pipeline, output presets | `registerPostPass`, `PostPassDescriptor`, `PostPipelineOptions`, `PostGraphReport`, `postPresets`, `AuraPostSurface` (`addPostPass`, `setQualityTier`), `AuraPostDiagnostics`, effect-factory field lists (7.1), `RendererPostProcessOptions.pipeline/v2`, `RenderDevice.executePostGraph?` | `registerPostPass` stores entries; existing chain runs (`executePostprocess`, `Renderer.ts:977`); registered passes listed in `post.skipped` with `post-graph-v2-pending`; `postPresets` = seven ids with `output: {}`, `effects: []`, `PRESET_PENDING`; `addPostPass` → `registerPostPass` | `post/PostGraph.ts`, `post/**`, `renderer/PostprocessExecution.ts`, `webgl2/LegacyPost.ts` (`executePostGraphWebGL2`), `agent-api/{postBridge,postPresets}.ts`, `compiler/postprocess.ts`, `nodes/effects.post.ts` | 02 (SSR placement, contact shadows as post input), 07 (god rays / volumetric composite), 08 (screen-feel), 09 (juice via C-05), 10 (underwater), 13 (looks/presets), 14 (games) |
| C-14 | Velocity and temporal history | `RenderItem` previous-frame fields + `writesReactive` semantics, `VELOCITY_MRT`, `TemporalHistoryLike`, `resetTemporalHistory`, `AuraApp.cutCamera` | fields inert; `resetTemporalHistory` calls the existing `temporalHistory.reset()`; chunks compile `o_velocity`/`o_reactive` out when the attachment is absent | `forward/Velocity.ts`, `TemporalHistory.ts`, `post/chunks/velocity.glsl.ts`, S1 camera velocity | 06 (skinned/morph velocity), 07 (reactive mask), 08 (cuts), 11 (instanced previous transforms) |

Registry entries lane 03 provides into other contracts: C-02 features `prd03.velocity` and
`prd03.indirectFraction` (chunks `a3d_prd03_*`); C-31 sections `post` and `exposure`; C-38 member
`post` and the flattened `addPostPass`, `setQualityTier`, `cutCamera`; C-39 codemod `post-v2`;
C-30 scenes `prd03-*`; C-36 option-coverage rows and `compiler/diagnosticOnly.prd03.ts`; C-40
facts F-03-*. Seams hosted in lane 03 files: `forward/Velocity.ts` `bindVelocityUniforms` (called by
`ForwardPass`) and `renderer/PostprocessExecution.ts` (C-13 seam).

Conformance: the custodian-owned suites `tests/unit/contracts/C-13-post.test.ts`,
`tests/unit/contracts/C-14-velocity.test.ts`, `tests/browser/contracts/C-13-post.spec.ts` and
`tests/browser/contracts/C-14-velocity.spec.ts` must pass for `stub` and `real`. Lane 03 adds
`tests/unit/contracts/impl/prd03-{post-graph,velocity,presets}.test.ts`.

### 12.2 Contracts consumed

| ID | Name / provider | What lane 03 uses | Day-0 stub behaviour relied on | Effect on acceptance |
|---|---|---|---|---|
| C-01 | FrameGraph phase hooks / 01 | ordering: `post-hdr` contributors run before the post graph | `post-hdr` runs immediately before `executePostprocess` (`Renderer.ts:680`), only with a post target; `sceneDepth.available = false` | standalone (the graph reads its own depth) |
| C-02 | ProgramFeatures, chunk registry, ProgramCache / 01 | `registerShaderChunk/Feature` for `prd03.velocity`, `prd03.indirectFraction`; `ChunkHarness` | registries real; `generateProgram` throws `PROGRAM_GENERATOR_PENDING`; cache wraps `ShaderLibrary` | chunk compile standalone; forward MRT velocity and `f_ind` pixels integrated |
| C-04 | BlendMode / RenderCommandState / 01 | `blendFuncSeparate(..., ZERO, ONE)` for transparent `f_ind` preservation | ignored by `WebGL2Device` | integrated (only matters with `f_ind`) |
| C-05 | Output: HDR target, tone mapping, exposure, coverage, overlay / 01 | `OutputPassLike` (single tone map), `AuraOutputOptions`, `DEFAULT_TONE_MAPPING`, `probeHdrTargetFormat`, `capture()`, `AuraOutputDiagnostics` | `setOutput` → existing present shader; unsupported operator → `aces` + `capability-degraded`; `probeHdrTargetFormat` = rgba16f if `hdr-render-targets` else rgba8; no OutputPass instance (lane 03 uses `createLegacyOutputPass` from `post/LegacyOutputAdapter.ts`/`webgl2/LegacyPost.ts`, CCR-03-5) | ACES paths standalone; AgX/Neutral parity, background passthrough for non-ACES, no-post operator integrated |
| C-08 | Frame uniforms + CameraLike / 01 | camera near/far/projection | `buffer: null`; post keeps `{near:0.1, far:1000}` (`WebGL2Device.ts:865`) | standalone anyway: the bridge passes real clipping (6.11, CCR-03-1) |
| C-18 | Deformation resources / 06 | `palette.previous` → `previousJointTexture`; morph weight history | palette code moved verbatim; no previous palette; morph `fallback: "cpu"` | skinned/morph per-object velocity integrated; moving skinned items fall back to msaa standalone |
| C-21 | Sky / fog / atmosphere / 07 (optional read) | sun direction for god rays when a sky node exists | stub sky; absent → strongest directional light | standalone with directional light |
| C-22 | CameraRig live API / 08 | `cut()` → `resetTemporalHistory` | `cut()` already calls C-14 `resetTemporalHistory` | standalone (`app.cutCamera`); real-rig cuts integrated |
| C-23 | Time controller, screen-feel uniforms / 08 | screen-feel uniforms (punch vignette/CA) in S10b; `timeScale` for motion-blur shutter | uniforms published, visible only in `diagnostics().camera.screenFeel`; `AuraTimeController` real | standalone wiring; feel-driven post integrated |
| C-27 | QualityTier settings / 11 | `QUALITY_TIERS` (`msaaSamples`, `postAntiAlias`, `ambientOcclusion`, `ssr`, `bloomMipLevels`, `maxPixelRatio`, `minRenderScale`), `app.quality`, `AuraQualityTier` | table ships real (data); `"auto"` → high desktop / medium coarse pointer; `forceRenderScale` via canvas sizing | standalone |
| C-28 | Device capabilities / 11 | `counters().readbacks` (zero-readback gate), `renderTargetPoolSlot`, timer `gpuMs` | `readPixels` wrapped in `webgl2/Counters.ts`; pool allocates per acquire; `gpuMs` null | standalone (readbacks); per-stage GPU ms best-effort |
| C-29 | Renderer factory / backends / 11 | backend kind for `executePostGraph` dispatch | today's selection | WebGL2 standalone; WGSL parity integrated |
| C-30 | Benchmark registry / 12 | lane scenes `prd03-*` in lane indices, `ReadyPayloadV2.qrFlags` | registry wraps 18 base scenes + lane indices | standalone (own scenes); scene 18 bloom mapping via Q-12-2 |
| C-31 | Diagnostics sections / 12 | `registerDiagnosticsSection("post" \| "exposure")` | sections present with null/empty values; `qrFlags`, `degradations` real | standalone |
| C-32 / C-33 | Judgement schema, capture harness / 12 | capture `--flags post`, `qr_flags`; G-PANEL rubric | today's capture scripts + `--flags` passthrough (PR 0b-3) | screening standalone; acceptance only at G-PANEL (integrated) |
| C-36 | SceneCompiler extension points / 15 | `SceneCompileContext.flags/quality`, `degrade()`, `DIAGNOSTIC_ONLY_FIELDS`, `registerOptionCoverage` | wraps the moved legacy compiler | standalone |
| C-38 | App surface extension registry / 15 | `registerAppExtension({ member: "post" })`, flattened methods, pre-declared options (`output`, `compat`, `pixelRatio`, renderer `quality`, `renderScale`) | real in PR 0 | standalone |
| C-39 | CLI command + codemod registry / 15 | `registerCodemod(post-v2)` | real in PR 0 | standalone |
| C-40 | Facts handoff / each lane → 13 | rows F-03-01..05 | append-only table | — |

Not consumed, by design: C-09/C-10/C-11 (HDR IBL and lighting change what there is to bloom and
tone-map, but no lane 03 code reads them; their effect shows up only in integrated scores), and C-15
(emissive strength; lane 03 scenes author emissive explicitly, 6.6).

Resolved conflicts from CONTRACTS §0 that changed this PRD: R1 (tiers from C-27), R2 (single tone
map in lane 01's OutputPass; grade split around it, 6.7), R20 (no template/skill edits), R21 (no
route edits; codemod plus reports), and §3.8 (scene ids `prd03-*`, not 19-25).

### 12.3 Requests to other lanes (non-blocking)

Filed as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). Lane 03 never waits: each row says
what lane 03 does in the meantime and which criterion moves to the checkpoint after the request
lands.

| ID | To | File / change | Contract | Meanwhile (lane 03) |
|---|---|---|---|---|
| Q-01-1 | 01 | Transparent/additive draws use `RenderCommandState` blend `(srcRGB, dstRGB, ZERO, ONE)` when feature `prd03.indirectFraction` is active | C-04 | AO fallback strength (6.3); `f_ind` criteria integrated |
| Q-01-2 | 01 | Implement `RenderTargetDescriptor.colorAttachments` for the post forward target: RG16F at location 1, R8 at location 2 (C-14 `VELOCITY_MRT`), `clearBufferfv` to 0 per frame, allocated only when TAA or motion blur is active | C-14, §3.4 | S1 camera-reprojection velocity; moving items force msaa |
| Q-01-3 | 01 | `SceneOptimization.ts:207-217`: double-buffer instance transforms and fill `RenderItem.previousInstanceTransforms` | C-14, C-07 | moving instanced items force msaa; `velocityCoverage` reports them |
| Q-01-4 | 01 | `app/colorManagement.ts` (`index.ts:4192-4214`): apply `sceneExposurePresets`/`defaultExposure` as the `output.exposure` default (value 1.0) or delete them | C-05 | `exposure` section reports the sent value; the stale preset stays visible in legacy fields |
| Q-01-5 | 01 | At `A3D_QR_POST` removal: delete `canFuseLdrPostprocess`/`ldrFusionPassRank` (`Renderer.ts:2111-2137`) and the FXAA branch of the present shader (`WebGL2Device.ts:3613-3631`) | §5.4 | dead code stays behind the flag |
| Q-01-6 | 01 | `app.setOutput()` forwards `preset` and `autoExposure` to `app.post` (C-13) and accepts this lane's coverage target in `OutputPass.execute` | C-05, C-13 | preset/autoExposure read at create time from `options.output` and from effect nodes |
| Q-01-7 | 01 | Contingency: if a PR 0b-2 carve of `WebGL2Device.ts` (`:871-1110`, `:2838-3409`) is dropped as non-verbatim (CONTRACTS §3.9), apply the Phase 1 FXAA split and the depth-range forwarding in the device on lane 03's patch | §3.4 | lane 03 keeps the code in `post/` and wires it after the patch |
| Q-01-8 | 01 | Contingency: if `normalizeNativeBloomOptions` (`WebGL2Device.ts:4481`) is not inside the 0b-2 carve, accept threshold [0,64] / knee [0,1] when the v2 graph is not used and the flag is on | §3.4 | v2 graph uses its own validator; legacy chain keeps the 0.5 cap |
| Q-02-1 | 02 | Lighting chunk exposes `a3dIndirectRadiance` (ambient + IBL diffuse + IBL specular) for `prd03.indirectFraction`; SSR registers as a C-13 `before-taa` pass; contact shadows replace the deleted contact-shadow post pass | C-02, C-13, C-11 | AO fallback; SSR stays on the legacy chain; contact-shadow requests get a deprecation diagnostic |
| Q-06-1 | 06 | Fill `previousJointTexture` (C-18 `palette.previous`) and `previousMorphWeights` on deformed items | C-14, C-18 | moving skinned/morph items force msaa |
| Q-07-1 | 07 | `VolumetricFog.ts:105-144`: delete the CPU radial blur, or register a volumetric composite through C-13 | C-13 | bridge maps `effects.volumetricFog` to S4 when the flag is on; CPU path no longer runs |
| Q-07-2 | 07 | `nodes/effects.ts`: `depthOfField`, `motionBlur`, `cinematicBloom` pass through the C-13 frozen field lists (7.1) and set `postAuthored`; or transfer these three factories to `nodes/effects.post.ts` (lane 03) in a move-only PR | C-13, C-36 | DOF uses legacy `focus/aperture` converted with real near/far; physical DOF and MB `maxBlur` tested at renderer level (`RendererPostProcessOptions.v2`); engine-level DOF criteria integrated |
| Q-07-3 | 07 | Particle and transparent VFX items set `RenderItem.writesReactive = true` | C-14 | luminance-delta reactive heuristic (6.5) |
| Q-11-1 | 11 | `GameRenderPreset.ts:372-386`, `:448-452`: `targetFormat` from C-05 `probeHdrTargetFormat`, explicit operator, V2 bloom (`threshold 1.0`, `intensity 0.25`); `app/rendererOptions.ts` profiles `antialias:false`, `preserveDrawingBuffer:false` | C-05, C-27 | Aura Clash measured on its current path; criteria integrated |
| Q-11-2 | 11 | `WebGPUDevice.executePostGraph` from `post/shaders/*.wgsl.ts`; LUT bake via compute into `texture_storage_3d` | C-13, C-29 | v2 throws `POST_GRAPH_BACKEND_UNSUPPORTED:webgpu`; WGSL strings unit-validated |
| Q-11-3 | 11 | Real-device runs (desktop + mobile, §17/§19) through the C-28 lab | C-28 | paravirtual deltas only; budgets are targets, not claims |
| Q-12-1 | 12 | `tools/quality-rebuild-capture`: viewport `desktop-1440x900@2` and `backingRatio = w / cssW` in the slim report | C-33 | `qr-prd03-captures.yml` captures DSF 2 with Playwright directly into `evidence/prd03/` |
| Q-12-2 | 12 | `aura3d/common.ts:254-256`: map three `UnrealBloomPass` through `mapThreeUnrealBloom` (from `aura3d/scenes/prd03/bloomMapping.ts`), drop `quality:"cinematic"`; update capability-log lines `:131-135` | C-30 | scene 18 bloom measured from a lane 03 copy of the scene (`prd03-scene18-bloom`) |
| Q-12-3 | 12 | Post criteria in the C-32 rubric (bloom halo, banding, edge crawl, ghosting) | C-32 | lane 03 pixel metrics in its own tests |
| Q-13-1 | 13 | Skills/templates from F-03-*; run `post-v2` on `templates/**` and `examples/neon-corridor-strike/**`; `templates/mini-game` gets `output:{preset:"neon-night"}` once it is off the inert lean renderer (05 §9.5) | C-40, C-39 | — |
| Q-14-1 | 14 | Per route: `post-v2 --write`, emissive retune from the report, skyline-runner `pixelRatio: 0.7` decision, opt into `A3D_QR_POST`; Aura Clash `AuraClashArenaApp.ts:898,1422` | R21, C-39 | lane 03 captures unmodified routes with `?a3d-qr=post` |
| Q-15-1 | 15 | `compiler/renderer.ts` (`index.ts:13586-13597`): `antialias:false`, `preserveDrawingBuffer:false`; `app.screenshot()` renders then reads (C-05 `capture()`) | C-05 | lane 03 specs read pixels inside a frame callback |
| Q-15-2 | 15 | `index.ts:4547` warning removal, overlay `:18657` text, clear-color inversion `:15400-15418` removal once C-05 passthrough is real, product-viewer post (`production-runtime/index.ts:1454-1641`) on the tier AA policy | C-05, C-13 | diagnostics sections are truthful; legacy strings remain |
| Q-15-3 | 15 | `LeanWebGL2Device.ts` imports `post/shaders/*.glsl.ts` or is deleted | §3.8 | lean keeps old shaders (risk row) |
| Q-15-4 | 15 | `packages/rendering/src/index.ts`: stop root re-exporting the CPU kernels moved to `reference/` | §3.8 | `@deprecated` re-exports; bundle criterion integrated |

### 12.4 Contract Change Requests

Each CCR is additive (CONTRACTS §6.4: custodian 15 + provider + one consumer, merged within one
working day). Lane 03 codes against the pre-CCR shape with runtime narrowing until each merges.

| ID | Contract | Change | Why |
|---|---|---|---|
| CCR-03-1 | C-13 | `RendererPostProcessOptions.depthRange?: { near; far; projection }` | real depth range on the legacy chain without waiting for C-08 |
| CCR-03-2 | C-13 | `AuraAutoExposureOptions.compensationEv?`; `PostPipelineOptions.autoExposure?` | auto-exposure has no slot in the frozen pipeline options |
| CCR-03-3 | C-13 | Concrete types for the `unknown` members (`GtaoOptions`, `BloomOptionsV2`, `TaaOptions`, `DofOptions`, `MotionBlurOptions`, `GodRayOptions`, `ColorGradeOptionsV2`, `LutTexture3D`); any 7.1 `AuraEffectNode` field PR 0a did not pre-declare, plus `postAuthored` | allowed "concrete types replacing unknown" CCR |
| CCR-03-4 | C-27 (value) | High `postAntiAlias: "taa"` (MSAA fallback) | only with checkpoint evidence of 100% velocity coverage on High scenes; lane 11 approves |
| CCR-03-5 | C-05 | `outputPassSlot: ContractSlot<OutputPassLike>` whose stub is `createLegacyOutputPass(device)` | the post graph needs an OutputPass instance; C-05 defines only the interface |
| CCR-03-6 | C-36 | `SceneCompileContext.output?: AuraOutputOptions` (only if PR 0b-1 does not already expose create options to handlers) | the bridge must read `options.output` at compile time |

---

## Parallel execution

### Day-0 start conditions

Lane 03 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are
PR 0a artifacts:
- `packages/rendering/src/contracts/{core,frameGraph,program,blend,output,frameUniforms,post,velocity,deform,quality,device,rendererFactory,renderItem,index}.ts`
  and `contracts/testing/ChunkHarness.ts`.
- `packages/engine/src/contracts/{flags,output,post,diagnostics,compiler,app,camera,time,index}.ts`
  and their `stubs/*.ts`.
- The pre-declared fields named in C-13 and C-14: `RendererPostProcessOptions.pipeline/v2`,
  `RenderDevice.executePostGraph?`, the `RenderItem` previous-frame fields, `AuraEffectNode` post
  fields, and the C-38 options and flattened methods.
- Lane files: `packages/{rendering,engine}/src/lanes/prd03.ts`,
  `agent-api/compiler/diagnosticOnly.prd03.ts`,
  `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd03/index.ts` and
  `packages/aura3d-cli/src/commands/prd03/index.ts`.
- The conformance harness (`tests/unit/contracts/harness.ts`).

Nothing from any other lane's real implementation is needed.

Work in new lane 03 files (`post/**`, `reference/`, `postBridge.ts`, `postPresets.ts`, chunks,
lane scenes, codemod, workflows, tests) starts on day 0. Edits to carved regions start when the
PR 0b part that contains them merges (≤ 2026-10-07). Until then the replacement is written in the
lane's own module and wired after the merge:
- PR 0b-1: `compiler/postprocess.ts`, `nodes/effects.post.ts`, and the C-31/C-36/C-38 seams.
- PR 0b-2: `renderer/PostprocessExecution.ts`, `webgl2/LegacyPost.ts`, `forward/Velocity.ts`
  (`bindVelocityUniforms` seam), and the C-01/C-13/C-28 seams.
- PR 0b-3: capture `--flags` / `qr_flags` (C-33) and the C-39 CLI fallthrough.

If a carve-out is dropped from PR 0b because it cannot be kept verbatim (CONTRACTS §3.9 size
budget), the region stays with its hot-file owner and the lane 03 change becomes a request. The
lane keeps working in its own modules.

### Owned files and directories (exactly CONTRACTS §4.1, row 03 plus "lane NN")

`packages/rendering/src/{post,postprocess,reference}/`, `packages/rendering/src/renderer/PostprocessExecution.ts`,
`packages/rendering/src/forward/Velocity.ts`, `packages/rendering/src/webgl2/LegacyPost.ts`,
`packages/rendering/src/cinematic/{BloomPass,VignettePass,FilmGrainPass,DepthHazePass}.ts`,
`packages/rendering/src/webgpu/WebGPUPostShaders.ts`, `packages/rendering/src/RendererPostprocessPlan.ts`,
`packages/rendering/src/PostProcessPass.ts`, `packages/rendering/src/TemporalHistory.ts`;
`packages/engine/src/agent-api/{postBridge,postPresets}.ts`, `packages/engine/src/agent-api/compiler/postprocess.ts`,
`packages/engine/src/agent-api/nodes/effects.post.ts`; `apps/postprocessing-*`;
`tools/quality-rebuild/codemods/`; `.github/workflows/post-quality.yml`.
Lane-generic: this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd03,prd-03}/`,
`packages/*/src/lanes/prd03.ts`, `agent-api/compiler/diagnosticOnly.prd03.ts`,
`packages/aura3d-cli/src/commands/prd03/`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd03/`,
`.github/workflows/qr-prd03-*.yml`, `tests/qr/prd03/`, `tests/unit/contracts/impl/prd03-*`. New test
files lane 03 creates (`tests/unit/rendering/post-*.test.ts`, `tests/browser/post-*.spec.ts`) are
its own under the "creator" rule. Two existing tests are also lane 03's, because their first imported
module is: `tests/unit/rendering/native-bloom-pyramid.test.ts` (`postprocess/`) and
`tests/unit/rendering/temporal-history-lifecycle.test.ts` (`TemporalHistory.ts`).

The new workflow `.github/workflows/qr-prd03-captures.yml` falls under the lane-generic
`qr-prdNN-*.yml` rule. Note the near-collision `tools/quality-rebuild-codemods/` (lane 01) versus
`tools/quality-rebuild/codemods/` (lane 03). This lane writes only the latter.

Tasks of the earlier draft that edited files owned by other lanes are now handled as follows:
- **Moved to seams or own modules:** AA sample count → `postprocess.sampleCount`; velocity →
  C-02 chunks + `forward/Velocity.ts`; f_ind → C-02 chunk; FXAA → own program run from
  `LegacyPost.ts`; exposure/depth range → `compiler/postprocess.ts`; diagnostics → C-31 sections;
  `cutCamera`/`addPostPass`/`setQualityTier` → C-38 extension; lane scenes → C-30 lane index.
- **Moved to §12.3 requests:** `Renderer.ts` forward target and fusion helpers, `ShaderLibrary*.ts`,
  `SceneOptimization.ts`, the present shader in `WebGL2Device.ts`, `app/colorManagement.ts` (01);
  lighting chunk (02); deform palette (06); `VolumetricFog.ts`, `nodes/effects.ts` (07);
  `GameRenderPreset.ts`, `app/rendererOptions.ts`, `WebGPUDevice.ts` (11); capture tool,
  `shared/scenes.ts`, `aura3d/common.ts` (12); templates, skills, examples (13); showcase routes
  and Aura Clash (14); `index.ts` remainder, `compiler/renderer.ts`, `production-runtime/index.ts`,
  `LeanWebGL2Device.ts`, `packages/rendering/src/index.ts` (15).
- **Moved to C-05 (lane 01's real implementation), no longer a lane 03 task:** real AgX/Neutral
  GLSL, the operator enum, the no-post tone curve, dithering inside OutputPass, `app.setOutput`
  and `capture()`. DPR detection is C-27 `maxPixelRatio`, applied by lane 01. The old "lands the
  DPR fix if PRD 01 has not" task is withdrawn.

### Extension points used in files owned by others

| Host file (owner) | Extension point | What lane 03 puts through it |
|---|---|---|
| `Renderer.ts` (01) | carve-out call into `renderer/PostprocessExecution.ts`; existing `postprocess.sampleCount`; C-01 `post-hdr` ordering | the whole post graph; AA sample count |
| `ForwardPass.ts` (01) | `bindVelocityUniforms?.(item, uniforms)` per draw (§3.3 seam) | previous matrices, `drawBuffers` selection, moving-item counts |
| `WebGL2Device.ts` (01) | carve-out `webgl2/LegacyPost.ts`; optional `executePostGraph` delegate (C-13 seam) | Phase 1 FXAA split, `executePostGraphWebGL2` |
| `ShaderLibrary*.ts` / generator (01) | C-02 `registerShaderFeature`/`registerShaderChunk` | `prd03.velocity`, `prd03.indirectFraction` |
| `agent-api/index.ts` (15) | §3.2 carves `compiler/postprocess.ts`, `nodes/effects.post.ts`; C-31 `registerDiagnosticsSection`; C-38 `registerAppExtension`; C-36 option coverage | bridge, factories, diagnostics, app methods |
| `RenderDevice.ts` (11) | pre-declared optional `executePostGraph?` | v2 dispatch |
| `aura3d-cli/src/cli.ts` (05) | C-39 `registerCodemod` fallthrough | `post-v2` |
| `benchmarks/quality-rebuild/shared/registry.ts` (12) | C-30 lane index | `prd03-*` scenes |
| `tools/quality-rebuild-capture/*` (12) | C-33 `--flags`, `qr_flags` | flag-on captures of unmodified routes |
| CONTRACTS Appendix B (15) | C-40 append-only rows | F-03-01..05 |

### Feature flags

| Flag | Values | Gates | PRD-local alias |
|---|---|---|---|
| `A3D_QR_POST` | bool | every lane 03 behaviour change: v2 graph, bridge v2 (exposure, depth range, AA policy, throw-on-unsupported), FXAA split on the legacy chain, readback block, TemporalHistory no-redraw, presets, C-31 sections | `RendererPostProcessOptions.pipeline: "v2" \| "legacy"`, `compat.post: "3.0"` (inverse) |
| `A3D_QR_POST_TAA` | bool | TAA/TAAU and S1 camera velocity | `antiAlias({mode:"taa"})` |
| `A3D_QR_POST_AO` | bool | GTAO (S2) | — |
| `A3D_QR_POST_SSR` | bool | SSR placement in the HDR graph | — |
| `A3D_QR_POST_DOF` | bool | physical DOF (S6) | — |

Sub-flags take effect only with `A3D_QR_POST` on. Motion blur, god rays, SMAA and auto-exposure have
no sub-flag. They are controlled by their effect nodes and the tier. Flag state is recorded in
`contracts/flags.state.ts` by lane 15 at checkpoints (CONTRACTS §5.3).

### Stubs used

C-01 (`post-hdr` before `executePostprocess`), C-02 (`PROGRAM_GENERATOR_PENDING`; registries and
ChunkHarness real), C-04 (blend state ignored), C-05 (legacy present shader; non-ACES → ACES;
`createLegacyOutputPass` stands in for OutputPass), C-08 (`buffer: null`, post literal 0.1/1000,
bypassed by the bridge), C-18 (no previous palette), C-21 (optional), C-22 (`cut()` →
`resetTemporalHistory`), C-23 (screen-feel uniforms published to diagnostics), C-27 (real data,
auto = high/medium), C-28 (partial counters, wrapped `readPixels`, allocate-per-acquire pool),
C-29 (today's backends), C-30/C-31/C-33 (registry, empty sections, `--flags` passthrough),
C-36 (legacy compiler wrap), C-38/C-39 (real). Lane 03's own stubs (C-13, C-14) stay the flag-off
path until `A3D_QR_POST` is removed (CONTRACTS §5.4).

### Requests to other lanes (non-blocking)

Listed in §12.3 (Q-01-1 … Q-15-4) and §12.4 (CCR-03-1 … CCR-03-6). None of them gates a lane 03
merge. Each one moves at most one criterion from standalone evaluation to the next integration
checkpoint after it lands.

### Integration checkpoints

Integrated acceptance (§"Integrated acceptance") is evaluated only at CONTRACTS §7 checkpoints,
with `A3D_QR_POST` on inside `qr_flags=all`. It never blocks a lane 03 merge.
- IC-0 (2026-10-08): flags `none` baseline. Lane 03 records per-scene, per-game, readback and
  bundle baselines from it.
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): screening only. These rounds are vision-only and
  recorded, and they cannot accept. They also capture `all,-post` for attribution when requested.
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds. Only these can move
  `A3D_QR_POST` to `integrated-accepted` and satisfy integrated criteria. Leave-one-out
  (`all,-post`) attributes regressions.

A checkpoint failure becomes a `qr-ic-regression` issue against the owning lane (CONTRACTS §7).

---

## 13. Implementation phases

Rules for every phase:
- Each phase merges to main independently, behind `A3D_QR_POST`, and changes no flag-off pixel. The
  PR 0b sentinel identity check (CONTRACTS §6.1) proves this on every PR.
- Exit criteria are **standalone**: they can be passed by this lane alone, against the stubs. The
  integrated criteria each phase feeds are listed in §"Integrated acceptance" and are evaluated
  only at checkpoints.
- "Captured" means a run of this lane's `.github/workflows/qr-prd03-captures.yml` (macos-14, ANGLE
  Metal). The run uses `tools/quality-rebuild-capture` with `--flags post` where C-33 allows it,
  and a lane Playwright spec for DSF 2 until Q-12-1 lands. Artifacts are committed under
  `docs/project/aura3d-quality-rebuild/evidence/prd03/<phase>/`.
- No phase waits for another lane. Phase 0 and Phase 1 both start on day 0. Phases 2–7 need only
  earlier lane 03 phases and can overlap.

**Phase 0: scaffolding, baseline and truthful diagnostics (day 0; no pixel change).**
- Lane barrels and slot wiring: `postSlot.provide`/`velocitySlot.provide`, gated by `A3D_QR_POST`.
  The real implementations are initially thin, passing the C-13/C-14 conformance suites.
- `registerDiagnosticsSection("post" | "exposure")`, reporting what executes on the legacy chain.
- `post/ToneOperators.ts` with goldens.
- Lane scenes `prd03-*` with three.js references.
- `post-quality.yml` and `qr-prd03-captures.yml`.
- The `post-v2` codemod registered in report-only mode.

*Exit:*
- C-13/C-14 conformance passes for `stub` and `real`.
- A baseline capture of 18 games × {DSF1, DSF2, mobile DSF3} with flags `none` and of the 7 lane
  scenes is committed.
- The `post` section matches the 2.6 census for all 18 games. For example, deep-recovery shows
  `volumetric-light: cpu-readback`, and every other pass in its chain shows the same, because fusion
  is all-or-nothing. 16 games show `exposure.applied: 1` despite authored 1.02–1.06.
- The bundle baseline for every gated target in `tests/reports/bundle-size.json` is recorded in
  `evidence/prd03/phase0/bundle.json`.

**Phase 1: correctness fixes on the existing chain (day 0 in own modules; wired once PR 0b-1/0b-2
merge, ≤ day 2).**
- In `compiler/postprocess.ts`:
  - wire exposure (6.4);
  - pass the real depth range (6.11, CCR-03-1);
  - set the AA mode from the tier (never FXAA on MSAA; MSAA pixel guard via `sampleCount`);
  - interpret `antiAlias` without a `mode` in `postAuthored` as `auto`.
- In `webgl2/LegacyPost.ts`, split the present into two draws:
  1. the legacy present program with `u_hasFxaa = 0` into a pooled RGBA8 target;
  2. the three r185 FXAA port plus `triangularDither` to the output.

  FXAA cannot stay inside the present shader: it would re-run tone map + grade (`finalColorAt`)
  for each of its taps (`WebGL2Device.ts:3618-3621`).

*Exit:*
- The 15.1 unit tests for these items pass.
- `prd03-tone-ramp` with ACES matches three r185 within ΔE2000 mean ≤ 1.0.
- `prd03-thin-aa` FXAA edge crawl is ≤ three `FXAAPass` × 1.2.
- `prd03-night-fog-banding` has no contour steps > 1 LSB on the FXAA path.
- With flags `none`, the sentinel identity check passes.

**Phase 2: PostGraph, HDR ordering, bloom V2, linear composite + OutputPass + display LUT.**
- `PostGraph`, `PostResources` (cached over the C-28 pool), S1, S9, S10, OutputPass through
  `createLegacyOutputPass` (CCR-03-5 slot when merged), S10b, S12.
- `postBridge.ts` with throw-on-unsupported, `postAuthored` defaults, and `bloomNormalization`
  replacing the gains.

*Exit:*
- `prd03-hdr-bloom`: for strengths 2/4/8, halo energy is proportional to excess within ±10%, and
  added luma ≤ 0.5% below the knee.
- `prd03-scene18-bloom`, a lane copy of base scene 18 held out from calibration: halo energy within
  ±15% of three.
- `mapThreeUnrealBloom` is fitted on `prd03-hdr-bloom` only and frozen before the scene-18 copy is
  measured.
- The display LUT is within 1 LSB of the analytic display grade.
- Courier Rush captured with `?a3d-qr=post`, route unmodified: van region ≤ 2% pixels at
  (255,255,255). This is a pixel metric, not a vision claim.
- `pnpm check:bundle-size` passes for every gated target. The cinematic-scene starter has 1,497 B of
  headroom, so v2 modules load through `import()` only when v2 is selected.

**Phase 3: GTAO, GPU god rays, grain/CA/vignette, CPU readback removal.**
- S2 with the 6.3 fallback (and `f_ind` when the feature is active), S4, CA in S10, grain in S12.
- New factories `vignette`, `filmGrain`, `chromaticAberration`.
- Readback block in `PostprocessExecution.ts`; CPU kernels moved to `reference/`.

*Exit:*
- Deep Recovery captured with `?a3d-qr=post` at 1280×720: median frame time drops from 849.9 ms to
  ≤ 50 ms on the same runner (≥ 17×), with god rays visible.
- Zero `readPixels` calls across 300 interactive frames in each of the 18 games with `?a3d-qr=post`.
  This is checked by C-28 `counters().readbacks` and by a `WebGL2RenderingContext.prototype.readPixels`
  spy.
- `prd03-ao-grounding`: luminance within 10 cm of contact is ≥ 15% darker than AO off, and the open
  floor 1 m away changes by ≤ 2%.

**Phase 4: TAA/TAAU, motion blur, DOF, temporal plumbing.**
- `TemporalHistory` no-redraw; S1 camera velocity; S5, S6, S7.
- `app.cutCamera`.
- `forward/Velocity.ts` (rigid cache, moving-item count) and the `prd03.velocity` chunk validated
  in ChunkHarness.

*Exit:*
- `prd03-taa-motion`, static-camera part: a 1-px line has temporal luma stddev ≤ 0.01.
- On a camera pan over static geometry, ghost trail ≤ 2 px.
- After `cutCamera()`, the next frame equals a no-history frame within 2 LSB.
- TAAU at scale 0.67 on `prd03-thin-aa` has edge error ≤ 1.3× full-res TAA.
- Motion-blur length on a camera pan at 30 vs 60 simulated fps differs by ≤ 10%.
- `prd03-dof-bokeh`, driven through `RendererPostProcessOptions.v2` until Q-07-2: focus plane
  within 2 LSB of no-DOF, and bokeh diameter 12.3 px ±15%.
- A frame with a moving item that lacks C-14 data falls back to msaa, with `TAA_VELOCITY_COVERAGE`
  reported.

**Phase 5: presets, C-27 tier mapping, codemod and reports, facts.**
- `postPresets`, `PostQualityTiers.ts`, `setQualityTier`, `post-v2` complete with the emissive
  report, and F-03 rows appended.

*Exit:*
- Every C-27 tier × post cell has a unit test.
- Preset expansion and override order are deterministic.
- Codemod fixtures pass and touch no non-game app.
- All 18 unmodified routes captured with `?a3d-qr=post` at DSF1/DSF2/mobile show no black frame,
  crash or console error.
- Each game's DSF1 median frame time with `post` is no worse than with `none` by more than 10%. A
  stage that the tier newly enables (GTAO, TAA) is reported separately as an on/off delta.
  Deep Recovery is judged by the Phase 3 target instead.
- After this exit, lane 03 asks lane 15 to record `A3D_QR_POST` as `standalone-accepted`
  (CONTRACTS §5.3).

**Phase 6: SMAA, auto-exposure, custom passes.**
- S11 SMAA with lazy textures, S8 auto-exposure, `addPostPass`/`registerPostPass` at all five
  insertion points, `apps/postprocessing-custom`, and the `apps/postprocessing-bloom` HDR demo.

*Exit:*
- SMAA edge error on `prd03-thin-aa` is ≤ FXAA and within 10% of three `SMAAPass`.
- Auto-exposure converges within 1.5 s on `prd03-tone-ramp` 21b, with zero readbacks.
- A test pass registered at each insertion point executes in order, and a `display` pass before
  tonemap is rejected with `POSTPROCESS_SPACE_INVALID`.

**Phase 7: WGSL sources.**
- A `post/shaders/*.wgsl.ts` mirror for every v2 stage.
- `WebGPUPostShaders.ts` (lane 03's file): exposure becomes a linear multiplier (today `exp2`,
  `:253`), and the 2-tap "FXAA" (`:262-316`) and the uncapped soft-knee mirror (`:224`) are deleted.

*Exit:*
- Every WGSL string compiles with zero errors from `GPUShaderModule.getCompilationInfo()` in the
  lane spec `tests/qr/prd03/wgsl-compile.spec.ts` (Chromium with WebGPU on macos-14).
  `tools/wgsl-validate/` is listed under lane 11 in CONTRACTS §4.1 but does not exist at
  `7992a0dd`. Once lane 11 adds it, this lane runs it too.
- The WebGPU execution itself is Q-11-2. Its parity is integrated.

**Phase 8: flag removal (only after `A3D_QR_POST` has been `default-on` for two checkpoints,
CONTRACTS §5.4).**
- In lane 03 files, delete the legacy programs in `webgl2/LegacyPost.ts`, the LDR bloom LUTs,
  `postprocess/NativeLdrEffectLuts.ts`, `resolveBloomPyramidResponseGain`, the CPU readback branch
  and `compat.post`.
- File Q-01-5, Q-15-3 and Q-15-4 for the other lanes' halves.

*Exit:*
- Every gated target in `tests/reports/bundle-size.json` (lean core ≤ 80,000 B, product-viewer
  ≤ 250,000 B, cinematic-scene ≤ 400,000 B, mini-game ≤ 250,000 B gzip) is at or below its Phase 0
  baseline.
- `rg` finds no `subpixelBlend` or `ResponseGain` in lane 03 paths.

---

## 14. Task checklist

Every item edits only lane 03 paths (§"Parallel execution"). Each item states its file, change and
test. "Flag on" means `A3D_QR_POST` resolved on through `resolveQrFlags`. All browser tests run
remotely (§15.2).

Phase 0 (day 0)
- [x] `packages/rendering/src/lanes/prd03.ts` and `packages/engine/src/lanes/prd03.ts`: import the
  C-13/C-14 slots from `contracts/` and call `provide()` with `post/PostGraph.ts`/`forward/Velocity.ts`
  facades that delegate to the stub behaviour for now. Test: `tests/unit/contracts/impl/prd03-post-graph.test.ts`
  asserts that `slot.get(flags)` returns real only with `A3D_QR_POST` on. The custodian suites
  `C-13-post`/`C-14-velocity` pass for `real`.
- [x] `packages/engine/src/lanes/prd03.ts`: `registerDiagnosticsSection("post", …)` and
  `("exposure", …)`. Both are populated from `PostprocessExecution.ts` with the executed plan
  (stage name, format, size, `cpu-readback` marker) and the exposure actually sent, not from the
  authored nodes. Test: `tests/unit/agent-api/post-diagnostics.test.ts` builds a scene with
  `colorGrade({exposure:1.05})` and asserts `exposure.applied === 1` with the flag off (truthful)
  and `1.05` with the flag on after Phase 1.
- [x] `post/PostTimer.ts`: wraps each graph stage in `EXT_disjoint_timer_query_webgl2` queries when
  the C-28 probe reports the extension, and returns `gpuMs: undefined` otherwise. Test: a browser
  spec asserts no exception when the extension is absent.
- [x] `packages/rendering/src/post/ToneOperators.ts`: TS `aces`, `agx`, `neutral`, `reinhard`,
  `linear`. Constants come from
  `node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js:46-200`.
  Commit 64 golden input→output triples per operator, generated once by running the three GLSL in
  a headless WebGL capture on macos-14, together with the generating script
  (`tests/qr/prd03/goldens/generate-tone-goldens.mjs`). Test:
  `tests/unit/rendering/post-tone-operators.test.ts`.
- [x] `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd03/`: add the scenes
  `prd03-hdr-bloom`, `prd03-thin-aa`, `prd03-tone-ramp` (+21b), `prd03-ao-grounding`,
  `prd03-dof-bokeh`, `prd03-taa-motion`, `prd03-night-fog-banding` (+25b) and
  `prd03-scene18-bloom` (a copy of base scene 18's inputs, for the held-out bloom check). Each has
  an Aura adapter and a three adapter. On the three side, passes from `examples/jsm/postprocessing`
  (`UnrealBloomPass`, `GTAOPass`, `BokehPass`, `FXAAPass`, `SMAAPass`) are composed as
  `EffectComposer` + `RenderPass` + named pass + `OutputPass` on `HalfFloatType` with `samples:4`,
  the same pattern as `three/common.ts:336-342`. `TRAANode` and `TAAUNode` exist only as TSL nodes
  (`examples/jsm/tsl/display/`), so `prd03-thin-aa` (taa mode) and `prd03-taa-motion` use
  `new WebGPURenderer({ forceWebGL: true })` with a TSL `PostProcessing` chain. Both engines then run
  on WebGL2 on the same runner. Each scene declares `qrFlags: ["post"]` (C-30). Test: the C-30
  registry test lists the 8 ids as `active`.
- [x] `.github/workflows/post-quality.yml` (macos-14, §15.2) and
  `.github/workflows/qr-prd03-captures.yml`. The capture workflow dispatches
  `tools/quality-rebuild-capture` with `--flags none` and `--flags post` for the 18 games and the
  lane scenes. It also runs `tests/qr/prd03/capture-dsf2.spec.ts`, which loads each game route at
  1440×900 with `deviceScaleFactor: 2` and records `canvas.width / clientWidth`, until Q-12-1
  lands. It uses no secrets.
- [x] `tools/quality-rebuild/codemods/post-v2.mjs` (pure `AuraCodemod`) and
  `packages/aura3d-cli/src/commands/prd03/index.ts` (`registerCodemod`). It is report-only at this
  point. Test: `tests/unit/tools/post-v2-codemod.test.ts` (fixtures in Phase 5).
- [ ] Commit the baseline captures and `bundle.json` to `evidence/prd03/phase0/`.

Phase 1 (own-module code from day 0; wiring after PR 0b-1 / 0b-2)
- [x] `agent-api/compiler/postprocess.ts`, flag on: set
  `toneMapping.exposure = (options.output?.exposure ?? 1) × (colorGrade.exposure ?? 1)` (replacing
  the literal 1 that came from `index.ts:12898-12904`) and
  `operator = options.output?.toneMapping ?? DEFAULT_TONE_MAPPING`. Test: `post-diagnostics.test.ts`
  asserts the bridge output `toneMapping.exposure === 1.05` for `colorGrade({exposure:1.05})` with
  the flag on and `1` with it off.
- [x] `agent-api/compiler/postprocess.ts`: read `options.output` (the C-38 pre-declared
  `AuraCreateAppOptions.output`) at compile time through `SceneCompileContext`. If PR 0b-1 does not
  pass create options into the context, raise CCR-03-6 to add `SceneCompileContext.output?`.
  Test: a unit test with a fake renderer captures the options.
- [x] `agent-api/compiler/postprocess.ts` + `renderer/PostprocessExecution.ts`: with the flag on,
  pass `depthRange: { near, far, projection }` from the compiled camera's
  `resolveCameraClipping` result (`RootRuntimeSupport.ts:16-21`) through
  `RendererPostProcessOptions.depthRange` (CCR-03-1) into `presentLdrPostprocess` options, which
  `normalizeLdrDepthRange` (`webgl2/LegacyPost.ts`, from `WebGL2Device.ts:909`) already reads.
  Test: `tests/unit/rendering/post-depth-range.test.ts` asserts the device receives 0.05/100 for a
  default root camera with the flag on and 0.1/1000 with it off. A browser test checks DOF focus
  at 10 m on a 0.05/100 camera.
- [x] `packages/rendering/src/post/shaders/fxaa.glsl.ts`: a verbatim port of three r185
  `FXAAShader.js` (6.5, 8.13), recomputing luma per tap, with `triangularDither` before the write.
  In `webgl2/LegacyPost.ts`, with the flag on and mode `fxaa`: run the present program with no
  `fxaa` option (`u_hasFxaa = 0`) into a pooled RGBA8 target, then this FXAA program to the output.
  Test: `tests/browser/post-fxaa.spec.ts` renders the same inputs through Aura's FXAA and three r185
  `FXAAPass` and asserts:
  - (a) A 1-px white line on black at 3°: per-column max luma ≥ 0.9× three's in every column, and
    mean absolute difference from three ≤ 2 LSB. The old shader fails (a) because it only blends
    the 4-neighbour average.
  - (b) A low-contrast texture (uniform noise ±0.012 luma around 0.5, below the 0.0312 contrast
    threshold) is unchanged within 1 LSB.
  - (c) A 1-px black/white checkerboard matches three within 2 LSB mean. It is *expected* to blur,
    as three's does; no FXAA variant can tell texture edges from geometry edges.
- [x] `packages/rendering/src/post/PostAntiAlias.ts` `resolvePostAntiAlias` (7.2), called by
  `compiler/postprocess.ts`:
  - Mode from C-27 `msaaSamples/postAntiAlias` and the authored `antiAlias` mode. An `antiAlias`
    node whose `postAuthored` lacks `mode` counts as `auto`.
  - `fxaa` sets `sampleCount: 1`.
  - Pixel guard `w·h > 2.4e6` downgrades msaa to smaa (fxaa until Phase 6).
  - The reason is written to `post.skipped`.

  Test: `tests/unit/rendering/post-tiers.test.ts` asserts that no resolved plan has both
  `sampleCount 4` and `fxaa`, that 3840×2160 msaa resolves to non-msaa, and that the flag-off
  output equals today's `fxaaRequested` logic (`index.ts:12859`).
- [x] `post/shaders/common.glsl.ts` `triangularDither` (PCG2D hash). Test:
  `tests/browser/post-banding.spec.ts` renders `prd03-night-fog-banding` on the FXAA path and
  asserts two things: the longest run of identical 8-bit values along the gradient is ≤ 1.5× the
  ideal quantization run, and Sobel on 8-bit luma with threshold 1 finds < 0.5% contour pixels.

Phase 2
- [x] `packages/rendering/src/post/PostGraph.ts`: stage descriptors `{name, inputs,
  outputs:{format, scale}, enabled(options)}`, the fixed order of 6.1, and C-13 insertion-point
  dispatch with `space` validation. Test: `tests/unit/rendering/post-graph-order.test.ts` asserts
  the stage order for every option combination (2^10 enumerations), that no stage before OutputPass
  has an `rgba8` output, and that a `display` pass before tonemap throws
  `POSTPROCESS_SPACE_INVALID:<id>`.
- [x] `post/PostResources.ts`: a pool keyed `(w,h,format,samples)` on top of C-28
  `renderTargetPoolSlot`, released on resize. Test: a unit test asserts the allocation count is
  constant across 100 frames when the C-28 stub (allocate-per-acquire) is active.
- [x] `webgl2/LegacyPost.ts` `executePostGraphWebGL2` plus `createLegacyOutputPass` (CCR-03-5), and
  the `renderer/PostprocessExecution.ts` v2 branch. Test: a browser spec asserts exactly one tone
  operator evaluation per pixel. It renders the HDR ramp through v2 with operator `aces`, compares
  against `ToneOperators.aces`, and requires ≤ 1 LSB with no double-curve signature.
- [x] `post/shaders/bloom.glsl.ts` per 6.6, plus `postprocess/NativeBloomPyramid.ts`:
  `bloomNormalization(mips, scatter)` and mips starting at half resolution.
  `resolveBloomPyramidResponseGain` (`:106-109`) stays only for the flag-off path. Tests:
  - `tests/unit/rendering/native-bloom-pyramid.test.ts` (lane 03's): a constant input E above
    threshold yields composite bloom E ±2%, computed through a TS mirror of the up/down weights.
  - Browser: a constant-color HDR quad (luma 2.0, threshold 1.0, knee 0) gives a bloom contribution
    of 1.0 ±3% × intensity.
- [x] `webgl2/LegacyPost.ts` `normalizeNativeBloomOptions` (moved from `WebGL2Device.ts:4481` in
  the 0b-2 carve; if the carve leaves it in the device, it is Q-01-8): with the flag on, accept
  threshold [0,64] and knee [0,1] and drop the softKnee ≤ 0.5 throw (`:4484-4496`). Deprecated
  fields map per 7.1. Test: one unit test per mapping, plus a deprecation diagnostic.
- [x] `post/shaders/composite.glsl.ts` (S10 linear: exposure, bloom, CA, linear grade),
  `displayGrade.glsl.ts` and `lutBake.glsl.ts` (S10b, 33³ RGBA8, rebaked only when the
  display-grade hash changes). Test: `tests/browser/post-lut.spec.ts` checks a 4096-step ramp LUT
  against the analytic display grade within 1 LSB, and a rebake count of 1 across 60 frames with
  constant params.
- [x] `post/CubeLut.ts` `parseCubeLut`: supports `LUT_3D_SIZE`, `DOMAIN_MIN/MAX` and comments;
  throws on 1D LUTs and on size > 65. Test: `tests/unit/rendering/post-cube-lut.test.ts` with an
  identity LUT and the fixture `tests/qr/prd03/fixtures/luts/teal-orange-33.cube`.
- [x] `post/shaders/finalize.glsl.ts`: dither + grain + RCAS, fused with FXAA and S10b. Test:
  covered by the banding and FXAA specs run on v2.
- [x] `packages/engine/src/agent-api/postBridge.ts` `createRootPostPipeline(snapshot, camera,
  output, tierSettings)`, `POST_EFFECT_FIELDS`, `POST_EFFECT_DEPRECATED_FIELDS`; called from
  `compiler/postprocess.ts` when the flag is on. It applies v2 defaults to fields absent from
  `postAuthored`. Test: `tests/unit/agent-api/post-bridge.test.ts` has one case per field
  (exposure, lut, shadows, highlights, bloom color, threshold > 1) asserting the field is present
  in the output pipeline. It also asserts:
  - an unknown field throws `POST_FIELD_UNSUPPORTED`;
  - iterating `POST_EFFECT_FIELDS`, every allowlisted field has a "reaches the pipeline" assertion
    (the test fails on an allowlisted but unasserted field);
  - the throw rejects `app.ready()` rather than landing in `diagnostics.errors`;
  - with the flag off, the same scene only warns (`option-ignored`).
- [x] `nodes/effects.post.ts`: add the inert `postAuthored` field to the six carved factories
  (`Object.keys(options)` at call time). Factory defaults stay byte-identical. Test: a snapshot
  test asserts the node objects equal today's except for `postAuthored`, and that the legacy bridge
  output is byte-equal (C-36 conformance "flag-off byte-equal RenderSource").
- [x] Bundle gate for v2: `Renderer`-side code reaches `post/` only through `import()` taken in
  `PostprocessExecution.ts` when v2 is selected. Test: `pnpm check:bundle-size` passes for all
  gated targets, and an esbuild metafile assertion in `tests/unit/rendering/post-bundle-split.test.ts`
  shows `post/shaders/*` in a deferred chunk, outside the critical path of the cinematic-scene and
  mini-game starters.
- [x] `benchmarks/quality-rebuild/aura3d/scenes/prd03/bloomMapping.ts` `mapThreeUnrealBloom(strength,
  radius, threshold): BloomOptionsV2`: calibrate once on `prd03-hdr-bloom` to ±10% halo energy,
  commit the calibration log and freeze the mapping. Use it in `prd03-scene18-bloom`. File Q-12-2
  so the shared `aura3d/common.ts:254-256` adopts it.

Phase 3
- [x] `post/shaders/depthDownsample.glsl.ts`, `gtao.glsl.ts`, `gtaoDenoise.glsl.ts` per 8.3–8.4,
  with the 6.3 fallback when `prd03.indirectFraction` is inactive. On v2, legacy SSAO
  (`webgl2/LegacyPost.ts`, from `WebGL2Device.ts:3091-3129`) is not scheduled. Test: a browser test
  on `prd03-ao-grounding` with a 1 m cube on a plane, camera at 8 m, near 0.05/far 100: the AO
  texture mean in a 10 cm band at the contact edge is ≤ 0.75, and ≥ 0.97 on open floor 1 m away.
  The old shader gives ~1.0 everywhere at this distance (19 §C14). `post.skipped` contains
  `AO_INDIRECT_FRACTION_PENDING` while C-02 is a stub.
- [x] `post/chunks/indirectFraction.glsl.ts`: register feature `prd03.indirectFraction`. Test:
  `ChunkHarness` compiles it with a mock `a3dIndirectRadiance` input, and a unit test checks `a ≈ 0`
  for emissive-only and `a ≈ 1` for ambient-only inputs in the harness. The forward-pixel version of
  this test is integrated (needs C-02 real, Q-02-1, Q-01-1).
- [x] `nodes/effects.post.ts` `ambientOcclusion` (`index.ts:3518`) and `contactOcclusion` (`:3528`):
  no factory change. The bridge interprets `radius` in metres with the flag on, and
  `contactOcclusion` as `ambientOcclusion({radius: 0.2, ...authored})`. Two AO nodes produce
  `POST_DUPLICATE_STAGE`. Test: bridge unit test.
- [x] `post/shaders/godrays.glsl.ts` per 8.5. `compiler/postprocess.ts` maps `effects.volumetricFog`
  nodes (factory `index.ts:3499`, lane 07 file) to S4, with `color` honoured (bridge code from
  `index.ts:12810-12822`) and `lightUv` projected from the strongest directional light. With the
  flag on it no longer emits `volumetric-light`. Test: a browser spec on `prd03-night-fog-banding` 25b
  (sun behind pillars) asserts mean added luma in the shaft mask ≥ 3%, ≤ 0.5% in the occluded
  pillar mask, and a `readPixels` count of 0.
- [x] `nodes/effects.post.ts`: new factories `vignette`, `filmGrain`, `chromaticAberration` (new
  keys, so no collision with lane 07's `effects.ts`; the C-36 duplicate-key test passes). Bridge
  mapping. GPU work in S10/S10b/S12. Test: bridge unit test plus a browser spec where vignette 0.5
  gives corner luma ≤ 0.6 × centre on a flat field.
- [x] `renderer/PostprocessExecution.ts` (pixel-pass block from `Renderer.ts:1245-1280` and its async
  twin): with the flag on, throw `POSTPROCESS_PASS_NOT_GPU` unless
  `execution === "cpu-deterministic"`. In production builds (`import.meta.env.PROD` /
  `process.env.NODE_ENV === "production"`) skip the pass and record it instead. Test: a unit test
  with a fake device asserts the throw. `tests/browser/post-no-readback.spec.ts` wraps
  `WebGL2RenderingContext.prototype.readPixels`, reads C-28 `counters().readbacks`, and asserts 0
  across 300 frames for each of the 18 games loaded with `?a3d-qr=post` (local-build mode of the
  capture tool).
- [x] Move the CPU kernels: `PostProcessPass.ts` kernels, `postprocess/EffectComposer.ts`,
  `postprocess/SSAOPass.ts` and `cinematic/{BloomPass,VignettePass,FilmGrainPass,DepthHazePass}.ts`
  go to `packages/rendering/src/reference/`, with the old paths kept as `@deprecated` re-export
  shims (lane 03 files). The `./reference` export is reserved in PR 0a; dropping the root barrel
  re-exports is Q-15-4. Test: an esbuild metafile assertion that the post v2 chunk does not import
  `reference/`.
- [x] `RendererPostprocessPlan.ts:204-206`: with the flag on, drop the `contact-shadow` pass and emit a
  deprecation diagnostic. Its `Renderer.ts` dispatch lives in the carved `PostprocessExecution.ts`.
  Test: plan unit test with the flag on and off.

Phase 4
- [ ] `TemporalHistory.ts:57-94`, flag on: skip the re-draw (`:89-92`) and the
  unsupported-geometry throw (`:73-74`), and return C-14 `{ jittered, unjittered, previous }`. Test:
  `tests/unit/rendering/temporal-history-lifecycle.test.ts` (lane 03's) gains a flag-on case
  asserting that no `ForwardPass` is constructed. The flag-off case is unchanged.
- [ ] `post/shaders/depthDownsample.glsl.ts` pass C: camera velocity (8.3). Test: a browser spec
  where a 1° camera yaw over a static plane gives velocity within 2% of the analytic value.
- [ ] `forward/Velocity.ts` `bindVelocityUniforms`: the rigid previous-matrix cache keyed by item
  label, moving-item detection (model matrix changed), and the coverage counts reported to
  `post.velocityCoverage`. It binds `u_prevModelMatrix`, `u_prevViewProjection` and
  `u_unjitteredViewProjection` only when the forward target has velocity attachments (Q-01-2).
  Test: unit test with a fake uniform sink, plus `C-14-velocity` conformance for `real`.
- [ ] `post/chunks/velocity.glsl.ts`: feature `prd03.velocity` (rigid, instanced, skinned via the
  C-18 deform chunk, morph). Test: `tests/unit/rendering/shader-variants-velocity.test.ts` compiles
  every variant in `ChunkHarness` and asserts `AURA_VELOCITY` outputs at location 1. The per-object
  forward pixels (rigid cube moving +0.1 NDC/frame → velocity 0.05 ±0.002) are integrated (C-02 real
  + Q-01-2).
- [ ] `post/PostAntiAlias.ts`: TAA is allowed only if `moving == movingWithHistory`; otherwise msaa
  with `TAA_VELOCITY_COVERAGE`. Test: unit test.
- [ ] `post/shaders/taa.glsl.ts` per 8.6 (HDR at S5) plus `velocityDilate.glsl.ts`, using the C-14
  reactive input when present and the luminance-delta heuristic otherwise. Test:
  `tests/browser/post-taa.spec.ts` renders `prd03-taa-motion` for 32 frames and checks:
  - (a) static camera: a 1-px line's temporal luma stddev ≤ 0.01;
  - (b) camera pan over static geometry: ghost trail ≤ 2 px;
  - (c) `cutCamera()`: the frame after the cut equals a no-history frame within 2 LSB.

  Cases (d) skinned character ghost ≤ 2 px and (e) particle quad trail ≤ 2 px with the reactive mask
  on (and > 2 px with it forced to 0) are tagged `@integrated` and run at checkpoints.
- [ ] TAAU: `renderScale < 1` with taa outputs display resolution. Test: `prd03-thin-aa` at scale
  0.67 has edge error ≤ 1.3× full-res TAA.
- [ ] `post/shaders/motionBlur.glsl.ts` per 8.8. `effects.motionBlur` maps `intensity → shutter` in
  the bridge. `maxBlur` follows after Q-07-2. The shutter is scaled by C-23 `timeScale`. Test: a
  browser spec where the blur length of a camera pan at 60 vs 30 simulated fps differs by ≤ 10%.
- [ ] `post/shaders/dof.glsl.ts` per 8.7. The bridge converts the legacy `focus/aperture` with the
  real near/far. Test: a browser spec on `prd03-dof-bokeh` through `RendererPostProcessOptions.v2`
  (f 50 mm, N 2.8, focus 3 m, 1080 px, `maxBlurPx: 32`, so the clamp is not hit): focus-plane pixels
  are within 2 LSB of the no-DOF render, and a background point light at 30 m produces a bokeh disc
  of diameter 12.3 px ±15%.
- [ ] `agent-api/postBridge.ts`: register the C-38 `post` extension and the flattened `cutCamera`
  → C-14 `resetTemporalHistory("camera-cut")`, plus the 5 m/frame auto-cut and the resize,
  tier-change and scene-swap resets. Test: unit test (C-38 conformance "real overrides stub only
  with flag on").

Phase 5
- [ ] `packages/engine/src/agent-api/postPresets.ts`: the 7 presets of 6.8 as `AuraPostPreset` data.
  `output.preset` expands them in the bridge, and explicit effect nodes override preset values
  field by field. Presets naming `agx`/`neutral` report `capability-degraded` while C-05 is a stub.
  Test: `tests/unit/agent-api/post-presets.test.ts` asserts that expansion and override order are
  deterministic, and that the id set equals C-13's.
- [ ] `packages/rendering/src/post/PostQualityTiers.ts` `resolvePostTier(settings, tier, ctx)` per
  the 6.8 table, reading C-27 `AuraQualityTierSettings`. It re-resolves on
  `app.quality.onChange`. `setQualityTier` delegates to `app.quality.set`. Test: a unit table test
  covering every tier × feature cell, with C-27 rows asserted against `QUALITY_TIERS` (no literal
  copies).
- [ ] `tools/quality-rebuild/codemods/post-v2.mjs` complete per section 10, with `--dry-run` printing
  a diff and the emissive report. Test: `tests/unit/tools/post-v2-codemod.test.ts` runs fixtures
  copied (read-only) from:
  - `apps/showcase-courier-rush/src/main.ts:295-297` (neonBloom with `softKnee`, colorGrade);
  - `apps/showcase-deep-recovery/src/main.ts:270-285` (bloom tail, colorGrade, antiAlias,
    volumetricFog);
  - `apps/showcase-mech-hangar/src/main.ts:717` (contactOcclusion radius 0.6 kept);
  - a bank-shot excerpt with both `ambientOcclusion` and `contactOcclusion` (merge rule).

  It also asserts that the default file list contains exactly the 17 game showcases plus Aura Clash,
  and that no non-game `apps/showcase-*` file is listed.
- [ ] Run `post-v2 --report` (never `--write`) on the 17 game mains, Aura Clash and
  `examples/neon-corridor-strike`. Commit the reports to `evidence/prd03/phase5/codemod/`, and
  attach them to Q-14-1 and Q-13-1.
- [ ] Append facts F-03-01..05 (section 10 item 5) to CONTRACTS Appendix B, status `proposed`, each
  with the test that will verify it.
- [ ] Capture all 18 unmodified routes with `?a3d-qr=post` and `none` at DSF1/DSF2/mobile. Assert
  no black frame, crash or console error, and the frame-time rule of the Phase 5 exit. Commit to
  `evidence/prd03/phase5/`.

Phase 6
- [ ] `post/shaders/smaa.glsl.ts` plus the `post/smaa/` lazy chunk (`import()` of AreaTex/SearchTex
  binaries ported from three r185 `SMAAPass.js`, MIT notice kept). Test: a browser spec on
  `prd03-thin-aa` compares the edge-error metric with three `SMAAPass`, and a bundle check confirms
  the textures are absent from the root chunk.
- [ ] `post/shaders/exposure.glsl.ts` per 8.9; `output.autoExposure` read by the bridge
  (CCR-03-2). Test: on `prd03-tone-ramp` 21b, a dark→bright step, EV reaches within 0.1 of target in
  ≤ 1.5 s at speedUp 3, with 0 `readPixels` calls.
- [ ] `app.addPostPass` → C-13 `registerPostPass`, with insertion in `PostGraph`. Test: a browser
  spec where a red-channel-invert pass at `after-tonemap` produces the expected readback, and a pass
  at `before-tonemap` receives an RGBA16F input with values > 1 preserved.
- [ ] `apps/postprocessing-bloom/src/main.ts:100-104`: replace the threshold-0.08 Reinhard demo with
  an HDR emissive demo on `createAuraApp` using `neon-night`. Add `apps/postprocessing-custom`. Both
  are lane 03 apps.

Phase 7
- [ ] A WGSL mirror for each `post/shaders/*.glsl.ts` in `post/shaders/*.wgsl.ts`. In
  `webgpu/WebGPUPostShaders.ts`: exposure becomes a linear multiplier (`:253`), and the 2-tap
  `webgpuFxaaFragment` (`:262-316`) and `webgpuSoftKneeWeight` without the cap (`:224`) are deleted
  behind the flag. Test: `tests/qr/prd03/wgsl-compile.spec.ts` (zero compilation errors). WebGPU
  execution and the WebGL2-vs-WebGPU diff are Q-11-2 (integrated).

Phase 8 (only after `A3D_QR_POST` has been `default-on` for two checkpoints)
- [ ] Delete in lane 03 files: the legacy programs and `presentLdrPostprocess` orchestration in
  `webgl2/LegacyPost.ts`, `ensureBloomLutTextures`, `ensureOutlineBlendLutTexture` (if outline has
  moved), `postprocess/NativeLdrEffectLuts.ts`, `resolveBloomPyramidResponseGain`, the CPU readback
  branch of `PostprocessExecution.ts`, the `reference/` re-export shims, and `compat.post`. Add
  `A3D_QR_POST` to `REMOVED_QR_FLAGS` through lane 15. File Q-01-5, Q-15-3 and Q-15-4. Test: full
  unit and browser suites on remote CI, plus the bundle report.

---

## 15. Test requirements

### 15.1 Unit (vitest, `tests/unit/**` and `tests/qr/prd03/**`)

These run in the required checks `.github/workflows/qr-contracts.yml` (typecheck, lint, unit,
conformance, ownership) and `test.yml`. They also run on macos-14 as the first job of
`post-quality.yml`. Each test runs with flags `none` and `post` where the behaviour is gated.

- `contracts/impl/prd03-{post-graph,velocity,presets}.test.ts`, alongside the custodian suites
  `contracts/C-13-post.test.ts` and `contracts/C-14-velocity.test.ts` (stub and real).
- `rendering/post-tone-operators.test.ts`:
  - goldens per operator;
  - monotonicity on [0, 64];
  - AgX output ∈ [0,1];
  - Neutral matches the three formula, including the min-channel toe offset (for peak < 0.76 the
    output is `color − offset`, not `color`).
- `rendering/native-bloom-pyramid.test.ts`: mip sizes start at half resolution; normalization;
  with the flag on, no `*ResponseGain` is used.
- `rendering/post-graph-order.test.ts`: stage order; format invariants (no rgba8 before OutputPass;
  depth stages require S1); C-13 space validation.
- `rendering/post-depth-range.test.ts`: real near/far plumbing; ortho path; flag-off unchanged.
- `rendering/post-cube-lut.test.ts`: parser.
- `rendering/post-tiers.test.ts`:
  - C-27 tier mapping (values read from `QUALITY_TIERS`);
  - MSAA pixel guard;
  - velocity-coverage fallback;
  - no FXAA + MSAA.
- `rendering/temporal-history-lifecycle.test.ts`: flag-on case with no geometry re-draw.
- `rendering/shader-variants-velocity.test.ts`: ChunkHarness compile of `prd03.velocity`.
- `rendering/post-bundle-split.test.ts`: esbuild metafile.
- `agent-api/post-bridge.test.ts`:
  - every 7.1 field reaches the pipeline;
  - unsupported fields throw with the flag on and warn with it off;
  - deprecated fields emit diagnostics;
  - `postAuthored` defaults.
- `agent-api/post-diagnostics.test.ts`: C-31 `post`/`exposure` sections equal executed values.
- `agent-api/post-presets.test.ts`.
- `tools/post-v2-codemod.test.ts`.

### 15.2 Browser (Playwright, remote GH Actions macos-14 only, per machine policy)

`.github/workflows/post-quality.yml` (lane 03) runs on `runs-on: macos-14` with
`QRC_GPU_ARGS: "--use-angle=metal --enable-gpu --ignore-gpu-blocklist"`, the same as
`quality-rebuild-capture.yml` (run 37289688772). Projects: chromium (ANGLE Metal), webkit and
firefox. It triggers on PRs touching lane 03 paths (§"Parallel execution") or `packages/rendering/**`.
It uses no secrets. Artifacts (PNG readbacks, JSON metrics) always upload.

Specs in `tests/browser/`: `post-tone-ramp`, `post-fxaa`, `post-banding`, `post-lut`,
`post-bloom-energy`, `post-gtao`, `post-godrays`, `post-no-readback`, `post-taa`,
`post-motion-blur`, `post-dof`, `post-smaa`, `post-auto-exposure`, `post-custom-pass`,
`post-single-tonemap`, plus `tests/qr/prd03/wgsl-compile.spec.ts` and `capture-dsf2.spec.ts`.
- Each spec builds a minimal `createAuraApp` page under `tests/qr/prd03/fixtures/` with
  `qualityRebuild: { flags: ["post"] }`.
- Each reads pixels with `gl.readPixels` inside the frame callback, so it does not depend on
  `preserveDrawingBuffer` (Q-15-1).
- Pixel assertions use the thresholds stated in section 14.
- Specs tagged `@integrated` (TAA cases d/e, forward `f_ind`, per-object velocity, AgX/Neutral
  parity, WebGPU diff) are skipped in PR runs. They run at checkpoints with `qr_flags=all`.

Custodian browser suites `tests/browser/contracts/C-13-post.spec.ts` and `C-14-velocity.spec.ts`
run in `qr-contracts.yml` on macos-14. Every PR touching `packages/rendering/**` or
`packages/engine/**` also runs the flag-off sentinel identity check (CONTRACTS §6.1).

### 15.3 What is not a pass

Green unit/browser suites, non-blank screenshots, "routes 200", conformance results and parity
matrices are engineering gates only. None of them supports a claim that Aura3D matches three.js
(CONTRACTS §7 honesty rule). The quality claims in this PRD are made only at G-PANEL rounds, with
a human sign-off.

## 16. Visual acceptance tests

This section defines the scenes, games and thresholds. Which criteria gate merges (standalone) and
which are evaluated at checkpoints (integrated) is fixed in the two sections after it.

### 16.1 Benchmark scenes (`benchmarks/quality-rebuild`, three@0.185.1 same-input reference)

Existing base scenes (lane 12, read-only for this lane) used at checkpoints: 02 (pedestal edge AA),
03 (helmet emissive bloom), 06 (silhouette AA), 08 (skinned stripes, TAA), 09 (outdoor tone/haze),
13 (sphere AA), 15 (skinned TAA velocity), 16 (instancing velocity), 18 (game scene bloom/tone).
Lane scenes, added in Phase 0 under `scenes/prd03/` (C-30 ids `prd03-<slug>`; the earlier
"19-25" numbers are kept below only as short names):

| Id | Content | Criterion |
|---|---|---|
| `prd03-hdr-bloom` (19) | Unlit emissive spheres (black base colour, emissive `#ffffff`, so linear luma = strength) at strength 0.5/1/2/4/8 at threshold 1.0, knee 0.25; one diffuse white wall lit so its rendered linear luma is ≤ 0.6. This scene is also the `mapThreeUnrealBloom` calibration scene. | Strength 0.5 and the wall: added luma ≤ 0.5% (both below the knee window [0.75, 1.25]). Strength 1 lies inside the knee and is not asserted. Strength 2/4/8: halo energy is proportional to the excess (strength − 1 = 1/3/7) within ±10%, which verifies the "no hidden gain" normalization (6.6). No three comparison on this scene, because it is the calibration input. |
| `prd03-thin-aa` (20) | Wires, rails, 1-px lane markers, text decal, rotating slowly; DSF 1 and 2 | Edge-crawl (temporal stddev on edge pixels over 16 frames) ≤ three × 1.2, comparing like with like (msaa vs three `antialias:true`, fxaa vs three `FXAAPass`, smaa vs `SMAAPass`, taa vs `TRAANode`). Text-decal interior SSIM vs a 16× supersampled reference: msaa/taa ≥ 0.98; fxaa/smaa ≥ three's same-mode SSIM − 0.01 (post-AA blurs high-contrast texture by design) |
| `prd03-tone-ramp` (21) | Grey and saturated (cyan #38d6ff, magenta #ff42c8) ramps 0..16 linear, per operator; 21b dark→bright cut | ΔE2000 mean ≤ 1.0 vs three per operator (ACES/AgX/Neutral); auto-exposure convergence |
| `prd03-ao-grounding` (22) | Furniture/clutter room, camera 6–10 m | Pixel: luminance within 10 cm of each contact ≥ 15% darker than AO-off; open floor ≥ 1 m from geometry changes ≤ 2%; emissive and sky pixels change ≤ 1 LSB (f_ind gating). Vision: contact darkening "equivalent or better" vs three `GTAOPass`; no halo on far side of silhouettes |
| `prd03-dof-bokeh` (23) | Hero at 3 m, background lights at 30 m | Pixel: focus-plane pixels within 2 LSB of no-DOF; bokeh diameter 12.3 px ±15% (Phase 4 checklist). Vision: no foreground bleed, bokeh shape ≥ three `BokehPass` |
| `prd03-taa-motion` (24) | Camera pan over static geometry (standalone part); running skinned character + instanced crowd + translucent particle quad (integrated part) | Ghost ≤ 2 px; vision ≥ three `TRAANode` |
| `prd03-night-fog-banding` (25) | `#030711` background, exp² fog, dim lights; 25b sun behind pillars | Banding metric (Phase 1 checklist: longest equal-value run ≤ 1.5× ideal, Sobel-contour pixels < 0.5%); 25b: mean added luma in the shaft mask between pillars ≥ 3% with god rays on vs off, ≤ 0.5% added in the occluded pillar mask, and 0 `readPixels` calls |
| `prd03-scene18-bloom` | Same inputs as base scene 18, owned by lane 03 so bloom can be measured without editing lane 12's `aura3d/common.ts` | Halo energy (bloom-on − bloom-off luminance over the halo mask) within ±15% of three, held out from calibration |

Judging. Each scene is captured side by side and scored by the vision model in the 23 prompt
format, with post-specific criteria added (Q-12-3, C-32).
- Threshold: **Aura score ≥ three score − 0.5** on every post scene, and no post-attributable
  "major-aura3d-deficiency" row in the difference table.
- A human reviewer signs each scene in `evidence/prd03/<phase>/signoff.md`. A vision pass without
  the human sign-off is not acceptance.
- Vision judgments count only at G-PANEL checkpoints (integrated). In PR runs they are screening.

### 16.2 Games (`tools/quality-rebuild-capture`, 18 games, DSF1 + DSF2 + mobile)

Every game gets a row. "Nodes" is the `effects.*` census from each game's main file (all 17
showcase mains also author `fog`, except mech-hangar). "Preset" is the codemod mapping (section
10); lane 14 may override it per game (C-35). "Tier" is what `quality:"auto"` resolves to on the M1
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
| gravity-post | neonBloom, colorGrade, fog, antiAlias | default → auto | space | 3 / 1 / 4 | Sun becomes HDR emissive (codemod report) so bloom engages | needs emissive ≥ 1 above threshold (C-15 data, retune Q-14-1) | sun shows bloom halo; post ≥ 4 |
| mech-hangar | bloom, contactOcclusion, colorGrade, antiAlias | production → high (msaa per C-27; TAA only after CCR-03-4) | arena-fight | 5 / 4 / 5 | Strips retain hue; contact AO actually darkens; TAA where allowed (skinned/instanced velocity via C-14/C-18) | TAA ghosting on moving mechs without C-18 previous palette → msaa fallback | strips not near-white (≤ 2% px at 255); velocityCoverage 100% or msaa fallback recorded; post ≥ 5 |
| neon-swarm | bloom, AO + contactOcclusion, colorGrade, fog, antiAlias | default → auto | neon-night | 4 / 4 / 5 | Crushed blacks lifted by dither + exposure; AO grounding | swarm particles ghost under TAA | blacks not crushed (≤ 30% px at 0); tone ≥ 5 |
| orbital-defense | bloom, fog (no antiAlias node) | default → auto | space | 2.5 / 0.5 / 4 | Bloom engages once the sun/planet emissive is retuned; tier AA | no FXAA today, so the AA change is MSAA-only | visible HDR bloom on sun; post ≥ 3; tone ≥ 4 |
| patrol-wing | neonBloom, colorGrade, fog, antiAlias | default → auto | daylight-outdoor | 4 / 3 / 5 | Ring blow-out removed (thr 0.84 → 1.0, no gain); AgX flattens less | lower contrast under AgX | ring ≤ 2% px at 255; tone ≥ 5 |
| pulse-tunnel | neonBloom, particles, colorGrade, fog, antiAlias | default → auto | neon-night | 4 / 2 / 5 | Neon finally blooms after emissive retune; motion blur available (opt-in) | particle ghosting on TAA tiers | visible selective bloom on arches; post ≥ 4 |
| rooftop-buckets | neonBloom, colorGrade, fog, antiAlias | production → high (msaa per C-27) | neon-night | 4 / 4 / 5 | Streaky mobile bloom smears removed (pyramid starts half-res, no gain); backboard roll-off | TAA ghosting on the ball arc | no streak artefacts on mobile; backboard ≤ 2% px at 255; post ≥ 5 |
| siege-golf | neonBloom, colorGrade, fog, antiAlias | default → auto | daylight-outdoor | 5 / 4 / 6 | Mobile softness fixed by DPR; AgX daylight | AA ≥ 6 already, must not regress | tone ≥ 5, AA ≥ 6; mobile backing = 2× CSS at DSF3 on High (cap 2) |
| skyline-runner | neonBloom, AO + contactOcclusion, colorGrade, fog, antiAlias; `pixelRatio: 0.7` | safe-basic → medium | neon-night | 4 / 4 / 5 | `pixelRatio: 0.7` removed by lane 14 (Q-14-1, codemod report row); overdriven pickup haze removed | fill cost at native DPR | backing ≥ 1× CSS at DSF1, ≥ 1.5× at DSF2 (medium cap); pickups ≤ 2% px at 255; post ≥ 5 |
| turbo-drift-circuit | neonBloom, AO + contactOcclusion, particles, colorGrade, fog, antiAlias | default → auto | neon-night | 4 / 3.5 / 5 | Smeary lane-strip bloom and haze removed; motion blur available for speed feel | grey-washed mids are partly fog (C-21, lane 07) | lane strips not smeared (halo ≤ 3× strip width); post ≥ 5 |
| vault-breakers | neonBloom, AO + contactOcclusion, colorGrade, fog, antiAlias | production → high (msaa per C-27) | neon-night | 4 / 1 / 5 | Neon blooms only after the emissive retune (correct bloom shows nothing today) | owner perceives "still no glow" before the emissive retune (Q-14-1) | after retune: visible selective bloom; post ≥ 4 |
| all 18 | — | — | — | AA 4–6 (mostly inferred) | Real AA policy, native DPR | — | AA ≥ 6 at DSF2 crops; no game regresses in any post-attributable category vs Phase 0 |

Visual categories are judged on the actual screenshots, not on code or pixel statistics (21 is
authoritative for visual categories; 20 is not). Each game's "competitive with modern three.js?"
verdict is lane 14's (C-35). This PRD's acceptance is limited to the post-attributable categories
above. Every game row's vision thresholds are **integrated**: they need lane 14's codemod run and
emissive retune, and they are scored only at G-PANEL checkpoints. The pixel metrics in the last
column that do not depend on the retune (clipped-pixel fractions, readbacks, fps, backing ratio)
are also measured standalone on unmodified routes with `?a3d-qr=post`. Only the ones named in
§"Standalone acceptance" gate merges. The rest are reported.

## Standalone acceptance (gates lane 03 merges and the `standalone-accepted` flag state)

Every item below can be passed by lane 03 alone, on today's renderer plus `A3D_QR_POST`, with every
other contract at its PR 0 stub. Each is measured in this lane's CI (`post-quality.yml`,
`qr-prd03-captures.yml`, macos-14). This matches CONTRACTS §8 row 03: "The post graph runs on
today's forward target, which is already RGBA16F when post is active … bloom with a real threshold,
GTAO, SMAA/FXAA/TAA on static scenes, grading/LUT, auto-exposure, zero readbacks, and the post
benchmark scenes."

| # | Criterion | Measured by | Phase |
|---|---|---|---|
| S1 | C-13 and C-14 conformance green for `stub` and `real`; flag-off sentinel identity (IC-0 tolerance) on every PR | `qr-contracts.yml`, sentinel check | 0+ |
| S2 | Zero silent drops: every allowlisted `effects.*` post field reaches the pipeline or throws before the first frame (flag on) | `post-bridge.test.ts` | 2 |
| S3 | Diagnostics sections `post`/`exposure` report only executed values (`exposure.applied` = uniform sent) | `post-diagnostics.test.ts` | 0–1 |
| S4 | Exactly one tone operator per pixel on the v2 path; no rgba8/display target before OutputPass | `post-single-tonemap`, `post-graph-order.test.ts` | 2 |
| S5 | No AA stacking: no plan with MSAA > 1 plus FXAA/SMAA; MSAA pixel guard at 3840×2160 | `post-tiers.test.ts` | 1 |
| S6 | ACES tone ramp ΔE2000 mean ≤ 1.0 vs three r185 (`prd03-tone-ramp`); TS operators match goldens | `post-tone-ramp`, `post-tone-operators.test.ts` | 1 |
| S7 | FXAA spec cases (a)–(c) vs three `FXAAPass`; `prd03-thin-aa` FXAA edge crawl ≤ three × 1.2 | `post-fxaa` | 1 |
| S8 | Banding: equal-run ≤ 1.5× ideal and Sobel-contour < 0.5% on `prd03-night-fog-banding` | `post-banding` | 1 |
| S9 | Bloom: no hidden gain (halo ∝ excess ±10% on `prd03-hdr-bloom`, ≤ 0.5% below knee); `prd03-scene18-bloom` halo energy ±15% of three (held out) | `post-bloom-energy` | 2 |
| S10 | Display LUT within 1 LSB of the analytic display grade; rebake count 1 per 60 constant frames | `post-lut` | 2 |
| S11 | Zero `readPixels` across 300 frames in each of the 18 unmodified games with `?a3d-qr=post` | `post-no-readback`, C-28 counters | 3 |
| S12 | Deep Recovery, `?a3d-qr=post`, 1280×720: median frame ≤ 50 ms (from 849.9 ms) with god rays visible; 25b shaft criteria | `qr-prd03-captures.yml`, `post-godrays` | 3 |
| S13 | GTAO contact darkening ≥ 15% within 10 cm, open floor ≤ 2% change (`prd03-ao-grounding`, fallback path) | `post-gtao` | 3 |
| S14 | TAA on static geometry and camera pan: stddev ≤ 0.01, ghost ≤ 2 px, cut resets within 2 LSB; TAAU ≤ 1.3× edge error; msaa fallback reported for uncovered moving items | `post-taa` | 4 |
| S15 | Motion blur camera-pan length 30 vs 60 fps within 10%; DOF bokeh 12.3 px ±15% via `RendererPostProcessOptions.v2` | `post-motion-blur`, `post-dof` | 4 |
| S16 | Presets deterministic; C-27 tier cells covered; codemod fixtures; no non-game file listed | unit tests | 5 |
| S17 | 18 unmodified routes with `?a3d-qr=post` at DSF1/DSF2/mobile: no black frame, crash or console error; DSF1 frame time ≤ +10% vs `none` (newly enabled stages reported separately) | `qr-prd03-captures.yml` | 5 |
| S18 | SMAA edge error ≤ FXAA and within 10% of three `SMAAPass`; auto-exposure ≤ 1.5 s with 0 readbacks; custom passes at all five insertion points | `post-smaa`, `post-auto-exposure`, `post-custom-pass` | 6 |
| S19 | `pnpm check:bundle-size` passes for all gated targets on every phase; v2 code in a deferred chunk | `post-bundle-split.test.ts` | 2+ |
| S20 | WGSL strings compile with zero errors | `wgsl-compile.spec.ts` | 7 |

Standalone results are engineering and pixel evidence only. They are never reported as "matches
three.js" (CONTRACTS §7 honesty rule).

## Integrated acceptance (evaluated at CONTRACTS §7 checkpoints; never blocks a merge)

Evaluated with `A3D_QR_POST` on inside `qr_flags=all`, at G-PANEL rounds (IC-4, IC-8, IC-12, …).
Attribution uses leave-one-out (`all,-post`). A miss becomes a `qr-ic-regression` issue against the
owning lane. It does not hold lane 03 or anyone else.

| # | Criterion | Contracts / requests it depends on |
|---|---|---|
| I1 | AgX and Neutral tone ramps ΔE2000 mean ≤ 1.0 vs three; presets using them render their operator | C-05 real (lane 01) |
| I2 | Background passthrough within 1 LSB of `(3,7,17)` for clear `#030711` under every operator | C-05 real, Q-01-6, Q-15-2 |
| I3 | `f_ind` gating: emissive and sky pixels change ≤ 1 LSB with AO on (`prd03-ao-grounding`); forward `a ≈ 0` emissive / `≈ 1` ambient | C-02 real, Q-02-1, Q-01-1 |
| I4 | Per-object velocity: `velocityCoverage.withVelocity == items` on base scenes 08, 15, 16, 18 and on aura-clash, mech-hangar, skyline-runner; skinned ghost ≤ 2 px (`prd03-taa-motion` case d) | C-14 MRT via C-02 real + Q-01-2, Q-01-3, Q-06-1 (C-18) |
| I5 | Reactive mask: particle trail ≤ 2 px with mask, > 2 px without (case e) | Q-01-2, Q-07-3 |
| I6 | Engine-level physical DOF and motion-blur `maxBlur` from `effects.*` nodes | Q-07-2 |
| I7 | Post benchmark scenes (lane scenes + base 02, 03, 06, 08, 09, 13, 15, 16, 18): vision Aura ≥ three − 0.5 and no post-attributable major deficiency, with human sign-off | C-32 (G-PANEL), plus C-09/C-11 lighting for HDR content |
| I8 | Games (16.2 table): post-attributable thresholds per row; tone_mapping, anti_aliasing and postprocessing categories ≥ Phase 0 baseline in 18/18 games and ≥ +1.5 points mean; AA ≥ 6 at DSF2 crops | Q-14-1 (codemod `--write`, emissive retune), C-15, Q-11-1 (Aura Clash), C-35 |
| I9 | Courier van ≤ 2% pixels at 255 and similar clipped-pixel rows after the retune | Q-14-1 |
| I10 | Native DPR in games: backing = min(DPR, C-27 cap) × CSS on every route | C-27 applied by lane 01, Q-14-1 (skyline) |
| I11 | WebGL2 vs WebGPU per-pixel diff ≤ 2 LSB mean and ≤ 1% pixels > 8 LSB on lane scenes | Q-11-2 (C-29) |
| I12 | Real-device budgets (§17, §19) for the tiers offered on desktop and mobile | Q-11-3 (C-28 lab) |
| I13 | Skills, templates and apps contain no `softKnee`, `antiAlias({mode:"fxaa"})` or bloom thresholds < 1 (`rg` over `packages/aura3d-cli/skills`, `templates`, `apps`) | Q-13-1, Q-14-1, C-40 |
| I14 | Bundle: root path no longer contains CPU kernels; after flag removal every gated target ≤ Phase 0 baseline and the engine compatibility root (575,343 B gzip) does not grow | Q-15-4, Q-15-3 |

`A3D_QR_POST` moves to `integrated-accepted` when I1–I8 pass at one G-PANEL round. It moves to
`default-on` after two further clean checkpoints (CONTRACTS §5.3).

## 17. Performance budgets

Reference: 1920×1080 render pixels. The "desktop" column is an Apple M1-class integrated GPU.
"Mobile" is an A15/Adreno 650-class device at the tier's resolution. Tier contents follow C-27
(6.8). The macos-14 runner is a paravirtual GPU, so its absolute timings are used only as
regression deltas (±10% vs the committed baseline; standalone S17). Absolute numbers are
integrated (I12): they need a real-device run through the C-28 lab (Q-11-3) before any High/Ultra
claim. CPU ms counts post encoding only (uniforms, binds, draws; no readback). Memory counts
post-owned targets at 1080p and scales linearly with pixel count.

| Tier | GPU post ms desktop | GPU post ms mobile | CPU post ms | Post memory @1080p | Bundle gz (post code in root path) | Notes |
|---|---|---|---|---|---|---|
| Low | ≤ 1.2 | ≤ 2.5 @ ≤1.3 Mpx | ≤ 0.2 | ≤ 45 MB (scene 16.6 + depth 8.3 + lin-depth 8.3 if used + bloom 2.8 + LDR 8.3) | ≤ 18 KB | FXAA, bloom 3 mips (C-27), display LUT, dither |
| Medium | ≤ 2.5 | ≤ 4.5 | ≤ 0.3 | ≤ 140 MB (MSAA4 color 66 + MSAA depth 33 + resolves 25 + AO/bloom 8 + composite 16.6 pooled with resolve) | ≤ 24 KB (+GTAO) | MSAA guard ≤ 2.4 Mpx; GTAO low |
| High | ≤ 4.0 | ≤ 7.0 (30 fps target) | ≤ 0.5 | ≤ 155 MB (MSAA4 color 66 + depth 33 + resolves 25 + lin-depth 12.4 + AO 1.5 + god rays 4.2 + bloom 5.5 + SSR 4.2 = 151.8) | ≤ 32 KB (+DOF/MB) | msaa per C-27; with CCR-03-4 TAA: ≤ 95 MB (scene 16.6 + depth 8.3 + velocity 8.3 + reactive 2.1 + history 33.2 + lin-depth 12.4 + AO 1.5 + god rays 4.2 + bloom 5.5 = 92.1) |
| Ultra | ≤ 6.0 | not offered | ≤ 0.7 | ≤ 105 MB (TAA: 92.1 + SSR 4.2 + full-res AO 2.1 = 98.4) | ≤ 34 KB (+TAA) | TAA (C-27), msaa fallback; `maxPixelRatio` 3 means backing up to 8.3 MP, so scale memory by pixels; desktop discrete/M-series only |

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
compatibility root (575,343 B gzip) must not grow. The overall frame budget is C-27
`targetFrameMs` (lane 11's table): post must not exceed 25% of it (16.7 ms → 4.2 ms at High).

## 18. Browser coverage

- Chrome/Edge stable on macOS (ANGLE Metal): primary. Remote macos-14.
- Safari 17+ on macOS (WebKit, Metal): Playwright webkit on macos-14. Verify `TEXTURE_3D`
  RGBA16F linear filtering and R11G11B10F renderability. Fallbacks are RGBA16F bloom and the
  analytic grade define.
- Firefox stable on macOS: Playwright firefox on macos-14.
- Windows Chrome (ANGLE D3D11): `windows-latest` runners have no GPU (WARP), so only functional
  correctness is checked there and no timing is gathered. A real-GPU Windows run is part of
  Q-11-3 (integrated).
- Required: WebGL2 + `EXT_color_buffer_float`. Optional: `EXT_disjoint_timer_query_webgl2` for
  timings (C-28 probe). Without float color buffers, C-05 `probeHdrTargetFormat` returns `rgba8`
  and the graph is skipped with `POST_GRAPH_SKIPPED:no-float-target`. A spec that disables the
  extension through an init hook tests this (standalone). The selected operator on that fallback
  is C-05 real (integrated).
- WebGPU (Chrome 113+, Safari 26 where available): WGSL sources compile standalone (Phase 7).
  Execution is Q-11-2 (integrated).

## 19. Mobile coverage

- Emulated: Playwright webkit and chromium at 390×844 DSF 3 on macos-14. This checks layout,
  backing ratio and tier selection (C-27 stub: coarse pointer → medium) only. It is standalone.
- Real devices: iPhone (A15+) Safari, a mid Android (Adreno 6xx) Chrome, and a Mali-G7x Chrome,
  through the lane 11 device lab (C-28; AWS Device Farm or equivalent, provisioned per the machine
  policy; Q-11-3). No mobile device has ever been tested (18). Until this runs, mobile budgets are
  targets, not claims. This is integrated (I12) and does not gate merges.
- Mobile defaults come from C-27:
  - `auto` resolves to medium on coarse pointers (stub) and at most High once lane 11 is real.
  - Ultra is never offered on mobile.
  - The DPR cap is `maxPixelRatio`.
  - The MSAA guard applies; at 1170×2532 (DPR 3) MSAA is blocked.
  - Motion blur is off on Low/Medium. GTAO is half-res only.
- Thermal: a 5-minute sustained run on a real device must not drop more than 20% fps with the tier
  fixed. If it does, lane 11's governor (C-27 `forceRenderScale`) lowers `renderScale` first, then
  the tier. This lane only reacts to the new settings.

## 20. Screenshots and evidence required

Committed under `docs/project/aura3d-quality-rebuild/evidence/prd03/<phase>/` (lane-owned). Items
1–7 and 9 are produced by this lane's workflows for standalone acceptance. Item 8 and the "after"
game sheets with lane 14's codemod applied come from checkpoint runs.
1. Side-by-side Aura vs three for the `prd03-*` scenes, plus base scenes 02, 03, 06, 08, 09, 13,
   15, 16, 18 at checkpoints (`*-side-by-side.jpg`), with `report.json` metrics.
2. 18-game contact sheets at DSF1, DSF2 and mobile DSF3, flags `none` vs `post` on unmodified
   routes (`<id>-contact.jpg`, `<id>-mid.jpg`, `report.slim.json` with fps and backing size).
3. Pass filmstrips per game for the post stages it uses: off/on for bloom, AO, AA, grade.
4. 4× nearest-neighbour zoom crops of thin geometry (`prd03-thin-aa`, plus courier lane markers,
   vault rails) at DSF 1 and 2, for each AA mode.
5. 16-frame temporal strips for `prd03-taa-motion` and one moving game (turbo-drift).
6. Exposure sweep strip (−2..+2 EV) on `prd03-tone-ramp` and courier-rush. Operator strip
   (ACES now; AgX/Neutral once C-05 is real).
7. Diagnostics JSON per game: `post.stages`, `post.skipped`, `exposure.applied`,
   `velocityCoverage`, `gpuMs`, `qrFlags`, `degradations`.
8. Vision judgments in the 21/23 format and human `signoff.md` per G-PANEL round.
9. Bundle report diff (`tests/reports/bundle-size.json`) and codemod reports.

## 21. Completion criteria

Lane 03 is complete when all of the following hold:
1. Phases 0–6 have met their exit criteria, and with them every standalone criterion S1–S19.
   Phase 7 has met S20.
2. `A3D_QR_POST` has reached `integrated-accepted`: I1–I8 passed at a G-PANEL round. I9–I14 have
   either passed or have open `qr-request`/`qr-ic-regression` issues with an owner. Those open
   issues are the other lanes' work and do not reopen lane 03.
3. Phase 8 (flag removal) is complete, or scheduled per CONTRACTS §5.4 after two `default-on`
   checkpoints.
4. Facts F-03-01..05 are `verified` in CONTRACTS Appendix B.

This PRD's completion does not mean the games are competitive. It means post no longer caps them.
Game competitiveness is lane 14's verdict (C-35).

## 22. Rollback considerations

- Rollback is a flag operation, with no code revert:
  - `A3D_QR_POST` off (or `-post` in any flag list) restores the legacy chain everywhere.
  - `compat:{post:"3.0"}` does the same per app.
  - `RendererPostProcessOptions.pipeline:"legacy"` does the same per renderer.
  - These remain until the flag is `removed` (CONTRACTS §5.4).
- Sub-flags kill single features: `A3D_QR_POST_TAA`, `_AO`, `_SSR`, `_DOF`. Option-level switches
  also work: `antiAlias:"msaa"`, `output.dither:false`, `output.toneMapping:"aces"`, removing a
  bloom node. A tier downgrade through `setQualityTier("low")` (C-27) is the universal fallback.
- A lane 03 PR that turns main red is reverted at once by anyone (CONTRACTS §6.1). Each phase's
  changes are separate PRs.
- Game rollbacks are lane 14's: each route's codemod commit and its route flag
  (`A3D_QR_ROUTE_<ID>`) are separate.
- Flag removal (Phase 8) is the point of no return. It is gated on two `default-on` checkpoints
  with no attributed regression and no `rg "compat:\s*{\s*post"` hits in routes and templates.

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Games look *darker / less glowy* after correct bloom because emissives are < 1.0 (6.6) | high | owner perceives regression | codemod emissive report handed to lane 14 (Q-14-1); C-15 emissive strength; presets document ranges; flag-gated, so default flips only via CONTRACTS §5.3 |
| ANGLE Metal / Safari lacks R11G11B10F renderable or RGBA16F 3D-texture filtering | medium | bloom or LUT path fails | capability probe at init; RGBA16F fallback; analytic grade define |
| `f_ind` alpha corrupted by transparent blending or custom shaders | medium | AO on emissive/sky | `blendFuncSeparate` via C-04 (Q-01-1); custom shaders default `a=0` (no AO); fallback path until C-02 real |
| AO fallback (no `f_ind`) darkens direct-lit creases | high until C-02/Q-02-1 land | slightly heavy AO in sunlit scenes | `u_aoFallbackStrength` 0.6, sky/emissive excluded, presets may lower it; integrated I3 measures the real path |
| TAA ghosting on particles/UI-in-world | medium | smeared VFX in pulse-tunnel, turbo-drift, neon-swarm | luminance-delta heuristic until C-14 MRT + Q-07-3; `color2` reactive mask after (approximate under shared blend state, 6.5); msaa fallback when moving items lack history |
| `preserveDrawingBuffer:false` breaks a caller that reads the canvas outside a frame | medium | blank screenshots in tools/tests | not changed by this lane (Q-15-1, C-05 `capture()`); lane 03 specs read pixels inside the frame callback |
| Bundle headroom: cinematic-scene starter has 1,497 B left under 400,000 B | high | `check:bundle-size` fails in Phase 2 | v2 behind `import()` until Phase 3 removes CPU kernels; per-phase bundle gate |
| FXAA parity target is three's Catlike variant, not NVIDIA 3.11 | low | reviewers expect 3.11 quality | documented in 6.5; SMAA/TAA are the quality modes; 3.11 Quality-12 is a possible follow-up variant |
| Per-object velocity needs C-02 real, Q-01-2 and C-18 previous palette (lanes 01/06) | high | TAA limited to static/camera-motion content | S1 camera velocity; moving-item coverage check falls back to msaa; C-27 already keeps TAA to Ultra |
| A PR 0b carve-out (`LegacyPost.ts`, `PostprocessExecution.ts`, `compiler/postprocess.ts`) is dropped as non-verbatim | low | lane 03 cannot edit that region | Q-01-7 contingency; code stays in lane 03 modules and is wired by the hot-file owner |
| C-05 OutputPass semantics differ from the legacy adapter (e.g. exposure applied twice) | medium | wrong brightness at swap time | adapter passes `exposure: 1`; `post-single-tonemap` spec runs against stub and real (CCR-03-5) |
| Lane 07 does not act on Q-07-2 | medium | engine-level physical DOF/MB fields stay unreachable | legacy `focus/aperture` conversion; renderer-level tests; listed at every checkpoint (CONTRACTS §6.5) |
| MRT + MSAA cost on mobile tilers | medium | frame time | velocity attachments only in taa/motion-blur mode (sampleCount 1); msaa mode never writes velocity |
| Timer queries unavailable on ANGLE Metal | high | no per-stage GPU ms in CI | A/B frame-time deltas with stage toggles; real-device lab |
| Paravirtual runner timings misleading | high | wrong budget conclusions | use deltas only; real-device sign-off required |
| Bundle growth from new shaders | medium | root over budget | CPU kernels leave root; lazy SMAA; per-phase bundle diff gate |
| WebGL2/WebGPU drift | medium | two looks | single TS reference; diff spec ≤ 2 LSB |
| Lean device keeps old shaders | medium | templates look different | Q-15-3 deletion or shared shader import; rg gate |
| Vision judge variance | medium | flaky acceptance | fixed prompt, 2 judge runs, human sign-off decides |
| Deep Recovery's slowness is not only post | medium | fps target missed | Phase 3 exit measures with god rays on vs off; residual filed against lanes 07/11 with diagnostics attribution |

## 24. Explicitly out of scope

- Froxel/raymarched volumetric fog and fog defaults (lane 07, C-21). This PRD only replaces the CPU
  screen-space radial blur with a GPU one.
- Shadow quality and screen-space contact shadows (lane 02, C-11). This PRD drops the contact-shadow
  post pass under its flag.
- SSR algorithm quality: roughness cones, temporal resolve, hierarchical-Z (lane 02). This PRD
  fixes only its placement (HDR, pre-TAA, via C-13) and its depth range.
- Emissive units and `KHR_materials_emissive_strength` (lane 04, C-15).
- Tone-operator GLSL, OutputPass, the no-post tone curve, `app.setOutput`, `capture()` and canvas
  context attributes (lane 01, C-05; R2). This PRD provides only the CPU references and goldens.
- DPR application, device-tier detection, the tier table values and the dynamic-resolution governor
  (lanes 01 and 11, C-27). This PRD provides the upsample/AA stages and maps tier settings to post
  stages.
- Edits to any route, template, skill, example or shared benchmark/capture file (lanes 12, 13, 14).
  This PRD ships codemods, reports, facts and lane scenes.
- HDR display output (`display-p3`, `rgba16float` canvas, `toneMapping: "extended"`). It is
  tracked separately once v2 lands.
- Selection-based outline. The current full-frame Sobel (`WebGL2Device.ts:3004-3091`, now in
  `webgl2/LegacyPost.ts`) stays unchanged in the after-tonemap stage until a follow-up PRD. It is
  not part of the default look.
- Depth-normal prepass with in-shader specular occlusion (Ultra AO alternative, 6.3), lens
  flares, SSGI, letterboxing, and screen-space subsurface scattering.
- Per-game art direction and final competitiveness sign-off (lane 14, C-35).
