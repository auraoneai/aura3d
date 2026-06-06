import {
  ProductionRuntimeRenderer,
  createContactShadowPass,
  createProductionEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance,
  resolveProductionRuntimeRendererBackend,
  summarizeProductionProductionProof,
  type ProductionEnvironmentLightingResources,
  type ProductionPbrHdrPipeline,
  type ProductionToneMappingOperator,
  type ProductionRenderProof,
  type ContactShadowPassDiagnostics,
  type ProductionRuntimeRendererBackendPreference,
  type ProductionRuntimeRendererBackendSelection,
  type ProductionRuntimeRendererOptions
} from "@aura3d/rendering";
import {
  createGLTFSceneAnimationRuntime,
  createProductionGLTFRenderMetadata,
  loadProductionGLTFRenderPipeline,
  type GLTFSceneAnimationApplyResult,
  type GLTFSceneAnimationRuntime,
  type GLTFSceneAnimationRuntimeSnapshot,
  type ProductionGLTFRenderMetadata,
  type ProductionGLTFRenderPipeline
} from "@aura3d/assets/browser";
import {
  AnimationAction,
  AnimationLayer,
  AnimationMixer,
  type AnimationClip,
  type AnimationEvent,
  type AnimationMixerSnapshot,
  type AnimationTarget
} from "@aura3d/animation";
import {
  PhysicsWorld,
  Shape,
  type CollisionEvent,
  type ConstraintType,
  type PhysicsSnapshot,
  type RigidBody,
  type RigidBodyType,
  type Vec3
} from "@aura3d/physics";
import type {
  CameraFrameBounds,
  CameraLike,
  CollectedLight,
  EnvironmentLightingOptions,
  PerspectiveCameraFrameOptions,
  RenderItem,
  RenderSource,
  RendererPostProcessOptions,
  RendererShadowOptions
} from "@aura3d/rendering";
import {
  Geometry,
  Material,
  PBRMaterial,
  TextureBinding,
  computePerspectiveCameraFrame,
  createDefaultShaderLibrary
} from "@aura3d/rendering";
import { DirectionalLight, composeMat4 } from "@aura3d/scene";
import type { GLTFMaterialRenderStateOverride, GLTFRendererInputOptions } from "@aura3d/assets/browser";

export {
  collectTypedGLBActorRenderItems,
  createTypedGLBActor,
  createTypedGLBActorEvidence
} from "./TypedGLBActor.js";
export type {
  TypedGLBActor,
  TypedGLBActorAsset,
  TypedGLBActorEvidence,
  TypedGLBActorOptions,
  TypedGLBActorTintOptions,
  TypedGLBActorTransformOptions
} from "./TypedGLBActor.js";

export * as productionRendering from "@aura3d/rendering";

export const productionAssets = {
  createProductionGLTFRenderMetadata,
  loadProductionGLTFRenderPipeline
};

export const AURA3D_ENGINE_PRODUCTION_PRODUCT_SURFACE = "a3d-renderer-production-runtime-sdk";

export const A3D_THREEJS_EXAMPLE_PARITY_TARGETS = {
  keyframes: "webgl_animation_keyframes",
  skinningBlending: "webgl_animation_skinning_blending",
  additiveBlending: "webgl_animation_skinning_additive_blending",
  skinningIk: "webgl_animation_skinning_ik",
  skinningMorph: "webgl_animation_skinning_morph",
  multipleAnimations: "webgl_animation_multiple",
  walkCycle: "webgl_animation_walk",
  decals: "webgl_decals",
  parallaxBarrier: "webgl_effects_parallaxbarrier",
  stereo: "webgl_effects_stereo"
} as const;

export interface A3DRendererOptions extends ProductionRuntimeRendererOptions {
  readonly backend?: ProductionRuntimeRendererBackendPreference;
}

export interface A3DRenderResult {
  readonly proof: ProductionRenderProof;
  readonly summary: ReturnType<typeof summarizeProductionProductionProof>;
}

export interface A3DFrameRenderResult {
  readonly backend: "webgl2" | "webgpu";
  readonly diagnostics: ReturnType<ProductionRuntimeRenderer["getDiagnostics"]>;
  readonly features: ReturnType<ProductionRuntimeRenderer["getFeatures"]>;
  readonly timing?: NonNullable<ReturnType<ProductionRuntimeRenderer["renderInteractiveFrame"]>["timing"]>;
}

export interface A3DRenderOptions {
  readonly scene: A3DGltfScene;
  readonly environment?: A3DHdrEnvironment;
  readonly environmentLighting?: EnvironmentLightingOptions;
  readonly renderItems?: Iterable<RenderItem>;
  readonly collectedLights?: Iterable<CollectedLight>;
  readonly shadow?: RendererShadowOptions | boolean;
  readonly camera?: CameraLike;
  readonly viewport?: A3DViewport;
  readonly postprocess?: RendererPostProcessOptions | boolean;
}

export class A3DRenderer {
  readonly backend: "webgl2" | "webgpu";
  readonly backendSelection: ProductionRuntimeRendererBackendSelection;

  private constructor(
    private readonly renderer: ProductionRuntimeRenderer,
    private readonly viewport: A3DViewport
  ) {
    this.backend = renderer.backend;
    this.backendSelection = renderer.backendSelection;
  }

  static async create(options: A3DRendererOptions): Promise<A3DRenderer> {
    const backendSelection = resolveProductionRuntimeRendererBackend(options);
    return new A3DRenderer(
      await ProductionRuntimeRenderer.create({ ...options, backend: backendSelection.requestedBackend }),
      { width: options.width, height: options.height }
    );
  }

  captureProof(input: A3DRenderOptions): A3DRenderResult {
    if (this.backend === "webgpu") {
      throw new Error("A3DRenderer Production WebGPU proof capture uses captureProofAsync() so native texture-to-buffer readback can be awaited.");
    }
    const viewport = input.viewport ?? this.defaultViewport();
    const rendererInput = input.scene.createRendererInput({
      viewport,
      environment: input.environment,
      environmentLighting: input.environmentLighting,
      renderItems: input.renderItems,
      collectedLights: input.collectedLights,
      shadow: input.shadow,
      postprocess: input.postprocess
    });
    const proof = this.renderer.captureProof({
      source: rendererInput.source,
      camera: input.camera ?? rendererInput.camera,
      metadata: this.metadataForRender(input.scene, input.environment)
    });
    return { proof, summary: summarizeProductionProductionProof(proof) };
  }

  render(input: A3DRenderOptions): A3DRenderResult {
    return this.captureProof(input);
  }

  renderInteractiveFrame(input: A3DRenderOptions): A3DFrameRenderResult {
    if (this.backend === "webgpu") {
      throw new Error("A3DRenderer Production WebGPU interactive rendering uses renderInteractiveFrameAsync() so native render submission can be awaited.");
    }
    const viewport = input.viewport ?? this.defaultViewport();
    const rendererInput = input.scene.createRendererInput({
      viewport,
      environment: input.environment,
      environmentLighting: input.environmentLighting,
      renderItems: input.renderItems,
      collectedLights: input.collectedLights,
      shadow: input.shadow,
      postprocess: input.postprocess
    });
    const result = this.renderer.renderInteractiveFrame({
      source: rendererInput.source,
      camera: input.camera ?? rendererInput.camera,
      metadata: this.metadataForRender(input.scene, input.environment)
    });
    return {
      backend: result.backend,
      diagnostics: result.diagnostics,
      features: result.features,
      ...(result.timing ? { timing: result.timing } : {})
    };
  }

