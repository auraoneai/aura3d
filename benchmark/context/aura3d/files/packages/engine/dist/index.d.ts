export { A3D_APP_WORKFLOW_PRESETS, createA3DApp, resolveA3DAppQualityPreset } from "@aura3d/apps";
export type { A3DApp, A3DAppDiagnostics, A3DAppOptions, A3DAppQualityPreset, A3DAppQualitySettings, A3DAppWorkflowPreset } from "@aura3d/apps";
export { Engine } from "@aura3d/core";
export { Renderer, createExternalParityEnvironmentPipeline, listExternalParityEnvironmentTargets } from "@aura3d/rendering";
export { GLTFLoader, createAssetCompatibilityReport, inspectGLTFAsset, loadRenderableAsset, summarizeExternalParityGLTFCorpus } from "@aura3d/assets";
export { loadProductAsset } from "@aura3d/product-studio";
export { createAnimationLabWorkflow, createAssetViewerWorkflow, createComparisonWorkflow, createInteractiveSceneWorkflow, createMaterialStudioWorkflow, createProductConfiguratorWorkflow, createSceneShowcaseWorkflow } from "@aura3d/workflows";
export { A3DRenderer, A3DScene, A3DAppLifecycle } from "./advanced-runtime/index.js";
export * from "./agent-api/index.js";
export * from "./devtools/AuraDiagnosticsOverlay.js";
export * from "./devtools/AuraAssetPanel.js";
export * from "./devtools/AuraPerformancePanel.js";
export * from "./testing/screenshot.js";
export * from "./testing/routeHealth.js";
export type { A3DAppLifecycleSnapshot, A3DDisposable, A3DRendererOptions, A3DSceneMeshOptions, A3DSceneRenderSourceOptions } from "./advanced-runtime/index.js";
import type { A3DApp } from "@aura3d/apps";
import { createAnimationLabWorkflow, createAssetViewerWorkflow, createComparisonWorkflow, createInteractiveSceneWorkflow, createMaterialStudioWorkflow, createProductConfiguratorWorkflow, createSceneShowcaseWorkflow } from "@aura3d/workflows";
import { type ExternalParityEnvironmentPipeline, type ExternalParityEnvironmentPipelineOptions, type RenderDeviceDiagnostics } from "@aura3d/rendering";
import { type AssetCompatibilityReport, type GLTFAsset, type GLTFAssetInspectionReport, type GLTFCorpusManifest, type GLTFRenderResources, type LoadRenderableAssetOptions, type RenderableAsset } from "@aura3d/assets";
export declare const workflows: {
    readonly assetViewer: typeof createAssetViewerWorkflow;
    readonly productConfigurator: typeof createProductConfiguratorWorkflow;
    readonly materialStudio: typeof createMaterialStudioWorkflow;
    readonly sceneShowcase: typeof createSceneShowcaseWorkflow;
    readonly interactiveScene: typeof createInteractiveSceneWorkflow;
    readonly animationLab: typeof createAnimationLabWorkflow;
    readonly comparison: typeof createComparisonWorkflow;
};
export type A3DWorkflowApi = typeof workflows;
export type A3DEnvironmentOptions = ExternalParityEnvironmentPipelineOptions;
export type A3DEnvironment = ExternalParityEnvironmentPipeline;
export declare function createEnvironment(options: A3DEnvironmentOptions): A3DEnvironment;
export declare function loadAsset(urlOrAsset: string | RenderableAsset, options?: LoadRenderableAssetOptions): Promise<RenderableAsset>;
export interface A3DMaterialVariantController<TVariantId extends string = string> {
    readonly current: TVariantId;
    readonly variants: readonly TVariantId[];
    setVariant(variant: TVariantId): TVariantId;
    snapshot(): {
        readonly current: TVariantId;
        readonly variants: readonly TVariantId[];
    };
}
export declare function createMaterialVariantController<TVariantId extends string>(variants: readonly TVariantId[], initialVariant?: TVariantId): A3DMaterialVariantController<TVariantId>;
export interface A3DScreenshotCapture {
    readonly mimeType: "image/png";
    readonly dataUrl: string;
    readonly width?: number;
    readonly height?: number;
}
export declare function captureScreenshot(target: HTMLCanvasElement | OffscreenCanvas | A3DApp): A3DScreenshotCapture;
export declare function inspectAsset(asset: GLTFAsset, resources?: GLTFRenderResources): GLTFAssetInspectionReport;
export declare function createCompatibilityReport(manifest: GLTFCorpusManifest): AssetCompatibilityReport;
export interface A3DAssetDiagnostics {
    readonly kind: RenderableAsset["kind"];
    readonly url?: string;
    readonly warnings: readonly string[];
    readonly unsupportedFeatures: readonly string[];
    readonly textureCount: number;
    readonly animationCount: number;
    readonly skinCount: number;
    readonly morphTargetMeshCount: number;
}
export declare function createAssetDiagnostics(asset: RenderableAsset): A3DAssetDiagnostics;
export interface A3DRenderDiagnostics {
    readonly drawCalls: number;
    readonly buffers: number;
    readonly shaders: number;
    readonly textureCount?: number;
    readonly warnings: readonly string[];
}
export declare function createRenderDiagnostics(diagnostics?: RenderDeviceDiagnostics): A3DRenderDiagnostics;
export interface A3DDiagnosticsPanel {
    readonly kind: "a3d-diagnostics-panel";
    update(next: {
        readonly render?: RenderDeviceDiagnostics;
        readonly asset?: A3DAssetDiagnostics;
    }): void;
    snapshot(): {
        readonly render: A3DRenderDiagnostics;
        readonly asset?: A3DAssetDiagnostics;
    };
}
export declare function createDiagnosticsPanel(initial?: {
    readonly render?: RenderDeviceDiagnostics;
    readonly asset?: A3DAssetDiagnostics;
}): A3DDiagnosticsPanel;
//# sourceMappingURL=index.d.ts.map