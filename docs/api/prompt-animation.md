# Aura3D Prompt Animation API

Aura3D prompt animation turns a structured episode plan into browser-rendered 3D scenes. It is designed for AI agents and production tools that need predictable shot timing, captions, visemes, typed assets, screenshots, and evidence.

## Public modules

Use the public root package:

```ts
import {
  animationStudio,
  captionCueAtTime,
  animation,
  animationDirector,
  collectPromptAnimationEvidence,
  compilePromptEpisodePlan,
  createAudioStemManifest,
  createAuraApp,
  createAuraVoiceBridgePackage,
  createAuraVoiceVisemeTrack,
  createCaptionTimingProof,
  createAnimationRenderOutputPackageMetadata,
  createAnimationRenderQueue,
  createGlbBlendshapeVisemeCue,
  createPrimitiveMouthVisemeCues,
  createPromptAnimationDeterministicScreenshotFixtureMetadata,
  createShotPlaybackPlan,
  evaluatePromptAnimationPublishReadiness,
  game,
  installShotPlayback,
  lights,
  model,
  scene,
  sampleAuraVoiceBridgeAtTime,
  validateAuraVoiceBridgePackage
} from "@aura3d/engine";
import { assets } from "./aura-assets";
```

Do not import private renderer internals. Do not use raw Three.js loaders. Do not invent asset URLs or string asset ids. Add real GLB/glTF character, set, prop, and mouth-rig assets through the CLI, then use generated typed asset refs such as `assets.miko`.

```bash
npx @aura3d/cli@latest assets add ./assets/miko.glb --name miko
npx @aura3d/cli@latest assets add ./assets/luma.glb --name luma
```

## Contract artifacts

Prompt animation packages use `auravoice-aura3d-prompt-animation/v1`.

Required files:

- `episode.plan.json`
- `storyboard.json`
- `shot-timeline.json`
- `dialogue-track.json`
- `caption-track.json`
- `visemes.json`
- `audio-stems.json`
- `dub-map.json`
- `render-queue.json`
- `prompt-animation-evidence.json`

These files are data contracts. Aura3D scenes are still authored as TypeScript against `@aura3d/engine`.

## animation-studio: the working prompt → document → render pipeline

The `compilePromptEpisodePlan(...)` flow documented in this file produces the JSON **contract**
artifacts (used by the `prompt-animation-channel` template and the AuraVoice bridge). The
`animation-studio` template wraps these contracts in a working, agent-driven production pipeline —
prompt → `EpisodeDocument` → rendered video — that does not need a separate LLM or API key.

**You** (the coding agent / AI harness) are the director. You drive the Scene-Tool CLI
(`animation-scene`, exposed as `aura3d animation scene` in an installed project); each command edits
one validated `EpisodeDocument` (`dist/scene/working.document.json`) and is rejected if it would
break the scene. The loop:

```bash
# 1. Generate a complete scene from a prompt (cast + dialogue + camera + per-beat actions):
animation-scene new --prompt "two robots argue on a space station" --full
#    (omit --full for an EMPTY-cast skeleton you populate yourself)

# 2. Override cast slots from the live catalog or a local rig (optional — --full binds a
#    curated A-grade cast so the scene already renders):
animation-scene cast add --id rusty --query "rusty industrial robot"
animation-scene cast add --id sleek --file ./assets/android.glb

# 3. Author the timed dialogue track (the subtitles AND the AuraVoice lip-sync contract).
#    --end is optional; when omitted it is computed from the line's speech duration:
animation-scene dialogue --line l1 --speaker rusty --text "You rerouted the coolant." --start 1

# 4. Direct distinct per-beat performance (blocking, facing, gestures, camera):
animation-scene block --character rusty --shot shot-1 --to -1.2,0 --yaw 1.2 --clip walk

# 5. Render to a silent video (AURA_QUALITY=preview|final, AURA_RENDER_STYLE=toon|pbr):
animation-scene render          # or: AURA_QUALITY=final npm run episode:render-3d
```

Pipeline facts an authoring agent must get right:

- **Cast.** Prompt nouns become characters bound to the curated, render-ready **A-grade humanoid
  cast** (neutral `cast-a` / `cast-b`). It is **never** the moon-garden `miko`/`luma` fixture and
  there is no fixed default scene — `animation-scene new` with no prompt is an error.
- **Set.** `pickSetForPrompt` routes by keyword: garage/workshop/office/kitchen each get a distinct
  interior; forest/meadow/field → meadow; space/station → space-station; moon/garden/night →
  moon-garden; everything else → a neutral studio. **Moon Garden is never the default.**
