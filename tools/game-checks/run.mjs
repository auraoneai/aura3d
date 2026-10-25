#!/usr/bin/env node
// Usage: node tools/game-checks/run.mjs <game-slug|app-folder|title> [more...] | --all [--only id,id] [--json] [--strict] [--global]
// Exit code 1 when any error finding exists (or any warning with --strict).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_CHECKS, GLOBAL_CHECKS, runChecks } from "./lib/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");

if (flag("--help") || (positional.length === 0 && !flag("--all"))) {
  console.log(`node tools/game-checks/run.mjs <game|--all> [--only ${[...Object.keys(GAME_CHECKS), ...Object.keys(GLOBAL_CHECKS)].join(",")}] [--json] [--strict] [--global]`);
  process.exit(flag("--help") ? 0 : 2);
}

const only = value("--only")?.split(",").filter(Boolean);
const result = runChecks({ root, slugs: flag("--all") ? "all" : positional, only, global: flag("--all") || flag("--global") });

if (flag("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const byGame = new Map();
  for (const f of result.findings) { if (!byGame.has(f.game)) byGame.set(f.game, []); byGame.get(f.game).push(f); }
  for (const slug of [...result.games, "(global)"]) {
    const list = byGame.get(slug) ?? [];
    if (slug === "(global)" && list.length === 0) continue;
    console.log(`\n${slug}: ${list.filter((f) => f.severity === "error").length} errors, ${list.filter((f) => f.severity === "warn").length} warnings`);
    for (const f of list) console.log(`  [${f.severity}] ${f.check} ${f.file}${f.line ? `:${f.line}` : ""} ${f.message}`);
  }
  console.log(`\n${result.games.length} game(s): ${result.errors} errors, ${result.warnings} warnings`);
}
process.exit(result.errors > 0 || (flag("--strict") && result.warnings > 0) ? 1 : 0);
