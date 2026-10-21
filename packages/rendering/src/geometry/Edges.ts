/**
 * threejs-parity (§5.2, lane L2-06) — `EdgesGeometry` verbatim port.
 *
 * Every triangle's three edges are hashed on 4-decimal quantized vertex
 * positions; when the reverse edge is later seen, the shared edge is emitted
 * iff the two face normals' dot ≤ cos(thresholdAngle). Unmatched (boundary)
 * edges are appended in insertion order. Output = line-segment vertex pairs.
 */

import type { ParityMesh } from "./Support";

export interface EdgesInput {
  readonly positions: ArrayLike<number>;
  readonly indices?: ArrayLike<number>;
}

const DEG2RAD = Math.PI / 180;

export function edgesParityMesh(input: EdgesInput, thresholdAngle = 1): ParityMesh {
  const precision = Math.pow(10, 4);
  const thresholdDot = Math.cos(DEG2RAD * thresholdAngle);
  const position = input.positions;
  const indexAttr = input.indices;
  const indexCount = indexAttr ? indexAttr.length : position.length / 3;

  const hashes: string[] = ["", "", ""];
  const edgeData = new Map<string, { index0: number; index1: number; normal: readonly [number, number, number] } | null>();
  const vertices: number[] = [];

  const readVertex = (i: number): readonly [number, number, number] => [
    position[i * 3]!,
    position[i * 3 + 1]!,
    position[i * 3 + 2]!
  ];

  const triangleNormal = (a: readonly [number, number, number], b: readonly [number, number, number], c: readonly [number, number, number]): readonly [number, number, number] => {
    // three's Triangle.getNormal: (c−b) × (a−b), normalized (or zero).
    const cbx = c[0] - b[0];
    const cby = c[1] - b[1];
    const cbz = c[2] - b[2];
    const abx = a[0] - b[0];
    const aby = a[1] - b[1];
    const abz = a[2] - b[2];
    let nx = cby * abz - cbz * aby;
    let ny = cbz * abx - cbx * abz;
    let nz = cbx * aby - cby * abx;
    const lenSq = nx * nx + ny * ny + nz * nz;
    if (lenSq > 0) {
      const s = 1 / Math.sqrt(lenSq);
      nx *= s;
      ny *= s;
      nz *= s;
    } else {
      nx = 0;
      ny = 0;
      nz = 0;
    }
    return [nx, ny, nz];
  };

  const hashOf = (v: readonly [number, number, number]): string =>
    `${Math.round(v[0] * precision)},${Math.round(v[1] * precision)},${Math.round(v[2] * precision)}`;

  for (let i = 0; i < indexCount; i += 3) {
    const i0 = indexAttr ? indexAttr[i]! : i;
    const i1 = indexAttr ? indexAttr[i + 1]! : i + 1;
    const i2 = indexAttr ? indexAttr[i + 2]! : i + 2;

    const a = readVertex(i0);
    const b = readVertex(i1);
    const c = readVertex(i2);
    const normal = triangleNormal(a, b, c);
    const verts = [a, b, c] as const;

    hashes[0] = hashOf(a);
    hashes[1] = hashOf(b);
    hashes[2] = hashOf(c);

    if (hashes[0] === hashes[1] || hashes[1] === hashes[2] || hashes[2] === hashes[0]) {
      continue;
    }

    for (let j = 0; j < 3; j += 1) {
      const jNext = (j + 1) % 3;
      const vecHash0 = hashes[j]!;
      const vecHash1 = hashes[jNext]!;
      const v0 = verts[j]!;
      const v1 = verts[jNext]!;
      const indexJ = [i0, i1, i2][j]!;
      const indexJNext = [i0, i1, i2][jNext]!;

      const hash = `${vecHash0}_${vecHash1}`;
      const reverseHash = `${vecHash1}_${vecHash0}`;

      const sibling = edgeData.get(reverseHash);
      if (edgeData.has(reverseHash) && sibling) {
        if (normal[0] * sibling.normal[0] + normal[1] * sibling.normal[1] + normal[2] * sibling.normal[2] <= thresholdDot) {
          vertices.push(v0[0], v0[1], v0[2]);
          vertices.push(v1[0], v1[1], v1[2]);
        }
        edgeData.set(reverseHash, null);
      } else if (!edgeData.has(hash)) {
        edgeData.set(hash, { index0: indexJ, index1: indexJNext, normal });
      }
    }
  }

  for (const entry of edgeData.values()) {
    if (entry) {
      const v0 = readVertex(entry.index0);
      const v1 = readVertex(entry.index1);
      vertices.push(v0[0], v0[1], v0[2]);
      vertices.push(v1[0], v1[1], v1[2]);
    }
  }

  return { positions: vertices };
}
