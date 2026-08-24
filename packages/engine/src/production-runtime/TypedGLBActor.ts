import {
  createGLTFSceneAnimationRuntime,
  loadProductionGLTFRenderPipeline,
  type GLTFSceneAnimationApplyResult,
  type GLTFSceneAnimationRuntime,
  type GLTFSceneAnimationRuntimeSnapshot,
  type GLTFScenePose,
  type ProductionGLTFRenderPipeline
} from "@aura3d/assets/gltf-runtime";
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
  setTint(options: TypedGLBActorTintOptions): void;
  dispose(): void;
}

export async function createTypedGLBActor(options: TypedGLBActorOptions): Promise<TypedGLBActor> {
  const pipeline = await loadProductionGLTFRenderPipeline({
    url: options.asset.url,
    assetId: options.id,
    assetName: options.name ?? options.id,
    width: options.width,
    height: options.height,
    ...(options.deduplicateIdenticalMaterials ? { deduplicateIdenticalMaterials: true } : {})
  });
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
    asset: pipeline.asset
  });
  let lastApply: GLTFSceneAnimationApplyResult | null = null;
  let lastMorphApply: TypedGLBActorMorphApplyResult | undefined;
  const setTint = (tint: TypedGLBActorTintOptions): void => tintTypedGLBActorMaterials(pipeline, tint);
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
      return createTypedGLBActorEvidence(actor, lastApply, lastMorphApply);
    },
    playClip(name, time) {
      lastApply = animation.applyClipByName(name, time);
      return lastApply;
    },
    applyRetargetedPose(pose, time = 0) {
      lastApply = animation.applyPose(pose, "retargeted-pose", time);
      return lastApply;
    },
    playRetargetedClip(pose, time = 0) {
      lastApply = animation.applyPose(pose, "retargeted-clip", time);
      return lastApply;
    },
    applyMorphTargets(weights) {
      lastMorphApply = applyTypedGLBActorMorphTargets(actor, weights);
      return lastMorphApply;
    },
    collectRenderItems(transformOptions = {}) {
      return collectTypedGLBActorRenderItems(actor, transformOptions);
    },
    snapshot() {
      return animation.snapshot();
    },
    setTint,
    dispose() {
      for (const item of staticConsolidation?.renderItems ?? []) {
        if (staticConsolidation?.ownedGeometries.has(item.geometry)) item.geometry.dispose();
      }
      pipeline.dispose();
    }
  };
  return actor;
}

