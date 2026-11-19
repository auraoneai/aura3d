import { STAGES, type StageId } from "./stages";

/**
 * Hands-free autoplay (owner addendum, 2026-11-18). `?autoplay=1` (standard), `?autopilot=1` (alias) and the original
 * `?demo=1` hand Player 1 to a CPU brain, so both fighters are AI. The bout starts on load (Iron Crown has no title
 * screen); after a bout the result card stays up for AUTOPLAY_RESULT_MS, then the next bout starts on the next venue.
 * Autoplay only chooses intents through the normal drive path (main.ts `driveFighter`), the same path the player's
 * keys use, so normal play is unchanged. The first fight key (or O) hands control back.
 */
/** The flag names and reader are the shared ones in `@aura3d/engine/game`. */
export { AUTOPLAY_FLAG_NAMES as AUTOPLAY_PARAMS, readAutoplayFlag as autoplayRequested } from "@aura3d/engine/game";

/** In-fight toggle. Only acts while no fight action is bound to it (players can rebind any key). */
export const AUTOPLAY_TOGGLE_KEY = "KeyO";

/** How long the result card stays up before autoplay starts the next bout. */
export const AUTOPLAY_RESULT_MS = 3000;

/** Venue tour order (the stage list: Neo-Tokyo, Bangkok, Colosseum, Airbase, Monastery, Crown Arena). */
export const AUTOPLAY_STAGE_ORDER: readonly StageId[] = Object.freeze(STAGES.map((stage) => stage.id));

export function nextAutoplayStage(current: StageId, order: readonly StageId[] = AUTOPLAY_STAGE_ORDER): StageId {
  if (order.length === 0) return current;
  return order[(order.indexOf(current) + 1) % order.length]!;
}

/** Hint suffix naming the toggle key, or "" once a fight action is bound to it. */
export function autoplayHint(boundKeys: ReadonlySet<string>, key: string = AUTOPLAY_TOGGLE_KEY): string {
  return boundKeys.has(key) ? "" : `${key.replace(/^Key/, "")} autoplay`;
}

/**
 * `?stage=<venue id>` (e.g. `neo-tokyo-rooftop`) opens the first bout on that venue instead of the Crown Arena: a QA and
 * share-link hook (unknown ids are ignored). Autoplay then tours on from it.
 */
export function stageFromParams(params: Pick<URLSearchParams, "get">): StageId | null {
  const raw = params.get("stage");
  return raw && STAGES.some((stage) => stage.id === raw) ? (raw as StageId) : null;
}
