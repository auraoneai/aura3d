/**
 * Roadster Hours audio: a small synth on the shared `AudioContextManager` (the repo allows exactly one owner of an
 * AudioContext). Everything is generated here (no samples, no assets, no `Math.random`): a speed-driven engine voice
 * (detuned saws through a moving low-pass, never a pure sub-bass sine), wind noise, a quiet chord-pad and arpeggio, and
 * one short effect per game event. Events are derived from state changes the renderer observes (`diffRunEvents`), never
 * from the simulation.
 */
import { AudioContextManager } from "@aura3d/engine/audio";

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

interface ToneSpec { freq: number; type?: OscillatorType; dur?: number; gain?: number; slideTo?: number; delay?: number }
interface NoiseSpec { dur?: number; gain?: number; freq?: number; q?: number; type?: BiquadFilterType; slideTo?: number }

export class RoadsterSound {
  private readonly manager = new AudioContextManager();
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
  private lcg = 0x1badf00d;
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
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
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
    if (!this.ctx || !this.sfx || this.muted || this.ctx.state !== "running") return;
    switch (sound) {
      case "beep":
        this.tone({ freq: 440, type: "square", dur: 0.16, gain: 0.1 });
        break;
      case "go":
        this.tone({ freq: 880, type: "square", dur: 0.34, gain: 0.12 });
        this.tone({ freq: 1320, type: "triangle", dur: 0.4, gain: 0.08, delay: 0.02 });
        break;
      case "gate":
        this.tone({ freq: 660, type: "triangle", dur: 0.16, gain: 0.13 });
        this.tone({ freq: 990, type: "sine", dur: 0.28, gain: 0.12, delay: 0.07 });
        break;
      case "cell":
        this.tone({ freq: 1040, type: "sine", dur: 0.14, gain: 0.11, slideTo: 1560 });
        break;
      case "crash":
        this.tone({ freq: 160, type: "sawtooth", dur: 0.4, gain: 0.18, slideTo: 48 });
        this.noiseHit({ dur: 0.42, gain: 0.22, freq: 700, q: 0.6, slideTo: 90 });
        break;
      case "landing":
        this.tone({ freq: 90, type: "sine", dur: 0.2, gain: 0.2, slideTo: 40 });
        this.noiseHit({ dur: 0.16, gain: 0.08, freq: 500, q: 0.8, slideTo: 140 });
        break;
      case "nearmiss":
        this.noiseHit({ dur: 0.3, gain: 0.09, freq: 1200, q: 1.4, slideTo: 3200 });
        break;
      case "combo":
        this.tone({ freq: note(PENTA[5]!), type: "triangle", dur: 0.16, gain: 0.12 });
        this.tone({ freq: note(PENTA[7]!), type: "triangle", dur: 0.2, gain: 0.12, delay: 0.08 });
        break;
      case "clear":
        this.tone({ freq: note(PENTA[4]!), type: "sine", dur: 0.12, gain: 0.1, slideTo: note(PENTA[6]!) });
        break;
      case "boost":
        this.noiseHit({ dur: 0.6, gain: 0.12, freq: 400, q: 0.7, slideTo: 3600 });
        this.tone({ freq: 220, type: "sawtooth", dur: 0.5, gain: 0.07, slideTo: 880 });
        break;
      case "finish":
        [0, 4, 7, 12].forEach((s, i) => this.tone({ freq: note(12 + s), type: "triangle", dur: 0.5, gain: 0.12, delay: i * 0.12 }));
        break;
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try { this.engine?.oscA.stop(); this.engine?.oscB.stop(); } catch { /* already stopped */ }
    void this.manager.dispose();
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

  private tone(spec: ToneSpec): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const { freq, type = "sine", dur = 0.15, gain = 0.2, slideTo, delay = 0 } = spec;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(this.sfx);
    osc.start(at);
    osc.stop(at + dur + 0.03);
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

  private noiseHit(spec: NoiseSpec): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const { dur = 0.2, gain = 0.15, freq = 1200, q = 1, type = "bandpass", slideTo } = spec;
    const at = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, at);
    filter.Q.value = q;
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfx);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
}
