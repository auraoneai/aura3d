import {
  Bounds3 as SceneBounds3,
  Camera,
  DirectionalLight,
  Light,
  PointLight,
  Scene,
  SpotLight,
  identityMat4,
  invertMat4,
  multiplyMat4,
  orthographicMat4,
  perspectiveMat4,
  transformPoint,
  type Mat4,
  type Vec3,
  type SceneNode
} from "@galileo3d/scene";
import type { Ray } from "@galileo3d/math";
import { createRenderDevice, type RenderBackendOptions } from "./RenderBackend";
import { type LdrPostprocessPassDescriptor, type RenderDevice, RenderDeviceError, type RenderDeviceDiagnostics, type RenderTarget, type RenderTargetDescriptor } from "./RenderDevice";
import { ENVIRONMENT_BACKGROUND_COLOR_RESOURCE, EnvironmentBackgroundPass, type EnvironmentBackgroundOptions } from "./EnvironmentBackgroundPass";
import { ForwardPass, type EnvironmentLightingOptions, type ForwardEnvironmentFogOptions, type ForwardShadowMapOptions, type RenderItem, type RenderMaterial, type SkinningPaletteBinding } from "./ForwardPass";
import { type CollectedLight, LightCollector } from "./LightCollector";
import { Geometry } from "./Geometry";
import { type MorphTargetDelta } from "./MorphTarget";
import { computeSkinnedMorphTargetWeightedBounds } from "./SkinningBounds";
import { RenderGraph } from "./RenderGraph";
import {
  BloomPass,
  FXAAPass,
  ToneMappingPass,
  bloomFloatPixels,
  bloomPixels,
  chromaticAberrationPixels,
  colorGradePixels,
  contactShadowPixels,
  createDepthTextureBinding,
  depthOfFieldPixels,
  filmGrainPixels,
  fusedLdrPostprocessPixels,
  fxaaPixels,
  motionBlurPixels,
  outlinePixels,
  ssaoPixels,
  ssrPixels,
  taaPixels,
  toneMapFloatPixels,
  toneMapPixels,
  writePostProcessPixels,
  type BloomOptions,
  type ChromaticAberrationOptions,
  type ColorGradeOptions,
  type ContactShadowPostProcessOptions,
  type DepthTextureBinding,
  type DepthOfFieldOptions,
  type FXAAOptions,
  type FilmGrainOptions,
  type FusedLdrPostProcessPass,
  type FusedLdrPostProcessScratch,
  type MotionBlurOptions,
  type OutlineOptions,
  type SSAOOptions,
  type SSROptions,
  type TAAOptions,
  type ToneMappingOptions
} from "./PostProcessPass";
import {
  createRendererPostprocessPasses,
  createRendererPostprocessPlanDiagnostics,
  type RendererPostProcessPassName,
  type RendererPostProcessPassPlan,
  type RendererPostprocessPlanDiagnostics,
  type RendererPostprocessPlanOptions,
  type RendererPostprocessTargetFormat
} from "./RendererPostprocessPlan";
import { createDefaultShaderLibrary, type ShaderLibrary } from "./ShaderLibrary";
import { ShadowMap, type ShadowFilterKernel, type ShadowMapOptions } from "./ShadowMap";
import { ShadowPass } from "./ShadowPass";
import { Sampler } from "./Sampler";
import { TextureBinding } from "./TextureBinding";
import { computePerspectiveCameraFrame, type PerspectiveCameraFrameOptions } from "./CameraFraming";
import {
  assertRendererFeatures,
  createRendererFeatureReport,
  type RendererFeature,
  type RendererFeatureReport
} from "./RendererFeatureGates";
import { batchStaticRenderItems, type StaticBatchOptions, type StaticBatchInput } from "./SceneOptimization";

export interface RendererOptions extends RenderBackendOptions {
  readonly width?: number;
  readonly height?: number;
  readonly clearColor?: readonly [number, number, number, number];
  readonly shaderLibrary?: ShaderLibrary;
  readonly requiredFeatures?: readonly RendererFeature[];
}

export interface ResizeToDisplayOptions {
  readonly cssWidth?: number;
  readonly cssHeight?: number;
  readonly devicePixelRatio?: number;
}

export interface ResizeToDisplayResult {
  readonly resized: boolean;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly width: number;
  readonly height: number;
}

export interface RendererAnimationLoop {
  readonly running: boolean;
  stop(): void;
}

export interface RendererFrameCapture {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly diagnostics: RenderDeviceDiagnostics;
}

export interface RenderSource {
  collectRenderItems?(): Iterable<RenderItem>;
  readonly renderItems?: Iterable<RenderItem>;
  readonly scene?: Scene;
  readonly renderTarget?: RenderTarget;
  readonly cameraPolicy?: RendererCameraPolicy;
  readonly cameraFrameBounds?: SceneBounds3 | {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly cameraFrameOptions?: PerspectiveCameraFrameOptions;
  readonly collectedLights?: Iterable<CollectedLight>;
  readonly environmentBackground?: EnvironmentBackgroundOptions | false;
  readonly environmentLighting?: EnvironmentLightingOptions | false;
  readonly environmentFog?: ForwardEnvironmentFogOptions | false;
  readonly shadowMap?: ForwardShadowMapOptions;
  readonly shadow?: RendererShadowOptions | boolean;
  readonly postprocess?: RendererPostProcessOptions | boolean;
  readonly cameraPosition?: readonly [number, number, number];
  readonly geometryLibrary?: RenderResourceLookup<Geometry>;
  readonly materialLibrary?: RenderResourceLookup<RenderMaterial>;
  readonly morphTargetLibrary?: RenderResourceLookup<readonly MorphTargetDelta[]>;
  readonly frustumCulling?: boolean;
  readonly staticBatching?: boolean | StaticBatchOptions;
}

export interface RendererInput {
  readonly source: RenderSource | Iterable<RenderItem> | Scene;
  readonly camera?: CameraLike;
}

export type RendererCameraPolicy = "identity" | "auto-frame" | "require";

export const DEFAULT_RENDERER_AUTO_FRAME_OPTIONS: PerspectiveCameraFrameOptions = {
  paddingRatio: 0.14,
  yawRadians: -0.38,
  pitchRadians: -0.18,
  nearPadding: 0.2,
  farPadding: 2.4
};

export const DEFAULT_RENDERER_ENVIRONMENT_LIGHTING: EnvironmentLightingOptions = {
  color: [0.78, 0.8, 0.84],
  intensity: 0.42,
  proceduralMap: {
    skyColor: [0.64, 0.76, 0.94],
    horizonColor: [0.94, 0.82, 0.62],
    groundColor: [0.12, 0.13, 0.15],
    specularColor: [1, 0.94, 0.78],
    intensity: 0.5,
    specularIntensity: 0.82
  }
};

const DISABLED_RENDERER_ENVIRONMENT_LIGHTING: EnvironmentLightingOptions = {
  color: [0, 0, 0],
  intensity: 0,
  proceduralMap: {
    skyColor: [0, 0, 0],
    horizonColor: [0, 0, 0],
    groundColor: [0, 0, 0],
    specularColor: [0, 0, 0],
    intensity: 0,
    specularIntensity: 0
  },
  environmentMapIntensity: 0,
  environmentMapSpecularIntensity: 0
};

export const DEFAULT_RENDERER_DIRECT_LIGHTING = {
  key: {
    color: [1, 0.92, 0.78] as const,
    intensity: 2.25,
    direction: [0.42, -0.58, -0.7] as const
  },
  fill: {
    color: [0.48, 0.62, 0.9] as const,
    intensity: 0.55,
    direction: [-0.35, -0.22, -0.91] as const
  }
} as const;

export interface RendererShadowOptions extends ShadowMapOptions {
  readonly enabled?: boolean;
  readonly light?: Light;
  readonly lightMatrix?: Float32Array | readonly number[];
  readonly strength?: number;
  readonly slopeBias?: number;
  readonly texelSize?: readonly [number, number];
  readonly filterKernel?: ShadowFilterKernel;
}

export interface RendererPostProcessOptions extends RendererPostprocessPlanOptions {
  readonly targetFormat?: RendererPostprocessTargetFormat;
}

export type RenderResourceLookup<T> = ReadonlyMap<string, T> | Readonly<Record<string, T>>;

interface RenderCollectionDiagnostics {
  submittedObjects: number;
  visibleObjects: number;
  culledObjects: number;
  frustumTestedObjects: number;
}

interface RendererPostprocessDiagnostics {
  readonly postprocessPasses: number;
  readonly postprocessPassNames: readonly RendererPostProcessPassName[];
  readonly postprocessTargetFormat: RendererPostprocessTargetFormat;
  readonly postprocessRenderTargets: number;
  readonly postprocessTextures: number;
  readonly postprocessTargetWidth: number;
  readonly postprocessTargetHeight: number;
  readonly postprocessPlan: RendererPostprocessPlanDiagnostics;
}

export interface CameraLike {
  readonly projectionMatrix?: Float32Array | readonly number[];
  readonly viewMatrix?: Float32Array | readonly number[];
  readonly viewProjectionMatrix?: Float32Array | readonly number[];
  resize?(width: number, height: number): void;
  updateCameraMatrices?(): void;
}

export interface ScenePickHit {
  readonly node: SceneNode;
  readonly geometry: Geometry;
  readonly distance: number;
  readonly bounds: SceneBounds3;
  readonly hitPoint?: readonly [number, number, number];
  readonly pointIndex?: number;
  readonly instanceIndex?: number;
}

export interface ScenePickOptions {
  readonly pointRadius?: number;
  readonly lineRadius?: number;
}

export class Renderer {
  public readonly device: RenderDevice;
  private readonly graph = new RenderGraph();
  private readonly shaderLibrary: ShaderLibrary;
  private readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  private width: number;
  private height: number;
  private clearColor: readonly [number, number, number, number];
  private disposed = false;
  private animationLoop: RendererAnimationLoopImpl | null = null;
  private readonly fusedLdrPostprocessScratch: FusedLdrPostProcessScratch = {};

  private constructor(device: RenderDevice, options: RendererOptions) {
    this.device = device;
    this.canvas = options.canvas;
    this.width = options.width ?? inferInitialCanvasDimension(options.canvas, "width");
    this.height = options.height ?? inferInitialCanvasDimension(options.canvas, "height");
    this.clearColor = options.clearColor ?? [0, 0, 0, 1];
    this.shaderLibrary = options.shaderLibrary ?? createDefaultShaderLibrary();
    this.resizeCanvas(this.width, this.height);
  }

  static async create(options: RendererOptions = {}): Promise<Renderer> {
    const device = await createRenderDevice(options);
    if (options.requiredFeatures && options.requiredFeatures.length > 0) {
      assertRendererFeatures(device, options.requiredFeatures);
    }
    return new Renderer(device, options);
  }

  getFeatureReport(): RendererFeatureReport {
    return createRendererFeatureReport(this.device);
  }

  resize(width: number, height: number): void {
    this.assertAlive();
    if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
      throw new RenderDeviceError("Renderer dimensions must be positive integers", "INVALID_FRAME_SIZE", { width, height });
    }
    this.width = width;
    this.height = height;
    this.resizeCanvas(width, height);
  }

