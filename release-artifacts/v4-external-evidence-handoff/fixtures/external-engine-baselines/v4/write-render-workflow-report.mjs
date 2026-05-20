#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const engine = process.argv[2];
const targetReportPath = process.argv[3] || (engine === "unity"
  ? "tests/reports/v4-unity-baseline-render.json"
  : engine === "unreal"
    ? "tests/reports/v4-unreal-baseline-render.json"
    : "");
if (engine !== "unity" && engine !== "unreal") {
  console.error("Usage: node write-render-workflow-report.mjs <unity|unreal> [target-report-path]");
  process.exit(2);
}
if (process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE !== "true") {
  throw new Error("Set G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true after the external editor CLI smoke has passed before writing the render/workflow baseline report.");
}
const smokeReportPath = engine === "unity"
  ? "tests/reports/v4-unity-editor-cli-smoke.json"
  : "tests/reports/v4-unreal-editor-cli-smoke.json";
if (!existsSync(smokeReportPath)) {
  throw new Error("Missing external editor CLI smoke report: " + smokeReportPath + ". Run run-editor-cli-smoke.mjs before writing the render/workflow baseline report.");
}
const smokeReport = JSON.parse(readFileSync(smokeReportPath, "utf8"));
const smokeViolations = [
  ...(smokeReport.ok === true ? [] : ["ok must be true"]),
  ...(smokeReport.engine === engine ? [] : ["engine must be " + engine]),
  ...(Array.isArray(smokeReport.command) && smokeReport.command.length >= 1 ? [] : ["command must be recorded"]),
  ...(typeof smokeReport.executable === "string" && smokeReport.executable.length > 0 ? [] : ["executable must be recorded"]),
  ...(typeof smokeReport.output === "string" && smokeReport.output.length > 0 ? [] : ["output must be recorded"]),
];
if (smokeViolations.length > 0) {
  throw new Error(smokeReportPath + " is invalid for render/workflow baseline: " + smokeViolations.join("; "));
}

const slots = [
  {
    "engine": "unity",
    "baselineKind": "product-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json",
    "targetReportPath": "tests/reports/v4-unity-product-visual-baseline.json"
  },
  {
    "engine": "unreal",
    "baselineKind": "product-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json",
    "targetReportPath": "tests/reports/v4-unreal-product-visual-baseline.json"
  },
  {
    "engine": "unity",
    "baselineKind": "pbr-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/pbr-visual-parity-scene.json",
    "targetReportPath": "tests/reports/v4-unity-pbr-visual-baseline.json"
  },
  {
    "engine": "unreal",
    "baselineKind": "pbr-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/pbr-visual-parity-scene.json",
    "targetReportPath": "tests/reports/v4-unreal-pbr-visual-baseline.json"
  },
  {
    "engine": "unity",
    "baselineKind": "shadow-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/shadow-visual-parity-scene.json",
    "targetReportPath": "tests/reports/v4-unity-shadow-visual-baseline.json"
  },
  {
    "engine": "unreal",
    "baselineKind": "shadow-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/shadow-visual-parity-scene.json",
    "targetReportPath": "tests/reports/v4-unreal-shadow-visual-baseline.json"
  },
  {
    "engine": "unity",
    "baselineKind": "hdr-render-target",
    "descriptorPath": "fixtures/external-engine-baselines/v4/hdr-render-target-visual-parity-scene.json",
    "targetReportPath": "tests/reports/v4-unity-hdr-render-target-baseline.json"
  },
  {
    "engine": "unreal",
    "baselineKind": "hdr-render-target",
    "descriptorPath": "fixtures/external-engine-baselines/v4/hdr-render-target-visual-parity-scene.json",
    "targetReportPath": "tests/reports/v4-unreal-hdr-render-target-baseline.json"
  },
  {
    "engine": "unity",
    "baselineKind": "postprocess-suite",
    "descriptorPath": "fixtures/external-engine-baselines/v4/postprocess-suite-parity-scene.json",
    "targetReportPath": "tests/reports/v4-unity-postprocess-suite-baseline.json"
  },
  {
    "engine": "unreal",
    "baselineKind": "postprocess-suite",
    "descriptorPath": "fixtures/external-engine-baselines/v4/postprocess-suite-parity-scene.json",
    "targetReportPath": "tests/reports/v4-unreal-postprocess-suite-baseline.json"
  }
];
const selected = slots.filter((slot) => slot.engine === engine);
const slotReports = selected.map((slot) => {
  if (!existsSync(slot.targetReportPath)) {
    throw new Error("Missing external slot report: " + slot.targetReportPath);
  }
  const report = JSON.parse(readFileSync(slot.targetReportPath, "utf8"));
  const violations = [
    ...(report.ok === true ? [] : ["ok must be true"]),
    ...(report.engine === engine ? [] : ["engine must be " + engine]),
    ...(report.baselineKind === slot.baselineKind ? [] : ["baselineKind must be " + slot.baselineKind]),
    ...(report.sameSceneExternalBaseline === true ? [] : ["sameSceneExternalBaseline must be true"]),
    ...(report.visualDiffAgainstGalileo === true ? [] : ["visualDiffAgainstGalileo must be true"]),
  ];
  if (violations.length > 0) {
    throw new Error(slot.targetReportPath + " is invalid for render/workflow baseline: " + violations.join("; "));
  }
  return {
    baselineKind: slot.baselineKind,
    descriptorPath: slot.descriptorPath,
    targetReportPath: slot.targetReportPath,
    screenshotPath: report.screenshotPath,
    screenshotSha256: report.screenshotSha256,
  };
});

const report = {
  ok: true,
  engine,
  sameSceneRenderWorkflowBaseline: true,
  generatedBy: "fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs",
  editorExecutableEnv: engine === "unity" ? "G3D_UNITY_EDITOR" : "G3D_UNREAL_EDITOR",
  cliSmokeEnv: "G3D_RUN_UNITY_UNREAL_CLI_SMOKE",
  cliSmokeReportPath: smokeReportPath,
  cliSmokeCommand: smokeReport.command,
  cliSmokeExecutable: smokeReport.executable,
  kitRoot: "fixtures/external-engine-baselines/v4",
  sceneSlots: slotReports,
  metrics: {
    sceneDescriptorSlots: selected.length,
    editorProjectOpened: true,
    descriptorSceneBuilt: true,
    renderedFrameCaptured: true,
    cliSmokeRan: true,
  },
  claimBoundary: "This report is valid only when written after a real external editor CLI smoke and after all same-scene visual slot reports for this engine have passed.",
};
mkdirSync(dirname(targetReportPath), { recursive: true });
writeFileSync(targetReportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, reportPath: targetReportPath, engine, sceneDescriptorSlots: selected.length }, null, 2));
