/**
 * threejs-parity (§5.2, lane L2-01) — `PolyhedronGeometry` verbatim port,
 * plus the four platonic-solid subclasses (`variant`).
 *
 * Non-indexed output: `subdivide(detail)` pushes per-face vertex triplets in
 * three's exact order, `applyRadius` projects onto the sphere, UVs use the
 * azimuth/inclination mapping with `correctUVs`/`correctSeam`. detail=0 gets
 * flat face normals (`computeVertexNormals` on the non-indexed buffer),
 * detail>0 gets `normalizeNormals` (position direction).
 */

import { computeVertexNormals } from "./Support";
import type { ParityMesh } from "./Support";

export type PolyhedronVariant = "tetrahedron" | "octahedron" | "icosahedron" | "dodecahedron";

export interface PolyhedronParityParams {
  readonly radius?: number;
  readonly detail?: number;
  readonly variant?: PolyhedronVariant;
}

const TAU = (1 + Math.sqrt(5)) / 2;
const RTAU = 1 / TAU;

const BASE: Record<PolyhedronVariant, { readonly vertices: readonly number[]; readonly indices: readonly number[] }> = {
  tetrahedron: {
    vertices: [1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1],
    indices: [2, 1, 0, 0, 3, 2, 1, 3, 0, 2, 3, 1]
  },
  octahedron: {
    vertices: [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1],
    indices: [0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 3, 1, 3, 4, 1, 4, 2]
  },
  icosahedron: {
    vertices: [
      -1, TAU, 0, 1, TAU, 0, -1, -TAU, 0, 1, -TAU, 0,
      0, -1, TAU, 0, 1, TAU, 0, -1, -TAU, 0, 1, -TAU,
      TAU, 0, -1, TAU, 0, 1, -TAU, 0, -1, -TAU, 0, 1
    ],
    indices: [
      0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
      1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
      3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
      4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
    ]
  },
  dodecahedron: {
    vertices: [
      // (±1, ±1, ±1)
      -1, -1, -1, -1, -1, 1,
      -1, 1, -1, -1, 1, 1,
      1, -1, -1, 1, -1, 1,
      1, 1, -1, 1, 1, 1,
      // (0, ±1/φ, ±φ)
      0, -RTAU, -TAU, 0, -RTAU, TAU,
      0, RTAU, -TAU, 0, RTAU, TAU,
      // (±1/φ, ±φ, 0)
      -RTAU, -TAU, 0, -RTAU, TAU, 0,
      RTAU, -TAU, 0, RTAU, TAU, 0,
      // (±φ, 0, ±1/φ)
      -TAU, 0, -RTAU, TAU, 0, -RTAU,
      -TAU, 0, RTAU, TAU, 0, RTAU
    ],
    indices: [
      3, 11, 7, 3, 7, 15, 3, 15, 13,
      7, 19, 17, 7, 17, 6, 7, 6, 15,
      17, 4, 8, 17, 8, 10, 17, 10, 6,
      8, 0, 16, 8, 16, 2, 8, 2, 10,
      0, 12, 1, 0, 1, 18, 0, 18, 16,
      6, 10, 2, 6, 2, 13, 6, 13, 15,
      2, 16, 18, 2, 18, 3, 2, 3, 13,
      18, 1, 9, 18, 9, 11, 18, 11, 3,
      4, 14, 12, 4, 12, 0, 4, 0, 8,
      11, 9, 5, 11, 5, 19, 11, 19, 7,
      19, 5, 14, 19, 14, 4, 19, 4, 17,
      1, 12, 14, 1, 14, 5, 1, 5, 9
    ]
  }
};

type Vec3Tuple = readonly [number, number, number];

