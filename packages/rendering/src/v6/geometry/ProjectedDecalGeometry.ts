import { Geometry } from "../../Geometry";
import { IndexBuffer } from "../../IndexBuffer";
import { VertexBuffer } from "../../VertexBuffer";
import { VertexFormat } from "../../VertexFormat";

export interface ProjectedDecalTriangleMesh {
  readonly positions: readonly (readonly [number, number, number])[];
  readonly normals?: readonly (readonly [number, number, number])[];
  readonly indices?: readonly number[];
}

export interface ProjectedDecalBox {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly basis?: ProjectedDecalBasis;
  readonly normalOffset?: number;
  readonly shape?: ProjectedDecalShape;
  readonly ellipseSegments?: number;
}

export interface ProjectedDecalBasis {
  readonly right: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
}

export interface ProjectedDecalRay {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

export interface ProjectedDecalGeometryResult {
  readonly geometry: Geometry;
  readonly sourceTriangleCount: number;
  readonly clippedTriangleCount: number;
  readonly vertexCount: number;
}

export interface ProjectedDecalRaycastOptions {
  readonly size: readonly [number, number, number];
  readonly normalOffset?: number;
  readonly maxDistance?: number;
  readonly includeBackfaces?: boolean;
  readonly upHint?: readonly [number, number, number];
  readonly shape?: ProjectedDecalShape;
  readonly ellipseSegments?: number;
}

export interface ProjectedDecalRaycastHit {
  readonly position: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly distance: number;
  readonly triangleIndex: number;
}

export interface ProjectedDecalRaycastResult extends ProjectedDecalGeometryResult {
  readonly hit: ProjectedDecalRaycastHit;
  readonly box: ProjectedDecalBox;
}

interface DecalVertex {
  readonly position: [number, number, number];
  readonly normal: [number, number, number];
}

interface ClipPlane {
  readonly axis: 0 | 1 | 2;
  readonly sign: -1 | 1;
}

export type ProjectedDecalShape = "box" | "ellipse";

const CLIP_PLANES: readonly ClipPlane[] = [
  { axis: 0, sign: 1 },
  { axis: 0, sign: -1 },
  { axis: 1, sign: 1 },
  { axis: 1, sign: -1 },
  { axis: 2, sign: 1 },
  { axis: 2, sign: -1 }
];

export function createProjectedDecalGeometry(mesh: ProjectedDecalTriangleMesh, box: ProjectedDecalBox): ProjectedDecalGeometryResult {
  validateBox(box);
  const triangles = triangleIndices(mesh);
  const vertices: DecalVertex[] = [];
  const indices: number[] = [];
  const half: [number, number, number] = [box.size[0] / 2, box.size[1] / 2, box.size[2] / 2];
  const basis = normalizeBasis(box.basis);
  const normalOffset = box.normalOffset ?? 0.0025;
  const shape = box.shape ?? "box";
  const ellipseSegments = validateEllipseSegments(box.ellipseSegments ?? 32);
  let clippedTriangleCount = 0;

  for (let triangle = 0; triangle < triangles.length; triangle += 3) {
    const polygon = [0, 1, 2].map((offset) => {
      const index = triangles[triangle + offset]!;
      const position = mesh.positions[index];
      if (!position) {
        throw new Error(`Projected decal triangle references missing vertex ${index}.`);
      }
      return {
        position: [position[0], position[1], position[2]] as [number, number, number],
        normal: normalizeVec3(mesh.normals?.[index] ?? [0, 0, 1])
      };
    });
    const clipped = shape === "ellipse"
      ? clipPolygonToEllipse(clipPolygonToBox(polygon, box.center, half, basis), box.center, half, basis, ellipseSegments)
      : clipPolygonToBox(polygon, box.center, half, basis);
    if (clipped.length < 3) continue;
    const start = vertices.length;
    for (const vertex of clipped) {
      vertices.push({
        position: [
          vertex.position[0] + vertex.normal[0] * normalOffset,
          vertex.position[1] + vertex.normal[1] * normalOffset,
          vertex.position[2] + vertex.normal[2] * normalOffset
        ],
        normal: vertex.normal
      });
    }
    for (let i = 1; i < clipped.length - 1; i += 1) {
      indices.push(start, start + i, start + i + 1);
      clippedTriangleCount += 1;
    }
  }

  if (vertices.length === 0 || indices.length === 0) {
    throw new Error("Projected decal did not intersect the source mesh.");
  }

  const vertexBuffer = new VertexBuffer(VertexFormat.P3N3T2, vertices.length);
  vertices.forEach((vertex, index) => {
    const local = toBoxLocal(vertex.position, box.center, half, basis);
    vertexBuffer.setAttribute(index, "position", vertex.position);
    vertexBuffer.setAttribute(index, "normal", vertex.normal);
    vertexBuffer.setAttribute(index, "uv", [
      Math.max(0, Math.min(1, local[0] * 0.5 + 0.5)),
      Math.max(0, Math.min(1, 1 - (local[1] * 0.5 + 0.5)))
    ]);
  });

  return {
    geometry: new Geometry(vertexBuffer, new IndexBuffer(indices, vertices.length)),
    sourceTriangleCount: triangles.length / 3,
    clippedTriangleCount,
    vertexCount: vertices.length
  };
}

export function createRaycastProjectedDecalGeometry(
  mesh: ProjectedDecalTriangleMesh,
  ray: ProjectedDecalRay,
  options: ProjectedDecalRaycastOptions
): ProjectedDecalRaycastResult {
  validateRay(ray);
  validateBox({ center: ray.origin, size: options.size });
  const hit = raycastProjectedDecalMesh(mesh, ray, options);
  if (!hit) {
    throw new Error("Projected decal ray did not hit the source mesh.");
  }
  const basis = createProjectorBasis(hit.normal, options.upHint ?? [0, 1, 0]);
  const box: ProjectedDecalBox = {
    center: hit.position,
    size: options.size,
    basis,
    ...(options.normalOffset === undefined ? {} : { normalOffset: options.normalOffset }),
    ...(options.shape === undefined ? {} : { shape: options.shape }),
    ...(options.ellipseSegments === undefined ? {} : { ellipseSegments: options.ellipseSegments })
  };
  return {
    ...createProjectedDecalGeometry(mesh, box),
    hit,
    box
  };
}

export function raycastProjectedDecalMesh(
  mesh: ProjectedDecalTriangleMesh,
  ray: ProjectedDecalRay,
  options: Pick<ProjectedDecalRaycastOptions, "maxDistance" | "includeBackfaces"> = {}
): ProjectedDecalRaycastHit | undefined {
  validateRay(ray);
  const triangles = triangleIndices(mesh);
  const direction = normalizeVec3(ray.direction);
  const maxDistance = options.maxDistance ?? Number.POSITIVE_INFINITY;
  if ((maxDistance !== Number.POSITIVE_INFINITY && !Number.isFinite(maxDistance)) || maxDistance <= 0) {
    throw new Error("Projected decal ray maxDistance must be finite positive or omitted.");
  }
  let closest: ProjectedDecalRaycastHit | undefined;
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const ia = triangles[offset]!;
    const ib = triangles[offset + 1]!;
    const ic = triangles[offset + 2]!;
    const a = mesh.positions[ia];
    const b = mesh.positions[ib];
    const c = mesh.positions[ic];
    if (!a || !b || !c) {
      throw new Error("Projected decal raycast triangle references a missing vertex.");
    }
    const hit = intersectTriangle(ray.origin, direction, a, b, c, options.includeBackfaces === true);
    if (!hit || hit.distance > maxDistance || (closest && hit.distance >= closest.distance)) continue;
    const geometricNormal = triangleNormal(a, b, c);
    const na = mesh.normals?.[ia] ?? geometricNormal;
    const nb = mesh.normals?.[ib] ?? geometricNormal;
    const nc = mesh.normals?.[ic] ?? geometricNormal;
    closest = {
      position: hit.position,
      normal: normalizeVec3([
        na[0] * hit.barycentric[0] + nb[0] * hit.barycentric[1] + nc[0] * hit.barycentric[2],
        na[1] * hit.barycentric[0] + nb[1] * hit.barycentric[1] + nc[1] * hit.barycentric[2],
        na[2] * hit.barycentric[0] + nb[2] * hit.barycentric[1] + nc[2] * hit.barycentric[2]
      ]),
      distance: hit.distance,
      triangleIndex: offset / 3
    };
  }
  return closest;
}

