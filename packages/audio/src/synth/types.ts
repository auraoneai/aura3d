import type { AudioContextLike } from "../AudioContextManager";

/** The slice of `BaseAudioContext` the synth kit drives. A real `AudioContext` and a test fake both satisfy it. */
export interface SynthContext extends AudioContextLike {
  readonly sampleRate: number;
  createOscillator(): OscillatorNode;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
}

export type SynthBus = "sfx" | "music";

export interface SynthFilter {
  readonly type: BiquadFilterType;
  readonly freq: number;
  readonly q?: number;
  /** Exponentially sweep the cutoff to this frequency over the layer's duration. */
  readonly slideTo?: number;
}

export interface ToneLayer {
  readonly kind?: "tone";
  readonly freq: number;
  readonly type?: OscillatorType;
  /** Seconds. Default 0.15. */
  readonly dur?: number;
  /** Peak gain. Default 0.2. */
  readonly gain?: number;
  /** Exponentially glide the pitch to this frequency over `dur`. */
  readonly slideTo?: number;
  /** Seconds after the cue is triggered. */
  readonly delay?: number;
  /** Attack seconds. Default 0.008. */
  readonly attack?: number;
  /** Cents. */
  readonly detune?: number;
  readonly filter?: SynthFilter;
  readonly bus?: SynthBus;
}

export interface NoiseLayer {
  readonly kind: "noise";
  readonly dur?: number;
  readonly gain?: number;
  /** Filter cutoff in Hz. Default 1200. */
  readonly freq?: number;
  readonly q?: number;
  /** Default `bandpass`. */
  readonly type?: BiquadFilterType;
  readonly slideTo?: number;
  readonly delay?: number;
  readonly bus?: SynthBus;
}

export type CueLayer = ToneLayer | NoiseLayer;

export interface CuePlayParams {
  /** Free-form intensity the cue's layer function can read (a combo count, a speed...). */
  readonly level?: number;
  /** Multiplies every layer's pitch. */
  readonly pitch?: number;
  /** Multiplies every layer's gain. */
  readonly gain?: number;
}

export interface CueSpec {
  readonly layers: readonly CueLayer[] | ((params: Required<Pick<CuePlayParams, "level">> & CuePlayParams) => readonly CueLayer[]);
  /** Higher wins when the voice budget is exhausted. Default 0. */
  readonly priority?: number;
  /** Ignore a repeat trigger that arrives sooner than this. */
  readonly cooldownMs?: number;
  /** Most simultaneous instances of this cue. */
  readonly maxConcurrent?: number;
  /** Dip the music bus while the cue sounds: a fraction (0..1) or `{ amount, ms }`. */
  readonly duckMusic?: number | { readonly amount: number; readonly ms: number };
}

export interface SynthVoice {
  readonly type?: OscillatorType;
  readonly freq: number;
  /** Absolute context time. */
  readonly at: number;
  readonly dur: number;
  readonly gain: number;
  readonly attack?: number;
  readonly filter?: SynthFilter;
  readonly bus?: SynthBus;
}
