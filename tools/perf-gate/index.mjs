/**
 * PRD-11 perf gate (tools/perf-gate). Evaluates a lane capture report
 * (benchmarks/quality-rebuild/scenes/prd11/capture.mjs output) against the
 * budget rows in budgets.json and writes perf-gate.json listing every row with
 * its measured value, threshold and pass/fail/pending status (PRD-11 §16.2).
 *
 * Usage: node tools/perf-gate/index.mjs --report <report.json> [--budgets <path>] [--out <path>]
 *
 * Exit code 1 when a gating row fails or its measurement is missing; 0
 * otherwise (non-gating rows never fail — they land as "pending").
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const reportPath = arg("report", null);
const budgetsPath = arg("budgets", resolve(here, "budgets.json"));
const outPath = arg("out", reportPath ? resolve(dirname(reportPath), "perf-gate.json") : null);

if (!reportPath) {
  console.error("[perf-gate] --report <report.json> is required");
  process.exit(2);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const budgets = JSON.parse(readFileSync(budgetsPath, "utf8"));

function readPath(object, path) {
  let node = object;
  for (const part of path.split(".")) {
    if (node === null || node === undefined) return undefined;
    node = node[part];
  }
  return node;
}

function findEntry(sceneId, flags) {
  return (report.scenes ?? []).find((entry) => entry.scene === sceneId && (entry.flags ?? null) === flags)
    ?? (report.scenes ?? []).find((entry) => entry.scene === sceneId);
}

function evaluate(row) {
  const entry = findEntry(row.scene, row.flags);
  const engineResult = entry?.engines?.[row.engine];
  const measured = engineResult ? readPath(engineResult, row.metric) : undefined;

  if (row.comparator === "ratio<=" || row.comparator === "ratio<") {
    const ref = row.relative ? readPath(entry?.engines?.[row.relative.engine] ?? {}, row.relative.metric) : undefined;
    const okNumbers = typeof measured === "number" && typeof ref === "number" && ref > 0;
    const ratio = okNumbers ? measured / ref : null;
    const pass = okNumbers ? (row.comparator === "ratio<=" ? ratio <= row.threshold : ratio < row.threshold) : null;
    return { measured, reference: ref, ratio, pass };
  }

  let pass = null;
  if (measured !== undefined) {
    switch (row.comparator) {
      case ">=": pass = typeof measured === "number" && measured >= row.threshold; break;
      case "<=": pass = typeof measured === "number" && measured <= row.threshold; break;
      case "==": pass = measured === row.threshold; break;
      case "!=": pass = measured !== row.threshold && measured !== undefined; break;
      default: throw new Error(`unknown comparator ${row.comparator} in row ${row.id}`);
    }
  }
  return { measured, pass };
}

const rows = budgets.rows.map((row) => {
  const result = evaluate(row);
  const status = result.pass === null
    ? (row.gating ? "missing" : "pending")
    : result.pass ? "pass" : (row.gating ? "fail" : "recorded-fail");
  return {
    id: row.id,
    scene: row.scene,
    flags: row.flags,
    engine: row.engine,
    metric: row.metric,
    comparator: row.comparator,
    threshold: row.threshold,
    gating: row.gating,
    phase: row.phase ?? null,
    measured: result.measured ?? null,
    ...(result.reference !== undefined ? { reference: result.reference } : {}),
    ...(result.ratio !== undefined ? { ratio: result.ratio } : {}),
    status,
    comment: row.comment ?? null
  };
});

const gatingFailures = rows.filter((row) => row.status === "fail" || row.status === "missing");
const output = {
  schema: "prd11-perf-gate/1.0",
  generatedAt: new Date().toISOString(),
  report: reportPath,
  budgets: budgetsPath,
  pass: gatingFailures.length === 0,
  rows,
  summary: {
    total: rows.length,
    pass: rows.filter((row) => row.status === "pass").length,
    fail: rows.filter((row) => row.status === "fail").length,
    missing: rows.filter((row) => row.status === "missing").length,
    pending: rows.filter((row) => row.status === "pending").length,
    recordedFail: rows.filter((row) => row.status === "recorded-fail").length
  }
};

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2));
}
console.log(`[perf-gate] ${output.pass ? "PASS" : "FAIL"}: ${output.summary.pass}/${output.summary.total} gating+pending rows pass` +
  (gatingFailures.length ? `; failing: ${gatingFailures.map((row) => row.id).join(", ")}` : ""));
process.exitCode = output.pass ? 0 : 1;
