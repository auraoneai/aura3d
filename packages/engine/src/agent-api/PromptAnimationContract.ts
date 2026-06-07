import type { AuraAssetRef, AuraColor, AuraSceneNode, AuraVec3 } from "./index.js";

export const promptAnimationContractVersion = "auravoice-aura3d-prompt-animation/v1" as const;
export const promptAnimationLegacyContractVersion = "aura-prompt-animation/1.0.7" as const;

export const promptAnimationContractCompatibilityAdapters = [
  {
    from: promptAnimationLegacyContractVersion,
    to: promptAnimationContractVersion,
    adapterId: "aura-prompt-animation-1-0-7-to-auravoice-v1"
  }
] as const;

export type PromptAnimationContractVersion = typeof promptAnimationContractVersion;
export type PromptAnimationId = string;
export type PromptAnimationSeconds = number;
export type PromptAnimationFrameRate = number;
export type PromptAnimationLanguageCode = string;

export type PromptAnimationArtifactKind =
  | "episode.plan"
  | "story-bible"
  | "storyboard"
  | "shot-timeline"
  | "dialogue-track"
  | "caption-track"
  | "visemes"
  | "audio-stems"
  | "dub-map"
  | "cartoon-performance"
  | "render-queue"
  | "render-output-package"
  | "prompt-animation-evidence";

export type PromptAnimationIssueSeverity = "info" | "warning" | "error";

export interface PromptAnimationValidationIssue {
  readonly severity: PromptAnimationIssueSeverity;
  readonly code: string;
  readonly message: string;
  readonly path?: string | undefined;
  readonly frame?: number | undefined;
  readonly time?: PromptAnimationSeconds | undefined;
}

export interface PromptAnimationArtifactBase<TArtifact extends PromptAnimationArtifactKind> {
  readonly artifact: TArtifact;
  readonly contractId: PromptAnimationContractVersion | string;
  readonly episodeId: PromptAnimationId;
  readonly generatedAt?: string | undefined;
}

export interface PromptAnimationContractCompatibilityResult {
  readonly accepted: boolean;
  readonly current: boolean;
  readonly adapterId?: string | undefined;
}

export function resolvePromptAnimationContractCompatibility(
  contractId: string
): PromptAnimationContractCompatibilityResult {
  if (contractId === promptAnimationContractVersion) {
    return {
      accepted: true,
      current: true
    };
  }
  const adapter = promptAnimationContractCompatibilityAdapters.find((candidate) => candidate.from === contractId);
  if (adapter) {
    return {
      accepted: true,
      current: false,
      adapterId: adapter.adapterId
    };
  }
  return {
    accepted: false,
    current: false
  };
}

export function validatePromptAnimationArtifactContract(
  artifact: PromptAnimationArtifactBase<PromptAnimationArtifactKind>,
  path: string = artifact.artifact
): readonly PromptAnimationValidationIssue[] {
  const compatibility = resolvePromptAnimationContractCompatibility(artifact.contractId);
  if (compatibility.current) return [];
  if (compatibility.accepted) {
    return [
      createPromptAnimationIssue(
        "warning",
        "prompt-animation-contract-adapter-used",
        `Artifact "${artifact.artifact}" uses legacy contract "${artifact.contractId}" through adapter "${compatibility.adapterId}".`,
        { path: `${path}.contractId` }
      )
    ];
  }
  return [
    createPromptAnimationIssue(
      "error",
      "prompt-animation-contract-unknown",
      `Artifact "${artifact.artifact}" uses unknown prompt-animation contract "${artifact.contractId}". Expected "${promptAnimationContractVersion}".`,
      { path: `${path}.contractId` }
    )
  ];
}

export interface PromptAnimationResolution {
  readonly width: number;
  readonly height: number;
}

export interface PromptAnimationRuntimeSpec {
  readonly duration: PromptAnimationSeconds;
  readonly frameRate: PromptAnimationFrameRate;
  readonly resolution: PromptAnimationResolution;
  readonly aspectRatio?: "16:9" | "9:16" | "1:1" | "4:5" | "custom" | undefined;
  readonly reducedMotion?: boolean | undefined;
  readonly highContrast?: boolean | undefined;
  readonly maxTimingDriftFrames?: number | undefined;
}

