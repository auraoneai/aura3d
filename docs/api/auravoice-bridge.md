# AuraVoice Bridge API

AuraVoice owns script, voice, caption, viseme, dub, and audio-stem timing.
Aura3D owns typed 3D scene assembly, character performance, camera choreography,
render queues, screenshots, and visual evidence. The bridge between them is a
source contract built from public `@aura3d/engine` exports.

Boundary (firm): **Aura3D never does TTS and never authors or emits dialogue.** The animation
render is **silent by design** — the exported video carries video only, no audio stream. Aura3D
supplies the lip-sync mechanism (the `mouthOpen` viseme morph driver and a burned-in caption
track) so AuraVoice's viseme/caption timeline can drive performance, but AuraVoice supplies the
content (speech, narration, audio mix). Aura3D is the back-half rendering engine; AuraVoice is the
front half.

Use this page for AuraVoice/Aura3D package handoff examples. Do not import
private engine files, `three`, `three/examples`, or loader internals. Do not
invent GLB URLs or string model ids. Add real character and prop files through
the Aura3D CLI, then use generated typed assets.

AuraVoice/Aura3D timing evidence is necessary but not sufficient for a animation episode claim. A bridge package proves that dialogue, captions, audio stems, viseme cues, and shots share timing ids. It does not prove that characters visibly acted, mouths moved in rendered frames, audio was muxed into a video, or a publish-ready package was produced.

Label lip-sync modes honestly (the `miko`/`luma`/`moon-garden` names used throughout this page are
just the example payload for the explicit-contract API — they are not a required or default cast/set;
the `animation-studio` template binds prompt-derived characters to a neutral curated cast instead):

- `phoneme-aligned`: AuraVoice or another timing source supplied phoneme/word alignment.
- `blendshape-lip-sync`: typed GLB morph targets were inspected and driven at runtime.
- `primitive-mouth-card`: a fallback mouth-card layer was driven from cues.
- `amplitude-only`: audio amplitude was mapped to mouth openness; this is a heuristic, not phoneme recognition.
- `missing-mouth-motion`: dialogue exists but rendered mouth movement has not been proven.

Do not describe amplitude-only output as high-quality lip sync. Do not count still-image mouth wobble, global image shake, or subtitle-only changes as rendered mouth movement.

```bash
npx @aura3d/cli@latest assets add ./assets/miko.glb --name miko
npx @aura3d/cli@latest assets add ./assets/luma.glb --name luma
```

```ts
import {
  collectPromptAnimationEvidence,
  compilePromptEpisodePlan,
  createAudioStemManifest,
  createAuraApp,
  createAuraVoiceBridgePackage,
  createAuraVoiceVisemeTrack,
  createCaptionTimingProof,
  createAnimationRenderOutputPackageMetadata,
  createGlbBlendshapeVisemeCue,
  createPrimitiveMouthVisemeCues,
  createShotPlaybackPlan,
  evaluatePromptAnimationPublishReadiness,
  game,
  installShotPlayback,
  lights,
  model,
  sampleAuraVoiceBridgeAtTime,
  scene,
  validateAuraVoiceBridgePackage
} from "@aura3d/engine";
import { assets } from "./aura-assets";
```

## Bridge package flow

```ts
const plan = compilePromptEpisodePlan({
  episodeId: "moon-garden",
  title: "Moon Garden Helpers",
  prompt: "Two friendly robots clean a glowing moon garden.",
  language: "en",
  runtime: {
    duration: 12,
    frameRate: 30,
    resolution: { width: 1280, height: 720 },
    maxTimingDriftFrames: 1,
    reducedMotion: true,
    highContrast: true
  },
  characters: [
    { id: "miko", name: "Miko", role: "hero", voiceId: "auravoice:miko", asset: assets.miko },
    { id: "luma", name: "Luma", role: "sidekick", voiceId: "auravoice:luma", asset: assets.luma }
  ],
  locations: [
    {
      id: "moon-garden",
      name: "Moon Garden",
      description: "Bioluminescent plants with caption-safe framing.",
      mood: "soft neon bedtime"
    }
  ],
  beats: [
    {
      id: "beat-001",
      locationId: "moon-garden",
      summary: "Miko and Luma sweep glowing moon weeds.",
      visualIntent: "Typed robot characters, readable captions, and gentle moonlit staging.",
      duration: 12,
      characters: ["miko", "luma"],
      dialogue: [
        { speakerId: "miko", text: "The moon garden is glowing again.", emotion: "curious" },
        { speakerId: "luma", text: "Then let us make it sparkle.", emotion: "happy" }
      ]
    }
  ],
  route: "/episodes/moon-garden"
});
```

