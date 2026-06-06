# Aura3D 1.0.7 — 3D Cartoon Content-Creation Platform PRD

Version: 1.0.7
Date: 2026-06-05
Status: Proposed release PRD
Baseline: Aura3D 1.0.6 codebase (game engine foundation)
Primary goal: Evolve Aura3D from a game engine into a 3D content-creation platform for producing animated cartoons suitable for publishing on channels like YouTube Kids.

## Executive Summary

Aura3D 1.0.5 shipped a runtime foundation with typed assets, prompt-animation scaffolding, and AuraVoice bridge contracts. Aura3D 1.0.6 is closing the game-engine gap: reusable runtime lifecycle, animation state graphs, combat systems, asset validation profiles, and a flagship fighting showcase.

Aura3D 1.0.7 must make the leap from "engine that can run a fighting game" to "platform that can produce a cartoon episode." The target user is no longer just a game developer — it is an AI coding agent, a solo creator, or a small team that wants to describe a cartoon in text, have the platform scaffold the 3D scene, animate the characters, sync dialogue, compose camera shots, and export a publishable video file.

The existing codebase already has 70% of the foundation. The prompt-animation contract, shot timeline, cartoon director, viseme controller, caption/dialogue tracks, render queue metadata, and AuraVoice bridge are all source-complete. What is missing is the connective tissue: a visual timeline editor, real lip-sync driven by audio, scene sequencing across shots, camera choreography tooling, a cartoon asset library, and — critically — actual video export that produces a file a creator can upload.

This PRD defines exactly what exists, what is missing, and what to build in three phases.

## Goals

1. **Video export**: Render a cartoon episode to MP4/WebM from the browser or a headless pipeline.
2. **Timeline editor**: Visual keyframe/clip editor for animating scenes, cameras, and characters over time.
3. **Lip sync from audio**: Drive visemes from real audio files, not just timed text cues.
4. **Scene sequencing**: Chain shots into episodes with transitions, acts, and pacing controls.
5. **Camera direction**: Visual camera choreography with preset moves, framing rules, and shot composition.
6. **Audio/dialogue tracks**: Multi-track audio mixing, dialogue alignment, music beds, SFX layers.
7. **Cartoon asset library**: Curated catalog of cartoon-ready characters, props, sets, and environments.
8. **Asset library browser**: In-CLI or browser-based asset browsing with preview, filtering, and one-click import.
9. **Character performance**: Emotion poses, gestures, body language driven by script metadata.
10. **Publishing pipeline**: From scene to YouTube-ready upload with thumbnails, captions, and metadata.

## Current State Audit

### Rendering

| Capability | Status | Cartoon relevance |
|---|---|---|
| WebGL2 renderer | Production-ready (`packages/rendering/src/WebGL2Device.ts`, ~2280 lines) | Primary render backend |
| WebGPU renderer | Production-ready (`packages/rendering/src/WebGPUDevice.ts`, ~2806 lines) | Future backend, compute particles |
| PBR materials | Full metallic/roughness with clearcoat, transmission, sheen, anisotropy, iridescence (`PBRMaterial.ts`, `TexturedPBRMaterial.ts`) | Character and prop shading |
| Skinned materials | `SkinnedLitMaterial.ts`, `SkinnedUnlitMaterial.ts` | Animated character rendering |
| Morph targets | `MorphTarget.ts`, `MorphUnlitMaterial.ts`, morph target renderer in production runtime | Facial expressions, lip sync |
| Shadows | Cascaded shadow maps, contact shadows, PCF filtering (`ShadowMap.ts`, `CascadedShadowMaps.ts`, `ContactShadows.ts`) | Scene depth and grounding |
| Post-processing | Bloom, FXAA, tone mapping, SSAO, SSR, DOF, motion blur, film grain, chromatic aberration, TAA, outline, color grading (`PostProcessPass.ts`, ~2507 lines) | Cinematic look |
| Cinematic system | Bloom, vignette, film grain, depth haze, rain, fog volumes, glow cards, wet reflections, emissive practicals (`packages/rendering/src/cinematic/`) | Cartoon atmosphere |
| Particles | Full particle system with emitters, modules (velocity, color, size, force, collision, trails), GPU compute backend, presets (`packages/rendering/src/effects/`) | VFX for cartoons |
| Frame capture | `Renderer.captureFrame()`, `captureFrameAsync()`, pixel readback | Screenshot and video frame capture |
| **Gap** | No frame-to-video encoding. No batch render pipeline. No render-to-file. | **Must build** |

### Scene Management

| Capability | Status | Cartoon relevance |
|---|---|---|
| Scene graph | Full hierarchy with transforms, visibility, layers, bounds (`SceneNode.ts`, `Object3D.ts`, `Scene.ts`) | Scene composition |
| Cameras | Perspective, orthographic, stereo rig (`PerspectiveCamera.ts`, `OrthographicCamera.ts`, `StereoCameraRig.ts`) | Shot composition |
| Camera controls | Orbit, first-person, third-person follow, fly, map, trackball, pointer lock (`packages/input/src/controls/`, `packages/controls/src/`) | Camera direction |
| Camera framing | `computePerspectiveCameraFrame()` with yaw/pitch/zoom/padding | Auto-framing characters |
| Lights | Directional, point, spot with shadow casting (`DirectionalLight.ts`, `PointLight.ts`, `SpotLight.ts`) | Scene lighting |
| Lighting rigs | Named presets: 3-point, studio, outdoor (`LightingRig.ts`) | Quick scene lighting |
| Serialization | Full scene serialize/deserialize (`SceneSerializer.ts`) | Save/load scenes |
| **Gap** | No scene template system for cartoon sets. No shot-specific camera presets library. | **Must build** |

### Animation

