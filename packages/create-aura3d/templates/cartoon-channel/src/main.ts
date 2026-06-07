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
import "./sample-episode-visual.css";
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
import { installConceptEpisode2_5D } from "./concept-episode-2-5d";
import { installPuppetEpisode2D } from "./puppet-episode-2d";
import { installSampleEpisodeVisual } from "./sample-episode-visual";

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
      readonly sourceProofs: unknown;
      readonly sampleRenderSourceWorkflow: unknown;
      diagnostics(): unknown;
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
captionOverlay.textContent = firstCaption?.text ?? firstStoryboardShot?.storyBeat ?? "Aura3D cartoon channel";
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
const cartoonView = new URLSearchParams(window.location.search).get("view");
if (cartoonView === "concept-2-5d") {
  installConceptEpisode2_5D({
    sampleAt: sampleCartoonRouteAt,
    duration: episode.episodePlan.runtime.duration
  });
} else if (cartoonView === "puppet-2d") {
  installPuppetEpisode2D({
    sampleAt: sampleCartoonRouteAt,
    duration: episode.episodePlan.runtime.duration
  });
} else {
  installSampleEpisodeVisual({
    sampleAt: sampleCartoonRouteAt,
    duration: episode.episodePlan.runtime.duration,
    usesTypedAssets: missingCartoonCharacterAssets.length === 0
  });
}

const app = createAuraApp("#app", {
  scene: scene()
    .background("#081b2a")
    .addMany(createAuraRenderedCartoonScene())
    .add(createCharacterBody("miko", "Miko", "miko", [-0.72, 0.08, -0.34], [0.32, 0.42, 0.32], 0.9, "#7de2ff"))
    .add(createMouthCard("miko:mouth", "Miko", [-3.2, -3.2, -3.2], "#f8fff2"))
    .add(createCharacterBody("luma", "Luma", "luma", [0.72, 0.08, -0.34], [0.3, 0.38, 0.3], 0.9, "#ffe18e"))
    .add(createMouthCard("luma:mouth", "Luma", [3.2, -3.2, -3.2], "#40ffbf"))
    .add(
      primitives
        .box({ name: "moon garden path", material: material.pbr({ color: "#182d3f", roughness: 0.78 }) })
        .position(0, 0.05, 0)
        .scale([2.8, 0.04, 0.8])
    )
    .add(
      primitives
        .sphere({ name: "glow stones primitive fallback", material: material.emissive({ color: "#ffe18e" }) })
        .position(0.18, 0.16, 0.28)
        .scale([0.16, 0.08, 0.16])
    )
    .add(
      primitives
        .box({ name: "moon lilies primitive fallback", material: material.pbr({ color: "#f8fff2", roughness: 0.5 }) })
        .position(-0.38, 0.2, 0.18)
        .scale([0.12, 0.24, 0.04])
    )
    .add(labels.hud(firstCaption?.text ?? firstStoryboardShot?.storyBeat ?? "Aura3D cartoon channel"))
    .add(lights.studio({ intensity: 1.2 }))
    .add(effects.bloom({ intensity: 0.18, color: "#7de2ff" }))
    .camera(camera.perspective({ position: [0, 1.18, 4.4], target: [0, 0.82, -0.45], fov: 38 })),
  diagnostics: true
});

window.__AURA3D_CARTOON_TEMPLATE__ = {
  contractId: episodeContractId,
  template: "cartoon-channel",
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
  sourceProofs: {
    captionFrameSyncSourceProof,
    visemeFrameSyncSourceProof,
    phonemeVisemeDubSyncSourceProof
  },
  sampleRenderSourceWorkflow,
  diagnostics() {
    return app.diagnostics();
  },
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
      .material(material.pbr({ color, roughness: 0.38, metallic: 0.02 }))
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
      material: material.emissive({ color })
    })
    .position(position[0], position[1], position[2])
    .scale([0.22, 0.035, 0.025])
    .runtime(game.runtimeNode(id, { tags: ["mouth", "primitive", name.toLowerCase()] }));
}

