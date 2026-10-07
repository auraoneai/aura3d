/**
 * game-sound/MusicController.ts — §6.8 music.
 *
 * Single-stem tracks stream through one `MediaElementAudioSourceNode` (no
 * decode). Multi-stem tracks are decoded buffers started on ONE shared
 * `start(when)` timestamp — separate media elements cannot stay sample-
 * aligned. Crossfade default 1.5 s; `setIntensity` drives stem gains;
 * `stinger` quantizes to beat/bar from `bpm` + the track's start time;
 * pause duck −9 dB + lowpass 1.2 kHz.
 */

import { clamp, dbToGain } from "./types";
import type { SoundBiquadLike, SoundGraphContext, SoundNodeLike, SoundSourceLike } from "./types";

export interface MusicTrackSpec {
  readonly stems: readonly { readonly url: string; readonly id?: string }[];
  readonly bpm?: number;
  readonly loop?: boolean;
}

export interface MusicControllerOptions {
  readonly ctx: SoundGraphContext;
  readonly output: SoundNodeLike;
  readonly tracks: Readonly<Record<string, MusicTrackSpec>>;
  readonly bufferFor: (url: string) => AudioBuffer | undefined;
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
  readonly startedAt: number;
  readonly bpm?: number;
  stopped: boolean;
}

export class MusicControllerImpl {
  private active?: ActiveTrack;
  private intensity = 1;
  private ducked = false;
  private duckFilter?: SoundBiquadLike;
  private disposed = false;

  constructor(private readonly o: MusicControllerOptions) {}

  play(track: string, options: { crossfadeMs?: number } = {}): void {
    if (this.disposed) return;
    const spec = this.o.tracks[track];
    if (!spec) throw new Error(`Unknown music track "${track}"`);
    const fade = options.crossfadeMs ?? 1500;
    const prev = this.active;
    if (prev) {
      rampGain(prev.gain, this.o.ctx.currentTime, 0, fade);
      setTimeout(() => this.stopTrack(prev), fade + 60).unref?.();
    }
    this.active = this.startTrack(track, spec, fade);
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
    setTimeout(() => play(cue), delayS * 1000).unref?.();
  }

  /** Pause duck: −9 dB + lowpass 1.2 kHz until cleared. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    if (!this.active) return;
    const target = ducked ? dbToGain(-9) : 1;
    rampGain(this.active.gain, this.o.ctx.currentTime, target, 120);
    const f = this.duckFilter?.frequency;
    if (f) f.value = ducked ? 1200 : 20_000;
  }

  stop(fadeMs = 500): void {
    if (this.active) {
      const prev = this.active;
      rampGain(prev.gain, this.o.ctx.currentTime, 0, fadeMs);
      setTimeout(() => this.stopTrack(prev), fadeMs + 60).unref?.();
      this.active = undefined;
    }
  }

  get playing(): string | undefined {
    return this.active?.name;
  }

  dispose(): void {
    this.disposed = true;
    if (this.active) this.stopTrack(this.active);
    this.active = undefined;
  }

  private startTrack(name: string, spec: MusicTrackSpec, fadeInMs: number): ActiveTrack {
    const ctx = this.o.ctx;
    const gain = ctx.createGain() as unknown as SoundNodeLike;
    const g = gain as unknown as { gain: { value: number } };
    g.gain.value = fadeInMs > 0 ? 0.0001 : 1;
    if (this.ducked) g.gain.value = dbToGain(-9) * g.gain.value;

    let duckFilter: SoundBiquadLike | undefined;
    if (typeof ctx.createBiquadFilter === "function") {
      duckFilter = ctx.createBiquadFilter() as unknown as SoundBiquadLike;
      duckFilter.type = "lowpass";
      if (duckFilter.frequency) duckFilter.frequency.value = this.ducked ? 1200 : 20_000;
      gain.connect(duckFilter);
      duckFilter.connect(this.o.output);
    } else {
      gain.connect(this.o.output);
    }
    this.duckFilter = duckFilter;
    if (fadeInMs > 0) rampGain(gain, ctx.currentTime, this.ducked ? dbToGain(-9) : 1, fadeInMs);

    const track: ActiveTrack = { name, gain, stems: [], mediaElement: undefined, startedAt: ctx.currentTime, bpm: spec.bpm, stopped: false };

    if (spec.stems.length === 1 && typeof ctx.createMediaElementSource === "function" && this.o.createMediaElement) {
      // Single stem → streamed media element.
      const element = this.o.createMediaElement(spec.stems[0].url);
      element.loop = spec.loop ?? true;
      const source = ctx.createMediaElementSource(element) as unknown as SoundNodeLike;
      source.connect(gain);
      track.mediaElement = element;
      track.stems = [source as unknown as SoundSourceLike];
      void element.play?.();
    } else {
      // Multi-stem → decoded buffers started on one shared `when`.
      const when = ctx.currentTime + 0.05;
      const stemGains: { value: number }[] = [];
      const stems = spec.stems.map((stem, i) => {
        const source = ctx.createBufferSource() as unknown as SoundSourceLike;
        source.buffer = this.o.bufferFor(stem.url) ?? null;
        source.loop = spec.loop ?? true;
        const stemGain = ctx.createGain() as unknown as SoundNodeLike;
        const param = (stemGain as unknown as { gain: { value: number } }).gain;
        // Base stem (index 0) is always full; intensity layers fade in by
        // setIntensity — start at their intensity-scaled level.
        param.value = i === 0 ? 1 : this.stemLevel(i, spec.stems.length);
        if (i > 0) stemGains[i - 1] = param;
        (source as unknown as { connect(d: SoundNodeLike): unknown }).connect(stemGain);
        (stemGain as unknown as { connect(d: SoundNodeLike): unknown }).connect(gain);
        source.start(when);
        return source;
      });
      track.stems = stems;
      track.stemGains = stemGains;
      // Beat quantization anchors at the shared start timestamp, not mount time.
      (track as { startedAt: number }).startedAt = when;
    }
    return track;
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
    try {
      track.gain.disconnect();
    } catch {
      /* noop */
    }
  }
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
