import { AnimationAction, AnimationClip, AnimationMixer, normalizeQuat, slerpQuat, solveTwoBoneIk, type AnimationEvent, type AnimationMixerOptions, type AnimationValue, type LoopMode, type TrackValueType, type TwoBoneIkResult } from "@aura3d/animation";
import { invertMat4, multiplyMat4, Renderable, Scene, transformPoint, type Mat4, type SceneNode, type Vec3 } from "@aura3d/scene";
import type { GLTFAsset, GLTFMeshAsset, GLTFSkinAsset } from "./GLTFLoader";

export interface GLTFSceneAnimationRuntimeOptions {
  readonly scene: Scene;
  readonly clips: readonly AnimationClip[];
  readonly asset?: Pick<GLTFAsset, "meshes" | "skins">;
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
export function resolveGLTFClipName(
  requested: string,
  available: readonly string[]
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

  return available[0];
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
  readonly skinningPalettesUpdated: number;
  readonly missingTargets: readonly string[];
  readonly unsupportedTracks: readonly string[];
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
}

type WeightedAccumulator = { value: AnimationValue; weight: number; type: TrackValueType };
type TargetAccumulator = { type: TrackValueType; base?: WeightedAccumulator; additive?: AnimationValue };

export class GLTFSceneAnimationRuntime {
  private readonly clipsByName = new Map<string, AnimationClip>();
  private readonly nodesByName = new Map<string, SceneNode[]>();
  private readonly morphRenderablesByNodeName = new Map<string, Renderable[]>();
  private readonly skinningBindings: RuntimeSkinningBinding[] = [];
  private lastApply?: GLTFSceneAnimationApplyResult;

  constructor(private readonly options: GLTFSceneAnimationRuntimeOptions) {
    for (const clip of options.clips) {
      this.clipsByName.set(clip.name, clip);
    }
    this.reindexScene();
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
   * Resolve a requested clip name to the best available registered clip name
   * using fuzzy matching (exact -> synonym group -> substring -> first clip).
   * Returns `undefined` when the runtime has no clips.
   */
  resolveClipName(name: string): string | undefined {
    return resolveGLTFClipName(name, this.clipNames());
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

  applyClips(samples: readonly GLTFSceneAnimationClipSample[]): GLTFSceneAnimationApplyResult {
    if (samples.length === 0) {
      throw new Error("glTF animation runtime blend requires at least one clip sample.");
    }
    const accumulators = new Map<string, TargetAccumulator>();
    const unsupportedTracks: string[] = [];
    let maxTime = 0;
    const names: string[] = [];

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
      for (const track of clip.tracks) {
        const target = parseAnimationTarget(track.target);
        if (!target) {
          unsupportedTracks.push(track.target);
          continue;
        }
        if (!clipMaskAllowsNode(sample.mask, target.nodeName)) continue;
        blendInto(accumulators, track.target, track.valueType, track.sample(wrappedTime), weight, sample.additive === true);
      }
    }

    const sampledTargets = new Map<string, AnimationValue>();
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
    this.nodesByName.clear();
    this.morphRenderablesByNodeName.clear();
    this.skinningBindings.length = 0;
    this.options.scene.traverse((node) => {
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
        if (!mesh || !skin || skin.joints.length > 96) continue;
        this.skinningBindings.push({ node, renderable, mesh, skin });
      }
    }
  }

  private refreshSkinningPalettes(): { readonly updated: number; readonly missingTargets: readonly string[] } {
    if (this.skinningBindings.length === 0) {
      return { updated: 0, missingTargets: [] };
    }
    let updated = 0;
    const missingTargets: string[] = [];
    for (const binding of this.skinningBindings) {
      const matrices = new Float32Array(binding.skin.joints.length * 16);
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
        const jointMatrix = multiplyMat4(multiplyMat4(inverseMeshWorld, jointNode.transform.worldMatrix), inverseBind as Mat4);
        matrices.set(jointMatrix, index * 16);
      }
      if (!complete) continue;
      binding.renderable.skinning = {
        jointCount: binding.skin.joints.length,
        matrices
      };
      updated += 1;
    }
    return { updated, missingTargets };
  }

