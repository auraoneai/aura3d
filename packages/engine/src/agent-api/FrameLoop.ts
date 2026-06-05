export type FrameLoopSource = "raf" | "manual" | "fixed";

export interface FrameLoopFrame {
  readonly dt: number;
  readonly fixedDt: number;
  readonly time: number;
  readonly frame: number;
  readonly alpha: number;
  readonly paused: boolean;
  readonly source: FrameLoopSource;
  readonly substep: number;
  readonly substeps: number;
}

export type FrameLoopCallback = (frame: FrameLoopFrame) => void;

export interface FrameLoopOptions {
  readonly fixedDt?: number;
  readonly maxSubSteps?: number;
  readonly timeScale?: number;
  readonly autoStart?: boolean;
  readonly useRaf?: boolean;
  readonly now?: () => number;
  readonly requestFrame?: (callback: (time: number) => void) => number;
  readonly cancelFrame?: (handle: number) => void;
}

export interface FrameLoopSnapshot {
  readonly kind: "aura-frame-loop-snapshot";
  readonly running: boolean;
  readonly paused: boolean;
  readonly frame: number;
  readonly time: number;
  readonly fixedDt: number;
  readonly alpha: number;
  readonly maxSubSteps: number;
  readonly timeScale: number;
  readonly callbackCount: number;
  readonly lastFrame?: FrameLoopFrame;
}

export class FrameLoop {
  private readonly callbacks = new Set<FrameLoopCallback>();
  private readonly fixedDt: number;
  private readonly maxSubSteps: number;
  private readonly timeScale: number;
  private readonly now: () => number;
  private readonly requestFrame?: (callback: (time: number) => void) => number;
  private readonly cancelFrame?: (handle: number) => void;
  private running = false;
  private paused = false;
  private disposed = false;
  private frame = 0;
  private time = 0;
  private accumulator = 0;
  private lastNow = 0;
  private rafHandle = 0;
  private lastFrame?: FrameLoopFrame;

  constructor(options: FrameLoopOptions = {}) {
    this.fixedDt = Math.max(0, options.fixedDt ?? 1 / 60);
    this.maxSubSteps = Math.max(1, Math.floor(options.maxSubSteps ?? 5));
    this.timeScale = Math.max(0, options.timeScale ?? 1);
    this.now = options.now ?? (() => (typeof performance === "undefined" ? Date.now() : performance.now()));
    this.requestFrame =
      options.useRaf === false
        ? undefined
        : options.requestFrame ?? (typeof requestAnimationFrame === "undefined" ? undefined : requestAnimationFrame);
    this.cancelFrame =
      options.useRaf === false
        ? undefined
        : options.cancelFrame ?? (typeof cancelAnimationFrame === "undefined" ? undefined : cancelAnimationFrame);
    if (options.autoStart) this.start();
  }

  onFrame(callback: FrameLoopCallback): () => void {
    if (this.disposed) return () => undefined;
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  offFrame(callback: FrameLoopCallback): void {
    this.callbacks.delete(callback);
  }

  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.paused = false;
    this.lastNow = this.now();
    this.schedule();
  }

  pause(): void {
    if (this.disposed) return;
    this.paused = true;
    if (this.rafHandle && this.cancelFrame) this.cancelFrame(this.rafHandle);
    this.rafHandle = 0;
  }

  resume(): void {
    if (this.disposed) return;
    const wasPaused = this.paused;
    this.paused = false;
    this.lastNow = this.now();
    if (!this.running) this.start();
    else if (wasPaused) this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle && this.cancelFrame) this.cancelFrame(this.rafHandle);
    this.rafHandle = 0;
  }

  step(dt = this.fixedDt, source: FrameLoopSource = "manual"): FrameLoopSnapshot {
    if (this.disposed) return this.snapshot();
    const scaledDt = Math.max(0, dt) * this.timeScale;
    if (this.fixedDt <= 0) {
      this.emit(scaledDt, source, 1, 1, 0);
      return this.snapshot();
    }

    this.accumulator += scaledDt;
    const availableSubsteps = Math.floor(this.accumulator / this.fixedDt);
    const substeps = Math.min(this.maxSubSteps, availableSubsteps);

    if (substeps <= 0) return this.snapshot();

    for (let index = 0; index < substeps; index += 1) {
      this.accumulator = Math.max(0, this.accumulator - this.fixedDt);
      const alpha = this.interpolationAlpha();
      this.emit(this.fixedDt, source, index + 1, substeps, alpha);
    }

    if (availableSubsteps > this.maxSubSteps) {
      this.accumulator = Math.min(this.accumulator, this.fixedDt);
    }

    return this.snapshot();
  }

  snapshot(): FrameLoopSnapshot {
    return {
      kind: "aura-frame-loop-snapshot",
      running: this.running,
      paused: this.paused,
      frame: this.frame,
      time: this.time,
      fixedDt: this.fixedDt,
      alpha: this.interpolationAlpha(),
      maxSubSteps: this.maxSubSteps,
      timeScale: this.timeScale,
      callbackCount: this.callbacks.size,
      lastFrame: this.lastFrame
    };
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.callbacks.clear();
    this.lastFrame = undefined;
  }

  private schedule(): void {
    if (!this.running || this.paused || !this.requestFrame) return;
    this.rafHandle = this.requestFrame((nextTime) => this.tick(nextTime));
  }

  private tick(nextTime: number): void {
    if (!this.running || this.disposed) return;
    const dt = this.lastNow > 0 ? Math.max(0, (nextTime - this.lastNow) / 1000) : this.fixedDt;
    this.lastNow = nextTime;
    if (!this.paused) this.step(dt, "raf");
    this.schedule();
  }

  private interpolationAlpha(): number {
    if (this.fixedDt <= 0) return 0;
    return Math.max(0, Math.min(1, this.accumulator / this.fixedDt));
  }

  private emit(dt: number, source: FrameLoopSource, substep: number, substeps: number, alpha: number): void {
    this.frame += 1;
    this.time += dt;
    const frame: FrameLoopFrame = {
      dt,
      fixedDt: this.fixedDt,
      time: this.time,
      frame: this.frame,
      alpha,
      paused: this.paused,
      source,
      substep,
      substeps
    };
    this.lastFrame = frame;
    for (const callback of [...this.callbacks]) {
      if (this.callbacks.has(callback)) callback(frame);
    }
  }
}

export function createFrameLoop(options: FrameLoopOptions = {}): FrameLoop {
  return new FrameLoop(options);
}
