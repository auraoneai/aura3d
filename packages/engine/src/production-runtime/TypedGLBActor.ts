import {
  createGLTFSceneAnimationRuntime,
  loadProductionGLTFRenderPipeline,
  type GLTFSceneAnimationApplyResult,
  type GLTFSceneAnimationRuntime,
  type GLTFSceneAnimationRuntimeSnapshot,
  type GLTFScenePose,
  type ProductionGLTFRenderPipeline
} from "@aura3d/assets/gltf-runtime";

import type { GLTFImageDecoder, GLTFMaterialRenderStateOverride } from "@aura3d/assets";
import type { AuraAssetDecodersOption, AuraModelLodOption } from "../contracts/assets";
import type { AuraResolvedMaterialInfo } from "../contracts/materials";
import {
  applyMaterialOverrides,
  snapshotMaterials,
  type AuthoredMaterialSnapshot,
  type TypedGLBActorMaterialOverride
} from "./ModelMaterialOverrides";
import { createGLBActorAnimationMaterialResolver, createTypedGLBActorAnimationTrack, createTypedGLBActorEvidence } from "./actor/TypedGLBActorAnimation";
import { typedGLBActorExtensions, typedGLBActorQrFlags } from "./actor/extensions";
import "./actor/TypedGLBActorLod";

export { createGLBActorAnimationMaterialResolver, createTypedGLBActorEvidence } from "./actor/TypedGLBActorAnimation";

