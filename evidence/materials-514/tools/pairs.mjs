// usage: node pairs.mjs <dir> <game>... -> mean abs diff / max diff for baseA|baseB, branchA|branchB, baseA|branchA, baseB|branchB (and md5s)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [dir, ...games] = process.argv.slice(2);
for (const g of games) {
  const row = { game: g };
  for (const [a, b] of [["baseA", "baseB"], ["branchA", "branchB"], ["baseA", "branchA"], ["baseB", "branchB"]]) {
    const fa = `${dir}/${g}-${a}.png`, fb = `${dir}/${g}-${b}.png`;
    if (!existsSync(fa) || !existsSync(fb)) { row[`${a}|${b}`] = "missing"; continue; }
    const j = JSON.parse(execFileSync("node", [path.join(here, "diff.mjs"), fa, fb], { encoding: "utf8" }));
    row[`${a}|${b}`] = `${j.meanAbsDiff}/max${j.maxDiff}`;
    row.lumaA ??= j.meanLumaA;
    row.nonBlackA ??= j.nonBlackFracA;
  }
  for (const n of ["baseA", "baseB", "branchA", "branchB"]) {
    const f = `${dir}/${g}-${n}.png`;
    if (existsSync(f)) row[`md5_${n}`] = createHash("md5").update(readFileSync(f)).digest("hex").slice(0, 8);
  }
  console.log(JSON.stringify(row));
}
