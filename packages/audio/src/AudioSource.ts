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
  /** Playback-rate multiplier; the positional emitter drives this for doppler. Defaults to 1. */
  playbackRate = 1;
  readonly gain: GainNode;

  private stateRef: AudioSourceState = "idle";
  private node?: AudioBufferSourceNode;
  private offsetSeconds = 0;
  private startedAt = 0;
  private spriteDuration?: number;

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
    this.stopNode();
    const source = this.options.context.createBufferSource();
    source.buffer = this.clip.buffer;
    source.loop = this.loop;
    // Guarded: minimal mock contexts in unit tests may not implement playbackRate.
    const rate = (source as unknown as { playbackRate?: { value: number } }).playbackRate;
    if (rate && Number.isFinite(this.playbackRate) && this.playbackRate > 0) {
      rate.value = this.playbackRate;
    }
    source.connect(this.gain);
    const offset = Math.min(this.offsetSeconds, Math.max(0, this.clip.duration - Number.EPSILON));
    if (this.spriteDuration === undefined) source.start(when, offset);
    else source.start(when, offset, this.spriteDuration);
    this.startedAt = this.options.context.currentTime - offset;
    source.onended = () => {
      if (this.node === source && this.stateRef === "playing") {
        this.stateRef = "stopped";
        this.offsetSeconds = 0;
        this.spriteDuration = undefined;
      }
    };
    this.node = source;
    this.stateRef = "playing";
  }

  stop(when = 0): void {
    this.stopNode(when);
    this.offsetSeconds = 0;
    this.spriteDuration = undefined;
    if (this.stateRef !== "idle") {
      this.stateRef = "stopped";
    }
  }

  pause(): void {
    if (!this.node || this.stateRef !== "playing" || !this.clip) return;
    const duration = this.spriteDuration ?? this.clip.duration;
    this.offsetSeconds = Math.min(duration, Math.max(0, this.options.context.currentTime - this.startedAt));
    this.stopNode();
    this.stateRef = "paused";
  }

  resume(): void {
    if (this.stateRef !== "paused") return;
    this.play();
  }

  playSprite(offsetSeconds: number, durationSeconds: number, when = 0): void {
    if (!this.clip) throw new Error("Cannot play an audio sprite without an AudioClip");
    if (!Number.isFinite(offsetSeconds) || offsetSeconds < 0 || offsetSeconds >= this.clip.duration) throw new RangeError("Audio sprite offset must fall within the clip duration");
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || offsetSeconds + durationSeconds > this.clip.duration) throw new RangeError("Audio sprite duration must be positive and remain within the clip");
    this.offsetSeconds = offsetSeconds;
    this.spriteDuration = durationSeconds;
    this.play(when);
  }

  fade(from: number, to: number, durationSeconds: number): void {
    if (![from, to, durationSeconds].every(Number.isFinite) || from < 0 || to < 0 || durationSeconds < 0) throw new RangeError("Audio fade values must be finite and non-negative");
    const now = this.options.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(from, now);
    this.gain.gain.linearRampToValueAtTime(to, now + durationSeconds);
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

  private stopNode(when = 0): void {
    if (!this.node) return;
    const source = this.node;
    this.node = undefined;
    source.onended = null;
    source.stop(when);
    source.disconnect();
  }
}
