/**
 * Gridlock Courier: the courier shift, pure and deterministic (no DOM, no clock).
 *
 * A run is a timed shift (3:00 by default). Delivery jobs come one at a time: drive to the drop-off marker before the
 * job clock runs out and the job pays 300 plus 10 per second left. Drifting builds a drift chain that is banked as
 * score once the car has stopped drifting for `DRIFT_BANK_DELAY` seconds. The shift ends when the clock reaches zero
 * or when every pickup in the city has been collected; the app then shows the results screen.
 */
import { STREET_LINES, noise } from "./world";

export const SHIFT_SECONDS = 180;
export const JOB_SECONDS = 50;
/** A delivery counts when the car is this close to the drop-off, metres. */
export const DROP_RADIUS = 6;
export const DROP_MIN = 140;
export const DROP_MAX = 320;
/** Seconds without drifting after which the drift chain is banked. */
export const DRIFT_BANK_DELAY = 0.6;
/** Drift points per metre travelled while drifting. */
export const DRIFT_POINTS_PER_M = 1.5;

export interface Job {
  /** 1-based job number in this shift. */
  n: number;
  x: number;
  z: number;
  timeLeft: number;
}

export type EndReason = "time" | "cleared";

export interface ShiftState {
  length: number;
  timeLeft: number;
  elapsed: number;
  deliveries: number;
  missed: number;
  job: Job | null;
  /** Drift points in the current chain (not banked yet). */
  drift: number;
  driftIdle: number;
  bestStreak: number;
  over: boolean;
  reason: EndReason | null;
}

export type ShiftEvent =
  | { kind: "job"; job: Job }
  | { kind: "delivered"; score: number; job: Job }
  | { kind: "missed"; job: Job }
  | { kind: "drift"; score: number }
  | { kind: "over"; reason: EndReason };

export interface ShiftCar {
  x: number;
  z: number;
  speed: number;
  drifting: boolean;
}

export interface ShiftContext {
  combo: number;
  collected: number;
  total: number;
}

/** Mid-block points on every street centre line: the drop-off candidates. */
const DROP_POINTS: readonly { x: number; z: number }[] = (() => {
  const out: { x: number; z: number }[] = [];
  for (const line of STREET_LINES) {
    if (Math.abs(line) > 420) continue;
    for (let j = -7; j <= 7; j++) {
      out.push({ x: line, z: j * 60 }, { x: j * 60, z: line });
    }
  }
  return out;
})();

/** Deterministic drop-off for job `n`, between `DROP_MIN` and `DROP_MAX` metres from `from` along a street. */
export function dropoffFor(n: number, from: { x: number; z: number }): { x: number; z: number } {
  const pool = DROP_POINTS.filter((p) => {
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    return d >= DROP_MIN && d <= DROP_MAX;
  });
  const list = pool.length > 0 ? pool : DROP_POINTS;
  return list[Math.floor(noise(n * 4.7 + 1.3) * list.length)]!;
}

export function createShift(length = SHIFT_SECONDS): ShiftState {
  return { length, timeLeft: length, elapsed: 0, deliveries: 0, missed: 0, job: null, drift: 0, driftIdle: 0, bestStreak: 0, over: false, reason: null };
}

/** Delivery reward: 300 plus 10 per whole second left on the job clock. */
export const deliveryScore = (timeLeft: number): number => 300 + 10 * Math.floor(Math.max(0, timeLeft));

function newJob(s: ShiftState, from: { x: number; z: number }): Job {
  const n = s.deliveries + s.missed + 1;
  const p = dropoffFor(n, from);
  return { n, x: p.x, z: p.z, timeLeft: JOB_SECONDS };
}

/** One fixed step of the shift. Returns what happened; the app adds the scores and shows the popups. */
export function stepShift(s: ShiftState, dt: number, car: ShiftCar, ctx: ShiftContext): ShiftEvent[] {
  if (s.over) return [];
  const events: ShiftEvent[] = [];
  s.elapsed += dt;
  s.timeLeft = Math.max(0, s.length - s.elapsed);
  s.bestStreak = Math.max(s.bestStreak, ctx.combo);

  if (!s.job) {
    s.job = newJob(s, car);
    events.push({ kind: "job", job: s.job });
  } else {
    s.job.timeLeft -= dt;
    if (Math.hypot(car.x - s.job.x, car.z - s.job.z) < DROP_RADIUS) {
      const done = s.job;
      s.deliveries++;
      events.push({ kind: "delivered", score: deliveryScore(done.timeLeft), job: done });
      s.job = newJob(s, car);
      events.push({ kind: "job", job: s.job });
    } else if (s.job.timeLeft <= 0) {
      const lost = s.job;
      s.missed++;
      events.push({ kind: "missed", job: lost });
      s.job = newJob(s, car);
      events.push({ kind: "job", job: s.job });
    }
  }

  if (car.drifting) {
    s.drift += Math.abs(car.speed) * dt * DRIFT_POINTS_PER_M;
    s.driftIdle = 0;
  } else if (s.drift > 0) {
    s.driftIdle += dt;
    if (s.driftIdle >= DRIFT_BANK_DELAY) {
      const score = Math.round(s.drift);
      s.drift = 0;
      s.driftIdle = 0;
      if (score > 0) events.push({ kind: "drift", score });
    }
  }

  const reason: EndReason | null = ctx.collected >= ctx.total ? "cleared" : s.timeLeft <= 0 ? "time" : null;
  if (reason) {
    if (s.drift > 0) {
      const score = Math.round(s.drift);
      s.drift = 0;
      if (score > 0) events.push({ kind: "drift", score });
    }
    s.over = true;
    s.reason = reason;
    events.push({ kind: "over", reason });
  }
  return events;
}

/** `m:ss` for the HUD clock. */
export function formatClock(seconds: number): string {
  const t = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Best score kept in localStorage; failures (private mode, no storage) fall back to the in-memory value. */
export function recordBest(storage: Pick<Storage, "getItem" | "setItem"> | null, key: string, score: number): { best: number; isNew: boolean } {
  let previous = 0;
  try {
    previous = Number(storage?.getItem(key) ?? 0) || 0;
  } catch {
    previous = 0;
  }
  const isNew = score > previous;
  const best = Math.max(previous, score);
  if (isNew) {
    try {
      storage?.setItem(key, String(best));
    } catch {
      /* storage unavailable: keep the in-memory best */
    }
  }
  return { best, isNew };
}
