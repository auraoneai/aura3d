// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraModelNode, AuraPrimitiveNode, AuraRuntimeNodeHandle, AuraRuntimeNodeRegistry, AuraSceneNode, AuraSceneSnapshot, AuraTransformSpec, AuraVec3, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource } from "../nodes/types.js";
import type { AuraDegradation } from "../../contracts/compiler.js";
import { geometry } from "../nodes/geometry.js";
import { groups } from "../nodes/groups.js";
import { primitive } from "../nodes/primitives.js";
import { createCameraMatrices, createModelMatrix, shouldNormalizeModelNode } from "../sceneMath.js";
import { applyProductionActorFootPlanting, applyProductionActorMorphTargets, attachProductionActorEvidence, createProductionRuntimeMetadata, productionActorModelBounds, resolveProductionActorRuntimeState } from "./actors.js";
import type { AppTextureResidency } from "./textureResidency.js";
import { withAdvancedLightingOrigin } from "./advancedLightingBridge.js";
import { resolveCameraFrame } from "./camera.js";
import { resolveProductionCameraDepth } from "./cameraDepth.js";
import { createSceneLabelOcclusionTest, isHtmlCanvas } from "./labels.js";
import { createAssetProvenance, formatSkippedInlineModelWarning } from "../diagnostics.js";
import { isRenderableModelNode, productionRenderErrorMessage } from "./observations.js";
import { composeModelInstanceMatrices, getRootPerformanceQuality, getRootRenderSource, includeRootSourceMetadata, type RootRenderSourceBridge } from "../RootRuntimeSupport.js";
import { Renderer, resolveSdfTextFrameOpacity, resolveWrinkleMapStrength, warnOnInstancingFallback, type CameraLike, type CollectedLight, type EnvironmentLightingOptions, type ProductionRendererInput, type RenderItem, type RenderSource } from "@aura3d/rendering";
import { identityMat4 } from "@aura3d/scene/math";
import { applyProductionActorAnimation, applySpecRootMotionTransform } from "./animation.js";
import { resolveActorBoneAttachments } from "../app/actorAnimationHandle.js";
import { runtimeNodeEffectiveVisibility, runtimeNodeHandleForSceneNode, runtimeNodeLodAnchor, runtimeNodeParentedTransform, setRuntimeQueryRenderItems } from "../app/runtimeNodes.js";
import { createProductionRuntimeEnvironmentFog, prd07FogRuntimeState } from "./fog.js";
import { lodLevelVisible, lodMarkerOf } from "../lodMarkers.js";
import { createProductionRuntimePostprocess, type ProductionTemporalSceneIdentity } from "./postprocess.js";
import { isDirectRenderPath } from "../app/renderPath.js";
import { authoredPostContextFor } from "../postBridge.js";
import { assertPrimitivePivotSupported, createProductionInstanceColors, createProductionInstanceTransforms, createProductionInstanceTransformsFromMatrices, createProductionModelInstanceTransforms, resolveProductionPrimitiveRuntimeState, selectProductionPrimitiveResource } from "./primitives.js";
import { createProductionRuntimeShadowOptions } from "./shadows.js";
import { applyNodeMaterialExtras, setMaterialInstanceColorTarget } from "../../production-runtime/ModelMaterialOverrides.js";
import { camera } from "../nodes/camera.js";
import { instances } from "../nodes/instances.js";
import { material } from "../nodes/material.js";
import type { AuraStaticModelMatrixCache } from "../sceneGraph.js";
import { withPrd01ColorParsing } from "./color.js";
import { withCompileEvidence } from "./compileEvidence.js";
import { colorToLinearRgba } from "../colorUtils.js";
import { assertSdfTextMaterialSupported } from "../nodes/text3d.js";
import { getMaterialClipping, getSceneClipping } from "../nodes/scene.js";
import { createModelMatrixV2, parentTransformOf, sourceSceneNodeOf } from "./sceneGraph.js";
import { multiplyMat4Into } from "../sceneGraph.js";
import { assertValidPivot, hasNonzeroPivot } from "../pivotGuard.js";
import { isBuiltinGlyphResource, retainBuiltinGlyphResource } from "./BuiltinGlyphAtlas.js";

// Enumerable so compiled/background input spreads retain the exact bridge
// generation which supplied this frame, without adding a public string field.
const rootRenderSourceFrame = Symbol("root-render-source-frame");
export function rootRenderSourceForFrame(input: ProductionRendererInput): RootRenderSourceBridge | undefined {
  return (input as ProductionRendererInput & { readonly [rootRenderSourceFrame]?: RootRenderSourceBridge })[rootRenderSourceFrame];
}

interface BuiltinGlyphFrame {
  refs: number;
  ownerReleased: boolean;
  readonly releases: readonly (() => void)[];
}

// The source owner protects resources immediately as items are selected, not
// just after an asynchronous renderer consumer begins. Copies share the same
// owner so a retired/replaced entry remains usable by an already built frame.
const builtinGlyphFrames = new WeakMap<object, BuiltinGlyphFrame>();