- **Motion.** A shared standard clip library (`idle / talk / gesture / point / nod / walk / run /
  react`) is retargeted per character. Extracted catalog mocap drives the **upper body**; legs stay
  procedural for stability; locomotion is **velocity-gated** (a walk/run cycle plays only while the
  character is actually translating).
- **Dialogue timing** comes from a speech-duration estimate per line (no fixed subtitle windows).
- **Audio.** The render is **silent by design**. Aura3D **never runs TTS** — it emits the timed
  dialogue/caption/viseme track as the synchronization contract AuraVoice consumes later to generate
  the voice and mux it onto the video.

The render output target is a package folder containing a playable WebM, optional MP4, thumbnail,
captions, metadata, route proof, asset provenance, render manifest, visual acceptance report, and
review notes. The tools guarantee a *valid* document, not a *good* one — story quality is the
directing agent's job.

Rejected as publish-ready animation proof:

- one generated still image with CSS pan, zoom, wobble, shake, or fake parallax;
- subtitles over a static frame;
- a whole scene moving as one flat layer;
- reports marked `sourceOnly: true`, `notTrue3D: true`, or `image-puppet`;
- placeholder screenshot hashes or in-memory frame-encoder summaries presented as video output.

Generated images are still useful as concept art, thumbnails, textures, background plates, or style references. The animation claim must come from typed assets, rigged GLB clips or explicit segmented puppet parts, shot timelines, visemes, captions, rendered files, motion metrics, and review evidence.

## Minimum flow

`compilePromptEpisodePlan(...)` is the shortest public path from prompt-level intent to the source artifacts needed by a prompt-animation route.

```ts
const plan = compilePromptEpisodePlan({
  episodeId: "moon-garden",
  title: "Moon Garden Helpers",
  prompt: "Two robots clean a glowing moon garden.",
  language: "en",
  runtime: {
    duration: 60,
    frameRate: 30,
    resolution: { width: 1280, height: 720 },
    maxTimingDriftFrames: 1,
    reducedMotion: true,
    highContrast: true
  },
  characters: [
    {
      id: "miko",
      name: "Miko",
      role: "hero",
      voiceId: "auravoice:miko",
      asset: assets.miko,
      style: "soft neon robot"
    },
    {
      id: "luma",
      name: "Luma",
      role: "sidekick",
      voiceId: "auravoice:luma",
      asset: assets.luma,
      style: "gentle moon-garden helper"
    }
  ],
  locations: [
    {
      id: "moon-garden",
      name: "Moon Garden",
      description: "Bioluminescent plants, soft lunar stone, and readable caption-safe framing.",
      mood: "soft neon bedtime"
    }
  ],
  beats: [
    {
      id: "beat-001",
      sceneId: "scene-001",
      shotId: "shot-001",
      locationId: "moon-garden",
      summary: "Miko finds glowing weeds and asks Luma for help.",
      visualIntent: "Two typed robot characters framed waist-up in a glowing garden.",
      duration: 8,
      characters: ["miko", "luma"],
      dialogue: [
        {
          speakerId: "miko",
          text: "These moon weeds are glowing again.",
          emotion: "curious"
        },
        {
          speakerId: "luma",
          text: "Then we clean them with gentle light.",
          emotion: "happy"
        }
      ],
      blockingByCharacterId: {
        miko: { position: [-0.7, 0.75, 0] },
        luma: { position: [0.7, 0.75, 0] }
      }
    }
  ],
  route: "/episodes/moon-garden"
});

const renderQueue = createAnimationRenderQueue({
  episodePlan: plan.episodePlan,
  shotTimeline: plan.shotTimeline,
  route: "/episodes/moon-garden",
  captureTimes: plan.shotTimeline.shots.flatMap((shot) => shot.captureTimes)
});

const renderOutputPackage = createAnimationRenderOutputPackageMetadata({
  episodePlan: plan.episodePlan,
  shotTimeline: plan.shotTimeline,
  renderQueue
});

const captionTimingProof = createCaptionTimingProof(plan.dialogueTrack, plan.captionTrack, {
  frameRate: plan.shotTimeline.frameRate,
  maxAllowedDriftFrames: 1
});

console.log(plan.storyboard.scenes.length, renderOutputPackage.reviewPackagePaths, captionTimingProof.status);
```

AuraVoice integration uses the same contract package. AuraVoice supplies narration, dialogue, captions, visemes, beat markers, dubbing maps, and audio stems; Aura3D turns those timing artifacts into animation performance, camera motion, scene assembly, screenshots, and evidence.

## Prompt-animation playback route

Prompt-animation playback keeps one Aura app mounted and mutates runtime nodes from the sampled shot timeline. Characters use typed GLB refs. Primitive mouth-card nodes are an explicit fallback for rigs that do not expose blendshape names.

