import { fileURLToPath } from "node:url";
import { baseReport, isRecord, readJson, writeJson } from "../external-parity-reporting/index.js";

export type ExternalParityBroadParityClaimId =
  | "threejs-broad-superiority"
  | "babylonjs-broad-superiority"
  | "unity-parity"
  | "unreal-parity"
  | "unity-unreal-replacement"
  | "production-readiness"
  | "full-pbr-parity"
  | "full-gltf-parity"
  | "full-webgpu-parity"
  | "production-hdr-render-target-parity"
  | "production-shadow-map-parity"
  | "full-postprocess-suite-parity"
  | "rendered-product-visual-parity";

export interface ExternalParityBroadParityClaimReadiness {
  readonly id: ExternalParityBroadParityClaimId;
  readonly claim: string;
  readonly ready: boolean;
  readonly requiredEvidence: readonly string[];
  readonly evidencePaths: readonly string[];
  readonly blockers: readonly string[];
}

export interface ExternalParitySupportedNarrowClaim {
  readonly id: string;
  readonly status: "supported";
  readonly claim: string;
  readonly evidencePaths: readonly string[];
  readonly exclusions: readonly string[];
}

export interface ExternalParityObjectiveCompletionChecklistItem {
  readonly requirement: string;
  readonly claimId: ExternalParityBroadParityClaimId;
  readonly successCriteria: readonly string[];
  readonly requiredCommands: readonly string[];
  readonly evidencePaths: readonly string[];
  readonly status: "ready" | "blocked";
  readonly acceptedEvidence: readonly string[];
  readonly missingOrWeakEvidence: readonly string[];
}

const reportPath = "tests/reports/external-parity-broad-parity-readiness.json";
const comparisonPaths = [
  "tests/reports/external-parity-comparison-threejs.json",
  "tests/reports/external-parity-comparison-babylon.json",
] as const;
const sourceFiles = [
  "tools/external-parity-broad-parity-readiness/index.ts",
  "docs/project/product-studio-decision-gates.md",
  "docs/project/documentation-index.md",
  "docs/project/migration.md",
  "tests/reports/external-parity-current-capability.json",
  "tests/reports/external-parity-rendering.json",
  "tests/reports/external-parity-asset-corpus.json",
  "tests/reports/external-parity-engine-comparison.json",
  "tests/reports/external-parity-comparison-threejs.json",
  "tests/reports/external-parity-comparison-babylon.json",
  "tests/reports/external-parity-production-readiness.json",
  "tests/reports/external-parity-unity-unreal-parity.json",
  "tests/reports/external-parity-product-visual-parity.json",
  "tests/reports/external-parity-postprocess-suite.json",
  "tests/reports/external-parity-shadow-map-readiness.json",
  "tests/reports/external-parity-hdr-render-target-readiness.json",
  "tests/reports/external-parity-pbr-gltf-readiness.json",
  "tests/reports/external-parity-webgpu-parity.json",
  "tests/reports/external-parity-ecosystem-readiness.json",
] as const;

