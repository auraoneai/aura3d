import { normalizeGeometryAttributes, validateGeometryMetadata } from "../RootGeometry.js";
import type { AuraCustomGeometrySpec, AuraRootVec3 } from "../RootGeometry.js";

/** A modifier always returns a new geometry and describes any changes of meaning. */
export interface AuraMeshModifierDiagnostic {
  readonly code: "attributes-interpolated" | "attributes-packed" | "normals-recomputed" | "normals-approximated" | "indices-rebuilt" | "bounds-recomputed" | "topology-reduced" | "topology-subdivided" | "vertices-split" | "shape-deformed" | "target-unreachable" | "operation-limit";
  readonly message: string;
}

export interface AuraMeshModifierResult {
  readonly geometry: AuraCustomGeometrySpec;
  readonly diagnostics: readonly AuraMeshModifierDiagnostic[];
  readonly stats: { readonly inputVertices: number; readonly outputVertices: number; readonly inputTriangles: number; readonly outputTriangles: number };
}

export interface AuraMeshSimplifyOptions {
  /** Stop at or above this many triangles; edge collapses may not hit the exact count. */
  readonly targetTriangleCount: number;
  /** Optional maximum distance between the collapsed endpoints in object units. */
  readonly maxEdgeLength?: number;
  /** Upper bound on accepted collapses, default 10,000. */
  readonly maxOperations?: number;
}

export interface AuraMeshEdgeSplitOptions {
  /** Radians between adjacent face normals above which vertices are separated. */
  readonly creaseAngle: number;
}

export interface AuraMeshTessellateOptions {
  readonly maxEdgeLength: number;
  /** Hard output capacity. The operation throws before exceeding this capacity. */
  readonly maxTriangles?: number;
  readonly maxOperations?: number;
}

export type AuraCurveVector = readonly [number, number, number] | { readonly x: number; readonly y: number; readonly z: number };
export interface AuraMeshCurve {
  getPoint(t: number): AuraCurveVector;
  getTangent?(t: number): AuraCurveVector;
}
export interface AuraMeshDeformOptions {
  readonly curve: AuraMeshCurve;
  readonly axis?: "x" | "y" | "z";
  /** Input-axis coordinates mapped to t=0 and t=1. Defaults to the geometry bounds. */
  readonly range?: readonly [number, number];
  /** Preferred frame direction (the source y direction for z/x, or x for y). */
  readonly up?: readonly [number, number, number];
  /** Whether target coordinates are absolute positions or offsets from base positions (the default). */
  readonly morphMode?: "absolute" | "relative";
}

interface Stream {
  readonly kind: "position" | "normal" | "uv" | "uv1" | "color" | "custom" | "morph" | "morph-normal" | "morph-tangent";
  readonly name: string;
  readonly size: number;
  readonly targetIndex?: number;
  values: number[];
}
interface Face {
  vertices: [number, number, number];
  readonly groups: readonly number[];
  readonly drawn: boolean;
}
interface Mesh {
  readonly source: AuraCustomGeometrySpec;
  readonly streams: Stream[];
  faces: Face[];
  vertexCount: number;
  readonly inputVertices: number;
  readonly inputTriangles: number;
  readonly diagnostics: AuraMeshModifierDiagnostic[];
}

type Vec3 = [number, number, number];

