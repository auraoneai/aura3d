/**
 * game-sound/MusicController.ts — §6.8 music.
 *
 * Plain single-stem tracks may stream through one `MediaElementAudioSourceNode`.
 * Assets carrying request or integrity policy use verified decoded buffers.
 * Multi-stem tracks are decoded buffers started on ONE shared
 * `start(when)` timestamp — separate media elements cannot stay sample-
 * aligned. Crossfade default 1.5 s; `setIntensity` drives stem gains;
 * `stinger` quantizes to beat/bar from `bpm` + the track's start time;
 * pause duck −9 dB + lowpass 1.2 kHz.
 */

import { clamp, dbToGain } from "./types";
import { voiceAssetNeedsValidation } from "./Voice";
import type { VoiceAsset, VoiceBufferFor, VoiceBufferLoad } from "./Voice";
import type { SoundBiquadLike, SoundGraphContext, SoundNodeLike, SoundSourceLike } from "./types";

export interface MusicTrackSpec {
  readonly stems: readonly (VoiceAsset & { readonly id?: string })[];
  readonly bpm?: number;
  readonly loop?: boolean;
}

export interface MusicControllerOptions {
  readonly ctx: SoundGraphContext;
  readonly output: SoundNodeLike;
  readonly tracks: Readonly<Record<string, MusicTrackSpec>>;
  readonly bufferFor: VoiceBufferFor;
  /** A cancellable verified load for assets not already available. */
  readonly loadAsset?: VoiceBufferLoad;
  /** The engine can require buffering for an inherited request policy. */
  readonly requiresBufferedAsset?: (asset: VoiceAsset) => boolean;
  /** Reports an asynchronous failure without exposing a transport exception. */
  readonly onLoadFailure?: () => void;
  /** Media-element factory (injectable for tests). */
  readonly createMediaElement?: (url: string) => HTMLMediaElement;
  /** Cue player injected by the engine so `stinger` can schedule cues. */
  readonly playCue?: (cue: string) => void;
}

interface ActiveTrack {
  readonly name: string;
  readonly gain: SoundNodeLike;
  stems: SoundSourceLike[];
  mediaElement?: HTMLMediaElement;
  stemGains?: { value: number }[];
  extraNodes: SoundNodeLike[];
  duckFilter?: SoundBiquadLike;
  readonly startedAt: number;
  readonly bpm?: number;
  stopped: boolean;
  fadeTimer?: ReturnType<typeof setTimeout>;
}

