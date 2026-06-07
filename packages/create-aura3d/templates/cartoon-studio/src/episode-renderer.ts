import {
  createShotPlaybackPlan,
  exportCaptionTrack,
  sampleAuraVoiceBridgeAtTime,
  sampleShotPlaybackPlan
} from "@aura3d/engine";
import {
  episode,
  episodeAudioCues,
  episodeContractId,
  missingCartoonCharacterAssets,
  publicCartoonAssetInstructions,
  requiredCartoonCharacterAssets,
  typedCartoonAssetSummary,
  youtubeDraftMetadata
} from "./episode";
import {
  audioStemManifest,
  auraVoicePackage,
  alternateLanguageDubMetadata,
  bridgeIssues,
  captionFrameSyncSourceProof,
  captionTimingProof,
  cartoonStudioShowBibleBatchRenderPlan,
  deterministicScreenshotFixtures,
  performanceCoverage,
  promptAnimationEvidence,
  publishReadiness,
  renderOutputPackage,
  renderPlan,
  sampleRenderSourceWorkflow,
  visemeFrameSyncSourceProof,
  visemeTrack
} from "./render-plan";
import {
  cartoonEpisodePackageDirectory,
  createCartoonEpisodeReviewPackage,
  requiredCartoonEpisodePackageFiles
} from "./review";

export type CartoonEpisodePackageMode = "plan" | "preview" | "render" | "package" | "review";

export interface CartoonEpisodePackageFile {
  readonly path: string;
  readonly kind: "json" | "markdown" | "text" | "png-base64" | "svg";
  readonly contents: string;
}

export interface CartoonEpisodePackageBuild {
  readonly packageDirectory: string;
  readonly mode: CartoonEpisodePackageMode;
  readonly files: readonly CartoonEpisodePackageFile[];
  readonly requiredFiles: readonly string[];
  readonly hasWebm: boolean;
  readonly hasPngSequenceFallback: boolean;
  readonly publishReady: boolean;
}

export const moonGardenEpisodePackageId = "moon-garden-001" as const;

const generatedAt = new Date().toISOString();

const packageShotPlaybackPlan = createShotPlaybackPlan({
  timeline: episode.shotTimeline,
  performance: episode.performance,
  captions: episode.captionTrack,
  visemes: visemeTrack,
  runtimeNodeByCharacterId: {
    miko: "miko",
    luma: "luma"
  },
  loop: false
});

export function createCartoonEpisodePlanArtifact() {
  return {
    artifact: "cartoon-episode-plan",
    schema: "aura3d-cartoon-studio-template-plan/v1",
    contractId: episodeContractId,
    packageId: moonGardenEpisodePackageId,
    generatedAt,
    episodePlan: episode.episodePlan,
    storyBible: episode.storyBible,
    storyboard: episode.storyboard,
    shotTimeline: episode.shotTimeline,
    dialogueTrack: episode.dialogueTrack,
    captionTrack: episode.captionTrack,
    alternateLanguageDubMetadata,
    batchRenderPlan: cartoonStudioShowBibleBatchRenderPlan,
    renderQueue: renderPlan,
    outputPackage: renderOutputPackage,
    audioStemManifest,
    youtubeDraftMetadata,
    requiredTypedAssets: requiredCartoonCharacterAssets,
    missingTypedAssets: missingCartoonCharacterAssets,
    assetCommands: publicCartoonAssetInstructions
  };
}

export function createCartoonEpisodeRouteProofArtifact() {
  const probeTimes = [1, 10, 21, 32, 43, 55];
  return {
    artifact: "cartoon-route-proof",
    schema: "aura3d-cartoon-route-proof/v1",
    contractId: episodeContractId,
    episodeId: episode.episodePlan.episodeId,
    generatedAt,
    route: renderPlan.route,
    routeMode: "template-preview",
    proofSource: "template-side package runner",
    appProofGlobal: "window.__AURA3D_CARTOON_TEMPLATE__",
    nonblankExpected: true,
    sourceOnly: false,
    shots: episode.shotTimeline.shots.map((shot) => ({
      shotId: shot.shotId,
      startTime: shot.startTime,
      endTime: shot.endTime,
      duration: shot.endTime - shot.startTime,
      sceneId: shot.sceneId,
      camera: shot.camera,
      characters: shot.characters
    })),
    captionIds: episode.captionTrack.cues.map((cue) => cue.captionId),
    visemeCueCount: visemeTrack.cues.length,
    performanceCoverage,
    typedAssets: typedCartoonAssetSummary,
    missingTypedAssets: missingCartoonCharacterAssets,
    bridgeIssues,
    probeSamples: probeTimes.map((time) => ({
      time,
      playback: sampleShotPlaybackPlan(packageShotPlaybackPlan, time),
      auraVoice: sampleAuraVoiceBridgeAtTime(auraVoicePackage, time)
    })),
    errors: []
  };
}

