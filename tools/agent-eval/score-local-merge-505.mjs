#!/usr/bin/env node
// Merge local build results, REA frame statistics and injected-probe JSON into the remote/results.json shape score.mjs reads.
//   node tools/agent-eval/score-local-merge-505.mjs <batch> <framestats.json> <probeDir>
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
const REPO = resolve(import.meta.dirname, "..", "..");
const [batch, statsFile, probeDir] = process.argv.slice(2);
const WORK = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-runs";
const batchDir = join(REPO, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval", batch);
const builds = JSON.parse(readFileSync(join(batchDir, "local-build.json"), "utf8"));
const stats = existsSync(statsFile) ? JSON.parse(readFileSync(statsFile, "utf8")) : {};
const jsKb = (id) => { const dir = join(WORK, batch, id, "dist/assets"); return Math.round((readdirSync(dir).filter((f) => f.endsWith(".js")).reduce((a, f) => a + statSync(join(dir, f)).size, 0) / 1024) * 10) / 10; };
const out = Object.entries(builds).map(([id, b]) => {
  const s = stats[id];
  const pf = join(probeDir, `${id}-full.json`);
  const pr = existsSync(pf) ? JSON.parse(readFileSync(pf, "utf8")) : null;
  const errors = pr?.errors ?? [];
  return {
    id: `${id}-final`, build: { ok: b.ok }, readyTimeout: pr ? pr.ready === false : false,
    page: { pageErrors: errors, consoleErrorCount: errors.length },
    probes: s ? { blank: !(s.nonblack > 0.2 && s.std > 3), animated: s.diff > 0.1, frame: s, interactive: pr?.checks ?? undefined, probeDetail: pr ? { angDisp: pr.angDisp, growth: pr.growth, cameraDistanceToFocus: pr.cameraDistanceToFocus, finalCount: pr.finalCount } : undefined, probeRan: Boolean(pr) } : undefined,
    bundle: { rawKB: b.ok ? jsKb(id) : null }, readyMs: null
  };
});
mkdirSync(join(batchDir, "remote"), { recursive: true });
writeFileSync(join(batchDir, "remote/results.json"), JSON.stringify(out, null, 2));
console.log("wrote", out.length);
