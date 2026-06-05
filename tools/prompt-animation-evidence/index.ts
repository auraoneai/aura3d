import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const reportPath = resolve(root, "tests/reports/prompt-animation/prompt-animation-evidence.json");
const contractId = "auravoice-aura3d-prompt-animation/v1";
const proofFiles = [
  "tests/reports/prompt-animation/prompt-animation-evidence.json",
  "tests/reports/prompt-animation/auravoice-contract-proof.json",
  "tests/reports/prompt-animation/auravoice-sample-render-gates.json",
  "tests/reports/prompt-animation/auravoice-sample-render-package-gates.json",
  "tests/reports/prompt-animation/viseme-sync-proof.json",
  "tests/reports/prompt-animation/dub-sync-proof.json"
];

const checks = [
  checkFile("evidence-api", "packages/engine/src/agent-api/PromptAnimationEvidence.ts", [
    contractId,
    "collectPromptAnimationEvidence",
    "evaluatePromptAnimationPublishReadiness",
    "timingDrift",
    "captions",
    "visemes",
    "audio",
    "PromptAnimationRenderedArtifactMetadata",
    "consumedAuraVoiceArtifacts",
    "renderedArtifacts",
    "artifactMetadata",
    "evidence-render-artifact-metadata-missing",
    "missingDialogueLineIds",
    "deterministicCapture",
    "routeHealth",
    "evidence-screenshot-hash-missing"
  ]),
  checkFile("render-package-evidence-targets", "packages/engine/src/agent-api/CartoonRenderQueue.ts", [
    "evidence-json",
    "caption-sync",
    "viseme-sync",
    "deterministic-capture",
    "route-health",
    "screenshot-hash"
  ]),
  checkFile("template-evidence-source", "packages/create-aura3d/templates/cartoon-channel/src/render-plan.ts", [
    "auraVoicePackage",
    "deterministicScreenshotFixtures",
    "captionTimingProof",
    "captionFrameSyncSourceProof",
    "visemeFrameSyncSourceProof",
    "phonemeVisemeDubSyncSourceProof",
    "sampleRenderSourceWorkflow",
    "audioStems",
    "evidenceJson",
    "plannedDeterministicCaptureSources",
    "accessibilityProofMetadata"
  ]),
  checkFile("prompt-template-evidence-source", "packages/create-aura3d/templates/prompt-cartoon-channel/src/render-plan.ts", [
    "auraVoicePackage",
    "deterministicScreenshotFixtures",
    "captionTimingProof",
    "captionFrameSyncSourceProof",
    "visemeFrameSyncSourceProof",
    "phonemeVisemeDubSyncSourceProof",
    "sampleRenderSourceWorkflow",
    "audioStems",
    "evidenceJson",
    "plannedDeterministicCaptureSources",
    "accessibilityProofMetadata"
  ])
];

const actualProofFilesPresent = proofFiles.filter((file) => existsSync(resolve(root, file)));

emit({
  kind: "prompt-animation-evidence-source-gates",
  sourceOnly: true,
  contractId,
  actualProofFilesPresent,
  proofFilesNotClaimedBySourceGate: proofFiles.filter((file) => !actualProofFilesPresent.includes(file)),
  executionBoundary:
    "This source gate intentionally does not mark final evidence proof boxes. Those require actual files from an operator-run browser/render/evidence pass.",
  requiredSampleRenderPackageFields: [
    "artifacts.video",
    "artifacts.thumbnail",
    "artifacts.captions",
    "artifacts.timeline",
    "artifacts.audioStems",
    "artifacts.evidenceJson",
    "consumedAuraVoiceArtifacts[].contractId",
    "renderedArtifacts[].sha256",
    "renderedArtifacts[].byteSize",
    "artifactMetadata.missingMetadata",
    "artifactMetadata.executionRequiredCount",
    "captionFrameSyncSourceProof.captionDisplayWithinOneFrame",
    "visemeFrameSyncSourceProof.mouthMovementWithinOneFrame",
    "phonemeVisemeDubSyncSourceProof.sampledPhonemeVisemeCues",
    "phonemeVisemeDubSyncSourceProof.dubContinuity.stableShotIds",
    "humanReview.status"
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
  readonly actualProofFilesPresent: readonly string[];
  readonly proofFilesNotClaimedBySourceGate: readonly string[];
  readonly executionBoundary: string;
  readonly requiredSampleRenderPackageFields: readonly string[];
  readonly checks: readonly ReturnType<typeof checkFile>[];
}) {
  const failures = report.checks.filter((check) => !check.ok);
  const output = { ...report, ok: failures.length === 0, failures };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}
