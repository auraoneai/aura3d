import {
  animationClipEventKey,
  sampleClipEvents,
  type AnimationClipDefinition,
  type AnimationClipEvent,
  type AnimationClipEventInvocation,
  type AnimationClipEventUnsubscribe,
  type AnimationClipTrack,
  type AnimationLoopMode,
  type AnimationPlaybackDirection,
  type AnimationPose,
  type AnimationPoseTransform,
  type RegisteredAnimationClip
} from "@aura3d/animation";
import type {
  AuraRuntimeNodeAnimationPoseBindingMetadata,
  AuraRuntimeNodeAnimationBindingMetadata,
  RuntimeNodeAnimationSpecLike,
  RuntimeNodeHandleLike
} from "./RuntimeNodeHandle";

export type {
  AnimationClipEvent,
  AnimationClipEventInvocation,
  AnimationClipEventUnsubscribe,
  AnimationLoopMode,
  AnimationPlaybackDirection,
  AnimationPose,
  AnimationPoseTransform,
  AnimationQuaternion,
  AnimationRootMotion,
  AnimationTrack,
  AnimationVector3,
  RegisteredAnimationClip
} from "@aura3d/animation";

export type AuraAnimationPlaybackStatus = "idle" | "playing" | "paused" | "stopped" | "completed";
export type AuraAnimationDiagnosticSeverity = "info" | "warning" | "error";

export interface AuraAnimationDiagnostic<TClipId extends string = string> {
  readonly severity: AuraAnimationDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly clipId?: TClipId;
  readonly bone?: string;
  readonly trackId?: string;
}

export interface AuraAnimationBoneMetadata {
  readonly name: string;
  readonly parent?: string;
  readonly index?: number;
}

export type AuraAnimationBoneMetadataInput = string | AuraAnimationBoneMetadata;

export interface AuraAnimationSkeletonMetadata {
  readonly id?: string;
  readonly rootBone?: string;
  readonly bones?: readonly AuraAnimationBoneMetadataInput[];
}

export interface AuraHumanoidBoneBinding {
  readonly source: string;
  readonly target: string;
  readonly required?: boolean;
}

export type AuraHumanoidBoneMap = Record<string, string> | readonly AuraHumanoidBoneBinding[];

export type AuraAnimationRetargetConstraintCode =
  | "explicit-humanoid-bone-map"
  | "matching-rest-pose"
  | "uniform-scale"
  | "root-motion-policy"
  | "no-runtime-ik"
  | "no-automatic-proportion-warp"
  | string;

export interface AuraAnimationRetargetConstraint {
  readonly code: AuraAnimationRetargetConstraintCode;
  readonly severity?: AuraAnimationDiagnosticSeverity;
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuraExternalHumanoidAnimationLibraryBindingMetadata {
  readonly kind?: "aura-external-humanoid-animation-library-binding" | string;
  readonly library: string;
  readonly animationSet?: string;
  readonly sourceAssetId?: string;
  readonly sourceAssetName?: string;
  readonly sourceClipId?: string;
  readonly sourceRig?: string;
  readonly targetRig?: string;
  readonly license?: string;
  readonly url?: string;
  readonly restPose?: "t-pose" | "a-pose" | "bind-pose" | "unknown" | string;
  readonly units?: "meters" | "centimeters" | "unknown" | string;
  readonly forwardAxis?: "+x" | "-x" | "+y" | "-y" | "+z" | "-z" | string;
  readonly upAxis?: "+x" | "-x" | "+y" | "-y" | "+z" | "-z" | string;
  readonly skeleton?: AuraAnimationSkeletonMetadata;
  readonly boneMap?: AuraHumanoidBoneMap;
  readonly retargeter?: string;
  readonly constraints?: readonly (AuraAnimationRetargetConstraint | AuraAnimationRetargetConstraintCode)[];
  readonly metadata?: Record<string, unknown>;
}

export interface AuraAnimationRetargetBindingMetadata {
  readonly kind?: "aura-animation-retarget-binding" | string;
  readonly source?: "external-humanoid-library" | "embedded-glb" | "custom" | string;
  readonly sourceSkeleton?: AuraAnimationSkeletonMetadata;
  readonly targetSkeleton?: AuraAnimationSkeletonMetadata;
  readonly boneMap?: AuraHumanoidBoneMap;
  readonly restPose?: "t-pose" | "a-pose" | "bind-pose" | "unknown" | string;
  readonly scale?: number | "uniform" | "source-units" | "target-units" | string;
  readonly constraints?: readonly (AuraAnimationRetargetConstraint | AuraAnimationRetargetConstraintCode)[];
  readonly externalLibrary?: AuraExternalHumanoidAnimationLibraryBindingMetadata;
  readonly metadata?: Record<string, unknown>;
}

export type AuraAnimationLayerBodyMask = "full-body" | "upper-body" | "lower-body" | "custom" | string;
export type AuraAnimationLayerRole =
  | "base"
  | "locomotion"
  | "attack"
  | "reaction"
  | "upper-body"
  | "lower-body"
  | "additive"
  | "custom"
  | string;

export interface AuraAnimationLayerMetadata {
  readonly id: string;
  readonly role?: AuraAnimationLayerRole;
  readonly bodyMask?: AuraAnimationLayerBodyMask;
  readonly bones?: readonly string[];
  readonly excludedBones?: readonly string[];
  readonly additive?: boolean;
  readonly priority?: number;
  readonly restartFromFrameZero?: boolean;
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;
}

export type AuraAnimationClipEventSourceKind =
  | "source-clip"
  | "retargeted-source-clip"
  | "pose-baked-fallback"
  | "runtime-node-binding"
  | string;

export interface AuraAnimationClipEventSourceMetadata<TClipId extends string = string> {
  readonly kind: AuraAnimationClipEventSourceKind;
  readonly semantics: "clip-local-time";
  readonly clipId: TClipId;
  readonly playbackId: string;
  readonly layer: string;
  readonly localTime: number;
  readonly previousLocalTime: number;
  readonly normalizedTime: number;
  readonly controllerTime: number;
  readonly loopCount: number;
  readonly retargeted: boolean;
  readonly poseBakedFallback: boolean;
  readonly sourceAssetId?: string;
  readonly sourceAssetName?: string;
  readonly sourceClipId?: string;
  readonly metadata?: Record<string, unknown>;
}

export type AuraAnimationControllerClipEventInvocation<
  TEvent extends AnimationClipEvent = AnimationClipEvent,
  TClipId extends string = string
> = AnimationClipEventInvocation<TEvent, TClipId> & {
  readonly source: AuraAnimationClipEventSourceMetadata<TClipId>;
};

export interface AuraAnimationRootMotionMetadata {
  readonly track?: string;
  readonly bone?: string;
  readonly suppress?: boolean;
  readonly suppressTranslation?: boolean;
  readonly suppressRotation?: boolean;
  readonly reason?: string;
}

export interface AuraPoseBakedFallbackMetadata {
  readonly pose: AnimationPose;
  readonly source?: string;
  readonly reason?: string;
}

export interface AuraPoseBakedFallbackRuntimeMetadata<TClipId extends string = string> {
  readonly enabled: boolean;
  readonly source?: string;
  readonly reason?: string;
  readonly sourceClipId?: TClipId;
  readonly sourceAssetId?: string;
  readonly sourceAssetName?: string;
  readonly fallbackKind?: "clip-pose" | "clip-fallback-pose" | "clip-metadata" | "registry-pose" | "skeleton-bind-pose" | "empty-pose" | string;
}

export interface AuraAnimationClipMetadata {
  readonly embeddedGLB?: boolean;
  readonly assetId?: string;
  readonly assetName?: string;
  readonly source?: string;
  readonly layer?: AuraAnimationLayerMetadata;
  readonly eventSource?: AuraAnimationClipEventSourceKind;
  readonly restartFromFrameZero?: boolean;
  readonly attack?: boolean;
  readonly retarget?: AuraAnimationRetargetBindingMetadata;
  readonly externalHumanoidLibrary?: AuraExternalHumanoidAnimationLibraryBindingMetadata;
  readonly rootMotion?: AuraAnimationRootMotionMetadata;
  readonly suppressRootMotion?: boolean;
  readonly poseBakedFallback?: boolean | AuraPoseBakedFallbackMetadata | AnimationPose;
  readonly poseBakedFallbackMetadata?: AuraPoseBakedFallbackRuntimeMetadata;
  readonly [key: string]: unknown;
}

export interface AuraNamedAnimationClipDefinition<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> extends Omit<AnimationClipDefinition<TClipId, TEvent, AnimationPose>, "metadata" | "sample" | "tracks"> {
  readonly layer?: string;
  readonly tracks?: readonly AnimationClipTrack[];
  readonly layerMetadata?: AuraAnimationLayerMetadata;
  readonly requiredBones?: readonly string[];
  readonly bones?: readonly string[];
  readonly rootMotion?: AuraAnimationRootMotionMetadata;
  readonly suppressRootMotion?: boolean;
  readonly restartFromFrameZero?: boolean;
  readonly attack?: boolean;
  readonly eventSource?: AuraAnimationClipEventSourceKind;
  readonly retarget?: AuraAnimationRetargetBindingMetadata;
  readonly externalHumanoidLibrary?: AuraExternalHumanoidAnimationLibraryBindingMetadata;
  readonly pose?: AnimationPose;
  readonly fallbackPose?: AnimationPose;
  readonly metadata?: AuraAnimationClipMetadata;
  readonly sample?: (context: AuraAnimationClipSampleContext<TClipId, TEvent>) => AnimationPose;
}

export interface AuraAnimationClipSampleContext<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> {
  readonly clip: AuraRegisteredAnimationClip<TClipId, TEvent>;
  readonly time: number;
  readonly normalizedTime: number;
  readonly playbackState?: AuraAnimationClipPlaybackState<TClipId>;
}

export interface AuraEmbeddedGLBClipMetadata<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> {
  readonly id?: TClipId;
  readonly name?: string;
  readonly duration?: number;
  readonly frameRate?: number;
  readonly loop?: boolean;
  readonly tags?: readonly string[];
  readonly tracks?: readonly AnimationClipTrack[];
  readonly events?: readonly TEvent[];
  readonly layer?: string;
  readonly layerMetadata?: AuraAnimationLayerMetadata;
  readonly bones?: readonly string[];
  readonly requiredBones?: readonly string[];
  readonly rootMotion?: AuraAnimationRootMotionMetadata;
  readonly suppressRootMotion?: boolean;
  readonly restartFromFrameZero?: boolean;
  readonly attack?: boolean;
  readonly eventSource?: AuraAnimationClipEventSourceKind;
  readonly retarget?: AuraAnimationRetargetBindingMetadata;
  readonly externalHumanoidLibrary?: AuraExternalHumanoidAnimationLibraryBindingMetadata;
  readonly pose?: AnimationPose;
  readonly fallbackPose?: AnimationPose;
  readonly metadata?: AuraAnimationClipMetadata;
}

export interface AuraEmbeddedGLBClipRegistryMetadata<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> {
  readonly kind?: "aura3d-embedded-glb-animation-registry" | string;
  readonly assetId?: string;
  readonly assetName?: string;
  readonly clips?: readonly (TClipId | AuraEmbeddedGLBClipMetadata<TClipId, TEvent>)[];
  readonly animations?: readonly (TClipId | AuraEmbeddedGLBClipMetadata<TClipId, TEvent>)[];
  readonly skeleton?: AuraAnimationSkeletonMetadata;
  readonly bones?: readonly AuraAnimationBoneMetadataInput[];
  readonly layers?: readonly AuraAnimationLayerMetadata[];
  readonly retarget?: AuraAnimationRetargetBindingMetadata;
  readonly externalHumanoidLibrary?: AuraExternalHumanoidAnimationLibraryBindingMetadata;
  readonly rootMotion?: AuraAnimationRootMotionMetadata;
  readonly suppressRootMotion?: boolean;
  readonly poseBakedFallback?: AnimationPose | AuraPoseBakedFallbackMetadata;
  readonly metadata?: Record<string, unknown>;
}

export interface AuraAnimationAssetMetadataLike {
  readonly animations?: readonly (string | AuraEmbeddedGLBClipMetadata)[];
  readonly animationClips?: readonly (string | AuraEmbeddedGLBClipMetadata)[];
  readonly animation?: AuraEmbeddedGLBClipRegistryMetadata;
  readonly skeleton?: AuraAnimationSkeletonMetadata;
  readonly bones?: readonly AuraAnimationBoneMetadataInput[];
  readonly layers?: readonly AuraAnimationLayerMetadata[];
  readonly retarget?: AuraAnimationRetargetBindingMetadata;
  readonly externalHumanoidLibrary?: AuraExternalHumanoidAnimationLibraryBindingMetadata;
  readonly rootMotion?: AuraAnimationRootMotionMetadata;
  readonly suppressRootMotion?: boolean;
  readonly poseBakedFallback?: AnimationPose | AuraPoseBakedFallbackMetadata;
  readonly [key: string]: unknown;
}

export interface AuraAnimationAssetLike {
  readonly id?: string;
  readonly name?: string;
  readonly url?: string;
  readonly hash?: string;
  readonly metadata?: AuraAnimationAssetMetadataLike;
}

export interface AuraAnimationFadeState {
  readonly kind: "in" | "out";
  readonly elapsed: number;
  readonly duration: number;
  readonly fromWeight: number;
  readonly toWeight: number;
}

export interface AuraAnimationClipPlaybackState<TClipId extends string = string> {
  readonly id: string;
  readonly clipId: TClipId;
  readonly status: AuraAnimationPlaybackStatus;
  readonly localTime: number;
  readonly previousLocalTime: number;
  readonly normalizedTime: number;
  readonly duration: number;
  readonly speed: number;
  readonly weight: number;
  readonly targetWeight: number;
  readonly effectiveWeight: number;
  readonly layer: string;
  readonly layerMetadata?: AuraAnimationLayerMetadata;
  readonly layerWeight: number;
  readonly loopMode: AnimationLoopMode;
  readonly loopCount: number;
  readonly direction: AnimationPlaybackDirection;
  readonly completed: boolean;
  readonly rootMotionSuppressed: boolean;
  readonly restartFromFrameZero: boolean;
  readonly eventSource: AuraAnimationClipEventSourceKind;
  readonly poseBakedFallback?: AuraPoseBakedFallbackRuntimeMetadata<TClipId>;
  readonly metadata?: Record<string, unknown>;
  readonly fade?: AuraAnimationFadeState;
}

export interface AuraAnimationPlayOptions<TClipId extends string = string> {
  readonly id?: string;
  readonly restart?: boolean;
  readonly exclusive?: boolean;
  readonly loop?: AnimationLoopMode | boolean;
  readonly speed?: number;
  readonly weight?: number;
  readonly layer?: string;
  readonly startTime?: number;
  readonly fadeIn?: number;
  readonly paused?: boolean;
  readonly direction?: AnimationPlaybackDirection;
  readonly metadata?: Record<string, unknown>;
  readonly fallbackClipId?: TClipId;
  readonly suppressRootMotion?: boolean;
  readonly restartFromFrameZero?: boolean;
  readonly attack?: boolean;
  readonly eventSource?: AuraAnimationClipEventSourceKind;
}

export interface AuraAnimationStopOptions {
  readonly fadeOut?: number;
}

export interface AuraAnimationCrossFadeOptions<TClipId extends string = string> extends AuraAnimationPlayOptions<TClipId> {
  readonly fromClipId?: TClipId;
  readonly fromLayer?: string;
}

export interface AuraAnimationScrubOptions<TClipId extends string = string> {
  readonly clipId?: TClipId;
  readonly emitEvents?: boolean;
  readonly play?: boolean;
  readonly createIfMissing?: boolean;
  readonly layer?: string;
  readonly suppressRootMotion?: boolean;
}

export interface AuraAnimationPoseCaptureOptions<TClipId extends string = string> {
  readonly clipId?: TClipId;
  readonly time?: number;
  readonly emitEvent?: boolean;
  readonly suppressRootMotion?: boolean;
}

export interface AuraAnimationPoseSnapshot<TClipId extends string = string> {
  readonly time: number;
  readonly pose: AnimationPose;
  readonly clips: readonly AuraAnimationClipPlaybackState<TClipId>[];
  readonly diagnostics: readonly AuraAnimationDiagnostic<TClipId>[];
}

export interface AuraAnimationControllerSnapshot<TClipId extends string = string> {
  readonly time: number;
  readonly id?: string;
  readonly activeClipId?: TClipId;
  readonly clips: readonly AuraAnimationClipPlaybackState<TClipId>[];
  readonly layers: Record<string, number>;
  readonly layerMetadata: Record<string, AuraAnimationLayerMetadata>;
  readonly diagnostics: readonly AuraAnimationDiagnostic<TClipId>[];
  readonly rootMotionSuppressed: boolean;
  readonly runtimeNodeBindings: readonly AuraAnimationRuntimeNodeBindingSnapshot<TClipId>[];
  readonly retarget?: AuraAnimationRetargetSnapshot<TClipId>;
  readonly embeddedGLB?: {
    readonly assetId?: string;
    readonly assetName?: string;
    readonly clipCount: number;
    readonly skeletonBones: number;
    readonly poseBakedFallback: boolean;
  };
}

export interface AuraAnimationRuntimeNodeBindingOptions<TClipId extends string = string> {
  readonly id?: string;
  readonly defaultClipId?: TClipId;
  readonly fallbackClipId?: TClipId;
  readonly layer?: string;
  readonly applyOnUpdate?: boolean;
  readonly applyPose?: boolean;
  readonly applyMorphTargets?: boolean;
  readonly applyImportedRuntime?: boolean;
  readonly importedRuntime?: AuraAnimationImportedRuntimeLike;
  readonly syncSpeed?: boolean;
  readonly syncLoop?: boolean;
  readonly syncCaptureTime?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface AuraAnimationRuntimeClipSample<TClipId extends string = string> {
  readonly clipId: TClipId;
  readonly clipName: string;
  readonly localTime: number;
  readonly weight: number;
  readonly layer?: string;
  readonly additive?: boolean;
}

export interface AuraAnimationImportedRuntimeClipSample {
  readonly clipName: string;
  readonly time: number;
  readonly weight?: number;
  readonly additive?: boolean;
}

export interface AuraAnimationImportedRuntimeLike {
  applyClip?(name: string, time: number): unknown;
  applyClipByName?(name: string, time: number): unknown;
  blendClips?(samples: readonly AuraAnimationImportedRuntimeClipSample[]): unknown;
  applyClips?(samples: readonly AuraAnimationImportedRuntimeClipSample[]): unknown;
  snapshot?(): unknown;
}

export interface AuraAnimationImportedRuntimeApplySnapshot {
  readonly applied: boolean;
  readonly blended: boolean;
  readonly sampleCount: number;
  readonly applyResult?: unknown;
  readonly runtimeSnapshot?: unknown;
}

export interface AuraAnimationRuntimeNodeBindingSnapshot<TClipId extends string = string> {
  readonly id: string;
  readonly nodeId: string;
  readonly source: "animation-controller";
  readonly controllerId?: string;
  readonly activeClipId?: TClipId;
  readonly appliedClipId?: TClipId;
  readonly playbackId?: string;
  readonly layer?: string;
  readonly layerMetadata?: AuraAnimationLayerMetadata;
  readonly localTime?: number;
  readonly captureTime?: number;
  readonly loop?: boolean;
  readonly speed?: number;
  readonly pose?: AnimationPose;
  readonly morphTargets?: Record<string, number>;
  readonly boneCount: number;
  readonly morphTargetCount: number;
  readonly clipSamples: readonly AuraAnimationRuntimeClipSample<TClipId>[];
  readonly importedRuntime?: AuraAnimationImportedRuntimeApplySnapshot;
  readonly poseBakedFallback: boolean;
  readonly retargeted: boolean;
  readonly sourceAssetId?: string;
  readonly sourceAssetName?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuraAnimationRuntimeNodeBinding<TClipId extends string = string> {
  readonly id: string;
  readonly nodeId: string;
  readonly node: RuntimeNodeHandleLike;
  update(): AuraAnimationRuntimeNodeBindingSnapshot<TClipId>;
  snapshot(): AuraAnimationRuntimeNodeBindingSnapshot<TClipId>;
  dispose(): void;
}

export interface AuraAnimationRetargetSnapshot<TClipId extends string = string> {
  readonly enabled: boolean;
  readonly externalLibrary?: string;
  readonly sourceAssetId?: string;
  readonly sourceAssetName?: string;
  readonly sourceClipIds: readonly TClipId[];
  readonly constraints: readonly AuraAnimationRetargetConstraint[];
  readonly diagnostics: readonly AuraAnimationDiagnostic<TClipId>[];
}

export interface AuraAnimationClipLoopEvent<TClipId extends string = string> {
  readonly clipId: TClipId;
  readonly playbackId: string;
  readonly loopCount: number;
  readonly loopsPassed: number;
}

export interface AuraAnimationCrossFadeEvent<TClipId extends string = string> {
  readonly fromClipIds: readonly TClipId[];
  readonly toClipId: TClipId;
  readonly duration: number;
  readonly layer?: string;
}

export interface AuraAnimationScrubEvent<TClipId extends string = string> {
  readonly clipId: TClipId;
  readonly playbackId: string;
  readonly fromTime: number;
  readonly toTime: number;
}

export interface AuraAnimationControllerEventMap<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> {
  readonly start: AuraAnimationClipPlaybackState<TClipId>;
  readonly end: AuraAnimationClipPlaybackState<TClipId>;
  readonly loop: AuraAnimationClipLoopEvent<TClipId>;
  readonly event: AuraAnimationControllerClipEventInvocation<TEvent, TClipId>;
  readonly crossFadeStart: AuraAnimationCrossFadeEvent<TClipId>;
  readonly crossFadeEnd: AuraAnimationCrossFadeEvent<TClipId>;
  readonly crossfadeStart: AuraAnimationCrossFadeEvent<TClipId>;
  readonly crossfadeEnd: AuraAnimationCrossFadeEvent<TClipId>;
  readonly scrub: AuraAnimationScrubEvent<TClipId>;
  readonly poseCaptured: AuraAnimationPoseSnapshot<TClipId>;
  readonly stateChanged: AuraAnimationControllerSnapshot<TClipId>;
  readonly diagnostic: AuraAnimationDiagnostic<TClipId>;
}

export interface AuraAnimationControllerOptions<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> {
  readonly id?: string;
  readonly clips?: readonly AuraNamedAnimationClipDefinition<TClipId, TEvent>[];
  readonly clipRegistry?: AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent> | AuraAnimationAssetLike;
  readonly skeleton?: AuraAnimationSkeletonMetadata;
  readonly layers?: readonly AuraAnimationLayerMetadata[];
  readonly retarget?: AuraAnimationRetargetBindingMetadata;
  readonly externalHumanoidLibrary?: AuraExternalHumanoidAnimationLibraryBindingMetadata;
  readonly requiredClips?: readonly TClipId[];
  readonly requiredBones?: readonly string[];
  readonly suppressRootMotion?: boolean;
  readonly rootMotion?: AuraAnimationRootMotionMetadata;
  readonly poseBakedFallback?: AnimationPose;
  readonly defaultLayer?: string;
}

export interface AuraAnimationDiagnosticsOptions<TClipId extends string = string> {
  readonly requiredClips?: readonly TClipId[];
  readonly requiredBones?: readonly string[];
  readonly requireSkeleton?: boolean;
}

export interface AuraRegisteredAnimationClip<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> extends Omit<RegisteredAnimationClip<TClipId, TEvent, AnimationPose>, "metadata" | "sample"> {
  readonly layer: string;
  readonly layerMetadata?: AuraAnimationLayerMetadata;
  readonly requiredBones: readonly string[];
  readonly bones: readonly string[];
  readonly rootMotion?: AuraAnimationRootMotionMetadata;
  readonly suppressRootMotion: boolean;
  readonly restartFromFrameZero: boolean;
  readonly eventSource: AuraAnimationClipEventSourceKind;
  readonly retarget?: AuraAnimationRetargetBindingMetadata;
  readonly externalHumanoidLibrary?: AuraExternalHumanoidAnimationLibraryBindingMetadata;
  readonly fallbackPose?: AnimationPose;
  readonly poseBakedFallback?: AuraPoseBakedFallbackRuntimeMetadata<TClipId>;
  readonly metadata?: AuraAnimationClipMetadata;
  readonly sample?: (context: AuraAnimationClipSampleContext<TClipId, TEvent>) => AnimationPose;
}

interface InternalPlaybackState<
  TClipId extends string,
  TEvent extends AnimationClipEvent
> extends AuraAnimationClipPlaybackState<TClipId> {
  clip: AuraRegisteredAnimationClip<TClipId, TEvent>;
  status: AuraAnimationPlaybackStatus;
  localTime: number;
  previousLocalTime: number;
  normalizedTime: number;
  speed: number;
  weight: number;
  targetWeight: number;
  layer: string;
  layerMetadata?: AuraAnimationLayerMetadata;
  layerWeight: number;
  loopCount: number;
  direction: AnimationPlaybackDirection;
  inputDirection: AnimationPlaybackDirection;
  completed: boolean;
  playhead: number;
  rootMotionSuppressed: boolean;
  restartFromFrameZero: boolean;
  eventSource: AuraAnimationClipEventSourceKind;
  poseBakedFallback?: AuraPoseBakedFallbackRuntimeMetadata<TClipId>;
  onceEvents: Set<string>;
  fade?: AuraAnimationFadeState;
  metadata?: Record<string, unknown>;
}

interface AdvanceResult {
  readonly loopsPassed: number;
  readonly completed: boolean;
}

interface InternalRuntimeNodeBinding<TClipId extends string> {
  readonly id: string;
  readonly node: RuntimeNodeHandleLike;
  readonly options: AuraAnimationRuntimeNodeBindingOptions<TClipId>;
  snapshot?: AuraAnimationRuntimeNodeBindingSnapshot<TClipId>;
}

type Listener<TPayload> = (payload: TPayload) => void;
type ListenerMap<TEventMap> = Map<string, Set<Listener<TEventMap[keyof TEventMap]>>>;

const defaultLayerName = "base";

export const auraAnimationRetargetDocumentedConstraints: readonly AuraAnimationRetargetConstraint[] = [
  {
    code: "explicit-humanoid-bone-map",
    severity: "error",
    message: "Retargeting requires explicit humanoid bone-map metadata; Aura3D does not infer arbitrary external rigs."
  },
  {
    code: "matching-rest-pose",
    severity: "warning",
    message: "Retargeting metadata must document source and target rest-pose assumptions such as T-pose, A-pose, or bind pose."
  },
  {
    code: "uniform-scale",
    severity: "warning",
    message: "Retargeting supports source-level uniform scale metadata only; runtime proportion warping is not implied."
  },
  {
    code: "root-motion-policy",
    severity: "warning",
    message: "Retargeting metadata must state whether root motion is preserved or suppressed by gameplay."
  },
  {
    code: "no-runtime-ik",
    severity: "info",
    message: "Aura3D source retarget metadata does not claim runtime IK solving."
  },
  {
    code: "no-automatic-proportion-warp",
    severity: "info",
    message: "Aura3D source retarget metadata does not claim automatic humanoid proportion correction."
  }
];

export class AnimationController<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> {
  readonly id?: string;
  private readonly clips = new Map<TClipId, AuraRegisteredAnimationClip<TClipId, TEvent>>();
  private readonly listeners: ListenerMap<AuraAnimationControllerEventMap<TClipId, TEvent>> = new Map();
  private readonly states = new Map<string, InternalPlaybackState<TClipId, TEvent>>();
  private readonly requiredClips: TClipId[];
  private readonly requiredBones: string[];
  private readonly layerWeights = new Map<string, number>();
  private readonly layerMetadata = new Map<string, AuraAnimationLayerMetadata>();
  private readonly runtimeNodeBindings = new Map<string, InternalRuntimeNodeBinding<TClipId>>();
  private readonly defaultLayer: string;
  private embeddedGLB?: AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent>;
  private skeleton?: AuraAnimationSkeletonMetadata;
  private retarget?: AuraAnimationRetargetBindingMetadata;
  private externalHumanoidLibrary?: AuraExternalHumanoidAnimationLibraryBindingMetadata;
  private rootMotion?: AuraAnimationRootMotionMetadata;
  private poseBakedFallback?: AnimationPose;
  private poseBakedFallbackMetadata?: AuraPoseBakedFallbackRuntimeMetadata<TClipId>;
  private suppressRootMotion: boolean;
  private clockTime = 0;
  private nextRegistryIndex = 0;
  private nextPlaybackIndex = 0;
  private pendingCrossFades: AuraAnimationCrossFadeEvent<TClipId>[] = [];

