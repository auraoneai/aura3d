/**
 * game-sound/Voice.ts — voice pool per §6.8/§17.
 *
 * - Variant picks are round-robin-without-immediate-repeat (VariantPicker),
 *   seeded from the session seed → deterministic captures.
 * - Pitch jitter ±`pitchJitterSemitones` (default 0.6), gain jitter
 *   ±`gainJitterDb` (default 1.5).
 * - Per-cue `maxVoices` (default 4): oldest-playing voice of the same cue is
 *   stolen. Per-cue `cooldownMs` (default 30): plays inside the window are
 *   dropped and counted.
 * - Global tier voice cap: when full, the lowest-priority oldest voice is
 *   evicted — `ambient` first, then `normal`, never `critical`.
 */

import { VariantPicker, jitter, type Rng } from "./rng";
import { clamp, dbToGain } from "./types";
import type { SoundBiquadLike, SoundGraphContext, SoundNodeLike, SoundSourceLike } from "./types";

export type VoicePriority = "critical" | "normal" | "ambient";
export const PRIORITY_RANK: Record<VoicePriority, number> = { critical: 2, normal: 1, ambient: 0 };
export const priorityOf = (p: VoicePriority | number | undefined): number =>
  typeof p === "number" ? p : PRIORITY_RANK[p ?? "normal"];

export interface VoiceCueSpec {
  readonly asset?: { readonly url: string } | readonly { readonly url: string }[];
  readonly bus: string;
  readonly volumeDb?: number;
  readonly pitchJitterSemitones?: number;
  readonly gainJitterDb?: number;
  readonly maxVoices?: number;
  readonly cooldownMs?: number;
  readonly loop?: boolean;
  readonly priority?: VoicePriority | number;
}

export interface VoiceRecord {
  readonly id: number;
  readonly cueId: string;
  readonly priority: number;
  readonly startedAt: number;
  readonly source: SoundSourceLike;
  readonly gain: SoundNodeLike;
  /** Linear voice gain after volume + jitter (the attack ramp's target). */
  readonly targetGain: number;
  loop: boolean;
  ended: boolean;
}

export interface VoicePoolOptions {
  readonly ctx: SoundGraphContext;
  readonly rng: Rng;
  /** Resolve an asset url to a decoded buffer (async load handled upstream). */
  readonly bufferFor: (url: string) => AudioBuffer | undefined;
  /** Now in ms — injected for tests. */
  readonly now?: () => number;
  /** Global cap per §17 tier. */
  readonly voiceCap: number;
}

export interface VoiceAllocation {
  readonly dropped: boolean;
  readonly record?: VoiceRecord;
  readonly stolen?: VoiceRecord;
  readonly evicted?: VoiceRecord;
}

export class VoicePool {
  private readonly now: () => number;
  private readonly live = new Set<VoiceRecord>();
  private readonly perCue = new Map<string, Set<VoiceRecord>>();
  private readonly pickers = new Map<string, VariantPicker>();
  private readonly lastPlayAt = new Map<string, number>();
  private nextId = 1;
  private droppedByCooldown = 0;
  private stolenCount = 0;
  private evictedCount = 0;
  private playedCount = 0;

  constructor(private readonly o: VoicePoolOptions) {
    this.now = o.now ?? (() => o.ctx.currentTime * 1000);
  }

  get liveCount(): number {
    return this.live.size;
  }
  get stats(): { played: number; cooldownDrops: number; stolen: number; evicted: number } {
    return {
      played: this.playedCount,
      cooldownDrops: this.droppedByCooldown,
      stolen: this.stolenCount,
      evicted: this.evictedCount
    };
  }

