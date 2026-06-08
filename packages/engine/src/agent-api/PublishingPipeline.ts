import type { AnimationRenderOutputPackageMetadata } from "./AnimationRenderQueue.js";
import type { CaptionTrackArtifact } from "./DialoguePerformance.js";
import { exportCaptionTrack, type CaptionExportArtifact } from "./CaptionExporter.js";
import { createThumbnailArtifact, createThumbnailGenerationPlan, generateThumbnailArtifact, type ThumbnailArtifact, type ThumbnailCaptureRuntime, type ThumbnailGenerationPlan } from "./ThumbnailGenerator.js";
import { generateYouTubeMetadata, type YouTubeMetadataArtifact } from "./YouTubeMetadataGenerator.js";
import { createPromptAnimationIssue, promptAnimationContractVersion, type PromptAnimationEpisodePlan, type PromptAnimationId, type PromptAnimationValidationIssue } from "./PromptAnimationContract.js";
import type { VideoExportResult } from "./VideoExportPipeline.js";
import type { MuxedVideoArtifact } from "./AudioMuxer.js";

export interface PublishingPackageArtifact {
  readonly artifact: "publishing-package";
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly videoPath: string;
  readonly videoByteLength: number;
  readonly captions: readonly CaptionExportArtifact[];
  readonly thumbnailPlan: ThumbnailGenerationPlan;
  readonly thumbnail?: ThumbnailArtifact | undefined;
  readonly youtubeMetadata: YouTubeMetadataArtifact;
  readonly evidencePath: string;
  readonly routeProofPath: string;
  readonly provenancePath: string;
  readonly readiness: PublishingReadinessReport;
}

