# Aura3D 1.1 - Cartoon Studio And Animation Engine PRD

Version: 1.1
Date: 2026-06-06
Status: Proposed major-release PRD
Baseline: Aura3D 1.0.10
Primary goal: Turn Aura3D's current prompt-animation contracts into a real, repeatable browser-native cartoon production pipeline that outputs a believable animated episode package, not a still-image demo or source-only proof.

## Executive Summary

Aura3D 1.0.10 is a credible AI-native browser 3D SDK foundation: typed assets, templates, prompt animation contracts, game runtime helpers, asset diagnostics, screenshots, deployment checks, and release evidence exist. The cartoon work already has meaningful pieces: show-bible structures, shot timelines, dialogue/caption tracks, viseme contracts, AuraVoice timing bridge, render queue metadata, template routes, cartoon asset profiles, and source-level proof tests.

The gap is execution quality.

The failed `tests/reports/prompt-animation/cartoon-image-puppet-animation.webm` experiment proves the current danger: a beautiful generated 2D still can be wrapped in CSS transforms and exported as a video, but that is not a real Aura3D cartoon. A release cannot count image shaking, flat cutout sliding, fake parallax, or subtitle-over-still output as animation proof. Those are rejected artifacts, not product evidence.

Aura3D 1.1 must ship one complete vertical slice:

- one 45-60 second browser-rendered cartoon episode;
- two recurring typed characters;
- one typed set;
- real character motion driven by rigged 3D assets or an explicit segmented 2D rig;
- shot timeline playback with camera direction;
- dialogue, captions, and visible mouth movement;
- encoded WebM or MP4 output;
- thumbnail, captions, metadata, provenance, and publish-readiness JSON;
- visual acceptance gates that fail non-believable motion.

The goal is not to claim Pixar parity. The goal is to prove Aura3D can take reusable assets and a structured prompt into a repeatable, agent-readable, evidence-backed cartoon episode package.

## Product Position

Aura3D 1.1 should be positioned as:

- AI-native TypeScript SDK for browser-first 3D and animated episode creation.
- Typed asset and evidence workflow for agents that need to generate, validate, preview, render, and package 3D cartoon content.
- A repeatable cartoon production pipeline for short-form episodes and YouTube-style channel workflows.

Aura3D 1.1 must not be positioned as:

- Pixar-quality automatic animation.
- A replacement for Blender, Maya, Unreal, Unity, Toon Boom, or After Effects.
- A magic image-to-video engine.
- A video generator that can take any single image and turn it into a production cartoon.
- A proof that still images with CSS transforms are real animation.

## North Star Demo

Build one flagship demo:

Show: Moon Garden Helpers

Episode: The Glowing Moon Weeds

Format:

- 45-60 seconds.
- 720p.
- 24 or 30 fps.
- Browser preview route.
- WebM required; MP4 optional if browser/runtime support is available.

Characters:

- Miko.
- Luma.

Set:

- Moon Garden.

Story:

Miko and Luma discover glowing weeds in the moon garden, work together to clean them up, and make the garden sparkle before bedtime.

Required output:

```text
dist/episodes/moon-garden-001/
  episode.webm
  episode.mp4                 # optional when encoder support exists
  thumbnail.png
  captions.vtt
  captions.srt
  metadata.json
  prompt-animation-evidence.json
  route-proof.json
  asset-provenance.json
  render-manifest.json
  visual-acceptance.json
  review-package.md
```

## Command Contract

The 1.1 vertical slice is successful only if the release candidate can scaffold and verify a clean project outside the monorepo. Pre-publish proof uses the freshly built local `create-aura3d` and CLI dist output through `pnpm cartoon-studio:template:smoke` / `pnpm aura3d11:readiness --execute-template-smoke`. After publishing 1.1, the same workflow must pass from npm `@latest`:

```bash
npx create-aura3d@latest moon-garden --template cartoon-studio
cd moon-garden
npx @aura3d/cli@latest assets resolve "stylized rigged cartoon child robot" --name miko --profile cartoon-character
npx @aura3d/cli@latest assets resolve "stylized rigged cartoon helper robot" --name luma --profile cartoon-character
npx @aura3d/cli@latest assets resolve "stylized moon garden set" --name moonGarden --profile cartoon-set
npx @aura3d/cli@latest assets validate-cartoon --require-license --no-placeholders
npm run episode:plan
npm run episode:preview
npm run episode:render
npm run episode:package
npm run episode:review
```

The template may include a curated starter asset pack for CI/offline proof, but production-ready proof must use typed asset entries from `aura.assets.json`, imported from `./src/aura-assets`, and consumed through `model(assets.x)`.

## Current Codebase Audit

