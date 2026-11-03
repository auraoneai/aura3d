/** The existing frame-statistics sample, whose GPU result may settle later. */
export interface InspectionGpuSample {
  readonly gpuMs: number | null;
}

/** A shared owner of query results. The owner, not this helper, polls the backend. */
export interface InspectionGpuSamplePoller {
  pollGpuResults(): void;
  /** Distinguishes a pending `gpuMs: null` from a discarded one. */
  gpuSampleStatus?(sample: object): "unavailable" | "pending" | "measured" | "discarded";
}

/**
 * The frame's timer-query owner (the device `FrameStats`). Non-view ranges are
 * issued on the same backend as the per-view queries, strictly between them,
 * so a TIME_ELAPSED backend never has two queries open.
 */
export interface InspectionFrameRangeSource extends InspectionGpuSamplePoller {
  readonly gpuTimingSupported: boolean;
  beginSegment(name: string): object | null;
  endSegment(token: object, settle: (durationMs: number | null) => void): boolean;
}

export type WholeFrameGpuStatus = "unavailable" | "pending" | "measured" | "discarded";

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
  /**
   * Whole-frame GPU time: the sum of consecutive, non-overlapping ranges that
   * tile the render call (non-view ranges plus every view range). `null`
   * while pending, after a disjoint/invalid result, or when unsupported.
   */
  readonly wholeFrameGpuTimeMs: number | null;
  readonly wholeFrameGpuStatus: WholeFrameGpuStatus;
  /** Present whenever `wholeFrameGpuTimeMs` is null. */
  readonly wholeFrameGpuReason?: string;
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

interface RangeState {
  status: "pending" | "measured" | "discarded";
  durationMs: number;
}

interface CaptureState {
  readonly handle: InspectionTimingCapture;
  readonly views: ViewState[];
  readonly viewIds: Set<string | number>;
  closed: boolean;
  retained: boolean;
  truncated: boolean;
  readonly source: InspectionFrameRangeSource | null;
  readonly unavailableReason: string;
  /** Non-view ranges, in issue order. */
  readonly ranges: RangeState[];
  openRange: object | null;
  /** The view whose own query currently replaces the non-view range. */
  activeView: ViewState | null;
  /** First reason the ranges no longer tile the frame. */
  broken: string | null;
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
 * Whole-frame GPU time uses disjoint consecutive ranges on the same backend:
 * a non-view range is open from `begin` until a view's query starts
 * (`pauseView`), each view's own query covers that view, and a new non-view
 * range starts when the view's query ends; `end` closes the last range. The
 * frame total is the sum of all of them and is reported only when every range
 * settled with a valid result; a cancelled view, a GPU_DISJOINT_EXT discard or
 * a query that could not start makes the frame total null with a reason.
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

  begin(
    frameNumber: number,
    source?: InspectionFrameRangeSource | null,
    unavailableReason = "GPU timer queries unavailable"
  ): InspectionTimingCapture {
    if (this.disposed) throw new Error("Inspection timing has been disposed.");
    if (!Number.isSafeInteger(frameNumber) || frameNumber < 0) {
      throw new RangeError("Frame number must be a non-negative safe integer.");
    }
    const handle = Object.freeze({ frameNumber });
    const timed = source && source.gpuTimingSupported ? source : null;
    const state: CaptureState = { handle, views: [], viewIds: new Set(), closed: false, retained: true, truncated: false,
      source: timed, unavailableReason: source ? unavailableReason : "No frame timer-query owner was supplied",
      ranges: [], openRange: null, activeView: null, broken: null };
    this.byCapture.set(handle, state);
    this.captures.push(state);
    while (this.captures.length > this.capacity) this.retire(this.captures.shift()!);
    this.openRange(state);
    return handle;
  }

  /**
   * Call immediately before the view's own query starts: ends the open
   * non-view range so the two never overlap.
   */
  pauseView(handle: InspectionViewCapture): void {
    const view = this.byView.get(handle);
    if (!view || view.finished || this.disposed) return;
    const state = view.capture;
    if (!state.retained || state.closed || !state.source) return;
    if (state.activeView === view) return;
    if (state.activeView) {
      state.broken ??= "Two view queries overlapped within one frame.";
      return;
    }
    this.closeRange(state);
    state.activeView = view;
  }

  /** A view's query was cancelled: its interval is unmeasured. */
  abandonView(handle: InspectionViewCapture): void {
    const view = this.byView.get(handle);
    if (!view) return;
    const state = view.capture;
    if (state.activeView !== view) return;
    state.activeView = null;
    state.broken ??= "A view's GPU query was cancelled, so part of the frame is unmeasured.";
    if (state.retained && !state.closed) this.openRange(state);
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
    const state = view.capture;
    if (state.source) {
      if (state.activeView === view) {
        state.activeView = null;
        if (poller !== state.source) state.broken ??= "A view was timed by a different query owner than the frame.";
        this.openRange(state);
      } else {
        // The view's query overlapped a non-view range; summing would double count.
        state.broken ??= "A view's GPU query was not separated from the frame's non-view range.";
      }
    }
    return true;
  }

