import { findUnsupportedExportProperties, readAttributeNormalized, transformPosition, traverseScene, type AuraExportAttribute, type AuraExportPrimitive, type AuraExportResult, type AuraExportScene } from "./ExportContext";

/** STL stores independent triangle facets. It has no general scene or material model. */
export const STL_EXPORT_CAPABILITIES = Object.freeze({
  geometry: "triangles",
  encodings: ["ascii", "binary-little-endian"] as const,
  transforms: "baked-into-vertices",
  normals: "geometric-facet-normals",
  solidNames: "ascii-only",
  materials: false,
  hierarchy: false,
  animation: false,
  skinning: false,
  morphTargets: false,
  vertexAttributes: false
} as const);

export interface STLExportOptions {
  /** Binary STL is the default. ASCII supports a separately named solid per primitive. */
  readonly binary?: boolean;
  readonly signal?: AbortSignal;
  /** Limit encoded bytes. Defaults to 128 MiB. */
  readonly maxBytes?: number;
  /** Limit output facets. Defaults to one million. */
  readonly maxTriangles?: number;
}

type Vec3 = readonly [number, number, number];
type Matrix = readonly number[];
type ExportWarning = AuraExportResult["warnings"][number];
interface FacetSource {
  readonly primitive: AuraExportPrimitive;
  readonly matrix: Matrix;
  readonly name: string;
  readonly path: string;
  readonly count: number;
  readonly reversed: boolean;
}

const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_TRIANGLES = 1_000_000;

/**
 * Flatten a scene to an ASCII or binary STL. Facet normals are computed from
 * transformed positions, including reflections and non-uniform scale; winding
 * is reversed for reflections to preserve the original outward orientation. An
 * STL facet cannot retain per-vertex shading normals. Input distances are emitted
 * unchanged in scene units, because STL does not declare a unit convention.
 */
