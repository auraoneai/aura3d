#!/usr/bin/env tsx
/**
 * tools/crayon-capture/assemble — turn ACR run logs into
 * evidence/crayon-capture/strange-orbit-reference.json.
 *
 *   tsx tools/crayon-capture/assemble.ts --log run2.log --log run3.log \
 *       --out evidence/crayon-capture/strange-orbit-reference.json
 * Fails (non-zero, nothing written) unless validateReport() passes: a finished 7-lap
 * reference, a parseable script, and at least two independent sessions.
 */
import fs from "node:fs";
import path from "node:path";
import { assembleReport, parseMarkerBlocks, validateReport, type SessionRecord } from "./lib.js";

const logs = process.argv.flatMap((a, i, all) => (a === "--log" ? [all[i + 1] as string] : []));
const outIdx = process.argv.indexOf("--out");
const out = outIdx >= 0 ? (process.argv[outIdx + 1] as string) : "evidence/crayon-capture/strange-orbit-reference.json";
if (logs.length === 0) { process.stderr.write("usage: assemble.ts --log <run.log> [--log ...] [--out file]\n"); process.exit(2); }

const sessions: SessionRecord[] = [];
for (const log of logs) {
  for (const block of parseMarkerBlocks(fs.readFileSync(log, "utf8"))) {
    const s = block as SessionRecord & { error?: string };
    if (s.error || !s.primary || s.primary.result.outcome !== "finished" || !s.replay) {
      process.stderr.write(`skipping unusable session from ${log}: ${s.error ?? s.primary?.result.outcome ?? "no primary"}\n`);
      continue;
    }
    sessions.push({ ...s, source: `${path.basename(log)}#${s.session}` });
  }
}
const first = sessions[0];
if (!first) { process.stderr.write("no usable sessions\n"); process.exit(1); }
const report = assembleReport(sessions, { game: "strange-orbit", url: first.url, capturedAt: new Date().toISOString(), policyName: "cruise" });
const errors = validateReport(report);
if (errors.length) { process.stderr.write(`report invalid:\n- ${errors.join("\n- ")}\n`); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
const v = report.variance;
process.stdout.write(`wrote ${out}: finish ${report.reference.finishTime}s, ${report.reference.lapTimes.length} laps, ${sessions.length} sessions, repeat exact=${v.repeat.exact} (max d finish ${v.repeat.maxFinishTimeDelta}), tolerance ${report.tolerance.finishTimeSec}s\n`);
