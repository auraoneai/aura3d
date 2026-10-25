/**
 * Roadster Hours audio: a small synth on the shared `AudioContextManager` (the repo allows exactly one owner of an
 * AudioContext). Everything is generated here (no samples, no assets, no `Math.random`): a speed-driven engine voice
 * (detuned saws through a moving low-pass, never a pure sub-bass sine), wind noise, a quiet chord-pad and arpeggio, and
 * one short effect per game event. Events are derived from state changes the renderer observes (`diffRunEvents`), never
 * from the simulation.
 */
import { AudioContextManager, createCueBank, type CueSpec, type NoiseLayer, type ToneLayer } from "@aura3d/engine/audio";

export interface AudioFrame {
  phase: string;
  countdown: number;
  speed: number;
  grounded: boolean;
  boosting: boolean;
  nitro: number;
  nextGate: number;
  cells: number;
  crashes: number;
  cleanLandings: number;
  nearMisses: number;
  combos: number;
  vehiclesCleared: number;
  throttle: boolean;
}

export type GameSound = "beep" | "go" | "gate" | "cell" | "crash" | "landing" | "nearmiss" | "combo" | "boost" | "finish" | "clear";

/** Derives sound events from consecutive frames (pure: unit tested). */
export function diffRunEvents(prev: AudioFrame | null, next: AudioFrame): GameSound[] {
  const out: GameSound[] = [];
  if (!prev) return out;
  if (next.phase === "countdown" && Math.ceil(next.countdown) !== Math.ceil(prev.countdown) && prev.phase === "countdown") out.push("beep");
  if (prev.phase === "countdown" && next.phase === "running") out.push("go");
  if (next.phase === "complete" && prev.phase !== "complete") { out.push("finish"); return out; }
  if (next.nextGate > prev.nextGate) out.push("gate");
  if (next.cells > prev.cells) out.push("cell");
  if (next.crashes > prev.crashes) out.push("crash");
  if (next.cleanLandings > prev.cleanLandings) out.push("landing");
  if (next.nearMisses > prev.nearMisses) out.push("nearmiss");
  if (next.combos > prev.combos) out.push("combo");
  if (next.vehiclesCleared > prev.vehiclesCleared) out.push("clear");
  if (next.boosting && !prev.boosting) out.push("boost");
  return out;
}

const A2 = 110;
const note = (semitones: number): number => A2 * Math.pow(2, semitones / 12);
/** Chord roots (semitones above A2) per bar: Am, F, C, G. */
const ROOTS = [0, -4, 3, -2];
const CHORD = [[0, 7, 12, 15], [0, 7, 12, 16], [0, 7, 12, 16], [0, 7, 12, 14]];
const ARP_STEPS = [0, 2, 3, 2, 4, 3, 2, 0];
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

const tone = (freq: number, type: OscillatorType, dur: number, gain: number, delay = 0, slideTo?: number): ToneLayer => ({ freq, type, dur, gain, delay, ...(slideTo !== undefined ? { slideTo } : {}) });
const hit = (dur: number, gain: number, freq: number, q: number, slideTo: number): NoiseLayer => ({ kind: "noise", dur, gain, freq, q, slideTo });

/** One short effect per game event, on the shared cue bank (the kit's tone and noise defaults are the ones this file used to hand-roll). */
export const CUES = {
  beep: { layers: [tone(440, "square", 0.16, 0.1)] },
  go: { layers: [tone(880, "square", 0.34, 0.12), tone(1320, "triangle", 0.4, 0.08, 0.02)] },
  gate: { layers: [tone(660, "triangle", 0.16, 0.13), tone(990, "sine", 0.28, 0.12, 0.07)] },
  cell: { layers: [tone(1040, "sine", 0.14, 0.11, 0, 1560)] },
  crash: { layers: [tone(160, "sawtooth", 0.4, 0.18, 0, 48), hit(0.42, 0.22, 700, 0.6, 90)] },
  landing: { layers: [tone(90, "sine", 0.2, 0.2, 0, 40), hit(0.16, 0.08, 500, 0.8, 140)] },
  nearmiss: { layers: [hit(0.3, 0.09, 1200, 1.4, 3200)] },
  combo: { layers: [tone(note(PENTA[5]!), "triangle", 0.16, 0.12), tone(note(PENTA[7]!), "triangle", 0.2, 0.12, 0.08)] },
  clear: { layers: [tone(note(PENTA[4]!), "sine", 0.12, 0.1, 0, note(PENTA[6]!))] },
  boost: { layers: [hit(0.6, 0.12, 400, 0.7, 3600), tone(220, "sawtooth", 0.5, 0.07, 0, 880)] },
  finish: { layers: [0, 4, 7, 12].map((st, i) => tone(note(12 + st), "triangle", 0.5, 0.12, i * 0.12)) }
} satisfies Record<GameSound, CueSpec>;
const NOISE_SEED = 0x1badf00d;

