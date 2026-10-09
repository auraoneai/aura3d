#!/usr/bin/env node
/**
 * §2.5 (PRD-16): evaluate the allflags-smoke bisect-summary.json against the
 * gate contract.
 *
 *   node allflags-smoke-eval.mjs <bisect-summary.json> <baseline.json> <ALL> <issue>
 *
 *   <ALL>      comma list of the 13 flags that make up the $ALL set
 *   <issue>    Track 0 tracking issue number (the expected-red link)
 *
 * Rules:
 *   - `none` arm: every probe row must be ready with drawCalls > 0 and
 *     readyMs <= 30000 — hard fail otherwise (control broken).
 *   - $ALL / $ALL,strict arms: while Track 0 is open they are expected-red
 *     (tracked on the issue, never skipped). A scene that the baseline file
 *     records as previously green and is now not-ready is a REGRESSION — fail.
 *   - Baseline format: { "<set>": { "<scene>": "ready" } } — only green rows
 *     are recorded; absence means never-verified-green.
 */
import { existsSync, readFileSync } from "node:fs";

const [, , summaryPath, baselinePath, allCsv, issue] = process.argv;
if (!summaryPath || !allCsv) {
  console.error("usage: allflags-smoke-eval.mjs <bisect-summary.json> <baseline.json> <ALL> <issue>");
  process.exit(2);
}

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, "utf8"))
  : {};
const ALL = allCsv;
const setsWanted = ["none", ALL, `${ALL},strict`];
const rows = summary.rows ?? [];

const arms = new Map();
for (const set of setsWanted) {
  arms.set(set, rows.filter((r) => r.set === set));
}

let fail = false;
const printRows = [];
for (const set of setsWanted) {
  const setRows = arms.get(set);
  for (const row of setRows) {
    const ok = row.status === "ready" && (row.drawCalls ?? 0) > 0;
    const slow = ok && (row.readyMs ?? 0) > 30_000;
    const wasGreen = baseline[set]?.[row.scene] === "ready";
    const regressed = wasGreen && !ok;
    let verdict = ok ? (slow ? "slow" : "pass") : "red";
    if (regressed) verdict = "REGRESSION";
    printRows.push({ set: set === "none" ? "none" : set.endsWith("strict") ? "$ALL,strict" : "$ALL", scene: row.scene, status: row.status, drawCalls: row.drawCalls, readyMs: row.readyMs, verdict });
    if (set === "none" && (!ok || slow)) fail = true;
    if (regressed) fail = true;
  }
  if (setRows.length === 0) {
    printRows.push({ set: set === "none" ? "none" : set.endsWith("strict") ? "$ALL,strict" : "$ALL", scene: "(missing)", status: "no rows", verdict: set === "none" ? "FAIL" : "expected-red" });
    if (set === "none") fail = true;
  }
}

console.log("| set | scene | status | drawCalls | readyMs | verdict |");
console.log("|---|---|---|---|---|---|");
for (const r of printRows) {
  console.log(`| ${r.set} | ${r.scene} | ${r.status} | ${r.drawCalls ?? "-"} | ${r.readyMs ?? "-"} | ${r.verdict} |`);
}
const labelOf = (s) => (s === "none" ? "none" : s.endsWith("strict") ? "$ALL,strict" : "$ALL");
const redArms = setsWanted
  .filter((s) => s !== "none" && ((arms.get(s).length ?? 0) === 0 || arms.get(s).some((r) => !(r.status === "ready" && (r.drawCalls ?? 0) > 0))))
  .map(labelOf);
if (redArms.length) {
  console.log(`\nExpected-red while Track 0 is open: ${redArms.join(", ")} — tracked on issue #${issue}.`);
}
if (fail) {
  console.log("\nallflags-smoke FAILED — see table above");
  process.exit(1);
}
console.log("\nallflags-smoke: gate satisfied.");
