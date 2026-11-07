/**
 * Procedural mesh builders for Shape Shift Sprint (plain arrays; `world.ts` turns them into
 * `geometry.dynamic` specs). Dimensions are pinned by tests/unit/shape-shift-sprint/meshes.test.ts.
 * The wall-with-holes is panels + separate shape rims (no CSG): each lane cell is four box panels
 * around a square opening, and a flat shape annulus (circle / square / triangle) marks the hole.
 */
import type { MeshData } from "../../../examples/shared/runner-kit/index";

export type { MeshData };

const empty = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

export function mergeMeshes(parts: readonly MeshData[]): MeshData {
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

/** UV sphere, poles on +/-Y. Vertices: (widthSegments+1)*(heightSegments+1). */
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

/** Axis-aligned box centred at (cx, cy, cz); 24 vertices, 36 indices, per-face normals. */
export function boxMesh(w: number, h: number, d: number, cx = 0, cy = 0, cz = 0): MeshData {
  const m = empty();
  const x = w / 2, y = h / 2, z = d / 2;
  const faces: { n: [number, number, number]; p: [number, number, number][] }[] = [
    { n: [0, 0, 1], p: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    { n: [0, 0, -1], p: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    { n: [1, 0, 0], p: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
    { n: [-1, 0, 0], p: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
    { n: [0, 1, 0], p: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
    { n: [0, -1, 0], p: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] }
  ];
  for (const f of faces) {
    const base = m.positions.length / 3;
    for (const [px, py, pz] of f.p) {
      m.positions.push(cx + px, cy + py, cz + pz);
      m.normals.push(...f.n);
    }
    m.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return m;
}

/** Closed cone: apex at +h/2, base at -h/2, then translated by dy. radial side segments + closed base. */
export function coneMesh(radius: number, height: number, radial: number, dy = 0): MeshData {
  const m = empty();
  const slope = radius / height;
  const nl = Math.hypot(1, slope);
  for (let k = 0; k <= radial; k++) {
    const t = (k / radial) * Math.PI * 2;
    const s = Math.sin(t), c = Math.cos(t);
    m.positions.push(0, height / 2 + dy, 0);
    m.normals.push(s / nl, slope / nl, c / nl);
    m.uvs.push(k / radial, 1);
    m.positions.push(radius * s, -height / 2 + dy, radius * c);
    m.normals.push(s / nl, slope / nl, c / nl);
    m.uvs.push(k / radial, 0);
  }
  for (let k = 0; k < radial; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    m.indices.push(a, b, c, b, d, c);
  }
  const centre = m.positions.length / 3;
  m.positions.push(0, -height / 2 + dy, 0);
  m.normals.push(0, -1, 0);
  m.uvs.push(0.5, 0.5);
  for (let k = 0; k <= radial; k++) {
    const t = (k / radial) * Math.PI * 2;
    m.positions.push(radius * Math.sin(t), -height / 2 + dy, radius * Math.cos(t));
    m.normals.push(0, -1, 0);
    m.uvs.push(0.5 + 0.5 * Math.sin(t), 0.5 + 0.5 * Math.cos(t));
  }
  for (let k = 0; k < radial; k++) m.indices.push(centre + k + 2, centre + k + 1, centre);
  return m;
}

/** Flat quad on the XZ plane (y = 0), centred, uv over the whole quad. */
export function groundQuad(w: number, d: number, cx = 0, cz = 0): MeshData {
  const m = empty();
  const x = w / 2, z = d / 2;
  m.positions.push(cx - x, 0, cz - z, cx + x, 0, cz - z, cx + x, 0, cz + z, cx - x, 0, cz + z);
  for (let i = 0; i < 4; i++) m.normals.push(0, 1, 0);
  m.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
  m.indices.push(0, 2, 1, 0, 3, 2);
  return m;
}

/* ------------------------------------------------------------------ game dimensions (pinned by unit tests) */

export const PLAYER_DIMS = {
  sphere: { radius: 0.55, width: 20, height: 14 },
  cube: { size: 0.96 },
  cone: { radius: 0.58, height: 1.1, radial: 24, dy: -0.55 }
} as const;

export const WALL_DIMS = {
  cellWidth: 2.3, cellHeight: 3, thickness: 0.25,
  openingWidth: 1.7, openingHeight: 1.7, openingCenterY: 1.15
} as const;

export const RIM_SEGMENTS = 48;
export const RIM_OUTER = 0.85;
export const RIM_INNER = 0.7;

export const TOKEN_DIMS = { radius: 0.32, width: 12, height: 8 } as const;

/** The player's three forms, centred on the origin (sphere red / cube yellow / cone blue via look). */
export function playerMesh(shapeIndex: number): MeshData {
  if (shapeIndex === 0) return sphereMesh(PLAYER_DIMS.sphere.radius, PLAYER_DIMS.sphere.width, PLAYER_DIMS.sphere.height);
  if (shapeIndex === 1) return boxMesh(PLAYER_DIMS.cube.size, PLAYER_DIMS.cube.size, PLAYER_DIMS.cube.size);
  return coneMesh(PLAYER_DIMS.cone.radius, PLAYER_DIMS.cone.height, PLAYER_DIMS.cone.radial, PLAYER_DIMS.cone.dy + PLAYER_DIMS.cone.height / 2);
}

/** One lane cell: four box panels around a square opening (the shape rim marks the hole; no CSG). */
export function wallCellMesh(): MeshData {
  const { cellWidth, cellHeight, thickness, openingWidth, openingHeight, openingCenterY } = WALL_DIMS;
  const oy0 = openingCenterY - openingHeight / 2, oy1 = openingCenterY + openingHeight / 2;
  const ox = openingWidth / 2, sideW = cellWidth / 2 - ox;
  return mergeMeshes([
    boxMesh(cellWidth, oy0, thickness, 0, oy0 / 2, 0),
    boxMesh(cellWidth, cellHeight - oy1, thickness, 0, (cellHeight + oy1) / 2, 0),
    boxMesh(sideW, openingHeight, thickness, -(ox + sideW / 2), openingCenterY, 0),
    boxMesh(sideW, openingHeight, thickness, ox + sideW / 2, openingCenterY, 0)
  ]);
}

/** Perimeter point at fraction t (0..1) of a circle / square / triangle outline, radius r, starting at the top. */
function outlinePoint(shapeIndex: number, t: number, r: number): [number, number] {
  if (shapeIndex === 0) {
    const a = Math.PI / 2 - t * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }
  const sides = shapeIndex === 1 ? 4 : 3;
  const rot = shapeIndex === 1 ? Math.PI / 4 : Math.PI / 2;
  const verts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    verts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const seg = Math.min(sides - 1, Math.floor(t * sides));
  const f = t * sides - seg;
  const [x0, y0] = verts[seg] as [number, number];
  const [x1, y1] = verts[(seg + 1) % sides] as [number, number];
  return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
}

/**
 * Flat shape annulus in the XY plane at z = 0 (circle / square / triangle), centred on the origin.
 * All three rims share the same vertex count and index topology so one Batch can place any of them.
 */
export function rimMesh(shapeIndex: number): MeshData {
  const m = empty();
  const n = RIM_SEGMENTS;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const [ox, oy] = outlinePoint(shapeIndex, t, RIM_OUTER);
    const [ix, iy] = outlinePoint(shapeIndex, t, RIM_INNER);
    m.positions.push(ox, oy, 0, ix, iy, 0);
    m.normals.push(0, 0, 1, 0, 0, 1);
    m.uvs.push(t, 1, t, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = ((i + 1) % n) * 2, d = c + 1;
    m.indices.push(a, b, c, b, d, c);
  }
  return m;
}

export function tokenMesh(): MeshData {
  return sphereMesh(TOKEN_DIMS.radius, TOKEN_DIMS.width, TOKEN_DIMS.height);
}

/** One road segment: cream strip plus two lane-divider dashes (darker via per-vertex tone). */
export const ROAD_DIMS = { width: 7.4, length: 2, dashWidth: 0.1, dashLength: 0.9, dashX: 1.15 } as const;

export function roadSegmentMesh(): MeshData {
  const { width, length, dashWidth, dashLength, dashX } = ROAD_DIMS;
  const m = mergeMeshes([groundQuad(width, length), groundQuad(dashWidth, dashLength, -dashX), groundQuad(dashWidth, dashLength, dashX)]);
  // Lift the dashes off the strip so the coplanar quads never z-fight.
  for (let v = 4; v < 12; v++) m.positions[v * 3 + 1] = 0.02;
  return m;
}

/** Per-vertex tone for the road template: strip white, dashes darker cream (multiplies the base colour). */
export function roadTones(): number[] {
  const tones: number[] = [];
  for (let v = 0; v < 4; v++) tones.push(1, 1, 1);
  for (let v = 0; v < 8; v++) tones.push(0.82, 0.74, 0.62);
  return tones;
}

/** Confetti chip: a unit box scaled per particle. */
export function confettiMesh(): MeshData {
  return boxMesh(1, 0.35, 0.7);
}