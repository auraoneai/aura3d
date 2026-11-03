/**
 * SG-02 / parity-L5 — `batched.mesh` (three.js `BatchedMesh` parity) and the
 * shared dense-instance state that also backs `instances.mesh` (SG-01).
 *
 * One `kind:"batched"` node carries multiple geometries and a fixed-capacity
 * instance pool: `addGeometry` packs each `Geometry` into a
 * `BatchedGeometryPool` (shared vertex/index arenas, `geometryId` = insertion
 * order), `addInstance` allocates a slot and returns its lifetime ID, and
 * `setMatrixAt`/`setColorAt`/`setVisibleAt`/`deleteInstance` resolve that ID
 * to dense per-instance storage.
 *
 * Render routes (resolved per update by {@link resolveBatchedMode}):
 *
 *   - "loop": one logical `RenderItem` per live member. Supported forward
 *     draws share packed geometry; other draws retain the logical source.
 *   - "multi-draw": a capable WebGL2 renderer keeps recoverable logical
 *     members; compatible unlit and bounded PBR indexed runs may use one
 *     native extension call. Unsupported contexts use per-geometry instancing.
 *   - "instanced": one `RenderItem` per geometry bucket carrying dense
 *     `instanceTransforms`/`instanceColors` — the native instanced-material
 *     path, an honest one-draw-per-geometry fallback that works on every
 *     renderer path.
 *
 * The dense `matrices`/`colors` stores are the same arrays uploaded via the
 * C-07 `InstanceBufferLike.setMatrices/setColors` contract — writes are the
 * real GPU-write path (L5-01), not a decompose-to-spec stub.
 */
import { Geometry, Renderer, WebGL2Device } from "@aura3d/rendering";
import type { Bounds3 } from "@aura3d/rendering";
import { createEngineBatchInstanceItem, createEnginePackedBatchItem, packedLoopProducerMemberCurrent, rememberPackedLoopMember, registerBatchedDrawShader, transferPackedLoopMember } from "@aura3d/rendering";
import type { PackedGeometryLease, RenderItem } from "@aura3d/rendering";
import { qrCoreGeneratorOn } from "@aura3d/rendering";
import type { NodeHandler, RenderSourceContributions, SceneCompileContext } from "../../contracts/compiler.js";
import { registerNodeHandler } from "../../contracts/compiler.js";
import { AuraRuntimeError } from "../../contracts/runtimeError.js";
import { assertDepthPreviewTarget } from "./depthPreviewTarget.js";
import { sourceSceneNodeOf } from "../compiler/sceneGraph.js";
import { runtimeNodeQueryState } from "../app/runtimeNodes.js";
import { AuraNodeBuilder } from "./builder.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { colorToRgba } from "../colorUtils.js";
import { createModelMatrix } from "../sceneMath.js";
import { getMaterialClipping } from "./scene.js";
import { createProductionPrimitiveGeometry, createProductionPrimitiveMaterial } from "../compiler/primitives.js";
import { blankProductionPrimitiveTextureState, createProductionPrimitiveTextureIntent, upgradeProductionPrimitiveResource } from "../compiler/textures.js";
import type { ProductionRuntimePrimitiveResource } from "./types.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import type { AuraBatchedNode, AuraBuiltinPrimitive, AuraColor, AuraMaterialSpec, AuraPrimitiveNode, AuraRuntimeNodeHandle } from "./types.js";
import {
  allocBatchedStateId,
  batchedIdentityMatrix,
  BatchedMeshState,
  batchedStateForNode,
  registerBatchedColorConverter,
  registerBatchedGeometryResolver,
  registerBatchedNodeSeeder,
  registerBatchedState
} from "./batchedState.js";

export {
  BatchedMeshState,
  batchedStateFor,
  batchedStateForNode,
  registerBatchedState
} from "./batchedState.js";
export type { AuraBatchedGeometryInput, AuraBatchedMemberReference, AuraBatchedMemberTarget, AuraBatchedMeshMode } from "./batchedState.js";
export { registerBatchedDrawShader } from "@aura3d/rendering";
import type { AuraBatchedGeometryInput, AuraBatchedMemberTarget, AuraBatchedMeshMode } from "./batchedState.js";

