import {
  createPromptAnimationIssue,
  normalizePromptAnimationTime,
  promptAnimationContractVersion,
  type PromptAnimationArtifactBase,
  type PromptAnimationEpisodePlan,
  type PromptAnimationFrameRate,
  type PromptAnimationId,
  type PromptAnimationLanguageCode,
  type PromptAnimationSeconds,
  type PromptAnimationValidationIssue,
  type PromptAnimationYouTubeDraftMetadata
} from "./PromptAnimationContract.js";
import { getShotTimelineCaptureTimes, type ShotTimelineArtifact } from "./ShotTimeline.js";

export interface CartoonViewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor?: number | undefined;
}

export type CartoonRenderOutputKind =
  | "mp4"
  | "webm"
  | "png-sequence"
  | "thumbnail"
  | "caption-vtt"
  | "caption-srt"
  | "timeline-json"
  | "evidence-json"
  | "youtube-metadata";

export interface CartoonRenderOutput {
  readonly id: PromptAnimationId;
  readonly kind: CartoonRenderOutputKind;
  readonly path: string;
  readonly label?: string | undefined;
  readonly codec?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly language?: PromptAnimationLanguageCode | undefined;
  readonly required?: boolean | undefined;
  readonly quality?: "draft" | "review" | "publish" | undefined;
}

export interface CartoonRenderPackageOutputs {
  readonly mp4?: CartoonRenderOutput | undefined;
  readonly webm?: CartoonRenderOutput | undefined;
  readonly captions: readonly CartoonRenderOutput[];
  readonly thumbnail?: CartoonRenderOutput | undefined;
  readonly timelineJson?: CartoonRenderOutput | undefined;
  readonly evidenceJson?: CartoonRenderOutput | undefined;
  readonly youtubeMetadata?: CartoonRenderOutput | undefined;
}

export interface CartoonEvidenceTarget {
  readonly id: PromptAnimationId;
  readonly kind:
    | "screenshot-hash"
    | "timing-drift"
    | "caption-sync"
    | "viseme-sync"
    | "deterministic-capture"
    | "route-health"
    | "accessibility";
  readonly required: boolean;
}

export interface CartoonRenderSceneStateSource {
  readonly source: "aura3d-scene-state";
  readonly sceneStateId: PromptAnimationId;
  readonly route: string;
  readonly time: PromptAnimationSeconds;
  readonly auraVoiceTimestamp: PromptAnimationSeconds;
  readonly frame: number;
  readonly shotId?: PromptAnimationId | undefined;
  readonly deterministicSeed: string;
}

export interface CartoonThumbnailSceneStateCapture {
  readonly id: PromptAnimationId;
  readonly source: "same-aura3d-scene-state";
  readonly outputId: PromptAnimationId;
  readonly outputPath: string;
  readonly route: string;
  readonly time: PromptAnimationSeconds;
  readonly auraVoiceTimestamp: PromptAnimationSeconds;
  readonly frame: number;
  readonly shotId?: PromptAnimationId | undefined;
  readonly sourceSceneStateId: PromptAnimationId;
  readonly deterministicSeed: string;
}

export interface CartoonRenderReviewPackagePaths {
  readonly video: readonly string[];
  readonly captions: readonly string[];
  readonly thumbnail: string;
  readonly evidence: string;
  readonly youtubeDraftMetadata: string;
}

export interface CartoonRenderQueueItem {
  readonly id: PromptAnimationId;
  readonly route: string;
  readonly language: PromptAnimationLanguageCode;
  readonly time: PromptAnimationSeconds;
  readonly frame: number;
  readonly shotId?: PromptAnimationId | undefined;
  readonly viewport: CartoonViewport;
  readonly outputIds: readonly PromptAnimationId[];
  readonly evidenceTargetIds: readonly PromptAnimationId[];
  readonly sourceSceneState?: CartoonRenderSceneStateSource | undefined;
}

export interface CartoonRenderQueueArtifact extends PromptAnimationArtifactBase<"render-queue"> {
  readonly route: string;
  readonly language: PromptAnimationLanguageCode;
  readonly frameRate: PromptAnimationFrameRate;
  readonly viewport: CartoonViewport;
  readonly captureTimes: readonly PromptAnimationSeconds[];
  readonly outputs: readonly CartoonRenderOutput[];
  readonly evidenceTargets: readonly CartoonEvidenceTarget[];
  readonly items: readonly CartoonRenderQueueItem[];
}