export class RoadsterSound {
  private readonly manager = new AudioContextManager();
  private readonly bank = createCueBank({ cues: CUES, manager: this.manager, masterGain: 0.85, sfxGain: 0.9, noiseSeed: NOISE_SEED, muteKey: false });
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private engine: { oscA: OscillatorNode; oscB: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private wind: { filter: BiquadFilterNode; gain: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextAt = 0;
  private lcg = NOISE_SEED;
  private prev: AudioFrame | null = null;
  muted = false;

  /** Must be called from a user gesture (first pointer/key). Safe to call repeatedly. */
  async unlock(): Promise<void> {
    try {
      if (!this.ctx) {
        this.ctx = this.manager.context as unknown as AudioContext;
        const ctx = this.ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.85;
        this.master.connect(ctx.destination);
        this.music = ctx.createGain();
        this.music.gain.value = 0.0001;
        this.music.connect(this.master);
        this.sfx = ctx.createGain();
        this.sfx.gain.value = 0.9;
        this.sfx.connect(this.master);
        this.buildEngine();
      }
      await this.manager.unlock();
      this.bank.setMuted(this.muted);
      await this.bank.unlock();
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.bank.setMuted(muted);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  setScreen(screen: "home" | "play" | "results"): void {
    if (!this.music || !this.ctx) return;
    const target = screen === "play" ? 0.07 : screen === "home" ? 0.1 : 0.05;
    this.music.gain.setTargetAtTime(target, this.ctx.currentTime, 0.5);
    if (screen !== "play") this.setEngine(0, false);
  }

  /** Once per rendered frame: derive events and drive the engine voice. */
  update(frame: AudioFrame): void {
    const events = diffRunEvents(this.prev, frame);
    this.prev = frame;
    for (const e of events) this.play(e);
    const active = frame.phase === "running";
    this.setEngine(active ? frame.speed : 0, active && frame.throttle, frame.boosting || frame.nitro > 0);
  }

  reset(): void { this.prev = null; }

  private buildEngine(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 300;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const oscA = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.value = 70;
    const oscB = ctx.createOscillator();
    oscB.type = "square";
    oscB.frequency.value = 71.3;
    const mixB = ctx.createGain();
    mixB.gain.value = 0.35;
    oscA.connect(filter);
    oscB.connect(mixB);
    mixB.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    oscA.start();
    oscB.start();
    this.engine = { oscA, oscB, filter, gain };
    const wf = ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 700;
    wf.Q.value = 0.5;
    const wg = ctx.createGain();
    wg.gain.value = 0.0001;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    src.connect(wf);
    wf.connect(wg);
    wg.connect(this.sfx);
    src.start();
    this.wind = { filter: wf, gain: wg };
  }

  private setEngine(speed: number, throttle: boolean, boosting = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.engine || !this.wind) return;
    const t = ctx.currentTime;
    const v = Math.min(1.2, speed / 74);
    const f = 58 + v * 150 + (boosting ? 22 : 0);
    this.engine.oscA.frequency.setTargetAtTime(f, t, 0.08);
    this.engine.oscB.frequency.setTargetAtTime(f * 1.006, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(280 + v * 1300 + (throttle ? 450 : 0), t, 0.1);
    this.engine.gain.gain.setTargetAtTime(speed > 0.5 ? 0.028 + v * 0.03 + (throttle ? 0.014 : 0) : 0.0001, t, 0.12);
    this.wind.filter.frequency.setTargetAtTime(500 + v * 1900, t, 0.15);
    this.wind.gain.gain.setTargetAtTime(speed > 0.5 ? v * v * 0.14 : 0.0001, t, 0.2);
  }

  play(sound: GameSound): void {
    if (!this.ctx || !this.sfx || this.muted) return;
    this.bank.play(sound);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try { this.engine?.oscA.stop(); this.engine?.oscB.stop(); } catch { /* already stopped */ }
    this.bank.dispose();
    this.ctx = null;
  }

  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.music || this.timer) return;
    const eighth = 60 / 100 / 2;
    this.step = 0;
    this.nextAt = ctx.currentTime + 0.1;
    this.setScreen("home");
    this.timer = setInterval(() => {
      while (this.nextAt < ctx.currentTime + 0.25) {
        const at = this.nextAt;
        const n = this.step;
        const bar = Math.floor(n / 8) % ROOTS.length;
        const beat = n % 8;
        if (beat === 0) {
          for (const tone of CHORD[bar]!) this.voice("triangle", note(ROOTS[bar]! + tone), at, 8 * eighth * 0.96, 0.028, 0.35);
          this.voice("sine", note(ROOTS[bar]! - 12), at, 3.6 * eighth, 0.08, 0.02);
          this.voice("sine", note(ROOTS[bar]! - 12), at + 4 * eighth, 3.6 * eighth, 0.07, 0.02);
        }
        this.voice("sine", note(ROOTS[bar]! + 12 + PENTA[ARP_STEPS[beat]! + 2]!), at, 1.2 * eighth, 0.034, 0.01);
        this.nextAt += eighth;
        this.step++;
      }
    }, 40);
  }

  private voice(type: OscillatorType, freq: number, at: number, dur: number, gain: number, attack: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.max(0.01, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(this.music);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private noiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.noise) {
      const len = Math.floor(1.5 * ctx.sampleRate);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        this.lcg = (Math.imul(this.lcg, 1664525) + 1013904223) >>> 0;
        data[i] = this.lcg / 0x80000000 - 1;
      }
      this.noise = buffer;
    }
    return this.noise;
  }
}
