export interface FixedStepLoopOptions {
  stepMs: number;
  maxCatchupSteps: number;
  onStep: (deltaMs: number, nowMs: number) => void;
  onFrame?: (alpha: number, nowMs: number) => void;
}

export class FixedStepLoop {
  private running = false;
  private lastMs = 0;
  private accumulator = 0;
  private rafId = 0;

  constructor(private readonly options: FixedStepLoopOptions) {}

  start(nowMs = performance.now()): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastMs = nowMs;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly tick = (nowMs: number): void => {
    if (!this.running) {
      return;
    }

    const delta = nowMs - this.lastMs;
    this.lastMs = nowMs;
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator >= this.options.stepMs && steps < this.options.maxCatchupSteps) {
      this.options.onStep(this.options.stepMs, nowMs);
      this.accumulator -= this.options.stepMs;
      steps += 1;
    }

    this.options.onFrame?.(this.accumulator / this.options.stepMs, nowMs);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
