export type ProductionWorkflowId = "product" | "asset" | "material" | "architecture" | "cinematic";

export interface ProductionWorkflowDefinition {
  readonly id: ProductionWorkflowId;
  readonly label: string;
  readonly requiredAssetClasses: readonly string[];
  readonly requiredRendererFeatures: readonly string[];
  readonly requiredProof: readonly string[];
  readonly differentiation: readonly string[];
}

export interface ProductionAssetPreflightInput {
  readonly id: string;
  readonly localPath?: string;
  readonly sourceUri?: string;
  readonly sha256?: string;
  readonly bytes?: number;
  readonly license?: string;
  readonly tags?: readonly string[];
  readonly renderRequirements?: readonly string[];
}

export interface ProductionAssetPreflightResult {
  readonly assetId: string;
  readonly pass: boolean;
  readonly missing: readonly string[];
  readonly warnings: readonly string[];
}

export interface ProductionVisualQAInput {
  readonly screenshotPath: string;
  readonly rendererBackend: string;
  readonly realRendererProof: boolean;
  readonly width: number;
  readonly height: number;
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly drawCalls: number;
  readonly textureMemory: number;
}

export interface ProductionVisualQAResult {
  readonly screenshotPath: string;
  readonly pass: boolean;
  readonly score: number;
  readonly failures: readonly string[];
}

export interface ProductionRendererDefaults {
  readonly workflowId: ProductionWorkflowId;
  readonly backend: "webgl2";
  readonly hdrEnvironmentId: "studio-small-08";
  readonly qualityPreset: "hdr-studio-preview";
  readonly camera: {
    readonly policy: "require";
    readonly paddingRatio: number;
    readonly yawRadians: number;
    readonly pitchRadians: number;
  };
  readonly postprocess: readonly string[];
  readonly runtimeMetrics: readonly string[];
}

export interface ProductionWorkflowPlan {
  readonly workflow: ProductionWorkflowDefinition;
  readonly defaults: ProductionRendererDefaults;
  readonly preflightRequired: true;
  readonly visualQARequired: true;
}

export const PRODUCTION_WORKFLOWS: readonly ProductionWorkflowDefinition[] = [
  {
    id: "product",
    label: "Product Configurator",
    requiredAssetClasses: ["product"],
    requiredRendererFeatures: ["real-webgl2-context", "pbr-materials", "hdr-ibl-ready", "pixel-readback"],
    requiredProof: ["imported-glb", "hdr-environment", "draw-calls", "texture-memory", "canvas-screenshot"],
    differentiation: ["runtime proof bundle", "material variant workflow", "developer metrics"]
  },
  {
    id: "asset",
    label: "Asset Inspector",
    requiredAssetClasses: ["product", "character", "material"],
    requiredRendererFeatures: ["real-webgl2-context", "imported-gltf-render-source", "pixel-readback"],
    requiredProof: ["asset metadata", "skinning-or-morph-visibility", "corpus provenance"],
    differentiation: ["asset preflight", "metadata and visual proof in one report"]
  },
  {
    id: "material",
    label: "Material Studio",
    requiredAssetClasses: ["material"],
    requiredRendererFeatures: ["pbr-materials", "hdr-ibl-ready", "texture-upload-diagnostics"],
    requiredProof: ["material-extension-metadata", "hdr-lighting", "texture bindings"],
    differentiation: ["extension coverage reporting", "visual QA score per material"]
  },
  {
    id: "architecture",
    label: "Architecture Viewer",
    requiredAssetClasses: ["architecture", "product"],
    requiredRendererFeatures: ["hdr-ibl-ready", "camera-framing", "pixel-readback"],
    requiredProof: ["day-night-environment", "camera defaults", "visual quality metrics"],
    differentiation: ["environment comparison", "inspection-ready camera defaults"]
  },
  {
    id: "cinematic",
    label: "Cinematic Postprocess",
    requiredAssetClasses: ["product"],
    requiredRendererFeatures: ["postprocess-presentation", "tone-mapping", "bloom", "fxaa"],
    requiredProof: ["postprocess-chain", "nonblank diffable screenshot", "renderer diagnostics"],
    differentiation: ["proof-backed postprocess presets", "gallery-ready output"]
  }
];

export function listProductionWorkflowDefinitions(): readonly ProductionWorkflowDefinition[] {
  return PRODUCTION_WORKFLOWS;
}