export type PromptAnimationAccessibilityProofStatus = "pass" | "warn" | "fail" | "not-evaluated";

export interface PromptAnimationCaptionAccessibilityProof {
  readonly required: boolean;
  readonly enabled: boolean;
  readonly language?: PromptAnimationLanguageCode | undefined;
  readonly lineSafeMaxChars: number;
  readonly minDurationSeconds: PromptAnimationSeconds;
  readonly maxTimingDriftFrames: number;
  readonly status: PromptAnimationAccessibilityProofStatus;
  readonly notes?: readonly string[] | undefined;
}

export interface PromptAnimationReducedMotionAccessibilityProof {
  readonly defaultEnabled: boolean;
  readonly runtimeToggleRequired: boolean;
  readonly maxCameraShake: number;
  readonly maxFlashFrequencyHz: number;
  readonly status: PromptAnimationAccessibilityProofStatus;
  readonly notes?: readonly string[] | undefined;
}

export interface PromptAnimationHighContrastAccessibilityProof {
  readonly defaultEnabled: boolean;
  readonly minTextContrastRatio: number;
  readonly backgroundPlateRequired: boolean;
  readonly status: PromptAnimationAccessibilityProofStatus;
  readonly notes?: readonly string[] | undefined;
}

export interface PromptAnimationAccessibilityProofMetadata {
  readonly captions: PromptAnimationCaptionAccessibilityProof;
  readonly reducedMotion: PromptAnimationReducedMotionAccessibilityProof;
  readonly highContrast: PromptAnimationHighContrastAccessibilityProof;
  readonly notes?: readonly string[] | undefined;
}

