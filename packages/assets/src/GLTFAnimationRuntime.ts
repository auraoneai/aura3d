import { AnimationAction, AnimationClip, AnimationLayer, AnimationMixer, consumeRootMotion, extractRootMotion, createFootIkRig, type RootMotionConsumption, type RootMotionSample, normalizeQuat, slerpQuat, solveTwoBoneIk, type AnimationEvent, type AnimationMixerOptions, type AnimationMixerSnapshot, type AnimationTrack, type AnimationValue, type FootIkRig, type GroundRaycaster, type LoopMode, type TrackValueType, type TwoBoneIkResult } from "@aura3d/animation";
import { bindSkeleton, compileClip, createPoseBuffer, makeClipAdditive, PoseMixer, type CompiledClip, type PoseBuffer, type PoseSampleSpec, type SkeletonBinding } from "@aura3d/animation/lanes";
import { AURA3D_RETARGET_ENGINE_VERSION, bakeClipsInWorker, bakeRetargetedClipMap, createRetargetWorker, decompileCompiledClip, readRetargetCache, retargetCacheKey, retargetClipsHash, retargetSkeletonHash, writeRetargetCache, type BakeRetargetedClipsOptions } from "@aura3d/animation/lanes";
import { composeMat4, decomposeMat4, invertMat4, MAX_RENDERABLE_SKINNING_JOINTS, multiplyMat4, Renderable, Scene, transformPoint, type Light, type Mat4, type Quat, type SceneNode, type Vec3 } from "@aura3d/scene";
import { skinningPaletteCache } from "@aura3d/rendering";
import type { GLTFAsset, GLTFMeshAsset, GLTFSkinAsset, GLTFSkinBindingProvenance } from "./GLTFLoader";
import { getGLTFLightAnimationTrackIdentity, getGLTFLightSceneIdentity } from "./GLTFLightPointerIdentity";

type GLTFLightTrackIdentity = NonNullable<ReturnType<typeof getGLTFLightAnimationTrackIdentity>>;

const animatedRenderableOwners = new WeakMap<Renderable, Set<WeakRef<SceneNode>>>();

interface GLTFNodeTrackBinding {
  readonly publicTarget: string;
  readonly node?: SceneNode;
}

interface GLTFSampledAnimationTargets {
  readonly sampledTargets: ReadonlyMap<string, AnimationValue>;
  readonly unsupportedTracks: readonly string[];
  readonly lightTrackIdentities?: ReadonlyMap<string, GLTFLightTrackIdentity>;
  readonly ambiguousLightTargets?: ReadonlySet<string>;
  readonly nodeTrackBindings?: ReadonlyMap<string, GLTFNodeTrackBinding>;
}

/**
 * Structural material sink for `material:<name>.<leaf>` animation-pointer tracks. Kept
 * structural (instead of importing the rendering `Material`) so the animation runtime stays
 * decoupled from the renderer; the production bridge adapts the live material library.
 */
/**
 * T3.8 (PRD-06 §7.2) — options for `addClipsFrom`: the bake options plus the
 * cache/worker plumbing (`cache`/`worker` default on, `engineVersion` defaults
 * to the lane's retarget version key).
 */
export interface AddClipsFromRuntimeOptions extends BakeRetargetedClipsOptions {
  readonly engineVersion?: string;
  readonly cache?: boolean;
  readonly worker?: boolean;
}

export type GLTFSceneAnimationMaterialBindingFailure = "missing-map" | "changed-map" | "disposed" | "ambiguous" | "unsupported";
export type GLTFSceneAnimationMaterialBindingStatus = "available" | GLTFSceneAnimationMaterialBindingFailure;
export type GLTFSceneAnimationMaterialApplyStatus = "applied" | GLTFSceneAnimationMaterialBindingFailure;
/**
 * Availability in the current scene/resource configuration. "unavailable"
 * means the binding is structurally blocked, not merely waiting for lazy
 * work. "unknown" must be used when the provider cannot make that distinction.
 */
export interface GLTFSceneAnimationBindingAvailability {
  readonly status: "available" | "pending" | "unavailable" | "unknown";
  readonly reason?: string;
}
export interface GLTFSceneAnimationMaterialBindingIssue {
  readonly target: string;
  readonly reason: GLTFSceneAnimationMaterialBindingFailure | "missing-material";
}

export interface GLTFSceneAnimationMaterialSink {
  readonly name: string;
  setAnimationParameter(parameter: string, value: number | readonly number[]): void;
  /** Inspect the current live binding without writing to it. */
  animationParameterStatus?(parameter: string): GLTFSceneAnimationMaterialBindingStatus;
  /** Optional, explicit readiness/permanence evidence; old sinks remain valid. */
  animationParameterAvailability?(parameter: string): GLTFSceneAnimationBindingAvailability;
  /** Revalidate and apply atomically; failure must not be reported as a write. */
  applyAnimationParameter?(parameter: string, value: number): GLTFSceneAnimationMaterialApplyStatus;
  /** Apply a texture transform uniform only after revalidating its source binding. */
  applyAnimationTextureTransform?(parameter: string, value: number | readonly [number, number]): GLTFSceneAnimationMaterialApplyStatus;
}

export interface GLTFSceneAnimationRuntimeOptions {
  readonly scene: Scene;
  readonly clips: readonly AnimationClip[];
  readonly asset?: Pick<GLTFAsset, "meshes" | "skins"> & Partial<Pick<GLTFAsset,
    "animations" | "gltfAssetId" | "nodeIndexForTrack" | "sceneIncludesTrackTarget" | "skinBindingForNode"
  >>;
  readonly actorRoot?: SceneNode;
  /** Overrides the asset's per-track lookup. An undefined index does not select a loaded asset's node. */
  readonly nodeIndexForTrack?: (track: AnimationTrack) => number | undefined;
  /**
   * Resolves a glTF material name to its live material sink. When absent, every
   * `material:*` track is reported as a missing target (diagnosed, never silent).
   */
  readonly resolveAnimationMaterial?: (name: string) => GLTFSceneAnimationMaterialSink | undefined;
  /**
   * Optional foot-planting post-pass (E2): after clip/pose tracks are applied, leg chains
   * are solved against `ground` (heightfield, moving-platform adapter, …) and written back
   * with `setFootPlanting`. Legs whose nodes are missing are reported, never faked.
   */
  readonly footPlanting?: GLTFootPlantingConfig;
}

/** One leg chain for the foot-planting post-pass, addressed by glTF node names. */
export interface GLTFootPlantingLegConfig {
  readonly side: "left" | "right";
  readonly hip: string;
  readonly knee: string;
  readonly ankle: string;
  readonly hipIndex?: number;
  readonly kneeIndex?: number;
  readonly ankleIndex?: number;
  readonly pole?: readonly [number, number, number];
  /** Optional measured joint-to-sole offset for asymmetric footwear. */
  readonly ankleHeight?: number;
  readonly contact?: boolean;
  readonly support?: { readonly id: string; readonly delta: readonly [number, number, number] };
}

export interface GLTFootPlantingConfig {
  readonly legs: readonly GLTFootPlantingLegConfig[];
  readonly ground: GroundRaycaster;
  readonly ankleHeight?: number;
  readonly rayStartHeight?: number;
  readonly maxRayDistance?: number;
  readonly plantThreshold?: number;
  readonly hipDropFactor?: number;
  /** False is a diagnostic control: ankle lock alone does not plant the skinned sole. */
  readonly lockFootRotation?: boolean;
  /**
   * Actor-local → world matrix (column-major 16). The runtime skeleton usually lives in
   * import units (the certified walk girl is centimeter-scale) while `ground` speaks world
   * meters (the engine auto-normalizes model nodes for display). With this matrix the
   * post-pass raycasts and solves in world space — the same space the renderer draws — and
   * maps solved targets back to actor-local for write-back. Solved errors stay in world
   * units. Omit only when the runtime scene already is the world scene (identity).
   */
  readonly worldFromLocal?: Mat4;
}

export interface GLTFootPlantingApplyResult {
  /** Post-writeback world ankle positions, measured from scene transforms rather than IK targets. */
  readonly feet?: readonly { readonly side: "left" | "right"; readonly worldPosition: readonly [number, number, number]; readonly contactError: number; readonly locked: boolean }[];
  readonly surfaces?: readonly { readonly side: "left" | "right"; readonly mesh: string; readonly vertex: number; readonly worldPosition: readonly [number, number, number]; readonly groundError: number | null; readonly skinningProbe?: { readonly position: readonly number[]; readonly joints: readonly number[]; readonly weights: readonly number[]; readonly matrices: readonly number[]; readonly modelMatrix: readonly number[]; readonly expectedWorldPosition: readonly number[] } }[];
  readonly legDeformation?: readonly { readonly side: "left" | "right"; readonly upperBefore: number; readonly upperAfter: number; readonly lowerBefore: number; readonly lowerAfter: number; readonly maxRelativeLengthChange: number }[];
  readonly groundedFeet: number;
  readonly averageTargetError: number;
  readonly lockedSides: readonly ("left" | "right")[];
  readonly missingLegNodes: readonly string[];
  /** Pelvis drop applied to hips this solve (≤ 0) so over-extended legs can reach. */
  readonly hipOffset: number;
}

/**
 * Synonym groups for fuzzy clip-name matching. Real catalog assets label the same
 * motion wildly differently ("Loops" vs "Idle", "Take 001" vs "Run", "sprint" vs
 * "run"). Each inner array is a set of interchangeable canonical tokens.
 */
const GLTF_CLIP_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["idle", "static", "rest", "loops", "loop", "tpose", "t-pose", "bind"],
  ["walk", "walking", "stroll"],
  ["run", "running", "sprint", "jog"],
  ["wave", "emote-yes", "emoteyes", "greet", "hello"],
  ["jump", "jumping", "hop"],
  ["attack", "punch", "hit", "strike"],
  ["death", "die", "dead"]
];

function normalizeClipToken(name: string): string {
  return name.toLowerCase().replace(/[\s_.\-]+/g, "");
}

/**
 * Resolve a requested clip name to the best available clip name.
 *
 * Matching order:
 *   1. Exact case-insensitive (ignoring whitespace/underscores/dots/dashes).
 *   2. Synonym-group match: the requested name and an available name belong to
 *      the same synonym group (e.g. "run" resolves to "Sprint").
 *   3. Substring match in either direction (e.g. "walk" -> "WalkCycle").
 *   4. Fallback to the first available clip.
 *
 * Returns `undefined` only when there are no available clips.
 */
export type ResolveGLTFClipNameFallback = "error" | "first";

export interface ResolveGLTFClipNameOptions {
  /**
   * What to return when levels 1-3 (exact/synonym/substring) all miss.
   * `"first"` keeps the legacy pick-the-first-clip behavior; `"error"`
   * returns `undefined` so the caller can warn and degrade. When omitted,
   * the default follows the QR defaults resolution (§5.2 env/URL sources):
   * `"error"` under 3.1 (`A3D_QR_ANIMATION`/`A3D_QR`/`?a3d-qr=` flag on),
   * `"first"` otherwise. Callers that know the resolved flags (the
   * compiler) should pass it explicitly.
   */
  readonly fallback?: ResolveGLTFClipNameFallback;
}

const animationClipDefaultsAre31 = (): boolean => {
  const parseList = (value: string | undefined): string[] =>
    value === undefined ? [] : value.split(/[\s,]+/).map((entry) => entry.trim().toLowerCase()).filter((entry) => entry !== "");
  const env = typeof process !== "undefined" ? process.env : undefined;
  if (env !== undefined) {
    const scoped = env["A3D_QR_ANIMATION"];
    if (scoped !== undefined && scoped !== "0" && scoped.toLowerCase() !== "false" && scoped.toLowerCase() !== "off") return true;
    const root = parseList(env["A3D_QR"] ?? env["A3D_QR_FLAGS"]);
    if (root.includes("animation") || root.includes("all") || root.includes("true")) return true;
  }
  if (typeof location !== "undefined" && typeof location.search === "string") {
    try {
      const params = new URLSearchParams(location.search);
      const urlFlags = parseList(params.get("a3d-qr") ?? undefined);
      if (urlFlags.includes("animation") || urlFlags.includes("all") || urlFlags.includes("true")) return true;
    } catch {
      // malformed URLSearchParams input — ignore URL source
    }
  }
  return false;
};

export function resolveGLTFClipName(
  requested: string,
  available: readonly string[],
  options?: ResolveGLTFClipNameOptions
): string | undefined {
  if (available.length === 0) return undefined;
  const requestedToken = normalizeClipToken(requested);

  for (const name of available) {
    if (normalizeClipToken(name) === requestedToken) return name;
  }

  const requestedGroup = GLTF_CLIP_SYNONYM_GROUPS.find((group) => group.includes(requestedToken));
  if (requestedGroup) {
    for (const name of available) {
      if (requestedGroup.includes(normalizeClipToken(name))) return name;
    }
  }

  for (const name of available) {
    const token = normalizeClipToken(name);
    if (requestedToken.length > 0 && (token.includes(requestedToken) || requestedToken.includes(token))) {
      return name;
    }
  }

  const fallback = options?.fallback ?? (animationClipDefaultsAre31() ? "error" : "first");
  return fallback === "first" ? available[0] : undefined;
}

export interface GLTFSceneAnimationClipBoneMask {
  /** Only apply tracks whose node name matches one of these (substring match), if present. */
  readonly include?: readonly string[];
  /** Never apply tracks whose node name matches one of these (substring match). */
  readonly exclude?: readonly string[];
}

export interface GLTFSceneAnimationClipSample {
  readonly clipName: string;
  readonly time: number;
  readonly weight?: number;
  readonly additive?: boolean;
  /**
   * Optional per-clip bone mask for layered playback (e.g. an upper-body attack over a full-body
   * locomotion base). When set, only matching node tracks from this clip are blended in. Default
   * (undefined) applies the whole clip, preserving existing behavior.
   */
  readonly mask?: GLTFSceneAnimationClipBoneMask;
}

function clipMaskAllowsNode(mask: GLTFSceneAnimationClipBoneMask | undefined, nodeName: string): boolean {
  if (!mask) return true;
  if (mask.exclude && mask.exclude.some((entry) => nodeName.includes(entry))) return false;
  if (mask.include && mask.include.length > 0) return mask.include.some((entry) => nodeName.includes(entry));
  return true;
}

/**
 * A single bone's local transform inside a {@link GLTFScenePose}. Components are plain tuples in
 * glTF/scene convention (translation/scale as `[x,y,z]`, rotation as a quaternion `[x,y,z,w]`). For
 * convenience the bridge also accepts the object form (`{x,y,z}` / `{x,y,z,w}`) emitted directly by
 * `@aura3d/animation`'s `retargetHumanoidPose`, so a retargeted `AnimationPose` can be handed in
 * without re-shaping.
 */
