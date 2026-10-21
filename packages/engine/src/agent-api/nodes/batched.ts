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
import { BatchedGeometryPool, DrawDataTexture, packDrawDataFlags } from "@aura3d/rendering";
import type { PackedGeometryEntry, Texture, RenderItem } from "@aura3d/rendering";
import { qrCoreGeneratorOn } from "@aura3d/rendering";
import { registerShaderChunk, registerShaderFeature, registerDepthVariantFeature } from "@aura3d/rendering/contracts";
import type { NodeHandler, RenderSourceContributions, SceneCompileContext } from "../../contracts/compiler.js";
import { registerNodeHandler } from "../../contracts/compiler.js";
import { AuraNodeBuilder } from "./builder.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { colorToRgba } from "../colorUtils.js";
import { createModelMatrix } from "../sceneMath.js";
import { createProductionPrimitiveGeometry, createProductionPrimitiveMaterial } from "../compiler/primitives.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import type { AuraBatchedNode, AuraBuiltinPrimitive, AuraColor, AuraMaterialSpec, AuraPrimitiveNode } from "./types.js";

/* ------------------------------------------------------------------ */
/* Dense instance state                                                */
/* ------------------------------------------------------------------ */

export type AuraBatchedGeometryInput = Geometry | AuraBuiltinPrimitive | AuraCustomGeometrySpec;

export type AuraBatchedMeshMode = "auto" | "multi-draw" | "loop" | "instanced";

let nextBatchedId = 1;

const IDENTITY_MATRIX = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * The live record behind a `batched.mesh`/`instances.mesh` handle. Retained
 * per `AuraBatchedNode.batchedId` so builder clones (which spread-copy the
 * node) keep pointing at the same store.
 */
export class BatchedMeshState {
  readonly id: string;
  readonly capacity: number;
  /** `instanced` (instances.mesh): all `capacity` slots live at creation; `count` is a draw bound. */
  readonly instanced: boolean;
  readonly mode: AuraBatchedMeshMode;
  readonly maxVertices?: number;
  readonly maxIndices?: number;
  /** Flat mat4s, column-major — exactly the `InstanceBufferLike.setMatrices` layout. */
  readonly matrices: Float32Array;
  /** Flat rgba quads — exactly the `InstanceBufferLike.setColors` layout. */
  readonly colors: Float32Array;
  private readonly geometryIds: Int32Array;
  private readonly alive: Uint8Array;
  private readonly visible: Uint8Array;
  private readonly geometryInputs: AuraBatchedGeometryInput[] = [];
  /** Resolved geometries (parallel to `geometryInputs`); `pool` indexes into it. */
  readonly geometries: Geometry[] = [];
  private liveCount = 0;
  /** Instanced-mesh draw bound (three.js `InstancedMesh.count`); ignored for batched. */
  private instancedCount: number;
  /** Bumped by every write — the handler keys per-frame re-packing on it. */
  version = 0;
  private structureVersion = 0;
  private pool: BatchedGeometryPool | null = null;
  private pooledStructure = -1;
  private pooledGeometry: Geometry | null = null;
  private drawData: DrawDataTexture | null = null;
  private boundsCache: Bounds3 | null = null;
  private materialCache = new WeakMap<object, unknown>();

  constructor(options: {
    readonly id: string;
    readonly capacity: number;
    readonly instanced?: boolean;
    readonly mode?: AuraBatchedMeshMode;
    readonly maxVertices?: number;
    readonly maxIndices?: number;
  }) {
    if (!Number.isInteger(options.capacity) || options.capacity <= 0) {
      throw new RangeError(`batched capacity must be a positive integer, got ${options.capacity}.`);
    }
    this.id = options.id;
    this.capacity = options.capacity;
    this.instanced = options.instanced ?? false;
    this.mode = options.mode ?? "auto";
    this.maxVertices = options.maxVertices;
    this.maxIndices = options.maxIndices;
    this.matrices = new Float32Array(options.capacity * 16);
    this.colors = new Float32Array(options.capacity * 4);
    this.geometryIds = new Int32Array(options.capacity);
    this.alive = new Uint8Array(options.capacity);
    this.visible = new Uint8Array(options.capacity);
    this.instancedCount = this.instanced ? options.capacity : 0;
    for (let i = 0; i < options.capacity; i += 1) {
      this.matrices.set(IDENTITY_MATRIX, i * 16);
      this.colors.set([1, 1, 1, 1], i * 4);
      if (this.instanced) {
        this.alive[i] = 1;
        this.visible[i] = 1;
      }
    }
    if (this.instanced) this.liveCount = options.capacity;
  }

