/**
 * Exact-dimension procedural meshes for Beat Hopper. Plain arrays; `world.ts` turns them into
 * `geometry.dynamic` batches. Dimensions and vertex counts are pinned by `tests/unit/beat-hopper/meshes.test.ts`.
 */
import { mergeMeshes, type MeshData } from "../../../examples/shared/runner-kit/index";

export type { MeshData };
export { mergeMeshes };

const empty = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

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
    for (const [i, c] of f.c.entries()) {
      m.positions.push(c[0], c[1], c[2]);
      m.normals.push(f.n[0], f.n[1], f.n[2]);
      m.uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
    }
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return m;
}

/** UV sphere, poles on +/-Y: (widthSegments+1)*(heightSegments+1) vertices. */
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

/** Capsule along +Y: `length` is the cylinder section, total height `length + 2*radius`. */
export function capsuleMesh(radius: number, length: number, radial: number, caps: number): MeshData {
  const m = empty();
  const rows: { y: number; r: number; ny: number; nr: number }[] = [];
  for (let i = 0; i <= caps; i++) {
    const a = (i / caps) * (Math.PI / 2);
    rows.push({ y: length / 2 + Math.sin(a) * radius, r: Math.cos(a) * radius, ny: Math.sin(a), nr: Math.cos(a) });
  }
  const ring = [...rows.slice().reverse(), ...rows.map((r) => ({ y: -r.y, r: r.r, ny: -r.ny, nr: r.nr }))];
  const row = radial + 1;
  for (const rr of ring) {
    for (let k = 0; k <= radial; k++) {
      const t = (k / radial) * Math.PI * 2;
      m.positions.push(Math.cos(t) * rr.r, rr.y, Math.sin(t) * rr.r);
      m.normals.push(Math.cos(t) * rr.nr, rr.ny, Math.sin(t) * rr.nr);
      m.uvs.push(k / radial, 0);
    }
  }
  for (let i = 0; i < ring.length - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * row + k, b = a + 1, c = (i + 1) * row + k, d = c + 1;
      m.indices.push(a, c, b, b, c, d);
    }
  }
  return m;
}

/** Flat annulus on the XZ plane (the PERFECT timing ring): 2*(segments+1) vertices, segments*6 indices. */
export function ringMesh(inner: number, outer: number, segments: number): MeshData {
  const m = empty();
  for (let k = 0; k <= segments; k++) {
    const t = (k / segments) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    m.positions.push(inner * c, 0, inner * s, outer * c, 0, outer * s);
    m.normals.push(0, 1, 0, 0, 1, 0);
    m.uvs.push(k / segments, 0, k / segments, 1);
  }
  for (let k = 0; k < segments; k++) {
    const a = k * 2;
    m.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
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

/* ------------------------------------------------------------------ the pinned game pieces */

export const ROAD_WIDTH = 4;
export const SEGMENT_LENGTH = 2;
export const PLAYER_RADIUS = 0.42;
export const PLAYER_LENGTH = 0.5;
export const BLOCK_SIZE = { w: 1.7, h: 0.95, d: 0.9 } as const;
export const BAR_SIZE = { w: 3.6, h: 0.3, d: 0.3, y: 1.12, postW: 0.16 } as const;
export const GAP_SIZE = { w: ROAD_WIDTH, h: 0.12, d: 1.5 } as const;

/** The hopper: a neon capsule, base at y = 0. */
export const playerMesh = (): MeshData => translateMesh(capsuleMesh(PLAYER_RADIUS, PLAYER_LENGTH, 16, 6), 0, PLAYER_RADIUS + PLAYER_LENGTH / 2, 0);

/** Hop obstacle: a neon crate sitting on the road. */
export const blockMesh = (): MeshData => translateMesh(boxMesh(BLOCK_SIZE.w, BLOCK_SIZE.h, BLOCK_SIZE.d), 0, BLOCK_SIZE.h / 2, 0);

/** Duck obstacle: an overhead bar on two side posts (the gap under it is 0.97 m — duck height is 0.84). */
export const barMesh = (): MeshData => mergeMeshes([
  translateMesh(boxMesh(BAR_SIZE.w, BAR_SIZE.h, BAR_SIZE.d), 0, BAR_SIZE.y, 0),
  translateMesh(boxMesh(BAR_SIZE.postW, BAR_SIZE.y, BAR_SIZE.postW), -BAR_SIZE.w / 2 + BAR_SIZE.postW / 2, BAR_SIZE.y / 2, 0),
  translateMesh(boxMesh(BAR_SIZE.postW, BAR_SIZE.y, BAR_SIZE.postW), BAR_SIZE.w / 2 - BAR_SIZE.postW / 2, BAR_SIZE.y / 2, 0)
]);

/** Gap obstacle: a dark trench patch with the road missing under it (hop over). */
export const gapMesh = (): MeshData => translateMesh(boxMesh(GAP_SIZE.w, GAP_SIZE.h, GAP_SIZE.d), 0, GAP_SIZE.h / 2 + 0.01, 0);