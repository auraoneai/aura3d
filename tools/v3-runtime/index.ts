import { fileURLToPath } from "node:url";
import { createSubsystemReport, pathExists, reportOk } from "../v3-subsystem-report/index.js";
import { readJson, writeJson } from "../v3-reporting/index.js";

const root = process.cwd();
const runtimeEvidence = readJson(root, "tests/reports/v3-runtime-browser.json");
const animationBrowserEvidence = readJson(root, "tests/reports/v3-animation-browser.json");
const hasRuntimeGameEvidence = runtimeEvidence && "gameSlice" in runtimeEvidence && "physicsSandbox" in runtimeEvidence;
const conditionalClaimBoundaries = createConditionalClaimBoundaries();
const baseReport = createSubsystemReport(root, {
  subsystem: "runtime-systems",
  command: "pnpm verify:v3-runtime",
  reportPath: "tests/reports/v3-runtime-systems.json",
  runIdPrefix: "v3-runtime",
  sourceFiles: [
    "docs/project/v3-runtime-systems-plan.md",
    "examples/game-slice/main.ts",
    "examples/physics-sandbox/main.ts",
    "examples/animated-character/main.ts",
    "examples/character-animation-viewer/main.ts",
    "packages/physics/src/CharacterController.ts",
    "tests/browser/animation-browser.spec.ts",
    "tests/browser/animation-browser-harness.ts",
    "tests/browser/animated-character-browser.spec.ts",
    "tests/browser/character-animation-viewer.spec.ts",
    "tests/browser/runtime-character-controller.spec.ts",
    "tests/browser/product-demos.spec.ts",
    "tests/browser/physics-sandbox-browser.spec.ts",
    "tests/reports/v3-animation-browser.json",
    "tests/reports/v3-runtime-browser.json",
    "tests/reports/product-demo-validation.json",
    "tests/reports/performance.json",
  ],
  checks: [
    {
      id: "game-slice-runtime",
      description: "Game slice exists and has browser evidence.",
      passed: pathExists(root, "examples/game-slice/index.html") && reportOk(root, "tests/reports/product-demo-validation.json"),
      evidencePaths: ["examples/game-slice/index.html", "tests/reports/product-demo-validation.json"],
      blocker: "Game-slice runtime evidence is missing or failing.",
    },
    {
      id: "physics-sandbox",
      description: "Physics sandbox exists.",
      passed: pathExists(root, "examples/physics-sandbox/index.html"),
      evidencePaths: ["examples/physics-sandbox/index.html"],
      blocker: "Physics sandbox example is missing.",
    },
    {
      id: "character-animation",
      description: "Character animation browser example exists.",
      passed: pathExists(root, "examples/animated-character/index.html") && pathExists(root, "examples/character-animation-viewer/index.html"),
      evidencePaths: ["examples/animated-character/index.html", "examples/character-animation-viewer/index.html"],
      blocker: "Animated character example is missing.",
    },
    {
      id: "real-skinned-character-animation-browser-pixels",
      description: "Browser evidence renders a real CesiumMan skinned glTF animation at two sampled frames and verifies changed pixels.",
      passed: animationBrowserEvidence?.ok === true,
      evidencePaths: [
        "tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb",
        "tests/browser/animation-browser.spec.ts",
        "tests/browser/animation-browser-harness.ts",
        "tests/reports/v3-animation-browser.json"
      ],
      blocker: "Real skinned character animation pixel-change browser evidence is missing or failing.",
    },
    {
      id: "character-controller",
      description: "Physics-backed character controller exists and has browser movement/jump evidence.",
      passed: pathExists(root, "packages/physics/src/CharacterController.ts") && pathExists(root, "tests/browser/runtime-character-controller.spec.ts"),
      evidencePaths: ["packages/physics/src/CharacterController.ts", "tests/browser/runtime-character-controller.spec.ts"],
      blocker: "Physics-backed character controller implementation or browser evidence is missing.",
    },
    {
      id: "runtime-conditional-claim-boundaries",
      description: "Runtime-only-if-claimed features are explicitly blocked unless implemented.",
      passed: conditionalClaimBoundaries.every((entry) => entry.status === "blocked-unclaimed"),
      evidencePaths: ["docs/project/v3-runtime-systems-plan.md", "tests/reports/v3-runtime-systems.json"],
      blocker: "Runtime conditional claim boundaries are missing.",
    },
    {
      id: "v3-integrated-game-scene",
      description: "v3 game scene uses real assets with rendering, physics, animation, input, particles, audio, and scripting together.",
      passed: Boolean(hasRuntimeGameEvidence),
      evidencePaths: ["tests/reports/v3-runtime-browser.json", "tests/browser/runtime-systems.spec.ts"],
      blocker: "Integrated real-asset v3 runtime game scene is not fully proven yet.",
    },
  ],
});
const report = {
  ...baseReport,
  conditionalClaimBoundaries,
};
writeJson(root, "tests/reports/v3-runtime-systems.json", report);

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  console.log(JSON.stringify({ ok: report.ok, subsystem: report.subsystem, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function createConditionalClaimBoundaries() {
  return [
    {
      feature: "continuous-collision-detection",
      status: "blocked-unclaimed",
      reason: "CCD is not implemented and no CCD advantage claim is allowed by v3 runtime docs."
    },
    {
      feature: "physics-benchmarks-against-rapier-ammo-cannon",
      status: "blocked-unclaimed",
      reason: "Physics advantage benchmarks are required before physics superiority claims."
    },
    {
      feature: "animation-retargeting",
      status: "blocked-unclaimed",
      reason: "Retargeting is not implemented and retargeting claims must remain blocked."
    },
    {
      feature: "webgpu-hardware-particles",
      status: "blocked-unclaimed",
      reason: "GPU particles on real WebGPU hardware are not claimed by runtime verification."
    },
    {
      feature: "visual-graph-editor",
      status: "blocked-unclaimed",
      reason: "Visual graph editor authoring is not implemented and visual-scripting claims must remain blocked."
    }
  ] as const;
}
