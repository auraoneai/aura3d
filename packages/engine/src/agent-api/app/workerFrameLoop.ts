import type { OffscreenCanvasSize } from "./canvas.js";

export type WorkerFrameFailureKind = "recoverable" | "terminal";

export interface WorkerScheduledFrame<Input> {
  /** Bounded automatic render time in milliseconds, or the explicit manual-step time. */
  readonly time: number;
  readonly deltaSeconds: number;
  readonly source: "automatic" | "manual";
  /** The newest input snapshot when this frame starts. */
  readonly input: Input | undefined;
}

export interface WorkerFrameSchedulerOptions<Input> {
  readonly onFrame: (frame: WorkerScheduledFrame<Input>) => void | Promise<void>;
  readonly applyResize: (size: OffscreenCanvasSize) => void | Promise<void>;
  readonly resetHistory: (reason: "resume" | "resize") => void | Promise<void>;
  readonly classifyError?: (error: unknown) => WorkerFrameFailureKind;
  readonly onError?: (error: unknown, kind: WorkerFrameFailureKind) => void;
  /** Maximum automatic elapsed time. Manual steps are never clamped. Default 0.1 seconds. */
  readonly maxDeltaSeconds?: number;
  /** Both overrides must be supplied together; defaults to worker rAF or a timer. */
  readonly requestFrame?: (callback: (time: number) => void) => number;
  readonly cancelFrame?: (handle: number) => void;
}

export interface WorkerFrameScheduler<Input> {
  start(): void;
  pause(): void;
  resume(): void;
  setVisible(visible: boolean): void;
  /** Input must be structured-cloneable. A defensive snapshot is taken at receipt and per frame. */
  setInput(input: Input): void;
  /** Applies the latest size immediately while visible; hidden sizes are coalesced. */
  resize(size: OffscreenCanvasSize): Promise<void>;
  /** Explicit steps are valid while paused or hidden and use the exact supplied delta. */
  step(deltaSeconds: number, time?: number): Promise<void>;
  /** Wait for submitted frame and resize operations before mutating shared renderer resources. */
  whenIdle(): Promise<void>;
  runExclusive<T>(operation: () => T | Promise<T>): Promise<T>;
  status(): { readonly running: boolean; readonly visible: boolean; readonly terminal: boolean; readonly disposed: boolean };
  /** Stop immediately; wait for in-flight work before destroying renderer resources. */
  dispose(): Promise<void>;
}

/**
 * Serial scheduler for a renderer owned by a worker. Automatic frames suspend
 * when hidden; explicit steps stay deterministic. Automatic rendering resumes
 * from the last manual frame without including time spent paused or hidden.
 * Only the latest hidden resize/input is applied when work resumes.
 */