  renderFrame(input: A3DRenderOptions): A3DFrameRenderResult {
    return this.renderInteractiveFrame(input);
  }

  async captureProofAsync(input: A3DRenderOptions): Promise<A3DRenderResult> {
    const viewport = input.viewport ?? this.defaultViewport();
    const rendererInput = input.scene.createRendererInput({
      viewport,
      environment: input.environment,
      environmentLighting: input.environmentLighting,
      renderItems: input.renderItems,
      collectedLights: input.collectedLights,
      shadow: input.shadow,
      postprocess: input.postprocess
    });
    const proof = await this.renderer.captureProofAsync({
      source: rendererInput.source,
      camera: input.camera ?? rendererInput.camera,
      metadata: this.metadataForRender(input.scene, input.environment)
    });
    return { proof, summary: summarizeProductionProductionProof(proof) };
  }

  async renderAsync(input: A3DRenderOptions): Promise<A3DRenderResult> {
    // ProductionRuntimeRenderer keeps renderImportedAssetAsync as a backwards-compatible alias for captureProofAsync.
    return this.captureProofAsync(input);
  }

  async renderInteractiveFrameAsync(input: A3DRenderOptions): Promise<A3DFrameRenderResult> {
    const viewport = input.viewport ?? this.defaultViewport();
    const rendererInput = input.scene.createRendererInput({
      viewport,
      environment: input.environment,
      environmentLighting: input.environmentLighting,
      renderItems: input.renderItems,
      collectedLights: input.collectedLights,
      shadow: input.shadow,
      postprocess: input.postprocess
    });
    const result = await this.renderer.renderInteractiveFrameAsync({
      source: rendererInput.source,
      camera: input.camera ?? rendererInput.camera,
      metadata: this.metadataForRender(input.scene, input.environment)
    });
    return {
      backend: result.backend,
      diagnostics: result.diagnostics,
      features: result.features,
      ...(result.timing ? { timing: result.timing } : {})
    };
  }

  async renderFrameAsync(input: A3DRenderOptions): Promise<A3DFrameRenderResult> {
    return this.renderInteractiveFrameAsync(input);
  }

  getDiagnostics() {
    return this.renderer.getDiagnostics();
  }

  dispose(): void {
    this.renderer.dispose();
  }

  private defaultViewport(): A3DViewport {
    return this.viewport;
  }

  private metadataForRender(scene: A3DGltfScene, environment?: A3DHdrEnvironment) {
    return {
      assetId: scene.metadata.assetId,
      assetName: scene.metadata.assetName,
      assetUri: scene.metadata.assetUri,
      meshCount: scene.metadata.meshCount,
      primitiveCount: scene.metadata.primitiveCount,
      materialCount: scene.metadata.materialCount,
      textureCount: scene.metadata.textureCount,
      imageCount: scene.metadata.imageCount,
      animationCount: scene.metadata.animationCount,
      skinCount: scene.metadata.skinCount,
      morphTargetCount: scene.metadata.morphTargetCount,
      extensionsUsed: scene.metadata.extensionsUsed,
      ...(environment ? {
        environmentId: environment.id,
        hdrEnvironmentUri: environment.url
      } : {})
    };
  }
}

export interface A3DViewport {
  readonly width: number;
  readonly height: number;
}

export type A3DVec3 = readonly [number, number, number];

export interface A3DDirectionalLightOptions {
  readonly name?: string;
  readonly direction?: A3DVec3;
  readonly color?: A3DVec3;
  readonly intensity?: number;
  readonly castsShadow?: boolean;
}

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

