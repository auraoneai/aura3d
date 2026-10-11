#!/usr/bin/env node
/**
 * package-phase1-baselines.mjs — 04-EVID prep (PRD-04 §13 Phase 1 exit:
 * "All `prd04-*` scenes capture on both engines with flags `none`; baselines
 * committed to evidence/prd-04/phase-1.md").
 *
 * Runs in the qr-prd04-materials `capture` job after the flags-`none` capture
 * spec. Reads tests/reports/prd04/captures/none/{report.json,<scene>/<engine>.png}
 * and writes a commit-ready bundle to tests/reports/prd04/phase-1-baselines/:
 *   <scene>/<engine>.png   the baseline frames
 *   manifest.json          run id, sha, runner, per-frame sha256/size/status
 *   phase-1-table.md       the results table for evidence/prd-04/phase-1.md
 * The workflow uploads the bundle as the `prd04-phase1-baselines-none`
 * artifact; a maintainer commits it from a main run, citing the run id.
 *
 * Exit 1 when any registered prd04-* scene × engine frame is missing or the
 * capture spec did not record it as ready — a partial bundle is still
 * written (and uploaded) so the failure is inspectable, but it is never green.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const CAPTURES = resolve("tests/reports/prd04/captures/none");
const OUT = resolve("tests/reports/prd04/phase-1-baselines");
const COMMIT_TO = "docs/project/aura3d-quality-rebuild/evidence/prd-04/baselines/phase-1";
const ENGINES = ["aura3d", "three"];

// The registered lane scenes (benchmarks/quality-rebuild/scenes/prd04/index.ts).
const index = readFileSync(resolve("benchmarks/quality-rebuild/scenes/prd04/index.ts"), "utf8");
const scenes = [...new Set([...index.matchAll(/^\s*"(prd04-[a-z0-9-]+)":\s*\{/gm)].map((m) => m[1]))];
if (scenes.length < 10) {
  console.error(`expected >= 10 registered prd04-* scenes, found ${scenes.length}`);
  process.exit(1);
}

const reportPath = join(CAPTURES, "report.json");
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : { scenes: [] };
const status = new Map(report.scenes.map((row) => [`${row.scene}/${row.engine}`, row]));

mkdirSync(OUT, { recursive: true });
const frames = [];
const problems = [];
for (const scene of scenes) {
  for (const engine of ENGINES) {
    const src = join(CAPTURES, scene, `${engine}.png`);
    const row = status.get(`${scene}/${engine}`);
    const entry = { scene, engine, status: row?.status ?? "not-run", loadMs: row?.loadMs ?? null, error: row?.error ?? null };
    if (existsSync(src)) {
      mkdirSync(join(OUT, scene), { recursive: true });
      copyFileSync(src, join(OUT, scene, `${engine}.png`));
      const bytes = readFileSync(src);
      Object.assign(entry, { bytes: statSync(src).size, sha256: createHash("sha256").update(bytes).digest("hex") });
    } else {
      problems.push(`${scene}/${engine}: no frame`);
    }
    if (entry.status !== "ready") problems.push(`${scene}/${engine}: status ${entry.status}${entry.error ? ` (${entry.error})` : ""}`);
    frames.push(entry);
  }
}

const manifest = {
  schema: "aura3d.prd04.phase1-baselines/1",
  flags: "none",
  githubRunId: process.env.GITHUB_RUN_ID ?? null,
  githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  ref: process.env.GITHUB_REF ?? null,
  sha: process.env.GITHUB_SHA ?? null,
  runner: `${process.env.RUNNER_OS ?? "unknown"}/${process.env.RUNNER_ARCH ?? "unknown"} (${process.env.ImageOS ?? "unknown image"})`,
  commitTo: COMMIT_TO,
  complete: problems.length === 0,
  problems,
  frames
};
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const runUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY ?? "auraoneai/aura3d"}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : "(local, not evidence)";
const table = [
  `Phase 1 flags-\`none\` baselines: run ${runUrl}, sha \`${manifest.sha ?? "unknown"}\`, ${manifest.runner}.`,
  "",
  "| Scene | Engine | Status | Load ms | sha256 (first 12) |",
  "|---|---|---|---|---|",
  ...frames.map((f) => `| ${f.scene} | ${f.engine} | ${f.status} | ${f.loadMs ?? "-"} | ${f.sha256 ? f.sha256.slice(0, 12) : "missing"} |`),
  "",
  problems.length === 0 ? `All ${frames.length} frames ready.` : `INCOMPLETE: ${problems.length} problem(s):\n${problems.map((p) => `- ${p}`).join("\n")}`,
  ""
].join("\n");
writeFileSync(join(OUT, "phase-1-table.md"), table);
console.log(table);

if (problems.length > 0) {
  console.error(`phase-1 baselines incomplete (${problems.length}); bundle written to ${OUT} for inspection`);
  process.exit(1);
}