export function createWorkerFrameScheduler<Input>(options: WorkerFrameSchedulerOptions<Input>): WorkerFrameScheduler<Input> {
  const maxDelta = options.maxDeltaSeconds ?? 0.1;
  if (!Number.isFinite(maxDelta) || maxDelta <= 0) throw new RangeError("maxDeltaSeconds must be positive and finite.");
  if ((options.requestFrame === undefined) !== (options.cancelFrame === undefined)) {
    throw new Error("requestFrame and cancelFrame must be supplied together.");
  }
  const hasRaf = typeof globalThis.requestAnimationFrame === "function" && typeof globalThis.cancelAnimationFrame === "function";
  const requestFrame = options.requestFrame ?? (hasRaf
    ? (callback: (time: number) => void) => globalThis.requestAnimationFrame(callback)
    // Browsers return a number; Node-shaped test hosts return a Timeout object,
    // which is passed through unchanged to their matching clearTimeout.
    : (callback: (time: number) => void) => globalThis.setTimeout(() => callback((typeof performance !== "undefined" ? performance.now() : Date.now())), 8) as unknown as number);
  const cancelFrame = options.cancelFrame ?? (hasRaf
    ? (handle: number) => globalThis.cancelAnimationFrame(handle)
    : (handle: number) => globalThis.clearTimeout(handle));
  let running = false;
  let visible = true;
  let terminal = false;
  let disposed = false;
  let handle: number | undefined;
  let generation = 0;
  let automaticPending = false;
  let previousAutomaticTime: number | undefined;
  let renderTime = 0;
  let input: Input | undefined;
  let pendingResize: OffscreenCanvasSize | undefined;
  let historyPending = false;
  let tail: Promise<void> = Promise.resolve();

  const cloneInput = (value: Input | undefined): Input | undefined => {
    if (value === undefined) return undefined;
    if (typeof structuredClone !== "function") throw new Error("Worker input snapshots require structuredClone.");
    return structuredClone(value);
  };

  const cancelScheduled = (): void => {
    generation += 1;
    const scheduled = handle;
    handle = undefined;
    if (scheduled !== undefined) cancelFrame(scheduled);
  };
  const assertActive = (): void => {
    if (disposed) throw new Error("Worker frame scheduler is disposed.");
    if (terminal) throw new Error("Worker frame scheduler stopped after a terminal error.");
  };
  const reportFailure = (error: unknown): void => {
    if (disposed) return;
    let kind: WorkerFrameFailureKind = "terminal";
    try { kind = options.classifyError?.(error) === "recoverable" ? "recoverable" : "terminal"; } catch { /* a failed classifier is terminal */ }
    // The classifier (or the frame-cancellation hook below) can synchronously
    // dispose the scheduler; never notify observers after that happens.
    if (disposed) return;
    if (kind === "terminal") {
      terminal = true;
      running = false;
      cancelScheduled();
    }
    if (!disposed) {
      try { options.onError?.(error, kind); } catch { /* reporting must not mask the original failure */ }
    }
  };
  const enqueue = <T>(operation: () => T | Promise<T>, report = true): Promise<T> => {
    const result = tail.then(async () => {
      assertActive();
      try { return await operation(); } catch (error) { if (report) reportFailure(error); throw error; }
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const maintain = async (): Promise<void> => {
    const resize = pendingResize;
    if (resize) {
      pendingResize = undefined;
      try {
        await options.applyResize(resize);
      } catch (error) {
        if (!disposed && pendingResize === undefined) pendingResize = resize;
        throw error;
      }
      if (disposed) return;
      await options.resetHistory("resize");
    }
    if (historyPending && !disposed) {
      await options.resetHistory("resume");
      historyPending = false;
    }
  };
  const schedule = (): void => {
    if (!running || !visible || disposed || terminal || handle !== undefined || automaticPending) return;
    const ticket = generation;
    handle = requestFrame((time) => {
      if (ticket !== generation || disposed || terminal || !running || !visible) return;
      handle = undefined;
      automaticPending = true;
      const safeTime = Number.isFinite(time) ? time : (typeof performance !== "undefined" ? performance.now() : Date.now());
      const deltaSeconds = previousAutomaticTime === undefined ? 0 : Math.min(maxDelta, Math.max(0, (safeTime - previousAutomaticTime) / 1000));
      previousAutomaticTime = safeTime;
      void enqueue(async () => {
        // Visibility can change while a manual operation is ahead of this frame.
        if (ticket !== generation || !running || !visible || disposed) return;
        await maintain();
        if (ticket === generation && !disposed && running && visible) {
          // Render-time animation must use the same bounded clock as simulation.
          // Do not advance it for a frame cancelled while waiting for maintenance.
          renderTime += deltaSeconds * 1000;
          await options.onFrame({ time: renderTime, deltaSeconds, source: "automatic", input: cloneInput(input) });
        }
      }).catch(() => undefined).finally(() => {
        automaticPending = false;
        schedule();
      });
    });
  };
  const begin = (): void => {
    assertActive();
    if (running) return;
    running = true;
    previousAutomaticTime = undefined;
    schedule();
  };
  return {
    start: begin,
    pause() {
      if (disposed || terminal || !running) return;
      running = false;
      previousAutomaticTime = undefined;
      historyPending = true;
      cancelScheduled();
    },
    resume() {
      if (!running) historyPending = true;
      begin();
    },
    setVisible(next) {
      if (disposed || terminal || visible === next) return;
      visible = next;
      previousAutomaticTime = undefined;
      historyPending = true;
      if (!visible) cancelScheduled();
      else {
        // Maintenance runs before any subsequently submitted frame, even when paused.
        void enqueue(async () => { if (visible) await maintain(); }).catch(() => undefined);
        schedule();
      }
    },
    setInput(next) { assertActive(); input = cloneInput(next); },
    resize(size) {
      assertActive();
      if (!Number.isFinite(size.width) || size.width <= 0 || !Number.isFinite(size.height) || size.height <= 0 || !Number.isFinite(size.pixelRatio) || size.pixelRatio <= 0) {
        return Promise.reject(new RangeError("Worker resize requires positive finite width, height and pixelRatio."));
      }
      pendingResize = { width: size.width, height: size.height, pixelRatio: size.pixelRatio };
      return visible ? enqueue(async () => { if (visible) await maintain(); }) : Promise.resolve();
    },
    step(deltaSeconds, time) {
      assertActive();
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || (time !== undefined && !Number.isFinite(time))) {
        return Promise.reject(new RangeError("Manual frame delta and time must be finite, with a nonnegative delta."));
      }
      return enqueue(async () => {
        await maintain();
        if (!disposed) {
          const frameTime = time ?? renderTime + deltaSeconds * 1000;
          await options.onFrame({ time: frameTime, deltaSeconds, source: "manual", input: cloneInput(input) });
          renderTime = frameTime;
        }
      });
    },
    whenIdle: () => tail,
    runExclusive: (operation) => enqueue(async () => {
      await maintain();
      assertActive();
      return operation();
    }, false),
    status: () => ({ running, visible, terminal, disposed }),
    dispose() {
      if (!disposed) {
        disposed = true;
        running = false;
        cancelScheduled();
        pendingResize = undefined;
        input = undefined;
      }
      return tail;
    }
  };
}
