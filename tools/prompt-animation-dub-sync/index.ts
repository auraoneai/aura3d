import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const reportPath = resolve(root, "tests/reports/prompt-animation/dub-sync-proof.json");
const contractId = "auravoice-aura3d-prompt-animation/v1";

const checks = [
  checkFile("dub-api", "packages/engine/src/agent-api/AuraVoiceBridge.ts", [
    contractId,
    "validateAuraVoiceDubMap",
    "createAuraVoiceDubRerenderProof",
    "stableShotIds",
    "stableStoryboardIds",
    "stableCaptionIds",
    "rerenderQueueItemIds"
  ]),
  checkFile("dialogue-dub-contract", "packages/engine/src/agent-api/DialoguePerformance.ts", [
    "DubMapArtifact",
    "originalLineId",
    "dubbedLineId",
    "originalCaptionId",
    "dubbedCaptionId",
    "originalShotId",
    "dubbedShotId"
  ]),
  checkFile("template-dub-map", "packages/create-aura3d/templates/cartoon-channel/src/render-plan.ts", [
    "spanishDubMap",
    "sourceLanguage: \"en\"",
    "targetLanguage: \"es\"",
    "originalShotId",
    "dubbedShotId",
    "originalCaptionId",
    "dubbedCaptionId",
    "phonemeVisemeDubSyncSourceProof",
    "stableShotIds",
    "stableStoryboardIds",
    "stableCaptionIds"
  ]),
  checkFile("prompt-template-dub-map", "packages/create-aura3d/templates/prompt-cartoon-channel/src/render-plan.ts", [
    "spanishDubMap",
    "sourceLanguage: \"en\"",
    "targetLanguage: \"es\"",
    "originalShotId",
    "dubbedShotId",
    "originalCaptionId",
    "dubbedCaptionId",
    "phonemeVisemeDubSyncSourceProof",
    "stableShotIds",
    "stableStoryboardIds",
    "stableCaptionIds"
  ])
];

emit({
  kind: "prompt-animation-dub-sync-source-proof",
  sourceOnly: true,
  contractId,
  proofExpectations: [
    "non-English dubbed timelines preserve shot ids and storyboard ids",
    "caption ids and dialogue line ids remain linked through the dub map",
    "later executed proof JSON must include one target language render sample without shot-id drift"
  ],
  checks
});

function checkFile(id: string, file: string, tokens: readonly string[]) {
  const path = resolve(root, file);
  const source = existsSync(path) ? readFileSync(path, "utf8") : "";
  const missingTokens = tokens.filter((token) => !source.includes(token));
  return { id, path, ok: source.length > 0 && missingTokens.length === 0, missingTokens };
}

function emit(report: {
  readonly kind: string;
  readonly sourceOnly: boolean;
  readonly contractId: string;
  readonly proofExpectations: readonly string[];
  readonly checks: readonly ReturnType<typeof checkFile>[];
}) {
  const failures = report.checks.filter((check) => !check.ok);
  const output = { ...report, ok: failures.length === 0, failures };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}
