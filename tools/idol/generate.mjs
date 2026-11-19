#!/usr/bin/env node
// Idol (speridlabs/idol/max on fal.ai) image-to-3D lane for Aura3D games — thin wrapper over `aura3d assets generate`
// (packages/aura3d-cli/src/commands/generate/idol.ts). Flags and file layout are unchanged:
//
//   node tools/idol/generate.mjs --spec tools/idol/specs/<game>.json [--only key,key] [--force] [--concurrency 6] [--dry-run]
//   ... --renormalize [--only key]   re-optimise/normalise/slim from the raw downloads after a size/front/tex fix ($0)
//
// Raw downloads + resume-safe pending files stay in artifacts/idol/<game>/<key>/ (gitignored), every paid submit is
// appended to artifacts/idol/ledger.jsonl, outputs are <outDir>/<key>.glb + <key>.idol.json. This lane does not admit;
// use tools/idol/admit.sh (or `aura3d assets generate` without --no-admit outside this repo).
// FAL_KEY: environment, ~/.config/aura3d/fal.env or ~/.config/auraone/fal.env; it is never printed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGenerateImpl, root } from "./cli-impl.mjs";

const impl = await loadGenerateImpl();
export const ADMIT_ROLE = (role) => impl.idolAdmitRole(role);
export const buildPrompt = (item, spec) => impl.buildIdolPrompt(item, spec);

async function main() {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
  const flag = (n) => args.includes(`--${n}`);
  const specPath = opt("spec");
  if (!specPath) { console.error("usage: generate.mjs --spec tools/idol/specs/<game>.json [--only a,b] [--force] [--concurrency 6] [--dry-run] [--renormalize]"); process.exit(2); }
  const spec = JSON.parse(readFileSync(resolve(root, specPath), "utf8"));
  const only = opt("only", "").split(",").filter(Boolean);
  const results = await impl.runIdolSpec(spec, {
    projectDir: root, workRoot: "artifacts/idol", ledgerFile: resolve(root, "artifacts/idol/ledger.jsonl"),
    force: flag("force"), dryRun: flag("dry-run"), renormalize: flag("renormalize"), admit: false, generator: "tools/idol/generate.mjs (aura3d assets generate)"
  }, { only, concurrency: Number(opt("concurrency", "6")), onResult: (r) => console.log(JSON.stringify(r)) });
  const failed = results.filter((r) => r.error);
  console.log(`done: ${results.length - failed.length}/${results.length} ok, est. $${results.reduce((s, r) => s + (r.usd ?? r.estUsd ?? 0), 0).toFixed(2)}`);
  process.exit(failed.length ? 1 : 0);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
