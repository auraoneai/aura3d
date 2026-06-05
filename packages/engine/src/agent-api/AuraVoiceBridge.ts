import {
  createPromptAnimationIssue,
  promptAnimationDriftFrames,
  promptAnimationFrameAtTime,
  validatePromptAnimationArtifactContract,
  validatePromptAnimationStableIds,
  type PromptAnimationArtifactBase,
  type PromptAnimationArtifactKind,
  type PromptAnimationEpisodePlan,
  type PromptAnimationFrameRate,
  type PromptAnimationId,
  type PromptAnimationSeconds,
  type PromptAnimationStoryboard,
  type PromptAnimationValidationIssue,
  type PromptAnimationYouTubeDraftMetadata
} from "./PromptAnimationContract.js";
import {
  createDialogueTimingReport,
  dialogueLineAtTime,
  validateAudioStemManifest,
  type AudioStemManifestArtifact,
  type CaptionTrackArtifact,
  type DialogueLine,
  type DialogueTrackArtifact,
  type DubMapArtifact
} from "./DialoguePerformance.js";
import {
  createCartoonRenderQueue,
  createCartoonRenderOutputPackageMetadata,
  validateCartoonRenderQueue,
  validateCartoonRenderOutputPackageMetadata,
  type CartoonRenderOutput,
  type CartoonRenderOutputPackageMetadata,
  type CartoonRenderQueueArtifact,
  type CartoonViewport
} from "./CartoonRenderQueue.js";
import { getShotAtTime, validateShotTimeline, type ShotTimelineArtifact, type ShotTimelineShot } from "./ShotTimeline.js";
import {
  sampleVisemeTrack,
  validateVisemeTrack,
  type AuraVoiceVisemeTrack,
  type VisemeSample
} from "./VisemeController.js";

export interface AuraVoiceBridgeArtifacts {
  readonly episodePlan: PromptAnimationEpisodePlan;
  readonly storyboard?: PromptAnimationStoryboard | undefined;
  readonly shotTimeline: ShotTimelineArtifact;
  readonly dialogueTrack: DialogueTrackArtifact;
  readonly captionTrack?: CaptionTrackArtifact | undefined;
  readonly visemes?: AuraVoiceVisemeTrack | undefined;
  readonly audioStems?: AudioStemManifestArtifact | undefined;
  readonly dubMap?: DubMapArtifact | undefined;
  readonly renderQueue?: CartoonRenderQueueArtifact | undefined;
  readonly renderOutputPackage?: CartoonRenderOutputPackageMetadata | undefined;
}

export interface AuraVoiceBridgeOptions {
  readonly frameRate?: PromptAnimationFrameRate | undefined;
  readonly maxTimingDriftFrames?: number | undefined;
  readonly route?: string | undefined;
  readonly viewport?: CartoonViewport | undefined;
  readonly outputs?: readonly CartoonRenderOutput[] | undefined;
  readonly youtube?: PromptAnimationYouTubeDraftMetadata | undefined;
  readonly renderPackageId?: PromptAnimationId | undefined;
}

export interface AuraVoiceMasterClock {
  readonly source: "dialogue-track" | "audio-stems" | "shot-timeline";
  readonly frameRate: PromptAnimationFrameRate;
  readonly frameDuration: PromptAnimationSeconds;
  readonly duration: PromptAnimationSeconds;
  readonly maxTimingDriftFrames: number;
}

export interface AuraVoiceBridgePackage {
  readonly kind: "auravoice-bridge-package";
  readonly episodeId: PromptAnimationId;
  readonly masterClock: AuraVoiceMasterClock;
  readonly artifacts: AuraVoiceBridgeArtifacts;
  readonly renderQueue: CartoonRenderQueueArtifact;
  readonly renderOutputPackage: CartoonRenderOutputPackageMetadata;
  readonly issues: readonly PromptAnimationValidationIssue[];
  readonly publishReady: boolean;
}

export interface AuraVoicePlaybackSample {
  readonly time: PromptAnimationSeconds;
  readonly frame: number;
  readonly shot?: ShotTimelineShot | undefined;
  readonly dialogue?: DialogueLine | undefined;
  readonly viseme?: VisemeSample | undefined;
}