| Area | Current files | Current status | 1.1 gap |
| --- | --- | --- | --- |
| Public cartoon facade | `packages/engine/src/agent-api/index.ts` exports `cartoon` / `animationStudio` helpers. | Episode plans, story bibles, shot timelines, captions, visemes, render queues, and evidence are public. | Facade does not yet expose a complete episode renderer/review/package workflow. |
| Prompt contracts | `PromptAnimationContract.ts`, `CartoonDirector.ts`, `EpisodeStructure.ts`, `EpisodeTemplates.ts`. | Strong typed metadata foundation exists. | Need stricter 1.1 episode schema with asset readiness, motion readiness, render outputs, and review status. |
| Shot playback | `ShotTimeline.ts`, `SceneSequencer.ts`, `ShotTransitionEngine.ts`, `CameraChoreographer.ts`, `CameraPathEditor.ts`, `CameraPresetLibrary.ts`, `ShotCompositionRules.ts`. | Timeline and camera concepts exist. | Need browser route proof that camera moves, cuts, transitions, and character blocking actually render frame-to-frame. |
| Dialogue and captions | `DialoguePerformance.ts`, `CaptionExporter.ts`, `AuraVoiceBridge.ts`, `DialogueAlignment.ts`. | Caption and bridge metadata exist; VTT/SRT helpers exist. | Need real exported caption files in package and rendered subtitle timing proof from video frames. |
| Visemes | `VisemeController.ts`, `VisemeTimelineTrack.ts`, `AudioVisemeAnalyzer.ts`, `WaveformVisualizer.ts`. | Primitive mouth and GLB blendshape cue contracts exist. Audio analysis is amplitude-based. | Need visible mouth movement proof, manual correction UI, and honest labeling that amplitude analysis is not full phoneme recognition. |
| Performance | `CartoonPerformance.ts`, `BodyLanguageLibrary.ts`, `PerformanceBlender.ts`, `PerformancePoseEditor.ts`, `PerformanceScriptParser.ts`. | Gesture and emotion libraries exist. | Need real runtime application to characters and motion-quality evidence. |
| Video export | `VideoExportPipeline.ts`, `FrameEncoder.ts`, `AudioMuxer.ts`, `RenderProgressTracker.ts`. | Pipeline contract exists, but default encoder/muxer is in-memory summary unless a real adapter is provided. | Need actual browser or Node/headless encoder adapter that writes a playable WebM/MP4 file. |
| Rendering | `packages/rendering/src/Renderer.ts`, `FrameVisualMetrics.ts`, `PostProcessPass.ts`, `cinematic/*`, `effects/*`, `production-runtime/*`. | Renderer has advanced pieces and frame metrics. | Need cartoon render preset, visual quality gate, real frame capture, nonblank checks, and motion-delta checks. |
| Asset profiles | `packages/asset-index/src/cartoon-profile.ts`, `cartoon-starter-pack.ts`, `packages/aura3d-cli/src/cartoon-asset-profiles.ts`. | Cartoon profile search and starter-pack data exist. | Need production asset validation for characters, sets, props, lip sync, animation clips, licensing, and route readiness. |
| Templates | `cartoon-channel`, `prompt-cartoon-channel`, `cartoon-studio`, `episode-builder`. | Templates build source-level routes and metadata. Several `render-plan.ts` files report `sourceOnly: true`. | 1.1 must replace source-only proof with rendered episode output and remove failed puppet demos from release-facing proof. |
| Editor runtime | `TimelineUI.ts`, `TimelineEditorController.ts`, `KeyframeEditor.ts`, `CurveEditor.ts`, `CartoonSceneEditor.ts`, `AssetDropZone.ts`. | Editor data/control widgets exist. | Need an episode review/edit route focused on shot timeline, captions, waveform, visemes, camera, and render queue. |
| Audio runtime | `packages/audio/src/AudioFileManager.ts`, `AudioTimelineTrack.ts`, `AudioWaveform.ts`, `AudioMixer.ts`, `AudioSource.ts`. | Audio loading/mixing foundations exist. | Need typed dialogue/audio stem loading in cartoon templates and render/mux evidence. |
| Tests | `tests/unit/agent-api/cartoon-production-pipeline.test.ts`, `tests/unit/cartoon-engine/aura3d107-agent-api.test.ts`, template Playwright tests. | Unit tests prove contracts and in-memory export paths. | Need browser render/export tests that verify motion, video duration, frame count, caption timing, and visual acceptance. |
| Release tools | `tools/prompt-animation-*`, `tools/aura3d106-release-readiness`, `tools/current-routes-visual-review`. | Prior release gates exist. | Need `tools/aura3d11-release-readiness` and cartoon-specific visual/video/package gates. |

## Rejected 1.0.10 Cartoon Artifacts

These artifacts must not be used as release proof for 1.1:

- `tests/reports/prompt-animation/cartoon-image-puppet-animation.webm`
- `packages/create-aura3d/templates/cartoon-channel/src/image-puppet-episode.ts`
- `packages/create-aura3d/templates/cartoon-channel/src/image-puppet-episode.css`
- `packages/create-aura3d/templates/cartoon-channel/tests/image-puppet*.spec.ts`
- Any route whose proof says `notTrue3D: true`.
- Any route that uses one generated still image as the main animation surface and only translates, scales, wobbles, pans, shakes, or reveals portions of it.

Allowed use:

- Historical failure evidence under non-shipping docs or reports.
- A negative regression fixture proving the visual gate rejects flat still-image motion.

Required cleanup:

- Remove these routes from default template tests and public README flows, or quarantine them under an explicit `experimental-failed/` path that is not included in release readiness.
- Add a source gate that fails if `image-puppet`, `notTrue3D: true`, or `sourceOnly: true` is used as 1.1 publish-readiness evidence.

## Release Pillars

1. Real episode output: a playable encoded file, not an in-memory summary.
2. Real character motion: rigged GLB animation or segmented 2D rig motion with independently articulated body parts.
3. Typed assets: no invented URLs, no string asset IDs, no placeholder-only release proof.
4. Shot direction: timeline, camera, blocking, transitions, and captions drive visible playback.
5. Audio and mouth sync: dialogue timing, captions, waveform, viseme cues, and rendered mouth movement are all checked.
6. Visual quality: cartoon preset, lighting, framing, postprocess, and motion quality pass automated and human gates.
7. Review package: generated artifacts are easy for a human to inspect and approve.
8. Honest claims: no Pixar, no full studio replacement, no magic image-to-video claim.

## Feature Specifications

### P0. Episode Package Renderer

Goal: `npm run episode:render` produces a playable WebM file and a complete package folder.

Current foundation:

- `VideoExportPipeline.ts`
- `FrameEncoder.ts`
- `AudioMuxer.ts`
- `CartoonRenderQueue.ts`
- `PublishingPipeline.ts`

Required work:

- Add a real browser encoder adapter using MediaRecorder and/or WebCodecs.
- Add a headless Playwright render runner that opens the cartoon route, seeks the shot timeline, captures frames, and writes video output.
- Add a fallback PNG-sequence export for environments where WebM/MP4 encoding is unavailable.
- Add package writer that persists video, captions, thumbnail, metadata, route proof, provenance, and readiness JSON.
- Stop treating `createInMemoryFrameEncoderAdapter()` output as release-ready.

Acceptance:

- `episode.webm` exists and is playable.
- Duration is within 5 percent of the episode runtime.
- Frame count is within 2 frames of `duration * frameRate`.
- Video has nonzero byte size above a minimum threshold.
- Video frame hashes differ across motion beats.
- The package includes all required metadata files.

### P0. Real Motion Gate

Goal: prevent another still-image wobble from passing as animation.

Required work:

- Add a video motion analyzer that samples frames and identifies character/body-region motion, not just global camera shake.
- Detect global-only transforms by comparing whole-frame motion against local character/object motion.
- Require independent motion in at least two character regions during action beats: head, torso, arm, hand, leg, mouth, or prop.
- Require mouth movement during dialogue beats.
- Require camera motion only when the shot timeline says a camera move exists.
- Reject motion if the background and characters move as a single flat layer for more than a short transition.

Acceptance:

- The `cartoon-image-puppet-animation.webm` style output fails the gate.
- A real rigged-asset or segmented-puppet output passes with per-region motion evidence.
- `visual-acceptance.json` lists motion segments, frame hashes, region deltas, mouth deltas, and failures.

### P0. Typed Cartoon Asset Readiness

Goal: two characters and one set are validated before rendering.

Current foundation:

- `packages/asset-index/src/cartoon-profile.ts`
- `packages/asset-index/src/cartoon-starter-pack.ts`
- `packages/aura3d-cli/src/cartoon-asset-profiles.ts`
- `packages/aura3d-cli/src/game-asset-validator.ts`
- `CartoonAssetManifest.ts`
- `AssetLibraryBrowser.ts`

Required work:

- Strengthen `assets validate-cartoon` for:
  - two distinct character assets;
  - license/provenance/checksum;
  - animation clips or segmented-rig metadata;
  - mouth/blendshape readiness or primitive mouth-card fallback;
  - bounds and scale;
  - texture/material readiness;
  - set walkability/framing metadata;
  - prop attachment metadata.
