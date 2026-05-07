import type { PhysicsWorld } from "./PhysicsWorld.js";

export type PhysicsStepperResult = {
  readonly steps: number;
  readonly alpha: number;
  readonly droppedTime: number;
};

export class PhysicsStepper {
  readonly fixedDelta: number;
  readonly maxSubSteps: number;
  private accumulator = 0;

  constructor(fixedDelta: number, maxSubSteps = 5) {
    if (!Number.isFinite(fixedDelta) || fixedDelta <= 0) {
      throw new Error("fixedDelta must be a finite positive number.");
    }
    if (!Number.isInteger(maxSubSteps) || maxSubSteps <= 0) {
      throw new Error("maxSubSteps must be a positive integer.");
    }
    this.fixedDelta = fixedDelta;
    this.maxSubSteps = maxSubSteps;
  }

  advance(deltaSeconds: number, world: Pick<PhysicsWorld, "step">): PhysicsStepperResult {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error("deltaSeconds must be finite and non-negative.");
    }
    this.accumulator += deltaSeconds;
    let steps = 0;
    while (this.accumulator + 1e-12 >= this.fixedDelta && steps < this.maxSubSteps) {
      world.step(this.fixedDelta);
      this.accumulator -= this.fixedDelta;
      steps += 1;
    }
    let droppedTime = 0;
    if (this.accumulator >= this.fixedDelta) {
      droppedTime = this.accumulator;
      this.accumulator = 0;
    }
    return { steps, alpha: this.accumulator / this.fixedDelta, droppedTime };
  }

  reset(): void {
    this.accumulator = 0;
  }
}
