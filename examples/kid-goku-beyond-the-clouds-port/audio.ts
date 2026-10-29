/**
 * Procedural audio for the Cloud Runner (Web Audio, synthesised from scratch: no samples, nothing to license):
 * a warm looping ridge theme, wind that follows the run speed, footsteps, and a sound for every game event.
 */
import { AudioContextManager, createCueBank, type CueSpec, type ToneLayer } from "@aura3d/engine/audio";

type Ctx = AudioContext;

const tl = (freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): ToneLayer => ({ freq, dur, type, gain, delay, attack: 0.012, ...(slideTo ? { slideTo } : {}) });
const run = (freqs: readonly number[], dur: number, type: OscillatorType, gain: number, stepDelay: number): ToneLayer[] => freqs.map((f, i) => tl(f, dur, type, gain, i * stepDelay));
const blip = (layers: readonly ToneLayer[]): CueSpec => ({ layers });

/**
 * The events that are pure oscillator tones play on the shared cue bank. The events that use filtered noise stay in
 * `GameAudio.event`: their noise comes from a looping 2 s buffer started at a random offset with a 10 ms attack, which the
 * bank's one-shot noise layer does not reproduce. `ui` stays there too: it fires in the same tick as the first unlock, and
 * the bank drops cues until its context reports `running`.
 */
export const TONE_CUES = {
  jump: blip([tl(300, 0.16, "triangle", 0.16, 0, 640)]),
  skypearl: blip(run([523, 659, 784, 1047, 1319], 0.45, "triangle", 0.16, 0.07)),
  checkpoint: blip(run([660, 880, 1100], 0.4, "sine", 0.12, 0.09)),
  perfect: blip(run([784, 988, 1175, 1568], 0.5, "triangle", 0.15, 0.06)),
  jan: blip([tl(330, 0.14, "square", 0.1)]),
  ken: blip([tl(392, 0.14, "square", 0.1)]),
  rps: blip([tl(523, 0.22, "square", 0.12)]),
  dodge: blip([tl(660, 0.12, "triangle", 0.1, 0, 990)]),
  "fall-start": blip([tl(900, 0.9, "sine", 0.18, 0, 160)]),
  respawn: blip([tl(300, 0.3, "triangle", 0.12, 0, 600)]),
  "glider-ready": blip(run([880, 1175], 0.3, "sine", 0.1, 0.1)),
  "glider-end": blip([tl(900, 0.3, "sine", 0.1, 0, 400)]),
  "glider-empty": blip([tl(200, 0.12, "square", 0.08)]),
  finish: blip(run([523, 659, 784, 1047, 1319, 1568], 0.9, "triangle", 0.14, 0.14)),
  dead: blip(run([392, 330, 262, 196], 0.5, "triangle", 0.16, 0.16)),
  screech: blip([tl(1500, 0.5, "sawtooth", 0.1, 0, 3100), tl(1100, 0.5, "square", 0.05, 0.02, 2400)]),
  orb: { layers: ({ level }) => [tl(660, 0.18, "sine", 0.13), tl(1320, 0.12, "sine", 0.05, 0.02), ...(level % 5 === 0 ? [tl(990, 0.2, "sine", 0.06, 0.05)] : [])] } satisfies CueSpec
} satisfies Record<string, CueSpec>;
export type ToneCue = keyof typeof TONE_CUES;

/** Event name -> the cue that plays it. */
export const TONE_EVENTS: Readonly<Record<string, ToneCue>> = {
  jump: "jump", orb: "orb", skypearl: "skypearl", checkpoint: "checkpoint", perfect: "perfect", jan: "jan", ken: "ken",
  guu: "rps", paa: "rps", choki: "rps", dodge: "dodge", "close-call": "dodge", "fall-start": "fall-start", respawn: "respawn",
  "glider-ready": "glider-ready", "glider-end": "glider-end", "glider-empty": "glider-empty", "glider-wait": "glider-empty",
  finish: "finish", dead: "dead", screech: "screech"
};

export class GameAudio {
  enabled = true;
  private readonly manager = new AudioContextManager();
  private readonly bank = createCueBank({ cues: TONE_CUES, manager: this.manager, masterGain: 0.8, sfxGain: 0.7, muteKey: false });
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private wind!: GainNode;
  private windFilter!: BiquadFilterNode;
  private noiseBuf!: AudioBuffer;
  private nextBeat = 0;
  private beat = 0;
  private musicOn = false;
  private orbPitch = 0;