- Add `--episode` validation mode that reads the template episode config and proves all referenced typed assets exist.
- Add a curated Moon Garden starter manifest for CI proof, with explicit license records.

Acceptance:

- Bad assets fail before rendering.
- Placeholder-only templates cannot be called publish-ready.
- Two-character/single-set validation writes `asset-provenance.json`.

### P0. Cartoon Runtime Route

Goal: a browser route previews the episode timeline and exposes route proof.

Current foundation:

- `packages/create-aura3d/templates/cartoon-studio/src/main.ts`
- `cartoon-channel/src/main.ts`
- `prompt-cartoon-channel/src/main.ts`
- `installShotPlayback(...)`

Required work:

- Replace source-only preview with a route that advances a real timeline.
- Bind typed character/set assets through `model(assets.x)`.
- Apply shot camera, character blocking, gesture state, captions, mouth state, and audio cues every frame.
- Expose `window.__AURA3D_CARTOON_EPISODE_PROOF__`.
- Add route controls: play, pause, scrub, shot jump, captions toggle, mute, review markers.
- Add reduced-motion and reduced-flash modes without changing deterministic proof.

Acceptance:

- Playwright can scrub through all shots.
- Every shot shows the expected characters and captions.
- Proof reports active shot, active captions, active visemes, active gestures, asset IDs, frame count, route errors, and nonblank status.

### P0. Character Performance Runtime

Goal: characters visibly act, not just stand in front of captions.

Current foundation:

- `CartoonPerformance.ts`
- `BodyLanguageLibrary.ts`
- `PerformanceBlender.ts`
- `PerformancePoseEditor.ts`
- `AnimationController.ts`
- `AnimationClipRegistry.ts`
- `AnimationMixer.ts`

Required work:

- Add runtime adapter that maps cartoon performance cues to:
  - GLB clips when available;
  - animation state graph states;
  - procedural/segmented fallback only when explicitly marked;
  - mouth cards or blendshape weights.
- Define required performance states:
  - idle/listen;
  - speak;
  - gesture-wave;
  - point;
  - walk;
  - pick-up/clean-up;
  - react/surprised;
  - happy/celebrate.
- Add motion coverage report per character and per shot.

Acceptance:

- Each character has visible body motion in at least three shots.
- Dialogue shots have mouth motion.
- Action shots have arm/prop motion.
- The episode fails readiness if characters remain static through more than one non-establishing shot.

### P0. Captions, Dialogue, And Audio

Goal: dialogue timing is visible, audible when audio exists, and exportable.

Current foundation:

- `DialoguePerformance.ts`
- `AuraVoiceBridge.ts`
- `CaptionExporter.ts`
- `AudioFileManager.ts`
- `AudioTimelineTrack.ts`
- `AudioWaveform.ts`

Required work:

- Add typed audio asset loading for dialogue and SFX in cartoon templates.
- Export VTT and SRT.
- Add waveform preview to the review route.
- Add audio stem manifest to package.
- Add browser autoplay unlock and mute state to route proof.
- Add generated silent/dialogue placeholder mode only for development, never publish-ready.

Acceptance:

- `captions.vtt` and `captions.srt` exist.
- Captions appear within one frame of intended cue time in browser proof.
- Audio stems are either valid typed files or readiness explicitly says audio is missing.
- Publish-ready mode requires no missing dialogue audio unless the release explicitly scopes itself to silent/subtitled proof.

### P0. Viseme And Mouth Movement

Goal: the audience sees mouth movement tied to dialogue.

Current foundation:

- `VisemeController.ts`
- `VisemeTimelineTrack.ts`
- `AudioVisemeAnalyzer.ts`

Required work:

- Keep amplitude-based analysis as a baseline only.
- Add manual correction/edit data to the episode package.
- Support GLB blendshape cues when assets expose relevant morph targets.
- Support primitive mouth cards only as a fallback.
- Add rendered mouth-motion evidence from frame samples.

Acceptance:

- Every dialogue line has at least one viseme or mouth-card cue.
- Rendered proof shows mouth-region pixel/morph change during speaking.
- Readiness distinguishes:
  - `blendshape-lip-sync`;
  - `primitive-mouth-card`;
  - `amplitude-only`;
  - `missing-mouth-motion`.

### P0. Visual Quality Preset

Goal: the output looks like a deliberate cartoon route, not raw debug geometry.

Current foundation:

- `packages/rendering/src/cinematic/*`
- `packages/rendering/src/postprocess/*`
- `packages/rendering/src/effects/*`
- `FrameVisualMetrics.ts`
- `RendererVisualPipelineReport.ts`

Required work:

- Add `packages/rendering/src/cartoon/CartoonRenderPreset.ts`.
- Add cartoon lighting/material defaults:
  - readable silhouettes;
  - soft shadows;
  - controlled bloom;
  - color grading;
  - fog/depth cues where appropriate;
  - cel/toon material option for assets.
- Add `packages/rendering/src/cartoon/CartoonVisualQuality.ts`.
- Add visual metrics for:
  - nonblank frame;
  - over/under exposure;
  - text occlusion;
  - character visibility;
  - foreground/background separation;
  - excessive global-only motion.

Acceptance:

- First/action/dialogue/final frames pass visual metrics.
- No debug labels, route panels, browser UI, or proof overlays appear in exported video.
- Human review package contains representative stills.

### P0. Template Upgrade

Goal: `cartoon-studio` becomes the production vertical-slice template.

Current foundation:

- `packages/create-aura3d/templates/cartoon-studio/*`
- `packages/create-aura3d/templates/cartoon-channel/*`
- `packages/create-aura3d/templates/prompt-cartoon-channel/*`
- `packages/create-aura3d/templates/episode-builder/*`

Required work:

- Promote `cartoon-studio` as the 1.1 main template.
- Move `cartoon-channel` / `prompt-cartoon-channel` to docs/example status unless they meet render-package gates.
- Remove or quarantine `image-puppet`, `concept-2-5d`, and `puppet-2d` views from release-facing scripts.
- Add template scripts:

```json
{
  "episode:plan": "...",
  "episode:preview": "...",
  "episode:render": "...",
  "episode:package": "...",
  "episode:review": "...",
  "episode:verify": "..."
}
```

Acceptance:

- Clean temp project can scaffold, install, build, render, package, and review.
- Template README describes exact asset requirements and honest fallback boundaries.

### P0. Release Readiness Tool

Goal: one command fails the release if the cartoon pipeline is fake or incomplete.

Required work:

- Create `tools/aura3d11-release-readiness/index.ts`.
- Create `tools/cartoon-studio-package-proof/index.ts`.
- Create `tools/cartoon-studio-visual-quality-gate/index.ts`.
- Create `tools/cartoon-studio-motion-quality-gate/index.ts`.
- Create `tools/cartoon-studio-docs-claims/index.ts`.

