#!/usr/bin/env node
// node tools/agent-eval/report.mjs <batch>...  -> evidence/agent-eval/REPORT.md
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderReport } from "./lib/report.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const batches = process.argv.slice(2);
// A batch named "<first>-capN" holds the Aura3D arm re-run with a larger turn budget; it is shown as its own column.
const metrics = batches.flatMap((b, i) =>
  JSON.parse(readFileSync(resolve(repoRoot, "evidence/agent-eval", b, "metrics.json"), "utf8")).map((m) => (i === 0 ? m : { ...m, arm: `${m.arm}-${b.replace(`${batches[0]}-`, "")}` }))
);
const plan = JSON.parse(readFileSync(resolve(repoRoot, "evidence/agent-eval", batches[0], "plan.json"), "utf8"));
const docsSha = metrics.find((m) => m.docsSha256)?.docsSha256;
const meta = {
  docs: docsSha ? `entry docs copied from the repo (llms.txt, AGENTS.md, docs/agents/**, skills), set sha256 ${docsSha.slice(0, 16)}` : undefined,
  library: `@aura3d/engine ${plan.bases.aura.versions.engine}${plan.bases.aura.patch === "applied" ? " plus the one-line stock-build fix from commit 04b7726ef applied to the installed dist" : ""}; three ${plan.bases.three.versions.three}; vite ${plan.bases.three.versions.vite}`,
  caveats: JSON.parse(readFileSync(join(import.meta.dirname, "caveats.json"), "utf8"))
};
writeFileSync(resolve(repoRoot, "evidence/agent-eval/REPORT.md"), renderReport({ batches, metrics, meta }));
console.log("wrote evidence/agent-eval/REPORT.md");
