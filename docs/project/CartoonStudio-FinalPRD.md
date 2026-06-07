# Aura3D Cartoon Studio — Final PRD (Ground-Truth Audit + Completion Plan)

Status: Proposed
Date: 2026-06-07
Method: 6 parallel code-audit agents read the actual source across engine, rendering/animation/audio, asset system, templates, and editor/tests/tools/docs. Every claim below is from the code, not the prior checklists.

---

## 0. The one-paragraph truth

A **deep, genuinely-engineered cartoon *production-pipeline and validation layer* exists** (≈40 engine modules + rendering/animation/audio helpers + 4 templates + asset federation + editor data-models + gates + docs). It can compile a prompt into a complete, internally-consistent set of typed artifacts (episode plan, storyboard, shot timeline, dialogue, captions, viseme cues, performance cues, render queue, package manifest, evidence) and **one real playback path** moves nodes and plays GLB skeletal clips. **What does not exist is the layer that makes it look like the prompt's cartoon:** real art (cast/set/props), a cel/toon render path, a real video encoder, applied lip-sync, real audio, grounded/staged characters, camera that actually moves, and — critically — **any gate that checks the rendered pixels match the intended scene.** The shipped "video" is a 2D SVG stick-figure cartoon unrelated to the 3D scene, the bundled characters are mis-cast placeholders (Luma is a Mixamo *soldier*), and several manifests hard-code `publishReady: true`. This PRD inventories everything that exists and specifies exactly what to create/modify to close the gap.

---

## 0.5 Round 2 — Adversarial verification (corrections + new findings)

A second 6-agent pass tried to **refute** Round 1 and re-ran the pipeline. Net: the PRD's thesis holds, but several specifics were wrong or incomplete. Corrections below override the tables in §1 where they conflict.

### 0.5.1 The big correction — GPU skeletal skinning does NOT happen in the cartoon route
Round 1 (and my earlier message to you, "characters now play real clips, no T-pose") was **WRONG**. Verified by tracing the chain:
- `createAuraApp`'s WebGL renderer shader declares only `a_position/a_normal/a_color` and `u_model/u_viewProjection/u_color/u_lightDirection` — **no `JOINTS`/`WEIGHTS` attributes, no `u_jointMatrices`, no morph uniform** (`engine/src/agent-api/index.ts` ~8834–8901). Skinning is structurally impossible here.
- `node.play(clip)` just stores `node.animation = {clip}` (`index.ts:7523`). The render loop only interprets **procedural** clip names (`orbit/float/turntable/pulse/walk`); GLB clip names like `"Walking"/"Wave"/"Punch"` **fall through with no effect**. The renderer even logs that "GLB animation mixers are reported as unsupported" (`index.ts:8474`).
- The real skinning stack (`packages/assets/GLTFAnimationRuntime` → `u_jointMatrices` → GLSL LBS; `MorphTarget`/`MorphUnlitMaterial`; `AnimationController.setMorphTargets`) **is real but unreachable from the cartoon templates.**
- So the pose differences seen in the screenshots were **rigid rotation/position (blocking + facing), not skeletal animation.** Characters render in static bind pose. My "no more T-pose" claim does not hold for true skeletal animation.

