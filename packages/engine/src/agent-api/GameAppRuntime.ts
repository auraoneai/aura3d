import type {
  AuraAppFrame,
  AuraAppFrameCallback,
  AuraAppHandle,
  AuraAppScreenshot
} from "./AuraAppHandle";
import type {
  GameInputController,
  GameInputOptions
} from "./GameRuntimeCore.js";
import type {
  GameRuntimeEvidence,
  GameRuntimeEvidenceOptions
} from "./GameEvidence";
import {
  createFrameLoop,
  type FrameLoopOptions,
  type FrameLoopSnapshot,
  type FrameLoopTickCallback
} from "./FrameLoop";
import { StubTimeController, type AuraTimeController } from "../contracts/time";
import { resolveQrFlags } from "../contracts/flags.js";
import {
  createPerformanceGovernor,
  type GamePerFramePerfTelemetry,
  type GamePerformanceGovernorMode,
  type GamePerformanceGovernorSettings,
  type SideViewGamePerformanceBudget
} from "../production-runtime/GameRenderPreset.js";
import type { AuraQualityController } from "@aura3d/rendering/contracts";

export type GameAppRuntimeStatus = "idle" | "running" | "paused" | "disposed";

export interface GameAppRuntimeLoopOptions extends Omit<FrameLoopOptions, "autoStart"> {}

