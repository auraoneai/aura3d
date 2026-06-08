import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const reportPath = resolve(root, "tests/reports/prompt-animation/auravoice-sample-render-gates.json");
const contractId = "auravoice-aura3d-prompt-animation/v1";

const checks = [
  checkFile("animation-route", "packages/create-aura3d/templates/animation-channel/src/main.ts", [
    "__AURA3D_ANIMATION_TEMPLATE__",
    "sampleShotPlaybackPlan",
    "playbackProbeTimes",
    "storyBible",
    "captionCueAtTime",
    "renderPlan.items.length"
  ]),
  checkFile("prompt-animation-route", "packages/create-aura3d/templates/prompt-animation-channel/src/main.ts", [
    "__AURA3D_ANIMATION_TEMPLATE__",
    "sampleShotPlaybackPlan",
    "playbackProbeTimes",
    "storyBible",
    "captionCueAtTime",
    "renderPlan.items.length"
  ]),
  checkFile("render-plan", "packages/create-aura3d/templates/animation-channel/src/render-plan.ts", [
    "createAuraVoiceBridgePackage",
    "createPromptAnimationDeterministicScreenshotFixtureMetadata",
    "plannedDeterministicCaptureSources",
    "auraVoiceTimestamp",
    "sourceSceneStateId",
    "artifactManifestExpectations",
    "captionTimingProof"
  ]),
  checkFile("render-evidence-metadata", "packages/engine/src/agent-api/PromptAnimationEvidence.ts", [
    "PromptAnimationRenderedArtifactMetadata",
    "consumedAuraVoiceArtifacts",
    "renderedArtifacts",
    "artifactMetadata",
    "evidence-render-artifact-metadata-missing"
  ]),
  checkFile("sample-render-source-workflow", "packages/create-aura3d/templates/animation-channel/src/render-plan.ts", [
    "sampleRenderSourceWorkflow",
    "promptToAudioToAura3DAnimation",
    "runtimeSeconds",
    "minimumRuntimeSeconds: 60",
    "video",
    "thumbnail",
    "captions",
    "timeline",
    "audioStems",
    "evidenceJson",
    "doesNotClaimRenderedArtifacts",
    "humanReviewRequired"
  ]),
  checkFile("prompt-sample-render-source-workflow", "packages/create-aura3d/templates/prompt-animation-channel/src/render-plan.ts", [
    "sampleRenderSourceWorkflow",
    "promptToAudioToAura3DAnimation",
    "runtimeSeconds",
    "minimumRuntimeSeconds: 60",
    "video",
    "thumbnail",
    "captions",
    "timeline",
    "audioStems",
    "evidenceJson",
    "doesNotClaimRenderedArtifacts",
    "humanReviewRequired"
  ]),
  checkFile("rerender-api", "packages/engine/src/agent-api/AuraVoiceBridge.ts", [
    "createAuraVoiceRerenderPlan",
    "affectedShotIds",
    "affectedRenderQueueItemIds",
    "fullEpisodeRebuildRequired"
  ]),
  checkFile("browser-source", "packages/create-aura3d/templates/animation-channel/tests/storyboard-playback.spec.ts", [
    "page.screenshot()",
    "sampleAt(time)",
    "caption timing",
    "nonblank animation frames"
  ])
];

emit({
  kind: "prompt-animation-auravoice-render-source-gates",
  sourceOnly: true,
  contractId,
  executionBoundary:
    "This script checks source routes and deterministic render metadata only. It does not launch a browser, render video, capture audio, or generate screenshot proof by itself.",
  plannedProofWhenExecutedByOperator: [
    "renderQueue capture times originate from AuraVoice timestamps",
    "sample route exposes three storyboard shots and captions",
    "createAuraVoiceRerenderPlan can target affected shots after regenerated voice timing",
    "the 60-second source workflow emits expectations for video, thumbnail, captions, timeline, audio stems, evidence JSON, YouTube metadata, and human review",
    "collectPromptAnimationEvidence emits renderedArtifacts, consumedAuraVoiceArtifacts, and artifactMetadata so operator output can attach hashes and byte sizes",
    "source gates do not claim the actual render until artifact paths, hashes, byte sizes, and review status exist"
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
  readonly executionBoundary: string;
  readonly plannedProofWhenExecutedByOperator: readonly string[];
  readonly checks: readonly ReturnType<typeof checkFile>[];
}) {
  const failures = report.checks.filter((check) => !check.ok);
  const output = { ...report, ok: failures.length === 0, failures };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}
