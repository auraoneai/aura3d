import type { MatchEngineOptions } from "../contract/modules";

/** The live page's default player selection (player-select.js defaults: Valcera vs Nangong); it picks the ability profiles. */
export const DEFAULT_ROSTER = Object.freeze({ player: "alcatraz", ai: "zinner" }) as NonNullable<MatchEngineOptions["roster"]>;

/** Kit colours of the default roster's characters (player-characters.js entries `alcatraz` and `zinner`); the live page applies them as the match appearance. */
const CHARACTER_APPEARANCE = Object.freeze({
  alcatraz: Object.freeze({ skin: "medium", shirt: "sky", pants: "navy", shoes: "ivory" }),
  zinner: Object.freeze({ skin: "light", shirt: "clay", pants: "ivory", shoes: "ivory" })
});

/** The options the live page's `resetMatch` hands to the engine for an offline match (the practice coach keeps the neutral default look). */
export function matchResetOptions(options: Pick<MatchEngineOptions, "difficulty" | "venue" | "practice" | "allowSwipe" | "controlStyle">): MatchEngineOptions {
  return {
    ...options, roster: DEFAULT_ROSTER,
    appearance: { player: { ...CHARACTER_APPEARANCE.alcatraz }, ...(options.practice ? {} : { ai: { ...CHARACTER_APPEARANCE.zinner } }) }
  };
}

/** Marks the match's entrants with their character ids, as `resetMatch` in game.js does after the engine reset. */
export function applyCharacterIds(state: { player: object; ai: object }, practice: boolean): void {
  (state.player as { characterId?: string }).characterId = "alcatraz";
  if (!practice) (state.ai as { characterId?: string }).characterId = "zinner";
}