  /** Close after the render attempt; uncompleted views remain visible as null. */
  end(capture: InspectionTimingCapture): void {
    const state = this.byCapture.get(capture);
    if (!state?.retained || state.closed) return;
    if (state.activeView) {
      state.activeView = null;
      state.broken ??= "A view's GPU query did not finish before the frame ended.";
    }
    this.closeRange(state);
    state.closed = true;
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
      if (state.source && !polled.has(state.source)) {
        polled.add(state.source);
        try { state.source.pollGpuResults(); } catch { /* Diagnostics must not fail rendering. */ }
      }
      for (const view of state.views) {
        if (!view.poller || polled.has(view.poller)) continue;
        polled.add(view.poller);
        try { view.poller.pollGpuResults(); } catch { /* Diagnostics must not fail rendering. */ }
      }
    }
    return states.map((state) => state?.retained && !this.disposed ? this.snapshotState(state) : null);
  }

  private snapshotState(state: CaptureState): InspectionGpuTimingSnapshot {
    const whole = this.wholeFrame(state);
    return {
      frameNumber: state.handle.frameNumber,
      coverage: "view-collect-through-after-output",
      wholeFrameGpuTimeMs: whole.ms,
      wholeFrameGpuStatus: whole.status,
      ...(whole.reason ? { wholeFrameGpuReason: whole.reason } : {}),
      closed: state.closed,
      truncated: state.truncated,
      views: state.views.map((view) => ({ viewId: view.handle.viewId, gpuTimeMs: readGpuTime(view.sample) }))
    };
  }

  private wholeFrame(state: CaptureState): { readonly status: WholeFrameGpuStatus; readonly ms: number | null; readonly reason?: string } {
    if (!state.source) return { status: "unavailable", ms: null, reason: state.unavailableReason };
    if (state.broken) return { status: "discarded", ms: null, reason: state.broken };
    if (state.truncated) return { status: "discarded", ms: null, reason: "View limit exceeded; untracked views are unmeasured." };
    if (!state.closed) return { status: "pending", ms: null, reason: "Frame has not finished." };
    let total = 0;
    let pending = false;
    for (const range of state.ranges) {
      if (range.status === "discarded") return { status: "discarded", ms: null, reason: DISCARDED_REASON };
      if (range.status === "pending") pending = true;
      else total += range.durationMs;
    }
    for (const view of state.views) {
      if (!view.finished || !view.sample) continue; // Never started its own query: covered by a non-view range.
      const value = readGpuTime(view.sample);
      if (value !== null) { total += value; continue; }
      const status = view.poller?.gpuSampleStatus?.(view.sample) ?? "pending";
      if (status === "pending") pending = true;
      else return { status: "discarded", ms: null, reason: DISCARDED_REASON };
    }
    if (pending) return { status: "pending", ms: null, reason: "GPU query results are not yet available." };
    return Number.isFinite(total) ? { status: "measured", ms: total } : { status: "discarded", ms: null, reason: DISCARDED_REASON };
  }

  private openRange(state: CaptureState): void {
    const source = state.source;
    if (!source || state.openRange || state.closed || this.disposed) return;
    let token: object | null = null;
    try { token = source.beginSegment("inspection.frame-range"); } catch { token = null; }
    if (!token) {
      state.broken ??= "A GPU query for a non-view frame range could not start.";
      return;
    }
    state.openRange = token;
  }

  private closeRange(state: CaptureState): void {
    const token = state.openRange;
    const source = state.source;
    if (!token || !source) return;
    state.openRange = null;
    const range: RangeState = { status: "pending", durationMs: 0 };
    state.ranges.push(range);
    let ended = false;
    try {
      ended = source.endSegment(token, (durationMs) => {
        if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) range.status = "discarded";
        else { range.status = "measured"; range.durationMs = durationMs; }
      });
    } catch { ended = false; }
    if (!ended) range.status = "discarded";
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const capture of this.captures) this.retire(capture);
    this.captures.length = 0;
  }

  private retire(state: CaptureState): void {
    // Release an open range so the backend is free for the next query.
    if (!state.closed) this.closeRange(state);
    state.activeView = null;
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
  binding.timing.abandonView(binding.view);
}

const DISCARDED_REASON = "A frame GPU query was discarded (GPU_DISJOINT_EXT, expiry or invalid result).";

/** Called by the view's timing producer immediately before its own query begins. */
export function pauseFrameInspectionRange(blackboard: object): void {
  const binding = bindingsByBlackboard.get(blackboard);
  if (binding) binding.timing.pauseView(binding.view);
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
