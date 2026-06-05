#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const manifestPath = resolve(root, "assets/quaternius-asset-provenance.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const args = new Set(process.argv.slice(2));

const packs = manifest.packs.filter((pack) => !pack.status.includes("candidate"));

if (args.has("--json")) {
  console.log(JSON.stringify({ verifiedAt: manifest.verifiedAt, packs }, null, 2));
  process.exit(0);
}

console.log("Aura Clash Quaternius asset intake");
console.log("====================================");
console.log(`Manifest: ${manifestPath}`);
console.log(`Target download folder: ${resolve(root, "assets/quaternius-downloads")}`);
console.log("");

for (const pack of packs) {
  console.log(`${pack.title}`);
  console.log(`  Official: ${pack.officialPage}`);
  console.log(`  Itch:     ${pack.itchPage}`);
  console.log(`  Purchase: ${pack.purchasePage}`);
  console.log(`  Archive:  ${pack.standardArchive}${pack.standardSize ? ` (${pack.standardSize})` : ""}`);
  console.log(`  Use:      ${pack.launchUse}`);
  console.log("");
}

if (args.has("--open")) {
  for (const pack of packs) {
    spawnSync("open", [pack.purchasePage], { stdio: "ignore" });
  }
  console.log("Opened official itch.io purchase/download pages in the browser.");
  console.log("Use the free 'No thanks, just take me to the downloads' flow where available, then save archives into assets/quaternius-downloads/.");
  process.exit(0);
}

console.log("Next step:");
console.log("  node apps/aura-clash-showcase/scripts/download-quaternius-assets.mjs --open");
console.log("");
console.log("This script intentionally does not bypass itch.io's browser/session download flow. After archives are saved, extract only selected models/animations, optimize them, and register final GLBs with the Aura3D asset CLI.");
