import { fileURLToPath } from "node:url";
import { createSubsystemReport, pathExists, reportOk } from "../foundation-subsystem-report/index.js";
import { readJson } from "../foundation-reporting/index.js";

const root = process.cwd();
const foundationCorpusReport = readJson(root, "tests/reports/foundation-asset-corpus.json");
const foundationGltfCorpusReport = readJson(root, "tests/reports/foundation-gltf-corpus.json");
const materialFidelityReport = readJson(root, "tests/reports/foundation-asset-material-fidelity.json");
const report = createSubsystemReport(root, {
  subsystem: "asset-pipeline-and-content",
  command: "pnpm verify:foundation-assets",
  reportPath: "tests/reports/foundation-assets.json",
  runIdPrefix: "foundation-assets",
  sourceFiles: [
    "docs/project/getting-started.md",
    "packages/assets/src/GLTFLoader.ts",
    "packages/assets/src/GLTFRenderResources.ts",
    "packages/assets/src/AssetManager.ts",
    "examples/asset-viewer/main.ts",
    "tests/assets/gltf-animation-corpus.test.ts",
    "tests/browser/asset-viewer-browser.spec.ts",
    "tests/browser/asset-material-fidelity.spec.ts",
    "tests/reports/gltf-corpus.json",
    "tests/reports/gltf-100-classification.json",
    "tests/reports/foundation-asset-material-fidelity.json",
  ],
  checks: [
    {
      id: "asset-viewer",
      description: "Asset viewer example exists.",
      passed: pathExists(root, "examples/asset-viewer/index.html"),
      evidencePaths: ["examples/asset-viewer/index.html"],
      blocker: "examples/asset-viewer is missing.",
    },
    {
      id: "foundation-corpus-fixtures",
      description: "foundation asset corpus fixtures exist.",
      passed: pathExists(root, "fixtures/foundation-assets"),
      evidencePaths: ["fixtures/foundation-assets"],
      blocker: "fixtures/foundation-assets corpus is not implemented yet.",
    },
    {
      id: "gltf-corpus-report",
      description: "foundation local glTF corpus report passes.",
      passed: foundationCorpusReport?.ok === true,
      evidencePaths: ["tests/reports/foundation-asset-corpus.json"],
      blocker: "foundation asset corpus report is missing or failing.",
    },
    {
      id: "foundation-visual-corpus-runner",
      description: "foundation visual corpus runner stores screenshots and diagnostics.",
      passed: foundationGltfCorpusReport?.ok === true,
      evidencePaths: ["tests/reports/foundation-gltf-corpus.json"],
      blocker: "tests/reports/foundation-gltf-corpus.json is not generated yet.",
    },
    {
      id: "material-fidelity-browser-evidence",
      description: "Asset viewer browser tests verify material factors, texture slots, advanced material extensions, variants, alpha, double-sided state, and decoded runtime textures.",
      passed: materialFidelityReport?.ok === true,
      evidencePaths: ["tests/browser/asset-material-fidelity.spec.ts", "tests/reports/foundation-asset-material-fidelity.json"],
      blocker: "foundation asset material fidelity browser evidence is missing or failing.",
    },
    {
      id: "gltf-skinning-joints-inverse-bind-matrices",
      description: "glTF skinning tests verify JOINTS_0, WEIGHTS_0, skin joint order, inverse bind matrices, and pinned external skinned character fixtures.",
      passed: pathExists(root, "tests/assets/gltf-animation-corpus.test.ts"),
      evidencePaths: [
        "tests/assets/gltf-animation-corpus.test.ts",
        "tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb",
        "tests/assets/corpus/khronos/Fox/Fox.glb"
      ],
      blocker: "glTF skinning corpus tests are missing.",
    },
  ],
});

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  console.log(JSON.stringify({ ok: report.ok, subsystem: report.subsystem, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