export interface PublishingReadinessReport {
  readonly status: "pass" | "fail";
  readonly checks: readonly PublishingReadinessCheck[];
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export interface PublishingReadinessCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface CreatePublishingPackageOptions {
  readonly episodePlan?: PromptAnimationEpisodePlan | undefined;
  readonly outputPackage: AnimationRenderOutputPackageMetadata;
  readonly captions?: CaptionTrackArtifact | undefined;
  readonly videoResult?: VideoExportResult | undefined;
  readonly thumbnailRuntime?: ThumbnailCaptureRuntime | undefined;
  readonly routeProofPath?: string | undefined;
  readonly provenancePath?: string | undefined;
}

export async function createPublishingPackage(options: CreatePublishingPackageOptions): Promise<PublishingPackageArtifact> {
  const captionOutputs = options.outputPackage.outputs.captions;
  const captionExports = options.captions
    ? [
        exportCaptionTrack(options.captions, "vtt", captionOutputs.find((output) => output.kind === "caption-vtt")?.path),
        exportCaptionTrack(options.captions, "srt", captionOutputs.find((output) => output.kind === "caption-srt")?.path)
      ]
    : [];
  const thumbnailPlan = createThumbnailGenerationPlan({ packageMetadata: options.outputPackage });
  const thumbnail = options.thumbnailRuntime ? await generateThumbnailArtifact(thumbnailPlan, options.thumbnailRuntime) : undefined;
  const youtubeMetadata = generateYouTubeMetadata({
    episodePlan: options.episodePlan,
    packageMetadata: options.outputPackage
  });
  const videoPath = options.outputPackage.outputs.mp4?.path ?? options.outputPackage.outputs.webm?.path ?? options.videoResult?.plan.outputPath ?? "";
  const artifact: Omit<PublishingPackageArtifact, "readiness"> = {
    artifact: "publishing-package",
    contractId: promptAnimationContractVersion,
    episodeId: options.outputPackage.episodeId,
    videoPath,
    videoByteLength: options.videoResult?.output.byteLength ?? options.videoResult?.muxedVideo.byteLength ?? 0,
    captions: captionExports,
    thumbnailPlan,
    ...(thumbnail ? { thumbnail } : {}),
    youtubeMetadata,
    evidencePath: options.outputPackage.outputs.evidenceJson?.path ?? options.outputPackage.reviewPackagePaths.evidence,
    routeProofPath: options.routeProofPath ?? "dist/render/route-proof.json",
    provenancePath: options.provenancePath ?? "dist/render/asset-provenance.json"
  };
  return {
    ...artifact,
    readiness: validatePublishingPackage(artifact)
  };
}

export interface PublishPackageArtifact {
  readonly kind: "publish-package";
  readonly ok: boolean;
  readonly video: MuxedVideoArtifact;
  readonly captions: readonly { readonly kind: "vtt" | "srt"; readonly text: string }[];
  readonly thumbnail: ThumbnailArtifact;
  readonly youtube: YouTubeMetadataArtifact;
  readonly issues: readonly string[];
}

export function createPublishPackage(input: {
  readonly video: MuxedVideoArtifact;
  readonly captions: CaptionTrackArtifact;
  readonly outputPackage: AnimationRenderOutputPackageMetadata;
}): PublishPackageArtifact {
  const captionExports = [exportCaptionTrack(input.captions, "vtt"), exportCaptionTrack(input.captions, "srt")];
  const thumbnail = createThumbnailArtifact({
    path: input.outputPackage.outputs.thumbnail?.path ?? "dist/render/thumbnail.png",
    viewport: input.outputPackage.viewport,
    time: input.outputPackage.thumbnailCapture.time,
    mimeType: "image/png"
  });
  const issues = input.video.byteLength <= 0 ? ["video output is empty"] : [];
  return {
    kind: "publish-package",
    ok: issues.length === 0 && input.captions.cues.length > 0,
    video: input.video,
    captions: captionExports.map((caption) => ({ kind: caption.format, text: caption.text })),
    thumbnail,
    youtube: generateYouTubeMetadata({ packageMetadata: input.outputPackage }),
    issues: input.captions.cues.length === 0 ? [...issues, "caption track has no cues"] : issues
  };
}

export function validatePublishingPackage(
  pkg: Omit<PublishingPackageArtifact, "readiness"> | PublishingPackageArtifact
): PublishingReadinessReport {
  const checks: PublishingReadinessCheck[] = [
    { id: "video", passed: Boolean(pkg.videoPath), message: "Video output path is present." },
    { id: "video-bytes", passed: pkg.videoByteLength > 0, message: "Video output byte length is greater than zero." },
    { id: "captions", passed: pkg.captions.length > 0, message: "At least one caption export is present." },
    { id: "caption-bytes", passed: pkg.captions.every((caption) => caption.byteLength > 0), message: "Caption exports have non-empty file text." },
    { id: "thumbnail", passed: Boolean(pkg.thumbnailPlan.outputPath), message: "Thumbnail output path is present." },
    { id: "thumbnail-artifact", passed: Boolean(pkg.thumbnail?.path && pkg.thumbnail.byteLength > 0 && pkg.thumbnail.checksum), message: "Thumbnail artifact includes path, bytes, and checksum." },
    { id: "metadata-title", passed: Boolean(pkg.youtubeMetadata.title), message: "YouTube title is present." },
    { id: "metadata-language", passed: Boolean(pkg.youtubeMetadata.defaultLanguage), message: "YouTube default language is present." },
    { id: "evidence", passed: Boolean(pkg.evidencePath), message: "Evidence JSON output path is present." },
    { id: "route-proof", passed: Boolean(pkg.routeProofPath), message: "Route proof JSON output path is present." },
    { id: "provenance", passed: Boolean(pkg.provenancePath), message: "Asset provenance JSON output path is present." }
  ];
  const issues = checks
    .filter((check) => !check.passed)
    .map((check) => createPromptAnimationIssue("error", `publishing-${check.id}-missing`, check.message));
  return {
    status: issues.length === 0 ? "pass" : "fail",
    checks,
    issues
  };
}
