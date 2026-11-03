import {
  createGLTFSceneAnimationRuntime,
  loadProductionGLTFRenderPipeline,
  parseGLTFRuntimeMaterialKey,
  requestIdentityDetails,
  type GLTFSceneAnimationApplyResult,
  type GLTFSceneAnimationRuntime,
  type GLTFSceneAnimationRuntimeSnapshot,
  type GLTFScenePose,
  type ProductionGLTFRenderPipeline
} from "@aura3d/assets/gltf-runtime";

import { mergeAssetRequestOptions, type AssetRequestOptions, type GLTFImageDecoder, type GLTFMaterialRenderStateOverride } from "@aura3d/assets/browser";
import { createBoneMask } from "@aura3d/animation/lanes";
import type { AuraPlayLayerOptions } from "../contracts/animation";
import type { AuraAssetDecodersOption, AuraModelLodOption } from "../contracts/assets";
import { registerNodeHandleExtension } from "../contracts/runtimeNodes";
import type { AuraQuat } from "../contracts/sceneGraph";
import type { AuraRuntimeNodeHandle, AuraVec3 } from "../agent-api/index";
import { boneMaskSkeletonFor, toPoseBoneMaskSpec } from "../agent-api/animationMask.js";
import { createRuntimeNodeHandle, type MutableAuraRuntimeSceneNode } from "../agent-api/app/runtimeNodes.js";
import type { ModelCustomMaterialFactoryContext, ModelCustomMaterialSlotOverride } from "../agent-api/compiler/modelMaterials.js";
import type { ModelCustomMaterialTextureWork } from "../agent-api/compiler/customTextures.js";
import { syncCustomTextureRefs } from "../agent-api/compiler/customMaterial.js";
import { sanitizeDiagnosticText } from "../agent-api/sanitizeDiagnostics.js";
import { assetEventScopeForApp } from "../agent-api/assetEvents.js";
import type { AuraResolvedMaterialInfo } from "../contracts/materials";
import {
  applyMaterialOverrides,
  snapshotMaterials,
  type AuthoredMaterialSnapshot,
  type TypedGLBActorMaterialOverride
} from "./ModelMaterialOverrides";
import { modelTextureShareKey, sharedModelTextures } from "./actor/ModelTextureShare";
import { estimateGlbResourceBytes, glbResourceCache, glbResourceCacheKey, valueToken } from "./GlbResourceCache";
import { createGLBActorAnimationMaterialResolver, createTypedGLBActorAnimationTrack, createTypedGLBActorEvidence, type TypedGLBActorMorphApplyOptions } from "./actor/TypedGLBActorAnimation";
import { clearTypedGLBActorQrFlags, setTypedGLBActorQrFlags, typedGLBActorExtensions, typedGLBActorQrFlags } from "./actor/extensions";
import { actorAnimationContextFor, bindActorAnimationContext, isActorAnimationContextDisposed, type ActorAnimationContext } from "../agent-api/app/actorAnimationHandle.js";
import type { LodCamera } from "./LodSelector.js";
import { getTypedGLBActorLod } from "./actor/TypedGLBActorLod.js";

export { createGLBActorAnimationMaterialResolver, createTypedGLBActorEvidence } from "./actor/TypedGLBActorAnimation";

import {
  consolidateStaticMeshes,
  PortableShaderMaterial,
  TextureBinding,
  type Material,
  type MeshConsolidationInput,
  type MeshConsolidationResult,
  type RenderItem
} from "@aura3d/rendering";
import { decomposeMat4, eulerXYZFromQuat, identityMat4, multiplyMat4, quatFromEulerXYZ, type Mat4, type SceneNode } from "@aura3d/scene";

export interface TypedGLBActorAsset {
  readonly id?: string;
  readonly url: string;
  readonly type?: string;
  readonly format?: string;
  readonly formatMetadata?: Parameters<typeof loadProductionGLTFRenderPipeline>[0]["formatMetadata"];
  readonly hash?: string;
  /** Legacy bare SHA-256, accepted alongside canonical `hash`. */
  readonly sha256?: string;
  readonly integrity?: NonNullable<Parameters<typeof loadProductionGLTFRenderPipeline>[0]["request"]>["integrity"];
  /** Transport policy carried by the admitted asset. */
  readonly request?: AssetRequestOptions;
  readonly bounds?: readonly number[];
  readonly sizeBytes?: number;
}

