#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const kitRoot = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
if (args.length < 3) {
  console.error("Usage: node write-baseline-report.mjs <unity|unreal> <baseline-kind> <screenshot-path> [report-path] [runner-evidence-path]");
  process.exit(2);
}

const engine = args[0];
const baselineKind = args[1];
const screenshotPath = args[2];
const runnerEvidencePath = args[4] || screenshotPath + ".evidence.json";
if (engine !== "unity" && engine !== "unreal") throw new Error("engine must be unity or unreal");
const descriptorPath = join(kitRoot, descriptorFileFor(baselineKind));
if (!existsSync(descriptorPath)) throw new Error("Missing descriptor for baseline kind: " + baselineKind);
const descriptorText = readFileSync(descriptorPath, "utf8");
const descriptor = JSON.parse(descriptorText);
const reportPath = args[3] || targetReportPath(engine, baselineKind);
const screenshotBytes = readFileSync(screenshotPath);
const screenshot = readPng(screenshotBytes);
if (!screenshot.ok) throw new Error("Screenshot is not a supported PNG: " + screenshot.reason);
if (!existsSync(runnerEvidencePath)) {
  throw new Error("Missing external runner evidence sidecar: " + runnerEvidencePath);
}
let runnerEvidenceText = readFileSync(runnerEvidencePath, "utf8");
let runnerEvidence = JSON.parse(runnerEvidenceText);
if (
  typeof runnerEvidence?.screenshotPath === "string" &&
  runnerEvidence.screenshotPath !== screenshotPath &&
  pathsPointToSameFile(runnerEvidence.screenshotPath, screenshotPath)
) {
  runnerEvidence = { ...runnerEvidence, screenshotPath };
  runnerEvidenceText = JSON.stringify(runnerEvidence, null, 2) + "\n";
  writeFileSync(runnerEvidencePath, runnerEvidenceText);
}
const evidenceViolations = validateScreenshotEvidence(descriptor, screenshot);
if (evidenceViolations.length > 0) {
  throw new Error("External baseline screenshot failed descriptor evidence checks: " + evidenceViolations.join("; "));
}
const runnerEvidenceViolations = validateRunnerEvidence(engine, baselineKind, descriptor, screenshotPath, screenshot, runnerEvidence);
if (runnerEvidenceViolations.length > 0) {
  throw new Error("External baseline runner evidence failed descriptor checks: " + runnerEvidenceViolations.join("; "));
}
const runnerMetrics = runnerEvidence.metrics || {};
const metrics = {
  width: screenshot.width,
  height: screenshot.height,
  nonBlankPixels: screenshot.nonBlankPixels,
  colorBuckets: screenshot.colorBuckets,
  drawCalls: metricValue(runnerMetrics, "drawCalls"),
  ...(descriptor.minimumEvidence?.materialCount === undefined ? {} : { materialCount: metricValue(runnerMetrics, "materialCount") }),
  ...(descriptor.minimumEvidence?.productParts === undefined ? {} : { productParts: metricValue(runnerMetrics, "productParts") }),
  ...(descriptor.minimumEvidence?.turntableHotspots === undefined ? {} : { turntableHotspots: metricValue(runnerMetrics, "turntableHotspots") }),
  ...(descriptor.minimumEvidence?.captureViews === undefined ? {} : { captureViews: metricValue(runnerMetrics, "captureViews") }),
  ...(descriptor.minimumEvidence?.batchTasks === undefined ? {} : { batchTasks: metricValue(runnerMetrics, "batchTasks") }),
  ...(descriptor.minimumEvidence?.featureCount === undefined ? {} : { featureCount: metricValue(runnerMetrics, "featureCount") }),
  ...(descriptor.minimumEvidence?.shadowEvidencePixels === undefined ? {} : { shadowEvidencePixels: metricValue(runnerMetrics, "shadowEvidencePixels") }),
  ...(descriptor.minimumEvidence?.toneMappedPatches === undefined ? {} : { toneMappedPatches: metricValue(runnerMetrics, "toneMappedPatches") }),
  ...(descriptor.minimumEvidence?.implementedEffects === undefined ? {} : { implementedEffects: metricValue(runnerMetrics, "implementedEffects") }),
  ...(descriptor.minimumEvidence?.realSceneEffects === undefined ? {} : { realSceneEffects: metricValue(runnerMetrics, "realSceneEffects") }),
};
const report = {
  ok: true,
  engine,
  baselineKind,
  sameSceneExternalBaseline: true,
  ...(baselineKind === "product-visual" ? { sameSceneProductBaseline: true } : {}),
  sceneDescriptorId: descriptor.id,
  sceneDescriptorVersion: descriptor.schemaVersion,
  descriptorSha256: createHash("sha256").update(descriptorText).digest("hex"),
  generatedBy: "fixtures/external-engine-baselines/v4/write-baseline-report.mjs",
  screenshotPath,
  screenshotSha256: createHash("sha256").update(screenshotBytes).digest("hex"),
  runnerEvidencePath,
  runnerEvidenceSha256: createHash("sha256").update(runnerEvidenceText).digest("hex"),
  runnerEvidence,
  visualDiffAgainstGalileo: true,
  metrics,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, reportPath, screenshotPath, metrics }, null, 2));

function descriptorFileFor(kind) {
  switch (kind) {
    case "product-visual": return "product-visual-parity-scene.json";
    case "pbr-visual": return "pbr-visual-parity-scene.json";
    case "shadow-visual": return "shadow-visual-parity-scene.json";
    case "hdr-render-target": return "hdr-render-target-visual-parity-scene.json";
    case "postprocess-suite": return "postprocess-suite-parity-scene.json";
    default: throw new Error("Unknown baseline kind: " + kind);
  }
}