export interface AuraVoiceRerenderPlan {
  readonly kind: "auravoice-rerender-plan";
  readonly episodeId: PromptAnimationId;
  readonly reason: string;
  readonly changedLineIds: readonly PromptAnimationId[];
  readonly changedAudioStemIds: readonly PromptAnimationId[];
  readonly affectedShotIds: readonly PromptAnimationId[];
  readonly affectedCaptionIds: readonly PromptAnimationId[];
  readonly affectedVisemeCueIds: readonly PromptAnimationId[];
  readonly affectedRenderQueueItemIds: readonly PromptAnimationId[];
  readonly fullEpisodeRebuildRequired: boolean;
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export interface AuraVoiceDubRerenderProof {
  readonly kind: "auravoice-dub-rerender-proof";
  readonly episodeId: PromptAnimationId;
  readonly sourceLanguage?: string | undefined;
  readonly targetLanguage?: string | undefined;
  readonly stableShotIds: boolean;
  readonly stableStoryboardIds: boolean;
  readonly stableCaptionIds: boolean;
  readonly stableCharacterIds: boolean;
  readonly affectedShotIds: readonly PromptAnimationId[];
  readonly rerenderQueueItemIds: readonly PromptAnimationId[];
  readonly issues: readonly PromptAnimationValidationIssue[];
  readonly publishReady: boolean;
}

export function createAuraVoiceBridgePackage(
  artifacts: AuraVoiceBridgeArtifacts,
  options: AuraVoiceBridgeOptions = {}
): AuraVoiceBridgePackage {
  const frameRate = options.frameRate ?? artifacts.shotTimeline.frameRate ?? artifacts.episodePlan.runtime.frameRate;
  const masterClock = createAuraVoiceMasterClock(artifacts, {
    frameRate,
    maxTimingDriftFrames: options.maxTimingDriftFrames
  });
  const renderQueue =
    artifacts.renderQueue ??
    createCartoonRenderQueue({
      episodePlan: artifacts.episodePlan,
      shotTimeline: artifacts.shotTimeline,
      route: options.route ?? "/prompt-animation",
      viewport: options.viewport,
      outputs: options.outputs
    });
  const renderOutputPackage =
    artifacts.renderOutputPackage ??
    createCartoonRenderOutputPackageMetadata({
      episodePlan: artifacts.episodePlan,
      shotTimeline: artifacts.shotTimeline,
      renderQueue,
      packageId: options.renderPackageId,
      youtube: options.youtube,
      generatedAt: artifacts.episodePlan.generatedAt
    });
  const packageValue: AuraVoiceBridgePackage = {
    kind: "auravoice-bridge-package",
    episodeId: artifacts.episodePlan.episodeId,
    masterClock,
    artifacts: {
      ...artifacts,
      renderQueue,
      renderOutputPackage
    },
    renderQueue,
    renderOutputPackage,
    issues: [],
    publishReady: false
  };
  const issues = validateAuraVoiceBridgePackage(packageValue);
  return {
    ...packageValue,
    issues,
    publishReady: !issues.some((issue) => issue.severity === "error")
  };
}

export function createAuraVoiceMasterClock(
  artifacts: AuraVoiceBridgeArtifacts,
  options: {
    readonly frameRate?: PromptAnimationFrameRate | undefined;
    readonly maxTimingDriftFrames?: number | undefined;
  } = {}
): AuraVoiceMasterClock {
  const frameRate = options.frameRate ?? artifacts.shotTimeline.frameRate ?? artifacts.episodePlan.runtime.frameRate;
  const audioDuration = artifacts.audioStems?.duration ?? 0;
  const dialogueDuration = artifacts.dialogueTrack.duration;
  const timelineDuration = artifacts.shotTimeline.duration;
  const source = artifacts.audioStems ? "audio-stems" : artifacts.dialogueTrack.lines.length > 0 ? "dialogue-track" : "shot-timeline";
  const duration = Math.max(audioDuration, dialogueDuration, timelineDuration, artifacts.episodePlan.runtime.duration);
  return {
    source,
    frameRate,
    frameDuration: frameRate > 0 ? 1 / frameRate : 0,
    duration,
    maxTimingDriftFrames: options.maxTimingDriftFrames ?? artifacts.episodePlan.runtime.maxTimingDriftFrames ?? 1
  };
}

export function validateAuraVoiceBridgePackage(
  bridgePackage: AuraVoiceBridgePackage
): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [
    ...validateAuraVoiceBridgeContractIds(bridgePackage.artifacts),
    ...validatePromptAnimationStableIds(bridgePackage.artifacts.episodePlan, bridgePackage.artifacts.storyboard),
    ...validateShotTimeline(bridgePackage.artifacts.shotTimeline),
    ...createDialogueTimingReport(
      bridgePackage.artifacts.dialogueTrack,
      bridgePackage.artifacts.captionTrack,
      bridgePackage.masterClock.frameRate,
      bridgePackage.masterClock.maxTimingDriftFrames
    ).issues,
    ...validateCartoonRenderQueue(bridgePackage.renderQueue),
    ...validateCartoonRenderOutputPackageMetadata(bridgePackage.renderOutputPackage),
    ...validateAuraVoiceAssetCoverage(bridgePackage.artifacts.episodePlan)
  ];

