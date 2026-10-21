/**
 * threejs-parity (§5.2, lane L2-01) — `TorusKnotGeometry` verbatim port.
 * Per tubular segment i: sample curve at u and u+0.01 for the T/N/B basis,
 * emit radialSegments+1 ring verts (v = j/radialSegments * 2π) with
 * normal = vertex − P1 normalized and uv = (i/tubular, j/radial).
 * Indices per quad: (a,b,d)(b,c,d).
 */

import type { ParityMesh } from "./Support";

export interface TorusKnotParityParams {
  readonly radius?: number;
  readonly tube?: number;
  readonly tubularSegments?: number;
  readonly radialSegments?: number;
  readonly p?: number;
  readonly q?: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function calculatePositionOnCurve(u: number, p: number, q: number, radius: number, position: Vec3): void {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const quOverP = (q / p) * u;
  const cs = Math.cos(quOverP);
  position.x = radius * (2 + cs) * 0.5 * cu;
  position.y = radius * (2 + cs) * su * 0.5;
  position.z = radius * Math.sin(quOverP) * 0.5;
}

export function torusKnotParityMesh(params: TorusKnotParityParams = {}): ParityMesh {
  const radius = params.radius ?? 1;
  const tube = params.tube ?? 0.4;
  const tubularSegments = Math.floor(params.tubularSegments ?? 64);
  const radialSegments = Math.floor(params.radialSegments ?? 8);
  const p = params.p ?? 2;
  const q = params.q ?? 3;

  const indices: number[] = [];
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const P1: Vec3 = { x: 0, y: 0, z: 0 };
  const P2: Vec3 = { x: 0, y: 0, z: 0 };

  for (let i = 0; i <= tubularSegments; i += 1) {
    const u = (i / tubularSegments) * p * Math.PI * 2;

    calculatePositionOnCurve(u, p, q, radius, P1);
    calculatePositionOnCurve(u + 0.01, p, q, radius, P2);

    // T = P2 − P1; N = P2 + P1; B = T × N; N = B × T; normalize B, N.
    const Tx = P2.x - P1.x;
    const Ty = P2.y - P1.y;
    const Tz = P2.z - P1.z;
    let Nx = P2.x + P1.x;
    let Ny = P2.y + P1.y;
    let Nz = P2.z + P1.z;
    let Bx = Ty * Nz - Tz * Ny;
    let By = Tz * Nx - Tx * Nz;
    let Bz = Tx * Ny - Ty * Nx;
    Nx = By * Tz - Bz * Ty;
    Ny = Bz * Tx - Bx * Tz;
    Nz = Bx * Ty - By * Tx;
    const bl = Math.hypot(Bx, By, Bz);
    Bx /= bl;
    By /= bl;
    Bz /= bl;
    const nl = Math.hypot(Nx, Ny, Nz);
    Nx /= nl;
    Ny /= nl;
    Nz /= nl;

    for (let j = 0; j <= radialSegments; j += 1) {
      const v = (j / radialSegments) * Math.PI * 2;
      const cx = -tube * Math.cos(v);
      const cy = tube * Math.sin(v);

      const vx = P1.x + (cx * Nx + cy * Bx);
      const vy = P1.y + (cx * Ny + cy * By);
      const vz = P1.z + (cx * Nz + cy * Bz);
      vertices.push(vx, vy, vz);

      const nx = vx - P1.x;
      const ny = vy - P1.y;
      const nz = vz - P1.z;
      const il = 1 / Math.hypot(nx, ny, nz);
      normals.push(nx * il, ny * il, nz * il);

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