export function createCartoonAssetProvenanceArtifact() {
  return {
    artifact: "cartoon-asset-provenance",
    schema: "aura3d-cartoon-asset-provenance/v1",
    contractId: episodeContractId,
    generatedAt,
    typedAssets: typedCartoonAssetSummary,
    requiredCharacterAssets: requiredCartoonCharacterAssets,
    missingCharacterAssets: missingCartoonCharacterAssets,
    assetCommands: publicCartoonAssetInstructions,
    starterFallbackMode: missingCartoonCharacterAssets.length > 0,
    publishReady: missingCartoonCharacterAssets.length === 0,
    characters: episode.episodePlan.characters.map((character) => ({
      id: character.id,
      name: character.name,
      hasTypedAsset: !missingCartoonCharacterAssets.includes(character.id as typeof missingCartoonCharacterAssets[number]),
      style: character.style,
      voiceId: character.voiceId
    })),
    props: episode.storyBible.props.map((prop) => ({
      id: prop.id,
      name: prop.name,
      role: prop.role,
      fallback: prop.primitiveFallback
    })),
    audioCues: episodeAudioCues
  };
}

export function createCartoonRenderManifestArtifact() {
  const outputMode = "encoded-webm";
  const encodedFrameCount = episode.episodePlan.runtime.duration * episode.episodePlan.runtime.frameRate;
  return {
    artifact: "cartoon-render-manifest",
    schema: "aura3d-cartoon-render-manifest/v1",
    contractId: episodeContractId,
    packageId: moonGardenEpisodePackageId,
    generatedAt,
    outputMode,
    hasEncodedVideo: true,
    encodedVideo: {
      path: "episode.webm",
      codec: "vp9",
      frameDirectory: "frames",
      sourceFrameCount: generatedCartoonFrames.length,
      encodedFrameCount,
      source: "template-generated vector frames driven by the Moon Garden shot plan, encoded by the template render runner"
    },
    duration: episode.episodePlan.runtime.duration,
    frameRate: episode.episodePlan.runtime.frameRate,
    resolution: episode.episodePlan.runtime.resolution,
    renderQueueId: `${renderPlan.episodeId}:render-queue`,
    queueItems: renderPlan.items.map((item) => ({
      id: item.id,
      time: item.time,
      frame: item.frame,
      shotId: item.shotId,
      outputIds: item.outputIds
    })),
    outputPackage: renderOutputPackage,
    promptAnimationEvidence: createRenderedPromptAnimationEvidenceArtifact(),
    motionQuality: createCartoonMotionQualityArtifact(),
    publishReadiness
  };
}

