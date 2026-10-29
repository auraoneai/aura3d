/**
 * Last Train audio: a synth on the shared `AudioContextManager` (the repo allows exactly one owner of an AudioContext).
 * Everything is generated: wind and rail rumble as filtered noise that follow speed, wheel clacks at the joint spacing, a
 * flange squeal when the tram leans hard, rain hiss, a slow pad that thins at night, and one short cue per event. Nothing is
 * sampled or loaded, and `Math.random` is never touched (the simulation's random stream is untouched), so noise uses an LCG.
 * Cues derive from state changes the renderer observes (`diffCues`), never from the simulation.
 */
import { AudioContextManager, createCueBank, type CueSpec, type ToneLayer } from "@aura3d/engine/audio";

export type Cue = "doors" | "depart" | "arrive" | "fare" | "tip" | "lost" | "complete";

export interface AudioState {
  phase: string;
  speed: number;
  roll: number;
  fares: number;
  tips: number;
  lost: number;
  night: boolean;
  weather: "clear" | "rain" | "snow";
  complete: boolean;
}

/** Cues for the change between two consecutive observed states (pure: unit tested). */
export function diffCues(prev: AudioState | null, next: AudioState): Cue[] {
  const out: Cue[] = [];
  if (!prev) return out;
  if (prev.phase === "docked" && next.phase === "opening") out.push("doors");
  if (prev.phase === "ready" && next.phase !== "ready" && next.phase !== "boarding") out.push("depart");
  if (prev.phase === "enroute" && next.phase !== "enroute") out.push("arrive");
  if (next.fares > prev.fares) out.push("fare");
  if (next.tips > prev.tips) out.push("tip");
  if (next.lost > prev.lost) out.push("lost");
  if (!prev.complete && next.complete) out.push("complete");
  return out;
}

const tone = (freq: number, dur: number, gain: number, delay = 0, type: OscillatorType = "sine", slideTo?: number): ToneLayer => ({ freq, dur, gain, delay, type, attack: 0.012, ...(slideTo ? { slideTo } : {}) });

/** The per-event cues are pure oscillator tones, so they play on the shared cue bank; the clack stays here (its noise burst starts at a random offset into a filtered buffer). */
export const CUES = {
  doors: { layers: [tone(880, 0.5, 0.12), tone(1175, 0.7, 0.1, 0.18)] },
  depart: { layers: [tone(523, 0.22, 0.1), tone(523, 0.22, 0.1, 0.3), tone(392, 0.5, 0.08, 0.6, "triangle")] },
  arrive: { layers: [tone(659, 0.4, 0.1), tone(523, 0.4, 0.1, 0.22), tone(784, 0.8, 0.09, 0.45)] },
  fare: { layers: [tone(1568, 0.16, 0.09, 0, "triangle"), tone(2093, 0.3, 0.07, 0.07, "triangle")] },
  tip: { layers: [1047, 1319, 1568, 2093].map((f, i) => tone(f, 0.22, 0.06, i * 0.06, "triangle")) },
  lost: { layers: [tone(330, 0.5, 0.12, 0, "sawtooth", 196)] },
  complete: { layers: [523, 659, 784, 1047, 1319].map((f, i) => tone(f, 0.7, 0.09, i * 0.12)) }
} satisfies Record<Cue, CueSpec>;

const JOINT_SPACING = 14;
const PAD_CHORDS = [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 7]];
const PAD_ROOT = 130.81;
const semis = (n: number): number => PAD_ROOT * Math.pow(2, n / 12);

export class TrainSound {
  private readonly manager = new AudioContextManager();
  private readonly bank = createCueBank({ cues: CUES, manager: this.manager, masterGain: 0.85, sfxGain: 1, muteKey: false });
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: GainNode | null = null;
  private rumble: GainNode | null = null;
  private hiss: GainNode | null = null;
  private squeal: GainNode | null = null;
  private pad: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lcg = 0x1f3d5b7;
  private carried = 0;
  private chord = 0;
  private nextChordAt = 0;
  private padVoices: OscillatorNode[] = [];
  muted = false;
  private hidden = false;

  private rand(): number { this.lcg = (this.lcg * 1664525 + 1013904223) >>> 0; return this.lcg / 4294967296; }