  constructor(options: AuraAnimationControllerOptions<TClipId, TEvent> = {}) {
    this.id = options.id;
    this.defaultLayer = options.defaultLayer ?? defaultLayerName;
    this.requiredClips = [...(options.requiredClips ?? [])];
    this.requiredBones = [...(options.requiredBones ?? [])];
    this.skeleton = options.skeleton;
    this.retarget = normalizeRetargetBinding(options.retarget, options.externalHumanoidLibrary);
    this.externalHumanoidLibrary = options.externalHumanoidLibrary;
    this.rootMotion = options.rootMotion;
    this.poseBakedFallback = clonePose(options.poseBakedFallback);
    this.poseBakedFallbackMetadata = options.poseBakedFallback
      ? {
          enabled: true,
          source: "controller-options",
          fallbackKind: "registry-pose"
        }
      : undefined;
    this.suppressRootMotion = options.suppressRootMotion ?? options.rootMotion?.suppress ?? false;
    this.layerWeights.set(this.defaultLayer, 1);
    this.registerLayerMetadata(inferLayerMetadata(this.defaultLayer));
    for (const layer of options.layers ?? []) {
      this.registerLayerMetadata(layer);
    }

    if (options.clipRegistry) {
      this.registerEmbeddedGLBClips(options.clipRegistry);
    }
    if (options.clips) {
      this.registerClips(options.clips);
    }
  }

  on<K extends Extract<keyof AuraAnimationControllerEventMap<TClipId, TEvent>, string>>(
    type: K,
    listener: Listener<AuraAnimationControllerEventMap<TClipId, TEvent>[K]>
  ): AnimationClipEventUnsubscribe {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener as Listener<AuraAnimationControllerEventMap<TClipId, TEvent>[keyof AuraAnimationControllerEventMap<TClipId, TEvent>]>);
    this.listeners.set(type, listeners);

    return () => {
      const current = this.listeners.get(type);
      if (!current) return;
      current.delete(listener as Listener<AuraAnimationControllerEventMap<TClipId, TEvent>[keyof AuraAnimationControllerEventMap<TClipId, TEvent>]>);
      if (current.size === 0) this.listeners.delete(type);
    };
  }

  once<K extends Extract<keyof AuraAnimationControllerEventMap<TClipId, TEvent>, string>>(
    type: K,
    listener: Listener<AuraAnimationControllerEventMap<TClipId, TEvent>[K]>
  ): AnimationClipEventUnsubscribe {
    const unsubscribe = this.on(type, (payload) => {
      unsubscribe();
      listener(payload);
    });

    return unsubscribe;
  }

  onEvent(listener: Listener<AuraAnimationControllerClipEventInvocation<TEvent, TClipId>>): AnimationClipEventUnsubscribe;
  onEvent(filter: string, listener: Listener<AuraAnimationControllerClipEventInvocation<TEvent, TClipId>>): AnimationClipEventUnsubscribe;
  onEvent(
    filterOrListener: string | Listener<AuraAnimationControllerClipEventInvocation<TEvent, TClipId>>,
    maybeListener?: Listener<AuraAnimationControllerClipEventInvocation<TEvent, TClipId>>
  ): AnimationClipEventUnsubscribe {
    if (typeof filterOrListener === "function") {
      return this.on("event", filterOrListener);
    }

    const filter = filterOrListener;
    const listener = maybeListener;
    if (!listener) {
      throw new Error("onEvent(filter, listener) requires a listener.");
    }

    return this.on("event", (invocation) => {
      const event = invocation.event;
      if (event.name === filter || event.type === filter || event.tags?.includes(filter)) {
        listener(invocation);
      }
    });
  }

