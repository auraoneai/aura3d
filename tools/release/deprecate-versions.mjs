#!/usr/bin/env node
// npm deprecations for a promoted release (run only after `latest` moved).
//   node tools/release/deprecate-versions.mjs --plan <plan.json> --version 5.0.2 --url <migration url> [--special 5.0.1="msg {version} {url}"] [--dry-run]
//   node tools/release/deprecate-versions.mjs --check --plan <plan.json> --version 5.0.2
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkDeprecations, deprecationCommands, RETIRED_PACKAGES } from "./release-helpers.mjs";

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const [planPath, version, url] = [arg("--plan"), arg("--version"), arg("--url")];
if (!planPath || !version) { console.error("usage: deprecate-versions.mjs --plan P --version V --url U [--special V=MSG] [--dry-run] | --check"); process.exit(2); }
const plan = JSON.parse(readFileSync(planPath, "utf8"));
if (args.includes("--check")) {
  const docs = {};
  for (const name of [...plan.packages.map((p) => p.name), ...RETIRED_PACKAGES]) {
    const r = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, { headers: { "cache-control": "no-cache" } });
    if (r.ok) docs[name] = await r.json();
  }
  const bad = checkDeprecations(docs, plan, version);
  bad.forEach((b) => console.log("NOT OK", b));
  console.log(bad.length ? `${bad.length} packages need attention` : `all ${plan.packages.length} packages: only ${version} undeprecated, latest=${version}`);
  process.exit(bad.length ? 1 : 0);
}
if (!url) { console.error("--url is required"); process.exit(2); }
const special = {};
args.forEach((a, i) => { if (a === "--special") { const [v, ...m] = args[i + 1].split("="); special[v] = m.join("="); } });
let failed = 0;
for (const { spec, message } of deprecationCommands(plan, version, url, { special })) {
  if (args.includes("--dry-run")) { console.log("DRY", spec, "->", message); continue; }
  let ok = false;
  for (let i = 1; i <= 3 && !ok; i++) {
    try { execFileSync("npm", ["deprecate", spec, message], { stdio: "pipe", encoding: "utf8" }); ok = true; console.log("OK", spec); }
    catch { console.log(`retry ${i}`, spec); }
  }
  if (!ok) { console.log("FAILED", spec); failed++; }
}
process.exit(failed ? 1 : 0);
