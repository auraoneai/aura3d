import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createV6AssetPreflight,
  createV6ProductionRendererDefaults,
  createV6VisualQAResult,
  createV6WorkflowPlan,
  listV6WorkflowDefinitions
} from "../../packages/workflows/src";

const reportPath = resolve("tests/reports/production-runtime-workflows-readiness.json");
const assetManifest = JSON.parse(readFileSync(resolve("fixtures/asset-corpus/manifest.json"), "utf8")) as {
  assets?: {
    id: string;
    localPath?: string;
    sourceUri?: string;
    sha256?: string;
    bytes?: number;
    license?: string;
    tags?: readonly string[];
    renderRequirements?: readonly string[];
  }[];
};
const galleryManifest = JSON.parse(readFileSync(resolve("tests/reports/production-runtime-gallery/manifest.json"), "utf8")) as {
  entries?: {
    screenshot: string;
    rendererBackend: string;
    realAssetIds: readonly string[];
    realHdrEnvironmentId: string;
    drawCalls: number;
    textureMemory: number;
    pixelStats?: { width: number; height: number; nonBlackPixels: number; uniqueColorBuckets: number };
  }[];
};
const workflows = listV6WorkflowDefinitions();
const plans = workflows.map((workflow) => createV6WorkflowPlan(workflow.id));
const preflights = (assetManifest.assets ?? []).map(createV6AssetPreflight);
const qaResults = (galleryManifest.entries ?? []).map((entry) => createV6VisualQAResult({
  screenshotPath: entry.screenshot,
  rendererBackend: entry.rendererBackend,
  realRendererProof: entry.realAssetIds.length > 0 && entry.drawCalls > 0 && entry.realHdrEnvironmentId.length > 0,
  width: entry.pixelStats?.width ?? 0,
  height: entry.pixelStats?.height ?? 0,
  nonBlackPixels: entry.pixelStats?.nonBlackPixels ?? 0,
  uniqueColorBuckets: entry.pixelStats?.uniqueColorBuckets ?? 0,
  drawCalls: entry.drawCalls,
  textureMemory: entry.textureMemory
}));
const defaults = workflows.map((workflow) => createV6ProductionRendererDefaults(workflow.id));
const requiredWorkflowIds = ["product", "asset", "material", "architecture", "cinematic"];
const checks = [
  { id: "workflow-count", pass: workflows.length === 5 && requiredWorkflowIds.every((id) => workflows.some((workflow) => workflow.id === id)), detail: workflows.map((workflow) => workflow.id).join(", ") },
  { id: "workflow-proof-contracts", pass: workflows.every((workflow) => workflow.requiredRendererFeatures.length > 0 && workflow.requiredProof.length > 0 && workflow.differentiation.length > 0), detail: "renderer features, proof, and differentiation present" },
  { id: "asset-preflight", pass: preflights.length >= 12 && preflights.every((preflight) => preflight.pass), detail: preflights.filter((preflight) => !preflight.pass).map((preflight) => `${preflight.assetId}:${preflight.missing.join("|")}`).join(", ") },
  { id: "visual-qa", pass: qaResults.length >= 19 && qaResults.every((qa) => qa.pass), detail: qaResults.filter((qa) => !qa.pass).map((qa) => `${qa.screenshotPath}:${qa.failures.join("|")}`).join(", ") },
  { id: "production-defaults", pass: defaults.every((item) => item.backend === "webgl2" && item.hdrEnvironmentId === "studio-small-08" && item.postprocess.includes("tone-mapping") && item.runtimeMetrics.includes("drawCalls")), detail: JSON.stringify(defaults) },
  { id: "workflow-plans", pass: plans.every((plan) => plan.preflightRequired && plan.visualQARequired && plan.defaults.workflowId === plan.workflow.id), detail: plans.map((plan) => plan.workflow.id).join(", ") },
  { id: "gallery-manifest-exists", pass: existsSync(resolve("tests/reports/production-runtime-gallery/manifest.json")), detail: "tests/reports/production-runtime-gallery/manifest.json" }
];
const report = {
  schema: "g3d-production-runtime-workflows-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  checks,
  workflows,
  preflightCount: preflights.length,
  visualQACount: qaResults.length
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
