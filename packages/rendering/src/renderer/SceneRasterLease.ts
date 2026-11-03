import { RenderDeviceError, type RenderDevice } from "../RenderDevice";
import { TemporalHistory, type TemporalFrameOptions, type TemporalGpuBindings, type TemporalRasterPlan } from "../TemporalHistory";
import type { RenderItem } from "../contracts/renderItem";
import type { TemporalFrameId, TemporalIdentity } from "../contracts/velocity";
import { assertSceneRasterSnapshotCurrent, type SceneRasterSnapshot } from "./SceneRasterSnapshot";

/**
 * A lifecycle draft, not permission to submit a draw. It does not authenticate
 * the renderer, target, participants, shader, or backend resources and is not
 * consumed by any rendering pass.
 */
export interface SceneRasterLeaseDraft { readonly snapshot: SceneRasterSnapshot }
export type SceneRasterLeaseDraftPhase = "pending" | "preparing" | "prepared" | "closed";

export interface SceneRasterLeaseDraftInput {
  readonly snapshot: SceneRasterSnapshot;
  readonly owner: object;
  readonly device: RenderDevice;
  readonly viewId: TemporalIdentity;
  readonly frameId: TemporalFrameId;
  readonly history: TemporalHistory;
  readonly plan: TemporalRasterPlan;
  /** Render-sized temporal input, which must match the snapshot's forward target. */
  readonly width: number;
  readonly height: number;
  readonly viewProjection: Float32Array | readonly number[];
  readonly options: TemporalFrameOptions;
}

interface DraftRecord extends SceneRasterLeaseDraftInput {
  phase: SceneRasterLeaseDraftPhase;
  busy: boolean;
  bindings?: TemporalGpuBindings;
}

const records = new WeakMap<SceneRasterLeaseDraft, DraftRecord>();
// A temporal plan is shared by repeated equivalent planFrame calls. A single
// draft coordinates its consumption; direct TemporalHistory users may still
// invalidate it, which the temporal owner's own checks will detect.
const claims = new WeakMap<TemporalRasterPlan, SceneRasterLeaseDraft>();
const assertPendingPlan = TemporalHistory.prototype.assertPlanCurrent;
const preparePlan = TemporalHistory.prototype.preparePlanned;
const cancelPlan = TemporalHistory.prototype.cancelPlan;
const assertPreparedPlan = TemporalHistory.prototype.assertPreparedPlanCurrent;

function stale(message: string): never {
  throw new RenderDeviceError(message, "SCENE_RASTER_DRAFT_STALE");
}

function recordFor(draft: SceneRasterLeaseDraft): DraftRecord {
  const record = records.get(draft);
  if (!record) return stale("Unknown scene raster lifecycle draft");
  return record;
}

