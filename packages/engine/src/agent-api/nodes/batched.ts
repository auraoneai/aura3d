/**
 * SG-02 / parity-L5 — `batched.mesh` (three.js `BatchedMesh` parity) and the
 * shared dense-instance state that also backs `instances.mesh` (SG-01).
 *
 * One `kind:"batched"` node carries multiple geometries and a fixed-capacity
 * instance pool: `addGeometry` packs each `Geometry` into a
 * `BatchedGeometryPool` (shared vertex/index arenas, `geometryId` = insertion
 * order), `addInstance` allocates a slot, and `setMatrixAt`/`setColorAt`/
 * `setVisibleAt`/`deleteInstance` mutate dense per-instance storage.
 *
 * Render routes (resolved per update by {@link resolveBatchedMode}):
 *
 *   - "multi-draw": one `RenderItem` per live instance, all sharing the pooled
 *     `Geometry`; `drawRange` selects the instance's packed slice and the
 *     `multiDraw` marker selects the `parity.batchDraw` shader feature, which
 *     fetches model matrix + base colour + visibility flags from a
 *     `DrawDataTexture` row. `DrawSubmit` enqueues consecutive markers into a
 *     single `device.multiDrawElementsInstanced` — one real
 *     `WEBGL_multi_draw` call when the extension exists (the program uses
 *     `gl_DrawID`), else an honest one-draw-per-member loop (`u_drawId`).
 *     Requires the generated-program path (A3D_QR_CORE_GENERATOR) — otherwise
 *     degrades to "instanced".
 *   - "instanced": one `RenderItem` per geometry bucket carrying dense
 *     `instanceTransforms`/`instanceColors` — the native instanced-material
     * path, an honest one-draw-per-geometry fallback that works on every
 *     renderer path.
 *
 * The dense `matrices`/`colors` stores are the same arrays uploaded via the
 * C-07 `InstanceBufferLike.setMatrices/setColors` contract — writes are the
 * real GPU-write path (L5-01), not a decompose-to-spec stub.
 */
import { Geometry } from "@aura3d/rendering";
import type { Bounds3 } from "@aura3d/rendering";
import { BatchedGeometryPool, DrawDataTexture, drawDataBindingFor, packDrawDataFlags } from "@aura3d/rendering";
import type { PackedGeometryEntry, Texture, RenderItem } from "@aura3d/rendering";
import { qrCoreGeneratorOn } from "@aura3d/rendering";
import { registerShaderChunk, registerShaderFeature, registerDepthVariantFeature } from "@aura3d/rendering/contracts";
import type { NodeHandler, RenderSourceContributions, SceneCompileContext } from "../../contracts/compiler.js";
import { registerNodeHandler } from "../../contracts/compiler.js";
import { AuraRuntimeError } from "../compiler/errors.js";
import { AuraNodeBuilder } from "./builder.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { colorToRgba } from "../colorUtils.js";
import { createModelMatrix } from "../sceneMath.js";
import { createProductionPrimitiveGeometry, createProductionPrimitiveMaterial } from "../compiler/primitives.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import type { AuraBatchedNode, AuraBuiltinPrimitive, AuraColor, AuraMaterialSpec, AuraPrimitiveNode } from "./types.js";
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
export type { AuraBatchedGeometryInput, AuraBatchedMeshMode } from "./batchedState.js";
import type { AuraBatchedGeometryInput, AuraBatchedMeshMode } from "./batchedState.js";

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
  (node.instances ?? []).forEach((transform) => {
    const slot = state.addInstance(0);
    const m = createModelMatrix({ kind: "primitive", primitive: "box", ...transform } as AuraPrimitiveNode, { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, false, 0);
    state.setMatrixAt(slot, m);
    const color = node.instanceColors?.[slot];
    if (color !== undefined) state.setColorAt(slot, color);
  });
});