### 0.5.2 Corrections to specific PRD claims
- **Morph API already exists.** `RuntimeNodeHandle.setMorphTarget(s)` is declared and implemented (`index.ts:7566`), and `AnimationController` already calls it. So §3's proposed `RuntimeNodeMorphTargets.ts` is largely **redundant** — the real gaps are (a) `ShotTimeline.applyNodeUpdate` never forwards viseme `blendshapeWeights` to `setMorphTargets`, and (b) the agent renderer can't render morphs anyway (no morph uniform). Re-scope as a 1-line wiring **plus** a renderer morph path, not a new module.
- **`aura.assets.json` luma entry is ~100% fabricated**, not partial: real `luma.humanoid-fixture.glb` = Mixamo **vanguard** (`mixamorig:*`, meshes `vanguard_Mesh/visor`, materials `Vanguard_VisorMat/VanguardBodyMat`, clips **`Idle/Run/TPose/Walk`** only — note even "Walk" ≠ manifest's "Walking"). Every declared node/material/clip/bonecount is invented.
- **Miko HAS morph targets** (three.js robot-expressive: morphs present, 14 clips) — so once morph weights are wired, **Miko lip-sync is achievable today**; only **Luma** lacks blendshapes (blocked on re-authoring, Phase 4).
- **Starter-pack counts:** it's **26 entries (8 characters / 11 props / 7 sets)**, the 8 "characters" map to **5 distinct** Kenney files (3 are duplicate refs), not "24 blocks / 5 identical." ("no broom" ✓, "moon-garden = grass-cube reused for park" ✓.)
- **Editor inventory (§1.6) miscounted:** only `CartoonSceneEditor.ts` is cartoon-named; the episode/review editor files are a different set; and **more than one** editor file touches real DOM (`TimelineUI`, `PropertyPanel`, `AssetDropZone`, `StaticExportRuntime`, `SceneOutliner`). Drop the "10 files / 9-of-10 no DOM / only TimelineUI" framing.
- **§1.5 omits 6 template src files:** `characters.ts`, `contract.ts`, `render-plan.ts`, `review.ts`, `sets.ts`, `studio.ts`. `render-plan.ts` is load-bearing (owns `deterministicSeed` + screenshot fixtures) → add it to §4 (modify).

### 0.5.3 New findings Round 1 missed
- **Dead-vs-used map:** only **~10 of ~36** agent-api cartoon modules are reached by any shipped template. **~26 are dead/unwired** (CameraChoreographer, ShotTransitionEngine, ShotCompositionRules, SceneSequencer, EpisodeStructure/Templates, all frame encoders, VideoExportPipeline, AudioMuxer, ThumbnailGenerator, BatchEpisodeRenderer, CloudRenderAdapter, PublishingPipeline, PerformanceBlender/PoseEditor/ScriptParser/CaptureSession, CartoonAssetManifest, AssetLibraryBrowser, DialogueAlignment, AudioVisemeAnalyzer, ExternalPhonemeAnalyzer, VisemeTimelineTrack, CartoonMotionQuality, CartoonRouteProof, CartoonEpisodePackage). The public `cartoon`/`animationStudio` namespace doesn't even expose most of them.
- **Origin / history:** the cartoon system was **born whole at 1.0.5** (`9e159bab`: prompt-animation, AuraVoice, ShotTimeline, viseme, CartoonDirector, render queue). **`cartoon-studio` + `episode-builder` templates shipped in 1.0.10, not 1.1.** 1.1 mostly added the *dead* modules. So "1.1 built Cartoon Studio" is itself inaccurate — 1.1 was the latest layer on a system that's several versions old.
- **Cartoon files in OTHER packages (missed by §1):** `scripting/src/CartoonVisualNodes.ts` (WIRED into the visual-node catalog), `scripting/src/CartoonNodeCategories.ts`, `editor-runtime/src/{CartoonSceneEditor,EpisodeReviewPanel,RenderQueuePanel}.ts`, `asset-index/src/{cartoon-profile,cartoon-starter-pack}.ts`, `aura3d-cli/src/cartoon-asset-profiles.ts`.
- **Dead duplicate asset:** `cartoon-studio/public/aura-assets/luma.047f5e5f.glb` is **byte-identical to miko** and unused (luma actually points at the soldier) → delete.
- **Real, unused, cartoon-capable rigged GLBs already in the repo** under `apps/aura-clash-showcase/assets/candidates/`: `skeleton-cartoon.glb` (rigged, 4 clips), `low-poly-soldier-free.glb`, `animated-humanoid-robot.glb`, `animated-girl-walk.glb`, plus CC0 Quaternius `Superhero_Male/Female_FullBody.gltf`. These could seed a real cast faster than authoring from zero (style still needs matching).
- **`cartoon-channel` has a much richer primitive set** than `cartoon-studio`: `createAuraRenderedCartoonScene()` builds ~25 positioned engine primitives (moon-portal sphere+torus, city silhouette, garden floor/mound, a **broom** from boxes, glow stones, lilies, colored point lights). It's plain `@aura3d/engine` calls → **directly reusable** to give cartoon-studio a real-looking set immediately, before authored art.

### 0.5.4 Runtime reality (executed, not read) — this is what actually happens today
- `npm run episode:render` **works, exit 0**, and produces a **real, playable 2.48 MB VP9 1280×720 60s `episode.webm`** via real `ffmpeg`+`sips` — but its content is **2.5D SVG vector "stick-robot" frames**, *not* the 3D engine route. `typecheck`, both browser specs, template `build`, and `aura3d11:readiness` all pass **green**, **no skipped tests**.
- **Two divergent cartoons:** the offline SVG script declares `publishReady:true` and emits the webm; the live 3D browser app declares `sourceOnly:true` / **not** publish-ready. The thing that encodes a video and the thing the route renders are **different artifacts.**
- **Build clobber bug:** `vite build` and `episode:render` both write `dist/` and vite's `emptyOutDir` **wipes the rendered episode**. They must use separate output dirs or strict ordering. (Add to §4 fixes.)

### 0.5.5 PRD ordering/scope fixes (apply to §5)
- **Phase 1's pixel/visual-fidelity gate is blocked by Phase 2** (real capture/encoder). Either gate the existing SVG/placeholder output in Phase 1 and re-target in Phase 2, or move the gate to end of Phase 2.
- **Luma lip-sync is blocked until Phase 4** (no blendshapes); only Miko can lip-sync in Phase 3.
- **Audio mux (Phase 3) depends on the Phase 2 encoder accepting an audio track** — make the Phase 2 `FfmpegFrameEncoder` deliverable include audio, or note the block.
- **Determinism constraint:** the new live-capture + real-encode path must stay deterministic or it breaks `toHaveScreenshot` baselines (`render-plan.ts` already carries `deterministicSeed`).

### 0.5.6 Omissions to add to scope
Aura Clash is a **third** animation consumer (`apps/aura-clash-showcase/src/fighters/FighterAnimator.ts`) — "unify animation systems" is a 3-path problem. Also missing from the PRD: i18n/dub rendering (scaffolding exists, single-language today), a **video-render performance budget**, **output accessibility** (burned-in/embedded captions, contrast), **art licensing/attribution manifest** for authored assets (reconcile with the existing license gate), and a **template-consolidation decision** (4 overlapping templates; `cartoon-channel` still ships 3 rejected `notTrue3D` experiments).

---

## 1. What exists today (ground-truth inventory)
> Note: where §0.5 corrects an item below (esp. GPU skinning, morph API, editor counts, starter-pack counts, the dead-module map), §0.5 is authoritative.

Status legend: **REAL** = does real runtime work · **VALID** = validator/contract only · **META** = descriptive metadata nothing consumes · **STUB** = shell/placeholder · **FAKE** = claims more than it does.

### 1.1 Engine — story / timeline / dialogue / viseme (`packages/engine/src/agent-api/`)
| File | Status | Note |
|---|---|---|
| `CartoonDirector.ts` | REAL | Prompt→artifacts compiler. **Timing is fabricated** (even time/text division; camera = `index % 3`). |
| `EpisodeStructure.ts` | REAL | Act/scene/shot data + interval lookup + validation. |
| `EpisodeTemplates.ts` | META | 5 format constants; `cameraStyle`/`musicCue` consumed by nothing. |
| `ShotTimeline.ts` | **REAL (the core)** | `applyShotPlaybackFrame` moves/rotates/scales nodes, `play(clip)`, primitive mouth card. **No morph-target API → GLB blendshape lip-sync never applied. Camera samples not consumed.** |
| `SceneSequencer.ts` | REAL | Scrub/play controller; only reports state, doesn't push to nodes. |
| `ShotTransitionEngine.ts` | REAL (numbers) | Computes opacity/wipe curves; **nothing composites them.** |
| `ShotCompositionRules.ts` | VALID | Scores 2D boxes the caller supplies; **never projects 3D→screen.** |
| `CameraChoreographer.ts` | REAL (numbers) | Lerps pos/fov; shake = magnitude with **no jitter**; output **not consumed by playback loop.** |
| `CameraPresetLibrary.ts` | META | 9 preset constants. |
| `DialoguePerformance.ts` | REAL | Caption wrap + drift validators. **Captions copy dialogue timestamps → "≤1-frame drift" is true by construction.** |
| `DialogueAlignment.ts` | REAL (unwired) | Could re-time to audio but takes a hand-supplied duration map; **not called by pipeline; doesn't decode audio.** |
| `CaptionExporter.ts` | REAL | Correct VTT/SRT serialization. |
| `AuraVoiceBridge.ts` | VALID (heavy) | Real cross-artifact QA, but validates fabricated timestamps against themselves; `publishReady` = "JSON coherent + assets present." |
| `AudioVisemeAnalyzer.ts` | REAL | Reads real PCM but **amplitude-only**; can't tell "oh" from "ee." |
| `ExternalPhonemeAnalyzer.ts` | STUB | No provider ships; even with one, phonemes are never converted to viseme cues. |
| `VisemeController.ts` | REAL | Cue building/sampling real; **blendshape weights never applied to a mesh.** |
| `VisemeTimelineTrack.ts` | REAL | Manual-edit merge layer; no UI. |

### 1.2 Engine — performance / asset / render / export / package
| File | Status | Note |
|---|---|---|
| `CartoonPerformance.ts` | REAL (data) | Emits pose/gesture cues; **nothing drives a skeleton from them.** |
| `BodyLanguageLibrary.ts` | META | 4 gestures not registered into the sampler. |
| `PerformanceBlender.ts` | REAL (math) | Pose lerp; output consumed by nothing. |
| `PerformancePoseEditor.ts` | STUB | Map wrapper, no wiring. |
| `PerformanceScriptParser.ts` | REAL (trivial) | Tag extraction; no consumer. |
| `PerformanceCaptureSession.ts` | STUB | Manual-data shell; no webcam/mocap; `externalServiceIntegrated:false`. |
| `CartoonAssetManifest.ts` | VALID | Trusts boolean flags (`lipSyncReady`), never inspects files. |
| `AssetLibraryBrowser.ts` | META | Local manifest relabeled as "marketplace." |
| `CartoonRenderQueue.ts` | META+VALID | Plans capture times/scene-state *ids*; renders nothing. |
| `BrowserFrameCaptureAdapter.ts` | REAL (unwired) | Real Playwright screenshot **if** a `page` is injected; no default wiring. |
| `FrameEncoder.ts` | STUB default | In-memory `proofOnly`, `finalize()→undefined`. No file. |
| `MediaRecorderFrameEncoder.ts` | **FAKE** | Claims `encoded-video` but `finalize()` returns **JSON metadata blob**, never runs MediaRecorder. |
| `WebCodecsFrameEncoder.ts` | STUB | Honest: `requiresExternalMuxer`, never instantiates `VideoEncoder`. |
| `PngSequenceEncoder.ts` | REAL-ish | Writes PNG stills only if host supplies `writeFrame`. |
| `AudioMuxer.ts` | VALID (planner) | Real mux *plan*; default adapter `metadata-only`; no container writer. |
| `ThumbnailGenerator.ts` | META | Plan real; image only if runtime supplied. |
| `RenderProgressTracker.ts` | REAL | Full progress/ETA state machine. |
| `VideoExportPipeline.ts` | REAL orchestration | Loop real, honest publish-mode guards — but with defaults produces **no media**. |
| `CartoonMotionQuality.ts` | VALID | Real math over **caller-supplied numbers**, not pixels. |
| `CartoonRouteProof.ts` | VALID | 14 checks over **booleans the caller asserts.** |
| `CartoonEpisodePackage.ts` | VALID | Required-role/byte check over a supplied manifest; doesn't stat disk. |
| `PublishingPipeline.ts` | VALID | Local package descriptor; no upload. |
| `BatchEpisodeRenderer.ts` | META | Job-plan map; no executor. |
| `CloudRenderAdapter.ts` | STUB | Fake `{status:"queued"}` unless caller injects `submit`. |

### 1.3 Pixel / skeletal / sound layer
| File / area | Status | Note |
|---|---|---|
| `rendering/src/cartoon/CartoonRenderPreset.ts` | META | Describes lights/bloom/grade; consumed by nothing. |
| `rendering/src/cartoon/CartoonMaterialStyle.ts` | META | Returns style object; **no shader.** |
| `rendering/src/cartoon/CartoonVisualQuality.ts` | REAL | Real RGBA thresholds — but only as good as pixels fed in. |
| `rendering/src/FrameVisualMetrics.ts` | REAL | Real per-pixel luma/edge/motion analysis (`analyzeRgbaFrameMotionRegions`). |
| `rendering/src/ShaderLibrary.ts` / `ShaderChunks.ts` | — | **Zero toon/cel/ramp/posterize.** Strictly PBR. `MaterialPresets "toon"` self-disclaims banding/outline. |
| `rendering/src/PostProcessPass.ts` `outlinePixels()` | REAL | A genuine Sobel outline post-pass — **not used by cartoon templates.** |
| `assets/src/GLTFAnimationRuntime.ts` | **REAL (the skinning path)** | `applyClip`→`refreshSkinningPalettes`→`u_jointMatrices`→GLSL LBS. Real GLB skeletal animation + morph targets + IK. |
| `animation/src/AnimationController.ts` | REAL (disconnected) | CPU pose blender; **not wired into GPU skinning.** Two parallel animation systems. |
| `animation/src/{AnimationStateGraph,AnimationClipRegistry,MotionQuality,HumanoidRetargeting}.ts` | REAL | Graph/registry/analysis/retarget (lightweight, no quaternion rig conversion). |
| `audio/src/{AudioFileManager,AudioSource,AudioBus,AudioMixer,AudioWaveform}.ts` | REAL | Real Web Audio load/decode/play/mix/DSP. |
| `audio/src/AudioTimelineTrack.ts` | REAL (planner) | Mix/ducking plan; doesn't itself play. |
| **TTS / voice synthesis** | **ABSENT** | No `speechSynthesis`/TTS anywhere; voice = pre-supplied files only. |

### 1.4 Asset system (`packages/asset-index`, `packages/aura3d-cli`)
| File / adapter | Status | Note |
|---|---|---|
| `federate.ts`, `ranking.ts`, `CanonicalAsset.ts`, `index.ts` | REAL | Real fan-out, dedupe, license-safe auto-pull gate. |
| `cartoon-profile.ts` | REAL (filter) | Correctly rejects most generic CC0 as non-cartoon — starves the cast. |
| `cartoon-starter-pack.ts` | **FAKE metadata** | 24 generic **Kenney blocks** relabeled; bounds/tris/rig/viseme tags **hard-coded, partly false**; 5 "characters" byte-identical; `moon-garden`=grass cube (same file as park); **no broom**; flowers don't glow. |
| adapter `jsdelivr-mirror.ts` | REAL | 1074 CC0 GLBs (generic game kits). |
| adapter `os3a.ts` | REAL | CC0, small. |
| adapter `poly-pizza.ts` | REAL (key-gated) | Returns `[]` without API key. |
| adapter `aura-index.ts` | REAL | Cloudflare worker; CC-BY Objaverse + Sketchfab token-exchange URLs (need key to download). |
| adapter `khronos.ts` | REAL (blocked) | Direct URL but `UNVERIFIED` license → never auto-pulled. |
| adapter `poly-haven.ts`, `sketchfab.ts`, `marketplace.ts` | deep-link/key-gated | Discovery only by default. |
| `cli.ts` / `pull-bridge.ts` | REAL | `assets resolve` **does** download top auto-pullable GLB and add a typed ref. |

### 1.5 Templates (`packages/create-aura3d/templates/`)
| File | Status | Note |
|---|---|---|
| `cartoon-studio/src/main.ts` | REAL + PLACEHOLDER | Real `model()` loads + real clip playback; **characters float (y≈0.72–0.75), miscaled (miko ≈6 cm vs luma ≈1.8 m), no cel material applied** (preset is metadata only). |
| `cartoon-studio/public/aura-assets/moonGarden.gltf` | PLACEHOLDER | **3 flat quads**, not a garden. |
| `cartoon-studio/public/aura-assets/miko.047f5e5f.glb` | REAL/miscast | three.js `robot-expressive`. |
| `cartoon-studio/public/aura-assets/luma.humanoid-fixture.glb` | REAL/miscast | **Mixamo "vanguard" SOLDIER**; manifest `aura.assets.json` **lies** (claims luma-body/face nodes that don't exist; no Wave/Jump/Punch clips → partial T-pose). |
| `cartoon-studio/src/episode-renderer.ts` | **FAKE output** | "Video" frames are hand-drawn **SVG stick robots** (`createCartoonFrameSvg`), unrelated to the 3D scene; ffmpeg encodes the SVG to webm; manifests hard-code `hasEncodedVideo/publishReady/status:pass`. |
| `cartoon-studio/src/episode.ts` | REAL (data) | Moon Garden episode: prompt, 3 beats, dialogue. |
| `cartoon-channel/*` | MIXED | Same robot GLB for BOTH characters; primitive moon-garden set; CSS-robot overlay; carries 3 **rejected** 2D experiments (`image-puppet`, `concept-2-5d`, `puppet-2d`, all `notTrue3D:true`). |
| `prompt-cartoon-channel/*`, `episode-builder/*` | PLACEHOLDER | Empty assets → primitive-sphere fallback characters. |

### 1.6 Editor / tests / gates / docs
| Area | Status | Note |
|---|---|---|
| `editor-runtime/src/*` (10 cartoon files) | DATA-MODEL | 9/10 have **no DOM/UI**; only `TimelineUI.ts` is a real widget; some `evidence` flags (`transformGizmos`, `sceneSaveLoad`) **hard-coded true**. |
| `tests/browser/cartoon-studio-*.spec.ts` | STRUCTURAL | Assert JS proof objects + `byteLength>2048`; **no screenshot baselines.** |
| `tests/unit/agent-api/cartoon-*.test.ts` | STRUCTURAL | Validate hand-authored numeric fixtures. |
| `tools/cartoon-studio-*-gate`, `aura3d11-release-readiness` | STRUCTURAL/SELF-REPORT | Check file existence + min bytes + **producer-declared JSON numbers**; never decode the WebM; the one real pixel analyzer (`analyzeRgbaFrameMotionRegions`) is **not wired into any gate.** |
| `docs/*` cartoon docs | HONEST | Docs are more honest than the gates; state "do not render frames," "not Pixar." |

---

## 2. Consolidated gap list (what's missing), prioritized

**P0 — without these it is not a cartoon of the prompt**
1. **Real art: cast.** Authored, rigged, face-blendshape **Miko & Luma** as a matched, to-scale robot pair. (Today: a 6 cm three.js robot + a Mixamo soldier.)
2. **Real art: set.** A modeled **moon garden** (crater floor, glow pebbles, sleepy flowers, planet skyline). (Today: 3 quads.)
3. **Real art: props.** Broom, glow-stones, lilies. (Today: primitives; broom doesn't exist anywhere.)
4. **A cel/toon render path.** A real toon material/shader (ramp/banding + rim) and wiring the existing **Sobel outline** post-pass into the cartoon route. (Today: zero toon shaders; preset is metadata.)
5. **Grounding & scale normalization** at model load/placement so characters stand on the floor at consistent scale.
6. **Single real render→video path.** Capture the actual 3D route via `BrowserFrameCaptureAdapter` and encode a **real** WebM/MP4 (WebCodecs+muxer or ffmpeg over real frames). (Today: SVG stick-figures + fake/JSON "encoders".)
7. **A visual-fidelity gate.** Wire `analyzeRgbaFrameMotionRegions`/`CartoonVisualQuality` over the **real** captured frames; add a "scene matches intent" check (expected characters/set visible, non-blank, motion in character regions). (Today: all gates are structural/self-reported.)
8. **Staged action.** Drive characters to perform the beats (walk to prop → sweep → polish) and the **garden dim→sparkle** world-state change. (Today: idle/wave in place.)

**P1 — needed for believable quality**
9. **Applied lip-sync:** add a morph-target/blendshape applier to the runtime node handle so computed viseme blendshape weights actually move GLB mouths.
10. **Camera that moves:** consume `CameraChoreographer` samples in the playback loop (move the camera node), add real shake jitter, real spline.
11. **Transitions composited:** consume `ShotTransitionEngine` opacities (cross-dissolve/wipe) in the renderer.
12. **Real audio in the episode:** load dialogue/SFX stems via the (already real) audio layer and mux them into the video.

**P2 — honesty + tooling debt (do regardless)**
13. **Fix the lies:** remove hard-coded `publishReady/hasEncodedVideo/status:pass`; make the `aura.assets.json` describe the actual GLB; fix `MediaRecorderFrameEncoder` to either encode real video or stop claiming `encoded-video`.
14. **Unify animation systems** (`@aura3d/animation` pose blender vs `@aura3d/assets` GLTF skinning) or document which is canonical.
15. **Voice:** integrate a TTS/voice provider behind the AuraVoice timing (optional; captioned-silent allowed for v1).

---

## 3. Files to CREATE (reconciled with §0.5)
| File | Purpose |
|---|---|
| `packages/create-aura3d/templates/cartoon-studio/src/skinned-animation-runtime.ts` | **THE core blocker.** Bind GLB skeletal clips + morph (viseme) weights to the route via `@aura3d/assets` `GLTFAnimationRuntime` / `AnimationController` (or back the route with `A3DRenderer`). The default `createAuraApp` renderer has **no skinning/morph in its shader**, so without this there is no real 3D character animation or lip-sync. |
| `packages/rendering/src/cartoon/CartoonToonMaterial.ts` | A real toon/cel material (stepped NdotL ramp + rim) for lit/skinned meshes. |
| `packages/rendering/src/cartoon/applyCartoonRenderPreset.ts` | Wire `CartoonRenderPreset` + the existing Sobel outline post-pass + toon material onto the scene/renderer (turn metadata into pixels). |
| `packages/engine/src/agent-api/SceneGroundingUtils.ts` | Compute GLB bounds → ground (feet on floor) + normalize per-character scale. |
| `packages/engine/src/agent-api/CartoonStagePerformance.ts` | Beats → staged actions (move-to-target, sweep, polish) → node transforms + clip choices over time. |
| `packages/engine/src/agent-api/CartoonWorldState.ts` | Beat-driven scene state changes (lily emissive dim→bright). |
| `packages/engine/src/agent-api/FfmpegFrameEncoder.ts` (or `RealWebCodecsMuxer.ts`) | Real encoder/muxer producing a playable **video+audio** file from captured frames. |
| `packages/create-aura3d/templates/cartoon-studio/src/render-live-route.ts` | Capture the real 3D route via `BrowserFrameCaptureAdapter` → real frames → real encoder (replaces the SVG renderer). |
| `tools/cartoon-studio-visual-fidelity-gate/index.ts` | Decode real video/frames; run `analyzeRgbaFrameVisualMetrics` + motion-region + "expected content present" checks; fail blank/garbage/static/wrong-scene/unshaded. |
| `packages/create-aura3d/templates/cartoon-studio/public/aura-assets/*` (authored GLBs) | Real Miko, Luma, moon-garden set, broom, glow-stone, lily (rigged + face blendshapes where needed). |
| `packages/create-aura3d/templates/cartoon-studio/ASSET-LICENSES.md` | License/attribution manifest for authored/sourced art (reconcile with the federation license gate). |
| `tests/browser/cartoon-studio-visual-fidelity.spec.ts` | Screenshot baselines (`toHaveScreenshot`) for first/dialogue/action/final beats. |

> Dropped vs the first draft: `RuntimeNodeMorphTargets.ts` — the morph API already exists (`setMorphTargets` is implemented and used by `AnimationController`); the real work is *wiring* it in `ShotTimeline` (§4) **and** a renderer that can actually render skinning/morphs (the `skinned-animation-runtime.ts` above). `docs/project/CartoonStudio-FinalPRD.md` is already created (this doc).

## 4. Files to MODIFY (reconciled with §0.5)
| File | Change |
|---|---|
| `packages/create-aura3d/templates/cartoon-studio/src/main.ts` | Use the skinning/morph-capable runtime (not the non-skinning agent renderer); apply toon material + preset + outline; ground/scale characters; consume staged performance + world state; play the camera. |
| `packages/engine/src/agent-api/ShotTimeline.ts` | Forward viseme `blendshapeWeights` to `node.setMorphTargets`; consume camera samples (move camera node); consume transition opacities; head rotation from `gazeTargetId`. (Requires the skinning/morph render path.) |
| `packages/create-aura3d/templates/cartoon-studio/src/episode-renderer.ts` | Stop emitting SVG-as-video; **remove hard-coded `publishReady`/`hasEncodedVideo`/`status:"pass"`**; derive from the real encode result. |
| `packages/create-aura3d/templates/cartoon-studio/src/render-plan.ts` | Preserve `deterministicSeed` + screenshot fixtures across the new live-capture path so `toHaveScreenshot` baselines stay stable. |
| `packages/create-aura3d/templates/cartoon-studio/aura.assets.json` | Regenerate from the real authored GLBs — current luma entry is **~100% fabricated** (claims robot nodes/`Walking`/`Wave` clips; real file is a Mixamo soldier with `Idle/Run/TPose/Walk`). |
| `packages/create-aura3d/templates/cartoon-studio/vite.config.* + package.json` | **Fix the dist-clobber bug**: `vite build` (`emptyOutDir`) wipes `episode:render` output; give them separate output dirs or strict ordering. |
| `packages/engine/src/agent-api/CameraChoreographer.ts` | Real catmull-rom spline; real shake jitter. |
| `packages/engine/src/agent-api/MediaRecorderFrameEncoder.ts` | Run a real `MediaRecorder` or remove the false `encoded-video` claim (today `finalize()` returns a JSON blob). |
| `packages/engine/src/agent-api/ShotCompositionRules.ts` | Add 3D→screen projection so framing reflects the real scene/camera. |
| `packages/engine/src/agent-api/DialogueAlignment.ts` + `CartoonDirector.ts` | Wire audio-duration re-timing instead of fabricated even-division timing. |
| `packages/asset-index/src/cartoon-starter-pack.ts` | Measured (not hard-coded) metadata; stop mapping `moon-garden`→grass cube; add real broom/flower/glow or mark unavailable. |
| `tools/aura3d11-release-readiness/index.ts` | Require the new visual-fidelity gate. |
| `tools/cartoon-studio-{visual-quality,motion-quality}-gate/index.ts` | Decode real frames/video instead of trusting self-declared JSON numbers. |
| `packages/engine/src/agent-api/CartoonEpisodePackage.ts` + `CartoonRouteProof.ts` | Derive booleans/counts from measured artifacts, not caller assertions. |

**Delete / decide:**
| Action | Item |
|---|---|
| DELETE | `packages/create-aura3d/templates/cartoon-studio/public/aura-assets/luma.047f5e5f.glb` — dead, byte-identical to miko, unused. |
| DECIDE | Consolidate/quarantine `cartoon-channel`, `prompt-cartoon-channel`, `episode-builder` (cartoon-channel still ships 3 rejected `notTrue3D:true` experiments). Reuse cartoon-channel's richer primitive set (`createAuraRenderedCartoonScene`) as the interim moon-garden. |

---

## 5. Phased task list + checklist (reordered per §0.5.5)

### Phase 0 — Honesty & foundation (no new art, no new render path) — ✅ COMPLETE
- [x] Remove hard-coded `publishReady`/`hasEncodedVideo`/`status:"pass"` — `scripts/episode.ts` now runs `verifyEncodedOutputs()` post-encode so `hasEncodedVideo`/`encodedVideoPresent`/`real-encoded-video` are **verified facts** from the actual `episode.webm` (records real `byteLength`), not constants.
- [x] Fix `MediaRecorderFrameEncoder` — now reports `proofOnly:true`/`memory-summary` unless a real `outputFactory` is injected (only then `encoded-video`); test updated to the honest contract.
- [x] Regenerate `aura.assets.json` from the actual GLB binaries (luma now correctly = Mixamo soldier with `Idle/Run/TPose/Walk`, miko = 14 real clips + `Angry/Surprised/Sad` morphs); `src/aura-assets.ts` clip lists fixed; **deleted** the dead `luma.047f5e5f.glb`.
- [x] Added `SceneGroundingUtils` (`groundedYOffset`/`normalizedScaleForTargetHeight`/`groundedPlacement`, +7 unit tests); `main.ts` now grounds + scale-normalizes Miko/Luma to a shared height on the path (no more floating/mismatched scale).
- [x] Fixed the `vite build` / `episode:render` dist-clobber via `vite.config.ts` (`emptyOutDir:false`).
- [x] Added `tools/cartoon-studio-visual-fidelity-gate` — decodes real frame PNGs to RGBA (sharp), runs `analyzeRgbaFrameVisualMetrics` + `analyzeRgbaFrameMotionRegions`, FAILs on blank/static/no-motion. Verified: catches solid-black + byte-identical frames; PASSes on the real 1280×720 render.
- Verification: `pnpm typecheck` ✅, `pnpm build` ✅, 56 cartoon/grounding/toon unit tests ✅, `episode:render` produces a real 2.48 MB VP9 webm with verified flags ✅, fidelity gate PASS on real pixels ✅.

### Phase 1 — Real 3D render path (THE core blocker; still placeholder art)
- [ ] Add `skinned-animation-runtime.ts`: route uses a **skinning/morph-capable renderer** (`@aura3d/assets` `GLTFAnimationRuntime` / `AnimationController` / `A3DRenderer`) — the agent renderer can't skin.
- [ ] Implement `CartoonToonMaterial` + `applyCartoonRenderPreset`; apply in `main.ts` (toon + outline + lighting/grade).
- [ ] Implement `render-live-route.ts`: capture the real 3D route via `BrowserFrameCaptureAdapter`.
- [ ] Implement `FfmpegFrameEncoder`/muxer (video **+ audio** track); make `VideoExportPipeline` default to real capture+encode in the template.
- [ ] Add `toHaveScreenshot` baselines; re-target the visual-fidelity gate to the real frames; keep deterministic.

### Phase 2 — Performance, camera, lip-sync, audio
- [ ] `CartoonStagePerformance` + `CartoonWorldState`: walk/sweep/polish; lilies dim→sparkle.
- [ ] `ShotTimeline` consumes camera samples (camera moves per shot) + transition opacities; gaze head rotation.
- [ ] Forward viseme blendshape weights → `setMorphTargets` → mouths move. *(Miko works now; **Luma blocked until Phase 3 art** — soldier GLB has no blendshapes.)*
- [ ] Load real dialogue/SFX audio; mux into the video. *(Requires the Phase 1 encoder to accept an audio track.)*

### Phase 3 — Real art (the "looks like a cartoon" step)
- [ ] Author rigged **Miko** + **Luma** (matched style, to scale, face blendshapes). *(Consider seeding from existing repo candidates: `apps/aura-clash-showcase/assets/candidates/skeleton-cartoon.glb`, Quaternius superheroes.)*
- [ ] Author **moon-garden set** + **broom** + **glow-stones** + **lilies** (emissive). *(Interim: reuse cartoon-channel `createAuraRenderedCartoonScene`.)*
- [ ] Ingest via `assets add`; regenerate typed `aura-assets.ts` + manifest + `ASSET-LICENSES.md`.
- [ ] Re-render; update baselines; visual-fidelity gate passes on final art; Luma lip-sync now works.

### Phase 4 — Scope decisions, verification & release
- [ ] Template consolidation decision (consolidate/quarantine the other 3 templates; remove rejected `notTrue3D` experiments from release-facing scripts).
- [ ] i18n/dub decision (state out-of-scope for v1 or plan); reconcile with existing `CaptionExporter.language` + localization fixtures.
- [ ] Add a **video-render performance budget** gate.
- [ ] Output **accessibility**: embedded/burned-in captions + contrast check on the rendered video.
- [ ] Unify animation systems (note: **three** consumers — `@aura3d/animation` CPU blender, `@aura3d/assets` GPU skinning, Aura Clash `FighterAnimator`).
- [ ] `pnpm typecheck && pnpm build` green; all cartoon specs (incl. visual-fidelity) green; `pnpm aura3d11:readiness` green **with the visual-fidelity gate required**; human review; republish `create-aura3d`; redeploy.

---

## 6. Definition of done
The Moon Garden episode, rendered by the **real 3D route**, shows two **on-model, grounded, to-scale** robots, **cel-shaded**, in a **recognizable moon garden**, performing the script (sweep/polish) with **mouths that move** during dialogue and a **garden that brightens** at the end, exported as a **real playable video** — and a **pixel-level gate fails** if any of that is blank, garbage, static, mis-cast, or unshaded. No manifest may assert publish-readiness that the rendered output doesn't actually satisfy.
