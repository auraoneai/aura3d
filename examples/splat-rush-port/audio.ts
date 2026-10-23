/**
 * Splat Rush audio: a small synth built on the shared `AudioContextManager` (the repo allows exactly one owner of an
 * AudioContext). Everything is generated here: a bright 132 BPM arpeggio with a sine bass line, and one short effect per
 * game event. Nothing is sampled, no asset is loaded, and `Math.random` is never touched (the simulation's random
 * stream must stay in lock-step with the recorded reference), so the noise buffer uses its own LCG.
 *
 * Effects are triggered from state changes the renderer observes (`SoundEvents.diff`), never from the simulation.
 */
import { AudioContextManager } from "@aura3d/engine/audio";

const BASE_HZ = 523.25; // C5
const note = (semitones: number): number => BASE_HZ * Math.pow(2, semitones / 12);

/** Arpeggio (semitones above C5) and bass (below), one arpeggio step per eighth note. */
const ARP = [0, 7, 4, 9, 7, 12, 9, 4, 2, 9, 7, 11, 9, 5, 4, 0];
const BASS = [-12, -5, -7, -10];
/** Pentatonic ladder used for the gate-match pitch (climbs with the combo). */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

interface ToneSpec { freq: number; type?: OscillatorType; dur?: number; gain?: number; slideTo?: number; delay?: number }
interface NoiseSpec { dur?: number; gain?: number; freq?: number; q?: number; type?: BiquadFilterType; slideTo?: number }

export interface FrameState {
  phase: string;
  lives: number;
  combo: number;
  multiplier: number;
  score: number;
  shieldActive: boolean;
  rainbowTimer: number;
  scoreX2Timer: number;
  playerColorIndex: number;
  perfect: boolean;
}

export type GameSound = "match" | "perfect" | "hit" | "block" | "pickup" | "switch" | "burst" | "gameover" | "start";

/** Derives sound events from consecutive simulation states (pure: unit tested). */
export function diffSounds(prev: FrameState | null, next: FrameState): { sound: GameSound; level: number }[] {
  const out: { sound: GameSound; level: number }[] = [];
  if (!prev) return out;
  if (prev.phase === "splash" && next.phase === "playing") out.push({ sound: "start", level: 0 });
  if (next.phase === "bursting" && prev.phase !== "bursting") out.push({ sound: "burst", level: 0 });
  if (next.phase === "gameOver" && prev.phase !== "gameOver") out.push({ sound: "gameover", level: 0 });
  if (next.phase !== "playing" && next.phase !== "bursting") return out;
  if (next.lives < prev.lives) out.push({ sound: "hit", level: 0 });
  else if (prev.shieldActive && !next.shieldActive) out.push({ sound: "block", level: 0 });
  else if (next.combo > prev.combo) out.push({ sound: next.perfect ? "perfect" : "match", level: next.combo });
  const gainedPickup =
    (next.rainbowTimer > 0 && prev.rainbowTimer <= 0) || (next.shieldActive && !prev.shieldActive) || (next.scoreX2Timer > 0 && prev.scoreX2Timer <= 0);
  if (gainedPickup) out.push({ sound: "pickup", level: 0 });
  else if (next.playerColorIndex !== prev.playerColorIndex && next.combo >= prev.combo && next.lives === prev.lives) out.push({ sound: "switch", level: 0 });
  return out;
}

export class SplatSound {
  private readonly manager = new AudioContextManager();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextAt = 0;
  private lcg = 0x2f6e2b1;
  muted = false;

