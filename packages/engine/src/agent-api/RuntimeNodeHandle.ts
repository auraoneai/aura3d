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
  setMorphTarget?(name: string, weight: number): this;
  setMorphTargets?(weights: RuntimeNodeMorphTargetWeights): this;
  morphTargets?(): RuntimeNodeMorphTargetWeights;
  snapshot(): unknown;
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
