// Engine "." facade decls, moved verbatim from ../index.ts (PRD-15 T1.4).
// These names belong to the published-union surface: each is @deprecated and its
// JSDoc names the §6.6 destination subpath or "deleted in 4.0.0". Decls live
// here (not in ../index.ts) so agent-api can expose them without an index cycle;
// markAuraLazySystem* is imported from the devtools leaf for the same reason.

import type { A3DApp, A3DAppRendererLike } from "@aura3d/apps";
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
} from "@aura3d/assets/browser";
import type { ProductAsset, ProductAssetLoadOptions } from "@aura3d/product-studio";
import {
  createExternalParityEnvironmentPipeline,
  type ExternalParityEnvironmentPipeline,
  type ExternalParityEnvironmentPipelineOptions,
  type PostProcessComposer,
  type PostProcessComposerOptions,
  type RenderDeviceDiagnostics
} from "@aura3d/rendering";
import {
  createAnimationLabWorkflow,
  createAssetViewerWorkflow,
  createComparisonWorkflow,
  createInteractiveSceneWorkflow,
  createMaterialStudioWorkflow,
  createProductConfiguratorWorkflow,
  createSceneShowcaseWorkflow
} from "@aura3d/workflows";
import { markAuraLazySystemLoaded, markAuraLazySystemRequested } from "./lazySystemEvidence.js";
import { renderer } from "./rendererDiagnostics.js";

/** @deprecated Deleted from "." in 4.0.0 — call the workflow factories in `@aura3d/workflows` directly. */
export const workflows = {
  assetViewer: createAssetViewerWorkflow,
  productConfigurator: createProductConfiguratorWorkflow,
  materialStudio: createMaterialStudioWorkflow,
  sceneShowcase: createSceneShowcaseWorkflow,
  interactiveScene: createInteractiveSceneWorkflow,
  animationLab: createAnimationLabWorkflow,
  comparison: createComparisonWorkflow
} as const;

/** @deprecated Deleted from "." in 4.0.0 — use `typeof workflows` composition locally. */
export type A3DWorkflowApi = typeof workflows;

/** @deprecated Deleted from "." in 4.0.0 — duplicate of `ExternalParityEnvironmentPipelineOptions`. */
export type A3DEnvironmentOptions = ExternalParityEnvironmentPipelineOptions;
/** @deprecated Deleted from "." in 4.0.0 — duplicate of `ExternalParityEnvironmentPipeline`. */
export type A3DEnvironment = ExternalParityEnvironmentPipeline;

/** @deprecated Deleted from "." in 4.0.0 — a second environment API beside `environments.*`; use `createExternalParityEnvironmentPipeline` from `@aura3d/rendering`. */
export function createEnvironment(options: A3DEnvironmentOptions): A3DEnvironment {
  return createExternalParityEnvironmentPipeline(options);
}

/** @deprecated Use `loadRenderableAsset` via `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export async function loadAsset(urlOrAsset: string | RenderableAsset, options: LoadRenderableAssetOptions = {}): Promise<RenderableAsset> {
  return await loadRenderableAsset(urlOrAsset, options);
}

/** @deprecated Use `loadProductAsset` via `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export async function loadProductAssetLazy(options: ProductAssetLoadOptions): Promise<ProductAsset> {
  markAuraLazySystemRequested("product-gltf-loader", "loadProductAssetLazy");
  const started = Date.now();
  const productStudio = await import("@aura3d/product-studio");
  markAuraLazySystemLoaded("product-gltf-loader", Date.now() - started);
  return productStudio.loadProductAsset(options);
}

/** @deprecated Use `PostProcessComposer` via `@aura3d/engine/renderer`. Deleted from "." in 4.0.0. */
export async function createPostProcessComposerLazy(options: PostProcessComposerOptions): Promise<PostProcessComposer> {
  markAuraLazySystemRequested("postprocess", "createPostProcessComposerLazy");
  const started = Date.now();
  const rendering = await import("@aura3d/rendering");
  markAuraLazySystemLoaded("postprocess", Date.now() - started);
  return new rendering.PostProcessComposer(options);
}

/** @deprecated Deleted from "." in 4.0.0. */
export interface A3DMaterialVariantController<TVariantId extends string = string> {
  readonly current: TVariantId;
  readonly variants: readonly TVariantId[];
  setVariant(variant: TVariantId): TVariantId;
  snapshot(): { readonly current: TVariantId; readonly variants: readonly TVariantId[] };
}

/** @deprecated Deleted from "." in 4.0.0. */
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

/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export interface A3DScreenshotCapture {
  readonly mimeType: "image/png";
  readonly dataUrl: string;
  readonly width?: number;
  readonly height?: number;
}

/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
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

/** @deprecated Use `inspectGLTFAsset` via `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export function inspectAsset(asset: GLTFAsset, resources?: GLTFRenderResources): GLTFAssetInspectionReport {
  return inspectGLTFAsset(asset, resources);
}

/** @deprecated Use `createAssetCompatibilityReport` via `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export function createCompatibilityReport(manifest: GLTFCorpusManifest): AssetCompatibilityReport {
  return createAssetCompatibilityReport(manifest);
}

/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
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

/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
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

/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export interface A3DRenderDiagnostics {
  readonly drawCalls: number;
  readonly buffers: number;
  readonly shaders: number;
  readonly textureCount?: number;
  readonly warnings: readonly string[];
}

/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export function createRenderDiagnostics(diagnostics?: RenderDeviceDiagnostics): A3DRenderDiagnostics {
  return {
    drawCalls: diagnostics?.drawCalls ?? 0,
    buffers: diagnostics?.buffers ?? 0,
    shaders: diagnostics?.shaders ?? 0,
    textureCount: diagnostics?.textures,
    warnings: diagnostics ? [] : ["No render diagnostics have been recorded yet."]
  };
}

/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export interface A3DDiagnosticsPanel {
  readonly kind: "a3d-diagnostics-panel";
  update(next: { readonly render?: RenderDeviceDiagnostics; readonly asset?: A3DAssetDiagnostics }): void;
  snapshot(): {
    readonly render: A3DRenderDiagnostics;
    readonly asset?: A3DAssetDiagnostics;
  };
}

/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
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
