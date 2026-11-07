#!/usr/bin/env node
// Merge local-build.json + physics-probes.json + frame stats into <batch>/remote/results.json (the shape score.mjs reads).
//   node tools/agent-eval/assemble-physics.mjs <batch>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const batch = process.argv[2];
const dir = join(REPO, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval", batch);
const builds = JSON.parse(readFileSync(join(dir, "local-build.json"), "utf8"));
const probes = existsSync(join(dir, "physics-probes.json")) ? JSON.parse(readFileSync(join(dir, "physics-probes.json"), "utf8")) : {};
const stats = existsSync(join(dir, "framestats.json")) ? JSON.parse(readFileSync(join(dir, "framestats.json"), "utf8")) : {};
const out = [];
for (const [id, b] of Object.entries(builds)) {
  const p = probes[id];
  const fs = stats[id];
  const compact = p ? Object.fromEntries(Object.entries(p).filter(([k]) => !["samples", "pageErrors"].includes(k))) : null;
  if (p?.samples) {
    const s = p.samples;
    compact.trajectory = s.filter((_, i) => i % Math.max(1, Math.floor(s.length / 12)) === 0).map((x) => JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => k !== "t")))).join(" ");
  }
  out.push({
    id: `${id}-final`,
    build: { ok: b.ok },
    readyTimeout: p ? p.ready === false : false,
    page: { pageErrors: p?.pageErrors ?? [], consoleErrorCount: (p?.pageErrors ?? []).length },
    probes: p ? { blank: fs ? fs.nonblack < 0.05 : false, animated: fs ? fs.diff > 0.5 : false, frame: fs ?? null, ...compact } : null,
    bundle: { rawKB: b.bundleKb },
    readyMs: null
  });
}
mkdirSync(join(dir, "remote"), { recursive: true });
writeFileSync(join(dir, "remote/results.json"), JSON.stringify(out, null, 2));
console.log("assembled", out.length);
