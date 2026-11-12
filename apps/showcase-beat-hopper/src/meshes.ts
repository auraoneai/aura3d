/**
 * Exact-dimension procedural meshes for Beat Hopper. Plain arrays; `world.ts` turns them into
 * `geometry.dynamic` batches. Core dimensions and vertex counts (`boxMesh`..`wallMesh`) are pinned by
 * `tests/unit/beat-hopper/meshes.test.ts`; sculpted stage/obstacle/skater-bot helpers extend them cleanly.
 */
import { mergeMeshes, type MeshData } from "../../../examples/shared/runner-kit/index";
import {
  sculptMonolithWallMesh,
  sculptPlasmaCrossbarMesh,
  sculptSkaterBotMeshes,
  sculptSpeakerBlockMesh,
  sculptStanchionPostsMesh
} from "./art/proceduralModels";

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
    { n: [0, 1, 0], c: [[-x, y, z], [x, y, -z], [x, y, -z], [-x, y, -z]] },
    { n: [0, -1, 0], c: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] }
  ];
  // Restore exact top-face corners `[[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]]`
  faces[4] = { n: [0, 1, 0], c: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] };
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

/** Three 2 m lanes plus a 0.2 m shoulder each side. */
export const LANE_WIDTH = 2;
export const ROAD_WIDTH = 3 * LANE_WIDTH + 0.4;
export const SEGMENT_LENGTH = 2;
export const PLAYER_RADIUS = 0.42;
export const PLAYER_LENGTH = 0.5;
/** Obstacle pieces are one lane wide; a row draws one piece per blocked lane. */
export const BLOCK_SIZE = { w: 1.5, h: 0.95, d: 0.9 } as const;
export const BAR_SIZE = { w: 1.86, h: 0.3, d: 0.3, y: 1.12, postW: 0.16 } as const;
export const GAP_SIZE = { w: LANE_WIDTH, h: 0.12, d: 1.5 } as const;
/** Dodge obstacle: a tall lane wall (too high to hop) with a bright cap bar. */
export const WALL_SIZE = { w: 1.7, h: 2.3, d: 0.45, capH: 0.16 } as const;
/** Lane divider dash on the deck. */
export const DASH_SIZE = { w: 0.13, h: 0.02, d: 1.7 } as const;
export const ORB_RADIUS = 0.36;

/** The hopper: a neon capsule, base at y = 0 (pinned by meshes.test.ts). */
export const playerMesh = (): MeshData => translateMesh(capsuleMesh(PLAYER_RADIUS, PLAYER_LENGTH, 16, 6), 0, PLAYER_RADIUS + PLAYER_LENGTH / 2, 0);

/** Hop obstacle: a neon crate sitting on the road (pinned by meshes.test.ts). */
export const blockMesh = (): MeshData => translateMesh(boxMesh(BLOCK_SIZE.w, BLOCK_SIZE.h, BLOCK_SIZE.d), 0, BLOCK_SIZE.h / 2, 0);

/** Duck obstacle: an overhead bar on two side posts (the gap under it is 0.97 m — duck height is 0.84; pinned by meshes.test.ts). */
export const barMesh = (): MeshData => mergeMeshes([
  translateMesh(boxMesh(BAR_SIZE.w, BAR_SIZE.h, BAR_SIZE.d), 0, BAR_SIZE.y, 0),
  translateMesh(boxMesh(BAR_SIZE.postW, BAR_SIZE.y, BAR_SIZE.postW), -BAR_SIZE.w / 2 + BAR_SIZE.postW / 2, BAR_SIZE.y / 2, 0),
  translateMesh(boxMesh(BAR_SIZE.postW, BAR_SIZE.y, BAR_SIZE.postW), BAR_SIZE.w / 2 - BAR_SIZE.postW / 2, BAR_SIZE.y / 2, 0)
]);

/** Gap obstacle: a dark trench patch with the road missing under it (pinned by meshes.test.ts). */
export const gapMesh = (): MeshData => translateMesh(boxMesh(GAP_SIZE.w, GAP_SIZE.h, GAP_SIZE.d), 0, GAP_SIZE.h / 2 + 0.01, 0);

/** Wall obstacle: slab plus a glowing cap, base at y = 0 (48 verts; pinned by meshes.test.ts). */
export const wallMesh = (): MeshData => mergeMeshes([
  translateMesh(boxMesh(WALL_SIZE.w, WALL_SIZE.h, WALL_SIZE.d), 0, WALL_SIZE.h / 2, 0),
  translateMesh(boxMesh(WALL_SIZE.w + 0.1, WALL_SIZE.capH, WALL_SIZE.d + 0.1), 0, WALL_SIZE.h + WALL_SIZE.capH / 2, 0)
]);

/* ------------------------------------------------------------------ sculpted 10/10 concert-stage meshes */

/** Cylinder / frustum along +Y (or +Z when `alongZ = true`), centred at origin. */
export function cylinderMesh(rBottom: number, rTop: number, length: number, radial = 16, alongZ = false): MeshData {
  const m = empty();
  const h2 = length / 2;
  const slope = (rBottom - rTop) / Math.max(length, 1e-4);
  const invLen = 1 / Math.hypot(1, slope);
  for (let iy = 0; iy <= 1; iy++) {
    const v = iy;
    const r = iy === 0 ? rBottom : rTop;
    const posAxis = iy === 0 ? -h2 : h2;
    for (let k = 0; k <= radial; k++) {
      const u = k / radial;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nr = ca * invLen, ns = sa * invLen, na = slope * invLen;
      if (alongZ) {
        m.positions.push(ca * r, sa * r, posAxis);
        m.normals.push(nr, ns, na);
      } else {
        m.positions.push(ca * r, posAxis, sa * r);
        m.normals.push(nr, na, ns);
      }
      m.uvs.push(u, v);
    }
  }
  const row = radial + 1;
  for (let k = 0; k < radial; k++) {
    const a = k, b = k + 1, c = row + k, d = row + k + 1;
    m.indices.push(a, b, d, a, d, c);
  }
  return m;
}

