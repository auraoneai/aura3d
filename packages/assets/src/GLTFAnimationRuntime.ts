import { AnimationAction, AnimationClip, AnimationMixer, consumeRootMotion, extractRootMotion, createFootIkRig, type RootMotionConsumption, type RootMotionSample, normalizeQuat, slerpQuat, solveTwoBoneIk, type AnimationEvent, type AnimationMixerOptions, type AnimationValue, type FootIkRig, type GroundRaycaster, type LoopMode, type TrackValueType, type TwoBoneIkResult } from "@aura3d/animation";
import { bindSkeleton, compileClip, createPoseBuffer, makeClipAdditive, PoseMixer, type CompiledClip, type PoseBuffer, type PoseSampleSpec, type SkeletonBinding } from "@aura3d/animation/lanes";
import { AURA3D_RETARGET_ENGINE_VERSION, bakeClipsInWorker, bakeRetargetedClipMap, createRetargetWorker, decompileCompiledClip, readRetargetCache, retargetCacheKey, retargetClipsHash, retargetSkeletonHash, writeRetargetCache, type BakeRetargetedClipsOptions } from "@aura3d/animation/lanes";
import { composeMat4, decomposeMat4, invertMat4, MAX_RENDERABLE_SKINNING_JOINTS, multiplyMat4, Renderable, Scene, transformPoint, type Light, type Mat4, type Quat, type SceneNode, type Vec3 } from "@aura3d/scene";
import type { GLTFAsset, GLTFMeshAsset, GLTFSkinAsset } from "./GLTFLoader";

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

export interface GLTFSceneAnimationMaterialSink {
  readonly name: string;
  setAnimationParameter(parameter: string, value: number | readonly number[]): void;
}

export interface GLTFSceneAnimationRuntimeOptions {
  readonly scene: Scene;
  readonly clips: readonly AnimationClip[];
  readonly asset?: Pick<GLTFAsset, "meshes" | "skins">;
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
  readonly animatesSkeleton: boolean;
}

export interface GLTFSceneAnimationMixerOptions extends GLTFSceneAnimationRuntimeOptions {
  readonly autoPlay?: string | false;
  readonly mixer?: AnimationMixerOptions;
  /** Called once per blended update; owns actor movement before foot placement. */
  readonly consumeRootMotion?: (sample: RootMotionSample) => void;
}

export interface GLTFSceneAnimationMixerUpdateResult {
  readonly events: readonly AnimationEvent[];
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

export interface GLTFSceneAnimationPlayOptions {
  readonly weight?: number;
  readonly timeScale?: number;
  readonly loopMode?: LoopMode;
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
      ...(this.lastResult === undefined ? {} : { lastResult: this.lastResult })
    };
  }
}

interface RuntimeSkinningBinding {
  readonly node: SceneNode;
  readonly renderable: Renderable;
  readonly mesh: GLTFMeshAsset;
  readonly skin: GLTFSkinAsset;
  readonly bindWorldMatrix: Mat4;
  /**
   * PRD-06 T0.11: the persistent joint palette buffer — allocated once at bind,
   * written in place every frame. The binding object itself is also the C-18
   * `paletteKey` (stable per skin instance for the actor runtime's lifetime).
   */
  readonly paletteMatrices: Float32Array;
}

type WeightedAccumulator = { value: AnimationValue; weight: number; type: TrackValueType };
type TargetAccumulator = { type: TrackValueType; base?: WeightedAccumulator; additive?: AnimationValue };

/** Column-major mat4 multiply written into a Float32Array slot — the T0.11 no-alloc palette path. */
function multiplyMat4Into(out: Float32Array, outOffset: number, a: ArrayLike<number>, b: ArrayLike<number>): void {
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[outOffset + col * 4 + row] =
        a[0 * 4 + row]! * b[col * 4 + 0]! +
        a[1 * 4 + row]! * b[col * 4 + 1]! +
        a[2 * 4 + row]! * b[col * 4 + 2]! +
        a[3 * 4 + row]! * b[col * 4 + 3]!;
    }
  }
}

export class GLTFSceneAnimationRuntime {
  private readonly clipsByName = new Map<string, AnimationClip>();
  private readonly nodesByName = new Map<string, SceneNode[]>();
  private readonly morphRenderablesByNodeName = new Map<string, Renderable[]>();
  private readonly skinningBindings: RuntimeSkinningBinding[] = [];
  private readonly footBindMatrices = new Map<string, { world: Mat4; local: Mat4 }>();
  private readonly footOrientationLocks = new Map<string, Mat4>();
  private readonly footDescendantLocks = new Map<string, Map<string, Mat4>>();
  private readonly footSurfaceVertices = new Map<string, readonly number[]>();
  private footPlanting: GLTFootPlantingConfig | undefined;
  private footRig: FootIkRig | undefined;
  private lastApply?: GLTFSceneAnimationApplyResult;
  /** T0.11 scratch for the per-joint palette multiply (inverseMeshWorld * jointWorld). */
  private readonly paletteScratch = new Float32Array(16);
  /**
   * T1.7 (PRD-06) — the per-runtime pose pipeline backing `applyClips`: a
   * scene-wide SkeletonBinding (every traversed node in order, rest pose = the
   * node's local TRS at bind time), one PoseMixer, and the compiled clips.
   * Rebuilt whenever `reindexScene` re-reads the node set.
   */
  private poseState?: {
    readonly binding: SkeletonBinding;
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
    for (const clip of options.clips) {
      this.clipsByName.set(clip.name, clip);
    }
    this.reindexScene();
    if (options.footPlanting) this.setFootPlanting(options.footPlanting);
  }

