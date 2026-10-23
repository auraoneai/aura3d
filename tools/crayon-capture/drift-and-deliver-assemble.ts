#!/usr/bin/env tsx
/**
 * tools/crayon-capture/drift-and-deliver-assemble — turn ACR run logs into
 * evidence/crayon-capture/drift-and-deliver-reference.json.
 *
 *   tsx tools/crayon-capture/drift-and-deliver-assemble.ts --log run1.log [--log run2.log] \
 *       --out evidence/crayon-capture/drift-and-deliver-reference.json
 * Fails (non-zero, nothing written) unless validateReport() passes: every scenario present with the
 * scripted step count, at least two independent sessions, and all sessions bit-identical.
 */
import fs from "node:fs";
import path from "node:path";
import { assembleReport, parseMarkerBlocks, validateReport, type SessionResult } from "./drift-and-deliver-lib.js";

const logs = process.argv.flatMap((a, i, all) => (a === "--log" ? [all[i + 1] as string] : []));
const outIdx = process.argv.indexOf("--out");
const out = outIdx >= 0 ? (process.argv[outIdx + 1] as string) : "evidence/crayon-capture/drift-and-deliver-reference.json";
if (logs.length === 0) {
  process.stderr.write("usage: drift-and-deliver-assemble.ts --log <run.log> [--log ...] [--out file]\n");
  process.exit(2);
}

const sessions: (SessionResult & { source?: string })[] = [];
for (const log of logs) {
  for (const block of parseMarkerBlocks(fs.readFileSync(log, "utf8"))) {
    const s = block as SessionResult;
    if (s.error || !s.scenarios) {
      process.stderr.write(`skipping unusable session from ${log}: ${s.error ?? "no scenarios"}\n`);
      continue;
    }
    sessions.push({ ...s, source: `${path.basename(log)}#${s.session}` });
  }
}
const first = sessions[0];
if (!first) {
  process.stderr.write("no usable sessions\n");
  process.exit(1);
}
const report = assembleReport(sessions, { url: first.url, capturedAt: new Date().toISOString() });
const errors = validateReport(report);
if (errors.length) {
  process.stderr.write(`report invalid:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
const contacts = report.reference.scenarios.map((s) => `${s.id}:${s.contacts}`).join(" ");
process.stdout.write(`wrote ${out}: ${report.reference.scenarios.length} scenarios, ${sessions.length} sessions, allHashesEqual=${report.variance.allHashesEqual}, contacts ${contacts}\n`);