/* ------------------------------------------------------------------ */
/* `parity.batchDraw` shader feature (generated-program path)          */
/* ------------------------------------------------------------------ */

const L5_BATCH_PARS_CHUNK = "a3d_l5_batch_draw_pars";
const L5_BATCH_WORLD_CHUNK = "a3d_l5_batch_draw_world";
const L5_BATCH_FRAG_CHUNK = "a3d_l5_batch_draw_frag";
const L5_BATCH_FEATURE = "parity.batchDraw";
const L5_BATCH_DEPTH_FEATURE = "parity.batchDraw.depth";

/**
 * Declarations shared by both stages. `a3d_l5_draw_index` resolves to
 * `gl_DrawID` when the driver exposes `WEBGL_multi_draw` AND the feature's
 * multi-draw bit is set — `#extension ... : warn` (emitted by the generator
 * for `A3D_L5_MULTI_DRAW`) leaves the macro undefined on drivers without it,
 * selecting the `u_drawId` uniform loop instead. That is exactly the
 * distinction `canMultiDraw` keys on (a program declaring `u_drawId` is the
 * uniform-loop fallback).
 */
const L5_BATCH_PARS_GLSL = /* glsl */ `
#if defined(GL_ANGLE_multi_draw) && defined(A3D_L5_MULTI_DRAW)
#define a3d_l5_draw_index gl_DrawID
#else
uniform highp int u_drawId;
#define a3d_l5_draw_index u_drawId
#endif
uniform highp sampler2D u_a3dDrawData;
#ifdef A3D_STAGE_VERTEX
out vec4 v_a3dL5DrawColor;
#else
in vec4 v_a3dL5DrawColor;
#endif
vec4 a3dL5DrawTexel(int draw, int row) {
  return texelFetch(u_a3dDrawData, ivec2(draw * 6 + row, 0), 0);
}
mat4 a3dL5DrawModel(int draw) {
  return mat4(a3dL5DrawTexel(draw, 0), a3dL5DrawTexel(draw, 1), a3dL5DrawTexel(draw, 2), a3dL5DrawTexel(draw, 3));
}
vec4 a3dL5DrawBaseColor(int draw) {
  return a3dL5DrawTexel(draw, 4);
}
vec4 a3dL5DrawMeta(int draw) {
  return a3dL5DrawTexel(draw, 5);
}
`;

/**
 * World hook: the draw row's model matrix replaces `u_modelMatrix *
 * instanceMatrix` entirely — the engine folds node×instance transforms into
 * the draw-data texture so one packed draw = one (geometry-slice, instance)
 * pair. meta.w bit 0 is the visibility flag: hidden rows collapse to a
 * degenerate point at the origin (no fragments).
 */
const L5_BATCH_WORLD_GLSL = /* glsl */ `
#ifdef A3D_L5_BATCH_DRAW
  {
    int a3dL5Draw = a3d_l5_draw_index;
    vec4 a3dL5Meta = a3dL5DrawMeta(a3dL5Draw);
    mat4 a3dL5Model = a3dL5DrawModel(a3dL5Draw);
    v_a3dL5DrawColor = a3dL5DrawBaseColor(a3dL5Draw);
    a3dWorld = a3dL5Model * a3dLocal;
    if ((floatBitsToUint(a3dL5Meta.w) & 1u) == 0u) a3dWorld = vec4(0.0);
  }
#endif
`;

/**
 * Material hook: per-draw base colour, applied to `a3dBaseColor` and (when
 * lit) to the already-constructed `PhysicalMaterial`'s colour-derived fields
 * so diffuse and specular both track the draw colour.
 */
const L5_BATCH_FRAG_GLSL = /* glsl */ `
#ifdef A3D_L5_BATCH_DRAW
  a3dBaseColor *= v_a3dL5DrawColor;
  #ifdef A3D_LIT
    material.baseColor *= v_a3dL5DrawColor.rgb;
    material.diffuseContribution *= v_a3dL5DrawColor.rgb;
    material.specularColorBlended *= v_a3dL5DrawColor.rgb;
  #endif
#endif
`;

