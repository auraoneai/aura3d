// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; the only logic change is the
// flag-gated Q-15-2 `qr` option (A3D_QR_CORE primitives via @aura3d/rendering); omitted = unchanged.

import type { AuraAssetRef, AuraColor, AuraModelNode, AuraPrimitiveNode, AuraRuntimeNodeRegistry, AuraSceneNode, AuraTransformSpec, AuraVec3, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource, ProductionRuntimePrimitiveState } from "../nodes/types.js";
import { colorToLinearRgba } from "../colorUtils.js";
import { animation } from "../nodes/animation.js";
import { geometry } from "../nodes/geometry.js";
import { primitive } from "../nodes/primitives.js";
import { createModelMatrix, primitiveSize, shouldNormalizeModelNode } from "../sceneMath.js";
import { assertValidPivot, hasNonzeroPivot } from "../pivotGuard.js";
import { lodMarkerOf } from "../lodMarkers.js";
import { createModelMatrixV2, parentTransformOf } from "./sceneGraph.js";
import { selectAuraRootLodLevel } from "../RootGeometry.js";
import { evaluateDistancePrioritizedMipResidency, fetchBytes, type AssetIntegrity, type AssetRequestOptions, type TextureStreamingCandidate, type TextureStreamingResidency } from "@aura3d/assets/browser";
import { createPrimitiveGeometry, DepthPreviewMaterial, InstancedUnlitMaterial, PortableShaderMaterial, UnlitMaterial, createDualProbeEnvironmentLightingResources, createProductionEnvironmentLightingResources, type EnvironmentLightingOptions } from "@aura3d/rendering";
import { createProductionPbrHdrPipelineFromLinear, createProductionPbrHdrPipelineFromRadiance, parseProductionRadianceHDR } from "@aura3d/rendering/production-runtime";
import { decodeRgbeEnvironmentMap, type LinearHdrEnvironmentMapSource } from "@aura3d/rendering";
import type { AuraParityPrimitiveParams } from "@aura3d/rendering";
import { applyCustomUniformWrites, createCustomShaderMaterial, customUniformWritesFor, syncCustomTextureRefs } from "./customMaterial.js";
import { normalizeTextureBudgetBytes } from "../app/rendererOptions.js";
import { AuraRuntimeError } from "./errors.js";
import { blankProductionPrimitiveTextureState, createSdfTextPrimitiveResource, retireSdfTextPrimitiveResource } from "./textures.js";
import { retireBuiltinGlyphResource, type BuiltinGlyphAtlasScope } from "./BuiltinGlyphAtlas.js";
import { createLiveBuiltinTextFallbackGeometry } from "../nodes/text3d.js";
import { material } from "../nodes/material.js";
import { resolveIridescenceThickness } from "../../material-physical/PhysicalMaterialSpec.js";
import { runtimeMaterialRevision } from "../app/runtimeNodes.js";

/** Internal mount-owned hooks; standalone primitive callers need no observer. */
export interface PrimitiveMaterialObserver {
  beforeReplace(entry: ProductionRuntimePrimitiveEntry, resource: ProductionRuntimePrimitiveResource): void;
  afterApply(entry: ProductionRuntimePrimitiveEntry, resource: ProductionRuntimePrimitiveResource, node: AuraPrimitiveNode, revision: number): void;
}

const primitiveMaterialObservers = new WeakMap<ProductionRuntimePrimitiveEntry, Set<PrimitiveMaterialObserver>>();
const appliedMaterialRevisions = new WeakMap<ProductionRuntimePrimitiveResource, number>();
const resolvedMaterialRevisions = new WeakMap<AuraPrimitiveNode, number>();
const resolvedMaterialCurrent = new WeakMap<AuraPrimitiveNode, () => boolean>();
const activeSdfReplacements = new WeakSet<ProductionRuntimePrimitiveResource>();
const primitiveGlyphScopes = new WeakMap<ProductionRuntimePrimitiveEntry, BuiltinGlyphAtlasScope>();
const primitiveQrOptions = new WeakMap<ProductionRuntimePrimitiveEntry, QrPrimitiveGeometryOptions>();

/** Validate raw and live inputs before constructing or mutating resources. */
export function assertPrimitivePivotSupported(node: AuraPrimitiveNode, inheritedPivot = false): void {
  assertValidPivot(node.pivot);
  let pivoted = inheritedPivot || parentTransformOf(node)?.hasPivot === true || hasNonzeroPivot(node.pivot);
  for (const transform of node.instances ?? []) {
    assertValidPivot(transform.pivot);
    pivoted ||= hasNonzeroPivot(transform.pivot);
  }
  if (!pivoted) return;
  // An own pivot composes with an own lookAt in the model matrix; pivoted
  // instance batches have no per-instance look-at composition.
  if ((node.lookAt !== undefined && node.instances !== undefined) || node.instances?.some((transform) => transform.lookAt !== undefined)) {
    throw new Error("PIVOT_UNSUPPORTED_LOOK_AT: pivoted primitive instances cannot use lookAt.");
  }
  if (node.lod?.levels.length || lodMarkerOf(node)) {
    throw new Error("PIVOT_UNSUPPORTED_LOD: pivoted primitives cannot use distance LOD.");
  }
}

function sdfResourceAlive(resource: ProductionRuntimePrimitiveResource): boolean {
  if (resource.material.disposed || (resource.sdfText && (!resource.texturedMaterial || resource.texturedMaterial.disposed))) return false;
  try { resource.geometry.vertexBuffer.readBytes(0, 0); return true; } catch { return false; }
}

/** Revision already installed on this resource, for mount-owned job admission. */
export function primitiveMaterialAppliedRevision(resource: ProductionRuntimePrimitiveResource): number {
  return appliedMaterialRevisions.get(resource) ?? 0;
}

export function observePrimitiveMaterial(entry: ProductionRuntimePrimitiveEntry, observer: PrimitiveMaterialObserver): () => void {
  let observers = primitiveMaterialObservers.get(entry);
  if (!observers) { observers = new Set(); primitiveMaterialObservers.set(entry, observers); }
  observers.add(observer);
  return () => {
    observers!.delete(observer);
    if (observers!.size === 0 && primitiveMaterialObservers.get(entry) === observers) primitiveMaterialObservers.delete(entry);
  };
}

function notifyMaterialObservers(entry: ProductionRuntimePrimitiveEntry, invoke: (observer: PrimitiveMaterialObserver) => void): void {
  const observers = primitiveMaterialObservers.get(entry);
  if (!observers) return;
  for (const observer of [...observers]) if (observers.has(observer)) invoke(observer);
}

function currentMaterialNode(node: AuraPrimitiveNode): boolean {
  return resolvedMaterialCurrent.get(node)?.() ?? true;
}

function assertCurrentPrimitiveMaterial(entry: ProductionRuntimePrimitiveEntry, resource: ProductionRuntimePrimitiveResource, node: AuraPrimitiveNode): void {
  if (!currentMaterialNode(node) || resource.material.disposed || !entry.resources.includes(resource)) {
    throw new Error("PRIMITIVE_MATERIAL_SUPERSEDED: primitive material changed or was removed during frame preparation");
  }
}

function applyPrimitiveMaterial(
  entry: ProductionRuntimePrimitiveEntry,
  resource: ProductionRuntimePrimitiveResource,
  node: AuraPrimitiveNode,
  revision: number
): void {
  const staged = createProductionPrimitiveMaterial(node);
  try {
    if (staged instanceof PortableShaderMaterial && node.runtime?.id) {
      const writes = customUniformWritesFor(node.runtime.id);
      if (writes?.size) applyCustomUniformWrites(staged, writes);
      syncCustomTextureRefs(staged);
    }
    if (!currentMaterialNode(node) || resource.material.disposed || !entry.resources.includes(resource)) return;
    notifyMaterialObservers(entry, (observer) => observer.beforeReplace(entry, resource));
    if (!currentMaterialNode(node) || resource.material.disposed || !entry.resources.includes(resource)) return;

    const oldMaterial = resource.material;
    const oldTextured = resource.texturedMaterial;
    const oldDisposer = resource.textureDisposer;
    const mutable = resource as { material: ProductionRuntimePrimitiveResource["material"]; materialSpec: AuraPrimitiveNode["material"]; sourceNode: AuraPrimitiveNode };
    mutable.material = staged;
    mutable.materialSpec = node.material;
    mutable.sourceNode = node;
    resource.texturedMaterial = null;
    resource.textureDisposer = undefined;
    resource.textureStatus = "none";
    resource.textureSlots = [];
    resource.textureWarnings = [];
    resource.textureBytes = 0;
    resource.textureMipBytes = [];
    appliedMaterialRevisions.set(resource, revision);

    const failures: unknown[] = [];
    const cleanup = (work: () => void): void => { try { work(); } catch (error) { failures.push(error); } };
    cleanup(() => oldDisposer?.());
    if (oldTextured && !Object.is(oldTextured, oldMaterial)) cleanup(() => oldTextured.dispose());
    cleanup(() => oldMaterial.dispose());
    if (resource.material === staged && !staged.disposed && entry.resources.includes(resource) && currentMaterialNode(node)) {
      cleanup(() => notifyMaterialObservers(entry, (observer) => observer.afterApply(entry, resource, node, revision)));
    }
    if (failures.length) throw new AggregateError(failures, "Primitive material replacement cleanup failed");
  } finally {
    // A stale/reentrant replacement must not leak the staged material. Once
    // installed, ownership belongs to the resource even if cleanup reports.
    if (resource.material !== staged) staged.dispose();
  }
}

/** Release every staged allocation if a later construction step fails. */
function withPrimitiveConstruction<T>(construct: (own: (cleanup: () => void) => void) => T): T {
  const cleanups: (() => void)[] = [];
  try {
    return construct((cleanup) => cleanups.push(cleanup));
  } catch (error) {
    const failures: unknown[] = [];
    for (let index = cleanups.length - 1; index >= 0; index -= 1) {
      try { cleanups[index]!(); } catch (failure) { failures.push(failure); }
    }
    if (failures.length) {
      throw new AggregateError([error, ...failures], "Primitive construction and rollback failed", { cause: error });
    }
    throw error;
  }
}

/** Retire everything owned by a completed, not-yet-published resource. */
function disposeUnpublishedPrimitiveResource(resource: ProductionRuntimePrimitiveResource): void {
  if (retireBuiltinGlyphResource(resource)) return;
  const failures: unknown[] = [];
  const cleanup = (work: () => void): void => { try { work(); } catch (error) { failures.push(error); } };
  cleanup(() => resource.textureDisposer?.());
  cleanup(() => resource.geometry.dispose());
  if (resource.shadowGeometry && resource.shadowGeometry !== resource.geometry) cleanup(() => resource.shadowGeometry!.dispose());
  cleanup(() => resource.material.dispose());
  if (resource.texturedMaterial && !Object.is(resource.texturedMaterial, resource.material)) cleanup(() => resource.texturedMaterial!.dispose());
  if (failures.length) throw new AggregateError(failures, "Primitive resource rollback failed");
}

/**
 * Q-15-2: `qr` (from `qrPrimitiveGeometryOptions(flags, quality)`) routes the
 * builtin primitives through @aura3d/rendering `createPrimitiveGeometry` under
 * A3D_QR_CORE. Omitted / undefined = the legacy generators, unchanged.
 */
export function createProductionRuntimePrimitiveEntries(nodes: readonly AuraSceneNode[], qr?: QrPrimitiveGeometryOptions, scope?: BuiltinGlyphAtlasScope): ProductionRuntimePrimitiveEntry[] {
  // Validate the whole batch before allocating the first resource.
  for (const node of nodes) if (node.kind === "primitive") assertPrimitivePivotSupported(node);
  return withPrimitiveConstruction((own) => nodes
    .filter((node): node is AuraPrimitiveNode => node.kind === "primitive")
    .map((node) => {
      const resources = createProductionPrimitiveResources(node, qr, scope);
      for (const resource of resources) if (resource) own(() => disposeUnpublishedPrimitiveResource(resource));
      const entry: ProductionRuntimePrimitiveEntry = { node, resources, currentLodIndex: 0 };
      if (scope) primitiveGlyphScopes.set(entry, scope);
      if (qr) primitiveQrOptions.set(entry, qr);
      return entry;
    }));
}

