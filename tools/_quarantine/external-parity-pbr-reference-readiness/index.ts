import { fileURLToPath } from "node:url";
import {
  SHADER_CHUNKS,
  pbrCausticsConformanceSuite,
  pbrDiffuseBurley,
  pbrDirectLight,
  pbrDistributionGgx,
  pbrEnvironmentLight,
  pbrF0,
  pbrFresnelSchlick,
  pbrGeometrySmithGgxCorrelated,
  pbrPhotometricConformanceSuite,
  pbrReferenceFinite,
  pbrReferenceLuminance,
  pbrTransmissionVolumeConformanceSuite
} from "../../packages/rendering/src/index.js";
import { baseReport, isRecord, readJson, writeJson } from "../external-parity-reporting/index.js";

export interface ExternalParityPbrReferenceReadinessReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly boundedPbrReferenceEvidence: boolean;
  readonly fullPhysicalPbrParity: false;
  readonly supportedEvidence: readonly string[];
  readonly blockedEvidence: readonly string[];
  readonly validations: readonly {
    readonly id: string;
    readonly passed: boolean;
    readonly evidence: string;
    readonly blockers: readonly string[];
  }[];
  readonly metrics: {
    readonly ggxDistributionSample: number;
    readonly smithCorrelatedSample: number;
    readonly burleyDiffuseSample: number;
    readonly fresnelSchlickSample: number;
    readonly dielectricF0: readonly [number, number, number];
    readonly metalF0: readonly [number, number, number];
    readonly glossyMetalLuminance: number;
    readonly roughDielectricLuminance: number;
    readonly metalEnvironmentLuminance: number;
    readonly dielectricEnvironmentLuminance: number;
    readonly photometricConformance: ReturnType<typeof pbrPhotometricConformanceSuite>["metrics"];
    readonly transmissionVolumeConformance: ReturnType<typeof pbrTransmissionVolumeConformanceSuite>["metrics"];
    readonly causticsConformance: ReturnType<typeof pbrCausticsConformanceSuite>["metrics"];
  };
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/external-parity-pbr-reference-readiness.json";
const sourceFiles = [
  "tools/external-parity-pbr-reference-readiness/index.ts",
  "packages/rendering/src/PbrReference.ts",
  "packages/rendering/src/ShaderChunks.ts",
  "packages/rendering/src/ShaderLibrary.ts",
  "packages/rendering/src/PBRMaterial.ts",
  "packages/rendering/src/TexturedPBRMaterial.ts",
  "tests/unit/rendering/pbr-reference.test.ts",
  "tests/reports/external-parity-pbr-visual-parity.json",
  "tests/reports/external-parity-hdr-ibl-readiness.json",
  "tests/reports/external-parity-external-engine-baselines.json",
] as const;