  registerClip(
    definition: AuraNamedAnimationClipDefinition<TClipId, TEvent>
  ): AuraRegisteredAnimationClip<TClipId, TEvent> {
    const registered = this.createRegisteredClip(definition);
    this.clips.set(registered.id, registered);
    return registered;
  }

  registerClips(
    definitions: readonly AuraNamedAnimationClipDefinition<TClipId, TEvent>[]
  ): readonly AuraRegisteredAnimationClip<TClipId, TEvent>[] {
    return definitions.map((definition) => this.registerClip(definition));
  }

  registerLayerMetadata(layer: AuraAnimationLayerMetadata): AuraAnimationLayerMetadata {
    const normalized = cloneLayerMetadata(layer);
    this.layerMetadata.set(normalized.id, normalized);
    if (!this.layerWeights.has(normalized.id)) {
      this.layerWeights.set(normalized.id, 1);
    }
    return normalized;
  }

  getLayerMetadata(layer: string): AuraAnimationLayerMetadata | undefined {
    return this.layerMetadata.get(layer);
  }

  listLayerMetadata(): readonly AuraAnimationLayerMetadata[] {
    return [...this.layerMetadata.values()];
  }

  bindRuntimeNode(
    node: RuntimeNodeHandleLike,
    options: AuraAnimationRuntimeNodeBindingOptions<TClipId> = {}
  ): AuraAnimationRuntimeNodeBinding<TClipId> {
    const id = options.id ?? `${node.id}:animation`;
    const binding: InternalRuntimeNodeBinding<TClipId> = {
      id,
      node,
      options: {
        applyOnUpdate: true,
        applyPose: true,
        applyMorphTargets: true,
        syncCaptureTime: true,
        syncLoop: true,
        syncSpeed: true,
        ...options,
        id
      }
    };
    this.runtimeNodeBindings.set(id, binding);
    binding.snapshot = this.applyRuntimeNodeBinding(binding);

    return {
      id,
      nodeId: node.id,
      node,
      update: () => this.applyRuntimeNodeBinding(binding),
      snapshot: () => binding.snapshot ?? this.createRuntimeNodeBindingSnapshot(binding),
      dispose: () => {
        this.runtimeNodeBindings.delete(id);
        if (typeof node.setAnimationBinding === "function") {
          node.setAnimationBinding(undefined);
        }
        if (typeof node.setAnimationPose === "function") {
          node.setAnimationPose(undefined);
        }
        if (typeof node.setMorphTargets === "function") {
          node.setMorphTargets({});
        }
      }
    };
  }

  unbindRuntimeNode(idOrNode: string | RuntimeNodeHandleLike): void {
    const id = typeof idOrNode === "string" ? idOrNode : `${idOrNode.id}:animation`;
    const binding = this.runtimeNodeBindings.get(id);
    if (binding && typeof binding.node.setAnimationBinding === "function") {
      binding.node.setAnimationBinding(undefined);
    }
    if (binding && typeof binding.node.setAnimationPose === "function") {
      binding.node.setAnimationPose(undefined);
    }
    if (binding && typeof binding.node.setMorphTargets === "function") {
      binding.node.setMorphTargets({});
    }
    this.runtimeNodeBindings.delete(id);
  }

  runtimeNodeBindingSnapshots(): readonly AuraAnimationRuntimeNodeBindingSnapshot<TClipId>[] {
    return [...this.runtimeNodeBindings.values()].map((binding) => binding.snapshot ?? this.createRuntimeNodeBindingSnapshot(binding));
  }

  registerEmbeddedGLBClips(
    source: AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent> | AuraAnimationAssetLike
  ): readonly AuraRegisteredAnimationClip<TClipId, TEvent>[] {
    const registry = createEmbeddedGLBAnimationClipRegistryMetadata<TClipId, TEvent>(source);
    this.embeddedGLB = registry;
    this.skeleton = registry.skeleton ?? this.skeleton;
    for (const layer of registry.layers ?? []) {
      this.registerLayerMetadata(layer);
    }
    this.externalHumanoidLibrary = registry.externalHumanoidLibrary ?? this.externalHumanoidLibrary;
    this.retarget = normalizeRetargetBinding(registry.retarget ?? this.retarget, registry.externalHumanoidLibrary ?? this.externalHumanoidLibrary);
    this.rootMotion = registry.rootMotion ?? this.rootMotion;
    this.suppressRootMotion = registry.suppressRootMotion ?? registry.rootMotion?.suppress ?? this.suppressRootMotion;
    this.poseBakedFallback = clonePose(extractPoseBakedFallback(registry.poseBakedFallback)) ?? this.poseBakedFallback ?? createIdentityPose(this.skeleton);
    this.poseBakedFallbackMetadata = extractPoseBakedFallbackRuntimeMetadata(registry.poseBakedFallback, {
      enabled: Boolean(this.poseBakedFallback),
      source: "embedded-glb-registry",
      sourceAssetId: registry.assetId,
      sourceAssetName: registry.assetName,
      fallbackKind: "registry-pose"
    }) ?? this.poseBakedFallbackMetadata;

    const clips = registry.clips ?? registry.animations ?? [];
    return clips.map((clipInput) => {
      const definition = embeddedClipToDefinition(clipInput, registry, this.defaultLayer);
      return this.registerClip(definition);
    });
  }

  play(clipId: TClipId, options: AuraAnimationPlayOptions<TClipId> = {}): AuraAnimationClipPlaybackState<TClipId> {
    const resolvedClipId = this.clips.has(clipId) ? clipId : options.fallbackClipId;
    if (!resolvedClipId || !this.clips.has(resolvedClipId)) {
      const diagnostic = createDiagnostic<TClipId>(
        "error",
        "ANIMATION_CLIP_MISSING",
        `Animation clip "${clipId}" is not registered.`,
        clipId
      );
      this.emit("diagnostic", diagnostic);
      throw new Error(diagnostic.message);
    }

    const clip = this.requireClip(resolvedClipId);
    const restartFromFrameZero = shouldRestartFromFrameZero(clip, options, this.layerMetadata);
    const shouldRestart = options.restart === true || restartFromFrameZero;
    const playOptions = restartFromFrameZero
      ? {
          ...options,
          restart: true,
          startTime: 0,
          metadata: {
            ...options.metadata,
            restartFromFrameZero: true
          }
        }
      : options;
    const existing = this.findStateByClip(resolvedClipId);
    if (existing && !shouldRestart) {
      existing.status = options.paused ? "paused" : "playing";
      existing.speed = sanitizeSpeed(options.speed ?? existing.speed);
      existing.targetWeight = sanitizeWeight(options.weight ?? existing.targetWeight);
      existing.weight = existing.fade ? existing.weight : existing.targetWeight;
      existing.layer = options.layer ?? existing.layer;
      existing.layerMetadata = this.layerMetadata.get(existing.layer) ?? inferLayerMetadata(existing.layer);
      existing.layerWeight = this.layerWeight(existing.layer);
      existing.inputDirection = options.direction ?? existing.inputDirection;
      existing.rootMotionSuppressed = shouldSuppressRootMotion(options, existing.clip, this.suppressRootMotion);
      existing.eventSource = options.eventSource ?? existing.clip.eventSource;
      existing.metadata = options.metadata ?? existing.metadata;
      this.applyRuntimeNodeBindings();
      this.emitStateChanged();
      return cloneState(existing);
    }

    if (existing && shouldRestart) {
      this.states.delete(existing.id);
      this.endState(existing, "stopped");
    }

    if (options.exclusive ?? true) {
      for (const state of this.getInternalStates()) {
        this.endState(state, "stopped");
      }
      this.states.clear();
    }

    const playback = this.createPlaybackState(clip, playOptions);
    this.states.set(playback.id, playback);
    this.emit("start", cloneState(playback));
    this.applyRuntimeNodeBindings();
    this.emitStateChanged();
    return cloneState(playback);
  }

  pause(clipId?: TClipId): void {
    for (const state of this.selectStates(clipId)) {
      if (state.status === "playing") state.status = "paused";
    }
    this.applyRuntimeNodeBindings();
    this.emitStateChanged();
  }

  resume(clipId?: TClipId): void {
    for (const state of this.selectStates(clipId)) {
      if (state.status === "paused") state.status = "playing";
    }
    this.applyRuntimeNodeBindings();
    this.emitStateChanged();
  }

  restart(clipId?: TClipId, options: AuraAnimationPlayOptions<TClipId> = {}): AuraAnimationClipPlaybackState<TClipId> {
    const resolvedClipId = clipId ?? this.activeClipId();
    if (!resolvedClipId) {
      throw new Error("Cannot restart animation without an active clip or clipId.");
    }

    return this.play(resolvedClipId, {
      ...options,
      restart: true
    });
  }

  stop(clipId?: TClipId, options: AuraAnimationStopOptions = {}): void {
    const targets = this.selectStates(clipId);
    const fadeOut = sanitizeDuration(options.fadeOut ?? 0);

    for (const state of targets) {
      if (fadeOut > 0) {
        state.fade = {
          kind: "out",
          elapsed: 0,
          duration: fadeOut,
          fromWeight: state.weight,
          toWeight: 0
        };
        state.targetWeight = 0;
      } else {
        this.states.delete(state.id);
        this.endState(state, "stopped");
      }
    }

    this.applyRuntimeNodeBindings();
    this.emitStateChanged();
  }

  crossFade(
    toClipId: TClipId,
    duration: number,
    options: AuraAnimationCrossFadeOptions<TClipId> = {}
  ): AuraAnimationClipPlaybackState<TClipId> {
    const fadeDuration = sanitizeDuration(duration);
    const fromStates = this.selectCrossFadeSources(options);
    const fromClipIds = fromStates.map((state) => state.clipId);
    const layer = options.layer ?? options.fromLayer ?? fromStates[0]?.layer;
    const event: AuraAnimationCrossFadeEvent<TClipId> = {
      fromClipIds,
      toClipId,
      duration: fadeDuration,
      layer
    };

    this.emit("crossFadeStart", event);
    this.emit("crossfadeStart", event);
    this.pendingCrossFades.push(event);

    for (const state of fromStates) {
      state.fade = {
        kind: "out",
        elapsed: 0,
        duration: fadeDuration,
        fromWeight: state.weight,
        toWeight: 0
      };
      state.targetWeight = 0;
    }

    const next = this.play(toClipId, {
      ...options,
      exclusive: false,
      restart: true,
      fadeIn: fadeDuration,
      weight: options.weight ?? 1,
      layer: options.layer ?? layer
    });

    if (fadeDuration === 0) {
      this.finishCrossFade(event);
    }

    return next;
  }

  crossfade(
    toClipId: TClipId,
    duration: number,
    options: AuraAnimationCrossFadeOptions<TClipId> = {}
  ): AuraAnimationClipPlaybackState<TClipId> {
    return this.crossFade(toClipId, duration, options);
  }

  setLayerWeight(layer: string, weight: number): this {
    const cleanLayer = layer.trim() || this.defaultLayer;
    const cleanWeight = sanitizeWeight(weight);
    this.layerWeights.set(cleanLayer, cleanWeight);
    for (const state of this.getInternalStates()) {
      if (state.layer === cleanLayer) {
        state.layerWeight = cleanWeight;
      }
    }
    this.applyRuntimeNodeBindings();
    this.emitStateChanged();
    return this;
  }

  setWeight(weight: number, layer: string = this.defaultLayer): this {
    return this.setLayerWeight(layer, weight);
  }

  update(dt: number): AuraAnimationControllerSnapshot<TClipId> {
    if (!Number.isFinite(dt) || dt === 0) {
      return this.snapshot();
    }

    this.clockTime += dt;
    const endedStates: InternalPlaybackState<TClipId, TEvent>[] = [];

    for (const state of this.getInternalStates()) {
      this.updateFade(state, Math.abs(dt));

      if (state.status !== "playing") {
        continue;
      }

      const advance = advanceState(state, dt);
      this.emitSampledEvents(state);

      if (advance.loopsPassed > 0) {
        this.emit("loop", {
          clipId: state.clipId,
          playbackId: state.id,
          loopCount: state.loopCount,
          loopsPassed: advance.loopsPassed
        });
      }

      if (advance.completed) {
        state.status = "completed";
        state.completed = true;
        endedStates.push(state);
      }
    }

    for (const state of endedStates) {
      this.endState(state, "completed");
    }

    this.removeFinishedFadeOuts();
    this.finishCrossFadesIfReady();
    this.applyRuntimeNodeBindings();
    this.emitStateChanged();
    return this.snapshot();
  }

  scrub(time: number, options?: AuraAnimationScrubOptions<TClipId>): AuraAnimationPoseSnapshot<TClipId>;
  scrub(clipId: TClipId, time: number, options?: AuraAnimationScrubOptions<TClipId>): AuraAnimationPoseSnapshot<TClipId>;
  scrub(
    clipOrTime: TClipId | number,
    timeOrOptions: number | AuraAnimationScrubOptions<TClipId> = {},
    maybeOptions: AuraAnimationScrubOptions<TClipId> = {}
  ): AuraAnimationPoseSnapshot<TClipId> {
    const hasClipId = typeof clipOrTime === "string";
    const time = hasClipId ? Number(timeOrOptions) : clipOrTime;
    const options = hasClipId ? maybeOptions : (timeOrOptions as AuraAnimationScrubOptions<TClipId>);
    const clipId = hasClipId ? clipOrTime : options.clipId ?? this.activeClipId();

    if (!clipId) {
      throw new Error("Cannot scrub without an active clip or clipId.");
    }

    let state = this.findStateByClip(clipId);
    if (!state) {
      if (options.createIfMissing === false) {
        throw new Error(`Cannot scrub inactive animation clip "${clipId}".`);
      }

      this.play(clipId, {
        startTime: time,
        paused: true,
        restart: true,
        layer: options.layer,
        suppressRootMotion: options.suppressRootMotion
      });
      state = this.findStateByClip(clipId);
    }

    if (!state) {
      throw new Error(`Cannot scrub animation clip "${clipId}".`);
    }

    const previousTime = state.localTime;
    state.previousLocalTime = previousTime;
    state.localTime = normalizeStateTime(time, state.duration, state.loopMode);
    state.playhead = state.localTime;
    state.normalizedTime = state.duration > 0 ? state.localTime / state.duration : 0;
    state.completed = false;
    state.status = options.play ? "playing" : "paused";

    if (options.emitEvents) {
      this.emitSampledEvents(state);
    }

    this.emit("scrub", {
      clipId,
      playbackId: state.id,
      fromTime: previousTime,
      toTime: state.localTime
    });
    this.applyRuntimeNodeBindings();
    this.emitStateChanged();
    return this.capturePose({
      clipId,
      emitEvent: false,
      suppressRootMotion: options.suppressRootMotion
    });
  }

  capturePose(options: AuraAnimationPoseCaptureOptions<TClipId> = {}): AuraAnimationPoseSnapshot<TClipId> {
    const states = options.clipId
      ? this.selectStates(options.clipId)
      : this.getInternalStates().filter((state) => effectiveWeight(state) > 0);

    const pose = options.time !== undefined && options.clipId
      ? this.sampleSinglePose(this.requireClip(options.clipId), options.time, undefined, options.suppressRootMotion)
      : this.blendStates(states, options.suppressRootMotion);

    const diagnostics = this.diagnostics();
    const snapshot: AuraAnimationPoseSnapshot<TClipId> = {
      time: this.clockTime,
      pose,
      clips: states.map(cloneState),
      diagnostics
    };

    if (options.emitEvent ?? true) {
      this.emit("poseCaptured", snapshot);
    }

    return snapshot;
  }

