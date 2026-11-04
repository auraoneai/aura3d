import { defineContractSlot, type ContractSlot, type QrFlags } from "../contracts/core";
import {
  claimScopedTemporalHistory,
  type TemporalCameraMatrices,
  type TemporalFrameId,
  type TemporalHistoryLike,
  type TemporalIdentity,
  type TemporalResetReason
} from "../contracts/velocity.js";
import type { RenderItem } from "../contracts/renderItem.js";
import type { RenderItemInstanceAttribute } from "../ForwardPass.js";
import type { UniformValue } from "../RenderDevice.js";
import { temporalJitter } from "../TemporalMath";

export type VelocityUniformBinder = (item: RenderItem, uniforms: Map<string, UniformValue>) => void;
export let bindVelocityUniforms: VelocityUniformBinder | undefined;
export function setVelocityUniformBinder(binder: VelocityUniformBinder | undefined): void {
  bindVelocityUniforms = binder;
}

export interface VelocityCoverage {
  /** Counts track prior rigid-model transforms, not successful pixel writes. */
  readonly items: number;
  readonly withVelocity: number;
  readonly moving: number;
  readonly movingWithHistory: number;
  /** False means no view context was supplied; counts are not a measurement. */
  readonly available?: boolean;
}

const emptyCoverage = (): VelocityCoverage => ({ items: 0, withVelocity: 0, moving: 0, movingWithHistory: 0 });
const identity = (): Float32Array => Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

interface VelocityDrawContext {
  readonly matrices: TemporalCameraMatrices;
  readonly objectKey: TemporalIdentity;
  readonly previousModel: Float32Array;
  readonly reactive: number;
  readonly owner: VelocityHistory;
  readonly mrtWritable: boolean;
  /** Previous pose inputs, independent of the MRT item fields. */
  readonly previousMorph?: Float32Array;
  readonly previousInstances?: Float32Array;
  readonly previousJoints?: Float32Array;
  /** True when a deformed or instanced object has history but no pose correspondence. */
  readonly poseUnavailable: boolean;
}

/**
 * Previous-pose inputs of one prepared draw, for a renderer-owned motion pass.
 * Only a draw prepared by a live history for its current frame has them.
 */
export interface VelocityMotionInputs {
  readonly objectKey: TemporalIdentity;
  readonly matrices: TemporalCameraMatrices;
  readonly model: Float32Array;
  readonly previousModel: Float32Array;
  readonly previousMorphWeights?: Float32Array;
  readonly previousInstanceTransforms?: Float32Array;
  readonly previousJointMatrices?: Float32Array;
  readonly poseUnavailable: boolean;
}
const velocityContext: unique symbol = Symbol("aura.velocity.draw");

/** Per-instance previous-matrix columns read by the velocity MRT vertex chunk. */
export const VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES = [
  "a_a3dPrevInstance0", "a_a3dPrevInstance1", "a_a3dPrevInstance2", "a_a3dPrevInstance3"
] as const;

/** Deformation and instance state that the previous-pose shader path needs. */
interface PoseState {
  readonly morph?: Float32Array;
  readonly instances?: Float32Array;
  /** Skinning joint palette (column-major mat4 per joint). */
  readonly joints?: Float32Array;
}

function finiteArray(value: Float32Array | readonly number[], name: string): Float32Array {
  const copy = Float32Array.from(value);
  if (!copy.every(Number.isFinite)) throw new RangeError(`Temporal ${name} must be finite`);
  return copy;
}
function sameOptional(a: Float32Array | undefined, b: Float32Array | undefined): boolean {
  return a === undefined ? b === undefined : b !== undefined && sameMatrix(a, b);
}
function instanceColumns(transforms: Float32Array): RenderItemInstanceAttribute[] {
  const count = transforms.length / 16;
  return VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES.map((shaderName, column) => {
    const data = new Float32Array(count * 4);
    for (let instance = 0; instance < count; instance += 1) {
      data.set(transforms.subarray(instance * 16 + column * 4, instance * 16 + column * 4 + 4), instance * 4);
    }
    return { shaderName, components: 4 as const, data, divisor: 1 };
  });
}
type ContextItem = RenderItem & {
  readonly temporalObjectKey?: TemporalIdentity;
  readonly [velocityContext]?: VelocityDrawContext;
};

