import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { baseReport, isRecord, readJson, writeJson } from "../v4-reporting/index.js";

interface CompletionCriterion {
  readonly id: string;
  readonly requestedClaim: string;
  readonly gateReport: string;
  readonly gateField: string;
  readonly achieved: boolean;
  readonly blockerType: "none" | "local" | "external" | "mixed";
  readonly evidencePaths: readonly string[];
  readonly localEvidence: readonly string[];
  readonly requiredExternalEvidence: readonly string[];
  readonly blockers: readonly string[];
}

export interface V4CompletionAuditReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly completionRunbookPath: "tests/reports/v4-completion-audit-runbook.md";
  readonly externalEvidenceRunbookPath: "tests/reports/v4-external-evidence-missing-artifacts.md";
  readonly objective: readonly string[];
  readonly achievedCriteria: number;
  readonly totalCriteria: number;
  readonly criteria: readonly CompletionCriterion[];
  readonly missingCriteria: readonly CompletionCriterion[];
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/v4-completion-audit.json";
const completionRunbookPath = "tests/reports/v4-completion-audit-runbook.md" as const;
const externalEvidenceRunbookPath = "tests/reports/v4-external-evidence-missing-artifacts.md" as const;
const sourceFiles = [
  "tools/v4-completion-audit/index.ts",
  "package.json",
  "tests/reports/v4-broad-parity-readiness.json",
  "tests/reports/v4-external-evidence-readiness.json",
  "tests/reports/v4-unity-unreal-parity.json",
  "tests/reports/v4-production-readiness.json",
  "tests/reports/v4-pbr-gltf-readiness.json",
  "tests/reports/v4-webgpu-parity.json",
  "tests/reports/v4-hdr-render-target-readiness.json",
  "tests/reports/v4-shadow-map-readiness.json",
  "tests/reports/v4-postprocess-suite.json",
  "tests/reports/v4-product-visual-parity.json",
] as const;

const objective = [
  "Three.js broad superiority",
  "Babylon.js broad superiority",
  "Unity parity",
  "Unreal parity",
  "Unity/Unreal replacement",
  "Production readiness",
  "Full PBR parity",
  "Full glTF parity",
  "Full WebGPU parity",
  "Production HDR/render-target parity",
  "Production shadow-map parity",
  "Full postprocess-suite parity",
  "Rendered product visual parity against Three.js/Babylon/Unity/Unreal",
] as const;

