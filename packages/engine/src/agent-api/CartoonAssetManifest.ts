import type { PromptAnimationId } from "./PromptAnimationContract.js";

export type CartoonAssetManifestKind = "character" | "prop" | "set" | "environment" | "audio";

export interface CartoonAssetManifestEntry {
  readonly id: PromptAnimationId;
  readonly kind: CartoonAssetManifestKind;
  readonly assetId: string;
  readonly style: string;
  readonly license: string;
  readonly sourcePage?: string | undefined;
  readonly attribution?: string | undefined;
  readonly lipSyncReady?: boolean;
  readonly emotionSupport?: readonly string[];
  readonly animationClips?: readonly string[];
  readonly materialPreview?: {
    readonly materialCount: number;
    readonly swatches: readonly string[];
    readonly celShadingReady?: boolean | undefined;
  } | undefined;
  readonly preview?: {
    readonly thumbnailPath?: string | undefined;
    readonly orbitPreview?: boolean | undefined;
    readonly zoomPreview?: boolean | undefined;
    readonly animationPreviewClips?: readonly string[] | undefined;
  } | undefined;
  readonly metadata?: Readonly<Record<string, string | number | boolean | readonly string[]>> | undefined;
}

export interface CartoonAssetManifest {
  readonly kind: "cartoon-asset-manifest";
  readonly entries: readonly CartoonAssetManifestEntry[];
}

export function defineCartoonAssetManifest(entries: readonly CartoonAssetManifestEntry[]): CartoonAssetManifest {
  return { kind: "cartoon-asset-manifest", entries };
}
