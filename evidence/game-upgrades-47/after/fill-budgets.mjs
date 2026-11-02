#!/usr/bin/env node
// Fill the `after` slots of every evidence/game-upgrades-47/<slug>/budget.json from the WP-38 after captures
// (<dir>/<slug>/meta/<target>.json, written by build-after.mjs). Keeps each lane's shape: a `variants.<v>.after` or
// `rows.<v>.after` slot gets the measured row of the matching target; a top-level `after` gets
// { source, label, rows: { <variant>: row } } for every captured target of the game. Slots with no captured target stay
// null and are listed on stdout. Only slots that are null are written (a lane's own after row wins).
//   node evidence/game-upgrades-47/after/fill-budgets.mjs [--dir evidence/game-upgrades-47/after]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const dir = argv.includes("--dir") ? argv[argv.indexOf("--dir") + 1] : "evidence/game-upgrades-47/after";
const root = "evidence/game-upgrades-47";
const targets = JSON.parse(readFileSync(join(dir, "targets.json"), "utf8"));
// Budget row names that differ from the luma-target variant of the same view.
const ALIAS = { "top-tennis": { hard: "default" }, heatsink: { grand: "default" }, "heatsink-port": { twilight: "default" }, "splat-rush-port": { carnival: "default" } };
const LABEL = "software WebGL2 (SwiftShader, remote ACR runner), 1280x720, freeze tag gu47-code-complete-go (5050f3cbc), settle-25s / settle-60s; drawCalls from app.diagnostics().drawCalls, triangles / textureBytes from app.diagnostics() when the engine reports them (null = not reported)";

function rowOf(meta, beforeRow) {
  const a = meta.shots["settle-25s"], b = meta.shots["settle-60s"];
  const pairOrOne = (key, x, y) => {
    const prev = beforeRow?.[key];
    if (prev && typeof prev === "object" && !Array.isArray(prev)) return { 1280: [x, y] };
    if (Array.isArray(prev)) return [x, y];
    return y;
  };
  return {
    target: meta.target, run: meta.runId, acrRunId: meta.acrRunId,
    drawCalls: pairOrOne("drawCalls", a.info?.drawCalls ?? null, b.info?.drawCalls ?? null),
    triangles: b.info?.triangles ?? null, textureBytes: b.info?.textureBytes ?? null,
    renderPath: b.info?.renderPath ?? null,
    mean: pairOrOne("mean", a.mean, b.mean), p5: b.p5, p95: pairOrOne("p95", a.p95, b.p95), darkFrac: b.darkFrac, clipFrac: b.clipFrac,
    texPending: b.info?.texPending ?? null, label: "software WebGL2"
  };
}

const left = [];
for (const slug of readdirSync(root)) {
  const file = join(root, slug, "budget.json");
  if (!existsSync(file)) continue;
  const metaDir = join(dir, slug, "meta");
  const metas = new Map();
  if (existsSync(metaDir)) for (const f of readdirSync(metaDir)) { const m = JSON.parse(readFileSync(join(metaDir, f), "utf8")); metas.set(m.variant, m); }
  const json = JSON.parse(readFileSync(file, "utf8"));
  let changed = 0;
  const find = (key) => metas.get(ALIAS[slug]?.[key] ?? key) ?? metas.get(key) ?? null;
  for (const group of ["variants", "rows"]) {
    for (const [key, slot] of Object.entries(json[group] ?? {})) {
      if (!slot || typeof slot !== "object" || !("after" in slot) || slot.after !== null) continue;
      const m = find(key);
      if (!m) { left.push(`${slug} ${group}.${key}: no captured target`); continue; }
      slot.after = rowOf(m, slot.before); changed++;
    }
  }
  if ("after" in json && json.after === null) {
    if (metas.size) {
      const rows = {};
      for (const t of targets.filter((x) => x.slug === slug)) { const m = metas.get(t.variant); if (m) rows[t.variant] = rowOf(m, null); }
      json.after = { source: `evidence/game-upgrades-47/after/${slug}/meta/*.json (WP-38 after captures)`, label: LABEL, rows };
      changed++;
    } else left.push(`${slug} after: no captured target`);
  }
  if (changed) writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`${slug}: ${changed} after slot(s) filled`);
}
for (const l of left) console.log(`left null: ${l}`);