  /** Call from a user gesture (first key or pointer). Safe to call repeatedly. */
  async unlock(): Promise<void> {
    try {
      if (this.ctx) { if (this.ctx.state === "suspended" && !this.hidden) await this.ctx.resume(); return; }
      const ctx = this.manager.context as unknown as AudioContext;
      this.ctx = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      this.bank.setMuted(this.muted);
      void this.bank.unlock();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let low = 0;
      for (let i = 0; i < len; i++) { const w = this.rand() * 2 - 1; low += (w - low) * 0.18; data[i] = (w * 0.6 + low * 0.9); }
      this.wind = this.loop("bandpass", 520, 0.55);
      this.rumble = this.loop("lowpass", 170, 0.9);
      this.hiss = this.loop("highpass", 3600, 0.7);
      this.squeal = ctx.createGain();
      this.squeal.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.type = "triangle"; osc.frequency.value = 1880;
      osc.connect(this.squeal); this.squeal.connect(this.master); osc.start();
      this.pad = ctx.createGain();
      this.pad.gain.value = 0.0001;
      this.pad.connect(this.master);
      this.padVoices = [0, 1, 2, 3].map((i) => {
        const v = ctx.createOscillator();
        v.type = i < 3 ? "sine" : "triangle";
        v.frequency.value = semis(PAD_CHORDS[0]![i]!);
        const g = ctx.createGain();
        g.gain.value = 0.22;
        v.connect(g); g.connect(this.pad!); v.start();
        return v;
      });
    } catch { /* audio is optional: a blocked or missing AudioContext leaves the game silent */ }
  }

  private loop(type: BiquadFilterType, freq: number, q: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(this.master!);
    src.start(0, this.rand() * 1.5);
    return gain;
  }

  /** Suspend the context while the tab is hidden (the loop gains only change on rendered frames, which stop there), resume when visible. */
  async setHidden(hidden: boolean): Promise<void> {
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (hidden && ctx.state === "running") await ctx.suspend();
      else if (!hidden && ctx.state === "suspended") await ctx.resume();
    } catch { /* audio is optional */ }
  }

  /** QA: the context state, mute and hidden flags. */
  status(): { context: string; muted: boolean; hidden: boolean } {
    return { context: this.ctx?.state ?? "none", muted: this.muted, hidden: this.hidden };
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.bank.setMuted(muted);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  /** Follow the observed state: loop levels, wheel clacks by distance covered, rain, pad. `dt` in seconds. */
  update(state: AudioState, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.wind || !this.rumble || !this.hiss || !this.squeal || !this.pad) return;
    const t = ctx.currentTime;
    const v = Math.abs(state.speed);
    const k = Math.min(1, v / 22);
    this.wind.gain.setTargetAtTime(0.05 + 0.2 * k, t, 0.3);
    this.rumble.gain.setTargetAtTime(0.02 + 0.3 * k * k, t, 0.2);
    this.hiss.gain.setTargetAtTime(state.weather === "rain" ? 0.07 : 0, t, 0.6);
    this.squeal.gain.setTargetAtTime(Math.max(0, Math.abs(state.roll) - 0.3) * 0.12 * k, t, 0.08);
    this.pad.gain.setTargetAtTime(state.night ? 0.05 : 0.032, t, 1.2);
    if (t >= this.nextChordAt) {
      this.chord = (this.chord + 1) % PAD_CHORDS.length;
      this.padVoices.forEach((voice, i) => voice.frequency.setTargetAtTime(semis(PAD_CHORDS[this.chord]![i]!), t, 1.4));
      this.nextChordAt = t + 8;
    }
    this.carried += v * dt;
    while (this.carried >= JOINT_SPACING) { this.carried -= JOINT_SPACING; this.clack(0.5 + 0.5 * k, 0); this.clack(0.35 + 0.4 * k, 0.09); }
  }

  private clack(level: number, delay: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 1400 + this.rand() * 700; filter.Q.value = 1.2;
    const g = ctx.createGain();
    const at = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16 * level, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(at, this.rand() * 1.8, 0.08);
  }

  cue(cue: Cue): void {
    if (!this.ctx) return;
    this.bank.play(cue);
  }
}
