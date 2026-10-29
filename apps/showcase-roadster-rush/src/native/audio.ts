import { AudioContextManager } from "@aura3d/engine/audio";
import type { GameAudio } from "./game";

interface Tone {
  freq: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
  delay?: number;
}

const MUSIC_STEP_SECONDS = 0.2;
const ARP: Readonly<Record<"title" | "run" | "rocket", readonly number[]>> = {
  title: [0, 7, 12, 7, 3, 10, 15, 10],
  run: [0, 3, 7, 10, 12, 10, 7, 3, 0, 5, 8, 12, 15, 12, 8, 5],
  rocket: [0, 12, 7, 19, 0, 12, 10, 22]
};
const BASE_HZ = 110;
const noteHz = (semis: number): number => BASE_HZ * Math.pow(2, semis / 12);

/** Synthesised sound for Apex Overdrive on the shared AudioContextManager: every effect and the music bed is generated here, nothing is sampled or loaded. */
export class RoadsterAudio implements GameAudio {
  private manager: AudioContextManager | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private muted = false;
  private musicKind: "title" | "run" | "rocket" | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private noiseBuffer: AudioBuffer | null = null;
  private backgrounded = false;

  setMuted(muted: boolean): boolean {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.7;
    return muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Resume the context. Browsers allow this only inside a user gesture, so the page calls it from its input listeners. */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx || this.backgrounded) return;
    void this.manager?.unlock().catch(() => undefined);
  }

  /** `running` once a gesture has unlocked sound; `locked` or `suspended` otherwise; `none` without Web Audio. */
  get state(): string {
    return this.manager?.state ?? "none";
  }

  /** Suspend the whole context while the tab is hidden (music, engine drone and effects stop); resume when it is shown. */
  setBackgrounded(hidden: boolean): void {
    this.backgrounded = hidden;
    if (!this.manager) return;
    if (hidden) void this.manager.suspend().catch(() => undefined);
    else if (this.manager.state === "suspended") void this.manager.resume().catch(() => undefined);
  }

  sfx(name: string, options: { pitch?: number; volume?: number } = {}): void {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const v = options.volume ?? 1;
    const pitch = options.pitch ?? 1;
    switch (name) {
      case "ui":
        this.tone({ freq: 520, dur: 0.08, type: "triangle", gain: 0.12 * v });
        break;
      case "hop":
        this.tone({ freq: 220, slideTo: 440, dur: 0.14, type: "triangle", gain: 0.16 * v });
        break;
      case "thrust":
        this.noise({ dur: 0.22, gain: 0.07 * v, freq: 900, slideTo: 1600 });
        break;
      case "roll":
        this.tone({ freq: 300, slideTo: 760, dur: 0.3, type: "sawtooth", gain: 0.09 * v });
        this.noise({ dur: 0.28, gain: 0.05 * v, freq: 1400 });
        break;
      case "land":
        this.tone({ freq: 90, slideTo: 50, dur: 0.18, type: "sine", gain: 0.3 * v });
        break;
      case "boost":
        this.tone({ freq: 180, slideTo: 620, dur: 0.4, type: "sawtooth", gain: 0.1 * v });
        this.noise({ dur: 0.4, gain: 0.07 * v, freq: 700, slideTo: 2200 });
        break;
      case "scrape":
        this.noise({ dur: 0.3, gain: 0.16 * v, freq: 2600, q: 4 });
        break;
      case "crash":
        this.noise({ dur: 0.7, gain: 0.35 * v, freq: 400, slideTo: 90 });
        this.tone({ freq: 110, slideTo: 40, dur: 0.6, type: "square", gain: 0.2 * v });
        break;
      case "nearMiss":
        this.noise({ dur: 0.16, gain: 0.1 * v, freq: 3000, slideTo: 800 });
        break;
      case "bolt":
        this.tone({ freq: 880 * pitch, dur: 0.07, type: "square", gain: 0.07 * v });
        this.tone({ freq: 1320 * pitch, dur: 0.09, type: "square", gain: 0.05 * v, delay: 0.05 });
        break;
      case "air":
        this.tone({ freq: 440, slideTo: 880, dur: 0.22, type: "sine", gain: 0.14 * v });
        break;
      case "powerup":
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.12, type: "triangle", gain: 0.12 * v, delay: i * 0.06 }));
        break;
      case "whoosh":
        this.noise({ dur: 0.35, gain: 0.08 * v, freq: 500, slideTo: 2400 });
        break;
      case "honk":
        this.tone({ freq: 392, dur: 0.22, type: "square", gain: 0.07 * v });
        this.tone({ freq: 494, dur: 0.22, type: "square", gain: 0.06 * v });
        break;
    }
  }

  /** Short vocal-style stinger (no speech is shipped); only the stronger cues are voiced. */
  say(name: string, options: { force?: boolean | string } = {}): void {
    if (!options.force || this.muted) return;
    const cue: Record<string, number[]> = { start: [392, 523, 659], crash: [330, 247, 196], roll: [494, 622], combo: [523, 659, 784, 988], airLow: [330, 262], milestone: [523, 784], sky: [659, 880], closeCall: [740] };
    (cue[name] ?? []).forEach((f, i) => this.tone({ freq: f, dur: 0.1, type: "triangle", gain: 0.08, delay: i * 0.08 }));
  }

  setEngine(speed01: number, thrust: number, boosting: boolean): void {
    const ctx = this.ensure();
    if (!ctx || !this.engineOsc || !this.engineGain) return;
    const t = ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 90 + (boosting ? 40 : 0), t, 0.08);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.035 + thrust * 0.03 + speed01 * 0.02, t, 0.1);
  }

  quiet(): void {
    if (this.engineGain && this.manager) this.engineGain.gain.setTargetAtTime(0, this.manager.context.currentTime, 0.05);
  }

  music(kind: "title" | "run" | "rocket" | null): void {
    if (kind === this.musicKind) return;
    this.musicKind = kind;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (!kind) return;
    this.ensure();
    this.musicStep = 0;
    this.musicTimer = setInterval(() => this.musicTick(), MUSIC_STEP_SECONDS * 1000);
  }

  private musicTick(): void {
    const kind = this.musicKind;
    if (!kind || this.muted || !this.manager || this.manager.state !== "running") return;
    const pattern = ARP[kind];
    const step = this.musicStep++;
    const semis = pattern[step % pattern.length]!;
    this.tone({ freq: noteHz(semis + 24), dur: 0.16, type: "triangle", gain: kind === "title" ? 0.035 : 0.045 });
    if (step % 4 === 0) this.tone({ freq: noteHz(semis % 12 === 0 ? 0 : semis - 12), dur: 0.36, type: "sine", gain: 0.07 });
    if (kind !== "title" && step % 2 === 1) this.noise({ dur: 0.04, gain: 0.025, freq: 6000, q: 1 });
  }

  private ensure(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (!this.manager) {
      this.manager = new AudioContextManager();
      const ctx = this.manager.context as unknown as AudioContext;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(ctx.destination);
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 60;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 420;
      this.engineOsc.connect(lowpass);
      lowpass.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    return this.manager.context as unknown as AudioContext;
  }

  private tone(spec: Tone): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const start = ctx.currentTime + (spec.delay ?? 0);
    const dur = spec.dur ?? 0.15;
    const osc = ctx.createOscillator();
    osc.type = spec.type ?? "sine";
    osc.frequency.setValueAtTime(spec.freq, start);
    if (spec.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.slideTo), start + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, spec.gain ?? 0.1), start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private noise(spec: { dur?: number; gain?: number; freq?: number; slideTo?: number; q?: number }): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (!this.noiseBuffer) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = (seed / 4294967296) * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    const start = ctx.currentTime;
    const dur = spec.dur ?? 0.2;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = spec.q ?? 1.2;
    filter.frequency.setValueAtTime(spec.freq ?? 1000, start);
    if (spec.slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, spec.slideTo), start + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(spec.gain ?? 0.1, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(start);
    src.stop(start + dur + 0.02);
  }
}
