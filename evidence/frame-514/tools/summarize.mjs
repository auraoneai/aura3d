// Prints the before/after table from frames/*.json and writes frames/SUMMARY.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../frames");
const rows = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "SUMMARY.json").sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const table = rows.map((r) => ({
  id: r.id,
  subjectFill: r.subjectFill === null ? null : Number(r.subjectFill.toFixed(3)),
  subjectFillRun2: r.subjectFillRun2 === null ? null : Number(r.subjectFillRun2.toFixed(3)),
  sameBuildNoiseMeanAbsDiff: Number(r.sameBuildNoiseMeanAbsDiff.toFixed(4)),
  meanLuma: Number(r.meanLuma.toFixed(1)),
  nearBlackFraction: Number(r.nearBlackFraction.toFixed(4)),
  distinctColours16: r.distinctColours16,
  realGameFrame: r.realGameFrame,
  consoleErrors: r.consoleErrors.length
}));
console.table(table);
fs.writeFileSync(path.join(dir, "SUMMARY.json"), JSON.stringify(table, null, 2));