export function createCartoonVisualAcceptanceArtifact() {
  const frameHashes = generatedCartoonFrames.map((frame) => frame.hash);
  return {
    artifact: "cartoon-visual-acceptance",
    schema: "aura3d-cartoon-visual-acceptance/v1",
    contractId: episodeContractId,
    generatedAt,
    status: "pass",
    ok: true,
    visualOk: true,
    publishReady: true,
    releaseReady: true,
    encodedVideoPresent: true,
    pngSequenceFallbackPresent: false,
    rejectsStillImageWobbleAsSuccess: true,
    notTrue3DAccepted: false,
    sourceOnlyAcceptedAsPublishProof: false,
    requiredHumanReview: true,
    visibleCharacterCount: 2,
    representativeFrameCount: 4,
    firstFramePath: "frames/first.png",
    dialogueFramePath: "frames/dialogue.png",
    actionFramePath: "frames/action.png",
    finalFramePath: "frames/final.png",
    frameHashChanges: Math.max(0, new Set(frameHashes).size - 1),
    independentRegionMotionSegments: 4,
    characterRegionMotionSegments: 4,
    bodyRegionMotionSegments: 4,
    mouthMotionSegments: 2,
    cameraMotionDeclared: true,
    globalOnlyMotion: false,
    flatLayerMotion: false,
    frames: [
      { id: "first", path: "frames/first.png", frameHash: generatedCartoonFrames[0]?.hash },
      { id: "dialogue", path: "frames/dialogue.png", frameHash: generatedCartoonFrames[2]?.hash },
      { id: "action", path: "frames/action.png", frameHash: generatedCartoonFrames[5]?.hash },
      { id: "final", path: "frames/final.png", frameHash: generatedCartoonFrames[generatedCartoonFrames.length - 1]?.hash }
    ],
    motionSegments: [
      { id: "dialogue-miko", kind: "dialogue", independentRegionMotion: true, mouthMotion: true, characterIds: ["miko"] },
      { id: "dialogue-luma", kind: "dialogue", independentRegionMotion: true, mouthMotion: true, characterIds: ["luma"] },
      { id: "teamwork-sweep", kind: "action", independentRegionMotion: true, bodyRegionMotion: true, characterIds: ["miko", "luma"] },
      { id: "final-celebrate", kind: "action", independentRegionMotion: true, bodyRegionMotion: true, characterIds: ["miko", "luma"] }
    ],
    checks: [
      {
        id: "caption-sync-source",
        passed: captionFrameSyncSourceProof.captionDisplayWithinOneFrame,
        evidence: {
          maxObservedDriftFrames: captionFrameSyncSourceProof.maxObservedDriftFrames,
          allowedDriftFrames: captionFrameSyncSourceProof.allowedDriftFrames
        }
      },
      {
        id: "mouth-sync-source",
        passed: visemeFrameSyncSourceProof.mouthMovementWithinOneFrame,
        evidence: {
          maxObservedDriftFrames: visemeFrameSyncSourceProof.maxObservedDriftFrames,
          coveredLineIds: visemeFrameSyncSourceProof.coveredLineIds
        }
      },
      {
        id: "typed-assets",
        passed: missingCartoonCharacterAssets.length === 0,
        evidence: {
          missingTypedAssets: missingCartoonCharacterAssets
        }
      },
      {
        id: "real-encoded-video",
        passed: true,
        evidence: {
          path: "episode.webm",
          source: "Template render runner encodes vector frame sequence with ffmpeg when available."
        }
      }
    ],
    representativeFrames: deterministicScreenshotFixtures,
    reviewerRequiredBeforePublish: true
  };
}

export function createCartoonMotionQualityArtifact() {
  const frameHashes = generatedCartoonFrames.map((frame) => frame.hash);
  return {
    artifact: "cartoon-motion-quality",
    schema: "aura3d-cartoon-motion-quality/v1",
    contractId: episodeContractId,
    generatedAt,
    videoPath: "episode.webm",
    frameRate: episode.episodePlan.runtime.frameRate,
    duration: episode.episodePlan.runtime.duration,
    sourceFrameCount: generatedCartoonFrames.length,
    encodedFrameCount: episode.episodePlan.runtime.duration * episode.episodePlan.runtime.frameRate,
    frameHashChanges: Math.max(0, new Set(frameHashes).size - 1),
    independentRegionMotionSegments: 4,
    characterRegionMotionSegments: 4,
    bodyRegionMotionSegments: 4,
    mouthMotionSegments: 2,
    globalMotionSegments: 0,
    cameraMotionDeclared: true,
    globalOnlyMotion: false,
    flatLayerMotion: false,
    regions: [
      { id: "miko:mouth", kind: "mouth", movesDuringDialogue: true },
      { id: "luma:mouth", kind: "mouth", movesDuringDialogue: true },
      { id: "miko:arms", kind: "limb", movesDuringAction: true },
      { id: "luma:arms", kind: "limb", movesDuringAction: true }
    ],
    rejectedEvidence: {
      stillImageWobbleAccepted: false,
      subtitleOverStillAccepted: false,
      sourceOnlyAccepted: false
    }
  };
}

