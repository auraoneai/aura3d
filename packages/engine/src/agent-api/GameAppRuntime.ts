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
}

export interface GameAppRuntimeOptions {
  readonly autoStart?: boolean;
  readonly loop?: GameAppRuntimeLoopOptions;
  readonly input?: GameInputOptions | readonly GameInputOptions[];
  readonly evidence?: GameRuntimeEvidenceOptions;
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
  start(): GameAppRuntimeEvidence;
  pause(): GameAppRuntimeEvidence;
  resume(): GameAppRuntimeEvidence;
  step(dt?: number): GameAppRuntimeEvidence;
  resize(width: number, height: number, pixelRatio?: number): GameAppRuntimeEvidence;
  onFrame(callback: AuraAppFrameCallback): () => void;
  offFrame(callback: AuraAppFrameCallback): void;
  inputController(options: GameInputOptions): GameInputController;
  screenshot(): AuraAppScreenshot;
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
      app: app.evidence(evidenceOptions())
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
      return snapshotEvidence();
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
    dispose() {
      if (disposed) return snapshotEvidence();
      disposeCount += 1;
      status = "disposed";
      disposed = true;
      loopFrameUnsubscribe();
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
