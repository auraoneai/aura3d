/**
 * threejs-parity (§5.2, lane L2-01) — `CircleGeometry` verbatim port.
 * Center vertex first, then `segments + 1` ring vertices; indices
 * (i, i+1, 0); normals all (0,0,1); UVs remapped into [0,1]² from xy/radius.
 */

import type { ParityMesh } from "./Support";

export interface CircleParityParams {
  readonly radius?: number;
  readonly segments?: number;
  readonly thetaStart?: number;
  readonly thetaLength?: number;
}

export function circleParityMesh(params: CircleParityParams = {}): ParityMesh {
  const radius = params.radius ?? 1;
  const segments = Math.max(3, params.segments ?? 32);
  const thetaStart = params.thetaStart ?? 0;
  const thetaLength = params.thetaLength ?? Math.PI * 2;

  const indices: number[] = [];
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  vertices.push(0, 0, 0);
  normals.push(0, 0, 1);
  uvs.push(0.5, 0.5);

  for (let s = 0; s <= segments; s += 1) {
    const segment = thetaStart + (s / segments) * thetaLength;
    const x = radius * Math.cos(segment);
    const y = radius * Math.sin(segment);
    vertices.push(x, y, 0);
    normals.push(0, 0, 1);
    uvs.push((x / radius + 1) / 2, (y / radius + 1) / 2);
  }

  for (let i = 1; i <= segments; i += 1) {
    indices.push(i, i + 1, 0);
  }

  return { positions: vertices, normals, uvs, indices };
}
