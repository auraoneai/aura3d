// T2.8: threejs-example-parity single-file collapse — environments.ts and
// FlagshipFoundation.ts inlined here (was index.ts; Q-ALL-1).

import type { EnvironmentLightingOptions } from "@aura3d/rendering";
import type { Material } from "@aura3d/rendering";
import { Geometry } from "../../../rendering/src/Geometry";
import type { RenderItem } from "../../../rendering/src/ForwardPass";
import type { CollectedLight } from "../../../rendering/src/LightCollector";
import {
  createCinematicMaterialPreset,
  createCinematicPBRMaterial
} from "../../../rendering/src/MaterialPresets";
import { createEmissivePracticalLightSystem } from "../../../rendering/src/cinematic/EmissivePracticalLightSystem";
import { createFogVolumeSystem } from "../../../rendering/src/cinematic/FogVolumeSystem";
import { createRainParticleSystem } from "../../../rendering/src/cinematic/RainParticleSystem";
import {
  createRendererOwnedEvidenceFlag,
  validateRendererOwnedCinematicEvidence,
  type CinematicRendererEvidenceFlag,
  type CinematicRendererEvidenceValidation
} from "../../../rendering/src/cinematic/CinematicEvidence";
import type { GLTFMaterialRenderStateOverride } from "../../../assets/src/GLTFRenderResources";
import {
  applyCarConceptMaterialStability,
  carConceptMaterialRenderStateOverrides
} from "../../../assets/src/CarConceptMaterialStability";
import { Renderer, rendererInteractiveFeatureReport } from "../../../rendering/src/production-runtime/index";
import type {
  ProductionRendererInput,
  ProductionRuntimeRendererBackendPreference,
  ProductionRuntimeRendererBackendSelection,
  RendererFrameResult
} from "../../../rendering/src/production-runtime/index";
import { resolveProductionRuntimeRendererBackend } from "../../../rendering/src/production-runtime/index";
import type { RenderDeviceDiagnostics } from "../../../rendering/src/RenderDevice";
import type { RendererPostProcessOptions } from "../../../rendering/src/Renderer";
import {
  currentRoutesAssetUrl,
  listCurrentRoutesFlagshipAssets,
  resolveCurrentRoutesFlagshipAsset,
  type CurrentRoutesFlagshipAsset,
  type CurrentRoutesFlagshipAssetId
} from "../../../assets/src/threejs-example-parity/index";
import { PointLight, composeMat4 } from "../../../scene/src/index";
import { computePerspectiveCameraFrame, type CameraFrameBounds, type PerspectiveCameraFrameOptions } from "../../../rendering/src/CameraFraming";
import { PBRMaterial } from "../../../rendering/src/PBRMaterial";
import type { CameraLike, RenderSource, RendererShadowOptions } from "../../../rendering/src/Renderer";
import { createContactShadowPass, type ContactShadowPassDiagnostics } from "../../../rendering/src/production-runtime/passes/ContactShadowPass";
import { createProductionEnvironmentLightingResources, createProductionPbrHdrPipelineFromRadiance, type ProductionEnvironmentLightingResources, type ProductionPbrHdrPipeline, type ProductionToneMappingOperator } from "../../../rendering/src/production-runtime/PBRHDRPipeline";
import { loadProductionGLTFRenderPipeline, type ProductionGLTFRenderPipeline } from "../../../assets/src/asset-corpus/ProductionGLTFRenderPipeline";
import type { GLTFRendererInputOptions } from "../../../assets/src/GLTFRenderResources";
import { DirectionalLight } from "../../../scene/src/index";


export {
  listCurrentRoutesFlagshipAssets,
  resolveCurrentRoutesFlagshipAsset
};
export type {
  CurrentRoutesFlagshipAsset,
  CurrentRoutesFlagshipAssetId
};

export type CurrentRoutesViewerStatus = "loading" | "ready" | "running" | "error";

export interface CurrentRoutesFlagshipViewerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly origin?: string;
  readonly assetId?: CurrentRoutesFlagshipAssetId;
  readonly environmentId?: CurrentRoutesEnvironmentId;
  readonly cinematicScene?: CurrentRoutesCinematicSceneId;
}

export type CurrentRoutesCinematicSceneId = "rainy-neon-alley";

export interface CurrentRoutesViewerControls {
  readonly yaw: number;
  readonly pitch: number;
  readonly zoom: number;
  readonly target: A3DVec3;
  readonly exposure: number;
  readonly environmentRotation: number;
  readonly backgroundVisible: boolean;
  readonly backgroundBlur: number;
  readonly shadows: boolean;
  readonly roughnessScale: number;
  readonly metallicScale: number;
  readonly clearcoatBoost: number;
}

export interface CurrentRoutesViewerSnapshot {
  readonly status: CurrentRoutesViewerStatus;
  readonly asset: {
    readonly id: CurrentRoutesFlagshipAssetId;
    readonly name: string;
    readonly meshCount: number;
    readonly primitiveCount: number;
    readonly materialCount: number;
    readonly textureCount: number;
    readonly warnings: readonly string[];
  };
  readonly environment: {
    readonly id: CurrentRoutesEnvironmentId;
    readonly label: string;
    readonly exposure: number;
    readonly rotation: number;
  };
  readonly controls: CurrentRoutesViewerControls;
  readonly camera: A3DCameraFrame["diagnostics"];
  readonly metrics: CurrentRoutesRuntimeMetrics;
  readonly loading: {
    readonly assetMs: number;
    readonly environmentMs: number;
    readonly rendererMs: number;
    readonly environmentStatus?: "loading" | "ready" | "error";
  };
  readonly cinematicScene?: CurrentRoutesCinematicSceneEvidence;
  readonly screenshotCount: number;
  readonly error?: string;
}

export interface CurrentRoutesCinematicSceneEvidence {
  readonly id: CurrentRoutesCinematicSceneId;
  readonly rendererOwned: true;
  readonly renderItemCount: number;
  readonly heroPropCount: number;
  readonly environmentGeometryCount: number;
  readonly vfxCount: number;
  readonly practicalLightCount: number;
  readonly flags: readonly CinematicRendererEvidenceFlag[];
  readonly validation: CinematicRendererEvidenceValidation;
  readonly diagnostics: readonly string[];
}

interface CurrentRoutesCinematicSceneResources {
  readonly id: CurrentRoutesCinematicSceneId;
  readonly renderItems: readonly RenderItem[];
  readonly collectedLights: readonly CollectedLight[];
  readonly evidence: CurrentRoutesCinematicSceneEvidence;
  dispose(): void;
}

type MaterialBaseline = ReadonlyMap<Material, {
  readonly roughness?: number;
  readonly metallic?: number;
  readonly clearcoat?: number;
}>;


export interface CurrentRoutesInteractiveRendererOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly width: number;
  readonly height: number;
  readonly backend?: ProductionRuntimeRendererBackendPreference;
  readonly preserveDrawingBuffer?: boolean;
  readonly errorCheckMode?: "strict" | "frame";
  readonly clearColor?: readonly [number, number, number, number];
}

export interface CurrentRoutesRuntimeMetrics {
  readonly frameCount: number;
  readonly lastFrameMs: number;
  readonly averageFrameMs: number;
  readonly lastRenderMs: number;
  readonly averageRenderMs: number;
  readonly drawCalls: number;
  readonly textures: number;
  readonly buffers: number;
  readonly shaders: number;
  readonly backend: "webgl2" | "webgpu";
  readonly stateCacheIssued?: number;
  readonly stateCacheSkipped?: number;
  readonly stateCacheProgramSwitches?: number;
  readonly stateCacheTextureBinds?: number;
  readonly stateCacheBufferBinds?: number;
  readonly stateCacheVertexArrayBinds?: number;
  readonly stateCacheSamplerBinds?: number;
}

export interface CurrentRoutesScreenshot {
  readonly mimeType: "image/png";
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

// T2.8 (prd15): moved verbatim from rendering/src/threejs-example-parity/index.ts.
// The class's `ProductionRuntimeRenderer` member is now the single C-29
// `Renderer`; `renderInteractiveFrameAsync` became `renderAsync` +
// `rendererInteractiveFeatureReport` (the deleted wrapper delegated verbatim).
export class CurrentRoutesInteractiveRenderer {
  readonly backend: "webgl2" | "webgpu";
  readonly backendSelection: ProductionRuntimeRendererBackendSelection;

  private readonly metrics = createCurrentRoutesRuntimeMetrics();

  private constructor(
    private readonly renderer: Renderer,
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    selection: ProductionRuntimeRendererBackendSelection
  ) {
    this.backend = renderer.device.kind === "webgpu" ? "webgpu" : "webgl2";
    this.backendSelection = selection;
  }

  static async create(options: CurrentRoutesInteractiveRendererOptions): Promise<CurrentRoutesInteractiveRenderer> {
    const selection = resolveProductionRuntimeRendererBackend(options);
    const renderer = await Renderer.create({
      ...options,
      backend: selection.selectedBackend
    });
    return new CurrentRoutesInteractiveRenderer(renderer, options.canvas, selection);
  }

  async renderFrame(input: ProductionRendererInput): Promise<RendererFrameResult> {
    const started = now();
    const renderStart = now();
    const diagnostics = await this.renderer.renderAsync(input.source, input.camera);
    const renderMs = now() - renderStart;
    const features = rendererInteractiveFeatureReport(this.renderer, diagnostics, input);
    this.metrics.record({
      frameMs: now() - started,
      renderMs,
      diagnostics,
      backend: this.backend
    });
    return {
      backend: this.backend,
      diagnostics,
      features,
      timing: { source: "performance-now", totalMs: now() - started, renderMs }
    };
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.renderer.getDiagnostics();
  }

  getMetrics(): CurrentRoutesRuntimeMetrics {
    return this.metrics.snapshot(this.backend);
  }

