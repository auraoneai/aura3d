import { defineContractSlot, type QrFlags } from "../contracts/core";
import {
  claimScopedTemporalHistory,
  setTemporalHistoryImpl,
  type TemporalCameraMatrices,
  type TemporalFrameId,
  type TemporalHistoryLike,
  type TemporalIdentity,
  type TemporalResetReason
} from "../contracts/velocity.js";
import type { RenderItem } from "../contracts/renderItem.js";
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
}
const velocityContext: unique symbol = Symbol("aura.velocity.draw");
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
  private previousModels = new Map<TemporalIdentity, Float32Array>();
  private framePreviousModels = new Map<TemporalIdentity, Float32Array>();
  private pendingModels = new Map<TemporalIdentity, Float32Array>();
  private pendingPreviousModels = new Map<TemporalIdentity, Float32Array | undefined>();
  private counted = new Set<TemporalIdentity>();
  private activeFrame?: TemporalFrameId;
  private prepared?: TemporalCameraMatrices;
  private frame = 0;
  private implicit = false;
  private committedFrame?: TemporalFrameId;
  private currentCoverage: VelocityCoverage = emptyCoverage();
  private preparedJitter: readonly [number, number] = [0, 0];

  prepare(viewProjection: Float32Array, jitter: readonly [number, number], frameId?: TemporalFrameId): TemporalCameraMatrices {
    const [jitterX, jitterY] = jitter;
    if (!Number.isFinite(jitterX) || !Number.isFinite(jitterY)) throw new RangeError("Temporal jitter must be finite");
    if (typeof frameId === "number" && !Number.isFinite(frameId)) throw new RangeError("Temporal frame ID must be finite");
    const vp = matrix(viewProjection);
    const implicit = frameId === undefined;
    const nextFrame = frameId ?? Symbol("aura.velocity.frame");
    if (nextFrame === this.activeFrame && this.prepared) {
      if (!sameMatrix(this.prepared.unjittered, vp) || this.preparedJitter[0] !== jitterX || this.preparedJitter[1] !== jitterY) {
        throw new RangeError("A temporal frame cannot use different view-projection matrices or jitter");
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
    this.pendingModels = new Map();
    this.pendingPreviousModels = new Map();
    this.counted = new Set();
    this.currentCoverage = emptyCoverage();
    this.preparedJitter = [jitterX, jitterY];
    const previous = new Float32Array(this.previousViewProjection ?? vp);
    // Retain the same frame handle across passes, but never expose the arrays
    // used for its baseline or the next commit to callers or uniform hooks.
    this.prepared = Object.freeze({
      get jittered() { return new Float32Array(jittered); },
      get unjittered() { return new Float32Array(vp); },
      get previous() { return new Float32Array(previous); }
    });
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
    if (priorPending) {
      const priorBaseline = this.pendingPreviousModels.get(key);
      if ((priorBaseline === undefined) !== (baseline === undefined)
        || (priorBaseline !== undefined && baseline !== undefined && !sameMatrix(priorBaseline, baseline))) {
        throw new RangeError("A temporal object key has conflicting previous transforms within one frame");
      }
    } else {
      this.pendingModels.set(key, model);
      if (this.committedFrame === this.activeFrame) this.previousModels.set(key, new Float32Array(model));
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
    // Until the producer supplies actual deformation/instance history, reject
    // those pixels as reactive rather than pretending rigid motion is enough.
    const reactive = item.writesReactive || item.skinning || item.morphTargets?.length || item.instanceTransforms?.length ? 1 : 0;
    return { ...item, temporalObjectKey: key, [velocityContext]: {
      matrices: this.prepared, objectKey: key, previousModel: new Float32Array(baseline ?? model), reactive, owner: this, mrtWritable
    } } as ContextItem;
  }

  get coverage(): VelocityCoverage { return { ...this.currentCoverage }; }
  ownsMatrices(matrices: TemporalCameraMatrices): boolean { return this.prepared === matrices && this.activeFrame !== undefined; }
  jitter(width: number, height: number): readonly [number, number] {
    return temporalJitter(this.frame, this.previousViewProjection !== undefined, width, height);
  }
  commit(frameId: TemporalFrameId | undefined = this.activeFrame): void {
    if (frameId === undefined || frameId !== this.activeFrame || frameId === this.committedFrame || !this.prepared) return;
    this.previousViewProjection = new Float32Array(this.prepared.unjittered);
    this.previousModels = new Map(this.pendingModels);
    this.committedFrame = frameId;
    this.frame += 1;
  }
  cancel(frameId: TemporalFrameId | undefined = this.activeFrame): boolean {
    if (frameId === undefined || frameId !== this.activeFrame || frameId === this.committedFrame) return false;
    this.framePreviousModels = new Map();
    this.pendingModels.clear();
    this.pendingPreviousModels.clear();
    this.counted.clear();
    this.activeFrame = undefined;
    this.prepared = undefined;
    this.implicit = false;
    this.preparedJitter = [0, 0];
    this.currentCoverage = emptyCoverage();
    return true;
  }
  reset(_reason: TemporalResetReason): void {
    this.previousViewProjection = undefined;
    this.previousModels.clear();
    this.framePreviousModels.clear();
    this.pendingModels.clear();
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
  /** Shared compatibility history; renderer and view owners should use a scoped history. */
  readonly history: TemporalHistoryLike;
  /** Return a fresh caller-owned history. Older custom providers may omit this capability. */
  readonly createHistory?: () => TemporalHistoryLike;
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

export const velocityHistorySlot = defineContractSlot<VelocitySurface>(
  "C-14", "prd03", "A3D_QR_POST", {
    kind: "legacy", history: new LegacyVelocityHistoryStub(), createHistory: createBuiltinLegacyHistory
  }
);

/**
 * Create a caller-owned history from the flag-selected provider. The original
 * slot history remains shared for legacy callers and unscoped reset only.
 */
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
  if (history === surface.history || history === velocityHistorySlot.stub.history || issuedScopedVelocityHistories.has(history)
    || (!freshBuiltin && !claimScopedTemporalHistory(history))) {
    throw new Error("A scoped velocity history factory must return a fresh history");
  }
  issuedScopedVelocityHistories.add(history);
  return history;
}

/** Legacy slot remains available; renderer-owned histories never use its singleton instance. */
export function provideVelocityHistory(): void {
  const history = new VelocityHistory();
  velocityHistorySlot.provide({ kind: "v2", history, createHistory: createBuiltinVelocityHistory });
  setTemporalHistoryImpl(history);
  setVelocityUniformBinder(velocityMrtBinder);
}
