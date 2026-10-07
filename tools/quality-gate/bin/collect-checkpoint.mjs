#!/usr/bin/env node
/**
 * Quality-checkpoint collect (PRD-12 T1.17). Reads the capture artifacts the
 * `uses` jobs uploaded, pairs each scene's Aura + three.js frames with their
 * mask PNGs, runs the real metric suite (python -m metrics), and writes
 * benchmarks/quality-rebuild/history/rounds/IC-<k>.json plus one index.jsonl
 * line per judge aggregate (none until the panel runs — measured, not assumed).
 *
 * Usage: node collect-checkpoint.mjs --artifacts <dir> --k <n> --run-id <id> --sha <sha>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).flatMap((arg, i, all) =>
  arg.startsWith("--") ? [[arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]] : []
));
const artifactsDir = resolve(args.artifacts ?? "artifacts");
const k = Number(args.k ?? "0");
const outDir = join(artifactsDir, "checkpoint");
mkdirSync(outDir, { recursive: true });
const roundsDir = "benchmarks/quality-rebuild/history/rounds";
const indexPath = "benchmarks/quality-rebuild/history/index.jsonl";
mkdirSync(roundsDir, { recursive: true });

const REGION_BY_MASK = { "object-id": "subject", "shadow-receiver": "shadow-receiver", "sky": "sky" };

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

// Pair bench-<scene>.<engine>.png frames by scene id; masks live as
// bench-<scene>.three.<mask>.mask.png next to the reference frame.
const frames = new Map(); // sceneId -> {aura3d, three, masks:{}}
for (const file of walk(artifactsDir)) {
  const name = file.split("/").pop();
  const match = /^bench-(.+)\.(aura3d|three)(?:@dpr\d+)?\.png$/.exec(name);
  const maskMatch = /^bench-(.+)\.three\.([a-z-]+)\.mask\.png$/.exec(name);
  if (match) {
    const [, scene, engine] = match;
    const entry = frames.get(scene) ?? { masks: {} };
    entry[engine] = file;
    frames.set(scene, entry);
  } else if (maskMatch) {
    const [, scene, mask] = maskMatch;
    const entry = frames.get(scene) ?? { masks: {} };
    entry.masks[mask] = file;
    frames.set(scene, entry);
  }
}

const items = [];
for (const [scene, entry] of frames) {
  if (!entry.aura3d || !entry.three) continue;
  const regions = ["frame", ...Object.keys(entry.masks).map((mask) => REGION_BY_MASK[mask] ?? mask)];
  items.push({
    itemId: `bench:${scene}@dpr1`,
    kind: "benchmark-scene",
    aura: entry.aura3d,
    reference: entry.three,
    masks: entry.masks,
    regions
  });
}
writeFileSync(join(outDir, "items.json"), JSON.stringify(items, null, 2));

let metrics = { items: [] };
if (items.length > 0) {
  try {
    execFileSync("python3", ["-m", "metrics", "run", "--items", join(outDir, "items.json"), "--out", join(outDir, "metrics.json")], {
      cwd: "tools/quality-gate/metrics",
      stdio: "inherit"
    });
    metrics = JSON.parse(readFileSync(join(outDir, "metrics.json"), "utf8"));
  } catch (error) {
    console.error(`metrics run failed: ${error.message}`);
  }
}

const failures = metrics.items.filter((item) => item.status !== "ok" || (item.alignment && item.alignment.applicable && item.alignment.passed === false));
const record = {
  schema: "aura3d.quality-gate.panel/1",
  round: `IC-${k}`,
  roundId: `IC-${k}`,
  date: new Date().toISOString().slice(0, 10),
  commit: args.sha ?? "unknown",
  captureRunId: args["run-id"] ?? "unknown",
  qrFlags: ["none", "all"],
  env: {
    commitSha: args.sha ?? "unknown",
    githubRunId: args["run-id"] ?? "unknown",
    runnerImage: `${process.env.ImageOS ?? "unknown"}/${process.env.ImageVersion ?? "unknown"}`,
    gpuRenderer: "unknown",
    browserVersion: "unknown",
    launchArgs: []
  },
  thresholdsFrozenAt: "unmeasured: PRD-12 R0 (no calibration run yet)",
  calibration: [],
  canaryPassed: false,
  judges: [],
  benchmark: [],
  games: [],
  aggregates: [],
  itemsScored: items.length,
  itemsFailed: failures.map((item) => item.itemId)
};
writeFileSync(join(roundsDir, `IC-${k}.json`), JSON.stringify(record, null, 2) + "\n");

// One index line per (round, item, judge-aggregate) — judges have not run, so
// the index gains no entries this round rather than metric-shaped rows.
if (record.judges.length > 0) {
  for (const aggregate of record.aggregates) {
    appendFileSync(indexPath, JSON.stringify({ round: record.round, itemId: aggregate.itemId, commit: record.commit, runId: record.captureRunId, median: aggregate.median }) + "\n");
  }
}

if (failures.length > 0) {
  writeFileSync(join(outDir, "regressions.txt"), failures.map((item) => item.itemId).join("\n") + "\n");
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, "regressions=true\n");
}
console.log(`IC-${k}: ${items.length} items scored, ${failures.length} failed`);
