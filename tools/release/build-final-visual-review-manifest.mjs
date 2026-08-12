#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const output = "release-artifacts/2.0-final-visual-review-manifest.json";
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

const flagshipIds = [
  "showcase-product-configurator",
  "showcase-smart-city-control",
  "showcase-cinematic-architecture",
  "showcase-digital-twin-ops"
];
const flagshipFiles = flagshipIds.flatMap((id) => [
  `tests/reports/showcase-library-screenshots/${id}-desktop.png`,
  `tests/reports/showcase-library-screenshots/${id}-mobile.png`,
  `tests/reports/showcase-interaction-audit/${id}-final.png`
]);

const gameFiles = [
  "tests/reports/showcase-library-screenshots/showcase-blockfall-reactor-desktop.png",
  "tests/reports/showcase-library-screenshots/showcase-blockfall-reactor-mobile.png",
  ...["before-input", "after-input", "line-clear", "game-over", "reset"].map((state) =>
    `tests/reports/showcase-gameplay/showcase-blockfall-reactor-${state}.png`),
  "tests/reports/showcase-library-screenshots/showcase-skyline-runner-desktop.png",
  "tests/reports/showcase-library-screenshots/showcase-skyline-runner-mobile.png",
  ...[
    "before-input", "after-input", "traversal", "jump", "landing",
    "act-broken-canopy", "act-cloudstep-rise", "act-sentry-pass", "act-aurora-crown",
    "collection-chain", "checkpoint", "respawn", "finish", "reset"
  ].map((state) => `tests/reports/showcase-gameplay/showcase-skyline-runner-${state}.png`),
  "tests/reports/showcase-library-screenshots/showcase-turbo-drift-circuit-desktop.png",
  "tests/reports/showcase-library-screenshots/showcase-turbo-drift-circuit-mobile.png",
  ...[
    "before-input", "after-input", "checkpoint", "drift", "high-speed-chase",
    "off-track", "reset"
  ].map((state) => `tests/reports/showcase-gameplay/showcase-turbo-drift-circuit-${state}.png`)
];

const auraClashFiles = [
  "first-frame", "movement", "jump", "light", "heavy", "special", "guard",
  "hit", "down", "ko-reset", "reset", "mobile"
].map((state) => `apps/aura-clash-showcase/launch-evidence/aura-clash-visual-${state}.png`);

const comparisonWorkloads = [
  ["primitive-scene", "aura.png", "three.png"],
  ["gltf-product-viewer", "aura.png", "three.png"],
  ["cinematic-architecture", "aura-after.png", "three-after.png"],
  ["digital-twin-data", "aura-after.png", "three-after.png"],
  ["instancing-lod", "aura-near.png", "three-near.png"],
  ["skinned-morph-animation", "aura-after.png", "three-after.png"],
  ["custom-material-shader", "aura-after.png", "three-after.png"],
  ["postprocessed-scene", "aura-on.png", "three-on.png"],
  ["physical-character", "aura-after.png", "three-after.png"],
  ["physical-vehicle", "aura-after.png", "three-after.png"],
  ["navigation-crowd", "aura-after.png", "three-after.png"],
  ["webgpu-tsl", "aura-after.png", "three-after.png"],
  ["xr-interaction", "aura-after.png", "three-after.png"],
  ["resource-lifecycle", "aura-after.png", "three-after.png"],
  ["scaffold-to-deploy", "aura-after.png", "three-after.png"]
];
const comparisonFiles = comparisonWorkloads.flatMap(([workload, aura, three]) => [
  `tests/reports/current-head-to-head/${workload}/${aura}`,
  `tests/reports/current-head-to-head/${workload}/${three}`
]);

function inspect(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) throw new Error(`Missing final review artifact: ${path}`);
  const bytes = readFileSync(absolute);
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`Final review artifact is not a PNG: ${path}`);
  }
  return {
    path,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: statSync(absolute).size,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

const sections = [
  { id: "flagship-routes", approvalScope: "four materially rebuilt release candidates", files: flagshipFiles },
  { id: "showcase-games", approvalScope: "three independently reviewed playable showcase games", files: gameFiles },
  { id: "aura-clash", approvalScope: "typed-fighter combat showcase", files: auraClashFiles },
  { id: "selected-threejs-comparison", approvalScope: "15 selected current head-to-head workloads only", files: comparisonFiles }
].map((section) => ({ ...section, artifacts: section.files.map(inspect), fileCount: section.files.length }));

const document = {
  schema: "aura3d.2.0-final-visual-review-manifest/1.0",
  generatedAt: new Date().toISOString(),
  sourceCommit,
  status: "machine-complete-independent-human-approval-pending",
  claimBoundary: "Approval applies only to the exact hashes and scopes below. It does not establish universal Three.js ecosystem parity, broad performance superiority, or real-device XR coverage.",
  sectionCount: sections.length,
  artifactCount: sections.reduce((sum, section) => sum + section.fileCount, 0),
  sections
};

const absoluteOutput = resolve(root, output);
mkdirSync(dirname(absoluteOutput), { recursive: true });
writeFileSync(absoluteOutput, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Final visual review manifest: ${document.artifactCount} artifacts across ${document.sectionCount} sections -> ${output}`);
