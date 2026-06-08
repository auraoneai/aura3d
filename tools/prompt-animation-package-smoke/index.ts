import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

type PackageJson = {
  readonly name?: string;
  readonly version?: string;
  readonly exports?: Record<string, unknown>;
  readonly files?: readonly string[];
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly keywords?: readonly string[];
};

type CheckResult = {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
};

type CommandEvidence = {
  readonly label: string;
  readonly command: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly skipped?: boolean;
  readonly signal?: string;
  readonly error?: string;
};

type AuraVoiceSamplePackageSourceSignal = {
  readonly source: string;
  readonly token: string;
  readonly present: boolean;
  readonly required: boolean;
};

type AuraVoiceSamplePackageGate = {
  readonly id: string;
  readonly ok: boolean;
  readonly title: string;
  readonly requirement: string;
  readonly sourceSignals: readonly AuraVoiceSamplePackageSourceSignal[];
  readonly evidenceJsonFields: readonly string[];
  readonly laterExecutionProofRequired: readonly string[];
};

type AuraVoiceSamplePackageArtifactExpectation = {
  readonly id: string;
  readonly required: boolean;
  readonly kind: string;
  readonly evidenceJsonFields: readonly string[];
  readonly deterministicRequirement: string;
};

const root = process.cwd();
const auraVoiceRoot = resolve(root, "../platforms/auravoice");
const reportPath = resolve(root, "tests/reports/prompt-animation/package-smoke.json");
const sampleRenderPackageReportPath = resolve(root, "tests/reports/prompt-animation/auravoice-sample-render-package-gates.json");
const expectedPackageVersion = "1.0.4";
const externalViteExecuteFlag = "--execute-external-vite";
const executeExternalViteSmoke = process.argv.includes(externalViteExecuteFlag);
const externalViteCommandTimeoutMs = 300_000;

const requiredExternalPromptAnimationImports = [
  "collectPromptAnimationEvidence",
  "compilePromptEpisodePlan",
  "createAudioStemManifest",
  "createAuraApp",
  "createAuraVoiceBridgePackage",
  "createAuraVoiceVisemeTrack",
  "createAnimationRenderOutputPackageMetadata",
  "createGlbBlendshapeVisemeCue",
  "createPrimitiveMouthVisemeCues",
  "createShotPlaybackPlan",
  "evaluatePromptAnimationPublishReadiness",
  "game",
  "installShotPlayback",
  "lights",
  "model",
  "sampleAuraVoiceBridgeAtTime",
  "scene",
  "validateAuraVoiceBridgePackage"
] as const;

const requiredExternalPromptAnimationSourceUses = [
  "compilePromptEpisodePlan(",
  "createAuraVoiceBridgePackage(",
  "createAuraVoiceVisemeTrack(",
  "createAudioStemManifest(",
  "createShotPlaybackPlan(",
  "collectPromptAnimationEvidence(",
  "evaluatePromptAnimationPublishReadiness(",
  "installShotPlayback(app, playback)",
  "model(assets.miko)",
  "model(assets.luma)"
] as const;

