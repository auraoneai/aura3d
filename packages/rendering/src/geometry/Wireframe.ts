/**
 * threejs-parity (§5.2, lane L2-06) — `WireframeGeometry` verbatim port.
 *
 * Unique triangle edges (exact-coordinate string hash, both directions
 * deduped) emitted in traversal order: indexed input walks the geometry
 * groups (a single implicit group when absent); non-indexed input walks
 * triangles in order. Output = line-segment vertex pairs.
 */

import type { ParityMesh } from "./Support";

export interface WireframeInput {
  readonly positions: ArrayLike<number>;
  readonly indices?: ArrayLike<number>;
  readonly groups?: readonly { readonly start: number; readonly count: number }[];
}

export function wireframeParityMesh(input: WireframeInput): ParityMesh {
  const vertices: number[] = [];
  const edges = new Set<string>();
  const position = input.positions;

  const isUniqueEdge = (sx: number, sy: number, sz: number, ex: number, ey: number, ez: number): boolean => {
    const hash1 = `${sx},${sy},${sz}-${ex},${ey},${ez}`;
    const hash2 = `${ex},${ey},${ez}-${sx},${sy},${sz}`;
    if (edges.has(hash1) || edges.has(hash2)) {
      return false;
    }
    edges.add(hash1);
    edges.add(hash2);
    return true;
  };

  const pushEdge = (index1: number, index2: number): void => {
    const sx = position[index1 * 3]!;
    const sy = position[index1 * 3 + 1]!;
    const sz = position[index1 * 3 + 2]!;
    const ex = position[index2 * 3]!;
    const ey = position[index2 * 3 + 1]!;
    const ez = position[index2 * 3 + 2]!;
    if (isUniqueEdge(sx, sy, sz, ex, ey, ez)) {
      vertices.push(sx, sy, sz, ex, ey, ez);
    }
  };

  const indices = input.indices;
  if (indices) {
    const groups = input.groups && input.groups.length > 0
      ? input.groups
      : [{ start: 0, count: indices.length, materialIndex: 0 }];
    for (const group of groups) {
      const groupStart = group.start;
      const groupCount = group.count;
      for (let i = groupStart, l = groupStart + groupCount; i < l; i += 3) {
        for (let j = 0; j < 3; j += 1) {
          const index1 = indices[i + j]!;
          const index2 = indices[i + ((j + 1) % 3)]!;
          pushEdge(index1, index2);
        }
      }
    }
  } else {
    const count = position.length / 9; // triangles = position.count / 3
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const index1 = 3 * i + j;
        const index2 = 3 * i + ((j + 1) % 3);
        pushEdge(index1, index2);
      }
    }
  }

  return { positions: vertices };
}
