# Aura3D Prompt Animation API

Aura3D prompt animation turns a structured episode plan into browser-rendered 3D scenes. It is designed for AI agents and production tools that need predictable shot timing, captions, visemes, typed assets, screenshots, and evidence.

## Public modules

Use the public root package:

```ts
import {
  animationStudio,
  captionCueAtTime,
  cartoon,
  cartoonDirector,
  collectPromptAnimationEvidence,
  compilePromptEpisodePlan,
  createAudioStemManifest,
  createAuraApp,
  createAuraVoiceBridgePackage,
  createAuraVoiceVisemeTrack,
  createCaptionTimingProof,
  createCartoonRenderOutputPackageMetadata,
  createCartoonRenderQueue,
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

## 1.1 cartoon-studio boundary

Aura3D 1.1 plans to promote `cartoon-studio` from source-level prompt-animation scaffolding into a real episode-production workflow. The target output is not only JSON contracts; it is a package folder containing a playable WebM, optional MP4, thumbnail, captions, metadata, route proof, asset provenance, render manifest, visual acceptance report, and review notes.

Until those render/package gates exist and pass, prompt-animation examples are source-complete examples. They can prove planning, timing, typed asset references, shot playback intent, and evidence schemas. They do not prove final animation quality by themselves.

Rejected as publish-ready animation proof:

- one generated still image with CSS pan, zoom, wobble, shake, or fake parallax;
- subtitles over a static frame;
- a whole scene moving as one flat layer;
- reports marked `sourceOnly: true`, `notTrue3D: true`, or `image-puppet`;
- placeholder screenshot hashes or in-memory frame-encoder summaries presented as video output.

Generated images are still useful as concept art, thumbnails, textures, background plates, or style references. The animation claim must come from typed assets, rigged GLB clips or explicit segmented puppet parts, shot timelines, visemes, captions, rendered files, motion metrics, and review evidence.

## Minimum flow

`compilePromptEpisodePlan(...)` is the shortest public path from prompt-level intent to the source artifacts needed by a prompt-cartoon route.

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

const renderQueue = createCartoonRenderQueue({
  episodePlan: plan.episodePlan,
  shotTimeline: plan.shotTimeline,
  route: "/episodes/moon-garden",
  captureTimes: plan.shotTimeline.shots.flatMap((shot) => shot.captureTimes)
});

const renderOutputPackage = createCartoonRenderOutputPackageMetadata({
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

AuraVoice integration uses the same contract package. AuraVoice supplies narration, dialogue, captions, visemes, beat markers, dubbing maps, and audio stems; Aura3D turns those timing artifacts into cartoon performance, camera motion, scene assembly, screenshots, and evidence.

## Prompt-cartoon playback route

Prompt-cartoon playback keeps one Aura app mounted and mutates runtime nodes from the sampled shot timeline. Characters use typed GLB refs. Primitive mouth-card nodes are an explicit fallback for rigs that do not expose blendshape names.

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

Episode plans created through `compilePromptEpisodePlan(...)`, `cartoon.episodePlan(...)`, or `cartoonDirector.createPlan(...)` include accessibility proof metadata for:

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

These commands are the declared public readiness path for prompt-cartoon and AuraVoice-backed routes. They are not evidence until they have actually been run and their reports are archived with the episode package.

Scaffold a prompt-cartoon channel:

```bash
npx create-aura3d@latest my-episode --template prompt-cartoon-channel
cd my-episode
```

Add typed assets for every character, outfit, prop, and set part before using `model(assets.x)`:

```bash
npx @aura3d/cli@latest assets add ./assets/character.glb --name character
npx @aura3d/cli@latest assets validate-cartoon
```

Repository release gates for the Aura3D 1.0.5 prompt-animation track:

```bash
pnpm prompt-animation:docs
pnpm prompt-animation:template
pnpm prompt-animation:package
pnpm prompt-animation:release
```

Do not mark a prompt-cartoon or AuraVoice route publish-ready until contract validation, caption timing, viseme timing, audio-stem coverage, typed asset readiness, deterministic screenshot hashes, route health, accessibility proof, visual review, and package smoke gates have all passed.

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
| Render queue | `createCartoonRenderQueue(...)` and deterministic capture metadata | Render queue execution with screenshot/video artifacts, byte sizes, hashes, and stable ids |
| Captions and audio | Caption timing proof, audio stems, dub map, viseme track | Caption files, audio-stem manifests, timing drift report, and playback proof |
| Publish readiness | `collectPromptAnimationEvidence(...)` and `evaluatePromptAnimationPublishReadiness(...)` | Archived evidence JSON, screenshot/video hashes, accessibility/visual review, and deploy proof |

Do not publish placeholder screenshot hashes or mark a prompt-cartoon route
publish-ready from source declarations alone.
