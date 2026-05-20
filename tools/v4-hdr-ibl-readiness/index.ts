import { fileURLToPath } from "node:url";
import { baseReport, isRecord, readJson, writeJson } from "../v4-reporting/index.js";

export interface V4HdrIblReadinessReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly boundedHdrIblEvidence: boolean;
  readonly productionHdrIblParity: false;
  readonly supportedEvidence: readonly string[];
  readonly blockedEvidence: readonly string[];
  readonly validations: readonly {
    readonly id: string;
    readonly passed: boolean;
    readonly evidence: string;
    readonly blockers: readonly string[];
  }[];
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/v4-hdr-ibl-readiness.json";
const sourceFiles = [
  "tools/v4-hdr-ibl-readiness/index.ts",
  "packages/rendering/src/EnvironmentMapResources.ts",
  "packages/rendering/src/V4RenderPreset.ts",
  "fixtures/assets/v4/environments/generated-local-environment-manifest.json",
  "examples/asset-viewer/main.ts",
  "examples/product-configurator/main.ts",
  "examples/architecture-viewer/main.ts",
  "examples/game-slice/main.ts",
  "tests/browser/asset-material-fidelity-v4.spec.ts",
  "tests/browser/example-screenshot-audit-v4.spec.ts",
  "tests/unit/rendering/environment-map-resources.test.ts",
  "tests/unit/rendering/v4-render-preset.test.ts",
  "tests/reports/v4-asset-material-fidelity.json",
  "tests/reports/v4-example-screenshots/manifest.json",
  "tests/reports/v4-examples.json",
] as const;

export function createV4HdrIblReadinessReport(root = process.cwd()): V4HdrIblReadinessReport {
  const materialFidelity = readJson(root, "tests/reports/v4-asset-material-fidelity.json");
  const screenshotManifest = readJson(root, "tests/reports/v4-example-screenshots/manifest.json");
  const examples = readJson(root, "tests/reports/v4-examples.json");
  const materialEvidence = hasMaterialHdrIblEvidence(materialFidelity);
  const flagshipEvidence = hasFlagshipHdrIblEvidence(screenshotManifest);
  const examplesFresh = examples?.ok === true;
  const supportedEvidence = [
    ...(materialEvidence ? ["asset-viewer-linear-hdr-ibl-material-response"] : []),
    ...(flagshipEvidence ? ["flagship-linear-hdr-ibl-screenshot-state"] : []),
    ...(examplesFresh ? ["v4-examples-screenshot-manifest-fresh"] : []),
    "generated-linear-hdr-environment-source",
    "specular-prefilter-mips",
    "diffuse-irradiance-resource",
    "brdf-lut-texture-validation",
  ];
  const blockedEvidence = [
    "same-scene-HDR-IBL-visual-comparison-against-Unity/Unreal",
    "licensed-production-HDRI-capture-and-reference-BRDF-parity",
  ] as const;
  const validationRows = [
    validation("asset-material-linear-hdr-ibl", materialEvidence, "tests/reports/v4-asset-material-fidelity.json:v4-material-fidelity-card", [
      "V4 material fidelity report does not prove a linear-HDR IBL resource, BRDF LUT, specular mips, diffuse irradiance, and material render state.",
    ]),
    validation("flagship-linear-hdr-ibl-state", flagshipEvidence, "tests/reports/v4-example-screenshots/manifest.json", [
      "Product, architecture, and game flagship screenshot states do not all publish linear-HDR environment resources and reflection evidence.",
    ]),
    validation("fresh-example-manifest", examplesFresh, "tests/reports/v4-examples.json", [
      "V4 example screenshot verifier report is missing or failing.",
    ]),
    validation("production-hdr-ibl-boundary", true, "tools/v4-hdr-ibl-readiness/index.ts", []),
  ];
  const violations = validationRows.flatMap((entry) => entry.blockers.map((blocker) => `${entry.id}: ${blocker}`));
  const boundedHdrIblEvidence = validationRows.slice(0, 3).every((entry) => entry.passed);
  return {
    ...baseReport(root, {
      ok: boundedHdrIblEvidence,
      command: "pnpm audit:v4-hdr-ibl-readiness",
      runIdPrefix: "v4-hdr-ibl-readiness",
      sourceFiles,
      violations,
      blockedClaims: [
        "production HDR/render-target parity",
        "complete PBR parity language",
        "Unity/Unreal replacement language",
        "production-ready language",
      ],
    }),
    auditComplete: true,
    boundedHdrIblEvidence,
    productionHdrIblParity: false,
    supportedEvidence,
    blockedEvidence,
    validations: validationRows,
    violations,
  };
}

function validation(id: string, passed: boolean, evidence: string, blockers: readonly string[]) {
  return {
    id,
    passed,
    evidence,
    blockers: passed ? [] : blockers,
  };
}

function hasMaterialHdrIblEvidence(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !Array.isArray(report.validations)) return false;
  return report.validations.some((entry) => {
    if (!isRecord(entry) || entry.name !== "v4-material-fidelity-card" || entry.ok !== true || !isRecord(entry.evidence)) return false;
    const evidence = entry.evidence;
    return evidence.environmentResourceSet === "generated-local-linear-hdr-environment" &&
      evidence.hdrSource === true &&
      Number(evidence.maxLinearValue) > 1 &&
      Number(evidence.specularMipCount) >= 4 &&
      evidence.brdfLutValidated === true &&
      evidence.diffuseIrradiance === true &&
      Number(evidence.drawCalls) >= 1;
  });
}

function hasFlagshipHdrIblEvidence(report: Record<string, unknown> | null): boolean {
  if (!Array.isArray(report?.entries)) return false;
  const entries = new Map<string, Record<string, unknown>>();
  for (const entry of report.entries) {
    if (isRecord(entry) && typeof entry.id === "string") entries.set(entry.id, entry);
  }
  return ["product-configurator", "architecture-viewer", "game-slice"].every((id) => {
    const entry = entries.get(id);
    const featureEvidence = isRecord(entry?.featureEvidence) ? entry.featureEvidence : {};
    const metrics = isRecord(entry?.metrics) ? entry.metrics : {};
    return featureEvidence.generatedEnvironmentMap === true &&
      featureEvidence.environmentResourceSet === "generated-local-linear-hdr-environment" &&
      featureEvidence.environmentReflectionEvidence === true &&
      featureEvidence.brdfLutValidated === true &&
      Number(metrics.environmentTextureMipCount) >= 4 &&
      metrics.environmentBrdfLutValidated === true &&
      metrics.environmentDiffuseIrradiance === true &&
      Number(metrics.environmentSpecularIntensity) > 0 &&
      Number(metrics.drawCalls) > 0;
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4HdrIblReadinessReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    boundedHdrIblEvidence: report.boundedHdrIblEvidence,
    productionHdrIblParity: report.productionHdrIblParity,
    supportedEvidence: report.supportedEvidence,
    blockedEvidence: report.blockedEvidence,
    report: reportPath,
  }, null, 2));
}