Acceptance:

```bash
pnpm aura3d11:readiness
```

must run:

- typecheck;
- build;
- cartoon unit tests;
- cartoon template external smoke;
- asset validation;
- route Playwright proof;
- render/package proof;
- visual quality gate;
- motion quality gate;
- docs claims gate.

## Filename-Level Implementation Map

### Engine Agent API Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/engine/src/agent-api/PromptAnimationContract.ts` | Modify | Add 1.1 episode readiness fields for asset mode, motion mode, render output mode, review status, and publish target. | P0 | [x] Schema distinguishes source-only, preview-only, render-ready, and publish-ready through `PromptAnimationEpisodeReadiness`. [x] Existing 1.0.10 callers stay source-compatible because readiness is optional/input-defaulted and focused tests pass. |
| `packages/engine/src/agent-api/CartoonDirector.ts` | Modify | Generate plans that include render/package requirements, not only storyboard/timeline metadata. | P0 | [x] Director plan includes asset slots, motion requirements, output package, review gates. |
| `packages/engine/src/agent-api/CartoonRenderQueue.ts` | Modify | Make render queues drive actual video export and representative screenshot capture. | P0 | [x] Queue includes frame list, seek mode, output targets, thumbnail frame, evidence frames. |
| `packages/engine/src/agent-api/VideoExportPipeline.ts` | Modify | Reject in-memory encoder output for publish-ready mode and expose package writing hooks. | P0 | [x] Publish mode fails without real adapter output. [x] Result reports file path, bytes, frame count, duration through `VideoExportOutputSummary`. |
| `packages/engine/src/agent-api/FrameEncoder.ts` | Modify | Add adapter contract for real browser/headless WebM/MP4/PNG-sequence output. | P0 | [x] In-memory adapter is explicitly `proofOnly`. [x] Encoder support evidence is exported. |
| `packages/engine/src/agent-api/BrowserFrameCaptureAdapter.ts` | Create | Browser/headless capture adapter for Playwright route frame capture. | P0 | [x] Captures deterministic route frames. [x] Handles device scale factor and viewport. |
| `packages/engine/src/agent-api/MediaRecorderFrameEncoder.ts` | Create | Browser WebM encoder adapter. | P0 | [x] Produces playable WebM Blob/file in supported-mode adapter tests. [x] Fallback status is explicit when unsupported. |
| `packages/engine/src/agent-api/WebCodecsFrameEncoder.ts` | Create | WebCodecs encoder adapter where available. | P1 | [x] Encodes H.264/VP9 where runtime supports it through non-proof encoded-output adapter metadata. [x] Capability probe is tested. |
| `packages/engine/src/agent-api/PngSequenceEncoder.ts` | Create | Deterministic fallback for frame sequence output. | P0 | [x] Writes PNG frames and manifest. [x] Package readiness can use this only when video output is explicitly scoped. |
| `packages/engine/src/agent-api/AudioMuxer.ts` | Modify | Distinguish real muxed output from metadata-only mux summary. | P0 | [x] Publish mode fails if audio muxing is claimed but no output exists; mux artifacts report `outputMode` and `publishReady`. |
| `packages/engine/src/agent-api/CartoonEpisodePackage.ts` | Create | Single package writer/reader for episode output folders. | P0 | [x] Writes all required files. [x] Validates package completeness. |
| `packages/engine/src/agent-api/CartoonMotionQuality.ts` | Create | Motion analysis contract for rendered frame/video evidence. | P0 | [x] Detects global-only still-image shake. [x] Reports per-region motion. |
| `packages/engine/src/agent-api/CartoonRouteProof.ts` | Create | Stable proof schema for browser cartoon episode route. | P0 | [x] Reports assets, shots, captions, visemes, gestures, render state, errors. |
| `packages/engine/src/agent-api/PromptAnimationEvidence.ts` | Modify | Fold video/package/motion/visual evidence into publish readiness. | P0 | [x] Source-only evidence cannot pass publish-ready checks. |
| `packages/engine/src/agent-api/PublishingPipeline.ts` | Modify | Validate upload-ready package contents. | P0 | [x] Package includes video, captions, metadata, thumbnail, provenance, route proof readiness checks. |
| `packages/engine/src/agent-api/ThumbnailGenerator.ts` | Modify | Generate thumbnail from actual route frame, not placeholder metadata. | P0 | [x] Thumbnail file evidence includes path, bytes, checksum, and same-route scene-state capture metadata. |
| `packages/engine/src/agent-api/CaptionExporter.ts` | Modify | Ensure VTT/SRT output is package-ready. | P0 | [x] Captions export exact file-ready VTT/SRT text with bytes and deterministic checksum. |
| `packages/engine/src/agent-api/AudioVisemeAnalyzer.ts` | Modify | Label amplitude analysis honestly and support manual correction evidence. | P0 | [x] Output says `amplitude-only` unless phoneme alignment is present. |
| `packages/engine/src/agent-api/VisemeTimelineTrack.ts` | Modify | Persist manual mouth-cue edits. | P0 | [x] Review UI edits round-trip into package JSON through `manualEdits` and sampled cue replacement. |
| `packages/engine/src/agent-api/CartoonPerformance.ts` | Modify | Add required 1.1 performance state coverage. | P0 | [x] Coverage fails static characters. |
| `packages/engine/src/agent-api/PerformanceBlender.ts` | Modify | Apply transitions between gestures/poses at runtime. | P1 | [x] Gesture transitions are smooth and deterministic through `createPerformanceTransitionPlan(...)`. |
| `packages/engine/src/agent-api/CameraChoreographer.ts` | Modify | Convert shot camera instructions into runtime camera samples. | P0 | [x] Static, push-in, dolly, pan, close-up, two-shot are covered by preset sampling tests. |
| `packages/engine/src/agent-api/SceneSequencer.ts` | Modify | Manage multi-shot episode playback state. | P0 | [x] Scrub/play/shot jump match timeline through `createSceneSequencerPlayback(...)`. |
| `packages/engine/src/agent-api/CartoonAssetManifest.ts` | Modify | Add readiness fields for character/set/prop/audio/lip-sync. | P0 | [x] Manifest validates typed asset references, license, character mouth readiness, set/audio readiness flags, and readiness counts. |
| `packages/engine/src/agent-api/index.ts` | Modify | Export new 1.1 cartoon package/render/motion APIs. | P0 | [x] Public root exports stay documented and typecheck. |

