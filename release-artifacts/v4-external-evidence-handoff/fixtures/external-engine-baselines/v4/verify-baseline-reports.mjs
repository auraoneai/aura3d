#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const engineArg = valueAfter("--engine") || "all";
const allowMissing = process.argv.includes("--allow-missing");
if (!["unity", "unreal", "all"].includes(engineArg)) {
  throw new Error("--engine must be unity, unreal, or all.");
}

const slots = [
  {
    "engine": "unity",
    "baselineKind": "product-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json",
    "sceneDescriptorId": "v4-deterministic-product-visual-parity",
    "sceneDescriptorVersion": "v4-product-visual-parity-scene-v1",
    "screenshotPath": "tests/reports/v4-product-visual/unity-product-visual-baseline.png",
    "runnerEvidencePath": "tests/reports/v4-product-visual/unity-product-visual-baseline.png.evidence.json",
    "targetReportPath": "tests/reports/v4-unity-product-visual-baseline.json",
    "minimumEvidence": {
      "width": 720,
      "height": 480,
      "nonBlankPixels": 10001,
      "colorBuckets": 2,
      "drawCalls": 18,
      "materialCount": 7,
      "productParts": 18,
      "turntableHotspots": 3,
      "captureViews": 4,
      "batchTasks": 4
    }
  },
  {
    "engine": "unreal",
    "baselineKind": "product-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json",
    "sceneDescriptorId": "v4-deterministic-product-visual-parity",
    "sceneDescriptorVersion": "v4-product-visual-parity-scene-v1",
    "screenshotPath": "tests/reports/v4-product-visual/unreal-product-visual-baseline.png",
    "runnerEvidencePath": "tests/reports/v4-product-visual/unreal-product-visual-baseline.png.evidence.json",
    "targetReportPath": "tests/reports/v4-unreal-product-visual-baseline.json",
    "minimumEvidence": {
      "width": 720,
      "height": 480,
      "nonBlankPixels": 10001,
      "colorBuckets": 2,
      "drawCalls": 18,
      "materialCount": 7,
      "productParts": 18,
      "turntableHotspots": 3,
      "captureViews": 4,
      "batchTasks": 4
    }
  },
  {
    "engine": "unity",
    "baselineKind": "pbr-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/pbr-visual-parity-scene.json",
    "sceneDescriptorId": "v4-pbr-visual-parity-scene",
    "sceneDescriptorVersion": "v4-pbr-visual-parity-scene-v1",
    "screenshotPath": "tests/reports/v4-pbr-visual/unity-pbr-visual-baseline.png",
    "runnerEvidencePath": "tests/reports/v4-pbr-visual/unity-pbr-visual-baseline.png.evidence.json",
    "targetReportPath": "tests/reports/v4-unity-pbr-visual-baseline.json",
    "minimumEvidence": {
      "width": 960,
      "height": 540,
      "nonBlankPixels": 30001,
      "colorBuckets": 7,
      "drawCalls": 12,
      "materialCount": 11,
      "featureCount": 11
    }
  },
  {
    "engine": "unreal",
    "baselineKind": "pbr-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/pbr-visual-parity-scene.json",
    "sceneDescriptorId": "v4-pbr-visual-parity-scene",
    "sceneDescriptorVersion": "v4-pbr-visual-parity-scene-v1",
    "screenshotPath": "tests/reports/v4-pbr-visual/unreal-pbr-visual-baseline.png",
    "runnerEvidencePath": "tests/reports/v4-pbr-visual/unreal-pbr-visual-baseline.png.evidence.json",
    "targetReportPath": "tests/reports/v4-unreal-pbr-visual-baseline.json",
    "minimumEvidence": {
      "width": 960,
      "height": 540,
      "nonBlankPixels": 30001,
      "colorBuckets": 7,
      "drawCalls": 12,
      "materialCount": 11,
      "featureCount": 11
    }
  },
  {
    "engine": "unity",
    "baselineKind": "shadow-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/shadow-visual-parity-scene.json",
    "sceneDescriptorId": "v4-shadow-visual-parity-scene",
    "sceneDescriptorVersion": "v4-shadow-visual-parity-scene-v1",
    "screenshotPath": "tests/reports/v4-shadow-visual/unity-shadow-visual-baseline.png",
    "runnerEvidencePath": "tests/reports/v4-shadow-visual/unity-shadow-visual-baseline.png.evidence.json",
    "targetReportPath": "tests/reports/v4-unity-shadow-visual-baseline.json",
    "minimumEvidence": {
      "width": 720,
      "height": 480,
      "nonBlankPixels": 60001,
      "colorBuckets": 5,
      "drawCalls": 5,
      "shadowEvidencePixels": 701
    }
  },
  {
    "engine": "unreal",
    "baselineKind": "shadow-visual",
    "descriptorPath": "fixtures/external-engine-baselines/v4/shadow-visual-parity-scene.json",
    "sceneDescriptorId": "v4-shadow-visual-parity-scene",
    "sceneDescriptorVersion": "v4-shadow-visual-parity-scene-v1",
    "screenshotPath": "tests/reports/v4-shadow-visual/unreal-shadow-visual-baseline.png",
    "runnerEvidencePath": "tests/reports/v4-shadow-visual/unreal-shadow-visual-baseline.png.evidence.json",
    "targetReportPath": "tests/reports/v4-unreal-shadow-visual-baseline.json",
    "minimumEvidence": {
      "width": 720,
      "height": 480,
      "nonBlankPixels": 60001,
      "colorBuckets": 5,
      "drawCalls": 5,
      "shadowEvidencePixels": 701
    }
  },
  {
    "engine": "unity",
    "baselineKind": "hdr-render-target",
    "descriptorPath": "fixtures/external-engine-baselines/v4/hdr-render-target-visual-parity-scene.json",
    "sceneDescriptorId": "v4-hdr-render-target-visual-parity-scene",
    "sceneDescriptorVersion": "v4-hdr-render-target-visual-parity-scene-v1",
    "screenshotPath": "tests/reports/v4-hdr-render-target/unity-hdr-render-target-baseline.png",
    "runnerEvidencePath": "tests/reports/v4-hdr-render-target/unity-hdr-render-target-baseline.png.evidence.json",
    "targetReportPath": "tests/reports/v4-unity-hdr-render-target-baseline.json",
    "minimumEvidence": {
      "width": 720,
      "height": 420,
      "nonBlankPixels": 30001,
      "colorBuckets": 5,
      "drawCalls": 4,
      "toneMappedPatches": 3
    }
  },
  {
    "engine": "unreal",
    "baselineKind": "hdr-render-target",
    "descriptorPath": "fixtures/external-engine-baselines/v4/hdr-render-target-visual-parity-scene.json",
    "sceneDescriptorId": "v4-hdr-render-target-visual-parity-scene",
    "sceneDescriptorVersion": "v4-hdr-render-target-visual-parity-scene-v1",
    "screenshotPath": "tests/reports/v4-hdr-render-target/unreal-hdr-render-target-baseline.png",
    "runnerEvidencePath": "tests/reports/v4-hdr-render-target/unreal-hdr-render-target-baseline.png.evidence.json",
    "targetReportPath": "tests/reports/v4-unreal-hdr-render-target-baseline.json",
    "minimumEvidence": {
      "width": 720,
      "height": 420,
      "nonBlankPixels": 30001,
      "colorBuckets": 5,
      "drawCalls": 4,
      "toneMappedPatches": 3
    }
  },
  {
    "engine": "unity",
    "baselineKind": "postprocess-suite",
    "descriptorPath": "fixtures/external-engine-baselines/v4/postprocess-suite-parity-scene.json",
    "sceneDescriptorId": "v4-postprocess-suite-parity-scene",
    "sceneDescriptorVersion": "v4-postprocess-suite-parity-scene-v1",
    "screenshotPath": "tests/reports/v4-postprocess-suite/unity-postprocess-suite-baseline.png",
    "runnerEvidencePath": "tests/reports/v4-postprocess-suite/unity-postprocess-suite-baseline.png.evidence.json",
    "targetReportPath": "tests/reports/v4-unity-postprocess-suite-baseline.json",
    "minimumEvidence": {
      "width": 960,
      "height": 540,
      "nonBlankPixels": 30001,
      "colorBuckets": 8,
      "drawCalls": 4,
      "implementedEffects": 14,
      "realSceneEffects": 14
    }
  },
  {
    "engine": "unreal",
    "baselineKind": "postprocess-suite",
    "descriptorPath": "fixtures/external-engine-baselines/v4/postprocess-suite-parity-scene.json",
    "sceneDescriptorId": "v4-postprocess-suite-parity-scene",
    "sceneDescriptorVersion": "v4-postprocess-suite-parity-scene-v1",
    "screenshotPath": "tests/reports/v4-postprocess-suite/unreal-postprocess-suite-baseline.png",
    "runnerEvidencePath": "tests/reports/v4-postprocess-suite/unreal-postprocess-suite-baseline.png.evidence.json",
    "targetReportPath": "tests/reports/v4-unreal-postprocess-suite-baseline.json",
    "minimumEvidence": {
      "width": 960,
      "height": 540,
      "nonBlankPixels": 30001,
      "colorBuckets": 8,
      "drawCalls": 4,
      "implementedEffects": 14,
      "realSceneEffects": 14
    }
  }
];
const selected = slots.filter((slot) => engineArg === "all" || slot.engine === engineArg);
const results = selected.map(validateSlot);
const missing = results.filter((result) => result.present !== true);
const failed = results.filter((result) => result.present === true && result.ok !== true);
const ok = failed.length === 0 && (allowMissing || missing.length === 0);

