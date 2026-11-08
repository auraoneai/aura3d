/**
 * Procedural mesh builders for Polarity Orbs. Plain arrays in, `geometry.dynamic` out (world.ts); dimensions are
 * pinned by tests/unit/polarity-orbs/meshes.test.ts. No engine imports here.
 */
import type { MeshData } from "../../../examples/shared/runner-kit/index";

export const BALL_RADIUS = 0.5;
export const ORB_RADIUS = 0.45;
export const PARTICLE_RADIUS = 0.12;
export const GEM_RADIUS = 0.4;
export const SEG_LEN = 2;
export const DECK_WIDTH = 8;
export const RING_INNER = 0.85;
export const RING_OUTER = 1;

const empty = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

/** UV sphere, poles on +/-Y: (widthSegments + 1) * (heightSegments + 1) vertices. */
export function sphereMesh(radius: number, widthSegments: number, heightSegments: number, cx = 0, cy = 0, cz = 0): MeshData {
  const m = empty();
  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments;
      const px = -Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI);
      const py = Math.cos(v * Math.PI);
      const pz = Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);
      m.positions.push(cx + radius * px, cy + radius * py, cz + radius * pz);
      m.normals.push(px, py, pz);
      m.uvs.push(u, 1 - v);
    }
  }
  const row = widthSegments + 1;
  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = iy * row + ix + 1, b = iy * row + ix, c = (iy + 1) * row + ix, d = (iy + 1) * row + ix + 1;
      if (iy !== 0) m.indices.push(a, b, d);
      if (iy !== heightSegments - 1) m.indices.push(b, c, d);
    }
  }
  return m;
}

/** Axis-aligned box centred on the origin: 24 vertices (4 per face), 36 indices. */
export function boxMesh(w: number, h: number, d: number): MeshData {
  const m = empty();
  const x = w / 2, y = h / 2, z = d / 2;
  const faces: { n: [number, number, number]; c: [number, number, number][] }[] = [
    { n: [0, 0, 1], c: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    { n: [0, 0, -1], c: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    { n: [1, 0, 0], c: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
    { n: [-1, 0, 0], c: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
    { n: [0, 1, 0], c: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
    { n: [0, -1, 0], c: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] }
  ];
  for (const f of faces) {
    const base = m.positions.length / 3;
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      m.positions.push(...(f.c[i] as [number, number, number]));
      m.normals.push(...f.n);
      m.uvs.push(...(uvs[i] as [number, number]));
    }
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return m;
}

/** Flat quad on the XZ plane at y = 0 with 0..1 uvs (contact shadow). */
export function quadMesh(w: number, d: number): MeshData {
  const x = w / 2, z = d / 2;
  return {
    positions: [-x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 2, 1, 0, 3, 2]
  };
}

/** Flat annulus on the XZ plane (flip shockwave): (segments + 1) * 2 vertices. */
export function ringMesh(inner: number, outer: number, segments: number): MeshData {
  const m = empty();
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    m.positions.push(inner * c, 0, inner * s, outer * c, 0, outer * s);
    m.normals.push(0, 1, 0, 0, 1, 0);
    m.uvs.push(i / segments, 0, i / segments, 1);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    m.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return m;
}

/** Octahedron gem with flat per-face normals: 24 vertices, 24 indices (power-up token). */
export function gemMesh(radius: number): MeshData {
  const m = empty();
  const top = [0, radius * 1.3, 0], bottom = [0, -radius * 1.3, 0];
  const ring: [number, number, number][] = [[radius, 0, 0], [0, 0, radius], [-radius, 0, 0], [0, 0, -radius]];
  const faces: [number[], number[], number[]][] = [];
  for (let i = 0; i < 4; i++) {
    faces.push([top, ring[i] as number[], ring[(i + 1) % 4] as number[]]);
    faces.push([bottom, ring[(i + 1) % 4] as number[], ring[i] as number[]]);
  }
  for (const [a, b, c] of faces) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = m.positions.length / 3;
    for (const p of [a, b, c]) {
      m.positions.push(p[0] as number, p[1] as number, p[2] as number);
      m.normals.push(nx, ny, nz);
    }
    m.uvs.push(0.5, 1, 0, 0, 1, 0);
    m.indices.push(base, base + 1, base + 2);
  }
  return m;
}

export function translateMesh(m: MeshData, tx: number, ty: number, tz: number): MeshData {
  const out: MeshData = { positions: m.positions.slice(), normals: m.normals.slice(), uvs: m.uvs.slice(), indices: m.indices.slice() };
  for (let i = 0; i < out.positions.length; i += 3) {
    out.positions[i] = (out.positions[i] as number) + tx;
    out.positions[i + 1] = (out.positions[i + 1] as number) + ty;
    out.positions[i + 2] = (out.positions[i + 2] as number) + tz;
  }
  return out;
}

/**
 * Polarity symbol: a horizontal bar plus a vertical bar. The minus variant keeps the same vertex count with the
 * vertical bar collapsed to a sliver, so one Batch can place either via `place(..., from)`.
 */
export function symbolMesh(kind: "plus" | "minus"): MeshData {
  const horizontal = boxMesh(0.42, 0.02, 0.1);
  const vertical = kind === "plus" ? boxMesh(0.1, 0.02, 0.42) : boxMesh(0.0001, 0.02, 0.0001);
  const parts = [horizontal, vertical];
  const out = empty();
  for (const p of parts) {
    const base = out.positions.length / 3;
    out.positions.push(...p.positions);
    out.normals.push(...p.normals);
    out.uvs.push(...p.uvs);
    for (const i of p.indices) out.indices.push(base + i);
  }
  return out;
}

export const ballMesh = (): MeshData => sphereMesh(BALL_RADIUS, 24, 16);
export const orbMesh = (): MeshData => sphereMesh(ORB_RADIUS, 16, 12);
export const particleMesh = (): MeshData => sphereMesh(PARTICLE_RADIUS, 6, 6);
export const powerupMesh = (): MeshData => gemMesh(GEM_RADIUS);
export const deckHalfMesh = (): MeshData => boxMesh(DECK_WIDTH / 2, 0.3, SEG_LEN);
export const railMesh = (): MeshData => boxMesh(0.3, 0.35, SEG_LEN);
export const dashMesh = (): MeshData => boxMesh(0.15, 0.02, 1.2);
export const shadowMesh = (): MeshData => quadMesh(2, 2);
export const shockwaveMesh = (): MeshData => ringMesh(RING_INNER, RING_OUTER, 48);
export const streamMesh = (): MeshData => boxMesh(0.06, 0.06, 1);