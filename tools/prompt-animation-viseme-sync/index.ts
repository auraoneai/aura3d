import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const reportPath = resolve(root, "tests/reports/prompt-animation/viseme-sync-proof.json");
const contractId = "auravoice-aura3d-prompt-animation/v1";

const checks = [
  checkFile("viseme-controller", "packages/engine/src/agent-api/VisemeController.ts", [
    contractId,
    "auravoice-visemes-v2",
    "createAuraVoiceVisemeTrack",
    "createPrimitiveMouthVisemeCues",
    "createGlbBlendshapeVisemeCue",
    "sampleVisemeTrack",
    "primitiveMouthCardForViseme",
    "blendshapeWeights",
    "phoneme",
    "wordStartTime",
    "wordEndTime",
    "visemeId",
    "primaryVisemeId"
  ]),
  checkFile("bridge-viseme-coverage", "packages/engine/src/agent-api/AuraVoiceBridge.ts", [
    "validateAuraVoiceVisemeCoverage",
    "auravoice-viseme-dialogue-drift",
    "maxTimingDriftFrames",
    "sampleVisemeTrack"
  ]),
  checkFile("template-viseme-track", "packages/create-aura3d/templates/cartoon-channel/src/render-plan.ts", [
    "visemeTrack",
    "createPrimitiveMouthVisemeCues",
    "createGlbBlendshapeVisemeCue",
    "primitiveMouthRuntimeExample",
    "glbVisemeRuntimeExample",
    "phonemeVisemeDubSyncSourceProof"
  ]),
  checkFile("template-one-frame-source-proof", "packages/create-aura3d/templates/cartoon-channel/src/render-plan.ts", [
    "captionFrameSyncSourceProof",
    "captionDisplayWithinOneFrame",
    "visemeFrameSyncSourceProof",
    "mouthMovementWithinOneFrame",
    "sampledMouthStates",
    "sampledPhonemeVisemeCues",
    "allowedFrameDurationSeconds",
    "maxObservedDriftFrames"
  ]),
  checkFile("prompt-template-one-frame-source-proof", "packages/create-aura3d/templates/prompt-cartoon-channel/src/render-plan.ts", [
    "captionFrameSyncSourceProof",
    "captionDisplayWithinOneFrame",
    "visemeFrameSyncSourceProof",
    "mouthMovementWithinOneFrame",
    "sampledMouthStates",
    "sampledPhonemeVisemeCues",
    "allowedFrameDurationSeconds",
    "maxObservedDriftFrames"
  ])
];

emit({
  kind: "prompt-animation-viseme-sync-source-proof",
  sourceOnly: true,
  contractId,
  maxTimingDriftFrames: 1,
  oneFrameSourceProofContract: {
    frameRate: 30,
    allowedFrameDurationSeconds: 1 / 30,
    requiredCaptionFields: [
      "captionFrameSyncSourceProof.captionDisplayWithinOneFrame",
      "captionFrameSyncSourceProof.maxObservedDriftFrames",
      "captionFrameSyncSourceProof.sampledCaptionCues[]"
    ],
    requiredMouthFields: [
      "visemeFrameSyncSourceProof.mouthMovementWithinOneFrame",
      "visemeFrameSyncSourceProof.maxObservedDriftFrames",
      "visemeFrameSyncSourceProof.sampledMouthStates[]",
      "phonemeVisemeDubSyncSourceProof.sampledPhonemeVisemeCues[]",
      "visemeFrameSyncSourceProof.primitiveMouthRuntimeNodeIds",
      "visemeFrameSyncSourceProof.glbBlendshapeNames"
    ]
  },
  proofExpectations: [
    "primitive mouth-card cues and GLB blendshape cues are derived from AuraVoice v2 visemes",
    "viseme cues preserve lineId, speakerId, characterId, startTime, and endTime",
    "phoneme cues preserve phoneme, word, wordIndex, wordStartTime, and wordEndTime when AuraVoice provides them",
    "source harnesses expose mouthMovementWithinOneFrame and captionDisplayWithinOneFrame without claiming rendered evidence",
    "later executed proof JSON must include sampled primitive mouth and GLB blendshape states",
    "later executed proof JSON must include rendered frame/video evidence before PRD proof boxes are marked"
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
  readonly maxTimingDriftFrames: number;
  readonly oneFrameSourceProofContract: unknown;
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