console.log(JSON.stringify({
  ok,
  engine: engineArg,
  selectedSlots: selected.length,
  validReports: results.filter((result) => result.ok === true).length,
  missingReports: missing.length,
  failedReports: failed.length,
  results,
}, null, 2));
if (!ok) process.exitCode = 1;

function validateSlot(slot) {
  const reportFullPath = join(root, slot.targetReportPath);
  if (!existsSync(reportFullPath)) {
    return { ...slot, ok: false, present: false, violations: ["missing target report"] };
  }
  const reportText = readFileSync(reportFullPath, "utf8");
  const report = JSON.parse(reportText);
  const evidencePath = String(report.runnerEvidencePath || "");
  const evidenceFullPath = evidencePath ? join(root, evidencePath) : "";
  const evidenceText = evidenceFullPath && existsSync(evidenceFullPath) ? readFileSync(evidenceFullPath, "utf8") : "";
  const evidence = evidenceText ? JSON.parse(evidenceText) : null;
  const reportEvidence = report.runnerEvidence || null;
  const metrics = evidence?.metrics || {};
  const reportMetrics = report.metrics || {};
  const violations = [
    ...(report.ok === true ? [] : ["report ok must be true"]),
    ...(report.engine === slot.engine ? [] : ["report engine mismatch"]),
    ...(report.baselineKind === slot.baselineKind ? [] : ["report baselineKind mismatch"]),
    ...(report.sameSceneExternalBaseline === true ? [] : ["sameSceneExternalBaseline must be true"]),
    ...(report.sceneDescriptorId === slot.sceneDescriptorId ? [] : ["sceneDescriptorId mismatch"]),
    ...(report.sceneDescriptorVersion === slot.sceneDescriptorVersion ? [] : ["sceneDescriptorVersion mismatch"]),
    ...(report.screenshotPath === slot.screenshotPath ? [] : ["screenshotPath mismatch"]),
    ...(typeof report.descriptorSha256 === "string" && /^[0-9a-f]{64}$/.test(report.descriptorSha256) ? [] : ["descriptorSha256 missing or invalid"]),
    ...(typeof report.screenshotSha256 === "string" && /^[0-9a-f]{64}$/.test(report.screenshotSha256) ? [] : ["screenshotSha256 missing or invalid"]),
    ...(evidencePath === slot.runnerEvidencePath ? [] : ["runnerEvidencePath mismatch"]),
    ...(evidenceText ? [] : ["runner evidence sidecar missing"]),
    ...(typeof report.runnerEvidenceSha256 === "string" && /^[0-9a-f]{64}$/.test(report.runnerEvidenceSha256) ? [] : ["runnerEvidenceSha256 missing or invalid"]),
    ...(evidenceText && report.runnerEvidenceSha256 === sha256Text(evidenceText) ? [] : ["runnerEvidenceSha256 does not match sidecar"]),
    ...(reportEvidence ? [] : ["embedded runnerEvidence missing"]),
    ...(evidence?.ok === true ? [] : ["runner evidence ok must be true"]),
    ...(evidence?.engine === slot.engine ? [] : ["runner evidence engine mismatch"]),
    ...(evidence?.baselineKind === slot.baselineKind ? [] : ["runner evidence baselineKind mismatch"]),
    ...(evidence?.sceneDescriptorId === slot.sceneDescriptorId ? [] : ["runner evidence sceneDescriptorId mismatch"]),
    ...(evidence?.sceneDescriptorVersion === slot.sceneDescriptorVersion ? [] : ["runner evidence sceneDescriptorVersion mismatch"]),
    ...(evidence?.screenshotPath === slot.screenshotPath ? [] : ["runner evidence screenshotPath mismatch"]),
    ...(evidence?.renderedFrameCaptured === true ? [] : ["runner evidence renderedFrameCaptured must be true"]),
    ...(evidence?.cameraConfigured === true ? [] : ["runner evidence cameraConfigured must be true"]),
    ...minimumEvidenceViolations("runner evidence metrics", metrics, slot.minimumEvidence),
    ...reportMetricMatchViolations(reportMetrics, metrics, slot.minimumEvidence),
    ...embeddedEvidenceMatchViolations(reportEvidence, evidence),
  ];
  return {
    ...slot,
    ok: violations.length === 0,
    present: true,
    reportSha256: sha256Text(reportText),
    runnerEvidenceSha256: evidenceText ? sha256Text(evidenceText) : null,
    violations,
  };
}

