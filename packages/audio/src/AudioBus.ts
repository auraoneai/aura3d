import type { AudioContextLike } from "./AudioContextManager";

/**
 * The minimum a bus needs from a context: somewhere to send audio, and the ability to make a gain node.
 *
 * WS-3.2 — this is deliberately narrower than {@link AudioContextLike}. `AudioContextLike` also requires
 * `createBufferSource`, `createPanner`, `createBiquadFilter` and `createConvolver`, none of which a bus
 * uses. Requiring them forced any caller that only wants bus routing — `GameAudio`, whose cue definitions
 * synthesise with an oscillator and never touch a panner or convolver — to either implement four unused
 * factories or hand-roll its own `createGain` call. It hand-rolled, which is how the same gain-graph logic
 * came to exist in two packages.
 *
 * Widening the parameter is source-compatible: every existing `AudioContextLike` satisfies it.
 */
export interface AudioBusContextLike {
  readonly destination: AudioNode;
  createGain(): GainNode;
}

export class AudioBus {
  readonly input: GainNode;
  readonly output: GainNode;
  private muted = false;
  private storedVolume = 1;

  constructor(
    readonly name: string,
    context: AudioBusContextLike,
    destination?: AudioNode
  ) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.input.connect(this.output);
    this.output.connect(destination ?? context.destination);
  }

  get volume(): number {
    return this.storedVolume;
  }

  get isMuted(): boolean {
    return this.muted;
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

/** Retained so the `AudioContextLike`-typed call sites in this package keep their documented contract. */
export type AudioBusContext = AudioContextLike;
