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
export { Renderer, createExternalParityEnvironmentPipeline, listExternalParityEnvironmentTargets } from "@aura3d/rendering";
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
import {
  markAuraLazySystemLoaded,
  markAuraLazySystemRequested
} from "./agent-api/index.js";
import type { A3DApp, A3DAppRendererLike } from "@aura3d/apps";
import type {
  PostProcessComposer,
  PostProcessComposerOptions
} from "@aura3d/rendering";
import type {
  ProductAsset,
  ProductAssetLoadOptions
} from "@aura3d/product-studio";
import {
  createAnimationLabWorkflow,
  createAssetViewerWorkflow,
  createComparisonWorkflow,
  createInteractiveSceneWorkflow,
  createMaterialStudioWorkflow,
  createProductConfiguratorWorkflow,
  createSceneShowcaseWorkflow
} from "@aura3d/workflows";
import {
  createExternalParityEnvironmentPipeline,
  type ExternalParityEnvironmentPipeline,
  type ExternalParityEnvironmentPipelineOptions,
  type RenderDeviceDiagnostics
} from "@aura3d/rendering";
import {
  createAssetCompatibilityReport,
  inspectGLTFAsset,
  loadRenderableAsset,
  type AssetCompatibilityReport,
  type GLTFAsset,
  type GLTFAssetInspectionReport,
  type GLTFCorpusManifest,
  type GLTFRenderResources,
  type LoadRenderableAssetOptions,
  type RenderableAsset
} from "@aura3d/assets";

export const workflows = {
  assetViewer: createAssetViewerWorkflow,
  productConfigurator: createProductConfiguratorWorkflow,
  materialStudio: createMaterialStudioWorkflow,
  sceneShowcase: createSceneShowcaseWorkflow,
  interactiveScene: createInteractiveSceneWorkflow,
  animationLab: createAnimationLabWorkflow,
  comparison: createComparisonWorkflow
} as const;

export type A3DWorkflowApi = typeof workflows;

export type A3DEnvironmentOptions = ExternalParityEnvironmentPipelineOptions;
export type A3DEnvironment = ExternalParityEnvironmentPipeline;

export function createEnvironment(options: A3DEnvironmentOptions): A3DEnvironment {
  return createExternalParityEnvironmentPipeline(options);
}

export async function loadAsset(urlOrAsset: string | RenderableAsset, options: LoadRenderableAssetOptions = {}): Promise<RenderableAsset> {
  return await loadRenderableAsset(urlOrAsset, options);
}

export async function loadProductAssetLazy(options: ProductAssetLoadOptions): Promise<ProductAsset> {
  markAuraLazySystemRequested("product-gltf-loader", "loadProductAssetLazy");
  const started = Date.now();
  const productStudio = await import("@aura3d/product-studio");
  markAuraLazySystemLoaded("product-gltf-loader", Date.now() - started);
  return productStudio.loadProductAsset(options);
}

export async function createPostProcessComposerLazy(options: PostProcessComposerOptions): Promise<PostProcessComposer> {
  markAuraLazySystemRequested("postprocess", "createPostProcessComposerLazy");
  const started = Date.now();
  const rendering = await import("@aura3d/rendering");
  markAuraLazySystemLoaded("postprocess", Date.now() - started);
  return new rendering.PostProcessComposer(options);
}

export interface A3DMaterialVariantController<TVariantId extends string = string> {
  readonly current: TVariantId;
  readonly variants: readonly TVariantId[];
  setVariant(variant: TVariantId): TVariantId;
  snapshot(): { readonly current: TVariantId; readonly variants: readonly TVariantId[] };
}

export function createMaterialVariantController<TVariantId extends string>(
  variants: readonly TVariantId[],
  initialVariant: TVariantId = variants[0] as TVariantId
): A3DMaterialVariantController<TVariantId> {
  if (variants.length === 0) throw new Error("createMaterialVariantController requires at least one variant.");
  if (!variants.includes(initialVariant)) throw new Error(`Unknown initial material variant: ${initialVariant}`);
  let current = initialVariant;
  return {
    get current() {
      return current;
    },
    variants,
    setVariant(variant: TVariantId): TVariantId {
      if (!variants.includes(variant)) throw new Error(`Unknown material variant: ${variant}`);
      current = variant;
      return current;
    },
    snapshot() {
      return { current, variants };
    }
  };
}