export function createProductionAssetPreflight(input: ProductionAssetPreflightInput): ProductionAssetPreflightResult {
  const renderRequirements = input.renderRequirements ?? [];
  const missing = [
    ...(!input.id ? ["id"] : []),
    ...(!input.localPath ? ["localPath"] : []),
    ...(!input.sourceUri ? ["sourceUri"] : []),
    ...(!input.sha256 ? ["sha256"] : []),
    ...(!input.license ? ["license"] : []),
    ...(!input.bytes || input.bytes <= 0 ? ["bytes"] : []),
    ...(renderRequirements.length === 0 ? ["renderRequirements"] : [])
  ];
  const warnings = [
    ...(!input.tags?.includes("pbr") ? ["Asset is not tagged as PBR; workflow may need material fallback."] : []),
    ...(!renderRequirements.includes("hdrIbl") ? ["Asset does not declare HDR IBL as an asset-specific requirement; renderer workflow must provide fallback HDR lighting proof."] : []),
    ...((input.bytes ?? 0) < 10_000 ? ["Asset is very small for visual parity proof."] : [])
  ];
  return {
    assetId: input.id,
    pass: missing.length === 0,
    missing,
    warnings
  };
}

export function createProductionVisualQAResult(input: ProductionVisualQAInput): ProductionVisualQAResult {
  const totalPixels = Math.max(1, input.width * input.height);
  const coverage = input.nonBlackPixels / totalPixels;
  const score = Number(Math.min(100, (
    (input.realRendererProof ? 22 : 0) +
    (input.rendererBackend === "webgl2" ? 12 : 0) +
    Math.min(24, coverage * 30) +
    Math.min(24, input.uniqueColorBuckets / 8) +
    Math.min(10, input.drawCalls * 1.5) +
    Math.min(8, input.textureMemory / 4_000_000)
  )).toFixed(3));
  const failures = [
    ...(!input.realRendererProof ? ["missing-real-renderer-proof"] : []),
    ...(input.rendererBackend !== "webgl2" ? ["unexpected-renderer-backend"] : []),
    ...(input.width < 128 || input.height < 128 ? ["screenshot-too-small"] : []),
    ...(input.nonBlackPixels <= 1000 ? ["blank-or-nearly-blank"] : []),
    ...(input.uniqueColorBuckets <= 4 ? ["low-color-entropy"] : []),
    ...(input.drawCalls <= 0 ? ["missing-draw-calls"] : [])
  ];
  return {
    screenshotPath: input.screenshotPath,
    pass: failures.length === 0 && score >= 40,
    score,
    failures
  };
}

export function createProductionRendererDefaults(workflowId: ProductionWorkflowId): ProductionRendererDefaults {
  const cameraByWorkflow: Record<ProductionWorkflowId, { readonly yawRadians: number; readonly pitchRadians: number; readonly paddingRatio: number }> = {
    product: { yawRadians: -0.38, pitchRadians: -0.16, paddingRatio: 0.18 },
    asset: { yawRadians: -0.34, pitchRadians: -0.14, paddingRatio: 0.2 },
    material: { yawRadians: -0.42, pitchRadians: -0.16, paddingRatio: 0.22 },
    architecture: { yawRadians: -0.52, pitchRadians: -0.2, paddingRatio: 0.24 },
    cinematic: { yawRadians: -0.36, pitchRadians: -0.14, paddingRatio: 0.18 }
  };
  const camera = cameraByWorkflow[workflowId];
  return {
    workflowId,
    backend: "webgl2",
    hdrEnvironmentId: "studio-small-08",
    qualityPreset: "hdr-studio-preview",
    camera: {
      policy: "require",
      paddingRatio: camera.paddingRatio,
      yawRadians: camera.yawRadians,
      pitchRadians: camera.pitchRadians
    },
    postprocess: ["tone-mapping", "color-grade", "bloom", "fxaa"],
    runtimeMetrics: ["appId", "sceneId", "rendererBackend", "assetIds", "hdrEnvironmentId", "drawCalls", "triangleCount", "materialCount", "textureCount", "textureMemoryEstimate", "frameTime"]
  };
}

export function createProductionWorkflowPlan(workflowId: ProductionWorkflowId): ProductionWorkflowPlan {
  const workflow = PRODUCTION_WORKFLOWS.find((item) => item.id === workflowId);
  if (!workflow) throw new Error(`Unknown Production workflow: ${workflowId}`);
  return {
    workflow,
    defaults: createProductionRendererDefaults(workflowId),
    preflightRequired: true,
    visualQARequired: true
  };
}