export interface A3DCameraFrameOptions {
  readonly bounds: CameraFrameBounds;
  readonly viewport: A3DViewport;
  readonly preset?: "product-hero" | "asset-inspection" | "material-inspection";
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

export interface A3DProductionSceneOptions {
  readonly scene: A3DGltfScene;
  readonly environment?: A3DHdrEnvironment;
  readonly viewport: A3DViewport;
  readonly stage?: A3DGroundedStage;
  readonly backgroundVisible?: boolean;
  readonly extraRenderItems?: Iterable<RenderItem>;
  readonly lights?: readonly CollectedLight[];
  readonly camera?: CameraLike;
  readonly cameraFrame?: A3DCameraFrameOptions;
  readonly shadows?: RendererShadowOptions | boolean;
  readonly postprocess?: RendererPostProcessOptions | boolean;
  readonly environmentLighting?: EnvironmentLightingOptions;
}

export function createDirectionalLight(options: A3DDirectionalLightOptions = {}): CollectedLight {
  const source = new DirectionalLight(options.name ?? "a3d-production-runtime-directional-light");
  const color = options.color ?? [1, 1, 1];
  source.color = [color[0], color[1], color[2]];
  source.intensity = clamp(options.intensity ?? 1, 0, 64);
  source.castsShadow = options.castsShadow ?? false;
  return collectedDirectionalLight(source, options.direction ?? [0, -1, 0], source.castsShadow);
}

export function createStudioLighting(options: A3DStudioLightingOptions = {}): readonly CollectedLight[] {
  const scale = clamp(options.intensityScale ?? 1, 0, 16);
  const shadows = options.shadows ?? true;
  switch (options.preset ?? "product") {
    case "inspection":
      return [
        createDirectionalLight({ name: "a3d-production-runtime-inspection-key", direction: [-0.35, -0.72, -0.46], color: [1, 0.98, 0.92], intensity: 2.1 * scale, castsShadow: shadows }),
        createDirectionalLight({ name: "a3d-production-runtime-inspection-fill", direction: [0.55, -0.48, -0.34], color: [0.62, 0.74, 1], intensity: 0.72 * scale }),
        createDirectionalLight({ name: "a3d-production-runtime-inspection-rim", direction: [0.14, -0.34, 0.93], color: [1, 0.82, 0.62], intensity: 1.16 * scale })
      ];
    case "softbox":
      return [
        createDirectionalLight({ name: "a3d-production-runtime-softbox-key", direction: [-0.2, -0.9, -0.32], color: [1, 0.97, 0.91], intensity: 1.75 * scale, castsShadow: shadows }),
        createDirectionalLight({ name: "a3d-production-runtime-softbox-fill", direction: [0.44, -0.52, -0.42], color: [0.74, 0.82, 1], intensity: 1.04 * scale })
      ];
    case "product":
    default:
      return [
        createDirectionalLight({ name: "a3d-production-runtime-product-key-shadow", direction: [-0.42, -0.82, -0.38], color: [1, 0.95, 0.86], intensity: 2.75 * scale, castsShadow: shadows }),
        createDirectionalLight({ name: "a3d-production-runtime-product-fill", direction: [0.62, -0.42, -0.34], color: [0.55, 0.68, 1], intensity: 0.48 * scale }),
        createDirectionalLight({ name: "a3d-production-runtime-product-rim", direction: [0.18, -0.34, 0.92], color: [1, 0.82, 0.55], intensity: 1.05 * scale })
      ];
  }
}

export function createGroundedStage(bounds: CameraFrameBounds, options: A3DGroundedStageOptions = {}): A3DGroundedStage {
  const labelPrefix = options.labelPrefix ?? "a3d-production-runtime-grounded-stage";
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

export function createProductionRenderOptions(options: A3DProductionSceneOptions): A3DRenderOptions {
  const extraRenderItems = options.extraRenderItems ? [...options.extraRenderItems] : [];
  const stageItems = options.stage?.renderItems({
    shadows: options.shadows !== false,
    backgroundVisible: options.backgroundVisible ?? true
  });
  const renderItems = [
    ...extraRenderItems,
    ...(stageItems ? [...stageItems] : [])
  ];
  return {
    scene: options.scene,
    ...(options.environment ? { environment: options.environment } : {}),
    ...(options.environmentLighting ? { environmentLighting: options.environmentLighting } : {}),
    ...(renderItems.length > 0 ? { renderItems } : {}),
    collectedLights: options.lights ?? createStudioLighting({ preset: "product", shadows: options.shadows !== false }),
    shadow: options.shadows ?? true,
    camera: options.camera ?? (options.cameraFrame ? createCameraFrame(options.cameraFrame).camera : undefined),
    viewport: options.viewport,
    ...(options.postprocess !== undefined ? { postprocess: options.postprocess } : {})
  };
}

export type A3DExampleParityTargetId = keyof typeof A3D_THREEJS_EXAMPLE_PARITY_TARGETS;

export interface A3DImportedAnimationRuntime {
  readonly scene: A3DGltfScene;
  readonly runtime: GLTFSceneAnimationRuntime;
  applyClip(name: string, time: number): GLTFSceneAnimationApplyResult;
  blendClips(samples: readonly { readonly clipName: string; readonly time: number; readonly weight?: number; readonly additive?: boolean }[]): GLTFSceneAnimationApplyResult;
  solveTwoBoneIK(options: Parameters<GLTFSceneAnimationRuntime["solveImportedSkeletonTwoBoneIK"]>[0]): ReturnType<GLTFSceneAnimationRuntime["solveImportedSkeletonTwoBoneIK"]>;
  snapshot(): GLTFSceneAnimationRuntimeSnapshot;
}

export function createImportedAnimationRuntime(scene: A3DGltfScene): A3DImportedAnimationRuntime {
  const runtime = createGLTFSceneAnimationRuntime({
    scene: scene.resources.scene,
    clips: scene.asset.animations,
    asset: scene.asset
  });
  return {
    scene,
    runtime,
    applyClip(name, time) {
      return runtime.applyClipByName(name, time);
    },
    blendClips(samples) {
      return runtime.applyClips(samples);
    },
    solveTwoBoneIK(options) {
      return runtime.solveImportedSkeletonTwoBoneIK(options);
    },
    snapshot() {
      return runtime.snapshot();
    }
  };
}

export interface A3DAnimationActionOptions {
  readonly weight?: number;
  readonly timeScale?: number;
  readonly loop?: "once" | "repeat" | "pingpong";
  readonly layer?: string;
  readonly additive?: boolean;
  readonly mask?: readonly string[];
}

export interface A3DAnimationControllerOptions {
  readonly target?: AnimationTarget;
  readonly clips?: readonly AnimationClip[];
  readonly applyRootMotion?: boolean;
  readonly rootMotionTrack?: string;
  readonly rootMotionScale?: number;
}

export interface A3DAnimationControllerSnapshot {
  readonly mixer: AnimationMixerSnapshot;
  readonly registeredClips: readonly string[];
  readonly updateCount: number;
  readonly crossFadeCount: number;
  readonly lastEventCount: number;
  readonly parityTargets: typeof A3D_THREEJS_EXAMPLE_PARITY_TARGETS;
  readonly capabilities: {
    readonly keyframes: true;
    readonly crossFade: true;
    readonly additiveLayers: boolean;
    readonly layerMasks: boolean;
    readonly rootMotion: boolean;
    readonly importedGltfAnimationRuntime: true;
    readonly importedSkinningPaletteRefresh: true;
    readonly importedMorphWeightAnimation: true;
  };
}

export interface A3DAnimationController {
  readonly mixer: AnimationMixer;
  registerClip(clip: AnimationClip): AnimationClip;
  play(clip: string | AnimationClip, options?: A3DAnimationActionOptions): AnimationAction;
  crossFade(from: string | AnimationAction, to: string | AnimationAction | AnimationClip, duration: number): void;
  update(deltaSeconds: number): readonly AnimationEvent[];
  snapshot(): A3DAnimationControllerSnapshot;
  dispose(): void;
}

export function createAnimationController(options: A3DAnimationControllerOptions = {}): A3DAnimationController {
  const mixer = new AnimationMixer(options.target, {
    applyRootMotion: options.applyRootMotion,
    rootMotionTrack: options.rootMotionTrack,
    rootMotionScale: options.rootMotionScale
  });
  const clips = new Map<string, AnimationClip>();
  const actions = new Map<string, AnimationAction>();
  const layers = new Map<string, AnimationLayer>();
  let updateCount = 0;
  let crossFadeCount = 0;
  let lastEvents: readonly AnimationEvent[] = [];
  for (const clip of options.clips ?? []) clips.set(clip.name, clip);

  const controller: A3DAnimationController = {
    mixer,
    registerClip(clip) {
      clips.set(clip.name, clip);
      return clip;
    },
    play(clipInput, actionOptions = {}) {
      const clip = typeof clipInput === "string" ? resolveAnimationClip(clips, clipInput) : controller.registerClip(clipInput);
      let action = actions.get(clip.name);
      if (!action) {
        action = mixer.play(clip);
        actions.set(clip.name, action);
      } else {
        action.play();
      }
      if (actionOptions.weight !== undefined) action.setWeight(actionOptions.weight);
      if (actionOptions.timeScale !== undefined) action.timeScale = actionOptions.timeScale;
      if (actionOptions.loop !== undefined) action.loopMode = actionOptions.loop;
      if (actionOptions.layer || actionOptions.additive || (actionOptions.mask && actionOptions.mask.length > 0)) {
        const layerName = actionOptions.layer ?? (actionOptions.additive ? "additive" : "masked");
        let layer = layers.get(layerName);
        if (!layer) {
          layer = new AnimationLayer(layerName, {
            additive: actionOptions.additive ?? false,
            mask: actionOptions.mask ?? []
          });
          layers.set(layerName, layer);
          mixer.addLayer(layer);
        }
        layer.add(action);
      }
      return action;
    },
    crossFade(fromInput, toInput, duration) {
      const from = typeof fromInput === "string" ? resolveAnimationAction(actions, fromInput) : fromInput;
      const to = toInput instanceof AnimationAction ? toInput : controller.play(toInput, { weight: 0 });
      mixer.crossFade(from, to, duration);
      actions.set(to.clip.name, to);
      crossFadeCount += 1;
    },
    update(deltaSeconds) {
      lastEvents = mixer.update(deltaSeconds);
      updateCount += 1;
      return lastEvents;
    },
    snapshot() {
      const mixerSnapshot = mixer.snapshot();
      return {
        mixer: mixerSnapshot,
        registeredClips: [...clips.keys()],
        updateCount,
        crossFadeCount,
        lastEventCount: lastEvents.length,
        parityTargets: A3D_THREEJS_EXAMPLE_PARITY_TARGETS,
        capabilities: {
          keyframes: true,
          crossFade: true,
          additiveLayers: mixerSnapshot.layers.some((layer) => layer.additive),
          layerMasks: mixerSnapshot.layers.some((layer) => layer.mask.length > 0),
          rootMotion: options.applyRootMotion === true,
          importedGltfAnimationRuntime: true,
          importedSkinningPaletteRefresh: true,
          importedMorphWeightAnimation: true
        }
      };
    },
    dispose() {
      mixer.dispose();
      clips.clear();
      actions.clear();
      layers.clear();
      lastEvents = [];
    }
  };
  return controller;
}

export interface A3DPhysicsSceneOptions {
  readonly gravity?: Vec3;
  readonly fixedDelta?: number;
  readonly solverIterations?: number;
  readonly enableSleeping?: boolean;
}

export interface A3DPhysicsBodyOptions {
  readonly type?: RigidBodyType;
  readonly position?: A3DVec3;
  readonly velocity?: A3DVec3;
  readonly mass?: number;
  readonly restitution?: number;
  readonly friction?: number;
  readonly shape?: {
    readonly kind: "box" | "sphere" | "capsule";
    readonly halfExtents?: A3DVec3;
    readonly radius?: number;
    readonly halfHeight?: number;
  };
  readonly sensor?: boolean;
}

export interface A3DPhysicsConstraintOptions {
  readonly type: ConstraintType;
  readonly bodyA: RigidBody;
  readonly bodyB: RigidBody;
  readonly localAnchorA?: A3DVec3;
  readonly localAnchorB?: A3DVec3;
  readonly restLength?: number;
  readonly stiffness?: number;
  readonly axis?: A3DVec3;
}

export interface A3DPhysicsStepOptions {
  readonly dt?: number;
  readonly steps?: number;
}

export interface A3DPhysicsSceneSnapshot {
  readonly world: PhysicsSnapshot;
  readonly parityTargets: Pick<typeof A3D_THREEJS_EXAMPLE_PARITY_TARGETS, "walkCycle">;
  readonly capabilities: {
    readonly dynamicRigidBodies: true;
    readonly staticColliders: true;
    readonly constraints: true;
    readonly contacts: true;
    readonly raycast: true;
    readonly sphereCast: true;
  };
}

export interface A3DPhysicsScene {
  readonly world: PhysicsWorld;
  createBody(options?: A3DPhysicsBodyOptions): RigidBody;
  createGroundPlane(constant?: number): RigidBody;
  addConstraint(options: A3DPhysicsConstraintOptions): ReturnType<PhysicsWorld["createConstraint"]>;
  step(options?: number | A3DPhysicsStepOptions): readonly CollisionEvent[];
  raycast(origin: A3DVec3, direction: A3DVec3, maxDistance?: number): ReturnType<PhysicsWorld["raycast"]>;
  sphereCast(origin: A3DVec3, radius: number, direction: A3DVec3, maxDistance?: number): ReturnType<PhysicsWorld["sphereCast"]>;
  snapshot(): A3DPhysicsSceneSnapshot;
}

export function createPhysicsScene(options: A3DPhysicsSceneOptions = {}): A3DPhysicsScene {
  const world = new PhysicsWorld(options);
  const scene: A3DPhysicsScene = {
    world,
    createBody(bodyOptions = {}) {
      const body = world.createRigidBody({
        type: bodyOptions.type,
        position: bodyOptions.position,
        velocity: bodyOptions.velocity,
        mass: bodyOptions.mass,
        restitution: bodyOptions.restitution,
        friction: bodyOptions.friction
      });
      if (bodyOptions.shape) {
        world.createCollider(body, {
          shape: resolvePhysicsShape(bodyOptions.shape),
          sensor: bodyOptions.sensor
        });
      }
      return body;
    },
    createGroundPlane(constant = 0) {
      const body = world.createRigidBody({ type: "static" });
      world.createCollider(body, { shape: Shape.plane([0, 1, 0], constant) });
      return body;
    },
    addConstraint(constraintOptions) {
      return world.createConstraint({
        type: constraintOptions.type,
        bodyA: constraintOptions.bodyA,
        bodyB: constraintOptions.bodyB,
        localAnchorA: constraintOptions.localAnchorA,
        localAnchorB: constraintOptions.localAnchorB,
        restLength: constraintOptions.restLength,
        stiffness: constraintOptions.stiffness,
        axis: constraintOptions.axis
      });
    },
    step(stepOptions = {}) {
      const resolved = typeof stepOptions === "number" ? { dt: stepOptions, steps: 1 } : stepOptions;
      const steps = resolved.steps ?? 1;
      const dt = resolved.dt ?? world.fixedDelta;
      let events: ReturnType<PhysicsWorld["step"]> = [];
      for (let i = 0; i < steps; i += 1) events = world.step(dt);
      return events;
    },
    raycast(origin, direction, maxDistance) {
      return world.raycast(origin, direction, maxDistance === undefined ? {} : { maxDistance });
    },
    sphereCast(origin, radius, direction, maxDistance) {
      return world.sphereCast(origin, radius, direction, maxDistance === undefined ? {} : { maxDistance });
    },
    snapshot() {
      return {
        world: world.snapshot(),
        parityTargets: { walkCycle: A3D_THREEJS_EXAMPLE_PARITY_TARGETS.walkCycle },
        capabilities: {
          dynamicRigidBodies: true,
          staticColliders: true,
          constraints: true,
          contacts: true,
          raycast: true,
          sphereCast: true
        }
      };
    }
  };
  return scene;
}

export interface A3DGltfSceneOptions {
  readonly url: string;
  readonly assetId?: string;
  readonly assetName?: string;
  readonly materialVariant?: string;
  readonly materialRenderStateOverrides?: readonly GLTFMaterialRenderStateOverride[];
  readonly sceneIndex?: number;
  readonly sceneName?: string;
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
    ...(options.materialRenderStateOverrides ? { materialRenderStateOverrides: options.materialRenderStateOverrides } : {}),
    ...(options.sceneIndex !== undefined ? { sceneIndex: options.sceneIndex } : {}),
    ...(options.sceneName !== undefined ? { sceneName: options.sceneName } : {}),
    ...(options.rendererInput ? { rendererInput: options.rendererInput } : {})
  });
  return new A3DGltfScene(pipeline);
}

