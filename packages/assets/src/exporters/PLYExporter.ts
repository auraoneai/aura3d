import {
  findUnsupportedExportProperties,
  readAttributeNormalized,
  transformNormal,
  transformPosition,
  traverseScene,
  type AuraExportAttribute,
  type AuraExportPrimitive,
  type AuraExportResult,
  type AuraExportScene
} from "./ExportContext";

/** PLY 1.0 scalar vertices, triangular faces and indexed line segments. */
export interface PLYExportOptions {
  /** Explicit PLY encoding. Conflicting binary / bigEndian options are rejected. */
  readonly format?: "ascii" | "binary_little_endian" | "binary_big_endian";
  readonly binary?: boolean;
  readonly bigEndian?: boolean;
  readonly signal?: AbortSignal;
  readonly maxVertices?: number;
  readonly maxBytes?: number;
}

type Warning = AuraExportResult["warnings"][number];
type PrimitiveJob = {
  primitive: AuraExportPrimitive;
  path: string;
  world: readonly number[];
  base: number;
  vertexCount: number;
  sourceVertexCount: number;
  reverseWinding: boolean;
  normalsUsable: boolean;
};

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const HARD_MAX_BYTES = 512 * 1024 * 1024;
const HARD_MAX_VERTICES = 5_000_000;
const KNOWN_ATTRIBUTES = new Set(["POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0"]);

/**
 * Serializes the selected scene in its source units. PLY stores one flat vertex stream;
 * node transforms are baked, with the resulting hierarchy and non-mesh scene
 * features reported as losses. A PLY `edge` element retains indexed lines.
 * Scalars use standard PLY `double`, so numeric values need not be quantized.
 */
