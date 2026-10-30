/**
 * Exact-dimension mesh generators for the port (the engine's unit primitives are sized by `size`, which
 * makes a capsule of radius 0.46 and a 6.24 m bar ambiguous). Each returns plain arrays; `world.ts` turns
 * them into `geometry.dynamic` specs. Dimensions are those of the original's three.js geometries.
 */

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

const empty = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

/** three's SphereGeometry(radius, widthSegments, heightSegments), unrotated (poles on +/-Y). */
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

/** A capsule along +Y: `length` is the cylinder section, so the total height is `length + 2 * radius`. */
export function capsuleMesh(radius: number, length: number, radial: number, caps: number): MeshData {
  const m = empty();
  const rows: { y: number; r: number; ny: number; nr: number }[] = [];
  for (let i = 0; i <= caps; i++) {
    const a = (i / caps) * (Math.PI / 2);
    rows.push({ y: length / 2 + Math.sin(a) * radius, r: Math.cos(a) * radius, ny: Math.sin(a), nr: Math.cos(a) });
  }
  const top = rows.slice().reverse().map((row) => row);
  const bottom = rows.map((row) => ({ y: -row.y, r: row.r, ny: -row.ny, nr: row.nr }));
  const ring = [...top, ...bottom];
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

/** three's CylinderGeometry(radiusTop, radiusBottom, height, radialSegments), closed. */
export function cylinderMesh(radiusTop: number, radiusBottom: number, height: number, radial: number): MeshData {
  const m = empty();
  const slope = (radiusBottom - radiusTop) / height;
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k <= radial; k++) {
      const t = (k / radial) * Math.PI * 2;
      const s = Math.sin(t), c = Math.cos(t);
      const nl = Math.hypot(1, slope);
      m.positions.push(radiusTop * s, height / 2, radiusTop * c);
      m.normals.push(s / nl, slope / nl, c / nl);
      m.uvs.push(k / radial, 1);
      m.positions.push(radiusBottom * s, -height / 2, radiusBottom * c);
      m.normals.push(s / nl, slope / nl, c / nl);
      m.uvs.push(k / radial, 0);
    }
    break;
  }
  for (let k = 0; k < radial; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    m.indices.push(a, b, c, b, d, c);
  }
  for (const [y, r, ny] of [[height / 2, radiusTop, 1], [-height / 2, radiusBottom, -1]] as const) {
    const centre = m.positions.length / 3;
    m.positions.push(0, y, 0);
    m.normals.push(0, ny, 0);
    m.uvs.push(0.5, 0.5);
    for (let k = 0; k <= radial; k++) {
      const t = (k / radial) * Math.PI * 2;
      m.positions.push(r * Math.sin(t), y, r * Math.cos(t));
      m.normals.push(0, ny, 0);
      m.uvs.push(0.5 + 0.5 * Math.sin(t), 0.5 + 0.5 * Math.cos(t));
    }
    for (let k = 0; k < radial; k++) {
      if (ny > 0) m.indices.push(centre + k + 1, centre + k + 2, centre);
      else m.indices.push(centre + k + 2, centre + k + 1, centre);
    }
  }
  return m;
}

/** three's ConeGeometry(radius, height, radialSegments) translated so the base sits at y = 0 + `dy`. */
export function coneMesh(radius: number, height: number, radial: number, dy: number): MeshData {
  const m = cylinderMesh(0, radius, height, radial);
  for (let i = 1; i < m.positions.length; i += 3) m.positions[i] = (m.positions[i] as number) + dy;
  return m;
}

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

/** Translate / rotate-about-Z / scale a mesh (used to place the gate posts and bar). */
export function transformMesh(m: MeshData, opts: { rz?: number; tx?: number; ty?: number; tz?: number; scale?: number }): MeshData {
  const c = Math.cos(opts.rz ?? 0), s = Math.sin(opts.rz ?? 0), k = opts.scale ?? 1;
  const out = empty();
  out.uvs = m.uvs.slice();
  out.indices = m.indices.slice();
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i] as number, y = m.positions[i + 1] as number, z = m.positions[i + 2] as number;
    out.positions.push((x * c - y * s) * k + (opts.tx ?? 0), (x * s + y * c) * k + (opts.ty ?? 0), z * k + (opts.tz ?? 0));
    const nx = m.normals[i] as number, ny = m.normals[i + 1] as number, nz = m.normals[i + 2] as number;
    out.normals.push(nx * c - ny * s, nx * s + ny * c, nz);
  }
  return out;
}

