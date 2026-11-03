import { buildMeshBVH, type MeshBVH } from "@aura3d/physics/solverless";
import { Geometry, IndexBuffer, VertexBuffer, VertexFormat } from "@aura3d/rendering";
import type { AuraVec3 } from "./nodes/types.js";

// Building a tree for a tiny draw or a temporary primitive costs more than a
// scan. Bound construction and snapshot memory; larger inputs remain queryable
// through the exact triangle path.
const MIN_TRIANGLES = 32;
const MAX_TRIANGLES = 250_000;
const MAX_VERTICES = 1_000_000;
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;

const nativeReaders = {
  geometryAttribute: Geometry.prototype.getAttributeBuffer,
  geometryStream: Geometry.prototype.getVertexBuffer,
  vertexAttribute: VertexBuffer.prototype.getAttribute,
  vertexDecoded: VertexBuffer.prototype.getDecodedAttribute,
  vertexBytes: VertexBuffer.prototype.readBytes,
  formatAttribute: VertexFormat.prototype.getAttribute,
  indexReadable: IndexBuffer.prototype.assertReadable
};

interface CachedTree {
  readonly primary: VertexBuffer;
  readonly positions: VertexBuffer;
  readonly indices: IndexBuffer | null;
  readonly indexData: Uint16Array | Uint32Array | undefined;
  readonly vertexCount: number;
  readonly positionRevision: number;
  readonly indexRevision: number | undefined;
  readonly positionLayout: string;
  readonly positionBytes: Uint8Array;
  readonly indexBytes: Uint8Array | undefined;
  readonly tree: MeshBVH;
  /** Tree triangle indices map back to the original draw-stream offsets. */
  readonly offsets: readonly number[];
}

// Both keys are weak. Retaining a disposed Geometry no longer keeps its former
// position buffer (and its tree) alive just because a query once used it.
const trees = new WeakMap<Geometry, WeakMap<VertexBuffer, CachedTree>>();

function sameBytes(snapshot: Uint8Array, bytes: Uint8Array): boolean {
  if (snapshot.length !== bytes.length) return false;
  for (let i = 0; i < snapshot.length; i += 1) {
    if (snapshot[i] !== bytes[i]) return false;
  }
  return true;
}

function indexBytes(indices: IndexBuffer | null): Uint8Array | undefined {
  return indices ? new Uint8Array(indices.data.buffer, indices.data.byteOffset, indices.data.byteLength) : undefined;
}

/**
 * Select possible triangle offsets for an undeformed, persistent geometry.
 * Undefined means that the caller must use its existing full triangle scan.
 *
 * The public buffers expose writable ArrayBuffer/typed-array views, so revision
 * counters alone cannot establish freshness. Compare the actual source bytes
 * as well, including direct, unmarked vertex and index writes.
 */
