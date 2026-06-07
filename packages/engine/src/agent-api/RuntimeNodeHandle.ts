import type { AnimationPose } from "@aura3d/animation";

export type RuntimeNodeVec3 = readonly [number, number, number];
export type RuntimeNodeMorphTargetWeights = Readonly<Record<string, number>>;

export interface AuraRuntimeNodeBounds {
  readonly kind: "aura-runtime-node-bounds";
  readonly center: RuntimeNodeVec3;
  readonly size: RuntimeNodeVec3;
  readonly min: RuntimeNodeVec3;
  readonly max: RuntimeNodeVec3;
  readonly radius: number;
}

export type AuraRuntimeNodeEffectKind =
  | "hit-spark"
  | "block-spark"
  | "dash-trail"
  | "impact-flash"
  | "aura-burst"
  | "shockwave"
  | "custom";

export interface AuraRuntimeNodeEffectAttachment {
  readonly id?: string;
  readonly kind: AuraRuntimeNodeEffectKind;
  readonly position?: RuntimeNodeVec3;
  readonly color?: string;
  readonly intensity?: number;
  readonly duration?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface RuntimeNodeAnimationSpecLike {
  readonly clip?: string;
  readonly loop?: boolean;
  readonly speed?: number;
  readonly startTime?: number;
  readonly duration?: number;
  readonly captureTime?: number;
  readonly easing?: "linear" | "easeInOut";
  readonly metadata?: Record<string, unknown>;
}

export interface AuraRuntimeNodeAnimationBindingMetadata {
  readonly kind: "aura-runtime-node-animation-binding";
  readonly controllerId?: string;
  readonly bindingId?: string;
  readonly activeClipId?: string;
  readonly playbackId?: string;
  readonly layer?: string;
  readonly layerRole?: string;
  readonly bodyMask?: string;
  readonly localTime?: number;
  readonly captureTime?: number;
  readonly loop?: boolean;
  readonly speed?: number;
  readonly eventSource?: string;
  readonly retargeted?: boolean;
  readonly poseBakedFallback?: boolean;
  readonly sourceAssetId?: string;
  readonly sourceAssetName?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuraRuntimeNodeAnimationPoseBindingMetadata {
  readonly kind: "aura-runtime-node-animation-pose";
  readonly controllerId?: string;
  readonly bindingId?: string;
  readonly activeClipId?: string;
  readonly playbackId?: string;
  readonly localTime?: number;
  readonly captureTime?: number;
  readonly boneCount: number;
  readonly morphTargetCount: number;
  readonly sourceAssetId?: string;
  readonly sourceAssetName?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuraRuntimeNodeImportedAssetEvidence {
  readonly kind: "aura-runtime-node-imported-asset-evidence";
  readonly assetId: string;
  readonly nodeId?: string | undefined;
  readonly skeleton?: {
    readonly boneCount: number;
    readonly boneNames: readonly string[];
  } | undefined;
  readonly clips: readonly string[];
  readonly activeClip?: string | undefined;
  readonly skinningPalette?: {
    readonly jointCount: number;
    readonly matrixCount: number;
    readonly updated: boolean;
  } | undefined;
  readonly morphTargets: readonly string[];
  readonly bounds?: AuraRuntimeNodeBounds | undefined;
  readonly renderItemCount: number;
  readonly skinnedRenderItemCount: number;
  readonly morphRenderItemCount: number;
  readonly diagnostics: readonly AuraRuntimeNodeImportedAssetDiagnostic[];
}

export interface AuraRuntimeNodeImportedAssetDiagnostic {
  readonly severity: "info" | "warning" | "error";
  readonly code:
    | "missing-clip"
    | "missing-bone"
    | "missing-morph"
    | "missing-skeleton"
    | "missing-skinning-palette"
    | "missing-render-items";
  readonly message: string;
}

export interface AuraRuntimeNodeImportedAssetEvidenceInput {
  readonly assetId: string;
  readonly nodeId?: string | undefined;
  readonly skeletonBones?: readonly string[] | undefined;
  readonly clips?: readonly string[] | undefined;
  readonly activeClip?: string | undefined;
  readonly skinningPalette?: {
    readonly jointCount: number;
    readonly matrixCount?: number | undefined;
    readonly updated?: boolean | undefined;
  } | undefined;
  readonly morphTargets?: readonly string[] | undefined;
  readonly bounds?: AuraRuntimeNodeBounds | RuntimeNodeBoundsInput | undefined;
  readonly renderItemCount?: number | undefined;
  readonly skinnedRenderItemCount?: number | undefined;
  readonly morphRenderItemCount?: number | undefined;
  readonly requiredClips?: readonly string[] | undefined;
  readonly requiredBones?: readonly string[] | undefined;
  readonly requiredMorphTargets?: readonly string[] | undefined;
}

export interface RuntimeNodeBoundsInput {
  readonly position?: RuntimeNodeVec3;
  readonly scale?: number | RuntimeNodeVec3;
  readonly size?: number | RuntimeNodeVec3;
}

export interface RuntimeNodeHandleLike {
  readonly id: string;
  readonly kind: string;
  readonly name?: string;
  readonly tags: readonly string[];
  position: RuntimeNodeVec3;
  rotation: RuntimeNodeVec3;
  scale: number | RuntimeNodeVec3;
  visible: boolean;
  setPosition(x: number, y: number, z: number): this;
  translate(x: number, y: number, z: number): this;
  setRotation(x: number, y: number, z: number): this;
  setScale(scale: number | RuntimeNodeVec3): this;
  setVisible(visible: boolean): this;
  play?(clip: string, options?: Omit<RuntimeNodeAnimationSpecLike, "clip">): this;
  setAnimation?(animation: RuntimeNodeAnimationSpecLike | undefined): this;
  setAnimationBinding?(binding: AuraRuntimeNodeAnimationBindingMetadata | undefined): this;
  setAnimationPose?(pose: AnimationPose | undefined, metadata?: AuraRuntimeNodeAnimationPoseBindingMetadata): this;
  animationPose?(): AnimationPose | undefined;
  setImportedAssetEvidence?(evidence: AuraRuntimeNodeImportedAssetEvidence | undefined): this;
  importedAssetEvidence?(): AuraRuntimeNodeImportedAssetEvidence | undefined;
  setMorphTarget?(name: string, weight: number): this;
  setMorphTargets?(weights: RuntimeNodeMorphTargetWeights): this;
  morphTargets?(): RuntimeNodeMorphTargetWeights;
  snapshot(): unknown;
}

export function createRuntimeNodeImportedAssetEvidence(
  input: AuraRuntimeNodeImportedAssetEvidenceInput
): AuraRuntimeNodeImportedAssetEvidence {
  const clips = [...new Set(input.clips ?? [])];
  const bones = [...new Set(input.skeletonBones ?? [])];
  const morphTargets = [...new Set(input.morphTargets ?? [])];
  const diagnostics: AuraRuntimeNodeImportedAssetDiagnostic[] = [];
  for (const clip of input.requiredClips ?? []) {
    if (!clips.includes(clip)) diagnostics.push({ severity: "error", code: "missing-clip", message: `Missing imported animation clip "${clip}".` });
  }
  for (const bone of input.requiredBones ?? []) {
    if (!bones.includes(bone)) diagnostics.push({ severity: "error", code: "missing-bone", message: `Missing imported skeleton bone "${bone}".` });
  }
  for (const morph of input.requiredMorphTargets ?? []) {
    if (!morphTargets.includes(morph)) diagnostics.push({ severity: "error", code: "missing-morph", message: `Missing imported morph target "${morph}".` });
  }
  if (bones.length === 0) diagnostics.push({ severity: "warning", code: "missing-skeleton", message: "Imported asset evidence has no skeleton bones." });
  if (!input.skinningPalette) diagnostics.push({ severity: "warning", code: "missing-skinning-palette", message: "Imported asset evidence has no skinning palette." });
  if ((input.renderItemCount ?? 0) < 1) diagnostics.push({ severity: "warning", code: "missing-render-items", message: "Imported asset evidence has no render items." });
  return {
    kind: "aura-runtime-node-imported-asset-evidence",
    assetId: input.assetId,
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(bones.length > 0 ? { skeleton: { boneCount: bones.length, boneNames: bones } } : {}),
    clips,
    ...(input.activeClip ? { activeClip: input.activeClip } : {}),
    ...(input.skinningPalette ? {
      skinningPalette: {
        jointCount: input.skinningPalette.jointCount,
        matrixCount: input.skinningPalette.matrixCount ?? input.skinningPalette.jointCount,
        updated: input.skinningPalette.updated ?? true
      }
    } : {}),
    morphTargets,
    ...(input.bounds ? { bounds: isRuntimeNodeBounds(input.bounds) ? input.bounds : calculateRuntimeNodeBounds(input.bounds) } : {}),
    renderItemCount: input.renderItemCount ?? 0,
    skinnedRenderItemCount: input.skinnedRenderItemCount ?? 0,
    morphRenderItemCount: input.morphRenderItemCount ?? 0,
    diagnostics
  };
}

export function calculateRuntimeNodeBounds(input: RuntimeNodeBoundsInput): AuraRuntimeNodeBounds {
  const center = vec3(input.position, [0, 0, 0]);
  const size = multiplyVec3(scaleToVec3(input.size, [1, 1, 1]), scaleToVec3(input.scale, [1, 1, 1])).map((value) =>
    Math.max(0.0001, Math.abs(value))
  ) as unknown as RuntimeNodeVec3;
  const half: RuntimeNodeVec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const min: RuntimeNodeVec3 = [center[0] - half[0], center[1] - half[1], center[2] - half[2]];
  const max: RuntimeNodeVec3 = [center[0] + half[0], center[1] + half[1], center[2] + half[2]];
  return {
    kind: "aura-runtime-node-bounds",
    center,
    size,
    min,
    max,
    radius: Math.sqrt(half[0] * half[0] + half[1] * half[1] + half[2] * half[2])
  };
}

export function createRuntimeNodeEffectAttachment(
  kind: AuraRuntimeNodeEffectKind,
  options: Omit<AuraRuntimeNodeEffectAttachment, "kind"> = {}
): AuraRuntimeNodeEffectAttachment {
  return {
    ...options,
    kind
  };
}

export function runtimeNodeHasTag(node: { readonly tags?: readonly string[] }, tag: string): boolean {
  return Boolean(node.tags?.includes(tag));
}

function vec3(value: RuntimeNodeVec3 | undefined, fallback: RuntimeNodeVec3): RuntimeNodeVec3 {
  return value ? [value[0], value[1], value[2]] : fallback;
}

function scaleToVec3(value: number | RuntimeNodeVec3 | undefined, fallback: RuntimeNodeVec3): RuntimeNodeVec3 {
  if (typeof value === "number") return [value, value, value];
  return value ? [value[0], value[1], value[2]] : fallback;
}

function multiplyVec3(a: RuntimeNodeVec3, b: RuntimeNodeVec3): RuntimeNodeVec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

function isRuntimeNodeBounds(value: AuraRuntimeNodeBounds | RuntimeNodeBoundsInput): value is AuraRuntimeNodeBounds {
  return (value as AuraRuntimeNodeBounds).kind === "aura-runtime-node-bounds";
}