  /** Slot count the node draws: `liveCount` for batched, `instancedCount` for instances.mesh. */
  get count(): number {
    return this.instanced ? this.instancedCount : this.liveCount;
  }

  get poolRevision(): number {
    return this.structureVersion;
  }

  get disposed(): boolean {
    return this.alive.length === 0;
  }

  isAlive(index: number): boolean {
    return this.alive[index] === 1;
  }

  isVisible(index: number): boolean {
    return this.alive[index] === 1 && this.visible[index] === 1;
  }

  geometryIdAt(index: number): number {
    return this.geometryIds[index] ?? -1;
  }

  /** Live, visible slot indices in submission order (draw rows in packed mode). */
  liveSlots(): number[] {
    const limit = this.instanced ? this.instancedCount : this.capacity;
    const out: number[] = [];
    for (let i = 0; i < limit; i += 1) {
      if (this.alive[i] === 1 && this.visible[i] === 1) out.push(i);
    }
    return out;
  }

  /* ---- geometry pool ---- */

  addGeometry(input: AuraBatchedGeometryInput): number {
    const geometry = resolveBatchedGeometry(input);
    const vertices = this.geometries.reduce((n, g) => n + g.vertexBuffer.vertexCount, 0);
    const indices = this.geometries.reduce((n, g) => n + (g.indexBuffer?.count ?? 0), 0);
    if (this.maxVertices !== undefined && vertices + geometry.vertexBuffer.vertexCount > this.maxVertices) {
      throw new RangeError(`batched.mesh "${this.id}": adding geometry would exceed maxVertices ${this.maxVertices}.`);
    }
    if (this.maxIndices !== undefined && indices + (geometry.indexBuffer?.count ?? 0) > this.maxIndices) {
      throw new RangeError(`batched.mesh "${this.id}": adding geometry would exceed maxIndices ${this.maxIndices}.`);
    }
    this.geometryInputs.push(input);
    this.geometries.push(geometry);
    this.structureVersion += 1;
    this.boundsCache = null;
    this.version += 1;
    return this.geometries.length - 1;
  }

  /* ---- instance ops ---- */

