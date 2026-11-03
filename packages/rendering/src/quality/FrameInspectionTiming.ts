/** The existing frame-statistics sample, whose GPU result may settle later. */
export interface InspectionGpuSample {
  readonly gpuMs: number | null;
}

/** A shared owner of query results. The owner, not this helper, polls the backend. */
export interface InspectionGpuSamplePoller {
  pollGpuResults(): void;
}

/** Opaque per-render identity; the same frame number may be attempted twice. */
export interface InspectionTimingCapture {
  readonly frameNumber: number;
}

/** Opaque identity for one view in one inspection capture. */
export interface InspectionViewCapture {
  readonly viewId: string | number;
}

export interface InspectionViewGpuTiming {
  readonly viewId: string | number;
  readonly gpuTimeMs: number | null;
}

export interface InspectionGpuTimingSnapshot {
  readonly frameNumber: number;
  /** These are scoped view timings, not full-frame measurements. */
  readonly coverage: "view-collect-through-after-output";
  readonly wholeFrameGpuTimeMs: null;
  readonly closed: boolean;
  readonly truncated: boolean;
  readonly views: readonly InspectionViewGpuTiming[];
}

interface ViewState {
  readonly handle: InspectionViewCapture;
  readonly capture: CaptureState;
  sample: InspectionGpuSample | null;
  poller: InspectionGpuSamplePoller | null;
  finished: boolean;
}

interface CaptureState {
  readonly handle: InspectionTimingCapture;
  readonly views: ViewState[];
  readonly viewIds: Set<string | number>;
  closed: boolean;
  retained: boolean;
  truncated: boolean;
}

/**
 * Per-renderer history of existing frame-statistics samples.
 *
 * A producer creates a unique view handle when its query starts, then attaches
 * that query's own sample when it ends. The same sample cannot be attached to
 * another view or render capture. Snapshot polling goes through the existing
 * statistics owner, once per owner, so this helper never drains or creates a
 * second GPU query backend. Query results remain associated with their source
 * sample even when they arrive after newer frames.
 *
 * The current producer brackets only each view's collect-to-after-output
 * interval. It does not establish a whole-render GPU duration, especially for
 * multi-view composition, failed frames, or alternate drawing paths.
 */
export class FrameInspectionTiming {
  private readonly captures: CaptureState[] = [];
  private readonly byCapture = new WeakMap<InspectionTimingCapture, CaptureState>();
  private readonly byView = new WeakMap<InspectionViewCapture, ViewState>();
  private readonly usedSamples = new WeakSet<InspectionGpuSample>();
  private disposed = false;

