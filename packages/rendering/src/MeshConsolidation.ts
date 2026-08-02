import { Geometry } from "./Geometry";
import { IndexBuffer } from "./IndexBuffer";
import type { RenderItem, RenderMaterial } from "./ForwardPass";
import { VertexBuffer } from "./VertexBuffer";
import type { VertexFormat } from "./VertexFormat";
import { type Mat4 } from "@aura3d/scene";

/**
 * Merges distinct static geometries that share a material into single vertex/index buffers.
 *
 * This is the complement to `batchStaticRenderItems`, and the distinction matters. Static *batching*
 * instances one geometry many times, so it only helps when the same buffer is reused. Architectural
 * GLBs exported from level editors are usually the opposite case: every mesh primitive owns unique
 * geometry, so batching cannot merge anything even when the primitives share a material.
 *
 * Measured on `auraClashDuelStage`: 85 mesh primitives with 85 distinct attribute sets but only 13
 * distinct material definitions. Batching left it at 207 draw calls; consolidation collapses the
 * primitives that share a material into one draw each.
 *
 * The merge is only valid for geometry that is genuinely static, because each source geometry's model
 * matrix is **baked into its vertex positions**. Anything that must move, deform, or be culled
 * independently is excluded rather than merged.
 */

/**
 * Caches a consolidation result so the merge runs once for a stable input set.
 *
 * Merging walks every vertex and allocates new buffers, which is far too expensive to repeat per
 * frame: measured on the Aura Clash arena, re-merging each frame cut draw calls 230 -> 53 but pushed
 * frame time to **247 ms**. The inputs it is used for are static by definition, so the result can be
 * reused as long as the identity and transform of every input is unchanged.
 */
export function createStaticMeshConsolidationCache(): {
  consolidate(items: readonly MeshConsolidationInput[], options?: MeshConsolidationOptions): MeshConsolidationResult;
} {
  let cachedKey: string | null = null;
  let cachedResult: MeshConsolidationResult | null = null;
  const geometryIds = new WeakMap<object, number>();
  const materialIds = new WeakMap<object, number>();
  let nextId = 1;
  const idOf = (ids: WeakMap<object, number>, resource: object): number => {
    const existing = ids.get(resource);
    if (existing !== undefined) return existing;
    const next = nextId++;
    ids.set(resource, next);
    return next;
  };

  return {
    consolidate(items, options) {
      // Key on resource identity plus the exact transforms, so any real change re-merges while a
      // steady-state frame reuses the cached buffers.
      //
      // Note the granularity: this caches the whole submitted set. A caller that mixes genuinely
      // static architecture with per-frame animated items in one `staticMeshConsolidation` pass will
      // miss on every frame, because the animated transforms change the key. Such callers should
      // consolidate the static subset themselves and pass the merged result through, rather than
      // re-submitting animated geometry for merging.
      const key = items
        .map((item) =>
          `${idOf(geometryIds, item.geometry as unknown as object)}:${idOf(materialIds, item.material as unknown as object)}:${Array.from(item.modelMatrix as ArrayLike<number>).join(",")}`
        )
        .join("|");
      if (cachedKey === key && cachedResult) return cachedResult;
      const result = consolidateStaticMeshes(items, options);
      cachedKey = key;
      cachedResult = result;
      return result;
    }
  };
}

export interface MeshConsolidationInput {
  readonly geometry: Geometry;
  readonly material: RenderMaterial;
  readonly modelMatrix: Mat4 | Float32Array | readonly number[];
  readonly label?: string;
}

export interface MeshConsolidationOptions {
  /**
   * Upper bound on vertices in a merged buffer. Keeps a single merge from producing a buffer so large
   * that it defeats frustum culling or exceeds practical upload sizes.
   */
  readonly maxVerticesPerMesh?: number;
  readonly labelPrefix?: string;
}

export interface MeshConsolidationResult {
  readonly renderItems: readonly RenderItem[];
  readonly inputItems: number;
  readonly submittedItems: number;
  /** Merged buffers produced. */
  readonly mergedMeshes: number;
  /** Items passed through unmerged, either alone in their group or over the vertex cap. */
  readonly passthroughItems: number;
  readonly drawCallReduction: number;
  readonly maxVerticesPerMesh: number;
}

const DEFAULT_MAX_VERTICES_PER_MESH = 65_536;

/**
 * Groups inputs by (vertex format, topology, material) and merges each group into one geometry.
 *
 * Format and topology must match because merged vertices share one buffer layout and one draw
 * topology. Material identity must match because a single draw binds one material.
 */