  resizeToDisplay(options: ResizeToDisplayOptions = {}): ResizeToDisplayResult {
    this.assertAlive();
    if (!this.canvas) {
      throw new RenderDeviceError("resizeToDisplay requires a canvas-backed renderer", "CANVAS_REQUIRED");
    }
    const cssWidth = options.cssWidth ?? readCanvasCssSize(this.canvas, "width");
    const cssHeight = options.cssHeight ?? readCanvasCssSize(this.canvas, "height");
    const devicePixelRatio = options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
    if (![cssWidth, cssHeight, devicePixelRatio].every(Number.isFinite) || cssWidth <= 0 || cssHeight <= 0 || devicePixelRatio <= 0) {
      throw new RenderDeviceError("Display size and DPR must be finite positive values", "INVALID_DISPLAY_SIZE", {
        cssWidth,
        cssHeight,
        devicePixelRatio
      });
    }
    const width = Math.max(1, Math.round(cssWidth * devicePixelRatio));
    const height = Math.max(1, Math.round(cssHeight * devicePixelRatio));
    const resized = width !== this.width || height !== this.height;
    if (resized) {
      this.resize(width, height);
    }
    return { resized, cssWidth, cssHeight, devicePixelRatio, width, height };
  }

  startAnimationLoop(callback: (timeMs: number, renderer: Renderer) => void): RendererAnimationLoop {
    this.assertAlive();
    this.animationLoop?.stop();
    const loop = new RendererAnimationLoopImpl(this, callback);
    this.animationLoop = loop;
    loop.start();
    return loop;
  }

  render(input: RendererInput): RenderDeviceDiagnostics;
  render(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics;
  render(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics {
    this.assertAlive();
    const { source, camera: inputCamera } = normalizeRendererInput(sourceOrInput, camera);
    sceneFromSource(source)?.updateWorldTransforms();
    const cameraPolicy = collectCameraPolicy(source);
    const identityPolicyIgnoresSceneCamera = inputCamera === undefined && cameraPolicy === "identity";
    const autoFrameOverridesSceneCamera = inputCamera === undefined && hasExplicitAutoFrameCameraPolicy(source);
    const resolvedCamera = resolveCamera(source, inputCamera, { width: this.width, height: this.height }, {
      allowSceneCamera: !identityPolicyIgnoresSceneCamera && !autoFrameOverridesSceneCamera
    });
    if (!resolvedCamera && cameraPolicy === "require") {
      throw new RenderDeviceError("RenderSource requires an explicit camera but none was supplied or found in the scene.", "CAMERA_REQUIRED");
    }
    let cameraViewProjection = resolvedCamera?.viewProjectionMatrix;
    const collectedItems = collectRenderItemsWithDiagnostics(source, cameraViewProjection, resolvedCamera?.camera);
    const collectionDiagnostics = collectedItems.diagnostics;
    let items = collectedItems.items;
    const lights = collectRenderLights(source);
    const environmentBackground = collectEnvironmentBackground(source);
    const environmentLighting = collectEnvironmentLighting(source);
    const environmentFog = collectEnvironmentFog(source);
    const explicitShadowMap = collectForwardShadowMap(source);
    const shadowOptions = collectRendererShadowOptions(source);
    const sourceCameraPosition = collectSourceCameraPosition(source);
    const explicitRenderTarget = collectRenderTarget(source);
    validateExplicitRenderTarget(explicitRenderTarget, this.width, this.height);
    let cameraPosition = sourceCameraPosition ?? resolvedCamera?.cameraPosition;
    if (!resolvedCamera && cameraPolicy === "auto-frame") {
      const autoFrame = createAutoFrameCamera(source, items, this.width, this.height);
      if (autoFrame) {
        cameraViewProjection = autoFrame.viewProjectionMatrix;
        items = applyViewProjection(items, autoFrame.viewProjectionMatrix);
        cameraPosition = sourceCameraPosition ?? autoFrame.cameraPosition;
      }
    }
    const postprocess = collectPostprocess(source);
    const ownedTargets: RenderTarget[] = [];
    const ownedShadowPasses: ShadowPass[] = [];
    this.graph.clear();
    let postprocessTargetFormat: Extract<RenderTargetDescriptor["format"], "rgba8" | "rgba16f" | "rgba32f"> | undefined;
    if (postprocess) {
      const format = postprocess.targetFormat ?? defaultPostprocessTargetFormat(this.device, postprocess);
      postprocessTargetFormat = format;
      if ((format === "rgba16f" || format === "rgba32f") && !this.device.info.capabilities?.includes("hdr-render-targets")) {
        throw new RenderDeviceError("Renderer HDR postprocess requires an HDR-capable backend", "HDR_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind,
          format
        });
      }
      if ((format === "rgba16f" || format === "rgba32f") && postprocess.toneMapping === false) {
        throw new RenderDeviceError("Renderer HDR postprocess requires tone mapping before presentation or LDR postprocess passes", "HDR_POSTPROCESS_TONEMAPPING_REQUIRED", {
          backend: this.device.kind,
          format
        });
      }
      if (!this.device.presentRenderTarget) {
        throw new RenderDeviceError("Renderer postprocess requires a backend presentation path", "POSTPROCESS_PRESENT_UNSUPPORTED", {
          backend: this.device.kind
        });
      }
      const requiresDepthTexture = postprocessRequiresDepthTexture(postprocess);
      if (requiresDepthTexture && !this.device.info.capabilities?.includes("depth-textures")) {
        throw new RenderDeviceError("Depth-aware renderer postprocess requires a backend with sampleable depth texture render targets.", "DEPTH_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind
        });
      }
      const forwardTarget = this.device.createRenderTarget({
        width: this.width,
        height: this.height,
        label: "renderer-forward-color",
        format,
        depth: requiresDepthTexture ? "texture" : true
      });
      ownedTargets.push(forwardTarget);
      this.device.setRenderTarget(forwardTarget);
    }
    this.device.beginFrame(this.width, this.height);
    try {
      const rendererShadowMap = explicitShadowMap ?? this.executeRendererShadowMap({
        shadowOptions,
        source,
        items,
        lights,
        ownedTargets,
        ownedShadowPasses
      });
      if (postprocess) {
        const forwardTarget = ownedTargets[0];
        if (!forwardTarget) {
          throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
        }
        this.device.setRenderTarget(forwardTarget);
      } else {
        this.device.setRenderTarget(explicitRenderTarget ?? null);
      }
      this.device.clear(this.clearColor);
      if (environmentBackground) {
        this.graph.addPass(new EnvironmentBackgroundPass({
          ...environmentBackground,
          outputColorSpace: postprocess ? "linear" : environmentBackground.outputColorSpace,
          inverseViewProjectionMatrix: environmentBackground.inverseViewProjectionMatrix ?? invertMat4(cameraViewProjection ?? identityMat4()),
          shaderLibrary: this.shaderLibrary
        }));
      }
      this.graph.addPass(new ForwardPass({
        items,
        lights,
        environmentLighting,
        environmentFog,
        inputColorResource: environmentBackground ? ENVIRONMENT_BACKGROUND_COLOR_RESOURCE : undefined,
        shadowMap: rendererShadowMap,
        cameraPosition,
        outputColorSpace: postprocess ? "linear" : "srgb",
        shaderLibrary: this.shaderLibrary
      }));
      this.graph.execute({ device: this.device, width: this.width, height: this.height });
      if (postprocess) {
        this.executePostprocess(postprocess, ownedTargets, explicitRenderTarget);
      }
    } finally {
      this.device.endFrame();
      for (const shadowPass of ownedShadowPasses) {
        shadowPass.dispose();
      }
      for (const target of ownedTargets) {
        target.dispose();
      }
    }
    return withRendererFrameDiagnostics(this.device.getDiagnostics(), collectionDiagnostics, createPostprocessDiagnostics(postprocess, ownedTargets, this.width, this.height, {
      targetFormat: postprocessTargetFormat,
      nativeLdrPostprocess: Boolean(this.device.presentLdrPostprocess),
      rendererDepthAvailable: Boolean(postprocess && postprocessRequiresDepthTexture(postprocess) && this.device.info.capabilities?.includes("depth-textures"))
    }));
  }

  renderAsync(input: RendererInput): Promise<RenderDeviceDiagnostics>;
  renderAsync(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics>;
  async renderAsync(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics> {
    this.assertAlive();
    const { source, camera: inputCamera } = normalizeRendererInput(sourceOrInput, camera);
    sceneFromSource(source)?.updateWorldTransforms();
    const cameraPolicy = collectCameraPolicy(source);
    const identityPolicyIgnoresSceneCamera = inputCamera === undefined && cameraPolicy === "identity";
    const autoFrameOverridesSceneCamera = inputCamera === undefined && hasExplicitAutoFrameCameraPolicy(source);
    const resolvedCamera = resolveCamera(source, inputCamera, { width: this.width, height: this.height }, {
      allowSceneCamera: !identityPolicyIgnoresSceneCamera && !autoFrameOverridesSceneCamera
    });
    if (!resolvedCamera && cameraPolicy === "require") {
      throw new RenderDeviceError("RenderSource requires an explicit camera but none was supplied or found in the scene.", "CAMERA_REQUIRED");
    }
    let cameraViewProjection = resolvedCamera?.viewProjectionMatrix;
    const collectedItems = collectRenderItemsWithDiagnostics(source, cameraViewProjection, resolvedCamera?.camera);
    const collectionDiagnostics = collectedItems.diagnostics;
    let items = collectedItems.items;
    const lights = collectRenderLights(source);
    const environmentBackground = collectEnvironmentBackground(source);
    const environmentLighting = collectEnvironmentLighting(source);
    const environmentFog = collectEnvironmentFog(source);
    const explicitShadowMap = collectForwardShadowMap(source);
    const shadowOptions = collectRendererShadowOptions(source);
    const sourceCameraPosition = collectSourceCameraPosition(source);
    const explicitRenderTarget = collectRenderTarget(source);
    validateExplicitRenderTarget(explicitRenderTarget, this.width, this.height);
    let cameraPosition = sourceCameraPosition ?? resolvedCamera?.cameraPosition;
    if (!resolvedCamera && cameraPolicy === "auto-frame") {
      const autoFrame = createAutoFrameCamera(source, items, this.width, this.height);
      if (autoFrame) {
        cameraViewProjection = autoFrame.viewProjectionMatrix;
        items = applyViewProjection(items, autoFrame.viewProjectionMatrix);
        cameraPosition = sourceCameraPosition ?? autoFrame.cameraPosition;
      }
    }
    const postprocess = collectPostprocess(source);
    const ownedTargets: RenderTarget[] = [];
    const ownedShadowPasses: ShadowPass[] = [];
    this.graph.clear();
    let postprocessTargetFormat: Extract<RenderTargetDescriptor["format"], "rgba8" | "rgba16f" | "rgba32f"> | undefined;
    if (postprocess) {
      const format = postprocess.targetFormat ?? defaultPostprocessTargetFormat(this.device, postprocess);
      postprocessTargetFormat = format;
      if ((format === "rgba16f" || format === "rgba32f") && !this.device.info.capabilities?.includes("hdr-render-targets")) {
        throw new RenderDeviceError("Renderer HDR postprocess requires an HDR-capable backend", "HDR_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind,
          format
        });
      }
      if ((format === "rgba16f" || format === "rgba32f") && postprocess.toneMapping === false) {
        throw new RenderDeviceError("Renderer HDR postprocess requires tone mapping before presentation or LDR postprocess passes", "HDR_POSTPROCESS_TONEMAPPING_REQUIRED", {
          backend: this.device.kind,
          format
        });
      }
      if (!this.device.presentRenderTarget) {
        throw new RenderDeviceError("Renderer postprocess requires a backend presentation path", "POSTPROCESS_PRESENT_UNSUPPORTED", {
          backend: this.device.kind
        });
      }
      const requiresDepthTexture = postprocessRequiresDepthTexture(postprocess);
      if (requiresDepthTexture && !this.device.info.capabilities?.includes("depth-textures")) {
        throw new RenderDeviceError("Depth-aware renderer postprocess requires a backend with sampleable depth texture render targets.", "DEPTH_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind
        });
      }
      const forwardTarget = this.device.createRenderTarget({
        width: this.width,
        height: this.height,
        label: "renderer-forward-color",
        format,
        depth: requiresDepthTexture ? "texture" : true
      });
      ownedTargets.push(forwardTarget);
      this.device.setRenderTarget(forwardTarget);
    }
    this.device.beginFrame(this.width, this.height);
    try {
      const rendererShadowMap = explicitShadowMap ?? this.executeRendererShadowMap({
        shadowOptions,
        source,
        items,
        lights,
        ownedTargets,
        ownedShadowPasses
      });
      if (postprocess) {
        const forwardTarget = ownedTargets[0];
        if (!forwardTarget) {
          throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
        }
        this.device.setRenderTarget(forwardTarget);
      } else {
        this.device.setRenderTarget(explicitRenderTarget ?? null);
      }
      this.device.clear(this.clearColor);
      if (environmentBackground) {
        this.graph.addPass(new EnvironmentBackgroundPass({
          ...environmentBackground,
          outputColorSpace: postprocess ? "linear" : environmentBackground.outputColorSpace,
          inverseViewProjectionMatrix: environmentBackground.inverseViewProjectionMatrix ?? invertMat4(cameraViewProjection ?? identityMat4()),
          shaderLibrary: this.shaderLibrary
        }));
      }
      this.graph.addPass(new ForwardPass({
        items,
        lights,
        environmentLighting,
        environmentFog,
        inputColorResource: environmentBackground ? ENVIRONMENT_BACKGROUND_COLOR_RESOURCE : undefined,
        shadowMap: rendererShadowMap,
        cameraPosition,
        outputColorSpace: postprocess ? "linear" : "srgb",
        shaderLibrary: this.shaderLibrary
      }));
      this.graph.execute({ device: this.device, width: this.width, height: this.height });
      if (postprocess) {
        await this.executePostprocessAsync(postprocess, ownedTargets, explicitRenderTarget);
      }
    } finally {
      this.device.endFrame();
      for (const shadowPass of ownedShadowPasses) {
        shadowPass.dispose();
      }
      for (const target of ownedTargets) {
        target.dispose();
      }
    }
    return withRendererFrameDiagnostics(this.device.getDiagnostics(), collectionDiagnostics, createPostprocessDiagnostics(postprocess, ownedTargets, this.width, this.height, {
      targetFormat: postprocessTargetFormat,
      nativeLdrPostprocess: Boolean(this.device.presentLdrPostprocess),
      rendererDepthAvailable: Boolean(postprocess && postprocessRequiresDepthTexture(postprocess) && this.device.info.capabilities?.includes("depth-textures"))
    }));
  }

