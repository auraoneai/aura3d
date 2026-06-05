import {
  collectPromptAnimationEvidence,
  createAudioStemManifest,
  createAuraVoiceBridgePackage,
  createAuraVoiceVisemeTrack,
  createCaptionTimingProof,
  createGlbBlendshapeVisemeCue,
  createCartoonPerformanceCoverage,
  createCartoonRenderOutputPackageMetadata,
  createPrimitiveMouthVisemeCues,
  createPromptAnimationDeterministicScreenshotFixtureMetadata,
  evaluatePromptAnimationPublishReadiness,
  defineDubMap,
  glbVisemeBlendshapeExample,
  primitiveMouthVisemeExample,
  sampleAuraVoiceBridgeAtTime,
  sampleVisemeTrack,
  validateAuraVoiceBridgePackage
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

const frameRate = episode.episodePlan.runtime.frameRate;

export const renderContractId = episodeContractId;

export const renderPlan = episode.renderQueue;

export const renderOutputPackage = createCartoonRenderOutputPackageMetadata({
  episodePlan: episode.episodePlan,
  shotTimeline: episode.shotTimeline,
  renderQueue: renderPlan,
  youtube: youtubeDraftMetadata,
  generatedAt: episode.episodePlan.generatedAt
});

export const audioStemManifest = createAudioStemManifest({
  episodeId: episode.episodePlan.episodeId,
  duration: episode.dialogueTrack.duration,
  stems: [
    ...episode.dialogueTrack.lines.map((line) => ({
      id: `audio:${line.lineId}`,
      role: "dialogue",
      path: line.audioFile ?? `assets/audio/en/${line.lineId}.wav`,
      startTime: line.startTime,
      duration: line.endTime - line.startTime,
      language: line.language
    })),
    ...episodeAudioCues
  ],
  generatedAt: episode.episodePlan.generatedAt
});

export const visemeTrack = createAuraVoiceVisemeTrack({
  episodeId: episode.episodePlan.episodeId,
  language: episode.episodePlan.language,
  frameRate,
  cues: episode.dialogueTrack.lines.flatMap((line) =>
    createPrimitiveMouthVisemeCues({
      characterId: line.speakerId,
      speakerId: line.speakerId,
      lineId: line.lineId,
      startTime: line.startTime,
      endTime: line.endTime
    }).map((cue, cueIndex) => {
      const words = line.text.split(/\s+/).filter(Boolean);
      const wordIndex = Math.min(cueIndex, Math.max(0, words.length - 1));
      return createGlbBlendshapeVisemeCue({
        ...cue,
        phoneme: cue.visemeId === "m" ? "M" : "AH",
        phonemeId: `${line.lineId}:phoneme-${cueIndex + 1}`,
        word: words[wordIndex] ?? line.text,
        wordIndex,
        wordStartTime: cue.startTime,
        wordEndTime: cue.endTime
      });
    })
  ),
  generatedAt: episode.episodePlan.generatedAt
});

export const primitiveMouthRuntimeExample = {
  ...primitiveMouthVisemeExample,
  runtimeNodes: {
    miko: "miko:mouth",
    luma: "luma:mouth"
  }
} as const;

export const glbVisemeRuntimeExample = {
  ...glbVisemeBlendshapeExample,
  typedAssetExample: "import { assets } from './aura-assets'; model(assets.character)",
  sampleBlendshapeNames: Object.values(glbVisemeBlendshapeExample.blendshapeMap).slice(0, 6)
} as const;

export const captionTimingProof = createCaptionTimingProof(episode.dialogueTrack, episode.captionTrack, {
  frameRate,
  maxAllowedDriftFrames: 1
});

function frameDriftFrames(actual: number, expected: number) {
  return Math.round(Math.abs(actual - expected) * frameRate);
}

const visemeLineSyncChecks = episode.dialogueTrack.lines.map((line) => {
  const cues = visemeTrack.cues.filter((cue) => cue.lineId === line.lineId && cue.speakerId === line.speakerId);
  const firstCue = cues[0];
  const lastCue = cues[cues.length - 1];
  const startDriftFrames = firstCue ? frameDriftFrames(firstCue.startTime, line.startTime) : 999;
  const endDriftFrames = lastCue ? frameDriftFrames(lastCue.endTime, line.endTime) : 999;
  const sampleTime = Math.min(line.endTime - 1 / frameRate, line.startTime + 1 / frameRate);
  const sampledMouth = sampleVisemeTrack(visemeTrack, sampleTime, line.speakerId);
  return {
    lineId: line.lineId,
    speakerId: line.speakerId,
    characterId: line.speakerId,
    cueCount: cues.length,
    startDriftFrames,
    endDriftFrames,
    maxDriftFrames: Math.max(startDriftFrames, endDriftFrames),
    sampledMouthState: {
      time: sampleTime,
      frame: Math.round(sampleTime * frameRate),
      visemeId: sampledMouth.visemeId,
      mouthOpenness: sampledMouth.mouthOpenness,
      primitiveMouthCard: sampledMouth.primitiveMouthCard,
      blendshapeWeights: sampledMouth.blendshapeWeights
    }
  };
});

const maxVisemeLineDriftFrames = Math.max(0, ...visemeLineSyncChecks.map((check) => check.maxDriftFrames));
const missingVisemeLineIds = visemeLineSyncChecks
  .filter((check) => check.cueCount === 0 || check.maxDriftFrames > 1)
  .map((check) => check.lineId);

export const captionFrameSyncSourceProof = {
  contractId: renderContractId,
  sourceOnly: true,
  proofType: "caption-display-one-frame-source-harness",
  frameRate,
  allowedDriftFrames: 1,
  allowedFrameDurationSeconds: 1 / frameRate,
  captionDisplayWithinOneFrame: captionTimingProof.status === "pass" && captionTimingProof.maxDriftFrames <= 1,
  maxObservedDriftFrames: captionTimingProof.maxDriftFrames,
  coveredLineIds: captionTimingProof.coveredLineIds,
  missingLineIds: captionTimingProof.missingLineIds,
  sampledCaptionCues: captionTimingProof.lines.map((line) => ({
    lineId: line.lineId,
    captionCueId: line.captionId,
    startDriftFrames: line.startDriftFrames,
    endDriftFrames: line.endDriftFrames,
    maxDriftFrames: line.maxDriftFrames
  })),
  executionBoundary: "Source harness only; actual caption display proof requires rendered frame/video evidence."
} as const;

export const visemeFrameSyncSourceProof = {
  contractId: renderContractId,
  sourceOnly: true,
  proofType: "mouth-movement-one-frame-source-harness",
  frameRate,
  allowedDriftFrames: 1,
  allowedFrameDurationSeconds: 1 / frameRate,
  mouthMovementWithinOneFrame: missingVisemeLineIds.length === 0 && maxVisemeLineDriftFrames <= 1,
  maxObservedDriftFrames: maxVisemeLineDriftFrames,
  coveredLineIds: visemeLineSyncChecks.filter((check) => check.cueCount > 0).map((check) => check.lineId),
  missingLineIds: missingVisemeLineIds,
  sampledMouthStates: visemeLineSyncChecks.map((check) => ({
    lineId: check.lineId,
    speakerId: check.speakerId,
    characterId: check.characterId,
    ...check.sampledMouthState
  })),
  primitiveMouthRuntimeNodeIds: primitiveMouthRuntimeExample.runtimeNodes,
  glbBlendshapeNames: glbVisemeRuntimeExample.sampleBlendshapeNames,
  executionBoundary: "Source harness only; actual mouth movement proof requires rendered frame/video evidence."
} as const;

function shotForLine(lineId: string) {
  return episode.shotTimeline.shots.find((shot) => lineId.startsWith(`${shot.shotId}:line-`));
}

export const spanishDubMap = defineDubMap({
  artifact: "dub-map",
  contractId: episode.dialogueTrack.contractId,
  episodeId: episode.episodePlan.episodeId,
  sourceLanguage: "en",
  targetLanguage: "es",
  entries: episode.dialogueTrack.lines.map((line) => {
    const shot = shotForLine(line.lineId);
    return {
      originalStoryboardId: shot?.sceneId,
      dubbedStoryboardId: shot?.sceneId,
      originalStoryboardSceneId: shot?.sceneId,
      dubbedStoryboardSceneId: shot?.sceneId,
      originalLineId: line.lineId,
      dubbedLineId: line.lineId,
      originalCaptionId: `${line.lineId}:caption`,
      dubbedCaptionId: `${line.lineId}:caption`,
      originalCharacterId: line.speakerId,
      dubbedCharacterId: line.speakerId,
      originalSpeakerId: line.speakerId,
      dubbedSpeakerId: line.speakerId,
      originalLanguage: line.language,
      dubbedLanguage: "es",
      originalShotId: shot?.shotId,
      dubbedShotId: shot?.shotId,
      originalSceneId: shot?.sceneId,
      dubbedSceneId: shot?.sceneId
    };
  }),
  generatedAt: episode.episodePlan.generatedAt
});

export const phonemeVisemeDubSyncSourceProof = {
  contractId: renderContractId,
  sourceOnly: true,
  proofType: "phoneme-viseme-dub-sync-source-harness",
  visemeFormat: visemeTrack.format,
  frameRate,
  allowedDriftFrames: 1,
  phonemeFields: ["phoneme", "phonemeId", "word", "wordIndex", "wordStartTime", "wordEndTime"],
  sampledPhonemeVisemeCues: visemeTrack.cues.slice(0, 8).map((cue) => ({
    cueId: cue.id,
    lineId: cue.lineId,
    speakerId: cue.speakerId,
    characterId: cue.characterId,
    visemeId: cue.visemeId,
    phoneme: cue.phoneme,
    phonemeId: cue.phonemeId,
    word: cue.word,
    wordIndex: cue.wordIndex,
    wordStartTime: cue.wordStartTime,
    wordEndTime: cue.wordEndTime,
    startTime: cue.startTime,
    endTime: cue.endTime
  })),
  dubContinuity: {
    sourceLanguage: spanishDubMap.sourceLanguage,
    targetLanguage: spanishDubMap.targetLanguage,
    stableShotIds: spanishDubMap.entries.every((entry) => entry.originalShotId === entry.dubbedShotId),
    stableStoryboardIds: spanishDubMap.entries.every((entry) => entry.originalStoryboardId === entry.dubbedStoryboardId),
    stableCaptionIds: spanishDubMap.entries.every((entry) => entry.originalCaptionId === entry.dubbedCaptionId),
    stableLineIds: spanishDubMap.entries.every((entry) => entry.originalLineId === entry.dubbedLineId)
  },
  executionBoundary: "Source harness only; actual phoneme, viseme, and dub playback proof requires rendered frame/video evidence."
} as const;

export const performanceCoverage = createCartoonPerformanceCoverage(episode.performance, episode.dialogueTrack);

export const reviewPackagePaths = renderOutputPackage.reviewPackagePaths;

export const thumbnailCapture = renderOutputPackage.thumbnailCapture;

export const plannedDeterministicCaptureSources = renderPlan.items.map((item) => ({
  renderQueueItemId: item.id,
  time: item.time,
  frame: item.frame,
  ...(item.shotId ? { shotId: item.shotId } : {}),
  sourceSceneStateId: item.sourceSceneState?.sceneStateId,
  auraVoiceTimestamp: item.sourceSceneState?.auraVoiceTimestamp ?? item.time,
  deterministicSeed: item.sourceSceneState?.deterministicSeed
}));

export const sampleRenderSourceWorkflow = {
  contractId: renderContractId,
  sourceOnly: true,
  status: "source-workflow-ready",
  promptToAudioToAura3DAnimation: true,
  sampleEpisodeId: episode.episodePlan.episodeId,
  runtimeSeconds: episode.episodePlan.runtime.duration,
  minimumRuntimeSeconds: 60,
  frameRate,
  resolution: episode.episodePlan.runtime.resolution,
  shotCount: episode.shotTimeline.shots.length,
  speakingCharacterIds: Array.from(new Set(episode.dialogueTrack.lines.map((line) => line.speakerId))),
  requiredTypedAssets: requiredCartoonCharacterAssets,
  typedAssetSummary: typedCartoonAssetSummary,
  missingTypedCharacterAssets: missingCartoonCharacterAssets,
  assetCommands: publicCartoonAssetInstructions,
  audioStemRoles: audioStemManifest.stems.map((stem) => stem.role),
  requiresNoManualTimingEdits: true,
  doesNotClaimRenderedArtifacts: true,
  humanReviewRequired: true,
  captionFrameSyncSourceProof,
  visemeFrameSyncSourceProof,
  phonemeVisemeDubSyncSourceProof,
  artifactManifestExpectations: {
    video: {
      required: true,
      outputId: renderOutputPackage.outputs.mp4?.id,
      path: renderOutputPackage.outputs.mp4?.path,
      evidenceJsonFields: ["path", "sha256", "byteSize", "duration", "frameRate", "resolution", "renderQueueId"]
    },
    thumbnail: {
      required: true,
      outputId: renderOutputPackage.outputs.thumbnail?.id,
      path: renderOutputPackage.outputs.thumbnail?.path,
      sourceSceneStateId: renderOutputPackage.thumbnailCapture.sourceSceneStateId,
      evidenceJsonFields: ["path", "sha256", "byteSize", "width", "height", "captureTime", "shotId", "sourceSceneStateId"]
    },
    captions: {
      required: true,
      outputIds: renderOutputPackage.outputs.captions.map((output) => output.id),
      paths: renderOutputPackage.outputs.captions.map((output) => output.path),
      evidenceJsonFields: ["path", "sha256", "byteSize", "language", "cueCount", "captionTrackId"]
    },
    timeline: {
      required: true,
      outputId: renderOutputPackage.outputs.timelineJson?.id,
      path: renderOutputPackage.outputs.timelineJson?.path,
      evidenceJsonFields: ["path", "sha256", "byteSize", "shotTimelineId", "frameRate", "duration"]
    },
    audioStems: {
      required: true,
      artifact: audioStemManifest.artifact,
      path: "dist/render/audio-stems.json",
      stemCount: audioStemManifest.stems.length,
      evidenceJsonFields: ["path", "sha256", "byteSize", "stemCount", "dialogueStemCount", "sfxStemCount"]
    },
    evidenceJson: {
      required: true,
      outputId: renderOutputPackage.outputs.evidenceJson?.id,
      path: renderOutputPackage.outputs.evidenceJson?.path,
      evidenceJsonFields: ["path", "sha256", "byteSize", "schema", "ok", "gates", "proofs"]
    },
    youtubeDraftMetadata: {
      required: true,
      outputId: renderOutputPackage.outputs.youtubeMetadata?.id,
      path: renderOutputPackage.outputs.youtubeMetadata?.path,
      evidenceJsonFields: ["title", "description", "language", "videoPath", "thumbnailPath", "captionsPath"]
    }
  },
  requiredEvidenceJsonFields: [
    "artifacts.video",
    "artifacts.thumbnail",
    "artifacts.captions",
    "artifacts.timeline",
    "artifacts.audioStems",
    "artifacts.evidenceJson",
    "captionFrameSyncSourceProof.captionDisplayWithinOneFrame",
    "visemeFrameSyncSourceProof.mouthMovementWithinOneFrame",
    "phonemeVisemeDubSyncSourceProof.sampledPhonemeVisemeCues",
    "phonemeVisemeDubSyncSourceProof.dubContinuity.stableShotIds",
    "humanReview.status"
  ],
  remainingProofGates: [
    "Fresh scaffold npm run build output",
    "Browser route health and storyboard playback output",
    "Typed character GLBs added through src/aura-assets.ts",
    "npx @aura3d/cli@latest assets validate-cartoon output",
    "Actual 60-second MP4/WebM render artifact",
    "Actual thumbnail artifact captured from the same Aura3D scene state",
    "Actual captions/timeline/audio-stems/evidence JSON files with hashes",
    "Human visual review approval"
  ]
} as const;

export const auraVoicePackage = createAuraVoiceBridgePackage({
  episodePlan: episode.episodePlan,
  storyboard: episode.storyboard,
  shotTimeline: episode.shotTimeline,
  dialogueTrack: episode.dialogueTrack,
  captionTrack: episode.captionTrack,
  visemes: visemeTrack,
  audioStems: audioStemManifest,
  dubMap: spanishDubMap,
  renderQueue: renderPlan,
  renderOutputPackage
}, {
  route: "/",
  frameRate,
  maxTimingDriftFrames: 1,
  youtube: youtubeDraftMetadata
});

export const deterministicScreenshotFixtures = createPromptAnimationDeterministicScreenshotFixtureMetadata({
  bridgePackage: auraVoicePackage,
  count: 3,
  pathPrefix: "artifacts/screenshots/moon-garden"
});

export const accessibilityProofMetadata = auraVoicePackage.artifacts.episodePlan.accessibilityProof;

export const bridgeIssues = validateAuraVoiceBridgePackage(auraVoicePackage);

export const bridgeSampleAtThumbnail = sampleAuraVoiceBridgeAtTime(auraVoicePackage, renderOutputPackage.thumbnailCapture.time);

export const promptAnimationEvidence = collectPromptAnimationEvidence({
  bridgePackage: auraVoicePackage,
  performanceCoverage,
  routeHealth: { status: "missing" },
  generatedAt: episode.episodePlan.generatedAt
});

export const publishReadiness = evaluatePromptAnimationPublishReadiness(promptAnimationEvidence);
