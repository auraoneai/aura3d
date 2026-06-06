#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");

const requiredAssets = [
  {
    name: "fighterMaraVolt",
    source: "assets/source/fighters/fighter-mara-volt.glb",
    maxSizeBytes: 2_000_000,
  },
  {
    name: "fighterRookAtlas",
    source: "assets/source/fighters/fighter-rook-atlas.glb",
    maxSizeBytes: 2_000_000,
  },
  {
    name: "fighterNyxVale",
    source: "assets/source/fighters/fighter-nyx-vale.glb",
    maxSizeBytes: 2_000_000,
  },
  {
    name: "fighterKadeEmber",
    source: "assets/source/fighters/fighter-kade-ember.glb",
    maxSizeBytes: 2_000_000,
  },
  {
    name: "fighterSableIron",
    source: "assets/source/fighters/fighter-sable-iron.glb",
    maxSizeBytes: 2_000_000,
  },
  {
    name: "fighterJinFlux",
    source: "assets/source/fighters/fighter-jin-flux.glb",
    maxSizeBytes: 2_000_000,
  },
  {
    name: "arenaNeonDowntown",
    source: "assets/source/arenas/arena-neon-downtown.glb",
    maxSizeBytes: 25_000_000,
  },
  {
    name: "auraClashDuelStage",
    source: "assets/source/scenes/aura-clash-duel-stage.glb",
    maxSizeBytes: 18_000_000,
  },
  {
    name: "auraClashPlayableScene",
    source: "assets/source/scenes/aura-clash-playable-scene.glb",
    maxSizeBytes: 22_000_000,
  },
  {
    name: "auraClashTrainingMannequin",
    source: "assets/quaternius-source/selected/animations/UAL1_Standard.glb",
    maxSizeBytes: 9_000_000,
  },
];

const fighterAssetNames = new Set([
  "fighterMaraVolt",
  "fighterRookAtlas",
  "fighterNyxVale",
  "fighterKadeEmber",
  "fighterSableIron",
  "fighterJinFlux",
]);

const routeUseSourceFiles = [
  "src/main.ts",
  "src/playable/AuraClashArenaApp.ts",
  "src/scenes/createFighterNodes.ts",
  "src/scenes/createFightScene.ts",
  "src/scenes/createStageScene.ts",
];

function fail(message) {
  console.error(`[aura-clash production-assets] ${message}`);
  process.exitCode = 1;
}

function assertGlb(path) {
  if (!existsSync(path)) {
    fail(`Missing file: ${path}`);
    return;
  }

  const header = readFileSync(path).subarray(0, 4).toString("utf8");
  if (header !== "glTF") {
    fail(`File is not a binary GLB: ${path}`);
  }

  const size = statSync(path).size;
  if (size < 1024) {
    fail(`GLB is suspiciously small: ${path}`);
  }
  return size;
}

