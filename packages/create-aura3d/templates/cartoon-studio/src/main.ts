import {
  camera,
  captionCueAtTime,
  createAuraApp,
  createShotPlaybackPlan,
  effects,
  game,
  installShotPlayback,
  labels,
  lights,
  material,
  model,
  primitives,
  sampleAuraVoiceBridgeAtTime,
  sampleShotPlaybackPlan,
  scene,
  type AuraAssetRef
} from "@aura3d/engine";
import { assets } from "./aura-assets";
import {
  episode,
  episodeContractId,
  missingCartoonCharacterAssets,
  publicCartoonAssetInstructions,
  requiredCartoonCharacterAssets,
  typedCartoonAssetSummary,
  type CartoonAssetKey
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
    __AURA3D_CARTOON_TEMPLATE__?: {
      readonly contractId: string;
      readonly template: string;
      readonly storyBible: unknown;
      readonly shotIds: readonly string[];
      readonly captionIds: readonly string[];
      readonly playbackProbeTimes: readonly number[];
      readonly playbackProbeSamples: readonly unknown[];
      readonly renderQueueItems: number;
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
    };
  }
}

const firstStoryboardShot = episode.storyboard.scenes[0]?.shots[0];
const firstCaption = episode.captionTrack.cues[0];
const thumbnailCapture = renderOutputPackage.thumbnailCapture;
const thumbnailCaption = captionCueAtTime(episode.captionTrack, thumbnailCapture.time);
const storyBible = episode.storyBible;
const typedCartoonAssets = assets as Partial<Record<CartoonAssetKey, AuraAssetRef<"model">>>;

const captionOverlay = document.createElement("div");
captionOverlay.id = "caption-overlay";
captionOverlay.textContent = firstCaption?.text ?? firstStoryboardShot?.storyBeat ?? "Aura3D cartoon studio";
captionOverlay.style.cssText = [
  "position:fixed",
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
installCartoonStudioPanel(document.body);

const app = createAuraApp("#app", {
  scene: scene()
    .background("#081b2a")
    .add(createCharacterBody("miko", "Miko", "miko", [-0.8, 0.75, 0], [0.32, 0.42, 0.32], 0.72, "#7de2ff"))
    .add(createMouthCard("miko:mouth", "Miko", [-0.8, 0.8, 0.32], "#f8fff2"))
    .add(createCharacterBody("luma", "Luma", "luma", [0.8, 0.72, 0], [0.3, 0.38, 0.3], 0.68, "#ffe18e"))
    .add(createMouthCard("luma:mouth", "Luma", [0.8, 0.77, 0.32], "#40ffbf"))
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
    .add(labels.hud(firstCaption?.text ?? firstStoryboardShot?.storyBeat ?? "Aura3D cartoon studio"))
    .add(lights.studio({ intensity: 1.2 }))
    .add(effects.bloom({ intensity: 0.18, color: "#7de2ff" }))
    .camera(camera.perspective({ position: [0, 1.4, 4.2], target: [0, 0.7, 0], fov: 42 })),
  diagnostics: true
});

window.__AURA3D_CARTOON_TEMPLATE__ = {
  contractId: episodeContractId,
  template: "cartoon-studio",
  storyBible,
  shotIds: episode.shotTimeline.shots.map((shot) => shot.shotId),
  captionIds: episode.captionTrack.cues.map((caption) => caption.captionId),
  playbackProbeTimes,
  playbackProbeSamples,
  renderQueueItems: renderPlan.items.length,
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

installShotPlayback(app, shotPlaybackPlan, {
  primitiveMouthNodeByCharacterId: {
    miko: "miko:mouth",
    luma: "luma:mouth"
  },
  onCaption(caption, framePlan) {
    captionOverlay.textContent = caption?.text ?? firstCaption?.text ?? "";
    captionOverlay.dataset.shotId = framePlan.shotId ?? "";
    captionOverlay.dataset.captionId = caption?.captionId ?? "";
  }
});

function createCharacterBody(
  id: "miko" | "luma",
  name: string,
  assetKey: CartoonAssetKey,
  position: readonly [number, number, number],
  fallbackScale: readonly [number, number, number],
  modelScale: number,
  color: string
) {
  const asset = typedCartoonAssets[assetKey];
  const runtime = game.runtimeNode(id, { tags: ["character", id, asset ? "typed-asset" : "primitive-fallback"] });
  if (asset) {
    return model(asset, { name: `${name} typed character asset` })
      .position(position[0], position[1], position[2])
      .scale(modelScale)
      .runtime(runtime);
  }
  return primitives
    .sphere({
      name: `${name} primitive fallback body - add ${assetKey} with the Aura3D CLI`,
      material: material.pbr({ color, roughness: 0.54 })
    })
    .position(position[0], position[1], position[2])
    .scale(fallbackScale)
    .runtime(runtime);
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