  /**
   * Enable, replace, or clear (undefined) the foot-planting post-pass. Replacing the leg
   * set, ground, or solve parameters resets foot-lock state so a stale lock can never drag
   * a foot after retargeting. A matrix-only refresh (same shape, new `worldFromLocal`)
   * keeps locks: the engine re-sends the model matrix every frame because time-animated
   * model nodes move, and world-space locks stay valid across that refresh.
   */
  setFootPlanting(config: GLTFootPlantingConfig | undefined): void {
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
    const names: string[] = [];
    let maxTime = 0;
    // Finish validation and sampling before the physical authority can mutate the actor.
    for (const sample of samples) {
      const clip = this.clipsByName.get(sample.clipName);
      if (!clip) throw new Error(`glTF animation clip "${sample.clipName}" was not found.`);
      const weight = sample.weight ?? 1;
      if (!Number.isFinite(weight) || weight < 0) throw new Error("glTF root motion blend weight must be finite and non-negative.");
      const extracted = extractRootMotion(clip, sample);
      if (weight === 0) continue;
      const time = sample.loop && clip.duration > 0
        ? ((sample.toTime % clip.duration) + clip.duration) % clip.duration
        : Math.max(0, Math.min(clip.duration, sample.toTime));
      maxTime = Math.max(maxTime, time);
      names.push(`${clip.name}@${time}x${weight}${sample.additive ? "+add" : ""}`);
      blendInto(motionAccumulators, "motion", "vector3", extracted.delta, weight, sample.additive === true);
      for (const track of clip.tracks) {
        if (!parseAnimationTarget(track.target)) {
          unsupportedTracks.push(track.target);
          continue;
        }
        // Consume each clip's own root before blending, including additive root tracks.
        const value = track.sample(track.target === sample.target ? 0 : time);
        blendInto(accumulators, track.target, track.valueType, value, weight, sample.additive === true);
      }
    }
    const values = new Map<string, AnimationValue>();
    for (const [target, accumulator] of accumulators) values.set(target, finalizeTargetBlend(accumulator));
    const motionAccumulator = motionAccumulators.get("motion");
    const delta = motionAccumulator ? finalizeTargetBlend(motionAccumulator) as readonly [number, number, number] : [0, 0, 0] as const;
    const motion = consumeRootMotion({ target: "blend", fromTime: 0, toTime: maxTime, looped: samples.some(sample => sample.loop), delta }, options.worldFromLocal, options.move);
    this.lastApply = this.applySampledTargets(`root-motion:${names.join(",")}`, maxTime, { sampledTargets: values, unsupportedTracks }, samples.length);
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
    const clip = this.clipsByName.get(clipName);
    if (!clip) throw new Error(`glTF animation clip "${clipName}" was not found.`);
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
    const clip = this.clipsByName.get(clipName);
    if (!clip) throw new Error(`glTF animation clip "${clipName}" was not found.`);
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
    const clip = this.clipsByName.get(name);
    if (!clip) {
      throw new Error(`glTF animation clip "${name}" was not found.`);
    }
    return this.applyClip(clip, time);
  }

