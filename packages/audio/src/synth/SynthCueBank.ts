import { AudioContextManager } from "../AudioContextManager";
import { createNoiseSource } from "./notes";
import type { CueLayer, CuePlayParams, CueSpec, NoiseLayer, SynthBus, SynthContext, SynthFilter, SynthVoice, ToneLayer } from "./types";

export interface SynthCueBankOptions<K extends string = string> {
  readonly cues: Readonly<Record<K, CueSpec>>;
  /** The single `AudioContextManager` that owns the page's context. Default: a new manager (the kit never constructs a context itself). */
  readonly manager?: AudioContextManager;
  /** Inject a context directly (tests, offline rendering). */
  readonly context?: SynthContext;
  /** Master level when not muted. Default 0.9. */
  readonly masterGain?: number;
  readonly sfxGain?: number;
  /** Music bus level before `setMusicLevel` is called. Default 0.0001 (silent). */
  readonly musicGain?: number;
  readonly muted?: boolean;
  /** `KeyboardEvent.code` that toggles mute when `install()` is used. `false` disables. Default `"KeyM"`. */
  readonly muteKey?: string | false;
  /** Layers that may sound at once. Cues with `priority > 0` may use 1.5x. Default 24. */
  readonly maxVoices?: number;
  /** Noise generator seed (an LCG: `Math.random` is never used). */
  readonly noiseSeed?: number;
  /** Millisecond clock for cooldowns. Default `performance.now`/`Date.now`. */
  readonly now?: () => number;
}

export interface InstallOptions {
  /** Events that count as the first user gesture. Default pointerdown, keydown, touchstart. */
  readonly unlockEvents?: readonly string[];
  /** Called after every mute toggle made by the key binding. */
  readonly onMuteChange?: (muted: boolean) => void;
}

interface EventTargetLike {
  addEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
  removeEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
}

const isNoise = (layer: CueLayer): layer is NoiseLayer => layer.kind === "noise";
const MIN_GAIN = 0.0001;

/**
 * A bank of procedurally synthesised sound cues on top of the page's one `AudioContextManager`.
 *
 * Nothing is sampled and no asset is loaded: a cue is a list of oscillator and filtered-noise layers with exponential
 * envelopes and pitch glides. The bank adds what every game ended up hand-rolling: unlock on the first user gesture,
 * a master mute (with a key binding), SFX and music buses, a voice budget with priorities, per-cue cooldown and
 * concurrency limits, and music ducking.
 */
export class SynthCueBank<K extends string = string> {
  readonly manager: AudioContextManager;
  private readonly injected: SynthContext | undefined;
  private readonly cues: Readonly<Record<string, CueSpec>>;
  private readonly masterLevel: number;
  private readonly maxVoices: number;
  private readonly muteKey: string | false;
  private readonly now: () => number;
  private readonly noise: () => number;
  private ctx: SynthContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicLevel: number;
  private mutedValue: boolean;
  private readonly sfxLevel: number;
  private readonly voiceEnds: number[] = [];
  private readonly cueEnds = new Map<string, number[]>();
  private readonly lastPlayed = new Map<string, number>();
  private readonly disposers: Array<() => void> = [];

  constructor(options: SynthCueBankOptions<K>) {
    this.injected = options.context;
    this.manager = options.manager ?? new AudioContextManager(options.context ? { context: options.context } : {});
    this.cues = options.cues;
    this.masterLevel = options.masterGain ?? 0.9;
    this.sfxLevel = options.sfxGain ?? 0.9;
    this.musicLevel = options.musicGain ?? MIN_GAIN;
    this.maxVoices = options.maxVoices ?? 24;
    this.muteKey = options.muteKey === undefined ? "KeyM" : options.muteKey;
    this.mutedValue = options.muted ?? false;
    this.now = options.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.noise = createNoiseSource(options.noiseSeed);
  }

  get muted(): boolean {
    return this.mutedValue;
  }

