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
  "fixtures/external-parity/environments/manifest.json",
  "tests/unit/rendering/external-parity-ibl.test.ts",
  "tests/browser/external-parity-ibl-visual.spec.ts",
  "tools/external-parity-ibl-readiness/index.ts",
  "tests/reports/external-parity-ibl-browser.json"
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
    "createExternalParityEnvironmentPipeline",
    "createExternalParityIblResources",
    "createExternalParityPmrem",
    "createExternalParityBrdfLut",
    "listExternalParityEnvironmentTargets"
  ]),
  "Rendering package index must export External parity IBL/environment APIs."
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
  "EnvironmentPipeline must name all five required External parity environment targets."
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

const manifest = readJson("fixtures/external-parity/environments/manifest.json");
const targets = Array.isArray(manifest?.targets) ? manifest.targets.filter(isRecord) : [];
check("environment-manifest-target-count", targets.length >= 5, "Environment manifest must include five HDR targets.");
check(
  "environment-manifest-bootstrap-boundary",
  typeof manifest?.bootstrapOnlyRule === "string" &&
    manifest.bootstrapOnlyRule.includes("Generated local fixtures cannot satisfy flagship proof"),
  "Environment manifest must state generated local fixtures cannot satisfy flagship proof."
);

const browser = readJson("tests/reports/external-parity-ibl-browser.json");
const state = isRecord(browser?.state) ? browser.state : {};
const featureEvidence = isRecord(state.featureEvidence) ? state.featureEvidence : {};
const activeFeatures = Array.isArray(featureEvidence.activeFeatures) ? featureEvidence.activeFeatures : [];
const environmentResources = isRecord(state.environmentResources) ? state.environmentResources : {};
const externalParityPipeline = isRecord(browser?.externalParityPipeline) ? browser.externalParityPipeline : {};
const externalParityDiagnostics = isRecord(externalParityPipeline.diagnostics) ? externalParityPipeline.diagnostics : {};
check(
  "browser-ibl-evidence",
  browser?.ok === true &&
    state.status === "ready" &&
    activeFeatures.includes("environment-reflections") &&
    Number(environmentResources.specularMipCount) >= 4 &&
    externalParityDiagnostics.hdrSource === true &&
    externalParityDiagnostics.notFlagshipProof === true,
  "Browser report must prove material-showroom environment reflections and External parity generated linear HDR IBL resources."
);
check(
  "browser-ibl-validation",
  externalParityDiagnostics.diffuseIrradiance === true &&
    externalParityDiagnostics.specularPrefilter === true &&
    externalParityDiagnostics.brdfLut === true &&
    Number(externalParityPipeline.pmremMipCount) >= 4 &&
    Number(externalParityPipeline.brdfNonZeroPixels) > 0,
  "Browser report must prove External parity BRDF LUT, specular mips, PMREM, and diffuse irradiance validation."
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
  schema: "a3d-external-parity-ibl-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "External parity Milestone 3 IBL/environment pipeline is ready. Generated environments remain bootstrap-only until licensed HDR sources and flagship comparisons are added."
    : "External parity Milestone 3 IBL/environment pipeline is incomplete.",
  checkedFiles: requiredFiles,
  checks
};

const reportPath = resolve("tests/reports/external-parity-ibl-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