export function createExternalParityBroadParityReadinessReport(root = process.cwd()) {
  const currentCapability = readJson(root, "tests/reports/external-parity-current-capability.json");
  const rendering = readJson(root, "tests/reports/external-parity-rendering.json");
  const assets = readJson(root, "tests/reports/external-parity-asset-corpus.json");
  const comparison = readJson(root, "tests/reports/external-parity-engine-comparison.json");
  const three = readJson(root, "tests/reports/external-parity-comparison-threejs.json");
  const babylon = readJson(root, "tests/reports/external-parity-comparison-babylon.json");
  const production = readJson(root, "tests/reports/external-parity-production-readiness.json");
  const unityUnreal = readJson(root, "tests/reports/external-parity-unity-unreal-parity.json");
  const webgpu = readJson(root, "tests/reports/external-parity-webgpu-parity.json");
  const productVisualParity = readJson(root, "tests/reports/external-parity-product-visual-parity.json");
  const postprocessSuite = readJson(root, "tests/reports/external-parity-postprocess-suite.json");
  const shadowMapReadiness = readJson(root, "tests/reports/external-parity-shadow-map-readiness.json");
  const hdrRenderTargetReadiness = readJson(root, "tests/reports/external-parity-hdr-render-target-readiness.json");
  const pbrGltfReadiness = readJson(root, "tests/reports/external-parity-pbr-gltf-readiness.json");

  const claims: ExternalParityBroadParityClaimReadiness[] = [
    broadEngineClaim("threejs-broad-superiority", "Three.js broad superiority.", "threejs", three),
    broadEngineClaim("babylonjs-broad-superiority", "Babylon.js broad superiority.", "babylonjs", babylon),
    externalParityClaim("unity-parity", "Unity parity.", unityUnreal, "unityParity"),
    externalParityClaim("unreal-parity", "Unreal parity.", unityUnreal, "unrealParity"),
    externalParityClaim("unity-unreal-replacement", "Unity/Unreal replacement.", unityUnreal, "replacement"),
    reportBackedClaim("production-readiness", "Production readiness.", production, [
      "independent clean-checkout reproduction on another machine or agent",
      "public release/package readiness evidence",
      "security/support/versioning/deployment evidence",
      "no production-readiness blockers",
    ], ["tests/reports/external-parity-production-readiness.json"], ["productionReady"]),
    reportBackedClaim("full-pbr-parity", "Full PBR parity.", pbrGltfReadiness, [
      "clearcoat/transmission/sheen visual parity",
      "HDR IBL parity",
      "same-scene material pixel parity against competitors",
      "no PBR unsupported-feature blockers in comparison reports",
    ], ["tests/reports/external-parity-pbr-gltf-readiness.json"], ["pbrParity"]),
    reportBackedClaim("full-gltf-parity", "Full glTF parity.", pbrGltfReadiness, [
      "full Khronos glTF corpus visual parity",
      "skinning and morph visual parity",
      "extension coverage parity with Three.js/Babylon loaders",
      "no glTF unsupported-feature blockers in comparison reports",
    ], ["tests/reports/external-parity-pbr-gltf-readiness.json"], ["gltfParity"]),
    webgpuParityClaim(webgpu),
    reportBackedClaim("production-hdr-render-target-parity", "Production HDR/render-target parity.", hdrRenderTargetReadiness, [
      "floating-point HDR render targets",
      "HDR tonemapping pipeline with real scene screenshots",
      "HDR IBL resources and comparison evidence",
    ], ["tests/reports/external-parity-hdr-render-target-readiness.json"], ["hdrRenderTargetParity"]),
    reportBackedClaim("production-shadow-map-parity", "Production shadow-map parity.", shadowMapReadiness, [
      "production forward-pass shadow sampling",
      "stable directional, point, spot, and cascaded shadow evidence",
      "same-scene lit/shadow pixel parity against competitors",
    ], ["tests/reports/external-parity-shadow-map-readiness.json"], ["shadowMapParity"]),
    reportBackedClaim("full-postprocess-suite-parity", "Full postprocess-suite parity.", postprocessSuite, [
      "real-scene bloom, FXAA, color grading, DOF, chromatic aberration, film grain, motion blur, vignette, and sharpening evidence",
      "same-scene postprocess visual parity against competitors",
      "no blocked postprocess effects",
    ], ["tests/reports/external-parity-postprocess-suite.json"], ["postprocessSuiteParity"]),
    renderedProductVisualParityClaim(three, babylon, comparison, productVisualParity),
  ];

  const blockers = claims.flatMap((claim) => claim.ready ? [] : claim.blockers.map((blocker) => `${claim.id}: ${blocker}`));
  const supportedNarrowClaims = supportedNarrowClaimsFromComparison(comparison);
  const objectiveCompletionAudit = objectiveCompletionChecklist(claims);
  const blockedBroadLanguage = blockedLanguageForClaims(claims);
  const nextEvidenceRequired = nextEvidenceForClaims(claims);
  const report = {
    ...baseReport(root, {
      ok: blockers.length === 0,
      command: "pnpm audit:external-parity-broad-parity",
      runIdPrefix: "external-parity-broad-parity-readiness",
      sourceFiles,
      violations: blockers,
    }),
    claimReady: blockers.length === 0,
    claims,
    objectiveCompletionAudit: {
      objective: "Claim broad Three.js/Babylon superiority, Unity parity, Unreal parity, Unity/Unreal replacement, production readiness, and full PBR/glTF/WebGPU/HDR/shadow/postprocess/product visual parity.",
      complete: objectiveCompletionAudit.every((item) => item.status === "ready"),
      checklist: objectiveCompletionAudit,
      completionRule: "Every checklist item must be ready; passing proxy verifiers or supported narrow benchmark claims are insufficient by themselves.",
    },
    supportedNarrowClaims,
    claimGuidance: {
      useOnlyTheseClaimsWithoutAdditionalEvidence: supportedNarrowClaims.map((claim) => claim.claim),
      blockedBroadLanguage,
      nextEvidenceRequired,
    },
    summary: {
      totalClaims: claims.length,
      readyClaims: claims.filter((claim) => claim.ready).length,
      blockedClaims: claims.filter((claim) => !claim.ready).length,
      supportedNarrowClaims: supportedNarrowClaims.length,
      currentExternalParityCapabilityOk: currentCapability?.ok === true,
    },
  };
  return report;
}

