/**
 * threejs-parity (docs/workflows/threejs-parity-gaps.md §5.2, lane L2-01) —
 * `Cone` / `CylinderGeometry` ported verbatim from three.js 0.185.1
 * (`src/geometries/CylinderGeometry.js`): identical vertex order
 * (torso rows top→bottom, × radial segments), identical index order,
 * identical UV layout and group order (torso 0, top cap 1, bottom cap 2).
 *
 * `coneParityMesh` is `CylinderGeometry(0, radius, ...)` — the PRD requires
 * the cone to flow through the existing `radiusTop`/`radiusBottom` plumbing
 * (`Geometry.ts` CylinderGeometryOptions), so both cone and cylinder params
 * land on this one port.
 */

import type { ParityMesh } from "./Support";

export interface CylinderParityParams {
  readonly radiusTop?: number;
  readonly radiusBottom?: number;
  readonly height?: number;
  readonly radialSegments?: number;
  readonly heightSegments?: number;
  readonly openEnded?: boolean;
  readonly thetaStart?: number;
  readonly thetaLength?: number;
}

/** three `CylinderGeometry` → ParityMesh (vertex/index/uv order identical). */
export function cylinderParityMesh(params: CylinderParityParams = {}): ParityMesh {
  const radiusTop = params.radiusTop ?? 1;
  const radiusBottom = params.radiusBottom ?? 1;
  const height = params.height ?? 1;
  const radialSegments = Math.floor(params.radialSegments ?? 32);
  const heightSegments = Math.floor(params.heightSegments ?? 1);
  const openEnded = params.openEnded ?? false;
  const thetaStart = params.thetaStart ?? 0;
  const thetaLength = params.thetaLength ?? Math.PI * 2;

  const indices: number[] = [];
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const groups: { start: number; count: number; materialIndex?: number }[] = [];

  let index = 0;
  const indexArray: number[][] = [];
  const halfHeight = height / 2;
  let groupStart = 0;

  const generateTorso = (): void => {
    let groupCount = 0;
    const slope = (radiusBottom - radiusTop) / height;

    for (let y = 0; y <= heightSegments; y += 1) {
      const indexRow: number[] = [];
      const v = y / heightSegments;
      const radius = v * (radiusBottom - radiusTop) + radiusTop;
      for (let x = 0; x <= radialSegments; x += 1) {
        const u = x / radialSegments;
        const theta = u * thetaLength + thetaStart;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        vertices.push(radius * sinTheta, -v * height + halfHeight, radius * cosTheta);
        const invLen = 1 / Math.hypot(sinTheta, slope, cosTheta);
        normals.push(sinTheta * invLen, slope * invLen, cosTheta * invLen);
        uvs.push(u, 1 - v);
        indexRow.push(index);
        index += 1;
      }
      indexArray.push(indexRow);
    }

    for (let x = 0; x < radialSegments; x += 1) {
      for (let y = 0; y < heightSegments; y += 1) {
        const a = indexArray[y]![x]!;
        const b = indexArray[y + 1]![x]!;
        const c = indexArray[y + 1]![x + 1]!;
        const d = indexArray[y]![x + 1]!;
        if (radiusTop > 0 || y !== 0) {
          indices.push(a, b, d);
          groupCount += 3;
        }
        if (radiusBottom > 0 || y !== heightSegments - 1) {
          indices.push(b, c, d);
          groupCount += 3;
        }
      }
    }

    groups.push({ start: groupStart, count: groupCount, materialIndex: 0 });
    groupStart += groupCount;
  };

  const generateCap = (top: boolean): void => {
    const centerIndexStart = index;
    let groupCount = 0;
    const radius = top === true ? radiusTop : radiusBottom;
    const sign = top === true ? 1 : -1;

    for (let x = 1; x <= radialSegments; x += 1) {
      vertices.push(0, halfHeight * sign, 0);
      normals.push(0, sign, 0);
      uvs.push(0.5, 0.5);
      index += 1;
    }

    const centerIndexEnd = index;

    for (let x = 0; x <= radialSegments; x += 1) {
      const u = x / radialSegments;
      const theta = u * thetaLength + thetaStart;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);
      vertices.push(radius * sinTheta, halfHeight * sign, radius * cosTheta);
      normals.push(0, sign, 0);
      uvs.push(cosTheta * 0.5 + 0.5, sinTheta * 0.5 * sign + 0.5);
      index += 1;
    }

    for (let x = 0; x < radialSegments; x += 1) {
      const c = centerIndexStart + x;
      const i = centerIndexEnd + x;
      if (top === true) {
        indices.push(i, i + 1, c);
      } else {
        indices.push(i + 1, i, c);
      }
      groupCount += 3;
    }

    groups.push({ start: groupStart, count: groupCount, materialIndex: top === true ? 1 : 2 });
  };

  generateTorso();
  if (openEnded === false) {
    if (radiusTop > 0) generateCap(true);
    if (radiusBottom > 0) generateCap(false);
  }

  return { positions: vertices, normals, uvs, indices, groups };
}

export interface ConeParityParams {
  readonly radius?: number;
  readonly height?: number;
  readonly radialSegments?: number;
  readonly heightSegments?: number;
  readonly openEnded?: boolean;
  readonly thetaStart?: number;
  readonly thetaLength?: number;
}

/** three `ConeGeometry(radius, height, …)` = `CylinderGeometry(0, radius, …)`. */
export function coneParityMesh(params: ConeParityParams = {}): ParityMesh {
  return cylinderParityMesh({
    radiusTop: 0,
    radiusBottom: params.radius ?? 1,
    height: params.height ?? 1,
    radialSegments: params.radialSegments,
    heightSegments: params.heightSegments,
    openEnded: params.openEnded,
    thetaStart: params.thetaStart,
    thetaLength: params.thetaLength
  });
}