function readMesh(source: AuraCustomGeometrySpec): Mesh {
  if (source.topology !== undefined && source.topology !== "triangles") throw new Error("Mesh modifiers require triangle topology.");
  const data = normalizeGeometryAttributes(source);
  validateGeometryMetadata(source, data);
  const indices = data.indices ? Array.from(data.indices) : Array.from({ length: data.vertexCount }, (_, i) => i);
  if (indices.length === 0 || indices.length % 3 !== 0) throw new Error("Mesh modifiers require complete, nonempty triangles.");
  const streams: Stream[] = [{ kind: "position", name: "position", size: 3, values: Array.from(data.positions) }];
  if (data.normals) streams.push({ kind: "normal", name: "normal", size: 3, values: Array.from(data.normals) });
  if (data.uvs) streams.push({ kind: "uv", name: "uv", size: 2, values: Array.from(data.uvs) });
  if (data.uv1s) streams.push({ kind: "uv1", name: "uv1", size: 2, values: Array.from(data.uv1s) });
  if (data.colors) streams.push({ kind: "color", name: "color", size: 4, values: Array.from(data.colors) });
  for (const a of data.custom) streams.push({ kind: "custom", name: a.name, size: a.itemSize, values: Array.from(a.data) });
  for (const [i, target] of (source.morphTargets ?? []).entries()) {
    streams.push({ kind: "morph", name: target.name ?? "", size: 3, targetIndex: i, values: Array.from(target.positions) });
    if (target.normals !== undefined) streams.push({ kind: "morph-normal", name: target.name ?? "", size: 3, targetIndex: i, values: Array.from(target.normals) });
    if (target.tangents !== undefined) streams.push({ kind: "morph-tangent", name: target.name ?? "", size: 3, targetIndex: i, values: Array.from(target.tangents) });
  }
  for (const stream of streams) if (stream.values.some((value) => !Number.isFinite(value))) throw new Error(`Mesh ${stream.name || stream.kind} contains a non-finite value.`);
  const validateRange = (start: number, count: number, label: string): void => {
    if (!Number.isInteger(start) || !(Number.isInteger(count) || count === Infinity) || start < 0 || count < 0 || start % 3 !== 0 || (count !== Infinity && count % 3 !== 0)) {
      throw new Error(`${label} must be a non-negative, triangle-aligned range.`);
    }
  };
  source.groups?.forEach((g, i) => {
    validateRange(g.start, g.count, `Group ${i}`);
    if (!Number.isFinite(g.count) || g.start + g.count > indices.length || (g.materialIndex !== undefined && (!Number.isInteger(g.materialIndex) || g.materialIndex < 0))) throw new Error(`Group ${i} must fit the index buffer and have a non-negative material index.`);
  });
  if (source.drawRange) validateRange(source.drawRange.start, source.drawRange.count, "Draw range");
  const faces: Face[] = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    const groups: number[] = [];
    source.groups?.forEach((group, i) => { if (offset >= group.start && offset < group.start + group.count) groups.push(i); });
    const drawn = !source.drawRange || (offset >= source.drawRange.start && offset < source.drawRange.start + source.drawRange.count);
    faces.push({ vertices: [indices[offset]!, indices[offset + 1]!, indices[offset + 2]!], groups, drawn });
  }
  const diagnostics: AuraMeshModifierDiagnostic[] = [];
  if (data.custom.length) diagnostics.push({ code: "attributes-packed", message: "Custom attributes are returned as packed floating-point values; source storage and normalized integer formats are not retained." });
  return { source, streams, faces, vertexCount: data.vertexCount, inputVertices: data.vertexCount, inputTriangles: faces.length, diagnostics };
}

function point(mesh: Mesh, vertex: number): Vec3 {
  const p = mesh.streams[0]!.values;
  return [p[3 * vertex]!, p[3 * vertex + 1]!, p[3 * vertex + 2]!];
}
function sub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function unit(a: Vec3): Vec3 {
  const length = Math.hypot(...a);
  return length > 0 ? [a[0] / length, a[1] / length, a[2] / length] : [0, 0, 0];
}
function faceVector(mesh: Mesh, face: Face): Vec3 {
  const [a, b, c] = face.vertices;
  return cross(sub(point(mesh, b), point(mesh, a)), sub(point(mesh, c), point(mesh, a)));
}
function edgeKey(a: number, b: number): string { return a < b ? `${a}:${b}` : `${b}:${a}`; }
function edges(mesh: Mesh): Map<string, { a: number; b: number; faces: number[]; length: number }> {
  const result = new Map<string, { a: number; b: number; faces: number[]; length: number }>();
  mesh.faces.forEach((face, i) => {
    const v = face.vertices;
    for (let j = 0; j < 3; j += 1) {
      const a = Math.min(v[j]!, v[(j + 1) % 3]!);
      const b = Math.max(v[j]!, v[(j + 1) % 3]!);
      if (a === b) continue;
      const key = edgeKey(a, b);
      const existing = result.get(key);
      if (existing) existing.faces.push(i);
      else result.set(key, { a, b, faces: [i], length: Math.hypot(...sub(point(mesh, a), point(mesh, b))) });
    }
  });
  return result;
}
function packedMidpoint(mesh: Mesh, a: number, b: number): Vec3 {
  const first = point(mesh, a), second = point(mesh, b);
  const midpoint: Vec3 = [
    Math.fround((first[0] + second[0]) / 2),
    Math.fround((first[1] + second[1]) / 2),
    Math.fround((first[2] + second[2]) / 2)
  ];
  if (midpoint.some((value) => !Number.isFinite(value))) throw new Error("Mesh midpoint must be finite in float32 storage.");
  return midpoint;
}
function interpolatedVertex(mesh: Mesh, a: number, b: number): number {
  const index = mesh.vertexCount++;
  const position = packedMidpoint(mesh, a, b);
  let interpolatedNormalLength = 0;
  for (const stream of mesh.streams) {
    for (let c = 0; c < stream.size; c += 1) {
      stream.values.push(stream.kind === "position" ? position[c]! : (stream.values[a * stream.size + c]! + stream.values[b * stream.size + c]!) * 0.5);
    }
    if (stream.kind === "normal") {
      const offset = index * 3;
      interpolatedNormalLength = Math.hypot(stream.values[offset]!, stream.values[offset + 1]!, stream.values[offset + 2]!);
      const n = unit([stream.values[offset]!, stream.values[offset + 1]!, stream.values[offset + 2]!]);
      stream.values.splice(offset, 3, ...n);
    }
  }
  // Normalizing a new base normal changes its scale. Scale each interpolated
  // normal delta by the same amount so blending it with that base preserves
  // the normalized direction for any weight, rather than merely copying an
  // incompatible delta onto the normalized normal.
  if (interpolatedNormalLength > 0 && interpolatedNormalLength !== 1) {
    for (const stream of mesh.streams) if (stream.kind === "morph-normal") {
      for (let c = 0; c < 3; c += 1) {
        const offset = index * 3 + c;
        const value = stream.values[offset]! / interpolatedNormalLength;
        if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) throw new Error("Interpolated morph normal cannot be represented with the normalized base normal.");
        stream.values[offset] = value;
      }
    }
  }
  return index;
}

