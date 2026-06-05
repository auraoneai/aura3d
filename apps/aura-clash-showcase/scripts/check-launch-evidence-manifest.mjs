#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const manifestPath = resolve(appRoot, "launch-evidence.manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const requiredCommands = [
  "localGates",
  "firstFrameScreenshot",
  "vercelDeploy",
  "deployedRouteEvidence",
  "reviewPackage",
  "visualApproval",
  "crossRuntimeEvidence",
  "prdEvidenceCoverage",
  "commandPlanCheck",
  "commandPlanDryRun",
  "evidenceWiringCheck",
  "readinessReport",
  "completionAudit",
  "prdUpdate",
  "proofWorkflow",
  "localProofAlias",
  "completeProofAlias"
];

const failures = [];
const requiredSourceEvidence = {
  launchGlbProvenance: [
    "apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json",
    "apps/aura-clash-showcase/aura.assets.json",
    "apps/aura-clash-showcase/scripts/check-production-assets.mjs"
  ],
  gameRuntimeEvidence: [
    "packages/engine/src/agent-api/GameEvidence.ts",
    "packages/engine/src/agent-api/GameRuntime.ts",
    "apps/aura-clash-showcase/src/main.ts"
  ],
  stageSafeZone: [
    "packages/engine/src/agent-api/game-kits/fighting.ts",
    "apps/aura-clash-showcase/src/game/StageDirector.ts",
    "apps/aura-clash-showcase/src/scenes/createStageScene.ts"
  ],
  treeShakableExports: [
    "packages/engine/src/agent-api/GameRuntime.ts",
    "packages/engine/src/agent-api/index.ts",
    "docs/examples/fighting-game.md"
  ]
};

for (const commandName of requiredCommands) {
  const entry = manifest.commands?.[commandName];

  if (!entry) {
    failures.push(`Missing command entry: ${commandName}`);
    continue;
  }

  if (!entry.command || !entry.cwd) {
    failures.push(`Command entry ${commandName} must include command and cwd`);
  }

  if (!entry.output && !entry.outputs && !entry.inputs) {
    failures.push(`Command entry ${commandName} must include output, outputs, or inputs`);
  }
}

if (!manifest.remainingHumanGate?.checkbox) {
  failures.push("Missing remainingHumanGate.checkbox");
}

if (!manifest.prd || !manifest.prd.endsWith("docs/project/aura-clash-showcase.md")) {
  failures.push("Manifest prd must point at docs/project/aura-clash-showcase.md");
}

for (const [entryName, requiredFiles] of Object.entries(requiredSourceEvidence)) {
  const entry = manifest.sourceEvidence?.[entryName];

  if (!entry) {
    failures.push(`Missing sourceEvidence.${entryName}`);
    continue;
  }

  if (!Array.isArray(entry.files) || entry.files.length === 0) {
    failures.push(`sourceEvidence.${entryName}.files must be a non-empty array`);
    continue;
  }

  if (!Array.isArray(entry.proves) || entry.proves.length === 0) {
    failures.push(`sourceEvidence.${entryName}.proves must be a non-empty array`);
  }

  for (const requiredFile of requiredFiles) {
    if (!entry.files.includes(requiredFile)) {
      failures.push(`sourceEvidence.${entryName}.files must include ${requiredFile}`);
    }
  }

  for (const file of entry.files) {
    if (typeof file !== "string" || file.length === 0) {
      failures.push(`sourceEvidence.${entryName}.files contains an invalid file path`);
      continue;
    }

    if (!existsSync(resolve(repoRoot, file))) {
      failures.push(`sourceEvidence.${entryName}.files references a missing file: ${file}`);
    }
  }
}

for (const script of [
  "collect-launch-evidence.mjs",
  "capture-first-frame.mjs",
  "run-local-launch-gates.mjs",
  "run-vercel-deploy-evidence.mjs",
  "create-launch-review-package.mjs",
  "record-visual-approval.mjs",
  "update-prd-from-launch-evidence.mjs",
  "run-launch-proof-workflow.mjs",
  "check-cross-runtime-evidence.mjs",
  "check-prd-evidence-coverage.mjs",
  "check-evidence-wiring.mjs",
  "create-launch-readiness-report.mjs",
  "check-prd-completion.mjs"
]) {
  const scriptPath = resolve(appRoot, "scripts", script);
  if (!existsSync(scriptPath)) {
    failures.push(`Missing launch script: scripts/${script}`);
  }
}

if (failures.length > 0) {
  console.error("Aura Clash launch evidence manifest check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Aura Clash launch evidence manifest check passed.");