| Capability | Status | Cartoon relevance |
|---|---|---|
| AnimationController | Play, stop, pause, crossfade, layers, events, morph blending, root motion (`AnimationController.ts`, 967 lines in animation package + 1400+ lines in engine) | Character animation |
| Animation state graph | FSM with conditional transitions, exit times, priority, completion callbacks (`AnimationStateMachine.ts`) | Character state machines |
| Blend trees | 1D and 2D parameterized blending (`BlendTree.ts`) | Locomotion blending |
| IK | Two-bone IK with pole vectors (`IK.ts`) | Foot placement, arm reaching |
| Retargeting | Full humanoid rig analysis, 22-bone definition, cross-rig mapping (`HumanoidRetargeting.ts`) | Using different character models |
| Root motion | Delta extraction with loop-aware wrapping (`RootMotion.ts`) | Walk/run movement |
| Locomotion controller | Root-motion path following with procedural walk clip (`LocomotionController.ts`) | Character walking |
| Morph targets | Weight blending in controller, per-pose morph targets | Facial animation |
| Animation events | Rich typed events: hitbox, hurtbox, footstep, sfx, vfx, camera, state, custom (`AnimationClipEvents.ts`) | Syncing animation to audio/VFX |
| Clip registry | Typed clip registration with manifest and diagnostics (`AnimationClipRegistry.ts`) | Managing character animations |
| **Gap** | No procedural animation authoring. No keyframe editor for creating new clips. No NLA (nonlinear animation) editor. | **Must build (editor)** |

### Audio

| Capability | Status | Cartoon relevance |
|---|---|---|
| AudioSystem | Web Audio API lifecycle with unlock/suspend/resume (`AudioSystem.ts`) | Browser audio playback |
| AudioMixer | Named bus hierarchy with volume/mute (`AudioMixer.ts`) | Dialogue/music/SFX mixing |
| AudioSource | Single-channel playback with volume control (`AudioSource.ts`) | Playing audio clips |
| Spatial audio | HRTF panning with inverse distance rolloff (`SpatialAudio.ts`) | 3D positioned audio |
| Effects | Biquad filter, convolver reverb (`effects/Filter.ts`, `effects/Reverb.ts`) | Audio processing |
| Scene bridge | Scene graph to audio listener/source binding (`SceneAudioBridge.ts`) | Positional audio in scenes |
| Adaptive music | Fixture with state-driven layer mixing (calm/tension/action/victory) (`AdaptiveMusicFixtures.ts`) | Background music |
| **Gap** | No audio file loading from typed assets. No waveform visualization. No audio-to-viseme analysis. No multi-track recording. | **Must build** |

### Shot Timeline and Cartoon Production

| Capability | Status | Cartoon relevance |
|---|---|---|
| Shot timeline | Shots with camera instructions, character blocking, transitions (`ShotTimeline.ts`, 513 lines) | Scene sequencing |
| Shot playback | `createShotPlaybackPlan()`, `sampleShotPlaybackPlan()`, `installShotPlayback()` | Playing back episodes |
| Camera instructions | Static, cut, dolly, truck, pan, tilt, push-in, orbit, rack-focus, handheld | Camera direction |
| Character blocking | Idle, speak, gesture, walk, run, look, react, enter, exit | Character staging |
| Transitions | Cut, fade, wipe, match-cut, hold | Shot transitions |
| Cartoon director | Compiles beats into full artifact chain: episode plan, storyboard, shot timeline, dialogue, captions, performance, render queue (`CartoonDirector.ts`, 475 lines) | Script-to-episode |
| Performance cues | Emotion poses (neutral, happy, excited, curious, etc.) and gestures (wave, point, lean, nod) (`CartoonPerformance.ts`, 537 lines) | Character acting |
| Dialogue track | Lines with speaker, start/end times, emotion, audio file reference (`DialoguePerformance.ts`) | Script timing |
| Caption track | Auto-generated from dialogue with word-wrapping (`DialoguePerformance.ts`) | Subtitles |
| Viseme controller | 28 visemes with primitive mouth cards and GLB blendshape cues (`VisemeController.ts`, 374 lines) | Lip sync |
| AuraVoice bridge | Master clock validating timing drift across dialogue/captions/visemes/audio (`AuraVoiceBridge.ts`, 708 lines) | Sync validation |
| Render queue | Deterministic capture times with output specs for mp4/webm/captions/thumbnail/evidence (`CartoonRenderQueue.ts`, 669 lines) | Render planning |
| Episode plan | Contract with characters, locations, props, style guide, safety metadata, YouTube draft (`PromptAnimationContract.ts`, 613 lines) | Episode structure |
| Evidence | Publish readiness evaluation with screenshots, timing drift, asset status (`PromptAnimationEvidence.ts`, 757 lines) | Quality gates |
| **Gap** | No visual timeline editor UI. No real-time audio waveform sync. No video encoding. No scene template browser. | **Must build** |

### Asset Pipeline

| Capability | Status | Cartoon relevance |
|---|---|---|
| CLI search | Federated search across 8 sources, ~850k assets (`packages/aura3d-cli/src/pull-bridge.ts`) | Finding assets |
| CLI resolve | Search + auto-pull + typed registration | Importing assets |
| Typed assets | `defineAuraAssets()`, `model(assets.x)` | Safe asset references |
| Game profiles | `fighting-character` profile with validation (`packages/asset-index/src/game-profile.ts`) | Fighter validation |
| Cartoon validation | `validateCartoonAssets()` for character/set/prop/audio | Cartoon asset validation |
| Character assembly | Multi-part GLB composition with attachment rules (`CharacterAssembly.ts`) | Building characters |
| Thumbnail generation | SVG placeholder thumbnails | Asset previews |
| **Gap** | No cartoon-specific asset profiles. No curated cartoon character/set catalog. No in-browser asset browser. No asset preview in editor. | **Must build** |

### Input and Controls

