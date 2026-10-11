#!/usr/bin/env node
// PRD-07 P-03 / 07-MASKS — report verifier for prd07-vfx.yml capture and games
// jobs. Moved out of inline `node -e` blocks (the inline form at :183 did not
// parse as YAML, so the workflow ran 0 jobs). Fails on any non-ready scene,
// zero-draw aura3d engine, aura3d errors, blank game frame, missing
// screenshots, or an evidence dir with no report.
//
// Usage: node tests/qr/prd07/ci/verify-reports.mjs <capture|games> [dir]
// dir defaults to $EVIDENCE_DIR.
import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2];
const dir = process.argv[3] ?? process.env.EVIDENCE_DIR;
if (mode !== "capture" && mode !== "games") {
  console.error("::error::usage: verify-reports.mjs <capture|games> [dir]");
  process.exit(2);
}
if (!dir) {
  console.error("::error::no evidence dir (pass one or set EVIDENCE_DIR)");
  process.exit(2);
}

const reportName = mode === "capture" ? /^report\.json$/ : /^report.*\.json$/;
const reports = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (reportName.test(e.name)) reports.push(p);
  }
})(dir);

const bad = [];
for (const rp of reports) {
  const r = JSON.parse(fs.readFileSync(rp, "utf8"));
  if (mode === "capture") {
    for (const s of r.scenes ?? []) {
      for (const [eng, res] of Object.entries(s.engines ?? {})) {
        const p = res?.payload ?? {};
        if (res?.status !== "ready") bad.push(`${rp}:${s.scene}/${eng} status=${res?.status}`);
        else if (eng === "aura3d" && (p.drawCalls ?? 0) === 0) bad.push(`${rp}:${s.scene}/${eng} drawCalls=0`);
        else if (eng === "aura3d" && (p.errors ?? []).length > 0) bad.push(`${rp}:${s.scene}/${eng} errors=${p.errors[0]}`);
      }
    }
  } else {
    // capture-games.mjs report.json: games[].{error, runs[].{error,
    // missingShots, blankShots, timing.readiness}} (summary[] carries a flat
    // `readiness`; both are read) — the same failure rule as
    // capture-games.mjs:1083 (T0-11). A game with no runs proves nothing.
    if (!Array.isArray(r.games) || r.games.length === 0) bad.push(`${rp}: no games in report`);
    for (const g of r.games ?? []) {
      const id = g.game ?? g.id;
      if (g.error) bad.push(`${rp}:${id} error=${String(g.error).slice(0, 200)}`);
      const runs = Array.isArray(g.runs) ? g.runs : [];
      if (runs.length === 0) bad.push(`${rp}:${id} no runs`);
      for (const run of runs) {
        const where = `${rp}:${id}/${run.run ?? run.name ?? "run"}`;
        if (run.error) bad.push(`${where} error=${String(run.error).slice(0, 200)}`);
        if (run.missingShots?.length) bad.push(`${where} missing shots: ${run.missingShots.join(",")}`);
        if (run.blankShots?.length) bad.push(`${where} blank frame: ${run.blankShots.join(",")}`);
        if ((run.readiness ?? run.timing?.readiness) === "no-draw-timeout") bad.push(`${where} no-draw-timeout`);
      }
    }
  }
}
if (reports.length === 0) bad.push(`${dir}: no report.json produced`);
for (const b of bad) console.error("::error::" + b);
console.log(`verify-reports ${mode}: ${reports.length} report(s), ${bad.length} problem(s)`);
process.exit(bad.length ? 1 : 0);
