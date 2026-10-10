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
    const rows = r.games ?? r.results ?? [];
    for (const g of rows) {
      const id = g.game ?? g.id;
      const shots = g.shots ?? g.screenshots ?? g.captures ?? [];
      if (g.status && g.status !== "ready" && g.status !== "ok" && g.status !== "captured") bad.push(`${rp}:${id} status=${g.status}`);
      if (g.drawCalls === 0) bad.push(`${rp}:${id} drawCalls=0`);
      if (g.blank === true || g.blankShots > 0) bad.push(`${rp}:${id} blank frame`);
      if (Array.isArray(shots) && shots.length === 0) bad.push(`${rp}:${id} no screenshots`);
    }
  }
}
if (reports.length === 0) bad.push(`${dir}: no report.json produced`);
for (const b of bad) console.error("::error::" + b);
console.log(`verify-reports ${mode}: ${reports.length} report(s), ${bad.length} problem(s)`);
process.exit(bad.length ? 1 : 0);
