#!/usr/bin/env node
/**
 * Release gate (PRD-12 T5.7): the release may only proceed when the latest
 * recorded round has aggregates and every bar item's verdict is "pass".
 * A version with no admissible round (e.g. the 3.0.1 dry-run) is refused.
 *
 * Usage: node release-round-check.mjs [--history benchmarks/quality-rebuild/history]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const historyDir = resolve(arg("--history") ?? "benchmarks/quality-rebuild/history");
const indexPath = join(historyDir, "index.jsonl");

function refuse(reason) {
  console.error(`release-round-check: REFUSED — ${reason}`);
  process.exit(1);
}

if (!existsSync(indexPath)) refuse(`no round index at ${indexPath}`);
const lines = readFileSync(indexPath, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
if (lines.length === 0) refuse("round index is empty — no adjudicated round exists");
const latest = JSON.parse(lines[lines.length - 1]);
const roundFile = join(historyDir, "rounds", `${latest.roundId}.json`);
if (!existsSync(roundFile)) refuse(`latest round file missing: ${roundFile}`);
const round = JSON.parse(readFileSync(roundFile, "utf8"));
const aggregates = round.aggregates ?? [];
if (aggregates.length === 0) refuse(`round ${latest.roundId} has no item aggregates`);
const failing = aggregates.filter((a) => a.verdict !== "pass").map((a) => `${a.itemId}=${a.verdict}`);
if (failing.length > 0) refuse(`round ${latest.roundId} non-pass items: ${failing.join(", ")}`);
console.log(`release-round-check: PASS — round ${latest.roundId}, ${aggregates.length} items all pass`);