```ts
const visemeTrack = createAuraVoiceVisemeTrack({
  episodeId: plan.episodePlan.episodeId,
  language: plan.episodePlan.language,
  frameRate: plan.shotTimeline.frameRate,
  cues: plan.dialogueTrack.lines.flatMap((line) =>
    createPrimitiveMouthVisemeCues({
      characterId: line.speakerId,
      speakerId: line.speakerId,
      lineId: line.lineId,
      startTime: line.startTime,
      endTime: line.endTime
    }).map((cue) => createGlbBlendshapeVisemeCue(cue))
  )
});

const playback = createShotPlaybackPlan({
  timeline: plan.shotTimeline,
  performance: plan.performance,
  captions: plan.captionTrack,
  visemes: visemeTrack,
  runtimeNodeByCharacterId: {
    miko: "miko",
    luma: "luma"
  },
  loop: true
});

const captionOverlay = document.querySelector<HTMLElement>("[data-caption]");

const app = createAuraApp("#app", {
  scene: scene()
    .background("#081b2a")
    .add(model(assets.miko).runtime(game.runtimeNode("miko", { tags: ["character", "miko"] })))
    .add(model(assets.luma).runtime(game.runtimeNode("luma", { tags: ["character", "luma"] })))
    .add(lights.studio({ intensity: 1.2 }))
});

installShotPlayback(app, playback, {
  onCaption(caption, framePlan) {
    if (!captionOverlay) return;
    captionOverlay.textContent = caption?.text ?? "";
    captionOverlay.dataset.shotId = framePlan.shotId ?? "";
    captionOverlay.dataset.captionId = caption?.captionId ?? "";
  }
});
```

This keeps one `createAuraApp(...)` instance per route. `installShotPlayback(...)` attaches an `app.onFrame(...)` callback and updates runtime node position, rotation, scale, visibility, animation clip, caption state, and primitive mouth-card shape from the sampled shot time.

## Captions and accessibility proof

Caption timing can be checked without a render pass:

```ts
const captionTimingProof = createCaptionTimingProof(plan.dialogueTrack, plan.captionTrack, {
  frameRate: 30,
  maxAllowedDriftFrames: 1
});

const captionAtThreeSeconds = captionCueAtTime(plan.captionTrack, 3);

console.log(captionTimingProof.status, captionAtThreeSeconds?.text);
```

Episode plans created through `compilePromptEpisodePlan(...)`, `animation.episodePlan(...)`, or `animationDirector.createPlan(...)` include accessibility proof metadata for:

- Captions: required/enabled state, line-safe character target, minimum cue duration, and max timing drift.
- Reduced motion: default state, runtime-toggle requirement, max camera shake, and max flash frequency.
- High contrast: default state, caption/HUD contrast target, and background plate requirement.

Evidence collection reports these fields under `accessibility.proof` and fails readiness if captions, reduced motion, high contrast, flashing safety, or child-safety proof does not pass.

## Viseme examples

AuraVoice v2 viseme cues can carry phoneme and word alignment metadata alongside the mouth-shape timing Aura3D samples at render time. The continuity fields are `lineId`, `speakerId`, `characterId`, `startTime`, `endTime`, `visemeId`, and optional `phoneme`, `phonemeId`, `word`, `wordIndex`, `wordStartTime`, and `wordEndTime`. Aura3D treats these as source timing data and does not invent replacement dialogue timing.

Primitive fallback characters can use generated two-cue mouth-card timing:

```ts
const primitiveCues = createPrimitiveMouthVisemeCues({
  characterId: "miko",
  speakerId: "miko",
  lineId: "shot-001:line-1",
  startTime: 0,
  endTime: 2.4
});
```

Typed GLB characters should drive blendshape weights from typed assets, not string asset ids:

```ts
const glbCues = primitiveCues.map((cue) => createGlbBlendshapeVisemeCue(cue));

const visemeTrackForGlb = createAuraVoiceVisemeTrack({
  episodeId: plan.episodePlan.episodeId,
  language: plan.episodePlan.language,
  frameRate: plan.shotTimeline.frameRate,
  cues: glbCues
});
```

Use the CLI before writing GLB model code:

```bash
npx @aura3d/cli@latest assets add ./assets/character.glb --name character
```

Then import generated assets and render with `model(assets.character)`.

## AuraVoice bridge package and evidence

AuraVoice is the timing authority. Create a bridge package from AuraVoice-generated audio and timing artifacts, then collect Aura3D evidence against that package.