  renderScene(scene: RenderSource | Scene, camera?: CameraLike): RenderDeviceDiagnostics {
    return this.render(scene, camera);
  }

  renderItems(items: Iterable<RenderItem>, camera?: CameraLike, options: Omit<RenderSource, "renderItems"> = {}): RenderDeviceDiagnostics {
    return this.render({ ...options, renderItems: items }, camera);
  }

  captureFrame(source?: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RendererFrameCapture {
    const diagnostics = source ? this.render(source, camera) : this.device.getDiagnostics();
    return {
      width: this.width,
      height: this.height,
      pixels: this.device.readPixels(0, 0, this.width, this.height),
      diagnostics
    };
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.device.getDiagnostics();
  }

  dispose(): void {
    this.animationLoop?.stop();
    this.animationLoop = null;
    this.device.dispose();
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed || this.device.disposed) {
      throw new RenderDeviceError("Renderer is disposed", "DISPOSED_DEVICE");
    }
  }

  private resizeCanvas(width: number, height: number): void {
    if (!this.canvas) return;
    if (this.canvas.width !== width) {
      this.canvas.width = width;
    }
    if (this.canvas.height !== height) {
      this.canvas.height = height;
    }
  }

  private executePostprocess(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget?: RenderTarget): void {
    const forwardTarget = ownedTargets[0];
    let current = forwardTarget;
    if (!current) {
      throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
    }
    const passes = createRendererPostprocessPasses(postprocess);
    if (passes.length === 0) {
      if (outputTarget) {
        this.device.setRenderTarget(current);
        writePostProcessPixels(this.device, current, outputTarget, this.device.readPixels(0, 0, current.width, current.height));
      } else {
        this.device.presentRenderTarget?.(current);
      }
      return;
    }
    if (this.executeFusedLdrPostprocess(current, passes, outputTarget)) return;
    for (let index = 0; index < passes.length; index += 1) {
      const pass = passes[index]!;
      const nextPass = passes[index + 1];
      if (pass.name === "bloom" && isHdrRenderTarget(current)) {
        if (nextPass?.name !== "tone-mapping") {
          throw new RenderDeviceError("Renderer HDR bloom requires tone mapping immediately after the float bloom pass.", "HDR_BLOOM_TONEMAPPING_REQUIRED", {
            source: current.label
          });
        }
        const isCombinedLast = index + 1 === passes.length - 1;
        const target = isCombinedLast ? outputTarget : this.device.createRenderTarget({
          width: this.width,
          height: this.height,
          label: "renderer-postprocess-tone-mapping",
          format: "rgba8",
          depth: false
        });
        if (target) ownedTargets.push(target);
        this.device.setRenderTarget(current);
        const bloomed = bloomFloatPixels(
          this.device.readFloatPixels(0, 0, current.width, current.height),
          current.width,
          current.height,
          pass.options as BloomOptions
        );
        const mapped = toneMapFloatPixels(
          bloomed.pixels,
          current.width,
          current.height,
          {
            outputColorSpace: "srgb",
            ...(nextPass.options as ToneMappingOptions)
          }
        );
        writePostProcessPixels(this.device, current, target, mapped.pixels);
        if (target) current = target;
        index += 1;
        continue;
      }
      const isLast = index === passes.length - 1;
      const target = isLast ? outputTarget : this.device.createRenderTarget({
        width: this.width,
        height: this.height,
        label: `renderer-postprocess-${pass.name}`,
        format: "rgba8",
        depth: false
      });
      if (target) ownedTargets.push(target);
      if (pass.name === "tone-mapping") {
        new ToneMappingPass({
          source: current,
          target,
          outputColorSpace: "srgb",
          ...(pass.options as ToneMappingOptions)
        }).execute({ device: this.device, width: this.width, height: this.height });
      } else if (pass.name === "bloom") {
        new BloomPass({
          source: current,
          target,
          ...(pass.options as BloomOptions)
        }).execute({ device: this.device, width: this.width, height: this.height });
      } else if (pass.name === "fxaa") {
        new FXAAPass({
          source: current,
          target,
          ...(pass.options as FXAAOptions)
        }).execute({ device: this.device, width: this.width, height: this.height });
      } else {
        this.executePixelPostprocessPass(pass, current, target, forwardTarget);
      }
      if (target) current = target;
    }
  }

  private executeFusedLdrPostprocess(current: RenderTarget, passes: readonly RendererPostProcessPassPlan[], outputTarget?: RenderTarget): boolean {
    if (!canFuseLdrPostprocess(current, passes)) return false;
    if (this.device.presentLdrPostprocess) {
      this.device.presentLdrPostprocess(current, {
        passes: passes.map((pass) => ({
          name: pass.name,
          options: pass.options as Readonly<Record<string, unknown>>
        })) as readonly LdrPostprocessPassDescriptor[],
        ...(outputTarget ? { outputTarget } : {}),
        toneMappingDefaults: { outputColorSpace: "srgb" }
      });
      return true;
    }
    this.device.setRenderTarget(current);
    const pixels = fusedLdrPostprocessPixels(
      this.device.readPixels(0, 0, current.width, current.height),
      current.width,
      current.height,
      passes as readonly FusedLdrPostProcessPass[],
      {
        mutateInput: true,
        scratch: this.fusedLdrPostprocessScratch,
        toneMappingDefaults: { outputColorSpace: "srgb" }
      }
    );
    writePostProcessPixels(this.device, current, outputTarget, pixels);
    return true;
  }

  private async executePostprocessAsync(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget?: RenderTarget): Promise<void> {
    const forwardTarget = ownedTargets[0];
    let current = forwardTarget;
    if (!current) {
      throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
    }
    const passes = createRendererPostprocessPasses(postprocess);
    if (passes.length === 0) {
      if (outputTarget) {
        this.device.setRenderTarget(current);
        writePostProcessPixels(this.device, current, outputTarget, await this.readRenderTargetPixelsAsync(current));
      } else {
        this.device.presentRenderTarget?.(current);
      }
      return;
    }
    if (await this.executeFusedLdrPostprocessAsync(current, passes, outputTarget)) return;
    for (let index = 0; index < passes.length; index += 1) {
      const pass = passes[index]!;
      const nextPass = passes[index + 1];
      if (pass.name === "bloom" && isHdrRenderTarget(current)) {
        if (nextPass?.name !== "tone-mapping") {
          throw new RenderDeviceError("Renderer HDR bloom requires tone mapping immediately after the float bloom pass.", "HDR_BLOOM_TONEMAPPING_REQUIRED", {
            source: current.label
          });
        }
        const isCombinedLast = index + 1 === passes.length - 1;
        const target = isCombinedLast ? outputTarget : this.device.createRenderTarget({
          width: this.width,
          height: this.height,
          label: "renderer-postprocess-tone-mapping",
          format: "rgba8",
          depth: false
        });
        if (target) ownedTargets.push(target);
        const bloomed = bloomFloatPixels(
          await this.readRenderTargetFloatPixelsAsync(current),
          current.width,
          current.height,
          pass.options as BloomOptions
        );
        const mapped = toneMapFloatPixels(
          bloomed.pixels,
          current.width,
          current.height,
          {
            outputColorSpace: "srgb",
            ...(nextPass.options as ToneMappingOptions)
          }
        );
        writePostProcessPixels(this.device, current, target, mapped.pixels);
        if (target) current = target;
        index += 1;
        continue;
      }
      const isLast = index === passes.length - 1;
      const target = isLast ? outputTarget : this.device.createRenderTarget({
        width: this.width,
        height: this.height,
        label: `renderer-postprocess-${pass.name}`,
        format: "rgba8",
        depth: false
      });
      if (target) ownedTargets.push(target);
      if (pass.name === "tone-mapping") {
        const mapped = isHdrRenderTarget(current)
          ? toneMapFloatPixels(await this.readRenderTargetFloatPixelsAsync(current), current.width, current.height, {
              outputColorSpace: "srgb",
              ...(pass.options as ToneMappingOptions)
            })
          : toneMapPixels(await this.readRenderTargetPixelsAsync(current), current.width, current.height, {
              outputColorSpace: "srgb",
              ...(pass.options as ToneMappingOptions)
            });
        writePostProcessPixels(this.device, current, target, mapped.pixels);
      } else if (pass.name === "bloom") {
        const bloomed = bloomPixels(await this.readRenderTargetPixelsAsync(current), current.width, current.height, pass.options as BloomOptions);
        writePostProcessPixels(this.device, current, target, bloomed.pixels);
      } else if (pass.name === "fxaa") {
        const smoothed = fxaaPixels(await this.readRenderTargetPixelsAsync(current), current.width, current.height, pass.options as FXAAOptions);
        writePostProcessPixels(this.device, current, target, smoothed.pixels);
      } else {
        await this.executePixelPostprocessPassAsync(pass, current, target, forwardTarget);
      }
      if (target) current = target;
    }
  }

