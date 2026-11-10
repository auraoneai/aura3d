/**
 * Procedural mesh builders for Polarity Orbs. Plain arrays in, `geometry.dynamic` out (world.ts); dimensions are
 * pinned by tests/unit/polarity-orbs/meshes.test.ts. No engine imports here.
 */
import type { MeshData } from "../../../examples/shared/runner-kit/batch";

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

/** Wide feathered magnetic-flux shockwave annulus (`uv.y` = radial 0..1 across [0.22, 1.0]). */
export const fluxWaveMesh = (segments = 64): MeshData => ringMesh(0.22, 1.0, segments);

/** Grounded live polarity reticle ring directly under the hero orb (`uv.x` = angle 0..1, `uv.y` = radial 0..1). */
export const reticleRingMesh = (segments = 48): MeshData => ringMesh(0.56, 0.94, segments);

/** Upright camera-facing quad (`+Z` normal) for 8x4 `createFlipbookAtlas("plasma")` polarity-discharge bursts. */
export function plasmaQuadMesh(size = 1): MeshData {
  const h = size / 2;
  return {
    positions: [-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

/** Precision brushed-metal equatorial collar ring around the hero magnetic orb (`y` in [-h/2, h/2]). */
export function orbCollarMesh(segments = 36): MeshData {
  const m = empty();
  const rOuter = BALL_RADIUS * 1.042;
  const rInner = BALL_RADIUS * 0.985;
  const hy = 0.044;
  const profile: readonly [number, number, number, number][] = [
    [rInner, -hy, 0, -1],
    [rOuter, -hy * 0.65, 1, -0.35],
    [rOuter, hy * 0.65, 1, 0.35],
    [rInner, hy, 0, 1]
  ];
  const ringCount = profile.length;
  for (let p = 0; p < ringCount; p++) {
    const [r, py, nr, ny] = profile[p]!;
    const nLen = Math.hypot(nr, ny) || 1;
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const a = u * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      m.positions.push(r * c, py, r * s);
      m.normals.push((nr / nLen) * c, ny / nLen, (nr / nLen) * s);
      m.uvs.push(u, p / (ringCount - 1));
    }
  }
  const stride = segments + 1;
  for (let p = 0; p < ringCount - 1; p++) {
    for (let i = 0; i < segments; i++) {
      const a = p * stride + i, b = a + 1, c = (p + 1) * stride + i, d = c + 1;
      m.indices.push(a, c, b, b, c, d);
    }
  }
  return m;
}

/**
 * Curved sinusoidal magnetic-flux dipole arc from z = -0.5 to z = +0.5 (`uv.x` = 0..1 along arc, `uv.y` = 0..1 across width).
 * Crossed horizontal + vertical ribbons keep the arc readable from chase and oblique camera angles.
 */
export function fluxArcMesh(segments = 14): MeshData {
  const m = empty();
  const halfW = 0.055;
  const planes: readonly [number, number, number, number, number][] = [
    [1, 0, 0, 1, 0],
    [0, 1, 1, 0, 0]
  ];
  for (const [ox, oy, nx, ny, nz] of planes) {
    const base = m.positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = t - 0.5;
      const envelope = Math.sin(Math.PI * t);
      const y = 0.24 * envelope;
      const x = 0.045 * Math.sin(Math.PI * 2 * t) * envelope;
      const w = halfW * (0.35 + 0.65 * envelope);
      m.positions.push(x - ox * w, y - oy * w, z, x + ox * w, y + oy * w, z);
      m.normals.push(nx, ny, nz, nx, ny, nz);
      m.uvs.push(t, 0, t, 1);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      m.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return m;
}
