/**
 * threejs-parity (§5.2, lane L2-02) — `TubeGeometry` verbatim port.
 *
 * `path.computeFrenetFrames(tubularSegments, closed)` supplies the N/B rings;
 * each segment i emits radialSegments+1 verts with
 * normal = (cos·N + sin·B) (v = j/radialSegments·2π, cos = −cos(v)),
 * vertex = P + radius·normal — plus a duplicated first ring when closed.
 * UVs (i/tubular, j/radial); quad indices (a,b,d)(b,c,d).
 */

import type { Vector3 } from "@aura3d/math";
import type { Curve } from "@aura3d/math";
import { resolveCurve3 } from "./Support";
import type { ParityMesh } from "./Support";

export interface TubeParityParams {
  readonly path: unknown;
  readonly tubularSegments?: number;
  readonly radius?: number;
  readonly radialSegments?: number;
  readonly closed?: boolean;
}

export function tubeParityMesh(params: TubeParityParams): ParityMesh {
  const path: Curve<Vector3> = resolveCurve3(params.path);
  const tubularSegments = Math.floor(params.tubularSegments ?? 64);
  const radius = params.radius ?? 1;
  const radialSegments = Math.floor(params.radialSegments ?? 8);
  const closed = params.closed ?? false;

  const frames = path.computeFrenetFrames(tubularSegments, closed);
  // computeFrenetFrames returns null for curves without a 3D frame model
  // (e.g. 2D paths); a tube path is always 3D but the frozen Curve interface
  // keeps null in the type. Fail loudly rather than write NaN geometry.
  if (!frames) {
    throw new Error("tubeParityMesh: path curve does not provide Frenet frames (requires a 3D curve).");
  }

  const indices: number[] = [];
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const generateSegment = (i: number): void => {
    // three samples via getPointAt — arc-length uniform.
    const P = path.getPointAt(i / tubularSegments);
    const N = frames.normals[i]!;
    const B = frames.binormals[i]!;
    for (let j = 0; j <= radialSegments; j += 1) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      let nx = cos * N.x + sin * B.x;
      let ny = cos * N.y + sin * B.y;
      let nz = cos * N.z + sin * B.z;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      normals.push(nx, ny, nz);
      vertices.push(P.x + radius * nx, P.y + radius * ny, P.z + radius * nz);
    }
  };

  for (let i = 0; i < tubularSegments; i += 1) {
    generateSegment(i);
  }
  // Last row: regular segment when open; duplicate of the first ring when closed.
  generateSegment(closed === false ? tubularSegments : 0);

  for (let i = 0; i <= tubularSegments; i += 1) {
    for (let j = 0; j <= radialSegments; j += 1) {
      uvs.push(i / tubularSegments, j / radialSegments);
    }
  }

  for (let j = 1; j <= tubularSegments; j += 1) {
    for (let i = 1; i <= radialSegments; i += 1) {
      const a = (radialSegments + 1) * (j - 1) + (i - 1);
      const b = (radialSegments + 1) * j + (i - 1);
      const c = (radialSegments + 1) * j + i;
      const d = (radialSegments + 1) * (j - 1) + i;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  return { positions: vertices, normals, uvs, indices };
}
