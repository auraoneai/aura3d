// Aura FC 3D — FC47-C1 goal replay (GU47 WP-19, lane g09).
//
// A render-side ring buffer of sim snapshots: after the sim steps, main.ts records a copy of the players and the
// ball; on a goal it plays the last REPLAY_HISTORY_S seconds back at REPLAY_SPEED while the sim sits in its 3 s goal
// phase. Read-only (PRD D8): the sim never reads the buffer, so replays and reference hashes are unchanged.

import type { BallState, MatchState, PlayerState } from "./types";

/** Seconds of play kept in the buffer. */
export const REPLAY_BUFFER_S = 4;
/** Seconds of play a goal replay shows (the run-up, the strike, the net). */
export const REPLAY_HISTORY_S = 2.4;
/** Playback rate: 2.4 s of play over 3.0 s, the length of the sim's goal phase (sim.ts `phaseT > 3.0`). */
export const REPLAY_SPEED = 0.8;
export const REPLAY_PLAYBACK_S = REPLAY_HISTORY_S / REPLAY_SPEED;
/** A goal replays only when the buffer holds at least this much play (a goal straight after a kickoff skips it). */
export const REPLAY_MIN_HISTORY_S = 1.2;

export type ReplayBall = Pick<BallState, "x" | "y" | "z" | "rotX" | "rotY" | "rotZ">;
export interface ReplayFrame {
  /** Sim time of the snapshot (MatchState.simT). */
  readonly t: number;
  readonly ball: ReplayBall;
  readonly players: readonly PlayerState[];
}

export interface ReplayPlayback {
  readonly from: number;
  readonly to: number;
  readonly duration: number;
}

export interface ReplayBuffer {
  /** Copy the state into the ring (call once per rendered frame after the sim stepped). */
  record(state: Pick<MatchState, "simT" | "ball" | "players">): void;
  clear(): void;
  readonly size: number;
  /** Seconds of play between the oldest and newest snapshot. */
  span(): number;
  /** Plan a replay of the last `history` seconds, or null when the buffer holds less than REPLAY_MIN_HISTORY_S. */
  plan(history?: number, speed?: number): ReplayPlayback | null;
  /** The snapshot shown `elapsed` seconds into a playback (latest snapshot at or before its sim time). */
  sample(playback: ReplayPlayback, elapsed: number): ReplayFrame | null;
}

export function createReplayBuffer(capacity = 300): ReplayBuffer {
  const ring: (ReplayFrame | undefined)[] = new Array(capacity);
  let head = 0;   // next write slot
  let count = 0;
  const at = (i: number): ReplayFrame => ring[(head - count + i + capacity) % capacity] as ReplayFrame;

  const buffer: ReplayBuffer = {
    record(state) {
      const last = count > 0 ? at(count - 1) : undefined;
      if (last && state.simT <= last.t) return;   // no sim step since the last record (pause, hit-stop, menu)
      const b = state.ball;
      ring[head] = {
        t: state.simT,
        ball: { x: b.x, y: b.y, z: b.z, rotX: b.rotX, rotY: b.rotY, rotZ: b.rotZ },
        players: state.players.map((p) => ({ ...p }))
      };
      head = (head + 1) % capacity;
      count = Math.min(count + 1, capacity);
      // drop snapshots older than the buffer window
      while (count > 1 && state.simT - at(0).t > REPLAY_BUFFER_S) count--;
    },
    clear() { count = 0; head = 0; ring.fill(undefined); },
    get size() { return count; },
    span() { return count > 1 ? at(count - 1).t - at(0).t : 0; },
    plan(history = REPLAY_HISTORY_S, speed = REPLAY_SPEED) {
      if (buffer.span() < REPLAY_MIN_HISTORY_S) return null;
      const to = at(count - 1).t;
      const from = Math.max(at(0).t, to - history);
      return { from, to, duration: (to - from) / speed };
    },
    sample(playback, elapsed) {
      if (count === 0) return null;
      const span = playback.to - playback.from;
      const want = playback.from + Math.min(span, Math.max(0, elapsed) * (span / Math.max(1e-6, playback.duration)));
      // binary search: latest snapshot with t <= want
      let lo = 0, hi = count - 1;
      if (at(0).t > want) return at(0);
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (at(mid).t <= want) lo = mid; else hi = mid - 1;
      }
      return at(lo);
    }
  };
  return buffer;
}