### Rendering Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/rendering/src/cartoon/CartoonRenderPreset.ts` | Create | Cartoon lighting/material/postprocess preset. | P0 | [x] Route proof carries cartoon render preset evidence. [x] Preset evidence reports lights, shadows, postprocess, color/material style, frame budget. |
| `packages/rendering/src/cartoon/CartoonVisualQuality.ts` | Create | Automated visual metrics for cartoon frames. | P0 | [x] Detects blank/overexposed/occluded/static frames. |
| `packages/rendering/src/cartoon/CartoonMaterialStyle.ts` | Create | Toon/cel material guidance and asset override metadata. | P1 | [x] Assets can opt into stylized material treatment. |
| `packages/rendering/src/Renderer.ts` | Modify | Ensure captureFrame/captureFrameAsync can feed episode export adapters. | P0 | [x] Pixel output is deterministic enough for tests through renderer capture and frame visual metrics contract coverage. |
| `packages/rendering/src/FrameVisualMetrics.ts` | Modify | Add character visibility and motion-region metrics. | P0 | [x] Metrics support cartoon motion gate through `analyzeRgbaFrameMotionRegions(...)`. |
| `packages/rendering/src/index.ts` | Modify | Export cartoon rendering helpers. | P0 | [x] Public package build includes exports. |

### Animation Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/animation/src/AnimationController.ts` | Modify | Support cartoon performance state binding. | P0 | [x] Speak/listen/gesture/walk/action clips can be driven by timeline through `bindCartoonTimelineAction(...)`. |
| `packages/animation/src/AnimationStateGraph.ts` | Modify | Add reusable cartoon state graph example. | P1 | [x] State transitions are deterministic through `createCartoonAnimationStateGraph(...)` and sampled tests. |
| `packages/animation/src/AnimationClipRegistry.ts` | Modify | Validate cartoon clip maps and aliases. | P0 | [x] Missing required clips fail readiness unless segmented fallback is declared through `validateCartoonClipMap(...)`. |
| `packages/animation/src/MotionQuality.ts` | Modify | Add cartoon motion quality summaries. | P0 | [x] Static pose masquerading as animation fails through `summarizeCartoonAnimationMotion(...)`. |
| `packages/animation/src/HumanoidRetargeting.ts` | Modify | Document and test cartoon retargeting limits. | P1 | [x] Unsupported rigs fail with useful diagnostics through `analyzeCartoonHumanoidRetargeting(...)`. |
| `packages/animation/src/index.ts` | Modify | Export 1.1 cartoon animation helpers. | P0 | [x] Typecheck/build pass for animation helper exports in focused tests; full build rerun remains part of final readiness. |

### Audio Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/audio/src/AudioFileManager.ts` | Modify | Load typed dialogue/audio assets for episode routes. | P0 | [x] Missing audio files produce readiness errors through `validateEpisodeAudioAssets(...)`, covered by `packages/audio/tests/audio.test.ts`. |
| `packages/audio/src/AudioTimelineTrack.ts` | Modify | Align stems with dialogue/shot timeline. | P0 | [x] Stem timing matches captions within one frame through `validateAudioCaptionSync(...)`, covered by `packages/audio/tests/audio.test.ts`. |
| `packages/audio/src/AudioWaveform.ts` | Modify | Produce review UI waveform data. | P1 | [x] Waveform review data is produced per dialogue stem through `createAudioWaveformReviewData(...)`. |
| `packages/audio/src/AudioMixer.ts` | Modify | Add dialogue/music/SFX bus defaults for cartoon templates. | P1 | [x] Voice/music/SFX/ambient defaults plus mute/unlock evidence work through `createCartoonAudioMixer(...)`. |
| `packages/audio/src/index.ts` | Modify | Export typed audio helpers. | P0 | [x] Public package build includes exports; `pnpm build` and focused audio tests pass. |

### Editor Runtime Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/editor-runtime/src/CartoonSceneEditor.ts` | Modify | Coordinate episode-specific editor state. | P1 | [x] Snapshot shows shots, assets, captions, visemes, render state, and review state. |
| `packages/editor-runtime/src/TimelineUI.ts` | Modify | Visual shot/caption/audio/gesture timeline. | P1 | [x] Timeline lanes expose episode track kind/waveform metadata and shot lanes jump through the route-bound controller. |
| `packages/editor-runtime/src/TimelineEditorController.ts` | Modify | Bind editor controls to route playback. | P1 | [x] Play/pause/scrub/shot-jump work through `bindRoutePlayback(...)` / `jumpToShot(...)`, covered by `packages/editor-runtime/tests/editor-runtime.test.ts`. |
| `packages/editor-runtime/src/KeyframeEditor.ts` | Modify | Edit camera and gesture keyframes. | P2 | [x] Keyframes serialize and are covered by `packages/editor-runtime/tests/editor-runtime.test.ts`. |
| `packages/editor-runtime/src/CurveEditor.ts` | Modify | Edit camera easing and gesture weights. | P2 | [x] Curves serialize and deterministic sampling is covered by `packages/editor-runtime/tests/editor-runtime.test.ts`. |
| `packages/editor-runtime/src/AssetDropZone.ts` | Modify | Accept only typed/cartoon-profile assets. | P1 | [x] Raw URLs are rejected and cartoon character drops require clip/lip-sync metadata. |
| `packages/editor-runtime/src/EpisodeReviewPanel.ts` | Create | Human review status, notes, approval, rejected frames. | P0 | [x] Review package state can record named approval and rejected frames prevent approval. |
| `packages/editor-runtime/src/RenderQueuePanel.ts` | Create | Render progress and output inspection. | P1 | [x] Progress, frame counts, output paths, and errors map into render queue snapshots. |
| `packages/editor-runtime/src/index.ts` | Modify | Export new review/render panels. | P1 | [x] Typecheck/build pass and public exports include review/render panels. |

### CLI And Asset Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/aura3d-cli/src/cli.ts` | Modify | Add `cartoon` command group and strengthen `assets validate-cartoon`. | P0 | [x] `aura3d cartoon plan/preview/render/package/review/verify` commands delegate to template `episode:*` scripts; dry-run proof passed. |
| `packages/aura3d-cli/src/cartoon-asset-profiles.ts` | Modify | Add 1.1 profile requirements for render-ready characters/sets/audio. | P0 | [x] Rejects static/non-rigged character assets for publish-ready episodes. |
| `packages/aura3d-cli/src/game-asset-validator.ts` | Modify | Share package/provenance validation for cartoon assets. | P0 | [x] Cartoon validation writes structured readiness JSON. |
| `packages/aura3d-cli/src/pull-bridge.ts` | Modify | Rank cartoon assets by rig/mouth/set readiness. | P1 | [x] Search promotes usable starter candidates through profile ranking and starter-pack adapter coverage in `tests/unit/asset-index/cli-pull-bridge.test.ts`. |
| `packages/aura3d-cli/src/index.ts` | Modify | Export cartoon validation APIs. | P0 | [x] Programmatic API matches CLI. |
| `packages/asset-index/src/cartoon-profile.ts` | Modify | Extend scoring for lip-sync, clips, set scale, and material style. | P0 | [x] Known bad fixtures fail with reasons. |
| `packages/asset-index/src/cartoon-starter-pack.ts` | Modify | Provide curated Moon Garden CI starter pack metadata. | P0 | [x] Starter pack assets have license/source/checksum/profile evidence. |
| `packages/asset-index/src/index.ts` | Modify | Export updated profile/starter APIs. | P0 | [x] Published package smoke passes: temp install of `@aura3d/asset-index@latest` imported `cartoonStarterPackSummary`, `cartoonStarterPackAssets`, and `evaluateCartoonAssetProfile`. |