Build caption, viseme, audio-stem, render-output, and bridge contracts from the
same timing source:

AuraVoice v2 viseme cues may include `phoneme`, `phonemeId`, `word`, `wordIndex`, `wordStartTime`, and `wordEndTime`; Aura3D preserves those fields when deriving primitive mouth-card or GLB blendshape playback. Dubbing maps must preserve original and dubbed storyboard, shot, dialogue, caption, speaker, and character ids unless AuraVoice emits an explicit retime instruction in the shot timeline.

```ts
const visemes = createAuraVoiceVisemeTrack({
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

const captionTimingProof = createCaptionTimingProof(plan.dialogueTrack, plan.captionTrack, {
  frameRate: plan.shotTimeline.frameRate,
  maxAllowedDriftFrames: plan.episodePlan.runtime.maxTimingDriftFrames
});

const renderOutputPackage = createAnimationRenderOutputPackageMetadata({
  episodePlan: plan.episodePlan,
  shotTimeline: plan.shotTimeline,
  renderQueue: plan.renderQueue
});

const bridgePackage = createAuraVoiceBridgePackage({
  episodePlan: plan.episodePlan,
  storyboard: plan.storyboard,
  shotTimeline: plan.shotTimeline,
  dialogueTrack: plan.dialogueTrack,
  captionTrack: plan.captionTrack,
  visemes,
  audioStems,
  renderQueue: plan.renderQueue,
  renderOutputPackage
});

const bridgeIssues = validateAuraVoiceBridgePackage(bridgePackage);
const sample = sampleAuraVoiceBridgeAtTime(bridgePackage, 3);
```

## Runtime playback

```ts
const playback = createShotPlaybackPlan({
  timeline: plan.shotTimeline,
  performance: plan.performance,
  captions: plan.captionTrack,
  visemes,
  runtimeNodeByCharacterId: { miko: "miko", luma: "luma" },
  loop: true
});

const app = createAuraApp("#app", {
  scene: scene()
    .add(model(assets.miko).runtime(game.runtimeNode("miko", { tags: ["character"] })))
    .add(model(assets.luma).runtime(game.runtimeNode("luma", { tags: ["character"] })))
    .add(lights.studio())
});

installShotPlayback(app, playback);
```

## Evidence contract

```ts
const promptEvidence = collectPromptAnimationEvidence({
  bridgePackage,
  screenshots: [
    {
      id: "shot-001",
      time: sample.time,
      path: "artifacts/screenshots/shot-001.png",
      hash: "sha256:replace-after-capture",
      width: 1280,
      height: 720
    }
  ],
  routeHealth: { status: "planned" }
});

const readiness = evaluatePromptAnimationPublishReadiness(promptEvidence);

window.__AURA3D_AURAVOICE_SOURCE_EVIDENCE__ = {
  bridgeIssues,
  captionTimingProof,
  readiness,
  promptEvidence,
  note: "Source evidence only; render, audio, screenshot, deployment, and visual review proof are still required."
};
```

The screenshot hash above is a placeholder in source examples. Replace it only
after deterministic capture has produced real bytes, a stable path, and a
content hash.

## Source versus execution gates

| Gate | Source-complete signal | Execution-required proof |
| --- | --- | --- |
| Contract id | Bridge package declares the AuraVoice/Aura3D prompt-animation contract | Evidence JSON emitted by the package/render pipeline |
| Timing | Dialogue, captions, phoneme-aligned visemes, audio stems, and shot timeline share one frame rate | Drift report with caption, phoneme, viseme, and audio sample proof |
| Playback | `createShotPlaybackPlan(...)` and `installShotPlayback(...)` target runtime node ids | Browser route report showing captions, visemes, character performance, and camera cuts |
| Artifacts | Render queue and render-output metadata list planned stills, video, captions, stems, thumbnails, and evidence JSON | Actual artifact paths, byte sizes, SHA-256 hashes, media types, and stable ids |
| Readiness | `evaluatePromptAnimationPublishReadiness(...)` is called from source evidence | Archived readiness JSON plus screenshot/video, accessibility, route-health, package-smoke, deployment, and review proof |

Source-complete bridge packages are ready for execution gates. They are not
publish-ready until the later proof artifacts exist.