export class MusicControllerImpl {
  private active?: ActiveTrack;
  private intensity = 1;
  private ducked = false;
  private disposed = false;
  private pending?: AbortController;
  private generation = 0;
  private readonly fading = new Set<ActiveTrack>();
  private readonly stingerTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private o: MusicControllerOptions) {}

  play(track: string, options: { crossfadeMs?: number } = {}): void {
    if (this.disposed) return;
    const spec = this.o.tracks[track];
    if (!spec) throw new Error(`Unknown music track "${track}"`);
    this.cancelPending();
    const fade = options.crossfadeMs ?? 1500;
    // Hold the chosen stems for this request. The loader snapshots each full
    // policy synchronously when called, before a later decode can yield.
    const selected: MusicTrackSpec = {
      ...spec, bpm: spec.bpm, loop: spec.loop,
      stems: spec.stems.map(snapshotStem)
    };
    if (selected.stems.length === 0) throw new Error("Music track has no stems");
    const stream = selected.stems.length === 1 && mayStream(selected.stems[0]) &&
      !this.o.requiresBufferedAsset?.(selected.stems[0]) &&
      typeof this.o.ctx.createMediaElementSource === "function" && this.o.createMediaElement !== undefined;
    if (stream) {
      this.commitTrack(track, selected, fade, undefined, true);
      return;
    }

    const buffers = selected.stems.map((stem) => {
      const inlineNeedsLoad = stem.buffer !== undefined && this.o.requiresBufferedAsset?.(stem) === true;
      return inlineNeedsLoad || voiceAssetNeedsValidation(stem)
        ? undefined : stem.buffer ?? this.o.bufferFor(stem.url, stem);
    });
    if (buffers.every((buffer) => buffer !== undefined)) {
      this.commitTrack(track, selected, fade, buffers as AudioBuffer[], false);
      return;
    }
    const loadAsset = this.o.loadAsset;
    if (!loadAsset) throw new Error("Music track requires verified decoded buffers before playback");

    const controller = new AbortController();
    const generation = this.generation;
    this.pending = controller;
    const loads: Promise<AudioBuffer | undefined>[] = [];
    try {
      for (let index = 0; index < selected.stems.length; index += 1) {
        if (controller.signal.aborted || this.pending !== controller || generation !== this.generation) break;
        loads.push(buffers[index] ? Promise.resolve(buffers[index]) :
          Promise.resolve(loadAsset(selected.stems[index], controller.signal)));
      }
    } catch {
      // Earlier callbacks can already have returned rejecting promises.
      for (const load of loads) void load.catch(() => {});
      if (this.pending !== controller || generation !== this.generation) return;
      this.pending = undefined;
      controller.abort();
      this.reportLoadFailure();
      return;
    }
    if (controller.signal.aborted || this.pending !== controller || generation !== this.generation) {
      for (const load of loads) void load.catch(() => {});
      return;
    }
    let pendingSpec: MusicTrackSpec | undefined = selected;
    const resolved: (AudioBuffer | undefined)[] = new Array(loads.length);
    let remaining = loads.length;
    const clear = (): void => { pendingSpec = undefined; resolved.fill(undefined); buffers.fill(undefined); };
    controller.signal.addEventListener("abort", clear, { once: true });
    const current = (): boolean => !this.disposed && !controller.signal.aborted &&
      generation === this.generation && this.pending === controller;
    const fail = (): void => {
      if (!current()) return;
      this.pending = undefined;
      controller.abort();
      this.reportLoadFailure();
    };
    loads.forEach((load, index) => {
      void load.then((value) => {
        if (!current()) return;
        if (!value) { fail(); return; }
        resolved[index] = value;
        remaining -= 1;
        if (remaining !== 0) return;
        this.pending = undefined;
        controller.signal.removeEventListener("abort", clear);
        const readySpec = pendingSpec;
        pendingSpec = undefined;
        buffers.fill(undefined);
        try {
          if (readySpec) this.commitTrack(track, readySpec, fade, resolved as AudioBuffer[], false);
        } catch { this.reportLoadFailure(); }
        finally { resolved.fill(undefined); }
      }, fail);
    });
  }

  setIntensity(level01: number): void {
    this.intensity = clamp(level01, 0, 1);
    this.applyStemGains();
  }

  /** Beat/bar-quantized stinger scheduling from the playing track's start. */
  quantizeDelay(quantize: "beat" | "bar" | "none" | undefined): number {
    const track = this.active;
    if (!track?.bpm || quantize === "none" || quantize === undefined) return 0;
    const beat = 60 / track.bpm;
    const bar = beat * 4;
    const elapsed = this.o.ctx.currentTime - track.startedAt;
    const unit = quantize === "bar" ? bar : beat;
    return (Math.ceil(elapsed / unit) * unit - elapsed) || unit;
  }

  stingerDelay(quantize?: "beat" | "bar" | "none"): number {
    return this.quantizeDelay(quantize);
  }

  /** C-25: schedule a cue stinger quantized to the playing track's beat/bar. */
  stinger(cue: string, o: { quantize?: "beat" | "bar" | "none" } = {}): void {
    const play = this.o.playCue;
    if (!play) return;
    const delayS = this.quantizeDelay(o.quantize);
    if (delayS <= 0) {
      play(cue);
      return;
    }
    const generation = this.generation;
    const timer = setTimeout(() => {
      this.stingerTimers.delete(timer);
      if (!this.disposed && generation === this.generation) play(cue);
    }, delayS * 1000);
    this.stingerTimers.add(timer);
    timer.unref?.();
  }

  /** Pause duck: −9 dB + lowpass 1.2 kHz until cleared. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    if (!this.active) return;
    const target = ducked ? dbToGain(-9) : 1;
    rampGain(this.active.gain, this.o.ctx.currentTime, target, 120);
    const f = this.active.duckFilter?.frequency;
    if (f) f.value = ducked ? 1200 : 20_000;
  }

  stop(fadeMs = 500): void {
    this.cancelPending();
    if (this.active) {
      const prev = this.active;
      rampGain(prev.gain, this.o.ctx.currentTime, 0, fadeMs);
      this.retireAfterFade(prev, fadeMs);
      this.active = undefined;
    }
  }

  /** Stop old-authentication playback immediately without closing the controller. */
  reset(): void {
    this.cancelPending();
    if (this.active) this.stopTrack(this.active);
    for (const track of [...this.fading]) this.stopTrack(track);
    this.fading.clear();
    this.active = undefined;
  }

  get playing(): string | undefined {
    return this.active?.name;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    // The controller can outlive its engine; do not retain track policy,
    // buffers, or loader callbacks after it has been permanently disposed.
    this.o = { ctx: this.o.ctx, output: this.o.output, tracks: {}, bufferFor: () => undefined };
  }

  private cancelPending(): void {
    this.generation += 1;
    for (const timer of this.stingerTimers) clearTimeout(timer);
    this.stingerTimers.clear();
    const previous = this.pending;
    this.pending = undefined;
    previous?.abort();
  }

  private reportLoadFailure(): void {
    try { this.o.onLoadFailure?.(); } catch { /* Do not create an unhandled async rejection. */ }
  }

  private retireAfterFade(track: ActiveTrack, fadeMs: number): void {
    this.fading.add(track);
    track.fadeTimer = setTimeout(() => {
      track.fadeTimer = undefined;
      this.fading.delete(track);
      this.stopTrack(track);
    }, fadeMs + 60);
    track.fadeTimer.unref?.();
  }

  private commitTrack(name: string, spec: MusicTrackSpec, fade: number, buffers: readonly AudioBuffer[] | undefined, stream: boolean): void {
    const generation = this.generation;
    const next = this.startTrack(name, spec, fade, buffers, stream, generation);
    if (this.disposed || this.generation !== generation) {
      this.stopTrack(next);
      return;
    }
    const prev = this.active;
    this.active = next;
    if (prev) {
      rampGain(prev.gain, this.o.ctx.currentTime, 0, fade);
      this.retireAfterFade(prev, fade);
    }
  }

  private startTrack(name: string, spec: MusicTrackSpec, fadeInMs: number, buffers: readonly AudioBuffer[] | undefined, stream: boolean, generation: number): ActiveTrack {
    const ctx = this.o.ctx;
    const gain = ctx.createGain() as unknown as SoundNodeLike;
    const track: ActiveTrack = { name, gain, stems: [], extraNodes: [], startedAt: ctx.currentTime, bpm: spec.bpm, stopped: false };
    const superseded = (): boolean => this.disposed || this.generation !== generation;
    try {
      const g = gain as unknown as { gain: { value: number } };
      g.gain.value = fadeInMs > 0 ? 0.0001 : 1;
      if (this.ducked) g.gain.value = dbToGain(-9) * g.gain.value;
      if (typeof ctx.createBiquadFilter === "function") {
        const duckFilter = ctx.createBiquadFilter() as unknown as SoundBiquadLike;
        track.duckFilter = duckFilter;
        track.extraNodes.push(duckFilter);
        duckFilter.type = "lowpass";
        if (duckFilter.frequency) duckFilter.frequency.value = this.ducked ? 1200 : 20_000;
        gain.connect(duckFilter);
        duckFilter.connect(this.o.output);
      } else {
        gain.connect(this.o.output);
      }
      if (fadeInMs > 0) rampGain(gain, ctx.currentTime, this.ducked ? dbToGain(-9) : 1, fadeInMs);

      if (stream && typeof ctx.createMediaElementSource === "function" && this.o.createMediaElement) {
        // Single stem → streamed media element.
        const element = this.o.createMediaElement(spec.stems[0].url);
        track.mediaElement = element;
        if (superseded()) { this.stopTrack(track); return track; }
        element.loop = spec.loop ?? true;
        const source = ctx.createMediaElementSource(element) as unknown as SoundNodeLike;
        track.stems = [source as unknown as SoundSourceLike];
        source.connect(gain);
        if (superseded()) { this.stopTrack(track); return track; }
        const playing = element.play?.();
        if (playing && typeof playing.catch === "function") void playing.catch(() => {
          if (!track.stopped && !this.disposed) this.reportLoadFailure();
        });
      } else {
        // Multi-stem → decoded buffers started on one shared `when`.
        const when = ctx.currentTime + 0.05;
        const stemGains: { value: number }[] = [];
        for (let i = 0; i < spec.stems.length; i += 1) {
          if (superseded()) { this.stopTrack(track); return track; }
          const source = ctx.createBufferSource() as unknown as SoundSourceLike;
          track.stems.push(source);
          const buffer = buffers?.[i];
          if (!buffer) throw new Error("Music track requires verified decoded buffers before playback");
          source.buffer = buffer;
          source.loop = spec.loop ?? true;
          const stemGain = ctx.createGain() as unknown as SoundNodeLike;
          track.extraNodes.push(stemGain);
          const param = (stemGain as unknown as { gain: { value: number } }).gain;
          // The base stem is full; later stems follow the intensity setting.
          param.value = i === 0 ? 1 : this.stemLevel(i, spec.stems.length);
          if (i > 0) stemGains[i - 1] = param;
          source.connect(stemGain);
          stemGain.connect(gain);
          if (superseded()) { this.stopTrack(track); return track; }
          source.start(when);
        }
        track.stemGains = stemGains;
        // Beat quantization anchors at the shared start timestamp, not mount time.
        (track as { startedAt: number }).startedAt = when;
      }
      return track;
    } catch (error) {
      this.stopTrack(track);
      throw error;
    }
  }

  private stemLevel(stemIndex: number, stemCount: number): number {
    // Later stems represent higher intensity layers.
    return this.intensity * Math.min(1, (stemIndex + 1) / stemCount);
  }

  private applyStemGains(): void {
    const track = this.active;
    if (!track || track.stems.length <= 1) return;
    track.stemGains?.forEach((param, i) => {
      param.value = this.stemLevel(i + 1, track.stems.length);
    });
  }

  private stopTrack(track: ActiveTrack): void {
    if (track.stopped) return;
    track.stopped = true;
    if (track.fadeTimer !== undefined) clearTimeout(track.fadeTimer);
    track.fadeTimer = undefined;
    this.fading.delete(track);
    for (const stem of track.stems) {
      try {
        stem.stop?.();
      } catch {
        /* noop */
      }
      try {
        stem.disconnect();
      } catch {
        /* noop */
      }
    }
    try {
      track.mediaElement?.pause?.();
    } catch {
      /* noop */
    }
    for (const node of track.extraNodes) {
      try { node.disconnect(); } catch { /* Best-effort node cleanup. */ }
    }
    try {
      track.gain.disconnect();
    } catch {
      /* noop */
    }
  }
}