export interface A3DScreenshotCapture {
  readonly mimeType: "image/png";
  readonly dataUrl: string;
  readonly width?: number;
  readonly height?: number;
}

export function captureScreenshot(target: HTMLCanvasElement | OffscreenCanvas | A3DApp): A3DScreenshotCapture {
  const canvas = isA3DApp(target) ? findCanvasFromRenderer(target.renderer) : target;
  if (!canvas) throw new Error("captureScreenshot requires a canvas-backed A3D app or canvas.");
  if ("toDataURL" in canvas && typeof canvas.toDataURL === "function") {
    return {
      mimeType: "image/png",
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height
    };
  }
  throw new Error("captureScreenshot currently requires an HTMLCanvasElement. OffscreenCanvas capture should use convertToBlob in application code.");
}

export function inspectAsset(asset: GLTFAsset, resources?: GLTFRenderResources): GLTFAssetInspectionReport {
  return inspectGLTFAsset(asset, resources);
}

export function createCompatibilityReport(manifest: GLTFCorpusManifest): AssetCompatibilityReport {
  return createAssetCompatibilityReport(manifest);
}

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

export function createAssetDiagnostics(asset: RenderableAsset): A3DAssetDiagnostics {
  const gltf = asset.gltf;
  return {
    kind: asset.kind,
    ...(asset.url ? { url: asset.url } : {}),
    warnings: asset.warnings,
    unsupportedFeatures: gltf?.loaderDiagnostics.unsupportedExtensions ?? [],
    textureCount: gltf?.textures.length ?? 0,
    animationCount: gltf?.animations.length ?? 0,
    skinCount: gltf?.skins.length ?? 0,
    morphTargetMeshCount: gltf?.meshes.filter((mesh) => mesh.morphTargets.length > 0).length ?? 0
  };
}

export interface A3DRenderDiagnostics {
  readonly drawCalls: number;
  readonly buffers: number;
  readonly shaders: number;
  readonly textureCount?: number;
  readonly warnings: readonly string[];
}

export function createRenderDiagnostics(diagnostics?: RenderDeviceDiagnostics): A3DRenderDiagnostics {
  return {
    drawCalls: diagnostics?.drawCalls ?? 0,
    buffers: diagnostics?.buffers ?? 0,
    shaders: diagnostics?.shaders ?? 0,
    textureCount: diagnostics?.textures,
    warnings: diagnostics ? [] : ["No render diagnostics have been recorded yet."]
  };
}

export interface A3DDiagnosticsPanel {
  readonly kind: "a3d-diagnostics-panel";
  update(next: { readonly render?: RenderDeviceDiagnostics; readonly asset?: A3DAssetDiagnostics }): void;
  snapshot(): {
    readonly render: A3DRenderDiagnostics;
    readonly asset?: A3DAssetDiagnostics;
  };
}

export function createDiagnosticsPanel(initial: { readonly render?: RenderDeviceDiagnostics; readonly asset?: A3DAssetDiagnostics } = {}): A3DDiagnosticsPanel {
  let render = createRenderDiagnostics(initial.render);
  let asset = initial.asset;
  return {
    kind: "a3d-diagnostics-panel",
    update(next) {
      if (next.render) render = createRenderDiagnostics(next.render);
      if (next.asset) asset = next.asset;
    },
    snapshot() {
      return {
        render,
        ...(asset ? { asset } : {})
      };
    }
  };
}

function isA3DApp(value: HTMLCanvasElement | OffscreenCanvas | A3DApp): value is A3DApp {
  return "diagnostics" in value && typeof value.diagnostics === "function";
}

function findCanvasFromRenderer(renderer: A3DAppRendererLike | undefined): HTMLCanvasElement | OffscreenCanvas | undefined {
  return (renderer as (A3DAppRendererLike & { readonly canvas?: HTMLCanvasElement | OffscreenCanvas }) | undefined)?.canvas;
}