export function createV4CompletionAuditReport(root = process.cwd()): V4CompletionAuditReport {
  const broad = readJson(root, "tests/reports/v4-broad-parity-readiness.json");
  const unityUnreal = readJson(root, "tests/reports/v4-unity-unreal-parity.json");
  const production = readJson(root, "tests/reports/v4-production-readiness.json");
  const pbrGltf = readJson(root, "tests/reports/v4-pbr-gltf-readiness.json");
  const webgpu = readJson(root, "tests/reports/v4-webgpu-parity.json");
  const hdr = readJson(root, "tests/reports/v4-hdr-render-target-readiness.json");
  const shadow = readJson(root, "tests/reports/v4-shadow-map-readiness.json");
  const postprocess = readJson(root, "tests/reports/v4-postprocess-suite.json");
  const productVisual = readJson(root, "tests/reports/v4-product-visual-parity.json");
  const externalEvidence = readJson(root, "tests/reports/v4-external-evidence-readiness.json");

  const criteria: CompletionCriterion[] = [
    criterionFromBroadClaim(broad, "threejs-broad-superiority", "Three.js broad superiority", "broadSuperiority.threejs", completionContext(externalEvidence, ["final-external-parity-audits"])),
    criterionFromBroadClaim(broad, "babylonjs-broad-superiority", "Babylon.js broad superiority", "broadSuperiority.babylonjs", completionContext(externalEvidence, ["final-external-parity-audits"])),
    criterionFromField("unity-parity", "Unity parity", "tests/reports/v4-unity-unreal-parity.json", "unityParity", unityUnreal?.unityParity === true, [
      "tests/reports/v4-unity-unreal-parity.json",
      "tests/reports/v4-external-engine-baselines.json",
    ], violationsForPrefix(unityUnreal, "Unity baseline:"), completionContext(externalEvidence, ["unity-external-baselines"])),
    criterionFromField("unreal-parity", "Unreal parity", "tests/reports/v4-unity-unreal-parity.json", "unrealParity", unityUnreal?.unrealParity === true, [
      "tests/reports/v4-unity-unreal-parity.json",
      "tests/reports/v4-external-engine-baselines.json",
    ], violationsForPrefix(unityUnreal, "Unreal baseline:"), completionContext(externalEvidence, ["unreal-external-baselines"])),
    criterionFromField("unity-unreal-replacement", "Unity/Unreal replacement", "tests/reports/v4-unity-unreal-parity.json", "replacement", unityUnreal?.replacement === true, [
      "tests/reports/v4-unity-unreal-parity.json",
    ], stringArray(unityUnreal?.violations), completionContext(externalEvidence, ["unity-external-baselines", "unreal-external-baselines", "final-external-parity-audits"])),
    criterionFromField("production-readiness", "Production readiness", "tests/reports/v4-production-readiness.json", "productionReady", production?.productionReady === true, [
      "tests/reports/v4-production-readiness.json",
      "tests/reports/public-demo-deployment-smoke.json",
      "tests/reports/package-provenance.json",
    ], stringArray(production?.violations), completionContext(externalEvidence, ["durable-public-demo-deployment", "final-external-parity-audits"])),
    criterionFromField("full-pbr-parity", "Full PBR parity", "tests/reports/v4-pbr-gltf-readiness.json", "pbrParity", pbrGltf?.pbrParity === true, [
      "tests/reports/v4-pbr-gltf-readiness.json",
      "tests/reports/v4-pbr-reference-readiness.json",
      "tests/reports/v4-pbr-visual-parity.json",
    ], stringArray(pbrGltf?.pbrBlockers), completionContext(externalEvidence, ["external-physical-pbr-reference-parity"])),
    criterionFromField("full-gltf-parity", "Full glTF parity", "tests/reports/v4-pbr-gltf-readiness.json", "gltfParity", pbrGltf?.gltfParity === true, [
      "tests/reports/v4-pbr-gltf-readiness.json",
      "tests/reports/v4-gltf-loader-visual-parity.json",
      "tests/reports/v4-khronos-gltf-visuals.json",
    ], stringArray(pbrGltf?.gltfBlockers), {
      localEvidence: ["The PBR/glTF readiness report sets gltfParity=true for the audited V4 glTF loader and visual corpus scope."],
      requiredExternalEvidence: ["Keep same-corpus export and report freshness evidence current before making release claims."],
    }),
    criterionFromField("full-webgpu-parity", "Full WebGPU parity", "tests/reports/v4-webgpu-parity.json", "fullWebGPUParity + required evidence matrix", webgpuFullParityBlockers(webgpu).length === 0, [
      "tests/reports/v4-webgpu-parity.json",
      "tests/reports/webgpu-hardware-matrix.json",
    ], webgpuFullParityBlockers(webgpu), {
      localEvidence: ["The WebGPU parity report must include a real hardware matrix, adapter/device proof, native WebGPU render/readback evidence, and feature validations before the boolean is trusted."],
      requiredExternalEvidence: ["Run the WebGPU hardware matrix on real WebGPU-capable browsers/devices whenever release hardware coverage changes."],
    }),
    criterionFromField("production-hdr-render-target-parity", "Production HDR/render-target parity", "tests/reports/v4-hdr-render-target-readiness.json", "hdrRenderTargetParity", hdr?.hdrRenderTargetParity === true, [
      "tests/reports/v4-hdr-render-target-readiness.json",
      "tests/reports/v4-hdr-visual-parity.json",
    ], stringArray(hdr?.blockedEvidence), completionContext(externalEvidence, ["unity-external-baselines", "unreal-external-baselines"])),
    criterionFromField("production-shadow-map-parity", "Production shadow-map parity", "tests/reports/v4-shadow-map-readiness.json", "shadowMapParity", shadow?.shadowMapParity === true, [
      "tests/reports/v4-shadow-map-readiness.json",
      "tests/reports/v4-shadow-visual-parity.json",
    ], stringArray(shadow?.blockedEvidence), completionContext(externalEvidence, ["unity-external-baselines", "unreal-external-baselines"])),
    criterionFromField("full-postprocess-suite-parity", "Full postprocess-suite parity", "tests/reports/v4-postprocess-suite.json", "postprocessSuiteParity", postprocess?.postprocessSuiteParity === true, [
      "tests/reports/v4-postprocess-suite.json",
      "tests/reports/v4-rendering.json",
    ], stringArray(postprocess?.blockedEffects), completionContext(externalEvidence, ["unity-external-baselines", "unreal-external-baselines"])),
    renderedProductCriterion(productVisual, externalEvidence),
  ];
  const missingCriteria = criteria.filter((entry) => !entry.achieved);
  const violations = missingCriteria.flatMap((entry) =>
    entry.blockers.length > 0
      ? entry.blockers.map((blocker) => `${entry.id}: ${blocker}`)
      : [`${entry.id}: ${entry.gateReport} does not set ${entry.gateField}=true`]
  );
  const report: V4CompletionAuditReport = {
    ...baseReport(root, {
      ok: missingCriteria.length === 0,
      command: "pnpm audit:v4-completion",
      runIdPrefix: "v4-completion-audit",
      sourceFiles,
      violations,
    }),
    auditComplete: true,
    completionRunbookPath,
    externalEvidenceRunbookPath,
    objective,
    achievedCriteria: criteria.length - missingCriteria.length,
    totalCriteria: criteria.length,
    criteria,
    missingCriteria,
    violations,
  };
  writeJson(root, reportPath, report);
  writeCompletionRunbook(root, report, externalEvidence);
  return report;
}

