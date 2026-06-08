import type { AuraSceneEvidence } from "./index.js";
import {
  createPromptAnimationAccessibilityProofMetadata,
  createPromptAnimationIssue,
  promptAnimationContractVersion,
  promptAnimationFrameAtTime,
  type PromptAnimationAccessibilityProofMetadata,
  type PromptAnimationArtifactBase,
  type PromptAnimationArtifactKind,
  type PromptAnimationId,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";
import type { AuraVoiceBridgePackage } from "./AuraVoiceBridge.js";
import type { AnimationPerformanceCoverage } from "./AnimationPerformance.js";

export type PromptAnimationEvidenceStatus = "pass" | "warn" | "fail" | "missing";

export interface PromptAnimationScreenshotEvidence {
  readonly id: PromptAnimationId;
  readonly time: number;
  readonly path?: string | undefined;
  readonly hash?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

export type PromptAnimationRenderedArtifactRole =
  | "video"
  | "thumbnail"
  | "captions"
  | "timeline"
  | "audio-stems"
  | "evidence-json"
  | "youtube-metadata"
  | "screenshot"
  | "other";

export interface PromptAnimationConsumedAuraVoiceArtifactMetadata {
  readonly id: PromptAnimationId;
  readonly artifact: PromptAnimationArtifactKind;
  readonly present: boolean;
  readonly contractId?: string | undefined;
  readonly generatedAt?: string | undefined;
  readonly issueCodes: readonly string[];
}

export interface PromptAnimationRenderedArtifactMetadata {
  readonly id: PromptAnimationId;
  readonly role: PromptAnimationRenderedArtifactRole;
  readonly kind: string;
  readonly path: string;
  readonly required: boolean;
  readonly mimeType?: string | undefined;
  readonly language?: string | undefined;
  readonly sha256?: string | undefined;
  readonly byteSize?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly duration?: number | undefined;
  readonly frameRate?: number | undefined;
  readonly captureTime?: number | undefined;
  readonly auraVoiceTimestamp?: number | undefined;
  readonly frame?: number | undefined;
  readonly shotId?: PromptAnimationId | undefined;
  readonly sourceSceneStateId?: PromptAnimationId | undefined;
  readonly metadataComplete?: boolean | undefined;
  readonly missingFields?: readonly string[] | undefined;
  readonly executionRequired?: boolean | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface PromptAnimationArtifactMetadataEvidence {
  readonly status: PromptAnimationEvidenceStatus;
  readonly requiredCount: number;
  readonly completeCount: number;
  readonly executionRequiredCount: number;
  readonly missingMetadata: readonly {
    readonly id: PromptAnimationId;
    readonly role: PromptAnimationRenderedArtifactRole;
    readonly path: string;
    readonly missingFields: readonly string[];
  }[];
}

export interface PromptAnimationScreenshotFixtureMetadata {
  readonly id: PromptAnimationId;
  readonly shotId?: PromptAnimationId | undefined;
  readonly renderQueueItemId?: PromptAnimationId | undefined;
  readonly time: number;
  readonly frame: number;
  readonly path: string;
  readonly sourceSceneStateId?: PromptAnimationId | undefined;
  readonly auraVoiceTimestamp: number;
  readonly deterministicSeed?: string | undefined;
  readonly expectedWidth?: number | undefined;
  readonly expectedHeight?: number | undefined;
  readonly captionCueId?: PromptAnimationId | undefined;
  readonly visemeCueId?: PromptAnimationId | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface PromptAnimationDeterministicCaptureEvidence {
  readonly id: PromptAnimationId;
  readonly renderQueueItemId: PromptAnimationId;
  readonly time: number;
  readonly auraVoiceTimestamp: number;
  readonly frame: number;
  readonly sourceSceneStateId?: PromptAnimationId | undefined;
  readonly deterministicSeed?: string | undefined;
  readonly shotId?: PromptAnimationId | undefined;
  readonly dialogueLineId?: PromptAnimationId | undefined;
  readonly captionCueId?: PromptAnimationId | undefined;
  readonly visemeCueId?: PromptAnimationId | undefined;
  readonly thumbnail: boolean;
}

export interface PromptAnimationDeterministicCaptureSummary {
  readonly status: PromptAnimationEvidenceStatus;
  readonly count: number;
  readonly missingSceneStateIds: readonly PromptAnimationId[];
  readonly timestampMismatchIds: readonly PromptAnimationId[];
  readonly thumbnailSourceSceneStateId?: PromptAnimationId | undefined;
  readonly missingThumbnailSource: boolean;
}

export interface PromptAnimationTimingDriftEvidence {
  readonly maxDriftFrames: number;
  readonly allowedDriftFrames: number;
  readonly status: PromptAnimationEvidenceStatus;
}

export interface PromptAnimationCoverageEvidence {
  readonly status: PromptAnimationEvidenceStatus;
  readonly animatedCharacterIds: readonly PromptAnimationId[];
  readonly uncoveredDialogueLineIds: readonly PromptAnimationId[];
}

export interface PromptAnimationAssetStatusEvidence {
  readonly status: PromptAnimationEvidenceStatus;
  readonly typedAssets: number;
  readonly missingAssets: readonly PromptAnimationId[];
  readonly primitiveFallbackCharacters: readonly PromptAnimationId[];
}

export interface PromptAnimationTrackEvidence {
  readonly status: PromptAnimationEvidenceStatus;
  readonly count: number;
  readonly missingIds: readonly PromptAnimationId[];
  readonly maxDriftFrames?: number | undefined;
}

export interface PromptAnimationAudioEvidence {
  readonly status: PromptAnimationEvidenceStatus;
  readonly stemCount: number;
  readonly dialogueStemCount: number;
  readonly missingDialogueLineIds: readonly PromptAnimationId[];
  readonly missingStemIds: readonly PromptAnimationId[];
}

export interface PromptAnimationAccessibilityEvidence {
  readonly status: PromptAnimationEvidenceStatus;
  readonly captionsReadable: boolean;
  readonly captionCueCount: number;
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
  readonly flashingSafe: boolean;
  readonly childSafe: boolean;
  readonly proof: PromptAnimationAccessibilityProofMetadata;
}

export interface PromptAnimationRouteHealthEvidence {
  readonly status: PromptAnimationEvidenceStatus;
  readonly route?: string | undefined;
  readonly diagnostics?: AuraSceneEvidence | undefined;
  readonly messages?: readonly string[] | undefined;
}

export interface PromptAnimationEvidenceArtifact extends PromptAnimationArtifactBase<"prompt-animation-evidence"> {
  readonly consumedAuraVoiceArtifacts?: readonly PromptAnimationConsumedAuraVoiceArtifactMetadata[] | undefined;
  readonly renderedArtifacts?: readonly PromptAnimationRenderedArtifactMetadata[] | undefined;
  readonly artifactMetadata?: PromptAnimationArtifactMetadataEvidence | undefined;
  readonly screenshots: readonly PromptAnimationScreenshotEvidence[];
  readonly screenshotFixtures?: readonly PromptAnimationScreenshotFixtureMetadata[] | undefined;
  readonly deterministicCaptures: readonly PromptAnimationDeterministicCaptureEvidence[];
  readonly deterministicCapture: PromptAnimationDeterministicCaptureSummary;
  readonly timingDrift: PromptAnimationTimingDriftEvidence;
  readonly animationCoverage: PromptAnimationCoverageEvidence;
  readonly assetStatus: PromptAnimationAssetStatusEvidence;
  readonly captions: PromptAnimationTrackEvidence;
  readonly visemes: PromptAnimationTrackEvidence;
  readonly audio: PromptAnimationAudioEvidence;
  readonly accessibility: PromptAnimationAccessibilityEvidence;
  readonly routeHealth: PromptAnimationRouteHealthEvidence;
  readonly issues: readonly PromptAnimationValidationIssue[];
  readonly publishReady: boolean;
}

export interface CollectPromptAnimationEvidenceInput {
  readonly bridgePackage: AuraVoiceBridgePackage;
  readonly screenshots?: readonly PromptAnimationScreenshotEvidence[] | undefined;
  readonly renderedArtifacts?: readonly PromptAnimationRenderedArtifactMetadata[] | undefined;
  readonly deterministicCaptures?: readonly PromptAnimationDeterministicCaptureEvidence[] | undefined;
  readonly screenshotFixtures?: readonly PromptAnimationScreenshotFixtureMetadata[] | undefined;
  readonly performanceCoverage?: AnimationPerformanceCoverage | undefined;
  readonly routeHealth?: PromptAnimationRouteHealthEvidence | undefined;
  readonly generatedAt?: string | undefined;
}

export function definePromptAnimationEvidence<const TEvidence extends PromptAnimationEvidenceArtifact>(
  evidence: TEvidence
): TEvidence {
  return evidence;
}

export function collectPromptAnimationEvidence(input: CollectPromptAnimationEvidenceInput): PromptAnimationEvidenceArtifact {
  const plan = input.bridgePackage.artifacts.episodePlan;
  const screenshots = input.screenshots ?? [];
  const bridgeIssues = input.bridgePackage.issues;
  const consumedAuraVoiceArtifacts = derivePromptAnimationConsumedAuraVoiceArtifactMetadata(input.bridgePackage);
  const renderedArtifacts = normalizePromptAnimationRenderedArtifactMetadata(
    input.renderedArtifacts ?? derivePromptAnimationRenderedArtifactMetadata(input.bridgePackage, screenshots)
  );
  const artifactMetadata = summarizePromptAnimationArtifactMetadata(renderedArtifacts);
  const maxDriftFrameIssue = maxIssueFrame(bridgeIssues, "drift");
  const missingAssets = plan.characters.filter((character) => !character.rig.asset).map((character) => character.id);
  const primitiveFallbackCharacters = plan.characters
    .filter((character) => character.rig.mouthFallback === "primitive-mouth-card")
    .map((character) => character.id);
  const captionCount = input.bridgePackage.artifacts.captionTrack?.cues.length ?? 0;
  const visemeCount = input.bridgePackage.artifacts.visemes?.cues.length ?? 0;
  const audioStems = input.bridgePackage.artifacts.audioStems?.stems ?? [];
  const dialogueAudioStems = audioStems.filter((stem) => stem.role === "dialogue");
  const deterministicCaptures =
    input.deterministicCaptures ?? derivePromptAnimationDeterministicCaptures(input.bridgePackage);
  const screenshotFixtures =
    input.screenshotFixtures ?? derivePromptAnimationScreenshotFixtureMetadata(input.bridgePackage, screenshots);
  const missingSceneStateIds = deterministicCaptures
    .filter((capture) => !capture.sourceSceneStateId)
    .map((capture) => capture.id);
  const timestampMismatchIds = deterministicCaptures
    .filter((capture) => !samePromptAnimationEvidenceTime(capture.time, capture.auraVoiceTimestamp))
    .map((capture) => capture.id);
  const thumbnailSourceSceneStateId = input.bridgePackage.renderOutputPackage.thumbnailCapture.sourceSceneStateId;
  const missingThumbnailSource =
    !thumbnailSourceSceneStateId ||
    !deterministicCaptures.some(
      (capture) => capture.thumbnail && capture.sourceSceneStateId === thumbnailSourceSceneStateId
    );
  const dialogueLineIds = input.bridgePackage.artifacts.dialogueTrack.lines.map((line) => line.lineId);
  const captionLineIds = new Set(
    input.bridgePackage.artifacts.captionTrack?.cues.flatMap((cue) => (cue.lineId ? [cue.lineId] : [])) ?? []
  );
  const visemeLineIds = new Set(
    input.bridgePackage.artifacts.visemes?.cues.flatMap((cue) => (cue.lineId ? [cue.lineId] : [])) ?? []
  );
  const missingCaptionIds = dialogueLineIds.filter((lineId) => !captionLineIds.has(lineId));
  const missingVisemeIds = dialogueLineIds.filter((lineId) => !visemeLineIds.has(lineId));
  const missingDialogueAudioLineIds = input.bridgePackage.artifacts.dialogueTrack.lines
    .filter(
      (line) =>
        !dialogueAudioStems.some(
          (stem) =>
            stem.id.includes(line.lineId) ||
            stem.path.includes(line.lineId) ||
            (samePromptAnimationEvidenceTime(stem.startTime, line.startTime) &&
              samePromptAnimationEvidenceTime(stem.duration, line.endTime - line.startTime))
        )
    )
    .map((line) => line.lineId);
  const missingAudioStemIds = audioStems
    .filter((stem) => stem.path.trim().length === 0 || stem.duration <= 0)
    .map((stem) => stem.id);
  const accessibilityProof =
    plan.accessibilityProof ??
    createPromptAnimationAccessibilityProofMetadata({
      language: plan.language,
      captionRequired: plan.safety.captionRequired,
      captionsEnabled: captionCount > 0,
      reducedMotionDefault: plan.runtime.reducedMotion ?? plan.safety.reducedMotionDefault,
      highContrastDefault: plan.runtime.highContrast ?? plan.safety.highContrastDefault ?? true,
      maxTimingDriftFrames: input.bridgePackage.masterClock.maxTimingDriftFrames
    });
  const captionsReadable =
    captionCount > 0 &&
    accessibilityProof.captions.enabled &&
    accessibilityProof.captions.status !== "fail";
  const reducedMotion =
    accessibilityProof.reducedMotion.defaultEnabled &&
    accessibilityProof.reducedMotion.status !== "fail";
  const highContrast =
    accessibilityProof.highContrast.defaultEnabled &&
    accessibilityProof.highContrast.status !== "fail";

  const issues: PromptAnimationValidationIssue[] = [...bridgeIssues];
  if (screenshots.length === 0) {
    issues.push(createPromptAnimationIssue("error", "evidence-screenshot-missing", "At least one screenshot hash is required."));
  }
  for (const screenshot of screenshots) {
    if (!screenshot.hash) {
      issues.push(
        createPromptAnimationIssue("error", "evidence-screenshot-hash-missing", `Screenshot "${screenshot.id}" has no hash.`, {
          path: `screenshots.${screenshot.id}`,
          time: screenshot.time
        })
      );
    }
  }
  if (deterministicCaptures.length === 0) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "evidence-deterministic-captures-missing",
        "Render evidence must include deterministic capture records from AuraVoice timestamps."
      )
    );
  }
  for (const captureId of missingSceneStateIds) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "evidence-deterministic-scene-state-missing",
        `Deterministic capture "${captureId}" is missing an Aura3D scene state id.`
      )
    );
  }
  for (const captureId of timestampMismatchIds) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "evidence-deterministic-timestamp-mismatch",
        `Deterministic capture "${captureId}" must use the exact AuraVoice timestamp.`
      )
    );
  }
  if (missingThumbnailSource) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "evidence-thumbnail-scene-state-missing",
        "Thumbnail evidence must reuse a deterministic Aura3D scene state from the render queue."
      )
    );
  }
  for (const missingMetadata of artifactMetadata.missingMetadata) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "evidence-render-artifact-metadata-missing",
        `Rendered artifact "${missingMetadata.id}" is missing required metadata: ${missingMetadata.missingFields.join(", ")}.`,
        { path: `renderedArtifacts.${missingMetadata.id}` }
      )
    );
  }

  const animationCoverage: PromptAnimationCoverageEvidence = input.performanceCoverage
    ? {
        status: input.performanceCoverage.uncoveredDialogueLineIds.length === 0 ? "pass" : "fail",
        animatedCharacterIds: input.performanceCoverage.animatedCharacterIds,
        uncoveredDialogueLineIds: input.performanceCoverage.uncoveredDialogueLineIds
      }
    : {
        status: "missing",
        animatedCharacterIds: [],
        uncoveredDialogueLineIds: input.bridgePackage.artifacts.dialogueTrack.lines.map((line) => line.lineId)
      };

  const evidence: PromptAnimationEvidenceArtifact = {
    artifact: "prompt-animation-evidence",
    contractId: promptAnimationContractVersion,
    episodeId: plan.episodeId,
    consumedAuraVoiceArtifacts,
    renderedArtifacts,
    artifactMetadata,
    screenshots,
    screenshotFixtures,
    deterministicCaptures,
    deterministicCapture: {
      status:
        deterministicCaptures.length === 0
          ? "missing"
          : missingSceneStateIds.length === 0 && timestampMismatchIds.length === 0 && !missingThumbnailSource
            ? "pass"
            : "fail",
      count: deterministicCaptures.length,
      missingSceneStateIds,
      timestampMismatchIds,
      ...(thumbnailSourceSceneStateId ? { thumbnailSourceSceneStateId } : {}),
      missingThumbnailSource
    },
    timingDrift: {
      maxDriftFrames: maxDriftFrameIssue,
      allowedDriftFrames: input.bridgePackage.masterClock.maxTimingDriftFrames,
      status: maxDriftFrameIssue <= input.bridgePackage.masterClock.maxTimingDriftFrames ? "pass" : "fail"
    },
    animationCoverage,
    assetStatus: {
      status: missingAssets.length === 0 ? "pass" : "fail",
      typedAssets: plan.characters.filter((character) => Boolean(character.rig.asset)).length,
      missingAssets,
      primitiveFallbackCharacters
    },
    captions: {
      status: captionCount === 0 ? "missing" : missingCaptionIds.length === 0 ? "pass" : "fail",
      count: captionCount,
      missingIds: missingCaptionIds
    },
    visemes: {
      status: visemeCount === 0 ? "missing" : missingVisemeIds.length === 0 ? "pass" : "fail",
      count: visemeCount,
      missingIds: missingVisemeIds
    },
    audio: {
      status:
        audioStems.length === 0
          ? "missing"
          : missingDialogueAudioLineIds.length === 0 && missingAudioStemIds.length === 0
            ? "pass"
            : "fail",
      stemCount: audioStems.length,
      dialogueStemCount: dialogueAudioStems.length,
      missingDialogueLineIds: missingDialogueAudioLineIds,
      missingStemIds: missingAudioStemIds
    },
    accessibility: {
      status:
        plan.safety.childSafe &&
        plan.safety.captionRequired &&
        captionsReadable &&
        reducedMotion &&
        highContrast &&
        plan.safety.flashing !== "review-required" &&
        plan.safety.reducedMotionDefault
          ? "pass"
          : "fail",
      captionsReadable,
      captionCueCount: captionCount,
      reducedMotion,
      highContrast,
      flashingSafe: plan.safety.flashing !== "review-required",
      childSafe: plan.safety.childSafe,
      proof: accessibilityProof
    },
    routeHealth: input.routeHealth ?? { status: "missing" },
    issues,
    publishReady: false,
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };

  return {
    ...evidence,
    publishReady: evaluatePromptAnimationPublishReadiness(evidence).ready
  };
}