function webgpuParityClaim(webgpu: Record<string, unknown> | null): ExternalParityBroadParityClaimReadiness {
  const evidenceBlockers = webgpuFullParityEvidenceBlockers(webgpu);
  return readiness({
    id: "full-webgpu-parity",
    claim: "Full WebGPU parity.",
    requiredEvidence: [
      "real hardware adapter/device/browser evidence",
      "WebGPU triangle, render target, readback, instancing, particles, and compute evidence",
      "WebGPU/WebGL feature parity matrix without blocked compute/runtime rows",
    ],
    evidencePaths: ["tests/reports/external-parity-webgpu-parity.json", "tests/reports/webgpu-hardware-matrix.json"],
    checks: evidenceBlockers.length === 0
      ? [[true, ""]]
      : evidenceBlockers.map((blocker) => [false, blocker] as const),
  });
}

function blockedLanguageForClaims(claims: readonly ExternalParityBroadParityClaimReadiness[]): readonly string[] {
  const labels: Partial<Record<ExternalParityBroadParityClaimId, readonly string[]>> = {
    "threejs-broad-superiority": ["better than Three.js"],
    "babylonjs-broad-superiority": ["better than Babylon.js"],
    "unity-parity": ["Unity parity"],
    "unreal-parity": ["Unreal parity"],
    "unity-unreal-replacement": ["Unity replacement", "Unreal replacement"],
    "production-readiness": ["production ready"],
    "full-pbr-parity": ["complete PBR parity"],
    "full-gltf-parity": ["complete glTF parity"],
    "full-webgpu-parity": ["full WebGPU parity"],
    "production-hdr-render-target-parity": ["full HDR/render-target parity"],
    "production-shadow-map-parity": ["production shadow-map parity"],
    "full-postprocess-suite-parity": ["full postprocess-suite parity"],
    "rendered-product-visual-parity": ["rendered product visual parity against Three.js/Babylon/Unity/Unreal"],
  };
  return [...new Set(claims.flatMap((claim) => claim.ready ? [] : labels[claim.id] ?? [claim.claim]))];
}

function nextEvidenceForClaims(claims: readonly ExternalParityBroadParityClaimReadiness[]): readonly string[] {
  const evidence = new Set<string>();
  for (const claim of claims) {
    if (claim.ready) continue;
    for (const required of claim.requiredEvidence) evidence.add(required);
  }
  return [...evidence];
}

function objectiveCompletionChecklist(claims: readonly ExternalParityBroadParityClaimReadiness[]): readonly ExternalParityObjectiveCompletionChecklistItem[] {
  return claims.map((claim) => {
    const requiredCommands = requiredCommandsForClaim(claim.id);
    return {
      requirement: claim.claim,
      claimId: claim.id,
      successCriteria: claim.requiredEvidence,
      requiredCommands,
      evidencePaths: claim.evidencePaths,
      status: claim.ready ? "ready" : "blocked",
      acceptedEvidence: claim.ready
        ? [
          `All required commands passed: ${requiredCommands.join(", ")}`,
          `All required evidence files passed claim gates: ${claim.evidencePaths.join(", ")}`,
        ]
        : [],
      missingOrWeakEvidence: claim.blockers,
    };
  });
}

