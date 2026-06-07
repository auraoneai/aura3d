import { createPromptAnimationIssue, type PromptAnimationId, type PromptAnimationValidationIssue } from "./PromptAnimationContract.js";

export type CartoonAssetManifestKind = "character" | "prop" | "set" | "environment" | "audio";
export type CartoonAssetProfile = "cartoon-character" | "cartoon-set" | "cartoon-prop" | "audio-dialogue" | "audio-sfx" | "environment";

export interface CartoonAssetManifestEntry {
  readonly id: PromptAnimationId;
  readonly kind: CartoonAssetManifestKind;
  readonly assetId: string;
  readonly profile?: CartoonAssetProfile | undefined;
  readonly style: string;
  readonly license: string;
  readonly sourcePage?: string | undefined;
  readonly attribution?: string | undefined;
  readonly lipSyncReady?: boolean;
  readonly typedAssetReference?: boolean | undefined;
  readonly mouthCueReady?: boolean | undefined;
  readonly setReady?: boolean | undefined;
  readonly audioReady?: boolean | undefined;
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
  readonly readiness: CartoonAssetManifestReadiness;
}

export interface CartoonAssetManifestReadiness {
  readonly characterCount: number;
  readonly setCount: number;
  readonly propCount: number;
  readonly audioCount: number;
  readonly lipSyncReadyCount: number;
  readonly typedAssetReferenceCount: number;
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export function defineCartoonAssetManifest(entries: readonly CartoonAssetManifestEntry[]): CartoonAssetManifest {
  return { kind: "cartoon-asset-manifest", entries, readiness: createCartoonAssetManifestReadiness(entries) };
}

export function validateCartoonAssetManifest(manifest: CartoonAssetManifest): readonly PromptAnimationValidationIssue[] {
  return createCartoonAssetManifestReadiness(manifest.entries).issues;
}

export function createCartoonAssetManifestReadiness(
  entries: readonly CartoonAssetManifestEntry[]
): CartoonAssetManifestReadiness {
  const issues: PromptAnimationValidationIssue[] = [];
  let characterCount = 0;
  let setCount = 0;
  let propCount = 0;
  let audioCount = 0;
  let lipSyncReadyCount = 0;
  let typedAssetReferenceCount = 0;

  for (const entry of entries) {
    if (entry.kind === "character") characterCount += 1;
    if (entry.kind === "set" || entry.kind === "environment") setCount += 1;
    if (entry.kind === "prop") propCount += 1;
    if (entry.kind === "audio") audioCount += 1;
    if (entry.lipSyncReady || entry.mouthCueReady) lipSyncReadyCount += 1;
    if (entry.typedAssetReference ?? entry.assetId.startsWith("assets.")) typedAssetReferenceCount += 1;

    if (!entry.assetId.startsWith("assets.")) {
      issues.push(
        createPromptAnimationIssue("error", "cartoon-asset-typed-reference-missing", `Cartoon asset "${entry.id}" must reference a generated typed asset key such as assets.${entry.id}.`, {
          path: `entries.${entry.id}.assetId`
        })
      );
    }
    if (!entry.license) {
      issues.push(createPromptAnimationIssue("error", "cartoon-asset-license-missing", `Cartoon asset "${entry.id}" needs a license.`, {
        path: `entries.${entry.id}.license`
      }));
    }
    if (entry.kind === "character" && !(entry.lipSyncReady || entry.mouthCueReady)) {
      issues.push(
        createPromptAnimationIssue("error", "cartoon-character-mouth-readiness-missing", `Character asset "${entry.id}" needs lip-sync, mouth cue, or blendshape readiness evidence.`, {
          path: `entries.${entry.id}.lipSyncReady`
        })
      );
    }
    if ((entry.kind === "set" || entry.kind === "environment") && entry.setReady === false) {
      issues.push(createPromptAnimationIssue("error", "cartoon-set-readiness-failed", `Set asset "${entry.id}" is marked not ready.`, {
        path: `entries.${entry.id}.setReady`
      }));
    }
    if (entry.kind === "audio" && entry.audioReady === false) {
      issues.push(createPromptAnimationIssue("error", "cartoon-audio-readiness-failed", `Audio asset "${entry.id}" is marked not ready.`, {
        path: `entries.${entry.id}.audioReady`
      }));
    }
  }

  return {
    characterCount,
    setCount,
    propCount,
    audioCount,
    lipSyncReadyCount,
    typedAssetReferenceCount,
    issues
  };
}