export function createProductionPrimitiveResources(node: AuraPrimitiveNode, qr?: QrPrimitiveGeometryOptions, scope?: BuiltinGlyphAtlasScope): readonly ProductionRuntimePrimitiveResource[] {
  assertPrimitivePivotSupported(node);
  return withPrimitiveConstruction((own) => createPrimitiveResources(node, qr, own, scope));
}

function createPrimitiveResources(node: AuraPrimitiveNode, qr: QrPrimitiveGeometryOptions | undefined, own: (cleanup: () => void) => void, scope?: BuiltinGlyphAtlasScope): readonly ProductionRuntimePrimitiveResource[] {
  const levels = node.lod?.levels;
  if (!levels?.length) {
    const sdfWarnings: string[] = [];
    const sdfResource = createSdfTextPrimitiveResource(node, (message) => { sdfWarnings.push(message); }, scope);
    if (sdfResource) {
      own(() => disposeUnpublishedPrimitiveResource(sdfResource));
      return [sdfResource];
    }
    const qrGeometry = qrPrimitiveGeometryFor(node, qr);
    let geometry = qrGeometry?.geometry;
    if (geometry) own(() => geometry!.dispose());
    const shadowGeometry = qrPrimitiveShadowGeometryFor(node, qr, qrGeometry?.geometry);
    if (shadowGeometry && shadowGeometry !== geometry) own(() => shadowGeometry.dispose());
    if (!geometry) {
      geometry = createProductionPrimitiveGeometry(node);
      own(() => geometry!.dispose());
    }
    const material = createProductionPrimitiveMaterial(node);
    own(() => material.dispose());
    const fallback = {
      geometry,
      ...(shadowGeometry ? { shadowGeometry } : {}),
      material,
      bounds: qrGeometry?.bounds ?? primitiveGeometryBounds(node),
      name: node.name ?? node.primitive,
      materialSpec: node.material,
      sourceNode: node,
      ...blankProductionPrimitiveTextureState()
    };
    // threejs-parity L2: the spec object the resource geometry was built from.
    // `handle.setGeometry` mutates `node.geometry` in place, so the applied
    // marker must be captured here rather than re-read from `sourceNode`.
    (fallback as ProductionRuntimePrimitiveResource & L2ResourceTrack).__parityL2AppliedGeometry = node.geometry;
    // Sampler failures stay visible on the fallback resource (surfaced via
    // texturedMaterials diagnostics), never swallowed by the mesh swap.
    fallback.textureWarnings.push(...sdfWarnings);
    return [fallback];
  }
  return levels.map((level, index) => {
    if (!level.primitive && !level.geometry) throw new Error(`Aura3D LOD level ${index} requires primitive or custom geometry.`);
    const levelNode: AuraPrimitiveNode = {
      ...node,
      primitive: level.geometry ? "custom" : level.primitive!,
      geometry: level.geometry,
      material: level.material ?? node.material,
      lod: undefined
    };
    const levelWarnings: string[] = [];
    const levelSdf = createSdfTextPrimitiveResource(levelNode, (message) => { levelWarnings.push(message); }, scope);
    if (levelSdf) {
      own(() => disposeUnpublishedPrimitiveResource(levelSdf));
      return { ...levelSdf, name: level.name };
    }
    const levelQrGeometry = qrPrimitiveGeometryFor(levelNode, qr);
    const geometry = levelQrGeometry?.geometry ?? createProductionPrimitiveGeometry(levelNode);
    own(() => geometry.dispose());
    const material = createProductionPrimitiveMaterial(levelNode);
    own(() => material.dispose());
    const levelFallback = {
      geometry,
      material,
      bounds: levelQrGeometry?.bounds ?? primitiveGeometryBounds(levelNode),
      name: level.name,
      materialSpec: levelNode.material,
      sourceNode: levelNode,
      ...blankProductionPrimitiveTextureState()
    };
    (levelFallback as ProductionRuntimePrimitiveResource & L2ResourceTrack).__parityL2AppliedGeometry = levelNode.geometry;
    levelFallback.textureWarnings.push(...levelWarnings);
    return levelFallback;
  });
}

/** Stage the current fallback without changing the resource already in use. */
function createLiveTextFallbackResource(
  entry: ProductionRuntimePrimitiveEntry,
  previous: ProductionRuntimePrimitiveResource,
  node: AuraPrimitiveNode,
  keepLevelName: boolean,
  warnings: readonly string[]
): ProductionRuntimePrimitiveResource {
  const fallbackNode = keepLevelName ? node : { ...node, geometry: createLiveBuiltinTextFallbackGeometry(node.text3D!) };
  return withPrimitiveConstruction((own) => {
    const qrGeometry = qrPrimitiveGeometryFor(fallbackNode, primitiveQrOptions.get(entry));
    const geometry = qrGeometry?.geometry ?? createProductionPrimitiveGeometry(fallbackNode);
    own(() => geometry.dispose());
    const material = createProductionPrimitiveMaterial(fallbackNode);
    own(() => material.dispose());
    const resource: ProductionRuntimePrimitiveResource = {
      geometry,
      material,
      bounds: qrGeometry?.bounds ?? primitiveGeometryBounds(fallbackNode),
      name: keepLevelName ? previous.name : node.name ?? node.primitive,
      materialSpec: node.material,
      // Keep the authored geometry marker: the freshly generated fallback is
      // already current and must not be replaced by the original text mesh.
      sourceNode: node,
      ...blankProductionPrimitiveTextureState()
    };
    (resource as ProductionRuntimePrimitiveResource & L2ResourceTrack).__parityL2AppliedGeometry = node.geometry;
    resource.textureWarnings.push(...warnings);
    return resource;
  });
}

