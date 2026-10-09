#!/usr/bin/env node
/**
 * §2.3 (PRD-16): fold per-flag-set capture reports into bisect-summary.json.
 *
 * Usage: node benchmarks/quality-rebuild/bisect-summary.mjs <out-root> <set1,set2,...>
 *
 * Each set's report.json lives at <out-root>/<sanitized-set>/report.json. The
 * summary row is {set, scene, engine, status, drawCalls, error0, mountTiming}
 * — the fields a bisection needs to name a culprit without downloading PNGs.
 * Exits non-zero when the `none` control set failed (the control being broken
 * invalidates the whole round); other sets failing is the signal itself.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , outRoot, setsArg] = process.argv;
if (!outRoot || !setsArg) {
  console.error("usage: bisect-summary.mjs <out-root> <set1,set2,...>");
  process.exit(2);
}

const sanitize = (set) => set.replace(/[^A-Za-z0-9_-]/g, "_");
const sets = setsArg.split(",").filter(Boolean);
const summary = { generatedAt: new Date().toISOString(), rows: [], missing: [] };

for (const set of sets) {
  const reportPath = join(outRoot, sanitize(set), "report.json");
  if (!existsSync(reportPath)) {
    summary.missing.push(set);
    continue;
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  for (const entry of report.scenes ?? []) {
    for (const [slot, result] of Object.entries(entry.engines ?? {})) {
      const payload = result.payload ?? {};
      summary.rows.push({
        set,
        scene: entry.scene,
        engine: result.engine ?? slot,
        status: result.status ?? "unknown",
        drawCalls: payload.drawCalls ?? null,
        error0: (payload.errors?.[0] ?? result.error ?? null) ? String(payload.errors?.[0] ?? result.error).slice(0, 400) : null,
        readyMs: payload.loadMs ?? null,
        mountTiming: payload.extra?.mountTiming ?? null
      });
    }
  }
}

writeFileSync(join(outRoot, "bisect-summary.json"), JSON.stringify(summary, null, 2));
console.log(`[bisect-summary] ${summary.rows.length} rows over ${sets.length} sets -> ${join(outRoot, "bisect-summary.json")}`);
for (const set of summary.missing) console.log(`[bisect-summary] MISSING report for set '${set}'`);

// Control check: the `none` set must be all-ready or the round is invalid.
const none = sets.find((set) => set === "none");
if (none) {
  const noneRows = summary.rows.filter((row) => row.set === "none");
  const bad = noneRows.filter((row) => row.status !== "ready" || (row.drawCalls ?? 0) === 0);
  if (summary.missing.includes("none") || bad.length > 0) {
    console.error(`[bisect-summary] CONTROL BROKEN: 'none' set has ${bad.length} non-ready row(s)${summary.missing.includes("none") ? " (report missing)" : ""}`);
    process.exit(1);
  }
}
