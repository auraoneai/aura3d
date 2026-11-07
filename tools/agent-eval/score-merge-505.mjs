#!/usr/bin/env node
// Merge local build (score-local.mjs build), REA frame statistics (framestats.py) and in-page probe results (serve-505.mjs) into remote/results.json for score.mjs.
//   AGENT_EVAL_EVIDENCE=... node tools/agent-eval/score-merge-505.mjs <batch> <framestats.json>
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const REPO = resolve(import.meta.dirname, "..", "..");
const [batch, statsFile] = process.argv.slice(2);
const WORK = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-runs";
const batchDir = join(REPO, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval", batch);
const builds = JSON.parse(readFileSync(join(batchDir, "local-build.json"), "utf8"));
const stats = JSON.parse(readFileSync(statsFile, "utf8"));
const jsKb = (id) => { const dir = join(WORK, batch, id, "dist/assets"); return Math.round((readdirSync(dir).filter((f) => f.endsWith(".js")).reduce((a, f) => a + statSync(join(dir, f)).size, 0) / 1024) * 10) / 10; };
const out = Object.entries(builds).map(([id, b]) => {
  const s = stats[id];
  const pf = join(batchDir, "probes", `${id}.json`);
  const probe = existsSync(pf) ? JSON.parse(readFileSync(pf, "utf8")) : null;
  const pageErrors = probe?.errors ?? [];
  return {
    id: `${id}-final`,
    build: { ok: b.ok },
    readyTimeout: probe ? probe.checks?.ready === false : false,
    page: { pageErrors, consoleErrorCount: pageErrors.length },
    probes: s ? { blank: !(s.nonblack > 0.2 && s.std > 3), animated: s.diff > 0.1, frame: s, task: probe ? { checks: probe.checks, samples: probe.samples } : undefined } : undefined,
    bundle: { rawKB: b.ok ? jsKb(id) : null },
    readyMs: null
  };
});
mkdirSync(join(batchDir, "remote"), { recursive: true });
writeFileSync(join(batchDir, "remote/results.json"), JSON.stringify(out, null, 2));
console.log("wrote", out.length);
