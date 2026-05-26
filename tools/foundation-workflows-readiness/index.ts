import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createAssetViewerWorkflow,
  createInteractiveSceneWorkflow,
  createMaterialStudioWorkflow,
  createProductConfiguratorWorkflow,
  createSceneShowcaseWorkflow
} from "@aura3d/workflows";

const requiredFiles = [
  "packages/workflows/package.json",
  "packages/workflows/src/index.ts",
  "packages/workflows/src/WorkflowTypes.ts",
  "packages/workflows/src/WorkflowDiagnostics.ts",
  "packages/workflows/src/AssetViewerWorkflow.ts",
  "packages/workflows/src/ProductConfiguratorWorkflow.ts",
  "packages/workflows/src/MaterialStudioWorkflow.ts",
  "packages/workflows/src/SceneShowcaseWorkflow.ts",
  "packages/workflows/src/InteractiveSceneWorkflow.ts",
  "tests/unit/workflows/asset-viewer-workflow.test.ts",
  "tests/unit/workflows/product-configurator-workflow.test.ts",
  "tests/unit/workflows/material-studio-workflow.test.ts",
  "tests/unit/workflows/scene-showcase-workflow.test.ts",
  "tests/unit/workflows/interactive-scene-workflow.test.ts"
] as const;

const assetViewer = await createAssetViewerWorkflow({
  url: jsonDataUri(readFileSync(join(process.cwd(), "fixtures/workflow-assets/assets/product-camera/product-camera.gltf"), "utf8")),
  shadows: false,
  postprocess: false,
  renderResources: {
    imageDecoder: () => ({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([220, 220, 220, 255]) })
  }
});
const productConfigurator = await createProductConfiguratorWorkflow({
  asset: {
    id: "camera-kit",
    url: dataUri("model/gltf+json", readFileSync(join(process.cwd(), "fixtures/product-studio/products/camera-kit/camera-kit.gltf"))),
    manifestUrl: dataUri("application/json", readFileSync(join(process.cwd(), "fixtures/product-studio/products/camera-kit/manifest.json")))
  }
});
const materialStudio = createMaterialStudioWorkflow();
const sceneShowcase = createSceneShowcaseWorkflow();
const interactive = createInteractiveSceneWorkflow();

const workflowChecks = [
  summarize("asset-viewer", assetViewer),
  summarize("product-configurator", productConfigurator),
  summarize("material-studio", materialStudio),
  summarize("scene-showcase", sceneShowcase),
  summarize("interactive-scene", interactive)
];
assetViewer.dispose();
productConfigurator.dispose();
materialStudio.dispose();
sceneShowcase.dispose();
interactive.dispose();

const report = {
  schema: "a3d-foundation-workflows-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: requiredFiles.every((path) => existsSync(resolve(path)))
    && workflowChecks.every((workflow) => workflow.hasSource && workflow.featureCount >= 2 && workflow.warningCount === 0)
    && existsSync(resolve("docs/api/public-api.md"))
    && readFileSync(resolve("docs/api/public-api.md"), "utf8").includes("## @aura3d/workflows"),
  requiredFiles: requiredFiles.map((path) => ({ path, exists: existsSync(resolve(path)) })),
  workflowChecks
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/foundation-workflows-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function summarize(kind: string, workflow: { readonly source: unknown; readonly diagnostics: { readonly featureChecklist: readonly string[]; readonly warnings: readonly string[] } }) {
  return {
    kind,
    hasSource: Boolean(workflow.source),
    featureCount: workflow.diagnostics.featureChecklist.length,
    warningCount: workflow.diagnostics.warnings.length
  };
}

function jsonDataUri(json: string): string {
  return `data:model/gltf+json;base64,${Buffer.from(json).toString("base64")}`;
}

function dataUri(mime: string, content: Buffer): string {
  return `data:${mime};base64,${content.toString("base64")}`;
}
