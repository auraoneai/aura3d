/** Score popups: the sim keeps only the last `POPUP_LIMIT` and never clears the list, so readers must drain by `seq`, not by index. */

export interface Popup {
  n: number;
  seq: number;
  text: string;
  color: string;
  size: number;
  at: number;
}

export const POPUP_LIMIT = 64;

/**
 * The popups the HUD has not shown yet. Reading by index stalls for good once the sim's list is full;
 * reading by `seq` keeps working across restarts (Splat audit fix C2).
 */
export function drainPopups<T extends { readonly seq: number }>(list: readonly T[], nextSeq: number): { fresh: T[]; nextSeq: number } {
  const fresh: T[] = [];
  for (const p of list) if (p.seq >= nextSeq) fresh.push(p);
  return { fresh, nextSeq: fresh.length > 0 ? (fresh[fresh.length - 1] as T).seq + 1 : nextSeq };
}