function sameValues(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function checkSnapshot(record: DraftRecord): void {
  const { snapshot, owner, device, viewId, frameId, plan, width, height } = record;
  assertSceneRasterSnapshotCurrent(snapshot, owner, device, viewId, frameId);
  if (snapshot.targetExtent.width !== width || snapshot.targetExtent.height !== height ||
      plan.viewId !== viewId || plan.frameId !== frameId ||
      !sameValues(snapshot.unjitteredViewProjectionMatrix, plan.unjittered) ||
      !sameValues(snapshot.viewProjectionMatrix, plan.jittered) || !sameValues(snapshot.jitterClip, plan.jitterClip)) {
    stale("Temporal plan and scene raster snapshot do not match");
  }
}

function checkPending(record: DraftRecord): void {
  // Reject unknown snapshots before invoking temporal methods; consult the
  // temporal owner's opaque plan before inspecting the plan's values.
  assertSceneRasterSnapshotCurrent(record.snapshot, record.owner, record.device, record.viewId, record.frameId);
  Reflect.apply(assertPendingPlan, record.history, [record.plan, record.device, record.width, record.height,
    record.viewProjection, record.options]);
  checkSnapshot(record);
}

function checkPrepared(record: DraftRecord): void {
  const bindings = record.bindings;
  if (!bindings) return stale("Prepared temporal bindings are unavailable");
  Reflect.apply(assertPreparedPlan, record.history, [record.plan, bindings]);
  checkSnapshot(record);
  const prepared = bindings.v2;
  if (!prepared || !sameValues(prepared.jittered, record.snapshot.viewProjectionMatrix) ||
      !sameValues(prepared.unjittered, record.snapshot.unjitteredViewProjectionMatrix) ||
      !sameValues(prepared.jitterClip, record.snapshot.jitterClip)) {
    stale("Prepared temporal bindings no longer match the scene raster snapshot");
  }
}

function close(draft: SceneRasterLeaseDraft, record: DraftRecord): void {
  record.phase = "closed";
  if (claims.get(record.plan) === draft) claims.delete(record.plan);
}

function enter(record: DraftRecord): void {
  if (record.busy) return stale("Scene raster lifecycle draft is already in use");
  record.busy = true;
}

/**
 * Coordinate a borrowed plan and copied raster values without allocating GPU
 * resources or changing history. The draft does not certify that the copied
 * values came from the renderer, nor reserve or lease any target or participant.
 */
export function createSceneRasterLeaseDraft(input: SceneRasterLeaseDraftInput): SceneRasterLeaseDraft {
  if (!(input.history instanceof TemporalHistory)) return stale("A TemporalHistory instance is required");
  if (claims.has(input.plan)) return stale("This temporal plan already has a lifecycle draft");
  const draft: SceneRasterLeaseDraft = Object.freeze({ snapshot: input.snapshot });
  const record: DraftRecord = { ...input, phase: "pending", busy: false };
  claims.set(record.plan, draft);
  try {
    checkPending(record);
    records.set(draft, record);
    return draft;
  } catch (error) {
    if (claims.get(record.plan) === draft) claims.delete(record.plan);
    throw error;
  }
}

/** Current stage only; it does not validate the draft's plan or device. */
export function sceneRasterLeaseDraftPhase(draft: SceneRasterLeaseDraft): SceneRasterLeaseDraftPhase {
  return recordFor(draft).phase;
}

/**
 * Check lifecycle state without cancelling or consuming a pending plan. A
 * stale prepared draft is closed locally because its plan is already spent.
 */
export function assertSceneRasterLeaseDraftCurrent(draft: SceneRasterLeaseDraft): void {
  const record = recordFor(draft);
  enter(record);
  try {
    if (record.phase === "pending") return checkPending(record);
    if (record.phase === "prepared") {
      try { return checkPrepared(record); }
      catch (error) { close(draft, record); throw error; }
    }
    return stale("Scene raster lifecycle draft is closed or being prepared");
  } finally { record.busy = false; }
}

/** Consume the borrowed plan once at the existing temporal preparation phase. */
export function prepareSceneRasterLeaseDraft(draft: SceneRasterLeaseDraft, items: readonly RenderItem[]): TemporalGpuBindings {
  const record = recordFor(draft);
  enter(record);
  try {
    if (record.phase !== "pending") return stale("Scene raster lifecycle draft is not pending");
    checkPending(record);
    record.phase = "preparing";
    try {
      const bindings = Reflect.apply(preparePlan, record.history, [record.plan, record.device, record.width, record.height,
        items, record.viewProjection, record.options]) as TemporalGpuBindings;
      record.bindings = bindings;
      checkPrepared(record);
      record.phase = "prepared";
      return bindings;
    } catch (error) {
      close(draft, record);
      try { Reflect.apply(cancelPlan, record.history, [record.plan]); }
      catch (cleanup) { throw new AggregateError([error, cleanup], "Temporal preparation and draft cancellation failed"); }
      throw error;
    }
  } finally { record.busy = false; }
}

/** Close this draft, explicitly cancelling its borrowed plan only if still pending. */
export function cancelSceneRasterLeaseDraft(draft: SceneRasterLeaseDraft): boolean {
  const record = recordFor(draft);
  enter(record);
  try {
    if (record.phase === "closed") return false;
    if (record.phase === "preparing") return stale("Cannot cancel a scene raster draft during preparation");
    const wasPending = record.phase === "pending";
    close(draft, record);
    return wasPending ? Reflect.apply(cancelPlan, record.history, [record.plan]) as boolean : false;
  } finally { record.busy = false; }
}
