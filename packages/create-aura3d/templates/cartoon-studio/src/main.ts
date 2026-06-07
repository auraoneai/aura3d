import {
  applyShotPlaybackFrame,
  camera,
  captionCueAtTime,
  createAuraApp,
  createShotPlaybackPlan,
  effects,
  game,
  group,
  groundedPlacement,
  labels,
  lights,
  material,
  model,
  primitives,
  sampleAuraVoiceBridgeAtTime,
  sampleShotPlaybackPlan,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";
import {
  episode,
  episodeContractId,
  missingCartoonCharacterAssets,
  publicCartoonAssetInstructions,
  requiredCartoonCharacterAssets,
  typedCartoonAssetSummary
} from "./episode";
import {
  accessibilityProofMetadata,
  auraVoicePackage,
  bridgeIssues,
  bridgeSampleAtThumbnail,
  captionFrameSyncSourceProof,
  captionTimingProof,
  deterministicScreenshotFixtures,
  glbVisemeRuntimeExample,
  promptAnimationEvidence,
  primitiveMouthRuntimeExample,
  phonemeVisemeDubSyncSourceProof,
  publishReadiness,
  renderOutputPackage,
  renderPlan,
  sampleRenderSourceWorkflow,
  visemeFrameSyncSourceProof,
  visemeTrack
} from "./render-plan";
import { cartoonStudioSupport, installCartoonStudioPanel } from "./studio";

declare global {
  interface Window {
    __AURA3D_CARTOON_EPISODE_SEEK__?: (time: number) => void;
    __AURA3D_CARTOON_EPISODE_PROOF__?: CartoonEpisodeRouteProof;
    __AURA3D_CARTOON_TEMPLATE__?: CartoonEpisodeRouteProof;
  }
}

interface CartoonEpisodeRouteProof {
      readonly proofKind: "aura3d-cartoon-episode-proof";
      readonly contractId: string;
      readonly template: string;
      readonly storyBible: unknown;
      readonly shots: readonly unknown[];
      readonly captions: readonly unknown[];
      readonly visemes: readonly unknown[];
      readonly gestures: readonly unknown[];
      readonly assets: unknown;
      readonly renderStatus: unknown;
      readonly errors: readonly string[];
      readonly sourceOnlyAcceptedAsPublishProof: false;
      readonly shotIds: readonly string[];
      readonly captionIds: readonly string[];
      readonly playbackProbeTimes: readonly number[];
      readonly playbackProbeSamples: readonly unknown[];
      readonly renderQueueItems: number;
      readonly renderPreset: unknown;
      readonly typedAssets: unknown;
      readonly requiredTypedAssets: readonly string[];
      readonly missingTypedAssets: readonly string[];
      readonly assetCommands: readonly string[];
      readonly bridgeIssues: readonly unknown[];
      readonly promptAnimationEvidence: unknown;
      readonly publishReadiness: unknown;
      readonly studio: unknown;
      readonly sourceProofs: unknown;
      readonly sampleRenderSourceWorkflow: unknown;
      sampleAt(time: number): unknown;
}

const firstStoryboardShot = episode.storyboard.scenes[0]?.shots[0];
const firstCaption = episode.captionTrack.cues[0];
const thumbnailCapture = renderOutputPackage.thumbnailCapture;
const thumbnailCaption = captionCueAtTime(episode.captionTrack, thumbnailCapture.time);
const storyBible = episode.storyBible;
const captureMode = new URLSearchParams(window.location.search).get("capture") === "thumbnail";
const cartoonRenderPreset = createCartoonStudioRouteRenderPreset({
  name: "moon-garden-cartoon-studio",
  resolution: episode.episodePlan.runtime.resolution,
  materialStyle: { treatment: "cel" },
  reducedMotion: episode.episodePlan.runtime.reducedMotion,
  reducedFlash: true
});

const captionOverlay = document.createElement("div");
captionOverlay.id = "caption-overlay";
captionOverlay.textContent = firstCaption?.text ?? firstStoryboardShot?.storyBeat ?? "Aura3D cartoon studio";
captionOverlay.style.cssText = [
  "position:fixed",
  captureMode ? "display:none" : "",
  "left:50%",
  "bottom:28px",
  "transform:translateX(-50%)",
  "max-width:min(840px,calc(100vw - 32px))",
  "padding:12px 18px",
  "border-radius:14px",
  "background:rgba(3,12,20,0.88)",
  "color:#f8fff2",
  "font:700 18px/1.35 ui-rounded, Trebuchet MS, sans-serif",
  "letter-spacing:0.01em",
  "text-align:center",
  "box-shadow:0 10px 30px rgba(0,0,0,0.28)",
  "z-index:10"
].join(";");
document.body.appendChild(captionOverlay);

const shotPlaybackPlan = createShotPlaybackPlan({
  timeline: episode.shotTimeline,
  performance: episode.performance,
  captions: episode.captionTrack,
  visemes: visemeTrack,
  runtimeNodeByCharacterId: {
    miko: "miko",
    luma: "luma"
  },
  loop: true
});

const playbackProbeTimes = [1, 21, 43] as const;
const playbackProbeSamples = playbackProbeTimes.map((time) => sampleCartoonRouteAt(time));
captionOverlay.dataset.shotId = playbackProbeSamples[0]?.shotId ?? "";
captionOverlay.dataset.captionId = playbackProbeSamples[0]?.captionId ?? firstCaption?.captionId ?? "";
document.body.dataset.cartoonShotCount = String(episode.shotTimeline.shots.length);
document.body.dataset.cartoonCaptionCount = String(episode.captionTrack.cues.length);
document.body.dataset.cartoonStoryBibleProps = String(storyBible.props.length);
document.body.dataset.cartoonStudioPanels = cartoonStudioSupport.panels.join(",");
if (!captureMode) installCartoonStudioPanel(document.body);

// Ground the cartoon characters on the moon-garden path and normalize their
// wildly different native scales (miko bounds ~0.066m tall, luma ~1.8m) to a
// single on-screen height so neither floats nor dwarfs the other. Bounds come
// from the generated typed assets (`boundsMetadata` in aura.assets.json):
//   miko -> min/max y [-0.013, 0.013], center origin
//   luma -> min/max y [0, 1.8], foot origin
// The path box sits at y=0.05 with a 0.04-thick top, so its walkable surface is
// at y = 0.05 + 0.02 = 0.07; both characters rest their lowest point there.
const PATH_FLOOR_Y = 0.07;
const CHARACTER_TARGET_HEIGHT = 1.5;
const mikoBounds = { min: [-0.033, -0.013, -0.009], max: [0.033, 0.013, 0.008] } as const;
const lumaBounds = { min: [-0.55, 0, -0.4], max: [0.55, 1.8, 0.4] } as const;
const mikoPlacement = groundedPlacement(mikoBounds, { targetHeight: CHARACTER_TARGET_HEIGHT, x: -0.8, z: 0, floorY: PATH_FLOOR_Y });
const lumaPlacement = groundedPlacement(lumaBounds, { targetHeight: CHARACTER_TARGET_HEIGHT, x: 0.8, z: 0, floorY: PATH_FLOOR_Y });

const app = createAuraApp("#app", {
  scene: scene()
    .background("#081b2a")
    .add(
      model(assets.moonGarden, { name: "Moon Garden typed set asset" })
        .position(0, 0, -0.02)
        .scale(1)
        .runtime(game.runtimeNode("moonGarden", { tags: ["set", "typed-asset", "moon-garden"] }))
    )
    .add(
      model(assets.miko, { name: "Miko typed cartoon character" })
        .position(mikoPlacement.position[0], mikoPlacement.position[1], mikoPlacement.position[2])
        .scale(mikoPlacement.scale)
        .runtime(game.runtimeNode("miko", { tags: ["character", "miko", "typed-asset"] }))
    )
    .add(createMouthCard("miko:mouth", "Miko", [mikoPlacement.position[0], mikoPlacement.position[1] + CHARACTER_TARGET_HEIGHT * 0.92, 0.32], "#f8fff2"))
    .add(
      model(assets.luma, { name: "Luma typed cartoon character" })
        .position(lumaPlacement.position[0], lumaPlacement.position[1], lumaPlacement.position[2])
        .scale(lumaPlacement.scale)
        .runtime(game.runtimeNode("luma", { tags: ["character", "luma", "typed-asset"] }))
    )
    .add(createMouthCard("luma:mouth", "Luma", [lumaPlacement.position[0], lumaPlacement.position[1] + CHARACTER_TARGET_HEIGHT * 0.92, 0.32], "#40ffbf"))
    .add(
      primitives
        .box({ name: "moon garden path", material: material.pbr({ color: "#182d3f", roughness: 0.78 }) })
        .position(0, 0.05, 0)
        .scale([2.8, 0.04, 0.8])
    )
    .add(
      primitives
        .sphere({ name: "glow stones primitive fallback", material: material.emissive({ color: "#ffe18e", emissive: "#ffe18e", emissiveIntensity: 0.42 }) })
        .position(0.18, 0.16, 0.28)
        .scale([0.16, 0.08, 0.16])
    )
    .add(
      primitives
        .box({ name: "moon lilies primitive fallback", material: material.pbr({ color: "#f8fff2", roughness: 0.5 }) })
        .position(-0.38, 0.2, 0.18)
        .scale([0.12, 0.24, 0.04])
    )
    .add(captureMode ? group("thumbnail capture label placeholder") : labels.hud(firstCaption?.text ?? firstStoryboardShot?.storyBeat ?? "Aura3D cartoon studio"))
    .add(lights.studio({ intensity: 1.2 }))
    .add(effects.bloom({ intensity: 0.18, color: "#7de2ff" }))
    .camera(camera.perspective({ position: [0, 1.4, 4.2], target: [0, 0.7, 0], fov: 42 })),
  diagnostics: !captureMode
});

const cartoonEpisodeProof: CartoonEpisodeRouteProof = {
  proofKind: "aura3d-cartoon-episode-proof",
  contractId: episodeContractId,
  template: "cartoon-studio",
  storyBible,
  shots: episode.shotTimeline.shots,
  captions: episode.captionTrack.cues,
  visemes: visemeTrack.cues,
  gestures: episode.performance.cues,
  assets: typedCartoonAssetSummary,
  renderStatus: {
    route: renderPlan.route,
    renderQueueItems: renderPlan.items.length,
    outputs: renderPlan.outputs.map((output) => output.kind),
    preset: cartoonRenderPreset,
    sourceOnlyAcceptedAsPublishProof: false,
    publishReadyFromCurrentEvidence: publishReadiness.ready,
    issueCount: publishReadiness.issues.length
  },
  errors: bridgeIssues.map((issue) => String((issue as { message?: unknown }).message ?? issue)),
  sourceOnlyAcceptedAsPublishProof: false,
  shotIds: episode.shotTimeline.shots.map((shot) => shot.shotId),
  captionIds: episode.captionTrack.cues.map((caption) => caption.captionId),
  playbackProbeTimes,
  playbackProbeSamples,
  renderQueueItems: renderPlan.items.length,
  renderPreset: cartoonRenderPreset,
  typedAssets: typedCartoonAssetSummary,
  requiredTypedAssets: requiredCartoonCharacterAssets,
  missingTypedAssets: missingCartoonCharacterAssets,
  assetCommands: publicCartoonAssetInstructions,
  bridgeIssues,
  promptAnimationEvidence,
  publishReadiness,
  studio: cartoonStudioSupport,
  sourceProofs: {
    captionFrameSyncSourceProof,
    visemeFrameSyncSourceProof,
    phonemeVisemeDubSyncSourceProof
  },
  sampleRenderSourceWorkflow,
  sampleAt(time: number) {
    return sampleCartoonRouteAt(time);
  }
};
window.__AURA3D_CARTOON_EPISODE_PROOF__ = cartoonEpisodeProof;
window.__AURA3D_CARTOON_TEMPLATE__ = cartoonEpisodeProof;
const shotPlaybackApplyOptions = {
  primitiveMouthNodeByCharacterId: {
    miko: "miko:mouth",
    luma: "luma:mouth"
  },
  playAnimationClips: true,
  onCaption(caption: { readonly text?: string; readonly captionId?: string } | undefined, framePlan: { readonly shotId?: string }) {
    captionOverlay.textContent = caption?.text ?? firstCaption?.text ?? "";
    captionOverlay.dataset.shotId = framePlan.shotId ?? "";
    captionOverlay.dataset.captionId = caption?.captionId ?? "";
  }
} as const;

// Map a director action to an actual GLB clip so the characters play real skeletal
// animation instead of standing in their imported bind (T) pose.
function clipForAction(action: string | undefined): string {
  switch (action) {
    case "walk":
    case "move":
      return "Walking";
    case "wave":
    case "greet":
    case "point":
    case "react":
    case "celebrate":
    case "happy":
      return "Wave";
    case "jump":
      return "Jump";
    case "punch":
    case "action":
    case "clean":
      return "Punch";
    default:
      return "Idle"; // idle / speak / listen
  }
}

// Deterministically pose every character (position, rotation, animation clip, mouth)
// at the requested time, injecting a real GLB clip per action so nobody is T-posed.
function applyCartoonFrameAt(time: number) {
  const frame = sampleShotPlaybackPlan(shotPlaybackPlan, time);
  const nodeUpdates = frame.nodeUpdates.map((update) => ({
    ...update,
    animationClip: update.animationClip ?? clipForAction(update.action)
  }));
  applyShotPlaybackFrame(app, { ...frame, nodeUpdates }, shotPlaybackApplyOptions);
}
window.__AURA3D_CARTOON_EPISODE_SEEK__ = applyCartoonFrameAt;

if (captureMode) {
  // Deterministic capture: the seek hook drives the rendered frame.
  applyCartoonFrameAt(1);
} else {
  // Live preview: play the episode timeline on the runtime clock with real clips.
  app.onFrame((frame) => applyCartoonFrameAt(frame.time));
}

function createMouthCard(id: "miko:mouth" | "luma:mouth", name: string, position: readonly [number, number, number], color: string) {
  return primitives
    .box({
      name: `${name} primitive mouth card`,
      material: material.emissive({ color, emissive: color, emissiveIntensity: 0.32 })
    })
    .position(position[0], position[1], position[2])
    .scale([0.22, 0.035, 0.025])
    .runtime(game.runtimeNode(id, { tags: ["mouth", "primitive", name.toLowerCase()] }));
}

function createCartoonStudioRouteRenderPreset(input: {
  readonly name: string;
  readonly resolution: { readonly width: number; readonly height: number };
  readonly materialStyle: { readonly treatment: "cel" | "preserve-pbr" };
  readonly reducedMotion?: boolean | undefined;
  readonly reducedFlash?: boolean | undefined;
}) {
  return {
    kind: "cartoon-render-preset-evidence",
    name: input.name,
    resolution: input.resolution,
    lights: ["soft-key", "cool-rim", "set-fill", "emissive-practicals"],
    shadows: { soft: true, contact: true },
    postprocess: {
      bloom: input.reducedFlash ? 0.08 : 0.18,
      colorGrade: "storybook-night",
      fogDepthCue: true
    },
    materialStyle: {
      treatment: input.materialStyle.treatment,
      outline: input.materialStyle.treatment === "cel",
      rampSteps: input.materialStyle.treatment === "cel" ? 4 : 7,
      saturation: 1.08,
      blackLineWeight: input.materialStyle.treatment === "cel" ? 0.9 : 0
    },
    frameBudgetMs: 16.7,
    debugOverlaysAllowedInExport: false,
    reducedMotion: input.reducedMotion ?? false,
    reducedFlash: input.reducedFlash ?? false
  } as const;
}

function sampleCartoonRouteAt(time: number) {
  const bridgeSample = sampleAuraVoiceBridgeAtTime(auraVoicePackage, time);
  const playbackSample = sampleShotPlaybackPlan(shotPlaybackPlan, time);
  const caption = captionCueAtTime(episode.captionTrack, time);
  const speakingCharacterId = bridgeSample.dialogue?.speakerId;
  return {
    time,
    frame: bridgeSample.frame,
    shotId: bridgeSample.shot?.shotId,
    sceneId: bridgeSample.shot?.sceneId,
    captionId: caption?.captionId,
    captionText: caption?.text,
    cameraMove: bridgeSample.shot?.camera.move,
    transitionOut: bridgeSample.shot?.transitionOut,
    dialogueLineId: bridgeSample.dialogue?.lineId,
    visemeId: bridgeSample.viseme?.primaryVisemeId,
    nodeUpdates: playbackSample.nodeUpdates.map((update) => ({
      characterId: update.characterId,
      action: speakingCharacterId === update.characterId ? "speak" : update.action,
      emotion: update.emotion,
      position: update.position
    })),
    sourceShotCharacters: (bridgeSample.shot?.characters ?? []).map((character) => ({
      characterId: character.characterId,
      action: speakingCharacterId === character.characterId ? "speak" : character.action,
      emotion: character.emotion,
      position: character.position
    }))
  };
}