function requiredCommandsForClaim(id: ExternalParityBroadParityClaimId): readonly string[] {
  switch (id) {
    case "threejs-broad-superiority":
    case "babylonjs-broad-superiority":
      return ["pnpm verify:external-parity-benchmarks", "pnpm audit:external-parity-broad-parity", "pnpm verify:external-parity-report-freshness"];
    case "unity-parity":
    case "unreal-parity":
    case "unity-unreal-replacement":
      return ["pnpm verify:external-parity-external-engine-baselines", "pnpm audit:external-parity-product-visual-parity", "pnpm audit:external-parity-unity-unreal-parity", "pnpm audit:external-parity-broad-parity"];
    case "production-readiness":
      return ["pnpm verify:external-parity", "A3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment", "pnpm audit:external-parity-production-readiness", "pnpm audit:external-parity-broad-parity"];
    case "full-pbr-parity":
      return ["pnpm audit:external-parity-pbr-visual-parity", "pnpm audit:external-parity-pbr-reference-readiness", "pnpm audit:external-parity-pbr-gltf-readiness", "pnpm audit:external-parity-broad-parity"];
    case "full-gltf-parity":
      return ["pnpm verify:external-parity-assets", "pnpm verify:external-parity-khronos-visuals", "pnpm audit:external-parity-gltf-loader-visual-parity", "pnpm audit:external-parity-pbr-gltf-readiness", "pnpm audit:external-parity-broad-parity"];
    case "full-webgpu-parity":
      return ["pnpm verify:external-parity-rendering", "pnpm audit:external-parity-broad-parity"];
    case "production-hdr-render-target-parity":
      return ["pnpm verify:external-parity-rendering", "pnpm audit:external-parity-hdr-visual-parity", "pnpm audit:external-parity-hdr-render-target-readiness", "pnpm audit:external-parity-broad-parity"];
    case "production-shadow-map-parity":
      return ["pnpm verify:external-parity-rendering", "pnpm audit:external-parity-shadow-visual-parity", "pnpm audit:external-parity-shadow-map-readiness", "pnpm audit:external-parity-broad-parity"];
    case "full-postprocess-suite-parity":
      return ["pnpm verify:external-parity-rendering", "pnpm audit:external-parity-postprocess-suite", "pnpm audit:external-parity-broad-parity"];
    case "rendered-product-visual-parity":
      return ["pnpm audit:external-parity-product-visual-parity", "pnpm audit:external-parity-unity-unreal-parity", "pnpm audit:external-parity-broad-parity"];
  }
}

function broadEngineClaim(id: ExternalParityBroadParityClaimId, claim: string, engine: "threejs" | "babylonjs", report: Record<string, unknown> | null): ExternalParityBroadParityClaimReadiness {
  const unsupported = stringArray(report?.unsupportedByThisReport);
  const requiredMarker = engine === "threejs" ? "broad better-than-Three.js claims" : "broad better-than-Babylon.js claims";
  const broadSuperiority = isRecord(report?.broadSuperiority) ? report.broadSuperiority : {};
  const detailedBlockers = stringArray(broadSuperiority.blockers)
    .filter((blocker) => blocker.startsWith(engine === "threejs" ? "Three.js:" : "Babylon.js:"));
  return readiness({
    id,
    claim,
    requiredEvidence: [
      "claimUsable is true in the competitor comparison report",
      "report removes the broad-superiority unsupported marker",
      "same-scene visual, feature, runtime, memory, bundle, loader, tooling, ecosystem, and device-class outcomes prove a broad win",
      "independent reproduction confirms the result",
    ],
    evidencePaths: [`tests/reports/external-parity-comparison-${engine === "threejs" ? "threejs" : "babylon"}.json`],
    checks: [
      [report?.ok === true, "comparison report is missing or failing"],
      [report?.claimUsable === true, "comparison report sets claimUsable=false"],
      [!unsupported.includes(requiredMarker), `comparison report still lists unsupported marker: ${requiredMarker}`],
      [broadSuperiority[engine] === true, [
        `comparison report has no explicit broadSuperiority.${engine}=true evidence`,
        ...detailedBlockers,
      ].join(" | ")],
    ],
  });
}

function externalParityClaim(id: ExternalParityBroadParityClaimId, claim: string, report: Record<string, unknown> | null, evidenceKey: string): ExternalParityBroadParityClaimReadiness {
  return readiness({
    id,
    claim,
    requiredEvidence: [
      "dedicated Unity/Unreal workflow comparison report exists",
      "editor authoring, import, scene workflow, play mode, deployment, profiling, runtime systems, and visual output are compared",
      "unsupported workflow gaps are absent",
      "independent reproduction confirms the result",
    ],
    evidencePaths: ["tests/reports/external-parity-unity-unreal-parity.json"],
    checks: [
      [report?.ok === true, "Unity/Unreal parity report is missing or failing"],
      [report?.[evidenceKey] === true, `Unity/Unreal parity report lacks ${evidenceKey}=true`],
    ],
  });
}

