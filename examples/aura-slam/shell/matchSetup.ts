import type { MatchEngineOptions } from "../contract/modules";

/** The live page's default player selection (player-select.js defaults: Valcera vs Nangong); it picks the ability profiles. */
export const DEFAULT_ROSTER = Object.freeze({ player: "alcatraz", ai: "zinner" }) as NonNullable<MatchEngineOptions["roster"]>;

/** The options the live page's `resetMatch` hands to the engine for an offline match. */
export function matchResetOptions(options: Pick<MatchEngineOptions, "difficulty" | "venue" | "practice" | "allowSwipe" | "controlStyle">): MatchEngineOptions {
  return { ...options, roster: DEFAULT_ROSTER };
}