function requireDirectionMorphsUnchanged(mesh: Mesh, operation: string): void {
  if (mesh.streams.some((stream) => stream.kind === "morph-normal" || stream.kind === "morph-tangent")) {
    throw new Error(`${operation} cannot preserve morph normal or tangent deltas when base directions change.`);
  }
}
function copyVertex(mesh: Mesh, source: number): number {
  const index = mesh.vertexCount++;
  for (const stream of mesh.streams) for (let c = 0; c < stream.size; c += 1) stream.values.push(stream.values[source * stream.size + c]!);
  return index;
}
function recomputeNormals(mesh: Mesh, message = "Vertex normals were regenerated from the output faces."): void {
  let normal = mesh.streams.find((s) => s.kind === "normal");
  if (!normal) {
    normal = { kind: "normal", name: "normal", size: 3, values: [] };
    mesh.streams.push(normal);
  }
  normal.values = new Array<number>(mesh.vertexCount * 3).fill(0);
  for (const face of mesh.faces) {
    const n = faceVector(mesh, face);
    for (const vertex of face.vertices) for (let c = 0; c < 3; c += 1) normal.values[vertex * 3 + c] += n[c]!;
  }
  for (let i = 0; i < mesh.vertexCount; i += 1) {
    const n = unit([normal.values[i * 3]!, normal.values[i * 3 + 1]!, normal.values[i * 3 + 2]!]);
    normal.values.splice(i * 3, 3, ...n);
  }
  mesh.diagnostics.push({ code: "normals-recomputed", message });
}
function finish(mesh: Mesh, compact = false): AuraMeshModifierResult {
  if (compact) {
    const map = new Map<number, number>();
    for (const face of mesh.faces) face.vertices = face.vertices.map((index) => {
      if (!map.has(index)) map.set(index, map.size);
      return map.get(index)!;
    }) as [number, number, number];
    for (const stream of mesh.streams) {
      const result: number[] = [];
      for (const old of map.keys()) for (let c = 0; c < stream.size; c += 1) result.push(stream.values[old * stream.size + c]!);
      stream.values = result;
    }
    mesh.vertexCount = map.size;
  }
  const pack = (values: readonly number[], label: string): Float32Array => {
    const result = Float32Array.from(values);
    if (result.some((value) => !Number.isFinite(value))) throw new Error(`Mesh ${label} must contain finite float32 values.`);
    return result;
  };
  const positions = pack(mesh.streams[0]!.values, "positions");
  const boundsMin: Vec3 = [Infinity, Infinity, Infinity];
  const boundsMax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let c = 0; c < 3; c += 1) {
    boundsMin[c] = Math.min(boundsMin[c]!, positions[i + c]!);
    boundsMax[c] = Math.max(boundsMax[c]!, positions[i + c]!);
  }
  const custom: Record<string, { itemSize: 1 | 2 | 3 | 4; data: Float32Array }> = {};
  for (const s of mesh.streams.filter((s) => s.kind === "custom")) custom[s.name] = { itemSize: s.size as 1 | 2 | 3 | 4, data: pack(s.values, `attribute ${s.name}`) };
  const stream = (kind: Stream["kind"]): Float32Array | undefined => {
    const found = mesh.streams.find((s) => s.kind === kind);
    return found ? pack(found.values, kind) : undefined;
  };
  const groups: { start: number; count: number; materialIndex?: number }[] = [];
  mesh.source.groups?.forEach((original, groupIndex) => {
    const groupCountBefore = groups.length;
    let start = -1;
    for (let i = 0; i <= mesh.faces.length; i += 1) {
      const active = i < mesh.faces.length && mesh.faces[i]!.groups.includes(groupIndex);
      if (active && start < 0) start = i;
      if (!active && start >= 0) { groups.push({ start: start * 3, count: (i - start) * 3, ...(original.materialIndex !== undefined ? { materialIndex: original.materialIndex } : {}) }); start = -1; }
    }
    if (groups.length === groupCountBefore) groups.push({ start: Math.min(original.start, mesh.faces.length * 3), count: 0, ...(original.materialIndex !== undefined ? { materialIndex: original.materialIndex } : {}) });
  });
  let drawRange: { start: number; count: number } | undefined;
  if (mesh.source.drawRange) {
    const start = mesh.faces.findIndex((face) => face.drawn);
    let end = mesh.faces.length - 1;
    while (end >= 0 && !mesh.faces[end]!.drawn) end -= 1;
    drawRange = start < 0 ? { start: 0, count: 0 } : { start: start * 3, count: (end - start + 1) * 3 };
  }
  const indexValues = mesh.faces.flatMap((face) => face.vertices);
  const morphTargets = mesh.source.morphTargets?.map((target, index) => {
    const positions = mesh.streams.find((s) => s.kind === "morph" && s.targetIndex === index);
    const normals = mesh.streams.find((s) => s.kind === "morph-normal" && s.targetIndex === index);
    const tangents = mesh.streams.find((s) => s.kind === "morph-tangent" && s.targetIndex === index);
    if (!positions) throw new Error(`Morph target ${index} lost its position stream.`);
    return {
      ...(target.name !== undefined ? { name: target.name } : {}),
      positions: pack(positions.values, `morph ${index} positions`),
      ...(normals ? { normals: pack(normals.values, `morph ${index} normals`) } : {}),
      ...(tangents ? { tangents: pack(tangents.values, `morph ${index} tangents`) } : {})
    };
  });
  mesh.diagnostics.push({ code: "indices-rebuilt", message: compact ? "Indices and vertex order were rebuilt and unused vertices removed." : "The triangle index buffer was copied; non-indexed input becomes indexed." });
  mesh.diagnostics.push({ code: "bounds-recomputed", message: "Bounds were recalculated from the output base positions; morph extents are not included." });
  const normals = stream("normal"), uvs = stream("uv"), uv1s = stream("uv1"), colors = stream("color");
  let maxIndex = 0;
  for (const index of indexValues) maxIndex = Math.max(maxIndex, index);
  const geometry: AuraCustomGeometrySpec = {
    kind: "aura-custom-geometry", positions,
    ...(normals ? { normals } : {}),
    ...(uvs ? { uvs } : {}),
    ...(uv1s ? { uv1s } : {}),
    ...(colors ? { colors } : {}),
    indices: maxIndex > 65535 ? Uint32Array.from(indexValues) : Uint16Array.from(indexValues),
    ...(Object.keys(custom).length ? { attributes: custom } : {}),
    ...(mesh.source.groups ? { groups } : {}),
    ...(drawRange ? { drawRange } : {}),
    ...(morphTargets ? { morphTargets } : {}),
    bounds: { min: boundsMin as AuraRootVec3, max: boundsMax as AuraRootVec3 },
    ...(mesh.source.topology ? { topology: mesh.source.topology } : {}),
    ...(mesh.source.dynamic ? { dynamic: true } : {})
  };
  return { geometry, diagnostics: mesh.diagnostics, stats: { inputVertices: mesh.inputVertices, outputVertices: mesh.vertexCount, inputTriangles: mesh.inputTriangles, outputTriangles: mesh.faces.length } };
}