| Capability | Status | Cartoon relevance |
|---|---|---|
| Keyboard/pointer/gamepad | Full device support with action mapping (`InputSystem.ts`) | Editor input |
| Gesture recognition | Tap, pan, pinch (`GestureRecognizer.ts`) | Touch editing |
| Input recording/playback | `InputRecorder`, `InputPlayback` with seek/pause/loop (`InputReplay.ts`) | Deterministic tests |
| Camera controls | 6 control modes in `packages/controls/src/` | Editor camera |
| **Gap** | No timeline-specific input (scrubbing, keyframe manipulation). | **Minor build** |

### Editor Runtime

| Capability | Status | Cartoon relevance |
|---|---|---|
| Timeline model | Tracks (animation, signal, audio, camera), clips, easing, blend modes, playback (`TimelineModel.ts`) | Timeline data model |
| Timeline bridge | Runtime binding with deterministic apply (`TimelineRuntimeBridge.ts`) | Timeline to scene |
| Command history | Undo/redo with transactions and merging (`CommandHistory.ts`) | Editor editing |
| Selection | Observable multi-selection (`Selection.ts`) | Object picking |
| Hierarchy | Scene tree flattening (`HierarchyModel.ts`) | Scene outline |
| Inspector | Property reflection and editing (`InspectorModel.ts`) | Property panel |
| Gizmos | Translate, rotate, scale (`TranslateGizmo.ts`, `RotateGizmo.ts`, `ScaleGizmo.ts`) | Transform manipulation |
| Prefabs | Create/register/instantiate with id remapping (`PrefabRegistry.ts`) | Reusable scene objects |
| Project serialization | Full project with nodes, assets, timelines, graphs, state (`ProjectSerializer.ts`) | Save/load |
| **Gap** | No visual timeline UI. No keyframe editor. No curve editor. No sequencer UI. | **Must build** |

### Scripting

| Capability | Status | Cartoon relevance |
|---|---|---|
| Visual scripting | 60+ node types, graph validation, deterministic executor (`VisualGraph*.ts`) | Logic authoring |
| Behavior trees | Action/Condition/Sequence/Selector with Blackboard (`BehaviorTree.ts`) | AI/automation |
| State machines | Hierarchical with transitions and blackboard (`StateMachine.ts`) | Character state |
| **Gap** | No cartoon-specific visual nodes (scene transitions, camera cuts, dialogue triggers). | **Must build** |

### Templates

| Template | Status | Cartoon relevance |
|---|---|---|
| `prompt-cartoon-channel` | Source-complete with episode plan, shot playback, visemes, captions, render plan | Episode scaffold |
| `cartoon-channel` | Near-identical to above with alternate sampling | Episode scaffold |
| `fighting-game` | Source-complete with combat, input, effects | Not directly relevant |
| **Gap** | No "cartoon-studio" template with visual editor. No "episode-builder" template. | **Must build** |

## Gap Analysis

### Critical Gaps (Without These, 1.0.7 Fails)

| Gap | Current state | Required state | Impact |
|---|---|---|---|
| **Video export** | Render queue metadata exists. `Renderer.captureFrame()` captures pixels to memory. No encoding to video file. | Browser-based or headless frame capture pipeline that encodes frames to MP4/WebM with audio muxing. | Cannot produce a publishable cartoon without this. |
| **Visual timeline editor** | `TimelineModel` data structures exist. No visual UI. | Browser-based timeline with tracks, clips, keyframes, scrubbing, zoom, drag-to-edit. | Creators cannot edit episodes without this. |
| **Lip sync from audio** | `VisemeController` maps text timing to visemes. No audio analysis. No waveform display. | Audio waveform visualization, phoneme detection or alignment, real-time viseme driving from audio playback. | Dialogue scenes look wrong without this. |
| **Scene sequencing** | `ShotTimeline` defines shots with time ranges. No visual sequencer. No multi-scene management. | Scene sequencer UI showing shot thumbnails, transitions, timing. Multi-scene episode structure. | Cannot manage episode structure without this. |
| **Cartoon asset library** | Generic catalog with ~850k assets. No cartoon-specific curation. `assets validate-cartoon` exists but is shallow. | Curated library of cartoon-ready characters (rigged, animated, expressive), props, sets, environments. Profile-based filtering. | Creators cannot find suitable assets without this. |

### Important Gaps (Required for Credible Release)

| Gap | Current state | Required state |
|---|---|---|
| **Camera choreography** | 10 camera move types in `ShotCameraInstruction`. No visual camera path editor. No shot composition rules. | Visual camera path editor with keyframes. Shot/reverse-shot preset. Rule-of-thirds overlay. Camera shake/impact. |
| **Audio/dialogue tracks** | `AudioMixer` with buses. `AudioSource` for playback. No multi-track timeline. No waveform display. No audio file loading from typed assets. | Multi-track audio timeline. Waveform visualization. Audio file loading via typed assets. Dialogue/music/SFX track separation. |
| **Character performance** | 9 emotion poses, 5 gestures in `CartoonPerformance.ts`. No custom pose authoring. No blend between poses. | Expandable emotion/gesture library. Pose blending. Custom pose keyframing. Body language scripting. |
| **Asset library browser** | CLI-only search/resolve. No browser UI. No preview. | Browser-based asset browser with 3D preview, filtering by category/style/rig type, one-click import. |
| **Publishing pipeline** | YouTube draft metadata in episode plan. No actual upload. No thumbnail generation from scenes. No caption file export. | Automated thumbnail capture. VTT/SRT caption export. YouTube metadata generation. Upload-ready package. |

### Nice-to-Have Gaps (Phase 3 or Future)

| Gap | Current state | Required state |
|---|---|---|
| Voice recording | No in-browser recording. | Browser-based voice recording with waveform capture. |
| Collaborative editing | No multi-user support. | Real-time collaborative scene editing. |
| Motion capture | No mocap integration. | Webcam-based pose estimation for character animation. |
| AI voice synthesis | No TTS integration. | AuraVoice TTS integration for automated dialogue. |
| Procedural environments | `TerrainFixtures.ts`, `VegetationFixtures.ts` exist as fixtures. | Authorable procedural environment generation. |

## Feature Specifications