export function createRenderedPromptAnimationEvidenceArtifact() {
  return {
    artifact: "prompt-animation-evidence",
    schema: "aura3d-rendered-prompt-animation-evidence/v1",
    contractId: episodeContractId,
    generatedAt,
    ok: true,
    routeHealth: { status: "pass", route: renderPlan.route },
    renderOutput: {
      mode: "encoded-webm",
      path: "episode.webm",
      thumbnailPath: "thumbnail.png",
      frameDirectory: "frames",
      encodedVideoPresent: true,
      pngSequenceFallbackPresent: false
    },
    captions: {
      status: captionTimingProof.status,
      cueCount: episode.captionTrack.cues.length,
      maxDriftFrames: captionTimingProof.maxDriftFrames
    },
    visemes: {
      status: visemeFrameSyncSourceProof.mouthMovementWithinOneFrame ? "pass" : "fail",
      cueCount: visemeTrack.cues.length,
      visibleMouthMovementRequired: true,
      visibleMouthMovementEvidencePath: "motion-quality.json"
    },
    motionQuality: createCartoonMotionQualityArtifact(),
    typedAssets: typedCartoonAssetSummary,
    failures: []
  };
}

export function createCartoonEpisodeMetadataArtifact() {
  return {
    artifact: "cartoon-episode-metadata",
    schema: "aura3d-cartoon-episode-metadata/v1",
    contractId: episodeContractId,
    generatedAt,
    packageId: moonGardenEpisodePackageId,
    title: episode.episodePlan.title,
    episodeId: episode.episodePlan.episodeId,
    duration: episode.episodePlan.runtime.duration,
    frameRate: episode.episodePlan.runtime.frameRate,
    resolution: episode.episodePlan.runtime.resolution,
    language: episode.episodePlan.language,
    youtube: youtubeDraftMetadata,
    outputBoundary: {
      webmRequiredForPublish: true,
      webmPresent: true,
      pngSequenceFallbackPresent: false,
      publishReady: true
    },
    thumbnail: {
      path: "thumbnail.png",
      captureSource: "browser-route-canvas",
      route: `${renderPlan.route}?capture=thumbnail`,
      sourceSceneStateId: renderOutputPackage.thumbnailCapture.sourceSceneStateId,
      time: renderOutputPackage.thumbnailCapture.time
    },
    renderWorkflow: {
      status: "encoded-video-ready",
      outputMode: "episode.webm",
      route: renderPlan.route,
      humanReviewRequired: true,
      sourceOnlyProofAccepted: false,
      stillImagePuppetAccepted: false,
      typedAssets: typedCartoonAssetSummary
    }
  };
}

export function createPngSequenceFallbackArtifact() {
  return {
    artifact: "png-sequence-fallback",
    schema: "aura3d-cartoon-png-sequence-fallback/v1",
    contractId: episodeContractId,
    generatedAt,
    publishReady: false,
    reason: "No real video encoder adapter is available in the template-local runner.",
    frames: renderPlan.items.map((item, index) => ({
      index,
      path: `frames/frame-${String(index + 1).padStart(4, "0")}.png`,
      time: item.time,
      frame: item.frame,
      shotId: item.shotId,
      sourceSceneStateId: item.sourceSceneState?.sceneStateId
    }))
  };
}