/** Publish before retirement so synchronous cleanup sees the resource the entry owns. */
function replaceCurrentSdfResource(
  entry: ProductionRuntimePrimitiveEntry,
  index: number,
  previous: ProductionRuntimePrimitiveResource,
  node: AuraPrimitiveNode,
  revision: number,
  keepLevelName: boolean
): ProductionRuntimePrimitiveResource {
  if (activeSdfReplacements.has(previous)) throw new Error("PRIMITIVE_MATERIAL_SUPERSEDED: text replacement is already in progress");
  activeSdfReplacements.add(previous);
  let staged: ProductionRuntimePrimitiveResource | undefined;
  let published = false;
  const notified: PrimitiveMaterialObserver[] = [];
  const isOldCurrent = (): boolean => entry.resources[index] === previous && sdfResourceAlive(previous);
  const assertOldCurrent = (): void => {
    if (!isOldCurrent()) throw new Error("PRIMITIVE_MATERIAL_SUPERSEDED: text resource was changed or removed during frame preparation");
    assertCurrentPrimitiveMaterial(entry, previous, node);
  };
  try {
    const warnings: string[] = [];
    const createdSdf = createSdfTextPrimitiveResource(node, (message) => {
      if (previous.sdfText) throw new Error(message);
      warnings.push(message);
    }, primitiveGlyphScopes.get(entry));
    const created = createdSdf ?? (previous.sdfText
      ? undefined
      : createLiveTextFallbackResource(entry, previous, node, keepLevelName, warnings));
    if (!created) throw new Error("Aura3D live text refresh did not create a text resource.");
    staged = keepLevelName ? { ...created, name: previous.name } : created;
    assertOldCurrent();

    // A before callback can cancel mount-owned work and reenter the scene.
    // Remember each called observer so a failed precommit restores tracking.
    const observers = primitiveMaterialObservers.get(entry);
    if (observers) for (const observer of [...observers]) {
      if (!primitiveMaterialObservers.get(entry)?.has(observer)) continue;
      notified.push(observer);
      observer.beforeReplace(entry, previous);
      assertOldCurrent();
    }
    assertOldCurrent();
    (entry.resources as ProductionRuntimePrimitiveResource[])[index] = staged;
    published = true;
    appliedMaterialRevisions.set(staged, revision);

    const failures: unknown[] = [];
    try { retireSdfTextPrimitiveResource(previous); } catch (error) { failures.push(error); }
    const isStagedCurrent = (): boolean => entry.resources[index] === staged &&
      sdfResourceAlive(staged!) && currentMaterialNode(node);
    const after = primitiveMaterialObservers.get(entry);
    if (after) for (const observer of [...after]) {
      if (!isStagedCurrent()) break;
      if (!primitiveMaterialObservers.get(entry)?.has(observer)) continue;
      try { observer.afterApply(entry, staged, node, revision); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "SDF text replacement cleanup failed");
    if (!isStagedCurrent()) throw new Error("PRIMITIVE_MATERIAL_SUPERSEDED: text resource changed during retirement");
    return staged;
  } catch (error) {
    if (published) throw error;
    const failures: unknown[] = [];
    if (staged) {
      try { retireSdfTextPrimitiveResource(staged); } catch (failure) { failures.push(failure); }
    }
    // Restore only observers which actually saw beforeReplace, and only if
    // the old resource still belongs to this entry. A newer revision may have
    // invalidated its jobs; the observer must decide whether to queue again.
    for (const observer of notified) {
      if (!isOldCurrent()) break;
      if (!primitiveMaterialObservers.get(entry)?.has(observer)) continue;
      try { observer.afterApply(entry, previous, previous.sourceNode, primitiveMaterialAppliedRevision(previous)); }
      catch (failure) { failures.push(failure); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], "SDF text replacement and rollback failed", { cause: error });
    throw error;
  } finally {
    activeSdfReplacements.delete(previous);
  }
}

function syncPrimitiveMaterials(entry: ProductionRuntimePrimitiveEntry, node: AuraPrimitiveNode): void {
  const revision = resolvedMaterialRevisions.get(node) ?? 0;
  const levels = node.lod?.levels;
  for (let index = 0; index < entry.resources.length; index += 1) {
    let resource = entry.resources[index]!;
    const levelMaterial = levels?.length ? levels[index]?.material ?? node.material : node.material;
    const changed = levelMaterial !== resource.materialSpec || revision !== (appliedMaterialRevisions.get(resource) ?? 0);
    const optedBuiltinFallback = !resource.sdfText && node.text3D?.backend === "sdf" &&
      node.text3D.sdfGlyphAtlas === "shared" && !node.text3D.sdfDynamic;
    const textChanged = Boolean((resource.sdfText || optedBuiltinFallback) && node.text3D && node.text3D !== resource.sourceNode.text3D);
    if (!changed && !textChanged) {
      assertCurrentPrimitiveMaterial(entry, resource, node);
      continue;
    }
    const levelNode = levels?.length
      ? { ...resource.sourceNode, material: levelMaterial, text3D: node.text3D ?? resource.sourceNode.text3D } as AuraPrimitiveNode
      : node;
    const guard = resolvedMaterialCurrent.get(node);
    if (guard && levelNode !== node) resolvedMaterialCurrent.set(levelNode, guard);
    if (levelNode.text3D && ((resource.sdfText && (textChanged || changed)) || (optedBuiltinFallback && textChanged))) {
      resource = replaceCurrentSdfResource(entry, index, resource, levelNode, revision, Boolean(levels?.length));
    } else if (!resource.sdfText && changed) {
      applyPrimitiveMaterial(entry, resource, levelNode, revision);
    }
    assertCurrentPrimitiveMaterial(entry, resource, levelNode);
  }
}

export function selectProductionPrimitiveResource(entry: ProductionRuntimePrimitiveEntry, node: AuraPrimitiveNode, cameraPosition: AuraVec3, lodBias = 1): ProductionRuntimePrimitiveResource {
  syncPrimitiveMaterials(entry, node);
  if (!node.lod?.levels.length) {
    const resource = entry.resources[0]!;
    // In-place buffer writes when the vertex count is unchanged, replace otherwise.
    syncRuntimePrimitiveGeometry(resource, node);
    return resource;
  }
  const position = node.position ?? [0, 0, 0];
  const distance = Math.hypot(cameraPosition[0] - position[0], cameraPosition[1] - position[1], cameraPosition[2] - position[2]);
  const selection = selectAuraRootLodLevel(distance * lodBias, node.lod.levels, entry.currentLodIndex, node.lod.hysteresis ?? 0);
  entry.currentLodIndex = selection.levelIndex;
  return entry.resources[Math.min(selection.levelIndex, entry.resources.length - 1)]!;
}

/** Orientation fields only the scene-graph composer (`createModelMatrixV2`) honours. */
function usesSceneGraphOrientation(node: AuraTransformSpec): boolean {
  return node.quaternion !== undefined || node.rotationOrder !== undefined || node.lookAt !== undefined;
}

export function createProductionModelInstanceTransforms(
  transforms: readonly AuraTransformSpec[],
  node: AuraModelNode,
  bounds: { readonly min: AuraVec3; readonly max: AuraVec3 },
  time: number
): Float32Array {
  assertValidPivot(node.pivot);
  const matrices = new Float32Array(transforms.length * 16);
  transforms.forEach((transform, index) => {
    assertValidPivot(transform.pivot);
    const pivoted = hasNonzeroPivot(node.pivot) || hasNonzeroPivot(transform.pivot);
    const localNode: AuraModelNode = {
      ...node, ...transform,
      ...(transform.rotation !== undefined && transform.quaternion === undefined ? { quaternion: undefined } : {})
    };
    // S5-WP19-04: the legacy composer ignores quaternion / rotationOrder / lookAt.
    matrices.set(pivoted || usesSceneGraphOrientation(localNode)
      ? createModelMatrixV2(localNode, bounds, shouldNormalizeModelNode(node), time, new Float32Array(16))
      : createModelMatrix(localNode, bounds, shouldNormalizeModelNode(node), time), index * 16);
  });
  return matrices;
}

export function createProductionInstanceTransforms(transforms: readonly AuraTransformSpec[], node: AuraPrimitiveNode): Float32Array {
  const matrices = new Float32Array(transforms.length * 16);
  transforms.forEach((transform, index) => {
    assertValidPivot(transform.pivot);
    const localNode: AuraPrimitiveNode = { kind: "primitive", primitive: node.primitive, size: node.size, ...transform };
    const bounds = { min: [-0.5, -0.5, -0.5] as AuraVec3, max: [0.5, 0.5, 0.5] as AuraVec3 };
    matrices.set(hasNonzeroPivot(transform.pivot) || usesSceneGraphOrientation(localNode)
      ? createModelMatrixV2(localNode, bounds, false, 0, new Float32Array(16))
      : createModelMatrix(localNode, bounds, false, 0), index * 16);
  });
  return matrices;
}

/**
 * Dense counterpart of `createProductionInstanceTransforms` for matrices written by `handle.setInstanceMatrices`.
 * The spec path builds T·R·S(scale ⊙ size) per instance; a dense matrix already is T·R·S(scale), so folding the node
 * `size` in is a scale of its three basis columns. `out` is reused across frames while the count is unchanged.
 */
export function createProductionInstanceTransformsFromMatrices(matrices: Float32Array, node: AuraPrimitiveNode, out?: Float32Array): Float32Array {
  const size = primitiveSize(node);
  const target = out !== undefined && out.length === matrices.length ? out : new Float32Array(matrices.length);
  const sx = size[0], sy = size[1], sz = size[2];
  for (let o = 0; o < matrices.length; o += 16) {
    target[o] = matrices[o]! * sx; target[o + 1] = matrices[o + 1]! * sx; target[o + 2] = matrices[o + 2]! * sx; target[o + 3] = matrices[o + 3]!;
    target[o + 4] = matrices[o + 4]! * sy; target[o + 5] = matrices[o + 5]! * sy; target[o + 6] = matrices[o + 6]! * sy; target[o + 7] = matrices[o + 7]!;
    target[o + 8] = matrices[o + 8]! * sz; target[o + 9] = matrices[o + 9]! * sz; target[o + 10] = matrices[o + 10]! * sz; target[o + 11] = matrices[o + 11]!;
    target[o + 12] = matrices[o + 12]!; target[o + 13] = matrices[o + 13]!; target[o + 14] = matrices[o + 14]!; target[o + 15] = matrices[o + 15]!;
  }
  return target;
}

export function createProductionInstanceColors(colors: readonly AuraColor[] | undefined, count: number): Float32Array | undefined {
  if (!colors) return undefined;
  if (colors.length !== count) throw new Error("Aura3D instance color count must match instance transform count.");
  const values = new Float32Array(count * 4);
  colors.forEach((color, index) => values.set(colorToLinearRgba(color), index * 4));
  return values;
}

export function resolveProductionPrimitiveRuntimeState(
  entry: ProductionRuntimePrimitiveEntry,
  runtimeNodes: AuraRuntimeNodeRegistry | undefined
): ProductionRuntimePrimitiveState {
  // R-26: live `texture.*` handles bound to custom-material texture2d uniforms
  // keep their sampler state in sync here, with or without a runtime id.
  for (const resource of entry.resources) {
    if (resource.material instanceof PortableShaderMaterial) syncCustomTextureRefs(resource.material);
  }
  const runtimeId = entry.node.runtime?.id;
  if (!runtimeId) return { node: entry.node, visible: true };
  const runtimeHandle = runtimeNodes?.get(runtimeId) as (NonNullable<ReturnType<AuraRuntimeNodeRegistry["get"]>> & {
    // threejs-parity L2 (SG-05): set inside `region parity:L2` on the handle —
    // `setGeometry` stores the normalized spec, `updateAttribute` queues
    // partial writes; both drain per frame in `selectProductionPrimitiveResource`.
    readonly __parityL2Geometry?: AuraCustomGeometrySpec;
    readonly __auraText3D?: AuraPrimitiveNode["text3D"];
    __parityL2AttributeUpdates?: readonly AuraL2AttributeUpdate[];
  }) | undefined;
  const runtimeSnapshot = runtimeHandle?.snapshot() as (ReturnType<NonNullable<ReturnType<AuraRuntimeNodeRegistry["get"]>>["snapshot"]> & {
    readonly material?: AuraPrimitiveNode["material"];
    readonly instances?: AuraPrimitiveNode["instances"];
    readonly instanceColors?: AuraPrimitiveNode["instanceColors"];
    readonly instanceMatrices?: Float32Array;
    readonly instanceRgba?: Float32Array;
  }) | undefined;
  // parity:L1 (SH-02): staged `handle.setUniform` writes land on the compiled
  // portable material here — `setParameter` updates uniform state only, never
  // the shader key, so no program is recompiled.
  const uniformWrites = customUniformWritesFor(runtimeId);
  if (uniformWrites?.size) {
    for (const resource of entry.resources) {
      if (resource.material instanceof PortableShaderMaterial) {
        applyCustomUniformWrites(resource.material, uniformWrites);
      }
    }
  }
  if (!runtimeSnapshot) return { node: entry.node, visible: true };
  // L2: drain the queued attribute writes so they apply exactly once.
  const pendingAttributes = runtimeHandle?.__parityL2AttributeUpdates;
  if (runtimeHandle && pendingAttributes && pendingAttributes.length > 0) {
    runtimeHandle.__parityL2AttributeUpdates = [];
  }
  const resolvedNode = {
    ...entry.node,
    position: runtimeSnapshot.position,
    rotation: runtimeSnapshot.rotation,
    scale: runtimeSnapshot.scale,
    pivot: runtimeSnapshot.pivot ?? entry.node.pivot,
    material: runtimeSnapshot.material ?? entry.node.material,
    animation: runtimeSnapshot.animation ?? entry.node.animation,
    ...(runtimeSnapshot.instances ? { instances: runtimeSnapshot.instances } : {}),
    ...(runtimeSnapshot.instanceColors ? { instanceColors: runtimeSnapshot.instanceColors } : {}),
    ...(runtimeSnapshot.instanceMatrices ? { instanceMatrices: runtimeSnapshot.instanceMatrices } : {}),
    ...(runtimeSnapshot.instanceRgba ? { instanceRgba: runtimeSnapshot.instanceRgba } : {}),
    ...(runtimeHandle?.__auraText3D ? { text3D: runtimeHandle.__auraText3D } : {}),
    ...(runtimeHandle?.__parityL2Geometry !== undefined ? { geometry: runtimeHandle.__parityL2Geometry } : {})
  } as AuraPrimitiveNode & { __parityL2AttributeUpdates?: readonly AuraL2AttributeUpdate[]; instanceMatrices?: Float32Array; instanceRgba?: Float32Array };
  const revision = runtimeMaterialRevision(runtimeHandle);
  const textRevision = runtimeHandle?.__auraText3D;
  resolvedMaterialRevisions.set(resolvedNode, revision);
  resolvedMaterialCurrent.set(resolvedNode, () => runtimeNodes?.get(runtimeId) === runtimeHandle &&
    runtimeMaterialRevision(runtimeHandle) === revision && runtimeHandle?.__auraText3D === textRevision);
  // Material replacement is observed even while hidden, and every LOD drops
  // its superseded owned texture before a later level becomes visible.
  syncPrimitiveMaterials(entry, resolvedNode);
  if (pendingAttributes && pendingAttributes.length > 0) {
    resolvedNode.__parityL2AttributeUpdates = pendingAttributes;
  }
  return { node: resolvedNode, visible: runtimeSnapshot.visible };
}

export interface TextureStreamingTableEntry {
  readonly id: string;
  readonly mipBytesCoarseToFine: readonly number[];
  readonly distanceMeters: number;
}

export function describeTextureStreamingResidency(
  table: readonly TextureStreamingTableEntry[],
  budgetBytes: number
): TextureStreamingResidency {
  const candidates: TextureStreamingCandidate[] = table.map((entry) => ({
    id: entry.id,
    mipBytesCoarseToFine: entry.mipBytesCoarseToFine,
    distanceMeters: entry.distanceMeters
  }));
  return evaluateDistancePrioritizedMipResidency(candidates, normalizeTextureBudgetBytes(budgetBytes));
}

export type ProductionEnvironmentAsset = string | AuraAssetRef<"texture">;

export interface ProductionEnvironmentRequestOptions {
  readonly request?: AssetRequestOptions;
  readonly signal?: AbortSignal;
}

function environmentDigest(value: string): string {
  if (!/^(?:sha256-)?[a-f0-9]{64}$/i.test(value)) throw new Error("Invalid asset SHA-256 digest");
  return value.replace(/^sha256-/i, "").toLowerCase();
}

function equalEnvironmentIntegrity(a: AssetIntegrity, b: AssetIntegrity): boolean {
  if (a.version !== 1 || b.version !== 1 || environmentDigest(a.digest) !== environmentDigest(b.digest) ||
      (a.requireDependencies ?? false) !== (b.requireDependencies ?? false)) return false;
  const left = Object.entries(a.dependencies ?? {}).sort(([x], [y]) => x.localeCompare(y));
  const right = Object.entries(b.dependencies ?? {}).sort(([x], [y]) => x.localeCompare(y));
  return left.length === right.length && left.every(([url, digest], index) =>
    url === right[index]?.[0] && environmentDigest(digest) === environmentDigest(right[index]![1]));
}

/** Combine app and asset restrictions without discarding admitted integrity. */
export function productionEnvironmentRequest(source: ProductionEnvironmentAsset, appRequest?: AssetRequestOptions): AssetRequestOptions {
  const maxEnvironmentBytes = 256 * 1024 * 1024;
  if (typeof source === "string") return { ...appRequest, maxBytes: Math.min(appRequest?.maxBytes ?? maxEnvironmentBytes, maxEnvironmentBytes) };
  const assetRequest = source.request;
  const digests = [source.hash, source.sha256].filter((value): value is string => value !== undefined).map(environmentDigest);
  if (digests.some((digest) => digest !== digests[0])) throw new Error("Conflicting asset SHA-256 digests");
  const integrities = [source.integrity, assetRequest?.integrity, appRequest?.integrity]
    .filter((value): value is AssetIntegrity => value !== undefined);
  if (integrities.some((item) => item.version !== 1 || (digests[0] && environmentDigest(item.digest) !== digests[0]))) {
    throw new Error("Asset hash does not match its integrity metadata");
  }
  if (integrities.some((item) => !equalEnvironmentIntegrity(integrities[0]!, item))) {
    throw new Error("Request integrity conflicts with the admitted asset");
  }
  if (assetRequest?.expectedUrl && appRequest?.expectedUrl && assetRequest.expectedUrl !== appRequest.expectedUrl) {
    throw new Error("Conflicting asset expected URLs");
  }
  const origins = assetRequest?.allowedOrigins && appRequest?.allowedOrigins
    ? assetRequest.allowedOrigins.filter((origin) => appRequest.allowedOrigins!.includes(origin))
    : assetRequest?.allowedOrigins ?? appRequest?.allowedOrigins;
  const limits = [maxEnvironmentBytes, assetRequest?.maxBytes, appRequest?.maxBytes].filter((value): value is number => value !== undefined);
  const integrity = integrities[0] ?? (digests[0] ? { version: 1 as const, digest: digests[0] } : undefined);
  return {
    ...assetRequest,
    ...appRequest,
    ...(origins ? { allowedOrigins: origins } : {}),
    ...(limits.length ? { maxBytes: Math.min(...limits) } : {}),
    ...(integrity ? { integrity, expectedUrl: appRequest?.expectedUrl ?? assetRequest?.expectedUrl ?? source.url } : {})
  };
}

function productionEnvironmentFormat(buffer: ArrayBuffer, format?: string): "exr" | "radiance" {
  const bytes = new Uint8Array(buffer);
  const exrMagic = bytes.length >= 4 && bytes[0] === 0x76 && bytes[1] === 0x2f && bytes[2] === 0x31 && bytes[3] === 0x01;
  const declared = format?.replace(/^\./, "").toLowerCase();
  if (declared && !["exr", "hdr", "rgbe", "radiance"].includes(declared)) {
    throw new Error(`Unsupported HDRI format: ${declared}`);
  }
  if (declared === "exr" && !exrMagic) throw new Error("HDRI declared EXR but does not contain an OpenEXR header");
  if (declared && declared !== "exr" && exrMagic) throw new Error("HDRI declared Radiance but contains OpenEXR data");
  return exrMagic ? "exr" : "radiance";
}

/** Decode Radiance or EXR into top-down, linear equirectangular RGBA pixels. */
export async function decodeProductionEnvironmentImage(buffer: ArrayBuffer, format?: string): Promise<LinearHdrEnvironmentMapSource> {
  if (productionEnvironmentFormat(buffer, format) === "exr") {
    const { parseEXR } = await import("@aura3d/assets/browser");
    const image = await parseEXR(buffer, { type: "float", outputFormat: "rgba" });
    if (!(image.data instanceof Float32Array)) throw new Error("EXR decoder did not return float RGBA pixels");
    // EXR texture output is device-row ordered. The equirectangular prefilter
    // uses the first row for +Y, matching Radiance's top-down scanlines.
    const data = new Float32Array(image.data.length);
    const rowLength = image.width * 4;
    for (let y = 0; y < image.height; y += 1) {
      data.set(image.data.subarray((image.height - 1 - y) * rowLength, (image.height - y) * rowLength), y * rowLength);
    }
    if (!data.every(Number.isFinite)) throw new Error("HDRI pixels must be finite");
    return { width: image.width, height: image.height, data };
  }
  const radiance = parseProductionRadianceHDR(buffer);
  return decodeRgbeEnvironmentMap({ width: radiance.width, height: radiance.height, data: radiance.rgbe });
}

async function loadProductionEnvironmentBytes(source: ProductionEnvironmentAsset, options: ProductionEnvironmentRequestOptions): Promise<ArrayBuffer> {
  const url = typeof source === "string" ? source : source.url;
  const buffer = await fetchBytes(url, options.signal, undefined, productionEnvironmentRequest(source, options.request));
  if (buffer.byteLength === 0) throw new Error("HDRI asset is empty");
  return buffer;
}

export async function loadProductionEnvironmentImage(source: ProductionEnvironmentAsset, options: ProductionEnvironmentRequestOptions = {}): Promise<LinearHdrEnvironmentMapSource> {
  const buffer = await loadProductionEnvironmentBytes(source, options);
  return decodeProductionEnvironmentImage(buffer, typeof source === "string" ? undefined : source.format);
}

async function loadProductionEnvironmentPipeline(
  source: ProductionEnvironmentAsset,
  options: ProductionEnvironmentRequestOptions,
  pipelineOptions: Parameters<typeof createProductionPbrHdrPipelineFromRadiance>[1]
) {
  const bytes = await loadProductionEnvironmentBytes(source, options);
  const format = typeof source === "string" ? undefined : source.format;
  if (productionEnvironmentFormat(bytes, format) === "radiance") {
    return createProductionPbrHdrPipelineFromRadiance(bytes, pipelineOptions);
  }
  const image = await decodeProductionEnvironmentImage(bytes, format);
  if (options.signal?.aborted) throw options.signal.reason ?? new Error("Environment load aborted");
  return createProductionPbrHdrPipelineFromLinear(image, pipelineOptions);
}

export async function upgradeProductionEnvironmentHdri(
  source: ProductionEnvironmentAsset,
  intensity: number,
  reflectionSource?: ProductionEnvironmentAsset,
  rotation?: number,
  options: ProductionEnvironmentRequestOptions = {}
): Promise<{
  readonly lighting: EnvironmentLightingOptions;
  readonly dispose: () => void;
  readonly maxLinearValue: number;
  readonly specularMipCount: number;
  readonly dualProbe: boolean;
}> {
  const clampIntensity = Math.max(0, intensity);
  const illumination = await loadProductionEnvironmentPipeline(source, options, {
    id: "root-hdri-environment",
    label: "Root HDRI environment",
    intensity: clampIntensity,
    ...(rotation !== undefined ? { rotation } : {})
  });
  if (options.signal?.aborted) throw options.signal.reason ?? new Error("Environment load aborted");
  if (!reflectionSource) {
    const resources = createProductionEnvironmentLightingResources(illumination);
    return {
      lighting: resources.lighting,
      dispose: resources.dispose,
      maxLinearValue: illumination.diagnostics.maxLinearValue,
      specularMipCount: illumination.diagnostics.specularMipCount,
      dualProbe: false
    };
  }
  const reflection = await loadProductionEnvironmentPipeline(reflectionSource, options, {
    id: "root-hdri-reflection-environment",
    label: "Root HDRI reflection environment",
    intensity: clampIntensity,
    ...(rotation !== undefined ? { rotation } : {})
  });
  if (options.signal?.aborted) throw options.signal.reason ?? new Error("Environment load aborted");
  const dual = createDualProbeEnvironmentLightingResources({ illumination, reflection });
  return {
    lighting: dual.lighting,
    dispose: dual.dispose,
    maxLinearValue: Math.max(illumination.diagnostics.maxLinearValue, reflection.diagnostics.maxLinearValue),
    specularMipCount: reflection.diagnostics.specularMipCount,
    dualProbe: true
  };
}

import { Geometry, IndexBuffer, InstancedPBRMaterial, PBRMaterial, VertexBuffer, VertexFormat, assignCustomAttributeLocations, customAttributeSemantic, type VertexAttributeDescriptor, type VertexAttributeType } from "@aura3d/rendering";
import { computeAuraGeometryBounds, computeAuraGeometryNormals, defineAuraCustomGeometry, normalizeGeometryAttributes } from "../RootGeometry.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import { instances } from "../nodes/instances.js";
import type { AuraMaterialSpec, AuraBuiltinPrimitive } from "../nodes/types.js";
import { renderer } from "../rendererDiagnostics.js";
import { scene } from "../nodes/scene.js";
import { colorToLinearRgb } from "../colorUtils.js";
import type { GltfBounds } from "../nodes/types/runtime.js";
import { createPlaneGeometry, createBoxGeometry, createSphereGeometry, createCylinderGeometry, createTorusGeometry, createCapsuleApproxGeometry, createQrPrimitiveMesh, instancedDefaultSegmentScale, instancedShadowSegmentScale, INSTANCED_SHADOW_PROXY_MIN_INSTANCES, qrPrimitiveGeometryKey, qrPrimitiveParamsPoolable, type QrPrimitiveGeometryOptions } from "./geometry.js";
import { clamp01 } from "../sceneMath.js";

/**
 * Build the production `PBRMaterial` for a primitive node.
 *
 * ## WS-2.1a — the parameter drop this function used to be
 *
 * Until 1.6 this forwarded `clearcoat` and **nothing else** from the extended material surface.
 * `AuraMaterialSpec` accepts `sheen`, `sheenRoughness`, `sheenColor`, `iridescence`,
 * `iridescenceIOR`, `iridescenceThicknessRange`, `anisotropy`, `anisotropyRotation`, `transmission`,
 * `thickness`, `ior`, `attenuationColor` and `attenuationDistance`; `PBRMaterial` accepts a uniform
 * for every one of them and binds them all. The bridge between the two dropped them on the floor.
 *
 * How that presented, measured by `tools/material-structural-parity` before the fix:
 *
 * ```
 * material.pbr({ ..., sheen: 1 })         -> byte-identical frame to sheen: 0
 * material.pbr({ ..., iridescence: 1 })   -> byte-identical frame to iridescence: 0
 * material.pbr({ ..., clearcoat: 1 })     -> byte-identical frame to clearcoat: 0
 * ```
 *
 * `clearcoat` was *forwarded* and still produced an identical frame, which pins the second, separate
 * defect: `a3dPbrExtensionEnvironmentLight` in `ShaderChunks.ts` adds its lobes to
 * `specularRadiance`, a term that is zero without an environment map. Forwarding alone is necessary
 * and not sufficient, so `environmentIntensity` now also has a floor when an extension factor is
 * present — otherwise a developer setting `clearcoat: 1` on a scene with no environment sees nothing
 * and has no way to find out why.
 *
 * The reason this survived so long is worth stating: three of the four lobes are scalar
 * approximations rather than real BRDFs, and **nobody could tell**, because the parameters never
 * arrived. The plumbing defect concealed the shading defect.
 */
interface ProductionPrimitiveScalars {
  readonly materialSpec: AuraMaterialSpec | undefined;
  readonly baseColor: readonly [number, number, number, number];
  readonly opacity: number;
  readonly emissiveColor: readonly [number, number, number];
  readonly clearcoat: number;
  readonly sheen: number;
  readonly iridescence: number;
  readonly anisotropy: number;
  readonly transmission: number;
  readonly thicknessRange: readonly [number, number] | undefined;
  readonly sheenColor: readonly [number, number, number];
  readonly declaresExtension: boolean;
  readonly environmentIntensity: number;
  /**
   * B3 per-material env-map response scale (muse3jsparity-PRD). Unlike
   * `environmentIntensity` (ambient only, and overwritten per-frame by the
   * scene environment), this reaches the sampled HDRI terms through the
   * `u_materialEnvironmentIntensity` uniform the forward pass never touches.
   */
  readonly envMapIntensity: number;
}

export function resolveProductionPrimitiveScalars(node: AuraPrimitiveNode): ProductionPrimitiveScalars {
  const materialSpec = node.material;
  const baseColor = colorToLinearRgba(materialSpec?.color ?? materialSpec?.emissive ?? "#d7dee8");
  const opacity = clamp01(materialSpec?.opacity ?? baseColor[3] ?? 1);
  const emissiveColor = materialSpec?.emissive ? colorToLinearRgb(materialSpec.emissive) : [0, 0, 0] as const;
  const clearcoat = clamp01(materialSpec?.clearcoat ?? 0);
  const sheen = clamp01(materialSpec?.sheen ?? 0);
  const iridescence = clamp01(materialSpec?.iridescence ?? 0);
  const anisotropy = clamp01(Math.abs(materialSpec?.anisotropy ?? 0));
  const transmission = clamp01(materialSpec?.transmission ?? 0);
  // The scalar and textured paths use the same validated endpoints.
  const [thicknessMinimum, thicknessMaximum] = resolveIridescenceThickness(materialSpec ?? {});
  const thicknessRange = thicknessMinimum === undefined && thicknessMaximum === undefined
    ? undefined
    : [thicknessMinimum ?? 100, thicknessMaximum ?? 400] as const;
  /*
   * Sheen colour defaults to the sheen strength as a white tint rather than to black.
   * `sheenColorFactor: [0,0,0]` multiplies the entire sheen lobe to zero, so `sheen: 1` with no
   * explicit colour would forward a factor and still render nothing — the same silent-no-op shape
   * this whole workstream exists to remove.
   */
  const sheenColor = materialSpec?.sheenColor
    ? colorToLinearRgb(materialSpec.sheenColor).map((channel) => channel * sheen) as [number, number, number]
    : ([sheen, sheen, sheen] as const);
  /*
   * The extension lobes are environment-driven. With `environmentIntensity: 0` a declared clearcoat,
   * sheen or iridescence factor reaches the shader and contributes exactly nothing, which is
   * indistinguishable from the parameter never arriving. A floor of 0.35 when any extension factor is
   * declared makes the declaration observable; scenes that declare none are unaffected.
   */
  const declaresExtension = clearcoat > 0 || sheen > 0 || iridescence > 0 || anisotropy > 0;
  const requestedEnvironmentIntensity = Math.max(0, materialSpec?.envMapIntensity ?? 0.75);
  const environmentIntensity = declaresExtension
    ? Math.max(0.35, requestedEnvironmentIntensity)
    : requestedEnvironmentIntensity;
  // B3: the sampled env-map scale defaults to 1 (no look change) and honors
  // an explicitly authored envMapIntensity, including 0 (killed response).
  const envMapIntensity = materialSpec?.envMapIntensity === undefined ? 1 : Math.max(0, materialSpec.envMapIntensity);
  return {
    materialSpec, baseColor, opacity, emissiveColor, clearcoat, sheen, iridescence,
    anisotropy, transmission, thicknessRange, sheenColor, declaresExtension, environmentIntensity, envMapIntensity
  };
}

/** Shared culling contract for primitive rendering and CPU scene queries. */
export function productionPrimitiveCullMode(node: AuraPrimitiveNode, opacity: number): "none" | "back" {
  return node.primitive === "plane" || node.material?.doubleSided === true || opacity < 0.999 ? "none" : "back";
}

const PRIMITIVE_BLEND_MODES: ReadonlySet<string> = new Set(["opaque", "alpha", "premultiplied", "additive", "multiply"]);

/**
 * S5-WP19-04: the authored alpha and render-state fields of `material.pbr/metal`
 * (`alphaMode`, `alphaCutoff`, `blend`, `depthWrite`) lower into the primitive's
 * render state and `u_alphaCutoff`. Without any of them the state is derived from
 * opacity exactly as before. `blend` wins over `alphaMode`; an explicit
 * `depthWrite: true` on a blended material is an authored opt-in.
 * `alphaToCoverage: true` requests MSAA alpha-to-coverage for a masked material.
 */
export function productionPrimitiveRenderState(node: AuraPrimitiveNode, opacity: number): {
  blend: boolean; depthWrite: boolean; cullMode: "none" | "back";
  blendMode?: NonNullable<NonNullable<AuraPrimitiveNode["material"]>["blend"]>; blendedDepthWrite?: "allow";
  alphaToCoverage?: true;
} {
  const spec = node.material;
  const blendMode = spec?.blend;
  if (blendMode !== undefined && !PRIMITIVE_BLEND_MODES.has(blendMode)) {
    throw new RangeError(`material blend must be one of ${[...PRIMITIVE_BLEND_MODES].join(", ")} (received ${String(blendMode)})`);
  }
  const blended = blendMode !== undefined ? blendMode !== "opaque"
    : spec?.alphaMode !== undefined ? spec.alphaMode === "blend"
      : opacity < 0.999;
  const depthWrite = spec?.depthWrite ?? !blended;
  return {
    blend: blended,
    ...(blendMode === undefined ? {} : { blendMode }),
    depthWrite,
    ...(blended && depthWrite ? { blendedDepthWrite: "allow" as const } : {}),
    // Same request the glTF MASK path makes (`renderStateForGLTFMaterial`): the
    // `prd04.alphaToCoverage` feature honours it for a masked material
    // (`u_alphaCutoff` > 0) on an MSAA tier and ignores it otherwise.
    ...(spec?.alphaToCoverage === true ? { alphaToCoverage: true as const } : {}),
    cullMode: productionPrimitiveCullMode(node, opacity)
  };
}

/**
 * S5-WP19-04: KHR_materials_specular / KHR_materials_dispersion factors of
 * `material.pbr/metal`. `undefined` when none is authored (defaults unchanged).
 */
export function productionPrimitiveSpecularOptions(spec: AuraPrimitiveNode["material"]): {
  specularFactor?: number; specularColorFactor?: readonly [number, number, number]; dispersion?: number;
} | undefined {
  if (spec?.specularIntensity === undefined && spec?.specularColor === undefined && spec?.dispersion === undefined) return undefined;
  return {
    ...(spec.specularIntensity === undefined ? {} : { specularFactor: clamp01(spec.specularIntensity) }),
    ...(spec.specularColor === undefined ? {} : { specularColorFactor: colorToLinearRgb(spec.specularColor) }),
    ...(spec.dispersion === undefined ? {} : { dispersion: Math.max(0, spec.dispersion) })
  };
}

/** glTF MASK semantics: `alphaCutoff` (default 0.5) discards below it; `alphaCutoff` alone implies mask. */
export function productionPrimitiveAlphaCutoff(node: AuraPrimitiveNode): number {
  const spec = node.material;
  const cutoff = spec?.alphaCutoff;
  if (cutoff !== undefined && (!Number.isFinite(cutoff) || cutoff < 0)) {
    throw new RangeError(`material alphaCutoff must be a finite number >= 0 (received ${String(cutoff)})`);
  }
  const masked = spec?.alphaMode === "mask" || (spec?.alphaMode === undefined && cutoff !== undefined);
  return masked ? cutoff ?? 0.5 : 0;
}

/**
 * S5-WP19-04: the GPU material label. An authored material `name` (`material.pbr({ name })`)
 * is appended so diagnostics, program labels and texture-upgrade rows name the material.
 */
export function productionPrimitiveMaterialLabel(prefix: string, node: AuraPrimitiveNode, resourceName?: string): string {
  const base = `${prefix}-${resourceName ?? `${node.primitive}${node.name ? `-${node.name}` : ""}`}`;
  const authored = node.material?.name;
  return typeof authored === "string" && authored.length > 0 ? `${base}:${authored}` : base;
}

export function createProductionPrimitiveMaterial(node: AuraPrimitiveNode): PBRMaterial | InstancedPBRMaterial | PortableShaderMaterial | UnlitMaterial | InstancedUnlitMaterial {
  const materialSpec = node.material;
  if (materialSpec?.kind === "depth-preview") {
    const extra = Object.keys(materialSpec).find((key) => key !== "kind" && key !== "depthPreview");
    if (extra) throw new Error(`DEPTH_PREVIEW_OPTION_UNSUPPORTED: material field '${extra}' is not supported`);
    if (!materialSpec.depthPreview) throw new Error("DEPTH_PREVIEW_OPTION_UNSUPPORTED: missing preview range");
    if (node.geometry?.topology && node.geometry.topology !== "triangles") {
      throw new Error("DEPTH_PREVIEW_GEOMETRY_UNSUPPORTED: only triangle geometry is supported");
    }
    if (node.text3D) throw new Error("DEPTH_PREVIEW_GEOMETRY_UNSUPPORTED: SDF text is not supported");
    if (node.instanceColors?.length) throw new Error("DEPTH_PREVIEW_OPTION_UNSUPPORTED: instance colors are not supported");
    return new DepthPreviewMaterial(materialSpec.depthPreview);
  }
  // parity:L1 (SH-02): `material.custom(spec)` routes to the portable-shader
  // adapter — a validated `PortableShaderMaterial`, never a PBR downgrade.
  if (materialSpec?.kind === "custom" && materialSpec.custom) {
    return createCustomShaderMaterial(materialSpec.custom, `primitive-${node.primitive}${node.name ? `-${node.name}` : ""}`);
  }
  const { baseColor, opacity, emissiveColor, clearcoat, sheenColor, declaresExtension, transmission, thicknessRange, sheen, iridescence, anisotropy, environmentIntensity, envMapIntensity } =
    resolveProductionPrimitiveScalars(node);
  // S5-WP19-04: `unlit: true` (KHR_materials_unlit semantics) draws the base colour and
  // opacity with the unlit programs, exactly as an imported unlit glTF material does
  // (GLTFRenderResources: UnlitMaterial / InstancedUnlitMaterial / TexturedUnlitMaterial).
  // Lighting-only factors have no effect on an unlit surface.
  if (materialSpec?.unlit === true) {
    const name = productionPrimitiveMaterialLabel("a3d-production-unlit-primitive", node);
    const color = [baseColor[0], baseColor[1], baseColor[2], opacity] as const;
    const renderState = productionPrimitiveRenderState(node, opacity);
    const unlit = node.instances ? new InstancedUnlitMaterial({ name, color, renderState }) : new UnlitMaterial({ name, color, renderState });
    const unlitCutoff = productionPrimitiveAlphaCutoff(node);
    if (unlitCutoff > 0) unlit.setParameter("u_alphaCutoff", unlitCutoff);
    return unlit;
  }
  /*
   * Native instance submission requires the renderer's instanced shader contract. The ordinary
   * PBR shader intentionally has no instance matrix inputs and ForwardPass therefore expands it.
   * Keep the full extension material for declarations that need its broader BRDF surface; the
   * root-safe instanced path selects the purpose-built lit material when every requested property
   * is represented by that shader. This makes the one-draw claim real without silently dropping
   * clearcoat/transmission/etc. (those continue to render correctly via expansion).
   */
  if (node.instances && !declaresExtension && transmission === 0 && thicknessRange === undefined && materialSpec?.thickness === undefined && materialSpec?.ior === undefined && materialSpec?.attenuationColor === undefined && materialSpec?.attenuationDistance === undefined && productionPrimitiveSpecularOptions(materialSpec) === undefined) {
    const instanced = new InstancedPBRMaterial({
      name: productionPrimitiveMaterialLabel("a3d-production-instanced-primitive", node),
      baseColor: [baseColor[0], baseColor[1], baseColor[2], opacity],
      metallic: clamp01(materialSpec?.metallic ?? materialSpec?.metalness ?? 0),
      roughness: clamp01(materialSpec?.roughness ?? 0.58),
      diffuseRoughness: materialSpec?.diffuseRoughness,
      retroreflection: materialSpec?.retroreflection,
      bumpFactor: materialSpec?.bumpFactor,
      emissiveColor,
      emissiveStrength: Math.max(0, materialSpec?.emissiveIntensity ?? (materialSpec?.emissive ? 1.35 : 0)),
      environmentIntensity,
      envMapIntensity,
      // threejs-parity L7/SR-02: forward the frozen `AuraMaterialSpec.fog` opt-out.
      fog: materialSpec?.fog,
      renderState: productionPrimitiveRenderState(node, opacity)
    });
    const instancedCutoff = productionPrimitiveAlphaCutoff(node);
    if (instancedCutoff > 0) instanced.setParameter("u_alphaCutoff", instancedCutoff);
    return instanced;
  }
  const lit = new PBRMaterial({
    name: productionPrimitiveMaterialLabel("a3d-production-primitive", node),
    baseColor: [baseColor[0], baseColor[1], baseColor[2], opacity],
    metallic: clamp01(materialSpec?.metallic ?? materialSpec?.metalness ?? 0),
    roughness: clamp01(materialSpec?.roughness ?? 0.58),
    diffuseRoughness: materialSpec?.diffuseRoughness,
    retroreflection: materialSpec?.retroreflection,
    bumpFactor: materialSpec?.bumpFactor,
    emissiveColor,
    emissiveStrength: Math.max(0, materialSpec?.emissiveIntensity ?? (materialSpec?.emissive ? 1.35 : 0)),
    clearcoatFactor: clearcoat,
    clearcoatRoughnessFactor: clamp01(materialSpec?.clearcoatRoughness ?? 0.34),
    // WS-2.1a: everything below this line was previously dropped.
    sheenColorFactor: sheenColor,
    sheenRoughnessFactor: clamp01(materialSpec?.sheenRoughness ?? 0.3),
    anisotropyStrength: anisotropy,
    anisotropyRotation: materialSpec?.anisotropyRotation ?? 0,
    iridescenceFactor: iridescence,
    iridescenceIor: materialSpec?.iridescenceIOR ?? 1.3,
    ...(thicknessRange ? { iridescenceThicknessMinimum: thicknessRange[0], iridescenceThicknessMaximum: thicknessRange[1] } : {}),
    transmissionFactor: transmission,
    ...(materialSpec?.thickness === undefined ? {} : { volumeThicknessFactor: Math.max(0, materialSpec.thickness) }),
    ...(materialSpec?.ior === undefined ? {} : { ior: Math.max(1, materialSpec.ior) }),
    ...(materialSpec?.attenuationColor ? { volumeAttenuationColor: colorToLinearRgb(materialSpec.attenuationColor) } : {}),
    ...(materialSpec?.attenuationDistance === undefined ? {} : { volumeAttenuationDistance: Math.max(0, materialSpec.attenuationDistance) }),
    ...productionPrimitiveSpecularOptions(materialSpec),
    environmentIntensity,
    envMapIntensity,
    // threejs-parity L7/SR-02: forward the frozen `AuraMaterialSpec.fog` opt-out.
    fog: materialSpec?.fog,
    renderState: productionPrimitiveRenderState(node, opacity)
  });
  const cutoff = productionPrimitiveAlphaCutoff(node);
  if (cutoff > 0) lit.setParameter("u_alphaCutoff", cutoff);
  return lit;
}

/**
 * threejs-parity L2 (§6 L2-01/02): every `AuraBuiltinPrimitive` kind now maps
 * onto a real `createPrimitiveGeometry` generator — no fail-closed dispatch
 * remains. `"custom"` still resolves through the geometry-spec path.
 */
function qrBuiltinPrimitive(primitive: AuraBuiltinPrimitive): import("./geometry.js").QrBuiltinPrimitive {
  switch (primitive) {
    case "box": case "sphere": case "plane": case "cylinder": case "capsule": case "torus":
    case "cone": case "circle": case "ring": case "tube": case "lathe": case "extrude": case "shape":
    case "torusKnot": case "polyhedron": case "roundedBox":
      return primitive;
    default:
      throw new AuraRuntimeError(
        "parity-not-implemented",
        `Aura3D primitive "${String(primitive)}" is not implemented (A3D_PARITY_GEOMETRY). See docs/workflows/threejs-parity-gaps.md.`
      );
  }
}

/** Q-15-2: the flag-on mesh for a builtin primitive node; undefined = legacy path (flag off, custom, geometry spec). */
export function qrPrimitiveMeshFor(node: AuraPrimitiveNode, qr: QrPrimitiveGeometryOptions | undefined): ProductionPrimitiveMesh | undefined {
  if (!qr?.core || node.geometry || node.primitive === "custom") return undefined;
  return createQrPrimitiveMesh(qrBuiltinPrimitive(node.primitive), primitiveSize(node), qr, node.params);
}

/** Q-15-2: flag-on geometry + bounds, pooled per mount when `qr.pool` is set (#545). */
/** Dense instanced nodes shrink their default tessellation (see `instancedDefaultSegmentScale`); explicit segment params are unaffected. */
function withInstancedTessellation(node: AuraPrimitiveNode, qr: QrPrimitiveGeometryOptions, purpose: "view" | "shadow" = "view"): QrPrimitiveGeometryOptions {
  const count = node.instances?.length;
  if (count === undefined || count <= 64 || node.primitive === "custom") return qr;
  let fullTriangles = 0;
  let full: Geometry | undefined;
  try {
    full = createPrimitiveGeometry(qrBuiltinPrimitive(node.primitive), node.params as AuraParityPrimitiveParams | undefined, { primitiveSegments: qr.primitiveSegments ?? "full" });
    fullTriangles = (full.indexBuffer?.count ?? full.vertexBuffer.vertexCount) / 3;
  } catch {
    return qr;
  } finally {
    full?.dispose();
  }
  const scale = purpose === "shadow" ? instancedShadowSegmentScale(count, fullTriangles, node.primitive) : instancedDefaultSegmentScale(count, fullTriangles);
  return scale === 1 ? qr : { ...qr, defaultSegmentScale: scale };
}

/**
 * `globalThis.__A3D_SHADOW_PROXY__ = "off"` (or `?shadowproxy=off`) opts a page out of shadow proxy geometry; the default is on.
 * Read at mount, like `?shadowfit=`.
 */
export function shadowProxyEnabled(): boolean {
  const g = globalThis as { __A3D_SHADOW_PROXY__?: string; location?: { search?: string } };
  let value = g.__A3D_SHADOW_PROXY__;
  try {
    const q = typeof g.location?.search === "string" ? new URLSearchParams(g.location.search).get("shadowproxy") : null;
    if (q === "on" || q === "off") value = q;
  } catch {
    // no location (node, workers): fall through to the global
  }
  return value !== "off";
}

/** Offstage convention shared with `sceneShadowRadius`: anything at world y <= -50 is parked, not drawn. */
const PARKED_Y = -50;

/**
 * Instances of a node that are on stage (SI-7): pools park unused slots far below the stage
 * (dot-dash rails: 900 slots at y -999) or at scale 0, so pool capacity is not the number of
 * shadow casters. Thresholds compare this count, never `instances.length`.
 */
export function liveInstanceCount(node: { readonly position?: readonly number[] | undefined; readonly instances?: readonly { readonly position?: readonly number[] | undefined; readonly scale?: number | readonly number[] | undefined }[] | undefined }): number {
  const instances = node.instances;
  if (!Array.isArray(instances)) return 0;
  const baseY = Array.isArray(node.position) ? (node.position[1] ?? 0) : 0;
  let live = 0;
  for (const instance of instances) {
    if (baseY + (instance.position?.[1] ?? 0) <= PARKED_Y) continue;
    const scale = instance.scale;
    if (scale === 0 || (Array.isArray(scale) && scale.some((value) => value === 0))) continue;
    live += 1;
  }
  return live;
}

const triangleCount = (geometry: Geometry): number => (geometry.indexBuffer?.count ?? geometry.vertexBuffer.vertexCount) / 3;

/**
 * Coarser stand-in geometry for the shadow depth passes of an instanced, shadow-casting builtin primitive (see `RenderItem.shadowGeometry`).
 *
 * Eligibility, all required:
 * - the node casts shadows, is a builtin primitive (not `custom`, no authored `geometry`), and the quality-rebuild core path is on;
 * - it carries at least `INSTANCED_SHADOW_PROXY_MIN_INSTANCES` (1,024) live instances (parked pool slots do not count, SI-7);
 * - the page has not opted out (`shadowproxy=off`);
 * - the proxy is strictly cheaper than the camera geometry (kinds whose tessellation ignores the segment scale, such as boxes, never get one).
 * Authored segment params always win, exactly as for the camera geometry.
 */
export function qrPrimitiveShadowGeometryFor(node: AuraPrimitiveNode, mountQr: QrPrimitiveGeometryOptions | undefined, viewGeometry?: Geometry): Geometry | undefined {
  if (!mountQr?.core || node.geometry || node.primitive === "custom" || !node.castShadow) return undefined;
  if (node.instances === undefined) return undefined;
  const count = liveInstanceCount(node);
  if (count < INSTANCED_SHADOW_PROXY_MIN_INSTANCES || !shadowProxyEnabled()) return undefined;
  const viewScale = withInstancedTessellation(node, mountQr).defaultSegmentScale ?? 1;
  const qr = withInstancedTessellation(node, mountQr, "shadow");
  if ((qr.defaultSegmentScale ?? 1) >= viewScale) return undefined;
  const size = primitiveSize(node);
  const primitive = qrBuiltinPrimitive(node.primitive);
  return withPrimitiveConstruction((own) => {
    const proxy = !qr.pool || !qrPrimitiveParamsPoolable(node.params)
      ? createProductionGeometryFromPrimitiveMesh(createQrPrimitiveMesh(primitive, size, qr, node.params))
      : qr.pool.acquire(qrPrimitiveGeometryKey(primitive, size, qr, node.params), () =>
        createProductionGeometryFromPrimitiveMesh(createQrPrimitiveMesh(primitive, size, qr, node.params)));
    own(() => proxy.dispose());
    if (viewGeometry && triangleCount(proxy) >= triangleCount(viewGeometry)) {
      proxy.dispose();
      return undefined;
    }
    // Evidence for audits (tests/browser/shadow-proxy-ab.spec.ts): which nodes of a page got a proxy, and how much cheaper it is.
    const record = (globalThis as { __A3D_SHADOW_PROXIES__?: unknown[] });
    (record.__A3D_SHADOW_PROXIES__ ??= []).push({ node: node.name ?? node.primitive, primitive: node.primitive, instances: count, cameraTriangles: viewGeometry ? triangleCount(viewGeometry) : null, proxyTriangles: triangleCount(proxy) });
    return proxy;
  });
}

export function qrPrimitiveGeometryFor(node: AuraPrimitiveNode, mountQr: QrPrimitiveGeometryOptions | undefined): { readonly geometry: Geometry; readonly bounds: GltfBounds } | undefined {
  if (!mountQr?.core || node.geometry || node.primitive === "custom") return undefined;
  const qr = withInstancedTessellation(node, mountQr);
  const size = primitiveSize(node);
  // L2: params carrying live curve/shape objects can't key a shared pool entry.
  if (!qr.pool || !qrPrimitiveParamsPoolable(node.params)) {
    const mesh = createQrPrimitiveMesh(qrBuiltinPrimitive(node.primitive), size, qr, node.params);
    return { geometry: createProductionGeometryFromPrimitiveMesh(mesh), bounds: mesh.bounds };
  }
  const primitive = qrBuiltinPrimitive(node.primitive);
  const geometry = qr.pool.acquire(qrPrimitiveGeometryKey(primitive, size, qr, node.params), () =>
    createProductionGeometryFromPrimitiveMesh(createQrPrimitiveMesh(primitive, size, qr, node.params)));
  return { geometry, bounds: geometry.bounds };
}

export function createProductionPrimitiveGeometry(node: AuraPrimitiveNode): Geometry {
  if (node.geometry) return createProductionGeometryFromCustomSpec(node.geometry);
  if (node.primitive === "custom") throw new Error("Aura3D custom primitive requires geometry.");
  return createProductionGeometryFromPrimitiveMesh(createProductionPrimitiveMesh(node.primitive, node));
}

export function primitiveGeometryBounds(nodeOrPrimitive: AuraPrimitiveNode | AuraBuiltinPrimitive): GltfBounds {
  if (typeof nodeOrPrimitive === "object" && nodeOrPrimitive.geometry) return customGeometryBounds(nodeOrPrimitive.geometry);
  const primitive = typeof nodeOrPrimitive === "string" ? nodeOrPrimitive : nodeOrPrimitive.primitive;
  if (primitive === "custom") throw new Error("Aura3D custom primitive requires geometry.");
  return createProductionPrimitiveMesh(primitive, typeof nodeOrPrimitive === "object" ? nodeOrPrimitive : undefined).bounds;
}

/**
 * Production primitive mesh (muse3jsparity-PRD C1). uvs/uv1s are optional:
 * generators that provide them opt into textured materials; uv1 is a
 * procedural 2x tiling unwrap of uv0 (documented) so the native texCoord
 * selector has two distinct sets to choose between.
 */
export interface ProductionPrimitiveMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly bounds: GltfBounds;
  /** threejs-parity L2: `"lines"`/`"points"` topologies (edges/wireframe paths). Default `"triangles"`. */
  readonly topology?: "triangles" | "lines" | "points";
  /** threejs-parity L2: three's geometry.groups — material-index index ranges. */
  readonly groups?: readonly { readonly start: number; readonly count: number; readonly materialIndex?: number }[];
  /** threejs-parity L2: three's setDrawRange. */
  readonly drawRange?: { readonly start: number; readonly count: number };
  readonly uvs?: Float32Array;
  readonly uv1s?: Float32Array;
  /**
   * Axis-aligned analytic tangents (vec4 per vertex, w = handedness) for the
   * textured material contract. Generators with uvs provide these.
   */
  readonly tangents?: Float32Array;
}

