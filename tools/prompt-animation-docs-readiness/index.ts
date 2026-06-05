import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const docs = [
  "docs/api/prompt-animation.md",
  "docs/api/auravoice-bridge.md",
  "docs/examples/cartoon-channel.md",
  "docs/examples/prompt-to-episode.md",
  "llms.txt"
];

const requiredTokens = [
  "AuraVoice",
  "viseme",
  "phoneme",
  "dub",
  "caption",
  "shot timeline",
  "render queue",
  "audio stem",
  "render/export",
  "cartoon-channel",
  "typed assets",
  "do not invent"
];

const sourceCompleteGates = [
  {
    id: "public-api-examples",
    title: "Prompt animation public API examples",
    files: ["docs/api/prompt-animation.md", "docs/api/auravoice-bridge.md", "docs/examples/cartoon-channel.md", "llms.txt"],
    tokens: [
      "from \"@aura3d/engine\"",
      "import { assets } from \"./aura-assets\"",
      "model(assets.",
      "compilePromptEpisodePlan",
      "createAuraVoiceBridgePackage",
      "installShotPlayback"
    ]
  },
  {
    id: "auravoice-contract-source",
    title: "AuraVoice bridge source contract",
    files: ["docs/api/prompt-animation.md", "docs/api/auravoice-bridge.md", "docs/examples/cartoon-channel.md"],
    tokens: [
      "createAuraVoiceVisemeTrack",
      "createAudioStemManifest",
      "validateAuraVoiceBridgePackage",
      "sampleAuraVoiceBridgeAtTime",
      "caption",
      "viseme"
    ]
  },
  {
    id: "render-readiness-boundary",
    title: "Render and publish readiness boundary",
    files: ["docs/api/prompt-animation.md", "docs/api/auravoice-bridge.md", "docs/examples/cartoon-channel.md", "llms.txt"],
    tokens: [
      "Source-complete",
      "Execution-required",
      "render queue",
      "screenshot",
      "deployment",
      "visual approval"
    ]
  }
] as const;

const executionRequiredGates = [
  {
    id: "typecheck-and-package-smoke",
    status: "execution-required",
    requiredEvidence: [
      "pnpm typecheck output",
      "packed @aura3d/engine prompt-animation package smoke output",
      "external clean consumer TypeScript/Vite smoke output"
    ]
  },
  {
    id: "browser-shot-playback-proof",
    status: "execution-required",
    requiredEvidence: [
      "browser report showing shot playback",
      "caption timing evidence",
      "viseme/character performance evidence",
      "camera cut evidence",
      "nonblank screenshot/video artifact"
    ]
  },
  {
    id: "render-package-proof",
    status: "execution-required",
    requiredEvidence: [
      "render queue execution report",
      "video/still/thumbnail/caption/audio/evidence artifacts",
      "byte sizes and SHA-256 hashes",
      "timing drift report"
    ]
  },
  {
    id: "deploy-accessibility-and-review-proof",
    status: "execution-required",
    requiredEvidence: [
      "durable HTTPS route proof",
      "static asset/evidence byte match",
      "reduced-motion/high-contrast/caption readability evidence",
      "human or automated visual approval artifact"
    ]
  }
] as const;

const combined = docs.map(read).join("\n").toLowerCase();
const missingFiles = docs.filter((file) => !existsSync(resolve(root, file)));
const missingTokens = requiredTokens.filter((token) => !combined.includes(token.toLowerCase()));
const sourceGateReports = sourceCompleteGates.map((gate) => {
  const source = gate.files.map(read).join("\n");
  const lowerSource = source.toLowerCase();
  const missingGateFiles = gate.files.filter((file) => !existsSync(resolve(root, file)));
  const missingGateTokens = gate.tokens.filter((token) => !lowerSource.includes(token.toLowerCase()));
  return {
    ...gate,
    status: missingGateFiles.length === 0 && missingGateTokens.length === 0 ? "source-complete" : "source-incomplete",
    missingFiles: missingGateFiles,
    missingTokens: missingGateTokens
  };
});
const sourceComplete = missingFiles.length === 0 && missingTokens.length === 0 && sourceGateReports.every((gate) => gate.status === "source-complete");
const report = {
  kind: "aura-prompt-animation-docs-readiness",
  ok: sourceComplete,
  status: sourceComplete ? "source-complete-execution-required" : "source-incomplete",
  sourceComplete,
  releaseReady: false,
  claimBoundary: "This readiness manifest checks docs/API source coverage only. It does not run typecheck, tests, browser routes, package smoke, render queues, audio/video export, deployment checks, screenshots, accessibility review, or visual approval.",
  missingFiles,
  missingTokens,
  sourceCompleteGates: sourceGateReports,
  executionRequiredGates
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

function read(file: string): string {
  const path = resolve(root, file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