  state(clipId?: TClipId): AuraAnimationClipPlaybackState<TClipId> | undefined {
    const state = clipId ? this.findStateByClip(clipId) : this.primaryState();
    return state ? cloneState(state) : undefined;
  }

  snapshot(): AuraAnimationControllerSnapshot<TClipId> {
    return {
      time: this.clockTime,
      id: this.id,
      activeClipId: this.activeClipId(),
      clips: this.getInternalStates().map(cloneState),
      layers: Object.fromEntries(this.layerWeights.entries()),
      layerMetadata: Object.fromEntries([...this.layerMetadata.entries()].map(([id, metadata]) => [id, cloneLayerMetadata(metadata)])),
      diagnostics: this.diagnostics(),
      rootMotionSuppressed: this.suppressRootMotion,
      runtimeNodeBindings: this.runtimeNodeBindingSnapshots(),
      retarget: this.retargetSnapshot(),
      embeddedGLB: this.embeddedGLB
        ? {
            assetId: this.embeddedGLB.assetId,
            assetName: this.embeddedGLB.assetName,
            clipCount: (this.embeddedGLB.clips ?? this.embeddedGLB.animations ?? []).length,
            skeletonBones: skeletonBoneNames(this.skeleton).size,
            poseBakedFallback: Boolean(this.poseBakedFallback)
          }
        : undefined
    };
  }

  diagnostics(options: AuraAnimationDiagnosticsOptions<TClipId> = {}): readonly AuraAnimationDiagnostic<TClipId>[] {
    const diagnostics: AuraAnimationDiagnostic<TClipId>[] = [];
    const clips = this.listClips();
    const requiredClips = [...this.requiredClips, ...(options.requiredClips ?? [])];
    const requiredBones = [...this.requiredBones, ...(options.requiredBones ?? [])];
    const skeletonBones = skeletonBoneNames(this.skeleton);
    const hasSkeleton = skeletonBones.size > 0;
    const requiresSkeleton = options.requireSkeleton === true || requiredBones.length > 0 || clips.some((clip) => clip.requiredBones.length > 0);

    if (clips.length === 0) {
      diagnostics.push(createDiagnostic("error", "ANIMATION_CLIPS_MISSING", "No animation clips are registered."));
    }

    if (requiresSkeleton && !hasSkeleton) {
      diagnostics.push(createDiagnostic("error", "ANIMATION_SKELETON_MISSING", "Animation controller is missing skeleton metadata."));
    }

    for (const requiredClip of requiredClips) {
      if (!this.clips.has(requiredClip)) {
        diagnostics.push(
          createDiagnostic("error", "ANIMATION_REQUIRED_CLIP_MISSING", `Required animation clip "${requiredClip}" is missing.`, requiredClip)
        );
      }
    }

    for (const requiredBone of requiredBones) {
      if (hasSkeleton && !skeletonBones.has(requiredBone)) {
        diagnostics.push(createDiagnostic<TClipId>("error", "ANIMATION_REQUIRED_BONE_MISSING", `Required bone "${requiredBone}" is missing.`, undefined, requiredBone));
      }
    }

    diagnostics.push(...this.retargetDiagnostics(options));

    for (const clip of clips) {
      if (clip.tracks.length === 0) {
        diagnostics.push(
          createDiagnostic(
            clip.sample ? "info" : "warning",
            "ANIMATION_CLIP_EMPTY_TRACKS",
            `Animation clip "${clip.id}" has no tracks${clip.sample ? " and will use a sampler or pose-baked fallback." : "."}`,
            clip.id
          )
        );
      }

      for (const requiredBone of clip.requiredBones) {
        if (hasSkeleton && !skeletonBones.has(requiredBone)) {
          diagnostics.push(
            createDiagnostic(
              "error",
              "ANIMATION_BONE_MISSING",
              `Animation clip "${clip.id}" requires missing bone "${requiredBone}".`,
              clip.id,
              requiredBone
            )
          );
        }
      }

      for (const track of clip.tracks) {
        if (!track.keyframes || track.keyframes.length === 0) {
          diagnostics.push(
            createDiagnostic(
              "warning",
              "ANIMATION_TRACK_EMPTY",
              `Animation clip "${clip.id}" has an empty track "${track.id ?? track.target}".`,
              clip.id,
              undefined,
              track.id ?? track.target
            )
          );
        }

        const bone = boneNameFromTrackTarget(track.target);
        if (bone && hasSkeleton && !skeletonBones.has(bone)) {
          diagnostics.push(
            createDiagnostic(
              "error",
              "ANIMATION_BONE_MISSING",
              `Animation clip "${clip.id}" targets missing bone "${bone}".`,
              clip.id,
              bone,
              track.id ?? track.target
            )
          );
        }
      }
    }

    for (const binding of this.runtimeNodeBindings.values()) {
      if (typeof binding.node.play !== "function" && typeof binding.node.setAnimation !== "function") {
        diagnostics.push(
          createDiagnostic(
            "warning",
            "ANIMATION_RUNTIME_NODE_BINDING_UNSUPPORTED",
            `Runtime node "${binding.node.id}" is bound to an AnimationController but does not expose play() or setAnimation().`
          )
        );
      }
      if (binding.options.applyPose !== false && typeof binding.node.setAnimationPose !== "function") {
        diagnostics.push(
          createDiagnostic(
            "warning",
            "ANIMATION_RUNTIME_NODE_POSE_BINDING_UNSUPPORTED",
            `Runtime node "${binding.node.id}" is bound to an AnimationController but does not expose setAnimationPose().`
          )
        );
      }
      if (binding.options.applyMorphTargets !== false && typeof binding.node.setMorphTargets !== "function") {
        diagnostics.push(
          createDiagnostic(
            "warning",
            "ANIMATION_RUNTIME_NODE_MORPH_BINDING_UNSUPPORTED",
            `Runtime node "${binding.node.id}" is bound to an AnimationController but does not expose setMorphTargets().`
          )
        );
      }
      if (binding.options.layer && !this.layerWeights.has(binding.options.layer)) {
        diagnostics.push(
          createDiagnostic(
            "warning",
            "ANIMATION_RUNTIME_NODE_BINDING_LAYER_MISSING",
            `Runtime node binding "${binding.id}" targets unknown animation layer "${binding.options.layer}".`
          )
        );
      }
    }

    return diagnostics;
  }

  retargetDiagnostics(options: AuraAnimationDiagnosticsOptions<TClipId> = {}): readonly AuraAnimationDiagnostic<TClipId>[] {
    return this.createRetargetDiagnostics(options);
  }

  diagnose(options?: AuraAnimationDiagnosticsOptions<TClipId>): readonly AuraAnimationDiagnostic<TClipId>[] {
    return this.diagnostics(options);
  }

  clipIds(): readonly TClipId[] {
    return this.listClips().map((clip) => clip.id);
  }

  listClips(): readonly AuraRegisteredAnimationClip<TClipId, TEvent>[] {
    return [...this.clips.values()].sort((a, b) => a.registryIndex - b.registryIndex);
  }

  getClip(clipId: TClipId): AuraRegisteredAnimationClip<TClipId, TEvent> | undefined {
    return this.clips.get(clipId);
  }

  requireClip(clipId: TClipId): AuraRegisteredAnimationClip<TClipId, TEvent> {
    const clip = this.getClip(clipId);
    if (!clip) {
      throw new Error(`Animation clip "${clipId}" is not registered.`);
    }
    return clip;
  }

  embeddedGLBClipRegistryMetadata(): AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent> | undefined {
    return this.embeddedGLB;
  }

  dispose(): void {
    this.states.clear();
    this.listeners.clear();
    for (const binding of this.runtimeNodeBindings.values()) {
      if (typeof binding.node.setAnimationBinding === "function") {
        binding.node.setAnimationBinding(undefined);
      }
      if (typeof binding.node.setAnimationPose === "function") {
        binding.node.setAnimationPose(undefined);
      }
      if (typeof binding.node.setMorphTargets === "function") {
        binding.node.setMorphTargets({});
      }
    }
    this.runtimeNodeBindings.clear();
    this.pendingCrossFades = [];
  }

  private createRegisteredClip(
    definition: AuraNamedAnimationClipDefinition<TClipId, TEvent>
  ): AuraRegisteredAnimationClip<TClipId, TEvent> {
    if (!definition.id) {
      throw new Error("Animation clips must have a stable id.");
    }
    if (!Number.isFinite(definition.duration) || definition.duration < 0) {
      throw new Error(`Animation clip "${definition.id}" has an invalid duration.`);
    }

    const fallbackPose =
      clonePose(definition.pose) ??
      clonePose(definition.fallbackPose) ??
      clonePose(extractPoseBakedFallback(definition.metadata?.poseBakedFallback)) ??
      clonePose(this.poseBakedFallback) ??
      createIdentityPose(this.skeleton);
    const tracks = [...(definition.tracks ?? [])];
    const layer = definition.layer ?? definition.metadata?.layer?.id ?? this.defaultLayer;
    const layerMetadata = cloneLayerMetadata(definition.layerMetadata ?? definition.metadata?.layer ?? this.layerMetadata.get(layer) ?? inferLayerMetadata(layer));
    this.registerLayerMetadata(layerMetadata);
    const externalHumanoidLibrary = definition.externalHumanoidLibrary ?? definition.metadata?.externalHumanoidLibrary ?? this.externalHumanoidLibrary;
    const retarget = normalizeRetargetBinding(definition.retarget ?? definition.metadata?.retarget ?? this.retarget, externalHumanoidLibrary);
    const eventSource = definition.eventSource ?? definition.metadata?.eventSource ?? (retarget ? "retargeted-source-clip" : "source-clip");
    const restartFromFrameZero = Boolean(
      definition.restartFromFrameZero ??
      definition.metadata?.restartFromFrameZero ??
      definition.attack ??
      definition.metadata?.attack ??
      layerMetadata.restartFromFrameZero ??
      definition.tags?.includes("attack")
    );
    const poseBakedFallbackMetadata = createPoseBakedFallbackRuntimeMetadata(
      definition.id,
      definition,
      this.embeddedGLB,
      this.poseBakedFallbackMetadata,
      Boolean(fallbackPose) && !definition.sample
    );
    const sample = definition.sample ?? createFallbackSampler(definition.id, tracks, fallbackPose, poseBakedFallbackMetadata);
    const metadata: AuraAnimationClipMetadata = {
      ...definition.metadata,
      layer: layerMetadata,
      eventSource,
      restartFromFrameZero,
      attack: definition.attack ?? definition.metadata?.attack,
      retarget,
      externalHumanoidLibrary,
      rootMotion: definition.rootMotion ?? definition.metadata?.rootMotion,
      suppressRootMotion: definition.suppressRootMotion ?? definition.metadata?.suppressRootMotion,
      poseBakedFallback: Boolean(fallbackPose) && !definition.sample,
      poseBakedFallbackMetadata
    };

    const registered: AuraRegisteredAnimationClip<TClipId, TEvent> = {
      ...definition,
      metadata,
      duration: sanitizeDuration(definition.duration),
      loop: definition.loop ?? true,
      tags: [...(definition.tags ?? [])],
      tracks,
      events: [...(definition.events ?? [])].sort((a, b) => a.time - b.time || a.name.localeCompare(b.name)),
      registryIndex: this.nextRegistryIndex,
      layer,
      layerMetadata,
      requiredBones: [...(definition.requiredBones ?? [])],
      bones: [...(definition.bones ?? [])],
      rootMotion: definition.rootMotion ?? definition.metadata?.rootMotion,
      suppressRootMotion: definition.suppressRootMotion ?? definition.metadata?.suppressRootMotion ?? false,
      restartFromFrameZero,
      eventSource,
      retarget,
      externalHumanoidLibrary,
      fallbackPose,
      poseBakedFallback: poseBakedFallbackMetadata,
      sample
    };

    this.nextRegistryIndex += 1;
    if (!this.layerWeights.has(registered.layer)) {
      this.layerWeights.set(registered.layer, 1);
    }

    return registered;
  }

  private createPlaybackState(
    clip: AuraRegisteredAnimationClip<TClipId, TEvent>,
    options: AuraAnimationPlayOptions<TClipId>
  ): InternalPlaybackState<TClipId, TEvent> {
    const targetWeight = sanitizeWeight(options.weight ?? 1);
    const fadeIn = sanitizeDuration(options.fadeIn ?? 0);
    const loopMode = normalizeLoopMode(options.loop, clip.loop);
    const localTime = normalizeStateTime(options.startTime ?? 0, clip.duration, loopMode);
    const layer = options.layer ?? clip.layer ?? this.defaultLayer;
    const layerMetadata = this.layerMetadata.get(layer) ?? clip.layerMetadata ?? inferLayerMetadata(layer);
    const id = options.id ?? `${clip.id}:${this.nextPlaybackIndex}`;
    this.nextPlaybackIndex += 1;

    return {
      id,
      clip,
      clipId: clip.id,
      status: options.paused ? "paused" : "playing",
      localTime,
      previousLocalTime: localTime,
      normalizedTime: clip.duration > 0 ? localTime / clip.duration : 0,
      duration: clip.duration,
      speed: sanitizeSpeed(options.speed ?? 1),
      weight: fadeIn > 0 ? 0 : targetWeight,
      targetWeight,
      effectiveWeight: 0,
      layer,
      layerMetadata,
      layerWeight: this.layerWeight(layer),
      loopMode,
      loopCount: 0,
      direction: options.direction ?? 1,
      inputDirection: options.direction ?? 1,
      completed: false,
      playhead: localTime,
      rootMotionSuppressed: shouldSuppressRootMotion(options, clip, this.suppressRootMotion),
      restartFromFrameZero: Boolean(options.restartFromFrameZero ?? clip.restartFromFrameZero),
      eventSource: options.eventSource ?? clip.eventSource,
      poseBakedFallback: clip.poseBakedFallback,
      onceEvents: new Set<string>(),
      metadata: options.metadata,
      fade: fadeIn > 0
        ? {
            kind: "in",
            elapsed: 0,
            duration: fadeIn,
            fromWeight: 0,
            toWeight: targetWeight
          }
        : undefined
    };
  }

  private emitSampledEvents(state: InternalPlaybackState<TClipId, TEvent>): void {
    const invocations = sampleClipEvents(
      {
        id: state.clipId,
        duration: state.duration,
        events: state.clip.events
      },
      {
        from: state.previousLocalTime,
        to: state.localTime,
        duration: state.duration,
        loop: state.loopMode !== "once",
        direction: state.direction,
        loopCount: state.loopCount,
        playbackTime: this.clockTime
      }
    );

    for (const invocation of invocations) {
      if (invocation.event.once) {
        const key = animationClipEventKey(invocation.clipId, invocation.event);
        if (state.onceEvents.has(key)) continue;
        state.onceEvents.add(key);
      }

      this.emit("event", {
        ...invocation,
        source: createClipEventSourceMetadata(state, this.clockTime, this.embeddedGLB)
      } as AuraAnimationControllerClipEventInvocation<TEvent, TClipId>);
    }
  }

  private updateFade(state: InternalPlaybackState<TClipId, TEvent>, dt: number): void {
    if (!state.fade) return;

    if (state.fade.duration === 0) {
      state.weight = state.fade.toWeight;
      state.fade = undefined;
      return;
    }

    const elapsed = Math.min(state.fade.duration, state.fade.elapsed + dt);
    const alpha = elapsed / state.fade.duration;
    state.weight = lerp(state.fade.fromWeight, state.fade.toWeight, alpha);
    state.fade = elapsed >= state.fade.duration
      ? undefined
      : {
          ...state.fade,
          elapsed
        };
  }

  private removeFinishedFadeOuts(): void {
    for (const state of this.getInternalStates()) {
      if (state.fade || state.weight > 0 || state.targetWeight > 0) continue;
      this.states.delete(state.id);
      this.endState(state, "stopped");
    }
  }

  private finishCrossFadesIfReady(): void {
    if (this.pendingCrossFades.length === 0) return;
    const hasActiveFade = this.getInternalStates().some((state) => state.fade);
    if (hasActiveFade) return;

    for (const event of [...this.pendingCrossFades]) {
      this.finishCrossFade(event);
    }
  }

