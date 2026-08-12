#!/usr/bin/env node
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(appRoot, "aura.assets.json");
const legacyIds = new Set([
  "fighterJinFlux",
  "fighterKadeEmber",
  "fighterMaraVolt",
  "fighterNyxVale",
  "fighterRookAtlas",
  "fighterSableIron",
  "arenaNeonDowntown",
  "auraClashDuelStage",
  "auraClashPlayableScene"
]);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const before = manifest.assets.length;
manifest.assets = manifest.assets.filter((asset) => !legacyIds.has(asset.id));
const removed = before - manifest.assets.length;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const legacySourceSlugs = ["jin-flux", "kade-ember", "mara-volt", "nyx-vale", "rook-atlas", "sable-iron"];
let removedSourceFiles = 0;
for (const slug of legacySourceSlugs) {
  const sourcePath = resolve(appRoot, "assets", "source", "fighters", `fighter-${slug}.glb`);
  if (!existsSync(sourcePath)) continue;
  unlinkSync(sourcePath);
  removedSourceFiles += 1;
}

const retiredArtifactPaths = [
  "assets/source/scenes/aura-clash-duel-stage.glb",
  "assets/source/scenes/aura-clash-playable-scene.glb",
  "public/aura-assets/arenaNeonDowntown.56a42b19.glb",
  "public/aura-assets/arenaNeonDowntown.thumb.svg",
  "public/aura-assets/auraClashDuelStage.09735d3b.glb",
  "public/aura-assets/auraClashDuelStage.thumb.svg",
  "public/aura-assets/auraClashPlayableScene.15296b6b.glb",
  "public/aura-assets/auraClashPlayableScene.thumb.svg",
  "public/aura-assets/arenaNeonDowntownTextured.b29135e4.glb"
];
let removedRetiredArtifacts = 0;
for (const relativePath of retiredArtifactPaths) {
  const artifactPath = resolve(appRoot, relativePath);
  if (!existsSync(artifactPath)) continue;
  unlinkSync(artifactPath);
  removedRetiredArtifacts += 1;
}

console.log(
  `[aura-clash assets] retired ${removed} superseded manifest record(s), ${removedSourceFiles} obsolete fighter source GLB(s), and ${removedRetiredArtifacts} stale scene/public artifact(s); current release rigs and textured arena remain.`
);