export function createExternalParityPbrReferenceReadinessReport(root = process.cwd()): ExternalParityPbrReferenceReadinessReport {
  const pbrVisual = readJson(root, "tests/reports/external-parity-pbr-visual-parity.json");
  const hdrIbl = readJson(root, "tests/reports/external-parity-hdr-ibl-readiness.json");
  const externalBaselines = readJson(root, "tests/reports/external-parity-external-engine-baselines.json");
  const albedo = [0.8, 0.32, 0.12] as const;
  const dielectricF0 = pbrF0(albedo, 0);
  const metalF0 = pbrF0(albedo, 1);
  const glossyMetal = pbrDirectLight({
    normal: [0, 0, 1],
    viewDirection: [0.22, 0.16, 1],
    lightDirection: [-0.3, 0.4, 1],
    lightColor: [1, 0.92, 0.78],
    lightIntensity: 3,
    albedo: [0.76, 0.38, 0.18],
    metallic: 1,
    roughness: 0.18,
  });
  const roughDielectric = pbrDirectLight({
    normal: [0, 0, 1],
    viewDirection: [0.22, 0.16, 1],
    lightDirection: [-0.3, 0.4, 1],
    lightColor: [1, 0.92, 0.78],
    lightIntensity: 3,
    albedo: [0.76, 0.38, 0.18],
    metallic: 0,
    roughness: 0.86,
  });
  const metalEnvironment = pbrEnvironmentLight({
    normal: [0, 0, 1],
    viewDirection: [0.2, -0.15, 1],
    diffuseIrradiance: [0.32, 0.36, 0.42],
    specularRadiance: [1.8, 1.55, 1.25],
    albedo: [0.76, 0.38, 0.18],
    metallic: 1,
    roughness: 0.18,
  });
  const dielectricEnvironment = pbrEnvironmentLight({
    normal: [0, 0, 1],
    viewDirection: [0.2, -0.15, 1],
    diffuseIrradiance: [0.32, 0.36, 0.42],
    specularRadiance: [1.8, 1.55, 1.25],
    albedo: [0.76, 0.38, 0.18],
    metallic: 0,
    roughness: 0.86,
  });
  const photometricConformance = pbrPhotometricConformanceSuite();
  const transmissionVolumeConformance = pbrTransmissionVolumeConformanceSuite();
  const causticsConformance = pbrCausticsConformanceSuite();
  const metrics = {
    ggxDistributionSample: rounded(pbrDistributionGgx(0.8, 0.35)),
    smithCorrelatedSample: rounded(pbrGeometrySmithGgxCorrelated(0.65, 0.72, 0.35)),
    burleyDiffuseSample: rounded(pbrDiffuseBurley(0.65, 0.72, 0.82, 0.35)),
    fresnelSchlickSample: rounded(pbrFresnelSchlick([0.04, 0.04, 0.04], 0.55)[0]),
    dielectricF0: roundedVec(dielectricF0),
    metalF0: roundedVec(metalF0),
    glossyMetalLuminance: rounded(pbrReferenceLuminance(glossyMetal)),
    roughDielectricLuminance: rounded(pbrReferenceLuminance(roughDielectric)),
    metalEnvironmentLuminance: rounded(pbrReferenceLuminance(metalEnvironment)),
    dielectricEnvironmentLuminance: rounded(pbrReferenceLuminance(dielectricEnvironment)),
    photometricConformance: photometricConformance.metrics,
    transmissionVolumeConformance: transmissionVolumeConformance.metrics,
    causticsConformance: causticsConformance.metrics,
  };
  const boundedVisual = hasBoundedPbrVisualEvidence(pbrVisual);
  const boundedHdrIbl = hdrIbl?.ok === true && hdrIbl.boundedHdrIblEvidence === true;
  const validationRows = [
    validation("cpu-reference-deterministic-samples", deterministicSamplesMatch(metrics), "packages/rendering/src/PbrReference.ts", [
      "CPU PBR reference samples do not match the expected deterministic GGX/Smith/Burley/Fresnel values.",
    ]),
    validation("cpu-reference-material-response", pbrReferenceFinite(glossyMetal) &&
      pbrReferenceFinite(roughDielectric) &&
      pbrReferenceFinite(metalEnvironment) &&
      pbrReferenceFinite(dielectricEnvironment) &&
      Math.abs(metrics.glossyMetalLuminance - metrics.roughDielectricLuminance) > 0.1 &&
      metrics.metalEnvironmentLuminance > metrics.dielectricEnvironmentLuminance &&
      metrics.metalF0[0] > metrics.dielectricF0[0], "packages/rendering/src/PbrReference.ts", [
      "CPU PBR reference material response is not finite or does not separate metal/dielectric/glossy/rough states.",
    ]),
    validation("photometric-pbr-conformance-suite", photometricConformance.ok &&
      photometricConformance.metrics.sampleCount >= 13 &&
      photometricConformance.metrics.checkCount >= 8 &&
      photometricConformance.metrics.failedCheckCount === 0, "packages/rendering/src/PbrReference.ts + tests/unit/rendering/pbr-reference.test.ts", [
      "Local photometric PBR conformance suite is missing, too small, or has failing material-response checks.",
    ]),
    validation("bounded-transmission-volume-reference-suite", transmissionVolumeConformance.ok &&
      transmissionVolumeConformance.metrics.sampleCount >= 6 &&
      transmissionVolumeConformance.metrics.checkCount >= 6 &&
      transmissionVolumeConformance.metrics.failedCheckCount === 0, "packages/rendering/src/PbrReference.ts + tests/unit/rendering/pbr-reference.test.ts", [
      "Bounded transmission, volume attenuation, IOR, and dispersion reference checks are missing or failing.",
    ]),
    validation("bounded-caustics-transmission-reference-suite", causticsConformance.ok &&
      causticsConformance.metrics.sampleCount >= 5 &&
      causticsConformance.metrics.checkCount >= 6 &&
      causticsConformance.metrics.failedCheckCount === 0, "packages/rendering/src/PbrReference.ts + tests/unit/rendering/pbr-reference.test.ts", [
      "Bounded caustics, transmission focusing, attenuation, roughness, and dispersion reference checks are missing or failing.",
    ]),
    validation("shader-chunk-reference-functions", shaderChunkContainsReferenceFunctions(), "packages/rendering/src/ShaderChunks.ts", [
      "Shader chunks do not contain the expected GGX, Smith, Burley, Fresnel, and environment-lighting functions.",
    ]),
    validation("bounded-browser-pbr-visual-evidence", boundedVisual, "tests/reports/external-parity-pbr-visual-parity.json", [
      "Bounded Three.js/Babylon browser PBR visual comparison is missing or failing.",
    ]),
    validation("bounded-hdr-ibl-evidence", boundedHdrIbl, "tests/reports/external-parity-hdr-ibl-readiness.json", [
      "Bounded linear-HDR IBL resource evidence is missing.",
    ]),
    validation("external-pbr-baseline-prepared-slot", hasExternalBaselineSlot(externalBaselines, "pbr-visual"), "tests/reports/external-parity-external-engine-baselines.json", [
      "external Unity/Unreal PBR visual baseline slot is not prepared.",
    ]),
  ];
  const boundedPbrReferenceEvidence = validationRows.every((entry) => entry.passed);
  const supportedEvidence = [
    ...(validationRows[0]?.passed ? ["cpu-ggx-smith-burley-fresnel-reference-samples"] : []),
    ...(validationRows[1]?.passed ? ["cpu-metal-dielectric-rough-glossy-material-response"] : []),
    ...(validationRows[2]?.passed ? ["photometric-pbr-conformance-suite"] : []),
    ...(validationRows[3]?.passed ? ["bounded-transmission-volume-reference-suite"] : []),
    ...(validationRows[4]?.passed ? ["bounded-caustics-transmission-reference-suite"] : []),
    ...(validationRows[5]?.passed ? ["shader-chunks-use-reference-pbr-vocabulary"] : []),
    ...(boundedVisual ? ["bounded-threejs-babylon-pbr-visual-lineup"] : []),
    ...(boundedHdrIbl ? ["bounded-linear-hdr-ibl-resource-evidence"] : []),
    ...(hasExternalBaselineSlot(externalBaselines, "pbr-visual") ? ["prepared-external-unity-unreal-pbr-visual-baseline-slot"] : []),
  ];
  const blockedEvidence = [
    "actual-Unity/Unreal-PBR-runner-evidence-sidecars-and-baseline-reports",
    "same-scene-reference-BRDF-pixel-parity-against-Unity/Unreal",
    "Unity/Unreal-production-caustics-transmission-refraction-parity",
  ] as const;
  const violations = [
    ...validationRows.flatMap((entry) => entry.blockers.map((blocker) => `${entry.id}: ${blocker}`)),
    ...blockedEvidence.map((blocker) => `full-physical-pbr-parity-blocked: ${blocker}`),
  ];
  return {
    ...baseReport(root, {
      ok: boundedPbrReferenceEvidence,
      command: "pnpm audit:external-parity-pbr-reference-readiness",
      runIdPrefix: "external-parity-pbr-reference-readiness",
      sourceFiles,
      violations,
      blockedClaims: [
        "full PBR parity",
        "Unity/Unreal replacement language",
        "production-ready language",
      ],
    }),
    auditComplete: true,
    boundedPbrReferenceEvidence,
    fullPhysicalPbrParity: false,
    supportedEvidence,
    blockedEvidence,
    validations: validationRows,
    metrics,
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

function deterministicSamplesMatch(metrics: ExternalParityPbrReferenceReadinessReport["metrics"]): boolean {
  return close(metrics.ggxDistributionSample, 0.034966) &&
    close(metrics.smithCorrelatedSample, 0.529646) &&
    close(metrics.burleyDiffuseSample, 0.87961) &&
    close(metrics.fresnelSchlickSample, 0.057715);
}

function shaderChunkContainsReferenceFunctions(): boolean {
  const pbrChunk = SHADER_CHUNKS.find((chunk) => chunk.name === "pbr_common")?.source ?? "";
  return [
    "a3dFresnelSchlick",
    "a3dDistributionGGX",
    "a3dGeometrySmithGGXCorrelated",
    "a3dDiffuseBurley",
    "a3dPbrEnvironmentLight",
  ].every((name) => pbrChunk.includes(name));
}

function hasBoundedPbrVisualEvidence(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.boundedPbrVisualParity) || !Array.isArray(report.renders)) return false;
  return report.boundedPbrVisualParity.threejs === true &&
    report.boundedPbrVisualParity.babylon === true &&
    report.renders.every((render) => {
      if (!isRecord(render) || !isRecord(render.metrics)) return false;
      return Number(render.metrics.materialCount) >= 11 &&
        Number(render.metrics.featureCount) >= 11 &&
        Number(render.metrics.drawCalls) >= 11 &&
        Number(render.metrics.nonBlankPixels) > 30_000;
    });
}

function hasExternalBaselineSlot(report: Record<string, unknown> | null, baselineKind: string): boolean {
  return report?.ok === true &&
    Array.isArray(report.sceneSlots) &&
    report.sceneSlots.some((slot) => isRecord(slot) && slot.baselineKind === baselineKind);
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function roundedVec(value: readonly [number, number, number]): readonly [number, number, number] {
  return [rounded(value[0]), rounded(value[1]), rounded(value[2])];
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.000001;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createExternalParityPbrReferenceReadinessReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    boundedPbrReferenceEvidence: report.boundedPbrReferenceEvidence,
    fullPhysicalPbrParity: report.fullPhysicalPbrParity,
    supportedEvidence: report.supportedEvidence,
    blockedEvidence: report.blockedEvidence,
    report: reportPath,
  }, null, 2));
}
