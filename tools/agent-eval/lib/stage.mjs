import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { AURA_VERSION } from "./base.mjs";
import { TASK_ASSETS } from "./sandbox.mjs";

function treeHash(dir) {
  const hash = createHash("sha256");
  const walk = (d, prefix = "") => {
    for (const entry of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(join(d, entry.name), `${rel}/`);
      else hash.update(rel).update(readFileSync(join(d, entry.name)));
    }
  };
  if (existsSync(dir)) walk(dir);
  return hash.digest("hex");
}

/**
 * Collect the scorable snapshots of a batch into `<stageRoot>/<batch>`: the final snapshot of every valid run, plus the
 * draft snapshot when it differs from the final one (a draft equal to the final is scored once and aliased).
 */
export function stageBatch({ repoRoot, batch, stageRoot = join(repoRoot, "tools/agent-eval/_stage"), tasks = null }) {
  const batchDir = resolve(repoRoot, "evidence/agent-eval", batch);
  const stage = join(stageRoot, batch);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, "snaps"), { recursive: true });
  const snapshots = [];
  const assets = {};
  for (const name of readdirSync(join(batchDir, "runs")).sort()) {
    const runJson = join(batchDir, "runs", name, "run.json");
    if (!existsSync(runJson)) continue;
    const run = JSON.parse(readFileSync(runJson, "utf8"));
    if (run.invalid || !existsSync(join(batchDir, "runs", name, "snapshots/final"))) continue;
    if (tasks && !tasks.includes(run.task)) continue;
    const finalDir = join(batchDir, "runs", name, "snapshots/final");
    const draftDir = join(batchDir, "runs", name, "snapshots/draft");
    const sameDraft = run.draftIsFinal || treeHash(draftDir) === treeHash(finalDir);
    const kinds = sameDraft ? [["final", finalDir]] : [["draft", draftDir], ["final", finalDir]];
    for (const [kind, dir] of kinds) {
      const id = `${name}-${kind}`;
      cpSync(dir, join(stage, "snaps", id), { recursive: true });
      snapshots.push({ id, run: name, arm: run.arm, task: run.task, kind, dir: `snaps/${id}`, draftAliasesFinal: kind === "final" && sameDraft });
    }
    for (const asset of TASK_ASSETS[run.task] ?? []) {
      assets[run.task] ??= [];
      const file = basename(asset.to);
      if (!assets[run.task].includes(file)) {
        assets[run.task].push(file);
        mkdirSync(join(stage, "assets"), { recursive: true });
        cpSync(join(repoRoot, asset.from), join(stage, "assets", file));
      }
    }
  }
  const manifest = { batch, snapshots, assets, bases: { aura: { auraVersion: AURA_VERSION, patch: true }, three: {} } };
  writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { stage, manifest };
}
