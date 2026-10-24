#!/usr/bin/env node
// node tools/agent-eval/extract.mjs <batch> <acr-run.log>...  -> evidence/agent-eval/<batch>/remote/{results.json,frames/}
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeRemote } from "./lib/extract.mjs";
const repoRoot = resolve(import.meta.dirname, "..", "..");
const args = process.argv.slice(2);
const merge = args.includes("--merge");
const [batch, ...logs] = args.filter((a) => a !== "--merge");
console.log(writeRemote({ outDir: resolve(repoRoot, "evidence/agent-eval", batch, "remote"), logs: logs.map((p) => readFileSync(p, "utf8")), merge }));
