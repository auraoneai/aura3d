/**
 * Presentation-only HUD logic for Serpentine Sky Run: cues the simulation already decides but never showed (drowse,
 * wind gusts, the next gap), the end-of-run days bonus, the status text for assistive technology and the onboarding
 * prompts. Nothing here writes to the run state, so the recorded replay stays valid.
 */
import { ROAD_LENGTH, START_DAYS, roadGapAt, type RunState } from "./sim";

/** Drowse level at which the HUD warns. The run ends at 1 (sim.ts: "YOU FELL ASLEEP"). */
export const DROWSE_WARN = 0.5;
export const DROWSE_ALERT = "STAY AWAKE: SURGE";
/** Seconds of warning before a missing plate reaches the runner (C12). */
export const GAP_LEAD_SECONDS = 1.5;
/** Score per day left when the run reaches the tail (C5). */
export const DAYS_BONUS_PER_DAY = 25;

export interface DrowseCue {
  /** Opacity of the edge fade, 0 to 0.85. */
  readonly fade: number;
  /** Meter fill, 0 to 1. */
  readonly meter: number;
  readonly warn: boolean;
}

export function drowseCue(S: Pick<RunState, "drowse" | "phase">): DrowseCue {
  const d = S.phase === "run" ? Math.max(0, Math.min(1, S.drowse)) : 0;
  return { fade: +(0.85 * d * d).toFixed(3), meter: d, warn: d >= DROWSE_WARN };
}

/** The sim's gust (sim.ts, wind stages): positive pushes right. Null when the wind is below the sim's threshold. */
export function gustCue(S: Pick<RunState, "wind" | "time" | "phase">): { readonly dir: -1 | 1; readonly strength: number } | null {
  if (S.phase !== "run" || S.wind <= 0.05) return null;
  const gust = Math.sin(0.9 * S.time) * Math.sin(2.3 * S.time + 1.1);
  return { dir: gust < 0 ? -1 : 1, strength: Math.min(1, Math.abs(gust) * S.wind) };
}

/**
 * Distance (m) to the first missing plate within `GAP_LEAD_SECONDS` at the current speed, or null. Scans the same
 * `roadGapAt` the sim tests, so the warning matches the fall. Flight and the end of the road need no warning.
 */
export function gapAhead(S: Pick<RunState, "s" | "speed" | "phase" | "puff">, lead = GAP_LEAD_SECONDS): number | null {
  if (S.phase !== "run" || S.puff > 0) return null;
  const reach = Math.max(12, S.speed * lead);
  const first = roadGapAt(S.s) ? 0 : -1;
  if (first === 0) return null; // already over it
  for (let d = 1; d <= reach; d += 1) {
    const s = S.s + d;
    if (s >= ROAD_LENGTH) return null;
    if (roadGapAt(s)) return d;
  }
  return null;
}

export interface FinalScore {
  readonly score: number;
  readonly daysLeft: number;
  readonly daysBonus: number;
  readonly total: number;
}

/** Days left only pay out when the runner reaches the tail; a fall keeps the run score. */
export function finalScore(S: Pick<RunState, "score" | "days" | "phase">): FinalScore {
  const daysLeft = Math.max(0, Math.min(START_DAYS, S.days));
  const daysBonus = S.phase === "leap" ? Math.round(daysLeft) * DAYS_BONUS_PER_DAY : 0;
  return { score: Math.round(S.score), daysLeft, daysBonus, total: Math.round(S.score) + daysBonus };
}

/** Accessible name for the days card (P-2): words separated, numbers spelled with their units. */
export function daysStatusLabel(days: number, active: boolean): string {
  return `Days left: ${Math.round(days).toLocaleString("en-US")} days. ${active ? "Run active." : "Run over."}`;
}

export interface Prompt { readonly id: string; readonly text: string }

/**
 * First-run prompts (C12), shown once each in order while the condition holds: lane change and jump at the start,
 * surge once there is spark, flight once it is allowed, and a jump prompt at the first gap warning.
 */
export function onboardingPrompt(S: Pick<RunState, "s" | "ki" | "canFly" | "phase" | "puff" | "auraRung">, seen: ReadonlySet<string>, gap: number | null, touch: boolean): Prompt | null {
  if (S.phase !== "run") return null;
  const steps: Prompt[] = [
    { id: "lanes", text: touch ? "SWIPE LEFT OR RIGHT TO CHANGE LANE" : "A / D OR ARROWS: CHANGE LANE" },
    { id: "jump", text: touch ? "TAP TO JUMP, SWIPE DOWN TO SLIDE" : "SPACE: JUMP   S: SLIDE" }
  ];
  if (gap !== null && !seen.has("gap")) return { id: "gap", text: touch ? "GAP AHEAD: TAP TO JUMP" : "GAP AHEAD: JUMP" };
  if (S.s < 40) return steps.find((p) => !seen.has(p.id)) ?? null;
  if (S.ki >= 0.6 && S.auraRung === 0 && !seen.has("surge")) return { id: "surge", text: touch ? "SURGE BUTTON: BURN SPARK FOR SPEED" : "SHIFT: SURGE FOR SPEED AND SCORE" };
  if (S.canFly && S.puff <= 0 && S.ki > 0.28 && !seen.has("fly")) return { id: "fly", text: touch ? "FLY BUTTON, THEN HOLD LEFT OR RIGHT TO STEER" : "E: FLY, HOLD W A S D TO STEER" };
  return null;
}