```ts
const audioStems = createAudioStemManifest({
  episodeId: plan.episodePlan.episodeId,
  duration: plan.dialogueTrack.duration,
  stems: plan.dialogueTrack.lines.map((line) => ({
    id: `audio:${line.lineId}`,
    role: "dialogue",
    path: line.audioFile ?? `assets/audio/${line.language}/${line.lineId}.wav`,
    startTime: line.startTime,
    duration: line.endTime - line.startTime,
    language: line.language
  }))
});

const bridgePackage = createAuraVoiceBridgePackage({
  episodePlan: plan.episodePlan,
  storyboard: plan.storyboard,
  shotTimeline: plan.shotTimeline,
  dialogueTrack: plan.dialogueTrack,
  captionTrack: plan.captionTrack,
  visemes: visemeTrack,
  audioStems,
  renderQueue,
  renderOutputPackage
}, {
  route: "/episodes/moon-garden",
  frameRate: 30,
  maxTimingDriftFrames: 1
});

const bridgeIssues = validateAuraVoiceBridgePackage(bridgePackage);
const sample = sampleAuraVoiceBridgeAtTime(bridgePackage, 3.25);

const evidence = collectPromptAnimationEvidence({
  bridgePackage,
  screenshots: [
    {
      id: "shot-001-capture",
      time: sample.time,
      path: "artifacts/screenshots/shot-001.png",
      hash: "sha256:replace-with-rendered-screenshot-hash",
      width: 1280,
      height: 720
    }
  ],
  routeHealth: { status: "pass" }
});

const readiness = evaluatePromptAnimationPublishReadiness(evidence);

console.log(bridgeIssues, sample.dialogue?.lineId, evidence.publishReady, readiness.ready);
```

Do not set placeholder screenshot hashes in production evidence. The hash must come from a deterministic render run.

## Deterministic screenshot fixtures

Render evidence can carry fixture metadata for timestamped shot captures before hashes exist:

```ts
const fixtures = createPromptAnimationDeterministicScreenshotFixtureMetadata({
  bridgePackage,
  count: 3,
  pathPrefix: "artifacts/screenshots"
});
```

The helper picks distinct shot IDs from the render queue and records time, frame, expected path, AuraVoice timestamp, deterministic seed, scene-state ID when present, caption cue ID, viseme cue ID, and expected resolution. These records are metadata only; screenshot hashes must still be filled by a deterministic render run before publish readiness can pass.

## Package and readiness commands

These commands are the declared public readiness path for prompt-animation and AuraVoice-backed routes. They are not evidence until they have actually been run and their reports are archived with the episode package.

Scaffold a prompt-animation channel:

```bash
npx create-aura3d@latest my-episode --template prompt-animation-channel
cd my-episode
```

Add typed assets for every character, outfit, prop, and set part before using `model(assets.x)`:

```bash
npx @aura3d/cli@latest assets add ./assets/character.glb --name character
npx @aura3d/cli@latest assets validate-animation
```

Repository release gates for the Aura3D 1.0.5 prompt-animation track:

```bash
pnpm prompt-animation:docs
pnpm prompt-animation:template
pnpm prompt-animation:package
pnpm prompt-animation:release
```

Do not mark a prompt-animation or AuraVoice route publish-ready until contract validation, caption timing, viseme timing, audio-stem coverage, typed asset readiness, deterministic screenshot hashes, route health, accessibility proof, visual review, and package smoke gates have all passed.

## Evidence rules

An episode is not publish-ready unless evidence proves:

- All referenced artifacts use the expected contract version.
- Captions stay within one frame at 30 fps of dialogue timing.
- Phoneme-aligned visemes stay within one frame at 30 fps of dialogue timing.
- Missing audio, missing captions, missing visemes, missing assets, or excessive timing drift fail readiness.
- Screenshot hashes and capture times are archived.
- Deterministic screenshot fixtures are backed by actual rendered hashes.
- Accessibility proof passes for captions, reduced motion, high contrast, flashing safety, and child safety.

## Source versus execution readiness

Prompt-animation source is complete only when TypeScript examples use public
`@aura3d/engine` exports, typed assets from `./aura-assets`, and the documented
contract artifacts. Source completeness is not publish readiness.

Source-complete examples may call:

```ts
const evidence = collectPromptAnimationEvidence({
  bridgePackage,
  screenshots: [
    {
      id: "shot-001",
      time: 0,
      path: "artifacts/screenshots/shot-001.png",
      hash: "sha256:replace-after-deterministic-capture",
      width: 1280,
      height: 720
    }
  ],
  routeHealth: { status: "planned" }
});

const readiness = evaluatePromptAnimationPublishReadiness(evidence);
```

That source evidence proves the route declares episode planning, storyboard,
shot timeline, captions, visemes, audio stems, render queue, typed assets, shot
playback, and publish-readiness checks. It does not prove that a browser render,
audio mix, screenshot capture, video export, deployment, or human review has
happened.

Treat these as separate gates:

