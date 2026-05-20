import type { CameraLike, RenderSource } from "../Renderer";
import type { RenderDeviceDiagnostics } from "../RenderDevice";

export type V6RendererBackend = "webgl2" | "webgpu";
export type V6RendererFeatureState = "supported" | "partial" | "blocked";

export interface V6RendererFeature {
  readonly id: string;
  readonly state: V6RendererFeatureState;
  readonly detail: string;
}

export interface V6ImportedAssetRenderMetadata {
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

export interface V6RendererInput {
  readonly source: RenderSource;
  readonly camera?: CameraLike;
  readonly metadata: V6ImportedAssetRenderMetadata;
  readonly transmissionBackdropCapture?: false | V7TransmissionBackdropCaptureOptions;
}

export interface V7TransmissionBackdropCaptureOptions {
  readonly mode?: "scene-color-readback";
  readonly strength?: number;
  readonly refractionScale?: number;
}

export interface V7TransmissionBackdropCaptureProof {
  readonly mode: "renderer-owned-scene-color-readback";
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly mipCount: number;
  readonly strength: number;
  readonly refractionScale: number;
  readonly materialBindings: number;
}

export interface V6PixelMetrics {
  readonly width: number;
  readonly height: number;
  readonly nonTransparentPixels: number;
  readonly nonBlackPixels: number;
  readonly averageLuma: number;
  readonly maxLuma: number;
  readonly uniqueColorBuckets: number;
  readonly centerPixel: readonly [number, number, number, number];
}

export interface V8RendererTimingDiagnostics {
  readonly source: "performance-now" | "date-now";
  readonly totalMs: number;
  readonly renderMs: number;
  readonly readbackMs?: number;
  readonly pixelAnalysisMs?: number;
  readonly transmissionBackdropCaptureMs?: number;
}

export interface V6RenderProof {
  readonly backend: V6RendererBackend;
  readonly realWebGL2: boolean;
  readonly mockDevice: boolean;
  readonly canvas2dProof: boolean;
  readonly importedAsset: V6ImportedAssetRenderMetadata;
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly features: readonly V6RendererFeature[];
  readonly pixels: V6PixelMetrics;
  readonly timing?: V8RendererTimingDiagnostics;
  readonly transmissionBackdropCapture?: V7TransmissionBackdropCaptureProof;
}

export interface V7FrameRenderResult {
  readonly backend: V6RendererBackend;
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly features: readonly V6RendererFeature[];
  readonly timing?: V8RendererTimingDiagnostics;
}

export interface V6ProductionRenderer {
  readonly backend: V6RendererBackend;
  renderFrame(input: V6RendererInput): V7FrameRenderResult;
  renderImportedAsset(input: V6RendererInput): V6RenderProof;
  getFeatures(): readonly V6RendererFeature[];
  getDiagnostics(): RenderDeviceDiagnostics;
  dispose(): void;
}

export interface V8ProductionRenderer extends V6ProductionRenderer {
  renderInteractiveFrame(input: V6RendererInput): V7FrameRenderResult;
  captureProof(input: V6RendererInput): V6RenderProof;
}

export const V6_WEBGL2_REQUIRED_FEATURES = [
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

export const V7_WEBGPU_REQUIRED_FEATURES = [
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