export function createPromptAnimationDeterministicScreenshotFixtureMetadata(input: {
  readonly bridgePackage: AuraVoiceBridgePackage;
  readonly screenshots?: readonly PromptAnimationScreenshotEvidence[] | undefined;
  readonly count?: number | undefined;
  readonly pathPrefix?: string | undefined;
}): readonly PromptAnimationScreenshotFixtureMetadata[] {
  return derivePromptAnimationScreenshotFixtureMetadata(input.bridgePackage, input.screenshots ?? [], {
    count: input.count,
    pathPrefix: input.pathPrefix
  });
}

export function evaluatePromptAnimationPublishReadiness(evidence: PromptAnimationEvidenceArtifact): {
  readonly ready: boolean;
  readonly issues: readonly PromptAnimationValidationIssue[];
} {
  const issues: PromptAnimationValidationIssue[] = [...evidence.issues];
  const requiredStatuses: readonly [string, PromptAnimationEvidenceStatus][] = [
    ["timingDrift", evidence.timingDrift.status],
    ["animationCoverage", evidence.animationCoverage.status],
    ["assetStatus", evidence.assetStatus.status],
    ["captions", evidence.captions.status],
    ["visemes", evidence.visemes.status],
    ["audio", evidence.audio.status],
    ["deterministicCapture", evidence.deterministicCapture.status],
    ["artifactMetadata", evidence.artifactMetadata?.status ?? "missing"],
    ["accessibility", evidence.accessibility.status],
    ["routeHealth", evidence.routeHealth.status]
  ];

  for (const [name, status] of requiredStatuses) {
    if (status !== "pass") {
      issues.push(createPromptAnimationIssue("error", `evidence-${name}-not-ready`, `${name} evidence status is "${status}".`));
    }
  }

  if (evidence.screenshots.length === 0) {
    issues.push(createPromptAnimationIssue("error", "evidence-screenshots-empty", "Screenshot evidence is required."));
  }

  return {
    ready: !issues.some((issue) => issue.severity === "error"),
    issues
  };
}

