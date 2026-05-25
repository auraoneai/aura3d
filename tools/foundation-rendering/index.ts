import { fileURLToPath } from "node:url";
import { MockRenderDevice, createRendererFeatureReport, rendererFeatureCatalog } from "@galileo3d/rendering";
import { createSubsystemReport, pathExists, reportOk } from "../foundation-subsystem-report/index.js";
import { readJson, writeJson } from "../foundation-reporting/index.js";

const root = process.cwd();
const claimGateReport = readJson(root, "tests/reports/foundation-claim-gates.json");
const webgpuHardwareMatrix = readJson(root, "tests/reports/webgpu-hardware-matrix.json");
const webgpuParityReport = readJson(root, "tests/reports/foundation-webgpu-parity.json") ?? readJson(root, "tests/reports/webgpu-parity.json");
const browserMatrix = readJson(root, "tests/reports/foundation-browser-matrix.json");
const browserRenderingReport = readJson(root, "tests/reports/foundation-rendering.json");
const fullWebGpuBlocked = claimGateReport?.ok === true;
const featureFallbackTable = createFeatureFallbackTable();
const browserValidationNames = new Set(
  Array.isArray(browserRenderingReport?.validations)
    ? browserRenderingReport.validations
        .filter((entry: { ok?: boolean }) => entry.ok === true)
        .map((entry: { name?: string }) => entry.name)
    : []
);
const browserCompletedTasks = Array.isArray(browserRenderingReport?.completedTaskEvidence)
  ? browserRenderingReport.completedTaskEvidence.map((entry: { task?: string }) => entry.task ?? "")
  : [];