### Template Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/create-aura3d/templates/cartoon-studio/package.json` | Modify | Add episode scripts and remove source-only proof as success path. | P0 | [x] `episode:plan`, `episode:preview`, `episode:render`, `episode:package`, `episode:review`, `episode:verify` exist. |
| `packages/create-aura3d/templates/cartoon-studio/src/main.ts` | Modify | Render real timeline route using typed assets. | P0 | [x] Route proof is available and all shots play. |
| `packages/create-aura3d/templates/cartoon-studio/src/episode.ts` | Modify | Moon Garden episode config with typed asset slots and runtime requirements. | P0 | [x] No publish-ready placeholder mode. |
| `packages/create-aura3d/templates/cartoon-studio/src/render-plan.ts` | Modify | Replace `sourceOnly: true` readiness with real output readiness. | P0 | [x] Publish readiness fails without output artifacts. |
| `packages/create-aura3d/templates/cartoon-studio/src/aura-assets.ts` | Modify | Document required typed asset keys. | P0 | [x] `miko`, `luma`, `moonGarden`, and optional audio keys are named through `cartoonStudioRequiredAssetKeys` / `cartoonStudioOptionalAudioAssetKeys`. |
| `packages/create-aura3d/templates/cartoon-studio/src/characters.ts` | Modify | Add character clip/mouth/gesture requirements. | P0 | [x] Character readiness reports missing clips/mouth data through `validateCartoonStudioCharacters(...)`. |
| `packages/create-aura3d/templates/cartoon-studio/src/sets.ts` | Modify | Add set framing/walkability requirements. | P0 | [x] Moon Garden set readiness is validated. |
| `packages/create-aura3d/templates/cartoon-studio/src/review.ts` | Create | Review package source and human approval hooks. | P0 | [x] Produces `review-package.md`. |
| `packages/create-aura3d/templates/cartoon-studio/src/episode-renderer.ts` | Create | Template-side adapter around public engine render/package APIs. | P0 | [x] Writes package folder. |
| `packages/create-aura3d/templates/cartoon-studio/tests/episode-render.spec.ts` | Create | Browser render/export proof. | P0 | [x] Video/package exists and passes metrics. |
| `packages/create-aura3d/templates/cartoon-studio/tests/motion-quality.spec.ts` | Create | Motion quality proof. | P0 | [x] Static/still-image wobble fails. |
| `packages/create-aura3d/templates/cartoon-studio/tests/visual-review.spec.ts` | Create | Representative frame proof. | P0 | [x] First/dialogue/action/final frames saved. |
| `packages/create-aura3d/templates/cartoon-studio/README.md` | Modify | Document exact 1.1 workflow and limits. | P0 | [x] README does not imply Pixar/image-to-video. |
| `packages/create-aura3d/templates/cartoon-channel/src/image-puppet-episode.ts` | Delete or quarantine | Failed still-image puppet experiment. | P0 | [x] Not referenced by release-facing scripts/docs. |
| `packages/create-aura3d/templates/cartoon-channel/src/image-puppet-episode.css` | Delete or quarantine | Failed still-image puppet styling. | P0 | [x] Not referenced by release-facing scripts/docs. |
| `packages/create-aura3d/templates/cartoon-channel/tests/image-puppet*.spec.ts` | Delete or convert to negative gate | Ensure failure output cannot pass as animation proof. | P0 | [x] Negative test proves this route fails 1.1 readiness. |
| `packages/create-aura3d/templates/cartoon-channel/src/concept-episode-2-5d.ts` | Quarantine | Concept still/parallax route. | P0 | [x] Mark experimental only or remove from template. |
| `packages/create-aura3d/templates/cartoon-channel/src/puppet-episode-2d.ts` | Quarantine unless upgraded | Segmented 2D puppet route can be a fallback only if quality gate passes. | P1 | [x] Not publish-ready unless real body-region motion passes; active route rejects puppet/parallax experiments as quarantined non-release-facing views. |
| `packages/create-aura3d/src/index.ts` | Modify | Ensure generated cartoon-studio projects get 1.1 scripts/assets/docs. | P0 | [x] External scaffold smoke passes. |

### Tests

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `tests/unit/agent-api/cartoon-production-pipeline.test.ts` | Modify | Separate contract proof from real output proof. | P0 | [x] In-memory encoder cannot satisfy publish-ready assertions. |
| `tests/unit/agent-api/cartoon-episode-package.test.ts` | Create | Package writer/reader validation. | P0 | [x] Required files and checksums are validated. |
| `tests/unit/agent-api/cartoon-motion-quality.test.ts` | Create | Motion gate unit tests. | P0 | [x] Global shake fails; region motion passes. |
| `tests/unit/agent-api/cartoon-route-proof.test.ts` | Create | Stable route proof schema. | P0 | [x] Missing assets/captions/visemes/errors are reported. |
| `tests/unit/asset-index/cartoon-profile.test.ts` | Modify | Add 1.1 readiness fixtures. | P0 | [x] Static scans and non-mouth assets fail publish-ready character profile. |
| `tests/unit/aura3d-cli/assets.test.ts` | Modify | Validate `assets validate-cartoon --episode`. | P0 | [x] CLI emits structured readiness JSON. |
| `tests/unit/create-aura3d/templates.test.ts` | Modify | Verify new scripts and no release-facing image-puppet route. | P0 | [x] Template source gates pass, including episode scripts, asset keys, character readiness, and no release-facing image-puppet route. |
| `tests/browser/cartoon-studio-route.spec.ts` | Create | Browser route proof. | P0 | [x] Episode route boots, scrubs, and exposes proof. |
| `tests/browser/cartoon-studio-render-export.spec.ts` | Create | Real render export proof. | P0 | [x] WebM/PNG sequence exists. |
| `tests/browser/cartoon-studio-motion-quality.spec.ts` | Create | Rendered motion acceptance. | P0 | [x] Bad still-image output fails. |
| `tests/browser/cartoon-studio-visual-regression.spec.ts` | Create | Frame screenshot proof. | P0 | [x] First/dialogue/action/final frames saved. |
| `tests/browser/cartoon-studio-captions-visemes.spec.ts` | Create | Caption and mouth timing proof. | P0 | [x] Captions/mouth cues update on expected route seek frames through browser overlay/sample proof. |