export interface PromptAnimationSafetyMetadata {
  readonly childSafe: boolean;
  readonly flashing: "none" | "reduced" | "review-required";
  readonly violence: "none" | "cartoon" | "review-required";
  readonly weapons: "none" | "stylized" | "review-required";
  readonly adultThemes: "none" | "review-required";
  readonly gore: "none";
  readonly captionRequired: boolean;
  readonly reducedMotionDefault: boolean;
  readonly highContrastDefault?: boolean | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface PromptAnimationProductionMetadata {
  readonly sourcePrompt?: string | undefined;
  readonly createdBy?: string | undefined;
  readonly target?: "youtube" | "youtube-shorts" | "web" | "internal-review" | undefined;
  readonly toolVersions?: Record<string, string> | undefined;
  readonly reviewStatus?: "draft" | "needs-review" | "approved" | undefined;
  readonly notes?: readonly string[] | undefined;
}

export type PromptAnimationAssetMode = "source-only" | "placeholder" | "typed-assets" | "mixed";
export type PromptAnimationMotionMode = "source-only" | "static-preview" | "timeline-driven" | "clip-driven" | "performance-driven";
export type PromptAnimationRenderOutputMode = "source-only" | "preview-only" | "render-ready" | "publish-ready";
export type PromptAnimationReviewStatus = "not-reviewed" | "needs-review" | "approved" | "rejected";
export type PromptAnimationPublishTarget = "none" | "internal-review" | "web" | "youtube" | "youtube-shorts";
export type PromptAnimationReadinessStatus = "source-only" | "preview-only" | "render-ready" | "publish-ready";

export interface PromptAnimationEpisodeReadiness {
  readonly assetMode: PromptAnimationAssetMode;
  readonly motionMode: PromptAnimationMotionMode;
  readonly renderOutputMode: PromptAnimationRenderOutputMode;
  readonly reviewStatus: PromptAnimationReviewStatus;
  readonly publishTarget: PromptAnimationPublishTarget;
  readonly status: PromptAnimationReadinessStatus;
  readonly sourceOnlyAcceptedAsPublishProof: false;
  readonly requiresHumanReview: boolean;
  readonly notes?: readonly string[] | undefined;
}

export interface PromptAnimationYouTubeDraftMetadata {
  readonly title: string;
  readonly description?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly madeForKids?: boolean | undefined;
  readonly thumbnailCaptureTime?: PromptAnimationSeconds | undefined;
  readonly defaultLanguage?: PromptAnimationLanguageCode | undefined;
  readonly privacyStatus?: "private" | "unlisted" | "public" | undefined;
  readonly categoryId?: string | undefined;
  readonly playlistId?: string | undefined;
}

export type PromptAnimationCharacterRole =
  | "host"
  | "narrator"
  | "hero"
  | "sidekick"
  | "guest"
  | "background"
  | "prop-character";

export type PromptAnimationMouthFallback = "none" | "primitive-mouth-card" | "jaw-bone" | "blendshape";

export interface PromptAnimationCharacterRig {
  readonly asset?: AuraAssetRef<"model"> | undefined;
  readonly facing?: "left" | "right" | "camera" | "three-quarter" | undefined;
  readonly scale?: number | undefined;
  readonly mouthFallback: PromptAnimationMouthFallback;
  readonly blendshapeMap?: Record<string, string> | undefined;
  readonly animationClips?: readonly string[] | undefined;
}

export interface PromptAnimationCharacter {
  readonly id: PromptAnimationId;
  readonly name: string;
  readonly role: PromptAnimationCharacterRole;
  readonly voiceId?: string | undefined;
  readonly language?: PromptAnimationLanguageCode | undefined;
  readonly style?: string | undefined;
  readonly color?: AuraColor | undefined;
  readonly rig: PromptAnimationCharacterRig;
  readonly safetyNotes?: readonly string[] | undefined;
}

export interface PromptAnimationLocation {
  readonly id: PromptAnimationId;
  readonly name: string;
  readonly description?: string | undefined;
  readonly mood?: string | undefined;
  readonly colorScript?: readonly AuraColor[] | undefined;
  readonly sceneNodes?: readonly AuraSceneNode[] | undefined;
  readonly anchorPosition?: AuraVec3 | undefined;
  readonly continuityNotes?: readonly string[] | undefined;
}

export type PromptAnimationPropRole = "hero-prop" | "set-dressing" | "interactive" | "background" | "fx-source";

export interface PromptAnimationProp {
  readonly id: PromptAnimationId;
  readonly name: string;
  readonly role: PromptAnimationPropRole | string;
  readonly description?: string | undefined;
  readonly ownerCharacterId?: PromptAnimationId | undefined;
  readonly locationId?: PromptAnimationId | undefined;
  readonly asset?: AuraAssetRef<"model"> | undefined;
  readonly primitiveFallback?: string | undefined;
  readonly styleNotes?: readonly string[] | undefined;
  readonly safetyNotes?: readonly string[] | undefined;
}

export interface PromptAnimationStyleGuide {
  readonly visualStyle: string;
  readonly palette: readonly AuraColor[];
  readonly shapeLanguage: string;
  readonly lighting: string;
  readonly cameraLanguage: string;
  readonly motionRules: readonly string[];
  readonly captionStyle: string;
  readonly continuityRules?: readonly string[] | undefined;
}

export interface PromptAnimationShotListItem {
  readonly shotId: PromptAnimationId;
  readonly sceneId: PromptAnimationId;
  readonly locationId: PromptAnimationId;
  readonly purpose: string;
  readonly characters: readonly PromptAnimationId[];
  readonly props?: readonly PromptAnimationId[] | undefined;
  readonly startTime?: PromptAnimationSeconds | undefined;
  readonly endTime?: PromptAnimationSeconds | undefined;
  readonly duration?: PromptAnimationSeconds | undefined;
  readonly camera: string;
  readonly captionIds?: readonly PromptAnimationId[] | undefined;
  readonly continuityNotes?: readonly string[] | undefined;
}

export interface PromptAnimationStoryBible extends PromptAnimationArtifactBase<"story-bible"> {
  readonly title: string;
  readonly logline?: string | undefined;
  readonly characters: readonly PromptAnimationCharacter[];
  readonly locations: readonly PromptAnimationLocation[];
  readonly props: readonly PromptAnimationProp[];
  readonly styleGuide: PromptAnimationStyleGuide;
  readonly shotList: readonly PromptAnimationShotListItem[];
  readonly continuityRules?: readonly string[] | undefined;
}

export interface PromptAnimationStoryBibleInput {
  readonly episodeId: PromptAnimationId;
  readonly title: string;
  readonly logline?: string | undefined;
  readonly characters: readonly PromptAnimationCharacter[];
  readonly locations: readonly PromptAnimationLocation[];
  readonly props?: readonly PromptAnimationProp[] | undefined;
  readonly styleGuide: PromptAnimationStyleGuide;
  readonly shotList: readonly PromptAnimationShotListItem[];
  readonly continuityRules?: readonly string[] | undefined;
  readonly generatedAt?: string | undefined;
}

export interface PromptAnimationEpisodePlan extends PromptAnimationArtifactBase<"episode.plan"> {
  readonly title: string;
  readonly language: PromptAnimationLanguageCode;
  readonly runtime: PromptAnimationRuntimeSpec;
  readonly characters: readonly PromptAnimationCharacter[];
  readonly locations: readonly PromptAnimationLocation[];
  readonly safety: PromptAnimationSafetyMetadata;
  readonly accessibilityProof?: PromptAnimationAccessibilityProofMetadata | undefined;
  readonly production: PromptAnimationProductionMetadata;
  readonly readiness?: PromptAnimationEpisodeReadiness | undefined;
  readonly youtube?: PromptAnimationYouTubeDraftMetadata | undefined;
}

export interface PromptAnimationStoryboardShot {
  readonly id: PromptAnimationId;
  readonly shotId: PromptAnimationId;
  readonly storyBeat: string;
  readonly characters: readonly PromptAnimationId[];
  readonly props?: readonly string[] | undefined;
  readonly mood?: string | undefined;
  readonly continuity?: readonly string[] | undefined;
  readonly visualIntent: string;
  readonly suggestedDuration?: PromptAnimationSeconds | undefined;
}

export interface PromptAnimationStoryboardScene {
  readonly id: PromptAnimationId;
  readonly sceneId: PromptAnimationId;
  readonly locationId: PromptAnimationId;
  readonly storyBeat: string;
  readonly mood?: string | undefined;
  readonly continuity?: readonly string[] | undefined;
  readonly shots: readonly PromptAnimationStoryboardShot[];
}

export interface PromptAnimationStoryboard extends PromptAnimationArtifactBase<"storyboard"> {
  readonly title: string;
  readonly scenes: readonly PromptAnimationStoryboardScene[];
}

export interface PromptAnimationEpisodePlanInput {
  readonly episodeId: PromptAnimationId;
  readonly title: string;
  readonly language: PromptAnimationLanguageCode;
  readonly runtime: PromptAnimationRuntimeSpec;
  readonly characters: readonly PromptAnimationCharacter[];
  readonly locations: readonly PromptAnimationLocation[];
  readonly safety?: Partial<PromptAnimationSafetyMetadata> | undefined;
  readonly accessibilityProof?: PromptAnimationAccessibilityProofMetadata | undefined;
  readonly production?: PromptAnimationProductionMetadata | undefined;
  readonly readiness?: PromptAnimationEpisodeReadiness | undefined;
  readonly youtube?: PromptAnimationYouTubeDraftMetadata | undefined;
  readonly generatedAt?: string | undefined;
}

export const promptAnimationChildSafeDefaults: PromptAnimationSafetyMetadata = {
  childSafe: true,
  flashing: "reduced",
  violence: "none",
  weapons: "none",
  adultThemes: "none",
  gore: "none",
  captionRequired: true,
  reducedMotionDefault: true,
  highContrastDefault: true,
  notes: ["Default Aura3D prompt-animation contract avoids flashing, gore, realistic weapons, and adult themes."]
};

export function createPromptAnimationAccessibilityProofMetadata(
  input: {
    readonly language?: PromptAnimationLanguageCode | undefined;
    readonly captionRequired?: boolean | undefined;
    readonly captionsEnabled?: boolean | undefined;
    readonly reducedMotionDefault?: boolean | undefined;
    readonly highContrastDefault?: boolean | undefined;
    readonly maxTimingDriftFrames?: number | undefined;
    readonly lineSafeMaxChars?: number | undefined;
    readonly minCaptionDurationSeconds?: PromptAnimationSeconds | undefined;
    readonly minTextContrastRatio?: number | undefined;
    readonly notes?: readonly string[] | undefined;
  } = {}
): PromptAnimationAccessibilityProofMetadata {
  const captionRequired = input.captionRequired ?? true;
  const captionsEnabled = input.captionsEnabled ?? captionRequired;
  const reducedMotionDefault = input.reducedMotionDefault ?? true;
  const highContrastDefault = input.highContrastDefault ?? true;
  return {
    captions: {
      required: captionRequired,
      enabled: captionsEnabled,
      ...(input.language ? { language: input.language } : {}),
      lineSafeMaxChars: input.lineSafeMaxChars ?? 42,
      minDurationSeconds: input.minCaptionDurationSeconds ?? 1,
      maxTimingDriftFrames: input.maxTimingDriftFrames ?? 1,
      status: captionRequired && !captionsEnabled ? "fail" : "pass",
      notes: ["Captions must be line-safe, timed to dialogue, and readable over a caption plate."]
    },
    reducedMotion: {
      defaultEnabled: reducedMotionDefault,
      runtimeToggleRequired: true,
      maxCameraShake: reducedMotionDefault ? 0.1 : 0.35,
      maxFlashFrequencyHz: 3,
      status: reducedMotionDefault ? "pass" : "warn",
      notes: ["Reduced-motion playback must avoid fast camera shakes, hard flashes, and rapid scale pulses."]
    },
    highContrast: {
      defaultEnabled: highContrastDefault,
      minTextContrastRatio: input.minTextContrastRatio ?? 4.5,
      backgroundPlateRequired: true,
      status: highContrastDefault ? "pass" : "warn",
      notes: ["Caption and HUD text should render over a high-contrast plate by default."]
    },
    ...(input.notes ? { notes: input.notes } : {})
  };
}

export function definePromptAnimationEpisode<const TPlan extends PromptAnimationEpisodePlan>(plan: TPlan): TPlan {
  return plan;
}

export function definePromptEpisodePlan<const TPlan extends PromptAnimationEpisodePlan>(plan: TPlan): TPlan {
  return definePromptAnimationEpisode(plan);
}

export function definePromptAnimationStoryboard<const TStoryboard extends PromptAnimationStoryboard>(
  storyboard: TStoryboard
): TStoryboard {
  return storyboard;
}

export function definePromptAnimationStoryBible<const TStoryBible extends PromptAnimationStoryBible>(
  storyBible: TStoryBible
): TStoryBible {
  return storyBible;
}

export function storyboard<const TStoryboard extends PromptAnimationStoryboard>(input: TStoryboard): TStoryboard {
  return definePromptAnimationStoryboard(input);
}

export function createPromptAnimationStoryBible(input: PromptAnimationStoryBibleInput): PromptAnimationStoryBible {
  return {
    artifact: "story-bible",
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    title: input.title,
    ...(input.logline ? { logline: input.logline } : {}),
    characters: input.characters,
    locations: input.locations,
    props: input.props ?? [],
    styleGuide: input.styleGuide,
    shotList: input.shotList,
    ...(input.continuityRules ? { continuityRules: input.continuityRules } : {}),
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };
}

export function createPromptAnimationEpisodePlan(input: PromptAnimationEpisodePlanInput): PromptAnimationEpisodePlan {
  const safety = {
    ...promptAnimationChildSafeDefaults,
    ...input.safety
  };
  const production = input.production ?? {};
  return {
    artifact: "episode.plan",
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    title: input.title,
    language: input.language,
    runtime: input.runtime,
    characters: input.characters,
    locations: input.locations,
    safety,
    accessibilityProof:
      input.accessibilityProof ??
      createPromptAnimationAccessibilityProofMetadata({
        language: input.language,
        captionRequired: safety.captionRequired,
        captionsEnabled: safety.captionRequired,
        reducedMotionDefault: input.runtime.reducedMotion ?? safety.reducedMotionDefault,
        highContrastDefault: input.runtime.highContrast ?? safety.highContrastDefault ?? true,
        maxTimingDriftFrames: input.runtime.maxTimingDriftFrames ?? 1
      }),
    production,
    readiness:
      input.readiness ??
      createPromptAnimationEpisodeReadiness({
        assetMode: input.characters.some((character) => character.rig.asset) ? "typed-assets" : "placeholder",
        motionMode: "timeline-driven",
        renderOutputMode: "preview-only",
        reviewStatus: production.reviewStatus === "approved" ? "approved" : "needs-review",
        publishTarget: production.target ?? "internal-review"
      }),
    ...(input.youtube ? { youtube: input.youtube } : {}),
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };
}

export function createPromptEpisodePlan(input: PromptAnimationEpisodePlanInput): PromptAnimationEpisodePlan {
  return createPromptAnimationEpisodePlan(input);
}

export function createPromptAnimationEpisodeReadiness(
  input: Omit<PromptAnimationEpisodeReadiness, "status" | "sourceOnlyAcceptedAsPublishProof" | "requiresHumanReview"> & {
    readonly status?: PromptAnimationReadinessStatus | undefined;
    readonly sourceOnlyAcceptedAsPublishProof?: false | undefined;
    readonly requiresHumanReview?: boolean | undefined;
  }
): PromptAnimationEpisodeReadiness {
  const status = input.status ?? resolvePromptAnimationReadinessStatus(input.renderOutputMode, input.reviewStatus);
  return {
    assetMode: input.assetMode,
    motionMode: input.motionMode,
    renderOutputMode: input.renderOutputMode,
    reviewStatus: input.reviewStatus,
    publishTarget: input.publishTarget,
    status,
    sourceOnlyAcceptedAsPublishProof: false,
    requiresHumanReview: input.requiresHumanReview ?? input.reviewStatus !== "approved",
    ...(input.notes ? { notes: input.notes } : {})
  };
}

export function validatePromptAnimationEpisodeReadiness(
  readiness: PromptAnimationEpisodeReadiness,
  path = "readiness"
): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  if (readiness.sourceOnlyAcceptedAsPublishProof !== false) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "readiness-source-only-publish-proof",
        "Source-only prompt-animation proof cannot be accepted as publish-ready evidence.",
        { path: `${path}.sourceOnlyAcceptedAsPublishProof` }
      )
    );
  }
  if (readiness.status === "publish-ready" && readiness.renderOutputMode !== "publish-ready") {
    issues.push(
      createPromptAnimationIssue("error", "readiness-publish-output-mode", "Publish-ready status requires publish-ready render output.", {
        path: `${path}.renderOutputMode`
      })
    );
  }
  if (readiness.status === "publish-ready" && readiness.reviewStatus !== "approved") {
    issues.push(
      createPromptAnimationIssue("error", "readiness-publish-review", "Publish-ready status requires approved human review.", {
        path: `${path}.reviewStatus`
      })
    );
  }
  if (readiness.status === "publish-ready" && (readiness.assetMode === "source-only" || readiness.assetMode === "placeholder")) {
    issues.push(
      createPromptAnimationIssue("error", "readiness-publish-assets", "Publish-ready status requires typed production assets.", {
        path: `${path}.assetMode`
      })
    );
  }
  if (readiness.status === "publish-ready" && (readiness.motionMode === "source-only" || readiness.motionMode === "static-preview")) {
    issues.push(
      createPromptAnimationIssue("error", "readiness-publish-motion", "Publish-ready status requires timeline, clip, or performance-driven motion.", {
        path: `${path}.motionMode`
      })
    );
  }
  return issues;
}

