/**
 * Score popups: a sim keeps only the last {@link POPUP_LIMIT} and never clears the list, so readers must drain by
 * `seq`, not by index. Extracted from the runner kit (`examples/shared/runner-kit/popups.ts`) in 5.7.0.
 */

/** One score popup a simulation emits (`+100`, `PERFECT`), drawn by the HUD. */
export interface ScorePopup {
  /** Numeric value (score delta or count). */
  n: number;
  /** Monotonic sequence number across the whole session; never reused after a restart. */
  seq: number;
  /** Text to show. */
  text: string;
  /** CSS colour. */
  color: string;
  /** Font size or scale the game interprets. */
  size: number;
  /** Simulation time (seconds) the popup was emitted. */
  at: number;
}

/** How many popups a simulation keeps in its rolling list. */
export const POPUP_LIMIT = 64;

/**
 * The popups the HUD has not shown yet, and the `nextSeq` to pass next time. Reading by index stalls for good once the
 * sim's list is full; reading by `seq` keeps working across restarts.
 *
 * @example
 * let nextSeq = 0;
 * const { fresh, nextSeq: after } = drainPopups(sim.popups, nextSeq); nextSeq = after;
 */
export function drainPopups<T extends { readonly seq: number }>(list: readonly T[], nextSeq: number): { fresh: T[]; nextSeq: number } {
  const fresh: T[] = [];
  for (const p of list) if (p.seq >= nextSeq) fresh.push(p);
  return { fresh, nextSeq: fresh.length > 0 ? (fresh[fresh.length - 1] as T).seq + 1 : nextSeq };
}