### Tools And Reports

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `tools/aura3d11-release-readiness/index.ts` | Create | Top-level release gate. | P0 | [x] Fails any P0 missing proof. |
| `tools/cartoon-studio-package-proof/index.ts` | Create | Validate episode package folder. | P0 | [x] Writes `tests/reports/aura3d11/cartoon-package.json`. |
| `tools/cartoon-studio-visual-quality-gate/index.ts` | Create | Visual frame quality gate. | P0 | [x] Writes visual metrics and fails bad frames. |
| `tools/cartoon-studio-motion-quality-gate/index.ts` | Create | Motion gate over video/frame sequence. | P0 | [x] Fails global-only motion. |
| `tools/cartoon-studio-docs-claims/index.ts` | Create | Claim scanner for 1.1 docs/marketing. | P0 | [x] Fails Pixar/image-to-video/full-studio overclaims. |
| `tools/cartoon-studio-template-smoke/index.ts` | Create | External clean-project scaffold/render smoke. | P0 | [x] Runs outside monorepo. |
| `tools/prompt-animation-readiness/index.ts` | Modify | Delegate to 1.1 package/motion gates. | P1 | [x] Old source-only readiness no longer masks missing output; `tests/reports/prompt-animation/auravoice-sample-render-gates.json` now requires passing `tests/reports/aura3d11/readiness.json` plus cartoon-package, visual-quality, motion-quality, and template-smoke gates. |

### Docs

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `README.md` | Modify | Add 1.1 cartoon studio roadmap once implemented. | P0 | [x] Current capability and limits are honest. |
| `llms.txt` | Modify | Teach agents the real 1.1 cartoon workflow. | P0 | [x] No instruction suggests still-image puppet proof. |
| `docs/project/current-state.md` | Modify | Add 1.1 planned cartoon release track. | P0 | [x] Current vs future state is clear. |
| `docs/project/release-tracks.md` | Modify | Add 1.1 track and blockers. | P0 | [x] Release status is discoverable. |
| `docs/project/claim-guidelines.md` | Modify | Add cartoon claim boundaries. | P0 | [x] Overclaims fail docs gate. |
| `docs/api/prompt-animation.md` | Modify | Document render/package APIs and source-only boundary. | P0 | [x] Examples use public APIs only. |
| `docs/api/auravoice-bridge.md` | Modify | Document actual vs heuristic lip-sync. | P0 | [x] Amplitude-only mode is labeled honestly. |
| `docs/api/assets.md` | Modify | Document cartoon profiles and episode asset validation. | P0 | [x] Commands match CLI. |
| `docs/examples/cartoon-channel.md` | Modify | Reframe old template as source-level/historical unless upgraded. | P0 | [x] Failed puppet experiment is not presented as a success. |
| `docs/examples/cartoon-studio.md` | Create | Main 1.1 example workflow. | P0 | [x] Includes exact scaffold/render/package/review commands. |
| `docs/workflows/cartoon-episode-production.md` | Create | End-to-end production workflow. | P0 | [x] Human and agent steps are clear. |
| `docs/rendering/cartoon-render-preset.md` | Create | Cartoon visual quality guide. | P1 | [x] Preset settings and metrics documented. |
| `docs/project/aura3d-1.1-cartoon-studio-prd.md` | Create | This PRD. | P0 | [x] Detailed filename-level release plan exists. |

## P0 Checklist

- [x] `cartoon-studio` template is the main 1.1 template.
- [x] Clean external scaffold installs and builds.
- [x] Three typed assets are resolved or supplied by a license-clean starter pack: `miko`, `luma`, `moonGarden`.
- [x] `assets validate-cartoon --require-license --no-placeholders` passes for the episode.
- [x] Episode route uses `model(assets.x)` and public `@aura3d/engine` APIs only.
- [x] Route proof exposes shots, captions, visemes, gestures, assets, render status, errors.
- [x] All shots can be scrubbed in browser tests.
- [x] Captions render within one frame of dialogue timing.
- [x] Mouth movement is visible during dialogue.
- [x] Characters move independently during action beats.
- [x] Global-only still-image motion fails.
- [x] `episode.webm` is produced and playable.
- [x] `thumbnail.png` is captured from actual route state.
- [x] `captions.vtt` and `captions.srt` are exported.
- [x] `metadata.json`, `asset-provenance.json`, `route-proof.json`, `prompt-animation-evidence.json`, `visual-acceptance.json`, and `render-manifest.json` are written.
- [x] Package validation passes.
- [x] Human review package is generated.
- [x] Docs/README/llms explain exact commands and limits.
- [x] Release readiness fails if source-only proof is used as publish proof.
- [x] Release readiness fails if `notTrue3D: true` routes are counted as success.

## P1 Checklist

- [x] WebCodecs adapter exists where supported; `packages/engine/src/agent-api/WebCodecsFrameEncoder.ts` exposes capability/probe metadata and `tests/unit/agent-api/cartoon-export-adapters.test.ts` proves supported/unsupported paths.
- [x] MP4 output works in supported environments through an explicit playable H.264/MP4 encoder/container adapter; `packages/engine/src/agent-api/VideoExportPipeline.ts` rejects raw WebCodecs chunks and proof-only encoders for publish mode, while `tests/unit/agent-api/cartoon-export-adapters.test.ts` proves playable MP4 adapter acceptance.
- [x] Review UI supports waveform and manual viseme edits through `packages/editor-runtime/src/EpisodeReviewPanel.ts`, `packages/editor-runtime/src/VisualReviewDashboard.ts`, and `packages/editor-runtime/tests/editor-runtime.test.ts`.
- [x] Camera path editor can edit shot camera moves through `packages/editor-runtime/src/CameraPathEditor.ts` and the focused route-playback/keyframe evidence in `packages/editor-runtime/tests/editor-runtime.test.ts`.
- [x] Toon/cel material preset can be applied to compatible assets through `packages/rendering/src/cartoon/CartoonMaterialStyle.ts`, `packages/rendering/src/cartoon/CartoonRenderPreset.ts`, and `tests/unit/rendering/cartoon-rendering.test.ts`.
- [x] Dub metadata supports at least one alternate language proof through Spanish dub metadata/caption slots in `packages/create-aura3d/templates/cartoon-studio/src/render-plan.ts`, package artifacts in `episode-renderer.ts`, and `tests/unit/create-aura3d/templates.test.ts`.
- [x] Batch render can produce multiple episodes from one show bible through `cartoonStudioShowBibleBatchRenderPlan` in `packages/create-aura3d/templates/cartoon-studio/src/render-plan.ts` and package/test coverage in `tests/unit/create-aura3d/templates.test.ts`.
- [x] Visual review dashboard lists failed frames and reviewer notes through `packages/editor-runtime/src/VisualReviewDashboard.ts` and `packages/editor-runtime/tests/editor-runtime.test.ts`.

## P2 Checklist

