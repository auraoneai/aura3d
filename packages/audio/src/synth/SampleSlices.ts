import type { SynthCueBank } from "./SynthCueBank";
import type { SynthBus, SynthContext } from "./types";

/** One sprite sheet holding several separately recorded takes of the same sound. */
export interface SampleSpriteSpec {
  /** Where the sheet lives. `preload()` fetches it; `prepare()` decodes it once the bank is unlocked. */
  readonly url?: string;
  /** Start offset, in seconds, of each take inside the sheet. */
  readonly offsets: readonly number[];
  /** Length of every take, in seconds. */
  readonly duration: number;
  /** Procedural buffer played whole (no slicing) until the sheet decodes, or if it never does. */
  readonly fallback?: (context: SynthContext) => AudioBuffer;
}

export interface SampleSlicePlayParams {
  /** Linear gain on this play. Default 1. */
  readonly gain?: number;
  /** Stereo pan in -1..1. Omit for no panner. */
  readonly pan?: number;
  /** Playback rate multiplier. Default 1. */
  readonly rate?: number;
  /** Low-pass cutoff in Hz. Omit for no filter. */
  readonly lowpass?: number;
  /** Low-pass resonance. Default 0.5. */
  readonly q?: number;
  /** Which bus to play on. Default `sfx`. */
  readonly bus?: SynthBus;
  /** Force a take (tests). Skips the no-repeat pick and does not change the remembered take. */
  readonly take?: number;
}