function minimumEvidenceViolations(prefix, metrics, minimumEvidence) {
  return Object.entries(minimumEvidence).flatMap(([key, minimum]) => {
    if (key === "nonBlankPixels" || key === "colorBuckets") return [];
    const value = Number(metrics[key]);
    return Number.isFinite(value) && value >= Number(minimum) ? [] : [prefix + "." + key + " " + value + " < minimum " + minimum];
  });
}

function reportMetricMatchViolations(reportMetrics, runnerMetrics, minimumEvidence) {
  const keys = ["width", "height", ...Object.keys(minimumEvidence).filter((key) => !["width", "height", "nonBlankPixels", "colorBuckets"].includes(key))];
  return keys.flatMap((key) => Number(reportMetrics[key]) === Number(runnerMetrics[key]) ? [] : ["metrics." + key + " must match runner evidence"]);
}

function embeddedEvidenceMatchViolations(embedded, sidecar) {
  if (!embedded || !sidecar) return [];
  const keys = ["ok", "engine", "baselineKind", "sceneDescriptorId", "sceneDescriptorVersion", "screenshotPath", "renderedFrameCaptured", "cameraConfigured"];
  const fieldViolations = keys.flatMap((key) => embedded[key] === sidecar[key] ? [] : ["embedded runnerEvidence." + key + " must match sidecar"]);
  const embeddedMetrics = embedded.metrics || {};
  const sidecarMetrics = sidecar.metrics || {};
  const metricViolations = Object.keys(sidecarMetrics).flatMap((key) => embeddedMetrics[key] === sidecarMetrics[key] ? [] : ["embedded runnerEvidence.metrics." + key + " must match sidecar"]);
  return [...fieldViolations, ...metricViolations];
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
