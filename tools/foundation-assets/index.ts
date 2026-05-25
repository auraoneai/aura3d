import { fileURLToPath } from "node:url";
import { createSubsystemReport, pathExists, reportOk } from "../foundation-subsystem-report/index.js";
import { readJson } from "../foundation-reporting/index.js";

const root = process.cwd();
const v3CorpusReport = readJson(root, "tests/reports/foundation-asset-corpus.json");
const v3GltfCorpusReport = readJson(root, "tests/reports/foundation-gltf-corpus.json");
const materialFidelityReport = readJson(root, "tests/reports/foundation-asset-material-fidelity.json");
const report = createSubsystemReport(root, {
  subsystem: "asset-pipeline-and-content",
  command: "pnpm verify:foundation-assets",
  reportPath: "tests/reports/foundation-assets.json",
  runIdPrefix: "foundation-assets",
  sourceFiles: [
    "docs/project/v3-asset-pipeline-and-content-plan.md",
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
      id: "v3-corpus-fixtures",
      description: "v3 asset corpus fixtures exist.",
      passed: pathExists(root, "fixtures/assets/v3"),
      evidencePaths: ["fixtures/assets/v3"],
      blocker: "fixtures/assets/v3 corpus is not implemented yet.",
    },
    {
      id: "gltf-corpus-report",
      description: "v3 local glTF corpus report passes.",
      passed: v3CorpusReport?.ok === true,
      evidencePaths: ["tests/reports/foundation-asset-corpus.json"],
      blocker: "v3 asset corpus report is missing or failing.",
    },
    {
      id: "v3-visual-corpus-runner",
      description: "v3 visual corpus runner stores screenshots and diagnostics.",
      passed: v3GltfCorpusReport?.ok === true,
      evidencePaths: ["tests/reports/foundation-gltf-corpus.json"],
      blocker: "tests/reports/foundation-gltf-corpus.json is not generated yet.",
    },
    {
      id: "material-fidelity-browser-evidence",
      description: "Asset viewer browser tests verify material factors, texture slots, advanced material extensions, variants, alpha, double-sided state, and decoded runtime textures.",
      passed: materialFidelityReport?.ok === true,
      evidencePaths: ["tests/browser/asset-material-fidelity.spec.ts", "tests/reports/foundation-asset-material-fidelity.json"],
      blocker: "v3 asset material fidelity browser evidence is missing or failing.",
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
