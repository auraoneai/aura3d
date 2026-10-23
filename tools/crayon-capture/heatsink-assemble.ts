#!/usr/bin/env tsx
/**
 * Assembles evidence/crayon-capture/heatsink-reference.json from one or more ACR run logs that contain
 * `@@CRAYON_CAPTURE_BEGIN:<n>` marker blocks (see heatsink.ts). Exits non-zero and writes nothing unless the
 * report validates (schema, >= 20 snapshots, a parseable input script, >= 2 sessions, >= 1 replay).
 *
 *   tsx tools/crayon-capture/heatsink-assemble.ts --log run1.log [--log run2.log] --out evidence/crayon-capture/heatsink-reference.json
 */
import fs from "node:fs";
import path from "node:path";
import { assembleReport, parseMarkerBlocks, validateReport, type SessionRecord } from "./heatsink-lib.js";

const args = process.argv.slice(2);
const values = (name: string): string[] => args.flatMap((a, i) => (a === name ? [args[i + 1] as string] : []));
const logs = values("--log");
const out = values("--out")[0] ?? "evidence/crayon-capture/heatsink-reference.json";
const map = values("--map")[0] ?? "vesper";
if (logs.length === 0) { process.stderr.write("usage: --log <run.log>... [--out file]\n"); process.exit(2); }

const sessions: SessionRecord[] = [];
for (const log of logs) sessions.push(...(parseMarkerBlocks(fs.readFileSync(log, "utf8")) as SessionRecord[]));
const report = assembleReport(sessions, { url: "https://app.usecrayon.ai/play/4698c657-3950-438a-9b64-b5fe778fcfda", moduleBytes: 1641373, map });
const errors = validateReport(report);
if (errors.length) { process.stderr.write(`report invalid:\n- ${errors.join("\n- ")}\n`); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
process.stdout.write(`wrote ${out}: ${report.reference.snapshots.length} snapshots, ${report.script.totalSteps} steps, sessions=${report.repeatability.sessions} replays=${report.repeatability.replays} exact=${report.repeatability.allExact}\n`);
