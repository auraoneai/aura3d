import {
  createCameraFrame,
  createGroundedStage,
  createStudioLighting,
  loadGltfScene,
  loadHdrEnvironment,
  type A3DCameraFrame,
  type A3DGltfScene,
  type A3DGroundedStage,
  type A3DHdrEnvironment,
  type A3DVec3,
  type A3DViewport
} from "./FlagshipFoundation";
import type { EnvironmentLightingOptions } from "@aura3d/rendering";
import type { Material } from "@aura3d/rendering";
import type { GLTFMaterialRenderStateOverride } from "../../../assets/src/GLTFRenderResources";
import {
  applyCarConceptMaterialStability,
  carConceptMaterialRenderStateOverrides
} from "../../../assets/src/CarConceptMaterialStability";
import {
  createCurrentRoutesInteractiveRenderer,
  type CurrentRoutesInteractiveRenderer,
  type CurrentRoutesRuntimeMetrics,
  type CurrentRoutesScreenshot
} from "../../../rendering/src/threejs-example-parity/index";
import {
  currentRoutesAssetUrl,
  listCurrentRoutesFlagshipAssets,
  resolveCurrentRoutesFlagshipAsset,
  type CurrentRoutesFlagshipAsset,
  type CurrentRoutesFlagshipAssetId
} from "../../../assets/src/threejs-example-parity/index";
import {
  currentRoutesEnvironmentUrl,
  listCurrentRoutesEnvironments,
  resolveCurrentRoutesEnvironment,
  type CurrentRoutesEnvironmentId,
  type CurrentRoutesEnvironmentPreset
} from "../../../environments/src/threejs-example-parity/index";

export {
  listCurrentRoutesFlagshipAssets,
  resolveCurrentRoutesFlagshipAsset,
  listCurrentRoutesEnvironments,
  resolveCurrentRoutesEnvironment
};
export type {
  CurrentRoutesEnvironmentId,
  CurrentRoutesEnvironmentPreset,
  CurrentRoutesFlagshipAsset,
  CurrentRoutesFlagshipAssetId,
  CurrentRoutesRuntimeMetrics,
  CurrentRoutesScreenshot
};

export type CurrentRoutesViewerStatus = "loading" | "ready" | "running" | "error";

export interface CurrentRoutesFlagshipViewerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly origin?: string;
  readonly assetId?: CurrentRoutesFlagshipAssetId;
  readonly environmentId?: CurrentRoutesEnvironmentId;
}

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
  readonly screenshotCount: number;
  readonly error?: string;
}

type MaterialBaseline = ReadonlyMap<Material, {
  readonly roughness?: number;
  readonly metallic?: number;
  readonly clearcoat?: number;
}>;

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
  }) {
    this.origin = options.origin;
    this.viewport = options.viewport;
    this.scene = options.scene;
    this.environmentPreset = options.environmentPreset;
    this.stage = options.stage;
    this.renderer = options.renderer;
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
    this.scene = nextScene;
    this.stage = nextStage;
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
        renderItems: this.stage.renderItems({
          shadows: this.controls.shadows,
          backgroundVisible: this.controls.backgroundVisible
        }),
        collectedLights: createStudioLighting({ preset: "product", shadows: this.controls.shadows }),
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
      screenshotCount: this.screenshotCount,
      ...(this.error ? { error: this.error } : {})
    };
  }

  dispose(): void {
    this.renderer.dispose();
    this.stage.dispose();
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