function createAuraRenderedCartoonScene() {
  const skyMat = material.emissive({ color: "#0a2941", emissive: "#0f4765", emissiveIntensity: 0.18 });
  const gardenMat = material.pbr({ color: "#17493e", roughness: 0.64, metallic: 0.02 });
  const pathMat = material.clearcoat({ color: "#526b62", roughness: 0.2, clearcoat: 0.4 });
  const shadowMat = material.pbr({ color: "#020813", roughness: 0.96, opacity: 0.44 });
  const moonMat = material.emissive({ color: "#b7f4ff", emissive: "#7de2ff", emissiveIntensity: 0.82, opacity: 0.72 });
  const bloomCyan = material.emissive({ color: "#7de2ff", emissive: "#7de2ff", emissiveIntensity: 1.45 });
  const bloomGold = material.emissive({ color: "#ffe18e", emissive: "#ffe18e", emissiveIntensity: 1.35 });
  return [
    primitives.plane({ name: "Aura3D moon garden sky plate", material: skyMat }).position(0, 1.35, -2.15).rotate(-0.04, 0, 0).scale([5.8, 1, 2.5]),
    primitives.sphere({ name: "Aura3D glowing moon portal core", material: moonMat }).position(0, 1.35, -1.95).scale([0.62, 0.62, 0.04]),
    primitives.torus({ name: "Aura3D moon portal rim", material: bloomCyan }).position(0, 1.35, -1.94).scale([0.78, 0.78, 0.026]),
    ...createCartoonCitySilhouette(),
    primitives.plane({ name: "Aura3D moon garden floor", material: gardenMat }).position(0, -0.02, -0.45).scale([4.8, 1, 2.6]),
    primitives.cylinder({ name: "Aura3D curved garden mound", material: gardenMat }).position(0, 0.03, -0.64).scale([1.72, 0.08, 0.74]),
    primitives.box({ name: "Aura3D warm stone path", material: pathMat }).position(0, 0.06, 0.1).scale([1.58, 0.04, 0.28]),
    primitives.cylinder({ name: "Aura3D blue robot contact shadow", material: shadowMat }).position(-0.72, 0.055, -0.34).scale([0.44, 0.012, 0.28]),
    primitives.cylinder({ name: "Aura3D gold robot contact shadow", material: shadowMat }).position(0.72, 0.055, -0.34).scale([0.44, 0.012, 0.28]),
    primitives.box({ name: "Aura3D broom handle", material: bloomCyan }).position(-0.25, 0.28, -0.2).rotate(0, 0, -0.6).scale([0.58, 0.035, 0.035]),
    primitives.box({ name: "Aura3D broom bristles", material: bloomGold }).position(-0.55, 0.14, -0.18).rotate(0, 0, -0.25).scale([0.18, 0.1, 0.04]),
    ...createGlowStones(),
    ...createMoonLilies(),
    lights.ambient({ intensity: 0.2, color: "#b9f2ff" }),
    lights.point({ name: "Aura3D moon garden cyan key", position: [-1.8, 2.4, 1.2], color: "#7de2ff", intensity: 2.8 }),
    lights.point({ name: "Aura3D moon garden warm robot rim", position: [1.8, 1.7, 0.8], color: "#ffe18e", intensity: 2.0 })
  ];
}

function createCartoonCitySilhouette() {
  const mat = material.pbr({ color: "#071825", roughness: 0.88, metallic: 0.04 });
  return [-2.2, -1.45, -0.62, 0.38, 1.25, 2.04].map((x, index) =>
    primitives.box({ name: `Aura3D rounded distant city tower ${index + 1}`, material: mat })
      .position(x, 0.45 + (index % 3) * 0.08, -1.72)
      .scale([0.22 + (index % 2) * 0.08, 0.82 + (index % 3) * 0.18, 0.08])
  );
}

function createGlowStones() {
  const cyan = material.emissive({ color: "#7de2ff", emissive: "#7de2ff", emissiveIntensity: 1.2 });
  const gold = material.emissive({ color: "#ffe18e", emissive: "#ffe18e", emissiveIntensity: 1.1 });
  return [
    primitives.sphere({ name: "Aura3D glow stone left foreground", material: gold }).position(-1.45, 0.1, 0.22).scale([0.1, 0.045, 0.08]),
    primitives.sphere({ name: "Aura3D glow stone center", material: cyan }).position(-0.1, 0.1, 0.0).scale([0.08, 0.035, 0.06]),
    primitives.sphere({ name: "Aura3D glow stone right foreground", material: gold }).position(1.48, 0.1, 0.18).scale([0.1, 0.045, 0.08])
  ];
}

function createMoonLilies() {
  const petal = material.emissive({ color: "#eafcff", emissive: "#d7fbff", emissiveIntensity: 0.48 });
  const stem = material.emissive({ color: "#40ffbf", emissive: "#40ffbf", emissiveIntensity: 0.72 });
  return [
    primitives.cylinder({ name: "Aura3D moon lily stem left", material: stem }).position(-1.72, 0.22, -0.2).scale([0.018, 0.24, 0.018]),
    primitives.sphere({ name: "Aura3D moon lily bloom left", material: petal }).position(-1.72, 0.42, -0.2).scale([0.16, 0.06, 0.12]),
    primitives.cylinder({ name: "Aura3D moon lily stem right", material: stem }).position(1.76, 0.22, -0.26).scale([0.018, 0.24, 0.018]),
    primitives.sphere({ name: "Aura3D moon lily bloom right", material: petal }).position(1.76, 0.42, -0.26).scale([0.16, 0.06, 0.12])
  ];
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