function writeCompletionRunbook(
  root: string,
  report: V4CompletionAuditReport,
  externalEvidence: Record<string, unknown> | null
): void {
  const absolutePath = join(root, completionRunbookPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, completionRunbookSource(report, externalEvidence));
}

function completionRunbookSource(report: V4CompletionAuditReport, externalEvidence: Record<string, unknown> | null): string {
  const summary = isRecord(externalEvidence?.summary) ? externalEvidence.summary : {};
  const readyArtifacts = typeof summary.readyArtifacts === "number" ? summary.readyArtifacts : undefined;
  const totalArtifacts = typeof summary.totalArtifacts === "number" ? summary.totalArtifacts : undefined;
  const blockedArtifacts = typeof summary.blockedArtifacts === "number" ? summary.blockedArtifacts : undefined;
  const firstBlockedArtifact = typeof summary.firstBlockedArtifact === "string" ? summary.firstBlockedArtifact : undefined;
  return `# V4 Completion Audit Runbook

Generated by \`pnpm audit:v4-completion\` from \`${reportPath}\`.

Do not claim completion, broad superiority, Unity/Unreal parity, production readiness, or replacement language until every criterion below is achieved and report freshness passes.

## Summary

- Audit ready: ${report.ok ? "yes" : "no"}
- Achieved criteria: ${report.achievedCriteria} / ${report.totalCriteria}
- Missing criteria: ${report.missingCriteria.length}
- External evidence artifact readiness: ${readyArtifacts ?? "unknown"} / ${totalArtifacts ?? "unknown"}
- Blocked external artifacts: ${blockedArtifacts ?? "unknown"}
${firstBlockedArtifact ? `- First blocked external artifact: \`${firstBlockedArtifact}\`\n` : ""}
## Objective

${report.objective.map((entry) => `- ${entry}`).join("\n")}

## Prompt-To-Artifact Checklist

${report.criteria.map(criterionRunbookSection).join("\n")}

## Required Final Commands

- \`pnpm status:v4-local-port\`
- \`pnpm status:v4-parity\`
- \`pnpm prepare:v4-external-evidence-handoff\`
- \`pnpm preflight:v4-parity\`
- \`pnpm refresh:v4-readiness-reports\`
- \`pnpm verify:v4\`
- \`pnpm verify:v4-report-freshness\`
- \`pnpm audit:v4-external-evidence-readiness\`
- \`pnpm audit:v4-broad-parity\`
- \`pnpm audit:v4-completion\`

## External Artifact Runbook

Use \`${externalEvidenceRunbookPath}\` for the concrete Unity, Unreal, public deployment, and final-audit files that still need to be produced. Completion remains blocked until that runbook reports \`Blocked artifacts: 0\`.
`;
}

function criterionRunbookSection(entry: CompletionCriterion): string {
  const status = entry.achieved ? "achieved" : "blocked";
  const evidence = entry.evidencePaths.length > 0
    ? entry.evidencePaths.map((path) => `  - \`${path}\``).join("\n")
    : "  - none";
  const localEvidence = entry.localEvidence.length > 0
    ? entry.localEvidence.map((evidence) => `  - ${evidence}`).join("\n")
    : "  - none";
  const requiredExternalEvidence = entry.requiredExternalEvidence.length > 0
    ? entry.requiredExternalEvidence.map((evidence) => `  - ${evidence}`).join("\n")
    : "  - none";
  const blockers = entry.blockers.length > 0
    ? entry.blockers.map((blocker) => `  - ${blocker}`).join("\n")
    : "  - none";
  return `### ${entry.id}

- Requested claim: ${entry.requestedClaim}
- Status: ${status}
- Blocker type: ${entry.blockerType}
- Gate report: \`${entry.gateReport}\`
- Required gate field: \`${entry.gateField}\`
- Evidence paths:
${evidence}
- Local evidence already present:
${localEvidence}
- External evidence still required:
${requiredExternalEvidence}
- Blockers:
${blockers}
`;
}