export interface TypedGLBActorOptions {
  readonly asset: TypedGLBActorAsset;
  readonly id: string;
  readonly name?: string;
  readonly width: number;
  readonly height: number;
  /** App/runtime identity, carried through asynchronous actor loading. */
  readonly runtimeOwner?: object;
  /** Transport policy and cancellation for this model and all its dependencies. */
  readonly request?: Parameters<typeof loadProductionGLTFRenderPipeline>[0]["request"];
  /** Per-app native format adapters; ordinary glTF loads do not require a registry. */
  readonly formatRegistry?: Parameters<typeof loadProductionGLTFRenderPipeline>[0]["formatRegistry"];
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
  /** Actor-owned portable material replacing each supported imported material slot. */
  readonly customMaterialFactory?: (context: ModelCustomMaterialFactoryContext) => Material;
  /** Targeted, load-time replacements keyed by the active imported material name. */
  readonly customMaterialOverrides?: readonly ModelCustomMaterialSlotOverride[];
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
  /** Preserve decoded mip source metadata for a device-local residency owner. */
  readonly retainTextureResidencySources?: boolean;
  /** Optional max texture dimension for the pipeline load (declaration-only seam, C-17). */
  readonly maxTextureSize?: number;
  /** Optional LOD selection policy consumed by the lane-05 LOD extension (declaration-only seam, C-17). */
  readonly lod?: AuraModelLodOption;
  /**
   * SA-04 (lane L8): shared GPU-texture cache for skinned clones. Clones built
   * by `cloneSkinned`/`characters.clone` pass the same cache so each glTF image
   * decodes and uploads once for the whole clone set.
   */
  readonly sharedTextures?: import("@aura3d/assets").GLTFSharedTextureCache;
  /**
   * Default true: actors with a reusable request identity and the same asset/decode options
   * share one ref-counted texture cache. Unscoped credentialed requests use private resources.
   * Set false to give an actor its own private textures.
   */
  readonly shareTextures?: boolean;
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
  /** Active scene camera used for this frame's LOD selection. */
  readonly lodCamera?: LodCamera;
  /** Reuse this frame's selection when collecting a second transform for instancing. */
  readonly reuseLodSelection?: boolean;
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

/** GU47 E-H — `TypedGLBActor.crossFadeTo` options. */
export interface TypedGLBActorCrossFadeOptions {
  /** Playback rate of the new clip (1 = authored, 0 = frozen). */
  readonly speed?: number;
  /** `false` plays the clip once and holds its last frame (default: loop). */
  readonly loop?: boolean;
  /** Warp the outgoing and incoming time scales over the fade (`node.play` semantics). */
  readonly warp?: boolean;
  /** `"inertialize"` blends from the captured pose offset instead of a weight cross-fade. */
  readonly transition?: "crossfade" | "inertialize";
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
  readonly lodCamera?: LodCamera;
  readonly reuseLodSelection?: boolean;
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
  applyMorphTargets(weights: Readonly<Record<string, number>>, options?: TypedGLBActorMorphApplyOptions): TypedGLBActorMorphApplyResult;
  /**
   * GU47 E-H — mixer playback for actors the app drives itself (root render sources, clones):
   * fade the base clip to `clip` over `seconds` (0 = cut). Once `crossFadeTo` / `playLayer` is
   * used, call {@link advance} once per frame instead of `playClip`.
   */
  crossFadeTo(clip: string, seconds: number, options?: TypedGLBActorCrossFadeOptions): TypedGLBActor;
  /**
   * GU47 E-H — blend `clip` over the base clip on a named layer (`weight`, `fadeIn`, `mask`,
   * `blendMode`, `speed`, the same options as `node.animation.playLayer`). A second clip on the
   * same layer replaces the first (fading it out over `fadeIn`).
   */
  playLayer(layer: string, clip: string, options?: AuraPlayLayerOptions): TypedGLBActor;
  /** GU47 E-H — fade a layer out over `fadeOut` seconds (default 0: stop now). */
  stopLayer(layer: string, fadeOut?: number): TypedGLBActor;
  /**
   * GU47 E-H — step the actor's mixer by `dt` seconds and write the blended pose (base cross-fade,
   * layers, pose constraints) onto the GLB scene and skinning palettes.
   */
  advance(dt: number): GLTFSceneAnimationApplyResult;
  /**
   * GU47 E-H — the GLB scene node named `name` (first depth-first match) as its own runtime
   * handle: `setPosition` / `setRotation` / `setScale` / `setVisible` write the node's local
   * transform inside the model and draw from the next frame; `getWorld*` compose the model matrix
   * of the last drawn frame. `undefined` when the GLB has no such node or its meshes were merged
   * by `consolidateStaticMeshes`. A clip that animates the node overwrites these writes.
   */
  part(name: string): AuraRuntimeNodeHandle | undefined;
  collectRenderItems(options?: TypedGLBActorTransformOptions): RenderItem[];
  snapshot(): GLTFSceneAnimationRuntimeSnapshot;
  /**
   * C-15: re-apply the given uniform overrides from the post-load authored snapshot — idempotent,
   * never accumulates (the legacy `setTint` mutated in place). Empty list restores authored state.
   */
  setMaterialOverrides(overrides: readonly TypedGLBActorMaterialOverride[]): void;
  /** Switch to a declared material variant (`null` = authored); failures and cancellation reject. */
  setMaterialVariant(name: string | null): Promise<"applied" | "variant-unknown">;
  /** C-15: every `KHR_materials_variants` name declared across the actor's renderable bindings. */
  materialVariants(): readonly string[];
  /** Whether a source material name (or any name when omitted) uses a custom slot. */
  hasCustomMaterialOverride?(name?: string): boolean;
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
const explicitTextureCacheContexts = new WeakMap<object, string>();
const registryIds = new WeakMap<object, number>();
let nextRegistryId = 1;

interface ActorDisposalState {
  readonly pending: Set<Promise<void>>;
  readonly failures: unknown[];
}

// Registry-backed loaders may release resources asynchronously. Track their
// completion per app owner without keeping the app or canvas alive globally.
const actorDisposals = new WeakMap<object, ActorDisposalState>();

function disposePipeline(pipeline: ProductionGLTFRenderPipeline, owner: object | undefined, track: boolean): void {
  const pending = pipeline.disposeAsync();
  if (!track || !owner) {
    void pending.catch(() => {});
    return;
  }
  let state = actorDisposals.get(owner);
  if (!state) {
    state = { pending: new Set(), failures: [] };
    actorDisposals.set(owner, state);
  }
  const owned = state;
  const observed = pending.catch((error: unknown) => { owned.failures.push(error); });
  owned.pending.add(observed);
  void observed.then(() => { owned.pending.delete(observed); });
}

/** Wait for this owner's registered-format teardowns without affecting other apps. */
export async function awaitTypedGLBActorDisposals(owner: object): Promise<void> {
  const state = actorDisposals.get(owner);
  if (!state) return;
  while (state.pending.size) await Promise.all([...state.pending]);
  if (state.failures.length) throw new AggregateError(state.failures, "Native model cleanup failed");
}

function registryToken(registry: object | undefined): string {
  if (!registry) return "default";
  let id = registryIds.get(registry);
  if (id === undefined) { id = nextRegistryId++; registryIds.set(registry, id); }
  return String(id);
}

function canonicalDigest(value: string): string {
  const digest = value.replace(/^sha256-/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("Invalid asset SHA-256 digest");
  return `sha256-${digest}`;
}

/** Legacy `hash` / `sha256` is the expected document digest, not just display provenance. */
async function actorRequest(options: TypedGLBActorOptions): Promise<NonNullable<TypedGLBActorOptions["request"]>> {
  const asset = options.asset;
  const request = { ...options.request, ...mergeAssetRequestOptions(asset.request, options.request) };
  const legacy = asset.hash ?? asset.sha256;
  const digest = legacy === undefined ? undefined : canonicalDigest(legacy);
  if (asset.hash !== undefined && asset.sha256 !== undefined && canonicalDigest(asset.hash) !== canonicalDigest(asset.sha256)) {
    throw new Error("Conflicting asset SHA-256 digests");
  }
  if (digest && asset.integrity && digest !== canonicalDigest(asset.integrity.digest)) {
    throw new Error("Asset hash does not match its integrity metadata");
  }
  if (asset.request?.integrity && options.request?.integrity && !sameIntegrity(asset.request.integrity, options.request.integrity)) {
    throw new Error("Request integrity conflicts with the admitted asset");
  }
  if ((asset.integrity && request.integrity && !sameIntegrity(asset.integrity, request.integrity)) ||
      (digest && request.integrity && digest !== canonicalDigest(request.integrity.digest))) {
    throw new Error("Request integrity conflicts with the admitted asset");
  }
  const integrity = asset.integrity ?? request.integrity ?? (digest ? { version: 1 as const, digest } : undefined);
  // Admitted models may not silently render unverified external buffers/images. Legacy single-file
  // GLBs migrate without inventing dependency hashes; external .gltf needs an admitted map.
  return {
    ...request,
    ...(integrity ? {
      expectedUrl: request.expectedUrl ?? asset.url,
      integrity: { ...integrity, requireDependencies: true }
    } : {})
  };
}

function sameIntegrity(left: NonNullable<NonNullable<TypedGLBActorOptions["request"]>["integrity"]>, right: typeof left): boolean {
  if (left.version !== 1 || right.version !== 1 || canonicalDigest(left.digest) !== canonicalDigest(right.digest) ||
      (left.requireDependencies ?? false) !== (right.requireDependencies ?? false)) return false;
  const leftDependencies = Object.entries(left.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const rightDependencies = Object.entries(right.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return leftDependencies.length === rightDependencies.length && leftDependencies.every(([uri, hash], index) =>
    uri === rightDependencies[index]?.[0] && canonicalDigest(hash) === canonicalDigest(rightDependencies[index]![1]));
}

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

// Stable draw identities are actor-local, so separate actors can safely share
// decoded nodes or geometry. Weak keys retire with their mounted resources.
type ActorTemporalKeys = WeakMap<object, WeakMap<object, WeakMap<object, object>>>;
const actorTemporalKeys = new WeakMap<TypedGLBActor, ActorTemporalKeys>();
function actorTemporalKey(actor: TypedGLBActor, node: object, renderable: object, geometry: object): object {
  let nodes = actorTemporalKeys.get(actor);
  if (!nodes) { nodes = new WeakMap(); actorTemporalKeys.set(actor, nodes); }
  let renderables = nodes.get(node);
  if (!renderables) { renderables = new WeakMap(); nodes.set(node, renderables); }
  let geometries = renderables.get(renderable);
  if (!geometries) { geometries = new WeakMap(); renderables.set(renderable, geometries); }
  let key = geometries.get(geometry);
  if (!key) { key = {}; geometries.set(geometry, key); }
  return key;
}

function unsupportedCustomModelMaterial(reason: string): Error {
  const error = new Error(`MODEL_CUSTOM_MATERIAL_UNSUPPORTED: ${reason}`);
  Object.assign(error, { code: "MODEL_CUSTOM_MATERIAL_UNSUPPORTED" });
  return error;
}

/** A whole-model replacement cannot retain a source material's sampled maps. */
function hasAuthoredMaterialTextures(material: ProductionGLTFRenderPipeline["asset"]["materials"][number], replaceSurface = false): boolean {
  return Boolean(
    (!replaceSurface && (material.baseColorTexture || material.metallicRoughnessTexture)) || material.normalTexture
    || material.occlusionTexture || material.emissiveTexture
    || material.diffuseRoughness?.texture || material.bump?.texture
    || material.clearcoat?.texture || material.clearcoat?.roughnessTexture || material.clearcoat?.normalTexture
    || material.transmission?.texture || material.diffuseTransmission?.texture || material.diffuseTransmission?.colorTexture
    || material.volume?.thicknessTexture || material.specular?.texture || material.specular?.colorTexture
    || material.pbrSpecularGlossiness?.diffuseTexture || material.pbrSpecularGlossiness?.specularGlossinessTexture
    || material.sheen?.colorTexture || material.sheen?.roughnessTexture || material.anisotropy?.texture
    || material.iridescence?.texture || material.iridescence?.thicknessTexture
  );
}

type ActorRenderable = ReturnType<ProductionGLTFRenderPipeline["resources"]["scene"]["collectRenderables"]>[number];

interface CustomSlotPlanEntry {
  readonly rule: ModelCustomMaterialSlotOverride;
  readonly skinned: Set<ActorRenderable["renderable"]>;
  hasInstanceColors: boolean;
  /** Authored-map uniform names (`u_<slot>Texture`) of the source material, mapped to bindability. */
  readonly authoredMaps: ReadonlyMap<string, boolean>;
}

type GLTFSourceMaterial = ProductionGLTFRenderPipeline["asset"]["materials"][number];
type GLTFSourceTextureInfo = NonNullable<GLTFSourceMaterial["baseColorTexture"]>;

/**
 * Authored glTF maps a custom slot shader can sample. Each map binds to the
 * shader uniform of the same name the imported PBR material uses (declare
 * `baseColorTexture` in `material.custom.uniforms` as `texture2d` with no value
 * to receive the slot's authored base-colour map; it resolves to
 * `u_baseColorTexture`). Specular-glossiness maps have no portable binding.
 */
const AUTHORED_SLOT_MAPS: readonly { readonly uniform: string; readonly texture: (material: GLTFSourceMaterial) => GLTFSourceTextureInfo | undefined }[] = [
  { uniform: "u_baseColorTexture", texture: (material) => material.baseColorTexture },
  { uniform: "u_metallicRoughnessTexture", texture: (material) => material.metallicRoughnessTexture },
  { uniform: "u_normalTexture", texture: (material) => material.normalTexture },
  { uniform: "u_occlusionTexture", texture: (material) => material.occlusionTexture },
  { uniform: "u_emissiveTexture", texture: (material) => material.emissiveTexture },
  { uniform: "u_diffuseRoughnessTexture", texture: (material) => material.diffuseRoughness?.texture },
  { uniform: "u_bumpTexture", texture: (material) => material.bump?.texture },
  { uniform: "u_clearcoatTexture", texture: (material) => material.clearcoat?.texture },
  { uniform: "u_clearcoatRoughnessTexture", texture: (material) => material.clearcoat?.roughnessTexture },
  { uniform: "u_clearcoatNormalTexture", texture: (material) => material.clearcoat?.normalTexture },
  { uniform: "u_transmissionTexture", texture: (material) => material.transmission?.texture },
  { uniform: "u_diffuseTransmissionTexture", texture: (material) => material.diffuseTransmission?.texture },
  { uniform: "u_diffuseTransmissionColorTexture", texture: (material) => material.diffuseTransmission?.colorTexture },
  { uniform: "u_volumeThicknessTexture", texture: (material) => material.volume?.thicknessTexture },
  { uniform: "u_specularTexture", texture: (material) => material.specular?.texture },
  { uniform: "u_specularColorTexture", texture: (material) => material.specular?.colorTexture },
  { uniform: "u_sheenColorTexture", texture: (material) => material.sheen?.colorTexture },
  { uniform: "u_sheenRoughnessTexture", texture: (material) => material.sheen?.roughnessTexture },
  { uniform: "u_anisotropyTexture", texture: (material) => material.anisotropy?.texture },
  { uniform: "u_iridescenceTexture", texture: (material) => material.iridescence?.texture },
  { uniform: "u_iridescenceThicknessTexture", texture: (material) => material.iridescence?.thicknessTexture }
];

/**
 * The authored maps a custom slot must either sample or explicitly replace.
 * A shader only receives the map itself, so a map that needs a second UV set
 * or a KHR_texture_transform can be kept only by replacing it.
 */
function authoredSlotMaps(material: GLTFSourceMaterial, name: string, replaceTextures: boolean): ReadonlyMap<string, boolean> {
  if (!replaceTextures && (material.pbrSpecularGlossiness?.diffuseTexture || material.pbrSpecularGlossiness?.specularGlossinessTexture)) {
    throw unsupportedCustomModelMaterial(`slot '${name}' has specular-glossiness maps, which a custom shader cannot bind; replace them with a materialOverrides slot rule and replaceTextures: true`);
  }
  // uniform -> whether the map can be bound (false: it can only be replaced).
  const maps = new Map<string, boolean>();
  for (const entry of AUTHORED_SLOT_MAPS) {
    const info = entry.texture(material);
    if (!info) continue;
    const bindable = info.texCoord === 0 && info.transform === undefined;
    if (!replaceTextures && !bindable) {
      throw unsupportedCustomModelMaterial(`slot '${name}' map ${entry.uniform.slice(2)} uses TEXCOORD_${info.texCoord}${info.transform ? " with a texture transform" : ""}, which a custom shader binding cannot carry; replace it with a materialOverrides slot rule and replaceTextures: true`);
    }
    maps.set(entry.uniform, bindable);
  }
  return maps;
}

/**
 * Copy the replaced imported material's live authored-map bindings into the
 * slot shader. Only a changed binding is written, so steady frames do not
 * bump the material revision; a variant switch rebinds the variant's maps.
 */
function bindAuthoredSlotTextures(material: Material, authored: RenderItem["material"] | undefined, uniforms: readonly string[] | undefined): void {
  if (!uniforms || !authored) return;
  const base = ("baseMaterial" in authored ? authored.baseMaterial : authored) as Material;
  for (const uniform of uniforms) {
    const source = base.getParameter(uniform);
    // A failed authored decode is already a load issue; keep the previous
    // binding (or the neutral fallback) rather than failing every frame.
    if (!(source instanceof TextureBinding) || !source.texture) continue;
    const current = material.getParameter(uniform);
    if (current instanceof TextureBinding && current.texture === source.texture) continue;
    material.setParameter(uniform, new TextureBinding({ name: uniform, texture: source.texture, sampler: source.sampler, required: false }));
  }
}

/** Declared `texture2d` uniforms of a custom slot material, by name. */
function declaredTextureUniforms(material: Material): ReadonlySet<string> {
  return new Set(material.uniformSchema.filter((uniform) => uniform.kind === "texture2d").map((uniform) => uniform.name));
}

/**
 * Match the source material of each primitive and of every possible variant,
 * not the mesh name or the material currently visible at startup. This also
 * lets an untouched textured/animated slot keep its original resource.
 */
function planCustomMaterialSlots(
  pipeline: ProductionGLTFRenderPipeline,
  rules: readonly ModelCustomMaterialSlotOverride[]
): Map<string, CustomSlotPlanEntry> {
  const plan = new Map<string, CustomSlotPlanEntry>();
  const matched = rules.map(() => false);
  const renderables = pipeline.resources.scene.collectRenderables();
  for (const { node, renderable } of renderables) {
    const meshes = pipeline.asset.meshes.filter((candidate) => candidate.name === renderable.geometry);
    if (meshes.length !== 1) throw unsupportedCustomModelMaterial("the imported primitive cannot be identified unambiguously");
    const mesh = meshes[0]!;
    const candidates = [
      { name: mesh.material, index: mesh.materialIndex },
      ...mesh.materialVariants.map((variant) => ({ name: variant.material, index: variant.materialIndex }))
    ];
    let selected = false;
    for (const candidate of candidates) {
      let winner: ModelCustomMaterialSlotOverride | undefined;
      for (const [index, rule] of rules.entries()) {
        if (rule.target(candidate.name)) { matched[index] = true; winner = rule; }
      }
      if (!winner) continue;
      selected = true;
      const definitions = pipeline.asset.materials.filter((material) => material.name === candidate.name);
      if (definitions.length > 1 || (candidate.index !== undefined && pipeline.asset.materials[candidate.index]?.name !== candidate.name)) {
        throw unsupportedCustomModelMaterial(`the imported material slot '${candidate.name}' is ambiguous`);
      }
      const source = candidate.index === undefined ? definitions[0] : pipeline.asset.materials[candidate.index];
      if (source && source.alphaMode !== "OPAQUE") {
        throw unsupportedCustomModelMaterial(`slot '${candidate.name}' cannot preserve its authored alpha coverage`);
      }
      let entry = plan.get(candidate.name);
      if (!entry) {
        entry = { rule: winner, skinned: new Set(), hasInstanceColors: false, authoredMaps: source ? authoredSlotMaps(source, candidate.name, winner.replaceTextures) : new Map() };
        plan.set(candidate.name, entry);
      }
      if (entry.rule !== winner) throw unsupportedCustomModelMaterial(`slot '${candidate.name}' has inconsistent selectors`);
      if (renderable.skinning) entry.skinned.add(renderable);
      if (renderable.instanceColors?.length) entry.hasInstanceColors = true;
    }
    if (!selected) continue;
    if (Object.hasOwn(node.userData, "gltfSkinBinding") && !renderable.skinning) {
      throw unsupportedCustomModelMaterial("an authored skin has no live palette; its joint count or binding is unsupported");
    }
    if (renderable.skinning && ((mesh.joints1?.length ?? 0) > 0 || (mesh.weights1?.length ?? 0) > 0)) {
      throw unsupportedCustomModelMaterial("the imported skin requires unavailable JOINTS_1/WEIGHTS_1 vertex streams");
    }
  }
  const missing = matched.findIndex((value) => !value);
  if (missing >= 0) throw unsupportedCustomModelMaterial(`custom material target ${missing} did not match an imported material slot`);
  let hasLod = false;
  pipeline.resources.scene.traverse((node) => {
    if (Array.isArray(node.userData.gltfLods) && node.userData.gltfLods.length > 0) hasLod = true;
  });
  // The LOD extension substitutes geometry but does not retain a reliable
  // per-level material/variant mapping for every primitive.
  if (plan.size > 0 && hasLod) throw unsupportedCustomModelMaterial("custom slot replacements cannot preserve imported LOD material slots");
  return plan;
}

/**
 * Until the public model API can select slots and bind their authored maps,
 * admit a skinned whole-model replacement only when it cannot conceal another
 * authored slot, sampled map or alpha-cutout silhouette.
 */
function assertSkinnedCustomSourceContract(pipeline: ProductionGLTFRenderPipeline): void {
  const renderables = pipeline.resources.scene.collectRenderables();
  for (const { node, renderable } of renderables) {
    if (Object.hasOwn(node.userData, "gltfSkinBinding") && !renderable.skinning) {
      throw unsupportedCustomModelMaterial("an authored skin has no live palette; its joint count or binding is unsupported");
    }
  }
  const bindings = pipeline.resources.renderableBindings;
  const slots = new Set<string>();
  for (const binding of bindings) {
    const index = binding.sourceMaterialIndex;
    const candidates = index === undefined
      ? pipeline.asset.materials.filter((material) => material.name === binding.sourceMaterialName)
      : [pipeline.asset.materials[index]].filter((material) => material !== undefined);
    if (index !== undefined && candidates.length !== 1 || index === undefined && candidates.length > 1) {
      throw unsupportedCustomModelMaterial("the authored material slot cannot be identified unambiguously");
    }
    slots.add(index === undefined ? `default:${binding.sourceMaterialName}` : `material:${index}`);
    const source = candidates[0];
    if (source && (hasAuthoredMaterialTextures(source) || source.alphaMode !== "OPAQUE")) {
      throw unsupportedCustomModelMaterial("custom replacements cannot preserve authored texture maps or alpha coverage");
    }
  }
  if (!renderables.some(({ renderable }) => Boolean(renderable.skinning))) return;
  let hasImportedLod = false;
  pipeline.resources.scene.traverse((node) => {
    if (Array.isArray(node.userData.gltfLods) && node.userData.gltfLods.length > 0) hasImportedLod = true;
  });
  if (hasImportedLod) {
    throw unsupportedCustomModelMaterial("skinned custom replacements cannot preserve imported LOD material slots");
  }
  if (slots.size > 1) {
    throw unsupportedCustomModelMaterial("skinned custom replacements require a single authored material slot; per-slot selection is unavailable");
  }
  for (const { renderable } of renderables) {
    if (!renderable.skinning) continue;
    const meshes = pipeline.asset.meshes.filter((candidate) => candidate.name === renderable.geometry);
    const mesh = meshes[0];
    // The current asset resource builder uploads only JOINTS_0/WEIGHTS_0. Do
    // not infer four influences from the resulting truncated geometry.
    if (meshes.length !== 1 || !mesh || (mesh.joints1?.length ?? 0) > 0 || (mesh.weights1?.length ?? 0) > 0) {
      throw unsupportedCustomModelMaterial("the imported skin requires unavailable JOINTS_1/WEIGHTS_1 vertex streams");
    }
  }
}

/**
 * Only the graph adapter can currently certify paired forward/depth skinning
 * programs. Check the actual vertex-input kind and both registered stages;
 * do not treat a custom shader's claimed uniforms as proof of deformation.
 */
function assertSkinnedCustomPrograms(material: Material, items: readonly RenderItem[]): void {
  const skinned = items.filter((item) => item.skinning !== undefined);
  if (skinned.length === 0) return;
  if (!(material instanceof PortableShaderMaterial) || !material.graphMaterial
    || !PortableShaderMaterial.hasGraphClippingContract(material)) {
    throw unsupportedCustomModelMaterial("skinned custom shaders require certified paired forward/depth skinning variants with live palette bindings");
  }
  for (const item of skinned) {
    const format = item.geometry.vertexBuffer.format;
    const extra = item.skinning!.extraInfluences === true;
    const hasSecond = format.hasAttribute("joints1") || format.hasAttribute("weights1");
    if (hasSecond !== extra) throw unsupportedCustomModelMaterial("skin influence sets do not match the imported vertex streams");
    const semantics = extra ? ["joints", "weights", "joints1", "weights1"] as const : ["joints", "weights"] as const;
    const locations = { joints: 5, weights: 6, joints1: 8, weights1: 9 } as const;
    const kinds: ("float" | "uint" | "sint")[] = [];
    for (const semantic of semantics) {
      if (!format.hasAttribute(semantic)) throw unsupportedCustomModelMaterial(`skinned geometry is missing ${semantic}`);
      const attribute = format.getAttribute(semantic);
      const joint = semantic.startsWith("joints");
      if (attribute.components !== 4 || attribute.shaderLocation !== locations[semantic]
        || (joint ? attribute.normalized : attribute.integer)) {
        throw unsupportedCustomModelMaterial(`skinned geometry has an incompatible ${semantic} attribute`);
      }
      if (joint) kinds.push(!attribute.integer ? "float" : attribute.type.startsWith("uint") ? "uint" : "sint");
    }
    for (const pass of ["forward", "depth"] as const) {
      const key = material.graphSkinningVariant(extra ? 8 : 4, kinds[0]!, kinds[1] ?? "float", pass);
      if (!key || !PortableShaderMaterial.hasGraphClippingContract(material, key, pass)) {
        throw unsupportedCustomModelMaterial(`the certified ${pass} skinning program is unavailable or was changed`);
      }
    }
  }
}

function assertCustomInstanceColors(material: Material): void {
  const source = material instanceof PortableShaderMaterial ? material.sources.glsl.vertex : "";
  if (!/#define\s+instanceMatrix\b/.test(source) || !/#define\s+instanceColor\b/.test(source)) {
    throw unsupportedCustomModelMaterial("instance colors require a custom vertex shader using both instanceMatrix and instanceColor");
  }
}

export async function createTypedGLBActor(options: TypedGLBActorOptions): Promise<TypedGLBActor> {
  // The renderer and compiler both pass their unique app owner here. Capture
  // that scope and mount signal per request, never a process-wide listener.
  const scope = options.runtimeOwner ? assetEventScopeForApp(options.runtimeOwner) : undefined;
  if (!scope) return createTypedGLBActorOwned(options);
  const signal = options.request?.signal;
  const onProgress = options.request?.onProgress;
  const assetId = options.asset.id ?? options.id;
  const url = options.asset.url;
  if (scope.signal.aborted) throw actorLoadCancelled();
  // The owning app's closure cancels this model and its dependencies even when
  // the caller's request carries no signal or a signal the app does not own.
  const owned = linkOwnerAbortSignal(signal, scope.signal);
  try {
    return await createTypedGLBActorOwned({
      ...options,
      request: {
        ...options.request,
        signal: owned.signal,
        onProgress: (event) => {
          if (signal?.aborted || scope.signal.aborted) return;
          try { onProgress?.(event); } catch { /* Observers do not own the request. */ }
          if (signal?.aborted || scope.signal.aborted) return;
          scope.emitProgress({
            url: event.url,
            item: event.url,
            assetId,
            loaded: event.loadedBytes,
            total: event.totalBytes ?? event.loadedBytes
          });
        }
      }
    });
  } catch (error) {
    if (!signal?.aborted && !scope.signal.aborted) scope.emitError({ url, assetId, error });
    // A failure that settles after the owner closed belongs to no caller.
    if (scope.signal.aborted && !signal?.aborted) throw actorLoadCancelled();
    throw error;
  } finally {
    owned.dispose();
  }
}

/** Link the caller and owner signals without retaining listeners afterwards. */
function linkOwnerAbortSignal(caller: AbortSignal | undefined, owner: AbortSignal): { readonly signal: AbortSignal; dispose(): void } {
  if (!caller || caller === owner) return { signal: owner, dispose() {} };
  const controller = new AbortController();
  const sources = [caller, owner];
  const abort = (event?: Event): void => {
    const source = (event?.target as AbortSignal | undefined) ?? sources.find((item) => item.aborted);
    for (const item of sources) item.removeEventListener("abort", abort);
    if (!controller.signal.aborted) controller.abort(source?.reason);
  };
  if (sources.some((item) => item.aborted)) abort();
  else for (const item of sources) item.addEventListener("abort", abort, { once: true });
  return { signal: controller.signal, dispose: () => { for (const item of sources) item.removeEventListener("abort", abort); } };
}

async function createTypedGLBActorOwned(options: TypedGLBActorOptions): Promise<TypedGLBActor> {
  // Capture ownership and policy before the first await. A later app mount may
  // start while this model is loading, but it cannot change this actor's flags.
  const animationContext = actorAnimationContextFor(options.runtimeOwner);
  const initialFlags = typedGLBActorQrFlags(options.runtimeOwner);
  // The model document's derived URL and integrity belong only to that model.
  // Custom texture refs instead inherit a snapshot of the app request policy
  // and combine it with their own independently admitted asset metadata.
  const customTextureRequest = mergeAssetRequestOptions({}, options.request);
  const customTextureMaxDimension = options.maxTextureSize;
  if (isActorAnimationContextDisposed(animationContext)) throw actorLoadCancelled();
  if (options.customMaterialOverrides?.length && options.customMaterialFactory) {
    throw unsupportedCustomModelMaterial("whole-model and per-slot custom replacements cannot be combined");
  }
  if (options.customMaterialOverrides?.length && (options.deduplicateIdenticalMaterials || options.consolidateStaticMeshes)) {
    throw unsupportedCustomModelMaterial("per-slot replacements require distinct, unconsolidated imported materials");
  }
  const format = options.asset.format?.toLowerCase();
  if (!options.formatRegistry && format && format !== "glb" && format !== "gltf") {
    throw new Error(`No native model adapter is installed for format "${options.asset.format}"`);
  }
  const request = await actorRequest(options);
  if (request.signal?.aborted) throw request.signal.reason ?? new Error("Asset load aborted");
  const identity = await requestIdentityDetails(request, options.asset.url);
  if (request.signal?.aborted) throw request.signal.reason ?? new Error("Asset load aborted");
  if (options.sharedTextures && !identity.reusable) {
    throw new Error("Shared glTF texture cache requires a reusable request identity; omit credentials or provide a security context");
  }
  const requestKey = identity.key;
  const qrMaterials = initialFlags.on("A3D_QR_MATERIALS");
  const qrTransmission = qrMaterials && initialFlags.on("A3D_QR_MATERIALS_TRANSMISSION");
  const transmission = options.transmission ?? (options.runtimeOwner === undefined ? qrTransmissionMode : undefined);
  const renderStateOverrides = (options.materialOverrides ?? []).filter(
    (override): override is GLTFMaterialRenderStateOverride => "renderState" in override
  );
  const typedOverrides = (options.materialOverrides ?? []).filter(
    (override): override is TypedGLBActorMaterialOverride => !("renderState" in override)
  );
  // P5-2: decoder-missing failures surface a `decoder-missing:<id>` issue before the error
  // propagates as the actor's load failure (AssetDecoderUnavailable names the decoder).
  const loadIssues: string[] = [];
  // URL and request credentials enter only the opaque identity; cache snapshots cannot reveal
  // signed query strings or headers. Content integrity is part of the identity as well.
  const formatKey = `${format ?? "auto"}|adapter=${registryToken(options.formatRegistry)}:${options.formatRegistry?.generation ?? 0}|metadata=${valueToken(options.asset.formatMetadata)}`;
  const textureKey = `${modelTextureShareKey({ ...options, asset: { url: "" } })}|format=${formatKey}|request=${requestKey}`;
  if (options.sharedTextures) {
    const existingContext = explicitTextureCacheContexts.get(options.sharedTextures);
    if (existingContext !== undefined && existingContext !== textureKey) {
      throw new Error("Shared glTF texture cache cannot be used across asset or request contexts");
    }
    explicitTextureCacheContexts.set(options.sharedTextures, textureKey);
  }
  const textureShare = identity.reusable && options.sharedTextures === undefined && options.shareTextures !== false
    ? sharedModelTextures.acquire(textureKey)
    : undefined;
  const sharedTextures = options.sharedTextures ?? textureShare?.cache;
  // GU47 E-H: GLB resource cache across setScene. A kept entry still holds this asset's parse and
  // texture leases, so the load below reuses them; a kept GLB without draco / meshopt / KTX2 needs
  // no decoders, so its decoder pre-scan (a GLB fetch) is skipped.
  const cacheKey = `${glbResourceCacheKey({ ...options, asset: { url: "" } })}|format=${formatKey}|request=${requestKey}`;
  // The global GLB remount cache cannot own an app's optional adapter lease:
  // its cleanup must run when that app releases the actor.
  const useResourceCache = identity.reusable && options.formatRegistry === undefined;
  const kept = useResourceCache ? glbResourceCache.peek(cacheKey) : undefined;
  if (useResourceCache) glbResourceCache.noteLoad(cacheKey);
  const decoders = kept?.uncompressed === true ? undefined : options.decoders;
  let pipeline: Awaited<ReturnType<typeof loadProductionGLTFRenderPipeline>>;
  try {
    pipeline = await loadProductionGLTFRenderPipeline({
      url: options.asset.url,
      assetId: options.id,
      ...(format ? { format } : {}),
      ...(options.asset.formatMetadata ? { formatMetadata: options.asset.formatMetadata } : {}),
      ...(options.formatRegistry ? { formatRegistry: options.formatRegistry } : {}),
      assetName: options.name ?? options.id,
      request,
      width: options.width,
      height: options.height,
      ...(options.imageDecoder ? { imageDecoder: options.imageDecoder } : {}),
      // Capture the authored bindings first. Loading directly with a variant
      // makes the loader's binding snapshot use the variant as the default.
      ...(options.materialVariant !== undefined && !options.customMaterialOverrides?.length && !options.customMaterialFactory ? { materialVariant: options.materialVariant } : {}),
      ...(renderStateOverrides.length > 0 ? { materialRenderStateOverrides: renderStateOverrides } : {}),
      ...(options.textureBudget !== undefined ? { textureBudget: options.textureBudget } : {}),
      ...(options.retainTextureResidencySources ? { retainTextureResidencySources: true } : {}),
      ...(options.maxTextureSize !== undefined ? { maxTextureSize: options.maxTextureSize } : {}),
      ...(decoders ? { decoders } : {}),
      ...(options.compressedTextureCapabilities ? { compressedTextureCapabilities: options.compressedTextureCapabilities } : {}),
      ...(options.tangents !== undefined ? { tangents: options.tangents } : {}),
      ...(qrMaterials ? { materialsR185: true } : {}),
      ...(qrTransmission ? { materialsTransmission: true } : {}),
      ...(transmission !== undefined ? { transmission } : {}),
      ...(options.deduplicateIdenticalMaterials ? { deduplicateIdenticalMaterials: true } : {}),
      ...(sharedTextures ? { sharedTextures } : {})
    });
  } catch (error) {
    textureShare?.release();
    if (error instanceof Error && error.name === "AssetDecoderUnavailable") {
      loadIssues.push(`decoder-missing:${(error as { decoderId?: string }).decoderId ?? "unknown"}`);
    }
    throw error;
  }
  const customTextureWork = new Set<ModelCustomMaterialTextureWork>();
  let customMaterial: Material | undefined;
  const scopedMaterials = new Map<string, Material>();
  const ownedScopedMaterials = new Set<Material>();
  /** Declared uniforms each slot material samples from the replaced authored material. */
  const authoredSlotBindings = new Map<Material, readonly string[]>();
  let customSlotPlan: Map<string, CustomSlotPlanEntry> | undefined;
  let animationForCleanup: GLTFSceneAnimationRuntime | undefined;
  let customSkinnedSourceCount = 0;
  let actorForCleanup: TypedGLBActor | undefined;
  let textureAbort: AbortController | undefined;
  let acceptingTextureWork = false;
  let textureWorkReleased = false;
  let textureCleanupFailed = false;
  let textureCleanupFailure: unknown;
  let notifyTextureCleanupFailure: () => void = () => undefined;
  const textureCleanupFailureSignal = new Promise<void>((resolve) => { notifyTextureCleanupFailure = resolve; });
  const parentSignal = request.signal;
  const forwardTextureAbort = (): void => {
    // Event listeners cannot report a cleanup error to the caller. Retain it
    // for the actor's normal failure/disposal path instead of losing it.
    try { releaseCustomTextureWork(); } catch { /* Retained below. */ }
  };
  const releaseCustomTextureWork = (): void => {
    if (textureWorkReleased) {
      if (textureCleanupFailed) throw textureCleanupFailure;
      return;
    }
    textureWorkReleased = true;
    acceptingTextureWork = false;
    parentSignal?.removeEventListener("abort", forwardTextureAbort);
    textureAbort?.abort(parentSignal?.aborted ? parentSignal.reason : undefined);
    const failures: unknown[] = [];
    for (const work of customTextureWork) {
      try { work.dispose(); } catch (error) { failures.push(error); }
    }
    if (failures.length) {
      textureCleanupFailed = true;
      textureCleanupFailure = new AggregateError(failures, "Model custom texture cleanup failed");
      notifyTextureCleanupFailure();
      throw textureCleanupFailure;
    }
  };
  const adoptTextureWork = (work: ModelCustomMaterialTextureWork): void => {
    // Observe a rejection even if the factory throws after transferring work.
    void work.ready.catch(() => undefined);
    if (!acceptingTextureWork || textureWorkReleased) {
      work.dispose();
      if (parentSignal?.aborted) throw parentSignal.reason ?? actorLoadCancelled();
      throw new Error("Model custom texture work must be adopted during material creation");
    }
    customTextureWork.add(work);
  };
  const collectSkinnedSourceItems = (): RenderItem[] => pipeline.resources.scene.collectRenderables().flatMap(({ node, renderable }) => {
    if (!renderable.skinning) {
      if (Object.hasOwn(node.userData, "gltfSkinBinding")) {
        throw unsupportedCustomModelMaterial("an authored skin has no live palette; its joint count or binding is unsupported");
      }
      return [];
    }
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    if (!geometry) throw unsupportedCustomModelMaterial("the imported skin has no renderable geometry");
    return [{ geometry, skinning: renderable.skinning }];
  });
  const verifySkinnedSourceItems = (): RenderItem[] => {
    const items = collectSkinnedSourceItems();
    if (items.length !== customSkinnedSourceCount) {
      throw unsupportedCustomModelMaterial("the imported skin bindings changed after admission");
    }
    return items;
  };
  const validateSkinnedSourceItems = (material: Material): RenderItem[] => {
    const items = verifySkinnedSourceItems();
    assertSkinnedCustomPrograms(material, items);
    return items;
  };
  const validateScopedSkins = (): number => {
    const all = new Set<ActorRenderable["renderable"]>();
    for (const [name, entry] of customSlotPlan ?? []) {
      const material = scopedMaterials.get(name);
      if (!material) continue;
      const items: RenderItem[] = [];
      for (const renderable of entry.skinned) {
        if (!renderable.skinning) throw unsupportedCustomModelMaterial("an authored skin has no live palette; its joint count or binding is unsupported");
        const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
        if (!geometry) throw unsupportedCustomModelMaterial("the imported skin has no renderable geometry");
        all.add(renderable);
        items.push({ geometry, skinning: renderable.skinning });
      }
      assertSkinnedCustomPrograms(material, items);
    }
    return all.size;
  };
  try {
  if (isActorAnimationContextDisposed(animationContext) || request.signal?.aborted) {
    throw request.signal?.aborted ? request.signal.reason ?? actorLoadCancelled() : actorLoadCancelled();
  }
  // A whole-model shader over a textured or variant-bearing unskinned model is
  // one slot rule matching every authored material: each slot (and variant)
  // receives its own material instance with that slot's authored maps bound.
  // Every authored map must be declared by the shader; to drop maps instead,
  // use materialOverrides: [{ target: /.*/, material, replaceTextures: true }].
  const routeWholeModelAsSlots = options.customMaterialFactory !== undefined &&
    !pipeline.resources.scene.collectRenderables().some(({ renderable }) => Boolean(renderable.skinning)) &&
    (options.materialVariant !== undefined ||
      pipeline.resources.renderableBindings.some((binding) => binding.materialVariants.length > 0) ||
      pipeline.asset.materials.some((material) => hasAuthoredMaterialTextures(material)));
  const wholeModelFactory = routeWholeModelAsSlots ? undefined : options.customMaterialFactory;
  const customSlotRules: readonly ModelCustomMaterialSlotOverride[] | undefined = routeWholeModelAsSlots
    ? [{ target: () => true, factory: options.customMaterialFactory!, replaceTextures: false }]
    : options.customMaterialOverrides;
  if (wholeModelFactory && options.materialVariant !== undefined) {
    throw unsupportedCustomModelMaterial("an imported material variant cannot be visible under a skinned whole-model custom replacement; target the skinned slot with materialOverrides");
  }
  if (routeWholeModelAsSlots && (options.deduplicateIdenticalMaterials || options.consolidateStaticMeshes)) {
    throw unsupportedCustomModelMaterial("a textured or variant whole-model replacement requires distinct, unconsolidated imported materials");
  }
  if (wholeModelFactory) {
    assertSkinnedCustomSourceContract(pipeline);
    customSkinnedSourceCount = collectSkinnedSourceItems().length;
    if (typedOverrides.length > 0 || renderStateOverrides.length > 0 || options.tint) {
      const error = new Error("MODEL_CUSTOM_MATERIAL_UNSUPPORTED: PBR overrides and tint cannot be applied to a custom shader");
      Object.assign(error, { code: "MODEL_CUSTOM_MATERIAL_UNSUPPORTED" });
      throw error;
    }
  }
  if (routeWholeModelAsSlots && (typedOverrides.length > 0 || renderStateOverrides.length > 0 || options.tint)) {
    throw unsupportedCustomModelMaterial("PBR overrides and tint cannot be applied to a custom shader");
  }
  if (customSlotRules?.length) {
    for (const rule of customSlotRules) {
      if (!rule || typeof rule.target !== "function" || typeof rule.factory !== "function" || typeof rule.replaceTextures !== "boolean") {
        throw unsupportedCustomModelMaterial("invalid custom material slot selector or factory");
      }
    }
    if (options.tint || renderStateOverrides.length > 0) {
      throw unsupportedCustomModelMaterial("tint and render-state overrides cannot be combined with custom slots");
    }
    customSlotPlan = planCustomMaterialSlots(pipeline, customSlotRules);
    for (const name of customSlotPlan.keys()) {
      if (typedOverrides.some((override) => !override.target || override.target(name))) {
        throw unsupportedCustomModelMaterial(`PBR overrides overlap custom slot '${name}'`);
      }
    }
  }
  // This actor now holds its own parse and texture leases: the kept copy has done its job.
  if (useResourceCache) glbResourceCache.consume(cacheKey);
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
  // Arbitrary custom vertex programs do not automatically apply the palette.
  // Only certified, paired graph programs pass the checks below; all other
  // combinations fail instead of silently drawing the bind pose.
  if (wholeModelFactory || customSlotPlan) {
    if (parentSignal?.aborted) throw parentSignal.reason ?? actorLoadCancelled();
    textureAbort = new AbortController();
    parentSignal?.addEventListener("abort", forwardTextureAbort, { once: true });
    if (parentSignal?.aborted) {
      forwardTextureAbort();
      throw parentSignal.reason ?? actorLoadCancelled();
    }
    acceptingTextureWork = true;
    try {
      const context = {
        request: customTextureRequest,
        signal: textureAbort.signal,
        ...(customTextureMaxDimension !== undefined ? { maxDimension: customTextureMaxDimension } : {}),
        adoptTextureWork
      };
      if (wholeModelFactory) {
        customMaterial = wholeModelFactory({
          ...context,
          skinned: pipeline.resources.scene.collectRenderables().some(({ renderable }) => Boolean(renderable.skinning))
        });
      }
      for (const [name, entry] of customSlotPlan ?? []) {
        const material = entry.rule.factory({ ...context, skinned: entry.skinned.size > 0 });
        if (!material || material.disposed || ownedScopedMaterials.has(material) || [...pipeline.resources.materialLibrary.values()].includes(material)) {
          throw unsupportedCustomModelMaterial(`custom slot '${name}' must return a live, actor-owned material`);
        }
        ownedScopedMaterials.add(material);
        scopedMaterials.set(name, material);
        // Never accept and ignore an authored map: it must be sampled through a
        // declared uniform or explicitly replaced.
        const declared = declaredTextureUniforms(material);
        const missing = [...entry.authoredMaps.keys()].filter((uniform) => !declared.has(uniform));
        if (missing.length > 0 && !entry.rule.replaceTextures) {
          throw unsupportedCustomModelMaterial(`custom slot '${name}' does not declare texture2d uniform(s) ${missing.map((uniform) => uniform.slice(2)).join(", ")} for its authored maps; declare them, or replace them with materialOverrides: [{ target, material, replaceTextures: true }]`);
        }
        // Bind authored maps only into declarations the caller left empty.
        const userBound = (uniform: string): boolean =>
          Boolean((material.getParameter(uniform) as { readonly texture?: unknown } | undefined)?.texture);
        const autoBound = [...entry.authoredMaps].filter(([uniform]) => declared.has(uniform) && !userBound(uniform));
        const unbindable = autoBound.filter(([, bindable]) => !bindable).map(([uniform]) => uniform.slice(2));
        if (unbindable.length > 0) {
          throw unsupportedCustomModelMaterial(`custom slot '${name}' declares ${unbindable.join(", ")}, whose authored map needs a second UV set or texture transform the binding cannot carry`);
        }
        if (autoBound.length > 0) authoredSlotBindings.set(material, autoBound.map(([uniform]) => uniform));
        if (entry.hasInstanceColors || entry.rule.requiresInstanceColors) assertCustomInstanceColors(material);
      }
    } finally {
      acceptingTextureWork = false;
    }
    if (customMaterial) validateSkinnedSourceItems(customMaterial);
    validateScopedSkins();
    // Abort peers on a failure, but wait for their late I/O and cleanup before
    // publishing an actor or treating the failed acquisition as settled.
    let readinessFailed = false;
    let readinessFailure: unknown;
    const allReady = Promise.allSettled([...customTextureWork].map((work) => work.ready.catch((error: unknown) => {
      if (!readinessFailed) { readinessFailed = true; readinessFailure = error; }
      try { releaseCustomTextureWork(); } catch { /* Retained for the outer cleanup path. */ }
      throw error;
    })));
    const outcome = await Promise.race([
      allReady.then((results) => ({ kind: "ready" as const, results })),
      textureCleanupFailureSignal.then(() => ({ kind: "cleanup-failed" as const }))
    ]);
    // A failed disposer may deliberately leave `ready` unsettled to signal
    // uncertain retirement. Report that failure rather than hanging forever.
    if (outcome.kind === "cleanup-failed") {
      if (readinessFailed) throw readinessFailure;
      if (parentSignal?.aborted) throw parentSignal.reason ?? actorLoadCancelled();
      throw textureCleanupFailure;
    }
    const results = outcome.results;
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) throw failure.reason;
    if (isActorAnimationContextDisposed(animationContext) || parentSignal?.aborted) {
      throw parentSignal?.aborted ? parentSignal.reason ?? actorLoadCancelled() : actorLoadCancelled();
    }
    if (customMaterial) validateSkinnedSourceItems(customMaterial);
    validateScopedSkins();
    if (customSlotPlan && options.materialVariant !== undefined) {
      const result = await pipeline.resources.setMaterialVariant(options.materialVariant);
      if (result !== "applied") throw unsupportedCustomModelMaterial(`unknown imported material variant '${options.materialVariant}'`);
      if (isActorAnimationContextDisposed(animationContext) || parentSignal?.aborted) {
        throw parentSignal?.aborted ? parentSignal.reason ?? actorLoadCancelled() : actorLoadCancelled();
      }
    }
  }
  const animationMaterialOptions = {
    // The native resource builder settles all initial image decodes before
    // returning. Registered adapters have no equivalent completion contract.
    textureLoadFailuresFinal: options.formatRegistry === undefined
  };
  const resolveImportedAnimationMaterial = createGLBActorAnimationMaterialResolver(pipeline.resources, pipeline.asset, animationMaterialOptions);
  const resolveReplacedAnimationMaterial = customMaterial || customSlotPlan
    ? createGLBActorAnimationMaterialResolver(pipeline.resources, pipeline.asset, { ...animationMaterialOptions, importedMaterialOverridden: true })
    : undefined;
  const animation = createGLTFSceneAnimationRuntime({
    scene: pipeline.resources.scene,
    clips: pipeline.asset.animations,
    asset: pipeline.asset,
    resolveAnimationMaterial: (name) => customMaterial || customSlotPlan?.has(name)
      ? resolveReplacedAnimationMaterial?.(name)
      : resolveImportedAnimationMaterial(name)
  });
  animationForCleanup = animation;
  const initializeCustomSkinning = (): void => {
    const count = customMaterial ? validateSkinnedSourceItems(customMaterial).length : validateScopedSkins();
    if (count > 0) {
      const result = animation.applyPose({ bones: {} }, "model-bind-pose");
      const bindingCount = animation.snapshot().skinningBindingCount;
      if ((customMaterial ? bindingCount !== count || result.skinningPalettesUpdated !== count
        : bindingCount < count || result.skinningPalettesUpdated < count) || result.missingTargets.length > 0) {
        throw unsupportedCustomModelMaterial("the imported skin cannot initialize every live joint palette");
      }
    }
  };
  initializeCustomSkinning();

  // P2-1: authored snapshot taken immediately post-load; every override application restores from
  // it first, so overrides are idempotent and never accumulate.
  const authoredByMaterial = new WeakMap<Material, Readonly<Record<string, unknown>>>();
  const captureAuthoredMaterials = (): AuthoredMaterialSnapshot => {
    const materials = [...pipeline.resources.materialLibrary.values()];
    const current = snapshotMaterials(materials);
    const snapshot = new Map<string, Readonly<Record<string, unknown>>>();
    materials.forEach((material, index) => {
      const key = `${material.name ?? ""}#${index}`;
      const authored = authoredByMaterial.get(material) ?? current.get(key)!;
      authoredByMaterial.set(material, authored);
      snapshot.set(key, authored);
    });
    return snapshot;
  };
  let materialSnapshot: AuthoredMaterialSnapshot = captureAuthoredMaterials();
  let activeMaterialOverrides: readonly TypedGLBActorMaterialOverride[] = [];
  let actorDisposed = false;
  let actorPublished = false;
  const setMaterialOverrides = (overrides: readonly TypedGLBActorMaterialOverride[]): void => {
    if (customMaterial && overrides.length > 0) {
      const error = new Error("MODEL_CUSTOM_MATERIAL_UNSUPPORTED: PBR overrides cannot be applied to a custom shader");
      Object.assign(error, { code: "MODEL_CUSTOM_MATERIAL_UNSUPPORTED" });
      throw error;
    }
    for (const name of customSlotPlan?.keys() ?? []) {
      if (overrides.some((override) => !override.target || override.target(name))) {
        throw unsupportedCustomModelMaterial(`PBR overrides overlap custom slot '${name}'`);
      }
    }
    activeMaterialOverrides = overrides;
    applyMaterialOverrides(materialSnapshot, pipeline.resources.materialLibrary.values(), overrides);
  };
  const setTint = (tint: TypedGLBActorTintOptions): void => {
    if (customMaterial || customSlotPlan) {
      const error = new Error("MODEL_CUSTOM_MATERIAL_UNSUPPORTED: tint cannot be applied to a custom shader");
      Object.assign(error, { code: "MODEL_CUSTOM_MATERIAL_UNSUPPORTED" });
      throw error;
    }
    if (initialFlags.on("A3D_QR_MATERIALS")) {
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
  const setMaterialVariant = (name: string | null): Promise<"applied" | "variant-unknown"> => {
    const selection: Promise<"applied" | "variant-unknown"> = customMaterial
      ? name === null
        ? Promise.resolve("applied")
        : pipeline.resources.renderableBindings.some((binding) => binding.materialVariants.some((variant) => variant.variant === name))
          ? Promise.reject(unsupportedCustomModelMaterial("an imported material variant cannot be visible under a whole-model custom replacement"))
          : Promise.resolve("variant-unknown")
      : pipeline.resources.setMaterialVariant(name);
    const pending = selection.then((result) => {
      if (actorDisposed) throw actorLoadCancelled();
      if (result === "variant-unknown") {
        if (!materialVariantIssues.includes(`variant-unknown:${name ?? ""}`)) {
          materialVariantIssues.push(`variant-unknown:${name ?? ""}`);
        }
        return result;
      }
      // Deduplicated keys may refer to the same material; its snapshot must
      // remain the original values even when a new alias is added later.
      materialSnapshot = captureAuthoredMaterials();
      if (activeMaterialOverrides.length > 0) {
        applyMaterialOverrides(materialSnapshot, pipeline.resources.materialLibrary.values(), activeMaterialOverrides);
      }
      return result;
    });
    // The public material handle is currently synchronous and can discard this
    // promise. Still expose rejection to actor callers and report real errors.
    void pending.catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError"
        && (actorDisposed || error.message === "glTF material variant selection was superseded")) return;
      if (actorDisposed) {
        console.error("Material variant selection failed after actor disposal", error);
        return;
      }
      const reason = error instanceof Error ? error.message : String(error);
      materialVariantIssues.push(`variant-error:${reason}`);
    });
    return pending;
  };
  if (typedOverrides.length > 0) setMaterialOverrides(typedOverrides);
  if (options.tint) setTint(options.tint);
  const staticConsolidation = options.consolidateStaticMeshes
    ? createTypedGLBActorStaticConsolidation(pipeline, options.id)
    : undefined;
  // GU47 E-H: the evidence reports whichever driver applied last (playClip or the mixer).
  let mixerDriven = false;
  let lastMixerApply: GLTFSceneAnimationApplyResult | null = null;
  // GU47 E-H: named-part handles (one per name) and the model matrix of the last drawn frame.
  const parts = new Map<string, AuraRuntimeNodeHandle>();
  let lastModelMatrix: Mat4 | undefined;
  let lastLodCamera: LodCamera | undefined;
  let reuseLodSelection = false;

  // Capture the extension list for this actor so its load, frame and disposal
  // see the same lifecycle. Explicit LOD opts this actor into the LOD extension
  // even if the legacy process-wide quality flag is off.
  const extensionFlags = options.lod === undefined ? initialFlags : {
    values: { ...initialFlags.values, A3D_QR_ASSETS_LOD: true },
    on: (name: Parameters<typeof initialFlags.on>[0]) => name === "A3D_QR_ASSETS_LOD" || initialFlags.on(name)
  };
  const actorExtensions = typedGLBActorExtensions(extensionFlags);
  const initializedActorExtensions: Array<(typeof actorExtensions)[number]> = [];

  const actor: TypedGLBActor = {
    kind: "aura-typed-glb-actor",
    id: options.id,
    name: options.name ?? options.id,
    asset: options.asset,
    pipeline,
    get lodCamera() { return lastLodCamera; },
    get reuseLodSelection() { return reuseLodSelection; },
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
      return createTypedGLBActorEvidence(actor, mixerDriven ? lastMixerApply : animationTrack.lastApply, animationTrack.lastMorphApply);
    },
    playClip(name, time) {
      mixerDriven = false;
      return animationTrack.playClip(name, time);
    },
    crossFadeTo(clip, seconds, fadeOptions = {}) {
      const action = animation.mixer().crossFadeTo(clip, Math.max(0, seconds), {
        ...(fadeOptions.warp !== undefined ? { warp: fadeOptions.warp } : {}),
        ...(fadeOptions.transition !== undefined ? { transition: fadeOptions.transition } : {})
      });
      if (fadeOptions.speed !== undefined) action.setEffectiveTimeScale(finiteRate(fadeOptions.speed));
      if (fadeOptions.loop === false) {
        action.setLoop("once", 1);
        action.clampWhenFinished = true;
      }
      return actor;
    },
    playLayer(layer, clip, layerOptions = {}) {
      const mixer = animation.mixer();
      const maskSkeleton = layerOptions.mask !== undefined ? boneMaskSkeletonFor(animation) : undefined;
      const mask = layerOptions.mask !== undefined && maskSkeleton !== undefined
        ? createBoneMask(toPoseBoneMaskSpec(layerOptions.mask), maskSkeleton)
        : undefined;
      const additive = layerOptions.blendMode === "additive";
      const fadeIn = layerOptions.fadeIn !== undefined && layerOptions.fadeIn > 0 ? layerOptions.fadeIn : 0;
      const action = mixer.playLayer(layer, additive ? animation.ensureAdditiveClip(clip) : clip, {
        ...(layerOptions.weight !== undefined ? { weight: layerOptions.weight } : {}),
        ...(layerOptions.blendMode !== undefined ? { blendMode: layerOptions.blendMode } : {}),
        additive,
        ...(mask !== undefined ? { mask } : {}),
        ...(layerOptions.speed !== undefined ? { timeScale: finiteRate(layerOptions.speed) } : {}),
        ...(fadeIn > 0 ? { fadeOutPrevious: fadeIn } : {})
      });
      if (fadeIn > 0) action.fadeIn(fadeIn);
      return actor;
    },
    stopLayer(layer, fadeOut = 0) {
      animation.mixer().stopLayer(layer, Math.max(0, fadeOut));
      return actor;
    },
    advance(dt) {
      mixerDriven = true;
      lastMixerApply = animation.applyPoseMixer(Number.isFinite(dt) ? Math.max(0, dt) : 0, { label: options.id });
      return lastMixerApply;
    },
    part(name) {
      const cached = parts.get(name);
      if (cached !== undefined) return cached;
      // Merged static buffers have no per-node transform left to drive.
      if (staticConsolidation !== undefined) return undefined;
      let found: SceneNode | undefined;
      pipeline.resources.scene.traverse((node) => {
        if (found === undefined && node.name === name) found = node;
      });
      if (found === undefined) return undefined;
      const handle = createGlbPartHandle(pipeline, found, `${options.id}/${name}`, () => lastModelMatrix);
      parts.set(name, handle);
      return handle;
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
    applyMorphTargets(weights, options) {
      return animationTrack.applyMorphTargets(weights, options);
    },
    collectRenderItems(transformOptions = {}) {
      if (transformOptions.lodCamera !== undefined) lastLodCamera = transformOptions.lodCamera;
      reuseLodSelection = transformOptions.reuseLodSelection === true;
      // Kept by reference (no per-frame copy); read only by part world getters.
      if (!reuseLodSelection && transformOptions.modelMatrix !== undefined && transformOptions.modelMatrix.length === 16) {
        lastModelMatrix = transformOptions.modelMatrix as Mat4;
      }
      let items = collectTypedGLBActorRenderItems(actor, transformOptions);
      const sourceNames = new Map<Material, Set<string>>();
      if (customSlotPlan) {
        for (const [key, material] of pipeline.resources.materialLibrary) {
          const names = sourceNames.get(material) ?? new Set<string>();
          names.add(parseGLTFRuntimeMaterialKey(key).material);
          sourceNames.set(material, names);
        }
      }
      const scopedName = (item: RenderItem): string | undefined => {
        const candidate = item.material;
        if (!candidate) return undefined;
        const base = "baseMaterial" in candidate ? candidate.baseMaterial : candidate;
        const names = sourceNames.get(base);
        if (!names) return undefined;
        const selected = [...names].filter((name) => customSlotPlan?.has(name));
        if (selected.length === 0) return undefined;
        if (names.size !== 1 || "baseMaterial" in candidate) {
          throw unsupportedCustomModelMaterial("a custom slot aliases another source material or material instance");
        }
        return selected[0];
      };
      const selectedKeys = new Map<NonNullable<RenderItem["temporalObjectKey"]>, { readonly name: string; readonly skinned: boolean }>();
      if (customSlotPlan) for (const item of items) {
        const name = scopedName(item);
        if (name && item.temporalObjectKey) selectedKeys.set(item.temporalObjectKey, { name, skinned: Boolean(item.skinning) });
      }
      const skinnedKeys = customMaterial
        ? new Set(items.flatMap((item) => item.skinning && item.temporalObjectKey ? [item.temporalObjectKey] : []))
        : undefined;
      for (const extension of actorExtensions) {
        items = extension.collectRenderItems?.(actor, items) ?? items;
      }
      if (customMaterial) {
        verifySkinnedSourceItems();
        if (items.some((item) => !item.skinning && item.temporalObjectKey && skinnedKeys?.has(item.temporalObjectKey))) {
          throw unsupportedCustomModelMaterial("an actor extension removed an imported skin palette");
        }
        assertSkinnedCustomPrograms(customMaterial, items);
        if (customMaterial instanceof PortableShaderMaterial) syncCustomTextureRefs(customMaterial);
      }
      if (customMaterial) return items.map((item) => ({ ...item, material: customMaterial }));
      if (!customSlotPlan) return items;
      validateScopedSkins();
      for (const material of ownedScopedMaterials) {
        if (material instanceof PortableShaderMaterial) syncCustomTextureRefs(material);
      }
      return items.map((item) => {
        const name = scopedName(item);
        const original = item.temporalObjectKey ? selectedKeys.get(item.temporalObjectKey) : undefined;
        if (original && (name !== original.name || (original.skinned && !item.skinning))) {
          throw unsupportedCustomModelMaterial("an actor extension changed a custom slot or removed its skin palette");
        }
        if (!name) return item;
        const material = scopedMaterials.get(name);
        if (!material || material.disposed) throw unsupportedCustomModelMaterial(`custom slot '${name}' is unavailable`);
        bindAuthoredSlotTextures(material, item.material, authoredSlotBindings.get(material));
        assertSkinnedCustomPrograms(material, [item]);
        if (item.instanceColors?.length) assertCustomInstanceColors(material);
        return { ...item, material };
      });
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
    hasCustomMaterialOverride(name) {
      return customMaterial !== undefined || (name === undefined ? (customSlotPlan?.size ?? 0) > 0 : customSlotPlan?.has(name) === true);
    },
    setMaterialVariant,
    inspectMaterials() {
      const infos: AuraResolvedMaterialInfo[] = [];
      for (const [key, material] of [...pipeline.resources.materialLibrary, ...scopedMaterials]) {
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
            ...[...customTextureWork].flatMap((work) => work.warnings.map(sanitizeDiagnosticText)),
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
      // Idempotent: a second call must not dispose resources the GLB resource cache now keeps.
      if (actorDisposed) return;
      actorDisposed = true;
      actorTemporalKeys.delete(actor);
      const failures: unknown[] = [];
      const cleanup = (work: () => void): void => { try { work(); } catch (error) { failures.push(error); } };
      for (const extension of initializedActorExtensions) {
        cleanup(() => extension.dispose?.(actor));
      }
      cleanup(() => animation.dispose());
      cleanup(releaseCustomTextureWork);
      cleanup(() => customMaterial?.dispose());
      for (const material of ownedScopedMaterials) cleanup(() => material.dispose());
      for (const item of staticConsolidation?.renderItems ?? []) {
        if (staticConsolidation?.ownedGeometries.has(item.geometry)) cleanup(() => item.geometry.dispose());
      }
      parts.clear();
      cleanup(() => clearTypedGLBActorQrFlags(actor));
      const actors = actorRegistry(animationContext);
      if (actors.get(actor.id) === actor) actors.delete(actor.id);
      // GU47 E-H: GLB resource cache. Render resources and textures are freed now as before; only
      // the parse lease (held by the pipeline) is handed to the cache, so the next scene that mounts
      // this asset loads it without a fetch. One kept lease per asset is enough.
      // A failed or reentrantly disposed startup has no successful mount to
      // bridge. Keeping its parse lease would pin stale data across a retry.
      if (actorPublished && failures.length === 0 && useResourceCache && glbResourceCache.enabled && glbResourceCache.peek(cacheKey) === undefined) {
        cleanup(() => pipeline.resources.dispose());
        cleanup(() => textureShare?.release());
        const compression = pipeline.asset.loaderDiagnostics.compression;
        const kept = failures.length === 0 && glbResourceCache.keep(cacheKey, {
          bytes: estimateGlbResourceBytes(options.asset.sizeBytes, pipeline.asset.loaderDiagnostics),
          uncompressed: !compression.draco && !compression.meshopt && !compression.ktx2Basis,
          // Re-disposing the resources inside is a no-op; this releases the parse lease.
          dispose: () => pipeline.dispose()
        });
        if (!kept) cleanup(() => disposePipeline(pipeline, options.runtimeOwner, false));
        if (failures.length) throw new AggregateError(failures, "Model actor cleanup failed");
        return;
      }
      cleanup(() => disposePipeline(pipeline, options.runtimeOwner, !useResourceCache));
      cleanup(() => textureShare?.release());
      if (failures.length) throw new AggregateError(failures, "Model actor cleanup failed");
    }
  };

  actorForCleanup = actor;
  const animationTrack = createTypedGLBActorAnimationTrack(animation, actor);
  bindActorAnimationContext(actor, animationContext);
  setTypedGLBActorQrFlags(initialFlags, actor);
  if (isActorAnimationContextDisposed(animationContext) || parentSignal?.aborted) {
    throw parentSignal?.aborted ? parentSignal.reason ?? actorLoadCancelled() : actorLoadCancelled();
  }
  for (const extension of actorExtensions) {
    initializedActorExtensions.push(extension);
    extension.onLoad?.(actor, pipeline);
    if (actorDisposed || isActorAnimationContextDisposed(animationContext) || parentSignal?.aborted) {
      throw parentSignal?.aborted ? parentSignal.reason ?? actorLoadCancelled() : actorLoadCancelled();
    }
  }
  const lod = getTypedGLBActorLod(actor);
  if (lod && options.lod === false) lod.setLevel(0);
  else if (lod && options.lod !== undefined) lod.setMode("auto", typeof options.lod === "object" ? options.lod : {});
  if (actorDisposed || isActorAnimationContextDisposed(animationContext) || parentSignal?.aborted) {
    throw parentSignal?.aborted ? parentSignal.reason ?? actorLoadCancelled() : actorLoadCancelled();
  }
  initializeCustomSkinning();
  // Only the loader can attribute a channel to the required extension, and
  // target names are not track identities. Validate each original track after
  // extension initialization, but before publishing/caching the actor. Pending
  // and indeterminate bindings retain the pre-existing lazy-resource behavior.
  for (const clip of pipeline.asset.animations) {
    for (const track of clip.tracks) {
      const source = pipeline.asset.animationPointerForTrack?.(track);
      if (!source?.required) continue;
      const binding = animation.inspectTrackBinding(track);
      if (binding.status !== "unavailable") continue;
      const error = new Error(
        `Required KHR_animation_pointer binding unavailable for animation ${source.animationIndex} channel ${source.channelIndex} (${source.pointer}): ${binding.reason ?? "unavailable"}`
      );
      Object.assign(error, {
        code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
        animationIndex: source.animationIndex,
        channelIndex: source.channelIndex,
        pointer: source.pointer,
        target: binding.target,
        reason: binding.reason
      });
      throw error;
    }
  }
  actorRegistry(animationContext).set(actor.id, actor);
  actorPublished = true;
  return actor;
  } catch (error) {
    const failures: unknown[] = [];
    const cleanup = (work: () => void): void => { try { work(); } catch (failure) { failures.push(failure); } };
    if (actorForCleanup) {
      cleanup(() => actorForCleanup!.dispose());
    } else {
      cleanup(() => animationForCleanup?.dispose());
      cleanup(releaseCustomTextureWork);
      cleanup(() => customMaterial?.dispose());
      for (const material of ownedScopedMaterials) cleanup(() => material.dispose());
      cleanup(() => disposePipeline(pipeline, options.runtimeOwner, !useResourceCache));
      cleanup(() => textureShare?.release());
    }
    // A factory can throw after handing us in-flight work. Cancellation must
    // close its late result as well, not merely detach its rejection handler.
    if (failures.length === 0) await Promise.allSettled([...customTextureWork].map((work) => work.ready));
    if (failures.length) throw new AggregateError([error, ...failures], "Model actor creation and cleanup failed");
    throw error;
  }
}

/* ------------------------------------------------- GU47 E-H: named GLB parts */

function actorLoadCancelled(): Error {
  const error = new Error("Actor load cancelled because its runtime was disposed");
  error.name = "AbortError";
  return error;
}

/** Live actors are keyed by runtime context as well as model-node id. */
const liveTypedGLBActors = new WeakMap<ActorAnimationContext, Map<string, TypedGLBActor>>();

function actorRegistry(context: ActorAnimationContext): Map<string, TypedGLBActor> {
  let actors = liveTypedGLBActors.get(context);
  if (!actors) {
    actors = new Map();
    liveTypedGLBActors.set(context, actors);
  }
  return actors;
}

/** The live actor created under `id`, if any (GU47 E-H; `handle.part` resolution). */
export function liveTypedGLBActor(id: string, owner?: object): TypedGLBActor | undefined {
  return liveTypedGLBActors.get(actorAnimationContextFor(owner))?.get(id);
}

/**
 * GU47 E-H — local mirror of lane E-B's `AuraRuntimeNodeHandle.part?(name)` declaration
 * (`agent-api/nodes/types/runtime.ts`) until the lanes merge: model handles carry `part`.
 */
export type AuraRuntimeNodeHandleParts = { part?(name: string): AuraRuntimeNodeHandle | undefined };

declare module "../contracts/runtimeNodes" {
  interface AuraNodeHandleExtensionMap {
    /** GU47 E-H — named GLB sub-node handle (model nodes; `undefined` until the GLB loads). */
    part: (name: string) => AuraRuntimeNodeHandle | undefined;
  }
}

// C-37 handle member `part` on model nodes. Resolves the actor per call, so a
// handle read before the GLB loaded starts answering once it has.
registerNodeHandleExtension({
  id: "gu47.glb-part",
  owner: "prd05",
  flag: "A3D_QR_COMPILER",
  member: "part",
  appliesTo: ["model"],
  create: (handle, app) => (name: string) => liveTypedGLBActor(handle.id, app)?.part?.(name)
});

/**
 * A runtime handle over one GLB scene node. Reuses the registry's handle factory over a
 * proxy spec whose transform fields read and write the node's local TRS, so every handle
 * member keeps its usual semantics (version bumps, snapshot, layers, userData). Members
 * that need a model or primitive (materials, instances, clips, morphs) only record on the
 * proxy and draw nothing; `traverse` visits the part itself.
 */
function createGlbPartHandle(
  pipeline: ProductionGLTFRenderPipeline,
  node: SceneNode,
  id: string,
  modelMatrix: () => Mat4 | undefined
): AuraRuntimeNodeHandle {
  const transform = node.transform;
  const spec = {
    kind: "group",
    name: node.name,
    children: [],
    get position(): AuraVec3 {
      return [transform.position[0], transform.position[1], transform.position[2]];
    },
    set position(next: AuraVec3) {
      transform.setPosition(next[0], next[1], next[2]);
    },
    get rotation(): AuraVec3 {
      const euler = eulerXYZFromQuat(transform.rotation);
      return [euler[0], euler[1], euler[2]];
    },
    set rotation(next: AuraVec3) {
      const q = quatFromEulerXYZ(next[0], next[1], next[2]);
      transform.setRotation(q[0], q[1], q[2], q[3]);
    },
    get quaternion(): AuraQuat {
      return [transform.rotation[0], transform.rotation[1], transform.rotation[2], transform.rotation[3]];
    },
    set quaternion(next: AuraQuat) {
      transform.setRotation(next[0], next[1], next[2], next[3]);
    },
    get scale(): AuraVec3 {
      return [transform.scale[0], transform.scale[1], transform.scale[2]];
    },
    set scale(next: number | AuraVec3) {
      if (typeof next === "number") transform.setScale(next, next, next);
      else transform.setScale(next[0], next[1], next[2]);
    },
    get visible(): boolean {
      return node.visible;
    },
    set visible(next: boolean) {
      node.visible = next !== false;
    }
  };
  const handle = createRuntimeNodeHandle(spec as unknown as MutableAuraRuntimeSceneNode, { id });
  const world = () => {
    pipeline.resources.scene.updateWorldTransforms();
    const root = modelMatrix();
    return decomposeMat4(root ? multiplyMat4(root, transform.worldMatrix) : transform.worldMatrix);
  };
  return Object.assign(handle, {
    getWorldPosition: (): AuraVec3 => {
      const p = world().position;
      return [p[0], p[1], p[2]];
    },
    getWorldQuaternion: (): AuraQuat => {
      const q = world().rotation;
      return [q[0], q[1], q[2], q[3]];
    },
    getWorldScale: (): AuraVec3 => {
      const s = world().scale;
      return [s[0], s[1], s[2]];
    }
  });
}

const importedMorphDeltas = new WeakMap<NonNullable<RenderItem["morphTargets"]>, NonNullable<RenderItem["morphTargets"]>>();

/** The glTF loader represents an omitted morph channel by `[]`; the render
 * contract represents it by `undefined`. Preserve the original arrays for
 * present channels and normalize only those absent channels. */
function normalizeImportedMorphDeltas(targets: NonNullable<RenderItem["morphTargets"]>): NonNullable<RenderItem["morphTargets"]> {
  if (!targets.some((target) => target.positions?.length === 0 || target.normals?.length === 0 || target.tangents?.length === 0)) return targets;
  let normalized = importedMorphDeltas.get(targets);
  if (!normalized) {
    normalized = targets.map((target) => ({
      ...target,
      ...(target.positions?.length === 0 ? { positions: undefined } : {}),
      ...(target.normals?.length === 0 ? { normals: undefined } : {}),
      ...(target.tangents?.length === 0 ? { tangents: undefined } : {})
    }));
    importedMorphDeltas.set(targets, normalized);
  }
  return normalized;
}

export function collectTypedGLBActorRenderItems(actor: TypedGLBActor, options: TypedGLBActorTransformOptions = {}): RenderItem[] {
  const wrinkle = options.wrinkleStrength === undefined ? {} : { wrinkleStrength: options.wrinkleStrength };
  if (actor.staticRenderItems) {
    return actor.staticRenderItems.map((item) => ({
      ...item,
      ...wrinkle,
      temporalObjectKey: actorTemporalKey(actor, item, item, item.geometry),
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
      temporalObjectKey: actorTemporalKey(actor, node, renderable, geometry),
      ...wrinkle,
      modelMatrix: resolveTypedGLBActorModelMatrix(node.transform.worldMatrix, options.modelMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(renderable.instanceColors ? { instanceColors: renderable.instanceColors } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets: normalizeImportedMorphDeltas(morphTargets), morphWeights: renderable.morphWeights } : {})
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

/** GU47 E-H: a playback rate the mixer clock can take (a non-finite rate reads as 1). */
function finiteRate(rate: number): number {
  return Number.isFinite(rate) ? rate : 1;
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
