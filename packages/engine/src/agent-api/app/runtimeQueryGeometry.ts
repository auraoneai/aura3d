// CPU-side scene-query geometry for runtime node handles: the owned copy of a
// primitive's vertex buffers that `updateAttribute` writes into, so queries
// (bounds, raycasts) see runtime edits without changing the spec submitted to
// rendering. Extracted unchanged from runtimeNodes.ts (max-file-lines gate).

import type { AuraRuntimeNodeHandle } from "../nodes/types.js";
import { computeAuraGeometryNormals, normalizeGeometryAttributes, type AuraCustomGeometrySpec, type AuraCustomVertexAttributeSpec } from "../RootGeometry.js";
import type { MutableAuraRuntimeSceneNode } from "./runtimeNodes.js";

/** Live CPU-side state used by scene queries. The renderer publishes its actual
 * submitted items here, so animated models use the current palette and morph
 * weights rather than a guessed bind pose. The registry owns these references. */
interface OwnedQueryCustomAttr {
  readonly itemSize: number;
  readonly stride: number;
  readonly offset: number;
  readonly data: number[] | ArrayBufferView;
  readonly probe: ArrayLike<number> & Record<number, number> | null;
  rawSpec: AuraCustomVertexAttributeSpec;
}

interface OwnedQueryBufferState {
  readonly baseGeometry: AuraCustomGeometrySpec | undefined;
  spec: AuraCustomGeometrySpec;
  readonly vertexCount: number;
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  uv1s?: Float32Array;
  colors?: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
  readonly custom: Map<string, OwnedQueryCustomAttr>;
}

/** Query geometry published for a handle (runtime `setGeometry` or owned attribute edits). */
export const runtimeQueryGeometry = new WeakMap<AuraRuntimeNodeHandle, AuraCustomGeometrySpec>();
/** Owned, writable copies of the query geometry buffers, keyed by handle. */
export const runtimeOwnedQueryBuffers = new WeakMap<AuraRuntimeNodeHandle, OwnedQueryBufferState>();

function buildOwnedQueryBufferState(spec: AuraCustomGeometrySpec, baseGeometry: AuraCustomGeometrySpec | undefined): OwnedQueryBufferState {
  const normalized = normalizeGeometryAttributes(spec);
  const positions = normalized.positions.slice();
  const normals = normalized.normals?.slice();
  const uvs = normalized.uvs?.slice();
  const uv1s = normalized.uv1s?.slice();
  const colors = normalized.colors?.slice();
  const custom = new Map<string, OwnedQueryCustomAttr>();
  const customRecord: Record<string, AuraCustomVertexAttributeSpec> = {};
  if (spec.attributes) {
    for (const [attrName, attribute] of Object.entries(spec.attributes)) {
      const raw = attribute.data;
      const data = Array.isArray(raw) ? [...raw] : raw.slice();
      const probe = !Array.isArray(data) && !(data instanceof Float32Array)
        ? new (data.constructor as { new(length: number): ArrayLike<number> & Record<number, number> })(1)
        : null;
      const rawSpec = { ...attribute, data: data as typeof attribute.data };
      customRecord[attrName] = rawSpec;
      custom.set(attrName, {
        itemSize: attribute.itemSize,
        stride: attribute.stride ?? attribute.itemSize,
        offset: attribute.offset ?? 0,
        data,
        probe,
        rawSpec
      });
    }
  }
  const ownedSpec: AuraCustomGeometrySpec = {
    ...spec,
    positions,
    ...(normals ? { normals } : {}),
    ...(uvs ? { uvs } : {}),
    ...(uv1s ? { uv1s } : {}),
    ...(colors ? { colors } : {}),
    ...(spec.attributes ? { attributes: customRecord } : {})
  };
  runtimeGeometryPositionsCache.set(ownedSpec, positions);
  return {
    baseGeometry,
    spec: ownedSpec,
    vertexCount: normalized.vertexCount,
    positions,
    normals,
    uvs,
    uv1s,
    colors,
    indices: normalized.indices,
    custom
  };
}