/** The splatter blob outline: the original's bezier Shape sampled to a polygon (x, y in shape space). */
export function blobOutline(samples = 12): [number, number][] {
  const curves: [number, number][][] = [
    [[0, 0.5], [0.5, 0.5], [0.8, 0.2], [0.8, -0.1]],
    [[0.8, -0.1], [0.8, -0.5], [0.4, -0.8], [0, -0.8]],
    [[0, -0.8], [-0.5, -0.8], [-0.9, -0.4], [-0.7, 0.1]],
    [[-0.7, 0.1], [-0.5, 0.5], [-0.3, 0.5], [0, 0.5]]
  ];
  const pts: [number, number][] = [];
  for (const [p0, p1, p2, p3] of curves as [number, number][][] as [[number, number], [number, number], [number, number], [number, number]][]) {
    for (let i = 0; i < samples; i++) {
      const t = i / samples, u = 1 - t;
      pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
  }
  return pts;
}

/** A flat, slightly thick blob lying on the XZ plane (the original extrudes the shape 0.05 and rotates it flat). */
export function blobMesh(scale: number, thickness: number): MeshData {
  const outline = blobOutline();
  const m = empty();
  // shape (x, y) -> world (x, 0, -y) after rotation.x = -PI/2; fan from the centroid
  m.positions.push(0, thickness, 0);
  m.normals.push(0, 1, 0);
  m.uvs.push(0.5, 0.5);
  for (const [x, y] of outline) {
    m.positions.push(x * scale, thickness, -y * scale);
    m.normals.push(0, 1, 0);
    m.uvs.push(0.5 + x * 0.5, 0.5 + y * 0.5);
  }
  for (let i = 0; i < outline.length; i++) m.indices.push(0, 1 + ((i + 1) % outline.length), 1 + i);
  return m;
}

/**
 * GU47 CR-M3 paint drips hanging from the gate bar (gate space before the 0.32 group scale: bar centre y 4.92, radius
 * 0.52, inner post faces at x +/-2.2). Each drip is a tapered run plus a bead at its tip; it starts inside the bar and
 * stays inside the bar's x/z footprint. `uv` carries (phase, weight): weight 0 on the bar, 1 at the bead, read by the
 * CR-AN1 wobble vertex shader. The posts and bar have uv.y 0 (capsuleMesh), so they never move.
 */
export const GATE_DRIPS: readonly { readonly x: number; readonly length: number; readonly radius: number }[] = [
  { x: -1.7, length: 0.95, radius: 0.2 },
  { x: -0.55, length: 0.6, radius: 0.16 },
  { x: 0.5, length: 1.1, radius: 0.22 },
  { x: 1.55, length: 0.7, radius: 0.17 }
];
const DRIP_TOP = 4.62;

export function gateDripMesh(): MeshData {
  const parts = GATE_DRIPS.map((d, i): MeshData => {
    const run = transformMesh(cylinderMesh(d.radius, d.radius * 0.6, d.length, 10), { tx: d.x, ty: DRIP_TOP - d.length / 2 });
    const bead = sphereMesh(d.radius * 0.95, 10, 8, d.x, DRIP_TOP - d.length, 0);
    const m = mergeMeshes([run, bead]);
    const reach = d.length + d.radius * 0.95;
    const phase = (i * 0.37 + 0.11) % 1;
    for (let v = 0; v < m.positions.length / 3; v++) {
      const y = m.positions[v * 3 + 1] as number;
      m.uvs[v * 2] = phase;
      m.uvs[v * 2 + 1] = Math.min(1, Math.max(0, (DRIP_TOP - y) / reach));
    }
    return m;
  });
  return mergeMeshes(parts);
}