export function sceneQueryTriangleCandidates(
  geometry: Geometry,
  matrix: Float32Array,
  origin: AuraVec3,
  direction: AuraVec3,
  start: number,
  end: number
): readonly number[] | undefined {
  if (start % 3 !== 0 || (end - start) / 3 < MIN_TRIANGLES) return undefined;
  const primary = geometry.vertexBuffer;
  const indices = geometry.indexBuffer;
  const count = indices?.data.length ?? primary.vertexCount;
  if (Math.floor(count / 3) > MAX_TRIANGLES || primary.vertexCount > MAX_VERTICES) return undefined;

  // Overridden readers may synthesize positions or change their result without
  // writing buffer bytes. Their existing scan remains authoritative.
  if (Object.getPrototypeOf(geometry) !== Geometry.prototype ||
      Object.getPrototypeOf(primary) !== VertexBuffer.prototype ||
      Object.getPrototypeOf(primary.format) !== VertexFormat.prototype ||
      geometry.getAttributeBuffer !== nativeReaders.geometryAttribute ||
      geometry.getVertexBuffer !== nativeReaders.geometryStream ||
      primary.format.getAttribute !== nativeReaders.formatAttribute ||
      (indices && (Object.getPrototypeOf(indices) !== IndexBuffer.prototype ||
        indices.assertReadable !== nativeReaders.indexReadable))) return undefined;
  const attribute = primary.format.getAttribute("position");
  const positions = geometry.getAttributeBuffer("position");
  const stream = positions.format.streams.find((candidate) => candidate.slot === positions.bufferSlot);
  // Float32 values retain their exact representation in the existing BVH.
  // Other encodings and instance-rate positions take the full scan.
  if (Object.getPrototypeOf(positions) !== VertexBuffer.prototype ||
      Object.getPrototypeOf(positions.format) !== VertexFormat.prototype ||
      positions.getAttribute !== nativeReaders.vertexAttribute ||
      positions.getDecodedAttribute !== nativeReaders.vertexDecoded ||
      positions.readBytes !== nativeReaders.vertexBytes ||
      positions.format.getAttribute !== nativeReaders.formatAttribute ||
      positions.floats.buffer !== positions.data ||
      attribute.type !== "float32" || !stream || stream.stepMode !== "vertex" ||
      positions.vertexCount < primary.vertexCount) return undefined;
  positions.readBytes(0, 0);
  indices?.assertReadable();
  const currentPositionBytes = new Uint8Array(positions.data);
  const currentIndexBytes = indexBytes(indices);
  if (currentPositionBytes.length + (currentIndexBytes?.length ?? 0) > MAX_SNAPSHOT_BYTES) return undefined;
  const positionLayout = `${attribute.offset}:${attribute.components}:${attribute.bufferSlot}:${attribute.normalized}:${stream.stepMode}:${stream.divisor}`;

  let geometryTrees = trees.get(geometry);
  let cached = geometryTrees?.get(positions);
  if (!cached || cached.primary !== primary || cached.positions !== positions || cached.indices !== indices ||
      cached.indexData !== indices?.data || cached.vertexCount !== primary.vertexCount ||
      cached.positionRevision !== positions.revision || cached.indexRevision !== indices?.revision ||
      cached.positionLayout !== positionLayout || !sameBytes(cached.positionBytes, currentPositionBytes) ||
      (cached.indexBytes === undefined ? currentIndexBytes !== undefined :
        currentIndexBytes === undefined || !sameBytes(cached.indexBytes, currentIndexBytes))) {
    const positionRevision = positions.revision;
    const indexRevision = indices?.revision;
    const positionBytes = currentPositionBytes.slice();
    const savedIndexBytes = currentIndexBytes?.slice();
    const values = new Float32Array(primary.vertexCount * 3);
    const finite = new Uint8Array(primary.vertexCount);
    for (let i = 0; i < primary.vertexCount; i += 1) {
      const p = positions.getDecodedAttribute(i, "position");
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) continue;
      values[i * 3] = p[0]!;
      values[i * 3 + 1] = p[1]!;
      values[i * 3 + 2] = p[2]!;
      finite[i] = 1;
    }
    const validIndices: number[] = [];
    const offsets: number[] = [];
    for (let offset = 0; offset + 2 < count; offset += 3) {
      const a = indices?.data[offset] ?? offset;
      const b = indices?.data[offset + 1] ?? offset + 1;
      const c = indices?.data[offset + 2] ?? offset + 2;
      if (!finite[a] || !finite[b] || !finite[c]) continue;
      validIndices.push(a, b, c);
      offsets.push(offset);
    }
    // A reader can be overridden and mutate/retire resources synchronously.
    // Never publish a tree built from a mixture of old and new bytes.
    if (geometry.vertexBuffer !== primary || geometry.indexBuffer !== indices ||
        geometry.getAttributeBuffer("position") !== positions ||
        positions.revision !== positionRevision || indices?.revision !== indexRevision ||
        !sameBytes(positionBytes, new Uint8Array(positions.data)) ||
        (savedIndexBytes !== undefined && !sameBytes(savedIndexBytes, indexBytes(indices)!))) return undefined;
    cached = {
      primary, positions, indices, indexData: indices?.data, vertexCount: primary.vertexCount,
      positionRevision, indexRevision, positionLayout,
      positionBytes, indexBytes: savedIndexBytes,
      tree: buildMeshBVH(values, Uint32Array.from(validIndices)),
      offsets
    };
    if (!geometryTrees) {
      geometryTrees = new WeakMap<VertexBuffer, CachedTree>();
      trees.set(geometry, geometryTrees);
    }
    geometryTrees.set(positions, cached);
  }

  const candidates: number[] = [];
  const stack = [0];
  while (stack.length > 0) {
    const node = cached.tree.nodes[stack.pop()!];
    if (!node || !rayMayHitTransformedBounds(origin, direction, matrix, node.min, node.max)) continue;
    if (node.triangles) {
      for (const triangle of node.triangles) {
        const offset = cached.offsets[triangle]!;
        if (offset >= start && offset + 2 < end) candidates.push(offset);
      }
    } else {
      if (node.left !== undefined) stack.push(node.left);
      if (node.right !== undefined) stack.push(node.right);
    }
  }
  // The exact path and the public stable hit sort resolve ties in stream order.
  return candidates.sort((a, b) => a - b);
}

/**
 * Conservative world-space slab test. Transforming boxes rather than inverting
 * the ray supports shear, reflection and singular affine matrices without a
 * rounded inverse. Padding absorbs floating-point boundary error; uncertain
 * non-finite calculations deliberately keep the subtree.
 */
function rayMayHitTransformedBounds(
  origin: AuraVec3,
  direction: AuraVec3,
  matrix: Float32Array,
  min: readonly number[],
  max: readonly number[]
): boolean {
  let first = 0;
  let last = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const x = matrix[axis]!, y = matrix[4 + axis]!, z = matrix[8 + axis]!, translation = matrix[12 + axis]!;
    const minX = x * (x >= 0 ? min[0]! : max[0]!);
    const minY = y * (y >= 0 ? min[1]! : max[1]!);
    const minZ = z * (z >= 0 ? min[2]! : max[2]!);
    const maxX = x * (x >= 0 ? max[0]! : min[0]!);
    const maxY = y * (y >= 0 ? max[1]! : min[1]!);
    const maxZ = z * (z >= 0 ? max[2]! : min[2]!);
    const padding = Math.max(1, Math.abs(origin[axis]!), Math.abs(translation),
      Math.abs(minX), Math.abs(minY), Math.abs(minZ), Math.abs(maxX), Math.abs(maxY), Math.abs(maxZ)) * 1e-10;
    const low = minX + minY + minZ + translation - padding;
    const high = maxX + maxY + maxZ + translation + padding;
    if (!Number.isFinite(low) || !Number.isFinite(high)) return true;
    const component = direction[axis]!;
    if (component === 0) {
      if (origin[axis]! < low || origin[axis]! > high) return false;
      continue;
    }
    let entry = (low - origin[axis]!) / component;
    let exit = (high - origin[axis]!) / component;
    if (Number.isNaN(entry) || Number.isNaN(exit)) return true;
    if (entry > exit) [entry, exit] = [exit, entry];
    first = Math.max(first, entry);
    last = Math.min(last, exit);
    if (first > last) return false;
  }
  return true;
}

/** Forget a cached tree when a query observes a retired geometry/buffer. */
export function forgetSceneQueryTree(geometry: Geometry): void {
  trees.delete(geometry);
}