  private requireSlot(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.capacity) {
      throw new RangeError(`instance index ${index} out of capacity ${this.capacity}.`);
    }
  }

  addInstance(geometryId: number): number {
    if (this.instanced) throw new RangeError("instances.mesh allocates all slots at creation; use setMatrixAt.");
    if (geometryId < 0 || geometryId >= this.geometries.length) {
      throw new RangeError(`geometryId ${geometryId} is not a registered batched geometry.`);
    }
    let slot = -1;
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.alive[i] === 0) { slot = i; break; }
    }
    if (slot === -1) {
      throw new RangeError(`batched.mesh "${this.id}" is at maxInstances ${this.capacity}.`);
    }
    this.alive[slot] = 1;
    this.visible[slot] = 1;
    this.geometryIds[slot] = geometryId;
    this.matrices.set(IDENTITY_MATRIX, slot * 16);
    this.colors.set([1, 1, 1, 1], slot * 4);
    this.liveCount += 1;
    this.version += 1;
    this.boundsCache = null;
    return slot;
  }

  deleteInstance(index: number): void {
    this.requireSlot(index);
    if (this.alive[index] === 1) {
      this.alive[index] = 0;
      this.liveCount -= 1;
      this.version += 1;
      this.boundsCache = null;
    }
  }

  setMatrixAt(index: number, matrix: Float32Array | readonly number[] | { readonly elements: ArrayLike<number> }): void {
    this.requireSlot(index);
    const src = "elements" in (matrix as { elements?: unknown }) ? (matrix as { elements: ArrayLike<number> }).elements : matrix as ArrayLike<number>;
    if (src.length < 16) throw new RangeError(`setMatrixAt expects 16 floats, got ${src.length}.`);
    for (let i = 0; i < 16; i += 1) this.matrices[index * 16 + i] = Number(src[i]);
    if (this.alive[index] === 0) { this.alive[index] = 1; this.visible[index] = 1; this.liveCount += 1; }
    this.version += 1;
    this.boundsCache = null;
  }

  getMatrixAt(index: number, out?: Float32Array | number[]): Float32Array | number[] {
    this.requireSlot(index);
    const target = out ?? new Float32Array(16);
    for (let i = 0; i < 16; i += 1) target[i] = this.matrices[index * 16 + i]!;
    return target;
  }

  setColorAt(index: number, color: AuraColor | readonly number[]): void {
    this.requireSlot(index);
    const rgba = Array.isArray(color)
      ? ([color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, color[3] ?? 1] as const)
      : colorToRgba(color as AuraColor);
    this.colors.set(rgba, index * 4);
    this.version += 1;
  }

  getColorAt(index: number, out?: number[]): number[] {
    this.requireSlot(index);
    const target = out ?? [0, 0, 0, 0];
    for (let i = 0; i < 4; i += 1) target[i] = this.colors[index * 4 + i]!;
    return target;
  }

  setVisibleAt(index: number, visible: boolean): void {
    this.requireSlot(index);
    this.visible[index] = visible ? 1 : 0;
    this.version += 1;
  }

  /** three.js `InstancedMesh.count` setter — clamps the instanced draw bound. */
  setCount(count: number): void {
    if (!Number.isInteger(count) || count < 0 || count > this.capacity) {
      throw new RangeError(`count ${count} exceeds capacity ${this.capacity}.`);
    }
    this.instancedCount = count;
    this.version += 1;
    this.boundsCache = null;
  }

  /**
   * L5-01 dense write — the `setInstanceTransforms` C-37 seam for batched /
   * instanced-mesh nodes. Contiguous copy into the same flat arrays the
   * renderer uploads through `InstanceBufferLike.setMatrices/setColors` — no
   * matrix→spec decomposition. `colors` is rgb triples (C-37 contract).
   */
  writeInstanceMatrices(matrices: Float32Array, count: number, colors?: Float32Array): void {
    if (!Number.isInteger(count) || count < 0 || count > this.capacity) {
      throw new RangeError(`INSTANCE_CAPACITY_EXCEEDED: count ${count} exceeds capacity ${this.capacity} (or is not a valid count).`);
    }
    if (matrices.length < 16 * count) {
      throw new RangeError(`setInstanceTransforms expects matrices.length >= ${16 * count}, got ${matrices.length}.`);
    }
    if (colors !== undefined && colors.length < 3 * count) {
      throw new RangeError(`setInstanceTransforms expects colors.length >= ${3 * count}, got ${colors.length}.`);
    }
    this.matrices.set(matrices.subarray(0, count * 16), 0);
    for (let i = 0; i < count; i += 1) {
      if (this.alive[i] === 0) { this.alive[i] = 1; this.visible[i] = 1; this.liveCount += 1; }
    }
    if (colors !== undefined) {
      for (let i = 0; i < count; i += 1) {
        this.colors[i * 4] = colors[i * 3]!;
        this.colors[i * 4 + 1] = colors[i * 3 + 1]!;
        this.colors[i * 4 + 2] = colors[i * 3 + 2]!;
      }
    }
    // Capacity survives a small count (matches C-37 stub semantics): slots
    // past `count` hide instead of dropping — instanced meshes flag them
    // invisible (slots stay allocated), batched pools free them.
    for (let i = count; i < this.capacity; i += 1) {
      if (this.alive[i] === 1) {
        if (this.instanced) {
          this.visible[i] = 0;
        } else {
          this.alive[i] = 0;
          this.liveCount -= 1;
        }
      }
    }
    this.version += 1;
    this.boundsCache = null;
  }

  /* ---- packed resources (multi-draw route) ---- */

  /** Shared vertex/index arenas for all registered geometries; rebuilt on structure change. */
  packedPool(): BatchedGeometryPool {
    if (this.pool === null || this.pooledStructure !== this.structureVersion) {
      this.pool?.dispose();
      this.pool = new BatchedGeometryPool();
      for (const geometry of this.geometries) this.pool.pack(geometry);
      this.pooledStructure = this.structureVersion;
      this.pooledGeometry = null;
    }
    return this.pool;
  }

  /** The single `Geometry` view over the packed arenas (per-instance slices via drawRange). */
  packedGeometry(): { geometry: Geometry; entries: readonly PackedGeometryEntry[] } {
    const pool = this.packedPool();
    if (this.pooledGeometry === null) {
      this.pooledGeometry = pool.asGeometry(this.boundingBox());
    }
    const entries = this.geometries.map((g) => pool.entryFor(g)!);
    return { geometry: this.pooledGeometry, entries };
  }

  /** Per-node draw-data texture (one row per draw). */
  packedDrawData(): DrawDataTexture {
    if (this.drawData === null) this.drawData = new DrawDataTexture(Math.max(1, this.capacity));
    return this.drawData;
  }

  /** Cache a material per spec object so every update does not reallocate. */
  materialFor<T>(spec: object, build: () => T): T {
    let material = this.materialCache.get(spec) as T | undefined;
    if (material === undefined) {
      material = build();
      this.materialCache.set(spec, material);
    }
    return material;
  }

  /**
   * Union of per-geometry bounds transformed by each live instance matrix —
   * the conservative whole-mesh bound used for pooled-geometry culling and
   * `computeBoundingSphere`.
   */
  boundingBox(): Bounds3 {
    if (this.boundsCache) return this.boundsCache;
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const slots = this.liveSlots();
    for (const slot of slots) {
      const geometry = this.geometries[this.geometryIds[slot] ?? 0];
      if (!geometry) continue;
      const m = this.matrices;
      const o = slot * 16;
      const { min: gMin, max: gMax } = geometry.bounds;
      for (let cx = 0; cx < 8; cx += 1) {
        const x = (cx & 1) ? gMax[0] : gMin[0];
        const y = (cx & 2) ? gMax[1] : gMin[1];
        const z = (cx & 4) ? gMax[2] : gMin[2];
        const wx = m[o]! * x + m[o + 4]! * y + m[o + 8]! * z + m[o + 12]!;
        const wy = m[o + 1]! * x + m[o + 5]! * y + m[o + 9]! * z + m[o + 13]!;
        const wz = m[o + 2]! * x + m[o + 6]! * y + m[o + 10]! * z + m[o + 14]!;
        if (wx < min[0]) min[0] = wx; if (wx > max[0]) max[0] = wx;
        if (wy < min[1]) min[1] = wy; if (wy > max[1]) max[1] = wy;
        if (wz < min[2]) min[2] = wz; if (wz > max[2]) max[2] = wz;
      }
    }
    if (!slots.length || !Number.isFinite(min[0])) {
      this.boundsCache = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
    } else {
      this.boundsCache = { min, max };
    }
    return this.boundsCache;
  }

  dispose(): void {
    this.pool?.dispose();
    this.pool = null;
    this.pooledGeometry = null;
    this.drawData?.dispose();
    this.drawData = null;
  }
}