  private inspectClipBinding(clip: AnimationClip): GLTFSceneAnimationClipBindingDiagnostics {
    let supportedTrackCount = 0;
    let boundTrackCount = 0;
    let transformTrackCount = 0;
    let morphWeightTrackCount = 0;
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
    const missingTargets: string[] = [];

    for (const [trackTarget, value] of sampled.sampledTargets) {
      const target = parseAnimationTarget(trackTarget);
      if (!target) {
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
    const skinning = this.refreshSkinningPalettes();
    return {
      clipName,
      time,
      ...(blendedClipCount === undefined ? {} : { blendedClipCount }),
      tracksApplied: transformTracksApplied + morphWeightTracksApplied,
      transformTracksApplied,
      morphWeightTracksApplied,
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
  private readonly pendingValues = new Map<string, AnimationValue>();
  private elapsedTime = 0;
  private lastApply?: GLTFSceneAnimationApplyResult;

  constructor(options: GLTFSceneAnimationMixerOptions) {
    this.runtime = new GLTFSceneAnimationRuntime(options);
    this.mixer = new AnimationMixer({
      setAnimationValue: (target, value) => {
        this.pendingValues.set(target, cloneAnimationValue(value));
      }
    }, options.mixer ?? {});
    const actions = new Map<string, AnimationAction>();
    for (const clip of options.clips) {
      const action = new AnimationAction(clip).setWeight(0);
      this.mixer.addAction(action);
      actions.set(clip.name, action);
    }
    const autoPlay = options.autoPlay === false ? undefined : options.autoPlay ?? options.clips[0]?.name;
    if (autoPlay) {
      const action = actions.get(autoPlay);
      if (!action) {
        throw new Error(`glTF animation mixer autoPlay clip "${autoPlay}" was not found.`);
      }
      action.setWeight(1).play();
    }
    this.actions = actions;
  }

  listClips(): readonly string[] {
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
    for (const action of this.resolveActions(name)) {
      action.pause();
    }
  }

  resume(name?: string): void {
    for (const action of this.resolveActions(name)) {
      if (action.weight > 0) action.play();
    }
  }

  stop(name?: string): void {
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
    this.pendingValues.clear();
    this.lastApply = this.runtime.applyClips(samples);
    this.elapsedTime = Math.max(this.elapsedTime, this.lastApply.time);
    return { events: [], applyResult: this.lastApply, activeActions: this.actionSnapshots().filter((action) => action.active) };
  }

  update(deltaSeconds: number): GLTFSceneAnimationMixerUpdateResult {
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
    const action = this.actions.get(name);
    if (!action) {
      throw new Error(`glTF animation action "${name}" was not found.`);
    }
    return action;
  }
}

export function createGLTFSceneAnimationMixer(options: GLTFSceneAnimationMixerOptions): GLTFSceneAnimationMixerBinding {
  return new GLTFSceneAnimationMixerBinding(options);
}

function parseAnimationTarget(target: string): { readonly nodeName: string; readonly path: "translation" | "rotation" | "scale" | "weights" } | undefined {
  const separator = target.lastIndexOf(".");
  if (separator <= 0 || separator === target.length - 1) {
    return undefined;
  }
  const path = target.slice(separator + 1);
  if (path !== "translation" && path !== "rotation" && path !== "scale" && path !== "weights") {
    return undefined;
  }
  return {
    nodeName: target.slice(0, separator),
    path
  };
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

function worldPosition(node: SceneNode): Vec3 {
  node.updateWorldTransform();
  return [node.transform.worldMatrix[12], node.transform.worldMatrix[13], node.transform.worldMatrix[14]];
}

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