| Gate | Source-complete signal | Execution-required proof |
| --- | --- | --- |
| Episode plan | `compilePromptEpisodePlan(...)` with characters, beats, timing, captions, and route | Typecheck/package smoke from a packed public install |
| AuraVoice bridge | `createAuraVoiceBridgePackage(...)`, `validateAuraVoiceBridgePackage(...)`, `sampleAuraVoiceBridgeAtTime(...)` | AuraVoice/Aura3D package JSON with validation output and timing samples |
| Shot playback | `createShotPlaybackPlan(...)` and `installShotPlayback(app, playback)` | Browser route report showing camera cuts, character state changes, captions, and visemes |
| Render queue | `createAnimationRenderQueue(...)` and deterministic capture metadata | Render queue execution with screenshot/video artifacts, byte sizes, hashes, and stable ids |
| Captions and audio | Caption timing proof, audio stems, dub map, viseme track | Caption files, audio-stem manifests, timing drift report, and playback proof |
| Publish readiness | `collectPromptAnimationEvidence(...)` and `evaluatePromptAnimationPublishReadiness(...)` | Archived evidence JSON, screenshot/video hashes, accessibility/visual review, and deploy proof |

Do not publish placeholder screenshot hashes or mark a prompt-animation route
publish-ready from source declarations alone.

## 1.1 engine animation, render, and publishing APIs

Aura3D 1.1 adds public `@aura3d/engine` exports that turn the prompt-animation
contracts into rendered episode packages with honest, capability-probed
boundaries. Each section below documents real exported symbols. The cloud,
upload, phoneme, and capture adapters are optional integration seams: when they
are not configured they return diagnostics and do nothing, instead of pretending
work happened. These APIs do not generate video from a still image and make no
film-studio or full-studio parity claim; they validate timing, motion, route,
and packaging evidence.

```ts
import {
  createAnimationEpisodePackageManifest,
  createAnimationMotionQualityReport,
  createAnimationRouteProof,
  createCloudRenderAdapter,
  createExternalPhonemeAnalyzerAdapter,
  createFrameEncoder,
  createPerformanceCaptureSession,
  createSceneSequencer,
  createVideoExportPipeline,
  createWebCodecsFrameEncoderAdapter,
  createYouTubeUploadAdapter,
  AssetLibraryBrowser,
  validateAnimationEpisodePackage,
  validateAnimationMotionQuality,
  validateAnimationRouteProof
} from "@aura3d/engine";
```

### Animation episode package writer and validator

`createAnimationEpisodePackageManifest(...)` builds an
`AnimationEpisodePackageManifest` (`aura3d-animation-episode-package/v1`) describing
the on-disk package folder, and `validateAnimationEpisodePackage(manifest)` returns
a `AnimationEpisodePackageValidationReport` with `status: "pass" | "fail"`.

Key fields: `rootPath`, `publishTarget` (`"review" | "publish"`), and a `files`
list of `AnimationEpisodePackageFile` records (each with `role`, `path`, `present`,
optional `byteLength`/`sha256`/`mimeType`). The required roles come from
`requiredAnimationEpisodePackageRoles` (thumbnail, captions VTT + SRT,
metadata JSON, prompt-animation evidence JSON, route-proof JSON, asset-provenance
JSON, render-manifest JSON, visual-acceptance JSON, motion-quality JSON, and the
review-package markdown) plus a video role: `video-webm` is required, with
`video-mp4` accepted as an alternative present video. The optional `routeProof`,
`motionQuality`, `visualAcceptanceStatus`, and `assetProvenanceStatus` fields are
all checked, and a manifest flagged `sourceOnly: true` or `notTrue3D: true` fails.

```ts
const packageManifest = createAnimationEpisodePackageManifest({
  episodeId: plan.episodePlan.episodeId,
  packageId: `${plan.episodePlan.episodeId}:package`,
  rootPath: "dist/episodes/moon-garden",
  publishTarget: "review",
  routeProof,
  motionQuality,
  visualAcceptanceStatus: "pass",
  assetProvenanceStatus: "pass",
  files: [
    { role: "video-webm", path: "episode.webm", present: true, byteLength: 4_200_000 },
    { role: "thumbnail", path: "thumbnail.webp", present: true, byteLength: 64_000 },
    { role: "captions-vtt", path: "captions.vtt", present: true, byteLength: 2_400 },
    { role: "captions-srt", path: "captions.srt", present: true, byteLength: 2_500 },
    { role: "metadata-json", path: "metadata.json", present: true, byteLength: 1_200 },
    { role: "prompt-animation-evidence-json", path: "evidence.json", present: true, byteLength: 8_000 },
    { role: "route-proof-json", path: "route-proof.json", present: true, byteLength: 6_000 },
    { role: "asset-provenance-json", path: "asset-provenance.json", present: true, byteLength: 3_000 },
    { role: "render-manifest-json", path: "render-manifest.json", present: true, byteLength: 5_000 },
    { role: "visual-acceptance-json", path: "visual-acceptance.json", present: true, byteLength: 1_500 },
    { role: "motion-quality-json", path: "motion-quality.json", present: true, byteLength: 4_000 },
    { role: "review-package-md", path: "review.md", present: true, byteLength: 900 }
  ]
});

const packageReport = validateAnimationEpisodePackage(packageManifest);
console.log(packageReport.status, packageReport.missingRoles, packageReport.emptyRoles);
```

