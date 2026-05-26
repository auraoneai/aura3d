import { computePerspectiveCameraFrame, type CameraFrameBounds, type PerspectiveCameraFrameOptions } from "../../../rendering/src/CameraFraming";
import { Geometry } from "../../../rendering/src/Geometry";
import { PBRMaterial } from "../../../rendering/src/PBRMaterial";
import type { EnvironmentLightingOptions, RenderItem } from "../../../rendering/src/ForwardPass";
import type { CollectedLight } from "../../../rendering/src/LightCollector";
import type { CameraLike, RenderSource, RendererPostProcessOptions, RendererShadowOptions } from "../../../rendering/src/Renderer";
import {
  createContactShadowPass,
  type ContactShadowPassDiagnostics
} from "../../../rendering/src/production-runtime/passes/ContactShadowPass";
import {
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  type V6EnvironmentLightingResources,
  type V6PbrHdrPipeline,
  type V6ToneMappingOperator
} from "../../../rendering/src/production-runtime/PBRHDRPipeline";
import {
  loadV6GLTFRenderPipeline,
  type V6GLTFRenderPipeline
} from "../../../assets/src/asset-corpus/V6GLTFRenderPipeline";
import type { GLTFMaterialRenderStateOverride, GLTFRendererInputOptions } from "../../../assets/src/GLTFRenderResources";
import { DirectionalLight, composeMat4 } from "../../../scene/src/index";

export interface A3DViewport {
  readonly width: number;
  readonly height: number;
}

export type A3DVec3 = readonly [number, number, number];

export interface A3DStudioLightingOptions {
  readonly preset?: "product" | "inspection" | "softbox";
  readonly intensityScale?: number;
  readonly shadows?: boolean;
}

export interface A3DGroundedStageOptions {
  readonly labelPrefix?: string;
  readonly floorColor?: readonly [number, number, number, number];
  readonly backdropColor?: readonly [number, number, number, number];
  readonly floorRoughness?: number;
  readonly backdropRoughness?: number;
  readonly floorMetallic?: number;
  readonly contactShadows?: boolean;
  readonly background?: boolean;
  readonly shadowLightDirection?: A3DVec3;
}

export interface A3DGroundedStageSettings {
  readonly backgroundBlur?: number;
  readonly backgroundVisible?: boolean;
}

export interface A3DGroundedStageDiagnostics {
  readonly labelPrefix: string;
  readonly floorY: number;
  readonly floorItemCount: number;
  readonly backgroundItemCount: number;
  readonly contactShadow?: ContactShadowPassDiagnostics;
}

export interface A3DGroundedStage {
  readonly groundingItems: readonly RenderItem[];
  readonly backgroundItems: readonly RenderItem[];
  readonly floorY: number;
  readonly diagnostics: A3DGroundedStageDiagnostics;
  update(settings?: A3DGroundedStageSettings): void;
  renderItems(options?: { readonly shadows?: boolean; readonly backgroundVisible?: boolean }): readonly RenderItem[];
  dispose(): void;
}

export interface A3DProductViewerCameraDiagnostics {
  readonly preset: "product-hero" | "asset-inspection" | "material-inspection";
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly paddingRatio: number;
  readonly cameraPosition: readonly [number, number, number];
  readonly targetOffset: readonly [number, number, number];
  readonly zoom: number;
}

export interface A3DCameraFrameOptions {
  readonly bounds: CameraFrameBounds;
  readonly viewport: A3DViewport;
  readonly preset?: A3DProductViewerCameraDiagnostics["preset"];
  readonly target?: A3DVec3;
  readonly yawRadians?: number;
  readonly pitchRadians?: number;
  readonly zoom?: number;
  readonly paddingRatio?: number;
}

export interface A3DCameraFrame {
  readonly camera: CameraLike;
  readonly diagnostics: A3DProductViewerCameraDiagnostics;
}

export interface A3DGltfSceneOptions {
  readonly url: string;
  readonly assetId?: string;
  readonly assetName?: string;
  readonly materialVariant?: string;
  readonly sceneIndex?: number;
  readonly sceneName?: string;
  readonly materialRenderStateOverrides?: readonly GLTFMaterialRenderStateOverride[];
  readonly viewport?: A3DViewport;
  readonly rendererInput?: GLTFRendererInputOptions;
}

