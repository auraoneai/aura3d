import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/rendering/src/EnvironmentPipeline.ts",
  "packages/rendering/src/IBL.ts",
  "packages/rendering/src/PMREM.ts",
  "packages/rendering/src/BRDFLut.ts",
  "fixtures/v4/environments/manifest.json",
  "tests/unit/rendering/v4-ibl.test.ts",
  "tests/browser/v4-ibl-visual.spec.ts",
  "tools/v4-ibl-readiness/index.ts",
  "tests/reports/v4-ibl-browser.json"
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
    "createV4EnvironmentPipeline",
    "createV4IblResources",
    "createV4Pmrem",
    "createV4BrdfLut",
    "listV4EnvironmentTargets"
  ]),
  "Rendering package index must export V4 IBL/environment APIs."
);

const pipeline = readText("packages/rendering/src/EnvironmentPipeline.ts");
check(
  "environment-targets",
  includesAll(pipeline, [
    "studio-softbox-hdr",
    "gallery-neutral-hdr",
    "outdoor-overcast-hdr",
    "warehouse-industrial-hdr",
    "night-neon-hdr"
  ]),
  "EnvironmentPipeline must name all five required V4 environment targets."
);
check(
  "environment-release-boundary",
  includesAll(pipeline, [
    "bootstrap-generated-until-licensed-hdr-acquired",
    "licensed HDR",
    "Three.js"
  ]),
  "EnvironmentPipeline must block generated environments from release proof and require Three.js comparison."
);

const ibl = readText("packages/rendering/src/IBL.ts");
check(
  "ibl-capabilities",
  includesAll(ibl, [
    "diffuseIrradiance",
    "specularPrefilter",
    "brdfLut",
    "environmentRotation",
    "environmentIntensity",
    "backgroundSeparation",
    "notFlagshipProof"
  ]),
  "IBL resources must expose diffuse irradiance, specular prefiltering, BRDF LUT, rotation, intensity, background separation, and proof boundary."
);

const pmrem = readText("packages/rendering/src/PMREM.ts");
check(
  "pmrem-capabilities",
  includesAll(pmrem, [
    "generateSpecularPrefilterMipLevels",
    "roughness",
    "directionalReflectionReady"
  ]),
  "PMREM wrapper must generate roughness-indexed specular prefilter mips."
);

const brdf = readText("packages/rendering/src/BRDFLut.ts");
check(
  "brdf-capabilities",
  includesAll(brdf, [
    "generateApproximateBrdfLutPixels",
    "nonZeroPixels",
    "monotonicRoughnessTrend"
  ]),
  "BRDF LUT wrapper must generate a non-empty LUT with roughness response diagnostics."
);

const manifest = readJson("fixtures/v4/environments/manifest.json");
const targets = Array.isArray(manifest?.targets) ? manifest.targets.filter(isRecord) : [];
check("environment-manifest-target-count", targets.length >= 5, "Environment manifest must include five HDR targets.");
check(
  "environment-manifest-bootstrap-boundary",
  typeof manifest?.bootstrapOnlyRule === "string" &&
    manifest.bootstrapOnlyRule.includes("Generated local fixtures cannot satisfy flagship proof"),
  "Environment manifest must state generated local fixtures cannot satisfy flagship proof."
);

const browser = readJson("tests/reports/v4-ibl-browser.json");
const state = isRecord(browser?.state) ? browser.state : {};
const featureEvidence = isRecord(state.featureEvidence) ? state.featureEvidence : {};
const activeFeatures = Array.isArray(featureEvidence.activeFeatures) ? featureEvidence.activeFeatures : [];
const environmentResources = isRecord(state.environmentResources) ? state.environmentResources : {};
const v4Pipeline = isRecord(browser?.v4Pipeline) ? browser.v4Pipeline : {};
const v4Diagnostics = isRecord(v4Pipeline.diagnostics) ? v4Pipeline.diagnostics : {};
check(
  "browser-ibl-evidence",
  browser?.ok === true &&
    state.status === "ready" &&
    activeFeatures.includes("environment-reflections") &&
    Number(environmentResources.specularMipCount) >= 4 &&
    v4Diagnostics.hdrSource === true &&
    v4Diagnostics.notFlagshipProof === true,
  "Browser report must prove material-showroom environment reflections and V4 generated linear HDR IBL resources."
);
check(
  "browser-ibl-validation",
  v4Diagnostics.diffuseIrradiance === true &&
    v4Diagnostics.specularPrefilter === true &&
    v4Diagnostics.brdfLut === true &&
    Number(v4Pipeline.pmremMipCount) >= 4 &&
    Number(v4Pipeline.brdfNonZeroPixels) > 0,
  "Browser report must prove V4 BRDF LUT, specular mips, PMREM, and diffuse irradiance validation."
);
check(
  "browser-claim-boundary",
  typeof browser?.productBoundary === "string" &&
    browser.productBoundary.includes("bootstrap-only") &&
    Array.isArray(browser.requiredNextProof) &&
    browser.requiredNextProof.includes("same-scene Three.js material and product comparisons"),
  "Browser IBL report must state generated environments are not flagship proof and name required next proof."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "g3d-v4-ibl-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 Milestone 3 IBL/environment pipeline is ready. Generated environments remain bootstrap-only until licensed HDR sources and flagship comparisons are added."
    : "V4 Milestone 3 IBL/environment pipeline is incomplete.",
  checkedFiles: requiredFiles,
  checks
};

const reportPath = resolve("tests/reports/v4-ibl-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
