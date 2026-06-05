export interface AuraClashFrame {
  dt: number;
  timeMs: number;
  frame: number;
}

export class AuraClashGameLoop {
  private frame = 0;
  private timeMs = 0;

  step(dt = 1 / 60): AuraClashFrame {
    this.frame += 1;
    this.timeMs += dt * 1000;
    return {
      dt,
      timeMs: this.timeMs,
      frame: this.frame,
    };
  }

  snapshot(): AuraClashFrame {
    return {
      dt: 0,
      timeMs: this.timeMs,
      frame: this.frame,
    };
  }

  reset(): void {
    this.frame = 0;
    this.timeMs = 0;
  }
}
