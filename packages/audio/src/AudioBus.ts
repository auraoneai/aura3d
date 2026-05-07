import type { AudioContextLike } from "./AudioContextManager";

export class AudioBus {
  readonly input: GainNode;
  readonly output: GainNode;
  private muted = false;
  private storedVolume = 1;

  constructor(
    readonly name: string,
    context: AudioContextLike,
    destination?: AudioNode
  ) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.input.connect(this.output);
    this.output.connect(destination ?? context.destination);
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Audio bus volume must be a non-negative finite number");
    }
    this.storedVolume = value;
    if (!this.muted) {
      this.output.gain.value = value;
    }
  }

  mute(value = true): void {
    this.muted = value;
    this.output.gain.value = value ? 0 : this.storedVolume;
  }

  dispose(): void {
    this.input.disconnect();
    this.output.disconnect();
  }
}