let batchDrawShaderRegistered = false;

/** Register the L5 feature + chunks once (idempotent; engine import side effect). */
export function registerBatchedDrawShader(): void {
  if (batchDrawShaderRegistered) return;
  batchDrawShaderRegistered = true;
  registerShaderChunk({ name: L5_BATCH_PARS_CHUNK, owner: "prd15", glsl: L5_BATCH_PARS_GLSL, stage: "both" });
  registerShaderChunk({ name: L5_BATCH_WORLD_CHUNK, owner: "prd15", glsl: L5_BATCH_WORLD_GLSL, stage: "vertex" });
  registerShaderChunk({ name: L5_BATCH_FRAG_CHUNK, owner: "prd15", glsl: L5_BATCH_FRAG_GLSL, stage: "fragment" });
  registerShaderFeature({
    id: L5_BATCH_FEATURE,
    owner: "prd15",
    flag: "A3D_PARITY_BATCHING",
    order: 40,
    select: (input) => {
      if (input.pass !== "forward") return undefined;
      const marker = (input.item as RenderItem & { multiDraw?: { mode: string; drawIndex: number } }).multiDraw;
      return marker ? marker.mode : undefined;
    },
    defines: (value): Readonly<Record<string, string | number | true>> => value === "multi-draw"
      ? { A3D_L5_BATCH_DRAW: true, A3D_L5_MULTI_DRAW: true }
      : { A3D_L5_BATCH_DRAW: true },
    chunks: [L5_BATCH_PARS_CHUNK, L5_BATCH_PARS_CHUNK, L5_BATCH_WORLD_CHUNK, L5_BATCH_FRAG_CHUNK],
    hooks: ["vertex:pars", "fragment:pars", "vertex:world", "fragment:material"],
    bindUniforms: (_value, item, set) => {
      const marker = (item as RenderItem & { multiDraw?: { drawIndex: number; drawData?: Texture } }).multiDraw;
      if (!marker) return;
      set("u_drawId", marker.drawIndex);
      if (marker.drawData) set("u_a3dDrawData", drawDataBindingFor(marker.drawData));
    }
  });
  // Depth/distance passes run through the depth-variant registry — same
  // fetch, vertex stage only, so shadow casters stay correct.
  registerDepthVariantFeature({
    id: L5_BATCH_DEPTH_FEATURE,
    owner: "prd15",
    flag: "A3D_PARITY_BATCHING",
    passes: ["depth", "distance"],
    select: (input) =>
      (input.item as RenderItem & { multiDraw?: unknown }).multiDraw ? true : undefined,
    defines: () => ({ A3D_L5_BATCH_DRAW: true }),
    chunks: [L5_BATCH_PARS_CHUNK, L5_BATCH_WORLD_CHUNK],
    hooks: ["vertex:pars", "vertex:world"]
  });
}

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

/** Node transform (position/rotation/scale/quaternion) as a model matrix, sans fit/normalize. */
function batchedNodeModelMatrix(node: AuraBatchedNode, bounds: Bounds3, time: number): Float32Array {
  return createModelMatrix(node as unknown as AuraPrimitiveNode, bounds, false, time);
}

export function resolveBatchedMode(state: BatchedMeshState, node: AuraBatchedNode, ctx: SceneCompileContext): { readonly mode: "multi-draw" | "loop" | "instanced"; readonly fallbackReason?: string } {
  const requested = state.mode !== "auto" ? state.mode : node.multiDraw ?? "auto";
  const single = state.geometries.length <= 1;
  if (requested === "instanced" || single) {
    return { mode: "instanced", ...(requested !== "instanced" && single ? { fallbackReason: "single-geometry" } : {}) };
  }
  if (!qrCoreGeneratorOn(ctx.flags)) {
    return { mode: "instanced", fallbackReason: "generated-programs-off" };
  }
  return { mode: requested === "auto" ? "multi-draw" : requested };
}