function triangleIndices(mesh: ProjectedDecalTriangleMesh): readonly number[] {
  if (mesh.indices) {
    if (mesh.indices.length === 0 || mesh.indices.length % 3 !== 0) {
      throw new Error("Projected decal source indices must contain triangles.");
    }
    return mesh.indices;
  }
  if (mesh.positions.length === 0 || mesh.positions.length % 3 !== 0) {
    throw new Error("Projected decal source positions must contain unindexed triangles.");
  }
  return mesh.positions.map((_position, index) => index);
}

function clipPolygonToBox(polygon: readonly DecalVertex[], center: readonly [number, number, number], half: readonly [number, number, number], basis: ProjectedDecalBasis): readonly DecalVertex[] {
  let clipped = [...polygon];
  for (const plane of CLIP_PLANES) {
    clipped = clipPolygonToPlane(clipped, center, half, basis, plane);
    if (clipped.length === 0) break;
  }
  return clipped;
}

function clipPolygonToEllipse(polygon: readonly DecalVertex[], center: readonly [number, number, number], half: readonly [number, number, number], basis: ProjectedDecalBasis, segments: number): readonly DecalVertex[] {
  let clipped = [...polygon];
  const apothem = Math.cos(Math.PI / segments);
  for (let segment = 0; segment < segments; segment += 1) {
    const angle = ((segment + 0.5) / segments) * Math.PI * 2;
    clipped = clipPolygonToLocalPlane(clipped, center, half, basis, Math.cos(angle), Math.sin(angle), apothem);
    if (clipped.length === 0) break;
  }
  return clipped;
}