function featureParityClaim(
  id: ExternalParityBroadParityClaimId,
  claim: string,
  rendering: Record<string, unknown> | null,
  assets: Record<string, unknown> | null,
  comparison: Record<string, unknown> | null,
  requiredEvidence: readonly string[],
  evidenceKeys: readonly string[],
): ExternalParityBroadParityClaimReadiness {
  return readiness({
    id,
    claim,
    requiredEvidence,
    evidencePaths: ["tests/reports/external-parity-rendering.json", "tests/reports/external-parity-asset-corpus.json", "tests/reports/external-parity-engine-comparison.json"],
    checks: [
      [rendering?.ok === true, "rendering report is missing or failing"],
      [assets?.ok === true, "asset corpus report is missing or failing"],
      [comparison?.ok === true, "engine comparison report is missing or failing"],
      ...evidenceKeys.map((key) => [comparison?.[key] === true || rendering?.[key] === true || assets?.[key] === true, `no explicit ${key}=true evidence`] as const),
    ],
  });
}

function reportBackedClaim(id: ExternalParityBroadParityClaimId, claim: string, report: Record<string, unknown> | null, requiredEvidence: readonly string[], evidencePaths: readonly string[], evidenceKeys: readonly string[]): ExternalParityBroadParityClaimReadiness {
  return readiness({
    id,
    claim,
    requiredEvidence,
    evidencePaths,
    checks: [
      [report?.ok === true, `${evidencePaths[0] ?? "required report"} is missing or failing`],
      ...evidenceKeys.map((key) => [report?.[key] === true, `required report lacks ${key}=true`] as const),
    ],
  });
}

function webgpuFullParityEvidenceBlockers(report: Record<string, unknown> | null): string[] {
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
    ...(report?.ok === true ? [] : ["tests/reports/external-parity-webgpu-parity.json is missing or failing"]),
    ...(report?.fullWebGPUParity === true ? [] : ["required report lacks fullWebGPUParity=true"]),
    ...(explicitBlockers.length === 0 ? [] : explicitBlockers),
    ...(blockedEvidence.length === 0 ? [] : blockedEvidence.map((entry) => `blocked WebGPU evidence remains: ${entry}`)),
    ...(hardwareMatrix.present === true && hardwareMatrix.realDeviceAvailable === true ? [] : ["real WebGPU hardware matrix does not prove an available adapter/device"]),
    ...(hardwareMatrix.allResultsSupported === true ? [] : [`real WebGPU hardware matrix contains unsupported adapter/device probe results: ${Number(hardwareMatrix.unsupportedResultCount ?? 0)}`]),
    ...requiredEvidence.flatMap((entry) => supportedEvidence.has(entry) ? [] : [`missing WebGPU supported evidence: ${entry}`]),
    ...requiredValidations.flatMap((entry) => passedValidationIds.has(entry) ? [] : [`missing passing WebGPU validation: ${entry}`]),
  ];
}

function renderedProductVisualParityClaim(
  three: Record<string, unknown> | null,
  babylon: Record<string, unknown> | null,
  comparison: Record<string, unknown> | null,
  productVisualParity: Record<string, unknown> | null
): ExternalParityBroadParityClaimReadiness {
  return readiness({
    id: "rendered-product-visual-parity",
    claim: "Rendered product visual parity against Three.js/Babylon/Unity/Unreal.",
    requiredEvidence: [
      "real product scenes render through Aura3D, Three.js, Babylon.js, Unity, and Unreal with the same assets, camera, lighting, material feature state, viewport, and postprocess state",
      "visual diff reports pass against each engine",
      "unsupported features are absent or explicitly excluded from the claim",
      "independent reproduction confirms the result",
    ],
    evidencePaths: [
      "tests/reports/external-parity-comparison-threejs.json",
      "tests/reports/external-parity-comparison-babylon.json",
      "tests/reports/external-parity-unity-unreal-parity.json",
      "tests/reports/external-parity-product-visual-parity.json",
    ],
    checks: [
      [comparison?.ok === true, "engine comparison report is missing or failing"],
      [productVisualParity?.ok === true, "product visual parity report is missing or failing"],
      [hasProductVisualRenderQuality(productVisualParity), "product visual parity report lacks the required 18-part/7-material same-layout render evidence"],
      [productVisualParity?.visualParityReady === true, "product visual parity report keeps broad visualParityReady=false"],
      [three?.ok === true, "Three.js comparison report is missing or failing"],
      [babylon?.ok === true, "Babylon.js comparison report is missing or failing"],
      [hasRenderedProductVisualParity(comparison, productVisualParity, "threejs"), "missing renderedProductVisualParity.threejs=true"],
      [hasRenderedProductVisualParity(comparison, productVisualParity, "babylon"), "missing renderedProductVisualParity.babylon=true"],
      [hasRenderedProductVisualParity(comparison, productVisualParity, "unity"), "missing renderedProductVisualParity.unity=true"],
      [hasRenderedProductVisualParity(comparison, productVisualParity, "unreal"), "missing renderedProductVisualParity.unreal=true"],
    ],
  });
}