  private async executeFusedLdrPostprocessAsync(current: RenderTarget, passes: readonly RendererPostProcessPassPlan[], outputTarget?: RenderTarget): Promise<boolean> {
    if (!canFuseLdrPostprocess(current, passes)) return false;
    if (this.device.presentLdrPostprocess) {
      this.device.presentLdrPostprocess(current, {
        passes: passes.map((pass) => ({
          name: pass.name,
          options: pass.options as Readonly<Record<string, unknown>>
        })) as readonly LdrPostprocessPassDescriptor[],
        ...(outputTarget ? { outputTarget } : {}),
        toneMappingDefaults: { outputColorSpace: "srgb" }
      });
      return true;
    }
    const pixels = fusedLdrPostprocessPixels(
      await this.readRenderTargetPixelsAsync(current),
      current.width,
      current.height,
      passes as readonly FusedLdrPostProcessPass[],
      {
        mutateInput: true,
        scratch: this.fusedLdrPostprocessScratch,
        toneMappingDefaults: { outputColorSpace: "srgb" }
      }
    );
    writePostProcessPixels(this.device, current, outputTarget, pixels);
    return true;
  }

  private executePixelPostprocessPass(pass: RendererPostProcessPassPlan, source: RenderTarget, target: RenderTarget | undefined, forwardTarget: RenderTarget): void {
    this.device.setRenderTarget(source);
    const input = this.device.readPixels(0, 0, source.width, source.height);
    const rendererDepth = isDepthPostprocessPass(pass.name) && !postprocessPassHasDepth(pass.options)
      ? this.readRendererOwnedDepthTexture(forwardTarget)
      : undefined;
    const result = pass.name === "color-grade"
      ? colorGradePixels(input, source.width, source.height, pass.options as ColorGradeOptions).pixels
      : pass.name === "chromatic-aberration"
        ? chromaticAberrationPixels(input, source.width, source.height, pass.options as ChromaticAberrationOptions).pixels
        : pass.name === "film-grain"
          ? filmGrainPixels(input, source.width, source.height, pass.options as FilmGrainOptions).pixels
          : pass.name === "depth-of-field"
          ? depthOfFieldPixels(input, source.width, source.height, withRendererDepth(pass.options as DepthOfFieldOptions, rendererDepth)).pixels
          : pass.name === "motion-blur"
            ? motionBlurPixels(input, source.width, source.height, pass.options as MotionBlurOptions).pixels
            : pass.name === "contact-shadow"
              ? contactShadowPixels(input, source.width, source.height, withRendererDepth(pass.options as ContactShadowPostProcessOptions, rendererDepth)).pixels
            : pass.name === "ssao"
              ? ssaoPixels(input, source.width, source.height, withRendererDepth(pass.options as SSAOOptions, rendererDepth)).pixels
              : pass.name === "ssr"
                ? ssrPixels(input, source.width, source.height, withRendererDepth(pass.options as SSROptions, rendererDepth)).pixels
                  : pass.name === "taa"
                    ? taaPixels(input, source.width, source.height, pass.options as TAAOptions).pixels
                    : pass.name === "outline"
                      ? outlinePixels(input, source.width, source.height, pass.options as OutlineOptions).pixels
                      : undefined;
    if (!result) {
      throw new RenderDeviceError("Renderer postprocess pass is outside the supported renderer pass catalog", "POSTPROCESS_PASS_UNKNOWN", {
        pass: pass.name
      });
    }
    writePostProcessPixels(this.device, source, target, result);
  }

  private async executePixelPostprocessPassAsync(pass: RendererPostProcessPassPlan, source: RenderTarget, target: RenderTarget | undefined, forwardTarget: RenderTarget): Promise<void> {
    const input = await this.readRenderTargetPixelsAsync(source);
    const rendererDepth = isDepthPostprocessPass(pass.name) && !postprocessPassHasDepth(pass.options)
      ? this.readRendererOwnedDepthTexture(forwardTarget)
      : undefined;
    const result = pass.name === "color-grade"
      ? colorGradePixels(input, source.width, source.height, pass.options as ColorGradeOptions).pixels
      : pass.name === "chromatic-aberration"
        ? chromaticAberrationPixels(input, source.width, source.height, pass.options as ChromaticAberrationOptions).pixels
        : pass.name === "film-grain"
          ? filmGrainPixels(input, source.width, source.height, pass.options as FilmGrainOptions).pixels
          : pass.name === "depth-of-field"
          ? depthOfFieldPixels(input, source.width, source.height, withRendererDepth(pass.options as DepthOfFieldOptions, rendererDepth)).pixels
          : pass.name === "motion-blur"
            ? motionBlurPixels(input, source.width, source.height, pass.options as MotionBlurOptions).pixels
            : pass.name === "contact-shadow"
              ? contactShadowPixels(input, source.width, source.height, withRendererDepth(pass.options as ContactShadowPostProcessOptions, rendererDepth)).pixels
            : pass.name === "ssao"
              ? ssaoPixels(input, source.width, source.height, withRendererDepth(pass.options as SSAOOptions, rendererDepth)).pixels
              : pass.name === "ssr"
                ? ssrPixels(input, source.width, source.height, withRendererDepth(pass.options as SSROptions, rendererDepth)).pixels
                  : pass.name === "taa"
                    ? taaPixels(input, source.width, source.height, pass.options as TAAOptions).pixels
                    : pass.name === "outline"
                      ? outlinePixels(input, source.width, source.height, pass.options as OutlineOptions).pixels
                      : undefined;
    if (!result) {
      throw new RenderDeviceError("Renderer postprocess pass is outside the supported renderer pass catalog", "POSTPROCESS_PASS_UNKNOWN", {
        pass: pass.name
      });
    }
    writePostProcessPixels(this.device, source, target, result);
  }

  private async readRenderTargetPixelsAsync(target: RenderTarget): Promise<Uint8Array> {
    this.device.setRenderTarget(target);
    if (this.device.readPixelsAsync && target.colorTexture.format === "rgba8") {
      return this.device.readPixelsAsync(0, 0, target.width, target.height);
    }
    return this.device.readPixels(0, 0, target.width, target.height);
  }

  private async readRenderTargetFloatPixelsAsync(target: RenderTarget): Promise<Float32Array> {
    this.device.setRenderTarget(target);
    if (this.device.readFloatPixelsAsync && isHdrRenderTarget(target)) {
      return this.device.readFloatPixelsAsync(0, 0, target.width, target.height);
    }
    return this.device.readFloatPixels(0, 0, target.width, target.height);
  }

  private readRendererOwnedDepthTexture(forwardTarget: RenderTarget): DepthTextureBinding {
    if (!forwardTarget.depthTexture) {
      throw new RenderDeviceError("Renderer-owned depth postprocess requires the forward target to expose a depth texture.", "POSTPROCESS_DEPTH_TARGET_MISSING", {
        renderTarget: forwardTarget.label
      });
    }
    if (!this.device.readDepthPixels) {
      throw new RenderDeviceError("Renderer-owned depth postprocess requires backend depth readback.", "DEPTH_READBACK_UNSUPPORTED", {
        backend: this.device.kind
      });
    }
    this.device.setRenderTarget(forwardTarget);
    return createDepthTextureBinding({
      label: forwardTarget.depthTexture.label,
      width: forwardTarget.width,
      height: forwardTarget.height,
      data: this.device.readDepthPixels(0, 0, forwardTarget.width, forwardTarget.height)
    });
  }

  private executeRendererShadowMap(options: {
    readonly shadowOptions: RendererShadowOptions | undefined;
    readonly source: RenderSource | Iterable<RenderItem> | Scene;
    readonly items: readonly RenderItem[];
    readonly lights: readonly CollectedLight[];
    readonly ownedTargets: RenderTarget[];
    readonly ownedShadowPasses: ShadowPass[];
  }): ForwardShadowMapOptions | undefined {
    if (!options.shadowOptions || options.shadowOptions.enabled === false) {
      return undefined;
    }
    if (!this.device.info.capabilities?.includes("render-targets")) {
      throw new RenderDeviceError("Renderer-owned shadows require render targets", "SHADOW_RENDER_TARGET_UNSUPPORTED", {
        backend: this.device.kind
      });
    }
    const light = options.shadowOptions.light ?? firstShadowCastingLight(options.source, options.lights);
    if (light instanceof PointLight) {
      return this.executeRendererPointShadowMap({
        shadowOptions: options.shadowOptions,
        items: options.items,
        ownedTargets: options.ownedTargets,
        ownedShadowPasses: options.ownedShadowPasses,
        light
      });
    }
    if (light && !(light instanceof DirectionalLight) && !(light instanceof SpotLight)) {
      throw new RenderDeviceError("Renderer-owned shadow maps require directional, spot, or point lights.", "SHADOW_LIGHT_TYPE_UNSUPPORTED", {
        lightName: light.name,
        lightType: light.constructor.name
      });
    }
    const lightMatrix = options.shadowOptions.lightMatrix
      ? toMat4(options.shadowOptions.lightMatrix, "shadow.lightMatrix")
      : createRendererOwnedShadowMatrix(light, options.items, firstShadowCastingCollectedLight(options.lights));
    const shadowMap = new ShadowMap({
      size: options.shadowOptions.size,
      bias: options.shadowOptions.bias,
      filter: options.shadowOptions.filter,
      pcfRadius: options.shadowOptions.pcfRadius,
      pcfSamples: options.shadowOptions.pcfSamples,
      pcfDistribution: options.shadowOptions.pcfDistribution,
      label: options.shadowOptions.label ?? "renderer-shadow-map"
    });
    const shadowPass = new ShadowPass({
      light,
      casters: options.items,
      shadowMap,
      viewProjectionMatrix: lightMatrix,
      shaderLibrary: this.shaderLibrary
    });
    options.ownedShadowPasses.push(shadowPass);
    const result = shadowPass.execute({ device: this.device, width: this.width, height: this.height });
    if (!result.rendered) {
      if (result.reason === "no-light" || result.reason === "light-disabled" || result.reason === "not-shadow-casting") {
        throw new RenderDeviceError("Renderer-owned shadows require an enabled shadow-casting light.", "SHADOW_LIGHT_REQUIRED", {
          reason: result.reason
        });
      }
      return undefined;
    }
    return shadowPass.getForwardShadowMap({
      lightMatrix,
      strength: options.shadowOptions.strength,
      slopeBias: options.shadowOptions.slopeBias,
      texelSize: options.shadowOptions.texelSize,
      bias: options.shadowOptions.bias,
      filterKernel: options.shadowOptions.filterKernel
    }) ?? undefined;
  }

