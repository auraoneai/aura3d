import type { FighterDef } from "./fighters";
import { moveFor, type AttackKind, type IronMove } from "./moves";

/**
 * Pure bout rules for Iron Crown, split out of main.ts so they have unit tests (tests/unit/iron-crown/rules.test.ts).
 */

export const METER_MAX = 100;
export const ROUNDS_TO_WIN = 2;

/** A special costs a full SUPER meter, for the player and the CPU alike (audit IC-02). */
export function canUseSpecial(meter: number): boolean {
  return meter >= METER_MAX;
}

/**
 * The move as it lands on `target`: damage scaled by the target's defense before the engine applies it, so the engine's
 * own knockout check sees the real damage (audit IC-03; the engine latches `knockedOut` on raw damage and cannot unset it).
 */
export function moveAgainst(kind: AttackKind, attacker: FighterDef, target: FighterDef): IronMove {
  const move = moveFor(kind, attacker);
  return { ...move, damage: (move.damage ?? 0) * target.stats.defense };
}

/** KO slow motion: one time-scale source only, and none under reduced motion (audit IC-08). */
export function koSlowMo(reducedMotion: boolean): { readonly scale: number; readonly ms: number } | null {
  return reducedMotion ? null : { scale: 0.28, ms: 1400 };
}

/**
 * Combo count after a hit. A hit extends the combo only while the target is still in hitstun from the previous hit;
 * otherwise it starts a new combo at 1 (audit IC-18).
 */
export function nextComboCount(previous: number, targetWasInHitstun: boolean): number {
  return targetWasInHitstun && previous > 0 ? previous + 1 : 1;
}

/** Time-up winner by remaining health share; equal shares draw. */
export function timeUpWinner(p1HealthPct: number, cpuHealthPct: number): "p1" | "cpu" | "draw" {
  if (Math.abs(p1HealthPct - cpuHealthPct) < 0.001) return "draw";
  return p1HealthPct > cpuHealthPct ? "p1" : "cpu";
}

/** Pips after a round; a draw awards nothing. */
export function awardRound(pips: { p1: number; cpu: number }, winner: "p1" | "cpu" | "draw"): { p1: number; cpu: number; boutOver: boolean; p1Won: boolean } {
  const p1 = pips.p1 + (winner === "p1" ? 1 : 0);
  const cpu = pips.cpu + (winner === "cpu" ? 1 : 0);
  return { p1, cpu, boutOver: p1 >= ROUNDS_TO_WIN || cpu >= ROUNDS_TO_WIN, p1Won: p1 >= ROUNDS_TO_WIN };
}

export interface HoldBackResult {
  /** The fighter guards (blocks high, or low when crouching). */
  readonly guard: boolean;
  /** Walking back while guarding is allowed, at `BACK_WALK_SCALE` speed. */
  readonly walkBack: boolean;
  /** Dash direction for a dash press: away from the foe when holding back, else toward. */
  readonly dashDir: -1 | 1;
}

export const BACK_WALK_SCALE = 0.6;

/**
 * Player guard and movement from the stick (audit IC-06). Holding away from the foe guards and walks back at 60% speed;
 * the guard key blocks in place; Shift while holding away is a back-dash.
 */
export function resolveHoldBack(axis: number, foeDir: 1 | -1, guardHeld: boolean): HoldBackResult {
  const holdingAway = axis !== 0 && Math.sign(axis) === -foeDir;
  return {
    guard: guardHeld || holdingAway,
    walkBack: holdingAway && !guardHeld,
    dashDir: holdingAway ? (-foeDir as -1 | 1) : foeDir
  };
}

/**
 * The 1.6 s bout-result card timer. A new bout bumps the serial and cancels the pending card, so a stale card cannot appear
 * over the next bout or advance a Ladder rung twice (audit IC-04).
 */
export interface BoutResultTimer {
  schedule(run: () => void, ms: number): void;
  cancel(): void;
  readonly pending: boolean;
  readonly serial: number;
}

export function createBoutResultTimer(
  timers: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void } = {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>)
  }
): BoutResultTimer {
  let handle: unknown;
  let serial = 0;
  return {
    schedule(run, ms) {
      if (handle !== undefined) timers.clearTimeout(handle);
      const mine = ++serial;
      handle = timers.setTimeout(() => {
        if (mine !== serial) return;
        handle = undefined;
        run();
      }, ms);
    },
    cancel() {
      serial += 1;
      if (handle !== undefined) timers.clearTimeout(handle);
      handle = undefined;
    },
    get pending() {
      return handle !== undefined;
    },
    get serial() {
      return serial;
    }
  };
}

/** Hit cue per move kind (audit IC-17). */
export function hitCueFor(moveId: string | undefined): "hit-light" | "hit" | "hit-heavy" | "hit-special" {
  if (!moveId) return "hit";
  if (moveId.endsWith("-light")) return "hit-light";
  if (moveId.endsWith("-heavy") || moveId.endsWith("-throw")) return "hit-heavy";
  if (moveId.endsWith("-special")) return "hit-special";
  return "hit";
}