  private finishCrossFade(event: AuraAnimationCrossFadeEvent<TClipId>): void {
    this.pendingCrossFades = this.pendingCrossFades.filter((pending) => pending !== event);
    this.emit("crossFadeEnd", event);
    this.emit("crossfadeEnd", event);
  }

  private blendStates(states: readonly InternalPlaybackState<TClipId, TEvent>[], suppressRootMotion?: boolean): AnimationPose {
    const weightedStates = states.filter((state) => effectiveWeight(state) > 0);
    if (weightedStates.length === 0) {
      const fallback = clonePose(this.poseBakedFallback) ?? createIdentityPose(this.skeleton);
      if (fallback) {
        return {
          ...fallback,
          metadata: {
            ...fallback.metadata,
            poseBakedFallback: true,
            poseBakedFallbackMetadata: this.poseBakedFallbackMetadata
          }
        };
      }
      return emptyPose({ poseBakedFallback: true, poseBakedFallbackMetadata: this.poseBakedFallbackMetadata });
    }

    const accumulators = new Map<string, BoneAccumulator>();
    const morphTargets: Record<string, number> = {};
    const rootMotionAccumulator = createBoneAccumulator();
    let hasRootMotion = false;
    let totalWeight = 0;
    let rootMotionSuppressed = false;
    let poseBakedFallback = false;
    let poseBakedFallbackMetadata: AuraPoseBakedFallbackRuntimeMetadata<TClipId> | undefined;

    for (const state of weightedStates) {
      const pose = this.sampleSinglePose(state.clip, state.localTime, state, suppressRootMotion);
      const weight = effectiveWeight(state);
      totalWeight += weight;
      rootMotionSuppressed = rootMotionSuppressed || Boolean(pose.metadata?.rootMotionSuppressed);
      poseBakedFallback = poseBakedFallback || Boolean(pose.metadata?.poseBakedFallback);
      poseBakedFallbackMetadata =
        poseBakedFallbackMetadata ??
        (pose.metadata?.poseBakedFallbackMetadata as AuraPoseBakedFallbackRuntimeMetadata<TClipId> | undefined) ??
        state.poseBakedFallback;

      for (const [boneName, transform] of Object.entries(pose.bones)) {
        const accumulator = accumulators.get(boneName) ?? createBoneAccumulator();
        accumulateTransform(accumulator, transform, weight);
        accumulators.set(boneName, accumulator);
      }

      for (const [name, value] of Object.entries(pose.morphTargets ?? {})) {
        morphTargets[name] = (morphTargets[name] ?? 0) + value * weight;
      }

      if (pose.rootMotion) {
        hasRootMotion = true;
        accumulateTransform(
          rootMotionAccumulator,
          {
            position: pose.rootMotion.translation,
            rotation: pose.rootMotion.rotation
          },
          weight
        );
      }
    }

    const bones: Record<string, AnimationPoseTransform> = {};
    for (const [boneName, accumulator] of accumulators) {
      bones[boneName] = resolveAccumulator(accumulator);
    }

    if (totalWeight > 0) {
      for (const name of Object.keys(morphTargets)) {
        morphTargets[name] /= totalWeight;
      }
    }

    const rootMotionTransform = hasRootMotion ? resolveAccumulator(rootMotionAccumulator) : undefined;
    return {
      bones,
      morphTargets,
      rootMotion: rootMotionTransform
        ? {
            translation: rootMotionTransform.position,
            rotation: rootMotionTransform.rotation
          }
        : undefined,
      metadata: {
        poseBakedFallback,
        poseBakedFallbackMetadata,
        rootMotionSuppressed
      }
    };
  }

  private sampleSinglePose(
    clip: AuraRegisteredAnimationClip<TClipId, TEvent>,
    time: number,
    state?: InternalPlaybackState<TClipId, TEvent>,
    suppressRootMotion?: boolean
  ): AnimationPose {
    const localTime = normalizeStateTime(time, clip.duration, clip.loop ? "loop" : "once");
    const sampled = clip.sample?.({
      clip,
      time: localTime,
      normalizedTime: clip.duration > 0 ? localTime / clip.duration : 0,
      playbackState: state ? cloneState(state) : undefined
    });
    const pose = isAnimationPose(sampled) ? sampled : clonePose(clip.fallbackPose) ?? emptyPose({ poseBakedFallback: true });
    const shouldSuppress = suppressRootMotion ?? state?.rootMotionSuppressed ?? clip.suppressRootMotion ?? this.suppressRootMotion;
    return shouldSuppress ? suppressPoseRootMotion(pose, clip.rootMotion ?? this.rootMotion) : clonePose(pose) ?? emptyPose();
  }

  private applyRuntimeNodeBindings(): void {
    for (const binding of this.runtimeNodeBindings.values()) {
      if (binding.options.applyOnUpdate === false) continue;
      this.applyRuntimeNodeBinding(binding);
    }
  }

  private applyRuntimeNodeBinding(binding: InternalRuntimeNodeBinding<TClipId>): AuraAnimationRuntimeNodeBindingSnapshot<TClipId> {
    let snapshot = this.createRuntimeNodeBindingSnapshot(binding);
    const animation = createRuntimeNodeAnimationSpec(snapshot, binding.options);

    if (snapshot.appliedClipId) {
      if (typeof binding.node.play === "function") {
        const options = { ...animation } as Omit<RuntimeNodeAnimationSpecLike, "clip"> & { clip?: string };
        delete options.clip;
        binding.node.play(String(snapshot.appliedClipId), options);
      } else if (typeof binding.node.setAnimation === "function") {
        binding.node.setAnimation(animation);
      }
    }

    if (typeof binding.node.setAnimationBinding === "function") {
      binding.node.setAnimationBinding(createRuntimeNodeAnimationBindingMetadata(snapshot));
    }

    if (binding.options.applyPose !== false && snapshot.pose && typeof binding.node.setAnimationPose === "function") {
      binding.node.setAnimationPose(snapshot.pose, createRuntimeNodeAnimationPoseBindingMetadata(snapshot));
    }

    if (binding.options.applyMorphTargets !== false && snapshot.morphTargets && typeof binding.node.setMorphTargets === "function") {
      binding.node.setMorphTargets(snapshot.morphTargets);
    }

    if (binding.options.importedRuntime && binding.options.applyImportedRuntime !== false && snapshot.clipSamples.length > 0) {
      snapshot = {
        ...snapshot,
        importedRuntime: applyImportedAnimationRuntime(binding.options.importedRuntime, snapshot.clipSamples)
      };
    }

    binding.snapshot = snapshot;
    return snapshot;
  }

  private createRuntimeNodeBindingSnapshot(binding: InternalRuntimeNodeBinding<TClipId>): AuraAnimationRuntimeNodeBindingSnapshot<TClipId> {
    const states = this.selectRuntimeNodeBindingStates(binding.options);
    const state = states[0];
    const appliedClipId = state?.clipId ?? binding.options.defaultClipId ?? binding.options.fallbackClipId;
    const clip = appliedClipId ? this.clips.get(appliedClipId) : undefined;
    const layer = state?.layer ?? binding.options.layer ?? clip?.layer;
    const layerMetadata = layer ? this.layerMetadata.get(layer) ?? clip?.layerMetadata ?? inferLayerMetadata(layer) : undefined;
    const pose = this.captureRuntimeNodeBindingPose(binding.options, states, state, clip);
    const morphTargets = pose?.morphTargets ? { ...pose.morphTargets } : undefined;
    const clipSamples = createRuntimeNodeClipSamples(states);
    const poseBakedFallback = Boolean(state?.poseBakedFallback?.enabled ?? clip?.poseBakedFallback?.enabled);
    const retargeted = Boolean(state?.clip.retarget ?? clip?.retarget ?? this.retarget);

    return {
      id: binding.id,
      nodeId: binding.node.id,
      source: "animation-controller",
      controllerId: this.id,
      activeClipId: state?.clipId,
      appliedClipId,
      playbackId: state?.id,
      layer,
      layerMetadata: layerMetadata ? cloneLayerMetadata(layerMetadata) : undefined,
      localTime: state?.localTime,
      captureTime: state?.localTime ?? (appliedClipId ? 0 : undefined),
      loop: state ? state.loopMode !== "once" : clip?.loop,
      speed: state?.speed,
      pose,
      morphTargets,
      boneCount: Object.keys(pose?.bones ?? {}).length,
      morphTargetCount: Object.keys(morphTargets ?? {}).length,
      clipSamples,
      poseBakedFallback,
      retargeted,
      sourceAssetId: clip?.metadata?.assetId ?? this.embeddedGLB?.assetId,
      sourceAssetName: clip?.metadata?.assetName ?? this.embeddedGLB?.assetName,
      metadata: {
        ...binding.options.metadata,
        eventSource: state?.eventSource ?? clip?.eventSource,
        restartFromFrameZero: state?.restartFromFrameZero ?? clip?.restartFromFrameZero
      }
    };
  }

  private captureRuntimeNodeBindingPose(
    options: AuraAnimationRuntimeNodeBindingOptions<TClipId>,
    states: readonly InternalPlaybackState<TClipId, TEvent>[],
    state?: InternalPlaybackState<TClipId, TEvent>,
    clip?: AuraRegisteredAnimationClip<TClipId, TEvent>
  ): AnimationPose | undefined {
    if (options.applyPose === false && options.applyMorphTargets === false) return undefined;
    if (states.length > 0) return clonePose(this.blendStates(states));
    if (state) return clonePose(this.sampleSinglePose(state.clip, state.localTime, state, undefined));
    if (clip) return clonePose(this.sampleSinglePose(clip, 0, undefined, undefined));
    return undefined;
  }

  private selectRuntimeNodeBindingStates(options: AuraAnimationRuntimeNodeBindingOptions<TClipId>): readonly InternalPlaybackState<TClipId, TEvent>[] {
    const candidates = options.layer
      ? this.getInternalStates().filter((state) => state.layer === options.layer)
      : this.getInternalStates();

    return candidates
      .filter((state) => state.status === "playing" || state.status === "paused")
      .filter((state) => effectiveWeight(state) > 0)
      .sort((a, b) => effectiveWeight(b) - effectiveWeight(a));
  }

  private selectRuntimeNodeBindingState(options: AuraAnimationRuntimeNodeBindingOptions<TClipId>): InternalPlaybackState<TClipId, TEvent> | undefined {
    return this.selectRuntimeNodeBindingStates(options)[0];
  }

  private retargetSnapshot(): AuraAnimationRetargetSnapshot<TClipId> | undefined {
    const bindings = this.collectRetargetBindings();
    if (bindings.length === 0 && !this.externalHumanoidLibrary) return undefined;
    const primary = bindings[0]?.retarget ?? normalizeRetargetBinding(undefined, this.externalHumanoidLibrary);
    const external = primary?.externalLibrary ?? this.externalHumanoidLibrary;
    const constraints = normalizeRetargetConstraints(primary?.constraints ?? external?.constraints ?? auraAnimationRetargetDocumentedConstraints);

    return {
      enabled: true,
      externalLibrary: external?.library,
      sourceAssetId: external?.sourceAssetId ?? this.embeddedGLB?.assetId,
      sourceAssetName: external?.sourceAssetName ?? this.embeddedGLB?.assetName,
      sourceClipIds: bindings.map((binding) => binding.clipId).filter((clipId): clipId is TClipId => Boolean(clipId)),
      constraints,
      diagnostics: this.createRetargetDiagnostics({})
    };
  }

  private collectRetargetBindings(): { readonly retarget: AuraAnimationRetargetBindingMetadata; readonly clipId?: TClipId }[] {
    const bindings: { readonly retarget: AuraAnimationRetargetBindingMetadata; readonly clipId?: TClipId }[] = [];
    if (this.retarget) bindings.push({ retarget: this.retarget });
    for (const clip of this.listClips()) {
      const retarget = normalizeRetargetBinding(clip.retarget ?? clip.metadata?.retarget, clip.externalHumanoidLibrary ?? clip.metadata?.externalHumanoidLibrary);
      if (retarget) bindings.push({ retarget, clipId: clip.id });
    }
    return bindings;
  }

  private createRetargetDiagnostics(options: AuraAnimationDiagnosticsOptions<TClipId>): readonly AuraAnimationDiagnostic<TClipId>[] {
    const diagnostics: AuraAnimationDiagnostic<TClipId>[] = [];
    const bindings = this.collectRetargetBindings();
    if (bindings.length === 0) return diagnostics;

    for (const { retarget, clipId } of bindings) {
      const external = retarget.externalLibrary ?? this.externalHumanoidLibrary;
      const constraints = normalizeRetargetConstraints(retarget.constraints ?? external?.constraints ?? []);
      if (constraints.length === 0) {
        diagnostics.push(
          createDiagnostic(
            "warning",
            "ANIMATION_RETARGET_CONSTRAINTS_UNDOCUMENTED",
            `Retarget metadata${clipId ? ` for clip "${clipId}"` : ""} should document constraints: explicit humanoid bone map, rest pose, uniform scale, root-motion policy, no runtime IK, and no automatic proportion warp.`,
            clipId
          )
        );
      } else {
        for (const constraint of constraints) {
          diagnostics.push(
            createDiagnostic(
              constraint.severity ?? "info",
              `ANIMATION_RETARGET_CONSTRAINT_${diagnosticCodeSuffix(constraint.code)}`,
              constraint.message ?? `Retarget constraint documented: ${constraint.code}.`,
              clipId
            )
          );
        }
      }

      const mappings = normalizeHumanoidBoneMap(retarget.boneMap ?? external?.boneMap);
      if (mappings.length === 0) {
        diagnostics.push(
          createDiagnostic(
            "error",
            "ANIMATION_RETARGET_BONE_MAP_MISSING",
            `Retarget metadata${clipId ? ` for clip "${clipId}"` : ""} is missing an explicit humanoid bone map.`,
            clipId
          )
        );
      }

      const targetSkeletonBones = skeletonBoneNames(retarget.targetSkeleton ?? this.skeleton);
      const sourceSkeletonBones = skeletonBoneNames(retarget.sourceSkeleton ?? external?.skeleton);
      for (const mapping of mappings) {
        if (mapping.required !== false && targetSkeletonBones.size > 0 && !targetSkeletonBones.has(mapping.target)) {
          diagnostics.push(
            createDiagnostic(
              "error",
              "ANIMATION_RETARGET_TARGET_BONE_MISSING",
              `Retarget mapping "${mapping.source}" -> "${mapping.target}" targets a missing skeleton bone.`,
              clipId,
              mapping.target
            )
          );
        }
        if (mapping.required !== false && sourceSkeletonBones.size > 0 && !sourceSkeletonBones.has(mapping.source)) {
          diagnostics.push(
            createDiagnostic(
              "warning",
              "ANIMATION_RETARGET_SOURCE_BONE_UNVERIFIED",
              `Retarget mapping source bone "${mapping.source}" is not present in source skeleton metadata.`,
              clipId,
              mapping.source
            )
          );
        }
      }

      if (!retarget.restPose && !external?.restPose) {
        diagnostics.push(
          createDiagnostic(
            "warning",
            "ANIMATION_RETARGET_REST_POSE_UNDOCUMENTED",
            `Retarget metadata${clipId ? ` for clip "${clipId}"` : ""} should document source/target rest-pose assumptions.`,
            clipId
          )
        );
      }

      if (!retarget.scale) {
        diagnostics.push(
          createDiagnostic(
            "warning",
            "ANIMATION_RETARGET_SCALE_UNDOCUMENTED",
            `Retarget metadata${clipId ? ` for clip "${clipId}"` : ""} should document uniform scale or unit conversion assumptions.`,
            clipId
          )
        );
      }

      for (const requiredBone of options.requiredBones ?? []) {
        if (targetSkeletonBones.size > 0 && !targetSkeletonBones.has(requiredBone)) {
          diagnostics.push(createDiagnostic("error", "ANIMATION_RETARGET_REQUIRED_TARGET_BONE_MISSING", `Retarget target skeleton is missing required bone "${requiredBone}".`, clipId, requiredBone));
        }
      }
    }

    return diagnostics;
  }