export function exportSTL(scene: AuraExportScene, options: STLExportOptions = {}): AuraExportResult {
  const signal = options.signal;
  const binary = options.binary ?? true;
  const maxBytes = positiveLimit(options.maxBytes, DEFAULT_MAX_BYTES, 512 * 1024 * 1024, "maxBytes");
  const maxTriangles = positiveLimit(options.maxTriangles, DEFAULT_MAX_TRIANGLES, 5_000_000, "maxTriangles");
  checkAbort(signal);
  if (scene.nodes.length > 1_000_000 || (scene.meshes?.length ?? 0) > 1_000_000) throw new Error("STL: scene node or mesh limit exceeded");
  const warnings: ExportWarning[] = [...(scene.sourceWarnings ?? []), ...findUnsupportedExportProperties(scene)];
  const sources: FacetSource[] = [];
  let triangleCount = 0;

  if (scene.metadata && Object.keys(scene.metadata).length) warn("METADATA_LOST", "metadata", "STL cannot store scene metadata or provenance.");
  if (scene.animations?.length) warn("ANIMATION_LOST", "animations", "STL stores a static mesh, not animations.");
  if (scene.skins?.length) warn("SKIN_LOST", "skins", "STL cannot store skinning or inverse bind matrices.");
  if (scene.cameras?.length) warn("CAMERAS_LOST", "cameras", "STL cannot store cameras.");
  if (scene.lights?.length) warn("LIGHTS_LOST", "lights", "STL cannot store lights.");
  if (scene.dependencies?.length) warn("DEPENDENCIES_LOST", "dependencies", "STL cannot reference texture or other dependencies.");
  if (scene.materials?.length) warn("MATERIALS_LOST", "materials", "STL cannot preserve materials or their texture bindings.");
  if (scene.nodes.length) warn("HIERARCHY_FLATTENED", "nodes", "Node hierarchy and transforms are flattened into facet positions.");
  if (scene.metersPerUnit !== undefined && (!Number.isFinite(scene.metersPerUnit) || scene.metersPerUnit <= 0)) throw new Error("STL: metersPerUnit must be finite and positive");
  warn("UNITS_UNDECLARED", undefined, scene.metersPerUnit === undefined
    ? "STL has no unit declaration; coordinates are in the input scene units."
    : `STL has no unit declaration; coordinates are unchanged at ${scene.metersPerUnit} metres per input unit.`);
  if (scene.upAxis !== undefined || scene.uvOrigin !== undefined) warn("COORDINATE_CONVENTION_LOST", undefined, "STL cannot declare the source up axis or UV origin; coordinates are not converted.");

  const usedNodes = new Set<number>();
  const usedMeshes = new Set<number>();
  const solidNames = new Set<string>();
  // Limit traversal independently of face count.
  let visited = 0;
  let visitedPrimitives = 0;
  const maxVisits = 1_000_000;
  traverseScene(scene, (node, nodeIndex, matrix) => {
    checkAbort(signal);
    if (++visited > maxVisits) throw new Error("STL: scene traversal limit exceeded");
    usedNodes.add(nodeIndex);
    if (matrix.some((value) => !Number.isFinite(value))) throw new Error(`STL: composed transform is not finite at nodes[${nodeIndex}]`);
    if (node.metadata && Object.keys(node.metadata).length) warn("METADATA_LOST", `nodes[${nodeIndex}].metadata`, "STL cannot store node metadata.");
    if (node.camera !== undefined && !scene.cameras?.length) warn("CAMERAS_LOST", `nodes[${nodeIndex}].camera`, "STL cannot store camera bindings.");
    if (node.light !== undefined && !scene.lights?.length) warn("LIGHTS_LOST", `nodes[${nodeIndex}].light`, "STL cannot store light bindings.");
    if (node.skin !== undefined && !scene.skins?.length) warn("SKIN_LOST", `nodes[${nodeIndex}].skin`, "STL cannot store skinning.");
    if (node.weights?.length) warn("MORPH_TARGETS_LOST", `nodes[${nodeIndex}].weights`, "STL cannot store morph weights.");
    if (node.mesh !== undefined) {
      if (!Number.isSafeInteger(node.mesh) || node.mesh < 0 || !scene.meshes || node.mesh >= scene.meshes.length) throw new Error(`STL: invalid mesh index at nodes[${nodeIndex}]`);
      const mesh = scene.meshes[node.mesh];
      usedMeshes.add(node.mesh);
      if (mesh.weights?.length) warn("MORPH_TARGETS_LOST", `meshes[${node.mesh}].weights`, "STL cannot store morph weights.");
      mesh.primitives.forEach((primitive, primitiveIndex) => {
        const path = `meshes[${node.mesh}].primitives[${primitiveIndex}]`;
        checkAbort(signal);
        if (++visitedPrimitives > 1_000_000) throw new Error("STL: primitive limit exceeded");
        if ((primitive.mode ?? "triangles") !== "triangles") {
          warn("TOPOLOGY_LOST", path, `STL only stores triangles; ${primitive.mode} was omitted.`);
          return;
        }
        const positions = primitive.attributes.POSITION;
        if (!positions || positions.itemSize !== 3 || positions.values.length % 3 !== 0) throw new Error(`STL: ${path} requires complete VEC3 POSITION values`);
        if (positions.normalized || (ArrayBuffer.isView(positions.values) && !(positions.values instanceof Float32Array))) {
          warn("QUANTIZATION_LOST", `${path}.attributes.POSITION`, "STL stores decoded coordinates and cannot retain the source attribute's quantization.");
        }
        const vertexCount = positions.values.length / 3;
        const indices = primitive.indices;
        const count = indices ? indices.length : vertexCount;
        if (count % 3 !== 0) throw new Error(`STL: ${path} triangle index count must be divisible by three`);
        if (triangleCount + count / 3 > maxTriangles || triangleCount + count / 3 > 0xffffffff) throw new Error("STL: triangle limit exceeded");
        for (let i = 0; i < count; i++) {
          if ((i & 4095) === 0) checkAbort(signal);
          const index = indices ? indices[i] : i;
          if (!Number.isSafeInteger(index) || index < 0 || index >= vertexCount) throw new Error(`STL: invalid vertex index at ${path}[${i}]`);
        }
        for (const key of Object.keys(primitive.attributes)) {
          if (key !== "POSITION") warn(key === "NORMAL" ? "VERTEX_NORMALS_LOST" : "ATTRIBUTE_LOST", `${path}.attributes.${key}`, `STL cannot store the per-vertex ${key} attribute.`);
        }
        if (primitive.material !== undefined && !scene.materials?.length) warn("MATERIALS_LOST", `${path}.material`, "STL cannot store material bindings.");
        if (primitive.targets?.length) warn("MORPH_TARGETS_LOST", `${path}.targets`, "STL cannot store morph targets.");
        triangleCount += count / 3;
        const rawName = node.name ?? mesh.name ?? `mesh_${node.mesh}_${primitiveIndex}`;
        const name = binary ? safeSolidName(rawName) : uniqueSolidName(rawName, solidNames);
        if (!binary && name !== rawName) warn("NAME_SANITIZED", path, "The solid name was sanitized or made unique to preserve distinct solid boundaries.");
        // A negative determinant reflects the mesh. Reverse the facet so its
        // outward orientation follows the inverse-transpose normal transform.
        sources.push({ primitive, matrix, name, path, count, reversed: determinant3(matrix) < 0 });
      });
    }
  }, signal);
  if (usedNodes.size < scene.nodes.length) warn("UNREFERENCED_NODE_LOST", "nodes", `${scene.nodes.length - usedNodes.size} node(s) are not reachable from the exported roots.`);
  if (usedMeshes.size < (scene.meshes?.length ?? 0)) warn("UNREFERENCED_MESH_LOST", "meshes", `${(scene.meshes?.length ?? 0) - usedMeshes.size} mesh(es) are not referenced by an exported node.`);

  if (binary && sources.length > 0) warn("SOLID_BOUNDARIES_LOST", "nodes", "Binary STL has one unnamed solid; individual mesh names and boundaries are lost.");
  let degenerateFacets = 0;
  const recordDegenerate = (normal: Vec3): void => { if (normal[0] === 0 && normal[1] === 0 && normal[2] === 0) degenerateFacets++; };
  const finish = (): void => {
    if (degenerateFacets) warn("DEGENERATE_FACETS", undefined, `${degenerateFacets} degenerate triangle(s) have a zero normal.`);
    checkAbort(signal);
  };
  if (binary) {
    const byteLength = 84 + triangleCount * 50;
    if (!Number.isSafeInteger(byteLength) || byteLength > maxBytes) throw new Error("STL: encoded output exceeds maxBytes");
    const data = new Uint8Array(byteLength);
    data.set(new TextEncoder().encode("Aura3D binary STL"), 0);
    const view = new DataView(data.buffer);
    view.setUint32(80, triangleCount, true);
    let offset = 84;
    for (const source of sources) eachFacet(source, true, signal, (normal, a, b, c) => {
      recordDegenerate(normal);
      for (const value of [...normal, ...a, ...b, ...c]) { view.setFloat32(offset, value, true); offset += 4; }
      view.setUint16(offset, 0, true); offset += 2;
    });
    finish();
    return { data, mimeType: "model/stl", warnings, dependencies: [] };
  }
  const chunks: string[] = [];
  let byteLength = 0;
  const append = (text: string): void => {
    // Names and numeric output are ASCII, so code units equal UTF-8 byte count.
    byteLength += text.length;
    if (byteLength > maxBytes) throw new Error("STL: encoded output exceeds maxBytes");
    chunks.push(text);
  };
  for (const source of sources) {
    append(`solid ${source.name}\n`);
    eachFacet(source, false, signal, (normal, a, b, c) => {
      recordDegenerate(normal);
      append(`  facet normal ${normal.join(" ")}\n    outer loop\n      vertex ${a.join(" ")}\n      vertex ${b.join(" ")}\n      vertex ${c.join(" ")}\n    endloop\n  endfacet\n`);
    });
    append(`endsolid ${source.name}\n`);
  }
  if (sources.length === 0) append("solid empty\nendsolid empty\n");
  finish();
  return { data: new TextEncoder().encode(chunks.join("")), mimeType: "model/stl", warnings, dependencies: [] };

  function warn(code: string, path: string | undefined, message: string): void { warnings.push(path === undefined ? { code, message } : { code, path, message }); }
}

