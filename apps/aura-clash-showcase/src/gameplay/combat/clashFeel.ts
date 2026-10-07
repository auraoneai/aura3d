/**
 * Presentation and rival-role helpers for the Aura Clash playable route.
 *
 * Hit-stop and the input buffer are feel only. They do not rewrite solver frame data
 * in `auraClashMoveData.ts`. Rival roles stay inside the current AI; `passive` still
 * disables guard and attacks for the deterministic test driver.
 */

export const CLASH_FRAME_SECONDS = 1 / 60;

/** 7 frames — fighter-length buffer, not the previous 800 ms hold. */
export const CLASH_INPUT_BUFFER_FRAMES = 7;
export const CLASH_INPUT_BUFFER_LIFETIME_MS = Math.round(CLASH_INPUT_BUFFER_FRAMES * CLASH_FRAME_SECONDS * 1000);

/** Presentation hit-stop in seconds. Stays inside a 2–8 frame window by strength. */
export const CLASH_HIT_STOP_SECONDS = {
  light: 4 * CLASH_FRAME_SECONDS,
  heavy: 6 * CLASH_FRAME_SECONDS,
  special: 8 * CLASH_FRAME_SECONDS
} as const;

export type ClashMoveId = keyof typeof CLASH_HIT_STOP_SECONDS;
export type RivalAiRole = "approach" | "space" | "punish-whiff" | "meaty-wakeup" | "neutral";

export interface RivalAiView {
  readonly distance: number;
  readonly opponentAlive: boolean;
  readonly playerAttacking: boolean;
  readonly playerWhiffing: boolean;
  readonly playerKnockdownRemaining: number;
  readonly playerWakeupInvulnerable: boolean;
  readonly playerGrounded: boolean;
}

export interface PlayableHudMode {
  readonly training: boolean;
  readonly evidence: boolean;
}

export function clashHitStopSeconds(id: ClashMoveId): number {
  return CLASH_HIT_STOP_SECONDS[id];
}

export function comboFlashText(count: number): string {
  if (count < 2) return "";
  return `${count} HIT`;
}

export function comboClockText(count: number): string {
  if (count < 2) return "";
  return `${count} HITS`;
}

export function readPlayableHudMode(location: { readonly pathname: string; readonly search: string }): PlayableHudMode {
  const params = new URLSearchParams(location.search);
  const training = params.has("debug") || params.has("auraTestDriver") || location.pathname.includes("/evidence/");
  return { training, evidence: training };
}

export function resolveRivalAiRole(view: RivalAiView): RivalAiRole {
  if (!view.opponentAlive) return "neutral";
  const meatyWindow = view.playerKnockdownRemaining > 0 && view.playerKnockdownRemaining <= 0.22;
  if (meatyWindow || (view.playerWakeupInvulnerable && view.playerGrounded && view.playerKnockdownRemaining === 0)) {
    return "meaty-wakeup";
  }
  if (view.playerWhiffing && view.distance <= 1.55) return "punish-whiff";
  if (view.distance > 1.42) return "approach";
  if (view.distance < 0.92) return "space";
  if (!view.playerAttacking && view.distance > 1.18) return "space";
  return "neutral";
}

export function rivalAiWantsDash(role: RivalAiRole, distance: number, incomingHeavy: boolean): boolean {
  if (incomingHeavy && distance < 1.1) return true;
  if (role === "approach" && distance > 1.72) return true;
  if (role === "space" && distance < 0.92) return true;
  if (role === "punish-whiff" && distance > 1.18) return true;
  return false;
}

export function rivalAiStrikeBias(role: RivalAiRole): { readonly light: number; readonly heavy: number; readonly special: number } {
  if (role === "punish-whiff") return { light: 1, heavy: 0.72, special: 0.28 };
  if (role === "meaty-wakeup") return { light: 0.92, heavy: 0.55, special: 0.12 };
  if (role === "approach") return { light: 0.55, heavy: 0.28, special: 0.16 };
  return { light: 1, heavy: 0.5, special: 0.3 };
}