const forbiddenExternalConsumerPatterns: ReadonlyArray<{ readonly id: string; readonly pattern: RegExp }> = [
  { id: "direct-three-import", pattern: /\bfrom\s*["']three(?:["'/])/ },
  { id: "three-examples-import", pattern: /\bthree\/(?:examples|addons)\b/ },
  { id: "three-namespace", pattern: /\bTHREE\./ },
  { id: "gltf-loader", pattern: new RegExp("\\bGLTF" + "Loader\\b") },
  { id: "raw-string-model-id", pattern: /\bmodel\s*\(\s*["'`]/ },
  { id: "unsafe-model-url", pattern: /\bunsafeModelUrl\s*\(/ },
  { id: "private-engine-source-import", pattern: /packages\/engine\/src|@aura3d\/engine\/dist/ }
] as const;

const sourceCompleteExpectationGates = [
  {
    id: "external-consumer-public-root-api",
    status: "source-complete-when-present",
    requiredImports: [...requiredExternalPromptAnimationImports],
    requiredSourceUses: [...requiredExternalPromptAnimationSourceUses],
    forbiddenPatterns: forbiddenExternalConsumerPatterns.map(({ id }) => id)
  },
  {
    id: "auravoice-bridge-contract-source",
    status: "source-complete-when-present",
    requiredSourceUses: [
      "compilePromptEpisodePlan(",
      "createAuraVoiceBridgePackage(",
      "validateAuraVoiceBridgePackage(",
      "sampleAuraVoiceBridgeAtTime(",
      "evaluatePromptAnimationPublishReadiness("
    ],
    note: "These checks prove source coverage for bridge contracts only; they do not prove audio mix, browser playback, screenshots, render package bytes, deployment, or review approval."
  },
  {
    id: "typed-asset-safe-api",
    status: "source-complete-when-present",
    requiredSourceUses: ["model(assets.miko)", "model(assets.luma)", "game.runtimeNode(\"miko\"", "game.runtimeNode(\"luma\""],
    forbiddenPatterns: ["raw-string-model-id", "unsafe-model-url", "direct-three-import", "gltf-loader"]
  }
] as const;

const executionRequiredExpectationGates = [
  {
    id: "external-package-execution",
    status: "execution-required",
    requiredEvidence: [
      "packed tarball path and sha256",
      "fresh temp consumer npm install output",
      "external TypeScript output",
      "external Vite build output"
    ]
  },
  {
    id: "browser-shot-playback-proof",
    status: "execution-required",
    requiredEvidence: [
      "browser route report",
      "shot playback evidence",
      "caption timing evidence",
      "viseme/character performance evidence",
      "camera cut evidence",
      "nonblank screenshot or video artifact"
    ]
  },
  {
    id: "render-package-and-publish-proof",
    status: "execution-required",
    requiredEvidence: [
      "render queue execution report",
      "video/still/thumbnail/caption/audio/evidence artifacts",
      "consumedAuraVoiceArtifacts/renderedArtifacts/artifactMetadata evidence fields",
      "byte sizes and SHA-256 hashes",
      "timing drift report",
      "deployment proof",
      "accessibility and visual approval artifacts"
    ]
  }
] as const;

const externalPromptMainSource = `import {
  collectPromptAnimationEvidence,
  compilePromptEpisodePlan,
  createAudioStemManifest,
  createAuraApp,
  createAuraVoiceBridgePackage,
  createAuraVoiceVisemeTrack,
  createAnimationRenderOutputPackageMetadata,
  createGlbBlendshapeVisemeCue,
  createPrimitiveMouthVisemeCues,
  createShotPlaybackPlan,
  evaluatePromptAnimationPublishReadiness,
  game,
  installShotPlayback,
  lights,
  model,
  sampleAuraVoiceBridgeAtTime,
  scene,
  validateAuraVoiceBridgePackage
} from "@aura3d/engine";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __AURA3D_PROMPT_ANIMATION_PACKAGE_SMOKE__?: unknown;
  }
}

const plan = compilePromptEpisodePlan({
  episodeId: "package-smoke-moon-garden",
  title: "Package Smoke Moon Garden",
  prompt: "Two friendly robots clean a glowing moon garden.",
  language: "en",
  runtime: {
    duration: 12,
    frameRate: 30,
    resolution: { width: 1280, height: 720 },
    maxTimingDriftFrames: 1
  },
  characters: [
    { id: "miko", name: "Miko", role: "hero", asset: assets.miko },
    { id: "luma", name: "Luma", role: "sidekick", asset: assets.luma }
  ],
  locations: [{ id: "moon-garden", name: "Moon Garden", mood: "soft neon bedtime" }],
  beats: [
    {
      id: "beat-001",
      locationId: "moon-garden",
      summary: "Miko and Luma sweep glowing moon weeds.",
      visualIntent: "Typed characters, readable captions, and gentle moonlit staging.",
      duration: 6,
      characters: ["miko", "luma"],
      dialogue: [
        { speakerId: "miko", text: "The moon garden is glowing again.", emotion: "curious" },
        { speakerId: "luma", text: "Then let us make it sparkle.", emotion: "happy" }
      ]
    },
    {
      id: "beat-002",
      locationId: "moon-garden",
      summary: "The robots celebrate as the garden sparkles.",
      visualIntent: "A calm ending pose with synchronized captions and visemes.",
      duration: 6,
      characters: ["miko", "luma"],
      dialogue: [{ speakerId: "miko", text: "Perfect timing, Luma.", emotion: "happy" }]
    }
  ],
  route: "/episodes/package-smoke-moon-garden"
});

const visemes = createAuraVoiceVisemeTrack({
  episodeId: plan.episodePlan.episodeId,
  language: plan.episodePlan.language,
  frameRate: plan.shotTimeline.frameRate,
  cues: plan.dialogueTrack.lines.flatMap((line) =>
    createPrimitiveMouthVisemeCues({
      characterId: line.speakerId,
      speakerId: line.speakerId,
      lineId: line.lineId,
      startTime: line.startTime,
      endTime: line.endTime
    }).map((cue) => createGlbBlendshapeVisemeCue(cue))
  )
});

const audioStems = createAudioStemManifest({
  episodeId: plan.episodePlan.episodeId,
  duration: plan.dialogueTrack.duration,
  stems: plan.dialogueTrack.lines.map((line) => ({
    id: \`audio:\${line.lineId}\`,
    role: "dialogue",
    path: line.audioFile ?? \`assets/audio/\${line.language}/\${line.lineId}.wav\`,
    startTime: line.startTime,
    duration: line.endTime - line.startTime,
    language: line.language
  }))
});

const renderOutputPackage = createAnimationRenderOutputPackageMetadata({
  episodePlan: plan.episodePlan,
  shotTimeline: plan.shotTimeline,
  renderQueue: plan.renderQueue
});

const bridge = createAuraVoiceBridgePackage({
  episodePlan: plan.episodePlan,
  storyboard: plan.storyboard,
  shotTimeline: plan.shotTimeline,
  dialogueTrack: plan.dialogueTrack,
  captionTrack: plan.captionTrack,
  visemes,
  audioStems,
  renderQueue: plan.renderQueue,
  renderOutputPackage
});

const playback = createShotPlaybackPlan({
  timeline: plan.shotTimeline,
  performance: plan.performance,
  captions: plan.captionTrack,
  visemes,
  runtimeNodeByCharacterId: { miko: "miko", luma: "luma" },
  loop: true
});

const app = createAuraApp("#app", {
  scene: scene()
    .add(model(assets.miko).runtime(game.runtimeNode("miko")))
    .add(model(assets.luma).runtime(game.runtimeNode("luma")))
    .add(lights.studio())
});
installShotPlayback(app, playback);

const sample = sampleAuraVoiceBridgeAtTime(bridge, 3);
const evidence = collectPromptAnimationEvidence({
  bridgePackage: bridge,
  screenshots: [
    {
      id: "shot-001",
      time: sample.time,
      path: "artifacts/screenshots/package-smoke-shot-001.png",
      hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      width: 1280,
      height: 720
    }
  ],
  routeHealth: { status: "pass" }
});

window.__AURA3D_PROMPT_ANIMATION_PACKAGE_SMOKE__ = {
  schema: "a3d-prompt-animation-external-vite-package-smoke/app-evidence",
  bridgeIssues: validateAuraVoiceBridgePackage(bridge),
  readiness: evaluatePromptAnimationPublishReadiness(evidence),
  sample,
  evidence
};
`;

const externalPromptAuraAssetsSource = `import type { model } from "@aura3d/engine";

const generatedCharacterAsset = {} as Parameters<typeof model>[0];

export const assets = {
  miko: generatedCharacterAsset,
  luma: generatedCharacterAsset
} as const;
`;

const externalPromptViteConfigSource = `import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@aura3d/engine"]
  },
  server: {
    host: "127.0.0.1"
  }
});
`;

const externalPromptIndexHtmlSource = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aura3D prompt-animation package smoke</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const rootPackage = readJson<PackageJson>("package.json");
const createAura3dPackage = readJson<PackageJson>("packages/create-aura3d/package.json");
const animationTemplatePackage = readJson<PackageJson>("packages/create-aura3d/templates/animation-channel/package.json");
const agentApiIndex = read("packages/engine/src/agent-api/index.ts");
const auraVoiceBridgeSource = read("packages/engine/src/agent-api/AuraVoiceBridge.ts");
const promptAnimationContractSource = read("packages/engine/src/agent-api/PromptAnimationContract.ts");
const animationDirectorSource = read("packages/engine/src/agent-api/AnimationDirector.ts");
const animationRenderQueueSource = read("packages/engine/src/agent-api/AnimationRenderQueue.ts");
const visemeControllerSource = read("packages/engine/src/agent-api/VisemeController.ts");
const promptAnimationEvidenceSource = read("packages/engine/src/agent-api/PromptAnimationEvidence.ts");
const promptAnimationSourceGates = read("tests/unit/agent-api/prompt-animation-source-gates.test.ts");
const animationTemplateMain = read("packages/create-aura3d/templates/animation-channel/src/main.ts");
const animationTemplateEpisode = read("packages/create-aura3d/templates/animation-channel/src/episode.ts");
const animationTemplateRenderPlan = read("packages/create-aura3d/templates/animation-channel/src/render-plan.ts");
const animationTemplateReadme = read("packages/create-aura3d/templates/animation-channel/README.md");
const auraVoiceSource = [
  "lib/aura3d/scene-model.ts",
  "lib/aura3d/runtime-template.ts",
  "lib/aura3d/capture-template.ts",
  "lib/aura3d/visemes.ts",
  "lib/episodes/timeline.ts",
  "lib/episodes/audio-mix.ts"
].map((file) => readFrom(auraVoiceRoot, file)).join("\n");

const checks: CheckResult[] = [];

for (const file of [
  "packages/engine/src/agent-api/index.ts",
  "packages/engine/src/agent-api/PromptAnimationContract.ts",
  "packages/engine/src/agent-api/AuraVoiceBridge.ts",
  "packages/engine/src/agent-api/AnimationDirector.ts",
  "packages/engine/src/agent-api/AnimationRenderQueue.ts",
  "packages/engine/src/agent-api/VisemeController.ts",
  "packages/engine/src/agent-api/PromptAnimationEvidence.ts",
  "tests/unit/agent-api/prompt-animation-source-gates.test.ts",
  "packages/create-aura3d/package.json",
  "packages/create-aura3d/templates/animation-channel/package.json",
  "packages/create-aura3d/templates/animation-channel/src/main.ts",
  "packages/create-aura3d/templates/animation-channel/src/episode.ts",
  "packages/create-aura3d/templates/animation-channel/src/render-plan.ts",
  "packages/create-aura3d/templates/animation-channel/README.md"
]) {
  checks.push({
    id: `file:${file}`,
    ok: existsSync(resolve(root, file)),
    detail: file
  });
}

if (auraVoiceSource) {
  checks.push({
    id: "auravoice-cross-repo-contract-id-emission",
    ok: includesAll(auraVoiceSource, [
      "AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID",
      "auravoice-aura3d-prompt-animation/v1",
      "contractId",
      "promptAnimation"
    ]),
    detail: "AuraVoice scene IR and sidecars must emit the Aura3D prompt-animation v1 contract id"
  });

  checks.push({
    id: "auravoice-cross-repo-scene-ir-artifacts",
    ok: includesAll(auraVoiceSource, [
      "episodePlan",
      "storyboard",
      "shotTimeline",
      "dialogueTrack",
      "captionTrack",
      "audioStems",
      "masterClock"
    ]),
    detail: "AuraVoice episode scene IR must map to Aura3D prompt-animation artifacts"
  });

  checks.push({
    id: "auravoice-cross-repo-runtime-bridge",
    ok: includesAll(auraVoiceSource, [
      "createAuraVoiceBridgePackage",
      "sampleAuraVoiceBridgeAtTime",
      "EPISODE.promptAnimation",
      "refreshBridgePackage"
    ]),
    detail: "AuraVoice runtime template must import public Aura3D bridge helpers and sample contract artifacts"
  });

  checks.push({
    id: "auravoice-cross-repo-deterministic-capture",
    ok: includesAll(auraVoiceSource, [
      "plannedDeterministicCaptureSources",
      "auraVoiceTimestamp",
      "normalizeCaptureTime",
      "deterministicCaptureTimesForRange"
    ]),
    detail: "AuraVoice capture template and timeline must preserve deterministic AuraVoice captureTime metadata"
  });

  checks.push({
    id: "auravoice-cross-repo-v2-viseme-handoff",
    ok: includesAll(auraVoiceSource, [
      "auravoice-visemes-v2",
      "lineId",
      "speakerId",
      "blendshapeWeights",
      "primitiveMouthCard"
    ]),
    detail: "AuraVoice v2 viseme sidecar must hand off primitive and GLB mouth controls to Aura3D"
  });

  checks.push({
    id: "auravoice-cross-repo-audio-stem-evidence",
    ok: includesAll(auraVoiceSource, ["MixStemMetadata", "gainDb", "ducking", "stems"]),
    detail: "AuraVoice audio mix source must expose stem metadata sufficient for Aura3D evidence"
  });
} else {
  checks.push({
    id: "auravoice-cross-repo-source-optional",
    ok: true,
    detail: "AuraVoice sibling repo not present; skipped optional cross-repo source checks"
  });
}

checks.push({
  id: "root-package-public-agent-api-export",
  ok: rootPackage.exports?.["."] !== undefined && JSON.stringify(rootPackage.exports["."]).includes("dist/engine/agent-api/index.js"),
  detail: "root package export must route @aura3d/engine to the public agent API build output"
});

checks.push({
  id: "root-package-agent-api-files",
  ok: rootPackage.files?.includes("dist/engine") === true,
  detail: "root package files must include dist/engine so prompt-animation public API output is published"
});

checks.push({
  id: "root-package-version-is-aura3d-1-0-4",
  ok: rootPackage.version === expectedPackageVersion,
  detail: `root package version should be ${expectedPackageVersion}; actual ${rootPackage.version ?? "missing"}`
});

checks.push({
  id: "root-package-prompt-animation-package-script",
  ok:
    rootPackage.scripts?.["prompt-animation:package"]?.includes("tools/prompt-animation-package-smoke/index.ts") === true &&
    rootPackage.scripts?.["prompt-animation:package"]?.includes(externalViteExecuteFlag) === true,
  detail: "prompt-animation:package should run this smoke tool with external Vite execution evidence enabled"
});

checks.push({
  id: "create-aura3d-animation-template-packaged",
  ok: createAura3dPackage.files?.includes("templates/animation-channel") === true,
  detail: "create-aura3d package metadata must include the animation-channel template"
});

checks.push({
  id: "create-aura3d-prompt-animation-keywords",
  ok: includesAll(createAura3dPackage.keywords, ["animation-animation", "prompt-to-video"]),
  detail: "create-aura3d package metadata should advertise animation animation and prompt-to-video readiness"
});

checks.push({
  id: "animation-template-public-engine-dependency",
  ok: animationTemplatePackage.dependencies?.["@aura3d/engine"] === "latest",
  detail: "animation-channel template should consume the public @aura3d/engine package"
});

checks.push({
  id: "agent-api-prompt-animation-modules-exported",
  ok: includesAll(agentApiIndex, [
    'export * from "./PromptAnimationContract.js"',
    'export * from "./AuraVoiceBridge.js"',
    'export * from "./ShotTimeline.js"',
    'export * from "./DialoguePerformance.js"',
    'export * from "./VisemeController.js"',
    'export * from "./PromptAnimationEvidence.js"',
    'export * from "./AnimationDirector.js"',
    'export * from "./AnimationPerformance.js"',
    'export * from "./AnimationRenderQueue.js"'
  ]),
  detail: "public agent API index must re-export prompt-animation and AuraVoice bridge modules"
});

checks.push({
  id: "agent-api-prompt-plan-public-functions",
  ok: includesAll(agentApiIndex, ["export function definePromptPlan", "export function compilePromptPlan", "export function promptPlanToScene"]),
  detail: "public agent API must expose prompt-plan authoring helpers"
});

checks.push({
  id: "agent-api-animation-namespace",
  ok: includesAll(agentApiIndex, ["export const animation", "episodePlan:", "storyboard:", "shotTimeline:", "renderQueue:", "renderOutputPackage:", "evidence:"]),
  detail: "public agent API must expose the animation namespace for prompt-animation authoring"
});

checks.push({
  id: "agent-api-animation-studio-alias",
  ok: agentApiIndex.includes("export const animationStudio = animation"),
  detail: "public agent API should keep animationStudio as the animation namespace alias"
});

checks.push({
  id: "auravoice-bridge-public-surface",
  ok: includesAll(auraVoiceBridgeSource, [
    "export interface AuraVoiceBridgePackage",
    "export interface AuraVoicePlaybackSample",
    "export function createAuraVoiceBridgePackage",
    "export function createAuraVoiceMasterClock",
    "export function validateAuraVoiceBridgePackage",
    "export function sampleAuraVoiceBridgeAtTime"
  ]),
  detail: "AuraVoice bridge source must expose package creation, validation, clock, and sampling APIs"
});

checks.push({
  id: "auravoice-bridge-publish-readiness-requirements",
  ok: includesAll(auraVoiceBridgeSource, [
    "auravoice-caption-track-missing",
    "auravoice-visemes-missing",
    "auravoice-audio-stems-missing",
    "publishReady"
  ]),
  detail: "AuraVoice bridge validation must guard captions, visemes, audio stems, and publishReady status"
});

checks.push({
  id: "prompt-animation-evidence-render-artifact-metadata",
  ok: includesAll(promptAnimationEvidenceSource, [
    "PromptAnimationConsumedAuraVoiceArtifactMetadata",
    "PromptAnimationRenderedArtifactMetadata",
    "consumedAuraVoiceArtifacts",
    "renderedArtifacts",
    "artifactMetadata",
    "evidence-render-artifact-metadata-missing"
  ]),
  detail: "prompt-animation evidence must expose consumed AuraVoice artifacts and rendered artifact metadata for external package smoke proof"
});

checks.push({
  id: "prompt-animation-contract-public-plan",
  ok: includesAll(promptAnimationContractSource, [
    "export const promptAnimationContractVersion",
    "export interface PromptAnimationEpisodePlan",
    "export interface PromptAnimationStoryboard",
    "export function createPromptAnimationEpisodePlan",
    "export function definePromptAnimationStoryboard"
  ]),
  detail: "prompt-animation contract must expose episode and storyboard plan helpers"
});

checks.push({
  id: "animation-director-public-helper",
  ok: includesAll(animationDirectorSource, ["export function createAnimationDirectorPlan", "export const animationDirector"]),
  detail: "animation director source must expose the public planner helper and namespace"
});

checks.push({
  id: "animation-render-queue-package-metadata",
  ok: includesAll(animationRenderQueueSource, [
    "export function createAnimationRenderQueue",
    "export function createAnimationRenderOutputPackageMetadata",
    "validateAnimationRenderOutputPackageMetadata",
    "youtube"
  ]),
  detail: "animation render queue source must expose render queue and output package metadata helpers"
});

checks.push({
  id: "auravoice-viseme-v2-public-helper",
  ok: includesAll(visemeControllerSource, [
    'export type AuraVoiceVisemeFormat = "auravoice-visemes-v2"',
    "export function createAuraVoiceVisemeTrack",
    "export function createVisemeController",
    "export function validateVisemeTrack"
  ]),
  detail: "viseme controller source must expose AuraVoice v2 track authoring and validation helpers"
});

checks.push({
  id: "animation-template-main-public-import",
  ok: importIncludes(animationTemplateMain, "@aura3d/engine", ["camera", "createAuraApp", "effects", "labels", "lights", "primitives", "scene"]),
  detail: "animation-channel main example should import only public app/rendering helpers from @aura3d/engine"
});

checks.push({
  id: "animation-template-episode-public-import",
  ok: importIncludes(animationTemplateEpisode, "@aura3d/engine", ["animationDirector"]),
  detail: "animation-channel episode example should import animationDirector from @aura3d/engine"
});

checks.push({
  id: "animation-template-render-plan-public-import",
  ok: importIncludes(animationTemplateRenderPlan, "@aura3d/engine", [
    "createAudioStemManifest",
    "createAuraVoiceBridgePackage",
    "createAuraVoiceVisemeTrack",
    "createAnimationPerformanceCoverage",
    "createAnimationRenderOutputPackageMetadata",
    "defineDubMap"
  ]),
  detail: "animation-channel render-plan example should import AuraVoice bridge helpers from @aura3d/engine"
});

checks.push({
  id: "animation-template-bridge-example",
  ok: includesAll(animationTemplateRenderPlan, [
    "export const auraVoicePackage = createAuraVoiceBridgePackage",
    "captionTrack: episode.captionTrack",
    "visemes: visemeTrack",
    "audioStems: audioStemManifest",
    "dubMap: spanishDubMap",
    "renderQueue: renderPlan",
    "renderOutputPackage"
  ]),
  detail: "animation-channel render-plan example must assemble a publish-readiness AuraVoice bridge package"
});

checks.push({
  id: "animation-template-package-metadata-example",
  ok: includesAll(animationTemplateRenderPlan, ["reviewPackagePaths", "thumbnailCapture", "plannedDeterministicCaptureSources"]),
  detail: "animation-channel render-plan example must expose review package, thumbnail, and deterministic capture metadata"
});

checks.push({
  id: "animation-template-readme-public-guidance",
  ok: includesAll(animationTemplateReadme, ["AuraVoice", "animationDirector", "render-plan", "viseme", "caption"]),
  detail: "animation-channel README should document the public prompt-animation and AuraVoice bridge example"
});

checks.push({
  id: "animation-template-no-private-engine-imports",
  ok: !/packages\/engine\/src|@aura3d\/engine\/dist|from\s+["']\.\.\/\.\.\/\.\.\/engine/.test(
    [animationTemplateMain, animationTemplateEpisode, animationTemplateRenderPlan].join("\n")
  ),
  detail: "animation-channel examples must not import private engine source or dist paths"
});

checks.push({
  id: "animation-template-no-three-imports",
  ok: !/\bfrom\s+["']three["']|GLTFLoader|three\/examples/.test([animationTemplateMain, animationTemplateEpisode, animationTemplateRenderPlan].join("\n")),
  detail: "animation-channel examples must stay inside the Aura3D public API instead of three.js or GLTFLoader"
});

const externalPromptFiles = createExternalViteConsumerFiles("file:<packed-aura3d-engine.tgz>");
const externalPromptCombinedSource = Object.values(externalPromptFiles).join("\n");
const externalPromptImportSpecifiers = parseAuraImportSpecifiers(externalPromptCombinedSource);
const externalPromptNonRootImports = externalPromptImportSpecifiers.filter((specifier) => specifier !== "@aura3d/engine");
const externalPromptRootImports = parseRootNamedImports(externalPromptMainSource);
const missingExternalPromptImports = requiredExternalPromptAnimationImports.filter(
  (name) => !externalPromptRootImports.includes(name)
);
const missingExternalPromptSourceUses = requiredExternalPromptAnimationSourceUses.filter(
  (sourceUse) => !externalPromptMainSource.includes(sourceUse)
);
const externalPromptModelArguments = parseModelCallArguments(externalPromptMainSource);
const externalPromptNonTypedModelArguments = externalPromptModelArguments.filter(
  (argument) => !/^assets\.[A-Za-z_$][\w$]*$/.test(argument)
);
const externalPromptForbiddenMatches = forbiddenExternalConsumerPatterns
  .filter(({ pattern }) => pattern.test(externalPromptCombinedSource))
  .map(({ id }) => id);

checks.push({
  id: "external-vite-prompt-animation-consumer-imports-root-package-only",
  ok: externalPromptImportSpecifiers.includes("@aura3d/engine") && externalPromptNonRootImports.length === 0,
  detail: `external Vite prompt-animation smoke imports: ${externalPromptImportSpecifiers.join(", ")}`
});

checks.push({
  id: "external-vite-prompt-animation-consumer-imports-public-apis",
  ok: missingExternalPromptImports.length === 0,
  detail: `missing public prompt-animation imports: ${missingExternalPromptImports.join(", ") || "none"}`
});

checks.push({
  id: "external-vite-prompt-animation-consumer-uses-public-source-pattern",
  ok: missingExternalPromptSourceUses.length === 0,
  detail: `missing prompt-animation source uses: ${missingExternalPromptSourceUses.join(", ") || "none"}`
});

checks.push({
  id: "external-vite-prompt-animation-consumer-uses-typed-assets",
  ok: externalPromptModelArguments.length >= 2 && externalPromptNonTypedModelArguments.length === 0,
  detail: `model call arguments: ${externalPromptModelArguments.join(", ")}`
});

checks.push({
  id: "external-vite-prompt-animation-consumer-avoids-private-three-and-raw-assets",
  ok: externalPromptForbiddenMatches.length === 0,
  detail: `forbidden external prompt smoke matches: ${externalPromptForbiddenMatches.join(", ") || "none"}`
});

const auraVoiceSampleRenderPackageEvidence = createAuraVoiceSampleRenderPackageEvidence();
for (const gate of auraVoiceSampleRenderPackageEvidence.gates) {
  checks.push({
    id: `auravoice-sample-render-package-gate:${gate.id}`,
    ok: gate.ok,
    detail: gate.requirement
  });
}

const externalViteSmoke = collectExternalViteSmokeEvidence(rootPackage.name ?? "@aura3d/engine");
const externalViteSmokeMode = externalViteSmoke["mode"];
const externalViteSmokeOk = externalViteSmoke["ok"];
checks.push({
  id: executeExternalViteSmoke
    ? "external-vite-prompt-animation-package-smoke-executed-and-passed"
    : "external-vite-prompt-animation-package-smoke-plan-emitted",
  ok: executeExternalViteSmoke ? externalViteSmokeOk === true : externalViteSmokeMode === "source-only-plan",
  detail: executeExternalViteSmoke
    ? `external Vite smoke status: ${String(externalViteSmokeOk)}`
    : `external Vite package smoke plan emitted; run with ${externalViteExecuteFlag} for command evidence`
});

const failures = checks.filter((check) => !check.ok);
const report = {
  schema: "a3d-prompt-animation-package-smoke",
  generatedAt: new Date().toISOString(),
  ok: failures.length === 0,
  scope: executeExternalViteSmoke ? "source-package-metadata-and-external-vite-smoke" : "source-package-metadata-and-external-vite-plan",
  sourceComplete: failures.length === 0,
  releaseReady: false,
  claimBoundary: executeExternalViteSmoke
    ? "This package smoke can prove packed public API import/install/build behavior for the prompt-animation consumer. Browser playback, render package bytes, screenshots, deployment, accessibility, and visual approval remain separate execution gates."
    : "This package smoke run is a source-only plan. It inspects package metadata and consumer source expectations but does not prove package install, typecheck, Vite build, browser playback, render package bytes, screenshots, deployment, accessibility, or visual approval.",
  reportPath: "tests/reports/prompt-animation/package-smoke.json",
  executeExternalViteSmoke,
  externalViteExecuteFlag,
  sourceCompleteExpectationGates,
  executionRequiredExpectationGates,
  externalViteSmoke,
  auraVoiceSampleRenderPackageEvidence,
  checks,
  failures
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(sampleRenderPackageReportPath, `${JSON.stringify(auraVoiceSampleRenderPackageEvidence, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

function read(file: string): string {
  return readFrom(root, file);
}

function readFrom(base: string, file: string): string {
  const path = resolve(base, file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function readJson<T>(file: string): T {
  const source = read(file);
  return source ? JSON.parse(source) as T : {} as T;
}

function includesAll(source: readonly string[] | string | undefined, tokens: readonly string[]): boolean {
  if (!source) return false;
  if (Array.isArray(source)) return tokens.every((token) => source.includes(token));
  return tokens.every((token) => source.includes(token));
}

function importIncludes(source: string, moduleName: string, names: readonly string[]): boolean {
  const imports = Array.from(source.matchAll(/import\s+\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];?/g));
  return imports
    .filter((match) => match[2] === moduleName)
    .some((match) => names.every((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(match[1] ?? "")));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseRootNamedImports(source: string): string[] {
  const names = new Set<string>();
  const importMatches = source.matchAll(
    /import\s+(?:type\s+)?\{\s*([^}]+)\s*\}\s*from\s*["']@aura3d\/engine["']/gs
  );

  for (const match of importMatches) {
    for (const rawName of (match[1] ?? "").split(",")) {
      const name = rawName.trim().split(/\s+as\s+/i)[0]?.trim();
      if (name) names.add(name);
    }
  }

  return [...names].sort();
}

function parseAuraImportSpecifiers(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(/\bfrom\s*["'](@aura3d\/engine[^"']*)["']/g)].map((match) => match[1] ?? "")
    )
  ].filter(Boolean).sort();
}

function parseModelCallArguments(source: string): string[] {
  return [...source.matchAll(/\bmodel\s*\(([^)]*)\)/g)].map((match) => (match[1] ?? "").trim());
}

function createExternalViteConsumerFiles(packageDependency: string): Record<string, string> {
  const consumerPackageJson = {
    name: "aura3d-prompt-animation-package-smoke-consumer",
    private: true,
    type: "module",
    scripts: {
      dev: "vite --host 127.0.0.1"
    },
    dependencies: {
      "@aura3d/engine": packageDependency
    },
    devDependencies: {
      typescript: "^5.8.0",
      vite: "^6.0.0"
    }
  };

  const tsconfigJson = {
    compilerOptions: {
      target: "ES2022",
      useDefineForClassFields: true,
      module: "ESNext",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      skipLibCheck: true,
      moduleResolution: "Bundler",
      strict: true,
      noEmit: true
    },
    include: ["src"]
  };

  return {
    "package.json": `${JSON.stringify(consumerPackageJson, null, 2)}\n`,
    "tsconfig.json": `${JSON.stringify(tsconfigJson, null, 2)}\n`,
    "vite.config.ts": externalPromptViteConfigSource,
    "index.html": externalPromptIndexHtmlSource,
    "src/aura-assets.ts": externalPromptAuraAssetsSource,
    "src/main.ts": externalPromptMainSource
  };
}

function writeExternalViteConsumer(appDir: string, packageDependency: string): Record<string, string> {
  const files = createExternalViteConsumerFiles(packageDependency);
  for (const [file, contents] of Object.entries(files)) {
    const targetPath = join(appDir, file);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, contents, "utf8");
  }
  return files;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tail(value: unknown, lines = 24): string {
  const text = typeof value === "string" ? value : Buffer.isBuffer(value) ? value.toString("utf8") : "";
  return text.split(/\r?\n/).slice(-lines).join("\n").trim();
}

function skippedCommand(label: string, command: readonly string[], cwd: string, reason: string): CommandEvidence {
  return {
    label,
    command,
    cwd,
    exitCode: null,
    durationMs: 0,
    stdoutTail: "",
    stderrTail: "",
    skipped: true,
    error: reason
  };
}

function runCommand(label: string, command: readonly string[], cwd: string): CommandEvidence {
  const [executable, ...args] = command;
  if (!executable) {
    return skippedCommand(label, command, cwd, "empty command");
  }

  const startedAt = Date.now();
  try {
    const stdout = execFileSync(executable, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: externalViteCommandTimeoutMs
    });

    return {
      label,
      command,
      cwd,
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      stdoutTail: tail(stdout),
      stderrTail: ""
    };
  } catch (error) {
    const execError = error as Error & {
      status?: number;
      signal?: string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };

    return {
      label,
      command,
      cwd,
      exitCode: typeof execError.status === "number" ? execError.status : null,
      durationMs: Date.now() - startedAt,
      stdoutTail: tail(execError.stdout),
      stderrTail: tail(execError.stderr),
      ...(execError.signal ? { signal: execError.signal } : {}),
      error: execError.message
    };
  }
}

function plannedExternalViteCommands(tarballPath = "<packed-aura3d-engine.tgz>"): Record<string, readonly string[]> {
  return {
    pack: ["npm", "pack", "--pack-destination", "<temp-pack-dir>", "--silent"],
    install: ["npm", "install", "--no-audit", "--no-fund"],
    typecheck: ["npm", "exec", "tsc", "--", "--noEmit", "--pretty", "false"],
    viteBuild: ["npm", "exec", "vite", "--", "build", "--logLevel", "warn"],
    packageDependency: [`file:${tarballPath}`]
  };
}

function collectExternalViteSmokeEvidence(packageName: string): Record<string, unknown> {
  const plannedFiles = createExternalViteConsumerFiles("file:<packed-aura3d-engine.tgz>");
  const sourceFileHashes = Object.fromEntries(
    Object.entries(plannedFiles).map(([file, contents]) => [file, `sha256:${hashText(contents)}`])
  );
  const baseEvidence = {
    schema: "a3d-prompt-animation-external-vite-package-smoke",
    packageName,
    executeFlag: externalViteExecuteFlag,
    freshExternalViteApp: true,
    packageSource: "npm-pack-current-checkout",
    consumerKind: "external-vite-typescript-app",
    sourceFiles: Object.keys(plannedFiles).sort(),
    sourceFileHashes,
    plannedCommands: plannedExternalViteCommands()
  };

  if (!executeExternalViteSmoke) {
    return {
      ...baseEvidence,
      mode: "source-only-plan",
      ok: null,
      commands: [],
      note: `Pass ${externalViteExecuteFlag} to pack the current checkout, install it in a fresh temp Vite app, run TypeScript and Vite build checks, and write command evidence.`
    };
  }

  let tempRoot: string | undefined;
  let appDir: string | undefined;
  let tarballPath: string | undefined;
  let tarballSha256: string | null = null;
  const commands: CommandEvidence[] = [];
  const issues: string[] = [];
  const cleanup: Record<string, unknown> = {
    attempted: false,
    ok: null
  };

  try {
    tempRoot = mkdtempSync(join(tmpdir(), "aura3d-prompt-animation-external-vite-smoke-"));
    const packDir = join(tempRoot, "pack");
    appDir = join(tempRoot, "consumer");
    mkdirSync(packDir, { recursive: true });
    mkdirSync(appDir, { recursive: true });

    const packCommand = ["npm", "pack", "--pack-destination", packDir, "--silent"] as const;
    const packResult = runCommand("npm-pack-current-checkout", packCommand, root);
    commands.push(packResult);

    if (packResult.exitCode === 0) {
      const packedFile = packResult.stdoutTail
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1);
      if (packedFile) {
        tarballPath = join(packDir, packedFile);
        try {
          tarballSha256 = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
        } catch (error) {
          issues.push(`packed tarball could not be hashed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        issues.push("npm pack did not emit a tarball filename.");
      }
    }

    if (tarballPath && tarballSha256 && appDir) {
      const files = writeExternalViteConsumer(appDir, `file:${tarballPath}`);
      const packageFile = JSON.parse(files["package.json"] ?? "{}") as { dependencies?: Record<string, string> };
      if (packageFile.dependencies?.["@aura3d/engine"] !== `file:${tarballPath}`) {
        issues.push("external Vite consumer did not point @aura3d/engine at the packed tarball.");
      }
    }

    const installCommand = ["npm", "install", "--no-audit", "--no-fund"] as const;
    const typecheckCommand = ["npm", "exec", "tsc", "--", "--noEmit", "--pretty", "false"] as const;
    const viteBuildCommand = ["npm", "exec", "vite", "--", "build", "--logLevel", "warn"] as const;

    if (issues.length === 0 && appDir) {
      commands.push(runCommand("external-vite-npm-install", installCommand, appDir));
    } else {
      commands.push(skippedCommand("external-vite-npm-install", installCommand, appDir ?? "<consumer>", issues.join("; ")));
    }

    if (commands.every((command) => command.exitCode === 0) && appDir) {
      commands.push(runCommand("external-vite-typecheck", typecheckCommand, appDir));
    } else {
      commands.push(skippedCommand("external-vite-typecheck", typecheckCommand, appDir ?? "<consumer>", "prior package install smoke step failed"));
    }

    if (commands.every((command) => command.exitCode === 0) && appDir) {
      commands.push(runCommand("external-vite-build", viteBuildCommand, appDir));
    } else {
      commands.push(skippedCommand("external-vite-build", viteBuildCommand, appDir ?? "<consumer>", "prior package install smoke step failed"));
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (tempRoot) {
      cleanup.attempted = true;
      try {
        rmSync(tempRoot, { recursive: true, force: true });
        cleanup.ok = true;
      } catch (error) {
        cleanup.ok = false;
        cleanup.error = error instanceof Error ? error.message : String(error);
      }
    }
  }

  const failedCommands = commands.filter((command) => command.exitCode !== 0);
  const ok = issues.length === 0 && failedCommands.length === 0 && tarballSha256 !== null;

  return {
    ...baseEvidence,
    mode: "executed",
    ok,
    tempRoot,
    appDir,
    tarballPath,
    tarballSha256,
    commands,
    failedCommands: failedCommands.map((command) => command.label),
    issues,
    cleanup
  };
}

function createAuraVoiceSampleRenderPackageEvidence(): {
  readonly schema: "a3d-auravoice-sample-render-package-gates";
  readonly version: 1;
  readonly sourceOnly: true;
  readonly status: "source-package-ready" | "source-package-incomplete";
  readonly executionBoundary: string;
  readonly outputPath: "tests/reports/prompt-animation/auravoice-sample-render-package-gates.json";
  readonly contract: {
    readonly id: "auravoice-aura3d-prompt-animation/v1";
    readonly requiredValidator: "validateAuraVoiceBridgePackage";
    readonly requiredSampler: "sampleAuraVoiceBridgeAtTime";
  };
  readonly artifactExpectations: readonly AuraVoiceSamplePackageArtifactExpectation[];
  readonly gates: readonly AuraVoiceSamplePackageGate[];
} {
  const gates = [
    samplePackageGate({
      id: "contract-proof-source",
      title: "Contract proof source",
      requirement: "Package smoke output must prove source coverage for the AuraVoice/Aura3D contract id, bridge creation, validation, sampling, and publish-readiness state.",
      sourceSignals: [
        packageSignal("AuraVoiceBridge.ts", auraVoiceBridgeSource, "createAuraVoiceBridgePackage"),
        packageSignal("AuraVoiceBridge.ts", auraVoiceBridgeSource, "validateAuraVoiceBridgePackage"),
        packageSignal("AuraVoiceBridge.ts", auraVoiceBridgeSource, "sampleAuraVoiceBridgeAtTime"),
        packageSignal("PromptAnimationContract.ts", promptAnimationContractSource, "auravoice-aura3d-prompt-animation/v1"),
        packageSignal("AuraVoiceBridge.ts", auraVoiceBridgeSource, "publishReady"),
        packageSignal("AuraVoice sibling source", auraVoiceSource, "AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID", auraVoiceSource.length > 0)
      ],
      evidenceJsonFields: [
        "contract.id",
        "contract.source",
        "bridgeValidation.ok",
        "bridgeValidation.issues",
        "publishReady",
        "sampledBridgeFrames[]"
      ],
      laterExecutionProofRequired: [
        "The later render/package run must persist validateAuraVoiceBridgePackage results.",
        "The later render/package run must include sampled AuraVoice bridge frames from exact render timestamps."
      ]
    }),
    samplePackageGate({
      id: "caption-viseme-sync-source",
      title: "Caption and viseme sync source",
      requirement: "Package smoke output must prove source coverage for synchronized captions and visemes under the same dialogue/shot timebase.",
      sourceSignals: [
        packageSignal("PromptAnimationEvidence.ts", promptAnimationEvidenceSource, "collectPromptAnimationEvidence"),
        packageSignal("AuraVoiceBridge.ts", auraVoiceBridgeSource, "captionTrack"),
        packageSignal("VisemeController.ts", visemeControllerSource, "createAuraVoiceVisemeTrack"),
        packageSignal("VisemeController.ts", visemeControllerSource, "sampleVisemeTrack"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "captionFrameSyncSourceProof"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "captionDisplayWithinOneFrame"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "visemeFrameSyncSourceProof"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "mouthMovementWithinOneFrame"),
        packageSignal("source gates", promptAnimationSourceGates, "createCaptionTimingProof"),
        packageSignal("source gates", promptAnimationSourceGates, "maxTimingDriftFrames")
      ],
      evidenceJsonFields: [
        "captionTimingProof.allowedDriftFrames",
        "captionTimingProof.maxObservedDriftFrames",
        "captionFrameSyncSourceProof.captionDisplayWithinOneFrame",
        "captionSamples[].captionCueId",
        "visemeSyncProof.allowedDriftFrames",
        "visemeSyncProof.maxObservedDriftFrames",
        "visemeFrameSyncSourceProof.mouthMovementWithinOneFrame",
        "visemeSamples[].speakerId",
        "visemeSamples[].lineId"
      ],
      laterExecutionProofRequired: [
        "The later render/package run must compare caption samples and viseme samples at identical AuraVoice timestamps.",
        "The later render/package run must fail if drift exceeds the episode runtime maxTimingDriftFrames budget."
      ]
    }),
    samplePackageGate({
      id: "required-render-artifacts-source",
      title: "Required render artifacts source",
      requirement: "Package smoke output must prove source coverage for video, thumbnail, captions, timeline, audio stems, evidence JSON, and review metadata expectations.",
      sourceSignals: [
        packageSignal("AnimationRenderQueue.ts", animationRenderQueueSource, "createAnimationRenderOutputPackageMetadata"),
        packageSignal("AnimationRenderQueue.ts", animationRenderQueueSource, "validateAnimationRenderOutputPackageMetadata"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "reviewPackagePaths"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "thumbnailCapture"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "audioStemManifest"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "renderOutputPackage"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "plannedDeterministicCaptureSources"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "sampleRenderSourceWorkflow"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "doesNotClaimRenderedArtifacts"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "humanReviewRequired")
      ],
      evidenceJsonFields: [
        "artifacts.video",
        "artifacts.thumbnail",
        "artifacts.captions",
        "artifacts.timeline",
        "artifacts.audioStems",
        "artifacts.evidenceJson",
        "reviewPackagePaths",
        "youtubeDraftMetadata"
      ],
      laterExecutionProofRequired: [
        "The later render/package run must include paths, hashes, byte sizes, media types, and stable ids for all required artifacts.",
        "The later render/package run must prove the thumbnail was captured from the same Aura3D scene state as the video."
      ]
    }),
    samplePackageGate({
      id: "viseme-proof-source",
      title: "Viseme proof source",
      requirement: "Package smoke output must prove source coverage for per-line speaker viseme coverage and GLB/primitive mouth control evidence.",
      sourceSignals: [
        packageSignal("VisemeController.ts", visemeControllerSource, "auravoice-visemes-v2"),
        packageSignal("VisemeController.ts", visemeControllerSource, "lineId"),
        packageSignal("VisemeController.ts", visemeControllerSource, "speakerId"),
        packageSignal("VisemeController.ts", visemeControllerSource, "blendshapeWeights"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "visemes: visemeTrack"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "sampledMouthStates"),
        packageSignal("source gates", promptAnimationSourceGates, "sampleVisemeTrack")
      ],
      evidenceJsonFields: [
        "visemeSyncProof.coveredLineIds",
        "visemeSyncProof.missingLineIds",
        "visemeFrameSyncSourceProof.sampledMouthStates[]",
        "visemeSyncProof.sampledCues[]",
        "visemeSyncProof.primitiveMouthCues",
        "visemeSyncProof.blendshapeCueCount"
      ],
      laterExecutionProofRequired: [
        "The later render/package run must fail if any dialogue line lacks a viseme cue in the active language.",
        "The later render/package run must preserve speaker id and line id on sampled viseme cues."
      ]
    }),
    samplePackageGate({
      id: "dub-sync-proof-source",
      title: "Dub sync proof source",
      requirement: "Package smoke output must prove source coverage for original-to-dub caption linkage and timing evidence.",
      sourceSignals: [
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "defineDubMap"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "dubMap: spanishDubMap"),
        packageSignal("source gates", promptAnimationSourceGates, "originalCaptionId"),
        packageSignal("source gates", promptAnimationSourceGates, "dubbedCaptionId"),
        packageSignal("source gates", promptAnimationSourceGates, "storyboard caption renders")
      ],
      evidenceJsonFields: [
        "dubSyncProof.sourceLanguage",
        "dubSyncProof.targetLanguage",
        "dubSyncProof.originalCaptionId",
        "dubSyncProof.dubbedCaptionId",
        "dubSyncProof.lineId",
        "dubSyncProof.shotId",
        "dubSyncProof.maxObservedDriftFrames"
      ],
      laterExecutionProofRequired: [
        "The later render/package run must prove original and dubbed caption ids remain linked to the same dialogue line and shot.",
        "The later render/package run must fail if dubbed caption timing drifts outside the one-frame budget."
      ]
    }),
    samplePackageGate({
      id: "deterministic-package-source",
      title: "Deterministic render package source",
      requirement: "Package smoke output must prove source coverage for deterministic capture timestamps, render package metadata, and stable artifact hashes.",
      sourceSignals: [
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "plannedDeterministicCaptureSources"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "thumbnailCapture"),
        packageSignal("template render-plan.ts", animationTemplateRenderPlan, "sampleRenderSourceWorkflow"),
        packageSignal("source gates", promptAnimationSourceGates, "createPromptAnimationDeterministicScreenshotFixtureMetadata"),
        packageSignal("AuraVoice sibling source", auraVoiceSource, "auraVoiceTimestamp", auraVoiceSource.length > 0),
        packageSignal("AuraVoice sibling source", auraVoiceSource, "deterministicCaptureTimesForRange", auraVoiceSource.length > 0)
      ],
      evidenceJsonFields: [
        "deterministicRenderPackage.captureTimes",
        "deterministicRenderPackage.frameRate",
        "deterministicRenderPackage.resolution",
        "deterministicRenderPackage.artifactManifest[].sha256",
        "deterministicRenderPackage.renderQueueHash",
        "deterministicRenderPackage.timelineHash",
        "deterministicRenderPackage.audioStemManifestHash"
      ],
      laterExecutionProofRequired: [
        "The later render/package run must use AuraVoice timestamps as capture inputs, not wall-clock time.",
        "The later render/package run must hash the render queue, timeline, captions, audio-stem manifest, thumbnail, video, and evidence JSON."
      ]
    })
  ] as const;

  return {
    schema: "a3d-auravoice-sample-render-package-gates",
    version: 1,
    sourceOnly: true,
    status: gates.every((gate) => gate.ok) ? "source-package-ready" : "source-package-incomplete",
    executionBoundary: "This package smoke evidence is source-only. It checks that package/readiness tooling can later emit the AuraVoice sample render evidence JSON; it does not prove a render, audio mix, browser screenshot, deployment, or human visual review happened.",
    outputPath: "tests/reports/prompt-animation/auravoice-sample-render-package-gates.json",
    contract: {
      id: "auravoice-aura3d-prompt-animation/v1",
      requiredValidator: "validateAuraVoiceBridgePackage",
      requiredSampler: "sampleAuraVoiceBridgeAtTime"
    },
    artifactExpectations: [
      packageArtifactExpectation("video", true, "mp4", ["path", "sha256", "byteSize", "duration", "frameRate", "resolution", "renderQueueId"], "Rendered from deterministic AuraVoice capture times and the packaged Aura3D render queue."),
      packageArtifactExpectation("thumbnail", true, "png", ["path", "sha256", "byteSize", "width", "height", "captureTime", "shotId"], "Captured from the same Aura3D scene state as the video frame package."),
      packageArtifactExpectation("captions", true, "vtt", ["path", "sha256", "byteSize", "language", "cueCount", "captionTrackId"], "Derived from the synchronized caption track and linked to dialogue/shot ids."),
      packageArtifactExpectation("timeline", true, "json", ["path", "sha256", "byteSize", "shotTimelineId", "frameRate", "duration"], "The deterministic shot timeline used for render sampling."),
      packageArtifactExpectation("audio-stems", true, "json", ["path", "sha256", "byteSize", "stemCount", "dialogueStemCount", "sfxStemCount"], "Audio stem manifest preserving dialogue/music/SFX timing and ducking metadata."),
      packageArtifactExpectation("evidence-json", true, "json", ["path", "sha256", "byteSize", "schema", "ok", "gates", "proofs"], "Machine-readable evidence for contract, caption, viseme, dub, package, and deterministic render gates."),
      packageArtifactExpectation("youtube-draft-metadata", true, "json", ["title", "description", "language", "videoPath", "thumbnailPath", "captionsPath"], "Review/upload metadata tied to the packaged video, thumbnail, and captions artifacts."),
      packageArtifactExpectation("webm-video", false, "webm", ["path", "sha256", "byteSize", "duration", "frameRate", "resolution"], "Optional alternate encode with the same deterministic source timing.")
    ],
    gates
  };
}

function samplePackageGate(input: {
  readonly id: string;
  readonly title: string;
  readonly requirement: string;
  readonly sourceSignals: readonly AuraVoiceSamplePackageSourceSignal[];
  readonly evidenceJsonFields: readonly string[];
  readonly laterExecutionProofRequired: readonly string[];
}): AuraVoiceSamplePackageGate {
  return {
    ...input,
    ok: input.sourceSignals.every((signal) => !signal.required || signal.present)
  };
}

function packageSignal(sourceName: string, sourceText: string, token: string, required = true): AuraVoiceSamplePackageSourceSignal {
  return {
    source: sourceName,
    token,
    present: sourceText.includes(token),
    required
  };
}

function packageArtifactExpectation(
  id: string,
  required: boolean,
  kind: string,
  evidenceJsonFields: readonly string[],
  deterministicRequirement: string
): AuraVoiceSamplePackageArtifactExpectation {
  return {
    id,
    required,
    kind,
    evidenceJsonFields,
    deterministicRequirement
  };
}