export interface CartoonRenderOutputPackageMetadata extends PromptAnimationArtifactBase<"render-output-package"> {
  readonly packageId: PromptAnimationId;
  readonly route: string;
  readonly language: PromptAnimationLanguageCode;
  readonly frameRate: PromptAnimationFrameRate;
  readonly duration: PromptAnimationSeconds;
  readonly viewport: CartoonViewport;
  readonly outputs: CartoonRenderPackageOutputs;
  readonly requiredOutputKinds: readonly CartoonRenderOutputKind[];
  readonly youtubeDraft: PromptAnimationYouTubeDraftMetadata;
  readonly thumbnailCapture: CartoonThumbnailSceneStateCapture;
  readonly reviewPackagePaths: CartoonRenderReviewPackagePaths;
}

export interface CreateCartoonRenderQueueOptions {
  readonly episodePlan: PromptAnimationEpisodePlan;
  readonly shotTimeline: ShotTimelineArtifact;
  readonly route: string;
  readonly viewport?: CartoonViewport | undefined;
  readonly language?: PromptAnimationLanguageCode | undefined;
  readonly captureTimes?: readonly PromptAnimationSeconds[] | undefined;
  readonly outputs?: readonly CartoonRenderOutput[] | undefined;
  readonly evidenceTargets?: readonly CartoonEvidenceTarget[] | undefined;
  readonly generatedAt?: string | undefined;
}

export interface CreateCartoonRenderOutputPackageMetadataOptions {
  readonly episodePlan: PromptAnimationEpisodePlan;
  readonly shotTimeline: ShotTimelineArtifact;
  readonly renderQueue: CartoonRenderQueueArtifact;
  readonly packageId?: PromptAnimationId | undefined;
  readonly youtube?: PromptAnimationYouTubeDraftMetadata | undefined;
  readonly generatedAt?: string | undefined;
}

export const defaultCartoonViewport: CartoonViewport = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1
};

export const defaultCartoonRenderOutputs: readonly CartoonRenderOutput[] = [
  {
    id: "video:mp4",
    kind: "mp4",
    path: "dist/render/episode.mp4",
    label: "H.264 MP4 publish video",
    codec: "h264",
    mimeType: "video/mp4",
    required: true,
    quality: "review"
  },
  {
    id: "video:webm",
    kind: "webm",
    path: "dist/render/episode.webm",
    label: "VP9 WebM web preview",
    codec: "vp9",
    mimeType: "video/webm",
    required: true,
    quality: "review"
  },
  {
    id: "captions:vtt",
    kind: "caption-vtt",
    path: "dist/render/captions.vtt",
    label: "WebVTT captions",
    mimeType: "text/vtt",
    required: true,
    quality: "review"
  },
  {
    id: "captions:srt",
    kind: "caption-srt",
    path: "dist/render/captions.srt",
    label: "SRT captions",
    mimeType: "application/x-subrip",
    required: true,
    quality: "review"
  },
  {
    id: "thumbnail",
    kind: "thumbnail",
    path: "dist/render/thumbnail.webp",
    label: "YouTube thumbnail",
    mimeType: "image/webp",
    required: true,
    quality: "review"
  },
  {
    id: "timeline",
    kind: "timeline-json",
    path: "dist/render/timeline.json",
    label: "Frame-accurate timeline JSON",
    mimeType: "application/json",
    required: true,
    quality: "review"
  },
  {
    id: "evidence",
    kind: "evidence-json",
    path: "dist/render/prompt-animation-evidence.json",
    label: "Publish-readiness evidence JSON",
    mimeType: "application/json",
    required: true,
    quality: "review"
  },
  {
    id: "youtube:draft",
    kind: "youtube-metadata",
    path: "dist/render/youtube-draft.json",
    label: "YouTube draft metadata",
    mimeType: "application/json",
    required: true,
    quality: "draft"
  }
];

export const requiredCartoonRenderPackageOutputKinds: readonly CartoonRenderOutputKind[] = [
  "mp4",
  "webm",
  "thumbnail",
  "timeline-json",
  "evidence-json",
  "youtube-metadata"
];

