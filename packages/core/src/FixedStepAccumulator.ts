export interface FixedStepResult {
  readonly steps: number;
  readonly alpha: number;
  readonly droppedTime: number;
}

export class FixedStepAccumulator {
  private accumulator = 0;

  constructor(
    readonly fixedDelta: number,
    readonly maxSteps: number
  ) {
    if (!Number.isFinite(fixedDelta) || fixedDelta <= 0) throw new RangeError("fixedDelta must be finite and positive.");
    if (!Number.isInteger(maxSteps) || maxSteps <= 0) throw new RangeError("maxSteps must be a positive integer.");
  }

  add(delta: number): FixedStepResult {
    if (!Number.isFinite(delta) || delta < 0) throw new RangeError("delta must be finite and non-negative.");
    this.accumulator += delta;
    const possibleSteps = Math.floor(this.accumulator / this.fixedDelta);
    const steps = Math.min(possibleSteps, this.maxSteps);
    this.accumulator -= steps * this.fixedDelta;
    let droppedTime = 0;
    if (possibleSteps > this.maxSteps) {
      droppedTime = this.accumulator;
      this.accumulator = 0;
    }
    return Object.freeze({ steps, alpha: this.alpha, droppedTime });
  }

  get alpha(): number {
    return this.accumulator / this.fixedDelta;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