function criterionFromBroadClaim(
  broad: Record<string, unknown> | null,
  id: string,
  requestedClaim: string,
  gateField: string,
  context: CompletionCriterionContext = {}
): CompletionCriterion {
  const claim = Array.isArray(broad?.claims)
    ? broad.claims.find((entry) => isRecord(entry) && entry.id === id)
    : undefined;
  return criterionFromField(id, requestedClaim, "tests/reports/v4-broad-parity-readiness.json", gateField, isRecord(claim) && claim.ready === true, [
    "tests/reports/v4-broad-parity-readiness.json",
    "tests/reports/v4-engine-comparison.json",
  ], isRecord(claim) ? stringArray(claim.blockers) : ["broad parity claim row is missing"], {
    localEvidence: [
      ...(isRecord(claim) && claim.ready === true ? [`The broad parity readiness report marks ${id} ready.`] : []),
      ...stringArray(context.localEvidence),
    ],
    requiredExternalEvidence: [
      "All lower-level parity gates must be achieved before any broad superiority claim is valid.",
      ...stringArray(context.requiredExternalEvidence),
    ],
  });
}

function renderedProductCriterion(productVisual: Record<string, unknown> | null, externalEvidence: Record<string, unknown> | null): CompletionCriterion {
  const rendered = isRecord(productVisual?.renderedProductVisualParity) ? productVisual.renderedProductVisualParity : {};
  const missing = ["threejs", "babylon", "unity", "unreal"].filter((engine) => rendered[engine] !== true);
  return criterionFromField(
    "rendered-product-visual-parity",
    "Rendered product visual parity against Three.js/Babylon/Unity/Unreal",
    "tests/reports/v4-product-visual-parity.json",
    "renderedProductVisualParity.{threejs,babylon,unity,unreal}",
    productVisual?.visualParityReady === true && missing.length === 0,
    [
      "tests/reports/v4-product-visual-parity.json",
      "tests/reports/v4-unity-product-visual-baseline.json",
      "tests/reports/v4-unreal-product-visual-baseline.json",
    ],
    [
      ...missing.map((engine) => `missing renderedProductVisualParity.${engine}=true`),
      ...stringArray(productVisual?.violations),
    ],
    completionContext(externalEvidence, ["unity-unreal-rendered-product-visual-parity"])
  );
}

interface CompletionCriterionContext {
  readonly localEvidence?: readonly string[];
  readonly requiredExternalEvidence?: readonly string[];
}

function criterionFromField(
  id: string,
  requestedClaim: string,
  gateReport: string,
  gateField: string,
  achieved: boolean,
  evidencePaths: readonly string[],
  blockers: readonly string[],
  context: CompletionCriterionContext = {}
): CompletionCriterion {
  const localEvidence = uniqueStrings([
    ...stringArray(context.localEvidence),
    ...(achieved ? [`${gateReport} sets ${gateField} true for the audited scope.`] : []),
  ]);
  const requiredExternalEvidence = uniqueStrings(stringArray(context.requiredExternalEvidence));
  return {
    id,
    requestedClaim,
    gateReport,
    gateField,
    achieved,
    blockerType: blockerTypeFor(achieved, blockers, requiredExternalEvidence),
    evidencePaths,
    localEvidence,
    requiredExternalEvidence,
    blockers: achieved ? [] : blockers,
  };
}

function completionContext(
  externalEvidence: Record<string, unknown> | null,
  areaIds: readonly string[]
): CompletionCriterionContext {
  const areas = Array.isArray(externalEvidence?.areas) ? externalEvidence.areas.filter(isRecord) : [];
  const selected = areas.filter((area) => typeof area.id === "string" && areaIds.includes(area.id));
  return {
    localEvidence: uniqueStrings(selected.flatMap((area) => stringArray(area.localEvidence))),
    requiredExternalEvidence: uniqueStrings(selected.flatMap((area) => stringArray(area.requiredExternalEvidence))),
  };
}

function blockerTypeFor(
  achieved: boolean,
  blockers: readonly string[],
  requiredExternalEvidence: readonly string[]
): "none" | "local" | "external" | "mixed" {
  if (achieved) return "none";
  if (requiredExternalEvidence.length === 0) return "local";
  return blockers.length === 0 ? "external" : "mixed";
}

