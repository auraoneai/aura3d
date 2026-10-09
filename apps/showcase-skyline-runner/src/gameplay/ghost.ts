/**
 * Skyline Runner speedrun ghost (SR-A1).
 *
 * A translucent "echo" of the player's best finish, driven by *input replay*: the
 * recorder stores the per-tick input policy of a completed run, and playback drives a
 * second, fully separate `game.platformer` simulation with those recorded inputs.
 *
 * Visual-only contract (enforced structurally, not by discipline):
 * - The replay owns its own kit instance. No code path reads or writes the live
 *   run's snapshot, score, collected set, hazards, or events.
 * - The live run never reads ghost state. The renderer only positions an echo node.
 * - The replay cannot affect the 70-115s completion window: it advances on its own
 *   fixed-tick accumulator and stops when its recorded inputs are exhausted.
 *
 * Determinism: both recorder and replay quantize to `SKYLINE_GHOST_TICK_SECONDS`.
 * The exported timeline hash lets tests prove that export -> import reproduces the
 * identical x-timeline without any DOM or renderer.
 */
import { game } from "@aura3d/engine";
import { createSkylineLevel } from "./level";

/** Fixed simulation tick for recording and playback (60 Hz, matching the proof). */
export const SKYLINE_GHOST_TICK_SECONDS = 1 / 60;
export const SKYLINE_GHOST_RECORDING_VERSION = 1;
/** Storage key used by the route's localStorage-backed store. */
export const SKYLINE_GHOST_STORAGE_KEY = "skyline-runner.ghost-recording.v1";

export interface SkylineGhostTickInput {
  readonly moveX: number;
  readonly jumpPressed: boolean;
  readonly jumpHeld: boolean;
}

interface StoredGhostTick {
  /** Quantized horizontal axis (-1..1, two decimals). */
  readonly mx: number;
  readonly jp: boolean;
  readonly jh: boolean;
}

export interface SkylineGhostRecording {
  readonly version: typeof SKYLINE_GHOST_RECORDING_VERSION;
  /** Wall-clock seconds of the recorded run when the finish event fired. */
  readonly finishSeconds: number;
  readonly tickCount: number;
  readonly ticks: readonly StoredGhostTick[];
}

const MAX_DT = 0.25;
const QUANTUM = 100; // moveX quantization: two decimals.

function quantizeMoveX(moveX: number): number {
  const value = Number.isFinite(moveX) ? Math.max(-1, Math.min(1, moveX)) : 0;
  return Math.round(value * QUANTUM) / QUANTUM;
}

/**
 * Input recorder. Feed it the live player's input once per frame; it slices time
 * into fixed ticks and remembers one input snapshot per tick.
 */
export interface SkylineGhostRecorder {
  tick(dtSeconds: number, input: SkylineGhostTickInput): void;
  reset(): void;
  readonly pendingTickCount: number;
  /** Finalizes the recording; returns null when nothing usable was captured. */
  finalize(finishSeconds: number): SkylineGhostRecording | null;
}

export function createSkylineGhostRecorder(): SkylineGhostRecorder {
  let accumulator = 0;
  let ticks: StoredGhostTick[] = [];
  return {
    tick(dtSeconds, input) {
      const dt = Math.max(0, Math.min(MAX_DT, Number.isFinite(dtSeconds) ? dtSeconds : 0));
      accumulator += dt;
      const snapshot: StoredGhostTick = {
        mx: quantizeMoveX(input.moveX),
        jp: Boolean(input.jumpPressed),
        jh: Boolean(input.jumpHeld)
      };
      while (accumulator >= SKYLINE_GHOST_TICK_SECONDS) {
        accumulator -= SKYLINE_GHOST_TICK_SECONDS;
        ticks.push(snapshot);
        // Hard cap: ~4 minutes at 60 Hz. A recording longer than twice the proof
        // window is a bug, not a highlight.
        if (ticks.length >= 60 * 240) break;
      }
    },
    reset() {
      accumulator = 0;
      ticks = [];
    },
    get pendingTickCount() {
      return ticks.length;
    },
    finalize(finishSeconds) {
      if (ticks.length === 0) return null;
      const recording: SkylineGhostRecording = {
        version: SKYLINE_GHOST_RECORDING_VERSION,
        finishSeconds: Math.max(0, Math.round(Number(finishSeconds) * 1000) / 1000),
        tickCount: ticks.length,
        ticks
      };
      ticks = [];
      accumulator = 0;
      return recording;
    }
  };
}

/** True when `candidate` beats `existing` as the best (fastest) finish. */
export function shouldReplaceGhostRecording(
  existing: SkylineGhostRecording | null,
  candidate: SkylineGhostRecording
): boolean {
  if (!existing) return true;
  return candidate.finishSeconds < existing.finishSeconds;
}

export function serializeSkylineGhostRecording(recording: SkylineGhostRecording): string {
  return JSON.stringify(recording);
}