function sha256File(path) {
  return `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function readJsonFile(path, label) {
  if (!existsSync(path)) {
    fail(`Missing ${label}: ${path}`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function assertBounds(name, bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 3) {
    fail(`Manifest entry for ${name} is missing 3D bounds.`);
    return;
  }

  for (const value of bounds) {
    if (!Number.isFinite(value) || value <= 0) {
      fail(`Manifest entry for ${name} has invalid bounds: ${bounds.join(", ")}`);
      return;
    }
  }
}

function assertMatchingBounds(name, actual, expected) {
  assertBounds(name, actual);
  if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
    fail(`Bounds mismatch for ${name}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
    return;
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (Math.abs(Number(actual[index]) - Number(expected[index])) > 0.001) {
      fail(`Bounds mismatch for ${name}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
      return;
    }
  }
}

function assertString(value, message) {
  if (typeof value !== "string" || value.length === 0) {
    fail(message);
    return false;
  }

  return true;
}

function assertArrayIncludes(value, expected, message) {
  if (!Array.isArray(value) || !value.some((item) => typeof item === "string" && item.includes(expected))) {
    fail(message);
  }
}

const typedAssetFile = join(appRoot, "src/aura-assets.ts");
const manifestFile = join(appRoot, "aura.assets.json");
const sourceGlbManifestFile = join(appRoot, "assets/source/aura-clash-source-glbs.json");
const launchAssetEvidenceFile = join(appRoot, "assets/source/aura-clash-launch-asset-evidence.json");
const referencedPublicGlbs = new Set();
const manifestEntriesByName = new Map();
let manifest = null;
if (!existsSync(manifestFile)) {
  fail(`Missing Aura3D asset manifest: ${manifestFile}`);
} else {
  manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
}

for (const asset of requiredAssets) {
  const sourcePath = join(appRoot, asset.source);
  const sourceSize = assertGlb(sourcePath);

  const manifestEntry = manifest?.assets?.find((entry) => entry.id === asset.name);
  if (!manifestEntry) {
    fail(`Missing manifest entry for ${asset.name}`);
    continue;
  }
  manifestEntriesByName.set(asset.name, manifestEntry);

  if (manifestEntry.source !== asset.source) {
    fail(`Manifest source mismatch for ${asset.name}: expected ${asset.source}, found ${manifestEntry.source}`);
  }

  const outputPath = join(appRoot, manifestEntry.outputPath);
  const outputSize = assertGlb(outputPath);
  referencedPublicGlbs.add(resolve(outputPath));

  if (sourceSize !== undefined && outputSize !== undefined && sourceSize !== outputSize) {
    fail(`Source/output size mismatch for ${asset.name}: source ${sourceSize}, output ${outputSize}`);
  }

  if (outputSize !== manifestEntry.sizeBytes) {
    fail(`Manifest size mismatch for ${asset.name}: expected ${outputSize}, found ${manifestEntry.sizeBytes}`);
  }

  const outputHash = sha256File(outputPath);
  if (manifestEntry.hash !== outputHash) {
    fail(`Manifest hash mismatch for ${asset.name}: expected ${outputHash}, found ${manifestEntry.hash}`);
  }

  const sourceHash = sha256File(sourcePath);
  if (sourceHash !== manifestEntry.hash) {
    fail(`Source hash mismatch for ${asset.name}: expected ${manifestEntry.hash}, found ${sourceHash}`);
  }

  if (outputSize > asset.maxSizeBytes) {
    fail(`Registered output for ${asset.name} exceeds ${asset.maxSizeBytes} bytes: ${outputSize}`);
  }

  if (!manifestEntry.url?.startsWith("/aura-assets/")) {
    fail(`Manifest URL for ${asset.name} does not use /aura-assets/: ${manifestEntry.url}`);
  }

  if (!/[a-f0-9]{8}\.glb$/i.test(manifestEntry.outputPath)) {
    fail(`Manifest output for ${asset.name} is not fingerprinted: ${manifestEntry.outputPath}`);
  }

  assertBounds(asset.name, manifestEntry.bounds);

  if (!Array.isArray(manifestEntry.materials) || manifestEntry.materials.length === 0) {
    fail(`Manifest entry for ${asset.name} is missing material inspection data.`);
  }

  if (!manifestEntry.thumbnailUrl) {
    fail(`Manifest entry for ${asset.name} is missing thumbnailUrl.`);
  } else {
    const thumbnailPath = join(appRoot, manifestEntry.thumbnailUrl.replace(/^\//, "public/"));
    if (!existsSync(thumbnailPath)) {
      fail(`Missing thumbnail for ${asset.name}: ${thumbnailPath}`);
    } else if (statSync(thumbnailPath).size < 100) {
      fail(`Thumbnail for ${asset.name} is suspiciously small: ${thumbnailPath}`);
    }
  }
}

const publicAssetDir = join(appRoot, "public/aura-assets");
for (const file of readdirSync(publicAssetDir)) {
  if (!file.endsWith(".glb")) continue;
  const publicGlbPath = resolve(publicAssetDir, file);
  if (!referencedPublicGlbs.has(publicGlbPath)) {
    fail(`Unreferenced stale public GLB should not ship: ${publicGlbPath}`);
  }
}

if (!existsSync(typedAssetFile)) {
  fail(`Missing typed asset module: ${typedAssetFile}`);
} else {
  const typedAssets = readFileSync(typedAssetFile, "utf8");
  for (const asset of requiredAssets) {
    if (!typedAssets.includes(asset.name)) {
      fail(`Typed asset module does not include ${asset.name}`);
    }
  }
}

assertSourceGlbManifest(readJsonFile(sourceGlbManifestFile, "Aura Clash source GLB manifest"));
assertLaunchAssetEvidence(readJsonFile(launchAssetEvidenceFile, "Aura Clash launch asset evidence"));
assertLaunchRouteUse();

const provenancePath = join(appRoot, "assets/quaternius-asset-provenance.json");
if (!existsSync(provenancePath)) {
  fail(`Missing Quaternius provenance file: ${provenancePath}`);
}

if (process.exitCode) {
  console.error("[aura-clash production-assets] Production asset gate failed.");
} else {
  console.log(`[aura-clash production-assets] ${requiredAssets.length} GLB assets, typed refs, source evidence, no primitive-fallback approval, and launch route use are present.`);
}

function assertSourceGlbManifest(sourceManifest) {
  if (!sourceManifest) {
    return;
  }

  if (!sourceManifest.sourceEvidenceContract?.typedAssetRule?.includes("assets.<assetKey>")) {
    fail("Source GLB manifest must state the typed assets.<assetKey> rule.");
  }

  const outputs = Array.isArray(sourceManifest.outputs) ? sourceManifest.outputs : [];
  const outputsByAssetKey = new Map(outputs.map((entry) => [entry.assetKey, entry]));

  for (const asset of requiredAssets) {
    const sourceEntry = outputsByAssetKey.get(asset.name);
    const manifestEntry = manifestEntriesByName.get(asset.name);
    if (!sourceEntry) {
      fail(`Source GLB manifest is missing ${asset.name}`);
      continue;
    }

    if (sourceEntry.path !== asset.source) {
      fail(`Source GLB manifest path mismatch for ${asset.name}: expected ${asset.source}, found ${sourceEntry.path}`);
    }

    if (!manifestEntry) {
      continue;
    }

    if (fighterAssetNames.has(asset.name)) {
      if (sourceEntry.deliveryMode !== "typed-glb") {
        fail(`Source GLB manifest fighter ${asset.name} must use deliveryMode=typed-glb.`);
      }
      if (sourceEntry.typedAsset !== `assets.${asset.name}`) {
        fail(`Source GLB manifest fighter ${asset.name} must use typedAsset assets.${asset.name}.`);
      }
      if (sourceEntry.publicUrl !== manifestEntry.url) {
        fail(`Source GLB manifest publicUrl mismatch for ${asset.name}: expected ${manifestEntry.url}, found ${sourceEntry.publicUrl}`);
      }
      if (sourceEntry.hash !== manifestEntry.hash) {
        fail(`Source GLB manifest hash mismatch for ${asset.name}: expected ${manifestEntry.hash}, found ${sourceEntry.hash}`);
      }
      if (sourceEntry.sizeBytes !== manifestEntry.sizeBytes) {
        fail(`Source GLB manifest size mismatch for ${asset.name}: expected ${manifestEntry.sizeBytes}, found ${sourceEntry.sizeBytes}`);
      }
      assertMatchingBounds(`source GLB manifest ${asset.name}`, sourceEntry.bounds, manifestEntry.bounds);
      if (!Array.isArray(sourceEntry.materials) || sourceEntry.materials.length === 0) {
        fail(`Source GLB manifest fighter ${asset.name} must include material evidence.`);
      }
      if (sourceEntry.thumbnailUrl !== manifestEntry.thumbnailUrl) {
        fail(`Source GLB manifest thumbnail mismatch for ${asset.name}: expected ${manifestEntry.thumbnailUrl}, found ${sourceEntry.thumbnailUrl}`);
      }
      if (!sourceEntry.provenance?.sourcePack || !sourceEntry.provenance?.sourceArchiveSha256) {
        fail(`Source GLB manifest fighter ${asset.name} must include Quaternius provenance and archive hash.`);
      }
      if (!String(sourceEntry.fallbackApproval ?? "").startsWith("none")) {
        fail(`Source GLB manifest fighter ${asset.name} must not approve a primitive fallback.`);
      }
      assertArrayIncludes(sourceEntry.launchRouteUse, "/playable/", `Source GLB manifest fighter ${asset.name} must include /playable/ route use.`);
      assertArrayIncludes(sourceEntry.launchRouteUse, `assets.${asset.name}`, `Source GLB manifest fighter ${asset.name} must include typed route use for assets.${asset.name}.`);
    }
  }

  const fallbackApproval = sourceManifest.sourceEvidenceContract?.noPrimitiveFallbackApproval;
  if (!fallbackApproval || !Array.isArray(fallbackApproval.approvedPrimitiveFallbacks) || fallbackApproval.approvedPrimitiveFallbacks.length !== 0) {
    fail("Source GLB manifest must explicitly keep approvedPrimitiveFallbacks empty.");
  }
}

function assertLaunchAssetEvidence(launchEvidence) {
  if (!launchEvidence) {
    return;
  }

  if (!String(launchEvidence.sourcePolicy?.fallbackRule ?? "").includes("No stylized primitive fighter fallback is approved")) {
    fail("Launch asset evidence must explicitly reject primitive fighter fallback approval.");
  }

  if (!launchEvidence.gateSourceReadiness?.sourceReady) {
    fail("Launch asset evidence must mark gates 264/265 sourceReady while keeping browser/deploy proof separate.");
  }

  if (!launchEvidence.gateSourceReadiness?.browserProofStillNeeded) {
    fail("Launch asset evidence must keep browser proof marked as still needed.");
  }

  if (!launchEvidence.gateSourceReadiness?.deployProofStillNeeded) {
    fail("Launch asset evidence must keep deploy proof marked as still needed.");
  }

  const approvedPrimitiveFallbacks = launchEvidence.playableFighterEvidenceSummary?.approvedPrimitiveFallbacks;
  if (!Array.isArray(approvedPrimitiveFallbacks) || approvedPrimitiveFallbacks.length !== 0) {
    fail("Launch asset evidence must keep playableFighterEvidenceSummary.approvedPrimitiveFallbacks empty.");
  }

  const launchGlbs = Array.isArray(launchEvidence.launchGlbs) ? launchEvidence.launchGlbs : [];
  const launchGlbsByAssetKey = new Map(launchGlbs.map((entry) => [entry.assetKey, entry]));

  for (const asset of requiredAssets) {
    const launchEntry = launchGlbsByAssetKey.get(asset.name);
    const manifestEntry = manifestEntriesByName.get(asset.name);
    if (!launchEntry) {
      fail(`Launch asset evidence is missing ${asset.name}`);
      continue;
    }

    if (!manifestEntry) {
      continue;
    }

    if (launchEntry.typedAsset !== `assets.${asset.name}`) {
      fail(`Launch asset evidence ${asset.name} typedAsset mismatch: expected assets.${asset.name}, found ${launchEntry.typedAsset}`);
    }
    if (launchEntry.sourcePath !== `apps/aura-clash-showcase/${asset.source}`) {
      fail(`Launch asset evidence ${asset.name} sourcePath mismatch: expected apps/aura-clash-showcase/${asset.source}, found ${launchEntry.sourcePath}`);
    }
    if (launchEntry.publicUrl !== manifestEntry.url) {
      fail(`Launch asset evidence ${asset.name} publicUrl mismatch: expected ${manifestEntry.url}, found ${launchEntry.publicUrl}`);
    }
    if (launchEntry.hash !== manifestEntry.hash) {
      fail(`Launch asset evidence ${asset.name} hash mismatch: expected ${manifestEntry.hash}, found ${launchEntry.hash}`);
    }
    if (launchEntry.sizeBytes !== manifestEntry.sizeBytes) {
      fail(`Launch asset evidence ${asset.name} size mismatch: expected ${manifestEntry.sizeBytes}, found ${launchEntry.sizeBytes}`);
    }
    assertMatchingBounds(`launch asset evidence ${asset.name}`, launchEntry.bounds, manifestEntry.bounds);
    if (launchEntry.thumbnailUrl !== manifestEntry.thumbnailUrl) {
      fail(`Launch asset evidence ${asset.name} thumbnailUrl mismatch: expected ${manifestEntry.thumbnailUrl}, found ${launchEntry.thumbnailUrl}`);
    }
    assertString(launchEntry.materialSummary, `Launch asset evidence ${asset.name} must include materialSummary.`);
    assertArrayIncludes(launchEntry.intendedRouteUsage, "/evidence/", `Launch asset evidence ${asset.name} must include /evidence/ route usage.`);

    if (fighterAssetNames.has(asset.name)) {
      if (launchEntry.deliveryMode !== "typed-glb") {
        fail(`Launch asset evidence fighter ${asset.name} must use deliveryMode=typed-glb.`);
      }
      if (!launchEntry.provenance?.sourcePack || !launchEntry.provenance?.sourceArchiveSha256) {
        fail(`Launch asset evidence fighter ${asset.name} must include Quaternius provenance and archive hash.`);
      }
      if (!String(launchEntry.licenseNote ?? "").includes("Quaternius")) {
        fail(`Launch asset evidence fighter ${asset.name} must include a Quaternius license note.`);
      }
      assertArrayIncludes(launchEntry.intendedRouteUsage, "/playable/", `Launch asset evidence fighter ${asset.name} must include /playable/ route usage.`);

      const sourceValidation = launchEntry.sourceValidationEvidence ?? {};
      for (const field of ["scale", "poseSource", "pivotPolicy", "facingPolicy", "boundsEvidence", "materialReadabilityEvidence", "thumbnailEvidence", "fallbackApproval"]) {
        if (sourceValidation[field] === undefined) {
          fail(`Launch asset evidence fighter ${asset.name} sourceValidationEvidence is missing ${field}.`);
        }
      }
      if (!String(sourceValidation.fallbackApproval ?? "").startsWith("none")) {
        fail(`Launch asset evidence fighter ${asset.name} must not approve a primitive fallback.`);
      }
    }
  }
}

function assertLaunchRouteUse() {
  let source = "";
  for (const routeFile of routeUseSourceFiles) {
    const fullPath = join(appRoot, routeFile);
    if (!existsSync(fullPath)) {
      fail(`Missing launch route source file: ${fullPath}`);
      continue;
    }
    source += `\n// ${routeFile}\n${readFileSync(fullPath, "utf8")}`;
  }

  if (!source.includes("model(assets.auraClashDuelStage")) {
    fail("Launch route source must compose the live stage with model(assets.auraClashDuelStage).");
  }

  for (const assetName of fighterAssetNames) {
    if (!source.includes(`assets.${assetName}`)) {
      fail(`Launch route source must reference typed fighter asset assets.${assetName}.`);
    }
  }

  if (!source.includes("assets.auraClashTrainingMannequin")) {
    fail("Launch route source must reference the active typed training mannequin asset assets.auraClashTrainingMannequin.");
  }

  if (/model\(\s*["'`]/.test(source)) {
    fail("Launch route source must not pass string asset ids to model().");
  }

  if (source.includes("unsafeModelUrl(")) {
    fail("Launch route source must not use unsafeModelUrl for launch assets.");
  }
}
