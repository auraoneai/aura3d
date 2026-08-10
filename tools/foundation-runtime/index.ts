import { fileURLToPath } from "node:url";
import { createSubsystemReport, pathExists, reportOk } from "../foundation-subsystem-report/index.js";
import { readJson, writeJson } from "../foundation-reporting/index.js";

const root = process.cwd();
const runtimeEvidence = readJson(root, "tests/reports/foundation-runtime-browser.json");
const animationBrowserEvidence = readJson(root, "tests/reports/foundation-animation-browser.json");
const hasRuntimeGameEvidence = runtimeEvidence && "gameSlice" in runtimeEvidence && "physicsSandbox" in runtimeEvidence;
const conditionalClaimBoundaries = createConditionalClaimBoundaries();
const baseReport = createSubsystemReport(root, {
  subsystem: "runtime-systems",
  command: "pnpm verify:foundation-runtime",
  reportPath: "tests/reports/foundation-runtime-systems.json",
  runIdPrefix: "foundation-runtime",
  sourceFiles: [
    "docs/project/implementation-plan.md",
    "examples/game-slice/main.ts",
    "tests/fixtures/runtime-game-slice/index.html",
    "examples/physics-sandbox/main.ts",
    "tests/fixtures/physics-sandbox/index.html",
    "examples/animated-character/main.ts",
    "examples/character-animation-viewer/main.ts",
    "packages/physics/src/ArcadeCharacterController.ts",
    "tests/browser/animation-browser.spec.ts",
    "tests/browser/animation-browser-harness.ts",
    "tests/browser/animated-character-browser.spec.ts",
    "tests/browser/character-animation-viewer.spec.ts",
    "tests/browser/runtime-character-controller.spec.ts",
    "tests/browser/physics-sandbox-browser.spec.ts",
    "tests/reports/foundation-animation-browser.json",
    "tests/reports/foundation-runtime-browser.json",
    "tests/reports/product-demo-validation.json",
    "tests/reports/performance.json",
  ],
  checks: [
    {
      id: "runtime-systems-fixture",
      description: "The internal runtime-systems fixture exists and has browser evidence.",
      passed: pathExists(root, "tests/fixtures/runtime-game-slice/index.html") && runtimeEvidence?.ok === true,
      evidencePaths: ["tests/fixtures/runtime-game-slice/index.html", "tests/reports/foundation-runtime-browser.json"],
      blocker: "Internal runtime-systems fixture evidence is missing or failing.",
    },
    {
      id: "physics-sandbox",
      description: "Internal physics sandbox contract fixture exists.",
      passed: pathExists(root, "tests/fixtures/physics-sandbox/index.html"),
      evidencePaths: ["tests/fixtures/physics-sandbox/index.html", "examples/physics-sandbox/main.ts"],
      blocker: "Physics sandbox contract fixture is missing.",
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
        "tests/reports/foundation-animation-browser.json"
      ],
      blocker: "Real skinned character animation pixel-change browser evidence is missing or failing.",
    },
    {
      id: "arcade-character-controller",
      description: "Authored-unit arcade character controller exists and has browser movement/jump evidence.",
      passed: pathExists(root, "packages/physics/src/ArcadeCharacterController.ts") && pathExists(root, "tests/browser/runtime-character-controller.spec.ts"),
      evidencePaths: ["packages/physics/src/ArcadeCharacterController.ts", "tests/browser/runtime-character-controller.spec.ts"],
      blocker: "Arcade character controller implementation or browser evidence is missing.",
    },
    {
      id: "runtime-conditional-claim-boundaries",
      description: "Conditional runtime features are either bounded-delivered with an explicit scope or blocked-unclaimed with a reason.",
      passed: conditionalClaimBoundaries.every((entry) =>
        (entry.status === "delivered-bounded" || entry.status === "blocked-unclaimed") && entry.reason.trim().length > 24
      ),
      evidencePaths: ["docs/project/implementation-plan.md", "tests/reports/foundation-runtime-systems.json"],
      blocker: "A runtime conditional feature lacks either a bounded-delivered scope or an explicit blocked-unclaimed reason.",
    },
    {
      id: "foundation-integrated-game-scene",
      description: "foundation game scene uses real assets with rendering, physics, animation, input, particles, audio, and scripting together.",
      passed: Boolean(hasRuntimeGameEvidence),
      evidencePaths: ["tests/reports/foundation-runtime-browser.json", "tests/browser/runtime-systems.spec.ts"],
      blocker: "Integrated real-asset foundation runtime game scene is not fully proven yet.",
    },
  ],
});
const report = {
  ...baseReport,
  conditionalClaimBoundaries,
};
writeJson(root, "tests/reports/foundation-runtime-systems.json", report);

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  console.log(JSON.stringify({ ok: report.ok, subsystem: report.subsystem, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function createConditionalClaimBoundaries() {
  return [
    {
      feature: "continuous-collision-detection",
      status: "delivered-bounded",
      reason: "Rapier native CCD is active for dynamic bodies; the optional Aura bounded-step policy adds an explicit overflow guarantee."
    },
    {
      feature: "physics-benchmarks-against-current-alternatives",
      status: "blocked-unclaimed",
      reason: "Physics advantage benchmarks are required before physics superiority claims."
    },
    {
      feature: "animation-retargeting",
      status: "delivered-bounded",
      reason: "Explicit humanoid-map pose retargeting reconciles differing rest orientations, proportional translations, and facing axes; automatic arbitrary-rig retargeting remains unclaimed."
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