function derivePromptAnimationDeterministicCaptures(
  bridgePackage: AuraVoiceBridgePackage
): readonly PromptAnimationDeterministicCaptureEvidence[] {
  const thumbnailSourceSceneStateId = bridgePackage.renderOutputPackage.thumbnailCapture.sourceSceneStateId;
  return bridgePackage.renderQueue.items.map((item) => {
    const time = item.time;
    const dialogue = bridgePackage.artifacts.dialogueTrack.lines.find(
      (line) => time >= line.startTime && time < line.endTime
    );
    const caption = bridgePackage.artifacts.captionTrack?.cues.find(
      (cue) => time >= cue.startTime && time < cue.endTime
    );
    const viseme = bridgePackage.artifacts.visemes?.cues.find((cue) => time >= cue.startTime && time < cue.endTime);
    const sourceSceneState = item.sourceSceneState;
    return {
      id: `${item.id}:deterministic-capture`,
      renderQueueItemId: item.id,
      time,
      auraVoiceTimestamp: sourceSceneState?.auraVoiceTimestamp ?? time,
      frame: item.frame,
      ...(sourceSceneState?.sceneStateId ? { sourceSceneStateId: sourceSceneState.sceneStateId } : {}),
      ...(sourceSceneState?.deterministicSeed ? { deterministicSeed: sourceSceneState.deterministicSeed } : {}),
      ...(item.shotId ? { shotId: item.shotId } : {}),
      ...(dialogue ? { dialogueLineId: dialogue.lineId } : {}),
      ...(caption ? { captionCueId: caption.captionId } : {}),
      ...(viseme ? { visemeCueId: viseme.id } : {}),
      thumbnail: Boolean(sourceSceneState?.sceneStateId && sourceSceneState.sceneStateId === thumbnailSourceSceneStateId)
    };
  });
}