export const captionCartoonRenderOutputKinds: readonly CartoonRenderOutputKind[] = ["caption-vtt", "caption-srt"];

export const defaultCartoonEvidenceTargets: readonly CartoonEvidenceTarget[] = [
  { id: "screenshot-hashes", kind: "screenshot-hash", required: true },
  { id: "timing-drift", kind: "timing-drift", required: true },
  { id: "caption-sync", kind: "caption-sync", required: true },
  { id: "viseme-sync", kind: "viseme-sync", required: true },
  { id: "deterministic-capture", kind: "deterministic-capture", required: true },
  { id: "route-health", kind: "route-health", required: true },
  { id: "accessibility", kind: "accessibility", required: true }
];

export function defineCartoonRenderQueue<const TQueue extends CartoonRenderQueueArtifact>(queue: TQueue): TQueue {
  return queue;
}

export function createCartoonRenderQueue(options: CreateCartoonRenderQueueOptions): CartoonRenderQueueArtifact {
  const viewport = options.viewport ?? defaultCartoonViewport;
  const outputs = options.outputs ?? defaultCartoonRenderOutputs;
  const evidenceTargets = options.evidenceTargets ?? defaultCartoonEvidenceTargets;
  const captureTimes = normalizeRenderCaptureTimes(
    options.captureTimes && options.captureTimes.length > 0
      ? options.captureTimes
      : getShotTimelineCaptureTimes(options.shotTimeline)
  );
  const outputIds = outputs.map((output) => output.id);
  const evidenceTargetIds = evidenceTargets.map((target) => target.id);
  const frameRate = options.shotTimeline.frameRate || options.episodePlan.runtime.frameRate;

  const items = captureTimes.map((time) => {
    const shot = options.shotTimeline.shots.find((candidate) => time >= candidate.startTime && time <= candidate.endTime);
    const frame = Math.round(time * frameRate);
    return {
      id: `capture:${frame}`,
      route: options.route,
      language: options.language ?? options.episodePlan.language,
      time,
      frame,
      ...(shot ? { shotId: shot.shotId } : {}),
      viewport,
      outputIds,
      evidenceTargetIds,
      sourceSceneState: createCartoonRenderSceneStateSource({
        episodeId: options.episodePlan.episodeId,
        route: options.route,
        time,
        frame,
        ...(shot ? { shotId: shot.shotId } : {})
      })
    };
  });

  return {
    artifact: "render-queue",
    contractId: promptAnimationContractVersion,
    episodeId: options.episodePlan.episodeId,
    route: options.route,
    language: options.language ?? options.episodePlan.language,
    frameRate,
    viewport,
    captureTimes,
    outputs,
    evidenceTargets,
    items,
    ...(options.generatedAt ? { generatedAt: options.generatedAt } : {})
  };
}

export function createCartoonRenderOutputPackageMetadata(
  options: CreateCartoonRenderOutputPackageMetadataOptions
): CartoonRenderOutputPackageMetadata {
  const firstCaptureTime = options.renderQueue.captureTimes[0] ?? 0;
  const youtubeDraft: PromptAnimationYouTubeDraftMetadata = options.youtube ??
    options.episodePlan.youtube ?? {
      title: options.episodePlan.title,
      ...(options.episodePlan.production.sourcePrompt
        ? { description: options.episodePlan.production.sourcePrompt }
        : {}),
      tags: ["Aura3D", "cartoon", "prompt-animation"],
      madeForKids: options.episodePlan.safety.childSafe,
      thumbnailCaptureTime: firstCaptureTime,
      defaultLanguage: options.episodePlan.language,
      privacyStatus: "private"
    };
  const packageId = options.packageId ?? `${options.episodePlan.episodeId}:render-package`;
  const outputs = collectCartoonRenderPackageOutputs(options.renderQueue.outputs);
  const thumbnailCapture = createCartoonThumbnailSceneStateCapture(packageId, options.renderQueue, outputs, youtubeDraft);

  return {
    artifact: "render-output-package",
    contractId: promptAnimationContractVersion,
    episodeId: options.episodePlan.episodeId,
    packageId,
    route: options.renderQueue.route,
    language: options.renderQueue.language,
    frameRate: options.renderQueue.frameRate,
    duration: options.shotTimeline.duration || options.episodePlan.runtime.duration,
    viewport: options.renderQueue.viewport,
    outputs,
    requiredOutputKinds: [...requiredCartoonRenderPackageOutputKinds, "caption-vtt"],
    youtubeDraft,
    thumbnailCapture,
    reviewPackagePaths: createCartoonRenderReviewPackagePaths(outputs),
    ...(options.generatedAt ? { generatedAt: options.generatedAt } : {})
  };
}