  private selectStates(clipId?: TClipId): InternalPlaybackState<TClipId, TEvent>[] {
    const states = this.getInternalStates();
    if (!clipId) return states;
    return states.filter((state) => state.clipId === clipId);
  }

  private selectCrossFadeSources(options: AuraAnimationCrossFadeOptions<TClipId>): InternalPlaybackState<TClipId, TEvent>[] {
    if (options.fromClipId) return this.selectStates(options.fromClipId);
    if (options.fromLayer) return this.getInternalStates().filter((state) => state.layer === options.fromLayer);
    return this.getInternalStates();
  }

  private getInternalStates(): InternalPlaybackState<TClipId, TEvent>[] {
    return [...this.states.values()];
  }

  private findStateByClip(clipId: TClipId): InternalPlaybackState<TClipId, TEvent> | undefined {
    return this.getInternalStates().find((state) => state.clipId === clipId);
  }

  private primaryState(): InternalPlaybackState<TClipId, TEvent> | undefined {
    return this.getInternalStates()
      .filter((state) => state.status === "playing" || state.status === "paused")
      .sort((a, b) => effectiveWeight(b) - effectiveWeight(a))[0];
  }

  private activeClipId(): TClipId | undefined {
    return this.primaryState()?.clipId;
  }

  private layerWeight(layer: string): number {
    return this.layerWeights.get(layer) ?? 1;
  }

  private endState(state: InternalPlaybackState<TClipId, TEvent>, status: AuraAnimationPlaybackStatus): void {
    state.status = status;
    this.emit("end", cloneState(state));
  }

  private emitStateChanged(): void {
    this.emit("stateChanged", this.snapshot());
  }

  private emit<K extends Extract<keyof AuraAnimationControllerEventMap<TClipId, TEvent>, string>>(
    type: K,
    payload: AuraAnimationControllerEventMap<TClipId, TEvent>[K]
  ): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      listener(payload as AuraAnimationControllerEventMap<TClipId, TEvent>[keyof AuraAnimationControllerEventMap<TClipId, TEvent>]);
    }
  }
}

export function createAnimationController<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
>(options: AuraAnimationControllerOptions<TClipId, TEvent> = {}): AnimationController<TClipId, TEvent> {
  return new AnimationController(options);
}

export const auraAnimationRuntimeMitigationContract = {
  embeddedClipPlaybackFirst: true,
  externalHumanoidRetargeting: "diagnostics-gated",
  retargetingRequiresDocumentedConstraints: true,
  constraints: auraAnimationRetargetDocumentedConstraints
} as const;

export type AuraSourceTestGLBAnimationClipId = "idle" | "walk" | "lightPunch";

export interface AuraSourceTestGLBAnimationSwitchStep {
  readonly expectedClipId: AuraSourceTestGLBAnimationClipId;
  readonly transition: "play" | "crossFade";
  readonly activeClipId?: AuraSourceTestGLBAnimationClipId;
  readonly activeClipIds: readonly AuraSourceTestGLBAnimationClipId[];
  readonly localTime?: number;
  readonly rootMotionSuppressed: boolean;
  readonly poseBakedFallback: boolean;
}

export interface AuraSourceTestGLBAnimationSwitchHarnessOptions {
  readonly clipRegistry?: AuraEmbeddedGLBClipRegistryMetadata<AuraSourceTestGLBAnimationClipId>;
  readonly crossFadeDuration?: number;
  readonly dt?: number;
}

export interface AuraSourceTestGLBAnimationSwitchHarnessResult {
  readonly ok: boolean;
  readonly source: "source-test-glb-clip-registry";
  readonly assetId?: string;
  readonly sequence: readonly AuraSourceTestGLBAnimationSwitchStep[];
  readonly diagnostics: readonly AuraAnimationDiagnostic<AuraSourceTestGLBAnimationClipId>[];
  readonly mitigation: typeof auraAnimationRuntimeMitigationContract;
}