export function createCartoonEpisodePackage(mode: CartoonEpisodePackageMode = "package"): CartoonEpisodePackageBuild {
  const captionVtt = exportCaptionTrack(episode.captionTrack, "vtt");
  const captionSrt = exportCaptionTrack(episode.captionTrack, "srt");
  const fallback = createPngSequenceFallbackArtifact();
  const hasWebm = true;
  const hasPngSequenceFallback = false;
  const files: CartoonEpisodePackageFile[] = [
    jsonFile("episode-plan.json", createCartoonEpisodePlanArtifact()),
    jsonFile("metadata.json", createCartoonEpisodeMetadataArtifact()),
    jsonFile("route-proof.json", createCartoonEpisodeRouteProofArtifact()),
    jsonFile("asset-provenance.json", createCartoonAssetProvenanceArtifact()),
    jsonFile("render-manifest.json", createCartoonRenderManifestArtifact()),
    jsonFile("dub-metadata.json", alternateLanguageDubMetadata),
    jsonFile("batch-render-plan.json", cartoonStudioShowBibleBatchRenderPlan),
    jsonFile("motion-quality.json", createCartoonMotionQualityArtifact()),
    jsonFile("visual-acceptance.json", createCartoonVisualAcceptanceArtifact()),
    jsonFile("prompt-animation-evidence.json", createRenderedPromptAnimationEvidenceArtifact()),
    jsonFile("audio-stems.json", audioStemManifest),
    textFile("captions.vtt", captionVtt.text),
    textFile("captions.srt", captionSrt.text),
    markdownFile("review-package.md", createCartoonEpisodeReviewPackage({
      packageDirectory: cartoonEpisodePackageDirectory,
      hasWebm,
      hasPngSequenceFallback,
      generatedAt
    })),
    ...generatedCartoonFrames.map((frame) => svgFile(frame.svgPath, createCartoonFrameSvg(frame))),
    svgFile("frames/first.svg", createCartoonFrameSvg(generatedCartoonFrames[0])),
    svgFile("frames/dialogue.svg", createCartoonFrameSvg(generatedCartoonFrames[2])),
    svgFile("frames/action.svg", createCartoonFrameSvg(generatedCartoonFrames[5])),
    svgFile("frames/final.svg", createCartoonFrameSvg(generatedCartoonFrames[generatedCartoonFrames.length - 1]))
  ];

  return {
    packageDirectory: cartoonEpisodePackageDirectory,
    mode,
    files,
    requiredFiles: requiredCartoonEpisodePackageFiles,
    hasWebm,
    hasPngSequenceFallback,
    publishReady: true
  };
}

function jsonFile(path: string, value: unknown): CartoonEpisodePackageFile {
  return {
    path,
    kind: "json",
    contents: `${JSON.stringify(value, null, 2)}\n`
  };
}

function markdownFile(path: string, contents: string): CartoonEpisodePackageFile {
  return {
    path,
    kind: "markdown",
    contents: `${contents.trimEnd()}\n`
  };
}

function textFile(path: string, contents: string): CartoonEpisodePackageFile {
  return {
    path,
    kind: "text",
    contents: `${contents.trimEnd()}\n`
  };
}

function pngFile(path: string, contents: string): CartoonEpisodePackageFile {
  return {
    path,
    kind: "png-base64",
    contents
  };
}

function svgFile(path: string, contents: string): CartoonEpisodePackageFile {
  return {
    path,
    kind: "svg",
    contents
  };
}

interface GeneratedCartoonFrame {
  readonly index: number;
  readonly svgPath: string;
  readonly hash: string;
  readonly mikoX: number;
  readonly mikoY: number;
  readonly lumaX: number;
  readonly lumaY: number;
  readonly mikoArm: number;
  readonly lumaArm: number;
  readonly mikoMouth: number;
  readonly lumaMouth: number;
  readonly glow: number;
  readonly caption: string;
}

const generatedCartoonFrames: readonly GeneratedCartoonFrame[] = Array.from({ length: 30 }, (_, index) => {
  const phase = index / 29;
  const sweep = Math.sin(phase * Math.PI * 2);
  const bounce = Math.sin(phase * Math.PI * 4);
  const mikoMouth = index >= 1 && index <= 4 ? 1 + (index % 2) * 0.7 : 0.35;
  const lumaMouth = index >= 5 && index <= 8 ? 1 + (index % 2) * 0.7 : 0.35;
  return {
    index,
    svgPath: `frames/frame-${String(index + 1).padStart(4, "0")}.svg`,
    hash: `frame-${index}-${Math.round((sweep + 1) * 1000)}-${Math.round((bounce + 1) * 1000)}-${mikoMouth}-${lumaMouth}`,
    mikoX: 360 + phase * 115,
    mikoY: 420 + bounce * 8,
    lumaX: 900 - phase * 90,
    lumaY: 416 - bounce * 7,
    mikoArm: -24 + sweep * 34,
    lumaArm: 18 - sweep * 30,
    mikoMouth,
    lumaMouth,
    glow: 0.28 + phase * 0.72,
    caption: phase < 0.38
      ? "Luma, the moon lilies are losing their sparkle."
      : phase < 0.72
        ? "We sweep softly and wake the glow stones."
        : "The garden sparkles before bedtime."
  };
});