export function normalizeRenderCaptureTimes(times: readonly PromptAnimationSeconds[]): readonly PromptAnimationSeconds[] {
  const unique = new Set<number>();
  for (const time of times) unique.add(normalizePromptAnimationTime(time));
  return [...unique].sort((a, b) => a - b);
}

export function validateCartoonRenderQueue(queue: CartoonRenderQueueArtifact): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  if (!queue.route) {
    issues.push(createPromptAnimationIssue("error", "render-route-missing", "Render queue route is required."));
  }
  if (queue.frameRate <= 0) {
    issues.push(createPromptAnimationIssue("error", "render-frame-rate", "Render queue frame rate must be positive."));
  }
  if (queue.captureTimes.length === 0) {
    issues.push(createPromptAnimationIssue("error", "render-capture-times-missing", "Render queue needs capture times."));
  }
  if (queue.outputs.length === 0) {
    issues.push(createPromptAnimationIssue("error", "render-outputs-missing", "Render queue needs at least one output."));
  }
  issues.push(...validateCartoonRenderOutputs(queue.outputs));
  for (const item of queue.items) {
    if (!item.outputIds.length) {
      issues.push(
        createPromptAnimationIssue("error", "render-item-output-missing", `Render item "${item.id}" has no outputs.`, {
          path: `items.${item.id}`,
          time: item.time,
          frame: item.frame
        })
      );
    }
    if (!item.sourceSceneState) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "render-item-scene-state-missing",
          `Render item "${item.id}" must bind capture to an Aura3D scene state.`,
          { path: `items.${item.id}.sourceSceneState`, time: item.time, frame: item.frame }
        )
      );
      continue;
    }
    if (!item.sourceSceneState.sceneStateId) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "render-item-scene-state-id-missing",
          `Render item "${item.id}" source scene state is missing a stable id.`,
          { path: `items.${item.id}.sourceSceneState.sceneStateId`, time: item.time, frame: item.frame }
        )
      );
    }
    if (item.sourceSceneState.frame !== item.frame) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "render-item-scene-state-frame-mismatch",
          `Render item "${item.id}" scene state frame must match the render frame.`,
          { path: `items.${item.id}.sourceSceneState.frame`, time: item.time, frame: item.frame }
        )
      );
    }
    if (!sameRenderTime(item.sourceSceneState.time, item.time) || !sameRenderTime(item.sourceSceneState.auraVoiceTimestamp, item.time)) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "render-item-auravoice-timestamp-mismatch",
          `Render item "${item.id}" must capture from the exact AuraVoice timestamp.`,
          { path: `items.${item.id}.sourceSceneState.auraVoiceTimestamp`, time: item.time, frame: item.frame }
        )
      );
    }
    if (item.shotId && item.sourceSceneState.shotId !== item.shotId) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "render-item-scene-state-shot-mismatch",
          `Render item "${item.id}" scene state must preserve shot id "${item.shotId}".`,
          { path: `items.${item.id}.sourceSceneState.shotId`, time: item.time, frame: item.frame }
        )
      );
    }
  }
  return issues;
}

export function collectCartoonRenderPackageOutputs(outputs: readonly CartoonRenderOutput[]): CartoonRenderPackageOutputs {
  return {
    mp4: outputs.find((output) => output.kind === "mp4"),
    webm: outputs.find((output) => output.kind === "webm"),
    captions: outputs.filter((output) => output.kind === "caption-vtt" || output.kind === "caption-srt"),
    thumbnail: outputs.find((output) => output.kind === "thumbnail"),
    timelineJson: outputs.find((output) => output.kind === "timeline-json"),
    evidenceJson: outputs.find((output) => output.kind === "evidence-json"),
    youtubeMetadata: outputs.find((output) => output.kind === "youtube-metadata")
  };
}

