#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const engine = process.argv[2];
const evidencePath = process.argv[3] || "";
const targetReportPath = process.argv[4] || (engine === "unity"
  ? "tests/reports/v4-unity-asset-import-workflow.json"
  : engine === "unreal"
    ? "tests/reports/v4-unreal-asset-import-workflow.json"
    : "");
if (engine !== "unity" && engine !== "unreal") {
  console.error("Usage: node write-asset-import-workflow-report.mjs <unity|unreal> <runner-evidence-path> [target-report-path]");
  process.exit(2);
}
if (!evidencePath) {
  throw new Error("Missing runner evidence sidecar path. The sidecar must be written by a real external editor asset-import run.");
}
if (!existsSync(evidencePath)) {
  throw new Error("Missing external asset-import workflow evidence sidecar: " + evidencePath);
}
const evidenceText = readFileSync(evidencePath, "utf8");
const runnerEvidenceSha256 = createHash("sha256").update(evidenceText).digest("hex");
const evidence = JSON.parse(evidenceText);
const metrics = evidence && typeof evidence.metrics === "object" && evidence.metrics ? evidence.metrics : {};
const conversionFormats = Array.isArray(evidence.conversionRequiredFormats)
  ? evidence.conversionRequiredFormats
  : ["dae", "fbx", "usd", "usdz"];
const nativeSupportedFormats = Array.isArray(evidence.nativeSupportedFormats)
  ? evidence.nativeSupportedFormats
  : ["glb", "gltf", "obj"];
const violations = [
  ...(evidence.ok === true ? [] : ["runner evidence ok must be true"]),
  ...(evidence.engine === engine ? [] : ["runner evidence engine must be " + engine]),
  ...(evidence.workflowKind === "asset-import" ? [] : ["runner evidence workflowKind must be asset-import"]),
  ...(evidence.editorProjectOpened === true || metrics.editorProjectOpened === true ? [] : ["editorProjectOpened must be true"]),
  ...(evidence.assetImportWorkflowRan === true || metrics.assetImportWorkflowRan === true ? [] : ["assetImportWorkflowRan must be true"]),
  ...(Number(metrics.importedGltfAssets) >= 1 ? [] : ["metrics.importedGltfAssets must be at least 1"]),
  ...(Number(metrics.importedMeshes) >= 1 ? [] : ["metrics.importedMeshes must be at least 1"]),
  ...(Number(metrics.importedMaterials) >= 1 ? [] : ["metrics.importedMaterials must be at least 1"]),
  ...(Number(metrics.importedTextures) >= 1 ? [] : ["metrics.importedTextures must be at least 1"]),
  ...(conversionFormats.includes("fbx") && conversionFormats.includes("usd") && conversionFormats.includes("dae") && nativeSupportedFormats.includes("obj") ? [] : ["conversionRequiredFormats must include fbx/usd/dae and nativeSupportedFormats must include obj for the audited bounded native OBJ import path"]),
];
if (violations.length > 0) {
  throw new Error(evidencePath + " is invalid for asset-import workflow baseline: " + violations.join("; "));
}

const report = {
  ok: true,
  engine,
  sameSceneAssetImportWorkflowBaseline: true,
  generatedBy: "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs",
  kitRoot: "fixtures/external-engine-baselines/v4",
  runnerEvidencePath: evidencePath,
  runnerEvidenceSha256,
  runnerEvidence: evidence,
  metrics: {
    editorProjectOpened: true,
    assetImportWorkflowRan: true,
    importedGltfAssets: Number(metrics.importedGltfAssets),
    importedMeshes: Number(metrics.importedMeshes),
    importedMaterials: Number(metrics.importedMaterials),
    importedTextures: Number(metrics.importedTextures),
    importedAnimationClips: Number(metrics.importedAnimationClips || 0),
    conversionRequiredFormats: conversionFormats.length,
    nativeSupportedFormats: nativeSupportedFormats.length,
  },
  claimBoundary: "This report proves only that a real external editor asset-import workflow ran for the current glTF-first parity path. It allows Galileo3D's bounded native OBJ geometry importer, but does not claim native FBX/USD/USDZ/DAE or broad DCC import parity.",
};
mkdirSync(dirname(targetReportPath), { recursive: true });
writeFileSync(targetReportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, reportPath: targetReportPath, engine, runnerEvidencePath: evidencePath }, null, 2));
