#!/usr/bin/env node
// node tools/agent-eval/extract.mjs <batch> <acr-run.log>...  -> evidence/agent-eval/<batch>/remote/{results.json,frames/}
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeRemote } from "./lib/extract.mjs";
const repoRoot = resolve(import.meta.dirname, "..", "..");
const [batch, ...logs] = process.argv.slice(2);
console.log(writeRemote({ outDir: resolve(repoRoot, "evidence/agent-eval", batch, "remote"), logs: logs.map((p) => readFileSync(p, "utf8")) }));
