/**
 * Procedural audio for the port, generated with the Web Audio API (no sample files, nothing from the original):
 * a low drifting pad per chapter, rider hum and wind that follow speed and boost, and short chimes for rings,
 * objectives, impacts and the ending. Browsers need a user gesture before audio starts, so `resume()` is called from the
 * title screen's start button, the first key press, a canvas or touch-button press and the mute buttons; QA and autopilot URLs
 * never create a context unless the tester presses something.
 */
import { AudioContextManager } from "@aura3d/engine/audio";
import type { Sim, SimEvent } from "./sim";

export interface SiltAudio {
  resume(): void;
  update(sim: Sim, dt: number): void;
  chime(kind: SimEvent["type"] | "scene"): void;
  /** GU47 DG-S5: a thunder roll `delaySeconds` after a lightning flash, `strength` 0..1 */
  thunder(delaySeconds: number, strength: number): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  readonly running: boolean;
}

const PADS: readonly (readonly number[])[] = [
  [110, 164.81, 220],
  [98, 146.83, 196],
  [92.5, 138.59, 185],
  [103.83, 155.56, 207.65],
  [116.54, 174.61, 233.08],
  [87.31, 130.81, 174.61],
  [110, 165, 247.5]
];

export function createSiltAudio(chapter: number): SiltAudio {
  const manager = new AudioContextManager();
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let hum: OscillatorNode | null = null;
  let humGain: GainNode | null = null;
  let windGain: GainNode | null = null;
  let windFilter: BiquadFilterNode | null = null;
  let muted = false;

  const start = (): void => {
    if (ctx) return;
    if (typeof AudioContext === "undefined") return;
    ctx = manager.context as unknown as AudioContext;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    const pad = ctx.createGain();
    pad.gain.value = 0.06;
    pad.connect(master);
    for (const f of PADS[chapter % PADS.length]!) {
      for (const detune of [-6, 7]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = 0.33;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.05 + Math.random() * 0.07;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.16;
        lfo.connect(lfoGain).connect(g.gain);
        o.connect(g).connect(pad);
        o.start();
        lfo.start();
      }
    }

    hum = ctx.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.value = 62;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 340;
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    hum.connect(humFilter).connect(humGain).connect(master);
    hum.start();

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    src.connect(windFilter).connect(windGain).connect(master);
    src.start();
  };

  const tone = (freq: number, at: number, length: number, gain: number, type: OscillatorType = "sine"): void => {
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + at);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + length);
    o.connect(g).connect(master);
    o.start(ctx.currentTime + at);
    o.stop(ctx.currentTime + at + length + 0.05);
  };

  return {
    resume() {
      start();
      void ctx?.resume();
    },
    update(sim, dt) {
      if (!ctx || !humGain || !windGain || !windFilter || !hum) return;
      const speed = Math.abs(sim.flight.speed);
      const t = ctx.currentTime;
      const k = Math.min(1, dt * 6);
      hum.frequency.setTargetAtTime(58 + speed * 1.4 + (sim.flight.boosting ? 22 : 0), t, 0.1);
      humGain.gain.setTargetAtTime(0.025 + Math.min(0.1, speed * 0.0012) + (sim.flight.boosting ? 0.04 : 0), t, 0.1 + k * 0);
      windGain.gain.setTargetAtTime(Math.min(0.2, speed * 0.003), t, 0.15);
      windFilter.frequency.setTargetAtTime(380 + speed * 14, t, 0.15);
    },
    chime(kind) {
      if (!ctx) return;
      if (kind === "point") { tone(659.25, 0, 0.5, 0.12); tone(987.77, 0.08, 0.6, 0.09); }
      else if (kind === "attach") { tone(392, 0, 0.35, 0.12, "triangle"); tone(523.25, 0.1, 0.45, 0.1, "triangle"); }
      else if (kind === "complete") { for (const [i, f] of [523.25, 659.25, 783.99, 1046.5].entries()) tone(f, i * 0.12, 0.9, 0.1); }
      else if (kind === "impact") { tone(72, 0, 0.28, 0.22); tone(118, 0, 0.16, 0.12, "triangle"); }
      else tone(440, 0, 0.4, 0.06, "triangle");
    },
    thunder(delaySeconds, strength) {
      if (!ctx || !master) return;
      // low-passed noise: a sharp crack that rolls off over about 2.5 s
      const at = ctx.currentTime + Math.max(0, delaySeconds);
      const length = 2.6;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) { last = last * 0.96 + (Math.random() * 2 - 1) * 0.04; data[i] = last * 6; }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900, at);
      filter.frequency.exponentialRampToValueAtTime(120, at + length);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.32 * Math.max(0, Math.min(1, strength)), at + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, at + length);
      src.connect(filter).connect(g).connect(master);
      src.start(at);
      src.stop(at + length + 0.05);
    },
    setMuted(value) {
      muted = value;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
    },
    get muted() { return muted; },
    get running() { return !!ctx && ctx.state === "running"; }
  };
}
