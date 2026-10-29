#!/usr/bin/env node
// Runs every per-game static check from tools/game-checks against Wonder World. The repo runner
// (`node tools/game-checks/run.mjs <game>`) only accepts games whose docs/workflows/game-inventory.json entry has
// status "live", and this prototype is deliberately not listed there (no public release, MASTER-PROMPT section 0),
// so the app is passed in as an unlisted entry with the same fields.
//
// screens.dir: the screenshot evidence lives under evidence/veer-wonder-world/ (PRD 06 section 4 step 9:
// {p0,p1,p2}/). The repo .gitignore tracks images only inside a `screens/` folder (`!evidence/**/screens/**`),
// so keep captures in, for example, evidence/veer-wonder-world/p1/screens/. Until a remote run's captures are
// committed, the screens-tracked check reports that none are tracked.
//
//   node apps/veer-wonder-world/tools/game-checks.mjs [--json]
// Exit code 1 when any error finding exists.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_CHECKS, gameSources, loadInventory, loadTerms } from "../../../tools/game-checks/lib/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const game = {
  slug: "wonder-world",
  appFolder: "veer-wonder-world",
  title: "Wonder World",
  url: "/apps/veer-wonder-world/",
  kind: "game",
  genre: "family",
  status: "prototype",
  verification: "prototype",
  evidenceFolder: "evidence/veer-wonder-world",
  screens: { set: "remote-software-webgl2", dir: "evidence/veer-wonder-world" }
};
const inventory = loadInventory(root);
const terms = loadTerms(root);
const src = gameSources(root, game);
const findings = [];
for (const [id, fn] of Object.entries(GAME_CHECKS)) {
  try { findings.push(...fn({ game, src, terms, root, inventory })); }
  catch (error) { findings.push({ check: id, severity: "error", game: game.slug, file: "", line: 0, message: `check threw: ${error instanceof Error ? error.message : String(error)}` }); }
}
if (process.argv.includes("--json")) console.log(JSON.stringify(findings, null, 2));
else {
  for (const f of findings) console.log(`[${f.severity}] ${f.check} ${f.file}${f.line ? `:${f.line}` : ""} ${f.message}`);
  console.log(`${game.slug}: ${findings.filter((f) => f.severity === "error").length} errors, ${findings.filter((f) => f.severity === "warn").length} warnings, ${Object.keys(GAME_CHECKS).length} checks`);
}
process.exit(findings.some((f) => f.severity === "error") ? 1 : 0);