export interface SampleSlicesOptions<K extends string = string> {
  readonly sprites: Readonly<Record<K, SampleSpriteSpec>>;
  /** Uniform draw in [0, 1) used to pick the next take. Default: a seeded LCG (never `Math.random`). */
  readonly random?: () => number;
  /** Fetch used by `preload()`. The optional abort signal may be ignored by custom transports. */
  readonly fetch?: (url: string, init?: { readonly signal?: AbortSignal }) => Promise<{ readonly ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;
  /** Non-secret authentication generation. Call setSecurityContext again when authorization changes. */
  readonly securityContext?: string;
}

interface Decoder {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

interface Voice {
  source: AudioBufferSourceNode;
  nodes: AudioNode[];
  released: boolean;
}

interface SheetDownload {
  readonly generation: object;
  readonly controller: AbortController;
  readonly promise: Promise<ArrayBuffer | null>;
  readonly cancelled: Promise<void>;
  decode?: { readonly context: SynthContext; readonly revision: object | undefined; readonly promise: Promise<void> };
  decoded?: { readonly context: SynthContext; readonly revision: object | undefined };
}

function validateSecurityContext(value: string | undefined): void {
  if (value !== undefined && (typeof value !== "string" || !value.trim())) {
    throw new Error("Audio securityContext must be a non-empty authentication generation");
  }
}

const defaultRandom = (): (() => number) => {
  let state = 0x1badf00d;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

/**
 * Plays slices of recorded sprite sheets on a `SynthCueBank`'s buses.
 *
 * Several takes of one sound are recorded back to back in a sheet. Each play picks a take that is never the same as
 * the previous one, plays only that slice, and runs it through an optional low-pass, gain and stereo panner. The
 * sheet is fetched early, decoded after the bank unlocks, and until then (or if it never loads) a procedural
 * fallback buffer stands in. The sound content and the way a game maps contacts to gain, pan and filter stay in
 * the game.
 */
export class SampleSlices<K extends string = string> {
  private readonly sprites: Readonly<Record<string, SampleSpriteSpec>>;
  private readonly random: () => number;
  private readonly fetchImpl: SampleSlicesOptions<K>["fetch"];
  private readonly downloads = new Map<string, SheetDownload>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly fallbacks = new Map<string, AudioBuffer>();
  private readonly previous = new Map<string, number>();
  private readonly voices = new Set<Voice>();
  private readonly revisions = new Map<string, object>();
  private generation: object = {};
  private disposed = false;

  constructor(
    private readonly bank: SynthCueBank,
    options: SampleSlicesOptions<K>
  ) {
    validateSecurityContext(options.securityContext);
    const sprites: Record<string, SampleSpriteSpec> = Object.create(null) as Record<string, SampleSpriteSpec>;
    for (const [name, sprite] of Object.entries(options.sprites) as [string, SampleSpriteSpec][]) {
      sprites[name] = { ...sprite, offsets: [...sprite.offsets] };
    }
    this.sprites = sprites;
    this.random = options.random ?? defaultRandom();
    this.fetchImpl = options.fetch ?? (typeof globalThis.fetch === "function" ? (globalThis.fetch.bind(globalThis) as SampleSlicesOptions<K>["fetch"]) : undefined);
  }

  /** Start downloading every sheet. Safe to call before the context exists and repeatedly. A failed download is remembered as absent. */
  preload(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const generation = this.generation;
    const pending: Promise<unknown>[] = [];
    for (const [name, sprite] of Object.entries(this.sprites)) {
      if (this.disposed || generation !== this.generation) break;
      if (!sprite.url) continue;
      const record = this.downloads.get(name) ?? this.startDownload(name, sprite.url);
      pending.push(record.promise);
    }
    return Promise.all(pending).then(() => undefined);
  }

  /**
   * Build the fallback buffers and decode the downloaded sheets. Call after `bank.unlock()`. Resolves when decoding
   * is finished; plays before that use the fallback.
   */
  async prepare(): Promise<void> {
    const ctx = this.bank.context;
    if (this.disposed || !ctx) return;
    const generation = this.generation;
    void this.preload();
    if (this.disposed || generation !== this.generation || this.bank.context !== ctx) return;
    this.buildFallbacks();
    if (this.disposed || generation !== this.generation || this.bank.context !== ctx) return;
    const decoder = ctx as unknown as Partial<Decoder>;
    await Promise.all(
      Object.keys(this.sprites).map(async (name) => {
        try {
          const record = this.downloads.get(name);
          if (!record) return;
          const revision = this.revisions.get(name);
          const current = () => !this.disposed && this.generation === generation && record.generation === generation
            && this.downloads.get(name) === record && this.revisions.get(name) === revision && this.bank.context === ctx;
          if (!current()) return;
          const bytes = await record.promise;
          if (!bytes || !current() || typeof decoder.decodeAudioData !== "function") return;
          if (record.decoded?.context === ctx && record.decoded.revision === revision) return;
          let decode = record.decode;
          if (!decode || decode.context !== ctx || decode.revision !== revision) {
            const promise = Promise.resolve().then(async () => {
              if (!current()) return;
              // Web Audio may detach its input; the retained download remains reusable.
              const buffer = await decoder.decodeAudioData!(bytes.slice(0));
              if (!buffer || !current()) return;
              this.buffers.set(name, buffer);
              record.decoded = { context: ctx, revision };
            }).catch(() => { /* Keep using the fallback. */ });
            decode = { context: ctx, revision, promise };
            record.decode = decode;
            const owned = decode;
            void promise.then(() => { if (record.decode === owned) record.decode = undefined; });
          }
          await Promise.race([decode.promise, record.cancelled]);
        } catch {
          // A sheet that will not decode keeps using its fallback.
        }
      })
    );
  }

  /**
   * Build the procedural fallback buffers now. Needs the bank's graph to exist (call right after `bank.unlock()` starts:
   * the graph is created synchronously). `prepare()` calls it too; calling it earlier lets the very first play sound.
   */
  buildFallbacks(): void {
    const ctx = this.bank.context;
    if (this.disposed || !ctx) return;
    const generation = this.generation;
    for (const [name, sprite] of Object.entries(this.sprites)) {
      if (!sprite.fallback || this.fallbacks.has(name)) continue;
      const fallback = sprite.fallback(ctx);
      if (this.disposed || generation !== this.generation || this.bank.context !== ctx) return;
      if (!this.fallbacks.has(name)) this.fallbacks.set(name, fallback);
    }
  }

  /** Supply a decoded sheet directly (tests, offline rendering, assets decoded elsewhere). */
  setBuffer(name: K, buffer: AudioBuffer): void {
    if (this.disposed) return;
    this.revisions.set(name, {});
    this.buffers.set(name, buffer);
  }

  /** Invalidate retained sheets and voices after any caller-observed authorization change. */
  setSecurityContext(next?: string): void {
    if (this.disposed) return;
    validateSecurityContext(next);
    this.clearGeneration();
  }

  /** Stop voices and invalidate pending work. The associated bank remains caller-owned. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearGeneration();
  }

  /** True once the sheet for `name` is decoded. */
  has(name: K): boolean {
    return this.buffers.has(name);
  }

  /** The take played last for `name`, or -1. */
  lastTake(name: K): number {
    return this.previous.get(name) ?? -1;
  }

  /**
   * Play one slice. Returns the take index played (-1 for the whole fallback buffer), or `null` when nothing sounded
   * (bank locked, muted, not running, or no buffer yet and no fallback).
   */
  play(name: K, params: SampleSlicePlayParams = {}): number | null {
    const sprite = this.sprites[name];
    const ctx = this.bank.context;
    const bus = params.bus === "music" ? this.bank.musicDestination : this.bank.sfxDestination;
    if (this.disposed || !sprite || !ctx || !bus || this.bank.muted || !this.bank.running) return null;
    const generation = this.generation;
    const revision = this.revisions.get(name);
    const decoded = this.buffers.get(name);
    const buffer = decoded ?? this.fallbacks.get(name);
    if (!buffer) return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = params.rate ?? 1;
    const nodes: AudioNode[] = [];
    let tail: AudioNode = source;
    if (params.lowpass !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = params.q ?? 0.5;
      filter.frequency.value = params.lowpass;
      tail = tail.connect(filter);
      nodes.push(filter);
    }
    const gain = ctx.createGain();
    gain.gain.value = params.gain ?? 1;
    tail = tail.connect(gain);
    nodes.push(gain);
    const withPanner = params.pan !== undefined && typeof (ctx as unknown as { createStereoPanner?: unknown }).createStereoPanner === "function";
    if (withPanner) {
      const pan = (ctx as unknown as { createStereoPanner(): StereoPannerNode }).createStereoPanner();
      pan.pan.value = params.pan as number;
      tail = tail.connect(pan);
      nodes.push(pan);
    }
    tail.connect(bus);
    const voice: Voice = { source, nodes, released: false };
    this.voices.add(voice);
    source.onended = () => this.releaseVoice(voice, false);
    const current = () => !this.disposed && generation === this.generation && revision === this.revisions.get(name)
      && this.bank.context === ctx && !this.bank.muted && this.bank.running;
    if (decoded && sprite.offsets.length > 0) {
      const takes = sprite.offsets.length;
      let index: number;
      if (params.take !== undefined) {
        index = ((params.take % takes) + takes) % takes;
      } else {
        // Never repeat the previous take: step 1..takes-1 forward from it.
        const previous = this.previous.get(name) ?? -1;
        index = (previous + 1 + Math.floor(this.random() * Math.max(1, takes - 1))) % takes;
      }
      if (!current()) { this.releaseVoice(voice, true); return null; }
      source.start(ctx.currentTime, sprite.offsets[index] as number, sprite.duration);
      if (params.take === undefined && current()) this.previous.set(name, index);
      return index;
    }
    if (!current()) { this.releaseVoice(voice, true); return null; }
    source.start(ctx.currentTime);
    return -1;
  }

  /** Stop every slice that is still sounding. */
  stopAll(): void {
    for (const voice of this.voices) {
      try {
        voice.source.stop();
      } catch {
        // Already ended.
      }
    }
  }

  private startDownload(name: string, url: string): SheetDownload {
    const generation = this.generation;
    const controller = new AbortController();
    let settle!: (bytes: ArrayBuffer | null) => void;
    let cancel!: () => void;
    const promise = new Promise<ArrayBuffer | null>((resolve) => { settle = resolve; });
    const cancelled = new Promise<void>((resolve) => { cancel = resolve; });
    const record: SheetDownload = { generation, controller, promise, cancelled };
    this.downloads.set(name, record);
    const current = () => !this.disposed && this.generation === generation && this.downloads.get(name) === record && !controller.signal.aborted;
    const onAbort = () => { settle(null); cancel(); };
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const finish = (bytes: ArrayBuffer | null) => {
      settle(current() ? bytes : null);
    };
    try {
      if (!this.fetchImpl || !current()) { finish(null); return record; }
      void Promise.resolve(this.fetchImpl(url, { signal: controller.signal })).then(async (response) => {
        if (!current() || !response.ok) return null;
        const bytes = await response.arrayBuffer();
        return current() ? bytes : null;
      }).then(finish, () => finish(null));
    } catch {
      finish(null);
    }
    return record;
  }

  private clearGeneration(): void {
    this.generation = {};
    const downloads = [...this.downloads.values()];
    const voices = [...this.voices];
    this.downloads.clear();
    this.buffers.clear();
    this.fallbacks.clear();
    this.previous.clear();
    this.revisions.clear();
    this.voices.clear();
    for (const voice of voices) this.releaseVoice(voice, true);
    for (const download of downloads) { try { download.controller.abort(); } catch { /* Continue invalidating. */ } }
  }

  private releaseVoice(voice: Voice, stop: boolean): void {
    if (voice.released) return;
    voice.released = true;
    this.voices.delete(voice);
    voice.source.onended = null;
    if (stop) { try { voice.source.stop(); } catch { /* Already ended or not started. */ } }
    try { voice.source.disconnect(); } catch { /* Continue disconnecting the remaining nodes. */ }
    for (const node of voice.nodes) { try { node.disconnect(); } catch { /* Continue cleanup. */ } }
  }
}

/** Convenience factory: `createSampleSlices(bank, { sprites })`. */
export function createSampleSlices<K extends string>(bank: SynthCueBank, options: SampleSlicesOptions<K>): SampleSlices<K> {
  return new SampleSlices<K>(bank, options);
}