// Injected impls for the leaf module (see batchedState.ts header): geometry
// resolution needs `compiler/primitives`, authored-node seeding needs
// `sceneMath` — both cyclic — so they register here at module eval.
registerBatchedGeometryResolver((input) => {
  if (typeof input === "string") {
    return createProductionPrimitiveGeometry({ kind: "primitive", primitive: input } as AuraPrimitiveNode);
  }
  return createProductionPrimitiveGeometry({ kind: "primitive", primitive: "custom", geometry: input } as AuraPrimitiveNode);
});
registerBatchedColorConverter(colorToRgba);
registerBatchedNodeSeeder((node, state) => {
  (node.instances ?? []).forEach((transform, index) => {
    const memberId = state.addInstance(0);
    const m = createModelMatrix({ kind: "primitive", primitive: "box", ...transform } as AuraPrimitiveNode, { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, false, 0);
    state.setMatrixAt(memberId, m);
    const color = node.instanceColors?.[index];
    if (color !== undefined) state.setColorAt(memberId, color);
  });
});

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

export interface AuraBatchedEmitReport {
  readonly mode: "multi-draw" | "loop" | "instanced";
  readonly geometries: number;
  readonly instances: number;
  readonly draws: number;
  readonly fallbackReason?: string;
}

const SHARED_DEFAULT_MATERIAL = Object.freeze({ name: "a3d-batched-default" });

function pseudoNodeFor(node: AuraBatchedNode, instances: readonly unknown[] | undefined): AuraPrimitiveNode {
  return { kind: "primitive", primitive: "box", material: node.material, ...(instances ? { instances: instances as AuraPrimitiveNode["instances"] } : {}) } as AuraPrimitiveNode;
}


interface BatchedTextureUpgrade {
  readonly resource: ProductionRuntimePrimitiveResource;
  readonly source: unknown;
}

/**
 * Textured material for a batched/instanced node. `createProductionPrimitiveMaterial` only builds the scalar PBR
 * material; authored texture maps (`texture`, `normalMap`, `emissiveMap`, ... URLs, asset refs and `texture.*` handles)
 * are applied to ordinary primitives by the post-mount textured upgrade. Batched and instanced nodes never joined that
 * pass, so every map was dropped and the surface rendered white. This runs the same upgrade once per state and returns
 * the textured material once it has resolved (the scalar material until then).
 */
function batchedTexturedMaterial<T>(
  state: BatchedMeshState,
  node: AuraBatchedNode,
  geometry: Geometry | undefined,
  scalar: T
): T {
  const spec = node.material;
  if (!spec || !geometry) return scalar;
  let upgrade = state.textureUpgrade as BatchedTextureUpgrade | undefined;
  if (upgrade === undefined || upgrade.source !== spec) {
    const intent = createProductionPrimitiveTextureIntent(spec);
    const hasMaps = Boolean(
      intent.baseColorUrl ?? intent.normalUrl ?? intent.roughnessUrl ?? intent.metalnessUrl ?? intent.occlusionUrl ?? intent.emissiveUrl
      ?? intent.baseColorRef ?? intent.normalRef ?? intent.roughnessRef ?? intent.metalnessRef ?? intent.occlusionRef ?? intent.emissiveRef
    ) || Object.keys(intent.extensionMaps ?? {}).length > 0 || Object.keys(intent.extensionRefs ?? {}).length > 0 || intent.proceduralInputs.length > 0;
    if (!hasMaps) return scalar;
    const sourceNode = pseudoNodeFor(node, [{}]);
    const resource: ProductionRuntimePrimitiveResource = {
      geometry,
      material: scalar as ProductionRuntimePrimitiveResource["material"],
      bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      name: node.name ?? node.batchedId ?? "batched",
      materialSpec: spec,
      sourceNode,
      ...blankProductionPrimitiveTextureState()
    } as ProductionRuntimePrimitiveResource;
    upgrade = { resource, source: spec };
    state.textureUpgrade = upgrade;
    resource.textureStatus = "pending";
    state.addDisposer(() => {
      resource.textureDisposer?.();
      resource.texturedMaterial?.dispose();
      resource.texturedMaterial = null;
    });
    void upgradeProductionPrimitiveResource(resource, sourceNode, spec, intent, 4096)
      .then(() => { state.version += 1; })
      .catch((error: unknown) => {
        resource.textureStatus = "fallback";
        resource.textureWarnings.push(`textured upgrade failed for "${resource.name}" (${error instanceof Error ? error.message : String(error)}); scalar material retained`);
        console.warn(`[a3d] batched node "${resource.name}": ${resource.textureWarnings[resource.textureWarnings.length - 1]}`);
      });
  }
  return (upgrade.resource.texturedMaterial ?? scalar) as T;
}

/** Node transform (position/rotation/scale/quaternion) as a model matrix, sans fit/normalize. */
function batchedNodeModelMatrix(node: AuraBatchedNode, bounds: Bounds3, time: number): Float32Array {
  return createModelMatrix(node as unknown as AuraPrimitiveNode, bounds, false, time);
}

/** Live ancestry and node metadata can veto a captured member, never authorize its draw. */
export function batchedRuntimeNodeWorldReader(handle: AuraRuntimeNodeHandle, node: AuraBatchedNode): () => ArrayLike<number> | undefined {
  const captured = {
    material: node.material, renderOrder: node.renderOrder, frustumCulled: node.frustumCulled,
    layers: node.layers, userData: node.userData,
    castShadow: (node as AuraBatchedNode & { readonly castShadow?: boolean }).castShadow ?? true
  };
  return () => {
    const live = runtimeNodeQueryState(handle);
    if (!live || live.node.kind !== "batched" || live.node.material !== captured.material ||
      live.node.renderOrder !== captured.renderOrder || live.node.frustumCulled !== captured.frustumCulled ||
      live.node.layers !== captured.layers || live.node.userData !== captured.userData ||
      ((live.node as typeof live.node & { readonly castShadow?: boolean }).castShadow ?? true) !== captured.castShadow) return undefined;
    return live.worldMatrix;
  };
}

/** One batch has one material; per-member overrides cannot be represented by its dense buckets. */
function assertSingleBatchMaterial(node: AuraBatchedNode): void {
  if (Array.isArray(node.material)) {
    throw new TypeError("BATCH_MEMBER_MATERIAL_UNSUPPORTED: a batched node requires one material shared by all members.");
  }
  for (const [index, instance] of (node.instances ?? []).entries()) {
    const member = instance as unknown as Record<string, unknown>;
    if (["material", "clipping", "materialClipping"].some((key) => Object.prototype.hasOwnProperty.call(member, key) && member[key] !== undefined)) {
      throw new TypeError(`BATCH_MEMBER_MATERIAL_UNSUPPORTED: member ${index} cannot override its batch material or clipping group.`);
    }
  }
}

/** Select a recoverable logical route only for an actual capable renderer. */
function packedBatchedExecutionAvailable(ctx: SceneCompileContext): boolean {
  try {
    if (!(ctx.renderer instanceof Renderer) || !(ctx.renderer.device instanceof WebGL2Device)) return false;
    const device = ctx.renderer.device;
    return device.supportsMultiDrawElementsInstanced() && device.supportsSubmittedWorkCompletion();
  } catch { return false; }
}

export function resolveBatchedMode(state: BatchedMeshState, node: AuraBatchedNode, ctx: SceneCompileContext): { readonly mode: "multi-draw" | "loop" | "instanced"; readonly fallbackReason?: string } {
  assertSingleBatchMaterial(node);
  const requested = state.mode !== "auto" ? state.mode : node.multiDraw ?? "auto";
  // An explicitly requested loop keeps one logical item per member. The
  // compiled bridge owns its frame lease; each pass may independently use
  // packed storage only when its device and draw inputs support it.
  if (requested === "loop" && !state.instanced && state.geometries.length > 1 &&
      (ctx as SceneCompileContext & { readonly auraBatchFrameOwnership?: boolean }).auraBatchFrameOwnership === true) {
    return { mode: "loop" };
  }
  // Depth uses logical members. A clipped batch either keeps those members
  // or falls back to per-geometry instancing when frame ownership is absent.
  const materialClipping = getMaterialClipping(node.material) !== undefined;
  const sceneClipping = (ctx as SceneCompileContext & { readonly auraBatchSceneClipping?: boolean }).auraBatchSceneClipping === true;
  if (materialClipping || sceneClipping) {
    // A capable renderer can retain individual members while clipping or a
    // later material resolver is active. No packed shader is needed here.
    if (requested !== "instanced" && !state.instanced && state.geometries.length > 1 &&
        (ctx as SceneCompileContext & { readonly auraBatchFrameOwnership?: boolean }).auraBatchFrameOwnership === true &&
        packedBatchedExecutionAvailable(ctx)) {
      return { mode: "loop", fallbackReason: materialClipping ? "material-clipping" : "scene-clipping" };
    }
    return { mode: "instanced", ...(requested !== "instanced" ? { fallbackReason: materialClipping ? "material-clipping" : "scene-clipping" } : {}) };
  }
  const single = state.geometries.length <= 1;
  if (requested === "instanced" || single) {
    return { mode: "instanced", ...(requested !== "instanced" && single ? { fallbackReason: "single-geometry" } : {}) };
  }
  if (!qrCoreGeneratorOn(ctx.flags)) {
    return { mode: "instanced", fallbackReason: "generated-programs-off" };
  }
  // Feature and frame ownership are required even when the device exposes the extension.
  if (!ctx.flags.on("A3D_QR_TIERS_BATCHING")) {
    return { mode: "instanced", fallbackReason: "tiers-batching-off" };
  }
  if (!(ctx as SceneCompileContext & { readonly auraBatchFrameOwnership?: boolean }).auraBatchFrameOwnership ||
      !ctx.flags.on("A3D_PARITY_BATCHING") || !packedBatchedExecutionAvailable(ctx)) {
    return { mode: "instanced", fallbackReason: "packed-execution-unavailable" };
  }
  return { mode: requested === "auto" ? "multi-draw" : requested };
}

/**
 * Build logical items and keep the optional packed generation alive. The
 * caller owns the returned lease until all backend work has completed, or must
 * release it immediately when the items are discarded or submission fails.
 */
export function createBatchedLoopItems(
  state: BatchedMeshState,
  node: AuraBatchedNode,
  nodeWorld: ArrayLike<number>,
  material: RenderItem["material"],
  mountOwner?: object,
  readLiveNodeWorld?: () => ArrayLike<number> | undefined,
  allowUnpackedFallback = false,
  submissionIntent: "loop" | "multi-draw" = "loop"
): { readonly items: readonly RenderItem[]; readonly lease?: PackedGeometryLease; release(): void } {
  const members = state.captureLoopMembers(nodeWorld, node.runtime?.id, node, mountOwner, readLiveNodeWorld)
    .filter((member) => member.sourceRange.count > 0);
  if (!members.length) return { items: Object.freeze([]), release() {} };
  const materialClipping = getMaterialClipping(node.material);
  const items = members.map((member): RenderItem => {
      const logical: RenderItem & { readonly temporalObjectKey: object } = {
        geometry: member.sourceGeometry,
        material,
        // Both forward and depth receive the same clamped source interval;
        // an authored Infinity is meaningful on geometry but not as an item
        // override on either pass.
        ...(member.sourceDrawRange === undefined ? {} : { drawRange: member.sourceRange }),
        ...(materialClipping ? { materialClipping } : {}),
        ...(node.name === undefined ? {} : { label: node.name }),
        modelMatrix: Float32Array.from(member.modelMatrix),
        instanceTransforms: Float32Array.from(batchedIdentityMatrix),
        instanceColors: Float32Array.from(member.color),
        temporalObjectKey: member.temporalObjectKey,
        castShadow: member.castShadow,
        ...(member.renderOrder === undefined ? {} : { renderOrder: member.renderOrder }),
        ...(member.frustumCulled === undefined ? {} : { frustumCulled: member.frustumCulled }),
        ...(member.layerMask === undefined ? {} : { layerMask: member.layerMask }),
        ...(member.userData === undefined ? {} : { userData: member.userData })
      };
      return logical;
    });
  let pool: ReturnType<BatchedMeshState["packedPool"]>;
  try { pool = state.packedPool(); } catch (error) {
    if (allowUnpackedFallback && error instanceof Error && /^BatchedGeometryPool (supports a single per-vertex slot 0 stream|requires identical vertex layouts|requires matching topology and indexing)$/.test(error.message)) {
      return { items: Object.freeze(items), release() {} };
    }
    throw error;
  }
  // Cull and sort logical members with their own bounds. A shared generation
  // is retained once and never rebuilt merely because an instance moved.
  const lease = pool.retainGeneration();
  try {
    for (const [index, member] of members.entries()) {
      const logical = items[index]!;
      rememberPackedLoopMember(logical, { ...member, logicalItem: logical, logicalMaterial: material,
        itemDrawRange: logical.drawRange, pool, lease,
        packedRange: pool.translateSourceRange(member.sourceGeometry, member.sourceRange), producerSnapshot: member,
        ...(submissionIntent === "multi-draw" ? { combinedDrawIntent: true } : {}) });
    }
    if (items.some((item) => !packedLoopProducerMemberCurrent(item))) {
      throw new Error("BATCH_LOOP_STATE_CHANGED: batch or source changed while preparing loop items.");
    }
    return { items: Object.freeze(items), lease, release: () => lease.release() };
  } catch (error) {
    try { lease.release(); } catch { /* preserve the preparation error */ }
    throw error;
  }
}

/**
 * Emit per-geometry instancing or frame-owned logical loop members. Depth and
 * unsupported forward paths can draw the original member geometry.
 */
function emitBatchedItems(
  state: BatchedMeshState,
  node: AuraBatchedNode,
  ctx: SceneCompileContext,
  out: RenderSourceContributions,
  time: number,
  worldMatrix?: Float32Array,
  mountOwner?: object,
  readLiveNodeWorld?: () => ArrayLike<number> | undefined
): AuraBatchedEmitReport {
  assertDepthPreviewTarget("batched", node.material);
  const resolved = resolveBatchedMode(state, node, ctx);
  // Compile-time contributions can be discarded and do not own a frame
  // lease. Only a live runtime handle can observe ancestor movement/visibility.
  const mode = resolved.mode !== "instanced" && !readLiveNodeWorld ? "instanced" : resolved.mode;
  const fallbackReason = mode !== resolved.mode ? "runtime-node-unavailable" : resolved.fallbackReason;
  if (node.visible === false) {
    return { mode, geometries: state.geometries.length, instances: 0, draws: 0, ...(fallbackReason ? { fallbackReason } : {}) };
  }
  const slots = state.liveSlots();
  // A batched/instanced mesh with no live members draws nothing; it must never throw
  // (pooling an empty geometry set, or a zero-length instance upload, blanks the canvas).
  if (slots.length === 0) {
    return { mode, geometries: state.geometries.length, instances: 0, draws: 0, ...(fallbackReason ? { fallbackReason } : {}) };
  }
  const bounds = state.boundingBox();
  const nodeModel = worldMatrix ?? batchedNodeModelMatrix(node, bounds, time);
  const materialClipping = getMaterialClipping(node.material);

  if (mode === "instanced") {
    // One item per geometry bucket; dense slices ride the C-07 instance path.
    const buckets = new Map<number, number[]>();
    for (const slot of slots) {
      const gid = state.geometryIdAt(slot);
      const list = buckets.get(gid) ?? [];
      list.push(slot);
      buckets.set(gid, list);
    }
    const items: RenderItem[] = [];
    const pseudo = pseudoNodeFor(node, [{}]);
    const materialKey = node.material ?? SHARED_DEFAULT_MATERIAL;
    for (const [gid, list] of buckets) {
      const geometry = state.geometries[gid];
      if (!geometry) continue;
      const transforms = new Float32Array(list.length * 16);
      const colors = new Float32Array(list.length * 4);
      list.forEach((slot, i) => {
        transforms.set(state.matrices.subarray(slot * 16, slot * 16 + 16), i * 16);
        colors.set(state.colors.subarray(slot * 4, slot * 4 + 4), i * 4);
      });
      const scalarMaterial = state.materialFor(materialKey, () => createProductionPrimitiveMaterial(pseudo));
      const material = batchedTexturedMaterial(state, node, state.geometries[0], scalarMaterial);
      const item = {
        geometry,
        material: material as RenderItem["material"],
        ...(materialClipping ? { materialClipping } : {}),
        modelMatrix: nodeModel,
        instanceTransforms: transforms,
        instanceColors: colors,
        castShadow: (node as { castShadow?: boolean }).castShadow ?? true
      } as RenderItem;
      // A batched.mesh bucket may combine multiple logical members. A
      // per-item clipping callback cannot address them independently; the
      // renderer uses this origin-only marker to reject that case before draw.
      items.push(state.instanced ? item : createEngineBatchInstanceItem(item));
    }
    out.addItems(items);
    return { mode, geometries: buckets.size, instances: slots.length, draws: items.length, ...(fallbackReason ? { fallbackReason } : {}) };
  }

  // The compiled frame owns this lease until consumers finish or discard it.
  const pseudo = pseudoNodeFor(node, undefined);
  const scalarMaterial = state.materialFor(node.material ?? SHARED_DEFAULT_MATERIAL, () => createProductionPrimitiveMaterial(pseudo));
  const material = batchedTexturedMaterial(state, node, state.geometries[0], scalarMaterial) as RenderItem["material"];
  const prepared = createBatchedLoopItems(state, node, nodeModel, material, mountOwner, readLiveNodeWorld, true, mode);
  // Each public marker retains one logical member. It is expanded before
  // culling or observers and does not itself authorize a native draw.
  const emitted = mode === "multi-draw" && prepared.lease ? prepared.items.map((logical, index) => {
    const carrier = createEnginePackedBatchItem({ ...logical,
      multiDraw: Object.freeze({ mode: "multi-draw" as const, drawIndex: index }) });
    transferPackedLoopMember(logical, carrier, logical);
    return Object.freeze(carrier);
  }) : prepared.items;
  try { out.addItems(emitted); } catch (error) { prepared.release(); throw error; }
  return { mode, geometries: state.geometries.length, instances: prepared.items.length, draws: prepared.items.length, ...(fallbackReason ? { fallbackReason } : {}) };
}

const L5_FLAG = "A3D_PARITY_BATCHING" as const;
/** Any non-"prd15" owner runs: "prd15" is the C-36 bridge/skip sentinel. */
const L5_OWNER = "prd11" as const;

/** Fail closed while the lane flag is off (identical code path to parityPending). */
function assertL5Flag(ctx: SceneCompileContext): void {
  if (!ctx.flags.on(L5_FLAG)) {
    throw new AuraRuntimeError(
      "parity-not-implemented",
      `Aura3D scene node kind "batched" is not yet implemented (${L5_FLAG}). See docs/workflows/threejs-parity-gaps.md.`
    );
  }
}

export const batchedNodeHandler: NodeHandler<{ readonly kind: "batched" }> = {
  kind: "batched",
  owner: L5_OWNER,
  flag: "A3D_PARITY_BATCHING",
  compile(node, ctx, out) {
    assertL5Flag(ctx);
    registerBatchedDrawShader();
    const batchedNode = node as unknown as AuraBatchedNode;
    const source = sourceSceneNodeOf(batchedNode) ?? batchedNode;
    const state = batchedStateForNode(source as AuraBatchedNode);
    const report = emitBatchedItems(state, batchedNode, ctx, out, 0);
    if (report.mode === "instanced") out.feature("instancing");
    out.set("parityBatched", report);
  },
  update(node, handle, ctx, out, timeSeconds) {
    registerBatchedDrawShader();
    const batchedNode = node as unknown as AuraBatchedNode;
    const source = sourceSceneNodeOf(batchedNode) ?? batchedNode;
    const state = batchedStateForNode(source as AuraBatchedNode);
    // Runtime graph visibility and world placement include all ancestors. A
    // hidden or retired handle submits no items, and showing an ancestor can
    // override the flattened snapshot's original inherited visibility.
    const live = handle ? runtimeNodeQueryState(handle) : undefined;
    const liveNode = live?.node.kind === "batched" ? live.node : undefined;
    const currentNode = handle ? {
      ...batchedNode,
      ...(liveNode ? { material: liveNode.material, renderOrder: liveNode.renderOrder, frustumCulled: liveNode.frustumCulled,
        layers: liveNode.layers, userData: liveNode.userData,
        castShadow: (liveNode as AuraBatchedNode & { readonly castShadow?: boolean }).castShadow } : {}),
      visible: live !== undefined
    } : batchedNode;
    const liveWorld = handle && live ? batchedRuntimeNodeWorldReader(handle, currentNode) : undefined;
    const report = emitBatchedItems(state, currentNode, ctx, out, timeSeconds, live?.worldMatrix, handle ?? source, liveWorld);
    out.set("parityBatched", report);
  }
};

// The registered handler wins over the flag-off `parityPending` table default
// whenever A3D_PARITY_BATCHING is on (resolveNodeHandler); the pending entry
// remains the fail-closed stub when the flag is off.
registerNodeHandler(batchedNodeHandler);

/* ------------------------------------------------------------------ */
/* Public handle + namespace                                           */
/* ------------------------------------------------------------------ */

export interface AuraBatchedMeshOptions {
  readonly maxInstances: number;
  readonly maxVertices?: number;
  readonly maxIndices?: number;
  /**
   * Material clipping affects rendering; scene raycasts remain geometric.
   * Renderer `materialClippingFor` callbacks cannot address individual
   * batched members on the current instance fallback and are rejected.
   */
  readonly material?: AuraMaterialSpec;
  /** "auto" uses combined WebGL2 when eligible and falls back on unsupported inputs. */
  readonly multiDraw?: AuraBatchedMeshMode;
  readonly name?: string;
  readonly geometries?: readonly AuraBatchedGeometryInput[];
}

/**
 * `batched.mesh` handle — an `AuraNodeBuilder` (scene-addable, chainable
 * transforms) plus the three.js BatchedMesh mutation API. Builder methods
 * return a fresh handle sharing the same dense state (`batchedId` survives
 * the builder's spread-clone). Mutations also accept query hits and captured
 * packed-loop members, resolving their lifetimes rather than their slot IDs.
 */
export class AuraBatchedMeshHandle extends AuraNodeBuilder<AuraBatchedNode> {
  readonly state: BatchedMeshState;

  constructor(node: AuraBatchedNode, state: BatchedMeshState) {
    super(node);
    this.state = state;
  }

  private rewrap(builder: AuraNodeBuilder<AuraBatchedNode>): this {
    return new AuraBatchedMeshHandle(builder.toJSON(), this.state) as this;
  }

  // Chainables keep the base signatures (a chained call still returns a live
  // handle sharing `state` — the cast only erases the builder's patch type).
  override position(x: number, y: number, z: number): AuraNodeBuilder<AuraBatchedNode & { readonly position: import("./types.js").AuraVec3 }>;
  override position(value: import("./types.js").AuraVec3): AuraNodeBuilder<AuraBatchedNode & { readonly position: import("./types.js").AuraVec3 }>;
  override position(x: number | import("./types.js").AuraVec3, y?: number, z?: number): AuraNodeBuilder<AuraBatchedNode & { readonly position: import("./types.js").AuraVec3 }> {
    const v = typeof x === "number" ? [x, y as number, z as number] : x;
    return this.rewrap(super.position(v[0], v[1], v[2]) as never) as never;
  }
  override rotate(x: number, y: number, z: number, order?: import("../../contracts/sceneGraph").AuraEulerOrder): AuraNodeBuilder<AuraBatchedNode & { readonly rotation: import("./types.js").AuraVec3; readonly rotationOrder?: import("../../contracts/sceneGraph").AuraEulerOrder }>;
  override rotate(value: import("./types.js").AuraVec3, order?: import("../../contracts/sceneGraph").AuraEulerOrder): AuraNodeBuilder<AuraBatchedNode & { readonly rotation: import("./types.js").AuraVec3; readonly rotationOrder?: import("../../contracts/sceneGraph").AuraEulerOrder }>;
  override rotate(x: number | import("./types.js").AuraVec3, y?: number | import("../../contracts/sceneGraph").AuraEulerOrder, z?: number, order?: import("../../contracts/sceneGraph").AuraEulerOrder): AuraNodeBuilder<AuraBatchedNode & { readonly rotation: import("./types.js").AuraVec3; readonly rotationOrder?: import("../../contracts/sceneGraph").AuraEulerOrder }> {
    const v = typeof x === "number" ? [x, y as number, z as number] : x;
    const eulerOrder = typeof x === "number" ? order : (y as import("../../contracts/sceneGraph").AuraEulerOrder | undefined);
    return this.rewrap(super.rotate(v[0], v[1], v[2], eulerOrder) as never) as never;
  }
  override quaternion(x: number, y: number, z: number, w: number): AuraNodeBuilder<AuraBatchedNode & { readonly quaternion: import("../../contracts/sceneGraph").AuraQuat }> {
    return this.rewrap(super.quaternion(x, y, z, w) as never) as never;
  }
  override scale(value: number | import("./types.js").AuraVec3): AuraNodeBuilder<AuraBatchedNode & { readonly scale: number | import("./types.js").AuraVec3 }> {
    return this.rewrap(super.scale(value as never) as never) as never;
  }
  override lookAt(x: number, y: number, z: number): AuraNodeBuilder<AuraBatchedNode & { readonly lookAt: import("./types.js").AuraVec3 }>;
  override lookAt(value: import("./types.js").AuraVec3): AuraNodeBuilder<AuraBatchedNode & { readonly lookAt: import("./types.js").AuraVec3 }>;
  override lookAt(x: number | import("./types.js").AuraVec3, y?: number, z?: number): AuraNodeBuilder<AuraBatchedNode & { readonly lookAt: import("./types.js").AuraVec3 }> {
    const v = typeof x === "number" ? [x, y as number, z as number] : x;
    return this.rewrap(super.lookAt(v[0], v[1], v[2]) as never) as never;
  }
  override material(spec: AuraMaterialSpec): AuraNodeBuilder<AuraBatchedNode & { readonly material: AuraMaterialSpec }> {
    return this.rewrap(super.material(spec) as never) as never;
  }
  override runtime(spec: import("./types.js").AuraRuntimeNodeSpec): AuraNodeBuilder<AuraBatchedNode & { readonly runtime: import("./types.js").AuraRuntimeNodeSpec }> {
    return this.rewrap(super.runtime(spec) as never) as never;
  }

  /** Register a geometry; returns its geometryId (insertion order). */
  addGeometry(geometry: AuraBatchedGeometryInput): number {
    return this.state.addGeometry(geometry);
  }

  /**
   * Allocate a slot and return its public instance index. A deleted index may
   * be returned again for a new member; query hits carry a never-reused
   * lifetime `batchMemberId` (resolve it with getSlotForMemberId).
   */
  addInstance(geometryId: number): number {
    return this.state.addInstance(geometryId);
  }

  /** Inspect the current lifetime ID at a physical storage slot. */
  getMemberIdAt(slot: number): number | undefined {
    return this.state.queryMemberIdAt(slot);
  }

  /** Capture a live member ID as a state- and lifetime-bound mutation target. */
  getMemberReferenceAt(memberId: string | number): ReturnType<BatchedMeshState["getMemberReferenceAt"]> {
    const slot = this.state.getSlotForMemberId(memberId);
    return slot === undefined ? undefined : this.state.getMemberReferenceAt(slot);
  }

  /** Resolve a live ID to its reusable storage slot; do not use that slot as an ID. */
  getSlotForMemberId(memberId: string | number | undefined): number | undefined {
    return this.state.getSlotForMemberId(memberId);
  }

  /** Recover a captured member ID from a packed-loop key, even after retirement. */
  getMemberIdForLoopKey(key: object | undefined): number | undefined {
    return this.state.getMemberIdForLoopKey(key);
  }

  /**
   * A number is the public instance index from addInstance. Pass a query hit,
   * captured reference or packed-loop member to also check state and member
   * lifetime (rejected once that member was deleted, even if its index was reused).
   */
  setMatrixAt(index: AuraBatchedMemberTarget, matrix: Float32Array | readonly number[] | { readonly elements: ArrayLike<number> }): this {
    this.state.setMatrixAt(index, matrix);
    return this;
  }

  getMatrixAt(index: AuraBatchedMemberTarget, out?: Float32Array | number[]): Float32Array | number[] {
    return this.state.getMatrixAt(index, out);
  }

  setColorAt(index: AuraBatchedMemberTarget, color: AuraColor | readonly number[]): this {
    this.state.setColorAt(index, color);
    return this;
  }

  getColorAt(index: AuraBatchedMemberTarget, out?: number[]): number[] {
    return this.state.getColorAt(index, out);
  }

  setVisibleAt(index: AuraBatchedMemberTarget, visible: boolean): this {
    this.state.setVisibleAt(index, visible);
    return this;
  }

  deleteInstance(index: AuraBatchedMemberTarget): this {
    this.state.deleteInstance(index);
    return this;
  }

  get count(): number {
    return this.state.count;
  }

  /** three.js `instanceMatrix.needsUpdate`-style explicit flush (uploads are per-frame already). */
  set needsUpdate(_v: boolean) {
    this.state.version += 1;
  }

  /** Union bounding sphere over live instances (three.js `computeBoundingSphere`). */
  computeBoundingSphere(): { readonly center: readonly [number, number, number]; readonly radius: number } {
    const box = this.state.boundingBox();
    const center: [number, number, number] = [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2
    ];
    const radius = Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) / 2;
    return { center, radius };
  }

  get boundingSphere(): { readonly center: readonly [number, number, number]; readonly radius: number } {
    return this.computeBoundingSphere();
  }

  dispose(): void {
    this.state.dispose();
  }
}

