import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type CheckResult = {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
};

type AuraVoiceSampleRenderSourceSignal = {
  readonly source: string;
  readonly token: string;
  readonly present: boolean;
  readonly required: boolean;
};

type AuraVoiceSampleRenderGate = {
  readonly id: string;
  readonly ok: boolean;
  readonly title: string;
  readonly requirement: string;
  readonly sourceSignals: readonly AuraVoiceSampleRenderSourceSignal[];
  readonly evidenceJsonExpectations: readonly string[];
  readonly runtimeEvidenceRequired: readonly string[];
};

type AuraVoiceSampleRenderArtifactExpectation = {
  readonly id: string;
  readonly required: boolean;
  readonly mediaType: string;
  readonly expectedEvidenceFields: readonly string[];
  readonly detail: string;
};

const root = process.cwd();
const auraVoiceRoot = resolve(root, "../platforms/auravoice");
const reportPath = resolve(root, "tests/reports/prompt-animation/auravoice-sample-render-gates.json");
const requiredFiles = [
  "packages/engine/src/agent-api/PromptAnimationContract.ts",
  "packages/engine/src/agent-api/AuraVoiceBridge.ts",
  "packages/engine/src/agent-api/ShotTimeline.ts",
  "packages/engine/src/agent-api/DialoguePerformance.ts",
  "packages/engine/src/agent-api/VisemeController.ts",
  "packages/engine/src/agent-api/PromptAnimationEvidence.ts",
  "packages/engine/src/agent-api/CartoonDirector.ts",
  "packages/engine/src/agent-api/CartoonPerformance.ts",
  "packages/engine/src/agent-api/CartoonRenderQueue.ts",
  "packages/create-aura3d/templates/cartoon-channel/src/main.ts",
  "packages/create-aura3d/templates/cartoon-channel/src/episode.ts",
  "packages/create-aura3d/templates/cartoon-channel/src/render-plan.ts",
  "packages/create-aura3d/templates/cartoon-channel/tests/storyboard-playback.spec.ts",
  "packages/create-aura3d/templates/prompt-cartoon-channel/src/main.ts",
  "packages/create-aura3d/templates/prompt-cartoon-channel/src/episode.ts",
  "packages/create-aura3d/templates/prompt-cartoon-channel/tests/storyboard-playback.spec.ts",
  "tests/unit/agent-api/prompt-animation-source-gates.test.ts",
  "docs/api/prompt-animation.md",
  "docs/api/auravoice-bridge.md",
  "docs/examples/cartoon-channel.md",
  "docs/examples/prompt-to-episode.md",
  "tools/prompt-animation-auravoice-contract/index.ts",
  "tools/prompt-animation-auravoice-render/index.ts",
  "tools/prompt-animation-viseme-sync/index.ts",
  "tools/prompt-animation-dub-sync/index.ts",
  "tools/prompt-animation-evidence/index.ts",
  "tools/prompt-animation-package-smoke/index.ts"
];

const checks: CheckResult[] = requiredFiles.map((file) => ({
  id: `file:${file}`,
  ok: existsSync(resolve(root, file)),
  detail: file
}));

const source = [
  "packages/engine/src/agent-api/index.ts",
  "packages/engine/src/agent-api/PromptAnimationContract.ts",
  "packages/engine/src/agent-api/AuraVoiceBridge.ts",
  "packages/engine/src/agent-api/ShotTimeline.ts",
  "packages/engine/src/agent-api/DialoguePerformance.ts",
  "packages/engine/src/agent-api/VisemeController.ts",
  "packages/engine/src/agent-api/PromptAnimationEvidence.ts",
  "packages/engine/src/agent-api/CartoonDirector.ts",
  "packages/engine/src/agent-api/CartoonPerformance.ts",
  "packages/create-aura3d/templates/cartoon-channel/src/main.ts",
  "packages/create-aura3d/templates/cartoon-channel/src/render-plan.ts",
  "packages/create-aura3d/templates/prompt-cartoon-channel/src/main.ts",
  "packages/create-aura3d/templates/prompt-cartoon-channel/src/render-plan.ts",
  "tests/unit/agent-api/prompt-animation-source-gates.test.ts",
  "docs/api/prompt-animation.md",
  "docs/api/auravoice-bridge.md",
  "tools/prompt-animation-auravoice-contract/index.ts",
  "tools/prompt-animation-auravoice-render/index.ts",
  "tools/prompt-animation-viseme-sync/index.ts",
  "tools/prompt-animation-dub-sync/index.ts",
  "tools/prompt-animation-evidence/index.ts",
  "package.json",
  "llms.txt"
].map(read).join("\n");
const auraVoiceSource = [
  "lib/aura3d/scene-model.ts",
  "lib/aura3d/runtime-template.ts",
  "lib/aura3d/capture-template.ts",
  "lib/aura3d/visemes.ts",
  "lib/episodes/timeline.ts",
  "lib/episodes/audio-mix.ts"
].map((file) => readFrom(auraVoiceRoot, file)).join("\n");