  /** True once the context exists and is running. */
  get running(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** The audio graph's context after `unlock()`, else null. */
  get context(): SynthContext | null {
    return this.ctx;
  }

  /** The music bus: connect a sequencer or loop here (the helpers in this kit do it for you). */
  get musicDestination(): GainNode | null {
    return this.musicBus;
  }

  get sfxDestination(): GainNode | null {
    return this.sfxBus;
  }

  /** Create the graph and resume the context. Call from a user gesture; safe to call repeatedly. */
  async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const ctx = (this.injected ?? this.manager.context) as SynthContext;
        const master = ctx.createGain();
        master.gain.value = this.mutedValue ? 0 : this.masterLevel;
        master.connect(ctx.destination);
        const music = ctx.createGain();
        music.gain.value = Math.max(MIN_GAIN, this.musicLevel);
        music.connect(master);
        const sfx = ctx.createGain();
        sfx.gain.value = this.sfxLevel;
        sfx.connect(master);
        this.ctx = ctx;
        this.master = master;
        this.musicBus = music;
        this.sfxBus = sfx;
      }
      await this.manager.unlock();
      return true;
    } catch {
      this.ctx = null;
      this.master = null;
      this.musicBus = null;
      this.sfxBus = null;
      return false;
    }
  }

  /**
   * Wire the first-gesture unlock and the mute key onto `target` (default `globalThis`). Returns a function that
   * removes every listener. Repeated mute key presses (`event.repeat`), modified presses and presses inside form
   * fields are ignored.
   */
  install(target?: EventTargetLike, options: InstallOptions = {}): () => void {
    const host = target ?? ((globalThis as unknown as EventTargetLike).addEventListener ? (globalThis as unknown as EventTargetLike) : undefined);
    if (!host) return () => undefined;
    const events = options.unlockEvents ?? ["pointerdown", "keydown", "touchstart"];
    const unlockOnce = (): void => {
      void this.unlock();
    };
    for (const type of events) host.addEventListener(type, unlockOnce, { passive: true });
    const onKey = (event: { code?: string; repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: { tagName?: string } | null }): void => {
      if (this.muteKey === false || event.code !== this.muteKey || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = event.target?.tagName?.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Toggle first: `options.onMuteChange?.(this.toggleMute())` would skip the toggle when no callback is given.
      const muted = this.toggleMute();
      options.onMuteChange?.(muted);
    };
    if (this.muteKey !== false) host.addEventListener("keydown", onKey);
    const remove = (): void => {
      for (const type of events) host.removeEventListener(type, unlockOnce);
      host.removeEventListener("keydown", onKey);
    };
    this.disposers.push(remove);
    return remove;
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : this.masterLevel, this.ctx.currentTime, 0.05);
  }

  toggleMute(): boolean {
    this.setMuted(!this.mutedValue);
    return this.mutedValue;
  }

  /** Music bus level (0..1) with a smooth transition. Remembered across `duck()`. */
  setMusicLevel(level: number, timeConstant = 0.4): void {
    this.musicLevel = Math.max(MIN_GAIN, level);
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(this.musicLevel, this.ctx.currentTime, timeConstant);
  }

  /** Dip the music bus by `amount` (0..1) for `ms`, then recover. */
  duck(amount = 0.5, ms = 300): void {
    if (!this.musicBus || !this.ctx) return;
    const t = this.ctx.currentTime;
    const dipped = Math.max(MIN_GAIN, this.musicLevel * (1 - Math.min(1, Math.max(0, amount))));
    this.musicBus.gain.setTargetAtTime(dipped, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.musicLevel, t + ms / 1000, 0.25);
  }

  /** Trigger a cue. Returns true when it actually sounded (false when locked, muted, cooling down or over budget). */
  play(name: K, params: CuePlayParams = {}): boolean {
    const spec = this.cues[name];
    const ctx = this.ctx;
    if (!spec || !ctx || !this.sfxBus || this.mutedValue || ctx.state !== "running") return false;
    const nowMs = this.now();
    if (spec.cooldownMs !== undefined) {
      const last = this.lastPlayed.get(name);
      if (last !== undefined && nowMs - last < spec.cooldownMs) return false;
    }
    const t0 = ctx.currentTime;
    this.prune(t0);
    const priority = spec.priority ?? 0;
    const limit = priority > 0 ? Math.floor(this.maxVoices * 1.5) : this.maxVoices;
    if (this.voiceEnds.length >= limit) return false;
    const mine = this.cueEnds.get(name) ?? [];
    if (spec.maxConcurrent !== undefined && mine.length >= spec.maxConcurrent) return false;
    const resolved = { level: 0, ...params };
    const layers = typeof spec.layers === "function" ? spec.layers(resolved) : spec.layers;
    const pitch = params.pitch ?? 1;
    const gain = params.gain ?? 1;
    let end = t0;
    for (const layer of layers) {
      const finishes = isNoise(layer) ? this.noiseHit(layer, t0, gain) : this.tone(layer, t0, pitch, gain);
      if (finishes > end) end = finishes;
      this.voiceEnds.push(finishes);
    }
    mine.push(end);
    this.cueEnds.set(name, mine);
    this.lastPlayed.set(name, nowMs);
    if (spec.duckMusic !== undefined) {
      if (typeof spec.duckMusic === "number") this.duck(spec.duckMusic, 300);
      else this.duck(spec.duckMusic.amount, spec.duckMusic.ms);
    }
    return true;
  }

  /** Schedule one oscillator voice at an absolute time (used by sequencers). */
  voice(voice: SynthVoice): void {
    const ctx = this.ctx;
    const bus = voice.bus === "sfx" ? this.sfxBus : this.musicBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = voice.type ?? "sine";
    osc.frequency.value = voice.freq;
    const attack = voice.attack ?? 0.02;
    g.gain.setValueAtTime(MIN_GAIN, voice.at);
    g.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, voice.gain), voice.at + attack);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, voice.at + Math.max(attack + 0.001, voice.dur));
    this.chain(osc, g, bus, voice.filter, voice.at, voice.dur);
    osc.start(voice.at);
    osc.stop(voice.at + voice.dur + 0.05);
  }

  dispose(): void {
    for (const remove of this.disposers.splice(0)) remove();
    this.voiceEnds.length = 0;
    this.cueEnds.clear();
    void this.manager.dispose();
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
  }

  /** Lazily built looping noise buffer shared by noise layers and `createToneLoop`. */
  getNoiseBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.noiseBuffer) {
      const length = Math.floor(0.4 * ctx.sampleRate);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = this.noise();
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  private busNode(bus: SynthBus | undefined): GainNode {
    return (bus === "music" ? this.musicBus : this.sfxBus) as GainNode;
  }

  private prune(now: number): void {
    for (let i = this.voiceEnds.length - 1; i >= 0; i--) if ((this.voiceEnds[i] as number) <= now) this.voiceEnds.splice(i, 1);
    for (const [name, ends] of this.cueEnds) {
      const live = ends.filter((end) => end > now);
      if (live.length > 0) this.cueEnds.set(name, live);
      else this.cueEnds.delete(name);
    }
  }

  private tone(layer: ToneLayer, t0: number, pitch: number, gainScale: number): number {
    const ctx = this.ctx as SynthContext;
    const { freq, type = "sine", dur = 0.15, gain = 0.2, slideTo, delay = 0, attack = 0.008, detune } = layer;
    const at = t0 + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * pitch, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo * pitch), at + dur);
    if (detune !== undefined) osc.detune.value = detune;
    g.gain.setValueAtTime(MIN_GAIN, at);
    g.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, gain * gainScale), at + attack);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, at + dur);
    this.chain(osc, g, this.busNode(layer.bus), layer.filter, at, dur);
    osc.start(at);
    osc.stop(at + dur + 0.03);
    return at + dur + 0.03;
  }

  private noiseHit(layer: NoiseLayer, t0: number, gainScale: number): number {
    const ctx = this.ctx as SynthContext;
    const { dur = 0.2, gain = 0.15, freq = 1200, q = 1, type = "bandpass", slideTo, delay = 0 } = layer;
    const at = t0 + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, at);
    filter.Q.value = q;
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(MIN_GAIN, gain * gainScale), at);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, at + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.busNode(layer.bus));
    src.start(at);
    src.stop(at + dur + 0.02);
    return at + dur + 0.02;
  }

  private chain(osc: OscillatorNode, g: GainNode, bus: GainNode, filter: SynthFilter | undefined, at: number, dur: number): void {
    const ctx = this.ctx as SynthContext;
    if (!filter) {
      osc.connect(g);
      g.connect(bus);
      return;
    }
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.setValueAtTime(filter.freq, at);
    if (filter.q !== undefined) f.Q.value = filter.q;
    if (filter.slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, filter.slideTo), at + dur);
    osc.connect(f);
    f.connect(g);
    g.connect(bus);
  }
}

/** Convenience factory: `createCueBank({ cues })`. */
export function createCueBank<K extends string>(options: SynthCueBankOptions<K>): SynthCueBank<K> {
  return new SynthCueBank<K>(options);
}