import {
  consolidateStaticMeshes,
  type Material,
  type MeshConsolidationInput,
  type MeshConsolidationResult,
  type RenderItem
} from "@aura3d/rendering";
import { identityMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";

export interface TypedGLBActorAsset {
  readonly url: string;
  readonly type?: string;
  readonly format?: string;
  readonly hash?: string;
  readonly bounds?: readonly number[];
  readonly sizeBytes?: number;
}

export interface TypedGLBActorOptions {
  readonly asset: TypedGLBActorAsset;
  readonly id: string;
  readonly name?: string;
  readonly width: number;
  readonly height: number;
  readonly tint?: TypedGLBActorTintOptions;
  /**
   * Share one runtime material instance across identical glTF material definitions.
   *
   * Architectural GLBs commonly carry `.001`/`.002` duplicates of the same material, which defeat
   * renderer static batching because it keys on material identity. Opt in for static set dressing;
   * leave off for actors whose materials are individually tinted at runtime.
   */
  readonly deduplicateIdenticalMaterials?: boolean;
  /** Exact imported glTF node names that should not contribute renderables. */
  readonly hiddenNodeNames?: readonly string[];
  /**
   * Bake an animation-free actor's child meshes into shared-material buffers once at load time.
   * Intended for large static world GLBs; moving/skinned/morphed actors are rejected.
   */
  readonly consolidateStaticMeshes?: boolean;
  /**
   * Per-material overrides forwarded to the pipeline. Entries with a `renderState` field are C-32
   * render-state overrides passed to the GLB resources; the remaining entries are C-15 uniform
   * overrides applied from the post-load authored snapshot (PRD-04 P2-1/P2-3).
   */
  readonly materialOverrides?: readonly (GLTFMaterialRenderStateOverride | TypedGLBActorMaterialOverride)[];
  /** `KHR_materials_variants` material variant name selected at load (C-15/R11). */
  readonly materialVariant?: string;
  /** Optional asset variant selector (declaration-only seam, C-17). */
  readonly variant?: "optimized" | "source" | "mobile";
  /** Optional decoder configuration forwarded to the asset pipeline (declaration-only seam, C-16/C-17). */
  readonly decoders?: AuraAssetDecodersOption;
  /** Optional image decoder forwarded to the GLB resource pipeline (headless/test decode seam, C-16). */
  readonly imageDecoder?: GLTFImageDecoder;
  /** Optional tangent-generation policy forwarded to resource creation (PRD-04 P5-4, C-18). `"legacy"` keeps the in-repo generator under `A3D_QR_MATERIALS`. */
  readonly tangents?: boolean | "auto" | "generate" | "legacy";
  /** Compressed texture capabilities for the C-16 ktx2 target pick (PRD-04 P5-2). */
  readonly compressedTextureCapabilities?: { readonly astc: boolean; readonly bptc: boolean; readonly etc2: boolean; readonly s3tc: boolean; readonly s3tcSrgb: boolean };
  /** Forwarded `renderer.material.transmission` mode (PRD-04 P4-3: `"env"` = real env refraction). */
  readonly transmission?: "auto" | "env" | "off";
  /** Optional GPU-bytes texture budget for the pipeline load (declaration-only seam, C-17). */
  readonly textureBudget?: number;
  /** Optional max texture dimension for the pipeline load (declaration-only seam, C-17). */
  readonly maxTextureSize?: number;
  /** Optional LOD selection policy consumed by the lane-05 LOD extension (declaration-only seam, C-17). */
  readonly lod?: AuraModelLodOption;
}

export interface TypedGLBActorTintOptions {
  readonly baseColor: readonly [number, number, number, number];
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  /** Replace authored color/surface textures when a public material override is requested. */
  readonly replaceSurfaceTextures?: boolean;
}

export interface TypedGLBActorTransformOptions {
  readonly modelMatrix?: Mat4 | readonly number[];
  /**
   * Wrinkle-detail intensity (E1 face-rig demo), resolved engine-side from live morph
   * weights. Stamped onto every render item; shaders without `u_wrinkleStrength` ignore it.
   */
  readonly wrinkleStrength?: number;
}

export interface TypedGLBActorEvidence {
  readonly kind: "aura-typed-glb-actor-evidence";
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly assetHash?: string;
  readonly assetSizeBytes?: number;
  readonly bounds?: readonly number[];
  readonly clips: readonly string[];
  readonly skinningBindingCount: number;
  readonly morphTargetCount: number;
  readonly renderItemCount: number;
  readonly skinnedRenderItemCount: number;
  readonly morphRenderItemCount: number;
  readonly lastClip: string | null;
  readonly lastTracksApplied: number;
  readonly lastTransformTracksApplied: number;
  readonly lastMaterialTracksApplied: number;
  readonly lastLightTracksApplied: number;
  readonly lastFootPlantingGroundedFeet: number;
  readonly lastFootPlantingTargetError: number;
  readonly lastFootPlantingHipOffset: number;
  readonly lastFootPlantingMissingLegs: readonly string[];
  readonly lastFootPlantingDeformation?: NonNullable<GLTFSceneAnimationApplyResult["footPlanting"]>["legDeformation"];
  readonly lastFootPlantingSurfaces?: NonNullable<GLTFSceneAnimationApplyResult["footPlanting"]>["surfaces"];
  readonly lastFootPlantingFeet?: NonNullable<GLTFSceneAnimationApplyResult["footPlanting"]>["feet"];
  readonly footPlantingConfigured: boolean;
  readonly lastSkinningPalettesUpdated: number;
  readonly lastMorphApply?: TypedGLBActorMorphApplyResult;
  readonly missingTargets: readonly string[];
  readonly warnings: readonly string[];
  readonly staticConsolidation?: {
    readonly inputItems: number;
    readonly submittedItems: number;
    readonly mergedMeshes: number;
    readonly drawCallReduction: number;
  };
}

export interface TypedGLBActorMorphApplyResult {
  readonly requestedTargets: readonly string[];
  readonly appliedTargets: readonly string[];
  readonly missingTargets: readonly string[];
  readonly activeWeights: Readonly<Record<string, number>>;
  readonly affectedRenderableCount: number;
  readonly appliedWeightCount: number;
}

export interface TypedGLBActor {
  readonly kind: "aura-typed-glb-actor";
  readonly id: string;
  readonly name: string;
  readonly asset: TypedGLBActorAsset;
  readonly pipeline: ProductionGLTFRenderPipeline;
  readonly staticRenderItems?: readonly RenderItem[];
  readonly staticConsolidation?: TypedGLBActorEvidence["staticConsolidation"];
  readonly animation: GLTFSceneAnimationRuntime;
  readonly evidence: TypedGLBActorEvidence;
  playClip(name: string, time: number): GLTFSceneAnimationApplyResult;
  /** Consume authored displacement through the physical authority before applying the in-place pose. */
  playRootMotionClip(
    name: string,
    options: Parameters<GLTFSceneAnimationRuntime["applyRootMotionClip"]>[1]
  ): ReturnType<GLTFSceneAnimationRuntime["applyRootMotionClip"]>;
  playRootMotionClips(
    samples: Parameters<GLTFSceneAnimationRuntime["applyRootMotionClips"]>[0],
    options: Parameters<GLTFSceneAnimationRuntime["applyRootMotionClips"]>[1]
  ): ReturnType<GLTFSceneAnimationRuntime["applyRootMotionClips"]>;
  /**
   * Drive the GLB from an externally-computed retargeted pose (e.g. the output of
   * `@aura3d/animation`'s `retargetHumanoidPose`, whose `bones` keys are the target rig's GLB node
   * names). This is the Phase 2.3 pose→runtime bridge: instead of sampling an embedded clip, the
   * caller hands in a per-frame pose and the runtime writes it onto the matching scene nodes.
   */
  applyRetargetedPose(pose: GLTFScenePose, time?: number): GLTFSceneAnimationApplyResult;
  /**
   * Convenience alias for {@link applyRetargetedPose} with a clip-style label, mirroring `playClip`
   * for callers that drive the actor frame-by-frame from a retargeted clip pose.
   */
  playRetargetedClip(pose: GLTFScenePose, time?: number): GLTFSceneAnimationApplyResult;
  applyMorphTargets(weights: Readonly<Record<string, number>>): TypedGLBActorMorphApplyResult;
  collectRenderItems(options?: TypedGLBActorTransformOptions): RenderItem[];
  snapshot(): GLTFSceneAnimationRuntimeSnapshot;
  /**
   * C-15: re-apply the given uniform overrides from the post-load authored snapshot — idempotent,
   * never accumulates (the legacy `setTint` mutated in place). Empty list restores authored state.
   */
  setMaterialOverrides(overrides: readonly TypedGLBActorMaterialOverride[]): void;
  /** C-15/R11: switch the actor to a declared `KHR_materials_variants` variant (`null` = authored). */
  setMaterialVariant(name: string | null): void;
  /** C-15: every `KHR_materials_variants` name declared across the actor's renderable bindings. */
  materialVariants(): readonly string[];
  /** C-15: per-runtime-material inspection for diagnostics (P2-1). */
  inspectMaterials(): readonly AuraResolvedMaterialInfo[];
  /**
   * Legacy tint seam. With `A3D_QR_MATERIALS` on it lowers to `setMaterialOverrides` (P2-2: writes
   * only explicitly given fields — no /joint/i heuristic, no 0.28/0.38/0.16 defaults, no
   * emissive=baseColor fallback); flag off it is byte-identical to the legacy in-place mutation.
   */
  setTint(options: TypedGLBActorTintOptions): void;
  dispose(): void;
}

type TypedGLBActorTransmissionMode = "auto" | "env" | "off";
let qrTransmissionMode: TypedGLBActorTransmissionMode | undefined;

/**
 * Lane-04 seam mirroring `setTypedGLBActorQrFlags`: the mode `renderer.transmission`
 * resolves to once lane-15 forwards it into `createTypedGLBActor` (qr-request;
 * `AuraCreateAppRendererOptions.transmission` is declared C-15 but unwired).
 * Tests and lane harnesses set it directly until then.
 */
export function setTypedGLBActorQrTransmissionMode(mode: TypedGLBActorTransmissionMode | undefined): void {
  qrTransmissionMode = mode;
}

export function typedGLBActorQrTransmissionMode(): TypedGLBActorTransmissionMode | undefined {
  return qrTransmissionMode;
}

export async function createTypedGLBActor(options: TypedGLBActorOptions): Promise<TypedGLBActor> {
  const qrMaterials = typedGLBActorQrFlags().on("A3D_QR_MATERIALS");
  const qrTransmission = qrMaterials && typedGLBActorQrFlags().on("A3D_QR_MATERIALS_TRANSMISSION");
  const transmission = options.transmission ?? qrTransmissionMode;
  const renderStateOverrides = (options.materialOverrides ?? []).filter(
    (override): override is GLTFMaterialRenderStateOverride => "renderState" in override
  );
  const typedOverrides = (options.materialOverrides ?? []).filter(
    (override): override is TypedGLBActorMaterialOverride => !("renderState" in override)
  );
  // P5-2: decoder-missing failures surface a `decoder-missing:<id>` issue before the error
  // propagates as the actor's load failure (AssetDecoderUnavailable names the decoder).
  const loadIssues: string[] = [];
  let pipeline: Awaited<ReturnType<typeof loadProductionGLTFRenderPipeline>>;
  try {
    pipeline = await loadProductionGLTFRenderPipeline({
      url: options.asset.url,
      assetId: options.id,
      assetName: options.name ?? options.id,
      width: options.width,
      height: options.height,
      ...(options.imageDecoder ? { imageDecoder: options.imageDecoder } : {}),
      ...(options.materialVariant !== undefined ? { materialVariant: options.materialVariant } : {}),
      ...(renderStateOverrides.length > 0 ? { materialRenderStateOverrides: renderStateOverrides } : {}),
      ...(options.textureBudget !== undefined ? { textureBudget: options.textureBudget } : {}),
      ...(options.maxTextureSize !== undefined ? { maxTextureSize: options.maxTextureSize } : {}),
      ...(options.decoders ? { decoders: options.decoders } : {}),
      ...(options.compressedTextureCapabilities ? { compressedTextureCapabilities: options.compressedTextureCapabilities } : {}),
      ...(options.tangents !== undefined ? { tangents: options.tangents } : {}),
      ...(qrMaterials ? { materialsR185: true } : {}),
      ...(qrTransmission ? { materialsTransmission: true } : {}),
      ...(transmission !== undefined ? { transmission } : {}),
      ...(options.deduplicateIdenticalMaterials ? { deduplicateIdenticalMaterials: true } : {})
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AssetDecoderUnavailable") {
      loadIssues.push(`decoder-missing:${(error as { decoderId?: string }).decoderId ?? "unknown"}`);
    }
    throw error;
  }
  // P5-1/P5-4: resource-level load issues (colorspace-conflict, tangent-derivative-fallback)
  // surface through inspectMaterials() warnings alongside variant issues.
  for (const issue of pipeline.resources.loadIssues) {
    loadIssues.push(`${issue.code}:${issue.detail}`);
  }
  pipeline.resources.scene.root.name = `${options.id}-scene-root`;
  if (options.hiddenNodeNames && options.hiddenNodeNames.length > 0) {
    const hidden = new Set(options.hiddenNodeNames);
    pipeline.resources.scene.traverse((node) => {
      if (hidden.has(node.name)) node.visible = false;
    });
  }
  const animation = createGLTFSceneAnimationRuntime({
    scene: pipeline.resources.scene,
    clips: pipeline.asset.animations,
    asset: pipeline.asset,
    resolveAnimationMaterial: createGLBActorAnimationMaterialResolver(pipeline.resources)
  });

  // P2-1: authored snapshot taken immediately post-load; every override application restores from
  // it first, so overrides are idempotent and never accumulate.
  let materialSnapshot: AuthoredMaterialSnapshot = snapshotMaterials(pipeline.resources.materialLibrary.values());
  let activeMaterialOverrides: readonly TypedGLBActorMaterialOverride[] = [];
  const setMaterialOverrides = (overrides: readonly TypedGLBActorMaterialOverride[]): void => {
    activeMaterialOverrides = overrides;
    applyMaterialOverrides(materialSnapshot, pipeline.resources.materialLibrary.values(), overrides);
  };
  const setTint = (tint: TypedGLBActorTintOptions): void => {
    if (typedGLBActorQrFlags().on("A3D_QR_MATERIALS")) {
      // P2-2: lower the tint to an explicit override — only fields actually given are written;
      // the /joint/i heuristic, 0.28/0.38/0.16 constants and emissive=baseColor fallback never run.
      setMaterialOverrides([{
        baseColorReplace: tint.baseColor,
        replaceTextures: true,
        ...(tint.emissiveColor !== undefined ? { emissiveColor: tint.emissiveColor } : {}),
        ...(tint.emissiveStrength !== undefined ? { emissiveStrength: tint.emissiveStrength } : {}),
        ...(tint.roughness !== undefined ? { roughness: tint.roughness } : {}),
        ...(tint.metallic !== undefined ? { metallic: tint.metallic } : {}),
        ...(tint.clearcoat !== undefined ? { clearcoat: tint.clearcoat } : {}),
        ...(tint.clearcoatRoughness !== undefined ? { clearcoatRoughness: tint.clearcoatRoughness } : {})
      }]);
      return;
    }
    tintTypedGLBActorMaterials(pipeline, tint);
  };
  const materialVariantIssues: string[] = [];
  const setMaterialVariant = (name: string | null): void => {
    // R11: rebind by rebuilding each renderable's material binding from the asset; an unknown
    // variant leaves the authored materials in place and records `variant-unknown`.
    void pipeline.resources.setMaterialVariant(name).then((result) => {
      if (result === "variant-unknown") {
        if (!materialVariantIssues.includes(`variant-unknown:${name ?? ""}`)) {
          materialVariantIssues.push(`variant-unknown:${name ?? ""}`);
        }
        return;
      }
      materialSnapshot = snapshotMaterials(pipeline.resources.materialLibrary.values());
      applyMaterialOverrides(materialSnapshot, pipeline.resources.materialLibrary.values(), activeMaterialOverrides);
    });
  };
  if (typedOverrides.length > 0) setMaterialOverrides(typedOverrides);
  if (options.tint) setTint(options.tint);
  const staticConsolidation = options.consolidateStaticMeshes
    ? createTypedGLBActorStaticConsolidation(pipeline, options.id)
    : undefined;

  const actor: TypedGLBActor = {
    kind: "aura-typed-glb-actor",
    id: options.id,
    name: options.name ?? options.id,
    asset: options.asset,
    pipeline,
    animation,
    ...(staticConsolidation ? {
      staticRenderItems: staticConsolidation.renderItems,
      staticConsolidation: {
        inputItems: staticConsolidation.inputItems,
        submittedItems: staticConsolidation.submittedItems,
        mergedMeshes: staticConsolidation.mergedMeshes,
        drawCallReduction: staticConsolidation.drawCallReduction
      }
    } : {}),
    get evidence() {
      return createTypedGLBActorEvidence(actor, animationTrack.lastApply, animationTrack.lastMorphApply);
    },
    playClip(name, time) {
      return animationTrack.playClip(name, time);
    },
    playRootMotionClip(name, motionOptions) {
      return animationTrack.playRootMotionClip(name, motionOptions);
    },
    playRootMotionClips(samples, motionOptions) {
      return animationTrack.playRootMotionClips(samples, motionOptions);
    },
    applyRetargetedPose(pose, time = 0) {
      return animationTrack.applyRetargetedPose(pose, time);
    },
    playRetargetedClip(pose, time = 0) {
      return animationTrack.playRetargetedClip(pose, time);
    },
    applyMorphTargets(weights) {
      return animationTrack.applyMorphTargets(weights);
    },
    collectRenderItems(transformOptions = {}) {
      let items = collectTypedGLBActorRenderItems(actor, transformOptions);
      for (const extension of typedGLBActorExtensions()) {
        items = extension.collectRenderItems?.(actor, items) ?? items;
      }
      return items;
    },
    snapshot() {
      return animation.snapshot();
    },
    setMaterialOverrides,
    materialVariants() {
      const variants = new Set<string>();
      for (const binding of pipeline.resources.renderableBindings) {
        for (const entry of binding.materialVariants) variants.add(entry.variant);
      }
      return [...variants].sort();
    },
    setMaterialVariant,
    inspectMaterials() {
      const infos: AuraResolvedMaterialInfo[] = [];
      for (const [key, material] of pipeline.resources.materialLibrary) {
        const params = material.getParameters();
        const enabledMaps: string[] = [];
        for (const [name, value] of params) {
          if (name.startsWith("u_") && name.endsWith("TextureEnabled") && Number(value) > 0) {
            const slot = name.slice(2, -"TextureEnabled".length);
            enabledMaps.push(slot.endsWith("Texture") ? slot.slice(0, -"Texture".length) : slot);
          }
        }
        const baseColor = params.get("u_baseColorFactor") ?? params.get("u_baseColor");
        infos.push({
          name: material.name ?? key,
          featureKey: material.shaderKey ?? "unknown",
          baseColorFactor: Array.isArray(baseColor)
            ? [baseColor[0] ?? 1, baseColor[1] ?? 1, baseColor[2] ?? 1, baseColor[3] ?? 1]
            : [1, 1, 1, 1],
          enabledMaps,
          extensions: [],
          lightsEvaluated: "uniform-16",
          warnings: [
            ...loadIssues,
            ...materialVariantIssues,
            // P2-8: hardwareWrap requested but the legacy textured shader lacks Q-01-2's
            // `mode > 2.5` passthrough — the material surfaces it for inspection.
            ...((material as { hardwareWrapPending?: boolean }).hardwareWrapPending ? ["hardware-wrap-pending"] : [])
          ]
        });
      }
      return infos;
    },
    setTint,
    dispose() {
      for (const extension of typedGLBActorExtensions()) {
        extension.dispose?.(actor);
      }
      for (const item of staticConsolidation?.renderItems ?? []) {
        if (staticConsolidation?.ownedGeometries.has(item.geometry)) item.geometry.dispose();
      }
      pipeline.dispose();
    }
  };

  const animationTrack = createTypedGLBActorAnimationTrack(animation, actor);
  for (const extension of typedGLBActorExtensions()) {
    extension.onLoad?.(actor, pipeline);
  }
  return actor;
}

export function collectTypedGLBActorRenderItems(actor: TypedGLBActor, options: TypedGLBActorTransformOptions = {}): RenderItem[] {
  const wrinkle = options.wrinkleStrength === undefined ? {} : { wrinkleStrength: options.wrinkleStrength };
  if (actor.staticRenderItems) {
    return actor.staticRenderItems.map((item) => ({
      ...item,
      ...wrinkle,
      modelMatrix: resolveTypedGLBActorModelMatrix(
        (item.modelMatrix ?? identityMat4()) as Mat4,
        options.modelMatrix
      )
    }));
  }
  const resources = actor.pipeline.resources;
  const items: RenderItem[] = [];
  resources.scene.updateWorldTransforms();
  for (const { node, renderable } of resources.scene.collectRenderables()) {
    if (!node.visible) continue;
    const geometry = resources.geometryLibrary.get(renderable.geometry);
    const material = resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const morphTargets = resources.morphTargetLibrary.get(renderable.geometry);
    items.push({
      label: `${actor.id}:${node.name}:${renderable.geometry}`,
      geometry,
      material,
      ...wrinkle,
      modelMatrix: resolveTypedGLBActorModelMatrix(node.transform.worldMatrix, options.modelMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(renderable.instanceColors ? { instanceColors: renderable.instanceColors } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function createTypedGLBActorStaticConsolidation(
  pipeline: ProductionGLTFRenderPipeline,
  actorId: string
): (MeshConsolidationResult & { readonly ownedGeometries: ReadonlySet<RenderItem["geometry"]> }) | undefined {
  if (pipeline.asset.animations.length > 0) return undefined;
  pipeline.resources.scene.updateWorldTransforms();
  const inputs: MeshConsolidationInput[] = [];
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = pipeline.resources.materialLibrary.get(renderable.material);
    const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
    if (!geometry || !material) continue;
    if (renderable.skinning || renderable.instanceTransforms || (morphTargets && morphTargets.length > 0)) return undefined;
    inputs.push({ geometry, material, modelMatrix: node.transform.worldMatrix, label: `${actorId}:${node.name}` });
  }
  const result = consolidateStaticMeshes(inputs, {
    labelPrefix: `${actorId}-static-world`,
    maxVerticesPerMesh: 65_536
  });
  const sourceGeometries = new Set(inputs.map((input) => input.geometry));
  return {
    ...result,
    ownedGeometries: new Set(result.renderItems
      .map((item) => item.geometry)
      .filter((geometry) => !sourceGeometries.has(geometry)))
  };
}

function resolveTypedGLBActorModelMatrix(nodeMatrix: Mat4, rootMatrix?: Mat4 | readonly number[]): Mat4 {
  if (!rootMatrix) return nodeMatrix;
  return multiplyMat4(toTypedGLBActorMat4(rootMatrix), nodeMatrix);
}

function toTypedGLBActorMat4(value: Mat4 | readonly number[]): Mat4 {
  if (value.length !== 16) {
    throw new Error(`TypedGLBActor modelMatrix must contain 16 numbers, got ${value.length}.`);
  }
  return [...value] as Mat4;
}

function tintTypedGLBActorMaterials(pipeline: ProductionGLTFRenderPipeline, tint: TypedGLBActorTintOptions): void {
  const emissive = tint.emissiveColor ?? [tint.baseColor[0], tint.baseColor[1], tint.baseColor[2]] as const;
  for (const material of pipeline.resources.materialLibrary.values()) {
    applyMaterialTint(material, tint, emissive);
  }
}

function applyMaterialTint(
  material: Material,
  tint: TypedGLBActorTintOptions,
  emissive: readonly [number, number, number]
): void {
  const jointMaterial = /joint/i.test(material.name);
  const color = jointMaterial
    ? [Math.max(0.02, tint.baseColor[0] * 0.22), Math.max(0.02, tint.baseColor[1] * 0.24), Math.max(0.02, tint.baseColor[2] * 0.28), 1] as const
    : tint.baseColor;
  const glow = jointMaterial
    ? [emissive[0] * 0.28, emissive[1] * 0.28, emissive[2] * 0.28] as const
    : emissive;
  material.setParameter("u_baseColor", color);
  material.setParameter("u_baseColorFactor", color);
  if (tint.replaceSurfaceTextures) {
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
  }
  material.setParameter("u_emissiveColor", glow);
  material.setParameter("u_emissiveFactor", glow);
  const emissiveStrength = tint.emissiveStrength ?? 0.28;
  material.setParameter("u_emissiveStrength", jointMaterial ? Math.min(0.08, emissiveStrength) : emissiveStrength);
  material.setParameter("u_roughness", jointMaterial ? Math.max(0.72, tint.roughness ?? 0.38) : tint.roughness ?? 0.38);
  material.setParameter("u_metallic", jointMaterial ? Math.min(0.08, tint.metallic ?? 0.16) : tint.metallic ?? 0.16);
  if (!jointMaterial && tint.clearcoat !== undefined) {
    material.setParameter("u_clearcoatFactor", tint.clearcoat);
  }
  if (!jointMaterial && tint.clearcoatRoughness !== undefined) {
    material.setParameter("u_clearcoatRoughnessFactor", tint.clearcoatRoughness);
  }
}