export interface A3DGltfRendererInputOptions {
  readonly viewport: A3DViewport;
  readonly environment?: A3DHdrEnvironment;
  readonly environmentLighting?: EnvironmentLightingOptions;
  readonly renderItems?: Iterable<RenderItem>;
  readonly collectedLights?: Iterable<CollectedLight>;
  readonly shadow?: RendererShadowOptions | boolean;
  readonly postprocess?: RendererPostProcessOptions | boolean;
}

export class A3DGltfScene {
  constructor(private readonly pipeline: V6GLTFRenderPipeline) {}

  get asset() {
    return this.pipeline.asset;
  }

  get resources() {
    return this.pipeline.resources;
  }

  get metadata() {
    return this.pipeline.metadata;
  }

  createRendererInput(options: A3DGltfRendererInputOptions): {
    readonly source: RenderSource;
    readonly camera: CameraLike;
    readonly bounds: CameraFrameBounds;
  } {
    const environmentLighting = options.environmentLighting ?? options.environment?.lighting.lighting;
    const input = this.pipeline.resources.toRendererInput(options.viewport, {
      qualityPreset: environmentLighting ? "hdr-studio-preview" : "studio-preview",
      cameraPolicy: "require",
      ...(environmentLighting ? { environmentLighting } : {}),
      ...(options.renderItems ? { renderItems: options.renderItems } : {}),
      ...(options.collectedLights ? { collectedLights: options.collectedLights } : {}),
      ...(options.shadow !== undefined ? { shadow: options.shadow } : {}),
      ...(options.postprocess !== undefined ? { postprocess: options.postprocess } : {})
    });
    return {
      source: input.source,
      camera: input.camera,
      bounds: input.bounds
    };
  }

  dispose(): void {
    this.pipeline.dispose();
  }
}

export interface A3DHdrEnvironmentOptions {
  readonly url: string;
  readonly id?: string;
  readonly label?: string;
  readonly data?: ArrayBuffer | Uint8Array;
  readonly quality?: "interactive" | "production";
  readonly intensity?: number;
  readonly backgroundIntensity?: number;
  readonly rotation?: number;
  readonly toneMapping?: {
    readonly operator?: V6ToneMappingOperator;
    readonly exposure?: number;
    readonly whitePoint?: number;
  };
}

export class A3DHdrEnvironment {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly pipeline: V6PbrHdrPipeline;
  readonly lighting: V6EnvironmentLightingResources;

  constructor(options: {
    readonly id: string;
    readonly label: string;
    readonly url: string;
    readonly pipeline: V6PbrHdrPipeline;
    readonly lighting: V6EnvironmentLightingResources;
  }) {
    this.id = options.id;
    this.label = options.label;
    this.url = options.url;
    this.pipeline = options.pipeline;
    this.lighting = options.lighting;
  }

  get environmentLighting(): EnvironmentLightingOptions {
    return this.lighting.lighting;
  }

  dispose(): void {
    this.lighting.dispose();
  }
}

export async function loadGltfScene(input: string | A3DGltfSceneOptions): Promise<A3DGltfScene> {
  const options = typeof input === "string" ? { url: input } : input;
  const viewport = options.viewport ?? { width: 1024, height: 1024 };
  const assetId = options.assetId ?? assetIdFromUrl(options.url);
  const pipeline = await loadV6GLTFRenderPipeline({
    url: options.url,
    assetId,
    assetName: options.assetName ?? assetId,
    width: viewport.width,
    height: viewport.height,
    ...(options.materialVariant !== undefined ? { materialVariant: options.materialVariant } : {}),
    ...(options.sceneIndex !== undefined ? { sceneIndex: options.sceneIndex } : {}),
    ...(options.sceneName !== undefined ? { sceneName: options.sceneName } : {}),
    ...(options.materialRenderStateOverrides ? { materialRenderStateOverrides: options.materialRenderStateOverrides } : {}),
    ...(options.rendererInput ? { rendererInput: options.rendererInput } : {})
  });
  return new A3DGltfScene(pipeline);
}