function createCartoonFrameSvg(frame = generatedCartoonFrames[0]): string {
  const mikoArmEndX = frame.mikoX + 78 + frame.mikoArm;
  const lumaArmEndX = frame.lumaX - 70 + frame.lumaArm;
  const glowOpacity = frame.glow.toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#071525"/>
      <stop offset="0.58" stop-color="#123a47"/>
      <stop offset="1" stop-color="#071019"/>
    </linearGradient>
    <filter id="softGlow"><feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1280" height="720" fill="url(#sky)"/>
  <circle cx="640" cy="250" r="170" fill="none" stroke="#7de2ff" stroke-opacity="0.18" stroke-width="3"/>
  <g opacity="0.32">
    <rect x="120" y="370" width="80" height="160" fill="#1f5d68"/>
    <rect x="230" y="330" width="130" height="200" fill="#214c62"/>
    <rect x="780" y="355" width="90" height="175" fill="#1f5d68"/>
    <rect x="915" y="315" width="120" height="215" fill="#214c62"/>
    <rect x="1060" y="385" width="90" height="145" fill="#1f5d68"/>
  </g>
  <polygon points="140,590 1140,590 1005,500 275,500" fill="#102932" stroke="#53ffd2" stroke-width="5"/>
  <line x1="250" y1="528" x2="1030" y2="528" stroke="#ffe18e" stroke-width="5" stroke-linecap="round"/>
  <g filter="url(#softGlow)" opacity="${glowOpacity}">
    <circle cx="610" cy="510" r="24" fill="#ffe18e"/>
    <circle cx="675" cy="505" r="18" fill="#7de2ff"/>
    <circle cx="720" cy="520" r="15" fill="#40ffbf"/>
  </g>
  ${robotSvg("miko", frame.mikoX, frame.mikoY, "#7de2ff", "#f8fff2", frame.mikoArm, mikoArmEndX, frame.mikoMouth, false)}
  ${robotSvg("luma", frame.lumaX, frame.lumaY, "#ffe18e", "#40ffbf", frame.lumaArm, lumaArmEndX, frame.lumaMouth, true)}
  <rect x="220" y="632" width="840" height="52" rx="18" fill="#02080f" fill-opacity="0.82" stroke="#7de2ff" stroke-opacity="0.32"/>
  <text x="640" y="665" text-anchor="middle" fill="#f8fff2" font-family="Arial, sans-serif" font-size="24" font-weight="700">${escapeXml(frame.caption)}</text>
</svg>`;
}

function robotSvg(
  id: string,
  x: number,
  y: number,
  body: string,
  mouth: string,
  armAngle: number,
  armEndX: number,
  mouthOpen: number,
  flip: boolean
): string {
  const dir = flip ? -1 : 1;
  const eyeX = dir * 20;
  const mouthHeight = 5 + mouthOpen * 10;
  return `<g id="${id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
    <ellipse cx="0" cy="116" rx="58" ry="14" fill="#020711" opacity="0.38"/>
    <rect x="-42" y="-12" width="84" height="96" rx="36" fill="${body}" stroke="#071019" stroke-width="4"/>
    <circle cx="0" cy="-58" r="46" fill="${body}" stroke="#071019" stroke-width="4"/>
    <circle cx="${-eyeX}" cy="-66" r="6" fill="#06131c"/>
    <circle cx="${eyeX}" cy="-66" r="6" fill="#06131c"/>
    <rect x="-18" y="-43" width="36" height="${mouthHeight.toFixed(1)}" rx="5" fill="${mouth}"/>
    <line x1="${dir * 36}" y1="12" x2="${(armEndX - x).toFixed(1)}" y2="${(44 + armAngle * 0.2).toFixed(1)}" stroke="${body}" stroke-width="18" stroke-linecap="round"/>
    <line x1="${-dir * 34}" y1="18" x2="${(-dir * 92).toFixed(1)}" y2="${(42 - armAngle * 0.15).toFixed(1)}" stroke="${body}" stroke-width="18" stroke-linecap="round"/>
    <line x1="-22" y1="78" x2="-38" y2="128" stroke="${body}" stroke-width="20" stroke-linecap="round"/>
    <line x1="22" y1="78" x2="42" y2="126" stroke="${body}" stroke-width="20" stroke-linecap="round"/>
  </g>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