### Phase 1: Core Production Pipeline (P0)

#### 1. Video Export Pipeline

**Goal**: Render a cartoon episode to MP4/WebM from the browser.

**Build on**:
- `Renderer.captureFrame()` / `captureFrameAsync()` in `packages/rendering/src/Renderer.ts`
- `CartoonRenderQueue` in `packages/engine/src/agent-api/CartoonRenderQueue.ts`
- `createCartoonRenderOutputPackageMetadata()` for output spec
- `installShotPlayback()` for timeline-driven frame advancement

**New files**:
- `packages/engine/src/agent-api/VideoExportPipeline.ts` — orchestrates frame-by-frame capture, encoding, and muxing
- `packages/engine/src/agent-api/FrameEncoder.ts` — browser-based frame encoding using `MediaRecorder` API or `WebCodecs` API
- `packages/engine/src/agent-api/AudioMuxer.ts` — combines rendered frames with audio stems into final video
- `packages/engine/src/agent-api/RenderProgressTracker.ts` — progress reporting, ETA, cancellation

**Scope**:
- Capture frames at target resolution (720p/1080p/4K) and frame rate (24/30/60 fps)
- Encode to WebM (VP9) via `MediaRecorder` as baseline
- Experimental MP4 encoding via `WebCodecs` + `MP4Box.js` muxing
- Mux dialogue audio, music, and SFX stems into final video
- Progress bar with ETA and cancel support
- Output: video file + caption files (VTT/SRT) + thumbnail + evidence JSON
- Headless mode: `pnpm render-episode --episode moon-garden --output dist/` for CI/CD

**Acceptance criteria**:
- A 30-second episode renders to WebM in under 2 minutes on a modern laptop
- Audio is synchronized to video within 1 frame at 30fps
- Captions are correctly timed and word-wrapped
- Thumbnail is captured from a specified shot time
- Evidence JSON records render time, frame count, output size, and checksum

#### 2. Enhanced Lip Sync

**Goal**: Drive visemes from real audio files with waveform visualization.

**Build on**:
- `VisemeController` in `packages/engine/src/agent-api/VisemeController.ts`
- `AuraVoiceBridge` in `packages/engine/src/agent-api/AuraVoiceBridge.ts`
- `createAuraVoiceVisemeTrack()`, `sampleVisemeTrack()`
- `AudioSource` in `packages/audio/src/AudioSource.ts`
- `AudioClip` in `packages/audio/src/AudioClip.ts`

**New files**:
- `packages/engine/src/agent-api/AudioVisemeAnalyzer.ts` — analyzes audio amplitude envelope to drive viseme intensity
- `packages/engine/src/agent-api/WaveformVisualizer.ts` — renders audio waveform to canvas for timeline display
- `packages/engine/src/agent-api/VisemeTimelineTrack.ts` — timeline track type for viseme cues with editing

**Scope**:
- Load audio files via typed assets (`assets.add("./audio/line.wav", { name: "line1" })`)
- Analyze amplitude envelope for basic mouth open/close timing
- Support AuraVoice TTS-aligned visemes when available (higher quality)
- Real-time waveform display in timeline editor
- Manual viseme keyframe editing on the waveform
- Blend between visemes for smooth mouth transitions
- GLB blendshape weight output for characters with morph targets
- Primitive mouth card fallback for characters without morphs

**Acceptance criteria**:
- Audio playback drives mouth movement in sync within 50ms
- Waveform visualization renders correctly in the timeline
- Manual viseme edits override auto-detected visemes
- Both GLB blendshape and primitive mouth modes work

#### 3. Visual Timeline Editor

**Goal**: Browser-based timeline for editing shots, keyframes, and audio.

**Build on**:
- `TimelineModel` in `packages/editor-runtime/src/TimelineModel.ts`
- `TimelineRuntimeBridge` in `packages/editor-runtime/src/TimelineRuntimeBridge.ts`
- `CommandHistory` in `packages/editor-runtime/src/CommandHistory.ts`
- `Selection` in `packages/editor-runtime/src/Selection.ts`
- `ProjectSerializer` in `packages/editor-runtime/src/ProjectSerializer.ts`

**New files**:
- `packages/editor-runtime/src/TimelineEditorController.ts` — timeline editor state management (zoom, scroll, selection, clipboard)
- `packages/editor-runtime/src/KeyframeEditor.ts` — keyframe manipulation (add, delete, move, scale, copy, paste)
- `packages/editor-runtime/src/CurveEditor.ts` — bezier curve editing for interpolation between keyframes
- `packages/editor-runtime/src/TimelineTrackTypes.ts` — track type definitions for animation, audio, viseme, camera, dialogue, SFX
- `packages/editor-runtime/src/TimelineUI.ts` — DOM-based timeline UI rendering

**Scope**:
- Multi-track timeline with lanes for: shots, animation, audio, visemes, camera, dialogue, SFX, captions
- Clip-based editing: drag to move, resize, split, duplicate
- Keyframe editing: add/delete/move keyframes on animation tracks
- Curve editor: bezier handles for smooth interpolation
- Zoom/scroll with minimap
- Playhead scrubbing with real-time preview
- Undo/redo via `CommandHistory`
- Keyboard shortcuts: space (play/pause), left/right (step frame), home/end (start/end)
- Timeline serialization via `ProjectSerializer`
- Snap to grid, snap to other keyframes

**Acceptance criteria**:
- Can add, move, resize, and delete clips on the timeline
- Can add and edit keyframes on animation tracks
- Playhead scrubbing updates the scene in real-time
- Undo/redo works for all timeline operations
- Timeline state serializes and deserializes correctly

#### 4. Scene Sequencer

**Goal**: Manage multi-shot episodes with transitions and pacing.

**Build on**:
- `ShotTimeline` in `packages/engine/src/agent-api/ShotTimeline.ts`
- `createShotTimeline()`, `createShotPlaybackPlan()`, `installShotPlayback()`
- `CartoonDirector` in `packages/engine/src/agent-api/CartoonDirector.ts`
- `compilePromptEpisodePlan()`