export function tilingSecondUnwrap(uvs: Float32Array): Float32Array {
  const uv1s = new Float32Array(uvs.length);
  for (let i = 0; i < uvs.length; i += 1) uv1s[i] = (uvs[i] ?? 0) * 2;
  return uv1s;
}

/**
 * Legacy (flag-off) primitive mesh. The six original kinds keep their bespoke
 * generators byte-for-byte; the ten threejs-parity L2 kinds route through the
 * shared `createPrimitiveGeometry` factory with the node's params.
 */
function createProductionPrimitiveMesh(primitive: AuraBuiltinPrimitive, node?: AuraPrimitiveNode): ProductionPrimitiveMesh {
  if (primitive === "sphere") return createSphereGeometry();
  if (primitive === "capsule") return createCapsuleApproxGeometry();
  if (primitive === "torus") return createTorusGeometry();
  if (primitive === "box") return createBoxGeometry();
  if (primitive === "cylinder") return createCylinderGeometry();
  if (primitive === "plane") return createPlaneGeometry();
  // threejs-parity L2: the ten new kinds share the QR generator path (full
  // segments — the C-27 tier halving only applies under A3D_QR_CORE).
  const size = node ? primitiveSize(node) : [1, 1, 1] as const;
  return createQrPrimitiveMesh(qrBuiltinPrimitive(primitive), size, { core: true, primitiveSegments: "full" }, node?.params);
}