function lerp3(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function azimuth(vector: Vec3Tuple): number {
  return Math.atan2(vector[2], -vector[0]);
}

function inclination(vector: Vec3Tuple): number {
  return Math.atan2(-vector[1], Math.sqrt(vector[0] * vector[0] + vector[2] * vector[2]));
}

/** Raw `PolyhedronGeometry(vertices, indices, radius, detail)` — non-indexed. */
export function polyhedronParityMeshFromBase(vertices: readonly number[], indices: readonly number[], radius = 1, detail = 0): ParityMesh {
  const vertexBuffer: number[] = [];
  const uvBuffer: number[] = [];

  const pushVertex = (vertex: Vec3Tuple): void => {
    vertexBuffer.push(vertex[0], vertex[1], vertex[2]);
  };

  const getVertexByIndex = (index: number): Vec3Tuple => {
    const stride = index * 3;
    return [vertices[stride]!, vertices[stride + 1]!, vertices[stride + 2]!];
  };

  const subdivideFace = (a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple, d: number): void => {
    const cols = d + 1;
    const v: Vec3Tuple[][] = [];
    for (let i = 0; i <= cols; i += 1) {
      v[i] = [];
      const aj = lerp3(a, c, i / cols);
      const bj = lerp3(b, c, i / cols);
      const rows = cols - i;
      for (let j = 0; j <= rows; j += 1) {
        if (j === 0 && i === cols) {
          v[i]![j] = aj;
        } else {
          v[i]![j] = lerp3(aj, bj, j / rows);
        }
      }
    }
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < 2 * (cols - i) - 1; j += 1) {
        const k = Math.floor(j / 2);
        if (j % 2 === 0) {
          pushVertex(v[i]![k + 1]!);
          pushVertex(v[i + 1]![k]!);
          pushVertex(v[i]![k]!);
        } else {
          pushVertex(v[i]![k + 1]!);
          pushVertex(v[i + 1]![k + 1]!);
          pushVertex(v[i + 1]![k]!);
        }
      }
    }
  };

  for (let i = 0; i < indices.length; i += 3) {
    const a = getVertexByIndex(indices[i]!);
    const b = getVertexByIndex(indices[i + 1]!);
    const c = getVertexByIndex(indices[i + 2]!);
    subdivideFace(a, b, c, detail);
  }

  // applyRadius — project every vertex onto the sphere.
  for (let i = 0; i < vertexBuffer.length; i += 3) {
    const len = Math.hypot(vertexBuffer[i]!, vertexBuffer[i + 1]!, vertexBuffer[i + 2]!);
    const s = len === 0 ? 0 : radius / len;
    vertexBuffer[i] = vertexBuffer[i]! * s;
    vertexBuffer[i + 1] = vertexBuffer[i + 1]! * s;
    vertexBuffer[i + 2] = vertexBuffer[i + 2]! * s;
  }

  // generateUVs
  for (let i = 0; i < vertexBuffer.length; i += 3) {
    const vertex: Vec3Tuple = [vertexBuffer[i]!, vertexBuffer[i + 1]!, vertexBuffer[i + 2]!];
    const u = azimuth(vertex) / 2 / Math.PI + 0.5;
    const v = inclination(vertex) / Math.PI + 0.5;
    uvBuffer.push(u, 1 - v);
  }

  // correctUVs
  for (let i = 0, j = 0; i < vertexBuffer.length; i += 9, j += 6) {
    const a: Vec3Tuple = [vertexBuffer[i]!, vertexBuffer[i + 1]!, vertexBuffer[i + 2]!];
    const b: Vec3Tuple = [vertexBuffer[i + 3]!, vertexBuffer[i + 4]!, vertexBuffer[i + 5]!];
    const c: Vec3Tuple = [vertexBuffer[i + 6]!, vertexBuffer[i + 7]!, vertexBuffer[i + 8]!];
    const centroid: Vec3Tuple = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const azi = azimuth(centroid);
    const correctUV = (stride: number, vector: Vec3Tuple): void => {
      if (azi < 0 && uvBuffer[stride] === 1) {
        uvBuffer[stride] = uvBuffer[stride]! - 1;
      }
      if (vector[0] === 0 && vector[2] === 0) {
        uvBuffer[stride] = azi / 2 / Math.PI + 0.5;
      }
    };
    correctUV(j + 0, a);
    correctUV(j + 2, b);
    correctUV(j + 4, c);
  }

  // correctSeam — faces straddling the ±u seam get the <0.2 us bumped by 1.
  for (let i = 0; i < uvBuffer.length; i += 6) {
    const x0 = uvBuffer[i + 0]!;
    const x1 = uvBuffer[i + 2]!;
    const x2 = uvBuffer[i + 4]!;
    const max = Math.max(x0, x1, x2);
    const min = Math.min(x0, x1, x2);
    if (max > 0.9 && min < 0.1) {
      if (x0 < 0.2) uvBuffer[i + 0] = x0 + 1;
      if (x1 < 0.2) uvBuffer[i + 2] = x1 + 1;
      if (x2 < 0.2) uvBuffer[i + 4] = x2 + 1;
    }
  }

  // normals: a copy of positions; detail=0 → flat (computeVertexNormals),
  // detail>0 → normalizeNormals.
  let normals: number[];
  if (detail === 0) {
    normals = computeVertexNormals(vertexBuffer);
  } else {
    normals = new Array<number>(vertexBuffer.length);
    for (let i = 0; i < vertexBuffer.length; i += 3) {
      const len = Math.hypot(vertexBuffer[i]!, vertexBuffer[i + 1]!, vertexBuffer[i + 2]!);
      const s = len === 0 ? 0 : 1 / len;
      normals[i] = vertexBuffer[i]! * s;
      normals[i + 1] = vertexBuffer[i + 1]! * s;
      normals[i + 2] = vertexBuffer[i + 2]! * s;
    }
  }

  return { positions: vertexBuffer, normals, uvs: uvBuffer };
}

export function polyhedronParityMesh(params: PolyhedronParityParams = {}): ParityMesh {
  const variant = params.variant ?? "icosahedron";
  const base = BASE[variant];
  return polyhedronParityMeshFromBase(base.vertices, base.indices, params.radius ?? 1, params.detail ?? 0);
}
