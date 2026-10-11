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
import { join, relative, resolve, sep } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).flatMap((arg, i, all) =>
  arg.startsWith("--") ? [[arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]] : []
));
const artifactsDir = resolve(args.artifacts ?? "artifacts");
const k = Number(args.k);
// T1.17-fix / V20: an unset or non-numeric round index wrote IC-NaN.json.
if (!Number.isInteger(k) || k < 0) {
  console.error(`collect-checkpoint: --k must be a non-negative integer (got ${JSON.stringify(args.k)})`);
  process.exit(2);
}
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

// Pair aura3d/three frames per capture set and scene. capture.mjs writes
// <out>/<scene>/<engine>[@dprN].png with masks <out>/<scene>/three.<mask>.mask.png;
// each capture job uploads its own artifact dir (e.g. threejs-benchmark-none),
// so the set is the first path segment under --artifacts. The legacy flat
// bench-<scene>.<engine>.png naming is still accepted.
const frames = new Map(); // `${set}/${scene}` -> {set, scene, aura3d, three, masks:{}}
const frameEntry = (set, scene) => {
  const key = `${set}/${scene}`;
  const entry = frames.get(key) ?? { set, scene, masks: {} };
  frames.set(key, entry);
  return entry;
};
for (const file of walk(artifactsDir)) {
  const parts = relative(artifactsDir, file).split(sep);
  const name = parts[parts.length - 1];
  const set = parts.length > 1 ? parts[0] : "";
  const legacy = /^bench-(.+)\.(aura3d|three)(?:@dpr\d+)?\.png$/.exec(name);
  const legacyMask = /^bench-(.+)\.three\.([a-z-]+)\.mask\.png$/.exec(name);
  const frame = /^(aura3d|three)(?:@dpr1)?\.png$/.exec(name);
  const mask = /^three\.([a-z-]+)\.mask\.png$/.exec(name);
  if (legacy) frameEntry(set, legacy[1])[legacy[2]] = file;
  else if (legacyMask) frameEntry(set, legacyMask[1]).masks[legacyMask[2]] = file;
  else if (frame && parts.length >= 2) frameEntry(set, parts[parts.length - 2])[frame[1]] = file;
  else if (mask && parts.length >= 2) frameEntry(set, parts[parts.length - 2]).masks[mask[1]] = file;
}

const items = [];
for (const entry of frames.values()) {
  if (!entry.aura3d || !entry.three) continue;
  const scene = entry.scene;
  const regions = ["frame", ...Object.keys(entry.masks).map((mask) => REGION_BY_MASK[mask] ?? mask)];
  items.push({
    itemId: entry.set ? `bench:${scene}@dpr1#${entry.set}` : `bench:${scene}@dpr1`,
    kind: "benchmark-scene",
    aura: entry.aura3d,
    reference: entry.three,
    masks: entry.masks,
    regions
  });
}
writeFileSync(join(outDir, "items.json"), JSON.stringify(items, null, 2));
// RF2: zero paired captures means the capture jobs produced nothing — a round
// record built from it would be empty evidence. Fail instead of recording.
if (items.length === 0) {
  console.error(`collect-checkpoint: 0 paired aura3d/three frames under ${artifactsDir}; refusing to write IC-${k}.json`);
  process.exit(1);
}

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