function batchedMesh(options: AuraBatchedMeshOptions): AuraBatchedMeshHandle {
  assertDepthPreviewTarget("batched", options.material);
  const id = allocBatchedStateId();
  const state = new BatchedMeshState({
    id,
    capacity: options.maxInstances,
    ...(options.maxVertices !== undefined ? { maxVertices: options.maxVertices } : {}),
    ...(options.maxIndices !== undefined ? { maxIndices: options.maxIndices } : {}),
    ...(options.multiDraw !== undefined ? { mode: options.multiDraw } : {})
  });
  for (const input of options.geometries ?? []) state.addGeometry(input);
  const node: AuraBatchedNode = {
    kind: "batched",
    batchedId: id,
    maxInstances: options.maxInstances,
    ...(options.maxVertices !== undefined ? { maxVertices: options.maxVertices } : {}),
    ...(options.maxIndices !== undefined ? { maxIndices: options.maxIndices } : {}),
    ...(options.material !== undefined ? { material: options.material } : {}),
    ...(options.multiDraw !== undefined ? { multiDraw: options.multiDraw } : {}),
    ...(options.name !== undefined ? { name: options.name } : {})
  };
  registerBatchedState(state);
  return new AuraBatchedMeshHandle(node, state);
}

/** `batched` namespace — parity-L5 multi-geometry instancing (SG-02). */
export const batched = lazyNamespace(() => ({
  mesh: batchedMesh
} as const));