/** Collapse short topologically valid edges without crossing material or draw boundaries. */
export function simplifyAuraMesh(source: AuraCustomGeometrySpec, options: AuraMeshSimplifyOptions): AuraMeshModifierResult {
  const mesh = readMesh(source);
  if (!Number.isInteger(options.targetTriangleCount) || options.targetTriangleCount < 1) throw new Error("targetTriangleCount must be a positive integer.");
  if (options.maxEdgeLength !== undefined && (!Number.isFinite(options.maxEdgeLength) || options.maxEdgeLength <= 0)) throw new Error("maxEdgeLength must be positive and finite.");
  const limit = options.maxOperations ?? 10000;
  if (!Number.isInteger(limit) || limit < 0 || limit > 100000) throw new Error("maxOperations must be an integer between 0 and 100000.");
  let operations = 0;
  while (mesh.faces.length > options.targetTriangleCount && operations < limit) {
    const allEdges = [...edges(mesh).values()];
    const boundaryDegree = new Map<number, number>();
    const nonManifold = new Set<number>();
    for (const edge of allEdges) {
      if (edge.faces.length === 1) {
        boundaryDegree.set(edge.a, (boundaryDegree.get(edge.a) ?? 0) + 1);
        boundaryDegree.set(edge.b, (boundaryDegree.get(edge.b) ?? 0) + 1);
      } else if (edge.faces.length > 2) {
        nonManifold.add(edge.a); nonManifold.add(edge.b);
      }
    }
    const candidates = allEdges.filter((edge) => edge.faces.length <= 2 && edge.length <= (options.maxEdgeLength ?? Infinity))
      .sort((a, b) => a.length - b.length || a.a - b.a || a.b - b.b);
    let collapsed = false;
    for (const edge of candidates) {
      if (nonManifold.has(edge.a) || nonManifold.has(edge.b)) continue;
      const boundaryA = boundaryDegree.get(edge.a) ?? 0, boundaryB = boundaryDegree.get(edge.b) ?? 0;
      // Collapsing an interior chord joining boundary vertices pinches or joins
      // boundary loops even when the ordinary common-neighbor test passes.
      if ((edge.faces.length === 2 && boundaryA > 0 && boundaryB > 0) ||
          (edge.faces.length === 1 && (boundaryA !== 2 || boundaryB !== 2))) continue;
      const touched = mesh.faces.filter((face) => face.vertices.includes(edge.a) || face.vertices.includes(edge.b));
      const signature = (face: Face): string => `${face.groups.join(",")}:${face.drawn}`;
      if (new Set(touched.map(signature)).size > 1) continue;
      const na = new Set<number>(); const nb = new Set<number>();
      for (const face of touched) for (const v of face.vertices) {
        if (face.vertices.includes(edge.a) && v !== edge.a && v !== edge.b) na.add(v);
        if (face.vertices.includes(edge.b) && v !== edge.a && v !== edge.b) nb.add(v);
      }
      const common = [...na].filter((v) => nb.has(v)).length;
      if (common !== edge.faces.length) continue;
      const remaining = mesh.faces.length - edge.faces.length;
      if (remaining < options.targetTriangleCount || remaining < 1) continue;
      // Do not introduce inverted, flattened or duplicated surviving faces.
      const midpointPosition = packedMidpoint(mesh, edge.a, edge.b);
      const unique = new Set<string>();
      let valid = true;
      for (const face of mesh.faces) {
        if (face.vertices.includes(edge.a) && face.vertices.includes(edge.b)) continue;
        const replacement = face.vertices.map((v) => v === edge.a || v === edge.b ? -1 : v);
        const key = [...replacement].sort((x, y) => x - y).join(":");
        if (unique.has(key)) { valid = false; break; }
        unique.add(key);
        if (!replacement.includes(-1)) continue;
        const originalNormal = faceVector(mesh, face);
        const vertices = replacement.map((v) => v === -1 ? midpointPosition : point(mesh, v));
        const newNormal = cross(sub(vertices[1]!, vertices[0]!), sub(vertices[2]!, vertices[0]!));
        const oldLength = Math.hypot(...originalNormal); const newLength = Math.hypot(...newNormal);
        if (oldLength > 0 && (newLength === 0 || dot(originalNormal, newNormal) <= oldLength * newLength * 1e-9)) { valid = false; break; }
      }
      if (!valid) continue;
      requireDirectionMorphsUnchanged(mesh, "Mesh simplification");
      const midpoint = interpolatedVertex(mesh, edge.a, edge.b);
      const next = mesh.faces.filter((face) => !(face.vertices.includes(edge.a) && face.vertices.includes(edge.b)));
      for (const face of next) face.vertices = face.vertices.map((v) => v === edge.a || v === edge.b ? midpoint : v) as [number, number, number];
      mesh.faces = next;
      operations += 1;
      collapsed = true;
      break;
    }
    if (!collapsed) break;
  }
  if (operations) {
    mesh.diagnostics.push({ code: "topology-reduced", message: `Collapsed ${operations} edges; input triangles and geometric detail were removed.` });
    mesh.diagnostics.push({ code: "attributes-interpolated", message: "Collapsed-edge positions, attributes and morphs were averaged; discrete attributes may require repair." });
    recomputeNormals(mesh);
  }
  if (mesh.faces.length > options.targetTriangleCount) mesh.diagnostics.push({ code: operations >= limit ? "operation-limit" : "target-unreachable", message: `Stopped at ${mesh.faces.length} triangles without crossing topology or material boundaries.` });
  return finish(mesh, true);
}

