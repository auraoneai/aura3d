#!/usr/bin/env node
// tests/qr/prd14/write-evidence.mjs — PRD-14 S1..S9 evidence per game.
// Joins one lane run's outputs into
//   docs/project/aura3d-quality-rebuild/evidence/prd14/<game>/<run-id>/report.json
// Inputs (all from the same qr-prd14-games.yml run):
//   --capture <tools/quality-rebuild-capture/out/report.json>   (S3, readiness)
//   --browser <tests/qr/prd14/reports/browser.json>             (Playwright JSON: S1, S2, S5-S9)
//   --static <success|failure|skipped>                          (Static gates job: S4, S5 static half)
//   --run-id <GITHUB_RUN_ID> --sha <GITHUB_SHA> --routes <dirs>
// Each S row is "pass", "fail" or "missing" (no test produced it). Exit code
// is 1 if any selected game has a "fail" or "missing" row, so the run that
// writes the evidence is the gate.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
for (const k of ["capture", "browser", "static", "run-id", "sha", "routes"]) {
  if (!args[k]) { console.error(`write-evidence: --${k} is required`); process.exit(2); }
}

const games = JSON.parse(readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")).games;
const dirs = args.routes.split(",").map((s) => s.trim()).filter(Boolean);
const capture = existsSync(args.capture) ? JSON.parse(readFileSync(args.capture, "utf8")) : { games: [] };
const browser = existsSync(args.browser) ? JSON.parse(readFileSync(args.browser, "utf8")) : { suites: [] };

/** Flattens the Playwright JSON report into { file, title, status } rows. */
function flatten(suite, file, out) {
  const f = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const results = t.results ?? [];
      const last = results[results.length - 1];
      out.push({ file: f, title: spec.title, status: last?.status ?? "missing", annotations: t.annotations ?? [] });
    }
  }
  for (const child of suite.suites ?? []) flatten(child, f, out);
  return out;
}
const tests = (browser.suites ?? []).flatMap((s) => flatten(s, s.file, []));

function verdict(rows) {
  if (rows.length === 0) return { status: "missing", tests: [] };
  const ok = rows.every((r) => r.status === "passed");
  return { status: ok ? "pass" : "fail", tests: rows.map((r) => ({ file: r.file, title: r.title, status: r.status })) };
}

let bad = 0;
for (const dir of dirs) {
  const entry = games.find((g) => (g.appDir ?? g.id) === dir || g.id === dir);
  if (!entry) { console.error(`write-evidence: ${dir} not in games.json`); bad += 1; continue; }
  const id = entry.id;
  const appDir = entry.appDir ?? entry.id;
  const mine = tests.filter((t) => {
    const src = existsSync(join(ROOT, "tests/qr/prd14/browser", t.file ?? ""))
      ? readFileSync(join(ROOT, "tests/qr/prd14/browser", t.file), "utf8") : "";
    return src.includes(`const APP_DIR = "${appDir}"`) || t.title.startsWith(`${appDir}:`) || t.title.startsWith(`route ${appDir}:`);
  });
  const byFile = (re) => mine.filter((t) => re.test(t.file ?? ""));
  const byTitle = (fileRe, titleRe) => mine.filter((t) => fileRe.test(t.file ?? "") && titleRe.test(t.title));
  const cap = (capture.games ?? []).find((g) => g.id === id);
  const runs = cap?.runs ?? [];
  const s3 = cap === undefined ? { status: "missing" }
    : { status: !cap.error && runs.length > 0 && runs.every((r) => !r.error && (r.blankShots ?? []).length === 0 && (r.missingShots ?? []).length === 0) ? "pass" : "fail",
        runs: runs.map((r) => ({ run: r.run, readiness: r.timing?.readiness ?? null, blankShots: r.blankShots ?? [], missingShots: r.missingShots ?? [], error: r.error ?? null })) };
  const staticRow = { status: args.static === "success" ? "pass" : args.static === "failure" ? "fail" : "missing", job: args.static };
  const s = {
    S1: verdict(byFile(/-dispatch\.spec\.ts$/)),
    S2: verdict(byTitle(/-v2\.spec\.ts$/, /boots to playing/)),
    S3: s3,
    S4: staticRow,
    S5: { static: staticRow, runtime: verdict(byFile(/art-direction-audit\.spec\.ts$/)) },
    S6: verdict(byTitle(/-v2\.spec\.ts$/, /appliedLook/)),
    S7: verdict(byFile(/-framing\.spec\.ts$/)),
    S8: verdict(byFile(/budgets\.spec\.ts$/)),
    S9: verdict(byFile(/budgets\.spec\.ts$/))
  };
  s.S5.status = s.S5.static.status === "pass" && s.S5.runtime.status === "pass" ? "pass"
    : [s.S5.static.status, s.S5.runtime.status].includes("fail") ? "fail" : "missing";
  const failing = Object.entries(s).filter(([, v]) => v.status !== "pass").map(([k, v]) => `${k}=${v.status}`);
  if (failing.length > 0) bad += 1;
  const outDir = join(ROOT, "docs/project/aura3d-quality-rebuild/evidence/prd14", id, String(args["run-id"]));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "report.json"), JSON.stringify({
    schema: "prd14-s1-s9/1", game: id, appDir, runId: Number(args["run-id"]), sha: args.sha,
    provider: "github-actions macos-14", generatedAt: new Date().toISOString(),
    summary: failing.length === 0 ? "S1-S9 pass" : `not passing: ${failing.join(", ")}`, s
  }, null, 2) + "\n");
  console.log(`${id}: ${failing.length === 0 ? "S1-S9 pass" : failing.join(", ")}`);
}
process.exit(bad === 0 ? 0 : 1);
