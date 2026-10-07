/**
 * Siege Golf scoring — strokes, par, star ratings, round totals.
 *
 * Pure and route-local: no engine imports, no DOM, no physics. Every rule the
 * PRD names (par per hole, stroke limit par+4, star thresholds, round total)
 * lives here so unit tests can pin the math without a browser.
 */

/** Star rating for one completed hole. */
export type StarRating = 0 | 1 | 2 | 3;

export interface HoleScoreEntry {
  readonly holeIndex: number;
  readonly par: number;
  /** Strokes taken; undefined while the hole is still in progress. */
  readonly strokes: number | undefined;
}

/**
 * Stars for a completed hole. PRD section 3: strokes <= par is 3 stars,
 * <= par + 2 is 2 stars, otherwise 1 star. A failed hole (stroke limit) has
 * no stars: 0 means "hole failed", never awarded by completeHole.
 */
export function starsFor(strokes: number, par: number): StarRating {
  if (strokes <= par) return 3;
  if (strokes <= par + 2) return 2;
  return 1;
}

/** PRD: strokes exceed par + 4 -> hole failed. */
export function strokeLimit(par: number): number {
  return par + 4;
}

export function isHoleFailed(strokes: number, par: number): boolean {
  return strokes > strokeLimit(par);
}

/**
 * Result of finishing a hole within the stroke limit. The only path that
 * produces stars; failures are recorded separately by the hole flow.
 */
export function completeHole(entry: HoleScoreEntry): HoleScoreEntry & { readonly stars: StarRating } {
  if (entry.strokes === undefined) throw new Error("completeHole requires settled strokes.");
  if (isHoleFailed(entry.strokes, entry.par)) {
    throw new Error("completeHole must not be called on a failed hole; record a failure instead.");
  }
  return { ...entry, stars: starsFor(entry.strokes, entry.par) };
}

export interface RoundTotals {
  readonly holesCompleted: number;
  readonly holesFailed: number;
  readonly totalStrokes: number;
  readonly totalPar: number;
  readonly totalStars: number;
  readonly maxStars: number;
}

/** Sum a partial or full round. Failures contribute their strokes but zero stars. */
export function roundTotals(entries: readonly HoleScoreEntry[]): RoundTotals {
  let holesCompleted = 0;
  let holesFailed = 0;
  let totalStrokes = 0;
  let totalPar = 0;
  let totalStars = 0;
  let maxStars = 0;
  for (const entry of entries) {
    if (entry.strokes === undefined) continue;
    totalStrokes += entry.strokes;
    totalPar += entry.par;
    maxStars += 3;
    if (isHoleFailed(entry.strokes, entry.par)) {
      holesFailed += 1;
    } else {
      holesCompleted += 1;
      totalStars += starsFor(entry.strokes, entry.par);
    }
  }
  return { holesCompleted, holesFailed, totalStrokes, totalPar, totalStars, maxStars };
}

/** Relative-to-par label used on the result card ("-1", "E", "+3"). */
export function versusPar(strokes: number, par: number): string {
  const delta = strokes - par;
  if (delta === 0) return "E";
  return delta > 0 ? "+" + delta : String(delta);
}