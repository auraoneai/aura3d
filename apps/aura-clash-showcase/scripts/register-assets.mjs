#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const cliEntry = join(repoRoot, "dist/aura3d-cli/cli.js");

const requiredAssets = [
  ["fighterMaraVolt", "assets/source/fighters/fighter-mara-volt.glb"],
  ["fighterRookAtlas", "assets/source/fighters/fighter-rook-atlas.glb"],
  ["fighterNyxVale", "assets/source/fighters/fighter-nyx-vale.glb"],
  ["fighterKadeEmber", "assets/source/fighters/fighter-kade-ember.glb"],
  ["fighterSableIron", "assets/source/fighters/fighter-sable-iron.glb"],
  ["fighterJinFlux", "assets/source/fighters/fighter-jin-flux.glb"],
  ["arenaNeonDowntown", "assets/source/arenas/arena-neon-downtown.glb"],
  ["auraClashDuelStage", "assets/source/scenes/aura-clash-duel-stage.glb"],
  ["auraClashPlayableScene", "assets/source/scenes/aura-clash-playable-scene.glb"],
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

  const result = spawnSync(process.execPath, [cliEntry, "assets", "add", relative(appRoot, assetPath), "--name", name], {
    cwd: appRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    fail(`Aura3D asset registration failed for ${name}`);
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

console.log(`[aura-clash register-assets] Registered ${requiredAssets.length} typed Aura3D assets.`);