  if (!bridgePackage.artifacts.captionTrack) {
    issues.push(createPromptAnimationIssue("error", "auravoice-caption-track-missing", "Caption track is required for publish readiness."));
  }
  if (!bridgePackage.artifacts.visemes) {
    issues.push(createPromptAnimationIssue("error", "auravoice-visemes-missing", "AuraVoice v2 visemes are required for publish readiness."));
  } else {
    issues.push(...validateVisemeTrack(bridgePackage.artifacts.visemes));
  }
  if (!bridgePackage.artifacts.audioStems) {
    issues.push(createPromptAnimationIssue("error", "auravoice-audio-stems-missing", "Audio stem manifest is required for publish readiness."));
  } else {
    issues.push(...validateAudioStemManifest(bridgePackage.artifacts.audioStems));
  }

  const driftIssues = validateAuraVoiceTimingDrift(bridgePackage);
  issues.push(...driftIssues);
  issues.push(...validateAuraVoiceAudioCoverage(bridgePackage));
  issues.push(...validateAuraVoiceVisemeCoverage(bridgePackage));

  if (bridgePackage.artifacts.dubMap) {
    issues.push(...validateAuraVoiceDubMap(bridgePackage.artifacts.dubMap));
  }

  return issues;
}

export function validateAuraVoiceBridgeContractIds(
  artifacts: AuraVoiceBridgeArtifacts
): readonly PromptAnimationValidationIssue[] {
  const entries = [
    ["episodePlan", artifacts.episodePlan],
    ["storyboard", artifacts.storyboard],
    ["shotTimeline", artifacts.shotTimeline],
    ["dialogueTrack", artifacts.dialogueTrack],
    ["captionTrack", artifacts.captionTrack],
    ["visemes", artifacts.visemes],
    ["audioStems", artifacts.audioStems],
    ["dubMap", artifacts.dubMap],
    ["renderQueue", artifacts.renderQueue],
    ["renderOutputPackage", artifacts.renderOutputPackage]
  ] as const;
  return entries.flatMap(([path, artifact]) =>
    artifact ? validatePromptAnimationArtifactContract(artifact as PromptAnimationArtifactBase<PromptAnimationArtifactKind>, path) : []
  );
}

export function validateAuraVoiceTimingDrift(
  bridgePackage: AuraVoiceBridgePackage
): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const maxAllowedFrames = bridgePackage.masterClock.maxTimingDriftFrames;
  const frameRate = bridgePackage.masterClock.frameRate;

  for (const line of bridgePackage.artifacts.dialogueTrack.lines) {
    const startShot = getShotAtTime(bridgePackage.artifacts.shotTimeline, line.startTime);
    const endShot = getShotAtTime(bridgePackage.artifacts.shotTimeline, Math.max(line.startTime, line.endTime - 0.000001));
    if (!startShot || !endShot) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "auravoice-dialogue-outside-shot",
          `Dialogue line "${line.lineId}" is outside the shot timeline.`,
          { path: `dialogue.${line.lineId}`, time: line.startTime }
        )
      );
      continue;
    }

    const startDriftSeconds = Math.max(0, startShot.startTime - line.startTime);
    const endDriftSeconds = Math.max(0, line.endTime - endShot.endTime);
    const driftFrames = Math.max(
      promptAnimationDriftFrames(startDriftSeconds, frameRate),
      promptAnimationDriftFrames(endDriftSeconds, frameRate)
    );
    if (driftFrames > maxAllowedFrames) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "auravoice-dialogue-shot-drift",
          `Dialogue line "${line.lineId}" drifts ${driftFrames} frames from shot timing.`,
          { path: `dialogue.${line.lineId}`, frame: driftFrames, time: line.startTime }
        )
      );
    }
  }

  return issues;
}

