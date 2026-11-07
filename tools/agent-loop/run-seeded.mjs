#!/usr/bin/env node
// Runs `aura3d verify --json` on the seeded broken scenes (tests/fixtures/agent-loop-seeded/manifest.json) and asserts that the
// expected finding code is raised for each. Pure orchestration: the work is in the verify command.
//
//   node tools/agent-loop/run-seeded.mjs [--scenes a,b] [--skip typecheck,build] [--out <dir>] [--no-browser]
//                                         [--browser-lock /tmp/a3d-rea.lock] [--only-static]
//
// --no-browser skips serve/render/inspect (only the static expectations are asserted); without it both static and runtime
// expectations are asserted. Exit 1 when any expectation is missed.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const seededDir = join(repoRoot, "tests/fixtures/agent-loop-seeded");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined; };
const manifest = JSON.parse(readFileSync(join(seededDir, "manifest.json"), "utf8"));
const only = opt("--scenes")?.split(",");
const noBrowser = args.includes("--no-browser");
const outDir = resolve(opt("--out") ?? join(repoRoot, "tests/reports/agent-loop-seeded"));
const lock = opt("--browser-lock");
const skip = [...(opt("--skip")?.split(",") ?? []), ...(noBrowser ? ["serve", "render", "inspect"] : [])];

mkdirSync(outDir, { recursive: true });
const rows = [];
for (const scene of manifest.scenes) {
  if (only && !only.includes(scene.id)) continue;
  const reportPath = join(outDir, `${scene.id}.json`);
  const cli = ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "packages/aura3d-cli/src/cli.ts", "verify", join(seededDir, scene.id), "--out", reportPath, "--json",
    ...(skip.length ? ["--skip", skip.join(",")] : []), ...(noBrowser ? [] : ["--frames-dir", join(outDir, "frames")]), ...(lock ? ["--browser-lock", lock] : [])];
  const run = spawnSync("pnpm", cli, { cwd: repoRoot, encoding: "utf8", maxBuffer: 1 << 26 });
  let report;
  try { report = JSON.parse(readFileSync(reportPath, "utf8")); } catch { report = null; }
  const codes = report ? [...new Set(report.findings.map((f) => f.code))] : [];
  const expected = [scene.expectedStatic, noBrowser ? null : scene.expectedRuntime].filter(Boolean);
  const missing = expected.filter((code) => !codes.includes(code));
  rows.push({ id: scene.id, expected, codes, missing, pass: report !== null && missing.length === 0, exit: run.status });
  console.log(`${missing.length === 0 && report ? "PASS" : "FAIL"} ${scene.id}  expected [${expected.join(", ")}]  got [${codes.join(", ")}]${missing.length ? `  MISSING ${missing.join(", ")}` : ""}`);
}
const summary = { schema: "aura3d.verify-seeded-run/1", browser: !noBrowser, scenes: rows.length, passed: rows.filter((r) => r.pass).length, rows };
writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`${summary.passed}/${summary.scenes} seeded scenes raised the expected code(s).`);
process.exit(summary.passed === summary.scenes ? 0 : 1);
