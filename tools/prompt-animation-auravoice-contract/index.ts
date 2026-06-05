import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const auraVoiceRoot = resolve(root, "../platforms/auravoice");
const reportPath = resolve(root, "tests/reports/prompt-animation/auravoice-contract-proof.json");
const contractId = "auravoice-aura3d-prompt-animation/v1";

const checks = [
  checkFile("engine-contract", "packages/engine/src/agent-api/PromptAnimationContract.ts", [
    contractId,
    "PromptAnimationStoryBible",
    "PromptAnimationProp",
    "PromptAnimationStyleGuide",
    "PromptAnimationShotListItem",
    "validatePromptAnimationArtifactContract"
  ]),
  checkFile("engine-bridge", "packages/engine/src/agent-api/AuraVoiceBridge.ts", [
    "createAuraVoiceBridgePackage",
    "validateAuraVoiceBridgePackage",
    "createAuraVoiceRerenderPlan",
    "createAuraVoiceDubRerenderProof",
    "sampleAuraVoiceBridgeAtTime"
  ]),
  checkFile("engine-evidence-audio", "packages/engine/src/agent-api/PromptAnimationEvidence.ts", [
    "PromptAnimationAudioEvidence",
    "missingDialogueLineIds",
    "dialogueStemCount",
    "missingStemIds",
    "PromptAnimationConsumedAuraVoiceArtifactMetadata",
    "PromptAnimationRenderedArtifactMetadata",
    "artifactMetadata"
  ]),
  checkFile("engine-phoneme-viseme-schema", "packages/engine/src/agent-api/VisemeController.ts", [
    "auravoice-visemes-v2",
    "phoneme",
    "phonemeId",
    "wordStartTime",
    "wordEndTime"
  ]),
  checkSiblingFile("auravoice-scene-model", "lib/aura3d/scene-model.ts", [
    contractId,
    "episodePlan",
    "storyboard",
    "shotTimeline",
    "dialogueTrack",
    "captionTrack",
    "audioStems"
  ]),
  checkSiblingFile("auravoice-runtime-template", "lib/aura3d/runtime-template.ts", [
    "createAuraVoiceBridgePackage",
    "sampleAuraVoiceBridgeAtTime",
    "EPISODE.promptAnimation"
  ]),
  checkSiblingFile("auravoice-capture-template", "lib/aura3d/capture-template.ts", [
    "plannedDeterministicCaptureSources",
    "auraVoiceTimestamp",
    "sourceSceneState?.sceneStateId"
  ]),
  checkSiblingFile("auravoice-viseme-export", "lib/aura3d/visemes.ts", [
    "auravoice-visemes-v2",
    "lineId",
    "speakerId",
    "startTime",
    "endTime"
  ]),
  checkSiblingFile("auravoice-dubbing", "lib/episodes/dubbing.ts", [
    "targetLanguage",
    "sourceLanguage",
    "timeline",
    "caption"
  ]),
  checkSiblingFile("auravoice-operator-docs", "GettingStarted.md", [
    contractId,
    "AuraVoice to Aura3D handoff checks",
    "captions",
    "visemes",
    "shot-timeline.json"
  ])
];

emit({
  kind: "prompt-animation-auravoice-contract-source-proof",
  sourceOnly: true,
  contractId,
  reportPath: "tests/reports/prompt-animation/auravoice-contract-proof.json",
  crossRepoFixture: {
    root: auraVoiceRoot,
    requiredFiles: [
      "lib/aura3d/scene-model.ts",
      "lib/aura3d/runtime-template.ts",
      "lib/aura3d/capture-template.ts",
      "lib/aura3d/visemes.ts",
      "lib/episodes/dubbing.ts",
      "GettingStarted.md"
    ],
    manualTimingEditsAllowed: false
  },
  checks
});

function checkFile(id: string, file: string, tokens: readonly string[]) {
  return checkSource(id, resolve(root, file), tokens);
}

function checkSiblingFile(id: string, file: string, tokens: readonly string[]) {
  return checkSource(id, resolve(auraVoiceRoot, file), tokens);
}

function checkSource(id: string, path: string, tokens: readonly string[]) {
  const source = existsSync(path) ? readFileSync(path, "utf8") : "";
  const missingTokens = tokens.filter((token) => !source.includes(token));
  return {
    id,
    path,
    ok: source.length > 0 && missingTokens.length === 0,
    missingTokens
  };
}

function emit(report: {
  readonly kind: string;
  readonly sourceOnly: boolean;
  readonly contractId: string;
  readonly reportPath: string;
  readonly crossRepoFixture: unknown;
  readonly checks: readonly ReturnType<typeof checkSource>[];
}) {
  const failures = report.checks.filter((check) => !check.ok);
  const output = {
    ...report,
    ok: failures.length === 0,
    failures
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}