/**
 * SG-05 (threejs-parity L2): custom/dynamic specs normalize flat or tuple
 * attributes, optional colors, `"lines"` topology (edges/wireframe), groups,
 * drawRange and morph targets onto the production `Geometry`.
 */
function createProductionGeometryFromCustomSpec(spec: AuraCustomGeometrySpec): Geometry {
  const normalized = normalizeGeometryAttributes(spec);
  const normals = resolveSpecNormals(spec, normalized);
  const vertexCount = normalized.vertexCount;
  const attributes: VertexAttributeDescriptor[] = [
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "normal", components: 3, offset: 12 }
  ];
  let cursor = 24;
  if (normalized.uvs) { attributes.push({ semantic: "uv", components: 2, offset: cursor }); cursor += 8; }
  if (normalized.uv1s) { attributes.push({ semantic: "uv1", components: 2, offset: cursor }); cursor += 8; }
  if (normalized.colors) { attributes.push({ semantic: "color", components: 4, offset: cursor }); cursor += 16; }
  // R-23: custom attributes follow the built-ins in name order and bind by
  // their GLSL name; locations come from the stable pool.
  const customLocations = assignCustomAttributeLocations(normalized.custom.map((entry) => entry.name));
  for (const entry of normalized.custom) {
    const layout = customAttributeLayout(spec.attributes![entry.name]!);
    cursor = alignVertexOffset(cursor, Math.min(4, layout.bytes * entry.itemSize));
    attributes.push({
      semantic: customAttributeSemantic(entry.name),
      components: entry.itemSize,
      offset: cursor,
      type: layout.type,
      normalized: layout.normalized,
      shaderName: entry.name,
      shaderLocation: customLocations.get(entry.name)!
    });
    cursor += entry.itemSize * layout.bytes;
  }
  return withPrimitiveConstruction((own) => {
    const vertices = new VertexBuffer(new VertexFormat(attributes, alignVertexOffset(cursor, 4)), vertexCount);
    let geometry: Geometry | undefined;
    own(() => { if (geometry) geometry.dispose(); else vertices.dispose(); });
    for (let index = 0; index < vertexCount; index += 1) {
      vertices.setAttribute(index, "position", [normalized.positions[index * 3]!, normalized.positions[index * 3 + 1]!, normalized.positions[index * 3 + 2]!]);
      vertices.setAttribute(index, "normal", [normals[index * 3]!, normals[index * 3 + 1]!, normals[index * 3 + 2]!]);
      if (normalized.uvs) vertices.setAttribute(index, "uv", [normalized.uvs[index * 2]!, normalized.uvs[index * 2 + 1]!]);
      if (normalized.uv1s) vertices.setAttribute(index, "uv1", [normalized.uv1s[index * 2]!, normalized.uv1s[index * 2 + 1]!]);
      if (normalized.colors) vertices.setAttribute(index, "color", [normalized.colors[index * 4]!, normalized.colors[index * 4 + 1]!, normalized.colors[index * 4 + 2]!, normalized.colors[index * 4 + 3]!]);
    }
    for (const entry of normalized.custom) writeCustomAttribute(vertices, entry, spec.attributes![entry.name]!);
    const indexBuffer = normalized.indices ? new IndexBuffer(Array.from(normalized.indices), vertexCount) : null;
    if (indexBuffer) own(() => { if (!geometry) indexBuffer.dispose(); });
    geometry = new Geometry(vertices, indexBuffer, spec.topology === "lines" ? "lines" : spec.topology === "points" ? "points" : "triangles", customGeometryBounds(spec));
    if (spec.groups) geometry.groups = [...spec.groups];
    if (spec.drawRange) geometry.drawRange = { ...spec.drawRange };
    if (spec.morphTargets) geometry.morphTargets = spec.morphTargets.map((target) => ({ ...target }));
    return geometry;
  });
}

