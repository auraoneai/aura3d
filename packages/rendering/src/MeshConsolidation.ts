import { Geometry, type GeometryMorphTarget } from "./Geometry";
import { IndexBuffer } from "./IndexBuffer";
import type { RenderItem, RenderMaterial } from "./ForwardPass";
import { VertexBuffer } from "./VertexBuffer";
import type { VertexFormat } from "./VertexFormat";
import { DEFAULT_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_UNLIT_SHADER_NAME } from "./ShaderLibraryCore";
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

function throwWithCleanupErrors(error: unknown, cleanupErrors: readonly unknown[], message: string): never {
  if (cleanupErrors.length === 0) throw error;
  const detail = error instanceof Error ? `: ${error.message}` : "";
  throw new AggregateError([error, ...cleanupErrors], `${message}${detail}`, { cause: error });
}

function cleanupAfterFailure(error: unknown, resources: Iterable<{ dispose(): void }>, message: string): never {
  const cleanupErrors: unknown[] = [];
  for (const resource of new Set(resources)) {
    try { resource.dispose(); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
  }
  throwWithCleanupErrors(error, cleanupErrors, message);
}

/**
 * Caches a consolidation result so the merge runs once for a stable input set.
 *
 * Merging walks every vertex and allocates new buffers, which is far too expensive to repeat per
 * frame: measured on the Aura Clash arena, re-merging each frame cut draw calls 230 -> 53 but pushed
 * frame time to **247 ms**. The inputs it is used for are static by definition, so the result can be
 * reused as long as the identity and transform of every input is unchanged.
 */
export function createStaticMeshConsolidationCache(): {
  consolidate(items: readonly MeshConsolidationInput[], options?: MeshConsolidationOptions): MeshConsolidationResultWithSources;
  /** Release generated geometry owned by the cache; source geometries remain caller-owned. */
  dispose(): void;
} {
  let snapshot: ConsolidationSnapshot | null = null;
  let cachedResult: MeshConsolidationResultWithSources | null = null;
  let owned = new Set<Geometry>();
  const pendingRetirement = new Set<Geometry>();

  const retirePending = (candidates: Iterable<Geometry> = pendingRetirement): unknown[] => {
    const errors: unknown[] = [];
    for (const geometry of [...candidates]) {
      // Remove before invoking user/device cleanup so a reentrant dispose
      // cannot retire the same geometry twice.
      if (!pendingRetirement.delete(geometry) || geometry.disposed) continue;
      try {
        geometry.dispose();
      } catch (error) {
        errors.push(error);
        if (!geometry.disposed) pendingRetirement.add(geometry);
      }
    }
    return errors;
  };

  const throwRetirementErrors = (errors: readonly unknown[]): void => {
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Static mesh consolidation disposal failed");
  };

  return {
    consolidate(items, options) {
      if (snapshot && cachedResult && snapshotMatches(snapshot, items, options)) return cachedResult;
      const result = consolidateStaticMeshes(items, options);
      const source = new Set(items.map((item) => item.geometry));
      const nextOwned = new Set(result.renderItems.map((item) => item.geometry).filter((geometry) => !source.has(geometry)));
      let nextSnapshot: ConsolidationSnapshot;
      try {
        nextSnapshot = captureSnapshot(items, options);
      } catch (error) {
        for (const geometry of nextOwned) pendingRetirement.add(geometry);
        throwWithCleanupErrors(error, retirePending(nextOwned), "Static mesh consolidation snapshot and cleanup failed");
      }
      // A previously returned geometry may have been submitted as a source in the next call.
      // In that case its ownership has passed to the caller and it must not be disposed here.
      for (const geometry of source) pendingRetirement.delete(geometry);
      for (const geometry of owned) if (!source.has(geometry)) pendingRetirement.add(geometry);
      // Commit the replacement before retiring old outputs: if a disposer
      // throws, the new geometries still have an owner and remain reusable.
      owned = nextOwned;
      snapshot = nextSnapshot;
      cachedResult = result;
      throwRetirementErrors(retirePending());
      return result;
    },
    dispose() {
      snapshot = null;
      cachedResult = null;
      for (const geometry of owned) pendingRetirement.add(geometry);
      owned.clear();
      throwRetirementErrors(retirePending());
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
  /** Items passed through unmerged because they are ineligible, alone, or over the vertex cap. */
  readonly passthroughItems: number;
  readonly drawCallReduction: number;
  readonly maxVerticesPerMesh: number;
}

/** Provenance for each submitted draw, expressed as indices into the input array. */
export interface MeshConsolidationResultWithSources extends MeshConsolidationResult {
  /** Parallel to renderItems; each list retains the input order used inside that draw. */
  readonly sourceIndices: readonly (readonly number[])[];
}

const DEFAULT_MAX_VERTICES_PER_MESH = 65_536;

/**
 * Groups inputs by (vertex format, topology, material) and merges each group into one geometry.
 *
 * Format and topology must match because merged vertices share one buffer layout and one draw
 * topology. Material identity must match because a single draw binds one material.
 * Indexed triangles with per-vertex streams and float32 position/normal/tangent data can be
 * merged; other typed attributes are copied as raw records. Instance streams, draw ranges,
 * groups, morphs, custom shaders, transparency, and transforms that cannot be represented by
 * one identity-model draw pass through independently. The caller owns newly merged geometries;
 * passthrough geometries remain owned by their original owners.
 */
export function consolidateStaticMeshes(
  items: readonly MeshConsolidationInput[],
  options: MeshConsolidationOptions = {}
): MeshConsolidationResultWithSources {
  const maxVerticesPerMesh = options.maxVerticesPerMesh ?? DEFAULT_MAX_VERTICES_PER_MESH;
  if (!Number.isInteger(maxVerticesPerMesh) || maxVerticesPerMesh < 3) {
    throw new Error("Mesh consolidation maxVerticesPerMesh must be an integer >= 3.");
  }
  const labelPrefix = options.labelPrefix ?? "consolidated-mesh";

  type IndexedInput = { readonly item: MeshConsolidationInput; readonly index: number };
  const groups = new Map<string, IndexedInput[]>();
  const materialIds = new WeakMap<object, number>();
  let nextMaterialId = 1;
  const materialId = (material: RenderMaterial): number => {
    const existing = materialIds.get(material as unknown as object);
    if (existing !== undefined) return existing;
    const next = nextMaterialId++;
    materialIds.set(material as unknown as object, next);
    return next;
  };

  for (const [index, item] of items.entries()) {
    // Preserve independent draw semantics when a single merged draw cannot represent them.
    if (!canConsolidate(item)) {
      groups.set(`passthrough:${groups.size}`, [{ item, index }]);
      continue;
    }
    const key = `${formatKey(item.geometry.vertexBuffer.format)}|${item.geometry.topology}|${materialId(item.material)}`;
    const group = groups.get(key);
    if (group) group.push({ item, index });
    else groups.set(key, [{ item, index }]);
  }

  const renderItems: RenderItem[] = [];
  const sourceIndices: number[][] = [];
  let mergedMeshes = 0;
  let passthroughItems = 0;

  try {
    for (const [key, group] of groups) {
      if (key.startsWith("passthrough:") || group.length === 1) {
        for (const { item, index } of group) {
          renderItems.push({
            geometry: item.geometry,
            material: item.material,
            modelMatrix: item.modelMatrix,
            label: item.label ?? `${labelPrefix}-passthrough`
          });
          sourceIndices.push([index]);
          passthroughItems += 1;
        }
        continue;
      }

      // Split the group into runs that fit the vertex cap, so one oversized group still merges partially
      // instead of degrading to fully unmerged.
      let run: IndexedInput[] = [];
      let runVertices = 0;
      const flush = (): void => {
        if (run.length === 0) return;
        if (run.length === 1) {
          const { item: only, index } = run[0]!;
          renderItems.push({
            geometry: only.geometry,
            material: only.material,
            modelMatrix: only.modelMatrix,
            label: only.label ?? `${labelPrefix}-passthrough`
          });
          sourceIndices.push([index]);
          passthroughItems += 1;
        } else {
          renderItems.push({
            geometry: mergeGeometries(run.map(({ item }) => item)),
            material: run[0]!.item.material,
            label: `${labelPrefix}-${mergedMeshes}`
          });
          sourceIndices.push(run.map(({ index }) => index));
          mergedMeshes += 1;
        }
        run = [];
        runVertices = 0;
      };

      for (const entry of group) {
        const { item, index } = entry;
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
          sourceIndices.push([index]);
          passthroughItems += 1;
          continue;
        }
        if (runVertices + vertexCount > maxVerticesPerMesh) flush();
        run.push(entry);
        runVertices += vertexCount;
      }
      flush();
    }
  } catch (error) {
    const source = new Set(items.map((item) => item.geometry));
    cleanupAfterFailure(
      error, renderItems.map((item) => item.geometry).filter((geometry) => !source.has(geometry)),
      "Static mesh consolidation cleanup failed"
    );
  }

  return {
    renderItems,
    // The cache reuses this provenance across frames; callers cannot alter it accidentally.
    sourceIndices: Object.freeze(sourceIndices.map((indices) => Object.freeze(indices))),
    inputItems: items.length,
    submittedItems: renderItems.length,
    mergedMeshes,
    passthroughItems,
    drawCallReduction: items.length - renderItems.length,
    maxVerticesPerMesh
  };
}

/**
 * Expands an indexed geometry in index order, retaining complete vertex records,
 * independent instance streams, groups, draw range, and packed morph channels.
 * The returned geometry owns its new buffers. A non-indexed input is returned unchanged.
 */
export function deindexGeometryToNonIndexed(geometry: Geometry): Geometry {
  if (!geometry.indexBuffer) return geometry;
  // Keep the expansion tied to one index/channel snapshot. A caller-supplied
  // buffer reader may run user code while the new vertex streams are copied.
  const indices = geometry.indexBuffer.data.slice();
  const vertexCount = geometry.vertexBuffer.vertexCount;
  validateIndices(indices, vertexCount);
  const morphTargets = geometry.morphTargets?.map((morph) => expandMorphTarget(morph, indices, vertexCount));

  const buffers: VertexBuffer[] = [];
  try {
    for (const stream of geometry.vertexBuffer.format.streams) {
      const source = geometry.getVertexBuffer(stream.slot);
      const count = stream.stepMode === "vertex" ? indices.length : source.vertexCount;
      const expanded = new VertexBuffer(source.format, count, stream.slot);
      buffers.push(expanded);
      if (stream.stepMode === "instance") {
        expanded.writeBytes(0, source.readBytes());
      } else {
        for (let target = 0; target < indices.length; target += 1) {
          expanded.writeBytes(target * stream.stride, source.readBytes(indices[target]! * stream.stride, stream.stride));
        }
      }
    }
    const bounds = { min: [...geometry.bounds.min] as [number, number, number], max: [...geometry.bounds.max] as [number, number, number] };
    const expanded = new Geometry(buffers[0]!, null, geometry.topology, bounds, buffers.slice(1));
    if (geometry.groups !== undefined) expanded.groups = geometry.groups.map((group) => ({ ...group }));
    if (geometry.drawRange !== undefined) expanded.drawRange = { ...geometry.drawRange };
    if (morphTargets !== undefined) expanded.morphTargets = morphTargets;
    return expanded;
  } catch (error) {
    cleanupAfterFailure(error, buffers, "De-indexing cleanup failed");
  }
}

/** Validate and expand all present channels with the same index ordering. */
function expandMorphTarget(morph: GeometryMorphTarget, indices: Uint16Array | Uint32Array, vertexCount: number): GeometryMorphTarget {
  if (!morph || typeof morph !== "object") throw new TypeError("Cannot de-index an invalid morph target.");
  const snapshot = (channel: GeometryMorphTarget["positions"], label: string): Float32Array | number[] => {
    if (!(channel instanceof Float32Array) && !Array.isArray(channel)) {
      throw new TypeError(`Cannot de-index a morph target whose ${label} data is not a packed float array.`);
    }
    if (channel.length !== vertexCount * 3) {
      throw new Error(`Cannot de-index a morph target whose ${label} count does not match the vertex count.`);
    }
    // Snapshot before reading a vertex stream: its reader may be reentrant.
    const result = channel instanceof Float32Array ? new Float32Array(channel.length) : new Array<number>(channel.length);
    for (let i = 0; i < channel.length; i += 1) {
      const value = channel[i];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Cannot de-index a morph target with non-finite ${label} data.`);
      }
      result[i] = value;
    }
    return result;
  };
  const expand = (channel: Float32Array | number[]): Float32Array | number[] => {
    const expanded = channel instanceof Float32Array ? new Float32Array(indices.length * 3) : new Array<number>(indices.length * 3);
    for (let i = 0; i < indices.length; i += 1) {
      const source = indices[i]! * 3;
      for (let component = 0; component < 3; component += 1) expanded[i * 3 + component] = channel[source + component]!;
    }
    return expanded;
  };
  // Read each channel once so the expansion does not mix revisions.
  const { positions: sourcePositions, normals: sourceNormals, tangents: sourceTangents, ...metadata } = morph;
  const positionSnapshot = snapshot(sourcePositions, "position");
  const normalSnapshot = sourceNormals === undefined ? undefined : snapshot(sourceNormals, "normal");
  const tangentSnapshot = sourceTangents === undefined ? undefined : snapshot(sourceTangents, "tangent");
  return {
    ...metadata,
    positions: expand(positionSnapshot),
    ...(normalSnapshot === undefined ? {} : { normals: expand(normalSnapshot) }),
    ...(tangentSnapshot === undefined ? {} : { tangents: expand(tangentSnapshot) })
  };
}

/** The input contract has one material and transform per draw; these cases require separate draws. */
function canConsolidate(item: MeshConsolidationInput): boolean {
  const geometry = item.geometry;
  const index = geometry.indexBuffer;
  if (geometry.topology !== "triangles" || !index || index.count % 3 !== 0 ||
      geometry.groups !== undefined || geometry.drawRange !== undefined || geometry.morphTargets !== undefined ||
      !supportsMaterialConsolidation(item.material)) return false;
  const format = geometry.vertexBuffer.format;
  if (!format.hasAttribute("position") || format.streams.some((stream) => stream.stepMode !== "vertex")) return false;
  const geometric = format.attributes.filter((attribute) => attribute.semantic === "position" || attribute.semantic === "normal" || attribute.semantic === "tangent");
  for (const attribute of format.attributes) {
    if (!["position", "normal", "tangent", "uv", "uv1", "color"].includes(attribute.semantic)) return false;
    if (format.attributes.some((other) => other !== attribute &&
        (other.shaderLocation === attribute.shaderLocation || other.shaderName === attribute.shaderName))) return false;
    if (geometric.includes(attribute)) {
      if (attribute.type !== "float32" || attribute.components < 3 ||
          (attribute.semantic !== "tangent" && attribute.components !== 3)) return false;
      // Overlapping attributes cannot be independently transformed without changing their other interpretation.
      if (format.attributes.some((other) => other !== attribute && other.bufferSlot === attribute.bufferSlot &&
          attribute.offset < other.offset + other.byteLength && other.offset < attribute.offset + attribute.byteLength)) return false;
    }
  }
  const matrix = toMatrixValues(item.modelMatrix);
  if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) return false;
  // Negative-handed draws alter culling separately in the forward renderer; singular matrices
  // have a different normal-matrix fallback. Neither is equivalent to an identity-model draw.
  const determinant = determinant3(matrix);
  return Number.isFinite(determinant) && determinant > 1e-12;
}

function supportsMaterialConsolidation(material: RenderMaterial): boolean {
  const base = "baseMaterial" in material ? material.baseMaterial : material;
  // Custom shaders and graphs may inspect object-space positions or the model matrix directly.
  if (base.shaderVariant !== undefined || ![DEFAULT_UNLIT_SHADER_NAME, DEFAULT_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_SHADER_NAME].includes(base.shaderKey)) return false;
  const state = base.renderState;
  if ((state.blendMode ?? (state.blend ? "alpha" : "opaque")) !== "opaque") return false;
  // Transmissive objects and blended objects are sorted independently per draw.
  return ["u_transmissionFactor", "u_diffuseTransmissionFactor", "u_volumeThicknessFactor"].every((name) =>
    [base.getParameter(name), material.getParameter(name)].every((value) =>
      typeof value !== "number" || !Number.isFinite(value) || value <= 0.001));
}

/** Concatenate complete per-vertex records and bake the model and normal matrices. */
function mergeGeometries(run: readonly MeshConsolidationInput[]): Geometry {
  const format = run[0]!.geometry.vertexBuffer.format;
  const totalVertices = run.reduce((sum, item) => sum + item.geometry.vertexBuffer.vertexCount, 0);
  const buffers: VertexBuffer[] = [];
  let mergedIndex: IndexBuffer | null = null;
  try {
    for (const stream of format.streams) buffers.push(new VertexBuffer(format, totalVertices, stream.slot));
    const indices: number[] = [];
    let vertexCursor = 0;
    for (const item of run) {
      const geometry = item.geometry;
      const count = geometry.vertexBuffer.vertexCount;
      const matrix = toMatrixValues(item.modelMatrix);
      const normalMatrix = inverseTranspose3(matrix);
      validateIndices(geometry.indexBuffer!.data, count);
      for (let i = 0; i < format.streams.length; i += 1) {
        const stream = format.streams[i]!;
        const source = geometry.getVertexBuffer(stream.slot);
        buffers[i]!.writeBytes(vertexCursor * stream.stride, source.readBytes(0, count * stream.stride));
      }
      for (const attribute of format.attributes) {
        if (attribute.semantic !== "position" && attribute.semantic !== "normal" && attribute.semantic !== "tangent") continue;
        const target = buffers.find((buffer) => buffer.bufferSlot === attribute.bufferSlot)!;
        for (let vertex = 0; vertex < count; vertex += 1) {
          const values = [...target.getAttribute(vertexCursor + vertex, attribute.semantic)];
          if (attribute.semantic === "position") transformPoint(values, matrix);
          else transformDirection(values, normalMatrix);
          target.setAttribute(vertexCursor + vertex, attribute.semantic, values);
        }
      }
      for (const index of geometry.indexBuffer!.data) indices.push(index + vertexCursor);
      vertexCursor += count;
    }
    mergedIndex = new IndexBuffer(indices, totalVertices);
    return new Geometry(buffers[0]!, mergedIndex, "triangles", undefined, buffers.slice(1));
  } catch (error) {
    cleanupAfterFailure(error, mergedIndex ? [...buffers, mergedIndex] : buffers, "Mesh merge cleanup failed");
  }
}

function validateIndices(indices: Uint16Array | Uint32Array, vertexCount: number): void {
  if (indices.length === 0) throw new Error("Cannot process geometry with an empty index buffer.");
  for (const index of indices) {
    if (index >= vertexCount) throw new RangeError(`Index ${index} is outside vertex count ${vertexCount}`);
  }
}

function transformPoint(values: number[], m: readonly number[]): void {
  const [x, y, z] = values;
  values[0] = m[0]! * x! + m[4]! * y! + m[8]! * z! + m[12]!;
  values[1] = m[1]! * x! + m[5]! * y! + m[9]! * z! + m[13]!;
  values[2] = m[2]! * x! + m[6]! * y! + m[10]! * z! + m[14]!;
}

/** Matches the forward shader's normal matrix without per-vertex normalization. */
function transformDirection(values: number[], m: readonly number[]): void {
  const [x, y, z] = values;
  values[0] = m[0]! * x! + m[1]! * y! + m[2]! * z!;
  values[1] = m[3]! * x! + m[4]! * y! + m[5]! * z!;
  values[2] = m[6]! * x! + m[7]! * y! + m[8]! * z!;
}

function determinant3(m: readonly number[]): number {
  return m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) -
    m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) +
    m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
}

/** Row-major inverse transpose of the affine matrix's upper-left 3×3. */
function inverseTranspose3(m: readonly number[]): readonly number[] {
  const [a, b, c, d, e, f, g, h, i] = [m[0]!, m[4]!, m[8]!, m[1]!, m[5]!, m[9]!, m[2]!, m[6]!, m[10]!];
  const determinant = determinant3(m);
  return [
    (e! * i! - f! * h!) / determinant, (f! * g! - d! * i!) / determinant, (d! * h! - e! * g!) / determinant,
    (c! * h! - b! * i!) / determinant, (a! * i! - c! * g!) / determinant, (b! * g! - a! * h!) / determinant,
    (b! * f! - c! * e!) / determinant, (c! * d! - a! * f!) / determinant, (a! * e! - b! * d!) / determinant
  ];
}

function toMatrixValues(matrix: Mat4 | Float32Array | readonly number[]): readonly number[] {
  const values = Array.from(matrix as ArrayLike<number>);
  if (values.length !== 16 || !values.every(Number.isFinite)) {
    throw new Error("Mesh consolidation requires a finite mat4 modelMatrix.");
  }
  return values;
}

/** Include every GPU-visible format property; compact hashes cannot prove equality. */
function formatKey(format: VertexFormat): string {
  return JSON.stringify([
    format.streams.map((s) => [s.slot, s.stride, s.stepMode, s.divisor]),
    format.attributes.map((a) => [a.semantic, a.offset, a.components, a.type, a.normalized, a.integer, a.bufferSlot, a.shaderLocation, a.shaderName])
  ]);
}

interface ConsolidationSnapshot {
  readonly maxVerticesPerMesh: number;
  readonly labelPrefix: string;
  readonly items: readonly {
    readonly geometry: Geometry;
    readonly material: RenderMaterial;
    readonly label: string | undefined;
    readonly topology: Geometry["topology"];
    readonly matrix: readonly number[];
    readonly eligible: boolean;
    readonly format: VertexFormat;
    readonly formatKey: string;
    readonly streams: readonly { readonly buffer: VertexBuffer; readonly revision: number }[];
    readonly index: IndexBuffer | null;
    readonly indices: Uint16Array | Uint32Array | null;
  }[];
}

function captureSnapshot(items: readonly MeshConsolidationInput[], options?: MeshConsolidationOptions): ConsolidationSnapshot {
  return {
    maxVerticesPerMesh: options?.maxVerticesPerMesh ?? DEFAULT_MAX_VERTICES_PER_MESH,
    labelPrefix: options?.labelPrefix ?? "consolidated-mesh",
    items: items.map((item) => {
      const format = item.geometry.vertexBuffer.format;
      const streams = format.streams.map(({ slot }) => {
        const buffer = item.geometry.getVertexBuffer(slot);
        buffer.readBytes(0, 0); // Check that the stream has not been disposed independently.
        return { buffer, revision: buffer.revision };
      });
      return {
        geometry: item.geometry, material: item.material, label: item.label, topology: item.geometry.topology,
        matrix: Array.from(item.modelMatrix as ArrayLike<number>), eligible: canConsolidate(item), format, formatKey: formatKey(format), streams,
        index: item.geometry.indexBuffer, indices: item.geometry.indexBuffer?.data.slice() ?? null
      };
    })
  };
}

function snapshotMatches(snapshot: ConsolidationSnapshot, items: readonly MeshConsolidationInput[], options?: MeshConsolidationOptions): boolean {
  if (snapshot.maxVerticesPerMesh !== (options?.maxVerticesPerMesh ?? DEFAULT_MAX_VERTICES_PER_MESH) ||
      snapshot.labelPrefix !== (options?.labelPrefix ?? "consolidated-mesh") || snapshot.items.length !== items.length) return false;
  return snapshot.items.every((saved, i) => {
    const item = items[i]!;
    const geometry = item.geometry;
    if (geometry !== saved.geometry || item.material !== saved.material || item.label !== saved.label ||
        geometry.topology !== saved.topology || geometry.vertexBuffer.format !== saved.format || formatKey(saved.format) !== saved.formatKey ||
        geometry.indexBuffer !== saved.index || canConsolidate(item) !== saved.eligible) return false;
    const matrix = Array.from(item.modelMatrix as ArrayLike<number>);
    if (matrix.length !== saved.matrix.length || matrix.some((value, j) => !Object.is(value, saved.matrix[j]))) return false;
    for (let j = 0; j < saved.format.streams.length; j += 1) {
      const buffer = geometry.getVertexBuffer(saved.format.streams[j]!.slot);
      buffer.readBytes(0, 0);
      if (buffer !== saved.streams[j]!.buffer || buffer.revision !== saved.streams[j]!.revision) return false;
    }
    const data = geometry.indexBuffer?.data;
    return !data ? saved.indices === null : saved.indices !== null && data.length === saved.indices.length &&
      data.every((value, j) => value === saved.indices![j]);
  });
}