function derivePromptAnimationConsumedAuraVoiceArtifactMetadata(
  bridgePackage: AuraVoiceBridgePackage
): readonly PromptAnimationConsumedAuraVoiceArtifactMetadata[] {
  const artifacts = bridgePackage.artifacts;
  const entries = [
    ["episodePlan", "episode.plan", artifacts.episodePlan],
    ["storyboard", "storyboard", artifacts.storyboard],
    ["shotTimeline", "shot-timeline", artifacts.shotTimeline],
    ["dialogueTrack", "dialogue-track", artifacts.dialogueTrack],
    ["captionTrack", "caption-track", artifacts.captionTrack],
    ["visemes", "visemes", artifacts.visemes],
    ["audioStems", "audio-stems", artifacts.audioStems],
    ["dubMap", "dub-map", artifacts.dubMap],
    ["renderQueue", "render-queue", bridgePackage.renderQueue],
    ["renderOutputPackage", "render-output-package", bridgePackage.renderOutputPackage]
  ] as const;

  return entries.map(([id, artifactKind, artifact]) => ({
    id,
    artifact: artifactKind,
    present: Boolean(artifact),
    ...(artifact?.contractId ? { contractId: artifact.contractId } : {}),
    ...(artifact?.generatedAt ? { generatedAt: artifact.generatedAt } : {}),
    issueCodes: bridgePackage.issues
      .filter((issue) => issue.path?.includes(id) || issue.code.includes(String(artifactKind)))
      .map((issue) => issue.code)
  }));
}