/** Preserve typed asset getters and isolate mutable request policy per play. */
function snapshotStem(stem: VoiceAsset): VoiceAsset {
  const sourceRequest = stem.request;
  let request = sourceRequest;
  if (sourceRequest) {
    const copy: Record<string, unknown> = { ...sourceRequest };
    const keys = ["signal", "cacheKey", "name", "credentials", "cache", "mode", "redirect", "referrer",
      "referrerPolicy", "priority", "expectedHash", "sourceOrigin", "expectedUrl", "maxBytes",
      "securityContext", "baseURL", "onProgress"] as const;
    for (const key of keys) {
      const value = sourceRequest[key];
      if (value !== undefined) copy[key] = value;
    }
    let headers = sourceRequest.headers;
    if (headers !== undefined && typeof Headers === "function") {
      if (!Array.isArray(headers) && typeof (headers as Headers).forEach === "function") {
        const entries: [string, string][] = [];
        (headers as Headers).forEach((value, key) => entries.push([key, value]));
        headers = new Headers(entries);
      } else headers = new Headers(headers);
    }
    if (headers !== undefined) copy.headers = headers;
    if (sourceRequest.allowedOrigins !== undefined) copy.allowedOrigins = [...sourceRequest.allowedOrigins];
    if (sourceRequest.integrity !== undefined) copy.integrity = snapshotIntegrity(sourceRequest.integrity);
    request = copy as VoiceAsset["request"];
  }
  const variants = stem.variantHashes;
  return {
    ...stem,
    url: stem.url,
    buffer: stem.buffer,
    id: stem.id,
    kind: stem.kind,
    type: stem.type,
    format: stem.format,
    license: stem.license,
    provenance: stem.provenance,
    hash: stem.hash,
    sha256: stem.sha256,
    integrity: snapshotIntegrity(stem.integrity),
    sizeBytes: stem.sizeBytes,
    securityContext: stem.securityContext,
    request,
    variantHashes: variants === undefined ? undefined : {
      "opus.webm": variants["opus.webm"], m4a: variants.m4a
    }
  };
}

