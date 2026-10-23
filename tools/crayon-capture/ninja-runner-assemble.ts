#!/usr/bin/env tsx
/**
 * Assemble evidence/crayon-capture/ninja-runner-reference.json from one or more ACR run logs.
 *   pnpm exec tsx tools/crayon-capture/ninja-runner-assemble.ts --log run1.log [--log run2.log] --out evidence/crayon-capture/ninja-runner-reference.json
 * Exits non-zero and writes nothing unless the report validates (>= 60 s of sim, combat, an idle loss,
 * a restart, >= 2 independent sessions).
 */
import fs from "node:fs";
import path from "node:path";
import { assembleReport, parseMarkerBlocks, validateReport, type NinjaSession } from "./ninja-runner-lib.js";

function args(name: string): string[] {
  return process.argv.flatMap((a, i, all) => (a === name ? [all[i + 1] as string] : []));
}

const logs = args("--log");
const out = args("--out")[0];
if (logs.length === 0 || !out) {
  process.stderr.write("usage: ninja-runner-assemble --log <run.log> [--log ...] --out <file>\n");
  process.exit(2);
}
const sessions: NinjaSession[] = [];
for (const log of logs) sessions.push(...(parseMarkerBlocks(fs.readFileSync(log, "utf8")) as NinjaSession[]));
const report = assembleReport(sessions, { capturedAt: new Date().toISOString(), runs: logs.map((l) => path.basename(l)) });
const problems = validateReport(report);
if (problems.length > 0) {
  process.stderr.write(`report does not validate:\n- ${problems.join("\n- ")}\n`);
  process.exit(1);
}
fs.writeFileSync(path.resolve(out), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`wrote ${out}: ${report.reference.outcome} after ${report.reference.steps} steps, ${report.reference.kills} kills, ${report.sessions.length} sessions, tolerance ${report.tolerance.numeric}\n`);