/**
 * Emit the render items for a batched node. Packed mode uploads the draw-data
 * rows (`model = nodeModel × instanceMatrix`, base colour, visible flag |
 * geometryId in meta.w) then emits one marker item per live instance — the
 * enqueue inside `DrawSubmit` turns a compatible run into one
 * `multiDrawElementsInstanced` call; otherwise each draws once (loop).
 */
function emitBatchedItems(
  state: BatchedMeshState,
  node: AuraBatchedNode,
  ctx: SceneCompileContext,
  out: RenderSourceContributions,
  time: number
): AuraBatchedEmitReport {
  const { mode, fallbackReason } = resolveBatchedMode(state, node, ctx);
  if (node.visible === false) {
    return { mode, geometries: state.geometries.length, instances: 0, draws: 0, ...(fallbackReason ? { fallbackReason } : {}) };
  }
  const bounds = state.boundingBox();
  const nodeModel = batchedNodeModelMatrix(node, bounds, time);
  const slots = state.liveSlots();

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
      const material = state.materialFor(materialKey, () => createProductionPrimitiveMaterial(pseudo));
      items.push({
        geometry,
        material: material as RenderItem["material"],
        modelMatrix: nodeModel,
        instanceTransforms: transforms,
        instanceColors: colors,
        castShadow: (node as { castShadow?: boolean }).castShadow ?? true
      } as RenderItem);
    }
    out.addItems(items);
    return { mode, geometries: buckets.size, instances: slots.length, draws: items.length, ...(fallbackReason ? { fallbackReason } : {}) };
  }

  // Packed route — pooled geometry + draw-data rows + multiDraw markers.
  const { geometry, entries } = state.packedGeometry();
  const drawData = state.packedDrawData();
  const pseudo = pseudoNodeFor(node, undefined);
  const material = state.materialFor(node.material ?? SHARED_DEFAULT_MATERIAL, () => createProductionPrimitiveMaterial(pseudo)) as RenderItem["material"];
  const items: RenderItem[] = [];
  slots.forEach((slot, drawIndex) => {
    const gid = state.geometryIdAt(slot);
    const entry = entries[gid];
    if (!entry) return;
    // Fold node model × instance local matrix into the draw row.
    const row = new Float32Array(16);
    multiplyMat4Into(row, nodeModel, state.matrices.subarray(slot * 16, slot * 16 + 16));
    drawData.setDraw(drawIndex, {
      model: row,
      baseColor: state.colors.subarray(slot * 4, slot * 4 + 4),
      meta: [entry.firstIndex, entry.baseVertex, entry.indexCount, packDrawDataFlags(state.isVisible(slot), gid)]
    });
    items.push({
      geometry,
      material,
      drawRange: entry.firstIndex >= 0
        ? { start: entry.firstIndex, count: entry.indexCount }
        : { start: entry.baseVertex, count: entry.vertexCount },
      modelMatrix: batchedIdentityMatrix,
      castShadow: (node as { castShadow?: boolean }).castShadow ?? true,
      multiDraw: { mode, drawIndex, drawData: drawData.upload() }
    } as unknown as RenderItem);
  });
  out.addItems(items);
  return { mode, geometries: state.geometries.length, instances: slots.length, draws: mode === "multi-draw" ? 1 : items.length, ...(fallbackReason ? { fallbackReason } : {}) };
}