  /**
   * Allocate a voice for `cueId`. Returns the record plus any steal/eviction
   * performed; `dropped` means the cooldown rejected the play.
   */
  allocate(
    cueId: string,
    spec: VoiceCueSpec,
    destination: SoundNodeLike,
    opts: { volumeDb?: number; rate?: number; loop?: boolean } = {}
  ): VoiceAllocation {
    const now = this.now();
    const cooldown = spec.cooldownMs ?? 30;
    const last = this.lastPlayAt.get(cueId);
    if (last !== undefined && now - last < cooldown) {
      this.droppedByCooldown += 1;
      return { dropped: true };
    }
    this.lastPlayAt.set(cueId, now);

    // Per-cue steal: already at maxVoices → steal oldest of the same cue.
    let stolen: VoiceRecord | undefined;
    const cueLive = this.perCue.get(cueId) ?? new Set<VoiceRecord>();
    this.perCue.set(cueId, cueLive);
    const maxVoices = spec.maxVoices ?? 4;
    if (cueLive.size >= maxVoices) {
      stolen = oldest(cueLive);
      if (stolen) {
        this.release(stolen);
        this.stolenCount += 1;
      }
    }

    // Global cap: evict the lowest-priority oldest voice iff it is strictly
    // below the incoming priority; otherwise the incoming play is dropped.
    let evicted: VoiceRecord | undefined;
    if (this.live.size >= this.o.voiceCap) {
      const victim = lowestPriorityOldest(this.live);
      const incoming = priorityOf(spec.priority);
      if (!victim || victim.priority >= incoming) {
        return { dropped: true };
      }
      evicted = victim;
      this.release(evicted);
      this.evictedCount += 1;
    }

    const source = this.o.ctx.createBufferSource() as unknown as SoundSourceLike;
    const loop = opts.loop ?? spec.loop ?? false;
    const raw = resolveBuffer(spec.asset, this.pickerFor(cueId, spec), this.o.bufferFor);
    // Loops whose last sample does not meet the first click once per cycle —
    // play a crossfaded copy instead (see seamlessLoopBuffer).
    const buffer = raw !== undefined && loop ? seamlessLoopBuffer(this.o.ctx, raw) : raw;
    if (buffer !== undefined) source.buffer = buffer;
    source.loop = loop;

    const gain = this.o.ctx.createGain() as unknown as SoundNodeLike;
    const gainDb =
      (spec.volumeDb ?? 0) + (opts.volumeDb ?? 0) + jitter(this.o.rng, spec.gainJitterDb ?? 1.5);
    // Attack ramp: a voice that jumps from silence to full gain clicks.
    const targetGain = clamp(dbToGain(gainDb), 0, 4);
    rampIn(gain as unknown as GainParamOwner, targetGain, this.o.ctx.currentTime);

    const semitones = jitter(this.o.rng, spec.pitchJitterSemitones ?? 0.6);
    const rate = (opts.rate ?? 1) * Math.pow(2, semitones / 12);
    if (source.playbackRate) {
      source.playbackRate.value = Math.max(0.0625, rate);
    }

    // Bright noise/hiss content (most energy above ~4 kHz) is what reads as
    // "shrill": tame it with a gentle low-pass in front of the voice gain.
    let filter: SoundNodeLike | undefined;
    if (buffer !== undefined && isHarsh(buffer) && typeof this.o.ctx.createBiquadFilter === "function") {
      const lp = this.o.ctx.createBiquadFilter() as unknown as SoundBiquadLike;
      lp.type = "lowpass";
      if (lp.frequency) lp.frequency.value = HARSH_LOWPASS_HZ;
      if (lp.Q) lp.Q.value = 0.7;
      filter = lp;
    }
    if (filter) {
      (source as unknown as { connect(d: SoundNodeLike): unknown }).connect(filter);
      filter.connect(gain);
    } else {
      (source as unknown as { connect(d: SoundNodeLike): unknown }).connect(gain);
    }
    (gain as unknown as { connect(d: SoundNodeLike): unknown }).connect(destination);

    const record: VoiceRecord = {
      id: this.nextId++,
      cueId,
      priority: priorityOf(spec.priority),
      startedAt: now,
      source,
      gain: gain as unknown as VoiceRecord["gain"],
      targetGain,
      loop: source.loop ?? false,
      ended: false
    };
    source.onended = () => {
      record.ended = true;
      this.release(record);
    };
    this.live.add(record);
    cueLive.add(record);
    this.playedCount += 1;
    return { dropped: false, record, stolen, evicted };
  }

  /**
   * Stop a voice. The gain ramps to 0 over RELEASE_S before the source stops
   * (a hard stop mid-waveform clicks); nodes disconnect once it has ended.
   */
  release(record: VoiceRecord): void {
    if (!this.live.has(record)) return;
    this.live.delete(record);
    this.perCue.get(record.cueId)?.delete(record);
    record.ended = true;
    const now = this.o.ctx.currentTime;
    const stopAt = rampOut(record.gain as unknown as GainParamOwner, now);
    const cleanup = () => {
      try {
        record.source.disconnect();
        record.gain.disconnect();
      } catch {
        /* noop */
      }
    };
    try {
      record.source.onended = cleanup;
      record.source.stop(stopAt);
    } catch {
      /* already stopped */
      record.source.onended = null;
      cleanup();
    }
  }

  releaseAll(): void {
    for (const record of [...this.live]) this.release(record);
  }

  private pickerFor(cueId: string, spec: VoiceCueSpec): VariantPicker | undefined {
    const count = Array.isArray(spec.asset) ? spec.asset.length : spec.asset ? 1 : 0;
    if (count <= 1) return undefined;
    let picker = this.pickers.get(cueId);
    if (!picker) {
      picker = new VariantPicker(count, this.o.rng);
      this.pickers.set(cueId, picker);
    }
    return picker;
  }
}

const oldest = (records: Set<VoiceRecord>): VoiceRecord | undefined => {
  let best: VoiceRecord | undefined;
  for (const r of records) if (!best || r.startedAt < best.startedAt) best = r;
  return best;
};

const lowestPriorityOldest = (records: Set<VoiceRecord>): VoiceRecord | undefined => {
  let best: VoiceRecord | undefined;
  for (const r of records) {
    if (
      !best ||
      r.priority < best.priority ||
      (r.priority === best.priority && r.startedAt < best.startedAt)
    ) {
      best = r;
    }
  }
  return best;
};

