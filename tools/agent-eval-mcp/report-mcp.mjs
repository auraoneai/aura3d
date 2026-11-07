#!/usr/bin/env node
// node tools/agent-eval/report-mcp.mjs <evidenceDir> <batch>...   turns/tokens tables for the lane 511 MCP trial (no render scoring).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
// Same formula as report-504.mjs: new tokens at 1.0 plus the previous turn prompt at 0.1.
function cachedCost(perTurn) {
  let cost = 0;
  perTurn.forEach((n, i) => {
    cost += i === 0 ? n : Math.max(0, n - perTurn[i - 1]) + 0.1 * perTurn[i - 1];
  });
  return cost;
}

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const k = (n) => `${Math.round(n / 1000)}K`;
const [dir, ...batches] = process.argv.slice(2);
const rows = [];
for (const batch of batches) {
  const runsDir = join(dir, batch, "runs");
  if (!existsSync(runsDir)) continue;
  for (const id of readdirSync(runsDir)) {
    const f = join(runsDir, id, "run.json");
    if (existsSync(f)) rows.push(JSON.parse(readFileSync(f, "utf8")));
  }
}
const label = { B: "B aura_lookup (control, rerun)", M: "M MCP tools only", N: "N cheat sheet + MCP tools" };
const stat = (xs) => {
  const valid = xs.filter((x) => !x.invalid && x.usage);
  const count = (x, t) => x.events.filter((e) => e.type === t).length;
  return {
    n: valid.length,
    invalid: xs.length - valid.length,
    turns: `${med(valid.map((x) => x.usage.turns))} (${Math.min(...valid.map((x) => x.usage.turns))}-${Math.max(...valid.map((x) => x.usage.turns))})`,
    finished: `${valid.filter((x) => x.endReason === "finished").length}/${valid.length}`,
    tc: `${valid.filter((x) => x.firstTryTypecheck).length}/${valid.length}`,
    final: `${valid.filter((x) => x.finalTypecheckPass).length}/${valid.length}`,
    mcp: med(valid.map((x) => count(x, "mcp") + count(x, "lookup"))),
    reads: med(valid.map((x) => count(x, "list") + count(x, "search") + x.docsOpened.length + x.typesOpened.length)),
    input: k(med(valid.map((x) => x.usage.input))),
    output: k(med(valid.map((x) => x.usage.output))),
    cached: k(med(valid.map((x) => cachedCost(x.usage.perTurnInput))))
  };
};
const out = [];
const header = "| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |";
const sep = "|---|---|---|---|---|---|---|---|---|---|---|";
const line = (name, s) => `| ${name} | ${s.n}${s.invalid ? ` (+${s.invalid} invalid)` : ""} | ${s.turns} | ${s.finished} | ${s.tc} | ${s.final} | ${s.mcp} | ${s.reads} | ${s.input} | ${s.output} | ${s.cached} |`;
for (const task of [2, 5, 8, 9]) {
  out.push(`Task ${task}`, "", header, sep);
  for (const c of ["B", "M", "N"]) out.push(line(label[c], stat(rows.filter((r) => Number(r.task) === task && r.condition === c))));
  out.push("");
}
out.push("All four tasks pooled", "", header, sep);
for (const c of ["B", "M", "N"]) out.push(line(label[c], stat(rows.filter((r) => r.condition === c))));
console.log(out.join("\n"));
