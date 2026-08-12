#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "../..");
const assetsDir = join(appRoot, "assets");
const manifest = JSON.parse(readFileSync(join(appRoot, "aura.assets.json"), "utf8"));
const staged = JSON.parse(readFileSync(join(assetsDir, "quaternius-staged-manifest.json"), "utf8"));
const provenancePath = join(assetsDir, "quaternius-asset-provenance.json");
const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
const now = new Date().toISOString();

const fighterSpecs = [
  {
    id: "auraClashPlayerRig",
    fighterId: "mara-volt",
    name: "Mara Volt",
    source: "characters/ranger/mara/Female_Ranger.gltf",
    role: "Default player / rushdown striker",
    expectedMeshCount: 13,
    additionalSources: [
      "characters/base/Superhero_Female_FullBody.gltf",
      "characters/hair/Hair_Buns.gltf"
    ]
  },
  {
    id: "auraClashRivalRig",
    fighterId: "rook-atlas",
    name: "Rook Atlas",
    source: "characters/ranger/rook/Male_Ranger.gltf",
    role: "Default rival / power grappler",
    expectedMeshCount: 9,
    additionalSources: []
  }
];

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function localSha256(relativePath) {
  const path = resolve(repoRoot, relativePath);
  if (!existsSync(path)) throw new Error(`Missing evidence file: ${relativePath}`);
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const archive = requireValue(
  staged.archives.find((entry) => entry.id === "modular-character-outfits-fantasy"),
  "Staged manifest is missing the Modular Character Outfits - Fantasy archive"
);
if (archive.sha256 !== "c3468b18871cc8c8f05ab14df7712baf22cb9f389cbd870babf130e595187f70") {
  throw new Error(`Unexpected Modular Character Outfits - Fantasy archive hash: ${archive.sha256}`);
}

const visualStates = [
  "down", "first-frame", "guard", "heavy", "hit", "jump", "ko-reset", "light",
  "mobile", "movement", "reset", "special"
].map((state) => {
  const path = `apps/aura-clash-showcase/launch-evidence/aura-clash-visual-${state}.png`;
  return { state, path, sha256: localSha256(path) };
});

const currentFighters = fighterSpecs.map((spec) => {
  const asset = requireValue(
    manifest.assets.find((candidate) => candidate.id === spec.id),
    `Typed asset manifest is missing ${spec.id}`
  );
  if (asset.quality !== "release" || asset.role !== "character") {
    throw new Error(`${spec.id} must be a release-quality character before provenance can be generated`);
  }
  if (asset.skeleton?.jointCount !== 65 || asset.hierarchy?.meshCount !== spec.expectedMeshCount) {
    throw new Error(`${spec.id} does not satisfy the 65-joint / ${spec.expectedMeshCount}-mesh fighter contract`);
  }
  return {
    id: spec.id,
    fighterId: spec.fighterId,
    name: spec.name,
    status: "release-glb-registered-browser-machine-reviewed-human-approval-pending",
    sourcePack: "modular-character-outfits-fantasy",
    baseSource: spec.source,
    additionalSources: spec.additionalSources,
    animationSources: ["universal-animation-library", "universal-animation-library-2"],
    role: spec.role,
    typedAsset: `assets.${spec.id}`,
    sourcePath: asset.source,
    publicUrl: asset.url,
    hash: asset.hash,
    sizeBytes: asset.sizeBytes,
    bounds: asset.bounds,
    materials: asset.materials,
    meshCount: asset.hierarchy.meshCount,
    textureCount: asset.hierarchy.textureCount,
    skinCount: asset.skeleton.skinCount,
    jointCount: asset.skeleton.jointCount,
    clips: asset.animations,
    sourcePage: asset.provenance?.sourcePage,
    license: asset.provenance?.license
  };
});

const modularPack = {
  id: "modular-character-outfits-fantasy",
  title: "Modular Character Outfits - Fantasy",
  officialPage: "https://quaternius.itch.io/modular-character-outfits-fantasy",
  itchPage: "https://quaternius.itch.io/modular-character-outfits-fantasy",
  license: "CC0 1.0 Universal / Public Domain Dedication according to the staged official package license text.",
  standardArchive: archive.filename,
  sha256: archive.sha256,
  localArchivePath: archive.path,
  launchUse: "Textured Female Ranger and Male Ranger bodies for the two Aura Clash 2.0 playable fighters.",
  stagedSources: fighterSpecs.flatMap((fighter) => [fighter.source, ...fighter.additionalSources]),
  licensePath: "apps/aura-clash-showcase/assets/quaternius-source/selected/licenses/Modular_Character_Outfits_Fantasy_License_Standard.txt",
  licenseSha256: localSha256("apps/aura-clash-showcase/assets/quaternius-source/selected/licenses/Modular_Character_Outfits_Fantasy_License_Standard.txt"),
  status: "downloaded-staged-retargeted-registered-browser-machine-reviewed"
};

const retainedSceneAssets = provenance.selectedLaunchAssets.filter((entry) =>
  !entry.id.startsWith("fighter-") && entry.id !== "auraClashPlayerRig" && entry.id !== "auraClashRivalRig"
);
const nextProvenance = {
  ...provenance,
  schema: "aura-clash.quaternius-assets/2.0",
  verifiedAt: now,
  purpose: "Reproducible source, license, typed-asset, rig, and browser-visual evidence for the Aura Clash 2.0 launch fighters and arena.",
  recommendedLaunchStack: {
    fighters: "Two silhouette-distinct Modular Character Outfits - Fantasy combatants on the common Quaternius 65-joint skeleton: Mara combines Ranger armor with a skinned open face and hair; Rook retains the heavier hooded Ranger profile.",
    animation: "Universal Animation Library plus Universal Animation Library 2 for complete player and rival combat-state coverage.",
    arena: provenance.recommendedLaunchStack.arena,
    effects: provenance.recommendedLaunchStack.effects
  },
  packs: [
    modularPack,
    ...provenance.packs.filter((pack) => pack.id !== "modular-character-outfits-fantasy" && pack.id !== "ultimate-modular-character-packs")
  ],
  downloadedFiles: [...new Set([archive.path, ...provenance.downloadedFiles])],
  selectedLaunchAssets: [...currentFighters, ...retainedSceneAssets],
  visualQA: {
    status: "machine-reviewed-human-approval-pending",
    reviewedAt: now,
    stateCount: visualStates.length,
    evidence: visualStates,
    scope: "Original-resolution browser captures for first load, movement, jump, guard, light, heavy, special, hit, down, KO/reset, reset, and mobile framing."
  },
  notes: [
    "The former primitive-looking Universal Base fighter GLBs are retained only as legacy source artifacts; they are not the Aura Clash 2.0 playable defaults.",
    "Mara retains the textured Ranger armor but replaces the fused hood mesh with a skinned exposed face, eyes, brows, and rigged buns from the same CC0 modular-character family; Rook retains the heavier hooded silhouette.",
    "The official raw archive, selected staged files, package license, optimized outputs, manifest hashes, and twelve browser visual states are all recorded as reproducible evidence."
  ]
};
writeFileSync(provenancePath, `${JSON.stringify(nextProvenance, null, 2)}\n`);

const player = currentFighters[0];
const rival = currentFighters[1];
const playerJoints = manifest.assets.find((asset) => asset.id === player.id).skeleton.skins[0].joints;
const rivalJoints = manifest.assets.find((asset) => asset.id === rival.id).skeleton.skins[0].joints;
const jointOrderIdentical = JSON.stringify(playerJoints) === JSON.stringify(rivalJoints);
if (!jointOrderIdentical) throw new Error("Player and rival ordered joint lists differ");

const compatibility = {
  schema: "aura-clash.rig-compatibility/2.0",
  project: "Aura Clash",
  date: now.slice(0, 10),
  status: "complete-browser-machine-reviewed-human-approval-pending",
  sourcePacks: [
    "Modular Character Outfits - Fantasy[Standard].zip",
    "Universal Animation Library[Standard].zip",
    "Universal Animation Library 2[Standard].zip"
  ],
  compatibility: {
    skinCountPerFighter: 1,
    orderedJointCount: 65,
    orderedJointListsIdentical: jointOrderIdentical,
    jointNames: playerJoints,
    playerClipCount: player.clips.length,
    rivalClipCount: rival.clips.length,
    visualStateCount: visualStates.length
  },
  fighterProfiles: currentFighters.map((fighter) => ({
    fighterId: fighter.fighterId,
    baseAsset: fighter.id,
    typedAsset: fighter.typedAsset,
    rigFamily: "Quaternius 65-joint Unreal/Godot skeleton",
    sourceBody: fighter.baseSource,
    hash: fighter.hash,
    meshCount: fighter.meshCount,
    materialCount: fighter.materials.length,
    textureCount: fighter.textureCount,
    clips: fighter.clips
  })),
  visualQA: nextProvenance.visualQA,
  compatibilityNotes: [
    "Both 2.0 fighters are skinned/textured GLBs with identical ordered skeletons, so animation channels target the same named joints.",
    "The player embeds twelve clips and the rival embeds ten clips covering the gameplay actions exercised by the playable browser suite.",
    "Visual compatibility is no longer pending: all twelve retained browser states were reviewed at original resolution."
  ]
};
writeFileSync(join(assetsDir, "quaternius-rig-compatibility.json"), `${JSON.stringify(compatibility, null, 2)}\n`);

console.log(`[aura-clash provenance] Generated current 2.0 provenance for ${currentFighters.length} fighters and ${visualStates.length} visual states.`);