export function validateAuraVoiceAssetCoverage(
  episodePlan: PromptAnimationEpisodePlan
): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  episodePlan.characters.forEach((character, index) => {
    if (!character.rig.asset) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "auravoice-character-asset-missing",
          `Character "${character.id}" is missing a typed model asset for publish readiness.`,
          { path: `characters.${index}.rig.asset` }
        )
      );
    }
  });
  return issues;
}

export function validateAuraVoiceAudioCoverage(
  bridgePackage: AuraVoiceBridgePackage
): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const audioStems = bridgePackage.artifacts.audioStems;
  if (!audioStems) return issues;

  const stemsByPath = new Map(audioStems.stems.map((stem) => [stem.path, stem]));
  const stemsById = new Map(audioStems.stems.map((stem) => [stem.id, stem]));
  for (const line of bridgePackage.artifacts.dialogueTrack.lines) {
    if (!line.audioFile) continue;
    const stem = stemsByPath.get(line.audioFile) ?? stemsById.get(line.audioFile);
    if (!stem) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "auravoice-line-audio-stem-missing",
          `Dialogue line "${line.lineId}" has no matching audio stem "${line.audioFile}".`,
          { path: `audioStems.${line.lineId}`, time: line.startTime }
        )
      );
      continue;
    }

    const driftSeconds = Math.max(
      Math.abs(stem.startTime - line.startTime),
      Math.abs(stem.startTime + stem.duration - line.endTime)
    );
    const driftFrames = promptAnimationDriftFrames(driftSeconds, bridgePackage.masterClock.frameRate);
    if (driftFrames > bridgePackage.masterClock.maxTimingDriftFrames) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "auravoice-audio-dialogue-drift",
          `Audio stem "${stem.id}" drifts ${driftFrames} frames from dialogue line "${line.lineId}".`,
          { path: `audioStems.${stem.id}`, frame: driftFrames, time: stem.startTime }
        )
      );
    }
  }

  return issues;
}

export function validateAuraVoiceVisemeCoverage(
  bridgePackage: AuraVoiceBridgePackage
): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const visemes = bridgePackage.artifacts.visemes;
  if (!visemes) return issues;

  const dialogueByLineId = new Map(bridgePackage.artifacts.dialogueTrack.lines.map((line) => [line.lineId, line]));
  const cuesByLineId = new Map<string, AuraVoiceVisemeTrack["cues"][number][]>();
  visemes.cues.forEach((cue, index) => {
    if (!cue.lineId) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "auravoice-viseme-line-id-missing",
          `Viseme cue "${cue.id}" must reference a dialogue line id.`,
          { path: `visemes.cues.${index}.lineId`, time: cue.startTime }
        )
      );
      return;
    }

    const line = dialogueByLineId.get(cue.lineId);
    if (line && cue.characterId !== line.speakerId && cue.speakerId !== line.speakerId) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "auravoice-viseme-character-mismatch",
          `Viseme cue "${cue.id}" must preserve dialogue character id "${line.speakerId}".`,
          { path: `visemes.cues.${index}.characterId`, time: cue.startTime }
        )
      );
    }

    const cues = cuesByLineId.get(cue.lineId) ?? [];
    cues.push(cue);
    cuesByLineId.set(cue.lineId, cues);
  });

  for (const line of bridgePackage.artifacts.dialogueTrack.lines) {
    const cues = (cuesByLineId.get(line.lineId) ?? []).filter(
      (cue) => cue.characterId === line.speakerId || cue.speakerId === line.speakerId
    );
    if (cues.length === 0) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "auravoice-viseme-line-missing",
          `Dialogue line "${line.lineId}" has no AuraVoice viseme cues.`,
          { path: `visemes.${line.lineId}`, time: line.startTime }
        )
      );
      continue;
    }

    const firstCueStart = Math.min(...cues.map((cue) => cue.startTime));
    const lastCueEnd = Math.max(...cues.map((cue) => cue.endTime));
    const driftSeconds = Math.max(Math.abs(firstCueStart - line.startTime), Math.abs(lastCueEnd - line.endTime));
    const driftFrames = promptAnimationDriftFrames(driftSeconds, bridgePackage.masterClock.frameRate);
    if (driftFrames > bridgePackage.masterClock.maxTimingDriftFrames) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "auravoice-viseme-dialogue-drift",
          `Visemes for dialogue line "${line.lineId}" drift ${driftFrames} frames from dialogue timing.`,
          { path: `visemes.${line.lineId}`, frame: driftFrames, time: firstCueStart }
        )
      );
    }
  }

  return issues;
}