export function exportPLY(scene: AuraExportScene, options: PLYExportOptions = {}): AuraExportResult {
  checkAbort(options.signal);
  const format = options.format ?? (options.binary || options.bigEndian ? (options.bigEndian ? "binary_big_endian" : "binary_little_endian") : "ascii");
  if (!["ascii", "binary_little_endian", "binary_big_endian"].includes(format)) throw new RangeError(`Unsupported PLY format: ${String(format)}`);
  if (options.binary !== undefined && options.binary !== (format !== "ascii")) throw new TypeError("PLY binary option conflicts with the selected format");
  if (options.bigEndian === true && format !== "binary_big_endian") throw new TypeError("PLY bigEndian option requires binary_big_endian format");
  if (options.bigEndian === false && format === "binary_big_endian") throw new TypeError("PLY bigEndian option conflicts with binary_big_endian format");
  const maxBytes = limit(options.maxBytes, DEFAULT_MAX_BYTES, HARD_MAX_BYTES, "maxBytes");
  const maxVertices = limit(options.maxVertices, 1_000_000, HARD_MAX_VERTICES, "maxVertices");
  const warnings: Warning[] = [...(scene.sourceWarnings ?? [])];
  const warn = (code: string, message: string, path?: string): void => { warnings.push(path === undefined ? { code, message } : { code, path, message }); };
  const jobs: PrimitiveJob[] = [];
  const visitedNodes = new Set<number>();
  const usedMeshes = new Set<number>();
  let vertexCount = 0;
  let faceCount = 0;
  let edgeCount = 0;
  let pointCount = 0;
  let hasNormal = false;
  let hasUv = false;
  let hasColor = false;
  let hasAlpha = false;
  let transformed = false;

  traverseScene(scene, (node, nodeIndex, world) => {
    checkAbort(options.signal);
    visitedNodes.add(nodeIndex);
    if (node.mesh === undefined) return;
    if (!isIdentity(world)) transformed = true;
    usedMeshes.add(node.mesh);
    const mesh = scene.meshes?.[node.mesh];
    if (!mesh) throw new RangeError(`nodes[${nodeIndex}].mesh references a missing mesh`);
    for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex++) {
      const primitive = mesh.primitives[primitiveIndex];
      const path = `meshes[${node.mesh}].primitives[${primitiveIndex}]`;
      const position = primitive.attributes.POSITION;
      if (!position || position.itemSize !== 3) throw new TypeError(`${path}.attributes.POSITION must contain 3 components per vertex`);
      const sourceVertexCount = position.values.length / 3;
      const count = primitive.indices?.length ?? sourceVertexCount;
      const mode = primitive.mode ?? "triangles";
      if (mode === "triangles" && count % 3 !== 0) throw new RangeError(`${path} triangle index count must be a multiple of 3`);
      if (mode === "lines" && count % 2 !== 0) throw new RangeError(`${path} line index count must be a multiple of 2`);
      if (mode !== "triangles" && mode !== "lines" && mode !== "points") throw new RangeError(`${path} has unsupported topology ${String(mode)}`);
      const jobVertices = mode === "points" && primitive.indices ? count : sourceVertexCount;
      if (!Number.isSafeInteger(jobVertices) || vertexCount + jobVertices > maxVertices) throw new RangeError(`PLY vertex limit of ${maxVertices} exceeded`);
      const normal = primitive.attributes.NORMAL;
      const uv = primitive.attributes.TEXCOORD_0;
      const color = primitive.attributes.COLOR_0;
      checkAttribute(normal, 3, sourceVertexCount, `${path}.attributes.NORMAL`);
      checkAttribute(uv, 2, sourceVertexCount, `${path}.attributes.TEXCOORD_0`);
      if (color && color.itemSize !== 3 && color.itemSize !== 4) throw new TypeError(`${path}.attributes.COLOR_0 must have 3 or 4 components`);
      checkAttribute(color, color?.itemSize ?? 3, sourceVertexCount, `${path}.attributes.COLOR_0`);
      let normalsUsable = !!normal;
      if (normal) {
        try { transformNormal(world, [1, 0, 0]); }
        catch (error) {
          if (!(error instanceof RangeError)) throw error;
          normalsUsable = false;
          warn("NORMAL_TRANSFORM_SINGULAR", "Normals cannot be transformed by a singular world matrix and are written as zero vectors.", path);
        }
      }
      for (const [semantic, attribute] of Object.entries(primitive.attributes)) {
        if (!KNOWN_ATTRIBUTES.has(semantic)) {
          warn("ATTRIBUTE_UNSUPPORTED", `PLY export omits ${semantic}.`, `${path}.attributes.${semantic}`);
        } else if (isIntegerAttribute(attribute)) {
          warn("ATTRIBUTE_COMPONENT_TYPE_CONVERTED", `${semantic} is written as double; the original integer component encoding is not retained.`, `${path}.attributes.${semantic}`);
        }
      }
      if (primitive.targets?.length) warn("MORPH_TARGETS_UNSUPPORTED", "PLY does not retain morph targets.", path);
      if (primitive.material !== undefined) warn("MATERIAL_UNSUPPORTED", "PLY does not retain the primitive material or its textures.", path);
      const determinant = determinant3(world);
      jobs.push({ primitive, path, world: [...world], base: vertexCount, vertexCount: jobVertices, sourceVertexCount, reverseWinding: determinant < 0, normalsUsable });
      vertexCount += jobVertices;
      if (mode === "triangles") faceCount += count / 3;
      else if (mode === "lines") edgeCount += count / 2;
      else pointCount += jobVertices;
      hasNormal ||= !!normal;
      hasUv ||= !!uv;
      hasColor ||= !!color;
      hasAlpha ||= color?.itemSize === 4;
    }
  }, options.signal);
  warnings.push(...findUnsupportedExportProperties(scene));
  if (vertexCount > 0xffffffff || faceCount > 0xffffffff || edgeCount > 0xffffffff) throw new RangeError("PLY element count exceeds 32-bit limits");
  if (scene.nodes.length > 1 || scene.nodes.some((node) => (node.children?.length ?? 0) > 0)) warn("SCENE_HIERARCHY_FLATTENED", "PLY stores a flat mesh and does not retain scene node hierarchy.");
  if (transformed) warn("TRANSFORMS_BAKED", "World transforms are baked into PLY vertex positions and normals.");
  if (jobs.length > 1) warn("MESH_GROUPS_FLATTENED", "PLY combines multiple mesh primitives into one vertex and element stream.");
  if (pointCount && (faceCount || edgeCount)) warn("POINT_TOPOLOGY_AMBIGUOUS", "Standalone points are written as vertices; generic PLY readers cannot distinguish them from unreferenced mesh vertices when faces or edges are also present.");
  if (scene.nodes.some((node) => node.name) || scene.meshes?.some((mesh) => mesh.name)) warn("SCENE_NAMES_UNSUPPORTED", "PLY does not retain node or mesh names.");
  if (visitedNodes.size < scene.nodes.length) warn("UNREFERENCED_NODES_OMITTED", "Nodes outside the selected scene roots are omitted.");
  if (usedMeshes.size < (scene.meshes?.length ?? 0)) warn("UNREFERENCED_MESHES_OMITTED", "Meshes not referenced by the selected scene roots are omitted.");
  if (scene.materials?.length && !warnings.some((warning) => warning.code === "MATERIAL_UNSUPPORTED")) warn("MATERIAL_UNSUPPORTED", "PLY does not retain materials.");
  if (scene.cameras?.length) warn("CAMERAS_UNSUPPORTED", "PLY does not retain cameras.");
  if (scene.lights?.length) warn("LIGHTS_UNSUPPORTED", "PLY does not retain lights.");
  if (scene.skins?.length || scene.nodes.some((node) => node.skin !== undefined)) warn("SKINS_UNSUPPORTED", "PLY does not retain skins.");
  if (scene.nodes.some((node) => node.weights?.length) || scene.meshes?.some((mesh) => mesh.weights?.length)) warn("MORPH_WEIGHTS_UNSUPPORTED", "PLY does not retain morph weights.");
  if (scene.animations?.length) warn("ANIMATIONS_UNSUPPORTED", "PLY does not retain animation.");
  if (scene.dependencies?.length) warn("DEPENDENCIES_UNSUPPORTED", "PLY does not retain external scene dependencies.");
  if (scene.metersPerUnit === undefined) warn("UNITS_UNKNOWN", "Source units are not specified; PLY coordinates are written without conversion.");
  if (vertexCount && scene.upAxis === undefined) warn("UP_AXIS_UNKNOWN", "Source up-axis is not specified; PLY coordinates are written without axis conversion.");
  if (hasUv && scene.uvOrigin === undefined) warn("UV_ORIGIN_UNKNOWN", "Source UV origin is not specified; PLY texture coordinates are written without conversion.");
  if (scene.metersPerUnit !== undefined || scene.upAxis !== undefined || scene.uvOrigin !== undefined) {
    warn("COORDINATE_CONVENTIONS_NONSTANDARD", "Units, up-axis, and UV origin are recorded in Aura3D PLY comments; generic PLY readers may ignore them.");
  }
  for (const job of jobs) {
    for (const [enabled, semantic, fallback] of [[hasNormal, "NORMAL", "zero normal"], [hasUv, "TEXCOORD_0", "zero UV"], [hasColor, "COLOR_0", "white color"]] as const) {
      if (enabled && !job.primitive.attributes[semantic]) warn("ATTRIBUTE_DEFAULTED", `Missing ${semantic} values are written as ${fallback} to share one PLY vertex layout.`, job.path);
    }
    if (hasAlpha && job.primitive.attributes.COLOR_0?.itemSize === 3) warn("ATTRIBUTE_DEFAULTED", "A missing color alpha is written as 1.", job.path);
  }

  const metadataComments = metadataLines(scene, warn, Math.min(maxBytes, 1_048_576));
  const properties = ["property double x", "property double y", "property double z"];
  if (hasNormal) properties.push("property double nx", "property double ny", "property double nz");
  if (hasUv) properties.push("property double u", "property double v");
  if (hasColor) properties.push("property double red", "property double green", "property double blue");
  if (hasAlpha) properties.push("property double alpha");
  const header = [
    "ply", `format ${format} 1.0`, "comment Generated by Aura3D; positions retain source units", ...metadataComments,
    `element vertex ${vertexCount}`, ...properties,
    `element face ${faceCount}`, "property list uchar uint vertex_indices",
    `element edge ${edgeCount}`, "property uint vertex1", "property uint vertex2", "end_header", ""
  ].join("\n");
  const headerBytes = new TextEncoder().encode(header);
  if (headerBytes.length > maxBytes) throw new RangeError(`PLY output exceeds maxBytes ${maxBytes}`);
  const scalarCount = properties.length;
  const outOfRangeColorJobs = new Set<PrimitiveJob>();
  const zeroNormalJobs = new Set<PrimitiveJob>();

  function vertex(job: PrimitiveJob, localIndex: number): number[] {
    const primitive = job.primitive;
    const sourceIndex = primitive.mode === "points" && primitive.indices ? primitive.indices[localIndex] : localIndex;
    const position = readAttributeNormalized(primitive.attributes.POSITION, sourceIndex);
    const values: number[] = [...transformPosition(job.world, [position[0], position[1], position[2]])];
    if (hasNormal) {
      const sourceNormal = primitive.attributes.NORMAL;
      const normal = sourceNormal && job.normalsUsable ? readAttributeNormalized(sourceNormal, sourceIndex) : undefined;
      if (normal && Math.hypot(...normal) === 0 && !zeroNormalJobs.has(job)) {
        warn("ZERO_NORMAL", "A zero-length source normal is retained as zero because its direction is undefined.", `${job.path}.attributes.NORMAL`);
        zeroNormalJobs.add(job);
      }
      values.push(...(normal && Math.hypot(...normal) !== 0 ? transformNormal(job.world, [normal[0], normal[1], normal[2]]) : [0, 0, 0]));
    }
    if (hasUv) {
      const sourceUv = primitive.attributes.TEXCOORD_0;
      values.push(...(sourceUv ? readAttributeNormalized(sourceUv, sourceIndex) : [0, 0]));
    }
    if (hasColor) {
      const sourceColor = primitive.attributes.COLOR_0;
      const color = sourceColor ? readAttributeNormalized(sourceColor, sourceIndex) : [1, 1, 1, 1];
      if (sourceColor && color.some((component) => component < 0 || component > 1) && !outOfRangeColorJobs.has(job)) {
        warn("COLOR_RANGE_NONSTANDARD", "Color values outside 0..1 are preserved as doubles; readers expecting normalized float colors may reject or clamp them.", `${job.path}.attributes.COLOR_0`);
        outOfRangeColorJobs.add(job);
      }
      values.push(color[0], color[1], color[2]);
      if (hasAlpha) values.push(color[3] ?? 1);
    }
    if (values.some((value) => !Number.isFinite(value))) throw new RangeError(`${job.path} contains a non-finite transformed component`);
    return values;
  }
  const indexAt = (job: PrimitiveJob, index: number): number => job.base + (job.primitive.indices?.[index] ?? index);

  if (format === "ascii") {
    const lines = [header];
    let byteCount = headerBytes.length;
    const append = (line: string): void => {
      byteCount += line.length;
      if (byteCount > maxBytes) throw new RangeError(`PLY output exceeds maxBytes ${maxBytes}`);
      lines.push(line);
    };
    for (const job of jobs) {
      for (let i = 0; i < job.vertexCount; i++) {
        if ((i & 1023) === 0) checkAbort(options.signal);
        append(`${vertex(job, i).join(" ")}\n`);
      }
    }
    for (const job of jobs) {
      if ((job.primitive.mode ?? "triangles") !== "triangles") continue;
      const count = job.primitive.indices?.length ?? job.sourceVertexCount;
      for (let i = 0; i < count; i += 3) {
        if ((i & 1023) === 0) checkAbort(options.signal);
        const a = indexAt(job, i), b = indexAt(job, i + 1), c = indexAt(job, i + 2);
        append(`3 ${a} ${job.reverseWinding ? c : b} ${job.reverseWinding ? b : c}\n`);
      }
    }
    for (const job of jobs) {
      if (job.primitive.mode !== "lines") continue;
      const count = job.primitive.indices?.length ?? job.sourceVertexCount;
      for (let i = 0; i < count; i += 2) {
        if ((i & 1023) === 0) checkAbort(options.signal);
        append(`${indexAt(job, i)} ${indexAt(job, i + 1)}\n`);
      }
    }
    checkAbort(options.signal);
    return { data: new TextEncoder().encode(lines.join("")), mimeType: "application/octet-stream", warnings, dependencies: [] };
  }

  const byteLength = headerBytes.length + vertexCount * scalarCount * 8 + faceCount * 13 + edgeCount * 8;
  if (!Number.isSafeInteger(byteLength) || byteLength > maxBytes) throw new RangeError(`PLY output exceeds maxBytes ${maxBytes}`);
  const bytes = new Uint8Array(byteLength);
  bytes.set(headerBytes);
  const view = new DataView(bytes.buffer);
  const littleEndian = format === "binary_little_endian";
  let offset = headerBytes.length;
  for (const job of jobs) {
    for (let i = 0; i < job.vertexCount; i++) {
      if ((i & 1023) === 0) checkAbort(options.signal);
      for (const component of vertex(job, i)) { view.setFloat64(offset, component, littleEndian); offset += 8; }
    }
  }
  for (const job of jobs) {
    if ((job.primitive.mode ?? "triangles") !== "triangles") continue;
    const count = job.primitive.indices?.length ?? job.sourceVertexCount;
    for (let i = 0; i < count; i += 3) {
      if ((i & 1023) === 0) checkAbort(options.signal);
      const a = indexAt(job, i), b = indexAt(job, i + 1), c = indexAt(job, i + 2);
      view.setUint8(offset++, 3);
      for (const value of [a, job.reverseWinding ? c : b, job.reverseWinding ? b : c]) { view.setUint32(offset, value, littleEndian); offset += 4; }
    }
  }
  for (const job of jobs) {
    if (job.primitive.mode !== "lines") continue;
    const count = job.primitive.indices?.length ?? job.sourceVertexCount;
    for (let i = 0; i < count; i += 2) {
      if ((i & 1023) === 0) checkAbort(options.signal);
      view.setUint32(offset, indexAt(job, i), littleEndian); offset += 4;
      view.setUint32(offset, indexAt(job, i + 1), littleEndian); offset += 4;
    }
  }
  checkAbort(options.signal);
  return { data: bytes, mimeType: "application/octet-stream", warnings, dependencies: [] };
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("PLY export was aborted");
    error.name = "AbortError";
    throw error;
  }
}

