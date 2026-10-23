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
  /** Fetch used by `preload()`. Default `globalThis.fetch`. */
  readonly fetch?: (url: string) => Promise<{ readonly ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;
}

interface Decoder {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

interface Voice {
  source: AudioBufferSourceNode;
  nodes: AudioNode[];
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
  private readonly downloads = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly fallbacks = new Map<string, AudioBuffer>();
  private readonly previous = new Map<string, number>();
  private readonly voices = new Set<Voice>();

  constructor(
    private readonly bank: SynthCueBank,
    options: SampleSlicesOptions<K>
  ) {
    this.sprites = options.sprites;
    this.random = options.random ?? defaultRandom();
    this.fetchImpl = options.fetch ?? (typeof globalThis.fetch === "function" ? (globalThis.fetch.bind(globalThis) as SampleSlicesOptions<K>["fetch"]) : undefined);
  }

  /** Start downloading every sheet. Safe to call before the context exists and repeatedly. A failed download is remembered as absent. */
  preload(): Promise<void> {
    const pending: Promise<unknown>[] = [];
    for (const [name, sprite] of Object.entries(this.sprites)) {
      if (!sprite.url || this.downloads.has(name)) continue;
      const fetchImpl = this.fetchImpl;
      const download = fetchImpl
        ? fetchImpl(sprite.url)
            .then((response) => {
              if (!response.ok) throw new Error("Audio unavailable");
              return response.arrayBuffer();
            })
            .catch(() => null)
        : Promise.resolve(null);
      this.downloads.set(name, download);
      pending.push(download);
    }
    return Promise.all(pending).then(() => undefined);
  }

  /**
   * Build the fallback buffers and decode the downloaded sheets. Call after `bank.unlock()`. Resolves when decoding
   * is finished; plays before that use the fallback.
   */
  async prepare(): Promise<void> {
    const ctx = this.bank.context;
    if (!ctx) return;
    this.preload();
    this.buildFallbacks();
    const decoder = ctx as unknown as Partial<Decoder>;
    await Promise.all(
      Object.keys(this.sprites).map(async (name) => {
        try {
          const bytes = await this.downloads.get(name);
          if (!bytes || typeof decoder.decodeAudioData !== "function") return;
          const buffer = await decoder.decodeAudioData(bytes);
          if (buffer) this.buffers.set(name, buffer);
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
    if (!ctx) return;
    for (const [name, sprite] of Object.entries(this.sprites)) {
      if (sprite.fallback && !this.fallbacks.has(name)) this.fallbacks.set(name, sprite.fallback(ctx));
    }
  }

  /** Supply a decoded sheet directly (tests, offline rendering, assets decoded elsewhere). */
  setBuffer(name: K, buffer: AudioBuffer): void {
    this.buffers.set(name, buffer);
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
    if (!sprite || !ctx || !bus || this.bank.muted || !this.bank.running) return null;
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
    const voice: Voice = { source, nodes };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
    if (decoded && sprite.offsets.length > 0) {
      const takes = sprite.offsets.length;
      let index: number;
      if (params.take !== undefined) {
        index = ((params.take % takes) + takes) % takes;
      } else {
        // Never repeat the previous take: step 1..takes-1 forward from it.
        const previous = this.previous.get(name) ?? -1;
        index = (previous + 1 + Math.floor(this.random() * Math.max(1, takes - 1))) % takes;
        this.previous.set(name, index);
      }
      source.start(ctx.currentTime, sprite.offsets[index] as number, sprite.duration);
      return index;
    }
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
}

/** Convenience factory: `createSampleSlices(bank, { sprites })`. */
export function createSampleSlices<K extends string>(bank: SynthCueBank, options: SampleSlicesOptions<K>): SampleSlices<K> {
  return new SampleSlices<K>(bank, options);
}
