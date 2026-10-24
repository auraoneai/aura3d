// Generates packages/engine/README.md from the root README.md so the two cannot drift.
// Usage: node tools/docs/sync-engine-readme.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://github.com/auraoneai/aura3d/blob/main/";
const HEADER = "<!-- Generated from the repository README.md by tools/docs/sync-engine-readme.mjs; edit the root README instead. -->\n\n";

const source = readFileSync(resolve(root, "README.md"), "utf8");
const body = source.replace(/\]\(\.\/([^)\s]+)\)/g, (_m, path) => `](${BASE}${path.replace(/^\.\//, "")})`);
const out = HEADER + body;
const target = resolve(root, "packages/engine/README.md");

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== out) {
    console.error("packages/engine/README.md is stale; run: node tools/docs/sync-engine-readme.mjs");
    process.exit(1);
  }
  console.log("packages/engine/README.md is in sync");
} else {
  writeFileSync(target, out, "utf8");
  console.log("wrote packages/engine/README.md");
}