function webgpuFullParityBlockers(report: Record<string, unknown> | null): string[] {
  const supportedEvidence = new Set(stringArray(report?.supportedEvidence));
  const blockedEvidence = stringArray(report?.blockedEvidence);
  const explicitBlockers = stringArray(report?.fullWebGPUParityBlockers);
  const validations = Array.isArray(report?.validations) ? report.validations.filter(isRecord) : [];
  const passedValidationIds = new Set(validations.flatMap((entry) => entry.passed === true && typeof entry.id === "string" ? [entry.id] : []));
  const hardwareMatrix = isRecord(report?.hardwareMatrix) ? report.hardwareMatrix : {};
  const requiredEvidence = [
    "real-webgpu-hardware-matrix-probe",
    "real-navigator-gpu-adapter-device-evidence",
    "real-webgpu-render-target-readback-evidence",
    "real-webgpu-render-device-feature-matrix-evidence",
    "real-webgpu-webgl2-feature-matrix-conformance",
    "native-webgpu-render-pass-submission-evidence",
    "native-webgpu-material-wgsl-pbr-shader-evidence",
    "native-webgpu-texture-to-buffer-readback-evidence",
    "native-webgpu-texture-binding-evidence",
    "real-webgpu-pbr-forward-pass-evidence",
    "real-webgpu-textured-pbr-forward-pass-evidence",
    "real-webgpu-environment-pbr-forward-pass-evidence",
    "real-webgpu-instanced-pbr-forward-pass-evidence",
    "real-webgpu-skinned-forward-pass-evidence",
    "real-webgpu-morph-forward-pass-evidence",
    "real-webgpu-shadow-map-forward-pass-evidence",
    "real-webgpu-hdr-render-target-postprocess-evidence",
    "real-webgpu-compute-particle-evidence",
    "real-webgpu-production-renderer-feature-matrix",
  ] as const;
  const requiredValidations = [
    "real-hardware-matrix-probe",
    "real-adapter-device-evidence",
    "real-render-target-readback-evidence",
    "real-render-device-feature-matrix-evidence",
    "real-webgpu-webgl2-feature-matrix-conformance",
    "native-webgpu-render-pass-submission",
    "native-webgpu-material-wgsl-pbr-shader",
    "native-webgpu-texture-to-buffer-readback",
    "native-webgpu-texture-binding",
    "real-webgpu-pbr-forward-pass",
    "real-webgpu-textured-pbr-forward-pass",
    "real-webgpu-environment-pbr-forward-pass",
    "real-webgpu-instanced-pbr-forward-pass",
    "real-webgpu-skinned-forward-pass",
    "real-webgpu-morph-forward-pass",
    "real-webgpu-shadow-map-forward-pass",
    "real-webgpu-hdr-render-target-postprocess",
    "real-compute-particle-evidence",
    "full-webgpu-parity-boundary",
  ] as const;
  return [
    ...(report?.ok === true ? [] : ["v4-webgpu-parity report is missing or failing"]),
    ...(report?.fullWebGPUParity === true ? [] : ["v4-webgpu-parity report does not set fullWebGPUParity=true"]),
    ...(explicitBlockers.length === 0 ? [] : explicitBlockers),
    ...(blockedEvidence.length === 0 ? [] : blockedEvidence.map((entry) => `blocked WebGPU evidence remains: ${entry}`)),
    ...(hardwareMatrix.present === true && hardwareMatrix.realDeviceAvailable === true ? [] : ["real WebGPU hardware matrix does not prove an available adapter/device"]),
    ...(hardwareMatrix.allResultsSupported === true ? [] : [`real WebGPU hardware matrix contains unsupported adapter/device probe results: ${Number(hardwareMatrix.unsupportedResultCount ?? 0)}`]),
    ...requiredEvidence.flatMap((entry) => supportedEvidence.has(entry) ? [] : [`missing WebGPU supported evidence: ${entry}`]),
    ...requiredValidations.flatMap((entry) => passedValidationIds.has(entry) ? [] : [`missing passing WebGPU validation: ${entry}`]),
  ];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((entry) => entry.trim().length > 0))];
}

function violationsForPrefix(report: Record<string, unknown> | null, prefix: string): string[] {
  const violations = stringArray(report?.violations).filter((entry) => entry.includes(prefix));
  return violations.length > 0 ? violations : stringArray(report?.violations);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4CompletionAuditReport();
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    achievedCriteria: report.achievedCriteria,
    totalCriteria: report.totalCriteria,
    missingCriteria: report.missingCriteria.map((entry) => entry.id),
    report: reportPath,
  }, null, 2));
}