**New files**:
- `packages/engine/src/agent-api/SceneSequencer.ts` — multi-scene episode management with scene graph switching
- `packages/engine/src/agent-api/ShotTransitionEngine.ts` — transition execution (crossfade, dip-to-black, wipe, match-cut)
- `packages/engine/src/agent-api/EpisodeStructure.ts` — act/scene/shot hierarchy with pacing metadata

**Scope**:
- Episode structure: acts → scenes → shots
- Scene graph switching between shots (different character sets, environments)
- Transition execution: cut (instant), crossfade (blend), dip-to-black, wipe (directional), match-cut (position match)
- Pacing controls: hold duration, transition speed, beat markers
- Shot thumbnails captured at key moments
- Scene duplication for recurring sets
- Episode metadata: title, description, runtime, character list

**Acceptance criteria**:
- Can define an episode with multiple scenes and shots
- Transitions execute visually (crossfade, dip-to-black)
- Shot thumbnails are generated automatically
- Episode metadata is serializable

#### 5. Cartoon Asset Library and Profiles

**Goal**: Curated catalog of cartoon-ready assets with browser-based browsing.

**Build on**:
- `packages/aura3d-cli/src/pull-bridge.ts` (federated search)
- `packages/asset-index/src/` (canonical assets, adapters, ranking)
- `packages/asset-index/src/game-profile.ts` (profile evaluation)
- `packages/aura3d-cli/src/index.ts` (asset validation)
- `packages/engine/src/agent-api/GameAssetValidation.ts` (asset readiness)

**New files**:
- `packages/asset-index/src/cartoon-profile.ts` — cartoon asset profile evaluation (rigged, expressive, cartoon-style, animated)
- `packages/aura3d-cli/src/cartoon-asset-profiles.ts` — CLI profiles: `cartoon-character`, `cartoon-prop`, `cartoon-set`, `cartoon-environment`
- `packages/engine/src/agent-api/AssetLibraryBrowser.ts` — browser-based asset browsing with 3D preview
- `packages/engine/src/agent-api/CartoonAssetManifest.ts` — cartoon-specific asset metadata (emotion support, lip-sync readiness, style category)

**Scope**:
- New CLI profiles:
  - `cartoon-character`: humanoid rig, facial morphs or mouth bones, cartoon style, CC0/CC-BY, animated
  - `cartoon-prop`: reasonable poly count, cartoon style, no complex rigging required
  - `cartoon-set`: environment-scale bounds, walkable surfaces, cartoon style
  - `cartoon-environment`: skybox-compatible or large-scale backdrop
- Profile evaluation scoring:
  - Cartoon style detection (non-photorealistic materials, cel-shading friendly)
  - Facial expressiveness (morph targets or facial bone hierarchy)
  - Animation quality (usable clips for idle/walk/talk/emotion)
  - Rig compatibility with Aura3D humanoid profile
- Browser asset library:
  - Grid/list view with 3D preview (orbit, zoom)
  - Filter by category, style, rig type, license, animation count
  - One-click import to project via typed asset registration
  - Asset detail page with animations preview, material preview, metadata
- Curated starter pack:
  - 5 cartoon characters (hero, sidekick, villain, narrator, background)
  - 10 cartoon props (furniture, vehicles, nature, tools)
  - 5 cartoon sets (indoor room, outdoor park, school, space station, underwater)
  - All CC0/CC-BY with verified provenance

**Acceptance criteria**:
- `npx @aura3d/cli@latest assets search "cartoon character" --profile cartoon-character` returns curated results
- Profile evaluation correctly identifies cartoon-suitable assets
- Browser asset library shows 3D previews
- Curated starter pack assets pass `assets validate-cartoon`

### Phase 2: Production Polish (P1)

#### 6. Camera Choreography

**Goal**: Visual camera path editing with preset shots and composition rules.

**Build on**:
- `ShotCameraInstruction` in `packages/engine/src/agent-api/ShotTimeline.ts` (10 move types)
- `computePerspectiveCameraFrame()` in `packages/rendering/src/CameraFraming.ts`
- Camera controls in `packages/controls/src/`
- `createGameCameraDirector()` in `packages/engine/src/agent-api/GameRuntime.ts`

**New files**:
- `packages/engine/src/agent-api/CameraChoreographer.ts` — camera path authoring with keyframes and presets
- `packages/engine/src/agent-api/CameraPathEditor.ts` — visual camera path editing in 3D viewport
- `packages/engine/src/agent-api/ShotCompositionRules.ts` — rule-of-thirds, leading room, headroom, Dutch angle presets
- `packages/engine/src/agent-api/CameraPresetLibrary.ts` — named camera presets (establishing, medium, close-up, over-shoulder, tracking, crane)

**Scope**:
- Camera path keyframes with position, rotation, FOV
- Smooth interpolation (catmull-rom, bezier) between camera keyframes
- Preset library: establishing shot, medium shot, close-up, over-the-shoulder, tracking shot, crane shot, dolly zoom
- Composition overlays: rule-of-thirds grid, safe areas, leading room
- Shot/reverse-shot automation for dialogue scenes
- Camera shake with configurable intensity and decay
- Focus pull targets (rack focus between characters)
- Camera path visualization in viewport (visible path line with keyframe markers)

**Acceptance criteria**:
- Can keyframe a camera path with smooth interpolation
- Preset shots can be applied and customized
- Composition overlays display correctly
- Shot/reverse-shot generates correct alternating framings

#### 7. Multi-Track Audio

**Goal**: Dialogue, music, and SFX tracks with mixing and waveform display.

**Build on**:
- `AudioSystem`, `AudioMixer`, `AudioBus`, `AudioSource` in `packages/audio/src/`
- `AudioClip` in `packages/audio/src/AudioClip.ts`
- `createAudioStemManifest()` in `packages/engine/src/agent-api/DialoguePerformance.ts`
- `TimelineModel` tracks in `packages/editor-runtime/src/TimelineModel.ts`

