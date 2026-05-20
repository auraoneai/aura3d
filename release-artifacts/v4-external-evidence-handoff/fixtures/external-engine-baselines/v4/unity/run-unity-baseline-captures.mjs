#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const repoRoot = resolve(scriptDir, "../../../..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const unityEditor = valueAfter("--editor") || process.env.G3D_UNITY_EDITOR || "";
const unityProjectPath = valueAfter("--project") || process.env.G3D_UNITY_PROJECT_PATH || resolve(repoRoot, ".tmp/v4-unity-baseline-project");
const commandPlan = JSON.parse(readFileSync(resolve(kitRoot, "external-baseline-command-plan.json"), "utf8"));
const unityCaptures = (commandPlan.captures || []).filter((capture) => capture.engine === "unity");
const assetImportWorkflow = (commandPlan.assetImportWorkflowReports || []).find((report) => report.engine === "unity");
const assetImportAssetPath = valueAfter("--asset") || process.env.G3D_EXTERNAL_ASSET_IMPORT_SAMPLE || resolve(repoRoot, "tests/assets/corpus/khronos/Fox/Fox.glb");
const runnerSourcePath = resolve(scriptDir, "V4ExternalVisualBaselineRunner.cs");
const runnerTargetPath = resolve(unityProjectPath, "Assets/Galileo3D/V4ExternalBaselines/V4ExternalVisualBaselineRunner.cs");
const assetImportRunnerSourcePath = resolve(scriptDir, "V4ExternalAssetImportWorkflowRunner.cs");
const assetImportRunnerTargetPath = resolve(unityProjectPath, "Assets/Galileo3D/V4ExternalBaselines/V4ExternalAssetImportWorkflowRunner.cs");

const plannedCommands = [
  ...(!existsSync(resolve(unityProjectPath, "Assets")) ? [[unityEditor || "$G3D_UNITY_EDITOR", "-batchmode", "-quit", "-createProject", unityProjectPath]] : []),
  ["copy", runnerSourcePath, runnerTargetPath],
  ["copy", assetImportRunnerSourcePath, assetImportRunnerTargetPath],
  [unityEditor || "$G3D_UNITY_EDITOR", "-batchmode", "-quit", "-projectPath", unityProjectPath],
  ...unityCaptures.map((capture) => [
    unityEditor || "$G3D_UNITY_EDITOR",
    "-batchmode",
    "-quit",
    "-projectPath",
    unityProjectPath,
    "-executeMethod",
    "V4ExternalVisualBaselineRunner.CaptureFromCommandLine",
    "--descriptor",
    resolve(repoRoot, capture.descriptorPath),
    "--baseline-kind",
    capture.baselineKind,
    "--screenshot",
    resolve(repoRoot, capture.expectedScreenshotPath),
  ]),
  [process.execPath, "fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs", "--engine", "unity"],
  [process.execPath, "fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs", "--engine", "unity"],
  ...(assetImportWorkflow ? [[
    unityEditor || "$G3D_UNITY_EDITOR",
    "-batchmode",
    "-quit",
    "-projectPath",
    unityProjectPath,
    "-executeMethod",
    "V4ExternalAssetImportWorkflowRunner.CaptureFromCommandLine",
    "--asset",
    assetImportAssetPath,
    "--evidence",
    resolve(repoRoot, assetImportWorkflow.runnerEvidencePath),
  ], [process.execPath, "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs", "unity", assetImportWorkflow.runnerEvidencePath, assetImportWorkflow.targetReportPath]] : []),
  [process.execPath, "fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs", "unity", "tests/reports/v4-unity-baseline-render.json"],
];

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    unityProjectPath,
    unityCaptureCount: unityCaptures.length,
    assetImportWorkflowCount: assetImportWorkflow ? 1 : 0,
    assetImportAssetPath,
    commands: plannedCommands,
    claimBoundary: "Dry run only lists the Unity baseline capture commands. It is not external evidence.",
  }, null, 2));
  process.exit(0);
}

if (!unityEditor) {
  throw new Error("Missing Unity editor. Set G3D_UNITY_EDITOR or pass --editor /absolute/path/to/Unity.");
}
if (unityCaptures.length === 0) {
  throw new Error("No Unity captures were found in external-baseline-command-plan.json.");
}
if (!assetImportWorkflow) {
  throw new Error("No Unity asset-import workflow report was found in external-baseline-command-plan.json.");
}
if (!existsSync(resolve(unityProjectPath, "Assets"))) {
  run([unityEditor, "-batchmode", "-quit", "-createProject", unityProjectPath], repoRoot);
}
mkdirSync(dirname(runnerTargetPath), { recursive: true });
copyFileSync(runnerSourcePath, runnerTargetPath);
copyFileSync(assetImportRunnerSourcePath, assetImportRunnerTargetPath);
run([unityEditor, "-batchmode", "-quit", "-projectPath", unityProjectPath], repoRoot);
for (const capture of unityCaptures) {
  run([
    unityEditor,
    "-batchmode",
    "-quit",
    "-projectPath",
    unityProjectPath,
    "-executeMethod",
    "V4ExternalVisualBaselineRunner.CaptureFromCommandLine",
    "--descriptor",
    resolve(repoRoot, capture.descriptorPath),
    "--baseline-kind",
    capture.baselineKind,
    "--screenshot",
    resolve(repoRoot, capture.expectedScreenshotPath),
  ], repoRoot);
}
run([process.execPath, "fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs", "--engine", "unity"], repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs", "--engine", "unity"], repoRoot);
run([
  unityEditor,
  "-batchmode",
  "-quit",
  "-projectPath",
  unityProjectPath,
  "-executeMethod",
  "V4ExternalAssetImportWorkflowRunner.CaptureFromCommandLine",
  "--asset",
  assetImportAssetPath,
  "--evidence",
  resolve(repoRoot, assetImportWorkflow.runnerEvidencePath),
], repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs", "unity", assetImportWorkflow.runnerEvidencePath, assetImportWorkflow.targetReportPath], repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs", "unity", "tests/reports/v4-unity-baseline-render.json"], repoRoot);
console.log(JSON.stringify({
  ok: true,
  unityProjectPath,
  unityCaptureCount: unityCaptures.length,
  assetImportWorkflowCount: 1,
  assetImportAssetPath,
  reportPath: "tests/reports/v4-unity-baseline-render.json",
}, null, 2));

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

function run(command, cwd) {
  const result = spawnSync(command[0], command.slice(1), { cwd, stdio: "inherit", timeout: 900_000 });
  if (result.status !== 0) {
    throw new Error("Command failed with exit code " + result.status + ": " + command.join(" "));
  }
}