export interface GameAppRuntimeResize {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface GameAppRuntimeEvidence {
  readonly kind: "aura-game-app-runtime-evidence";
  readonly status: GameAppRuntimeStatus;
  readonly running: boolean;
  readonly paused: boolean;
  readonly disposed: boolean;
  readonly started: boolean;
  readonly frame: number;
  readonly time: number;
  readonly fixedDt: number;
  readonly startCount: number;
  readonly pauseCount: number;
  readonly resumeCount: number;
  readonly stepCount: number;
  readonly resizeCount: number;
  readonly disposeCount: number;
  readonly inputControllers: number;
  readonly activeInputControllers: number;
  readonly lastResize?: GameAppRuntimeResize;
  readonly loop: FrameLoopSnapshot;
  readonly app: GameRuntimeEvidence;
  readonly perf?: GameAppRuntimePerformanceSnapshot;
}

export interface GameAppRuntimePerformanceSnapshot {
  readonly mode: GamePerformanceGovernorMode;
  readonly telemetry: GamePerFramePerfTelemetry;
  readonly settings: GamePerformanceGovernorSettings;
  readonly degraded: readonly string[];
  readonly polls: number;
}

export interface GameAppRuntimePerformanceBudgetOptions {
  readonly mode: GamePerformanceGovernorMode;
  readonly budget: SideViewGamePerformanceBudget;
  readonly sample?: () => GamePerFramePerfTelemetry;
  readonly apply?: (settings: GamePerformanceGovernorSettings) => void;
  readonly initial?: GamePerformanceGovernorSettings;
}

export interface GameAppRuntimeOptions {
  readonly autoStart?: boolean;
  readonly loop?: GameAppRuntimeLoopOptions;
  readonly input?: GameInputOptions | readonly GameInputOptions[];
  readonly evidence?: GameRuntimeEvidenceOptions;
  readonly performanceBudget?: GameAppRuntimePerformanceBudgetOptions;
  readonly qualityRebuild?: { readonly flags?: readonly string[] | Parameters<typeof resolveQrFlags>[0]["options"] };
}

export interface GameAppRuntime<TApp extends AuraAppHandle = AuraAppHandle> {
  readonly kind: "aura-game-app-runtime";
  readonly app: TApp;
  readonly input?: GameInputController;
  readonly status: GameAppRuntimeStatus;
  readonly running: boolean;
  readonly paused: boolean;
  readonly disposed: boolean;
  readonly evidence: GameAppRuntimeEvidence;
  readonly perf: GameAppRuntimePerformanceSnapshot | undefined;
  start(): GameAppRuntimeEvidence;
  pause(): GameAppRuntimeEvidence;
  resume(): GameAppRuntimeEvidence;
  step(dt?: number): GameAppRuntimeEvidence;
  pollPerformance(telemetry?: GamePerFramePerfTelemetry): GameAppRuntimePerformanceSnapshot | undefined;
  resize(width: number, height: number, pixelRatio?: number): GameAppRuntimeEvidence;
  onFrame(callback: AuraAppFrameCallback): () => void;
  offFrame(callback: AuraAppFrameCallback): void;
  /** Subscribe to once-per-tick emissions (including 0-substep hitStop/slowMo ticks). */
  onTick?(callback: FrameLoopTickCallback): () => void;
  inputController(options: GameInputOptions): GameInputController;
  screenshot(): AuraAppScreenshot;
  /** Effective time scale — `app.time.scale` when a C-23 controller is mounted. */
  readonly timeScale: number;
  /**
   * Clamps to [0, 4] (NaN throws `AURA_GAME_TIMESCALE_NAN`) and writes
   * `app.time.scale`. Returns the post-write evidence snapshot.
   */
  setTimeScale(scale: number): GameAppRuntimeEvidence;
  /**
   * Resolves with the frame index of the next presented frame after
   * `start()`, `step()` or `setScene()` (C-24 §9.3). Frame callbacks fire
   * before submission, so `raf`-sourced callbacks resolve on the following
   * `requestAnimationFrame` tick; `advance()` never resolves it (nothing is
   * presented). Calling again after a resolve returns a promise for the
   * frame after that — callers re-arm it per `setScene`. An optional signal
   * cancels only this wait. Pending waits reject with `AbortError` when the
   * runtime is disposed.
   */
  firstPresentedFrame(options?: { readonly signal?: AbortSignal }): Promise<number>;
  dispose(): GameAppRuntimeEvidence;
}

export function createGameAppRuntime<TApp extends AuraAppHandle>(
  app: TApp,
  options: GameAppRuntimeOptions = {}
): GameAppRuntime<TApp> {
  const resolvedFlags = resolveQrFlags({
    options: options.qualityRebuild?.flags,
    url: typeof location !== "undefined" ? location.href : undefined
  });
  const loop = createFrameLoop({ ...options.loop, autoStart: false, flags: resolvedFlags });
  const ownedInputs = new Set<GameInputController>();
  const frameCallbacks = new Set<AuraAppFrameCallback>();
  let status: GameAppRuntimeStatus = "idle";
  let started = false;
  let disposed = false;
  let startCount = 0;
  let pauseCount = 0;
  let resumeCount = 0;
  let stepCount = 0;
  let resizeCount = 0;
  let disposeCount = 0;
  let lastResize: GameAppRuntimeResize | undefined;
  const perfGovernorOptions = options.performanceBudget;
  // C-27 (Q-09-1 / #111): forward the app's quality controller whenever the
  // governor is active (mode !== "off") so a single authority owns non-
  // resolution quality knobs. `quality` exists on the mounted AuraApp — the
  // generic handle does not declare it, so access is feature-detected.
  const governorQuality =
    perfGovernorOptions && perfGovernorOptions.mode !== "off"
      ? (app as { quality?: AuraQualityController }).quality
      : undefined;
  let governor = perfGovernorOptions
    ? createPerformanceGovernor(perfGovernorOptions.mode, perfGovernorOptions.initial, governorQuality)
    : undefined;
  let lastPerf: GameAppRuntimePerformanceSnapshot | undefined;
  let perfPolls = 0;

  const pollPerformance = (telemetry?: GamePerFramePerfTelemetry): GameAppRuntimePerformanceSnapshot | undefined => {
    const governorOptions = perfGovernorOptions;
    if (!governorOptions || !governor) return undefined;
    const sample = telemetry ?? governorOptions.sample?.();
    if (!sample) return lastPerf;
    governor = governor.step(sample, governorOptions.budget);
    governorOptions.apply?.(governor.settings);
    perfPolls += 1;
    lastPerf = {
      mode: governor.mode,
      telemetry: sample,
      settings: governor.settings,
      degraded: governor.degraded,
      polls: perfPolls
    };
    return lastPerf;
  };

  const fallbackTime = new StubTimeController();
  if (options.loop?.timeScale !== undefined) {
    fallbackTime.scale = Math.max(0, options.loop.timeScale);
  }
  const timeController = (): AuraTimeController =>
    (app as { time?: AuraTimeController }).time ?? fallbackTime;
  loop.bindTimeScale(() => {
    const tc = timeController();
    return tc.hitStopRemaining > 0 ? 0 : tc.scale;
  });

  // A waiter belongs to the frame that claimed it, not to whichever frame
  // happens to run the delayed presentation callback. Keep claimed waiters in
  // the live set so cancellation and disposal can still settle them promptly.
  interface PresentedWaiter {
    claimed: boolean;
    settled: boolean;
    task?: PresentedRafTask;
    resolve(frame: number): void;
    reject(reason: unknown): void;
    cleanup(): void;
  }
  interface PresentedRafTask {
    active: boolean;
    handle?: number;
    cancelWhenAssigned: boolean;
    readonly waiters: Set<PresentedWaiter>;
  }
  const presentedWaiters = new Set<PresentedWaiter>();
  const pendingPresentationRafs = new Set<PresentedRafTask>();
  const stepContexts: Array<{ frame?: number }> = [];

  const cancelPresentationRaf = (task: PresentedRafTask): void => {
    if (task.handle === undefined) {
      task.cancelWhenAssigned = true;
    } else if (typeof cancelAnimationFrame === "function") {
      try { cancelAnimationFrame(task.handle); } catch { /* Cancellation is best effort. */ }
    }
  };
  const detachPresentationTask = (waiter: PresentedWaiter): void => {
    const task = waiter.task;
    if (!task) return;
    waiter.task = undefined;
    task.waiters.delete(waiter);
    if (task.active && task.waiters.size === 0) {
      task.active = false;
      pendingPresentationRafs.delete(task);
      cancelPresentationRaf(task);
    }
  };

  const claimPresentedWaiters = (): PresentedWaiter[] => {
    const claimed: PresentedWaiter[] = [];
    for (const waiter of presentedWaiters) {
      if (waiter.claimed || waiter.settled) continue;
      waiter.claimed = true;
      claimed.push(waiter);
    }
    return claimed;
  };
  const unclaimPresentedWaiters = (waiters: readonly PresentedWaiter[]): void => {
    for (const waiter of waiters) if (!waiter.settled) waiter.claimed = false;
  };
  const resolvePresented = (waiters: readonly PresentedWaiter[], frameIndex: number): void => {
    for (const waiter of waiters) {
      if (waiter.settled) continue;
      waiter.settled = true;
      presentedWaiters.delete(waiter);
      detachPresentationTask(waiter);
      waiter.cleanup();
      waiter.resolve(frameIndex);
    }
  };
  const presentStep = (dt: number): void => {
    const waiters = claimPresentedWaiters();
    const context: { frame?: number } = {};
    stepContexts.push(context);
    try {
      app.step(dt);
    } catch (error) {
      unclaimPresentedWaiters(waiters);
      throw error;
    } finally {
      stepContexts.pop();
    }
    resolvePresented(waiters, context.frame ?? app.runtime.frame);
  };

  // C-23 (R15, #212): under A3D_QR_CAMERA_LOOP the loop frame advances the
  // app and exactly one render runs per tick; flag off keeps the legacy
  // step-per-frame path.
  const cameraLoopOn = resolvedFlags.on("A3D_QR_CAMERA_LOOP");
  const advance = app.advance?.bind(app);
  if (cameraLoopOn && !advance) {
    throw new Error("A3D_QR_CAMERA_LOOP requires an app with advance(dt) (createAuraApp); this handle has none.");
  }
  const loopFrameUnsubscribe = loop.onFrame(
    cameraLoopOn && advance
      ? (frame) => { advance(frame.dt); }
      : (frame) => {
        if (advance && frame.source === "raf" && frame.substep < frame.substeps) {
          advance(frame.dt);
          return;
        }
        presentStep(frame.dt);
      }
  );
  const loopTickUnsubscribe = loop.onTick((tick) => {
    if ((app as { time?: AuraTimeController }).time === undefined && tick.realDt > 0) {
      fallbackTime.advance(tick.realDt);
    }
    if (cameraLoopOn) {
      presentStep(0);
    }
  });
  const internalFrameUnsubscribe = app.onFrame((frame) => {
    const context = stepContexts.at(-1);
    if (context && context.frame === undefined && frame.source !== "raf") context.frame = frame.frame;
    const rafWaiters = frame.source === "raf" ? claimPresentedWaiters() : [];
    const loopSnapshot = loop.snapshot();
    try {
      for (const input of ownedInputs) input.update(frame.dt);
      const normalizedFrame: AuraAppFrame = {
        ...frame,
        alpha: frame.alpha ?? loopSnapshot.alpha,
        fixedDt: loopSnapshot.fixedDt,
        paused: status === "paused" || app.runtime.paused
      };
      for (const callback of [...frameCallbacks]) {
        if (frameCallbacks.has(callback)) callback(normalizedFrame);
      }
    } catch (error) {
      unclaimPresentedWaiters(rafWaiters);
      throw error;
    }
    const waitingForRaf = rafWaiters.filter((waiter) => !waiter.settled);
    if (!disposed && waitingForRaf.length > 0) {
      const presentedIndex = frame.frame;
      const task: PresentedRafTask = {
        active: true,
        cancelWhenAssigned: false,
        waiters: new Set(waitingForRaf)
      };
      for (const waiter of waitingForRaf) waiter.task = task;
      pendingPresentationRafs.add(task);
      const finish = (): void => {
        pendingPresentationRafs.delete(task);
        if (!task.active) return;
        task.active = false;
        const waiters = [...task.waiters];
        task.waiters.clear();
        for (const waiter of waiters) waiter.task = undefined;
        resolvePresented(waiters, presentedIndex);
      };
      if (typeof requestAnimationFrame === "function") {
        try {
          task.handle = requestAnimationFrame(finish);
          if (task.cancelWhenAssigned) cancelPresentationRaf(task);
        } catch (error) {
          pendingPresentationRafs.delete(task);
          task.active = false;
          for (const waiter of task.waiters) waiter.task = undefined;
          unclaimPresentedWaiters([...task.waiters]);
          task.waiters.clear();
          throw error;
        }
      } else {
        queueMicrotask(finish);
      }
    }
  });

  const registerInput = (inputOptions: GameInputOptions): GameInputController => {
    const controller = app.input(inputOptions);
    ownedInputs.add(controller);
    return controller;
  };

  const initialInputs = Array.isArray(options.input) ? options.input : options.input ? [options.input] : [];
  const defaultInput = initialInputs.map(registerInput)[0];

  const evidenceOptions = () => options.evidence ?? {};
  const snapshotEvidence = (): GameAppRuntimeEvidence => {
    const appRuntime = app.runtime;
    const loopSnapshot = loop.snapshot();
    const activeInputControllers = disposed ? 0 : ownedInputs.size;
    return {
      kind: "aura-game-app-runtime-evidence",
      status,
      running: status === "running",
      paused: status === "paused" || appRuntime.paused,
      disposed,
      started,
      frame: appRuntime.frame,
      time: appRuntime.time,
      fixedDt: loopSnapshot.fixedDt,
      startCount,
      pauseCount,
      resumeCount,
      stepCount,
      resizeCount,
      disposeCount,
      inputControllers: ownedInputs.size,
      activeInputControllers,
      ...(lastResize ? { lastResize } : {}),
      loop: loopSnapshot,
      app: app.evidence(evidenceOptions()),
      ...(lastPerf ? { perf: lastPerf } : {})
    };
  };

  const assertAlive = (method: string) => {
    if (disposed) {
      throw new Error(`GameAppRuntime.${method}() cannot run after dispose(). Create a new game app runtime instead.`);
    }
  };

  const runtime: GameAppRuntime<TApp> = {
    kind: "aura-game-app-runtime",
    app,
    get input() {
      return defaultInput;
    },
    get status() {
      return status;
    },
    get running() {
      return status === "running";
    },
    get paused() {
      return status === "paused" || app.runtime.paused;
    },
    get disposed() {
      return disposed;
    },
    get evidence() {
      return snapshotEvidence();
    },
    get perf() {
      return lastPerf;
    },
    start() {
      assertAlive("start");
      if (!started) {
        started = true;
        startCount += 1;
      }
      if (status !== "running") {
        status = "running";
        loop.start();
        app.resume();
      }
      return snapshotEvidence();
    },
    pause() {
      assertAlive("pause");
      if (status !== "paused") pauseCount += 1;
      status = "paused";
      loop.pause();
      app.pause();
      return snapshotEvidence();
    },
    resume() {
      assertAlive("resume");
      if (status !== "running") resumeCount += 1;
      started = true;
      status = "running";
      loop.resume();
      app.resume();
      return snapshotEvidence();
    },
    step(dt = loop.snapshot().fixedDt) {
      assertAlive("step");
      stepCount += 1;
      loop.step(Math.max(0, dt));
      if (perfGovernorOptions?.sample) pollPerformance();
      return snapshotEvidence();
    },
    pollPerformance(telemetry?: GamePerFramePerfTelemetry) {
      assertAlive("pollPerformance");
      return pollPerformance(telemetry);
    },
    resize(width, height, pixelRatio = 1) {
      assertAlive("resize");
      const safeWidth = Math.max(1, Math.floor(width));
      const safeHeight = Math.max(1, Math.floor(height));
      const safePixelRatio = Math.max(0.01, pixelRatio);
      resizeCount += 1;
      lastResize = {
        width: safeWidth,
        height: safeHeight,
        pixelRatio: safePixelRatio
      };
      // A worker app's canvas was transferred; its backing size follows CSS.
      if (app.canvas) {
        if ((app as { execution?: { active?: string } }).execution?.active !== "worker") {
          app.canvas.width = Math.max(1, Math.floor(safeWidth * safePixelRatio));
          app.canvas.height = Math.max(1, Math.floor(safeHeight * safePixelRatio));
        }
        app.canvas.style.width = `${safeWidth}px`;
        app.canvas.style.height = `${safeHeight}px`;
      }
      return snapshotEvidence();
    },
    onFrame(callback) {
      assertAlive("onFrame");
      frameCallbacks.add(callback);
      return () => {
        frameCallbacks.delete(callback);
      };
    },
    offFrame(callback) {
      frameCallbacks.delete(callback);
    },
    onTick(callback) {
      assertAlive("onTick");
      return loop.onTick(callback);
    },
    inputController(inputOptions) {
      assertAlive("inputController");
      return registerInput(inputOptions);
    },
    screenshot() {
      assertAlive("screenshot");
      return app.screenshot();
    },
    get timeScale() {
      return timeController().scale;
    },
    setTimeScale(scale) {
      assertAlive("setTimeScale");
      if (!Number.isFinite(scale)) {
        throw new Error(`AURA_GAME_TIMESCALE_NAN: setTimeScale(${String(scale)}) requires a finite number.`);
      }
      timeController().scale = Math.min(4, Math.max(0, scale));
      return snapshotEvidence();
    },
    firstPresentedFrame(options) {
      assertAlive("firstPresentedFrame");
      const signal = options?.signal;
      return new Promise<number>((resolve, reject) => {
        const waiter: PresentedWaiter = {
          claimed: false,
          settled: false,
          resolve,
          reject,
          cleanup: () => {
            try { signal?.removeEventListener("abort", abort); } catch { /* Settle all waiters even if a signal was replaced. */ }
          }
        };
        const abort = (): void => {
          if (waiter.settled) return;
          waiter.settled = true;
          presentedWaiters.delete(waiter);
          detachPresentationTask(waiter);
          waiter.cleanup();
          const reason = signal?.reason;
          if (reason !== undefined) reject(reason);
          else {
            const error = new Error("Presentation wait was aborted.");
            error.name = "AbortError";
            reject(error);
          }
        };
        presentedWaiters.add(waiter);
        try {
          if (signal?.aborted) { abort(); return; }
          signal?.addEventListener("abort", abort, { once: true });
          // Cover a signal that is aborted during listener registration.
          if (signal?.aborted) abort();
        } catch (error) {
          if (!waiter.settled) {
            waiter.settled = true;
            presentedWaiters.delete(waiter);
            detachPresentationTask(waiter);
            waiter.cleanup();
            reject(error);
          }
        }
      });
    },
    dispose() {
      if (disposed) return snapshotEvidence();
      disposeCount += 1;
      status = "disposed";
      disposed = true;
      for (const task of pendingPresentationRafs) {
        task.active = false;
        for (const waiter of task.waiters) waiter.task = undefined;
        task.waiters.clear();
        cancelPresentationRaf(task);
      }
      pendingPresentationRafs.clear();
      for (const waiter of [...presentedWaiters]) {
        waiter.settled = true;
        presentedWaiters.delete(waiter);
        waiter.cleanup();
        const error = new Error("GameAppRuntime was disposed before a frame was presented.") as Error & { code: string };
        error.name = "AbortError";
        error.code = "A3D_GAME_RUNTIME_DISPOSED";
        waiter.reject(error);
      }
      loopFrameUnsubscribe();
      loopTickUnsubscribe?.();
      internalFrameUnsubscribe();
      frameCallbacks.clear();
      for (const input of ownedInputs) input.dispose();
      loop.dispose();
      app.dispose();
      return snapshotEvidence();
    }
  };

  if (options.autoStart !== false) runtime.start();
  return runtime;
}