**New files**:
- `packages/audio/src/AudioFileManager.ts` — load and cache audio files from typed assets or URLs
- `packages/audio/src/AudioWaveform.ts` — compute waveform data for visualization
- `packages/audio/src/AudioTimelineTrack.ts` — timeline integration for audio clips
- `packages/engine/src/agent-api/DialogueAlignment.ts` — align dialogue lines to audio file timing

**Scope**:
- Load audio files via typed asset registration (`assets add ./audio/music.mp3 --name bgMusic`)
- Timeline tracks for: dialogue, music, SFX, ambient
- Waveform visualization per track
- Volume envelope editing per clip
- Bus routing: dialogue → voice bus, music → music bus, SFX → sfx bus
- Master volume and per-bus mute/solo
- Audio clip trimming and splitting on timeline
- Sync dialogue lines to audio file start/end times
- Ducking: auto-lower music volume during dialogue

**Acceptance criteria**:
- Audio files load and play correctly from typed assets
- Waveform displays in timeline tracks
- Volume mixing across dialogue/music/SFX buses
- Dialogue-auto-duck works during speech

#### 8. Character Performance Expansion

**Goal**: Richer character acting with custom poses and body language.

**Build on**:
- `CartoonPerformance.ts` (9 emotions, 5 gestures, 537 lines)
- `createCartoonPerformance()`, `sampleCartoonCharacterPerformance()`
- `resolveCartoonEmotionPose()`, `resolveCartoonGesture()`
- `AnimationController` for playing performance clips

**New files**:
- `packages/engine/src/agent-api/PerformancePoseEditor.ts` — custom pose authoring with body/facial/gaze states
- `packages/engine/src/agent-api/PerformanceBlender.ts` — blend between emotion poses and gestures
- `packages/engine/src/agent-api/PerformanceScriptParser.ts` — parse script stage directions into performance cues
- `packages/engine/src/agent-api/BodyLanguageLibrary.ts` — expanded gesture and body language presets

**Scope**:
- Expanded emotion library: add embarrassed, angry, fearful, disgusted, confused, determined, sleepy
- Expanded gesture library: add shrug, thumbs-up, facepalm, bow, salute, thinking pose, applause
- Custom pose authoring: define body (spine bend, head tilt), facial (brow, eye, mouth), gaze (target, blink rate)
- Pose blending: smooth transition between emotion poses (e.g., curious → surprised)
- Script direction parsing: `[excited]`, `[whisper]`, `[gestures:wave]` in dialogue text
- Body language automation: idle fidget, breathing, weight shift based on emotion state
- Per-character performance tuning: some characters are more expressive, some more reserved

**Acceptance criteria**:
- Can author custom poses and apply them to characters
- Emotion transitions are smooth (no popping)
- Script stage directions generate correct performance cues
- Body language automation adds life to idle characters

#### 9. Episode Template System

**Goal**: Pre-built episode structures for common cartoon formats.

**Build on**:
- `compilePromptEpisodePlan()` in `packages/engine/src/agent-api/CartoonDirector.ts`
- `createCartoonDirectorPlan()` for beat compilation
- `prompt-cartoon-channel` template in `packages/create-aura3d/templates/`
- `SceneSequencer` (new, from Phase 1)

**New files**:
- `packages/engine/src/agent-api/EpisodeTemplates.ts` — episode format templates
- `packages/create-aura3d/templates/cartoon-studio/` — full cartoon studio template
- `packages/create-aura3d/templates/episode-builder/` — episode builder template

**Scope**:
- Episode format templates:
  - **Short-form** (1-3 min): single-location, 2-3 characters, 3-5 beats
  - **Standard** (5-7 min): multi-location, 3-5 characters, 8-12 beats, intro/outro
  - **Series pilot** (10-15 min): full story arc, character introductions, cliffhanger
  - **Educational** (3-5 min): narrator-led, topic segments, quiz moments
  - **Music video** (2-4 min): song-driven, no dialogue, choreographed camera
- Template includes: episode structure, character roles, beat pacing, camera style, music cues
- `cartoon-studio` template: full project with visual timeline, asset library, render pipeline
- `episode-builder` template: guided wizard for creating episodes from prompts

**Acceptance criteria**:
- Each template produces a valid episode plan that compiles through `compilePromptEpisodePlan()`
- `cartoon-studio` template builds and runs with `npx create-aura3d@latest my-studio --template cartoon-studio`
- Template episodes pass `evaluatePromptAnimationPublishReadiness()`

### Phase 3: Publishing and Polish (P2)

#### 10. Publishing Pipeline

**Goal**: From rendered episode to YouTube-ready upload package.

**Build on**:
- `CartoonRenderOutputPackageMetadata` in `packages/engine/src/agent-api/CartoonRenderQueue.ts`
- `PromptAnimationYouTubeDraftMetadata` in `packages/engine/src/agent-api/PromptAnimationContract.ts`
- `evaluatePromptAnimationPublishReadiness()` in `packages/engine/src/agent-api/PromptAnimationEvidence.ts`
- Caption track in `packages/engine/src/agent-api/DialoguePerformance.ts`

**New files**:
- `packages/engine/src/agent-api/PublishingPipeline.ts` — assemble publish-ready package
- `packages/engine/src/agent-api/CaptionExporter.ts` — export VTT/SRT caption files
- `packages/engine/src/agent-api/ThumbnailGenerator.ts` — capture and optimize episode thumbnails
- `packages/engine/src/agent-api/YouTubeMetadataGenerator.ts` — generate YouTube-ready metadata

**Scope**:
- Caption export: VTT and SRT formats from caption track
- Thumbnail capture: select frame from specified shot time, resize to YouTube specs (1280x720)
- YouTube metadata: title, description, tags, category, language, captions flag
- Publish package: video file + captions + thumbnail + metadata JSON
- Publish readiness gates: video exists, captions exist, thumbnail exists, metadata complete, no safety flags
- Optional: YouTube Data API integration for direct upload (stretch goal)