/** Split vertex fans at edges whose adjacent faces differ by more than creaseAngle. */
export function splitAuraMeshEdges(source: AuraCustomGeometrySpec, options: AuraMeshEdgeSplitOptions): AuraMeshModifierResult {
  if (!Number.isFinite(options.creaseAngle) || options.creaseAngle < 0 || options.creaseAngle > Math.PI) throw new Error("creaseAngle must be between 0 and pi.");
  const mesh = readMesh(source);
  requireDirectionMorphsUnchanged(mesh, "Mesh edge splitting");
  const edgeMap = edges(mesh);
  const originalCount = mesh.vertexCount;
  const normals = mesh.faces.map((face) => unit(faceVector(mesh, face)));
  const facesByVertex: number[][] = Array.from({ length: originalCount }, () => []);
  mesh.faces.forEach((face, i) => { for (const vertex of new Set(face.vertices)) facesByVertex[vertex]!.push(i); });
  const edgesByVertex: Array<Array<{ a: number; b: number; faces: number[] }>> = Array.from({ length: originalCount }, () => []);
  for (const edge of edgeMap.values()) { edgesByVertex[edge.a]!.push(edge); edgesByVertex[edge.b]!.push(edge); }
  for (let vertex = 0; vertex < originalCount; vertex += 1) {
    const incident = facesByVertex[vertex]!;
    if (incident.length < 2) continue;
    const parent = new Map(incident.map((i) => [i, i]));
    const root = (i: number): number => { while (parent.get(i)! !== i) i = parent.get(i)!; return i; };
    for (const edge of edgesByVertex[vertex]!) {
      if (edge.faces.length !== 2) continue;
      const [a, b] = edge.faces;
      const first = mesh.faces[a]!; const second = mesh.faces[b]!;
      if (first.groups.join(",") !== second.groups.join(",") || first.drawn !== second.drawn) continue;
      if (Math.hypot(...normals[a]!) === 0 || Math.hypot(...normals[b]!) === 0) continue;
      if (dot(normals[a]!, normals[b]!) + 1e-12 >= Math.cos(options.creaseAngle)) parent.set(root(b!), root(a!));
    }
    const remap = new Map<number, number>();
    for (const faceIndex of incident) {
      const key = root(faceIndex);
      if (!remap.has(key)) remap.set(key, remap.size === 0 ? vertex : copyVertex(mesh, vertex));
      const face = mesh.faces[faceIndex]!;
      face.vertices = face.vertices.map((v) => v === vertex ? remap.get(key)! : v) as [number, number, number];
    }
  }
  if (mesh.vertexCount > originalCount) mesh.diagnostics.push({ code: "vertices-split", message: "Vertices were duplicated to separate crease, material or draw boundaries." });
  recomputeNormals(mesh);
  return finish(mesh, true);
}