### Animation motion-quality analysis

`createAnimationMotionQualityReport(...)` analyzes sampled rendered frames and
timeline segments to reject still-image / global-only motion, and
`validateAnimationMotionQuality(report)` re-checks a stored report. The schema is
`aura3d-animation-motion-quality/v1`.

Input frames are `AnimationMotionFrameSample` records (`frame`, `time`,
`frameHash`, `globalDelta`, optional `cameraMoveExpected`, and per-`regions`
`AnimationMotionFrameRegionSample` deltas keyed by `kind`: head, torso, arm, hand,
leg, mouth, prop, background). Segments (`AnimationMotionSegmentInput`) carry a
`kind` (establishing, dialogue, action, camera, transition) and a frame range.
Thresholds default from `defaultAnimationMotionQualityThresholds` (min frame-hash
changes, min global/region/mouth deltas, min independent moving region kinds, and
max global-only frame ratio). The report fails when motion is global-only, when
dialogue/action segments lack enough independently moving region kinds, or when a
dialogue segment has no mouth motion.

```ts
const motionQuality = createAnimationMotionQualityReport({
  episodeId: plan.episodePlan.episodeId,
  frameRate: 30,
  frames: sampledFrames, // AnimationMotionFrameSample[] captured from the render
  segments: [
    { id: "seg-dialogue-1", shotId: "shot-001", kind: "dialogue", startFrame: 0, endFrame: 240 }
  ]
});

console.log(motionQuality.status, motionQuality.globalOnlyMotion);
const motionIssues = validateAnimationMotionQuality(motionQuality);
```

### Animation route proof

`createAnimationRouteProof(...)` builds a `AnimationRouteProof`
(`aura3d-animation-route-proof/v1`) that proves a playback route actually rendered
characters, captions, visemes, gestures, and controls; `validateAnimationRouteProof`
re-checks a stored proof.

Key inputs: `route`, `duration`, `frameRate`, `assets`
(`AnimationRouteProofAsset` with `role`, `typedAsset`, `source` and `ready` flags),
`shots` (`AnimationRouteProofShot` with expected vs. visible character ids,
`nonblank`, `frameCount`, `frameHashes`), `captions`, `visemes`
(`mode` includes `"missing-mouth-motion"`, which fails), `gestures`, a `render`
state (`AnimationRouteProofRenderState` with `nonblank`, `sourceOnly`, `notTrue3D`,
overlay/chrome flags), and a `playback` state
(`AnimationRouteProofPlaybackState` requiring play/pause/scrub/jump). The output
carries `checks` (`AnimationRouteReadinessCheck[]`), `issues`, and
`status`. Source-only / not-true-3D routes and visible debug overlays fail.

```ts
const routeProof = createAnimationRouteProof({
  episodeId: plan.episodePlan.episodeId,
  route: "/episodes/moon-garden",
  duration: 60,
  frameRate: 30,
  assets: [
    { id: "miko", role: "character", typedAsset: true, source: "aura-assets", ready: true },
    { id: "luma", role: "character", typedAsset: true, source: "aura-assets", ready: true },
    { id: "moon-garden", role: "set", typedAsset: true, source: "aura-assets", ready: true }
  ],
  shots: renderedShots,       // AnimationRouteProofShot[]
  captions: renderedCaptions, // rendered: true
  visemes: renderedVisemes,   // rendered: true, mode: "blendshape-lip-sync"
  gestures: renderedGestures, // rendered: true
  render: { frameCount: 1800, nonblank: true, sourceOnly: false, notTrue3D: false },
  playback: {
    canPlay: true, canPause: true, canScrub: true, canJumpShots: true,
    captionsToggle: true, muteToggle: true, reducedMotion: true, reducedFlash: true
  }
});

console.log(routeProof.status, routeProof.checks.filter((check) => !check.passed));
```

### Render queue

