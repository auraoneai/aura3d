/**
 * Procedural game audio (Web Audio only, no sample files): sound effects for every simulation event, a wind bed, and a
 * small pentatonic score whose layers follow the active form and the run speed. The context is created lazily on the
 * first user gesture; with no `AudioContext` (tests, old browsers) every call is a no-op.
 */
import { AudioContextManager, createCueBank, type CueSpec, type ToneLayer } from "@aura3d/engine/audio";

export type Sfx =
  | "jump" | "land" | "slide" | "dash" | "orb" | "orbHit" | "gale" | "galeHit" | "clones" | "pickup" | "hurt" | "kill" | "heavyKill" | "crate" | "ramBump" | "ramCrash" | "crateSmash"
  | "unlock" | "form" | "win" | "lose" | "warn" | "step" | "click"
  | "chargeScout" | "chargeSwordsman" | "chargeCaster" | "chargeHeavy";

/** D minor pentatonic over three octaves, as MIDI notes. */
const SCALE = [50, 53, 55, 57, 60, 62, 65, 67, 69, 72, 74, 77] as const;
export const midiToHz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

/** Deterministic melody: the scale step for eighth-note `index` (random walk keyed on `index`, no state). */
export function melodyStep(index: number): number {
  let h = (index * 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  const walk = index % 16 < 8 ? 4 + (h % 4) : 5 + ((h >>> 3) % 5);
  return walk % SCALE.length;
}

const tl = (freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): ToneLayer => ({ freq, dur, type, gain, delay, attack: 0.012, ...(slideTo !== undefined ? { slideTo } : {}) });

/**
 * The sound effects that are pure oscillator tones play on the shared cue bank. The ones with a filtered-noise burst stay
 * in `GameAudio.play` (their burst starts at a random offset into the shared buffer), and so does `click`: it fires in the
 * same tick as the first unlock, and the bank drops cues until its context reports `running`.
 */
export const TONE_CUES = {
  pickup: { layers: ({ level }) => [tl(midiToHz(SCALE[4 + level]!), 0.22, "sine", 0.22), tl(midiToHz(SCALE[4 + level]!) * 2, 0.16, "triangle", 0.07)] },
  unlock: { layers: [0, 2, 4, 7].map((s, i) => tl(midiToHz(SCALE[4 + s % 8]!), 0.4, "triangle", 0.22, i * 0.1)) },
  win: { layers: [0, 2, 4, 5, 7, 9].map((s, i) => tl(midiToHz(SCALE[3 + s % 9]!), 0.55, "triangle", 0.24, i * 0.14)) },
  lose: { layers: [tl(220, 1.1, "triangle", 0.3, 0, 55), tl(165, 1.2, "sine", 0.28, 0.15, 40)] },
  warn: { layers: [tl(880, 0.1, "square", 0.1), tl(660, 0.12, "square", 0.1, 0.12)] }
} satisfies Record<string, CueSpec>;
type ToneCue = keyof typeof TONE_CUES;
const isToneCue = (name: Sfx): name is ToneCue & Sfx => name in TONE_CUES;

export interface MusicState { readonly form: string; readonly speed: number; readonly running: boolean }

export class GameAudio {
  private readonly manager = new AudioContextManager();
  private readonly bank = createCueBank({ cues: TONE_CUES, manager: this.manager, masterGain: 0.55, sfxGain: 0.9, muteKey: false });
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private windGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextBeat = 0;
  private beatIndex = 0;
  muted = false;
  private pickupRun = 0;
  private lastPickup = -10;

  get supported(): boolean { return typeof AudioContext !== "undefined"; }
  get active(): boolean { return this.ctx !== null; }
  /** True while the context is suspended (hidden tab or paused run); false while it runs; null before the first gesture. */
  get suspended(): boolean | null { return this.ctx ? this.ctx.state !== "running" : null; }
  private held = false;

  /** Hold the audio while the page is hidden or the run is paused: the wind bed and score stop until `release`. */
  suspend(): void {
    this.held = true;
    void this.ctx?.suspend();
  }

  /** Resume after `suspend` (call from Resume or a user gesture). */
  release(): void {
    if (!this.held) return;
    this.held = false;
    void this.ctx?.resume();
  }

  /** Create or resume the context; call from a user gesture. */
  unlock(): void {
    if (!this.supported || this.held) return;
    if (!this.ctx) this.build();
    void this.ctx?.resume();
  }

  private build(): void {
    const ctx = this.manager.context as unknown as AudioContext;
    this.ctx = ctx;
    this.bank.setMuted(this.muted);
    void this.bank.unlock();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = (seed / 4294967296) * 2 - 1; }
    this.noise = buffer;
    const wind = ctx.createBufferSource(); wind.buffer = buffer; wind.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 520; filter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    wind.connect(filter); filter.connect(this.windGain); this.windGain.connect(this.master);
    wind.start();
    this.nextBeat = ctx.currentTime + 0.1;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.bank.setMuted(muted);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.03);
  }
  toggleMute(): boolean { this.setMuted(!this.muted); return this.muted; }

  private tone(freq: number, duration: number, type: OscillatorType, volume: number, to?: number, delay = 0, bus?: GainNode | null): void {
    const ctx = this.ctx; const out = bus ?? this.sfxBus;
    if (!ctx || !out) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.012, duration / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + duration + 0.05);
  }

  private burst(duration: number, volume: number, from: number, to: number, q = 0.9, type: BiquadFilterType = "bandpass", delay = 0, bus?: GainNode | null): void {
    const ctx = this.ctx; const out = bus ?? this.sfxBus;
    if (!ctx || !out || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.01, duration / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random() * 1.5); src.stop(t + duration + 0.05);
  }

  play(name: Sfx, now = 0): void {
    if (!this.ctx || this.muted) return;
    if (isToneCue(name)) {
      if (name === "pickup") {
        this.pickupRun = now - this.lastPickup < 0.9 ? Math.min(this.pickupRun + 1, 7) : 0;
        this.lastPickup = now;
        this.bank.play("pickup", { level: this.pickupRun });
      } else this.bank.play(name);
      return;
    }
    switch (name) {
      case "jump": this.tone(260, 0.2, "triangle", 0.28, 620); this.burst(0.16, 0.12, 900, 2400); break;
      case "land": this.tone(110, 0.14, "sine", 0.4, 55); this.burst(0.12, 0.2, 700, 160, 0.7, "lowpass"); break;
      case "slide": this.burst(0.34, 0.2, 1800, 500, 1.2); break;
      case "dash": this.burst(0.42, 0.34, 400, 3200, 0.8); this.tone(180, 0.4, "sawtooth", 0.12, 540); break;
      case "orb": this.tone(220, 0.5, "sine", 0.22, 880); this.tone(330, 0.5, "triangle", 0.12, 1320); this.burst(0.45, 0.12, 600, 3600, 1.5); break;
      case "orbHit": this.tone(160, 0.3, "square", 0.22, 60); this.burst(0.3, 0.38, 3000, 400, 0.7); break;
      case "gale": this.burst(0.7, 0.3, 300, 4200, 0.7); this.tone(140, 0.7, "sawtooth", 0.16, 700); this.tone(280, 0.7, "sine", 0.18, 1400); break;
      case "galeHit": this.tone(90, 0.5, "sawtooth", 0.28, 40); this.burst(0.55, 0.5, 4200, 260, 0.6); break;
      case "clones": for (let i = 0; i < 3; i++) this.tone(midiToHz(SCALE[2 + i * 2]!), 0.28, "triangle", 0.18, undefined, i * 0.07); this.burst(0.3, 0.16, 2400, 900, 1.1); break;
      case "hurt": this.tone(190, 0.35, "sawtooth", 0.3, 70); this.burst(0.28, 0.4, 1500, 200, 0.8); break;
      case "kill": this.tone(150, 0.22, "square", 0.2, 70); this.burst(0.2, 0.4, 2600, 500, 0.9); break;
      case "heavyKill": this.tone(80, 0.5, "sine", 0.5, 38); this.burst(0.45, 0.5, 1800, 120, 0.7); this.tone(220, 0.18, "square", 0.14, 90); break;
      case "crate": this.burst(0.3, 0.45, 900, 180, 0.6); this.tone(120, 0.18, "square", 0.2, 60); break;
      case "ramBump": this.tone(95, 0.22, "sine", 0.5, 45); this.burst(0.18, 0.5, 1200, 200, 0.6, "lowpass"); this.tone(180, 0.1, "square", 0.18, 90); break;
      case "ramCrash": this.tone(70, 0.45, "sine", 0.6, 32); this.burst(0.5, 0.6, 2200, 140, 0.7); this.tone(150, 0.25, "sawtooth", 0.22, 50); this.burst(0.22, 0.35, 3600, 500, 0.8); break;
      case "crateSmash": this.burst(0.45, 0.55, 3200, 300, 0.7); this.tone(130, 0.2, "square", 0.22, 55); this.tone(520, 0.08, "triangle", 0.1, 220); break;
      case "form": this.tone(200, 0.7, "sawtooth", 0.14, 800); this.tone(400, 0.7, "sine", 0.2, 1600); this.burst(0.6, 0.18, 500, 5000, 1); break;
      case "step": this.burst(0.05, 0.07, 500, 220, 0.8, "lowpass"); break;
      case "click": this.tone(520, 0.07, "triangle", 0.18); break;
      /* enemy charges: a short tell per kind when a rival starts running at the hero, so a threat is heard before it lands */
      case "chargeScout": this.tone(1240, 0.12, "triangle", 0.12, 1760); break;
      case "chargeSwordsman": this.burst(0.22, 0.16, 2600, 5200, 2.4, "bandpass"); this.tone(700, 0.18, "sawtooth", 0.06, 1100); break;
      case "chargeCaster": this.tone(330, 0.32, "sine", 0.14, 660); this.burst(0.3, 0.1, 800, 2400, 1.2); break;
      case "chargeHeavy": this.tone(70, 0.4, "sine", 0.32, 48); this.burst(0.36, 0.18, 400, 120, 0.7, "lowpass"); break;
    }
  }

  /** Advance the wind bed and score; call every frame with the current run state. */
  update(state: MusicState): void {
    const ctx = this.ctx;
    if (!ctx || !this.windGain || !this.musicBus) return;
    const speed = Math.max(0, Math.min(1, (state.speed - 12) / 14));
    this.windGain.gain.setTargetAtTime(state.running && !this.muted ? 0.05 + speed * 0.16 : 0.02, ctx.currentTime, 0.2);
    this.musicBus.gain.setTargetAtTime(state.running ? 0.34 : 0.16, ctx.currentTime, 0.4);
    const beat = 60 / (92 + speed * 18);
    if (!state.running) { this.nextBeat = Math.max(this.nextBeat, ctx.currentTime + 0.05); return; }
    while (this.nextBeat < ctx.currentTime + 0.18) {
      const t = this.nextBeat - ctx.currentTime;
      const i = this.beatIndex++;
      const bar = i % 8;
      const bus = this.musicBus;
      if (bar % 4 === 0) this.tone(95, 0.24, "sine", 0.55, 42, Math.max(0, t), bus);
      if (bar === 2 || bar === 6) this.burst(0.1, 0.12, 5000, 3000, 2, "highpass", Math.max(0, t), bus);
      if (bar % 2 === 1) this.burst(0.05, 0.06, 7000, 6000, 3, "highpass", Math.max(0, t), bus);
      if (bar % 4 === 0) this.tone(midiToHz(SCALE[bar === 4 ? 2 : 0]! - 12), beat * 1.9, "triangle", 0.3, undefined, Math.max(0, t), bus);
      if (state.form !== "base" || i % 3 === 0) {
        const step = melodyStep(i);
        this.tone(midiToHz(SCALE[step]!), beat * 0.9, "triangle", 0.16, undefined, Math.max(0, t), bus);
        if (state.form === "beast") this.tone(midiToHz(SCALE[step]!) * 2, beat * 0.6, "sine", 0.07, undefined, Math.max(0, t), bus);
      }
      this.nextBeat += beat / 2;
    }
  }

  dispose(): void {
    this.bank.dispose();
    this.ctx = null; this.master = null; this.sfxBus = null; this.musicBus = null; this.windGain = null; this.noise = null;
  }
}