**Acceptance criteria**:
- VTT/SRT captions are correctly formatted and timed
- Thumbnail is captured at correct resolution
- YouTube metadata JSON includes all required fields
- Publish package passes readiness evaluation

#### 11. In-Browser Scene Editor

**Goal**: Visual scene composition with drag-and-drop character/set placement.

**Build on**:
- `EditorRuntime` in `packages/editor-runtime/src/EditorRuntime.ts`
- `TranslateGizmo`, `RotateGizmo`, `ScaleGizmo` in `packages/editor-runtime/src/`
- `Selection`, `HierarchyModel`, `InspectorModel` in `packages/editor-runtime/src/`
- `PrefabRegistry` in `packages/editor-runtime/src/PrefabRegistry.ts`
- `PickingService` in `packages/editor-runtime/src/PickingService.ts`

**New files**:
- `packages/editor-runtime/src/CartoonSceneEditor.ts` — cartoon-specific scene editor with character/set/prop placement
- `packages/editor-runtime/src/AssetDropZone.ts` — drag-and-drop asset placement from library
- `packages/editor-runtime/src/SceneOutliner.ts` — scene hierarchy tree with cartoon-specific icons
- `packages/editor-runtime/src/PropertyPanel.ts` — property inspector for cartoon elements

**Scope**:
- 3D viewport with orbit/pan/zoom controls
- Scene hierarchy panel with cartoon-specific icons (character, set, prop, camera, light)
- Asset drop zone: drag from asset library, drop into scene
- Transform gizmos for positioning characters and props
- Property inspector for selected objects (position, rotation, scale, animation clips, material)
- Camera viewport preview (what the camera sees)
- Character pose preview in viewport
- Scene save/load via `ProjectSerializer`

**Acceptance criteria**:
- Can place characters and props in the scene via drag-and-drop
- Transform gizmos work for position, rotation, scale
- Property inspector shows and edits object properties
- Scene saves and loads correctly

#### 12. Cartoon-Specific Visual Scripting Nodes

**Goal**: Visual scripting nodes for cartoon production workflows.

**Build on**:
- `VisualNodeCatalog` in `packages/scripting/src/VisualNodeCatalog.ts` (60+ existing nodes)
- `VisualGraphExecutor` in `packages/scripting/src/VisualGraphExecutor.ts`
- `VisualGraphContext` in `packages/scripting/src/VisualGraphContext.ts`

**New files**:
- `packages/scripting/src/CartoonVisualNodes.ts` — cartoon-specific node definitions
- `packages/scripting/src/CartoonNodeCategories.ts` — cartoon node category definitions

**Scope**:
- New node categories:
  - **Scene**: `setScene`, `transitionTo`, `loadSet`, `spawnCharacter`
  - **Dialogue**: `sayLine`, `waitForResponse`, `setEmotion`, `setGesture`
  - **Camera**: `cutTo`, `dollyTo`, `frameCharacter`, `shakeCamera`
  - **Audio**: `playMusic`, `stopMusic`, `playSfx`, `setVolume`
  - **Timing**: `waitForBeat`, `syncToAudio`, `delay`, `schedule`
  - **Publishing**: `captureThumbnail`, `exportCaption`, `markChapter`
- Total: ~30 new nodes
- All nodes validate and execute deterministically through `VisualGraphExecutor`

**Acceptance criteria**:
- New nodes appear in visual scripting catalog
- Nodes execute correctly in `VisualGraphExecutor`
- Cartoon nodes integrate with timeline and scene sequencer

## Technical Approach

### Architecture Principles

1. **Build on existing primitives**: Every new feature must compose existing packages, not duplicate them.
2. **Typed asset pipeline**: All audio, video, and scene assets flow through the typed asset system.
3. **Deterministic execution**: Timeline playback, render capture, and evidence must be deterministic for testing.
4. **Browser-first**: All features must work in the browser. Headless rendering is a secondary target.
5. **Agent-safe API**: New APIs must be usable by AI coding agents through documented TypeScript interfaces.
6. **Contract-driven**: Use JSON contract artifacts (episode plan, shot timeline, render queue) as the source of truth.

### Package Impact Map

| Package | New files | Modified files | Purpose |
|---|---|---|---|
| `@aura3d/engine` | 12 | 8 | Video export, lip sync, scene sequencer, camera choreography, performance, publishing |
| `@aura3d/editor-runtime` | 6 | 4 | Timeline editor, keyframe editor, curve editor, scene editor |
| `@aura3d/audio` | 3 | 2 | Audio file management, waveform, timeline integration |
| `@aura3d/scripting` | 2 | 1 | Cartoon visual scripting nodes |
| `@aura3d/asset-index` | 1 | 2 | Cartoon asset profiles |
| `@aura3d/cli` | 2 | 3 | Cartoon asset profiles, validation |
| `@aura3d/rendering` | 0 | 2 | Frame capture optimization, batch render |
| `@aura3d/animation` | 0 | 1 | Performance pose blending |
| `@aura3d/scene` | 0 | 1 | Scene template system |
| `create-aura3d` | 2 | 2 | cartoon-studio, episode-builder templates |

### Key Dependencies

| Dependency | Purpose | Status |
|---|---|---|
| WebCodecs API | Browser-native video encoding | Available in Chrome/Edge. Firefox: behind flag. Safari: partial. |
| MediaRecorder API | Fallback video encoding (WebM) | Widely available. Quality lower than WebCodecs. |
| Web Audio API | Audio playback and analysis | Widely available. Already used by `@aura3d/audio`. |
| Canvas API | Waveform and timeline rendering | Widely available. Already used for thumbnails. |
| MP4Box.js | MP4 muxing for WebCodecs output | MIT license. npm package. ~150KB. |

### Video Export Technical Approach