export function validateAuraVoiceDubMap(dubMap: DubMapArtifact): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  for (const [index, entry] of dubMap.entries.entries()) {
    validateDubIdPair(issues, entry, "dialogue", entry.originalLineId, entry.dubbedLineId, `dubMap.entries.${index}.dubbedLineId`);
    validateDubIdPair(
      issues,
      entry,
      "character",
      entry.originalCharacterId ?? entry.originalSpeakerId,
      entry.dubbedCharacterId ?? entry.dubbedSpeakerId,
      `dubMap.entries.${index}.dubbedCharacterId`
    );
    validateDubIdPair(issues, entry, "shot", entry.originalShotId, entry.dubbedShotId, `dubMap.entries.${index}.dubbedShotId`);
    validateDubIdPair(
      issues,
      entry,
      "storyboard",
      entry.originalStoryboardId ?? entry.originalStoryboardSceneId ?? entry.originalSceneId,
      entry.dubbedStoryboardId ?? entry.dubbedStoryboardSceneId ?? entry.dubbedSceneId,
      `dubMap.entries.${index}.dubbedStoryboardId`
    );
    validateDubIdPair(
      issues,
      entry,
      "caption",
      entry.originalCaptionId,
      entry.dubbedCaptionId,
      `dubMap.entries.${index}.dubbedCaptionId`
    );
  }
  return issues;
}

function validateDubIdPair(
  issues: PromptAnimationValidationIssue[],
  entry: DubMapArtifact["entries"][number],
  kind: "dialogue" | "character" | "shot" | "storyboard" | "caption",
  originalId: PromptAnimationId | undefined,
  dubbedId: PromptAnimationId | undefined,
  path: string
): void {
  if (!originalId || !dubbedId) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        `auravoice-dub-${kind}-id-missing`,
        `Dubbed line "${entry.dubbedLineId}" must include stable ${kind} ids for source and dubbed renders.`,
        { path }
      )
    );
    return;
  }
  if (originalId !== dubbedId) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        `auravoice-dub-${kind}-id-changed`,
        `Dubbed line "${entry.dubbedLineId}" must preserve ${kind} id "${originalId}".`,
        { path }
      )
    );
  }
}