  screenshot(): CurrentRoutesScreenshot {
    return captureCurrentRoutesCanvasScreenshot(this.canvas);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

export function createCurrentRoutesInteractiveRenderer(options: CurrentRoutesInteractiveRendererOptions): Promise<CurrentRoutesInteractiveRenderer> {
  return CurrentRoutesInteractiveRenderer.create(options);
}

export function createCurrentRoutesPostprocess(exposure: number): RendererPostProcessOptions {
  return {
    targetFormat: "rgba16f",
    toneMapping: {
      operator: "filmic",
      exposure: clamp(exposure, 0.1, 4),
      whitePoint: 1.25,
      inputColorSpace: "linear",
      outputColorSpace: "srgb"
    },
    colorGrade: {
      contrast: 1.08,
      saturation: 1.05,
      vibrance: 0.1,
      vignette: 0.12,
      sharpening: 0.22
    },
    bloom: {
      threshold: 0.92,
      intensity: 0.08,
      radius: 1
    },
    fxaa: {
      edgeThreshold: 0.08,
      subpixelBlend: 0.55
    }
  };
}

export function captureCurrentRoutesCanvasScreenshot(canvas: HTMLCanvasElement | OffscreenCanvas): CurrentRoutesScreenshot {
  if (!("toDataURL" in canvas) || typeof canvas.toDataURL !== "function") {
    throw new Error("CurrentRoutes screenshot capture requires an HTMLCanvasElement with preserveDrawingBuffer enabled.");
  }
  return {
    mimeType: "image/png",
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height
  };
}

interface CurrentRoutesMetricsRecorder {
  record(sample: {
    readonly frameMs: number;
    readonly renderMs: number;
    readonly diagnostics: RenderDeviceDiagnostics;
    readonly backend: "webgl2" | "webgpu";
  }): void;
  snapshot(backend: "webgl2" | "webgpu"): CurrentRoutesRuntimeMetrics;
}

function createCurrentRoutesRuntimeMetrics(): CurrentRoutesMetricsRecorder {
  let frameCount = 0;
  let lastFrameMs = 0;
  let averageFrameMs = 0;
  let lastRenderMs = 0;
  let averageRenderMs = 0;
  let diagnostics: RenderDeviceDiagnostics = { drawCalls: 0, buffers: 0, shaders: 0, lastError: null, contextLost: false };

  return {
    record(sample) {
      frameCount += 1;
      lastFrameMs = sample.frameMs;
      lastRenderMs = sample.renderMs;
      averageFrameMs += (sample.frameMs - averageFrameMs) / frameCount;
      averageRenderMs += (sample.renderMs - averageRenderMs) / frameCount;
      diagnostics = sample.diagnostics;
    },
    snapshot(backend) {
      return {
        frameCount,
        lastFrameMs: round(lastFrameMs),
        averageFrameMs: round(averageFrameMs),
        lastRenderMs: round(lastRenderMs),
        averageRenderMs: round(averageRenderMs),
        drawCalls: diagnostics.drawCalls,
        textures: diagnostics.textures ?? 0,
        buffers: diagnostics.buffers,
        shaders: diagnostics.shaders,
        backend,
        ...(diagnostics.stateCacheIssued !== undefined ? { stateCacheIssued: diagnostics.stateCacheIssued } : {}),
        ...(diagnostics.stateCacheSkipped !== undefined ? { stateCacheSkipped: diagnostics.stateCacheSkipped } : {}),
        ...(diagnostics.stateCacheProgramSwitches !== undefined ? { stateCacheProgramSwitches: diagnostics.stateCacheProgramSwitches } : {}),
        ...(diagnostics.stateCacheTextureBinds !== undefined ? { stateCacheTextureBinds: diagnostics.stateCacheTextureBinds } : {}),
        ...(diagnostics.stateCacheBufferBinds !== undefined ? { stateCacheBufferBinds: diagnostics.stateCacheBufferBinds } : {}),
        ...(diagnostics.stateCacheVertexArrayBinds !== undefined ? { stateCacheVertexArrayBinds: diagnostics.stateCacheVertexArrayBinds } : {}),
        ...(diagnostics.stateCacheSamplerBinds !== undefined ? { stateCacheSamplerBinds: diagnostics.stateCacheSamplerBinds } : {})
      };
    }
  };
}

export class CurrentRoutesFlagshipViewer {
  private status: CurrentRoutesViewerStatus = "ready";
  private viewport: A3DViewport;
  private readonly origin: string;
  private scene: A3DGltfScene;
  private environment: A3DHdrEnvironment | undefined;
  private environmentPreset: CurrentRoutesEnvironmentPreset;
  private stage: A3DGroundedStage;
  private renderer: CurrentRoutesInteractiveRenderer;
  private materialBaseline: MaterialBaseline;
  private cinematicSceneId: CurrentRoutesCinematicSceneId | undefined;
  private cinematicScene: CurrentRoutesCinematicSceneResources | undefined;
  private screenshotCount = 0;
  private cameraFrame: A3DCameraFrame;
  private error: string | undefined;
  private environmentLoadSerial = 0;
  private environmentLoadScheduled = false;

  private controls: CurrentRoutesViewerControls = {
    yaw: 0,
    pitch: 0,
    zoom: 1,
    target: [0, 0, 0],
    exposure: 1,
    environmentRotation: 0.15,
    backgroundVisible: true,
    backgroundBlur: 0.08,
    shadows: true,
    roughnessScale: 1,
    metallicScale: 1,
    clearcoatBoost: 0
  };

  private constructor(options: {
    readonly origin: string;
    readonly viewport: A3DViewport;
    readonly scene: A3DGltfScene;
    readonly environmentPreset: CurrentRoutesEnvironmentPreset;
    readonly stage: A3DGroundedStage;
    readonly renderer: CurrentRoutesInteractiveRenderer;
    readonly loading: CurrentRoutesViewerSnapshot["loading"];
    readonly cinematicSceneId?: CurrentRoutesCinematicSceneId;
  }) {
    this.origin = options.origin;
    this.viewport = options.viewport;
    this.scene = options.scene;
    this.environmentPreset = options.environmentPreset;
    this.stage = options.stage;
    this.renderer = options.renderer;
    this.cinematicSceneId = options.cinematicSceneId;
    this.cinematicScene = options.cinematicSceneId
      ? createCurrentRoutesCinematicScene(options.cinematicSceneId, this.scene.resources.bounds, this.stage.floorY)
      : undefined;
    this.materialBaseline = captureMaterialBaseline(options.scene);
    this.controls = {
      ...this.controls,
      exposure: options.environmentPreset.exposure,
      environmentRotation: options.environmentPreset.rotation
    };
    this.cameraFrame = this.createCamera();
    this.loading = options.loading;
  }

  private loading: CurrentRoutesViewerSnapshot["loading"];

  static async create(options: CurrentRoutesFlagshipViewerOptions): Promise<CurrentRoutesFlagshipViewer> {
    const viewport = { width: options.width, height: options.height };
    const origin = options.origin ?? "";
    const asset = resolveCurrentRoutesFlagshipAsset(options.assetId);
    const environmentPreset = resolveCurrentRoutesEnvironment(options.environmentId);
    const sceneTask = timeAsync(() => loadGltfScene({
      url: currentRoutesAssetUrl(asset, origin),
      assetId: asset.id,
      assetName: asset.name,
      viewport,
      ...materialCreationOptionsForCurrentRoutesAsset(asset.id)
    }));
    const rendererTask = timeAsync(() => createCurrentRoutesInteractiveRenderer({
      canvas: options.canvas,
      width: options.width,
      height: options.height,
	      backend: "webgl2",
	      preserveDrawingBuffer: true,
	      errorCheckMode: "frame",
	      clearColor: [0.01, 0.012, 0.016, 1]
	    }));
    const [{ value: scene, ms: assetMs }, { value: renderer, ms: rendererMs }] = await Promise.all([
      sceneTask,
      rendererTask
    ]);
    const stage = createGroundedStage(scene.resources.bounds, {
      labelPrefix: "flagship-viewer",
      floorColor: [0.025, 0.028, 0.033, 1],
      backdropColor: [0.012, 0.014, 0.018, 1],
      shadowLightDirection: [-0.42, -0.82, -0.38]
    });
    stage.update({ backgroundBlur: 0.08, backgroundVisible: true });
    const viewer = new CurrentRoutesFlagshipViewer({
      origin,
      viewport,
      scene,
      environmentPreset,
      stage,
      renderer,
      cinematicSceneId: options.cinematicScene,
      loading: {
        assetMs: round(assetMs),
        environmentMs: 0,
        rendererMs: round(rendererMs),
        environmentStatus: "loading"
      }
    });
    return viewer;
  }

  async setAsset(id: CurrentRoutesFlagshipAssetId): Promise<void> {
    const asset = resolveCurrentRoutesFlagshipAsset(id);
    const nextScene = await loadGltfScene({
      url: currentRoutesAssetUrl(asset, this.origin),
      assetId: asset.id,
      assetName: asset.name,
      viewport: this.viewport,
      ...materialCreationOptionsForCurrentRoutesAsset(asset.id)
    });
    const nextStage = createGroundedStage(nextScene.resources.bounds, {
      labelPrefix: "flagship-viewer",
      shadowLightDirection: [-0.42, -0.82, -0.38]
    });
    nextStage.update({ backgroundBlur: this.controls.backgroundBlur, backgroundVisible: this.controls.backgroundVisible });
    this.scene.dispose();
    this.stage.dispose();
    this.cinematicScene?.dispose();
    this.scene = nextScene;
    this.stage = nextStage;
    this.cinematicScene = this.cinematicSceneId
      ? createCurrentRoutesCinematicScene(this.cinematicSceneId, this.scene.resources.bounds, this.stage.floorY)
      : undefined;
    this.materialBaseline = captureMaterialBaseline(nextScene);
    this.applyMaterialControls();
    this.cameraFrame = this.createCamera();
  }

  async setEnvironment(id: CurrentRoutesEnvironmentId): Promise<void> {
    const preset = resolveCurrentRoutesEnvironment(id);
    const serial = this.environmentLoadSerial + 1;
    this.environmentLoadSerial = serial;
    this.loading = { ...this.loading, environmentMs: 0, environmentStatus: "loading" };
    const { value: nextEnvironment, ms } = await timeAsync(() => loadCurrentRoutesEnvironment(preset, this.origin));
    if (serial !== this.environmentLoadSerial) {
      nextEnvironment.dispose();
      return;
    }
    this.environment?.dispose();
    this.environment = nextEnvironment;
    this.environmentPreset = preset;
    this.loading = { ...this.loading, environmentMs: round(ms), environmentStatus: "ready" };
    this.controls = {
      ...this.controls,
      exposure: preset.exposure,
      environmentRotation: preset.rotation
    };
  }

  orbit(deltaYaw: number, deltaPitch: number): CurrentRoutesViewerControls {
    this.controls = {
      ...this.controls,
      yaw: clamp(this.controls.yaw + deltaYaw, -Math.PI, Math.PI),
      pitch: clamp(this.controls.pitch + deltaPitch, -0.75, 0.75)
    };
    this.cameraFrame = this.createCamera();
    return this.controls;
  }

  pan(deltaX: number, deltaY: number): CurrentRoutesViewerControls {
    this.controls = {
      ...this.controls,
      target: [
        clamp(this.controls.target[0] + deltaX, -0.8, 0.8),
        clamp(this.controls.target[1] + deltaY, -0.8, 0.8),
        this.controls.target[2]
      ]
    };
    this.cameraFrame = this.createCamera();
    return this.controls;
  }

  zoom(scale: number): CurrentRoutesViewerControls {
    this.controls = {
      ...this.controls,
      zoom: clamp(this.controls.zoom * scale, 0.25, 1.65)
    };
    this.cameraFrame = this.createCamera();
    return this.controls;
  }

  resize(width: number, height: number): CurrentRoutesViewerSnapshot {
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    if (this.viewport.width === nextWidth && this.viewport.height === nextHeight) return this.snapshot();
    this.viewport = { width: nextWidth, height: nextHeight };
    this.renderer.resize(nextWidth, nextHeight);
    this.cameraFrame = this.createCamera();
    return this.snapshot();
  }

  updateControls(next: Partial<CurrentRoutesViewerControls>): CurrentRoutesViewerControls {
    this.controls = {
      ...this.controls,
      ...next,
      yaw: clamp(next.yaw ?? this.controls.yaw, -Math.PI, Math.PI),
      pitch: clamp(next.pitch ?? this.controls.pitch, -0.75, 0.75),
      zoom: clamp(next.zoom ?? this.controls.zoom, 0.25, 1.65),
      exposure: clamp(next.exposure ?? this.controls.exposure, 0.25, 2.5),
      environmentRotation: clamp(next.environmentRotation ?? this.controls.environmentRotation, -Math.PI, Math.PI),
      backgroundBlur: clamp(next.backgroundBlur ?? this.controls.backgroundBlur, 0, 1),
      roughnessScale: clamp(next.roughnessScale ?? this.controls.roughnessScale, 0.35, 1.8),
      metallicScale: clamp(next.metallicScale ?? this.controls.metallicScale, 0.2, 1.8),
      clearcoatBoost: clamp(next.clearcoatBoost ?? this.controls.clearcoatBoost, 0, 0.8)
    };
    this.cameraFrame = this.createCamera();
    this.stage.update({
      backgroundBlur: this.controls.backgroundBlur,
      backgroundVisible: this.controls.backgroundVisible
    });
    this.applyMaterialControls();
    return this.controls;
  }

  async renderFrame(): Promise<CurrentRoutesViewerSnapshot> {
    try {
      const environmentLighting = this.environment
        ? createEnvironmentLighting(this.environment.environmentLighting, this.controls, this.scene.metadata.assetId)
        : createFallbackEnvironmentLighting(this.controls, this.scene.metadata.assetId);
      const source = this.scene.createRendererInput({
        viewport: this.viewport,
        ...(this.environment ? { environment: this.environment } : {}),
        environmentLighting,
        renderItems: [
          ...this.stage.renderItems({
            shadows: this.controls.shadows,
            backgroundVisible: this.controls.backgroundVisible
          }),
          ...(this.cinematicScene?.renderItems ?? [])
        ],
        collectedLights: [
          ...createStudioLighting({ preset: "product", shadows: this.controls.shadows }),
          ...(this.cinematicScene?.collectedLights ?? [])
        ],
        shadow: this.controls.shadows,
        postprocess: false
      });
      await this.renderer.renderFrame({
        source: source.source,
        camera: this.cameraFrame.camera,
        metadata: {
          assetId: this.scene.metadata.assetId,
          assetName: this.scene.metadata.assetName,
          assetUri: this.scene.metadata.assetUri,
          meshCount: this.scene.metadata.meshCount,
          primitiveCount: this.scene.metadata.primitiveCount,
          materialCount: this.scene.metadata.materialCount,
          textureCount: this.scene.metadata.textureCount,
          imageCount: this.scene.metadata.imageCount,
          animationCount: this.scene.metadata.animationCount,
          skinCount: this.scene.metadata.skinCount,
          morphTargetCount: this.scene.metadata.morphTargetCount,
          extensionsUsed: this.scene.metadata.extensionsUsed,
          environmentId: this.environmentPreset.id,
          hdrEnvironmentUri: this.environment?.url ?? currentRoutesEnvironmentUrl(this.environmentPreset, this.origin)
        }
      });
      this.status = this.renderer.getMetrics().frameCount <= 1 ? "ready" : "running";
      this.error = undefined;
      this.scheduleEnvironmentLoad();
      return this.snapshot();
    } catch (error) {
      this.status = "error";
      this.error = formatError(error);
      return this.snapshot();
    }
  }

  screenshot(): CurrentRoutesScreenshot {
    const screenshot = this.renderer.screenshot();
    this.screenshotCount += 1;
    return screenshot;
  }

  snapshot(): CurrentRoutesViewerSnapshot {
    return {
      status: this.status,
      asset: {
        id: this.scene.metadata.assetId as CurrentRoutesFlagshipAssetId,
        name: this.scene.metadata.assetName,
        meshCount: this.scene.metadata.meshCount,
        primitiveCount: this.scene.metadata.primitiveCount,
        materialCount: this.scene.metadata.materialCount,
        textureCount: this.scene.metadata.textureCount,
        warnings: this.scene.metadata.warnings.map((warning) => warning.message)
      },
      environment: {
        id: this.environmentPreset.id,
        label: this.environmentPreset.label,
        exposure: this.controls.exposure,
        rotation: this.controls.environmentRotation
      },
      controls: this.controls,
      camera: this.cameraFrame.diagnostics,
      metrics: this.renderer.getMetrics(),
      loading: this.loading,
      ...(this.cinematicScene ? { cinematicScene: this.cinematicScene.evidence } : {}),
      screenshotCount: this.screenshotCount,
      ...(this.error ? { error: this.error } : {})
    };
  }

  dispose(): void {
    this.renderer.dispose();
    this.stage.dispose();
    this.cinematicScene?.dispose();
    this.environment?.dispose();
    this.scene.dispose();
  }

  private startEnvironmentLoad(preset: CurrentRoutesEnvironmentPreset): void {
    const serial = this.environmentLoadSerial + 1;
    this.environmentLoadSerial = serial;
    void timeAsync(() => loadCurrentRoutesEnvironment(preset, this.origin))
      .then(({ value, ms }) => {
        if (serial !== this.environmentLoadSerial) {
          value.dispose();
          return;
        }
        this.environment?.dispose();
        this.environment = value;
        this.environmentPreset = preset;
        this.loading = { ...this.loading, environmentMs: round(ms), environmentStatus: "ready" };
      })
      .catch((error: unknown) => {
        if (serial !== this.environmentLoadSerial) return;
        this.error = formatError(error);
        this.loading = { ...this.loading, environmentStatus: "error" };
      });
  }

  private scheduleEnvironmentLoad(): void {
    if (this.environment || this.environmentLoadScheduled || this.loading.environmentStatus !== "loading") return;
    this.environmentLoadScheduled = true;
    const start = (): void => this.startEnvironmentLoad(this.environmentPreset);
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(() => start(), { timeout: 900 });
      return;
    }
    setTimeout(start, 120);
  }

  private createCamera(): A3DCameraFrame {
    return createCameraFrame({
      bounds: this.scene.resources.bounds,
      viewport: this.viewport,
      preset: "product-hero",
      yawRadians: this.controls.yaw,
      pitchRadians: this.controls.pitch,
      zoom: this.controls.zoom,
      target: this.controls.target
    });
  }

  private applyMaterialControls(): void {
    applyMaterialControls(this.scene, this.materialBaseline, this.controls);
  }
}

function createCurrentRoutesCinematicScene(
  id: CurrentRoutesCinematicSceneId,
  bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] },
  floorY: number
): CurrentRoutesCinematicSceneResources {
  if (id !== "rainy-neon-alley") {
    throw new Error(`Unsupported cinematic scene '${id}'.`);
  }

  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const height = Math.max(1, bounds.max[1] - bounds.min[1]);
  const width = Math.max(2.8, bounds.max[0] - bounds.min[0] + 3.2);
  const depth = Math.max(4.2, bounds.max[2] - bounds.min[2] + 4.6);
  const geometries: Geometry[] = [];
  const materials: Material[] = [];
  const renderItems: RenderItem[] = [];
  const flags: CinematicRendererEvidenceFlag[] = [];

  const wetPavementPreset = createCinematicMaterialPreset("wet-pavement");
  const concretePreset = createCinematicMaterialPreset("cinematic-set-concrete");
  const neonPreset = createCinematicMaterialPreset("neon-emissive");
  const flowerPreset = createCinematicMaterialPreset("hero-prop-glow");
  flags.push(
    wetPavementPreset.rendererOwnedEvidence,
    concretePreset.rendererOwnedEvidence,
    neonPreset.rendererOwnedEvidence,
    flowerPreset.rendererOwnedEvidence
  );

  const cube = keepGeometry(Geometry.litCube(1));
  const flowerSphere = keepGeometry(Geometry.uvSphere(0.5, 24, 12));
  const flowerStem = keepGeometry(Geometry.cylinder({ radius: 0.5, height: 1, segments: 16 }));
  const wetPavement = keepMaterial(createCinematicPBRMaterial("wet-pavement"));
  const concrete = keepMaterial(createCinematicPBRMaterial("cinematic-set-concrete", {
    baseColor: [0.09, 0.105, 0.13, 1],
    roughness: 0.54,
    environmentMapIntensity: 0.18,
    environmentMapSpecularIntensity: 0.28
  }));
  const neonBlue = keepMaterial(createCinematicPBRMaterial("neon-emissive", {
    name: "cinematic/neon-cyan",
    baseColor: [0.04, 0.74, 1, 1],
    emissiveColor: [0.04, 0.74, 1],
    emissiveStrength: 7.2
  }));
  const neonPink = keepMaterial(createCinematicPBRMaterial("neon-emissive", {
    name: "cinematic/neon-magenta",
    baseColor: [1, 0.16, 0.82, 1],
    emissiveColor: [1, 0.16, 0.82],
    emissiveStrength: 5.8
  }));
  const flowerGlow = keepMaterial(createCinematicPBRMaterial("hero-prop-glow", {
    name: "cinematic/glowing-story-flower",
    baseColor: [0.62, 1, 0.18, 1],
    emissiveColor: [0.42, 1, 0.16],
    emissiveStrength: 5.5,
    roughness: 0.18,
    clearcoatFactor: 0.45
  }));
  const flowerPetal = keepMaterial(createCinematicPBRMaterial("hero-prop-glow", {
    name: "cinematic/glowing-story-flower-petal",
    baseColor: [0.96, 1, 0.36, 1],
    emissiveColor: [0.8, 1, 0.22],
    emissiveStrength: 2.8,
    roughness: 0.28
  }));

  addItem("cinematic/wet-reflective-pavement", cube, wetPavement, [centerX, floorY + 0.012, centerZ + 0.1], [width * 1.26, 0.024, depth * 1.28]);
  addItem("cinematic/neon-alley-left-wall", cube, concrete, [centerX - width * 0.62, floorY + height * 1.05, centerZ + 0.05], [0.05, height * 2.2, depth * 1.25]);
  addItem("cinematic/neon-alley-right-wall", cube, concrete, [centerX + width * 0.62, floorY + height * 1.05, centerZ + 0.05], [0.05, height * 2.2, depth * 1.25]);
  addItem("cinematic/neon-alley-back-wall", cube, concrete, [centerX, floorY + height * 1.08, centerZ - depth * 0.56], [width * 1.25, height * 2.25, 0.05]);
  addItem("cinematic/cyan-neon-practical", cube, neonBlue, [centerX - width * 0.58, floorY + height * 1.62, centerZ - depth * 0.06], [0.045, 0.08, depth * 0.92]);
  addItem("cinematic/magenta-neon-practical", cube, neonPink, [centerX + width * 0.58, floorY + height * 1.18, centerZ + depth * 0.08], [0.045, 0.08, depth * 0.82]);

  const flowerX = centerX + Math.min(width * 0.32, 1.05);
  const flowerZ = centerZ + Math.min(depth * 0.28, 1.25);
  addItem("cinematic/glowing-flower-stem", flowerStem, flowerGlow, [flowerX, floorY + 0.22, flowerZ], [0.035, 0.42, 0.035]);
  addItem("cinematic/glowing-flower-core", flowerSphere, flowerGlow, [flowerX, floorY + 0.48, flowerZ], [0.16, 0.16, 0.16]);
  addItem("cinematic/glowing-flower-petal-top", flowerSphere, flowerPetal, [flowerX, floorY + 0.62, flowerZ], [0.12, 0.22, 0.05]);
  addItem("cinematic/glowing-flower-petal-bottom", flowerSphere, flowerPetal, [flowerX, floorY + 0.35, flowerZ], [0.12, 0.22, 0.05]);
  addItem("cinematic/glowing-flower-petal-left", flowerSphere, flowerPetal, [flowerX - 0.15, floorY + 0.48, flowerZ], [0.22, 0.12, 0.05]);
  addItem("cinematic/glowing-flower-petal-right", flowerSphere, flowerPetal, [flowerX + 0.15, floorY + 0.48, flowerZ], [0.22, 0.12, 0.05]);

  const rain = createRainParticleSystem({
    id: "cinematic-rainy-neon-alley-rain",
    particleCount: 720,
    bounds: {
      min: [centerX - width * 0.58, floorY + 0.38, centerZ - depth * 0.55],
      max: [centerX + width * 0.58, floorY + height * 2.35, centerZ + depth * 0.62]
    },
    seed: 13
  });
  renderItems.push(rain.renderItem);
  flags.push(rain.rendererOwnedEvidence);

  const fog = createFogVolumeSystem({
    id: "cinematic-rainy-neon-alley-fog",
    density: 0.42,
    color: [0.16, 0.24, 0.32]
  });
  const practicals = createEmissivePracticalLightSystem([
    {
      id: "cinematic-cyan-neon",
      sourceObjectId: "cinematic/cyan-neon-practical",
      color: [0.04, 0.74, 1],
      intensity: 3.2,
      radiusMeters: 5.5
    },
    {
      id: "cinematic-magenta-neon",
      sourceObjectId: "cinematic/magenta-neon-practical",
      color: [1, 0.16, 0.82],
      intensity: 2.6,
      radiusMeters: 4.8
    },
    {
      id: "cinematic-story-flower",
      sourceObjectId: "cinematic/glowing-flower-core",
      color: [0.58, 1, 0.16],
      intensity: 2.9,
      radiusMeters: 2.6
    }
  ]);
  flags.push(
    fog.rendererOwnedEvidence,
    practicals.rendererOwnedEvidence,
    createRendererOwnedEvidenceFlag({
      id: "asset:glowing-flower",
      feature: "asset",
      label: "Generated glowing flower hero prop",
      source: "renderer-scene",
      diagnostics: ["The story flower is procedural mesh content in the renderer."]
    }),
    createRendererOwnedEvidenceFlag({
      id: "environment:rainy-neon-alley",
      feature: "environment",
      label: "Procedural rainy neon alley set",
      source: "renderer-scene",
      diagnostics: ["The alley is built from renderer-owned wall, pavement, and neon geometry."]
    }),
    createRendererOwnedEvidenceFlag({
      id: "camera:cinematic-dolly",
      feature: "camera",
      label: "Timeline-driven dolly camera",
      source: "renderer-camera",
      diagnostics: ["The route animates camera zoom and yaw through the renderer viewer controls."]
    }),
    createRendererOwnedEvidenceFlag({
      id: "timeline:12s-shot",
      feature: "timeline",
      label: "12 second cinematic shot plan",
      source: "renderer-timeline",
      diagnostics: ["The cinematic route owns a playable/scrubbable timeline."]
    }),
    createRendererOwnedEvidenceFlag({
      id: "blocking:robot-flower-alley",
      feature: "blocking",
      label: "Robot, flower, and alley scene blocking",
      source: "renderer-scene",
      diagnostics: ["The renderer places the hero character, flower prop, walls, lights, and floor in scene space."]
    })
  );

  const validation = validateRendererOwnedCinematicEvidence(flags, [
    "asset",
    "environment",
    "material",
    "lighting",
    "vfx",
    "camera",
    "timeline",
    "blocking"
  ]);
  return {
    id,
    renderItems,
    collectedLights: [
      createPointLight("cinematic-cyan-neon", [centerX - width * 0.44, floorY + height * 1.6, centerZ - depth * 0.08], [0.04, 0.74, 1], 2.7, 6.5),
      createPointLight("cinematic-magenta-neon", [centerX + width * 0.44, floorY + height * 1.2, centerZ + depth * 0.08], [1, 0.16, 0.82], 2.2, 5.8),
      createPointLight("cinematic-story-flower", [flowerX, floorY + 0.5, flowerZ], [0.58, 1, 0.16], 2.2, 3.2)
    ],
    evidence: {
      id,
      rendererOwned: true,
      renderItemCount: renderItems.length,
      heroPropCount: 1,
      environmentGeometryCount: 6,
      vfxCount: 2,
      practicalLightCount: practicals.practicals.length,
      flags,
      validation,
      diagnostics: [
        `Compiled ${renderItems.length} renderer-owned cinematic render items.`,
        ...rain.diagnostics,
        ...fog.diagnostics,
        ...practicals.diagnostics,
        ...validation.diagnostics
      ]
    },
    dispose() {
      const ownedGeometries = new Set(geometries);
      const ownedMaterials = new Set<Material>(materials);
      for (const item of renderItems) {
        if (!ownedGeometries.has(item.geometry)) item.geometry.dispose();
        const material = item.material as Material | undefined;
        if (material && !ownedMaterials.has(material)) material.dispose();
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };

  function keepGeometry(geometry: Geometry): Geometry {
    geometries.push(geometry);
    return geometry;
  }

  function keepMaterial(material: Material): Material {
    materials.push(material);
    return material;
  }

  function addItem(
    label: string,
    geometry: Geometry,
    material: Material,
    position: readonly [number, number, number],
    scale: readonly [number, number, number]
  ): void {
    renderItems.push({
      label,
      geometry,
      material,
      modelMatrix: composeMat4([...position], [0, 0, 0, 1], [...scale]),
      includeInAutoFrame: false
    });
  }
}

function createPointLight(
  name: string,
  position: readonly [number, number, number],
  color: readonly [number, number, number],
  intensity: number,
  range: number
): CollectedLight {
  const source = new PointLight(name);
  source.color = [...color] as [number, number, number];
  source.intensity = intensity;
  source.range = range;
  return {
    kind: "point",
    color,
    intensity,
    position,
    direction: [0, -1, 0],
    range,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: false,
    layerMask: source.layerMask,
    source
  };
}

export function createCurrentRoutesFlagshipViewer(options: CurrentRoutesFlagshipViewerOptions): Promise<CurrentRoutesFlagshipViewer> {
  return CurrentRoutesFlagshipViewer.create(options);
}

async function loadCurrentRoutesEnvironment(preset: CurrentRoutesEnvironmentPreset, origin: string): Promise<A3DHdrEnvironment> {
  return loadHdrEnvironment({
    id: preset.id,
    label: preset.label,
    url: currentRoutesEnvironmentUrl(preset, origin),
    quality: "interactive",
    intensity: preset.intensity,
    backgroundIntensity: preset.backgroundIntensity,
    rotation: preset.rotation,
    toneMapping: {
      operator: "filmic",
      exposure: preset.exposure,
      whitePoint: preset.whitePoint
    }
  });
}

function createEnvironmentLighting(base: EnvironmentLightingOptions, controls: CurrentRoutesViewerControls, assetId?: string): EnvironmentLightingOptions {
  const exposure = controls.exposure;
  const carConcept = assetId === "car-concept";
  const intensity = base.intensity * exposure;
  const environmentMapIntensity = base.environmentMapIntensity !== undefined
    ? base.environmentMapIntensity * exposure
    : undefined;
  const environmentMapSpecularIntensity = base.environmentMapSpecularIntensity !== undefined
    ? base.environmentMapSpecularIntensity * exposure
    : undefined;
  return {
    ...base,
    intensity: carConcept ? Math.min(intensity, 0.54) : intensity,
    ...(environmentMapIntensity !== undefined ? {
      environmentMapIntensity: carConcept ? Math.min(environmentMapIntensity, 0.32) : environmentMapIntensity
    } : {}),
    ...(environmentMapSpecularIntensity !== undefined ? {
      environmentMapSpecularIntensity: carConcept ? Math.min(environmentMapSpecularIntensity, 0.012) : environmentMapSpecularIntensity
    } : {}),
    environmentMapRotation: controls.environmentRotation,
    ...(base.proceduralMap ? {
      proceduralMap: {
        ...base.proceduralMap,
        ...(carConcept ? { specularColor: [0.045, 0.012, 0.01] as const } : {}),
        intensity: carConcept
          ? Math.min(base.proceduralMap.intensity * exposure, 0.16)
          : base.proceduralMap.intensity * exposure,
        specularIntensity: carConcept
          ? Math.min(base.proceduralMap.specularIntensity * exposure, 0.01)
          : base.proceduralMap.specularIntensity * exposure
      }
    } : {})
  };
}

function createFallbackEnvironmentLighting(controls: CurrentRoutesViewerControls, assetId?: string): EnvironmentLightingOptions {
  const exposure = controls.exposure;
  if (assetId === "car-concept") {
    return {
      color: [0.22, 0.18, 0.16],
      intensity: 0.34 * exposure,
      environmentMapRotation: controls.environmentRotation,
      proceduralMap: {
        skyColor: [0.035, 0.04, 0.05],
        horizonColor: [0.18, 0.12, 0.095],
        groundColor: [0.018, 0.014, 0.012],
        specularColor: [0.12, 0.035, 0.025],
        intensity: 0.28 * exposure,
        specularIntensity: 0.014 * exposure
      }
    };
  }
  return {
    color: [0.76, 0.8, 0.88],
    intensity: 0.62 * exposure,
    environmentMapRotation: controls.environmentRotation,
    proceduralMap: {
      skyColor: [0.38, 0.48, 0.66],
      horizonColor: [0.78, 0.74, 0.64],
      groundColor: [0.09, 0.1, 0.12],
      specularColor: [1, 0.94, 0.82],
      intensity: 0.82 * exposure,
      specularIntensity: 0.96 * exposure
    }
  };
}

function captureMaterialBaseline(scene: A3DGltfScene): MaterialBaseline {
  const baseline = new Map<Material, { roughness?: number; metallic?: number; clearcoat?: number }>();
  for (const material of scene.resources.materialLibrary.values()) {
    baseline.set(material, {
      roughness: numberParameter(material, "u_roughness"),
      metallic: numberParameter(material, "u_metallic"),
      clearcoat: numberParameter(material, "u_clearcoatFactor")
    });
  }
  return baseline;
}

function applyMaterialControls(scene: A3DGltfScene, baseline: MaterialBaseline, controls: CurrentRoutesViewerControls): void {
  const carConcept = scene.metadata.assetId === "car-concept";
  for (const material of scene.resources.materialLibrary.values()) {
    const initial = baseline.get(material);
    if (!initial) continue;
    if (initial.roughness !== undefined) material.setParameter("u_roughness", clamp(initial.roughness * controls.roughnessScale, 0.02, 1));
    if (initial.metallic !== undefined) material.setParameter("u_metallic", clamp(initial.metallic * controls.metallicScale, 0, 1));
    if (initial.clearcoat !== undefined) material.setParameter("u_clearcoatFactor", clamp(initial.clearcoat + controls.clearcoatBoost, 0, 1));
    if (carConcept) {
      applyCarConceptMaterialStability(material, {
        materialKey: material.name,
        profile: "cinematic",
        baseline: initial,
        roughnessScale: controls.roughnessScale,
        metallicScale: controls.metallicScale,
        clearcoatBoost: controls.clearcoatBoost
      });
    }
  }
}

function materialCreationOptionsForCurrentRoutesAsset(assetId: CurrentRoutesFlagshipAssetId): {
  readonly materialRenderStateOverrides?: readonly GLTFMaterialRenderStateOverride[];
} {
  if (assetId !== "car-concept") return {};
  return {
    materialRenderStateOverrides: carConceptMaterialRenderStateOverrides("current-routes-flagship")
  };
}

function numberParameter(material: Material, name: string): number | undefined {
  const value = material.getParameter(name);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

async function timeAsync<T>(factory: () => Promise<T>): Promise<{ readonly value: T; readonly ms: number }> {
  const started = now();
  const value = await factory();
  return { value, ms: now() - started };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

// ── inlined: environments.ts ─────────────────────────────────────────────
export type CurrentRoutesEnvironmentId = "studio-small-08" | "venice-sunset" | "industrial-sunset-puresky";

export interface CurrentRoutesEnvironmentPreset {
  readonly id: CurrentRoutesEnvironmentId;
  readonly label: string;
  readonly localPath: string;
  readonly class: "studio" | "outdoor" | "industrial";
  readonly intensity: number;
  readonly backgroundIntensity: number;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly rotation: number;
}

export const CURRENT_ROUTES_ENVIRONMENTS: readonly CurrentRoutesEnvironmentPreset[] = [
  {
    id: "studio-small-08",
    label: "Studio Small 08",
    localPath: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
    class: "studio",
    intensity: 1.15,
    backgroundIntensity: 0.85,
    exposure: 1,
    whitePoint: 11.2,
    rotation: 0.15
  },
  {
    id: "venice-sunset",
    label: "Venice Sunset",
    localPath: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
    class: "outdoor",
    intensity: 1.35,
    backgroundIntensity: 0.95,
    exposure: 0.9,
    whitePoint: 10.4,
    rotation: 0.62
  },
  {
    id: "industrial-sunset-puresky",
    label: "Industrial Sunset Pure Sky",
    localPath: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
    class: "industrial",
    intensity: 1.28,
    backgroundIntensity: 0.92,
    exposure: 0.88,
    whitePoint: 10.7,
    rotation: 0.34
  }
] as const;

export function listCurrentRoutesEnvironments(): readonly CurrentRoutesEnvironmentPreset[] {
  return CURRENT_ROUTES_ENVIRONMENTS;
}

export function resolveCurrentRoutesEnvironment(id: CurrentRoutesEnvironmentId = "studio-small-08"): CurrentRoutesEnvironmentPreset {
  const environment = CURRENT_ROUTES_ENVIRONMENTS.find((entry) => entry.id === id);
  if (!environment) throw new Error(`Unknown CurrentRoutes environment: ${id}`);
  return environment;
}

export function currentRoutesEnvironmentUrl(environment: CurrentRoutesEnvironmentPreset, origin = ""): string {
  const prefix = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${prefix}/${environment.localPath}`;
}

// ── inlined: FlagshipFoundation.ts ───────────────────────────────────────
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
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly minDepth?: number;
  readonly widthScale?: number;
  readonly heightScale?: number;
  readonly depthScale?: number;
  readonly depthPadding?: number;
  readonly floorOffset?: number;
  readonly floorThickness?: number;
  readonly backdropWidthScale?: number;
  readonly backdropHeightScale?: number;
  readonly backdropDepthOffsetScale?: number;
  readonly backdropThickness?: number;
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
  constructor(private readonly pipeline: ProductionGLTFRenderPipeline) {}

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
    readonly operator?: ProductionToneMappingOperator;
    readonly exposure?: number;
    readonly whitePoint?: number;
  };
}

export class A3DHdrEnvironment {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly pipeline: ProductionPbrHdrPipeline;
  readonly lighting: ProductionEnvironmentLightingResources;

  constructor(options: {
    readonly id: string;
    readonly label: string;
    readonly url: string;
    readonly pipeline: ProductionPbrHdrPipeline;
    readonly lighting: ProductionEnvironmentLightingResources;
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
  const pipeline = await loadProductionGLTFRenderPipeline({
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
  const pipeline = createProductionPbrHdrPipelineFromRadiance(data, {
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
    lighting: createProductionEnvironmentLightingResources(pipeline)
  });
}

export function createStudioLighting(options: A3DStudioLightingOptions = {}): readonly CollectedLight[] {
  const scale = clamp(options.intensityScale ?? 1, 0, 16);
  const shadows = options.shadows ?? true;
  switch (options.preset ?? "product") {
    case "inspection":
      return [
        createDirectionalLight({ name: "a3d-current-routes-inspection-key", direction: [-0.35, -0.72, -0.46], color: [1, 0.98, 0.92], intensity: 2.1 * scale, castsShadow: shadows }),
        createDirectionalLight({ name: "a3d-current-routes-inspection-fill", direction: [0.55, -0.48, -0.34], color: [0.62, 0.74, 1], intensity: 0.72 * scale }),
        createDirectionalLight({ name: "a3d-current-routes-inspection-rim", direction: [0.14, -0.34, 0.93], color: [1, 0.82, 0.62], intensity: 1.16 * scale })
      ];
    case "softbox":
      return [
        createDirectionalLight({ name: "a3d-current-routes-softbox-key", direction: [-0.2, -0.9, -0.32], color: [1, 0.97, 0.91], intensity: 1.75 * scale, castsShadow: shadows }),
        createDirectionalLight({ name: "a3d-current-routes-softbox-fill", direction: [0.44, -0.52, -0.42], color: [0.74, 0.82, 1], intensity: 1.04 * scale })
      ];
    case "product":
    default:
      return [
        createDirectionalLight({ name: "a3d-current-routes-product-key-shadow", direction: [-0.42, -0.82, -0.38], color: [1, 0.95, 0.86], intensity: 2.75 * scale, castsShadow: shadows }),
        createDirectionalLight({ name: "a3d-current-routes-product-fill", direction: [0.62, -0.42, -0.34], color: [0.55, 0.68, 1], intensity: 0.48 * scale }),
        createDirectionalLight({ name: "a3d-current-routes-product-rim", direction: [0.18, -0.34, 0.92], color: [1, 0.82, 0.55], intensity: 1.05 * scale })
      ];
  }
}

export function createGroundedStage(bounds: CameraFrameBounds, options: A3DGroundedStageOptions = {}): A3DGroundedStage {
  const labelPrefix = options.labelPrefix ?? "a3d-current-routes-grounded-stage";
  const assetExtent = boundsExtent(bounds);
  const width = Math.max(options.minWidth ?? 3.8, (bounds.max[0] - bounds.min[0]) * (options.widthScale ?? 2.4));
  const height = Math.max(options.minHeight ?? 2.6, (bounds.max[1] - bounds.min[1]) * (options.heightScale ?? 2.35));
  const depth = Math.max(
    options.minDepth ?? 3.2,
    (bounds.max[2] - bounds.min[2]) * (options.depthScale ?? 3.2) + (options.depthPadding ?? 1.35)
  );
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerY = (bounds.min[1] + bounds.max[1]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const floorOffset = options.floorOffset ?? Math.min(0.05, assetExtent * 0.035);
  const floorThickness = options.floorThickness ?? Math.min(0.035, Math.max(0.002, assetExtent * 0.018));
  const floorY = bounds.min[1] - floorOffset;
  const backZ = bounds.min[2] - depth * (options.backdropDepthOffsetScale ?? 0.42);
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
      modelMatrix: composeMat4([centerX, floorY, centerZ + depth * 0.12], [0, 0, 0, 1], [width, floorThickness, depth])
    },
    ...(contactShadow?.renderItems ?? [])
  ];
  const backgroundItems: RenderItem[] = options.background === false ? [] : [
    {
      label: `${labelPrefix}-backdrop`,
      geometry: stageGeometry,
      material: backdropMaterial,
      modelMatrix: composeMat4(
        [centerX, centerY + height * 0.9, backZ],
        [0, 0, 0, 1],
        [width * (options.backdropWidthScale ?? 1.35), height * (options.backdropHeightScale ?? 2.8), options.backdropThickness ?? 0.05]
      )
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
  const extent = boundsExtent(framedBounds);
  const yawRadians = base.yawRadians + (options.yawRadians ?? 0);
  const pitchRadians = clamp(base.pitchRadians + (options.pitchRadians ?? 0), -1.2, 1.2);
  const zoom = clamp(options.zoom ?? 1, 0.25, 4);
  const paddingRatio = clamp(options.paddingRatio ?? base.paddingRatio * zoom, 0.02, 1.2);
  const minDistance = Math.min(base.minDistance * zoom, Math.max(0.012, extent * 12 * zoom));
  const frame = computePerspectiveCameraFrame(framedBounds, options.viewport, {
    ...base,
    yawRadians,
    pitchRadians,
    paddingRatio,
    minDistance
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
  const source = new DirectionalLight(options.name ?? "a3d-current-routes-directional-light");
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

function boundsExtent(bounds: CameraFrameBounds): number {
  return Math.max(
    0.001,
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  );
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