`createAnimationRenderQueue(...)` (covered in the minimum-flow example above)
returns a `AnimationRenderQueueArtifact` (`render-queue`) of per-frame
`AnimationRenderQueueItem` capture targets, each bound to a deterministic
`AnimationRenderSceneStateSource` (stable `sceneStateId`, `deterministicSeed`, and
matching AuraVoice timestamp). `validateAnimationRenderQueue(queue)` enforces the
route, frame rate, capture times, outputs, frame-list/thumbnail/evidence frame
integrity, and scene-state binding. Default outputs and evidence targets come
from `defaultAnimationRenderOutputs` and `defaultAnimationEvidenceTargets`.

```ts
const renderQueue = createAnimationRenderQueue({
  episodePlan: plan.episodePlan,
  shotTimeline: plan.shotTimeline,
  route: "/episodes/moon-garden",
  viewport: { width: 1920, height: 1080 }
});

const queueIssues = validateAnimationRenderQueue(renderQueue);
console.log(renderQueue.items.length, renderQueue.frameRate, queueIssues);
```

### Video export pipeline and frame-encoder adapters

`createVideoExportPipeline(...)` drives a render queue against a
`VideoExportRuntime` (you implement `captureFrame(item)` and optional
`seek`/`step`), encodes frames through a `FrameEncoder`, muxes audio, and returns
a `VideoExportResult`. `createVideoExportPlan(...)` produces just the
`VideoExportPlan` (output path, mime type, `codec`, frame count) without running.

The pipeline has an explicit honesty boundary controlled by `readinessMode`
(`"proof" | "publish"`, default `"proof"`):

- In `"proof"` mode it runs with the default in-memory encoder adapter
  (`createInMemoryFrameEncoderAdapter()`, `proofOnly: true`), which records frame
  metadata only and produces no playable file. The result's
  `output.encodedOutputMode` is `"memory-summary"` and
  `output.playableEncodedOutput` is `false`.
- In `"publish"` mode it throws if the encoder adapter is proof-only, if the
  encoded artifact has no real `output`, if the output is not `playable`, or if
  audio stems were provided but no muxed output was produced.

`createFrameEncoder(...)` returns a `FrameEncoder`; codecs are
`vp9 | vp8 | h264 | av1 | png-sequence`. The `EncodedVideoArtifact` exposes
`outputMode` (`memory-summary | encoded-video | encoded-chunks | png-sequence |
unsupported`), `proofOnly`, `playable`, and `output`.

WebCodecs boundary: `createWebCodecsFrameEncoderAdapter(...)` emits encoded video
chunks via the browser `VideoEncoder`, and `probeWebCodecsFrameEncoder(codec)`
reports a `WebCodecsFrameEncoderCapability`. Its default `outputMode` is
`"encoded-chunks"` and `canProducePlayableFile` is `false`: raw WebCodecs chunks
are NOT a playable MP4/WebM file. A real container writer/muxer is required
(`requiresExternalMuxer: true`); pass a custom `outputFactory` (and
`playableOutput: true`) only when you actually produce a real container, which is
what `"publish"` mode demands.

```ts
const exportPlan = createVideoExportPlan({ renderQueue, outputPackage: renderOutputPackage });

// Proof export: validates timing/coverage, no playable file is produced.
const proofPipeline = createVideoExportPipeline({
  renderQueue,
  outputPackage: renderOutputPackage,
  runtime,                 // implements captureFrame(item)
  audioStems,              // AudioStemManifestArtifact or AudioMuxerInputStem[]
  readinessMode: "proof"
});
const proofResult = await proofPipeline.render();
console.log(proofResult.output.encodedOutputMode, proofResult.output.playableEncodedOutput); // "memory-summary" false

// Publish export: requires a real, playable encoder adapter (e.g. WebCodecs + a container writer).
const publishPipeline = createVideoExportPipeline({
  renderQueue,
  outputPackage: renderOutputPackage,
  runtime,
  audioStems,
  encoderAdapter: createWebCodecsFrameEncoderAdapter({
    codec: "h264",
    playableOutput: true,
    outputFactory: writeRealMp4Container // your real container writer
  }),
  readinessMode: "publish"
});
```

### Optional, capability-probed stretch adapters

These adapters are honest seams for capabilities Aura3D does not perform itself.
Each ships a `probe*` / `capability` check that returns `supported: false` plus
diagnostics when unconfigured, and the adapter no-ops (or returns a blocked
result) rather than faking work.

Cloud render: `createCloudRenderAdapter(options)` and
`probeCloudRenderAdapter(options)`. Providers are
`local | github-actions | render-farm | custom`. Without a `submit` handler or
configured endpoint/credentials the capability is `unsupported` /
`missing-credentials` and `submit(...)` returns a `status: "unsupported"`
`CloudRenderJobResult`. Build a request with `createCloudRenderJobRequest(...)`.

