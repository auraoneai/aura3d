/** Box and rounded-box meshes constructed from oriented surface patches. */
import type { ParityMesh } from "./Support";

export interface RoundedBoxParityParams {
  readonly width?: number;
  readonly height?: number;
  readonly depth?: number;
  readonly segments?: number;
  readonly radius?: number;
}

type Axis = 0 | 1 | 2;
type Face = { readonly normal: Axis; readonly sign: number; readonly u: Axis; readonly uSign: number; readonly v: Axis; readonly vSign: number };

// Each pair of tangent axes is oriented such that tangent U cross tangent V
// points outward. Face order gives stable material group identities.
const FACES: readonly Face[] = [
  { normal: 0, sign: 1, u: 2, uSign: -1, v: 1, vSign: 1 },
  { normal: 0, sign: -1, u: 2, uSign: 1, v: 1, vSign: 1 },
  { normal: 1, sign: 1, u: 0, uSign: 1, v: 2, vSign: -1 },
  { normal: 1, sign: -1, u: 0, uSign: 1, v: 2, vSign: 1 },
  { normal: 2, sign: 1, u: 0, uSign: 1, v: 1, vSign: 1 },
  { normal: 2, sign: -1, u: 0, uSign: -1, v: 1, vSign: 1 }
];

function validDimension(value: number): boolean { return Number.isFinite(value) && value >= 0; }

/** Build six indexed rectangular patches with per-face normals and UVs. */
export function boxParityMesh(width = 1, height = 1, depth = 1, widthSegments = 1, heightSegments = 1, depthSegments = 1): ParityMesh {
  const dimensions = [width, height, depth] as const;
  if (!dimensions.every(validDimension) || ![widthSegments, heightSegments, depthSegments].every(Number.isFinite)) {
    throw new RangeError("Box dimensions must be nonnegative and segment counts must be finite");
  }
  const counts = [widthSegments, heightSegments, depthSegments].map((n) => Math.max(1, Math.floor(n)));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  FACES.forEach((face, materialIndex) => {
    const rows = counts[face.v]!;
    const columns = counts[face.u]!;
    const base = positions.length / 3;
    const start = indices.length;
    for (let row = 0; row <= rows; row += 1) for (let col = 0; col <= columns; col += 1) {
      const point: [number, number, number] = [0, 0, 0];
      const normal: [number, number, number] = [0, 0, 0];
      point[face.normal] = dimensions[face.normal] * face.sign / 2;
      point[face.u] = dimensions[face.u] * (col / columns - 0.5) * face.uSign;
      point[face.v] = dimensions[face.v] * (row / rows - 0.5) * face.vSign;
      normal[face.normal] = face.sign;
      positions.push(...point);
      normals.push(...normal);
      uvs.push(col / columns, row / rows);
    }
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
      const a = base + row * (columns + 1) + col;
      const b = a + 1;
      const d = a + columns + 1;
      const c = d + 1;
      indices.push(a, b, c, a, c, d);
    }
    groups.push({ start, count: indices.length - start, materialIndex });
  });
  return { positions, normals, uvs, indices, groups };
}

/** Expand indexed attributes into independent triangle vertices. */
export function meshToNonIndexed(mesh: ParityMesh): ParityMesh {
  if (!mesh.indices) return mesh;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const i of mesh.indices) {
    if (!Number.isInteger(i) || i < 0 || i * 3 + 2 >= mesh.positions.length) throw new RangeError("Mesh index is outside its position array");
    positions.push(mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!);
    if (mesh.normals) normals.push(mesh.normals[i * 3]!, mesh.normals[i * 3 + 1]!, mesh.normals[i * 3 + 2]!);
    if (mesh.uvs) uvs.push(mesh.uvs[i * 2]!, mesh.uvs[i * 2 + 1]!);
  }
  return { positions, normals: mesh.normals ? normals : undefined, uvs: mesh.uvs ? uvs : undefined, groups: mesh.groups?.map((g) => ({ ...g })) };
}

/**
 * Sample a rounded rectangular solid. Face grids reserve `segments` intervals
 * for each corner and one for the straight center. A closest-point projection
 * onto the inner box gives continuous normals along edges and corners.
 */
export function roundedBoxParityMesh(params: RoundedBoxParityParams = {}): ParityMesh {
  const dims = [params.width ?? 1, params.height ?? 1, params.depth ?? 1] as const;
  const requestedRadius = params.radius ?? 0.1;
  const requestedSegments = params.segments ?? 2;
  if (!dims.every(validDimension) || !validDimension(requestedRadius) || !Number.isInteger(requestedSegments) || requestedSegments < 0) {
    throw new RangeError("Rounded box dimensions and radius must be nonnegative; segments must be a nonnegative integer");
  }
  const segments = requestedSegments;
  if (segments === 0) return boxParityMesh(...dims);
  const subdivisions = segments * 2 + 1;
  const radius = Math.min(requestedRadius, ...dims.map((d) => d / 2));
  const half = dims.map((d) => d / 2);
  const inner = half.map((d) => d - radius);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  const sample = (i: number, axis: Axis): number => {
    if (radius === 0) return half[axis]! * (2 * i / subdivisions - 1);
    if (i <= segments) return -half[axis]! + radius * i / segments;
    return inner[axis]! + radius * (i - segments - 1) / segments;
  };
  FACES.forEach((face, materialIndex) => {
    const start = positions.length / 3;
    const vertex = (col: number, row: number): void => {
      const point: [number, number, number] = [0, 0, 0];
      point[face.normal] = half[face.normal]! * face.sign;
      point[face.u] = sample(col, face.u) * face.uSign;
      point[face.v] = sample(row, face.v) * face.vSign;
      const nearest = point.map((n, axis) => Math.max(-inner[axis]!, Math.min(inner[axis]!, n)));
      const offset = point.map((n, axis) => n - nearest[axis]!);
      const length = Math.hypot(...offset);
      const normal = length > 0 ? offset.map((n) => n / length) : [0, 0, 0];
      if (length === 0) normal[face.normal] = face.sign;
      for (let axis = 0; axis < 3; axis += 1) positions.push(radius > 0 ? nearest[axis]! + radius * normal[axis]! : point[axis]!);
      normals.push(...normal);
      uvs.push(col / subdivisions, row / subdivisions);
    };
    for (let row = 0; row < subdivisions; row += 1) for (let col = 0; col < subdivisions; col += 1) {
      vertex(col, row);
      vertex(col + 1, row);
      vertex(col + 1, row + 1);
      vertex(col, row);
      vertex(col + 1, row + 1);
      vertex(col, row + 1);
    }
    groups.push({ start, count: positions.length / 3 - start, materialIndex });
  });
  return { positions, normals, uvs, groups };
}
