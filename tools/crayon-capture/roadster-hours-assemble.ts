#!/usr/bin/env tsx
/**
 * Assemble `evidence/crayon-capture/roadster-hours-reference.json` (and the browser-spec replay fixture) from the marker
 * blocks printed by tools/crayon-capture/roadster-hours.ts. Exits non-zero and writes nothing unless the report validates.
 *
 *   tsx tools/crayon-capture/roadster-hours-assemble.ts --log run-A.log --log run-B.log \
 *       --out evidence/crayon-capture/roadster-hours-reference.json \
 *       --fixture tests/browser/data/roadster-hours-reference-replay.json
 */
import fs from "node:fs";
import path from "node:path";
import {
  RH_CAPTURE_SCHEMA, RH_GAME, RH_SIM_STEP, compareSessions, comparePrefix, parseMarkerBlocks, toleranceFrom, totalSteps, validateReport,
  type ReferenceReport, type RunComparison, type SessionRecord
} from "./roadster-hours-lib.js";

const args = process.argv.slice(2);
const values = (name: string): string[] => args.flatMap((a, i) => (a === name ? [args[i + 1]!] : []));
/**
 * `--add-ingame <log> --into <reference.json>`: fold the live-game cross-check (the real Drive button and countdown, the
 * game's own loop under virtual time, stopped after N steps) into an existing report as `ingameCrossCheck`.
 */
const ingameLog = values("--add-ingame")[0];
if (ingameLog) {
  const into = values("--into")[0] ?? "evidence/crayon-capture/roadster-hours-reference.json";
  const report = JSON.parse(fs.readFileSync(into, "utf8")) as ReferenceReport & { ingameCrossCheck?: unknown };
  const live = (parseMarkerBlocks(fs.readFileSync(ingameLog, "utf8")) as SessionRecord[]).filter((s) => s.mode === "ingame" && !s.error);
  if (!live.length) { process.stderr.write("no finished in-game session in the log\n"); process.exit(1); }
  report.ingameCrossCheck = live.map((s) => {
    const c = comparePrefix(report.reference, s);
    return {
      session: s.session, steps: s.steps, virtualFrames: s.virtualFrames, wallMs: s.wallMs, finalScreen: s.final?.screen ?? null,
      note: "the original game started through its real Drive button and run by its own loop under virtual time, stopped at `steps`; compared with the same prefix of the direct-simulation reference",
      comparison: c, tolerance: report.tolerance
    };
  });
  fs.writeFileSync(into, `${JSON.stringify(report)}\n`);
  process.stdout.write(`${JSON.stringify((report.ingameCrossCheck as { session: string; steps: number; comparison: unknown }[]).map((x) => ({ session: x.session, steps: x.steps, comparison: x.comparison })))}\n`);
  process.exit(0);
}
const logs = values("--log");
const out = values("--out")[0] ?? "evidence/crayon-capture/roadster-hours-reference.json";
const fixture = values("--fixture")[0];
if (!logs.length) { process.stderr.write("usage: --log <file> [--log <file>] --out <file> [--fixture <file>]\n"); process.exit(2); }

const sessions = logs.flatMap((file) => parseMarkerBlocks(fs.readFileSync(file, "utf8")) as SessionRecord[]);
const complete = sessions.filter((s) => !s.error && s.final?.phase === "complete");
if (!complete.length) { process.stderr.write(`no finished session among ${sessions.length}: ${sessions.map((s) => s.error ?? s.final?.phase).join("; ")}\n`); process.exit(1); }
const reference = complete[0]!;
const others = complete.slice(1);
const policySessions = others.filter((s) => s.mode === "policy");
const replaySessions = others.filter((s) => s.mode === "replay");
const comparisons = (list: SessionRecord[]): RunComparison[] => list.map((s) => compareSessions(reference, s));
const sessionComparisons = comparisons(policySessions);
const replayComparisons = comparisons(replaySessions);
const tolerance = toleranceFrom([...sessionComparisons, ...replayComparisons]);

const lite = (s: SessionRecord): SessionRecord => ({ ...s, trace: [], transitions: [], segments: s.segments.length > 0 && s.mode === "replay" ? [] : s.segments });
const reasons: string[] = [];
if (complete.length < 2) reasons.push("fewer than two finished sessions");
for (const [i, c] of [...sessionComparisons, ...replayComparisons].entries()) {
  if (!c.sameScript || !c.sameFinal || !c.sameTransitions) reasons.push(`session ${i + 1} differs from the reference (script ${c.sameScript}, final ${c.sameFinal}, transitions ${c.sameTransitions})`);
}

const report: ReferenceReport = {
  schema: RH_CAPTURE_SCHEMA, game: RH_GAME, capturedAt: new Date().toISOString(), level: reference.level, levelId: reference.final!.level,
  setup: {
    simStep: RH_SIM_STEP, viewport: "320x180", virtualFrameMs: 50, policy: "examples/roadster-hours-port/autopilot.ts (closed loop, steering quantised to 1/32)",
    policyParams: "DEFAULT_PARAMS in examples/roadster-hours-port/autopilot.ts", release: "20261021-halo-lighting-v11 (game 2.3.1)"
  },
  script: reference.segments, steps: reference.steps, reference, sessions: complete.map(lite),
  variance: { sessions: sessionComparisons, replay: replayComparisons }, tolerance,
  status: reasons.length === 0 && complete.length >= 2 ? "CAPTURED" : "LIMIT-RECORDED", statusReasons: reasons
};
const problems = validateReport(report);
if (problems.length) { process.stderr.write(`report invalid:\n- ${problems.join("\n- ")}\n`); process.exit(1); }
if (totalSteps(report.script) !== report.steps) { process.stderr.write("script length mismatch\n"); process.exit(1); }

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report)}\n`);
if (fixture) {
  fs.mkdirSync(path.dirname(fixture), { recursive: true });
  fs.writeFileSync(fixture, `${JSON.stringify({ steps: report.steps, segments: report.script, final: reference.final, tolerance })}\n`);
}
process.stdout.write(`${JSON.stringify({ status: report.status, steps: report.steps, sessions: complete.length, finalTime: reference.final!.time, score: reference.final!.score, crashes: reference.final!.crashes, tolerance, reasons }, null, 1)}\n`);