export function applyOwnedQueryGeometryUpdate(
  handle: AuraRuntimeNodeHandle,
  node: MutableAuraRuntimeSceneNode,
  name: string,
  update: { readonly array: ArrayLike<number>; readonly offset: number },
  /** CPU query snapshot of a node with no published query geometry yet (built by runtimeNodes from compiler/primitives). */
  queryGeometryForUpdate: (node: MutableAuraRuntimeSceneNode) => AuraCustomGeometrySpec | undefined
): void {
  const baseGeometry = node.kind === "primitive" ? node.geometry : undefined;
  let state = runtimeOwnedQueryBuffers.get(handle);
  if (!state || state.baseGeometry !== baseGeometry) {
    const querySpec = runtimeQueryGeometry.get(handle) ?? queryGeometryForUpdate(node);
    if (!querySpec) return;
    state = buildOwnedQueryBufferState(querySpec, baseGeometry);
    runtimeOwnedQueryBuffers.set(handle, state);
  }
  const lineDefaults = node.kind === "line";
  const aliases: Record<string, "positions" | "normals" | "uvs" | "uv1s" | "colors"> = {
    position: "positions", positions: "positions", normal: "normals", normals: "normals",
    uv: "uvs", uv0: "uvs", uvs: "uvs", uv1: "uv1s", uv1s: "uv1s", color: "colors", colors: "colors"
  };
  const field = aliases[name];
  if (field) {
    let source = state[field];
    if (!source) {
      if (field === "colors" && lineDefaults) {
        source = new Float32Array(state.vertexCount * 4).fill(1);
      } else if (field === "normals") {
        source = state.spec.topology === "lines" || state.spec.topology === "points"
          ? Float32Array.from({ length: state.positions.length }, (_, i) => i % 3 === 1 ? 1 : 0)
          : computeAuraGeometryNormals({ positions: state.positions, indices: state.indices });
      }
      if (!source) throw new Error(`Aura3D geometry has no attribute "${name}".`);
      state[field] = source;
    }
    const itemSize = field === "uvs" || field === "uv1s" ? 2 : field === "colors" ? 4 : 3;
    if (update.array.length % itemSize || update.offset + update.array.length / itemSize > state.vertexCount) {
      throw new RangeError(`Aura3D attribute "${name}" update exceeds its vertex range or has incomplete items.`);
    }
    const baseOffset = update.offset * itemSize;
    for (let index = 0, len = update.array.length; index < len; index += 1) {
      source[baseOffset + index] = update.array[index]!;
    }
    state.spec = { ...state.spec, [field]: source, ...(field === "positions" ? { bounds: undefined } : {}) };
    runtimeGeometryPositionsCache.set(state.spec, state.positions);
    runtimeQueryGeometry.set(handle, state.spec);
    return;
  }
  const entry = state.custom.get(name);
  if (!entry) throw new Error(`Aura3D geometry has no attribute "${name}".`);
  const { itemSize, stride, offset: attributeOffset, data, probe } = entry;
  if (update.array.length % itemSize || update.offset + update.array.length / itemSize > state.vertexCount) {
    throw new RangeError(`Aura3D attribute "${name}" update exceeds its vertex range or has incomplete items.`);
  }
  if (probe) {
    for (let i = 0, len = update.array.length; i < len; i += 1) {
      const val = update.array[i]!;
      probe[0] = val;
      if (probe[0] !== val) {
        throw new RangeError(`Aura3D attribute "${name}" update is outside its declared storage range.`);
      }
    }
  }
  const writable = data as unknown as Record<number, number>;
  for (let i = 0, len = update.array.length; i < len; i += 1) {
    const destination = (update.offset + Math.floor(i / itemSize)) * stride + attributeOffset + (i % itemSize);
    writable[destination] = update.array[i]!;
  }
  entry.rawSpec = { ...entry.rawSpec, data: data as typeof entry.rawSpec.data };
  state.spec = { ...state.spec, attributes: { ...state.spec.attributes, [name]: entry.rawSpec } };
  runtimeGeometryPositionsCache.set(state.spec, state.positions);
  runtimeQueryGeometry.set(handle, state.spec);
}

const runtimeGeometryPositionsCache = new WeakMap<AuraCustomGeometrySpec, Float32Array>();

export function getNormalizedGeometryPositions(geometry: AuraCustomGeometrySpec): Float32Array {
  let positions = runtimeGeometryPositionsCache.get(geometry);
  if (!positions) {
    positions = normalizeGeometryAttributes(geometry).positions;
    runtimeGeometryPositionsCache.set(geometry, positions);
  }
  return positions;
}
