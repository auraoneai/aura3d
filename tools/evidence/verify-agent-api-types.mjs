#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const declarationPath = resolve(
  repoRoot,
  process.env.AURA3D_AGENT_API_TYPES_PATH ?? "dist/engine/agent-api/index.d.ts"
);

const requiredTokens = [
  "AuraAppHandle",
  "RuntimeNodeHandle",
  "AnimationController",
  "createAnimationController",
  "collectGameRuntimeEvidence",
  "collectPromptAnimationEvidence",
  "game",
  "games",
  "gameAssetValidation",
  "quaterniusGameReadyFighterValidationContract",
  "validateQuaterniusGameReadyFighterAsset",
  "createAuraVoiceBridgePackage",
  "validateAuraVoiceBridgePackage",
  "createAuraVoiceVisemeTrack",
  "createShotPlaybackPlan",
  "installShotPlayback",
  "evaluatePromptAnimationPublishReadiness"
];

const report = {
  ok: false,
  declarationPath,
  requiredTokens,
  missingTokens: [],
  sizeBytes: 0
};

if (!existsSync(declarationPath)) {
  report.error = "Generated declaration file is missing. Run pnpm build first.";
  finish(report);
}

const source = readFileSync(declarationPath, "utf8");
report.sizeBytes = Buffer.byteLength(source);
report.missingTokens = requiredTokens.filter((token) => !source.includes(token));
report.ok = report.sizeBytes > 0 && report.missingTokens.length === 0;

finish(report);

function finish(report) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