/** Bisect the longest edge and every incident face, preserving a watertight index topology. */
export function tessellateAuraMesh(source: AuraCustomGeometrySpec, options: AuraMeshTessellateOptions): AuraMeshModifierResult {
  if (!Number.isFinite(options.maxEdgeLength) || options.maxEdgeLength <= 0) throw new Error("maxEdgeLength must be positive and finite.");
  const maxTriangles = options.maxTriangles ?? 100000;
  const limit = options.maxOperations ?? 10000;
  if (!Number.isInteger(maxTriangles) || maxTriangles < 1 || maxTriangles > 1000000) throw new Error("maxTriangles must be an integer between 1 and 1000000.");
  if (!Number.isInteger(limit) || limit < 0 || limit > 100000) throw new Error("maxOperations must be an integer between 0 and 100000.");
  const mesh = readMesh(source);
  if (mesh.faces.length > maxTriangles) throw new Error("Input exceeds maxTriangles.");
  let operations = 0;
  while (operations < limit) {
    const edge = [...edges(mesh).values()].filter((candidate) => candidate.length > options.maxEdgeLength)
      .sort((a, b) => b.length - a.length || a.a - b.a || a.b - b.b)[0];
    if (!edge) break;
    if (mesh.faces.length + edge.faces.length > maxTriangles) throw new Error("Tessellation would exceed maxTriangles.");
    const midpointPosition = packedMidpoint(mesh, edge.a, edge.b);
    const a = point(mesh, edge.a), b = point(mesh, edge.b);
    if (midpointPosition.every((value, axis) => value === a[axis]) || midpointPosition.every((value, axis) => value === b[axis])) {
      throw new Error("Tessellation midpoint cannot be represented distinctly in float32 storage.");
    }
    for (const faceIndex of edge.faces) {
      const face = mesh.faces[faceIndex]!;
      const vertices = face.vertices;
      const side = vertices.findIndex((vertex, i) => edgeKey(vertex, vertices[(i + 1) % 3]!) === edgeKey(edge.a, edge.b));
      const first = point(mesh, vertices[side]!);
      const second = point(mesh, vertices[(side + 1) % 3]!);
      const third = point(mesh, vertices[(side + 2) % 3]!);
      const originalNormal = faceVector(mesh, face);
      if (Math.hypot(...originalNormal) > 0) {
        const firstNormal = cross(sub(midpointPosition, first), sub(third, first));
        const secondNormal = cross(sub(second, midpointPosition), sub(third, midpointPosition));
        if (dot(originalNormal, firstNormal) <= 0 || dot(originalNormal, secondNormal) <= 0) {
          throw new Error("Tessellation midpoint would produce a degenerate or inverted float32 triangle.");
        }
      }
    }
    if (!mesh.streams.some((stream) => stream.kind === "normal")) {
      // Generating normals after subdivision would reweight the incident
      // faces at existing vertices. Capture the source smoothing first.
      recomputeNormals(mesh, "Missing normals were generated from the source faces before subdivision and interpolated for new vertices.");
    }
    const midpoint = interpolatedVertex(mesh, edge.a, edge.b);
    const next: Face[] = [];
    for (const face of mesh.faces) {
      const vertices = face.vertices;
      let side = -1;
      for (let i = 0; i < 3; i += 1) if (edgeKey(vertices[i]!, vertices[(i + 1) % 3]!) === edgeKey(edge.a, edge.b)) { side = i; break; }
      if (side < 0) { next.push(face); continue; }
      const a = vertices[side]!; const b = vertices[(side + 1) % 3]!; const c = vertices[(side + 2) % 3]!;
      next.push({ ...face, vertices: [a, midpoint, c] }, { ...face, vertices: [midpoint, b, c] });
    }
    mesh.faces = next;
    operations += 1;
  }
  if (operations) {
    mesh.diagnostics.push({ code: "topology-subdivided", message: `Bisected ${operations} edges and their incident faces.` });
    mesh.diagnostics.push({ code: "attributes-interpolated", message: "New edge vertices use linear attribute and morph interpolation; discrete attributes may require repair." });
  }
  if ([...edges(mesh).values()].some((edge) => edge.length > options.maxEdgeLength)) mesh.diagnostics.push({ code: "operation-limit", message: "The operation limit was reached before every edge met maxEdgeLength." });
  return finish(mesh, true);
}