export function consolidateStaticMeshes(
  items: readonly MeshConsolidationInput[],
  options: MeshConsolidationOptions = {}
): MeshConsolidationResult {
  const maxVerticesPerMesh = options.maxVerticesPerMesh ?? DEFAULT_MAX_VERTICES_PER_MESH;
  if (!Number.isInteger(maxVerticesPerMesh) || maxVerticesPerMesh < 3) {
    throw new Error("Mesh consolidation maxVerticesPerMesh must be an integer >= 3.");
  }
  const labelPrefix = options.labelPrefix ?? "consolidated-mesh";

  const groups = new Map<string, MeshConsolidationInput[]>();
  const materialIds = new WeakMap<object, number>();
  let nextMaterialId = 1;
  const materialId = (material: RenderMaterial): number => {
    const existing = materialIds.get(material as unknown as object);
    if (existing !== undefined) return existing;
    const next = nextMaterialId++;
    materialIds.set(material as unknown as object, next);
    return next;
  };

  for (const item of items) {
    // Only indexed triangle geometry is merged: merging non-indexed or non-triangle topology would
    // change primitive assembly rather than just concatenating buffers.
    if (item.geometry.topology !== "triangles" || !item.geometry.indexBuffer) {
      const group = groups.get(`passthrough:${groups.size}`) ?? [];
      group.push(item);
      groups.set(`passthrough:${groups.size}`, group);
      continue;
    }
    const key = `${formatKey(item.geometry.vertexBuffer.format)}|${item.geometry.topology}|${materialId(item.material)}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const renderItems: RenderItem[] = [];
  let mergedMeshes = 0;
  let passthroughItems = 0;

  for (const [key, group] of groups) {
    if (key.startsWith("passthrough:") || group.length === 1) {
      for (const item of group) {
        renderItems.push({
          geometry: item.geometry,
          material: item.material,
          modelMatrix: item.modelMatrix,
          label: item.label ?? `${labelPrefix}-passthrough`
        });
        passthroughItems += 1;
      }
      continue;
    }

    // Split the group into runs that fit the vertex cap, so one oversized group still merges partially
    // instead of degrading to fully unmerged.
    let run: MeshConsolidationInput[] = [];
    let runVertices = 0;
    const flush = (): void => {
      if (run.length === 0) return;
      if (run.length === 1) {
        const only = run[0]!;
        renderItems.push({
          geometry: only.geometry,
          material: only.material,
          modelMatrix: only.modelMatrix,
          label: only.label ?? `${labelPrefix}-passthrough`
        });
        passthroughItems += 1;
      } else {
        renderItems.push({
          geometry: mergeGeometries(run),
          material: run[0]!.material,
          label: `${labelPrefix}-${mergedMeshes}`
        });
        mergedMeshes += 1;
      }
      run = [];
      runVertices = 0;
    };

    for (const item of group) {
      const vertexCount = item.geometry.vertexBuffer.vertexCount;
      if (vertexCount > maxVerticesPerMesh) {
        // A single geometry larger than the cap can never be merged; emit it as-is.
        flush();
        renderItems.push({
          geometry: item.geometry,
          material: item.material,
          modelMatrix: item.modelMatrix,
          label: item.label ?? `${labelPrefix}-oversized`
        });
        passthroughItems += 1;
        continue;
      }
      if (runVertices + vertexCount > maxVerticesPerMesh) flush();
      run.push(item);
      runVertices += vertexCount;
    }
    flush();
  }

  return {
    renderItems,
    inputItems: items.length,
    submittedItems: renderItems.length,
    mergedMeshes,
    passthroughItems,
    drawCallReduction: items.length - renderItems.length,
    maxVerticesPerMesh
  };
}

/**
 * Concatenates a run of geometries into one buffer, baking each source model matrix into its vertices.
 *
 * Positions are transformed by the full matrix. Normals and tangents are transformed by the matrix's
 * rotation/scale part only, with translation excluded, because they are directions rather than points.
 */
function mergeGeometries(run: readonly MeshConsolidationInput[]): Geometry {
  const format = run[0]!.geometry.vertexBuffer.format;
  const totalVertices = run.reduce((sum, item) => sum + item.geometry.vertexBuffer.vertexCount, 0);
  const merged = new VertexBuffer(format, totalVertices);
  const indices: number[] = [];

  let vertexCursor = 0;
  for (const item of run) {
    const source = item.geometry.vertexBuffer;
    const matrix = toMatrixValues(item.modelMatrix);

    for (let vertex = 0; vertex < source.vertexCount; vertex += 1) {
      const target = vertexCursor + vertex;
      // Copy every attribute through the public API so the buffer's dirty tracking stays correct.
      for (const attribute of format.attributes) {
        const values = [...source.getAttribute(vertex, attribute.semantic)];
        if (attribute.semantic === "position") {
          transformPoint(values, matrix);
        } else if (attribute.semantic === "normal" || attribute.semantic === "tangent") {
          // Directions take rotation/scale only; a 4-component tangent keeps its handedness in `w`.
          transformDirection(values, matrix);
        }
        merged.setAttribute(target, attribute.semantic, values);
      }
    }

    const sourceIndices = item.geometry.indexBuffer!.data;
    for (let index = 0; index < sourceIndices.length; index += 1) {
      indices.push(sourceIndices[index]! + vertexCursor);
    }
    vertexCursor += source.vertexCount;
  }

  return new Geometry(merged, new IndexBuffer(indices, totalVertices), "triangles");
}

/** Transforms a point in place by the full matrix, including translation. */
function transformPoint(values: number[], m: readonly number[]): void {
  const x = values[0]!;
  const y = values[1]!;
  const z = values[2]!;
  values[0] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
  values[1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  values[2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
}

/** Transforms a direction in place: rotation/scale only, translation excluded, then renormalised. */
function transformDirection(values: number[], m: readonly number[]): void {
  const x = values[0]!;
  const y = values[1]!;
  const z = values[2]!;
  const nx = m[0]! * x + m[4]! * y + m[8]! * z;
  const ny = m[1]! * x + m[5]! * y + m[9]! * z;
  const nz = m[2]! * x + m[6]! * y + m[10]! * z;
  const length = Math.hypot(nx, ny, nz) || 1;
  values[0] = nx / length;
  values[1] = ny / length;
  values[2] = nz / length;
}

function toMatrixValues(matrix: Mat4 | Float32Array | readonly number[]): readonly number[] {
  const values = Array.from(matrix as ArrayLike<number>);
  if (values.length !== 16 || !values.every(Number.isFinite)) {
    throw new Error("Mesh consolidation requires a finite mat4 modelMatrix.");
  }
  return values;
}

/** Format identity, so only layout-compatible geometry is merged. */
function formatKey(format: VertexFormat): string {
  return `${format.stride}:${format.attributes.map((a) => `${a.semantic}@${a.offset}x${a.components}`).join(",")}`;
}