/** Column-major `out = a * b`. */
function multiplyMat4Into(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>): void {
  for (let col = 0; col < 4; col += 1) {
    const b0 = b[col * 4]!, b1 = b[col * 4 + 1]!, b2 = b[col * 4 + 2]!, b3 = b[col * 4 + 3]!;
    out[col * 4] = a[0]! * b0 + a[4]! * b1 + a[8]! * b2 + a[12]! * b3;
    out[col * 4 + 1] = a[1]! * b0 + a[5]! * b1 + a[9]! * b2 + a[13]! * b3;
    out[col * 4 + 2] = a[2]! * b0 + a[6]! * b1 + a[10]! * b2 + a[14]! * b3;
    out[col * 4 + 3] = a[3]! * b0 + a[7]! * b1 + a[11]! * b2 + a[15]! * b3;
  }
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
    const state = batchedStateForNode(batchedNode);
    const report = emitBatchedItems(state, batchedNode, ctx, out, 0);
    if (report.mode === "instanced") out.feature("instancing");
    out.set("parityBatched", report);
  },
  update(node, _handle, ctx, out, timeSeconds) {
    registerBatchedDrawShader();
    const batchedNode = node as unknown as AuraBatchedNode;
    const state = batchedStateForNode(batchedNode);
    const report = emitBatchedItems(state, batchedNode, ctx, out, timeSeconds);
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
  readonly material?: AuraMaterialSpec;
  /** "auto" (default): packed multi-draw on the generated path, per-geometry instancing otherwise. */
  readonly multiDraw?: AuraBatchedMeshMode;
  readonly name?: string;
  readonly geometries?: readonly AuraBatchedGeometryInput[];
}

/**
 * `batched.mesh` handle — an `AuraNodeBuilder` (scene-addable, chainable
 * transforms) plus the three.js BatchedMesh mutation API. Builder methods
 * return a fresh handle sharing the same dense state (`batchedId` survives
 * the builder's spread-clone).
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
  override position(x: number, y: number, z: number): AuraNodeBuilder<AuraBatchedNode & { readonly position: import("./types.js").AuraVec3 }> {
    return this.rewrap(super.position(x, y, z) as never) as never;
  }
  override rotate(x: number, y: number, z: number, order?: import("../../contracts/sceneGraph").AuraEulerOrder): AuraNodeBuilder<AuraBatchedNode & { readonly rotation: import("./types.js").AuraVec3; readonly rotationOrder?: import("../../contracts/sceneGraph").AuraEulerOrder }> {
    return this.rewrap(super.rotate(x, y, z, order) as never) as never;
  }
  override quaternion(x: number, y: number, z: number, w: number): AuraNodeBuilder<AuraBatchedNode & { readonly quaternion: import("../../contracts/sceneGraph").AuraQuat }> {
    return this.rewrap(super.quaternion(x, y, z, w) as never) as never;
  }
  override scale(value: number | import("./types.js").AuraVec3): AuraNodeBuilder<AuraBatchedNode & { readonly scale: number | import("./types.js").AuraVec3 }> {
    return this.rewrap(super.scale(value as never) as never) as never;
  }
  override lookAt(x: number, y: number, z: number): AuraNodeBuilder<AuraBatchedNode & { readonly lookAt: import("./types.js").AuraVec3 }> {
    return this.rewrap(super.lookAt(x, y, z) as never) as never;
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

  addInstance(geometryId: number): number {
    return this.state.addInstance(geometryId);
  }

  setMatrixAt(index: number, matrix: Float32Array | readonly number[] | { readonly elements: ArrayLike<number> }): this {
    this.state.setMatrixAt(index, matrix);
    return this;
  }

  getMatrixAt(index: number, out?: Float32Array | number[]): Float32Array | number[] {
    return this.state.getMatrixAt(index, out);
  }

  setColorAt(index: number, color: AuraColor | readonly number[]): this {
    this.state.setColorAt(index, color);
    return this;
  }

  getColorAt(index: number, out?: number[]): number[] {
    return this.state.getColorAt(index, out);
  }

  setVisibleAt(index: number, visible: boolean): this {
    this.state.setVisibleAt(index, visible);
    return this;
  }

  deleteInstance(index: number): this {
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