function limit(value: number | undefined, fallback: number, maximum: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new RangeError(`${name} must be an integer from 1 to ${maximum}`);
  return result;
}

function checkAttribute(attribute: AuraExportAttribute | undefined, size: number, vertexCount: number, path: string): void {
  if (attribute && (attribute.itemSize !== size || attribute.values.length !== size * vertexCount)) throw new RangeError(`${path} must contain ${vertexCount} values of size ${size}`);
}

function isIntegerAttribute(attribute: AuraExportAttribute): boolean {
  return attribute.values instanceof Int8Array || attribute.values instanceof Uint8Array || attribute.values instanceof Int16Array || attribute.values instanceof Uint16Array || attribute.values instanceof Uint32Array;
}

function determinant3(m: readonly number[]): number {
  // Compute just the orientation. Multiplying finite tiny pivots can underflow
  // a determinant to zero, so count their signs during pivoted elimination.
  const rows = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  for (const row of rows) {
    const scale = Math.max(...row.map(Math.abs));
    if (scale === 0) return 0;
    for (let column = 0; column < 3; column++) row[column] /= scale;
  }
  let sign = 1;
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (rows[pivot][column] === 0) return 0;
    if (pivot !== column) { [rows[pivot], rows[column]] = [rows[column], rows[pivot]]; sign = -sign; }
    const value = rows[column][column];
    if (value < 0) sign = -sign;
    for (let row = column + 1; row < 3; row++) {
      const factor = rows[row][column] / value;
      for (let next = column + 1; next < 3; next++) rows[row][next] -= factor * rows[column][next];
    }
  }
  return sign;
}

