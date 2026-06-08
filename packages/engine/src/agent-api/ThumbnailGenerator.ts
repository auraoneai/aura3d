import type { AnimationRenderOutputPackageMetadata, AnimationThumbnailSceneStateCapture, AnimationViewport } from "./AnimationRenderQueue.js";
import { normalizePromptAnimationTime, type PromptAnimationId, type PromptAnimationSeconds } from "./PromptAnimationContract.js";

export interface ThumbnailGenerationPlan {
  readonly kind: "thumbnail-generation-plan";
  readonly episodeId: PromptAnimationId;
  readonly capture: AnimationThumbnailSceneStateCapture;
  readonly outputPath: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/webp" | "image/png" | "image/jpeg";
  readonly time: PromptAnimationSeconds;
  readonly resizeMode: "cover" | "contain";
}

export interface ThumbnailArtifact {
  readonly kind: "thumbnail";
  readonly plan: ThumbnailGenerationPlan;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly time: PromptAnimationSeconds;
  readonly mimeType: "image/webp" | "image/png" | "image/jpeg";
  readonly byteLength: number;
  readonly checksum: string;
  readonly image?: Blob | Uint8Array | string | undefined;
}

export interface ThumbnailCaptureRuntime {
  captureThumbnail(plan: ThumbnailGenerationPlan): Promise<Blob | Uint8Array | string | undefined> | Blob | Uint8Array | string | undefined;
}

export function createThumbnailGenerationPlan(input: {
  readonly packageMetadata: AnimationRenderOutputPackageMetadata;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly mimeType?: "image/webp" | "image/png" | "image/jpeg" | undefined;
  readonly resizeMode?: "cover" | "contain" | undefined;
}): ThumbnailGenerationPlan {
  const viewport = youtubeThumbnailViewport(input.packageMetadata.viewport, input.width, input.height);
  return {
    kind: "thumbnail-generation-plan",
    episodeId: input.packageMetadata.episodeId,
    capture: input.packageMetadata.thumbnailCapture,
    outputPath: input.packageMetadata.outputs.thumbnail?.path ?? "dist/render/thumbnail.webp",
    width: viewport.width,
    height: viewport.height,
    mimeType: input.mimeType ?? "image/webp",
    time: normalizePromptAnimationTime(input.packageMetadata.thumbnailCapture.time),
    resizeMode: input.resizeMode ?? "cover"
  };
}

export async function generateThumbnailArtifact(
  plan: ThumbnailGenerationPlan,
  runtime: ThumbnailCaptureRuntime
): Promise<ThumbnailArtifact> {
  const image = await runtime.captureThumbnail(plan);
  return createThumbnailArtifactFromPlan(plan, image);
}

export function createThumbnailArtifact(input: {
  readonly path: string;
  readonly viewport: AnimationViewport;
  readonly time: number;
  readonly data?: Blob | Uint8Array | string | undefined;
  readonly mimeType?: "image/webp" | "image/png" | "image/jpeg" | undefined;
}): ThumbnailArtifact {
  const plan: ThumbnailGenerationPlan = {
    kind: "thumbnail-generation-plan",
    episodeId: "thumbnail",
    capture: {
      id: "thumbnail:capture",
      source: "same-aura3d-scene-state",
      outputId: "thumbnail",
      outputPath: input.path,
      route: "",
      time: input.time,
      auraVoiceTimestamp: input.time,
      frame: 0,
      sourceSceneStateId: "thumbnail:scene-state",
      deterministicSeed: "thumbnail"
    },
    outputPath: input.path,
    width: input.viewport.width,
    height: input.viewport.height,
    mimeType: input.mimeType ?? "image/png",
    time: input.time,
    resizeMode: "cover"
  };
  return createThumbnailArtifactFromPlan(plan, input.data);
}

function createThumbnailArtifactFromPlan(plan: ThumbnailGenerationPlan, image: Blob | Uint8Array | string | undefined): ThumbnailArtifact {
  const byteLength = estimateImageByteLength(image, plan);
  return {
    kind: "thumbnail",
    plan,
    path: plan.outputPath,
    width: plan.width,
    height: plan.height,
    time: plan.time,
    mimeType: plan.mimeType,
    byteLength,
    checksum: thumbnailChecksum(`${plan.outputPath}:${byteLength}:${plan.time}`),
    ...(image !== undefined ? { image } : {})
  };
}

function youtubeThumbnailViewport(source: AnimationViewport, width = 1280, height = 720): Pick<AnimationViewport, "width" | "height"> {
  if (width > 0 && height > 0) return { width, height };
  if (source.width / source.height >= 16 / 9) return { width: 1280, height: 720 };
  return { width: 720, height: 1280 };
}

function estimateImageByteLength(image: Blob | Uint8Array | string | undefined, plan: ThumbnailGenerationPlan): number {
  if (image instanceof Uint8Array) return image.byteLength;
  if (typeof Blob !== "undefined" && image instanceof Blob) return image.size;
  if (typeof image === "string") return image.length;
  return Math.round(plan.width * plan.height * 0.18);
}

function thumbnailChecksum(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0;
  return `thumb-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