function sameMatrix(a: Float32Array, b: Float32Array | readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
function matrix(value: Float32Array | readonly number[]): Float32Array {
  if (value.length !== 16) throw new RangeError("Temporal transform must be a finite mat4");
  const values = Array.from(value);
  if (values.length !== 16 || !values.every(Number.isFinite)) throw new RangeError("Temporal transform must be a finite mat4");
  const copy = Float32Array.from(values);
  if (!copy.every(Number.isFinite)) throw new RangeError("Temporal transform must be a finite mat4");
  return copy;
}

/**
 * A history is owned by one renderer/device/view. Explicit frame IDs retain the
 * previous state until commit(), and repeated prepare calls do not advance it.
 * The omitted-ID form is retained for stand-alone callers and commits the
 * previous preparation when the next begins.
 */
export class VelocityHistory implements TemporalHistoryLike {
  private previousViewProjection?: Float32Array;
  // The physical projection of the committed frame, so a motion producer can
  // recover previous view-space depth exactly (any depth convention).
  private previousProjection?: Float32Array;
  private preparedProjection?: Float32Array;
  private previousModels = new Map<TemporalIdentity, Float32Array>();
  private framePreviousModels = new Map<TemporalIdentity, Float32Array>();
  private pendingModels = new Map<TemporalIdentity, Float32Array>();
  // Previous morph weights and instance transforms, keyed and committed
  // exactly like model transforms (once per authored frame).
  private previousPoses = new Map<TemporalIdentity, PoseState>();
  private framePreviousPoses = new Map<TemporalIdentity, PoseState>();
  private pendingPoses = new Map<TemporalIdentity, PoseState>();
  private pendingPreviousModels = new Map<TemporalIdentity, Float32Array | undefined>();
  private counted = new Set<TemporalIdentity>();
  private activeFrame?: TemporalFrameId;
  private prepared?: TemporalCameraMatrices;
  private frame = 0;
  private implicit = false;
  private committedFrame?: TemporalFrameId;
  private currentCoverage: VelocityCoverage = emptyCoverage();
  private preparedJitter: readonly [number, number] = [0, 0];

  prepare(viewProjection: Float32Array, jitter: readonly [number, number], frameId?: TemporalFrameId, projection?: Float32Array | readonly number[]): TemporalCameraMatrices {
    const [jitterX, jitterY] = jitter;
    const projectionCopy = projection === undefined ? undefined : matrix(projection);
    if (!Number.isFinite(jitterX) || !Number.isFinite(jitterY)) throw new RangeError("Temporal jitter must be finite");
    if (typeof frameId === "number" && !Number.isFinite(frameId)) throw new RangeError("Temporal frame ID must be finite");
    const vp = matrix(viewProjection);
    const implicit = frameId === undefined;
    const nextFrame = frameId ?? Symbol("aura.velocity.frame");
    if (nextFrame === this.activeFrame && this.prepared) {
      if (!sameMatrix(this.prepared.unjittered, vp) || this.preparedJitter[0] !== jitterX || this.preparedJitter[1] !== jitterY
        || !sameOptional(this.preparedProjection, projectionCopy)) {
        throw new RangeError("A temporal frame cannot use different view-projection matrices, projection or jitter");
      }
      return this.prepared;
    }
    if (nextFrame === this.committedFrame) throw new RangeError("A committed temporal frame cannot be resumed after a newer frame begins");
    const jittered = new Float32Array(vp);
    for (let col = 0; col < 4; col += 1) {
      jittered[col * 4] = jittered[col * 4]! + jitterX * jittered[col * 4 + 3]!;
      jittered[col * 4 + 1] = jittered[col * 4 + 1]! + jitterY * jittered[col * 4 + 3]!;
    }
    if (!jittered.every(Number.isFinite)) throw new RangeError("Temporal jitter must produce a finite mat4");
    // An implicit frame commits when *any* next frame starts, including an
    // explicitly identified one. Reject invalid next frames before committing.
    if (this.implicit && this.activeFrame !== undefined) this.commit(this.activeFrame);
    this.implicit = implicit;
    this.activeFrame = nextFrame;
    // Commit replaces previousModels, so retain the frame-start map for every
    // pass of this frame, including passes prepared after commit.
    this.framePreviousModels = this.previousModels;
    this.framePreviousPoses = this.previousPoses;
    this.pendingModels = new Map();
    this.pendingPoses = new Map();
    this.pendingPreviousModels = new Map();
    this.counted = new Set();
    this.currentCoverage = emptyCoverage();
    this.preparedJitter = [jitterX, jitterY];
    const previous = new Float32Array(this.previousViewProjection ?? vp);
    this.preparedProjection = projectionCopy;
    // A first frame (or one after a reset) reprojects through itself.
    const previousProjection = this.previousViewProjection ? this.previousProjection : projectionCopy;
    // Retain the same frame handle across passes, but never expose the arrays
    // used for its baseline or the next commit to callers or uniform hooks.
    const prepared: TemporalCameraMatrices = {
      get jittered() { return new Float32Array(jittered); },
      get unjittered() { return new Float32Array(vp); },
      get previous() { return new Float32Array(previous); }
    };
    if (projectionCopy) Object.defineProperty(prepared, "projection", { enumerable: true, get: () => new Float32Array(projectionCopy) });
    if (previousProjection) Object.defineProperty(prepared, "previousProjection", { enumerable: true, get: () => new Float32Array(previousProjection) });
    this.prepared = Object.freeze(prepared);
    return this.prepared;
  }

  /** Attach immutable per-draw context. Object keys survive item copies; labels do not identify objects. */
  prepareItem(item: RenderItem, mrtWritable = false): RenderItem {
    if (!this.prepared || this.activeFrame === undefined) throw new Error("VelocityHistory.prepare must precede prepareItem");
    const typed = item as ContextItem;
    const key = typed.temporalObjectKey ?? item;
    if (typeof key === "number" && !Number.isFinite(key)) throw new RangeError("Temporal object ID must be finite");
    const model = item.modelMatrix ? matrix(item.modelMatrix) : identity();
    const baseline = item.previousModelMatrix ? matrix(item.previousModelMatrix) : this.framePreviousModels.get(key);
    const priorPending = this.pendingModels.get(key);
    if (priorPending && !sameMatrix(priorPending, model)) throw new RangeError("A temporal object key has conflicting transforms within one frame");
    const pose: PoseState = {
      ...(item.morphTargets?.length && item.morphWeights ? { morph: finiteArray(item.morphWeights, "morph weights") } : {}),
      ...(item.instanceTransforms?.length ? { instances: finiteArray(item.instanceTransforms, "instance transforms") } : {}),
      ...(item.skinning?.matrices.length ? { joints: finiteArray(item.skinning.matrices, "joint matrices") } : {})
    };
    const priorPose = this.pendingPoses.get(key);
    if (priorPose && (!sameOptional(priorPose.morph, pose.morph) || !sameOptional(priorPose.instances, pose.instances)
      || !sameOptional(priorPose.joints, pose.joints))) {
      throw new RangeError("A temporal object key has conflicting deformation or instance state within one frame");
    }
    if (priorPending) {
      const priorBaseline = this.pendingPreviousModels.get(key);
      if ((priorBaseline === undefined) !== (baseline === undefined)
        || (priorBaseline !== undefined && baseline !== undefined && !sameMatrix(priorBaseline, baseline))) {
        throw new RangeError("A temporal object key has conflicting previous transforms within one frame");
      }
    } else {
      this.pendingModels.set(key, model);
      this.pendingPoses.set(key, pose);
      if (this.committedFrame === this.activeFrame) {
        this.previousModels.set(key, new Float32Array(model));
        this.previousPoses.set(key, pose);
      }
      // Preserve history availability separately from the model fallback: it
      // affects coverage even when an explicit previous transform equals it.
      this.pendingPreviousModels.set(key, baseline === undefined ? undefined : new Float32Array(baseline));
    }
    if (!this.counted.has(key)) {
      this.counted.add(key);
      const moving = !baseline || !sameMatrix(baseline, model);
      this.currentCoverage = {
        items: this.currentCoverage.items + 1,
        withVelocity: this.currentCoverage.withVelocity + (baseline ? 1 : 0),
        moving: this.currentCoverage.moving + (moving ? 1 : 0),
        movingWithHistory: this.currentCoverage.movingWithHistory + (moving && baseline ? 1 : 0)
      };
    }
    // The MRT program reprojects the previous pose: previous bone palette
    // (palette cache), previous morph weights and previous instance matrices
    // (this history). Without an MRT the separate camera-velocity path cannot
    // represent deformation, so those pixels stay reactive.
    const prior = this.framePreviousPoses.get(key);
    let previousMorph: Float32Array | undefined;
    let previousInstances: Float32Array | undefined;
    let poseUnavailable = false;
    if (pose.morph) {
      const supplied = item.previousMorphWeights ? finiteArray(item.previousMorphWeights, "previous morph weights") : undefined;
      const history = prior?.morph?.length === pose.morph.length ? prior.morph : undefined;
      previousMorph = supplied ?? history ?? pose.morph;
      poseUnavailable ||= supplied === undefined && history === undefined && baseline !== undefined;
    }
    if (pose.instances) {
      const supplied = item.previousInstanceTransforms?.length === pose.instances.length
        ? finiteArray(item.previousInstanceTransforms, "previous instance transforms") : undefined;
      const history = prior?.instances?.length === pose.instances.length ? prior.instances : undefined;
      previousInstances = supplied ?? history ?? pose.instances;
      // A changed instance count has no per-instance correspondence.
      poseUnavailable ||= supplied === undefined && history === undefined && baseline !== undefined;
    }
    // The previous joint palette, for producers that deform on the CPU or in
    // their own program (the MRT program reads the previous palette texture).
    let previousJoints: Float32Array | undefined;
    if (pose.joints) {
      const history = prior?.joints?.length === pose.joints.length ? prior.joints : undefined;
      previousJoints = history ?? pose.joints;
      poseUnavailable ||= history === undefined && item.previousJointTexture === undefined && baseline !== undefined;
    }
    // Eight-influence skinning already uses every portable attribute slot.
    const instanceSlots = Boolean(previousInstances) && !item.skinning?.extraInfluences;
    const deformed = Boolean(item.skinning || item.morphTargets?.length || item.instanceTransforms?.length);
    const reactive = item.writesReactive || poseUnavailable || (deformed && (!mrtWritable || (pose.instances && !instanceSlots))) ? 1 : 0;
    return {
      ...item,
      temporalObjectKey: key,
      // Only MRT draws consume previous pose inputs; other passes keep the
      // caller's item fields unchanged.
      ...(mrtWritable && previousMorph ? { previousMorphWeights: new Float32Array(previousMorph) } : {}),
      ...(mrtWritable && previousInstances ? { previousInstanceTransforms: new Float32Array(previousInstances) } : {}),
      ...(mrtWritable && instanceSlots
        ? { instanceAttributes: [...(item.instanceAttributes ?? []).filter(attribute =>
          !(VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES as readonly string[]).includes(attribute.shaderName)), ...instanceColumns(previousInstances!)] }
        : {}),
      [velocityContext]: {
        matrices: this.prepared, objectKey: key, previousModel: new Float32Array(baseline ?? model), reactive, owner: this, mrtWritable,
        poseUnavailable,
        ...(previousMorph ? { previousMorph: new Float32Array(previousMorph) } : {}),
        ...(previousInstances ? { previousInstances: new Float32Array(previousInstances) } : {}),
        ...(previousJoints ? { previousJoints: new Float32Array(previousJoints) } : {})
      }
    } as ContextItem;
  }

  get coverage(): VelocityCoverage { return { ...this.currentCoverage }; }
  ownsMatrices(matrices: TemporalCameraMatrices): boolean { return this.prepared === matrices && this.activeFrame !== undefined; }
  jitter(width: number, height: number): readonly [number, number] {
    return temporalJitter(this.frame, this.previousViewProjection !== undefined, width, height);
  }
  commit(frameId: TemporalFrameId | undefined = this.activeFrame): void {
    if (frameId === undefined || frameId !== this.activeFrame || frameId === this.committedFrame || !this.prepared) return;
    this.previousViewProjection = new Float32Array(this.prepared.unjittered);
    this.previousProjection = this.preparedProjection ? new Float32Array(this.preparedProjection) : undefined;
    this.previousModels = new Map(this.pendingModels);
    this.previousPoses = new Map(this.pendingPoses);
    this.committedFrame = frameId;
    this.frame += 1;
  }
  cancel(frameId: TemporalFrameId | undefined = this.activeFrame): boolean {
    if (frameId === undefined || frameId !== this.activeFrame || frameId === this.committedFrame) return false;
    this.framePreviousModels = new Map();
    this.framePreviousPoses = new Map();
    this.pendingModels.clear();
    this.pendingPoses.clear();
    this.pendingPreviousModels.clear();
    this.counted.clear();
    this.activeFrame = undefined;
    this.prepared = undefined;
    this.preparedProjection = undefined;
    this.implicit = false;
    this.preparedJitter = [0, 0];
    this.currentCoverage = emptyCoverage();
    return true;
  }
  reset(_reason: TemporalResetReason): void {
    this.previousViewProjection = undefined;
    this.previousProjection = undefined;
    this.preparedProjection = undefined;
    this.previousModels.clear();
    this.framePreviousModels.clear();
    this.pendingModels.clear();
    this.previousPoses.clear();
    this.framePreviousPoses.clear();
    this.pendingPoses.clear();
    this.pendingPreviousModels.clear();
    this.counted.clear();
    this.activeFrame = undefined;
    this.committedFrame = undefined;
    this.prepared = undefined;
    this.frame = 0;
    this.implicit = false;
    this.preparedJitter = [0, 0];
    this.currentCoverage = emptyCoverage();
  }
}

function currentVelocityContext(item?: RenderItem): VelocityDrawContext | undefined {
  const typed = item as ContextItem | undefined;
  const context = typed?.[velocityContext];
  return context && typed?.temporalObjectKey === context.objectKey && context.owner.ownsMatrices(context.matrices)
    ? context
    : undefined;
}

/** Unscoped reads are explicitly unknown; zero counts allow the first history seed. */
export function postVelocityCoverage(item?: RenderItem): VelocityCoverage {
  const context = currentVelocityContext(item);
  return context
    ? { ...context.owner.coverage, available: true }
    : { ...emptyCoverage(), available: false };
}
/** Previous-pose inputs of a draw prepared for the current frame, else undefined. */
export function velocityMotionInputs(item: RenderItem): VelocityMotionInputs | undefined {
  const context = currentVelocityContext(item);
  if (!context) return undefined;
  return {
    objectKey: context.objectKey, matrices: context.matrices,
    model: item.modelMatrix ? matrix(item.modelMatrix) : identity(),
    previousModel: new Float32Array(context.previousModel),
    poseUnavailable: context.poseUnavailable,
    ...(context.previousMorph ? { previousMorphWeights: new Float32Array(context.previousMorph) } : {}),
    ...(context.previousInstances ? { previousInstanceTransforms: new Float32Array(context.previousInstances) } : {}),
    ...(context.previousJoints ? { previousJointMatrices: new Float32Array(context.previousJoints) } : {})
  };
}
export function velocityFramePrepared(item?: RenderItem): boolean {
  return Boolean(currentVelocityContext(item)?.mrtWritable);
}

const velocityMrtBinder: VelocityUniformBinder = (item, uniforms) => {
  const context = currentVelocityContext(item);
  if (!context) return;
  uniforms.set("u_previousViewProjection", context.matrices.previous);
  uniforms.set("u_unjitteredViewProjection", context.matrices.unjittered);
  uniforms.set("u_previousModel", new Float32Array(context.previousModel));
  uniforms.set("a3d_u_reactive", context.reactive);
};

/** An application may replace the binder; only the original pure binder may
 * run in both passes of a replayed frame. */
export function isReplaySafeVelocityBinder(): boolean {
  return bindVelocityUniforms === undefined || bindVelocityUniforms === velocityMrtBinder;
}

export interface VelocitySurface {
  readonly kind: "legacy" | "v2";
  /**
   * Return a fresh caller-owned history. 5.0 has no shared compatibility
   * history: every renderer, device and view owner creates its own.
   */
  readonly createHistory: () => TemporalHistoryLike;
}
class LegacyVelocityHistoryStub implements TemporalHistoryLike {
  prepare(viewProjection: Float32Array, _jitter: readonly [number, number]): TemporalCameraMatrices {
    const copy = matrix(viewProjection);
    return { jittered: new Float32Array(copy), unjittered: copy, previous: new Float32Array(copy) };
  }
  reset(_reason: TemporalResetReason): void { /* No resources. */ }
}

// The public provider factory is also callable directly. Mark its products at
// creation, and remember their issuance order so a wrapping custom factory can
// return a fresh built-in product without being mistaken for a reused one.
const builtinScopedIssuance = new WeakMap<object, number>();
const issuedScopedVelocityHistories = new WeakSet<object>();
let builtinScopedSerial = 0;
function issueBuiltinScopedHistory<T extends TemporalHistoryLike>(history: T): T {
  if (!claimScopedTemporalHistory(history)) throw new Error("A scoped velocity history factory must return a fresh history");
  builtinScopedIssuance.set(history, ++builtinScopedSerial);
  return history;
}
function createBuiltinLegacyHistory(): TemporalHistoryLike { return issueBuiltinScopedHistory(new LegacyVelocityHistoryStub()); }
function createBuiltinVelocityHistory(): TemporalHistoryLike { return issueBuiltinScopedHistory(new VelocityHistory()); }

export const velocityHistorySlot: ContractSlot<VelocitySurface> = defineContractSlot<VelocitySurface>(
  "C-14", "prd03", "A3D_QR_POST", { kind: "legacy", createHistory: createBuiltinLegacyHistory }
);

/** Create a caller-owned history from the flag-selected provider. */
export function createScopedVelocityHistory(flags: QrFlags): TemporalHistoryLike {
  const surface = velocityHistorySlot.get(flags);
  const factory = surface.createHistory;
  if (typeof factory !== "function") {
    throw new Error("The selected velocity provider does not support scoped history creation");
  }
  const issuedBefore = builtinScopedSerial;
  const history = factory.call(surface);
  if ((typeof history !== "object" || history === null) && typeof history !== "function") {
    throw new TypeError("A scoped velocity history factory must return a history object");
  }
  if (typeof history.prepare !== "function" || typeof history.reset !== "function"
    || (history.commit !== undefined && typeof history.commit !== "function")
    || (history.cancel !== undefined && typeof history.cancel !== "function")) {
    throw new TypeError("A scoped velocity history must implement prepare and reset");
  }
  const freshBuiltin = (builtinScopedIssuance.get(history) ?? 0) > issuedBefore;
  if (issuedScopedVelocityHistories.has(history)
    || (!freshBuiltin && !claimScopedTemporalHistory(history))) {
    throw new Error("A scoped velocity history factory must return a fresh history");
  }
  issuedScopedVelocityHistories.add(history);
  return history;
}

/** Provides the scoped factory only; no module-global history instance exists. */
export function provideVelocityHistory(): void {
  velocityHistorySlot.provide({ kind: "v2", createHistory: createBuiltinVelocityHistory });
  setVelocityUniformBinder(velocityMrtBinder);
}
