/**
 * Hands-free play (`?autoplay=1`, alias `?autopilot=1`; the P key toggles it in game). The lane-follow bot (`bot.ts`)
 * drives the craft through the game's normal input path (main.ts `sampleInput`), so the sim, its determinism and the
 * recorded replays are untouched; when the results open it holds them for `resultsSeconds` and asks for a restart, so the
 * run loops forever. Pure: no DOM, so a unit test drives the real sim with it.
 */
import { createBot } from "./bot";
import type { Race } from "./race";
import type { Input } from "./vehicle";

export const AUTOPLAY = {
  /**
   * cruise cap (m/s): the pace the bot races finish gold at (tests/unit/heatsink-port/bot-race.test.ts). At this pace the
   * bot kills every strike target before it reaches it, so it never rams one (a craft that touches a live target shatters
   * it at half value, operation.ts `craftTouchesTarget`; autoplay.test.ts pins the bot shoots them instead). Steering
   * around live targets cost it kills and rammed barrels.
   */
  speed: 80,
  /** seconds the results card stays up before the next race starts */
  resultsSeconds: 3,
  key: "KeyP"
} as const;

/** true when the URL asks for hands-free play */
export const autoplayRequested = (params: URLSearchParams): boolean => params.get("autoplay") === "1" || params.get("autopilot") === "1";

export interface Autoplay {
  /** the bot's input for this fixed step */
  input(race: Race): Input;
  /** advance the results hold by `dt` render seconds; true once the next race should start (then call `reset`) */
  shouldRestart(race: Race, dt: number): boolean;
  reset(): void;
}

export function createAutoplay(): Autoplay {
  const bot = createBot({ speed: AUTOPLAY.speed });
  let held = 0;
  return {
    input: (race) => bot(race),
    shouldRestart(race, dt) {
      if (!race.resultsOpen) { held = 0; return false; }
      held += dt;
      return held >= AUTOPLAY.resultsSeconds;
    },
    reset() { held = 0; }
  };
}