function resolvePromptAnimationReadinessStatus(
  renderOutputMode: PromptAnimationRenderOutputMode,
  reviewStatus: PromptAnimationReviewStatus
): PromptAnimationReadinessStatus {
  if (renderOutputMode === "source-only") return "source-only";
  if (renderOutputMode === "preview-only") return "preview-only";
  if (renderOutputMode === "render-ready") return "render-ready";
  return reviewStatus === "approved" ? "publish-ready" : "render-ready";
}

export function createPromptAnimationIssue(
  severity: PromptAnimationIssueSeverity,
  code: string,
  message: string,
  details: Omit<PromptAnimationValidationIssue, "severity" | "code" | "message"> = {}
): PromptAnimationValidationIssue {
  return {
    severity,
    code,
    message,
    ...details
  };
}

export function normalizePromptAnimationTime(seconds: number): PromptAnimationSeconds {
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, Number(seconds.toFixed(6)));
}

export function promptAnimationFrameAtTime(seconds: PromptAnimationSeconds, frameRate: PromptAnimationFrameRate): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(frameRate) || frameRate <= 0) return 0;
  return Math.round(seconds * frameRate);
}

export function promptAnimationDriftFrames(seconds: PromptAnimationSeconds, frameRate: PromptAnimationFrameRate): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(frameRate) || frameRate <= 0) return 0;
  return Math.ceil(Math.max(0, seconds) * frameRate - 0.000001);
}