export interface GLTFScenePoseBoneTransform {
  readonly position?: readonly [number, number, number] | { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation?: readonly [number, number, number, number] | { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
  readonly scale?: readonly [number, number, number] | { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * An externally-computed pose keyed directly by GLB **node names** (not semantic humanoid slots).
 * This is the render-time bridge target for a retargeted `AnimationPose`: the keys of `bones` are
 * the target rig's node names — exactly what `retargetHumanoidPose(...).bones` produces for a
 * humanoid map (`binding.target.name`). `morphTargets` maps a node name to a single morph weight.
 */
export interface GLTFScenePose {
  readonly bones: Record<string, GLTFScenePoseBoneTransform>;
  readonly morphTargets?: Record<string, number>;
}

export interface GLTFSceneAnimationApplyResult {
  readonly clipName: string;
  readonly time: number;
  readonly blendedClipCount?: number;
  readonly tracksApplied: number;
  readonly transformTracksApplied: number;
  readonly morphWeightTracksApplied: number;
  readonly materialTracksApplied: number;
  readonly lightTracksApplied: number;
  readonly footPlanting?: GLTFootPlantingApplyResult;
  readonly skinningPalettesUpdated: number;
  readonly missingTargets: readonly string[];
  readonly unsupportedTracks: readonly string[];
  /** Material tracks that could not resolve or apply, with their current binding failure. */
  readonly materialBindingIssues?: readonly GLTFSceneAnimationMaterialBindingIssue[];
  /**
   * PRD-06 §9.8/§13 — wall-clock split of this apply's animation phase, in
   * ms. Published only by the pose paths (`applyClips`, `applyPoseMixer`);
   * `cpuMs` covers the whole call (mixer + constraints + springs + target
   * application + palette build).
   */
  readonly phaseTimings?: GLTFSceneAnimationPhaseTimings;
}

/** PRD-06 §9.8 — per-phase wall-clock timings for one animation apply (ms). */
export interface GLTFSceneAnimationPhaseTimings {
  readonly mixerMs: number;
  readonly constraintsMs: number;
  readonly springsMs: number;
  readonly paletteBytes: number;
  readonly cpuMs: number;
}

/**
 * T3.5 (PRD-06 §7.1) — a pose-space constraint entry on the runtime. Evaluated
 * after the mixer writes the pose and before skinning palettes are built.
 * `bones` lists the joint indices `evaluate` may touch so the runtime unions
 * them into the emitted sampled targets even when no clip covers them.
 */
export interface GLTFPoseConstraint {
  /** Joints this constraint may write (SkeletonBinding indices). */
  readonly bones: readonly number[];
  /**
   * PRD-06 §9.8 — `"springs"` tags spring-chain constraints so the runtime's
   * phase timings can split `springsMs` from `constraintsMs`.
   */
  readonly kind?: "springs";
  /**
   * Apply the constraint onto `pose`. `modelMatrix` maps world→model space
   * (skeleton-root space); `context.dt` is the frame dt (applyPoseMixer) or the
   * nominal 1/60 for stateless `applyClips` evaluation.
   */
  evaluate(pose: PoseBuffer, binding: SkeletonBinding, modelMatrix: readonly number[] | Float32Array, context: { readonly dt: number }): void;
}

export interface GLTFSceneAnimationRuntimeSnapshot {
  readonly clipCount: number;
  readonly nodeTargetCount: number;
  readonly morphTargetNodeCount: number;
  readonly skinningBindingCount: number;
  readonly clips: readonly string[];
  readonly lastApply?: GLTFSceneAnimationApplyResult;
}

export interface GLTFSceneAnimationClipBindingDiagnostics {
  readonly clipName: string;
  readonly trackCount: number;
  readonly supportedTrackCount: number;
  readonly boundTrackCount: number;
  readonly transformTrackCount: number;
  readonly morphWeightTrackCount: number;
  readonly materialTrackCount: number;
  readonly lightTrackCount: number;
  readonly boundMaterialNames: readonly string[];
  readonly boundLightNames: readonly string[];
  readonly missingTargetCount: number;
  readonly unsupportedTrackCount: number;
  readonly skinningBindingCount: number;
  readonly boundNodeNames: readonly string[];
  readonly missingTargets: readonly string[];
  readonly unsupportedTracks: readonly string[];
  /** Material binding failures are inspected against the current live resources. */
  readonly materialBindingIssues?: readonly GLTFSceneAnimationMaterialBindingIssue[];
  readonly animatesSkeleton: boolean;
}

/** A binding assessment keyed by the actual track, not by its potentially shared target name. */
export interface GLTFSceneAnimationTrackBindingDiagnostics extends GLTFSceneAnimationBindingAvailability {
  readonly track: AnimationTrack;
  readonly target: string;
}

export interface GLTFSceneAnimationMixerOptions extends GLTFSceneAnimationRuntimeOptions {
  readonly autoPlay?: string | false;
  readonly mixer?: AnimationMixerOptions;
  /** Called once per blended update; owns actor movement before foot placement. */
  readonly consumeRootMotion?: (sample: RootMotionSample) => void;
}

export interface GLTFSceneAnimationMixerUpdateResult {
  readonly events: readonly AnimationEvent[];
  /** Marker occurrences omitted after the action catch-up limit. */
  readonly eventOverflow: number;
  readonly applyResult: GLTFSceneAnimationApplyResult;
  readonly activeActions: readonly GLTFSceneAnimationActionSnapshot[];
}

export interface GLTFSceneAnimationMixerSnapshot extends GLTFSceneAnimationRuntimeSnapshot {
  readonly mixerActionCount: number;
  readonly pendingValueCount: number;
  readonly elapsedTime: number;
  readonly timeScale: number;
  readonly activeClipNames: readonly string[];
  readonly actions: readonly GLTFSceneAnimationActionSnapshot[];
}

/** Restorable state, separate from the existing diagnostic snapshot API. */
export interface GLTFSceneAnimationMixerSerializedState {
  readonly version: 1;
  readonly elapsedTime: number;
  readonly eventOverflow: number;
  readonly pendingValues: readonly (readonly [string, AnimationValue])[];
  readonly mixer: AnimationMixerSnapshot;
}

export interface GLTFSceneAnimationPlayOptions {
  readonly weight?: number;
  readonly timeScale?: number;
  readonly loopMode?: LoopMode;
  /** Number of boundary crossings before repeat/ping-pong finishes. */
  readonly repetitions?: number;
  /** Keep the final pose active after playback finishes. */
  readonly clampWhenFinished?: boolean;
  readonly reset?: boolean;
  readonly fadeDuration?: number;
}

export interface GLTFSceneAnimationActionSnapshot {
  readonly clipName: string;
  readonly duration: number;
  readonly time: number;
  readonly weight: number;
  readonly timeScale: number;
  readonly playing: boolean;
  readonly paused: boolean;
  readonly loopMode: LoopMode;
  readonly active: boolean;
}

export interface GLTFImportedSkeletonIKOptions {
  readonly skinName?: string;
  readonly jointNames?: readonly [string, string, string];
  readonly jointIndices?: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly pole?: readonly [number, number, number];
  readonly weight?: number;
  readonly allowStretch?: boolean;
  readonly apply?: boolean;
}

export interface GLTFImportedSkeletonIKResult {
  readonly skinName: string;
  readonly jointNames: readonly [string, string, string];
  readonly solution: TwoBoneIkResult;
  readonly applied: boolean;
  readonly skinningPalettesUpdated: number;
  readonly missingTargets: readonly string[];
}

export interface GLTFImportedSkeletonIKControllerOptions extends Omit<GLTFImportedSkeletonIKOptions, "target"> {
  readonly target: readonly [number, number, number];
}

export interface GLTFImportedSkeletonIKControllerSnapshot {
  readonly target: readonly [number, number, number];
  readonly pole?: readonly [number, number, number];
  readonly weight?: number;
  readonly allowStretch?: boolean;
  readonly apply: boolean;
  readonly skinName?: string;
  readonly jointNames?: readonly [string, string, string];
  readonly jointIndices?: readonly [number, number, number];
  readonly lastResult?: GLTFImportedSkeletonIKResult;
}

export interface GLTFSceneAnimationCloneSample {
  readonly cloneId: string;
  readonly clipName: string;
  readonly time: number;
  readonly weight?: number;
  readonly additive?: boolean;
}

export interface GLTFSceneAnimationCloneSampleResult {
  readonly cloneId: string;
  readonly clipName: string;
  readonly time: number;
  readonly applyResult: GLTFSceneAnimationApplyResult;
}

export interface GLTFSceneAnimationCloneSamplerSnapshot {
  readonly cloneCount: number;
  readonly lastSampleCount: number;
  readonly lastSkinningPalettesUpdated: number;
  readonly lastResults: readonly GLTFSceneAnimationCloneSampleResult[];
}

export interface GLTFSceneMorphTargetControllerOptions {
  readonly target: string;
  readonly labels?: readonly string[];
  readonly initialWeights?: readonly number[];
  readonly clamp?: boolean;
}

export interface GLTFSceneMorphTargetControllerSnapshot {
  readonly target: string;
  readonly labels: readonly string[];
  readonly weights: readonly number[];
  readonly lastApply?: GLTFSceneAnimationApplyResult;
}

export class GLTFSceneMorphTargetController {
  private readonly labels: readonly string[];
  private readonly labelToIndex = new Map<string, number>();
  private readonly clampWeights: boolean;
  private weights: number[];
  private lastApply: GLTFSceneAnimationApplyResult | undefined;

  constructor(
    private readonly runtime: GLTFSceneAnimationRuntime,
    private readonly options: GLTFSceneMorphTargetControllerOptions
  ) {
    if (options.target.trim().length === 0) {
      throw new Error("glTF morph target controller target cannot be empty.");
    }
    this.labels = [...(options.labels ?? [])];
    this.labels.forEach((label, index) => {
      if (label.trim().length === 0) {
        throw new Error("glTF morph target controller labels cannot be empty.");
      }
      this.labelToIndex.set(label, index);
    });
    this.clampWeights = options.clamp ?? true;
    this.weights = [...(options.initialWeights ?? new Array(Math.max(1, this.labels.length)).fill(0))].map((weight) => this.normalizeWeight(weight));
  }

  setWeight(indexOrLabel: number | string, weight: number): this {
    const index = this.resolveIndex(indexOrLabel);
    this.ensureWeightIndex(index);
    this.weights[index] = this.normalizeWeight(weight);
    return this;
  }

  setWeights(weights: readonly number[]): this {
    if (weights.length === 0) {
      throw new Error("glTF morph target controller requires at least one morph weight.");
    }
    this.weights = weights.map((weight) => this.normalizeWeight(weight));
    return this;
  }

  getWeights(): readonly number[] {
    return [...this.weights];
  }

  apply(time: number, label = `morph:${this.options.target}`): GLTFSceneAnimationApplyResult {
    this.lastApply = this.runtime.applyAnimationValues(label, time, new Map([[this.options.target, [...this.weights]]]));
    return this.lastApply;
  }

  snapshot(): GLTFSceneMorphTargetControllerSnapshot {
    return {
      target: this.options.target,
      labels: [...this.labels],
      weights: [...this.weights],
      ...(this.lastApply === undefined ? {} : { lastApply: this.lastApply })
    };
  }

  private resolveIndex(indexOrLabel: number | string): number {
    if (typeof indexOrLabel === "number") {
      if (!Number.isInteger(indexOrLabel) || indexOrLabel < 0) {
        throw new Error("glTF morph target controller index must be a non-negative integer.");
      }
      return indexOrLabel;
    }
    const index = this.labelToIndex.get(indexOrLabel);
    if (index === undefined) {
      throw new Error(`glTF morph target label "${indexOrLabel}" was not found.`);
    }
    return index;
  }

  private ensureWeightIndex(index: number): void {
    while (this.weights.length <= index) {
      this.weights.push(0);
    }
  }

  private normalizeWeight(weight: number): number {
    if (!Number.isFinite(weight)) {
      throw new Error("glTF morph target controller weights must be finite.");
    }
    if (!this.clampWeights) return weight;
    return Math.min(1, Math.max(0, weight));
  }
}

export class GLTFSceneAnimationCloneSampler {
  private lastResults: GLTFSceneAnimationCloneSampleResult[] = [];

  constructor(private readonly runtime: GLTFSceneAnimationRuntime) {}

  sampleClones(
    samples: readonly GLTFSceneAnimationCloneSample[],
    onSample?: (result: GLTFSceneAnimationCloneSampleResult) => void
  ): readonly GLTFSceneAnimationCloneSampleResult[] {
    const results: GLTFSceneAnimationCloneSampleResult[] = [];
    for (const sample of samples) {
      const applyResult = sample.weight === undefined && sample.additive !== true
        ? this.runtime.applyClipByName(sample.clipName, sample.time)
        : this.runtime.applyClips([{
            clipName: sample.clipName,
            time: sample.time,
            ...(sample.weight === undefined ? {} : { weight: sample.weight }),
            ...(sample.additive === undefined ? {} : { additive: sample.additive })
          }]);
      const result: GLTFSceneAnimationCloneSampleResult = {
        cloneId: sample.cloneId,
        clipName: sample.clipName,
        time: applyResult.time,
        applyResult
      };
      results.push(result);
      onSample?.(result);
    }
    this.lastResults = results;
    return results;
  }

  snapshot(): GLTFSceneAnimationCloneSamplerSnapshot {
    return {
      cloneCount: new Set(this.lastResults.map((result) => result.cloneId)).size,
      lastSampleCount: this.lastResults.length,
      lastSkinningPalettesUpdated: this.lastResults.reduce((sum, result) => sum + result.applyResult.skinningPalettesUpdated, 0),
      lastResults: this.lastResults.map((result) => ({ ...result }))
    };
  }
}

export class GLTFImportedSkeletonIKController {
  private target: readonly [number, number, number];
  private pole: readonly [number, number, number] | undefined;
  private weight: number | undefined;
  private allowStretch: boolean | undefined;
  private apply: boolean;
  private lastResult: GLTFImportedSkeletonIKResult | undefined;

  constructor(
    private readonly runtime: GLTFSceneAnimationRuntime,
    private readonly options: Omit<GLTFImportedSkeletonIKControllerOptions, "target" | "pole" | "weight" | "allowStretch" | "apply">
      & Pick<GLTFImportedSkeletonIKControllerOptions, "skinName" | "jointNames">,
    initial: Pick<GLTFImportedSkeletonIKControllerOptions, "target" | "pole" | "weight" | "allowStretch" | "apply">
  ) {
    this.target = initial.target;
    this.pole = initial.pole;
    this.weight = initial.weight;
    this.allowStretch = initial.allowStretch;
    this.apply = initial.apply ?? true;
  }

  setTarget(target: readonly [number, number, number]): this {
    this.target = target;
    return this;
  }

  setPole(pole: readonly [number, number, number] | undefined): this {
    this.pole = pole;
    return this;
  }

  setWeight(weight: number | undefined): this {
    if (weight !== undefined && (!Number.isFinite(weight) || weight < 0 || weight > 1)) {
      throw new Error("glTF imported skeleton IK controller weight must be between 0 and 1.");
    }
    this.weight = weight;
    return this;
  }

  setAllowStretch(allowStretch: boolean | undefined): this {
    this.allowStretch = allowStretch;
    return this;
  }

  setApply(apply: boolean): this {
    this.apply = apply;
    return this;
  }

  solve(patch: Partial<Pick<GLTFImportedSkeletonIKControllerOptions, "target" | "pole" | "weight" | "allowStretch" | "apply">> = {}): GLTFImportedSkeletonIKResult {
    if (patch.target !== undefined) this.setTarget(patch.target);
    if ("pole" in patch) this.setPole(patch.pole);
    if ("weight" in patch) this.setWeight(patch.weight);
    if ("allowStretch" in patch) this.setAllowStretch(patch.allowStretch);
    if (patch.apply !== undefined) this.setApply(patch.apply);
    this.lastResult = this.runtime.solveImportedSkeletonTwoBoneIK({
      ...this.options,
      target: this.target,
      ...(this.pole === undefined ? {} : { pole: this.pole }),
      ...(this.weight === undefined ? {} : { weight: this.weight }),
      ...(this.allowStretch === undefined ? {} : { allowStretch: this.allowStretch }),
      apply: this.apply
    });
    return this.lastResult;
  }

  snapshot(): GLTFImportedSkeletonIKControllerSnapshot {
    return {
      target: this.target,
      ...(this.pole === undefined ? {} : { pole: this.pole }),
      ...(this.weight === undefined ? {} : { weight: this.weight }),
      ...(this.allowStretch === undefined ? {} : { allowStretch: this.allowStretch }),
      apply: this.apply,
      ...(this.options.skinName === undefined ? {} : { skinName: this.options.skinName }),
      ...(this.options.jointNames === undefined ? {} : { jointNames: this.options.jointNames }),
      ...(this.options.jointIndices === undefined ? {} : { jointIndices: this.options.jointIndices }),
      ...(this.lastResult === undefined ? {} : { lastResult: this.lastResult })
    };
  }
}

interface RuntimeSkinningScope {
  readonly nodesByIndex: Map<number, SceneNode[]>;
  readonly nodesByName: Map<string, SceneNode[]>;
  /** The enclosing imported scene instance, including when actorRoot is inside it. */
  readonly container?: SceneNode;
  hasNodeIdentity: boolean;
}

function gltfSceneContainerFor(node: SceneNode | null): SceneNode | undefined {
  for (let current = node; current; current = current.parent) {
    if (current.userData.gltfSceneContainer === true) return current;
  }
  return undefined;
}

function readSkinBindingProvenance(value: unknown): GLTFSkinBindingProvenance | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const isIndex = (index: unknown): index is number =>
    typeof index === "number" && Number.isSafeInteger(index) && index >= 0;
  if (typeof record.assetId !== "string" || record.assetId.length === 0
    || !isIndex(record.nodeIndex) || !isIndex(record.meshIndex)
    || !isIndex(record.primitiveIndex) || !isIndex(record.skinIndex)) return undefined;
  return {
    assetId: record.assetId,
    nodeIndex: record.nodeIndex,
    meshIndex: record.meshIndex,
    primitiveIndex: record.primitiveIndex,
    skinIndex: record.skinIndex
  };
}

function duplicateAnimationClipNames(clips: readonly AnimationClip[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const clip of clips) {
    if (seen.has(clip.name)) duplicates.add(clip.name);
    seen.add(clip.name);
  }
  return duplicates;
}

function assertUnambiguousClipName(name: string, duplicates: ReadonlySet<string>): void {
  if (duplicates.has(name)) {
    throw new Error(`glTF animation clip "${name}" is ambiguous; select a clip object or register it under a unique name.`);
  }
}

interface RuntimeSkinningBinding {
  readonly node: SceneNode;
  readonly renderable: Renderable;
  readonly mesh: GLTFMeshAsset;
  readonly skin: GLTFSkinAsset;
  readonly bindWorldMatrix: Mat4;
  readonly scope: RuntimeSkinningScope;
  readonly source?: {
    readonly owner: SceneNode;
    readonly provenance: GLTFSkinBindingProvenance;
  };
  jointNodes?: (SceneNode | undefined)[];
  /** §13: persistent palette view — `matrices` is rewritten in place per frame. */
  paletteView?: { readonly jointCount: number; readonly matrices: Float32Array; paletteKey?: object };
  /**
   * PRD-06 T0.11: the persistent joint palette buffer — allocated once at bind,
   * written in place every frame. The binding object itself is also the C-18
   * `paletteKey` (stable per skin instance for the actor runtime's lifetime).
   */
  readonly paletteMatrices: Float32Array;
}

type RuntimePoseTrackBinding = {
  readonly boneIndex?: number;
  readonly channel: "position" | "rotation" | "scale";
};

class RuntimePoseMixer extends PoseMixer {
  private readonly bindingsByClip = new WeakMap<CompiledClip, ReadonlyMap<number, RuntimePoseTrackBinding>>();
  private readonly boneIndices: ReadonlyMap<SceneNode, number>;

  constructor(
    skeleton: SkeletonBinding,
    nodes: readonly SceneNode[],
    private readonly names: ReadonlyMap<string, SceneNode[]>,
    private readonly resolveNode: (track: AnimationTrack) => SceneNode | undefined,
    private readonly duplicateNames: ReadonlySet<string>
  ) {
    super({ skeleton });
    this.boneIndices = new Map(nodes.map((node, index) => [node, index]));
  }

  override addClip(name: string, clip: AnimationClip): this {
    return this.addCompiledClip(name, compileClip(clip), clip);
  }

  override addCompiledClip(name: string, compiled: CompiledClip, source: AnimationClip): this {
    assertUnambiguousClipName(name, this.duplicateNames);
    const bindings = new Map<number, RuntimePoseTrackBinding>();
    for (let index = 0; index < compiled.tracks.length; index += 1) {
      const compiledTrack = compiled.tracks[index]!;
      const target = parseAnimationTarget(compiledTrack.target, this.names);
      if (!target || target.kind !== "node" || target.path === "weights") continue;
      const track = source.tracks[index];
      const node = track && track.target === compiledTrack.target && track.valueType === compiledTrack.valueType
        ? this.resolveNode(track)
        : undefined;
      const boneIndex = node === undefined ? undefined : this.boneIndices.get(node);
      bindings.set(index, {
        channel: target.path === "translation" ? "position" : target.path,
        ...(boneIndex === undefined ? {} : { boneIndex })
      });
    }
    const scopedClip = this.bindingsByClip.has(compiled) ? { ...compiled } : compiled;
    this.bindingsByClip.set(scopedClip, bindings);
    return super.addCompiledClip(name, scopedClip, source);
  }

  override clipAction(name: string, options?: Parameters<PoseMixer["clipAction"]>[1]): ReturnType<PoseMixer["clipAction"]> {
    assertUnambiguousClipName(name, this.duplicateNames);
    return super.clipAction(name, options);
  }

  override evaluateSamples(samples: readonly PoseSampleSpec[], out: PoseBuffer): void {
    for (const sample of samples) assertUnambiguousClipName(sample.clipName, this.duplicateNames);
    super.evaluateSamples(samples, out);
  }

  override resolveBindings(clip: CompiledClip): ReturnType<PoseMixer["resolveBindings"]> {
    const scoped = this.bindingsByClip.get(clip);
    if (!scoped) return super.resolveBindings(clip);
    const fallback = super.resolveBindings({
      ...clip,
      tracks: clip.tracks.map((track, index) => scoped.has(index) ? { ...track, target: "" } : track)
    });
    for (const [trackIndex, binding] of scoped) {
      if (binding.boneIndex === undefined) continue;
      const track = clip.tracks[trackIndex]!;
      const expectedType = binding.channel === "rotation" ? "quaternion" : "vector3";
      const expectedStride = binding.channel === "rotation" ? 4 : 3;
      if (track.valueType !== expectedType || track.stride !== expectedStride) {
        throw new Error(`POSE_TRACK_TYPE_MISMATCH: ${track.target} requires ${expectedType} (${expectedStride} components), got ${track.valueType} (${track.stride}).`);
      }
      fallback.push({ trackIndex, boneIndex: binding.boneIndex, channel: binding.channel });
    }
    return fallback.sort((a, b) => a.trackIndex - b.trackIndex);
  }
}

type WeightedAccumulator = { value: AnimationValue; weight: number; type: TrackValueType };
type TargetAccumulator = { type: TrackValueType; base?: WeightedAccumulator; additive?: AnimationValue };
type MaterialTrackBinding =
  | { readonly status: "available"; readonly sink: GLTFSceneAnimationMaterialSink; readonly parameters: readonly string[]; readonly mode: "legacy" | "scalar" | "texture" }
  | { readonly status: GLTFSceneAnimationMaterialBindingIssue["reason"] };

/** PRD-06 §9.8 — wall clock, ms (`performance.now` where it exists). */
function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Column-major mat4 multiply written into a Float32Array slot — the T0.11 no-alloc palette path. Exported so the §13 palette-build micro-budget test measures the exact per-joint write the runtime performs. `a` is hoisted into scalars once per call so the inner writes are pure FMA-grade flops — the indexed-read loop measured ~1.3× over the §13 palette budget. */
export function multiplyMat4Into(out: Float32Array, outOffset: number, a: ArrayLike<number>, b: ArrayLike<number>): void {
  const a00 = a[0]!, a10 = a[1]!, a20 = a[2]!, a30 = a[3]!;
  const a01 = a[4]!, a11 = a[5]!, a21 = a[6]!, a31 = a[7]!;
  const a02 = a[8]!, a12 = a[9]!, a22 = a[10]!, a32 = a[11]!;
  const a03 = a[12]!, a13 = a[13]!, a23 = a[14]!, a33 = a[15]!;
  for (let col = 0; col < 4; col += 1) {
    const b0 = b[col * 4 + 0]!, b1 = b[col * 4 + 1]!, b2 = b[col * 4 + 2]!, b3 = b[col * 4 + 3]!;
    out[outOffset + col * 4 + 0] = a00 * b0 + a01 * b1 + a02 * b2 + a03 * b3;
    out[outOffset + col * 4 + 1] = a10 * b0 + a11 * b1 + a12 * b2 + a13 * b3;
    out[outOffset + col * 4 + 2] = a20 * b0 + a21 * b1 + a22 * b2 + a23 * b3;
    out[outOffset + col * 4 + 3] = a30 * b0 + a31 * b1 + a32 * b2 + a33 * b3;
  }
}

/** Column-major general 4×4 inverse into `out` (adjugate / determinant, gl-matrix `mat4.invert`; 06-T0: out[7], out[10], out[11], out[14], out[15] previously used the wrong cofactor terms, so even inverse(identity) had out[11] = -1 and every skinning palette carried a non-affine row 3 that projected skinned vertices off-screen on the GPU). §13: `invertMat4` allocates two objects per call — over 600 frames that alone blows the steady-state budget. */
export function invertMat4Into(out: Float32Array, a: ArrayLike<number>): Float32Array {
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;
  const a30 = a[12]!, a31 = a[13]!, a32 = a[14]!, a33 = a[15]!;

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) {
    out.fill(0);
    return out;
  }
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export class GLTFSceneAnimationRuntime {
  private readonly clipsByName = new Map<string, AnimationClip>();
  private readonly registeredClips: AnimationClip[];
  private readonly duplicateClipNames: Set<string>;
  private readonly nodesByName = new Map<string, SceneNode[]>();
  private readonly nodesByIndex = new Map<number, SceneNode[]>();
  private readonly nodeOrdinals = new Map<SceneNode, number>();
  private readonly nodeScopes = new Map<SceneNode, RuntimeSkinningScope>();
  private readonly trackSourceOverrides = new WeakMap<AnimationTrack, AnimationTrack>();
  private readonly retargetedTracks = new WeakSet<AnimationTrack>();
  private trackNodeCache = new WeakMap<AnimationTrack, SceneNode | null>();
  private readonly morphRenderablesByNode = new Map<SceneNode, Renderable[]>();
  private readonly blockedMorphNodes = new Set<SceneNode>();
  private readonly morphRenderablesByNodeName = new Map<string, Renderable[]>();
  private readonly skinningBindings: RuntimeSkinningBinding[] = [];
  private readonly skinningBindingIssues: string[] = [];
  private ambiguousActorScope = false;
  private hasNodeIdentity = false;
  private disposed = false;
  private readonly footBindMatrices = new Map<string, { world: Mat4; local: Mat4 }>();
  private readonly footOrientationLocks = new Map<string, Mat4>();
  private readonly footDescendantLocks = new Map<string, Map<string, Mat4>>();
  private readonly footSurfaceVertices = new Map<string, readonly number[]>();
  private footPlanting: GLTFootPlantingConfig | undefined;
  private footRig: FootIkRig | undefined;
  private lastApply?: GLTFSceneAnimationApplyResult;
  /** T0.11 scratch for the per-joint palette multiply (inverseMeshWorld * jointWorld). */
  private readonly paletteScratch = new Float32Array(16);
  /** §13: reusable scratch for the per-binding inverse world matrix (no alloc/frame). */
  private readonly inverseWorldScratch = new Float32Array(16);
  /** §13: persistent result object for `refreshSkinningPalettes` (0 bytes/frame). */
  private readonly paletteResult = { updated: 0, missingTargets: [] as string[] };
  /**
   * T1.7 (PRD-06) — the per-runtime pose pipeline backing `applyClips`: a
   * scene-wide SkeletonBinding (every traversed node in order, rest pose = the
   * node's local TRS at bind time), one PoseMixer, and the compiled clips.
   * Rebuilt whenever `reindexScene` re-reads the node set.
   */
  private poseState?: {
    readonly binding: SkeletonBinding;
    readonly nodes: readonly SceneNode[];
    readonly mixer: PoseMixer;
    readonly compiled: Map<string, CompiledClip>;
    readonly pose: PoseBuffer;
    /**
     * T3.5 (PRD-06 §7.1) — ordered pose-space constraints evaluated after the
     * mixer writes `pose` and before `applySampledTargets` builds skinning
     * palettes. Empty by default; entries register via the `prd06.animation`
     * lane (`node.animation.ik.add`), so flag-off cost is a length check.
     */
    constraints: GLTFPoseConstraint[];
  };

  /**
   * T3.5 — world→model matrix provider for pose constraints. Defaults to the
   * scene root's world matrix; the `prd06.animation` actor extension installs
   * the app-node transform when one is known.
   */
  private poseConstraintModelMatrix?: () => readonly number[] | Float32Array;

  /**
   * Wall-clock (ms) of the last constraint evaluation under `applyClips` —
   * its caller passes no dt, so constraint dynamics measure the real gap.
   */
  private lastConstraintEvalAtMs?: number;

  constructor(private readonly options: GLTFSceneAnimationRuntimeOptions) {
    this.registeredClips = [...options.clips];
    this.duplicateClipNames = duplicateAnimationClipNames(options.clips);
    for (const clip of options.clips) {
      if (!this.duplicateClipNames.has(clip.name)) this.clipsByName.set(clip.name, clip);
    }
    this.reindexScene();
    if (options.footPlanting) this.setFootPlanting(options.footPlanting);
  }

  private requireClip(name: string): AnimationClip {
    this.assertAlive();
    assertUnambiguousClipName(name, this.duplicateClipNames);
    const clip = this.clipsByName.get(name);
    if (!clip) throw new Error(`glTF animation clip "${name}" was not found.`);
    return clip;
  }

  /**
   * Verify the actual runtime being captured, rather than accepting a caller's
   * description of a different actor or a name-compatible set of clips.
   * Stateful PoseMixer/constraints and external material/foot resources have
   * no serialization contract yet; silently discarding them would be unsafe.
   */
  assertSceneSerializationSource(scene: Scene, actorRoot: SceneNode, asset: GLTFAsset): void {
    this.assertAlive();
    if (this.options.scene !== scene || (this.options.actorRoot ?? scene.root) !== actorRoot || this.options.asset !== asset) {
      throw new Error("glTF serialization requires the runtime's exact scene, actor root and loaded asset.");
    }
    this.assertSceneSerializationSupported();
  }

  /** @internal Shared by the real scene adapter and the mixer binding. */
  assertSceneSerializationSupported(): void {
    this.assertAlive();
    const asset = this.options.asset;
    if (!asset?.animations || this.options.clips.length !== asset.animations.length ||
        this.options.clips.some((clip, index) => clip !== asset.animations![index]) ||
        this.registeredClips.length !== asset.animations.length ||
        this.registeredClips.some((clip, index) => clip !== asset.animations![index]) ||
        (this.options.nodeIndexForTrack !== undefined && this.options.nodeIndexForTrack !== asset.nodeIndexForTrack)) {
      throw new Error("glTF serialization requires the original loaded clips and track identity lookup.");
    }
    if (this.duplicateClipNames.size || this.ambiguousActorScope || this.skinningBindingIssues.length) {
      throw new Error("glTF serialization cannot capture ambiguous clips, actor scopes or skin bindings.");
    }
    if (this.skinningBindings.some((binding) => !this.skinningBindingIsCurrent(binding))) {
      throw new Error("glTF serialization cannot capture a stale skin binding.");
    }
    for (const binding of this.skinningBindings) {
      for (let index = 0; index < binding.skin.joints.length; index += 1) {
        const candidates = binding.scope.nodesByIndex.get(binding.skin.joints[index]!);
        const joint = candidates?.length === 1 ? candidates[0] : undefined;
        if (!joint || !this.nodeBelongsToScope(joint, binding.scope) ||
            joint.userData.gltfNodeIndex !== binding.skin.joints[index] ||
            (binding.jointNodes && binding.jointNodes[index] !== joint)) {
          throw new Error("glTF serialization cannot capture a stale or missing joint binding.");
        }
      }
    }
    for (const clip of asset.animations) {
      for (const track of clip.tracks) {
        if (asset.nodeIndexForTrack?.(track) !== undefined && !this.animationNodeForTrack(track)) {
          throw new Error("glTF serialization cannot capture a stale or missing node-track binding.");
        }
      }
    }
    if (this.poseState || this.footPlanting || this.poseConstraintModelMatrix || this.options.resolveAnimationMaterial) {
      throw new Error("glTF serialization does not support PoseAction/PoseMixer state, constraints, foot planting or material resources.");
    }
  }

  /**
   * Enable, replace, or clear (undefined) the foot-planting post-pass. Replacing the leg
   * set, ground, or solve parameters resets foot-lock state so a stale lock can never drag
   * a foot after retargeting. A matrix-only refresh (same shape, new `worldFromLocal`)
   * keeps locks: the engine re-sends the model matrix every frame because time-animated
   * model nodes move, and world-space locks stay valid across that refresh.
   */
  setFootPlanting(config: GLTFootPlantingConfig | undefined): void {
    this.assertAlive();
    if (config !== undefined && config.legs.length === 0) {
      throw new Error("glTF foot planting requires at least one leg.");
    }
    if (!sameFootPlantingShape(this.footPlanting, config)) {
      this.footRig = undefined;
      this.footOrientationLocks.clear();
      this.footDescendantLocks.clear();
    }
    this.footPlanting = config;
  }

  /**
   * Extract real authored displacement over unwrapped clip time, hand it to the physical
   * authority once, then apply an in-place root pose and solve feet in the updated actor
   * transform. Rejected movement is returned and discarded rather than accumulating drift.
   * The caller refreshes footPlanting.worldFromLocal inside move after committing movement.
   */
  applyRootMotionClip(name: string, options: {
    readonly fromTime: number;
    readonly toTime: number;
    readonly target: string;
    readonly loop?: boolean;
    readonly worldFromLocal: Mat4;
    readonly move: (requested: readonly [number, number, number]) => readonly [number, number, number];
  }): { motion: RootMotionConsumption; applyResult: GLTFSceneAnimationApplyResult } {
    return this.applyRootMotionClips([{ clipName: name, ...options }], options);
  }

  /** Blend displacement and consumed poses with the same base/additive weights. */
  applyRootMotionClips(samples: readonly {
    readonly clipName: string;
    readonly fromTime: number;
    readonly toTime: number;
    readonly target: string;
    readonly loop?: boolean;
    readonly weight?: number;
    readonly additive?: boolean;
  }[], options: {
    readonly worldFromLocal: Mat4;
    readonly move: (requested: readonly [number, number, number]) => readonly [number, number, number];
  }): { motion: RootMotionConsumption; applyResult: GLTFSceneAnimationApplyResult } {
    if (samples.length === 0) throw new Error("glTF root motion blend requires at least one clip sample.");
    const accumulators = new Map<string, TargetAccumulator>();
    const motionAccumulators = new Map<string, TargetAccumulator>();
    const unsupportedTracks: string[] = [];
    const lightTrackIdentities = new Map<string, GLTFLightTrackIdentity>();
    const nodeTrackBindings = new Map<string, GLTFNodeTrackBinding>();
    const names: string[] = [];
    let maxTime = 0;
    let rootNode: SceneNode | undefined;
    // Finish validation and sampling before the physical authority can mutate the actor.
    for (const sample of samples) {
      const clip = this.requireClip(sample.clipName);
      const weight = sample.weight ?? 1;
      if (!Number.isFinite(weight) || weight < 0) throw new Error("glTF root motion blend weight must be finite and non-negative.");
      const extracted = extractRootMotion(clip, sample);
      if (weight === 0) continue;
      const rootTracks = clip.tracks.filter((track) => track.target === sample.target);
      const node = rootTracks.length === 1 ? this.animationNodeForTrack(rootTracks[0]!) : undefined;
      if (!node || (rootNode && rootNode !== node)) {
        throw new Error(`glTF root motion target "${sample.target}" is missing or ambiguous.`);
      }
      rootNode = node;
      const time = sample.loop && clip.duration > 0
        ? ((sample.toTime % clip.duration) + clip.duration) % clip.duration
        : Math.max(0, Math.min(clip.duration, sample.toTime));
      maxTime = Math.max(maxTime, time);
      names.push(`${clip.name}@${time}x${weight}${sample.additive ? "+add" : ""}`);
      blendInto(motionAccumulators, "motion", "vector3", extracted.delta, weight, sample.additive === true);
      for (const track of clip.tracks) {
        const identity = getGLTFLightAnimationTrackIdentity(track);
        const publicTarget = identity?.publicTarget ?? track.target;
        if (!parseAnimationTarget(publicTarget, this.nodesByName)) {
          unsupportedTracks.push(publicTarget);
          continue;
        }
        const nodeTrack = identity ? undefined : this.nodeTrackSample(track);
        const sampleTarget = nodeTrack?.sampleTarget ?? identity?.sampleTarget ?? track.target;
        if (nodeTrack) nodeTrackBindings.set(sampleTarget, nodeTrack.binding);
        if (identity) lightTrackIdentities.set(sampleTarget, identity);
        // Consume each clip's own root before blending, including additive root tracks.
        const value = track.sample(track.target === sample.target ? 0 : time);
        blendInto(accumulators, sampleTarget, track.valueType, value, weight, sample.additive === true);
      }
    }
    const values = new Map<string, AnimationValue>();
    for (const [target, accumulator] of accumulators) values.set(target, finalizeTargetBlend(accumulator));
    const motionAccumulator = motionAccumulators.get("motion");
    const delta = motionAccumulator ? finalizeTargetBlend(motionAccumulator) as readonly [number, number, number] : [0, 0, 0] as const;
    const motion = consumeRootMotion({ target: "blend", fromTime: 0, toTime: maxTime, looped: samples.some(sample => sample.loop), delta }, options.worldFromLocal, options.move);
    this.lastApply = this.applySampledTargets(`root-motion:${names.join(",")}`, maxTime, { sampledTargets: values, unsupportedTracks, lightTrackIdentities, nodeTrackBindings }, samples.length);
    return { motion, applyResult: this.lastApply };
  }

  /**
   * T3.7 (PRD-06 §6.8) — resolve the root-motion translation track target for
   * spec-level `play(clip, {rootMotion})`: with `bone` set, the bone's own
   * `translation`/`position` track; without it, the clip's root-motion
   * candidate (largest planar displacement on a hips/root/pelvis node, then
   * any translation track by displacement). Throws when nothing qualifies.
   */
  rootMotionTargetFor(clipName: string, bone?: string): string {
    const clip = this.requireClip(clipName);
    const isTranslation = (target: string) => target.endsWith(".translation") || target.endsWith(".position");
    if (bone !== undefined) {
      for (const leaf of ["translation", "position"] as const) {
        const candidate = `${bone}.${leaf}`;
        if (clip.tracks.some(track => track.target === candidate && track.valueType === "vector3")) return candidate;
      }
      throw new Error(`Root motion bone "${bone}" has no translation track in glTF animation clip "${clipName}".`);
    }
    let best: string | undefined;
    let bestDistance = -1;
    let fallback: string | undefined;
    for (const track of clip.tracks) {
      if (track.valueType !== "vector3" || !isTranslation(track.target)) continue;
      fallback ??= track.target;
      const keys = track.keyframes ?? [];
      if (keys.length < 2) continue;
      const first = vec3OfKeyframeValue(keys[0]!.value);
      const last = vec3OfKeyframeValue(keys[keys.length - 1]!.value);
      if (!first || !last) continue;
      const distance = Math.hypot(last[0] - first[0], last[2] - first[2]);
      const rooted = /hips|root|pelvis/i.test(track.target);
      if (distance > 0.05 && (rooted || best === undefined || distance > bestDistance)) {
        if (rooted || best === undefined || !/hips|root|pelvis/i.test(best)) {
          best = track.target;
          bestDistance = distance;
        }
      }
    }
    const resolved = best ?? fallback;
    if (resolved === undefined) {
      throw new Error(`glTF animation clip "${clipName}" has no translation track for root motion.`);
    }
    return resolved;
  }

  /**
   * T3.7 — yaw delta (radians, about local Y) authored on `bone`'s rotation
   * track between `fromTime`/`toTime` (loop-aware). Returns 0 when the clip
   * has no matching rotation track.
   */
  rootMotionYawDelta(clipName: string, bone: string | undefined, fromTime: number, toTime: number, loop: boolean): number {
    const clip = this.requireClip(clipName);
    const node = bone ?? this.rootMotionTargetFor(clipName).replace(/\.(translation|position)$/, "");
    const track = clip.tracks.find(candidate =>
      candidate.valueType === "quaternion" &&
      (candidate.target === `${node}.rotation` || candidate.target === `${node}.quaternion`)
    );
    if (!track) return 0;
    const yawAt = (time: number): number => {
      const q = track.sample(time);
      const arr = (Array.isArray(q) || ArrayBuffer.isView(q)) ? q as ArrayLike<number> : undefined;
      const [x, y, z, w] = arr !== undefined && arr.length >= 4
        ? [arr[0]!, arr[1]!, arr[2]!, arr[3]!]
        : [0, 0, 0, 1];
      // forward = q * (0,0,1); yaw = atan2(forward.x, forward.z)
      const fx = 2 * (x * z + w * y);
      const fz = 1 - 2 * (x * x + y * y);
      return Math.atan2(fx, fz);
    };
    const wrap01 = (t: number) => ((t % clip.duration) + clip.duration) % clip.duration;
    const unwrap = (delta: number) => delta - Math.round(delta / (Math.PI * 2)) * Math.PI * 2;
    if (!loop || clip.duration <= 0) {
      const clamp = (t: number) => Math.max(0, Math.min(clip.duration, t));
      return unwrap(yawAt(clamp(toTime)) - yawAt(clamp(fromTime)));
    }
    // Continuous-loop yaw: same-cycle delta plus per-cycle contribution per wrap.
    const perCycle = unwrap(yawAt(clip.duration) - yawAt(0));
    const crossings = Math.floor(toTime / clip.duration) - Math.floor(fromTime / clip.duration);
    return unwrap(yawAt(wrap01(toTime)) - yawAt(wrap01(fromTime))) + crossings * perCycle;
  }

  applyClipByName(name: string, time: number): GLTFSceneAnimationApplyResult {
    return this.applyClip(this.requireClip(name), time);
  }

  /** Names of every clip registered on this runtime, in declaration order. */
  clipNames(): readonly string[] {
    this.assertAlive();
    return this.registeredClips.map((clip) => clip.name);
  }

  /**
   * T0.6 (PRD-06) — the C-19 `AuraResolvedClipInfo` surface that backs the
   * `prd06.animation` handle extension's `resolveAnimationClips()`: real GLB
   * clip durations (plus channel counts and the 5 cm XZ-displacement
   * root-motion candidate heuristic of T0.7) after the asset has loaded.
   */
  resolvedClipInfos(): readonly {
    readonly name: string;
    readonly duration: number;
    readonly channelCount: number;
    readonly hasRootMotionCandidate: boolean;
  }[] {
    return this.registeredClips.map((clip) => ({
      name: clip.name,
      duration: clip.duration,
      channelCount: clip.tracks.length,
      hasRootMotionCandidate: clipHasRootMotionCandidate(clip)
    }));
  }

  /**
   * Resolve a requested clip name to the best available registered clip name
   * using fuzzy matching (exact -> synonym group -> substring -> first clip).
   * Returns `undefined` when the runtime has no clips.
   */
  resolveClipName(name: string, options?: ResolveGLTFClipNameOptions): string | undefined {
    const names = this.clipNames();
    if (names.includes(name)) {
      assertUnambiguousClipName(name, this.duplicateClipNames);
      return name;
    }
    const normalized = normalizeClipToken(name);
    const exactMatches = names.filter((candidate) => normalizeClipToken(candidate) === normalized);
    if (exactMatches.length > 1) {
      throw new Error(`glTF animation clip "${name}" is ambiguous; select a clip object or use an exact unique name.`);
    }
    const resolved = resolveGLTFClipName(name, names, options);
    if (resolved !== undefined) assertUnambiguousClipName(resolved, this.duplicateClipNames);
    return resolved;
  }

  /**
   * Apply a clip selected by fuzzy name resolution. Unlike {@link applyClipByName}
   * this tolerates differing source clip names (e.g. requesting "idle" when the
   * asset only ships "Loops"). Throws only when no clips exist at all.
   */
  applyClipByNameFuzzy(name: string, time: number): GLTFSceneAnimationApplyResult {
    const resolved = this.resolveClipName(name);
    if (resolved === undefined) {
      throw new Error("glTF animation runtime has no clips to resolve.");
    }
    return this.applyClipByName(resolved, time);
  }

  applyClip(clip: AnimationClip, time: number): GLTFSceneAnimationApplyResult {
    this.assertAlive();
    if (!Number.isFinite(time) || time < 0) {
      throw new Error("glTF animation runtime time must be finite and non-negative.");
    }
    const wrappedTime = clip.duration > 0 && time > clip.duration ? time % clip.duration : Math.min(time, clip.duration);
    this.lastApply = this.applySampledTargets(clip.name, wrappedTime, sampleClipTracks(clip, wrappedTime, 1, false, (track) => this.nodeTrackSample(track)));
    return this.lastApply;
  }

  /**
   * T1.7 (PRD-06 §10) — re-implemented on the per-runtime `PoseMixer` in
   * stateless mode (`evaluateSamples` with explicit per-sample times). Node
   * translation/rotation/scale tracks bound to a scene node go through the
   * pose pipeline (incremental-weight accumulate + rest fill + additive
   * accumulators, three r185 `AnimationMixer` order); morph-weight, material
   * and light pointer tracks keep the existing accumulator path, and so do
   * node tracks aimed at nodes the binding does not cover (they keep their
   * `missingTargets` reporting). Two documented semantic changes vs the old
   * accumulator blend: partial-weight mixes fill the remainder from the rest
   * pose instead of renormalising (rest blend), and a bone covered by the
   * blend but not by a given channel resets that channel to rest (rest reset).
   */
  applyClips(samples: readonly GLTFSceneAnimationClipSample[]): GLTFSceneAnimationApplyResult {
    this.assertAlive();
    if (samples.length === 0) {
      throw new Error("glTF animation runtime blend requires at least one clip sample.");
    }
    const phaseStart = nowMs();
    let mixerMs = 0;
    let constraintsMs = 0;
    let springsMs = 0;
    const accumulators = new Map<string, TargetAccumulator>();
    const unsupportedTracks: string[] = [];
    const lightTrackIdentities = new Map<string, GLTFLightTrackIdentity>();
    const nodeTrackBindings = new Map<string, GLTFNodeTrackBinding>();
    let maxTime = 0;
    const names: string[] = [];

    const pose = this.poseRuntime();
    const poseSpecs: PoseSampleSpec[] = [];
    const touchedBones = new Set<number>();

    for (const sample of samples) {
      const clip = this.requireClip(sample.clipName);
      if (!Number.isFinite(sample.time) || sample.time < 0) {
        throw new Error("glTF animation runtime blend time must be finite and non-negative.");
      }
      const weight = sample.weight ?? 1;
      if (!Number.isFinite(weight) || weight < 0) {
        throw new Error("glTF animation runtime blend weight must be finite and non-negative.");
      }
      if (weight === 0) continue;
      const wrappedTime = clip.duration > 0 && sample.time > clip.duration ? sample.time % clip.duration : Math.min(sample.time, clip.duration);
      maxTime = Math.max(maxTime, wrappedTime);
      names.push(`${clip.name}@${Number(wrappedTime.toFixed(4))}x${Number(weight.toFixed(4))}${sample.additive ? "+add" : ""}`);

      const allowedBones = new Set<number>();
      const boneMaskDecisions = new Map<number, { allowed: AnimationTrack[]; denied: boolean }>();
      for (const track of clip.tracks) {
        const identity = getGLTFLightAnimationTrackIdentity(track);
        const publicTarget = identity?.publicTarget ?? track.target;
        const target = parseAnimationTarget(publicTarget, this.nodesByName);
        if (!target) {
          unsupportedTracks.push(publicTarget);
          continue;
        }
        if (target.kind === "node" && target.path !== "weights") {
          // Node TRS: pose path when the name binds and the mask allows it.
          const nodeTrack = this.nodeTrackSample(track)!;
          const boneIndex = nodeTrack.binding.node === undefined ? -1 : pose.nodes.indexOf(nodeTrack.binding.node);
          if (boneIndex >= 0) {
            const decision = boneMaskDecisions.get(boneIndex) ?? { allowed: [], denied: false };
            if (clipMaskAllowsNode(sample.mask, target.nodeName)) decision.allowed.push(track);
            else decision.denied = true;
            boneMaskDecisions.set(boneIndex, decision);
          } else if (boneIndex < 0) {
            // Track points at a node absent from the scene — legacy path so
            // `missingTargets` reporting is unchanged.
            nodeTrackBindings.set(nodeTrack.sampleTarget, nodeTrack.binding);
            blendInto(accumulators, nodeTrack.sampleTarget, track.valueType, track.sample(wrappedTime), weight, sample.additive === true);
          }
          continue;
        }
        const nodeTrack = target.kind === "node" ? this.nodeTrackSample(track) : undefined;
        const sampleTarget = nodeTrack?.sampleTarget ?? identity?.sampleTarget ?? track.target;
        if (nodeTrack) nodeTrackBindings.set(sampleTarget, nodeTrack.binding);
        if (identity) lightTrackIdentities.set(sampleTarget, identity);
        blendInto(accumulators, sampleTarget, track.valueType, track.sample(wrappedTime), weight, sample.additive === true);
      }
      for (const [boneIndex, decision] of boneMaskDecisions) {
        if (decision.denied && decision.allowed.length > 0) {
          for (const track of decision.allowed) {
            const sampleTarget = `\u0000gltf-mask-conflict:${boneIndex}:${track.target}`;
            nodeTrackBindings.set(sampleTarget, { publicTarget: track.target });
            blendInto(accumulators, sampleTarget, track.valueType, track.sample(wrappedTime), weight, sample.additive === true);
          }
        } else if (decision.allowed.length > 0) {
          allowedBones.add(boneIndex);
          touchedBones.add(boneIndex);
        }
      }
      if (allowedBones.size > 0) {
        let mask: Float32Array | null = null;
        if (sample.mask !== undefined) {
          mask = new Float32Array(pose.binding.boneCount);
          for (const index of allowedBones) mask[index] = 1;
        }
        poseSpecs.push({ clipName: clip.name, time: wrappedTime, weight, additive: sample.additive === true, mask });
      }
    }

    const sampledTargets = new Map<string, AnimationValue>();
    if (poseSpecs.length > 0) {
      const mixerStart = nowMs();
      pose.mixer.evaluateSamples(poseSpecs, pose.pose);
      mixerMs = nowMs() - mixerStart;
      // T3.5 — constraints apply to the freshly-mixed pose before palette
      // build; touched joints union into the emitted sampled targets. Their
      // dynamics (look-at half-life, spring substeps) integrate in wall-clock
      // seconds, so measure the real gap between applies — a hardcoded 1/60
      // makes smoothing converge ~6× too slowly in sub-60fps sessions.
      const now = nowMs();
      const constraintDt = this.lastConstraintEvalAtMs === undefined
        ? 1 / 60
        : Math.min(0.25, Math.max(1e-4, (now - this.lastConstraintEvalAtMs) / 1000));
      this.lastConstraintEvalAtMs = now;
      const constrained = this.runPoseConstraints(pose.pose, pose.binding, constraintDt);
      constraintsMs = constrained.constraintsMs;
      springsMs = constrained.springsMs;
      for (const boneIndex of constrained.touched) touchedBones.add(boneIndex);
    }
    for (const [target, accumulator] of accumulators) {
      sampledTargets.set(target, finalizeTargetBlend(accumulator));
    }

    this.lastApply = this.applySampledTargets(
      `blend:${names.join(",")}`,
      maxTime,
      { sampledTargets, unsupportedTracks, lightTrackIdentities, nodeTrackBindings },
      samples.length,
      { mixerMs, constraintsMs, springsMs, paletteBytes: this.paletteBufferBytes(), cpuMs: nowMs() - phaseStart },
      { pose: pose.pose, nodes: pose.nodes, indices: touchedBones }
    );
    return this.lastApply;
  }

  /**
   * §10 (PRD-06) — the scene-wide pose binding the pose path evaluates on.
   * Joints are every scene node in `traverse` order, resolved by node index
   * (duplicate names bind all slots); the rest pose is each node's local TRS
   * captured at bind time.
   */
  skeletons(): readonly SkeletonBinding[] {
    return [this.poseRuntime().binding];
  }

  /** §10 (PRD-06) — the per-clip compiled tracks used by the pose path. */
  compiledClips(): ReadonlyMap<string, CompiledClip> {
    return this.poseRuntime().compiled;
  }

  /** §10 (PRD-06) — the per-runtime PoseMixer `applyClips` evaluates on. */
  mixer(): PoseMixer {
    return this.poseRuntime().mixer;
  }

  /**
   * T3.8 (PRD-06 §7.2, C-19) — `actor.animation.addClipsFrom(source)` retarget-
   * bakes another skeleton's compiled clips onto this runtime's skeleton and
   * registers them by name (raw + compiled + mixer) so `play`/`playLayer`
   * resolve them like loaded clips. The bake runs in `pose/retarget.worker.ts`
   * when the platform has workers, otherwise in-process, and its output is
   * cached in IndexedDB under `(engineVersion, sourceHash, targetHash)` so a
   * rollback ignores newer caches. Returns the registered clip names.
   */
  async addClipsFrom(
    source:
      | { readonly skeleton: SkeletonBinding; readonly clips: ReadonlyMap<string, CompiledClip> }
      | Pick<GLTFSceneAnimationRuntime, "skeletons" | "compiledClips">,
    options: AddClipsFromRuntimeOptions = {}
  ): Promise<readonly string[]> {
    const pose = this.poseRuntime();
    const sourceSkeleton = "skeletons" in source ? source.skeletons()[0] : source.skeleton;
    const sourceClips = "compiledClips" in source ? source.compiledClips() : source.clips;
    if (sourceSkeleton === undefined) {
      throw new Error("addClipsFrom: source has no skeleton to retarget from.");
    }
    const bakeOptions: BakeRetargetedClipsOptions = {
      ...(options.map !== undefined ? { map: options.map } : {}),
      hipsScale: options.hipsScale ?? "leg-length",
      ...(options.fingers !== undefined ? { fingers: options.fingers } : {}),
      ...(options.retarget !== undefined ? { retarget: options.retarget } : {})
    };
    let key: string | undefined;
    let bakeSourceSkeleton = sourceSkeleton;
    let bakeTargetSkeleton = pose.binding;
    let bakeClips = sourceClips;
    let effectiveOptions = bakeOptions;
    let originalEvents: Map<string, CompiledClip["events"]> | undefined;
    if (options.cache !== false && typeof structuredClone === "function") {
      try {
        const engineVersion = options.engineVersion ?? AURA3D_RETARGET_ENGINE_VERSION;
        const sourceHash = `${retargetSkeletonHash(sourceSkeleton)}:${retargetClipsHash(sourceClips)}`;
        const targetHash = retargetSkeletonHash(pose.binding);
        const requestedKey = retargetCacheKey(engineVersion, sourceHash, targetHash, bakeOptions);
        // Do not clone joint object references: retarget baking uses the
        // captured names, index mapping and rest pose, not live scene nodes.
        const cacheSkeleton = (value: SkeletonBinding): SkeletonBinding => ({
          boneCount: value.boneCount, joints: [], jointNames: value.jointNames,
          jointNodeIndices: value.jointNodeIndices, parentIndices: value.parentIndices,
          missingNodeIndices: value.missingNodeIndices, jointIndicesByName: value.jointIndicesByName, restPose: value.restPose
        });
        const snapshot = structuredClone({
          sourceSkeleton: cacheSkeleton(sourceSkeleton), targetSkeleton: cacheSkeleton(pose.binding),
          clips: sourceClips, options: bakeOptions
        });
        const snapshotSourceHash = `${retargetSkeletonHash(snapshot.sourceSkeleton)}:${retargetClipsHash(snapshot.clips)}`;
        const snapshotKey = retargetCacheKey(engineVersion, snapshotSourceHash, retargetSkeletonHash(snapshot.targetSkeleton), snapshot.options);
        if (snapshotKey !== requestedKey) throw new Error("Retarget inputs changed during cache snapshot.");
        originalEvents = new Map([...sourceClips].map(([name, clip]) => [name, clip.events?.map((event) => ({ ...event }))]));
        bakeSourceSkeleton = snapshot.sourceSkeleton;
        bakeTargetSkeleton = snapshot.targetSkeleton;
        bakeClips = snapshot.clips;
        effectiveOptions = snapshot.options;
        key = snapshotKey;
      } catch {
        // A payload or option that cannot be represented safely must not reuse
        // another bake. The actual retarget still runs with the original data.
      }
    }
    let baked = key === undefined ? undefined : await readRetargetCache(key);
    this.assertPoseGeneration(pose);
    if (baked === undefined) {
      const worker = options.worker === false ? undefined : createRetargetWorker();
      const bakeInProcess = () => bakeRetargetedClipMap({ skeleton: bakeSourceSkeleton, clips: bakeClips }, bakeTargetSkeleton, effectiveOptions);
      if (worker === undefined) {
        baked = bakeInProcess();
      } else {
        // A host that cannot serve the worker module (a dev server, a locked-down CSP) reports it
        // through `onerror` after construction succeeded. The bake is pure, so retry it in-process
        // rather than failing the caller's whole retarget.
        baked = await bakeClipsInWorker(worker, {
          sourceSkeleton: bakeSourceSkeleton,
          targetSkeleton: bakeTargetSkeleton,
          clips: bakeClips,
          options: effectiveOptions
        }).catch(bakeInProcess);
      }
      this.assertPoseGeneration(pose);
      if (key !== undefined) {
        // The runtime exposes marker payloads below; isolate the pending write
        // so a caller mutation cannot poison an already-computed cache key.
        try { void writeRetargetCache(key, structuredClone(baked)); } catch { /* best-effort cache */ }
      }
    }
    const names: string[] = [];
    for (const name of baked.keys()) assertUnambiguousClipName(name, this.duplicateClipNames);
    for (const [name, cached] of baked) {
      const events = originalEvents?.get(name);
      const compiled = events === undefined ? cached : { ...cached, events };
      const raw = decompileCompiledClip(name, compiled);
      for (const track of raw.tracks) this.retargetedTracks.add(track);
      const previous = this.registeredClips.findIndex((clip) => clip.name === name);
      if (previous < 0) this.registeredClips.push(raw);
      else this.registeredClips[previous] = raw;
      this.clipsByName.set(name, raw);
      pose.compiled.set(name, compiled);
      pose.mixer.addCompiledClip(name, compiled, raw);
      names.push(name);
    }
    return names;
  }

  /**
   * T1.9 (PRD-06 §10) — advance the per-runtime `PoseMixer` by `dt` seconds
   * and write the evaluated pose to scene nodes in `applySampledTargets`
   * order. `restPoseReset !== false` writes every bound bone (rest-filled
   * channels reset); `false` writes only the bones covered by active actions'
   * bound tracks, so uncovered bones keep their current scene values.
   * Non-pose tracks (morph weights, material/light pointer, node tracks
   * aimed at nodes outside the binding) keep the legacy accumulator path,
   * sampled at each active action's own clock and effective weight.
   */
  applyPoseMixer(dt: number, options?: { readonly label?: string; readonly restPoseReset?: boolean }): GLTFSceneAnimationApplyResult {
    const phaseStart = nowMs();
    const pose = this.poseRuntime();
    const mixerStart = nowMs();
    pose.mixer.update(dt);
    pose.mixer.evaluate(pose.pose);
    const mixerMs = nowMs() - mixerStart;
    // T3.5 — constraints evaluate post-mixer / pre-palette; their touched
    // bones union into `covered` so the write-back emits them.
    this.lastConstraintEvalAtMs = nowMs();
    const constrained = this.runPoseConstraints(pose.pose, pose.binding, dt);
    const constraintsMs = constrained.constraintsMs;
    const springsMs = constrained.springsMs;

    const actions = pose.mixer.activeActions();
    let covered: ReadonlySet<number> | undefined;
    const hasUnresolvedNodeTrack = actions.some((action) => {
      const source = pose.mixer.sourceClip(action.clipName) ?? this.clipsByName.get(action.clipName);
      return source?.tracks.some((track) => {
        const target = parseAnimationTarget(track.target, this.nodesByName);
        return target?.kind === "node" && target.path !== "weights" && !this.animationNodeForTrack(track);
      }) === true;
    });
    if (options?.restPoseReset === false || hasUnresolvedNodeTrack || this.ambiguousActorScope) {
      const set = new Set<number>();
      for (const action of actions) {
        const source = pose.mixer.sourceClip(action.clipName) ?? this.clipsByName.get(action.clipName);
        for (const binding of action.bindings) {
          const track = source?.tracks[binding.trackIndex];
          const node = pose.nodes[binding.boneIndex];
          if (track && node && this.animationNodeForTrack(track) === node) set.add(binding.boneIndex);
        }
      }
      for (const boneIndex of constrained.touched) {
        const node = pose.nodes[boneIndex];
        const scope = node && this.nodeScopes.get(node);
        if (node && scope && this.nodeBelongsToScope(node, scope)) set.add(boneIndex);
      }
      covered = set;
    }
    // `covered === undefined` already emits every bound bone below — the
    // constraint union matters only on the covered path.

    const sampledTargets = new Map<string, AnimationValue>();
    // Legacy accumulator path for every track the pose binding does not
    // cover — sampled at each action's clock and effective weight, in active
    // action order (same semantics as `applyClips`' per-sample partition).
    const accumulators = new Map<string, TargetAccumulator>();
    const unsupportedTracks: string[] = [];
    const lightTrackIdentities = new Map<string, GLTFLightTrackIdentity>();
    const nodeTrackBindings = new Map<string, GLTFNodeTrackBinding>();
    for (const action of actions) {
      const source = pose.mixer.sourceClip(action.clipName) ?? this.clipsByName.get(action.clipName);
      if (source === undefined) continue;
      for (const track of source.tracks) {
        const identity = getGLTFLightAnimationTrackIdentity(track);
        const publicTarget = identity?.publicTarget ?? track.target;
        const target = parseAnimationTarget(publicTarget, this.nodesByName);
        if (target === undefined) {
          unsupportedTracks.push(publicTarget);
          continue;
        }
        if (target.kind === "node" && target.path !== "weights") {
          if (this.animationNodeForTrack(track)) continue; // bound → mixer path
        }
        const nodeTrack = target.kind === "node" ? this.nodeTrackSample(track) : undefined;
        const sampleTarget = nodeTrack?.sampleTarget ?? identity?.sampleTarget ?? track.target;
        if (nodeTrack) nodeTrackBindings.set(sampleTarget, nodeTrack.binding);
        if (identity) lightTrackIdentities.set(sampleTarget, identity);
        blendInto(accumulators, sampleTarget, track.valueType, track.sample(action.time), action.effectiveWeight, action.additive);
      }
    }
    for (const [target, accumulator] of accumulators) {
      sampledTargets.set(target, finalizeTargetBlend(accumulator));
    }

    const active = actions.filter((action) => action.effectiveWeight > 0);
    this.lastApply = this.applySampledTargets(
      `mixer:${options?.label ?? (actions.map((action) => action.clipName).join("+") || "idle")}`,
      active[0]?.time ?? 0,
      { sampledTargets, unsupportedTracks, lightTrackIdentities, nodeTrackBindings },
      actions.length > 0 ? actions.length : undefined,
      { mixerMs, constraintsMs, springsMs, paletteBytes: this.paletteBufferBytes(), cpuMs: nowMs() - phaseStart },
      { pose: pose.pose, nodes: pose.nodes, indices: covered ?? pose.binding.jointNodeIndices }
    );
    return this.lastApply;
  }

  /**
   * T1.10 (PRD-06 §10, C-19 `blendMode: "additive"`/`additiveReference`) — lazily
   * compile an additive variant of `clipName` via `makeClipAdditive` (reference
   * defaults to the clip's own first frame) and register it on the mixer under
   * a synthesized name. Returns the registered clip key for `clipAction`/`playLayer`.
   */
  ensureAdditiveClip(clipName: string, reference?: { readonly clip?: string; readonly time?: number }): string {
    assertUnambiguousClipName(clipName, this.duplicateClipNames);
    if (reference?.clip !== undefined) assertUnambiguousClipName(reference.clip, this.duplicateClipNames);
    const pose = this.poseRuntime();
    const source = this.clipsByName.get(clipName);
    if (source === undefined) {
      return clipName;
    }
    const referenceClip = reference?.clip === undefined ? undefined : this.clipsByName.get(reference.clip);
    const referenceTime = reference?.time ?? 0;
    const name = `${clipName}#additive:${reference?.clip ?? "self"}:${referenceTime}`;
    if (!pose.compiled.has(name)) {
      const additive = makeClipAdditive(source, referenceClip === undefined ? referenceTime : { clip: referenceClip, time: referenceTime });
      for (let index = 0; index < additive.tracks.length; index += 1) {
        const generated = additive.tracks[index];
        const original = source.tracks[index];
        if (generated && original) this.trackSourceOverrides.set(generated, original);
      }
      const compiledClip = compileClip(additive);
      pose.compiled.set(name, compiledClip);
      pose.mixer.addCompiledClip(name, compiledClip, additive);
    }
    return name;
  }

  /**
   * T1.10 (C-19 `animation.mask`) — bind-order joint names for `createBoneMask`.
   */
  skeletonJointNames(): readonly string[] {
    return this.poseRuntime().binding.jointNames;
  }

  /**
   * T3.5 — register a pose constraint. Entries evaluate in insertion order
   * after each mixer write; returns a disposer that removes exactly this
   * constraint (by identity — a duplicate spec stays).
   */
  addPoseConstraint(constraint: GLTFPoseConstraint): () => void {
    const state = this.poseRuntime();
    state.constraints.push(constraint);
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      const index = state.constraints.indexOf(constraint);
      if (index >= 0) state.constraints.splice(index, 1);
    };
  }

  /** T3.5 — drop every pose constraint (constant-time identity sweep). */
  clearPoseConstraints(): void {
    if (this.poseState === undefined) return;
    this.poseState.constraints.length = 0;
  }

  /** T3.5 — the count of live pose constraints (diagnostics/tests). */
  poseConstraintCount(): number {
    return this.poseState?.constraints.length ?? 0;
  }

  /** T3.5 — install the world→model matrix provider (actor extension). */
  setPoseConstraintModelMatrix(provider: (() => readonly number[] | Float32Array) | undefined): void {
    this.poseConstraintModelMatrix = provider;
  }

  /**
   * T3.5 — evaluate the constraint list in order onto the just-mixed pose and
   * return the union of touched joint indices (empty when no constraints),
   * plus the §9.8 wall-clock split between `"springs"`-tagged constraints and
   * the rest.
   */
  private runPoseConstraints(pose: PoseBuffer, binding: SkeletonBinding, dt: number): { readonly touched: Set<number>; readonly constraintsMs: number; readonly springsMs: number } {
    const touched = new Set<number>();
    const constraints = this.poseState?.constraints;
    let constraintsMs = 0;
    let springsMs = 0;
    if (constraints === undefined || constraints.length === 0) return { touched, constraintsMs, springsMs };
    const modelMatrix = this.poseConstraintModelMatrix?.() ?? this.options.scene.root.transform.worldMatrix;
    for (const constraint of constraints) {
      const start = nowMs();
      constraint.evaluate(pose, binding, modelMatrix, { dt });
      const elapsed = nowMs() - start;
      if (constraint.kind === "springs") springsMs += elapsed;
      else constraintsMs += elapsed;
      for (const bone of constraint.bones) touched.add(bone);
    }
    return { touched, constraintsMs, springsMs };
  }

  /** §9.8/§13 — CPU-side palette payload this runtime owns, bytes (16 f32/joint). */
  private paletteBufferBytes(): number {
    let bytes = 0;
    for (const binding of this.skinningBindings) bytes += binding.skin.joints.length * 16 * 4;
    return bytes;
  }

  private poseRuntime(): { readonly binding: SkeletonBinding; readonly nodes: readonly SceneNode[]; readonly mixer: PoseMixer; readonly compiled: Map<string, CompiledClip>; readonly pose: PoseBuffer; constraints: GLTFPoseConstraint[] } {
    this.assertAlive();
    if (this.poseState === undefined) {
      const nodes = [...this.nodeOrdinals.keys()].filter((node) => {
        const scope = this.nodeScopes.get(node);
        return scope !== undefined && this.nodeBelongsToScope(node, scope);
      });
      const indexByNode = new Map<SceneNode, number>(nodes.map((node, index) => [node, index]));
      const binding = bindSkeleton({
        joints: nodes.map((_, index) => index),
        resolveNode: (index) => {
          const node = nodes[index];
          if (node === undefined) return undefined;
          return { name: node.name, position: node.transform.position, rotation: node.transform.rotation, scale: node.transform.scale };
        },
        jointNames: nodes.map((node) => node.name),
        parentIndices: nodes.map((node) => (node.parent === null ? -1 : indexByNode.get(node.parent) ?? -1))
      });
      const names = new Map(binding.jointIndicesByName);
      for (const [name, indices] of names) {
        if (indices.length !== 1 || this.ambiguousActorScope) names.delete(name);
      }
      const mixer = new RuntimePoseMixer({ ...binding, jointIndicesByName: names }, nodes, this.nodesByName, (track) => this.animationNodeForTrack(track), this.duplicateClipNames);
      const compiled = new Map<string, CompiledClip>();
      for (const [name, clip] of this.clipsByName) {
        const compiledClip = compileClip(clip);
        compiled.set(name, compiledClip);
        mixer.addCompiledClip(name, compiledClip, clip);
      }
      this.poseState = { binding, nodes, mixer, compiled, pose: createPoseBuffer(binding.boneCount), constraints: [] };
    }
    return this.poseState;
  }

  applyAnimationValues(
    label: string,
    time: number,
    values: ReadonlyMap<string, AnimationValue>,
    unsupportedTracks: readonly string[] = [],
    lightBindings?: Pick<GLTFSampledAnimationTargets, "lightTrackIdentities" | "ambiguousLightTargets" | "nodeTrackBindings">
  ): GLTFSceneAnimationApplyResult {
    this.assertAlive();
    if (label.trim().length === 0) {
      throw new Error("glTF animation runtime value application label cannot be empty.");
    }
    if (!Number.isFinite(time) || time < 0) {
      throw new Error("glTF animation runtime value application time must be finite and non-negative.");
    }
    this.lastApply = this.applySampledTargets(label, time, {
      sampledTargets: values,
      unsupportedTracks,
      ...lightBindings
    });
    return this.lastApply;
  }

  /**
   * §16 S3 (PRD-06) — teardown frees the C-18 palette textures this runtime
   * stamped, keyed on each skin binding (`skinningPaletteCache.release`).
   * Morph array textures and CPU-morph scratch are released by the actor's
   * own teardown (`prd06.animation` extension dispose / pipeline lifecycle),
   * which is the layer that can see resolved `Geometry` objects — the scene
   * layer here only knows geometry handles.
   */
  dispose(): void {
    if (this.disposed) return;
    this.poseState?.mixer.dispose();
    this.poseState = undefined;
    for (const binding of this.skinningBindings) {
      skinningPaletteCache.release(binding.paletteView?.paletteKey ?? binding);
    }
    this.clipsByName.clear();
    this.registeredClips.length = 0;
    this.duplicateClipNames.clear();
    this.nodesByName.clear();
    this.nodesByIndex.clear();
    this.nodeOrdinals.clear();
    this.nodeScopes.clear();
    this.trackNodeCache = new WeakMap();
    this.morphRenderablesByNode.clear();
    this.blockedMorphNodes.clear();
    this.morphRenderablesByNodeName.clear();
    this.skinningBindings.length = 0;
    this.skinningBindingIssues.length = 0;
    this.footBindMatrices.clear();
    this.footOrientationLocks.clear();
    this.footDescendantLocks.clear();
    this.footSurfaceVertices.clear();
    this.hasNodeIdentity = false;
    this.footPlanting = undefined;
    this.footRig = undefined;
    this.lastApply = undefined;
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("glTF animation runtime has been disposed.");
  }

  private assertPoseGeneration(pose: { readonly mixer: PoseMixer }): void {
    this.assertAlive();
    if (this.poseState !== pose) throw new Error("glTF animation runtime scene was reindexed during retargeting.");
  }

  /**
   * Render-time bridge: drive the loaded GLB from an externally-computed pose whose keys are GLB
   * **node names** (e.g. the output of `@aura3d/animation`'s `retargetHumanoidPose`, whose
   * `bones` keys are the target rig node names). Each bone transform's `position`/`rotation`/`scale`
   * is written onto the matching scene node's local transform, and each `morphTargets` entry sets
   * that node's morph weight. This reuses the same {@link applyAnimationValues} / track-binding path
   * as embedded clips (targets are emitted as `"<node>.translation|rotation|scale|weights"`), so
   * skinning palettes and missing-target reporting behave identically. Additive to `applyClip*` —
   * it does not touch the mixer or clip registry.
   */
  applyPose(pose: GLTFScenePose, label = "retargeted-pose", time = 0): GLTFSceneAnimationApplyResult {
    if (!pose || typeof pose !== "object" || typeof pose.bones !== "object" || pose.bones === null) {
      throw new Error("glTF animation runtime applyPose requires a pose with a bones record.");
    }
    const values = new Map<string, AnimationValue>();
    for (const [nodeName, transform] of Object.entries(pose.bones)) {
      if (!transform) continue;
      if (transform.position !== undefined) {
        values.set(`${nodeName}.translation`, toVec3Tuple(transform.position, `${nodeName}.translation`));
      }
      if (transform.rotation !== undefined) {
        values.set(`${nodeName}.rotation`, toQuatTuple(transform.rotation, `${nodeName}.rotation`));
      }
      if (transform.scale !== undefined) {
        values.set(`${nodeName}.scale`, toVec3Tuple(transform.scale, `${nodeName}.scale`));
      }
    }
    if (pose.morphTargets) {
      for (const [nodeName, weight] of Object.entries(pose.morphTargets)) {
        if (!Number.isFinite(weight)) {
          throw new Error(`glTF animation runtime applyPose morph weight for "${nodeName}" must be finite.`);
        }
        values.set(`${nodeName}.weights`, [weight]);
      }
    }
    return this.applyAnimationValues(label, time, values);
  }

  solveImportedSkeletonTwoBoneIK(options: GLTFImportedSkeletonIKOptions): GLTFImportedSkeletonIKResult {
    if (!this.options.asset || this.options.asset.skins.length === 0) {
      throw new Error("glTF imported skeleton IK requires an asset with at least one skin.");
    }
    const skin = resolveIKSkin(this.options.asset.skins, options.skinName);
    const slots = options.jointIndices
      ? options.jointIndices.map((index) => {
        const matches = skin.joints.flatMap((candidate, slot) => candidate === index ? [slot] : []);
        return matches.length === 1 ? matches[0]! : -1;
      })
      : options.jointNames
        ? options.jointNames.map((name) => {
          const matches = skin.jointNames.flatMap((candidate, index) => candidate === name ? [index] : []);
          return matches.length === 1 ? matches[0]! : -1;
        })
        : [0, 1, 2];
    const validSlots = slots.length === 3 && new Set(slots).size === 3 && slots.every((slot) => slot >= 0 && slot < skin.joints.length)
      && (!options.jointNames || slots.every((slot, index) => skin.jointNames[slot] === options.jointNames![index]));
    const jointNames = options.jointNames ?? (validSlots
      ? slots.map((slot) => skin.jointNames[slot] ?? `#${skin.joints[slot]}`) as unknown as readonly [string, string, string]
      : firstTwoBoneJointChain(skin));
    const [rootName, midName, endName] = jointNames;
    this.options.scene.updateWorldTransforms();
    const scopes = new Set(this.skinningBindings.filter((binding) => binding.skin === skin && this.skinningBindingIsCurrent(binding)).map((binding) => binding.scope));
    if (scopes.size === 0) {
      for (const scope of new Set(this.nodeScopes.values())) {
        const hasJoint = validSlots && slots.some((slot) => scope.hasNodeIdentity
          ? scope.nodesByIndex.has(skin.joints[slot]!)
          : scope.nodesByName.has(skin.jointNames[slot]!));
        const candidate = scope.nodesByIndex.values().next().value?.[0] ?? scope.nodesByName.values().next().value?.[0];
        if (hasJoint && candidate && this.nodeBelongsToScope(candidate, scope)) scopes.add(scope);
      }
    }
    const scope = !this.ambiguousActorScope && scopes.size === 1 ? [...scopes][0] : undefined;
    const resolveJoint = (slot: number): SceneNode | undefined => {
      if (!validSlots || !scope) return undefined;
      const candidates = scope.hasNodeIdentity
        ? scope.nodesByIndex.get(skin.joints[slot]!)
        : scope.nodesByName.get(skin.jointNames[slot]!);
      const node = candidates?.length === 1 ? candidates[0] : undefined;
      return node && this.nodeBelongsToScope(node, scope)
        && (!scope.hasNodeIdentity || node.userData.gltfNodeIndex === skin.joints[slot]) ? node : undefined;
    };
    const rootNode = resolveJoint(slots[0]!);
    const midNode = resolveJoint(slots[1]!);
    const endNode = resolveJoint(slots[2]!);
    const missingTargets = [
      ...(!rootNode ? [`${skin.name}.${rootName}`] : []),
      ...(!midNode ? [`${skin.name}.${midName}`] : []),
      ...(!endNode ? [`${skin.name}.${endName}`] : [])
    ];
    const invalidChain = rootNode && midNode && endNode
      && (!rootNode.isAncestorOf(midNode) || !midNode.isAncestorOf(endNode));
    if (invalidChain) missingTargets.push(`${skin.name}.invalid-chain`);
    if (!rootNode || !midNode || !endNode || invalidChain) {
      return {
        skinName: skin.name,
        jointNames,
        solution: solveTwoBoneIk({
          root: [0, 0, 0],
          mid: [0, 1, 0],
          end: [0, 2, 0],
          target: [0, 2, 0.01],
          allowStretch: true
        }),
        applied: false,
        skinningPalettesUpdated: 0,
        missingTargets
      };
    }

    const solution = solveTwoBoneIk({
      root: worldPosition(rootNode),
      mid: worldPosition(midNode),
      end: worldPosition(endNode),
      target: options.target,
      ...(options.pole ? { pole: options.pole } : {}),
      ...(options.weight !== undefined ? { weight: options.weight } : {}),
      ...(options.allowStretch !== undefined ? { allowStretch: options.allowStretch } : {})
    });
    if (options.apply === false) {
      return {
        skinName: skin.name,
        jointNames,
        solution,
        applied: false,
        skinningPalettesUpdated: 0,
        missingTargets: []
      };
    }

    setWorldPosition(midNode, solution.mid);
    this.options.scene.updateWorldTransforms();
    setWorldPosition(endNode, solution.end);
    this.options.scene.updateWorldTransforms();
    const skinning = this.refreshSkinningPalettes();
    return {
      skinName: skin.name,
      jointNames,
      solution,
      applied: true,
      skinningPalettesUpdated: skinning.updated,
      missingTargets: skinning.missingTargets
    };
  }

  createTwoBoneIKController(options: GLTFImportedSkeletonIKControllerOptions): GLTFImportedSkeletonIKController {
    return new GLTFImportedSkeletonIKController(this, {
      ...(options.skinName === undefined ? {} : { skinName: options.skinName }),
      ...(options.jointNames === undefined ? {} : { jointNames: options.jointNames }),
      ...(options.jointIndices === undefined ? {} : { jointIndices: options.jointIndices })
    }, {
      target: options.target,
      ...(options.pole === undefined ? {} : { pole: options.pole }),
      ...(options.weight === undefined ? {} : { weight: options.weight }),
      ...(options.allowStretch === undefined ? {} : { allowStretch: options.allowStretch }),
      ...(options.apply === undefined ? {} : { apply: options.apply })
    });
  }

  createCloneSampler(): GLTFSceneAnimationCloneSampler {
    return new GLTFSceneAnimationCloneSampler(this);
  }

  createMorphTargetController(options: GLTFSceneMorphTargetControllerOptions): GLTFSceneMorphTargetController {
    return new GLTFSceneMorphTargetController(this, options);
  }

  snapshot(): GLTFSceneAnimationRuntimeSnapshot {
    this.assertAlive();
    return {
      clipCount: this.registeredClips.length,
      nodeTargetCount: this.nodesByName.size,
      morphTargetNodeCount: this.morphRenderablesByNodeName.size,
      skinningBindingCount: this.skinningBindings.length,
      clips: this.registeredClips.map((clip) => clip.name),
      ...(this.lastApply ? { lastApply: this.lastApply } : {})
    };
  }

  inspectClipBindings(name?: string): readonly GLTFSceneAnimationClipBindingDiagnostics[] {
    this.assertAlive();
    if (name !== undefined) {
      return [this.inspectClipBinding(this.requireClip(name))];
    }
    return this.registeredClips.map((clip) => this.inspectClipBinding(clip));
  }

  /**
   * Inspect one exact track without conflating same-named channels. Missing
   * external material sinks and unproven scene omissions have unknown
   * permanence. Only a loader's complete selected-scene snapshot proves that
   * a node/light source is absent rather than merely not attached yet.
   */
  inspectTrackBinding(track: AnimationTrack): GLTFSceneAnimationTrackBindingDiagnostics {
    this.assertAlive();
    const lightIdentity = getGLTFLightAnimationTrackIdentity(track);
    const publicTarget = lightIdentity?.publicTarget ?? track.target;
    const result = (status: GLTFSceneAnimationBindingAvailability["status"], reason?: string): GLTFSceneAnimationTrackBindingDiagnostics => ({
      track, target: publicTarget, status, ...(reason ? { reason } : {})
    });
    const target = parseAnimationTarget(publicTarget, this.nodesByName);
    if (!target) return result("unavailable", "unsupported-track");
    if (target.kind === "material") {
      const parameters = materialParametersForLeaf(target.leaf);
      const transform = textureTransformLeaf(target.leaf);
      if (!parameters || (isGuardedMaterialScalarLeaf(target.leaf) && track.valueType !== "scalar")
        || (transform && (transform.component === "rotation"
          ? track.valueType !== "scalar"
          : track.valueType !== "number-array" || track.valueSize !== 2))) {
        return result("unavailable", "unsupported-track");
      }
      const binding = this.materialTrackBinding(target.materialName, target.leaf);
      const sink = this.options.resolveAnimationMaterial?.(target.materialName);
      const availability = sink?.animationParameterAvailability?.(parameters[0]!);
      if (availability && availability.status !== "available") {
        return result(availability.status, availability.reason ?? (binding.status === "available" ? undefined : binding.status));
      }
      if (binding.status !== "available") return result("unknown", binding.status);
      return result("available");
    }
    if (target.kind === "light") {
      const lights = this.lightTrackTargets(target.lightName, lightIdentity, target.indexed === true);
      if (lights.length > 0 && lights.every((light) => lightSupportsLeaf(light, lightIdentity?.leaf ?? target.leaf))) {
        return result("available");
      }
      const inSourceScene = this.options.asset?.sceneIncludesTrackTarget?.(this.options.scene, track);
      return result(inSourceScene === false ? "unavailable" : "unknown", "missing-light");
    }
    const node = this.animationNodeForTrack(track);
    if (!node) {
      // An overridden lookup may deliberately address a different source node.
      const inSourceScene = this.options.nodeIndexForTrack !== undefined
        && this.options.nodeIndexForTrack !== this.options.asset?.nodeIndexForTrack
        ? undefined : this.options.asset?.sceneIncludesTrackTarget?.(this.options.scene, track);
      return result(inSourceScene === false ? "unavailable" : "unknown", "missing-node");
    }
    if (target.path === "weights") {
      const renderables = !this.blockedMorphNodes.has(node) ? this.morphRenderablesByNode.get(node) ?? [] : [];
      // A resource provider may attach/rebuild morph renderables later. No
      // completion signal currently distinguishes that from a permanent loss.
      if (renderables.length === 0) return result("unknown", "missing-morph");
    }
    return result("available");
  }

  reindexScene(): void {
    this.assertAlive();
    const allNodes: SceneNode[] = [];
    this.options.scene.traverse((node) => allNodes.push(node));
    if (this.options.actorRoot && !allNodes.includes(this.options.actorRoot)) {
      throw new Error("glTF animation actorRoot must be attached to the runtime scene.");
    }
    this.poseState?.mixer.dispose();
    for (const binding of this.skinningBindings) {
      skinningPaletteCache.release(binding.paletteView?.paletteKey ?? binding);
    }
    this.poseState = undefined;
    this.lastConstraintEvalAtMs = undefined;
    this.options.scene.updateWorldTransforms();
    this.footBindMatrices.clear();
    this.footOrientationLocks.clear();
    this.footDescendantLocks.clear();
    this.nodesByName.clear();
    this.nodesByIndex.clear();
    this.nodeOrdinals.clear();
    this.nodeScopes.clear();
    this.hasNodeIdentity = false;
    this.trackNodeCache = new WeakMap();
    this.morphRenderablesByNode.clear();
    this.blockedMorphNodes.clear();
    this.morphRenderablesByNodeName.clear();
    this.skinningBindings.length = 0;
    this.skinningBindingIssues.length = 0;
    this.footSurfaceVertices.clear();
    const root = this.options.actorRoot ?? this.options.scene.root;
    const scopedNodes: SceneNode[] = [];
    root.traverse((node) => scopedNodes.push(node));
    const selected = new Set(scopedNodes);
    this.ambiguousActorScope = scopedNodes.filter((node) => node.userData.gltfSceneContainer === true).length > 1;
    const renderableCounts = new Map<Renderable, number>();
    const blockedRenderables = new Set<SceneNode>();
    for (const node of allNodes) {
      const renderable = node.renderable;
      if (renderable && ((this.options.asset && this.options.asset.skins.length > 0 && renderable.skinning) || renderable.morphWeights.length > 0)) {
        renderableCounts.set(renderable, (renderableCounts.get(renderable) ?? 0) + 1);
      }
    }
    for (const node of scopedNodes) {
      const renderable = node.renderable;
      if (!renderable || !renderableCounts.has(renderable)) continue;
      const assetId = this.options.asset?.gltfAssetId;
      if (assetId !== undefined && gltfSceneContainerFor(node)?.userData.gltfAssetId !== assetId) continue;
      const owners = animatedRenderableOwners.get(renderable);
      let otherOwner = false;
      for (const reference of owners ?? []) {
        const owner = reference.deref();
        if (!owner || owner.renderable !== renderable) owners!.delete(reference);
        else if (owner !== node) otherOwner = true;
      }
      if ((renderableCounts.get(renderable) ?? 0) > 1 || otherOwner) {
        if (Object.getPrototypeOf(renderable) !== Renderable.prototype) {
          blockedRenderables.add(node);
          continue;
        }
        node.renderable = Object.assign(Object.create(Object.getPrototypeOf(renderable)) as Renderable, renderable, {
          ...(renderable.skinning ? { skinning: { jointCount: renderable.skinning.jointCount, matrices: new Float32Array(renderable.skinning.matrices) } } : {}),
          morphWeights: [...renderable.morphWeights]
        });
      }
      const owned = node.renderable!;
      const scopedOwners = animatedRenderableOwners.get(owned) ?? new Set<WeakRef<SceneNode>>();
      if (![...scopedOwners].some((reference) => reference.deref() === node)) scopedOwners.add(new WeakRef(node));
      animatedRenderableOwners.set(owned, scopedOwners);
    }
    for (const node of scopedNodes) {
      this.nodeOrdinals.set(node, this.nodeOrdinals.size);
      this.footBindMatrices.set(node.id, { world: [...node.transform.worldMatrix] as Mat4, local: [...node.transform.localMatrix] as Mat4 });
      const nodes = this.nodesByName.get(node.name) ?? [];
      nodes.push(node);
      this.nodesByName.set(node.name, nodes);
      const parentScope = node.parent ? this.nodeScopes.get(node.parent) : undefined;
      const scope = node.userData.gltfSceneContainer === true || !parentScope
        ? {
          nodesByIndex: new Map<number, SceneNode[]>(),
          nodesByName: new Map<string, SceneNode[]>(),
          container: gltfSceneContainerFor(node),
          hasNodeIdentity: false
        }
        : parentScope;
      this.nodeScopes.set(node, scope);
      const named = scope.nodesByName.get(node.name) ?? [];
      named.push(node);
      scope.nodesByName.set(node.name, named);
      if (Object.prototype.hasOwnProperty.call(node.userData, "gltfNodeIndex")) {
        scope.hasNodeIdentity = true;
        this.hasNodeIdentity = true;
        const nodeIndex = node.userData.gltfNodeIndex;
        if (typeof nodeIndex === "number" && Number.isSafeInteger(nodeIndex) && nodeIndex >= 0) {
          const indexed = scope.nodesByIndex.get(nodeIndex) ?? [];
          indexed.push(node);
          scope.nodesByIndex.set(nodeIndex, indexed);
          const globallyIndexed = this.nodesByIndex.get(nodeIndex) ?? [];
          globallyIndexed.push(node);
          this.nodesByIndex.set(nodeIndex, globallyIndexed);
        }
      }
    }
    const renderables = this.options.scene.collectRenderables().filter(({ node }) => selected.has(node));
    for (const { node, renderable } of renderables) {
      if (renderable.morphWeights.length === 0) continue;
      if (blockedRenderables.has(node)) {
        this.blockedMorphNodes.add(node);
        if (node.parent && selected.has(node.parent)) this.blockedMorphNodes.add(node.parent);
        continue;
      }
      for (const owner of [node, node.parent]) {
        if (!owner || !selected.has(owner)) continue;
        const owned = this.morphRenderablesByNode.get(owner) ?? [];
        owned.push(renderable);
        this.morphRenderablesByNode.set(owner, owned);
      }
      for (const nodeName of new Set([node.name, node.parent?.name].filter((name): name is string => typeof name === "string" && name.length > 0))) {
        const renderables = this.morphRenderablesByNodeName.get(nodeName) ?? [];
        renderables.push(renderable);
        this.morphRenderablesByNodeName.set(nodeName, renderables);
      }
    }
    if (this.options.asset) {
      const asset = this.options.asset;
      const meshesByName = new Map<string, GLTFMeshAsset[]>();
      const meshesBySource = new Map<string, GLTFMeshAsset[]>();
      for (const mesh of asset.meshes) {
        const matches = meshesByName.get(mesh.name) ?? [];
        matches.push(mesh);
        meshesByName.set(mesh.name, matches);
        const key = `${mesh.sourceMeshIndex}:${mesh.primitiveIndex}`;
        const sourceMatches = meshesBySource.get(key) ?? [];
        sourceMatches.push(mesh);
        meshesBySource.set(key, sourceMatches);
      }
      // A source primitive may appear only once under a particular authored
      // mesh node. Count before binding so duplicates fail closed on both sides.
      const primitiveCounts = new Map<SceneNode, Map<string, number>>();
      for (const { node, renderable } of renderables) {
        const provenance = renderable.skinning && readSkinBindingProvenance(node.userData.gltfSkinBinding);
        if (!provenance) continue;
        const owner = node.userData.gltfNodeIndex === provenance.nodeIndex ? node : node.parent;
        if (!owner || owner.userData.gltfNodeIndex !== provenance.nodeIndex) continue;
        const counts = primitiveCounts.get(owner) ?? new Map<string, number>();
        const key = `${provenance.meshIndex}:${provenance.primitiveIndex}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        primitiveCounts.set(owner, counts);
      }
      for (const { node, renderable } of renderables) {
        if (!renderable.skinning) continue;
        const scope = this.nodeScopes.get(node);
        if (blockedRenderables.has(node) || !scope || !this.nodeBelongsToScope(node, scope)) {
          this.skinningBindingIssues.push(`${node.name}.skinning`);
          continue;
        }
        let mesh: GLTFMeshAsset | undefined;
        let skin: GLTFSkinAsset | undefined;
        let source: RuntimeSkinningBinding["source"];
        const hasProvenance = Object.prototype.hasOwnProperty.call(node.userData, "gltfSkinBinding");
        const requiresProvenance = hasProvenance || asset.gltfAssetId !== undefined
          || asset.skinBindingForNode !== undefined || scope.container?.userData.gltfAssetId !== undefined;
        if (requiresProvenance) {
          const provenance = readSkinBindingProvenance(node.userData.gltfSkinBinding);
          const canonical = provenance && asset.skinBindingForNode?.(provenance.nodeIndex);
          const owners = provenance && scope.nodesByIndex.get(provenance.nodeIndex);
          const owner = owners?.length === 1 ? owners[0] : undefined;
          const key = provenance && `${provenance.meshIndex}:${provenance.primitiveIndex}`;
          const candidates = key && meshesBySource.get(key);
          const candidate = candidates && candidates.length === 1 ? candidates[0] : undefined;
          if (provenance && owner && candidate && key && asset.gltfAssetId === provenance.assetId
            && scope.container?.userData.gltfAssetId === provenance.assetId
            && canonical?.meshIndex === provenance.meshIndex && canonical.skinIndex === provenance.skinIndex
            && this.nodeBelongsToScope(owner, scope)
            && (owner === node || (node.parent === owner && !Object.prototype.hasOwnProperty.call(node.userData, "gltfNodeIndex")))
            && primitiveCounts.get(owner)?.get(key) === 1
            && candidate.name === renderable.geometry) {
            mesh = candidate;
            skin = asset.skins[provenance.skinIndex];
            source = { owner, provenance };
          }
        } else {
          // Compatibility for older structural assets/scenes without any
          // loader provenance. Never downgrade a provenance-bearing scene.
          const meshes = meshesByName.get(renderable.geometry);
          mesh = meshes?.length === 1 ? meshes[0] : undefined;
          skin = mesh?.skinIndex === undefined ? undefined : asset.skins[mesh.skinIndex];
        }
        if (!mesh || !skin || skin.joints.length === 0 || skin.joints.length > MAX_RENDERABLE_SKINNING_JOINTS
          || renderable.skinning.jointCount !== skin.joints.length) {
          this.skinningBindingIssues.push(`${node.name}.skinning`);
          continue;
        }
        this.skinningBindings.push({
          node, renderable, mesh, skin, scope,
          ...(source ? { source } : {}),
          bindWorldMatrix: [...node.transform.worldMatrix] as Mat4,
          paletteMatrices: new Float32Array(skin.joints.length * 16)
        });
      }
    }
  }

  /** Check current ancestry as well as the indexed snapshot; reparenting must not cross actors. */
  private nodeBelongsToScope(node: SceneNode, scope: RuntimeSkinningScope): boolean {
    const root = this.options.actorRoot ?? this.options.scene.root;
    let attached: SceneNode | null = root;
    while (attached && attached !== this.options.scene.root) attached = attached.parent;
    if (!attached) return false;
    let current: SceneNode | null = node;
    while (current && current !== root) current = current.parent;
    if (!current || gltfSceneContainerFor(node) !== scope.container) return false;
    const assetId = this.options.asset?.gltfAssetId;
    return assetId === undefined || (typeof assetId === "string" && assetId.length > 0
      && scope.container?.userData.gltfAssetId === assetId);
  }

  private skinningBindingIsCurrent(binding: RuntimeSkinningBinding): boolean {
    const { node, renderable, scope, source, mesh, skin } = binding;
    if (node.renderable !== renderable || !renderable.skinning || renderable.skinning.jointCount !== skin.joints.length
      || !this.nodeBelongsToScope(node, scope)) return false;
    if (!source) return true;
    const asset = this.options.asset;
    const current = readSkinBindingProvenance(node.userData.gltfSkinBinding);
    const original = source.provenance;
    const canonical = asset?.skinBindingForNode?.(original.nodeIndex);
    const owners = scope.nodesByIndex.get(original.nodeIndex);
    return current !== undefined && current.assetId === original.assetId
      && current.nodeIndex === original.nodeIndex && current.meshIndex === original.meshIndex
      && current.primitiveIndex === original.primitiveIndex && current.skinIndex === original.skinIndex
      && asset?.gltfAssetId === original.assetId && scope.container?.userData.gltfAssetId === original.assetId
      && canonical?.meshIndex === original.meshIndex && canonical.skinIndex === original.skinIndex
      && asset.skins[original.skinIndex] === skin && asset.meshes.includes(mesh)
      && mesh.sourceMeshIndex === original.meshIndex && mesh.primitiveIndex === original.primitiveIndex
      && mesh.name === renderable.geometry
      && owners?.length === 1 && owners[0] === source.owner
      && source.owner.userData.gltfNodeIndex === original.nodeIndex
      && this.nodeBelongsToScope(source.owner, scope)
      && (node === source.owner || (node.parent === source.owner && !Object.prototype.hasOwnProperty.call(node.userData, "gltfNodeIndex")));
  }

  animationNodeForTrack(track: AnimationTrack): SceneNode | undefined {
    const cached = this.trackNodeCache.get(track);
    if (cached !== undefined) {
      const scope = cached && this.nodeScopes.get(cached);
      const original = this.trackSourceOverrides.get(track) ?? track;
      const index = (this.options.nodeIndexForTrack ?? this.options.asset?.nodeIndexForTrack)?.(original);
      return cached && scope && this.nodeBelongsToScope(cached, scope)
        && (index === undefined || !this.hasNodeIdentity || cached.userData.gltfNodeIndex === index) ? cached : undefined;
    }
    const resolved = this.resolveAnimationNodeForTrack(track);
    this.trackNodeCache.set(track, resolved ?? null);
    return resolved;
  }

  private resolveAnimationNodeForTrack(track: AnimationTrack): SceneNode | undefined {
    track = this.trackSourceOverrides.get(track) ?? track;
    const target = parseAnimationTarget(track.target, this.nodesByName);
    if (!target || target.kind !== "node" || this.ambiguousActorScope) return undefined;
    const asset = this.options.asset;
    const lookup = this.options.nodeIndexForTrack ?? asset?.nodeIndexForTrack;
    const explicit = lookup?.(track);
    if (explicit !== undefined) {
      if (!Number.isSafeInteger(explicit) || explicit < 0) return undefined;
      if (!this.hasNodeIdentity && asset?.gltfAssetId === undefined) return this.animationNodeForName(target.nodeName);
      return this.uniqueAnimationNode(this.nodesByIndex.get(explicit), explicit);
    }
    // Loader-backed tracks have source identity. Do not bind a foreign or
    // reconstructed track by a coincidentally matching name. Retargeted
    // tracks are explicitly generated for this actor and can use its names.
    if (asset?.gltfAssetId !== undefined && lookup
      && (this.options.nodeIndexForTrack !== undefined || !this.retargetedTracks.has(track))) return undefined;
    if (asset?.animations?.some((clip) => clip.tracks.includes(track))) {
      const indices = new Set<number>();
      for (const skin of asset.skins) {
        for (let slot = 0; slot < skin.jointNames.length; slot += 1) {
          if (skin.jointNames[slot] === target.nodeName && skin.joints[slot] !== undefined) indices.add(skin.joints[slot]!);
        }
      }
      if (indices.size > 1) return undefined;
      if (indices.size === 1) {
        if (!this.hasNodeIdentity) return this.animationNodeForName(target.nodeName);
        const index = [...indices][0]!;
        return this.uniqueAnimationNode(this.nodesByIndex.get(index), index);
      }
    }
    return this.animationNodeForName(target.nodeName);
  }

  private animationNodeForName(name: string): SceneNode | undefined {
    if (this.ambiguousActorScope) return undefined;
    return this.uniqueAnimationNode(this.nodesByName.get(name));
  }

  private uniqueAnimationNode(nodes: readonly SceneNode[] | undefined, index?: number): SceneNode | undefined {
    const candidates = nodes?.filter((node) => {
      const scope = this.nodeScopes.get(node);
      return scope !== undefined && this.nodeBelongsToScope(node, scope)
        && (index === undefined || node.userData.gltfNodeIndex === index);
    });
    return candidates?.length === 1 ? candidates[0] : undefined;
  }

  private animationNodeForIndexOrName(name: string, index: number | undefined): SceneNode | undefined {
    if (index === undefined) return this.animationNodeForName(name);
    if (this.ambiguousActorScope || !Number.isSafeInteger(index) || index < 0) return undefined;
    return this.uniqueAnimationNode(this.nodesByIndex.get(index), index);
  }

  private nodeTrackSample(track: AnimationTrack): { readonly sampleTarget: string; readonly binding: GLTFNodeTrackBinding } | undefined {
    const target = parseAnimationTarget(track.target, this.nodesByName);
    if (!target || target.kind !== "node") return undefined;
    const node = this.animationNodeForTrack(track);
    const ordinal = node === undefined ? undefined : this.nodeOrdinals.get(node);
    const sampleTarget = ordinal === undefined
      ? `\u0000gltf-missing:${track.target}`
      : `\u0000gltf-node:${ordinal}.${target.path}`;
    return { sampleTarget, binding: { publicTarget: track.target, ...(node ? { node } : {}) } };
  }

  private findSceneLight(name: string): Light | undefined {
    if (this.ambiguousActorScope) return undefined;
    const lights = this.options.scene.collectLights().filter((light) => this.nodeOrdinals.has(light) && light.name === name);
    return lights.length === 1 ? lights[0] : undefined;
  }

  /** Resolve imported definitions by their loader-owned identity, never by name. */
  private lightTrackTargets(name: string, identity?: GLTFLightTrackIdentity, indexed = false): readonly Light[] {
    if (identity) {
      const lights = this.options.scene.collectLights().filter((light) => {
        if (!this.nodeOrdinals.has(light)) return false;
        const source = getGLTFLightSceneIdentity(light);
        return source !== undefined && source.owner === identity.owner && source.definitionIndex === identity.definitionIndex;
      });
      const scopes = new Set(lights.map((light) => this.nodeScopes.get(light)));
      return scopes.size <= 1 ? lights : [];
    }
    // An unregistered indexed target has no source ownership and cannot safely bind.
    if (indexed) return [];
    const light = this.findSceneLight(name);
    return light ? [light] : [];
  }

  /**
   * Foot-planting post-pass (E2): solves the configured leg chains against the ground,
   * applies a shared pelvis reach correction, and rotates rigid hip/knee chains toward the
   * solved targets. Missing leg nodes are reported in
   * `missingLegNodes` and skipped, never faked. Returns undefined when unconfigured.
   */
  private applyFootPlanting(): GLTFootPlantingApplyResult | undefined {
    const config = this.footPlanting;
    if (!config) return undefined;
    this.options.scene.updateWorldTransforms();
    // Actor-local → world for the solve, world → actor-local for write-back. The rig and
    // the ground both speak world space (meters); the skeleton may live in import units
    // (centimeters). Points convert through the matrix pair; hipOffset rides along inside
    // the converted hip target point so any affine (scale, rotation, centering) is exact.
    const toWorld = config.worldFromLocal;
    const toLocal = toWorld ? invertMat4(toWorld) : undefined;
    const solvePoint = (point: Vec3): Vec3 => (toWorld ? transformPoint(toWorld, point) : point);
    // Solved legs arrive as readonly tuples; copy into mutable points for the transform.
    const actorPoint = (point: readonly [number, number, number]): Vec3 => {
      const mutable: Vec3 = [point[0], point[1], point[2]];
      return toLocal ? transformPoint(toLocal, mutable) : mutable;
    };
    const missingLegNodes: string[] = [];
    const resolved: { readonly side: "left" | "right"; readonly hip: SceneNode; readonly knee: SceneNode; readonly ankle: SceneNode; readonly pole: readonly [number, number, number] | undefined; readonly contact?: boolean; readonly support?: GLTFootPlantingLegConfig["support"] }[] = [];
    for (const leg of config.legs) {
      const hip = this.animationNodeForIndexOrName(leg.hip, leg.hipIndex);
      const knee = this.animationNodeForIndexOrName(leg.knee, leg.kneeIndex);
      const ankle = this.animationNodeForIndexOrName(leg.ankle, leg.ankleIndex);
      if (!hip) missingLegNodes.push(`${leg.side}:hip:${leg.hip}`);
      if (!knee) missingLegNodes.push(`${leg.side}:knee:${leg.knee}`);
      if (!ankle) missingLegNodes.push(`${leg.side}:ankle:${leg.ankle}`);
      if (!hip || !knee || !ankle) continue;
      resolved.push({ side: leg.side, hip, knee, ankle, pole: leg.pole, ...(leg.contact === undefined ? {} : {contact:leg.contact}), ...(leg.support ? {support:leg.support} : {}) });
    }
    if (resolved.length === 0) {
      return { groundedFeet: 0, averageTargetError: 0, lockedSides: [], missingLegNodes, hipOffset: 0 };
    }
    // Measure each animated ankle-to-sole offset from the exact pre-solve skinning
    // palette. One global value cannot plant asymmetric shoes or a rotated touchdown.
    this.refreshSkinningPalettes();
    const rawSoles = this.sampleFootSurfaces();
    const measuredAnkleHeights = new Map(resolved.map(entry => {
      const ankle = solvePoint(worldPosition(entry.ankle));
      const minimum = Math.min(Infinity, ...rawSoles.filter(point => point.side === entry.side).map(point => point.worldPosition[1]));
      return [entry.side, Number.isFinite(minimum) ? Math.max(0, ankle[1] - minimum) : undefined] as const;
    }));
    if (!this.footRig) {
      this.footRig = createFootIkRig({
        legs: resolved.map((entry) => ({
          side: entry.side,
          hip: solvePoint(worldPosition(entry.hip)),
          knee: solvePoint(worldPosition(entry.knee)),
          ankle: solvePoint(worldPosition(entry.ankle)),
          ...(measuredAnkleHeights.get(entry.side) ?? config.ankleHeight) !== undefined ? { ankleHeight: measuredAnkleHeights.get(entry.side) ?? config.ankleHeight } : {},
          ...(entry.pole ? { pole: entry.pole } : {})
        })),
        raycaster: config.ground,
        ...(config.ankleHeight !== undefined ? { ankleHeight: config.ankleHeight } : {}),
        ...(config.rayStartHeight !== undefined ? { rayStartHeight: config.rayStartHeight } : {}),
        ...(config.maxRayDistance !== undefined ? { maxRayDistance: config.maxRayDistance } : {}),
        ...(config.plantThreshold !== undefined ? { plantThreshold: config.plantThreshold } : {}),
        ...(config.hipDropFactor !== undefined ? { hipDropFactor: config.hipDropFactor } : {})
      });
    }
    const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    const originalLengths = new Map(resolved.map(entry => [entry.side, {
      upper:distance(solvePoint(worldPosition(entry.hip)),solvePoint(worldPosition(entry.knee))),
      lower:distance(solvePoint(worldPosition(entry.knee)),solvePoint(worldPosition(entry.ankle)))
    }]));
    const solved = this.footRig.solveFootPlacement({
      legs: resolved.map((entry) => ({
        side: entry.side,
        hip: solvePoint(worldPosition(entry.hip)),
        knee: solvePoint(worldPosition(entry.knee)),
        ankle: solvePoint(worldPosition(entry.ankle)),
        ...(measuredAnkleHeights.get(entry.side) ?? config.ankleHeight) !== undefined ? { ankleHeight: measuredAnkleHeights.get(entry.side) ?? config.ankleHeight } : {},
        ...(entry.pole ? { pole: entry.pole } : {}),
        ...(entry.contact === undefined ? {} : {contact:entry.contact}),
        ...(entry.support ? {support:entry.support} : {})
      }))
    });
    // A reach correction belongs to the shared pelvis owner. Move it once before
    // rotating either leg; translating each upper-leg root dislocates the chain,
    // while omitting the drop leaves a fully extended stance foot above ground.
    if (solved.hipOffset < 0) {
      const common = commonAncestor(resolved.map(entry => entry.hip));
      const anchors = common && common.parent ? [common] : [...new Set(resolved.map(entry => entry.hip))];
      for (const anchor of anchors) {
        const currentWorld = solvePoint(worldPosition(anchor));
        const dropped = actorPoint([currentWorld[0], currentWorld[1] + solved.hipOffset, currentWorld[2]]);
        setWorldPosition(anchor, dropped);
      }
      this.options.scene.updateWorldTransforms();
    }
    for (const foot of solved.feet) {
      const entry = resolved.find((candidate) => candidate.side === foot.side);
      if (!entry) continue;
      // Apply the two-bone solution with joint rotations. Moving hip/knee/ankle
      // translations directly changes authored bone lengths and deforms every weighted
      // mesh. The solver targets are world-space; orient each parent toward its solved
      // child while preserving the animation's local translations and scales.
      const kneeTarget = actorPoint(foot.knee);
      orientJointToward(entry.hip, entry.knee, kneeTarget);
      entry.hip.updateWorldTransform();
      const ankleTarget = actorPoint(foot.ankle);
      orientJointToward(entry.knee, entry.ankle, ankleTarget);
      entry.knee.updateWorldTransform();
    }
    this.options.scene.updateWorldTransforms();
    for (const foot of solved.feet) {
      const entry = resolved.find(candidate => candidate.side === foot.side)!;
      if (!foot.locked || config.lockFootRotation === false) {
        this.footOrientationLocks.delete(foot.side);
        this.footDescendantLocks.delete(foot.side);
        continue;
      }
      let locked = this.footOrientationLocks.get(foot.side);
      if (!locked) {
        // Capture the actual animated sole orientation and toe pose at touchdown.
        // Reusing the asset bind pose snaps arbitrary rigs and moves their sole vertices.
        locked = toWorld ? multiplyMat4(toWorld, entry.ankle.transform.worldMatrix) : [...entry.ankle.transform.worldMatrix] as Mat4;
        const descendants = new Map<string, Mat4>();
        entry.ankle.children.forEach(child => child.traverse(node => descendants.set(node.id, [...node.transform.localMatrix] as Mat4)));
        this.footDescendantLocks.set(foot.side, descendants);
        const normal = foot.sample.groundNormal;
        const norm = Math.hypot(...normal);
        if (!(norm > 0)) throw new Error("Foot contact requires a nonzero ground normal.");
        const nx=normal[0]/norm, ny=normal[1]/norm, nz=normal[2]/norm;
        if (ny <= -0.999) throw new Error("Foot contact cannot plant on a downward facing surface.");
        const vx=nz, vz=-nx, t=1/(1+ny);
        const tilt:Mat4=[1-vz*vz*t,vz,vx*vz*t,0, -vz,1-(vx*vx+vz*vz)*t,vx,0, vx*vz*t,-vx,1-vx*vx*t,0, 0,0,0,1];
        locked=multiplyMat4(tilt,locked);
        this.footOrientationLocks.set(foot.side, locked);
      }
      // Keep the solved ankle position while holding the sole orientation in world space.
      const ankleWorld = solvePoint(worldPosition(entry.ankle));
      const desired = [...locked] as Mat4;
      desired[12] = ankleWorld[0]; desired[13] = ankleWorld[1]; desired[14] = ankleWorld[2];
      const actorMatrix = toLocal ? multiplyMat4(toLocal, desired) : desired;
      const parent = entry.ankle.parent;
      const local = parent ? multiplyMat4(invertMat4(parent.transform.worldMatrix), actorMatrix) : actorMatrix;
      if ((!toWorld || (toWorld[3] === 0 && toWorld[7] === 0 && toWorld[11] === 0 && toWorld[15] === 1))
        && Math.abs(local[3]) <= 1e-12 && Math.abs(local[7]) <= 1e-12
        && Math.abs(local[11]) <= 1e-12 && Math.abs(local[15] - 1) <= 1e-12) {
        local[3] = 0; local[7] = 0; local[11] = 0; local[15] = 1;
      }
      entry.ankle.transform.setFromLocalMatrix(local);
      // Toe joints remain in their touchdown relationship during stance; animated
      // toe curl otherwise moves the sole while the ankle still reports zero slip.
      const touchdown = this.footDescendantLocks.get(foot.side);
      const restore = (node: SceneNode): void => {
        const rest = touchdown?.get(node.id);
        if (rest) node.transform.setFromLocalMatrix(rest);
        node.children.forEach(restore);
      };
      entry.ankle.children.forEach(restore);
      entry.ankle.updateWorldTransform();
    }
    this.options.scene.updateWorldTransforms();
    return {
      legDeformation: resolved.map(entry => {
        const before=originalLengths.get(entry.side)!;
        const upperAfter=distance(solvePoint(worldPosition(entry.hip)),solvePoint(worldPosition(entry.knee)));
        const lowerAfter=distance(solvePoint(worldPosition(entry.knee)),solvePoint(worldPosition(entry.ankle)));
        return {side:entry.side,upperBefore:before.upper,lowerBefore:before.lower,upperAfter,lowerAfter,
          maxRelativeLengthChange:Math.max(Math.abs(upperAfter-before.upper)/Math.max(1e-9,before.upper),Math.abs(lowerAfter-before.lower)/Math.max(1e-9,before.lower))};
      }),
      feet: solved.feet.map(foot => {
        const entry = resolved.find(candidate => candidate.side === foot.side)!;
        const position = solvePoint(worldPosition(entry.ankle));
        return { side: foot.side, worldPosition: position, locked: foot.locked,
          contactError: Math.hypot(...position.map((value, axis) => value - foot.sample.plantedFoot[axis]!)) };
      }),
      groundedFeet: solved.groundedFeet,
      averageTargetError: solved.averageTargetError,
      lockedSides: solved.feet.filter((foot) => foot.locked).map((foot) => foot.side),
      missingLegNodes,
      hipOffset: solved.hipOffset
    };
  }

  private materialTrackBinding(materialName: string, leafPath: string): MaterialTrackBinding {
    const parameters = materialParametersForLeaf(leafPath);
    if (parameters === undefined) return { status: "unsupported" };
    const sink = this.options.resolveAnimationMaterial?.(materialName);
    if (sink === undefined) return { status: "missing-material" };
    const mode = textureTransformLeaf(leafPath) ? "texture" : isGuardedMaterialScalarLeaf(leafPath) ? "scalar" : "legacy";
    if (mode !== "legacy") {
      // A legacy setter cannot establish that the source material, map or
      // physical lobe is live and unambiguous. Never claim dropped writes.
      if (!sink.animationParameterStatus || (mode === "scalar" ? !sink.applyAnimationParameter : !sink.applyAnimationTextureTransform)) return { status: "unsupported" };
      const status = sink.animationParameterStatus(parameters[0]!);
      if (status !== "available") return { status: isMaterialBindingFailure(status) ? status : "unsupported" };
    }
    return { status: "available", sink, parameters, mode };
  }

  /** Apply a live binding, reporting a precise failure instead of counting a dropped write. */
  private applyMaterialTrackValue(materialName: string, leafPath: string, value: AnimationValue, trackTarget: string): GLTFSceneAnimationMaterialBindingIssue["reason"] | undefined {
    const binding = this.materialTrackBinding(materialName, leafPath);
    if (binding.status !== "available") return binding.status;
    if (binding.mode === "texture") {
      const transform = textureTransformLeaf(leafPath)!;
      const numeric = asTextureTransformValue(value, trackTarget, transform.component);
      const applied = binding.sink.applyAnimationTextureTransform!(binding.parameters[0]!, numeric);
      return applied === "applied" ? undefined : isMaterialBindingFailure(applied) ? applied : "unsupported";
    }
    if (binding.mode === "scalar") {
      const numeric = asScalar(value, trackTarget);
      if (!validGuardedMaterialScalar(leafPath, numeric)) {
        throw new RangeError(`glTF animation track "${trackTarget}" sampled an out-of-range material value.`);
      }
      // The sink checks the resources again before writing; a binding can be
      // disposed or replaced between inspection and the actual application.
      const applied = binding.sink.applyAnimationParameter!(binding.parameters[0]!, numeric);
      return applied === "applied" ? undefined : isMaterialBindingFailure(applied) ? applied : "unsupported";
    }
    const numeric = asMaterialLeafValue(value, trackTarget);
    for (const parameter of binding.parameters) {
      binding.sink.setAnimationParameter(parameter, numeric);
    }
    return undefined;
  }

  /** Apply an imported definition to all of its live instances, or an authored name to one light. */
  private applyLightTrackValue(lightName: string, leaf: string, value: AnimationValue, trackTarget: string, identity?: GLTFLightTrackIdentity, indexed = false): boolean {
    const lights = this.lightTrackTargets(lightName, identity, indexed);
    if (lights.length === 0 || !lights.every((light) => lightSupportsLeaf(light, leaf))) return false;
    if (leaf === "intensity") {
      const intensity = asScalar(value, trackTarget);
      if (intensity < 0) throw new RangeError(`glTF animation track "${trackTarget}" sampled a negative light intensity.`);
      for (const light of lights) light.intensity = intensity;
      return true;
    }
    if (leaf === "color") {
      const color = asVec3(value, trackTarget);
      for (const light of lights) light.color = [...color];
      return true;
    }
    const range = asPositiveScalar(value, trackTarget);
    for (const light of lights) (light as unknown as { range: number }).range = range;
    return true;
  }

  /** CPU skinning oracle using the exact palette submitted to rendering, not IK targets. */
  sampleFootSurfaces(): NonNullable<GLTFootPlantingApplyResult["surfaces"]> {
    const config = this.footPlanting;
    if (!config) return [];
    const samples: { side: "left" | "right"; mesh: string; vertex: number; worldPosition: readonly [number, number, number]; groundError: number | null; skinningProbe?: { position: readonly number[]; joints: readonly number[]; weights: readonly number[]; matrices: readonly number[]; modelMatrix: readonly number[]; expectedWorldPosition: readonly number[] } }[] = [];
    for (const leg of config.legs) {
      const ankle = this.animationNodeForIndexOrName(leg.ankle, leg.ankleIndex);
      if (!ankle) continue;
      const footNodes = new Set<SceneNode>();
      const visit = (node: SceneNode): void => { footNodes.add(node); node.children.forEach(visit); };
      visit(ankle);
      for (const binding of this.skinningBindings) {
        if (this.nodeScopes.get(ankle) !== binding.scope || !binding.jointNodes) continue;
        const palette = binding.renderable.skinning;
        if (!palette) continue;
        const mesh = binding.mesh;
        const cacheKey = `${ankle.id}:${binding.node.id}:${mesh.name}`;
        let selected = this.footSurfaceVertices.get(cacheKey);
        if (!selected) {
        const candidates: number[] = [];
        for (let vertex = 0; vertex < mesh.positions.length; vertex++) {
          let footWeight = 0;
          for (let lane = 0; lane < 4; lane++) {
            const first = binding.jointNodes[mesh.joints[vertex]?.[lane] ?? -1];
            const second = binding.jointNodes[mesh.joints1?.[vertex]?.[lane] ?? -1];
            if (first && footNodes.has(first)) footWeight += mesh.weights[vertex]?.[lane] ?? 0;
            if (second && footNodes.has(second)) footWeight += mesh.weights1?.[vertex]?.[lane] ?? 0;
          }
          if (footWeight >= 0.5) candidates.push(vertex);
        }
        if (!candidates.length) { this.footSurfaceVertices.set(cacheKey, []); continue; }
        // Fixed bind-space sole strip: never reselect vertices from animated positions.
        const bindHeights = new Map(candidates.map(vertex => [vertex, transformPoint(binding.bindWorldMatrix, [...mesh.positions[vertex]!])[1]]));
        const ys = [...bindHeights.values()];
        const minimum = Math.min(...ys), maximum = Math.max(...ys);
        const strip = Math.max(1e-6, (maximum - minimum) * 0.001);
        selected = candidates.filter(index => bindHeights.get(index)! <= minimum + strip);
        this.footSurfaceVertices.set(cacheKey, selected);
        }
        const toWorld = config.worldFromLocal ? multiplyMat4(config.worldFromLocal, binding.node.transform.worldMatrix) : binding.node.transform.worldMatrix;
        for (const vertex of selected) {
          const authored = [...mesh.positions[vertex]!] as Vec3;
          for (let morph = 0; morph < mesh.morphTargets.length; morph++) {
            const weight = binding.renderable.morphWeights?.[morph] ?? 0;
            const delta = mesh.morphTargets[morph]?.positions[vertex];
            if (delta && weight) for (let axis = 0; axis < 3; axis++) authored[axis] += delta[axis]! * weight;
          }
          const skinned: Vec3 = [0, 0, 0];
          let total = 0;
          for (let set = 0; set < 2; set++) for (let lane = 0; lane < 4; lane++) {
            const weight = (set ? mesh.weights1?.[vertex]?.[lane] : mesh.weights[vertex]?.[lane]) ?? 0;
            const joint = (set ? mesh.joints1?.[vertex]?.[lane] : mesh.joints[vertex]?.[lane]) ?? -1;
            if (weight <= 0) continue;
            if (joint < 0 || joint >= palette.jointCount) throw new Error("Foot surface vertex has an invalid palette influence.");
            const point = transformPoint(Array.from(palette.matrices.subarray(joint * 16, joint * 16 + 16)) as Mat4, authored);
            for (let axis = 0; axis < 3; axis++) skinned[axis] += point[axis]! * weight;
            total += weight;
          }
          if (Math.abs(total - 1) > 0.001) throw new Error("Foot surface vertex weights must sum to one.");
          const worldPosition = transformPoint(toWorld, skinned);
          const hit = config.ground.raycastDown([worldPosition[0], worldPosition[1] + 2, worldPosition[2]], 4);
          samples.push({ side: leg.side, mesh: `${binding.node.userData.gltfNodeIndex ?? binding.node.name}:${mesh.name}`, vertex, worldPosition,
            groundError: hit ? worldPosition[1] - hit.point[1] : null,
            ...(vertex === selected[0] ? { skinningProbe: { position: authored,
              joints: [...(mesh.joints[vertex] ?? [0,0,0,0]), ...(mesh.joints1?.[vertex] ?? [0,0,0,0])],
              weights: [...(mesh.weights[vertex] ?? [0,0,0,0]), ...(mesh.weights1?.[vertex] ?? [0,0,0,0])],
              matrices: Array.from(palette.matrices), modelMatrix: [...toWorld], expectedWorldPosition: worldPosition } } : {}) });
        }
      }
    }
    return samples;
  }

  private refreshSkinningPalettes(): { readonly updated: number; readonly missingTargets: readonly string[] } {
    const result = this.paletteResult;
    result.updated = 0;
    result.missingTargets.length = 0;
    result.missingTargets.push(...this.skinningBindingIssues);
    if (this.skinningBindings.length === 0) {
      return result;
    }
    const missingTargets = result.missingTargets;
    for (const binding of this.skinningBindings) {
      if (!this.skinningBindingIsCurrent(binding)) {
        missingTargets.push(`${binding.node.name}.skinning`);
        continue;
      }
      // T0.11: write into the binding's persistent palette buffer — no per-frame
      // Float32Array allocation, and the renderer's C-18 cache can key on it.
      const matrices = binding.paletteMatrices;
      const inverseMeshWorld = invertMat4Into(this.inverseWorldScratch, binding.node.transform.worldMatrix);
      let jointNodes = binding.jointNodes;
      if (!jointNodes) {
        jointNodes = new Array(binding.skin.joints.length);
        let allResolved = true;
        for (let index = 0; index < binding.skin.joints.length; index += 1) {
          const candidates = binding.source || binding.scope.hasNodeIdentity
            ? binding.scope.nodesByIndex.get(binding.skin.joints[index]!)
            : binding.scope.nodesByName.get(binding.skin.jointNames[index]!);
          const node = candidates?.length === 1 ? candidates[0] : undefined;
          jointNodes[index] = node;
          if (!node) allResolved = false;
        }
        if (allResolved) binding.jointNodes = jointNodes;
      }
      let complete = true;
      for (let index = 0; index < binding.skin.joints.length; index += 1) {
        const jointNode = jointNodes[index];
        const inverseBind = binding.skin.inverseBindMatrices[index];
        if (!jointNode || !inverseBind || !this.nodeBelongsToScope(jointNode, binding.scope)
          || ((binding.source || binding.scope.hasNodeIdentity) && jointNode.userData.gltfNodeIndex !== binding.skin.joints[index])) {
          missingTargets.push(`${binding.skin.name}.${binding.skin.jointNames[index] ?? `#${binding.skin.joints[index]}`}`);
          complete = false;
          break;
        }
      }
      if (!complete) continue;
      for (let index = 0; index < binding.skin.joints.length; index += 1) {
        const jointNode = jointNodes[index]!;
        const inverseBind = binding.skin.inverseBindMatrices[index]!;
        // (inverseMeshWorld * jointWorld) * inverseBind, straight into the palette.
        multiplyMat4Into(this.paletteScratch, 0, inverseMeshWorld, jointNode.transform.worldMatrix);
        multiplyMat4Into(matrices, index * 16, this.paletteScratch, inverseBind);
      }
      let skinningPalette = binding.paletteView;
      if (!skinningPalette) {
        skinningPalette = {
          jointCount: binding.skin.joints.length,
          matrices
        };
        binding.paletteView = skinningPalette;
      }
      // C-18/§9.2: the stable per-skin key the palette cache binds on is this
      // binding object, not the per-frame `renderable.skinning` wrapper (E40).
      skinningPalette.paletteKey = binding;
      binding.renderable.skinning = skinningPalette;
      result.updated += 1;
    }
    return result;
  }

  private inspectClipBinding(clip: AnimationClip): GLTFSceneAnimationClipBindingDiagnostics {
    let supportedTrackCount = 0;
    let boundTrackCount = 0;
    let transformTrackCount = 0;
    let morphWeightTrackCount = 0;
    let materialTrackCount = 0;
    let lightTrackCount = 0;
    const boundMaterialNames = new Set<string>();
    const boundLightNames = new Set<string>();
    const boundNodeNames = new Set<string>();
    const missingTargets = new Set<string>();
    const unsupportedTracks = new Set<string>();
    const materialBindingIssues = new Map<string, GLTFSceneAnimationMaterialBindingIssue>();

    for (const track of clip.tracks) {
      const identity = getGLTFLightAnimationTrackIdentity(track);
      const publicTarget = identity?.publicTarget ?? track.target;
      const target = parseAnimationTarget(publicTarget, this.nodesByName);
      if (!target) {
        unsupportedTracks.add(publicTarget);
        continue;
      }
      if (target.kind === "material") {
        materialTrackCount += 1;
        const transform = textureTransformLeaf(target.leaf);
        if (materialParametersForLeaf(target.leaf) === undefined
          || (isGuardedMaterialScalarLeaf(target.leaf) && track.valueType !== "scalar")
          || (transform && (transform.component === "rotation"
            ? track.valueType !== "scalar"
            : track.valueType !== "number-array" || track.valueSize !== 2))) {
          unsupportedTracks.add(track.target);
          missingTargets.add(track.target);
          materialBindingIssues.set(track.target, { target: track.target, reason: "unsupported" });
          continue;
        }
        supportedTrackCount += 1;
        const binding = this.materialTrackBinding(target.materialName, target.leaf);
        if (binding.status !== "available") {
          missingTargets.add(track.target);
          materialBindingIssues.set(track.target, { target: track.target, reason: binding.status });
          continue;
        }
        boundTrackCount += 1;
        boundMaterialNames.add(target.materialName);
        continue;
      }
      supportedTrackCount += 1;
      if (target.kind === "light") {
        lightTrackCount += 1;
        const leaf = identity?.leaf ?? target.leaf;
        const lights = this.lightTrackTargets(target.lightName, identity, target.indexed === true);
        if (lights.length === 0 || !lights.every((light) => lightSupportsLeaf(light, leaf))) {
          missingTargets.add(publicTarget);
          continue;
        }
        boundTrackCount += 1;
        boundLightNames.add(identity?.definitionName ?? target.lightName);
        continue;
      }
      if (target.path === "weights") {
        morphWeightTrackCount += 1;
        const node = this.animationNodeForTrack(track);
        const renderables = node && !this.blockedMorphNodes.has(node) ? this.morphRenderablesByNode.get(node) ?? [] : [];
        if (renderables.length === 0) {
          missingTargets.add(track.target);
          continue;
        }
        boundTrackCount += 1;
        boundNodeNames.add(target.nodeName);
        continue;
      }

      transformTrackCount += 1;
      const node = this.animationNodeForTrack(track);
      if (!node) {
        missingTargets.add(track.target);
        continue;
      }
      boundTrackCount += 1;
      boundNodeNames.add(target.nodeName);
    }

    return {
      clipName: clip.name,
      trackCount: clip.tracks.length,
      supportedTrackCount,
      boundTrackCount,
      transformTrackCount,
      morphWeightTrackCount,
      materialTrackCount,
      lightTrackCount,
      boundMaterialNames: [...boundMaterialNames].sort(),
      boundLightNames: [...boundLightNames].sort(),
      missingTargetCount: missingTargets.size,
      unsupportedTrackCount: unsupportedTracks.size,
      skinningBindingCount: this.skinningBindings.length,
      boundNodeNames: [...boundNodeNames].sort(),
      missingTargets: [...missingTargets].sort(),
      unsupportedTracks: [...unsupportedTracks].sort(),
      ...(materialBindingIssues.size === 0 ? {} : { materialBindingIssues: [...materialBindingIssues.values()].sort((a, b) => a.target.localeCompare(b.target)) }),
      animatesSkeleton: this.skinningBindings.length > 0 && boundTrackCount > 0 && transformTrackCount > 0
    };
  }

  private applySampledTargets(
    clipName: string,
    time: number,
    sampled: GLTFSampledAnimationTargets,
    blendedClipCount?: number,
    phaseTimings?: GLTFSceneAnimationPhaseTimings,
    poseWrite?: { readonly pose: PoseBuffer; readonly nodes: readonly SceneNode[]; readonly indices: Iterable<number> }
  ): GLTFSceneAnimationApplyResult {
    this.assertAlive();
    let transformTracksApplied = 0;
    let morphWeightTracksApplied = 0;
    let materialTracksApplied = 0;
    let lightTracksApplied = 0;
    const missingTargets: string[] = [];
    const materialBindingIssues: GLTFSceneAnimationMaterialBindingIssue[] = [];
    const unsupportedTracks = [...sampled.unsupportedTracks];

    for (const [sampleTarget, value] of sampled.sampledTargets) {
      const identity = sampled.lightTrackIdentities?.get(sampleTarget);
      const nodeBinding = sampled.nodeTrackBindings?.get(sampleTarget);
      const trackTarget = nodeBinding?.publicTarget ?? identity?.publicTarget ?? sampleTarget;
      if (sampled.ambiguousLightTargets?.has(sampleTarget)) {
        missingTargets.push(trackTarget);
        continue;
      }
      const target = parseAnimationTarget(trackTarget, this.nodesByName);
      if (!target) {
        continue;
      }
      if (target.kind === "material") {
        const failure = this.applyMaterialTrackValue(target.materialName, target.leaf, value, trackTarget);
        if (failure === undefined) {
          materialTracksApplied += 1;
        } else {
          missingTargets.push(trackTarget);
          materialBindingIssues.push({ target: trackTarget, reason: failure });
          if (materialParametersForLeaf(target.leaf) === undefined && !unsupportedTracks.includes(trackTarget)) unsupportedTracks.push(trackTarget);
        }
        continue;
      }
      if (target.kind === "light") {
        if (this.applyLightTrackValue(target.lightName, identity?.leaf ?? target.leaf, value, trackTarget, identity, target.indexed === true)) {
          lightTracksApplied += 1;
        } else {
          missingTargets.push(trackTarget);
        }
        continue;
      }
      const node = nodeBinding ? nodeBinding.node : this.animationNodeForName(target.nodeName);
      if (!node) {
        missingTargets.push(trackTarget);
        continue;
      }
      if (target.path === "weights") {
        const renderables = this.blockedMorphNodes.has(node) ? [] : this.morphRenderablesByNode.get(node) ?? [];
        if (renderables.length === 0) {
          missingTargets.push(trackTarget);
          continue;
        }
        const weights = asNumberArray(value);
        for (const renderable of renderables) {
          renderable.morphWeights = weights;
        }
        morphWeightTracksApplied += 1;
        continue;
      }

      applyTransformValue(node, target.path, value, trackTarget);
      transformTracksApplied += 1;
    }

    // Pose slots carry scene-node identity. Writing via names would collapse
    // duplicate names and replace each node's distinct rest-pose contribution.
    if (poseWrite) {
      for (const index of poseWrite.indices) {
        const node = poseWrite.nodes[index];
        if (!node) continue;
        const p = index * 3;
        const q = index * 4;
        node.transform.setPosition(poseWrite.pose.positions[p]!, poseWrite.pose.positions[p + 1]!, poseWrite.pose.positions[p + 2]!);
        node.transform.setRotation(poseWrite.pose.rotations[q]!, poseWrite.pose.rotations[q + 1]!, poseWrite.pose.rotations[q + 2]!, poseWrite.pose.rotations[q + 3]!);
        node.transform.setScale(poseWrite.pose.scales[p]!, poseWrite.pose.scales[p + 1]!, poseWrite.pose.scales[p + 2]!);
        transformTracksApplied += 3;
      }
    }

    this.options.scene.updateWorldTransforms();
    const footPlanting = this.applyFootPlanting();
    const skinning = this.refreshSkinningPalettes();
    const measuredFootPlanting = footPlanting ? { ...footPlanting, surfaces: this.sampleFootSurfaces() } : undefined;
    return {
      clipName,
      time,
      ...(blendedClipCount === undefined ? {} : { blendedClipCount }),
      tracksApplied: transformTracksApplied + morphWeightTracksApplied + materialTracksApplied + lightTracksApplied,
      transformTracksApplied,
      morphWeightTracksApplied,
      materialTracksApplied,
      lightTracksApplied,
      ...(measuredFootPlanting === undefined ? {} : { footPlanting: measuredFootPlanting }),
      skinningPalettesUpdated: skinning.updated,
      missingTargets: [...missingTargets, ...skinning.missingTargets],
      unsupportedTracks,
      ...(materialBindingIssues.length === 0 ? {} : { materialBindingIssues }),
      ...(phaseTimings === undefined ? {} : { phaseTimings })
    };
  }
}

export function createGLTFSceneAnimationRuntime(options: GLTFSceneAnimationRuntimeOptions): GLTFSceneAnimationRuntime {
  return new GLTFSceneAnimationRuntime(options);
}

export class GLTFSceneAnimationMixerBinding {
  readonly runtime: GLTFSceneAnimationRuntime;
  readonly mixer: AnimationMixer;
  readonly actions: ReadonlyMap<string, AnimationAction>;
  private readonly mutableActions = new Map<string, AnimationAction>();
  private readonly duplicateClipNames: Set<string>;
  private readonly pendingValues = new Map<string, AnimationValue>();
  private elapsedTime = 0;
  private eventOverflow = 0;
  private lastApply?: GLTFSceneAnimationApplyResult;
  private disposed = false;
  private readonly rootMotionTarget?: string;

  constructor(options: GLTFSceneAnimationMixerOptions) {
    this.duplicateClipNames = duplicateAnimationClipNames(options.clips);
    const autoPlay = options.autoPlay === false ? undefined : options.autoPlay ?? options.clips[0]?.name;
    if (autoPlay !== undefined) {
      assertUnambiguousClipName(autoPlay, this.duplicateClipNames);
      if (!options.clips.some((clip) => clip.name === autoPlay)) {
        throw new Error(`glTF animation mixer autoPlay clip "${autoPlay}" was not found.`);
      }
    }
    this.runtime = new GLTFSceneAnimationRuntime(options);
    this.rootMotionTarget = options.mixer?.applyRootMotion
      ? options.mixer.rootMotionTrack ?? "root.position"
      : undefined;
    this.mixer = new AnimationMixer({
      ...(options.consumeRootMotion ? { consumeRootMotion: options.consumeRootMotion } : {}),
      setAnimationValue: (target, value) => {
        this.pendingValues.set(target, cloneAnimationValue(value));
      }
    }, options.mixer ?? {});
    for (const clip of options.clips) {
      if (this.duplicateClipNames.has(clip.name)) continue;
      const action = new AnimationAction(clip).setWeight(0);
      this.mixer.addAction(action);
      this.mutableActions.set(clip.name, action);
    }
    if (autoPlay) {
      const action = this.mutableActions.get(autoPlay);
      if (!action) {
        throw new Error(`glTF animation mixer autoPlay clip "${autoPlay}" was not found.`);
      }
      action.setWeight(1).play();
    }
    this.actions = this.mutableActions;
  }

  listClips(): readonly string[] {
    this.assertAlive();
    return this.runtime.clipNames();
  }

  play(name: string, weight = 1): AnimationAction {
    return this.playClip(name, { weight });
  }

  playClip(name: string, options: GLTFSceneAnimationPlayOptions = {}): AnimationAction {
    const action = this.requireAction(name);
    this.configureAction(action, options);
    action.play();
    return action;
  }

  playExclusive(name: string, options: GLTFSceneAnimationPlayOptions = {}): AnimationAction {
    const action = this.requireAction(name);
    const fadeDuration = options.fadeDuration ?? 0;
    for (const [clipName, candidate] of this.actions) {
      if (clipName === name) continue;
      if (fadeDuration > 0) {
        candidate.fadeTo(0, fadeDuration);
      } else {
        candidate.setWeight(0);
      }
    }
    this.configureAction(action, { ...options, weight: options.weight ?? 1 });
    action.play();
    return action;
  }

  pause(name?: string): void {
    this.assertAlive();
    for (const action of this.resolveActions(name)) {
      action.pause();
    }
  }

  resume(name?: string): void {
    this.assertAlive();
    for (const action of this.resolveActions(name)) {
      if (action.weight > 0) action.play();
    }
  }

  stop(name?: string): void {
    this.assertAlive();
    for (const action of this.resolveActions(name)) {
      action.stop().setWeight(0);
    }
  }

  seek(name: string, time: number): AnimationAction {
    const action = this.requireAction(name);
    action.seek(time);
    this.elapsedTime = action.time;
    return action;
  }

  setTimeScale(timeScale: number): void {
    this.assertAlive();
    this.mixer.setTimeScale(timeScale);
  }

  setActionTimeScale(name: string, timeScale: number): AnimationAction {
    return this.requireAction(name).setTimeScale(timeScale);
  }

  setActionWeight(name: string, weight: number): AnimationAction {
    return this.requireAction(name).setWeight(weight);
  }

  setActionLoop(name: string, loopMode: LoopMode, repetitions?: number): AnimationAction {
    return this.requireAction(name).setLoop(loopMode, repetitions);
  }

  crossFade(fromName: string, toName: string, duration: number): void {
    const from = this.requireAction(fromName);
    const to = this.requireAction(toName);
    if (!to.playing) {
      to.setWeight(0).play();
    }
    this.mixer.crossFade(from, to, duration);
  }

  applyClipSamples(samples: readonly GLTFSceneAnimationClipSample[]): GLTFSceneAnimationMixerUpdateResult {
    this.assertAlive();
    this.pendingValues.clear();
    this.lastApply = this.runtime.applyClips(samples);
    this.elapsedTime = Math.max(this.elapsedTime, this.lastApply.time);
    return { events: [], eventOverflow: 0, applyResult: this.lastApply, activeActions: this.actionSnapshots().filter((action) => action.active) };
  }

  update(deltaSeconds: number): GLTFSceneAnimationMixerUpdateResult {
    this.assertAlive();
    if (!Number.isFinite(deltaSeconds)) {
      throw new Error("glTF animation mixer delta must be finite.");
    }
    this.pendingValues.clear();
    this.eventOverflow = 0;
    // An action may finish while the generic mixer advances it. Retain the
    // pre-update set so identity checks do not overlook its contribution.
    const activeBeforeUpdate = new Set([...this.mutableActions.values()].filter((action) => action.playing && action.weight > 0));
    const mixerBeforeUpdate = this.mixer.snapshot();
    const untrackedActionsBeforeUpdate = mixerBeforeUpdate.actions.length !== this.mutableActions.size;
    const untrackedMixerStateBeforeUpdate = untrackedActionsBeforeUpdate || mixerBeforeUpdate.layers.length > 0;
    if (this.rootMotionTarget !== undefined) {
      if (untrackedActionsBeforeUpdate) {
        throw new Error("glTF root motion requires tracked actions and an unambiguous actor.");
      }
      let rootNode: SceneNode | undefined;
      for (const action of this.mutableActions.values()) {
        if (!action.playing) continue;
        const tracks = action.clip.tracks.filter((track) => track.target === this.rootMotionTarget);
        if (tracks.length === 0) continue;
        const node = tracks.length === 1 ? this.runtime.animationNodeForTrack(tracks[0]!) : undefined;
        if (!node || (rootNode && rootNode !== node)) {
          throw new Error(`glTF root motion target "${this.rootMotionTarget}" is missing or ambiguous.`);
        }
        rootNode = node;
      }
    }
    // This is binding-owned bookkeeping, not an application callback. Keep it
    // scoped to update so strict mixer serialization can reject every actual
    // user listener without mistaking this internal observer for one.
    const stopOverflow = this.mixer.addEventListener("overflow", ({ dropped }) => { this.eventOverflow += dropped; });
    let events: readonly AnimationEvent[];
    try {
      events = this.mixer.update(deltaSeconds);
    } finally {
      stopOverflow();
    }
    // This is a wall-clock duration used to label applications, not the
    // signed playhead. Reverse updates must not make that label negative.
    this.elapsedTime += Math.abs(deltaSeconds);
    this.lastApply = this.runtime.applyAnimationValues(
      "gltf-animation-mixer",
      this.elapsedTime,
      this.pendingValues,
      [],
      {
        ...this.pendingLightBindings(activeBeforeUpdate, untrackedMixerStateBeforeUpdate),
        nodeTrackBindings: this.pendingNodeBindings(activeBeforeUpdate, untrackedActionsBeforeUpdate)
      }
    );
    return { events, eventOverflow: this.eventOverflow, applyResult: this.lastApply, activeActions: this.actionSnapshots().filter((action) => action.active) };
  }

  /**
   * The generic mixer blends by public target string. Preserve loader identity
   * when all contributing tracks have the same source; otherwise the mixed
   * value cannot be split safely and must be reported missing. Masked actions
   * may conservatively count as contributors. External actions or mixer layers
   * are not represented by the binding's action map, so they also fail closed.
   * Public action clips stay intact.
   */
  private pendingLightBindings(activeBeforeUpdate: ReadonlySet<AnimationAction>, untrackedMixerStateBeforeUpdate: boolean): Pick<GLTFSampledAnimationTargets, "lightTrackIdentities" | "ambiguousLightTargets"> {
    const seen = new Map<string, GLTFLightTrackIdentity | null>();
    const ambiguousLightTargets = new Set<string>();
    const lightTrackIdentities = new Map<string, GLTFLightTrackIdentity>();
    const mixerState = this.mixer.snapshot();
    const untrackedMixerState = untrackedMixerStateBeforeUpdate || mixerState.actions.length !== this.mutableActions.size || mixerState.layers.length > 0;
    for (const action of this.mutableActions.values()) {
      if (!activeBeforeUpdate.has(action) && !(action.playing && action.weight > 0)) continue;
      for (const track of action.clip.tracks) {
        const target = track.target;
        if (!this.pendingValues.has(target) || !(target.startsWith("light:") || target.startsWith("light-index:"))) continue;
        const identity = getGLTFLightAnimationTrackIdentity(track) ?? null;
        if (!seen.has(target)) {
          seen.set(target, identity);
          continue;
        }
        const previous = seen.get(target)!;
        if (previous === null ? identity !== null : identity === null || previous.owner !== identity.owner || previous.definitionIndex !== identity.definitionIndex || previous.leaf !== identity.leaf) {
          ambiguousLightTargets.add(target);
        }
      }
    }
    for (const target of this.pendingValues.keys()) {
      if (!(target.startsWith("light:") || target.startsWith("light-index:"))) continue;
      if (untrackedMixerState || !seen.has(target)) {
        ambiguousLightTargets.add(target);
      } else {
        const identity = seen.get(target);
        if (identity && !ambiguousLightTargets.has(target)) lightTrackIdentities.set(target, identity);
      }
    }
    return { lightTrackIdentities, ambiguousLightTargets };
  }

  private pendingNodeBindings(activeBeforeUpdate: ReadonlySet<AnimationAction>, untrackedMixerStateBeforeUpdate: boolean): ReadonlyMap<string, GLTFNodeTrackBinding> {
    const seen = new Map<string, SceneNode | null>();
    const bindings = new Map<string, GLTFNodeTrackBinding>();
    const mixerState = this.mixer.snapshot();
    const untracked = untrackedMixerStateBeforeUpdate || mixerState.actions.length !== this.mutableActions.size;
    for (const action of this.mutableActions.values()) {
      if (!activeBeforeUpdate.has(action) && !(action.playing && action.weight > 0)) continue;
      for (const track of action.clip.tracks) {
        const target = parseAnimationTarget(track.target);
        if (!target || target.kind !== "node" || !this.pendingValues.has(track.target)) continue;
        const node = this.runtime.animationNodeForTrack(track) ?? null;
        if (!seen.has(track.target)) seen.set(track.target, node);
        else if (seen.get(track.target) !== node) seen.set(track.target, null);
      }
    }
    for (const target of this.pendingValues.keys()) {
      const parsed = parseAnimationTarget(target);
      if (!parsed || parsed.kind !== "node") continue;
      const node = untracked ? null : seen.get(target);
      bindings.set(target, { publicTarget: target, ...(node ? { node } : {}) });
    }
    return bindings;
  }

  getAction(name: string): AnimationAction | undefined {
    this.assertAlive();
    assertUnambiguousClipName(name, this.duplicateClipNames);
    return this.actions.get(name);
  }

  snapshot(): GLTFSceneAnimationMixerSnapshot {
    this.assertAlive();
    return {
      ...this.runtime.snapshot(),
      mixerActionCount: this.actions.size,
      pendingValueCount: this.pendingValues.size,
      elapsedTime: this.elapsedTime,
      timeScale: this.mixer.timeScale,
      activeClipNames: this.actionSnapshots().filter((action) => action.active).map((action) => action.clipName),
      actions: this.actionSnapshots(),
      ...(this.lastApply ? { lastApply: this.lastApply } : {})
    };
  }

  /**
   * Capture strict core mixer/action state. Application listeners must be
   * unsubscribed and explicitly rebound to the new actor after restoration.
   */
  serialize(): GLTFSceneAnimationMixerSerializedState {
    this.assertAlive();
    this.runtime.assertSceneSerializationSupported();
    this.assertTrackedActions();
    if (!Number.isFinite(this.elapsedTime) || this.elapsedTime < 0 || Object.is(this.elapsedTime, -0) ||
        !Number.isFinite(this.eventOverflow) || this.eventOverflow < 0 || Object.is(this.eventOverflow, -0)) {
      throw new Error("glTF animation mixer contains non-serializable clock or overflow state.");
    }
    return {
      version: 1,
      elapsedTime: this.elapsedTime,
      eventOverflow: this.eventOverflow,
      pendingValues: [...this.pendingValues].map(([target, value]) => [target, cloneAnimationValue(value)] as const),
      mixer: this.mixer.serialize({ externalTarget: "rebind" })
    };
  }

  /**
   * Restore into a newly created binding, with matching clips and callbacks
   * already rebound. Scene-adapter rollback owns disposal if validation fails.
   */
  restore(state: GLTFSceneAnimationMixerSerializedState): this {
    this.assertAlive();
    this.runtime.assertSceneSerializationSupported();
    this.assertTrackedActions();
    if (!state || typeof state !== "object" || Array.isArray(state) ||
        Object.keys(state).sort().join(",") !== "elapsedTime,eventOverflow,mixer,pendingValues,version" ||
        state.version !== 1 || !Number.isFinite(state.elapsedTime) || state.elapsedTime < 0 ||
        !Number.isFinite(state.eventOverflow) || state.eventOverflow < 0 ||
        !Array.isArray(state.pendingValues) || !state.mixer?.state || state.mixer.state.version !== 1) {
      throw new Error("glTF animation mixer restore requires complete versioned state.");
    }
    const pending = new Map<string, AnimationValue>();
    for (const entry of state.pendingValues) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !entry[0] || pending.has(entry[0]) ||
          !isSerializableAnimationValue(entry[1])) {
        throw new Error("glTF animation mixer restore has invalid pending values.");
      }
      pending.set(entry[0], cloneAnimationValue(entry[1]));
    }
    if (this.mixer.snapshot().layers.length !== 0) {
      throw new Error("glTF animation mixer restore requires a fresh binding without layers.");
    }
    const actions = [...this.mutableActions.values()];
    if (!Array.isArray(state.mixer.layers) || !Array.isArray(state.mixer.state.layers) ||
        state.mixer.layers.length !== state.mixer.state.layers.length) {
      throw new Error("glTF animation mixer restore has invalid layer state.");
    }
    for (let index = 0; index < state.mixer.layers.length; index++) {
      const saved = state.mixer.layers[index]!;
      const membership = state.mixer.state.layers[index]!;
      if (!membership || !Array.isArray(membership.actionIndices)) throw new Error("glTF animation mixer restore has invalid layer membership.");
      const layer = new AnimationLayer(saved.name, { weight: saved.weight, additive: saved.additive, mask: saved.mask });
      for (const actionIndex of membership.actionIndices) {
        if (!Number.isSafeInteger(actionIndex) || actionIndex < 0 || !actions[actionIndex] || layer.actions.includes(actions[actionIndex]!)) {
          throw new Error("glTF animation mixer restore has invalid layer action.");
        }
        layer.add(actions[actionIndex]!);
      }
      this.mixer.addLayer(layer);
    }
    this.mixer.restore(state.mixer);
    this.elapsedTime = state.elapsedTime;
    this.eventOverflow = state.eventOverflow;
    this.pendingValues.clear();
    for (const [target, value] of pending) this.pendingValues.set(target, value);
    this.lastApply = undefined;
    return this;
  }

  private assertTrackedActions(): void {
    // AnimationMixer intentionally keeps its action list private. The binding
    // owns that mixer, and must detect externally added/replaced actions by
    // object identity, not merely by equal clip names or equal snapshots.
    const actions = (this.mixer as unknown as { readonly actions: readonly AnimationAction[] }).actions;
    const tracked = [...this.mutableActions.values()];
    if (!Array.isArray(actions) || actions.length !== tracked.length || actions.some((action, index) => action !== tracked[index])) {
      throw new Error("glTF animation mixer contains untracked or unsupported actions.");
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.mixer.dispose();
    this.runtime.dispose();
    this.mutableActions.clear();
    this.pendingValues.clear();
    this.lastApply = undefined;
    this.disposed = true;
  }

  private configureAction(action: AnimationAction, options: GLTFSceneAnimationPlayOptions): void {
    if (options.reset === true) {
      action.reset();
    }
    if (options.weight !== undefined) {
      if (options.fadeDuration !== undefined && options.fadeDuration > 0) {
        action.fadeTo(options.weight, options.fadeDuration);
      } else {
        action.setWeight(options.weight);
      }
    }
    if (options.timeScale !== undefined) {
      action.setTimeScale(options.timeScale);
    }
    if (options.loopMode !== undefined || options.repetitions !== undefined) {
      action.setLoop(options.loopMode ?? action.loopMode, options.repetitions);
    }
    if (options.clampWhenFinished !== undefined) action.clampWhenFinished = options.clampWhenFinished;
  }

  private resolveActions(name: string | undefined): readonly AnimationAction[] {
    return name === undefined ? [...this.actions.values()] : [this.requireAction(name)];
  }

  private actionSnapshots(): readonly GLTFSceneAnimationActionSnapshot[] {
    return [...this.actions.values()].map((action) => {
      const snapshot = action.snapshot();
      return {
        ...snapshot,
        active: snapshot.playing && !snapshot.paused && snapshot.weight > 0
      };
    });
  }

  private requireAction(name: string): AnimationAction {
    this.assertAlive();
    assertUnambiguousClipName(name, this.duplicateClipNames);
    const action = this.actions.get(name);
    if (!action) {
      throw new Error(`glTF animation action "${name}" was not found.`);
    }
    return action;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("glTF animation mixer binding has been disposed.");
  }
}

function isSerializableAnimationValue(value: unknown): value is AnimationValue {
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (typeof value === "string" || typeof value === "boolean") return true;
  return Array.isArray(value) && value.every((component) => typeof component === "number" && Number.isFinite(component) && !Object.is(component, -0));
}

export function createGLTFSceneAnimationMixer(options: GLTFSceneAnimationMixerOptions): GLTFSceneAnimationMixerBinding {
  return new GLTFSceneAnimationMixerBinding(options);
}

type GLTFAnimationTarget =
  | { readonly kind: "node"; readonly nodeName: string; readonly path: "translation" | "rotation" | "scale" | "weights" }
  | { readonly kind: "material"; readonly materialName: string; readonly leaf: string }
  | { readonly kind: "light"; readonly lightName: string; readonly leaf: string; readonly indexed?: true };

const TEXTURE_TRANSFORM_PREFIXES: Readonly<Record<string, string>> = {
  "pbrMetallicRoughness.baseColorTexture": "baseColor",
  "pbrMetallicRoughness.metallicRoughnessTexture": "metallicRoughness",
  normalTexture: "normal",
  occlusionTexture: "occlusion",
  emissiveTexture: "emissive"
};
const TEXTURE_TRANSFORM_LEAVES = Object.entries(TEXTURE_TRANSFORM_PREFIXES).flatMap(([prefix, slot]) =>
  (["offset", "scale", "rotation"] as const).map((component) => ({
    leaf: `${prefix}.extensions.KHR_texture_transform.${component}`,
    parameter: `u_${slot}Texture${component[0]!.toUpperCase()}${component.slice(1)}`,
    component
  }))
);

function textureTransformLeaf(leaf: string): (typeof TEXTURE_TRANSFORM_LEAVES)[number] | undefined {
  return TEXTURE_TRANSFORM_LEAVES.find((entry) => entry.leaf === leaf);
}

/**
 * Exact light and guarded material suffixes are split from the right to preserve dotted names.
 * Other pointer paths retain the existing first-dot name/leaf split.
 */
function parseAnimationTarget(target: string, nodes?: ReadonlyMap<string, unknown>): GLTFAnimationTarget | undefined {
  if (target.startsWith("light-index:")) {
    const match = /^light-index:(0|[1-9]\d*)\.(.+)$/.exec(target);
    return match ? { kind: "light", lightName: match[1]!, leaf: match[2]!, indexed: true } : undefined;
  }
  if (target.startsWith("light:")) {
    const rest = target.slice("light:".length);
    for (const leaf of ["intensity", "color", "range"] as const) {
      const suffix = `.${leaf}`;
      if (rest.endsWith(suffix) && rest.length > suffix.length) {
        return { kind: "light", lightName: rest.slice(0, -suffix.length), leaf };
      }
    }
  }
  if (target.startsWith("material:")) {
    const rest = target.slice("material:".length);
    for (const leaf of [
      "normalTexture.scale", "occlusionTexture.strength",
      "pbrMetallicRoughness.baseColorFactor",
      "pbrMetallicRoughness.metallicFactor",
      "pbrMetallicRoughness.roughnessFactor",
      "extensions.KHR_materials_emissive_strength.emissiveStrength",
      "extensions.KHR_materials_clearcoat.clearcoatFactor",
      "extensions.KHR_materials_clearcoat.clearcoatRoughnessFactor",
      "extensions.KHR_materials_specular.specularFactor",
      "extensions.KHR_materials_sheen.sheenRoughnessFactor",
      "extensions.KHR_materials_iridescence.iridescenceFactor",
      "extensions.KHR_materials_iridescence.iridescenceIor",
      ...TEXTURE_TRANSFORM_LEAVES.map((entry) => entry.leaf),
      "baseColorFactor", "emissiveFactor", "metallicFactor", "roughnessFactor",
      "emissiveStrength", "clearcoatFactor", "clearcoatRoughnessFactor"
    ]) {
      const suffix = `.${leaf}`;
      if (rest.endsWith(suffix) && rest.length > suffix.length) {
        return { kind: "material", materialName: rest.slice(0, -suffix.length), leaf };
      }
    }
  }
  for (const prefix of ["material:", "light:"] as const) {
    if (target.startsWith(prefix)) {
      const rest = target.slice(prefix.length);
      const separator = rest.indexOf(".");
      if (separator <= 0 || separator === rest.length - 1) return undefined;
      const name = rest.slice(0, separator);
      const leaf = rest.slice(separator + 1);
      return prefix === "material:"
        ? { kind: "material", materialName: name, leaf }
        : { kind: "light", lightName: name, leaf };
    }
  }
  const separator = target.lastIndexOf(".");
  if (separator <= 0 || separator === target.length - 1) {
    return undefined;
  }
  const leaf = target.slice(separator + 1);
  const path = leaf === "position" ? "translation" : leaf === "quaternion" ? "rotation" : leaf;
  if (path !== "translation" && path !== "rotation" && path !== "scale" && path !== "weights") {
    return undefined;
  }
  const rawNodeName = target.slice(0, separator);
  // glTF imports may contain literal backslashes, while authored binding
  // paths may escape dots or brackets. Prefer the literal node when both exist.
  const unescapedNodeName = rawNodeName.replace(/\\(.)/gu, "$1");
  const nodeName = nodes?.has(rawNodeName) ? rawNodeName : nodes?.has(unescapedNodeName) ? unescapedNodeName : rawNodeName;
  return {
    kind: "node",
    nodeName,
    path
  };
}

/**
 * Maps an animation-pointer material leaf path to the renderer uniform parameters it drives.
 * Only leaves with uniforms the production bridge provably writes (see TypedGLBActor tint
 * path: `u_baseColor`, `u_baseColorFactor`, `u_emissiveColor`, `u_emissiveFactor`,
 * `u_emissiveStrength`, `u_metallic`, `u_roughness`) are supported; guarded texture and
 * physical scalar and core texture-transform leaves require a sink that confirms the live
 * resource and applies atomically.
 * Other legacy leaves match on the last path segment for compatibility.
 */
function materialParametersForLeaf(leafPath: string): readonly string[] | undefined {
  const transform = textureTransformLeaf(leafPath);
  if (transform) return [transform.parameter];
  if (leafPath === "normalTexture.scale") return ["u_normalScale"];
  if (leafPath === "occlusionTexture.strength") return ["u_occlusionStrength"];
  if (leafPath === "extensions.KHR_materials_specular.specularFactor") return ["u_specularFactor"];
  if (leafPath === "extensions.KHR_materials_sheen.sheenRoughnessFactor") return ["u_sheenRoughnessFactor"];
  if (leafPath === "extensions.KHR_materials_iridescence.iridescenceFactor") return ["u_iridescenceFactor"];
  if (leafPath === "extensions.KHR_materials_iridescence.iridescenceIor") return ["u_iridescenceIor"];
  const leaf = leafPath.slice(leafPath.lastIndexOf(".") + 1);
  switch (leaf) {
    case "baseColorFactor":
      return ["u_baseColorFactor", "u_baseColor"];
    case "emissiveFactor":
      return ["u_emissiveFactor", "u_emissiveColor"];
    case "metallicFactor":
      return ["u_metallic"];
    case "roughnessFactor":
      return ["u_roughness"];
    case "emissiveStrength":
      return ["u_emissiveStrength"];
    case "clearcoatFactor":
      return ["u_clearcoatFactor"];
    case "clearcoatRoughnessFactor":
      return ["u_clearcoatRoughnessFactor"];
    default:
      return undefined;
  }
}

function isGuardedMaterialScalarLeaf(leafPath: string): boolean {
  return leafPath === "normalTexture.scale" || leafPath === "occlusionTexture.strength"
    || leafPath === "extensions.KHR_materials_specular.specularFactor"
    || leafPath === "extensions.KHR_materials_sheen.sheenRoughnessFactor"
    || leafPath === "extensions.KHR_materials_iridescence.iridescenceFactor"
    || leafPath === "extensions.KHR_materials_iridescence.iridescenceIor";
}

function validGuardedMaterialScalar(leafPath: string, value: number): boolean {
  if (!Number.isFinite(Math.fround(value))) return false;
  if (leafPath === "normalTexture.scale") return value >= 0;
  if (leafPath === "extensions.KHR_materials_iridescence.iridescenceIor") return value >= 1;
  return value >= 0 && value <= 1;
}

function isMaterialBindingFailure(value: unknown): value is GLTFSceneAnimationMaterialBindingFailure {
  return value === "missing-map" || value === "changed-map" || value === "disposed" || value === "ambiguous" || value === "unsupported";
}

/** Light leaves the runtime can drive on a live scene light. Anything else stays diagnostic-only. */
function lightLeafApplies(leaf: string): boolean {
  return leaf === "intensity" || leaf === "color" || leaf === "range";
}

function lightSupportsLeaf(light: Light, leaf: string): boolean {
  if (!lightLeafApplies(leaf)) return false;
  return leaf !== "range" || typeof (light as unknown as { readonly range?: unknown }).range === "number";
}

function resolveIKSkin(skins: readonly GLTFSkinAsset[], skinName: string | undefined): GLTFSkinAsset {
  if (skinName === undefined) {
    const matches = skins.filter((candidate) => candidate.jointNames.length >= 3);
    if (matches.length === 0) {
      throw new Error("glTF imported skeleton IK requires a skin with at least three joints.");
    }
    if (matches.length !== 1) throw new Error("glTF imported skeleton IK requires an unambiguous skin.");
    return matches[0]!;
  }
  const matches = skins.filter((candidate) => candidate.name === skinName);
  if (matches.length === 0) {
    throw new Error(`glTF imported skeleton IK skin "${skinName}" was not found.`);
  }
  if (matches.length !== 1) throw new Error(`glTF imported skeleton IK skin "${skinName}" is ambiguous.`);
  const skin = matches[0]!;
  if (skin.jointNames.length < 3) {
    throw new Error(`glTF imported skeleton IK skin "${skinName}" does not contain a two-bone chain.`);
  }
  return skin;
}

function firstTwoBoneJointChain(skin: GLTFSkinAsset): readonly [string, string, string] {
  const root = skin.jointNames[0];
  const mid = skin.jointNames[1];
  const end = skin.jointNames[2];
  if (!root || !mid || !end) {
    throw new Error(`glTF imported skeleton IK skin "${skin.name}" does not contain a two-bone chain.`);
  }
  return [root, mid, end];
}

/**
 * True when two foot-planting configs solve the same rig the same way. The world matrix is
 * deliberately excluded: the engine refreshes `worldFromLocal` every frame (time-animated
 * model nodes move) and that refresh must not reset world-space foot locks.
 */
function sameFootPlantingShape(
  previous: GLTFootPlantingConfig | undefined,
  next: GLTFootPlantingConfig | undefined
): boolean {
  if (previous === next) return true;
  if (!previous || !next) return false;
  if (previous.ground !== next.ground) return false;
  if (previous.ankleHeight !== next.ankleHeight) return false;
  if (previous.rayStartHeight !== next.rayStartHeight) return false;
  if (previous.maxRayDistance !== next.maxRayDistance) return false;
  if (previous.plantThreshold !== next.plantThreshold) return false;
  if (previous.hipDropFactor !== next.hipDropFactor) return false;
  if (previous.lockFootRotation !== next.lockFootRotation) return false;
  if (previous.legs.length !== next.legs.length) return false;
  return previous.legs.every((leg, index) => {
    const other = next.legs[index];
    return other !== undefined
      && leg.side === other.side
      && leg.hip === other.hip
      && leg.knee === other.knee
      && leg.ankle === other.ankle
      && leg.hipIndex === other.hipIndex
      && leg.kneeIndex === other.kneeIndex
      && leg.ankleIndex === other.ankleIndex
      && leg.ankleHeight === other.ankleHeight
      && (leg.pole ?? []).join(",") === (other.pole ?? []).join(",");
  });
}

function worldPosition(node: SceneNode): Vec3 {
  node.updateWorldTransform();
  return [node.transform.worldMatrix[12], node.transform.worldMatrix[13], node.transform.worldMatrix[14]];
}

function commonAncestor(nodes: readonly SceneNode[]): SceneNode | undefined {
  if (nodes.length === 0) return undefined;
  const first: SceneNode[] = [];
  for (let node: SceneNode | null = nodes[0]!; node; node = node.parent) first.push(node);
  return first.find(candidate => nodes.every(node => node === candidate || candidate.isAncestorOf(node)));
}

function orientJointToward(node: SceneNode, child: SceneNode, target: Vec3): void {
  node.updateWorldTransform();
  child.updateWorldTransform();
  const origin = worldPosition(node);
  const current = worldPosition(child);
  const from: Vec3 = [current[0]-origin[0], current[1]-origin[1], current[2]-origin[2]];
  const to: Vec3 = [target[0]-origin[0], target[1]-origin[1], target[2]-origin[2]];
  const delta = quatFromUnitVectors(from, to);
  const worldRotation = multiplyRigidQuat(delta, decomposeMat4(node.transform.worldMatrix).rotation);
  const parentRotation = node.parent ? decomposeMat4(node.parent.transform.worldMatrix).rotation : [0,0,0,1] as Quat;
  const localRotation = multiplyRigidQuat(invertRigidQuat(parentRotation), worldRotation);
  node.transform.setRotation(localRotation[0], localRotation[1], localRotation[2], localRotation[3]);
}

function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const fl=Math.hypot(...from), tl=Math.hypot(...to);
  if (!(fl>1e-12) || !(tl>1e-12)) return [0,0,0,1];
  const fx=from[0]/fl,fy=from[1]/fl,fz=from[2]/fl,tx=to[0]/tl,ty=to[1]/tl,tz=to[2]/tl;
  const dot=fx*tx+fy*ty+fz*tz;
  if (dot < -0.999999) {
    const axis=Math.abs(fx)>0.1?[-fz,0,fx] as Vec3:[0,fz,-fy] as Vec3;
    const length=Math.hypot(...axis);
    return [axis[0]/length,axis[1]/length,axis[2]/length,0];
  }
  if (dot > 0.999999) return [0,0,0,1];
  return normalizeQuaternion([fy*tz-fz*ty,fz*tx-fx*tz,fx*ty-fy*tx,1+dot]);
}

function multiplyRigidQuat(a: Quat,b: Quat): Quat {
  return normalizeQuaternion([a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]);
}
function invertRigidQuat(q:Quat):Quat { return [-q[0],-q[1],-q[2],q[3]]; }
function normalizeQuaternion(q:Quat):Quat { const n=Math.hypot(...q); return n>0?[q[0]/n,q[1]/n,q[2]/n,q[3]/n]:[0,0,0,1]; }

function setWorldPosition(node: SceneNode, position: readonly [number, number, number]): void {
  const local = node.parent
    ? transformPoint(invertMat4(node.parent.transform.worldMatrix), [position[0], position[1], position[2]])
    : [position[0], position[1], position[2]] as Vec3;
  node.transform.setPosition(local[0], local[1], local[2]);
}

function applyTransformValue(node: SceneNode, path: "translation" | "rotation" | "scale", value: AnimationValue, target: string): void {
  if (path === "translation") {
    const vector = asVec3(value, target);
    node.transform.setPosition(vector[0], vector[1], vector[2]);
    return;
  }
  if (path === "rotation") {
    const quat = asQuat(value, target);
    node.transform.setRotation(quat[0], quat[1], quat[2], quat[3]);
    return;
  }
  const vector = asVec3(value, target);
  node.transform.setScale(vector[0], vector[1], vector[2]);
}

function asVec3(value: AnimationValue, target: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some((component) => typeof component !== "number" || !Number.isFinite(component))) {
    throw new Error(`glTF animation track "${target}" sampled an invalid vec3.`);
  }
  return [value[0], value[1], value[2]];
}

function asQuat(value: AnimationValue, target: string): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4 || value.some((component) => typeof component !== "number" || !Number.isFinite(component))) {
    throw new Error(`glTF animation track "${target}" sampled an invalid quaternion.`);
  }
  return [value[0], value[1], value[2], value[3]];
}

function toVec3Tuple(
  value: readonly [number, number, number] | { readonly x: number; readonly y: number; readonly z: number },
  target: string
): [number, number, number] {
  const tuple = Array.isArray(value)
    ? value
    : [(value as { x: number }).x, (value as { y: number }).y, (value as { z: number }).z];
  if (tuple.length !== 3 || tuple.some((component) => typeof component !== "number" || !Number.isFinite(component))) {
    throw new Error(`glTF pose "${target}" requires a finite vec3.`);
  }
  return [tuple[0]!, tuple[1]!, tuple[2]!];
}

function toQuatTuple(
  value: readonly [number, number, number, number] | { readonly x: number; readonly y: number; readonly z: number; readonly w: number },
  target: string
): [number, number, number, number] {
  const tuple = Array.isArray(value)
    ? value
    : [(value as { x: number }).x, (value as { y: number }).y, (value as { z: number }).z, (value as { w: number }).w];
  if (tuple.length !== 4 || tuple.some((component) => typeof component !== "number" || !Number.isFinite(component))) {
    throw new Error(`glTF pose "${target}" requires a finite quaternion.`);
  }
  return [tuple[0]!, tuple[1]!, tuple[2]!, tuple[3]!];
}

function asNumberArray(value: AnimationValue): number[] {
  if (!Array.isArray(value) || value.some((component) => typeof component !== "number" || !Number.isFinite(component))) {
    throw new Error("glTF morph-weight animation sampled an invalid number array.");
  }
  return [...value];
}

function asScalar(value: AnimationValue, target: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`glTF animation track "${target}" sampled an invalid scalar.`);
  }
  return value;
}

function asTextureTransformValue(value: AnimationValue, target: string, component: "offset" | "scale" | "rotation"): number | readonly [number, number] {
  if (component === "rotation") {
    const scalar = asScalar(value, target);
    if (!Number.isFinite(Math.fround(scalar))) throw new RangeError(`glTF animation track "${target}" sampled an out-of-range texture rotation.`);
    return scalar;
  }
  if (!Array.isArray(value) || value.length !== 2 || value.some((entry) =>
    typeof entry !== "number" || !Number.isFinite(entry) || !Number.isFinite(Math.fround(entry)))) {
    throw new Error(`glTF animation track "${target}" sampled an invalid texture transform vec2.`);
  }
  return [value[0], value[1]];
}

function asPositiveScalar(value: AnimationValue, target: string): number {
  const scalar = asScalar(value, target);
  if (!(scalar > 0)) {
    throw new Error(`glTF animation track "${target}" sampled a non-positive range.`);
  }
  return scalar;
}

function asMaterialLeafValue(value: AnimationValue, target: string): number | readonly number[] {
  if (typeof value === "number") return asScalar(value, target);
  if (Array.isArray(value)) return asNumberArray(value);
  throw new Error(`glTF animation track "${target}" sampled an invalid material value.`);
}

function sampleClipTracks(
  clip: AnimationClip,
  time: number,
  weight: number,
  additive: boolean,
  resolveNodeTrack?: (track: AnimationTrack) => { readonly sampleTarget: string; readonly binding: GLTFNodeTrackBinding } | undefined
): GLTFSampledAnimationTargets {
  const accumulators = new Map<string, TargetAccumulator>();
  const unsupportedTracks: string[] = [];
  const lightTrackIdentities = new Map<string, GLTFLightTrackIdentity>();
  const nodeTrackBindings = new Map<string, GLTFNodeTrackBinding>();
  for (const track of clip.tracks) {
    const identity = getGLTFLightAnimationTrackIdentity(track);
    const publicTarget = identity?.publicTarget ?? track.target;
    if (!parseAnimationTarget(publicTarget)) {
      unsupportedTracks.push(publicTarget);
      continue;
    }
    const nodeTrack = identity ? undefined : resolveNodeTrack?.(track);
    const sampleTarget = nodeTrack?.sampleTarget ?? identity?.sampleTarget ?? track.target;
    if (nodeTrack) nodeTrackBindings.set(sampleTarget, nodeTrack.binding);
    if (identity) lightTrackIdentities.set(sampleTarget, identity);
    blendInto(accumulators, sampleTarget, track.valueType, track.sample(time), weight, additive);
  }
  const sampledTargets = new Map<string, AnimationValue>();
  for (const [target, accumulator] of accumulators) {
    sampledTargets.set(target, finalizeTargetBlend(accumulator));
  }
  return { sampledTargets, unsupportedTracks, lightTrackIdentities, nodeTrackBindings };
}

function blendInto(
  accumulators: Map<string, TargetAccumulator>,
  target: string,
  type: TrackValueType,
  value: AnimationValue,
  weight: number,
  additive: boolean
): void {
  if (weight <= 0) return;
  const current = accumulators.get(target);
  if (!current) {
    const accumulator: TargetAccumulator = { type };
    if (additive) {
      accumulator.additive = additiveContribution(type, value, weight);
    } else {
      accumulator.base = { value: cloneAnimationValue(value), weight, type };
    }
    accumulators.set(target, accumulator);
    return;
  }
  if (current.type !== type) {
    throw new Error(`Cannot blend ${type} glTF animation track into existing ${current.type} target ${target}.`);
  }
  if (additive) {
    current.additive = current.additive === undefined
      ? additiveContribution(type, value, weight)
      : combineAdditive(type, current.additive, value, weight);
    return;
  }
  if (!current.base) {
    current.base = { value: cloneAnimationValue(value), weight, type };
    return;
  }
  blendBase(current.base, type, value, weight);
}

function blendBase(current: WeightedAccumulator, type: TrackValueType, value: AnimationValue, weight: number): void {
  const total = current.weight + weight;
  const t = weight / total;
  if (type === "scalar") {
    current.value = (current.value as number) + ((value as number) - (current.value as number)) * t;
  } else if (type === "vector3") {
    const a = current.value as [number, number, number];
    const b = value as [number, number, number];
    current.value = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  } else if (type === "quaternion") {
    current.value = slerpQuat(current.value as [number, number, number, number], value as [number, number, number, number], t);
  } else if (type === "number-array") {
    const a = current.value as readonly number[];
    const b = value as readonly number[];
    if (a.length !== b.length) {
      throw new Error("Cannot blend glTF morph animation values with different lengths.");
    }
    current.value = a.map((component, index) => component + (b[index]! - component) * t);
  } else {
    current.value = cloneAnimationValue(value);
  }
  current.weight = total;
}

function finalizeTargetBlend(accumulator: TargetAccumulator): AnimationValue {
  const base = accumulator.base
    ? finalizeBaseBlend(accumulator.base)
    : accumulator.additive !== undefined
      ? additiveNeutral(accumulator.type, accumulator.additive)
      : undefined;
  if (base === undefined) {
    throw new Error("glTF animation target accumulator has no sampled value.");
  }
  return accumulator.additive === undefined ? base : applyAdditive(accumulator.type, base, accumulator.additive);
}

function finalizeBaseBlend(accumulator: WeightedAccumulator): AnimationValue {
  return accumulator.type === "quaternion"
    ? normalizeQuat(accumulator.value as [number, number, number, number])
    : cloneAnimationValue(accumulator.value);
}

function additiveContribution(type: TrackValueType, value: AnimationValue, weight: number): AnimationValue {
  if (type === "scalar") return (value as number) * weight;
  if (type === "vector3") {
    const vector = value as [number, number, number];
    return [vector[0] * weight, vector[1] * weight, vector[2] * weight];
  }
  if (type === "number-array") {
    return (value as readonly number[]).map((component) => component * weight);
  }
  if (type === "quaternion") {
    return slerpQuat([0, 0, 0, 1], normalizeQuat(value as [number, number, number, number]), weight);
  }
  throw new Error("Additive glTF animation layers require scalar, vector3, quaternion, or number-array tracks.");
}

function combineAdditive(type: TrackValueType, current: AnimationValue, value: AnimationValue, weight: number): AnimationValue {
  return applyAdditive(type, current, additiveContribution(type, value, weight));
}

function applyAdditive(type: TrackValueType, base: AnimationValue, delta: AnimationValue): AnimationValue {
  if (type === "scalar") return (base as number) + (delta as number);
  if (type === "vector3") {
    const a = base as [number, number, number];
    const b = delta as [number, number, number];
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  if (type === "number-array") {
    const a = base as readonly number[];
    const b = delta as readonly number[];
    if (a.length !== b.length) {
      throw new Error("Cannot add glTF morph animation values with different lengths.");
    }
    return a.map((component, index) => component + b[index]!);
  }
  if (type === "quaternion") {
    return normalizeQuat(multiplyQuat(base as [number, number, number, number], delta as [number, number, number, number]));
  }
  throw new Error("Additive glTF animation layers require scalar, vector3, quaternion, or number-array tracks.");
}

function additiveNeutral(type: TrackValueType, value: AnimationValue): AnimationValue {
  if (type === "scalar") return 0;
  if (type === "vector3") return [0, 0, 0];
  if (type === "number-array") return (value as readonly number[]).map(() => 0);
  if (type === "quaternion") return [0, 0, 0, 1];
  throw new Error("Additive glTF animation layers require scalar, vector3, quaternion, or number-array tracks.");
}

function cloneAnimationValue(value: AnimationValue): AnimationValue {
  return Array.isArray(value) ? [...value] : value;
}

function multiplyQuat(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

/**
 * T0.6/T0.7 (PRD-06) — a clip "has a root-motion candidate" when a translation
 * track on a hips/root-named target nets more than 5 cm of XZ displacement
 * between its first and last keyframes.
 */
function clipHasRootMotionCandidate(clip: AnimationClip): boolean {
  for (const track of clip.tracks) {
    const target = parseAnimationTarget(track.target);
    if (target?.kind !== "node" || target.path !== "translation") continue;
    if (!/hips|root|pelvis/i.test(target.nodeName)) continue;
    const keys = track.keyframes ?? [];
    if (keys.length < 2) continue;
    const first = vec3OfKeyframeValue(keys[0]!.value);
    const last = vec3OfKeyframeValue(keys[keys.length - 1]!.value);
    if (!first || !last) continue;
    const dx = last[0] - first[0];
    const dz = last[2] - first[2];
    if (Math.hypot(dx, dz) > 0.05) return true;
  }
  return false;
}

function vec3OfKeyframeValue(value: unknown): [number, number, number] | undefined {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const arr = value as ArrayLike<number>;
    if (arr.length >= 3) return [arr[0]!, arr[1]!, arr[2]!];
    return undefined;
  }
  if (value && typeof value === "object") {
    const v = value as { x?: number; y?: number; z?: number };
    if (typeof v.x === "number" && typeof v.z === "number") return [v.x, v.y ?? 0, v.z];
  }
  return undefined;
}