function isIdentity(matrix: readonly number[]): boolean {
  return matrix.every((value, index) => value === (index % 5 === 0 ? 1 : 0));
}

function metadataLines(scene: AuraExportScene, warn: (code: string, message: string, path?: string) => void, budget: number): string[] {
  const comments: string[] = [];
  let usedBytes = 0;
  let budgetReported = false;
  const add = (label: string, value: unknown, path: string): void => {
    if (value === undefined) return;
    if (usedBytes >= budget) {
      if (!budgetReported) warn("METADATA_LIMIT", "Some metadata exceeds the PLY comment budget and is omitted.");
      budgetReported = true;
      return;
    }
    try {
      if (!isJSONValue(value, new Set<object>(), 0, { remaining: 65_536 })) throw new TypeError("metadata is not losslessly JSON serializable");
      const json = JSON.stringify(value);
      if (json === undefined) throw new TypeError("metadata is not JSON serializable");
      if (json.length > 65_536) throw new RangeError("metadata comment exceeds the 64 KiB limit");
      const escaped = json.replace(/[^\x20-\x7e]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
      const line = `comment ${label} ${escaped}`;
      if (usedBytes + line.length + 1 > budget) {
        if (!budgetReported) warn("METADATA_LIMIT", "Some metadata exceeds the PLY comment budget and is omitted.");
        budgetReported = true;
        usedBytes = budget;
        return;
      }
      usedBytes += line.length + 1;
      comments.push(line);
    } catch {
      warn("METADATA_UNSUPPORTED", "Metadata is not JSON-compatible or exceeds the 64 KiB per-comment limit.", path);
    }
  };
  if (scene.metadata !== undefined || scene.nodes.some((node) => node.metadata !== undefined)) {
    warn("METADATA_NONSTANDARD", "Scene and node metadata are recorded in Aura3D PLY comments; generic PLY readers may ignore them.");
  }
  add("aura3d_scene_metadata", scene.metadata, "metadata");
  add("aura3d_meters_per_unit", scene.metersPerUnit, "metersPerUnit");
  add("aura3d_up_axis", scene.upAxis, "upAxis");
  add("aura3d_uv_origin", scene.uvOrigin, "uvOrigin");
  scene.nodes.forEach((node, index) => add(`aura3d_node_${index}_metadata`, node.metadata, `nodes[${index}].metadata`));
  return comments;
}

function isJSONValue(value: unknown, ancestors: Set<object>, depth: number, budget: { remaining: number }): boolean {
  if (depth > 64 || --budget.remaining < 0) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") { budget.remaining -= value.length; return budget.remaining >= 0; }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  if (Array.isArray(value) && (value.length > budget.remaining || Object.keys(value).length !== value.length)) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  ancestors.add(value);
  const entries = Object.entries(value);
  const valid = entries.every(([key, entry]) => {
    budget.remaining -= key.length;
    return budget.remaining >= 0 && isJSONValue(entry, ancestors, depth + 1, budget);
  });
  ancestors.delete(value);
  return valid;
}