The video export pipeline has two paths:

**Path A: MediaRecorder (baseline)**
1. Render each frame to an offscreen canvas
2. Capture canvas as `MediaStream` via `canvas.captureStream()`
3. Record stream via `MediaRecorder` with VP9/Opus codecs
4. Mux audio stems as separate tracks
5. Output WebM file

**Path B: WebCodecs (higher quality)**
1. Render each frame to an offscreen canvas
2. Encode frames via `VideoEncoder` with H.264/VP9 codec
3. Encode audio via `AudioEncoder` (or use pre-encoded stems)
4. Mux via MP4Box.js into MP4 container
5. Output MP4 file

Path A is the baseline. Path B is Phase 2/3 when WebCodecs support is broader.

## Milestones

### Phase 1: Core Production Pipeline (8 weeks)

| Week | Milestone | Deliverables |
|---|---|---|
| 1-2 | Video export MVP | `VideoExportPipeline.ts`, `FrameEncoder.ts`, `RenderProgressTracker.ts`. WebM output via MediaRecorder. |
| 2-3 | Lip sync from audio | `AudioVisemeAnalyzer.ts`, `WaveformVisualizer.ts`. Audio-driven visemes with waveform display. |
| 3-5 | Visual timeline editor | `TimelineEditorController.ts`, `KeyframeEditor.ts`, `TimelineTrackTypes.ts`, `TimelineUI.ts`. Multi-track timeline with clip editing. |
| 5-6 | Scene sequencer | `SceneSequencer.ts`, `ShotTransitionEngine.ts`, `EpisodeStructure.ts`. Multi-shot episodes with transitions. |
| 6-8 | Cartoon asset library | `cartoon-profile.ts`, `cartoon-asset-profiles.ts`, `AssetLibraryBrowser.ts`. CLI profiles + browser browsing. Curated starter pack. |

**Phase 1 acceptance**: A creator can scaffold a cartoon episode, browse and import assets, edit shots on a timeline, sync dialogue with lip sync, and export to WebM video.

### Phase 2: Production Polish (6 weeks)

| Week | Milestone | Deliverables |
|---|---|---|
| 1-2 | Camera choreography | `CameraChoreographer.ts`, `CameraPresetLibrary.ts`, `ShotCompositionRules.ts`. Camera path editing and presets. |
| 2-3 | Multi-track audio | `AudioFileManager.ts`, `AudioWaveform.ts`, `AudioTimelineTrack.ts`. Dialogue/music/SFX mixing. |
| 3-4 | Character performance | `PerformancePoseEditor.ts`, `PerformanceBlender.ts`, `BodyLanguageLibrary.ts`. Expanded emotions/gestures. |
| 4-6 | Episode templates | `EpisodeTemplates.ts`, `cartoon-studio` template, `episode-builder` template. |

**Phase 2 acceptance**: A creator can compose camera shots, mix audio tracks, direct character performances, and start from episode templates.

### Phase 3: Publishing and Polish (4 weeks)

| Week | Milestone | Deliverables |
|---|---|---|
| 1-2 | Publishing pipeline | `PublishingPipeline.ts`, `CaptionExporter.ts`, `ThumbnailGenerator.ts`, `YouTubeMetadataGenerator.ts`. |
| 2-3 | Scene editor | `CartoonSceneEditor.ts`, `AssetDropZone.ts`, `SceneOutliner.ts`. Visual scene composition. |
| 3-4 | Visual scripting nodes | `CartoonVisualNodes.ts`, `CartoonNodeCategories.ts`. 30 cartoon-specific nodes. |

**Phase 3 acceptance**: A creator can compose scenes visually, use visual scripting for cartoon logic, and export a YouTube-ready package with video, captions, thumbnail, and metadata.

## Release Claim Rules

### If All P0 Gates Pass

Aura3D 1.0.7 may say:

- "AI-native TypeScript 3D content-creation platform for animated cartoons."
- "Browser-based video export with timeline editing, lip sync, and camera choreography."
- "Curated cartoon asset library with character, prop, set, and environment profiles."
- "From prompt to publishable cartoon episode in one platform."

### If Phase 1 Gates Pass But Phase 2/3 Do Not

Aura3D 1.0.7 may say:

- "Cartoon production pipeline with video export and timeline editing."
- "Camera choreography, audio mixing, and publishing pipeline in development."

Aura3D 1.0.7 must not say:

- "Complete cartoon production studio."
- "YouTube-ready in one click."
- "Replaces traditional animation tools."

### Not Allowed Unless Additional Proof Exists

- "Same level as Adobe Animate / Toon Boom / Blender for cartoon production."
- "AI automatically generates complete cartoon episodes."
- "Professional-grade animation tooling."

## Out of Scope for 1.0.7

- Full nonlinear animation editor (NLA) comparable to Blender/Unity
- 3D modeling/sculpting tools
- Physics-based cloth/hair simulation for characters
- Motion capture from webcam
- Multi-user real-time collaboration
- Native mobile app
- Console/TV deployment
- Marketplace for selling cartoon assets
- AI-generated dialogue voices (this is AuraVoice's domain, not Aura3D's)
- Procedural environment generation from text prompts

## Definition of Done

Aura3D 1.0.7 is done when:

1. A creator can scaffold a cartoon project from a template.
2. A creator can browse and import cartoon-ready assets from the curated library.
3. A creator can place characters, props, and sets in a 3D scene.
4. A creator can edit shots, keyframes, and audio on a visual timeline.
5. A creator can sync dialogue audio to character lip movements.
6. A creator can compose camera shots with presets and path editing.
7. A creator can mix dialogue, music, and SFX tracks.
8. A creator can export the episode to a video file with synchronized audio.
9. A creator can export captions, thumbnails, and YouTube metadata.
10. All features work through documented TypeScript APIs usable by AI coding agents.
11. All features pass automated tests with deterministic evidence.
12. Documentation, README, and marketing claims match the tested capabilities.