  private executeRendererPointShadowMap(options: {
    readonly shadowOptions: RendererShadowOptions;
    readonly items: readonly RenderItem[];
    readonly ownedTargets: RenderTarget[];
    readonly ownedShadowPasses: ShadowPass[];
    readonly light: PointLight;
  }): ForwardShadowMapOptions | undefined {
    if (!this.device.writeRenderTargetPixels) {
      throw new RenderDeviceError("Renderer-owned point shadows require render-target pixel upload for the point-light atlas.", "POINT_SHADOW_ATLAS_UPLOAD_UNSUPPORTED", {
        backend: this.device.kind
      });
    }
    options.light.transform.updateWorld(undefined, true);
    const size = options.shadowOptions.size ?? 512;
    const faceMatrices = createPointShadowFaceMatrices(options.light);
    const faceRects = createPointShadowFaceRects();
    const shadowMapOptions = {
      size,
      bias: options.shadowOptions.bias,
      filter: options.shadowOptions.filter,
      pcfRadius: options.shadowOptions.pcfRadius,
      pcfSamples: options.shadowOptions.pcfSamples,
      pcfDistribution: options.shadowOptions.pcfDistribution
    };
    const atlasPixels = new Uint8Array(size * 3 * size * 2 * 4);
    for (let face = 0; face < 6; face += 1) {
      const faceMatrix = faceMatrices.slice(face * 16, face * 16 + 16);
      const shadowPass = new ShadowPass({
        light: options.light,
        casters: options.items,
        shadowMap: new ShadowMap({ ...shadowMapOptions, label: `${options.shadowOptions.label ?? "renderer-point-shadow"}-face-${face}` }),
        viewProjectionMatrix: faceMatrix,
        shaderLibrary: this.shaderLibrary
      });
      options.ownedShadowPasses.push(shadowPass);
      const result = shadowPass.execute({ device: this.device, width: this.width, height: this.height });
      if (!result.rendered) {
        return undefined;
      }
      const target = shadowPass.getRenderTarget();
      if (!target) {
        throw new RenderDeviceError("Renderer-owned point shadow face did not expose a render target.", "POINT_SHADOW_FACE_TARGET_MISSING", { face });
      }
      const facePixels = readShadowFacePixels(this.device, target);
      blitPointShadowFace(atlasPixels, size * 3, size * 2, facePixels, size, faceRects, face);
    }
    const atlasTarget = this.device.createRenderTarget({
      width: size * 3,
      height: size * 2,
      label: `${options.shadowOptions.label ?? "renderer-point-shadow"}-atlas`,
      format: "rgba8",
      depth: false
    });
    options.ownedTargets.push(atlasTarget);
    this.device.writeRenderTargetPixels(atlasTarget, atlasPixels);
    const texture = new TextureBinding({
      name: "u_pointShadowMapTexture",
      texture: atlasTarget.colorTexture,
      sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
      required: true
    });
    return {
      texture: new TextureBinding({
        name: "u_shadowMapTexture",
        texture: atlasTarget.colorTexture,
        sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
        required: true
      }),
      lightMatrix: identityMat4(),
      strength: options.shadowOptions.strength,
      slopeBias: options.shadowOptions.slopeBias,
      texelSize: options.shadowOptions.texelSize,
      bias: options.shadowOptions.bias,
      filterKernel: options.shadowOptions.filterKernel,
      pointLight: {
        texture,
        lightPosition: [options.light.transform.worldMatrix[12], options.light.transform.worldMatrix[13], options.light.transform.worldMatrix[14]],
        range: options.light.range,
        faceMatrices,
        faceRects,
        strength: options.shadowOptions.strength,
        slopeBias: options.shadowOptions.slopeBias,
        texelSize: [1 / Math.max(1, size * 3), 1 / Math.max(1, size * 2)],
        bias: options.shadowOptions.bias,
        filterKernel: options.shadowOptions.filterKernel
      }
    };
  }
}

export function pickSceneRenderables(
  source: Pick<RenderSource, "geometryLibrary" | "morphTargetLibrary" | "scene">,
  ray: Ray,
  options: ScenePickOptions = {}
): ScenePickHit | undefined {
  return pickSceneRenderableHits(source, ray, options)[0];
}

export function pickSceneRenderableHits(
  source: Pick<RenderSource, "geometryLibrary" | "morphTargetLibrary" | "scene">,
  ray: Ray,
  options: ScenePickOptions = {}
): readonly ScenePickHit[] {
  const pointRadius = options.pointRadius;
  const lineRadius = options.lineRadius;
  if (pointRadius !== undefined && (!Number.isFinite(pointRadius) || pointRadius <= 0)) {
    throw new RenderDeviceError("Scene point picking radius must be a finite positive number", "SCENE_PICK_RADIUS_INVALID", { pointRadius });
  }
  if (lineRadius !== undefined && (!Number.isFinite(lineRadius) || lineRadius <= 0)) {
    throw new RenderDeviceError("Scene line picking radius must be a finite positive number", "SCENE_PICK_RADIUS_INVALID", { lineRadius });
  }
  const scene = source.scene;
  if (!scene) {
    throw new RenderDeviceError("Scene picking requires a scene", "SCENE_PICKING_SCENE_MISSING");
  }
  if (!source.geometryLibrary) {
    throw new RenderDeviceError("Scene picking requires a geometryLibrary resource lookup", "SCENE_PICKING_RESOURCES_MISSING");
  }

  scene.updateWorldTransforms();
  const hits: ScenePickHit[] = [];
  for (const { node, renderable } of scene.collectRenderables()) {
    const geometry = lookupRenderResource(source.geometryLibrary, renderable.geometry);
    if (!geometry) {
      throw new RenderDeviceError("Scene pick target references missing geometry", "SCENE_PICK_GEOMETRY_MISSING", {
        node: node.name,
        geometry: renderable.geometry
      });
    }
    const morphTargets = source.morphTargetLibrary ? lookupRenderResource(source.morphTargetLibrary, renderable.geometry) : undefined;
    if (renderable.morphWeights.length > 0 && !morphTargets) {
      throw new RenderDeviceError("Scene pick target has morph weights but no morph target resource entry", "SCENE_PICK_MORPH_TARGETS_MISSING", {
        node: node.name,
        geometry: renderable.geometry,
        morphWeights: renderable.morphWeights.length
      });
    }
    const bounds = renderableWorldBounds(geometry, node.transform.worldMatrix, renderable.instanceTransforms, morphTargets, renderable.morphWeights, renderable.skinning);
    if (geometry.topology === "points" && options.pointRadius !== undefined) {
      hits.push(...pickPoints(node, geometry, ray, node.transform.worldMatrix, renderable.instanceTransforms, options.pointRadius));
      continue;
    }
    const pickBounds = geometry.topology === "lines" && options.lineRadius !== undefined
      ? expandSceneBounds(bounds, options.lineRadius)
      : bounds;
    const hitPoint = ray.intersectBox(pickBounds.toMathBox());
    if (hitPoint) {
      hits.push({ node, geometry, bounds: pickBounds, distance: hitPoint.distanceTo(ray.origin), hitPoint: hitPoint.toArray() });
    }
  }
  return hits.sort((left, right) => left.distance - right.distance);
}

function pickPoints(
  node: SceneNode,
  geometry: Geometry,
  ray: Ray,
  modelMatrix: Mat4,
  instanceTransforms: Float32Array | readonly number[] | undefined,
  pointRadius: number
): readonly ScenePickHit[] {
  const hits: ScenePickHit[] = [];
  const radiusSquared = pointRadius * pointRadius;
  const transforms = instanceTransforms ? collectInstanceWorldMatrices(modelMatrix, instanceTransforms) : [modelMatrix];
  for (let instanceIndex = 0; instanceIndex < transforms.length; instanceIndex += 1) {
    const transform = transforms[instanceIndex]!;
    for (let pointIndex = 0; pointIndex < geometry.vertexBuffer.vertexCount; pointIndex += 1) {
      const position = geometry.vertexBuffer.getAttribute(pointIndex, "position");
      const worldPoint = transformPoint(transform, [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0]);
      const distance = distanceAlongRay(ray, worldPoint);
      if (distance < 0) continue;
      const radialDistanceSquared = squaredDistanceToRayAt(ray, worldPoint, distance);
      if (radialDistanceSquared <= radiusSquared) {
        hits.push({
          node,
          geometry,
          bounds: expandPointBounds(worldPoint, pointRadius),
          distance,
          hitPoint: worldPoint,
          pointIndex,
          instanceIndex: instanceTransforms ? instanceIndex : undefined
        });
      }
    }
  }
  return hits;
}

function collectInstanceWorldMatrices(modelMatrix: Mat4, instanceTransforms: Float32Array | readonly number[]): readonly Mat4[] {
  const matrices: Mat4[] = [];
  for (let offset = 0; offset < instanceTransforms.length; offset += 16) {
    matrices.push(multiplyMat4(modelMatrix, toMat4(instanceTransforms.slice(offset, offset + 16), "instanceTransforms")));
  }
  return matrices;
}

function distanceAlongRay(ray: Ray, point: readonly [number, number, number]): number {
  return (
    (point[0] - ray.origin.x) * ray.direction.x +
    (point[1] - ray.origin.y) * ray.direction.y +
    (point[2] - ray.origin.z) * ray.direction.z
  );
}

function squaredDistanceToRayAt(ray: Ray, point: readonly [number, number, number], distance: number): number {
  const closestX = ray.origin.x + ray.direction.x * distance;
  const closestY = ray.origin.y + ray.direction.y * distance;
  const closestZ = ray.origin.z + ray.direction.z * distance;
  const dx = point[0] - closestX;
  const dy = point[1] - closestY;
  const dz = point[2] - closestZ;
  return dx * dx + dy * dy + dz * dz;
}

function expandPointBounds(center: readonly [number, number, number], radius: number): SceneBounds3 {
  return new SceneBounds3(
    [center[0] - radius, center[1] - radius, center[2] - radius],
    [center[0] + radius, center[1] + radius, center[2] + radius]
  );
}

function expandSceneBounds(bounds: SceneBounds3, radius: number): SceneBounds3 {
  return new SceneBounds3(
    [bounds.min[0] - radius, bounds.min[1] - radius, bounds.min[2] - radius],
    [bounds.max[0] + radius, bounds.max[1] + radius, bounds.max[2] + radius]
  );
}

class RendererAnimationLoopImpl implements RendererAnimationLoop {
  private requestId: number | null = null;
  public running = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly callback: (timeMs: number, renderer: Renderer) => void
  ) {}

  start(): void {
    if (typeof requestAnimationFrame !== "function" || typeof cancelAnimationFrame !== "function") {
      throw new RenderDeviceError("Renderer animation loops require requestAnimationFrame", "ANIMATION_LOOP_UNAVAILABLE");
    }
    this.running = true;
    this.requestId = requestAnimationFrame((timeMs) => this.tick(timeMs));
  }

  stop(): void {
    this.running = false;
    if (this.requestId !== null) {
      cancelAnimationFrame(this.requestId);
      this.requestId = null;
    }
  }

  private tick(timeMs: number): void {
    if (!this.running) {
      return;
    }
    this.callback(timeMs, this.renderer);
    if (this.running) {
      this.requestId = requestAnimationFrame((nextTimeMs) => this.tick(nextTimeMs));
    }
  }
}

function readCanvasCssSize(canvas: HTMLCanvasElement | OffscreenCanvas, axis: "width" | "height"): number {
  if ("getBoundingClientRect" in canvas) {
    const bounds = canvas.getBoundingClientRect();
    const value = axis === "width" ? bounds.width : bounds.height;
    if (value > 0) {
      return value;
    }
  }
  return axis === "width" ? canvas.width : canvas.height;
}

function inferInitialCanvasDimension(canvas: HTMLCanvasElement | OffscreenCanvas | undefined, axis: "width" | "height"): number {
  if (!canvas) return 1;
  const cssSize = readCanvasCssSize(canvas, axis);
  const dpr = Number.isFinite(globalThis.devicePixelRatio) && globalThis.devicePixelRatio > 0 ? globalThis.devicePixelRatio : 1;
  const displaySize = Math.round(cssSize * dpr);
  return Math.max(1, displaySize || (axis === "width" ? canvas.width : canvas.height) || 1);
}

function collectEnvironmentLighting(source: RenderSource | Iterable<RenderItem> | Scene): EnvironmentLightingOptions | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  if (source.environmentLighting === false) return cloneEnvironmentLighting(DISABLED_RENDERER_ENVIRONMENT_LIGHTING);
  if (source.environmentLighting) return source.environmentLighting;
  return cloneEnvironmentLighting(DEFAULT_RENDERER_ENVIRONMENT_LIGHTING);
}

function collectEnvironmentBackground(source: RenderSource | Iterable<RenderItem> | Scene): EnvironmentBackgroundOptions | undefined {
  if (source instanceof Scene || isIterable(source) || source.environmentBackground === false) return undefined;
  return source.environmentBackground;
}