function derivePromptAnimationRenderedArtifactMetadata(
  bridgePackage: AuraVoiceBridgePackage,
  screenshots: readonly PromptAnimationScreenshotEvidence[]
): readonly PromptAnimationRenderedArtifactMetadata[] {
  const requiredOutputKinds = new Set(bridgePackage.renderOutputPackage.requiredOutputKinds);
  const renderedArtifacts: PromptAnimationRenderedArtifactMetadata[] = bridgePackage.renderQueue.outputs.map((output) => {
    const role = promptAnimationRenderedArtifactRoleForKind(output.kind);
    const thumbnailCapture = output.kind === "thumbnail" ? bridgePackage.renderOutputPackage.thumbnailCapture : undefined;
    return {
      id: output.id,
      role,
      kind: output.kind,
      path: output.path,
      required: output.required ?? requiredOutputKinds.has(output.kind),
      ...(output.mimeType ? { mimeType: output.mimeType } : {}),
      ...(output.language ? { language: output.language } : {}),
      ...(role === "video" ? { duration: bridgePackage.masterClock.duration, frameRate: bridgePackage.masterClock.frameRate } : {}),
      ...(role === "video" || role === "thumbnail"
        ? {
            width: bridgePackage.renderQueue.viewport.width,
            height: bridgePackage.renderQueue.viewport.height
          }
        : {}),
      ...(thumbnailCapture
        ? {
            captureTime: thumbnailCapture.time,
            auraVoiceTimestamp: thumbnailCapture.auraVoiceTimestamp,
            frame: thumbnailCapture.frame,
            ...(thumbnailCapture.shotId ? { shotId: thumbnailCapture.shotId } : {}),
            sourceSceneStateId: thumbnailCapture.sourceSceneStateId
          }
        : {}),
      metadataComplete: false,
      missingFields: [],
      executionRequired: true,
      notes: ["Render artifact metadata must be completed with sha256 and byteSize after the operator render pass."]
    };
  });

  if (bridgePackage.artifacts.audioStems) {
    renderedArtifacts.push({
      id: "audio-stems",
      role: "audio-stems",
      kind: "audio-stems-json",
      path: "dist/render/audio-stems.json",
      required: true,
      mimeType: "application/json",
      language: bridgePackage.artifacts.episodePlan.language,
      duration: bridgePackage.artifacts.audioStems.duration,
      metadataComplete: false,
      missingFields: [],
      executionRequired: true,
      notes: ["Audio stem artifact metadata must include hash and byte size once AuraVoice writes the sidecar."]
    });
  }

  for (const screenshot of screenshots) {
    renderedArtifacts.push({
      id: `screenshot:${screenshot.id}`,
      role: "screenshot",
      kind: "screenshot",
      path: screenshot.path ?? "",
      required: true,
      ...(screenshot.hash ? { sha256: screenshot.hash } : {}),
      ...(screenshot.width ? { width: screenshot.width } : {}),
      ...(screenshot.height ? { height: screenshot.height } : {}),
      captureTime: screenshot.time,
      auraVoiceTimestamp: screenshot.time,
      frame: promptAnimationFrameAtTime(screenshot.time, bridgePackage.masterClock.frameRate),
      metadataComplete: false,
      missingFields: [],
      executionRequired: true,
      notes: ["Screenshot metadata proves deterministic capture hash; byte size is optional for screenshot evidence."]
    });
  }

  return renderedArtifacts;
}