export function createAuraVoiceRerenderPlan(
  previousPackage: AuraVoiceBridgePackage,
  nextPackage: AuraVoiceBridgePackage,
  options: {
    readonly reason?: string | undefined;
    readonly changedLineIds?: readonly PromptAnimationId[] | undefined;
  } = {}
): AuraVoiceRerenderPlan {
  const issues: PromptAnimationValidationIssue[] = [];
  const changedLineIds = new Set<PromptAnimationId>(options.changedLineIds ?? []);
  const previousLines = new Map(previousPackage.artifacts.dialogueTrack.lines.map((line) => [line.lineId, line]));
  const nextLines = new Map(nextPackage.artifacts.dialogueTrack.lines.map((line) => [line.lineId, line]));

  for (const [lineId, nextLine] of nextLines) {
    const previousLine = previousLines.get(lineId);
    if (!previousLine) {
      changedLineIds.add(lineId);
      continue;
    }
    if (
      previousLine.text !== nextLine.text ||
      previousLine.audioFile !== nextLine.audioFile ||
      previousLine.startTime !== nextLine.startTime ||
      previousLine.endTime !== nextLine.endTime ||
      previousLine.language !== nextLine.language ||
      previousLine.speakerId !== nextLine.speakerId
    ) {
      changedLineIds.add(lineId);
    }
  }

  for (const lineId of previousLines.keys()) {
    if (!nextLines.has(lineId)) changedLineIds.add(lineId);
  }

  const changedAudioStemIds = changedAudioStems(previousPackage, nextPackage);
  for (const stemId of changedAudioStemIds) {
    const lineId = stemId.startsWith("audio:") ? stemId.slice("audio:".length) : stemId;
    if (nextLines.has(lineId) || previousLines.has(lineId)) changedLineIds.add(lineId);
  }

  const affectedShotIds = new Set<PromptAnimationId>();
  const affectedCaptionIds = new Set<PromptAnimationId>();
  const affectedVisemeCueIds = new Set<PromptAnimationId>();

  for (const lineId of changedLineIds) {
    const line = nextLines.get(lineId) ?? previousLines.get(lineId);
    if (!line) {
      issues.push(
        createPromptAnimationIssue("warning", "auravoice-rerender-line-missing", `Changed line "${lineId}" is not present in either bridge package.`, {
          path: `dialogue.${lineId}`
        })
      );
      continue;
    }
    const shot = shotForDialogueLine(nextPackage, line) ?? shotForDialogueLine(previousPackage, line);
    if (shot?.shotId) affectedShotIds.add(shot.shotId);
    for (const cue of nextPackage.artifacts.captionTrack?.cues ?? []) {
      if (cue.lineId === lineId) affectedCaptionIds.add(cue.captionId);
    }
    for (const cue of nextPackage.artifacts.visemes?.cues ?? []) {
      if (cue.lineId === lineId) affectedVisemeCueIds.add(cue.id);
    }
  }

  const affectedRenderQueueItemIds = nextPackage.renderQueue.items
    .filter((item) => item.shotId && affectedShotIds.has(item.shotId))
    .map((item) => item.id);

  const previousShotIds = previousPackage.artifacts.shotTimeline.shots.map((shot) => shot.shotId).join("\n");
  const nextShotIds = nextPackage.artifacts.shotTimeline.shots.map((shot) => shot.shotId).join("\n");
  const fullEpisodeRebuildRequired = previousPackage.episodeId !== nextPackage.episodeId || previousShotIds !== nextShotIds;

  if (fullEpisodeRebuildRequired) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "auravoice-rerender-stable-shot-ids-changed",
        "Voice-track regeneration must preserve episode id and shot ids to rerender affected shots without rebuilding the whole episode."
      )
    );
  }

  return {
    kind: "auravoice-rerender-plan",
    episodeId: nextPackage.episodeId,
    reason: options.reason ?? "AuraVoice regenerated one or more voice, caption, viseme, or audio-stem timing artifacts.",
    changedLineIds: [...changedLineIds],
    changedAudioStemIds,
    affectedShotIds: [...affectedShotIds],
    affectedCaptionIds: [...affectedCaptionIds],
    affectedVisemeCueIds: [...affectedVisemeCueIds],
    affectedRenderQueueItemIds,
    fullEpisodeRebuildRequired,
    issues
  };
}

