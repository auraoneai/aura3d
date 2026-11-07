#!/usr/bin/env node
// Merge local build results (score-local.mjs) and REA frame statistics into the remote/results.json shape score.mjs reads.
//   node tools/agent-eval/score-local-merge.mjs <batch> <framestats.json>
// Only probes that pixels can answer are filled in (blank, animated). Task-specific page probes (instancing counters, clip switch,
// window.__GAME__ state contract) need page evaluation and are NOT measured by this local path; they are left undefined.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const [batch, statsFile] = process.argv.slice(2);
const WORK = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-runs";
const batchDir = join(REPO, (process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval"), batch);
const builds = JSON.parse(readFileSync(join(batchDir, "local-build.json"), "utf8"));
const stats = JSON.parse(readFileSync(statsFile, "utf8"));
const jsKb = (id) => {
  const dir = join(WORK, batch, id, "dist/assets");
  return Math.round((readdirSync(dir).filter((f) => f.endsWith(".js")).reduce((a, f) => a + statSync(join(dir, f)).size, 0) / 1024) * 10) / 10;
};
const out = Object.entries(builds).map(([id, b]) => {
  const s = stats[id];
  return {
    id: `${id}-final`,
    build: { ok: b.ok },
    readyTimeout: false,
    page: { pageErrors: [], consoleErrorCount: 0 },
    probes: s ? { blank: !(s.nonblack > 0.2 && s.std > 3), animated: s.diff > 0.1, frame: s } : undefined,
    bundle: { rawKB: b.ok ? jsKb(id) : null },
    readyMs: null
  };
});
mkdirSync(join(batchDir, "remote"), { recursive: true });
writeFileSync(join(batchDir, "remote/results.json"), JSON.stringify(out, null, 2));
console.log("wrote", out.length);