function collectEnvironmentFog(source: RenderSource | Iterable<RenderItem> | Scene): ForwardEnvironmentFogOptions | false | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  return source.environmentFog;
}

function collectForwardShadowMap(source: RenderSource | Iterable<RenderItem> | Scene): ForwardShadowMapOptions | undefined {
  return source instanceof Scene || isIterable(source) ? undefined : source.shadowMap;
}

function collectRenderTarget(source: RenderSource | Iterable<RenderItem> | Scene): RenderTarget | undefined {
  return source instanceof Scene || isIterable(source) ? undefined : source.renderTarget;
}

function validateExplicitRenderTarget(target: RenderTarget | undefined, width: number, height: number): void {
  if (!target) return;
  if (target.disposed) {
    throw new RenderDeviceError("Renderer renderTarget must be a live render target.", "RENDER_TARGET_DISPOSED", {
      renderTarget: target.label
    });
  }
  if (target.width !== width || target.height !== height) {
    throw new RenderDeviceError("Renderer renderTarget dimensions must match the renderer viewport.", "RENDER_TARGET_VIEWPORT_MISMATCH", {
      renderTarget: target.label,
      targetWidth: target.width,
      targetHeight: target.height,
      rendererWidth: width,
      rendererHeight: height
    });
  }
}

function collectRendererShadowOptions(source: RenderSource | Iterable<RenderItem> | Scene): RendererShadowOptions | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  if (source.shadow === true) return {};
  if (!source.shadow) return undefined;
  return source.shadow;
}

function firstShadowCastingLight(source: RenderSource | Iterable<RenderItem> | Scene, lights: readonly CollectedLight[]): Light | null {
  const explicit = lights.find((light) => light.castsShadow && light.source.visible)?.source;
  if (explicit) return explicit;
  const scene = sceneFromSource(source);
  return scene?.collectLights().find((light) => light.visible && light.castsShadow) ?? null;
}

function firstShadowCastingCollectedLight(lights: readonly CollectedLight[]): CollectedLight | undefined {
  return lights.find((light) => light.castsShadow && light.source.visible);
}

function lightDirectionFromLight(light: Light | null): Vec3 {
  if (!light) return [0, -1, -1];
  const direction = light instanceof DirectionalLight ? light.getDirection() : undefined;
  return normalizeVec3([
    Number(direction?.[0] ?? 0),
    Number(direction?.[1] ?? -1),
    Number(direction?.[2] ?? -1)
  ]);
}

function createRendererOwnedShadowMatrix(light: Light | null, items: readonly RenderItem[], collectedLight: CollectedLight | undefined): Mat4 {
  if (light instanceof SpotLight) {
    light.transform.updateWorld(undefined, true);
    const near = 0.01;
    const far = Math.max(near + 0.01, light.range);
    const projectionMatrix = perspectiveMat4(light.angle * 2, 1, near, far);
    return multiplyMat4(projectionMatrix, light.transform.inverseWorldMatrix);
  }
  return createDirectionalShadowMatrix(items, collectedLight?.direction ?? lightDirectionFromLight(light));
}

function createPointShadowFaceMatrices(light: PointLight): Float32Array {
  light.transform.updateWorld(undefined, true);
  const position: Vec3 = [
    light.transform.worldMatrix[12],
    light.transform.worldMatrix[13],
    light.transform.worldMatrix[14]
  ];
  const projection = perspectiveMat4(Math.PI / 2, 1, 0.01, Math.max(0.02, light.range));
  const faces: readonly { readonly direction: Vec3; readonly up: Vec3 }[] = [
    { direction: [1, 0, 0], up: [0, -1, 0] },
    { direction: [-1, 0, 0], up: [0, -1, 0] },
    { direction: [0, 1, 0], up: [0, 0, 1] },
    { direction: [0, -1, 0], up: [0, 0, -1] },
    { direction: [0, 0, 1], up: [0, -1, 0] },
    { direction: [0, 0, -1], up: [0, -1, 0] }
  ];
  const matrices = new Float32Array(6 * 16);
  for (const [index, face] of faces.entries()) {
    const view = lookAtMatrix(position, addVec3(position, face.direction), face.up);
    matrices.set(multiplyMat4(projection, view), index * 16);
  }
  return matrices;
}

function createPointShadowFaceRects(): Float32Array {
  const rects = new Float32Array(6 * 4);
  for (let face = 0; face < 6; face += 1) {
    const column = face % 3;
    const row = Math.floor(face / 3);
    rects.set([column / 3, row / 2, 1 / 3, 1 / 2], face * 4);
  }
  return rects;
}

function readShadowFacePixels(device: RenderDevice, target: RenderTarget): Uint8Array {
  device.setRenderTarget(target);
  if (target.depthTexture && device.readDepthPixels) {
    const depth = device.readDepthPixels(0, 0, target.width, target.height);
    const pixels = new Uint8Array(target.width * target.height * 4);
    for (let index = 0; index < depth.length; index += 1) {
      const byte = Math.max(0, Math.min(255, Math.round((depth[index] ?? 1) * 255)));
      const offset = index * 4;
      pixels[offset] = byte;
      pixels[offset + 1] = byte;
      pixels[offset + 2] = byte;
      pixels[offset + 3] = 255;
    }
    return pixels;
  }
  return device.readPixels(0, 0, target.width, target.height);
}

function blitPointShadowFace(
  atlasPixels: Uint8Array,
  atlasWidth: number,
  atlasHeight: number,
  facePixels: Uint8Array,
  faceSize: number,
  faceRects: Float32Array,
  face: number
): void {
  const rectOffset = face * 4;
  const destX = Math.round((faceRects[rectOffset] ?? 0) * atlasWidth);
  const destY = Math.round((faceRects[rectOffset + 1] ?? 0) * atlasHeight);
  for (let row = 0; row < faceSize; row += 1) {
    const sourceOffset = row * faceSize * 4;
    const targetOffset = ((destY + row) * atlasWidth + destX) * 4;
    atlasPixels.set(facePixels.subarray(sourceOffset, sourceOffset + faceSize * 4), targetOffset);
  }
}

function lookAtMatrix(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const forward = normalizeVec3(subtractVec3(target, eye));
  const right = normalizeVec3(crossVec3(forward, up));
  const correctedUp = crossVec3(right, forward);
  return [
    right[0], correctedUp[0], -forward[0], 0,
    right[1], correctedUp[1], -forward[1], 0,
    right[2], correctedUp[2], -forward[2], 0,
    -dotVec3(right, eye), -dotVec3(correctedUp, eye), dotVec3(forward, eye), 1
  ];
}

function createDirectionalShadowMatrix(items: readonly RenderItem[], lightDirection: readonly [number, number, number]): Mat4 {
  const bounds = collectRenderItemBounds(items);
  if (!bounds || bounds.isEmpty()) {
    return identityMat4();
  }
  const basis = directionalLightBasis(lightDirection);
  const points = boundsCorners(bounds).map((point) => projectPointToLightSpace(point, basis));
  const lightBounds = boundsFromVec3(points);
  const width = Math.max(0.01, lightBounds.max[0] - lightBounds.min[0]);
  const height = Math.max(0.01, lightBounds.max[1] - lightBounds.min[1]);
  const depth = Math.max(0.01, lightBounds.max[2] - lightBounds.min[2]);
  const padding = Math.max(width, height, depth) * 0.08 + 0.05;
  const viewMatrix = lightViewMatrix(basis);
  const projectionMatrix = orthographicMat4(
    lightBounds.min[0] - padding,
    lightBounds.max[0] + padding,
    lightBounds.min[1] - padding,
    lightBounds.max[1] + padding,
    lightBounds.min[2] - padding,
    lightBounds.max[2] + padding
  );
  return multiplyMat4(projectionMatrix, viewMatrix);
}

function directionalLightBasis(lightDirection: readonly [number, number, number]): {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
} {
  const forward = normalizeVec3(scaleVec3(normalizeVec3(lightDirection), -1));
  const fallbackUp: Vec3 = Math.abs(forward[1]) > 0.94 ? [0, 0, 1] : [0, 1, 0];
  const right = normalizeVec3(crossVec3(fallbackUp, forward));
  const up = normalizeVec3(crossVec3(forward, right));
  return { right, up, forward };
}

function lightViewMatrix(basis: { readonly right: Vec3; readonly up: Vec3; readonly forward: Vec3 }): Mat4 {
  return [
    basis.right[0], basis.up[0], basis.forward[0], 0,
    basis.right[1], basis.up[1], basis.forward[1], 0,
    basis.right[2], basis.up[2], basis.forward[2], 0,
    0, 0, 0, 1
  ];
}

function projectPointToLightSpace(point: Vec3, basis: { readonly right: Vec3; readonly up: Vec3; readonly forward: Vec3 }): Vec3 {
  return [dotVec3(point, basis.right), dotVec3(point, basis.up), dotVec3(point, basis.forward)];
}

function boundsCorners(bounds: SceneBounds3): readonly Vec3[] {
  return [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]]
  ];
}

function boundsFromVec3(points: readonly Vec3[]): { readonly min: Vec3; readonly max: Vec3 } {
  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, point[axis]!);
      max[axis] = Math.max(max[axis]!, point[axis]!);
    }
  }
  return { min, max };
}

