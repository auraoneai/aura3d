#!/usr/bin/env node
/* Drop the per-pixel luma planes (300 KB each) from committed wp7.json files; the matched-frame JPEGs stay. Usage: node wp7-strip.mjs <wp7.json>... */
import { readFileSync, writeFileSync } from "node:fs";

for (const file of process.argv.slice(2)) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  for (const arm of Object.values(data)) delete arm.luma;
  writeFileSync(file, JSON.stringify(data, null, 1));
  console.log(`stripped ${file}`);
}