  /** Names of every clip registered on this runtime, in declaration order. */
  clipNames(): readonly string[] {
    return [...this.clipsByName.keys()];
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
    return [...this.clipsByName.values()].map((clip) => ({
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
    return resolveGLTFClipName(name, this.clipNames(), options);
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
    if (!Number.isFinite(time) || time < 0) {
      throw new Error("glTF animation runtime time must be finite and non-negative.");
    }
    const wrappedTime = clip.duration > 0 && time > clip.duration ? time % clip.duration : Math.min(time, clip.duration);
    this.lastApply = this.applySampledTargets(clip.name, wrappedTime, sampleClipTracks(clip, wrappedTime, 1, false));
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
    if (samples.length === 0) {
      throw new Error("glTF animation runtime blend requires at least one clip sample.");
    }
    const accumulators = new Map<string, TargetAccumulator>();
    const unsupportedTracks: string[] = [];
    let maxTime = 0;
    const names: string[] = [];

    const pose = this.poseRuntime();
    const poseSpecs: PoseSampleSpec[] = [];
    const touchedBones = new Set<number>();
    const maskWeights = new Map<GLTFSceneAnimationClipBoneMask, Float32Array>();

    for (const sample of samples) {
      const clip = this.clipsByName.get(sample.clipName);
      if (!clip) {
        throw new Error(`glTF animation clip "${sample.clipName}" was not found.`);
      }
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

      let bindsNodes = false;
      for (const track of clip.tracks) {
        const target = parseAnimationTarget(track.target);
        if (!target) {
          unsupportedTracks.push(track.target);
          continue;
        }
        if (target.kind === "node" && target.path !== "weights") {
          // Node TRS: pose path when the name binds and the mask allows it.
          const boneIndices = pose.binding.jointIndicesByName.get(target.nodeName);
          if (boneIndices !== undefined && boneIndices.length > 0 && clipMaskAllowsNode(sample.mask, target.nodeName)) {
            bindsNodes = true;
            touchedBones.add(boneIndices[0]!);
          } else if (boneIndices === undefined) {
            // Track points at a node absent from the scene — legacy path so
            // `missingTargets` reporting is unchanged.
            blendInto(accumulators, track.target, track.valueType, track.sample(wrappedTime), weight, sample.additive === true);
          }
          continue;
        }
        blendInto(accumulators, track.target, track.valueType, track.sample(wrappedTime), weight, sample.additive === true);
      }
      if (bindsNodes) {
        let mask: Float32Array | null = null;
        if (sample.mask !== undefined) {
          let cached = maskWeights.get(sample.mask);
          if (cached === undefined) {
            cached = new Float32Array(pose.binding.boneCount);
            for (let i = 0; i < pose.binding.boneCount; i += 1) {
              cached[i] = clipMaskAllowsNode(sample.mask, pose.binding.jointNames[i]!) ? 1 : 0;
            }
            maskWeights.set(sample.mask, cached);
          }
          mask = cached;
        }
        poseSpecs.push({ clipName: clip.name, time: wrappedTime, weight, additive: sample.additive === true, mask });
      }
    }

    const sampledTargets = new Map<string, AnimationValue>();
    if (poseSpecs.length > 0) {
      pose.mixer.evaluateSamples(poseSpecs, pose.pose);
      // T3.5 — constraints apply to the freshly-mixed pose before palette
      // build; touched joints union into the emitted sampled targets. Their
      // dynamics (look-at half-life, spring substeps) integrate in wall-clock
      // seconds, so measure the real gap between applies — a hardcoded 1/60
      // makes smoothing converge ~6× too slowly in sub-60fps sessions.
      const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      const constraintDt = this.lastConstraintEvalAtMs === undefined
        ? 1 / 60
        : Math.min(0.25, Math.max(1e-4, (nowMs - this.lastConstraintEvalAtMs) / 1000));
      this.lastConstraintEvalAtMs = nowMs;
      const constrained = this.runPoseConstraints(pose.pose, pose.binding, constraintDt);
      for (const boneIndex of constrained) touchedBones.add(boneIndex);
      for (const boneIndex of touchedBones) {
        const name = pose.binding.jointNames[boneIndex]!;
        const p = boneIndex * 3;
        const q = boneIndex * 4;
        sampledTargets.set(`${name}.translation`, [pose.pose.positions[p]!, pose.pose.positions[p + 1]!, pose.pose.positions[p + 2]!]);
        sampledTargets.set(`${name}.rotation`, [pose.pose.rotations[q]!, pose.pose.rotations[q + 1]!, pose.pose.rotations[q + 2]!, pose.pose.rotations[q + 3]!]);
        sampledTargets.set(`${name}.scale`, [pose.pose.scales[p]!, pose.pose.scales[p + 1]!, pose.pose.scales[p + 2]!]);
      }
    }
    for (const [target, accumulator] of accumulators) {
      sampledTargets.set(target, finalizeTargetBlend(accumulator));
    }

    this.lastApply = this.applySampledTargets(
      `blend:${names.join(",")}`,
      maxTime,
      { sampledTargets, unsupportedTracks },
      samples.length
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
    const engineVersion = options.engineVersion ?? AURA3D_RETARGET_ENGINE_VERSION;
    const sourceHash = `${retargetSkeletonHash(sourceSkeleton)}:${retargetClipsHash(sourceClips)}`;
    const targetHash = retargetSkeletonHash(pose.binding);
    const key = retargetCacheKey(engineVersion, sourceHash, targetHash);
    let baked = options.cache === false ? undefined : await readRetargetCache(key);
    if (baked === undefined) {
      const bakeOptions: BakeRetargetedClipsOptions = {
        ...(options.map !== undefined ? { map: options.map } : {}),
        hipsScale: options.hipsScale ?? "leg-length",
        ...(options.fingers !== undefined ? { fingers: options.fingers } : {}),
        ...(options.retarget !== undefined ? { retarget: options.retarget } : {})
      };
      const worker = options.worker === false ? undefined : createRetargetWorker();
      baked = worker !== undefined
        ? await bakeClipsInWorker(worker, {
            sourceSkeleton,
            targetSkeleton: pose.binding,
            clips: sourceClips,
            options: bakeOptions
          })
        : bakeRetargetedClipMap({ skeleton: sourceSkeleton, clips: sourceClips }, pose.binding, bakeOptions);
      if (options.cache !== false) void writeRetargetCache(key, baked);
    }
    const names: string[] = [];
    for (const [name, compiled] of baked) {
      const raw = decompileCompiledClip(name, compiled);
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
    const pose = this.poseRuntime();
    pose.mixer.update(dt);
    pose.mixer.evaluate(pose.pose);
    // T3.5 — constraints evaluate post-mixer / pre-palette; their touched
    // bones union into `covered` so the write-back emits them.
    this.lastConstraintEvalAtMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const constrained = this.runPoseConstraints(pose.pose, pose.binding, dt);

    const actions = pose.mixer.activeActions();
    let covered: ReadonlySet<number> | undefined;
    if (options?.restPoseReset === false) {
      const set = new Set<number>();
      for (const action of actions) {
        for (const binding of action.bindings) set.add(binding.boneIndex);
      }
      for (const boneIndex of constrained) set.add(boneIndex);
      covered = set;
    }
    // `covered === undefined` already emits every bound bone below — the
    // constraint union matters only on the covered path.

    const sampledTargets = new Map<string, AnimationValue>();
    const writeBone = (boneIndex: number): void => {
      const name = pose.binding.jointNames[boneIndex]!;
      const p = boneIndex * 3;
      const q = boneIndex * 4;
      sampledTargets.set(`${name}.translation`, [pose.pose.positions[p]!, pose.pose.positions[p + 1]!, pose.pose.positions[p + 2]!]);
      sampledTargets.set(`${name}.rotation`, [pose.pose.rotations[q]!, pose.pose.rotations[q + 1]!, pose.pose.rotations[q + 2]!, pose.pose.rotations[q + 3]!]);
      sampledTargets.set(`${name}.scale`, [pose.pose.scales[p]!, pose.pose.scales[p + 1]!, pose.pose.scales[p + 2]!]);
    };
    if (covered === undefined) {
      for (let i = 0; i < pose.binding.boneCount; i += 1) writeBone(i);
    } else {
      for (const boneIndex of covered) writeBone(boneIndex);
    }

    // Legacy accumulator path for every track the pose binding does not
    // cover — sampled at each action's clock and effective weight, in active
    // action order (same semantics as `applyClips`' per-sample partition).
    const accumulators = new Map<string, TargetAccumulator>();
    const unsupportedTracks: string[] = [];
    for (const action of actions) {
      const source = this.clipsByName.get(action.clipName);
      if (source === undefined) continue;
      for (const track of source.tracks) {
        const target = parseAnimationTarget(track.target);
        if (target === undefined) {
          unsupportedTracks.push(track.target);
          continue;
        }
        if (target.kind === "node" && target.path !== "weights") {
          const boneIndices = pose.binding.jointIndicesByName.get(target.nodeName);
          if (boneIndices !== undefined && boneIndices.length > 0) continue; // bound → mixer path
        }
        blendInto(accumulators, track.target, track.valueType, track.sample(action.time), action.effectiveWeight, action.additive);
      }
    }
    for (const [target, accumulator] of accumulators) {
      sampledTargets.set(target, finalizeTargetBlend(accumulator));
    }

    const active = actions.filter((action) => action.effectiveWeight > 0);
    this.lastApply = this.applySampledTargets(
      `mixer:${options?.label ?? (actions.map((action) => action.clipName).join("+") || "idle")}`,
      active[0]?.time ?? 0,
      { sampledTargets, unsupportedTracks },
      actions.length > 0 ? actions.length : undefined
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
   * return the union of touched joint indices (empty when no constraints).
   */
  private runPoseConstraints(pose: PoseBuffer, binding: SkeletonBinding, dt: number): Set<number> {
    const touched = new Set<number>();
    const constraints = this.poseState?.constraints;
    if (constraints === undefined || constraints.length === 0) return touched;
    const modelMatrix = this.poseConstraintModelMatrix?.() ?? this.options.scene.root.transform.worldMatrix;
    for (const constraint of constraints) {
      constraint.evaluate(pose, binding, modelMatrix, { dt });
      for (const bone of constraint.bones) touched.add(bone);
    }
    return touched;
  }

  private poseRuntime(): { readonly binding: SkeletonBinding; readonly mixer: PoseMixer; readonly compiled: Map<string, CompiledClip>; readonly pose: PoseBuffer; constraints: GLTFPoseConstraint[] } {
    if (this.poseState === undefined) {
      const nodes: SceneNode[] = [];
      this.options.scene.traverse((node) => nodes.push(node));
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
      const mixer = new PoseMixer({ skeleton: binding });
      const compiled = new Map<string, CompiledClip>();
      for (const [name, clip] of this.clipsByName) {
        const compiledClip = compileClip(clip);
        compiled.set(name, compiledClip);
        mixer.addCompiledClip(name, compiledClip, clip);
      }
      this.poseState = { binding, mixer, compiled, pose: createPoseBuffer(binding.boneCount), constraints: [] };
    }
    return this.poseState;
  }

  applyAnimationValues(
    label: string,
    time: number,
    values: ReadonlyMap<string, AnimationValue>,
    unsupportedTracks: readonly string[] = []
  ): GLTFSceneAnimationApplyResult {
    if (label.trim().length === 0) {
      throw new Error("glTF animation runtime value application label cannot be empty.");
    }
    if (!Number.isFinite(time) || time < 0) {
      throw new Error("glTF animation runtime value application time must be finite and non-negative.");
    }
    this.lastApply = this.applySampledTargets(label, time, {
      sampledTargets: values,
      unsupportedTracks
    });
    return this.lastApply;
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
    const jointNames = options.jointNames ?? firstTwoBoneJointChain(skin);
    const [rootName, midName, endName] = jointNames;
    this.options.scene.updateWorldTransforms();
    const rootNode = this.nodesByName.get(rootName)?.[0];
    const midNode = this.nodesByName.get(midName)?.[0];
    const endNode = this.nodesByName.get(endName)?.[0];
    const missingTargets = [
      ...(!rootNode ? [`${skin.name}.${rootName}`] : []),
      ...(!midNode ? [`${skin.name}.${midName}`] : []),
      ...(!endNode ? [`${skin.name}.${endName}`] : [])
    ];
    if (!rootNode || !midNode || !endNode) {
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
      ...(options.jointNames === undefined ? {} : { jointNames: options.jointNames })
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
    return {
      clipCount: this.clipsByName.size,
      nodeTargetCount: this.nodesByName.size,
      morphTargetNodeCount: this.morphRenderablesByNodeName.size,
      skinningBindingCount: this.skinningBindings.length,
      clips: [...this.clipsByName.keys()],
      ...(this.lastApply ? { lastApply: this.lastApply } : {})
    };
  }

  inspectClipBindings(name?: string): readonly GLTFSceneAnimationClipBindingDiagnostics[] {
    if (name !== undefined) {
      const clip = this.clipsByName.get(name);
      if (!clip) {
        throw new Error(`glTF animation clip "${name}" was not found.`);
      }
      return [this.inspectClipBinding(clip)];
    }
    return [...this.clipsByName.values()].map((clip) => this.inspectClipBinding(clip));
  }

  reindexScene(): void {
    this.poseState = undefined;
    this.lastConstraintEvalAtMs = undefined;
    this.options.scene.updateWorldTransforms();
    this.footBindMatrices.clear();
    this.footOrientationLocks.clear();
    this.footDescendantLocks.clear();
    this.nodesByName.clear();
    this.morphRenderablesByNodeName.clear();
    this.skinningBindings.length = 0;
    this.footSurfaceVertices.clear();
    this.options.scene.traverse((node) => {
      this.footBindMatrices.set(node.id, { world: [...node.transform.worldMatrix] as Mat4, local: [...node.transform.localMatrix] as Mat4 });
      const nodes = this.nodesByName.get(node.name) ?? [];
      nodes.push(node);
      this.nodesByName.set(node.name, nodes);
    });
    for (const { node, renderable } of this.options.scene.collectRenderables()) {
      if (renderable.morphWeights.length === 0) continue;
      for (const nodeName of new Set([node.name, node.parent?.name].filter((name): name is string => typeof name === "string" && name.length > 0))) {
        const renderables = this.morphRenderablesByNodeName.get(nodeName) ?? [];
        renderables.push(renderable);
        this.morphRenderablesByNodeName.set(nodeName, renderables);
      }
    }
    if (this.options.asset) {
      const meshesByName = new Map(this.options.asset.meshes.map((mesh) => [mesh.name, mesh]));
      for (const { node, renderable } of this.options.scene.collectRenderables()) {
        if (!renderable.skinning) continue;
        const mesh = meshesByName.get(renderable.geometry);
        const skin = mesh?.skinIndex === undefined ? undefined : this.options.asset.skins[mesh.skinIndex];
        if (!mesh || !skin || skin.joints.length > MAX_RENDERABLE_SKINNING_JOINTS) continue;
        this.skinningBindings.push({ node, renderable, mesh, skin, bindWorldMatrix: [...node.transform.worldMatrix] as Mat4, paletteMatrices: new Float32Array(skin.joints.length * 16) });
      }
    }
  }

  private findSceneLight(name: string): Light | undefined {
    return this.options.scene.collectLights().find((light) => light.name === name);
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
      const hip = this.nodesByName.get(leg.hip)?.[0];
      const knee = this.nodesByName.get(leg.knee)?.[0];
      const ankle = this.nodesByName.get(leg.ankle)?.[0];
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

  /**
   * Applies one sampled `material:<name>.<leaf-path>` value to the live material sink.
   * Returns false (→ missing target, diagnosed) when no sink resolves, the leaf maps to no
   * renderer uniform, or the value shape is wrong. Throws on a sampled value that is not
   * finite, matching the node-path converters below.
   */
  private applyMaterialTrackValue(materialName: string, leafPath: string, value: AnimationValue, trackTarget: string): boolean {
    const parameters = materialParametersForLeaf(leafPath);
    const sink = this.options.resolveAnimationMaterial?.(materialName);
    if (parameters === undefined || sink === undefined) return false;
    const numeric = asMaterialLeafValue(value, trackTarget);
    for (const parameter of parameters) {
      sink.setAnimationParameter(parameter, numeric);
    }
    return true;
  }

  /**
   * Applies one sampled `light:<name>.<leaf>` value to the live scene light of that name.
   * The loader instantiates each node-referenced `KHR_lights_punctual` light as a scene light
   * carrying its node's name; extension-defined lights no node references have no scene object,
   * so a light track matching no scene light is reported missing (diagnosed, never silent).
   */
  private applyLightTrackValue(lightName: string, leaf: string, value: AnimationValue, trackTarget: string): boolean {
    if (lightLeafApplies(leaf) === false) return false;
    const light = this.findSceneLight(lightName);
    if (!light) return false;
    if (leaf === "intensity") {
      light.intensity = asScalar(value, trackTarget);
      return true;
    }
    if (leaf === "color") {
      light.color = asVec3(value, trackTarget);
      return true;
    }
    const rangeHolder = light as unknown as { readonly range?: unknown };
    if (typeof rangeHolder.range !== "number") return false;
    (light as unknown as { range: number }).range = asPositiveScalar(value, trackTarget);
    return true;
  }

  /** CPU skinning oracle using the exact palette submitted to rendering, not IK targets. */
  sampleFootSurfaces(): NonNullable<GLTFootPlantingApplyResult["surfaces"]> {
    const config = this.footPlanting;
    if (!config) return [];
    const samples: { side: "left" | "right"; mesh: string; vertex: number; worldPosition: readonly [number, number, number]; groundError: number | null; skinningProbe?: { position: readonly number[]; joints: readonly number[]; weights: readonly number[]; matrices: readonly number[]; modelMatrix: readonly number[]; expectedWorldPosition: readonly number[] } }[] = [];
    for (const leg of config.legs) {
      const ankle = this.nodesByName.get(leg.ankle)?.[0];
      if (!ankle) continue;
      const footNames = new Set<string>();
      const visit = (node: SceneNode): void => { footNames.add(node.name); node.children.forEach(visit); };
      visit(ankle);
      for (const binding of this.skinningBindings) {
        const palette = binding.renderable.skinning;
        if (!palette) continue;
        const mesh = binding.mesh;
        const cacheKey = `${leg.ankle}:${binding.node.id}:${mesh.name}`;
        let selected = this.footSurfaceVertices.get(cacheKey);
        if (!selected) {
        const candidates: number[] = [];
        for (let vertex = 0; vertex < mesh.positions.length; vertex++) {
          let footWeight = 0;
          for (let lane = 0; lane < 4; lane++) {
            if (footNames.has(binding.skin.jointNames[mesh.joints[vertex]?.[lane] ?? -1] ?? "")) footWeight += mesh.weights[vertex]?.[lane] ?? 0;
            if (footNames.has(binding.skin.jointNames[mesh.joints1?.[vertex]?.[lane] ?? -1] ?? "")) footWeight += mesh.weights1?.[vertex]?.[lane] ?? 0;
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
    if (this.skinningBindings.length === 0) {
      return { updated: 0, missingTargets: [] };
    }
    let updated = 0;
    const missingTargets: string[] = [];
    for (const binding of this.skinningBindings) {
      // T0.11: write into the binding's persistent palette buffer — no per-frame
      // Float32Array allocation, and the renderer's C-18 cache can key on it.
      const matrices = binding.paletteMatrices;
      const inverseMeshWorld = invertMat4(binding.node.transform.worldMatrix);
      let complete = true;
      for (let index = 0; index < binding.skin.jointNames.length; index += 1) {
        const jointName = binding.skin.jointNames[index]!;
        const jointNode = this.nodesByName.get(jointName)?.[0];
        const inverseBind = binding.skin.inverseBindMatrices[index];
        if (!jointNode || !inverseBind) {
          missingTargets.push(`${binding.skin.name}.${jointName}`);
          complete = false;
          break;
        }
        // (inverseMeshWorld * jointWorld) * inverseBind, straight into the palette.
        multiplyMat4Into(this.paletteScratch, 0, inverseMeshWorld, jointNode.transform.worldMatrix);
        multiplyMat4Into(matrices, index * 16, this.paletteScratch, inverseBind);
      }
      if (!complete) continue;
      const skinningPalette = {
        jointCount: binding.skin.joints.length,
        matrices
      };
      // C-18/§9.2: the stable per-skin key the palette cache binds on is this
      // binding object, not the per-frame `renderable.skinning` wrapper (E40).
      (skinningPalette as { paletteKey?: object }).paletteKey = binding;
      binding.renderable.skinning = skinningPalette;
      updated += 1;
    }
    return { updated, missingTargets };
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

    for (const track of clip.tracks) {
      const target = parseAnimationTarget(track.target);
      if (!target) {
        unsupportedTracks.add(track.target);
        continue;
      }
      supportedTrackCount += 1;
      if (target.kind === "material") {
        materialTrackCount += 1;
        if (materialParametersForLeaf(target.leaf) === undefined || this.options.resolveAnimationMaterial?.(target.materialName) === undefined) {
          missingTargets.add(track.target);
          continue;
        }
        boundTrackCount += 1;
        boundMaterialNames.add(target.materialName);
        continue;
      }
      if (target.kind === "light") {
        lightTrackCount += 1;
        if (lightLeafApplies(target.leaf) === false || this.findSceneLight(target.lightName) === undefined) {
          missingTargets.add(track.target);
          continue;
        }
        boundTrackCount += 1;
        boundLightNames.add(target.lightName);
        continue;
      }
      if (target.path === "weights") {
        morphWeightTrackCount += 1;
        const renderables = this.morphRenderablesByNodeName.get(target.nodeName) ?? [];
        if (renderables.length === 0) {
          missingTargets.add(track.target);
          continue;
        }
        boundTrackCount += 1;
        boundNodeNames.add(target.nodeName);
        continue;
      }

      transformTrackCount += 1;
      const nodes = this.nodesByName.get(target.nodeName) ?? [];
      if (nodes.length === 0) {
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
      animatesSkeleton: this.skinningBindings.length > 0 && boundTrackCount > 0 && transformTrackCount > 0
    };
  }

  private applySampledTargets(
    clipName: string,
    time: number,
    sampled: { readonly sampledTargets: ReadonlyMap<string, AnimationValue>; readonly unsupportedTracks: readonly string[] },
    blendedClipCount?: number
  ): GLTFSceneAnimationApplyResult {
    let transformTracksApplied = 0;
    let morphWeightTracksApplied = 0;
    let materialTracksApplied = 0;
    let lightTracksApplied = 0;
    const missingTargets: string[] = [];

    for (const [trackTarget, value] of sampled.sampledTargets) {
      const target = parseAnimationTarget(trackTarget);
      if (!target) {
        continue;
      }
      if (target.kind === "material") {
        if (this.applyMaterialTrackValue(target.materialName, target.leaf, value, trackTarget)) {
          materialTracksApplied += 1;
        } else {
          missingTargets.push(trackTarget);
        }
        continue;
      }
      if (target.kind === "light") {
        if (this.applyLightTrackValue(target.lightName, target.leaf, value, trackTarget)) {
          lightTracksApplied += 1;
        } else {
          missingTargets.push(trackTarget);
        }
        continue;
      }
      if (target.path === "weights") {
        const renderables = this.morphRenderablesByNodeName.get(target.nodeName) ?? [];
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

      const nodes = this.nodesByName.get(target.nodeName) ?? [];
      if (nodes.length === 0) {
        missingTargets.push(trackTarget);
        continue;
      }
      for (const node of nodes) {
        applyTransformValue(node, target.path, value, trackTarget);
      }
      transformTracksApplied += 1;
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
      unsupportedTracks: sampled.unsupportedTracks
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
  private readonly pendingValues = new Map<string, AnimationValue>();
  private elapsedTime = 0;
  private lastApply?: GLTFSceneAnimationApplyResult;
  private disposed = false;

  constructor(options: GLTFSceneAnimationMixerOptions) {
    this.runtime = new GLTFSceneAnimationRuntime(options);
    this.mixer = new AnimationMixer({
      ...(options.consumeRootMotion ? { consumeRootMotion: options.consumeRootMotion } : {}),
      setAnimationValue: (target, value) => {
        this.pendingValues.set(target, cloneAnimationValue(value));
      }
    }, options.mixer ?? {});
    for (const clip of options.clips) {
      const action = new AnimationAction(clip).setWeight(0);
      this.mixer.addAction(action);
      this.mutableActions.set(clip.name, action);
    }
    const autoPlay = options.autoPlay === false ? undefined : options.autoPlay ?? options.clips[0]?.name;
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
    return [...this.actions.keys()];
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
    if (!Number.isFinite(timeScale) || timeScale < 0) {
      throw new Error("glTF animation mixer timeScale must be finite and non-negative.");
    }
    this.mixer.timeScale = timeScale;
  }

  setActionTimeScale(name: string, timeScale: number): AnimationAction {
    return this.requireAction(name).setTimeScale(timeScale);
  }

  setActionWeight(name: string, weight: number): AnimationAction {
    return this.requireAction(name).setWeight(weight);
  }

  setActionLoop(name: string, loopMode: LoopMode): AnimationAction {
    return this.requireAction(name).setLoop(loopMode);
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
    return { events: [], applyResult: this.lastApply, activeActions: this.actionSnapshots().filter((action) => action.active) };
  }

  update(deltaSeconds: number): GLTFSceneAnimationMixerUpdateResult {
    this.assertAlive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error("glTF animation mixer delta must be finite and non-negative.");
    }
    this.pendingValues.clear();
    const events = this.mixer.update(deltaSeconds);
    this.elapsedTime += deltaSeconds;
    this.lastApply = this.runtime.applyAnimationValues(
      "gltf-animation-mixer",
      this.elapsedTime,
      this.pendingValues
    );
    return { events, applyResult: this.lastApply, activeActions: this.actionSnapshots().filter((action) => action.active) };
  }

  getAction(name: string): AnimationAction | undefined {
    this.assertAlive();
    return this.actions.get(name);
  }

  snapshot(): GLTFSceneAnimationMixerSnapshot {
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

  dispose(): void {
    if (this.disposed) return;
    this.mixer.dispose();
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
    if (options.loopMode !== undefined) {
      action.setLoop(options.loopMode);
    }
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

export function createGLTFSceneAnimationMixer(options: GLTFSceneAnimationMixerOptions): GLTFSceneAnimationMixerBinding {
  return new GLTFSceneAnimationMixerBinding(options);
}

type GLTFAnimationTarget =
  | { readonly kind: "node"; readonly nodeName: string; readonly path: "translation" | "rotation" | "scale" | "weights" }
  | { readonly kind: "material"; readonly materialName: string; readonly leaf: string }
  | { readonly kind: "light"; readonly lightName: string; readonly leaf: string };

/**
 * Pointer-bound leaf paths (`material:`/`light:`) use the FIRST dot as the name/leaf split:
 * the binding emits `material:<name>.<property-path…>` where the property path itself may
 * contain dots (`pbrMetallicRoughness.baseColorFactor`), while glTF material/light names with
 * dots are rare. Names containing "." therefore resolve by first segment and are documented
 * as unsupported in the animation-pointer limits.
 */
function parseAnimationTarget(target: string): GLTFAnimationTarget | undefined {
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
  const path = target.slice(separator + 1);
  if (path !== "translation" && path !== "rotation" && path !== "scale" && path !== "weights") {
    return undefined;
  }
  return {
    kind: "node",
    nodeName: target.slice(0, separator),
    path
  };
}

/**
 * Maps an animation-pointer material leaf path to the renderer uniform parameters it drives.
 * Only leaves with uniforms the production bridge provably writes (see TypedGLBActor tint
 * path: `u_baseColor`, `u_baseColorFactor`, `u_emissiveColor`, `u_emissiveFactor`,
 * `u_emissiveStrength`, `u_metallic`, `u_roughness`) are supported; every other leaf stays
 * diagnostic-only, preserving diagnose-and-drop for the unmapped remainder. Matches on the
 * last path segment so `pbrMetallicRoughness.baseColorFactor` and `baseColorFactor` agree.
 */
function materialParametersForLeaf(leafPath: string): readonly string[] | undefined {
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

/** Light leaves the runtime can drive on a live scene light. Anything else stays diagnostic-only. */
function lightLeafApplies(leaf: string): boolean {
  return leaf === "intensity" || leaf === "color" || leaf === "range";
}

function resolveIKSkin(skins: readonly GLTFSkinAsset[], skinName: string | undefined): GLTFSkinAsset {
  if (skinName === undefined) {
    const skin = skins.find((candidate) => candidate.jointNames.length >= 3);
    if (!skin) {
      throw new Error("glTF imported skeleton IK requires a skin with at least three joints.");
    }
    return skin;
  }
  const skin = skins.find((candidate) => candidate.name === skinName);
  if (!skin) {
    throw new Error(`glTF imported skeleton IK skin "${skinName}" was not found.`);
  }
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
  additive: boolean
): { readonly sampledTargets: ReadonlyMap<string, AnimationValue>; readonly unsupportedTracks: readonly string[] } {
  const accumulators = new Map<string, TargetAccumulator>();
  const unsupportedTracks: string[] = [];
  for (const track of clip.tracks) {
    if (!parseAnimationTarget(track.target)) {
      unsupportedTracks.push(track.target);
      continue;
    }
    blendInto(accumulators, track.target, track.valueType, track.sample(time), weight, additive);
  }
  const sampledTargets = new Map<string, AnimationValue>();
  for (const [target, accumulator] of accumulators) {
    sampledTargets.set(target, finalizeTargetBlend(accumulator));
  }
  return { sampledTargets, unsupportedTracks };
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
