#!/usr/bin/env node
// node tools/agent-eval/stage.mjs <batch>  -> tools/agent-eval/_stage/<batch>/ (gitignored) ready for remote scoring
import { resolve } from "node:path";
import { stageBatch } from "./lib/stage.mjs";
const repoRoot = resolve(import.meta.dirname, "..", "..");
const tasks = process.argv[3] ? process.argv[3].split(",").map(Number) : null;
const { stage, manifest } = stageBatch({ repoRoot, batch: process.argv[2], tasks });
console.log(`staged ${manifest.snapshots.length} snapshots into ${stage}`);