function normalizePromptAnimationRenderedArtifactMetadata(
  artifacts: readonly PromptAnimationRenderedArtifactMetadata[]
): readonly PromptAnimationRenderedArtifactMetadata[] {
  return artifacts.map((artifact) => {
    const missingFields = missingRenderedArtifactMetadataFields(artifact);
    return {
      ...artifact,
      missingFields,
      metadataComplete: missingFields.length === 0,
      executionRequired: missingFields.length > 0
    };
  });
}

function summarizePromptAnimationArtifactMetadata(
  renderedArtifacts: readonly PromptAnimationRenderedArtifactMetadata[]
): PromptAnimationArtifactMetadataEvidence {
  const requiredArtifacts = renderedArtifacts.filter((artifact) => artifact.required);
  const missingMetadata = requiredArtifacts
    .filter((artifact) => !artifact.metadataComplete)
    .map((artifact) => ({
      id: artifact.id,
      role: artifact.role,
      path: artifact.path,
      missingFields: artifact.missingFields ?? []
    }));

  return {
    status: requiredArtifacts.length === 0 ? "missing" : missingMetadata.length === 0 ? "pass" : "fail",
    requiredCount: requiredArtifacts.length,
    completeCount: requiredArtifacts.length - missingMetadata.length,
    executionRequiredCount: missingMetadata.length,
    missingMetadata
  };
}

