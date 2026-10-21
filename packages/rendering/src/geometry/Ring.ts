/**
 * threejs-parity (§5.2, lane L2-01) — `RingGeometry` verbatim port.
 * (phiSegments+1) radius rows × (thetaSegments+1) angular verts, inside→out;
 * quad faces (a,b,d)(b,c,d); normals (0,0,1); UVs remapped via /outerRadius.
 */

import type { ParityMesh } from "./Support";

export interface RingParityParams {
  readonly innerRadius?: number;
  readonly outerRadius?: number;
  readonly thetaSegments?: number;
  readonly phiSegments?: number;
  readonly thetaStart?: number;
  readonly thetaLength?: number;
}

export function ringParityMesh(params: RingParityParams = {}): ParityMesh {
  const innerRadius = params.innerRadius ?? 0.5;
  const outerRadius = params.outerRadius ?? 1;
  const thetaSegments = Math.max(3, params.thetaSegments ?? 32);
  const phiSegments = Math.max(1, params.phiSegments ?? 1);
  const thetaStart = params.thetaStart ?? 0;
  const thetaLength = params.thetaLength ?? Math.PI * 2;

  const indices: number[] = [];
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  let radius = innerRadius;
  const radiusStep = (outerRadius - innerRadius) / phiSegments;

  for (let j = 0; j <= phiSegments; j += 1) {
    for (let i = 0; i <= thetaSegments; i += 1) {
      const segment = thetaStart + (i / thetaSegments) * thetaLength;
      const x = radius * Math.cos(segment);
      const y = radius * Math.sin(segment);
      vertices.push(x, y, 0);
      normals.push(0, 0, 1);
      uvs.push((x / outerRadius + 1) / 2, (y / outerRadius + 1) / 2);
    }
    radius += radiusStep;
  }

  for (let j = 0; j < phiSegments; j += 1) {
    const thetaSegmentLevel = j * (thetaSegments + 1);
    for (let i = 0; i < thetaSegments; i += 1) {
      const segment = i + thetaSegmentLevel;
      const a = segment;
      const b = segment + thetaSegments + 1;
      const c = segment + thetaSegments + 2;
      const d = segment + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  return { positions: vertices, normals, uvs, indices };
}
