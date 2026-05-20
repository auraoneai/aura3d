#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const repoRoot = resolve(scriptDir, "../../../..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const unrealEditor = valueAfter("--editor") || process.env.G3D_UNREAL_EDITOR || "";
const unrealProjectPath = valueAfter("--project") || process.env.G3D_UNREAL_PROJECT_PATH || "";
const commandPlan = JSON.parse(readFileSync(resolve(kitRoot, "external-baseline-command-plan.json"), "utf8"));
const unrealCaptures = (commandPlan.captures || []).filter((capture) => capture.engine === "unreal");
const assetImportWorkflow = (commandPlan.assetImportWorkflowReports || []).find((report) => report.engine === "unreal");
const assetImportAssetPath = valueAfter("--asset") || process.env.G3D_EXTERNAL_ASSET_IMPORT_SAMPLE || resolve(repoRoot, "tests/assets/corpus/khronos/Fox/Fox.glb");
const runnerPath = resolve(scriptDir, "v4_external_visual_baseline_runner.py");
const assetImportRunnerPath = resolve(scriptDir, "v4_external_asset_import_workflow_runner.py");

const captureCommands = unrealCaptures.map((capture) => [
  unrealEditor || "$G3D_UNREAL_EDITOR",
  ...(unrealProjectPath ? [unrealProjectPath] : []),
  "-unattended",
  "-nop4",
  "-nosplash",
  "-ExecutePythonScript=" + [
    runnerPath,
    resolve(repoRoot, capture.descriptorPath),
    resolve(repoRoot, capture.expectedScreenshotPath),
  ].map(quoteUnrealPythonArg).join(" "),
]);
const assetImportCommand = assetImportWorkflow ? [
  unrealEditor || "$G3D_UNREAL_EDITOR",
  ...(unrealProjectPath ? [unrealProjectPath] : []),
  "-unattended",
  "-nop4",
  "-nosplash",
  "-ExecutePythonScript=" + [
    assetImportRunnerPath,
    assetImportAssetPath,
    resolve(repoRoot, assetImportWorkflow.runnerEvidencePath),
  ].map(quoteUnrealPythonArg).join(" "),
] : null;
const plannedCommands = [
  ...captureCommands,
  [process.execPath, "fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs", "--engine", "unreal"],
  [process.execPath, "fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs", "--engine", "unreal"],
  ...(assetImportCommand && assetImportWorkflow ? [assetImportCommand, [process.execPath, "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs", "unreal", assetImportWorkflow.runnerEvidencePath, assetImportWorkflow.targetReportPath]] : []),
  [process.execPath, "fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs", "unreal", "tests/reports/v4-unreal-baseline-render.json"],
];

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    unrealProjectPath: unrealProjectPath || null,
    unrealCaptureCount: unrealCaptures.length,
    assetImportWorkflowCount: assetImportWorkflow ? 1 : 0,
    assetImportAssetPath,
    commands: plannedCommands,
    claimBoundary: "Dry run only lists the Unreal baseline capture commands. It is not external evidence.",
  }, null, 2));
  process.exit(0);
}

if (!unrealEditor) {
  throw new Error("Missing Unreal editor. Set G3D_UNREAL_EDITOR or pass --editor /absolute/path/to/UnrealEditor-Cmd.");
}
if (!existsSync(unrealEditor)) {
  throw new Error("Unreal editor executable does not exist: " + unrealEditor);
}
if (unrealProjectPath && !existsSync(unrealProjectPath)) {
  throw new Error("Unreal project path does not exist: " + unrealProjectPath);
}
if (unrealCaptures.length === 0) {
  throw new Error("No Unreal captures were found in external-baseline-command-plan.json.");
}
if (!assetImportWorkflow || !assetImportCommand) {
  throw new Error("No Unreal asset-import workflow report was found in external-baseline-command-plan.json.");
}
for (const command of captureCommands) {
  run(command, repoRoot);
}
run([process.execPath, "fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs", "--engine", "unreal"], repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs", "--engine", "unreal"], repoRoot);
run(assetImportCommand, repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs", "unreal", assetImportWorkflow.runnerEvidencePath, assetImportWorkflow.targetReportPath], repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs", "unreal", "tests/reports/v4-unreal-baseline-render.json"], repoRoot);
console.log(JSON.stringify({
  ok: true,
  unrealProjectPath: unrealProjectPath || null,
  unrealCaptureCount: unrealCaptures.length,
  assetImportWorkflowCount: 1,
  assetImportAssetPath,
  reportPath: "tests/reports/v4-unreal-baseline-render.json",
}, null, 2));

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

function quoteUnrealPythonArg(value) {
  return JSON.stringify(String(value));
}

function run(command, cwd) {
  const result = spawnSync(command[0], command.slice(1), { cwd, stdio: "inherit", timeout: 900_000 });
  if (result.status !== 0) {
    throw new Error("Command failed with exit code " + result.status + ": " + command.join(" "));
  }
}