function releaseBuiltinGlyphFrameRef(frame: BuiltinGlyphFrame): void {
  if (--frame.refs !== 0) return;
  const failures: unknown[] = [];
  for (const release of frame.releases) {
    try { release(); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "Built-in glyph frame cleanup failed");
}

export function inheritBuiltinGlyphFrame(source: object, copy: object): void {
  const frame = builtinGlyphFrames.get(source);
  if (frame) builtinGlyphFrames.set(copy, frame);
}

export function retainBuiltinGlyphFrame(source: object): () => void {
  const frame = builtinGlyphFrames.get(source);
  if (!frame || frame.refs === 0) return () => {};
  frame.refs += 1;
  let released = false;
  return () => { if (!released) { released = true; releaseBuiltinGlyphFrameRef(frame); } };
}

export function releaseBuiltinGlyphFrameOwner(source: object | undefined): void {
  const frame = source && builtinGlyphFrames.get(source);
  if (!frame || frame.ownerReleased) return;
  frame.ownerReleased = true;
  releaseBuiltinGlyphFrameRef(frame);
}

/*
 * PRD-01 §15 Phase-6 seam: under `A3D_QR_CORE`, createAuraApp installs the
 * Phase-1 fingerprinted model-matrix cache so static primitives skip the
 * per-frame createModelMatrix recompose+alloc; the per-frame instance
 * transform/color arrays are likewise retained per spec array. Flag-off
 * keeps the verbatim calls (C-01).
 */
interface RenderInputCache {
  readonly modelMatrix: AuraStaticModelMatrixCache | null;
  sceneNodes?: AuraSceneSnapshot["nodes"];
  lastFrameTime?: number;
  transforms: WeakMap<readonly AuraTransformSpec[], { fp: string; result: Float32Array }>;
  colors: WeakMap<readonly AuraColor[], { fp: string; count: number; result: Float32Array | undefined }>;
  denseOutput: WeakMap<AuraPrimitiveNode, { source: Float32Array; result: Float32Array }>;
  sizedNodes: WeakMap<AuraPrimitiveNode, AuraPrimitiveNode>;
}

function makeRenderInputCache(modelMatrix: AuraStaticModelMatrixCache | null): RenderInputCache {
  return { modelMatrix, transforms: new WeakMap(), colors: new WeakMap(), denseOutput: new WeakMap(), sizedNodes: new WeakMap() };
}

const ownerCaches = new WeakMap<object, RenderInputCache>();
// Entries are mounted-object lifetimes; geometry identity distinguishes LODs
// and replacement resources without relying on mutable labels or array order.
const primitiveTemporalKeys = new WeakMap<ProductionRuntimePrimitiveEntry, WeakMap<RenderItem["geometry"], object>>();
function primitiveTemporalKey(entry: ProductionRuntimePrimitiveEntry, geometry: RenderItem["geometry"]): object {
  let geometries = primitiveTemporalKeys.get(entry);
  if (!geometries) { geometries = new WeakMap(); primitiveTemporalKeys.set(entry, geometries); }
  let key = geometries.get(geometry);
  if (!key) { key = {}; geometries.set(geometry, key); }
  return key;
}
// App frames use their runtime owner; standalone frames use the canvas.
// Retain the prior handles so a removed actor cannot keep its last mesh alive.
const ownerQueryHandles = new WeakMap<object, Set<AuraRuntimeNodeHandle>>();
// Primitive geometry stores packed deltas; the renderer consumes vec3 tuples.
// The array identity is only an initial cache key: caller-owned channel arrays
// can also be edited in place, so their contents are compared before reuse.
const primitiveMorphTargets = new WeakMap<NonNullable<RenderItem["geometry"]["morphTargets"]>, NonNullable<RenderItem["morphTargets"]>>();
let legacyCache = makeRenderInputCache(null);

function clearOwnerQueryHandles(owner: object): void {
  for (const handle of ownerQueryHandles.get(owner) ?? []) setRuntimeQueryRenderItems(handle, []);
  ownerQueryHandles.delete(owner);
}

function packedMorphChannelMatches(packed: Float32Array | readonly number[] | undefined, tuples: readonly AuraVec3[] | undefined): boolean {
  if (packed === undefined) return tuples === undefined;
  if (!tuples || packed.length !== tuples.length * 3) return false;
  for (let index = 0; index < packed.length; index += 1) {
    if (!Object.is(packed[index], tuples[Math.floor(index / 3)]![index % 3])) return false;
  }
  return true;
}

function unpackMorphChannel(packed: Float32Array | readonly number[], channel: string): AuraVec3[] {
  const tuples: AuraVec3[] = [];
  for (let offset = 0; offset < packed.length; offset += 3) {
    const x = packed[offset]!, y = packed[offset + 1]!, z = packed[offset + 2]!;
    if (![x, y, z].every(Number.isFinite)) throw new RangeError(`Primitive morph ${channel} must contain finite deltas.`);
    tuples.push([x, y, z]);
  }
  return tuples;
}

function primitiveRenderMorphTargets(source: NonNullable<RenderItem["geometry"]["morphTargets"]>, vertexCount: number): NonNullable<RenderItem["morphTargets"]> {
  const expected = vertexCount * 3;
  for (const target of source) {
    if (target.positions == null) throw new RangeError("Primitive morph positions must contain one vec3 delta per vertex.");
    for (const [channel, packed] of [["positions", target.positions], ["normals", target.normals], ["tangents", target.tangents]] as const) {
      if (packed !== undefined && (packed === null || packed.length !== expected)) {
        throw new RangeError(`Primitive morph ${channel} must contain one vec3 delta per vertex.`);
      }
    }
  }
  const cached = primitiveMorphTargets.get(source);
  if (cached && source.length === cached.length && source.every((target, index) => {
    const previous = cached[index]!;
    return target.name === previous.name && packedMorphChannelMatches(target.positions, previous.positions)
      && packedMorphChannelMatches(target.normals, previous.normals)
      && packedMorphChannelMatches(target.tangents, previous.tangents);
  })) return cached;
  const converted = source.map((target) => ({
    ...(target.name === undefined ? {} : { name: target.name }),
    positions: unpackMorphChannel(target.positions, "positions"),
    ...(target.normals === undefined ? {} : { normals: unpackMorphChannel(target.normals, "normals") }),
    ...(target.tangents === undefined ? {} : { tangents: unpackMorphChannel(target.tangents, "tangents") })
  }));
  primitiveMorphTargets.set(source, converted);
  return converted;
}

/** Apply scene text color and visibility without feeding a previous fade back into the next frame. */
export function applySdfTextFrameAppearance(resource: ProductionRuntimePrimitiveResource, node: AuraPrimitiveNode, frameOpacity: number): void {
  if (!resource.sdfText || !resource.texturedMaterial) return;
  const textMaterial = node.lod?.levels.length ? resource.materialSpec : node.material;
  assertSdfTextMaterialSupported(textMaterial);
  const color = colorToLinearRgba(textMaterial?.color ?? "#ffffff");
  const authoredAlpha = Math.max(0, Math.min(1, color[3] * (textMaterial?.opacity ?? 1)));
  const opacity = frameOpacity * authoredAlpha;
  resource.sdfText.lastOpacity = opacity;
  resource.texturedMaterial.setParameter("u_baseColor", [color[0], color[1], color[2], opacity]);
}

/** Register an app/canvas-owned cache. The ownerless form serves standalone callers. */
export function setPrd01ModelMatrixCache(cache: AuraStaticModelMatrixCache | null): void;
export function setPrd01ModelMatrixCache(cache: AuraStaticModelMatrixCache | null, owner: object): () => void;
export function setPrd01ModelMatrixCache(cache: AuraStaticModelMatrixCache | null, owner?: object): (() => void) | void {
  const registration = makeRenderInputCache(cache);
  if (owner) {
    ownerCaches.set(owner, registration);
    return () => {
      if (ownerCaches.get(owner) !== registration) return;
      ownerCaches.delete(owner);
      clearOwnerQueryHandles(owner);
    };
  }
  legacyCache = registration;
}

/** Use exactly the matrix path that a frame for this owner will use. */
export function frameUsesLegacyModelMatrix(owner: object): boolean {
  return (ownerCaches.get(owner) ?? legacyCache).modelMatrix === null;
}

/** GU47 E-H: appended to the skinned-instancing fallback warning (skinned GLBs do not instance; the crowd kit does). */
export const SKINNED_CROWD_HINT = "Skinned GLBs do not instance: for skinned crowds use the crowd kit (loadCrowdPoses + createCrowd from @aura3d/engine, one draw per pose).";

/*
 * Instanced primitives: `createProductionInstanceTransforms` already folds the
 * node `size` into every instance matrix (T_i·R_i·S(scale_i ⊙ size)), and the
 * renderer draws `modelMatrix · instanceMatrix`. The node model matrix must
 * therefore carry the node TRS only — applying S(size) there too scaled every
 * instance translation by `size` (a 10,000-box field of 0.3-unit boxes
 * collapsed to a 0.3× central cluster) and shrank each box a second time.
 * three.js equivalent: mesh.matrixWorld · instanceMatrix · geometry(size).
 * The size-less node is memoized per node so the static matrix cache (keyed
 * on node identity) still hits.
 */
export function instancedPrimitiveModelNode(node: AuraPrimitiveNode, cache: RenderInputCache = legacyCache): AuraPrimitiveNode {
  if (!node.instances || node.size === undefined) return node;
  let sizeless = cache.sizedNodes.get(node);
  const { size: _size, ...rest } = node;
  if (sizeless === undefined) {
    sizeless = rest as AuraPrimitiveNode;
    cache.sizedNodes.set(node, sizeless);
  } else {
    // Runtime handles may replace or remove transform properties in place.
    // Keep the identity used by the matrix cache but refresh its contents.
    for (const key of Object.keys(sizeless)) delete (sizeless as unknown as Record<string, unknown>)[key];
    Object.assign(sizeless, rest);
  }
  return sizeless;
}

function instanceTransformFp(transforms: readonly AuraTransformSpec[], node: AuraPrimitiveNode): string {
  // Compare actual transform inputs instead of a lossy numeric hash, which
  // can collide after in-place changes. Exclude arbitrary userData.
  return JSON.stringify([node.primitive, node.size, transforms.map(({ position, rotation, scale, pivot, lookAt, rotationOrder, quaternion }) =>
    [position, rotation, scale, pivot, lookAt, rotationOrder, quaternion])]);
}

function instanceColorFp(colors: readonly AuraColor[]): string {
  return JSON.stringify(colors);
}

function prd01InstanceTransforms(transforms: readonly AuraTransformSpec[], node: AuraPrimitiveNode, cache: RenderInputCache): Float32Array {
  if (cache.modelMatrix === null) return createProductionInstanceTransforms(transforms, node);
  const fp = instanceTransformFp(transforms, node);
  const hit = cache.transforms.get(transforms);
  if (hit && hit.fp === fp) return hit.result;
  const result = createProductionInstanceTransforms(transforms, node);
  cache.transforms.set(transforms, { fp, result });
  return result;
}

type DenseInstanceNode = AuraPrimitiveNode & { readonly instanceMatrices?: Float32Array; readonly instanceRgba?: Float32Array };

function denseInstanceMatrices(node: AuraPrimitiveNode): Float32Array | undefined {
  return (node as DenseInstanceNode).instanceMatrices;
}

function prd01DenseInstanceTransforms(matrices: Float32Array, node: AuraPrimitiveNode, cache: RenderInputCache): Float32Array {
  const previous = cache.denseOutput.get(node);
  const out = createProductionInstanceTransformsFromMatrices(matrices, node, previous?.source === matrices ? previous.result : undefined);
  cache.denseOutput.set(node, { source: matrices, result: out });
  return out;
}

function prd01DenseInstanceColors(node: AuraPrimitiveNode, count: number, cache: RenderInputCache): Float32Array | undefined {
  const rgba = (node as DenseInstanceNode).instanceRgba;
  if (rgba !== undefined && rgba.length === count * 4) return rgba;
  const specColors = node.instanceColors;
  if (specColors === undefined) return undefined;
  const fp = instanceColorFp(specColors);
  const hit = cache.colors.get(specColors);
  if (hit && hit.count === count && hit.fp === fp) return hit.result;
  const result = createProductionInstanceColors(specColors.slice(0, count), count);
  cache.colors.set(specColors, { fp, count, result });
  return result;
}

function prd01InstanceColors(colors: readonly AuraColor[] | undefined, count: number, cache: RenderInputCache): Float32Array | undefined {
  if (colors === undefined || cache.modelMatrix === null) return createProductionInstanceColors(colors, count);
  const fp = instanceColorFp(colors);
  const hit = cache.colors.get(colors);
  if (hit && hit.fp === fp && hit.count === count) return hit.result;
  const result = createProductionInstanceColors(colors, count);
  cache.colors.set(colors, { fp, count, result });
  return result;
}

function prd01ModelInstanceTransforms(transforms: readonly AuraTransformSpec[], node: AuraModelNode, bounds: { readonly min: AuraVec3; readonly max: AuraVec3 }, time: number): Float32Array {
  // Model placement can change independently of instance-array identity.
  return createProductionModelInstanceTransforms(transforms, node, bounds, time);
}

type ParentedRenderTransform = NonNullable<ReturnType<typeof runtimeNodeParentedTransform>>;
type RenderableTransformNode = AuraModelNode | AuraPrimitiveNode;

/** Anonymous descendants use a private scene handle and do not gain a public id. */
function renderableRuntimeHandle(node: RenderableTransformNode, runtimeNodes: AuraRuntimeNodeRegistry | undefined): AuraRuntimeNodeHandle | undefined {
  return node.runtime?.id
    ? runtimeNodes?.get(node.runtime.id)
    : runtimeNodeHandleForSceneNode(runtimeNodes, sourceSceneNodeOf(node) ?? node);
}

/** Inspect every pivot before frame caches, animation, materials or resources change. */
export function assertFramePivotSupported(
  node: RenderableTransformNode,
  runtimeNodes: AuraRuntimeNodeRegistry | undefined,
  legacyMatrix: boolean,
  actor?: ProductionRuntimeActorEntry["actor"],
  options?: { readonly awaitingRuntimeParent?: boolean; readonly prospectiveParent?: AuraRuntimeNodeHandle }
): boolean {
  assertValidPivot(node.pivot);
  const staticParent = parentTransformOf(node);
  const handle = renderableRuntimeHandle(node, runtimeNodes);
  const live = handle?.snapshot() as { readonly pivot?: AuraVec3; readonly instances?: readonly AuraTransformSpec[] } | undefined;
  const parented = handle ? runtimeNodeParentedTransform(handle) : undefined;
  const prospectiveParent = options?.prospectiveParent;
  const prospectiveTransform = prospectiveParent ? runtimeNodeParentedTransform(prospectiveParent) : undefined;
  const prospectivePivot = prospectiveParent?.snapshot().pivot;
  assertValidPivot(prospectivePivot);
  const localPivot = parented ? parented.localNode.pivot : live?.pivot ?? node.pivot;
  assertValidPivot(localPivot);
  const transforms = live?.instances ?? node.instances;
  let pivoted = Boolean(parented?.hasPivot || staticParent?.hasPivot || prospectiveTransform?.hasPivot ||
    hasNonzeroPivot(prospectivePivot) || hasNonzeroPivot(localPivot));
  for (const transform of transforms ?? []) {
    assertValidPivot(transform.pivot);
    pivoted ||= hasNonzeroPivot(transform.pivot);
  }
  if (!pivoted) return false;
  // A node's own pivot composes with its own lookAt in the C-06 model matrix
  // (the pivot point stays fixed while -Z faces the target). The legacy matrix,
  // live parented look-at and pivoted instance batches have no such composition.
  if ((node.lookAt !== undefined && (legacyMatrix || transforms !== undefined)) || parented?.hasLookAt || prospectiveTransform?.hasLookAt ||
      transforms?.some((transform) => transform.lookAt !== undefined)) {
    throw new Error("PIVOT_UNSUPPORTED_LOOK_AT: legacy, live-parented or instanced pivoted render transforms cannot use lookAt.");
  }
  // A synchronous subtree transaction runs before its new runtime handles are
  // installed. Defer only checks that require those handles; acquisition and
  // every frame repeat the complete validation with the actual live parent.
  if (staticParent?.hasPivot && !parented && !options?.awaitingRuntimeParent && node.animation !== undefined) {
    throw new Error("PIVOT_UNSUPPORTED_NESTED_ANIMATION: pivoted static hierarchy animation requires a live parent transform.");
  }
  if (staticParent?.hasPivot && handle && !parented) {
    throw new Error("PIVOT_UNSUPPORTED_RUNTIME_HIERARCHY: pivoted descendants require a live parent transform.");
  }
  if (legacyMatrix && !parented && !staticParent && transforms === undefined && hasNonzeroPivot(localPivot) &&
      (node.quaternion !== undefined || (node.rotationOrder !== undefined && node.rotationOrder !== "ZYX"))) {
    throw new Error("PIVOT_UNSUPPORTED_LEGACY_ROTATION: pivoted legacy nodes require the default Euler rotation.");
  }
  if (node.kind === "primitive") {
    assertPrimitivePivotSupported({ ...node, pivot: localPivot, instances: transforms }, pivoted);
  } else {
    if ((node.lod !== undefined && node.lod !== false) || node.instanceLod || lodMarkerOf(node)) {
      throw new Error("PIVOT_UNSUPPORTED_LOD: pivoted models cannot use distance LOD.");
    }
    if (transforms?.length && actor?.pipeline?.asset?.skins?.length) {
      throw new Error("PIVOT_UNSUPPORTED_SKIN: pivoted skinned model instances cannot be drawn as instances.");
    }
  }
  return true;
}

/** Scope LOD hysteresis to this mounted scene and anchor it to the live group. */
function runtimeLodVisible(
  node: RenderableTransformNode,
  handle: AuraRuntimeNodeHandle | undefined,
  cameraPosition: AuraVec3,
  scope: object
): boolean {
  const marker = lodMarkerOf(node);
  const anchor = marker && handle ? runtimeNodeLodAnchor(handle, marker.root) : undefined;
  return lodLevelVisible(node, cameraPosition, { scope, ...(anchor ?? {}) });
}

/**
 * A mounted handle may expose a world-facing transform for compatibility.
 * Rendering needs its separately retained local transform so the live parent
 * matrix is applied only once. Non-transform state stays on the resolved node.
 */
function withParentedLocalTransform<T extends RenderableTransformNode>(node: T, parented: ParentedRenderTransform): T {
  const local = parented.localNode;
  return {
    ...node,
    position: local.position,
    rotation: local.rotation,
    quaternion: local.quaternion,
    rotationOrder: local.rotationOrder,
    scale: local.scale,
    pivot: local.pivot
  } as T;
}

/** Restore local fields from the retained source, not the flattened world TRS. */
function withStaticLocalTransform<T extends RenderableTransformNode>(node: T, source: AuraSceneNode): T {
  const local = source as AuraTransformSpec;
  return {
    ...node, position: local.position, rotation: local.rotation, quaternion: local.quaternion,
    rotationOrder: local.rotationOrder, scale: local.scale, pivot: local.pivot
  } as T;
}

/** Compose the source-local pivoted matrix with its parent exactly once. */
function parentedModelMatrix(
  node: RenderableTransformNode,
  bounds: { readonly min: AuraVec3; readonly max: AuraVec3 },
  normalize: boolean,
  time: number,
  parentWorld: Float32Array
): Float32Array {
  const local = createModelMatrixV2(node, bounds, normalize, time, new Float32Array(16));
  const world = new Float32Array(16);
  multiplyMat4Into(world, parentWorld, local);
  if (!world.every(Number.isFinite)) throw new RangeError("Parented render transform must contain only finite values.");
  return world;
}

/** Reused per node across frames while the instance count is stable (steady-state dense writes allocate nothing). */
const denseModelOutputs = new WeakMap<object, Float32Array>();

/**
 * I-07: dense counterpart of `createProductionModelInstanceTransforms`. A dense matrix is the instance's world T·R·S;
 * the model's normalization/centering ("base placement", the matrix of an identity-transform instance) is applied
 * inside it, so `instance = [parentWorld ·] dense · base`. Same contract as primitive dense writes, where the node size is folded in.
 */
export function denseModelInstanceTransforms(
  key: object,
  dense: Float32Array,
  node: AuraModelNode,
  bounds: { readonly min: AuraVec3; readonly max: AuraVec3 },
  time: number,
  parentWorld?: Float32Array
): Float32Array {
  assertValidPivot(node.pivot);
  const identityNode = { ...node, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, pivot: undefined, quaternion: undefined, lookAt: undefined, rotationOrder: undefined } as unknown as AuraModelNode;
  const base = createModelMatrix(identityNode, bounds, shouldNormalizeModelNode(node), time);
  const previous = denseModelOutputs.get(key);
  const out = previous !== undefined && previous.length === dense.length ? previous : new Float32Array(dense.length);
  denseModelOutputs.set(key, out);
  for (let o = 0; o < dense.length; o += 16) {
    for (let col = 0; col < 4; col += 1) {
      const b0 = base[col * 4]!, b1 = base[col * 4 + 1]!, b2 = base[col * 4 + 2]!, b3 = base[col * 4 + 3]!;
      for (let row = 0; row < 4; row += 1) {
        // (dense · base)[row, col] = sum_k dense[row, k] · base[k, col]; column-major index = col * 4 + row.
        out[o + col * 4 + row] = dense[o + row]! * b0 + dense[o + 4 + row]! * b1 + dense[o + 8 + row]! * b2 + dense[o + 12 + row]! * b3;
      }
    }
  }
  if (parentWorld !== undefined) {
    for (let o = 0; o < out.length; o += 16) {
      let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
      for (let col = 0; col < 4; col += 1) {
        const m0 = out[o + col * 4]!, m1 = out[o + col * 4 + 1]!, m2 = out[o + col * 4 + 2]!, m3 = out[o + col * 4 + 3]!;
        for (let row = 0; row < 4; row += 1) {
          const v = parentWorld[row]! * m0 + parentWorld[4 + row]! * m1 + parentWorld[8 + row]! * m2 + parentWorld[12 + row]! * m3;
          if (row === 0) c0 = v; else if (row === 1) c1 = v; else if (row === 2) c2 = v; else c3 = v;
        }
        out[o + col * 4] = c0; out[o + col * 4 + 1] = c1; out[o + col * 4 + 2] = c2; out[o + col * 4 + 3] = c3;
      }
    }
  }
  return out;
}

function parentedModelInstanceTransforms(
  transforms: readonly AuraTransformSpec[],
  localNode: AuraModelNode,
  bounds: { readonly min: AuraVec3; readonly max: AuraVec3 },
  time: number,
  parentWorld: Float32Array
): Float32Array {
  const output = new Float32Array(transforms.length * 16);
  for (let index = 0; index < transforms.length; index += 1) {
    const transform = transforms[index]!;
    const instance = {
      ...localNode,
      ...transform,
      // A per-instance Euler rotation overrides the node quaternion just as a
      // per-instance quaternion overrides the node's Euler rotation.
      ...(transform.rotation !== undefined && transform.quaternion === undefined ? { quaternion: undefined } : {})
    } as AuraModelNode;
    output.set(parentedModelMatrix(instance, bounds, shouldNormalizeModelNode(localNode), time, parentWorld), index * 16);
  }
  return output;
}

export function createProductionRuntimeRendererInput(
  snapshot: AuraSceneSnapshot,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  actorEntries: readonly ProductionRuntimeActorEntry[],
  primitiveEntries: readonly ProductionRuntimePrimitiveEntry[],
  time: number,
  runtimeNodes: AuraRuntimeNodeRegistry | undefined,
  runtimeWarnings: Set<string>,
  environmentLighting: EnvironmentLightingOptions,
  collectedLights: readonly CollectedLight[],
  // T4.1 (PRD-15): C-36 degrade handler for the flag-on path. Undefined under
  // flag-off keeps the legacy runtimeWarnings text byte-identical.
  degrade?: (d: Omit<AuraDegradation, "frame">) => void,
  textureResidency?: AppTextureResidency,
  temporalSceneIdentity?: ProductionTemporalSceneIdentity,
  runtimeOwner?: object
): ProductionRendererInput {
  // Standalone callers historically register against the canvas. Mounted apps
  // and workers instead use the same lifetime owner used for registration.
  const owner = runtimeOwner ?? canvas;
  return withPrd01ColorParsing(owner, () => withCompileEvidence(owner, () => createProductionRuntimeRendererInputOwned(
    owner, snapshot, canvas, actorEntries, primitiveEntries, time, runtimeNodes, runtimeWarnings, environmentLighting, collectedLights, degrade, textureResidency, temporalSceneIdentity
  )));
}

function createProductionRuntimeRendererInputOwned(
  owner: object,
  snapshot: AuraSceneSnapshot,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  actorEntries: readonly ProductionRuntimeActorEntry[],
  primitiveEntries: readonly ProductionRuntimePrimitiveEntry[],
  time: number,
  runtimeNodes: AuraRuntimeNodeRegistry | undefined,
  runtimeWarnings: Set<string>,
  environmentLighting: EnvironmentLightingOptions,
  collectedLights: readonly CollectedLight[],
  degrade?: (d: Omit<AuraDegradation, "frame">) => void,
  textureResidency?: AppTextureResidency,
  temporalSceneIdentity?: ProductionTemporalSceneIdentity
): ProductionRendererInput {
  const glyphReleases = new Map<ProductionRuntimePrimitiveResource, () => void>();
  try {
  // Validate before mutating frame caches or resolving runtime assets. The
  // compiled and legacy production paths both construct their input here.
  const { projectionMetadata, depthConvention } = resolveProductionCameraDepth(snapshot.camera);
  const cache = ownerCaches.get(owner) ?? legacyCache;
  for (const entry of actorEntries) assertFramePivotSupported(entry.node, runtimeNodes, cache.modelMatrix === null, entry.actor);
  for (const entry of primitiveEntries) assertFramePivotSupported(entry.node, runtimeNodes, cache.modelMatrix === null);
  // A replacement node array marks a new scene revision; no retained output
  // from the prior revision may be handed to the new one.
  if (cache.sceneNodes !== snapshot.nodes) {
    cache.sceneNodes = snapshot.nodes;
    cache.lastFrameTime = undefined;
    cache.transforms = new WeakMap();
    cache.colors = new WeakMap();
    cache.denseOutput = new WeakMap();
    cache.sizedNodes = new WeakMap();
  }
  const prd01ModelMatrixCache = cache.modelMatrix;
  // Root app extensions are bound only to an HTML canvas. A worker canvas
  // still retains its own identity for the compiler and postprocess stores.
  const htmlCanvas = isHtmlCanvas(canvas) ? canvas : undefined;
  const compatibility = htmlCanvas ? getRootRenderSource(htmlCanvas, owner) : undefined;
  const attachedItems: readonly RenderItem[] = compatibility ? [...(compatibility.source.collectRenderItems?.() ?? compatibility.source.renderItems ?? [])] : [];
  const items: RenderItem[] = [...attachedItems];
  const queryItems = new Map<AuraRuntimeNodeHandle, RenderItem[]>();
  const queryItemsFor = (node: AuraModelNode | AuraPrimitiveNode): RenderItem[] | undefined => {
    const runtimeId = node.runtime?.id;
    const handle = runtimeId ? runtimeNodes?.get(runtimeId) : undefined;
    if (!handle) return undefined;
    let submitted = queryItems.get(handle);
    if (!submitted) queryItems.set(handle, submitted = []);
    return submitted;
  };
  prd01ModelMatrixCache?.beginFrame();
  const cameraMatrices = createCameraMatrices(snapshot, canvas.width / Math.max(1, canvas.height), time, runtimeNodes);
  const viewProjectionMatrix = cameraMatrices.viewProjection;
  const cameraPosition = resolveCameraFrame(snapshot, snapshot.camera, time, runtimeNodes).eye;
  const lodCamera = { projectionMatrix: cameraMatrices.projection, viewMatrix: cameraMatrices.view, viewProjectionMatrix, position: cameraPosition };
  for (const node of groups.flatten(snapshot.nodes)) {
    if (isRenderableModelNode(node) && createAssetProvenance(node.asset).source === "inline-definition") {
      runtimeWarnings.add(formatSkippedInlineModelWarning(node));
    }
  }
  textureResidency?.beginFrame();
  for (const [actorIndex, entry] of actorEntries.entries()) {
    // Register before visibility/LOD/empty-instance checks: skipped entries
    // must publish an empty list instead of retaining the preceding frame.
    const actorQueryItems = queryItemsFor(entry.node);
    let currentState = resolveProductionActorRuntimeState(entry, runtimeNodes);
    let currentNode = currentState.node;
    const actorHandle = renderableRuntimeHandle(entry.node, runtimeNodes);
    let parentedActor = actorHandle ? runtimeNodeParentedTransform(actorHandle) : undefined;
    const staticActorParent = parentTransformOf(entry.node);
    let actorPivoted = assertFramePivotSupported(entry.node, runtimeNodes, cache.modelMatrix === null, entry.actor);
    // threejs-parity L7/SG-11: `groups.lod` — deselected levels skip this frame.
    if (currentNode.visible === false || (parentedActor && actorHandle && !runtimeNodeEffectiveVisibility(actorHandle)) || !runtimeLodVisible(currentNode, actorHandle, cameraPosition, runtimeNodes ?? canvas)) continue;
    if (currentNode.instances !== undefined && currentNode.instances.length === 0) {
      runtimeWarnings.add(`INSTANCES_EMPTY: instances.model "${currentNode.name ?? currentNode.asset.id}" has no instances this frame; nothing is drawn.`);
      continue;
    }
    const actorMatrix = (): number[] => {
      parentedActor = actorHandle ? runtimeNodeParentedTransform(actorHandle) : undefined;
      const actorBounds = productionActorModelBounds(currentNode.asset, entry.actor);
      const actorNormalize = shouldNormalizeModelNode(currentNode);
      if (parentedActor) {
        return [...parentedModelMatrix(withParentedLocalTransform(currentNode, parentedActor), actorBounds, actorNormalize, time, parentedActor.parentWorldMatrix)];
      }
      if (staticActorParent && actorPivoted) {
        return [...parentedModelMatrix(withStaticLocalTransform(currentNode, staticActorParent.source), actorBounds, actorNormalize, time, staticActorParent.parentWorldMatrix)];
      }
      if (currentNode.instances && actorPivoted) {
        return [...createModelMatrixV2(currentNode, actorBounds, actorNormalize, time, new Float32Array(16))];
      }
      return [...(prd01ModelMatrixCache?.modelMatrix(currentNode, actorBounds, actorNormalize, time) ?? createModelMatrix(currentNode, actorBounds, actorNormalize, time))];
    };
    let modelMatrix = actorMatrix();
    // T3.7 — spec-level root motion on a node without a runtime handle folds its
    // accumulated offset/yaw into the model matrix (no-op when unset).
    applySpecRootMotionTransform(entry, modelMatrix);
    // The foot-planting post-pass solves in the same world space this matrix draws into;
    // refresh its matrix before the clip plays so the solve uses this frame, not the last.
    applyProductionActorFootPlanting(entry, currentState.animationBinding, modelMatrix, runtimeWarnings, degrade);
    if (currentState.animationPose) {
      // Overlay poses evaluate the clip first and write their bones on top, so
      // omitted bones keep the clip's motion (route pose after clip evaluation
      // — the structural fix for poses being overwritten by later clip eval).
      const overlay = currentState.animationPose.mode === "overlay";
      if (overlay) {
        applyProductionActorAnimation(entry, currentNode, currentState.animationBinding, time, runtimeWarnings, modelMatrix, () => {
          currentState = resolveProductionActorRuntimeState(entry, runtimeNodes);
          currentNode = currentState.node;
          actorPivoted = assertFramePivotSupported(entry.node, runtimeNodes, cache.modelMatrix === null, entry.actor);
          modelMatrix = actorMatrix();
          applySpecRootMotionTransform(entry, modelMatrix);
          applyProductionActorFootPlanting(entry, currentState.animationBinding, modelMatrix, runtimeWarnings, degrade);
        }, runtimeNodes);
      }
      try {
        entry.actor.applyRetargetedPose(currentState.animationPose, currentState.animationPoseTime ?? time);
        if (!overlay) entry.rootMotionCursors = undefined;
      } catch (error) {
        if (degrade) degrade({ code: "pose-apply-failed", nodeId: entry.actor.id, message: `Typed GLB actor "${entry.actor.id}" failed to apply bound pose: ${productionRenderErrorMessage(error)}`, cause: error });
        else runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" failed to apply bound pose: ${productionRenderErrorMessage(error)}`);
      }
    } else applyProductionActorAnimation(entry, currentNode, currentState.animationBinding, time, runtimeWarnings, modelMatrix, () => {
      currentState = resolveProductionActorRuntimeState(entry, runtimeNodes);
      currentNode = currentState.node;
      actorPivoted = assertFramePivotSupported(entry.node, runtimeNodes, cache.modelMatrix === null, entry.actor);
      modelMatrix = actorMatrix();
      applySpecRootMotionTransform(entry, modelMatrix);
      applyProductionActorFootPlanting(entry, currentState.animationBinding, modelMatrix, runtimeWarnings, degrade);
    }, runtimeNodes);
    // Bone attachments resolve against the just-applied pose: current-frame
    // bone world matrices, before this or any later entry collects render items.
    resolveActorBoneAttachments(entry.actor.id, modelMatrix, runtimeNodes, entry.actor);
    applyProductionActorMorphTargets(entry, currentState.morphTargets, runtimeWarnings, degrade);
    // Wrinkle detail (E1 face-rig demo): resolve morph weights through the model's hook.
    // Absent hook (or empty weights) resolves to 0 = today's rendering exactly.
    const wrinkleStrength = currentNode.wrinkle
      ? resolveWrinkleMapStrength(currentState.morphTargets ?? {}, currentNode.wrinkle)
      : undefined;
    const actorItems = entry.actor.collectRenderItems({
      modelMatrix,
      lodCamera,
      ...(wrinkleStrength === undefined ? {} : { wrinkleStrength })
    });
    // P2 (muse3jsparity-PRD): model instances attach exactly like primitive
    // nodes. Skinned actors cannot instance (D1 matrix) — warn once and draw
    // single instead of silently dropping copies.
    const modelInstances = currentNode.instances;
    // I-07: dense matrices written by `handle.setInstanceMatrices` on an `instances.model` node.
    const denseModelMatrices = modelInstances && modelInstances.length > 0 ? currentState.denseInstanceMatrices : undefined;
    if (denseModelMatrices !== undefined && denseModelMatrices.length === 0) {
      runtimeWarnings.add(`INSTANCES_EMPTY: instances.model "${currentNode.name ?? currentNode.asset.id}" has no instances this frame; nothing is drawn.`);
      continue;
    }
    let modelInstanceAttach: { readonly instanceTransforms?: Float32Array; readonly instanceColors?: Float32Array } = {};
    if (modelInstances && modelInstances.length > 0) {
      if (actorItems.some((item) => item.skinning)) {
        warnOnInstancingFallback({
          material: currentNode.name ?? currentNode.asset.id,
          requestedInstances: modelInstances.length,
          drawnBatches: Math.max(1, actorItems.length),
          reason: "skinned-palette-overflow-cpu-fallback",
          // GU47 E-H handoff: point authors at the supported skinned-crowd path.
          onWarning: (message) => runtimeWarnings.add(`${message} ${SKINNED_CROWD_HINT}`)
        });
      } else {
        const instanceBounds = productionActorModelBounds(currentNode.asset, entry.actor);
        modelInstanceAttach = {
          instanceTransforms: denseModelMatrices
            ? denseModelInstanceTransforms(entry.node, denseModelMatrices, currentNode, instanceBounds, time,
                parentedActor ? parentedActor.parentWorldMatrix : staticActorParent && actorPivoted ? staticActorParent.parentWorldMatrix : undefined)
            : parentedActor
            ? parentedModelInstanceTransforms(modelInstances, withParentedLocalTransform(currentNode, parentedActor), instanceBounds, time, parentedActor.parentWorldMatrix)
            : staticActorParent && actorPivoted
              ? parentedModelInstanceTransforms(modelInstances, withStaticLocalTransform(currentNode, staticActorParent.source), instanceBounds, time, staticActorParent.parentWorldMatrix)
              : prd01ModelInstanceTransforms(modelInstances, currentNode, instanceBounds, time),
          ...(denseModelMatrices && currentState.denseInstanceRgba && currentState.denseInstanceRgba.length === (denseModelMatrices.length / 16) * 4
            ? { instanceColors: currentState.denseInstanceRgba }
            : currentNode.instanceColors && !denseModelMatrices
              ? { instanceColors: prd01InstanceColors(currentNode.instanceColors, modelInstances.length, cache) }
              : {})
        };
        // GU47 E-D: what the instance colours multiply (`instances.model({ instanceColorTarget })`).
        for (const item of actorItems) {
          const itemMaterial = item.material;
          if (itemMaterial) setMaterialInstanceColorTarget("baseMaterial" in itemMaterial ? itemMaterial.baseMaterial : itemMaterial, currentNode.instanceColorTarget);
        }
      }
    }
    if (currentNode.instancedModelWarning) runtimeWarnings.add(currentNode.instancedModelWarning);
    // A GLB mesh has its own authored local/world transform. Native instance
    // transforms must apply the complete normalized node placement BEFORE that
    // mesh transform, exactly like an individually mounted actor. The previous
    // base(actorRoot * mesh) * instance(actorRoot) order normalized twice and
    // rotated/scaled the instance translations in the mesh's coordinate system.
    const localActorItems = modelInstanceAttach.instanceTransforms
      ? entry.actor.collectRenderItems({ modelMatrix: identityMat4(), lodCamera, reuseLodSelection: true, ...(wrinkleStrength === undefined ? {} : { wrinkleStrength }) })
      : undefined;
    const actorClipping = getMaterialClipping(currentNode.material);
    // The live material rides on the runtime snapshot this frame already took.
    const bloomMaterial = currentState.runtimeMaterial ?? currentNode.material;
    const submittedActorItems = actorItems.map((item, itemIndex) => {
      const nativeMatrices = modelInstanceAttach.instanceTransforms;
      const localItem = localActorItems?.[itemIndex];
      if (nativeMatrices && !localItem) throw new Error("Instanced GLB mesh collection changed within one frame");
      return withAdvancedLightingOrigin({ ...item, label: `actor-${actorIndex}:mesh-${itemIndex}:${item.label ?? "mesh"}`, castShadow: currentNode.castShadow,
        receiveShadow: currentNode.receiveShadow,
        ...(actorClipping ? { materialClipping: actorClipping } : {}),
        ...(bloomMaterial?.bloom === undefined ? {} : { bloomWeight: bloomMaterial.bloom }),
        // threejs-parity L7/SG-09: spec parity fields (see primitive path below).
        renderOrder: currentNode.renderOrder, frustumCulled: modelInstances && actorPivoted ? false : currentNode.frustumCulled,
        layerMask: currentNode.layers, userData: currentNode.userData,
        ...modelInstanceAttach,
        ...(nativeMatrices && localItem ? {
          modelMatrix: identityMat4(),
          instanceTransforms: composeModelInstanceMatrices(nativeMatrices, localItem.modelMatrix ?? identityMat4())
        } : {}) }, currentNode);
    });
    textureResidency?.observeActor(entry.actor, submittedActorItems, cameraPosition);
    items.push(...submittedActorItems);
    actorQueryItems?.push(...submittedActorItems);
    // Evidence follows the exact submitted instances and model matrices.
    attachProductionActorEvidence(currentNode, entry.actor, submittedActorItems, runtimeNodes);
  }
  textureResidency?.endFrame();
  // G1 SDF occlusion test, built once per frame only when SDF quads exist
  // (same cost argument as WS-2.7: one bbox per node, negligible beside render).
  const sdfEntries = primitiveEntries.filter((entry) =>
    entry.resources.some((resource) => resource.sdfText !== null));
  const sdfOcclusionTest = sdfEntries.length > 0
    ? createSceneLabelOcclusionTest(snapshot, cameraPosition, runtimeNodes)
    : undefined;
  for (const [primitiveIndex, entry] of primitiveEntries.entries()) {
    const primitiveQueryItems = queryItemsFor(entry.node);
    const currentState = resolveProductionPrimitiveRuntimeState(entry, runtimeNodes);
    const primitiveHandle = renderableRuntimeHandle(entry.node, runtimeNodes);
    const parentedPrimitive = primitiveHandle ? runtimeNodeParentedTransform(primitiveHandle) : undefined;
    const staticPrimitiveParent = parentTransformOf(entry.node);
    const primitivePivoted = assertFramePivotSupported(entry.node, runtimeNodes, cache.modelMatrix === null);
    // threejs-parity L7/SG-11: `groups.lod` — deselected levels skip this frame.
    if (!currentState.visible || (parentedPrimitive && primitiveHandle && !runtimeNodeEffectiveVisibility(primitiveHandle)) || !runtimeLodVisible(currentState.node, primitiveHandle, cameraPosition, runtimeNodes ?? canvas)) continue;
    const denseMatrices = currentState.node.instances !== undefined ? denseInstanceMatrices(currentState.node) : undefined;
    if (currentState.node.instances !== undefined && (currentState.node.instances.length === 0 || denseMatrices?.length === 0)) {
      runtimeWarnings.add(`INSTANCES_EMPTY: instances.${currentState.node.primitive} "${currentState.node.name ?? "unnamed"}" has no instances this frame; nothing is drawn.`);
      continue;
    }
    // Keep the resolved node identity for material-revision bookkeeping while
    // measuring LOD in the live world frame rather than its local position.
    const nodePosition: AuraVec3 = currentState.node.position ?? [0, 0, 0];
    const worldPosition: AuraVec3 = parentedPrimitive
      ? [parentedPrimitive.worldMatrix[12]!, parentedPrimitive.worldMatrix[13]!, parentedPrimitive.worldMatrix[14]!]
      : nodePosition;
    const lodPosition: AuraVec3 = parentedPrimitive
      ? [cameraPosition[0] - worldPosition[0] + nodePosition[0], cameraPosition[1] - worldPosition[1] + nodePosition[1], cameraPosition[2] - worldPosition[2] + nodePosition[2]]
      : cameraPosition;
    const resource = selectProductionPrimitiveResource(entry, currentState.node, lodPosition, (htmlCanvas ? getRootPerformanceQuality(htmlCanvas)?.lodBias : undefined) ?? 1);
    if (resource.sdfText && !glyphReleases.has(resource) && isBuiltinGlyphResource(resource)) {
      const release = retainBuiltinGlyphResource(resource);
      if (!release) throw new Error("Built-in glyph resource was retired during frame construction");
      glyphReleases.set(resource, release);
    }
    if (resource.sdfText && resource.texturedMaterial) {
      // G1 per-frame SDF opacity: LOD fade from the live camera distance
      // times the scene occlusion policy, written to the quad material.
      // Occlusion "hide" skips submission (no pixels, no backing claim).
      const position = worldPosition;
      const distance = Math.hypot(
        cameraPosition[0] - position[0], cameraPosition[1] - position[1], cameraPosition[2] - position[2]);
      const frame = resolveSdfTextFrameOpacity({
        distance,
        ...(resource.sdfText.lodFadeNear === undefined ? {} : { lodFadeNear: resource.sdfText.lodFadeNear }),
        ...(resource.sdfText.lodFadeFar === undefined ? {} : { lodFadeFar: resource.sdfText.lodFadeFar }),
        occluded: sdfOcclusionTest?.(position) ?? false,
        occlusionPolicy: resource.sdfText.occlusionPolicy
      });
      applySdfTextFrameAppearance(resource, currentState.node, frame.opacity);
      resource.sdfText.lastVisible = frame.visible;
      resource.sdfText.lastSubmitted = frame.visible;
      if (!frame.visible) continue;
    }
    const drawMaterial = resource.texturedMaterial ?? resource.material;
    const levelMaterial = currentState.node.lod?.levels[entry.currentLodIndex]?.material ?? currentState.node.material;
    const materialClipping = getMaterialClipping(levelMaterial);
    // GU47 E-D: the spec's `rim` and the node's `instanceColorTarget` reach the material this draw uses (writes on change only).
    applyNodeMaterialExtras(drawMaterial, currentState.node.material, currentState.node.instanceColorTarget);
    const authoredMorphs = resource.geometry.morphTargets;
    const runtimeId = currentState.node.runtime?.id;
    const runtimeMorphs = authoredMorphs?.length && runtimeId ? runtimeNodes?.get(runtimeId)?.morphTargets() : undefined;
    const morphWeights = authoredMorphs && runtimeMorphs
      ? authoredMorphs.map((target, index) => {
          const name = target.name ?? String(index);
          return Object.hasOwn(runtimeMorphs, name) ? runtimeMorphs[name]! : 0;
        })
      : undefined;
    if (authoredMorphs && morphWeights) {
      const format = resource.geometry.vertexBuffer.format;
      if (!format.hasAttribute("normal") && authoredMorphs.some((target, index) => target.normals !== undefined && morphWeights[index] !== 0)) {
        throw new Error("MORPH_NORMAL_BASE_REQUIRED: active normal morphs require a base normal attribute.");
      }
      if (!format.hasAttribute("tangent") && authoredMorphs.some((target, index) => target.tangents !== undefined && morphWeights[index] !== 0)) {
        throw new Error("MORPH_TANGENT_BASE_REQUIRED: active tangent morphs require a base tangent attribute.");
      }
    }
    const submittedItem: RenderItem = {
      geometry: resource.geometry,
      temporalObjectKey: primitiveTemporalKey(entry, resource.geometry),
      ...(resource.shadowGeometry ? { shadowGeometry: resource.shadowGeometry } : {}),
      ...(authoredMorphs && morphWeights?.some((weight) => weight !== 0)
        ? { morphTargets: primitiveRenderMorphTargets(authoredMorphs, resource.geometry.vertexBuffer.vertexCount), morphWeights }
        : {}),
      material: drawMaterial,
      ...(materialClipping ? { materialClipping } : {}),
      ...((currentState.node.lod ? resource.materialSpec : currentState.node.material)?.bloom === undefined ? {} : {
        bloomWeight: (currentState.node.lod ? resource.materialSpec : currentState.node.material)!.bloom
      }),
      modelMatrix: parentedPrimitive
        ? parentedModelMatrix(instancedPrimitiveModelNode(withParentedLocalTransform(currentState.node, parentedPrimitive), cache), resource.bounds, false, time, parentedPrimitive.parentWorldMatrix)
        : staticPrimitiveParent && primitivePivoted
          ? parentedModelMatrix(instancedPrimitiveModelNode(withStaticLocalTransform(currentState.node, staticPrimitiveParent.source), cache), resource.bounds, false, time, staticPrimitiveParent.parentWorldMatrix)
          : currentState.node.instances && primitivePivoted
            ? createModelMatrixV2(instancedPrimitiveModelNode(currentState.node, cache), resource.bounds, false, time, new Float32Array(16))
            : prd01ModelMatrixCache?.modelMatrix(instancedPrimitiveModelNode(currentState.node, cache), resource.bounds, false, time) ?? createModelMatrix(instancedPrimitiveModelNode(currentState.node, cache), resource.bounds, false, time),
      label: `primitive-${primitiveIndex}:${resource.name}:${currentState.node.name ?? currentState.node.primitive}`,
      castShadow: currentState.node.castShadow,
      // S5-WP19-04: the actor path always forwarded receiveShadow; primitives dropped it.
      receiveShadow: currentState.node.receiveShadow,
      includeInAutoFrame: false,
      // threejs-parity L7/SG-09: spec parity fields ride the item so layer
      // gating, frustumCulled=false, and renderOrder sorting reach the draw.
      renderOrder: currentState.node.renderOrder,
      frustumCulled: currentState.node.instances && primitivePivoted ? false : currentState.node.frustumCulled,
      layerMask: currentState.node.layers,
      userData: currentState.node.userData,
      // L7/SC-01: `material.*({ envMap: { cubeCamera } })` → environmentCube.
      ...(currentState.node.material?.envMap?.cubeCamera
        ? { cubeCameraEnvMap: currentState.node.material.envMap.cubeCamera }
        : {}),
      ...(denseMatrices && currentState.node.instances
        ? (() => {
            const dense = prd01DenseInstanceColors(currentState.node, denseMatrices.length / 16, cache);
            return { instanceTransforms: prd01DenseInstanceTransforms(denseMatrices, currentState.node, cache), ...(dense ? { instanceColors: dense } : {}) };
          })()
        : currentState.node.instances ? { instanceTransforms: prd01InstanceTransforms(currentState.node.instances, currentState.node, cache), instanceColors: prd01InstanceColors(currentState.node.instanceColors, currentState.node.instances.length, cache) } : {})
    };
    const identifiedItem = withAdvancedLightingOrigin(submittedItem, currentState.node);
    items.push(identifiedItem);
    primitiveQueryItems?.push(identifiedItem);
  }
  const unsupportedTemporal = items.find(item => {
    const base = item.material && "baseMaterial" in item.material ? item.material.baseMaterial : item.material;
    return Boolean(item.skinning || item.morphTargets?.length || item.instanceTransforms?.length || item.geometry.topology !== "triangles" || base?.renderState.blend);
  });
  const temporalRequested = groups.flatten(snapshot.nodes).some(node => node.kind === "effect" && (node.effect === "motion-blur" || (node.effect === "anti-alias" && node.mode === "taa")));
  for (const warning of runtimeWarnings) if (warning.startsWith("TEMPORAL_UNSUPPORTED_GEOMETRY:")) runtimeWarnings.delete(warning);
  if (temporalRequested && unsupportedTemporal) runtimeWarnings.add(`TEMPORAL_UNSUPPORTED_GEOMETRY: ${unsupportedTemporal.label}; requires opaque rigid noninstanced triangles`);
  // PRD-03 Phase 4: under flag-on a compatibility-injected postprocess chain is
  // a legacy catalog — warn and drop it; the v2 builder is the single chain.
  const injectedPostprocess = compatibility?.source.postprocess;
  const postFlagOn = authoredPostContextFor(canvas)?.flags.post === true;
  if (injectedPostprocess && postFlagOn) {
    runtimeWarnings.add("POST_LEGACY_POSTPROCESS: compatibility source.postprocess dropped on the v2 post chain (POST_POSTPROCESSES_MIGRATED)");
  }
  const buildPostprocess = () => {
    const prevTime = cache.lastFrameTime;
    const frameTime = prevTime === undefined ? 1 / 60 : Math.min(1, Math.max(0, time - prevTime));
    cache.lastFrameTime = time;
    return createProductionRuntimePostprocess(snapshot, collectedLights, canvas.width, canvas.height, !unsupportedTemporal, {
      canvas, frameTime, ...(temporalSceneIdentity ? { temporalSceneIdentity } : {})
    });
  };
  // Direct path (quality "auto", no authored post/HDR/transmission): no postprocess object at all, so the
  // renderer draws straight into the canvas instead of an HDR target plus a tone-mapping present pass.
  let builtPostprocess = isDirectRenderPath(canvas) ? undefined : (postFlagOn ? undefined : injectedPostprocess) ?? buildPostprocess();
  // Non-primitive/model producers do not carry this signal through the
  // production bridge. Preserve their request even on the legacy post route,
  // including live material updates, so the renderer reports its fallback.
  // Only bloom frames look, and only nodes that author a material are read
  // (a live snapshot per runtime node per frame would cost every scene).
  const bloomFrame = typeof builtPostprocess === "object" && builtPostprocess !== null && Boolean(builtPostprocess.bloom);
  const unknownBloomSource = bloomFrame && groups.flatten(snapshot.nodes).some((node) => {
    if (node.kind === "primitive" || node.kind === "model" || !("material" in node)) return false;
    const id = "runtime" in node ? node.runtime?.id : undefined;
    const live = id ? (runtimeNodes?.get(id)?.snapshot() as unknown as { readonly material?: { readonly bloom?: unknown } } | undefined)?.material : undefined;
    const authored = (node as { readonly material?: { readonly bloom?: unknown } }).material;
    const weight = (live ?? authored)?.bloom;
    return typeof weight === "number" && Number.isFinite(weight) && Math.min(2, Math.max(0, weight)) !== 1;
  });
  if (unknownBloomSource && typeof builtPostprocess === "object" && builtPostprocess?.bloom) {
    const markedBloom = {
      ...(typeof builtPostprocess.bloom === "object" ? builtPostprocess.bloom : {}),
      selectiveRequested: true,
      selectiveUnsupportedSource: true
    };
    builtPostprocess = { ...builtPostprocess, bloom: markedBloom };
  }
  const sceneClipping = getSceneClipping(snapshot);
  // Consolidation bakes object transforms and batching coalesces items. Neither
  // can change per-object local clipping coordinates or discard group state.
  const hasClipping = Boolean(sceneClipping || compatibility?.source.globalClipping || compatibility?.source.materialClippingFor ||
    items.some((item) => item.globalClipping || item.materialClipping));
  const source: RenderSource = {
    ...(compatibility?.source ?? {}),
    collectRenderItems: () => items,
    ...(sceneClipping ? { globalClipping: sceneClipping } : {}),
    cameraPolicy: compatibility?.source.cameraPolicy ?? "require",
    // Flag-on the resolved AA (tier/auto → TAA) decides batching too — a scene
    // whose postprocess carries a temporal bag can't static-batch (velocity).
    staticBatching: hasClipping ? false : postFlagOn
      ? (typeof builtPostprocess === "object" && builtPostprocess !== null ? !builtPostprocess.temporal : true)
      : !temporalRequested,
    ...(hasClipping ? { staticMeshConsolidation: false } : {}),
    frustumCulling: true,
    // Keep the explicit empty list: omitting it would enable the renderer's
    // implicit direct-light rig rather than represent a light-free frame.
    collectedLights: [...collectedLights, ...(compatibility?.source.collectedLights ?? [])],
    environmentLighting: compatibility?.source.environmentLighting ?? environmentLighting,
    // The production runtime owns the pixel-backed HDR target and pass chain for
    // routes that request effects. The diagnostics are device-observed, so a
    // compositor failure is reported as fallback rather than claimed as a pass.
    // CCR-03-1: `attach.canvas` keys the submitted record/context stores so a
    // second app's compile never overwrites the first's post diagnostics.
    postprocess: builtPostprocess,
    shadow: { ...createProductionRuntimeShadowOptions(snapshot, collectedLights), ...(htmlCanvas && getRootPerformanceQuality(htmlCanvas) ? { size: getRootPerformanceQuality(htmlCanvas)!.shadowSize } : {}) },
    // The canvas identity denotes the standalone path, whose old ownerless
    // fog binding remains valid. A managed app's private owner never falls
    // back to that global binding.
    environmentFog: compatibility?.source.environmentFog ?? createProductionRuntimeEnvironmentFog(snapshot, collectedLights, canvas.width, canvas.height,
      owner === canvas && !prd07FogRuntimeState(owner) ? undefined : owner),
    ...(compatibility?.source.cameraPolicy === "auto-frame" ? {} : { cameraPosition })
  };
  // This list is already built for the authored frame. Only sources without
  // user collectors or additional renderItems receive the private batching
  // association; compatibility sources preserve their old collection path.
  if (!compatibility) Renderer.bindCompilerFrameItems(source, items);
  const cameraLike: CameraLike = { viewProjectionMatrix, shaderViewMatrix: cameraMatrices.view, shaderProjectionMatrix: cameraMatrices.projection, projectionMetadata, depthConvention, ...(snapshot.camera.layers !== undefined ? { layerMask: snapshot.camera.layers >>> 0 } : {}) };
  // Publish precisely the finalized items put in this frame's source, including
  // composed GLB instance matrices and primitive dense-instance writes.
  for (const handle of ownerQueryHandles.get(owner) ?? []) {
    if (!queryItems.has(handle)) setRuntimeQueryRenderItems(handle, []);
  }
  for (const [handle, submitted] of queryItems) setRuntimeQueryRenderItems(handle, submitted);
  ownerQueryHandles.set(owner, new Set(queryItems.keys()));
  const result: ProductionRendererInput = {
    source,
    ...(compatibility?.source.cameraPolicy === "auto-frame" ? {} : { camera: cameraLike }),
    metadata: includeRootSourceMetadata(createProductionRuntimeMetadata(actorEntries, primitiveEntries), attachedItems)
  };
  if (compatibility) Object.defineProperty(result, rootRenderSourceFrame, { value: compatibility, enumerable: true });
  if (glyphReleases.size) {
    builtinGlyphFrames.set(source, { refs: 1, ownerReleased: false, releases: [...glyphReleases.values()] });
  }
  return result;
  } catch (error) {
    const failures: unknown[] = [];
    for (const release of glyphReleases.values()) {
      try { release(); } catch (cleanupError) { failures.push(cleanupError); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], "Frame construction and built-in glyph cleanup failed");
    throw error;
  }
}