function clipPolygonToPlane(polygon: readonly DecalVertex[], center: readonly [number, number, number], half: readonly [number, number, number], basis: ProjectedDecalBasis, plane: ClipPlane): DecalVertex[] {
  const output: DecalVertex[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    const currentDistance = signedPlaneDistance(current.position, center, half, basis, plane);
    const previousDistance = signedPlaneDistance(previous.position, center, half, basis, plane);
    const currentInside = currentDistance <= 0;
    const previousInside = previousDistance <= 0;
    if (currentInside !== previousInside) {
      const denominator = previousDistance - currentDistance;
      const t = denominator === 0 ? 0 : previousDistance / denominator;
      output.push(interpolateVertex(previous, current, t));
    }
    if (currentInside) {
      output.push(current);
    }
  }
  return output;
}

function clipPolygonToLocalPlane(polygon: readonly DecalVertex[], center: readonly [number, number, number], half: readonly [number, number, number], basis: ProjectedDecalBasis, normalX: number, normalY: number, limit: number): DecalVertex[] {
  const output: DecalVertex[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    const currentDistance = localPlaneDistance(current.position, center, half, basis, normalX, normalY, limit);
    const previousDistance = localPlaneDistance(previous.position, center, half, basis, normalX, normalY, limit);
    const currentInside = currentDistance <= 0;
    const previousInside = previousDistance <= 0;
    if (currentInside !== previousInside) {
      const denominator = previousDistance - currentDistance;
      const t = denominator === 0 ? 0 : previousDistance / denominator;
      output.push(interpolateVertex(previous, current, t));
    }
    if (currentInside) {
      output.push(current);
    }
  }
  return output;
}

function signedPlaneDistance(position: readonly [number, number, number], center: readonly [number, number, number], half: readonly [number, number, number], basis: ProjectedDecalBasis, plane: ClipPlane): number {
  const local = toBoxLocal(position, center, half, basis)[plane.axis];
  return plane.sign === 1 ? local - 1 : -local - 1;
}

function localPlaneDistance(position: readonly [number, number, number], center: readonly [number, number, number], half: readonly [number, number, number], basis: ProjectedDecalBasis, normalX: number, normalY: number, limit: number): number {
  const local = toBoxLocal(position, center, half, basis);
  return local[0] * normalX + local[1] * normalY - limit;
}

function interpolateVertex(a: DecalVertex, b: DecalVertex, t: number): DecalVertex {
  return {
    position: [
      a.position[0] + (b.position[0] - a.position[0]) * t,
      a.position[1] + (b.position[1] - a.position[1]) * t,
      a.position[2] + (b.position[2] - a.position[2]) * t
    ],
    normal: normalizeVec3([
      a.normal[0] + (b.normal[0] - a.normal[0]) * t,
      a.normal[1] + (b.normal[1] - a.normal[1]) * t,
      a.normal[2] + (b.normal[2] - a.normal[2]) * t
    ])
  };
}