for (const token of [
  "cartoon",
  "animationStudio",
  "createPromptAnimationStoryBible",
  "PromptAnimationStoryBible",
  "styleGuide",
  "shotList",
  "createAuraVoiceBridgePackage",
  "createAuraVoiceRerenderPlan",
  "createAuraVoiceDubRerenderProof",
  "createShotPlaybackPlan",
  "sampleShotPlaybackPlan",
  "applyShotPlaybackFrame",
  "installShotPlayback",
  "deriveCaptionTrackFromDialogue",
  "captionCueAtTime",
  "createCaptionTimingProof",
  "createAuraVoiceVisemeTrack",
  "sampleVisemeTrack",
  "createPrimitiveMouthVisemeCues",
  "createGlbBlendshapeVisemeCue",
  "createPromptAnimationDeterministicScreenshotFixtureMetadata",
  "PromptAnimationRenderedArtifactMetadata",
  "consumedAuraVoiceArtifacts",
  "renderedArtifacts",
  "artifactMetadata",
  "evidence-render-artifact-metadata-missing",
  "captionFrameSyncSourceProof",
  "captionDisplayWithinOneFrame",
  "visemeFrameSyncSourceProof",
  "mouthMovementWithinOneFrame",
  "sampleRenderSourceWorkflow",
  "promptToAudioToAura3DAnimation",
  "createCartoonRenderQueue",
  "createCartoonRenderOutputPackageMetadata",
  "AuraVoice v2",
  "caption",
  "viseme",
  "render-queue"
]) {
  checks.push({
    id: `token:${token}`,
    ok: source.includes(token),
    detail: `prompt-animation source/docs should include ${token}`
  });
}

if (auraVoiceSource) {
  for (const [id, tokens] of [
    [
      "auravoice-contract-id-emission",
      [
        "AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID",
        "auravoice-aura3d-prompt-animation/v1",
        "contractId",
        "promptAnimation"
      ]
    ],
    [
      "auravoice-scene-ir-contract-artifacts",
      ["episodePlan", "storyboard", "shotTimeline", "dialogueTrack", "captionTrack", "audioStems", "masterClock"]
    ],
    [
      "auravoice-runtime-public-bridge-import",
      ["createAuraVoiceBridgePackage", "sampleAuraVoiceBridgeAtTime", "EPISODE.promptAnimation"]
    ],
    [
      "auravoice-deterministic-capture-time",
      ["plannedDeterministicCaptureSources", "auraVoiceTimestamp", "captureTime", "normalizeCaptureTime", "sourceSceneState?.sceneStateId"]
    ],
    [
      "auravoice-v2-viseme-handoff",
      ["artifact: \"visemes\"", "auravoice-visemes-v2", "lineId", "speakerId", "blendshapeWeights"]
    ],
    [
      "auravoice-master-clock-shot-dialogue-timing",
      ["deterministicCaptureTimesForRange", "sceneLocalTime", "dialogueLineId", "shotId"]
    ],
    [
      "auravoice-audio-stem-evidence-metadata",
      ["MixStemMetadata", "stems", "ducking", "gainDb"]
    ]
  ] as const) {
    checks.push({
      id,
      ok: includesAll(auraVoiceSource, tokens),
      detail: `AuraVoice cross-repo source should include ${tokens.join(", ")}`
    });
  }
} else {
  checks.push({
    id: "auravoice-cross-repo-source",
    ok: true,
    detail: "AuraVoice sibling repo not present; skipped optional cross-repo source checks"
  });
}