export function createCartoonRenderReviewPackagePaths(outputs: CartoonRenderPackageOutputs): CartoonRenderReviewPackagePaths {
  return {
    video: [outputs.mp4?.path, outputs.webm?.path].filter(isNonEmptyString),
    captions: outputs.captions.map((output) => output.path).filter(isNonEmptyString),
    thumbnail: outputs.thumbnail?.path ?? "",
    evidence: outputs.evidenceJson?.path ?? "",
    youtubeDraftMetadata: outputs.youtubeMetadata?.path ?? ""
  };
}

export function validateCartoonRenderOutputs(
  outputs: readonly CartoonRenderOutput[],
  pathPrefix = "outputs"
): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const outputIds = new Set<string>();
  const outputKinds = new Set<CartoonRenderOutputKind>();

  outputs.forEach((output, index) => {
    if (!output.id) {
      issues.push(
        createPromptAnimationIssue("error", "render-output-id-missing", `Render output at index ${index} is missing an id.`, {
          path: `${pathPrefix}.${index}.id`
        })
      );
    }
    if (outputIds.has(output.id)) {
      issues.push(
        createPromptAnimationIssue("error", "render-output-id-duplicate", `Duplicate render output id "${output.id}".`, {
          path: `${pathPrefix}.${index}.id`
        })
      );
    }
    outputIds.add(output.id);
    outputKinds.add(output.kind);

    if (!output.path) {
      issues.push(
        createPromptAnimationIssue("error", "render-output-path-missing", `Render output "${output.id}" has no path.`, {
          path: `${pathPrefix}.${index}.path`
        })
      );
    }
  });

  for (const kind of requiredCartoonRenderPackageOutputKinds) {
    if (!outputKinds.has(kind)) {
      issues.push(createPromptAnimationIssue("error", `render-output-${kind}-missing`, `Render package requires ${kind} output.`));
    }
  }
  if (!captionCartoonRenderOutputKinds.some((kind) => outputKinds.has(kind))) {
    issues.push(createPromptAnimationIssue("error", "render-output-captions-missing", "Render package requires captions output."));
  }

  return issues;
}

export function validateCartoonRenderOutputPackageMetadata(
  metadata: CartoonRenderOutputPackageMetadata
): readonly PromptAnimationValidationIssue[] {
  const outputs = [
    metadata.outputs.mp4,
    metadata.outputs.webm,
    ...metadata.outputs.captions,
    metadata.outputs.thumbnail,
    metadata.outputs.timelineJson,
    metadata.outputs.evidenceJson,
    metadata.outputs.youtubeMetadata
  ].filter((output): output is CartoonRenderOutput => Boolean(output));
  const issues: PromptAnimationValidationIssue[] = [...validateCartoonRenderOutputs(outputs, "renderOutputPackage.outputs")];

  if (!metadata.packageId) {
    issues.push(createPromptAnimationIssue("error", "render-package-id-missing", "Render output package id is required."));
  }
  if (!metadata.youtubeDraft.title.trim()) {
    issues.push(
      createPromptAnimationIssue("error", "youtube-draft-title-missing", "YouTube draft metadata requires a title.", {
        path: "renderOutputPackage.youtubeDraft.title"
      })
    );
  }
  if (metadata.youtubeDraft.thumbnailCaptureTime === undefined) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "youtube-draft-thumbnail-time-missing",
        "YouTube draft metadata requires a thumbnail capture time.",
        { path: "renderOutputPackage.youtubeDraft.thumbnailCaptureTime" }
      )
    );
  }
  if (metadata.youtubeDraft.thumbnailCaptureTime !== undefined) {
    const thumbnailTime = normalizePromptAnimationTime(metadata.youtubeDraft.thumbnailCaptureTime);
    if (!sameRenderTime(metadata.thumbnailCapture.time, thumbnailTime)) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "thumbnail-capture-time-mismatch",
          "Thumbnail capture must use the YouTube draft thumbnail capture time.",
          { path: "renderOutputPackage.thumbnailCapture.time", time: metadata.thumbnailCapture.time }
        )
      );
    }
  }
  if (!metadata.thumbnailCapture.sourceSceneStateId) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "thumbnail-capture-scene-state-missing",
        "Thumbnail capture must reference the Aura3D scene state used for the rendered frame.",
        { path: "renderOutputPackage.thumbnailCapture.sourceSceneStateId", time: metadata.thumbnailCapture.time }
      )
    );
  }
  if (metadata.outputs.thumbnail?.path && metadata.thumbnailCapture.outputPath !== metadata.outputs.thumbnail.path) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "thumbnail-capture-output-path-mismatch",
        "Thumbnail capture output path must match the review package thumbnail path.",
        { path: "renderOutputPackage.thumbnailCapture.outputPath", time: metadata.thumbnailCapture.time }
      )
    );
  }
  if (metadata.reviewPackagePaths.video.length === 0) {
    issues.push(createPromptAnimationIssue("error", "review-package-video-paths-missing", "Review package requires video output paths."));
  }
  if (metadata.reviewPackagePaths.captions.length === 0) {
    issues.push(
      createPromptAnimationIssue("error", "review-package-caption-paths-missing", "Review package requires caption output paths.")
    );
  }
  if (!metadata.reviewPackagePaths.thumbnail) {
    issues.push(createPromptAnimationIssue("error", "review-package-thumbnail-path-missing", "Review package requires a thumbnail path."));
  }
  if (!metadata.reviewPackagePaths.evidence) {
    issues.push(createPromptAnimationIssue("error", "review-package-evidence-path-missing", "Review package requires an evidence path."));
  }
  if (!metadata.reviewPackagePaths.youtubeDraftMetadata) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "review-package-youtube-metadata-path-missing",
        "Review package requires a YouTube draft metadata path."
      )
    );
  }

  return issues;
}

