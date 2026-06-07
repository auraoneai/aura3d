# Cartoon Channel Example

`cartoon-channel` and `prompt-cartoon-channel` are source-level prompt-animation examples. They are useful for learning the AuraVoice bridge, shot timelines, captions, visemes, render queues, and evidence contracts. They are not, by themselves, proof of a publish-ready cartoon episode.

Use `cartoon-studio` for the planned 1.1 production episode workflow:

```bash
npx create-aura3d@latest my-studio --template cartoon-studio
```

Use the prompt-cartoon template for a source-level episode starter:

```bash
npx create-aura3d@latest my-episode --template prompt-cartoon-channel
```

The shorter template alias remains supported:

```bash
npx create-aura3d@latest my-cartoon --template cartoon-channel
```

Cartoon-channel routes use public `@aura3d/engine` APIs, typed assets generated
by the Aura3D CLI, AuraVoice timing packages, shot timelines, captions,
phoneme-aligned visemes, render queues, and evidence manifests. Do not import `three`, use
`GLTFLoader`, invent raw GLB URLs, or pass string ids to `model(...)`.

Important release boundary: still-image puppet experiments, CSS-only image wobble, whole-frame pan/zoom/shake, fake parallax plates, and subtitle-over-still videos are rejected as publish-ready animation proof. If a route is marked `notTrue3D: true`, `sourceOnly: true`, `image-puppet`, or similar, treat it as experimental or negative evidence only.

Add real character assets first:

```bash
npx @aura3d/cli@latest assets add ./assets/miko.glb --name miko
npx @aura3d/cli@latest assets add ./assets/luma.glb --name luma
```

Then author normal TypeScript:

```ts
import {
  collectPromptAnimationEvidence,
  compilePromptEpisodePlan,
  createAudioStemManifest,
  createAuraApp,
  createAuraVoiceBridgePackage,
  createAuraVoiceVisemeTrack,
  createCartoonRenderOutputPackageMetadata,
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

const plan = compilePromptEpisodePlan({
  episodeId: "package-smoke-moon-garden",
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
    { id: "miko", name: "Miko", role: "hero", asset: assets.miko, voiceId: "auravoice:miko" },
    { id: "luma", name: "Luma", role: "sidekick", asset: assets.luma, voiceId: "auravoice:luma" }
  ],
  locations: [{ id: "moon-garden", name: "Moon Garden", mood: "soft neon bedtime" }],
  beats: [
    {
      id: "beat-001",
      locationId: "moon-garden",
      summary: "Miko and Luma sweep glowing moon weeds.",
      visualIntent: "Typed characters, readable captions, and gentle moonlit staging.",
      duration: 12,
      characters: ["miko", "luma"],
      dialogue: [
        { speakerId: "miko", text: "The moon garden is glowing again.", emotion: "curious" },
        { speakerId: "luma", text: "Then let us make it sparkle.", emotion: "happy" }
      ]
    }
  ],
  route: "/episodes/package-smoke-moon-garden"
});

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

const renderOutputPackage = createCartoonRenderOutputPackageMetadata({
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
    .add(model(assets.miko).runtime(game.runtimeNode("miko", { tags: ["character", "typed-glb"] })))
    .add(model(assets.luma).runtime(game.runtimeNode("luma", { tags: ["character", "typed-glb"] })))
    .add(lights.studio())
});

installShotPlayback(app, playback);

const sample = sampleAuraVoiceBridgeAtTime(bridgePackage, 3);
const evidence = collectPromptAnimationEvidence({
  bridgePackage,
  screenshots: [
    {
      id: "shot-001",
      time: sample.time,
      path: "artifacts/screenshots/package-smoke-shot-001.png",
      hash: "sha256:replace-after-deterministic-capture",
      width: 1280,
      height: 720
    }
  ],
  routeHealth: { status: "planned" }
});

window.__AURA3D_CARTOON_CHANNEL_SOURCE_EVIDENCE__ = {
  bridgeIssues: validateAuraVoiceBridgePackage(bridgePackage),
  readiness: evaluatePromptAnimationPublishReadiness(evidence),
  evidence,
  note: "Source evidence only; browser render, package smoke, screenshot hashes, deploy proof, and review approval are still required."
};
```

## Evidence-only gates

| Gate | Required proof before publish-ready claims |
| --- | --- |
| Package API | Packed `@aura3d/engine` install smoke from a clean consumer project |
| Browser playback | Route report showing shot playback, caption timing, phoneme/viseme timing, dub-id continuity, camera cuts, and character state changes |
| Render artifacts | Video/still/thumbnail/caption/audio/evidence files with byte sizes and SHA-256 hashes |
| Accessibility | Reduced-motion, high-contrast, caption readability, flash limits, and pause/replay controls |
| Deployment | Durable HTTPS route with matching static asset and evidence bytes |
| Review | Human or automated visual approval against the episode prompt and storyboard |

The source example declares the package contract and planned evidence. It is not
a completed render, package smoke, deployment, or visual approval artifact.

## 1.0.5 typed GLB viseme proof

For 1.0.5 release work, a cartoon route should prove both timing and visible
mouth-shape output. Primitive mouth cards remain an explicit fallback, but a GLB
blendshape claim requires typed morph target names and rendered evidence.

```ts
const host = app.nodes.require("miko");

const glbVisemes = createAuraVoiceVisemeTrack({
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
    }).map((cue) =>
      createGlbBlendshapeVisemeCue({
        ...cue,
        blendshapeMap: {
          aa: "Mouth_AA",
          ah: "Mouth_AA",
          iy: "Mouth_EE",
          oh: "Mouth_OH",
          sil: "Mouth_Rest"
        }
      })
    )
  )
});

app.onFrame(({ time }) => {
  const sample = sampleAuraVoiceBridgeAtTime(bridgePackage, time, "miko");
  host.setMorphTargets(sample.viseme?.blendshapeWeights ?? {});
});
```

Before claiming GLB blendshape sync, archive asset evidence showing that
`assets.miko` exposes `Mouth_AA`, `Mouth_EE`, `Mouth_OH`, and `Mouth_Rest`, or
replace those names with the inspected typed asset names. The evidence JSON
should record dialogue time, frame, caption id, viseme id, morph target weights,
runtime node id, screenshot path, screenshot hash, and timing drift in frames.