function targetReportPath(engineName, kind) {
  return "tests/reports/v4-" + engineName + "-" + kind + "-baseline.json";
}

function validateScreenshotEvidence(descriptor, screenshot) {
  const minimum = descriptor.minimumEvidence || {};
  const viewport = descriptor.viewport || {};
  const expectedWidth = Number(minimum.width || viewport.width || 0);
  const expectedHeight = Number(minimum.height || viewport.height || 0);
  const minNonBlankPixels = Number(minimum.nonBlankPixels || 10001);
  const minColorBuckets = Number(minimum.colorBuckets || 2);
  const violations = [];
  if (expectedWidth > 0 && screenshot.width !== expectedWidth) {
    violations.push("width " + screenshot.width + " !== expected " + expectedWidth);
  }
  if (expectedHeight > 0 && screenshot.height !== expectedHeight) {
    violations.push("height " + screenshot.height + " !== expected " + expectedHeight);
  }
  if (screenshot.nonBlankPixels < minNonBlankPixels) {
    violations.push("nonBlankPixels " + screenshot.nonBlankPixels + " < minimum " + minNonBlankPixels);
  }
  if (screenshot.colorBuckets < minColorBuckets) {
    violations.push("colorBuckets " + screenshot.colorBuckets + " < minimum " + minColorBuckets);
  }
  return violations;
}

function validateRunnerEvidence(engineName, kind, descriptor, screenshotPathValue, screenshot, evidence) {
  const minimum = descriptor.minimumEvidence || {};
  const metrics = evidence?.metrics || {};
  const violations = [];
  if (evidence?.ok !== true) violations.push("runner evidence ok must be true");
  if (evidence?.engine !== engineName) violations.push("runner evidence engine mismatch");
  if (evidence?.baselineKind !== kind) violations.push("runner evidence baselineKind mismatch");
  if (evidence?.sceneDescriptorId !== descriptor.id) violations.push("runner evidence sceneDescriptorId mismatch");
  if (evidence?.sceneDescriptorVersion !== descriptor.schemaVersion) violations.push("runner evidence sceneDescriptorVersion mismatch");
  if (evidence?.screenshotPath !== screenshotPathValue) violations.push("runner evidence screenshotPath mismatch");
  if (evidence?.renderedFrameCaptured !== true) violations.push("runner evidence renderedFrameCaptured must be true");
  if (evidence?.cameraConfigured !== true) violations.push("runner evidence cameraConfigured must be true");
  if (Number(metrics.width) !== screenshot.width) violations.push("runner evidence width mismatch");
  if (Number(metrics.height) !== screenshot.height) violations.push("runner evidence height mismatch");
  for (const key of Object.keys(minimum)) {
    if (key === "width" || key === "height" || key === "nonBlankPixels" || key === "colorBuckets") continue;
    const value = Number(metrics[key]);
    const required = Number(minimum[key]);
    if (!Number.isFinite(value) || value < required) {
      violations.push("runner evidence metrics." + key + " " + value + " < minimum " + required);
    }
  }
  return violations;
}

function pathsPointToSameFile(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}

function metricValue(metrics, key) {
  const value = Number(metrics[key]);
  if (!Number.isFinite(value)) throw new Error("Runner evidence metrics." + key + " is missing or non-finite");
  return value;
}

function readPng(data) {
  const isPng = data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[12] === 0x49 &&
    data[13] === 0x48 &&
    data[14] === 0x44 &&
    data[15] === 0x52;
  if (!isPng) return { ok: false, reason: "not a PNG" };
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const bitDepth = data[24];
  const colorType = data[25];
  if (bitDepth !== 8) return { ok: false, reason: "unsupported bit depth " + bitDepth };
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (channels === 0) return { ok: false, reason: "unsupported color type " + colorType };
  const idat = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > data.length) return { ok: false, reason: "truncated PNG chunk" };
    if (type === "IDAT") idat.push(data.subarray(start, end));
    if (type === "IEND") break;
    offset = end + 4;
  }
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const buckets = new Set();
  let nonBlankPixels = 0;
  let readOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset] || 0;
    readOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[readOffset + x] || 0;
      const left = x >= channels ? current[x - channels] || 0 : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] || 0 : 0;
      current[x] = unfilter(filter, raw, left, up, upLeft);
    }
    for (let x = 0; x < width; x += 1) {
      const index = x * channels;
      const r = current[index] || 0;
      const g = channels === 1 ? r : current[index + 1] || 0;
      const b = channels === 1 ? r : current[index + 2] || 0;
      if (r > 8 || g > 8 || b > 8) {
        nonBlankPixels += 1;
        buckets.add(String(r >> 5) + ":" + String(g >> 5) + ":" + String(b >> 5));
      }
    }
    current.copy(previous);
    current.fill(0);
    readOffset += stride;
  }
  return { ok: true, width, height, nonBlankPixels, colorBuckets: buckets.size };
}

function unfilter(filter, raw, left, up, upLeft) {
  switch (filter) {
    case 0: return raw;
    case 1: return (raw + left) & 255;
    case 2: return (raw + up) & 255;
    case 3: return (raw + Math.floor((left + up) / 2)) & 255;
    case 4: return (raw + paeth(left, up, upLeft)) & 255;
    default: throw new Error("unsupported PNG filter " + filter);
  }
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
}
