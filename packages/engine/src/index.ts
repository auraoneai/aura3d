export {
  A3D_APP_WORKFLOW_PRESETS,
  createA3DApp,
  resolveA3DAppQualityPreset
} from "@aura3d/apps";
export type {
  A3DApp,
  A3DAppDiagnostics,
  A3DAppOptions,
  A3DAppQualityPreset,
  A3DAppQualitySettings,
  A3DAppWorkflowPreset
} from "@aura3d/apps";
export { Engine } from "@aura3d/core";
export {
  Renderer,
  analyzeRgbaFrameMotionRegions,
  createAnimationMaterialStyle,
  createAnimationRenderPreset,
  createAnimationVisualQualityReport,
  createExternalParityEnvironmentPipeline,
  listExternalParityEnvironmentTargets
} from "@aura3d/rendering";
export type {
  AnimationFrameVisualInput,
  AnimationFrameVisualQuality,
  AnimationMaterialStyle,
  AnimationMaterialStyleOptions,
  FrameMotionRegion,
  FrameMotionRegionMetrics,
  AnimationRenderPresetEvidence,
  AnimationRenderPresetOptions,
  AnimationVisualQualityOptions,
  AnimationVisualQualityReport
} from "@aura3d/rendering";
export {
  GLTFLoader,
  createAssetCompatibilityReport,
  inspectGLTFAsset,
  loadRenderableAsset,
  summarizeExternalParityGLTFCorpus
} from "@aura3d/assets";
export { loadProductAsset } from "@aura3d/product-studio";
export {
  createAnimationLabWorkflow,
  createAssetViewerWorkflow,
  createComparisonWorkflow,
  createInteractiveSceneWorkflow,
  createMaterialStudioWorkflow,
  createProductConfiguratorWorkflow,
  createSceneShowcaseWorkflow
} from "@aura3d/workflows";
export {
  A3DRenderer,
  A3DScene,
  A3DAppLifecycle
} from "./advanced-runtime/index.js";
export * from "./agent-api/index.js";
export * from "./runtime/index.js";
export * from "./game/index.js";
export * from "./ecs/ECSRenderSource.js";
export * from "./devtools/AuraDiagnosticsOverlay.js";
export * from "./devtools/AuraAssetPanel.js";
export * from "./devtools/AuraPerformancePanel.js";
export * from "./testing/screenshot.js";
export * from "./testing/routeHealth.js";
export type {
  A3DAppLifecycleSnapshot,
  A3DDisposable,
  A3DRendererOptions,
  A3DSceneMeshOptions,
  A3DSceneRenderSourceOptions
} from "./advanced-runtime/index.js";
// The facade decls that used to live here (workflows, createEnvironment, loadAsset,
// loadProductAssetLazy, createPostProcessComposerLazy, createMaterialVariantController,
// captureScreenshot, inspectAsset, createCompatibilityReport, createAssetDiagnostics,
// createRenderDiagnostics, createDiagnosticsPanel and their A3D* types) moved verbatim
// to ./agent-api/engineSurface.ts for the published-union surface (PRD-15 T1.4) and
// are re-exported through `export * from "./agent-api/index.js"` above.
// Aura3D Quality Rebuild contract surface (CONTRACTS.md §3.8).
export * from "./contracts/index.js";
export * from "./lanes/index.js";