const resolveBuffer = (
  asset: VoiceCueSpec["asset"],
  picker: VariantPicker | undefined,
  bufferFor: (url: string) => AudioBuffer | undefined
): AudioBuffer | undefined => {
  if (!asset) return undefined;
  const list = Array.isArray(asset) ? asset : [asset];
  const index = picker ? picker.next() : 0;
  const chosen = list[index] ?? list[0];
  return (chosen as { buffer?: AudioBuffer }).buffer ?? bufferFor(chosen.url);
};

// ---- envelopes + content conditioning --------------------------------------

/** Voice attack (s): long enough to kill the onset click, short enough to keep transients. */
export const ATTACK_S = 0.004;
/** Voice release (s) on stop / steal / eviction. */
export const RELEASE_S = 0.015;
/** Low-pass corner for bright (noise/hiss) buffers. */
export const HARSH_LOWPASS_HZ = 6500;

export interface GainParamOwner {
  readonly gain: {
    value: number;
    cancelScheduledValues?(t: number): void;
    setValueAtTime?(v: number, t: number): void;
    linearRampToValueAtTime?(v: number, t: number): void;
  };
}

/** Ramp a fresh voice gain 0 → target over ATTACK_S (falls back to a direct set). */
export function rampIn(node: GainParamOwner, target: number, now: number): void {
  const g = node.gain;
  if (g.setValueAtTime && g.linearRampToValueAtTime) {
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(target, now + ATTACK_S);
  } else {
    g.value = target;
  }
}

/** Ramp a voice gain to 0 over RELEASE_S; returns the context time to stop the source at. */
export function rampOut(node: GainParamOwner, now: number): number {
  const g = node.gain;
  if (!g.setValueAtTime || !g.linearRampToValueAtTime) return now;
  g.cancelScheduledValues?.(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0, now + RELEASE_S);
  return now + RELEASE_S;
}

type BufferLike = Pick<AudioBuffer, "length" | "sampleRate" | "numberOfChannels"> & {
  getChannelData?(channel: number): Float32Array;
};

const harshCache = new WeakMap<object, boolean>();

/**
 * Brightness test on channel 0: the energy of the first difference relative to
 * the signal energy. A sine at f gives (2·sin(πf/sr))²: ≈0.03 at 1 kHz, ≈0.32
 * at 4 kHz, 2 for white noise. Above 0.6 most of the energy sits above ~5 kHz.
 */
export function brightnessRatio(buffer: BufferLike): number {
  if (typeof buffer.getChannelData !== "function" || buffer.length < 2) return 0;
  const d = buffer.getChannelData(0);
  let e = 0;
  let de = 0;
  for (let i = 1; i < d.length; i++) {
    e += d[i] * d[i];
    const diff = d[i] - d[i - 1];
    de += diff * diff;
  }
  return e > 1e-12 ? de / e : 0;
}

export const HARSH_BRIGHTNESS = 0.6;

export function isHarsh(buffer: AudioBuffer): boolean {
  const key = buffer as unknown as object;
  let v = harshCache.get(key);
  if (v === undefined) {
    v = brightnessRatio(buffer) > HARSH_BRIGHTNESS;
    harshCache.set(key, v);
  }
  return v;
}

const seamCache = new WeakMap<object, AudioBuffer>();

/**
 * Loop-seam repair. When |last − first| sample is far above the local step
 * size the loop clicks every cycle. The repaired copy is N samples shorter:
 * its first N samples crossfade (equal power) from the original tail into the
 * original head, so the wrap from sample L−N−1 → 0 is continuous.
 * Buffers that already loop cleanly are returned unchanged.
 */
export function seamlessLoopBuffer(
  ctx: { createBuffer?(channels: number, length: number, sampleRate: number): AudioBuffer },
  buffer: AudioBuffer
): AudioBuffer {
  const key = buffer as unknown as object;
  const cached = seamCache.get(key);
  if (cached) return cached;
  let out = buffer;
  const b = buffer as unknown as BufferLike;
  if (typeof b.getChannelData === "function" && typeof ctx.createBuffer === "function" && b.length >= 64) {
    let worst = 0;
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c);
      const L = d.length;
      let step = 0;
      for (let i = 1; i < 32; i++) step += Math.abs(d[i] - d[i - 1]) + Math.abs(d[L - i] - d[L - i - 1]);
      step /= 62;
      const jump = Math.abs(d[L - 1] - d[0]);
      worst = Math.max(worst, jump > 0.004 && jump > 6 * step ? 1 : 0);
    }
    if (worst > 0) {
      const n = Math.min(Math.round(b.sampleRate * 0.03), Math.floor(b.length / 4));
      const len = b.length - n;
      const fixed = ctx.createBuffer(b.numberOfChannels, len, b.sampleRate);
      for (let c = 0; c < b.numberOfChannels; c++) {
        const src = b.getChannelData(c);
        const dst = (fixed as unknown as BufferLike).getChannelData!(c);
        for (let i = 0; i < len; i++) dst[i] = src[i];
        for (let i = 0; i < n; i++) {
          const t = ((i + 0.5) / n) * Math.PI * 0.5;
          dst[i] = src[i] * Math.sin(t) + src[len + i] * Math.cos(t);
        }
      }
      out = fixed;
    }
  }
  seamCache.set(key, out);
  return out;
}
