import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const docs = [
  "docs/api/game-runtime.md",
  "docs/examples/fighting-game.md",
  "llms.txt"
];

const requiredTokens = [
  "app.onFrame",
  "app.offFrame",
  "app.input",
  "app.evidence",
  "game.evidence",
  "game.runtimeNode",
  "game.kinematicBody",
  "game.combatWorld",
  "game.cameraDirector",
  "game.effects",
  "input.combo",
  "create-aura3d@latest aura-fighter --template fighting-game"
];

const sourceCompleteGates = [
  {
    id: "public-api-examples",
    title: "Public API examples",
    files: ["docs/api/game-runtime.md", "docs/examples/fighting-game.md", "llms.txt"],
    tokens: [
      "from \"@aura3d/engine\"",
      "import { assets } from \"./aura-assets\"",
      "model(assets.",
      "game.runtimeNode",
      "createAuraApp",
      "app.onFrame"
    ]
  },
  {
    id: "runtime-systems-source",
    title: "Runtime systems source coverage",
    files: ["docs/api/game-runtime.md", "docs/examples/fighting-game.md"],
    tokens: [
      "app.input",
      "game.kinematicBody",
      "game.combatWorld",
      "game.effects",
      "game.cameraDirector",
      "game.evidence(app)"
    ]
  },
  {
    id: "safe-asset-guidance",
    title: "Typed asset and safe API guidance",
    files: ["docs/api/game-runtime.md", "docs/examples/fighting-game.md", "llms.txt"],
    tokens: [
      "npx @aura3d/cli@latest assets add",
      "Do not use `model(\"stage\")`",
      "Do not claim a game route is launch-ready"
    ]
  }
] as const;

const executionRequiredGates = [
  {
    id: "typecheck-and-package-smoke",
    status: "execution-required",
    requiredEvidence: [
      "pnpm typecheck output",
      "packed @aura3d/engine package install smoke output",
      "external clean consumer TypeScript/Vite smoke output"
    ]
  },
  {
    id: "browser-runtime-proof",
    status: "execution-required",
    requiredEvidence: [
      "browser report showing frame-loop movement",
      "input or replay evidence",
      "collision/combat event evidence",
      "animation state-change evidence",
      "nonblank screenshot/video artifact"
    ]
  },
  {
    id: "asset-stage-and-deploy-proof",
    status: "execution-required",
    requiredEvidence: [
      "CLI game asset validation output",
      "stage screenshot acceptance evidence",
      "durable deployed route proof",
      "GLB/static asset fetch proof"
    ]
  },
  {
    id: "accessibility-and-visual-approval",
    status: "execution-required",
    requiredEvidence: [
      "reduced-motion/reduced-flash/pause control evidence",
      "HUD/label/focus evidence",
      "human or automated visual approval artifact"
    ]
  }
] as const;

const combined = docs.map(read).join("\n");
const missingFiles = docs.filter((file) => !existsSync(resolve(root, file)));
const missingTokens = requiredTokens.filter((token) => !combined.includes(token));
const sourceGateReports = sourceCompleteGates.map((gate) => {
  const source = gate.files.map(read).join("\n");
  const missingGateFiles = gate.files.filter((file) => !existsSync(resolve(root, file)));
  const missingGateTokens = gate.tokens.filter((token) => !source.includes(token));
  return {
    ...gate,
    status: missingGateFiles.length === 0 && missingGateTokens.length === 0 ? "source-complete" : "source-incomplete",
    missingFiles: missingGateFiles,
    missingTokens: missingGateTokens
  };
});
const sourceComplete = missingFiles.length === 0 && missingTokens.length === 0 && sourceGateReports.every((gate) => gate.status === "source-complete");
const report = {
  kind: "aura-game-runtime-docs-readiness",
  ok: sourceComplete,
  status: sourceComplete ? "source-complete-execution-required" : "source-incomplete",
  sourceComplete,
  releaseReady: false,
  claimBoundary: "This readiness manifest checks docs/API source coverage only. It does not run typecheck, tests, browser routes, package smoke, asset validation, deployment checks, screenshots, accessibility review, or visual approval.",
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
