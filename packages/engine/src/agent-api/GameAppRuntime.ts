import type {
  AuraAppFrame,
  AuraAppFrameCallback,
  AuraAppHandle,
  AuraAppScreenshot
} from "./AuraAppHandle";
import type {
  GameInputController,
  GameInputOptions
} from "./GameRuntime";
import type {
  GameRuntimeEvidence,
  GameRuntimeEvidenceOptions
} from "./GameEvidence";
import {
  createFrameLoop,
  type FrameLoopOptions,
  type FrameLoopSnapshot
} from "./FrameLoop";
import { StubTimeController, type AuraTimeController } from "../contracts/time";
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
   * frame after that — callers re-arm it per `setScene`.
   */
  firstPresentedFrame(): Promise<number>;
  dispose(): GameAppRuntimeEvidence;
}

export function createGameAppRuntime<TApp extends AuraAppHandle>(
  app: TApp,
  options: GameAppRuntimeOptions = {}
): GameAppRuntime<TApp> {
  const loop = createFrameLoop({ ...options.loop, autoStart: false });
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
  const timeController = (): AuraTimeController =>
    (app as { time?: AuraTimeController }).time ?? fallbackTime;

  // firstPresentedFrame: each call registers a waiter resolved on the next
  // presented frame. `raf`-sourced callbacks precede the submission in the
  // same task, so they resolve on the following rAF (or a microtask when no
  // rAF exists); `step()` resolves synchronously after its render.
  const presentedWaiters = new Set<(frame: number) => void>();
  const resolvePresented = (frameIndex: number) => {
    const waiters = [...presentedWaiters];
    presentedWaiters.clear();
    for (const waiter of waiters) waiter(frameIndex);
  };

  const loopFrameUnsubscribe = loop.onFrame((frame) => {
    app.step(frame.dt);
  });
  const internalFrameUnsubscribe = app.onFrame((frame) => {
    const loopSnapshot = loop.snapshot();
    for (const input of ownedInputs) input.update(frame.dt);
    const normalizedFrame: AuraAppFrame = {
      ...frame,
      fixedDt: loopSnapshot.fixedDt,
      paused: status === "paused" || app.runtime.paused
    };
    for (const callback of [...frameCallbacks]) {
      if (frameCallbacks.has(callback)) callback(normalizedFrame);
    }
    if (frame.source === "raf" && presentedWaiters.size > 0) {
      const presentedIndex = frame.frame;
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolvePresented(presentedIndex));
      } else {
        queueMicrotask(() => resolvePresented(presentedIndex));
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
      if (presentedWaiters.size > 0) resolvePresented(app.runtime.frame);
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
      if (app.canvas) {
        app.canvas.width = Math.max(1, Math.floor(safeWidth * safePixelRatio));
        app.canvas.height = Math.max(1, Math.floor(safeHeight * safePixelRatio));
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
    firstPresentedFrame() {
      assertAlive("firstPresentedFrame");
      return new Promise<number>((resolve) => {
        presentedWaiters.add(resolve);
      });
    },
    dispose() {
      if (disposed) return snapshotEvidence();
      disposeCount += 1;
      status = "disposed";
      disposed = true;
      loopFrameUnsubscribe();
      internalFrameUnsubscribe();
      frameCallbacks.clear();
      presentedWaiters.clear();
      for (const input of ownedInputs) input.dispose();
      loop.dispose();
      app.dispose();
      return snapshotEvidence();
    }
  };

  if (options.autoStart !== false) runtime.start();
  return runtime;
}