  /** Must be called from a user gesture (first pointer/key). Safe to call repeatedly. */
  async unlock(): Promise<void> {
    try {
      if (!this.ctx) {
        this.ctx = this.manager.context as unknown as AudioContext;
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
        this.music = this.ctx.createGain();
        this.music.gain.value = 0.0001;
        this.music.connect(this.master);
        this.sfx = this.ctx.createGain();
        this.sfx.gain.value = 0.9;
        this.sfx.connect(this.master);
      }
      await this.manager.unlock();
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /** Music is loudest while playing and dips on the splash and game-over cards. */
  setIntensity(level: "title" | "play" | "over"): void {
    if (!this.music || !this.ctx) return;
    const target = level === "play" ? 0.1 : level === "title" ? 0.045 : 0.02;
    this.music.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  play(sound: GameSound, level = 0): void {
    if (!this.ctx || !this.sfx || this.muted || this.ctx.state !== "running") return;
    switch (sound) {
      case "match": {
        const f = note(LADDER[Math.min(LADDER.length - 1, Math.max(0, level))] as number);
        this.tone({ freq: f, type: "triangle", dur: 0.16, gain: 0.2, slideTo: f * 1.5 });
        break;
      }
      case "perfect": {
        const f = note(LADDER[Math.min(LADDER.length - 1, Math.max(0, level))] as number);
        this.tone({ freq: f, type: "triangle", dur: 0.18, gain: 0.2, slideTo: f * 1.5 });
        this.tone({ freq: f * 2, type: "sine", dur: 0.24, gain: 0.15, delay: 0.02, slideTo: f * 3 });
        this.noiseHit({ dur: 0.18, gain: 0.06, freq: 4200, type: "highpass", slideTo: 9000 });
        break;
      }
      case "hit":
        this.tone({ freq: 190, type: "sawtooth", dur: 0.32, gain: 0.2, slideTo: 55 });
        this.noiseHit({ dur: 0.26, gain: 0.11, freq: 430, q: 0.7, slideTo: 110 });
        break;
      case "block":
        this.tone({ freq: 420, type: "square", dur: 0.16, gain: 0.12, slideTo: 760 });
        this.noiseHit({ dur: 0.2, gain: 0.08, freq: 2300, q: 3 });
        break;
      case "pickup":
        this.tone({ freq: 620, type: "sine", dur: 0.22, gain: 0.17, slideTo: 1320 });
        this.tone({ freq: 930, type: "triangle", dur: 0.25, gain: 0.11, delay: 0.05, slideTo: 1850 });
        break;
      case "switch":
        this.tone({ freq: 330, type: "square", dur: 0.14, gain: 0.1, slideTo: 660 });
        this.tone({ freq: 495, type: "sine", dur: 0.2, gain: 0.12, delay: 0.06, slideTo: 990 });
        break;
      case "burst":
        this.tone({ freq: 250, type: "sawtooth", dur: 0.5, gain: 0.24, slideTo: 40 });
        this.noiseHit({ dur: 0.55, gain: 0.2, freq: 900, q: 0.6, slideTo: 80 });
        this.tone({ freq: 120, type: "sine", dur: 0.6, gain: 0.18, slideTo: 30, delay: 0.02 });
        break;
      case "gameover":
        this.tone({ freq: note(0), type: "triangle", dur: 0.28, gain: 0.14, slideTo: note(-3) });
        this.tone({ freq: note(-5), type: "triangle", dur: 0.5, gain: 0.14, delay: 0.22, slideTo: note(-12) });
        break;
      case "start":
        this.tone({ freq: note(0), type: "triangle", dur: 0.12, gain: 0.14 });
        this.tone({ freq: note(7), type: "triangle", dur: 0.12, gain: 0.14, delay: 0.09 });
        this.tone({ freq: note(12), type: "sine", dur: 0.28, gain: 0.16, delay: 0.18, slideTo: note(19) });
        break;
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.manager.dispose();
    this.ctx = null;
  }

  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.music || this.timer) return;
    const eighth = 60 / 132 / 2;
    this.step = 0;
    this.nextAt = ctx.currentTime + 0.1;
    this.setIntensity("title");
    this.timer = setInterval(() => {
      while (this.nextAt < ctx.currentTime + 0.2) {
        const at = this.nextAt;
        const n = this.step;
        this.voice("triangle", note(ARP[n % ARP.length] as number), at, 0.9 * eighth, 0.06);
        if (n % 2 === 0) this.voice("sine", note(BASS[(n / 2) % BASS.length] as number), at, 1.8 * eighth, 0.09);
        this.nextAt += eighth;
        this.step++;
      }
    }, 40);
  }

  private voice(type: OscillatorType, freq: number, at: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
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

  private noiseHit(spec: NoiseSpec): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const { dur = 0.2, gain = 0.15, freq = 1200, q = 1, type = "bandpass", slideTo } = spec;
    if (!this.noise) {
      const len = Math.floor(0.4 * ctx.sampleRate);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        this.lcg = (Math.imul(this.lcg, 1664525) + 1013904223) >>> 0;
        data[i] = this.lcg / 0x80000000 - 1;
      }
      this.noise = buffer;
    }
    const at = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
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
