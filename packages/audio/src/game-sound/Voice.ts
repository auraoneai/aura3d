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
import type { SoundGraphContext, SoundNodeLike, SoundSourceLike } from "./types";

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
    const buffer = resolveBuffer(spec.asset, this.pickerFor(cueId, spec), this.o.bufferFor);
    if (buffer !== undefined) source.buffer = buffer;
    source.loop = opts.loop ?? spec.loop ?? false;

    const gain = this.o.ctx.createGain() as unknown as SoundNodeLike;
    const gainDb =
      (spec.volumeDb ?? 0) + (opts.volumeDb ?? 0) + jitter(this.o.rng, spec.gainJitterDb ?? 1.5);
    (gain as unknown as { gain: { value: number } }).gain.value = clamp(dbToGain(gainDb), 0, 4);

    const semitones = jitter(this.o.rng, spec.pitchJitterSemitones ?? 0.6);
    const rate = (opts.rate ?? 1) * Math.pow(2, semitones / 12);
    if (source.playbackRate) {
      source.playbackRate.value = Math.max(0.0625, rate);
    }

    (source as unknown as { connect(d: SoundNodeLike): unknown }).connect(gain);
    (gain as unknown as { connect(d: SoundNodeLike): unknown }).connect(destination);

    const record: VoiceRecord = {
      id: this.nextId++,
      cueId,
      priority: priorityOf(spec.priority),
      startedAt: now,
      source,
      gain: gain as unknown as VoiceRecord["gain"],
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

  /** Stop a voice with an optional fade — callers own the gain envelope. */
  release(record: VoiceRecord): void {
    if (!this.live.has(record)) return;
    this.live.delete(record);
    this.perCue.get(record.cueId)?.delete(record);
    record.ended = true;
    try {
      record.source.onended = null;
      record.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      record.source.disconnect();
      record.gain.disconnect();
    } catch {
      /* noop */
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
