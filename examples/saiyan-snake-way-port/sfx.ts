/**
 * Small synthesised sound effects (Web Audio, no asset files): pickups, jump, landing, hits, surge and
 * flight whooshes. Everything is a one-shot with a short envelope and there is no continuous bed.
 * The context is created on the first key press or click so browsers allow it.
 */
import { AudioContextManager } from "@aura3d/engine/audio";

export interface Sfx {
  unlock(): void;
  toggleMute(): boolean;
  pickup(chain: number): void;
  jump(): void;
  land(): void;
  hit(): void;
  surge(rung: number): void;
  whoosh(): void;
  fall(): void;
  fanfare(): void;
}

export function createSfx(): Sfx {
  const manager = new AudioContextManager();
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let noiseBuffer: AudioBuffer | null = null;

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    if (typeof AudioContext === "undefined") return null;
    ctx = manager.context as unknown as AudioContext;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    return ctx;
  };

  const tone = (freq: number, to: number, dur: number, type: OscillatorType, gain: number, delay = 0): void => {
    const c = ensure();
    if (!c || !master || c.state === "suspended") return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  const noise = (dur: number, from: number, to: number, gain: number, delay = 0): void => {
    const c = ensure();
    if (!c || !master || !noiseBuffer || c.state === "suspended") return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  };

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === "suspended") void c.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    pickup(chain) {
      const base = 660 * Math.pow(2, Math.min(chain, 12) / 12);
      tone(base, base * 1.5, 0.12, "triangle", 0.1);
      tone(base * 2, base * 2.4, 0.09, "sine", 0.05, 0.04);
    },
    jump() { tone(280, 520, 0.16, "square", 0.04); noise(0.14, 900, 2200, 0.05); },
    land() { tone(140, 70, 0.1, "sine", 0.12); noise(0.08, 500, 200, 0.05); },
    hit() { tone(180, 55, 0.28, "sawtooth", 0.1); noise(0.22, 1400, 180, 0.12); },
    surge(rung) { noise(0.5, 300, 3200, 0.12 + rung * 0.015); tone(120, 340 + rung * 40, 0.45, "sawtooth", 0.05); },
    whoosh() { noise(0.7, 400, 2600, 0.1); },
    fall() { tone(520, 70, 1.2, "sine", 0.1); noise(1.1, 2400, 200, 0.07); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.4, "triangle", 0.09, i * 0.12)); }
  };
}
