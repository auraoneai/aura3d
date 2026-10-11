#!/usr/bin/env node
/**
 * Prints a READY table (markdown) from every `<set>/report.json` that
 * ci.sh flags-bisect wrote under the given root. Exits 1 when there is none.
 *   node benchmarks/quality-rebuild/scenes/prd10/ready/capture-table.mjs <root>
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root || !existsSync(root)) {
  console.error(`capture-table: no directory ${root}`);
  process.exit(1);
}
const rows = ["| set | scene | status | wall s | draws | error |", "|---|---|---|---|---|---|"];
let found = 0;
for (const dir of readdirSync(root).sort()) {
  const file = join(root, dir, "report.json");
  if (!existsSync(file)) continue;
  found += 1;
  for (const scene of JSON.parse(readFileSync(file, "utf8")).scenes) {
    const a = scene.engines.aura3d ?? {};
    const err = a.error ? String(a.error).split("\n")[0].slice(0, 120) : "";
    rows.push(`| ${dir} | ${scene.scene} | ${a.status} | ${((a.wallMs ?? 0) / 1000).toFixed(1)} | ${a.payload?.drawCalls ?? "-"} | ${err} |`);
  }
}
if (found === 0) {
  console.error(`capture-table: no report.json under ${root}`);
  process.exit(1);
}
console.log(rows.join("\n"));
