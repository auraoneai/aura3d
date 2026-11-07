// usage: node allpairs.mjs <a.png> <b.png> ... -> md5 per file and mean/max diff for every pair (run-to-run noise matrix)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2);
for (const f of files) console.log(path.basename(f), createHash("md5").update(readFileSync(f)).digest("hex").slice(0, 8));
for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
  const d = JSON.parse(execFileSync("node", [path.join(here, "diff.mjs"), files[i], files[j]], { encoding: "utf8" }));
  console.log(`${path.basename(files[i])} | ${path.basename(files[j])}: mean ${d.meanAbsDiff} max ${d.maxDiff}`);
}
