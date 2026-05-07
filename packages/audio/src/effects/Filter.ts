import type { AudioContextLike } from "../AudioContextManager";
import type { AudioEffect } from "../AudioEffect";

export class FilterEffect implements AudioEffect {
  readonly input: BiquadFilterNode;
  readonly output: BiquadFilterNode;

  constructor(context: AudioContextLike, type: BiquadFilterType = "lowpass") {
    this.input = context.createBiquadFilter();
    this.input.type = type;
    this.output = this.input;
  }

  setFrequency(value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Filter frequency must be positive");
    }
    this.input.frequency.value = value;
  }

  setQ(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Filter Q must be non-negative");
    }
    this.input.Q.value = value;
  }

  connect(destination: AudioNode): AudioNode {
    return this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  dispose(): void {
    this.disconnect();
  }
}
