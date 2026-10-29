/**
 * Roadster Hours audio: a small synth on the shared `AudioContextManager` (the repo allows exactly one owner of an
 * AudioContext). Everything is generated here (no samples, no assets, no `Math.random`): a speed-driven engine voice
 * (detuned saws through a moving low-pass, never a pure sub-bass sine), wind noise, a quiet chord-pad and arpeggio, and
 * one short effect per game event. Cues come from the simulation's per-step events (`eventCues`, collected for every step
 * between two rendered frames) plus a few state changes the renderer observes (`diffRunEvents`).
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
  /** A relay was passed outside the gate (the sim raises a toast, no event). */
  gateMiss?: boolean;
  overheated?: boolean;
}

export type GameSound =
  | "beep" | "go" | "gate" | "cell" | "crash" | "landing" | "nearmiss" | "combo" | "boost" | "finish" | "clear"
  | "landed" | "scrape" | "impact" | "overheat" | "trick" | "roll" | "hop" | "trailer" | "shortcut" | "nitro" | "perfect" | "shockwave" | "miss" | "flare";

/** One simulation event as `sim.ts` pushes it into `run.events` (only `type` and a few fields are read). */
export interface SimEvent { readonly type: string; readonly [key: string]: unknown }

/**
 * Cues derived from consecutive rendered frames (pure: unit tested): only what the sim reports as state, not as an event —
 * the countdown beeps, thrust start, a missed relay and overheating. Everything else comes from `eventCues`.
 */
export function diffRunEvents(prev: AudioFrame | null, next: AudioFrame): GameSound[] {
  const out: GameSound[] = [];
  if (!prev) return out;
  if (next.phase === "countdown" && Math.ceil(next.countdown) !== Math.ceil(prev.countdown) && prev.phase === "countdown") out.push("beep");
  if (next.phase !== "running") return out;
  if (next.boosting && !prev.boosting) out.push("boost");
  if (next.gateMiss && !prev.gateMiss) out.push("miss");
  if (next.overheated && !prev.overheated) out.push("overheat");
  return out;
}

/**
 * Cues for the simulation events of every step since the last rendered frame (pure: unit tested). Each sound plays at most
 * once per frame, so an event the sim repeats on consecutive steps (a vent, a long scrape) does not stack.
 */
export function eventCues(events: readonly SimEvent[]): GameSound[] {
  const out = new Set<GameSound>();
  for (const e of events) {
    switch (e.type) {
      case "go": out.add("go"); break;
      case "finish": out.add("finish"); break;
      case "checkpoint": out.add("gate"); break;
      case "cell": out.add("cell"); break;
      case "recover": out.add("crash"); break;
      case "land": out.add(e.clean ? "landing" : "landed"); break;
      case "landingFlare": out.add("flare"); break;
      case "closePass": out.add("nearmiss"); break;
      case "combo": out.add("combo"); break;
      case "lineup": out.add("clear"); break;
      case "scrape": out.add("scrape"); break;
      case "impact": out.add("impact"); break;
      case "trick": out.add("trick"); break;
      case "roll": out.add("roll"); break;
      case "hop": out.add("hop"); break;
      case "trailer": out.add("trailer"); break;
      case "nitro": out.add(e.level === 3 ? "shockwave" : e.level === 2 ? "perfect" : "nitro"); break;
      case "reward": if (e.label === "ROOFLINE CUT") out.add("shortcut"); break;
      default: break;
    }
  }
  // The finish fanfare replaces the route-complete reward chirps of the same step.
  if (out.has("finish")) return ["finish"];
  return [...out];
}

/**
 * Music steps to schedule this tick. A hidden tab throttles timers to about 1 s, and steps whose time has already passed
 * would all start at once (a note cluster), so late steps are skipped: scheduling restarts just ahead of `now`.
 */