/** Sculpted sub-bass speaker cabinet (`BLOCK_SIZE` footprint, base at y = 0): chamfered shell + `latheMesh` woofer cone & bass ports. */
export function speakerBlockMesh(): MeshData {
  return sculptSpeakerBlockMesh();
}

/** Stepped `latheMesh` stanchion posts + mounting yokes for the overhead duck bar (`BAR_SIZE`, base at y = 0). */
export function stanchionPostsMesh(): MeshData {
  return sculptStanchionPostsMesh();
}

/** Glowing anodized plasma emitter crossbar (`BAR_SIZE.y = 1.12`, exact 0.97 m duck clearance). */
export function plasmaCrossbarMesh(): MeshData {
  return sculptPlasmaCrossbarMesh();
}

/** Sculpted tall equalizer monolith body (`WALL_SIZE`, base at y = 0) with acoustic diffuser louvers & crown cap. */
export function monolithWallMesh(): MeshData {
  return sculptMonolithWallMesh();
}

/** Top-surface chasm opening quad (`GAP_SIZE.w x GAP_SIZE.d` at `y = 0.014`) with clean `[0..1]` UVs for interior mapping. */
export function gapChasmQuadMesh(): MeshData {
  const x = GAP_SIZE.w / 2;
  const z = GAP_SIZE.d / 2;
  const y = 0.015;
  return {
    positions: [-x, y, z, x, y, z, x, y, -z, -x, y, -z],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

/** Brilliant-cut 24-facet polyhedral studio-glass beat orb (radius `r`, centred at origin). */
export function crystalOrbMesh(r = ORB_RADIUS): MeshData {
  const m = empty();
  const sides = 8;
  const ringTop: [number, number, number][] = [];
  const ringBot: [number, number, number][] = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2;
    const b = ((k + 0.5) / sides) * Math.PI * 2;
    ringTop.push([Math.cos(a) * r * 0.92, r * 0.32, Math.sin(a) * r * 0.92]);
    ringBot.push([Math.cos(b) * r * 0.92, -r * 0.32, Math.sin(b) * r * 0.92]);
  }
  const apexTop: [number, number, number] = [0, r * 1.08, 0];
  const apexBot: [number, number, number] = [0, -r * 1.08, 0];
  const addTri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = m.positions.length / 3;
    m.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    m.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    m.uvs.push(0.5, 1, 0, 0, 1, 0);
    m.indices.push(base, base + 1, base + 2);
  };
  for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides;
    addTri(apexTop, ringTop[k2]!, ringTop[k]!);
    addTri(ringTop[k]!, ringTop[k2]!, ringBot[k]!);
    addTri(ringTop[k2]!, ringBot[k2]!, ringBot[k]!);
    addTri(apexBot, ringBot[k]!, ringBot[k2]!);
  }
  return m;
}

/** Flat XZ quad (`size x size`, `[0..1]` UVs) for runway ripple sprite-sheet bursts. */
export function flatQuadXZMesh(size = 1): MeshData {
  const s = size / 2;
  return {
    positions: [-s, 0, s, s, 0, s, s, 0, -s, -s, 0, -s],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

/** Upright XY quad (`size x size`, `[0..1]` UVs, facing +Z camera) for star-spark sprite-sheet bursts. */
export function uprightQuadXYMesh(size = 1): MeshData {
  const s = size / 2;
  return {
    positions: [-s, -s, 0, s, -s, 0, s, s, 0, -s, s, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

/** Continuous welded semicircular tube arc over the head (replaces the old 9 disconnected floating pink cubes!). */
export function headbandArcMesh(archRadius = 0.34, tubeRadius = 0.036, arcSegs = 18, radialSegs = 10): MeshData {
  const m = empty();
  for (let i = 0; i <= arcSegs; i++) {
    const t = i / arcSegs;
    const theta = Math.PI * t;
    const cx = Math.cos(theta) * archRadius;
    const cy = Math.sin(theta) * archRadius * 0.96;
    const rx = Math.cos(theta), ry = Math.sin(theta);
    for (let j = 0; j <= radialSegs; j++) {
      const phi = (j / radialSegs) * Math.PI * 2;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const nx = rx * cp;
      const ny = ry * cp;
      const nz = sp;
      m.positions.push(cx + nx * tubeRadius, cy + ny * tubeRadius, nz * tubeRadius * 1.35);
      m.normals.push(nx, ny, nz);
      m.uvs.push(t, j / radialSegs);
    }
  }
  const row = radialSegs + 1;
  for (let i = 0; i < arcSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * row + j, b = a + 1, c = (i + 1) * row + j, d = c + 1;
      m.indices.push(a, c, b, b, c, d);
    }
  }
  return m;
}

/** Articulated synth-skater bot parts in local pivot frames (lofted cuirass, aero-helmet, wraparound visor, spline headphones, lathed ear-cups, hover-skates). */
export function skaterBotMeshes() {
  return sculptSkaterBotMeshes();
}
