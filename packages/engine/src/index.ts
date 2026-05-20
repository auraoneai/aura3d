export {
  G3D_APP_WORKFLOW_PRESETS,
  createG3DApp,
  resolveG3DAppQualityPreset
} from "@galileo3d/apps";
export type {
  G3DApp,
  G3DAppDiagnostics,
  G3DAppOptions,
  G3DAppQualityPreset,
  G3DAppQualitySettings,
  G3DAppWorkflowPreset
} from "@galileo3d/apps";
export { Engine } from "@galileo3d/core";
export { Renderer, createV4EnvironmentPipeline, listV4EnvironmentTargets } from "@galileo3d/rendering";
export {
  GLTFLoader,
  createAssetCompatibilityReport,
  inspectGLTFAsset,
  loadRenderableAsset,
  summarizeV4Corpus
} from "@galileo3d/assets";
export { loadProductAsset } from "@galileo3d/product-studio";
export {
  createAnimationLabWorkflow,
  createAssetViewerWorkflow,
  createComparisonWorkflow,
  createInteractiveSceneWorkflow,
  createMaterialStudioWorkflow,
  createProductConfiguratorWorkflow,
  createSceneShowcaseWorkflow
} from "@galileo3d/workflows";
export * as v9 from "./v9/index.js";
export {
  G3DRenderer,
  G3DScene,
  G3DAppLifecycle
} from "./v9/index.js";
export type {
  G3DAppLifecycleSnapshot,
  G3DDisposable,
  G3DRendererOptions,
  G3DSceneMeshOptions,
  G3DSceneRenderSourceOptions
} from "./v9/index.js";
import type { G3DApp, G3DAppRendererLike } from "@galileo3d/apps";
import {
  createAnimationLabWorkflow,
  createAssetViewerWorkflow,
  createComparisonWorkflow,
  createInteractiveSceneWorkflow,
  createMaterialStudioWorkflow,
  createProductConfiguratorWorkflow,
  createSceneShowcaseWorkflow
} from "@galileo3d/workflows";
import {
  createV4EnvironmentPipeline,
  type V4EnvironmentPipeline,
  type V4EnvironmentPipelineOptions,
  type RenderDeviceDiagnostics
} from "@galileo3d/rendering";
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
} from "@galileo3d/assets";

export const workflows = {
  assetViewer: createAssetViewerWorkflow,
  productConfigurator: createProductConfiguratorWorkflow,
  materialStudio: createMaterialStudioWorkflow,
  sceneShowcase: createSceneShowcaseWorkflow,
  interactiveScene: createInteractiveSceneWorkflow,
  animationLab: createAnimationLabWorkflow,
  comparison: createComparisonWorkflow
} as const;

export type G3DWorkflowApi = typeof workflows;

export type G3DEnvironmentOptions = V4EnvironmentPipelineOptions;
export type G3DEnvironment = V4EnvironmentPipeline;

export function createEnvironment(options: G3DEnvironmentOptions): G3DEnvironment {
  return createV4EnvironmentPipeline(options);
}

export async function loadAsset(urlOrAsset: string | RenderableAsset, options: LoadRenderableAssetOptions = {}): Promise<RenderableAsset> {
  return await loadRenderableAsset(urlOrAsset, options);
}

export interface G3DMaterialVariantController<TVariantId extends string = string> {
  readonly current: TVariantId;
  readonly variants: readonly TVariantId[];
  setVariant(variant: TVariantId): TVariantId;
  snapshot(): { readonly current: TVariantId; readonly variants: readonly TVariantId[] };
}

export function createMaterialVariantController<TVariantId extends string>(
  variants: readonly TVariantId[],
  initialVariant: TVariantId = variants[0] as TVariantId
): G3DMaterialVariantController<TVariantId> {
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

export interface G3DScreenshotCapture {
  readonly mimeType: "image/png";
  readonly dataUrl: string;
  readonly width?: number;
  readonly height?: number;
}

export function captureScreenshot(target: HTMLCanvasElement | OffscreenCanvas | G3DApp): G3DScreenshotCapture {
  const canvas = isG3DApp(target) ? findCanvasFromRenderer(target.renderer) : target;
  if (!canvas) throw new Error("captureScreenshot requires a canvas-backed G3D app or canvas.");
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

export interface G3DAssetDiagnostics {
  readonly kind: RenderableAsset["kind"];
  readonly url?: string;
  readonly warnings: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly textureCount: number;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetMeshCount: number;
}

export function createAssetDiagnostics(asset: RenderableAsset): G3DAssetDiagnostics {
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

export interface G3DRenderDiagnostics {
  readonly drawCalls: number;
  readonly buffers: number;
  readonly shaders: number;
  readonly textureCount?: number;
  readonly warnings: readonly string[];
}

export function createRenderDiagnostics(diagnostics?: RenderDeviceDiagnostics): G3DRenderDiagnostics {
  return {
    drawCalls: diagnostics?.drawCalls ?? 0,
    buffers: diagnostics?.buffers ?? 0,
    shaders: diagnostics?.shaders ?? 0,
    textureCount: diagnostics?.textures,
    warnings: diagnostics ? [] : ["No render diagnostics have been recorded yet."]
  };
}

export interface G3DDiagnosticsPanel {
  readonly kind: "g3d-diagnostics-panel";
  update(next: { readonly render?: RenderDeviceDiagnostics; readonly asset?: G3DAssetDiagnostics }): void;
  snapshot(): {
    readonly render: G3DRenderDiagnostics;
    readonly asset?: G3DAssetDiagnostics;
  };
}

export function createDiagnosticsPanel(initial: { readonly render?: RenderDeviceDiagnostics; readonly asset?: G3DAssetDiagnostics } = {}): G3DDiagnosticsPanel {
  let render = createRenderDiagnostics(initial.render);
  let asset = initial.asset;
  return {
    kind: "g3d-diagnostics-panel",
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

function isG3DApp(value: HTMLCanvasElement | OffscreenCanvas | G3DApp): value is G3DApp {
  return "diagnostics" in value && typeof value.diagnostics === "function";
}

function findCanvasFromRenderer(renderer: G3DAppRendererLike | undefined): HTMLCanvasElement | OffscreenCanvas | undefined {
  return (renderer as (G3DAppRendererLike & { readonly canvas?: HTMLCanvasElement | OffscreenCanvas }) | undefined)?.canvas;
}