function promptAnimationRenderedArtifactRoleForKind(kind: string): PromptAnimationRenderedArtifactRole {
  if (kind === "mp4" || kind === "webm" || kind === "png-sequence") return "video";
  if (kind === "thumbnail") return "thumbnail";
  if (kind === "caption-vtt" || kind === "caption-srt") return "captions";
  if (kind === "timeline-json") return "timeline";
  if (kind === "evidence-json") return "evidence-json";
  if (kind === "youtube-metadata") return "youtube-metadata";
  return "other";
}

function missingRenderedArtifactMetadataFields(artifact: PromptAnimationRenderedArtifactMetadata): readonly string[] {
  if (!artifact.required) return [];
  const missing: string[] = [];
  if (!artifact.path.trim()) missing.push("path");
  if (!artifact.sha256) missing.push("sha256");
  if (requiresRenderedArtifactByteSize(artifact.role) && (!artifact.byteSize || artifact.byteSize <= 0)) {
    missing.push("byteSize");
  }
  if ((artifact.role === "thumbnail" || artifact.role === "screenshot") && !artifact.width) missing.push("width");
  if ((artifact.role === "thumbnail" || artifact.role === "screenshot") && !artifact.height) missing.push("height");
  if (artifact.role === "thumbnail" && !artifact.sourceSceneStateId) missing.push("sourceSceneStateId");
  if (artifact.role === "video" && !artifact.duration) missing.push("duration");
  if (artifact.role === "video" && !artifact.frameRate) missing.push("frameRate");
  return missing;
}

