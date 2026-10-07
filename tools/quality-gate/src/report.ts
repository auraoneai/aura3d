/**
 * T3.5 — step summary table for $GITHUB_STEP_SUMMARY plus per-item trend SVGs
 * (T4.7 visual: median per round, worst-3 categories highlighted by callers).
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { GateVerdict } from "./contracts";
import type { MetricValue } from "./types";
import { readHistory } from "./history";

export interface ReportItemRow {
  readonly itemId: string;
  readonly verdicts: readonly GateVerdict[];
  readonly metrics: readonly MetricValue[];
  /** Artifact-relative links for the step summary. */
  readonly links?: { readonly sideBySide?: string; readonly diff?: string };
}

function fmtDistance(value: MetricValue, thresholds: ReadonlyMap<string, number>): string {
  const key = `${value.metric}@${value.region}`;
  const threshold = thresholds.get(key);
  const distance = value.pairwise;
  if (value.status === "unavailable") return `${key}: unavailable`;
  if (distance === null) return `${key}: n/a`;
  return threshold !== undefined ? `${key}: ${distance.toFixed(4)} / ${threshold.toFixed(4)}` : `${key}: ${distance.toFixed(4)}`;
}

/** Markdown table: verdict, failing metric/region, value vs threshold, image links. */
export function stepSummary(rows: readonly ReportItemRow[], thresholds: ReadonlyMap<string, number>): string {
  const lines = [
    "| Item | Verdict | Failing metric / region | Value vs threshold | Compare |",
    "|---|---|---|---|---|"
  ];
  for (const row of rows) {
    const failing = row.metrics
      .filter((v) => {
        const t = thresholds.get(`${v.metric}@${v.region}`);
        return v.status !== "unavailable" && v.pairwise !== null && t !== undefined && v.pairwise > t;
      })
      .map((v) => `${v.metric}@${v.region}`)
      .join(", ") || "—";
    const values = row.metrics.slice(0, 6).map((v) => fmtDistance(v, thresholds)).join("<br>") || "—";
    const links = [row.links?.sideBySide, row.links?.diff].filter(Boolean).map((p) => `\`${p}\``).join(" ") || "—";
    lines.push(`| ${row.itemId} | ${row.verdicts.join(", ")} | ${failing} | ${values} | ${links} |`);
  }
  return lines.join("\n") + "\n";
}

/** Append the summary to $GITHUB_STEP_SUMMARY when set, else write the given path. */
export function writeStepSummary(markdown: string, fallbackPath = "step-summary.md"): void {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, markdown, "utf8");
  else writeFileSync(fallbackPath, markdown, "utf8");
}

/** Minimal inline SVG trend sparkline — median per round for an item. */
export function trendSvg(points: readonly { roundId: string; median: number }[], width = 320, height = 80): string {
  if (points.length === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`;
  const xs = points.map((_, i) => 8 + (i * (width - 16)) / Math.max(points.length - 1, 1));
  const ys = points.map((p) => height - 8 - (Math.min(Math.max(p.median, 0), 10) / 10) * (height - 16));
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const dots = xs.map((x, i) => `<circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="2"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5"/>${dots}</svg>`;
}

/** Per-item trend SVGs rendered into a markdown block for the round artifact. */
export function renderTrends(indexPath: string, itemIds: readonly string[]): string {
  if (!existsSync(indexPath)) return "";
  const blocks = itemIds.map((itemId) => {
    const points = readHistory(indexPath).filter((l) => l.itemId === itemId).map((l) => ({ roundId: l.roundId, median: l.median }));
    return `### ${itemId}\n\n${trendSvg(points)}\n`;
  });
  return blocks.join("\n");
}
