import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRendererV5, summarizeV5RendererDiagnostics, V5_REQUIRED_RENDERER_FEATURES } from "../../packages/rendering/src";

interface V5RendererReadinessCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/rendering/src/threejs-compatibility/RendererV5.ts",
  "packages/rendering/src/threejs-compatibility/SceneRenderer.ts",
  "packages/rendering/src/threejs-compatibility/RenderTargetSystem.ts",
  "packages/rendering/src/threejs-compatibility/TextureSystem.ts",
  "packages/rendering/src/threejs-compatibility/MaterialSystem.ts",
  "packages/rendering/src/threejs-compatibility/LightingSystem.ts",
  "packages/rendering/src/threejs-compatibility/ShadowSystem.ts",
  "packages/rendering/src/threejs-compatibility/TransparencySystem.ts",
  "packages/rendering/src/threejs-compatibility/InstancingSystem.ts",
  "packages/rendering/src/threejs-compatibility/RendererDiagnostics.ts",
  "tests/unit/rendering/three-compat-renderer-three-compat.test.ts",
  "tests/browser/three-compat-renderer-three-compat.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): V5RendererReadinessCheck {
  return { name, pass, detail };
}

const renderer = createRendererV5({ backend: "webgl2", width: 1600, height: 900 });
const diagnostics = renderer.createDiagnostics();
const summary = summarizeV5RendererDiagnostics(diagnostics);
const plan = renderer.createComplexScenePlan();
const featureNames = diagnostics.features.map((feature) => feature.feature);

const checks: V5RendererReadinessCheck[] = [
  check(
    "required-files-present",
    requiredFiles.every((file) => existsSync(resolve(file))),
    requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all V5 renderer files exist"
  ),
  check(
    "required-feature-coverage",
    summary.missing.length === 0 && V5_REQUIRED_RENDERER_FEATURES.every((feature) => featureNames.includes(feature)),
    summary.missing.join(", ") || `${featureNames.length} renderer features reported`
  ),
  check(
    "camera-coverage",
    plan.cameras.includes("perspective") && plan.cameras.includes("orthographic") && plan.cameras.includes("cube-environment"),
    plan.cameras.join(", ")
  ),
  check(
    "light-coverage",
    ["directional", "point", "spot", "hemisphere", "ambient", "rect-area"].every((kind) => plan.lights.some((light) => light.kind === kind)),
    plan.lights.map((light) => light.kind).join(", ")
  ),
  check(
    "material-mode-coverage",
    ["opaque", "alpha-test", "alpha-blend", "transmissive", "double-sided"].every((mode) => plan.materialModes.includes(mode as never)),
    plan.materialModes.join(", ")
  ),
  check(
    "render-target-depth-hdr-mrt",
    renderer.renderTargets.current.depthTexture && renderer.renderTargets.supportsHdr() && renderer.renderTargets.supportsMultipleRenderTargets(),
    JSON.stringify(renderer.renderTargets.current)
  ),
  check(
    "resize-capture-device-loss",
    renderer.resize(2048, 1152).width === 2048 && renderer.captureScreenshot().includes("2048x1152") && renderer.handleDeviceLost("readiness").recovered,
    "resize, screenshot capture, and device loss recovery contracts passed"
  ),
  check(
    "scene-complexity",
    plan.sceneComplexity.meshes >= 50 && plan.sceneComplexity.instances >= 10000 && plan.sceneComplexity.transparentObjects >= 10,
    JSON.stringify(plan.sceneComplexity)
  )
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "a3d-three-compat-renderer-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary,
  diagnostics,
  plan,
  checks
};

const reportPath = resolve("tests/reports/three-compat-renderer-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`V5 renderer readiness passed: ${summary.featureCount} features, ${plan.sceneComplexity.instances} instances.`);
