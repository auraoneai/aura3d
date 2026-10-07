/*
 * T3.13 — PRD-15's diagnostic-only option fields.
 *
 * Fields that `optionCoverage.test.ts` proved are accepted by a builder but
 * dropped by the compiler (deepDiff(sourceA, sourceB) === 0). Each entry names
 * the lane that owns wiring it; that lane clears the entry WITHOUT touching
 * this file by calling `registerOptionCoverage` for the field from its own
 * module — the arch gate then lists the stale entry and this lane deletes it
 * in the daily sweep.
 *
 * Keys use `${builder}.${field}` (or `${builder}.*` for a whole-builder claim).
 * Rows in the contract's DIAGNOSTIC_ONLY_FIELDS also apply (the test merges
 * both maps).
 */

export const PRD15_DIAGNOSTIC_ONLY_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {
  // Populated by the T3.13 discovery run; entries are removed when their owner
  // registers coverage from its own lane module.
};
