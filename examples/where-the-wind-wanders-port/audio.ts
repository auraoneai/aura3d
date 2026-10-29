/**
 * Synthesised sound for the valley (Web Audio only, no sample files): breathing wind, a shore wash,
 * birds, footsteps on grass, a hop, a letter chime and the bell's inharmonic ring. The original
 * also synthesises its sound from oscillators, gain, a stereo panner and biquad filters; the
 * cues here are the port's own recipes. Nothing starts until the first user gesture.
 */
import { AudioContextManager } from "@aura3d/engine/audio";

export interface WindAudio {
  /** Call from a user gesture (key, click, tap). Idempotent. */
  resume(): void;
  update(pos: { x: number; z: number }, timeSeconds: number): void;
  footstep(): void;
  hop(): void;
  land(): void;
  chime(index: number): void;
  bell(): void;
  setMuted(muted: boolean): void;
  /** Pause ducks the master gain to silence and stops the birds; the loops keep their place. */
  setPaused(paused: boolean): void;
  /** A hidden tab suspends the audio context; showing it again resumes it (if a gesture already started sound). */
  setHidden(hidden: boolean): void;
  readonly muted: boolean;
  readonly started: boolean;
  /** For QA: the context state and the master gain target. */
  readonly snapshot: { context: string; gain: number; paused: boolean; hidden: boolean };
}

const STORE = "aura3d-wind-port-muted";

export function createAudio(enabled: boolean): WindAudio {
  const manager = new AudioContextManager();
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let windGain: GainNode | null = null;
  let windFilter: BiquadFilterNode | null = null;
  let seaGain: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let birdTimer = 0;
  let muted = false;
  let paused = false;
  let hidden = false;
  try { muted = localStorage.getItem(STORE) === "1"; } catch { /* storage unavailable */ }

  const noiseBuffer = (c: AudioContext): AudioBuffer => {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = (w * 0.35 + last * 5.5) * 0.5;
    }
    return b;
  };

  const loopNoise = (c: AudioContext, out: AudioNode, type: BiquadFilterType, freq: number, q: number): { gain: GainNode; filter: BiquadFilterNode } => {
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(out);
    src.start(0, Math.random() * 1.5);
    return { gain, filter };
  };

  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number): void => {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  const tone = (freq: number, t: number, peak: number, decay: number, type: OscillatorType = "sine", pan = 0, glideTo?: number): void => {
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + decay * 0.8);
    p.pan.value = pan;
    env(g, t, peak, 0.012, decay);
    o.connect(g).connect(p).connect(master);
    o.start(t);
    o.stop(t + decay + 0.1);
  };

  const chirp = (): void => {
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    const pan = Math.random() * 1.6 - 0.8;
    const base = 2200 + Math.random() * 1800;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) tone(base * (1 + i * 0.09 * (Math.random() < 0.5 ? 1 : -1)), t + i * 0.11, 0.03, 0.09, "sine", pan, base * (1.25 + Math.random() * 0.3));
  };

  const scheduleBirds = (): void => {
    birdTimer = window.setTimeout(() => {
      if (!muted && !paused && !hidden) chirp();
      scheduleBirds();
    }, 2600 + Math.random() * 6200);
  };

  const level = (): number => (muted || paused ? 0 : 0.8);
  const apply = (): void => {
    if (master && ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.05);
  };

  return {
    get muted() { return muted; },
    get started() { return ctx !== null; },
    get snapshot() { return { context: ctx?.state ?? "none", gain: level(), paused, hidden }; },
    resume() {
      if (!enabled) return;
      if (ctx) { if (!hidden) void ctx.resume(); return; }
      if (typeof AudioContext === "undefined") return;
      ctx = manager.context as unknown as AudioContext;
      master = ctx.createGain();
      master.gain.value = level();
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      noise = noiseBuffer(ctx);
      const wind = loopNoise(ctx, master, "bandpass", 520, 0.7);
      windGain = wind.gain;
      windFilter = wind.filter;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.09;
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(wind.filter.frequency);
      lfo.start();
      const sea = loopNoise(ctx, master, "lowpass", 700, 0.4);
      seaGain = sea.gain;
      const swell = ctx.createOscillator();
      const swellGain = ctx.createGain();
      swell.frequency.value = 0.13;
      swellGain.gain.value = 0.04;
      swell.connect(swellGain).connect(sea.gain.gain);
      swell.start();
      scheduleBirds();
      if (!hidden) void ctx.resume();
    },
    update(pos, time) {
      if (!ctx || !windGain || !seaGain || !windFilter) return;
      const shore = Math.max(0, Math.min(1, (-5 - pos.z) / 10));
      windGain.gain.setTargetAtTime(0.1 + 0.035 * Math.sin(time * 0.37) + 0.03 * Math.sin(time * 0.91), ctx.currentTime, 0.4);
      seaGain.gain.setTargetAtTime(0.025 + 0.11 * shore, ctx.currentTime, 0.6);
    },
    footstep() {
      if (!ctx || !master || muted || paused || !noise) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 520 + Math.random() * 520;
      f.Q.value = 0.9;
      const g = ctx.createGain();
      env(g, t, 0.07 + Math.random() * 0.03, 0.006, 0.09);
      src.connect(f).connect(g).connect(master);
      src.start(t, Math.random() * 1.5, 0.2);
    },
    hop() { if (ctx && !muted) tone(260, ctx.currentTime, 0.05, 0.16, "triangle", 0, 420); },
    land() {
      if (!ctx || !master || muted || !noise) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 480;
      const g = ctx.createGain();
      env(g, t, 0.12, 0.005, 0.12);
      src.connect(f).connect(g).connect(master);
      src.start(t, Math.random(), 0.25);
    },
    chime(index) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const root = [523.25, 587.33, 659.25][index % 3]!;
      [1, 1.25, 1.5, 2].forEach((r, i) => {
        tone(root * r, t + i * 0.09, 0.07, 1.4, "sine", -0.2 + i * 0.13);
        tone(root * r * 2.005, t + i * 0.09, 0.02, 0.9, "triangle", 0.1);
      });
    },
    bell() {
      if (!ctx || muted) return;
      const base = 196;
      const partials = [1, 2.0, 2.76, 5.4, 8.93];
      for (let strike = 0; strike < 3; strike++) {
        const t = ctx.currentTime + strike * 1.9;
        partials.forEach((r, i) => tone(base * r, t, 0.16 / (1 + i * 0.9), 3.6 / (1 + i * 0.35), "sine", (i % 2 ? 0.2 : -0.2)));
      }
    },
    setPaused(value) {
      paused = value;
      apply();
    },
    setHidden(value) {
      hidden = value;
      if (!ctx) return;
      if (value) void ctx.suspend();
      else void ctx.resume();
    },
    setMuted(value) {
      muted = value;
      try { localStorage.setItem(STORE, value ? "1" : "0"); } catch { /* storage unavailable */ }
      apply();
    }
  };
}