function normalizeVec3(value: readonly [number, number, number]): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= 1e-8) return [0, -1 / Math.SQRT2, -1 / Math.SQRT2];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function scaleVec3(value: Vec3, amount: number): Vec3 {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function addVec3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtractVec3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function crossVec3(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function dotVec3(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function collectPostprocess(source: RenderSource | Iterable<RenderItem> | Scene): RendererPostProcessOptions | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  if (source.postprocess === true) return {};
  if (!source.postprocess) return undefined;
  return source.postprocess;
}

function normalizeRendererInput(
  sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene,
  camera?: CameraLike
): RendererInput {
  if (isRendererInput(sourceOrInput)) {
    return { source: sourceOrInput.source, camera: camera ?? sourceOrInput.camera };
  }
  return { source: sourceOrInput, ...(camera ? { camera } : {}) };
}

function isRendererInput(value: RendererInput | RenderSource | Iterable<RenderItem> | Scene): value is RendererInput {
  return !(value instanceof Scene) && !isIterable(value) && isRecord(value) && "source" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectCameraPolicy(source: RenderSource | Iterable<RenderItem> | Scene): RendererCameraPolicy {
  if (source instanceof Scene || isIterable(source)) return "identity";
  if (source.cameraPolicy) return source.cameraPolicy;
  if (source.scene && !source.renderItems && !source.collectRenderItems) return "auto-frame";
  if ((source.renderItems || source.collectRenderItems) && !source.renderTarget) return "auto-frame";
  return "identity";
}

function postprocessRequiresDepthTexture(postprocess: RendererPostProcessOptions): boolean {
  return Boolean(
    (postprocess.depthOfField && !postprocess.depthOfField.depth) ||
    (postprocess.contactShadow && !postprocess.contactShadow.depth) ||
    (postprocess.ssao && !postprocess.ssao.depth) ||
    (postprocess.ssr && !postprocess.ssr.depth)
  );
}

function canFuseLdrPostprocess(source: RenderTarget, passes: readonly RendererPostProcessPassPlan[]): boolean {
  const sourceIsHdr = isHdrRenderTarget(source);
  return passes.length > 1
    && (!sourceIsHdr || passes[0]?.name === "tone-mapping")
    && passes.every((pass) => pass.name === "tone-mapping" || pass.name === "color-grade" || pass.name === "fxaa")
    && passes.every((pass, index) => {
      const previousRank = index === 0 ? -1 : ldrFusionPassRank(passes[index - 1]!.name);
      return ldrFusionPassRank(pass.name) >= previousRank;
    });
}

function ldrFusionPassRank(name: RendererPostProcessPassName): number {
  if (name === "tone-mapping") return 0;
  if (name === "color-grade") return 1;
  if (name === "fxaa") return 2;
  return Number.POSITIVE_INFINITY;
}

function isDepthPostprocessPass(name: RendererPostProcessPassName): name is "depth-of-field" | "contact-shadow" | "ssao" | "ssr" {
  return name === "depth-of-field" || name === "contact-shadow" || name === "ssao" || name === "ssr";
}

function postprocessPassHasDepth(options: RendererPostProcessPassPlan["options"]): boolean {
  return typeof options === "object" && options !== null && "depth" in options && Boolean((options as { readonly depth?: unknown }).depth);
}

function withRendererDepth<T extends DepthOfFieldOptions | ContactShadowPostProcessOptions | SSAOOptions | SSROptions>(options: T, depth: DepthTextureBinding | undefined): T {
  return depth && !options.depth ? { ...options, depth } : options;
}

function defaultPostprocessTargetFormat(
  device: RenderDevice,
  postprocess: RendererPostProcessOptions
): Extract<RenderTargetDescriptor["format"], "rgba8" | "rgba16f" | "rgba32f"> {
  if (postprocess.toneMapping === false) return "rgba8";
  return device.info.capabilities?.includes("hdr-render-targets") ? "rgba16f" : "rgba8";
}

function isHdrRenderTarget(target: RenderTarget): boolean {
  return target.colorTexture.format === "rgba16f" || target.colorTexture.format === "rgba32f";
}

function collectSourceCameraPosition(source: RenderSource | Iterable<RenderItem> | Scene): readonly [number, number, number] | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  const position = source.cameraPosition;
  if (position === undefined) return undefined;
  if (position.length !== 3 || position.some((value) => !Number.isFinite(value))) {
    throw new RenderDeviceError("RenderSource cameraPosition must contain three finite numbers", "CAMERA_POSITION_INVALID", {
      cameraPosition: [...position]
    });
  }
  return position;
}

function collectRenderItems(
  source: RenderSource | Iterable<RenderItem> | Scene,
  cameraViewProjection?: Mat4,
  camera?: Camera
): readonly RenderItem[] {
  return collectRenderItemsWithDiagnostics(source, cameraViewProjection, camera).items;
}

function collectRenderItemsWithDiagnostics(
  source: RenderSource | Iterable<RenderItem> | Scene,
  cameraViewProjection?: Mat4,
  camera?: Camera
): { readonly items: readonly RenderItem[]; readonly diagnostics: RenderCollectionDiagnostics } {
  const diagnostics = createRenderCollectionDiagnostics();
  if (isIterable(source)) {
    const items = applyViewProjection([...source], cameraViewProjection);
    diagnostics.submittedObjects += items.length;
    diagnostics.visibleObjects += items.length;
    return { items, diagnostics };
  }
  if (source instanceof Scene) {
    const items = collectSceneRenderItems(source, {}, cameraViewProjection, camera, diagnostics);
    return { items, diagnostics };
  }
  const items: RenderItem[] = [];
  if (source.scene) {
    items.push(...collectSceneRenderItems(source.scene, source, cameraViewProjection, source.frustumCulling === false ? undefined : camera, diagnostics));
  }
  const explicitItems: RenderItem[] = [];
  if (source.collectRenderItems) {
    explicitItems.push(...source.collectRenderItems());
  }
  if (source.renderItems) {
    explicitItems.push(...source.renderItems);
  }
  if (explicitItems.length > 0) {
    const optimizedItems = applyRendererOwnedStaticBatching(source, explicitItems);
    const projectedItems = applyViewProjection(optimizedItems, cameraViewProjection);
    diagnostics.submittedObjects += explicitItems.length;
    diagnostics.visibleObjects += explicitItems.length;
    items.push(...projectedItems);
  }
  return { items, diagnostics };
}

const staticBatchGeometryIds = new WeakMap<Geometry, number>();
const staticBatchMaterialIds = new WeakMap<object, number>();
let nextStaticBatchResourceId = 1;

function applyRendererOwnedStaticBatching(source: RenderSource, items: readonly RenderItem[]): readonly RenderItem[] {
  if (!source.staticBatching) return items;
  const batchable: StaticBatchInput[] = [];
  const passthrough: RenderItem[] = [];
  for (const item of items) {
    if (isStaticBatchCandidate(item)) {
      batchable.push({
        geometry: item.geometry,
        material: item.material,
        modelMatrix: item.modelMatrix ?? identityMat4(),
        batchKey: staticBatchKey(item),
        label: item.label
      });
    } else {
      passthrough.push(item);
    }
  }
  if (batchable.length === 0) return items;
  const options = source.staticBatching === true ? {} : source.staticBatching;
  const batched = batchStaticRenderItems(batchable, {
    labelPrefix: "renderer-static-batch",
    ...options
  });
  return [...passthrough, ...batched.renderItems];
}

function isStaticBatchCandidate(item: RenderItem): item is RenderItem & { readonly material: RenderMaterial } {
  return item.material !== undefined &&
    item.drawRange === undefined &&
    item.skinning === undefined &&
    item.morphTargets === undefined &&
    item.morphWeights === undefined &&
    item.instanceTransforms === undefined &&
    item.instanceColors === undefined &&
    item.instanceAttributes === undefined;
}

function staticBatchKey(item: RenderItem & { readonly material: RenderMaterial }): string {
  return `${resourceId(staticBatchGeometryIds, item.geometry)}:${resourceId(staticBatchMaterialIds, item.material)}`;
}

function resourceId<T extends object>(ids: WeakMap<T, number>, resource: T): number {
  const existing = ids.get(resource);
  if (existing !== undefined) return existing;
  const next = nextStaticBatchResourceId++;
  ids.set(resource, next);
  return next;
}

function collectSceneRenderItems(
  scene: Scene,
  source: Pick<RenderSource, "geometryLibrary" | "materialLibrary" | "morphTargetLibrary">,
  cameraViewProjection?: Mat4,
  camera?: Camera,
  diagnostics?: RenderCollectionDiagnostics
): readonly RenderItem[] {
  scene.updateWorldTransforms();
  const renderables = scene.collectRenderables();
  if (renderables.length === 0) {
    return [];
  }
  if (!source.geometryLibrary || !source.materialLibrary) {
    throw new RenderDeviceError("Scene rendering requires geometryLibrary and materialLibrary resource lookups", "SCENE_RENDER_RESOURCES_MISSING", {
      renderables: renderables.length
    });
  }
  const items: RenderItem[] = [];
  for (const { node, renderable } of renderables) {
    const geometry = lookupRenderResource(source.geometryLibrary!, renderable.geometry);
    const material = lookupRenderResource(source.materialLibrary!, renderable.material);
    if (!geometry) {
      throw new RenderDeviceError("Scene renderable references missing geometry", "SCENE_GEOMETRY_MISSING", {
        node: node.name,
        geometry: renderable.geometry
      });
    }
    if (!material) {
      throw new RenderDeviceError("Scene renderable references missing material", "SCENE_MATERIAL_MISSING", {
        node: node.name,
        material: renderable.material
      });
    }
    const morphTargets = source.morphTargetLibrary ? lookupRenderResource(source.morphTargetLibrary, renderable.geometry) : undefined;
    if (renderable.morphWeights.length > 0 && !morphTargets) {
      throw new RenderDeviceError("Scene renderable has morph weights but no morph target resource entry", "SCENE_MORPH_TARGETS_MISSING", {
        node: node.name,
        geometry: renderable.geometry,
        morphWeights: renderable.morphWeights.length
      });
    }
    const modelMatrix = node.transform.worldMatrix;
    const bounds = renderableWorldBounds(geometry, modelMatrix, renderable.instanceTransforms, morphTargets, renderable.morphWeights, renderable.skinning);
    if (diagnostics) {
      diagnostics.submittedObjects += 1;
      if (camera) diagnostics.frustumTestedObjects += 1;
    }
    if (camera && !camera.frustum.intersectsBox(bounds.toMathBox())) {
      if (diagnostics) diagnostics.culledObjects += 1;
      continue;
    }
    if (diagnostics) diagnostics.visibleObjects += 1;
    items.push({
      geometry,
      material,
      label: node.name,
      modelMatrix,
      normalMatrix: normalMatrixFromModel(modelMatrix),
      modelViewProjectionMatrix: multiplyMat4(cameraViewProjection ?? identityMat4(), modelMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(renderable.instanceColors ? { instanceColors: renderable.instanceColors } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function createRenderCollectionDiagnostics(): RenderCollectionDiagnostics {
  return {
    submittedObjects: 0,
    visibleObjects: 0,
    culledObjects: 0,
    frustumTestedObjects: 0
  };
}

function createPostprocessDiagnostics(
  postprocess: RendererPostProcessOptions | undefined,
  ownedTargets: readonly RenderTarget[],
  width: number,
  height: number,
  context: {
    readonly targetFormat?: RendererPostprocessTargetFormat;
    readonly nativeLdrPostprocess?: boolean;
    readonly rendererDepthAvailable?: boolean;
  } = {}
): RendererPostprocessDiagnostics | undefined {
  if (!postprocess) return undefined;
  const passes = createRendererPostprocessPasses(postprocess);
  const targetFormat = context.targetFormat ?? postprocess.targetFormat ?? "rgba8";
  return {
    postprocessPasses: passes.length,
    postprocessPassNames: passes.map((pass) => pass.name),
    postprocessTargetFormat: targetFormat,
    postprocessRenderTargets: ownedTargets.length,
    postprocessTextures: ownedTargets.reduce((total, target) => total + 1 + (target.depthTexture ? 1 : 0), 0),
    postprocessTargetWidth: width,
    postprocessTargetHeight: height,
    postprocessPlan: createRendererPostprocessPlanDiagnostics(postprocess, {
      sourceTargetFormat: targetFormat,
      targetFormat,
      nativeLdrPostprocess: context.nativeLdrPostprocess,
      rendererDepthAvailable: context.rendererDepthAvailable
    })
  };
}

function withRendererFrameDiagnostics(
  diagnostics: RenderDeviceDiagnostics,
  collection: RenderCollectionDiagnostics,
  postprocess?: RendererPostprocessDiagnostics
): RenderDeviceDiagnostics {
  return {
    ...diagnostics,
    submittedObjects: collection.submittedObjects,
    visibleObjects: collection.visibleObjects,
    culledObjects: collection.culledObjects,
    frustumTestedObjects: collection.frustumTestedObjects,
    ...(postprocess ?? {})
  };
}

function renderableWorldBounds(
  geometry: Geometry,
  modelMatrix: Mat4,
  instanceTransforms?: Float32Array | readonly number[],
  morphTargets?: readonly MorphTargetDelta[],
  morphWeights?: readonly number[],
  skinning?: SkinningPaletteBinding
): SceneBounds3 {
  const envelope = computeSkinnedMorphTargetWeightedBounds(geometry, skinning, morphTargets, morphWeights);
  const local = new SceneBounds3(
    [envelope.min[0], envelope.min[1], envelope.min[2]],
    [envelope.max[0], envelope.max[1], envelope.max[2]]
  );
  if (!instanceTransforms) {
    return local.transform(modelMatrix);
  }

  let bounds = new SceneBounds3();
  for (let offset = 0; offset < instanceTransforms.length; offset += 16) {
    const instanceMatrix = toMat4(instanceTransforms.slice(offset, offset + 16), "instanceTransforms");
    bounds = bounds.union(local.transform(multiplyMat4(modelMatrix, instanceMatrix)));
  }
  return bounds;
}

function applyViewProjection(items: readonly RenderItem[], cameraViewProjection?: Mat4): readonly RenderItem[] {
  const hasCameraViewProjection = cameraViewProjection !== undefined;
  const viewProjection = cameraViewProjection ?? identityMat4();
  return items.map((item) => {
    const modelMatrix = toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label);
    const explicitModelViewProjection = item.modelViewProjectionMatrix
      ? toMat4(item.modelViewProjectionMatrix, "modelViewProjectionMatrix", item.label)
      : undefined;
    return {
      ...item,
      modelMatrix,
      normalMatrix: item.normalMatrix ? toMat4(item.normalMatrix, "normalMatrix", item.label) : normalMatrixFromModel(modelMatrix),
      modelViewProjectionMatrix: hasCameraViewProjection || !explicitModelViewProjection
        ? multiplyMat4(viewProjection, modelMatrix)
        : explicitModelViewProjection
    };
  });
}

function createAutoFrameCamera(
  source: RenderSource | Iterable<RenderItem> | Scene,
  items: readonly RenderItem[],
  width: number,
  height: number
): { readonly viewProjectionMatrix: Mat4; readonly cameraPosition: readonly [number, number, number] } | undefined {
  const bounds = collectCameraFrameBounds(source) ?? collectRenderItemBounds(items);
  if (!bounds || bounds.isEmpty()) {
    return undefined;
  }
  const frame = computePerspectiveCameraFrame(bounds, { width, height }, {
    ...DEFAULT_RENDERER_AUTO_FRAME_OPTIONS,
    ...collectCameraFrameOptions(source)
  });
  return {
    viewProjectionMatrix: frame.viewProjectionMatrix,
    cameraPosition: frame.cameraPosition
  };
}

function collectRenderItemBounds(items: readonly RenderItem[]): SceneBounds3 | undefined {
  let bounds: SceneBounds3 | undefined;
  for (const item of items) {
    if (item.includeInAutoFrame === false) continue;
    const itemBounds = renderableWorldBounds(item.geometry, toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label), item.instanceTransforms, item.morphTargets, item.morphWeights, item.skinning);
    bounds = bounds ? bounds.union(itemBounds) : itemBounds;
  }
  return bounds;
}

function collectCameraFrameOptions(source: RenderSource | Iterable<RenderItem> | Scene): PerspectiveCameraFrameOptions {
  if (source instanceof Scene || isIterable(source) || !source.cameraFrameOptions) return {};
  return source.cameraFrameOptions;
}

function collectCameraFrameBounds(source: RenderSource | Iterable<RenderItem> | Scene): SceneBounds3 | undefined {
  if (source instanceof Scene || isIterable(source) || !source.cameraFrameBounds) return undefined;
  const bounds = source.cameraFrameBounds;
  const min = bounds.min;
  const max = bounds.max;
  const values = [...min, ...max];
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) {
    throw new RenderDeviceError("RenderSource cameraFrameBounds must contain finite min/max vectors.", "CAMERA_FRAME_BOUNDS_INVALID", {
      min: [...min],
      max: [...max]
    });
  }
  if (max[0] < min[0] || max[1] < min[1] || max[2] < min[2]) {
    throw new RenderDeviceError("RenderSource cameraFrameBounds max must be greater than or equal to min.", "CAMERA_FRAME_BOUNDS_INVALID", {
      min: [...min],
      max: [...max]
    });
  }
  return new SceneBounds3([min[0], min[1], min[2]], [max[0], max[1], max[2]]);
}

function resolveCamera(
  source: RenderSource | Iterable<RenderItem> | Scene,
  camera?: CameraLike,
  viewport?: { readonly width: number; readonly height: number },
  options: { readonly allowSceneCamera?: boolean } = {}
): { readonly viewProjectionMatrix: Mat4; readonly camera?: Camera; readonly cameraPosition?: readonly [number, number, number] } | undefined {
  const resolved = camera ?? (options.allowSceneCamera === false ? undefined : resolveSceneCamera(source));
  if (!resolved) {
    return undefined;
  }
  const resize = maybeCameraResize(resolved);
  if (viewport && resize) {
    resize(viewport.width, viewport.height);
  }
  resolved.updateCameraMatrices?.();
  if (resolved.viewProjectionMatrix) {
    const viewMatrix = resolved.viewMatrix ? toMat4(resolved.viewMatrix, "viewMatrix") : undefined;
    return {
      viewProjectionMatrix: toMat4(resolved.viewProjectionMatrix, "viewProjectionMatrix"),
      ...(resolved instanceof Camera
        ? { camera: resolved, cameraPosition: cameraWorldPosition(resolved) }
        : viewMatrix
          ? { cameraPosition: cameraPositionFromViewMatrix(viewMatrix) }
          : {})
    };
  }
  if (resolved.projectionMatrix && resolved.viewMatrix) {
    const viewMatrix = toMat4(resolved.viewMatrix, "viewMatrix");
    return {
      viewProjectionMatrix: multiplyMat4(toMat4(resolved.projectionMatrix, "projectionMatrix"), viewMatrix),
      ...(resolved instanceof Camera
        ? { camera: resolved, cameraPosition: cameraWorldPosition(resolved) }
        : { cameraPosition: cameraPositionFromViewMatrix(viewMatrix) })
    };
  }
  throw new RenderDeviceError(
    "Renderer camera must expose a viewProjectionMatrix or projectionMatrix plus viewMatrix",
    "CAMERA_VIEW_PROJECTION_MISSING"
  );
}

function hasExplicitAutoFrameCameraPolicy(source: RenderSource | Iterable<RenderItem> | Scene): boolean {
  return !(source instanceof Scene) && !isIterable(source) && source.cameraPolicy === "auto-frame";
}

function cameraWorldPosition(camera: Camera): readonly [number, number, number] {
  const matrix = camera.transform.worldMatrix;
  return [matrix[12] ?? 0, matrix[13] ?? 0, matrix[14] ?? 0];
}

function cameraPositionFromViewMatrix(viewMatrix: Mat4): readonly [number, number, number] {
  const inverseView = invertMat4(viewMatrix);
  return [inverseView[12] ?? 0, inverseView[13] ?? 0, inverseView[14] ?? 0];
}

function maybeCameraResize(camera: Camera | CameraLike): ((width: number, height: number) => void) | undefined {
  const candidate = (camera as { readonly resize?: unknown }).resize;
  return typeof candidate === "function" ? candidate.bind(camera) as (width: number, height: number) => void : undefined;
}

function resolveSceneCamera(source: RenderSource | Iterable<RenderItem> | Scene): Camera | undefined {
  return sceneFromSource(source)?.collectCameras()[0];
}

function sceneFromSource(source: RenderSource | Iterable<RenderItem> | Scene): Scene | undefined {
  return source instanceof Scene ? source : isIterable(source) ? undefined : source.scene;
}

function normalMatrixFromModel(modelMatrix: Mat4): Mat4 {
  const matrix = transposeMat4(invertMat4(modelMatrix));
  return [
    matrix[0], matrix[1], matrix[2], 0,
    matrix[4], matrix[5], matrix[6], 0,
    matrix[8], matrix[9], matrix[10], 0,
    0, 0, 0, 1
  ];
}

function transposeMat4(matrix: Mat4): Mat4 {
  return [
    matrix[0], matrix[4], matrix[8], matrix[12],
    matrix[1], matrix[5], matrix[9], matrix[13],
    matrix[2], matrix[6], matrix[10], matrix[14],
    matrix[3], matrix[7], matrix[11], matrix[15]
  ];
}

function toMat4(value: Float32Array | readonly number[], field: string, label?: string): Mat4 {
  const values = Array.from(value);
  if (values.length !== 16 || !values.every(Number.isFinite)) {
    throw new RenderDeviceError("Renderer matrix inputs must be finite mat4 values", "RENDERER_MATRIX_CONTRACT", {
      field,
      label,
      scalars: values.length
    });
  }
  return values as Mat4;
}

function lookupRenderResource<T>(lookup: RenderResourceLookup<T>, key: string): T | undefined {
  if (isReadonlyMap(lookup)) {
    return lookup.get(key);
  }
  return lookup[key];
}

function isReadonlyMap<T>(lookup: RenderResourceLookup<T>): lookup is ReadonlyMap<string, T> {
  return typeof (lookup as ReadonlyMap<string, T>).get === "function";
}

function collectRenderLights(source: RenderSource | Iterable<RenderItem> | Scene): readonly CollectedLight[] {
  if (source instanceof Scene) {
    return new LightCollector().collect(source);
  }
  if (isIterable(source)) {
    return [];
  }
  if (source.collectedLights !== undefined) {
    return [...source.collectedLights];
  }
  if (source.scene) {
    const collected = new LightCollector().collect(source.scene);
    if (collected.length > 0 || source.environmentLighting === false) {
      return collected;
    }
    return createDefaultRendererDirectLights();
  }
  if (source.environmentLighting !== false && (source.renderItems || source.collectRenderItems)) {
    return createDefaultRendererDirectLights();
  }
  return [];
}

function createDefaultRendererDirectLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("default-renderer-key-light");
  const fill = new DirectionalLight("default-renderer-fill-light");
  const lights = [
    { source: key, ...DEFAULT_RENDERER_DIRECT_LIGHTING.key },
    { source: fill, ...DEFAULT_RENDERER_DIRECT_LIGHTING.fill }
  ] as const;
  return lights.map((light) => {
    light.source.color = [...light.color] as [number, number, number];
    light.source.intensity = light.intensity;
    return {
      kind: "directional" as const,
      color: [...light.color] as [number, number, number],
      intensity: light.intensity,
      position: [0, 0, 0] as [number, number, number],
      direction: normalizeDefaultLightDirection(light.direction),
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: light.source
    };
  });
}

function normalizeDefaultLightDirection(direction: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length <= 0 || !Number.isFinite(length)) {
    return [0, 0, -1];
  }
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

function cloneEnvironmentLighting(environment: EnvironmentLightingOptions): EnvironmentLightingOptions {
  return {
    color: [...environment.color] as [number, number, number],
    intensity: environment.intensity,
    ...(environment.proceduralMap
      ? {
          proceduralMap: {
            skyColor: [...environment.proceduralMap.skyColor] as [number, number, number],
            horizonColor: [...environment.proceduralMap.horizonColor] as [number, number, number],
            groundColor: [...environment.proceduralMap.groundColor] as [number, number, number],
            specularColor: [...environment.proceduralMap.specularColor] as [number, number, number],
            intensity: environment.proceduralMap.intensity,
            specularIntensity: environment.proceduralMap.specularIntensity
          }
        }
      : {}),
    ...(environment.environmentMapTexture ? { environmentMapTexture: environment.environmentMapTexture } : {}),
    ...(environment.environmentCubeMapTexture ? { environmentCubeMapTexture: environment.environmentCubeMapTexture } : {}),
    ...(environment.environmentMapIntensity !== undefined ? { environmentMapIntensity: environment.environmentMapIntensity } : {}),
    ...(environment.environmentMapSpecularIntensity !== undefined ? { environmentMapSpecularIntensity: environment.environmentMapSpecularIntensity } : {}),
    ...(environment.environmentMapRotation !== undefined ? { environmentMapRotation: environment.environmentMapRotation } : {}),
    ...(environment.environmentMapMipCount !== undefined ? { environmentMapMipCount: environment.environmentMapMipCount } : {}),
    ...(environment.environmentMapEncoding ? { environmentMapEncoding: environment.environmentMapEncoding } : {}),
    ...(environment.environmentBrdfLutTexture ? { environmentBrdfLutTexture: environment.environmentBrdfLutTexture } : {})
  };
}

function isIterable(value: unknown): value is Iterable<RenderItem> {
  return typeof (value as Iterable<RenderItem>)[Symbol.iterator] === "function";
}
