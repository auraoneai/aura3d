import { FixedStepAccumulator } from "./FixedStepAccumulator.js";
import { Time, type TimeSnapshot } from "./Time.js";

export type LoopMode = "manual" | "raf";

export interface FrameContext {
  readonly time: TimeSnapshot;
  readonly fixedSteps: number;
  readonly interpolationAlpha: number;
}

export type FrameCallback = (context: FrameContext) => void | Promise<void>;

export interface EngineLoopOptions {
  readonly mode: LoopMode;
  readonly fixedDelta: number;
  readonly maxDelta: number;
  readonly maxFixedSteps: number;
  readonly timeScale?: number;
}

export class EngineLoop {
  private readonly time: Time;
  private readonly accumulator: FixedStepAccumulator;
  private running = false;
  private rafHandle: number | undefined;
  private lastTimestamp: number | undefined;

  constructor(
    private readonly options: EngineLoopOptions,
    private readonly onFrame: FrameCallback
  ) {
    this.time = new Time(options.maxDelta, options.timeScale ?? 1);
    this.accumulator = new FixedStepAccumulator(options.fixedDelta, options.maxFixedSteps);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.options.mode === "raf") {
      if (typeof requestAnimationFrame !== "function") throw new Error("requestAnimationFrame is unavailable.");
      this.lastTimestamp = undefined;
      this.rafHandle = requestAnimationFrame((timestamp) => void this.tickRaf(timestamp));
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafHandle !== undefined && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafHandle);
    }
    this.rafHandle = undefined;
  }

  pause(): void {
    this.stop();
  }

  resume(): void {
    this.start();
  }

  async step(delta: number): Promise<FrameContext> {
    const time = this.time.update(delta);
    const fixed = this.accumulator.add(time.delta);
    const context = Object.freeze({ time, fixedSteps: fixed.steps, interpolationAlpha: fixed.alpha });
    await this.onFrame(context);
    return context;
  }

  snapshot(): TimeSnapshot {
    return this.time.snapshot();
  }

  private async tickRaf(timestamp: number): Promise<void> {
    if (!this.running) return;
    const delta = this.lastTimestamp === undefined ? 0 : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    await this.step(delta);
    if (this.running) this.rafHandle = requestAnimationFrame((nextTimestamp) => void this.tickRaf(nextTimestamp));
  }
}