/* ---- state registry ---- */

const batchedStates = new Map<string, BatchedMeshState>();

export function batchedStateFor(id: string | undefined): BatchedMeshState | undefined {
  return id === undefined ? undefined : batchedStates.get(id);
}

export function registerBatchedState(state: BatchedMeshState): void {
  batchedStates.set(state.id, state);
}

/** Node → state resolution: `batchedId` wins, else `runtime.id`, else materialize from authored fields. */
export function batchedStateForNode(node: AuraBatchedNode): BatchedMeshState {
  const id = node.batchedId ?? node.runtime?.id;
  const existing = batchedStateFor(id);
  if (existing) return existing;
  // Authored (non-builder) batched node: materialize a state from the node's
  // declarative fields so the kind still renders through the same path.
  const state = new BatchedMeshState({
    id: id ?? `batched-${nextBatchedId++}`,
    capacity: node.maxInstances,
    ...(node.maxVertices !== undefined ? { maxVertices: node.maxVertices } : {}),
    ...(node.maxIndices !== undefined ? { maxIndices: node.maxIndices } : {}),
    ...(node.multiDraw !== undefined ? { mode: node.multiDraw } : {})
  });
  for (const input of node.geometries ?? []) state.addGeometry(input);
  if (!state.geometries.length) state.addGeometry("box");
  (node.instances ?? []).forEach((transform) => {
    const slot = state.addInstance(0);
    const m = createModelMatrix({ kind: "primitive", primitive: "box", ...transform } as AuraPrimitiveNode, { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, false, 0);
    state.setMatrixAt(slot, m);
    const color = node.instanceColors?.[slot];
    if (color !== undefined) state.setColorAt(slot, color);
  });
  registerBatchedState(state);
  return state;
}

function resolveBatchedGeometry(input: AuraBatchedGeometryInput): Geometry {
  if (input instanceof Geometry) return input;
  if (typeof input === "string") {
    return createProductionPrimitiveGeometry({ kind: "primitive", primitive: input } as AuraPrimitiveNode);
  }
  return createProductionPrimitiveGeometry({ kind: "primitive", primitive: "custom", geometry: input } as AuraPrimitiveNode);
}

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
#if defined(WEBGL_multi_draw) && defined(A3D_L5_MULTI_DRAW)
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
      if (marker.drawData) set("u_a3dDrawData", marker.drawData as unknown as never);
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
      modelMatrix: IDENTITY_MATRIX,
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

export const batchedNodeHandler: NodeHandler<{ readonly kind: "batched" }> = {
  kind: "batched",
  owner: "prd15",
  flag: "A3D_PARITY_BATCHING",
  compile(node, ctx, out) {
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
  const id = `batched-${nextBatchedId++}`;
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