- [x] Better phoneme alignment through an optional external analyzer is supported by `packages/engine/src/agent-api/ExternalPhonemeAnalyzer.ts`; `tests/unit/agent-api/cartoon-stretch-adapters.test.ts` proves unsupported diagnostics plus injected phoneme-aligned provider behavior.
- [x] Cloud render adapter exists as an honest provider contract in `packages/engine/src/agent-api/CloudRenderAdapter.ts`; `tests/unit/agent-api/cartoon-stretch-adapters.test.ts` proves unsupported, missing-credential, and injected-provider paths.
- [x] YouTube upload integration exists as an honest package/upload adapter in `packages/engine/src/agent-api/YouTubeUploadAdapter.ts`; `tests/unit/agent-api/cartoon-stretch-adapters.test.ts` proves upload package validation plus unconfigured, missing-credential, and injected upload paths.
- [x] Multi-user review workflow exists through `packages/editor-runtime/src/MultiUserReviewWorkflow.ts` and quorum/publish-blocking coverage in `packages/editor-runtime/tests/editor-runtime.test.ts`.
- [x] Motion-capture or webcam performance capture exists as a permission-bound capture session contract in `packages/engine/src/agent-api/PerformanceCaptureSession.ts`, covered by `tests/unit/agent-api/cartoon-production-pipeline.test.ts`.
- [x] Full nonlinear animation editor exists at the current source-level editor model through `packages/editor-runtime/src/NonlinearAnimationEditor.ts`, with bin, multi-sequence, nested timeline, trim/split/move/duplicate, and serialization coverage in `packages/editor-runtime/tests/editor-runtime.test.ts`.
- [x] Asset marketplace/editor browser exists as a manifest-backed/offline catalog editor browser through `packages/engine/src/agent-api/AssetLibraryBrowser.ts`, with typed editor references and marketplace/offline evidence in `tests/unit/agent-api/cartoon-production-pipeline.test.ts`.

## Release Gates

Required commands before Aura3D 1.1 can ship:

```bash
pnpm typecheck
pnpm build
pnpm exec vitest run tests/unit/agent-api/cartoon-production-pipeline.test.ts tests/unit/agent-api/cartoon-episode-package.test.ts tests/unit/agent-api/cartoon-motion-quality.test.ts tests/unit/asset-index/cartoon-profile.test.ts tests/unit/aura3d-cli/assets.test.ts tests/unit/create-aura3d/templates.test.ts
pnpm exec playwright test tests/browser/cartoon-studio-route.spec.ts tests/browser/cartoon-studio-render-export.spec.ts tests/browser/cartoon-studio-motion-quality.spec.ts tests/browser/cartoon-studio-captions-visemes.spec.ts
pnpm cartoon-studio:template:smoke
pnpm aura3d11:readiness
```

Pre-publish external clean-project proof is generated by the release tooling with local dist packages:

```bash
pnpm cartoon-studio:template:smoke
pnpm aura3d11:readiness
```

Post-publish npm `@latest` proof:

```bash
rm -rf /tmp/aura3d11-cartoon-smoke
npx create-aura3d@latest /tmp/aura3d11-cartoon-smoke --template cartoon-studio
cd /tmp/aura3d11-cartoon-smoke
npm install
npx @aura3d/cli@latest assets validate-cartoon --require-license --no-placeholders
npm run episode:render
npm run episode:package
npm run episode:review
npm run build
npm test
```

Do not treat the npm `@latest` sequence as a pre-publish source gate; before the 1.1 packages are published, `@latest` still points at the previous public release and cannot prove the new template.

## Visual Acceptance Bar

The visual bar is not "Pixar." The visual bar is "a viewer can tell this is an authored animated cartoon episode, not a static poster."

Pass criteria:

- Both characters are visible and readable.
- The set has depth and stable framing.
- At least four shots have distinct camera or blocking changes.
- At least two shots show independent arm/body/prop motion.
- Dialogue shots show mouth movement.
- Captions are readable and do not cover important action.
- Lighting and materials look intentional.
- Exported video contains no route chrome, browser UI, debug overlays, or proof panels.

Fail criteria:

- Single still image with pan/zoom/shake.
- Characters and background move as one flat layer.
- Only subtitles change.
- Only global camera shake changes frame hashes.
- Route overlays or debug panels are visible in video.
- Characters are static for the full episode.
- Mouth does not move during dialogue.
- Placeholder assets are presented as production-ready.

## Comparison And Strategic Position

Against Three.js:

- Aura3D should win on agent workflow, typed assets, templates, episode packaging, readiness evidence, and anti-hallucination guardrails.
- Three.js remains lower-level and more flexible for custom rendering.

Against Babylon.js:

- Aura3D should win on AI-agent scaffolding, typed asset provenance, prompt-to-episode contracts, and release evidence.
- Babylon remains stronger as a mature general 3D runtime/editor ecosystem.

Against Unity/Unreal:

- Aura3D should not compete on native editor depth, animation tooling, asset marketplace, terrain/world authoring, cinematics, or AAA rendering.
- Aura3D can compete for browser-first, TypeScript-first, AI-generated small productions where repeatability and web deployment matter more than full studio tooling.

Against image/video generation:

- Aura3D should not pretend to generate magical video from a prompt.
- Aura3D should complement image generation by using generated images as concept art, thumbnails, textures, or style references, while the episode itself is driven by typed assets, rigs, timelines, and render evidence.

## Risks

- Asset quality: suitable rigged cartoon characters may be hard to source automatically.
- Browser encoding: WebM/MP4 support varies by runtime and browser.
- Lip sync: amplitude-only visemes will look weak without better phoneme alignment or manual edits.
- Visual quality: 3D cartoon assets may not approach high-end animated-film style without curated art direction.
- Scope creep: trying to build a full animation editor will delay the vertical slice.
- Claims risk: marketing can overstate this as Pixar-like or full YouTube automation before evidence supports it.

## Open Decisions

- Should 1.1 require real GLB rigged characters, or allow a high-quality segmented 2D rig as an explicit fallback?
- Is WebM enough for the first release, or must MP4 be mandatory?
- Will dialogue audio be real recorded/synthesized files, or is captioned silent proof acceptable for the first vertical slice?
- Should the starter pack ship with the npm template or be pulled by CLI after scaffold?
- Should failed puppet experiments be deleted entirely or kept as negative regression fixtures?

Recommended decisions:

- Require real GLB rigged characters for the flagship demo.
- Require WebM; make MP4 optional.
- Require at least placeholder/generated dialogue audio for publish-ready proof, with explicit provenance.
- Keep failed still-image puppet output only as a negative test fixture, not a public route.

## Final Definition Of Done

Aura3D 1.1 is done only when:

- a clean user can scaffold `cartoon-studio`;
- typed assets validate;
- the route plays a complete episode timeline;
- characters visibly move;
- mouths visibly move during dialogue;
- captions are timed and exported;
- a playable video file is produced;
- a thumbnail is captured;
- a complete package folder is written;
- motion/visual gates reject still-image wobble;
- human review artifacts exist;
- docs explain exact commands and exact limitations;
- public copy does not claim Pixar, Unity, Unreal, or full studio parity.