function createCartoonRenderSceneStateSource(input: {
  readonly episodeId: PromptAnimationId;
  readonly route: string;
  readonly time: PromptAnimationSeconds;
  readonly frame: number;
  readonly shotId?: PromptAnimationId | undefined;
}): CartoonRenderSceneStateSource {
  const stableShotId = input.shotId ?? "timeline";
  const normalizedTime = normalizePromptAnimationTime(input.time);
  return {
    source: "aura3d-scene-state",
    sceneStateId: `${input.episodeId}:${stableShotId}:frame-${input.frame}:scene-state`,
    route: input.route,
    time: normalizedTime,
    auraVoiceTimestamp: normalizedTime,
    frame: input.frame,
    ...(input.shotId ? { shotId: input.shotId } : {}),
    deterministicSeed: `${input.episodeId}:${stableShotId}:frame-${input.frame}:time-${normalizedTime.toFixed(6)}`
  };
}

function createCartoonThumbnailSceneStateCapture(
  packageId: PromptAnimationId,
  renderQueue: CartoonRenderQueueArtifact,
  outputs: CartoonRenderPackageOutputs,
  youtubeDraft: PromptAnimationYouTubeDraftMetadata
): CartoonThumbnailSceneStateCapture {
  const requestedTime = normalizePromptAnimationTime(youtubeDraft.thumbnailCaptureTime ?? renderQueue.captureTimes[0] ?? 0);
  const item = renderQueue.items.find((candidate) => sameRenderTime(candidate.time, requestedTime)) ?? renderQueue.items[0];
  const fallbackFrame = Math.round(requestedTime * renderQueue.frameRate);
  const sourceSceneState =
    item?.sourceSceneState ??
    createCartoonRenderSceneStateSource({
      episodeId: renderQueue.episodeId,
      route: renderQueue.route,
      time: requestedTime,
      frame: fallbackFrame,
      ...(item?.shotId ? { shotId: item.shotId } : {})
    });

  return {
    id: `${packageId}:thumbnail-capture`,
    source: "same-aura3d-scene-state",
    outputId: outputs.thumbnail?.id ?? "thumbnail",
    outputPath: outputs.thumbnail?.path ?? "",
    route: item?.route ?? renderQueue.route,
    time: item?.time ?? requestedTime,
    auraVoiceTimestamp: sourceSceneState.auraVoiceTimestamp,
    frame: item?.frame ?? fallbackFrame,
    ...(sourceSceneState.shotId ? { shotId: sourceSceneState.shotId } : {}),
    sourceSceneStateId: sourceSceneState.sceneStateId,
    deterministicSeed: sourceSceneState.deterministicSeed
  };
}

function sameRenderTime(a: PromptAnimationSeconds, b: PromptAnimationSeconds): boolean {
  return Math.abs(normalizePromptAnimationTime(a) - normalizePromptAnimationTime(b)) <= 0.000001;
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value && value.trim());
}