  /** Must be called from a user gesture (key or click) the first time. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === "suspended") void this.ctx.resume(); return; }
    if (typeof AudioContext === "undefined") return;
    const ctx = this.manager.context as unknown as AudioContext;
    this.ctx = ctx;
    this.bank.setMuted(!this.enabled);
    void this.bank.unlock();
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.8 : 0; this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.32; this.musicGain.connect(this.master);
    this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = 0.7; this.sfxGain.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = "bandpass"; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    src.connect(this.windFilter).connect(this.wind).connect(this.master); src.start();
    this.nextBeat = ctx.currentTime + 0.1;
  }
  setEnabled(on: boolean): void { this.enabled = on; this.bank.setMuted(!on); if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05); }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number, dest?: AudioNode): void {
    const ctx = this.ctx; if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfxGain); o.start(t); o.stop(t + dur + 0.05);
  }
  private noise(dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType = "lowpass", when = 0): void {
    const ctx = this.ctx; if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxGain); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  /** One short sound per event name raised by the game layer. */
  event(name: string, count = 0): void {
    if (!this.ctx || !this.enabled) return;
    const cue = TONE_EVENTS[name];
    if (cue) {
      if (cue === "orb") {
        const n = [0, 2, 4, 7, 9][this.orbPitch++ % 5]!;
        this.bank.play("orb", { pitch: Math.pow(2, n / 12), level: count });
      } else this.bank.play(cue);
      return;
    }
    switch (name) {
      /* one per visible foot touchdown (world.ts counts them from the gait), not per 2.4 m of distance */
      case "footstep": this.noise(0.05, 0.1, 1400, 500, "bandpass"); break;
      case "land": this.noise(0.14, 0.3, 700, 120); this.tone(110, 0.12, "sine", 0.25, 0, 60); break;
      case "dismount": this.noise(0.25, 0.3, 900, 150); this.tone(220, 0.2, "triangle", 0.18, 0, 500); break;
      case "splash": this.noise(0.3, 0.3, 4200, 900, "bandpass"); break;
      case "meat": this.noise(0.1, 0.25, 1500, 400, "bandpass"); this.noise(0.1, 0.25, 1200, 300, "bandpass", 0.12); this.tone(520, 0.2, "triangle", 0.1, 0.22, 780); break;
      case "extend": this.tone(180, 0.25, "square", 0.08, 0, 760); this.noise(0.2, 0.12, 2200, 600, "highpass"); break;
      case "launch": case "power-launch": this.tone(260, 0.4, "triangle", 0.18, 0, 980); this.noise(0.35, 0.18, 1800, 3500, "bandpass"); break;
      case "vault": case "air-step": case "wall-kick": case "pole-kick": this.tone(240, 0.18, "triangle", 0.14, 0, 560); this.noise(0.12, 0.12, 2400, 800, "highpass"); break;
      case "strike": this.noise(0.14, 0.3, 3500, 500, "bandpass"); this.tone(180, 0.1, "square", 0.1, 0, 90); break;
      case "strike-hit": this.tone(140, 0.2, "sine", 0.3, 0, 60); this.noise(0.2, 0.3, 1800, 200); this.tone(900, 0.18, "triangle", 0.12, 0.05); break;
      case "duel-won": [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, "triangle", 0.16, i * 0.05)); this.noise(0.5, 0.3, 4500, 400, "bandpass"); break;
      case "hit": case "boulder-hit": case "trex-bite": case "trex-swipe": case "ptera-grab": this.tone(110, 0.3, "sawtooth", 0.25, 0, 45); this.noise(0.3, 0.35, 900, 120); break;
      case "rumble": this.noise(1.2, 0.4, 160, 60); this.tone(48, 1.2, "sine", 0.3, 0, 38); break;
      case "boulder": this.noise(0.6, 0.3, 200, 80); break;
      case "glider-call": case "glider-mount": this.tone(400, 0.5, "sine", 0.14, 0, 1200); this.noise(0.5, 0.12, 2000, 6000, "bandpass"); break;
      case "glider-knocked": this.tone(500, 0.4, "sawtooth", 0.18, 0, 120); this.noise(0.3, 0.3, 1500, 200); break;
      case "ui": this.tone(660, 0.08, "triangle", 0.1); break;
      default: break;
    }
  }

  /** Per-frame: schedule the theme and set the wind from speed (footsteps arrive as "footstep" events). */
  update(opts: { running: boolean; speed: number; s: number; grounded: boolean; playing: boolean; menu: boolean }): void {
    const ctx = this.ctx; if (!ctx || !this.enabled) return;
    const now = ctx.currentTime;
    this.wind.gain.setTargetAtTime(opts.running ? Math.min(0.2, 0.02 + opts.speed * 0.006) : 0.03, now, 0.2);
    this.windFilter.frequency.setTargetAtTime(380 + opts.speed * 30, now, 0.3);
    this.musicOn = opts.playing || opts.menu;
    if (!this.musicOn) return;
    const bpm = opts.playing ? 112 + Math.min(14, opts.speed) : 84, dur = 60 / bpm / 2;
    while (this.nextBeat < now + 0.25) {
      const b = this.beat++, t = this.nextBeat - now;
      const prog = [0, 5, 3, 4][Math.floor(b / 16) % 4]!;
      const scale = [0, 2, 4, 7, 9, 12, 14, 16];
      const root = 196 * Math.pow(2, prog / 12);
      if (b % 2 === 0) { const n = scale[(b * 3 + Math.floor(b / 8)) % scale.length]!; this.tone(root * 2 * Math.pow(2, n / 12), dur * 1.6, "triangle", 0.09, t, undefined, this.musicGain); }
      if (b % 8 === 0) { this.tone(root, dur * 8, "sine", 0.1, t, undefined, this.musicGain); this.tone(root * 1.5, dur * 8, "sine", 0.05, t, undefined, this.musicGain); }
      if (opts.playing && b % 4 === 0) this.tone(95, 0.12, "sine", 0.16, t, 55, this.musicGain);
      if (opts.playing && b % 4 === 2) this.noise(0.04, 0.05, 6000, 3000, "highpass", t);
      this.nextBeat += dur;
    }
  }
}