```ts
const cloud = createCloudRenderAdapter({ provider: "render-farm" });
console.log(cloud.available, cloud.capability.status, cloud.capability.diagnostics);
const cloudResult = await cloud.submit(
  createCloudRenderJobRequest({ packageManifest, renderQueue })
);
```

YouTube upload: `createYouTubeUploadAdapter(options)` with
`probeYouTubeUploadAdapter`, `createYouTubeUploadPackage(publishingPackage)`, and
`validateYouTubeUploadPackage(pkg)`. Without an `upload` handler/credentials the
capability is `unsupported`/`missing-credentials` and `upload(...)` returns a
`status: "blocked"` result; package validation must also pass (video,
thumbnail, title, captions). Defaults to `dryRun: true`.

```ts
const youtube = createYouTubeUploadAdapter(); // unconfigured -> blocked, dry run
const uploadResult = await youtube.upload(createYouTubeUploadPackage(publishingPackage));
console.log(youtube.capability.status, uploadResult.status, uploadResult.diagnostics);
```

External phoneme analyzer: `createExternalPhonemeAnalyzerAdapter(options)` with
`probeExternalPhonemeAnalyzer`. With no `provider` it is `unsupported` and falls
back to amplitude-only visemes (returning `ok: false` plus a diagnostic); a wired
provider returns an `ExternalPhonemeAlignment` of `ExternalPhonemeTiming`
records that upgrade the viseme analysis.

```ts
const phonemes = createExternalPhonemeAnalyzerAdapter(); // unconfigured -> amplitude-only fallback
const phonemeResult = await phonemes.analyze({
  episodeId: plan.episodePlan.episodeId,
  characterId: "miko",
  language: "en",
  transcript: "These moon weeds are glowing again."
});
console.log(phonemeResult.ok, phonemeResult.status, phonemeResult.diagnostics);
```

Performance capture: `createPerformanceCaptureSession(options)` returns a
`PerformanceCaptureRecordingSession`. Sources are `manual | webcam |
motion-capture`; non-manual sources require an available capability with granted
runtime permission, and `start()` throws otherwise. Recorded
`PerformanceCaptureRecordingSample`s convert to a `AnimationPerformanceArtifact`
via `toPerformanceArtifact()`. The snapshot always reports
`externalServiceIntegrated: false`. Capabilities can be checked with
`validatePerformanceCaptureCapability(capability)`.

```ts
const capture = createPerformanceCaptureSession({
  id: "capture-001",
  episodeId: plan.episodePlan.episodeId,
  characterId: "miko",
  frameRate: 30,
  source: { kind: "manual", available: true, permission: "not-required", supportedSignals: ["body", "face"] }
});
capture.start();
const performance = capture.toPerformanceArtifact();
```

Asset-library browser: `new AssetLibraryBrowser(manifest)` filters and inspects a
`AnimationAssetManifest`. `setFilter`, `select`, `snapshot`, `detail`,
`editorReference`, and `marketplaceSnapshot` enforce typed `assets.*` references
and license metadata (`editorReference` throws for non-typed or unlicensed
entries). Snapshots report `externalServicesIntegrated: false`; there is no live
marketplace, only the offline typed manifest.

```ts
const browser = new AssetLibraryBrowser(animationAssetManifest);
const visible = browser.setFilter({ kind: "character", lipSyncReady: true });
console.log(visible.visible, visible.evidence.typedAssetReferencesOnly);
```

### Scene sequencer and camera choreographer

`createSceneSequencer({ episode, timeline })` returns a `SceneSequencerPlan`
(`scene-sequencer`) binding episode structure to the shot timeline;
`sampleSceneSequencer(plan, time)` returns the active scene/shot/transition and
`createSceneSequencerPlayback(plan)` gives a play/pause/scrub/jump controller.
(A legacy `createSceneSequencer(timeline, structure)` overload remains.)

`createCameraChoreography({ episodeId, paths })` returns a
`CameraChoreographyArtifact` of `CameraPath`s; build paths with
`createCameraPathFromPreset(...)` or `shotReverseShotCameraPaths(...)`, sample
with `sampleCameraPath(path, time)`, and convert a `CameraSample` to a shot
camera instruction with `cameraInstructionFromSample(sample)`.

```ts
const sequencer = createSceneSequencer({ episode: episodeStructure, timeline: plan.shotTimeline });
const playback = createSceneSequencerPlayback(sequencer);

const cameras = createCameraChoreography({
  episodeId: plan.episodePlan.episodeId,
  paths: [
    createCameraPathFromPreset({
      id: "shot-001:cam",
      presetId: "over-shoulder",
      startTime: 0,
      endTime: 8,
      subjectPosition: [0.7, 0.75, 0]
    })
  ]
});
const cameraSample = sampleCameraPath(cameras.paths[0], 3);
```