function toBoxLocal(position: readonly [number, number, number], center: readonly [number, number, number], half: readonly [number, number, number], basis: ProjectedDecalBasis): [number, number, number] {
  const delta: [number, number, number] = [
    position[0] - center[0],
    position[1] - center[1],
    position[2] - center[2]
  ];
  return [
    dot(delta, basis.right) / half[0],
    dot(delta, basis.up) / half[1],
    dot(delta, basis.normal) / half[2]
  ];
}

function normalizeBasis(basis: ProjectedDecalBasis | undefined): ProjectedDecalBasis {
  if (!basis) {
    return { right: [1, 0, 0], up: [0, 1, 0], normal: [0, 0, 1] };
  }
  return createProjectorBasis(basis.normal, basis.up);
}

function createProjectorBasis(normalInput: readonly [number, number, number], upHintInput: readonly [number, number, number]): ProjectedDecalBasis {
  const normal = normalizeVec3(normalInput);
  let upHint = normalizeVec3(upHintInput);
  if (Math.abs(dot(normal, upHint)) > 0.98) {
    upHint = Math.abs(normal[1]) < 0.98 ? [0, 1, 0] : [1, 0, 0];
  }
  const right = normalizeVec3(cross(upHint, normal));
  const up = normalizeVec3(cross(normal, right));
  return { right, up, normal };
}

function intersectTriangle(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  includeBackfaces: boolean
): { readonly position: [number, number, number]; readonly distance: number; readonly barycentric: [number, number, number] } | undefined {
  const edge1 = sub(b, a);
  const edge2 = sub(c, a);
  const p = cross(direction, edge2);
  const determinant = dot(edge1, p);
  if (includeBackfaces ? Math.abs(determinant) < 1e-8 : determinant < 1e-8) return undefined;
  const invDet = 1 / determinant;
  const tvec = sub(origin, a);
  const u = dot(tvec, p) * invDet;
  if (u < 0 || u > 1) return undefined;
  const q = cross(tvec, edge1);
  const v = dot(direction, q) * invDet;
  if (v < 0 || u + v > 1) return undefined;
  const distance = dot(edge2, q) * invDet;
  if (distance < 0) return undefined;
  return {
    position: [
      origin[0] + direction[0] * distance,
      origin[1] + direction[1] * distance,
      origin[2] + direction[2] * distance
    ],
    distance,
    barycentric: [1 - u - v, u, v]
  };
}

function triangleNormal(a: readonly [number, number, number], b: readonly [number, number, number], c: readonly [number, number, number]): [number, number, number] {
  return normalizeVec3(cross(sub(b, a), sub(c, a)));
}

function sub(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalizeVec3(value: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= 1e-8) return [0, 0, 1];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function validateRay(ray: ProjectedDecalRay): void {
  if (ray.origin.length !== 3 || ray.direction.length !== 3 || [...ray.origin, ...ray.direction].some((component) => !Number.isFinite(component))) {
    throw new Error("Projected decal ray origin and direction must be finite vec3 values.");
  }
  if (Math.hypot(ray.direction[0], ray.direction[1], ray.direction[2]) <= 1e-8) {
    throw new Error("Projected decal ray direction must be non-zero.");
  }
}

function validateBox(box: ProjectedDecalBox): void {
  for (const [label, value] of [["center", box.center], ["size", box.size]] as const) {
    if (value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
      throw new Error(`Projected decal ${label} must be a finite vec3.`);
    }
  }
  if (box.size.some((component) => component <= 0)) {
    throw new Error("Projected decal size components must be positive.");
  }
  if (box.shape !== undefined && box.shape !== "box" && box.shape !== "ellipse") {
    throw new Error("Projected decal shape must be box or ellipse.");
  }
  if (box.ellipseSegments !== undefined) validateEllipseSegments(box.ellipseSegments);
}

function validateEllipseSegments(segments: number): number {
  if (!Number.isInteger(segments) || segments < 8 || segments > 128) {
    throw new Error("Projected decal ellipseSegments must be an integer from 8 to 128.");
  }
  return segments;
}