function vector(value: AuraCurveVector): Vec3 {
  const v = Array.isArray(value) ? value : [(value as { x: number }).x, (value as { y: number }).y, (value as { z: number }).z];
  if (v.length !== 3 || v.some((x) => !Number.isFinite(x))) throw new Error("Curve points and tangents must be finite 3D vectors.");
  return [v[0]!, v[1]!, v[2]!];
}

/** Bend the input longitudinal axis along a sampled curve. Curve parameters are clamped to [0,1]. */
export function deformAuraMeshAlongCurve(source: AuraCustomGeometrySpec, options: AuraMeshDeformOptions): AuraMeshModifierResult {
  const mesh = readMesh(source);
  const axis = options.axis ?? "z";
  if (axis !== "x" && axis !== "y" && axis !== "z") throw new Error("axis must be x, y or z.");
  if (options.morphMode !== undefined && options.morphMode !== "absolute" && options.morphMode !== "relative") throw new Error("morphMode must be absolute or relative.");
  requireDirectionMorphsUnchanged(mesh, "Curve deformation");
  const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  const position = mesh.streams[0]!.values;
  let sourceMin = Infinity;
  let sourceMax = -Infinity;
  for (let i = 0; i < mesh.vertexCount; i += 1) {
    sourceMin = Math.min(sourceMin, position[i * 3 + axisIndex]!);
    sourceMax = Math.max(sourceMax, position[i * 3 + axisIndex]!);
  }
  const min = options.range?.[0] ?? sourceMin;
  const max = options.range?.[1] ?? sourceMax;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) throw new Error("Curve deformation needs a finite non-zero input range.");
  const up = vector(options.up ?? [0, 1, 0]);
  if (Math.hypot(...up) === 0) throw new Error("Curve deformation up vector must be nonzero.");
  const map = (p: Vec3): { p: Vec3; normal: Vec3; binormal: Vec3; tangent: Vec3 } => {
    const t = Math.max(0, Math.min(1, (p[axisIndex] - min) / (max - min)));
    const origin = vector(options.curve.getPoint(t));
    const tangent = unit(options.curve.getTangent ? vector(options.curve.getTangent(t)) : sub(vector(options.curve.getPoint(Math.min(1, t + 1e-4))), vector(options.curve.getPoint(Math.max(0, t - 1e-4)))));
    if (Math.hypot(...tangent) === 0) throw new Error("Curve has a zero tangent at a sampled vertex.");
    const projection = sub(up, [tangent[0] * dot(up, tangent), tangent[1] * dot(up, tangent), tangent[2] * dot(up, tangent)]);
    let normal = unit(projection);
    if (Math.hypot(...projection) < 1e-12 * Math.hypot(...up)) {
      const alternate: Vec3 = Math.abs(tangent[0]) < 0.8 ? [1, 0, 0] : [0, 0, 1];
      normal = unit(sub(alternate, [tangent[0] * dot(alternate, tangent), tangent[1] * dot(alternate, tangent), tangent[2] * dot(alternate, tangent)]));
    }
    const first = axis === "z" ? unit(cross(normal, tangent)) : normal;
    const second = axis === "z" ? normal : axis === "x" ? unit(cross(tangent, normal)) : unit(cross(normal, tangent));
    const a = axis === "x" ? p[1] : p[0];
    const b = axis === "z" ? p[1] : p[2];
    return { p: [origin[0] + first[0] * a + second[0] * b, origin[1] + first[1] * a + second[1] * b, origin[2] + first[2] * a + second[2] * b], normal: first, binormal: second, tangent };
  };
  const bases = Array.from({ length: mesh.vertexCount }, (_, i): Vec3 => [position[i * 3]!, position[i * 3 + 1]!, position[i * 3 + 2]!]);
  const mapped = bases.map(map);
  for (let i = 0; i < mesh.vertexCount; i += 1) position.splice(i * 3, 3, ...mapped[i]!.p);
  const normal = mesh.streams.find((s) => s.kind === "normal");
  if (normal) {
    for (let i = 0; i < mesh.vertexCount; i += 1) {
      const n: Vec3 = [normal.values[i * 3]!, normal.values[i * 3 + 1]!, normal.values[i * 3 + 2]!];
      const a = axis === "x" ? n[1] : n[0]; const b = axis === "z" ? n[1] : n[2]; const along = n[axisIndex];
      const frame = mapped[i]!;
      const transformed = unit([0, 1, 2].map((c) => frame.normal[c]! * a + frame.binormal[c]! * b + frame.tangent[c]! * along) as Vec3);
      normal.values.splice(i * 3, 3, ...transformed);
    }
    mesh.diagnostics.push({ code: "normals-approximated", message: "Normals follow the local curve frame; curvature and longitudinal scaling are not included in the normal transform." });
  }
  for (const morph of mesh.streams.filter((s) => s.kind === "morph")) {
    for (let i = 0; i < mesh.vertexCount; i += 1) {
      const v: Vec3 = [morph.values[i * 3]!, morph.values[i * 3 + 1]!, morph.values[i * 3 + 2]!];
      const relative = options.morphMode !== "absolute";
      const absolute: Vec3 = relative ? [v[0] + bases[i]![0], v[1] + bases[i]![1], v[2] + bases[i]![2]] : v;
      const transformed = map(absolute).p;
      if (relative) for (let c = 0; c < 3; c += 1) transformed[c] -= mapped[i]!.p[c]!;
      morph.values.splice(i * 3, 3, ...transformed);
    }
  }
  mesh.diagnostics.push({ code: "shape-deformed", message: "Base and morph positions were mapped along the curve; samples outside the selected input range were clamped." });
  return finish(mesh);
}