function hasRenderedProductVisualParity(
  comparison: Record<string, unknown> | null,
  productVisualParity: Record<string, unknown> | null,
  engine: "threejs" | "babylon" | "unity" | "unreal"
): boolean {
  const comparisonParity = isRecord(comparison?.renderedProductVisualParity) ? comparison.renderedProductVisualParity : {};
  const productParity = isRecord(productVisualParity?.renderedProductVisualParity) ? productVisualParity.renderedProductVisualParity : {};
  return comparisonParity[engine] === true || productParity[engine] === true;
}

function hasProductVisualRenderQuality(productVisualParity: Record<string, unknown> | null): boolean {
  if (productVisualParity?.ok !== true || !Array.isArray(productVisualParity.renders) || !Array.isArray(productVisualParity.diffs)) return false;
  const descriptor = isRecord(productVisualParity.sceneDescriptor) ? productVisualParity.sceneDescriptor : {};
  const minimumEvidence = isRecord(descriptor.minimumEvidence) ? descriptor.minimumEvidence : {};
  const requiredParts = Number(minimumEvidence.productParts || 18);
  const requiredMaterials = Number(minimumEvidence.materialCount || 7);
  const requiredDrawCalls = Number(minimumEvidence.drawCalls || 18);
  const rendersPass = productVisualParity.renders.every((render) => {
    if (!isRecord(render) || !isRecord(render.metrics)) return false;
    return Number(render.metrics.productParts) >= requiredParts &&
      Number(render.metrics.materialCount) >= requiredMaterials &&
      Number(render.metrics.drawCalls) >= requiredDrawCalls &&
      Number(render.metrics.colorBuckets) >= 10;
  });
  const diffsPass = productVisualParity.diffs.every((diff) => isRecord(diff) && diff.pass === true);
  return rendersPass && diffsPass;
}

function readiness(options: {
  readonly id: ExternalParityBroadParityClaimId;
  readonly claim: string;
  readonly requiredEvidence: readonly string[];
  readonly evidencePaths: readonly string[];
  readonly checks: readonly (readonly [boolean, string])[];
}): ExternalParityBroadParityClaimReadiness {
  const blockers = options.checks.flatMap(([passed, blocker]) => passed ? [] : [blocker]);
  return {
    id: options.id,
    claim: options.claim,
    ready: blockers.length === 0,
    requiredEvidence: options.requiredEvidence,
    evidencePaths: options.evidencePaths,
    blockers,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function supportedNarrowClaimsFromComparison(comparison: Record<string, unknown> | null): ExternalParitySupportedNarrowClaim[] {
  if (!comparison || !Array.isArray(comparison.supportedNicheClaims)) return [];
  return comparison.supportedNicheClaims.flatMap((entry): ExternalParitySupportedNarrowClaim[] => {
    if (!isRecord(entry) || entry.status !== "supported" || typeof entry.id !== "string" || typeof entry.claim !== "string") {
      return [];
    }
    const evidence = isRecord(entry.evidence) ? entry.evidence : {};
    const reportPath = typeof evidence.reportPath === "string" ? evidence.reportPath : "tests/reports/external-parity-engine-comparison.json";
    return [{
      id: entry.id,
      status: "supported",
      claim: entry.claim,
      evidencePaths: [...new Set(["tests/reports/external-parity-engine-comparison.json", reportPath])],
      exclusions: stringArray(entry.exclusions),
    }];
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createExternalParityBroadParityReadinessReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    claimReady: report.claimReady,
    readyClaims: report.summary.readyClaims,
    blockedClaims: report.summary.blockedClaims,
    supportedNarrowClaims: report.summary.supportedNarrowClaims,
    report: reportPath,
  }, null, 2));
}
