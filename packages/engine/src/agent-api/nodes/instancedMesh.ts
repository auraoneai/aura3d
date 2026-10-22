/**
 * SG-01 / parity-L5 — `instances.mesh(geometry, material, count)`: three.js
 * `InstancedMesh` parity over the L5 dense-instance store.
 *
 * The node is `kind:"batched"` with `instanced: true`: all `count` slots are
 * alive at creation and `count` acts as the draw bound, matching three.js
 * `InstancedMesh.count`. `setMatrixAt`/`setColorAt` write the same flat
 * `matrices`/`colors` arrays the renderer uploads through the C-07
 * `InstanceBufferLike` contract — writes are the real GPU path (L5-01), not
 * a decompose-to-spec fallback. `computeBoundingSphere` unions the geometry
 * bounds transformed by every live instance matrix.
 */
import { AuraNodeBuilder } from "./builder.js";
import {
  BatchedMeshState,
  registerBatchedState,
  registerBatchedColorConverter,
  registerBatchedGeometryResolver,
  registerInstancedMeshFactory,
  type AuraBatchedGeometryInput
} from "./batchedState.js";
import { createProductionPrimitiveGeometry } from "../compiler/primitives.js";
import { colorToRgba } from "../colorUtils.js";
import type { AuraBatchedNode, AuraColor, AuraMaterialSpec, AuraPrimitiveNode } from "./types.js";

/** `instances.mesh` geometry input: pooled `Geometry`, builtin name, or custom spec. */
export type AuraInstancedGeometryInput = AuraBatchedGeometryInput;

export interface AuraInstancedMeshBoundingSphere {
  readonly center: readonly [number, number, number];
  readonly radius: number;
}

/** Buffer view matching three.js `mesh.instanceMatrix`/`instanceColor`. */
export interface AuraInstancedBufferView {
  /** Backing dense store — mutate through `setMatrixAt`/`setColorAt` or flip `needsUpdate`. */
  readonly array: Float32Array;
  needsUpdate: boolean;
}

/**
 * `instances.mesh` handle — an `AuraNodeBuilder` (scene-addable) plus the
 * three.js `InstancedMesh` API. The builder's spread-clone keeps the same
 * `batchedId`, so chained handles share one dense state.
 */
export class AuraInstancedMeshHandle extends AuraNodeBuilder<AuraBatchedNode> {
  readonly state: BatchedMeshState;
  readonly instanceMatrix: AuraInstancedBufferView;
  readonly instanceColor: AuraInstancedBufferView;

  constructor(node: AuraBatchedNode, state: BatchedMeshState) {
    super(node);
    this.state = state;
    const self = this;
    this.instanceMatrix = {
      array: state.matrices,
      set needsUpdate(_v: boolean) { self.state.version += 1; },
      get needsUpdate() { return false; }
    };
    this.instanceColor = {
      array: state.colors,
      set needsUpdate(_v: boolean) { self.state.version += 1; },
      get needsUpdate() { return false; }
    };
  }

  private rewrap(builder: AuraNodeBuilder<AuraBatchedNode>): this {
    return new AuraInstancedMeshHandle(builder.toJSON(), this.state) as this;
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

  /** The one registered geometryId (always 0 for instances.mesh). */
  get geometryId(): number {
    return 0;
  }

  /** three.js `InstancedMesh.count` — draw bound ≤ capacity, get/set. */
  get count(): number {
    return this.state.count;
  }
  set count(value: number) {
    this.state.setCount(value);
  }

  /** Allocated capacity (constructor `count`); `count` may draw fewer. */
  get capacity(): number {
    return this.state.capacity;
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

  /** three.js-style explicit flush — uploads are per-frame; bumps the store version. */
  set needsUpdate(_v: boolean) {
    this.state.version += 1;
  }

  /** Union bounding sphere: geometry bounds transformed by each live instance matrix. */
  computeBoundingSphere(): AuraInstancedMeshBoundingSphere {
    const box = this.state.boundingBox();
    const center: [number, number, number] = [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2
    ];
    return {
      center,
      radius: Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) / 2
    };
  }

  get boundingSphere(): AuraInstancedMeshBoundingSphere {
    return this.computeBoundingSphere();
  }

  dispose(): void {
    this.state.dispose();
  }
}

let nextInstancedId = 1;

/**
 * `instances.mesh(geometry, material, count)` — three.js `new InstancedMesh`
 * parity: `count` instances of one geometry under one material.
 */
export function instancedMesh(
  geometry: AuraBatchedGeometryInput,
  material: AuraMaterialSpec | undefined,
  count: number
): AuraInstancedMeshHandle {
  const id = `instanced-${nextInstancedId++}`;
  const state = new BatchedMeshState({ id, capacity: count, instanced: true });
  state.addGeometry(geometry);
  const node: AuraBatchedNode = {
    kind: "batched",
    batchedId: id,
    maxInstances: count,
    multiDraw: "instanced",
    ...(material !== undefined ? { material } : {})
  };
  registerBatchedState(state);
  return new AuraInstancedMeshHandle(node, state);
}

// Registered into the batchedState leaf so `instances.mesh` can reach the
// factory without `instances.ts` statically importing this module — that edge
// closed the builder→physics→primitives→instances→instancedMesh→builder
// eval cycle (see batchedState.ts header). The resolver registration mirrors
// batched.ts so deep imports of this module still resolve geometry inputs.
registerInstancedMeshFactory(instancedMesh);
registerBatchedColorConverter(colorToRgba);
registerBatchedGeometryResolver((input) => {
  if (typeof input === "string") {
    return createProductionPrimitiveGeometry({ kind: "primitive", primitive: input } as AuraPrimitiveNode);
  }
  return createProductionPrimitiveGeometry({ kind: "primitive", primitive: "custom", geometry: input } as AuraPrimitiveNode);
});
