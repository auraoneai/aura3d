#!/usr/bin/env node
/**
 * tools/qr-ownership/check.mjs — resolves `.github/QR_OWNERSHIP.json` by longest
 * matching prefix (CONTRACTS.md §4). With no arguments it checks every tracked
 * file resolves to an owner; with paths, it prints the owner per path.
 *
 * Usage:
 *   node tools/qr-ownership/check.mjs            # audit all tracked files
 *   node tools/qr-ownership/check.mjs <path>...  # owner of specific paths
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ownership = JSON.parse(readFileSync(new URL("../../.github/QR_OWNERSHIP.json", import.meta.url)));

function laneFromPath(path) {
  const m = /(?:^|\/)(prd\d{2})(?:[./-]|$)|PRD-(\d{2})-/.exec(path);
  if (!m) return null;
  return (m[1] ?? m[2] ?? "").replace("prd", "").replace(/^0/, "0");
}

function ownerFor(path) {
  // Per-lane patterns first: `prdNN` in a lane slot maps to lane NN.
  const laneM = /lanes\/(prd\d{2})|commands\/(prd\d{2})|scenes\/(prd\d{2})|diagnosticOnly\.(prd\d{2})\.|qr-(prd\d{2})-|impl\/(prd\d{2})-|evidence\/prd-?(\d{2})|PRD-(\d{2})-/.exec(path);
  if (laneM) {
    const nn = laneM.slice(1).find(Boolean)?.replace(/\D/g, "");
    if (nn) return nn.padStart(2, "0");
  }
  let best = null;
  for (const rule of ownership.rules) {
    for (const prefix of rule.paths) {
      if ((path === prefix || path.startsWith(prefix)) && (!best || prefix.length > best.prefix.length)) {
        best = { owner: rule.owner, prefix };
      }
    }
  }
  return best?.owner ?? ownership.defaultOwner;
}

const args = process.argv.slice(2);
if (args.length > 0) {
  for (const p of args) console.log(`${ownerFor(p)}\t${p}`);
  process.exit(0);
}

const files = execSync("git ls-files", { encoding: "utf8" }).trim().split("\n");
const counts = new Map();
for (const f of files) {
  const o = ownerFor(f);
  counts.set(o, (counts.get(o) ?? 0) + 1);
}
const owners = [...counts.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
for (const [o, n] of owners) console.log(`owner ${o}: ${n} files`);
console.log(`${files.length} files resolved; default owner: ${ownership.defaultOwner}`);
