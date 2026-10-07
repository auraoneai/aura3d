import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/rendering/src/ColorManagement.ts",
  "packages/rendering/src/HDRRenderPipeline.ts",
  "packages/rendering/src/ToneMapping.ts",
  "packages/rendering/src/Exposure.ts",
  "packages/rendering/src/RenderDebugViews.ts",
  "tests/unit/rendering/external-parity-color-management.test.ts",
  "tests/browser/external-parity-hdr-pipeline.spec.ts",
  "tools/external-parity-hdr-readiness/index.ts",
  "tests/reports/external-parity-hdr-browser.json"
] as const;

const checks: Check[] = [];

function check(id: string, pass: boolean, detail: string): void {
  checks.push({ id, pass, detail });
}

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function readJson(path: string): JsonObject | null {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as JsonObject;
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function includesAll(text: string, phrases: readonly string[]): boolean {
  return phrases.every((phrase) => text.includes(phrase));
}

for (const file of requiredFiles) {
  check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);
}

const index = readText("packages/rendering/src/index.ts");
check(
  "public-rendering-exports",
  includesAll(index, [
    "createExternalParityColorManagementPolicy",
    "createExternalParityHdrPipeline",
    "createExternalParityToneMappingPolicy",
    "createExternalParityExposurePolicy",
    "createExternalParityDebugViewSet"
  ]),
  "Rendering package index must export the External parity HDR/color API surface."
);

const colorManagement = readText("packages/rendering/src/ColorManagement.ts");
check(
  "color-management-policy",
  includesAll(colorManagement, [
    "lightingColorSpace: \"linear\"",
    "\"base-color\": \"srgb\"",
    "normal: \"linear\"",
    "\"metallic-roughness\": \"linear\"",
    "LDR fallback"
  ]),
  "ColorManagement must define linear lighting, texture color-space policy, and LDR fallback behavior."
);

const toneMapping = readText("packages/rendering/src/ToneMapping.ts");
check(
  "tone-mapping-policy",
  includesAll(toneMapping, [
    "product-catalog",
    "material-review",
    "interior",
    "toneMapFloatPixels",
    "createToneMappingCalibration"
  ]),
  "ToneMapping must expose External parity intent presets and HDR float tone mapping."
);

const exposure = readText("packages/rendering/src/Exposure.ts");
check(
  "exposure-policy",
  includesAll(exposure, [
    "computeExposureHistogramFromPixels",
    "computeAutoExposureFromHistogram",
    "targetLuminance",
    "histogramBins"
  ]),
  "Exposure must expose histogram and auto-exposure analysis."
);

const hdrPipeline = readText("packages/rendering/src/HDRRenderPipeline.ts");
check(
  "hdr-pipeline-policy",
  includesAll(hdrPipeline, [
    "rgba16f",
    "rgba32f",
    "ldr-fallback",
    "createRenderTarget",
    "ToneMappingPass"
  ]),
  "HDRRenderPipeline must allocate HDR/LDR targets and wire tone mapping."
);

const debugViews = readText("packages/rendering/src/RenderDebugViews.ts");
check(
  "debug-view-policy",
  includesAll(debugViews, [
    "base-color",
    "normal",
    "roughness",
    "metallic",
    "emissive",
    "lighting-only",
    "diffuse-ibl",
    "specular-ibl",
    "tone-mapped-output"
  ]),
  "RenderDebugViews must define every External parity required debug view."
);

const browser = readJson("tests/reports/external-parity-hdr-browser.json");
const browserState = isRecord(browser?.state) ? browser.state : {};
const featureEvidence = isRecord(browserState.featureEvidence) ? browserState.featureEvidence : {};
const metrics = isRecord(browserState.metrics) ? browserState.metrics : {};

check(
  "browser-hdr-evidence",
  browser?.ok === true &&
    browserState.status === "ready" &&
    browserState.format === "rgba32f" &&
    featureEvidence.hdrRenderTargets === true &&
    featureEvidence.floatReadback === true &&
    featureEvidence.sampleOverOne === true &&
    featureEvidence.hdrPostprocessToneMapping === true,
  "Browser report must prove rgba32f HDR render target, float readback, overbright sample, and tone mapping."
);

check(
  "browser-tone-map-range",
  Number(metrics.sampleR) > 1 &&
    Number(metrics.hdrToneMappedR) > 150 &&
    Number(metrics.hdrToneMappedR) < 255 &&
    Number(metrics.hdrToneMappedOverbrightPixels) >= 1,
  "Browser report must prove overbright HDR input maps into displayable LDR output without clipping to pure white."
);

check(
  "claim-boundary",
  typeof browser?.productBoundary === "string" &&
    browser.productBoundary.includes("not flagship visual completion") &&
    Array.isArray(browser.requiredNextProof) &&
    browser.requiredNextProof.includes("same-scene Three.js flagship comparisons"),
  "HDR milestone report must state this is not flagship visual completion and name required next proof."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-hdr-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "External parity Milestone 2 HDR/color-management foundation is ready. This is still renderer foundation work, not product visual completion."
    : "External parity Milestone 2 HDR/color-management foundation is incomplete.",
  checkedFiles: requiredFiles,
  checks
};

const reportPath = resolve("tests/reports/external-parity-hdr-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