function snapshotIntegrity(integrity: VoiceAsset["integrity"]): VoiceAsset["integrity"] {
  if (!integrity || typeof integrity !== "object") return integrity;
  return { ...integrity, version: integrity.version, digest: integrity.digest,
    ...(integrity.requireDependencies === undefined ? {} : { requireDependencies: integrity.requireDependencies }),
    ...(integrity.dependencies === undefined ? {} : { dependencies: { ...integrity.dependencies } }) };
}

/** Media elements cannot apply the loader's headers, origin or integrity policy. */
function mayStream(asset: VoiceAsset): boolean {
  return asset.buffer === undefined && asset.hash === undefined && asset.sha256 === undefined &&
    asset.kind !== "aura-asset-ref" &&
    asset.sizeBytes === undefined && asset.integrity === undefined &&
    asset.request === undefined && asset.securityContext === undefined && asset.variantHashes === undefined &&
    !asset.url.includes("{format}");
}

const rampGain = (gain: SoundNodeLike, now: number, target: number, ms: number): void => {
  const param = (gain as unknown as { gain?: { value: number; cancelScheduledValues?(t: number): void; setValueAtTime?(v: number, t: number): void; linearRampToValueAtTime?(v: number, t: number): void } }).gain;
  if (!param) return;
  if (ms <= 0 || !param.linearRampToValueAtTime) {
    param.value = target;
    return;
  }
  param.cancelScheduledValues?.(now);
  param.setValueAtTime?.(Math.max(0.0001, param.value), now);
  param.linearRampToValueAtTime(Math.max(0.0001, target), now + ms / 1000);
};