/** Parses and validates a stored recording. Throws on any structural corruption. */
export function parseSkylineGhostRecording(json: string): SkylineGhostRecording {
  const raw = JSON.parse(json) as Partial<SkylineGhostRecording>;
  if (!raw || typeof raw !== "object") throw new Error("Ghost recording is not an object.");
  if (raw.version !== SKYLINE_GHOST_RECORDING_VERSION) {
    throw new Error("Unsupported ghost recording version: " + String(raw.version));
  }
  if (typeof raw.finishSeconds !== "number" || !Number.isFinite(raw.finishSeconds) || raw.finishSeconds < 0) {
    throw new Error("Ghost recording finishSeconds is missing or invalid.");
  }
  if (!Array.isArray(raw.ticks) || raw.ticks.length === 0) {
    throw new Error("Ghost recording has no ticks.");
  }
  const ticks: StoredGhostTick[] = raw.ticks.map((tick) => {
    if (!tick || typeof tick !== "object") throw new Error("Ghost recording tick is malformed.");
    const mx = (tick as Partial<StoredGhostTick>).mx;
    if (typeof mx !== "number" || !Number.isFinite(mx) || mx < -1 || mx > 1) {
      throw new Error("Ghost recording tick moveX is out of range.");
    }
    return {
      mx,
      jp: Boolean((tick as Partial<StoredGhostTick>).jp),
      jh: Boolean((tick as Partial<StoredGhostTick>).jh)
    };
  });
  if (typeof raw.tickCount === "number" && raw.tickCount !== ticks.length) {
    throw new Error("Ghost recording tickCount does not match its ticks.");
  }
  return {
    version: SKYLINE_GHOST_RECORDING_VERSION,
    finishSeconds: raw.finishSeconds,
    tickCount: ticks.length,
    ticks
  };
}

/** Persistence seam so the core stays environment-agnostic (tests use memory). */
export interface SkylineGhostStore {
  load(): string | null;
  save(value: string): void;
}

export function createSkylineGhostMemoryStore(initial?: string): SkylineGhostStore {
  let value: string | null = initial ?? null;
  return {
    load: () => value,
    save(next) {
      value = next;
    }
  };
}

export interface SkylineGhostSnapshot {
  readonly x: number;
  readonly y: number;
  readonly vy: number;
  readonly grounded: boolean;
  readonly facing: number;
  readonly tickIndex: number;
  readonly tickCount: number;
  /** True once every recorded tick has been consumed. The echo then holds still. */
  readonly exhausted: boolean;
}

/**
 * Playback: replays recorded inputs through a dedicated kit instance at the fixed
 * tick, advancing on its own accumulator so live frame-rate jitter cannot distort
 * the echoed timeline.
 */
export interface SkylineGhostReplay {
  readonly recording: SkylineGhostRecording;
  advance(dtSeconds: number): SkylineGhostSnapshot;
  reset(): SkylineGhostSnapshot;
  snapshot(): SkylineGhostSnapshot;
}

export function createSkylineGhostReplay(recording: SkylineGhostRecording): SkylineGhostReplay {
  // A second instance of the route's own level. This is what makes the echo a real
  // traversal rather than an interpolated line, and what keeps it collision-free
  // relative to the live run: two simulations never share state.
  const level = createSkylineLevel();
  const platformer = game.platformer(level);
  let snapshot = platformer.snapshot();
  let tickIndex = 0;
  let accumulator = 0;

  const readSnapshot = (): SkylineGhostSnapshot => ({
    x: snapshot.player.x,
    y: snapshot.player.y,
    vy: snapshot.player.vy,
    grounded: snapshot.player.grounded,
    facing: tickIndex > 0 && recording.ticks[tickIndex - 1] ? Math.sign(recording.ticks[tickIndex - 1]!.mx) || 1 : 1,
    tickIndex,
    tickCount: recording.tickCount,
    exhausted: tickIndex >= recording.tickCount
  });

  const stepOnce = (): void => {
    const tick = recording.ticks[tickIndex];
    if (!tick) return;
    tickIndex += 1;
    snapshot = platformer.step(SKYLINE_GHOST_TICK_SECONDS, {
      moveX: tick.mx,
      jumpPressed: tick.jp,
      jumpHeld: tick.jh
    });
  };

  return {
    recording,
    advance(dtSeconds) {
      const dt = Math.max(0, Math.min(MAX_DT, Number.isFinite(dtSeconds) ? dtSeconds : 0));
      accumulator += dt;
      while (accumulator >= SKYLINE_GHOST_TICK_SECONDS && tickIndex < recording.tickCount) {
        accumulator -= SKYLINE_GHOST_TICK_SECONDS;
        stepOnce();
      }
      return readSnapshot();
    },
    reset() {
      platformer.reset();
      snapshot = platformer.snapshot();
      tickIndex = 0;
      accumulator = 0;
      return readSnapshot();
    },
    snapshot: readSnapshot
  };
}

/**
 * FNV-1a over the replayed x-timeline (sampled every 6 ticks), hex-encoded.
 * Exported for the round-trip unit contract: export -> import must reproduce the
 * identical hash.
 */
export function skylineGhostTimelineHash(recording: SkylineGhostRecording): string {
  const replay = createSkylineGhostReplay(recording);
  let hash = 0x811c9dc5;
  for (let index = 0; index < recording.tickCount; index += 1) {
    const snap = replay.advance(SKYLINE_GHOST_TICK_SECONDS);
    if (index % 6 !== 0) continue;
    // Quantize x to 1e-4 so float noise across machines cannot flip a bit.
    const quantized = Math.round(snap.x * 10000);
    for (let shift = 0; shift < 4; shift += 1) {
      hash ^= (quantized >> (shift * 8)) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}
