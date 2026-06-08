import { createPromptAnimationIssue, type PromptAnimationId, type PromptAnimationValidationIssue } from "./PromptAnimationContract.js";

export type AnimationAssetManifestKind = "character" | "prop" | "set" | "environment" | "audio";
export type AnimationAssetProfile = "animation-character" | "animation-set" | "animation-prop" | "audio-dialogue" | "audio-sfx" | "environment";

export interface AnimationAssetManifestEntry {
  readonly id: PromptAnimationId;
  readonly kind: AnimationAssetManifestKind;
  readonly assetId: string;
  readonly profile?: AnimationAssetProfile | undefined;
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

export interface AnimationAssetManifest {
  readonly kind: "animation-asset-manifest";
  readonly entries: readonly AnimationAssetManifestEntry[];
  readonly readiness: AnimationAssetManifestReadiness;
}

export interface AnimationAssetManifestReadiness {
  readonly characterCount: number;
  readonly setCount: number;
  readonly propCount: number;
  readonly audioCount: number;
  readonly lipSyncReadyCount: number;
  readonly typedAssetReferenceCount: number;
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export function defineAnimationAssetManifest(entries: readonly AnimationAssetManifestEntry[]): AnimationAssetManifest {
  return { kind: "animation-asset-manifest", entries, readiness: createAnimationAssetManifestReadiness(entries) };
}

export function validateAnimationAssetManifest(manifest: AnimationAssetManifest): readonly PromptAnimationValidationIssue[] {
  return createAnimationAssetManifestReadiness(manifest.entries).issues;
}

export function createAnimationAssetManifestReadiness(
  entries: readonly AnimationAssetManifestEntry[]
): AnimationAssetManifestReadiness {
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
        createPromptAnimationIssue("error", "animation-asset-typed-reference-missing", `Animation asset "${entry.id}" must reference a generated typed asset key such as assets.${entry.id}.`, {
          path: `entries.${entry.id}.assetId`
        })
      );
    }
    if (!entry.license) {
      issues.push(createPromptAnimationIssue("error", "animation-asset-license-missing", `Animation asset "${entry.id}" needs a license.`, {
        path: `entries.${entry.id}.license`
      }));
    }
    if (entry.kind === "character" && !(entry.lipSyncReady || entry.mouthCueReady)) {
      issues.push(
        createPromptAnimationIssue("error", "animation-character-mouth-readiness-missing", `Character asset "${entry.id}" needs lip-sync, mouth cue, or blendshape readiness evidence.`, {
          path: `entries.${entry.id}.lipSyncReady`
        })
      );
    }
    if ((entry.kind === "set" || entry.kind === "environment") && entry.setReady === false) {
      issues.push(createPromptAnimationIssue("error", "animation-set-readiness-failed", `Set asset "${entry.id}" is marked not ready.`, {
        path: `entries.${entry.id}.setReady`
      }));
    }
    if (entry.kind === "audio" && entry.audioReady === false) {
      issues.push(createPromptAnimationIssue("error", "animation-audio-readiness-failed", `Audio asset "${entry.id}" is marked not ready.`, {
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
