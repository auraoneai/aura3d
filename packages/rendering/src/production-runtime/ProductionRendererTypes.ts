import type { CameraLike, RenderSource } from "../Renderer";
import type { RenderDeviceDiagnostics } from "../RenderDevice";

export type ProductionRendererBackend = "webgl2" | "webgpu";
export type ProductionRendererFeatureState = "supported" | "partial" | "blocked";

export interface ProductionRendererFeature {
  readonly id: string;
  readonly state: ProductionRendererFeatureState;
  readonly detail: string;
}

export interface ProductionImportedAssetRenderMetadata {
  readonly assetId: string;
  readonly assetUri: string;
  readonly assetName?: string;
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly imageCount: number;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetCount: number;
  readonly extensionsUsed: readonly string[];
  readonly environmentId?: string;
  readonly hdrEnvironmentUri?: string;
}

export interface ProductionRendererInput {
  readonly source: RenderSource;
  readonly camera?: CameraLike;
  readonly metadata: ProductionImportedAssetRenderMetadata;
  readonly transmissionBackdropCapture?: false | RuntimeParityTransmissionBackdropCaptureOptions;
}

export interface RuntimeParityTransmissionBackdropCaptureOptions {
  readonly mode?: "scene-color-readback";
  readonly strength?: number;
  readonly refractionScale?: number;
}

export interface RuntimeParityTransmissionBackdropCaptureProof {
  readonly mode: "renderer-owned-scene-color-readback";
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly mipCount: number;
  readonly strength: number;
  readonly refractionScale: number;
  readonly materialBindings: number;
}

export interface ProductionPixelMetrics {
  readonly width: number;
  readonly height: number;
  readonly nonTransparentPixels: number;
  readonly nonBlackPixels: number;
  readonly averageLuma: number;
  readonly maxLuma: number;
  readonly uniqueColorBuckets: number;
  readonly centerPixel: readonly [number, number, number, number];
}

export interface CurrentRoutesRendererTimingDiagnostics {
  readonly source: "performance-now" | "date-now";
  readonly totalMs: number;
  readonly renderMs: number;
  readonly readbackMs?: number;
  readonly pixelAnalysisMs?: number;
  readonly transmissionBackdropCaptureMs?: number;
}

export interface ProductionRenderProof {
  readonly backend: ProductionRendererBackend;
  readonly realWebGL2: boolean;
  readonly mockDevice: boolean;
  readonly canvas2dProof: boolean;
  readonly importedAsset: ProductionImportedAssetRenderMetadata;
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly features: readonly ProductionRendererFeature[];
  readonly pixels: ProductionPixelMetrics;
  readonly timing?: CurrentRoutesRendererTimingDiagnostics;
  readonly transmissionBackdropCapture?: RuntimeParityTransmissionBackdropCaptureProof;
}

export interface RuntimeParityFrameRenderResult {
  readonly backend: ProductionRendererBackend;
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly features: readonly ProductionRendererFeature[];
  readonly timing?: CurrentRoutesRendererTimingDiagnostics;
}

export interface ProductionProductionRenderer {
  readonly backend: ProductionRendererBackend;
  renderFrame(input: ProductionRendererInput): RuntimeParityFrameRenderResult;
  renderImportedAsset(input: ProductionRendererInput): ProductionRenderProof;
  getFeatures(): readonly ProductionRendererFeature[];
  getDiagnostics(): RenderDeviceDiagnostics;
  dispose(): void;
}

export interface CurrentRoutesProductionRenderer extends ProductionProductionRenderer {
  renderInteractiveFrame(input: ProductionRendererInput): RuntimeParityFrameRenderResult;
  captureProof(input: ProductionRendererInput): ProductionRenderProof;
}

export const PRODUCTION_WEBGL2_REQUIRED_FEATURES = [
  "real-webgl2-context",
  "no-canvas2d-proof",
  "no-mock-device",
  "imported-gltf-render-source",
  "pbr-materials",
  "texture-upload-diagnostics",
  "render-target-diagnostics",
  "draw-call-diagnostics",
  "pixel-readback",
  "hdr-ibl-ready"
] as const;

export const RUNTIME_PARITY_WEBGPU_REQUIRED_FEATURES = [
  "real-webgpu-context",
  "no-canvas2d-proof",
  "no-mock-device",
  "imported-gltf-render-source",
  "pbr-materials",
  "texture-upload-diagnostics",
  "render-target-diagnostics",
  "draw-call-diagnostics",
  "pixel-readback",
  "hdr-ibl-ready",
  "native-webgpu-render-pipeline",
  "native-webgpu-sampled-textures",
  "native-webgpu-texture-readback",
  "native-webgpu-pbr-submissions"
] as const;