/** Authored normals, else computed; lines and points use a constant +Y. */
function resolveSpecNormals(spec: AuraCustomGeometrySpec, normalized: ReturnType<typeof normalizeGeometryAttributes>): Float32Array {
  if (normalized.normals) return normalized.normals;
  if (spec.topology === "points" || spec.topology === "lines") {
    const up = new Float32Array(normalized.positions.length);
    for (let i = 1; i < up.length; i += 3) up[i] = 1;
    return up;
  }
  return computeAuraGeometryNormals({ positions: normalized.positions, indices: normalized.indices });
}

function customGeometryBounds(spec: AuraCustomGeometrySpec): GltfBounds {
  if (spec.bounds) return { min: spec.bounds.min, max: spec.bounds.max };
  const computed = computeAuraGeometryBounds({ positions: spec.positions });
  return { min: computed.min, max: computed.max };
}

function createProductionGeometryFromPrimitiveMesh(mesh: ProductionPrimitiveMesh): Geometry {
  const vertexCount = mesh.positions.length / 3;
  const textured = Boolean(
    mesh.uvs && mesh.uvs.length === vertexCount * 2
    && mesh.tangents && mesh.tangents.length === vertexCount * 4
  );
  return withPrimitiveConstruction((own) => {
    const vertices = new VertexBuffer(textured ? VertexFormat.P3N3T4T2T2 : VertexFormat.P3N3, vertexCount);
    let geometry: Geometry | undefined;
    own(() => { if (geometry) geometry.dispose(); else vertices.dispose(); });
    for (let index = 0; index < vertexCount; index += 1) {
      const base = index * 3;
      vertices.setAttribute(index, "position", [mesh.positions[base] ?? 0, mesh.positions[base + 1] ?? 0, mesh.positions[base + 2] ?? 0]);
      vertices.setAttribute(index, "normal", [mesh.normals[base] ?? 0, mesh.normals[base + 1] ?? 1, mesh.normals[base + 2] ?? 0]);
      if (textured) {
        const uvBase = index * 2;
        const tangentBase = index * 4;
        vertices.setAttribute(index, "tangent", [
          mesh.tangents![tangentBase] ?? 1, mesh.tangents![tangentBase + 1] ?? 0,
          mesh.tangents![tangentBase + 2] ?? 0, mesh.tangents![tangentBase + 3] ?? 1
        ]);
        vertices.setAttribute(index, "uv", [mesh.uvs![uvBase] ?? 0, mesh.uvs![uvBase + 1] ?? 0]);
        const uv1 = mesh.uv1s && mesh.uv1s.length === vertexCount * 2 ? mesh.uv1s : mesh.uvs!;
        vertices.setAttribute(index, "uv1", [uv1[uvBase] ?? 0, uv1[uvBase + 1] ?? 0]);
      }
    }
    const indexBuffer = new IndexBuffer(Array.from(mesh.indices), vertexCount);
    own(() => { if (!geometry) indexBuffer.dispose(); });
    geometry = new Geometry(vertices, indexBuffer, mesh.topology ?? "triangles", mesh.bounds);
    // threejs-parity L2: carry three's groups/drawRange through to the draw path.
    if (mesh.groups) geometry.groups = [...mesh.groups];
    if (mesh.drawRange) geometry.drawRange = { ...mesh.drawRange };
    return geometry;
  });
}