function requiresRenderedArtifactByteSize(role: PromptAnimationRenderedArtifactRole): boolean {
  return role !== "screenshot";
}

function derivePromptAnimationScreenshotFixtureMetadata(
  bridgePackage: AuraVoiceBridgePackage,
  screenshots: readonly PromptAnimationScreenshotEvidence[],
  options: { readonly count?: number | undefined; readonly pathPrefix?: string | undefined } = {}
): readonly PromptAnimationScreenshotFixtureMetadata[] {
  const fixtures: PromptAnimationScreenshotFixtureMetadata[] = [];
  const seenShotIds = new Set<string>();
  const count = options.count ?? 3;
  const pathPrefix = options.pathPrefix ?? "artifacts/screenshots";
  for (const item of bridgePackage.renderQueue.items) {
    const shotId = item.shotId ?? `shot-${fixtures.length + 1}`;
    if (seenShotIds.has(shotId)) continue;
    seenShotIds.add(shotId);
    const time = item.time;
    const screenshot = screenshots.find((candidate) => samePromptAnimationEvidenceTime(candidate.time, time));
    const caption = bridgePackage.artifacts.captionTrack?.cues.find(
      (cue) => time >= cue.startTime && time < cue.endTime
    );
    const viseme = bridgePackage.artifacts.visemes?.cues.find((cue) => time >= cue.startTime && time < cue.endTime);
    fixtures.push({
      id: `${shotId}:${time.toFixed(3)}s:screenshot-fixture`,
      shotId,
      renderQueueItemId: item.id,
      time,
      frame: item.frame ?? promptAnimationFrameAtTime(time, bridgePackage.masterClock.frameRate),
      path: screenshot?.path ?? `${pathPrefix}/${shotId}-${time.toFixed(3)}s.png`,
      ...(item.sourceSceneState?.sceneStateId ? { sourceSceneStateId: item.sourceSceneState.sceneStateId } : {}),
      auraVoiceTimestamp: item.sourceSceneState?.auraVoiceTimestamp ?? time,
      ...(item.sourceSceneState?.deterministicSeed ? { deterministicSeed: item.sourceSceneState.deterministicSeed } : {}),
      expectedWidth: bridgePackage.artifacts.episodePlan.runtime.resolution.width,
      expectedHeight: bridgePackage.artifacts.episodePlan.runtime.resolution.height,
      ...(caption ? { captionCueId: caption.captionId } : {}),
      ...(viseme ? { visemeCueId: viseme.id } : {}),
      notes: ["Fixture metadata only; capture hash must be filled after deterministic screenshot render."]
    });
    if (fixtures.length >= count) break;
  }
  return fixtures;
}

function maxIssueFrame(issues: readonly PromptAnimationValidationIssue[], codeIncludes: string): number {
  let maxFrame = 0;
  for (const issue of issues) {
    if (!issue.code.includes(codeIncludes)) continue;
    maxFrame = Math.max(maxFrame, issue.frame ?? 0);
  }
  return maxFrame;
}

function samePromptAnimationEvidenceTime(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.000001;
}