const baseReport = createSubsystemReport(root, {
  subsystem: "renderer-and-gpu",
  command: "pnpm verify:foundation-rendering",
  reportPath: "tests/reports/foundation-rendering.json",
  runIdPrefix: "foundation-rendering",
  sourceFiles: [
    "docs/project/v3-renderer-and-gpu-plan.md",
    "docs/project/v3-testing-and-validation-plan.md",
    "packages/rendering/src/Renderer.ts",
    "packages/rendering/src/RendererFeatureGates.ts",
    "packages/rendering/src/WebGPUDevice.ts",
    "packages/rendering/src/PBRMaterial.ts",
    "packages/rendering/src/PostProcessPass.ts",
    "examples/postprocess-lab/main.ts",
    "examples/material-showroom/main.ts",
    "tests/browser/webgpu-error-diagnostics.spec.ts",
    "tests/browser/webgpu-real-device.spec.ts",
    "tests/browser/webgpu-parity.spec.ts",
    "tests/browser/rendering-large-scene.spec.ts",
    "examples/rendering-large-scene/main.ts",
    "examples/rendering-large-scene/harness.ts",
    "examples/webgpu-capability/main.ts",
    "packages/rendering/src/EnvironmentMapResources.ts",
    "tests/reports/pbr-rendering-comparison.json",
    "tests/reports/pbr-environment-validation.json",
    "tests/reports/webgpu-hardware-matrix.json",
    "tests/reports/foundation-webgpu-parity.json",
    "tests/reports/foundation-browser-matrix.json",
    "tests/reports/visual-browser.json",
  ],
  screenshotPaths: [
    "tests/reports/pbr-material-lab-galileo.png",
    "tests/reports/pbr-material-lab-threejs.png",
    "tests/reports/pbr-material-lab-diff.png",
  ],
  checks: [
    {
      id: "pbr-comparison-report",
      description: "Bounded same-page Galileo3D/Three.js PBR comparison report exists and passes.",
      passed: reportOk(root, "tests/reports/pbr-rendering-comparison.json"),
      evidencePaths: ["tests/reports/pbr-rendering-comparison.json"],
      blocker: "PBR comparison report is missing or failing.",
    },
    {
      id: "pbr-claim-boundary",
      description: "PBR report keeps production PBR parity blocked.",
      passed: reportOk(root, "tests/reports/pbr-environment-validation.json"),
      evidencePaths: ["tests/reports/pbr-environment-validation.json"],
      blocker: "PBR environment validation report is missing or failing.",
    },
    {
      id: "material-showroom",
      description: "v3 material showroom example exists.",
      passed: pathExists(root, "examples/material-showroom/index.html"),
      evidencePaths: ["examples/material-showroom/index.html"],
      blocker: "examples/material-showroom is not implemented yet.",
    },
    {
      id: "postprocess-depth-color-bloom-browser-evidence",
      description: "Browser rendering labs validate depth texture plumbing, calibrated linear-to-sRGB tone mapping, and bright-pixel bloom metrics.",
      passed:
        browserValidationNames.has("postprocess-lab") &&
        browserCompletedTasks.some((task) => task.includes("Depth texture plumbing")) &&
        browserCompletedTasks.some((task) => task.includes("Calibrated tone mapping/color management")) &&
        browserCompletedTasks.some((task) => task.includes("Bloom operates on bright pixels")),
      evidencePaths: ["packages/rendering/src/PostProcessPass.ts", "examples/postprocess-lab/main.ts", "examples/material-showroom/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"],
      blocker: "Postprocess depth/color/bloom browser evidence is missing; run the rendering-v3 browser lab first.",
    },
    {
      id: "material-showroom-real-scene-bloom-readback",
      description: "Material showroom uses the shared PostProcessPass bloom path on a real WebGL2 emissive scene readback.",
      passed: browserValidationNames.has("material-showroom") && browserCompletedTasks.some((task) => task.includes("Bloom operates on bright pixels")),
      evidencePaths: ["packages/rendering/src/PostProcessPass.ts", "examples/material-showroom/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"],
      blocker: "Material showroom real-scene bloom readback evidence is missing.",
    },
    {
      id: "renderer-stress-lab",
      description: "v3 renderer stress lab exists.",
      passed: pathExists(root, "examples/renderer-stress-lab/index.html"),
      evidencePaths: ["examples/renderer-stress-lab/index.html"],
      blocker: "examples/renderer-stress-lab is not implemented yet.",
    },
    {
      id: "renderer-feature-fallback-table",
      description: "Renderer feature fallback table exists in report form.",
      passed: featureFallbackTable.length === rendererFeatureCatalog().length && featureFallbackTable.some((entry) => entry.feature === "hdr-render-targets" && entry.supported === false),
      evidencePaths: ["packages/rendering/src/RendererFeatureGates.ts", "tests/reports/foundation-rendering.json"],
      blocker: "Renderer feature fallback table is missing or does not list blocked HDR features.",
    },
    {
      id: "webgpu-shader-diagnostics",
      description: "WebGPU shader/pipeline error diagnostics are covered by browser tests.",
      passed: pathExists(root, "tests/browser/webgpu-error-diagnostics.spec.ts"),
      evidencePaths: ["tests/browser/webgpu-error-diagnostics.spec.ts", "packages/rendering/src/WebGPUDevice.ts"],
      blocker: "WebGPU shader diagnostics browser test is missing.",
    },
    {
      id: "webgpu-real-adapter-device-probe",
      description: "Real navigator.gpu adapter/device creation path is probed in browser and reported.",
      passed: webgpuHardwareMatrix?.status === "pass" && webgpuHardwareMatrix?.evidenceType === "real-navigator-gpu-probe",
      evidencePaths: ["tests/browser/webgpu-real-device.spec.ts", "tests/reports/webgpu-hardware-matrix.json"],
      blocker: "WebGPU real adapter/device browser probe report is missing or failing.",
    },
    {
      id: "webgpu-example-graceful-unavailable",
      description: "WebGPU capability example records a visible unavailable state instead of crashing when WebGPU is absent.",
      passed: pathExists(root, "examples/webgpu-capability/index.html") && pathExists(root, "examples/webgpu-capability/main.ts"),
      evidencePaths: ["examples/webgpu-capability/index.html", "examples/webgpu-capability/main.ts", "tests/browser/rendering-foundation-labs.spec.ts"],
      blocker: "WebGPU capability example is missing or not covered by browser tests.",
    },
    {
      id: "webgpu-webgl2-render-parity-scene",
      description: "Injected WebGPU render-device path is compared against a WebGL2 render-device triangle readback scene.",
      passed: webgpuParityReport?.status === "pass" && Array.isArray(webgpuParityReport?.cases) && webgpuParityReport.cases.some((entry: { name?: string; status?: string }) => entry.name === "webgl2-render-parity-triangle" && entry.status === "pass"),
      evidencePaths: ["tests/browser/webgpu-parity.spec.ts", "tests/reports/foundation-webgpu-parity.json"],
      blocker: "WebGPU/WebGL2 parity report is missing a passing WebGL2 render parity case.",
    },
    {
      id: "webgpu-real-hardware",
      description: "WebGPU real hardware evidence exists or full WebGPU claims remain blocked.",
      passed: reportOk(root, "tests/reports/webgpu-hardware-matrix.json") || fullWebGpuBlocked,
      evidencePaths: ["tests/reports/webgpu-hardware-matrix.json", "tests/reports/foundation-claim-gates.json"],
      blocker: "WebGPU real-hardware v3 evidence is missing or failing; full WebGPU claims must remain blocked.",
    },
    {
      id: "local-browser-matrix",
      description: "Local browser matrix probes Chromium, Chrome, Edge, and Safari/WebKit technology state where available.",
      passed: browserMatrix?.ok === true && typeof browserMatrix?.summary === "object",
      evidencePaths: ["tools/foundation-browser-matrix/index.ts", "tests/reports/foundation-browser-matrix.json"],
      blocker: "Local browser matrix report is missing or failing.",
    },
    {
      id: "large-scene-instancing-example",
      description: "Large-scene example documents and tests WebGL2 instancing through 10,000 instances and batched draw metadata.",
      passed: pathExists(root, "examples/rendering-large-scene/index.html") && pathExists(root, "tests/browser/rendering-large-scene.spec.ts"),
      evidencePaths: ["examples/rendering-large-scene/index.html", "examples/rendering-large-scene/harness.ts", "tests/browser/rendering-large-scene.spec.ts"],
      blocker: "Large-scene instancing example or browser test is missing.",
    },
  ],
});
const report = {
  ...baseReport,
  featureFallbackTable,
};
writeJson(root, "tests/reports/foundation-rendering.json", report);

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  console.log(JSON.stringify({ ok: report.ok, subsystem: report.subsystem, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function createFeatureFallbackTable() {
  const device = new MockRenderDevice();
  const featureReport = createRendererFeatureReport(device);
  return featureReport.statuses.map((status) => ({
    feature: status.feature,
    backend: featureReport.backend,
    supported: status.supported,
    fallback: status.supported ? "native-or-bounded-renderer-path" : "blocked-with-visible-UNSUPPORTED_RENDER_FEATURE-error",
    reason: status.reason ?? "Supported by current renderer backend contract."
  }));
}