checks.push({
  id: "cartoon-template-no-three-imports",
  ok: !/\bfrom\s+["']three["']|GLTFLoader|three\/examples/.test(read("packages/create-aura3d/templates/cartoon-channel/src/main.ts")),
  detail: "cartoon-channel template must not import three or GLTFLoader"
});

const sourceGates = read("tests/unit/agent-api/prompt-animation-source-gates.test.ts");
for (const token of [
  "maxTimingDriftFrames",
  "createShotPlaybackPlan",
  "sampleShotPlaybackPlan",
  "applyShotPlaybackFrame",
  "installShotPlayback",
  "deriveCaptionTrackFromDialogue",
  "captionCueAtTime",
  "createCaptionTimingProof",
  "createAuraVoiceVisemeTrack",
  "sampleVisemeTrack",
  "createAuraVoiceBridgePackage",
  "sampleAuraVoiceBridgeAtTime",
  "createPromptAnimationDeterministicScreenshotFixtureMetadata",
  "captionTrack: episode.captionTrack",
  "originalCaptionId",
  "dubbedCaptionId",
  "storyboard caption renders",
  "prompt-animation:package",
  "prompt-animation:release"
]) {
  checks.push({
    id: `source-gate-token:${token}`,
    ok: sourceGates.includes(token),
    detail: `prompt-animation source gates should include ${token}`
  });
}

const packageJson = read("package.json");
for (const token of [
  "\"prompt-animation:unit\"",
  "tests/unit/agent-api",
  "\"prompt-animation:browser\"",
  "packages/create-aura3d/templates/prompt-cartoon-channel/tests/storyboard-playback.spec.ts",
  "\"prompt-animation:package\"",
  "tools/prompt-animation-package-smoke/index.ts",
  "\"prompt-animation:auravoice-contract\"",
  "tools/prompt-animation-auravoice-contract/index.ts",
  "\"prompt-animation:auravoice-render\"",
  "tools/prompt-animation-auravoice-render/index.ts",
  "\"prompt-animation:viseme-sync\"",
  "tools/prompt-animation-viseme-sync/index.ts",
  "\"prompt-animation:dub-sync\"",
  "tools/prompt-animation-dub-sync/index.ts",
  "\"prompt-animation:evidence\"",
  "tools/prompt-animation-evidence/index.ts",
  "\"prompt-animation:release\"",
  "pnpm prompt-animation:unit && pnpm prompt-animation:browser && pnpm prompt-animation:template && pnpm prompt-animation:docs && pnpm prompt-animation:package"
]) {
  checks.push({
    id: `package-script-token:${token}`,
    ok: packageJson.includes(token),
    detail: `package scripts should include ${token}`
  });
}

const auraVoiceSampleRenderGates = createAuraVoiceSampleRenderGateEvidence();
for (const gate of auraVoiceSampleRenderGates.gates) {
  checks.push({
    id: `auravoice-sample-render-gate:${gate.id}`,
    ok: gate.ok,
    detail: gate.requirement
  });
}

const failures = checks.filter((check) => !check.ok);
const report = {
  kind: "aura-prompt-animation-readiness",
  ok: failures.length === 0,
  scope: "source-only-readiness",
  reportPath: "tests/reports/prompt-animation/auravoice-sample-render-gates.json",
  auraVoiceSampleRenderGates,
  checks,
  failures
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;

function read(file: string): string {
  return readFrom(root, file);
}

function readFrom(base: string, file: string): string {
  const path = resolve(base, file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function includesAll(source: readonly string[] | string | undefined, tokens: readonly string[]): boolean {
  if (!source) return false;
  if (Array.isArray(source)) return tokens.every((token) => source.includes(token));
  return tokens.every((token) => source.includes(token));
}

function createAuraVoiceSampleRenderGateEvidence(): {
  readonly schema: "a3d-auravoice-sample-render-gates";
  readonly version: 1;
  readonly sourceOnly: true;
  readonly status: "source-ready" | "source-incomplete";
  readonly executionBoundary: string;
  readonly artifactExpectations: readonly AuraVoiceSampleRenderArtifactExpectation[];
  readonly deterministicRenderPackageExpectations: {
    readonly contractId: "auravoice-aura3d-prompt-animation/v1";
    readonly timebase: string;
    readonly maxTimingDriftFrames: 1;
    readonly requiredProofs: readonly string[];
    readonly requiredPackageFields: readonly string[];
  };
  readonly gates: readonly AuraVoiceSampleRenderGate[];
} {
  const gates = [
    auraVoiceGate({
      id: "contract-proof",
      title: "AuraVoice/Aura3D contract proof",
      requirement: "Future sample render evidence must prove the shared AuraVoice/Aura3D prompt-animation v1 contract and validated bridge package.",
      sourceSignals: [
        sourceSignal("prompt-animation source/docs", source, "auravoice-aura3d-prompt-animation/v1"),
        sourceSignal("prompt-animation source/docs", source, "createAuraVoiceBridgePackage"),
        sourceSignal("prompt-animation source/docs", source, "validateAuraVoiceBridgePackage"),
        sourceSignal("prompt-animation source/docs", source, "sampleAuraVoiceBridgeAtTime"),
        sourceSignal("prompt-animation source-gates", sourceGates, "createAuraVoiceBridgePackage"),
        sourceSignal("AuraVoice sibling source", auraVoiceSource, "contractId", auraVoiceSource.length > 0)
      ],
      evidenceJsonExpectations: [
        "contract.id",
        "contract.version",
        "bridgeValidation.ok",
        "bridgeValidation.failures",
        "episodePlan.episodeId",
        "shotTimeline.id",
        "dialogueTrack.id",
        "captionTrack.id",
        "renderQueue.id",
        "renderOutputPackage.id"
      ],
      runtimeEvidenceRequired: [
        "A later execution must instantiate the sample bridge package and persist validateAuraVoiceBridgePackage output.",
        "A later execution must include the exact contract id emitted by AuraVoice and consumed by Aura3D."
      ]
    }),
    auraVoiceGate({
      id: "synchronized-captions-visemes",
      title: "Synchronized captions and visemes",
      requirement: "Future sample render evidence must show caption cues and viseme cues sampled from the same shot/dialogue clock with drift within one frame.",
      sourceSignals: [
        sourceSignal("prompt-animation source/docs", source, "captionCueAtTime"),
        sourceSignal("prompt-animation source/docs", source, "createCaptionTimingProof"),
        sourceSignal("prompt-animation source/docs", source, "createAuraVoiceVisemeTrack"),
        sourceSignal("prompt-animation source/docs", source, "sampleVisemeTrack"),
        sourceSignal("prompt-animation source/docs", source, "maxTimingDriftFrames"),
        sourceSignal("prompt-animation source/docs", source, "captionFrameSyncSourceProof"),
        sourceSignal("prompt-animation source/docs", source, "captionDisplayWithinOneFrame"),
        sourceSignal("prompt-animation source/docs", source, "visemeFrameSyncSourceProof"),
        sourceSignal("prompt-animation source/docs", source, "mouthMovementWithinOneFrame"),
        sourceSignal("prompt-animation source-gates", sourceGates, "captionTrack: episode.captionTrack")
      ],
      evidenceJsonExpectations: [
        "captionTimingProof.maxObservedDriftFrames",
        "captionTimingProof.allowedDriftFrames",
        "captionFrameSyncSourceProof.captionDisplayWithinOneFrame",
        "captionSamples[].time",
        "captionSamples[].captionCueId",
        "visemeSyncProof.maxObservedDriftFrames",
        "visemeSyncProof.allowedDriftFrames",
        "visemeFrameSyncSourceProof.mouthMovementWithinOneFrame",
        "visemeSamples[].time",
        "visemeSamples[].lineId",
        "visemeSamples[].speakerId"
      ],
      runtimeEvidenceRequired: [
        "A later execution must sample captions and visemes across dialogue boundaries.",
        "A later execution must attach hashes or stable ids for the sampled timeline/caption/viseme artifacts."
      ]
    }),
    auraVoiceGate({
      id: "render-package-artifacts",
      title: "Video, thumbnail, captions, timeline, audio stems, and evidence JSON package",
      requirement: "Future sample render evidence must enumerate the deterministic render package artifacts needed for review and YouTube/channel handoff.",
      sourceSignals: [
        sourceSignal("prompt-animation source/docs", source, "createCartoonRenderOutputPackageMetadata"),
        sourceSignal("prompt-animation source/docs", source, "createCartoonRenderQueue"),
        sourceSignal("prompt-animation source/docs", source, "createAudioStemManifest"),
        sourceSignal("prompt-animation source/docs", source, "renderOutputPackage"),
        sourceSignal("prompt-animation source/docs", source, "reviewPackagePaths"),
        sourceSignal("prompt-animation source/docs", source, "thumbnailCapture"),
        sourceSignal("prompt-animation source/docs", source, "sampleRenderSourceWorkflow")
      ],
      evidenceJsonExpectations: [
        "artifacts.video.path",
        "artifacts.video.sha256",
        "artifacts.thumbnail.path",
        "artifacts.thumbnail.sha256",
        "artifacts.captions.path",
        "artifacts.captions.sha256",
        "artifacts.timeline.path",
        "artifacts.timeline.sha256",
        "artifacts.audioStems.path",
        "artifacts.audioStems.sha256",
        "artifacts.evidenceJson.path",
        "artifacts.evidenceJson.sha256",
        "consumedAuraVoiceArtifacts[].contractId",
        "renderedArtifacts[].sha256",
        "renderedArtifacts[].byteSize",
        "artifactMetadata.missingMetadata",
        "youtubeDraftMetadata.title",
        "youtubeDraftMetadata.description"
      ],
      runtimeEvidenceRequired: [
        "A later execution must create or reference the actual video, thumbnail, captions, timeline, audio-stem, and evidence files.",
        "A later execution must include sha256 hashes and byte sizes for every required artifact."
      ]
    }),
    auraVoiceGate({
      id: "viseme-sync-proof",
      title: "Viseme sync proof",
      requirement: "Future sample render evidence must prove every spoken line has line/speaker viseme coverage and sampled mouth state at render times.",
      sourceSignals: [
        sourceSignal("prompt-animation source/docs", source, "createAuraVoiceVisemeTrack"),
        sourceSignal("prompt-animation source/docs", source, "createPrimitiveMouthVisemeCues"),
        sourceSignal("prompt-animation source/docs", source, "createGlbBlendshapeVisemeCue"),
        sourceSignal("prompt-animation source/docs", source, "lineId"),
        sourceSignal("prompt-animation source/docs", source, "speakerId"),
        sourceSignal("prompt-animation source/docs", source, "blendshapeWeights")
      ],
      evidenceJsonExpectations: [
        "visemeSyncProof.coveredLineIds",
        "visemeSyncProof.missingLineIds",
        "visemeSyncProof.maxObservedDriftFrames",
        "visemeFrameSyncSourceProof.sampledMouthStates[]",
        "visemeSyncProof.sampledCues[].lineId",
        "visemeSyncProof.sampledCues[].speakerId",
        "visemeSyncProof.sampledCues[].mouthShape",
        "visemeSyncProof.sampledCues[].blendshapeWeights"
      ],
      runtimeEvidenceRequired: [
        "A later execution must compare rendered sample times against dialogue line start/end times.",
        "A later execution must mark missing, overlapping, or off-line viseme cues as failures."
      ]
    }),
    auraVoiceGate({
      id: "dub-sync-proof",
      title: "Dub sync proof",
      requirement: "Future sample render evidence must preserve original/dub caption linkage and prove dubbed caption/dialogue timings stay inside the allowed drift budget.",
      sourceSignals: [
        sourceSignal("prompt-animation source/docs", source, "defineDubMap"),
        sourceSignal("prompt-animation source/docs", source, "dubMap"),
        sourceSignal("prompt-animation source-gates", sourceGates, "originalCaptionId"),
        sourceSignal("prompt-animation source-gates", sourceGates, "dubbedCaptionId"),
        sourceSignal("prompt-animation source-gates", sourceGates, "storyboard caption renders")
      ],
      evidenceJsonExpectations: [
        "dubSyncProof.sourceLanguage",
        "dubSyncProof.targetLanguage",
        "dubSyncProof.originalCaptionId",
        "dubSyncProof.dubbedCaptionId",
        "dubSyncProof.lineId",
        "dubSyncProof.shotId",
        "dubSyncProof.maxObservedDriftFrames",
        "dubSyncProof.allowedDriftFrames"
      ],
      runtimeEvidenceRequired: [
        "A later execution must sample the dubbed caption track against the same AuraVoice master clock.",
        "A later execution must fail if original and dubbed captions lose dialogue, character, shot, or storyboard id continuity."
      ]
    }),
    auraVoiceGate({
      id: "deterministic-render-package",
      title: "Deterministic render package expectations",
      requirement: "Future sample render evidence must prove deterministic capture from exact AuraVoice timestamps and stable package metadata.",
      sourceSignals: [
        sourceSignal("prompt-animation source/docs", source, "createPromptAnimationDeterministicScreenshotFixtureMetadata"),
        sourceSignal("prompt-animation source/docs", source, "plannedDeterministicCaptureSources"),
        sourceSignal("prompt-animation source/docs", source, "captureTime"),
        sourceSignal("prompt-animation source/docs", source, "auraVoiceTimestamp"),
        sourceSignal("prompt-animation source/docs", source, "sampleRenderSourceWorkflow"),
        sourceSignal("prompt-animation source-gates", sourceGates, "createPromptAnimationDeterministicScreenshotFixtureMetadata")
      ],
      evidenceJsonExpectations: [
        "deterministicRenderPackage.captureTimes[]",
        "deterministicRenderPackage.frameRate",
        "deterministicRenderPackage.resolution.width",
        "deterministicRenderPackage.resolution.height",
        "deterministicRenderPackage.artifactManifest[].path",
        "deterministicRenderPackage.artifactManifest[].sha256",
        "deterministicRenderPackage.renderQueueHash",
        "deterministicRenderPackage.timelineHash"
      ],
      runtimeEvidenceRequired: [
        "A later execution must render from planned AuraVoice timestamps, not wall-clock time.",
        "A later execution must include stable hashes for render queue, timeline, screenshots/video, captions, stems, and evidence JSON."
      ]
    })
  ] as const;

  return {
    schema: "a3d-auravoice-sample-render-gates",
    version: 1,
    sourceOnly: true,
    status: gates.every((gate) => gate.ok) ? "source-ready" : "source-incomplete",
    executionBoundary: "This JSON is source-only automation. It defines and checks the source signals needed to emit AuraVoice sample render evidence later; it does not claim video, browser, audio, screenshot, deployment, or human visual-review proof.",
    artifactExpectations: [
      artifactExpectation("video", true, "video/mp4", ["path", "sha256", "byteSize", "duration", "frameRate", "resolution", "renderQueueId"], "Primary review video rendered from Aura3D shot playback."),
      artifactExpectation("thumbnail", true, "image/png", ["path", "sha256", "byteSize", "width", "height", "captureTime", "shotId"], "Thumbnail captured from the same Aura3D scene state as the video."),
      artifactExpectation("captions", true, "text/vtt", ["path", "sha256", "byteSize", "language", "cueCount", "captionTrackId"], "Caption sidecar synchronized to dialogue and shot timing."),
      artifactExpectation("timeline", true, "application/json", ["path", "sha256", "byteSize", "shotTimelineId", "frameRate", "duration"], "Shot timeline JSON used as the render timing source."),
      artifactExpectation("audio-stems", true, "application/json", ["path", "sha256", "byteSize", "stemCount", "dialogueStemCount", "sfxStemCount"], "Audio stem manifest with dialogue, music, and SFX timing metadata."),
      artifactExpectation("evidence-json", true, "application/json", ["path", "sha256", "byteSize", "schema", "ok", "gates"], "Machine-readable evidence report containing contract, sync, package, and deterministic render proofs."),
      artifactExpectation("youtube-draft-metadata", true, "application/json", ["title", "description", "language", "thumbnailPath", "captionsPath", "videoPath"], "Draft metadata expected by channel upload/review workflows."),
      artifactExpectation("webm-video", false, "video/webm", ["path", "sha256", "byteSize", "duration", "frameRate", "resolution"], "Optional alternate video encode for browser review.")
    ],
    deterministicRenderPackageExpectations: {
      contractId: "auravoice-aura3d-prompt-animation/v1",
      timebase: "AuraVoice master clock timestamps carried through shotTimeline, dialogueTrack, captionTrack, visemes, audioStems, and renderQueue.",
      maxTimingDriftFrames: 1,
      requiredProofs: [
        "contractProof",
        "captionTimingProof",
        "visemeSyncProof",
        "dubSyncProof",
        "renderPackageProof",
        "deterministicCaptureProof"
      ],
      requiredPackageFields: [
        "episodeId",
        "contractId",
        "frameRate",
        "resolution",
        "duration",
        "captureTimes",
        "artifactManifest",
        "evidenceJsonHash",
        "renderQueueHash",
        "timelineHash",
        "audioStemManifestHash"
      ]
    },
    gates
  };
}

function auraVoiceGate(input: {
  readonly id: string;
  readonly title: string;
  readonly requirement: string;
  readonly sourceSignals: readonly AuraVoiceSampleRenderSourceSignal[];
  readonly evidenceJsonExpectations: readonly string[];
  readonly runtimeEvidenceRequired: readonly string[];
}): AuraVoiceSampleRenderGate {
  return {
    ...input,
    ok: input.sourceSignals.every((signal) => !signal.required || signal.present)
  };
}

function sourceSignal(sourceName: string, sourceText: string, token: string, required = true): AuraVoiceSampleRenderSourceSignal {
  return {
    source: sourceName,
    token,
    present: sourceText.includes(token),
    required
  };
}

function artifactExpectation(
  id: string,
  required: boolean,
  mediaType: string,
  expectedEvidenceFields: readonly string[],
  detail: string
): AuraVoiceSampleRenderArtifactExpectation {
  return {
    id,
    required,
    mediaType,
    expectedEvidenceFields,
    detail
  };
}