export interface A3DHdrEnvironmentOptions {
  readonly url: string;
  readonly id?: string;
  readonly label?: string;
  readonly data?: ArrayBuffer | Uint8Array;
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

export async function loadHdrEnvironment(input: string | A3DHdrEnvironmentOptions): Promise<A3DHdrEnvironment> {
  const options = typeof input === "string" ? { url: input } : input;
  const data = options.data ?? await fetchArrayBuffer(options.url);
  const id = options.id ?? assetIdFromUrl(options.url);
  const pipeline = createProductionPbrHdrPipelineFromRadiance(data, {
    id,
    label: options.label ?? id,
    intensity: options.intensity ?? 1,
    backgroundIntensity: options.backgroundIntensity ?? 0.85,
    rotation: options.rotation ?? 0,
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

export interface A3DOrbitControlsOptions {
  readonly enabled?: boolean;
  readonly enablePan?: boolean;
  readonly enableZoom?: boolean;
  readonly enableRotate?: boolean;
  readonly target?: readonly [number, number, number];
  readonly position?: readonly [number, number, number];
}

export interface A3DOrbitControlsSnapshot {
  readonly target: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number];
  readonly zoom: number;
  readonly enabled: boolean;
}

export interface A3DOrbitControls {
  rotate(deltaX: number, deltaY: number): A3DOrbitControlsSnapshot;
  pan(deltaX: number, deltaY: number): A3DOrbitControlsSnapshot;
  dolly(scale: number): A3DOrbitControlsSnapshot;
  reset(): A3DOrbitControlsSnapshot;
  snapshot(): A3DOrbitControlsSnapshot;
}

export function createOrbitControls(options: A3DOrbitControlsOptions = {}): A3DOrbitControls {
  const initial: A3DOrbitControlsSnapshot = {
    target: options.target ?? [0, 0, 0],
    position: options.position ?? [0, 0, 5],
    rotation: [0, 0],
    zoom: 1,
    enabled: options.enabled ?? true
  };
  let state = cloneOrbitSnapshot(initial);
  const flags = {
    enablePan: options.enablePan ?? true,
    enableZoom: options.enableZoom ?? true,
    enableRotate: options.enableRotate ?? true
  };
  return {
    rotate(deltaX, deltaY) {
      if (state.enabled && flags.enableRotate) {
        state = { ...state, rotation: [state.rotation[0] + deltaY, state.rotation[1] + deltaX] };
      }
      return cloneOrbitSnapshot(state);
    },
    pan(deltaX, deltaY) {
      if (state.enabled && flags.enablePan) {
        state = { ...state, target: [state.target[0] + deltaX, state.target[1] + deltaY, state.target[2]] };
      }
      return cloneOrbitSnapshot(state);
    },
    dolly(scale) {
      if (state.enabled && flags.enableZoom) {
        state = { ...state, zoom: state.zoom * scale, position: [state.position[0], state.position[1], state.position[2] * scale] };
      }
      return cloneOrbitSnapshot(state);
    },
    reset() {
      state = cloneOrbitSnapshot(initial);
      return cloneOrbitSnapshot(state);
    },
    snapshot() {
      return cloneOrbitSnapshot(state);
    }
  };
}

export interface A3DNavigationControlsOptions {
  readonly enabled?: boolean;
  readonly locked?: boolean;
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly movementSpeed?: number;
}

export interface A3DNavigationControlsSnapshot {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly movementSpeed: number;
  readonly enabled: boolean;
  readonly locked: boolean;
}

export interface A3DFirstPersonControls {
  moveForward(distance: number): A3DNavigationControlsSnapshot;
  strafe(distance: number): A3DNavigationControlsSnapshot;
  look(deltaX: number, deltaY: number): A3DNavigationControlsSnapshot;
  reset(): A3DNavigationControlsSnapshot;
  snapshot(): A3DNavigationControlsSnapshot;
}

export interface A3DMapControls extends A3DOrbitControls {
  truck(deltaX: number, deltaZ: number): A3DOrbitControlsSnapshot;
}

export interface A3DTrackballControls extends A3DOrbitControls {
  roll(delta: number): A3DOrbitControlsSnapshot;
}

export interface A3DPointerLockControls {
  lock(): A3DNavigationControlsSnapshot;
  unlock(): A3DNavigationControlsSnapshot;
  look(deltaX: number, deltaY: number): A3DNavigationControlsSnapshot;
  reset(): A3DNavigationControlsSnapshot;
  snapshot(): A3DNavigationControlsSnapshot;
}

export function createFirstPersonControls(options: A3DNavigationControlsOptions = {}): A3DFirstPersonControls {
  const initial = createNavigationSnapshot(options);
  let state = cloneNavigationSnapshot(initial);
  return {
    moveForward(distance) {
      if (state.enabled) state = { ...state, position: [state.position[0], state.position[1], state.position[2] - distance * state.movementSpeed] };
      return cloneNavigationSnapshot(state);
    },
    strafe(distance) {
      if (state.enabled) state = { ...state, position: [state.position[0] + distance * state.movementSpeed, state.position[1], state.position[2]] };
      return cloneNavigationSnapshot(state);
    },
    look(deltaX, deltaY) {
      if (state.enabled) state = { ...state, rotation: [state.rotation[0] + deltaY, state.rotation[1] + deltaX, state.rotation[2]] };
      return cloneNavigationSnapshot(state);
    },
    reset() {
      state = cloneNavigationSnapshot(initial);
      return cloneNavigationSnapshot(state);
    },
    snapshot() {
      return cloneNavigationSnapshot(state);
    }
  };
}

export function createMapControls(options: A3DOrbitControlsOptions = {}): A3DMapControls {
  const initial: A3DOrbitControlsSnapshot = {
    target: options.target ?? [0, 0, 0],
    position: options.position ?? [0, 0, 5],
    rotation: [0, 0],
    zoom: 1,
    enabled: options.enabled ?? true
  };
  let state = cloneOrbitSnapshot(initial);
  const flags = {
    enablePan: options.enablePan ?? true,
    enableZoom: options.enableZoom ?? true,
    enableRotate: options.enableRotate ?? true
  };
  return {
    rotate(deltaX, deltaY) {
      if (state.enabled && flags.enableRotate) {
        state = { ...state, rotation: [state.rotation[0] + deltaY, state.rotation[1] + deltaX] };
      }
      return cloneOrbitSnapshot(state);
    },
    pan(deltaX, deltaY) {
      if (state.enabled && flags.enablePan) {
        state = { ...state, target: [state.target[0] + deltaX, state.target[1] + deltaY, state.target[2]] };
      }
      return cloneOrbitSnapshot(state);
    },
    dolly(scale) {
      if (state.enabled && flags.enableZoom) {
        state = { ...state, zoom: state.zoom * scale, position: [state.position[0], state.position[1], state.position[2] * scale] };
      }
      return cloneOrbitSnapshot(state);
    },
    truck(deltaX, deltaZ) {
      if (state.enabled && flags.enablePan) {
        state = { ...state, target: [state.target[0] + deltaX, state.target[1], state.target[2] + deltaZ] };
      }
      return cloneOrbitSnapshot(state);
    },
    reset() {
      state = cloneOrbitSnapshot(initial);
      return cloneOrbitSnapshot(state);
    },
    snapshot() {
      return cloneOrbitSnapshot(state);
    }
  };
}

export function createTrackballControls(options: A3DOrbitControlsOptions = {}): A3DTrackballControls {
  const orbit = createOrbitControls(options);
  let rollRadians = 0;
  return {
    rotate(deltaX, deltaY) {
      return orbit.rotate(deltaX, deltaY);
    },
    pan(deltaX, deltaY) {
      return orbit.pan(deltaX, deltaY);
    },
    dolly(scale) {
      return orbit.dolly(scale);
    },
    roll(delta) {
      rollRadians += delta;
      const current = orbit.snapshot();
      return {
        ...current,
        rotation: [current.rotation[0], current.rotation[1] + rollRadians]
      };
    },
    reset() {
      rollRadians = 0;
      return orbit.reset();
    },
    snapshot() {
      const current = orbit.snapshot();
      return {
        ...current,
        rotation: [current.rotation[0], current.rotation[1] + rollRadians]
      };
    }
  };
}

export function createPointerLockControls(options: A3DNavigationControlsOptions = {}): A3DPointerLockControls {
  const initial = createNavigationSnapshot({ ...options, locked: options.locked ?? false });
  let state = cloneNavigationSnapshot(initial);
  return {
    lock() {
      state = { ...state, locked: true };
      return cloneNavigationSnapshot(state);
    },
    unlock() {
      state = { ...state, locked: false };
      return cloneNavigationSnapshot(state);
    },
    look(deltaX, deltaY) {
      if (state.enabled && state.locked) {
        state = { ...state, rotation: [state.rotation[0] + deltaY, state.rotation[1] + deltaX, state.rotation[2]] };
      }
      return cloneNavigationSnapshot(state);
    },
    reset() {
      state = cloneNavigationSnapshot(initial);
      return cloneNavigationSnapshot(state);
    },
    snapshot() {
      return cloneNavigationSnapshot(state);
    }
  };
}

export interface A3DProductViewerOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly asset: A3DGltfScene;
  readonly environment: A3DHdrEnvironment;
  readonly backend?: "webgl2" | "webgpu";
  readonly width?: number;
  readonly height?: number;
  readonly camera?: {
    readonly preset?: "product-hero" | "asset-inspection" | "material-inspection";
    readonly orbit?: boolean;
  };
  readonly lighting?: {
    readonly ibl?: boolean;
    readonly shadows?: boolean;
  };
  readonly postprocess?: {
    readonly toneMapping?: "aces" | "filmic" | "linear" | "reinhard";
    readonly exposure?: number;
    readonly bloom?: boolean;
    readonly ssao?: boolean;
    readonly fxaa?: boolean;
    readonly colorGrade?: boolean;
  };
}

export interface A3DProductViewerSettings {
  readonly exposure: number;
  readonly iblIntensity: number;
  readonly specularIntensity: number;
  readonly environmentRotation: number;
  readonly backgroundVisible: boolean;
  readonly backgroundBlur: number;
  readonly shadows: boolean;
  readonly toneMapping: "aces" | "filmic" | "linear" | "reinhard";
  readonly bloom: boolean;
  readonly ssao: boolean;
  readonly fxaa: boolean;
  readonly colorGrade: boolean;
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

export interface A3DProductViewerStageDiagnostics {
  readonly enabled: boolean;
  readonly itemCount: number;
  readonly floorY: number;
  readonly directionalShadowMap: boolean;
  readonly softFiltering: "pcf-16" | "off";
  readonly depthAwareAmbientOcclusion: boolean;
  readonly contactShadow: ContactShadowPassDiagnostics;
}

export interface A3DProductViewerBackgroundDiagnostics {
  readonly enabled: boolean;
  readonly itemCount: number;
  readonly mode: "visible-hdr-studio-skybox";
  readonly blur: number;
  readonly environmentRotation: number;
}

export interface A3DProductViewer {
  readonly renderer: A3DRenderer;
  readonly asset: A3DGltfScene;
  readonly environment: A3DHdrEnvironment;
  readonly controls: A3DOrbitControls;
  render(): A3DRenderResult;
  renderAsync(): Promise<A3DRenderResult>;
  setSettings(settings: Partial<A3DProductViewerSettings>): A3DProductViewerSettings;
  setEnvironment(environment: A3DHdrEnvironment): A3DHdrEnvironment;
  getSettings(): A3DProductViewerSettings;
  captureScreenshot(type?: "image/png" | "image/jpeg", quality?: number): string | undefined;
  diagnostics(): {
    readonly asset: ProductionGLTFRenderMetadata;
    readonly environment: {
      readonly id: string;
      readonly url: string;
      readonly realRadianceHdr: boolean;
      readonly specularPrefilter: boolean;
      readonly cubemapPMREM: boolean;
      readonly cubemapPMREMShaderSampling: "webgl2-sampler-cube";
      readonly cubemapFaceSize: number;
      readonly cubemapMipCount: number;
      readonly brdfLut: boolean;
    };
    readonly controls: A3DOrbitControlsSnapshot;
    readonly settings: A3DProductViewerSettings;
    readonly camera?: A3DProductViewerCameraDiagnostics;
    readonly stage: A3DProductViewerStageDiagnostics;
    readonly background: A3DProductViewerBackgroundDiagnostics;
  };
  dispose(): void;
}

export async function createProductViewer(options: A3DProductViewerOptions): Promise<A3DProductViewer> {
  const width = options.width ?? options.canvas.width;
  const height = options.height ?? options.canvas.height;
  const renderer = await A3DRenderer.create({
    backend: options.backend,
    canvas: options.canvas,
    width,
    height,
    preserveDrawingBuffer: true,
    clearColor: [0.012, 0.015, 0.02, 1],
    shaderLibrary: createProductViewerShaderLibrary()
  });
  const controls = createOrbitControls({
    enabled: options.camera?.orbit ?? true
  });
  const viewport = { width, height };
  let currentEnvironment = options.environment;
  let settings: A3DProductViewerSettings = {
    exposure: options.postprocess?.exposure ?? 0.9,
    iblIntensity: currentEnvironment.environmentLighting.environmentMapIntensity ?? currentEnvironment.pipeline.intensity,
    specularIntensity: Math.max(
      currentEnvironment.environmentLighting.environmentMapSpecularIntensity ?? 0,
      currentEnvironment.pipeline.intensity * 1.08
    ),
    environmentRotation: currentEnvironment.environmentLighting.environmentMapRotation ?? currentEnvironment.pipeline.rotation,
    backgroundVisible: true,
    backgroundBlur: 0.025,
    shadows: options.lighting?.shadows ?? true,
    toneMapping: options.postprocess?.toneMapping ?? "filmic",
    bloom: options.postprocess?.bloom !== false,
    ssao: options.postprocess?.ssao !== false,
    fxaa: options.postprocess?.fxaa !== false,
    colorGrade: options.postprocess?.colorGrade !== false
  };
  let lastCamera: A3DProductViewerCameraDiagnostics | undefined;
  const stage = createGroundedStage(options.asset.resources.bounds, {
    labelPrefix: "a3d-production-product-viewer",
    shadowLightDirection: [-0.42, -0.82, -0.38]
  });
  const skyboxGeometry = Geometry.uvSphere(1, 128, 64);
  const skyboxMaterial = new A3DVisibleHdrSkyboxMaterial({
    texture: currentEnvironment.environmentLighting.environmentMapTexture ?? new TextureBinding({ name: "u_environmentMapTexture", required: false }),
    rotation: settings.environmentRotation,
    exposure: settings.exposure * currentEnvironment.pipeline.backgroundIntensity
  });
  return {
    renderer,
    asset: options.asset,
    get environment() {
      return currentEnvironment;
    },
    controls,
    render() {
      const controlsState = controls.snapshot();
      const camera = createCameraFrame({
        bounds: options.asset.resources.bounds,
        viewport,
        target: controlsState.target,
        yawRadians: controlsState.rotation[1],
        pitchRadians: controlsState.rotation[0],
        zoom: controlsState.zoom,
        preset: options.camera?.preset ?? "product-hero"
      });
      lastCamera = camera.diagnostics;
      stage.update({
        backgroundBlur: settings.backgroundBlur,
        backgroundVisible: settings.backgroundVisible
      });
      const skyboxItems = settings.backgroundVisible
        ? [createProductViewerSkyboxItem(skyboxGeometry, skyboxMaterial, camera.diagnostics.cameraPosition, options.asset.resources.bounds, currentEnvironment, settings)]
        : [];
      return renderer.render(createProductionRenderOptions({
        scene: options.asset,
        ...(options.lighting?.ibl === false ? {} : {
          environment: currentEnvironment,
          environmentLighting: createProductViewerEnvironmentLighting(currentEnvironment, settings)
        }),
        stage,
        backgroundVisible: false,
        extraRenderItems: skyboxItems,
        lights: createStudioLighting({ preset: "product", shadows: settings.shadows }),
        shadows: createProductViewerShadowOptions(settings),
        camera: camera.camera,
        viewport,
        postprocess: createProductViewerPostprocess(settings)
      }));
    },
    async renderAsync() {
      const controlsState = controls.snapshot();
      const camera = createCameraFrame({
        bounds: options.asset.resources.bounds,
        viewport,
        target: controlsState.target,
        yawRadians: controlsState.rotation[1],
        pitchRadians: controlsState.rotation[0],
        zoom: controlsState.zoom,
        preset: options.camera?.preset ?? "product-hero"
      });
      lastCamera = camera.diagnostics;
      stage.update({
        backgroundBlur: settings.backgroundBlur,
        backgroundVisible: settings.backgroundVisible
      });
      const skyboxItems = settings.backgroundVisible
        ? [createProductViewerSkyboxItem(skyboxGeometry, skyboxMaterial, camera.diagnostics.cameraPosition, options.asset.resources.bounds, currentEnvironment, settings)]
        : [];
      return renderer.renderAsync(createProductionRenderOptions({
        scene: options.asset,
        ...(options.lighting?.ibl === false ? {} : {
          environment: currentEnvironment,
          environmentLighting: createProductViewerEnvironmentLighting(currentEnvironment, settings)
        }),
        stage,
        backgroundVisible: false,
        extraRenderItems: skyboxItems,
        lights: createStudioLighting({ preset: "product", shadows: settings.shadows }),
        shadows: createProductViewerShadowOptions(settings),
        camera: camera.camera,
        viewport,
        postprocess: createProductViewerPostprocess(settings)
      }));
    },
    setSettings(next) {
      settings = sanitizeProductViewerSettings({ ...settings, ...next });
      return settings;
    },
    setEnvironment(environment) {
      currentEnvironment = environment;
      settings = sanitizeProductViewerSettings({
        ...settings,
        iblIntensity: environment.environmentLighting.environmentMapIntensity ?? environment.pipeline.intensity,
        specularIntensity: Math.max(
          environment.environmentLighting.environmentMapSpecularIntensity ?? 0,
          environment.pipeline.intensity * 1.08
        ),
        environmentRotation: environment.environmentLighting.environmentMapRotation ?? environment.pipeline.rotation
      });
      return currentEnvironment;
    },
    getSettings() {
      return { ...settings };
    },
    captureScreenshot(type = "image/png", quality) {
      if ("toDataURL" in options.canvas && typeof options.canvas.toDataURL === "function") {
        return options.canvas.toDataURL(type, quality);
      }
      return undefined;
    },
    diagnostics() {
      return {
        asset: options.asset.metadata,
        environment: {
          id: currentEnvironment.id,
          url: currentEnvironment.url,
          realRadianceHdr: currentEnvironment.pipeline.diagnostics.realRadianceHdr,
          specularPrefilter: currentEnvironment.pipeline.diagnostics.specularPrefilter,
          cubemapPMREM: currentEnvironment.pipeline.diagnostics.cubemapPMREM,
          cubemapPMREMShaderSampling: currentEnvironment.pipeline.diagnostics.cubemapPMREMShaderSampling,
          cubemapFaceSize: currentEnvironment.pipeline.diagnostics.cubemapFaceSize,
          cubemapMipCount: currentEnvironment.pipeline.diagnostics.cubemapMipCount,
          brdfLut: currentEnvironment.pipeline.diagnostics.brdfLut
        },
        controls: controls.snapshot(),
        settings,
        ...(lastCamera ? { camera: lastCamera } : {}),
        stage: {
          enabled: settings.shadows,
          itemCount: settings.shadows ? stage.groundingItems.length : 0,
          floorY: stage.floorY,
          directionalShadowMap: settings.shadows,
          softFiltering: settings.shadows ? "pcf-16" : "off",
          depthAwareAmbientOcclusion: settings.ssao,
          contactShadow: stage.diagnostics.contactShadow!
        },
        background: {
          enabled: settings.backgroundVisible,
          itemCount: settings.backgroundVisible ? 1 : 0,
          mode: "visible-hdr-studio-skybox",
          blur: settings.backgroundBlur,
          environmentRotation: settings.environmentRotation
        }
      };
    },
    dispose() {
      renderer.dispose();
      skyboxGeometry.dispose();
      stage.dispose();
    }
  };
}

function createProductViewerPostprocess(
  options: Pick<A3DProductViewerSettings, "toneMapping" | "exposure" | "bloom" | "ssao" | "fxaa" | "colorGrade">
): RendererPostProcessOptions {
  return {
    targetFormat: "rgba16f",
    toneMapping: {
      operator: options.toneMapping,
      exposure: options.exposure,
      whitePoint: 1.25,
      inputColorSpace: "linear",
      outputColorSpace: "srgb"
    },
    bloom: options.bloom ? { threshold: 0.86, intensity: 0.13, radius: 3 } : false,
    ssao: options.ssao ? { radius: 4, intensity: 0.68, bias: 0.008 } : false,
    fxaa: options.fxaa ? { edgeThreshold: 0.09, subpixelBlend: 0.24 } : false,
    colorGrade: options.colorGrade ? {
      contrast: 1.16,
      saturation: 1.1,
      vibrance: 0.2,
      vignette: 0.16,
      sharpening: 0.86
    } : false
  };
}

const A3D_VISIBLE_HDR_SKYBOX_SHADER_NAME = "a3d-production-runtime/visible-hdr-studio-skybox";
const A3D_VISIBLE_HDR_SKYBOX_SHADER_MARKER = "@aura3d-production-runtime-shader:visible-hdr-studio-skybox";

function createProductViewerShaderLibrary() {
  const library = createDefaultShaderLibrary();
  library.register({
    name: A3D_VISIBLE_HDR_SKYBOX_SHADER_NAME,
    marker: A3D_VISIBLE_HDR_SKYBOX_SHADER_MARKER,
    vertex: `#version 300 es
// ${A3D_VISIBLE_HDR_SKYBOX_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
out vec3 v_direction;
void main() {
  v_direction = normalize(a_position);
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${A3D_VISIBLE_HDR_SKYBOX_SHADER_MARKER}
precision highp float;
uniform sampler2D u_environmentMapTexture;
uniform float u_environmentSkyboxRotation;
uniform float u_environmentSkyboxExposure;
uniform float u_environmentSkyboxBlur;
in vec3 v_direction;
out vec4 outColor;

const float PI = 3.141592653589793;

vec2 a3dProductViewerEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}

vec3 a3dProductViewerFilmic(vec3 color) {
  color = max(color, vec3(0.0));
  return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
}

vec3 a3dProductViewerLinearToSrgb(vec3 color) {
  vec3 lo = color * 12.92;
  vec3 hi = 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), color));
}

void main() {
  vec2 uv = a3dProductViewerEquirectUv(v_direction, u_environmentSkyboxRotation);
  float lod = clamp(u_environmentSkyboxBlur * 6.0, 0.0, 8.0);
  vec3 hdr = textureLod(u_environmentMapTexture, uv, lod).rgb * u_environmentSkyboxExposure;
  vec3 mapped = a3dProductViewerLinearToSrgb(a3dProductViewerFilmic(hdr));
  outColor = vec4(mapped, 1.0);
}
`
  });
  return library;
}

class A3DVisibleHdrSkyboxMaterial extends Material {
  constructor(options: {
    readonly texture: TextureBinding;
    readonly rotation: number;
    readonly exposure: number;
  }) {
    super({
      name: "a3d-production-runtime-visible-hdr-studio-skybox",
      shaderKey: A3D_VISIBLE_HDR_SKYBOX_SHADER_NAME,
      renderState: {
        depthTest: false,
        depthWrite: false,
        cullMode: "front"
      },
      parameters: {
        u_modelViewProjection: identityMatrix(),
        u_environmentMapTexture: options.texture,
        u_environmentSkyboxRotation: options.rotation,
        u_environmentSkyboxExposure: options.exposure,
        u_environmentSkyboxBlur: 0.025
      },
      requiredAttributes: ["a_position"],
      uniformSchema: [
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_environmentMapTexture", kind: "texture2d", required: false },
        { name: "u_environmentSkyboxRotation", kind: "float" },
        { name: "u_environmentSkyboxExposure", kind: "float" },
        { name: "u_environmentSkyboxBlur", kind: "float" }
      ]
    });
  }
}

function createProductViewerSkyboxItem(
  geometry: Geometry,
  material: Material,
  cameraPosition: readonly [number, number, number],
  bounds: CameraFrameBounds,
  environment: A3DHdrEnvironment,
  settings: A3DProductViewerSettings
): RenderItem {
  material.setParameter("u_environmentMapTexture", environment.environmentLighting.environmentMapTexture ?? new TextureBinding({ name: "u_environmentMapTexture", required: false }));
  material.setParameter("u_environmentSkyboxRotation", settings.environmentRotation);
  material.setParameter("u_environmentSkyboxExposure", settings.exposure * environment.pipeline.backgroundIntensity);
  material.setParameter("u_environmentSkyboxBlur", settings.backgroundBlur);
  const extent = Math.max(
    1,
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  );
  const radius = extent * 80;
  return {
    geometry,
    material,
    label: "a3d-production-runtime-visible-hdr-studio-skybox",
    includeInAutoFrame: false,
    modelMatrix: composeMat4([cameraPosition[0], cameraPosition[1], cameraPosition[2]], [0, 0, 0, 1], [radius, radius, radius])
  };
}

function createProductViewerShadowOptions(settings: Pick<A3DProductViewerSettings, "shadows">): RendererShadowOptions | false {
  if (!settings.shadows) return false;
  return {
    enabled: true,
    size: 2048,
    strength: 0.62,
    bias: 0.0018,
    slopeBias: 1,
    filter: "pcf",
    pcfRadius: 1.65,
    pcfSamples: 16,
    pcfDistribution: "poisson",
    label: "a3d-production-product-viewer-directional-shadow"
  };
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

function createProductViewerEnvironmentLighting(
  environment: A3DHdrEnvironment,
  settings: A3DProductViewerSettings
): EnvironmentLightingOptions {
  const lighting = environment.environmentLighting;
  return {
    ...lighting,
    proceduralMap: settings.backgroundVisible ? lighting.proceduralMap : undefined,
    environmentMapIntensity: settings.iblIntensity,
    environmentMapSpecularIntensity: settings.specularIntensity,
    environmentMapRotation: settings.environmentRotation
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

function sanitizeProductViewerSettings(settings: A3DProductViewerSettings): A3DProductViewerSettings {
  return {
    ...settings,
    exposure: clamp(settings.exposure, 0, 4),
    iblIntensity: clamp(settings.iblIntensity, 0, 4),
    specularIntensity: clamp(settings.specularIntensity, 0, 4),
    environmentRotation: clamp(settings.environmentRotation, -1, 1),
    backgroundBlur: clamp(settings.backgroundBlur, 0, 1)
  };
}

function resolveAnimationClip(clips: ReadonlyMap<string, AnimationClip>, name: string): AnimationClip {
  const clip = clips.get(name);
  if (!clip) {
    throw new Error(`A3D animation clip "${name}" is not registered.`);
  }
  return clip;
}

function resolveAnimationAction(actions: ReadonlyMap<string, AnimationAction>, name: string): AnimationAction {
  const action = actions.get(name);
  if (!action) {
    throw new Error(`A3D animation action "${name}" has not been played.`);
  }
  return action;
}

function resolvePhysicsShape(shape: NonNullable<A3DPhysicsBodyOptions["shape"]>) {
  if (shape.kind === "box") {
    const halfExtents = shape.halfExtents ?? [0.5, 0.5, 0.5];
    return Shape.box(halfExtents[0], halfExtents[1], halfExtents[2]);
  }
  if (shape.kind === "sphere") {
    return Shape.sphere(shape.radius ?? 0.5);
  }
  return Shape.capsule(shape.radius ?? 0.35, shape.halfHeight ?? 0.75);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
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

function cloneOrbitSnapshot(snapshot: A3DOrbitControlsSnapshot): A3DOrbitControlsSnapshot {
  return {
    target: [...snapshot.target] as [number, number, number],
    position: [...snapshot.position] as [number, number, number],
    rotation: [...snapshot.rotation] as [number, number],
    zoom: snapshot.zoom,
    enabled: snapshot.enabled
  };
}

function createNavigationSnapshot(options: A3DNavigationControlsOptions): A3DNavigationControlsSnapshot {
  return {
    position: options.position ?? [0, 0, 0],
    rotation: options.rotation ?? [0, 0, 0],
    movementSpeed: options.movementSpeed ?? 1,
    enabled: options.enabled ?? true,
    locked: options.locked ?? false
  };
}

function cloneNavigationSnapshot(snapshot: A3DNavigationControlsSnapshot): A3DNavigationControlsSnapshot {
  return {
    position: [...snapshot.position] as [number, number, number],
    rotation: [...snapshot.rotation] as [number, number, number],
    movementSpeed: snapshot.movementSpeed,
    enabled: snapshot.enabled,
    locked: snapshot.locked
  };
}