// ── threejs-parity L2 (SG-05): runtime dynamic geometry ──────────────────────

/** Queued partial attribute write produced by `handle.updateAttribute` (region parity:L2). */
export interface AuraL2AttributeUpdate {
  readonly name: string;
  readonly array: Float32Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | readonly number[];
  readonly offset: number;
}

/** Per-resource tracking for the runtime geometry/attribute channels. */
interface L2ResourceTrack {
  __parityL2AppliedGeometry?: AuraCustomGeometrySpec | undefined;
}

const L2_UPDATE_SEMANTICS: Record<string, "position" | "normal" | "uv" | "uv1" | "color" | "tangent"> = {
  position: "position",
  positions: "position",
  normal: "normal",
  normals: "normal",
  uv: "uv",
  uv0: "uv",
  uvs: "uv",
  uv1: "uv1",
  uv1s: "uv1",
  color: "color",
  colors: "color",
  tangent: "tangent",
  tangents: "tangent"
};

const L2_INTEGER_STORAGE_RANGES: Partial<Record<VertexAttributeType, readonly [number, number]>> = {
  int8: [-128, 127], uint8: [0, 255], int16: [-32768, 32767], uint16: [0, 65535],
  int32: [-2147483648, 2147483647], uint32: [0, 4294967295]
};

/**
 * SG-05: apply `handle.setGeometry` + `handle.updateAttribute` writes to the
 * live resource. Same vertex count + same attribute set ⇒ write into the
 * existing `VertexBuffer` (dirty ranges flush on the next `upload()` — the
 * GPU allocation is never re-created). A different vertex count or attribute
 * footprint rebuilds the `Geometry` once (realloc allowed then).
 */
function syncRuntimePrimitiveGeometry(
  resource: ProductionRuntimePrimitiveResource,
  node: AuraPrimitiveNode & { readonly __parityL2AttributeUpdates?: readonly AuraL2AttributeUpdate[] }
): void {
  const tracked = resource as ProductionRuntimePrimitiveResource & L2ResourceTrack & {
    geometry?: Geometry;
    bounds?: GltfBounds;
    sourceNode?: AuraPrimitiveNode;
  };
  const spec = node.geometry;
  // `__parityL2AppliedGeometry` is tagged at resource build — `handle.setGeometry`
  // also mutates `node.geometry` in place, so `sourceNode.geometry` can NOT
  // serve as the applied marker (it already holds the new spec).
  if (spec !== undefined && spec !== tracked.__parityL2AppliedGeometry) {
    applyDynamicGeometrySpec(resource, spec);
    tracked.__parityL2AppliedGeometry = spec;
    if (tracked.sourceNode) tracked.sourceNode = { ...tracked.sourceNode, geometry: spec };
  }
  const updates = node.__parityL2AttributeUpdates;
  if (updates) {
    let positionsChanged = false;
    for (const update of updates) {
      positionsChanged = applyAttributeUpdateToGeometry(resource.geometry, update, spec) || positionsChanged;
    }
    if (positionsChanged) {
      // Authored bounds describe the original positions, not subsequent writes.
      // Derive new bounds from all current vertices so culling and matrix caches
      // receive the same result as the actual buffer, including partial edits.
      tracked.bounds = resource.geometry.refreshBounds();
    }
  }
}

