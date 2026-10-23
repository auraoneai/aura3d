import type { SynthCueBank } from "./SynthCueBank";
import type { SynthFilter, SynthVoice } from "./types";

/** Scheduler seam so tests can drive time without real timers. */
export interface SynthScheduler {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const realScheduler: SynthScheduler = {
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>)
};

export interface StepSequencerOptions {
  readonly bpm: number;
  /** Steps per beat (2 = eighth notes). Default 2. */
  readonly stepsPerBeat?: number;
  /** Seconds scheduled ahead of the clock. Default 0.2. */
  readonly lookahead?: number;
  /** Timer period in ms. Default 40. */
  readonly tickMs?: number;
  readonly scheduler?: SynthScheduler;
  /**
   * Called once per step with the step index, its absolute start time and the step length in seconds.
   * Schedule notes with `voice(...)` (they go to the music bus unless `bus: "sfx"`).
   */
  readonly step: (index: number, at: number, stepSeconds: number, voice: (v: Omit<SynthVoice, "at"> & { at?: number }) => void) => void;
}

export interface StepSequencer {
  start(): void;
  stop(): void;
  setBpm(bpm: number): void;
  /** Schedule everything due within the lookahead window now (the timer calls this; tests call it directly). */
  pump(): void;
  readonly playing: boolean;
  readonly stepIndex: number;
}

/** A lookahead music scheduler on the bank's music bus: one callback per step, sample-accurate start times. */
export function createStepSequencer(bank: SynthCueBank<string>, options: StepSequencerOptions): StepSequencer {
  const scheduler = options.scheduler ?? realScheduler;
  const lookahead = options.lookahead ?? 0.2;
  let bpm = options.bpm;
  let timer: unknown = null;
  let index = 0;
  let nextAt = 0;
  const stepSeconds = (): number => 60 / bpm / (options.stepsPerBeat ?? 2);
  const pump = (): void => {
    const ctx = bank.context;
    if (!ctx) return;
    while (nextAt < ctx.currentTime + lookahead) {
      const at = nextAt;
      options.step(index, at, stepSeconds(), (v) => bank.voice({ ...v, at: v.at ?? at }));
      nextAt += stepSeconds();
      index++;
    }
  };
  return {
    start() {
      const ctx = bank.context;
      if (!ctx || timer !== null) return;
      index = 0;
      nextAt = ctx.currentTime + 0.1;
      timer = scheduler.setInterval(pump, options.tickMs ?? 40);
    },
    stop() {
      if (timer !== null) scheduler.clearInterval(timer);
      timer = null;
    },
    setBpm(next) {
      bpm = Math.max(1, next);
    },
    pump,
    get playing() {
      return timer !== null;
    },
    get stepIndex() {
      return index;
    }
  };
}

export interface ToneLoopVoice {
  readonly type?: OscillatorType;
  readonly freq: number;
  /** Cents. */
  readonly detune?: number;
  readonly gain?: number;
}

export interface ToneLoopOptions {
  /** Oscillators that run continuously (detune a few for a thicker engine or pad). */
  readonly voices?: readonly ToneLoopVoice[];
  /** Looping filtered noise (wind, surf, tyre hiss). */
  readonly noise?: { readonly gain: number; readonly filter?: SynthFilter };
  /** Low-pass (or other) filter on the tonal voices. */
  readonly filter?: SynthFilter;
  /** Loop level before `set`. Default 0 (silent until driven). */
  readonly gain?: number;
  /** Which bank bus the loop plays on. Default "sfx". */
  readonly bus?: "sfx" | "music";
}

export interface ToneLoopParams {
  /** Multiplies every voice's pitch (an engine's rev). */
  readonly pitch?: number;
  /** Tonal filter cutoff in Hz. */
  readonly cutoff?: number;
  /** Overall loop level. */
  readonly gain?: number;
  /** Noise level. */
  readonly noiseGain?: number;
}

export interface ToneLoop {
  start(): void;
  stop(): void;
  /** Smoothly move the loop toward new parameters (call every frame; cheap). */
  set(params: ToneLoopParams, timeConstant?: number): void;
  readonly running: boolean;
}

/** A continuous, parameter-driven bed: an engine drone, a wind layer, a quiet pad. */
export function createToneLoop(bank: SynthCueBank<string>, options: ToneLoopOptions = {}): ToneLoop {
  const voices = options.voices ?? [];
  let oscillators: Array<{ osc: OscillatorNode; base: number }> = [];
  let noiseSource: AudioBufferSourceNode | null = null;
  let noiseGain: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let out: GainNode | null = null;
  let running = false;
  return {
    get running() {
      return running;
    },
    start() {
      const ctx = bank.context;
      const bus = options.bus === "music" ? bank.musicDestination : bank.sfxDestination;
      if (!ctx || !bus || running) return;
      out = ctx.createGain();
      out.gain.value = Math.max(0.0001, options.gain ?? 0);
      out.connect(bus);
      if (voices.length > 0) {
        const tonalOut = ctx.createGain();
        filter = ctx.createBiquadFilter();
        const f = options.filter ?? { type: "lowpass" as const, freq: 2000 };
        filter.type = f.type;
        filter.frequency.value = f.freq;
        if (f.q !== undefined) filter.Q.value = f.q;
        filter.connect(tonalOut);
        tonalOut.connect(out);
        oscillators = voices.map((v) => {
          const osc = ctx.createOscillator();
          osc.type = v.type ?? "sawtooth";
          osc.frequency.value = v.freq;
          if (v.detune !== undefined) osc.detune.value = v.detune;
          const g = ctx.createGain();
          g.gain.value = v.gain ?? 0.3;
          osc.connect(g);
          g.connect(filter as BiquadFilterNode);
          osc.start();
          return { osc, base: v.freq };
        });
      }
      if (options.noise) {
        const buffer = bank.getNoiseBuffer();
        if (buffer) {
          noiseSource = ctx.createBufferSource();
          noiseSource.buffer = buffer;
          noiseSource.loop = true;
          const nf = ctx.createBiquadFilter();
          nf.type = options.noise.filter?.type ?? "bandpass";
          nf.frequency.value = options.noise.filter?.freq ?? 800;
          if (options.noise.filter?.q !== undefined) nf.Q.value = options.noise.filter.q;
          noiseGain = ctx.createGain();
          noiseGain.gain.value = Math.max(0.0001, options.noise.gain);
          noiseSource.connect(nf);
          nf.connect(noiseGain);
          noiseGain.connect(out);
          noiseSource.start();
        }
      }
      running = true;
    },
    stop() {
      if (!running) return;
      for (const { osc } of oscillators) osc.stop();
      noiseSource?.stop();
      oscillators = [];
      noiseSource = null;
      noiseGain = null;
      filter = null;
      out = null;
      running = false;
    },
    set(params, timeConstant = 0.08) {
      const ctx = bank.context;
      if (!ctx || !running) return;
      const t = ctx.currentTime;
      if (params.pitch !== undefined) for (const { osc, base } of oscillators) osc.frequency.setTargetAtTime(base * params.pitch, t, timeConstant);
      if (params.cutoff !== undefined && filter) filter.frequency.setTargetAtTime(params.cutoff, t, timeConstant);
      if (params.gain !== undefined && out) out.gain.setTargetAtTime(Math.max(0.0001, params.gain), t, timeConstant);
      if (params.noiseGain !== undefined && noiseGain) noiseGain.gain.setTargetAtTime(Math.max(0.0001, params.noiseGain), t, timeConstant);
    }
  };
}