  constructor(private readonly capacity = 120, private readonly maxViews = 128) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096) {
      throw new RangeError("Inspection timing capacity must be an integer from 1 to 4096.");
    }
    if (!Number.isSafeInteger(maxViews) || maxViews < 1 || maxViews > 4096) {
      throw new RangeError("Inspection timing view limit must be an integer from 1 to 4096.");
    }
  }

  begin(frameNumber: number): InspectionTimingCapture {
    if (this.disposed) throw new Error("Inspection timing has been disposed.");
    if (!Number.isSafeInteger(frameNumber) || frameNumber < 0) {
      throw new RangeError("Frame number must be a non-negative safe integer.");
    }
    const handle = Object.freeze({ frameNumber });
    const state: CaptureState = { handle, views: [], viewIds: new Set(), closed: false, retained: true, truncated: false };
    this.byCapture.set(handle, state);
    this.captures.push(state);
    while (this.captures.length > this.capacity) this.retire(this.captures.shift()!);
    return handle;
  }

  /** Begin one view before the existing statistics owner starts its query. */
  beginView(capture: InspectionTimingCapture, viewId: string | number): InspectionViewCapture | null {
    const state = this.byCapture.get(capture);
    if (!state?.retained || state.closed || this.disposed || !validViewId(viewId)) return null;
    if (state.viewIds.has(viewId)) return null;
    if (state.views.length >= this.maxViews) {
      state.truncated = true;
      return null;
    }
    const handle = Object.freeze({ viewId });
    const view: ViewState = { handle, capture: state, sample: null, poller: null, finished: false };
    state.viewIds.add(viewId);
    state.views.push(view);
    this.byView.set(handle, view);
    return handle;
  }

  /** Attach the exact sample returned by this view's tracked statistics scope. */
  finishView(handle: InspectionViewCapture, sample: InspectionGpuSample, poller: InspectionGpuSamplePoller): boolean {
    const view = this.byView.get(handle);
    if (!view || !view.capture.retained || view.capture.closed || view.finished || this.disposed) return false;
    if (!sample || typeof sample !== "object" || this.usedSamples.has(sample)) return false;
    if (!poller || typeof poller.pollGpuResults !== "function") return false;
    this.usedSamples.add(sample);
    view.sample = sample;
    view.poller = poller;
    view.finished = true;
    return true;
  }

  /** Close after the render attempt; uncompleted views remain visible as null. */
  end(capture: InspectionTimingCapture): void {
    const state = this.byCapture.get(capture);
    if (state?.retained) state.closed = true;
  }

  snapshot(capture: InspectionTimingCapture): InspectionGpuTimingSnapshot | null {
    return this.snapshots([capture])[0] ?? null;
  }

  /** Read several captures while polling each shared query owner only once. */
  snapshots(captures: readonly InspectionTimingCapture[]): readonly (InspectionGpuTimingSnapshot | null)[] {
    const states = captures.map((capture) => this.byCapture.get(capture));
    const polled = new Set<InspectionGpuSamplePoller>();
    for (const state of states) {
      if (!state?.retained || this.disposed) continue;
      for (const view of state.views) {
        if (!view.poller || polled.has(view.poller)) continue;
        polled.add(view.poller);
        try { view.poller.pollGpuResults(); } catch { /* Diagnostics must not fail rendering. */ }
      }
    }
    return states.map((state) => state?.retained && !this.disposed ? this.snapshotState(state) : null);
  }

  private snapshotState(state: CaptureState): InspectionGpuTimingSnapshot {
    return {
      frameNumber: state.handle.frameNumber,
      coverage: "view-collect-through-after-output",
      wholeFrameGpuTimeMs: null,
      closed: state.closed,
      truncated: state.truncated,
      views: state.views.map((view) => ({ viewId: view.handle.viewId, gpuTimeMs: readGpuTime(view.sample) }))
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const capture of this.captures) this.retire(capture);
    this.captures.length = 0;
  }

  private retire(state: CaptureState): void {
    state.closed = true;
    state.retained = false;
    for (const view of state.views) {
      view.sample = null;
      view.poller = null;
    }
  }
}

interface InspectionViewBinding {
  readonly timing: FrameInspectionTiming;
  readonly view: InspectionViewCapture;
  readonly identity: object;
  cancel?: () => void;
}

// A FrameGraph blackboard is already unique to one renderer view. Keeping the
// binding outside its public map avoids adding a contract field or sharing an
// active frame through device/global "latest" state.
const bindingsByBlackboard = new WeakMap<object, InspectionViewBinding>();

export function bindFrameInspectionView(
  blackboard: object,
  timing: FrameInspectionTiming,
  capture: InspectionTimingCapture,
  viewId: string | number
): boolean {
  closeFrameInspectionView(blackboard);
  const view = timing.beginView(capture, viewId);
  if (!view) return false;
  bindingsByBlackboard.set(blackboard, { timing, view, identity: {} });
  return true;
}

/** Register cleanup for the query belonging to this blackboard's tracked view. */
export function attachFrameInspectionCancel(blackboard: object, cancel: () => void): object | undefined {
  const binding = bindingsByBlackboard.get(blackboard);
  if (!binding || binding.cancel) return undefined;
  binding.cancel = cancel;
  return binding.identity;
}

/** Publish only the sample belonging to this exact blackboard and view. */
export function commitFrameInspectionView(
  blackboard: object,
  sample: InspectionGpuSample,
  poller: InspectionGpuSamplePoller,
  expectedBinding: object | undefined
): boolean {
  const binding = bindingsByBlackboard.get(blackboard);
  if (!binding || !expectedBinding || binding.identity !== expectedBinding) return false;
  bindingsByBlackboard.delete(blackboard);
  return binding.timing.finishView(binding.view, sample, poller);
}

/** A failed or interrupted frame closes only its own outstanding query. */
export function closeFrameInspectionView(blackboard: object): void {
  const binding = bindingsByBlackboard.get(blackboard);
  if (!binding) return;
  bindingsByBlackboard.delete(blackboard);
  try { binding.cancel?.(); } catch { /* Diagnostic cleanup must not mask a render error. */ }
}

function validViewId(viewId: string | number): boolean {
  return typeof viewId === "string" ? viewId.length > 0 : typeof viewId === "number" && Number.isFinite(viewId);
}

function readGpuTime(sample: InspectionGpuSample | null): number | null {
  if (!sample) return null;
  try {
    const value = sample.gpuMs;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}
