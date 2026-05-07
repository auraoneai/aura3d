export interface TimeSnapshot {
  readonly frame: number;
  readonly elapsed: number;
  readonly unscaledElapsed: number;
  readonly delta: number;
  readonly unscaledDelta: number;
  readonly smoothedDelta: number;
  readonly timeScale: number;
}

export class Time {
  private frameValue = 0;
  private elapsedValue = 0;
  private unscaledElapsedValue = 0;
  private deltaValue = 0;
  private unscaledDeltaValue = 0;
  private smoothedDeltaValue = 0;

  constructor(
    private readonly maxDelta: number,
    private timeScaleValue = 1
  ) {
    if (!Number.isFinite(maxDelta) || maxDelta <= 0) throw new RangeError("maxDelta must be finite and positive.");
    this.setTimeScale(timeScaleValue);
  }

  setTimeScale(timeScale: number): void {
    if (!Number.isFinite(timeScale) || timeScale < 0) throw new RangeError("timeScale must be finite and non-negative.");
    this.timeScaleValue = timeScale;
  }

  update(unscaledDelta: number): TimeSnapshot {
    if (!Number.isFinite(unscaledDelta) || unscaledDelta < 0) throw new RangeError("delta must be finite and non-negative.");
    this.unscaledDeltaValue = Math.min(unscaledDelta, this.maxDelta);
    this.deltaValue = this.unscaledDeltaValue * this.timeScaleValue;
    this.unscaledElapsedValue += this.unscaledDeltaValue;
    this.elapsedValue += this.deltaValue;
    this.frameValue++;
    this.smoothedDeltaValue = this.frameValue === 1 ? this.deltaValue : this.smoothedDeltaValue * 0.9 + this.deltaValue * 0.1;
    return this.snapshot();
  }

  snapshot(): TimeSnapshot {
    return Object.freeze({
      frame: this.frameValue,
      elapsed: this.elapsedValue,
      unscaledElapsed: this.unscaledElapsedValue,
      delta: this.deltaValue,
      unscaledDelta: this.unscaledDeltaValue,
      smoothedDelta: this.smoothedDeltaValue,
      timeScale: this.timeScaleValue
    });
  }
}
