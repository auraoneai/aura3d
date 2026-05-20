import type { GLTFAsset, GLTFRenderResources } from "@galileo3d/assets";
import type {
  CameraLike,
  CollectedLight,
  EnvironmentLightingOptions,
  PerspectiveCameraFrame,
  RenderDeviceDiagnostics,
  RenderItem,
  Renderer,
  RendererOptions,
  RendererPostProcessOptions,
  RendererShadowOptions,
  RenderSource
} from "@galileo3d/rendering";

export type ProductAssetId = "camera-kit" | "speaker" | "watch" | (string & {});
export type ProductLightingPreset = "catalog-softbox" | "inspection-bay" | "hero-contrast";
export type ProductCameraPreset = "front-three-quarter" | "side-profile" | "top-detail" | "macro-detail";
export type ProductMaterialModeId = "asset" | "clay" | "matte" | "metal-check" | "contrast";

export interface ProductPartDescriptor {
  readonly name: string;
  readonly material: string;
  readonly shape?: string;
}

export interface ProductMaterialDescriptor {
  readonly name: string;
  readonly metallic: number;
  readonly roughness: number;
  readonly alphaMode: "OPAQUE" | "BLEND" | "MASK";
  readonly textureSet?: string;
}

export interface ProductManifest {
  readonly schema: string;
  readonly id: ProductAssetId;
  readonly title: string;
  readonly category: string;
  readonly gltf: string;
  readonly parts: readonly ProductPartDescriptor[];
  readonly materials: readonly ProductMaterialDescriptor[];
  readonly rejectedInputs?: readonly string[];
  readonly requirements?: Readonly<Record<string, unknown>>;
}

export interface ProductAsset {
  readonly id: ProductAssetId;
  readonly title: string;
  readonly category: string;
  readonly url: string;
  readonly manifest: ProductManifest;
  readonly gltf: GLTFAsset;
  readonly resources: GLTFRenderResources;
  readonly parts: readonly ProductPartDescriptor[];
  readonly materials: readonly ProductMaterialDescriptor[];
}

export interface ProductAssetLoadOptions {
  readonly url: string;
  readonly manifestUrl?: string;
  readonly id?: ProductAssetId;
  readonly title?: string;
  readonly category?: string;
}

export interface ProductLightingConfig {
  readonly preset: ProductLightingPreset;
  readonly environmentLighting: EnvironmentLightingOptions;
  readonly postprocess: RendererPostProcessOptions;
  readonly shadow: RendererShadowOptions;
  readonly lights: readonly CollectedLight[];
}

export interface ProductCameraFrame {
  readonly preset: ProductCameraPreset;
  readonly frame: PerspectiveCameraFrame;
  readonly camera: CameraLike;
}

export interface ProductCameraOptions {
  readonly preset?: ProductCameraPreset;
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
  readonly paddingRatio?: number;
}

export interface ProductMaterialMode {
  readonly id: ProductMaterialModeId;
  readonly label: string;
  readonly description: string;
}

export interface ProductRenderSceneOptions {
  readonly lighting?: ProductLightingConfig;
  readonly camera?: ProductCameraFrame;
  readonly materialMode?: ProductMaterialMode;
  readonly floor?: boolean;
}

export interface ProductRenderScene {
  readonly asset: ProductAsset;
  readonly source: RenderSource;
  readonly camera: CameraLike;
  readonly cameraFrame: ProductCameraFrame;
  readonly lighting: ProductLightingConfig;
  readonly materialMode: ProductMaterialMode;
  readonly renderItems: readonly RenderItem[];
}

export interface ProductDiagnostics {
  readonly assetId: ProductAssetId;
  readonly partCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly meshCount: number;
  readonly warnings: readonly string[];
  readonly renderDiagnostics?: RenderDeviceDiagnostics;
}

export interface ProductSceneManifest {
  readonly schema: "g3d-product-studio-scene/v1";
  readonly assetId: ProductAssetId;
  readonly title: string;
  readonly partCount: number;
  readonly materialCount: number;
  readonly materialMode: ProductMaterialModeId;
  readonly lightingPreset: ProductLightingPreset;
  readonly cameraPreset: ProductCameraPreset;
  readonly generatedAt: string;
}

export interface ProductExportResult {
  readonly mimeType: "image/png";
  readonly dataUrl: string;
  readonly byteLength: number;
  readonly manifest: ProductSceneManifest;
}

export interface ProductStudioOptions extends RendererOptions {
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly width?: number;
  readonly height?: number;
}

export interface ProductStudio {
  readonly renderer: Renderer;
  render(scene: ProductRenderScene): RenderDeviceDiagnostics;
  resize(width: number, height: number): void;
  setLighting(preset: ProductLightingPreset): ProductLightingConfig;
  setCamera(asset: ProductAsset, preset: ProductCameraPreset, viewport?: { readonly width: number; readonly height: number }): ProductCameraFrame;
  setMaterialMode(mode: ProductMaterialModeId): ProductMaterialMode;
  exportPng(scene: ProductRenderScene): Promise<ProductExportResult>;
  exportSceneManifest(scene: ProductRenderScene): ProductSceneManifest;
  dispose(): void;
}
