#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const cliEntry = join(repoRoot, "dist/aura3d-cli/cli.js");

const requiredAssets = [
  ["auraClashPlayerRig", "assets/source/fighters/aura-clash-player-rig.glb"],
  ["auraClashRivalRig", "assets/source/fighters/aura-clash-rival-rig.glb"],
  // The textured build of the same arena, produced by `assets:build-textured-arena`. The untextured
  // export above ships zero images and leaves 84 materials without metallic/roughness factors, which
  // glTF defaults to 1.0 -- fully metallic, no diffuse, renders black. This is the variant the
  // playable route binds.
  ["arenaNeonDowntownTextured", "assets/source/arenas/arena-neon-downtown-textured.glb"],
  ["arenaRooftopBuilding", "assets/source/arenas/arena-rooftop-building.glb"],
];

function fail(message) {
  console.error(`[aura-clash register-assets] ${message}`);
  process.exit(1);
}

if (!existsSync(cliEntry)) {
  fail(`Missing local Aura3D CLI entry: ${cliEntry}`);
}

for (const [name, relativePath] of requiredAssets) {
  const assetPath = join(appRoot, relativePath);
  if (!existsSync(assetPath)) {
    fail(`Missing required source GLB for ${name}: ${assetPath}`);
  }

  const provenanceArgs = name === "auraClashPlayerRig" || name === "auraClashRivalRig"
    ? [
        "--license", "CC0-1.0",
        "--license-name", "CC0 1.0 Universal",
        "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
        "--source-page", "https://quaternius.itch.io/modular-character-outfits-fantasy",
        "--source-url", "https://quaternius.itch.io/modular-character-outfits-fantasy",
        "--author", "Quaternius",
        "--source-family", "Quaternius Modular Character Outfits - Fantasy + Universal Animation Library",
        "--quality", "release",
        "--role", "character",
        "--suitability", "Aura Clash 2.0 animated primary fighter; twelve-state browser visual suite machine-reviewed, human approval pending"
      ]
    : [];
  const result = spawnSync(process.execPath, [cliEntry, "assets", "add", relative(appRoot, assetPath), "--name", name, ...provenanceArgs], {
    cwd: appRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    fail(`Aura3D asset registration failed for ${name}`);
  }
}

// Asset registration is content-addressed. Keep exactly the manifest-selected build for each actively
// registered model so stale hashes cannot bloat deployment or distort the performance gate.
const manifest = JSON.parse(readFileSync(join(appRoot, "aura.assets.json"), "utf8"));
const publicAssetDir = join(appRoot, "public/aura-assets");
let prunedSupersededBuilds = 0;
for (const [name] of requiredAssets) {
  const current = manifest.assets.find((asset) => asset.id === name);
  const retainedFilename = current?.url ? basename(current.url) : null;
  if (!retainedFilename) fail(`Manifest did not publish a URL for ${name}`);
  const versionPattern = new RegExp(`^${name}\\.[0-9a-f]{8}\\.glb$`);
  for (const filename of readdirSync(publicAssetDir)) {
    if (!versionPattern.test(filename) || filename === retainedFilename) continue;
    unlinkSync(join(publicAssetDir, filename));
    prunedSupersededBuilds += 1;
  }
}

const typegenPath = join(appRoot, "src/aura-assets.ts");
if (existsSync(typegenPath)) {
  const generated = readFileSync(typegenPath, "utf8");
  writeFileSync(
    typegenPath,
    generated.replace('import { defineAuraAssets } from "../engine/index.js";', 'import { defineAuraAssets } from "@aura3d/engine";'),
  );
}

console.log(`[aura-clash register-assets] Registered ${requiredAssets.length} typed Aura3D assets and pruned ${prunedSupersededBuilds} superseded content-addressed GLB(s).`);