export function promptAnimationTimeAtFrame(frame: number, frameRate: PromptAnimationFrameRate): PromptAnimationSeconds {
  if (!Number.isFinite(frame) || !Number.isFinite(frameRate) || frameRate <= 0) return 0;
  return normalizePromptAnimationTime(frame / frameRate);
}

export function validatePromptAnimationStableIds(
  plan: PromptAnimationEpisodePlan,
  storyboard?: PromptAnimationStoryboard
): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const characterIds = new Set<string>();
  const locationIds = new Set<string>();

  for (const character of plan.characters) {
    if (!character.id) {
      issues.push(createPromptAnimationIssue("error", "character-id-missing", "Character id is required."));
      continue;
    }
    if (characterIds.has(character.id)) {
      issues.push(
        createPromptAnimationIssue("error", "character-id-duplicate", `Duplicate character id "${character.id}".`, {
          path: `characters.${character.id}`
        })
      );
    }
    characterIds.add(character.id);
  }

  for (const location of plan.locations) {
    if (!location.id) {
      issues.push(createPromptAnimationIssue("error", "location-id-missing", "Location id is required."));
      continue;
    }
    if (locationIds.has(location.id)) {
      issues.push(
        createPromptAnimationIssue("error", "location-id-duplicate", `Duplicate location id "${location.id}".`, {
          path: `locations.${location.id}`
        })
      );
    }
    locationIds.add(location.id);
  }

  if (!storyboard) return issues;

  const sceneIds = new Set<string>();
  const shotIds = new Set<string>();
  for (const scene of storyboard.scenes) {
    if (!locationIds.has(scene.locationId)) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "storyboard-location-missing",
          `Storyboard scene "${scene.sceneId}" references missing location "${scene.locationId}".`,
          { path: `storyboard.scenes.${scene.sceneId}.locationId` }
        )
      );
    }
    if (sceneIds.has(scene.sceneId)) {
      issues.push(
        createPromptAnimationIssue("error", "storyboard-scene-id-duplicate", `Duplicate scene id "${scene.sceneId}".`, {
          path: `storyboard.scenes.${scene.sceneId}`
        })
      );
    }
    sceneIds.add(scene.sceneId);

    for (const shot of scene.shots) {
      if (shotIds.has(shot.shotId)) {
        issues.push(
          createPromptAnimationIssue("error", "storyboard-shot-id-duplicate", `Duplicate shot id "${shot.shotId}".`, {
            path: `storyboard.shots.${shot.shotId}`
          })
        );
      }
      shotIds.add(shot.shotId);
      for (const characterId of shot.characters) {
        if (!characterIds.has(characterId)) {
          issues.push(
            createPromptAnimationIssue(
              "error",
              "storyboard-character-missing",
              `Storyboard shot "${shot.shotId}" references missing character "${characterId}".`,
              { path: `storyboard.shots.${shot.shotId}.characters` }
            )
          );
        }
      }
    }
  }

  return issues;
}