export async function loadHdrEnvironment(input: string | A3DHdrEnvironmentOptions): Promise<A3DHdrEnvironment> {
  const options = typeof input === "string" ? { url: input } : input;
  const data = options.data ?? await fetchArrayBuffer(options.url);
  const id = options.id ?? assetIdFromUrl(options.url);
  const interactive = options.quality === "interactive";
  const pipeline = createV6PbrHdrPipelineFromRadiance(data, {
    id,
    label: options.label ?? id,
    intensity: options.intensity ?? 1,
    backgroundIntensity: options.backgroundIntensity ?? 0.85,
    rotation: options.rotation ?? 0,
    ...(interactive ? {
      specularLevels: 5,
      specularSampleCount: 4,
      cubemapFaceSize: 64,
      cubemapMipCount: 6,
      cubemapSampleCount: 6,
      irradianceWidth: 16,
      irradianceHeight: 8,
      brdfLutSize: 16,
      brdfLutSampleCount: 16
    } : {}),
    ...(options.toneMapping ? { toneMapping: options.toneMapping } : {})
  });
  return new A3DHdrEnvironment({
    id,
    label: options.label ?? id,
    url: options.url,
    pipeline,
    lighting: createV6EnvironmentLightingResources(pipeline)
  });
}

export function createStudioLighting(options: A3DStudioLightingOptions = {}): readonly CollectedLight[] {
  const scale = clamp(options.intensityScale ?? 1, 0, 16);
  const shadows = options.shadows ?? true;
  switch (options.preset ?? "product") {
    case "inspection":
      return [
        createDirectionalLight({ name: "a3d-v8-inspection-key", direction: [-0.35, -0.72, -0.46], color: [1, 0.98, 0.92], intensity: 2.1 * scale, castsShadow: shadows }),
        createDirectionalLight({ name: "a3d-v8-inspection-fill", direction: [0.55, -0.48, -0.34], color: [0.62, 0.74, 1], intensity: 0.72 * scale }),
        createDirectionalLight({ name: "a3d-v8-inspection-rim", direction: [0.14, -0.34, 0.93], color: [1, 0.82, 0.62], intensity: 1.16 * scale })
      ];
    case "softbox":
      return [
        createDirectionalLight({ name: "a3d-v8-softbox-key", direction: [-0.2, -0.9, -0.32], color: [1, 0.97, 0.91], intensity: 1.75 * scale, castsShadow: shadows }),
        createDirectionalLight({ name: "a3d-v8-softbox-fill", direction: [0.44, -0.52, -0.42], color: [0.74, 0.82, 1], intensity: 1.04 * scale })
      ];
    case "product":
    default:
      return [
        createDirectionalLight({ name: "a3d-v8-product-key-shadow", direction: [-0.42, -0.82, -0.38], color: [1, 0.95, 0.86], intensity: 2.75 * scale, castsShadow: shadows }),
        createDirectionalLight({ name: "a3d-v8-product-fill", direction: [0.62, -0.42, -0.34], color: [0.55, 0.68, 1], intensity: 0.48 * scale }),
        createDirectionalLight({ name: "a3d-v8-product-rim", direction: [0.18, -0.34, 0.92], color: [1, 0.82, 0.55], intensity: 1.05 * scale })
      ];
  }
}