export function createSourceTestGLBAnimationSwitchHarness(
  options: AuraSourceTestGLBAnimationSwitchHarnessOptions = {}
): AuraSourceTestGLBAnimationSwitchHarnessResult {
  const clipRegistry = options.clipRegistry ?? createDefaultSourceTestGLBClipRegistry();
  const controller = new AnimationController<AuraSourceTestGLBAnimationClipId>({
    id: "source-test-glb-animation-switch",
    clipRegistry,
    requiredClips: ["idle", "walk", "lightPunch"],
    requiredBones: ["hips", "spine", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"],
    suppressRootMotion: true
  });
  const fade = options.crossFadeDuration ?? 0.08;
  const dt = options.dt ?? 1 / 30;
  const sequence: AuraSourceTestGLBAnimationSwitchStep[] = [];
  const capture = (expectedClipId: AuraSourceTestGLBAnimationClipId, transition: "play" | "crossFade") => {
    const snapshot = controller.snapshot();
    const active = snapshot.clips.filter((clip) => clip.status === "playing" || clip.status === "completed");
    sequence.push({
      expectedClipId,
      transition,
      activeClipId: snapshot.activeClipId,
      activeClipIds: active.map((clip) => clip.clipId),
      localTime: controller.state(expectedClipId)?.localTime,
      rootMotionSuppressed: snapshot.rootMotionSuppressed,
      poseBakedFallback: Boolean(controller.state(expectedClipId)?.poseBakedFallback)
    });
  };

  controller.play("idle", { restart: true, loop: "loop" });
  controller.update(dt);
  capture("idle", "play");

  controller.crossFade("walk", fade, { restart: true, loop: "loop" });
  controller.update(fade);
  capture("walk", "crossFade");

  controller.crossFade("lightPunch", fade, { restart: true, loop: false, layer: "upper-body", attack: true });
  controller.update(fade);
  capture("lightPunch", "crossFade");

  controller.crossFade("idle", fade, { restart: true, loop: "loop" });
  controller.update(fade);
  capture("idle", "crossFade");

  const diagnostics = controller.diagnostics({
    requireSkeleton: true,
    requiredClips: ["idle", "walk", "lightPunch"],
    requiredBones: ["hips", "spine", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"]
  });
  const expectedSequence: readonly AuraSourceTestGLBAnimationClipId[] = ["idle", "walk", "lightPunch", "idle"];
  return {
    ok: sequence.map((step) => step.activeClipId).every((clipId, index) => clipId === expectedSequence[index]) &&
      diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    source: "source-test-glb-clip-registry",
    assetId: clipRegistry.assetId,
    sequence,
    diagnostics,
    mitigation: auraAnimationRuntimeMitigationContract
  };
}

function createDefaultSourceTestGLBClipRegistry(): AuraEmbeddedGLBClipRegistryMetadata<AuraSourceTestGLBAnimationClipId> {
  const skeleton = {
    rootBone: "hips",
    bones: ["hips", "spine", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"]
  };
  return {
    kind: "aura3d-embedded-glb-animation-registry",
    assetId: "source-test-fighter-glb",
    assetName: "Source Test Fighter GLB",
    skeleton,
    suppressRootMotion: true,
    clips: [
      {
        id: "idle",
        duration: 1,
        loop: true,
        requiredBones: skeleton.bones,
        tracks: [
          {
            id: "idle-hips",
            target: "hips.position",
            property: "translation",
            keyframes: [
              { time: 0, value: { x: 0, y: 0, z: 0 } },
              { time: 1, value: { x: 0, y: 0.02, z: 0 } }
            ]
          }
        ]
      },
      {
        id: "walk",
        duration: 1,
        loop: true,
        requiredBones: skeleton.bones,
        rootMotion: { track: "walk-root", bone: "hips", suppress: true, reason: "gameplay kinematic body owns locomotion" },
        tracks: [
          {
            id: "walk-root",
            target: "hips.position",
            property: "translation",
            keyframes: [
              { time: 0, value: { x: 0, y: 0, z: 0 } },
              { time: 1, value: { x: 0, y: 0, z: 0.35 } }
            ]
          },
          {
            id: "walk-left-leg",
            target: "leftLeg.rotation",
            property: "rotation",
            keyframes: [
              { time: 0, value: { x: 0, y: 0, z: -0.12, w: 0.99 } },
              { time: 0.5, value: { x: 0, y: 0, z: 0.12, w: 0.99 } },
              { time: 1, value: { x: 0, y: 0, z: -0.12, w: 0.99 } }
            ]
          }
        ]
      },
      {
        id: "lightPunch",
        duration: 0.45,
        loop: false,
        attack: true,
        restartFromFrameZero: true,
        layer: "upper-body",
        requiredBones: ["spine", "head", "leftArm", "rightArm"],
        events: [{ name: "active", type: "hitbox", time: 0.12, once: true, payload: { volume: "light-punch" } }],
        tracks: [
          {
            id: "light-punch-right-arm",
            target: "rightArm.rotation",
            property: "rotation",
            keyframes: [
              { time: 0, value: { x: 0, y: 0, z: 0, w: 1 } },
              { time: 0.12, value: { x: 0.25, y: 0, z: -0.15, w: 0.96 } },
              { time: 0.45, value: { x: 0, y: 0, z: 0, w: 1 } }
            ]
          }
        ]
      }
    ]
  };
}

function createRuntimeNodeAnimationSpec<TClipId extends string>(
  snapshot: AuraAnimationRuntimeNodeBindingSnapshot<TClipId>,
  options: AuraAnimationRuntimeNodeBindingOptions<TClipId>
): RuntimeNodeAnimationSpecLike {
  return compactObject({
    clip: snapshot.appliedClipId ? String(snapshot.appliedClipId) : undefined,
    loop: options.syncLoop === false ? undefined : snapshot.loop,
    speed: options.syncSpeed === false ? undefined : snapshot.speed,
    startTime: snapshot.metadata?.restartFromFrameZero ? 0 : undefined,
    duration: undefined,
    captureTime: options.syncCaptureTime === false ? undefined : snapshot.captureTime,
    metadata: compactObject({
      controllerId: snapshot.controllerId,
      bindingId: snapshot.id,
      playbackId: snapshot.playbackId,
      layer: snapshot.layer,
      layerRole: snapshot.layerMetadata?.role,
      bodyMask: snapshot.layerMetadata?.bodyMask,
      poseBakedFallback: snapshot.poseBakedFallback,
      retargeted: snapshot.retargeted,
      sourceAssetId: snapshot.sourceAssetId,
      sourceAssetName: snapshot.sourceAssetName,
      eventSource: snapshot.metadata?.eventSource,
      restartFromFrameZero: snapshot.metadata?.restartFromFrameZero
    })
  });
}

function createRuntimeNodeAnimationBindingMetadata<TClipId extends string>(
  snapshot: AuraAnimationRuntimeNodeBindingSnapshot<TClipId>
): AuraRuntimeNodeAnimationBindingMetadata {
  return compactObject({
    kind: "aura-runtime-node-animation-binding",
    controllerId: snapshot.controllerId,
    bindingId: snapshot.id,
    activeClipId: snapshot.activeClipId ? String(snapshot.activeClipId) : undefined,
    playbackId: snapshot.playbackId,
    layer: snapshot.layer,
    layerRole: snapshot.layerMetadata?.role,
    bodyMask: snapshot.layerMetadata?.bodyMask,
    localTime: snapshot.localTime,
    captureTime: snapshot.captureTime,
    loop: snapshot.loop,
    speed: snapshot.speed,
    eventSource: typeof snapshot.metadata?.eventSource === "string" ? snapshot.metadata.eventSource : undefined,
    retargeted: snapshot.retargeted,
    poseBakedFallback: snapshot.poseBakedFallback,
    sourceAssetId: snapshot.sourceAssetId,
    sourceAssetName: snapshot.sourceAssetName,
    metadata: snapshot.metadata
  }) as AuraRuntimeNodeAnimationBindingMetadata;
}

function createRuntimeNodeAnimationPoseBindingMetadata<TClipId extends string>(
  snapshot: AuraAnimationRuntimeNodeBindingSnapshot<TClipId>
): AuraRuntimeNodeAnimationPoseBindingMetadata {
  return compactObject({
    kind: "aura-runtime-node-animation-pose",
    controllerId: snapshot.controllerId,
    bindingId: snapshot.id,
    activeClipId: snapshot.activeClipId ? String(snapshot.activeClipId) : undefined,
    playbackId: snapshot.playbackId,
    localTime: snapshot.localTime,
    captureTime: snapshot.captureTime,
    boneCount: snapshot.boneCount,
    morphTargetCount: snapshot.morphTargetCount,
    sourceAssetId: snapshot.sourceAssetId,
    sourceAssetName: snapshot.sourceAssetName,
    metadata: compactObject({
      layer: snapshot.layer,
      layerRole: snapshot.layerMetadata?.role,
      bodyMask: snapshot.layerMetadata?.bodyMask,
      poseBakedFallback: snapshot.poseBakedFallback,
      retargeted: snapshot.retargeted,
      eventSource: snapshot.metadata?.eventSource,
      restartFromFrameZero: snapshot.metadata?.restartFromFrameZero
    })
  }) as AuraRuntimeNodeAnimationPoseBindingMetadata;
}

function createRuntimeNodeClipSamples<TClipId extends string, TEvent extends AnimationClipEvent>(
  states: readonly InternalPlaybackState<TClipId, TEvent>[]
): readonly AuraAnimationRuntimeClipSample<TClipId>[] {
  return states.map((state) => {
    const additive = Boolean(state.layerMetadata?.additive ?? state.clip.layerMetadata?.additive);
    return compactObject({
      clipId: state.clipId,
      clipName: runtimeClipNameForState(state),
      localTime: state.localTime,
      weight: effectiveWeight(state),
      layer: state.layer,
      additive: additive ? true : undefined
    });
  });
}

function applyImportedAnimationRuntime<TClipId extends string>(
  runtime: AuraAnimationImportedRuntimeLike,
  samples: readonly AuraAnimationRuntimeClipSample<TClipId>[]
): AuraAnimationImportedRuntimeApplySnapshot {
  const importedSamples = samples.map((sample) =>
    compactObject({
      clipName: sample.clipName,
      time: sample.localTime,
      weight: sample.weight,
      additive: sample.additive
    })
  );
  const blended = importedSamples.length > 1;
  const applyResult = blended && typeof runtime.blendClips === "function"
    ? runtime.blendClips(importedSamples)
    : blended && typeof runtime.applyClips === "function"
      ? runtime.applyClips(importedSamples)
      : applySingleImportedClip(runtime, highestWeightRuntimeClipSample(importedSamples));

  return compactObject({
    applied: true,
    blended,
    sampleCount: importedSamples.length,
    applyResult,
    runtimeSnapshot: typeof runtime.snapshot === "function" ? runtime.snapshot() : undefined
  });
}

function applySingleImportedClip(
  runtime: AuraAnimationImportedRuntimeLike,
  sample: AuraAnimationImportedRuntimeClipSample
): unknown {
  if (typeof runtime.applyClip === "function") return runtime.applyClip(sample.clipName, sample.time);
  if (typeof runtime.applyClipByName === "function") return runtime.applyClipByName(sample.clipName, sample.time);
  if (typeof runtime.applyClips === "function") return runtime.applyClips([sample]);
  if (typeof runtime.blendClips === "function") return runtime.blendClips([sample]);
  throw new Error("Imported animation runtime must expose applyClip(), applyClipByName(), applyClips(), or blendClips().");
}

function highestWeightRuntimeClipSample(
  samples: readonly AuraAnimationImportedRuntimeClipSample[]
): AuraAnimationImportedRuntimeClipSample {
  const [first] = samples;
  if (!first) {
    throw new Error("Cannot apply imported animation runtime without an active clip sample.");
  }
  return samples.reduce((best, sample) => (sample.weight ?? 1) > (best.weight ?? 1) ? sample : best, first);
}

function runtimeClipNameForState<TClipId extends string, TEvent extends AnimationClipEvent>(
  state: InternalPlaybackState<TClipId, TEvent>
): string {
  return (
    stringMetadata(state.clip.metadata, "runtimeClipName") ??
    stringMetadata(state.clip.metadata, "sourceClipName") ??
    stringMetadata(state.clip.metadata, "sourceClipId") ??
    stringMetadata(state.clip.metadata, "clipName") ??
    state.clip.name ??
    String(state.clipId)
  );
}

function stringMetadata(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function createClipEventSourceMetadata<TClipId extends string, TEvent extends AnimationClipEvent>(
  state: InternalPlaybackState<TClipId, TEvent>,
  controllerTime: number,
  registry?: AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent>
): AuraAnimationClipEventSourceMetadata<TClipId> {
  const poseBakedFallback = Boolean(state.poseBakedFallback?.enabled ?? state.clip.poseBakedFallback?.enabled);
  const retargeted = Boolean(state.clip.retarget);
  return {
    kind: poseBakedFallback ? "pose-baked-fallback" : state.eventSource,
    semantics: "clip-local-time",
    clipId: state.clipId,
    playbackId: state.id,
    layer: state.layer,
    localTime: state.localTime,
    previousLocalTime: state.previousLocalTime,
    normalizedTime: state.normalizedTime,
    controllerTime,
    loopCount: state.loopCount,
    retargeted,
    poseBakedFallback,
    sourceAssetId: state.clip.metadata?.assetId ?? registry?.assetId,
    sourceAssetName: state.clip.metadata?.assetName ?? registry?.assetName,
    sourceClipId: state.clip.metadata?.sourceClipId as string | undefined,
    metadata: {
      rule: "Clip events are sampled from source clip local time before runtime-node binding or renderer skinning.",
      layerRole: state.layerMetadata?.role,
      bodyMask: state.layerMetadata?.bodyMask
    }
  };
}

function shouldRestartFromFrameZero<TClipId extends string, TEvent extends AnimationClipEvent>(
  clip: AuraRegisteredAnimationClip<TClipId, TEvent>,
  options: AuraAnimationPlayOptions<TClipId>,
  layers: ReadonlyMap<string, AuraAnimationLayerMetadata>
): boolean {
  if (options.restartFromFrameZero === true || options.attack === true) return true;
  const layer = options.layer ?? clip.layer;
  const layerMetadata = layers.get(layer) ?? clip.layerMetadata;
  return Boolean(
    clip.restartFromFrameZero ||
    clip.metadata?.restartFromFrameZero ||
    clip.metadata?.attack ||
    clip.tags.includes("attack") ||
    layerMetadata?.restartFromFrameZero
  );
}

function cloneLayerMetadata(layer: AuraAnimationLayerMetadata): AuraAnimationLayerMetadata {
  return {
    ...layer,
    bones: layer.bones ? [...layer.bones] : undefined,
    excludedBones: layer.excludedBones ? [...layer.excludedBones] : undefined,
    metadata: layer.metadata ? { ...layer.metadata } : undefined
  };
}

function inferLayerMetadata(layer: string): AuraAnimationLayerMetadata {
  const normalized = layer.trim() || defaultLayerName;
  if (normalized === "upper-body") {
    return {
      id: normalized,
      role: "upper-body",
      bodyMask: "upper-body",
      bones: ["Spine", "Chest", "UpperChest", "Neck", "Head", "LeftShoulder", "LeftUpperArm", "LeftLowerArm", "LeftHand", "RightShoulder", "RightUpperArm", "RightLowerArm", "RightHand"],
      restartFromFrameZero: true,
      description: "Upper-body overlay layer for attacks, gestures, aim offsets, and hit reactions."
    };
  }
  if (normalized === "lower-body") {
    return {
      id: normalized,
      role: "lower-body",
      bodyMask: "lower-body",
      bones: ["Hips", "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "LeftToeBase", "RightUpperLeg", "RightLowerLeg", "RightFoot", "RightToeBase"],
      description: "Lower-body locomotion layer for feet, hips, and grounded movement."
    };
  }
  return {
    id: normalized,
    role: normalized === defaultLayerName ? "base" : "custom",
    bodyMask: "full-body",
    description: normalized === defaultLayerName ? "Full-body base animation layer." : "Custom animation layer metadata."
  };
}

function normalizeRetargetBinding(
  retarget?: AuraAnimationRetargetBindingMetadata,
  externalLibrary?: AuraExternalHumanoidAnimationLibraryBindingMetadata
): AuraAnimationRetargetBindingMetadata | undefined {
  if (!retarget && !externalLibrary) return undefined;
  return {
    ...retarget,
    kind: retarget?.kind ?? "aura-animation-retarget-binding",
    source: retarget?.source ?? (externalLibrary ? "external-humanoid-library" : undefined),
    boneMap: retarget?.boneMap ?? externalLibrary?.boneMap,
    sourceSkeleton: retarget?.sourceSkeleton ?? externalLibrary?.skeleton,
    constraints: retarget?.constraints ?? externalLibrary?.constraints,
    externalLibrary: retarget?.externalLibrary ?? externalLibrary
  };
}

function normalizeRetargetConstraints(
  constraints: readonly (AuraAnimationRetargetConstraint | AuraAnimationRetargetConstraintCode)[] = []
): readonly AuraAnimationRetargetConstraint[] {
  return constraints.map((constraint) => {
    if (typeof constraint === "string") {
      return documentedRetargetConstraint(constraint);
    }
    return {
      ...documentedRetargetConstraint(constraint.code),
      ...constraint
    };
  });
}

function documentedRetargetConstraint(code: AuraAnimationRetargetConstraintCode): AuraAnimationRetargetConstraint {
  return auraAnimationRetargetDocumentedConstraints.find((constraint) => constraint.code === code) ?? {
    code,
    severity: "info",
    message: `Retarget constraint documented: ${code}.`
  };
}

function normalizeHumanoidBoneMap(map?: AuraHumanoidBoneMap): readonly AuraHumanoidBoneBinding[] {
  if (!map) return [];
  if (Array.isArray(map)) {
    return map
      .filter((binding) => Boolean(binding.source && binding.target))
      .map((binding) => ({ ...binding }));
  }
  return Object.entries(map)
    .filter(([source, target]) => Boolean(source && target))
    .map(([source, target]) => ({ source, target, required: true }));
}

function diagnosticCodeSuffix(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "DOCUMENTED";
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = entry;
  }
  return result as T;
}

export function createEmbeddedGLBAnimationClipRegistryMetadata<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
>(
  source: AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent> | AuraAnimationAssetLike
): AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent> {
  const asset = isAnimationAssetLike(source) ? source : undefined;
  const metadata = asset?.metadata;
  const nested = metadata?.animation as AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent> | undefined;
  const registry = (nested ?? source) as AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent>;
  const clips = registry.clips ?? registry.animations ?? (metadata?.animationClips as readonly (TClipId | AuraEmbeddedGLBClipMetadata<TClipId, TEvent>)[] | undefined) ?? (metadata?.animations as readonly (TClipId | AuraEmbeddedGLBClipMetadata<TClipId, TEvent>)[] | undefined) ?? [];
  const bones = registry.bones ?? metadata?.bones;
  const skeleton = registry.skeleton ?? metadata?.skeleton ?? (bones ? { bones } : undefined);
  const layers = registry.layers ?? metadata?.layers;
  const externalHumanoidLibrary = registry.externalHumanoidLibrary ?? metadata?.externalHumanoidLibrary;

  return {
    kind: registry.kind ?? "aura3d-embedded-glb-animation-registry",
    assetId: registry.assetId ?? asset?.id,
    assetName: registry.assetName ?? asset?.name,
    clips,
    skeleton,
    bones,
    layers,
    retarget: registry.retarget ?? metadata?.retarget,
    externalHumanoidLibrary,
    rootMotion: registry.rootMotion ?? metadata?.rootMotion,
    suppressRootMotion: registry.suppressRootMotion ?? metadata?.suppressRootMotion,
    poseBakedFallback: registry.poseBakedFallback ?? metadata?.poseBakedFallback,
    metadata: {
      ...registry.metadata,
      url: asset?.url,
      hash: asset?.hash
    }
  };
}

function embeddedClipToDefinition<
  TClipId extends string,
  TEvent extends AnimationClipEvent
>(
  input: TClipId | AuraEmbeddedGLBClipMetadata<TClipId, TEvent>,
  registry: AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent>,
  defaultLayer: string
): AuraNamedAnimationClipDefinition<TClipId, TEvent> {
  if (typeof input === "string") {
    const retarget = normalizeRetargetBinding(registry.retarget, registry.externalHumanoidLibrary);
    return {
      id: input,
      name: input,
      duration: 1,
      loop: true,
      layer: defaultLayer,
      layerMetadata: registry.layers?.find((layer) => layer.id === defaultLayer),
      eventSource: retarget ? "retargeted-source-clip" : "source-clip",
      retarget,
      externalHumanoidLibrary: registry.externalHumanoidLibrary,
      metadata: {
        embeddedGLB: true,
        assetId: registry.assetId,
        assetName: registry.assetName,
        source: "embedded-glb-animation-name",
        durationSource: "defaulted"
      },
      fallbackPose: extractPoseBakedFallback(registry.poseBakedFallback)
    };
  }

  const id = input.id ?? (input.name as TClipId | undefined);
  if (!id) {
    throw new Error("Embedded GLB animation clips require id or name metadata.");
  }

  return {
    id,
    name: input.name ?? id,
    duration: input.duration ?? 1,
    frameRate: input.frameRate,
    loop: input.loop ?? true,
    tags: input.tags,
    tracks: input.tracks,
    events: input.events,
    layer: input.layer ?? defaultLayer,
    layerMetadata: input.layerMetadata ?? registry.layers?.find((layer) => layer.id === (input.layer ?? defaultLayer)),
    bones: input.bones,
    requiredBones: input.requiredBones,
    rootMotion: input.rootMotion ?? registry.rootMotion,
    suppressRootMotion: input.suppressRootMotion ?? registry.suppressRootMotion,
    restartFromFrameZero: input.restartFromFrameZero,
    attack: input.attack,
    eventSource: input.eventSource,
    retarget: input.retarget ?? registry.retarget,
    externalHumanoidLibrary: input.externalHumanoidLibrary ?? registry.externalHumanoidLibrary,
    pose: input.pose,
    fallbackPose: input.fallbackPose ?? extractPoseBakedFallback(registry.poseBakedFallback),
    metadata: {
      ...input.metadata,
      embeddedGLB: true,
      assetId: registry.assetId,
      assetName: registry.assetName,
      source: "embedded-glb-clip-registry",
      durationSource: input.duration === undefined ? "defaulted" : "metadata"
    }
  };
}

function isAnimationAssetLike(value: unknown): value is AuraAnimationAssetLike {
  return isObject(value) && "metadata" in value;
}

function createFallbackSampler<
  TClipId extends string,
  TEvent extends AnimationClipEvent
>(
  clipId: TClipId,
  tracks: readonly AnimationClipTrack[],
  fallbackPose?: AnimationPose,
  poseBakedFallback?: AuraPoseBakedFallbackRuntimeMetadata<TClipId>
): ((context: AuraAnimationClipSampleContext<TClipId, TEvent>) => AnimationPose) | undefined {
  if (tracks.length > 0) {
    return (context) => samplePoseFromTracks(tracks, context.time, context.clip.duration, fallbackPose, clipId);
  }
  if (fallbackPose) {
    return () => {
      const pose = clonePose(fallbackPose) ?? emptyPose();
      return {
      ...pose,
      bones: pose.bones,
      metadata: {
        ...fallbackPose.metadata,
        poseBakedFallback: true,
        poseBakedFallbackMetadata: poseBakedFallback,
        sourceClipId: clipId
      }
    };
    };
  }

  return () => emptyPose({ poseBakedFallback: true, poseBakedFallbackMetadata: poseBakedFallback, emptyTracks: true, sourceClipId: clipId });
}

function samplePoseFromTracks<TClipId extends string>(
  tracks: readonly AnimationClipTrack[],
  time: number,
  duration: number,
  fallbackPose: AnimationPose | undefined,
  clipId: TClipId
): AnimationPose {
  const pose = clonePose(fallbackPose) ?? emptyPose();
  const bones: Record<string, AnimationPoseTransform> = { ...pose.bones };
  const morphTargets: Record<string, number> = { ...(pose.morphTargets ?? {}) };
  let sampledTracks = 0;

  for (const track of tracks) {
    const keyframes = [...(track.keyframes ?? [])].sort((a, b) => a.time - b.time);
    if (keyframes.length === 0) continue;
    const value = sampleKeyframes(keyframes, normalizeStateTime(time, duration, "loop"));
    const property = trackProperty(track);
    const boneName = boneNameFromTrackTarget(track.target) ?? track.target;

    if (property === "morph") {
      const numberValue = toFiniteNumber(value);
      if (numberValue !== undefined) {
        morphTargets[track.target] = numberValue;
        sampledTracks += 1;
      }
      continue;
    }

    const current = bones[boneName] ?? {};
    if (property === "translation" || property === "position") {
      const vector = toVector3(value);
      if (vector) {
        bones[boneName] = { ...current, position: vector };
        sampledTracks += 1;
      }
    } else if (property === "rotation") {
      const quaternion = toQuaternion(value);
      if (quaternion) {
        bones[boneName] = { ...current, rotation: quaternion };
        sampledTracks += 1;
      }
    } else if (property === "scale") {
      const vector = toVector3(value);
      if (vector) {
        bones[boneName] = { ...current, scale: vector };
        sampledTracks += 1;
      }
    }
  }

  return {
    bones,
    morphTargets,
    metadata: {
      ...pose.metadata,
      poseBakedFallback: sampledTracks === 0,
      sampledTracks,
      sourceClipId: clipId
    }
  };
}

function sampleKeyframes(keyframes: readonly { readonly time: number; readonly value: unknown }[], time: number): unknown {
  if (keyframes.length === 0) return undefined;
  if (time <= keyframes[0].time) return keyframes[0].value;
  const last = keyframes[keyframes.length - 1];
  if (time >= last.time) return last.value;

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const from = keyframes[index];
    const to = keyframes[index + 1];
    if (time < from.time || time > to.time) continue;
    const span = Math.max(0.000001, to.time - from.time);
    const alpha = (time - from.time) / span;
    return interpolateValue(from.value, to.value, alpha);
  }

  return last.value;
}

function interpolateValue(from: unknown, to: unknown, alpha: number): unknown {
  const fromNumber = toFiniteNumber(from);
  const toNumber = toFiniteNumber(to);
  if (fromNumber !== undefined && toNumber !== undefined) return lerp(fromNumber, toNumber, alpha);

  const fromVector = toVector3(from);
  const toVector = toVector3(to);
  if (fromVector && toVector) {
    return {
      x: lerp(fromVector.x, toVector.x, alpha),
      y: lerp(fromVector.y, toVector.y, alpha),
      z: lerp(fromVector.z, toVector.z, alpha)
    };
  }

  const fromQuaternion = toQuaternion(from);
  const toQuaternionValue = toQuaternion(to);
  if (fromQuaternion && toQuaternionValue) {
    return normalizeQuaternion({
      x: lerp(fromQuaternion.x, toQuaternionValue.x, alpha),
      y: lerp(fromQuaternion.y, toQuaternionValue.y, alpha),
      z: lerp(fromQuaternion.z, toQuaternionValue.z, alpha),
      w: lerp(fromQuaternion.w, toQuaternionValue.w, alpha)
    });
  }

  return alpha < 0.5 ? from : to;
}

function advanceState<TClipId extends string, TEvent extends AnimationClipEvent>(
  state: InternalPlaybackState<TClipId, TEvent>,
  dt: number
): AdvanceResult {
  state.previousLocalTime = state.localTime;
  if (state.duration <= 0) {
    state.localTime = 0;
    state.normalizedTime = 0;
    return {
      loopsPassed: 0,
      completed: state.loopMode === "once"
    };
  }

  const delta = dt * state.speed * state.inputDirection;
  state.direction = delta >= 0 ? 1 : -1;

  if (state.loopMode === "once") {
    const nextTime = clamp(state.localTime + delta, 0, state.duration);
    state.localTime = nextTime;
    state.playhead = nextTime;
    state.normalizedTime = state.duration > 0 ? state.localTime / state.duration : 0;
    return {
      loopsPassed: 0,
      completed: delta >= 0 ? nextTime >= state.duration : nextTime <= 0
    };
  }

  const previousPlayhead = state.playhead;
  state.playhead += delta;
  const loopsPassed = Math.abs(loopIndex(state.playhead, state.duration) - loopIndex(previousPlayhead, state.duration));

  if (state.loopMode === "pingpong") {
    const cycle = loopIndex(state.playhead, state.duration);
    const local = positiveModulo(state.playhead, state.duration);
    state.localTime = cycle % 2 === 0 ? local : state.duration - local;
    state.direction = cycle % 2 === 0 ? state.direction : (state.direction === 1 ? -1 : 1);
  } else {
    state.localTime = positiveModulo(state.playhead, state.duration);
  }

  state.loopCount += loopsPassed;
  state.normalizedTime = state.duration > 0 ? state.localTime / state.duration : 0;
  return {
    loopsPassed,
    completed: false
  };
}

function normalizeLoopMode(loop: AnimationLoopMode | boolean | undefined, clipLoop: boolean): AnimationLoopMode {
  if (loop === true) return "loop";
  if (loop === false) return "once";
  return loop ?? (clipLoop ? "loop" : "once");
}

function normalizeStateTime(time: number, duration: number, loopMode: AnimationLoopMode): number {
  if (!Number.isFinite(time) || duration <= 0) return 0;
  if (loopMode === "once") return clamp(time, 0, duration);
  return positiveModulo(time, duration);
}

function positiveModulo(value: number, modulus: number): number {
  if (modulus <= 0) return 0;
  return ((value % modulus) + modulus) % modulus;
}

function loopIndex(value: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.floor(value / duration);
}

function sanitizeDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration < 0) return 0;
  return duration;
}

function sanitizeSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return speed;
}

function sanitizeWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 1;
  return clamp(weight, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function cloneState<TClipId extends string, TEvent extends AnimationClipEvent>(
  state: InternalPlaybackState<TClipId, TEvent>
): AuraAnimationClipPlaybackState<TClipId> {
  const layerWeight = state.layerWeight;
  return {
    id: state.id,
    clipId: state.clipId,
    status: state.status,
    localTime: state.localTime,
    previousLocalTime: state.previousLocalTime,
    normalizedTime: state.normalizedTime,
    duration: state.duration,
    speed: state.speed,
    weight: state.weight,
    targetWeight: state.targetWeight,
    effectiveWeight: state.weight * layerWeight,
    layer: state.layer,
    layerMetadata: state.layerMetadata ? cloneLayerMetadata(state.layerMetadata) : undefined,
    layerWeight,
    loopMode: state.loopMode,
    loopCount: state.loopCount,
    direction: state.direction,
    completed: state.completed,
    rootMotionSuppressed: state.rootMotionSuppressed,
    restartFromFrameZero: state.restartFromFrameZero,
    eventSource: state.eventSource,
    poseBakedFallback: state.poseBakedFallback ? { ...state.poseBakedFallback } : undefined,
    metadata: state.metadata ? { ...state.metadata } : undefined,
    fade: state.fade ? { ...state.fade } : undefined
  };
}

function effectiveWeight<TClipId extends string, TEvent extends AnimationClipEvent>(
  state: InternalPlaybackState<TClipId, TEvent>
): number {
  return state.weight * state.layerWeight;
}

function shouldSuppressRootMotion<TClipId extends string, TEvent extends AnimationClipEvent>(
  options: { readonly suppressRootMotion?: boolean },
  clip: AuraRegisteredAnimationClip<TClipId, TEvent>,
  controllerSuppressRootMotion: boolean
): boolean {
  return options.suppressRootMotion ?? clip.suppressRootMotion ?? clip.rootMotion?.suppress ?? controllerSuppressRootMotion;
}

function suppressPoseRootMotion(pose: AnimationPose, metadata?: AuraAnimationRootMotionMetadata): AnimationPose {
  const cloned = clonePose(pose) ?? emptyPose();
  return {
    ...cloned,
    rootMotion: undefined,
    metadata: {
      ...cloned.metadata,
      rootMotionSuppressed: true,
      rootMotionPolicy: "suppressed",
      rootMotionTrack: metadata?.track,
      rootMotionBone: metadata?.bone,
      rootMotionReason: metadata?.reason
    }
  };
}

function isAnimationPose(value: unknown): value is AnimationPose {
  return isObject(value) && isObject((value as { readonly bones?: unknown }).bones);
}

function emptyPose(metadata: Record<string, unknown> = {}): AnimationPose {
  return {
    bones: {},
    morphTargets: {},
    metadata
  };
}

function createIdentityPose(skeleton?: AuraAnimationSkeletonMetadata): AnimationPose | undefined {
  const bones = skeletonBoneNames(skeleton);
  if (bones.size === 0) return undefined;
  const poseBones: Record<string, AnimationPoseTransform> = {};
  for (const bone of bones) {
    poseBones[bone] = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 }
    };
  }
  return {
    bones: poseBones,
    morphTargets: {},
    metadata: {
      poseBakedFallback: true,
      source: "skeleton-bind-pose"
    }
  };
}

function clonePose(pose: AnimationPose | undefined): AnimationPose | undefined {
  if (!pose) return undefined;
  const bones: Record<string, AnimationPoseTransform> = {};
  for (const [name, transform] of Object.entries(pose.bones ?? {})) {
    bones[name] = {
      position: transform.position ? { ...transform.position } : undefined,
      rotation: transform.rotation ? { ...transform.rotation } : undefined,
      scale: transform.scale ? { ...transform.scale } : undefined
    };
  }

  return {
    bones,
    morphTargets: pose.morphTargets ? { ...pose.morphTargets } : undefined,
    rootMotion: pose.rootMotion
      ? {
          translation: pose.rootMotion.translation ? { ...pose.rootMotion.translation } : undefined,
          rotation: pose.rootMotion.rotation ? { ...pose.rootMotion.rotation } : undefined
        }
      : undefined,
    metadata: pose.metadata ? { ...pose.metadata } : undefined
  };
}

function extractPoseBakedFallback(value: AnimationPose | AuraPoseBakedFallbackMetadata | boolean | undefined): AnimationPose | undefined {
  if (!value || value === true) return undefined;
  if (isAnimationPose(value)) return value;
  if (isObject(value) && isAnimationPose((value as AuraPoseBakedFallbackMetadata).pose)) {
    const pose = clonePose((value as AuraPoseBakedFallbackMetadata).pose);
    return pose
      ? {
          ...pose,
          metadata: {
            ...pose.metadata,
            poseBakedFallback: true,
            poseBakedFallbackSource: (value as AuraPoseBakedFallbackMetadata).source,
            poseBakedFallbackReason: (value as AuraPoseBakedFallbackMetadata).reason
          }
        }
      : undefined;
  }

  return undefined;
}

function extractPoseBakedFallbackRuntimeMetadata<TClipId extends string>(
  value: AnimationPose | AuraPoseBakedFallbackMetadata | boolean | undefined,
  fallback: AuraPoseBakedFallbackRuntimeMetadata<TClipId>
): AuraPoseBakedFallbackRuntimeMetadata<TClipId> | undefined {
  if (!value) return undefined;
  if (value === true || isAnimationPose(value)) return fallback;
  if (isObject(value)) {
    const metadata = value as AuraPoseBakedFallbackMetadata;
    return {
      ...fallback,
      source: metadata.source ?? fallback.source,
      reason: metadata.reason ?? fallback.reason
    };
  }
  return fallback;
}

function createPoseBakedFallbackRuntimeMetadata<
  TClipId extends string,
  TEvent extends AnimationClipEvent
>(
  clipId: TClipId,
  definition: AuraNamedAnimationClipDefinition<TClipId, TEvent>,
  registry: AuraEmbeddedGLBClipRegistryMetadata<TClipId, TEvent> | undefined,
  controllerFallback: AuraPoseBakedFallbackRuntimeMetadata<TClipId> | undefined,
  enabled: boolean
): AuraPoseBakedFallbackRuntimeMetadata<TClipId> | undefined {
  if (!enabled) return undefined;
  const explicit = extractPoseBakedFallbackRuntimeMetadata(definition.metadata?.poseBakedFallback, {
    enabled: true,
    source: "clip-metadata",
    sourceClipId: clipId,
    sourceAssetId: registry?.assetId,
    sourceAssetName: registry?.assetName,
    fallbackKind: "clip-metadata"
  });
  if (explicit) return explicit;
  if (definition.pose) {
    return {
      enabled: true,
      source: "clip-pose",
      sourceClipId: clipId,
      sourceAssetId: registry?.assetId,
      sourceAssetName: registry?.assetName,
      fallbackKind: "clip-pose"
    };
  }
  if (definition.fallbackPose) {
    return {
      enabled: true,
      source: "clip-fallback-pose",
      sourceClipId: clipId,
      sourceAssetId: registry?.assetId,
      sourceAssetName: registry?.assetName,
      fallbackKind: "clip-fallback-pose"
    };
  }
  if (controllerFallback) {
    return {
      ...controllerFallback,
      enabled: true,
      sourceClipId: clipId,
      sourceAssetId: controllerFallback.sourceAssetId ?? registry?.assetId,
      sourceAssetName: controllerFallback.sourceAssetName ?? registry?.assetName
    };
  }
  return {
    enabled: true,
    source: "skeleton-bind-pose",
    sourceClipId: clipId,
    sourceAssetId: registry?.assetId,
    sourceAssetName: registry?.assetName,
    fallbackKind: "skeleton-bind-pose"
  };
}

function skeletonBoneNames(skeleton?: AuraAnimationSkeletonMetadata): Set<string> {
  const names = new Set<string>();
  for (const bone of skeleton?.bones ?? []) {
    if (typeof bone === "string" && bone.trim()) names.add(bone);
    if (isObject(bone) && typeof bone.name === "string" && bone.name.trim()) names.add(bone.name);
  }
  if (skeleton?.rootBone) names.add(skeleton.rootBone);
  return names;
}

function boneNameFromTrackTarget(target: string): string | undefined {
  if (!target.trim()) return undefined;
  const normalized = target.replace(/^\//, "").replace(/\//g, ".");
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts[0] === "materials" || parts[0] === "material" || parts[0] === "morphTargets" || parts[0] === "weights") return undefined;
  if (parts.length === 1) {
    return isKnownTransformProperty(parts[0]) ? undefined : parts[0];
  }
  if (parts[0] === "bones" || parts[0] === "nodes") return parts[1];
  const last = parts[parts.length - 1];
  if (isKnownTransformProperty(last)) return parts.slice(0, -1).join(".");
  return parts[0];
}

function trackProperty(track: AnimationClipTrack): "translation" | "position" | "rotation" | "scale" | "morph" | "unknown" {
  switch (track.property) {
    case "translation":
      return "translation";
    case "rotation":
      return "rotation";
    case "scale":
      return "scale";
    case "morph":
      return "morph";
  }
  const target = track.target.toLowerCase();
  if (target.endsWith(".position")) return "position";
  if (target.endsWith(".translation")) return "translation";
  if (target.endsWith(".rotation") || target.endsWith(".quaternion")) return "rotation";
  if (target.endsWith(".scale")) return "scale";
  if (target.includes("morph") || target.includes("weights")) return "morph";
  return "unknown";
}

function isKnownTransformProperty(value: string): boolean {
  return [
    "translation",
    "position",
    "rotation",
    "quaternion",
    "scale",
    "weights",
    "morph",
    "visibility",
    "material"
  ].includes(value);
}

interface BoneAccumulator {
  position?: MutableVector3;
  rotation?: MutableQuaternion;
  scale?: MutableVector3;
  positionWeight: number;
  rotationWeight: number;
  scaleWeight: number;
}

interface MutableVector3 {
  x: number;
  y: number;
  z: number;
}

interface MutableQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

function createBoneAccumulator(): BoneAccumulator {
  return {
    positionWeight: 0,
    rotationWeight: 0,
    scaleWeight: 0
  };
}

function accumulateTransform(accumulator: BoneAccumulator, transform: AnimationPoseTransform, weight: number): void {
  if (weight <= 0) return;
  if (transform.position) {
    accumulator.position = accumulator.position ?? { x: 0, y: 0, z: 0 };
    accumulator.position.x += transform.position.x * weight;
    accumulator.position.y += transform.position.y * weight;
    accumulator.position.z += transform.position.z * weight;
    accumulator.positionWeight += weight;
  }
  if (transform.rotation) {
    accumulator.rotation = accumulator.rotation ?? { x: 0, y: 0, z: 0, w: 0 };
    accumulator.rotation.x += transform.rotation.x * weight;
    accumulator.rotation.y += transform.rotation.y * weight;
    accumulator.rotation.z += transform.rotation.z * weight;
    accumulator.rotation.w += transform.rotation.w * weight;
    accumulator.rotationWeight += weight;
  }
  if (transform.scale) {
    accumulator.scale = accumulator.scale ?? { x: 0, y: 0, z: 0 };
    accumulator.scale.x += transform.scale.x * weight;
    accumulator.scale.y += transform.scale.y * weight;
    accumulator.scale.z += transform.scale.z * weight;
    accumulator.scaleWeight += weight;
  }
}

function resolveAccumulator(accumulator: BoneAccumulator): AnimationPoseTransform {
  return {
    position: accumulator.position && accumulator.positionWeight > 0
      ? {
          x: accumulator.position.x / accumulator.positionWeight,
          y: accumulator.position.y / accumulator.positionWeight,
          z: accumulator.position.z / accumulator.positionWeight
        }
      : undefined,
    rotation: accumulator.rotation && accumulator.rotationWeight > 0
      ? normalizeQuaternion({
          x: accumulator.rotation.x / accumulator.rotationWeight,
          y: accumulator.rotation.y / accumulator.rotationWeight,
          z: accumulator.rotation.z / accumulator.rotationWeight,
          w: accumulator.rotation.w / accumulator.rotationWeight
        })
      : undefined,
    scale: accumulator.scale && accumulator.scaleWeight > 0
      ? {
          x: accumulator.scale.x / accumulator.scaleWeight,
          y: accumulator.scale.y / accumulator.scaleWeight,
          z: accumulator.scale.z / accumulator.scaleWeight
        }
      : undefined
  };
}

function toVector3(value: unknown): MutableVector3 | undefined {
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value.map(Number);
    if ([x, y, z].every(Number.isFinite)) return { x, y, z };
  }
  if (isObject(value)) {
    const x = Number((value as { x?: unknown }).x);
    const y = Number((value as { y?: unknown }).y);
    const z = Number((value as { z?: unknown }).z);
    if ([x, y, z].every(Number.isFinite)) return { x, y, z };
  }
  return undefined;
}

function toQuaternion(value: unknown): MutableQuaternion | undefined {
  if (Array.isArray(value) && value.length >= 4) {
    const [x, y, z, w] = value.map(Number);
    if ([x, y, z, w].every(Number.isFinite)) return normalizeQuaternion({ x, y, z, w });
  }
  if (isObject(value)) {
    const x = Number((value as { x?: unknown }).x);
    const y = Number((value as { y?: unknown }).y);
    const z = Number((value as { z?: unknown }).z);
    const w = Number((value as { w?: unknown }).w);
    if ([x, y, z, w].every(Number.isFinite)) return normalizeQuaternion({ x, y, z, w });
  }
  return undefined;
}

function normalizeQuaternion(quaternion: MutableQuaternion): MutableQuaternion {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  if (length <= 0.000001) return { x: 0, y: 0, z: 0, w: 1 };
  return {
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
    w: quaternion.w / length
  };
}

function toFiniteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function createDiagnostic<TClipId extends string>(
  severity: AuraAnimationDiagnosticSeverity,
  code: string,
  message: string,
  clipId?: TClipId,
  bone?: string,
  trackId?: string
): AuraAnimationDiagnostic<TClipId> {
  return {
    severity,
    code,
    message,
    clipId,
    bone,
    trackId
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