export function collectTypedGLBActorRenderItems(actor: TypedGLBActor, options: TypedGLBActorTransformOptions = {}): RenderItem[] {
  if (actor.staticRenderItems) {
    return actor.staticRenderItems.map((item) => ({
      ...item,
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

export function createTypedGLBActorEvidence(
  actor: TypedGLBActor,
  lastApply: GLTFSceneAnimationApplyResult | null = null,
  lastMorphApply?: TypedGLBActorMorphApplyResult
): TypedGLBActorEvidence {
  const snapshot = actor.animation.snapshot();
  const renderItems = actor.collectRenderItems();
  const morphTargetCount = actor.pipeline.asset.meshes.reduce((total, mesh) => total + mesh.morphTargets.length, 0);
  return {
    kind: "aura-typed-glb-actor-evidence",
    id: actor.id,
    name: actor.name,
    url: actor.asset.url,
    ...(actor.asset.hash ? { assetHash: actor.asset.hash } : {}),
    ...(typeof actor.asset.sizeBytes === "number" ? { assetSizeBytes: actor.asset.sizeBytes } : {}),
    ...(actor.asset.bounds ? { bounds: actor.asset.bounds } : {}),
    clips: snapshot.clips,
    skinningBindingCount: snapshot.skinningBindingCount,
    morphTargetCount,
    renderItemCount: renderItems.length,
    skinnedRenderItemCount: renderItems.filter((item) => item.skinning).length,
    morphRenderItemCount: renderItems.filter((item) => item.morphTargets && item.morphTargets.length > 0).length,
    lastClip: lastApply?.clipName ?? null,
    lastTracksApplied: lastApply?.tracksApplied ?? 0,
    lastTransformTracksApplied: lastApply?.transformTracksApplied ?? 0,
    lastSkinningPalettesUpdated: lastApply?.skinningPalettesUpdated ?? 0,
    ...(lastMorphApply ? { lastMorphApply } : {}),
    missingTargets: lastApply?.missingTargets ?? [],
    warnings: [
      ...(snapshot.skinningBindingCount < 1 ? ["No skinning bindings were detected for this typed GLB actor."] : []),
      ...(snapshot.clips.length < 1 ? ["No animation clips were detected for this typed GLB actor."] : []),
      ...(morphTargetCount < 1 ? ["No morph targets were detected for this typed GLB actor."] : [])
    ],
    ...(actor.staticConsolidation ? { staticConsolidation: actor.staticConsolidation } : {})
  };
}

function applyTypedGLBActorMorphTargets(
  actor: TypedGLBActor,
  weights: Readonly<Record<string, number>>
): TypedGLBActorMorphApplyResult {
  const requested = normalizeTypedGLBActorMorphWeights(weights);
  const requestedTargets = [...requested.keys()];
  const appliedTargets = new Set<string>();
  const activeWeights: Record<string, number> = {};
  const missingTargets = new Set<string>();
  let affectedRenderableCount = 0;
  let appliedWeightCount = 0;

  const meshesByName = new Map(actor.pipeline.asset.meshes.map((mesh) => [mesh.name, mesh]));
  for (const { renderable } of actor.pipeline.resources.scene.collectRenderables()) {
    const mesh = meshesByName.get(renderable.geometry);
    if (!mesh || mesh.morphTargets.length === 0) continue;
    const nextWeights = mesh.morphTargets.map((target, index) => {
      const aliases = typedGLBActorMorphTargetAliases(mesh.name, target.name, index);
      for (const alias of aliases) {
        const weight = requested.get(alias);
        if (weight !== undefined) {
          appliedTargets.add(alias);
          activeWeights[alias] = weight;
          return weight;
        }
      }
      return 0;
    });
    renderable.morphWeights = nextWeights;
    affectedRenderableCount += 1;
    appliedWeightCount += nextWeights.filter((weight) => Math.abs(weight) > 0.000001).length;
  }

  for (const target of requestedTargets) {
    if (!appliedTargets.has(target)) missingTargets.add(target);
  }

  return {
    requestedTargets,
    appliedTargets: [...appliedTargets],
    missingTargets: [...missingTargets],
    activeWeights,
    affectedRenderableCount,
    appliedWeightCount
  };
}

function normalizeTypedGLBActorMorphWeights(weights: Readonly<Record<string, number>>): Map<string, number> {
  const normalized = new Map<string, number>();
  for (const [name, weight] of Object.entries(weights)) {
    const target = name.trim();
    if (!target) continue;
    normalized.set(target, clampTypedGLBActorMorphWeight(weight));
  }
  return normalized;
}

function clampTypedGLBActorMorphWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 0;
  return Math.min(1, Math.max(0, weight));
}

function typedGLBActorMorphTargetAliases(
  meshName: string,
  targetName: string | undefined,
  targetIndex: number
): readonly string[] {
  const fallback = `target-${targetIndex}`;
  const numberedFallback = `${meshName}-morph-${targetIndex + 1}`;
  const aliases = new Set<string>([fallback, numberedFallback, `${meshName}.${fallback}`, `${meshName}:${fallback}`]);
  if (targetName && targetName.trim().length > 0) {
    const trimmed = targetName.trim();
    aliases.add(trimmed);
    aliases.add(`${meshName}.${trimmed}`);
    aliases.add(`${meshName}:${trimmed}`);
  }
  return [...aliases];
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