export function createAuraVoiceDubRerenderProof(bridgePackage: AuraVoiceBridgePackage): AuraVoiceDubRerenderProof {
  const dubMap = bridgePackage.artifacts.dubMap;
  const issues: PromptAnimationValidationIssue[] = dubMap
    ? [...validateAuraVoiceDubMap(dubMap)]
    : [
        createPromptAnimationIssue(
          "error",
          "auravoice-dub-map-missing",
          "Dub rerender proof requires a dub-map artifact with stable dialogue, caption, character, storyboard, and shot ids."
        )
      ];
  const entries = dubMap?.entries ?? [];
  const stableShotIds = entries.length > 0 && entries.every((entry) => entry.originalShotId === entry.dubbedShotId);
  const stableStoryboardIds =
    entries.length > 0 &&
    entries.every(
      (entry) =>
        (entry.originalStoryboardId ?? entry.originalStoryboardSceneId ?? entry.originalSceneId) ===
        (entry.dubbedStoryboardId ?? entry.dubbedStoryboardSceneId ?? entry.dubbedSceneId)
    );
  const stableCaptionIds = entries.length > 0 && entries.every((entry) => entry.originalCaptionId === entry.dubbedCaptionId);
  const stableCharacterIds =
    entries.length > 0 &&
    entries.every((entry) => (entry.originalCharacterId ?? entry.originalSpeakerId) === (entry.dubbedCharacterId ?? entry.dubbedSpeakerId));
  const affectedShotIds = [...new Set(entries.flatMap((entry) => (entry.dubbedShotId ? [entry.dubbedShotId] : [])))];
  const rerenderQueueItemIds = bridgePackage.renderQueue.items
    .filter((item) => item.shotId && affectedShotIds.includes(item.shotId))
    .map((item) => item.id);

  if (!stableShotIds) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "auravoice-dub-shot-id-unstable",
        "Dubbed render proof must preserve shot ids so Aura3D can rerender the same storyboard shots."
      )
    );
  }

  return {
    kind: "auravoice-dub-rerender-proof",
    episodeId: bridgePackage.episodeId,
    ...(dubMap ? { sourceLanguage: dubMap.sourceLanguage, targetLanguage: dubMap.targetLanguage } : {}),
    stableShotIds,
    stableStoryboardIds,
    stableCaptionIds,
    stableCharacterIds,
    affectedShotIds,
    rerenderQueueItemIds,
    issues,
    publishReady: !issues.some((issue) => issue.severity === "error")
  };
}

function changedAudioStems(
  previousPackage: AuraVoiceBridgePackage,
  nextPackage: AuraVoiceBridgePackage
): readonly PromptAnimationId[] {
  const changed = new Set<PromptAnimationId>();
  const previousStems = new Map((previousPackage.artifacts.audioStems?.stems ?? []).map((stem) => [stem.id, stem]));
  const nextStems = new Map((nextPackage.artifacts.audioStems?.stems ?? []).map((stem) => [stem.id, stem]));
  for (const [stemId, nextStem] of nextStems) {
    const previousStem = previousStems.get(stemId);
    if (
      !previousStem ||
      previousStem.path !== nextStem.path ||
      previousStem.startTime !== nextStem.startTime ||
      previousStem.duration !== nextStem.duration ||
      previousStem.gainDb !== nextStem.gainDb ||
      previousStem.language !== nextStem.language
    ) {
      changed.add(stemId);
    }
  }
  for (const stemId of previousStems.keys()) {
    if (!nextStems.has(stemId)) changed.add(stemId);
  }
  return [...changed];
}

function shotForDialogueLine(
  bridgePackage: AuraVoiceBridgePackage,
  line: DialogueLine
): ShotTimelineShot | undefined {
  return (
    bridgePackage.artifacts.shotTimeline.shots.find((shot) =>
      line.startTime >= shot.startTime && line.endTime <= shot.endTime + 0.000001
    ) ??
    bridgePackage.artifacts.shotTimeline.shots.find((shot) => line.lineId.startsWith(`${shot.shotId}:line-`))
  );
}

export function sampleAuraVoiceBridgeAtTime(
  bridgePackage: AuraVoiceBridgePackage,
  time: PromptAnimationSeconds,
  characterId?: PromptAnimationId
): AuraVoicePlaybackSample {
  const frame = promptAnimationFrameAtTime(time, bridgePackage.masterClock.frameRate);
  const dialogue = dialogueLineAtTime(bridgePackage.artifacts.dialogueTrack, time, characterId);
  return {
    time,
    frame,
    shot: getShotAtTime(bridgePackage.artifacts.shotTimeline, time),
    ...(dialogue ? { dialogue } : {}),
    ...(bridgePackage.artifacts.visemes ? { viseme: sampleVisemeTrack(bridgePackage.artifacts.visemes, time, characterId) } : {})
  };
}