export function createGroundedStage(bounds: CameraFrameBounds, options: A3DGroundedStageOptions = {}): A3DGroundedStage {
  const labelPrefix = options.labelPrefix ?? "a3d-v8-grounded-stage";
  const width = Math.max(3.8, (bounds.max[0] - bounds.min[0]) * 2.4);
  const height = Math.max(2.6, (bounds.max[1] - bounds.min[1]) * 2.35);
  const depth = Math.max(3.2, (bounds.max[2] - bounds.min[2]) * 3.2 + 1.35);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerY = (bounds.min[1] + bounds.max[1]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const floorY = bounds.min[1] - 0.05;
  const backZ = bounds.min[2] - depth * 0.42;
  const stageGeometry = Geometry.litCube(1);
  const floorMaterial = new PBRMaterial({
    name: `${labelPrefix}-floor-material`,
    baseColor: options.floorColor ?? [0.022, 0.024, 0.029, 1],
    metallic: clamp(options.floorMetallic ?? 0, 0, 1),
    roughness: clamp(options.floorRoughness ?? 0.46, 0.02, 1),
    environmentIntensity: 0.82
  });
  const backdropMaterial = new PBRMaterial({
    name: `${labelPrefix}-backdrop-material`,
    baseColor: options.backdropColor ?? [0.006, 0.008, 0.012, 1],
    metallic: 0,
    roughness: clamp(options.backdropRoughness ?? 0.58, 0.02, 1),
    environmentIntensity: 0.54
  });
  const contactShadow = options.contactShadows === false ? undefined : createContactShadowPass({
    bounds,
    floorY,
    labelPrefix: `${labelPrefix}-contact-shadow`,
    opacity: 1,
    lightDirection: options.shadowLightDirection ?? [-0.42, -0.82, -0.38],
    softness: 0.82
  });
  const groundingItems: RenderItem[] = [
    {
      label: `${labelPrefix}-floor`,
      geometry: stageGeometry,
      material: floorMaterial,
      modelMatrix: composeMat4([centerX, floorY, centerZ + depth * 0.12], [0, 0, 0, 1], [width, 0.035, depth])
    },
    ...(contactShadow?.renderItems ?? [])
  ];
  const backgroundItems: RenderItem[] = options.background === false ? [] : [
    {
      label: `${labelPrefix}-backdrop`,
      geometry: stageGeometry,
      material: backdropMaterial,
      modelMatrix: composeMat4([centerX, centerY + height * 0.9, backZ], [0, 0, 0, 1], [width * 1.35, height * 2.8, 0.05])
    }
  ];
  const diagnostics: A3DGroundedStageDiagnostics = {
    labelPrefix,
    floorY,
    floorItemCount: groundingItems.length,
    backgroundItemCount: backgroundItems.length,
    ...(contactShadow ? { contactShadow: contactShadow.diagnostics } : {})
  };
  return {
    groundingItems,
    backgroundItems,
    floorY,
    diagnostics,
    update(settings = {}) {
      const blur = clamp(settings.backgroundBlur ?? 0.08, 0, 1);
      const visible = settings.backgroundVisible === false ? 0 : 1;
      backdropMaterial.roughness = clamp((options.backdropRoughness ?? 0.52) + blur * 0.32, 0.02, 1);
      backdropMaterial.environmentIntensity = visible * (0.58 - blur * 0.18);
    },
    renderItems(renderOptions = {}) {
      return [
        ...(renderOptions.shadows === false ? [] : groundingItems),
        ...(renderOptions.backgroundVisible === false ? [] : backgroundItems)
      ];
    },
    dispose() {
      stageGeometry.dispose();
      contactShadow?.dispose();
    }
  };
}

export function createCameraFrame(options: A3DCameraFrameOptions): A3DCameraFrame {
  const preset = options.preset ?? "product-hero";
  const base = productViewerCameraPreset(preset);
  const targetOffset = productViewerTargetOffset(options.bounds, options.target ?? [0, 0, 0], preset);
  const framedBounds = offsetBounds(options.bounds, targetOffset);
  const yawRadians = base.yawRadians + (options.yawRadians ?? 0);
  const pitchRadians = clamp(base.pitchRadians + (options.pitchRadians ?? 0), -1.2, 1.2);
  const zoom = clamp(options.zoom ?? 1, 0.25, 4);
  const paddingRatio = clamp(options.paddingRatio ?? base.paddingRatio * zoom, 0.02, 1.2);
  const frame = computePerspectiveCameraFrame(framedBounds, options.viewport, {
    ...base,
    yawRadians,
    pitchRadians,
    paddingRatio,
    minDistance: base.minDistance * zoom
  });
  return {
    camera: {
      viewProjectionMatrix: frame.viewProjectionMatrix,
      viewMatrix: frame.viewMatrix,
      projectionMatrix: frame.projectionMatrix
    },
    diagnostics: {
      preset,
      yawRadians,
      pitchRadians,
      paddingRatio,
      cameraPosition: frame.cameraPosition,
      targetOffset,
      zoom
    }
  };
}

function createDirectionalLight(options: {
  readonly name?: string;
  readonly direction?: A3DVec3;
  readonly color?: A3DVec3;
  readonly intensity?: number;
  readonly castsShadow?: boolean;
} = {}): CollectedLight {
  const source = new DirectionalLight(options.name ?? "a3d-v8-directional-light");
  const color = options.color ?? [1, 1, 1];
  source.color = [color[0], color[1], color[2]];
  source.intensity = clamp(options.intensity ?? 1, 0, 64);
  source.castsShadow = options.castsShadow ?? false;
  return collectedDirectionalLight(source, options.direction ?? [0, -1, 0], source.castsShadow);
}

function collectedDirectionalLight(
  source: DirectionalLight,
  direction: readonly [number, number, number],
  castsShadow: boolean
): CollectedLight {
  return {
    kind: "directional",
    color: source.color as readonly [number, number, number],
    intensity: source.intensity,
    position: [0, 0, 0],
    direction: normalizeTuple3(direction),
    range: 0,
    spotAngle: 0,
    penumbra: 0,
    castsShadow,
    layerMask: source.layerMask,
    source
  };
}

function productViewerCameraPreset(preset: A3DProductViewerCameraDiagnostics["preset"]): Required<Pick<
  PerspectiveCameraFrameOptions,
  "fovYRadians" | "paddingRatio" | "minDistance" | "nearPadding" | "farPadding" | "yawRadians" | "pitchRadians"
>> {
  switch (preset) {
    case "asset-inspection":
      return { fovYRadians: Math.PI / 3, paddingRatio: 0.2, minDistance: 0.65, nearPadding: 0.12, farPadding: 2.4, yawRadians: -0.28, pitchRadians: -0.1 };
    case "material-inspection":
      return { fovYRadians: 0.82, paddingRatio: 0.12, minDistance: 0.55, nearPadding: 0.1, farPadding: 2.2, yawRadians: -0.34, pitchRadians: -0.08 };
    case "product-hero":
    default:
      return { fovYRadians: 0.45, paddingRatio: 0.024, minDistance: 0.58, nearPadding: 0.1, farPadding: 3.3, yawRadians: -0.34, pitchRadians: -0.08 };
  }
}

function productViewerTargetOffset(
  bounds: CameraFrameBounds,
  target: readonly [number, number, number],
  preset: A3DProductViewerCameraDiagnostics["preset"]
): readonly [number, number, number] {
  const extent = Math.max(
    0.001,
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  );
  const presetVerticalOffset = preset === "product-hero" ? -0.1 : 0;
  const presetHorizontalOffset = preset === "product-hero" ? 0.16 : 0;
  return [
    target[0] * extent * 0.05 + presetHorizontalOffset * extent,
    target[1] * extent * 0.05 + presetVerticalOffset * extent,
    target[2] * extent * 0.05
  ];
}

function offsetBounds(bounds: CameraFrameBounds, offset: readonly [number, number, number]): CameraFrameBounds {
  return {
    min: [bounds.min[0] + offset[0], bounds.min[1] + offset[1], bounds.min[2] + offset[2]],
    max: [bounds.max[0] + offset[0], bounds.max[1] + offset[1], bounds.max[2] + offset[2]]
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeTuple3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= 0) return [0, -1, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  if (typeof fetch !== "function") {
    throw new Error("loadHdrEnvironment(url) requires fetch; pass { url, data } when loading HDR data outside the browser.");
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch HDR environment ${url}: ${response.status}`);
  }
  return response.arrayBuffer();
}

function assetIdFromUrl(url: string): string {
  const clean = url.split(/[?#]/)[0] ?? url;
  const basename = clean.split("/").filter(Boolean).pop() ?? "asset";
  return basename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
}
