#!/usr/bin/env node
// Try aura_lookup by hand against a sandbox dir.  node tools/agent-eval/lookup-cli.mjs <sandboxDir> [--full] "query" ...
import { createLookup } from "./lib/lookup.mjs";

const args = process.argv.slice(2);
const dir = args.shift();
const full = args[0] === "--full" && args.shift();
const lookup = createLookup(dir);
for (const query of args) {
  const started = Date.now();
  const out = lookup(query);
  console.log(`===== ${query} (${out.length} chars, ${Date.now() - started} ms)`);
  console.log(full ? out : out.split("\n").filter((l) => l.startsWith("[") || l.startsWith("###")).join("\n"));
}