export function musicSteps(nextAt: number, now: number, stepSeconds: number, lookahead = 0.25, restart = 0.05): { times: number[]; nextAt: number } {
  let at = Math.max(nextAt, now + (nextAt < now ? restart : 0));
  const times: number[] = [];
  while (at < now + lookahead) { times.push(at); at += stepSeconds; }
  return { times, nextAt: at };
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
  finish: { layers: [0, 4, 7, 12].map((st, i) => tone(note(12 + st), "triangle", 0.5, 0.12, i * 0.12)) },
  /* added for the events the first cut left silent (audit C6) */
  landed: { layers: [tone(80, "sine", 0.18, 0.16, 0, 38), hit(0.14, 0.07, 380, 0.8, 120)] },
  scrape: { layers: [hit(0.28, 0.1, 2400, 2.2, 900), tone(330, "sawtooth", 0.18, 0.03, 0, 240)] },
  impact: { layers: [tone(120, "square", 0.26, 0.12, 0, 60), hit(0.24, 0.16, 900, 0.7, 160)] },
  overheat: { layers: [tone(520, "square", 0.12, 0.06), tone(390, "square", 0.16, 0.06, 0.14)] },
  trick: { layers: [tone(note(PENTA[6]!), "triangle", 0.12, 0.09, 0, note(PENTA[8]!))] },
  roll: { layers: [hit(0.24, 0.07, 800, 1.2, 2400), tone(note(PENTA[5]!), "sine", 0.14, 0.07, 0.04)] },
  hop: { layers: [tone(note(PENTA[3]!), "triangle", 0.1, 0.1), tone(note(PENTA[7]!), "triangle", 0.14, 0.1, 0.06)] },
  trailer: { layers: [tone(note(PENTA[2]!), "triangle", 0.12, 0.1), tone(note(PENTA[4]!), "triangle", 0.12, 0.1, 0.07), tone(note(PENTA[6]!), "triangle", 0.18, 0.1, 0.14)] },
  shortcut: { layers: [tone(note(PENTA[4]!), "sine", 0.12, 0.1), tone(note(PENTA[8]!), "sine", 0.22, 0.1, 0.08)] },
  nitro: { layers: [hit(0.4, 0.1, 600, 0.8, 2600)] },
  perfect: { layers: [hit(0.4, 0.1, 600, 0.8, 2600), tone(note(12 + PENTA[5]!), "triangle", 0.2, 0.11, 0.03), tone(note(12 + PENTA[7]!), "triangle", 0.26, 0.11, 0.1)] },
  shockwave: { layers: [tone(70, "sawtooth", 0.7, 0.16, 0, 30), hit(0.8, 0.16, 300, 0.6, 4200)] },
  miss: { layers: [tone(330, "triangle", 0.18, 0.1), tone(247, "triangle", 0.3, 0.1, 0.16)] },
  flare: { layers: [hit(0.3, 0.09, 260, 0.7, 1200)] }
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

  /** Once per rendered frame: state cues, the cues of every sim event since the last frame, and the engine voice. */
  update(frame: AudioFrame, events: readonly SimEvent[] = []): GameSound[] {
    const sounds = [...diffRunEvents(this.prev, frame), ...eventCues(events)];
    this.prev = frame;
    for (const e of sounds) this.play(e);
    const active = frame.phase === "running";
    this.setEngine(active ? frame.speed : 0, active && frame.throttle, frame.boosting || frame.nitro > 0);
    return sounds;
  }

  /**
   * Suspends the context while the tab is hidden or the run is paused (no engine drone, no music catch-up), and resumes it
   * when both clear. Resuming needs no gesture once the context has been unlocked.
   */
  setSuspended(suspended: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (suspended && ctx.state === "running") void ctx.suspend().catch(() => undefined);
    else if (!suspended && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
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
      if (ctx.state !== "running") return;
      const plan = musicSteps(this.nextAt, ctx.currentTime, eighth);
      this.nextAt = plan.nextAt;
      for (const at of plan.times) {
        const n = this.step;
        const bar = Math.floor(n / 8) % ROOTS.length;
        const beat = n % 8;
        if (beat === 0) {
          for (const tone of CHORD[bar]!) this.voice("triangle", note(ROOTS[bar]! + tone), at, 8 * eighth * 0.96, 0.028, 0.35);
          this.voice("sine", note(ROOTS[bar]! - 12), at, 3.6 * eighth, 0.08, 0.02);
          this.voice("sine", note(ROOTS[bar]! - 12), at + 4 * eighth, 3.6 * eighth, 0.07, 0.02);
        }
        this.voice("sine", note(ROOTS[bar]! + 12 + PENTA[ARP_STEPS[beat]! + 2]!), at, 1.2 * eighth, 0.034, 0.01);
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