function applyDynamicGeometrySpec(resource: ProductionRuntimePrimitiveResource, spec: AuraCustomGeometrySpec): void {
  const tracked = resource as ProductionRuntimePrimitiveResource & L2ResourceTrack & {
    geometry?: Geometry;
    bounds?: GltfBounds;
  };
  const normalized = normalizeGeometryAttributes(spec);
  const geometry = resource.geometry;
  let vertexBuffer = geometry.vertexBuffer;
  const has = (semantic: "position" | "normal" | "uv" | "uv1" | "color" | "tangent") => vertexBuffer.format.hasAttribute(semantic);
  const sameFootprint = vertexBuffer.vertexCount === normalized.vertexCount
    && has("uv") === (normalized.uvs !== undefined)
    && has("uv1") === (normalized.uv1s !== undefined)
    && has("color") === (normalized.colors !== undefined)
    && customFootprintMatches(vertexBuffer, normalized.custom, spec)
    && geometry.topology === (spec.topology ?? "triangles")
    && vertexBuffer.format.hasAttribute("normal")
    && !has("tangent");
  const normals = resolveSpecNormals(spec, normalized);

  if (sameFootprint) {
    // In-place path (L2-04): attribute writes mark byte ranges dirty; the next
    // upload() flushes only those ranges. Detach first when a peer owns the
    // same storage, so a node-local edit cannot alter another scene resource.
    const previousIndex = geometry.indexBuffer;
    const requiresWideIndices = normalized.indices !== undefined && normalized.indices.some((index) => index > 65535);
    const updateExistingIndex = normalized.indices !== undefined && previousIndex !== null
      && normalized.indices.length === previousIndex.count && (!requiresWideIndices || previousIndex.type === "uint32");
    geometry.ensureWritableBuffers({ vertex: true, index: updateExistingIndex });
    vertexBuffer = geometry.vertexBuffer;
    for (let index = 0; index < normalized.vertexCount; index += 1) {
      vertexBuffer.setAttribute(index, "position", [normalized.positions[index * 3]!, normalized.positions[index * 3 + 1]!, normalized.positions[index * 3 + 2]!]);
      vertexBuffer.setAttribute(index, "normal", [normals[index * 3]!, normals[index * 3 + 1]!, normals[index * 3 + 2]!]);
      if (normalized.uvs) vertexBuffer.setAttribute(index, "uv", [normalized.uvs[index * 2]!, normalized.uvs[index * 2 + 1]!]);
      if (normalized.uv1s) vertexBuffer.setAttribute(index, "uv1", [normalized.uv1s[index * 2]!, normalized.uv1s[index * 2 + 1]!]);
      if (normalized.colors) vertexBuffer.setAttribute(index, "color", [normalized.colors[index * 4]!, normalized.colors[index * 4 + 1]!, normalized.colors[index * 4 + 2]!, normalized.colors[index * 4 + 3]!]);
    }
    for (const entry of normalized.custom) writeCustomAttribute(vertexBuffer, entry, spec.attributes![entry.name]!);
    if (normalized.indices && updateExistingIndex) {
      geometry.indexBuffer!.setIndices(0, normalized.indices);
    } else if (normalized.indices) {
      // Same vertex count but a different index count still fits the existing
      // vertex allocation; only the index buffer is swapped.
      const nextIndex = new IndexBuffer(Array.from(normalized.indices), normalized.vertexCount);
      try { geometry.replaceIndexBuffer(nextIndex); }
      catch (error) {
        // A failed transfer must not leak its new allocation. A cleanup error
        // after a successful transfer leaves the geometry owning that buffer.
        let retained = false;
        try { retained = geometry.indexBuffer === nextIndex; } catch { /* Disposed geometry cannot retain a new stream. */ }
        if (!retained) { try { nextIndex.dispose(); } catch { /* Preserve the transfer error. */ } }
        throw error;
      }
    } else if (geometry.indexBuffer) {
      geometry.replaceIndexBuffer(null);
    }
    const bounds = spec.bounds ? { min: spec.bounds.min, max: spec.bounds.max } : computeAuraGeometryBounds({ positions: normalized.positions });
    (geometry as { bounds: GltfBounds }).bounds = { min: [...bounds.min] as AuraVec3, max: [...bounds.max] as AuraVec3 };
    geometry.groups = spec.groups ? [...spec.groups] : undefined;
    geometry.drawRange = spec.drawRange ? { ...spec.drawRange } : undefined;
    geometry.morphTargets = spec.morphTargets ? spec.morphTargets.map((target) => ({ ...target })) : undefined;
    tracked.bounds = { min: [...bounds.min] as AuraVec3, max: [...bounds.max] as AuraVec3 };
    return;
  }

  // Realloc path: different vertex count, attribute footprint, or topology.
  const next = createProductionGeometryFromCustomSpec(spec);
  geometry.dispose();
  tracked.geometry = next;
  tracked.bounds = { min: [...next.bounds.min] as AuraVec3, max: [...next.bounds.max] as AuraVec3 };
}

type CustomVertexEntry = ReturnType<typeof normalizeGeometryAttributes>["custom"][number];
type CustomVertexSource = NonNullable<AuraCustomGeometrySpec["attributes"]>[string];

/**
 * WebGPU's float shader inputs support normalized 8/16-bit pairs and quads.
 * Other integer layouts are decoded to float32 so the same root scene remains
 * usable on both backends (including scalar/vec3 and 32-bit components).
 */
function customAttributeLayout(source: CustomVertexSource): { type: VertexAttributeType; normalized: boolean; bytes: number } {
  const raw = source.data;
  if (source.normalized && (source.itemSize === 2 || source.itemSize === 4)) {
    if (raw instanceof Int8Array) return { type: "int8", normalized: true, bytes: 1 };
    if (raw instanceof Uint8Array) return { type: "uint8", normalized: true, bytes: 1 };
    if (raw instanceof Int16Array) return { type: "int16", normalized: true, bytes: 2 };
    if (raw instanceof Uint16Array) return { type: "uint16", normalized: true, bytes: 2 };
  }
  return { type: "float32", normalized: false, bytes: 4 };
}

function alignVertexOffset(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

/** Write one source attribute, preserving raw integer storage when supported. */
function writeCustomAttribute(vertexBuffer: VertexBuffer, entry: CustomVertexEntry, source: CustomVertexSource): void {
  const { name, itemSize } = entry;
  const semantic = customAttributeSemantic(name);
  const nativeInteger = vertexBuffer.format.getAttribute(semantic).type !== "float32";
  const sourceStride = source.stride ?? itemSize;
  const sourceOffset = source.offset ?? 0;
  const elements = entry.data.length / itemSize;
  const scratch: number[] = new Array(itemSize);
  for (let element = 0; element < elements; element += 1) {
    for (let component = 0; component < itemSize; component += 1) {
      scratch[component] = nativeInteger
        ? source.data[element * sourceStride + sourceOffset + component]!
        : entry.data[element * itemSize + component]!;
    }
    vertexBuffer.setAttribute(element, semantic, scratch);
  }
}

/** Reuse the allocation only when attribute storage and conversion agree. */
function customFootprintMatches(vertexBuffer: VertexBuffer, custom: readonly CustomVertexEntry[], spec: AuraCustomGeometrySpec): boolean {
  const live = vertexBuffer.format.attributes.filter((attribute) => String(attribute.semantic).startsWith("custom:"));
  if (live.length !== custom.length) return false;
  return custom.every((entry) => {
    const semantic = customAttributeSemantic(entry.name);
    if (!vertexBuffer.format.hasAttribute(semantic)) return false;
    const attribute = vertexBuffer.format.getAttribute(semantic);
    const layout = customAttributeLayout(spec.attributes![entry.name]!);
    return attribute.components === entry.itemSize && attribute.type === layout.type && attribute.normalized === layout.normalized;
  });
}

/** SG-05 `updateAttribute`: partial write by element offset — dirty-ranged, never reallocates. */
function applyAttributeUpdateToGeometry(geometry: Geometry, update: AuraL2AttributeUpdate, spec?: AuraCustomGeometrySpec): boolean {
  // R-23: exact-name custom attributes win; validated names never collide with the built-in aliases.
  const customSemantic = customAttributeSemantic(update.name);
  const semantic = geometry.vertexBuffer.format.hasAttribute(customSemantic) ? customSemantic : L2_UPDATE_SEMANTICS[update.name.toLowerCase()];
  if (!semantic) {
    throw new Error(`Aura3D updateAttribute name "${update.name}" is not a writable vertex semantic (position/normal/uv/uv1/color/tangent) or a custom attribute on this geometry.`);
  }
  let vertexBuffer = geometry.vertexBuffer;
  if (!vertexBuffer.format.hasAttribute(semantic)) {
    throw new Error(`Aura3D updateAttribute("${update.name}") — the live geometry has no "${semantic}" attribute.`);
  }
  const components = vertexBuffer.format.getAttribute(semantic).components;
  const data = update.array;
  if (data.length % components !== 0) {
    throw new Error(`Aura3D updateAttribute("${update.name}") array length must be a multiple of ${components}.`);
  }
  if (!Number.isInteger(update.offset) || update.offset < 0) {
    throw new Error(`Aura3D updateAttribute("${update.name}") offset must be a non-negative integer vertex index.`);
  }
  const start = update.offset;
  const elements = data.length / components;
  if (start + elements > vertexBuffer.vertexCount) {
    throw new Error(`Aura3D updateAttribute("${update.name}") overruns the vertex buffer (${vertexBuffer.vertexCount} vertices).`);
  }
  const scratch: number[] = new Array(components);
  const source = spec?.attributes?.[update.name];
  const storageType = vertexBuffer.format.getAttribute(semantic).type;
  const nativeInteger = storageType !== "float32";
  const convert = source ? attributeUpdateConverter(source, update.name, nativeInteger) : (value: number) => value;
  const checked = (input: number): number => {
    const value = convert(input);
    const range = L2_INTEGER_STORAGE_RANGES[storageType];
    if (!Number.isFinite(value) || (storageType === "float32" && !Number.isFinite(Math.fround(value))) ||
        (range && (!Number.isInteger(value) || value < range[0] || value > range[1]))) {
      throw new RangeError(`Aura3D updateAttribute("${update.name}") value is outside the ${storageType} storage range.`);
    }
    return value;
  };
  // Validate the entire update before mutating any vertex, so a malformed
  // later component cannot leave a partially applied GPU buffer.
  for (let i = 0; i < data.length; i += 1) checked(data[i]!);
  if (elements > 0) {
    geometry.ensureWritableBuffers({ vertex: true });
    vertexBuffer = geometry.vertexBuffer;
  }
  for (let element = 0; element < elements; element += 1) {
    for (let component = 0; component < components; component += 1) {
      scratch[component] = checked(data[element * components + component]!);
    }
    vertexBuffer.setAttribute(start + element, semantic, scratch);
  }
  return semantic === "position";
}

/** Convert packed update values using the authored attribute's component type. */
function attributeUpdateConverter(source: CustomVertexSource, name: string, nativeInteger: boolean): (value: number) => number {
  const data = source.data;
  const limits = data instanceof Int8Array ? [-128, 127] as const
    : data instanceof Uint8Array ? [0, 255] as const
    : data instanceof Int16Array ? [-32768, 32767] as const
    : data instanceof Uint16Array ? [0, 65535] as const
    : data instanceof Int32Array ? [-2147483648, 2147483647] as const
    : data instanceof Uint32Array ? [0, 4294967295] as const
    : undefined;
  return (value) => {
    if (!Number.isFinite(value) || (limits && (!Number.isInteger(value) || value < limits[0] || value > limits[1]))) {
      throw new Error(`Aura3D updateAttribute("${name}") value is outside the authored component type.`);
    }
    if (nativeInteger || !source.normalized || !limits) return value;
    return limits[0] < 0 ? Math.max(-1, value / limits[1]) : value / limits[1];
  };
}



/**
 * Build the production `PBRMaterial` for a primitive node.
 *
 * ## WS-2.1a — the parameter drop this function used to be
 *
 * Until 1.6 this forwarded `clearcoat` and **nothing else** from the extended material surface.
 * `AuraMaterialSpec` accepts `sheen`, `sheenRoughness`, `sheenColor`, `iridescence`,
 * `iridescenceIOR`, `iridescenceThicknessRange`, `anisotropy`, `anisotropyRotation`, `transmission`,
 * `thickness`, `ior`, `attenuationColor` and `attenuationDistance`; `PBRMaterial` accepts a uniform
 * for every one of them and binds them all. The bridge between the two dropped them on the floor.
 *
 * How that presented, measured by `tools/material-structural-parity` before the fix:
 *
 * ```
 * material.pbr({ ..., sheen: 1 })         -> byte-identical frame to sheen: 0
 * material.pbr({ ..., iridescence: 1 })   -> byte-identical frame to iridescence: 0
 * material.pbr({ ..., clearcoat: 1 })     -> byte-identical frame to clearcoat: 0
 * ```
 *
 * `clearcoat` was *forwarded* and still produced an identical frame, which pins the second, separate
 * defect: `a3dPbrExtensionEnvironmentLight` in `ShaderChunks.ts` adds its lobes to
 * `specularRadiance`, a term that is zero without an environment map. Forwarding alone is necessary
 * and not sufficient, so `environmentIntensity` now also has a floor when an extension factor is
 * present — otherwise a developer setting `clearcoat: 1` on a scene with no environment sees nothing
 * and has no way to find out why.
 *
 * The reason this survived so long is worth stating: three of the four lobes are scalar
 * approximations rather than real BRDFs, and **nobody could tell**, because the parameters never
 * arrived. The plumbing defect concealed the shading defect.
 */










/**
 * Production primitive mesh (muse3jsparity-PRD C1). uvs/uv1s are optional:
 * generators that provide them opt into textured materials; uv1 is a
 * procedural 2x tiling unwrap of uv0 (documented) so the native texCoord
 * selector has two distinct sets to choose between.
 */









