import type { PublishingPackageArtifact } from "./PublishingPipeline.js";
import {
  createPromptAnimationIssue,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";

export type YouTubeUploadAdapterStatus = "ready" | "unsupported" | "missing-credentials" | "provider-error";
export type YouTubeUploadStatus = "uploaded" | "blocked" | "failed";

export interface YouTubeUploadCapability {
  readonly supported: boolean;
  readonly status: YouTubeUploadAdapterStatus;
  readonly requiresCredentials: boolean;
  readonly diagnostics: readonly PromptAnimationValidationIssue[];
}

export interface YouTubeUploadPackage {
  readonly kind: "youtube-upload-package";
  readonly publishingPackage: PublishingPackageArtifact;
  readonly videoPath: string;
  readonly thumbnailPath: string;
  readonly captionPaths: readonly string[];
  readonly dryRun: boolean;
}

export interface YouTubeUploadReadiness {
  readonly status: "pass" | "fail";
  readonly diagnostics: readonly PromptAnimationValidationIssue[];
}

export interface YouTubeUploadResult {
  readonly kind: "youtube-upload-result";
  readonly status: YouTubeUploadStatus;
  readonly dryRun: boolean;
  readonly videoId?: string | undefined;
  readonly url?: string | undefined;
  readonly diagnostics: readonly PromptAnimationValidationIssue[];
}

export interface YouTubeUploadAdapter {
  readonly kind: "youtube-upload-adapter";
  readonly capability: YouTubeUploadCapability;
  upload(pkg: YouTubeUploadPackage): Promise<YouTubeUploadResult>;
}

export interface CreateYouTubeUploadAdapterOptions {
  readonly dryRun?: boolean | undefined;
  readonly requiresCredentials?: boolean | undefined;
  readonly credentialsAvailable?: boolean | undefined;
  readonly upload?: ((pkg: YouTubeUploadPackage) => Promise<YouTubeUploadResult> | YouTubeUploadResult) | undefined;
}

export function createYouTubeUploadPackage(
  publishingPackage: PublishingPackageArtifact,
  options: { readonly dryRun?: boolean | undefined } = {}
): YouTubeUploadPackage {
  return {
    kind: "youtube-upload-package",
    publishingPackage,
    videoPath: publishingPackage.videoPath,
    thumbnailPath: publishingPackage.thumbnail?.path ?? publishingPackage.thumbnailPlan.outputPath,
    captionPaths: publishingPackage.captions.map((caption) => caption.path).filter(isString),
    dryRun: options.dryRun ?? true
  };
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export function validateYouTubeUploadPackage(pkg: YouTubeUploadPackage): YouTubeUploadReadiness {
  const diagnostics: PromptAnimationValidationIssue[] = [];
  if (!pkg.videoPath) {
    diagnostics.push(createPromptAnimationIssue("error", "youtube-video-missing", "YouTube upload package requires a video path."));
  }
  if (pkg.publishingPackage.videoByteLength <= 0) {
    diagnostics.push(createPromptAnimationIssue("error", "youtube-video-empty", "YouTube upload package video must be non-empty."));
  }
  if (!pkg.thumbnailPath) {
    diagnostics.push(createPromptAnimationIssue("error", "youtube-thumbnail-missing", "YouTube upload package requires a thumbnail path."));
  }
  if (!pkg.publishingPackage.youtubeMetadata.title) {
    diagnostics.push(createPromptAnimationIssue("error", "youtube-title-missing", "YouTube upload package requires a title."));
  }
  if (pkg.publishingPackage.youtubeMetadata.captionsRequired && pkg.captionPaths.length === 0) {
    diagnostics.push(createPromptAnimationIssue("error", "youtube-captions-missing", "YouTube upload package requires caption files."));
  }
  return {
    status: diagnostics.length === 0 ? "pass" : "fail",
    diagnostics
  };
}

export function createYouTubeUploadAdapter(options: CreateYouTubeUploadAdapterOptions = {}): YouTubeUploadAdapter {
  const capability = probeYouTubeUploadAdapter(options);
  return {
    kind: "youtube-upload-adapter",
    capability,
    async upload(pkg) {
      const readiness = validateYouTubeUploadPackage(pkg);
      const dryRun = options.dryRun ?? pkg.dryRun;
      if (readiness.status !== "pass") {
        return {
          kind: "youtube-upload-result",
          status: "blocked",
          dryRun,
          diagnostics: readiness.diagnostics
        };
      }
      if (!capability.supported || !options.upload) {
        return {
          kind: "youtube-upload-result",
          status: "blocked",
          dryRun,
          diagnostics: capability.diagnostics
        };
      }
      try {
        const result = await options.upload({ ...pkg, dryRun });
        return {
          kind: "youtube-upload-result",
          status: result.status,
          dryRun: result.dryRun,
          ...(result.videoId ? { videoId: result.videoId } : {}),
          ...(result.url ? { url: result.url } : {}),
          diagnostics: result.diagnostics
        };
      } catch (error) {
        return {
          kind: "youtube-upload-result",
          status: "failed",
          dryRun,
          diagnostics: [
            createPromptAnimationIssue(
              "error",
              "youtube-upload-provider-error",
              `YouTube upload failed: ${error instanceof Error ? error.message : String(error)}.`
            )
          ]
        };
      }
    }
  };
}

export function probeYouTubeUploadAdapter(options: CreateYouTubeUploadAdapterOptions = {}): YouTubeUploadCapability {
  const requiresCredentials = options.requiresCredentials ?? true;
  if (!options.upload) {
    return {
      supported: false,
      status: "unsupported",
      requiresCredentials,
      diagnostics: [
        createPromptAnimationIssue(
          "warning",
          "youtube-upload-unconfigured",
          "YouTube upload is not configured; no OAuth/API upload will be attempted."
        )
      ]
    };
  }
  if (requiresCredentials && options.credentialsAvailable !== true) {
    return {
      supported: false,
      status: "missing-credentials",
      requiresCredentials,
      diagnostics: [
        createPromptAnimationIssue(
          "error",
          "youtube-upload-credentials-missing",
          "YouTube upload requires credentials before upload."
        )
      ]
    };
  }
  return {
    supported: true,
    status: "ready",
    requiresCredentials,
    diagnostics: []
  };
}
