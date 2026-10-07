/**
 * PRD-15 T6.1 — report renderer for `aura3d migrate three`.
 *
 * Emits the per-construct row table ({construct, line, mapping, note}) as
 * JSON plus a one-line summary count per mapping class.
 */

import type { MigrateRow } from "./emit.js";

export interface MigrateReport {
  readonly rows: readonly MigrateRow[];
  readonly counts: { readonly exact: number; readonly approximate: number; readonly none: number };
}

export function buildMigrateReport(rows: readonly MigrateRow[]): MigrateReport {
  const counts = { exact: 0, approximate: 0, none: 0 };
  for (const row of rows) counts[row.mapping]++;
  return { rows, counts };
}

export function formatMigrateReport(report: MigrateReport): string {
  return JSON.stringify(report, null, 2);
}
