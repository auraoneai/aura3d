/**
 * Aura Links 3D: the hands-free demo loop (`?autoplay=1`, aliases `?autopilot=1` and `?demo=1`; O toggles it in game).
 *
 * The autopilot only drives the game's normal input path: at address it plans the shot with the live sim
 * (game/autopilot.ts planShot: club, power and aim at the pin, putts out), turns the aim and starts the swing, and presses
 * the meter on the planned power and the centre of the needle (main.ts). This module decides WHEN it acts, so the loop
 * never sits on a menu or a prompt: it leaves the menu, starts the next round on the next course ~3 s after the card,
 * and a watchdog ends a flight that somehow never settles. Normal play never calls it, so its determinism is untouched.
 * Pure (no DOM, no engine): unit tested with the real sim (tests/unit/aura-links-3d/autoplay-loop.test.ts).
 */
import type { CourseId } from "./types";

export const AUTOPLAY_TIMING = {
  /** seconds at address before the autopilot swings (time to see the lie and the aim) */
  addressS: 1.35,
  /** seconds the final card shows before the next round starts */
  roundOverS: 3.2,
  /** seconds on the menu (no player input) before the demo goes back to playing */
  menuS: 2.5,
  /** a player's key, tap or click pauses the autopilot this long */
  manualGraceS: 2.2,
  /** a ball still moving after this long in flight/roll is settled where it is */
  flightWatchdogS: 45
} as const;

/** the URL switches the demo on: `?autoplay=1`, `?autopilot=1` or `?demo=1` (the shared reader in `@aura3d/engine/game`) */
export { readAutoplayFlag as autoplayRequested } from "@aura3d/engine/game";

export type AutoplayAction = "none" | "swing" | "next-round" | "leave-menu" | "settle-ball";

export interface AutoplayInput {
  readonly enabled: boolean;
  /** `?still` capture mode never plays */
  readonly still: boolean;
  readonly phase: string;
  readonly simTime: number;
  /** sim time the current phase began */
  readonly phaseEnteredAt: number;
  readonly lastManualInputAt: number;
}

/** what the autopilot does this frame */
export function autoplayAction(s: AutoplayInput): AutoplayAction {
  if (!s.enabled || s.still) return "none";
  if (s.simTime - s.lastManualInputAt <= AUTOPLAY_TIMING.manualGraceS) return "none";
  const inPhase = s.simTime - s.phaseEnteredAt;
  switch (s.phase) {
    case "address": return inPhase > AUTOPLAY_TIMING.addressS ? "swing" : "none";
    case "roundover": return inPhase > AUTOPLAY_TIMING.roundOverS ? "next-round" : "none";
    case "menu": return inPhase > AUTOPLAY_TIMING.menuS ? "leave-menu" : "none";
    case "flight": return inPhase > AUTOPLAY_TIMING.flightWatchdogS ? "settle-ball" : "none";
    default: return "none";
  }
}

/** the demo tours the courses: the next course in the order after `current` (wrapping) */
export function nextAutoplayCourse(order: readonly CourseId[], current: CourseId): CourseId {
  const i = order.indexOf(current);
  return order[(i + 1) % order.length] ?? current;
}
