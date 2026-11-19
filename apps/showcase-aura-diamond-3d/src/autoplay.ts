/**
 * Aura Diamond 3D hands-free autoplay (`?autoplay=1`, aliases `?autopilot=1` and `?demo=1`; the P key toggles it in game).
 * The CPU bats, pitches and fields for the player's club through the game's normal input path (main.ts autopilot), and
 * these pure rules keep the loop going forever: a menu starts a match by itself, a final holds its results ~3 s and then
 * the next ballpark plays, and a phase that stops moving is kicked back to the next pitch. Normal play never reads them.
 */
import { PARK_ORDER, type ParkId } from "./rules";

/** URL flags that turn autoplay on at boot. */
export const AUTOPLAY_PARAMS = ["autoplay", "autopilot", "demo"] as const;
/** Seconds the results card stays up before the next match starts. */
export const AUTOPLAY_RESULTS_SEC = 3;
/** Seconds an open menu waits before autoplay starts the pending mode. */
export const AUTOPLAY_MENU_SEC = 1;
/** Last-resort watchdog: seconds without any sim progress before autoplay resets to the next pitch. */
export const AUTOPLAY_STALL_SEC = 8;
/** The in-game key that toggles autoplay. */
export const AUTOPLAY_TOGGLE_KEY = "KeyP";

export function autoplayRequested(search: string): boolean {
  const p = new URLSearchParams(search);
  return AUTOPLAY_PARAMS.some((k) => p.get(k) === "1" || p.get(k) === "true");
}

/** The ballpark the next autoplay match plays in: the next one in order, or the same park when `?park=` pinned it. */
export function nextAutoplayPark(current: ParkId, pinned: boolean): ParkId {
  if (pinned) return current;
  const i = PARK_ORDER.indexOf(current);
  return PARK_ORDER[(i + 1) % PARK_ORDER.length]!;
}

/**
 * Counts sim seconds since the progress signature last changed. `note` returns true once the signature has been frozen
 * for `limit` seconds (and restarts the count), so the caller can recover.
 */
export class AutoplayWatchdog {
  private last = "";
  private still = 0;
  recoveries = 0;
  constructor(private readonly limit = AUTOPLAY_STALL_SEC) {}
  note(signature: string, dt: number): boolean {
    if (signature !== this.last) {
      this.last = signature;
      this.still = 0;
      return false;
    }
    this.still += dt;
    if (this.still < this.limit) return false;
    this.still = 0;
    this.recoveries += 1;
    return true;
  }
  reset(): void {
    this.last = "";
    this.still = 0;
  }
}

/**
 * Capture shortcut `?finishAfter=<sec>` (QA only): after that many sim seconds of live play the match ends on its current
 * score and the results card stays up (autoplay does not advance), so the final screen can be captured on a real GPU
 * without playing three innings. Returns null when absent or not a positive number; normal play never sets it.
 */
export function finishAfterSec(search: string): number | null {
  const raw = new URLSearchParams(search).get("finishAfter");
  if (raw === null || raw.trim() === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Whether autoplay leaves the results card for the next match: after AUTOPLAY_RESULTS_SEC, unless a capture holds it. */
export function autoplayLeavesResults(phaseT: number, autopilot: boolean, holdResults: boolean): boolean {
  return autopilot && !holdResults && phaseT > AUTOPLAY_RESULTS_SEC;
}