function eachFacet(source: FacetSource, binary: boolean, signal: AbortSignal | undefined, callback: (normal: Vec3, a: Vec3, b: Vec3, c: Vec3) => void): void {
  const attribute = source.primitive.attributes.POSITION;
  const indices = source.primitive.indices;
  for (let i = 0; i < source.count; i += 3) {
    if ((i & 4095) === 0) checkAbort(signal);
    const a = transformedPosition(attribute, indices ? indices[i] : i, source.matrix, source.path, binary);
    const bIndex = source.reversed ? i + 2 : i + 1;
    const cIndex = source.reversed ? i + 1 : i + 2;
    const b = transformedPosition(attribute, indices ? indices[bIndex] : bIndex, source.matrix, source.path, binary);
    const c = transformedPosition(attribute, indices ? indices[cIndex] : cIndex, source.matrix, source.path, binary);
    callback(facetNormal(a, b, c, source.path), a, b, c);
  }
}

function transformedPosition(attribute: AuraExportAttribute, index: number, m: Matrix, path: string, binary: boolean): Vec3 {
  const p = transformPosition(m, readAttributeNormalized(attribute, index));
  for (let i = 0; i < 3; i++) {
    if (binary) p[i] = Math.fround(p[i]);
    if (!Number.isFinite(p[i])) throw new Error(`STL: non-finite or unrepresentable position at ${path}`);
  }
  return [p[0], p[1], p[2]];
}

function facetNormal(a: Vec3, b: Vec3, c: Vec3, path: string): Vec3 {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const us = Math.max(...u.map(Math.abs)), vs = Math.max(...v.map(Math.abs));
  if (!Number.isFinite(us) || !Number.isFinite(vs)) throw new Error(`STL: unrepresentable facet at ${path}`);
  if (us === 0 || vs === 0) return [0, 0, 0];
  const ux = u[0] / us, uy = u[1] / us, uz = u[2] / us;
  const vx = v[0] / vs, vy = v[1] / vs, vz = v[2] / vs;
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z);
  return length === 0 ? [0, 0, 0] : [x / length, y / length, z / length];
}

function determinant3(m: Matrix): number {
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

function safeSolidName(name: string): string { return name.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 128) || "solid"; }
function uniqueSolidName(name: string, used: Set<string>): string {
  const base = safeSolidName(name);
  let result = base;
  let index = 2;
  while (used.has(result)) {
    const suffix = `_${index++}`;
    result = `${base.slice(0, 128 - suffix.length)}${suffix}`;
  }
  used.add(result);
  return result;
}
function positiveLimit(value: number | undefined, fallback: number, maximum: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(`STL: ${name} must be an integer between 0 and ${maximum}`);
  return value;
}
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException("STL export aborted", "AbortError"); }
