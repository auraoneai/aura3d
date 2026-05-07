import type { AudioClip } from "./AudioClip";
import type { AudioContextLike } from "./AudioContextManager";

export type AudioSourceState = "idle" | "playing" | "paused" | "stopped";

export interface AudioSourceOptions {
  readonly context: AudioContextLike;
  readonly destination?: AudioNode;
  readonly clip?: AudioClip;
  readonly loop?: boolean;
  readonly volume?: number;
}

export class AudioSource {
  clip?: AudioClip;
  loop: boolean;
  readonly gain: GainNode;

  private stateRef: AudioSourceState = "idle";
  private node?: AudioBufferSourceNode;

  constructor(private readonly options: AudioSourceOptions) {
    this.clip = options.clip;
    this.loop = options.loop ?? false;
    this.gain = options.context.createGain();
    this.gain.gain.value = options.volume ?? 1;
    this.gain.connect(options.destination ?? options.context.destination);
  }

  get state(): AudioSourceState {
    return this.stateRef;
  }

  play(when = 0): void {
    if (!this.clip) {
      throw new Error("Cannot play an AudioSource without an AudioClip");
    }
    this.stop();
    const source = this.options.context.createBufferSource();
    source.buffer = this.clip.buffer;
    source.loop = this.loop;
    source.connect(this.gain);
    source.start(when);
    source.onended = () => {
      if (this.node === source && this.stateRef === "playing") {
        this.stateRef = "stopped";
      }
    };
    this.node = source;
    this.stateRef = "playing";
  }

  stop(when = 0): void {
    if (this.node) {
      this.node.stop(when);
      this.node.disconnect();
      this.node = undefined;
    }
    if (this.stateRef !== "idle") {
      this.stateRef = "stopped";
    }
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Audio source volume must be a non-negative finite number");
    }
    this.gain.gain.value = value;
  }

  dispose(): void {
    this.stop();
    this.gain.disconnect();
  }
}
