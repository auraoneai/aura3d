/**
 * Procedural mesh builders for Shape Shift Sprint (plain arrays; `world.ts` turns them into
 * `geometry.dynamic` specs). Dimensions are pinned by tests/unit/shape-shift-sprint/meshes.test.ts.
 *
 * Upgraded geometry (WP-15):
 * - `wallCellMesh(shapeIndex)` builds a true molded 3D shape-sorter block with a smooth circle,
 *   filleted-square, or filleted-triangle cutout tunnel (zero square corner gaps, identical vertex/index
 *   topology across all 3 shapes so one `Batch` swaps holes).
 * - `rimMesh(shapeIndex)` builds a 3D bevelled collar around the cutout opening (`z` depth bevel).
 * - `playerMesh(0..2)` builds a grooved marble sphere, rounded superellipsoid vinyl cube, and
 *   filleted glider-cone with smooth multi-lobe clearcoat highlights.
 * - `tokenMesh(0..3)` builds 4 sculpted 3D pickup medallions sharing one `Batch` topology.
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
  sphere: { radius: 0.55, width: 28, height: 20 },
  cube: { size: 0.96, faceSegments: 8, power: 6.5 },
  cone: { radius: 0.58, height: 1.1, radial: 32, rings: 14, dy: -0.55 }
} as const;

export const WALL_DIMS = {
  cellWidth: 2.3, cellHeight: 3, thickness: 0.48,
  openingWidth: 1.7, openingHeight: 1.7, openingCenterY: 1.15
} as const;

export const RIM_SEGMENTS = 48;
export const RIM_OUTER = 0.86;
export const RIM_INNER = 0.7;
export const RIM_DEPTH = 0.08;
export const WALL_HOLE_RADIUS = 0.74;

export const TOKEN_DIMS = { radius: 0.34, width: 24, height: 16 } as const;

/** Sculpted marble sphere with subtle equatorial band normal modulation so rolling spin reads cleanly. */
function sculptedSpherePlayer(): MeshData {
  const { radius, width, height } = PLAYER_DIMS.sphere;
  const m = sphereMesh(radius, width, height);
  for (let i = 0; i < m.normals.length; i += 3) {
    const nx = m.normals[i]!, ny = m.normals[i + 1]!, nz = m.normals[i + 2]!;
    const band = Math.sin(ny * Math.PI * 6) * 0.08;
    const my = ny + band * (1 - ny * ny);
    const len = Math.hypot(nx, my, nz) || 1;
    m.normals[i] = nx / len;
    m.normals[i + 1] = my / len;
    m.normals[i + 2] = nz / len;
  }
  return m;
}

/** Smoothly bevelled superellipsoid vinyl cube (`|x|^p + |y|^p + |z|^p = 1`) with exact half-extents `+-size/2`. */
function bevelledCubePlayer(): MeshData {
  const { size, faceSegments: S, power: p } = PLAYER_DIMS.cube;
  const half = size / 2;
  const m = empty();
  const faces: { uAxis: [number, number, number]; vAxis: [number, number, number]; nAxis: [number, number, number] }[] = [
    { uAxis: [1, 0, 0], vAxis: [0, 1, 0], nAxis: [0, 0, 1] },
    { uAxis: [-1, 0, 0], vAxis: [0, 1, 0], nAxis: [0, 0, -1] },
    { uAxis: [0, 0, -1], vAxis: [0, 1, 0], nAxis: [1, 0, 0] },
    { uAxis: [0, 0, 1], vAxis: [0, 1, 0], nAxis: [-1, 0, 0] },
    { uAxis: [1, 0, 0], vAxis: [0, 0, -1], nAxis: [0, 1, 0] },
    { uAxis: [1, 0, 0], vAxis: [0, 0, 1], nAxis: [0, -1, 0] }
  ];
  const row = S + 1;
  for (const f of faces) {
    const base = m.positions.length / 3;
    for (let iy = 0; iy <= S; iy++) {
      const v = -1 + (2 * iy) / S;
      for (let ix = 0; ix <= S; ix++) {
        const u = -1 + (2 * ix) / S;
        const cx = f.nAxis[0] + u * f.uAxis[0] + v * f.vAxis[0];
        const cy = f.nAxis[1] + u * f.uAxis[1] + v * f.vAxis[1];
        const cz = f.nAxis[2] + u * f.uAxis[2] + v * f.vAxis[2];
        const cl = Math.hypot(cx, cy, cz) || 1;
        const sx = cx / cl, sy = cy / cl, sz = cz / cl;
        const denom = Math.pow(
          Math.pow(Math.abs(sx), p) + Math.pow(Math.abs(sy), p) + Math.pow(Math.abs(sz), p),
          1 / p
        ) || 1;
        const qx = sx / denom, qy = sy / denom, qz = sz / denom;
        m.positions.push(qx * half, qy * half, qz * half);
        const gx = Math.sign(qx) * Math.pow(Math.abs(qx), p - 1);
        const gy = Math.sign(qy) * Math.pow(Math.abs(qy), p - 1);
        const gz = Math.sign(qz) * Math.pow(Math.abs(qz), p - 1);
        const gl = Math.hypot(gx, gy, gz) || 1;
        m.normals.push(gx / gl, gy / gl, gz / gl);
        m.uvs.push(ix / S, iy / S);
      }
    }
    for (let iy = 0; iy < S; iy++) {
      for (let ix = 0; ix < S; ix++) {
        const a = base + iy * row + ix;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        m.indices.push(a, b, d, a, d, c);
      }
    }
  }
  return m;
}

/** Filleted glider-cone revolved around Y with rounded base lip and nose cap; exact extents `[-h/2, +h/2]` and `+-radius`. */
function filletedConePlayer(): MeshData {
  const { radius, height, radial } = PLAYER_DIMS.cone;
  const halfH = height / 2;
  const rb = 0.075;
  const rt = 0.045;
  // Profile points [r, y] from bottom centre (0, -halfH) around the base fillet, up the flank, and over the nose cap to (0, +halfH).
  const profile: [number, number][] = [
    [0, -halfH],
    [radius - rb, -halfH]
  ];
  for (let k = 1; k <= 3; k++) {
    const a = -Math.PI / 2 + (k / 3) * (Math.PI / 2);
    profile.push([radius - rb + Math.cos(a) * rb, -halfH + rb + Math.sin(a) * rb]);
  }
  profile.push([radius - rb + Math.cos(0.38) * rb, -halfH + rb + Math.sin(0.38) * rb]);
  const flankStart = profile[profile.length - 1]!;
  const noseBaseY = halfH - rt;
  const noseBaseR = rt * 0.72;
  for (let k = 1; k <= 5; k++) {
    const f = k / 6;
    profile.push([
      flankStart[0] + (noseBaseR - flankStart[0]) * f,
      flankStart[1] + (noseBaseY - flankStart[1]) * f
    ]);
  }
  for (let k = 0; k <= 3; k++) {
    const a = 0.22 + (k / 3) * (Math.PI / 2 - 0.22);
    profile.push([Math.cos(a) * noseBaseR, halfH - rt + Math.sin(a) * rt]);
  }
  profile[profile.length - 1] = [0, halfH];

  // Radial tangent normals along the 2D profile.
  const pNormals: [number, number][] = profile.map((_, j) => {
    if (j === 0) return [0, -1];
    if (j === profile.length - 1) return [0, 1];
    const prev = profile[j - 1]!;
    const next = profile[j + 1]!;
    const dr = next[0] - prev[0];
    const dy = next[1] - prev[1];
    // Outward normal for bottom-to-top profile (r >= 0): (+dy, -dr)
    const nl = Math.hypot(dy, -dr) || 1;
    return [dy / nl, -dr / nl];
  });

  const m = empty();
  const rings = profile.length - 1;
  const cols = radial + 1;
  for (let j = 0; j <= rings; j++) {
    const [pr, py] = profile[j]!;
    const [nr, ny] = pNormals[j]!;
    const v = j / rings;
    for (let k = 0; k <= radial; k++) {
      const u = k / radial;
      const a = u * Math.PI * 2;
      const s = Math.sin(a), c = Math.cos(a);
      // Subtle 3-fin anodized flute highlight along the cone flank while keeping bounding box exact.
      const fin = j >= 5 && j <= rings - 3 ? 0.04 * Math.sin(a * 3) : 0;
      const nx = nr * s + fin * c;
      const nz = nr * c - fin * s;
      const nl = Math.hypot(nx, ny, nz) || 1;
      m.positions.push(pr * s, py, pr * c);
      m.normals.push(nx / nl, ny / nl, nz / nl);
      m.uvs.push(u, v);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let k = 0; k < radial; k++) {
      const a = j * cols + k;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (j !== 0) m.indices.push(a, b, d);
      if (j !== rings - 1) m.indices.push(a, d, c);
    }
  }
  return m;
}

/** The player's three sculpted forms, centred on the origin (sphere red / cube yellow / cone blue). */
export function playerMesh(shapeIndex: number): MeshData {
  if (shapeIndex === 0) return sculptedSpherePlayer();
  if (shapeIndex === 1) return bevelledCubePlayer();
  return filletedConePlayer();
}

/**
 * Clockwise perimeter point at fraction `t` (`0..1`) of a circle (`0`), filleted upright square (`1`),
 * or filleted equilateral triangle (`2`) outline of radius `r`, starting at top-centre `(0, +y)`.
 * Smooth corner fillets eliminate razor-sharp crease aliasing while keeping silhouettes unmistakable.
 */
export function outlinePoint(shapeIndex: number, t: number, r: number): [number, number] {
  const u = ((t % 1) + 1) % 1;
  if (shapeIndex === 0) {
    const a = Math.PI / 2 - u * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }
  if (shapeIndex === 1) {
    // Upright rounded square with half-extent h = r / sqrt(2) and corner fillet c.
    const h = r * Math.SQRT1_2;
    const c = h * 0.16;
    const sHalf = h - c;
    const sFull = 2 * sHalf;
    const arc = (Math.PI / 2) * c;
    const total = 4 * sFull + 4 * arc;
    let d = u * total;
    if (d < sHalf) return [d, h];
    d -= sHalf;
    if (d < arc) { const a = Math.PI / 2 - (d / arc) * (Math.PI / 2); return [sHalf + Math.cos(a) * c, sHalf + Math.sin(a) * c]; }
    d -= arc;
    if (d < sFull) return [h, sHalf - d];
    d -= sFull;
    if (d < arc) { const a = -(d / arc) * (Math.PI / 2); return [sHalf + Math.cos(a) * c, -sHalf + Math.sin(a) * c]; }
    d -= arc;
    if (d < sFull) return [sHalf - d, -h];
    d -= sFull;
    if (d < arc) { const a = -Math.PI / 2 - (d / arc) * (Math.PI / 2); return [-sHalf + Math.cos(a) * c, -sHalf + Math.sin(a) * c]; }
    d -= arc;
    if (d < sFull) return [-h, -sHalf + d];
    d -= sFull;
    if (d < arc) { const a = Math.PI - (d / arc) * (Math.PI / 2); return [-sHalf + Math.cos(a) * c, sHalf + Math.sin(a) * c]; }
    d -= arc;
    return [-sHalf + d, h];
  }
  // Equilateral triangle (apex up) with rounded corners (120 deg exterior arcs).
  const R = r * 1.06;
  const c = R * 0.11;
  const side = Math.sqrt(3) * R - 2 * Math.sqrt(3) * c;
  const arcFull = ((2 * Math.PI) / 3) * c;
  const arcHalf = arcFull * 0.5;
  const total = 3 * side + 3 * arcFull;
  const centers: [number, number][] = [
    [0, R - 2 * c],
    [(R - 2 * c) * Math.cos(-Math.PI / 6), (R - 2 * c) * Math.sin(-Math.PI / 6)],
    [(R - 2 * c) * Math.cos((-5 * Math.PI) / 6), (R - 2 * c) * Math.sin((-5 * Math.PI) / 6)]
  ];
  const tangents = (ci: number, a0: number, a1: number, f: number): [number, number] => {
    const a = a0 + (a1 - a0) * f;
    const ctr = centers[ci]!;
    return [ctr[0] + Math.cos(a) * c, ctr[1] + Math.sin(a) * c];
  };
  let d = u * total;
  if (d < arcHalf) return tangents(0, Math.PI / 2, Math.PI / 6, d / arcHalf);
  d -= arcHalf;
  const p01a = tangents(0, Math.PI / 6, Math.PI / 6, 0);
  const p01b = tangents(1, Math.PI / 6, Math.PI / 6, 0);
  if (d < side) { const f = d / side; return [p01a[0] + (p01b[0] - p01a[0]) * f, p01a[1] + (p01b[1] - p01a[1]) * f]; }
  d -= side;
  if (d < arcFull) return tangents(1, Math.PI / 6, -Math.PI / 2, d / arcFull);
  d -= arcFull;
  const p12a = tangents(1, -Math.PI / 2, -Math.PI / 2, 0);
  const p12b = tangents(2, -Math.PI / 2, -Math.PI / 2, 0);
  if (d < side) { const f = d / side; return [p12a[0] + (p12b[0] - p12a[0]) * f, p12a[1] + (p12b[1] - p12a[1]) * f]; }
  d -= side;
  if (d < arcFull) return tangents(2, -Math.PI / 2, (-7 * Math.PI) / 6, d / arcFull);
  d -= arcFull;
  const p20a = tangents(2, (5 * Math.PI) / 6, (5 * Math.PI) / 6, 0);
  const p20b = tangents(0, (5 * Math.PI) / 6, (5 * Math.PI) / 6, 0);
  if (d < side) { const f = d / side; return [p20a[0] + (p20b[0] - p20a[0]) * f, p20a[1] + (p20b[1] - p20a[1]) * f]; }
  d -= side;
  return tangents(0, (5 * Math.PI) / 6, Math.PI / 2, Math.min(1, d / arcHalf));
}

/** Clockwise outer cell-border point for `i in 0..RIM_SEGMENTS-1` hitting all 4 rectangle corners exactly. */
function outerRectPoint(i: number, w: number, h: number): [number, number] {
  const hw = w / 2;
  // 48 steps = 6 (top-right) + 12 (right) + 12 (bottom) + 12 (left) + 6 (top-left).
  if (i <= 6) return [(i / 6) * hw, h];
  if (i <= 18) return [hw, h * (1 - (i - 6) / 12)];
  if (i <= 30) return [hw - ((i - 18) / 12) * w, 0];
  if (i <= 42) return [-hw, ((i - 30) / 12) * h];
  return [-hw + ((i - 42) / 6) * hw, h];
}

/**
 * Molded 3D shape-sorter wall cell with a true curved/filleted cutout tunnel (circle / square / triangle).
 * All three `wallCellMesh(0..2)` variants share the exact same vertex count (306) and index array (888)
 * so one `Batch` places per-lane 3D cutouts with zero square corner gaps behind circular or triangular rims.
 */
export function wallCellMesh(shapeIndex = 0): MeshData {
  const { cellWidth, cellHeight, thickness, openingCenterY } = WALL_DIMS;
  const halfZ = thickness / 2;
  const hw = cellWidth / 2;
  const n = RIM_SEGMENTS;
  const m = empty();

  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    outer.push(outerRectPoint(i, cellWidth, cellHeight));
    const [ix, iy] = outlinePoint(shapeIndex, i / n, WALL_HOLE_RADIUS);
    inner.push([ix, openingCenterY + iy]);
  }

  // 1. Front annulus (+halfZ, normal +Z): 96 verts, 288 indices
  const frontBase = m.positions.length / 3;
  for (let i = 0; i < n; i++) {
    const [ox, oy] = outer[i]!;
    const [ix, iy] = inner[i]!;
    m.positions.push(ox, oy, halfZ, ix, iy, halfZ);
    m.normals.push(0, 0, 1, 0, 0, 1);
    m.uvs.push((ox + hw) / cellWidth, oy / cellHeight, (ix + hw) / cellWidth, iy / cellHeight);
  }
  for (let i = 0; i < n; i++) {
    const a = frontBase + i * 2;
    const b = a + 1;
    const c = frontBase + ((i + 1) % n) * 2;
    const d = c + 1;
    m.indices.push(a, b, c, b, d, c);
  }

  // 2. Back annulus (-halfZ, normal -Z): 96 verts, 288 indices
  const backBase = m.positions.length / 3;
  for (let i = 0; i < n; i++) {
    const [ox, oy] = outer[i]!;
    const [ix, iy] = inner[i]!;
    m.positions.push(ox, oy, -halfZ, ix, iy, -halfZ);
    m.normals.push(0, 0, -1, 0, 0, -1);
    m.uvs.push((ox + hw) / cellWidth, oy / cellHeight, (ix + hw) / cellWidth, iy / cellHeight);
  }
  for (let i = 0; i < n; i++) {
    const a = backBase + i * 2;
    const b = a + 1;
    const c = backBase + ((i + 1) % n) * 2;
    const d = c + 1;
    m.indices.push(a, c, b, b, c, d);
  }

  // 3. Smooth inward cutout tunnel (+halfZ -> -halfZ): (n + 1) * 2 = 98 verts, 288 indices
  const tunnelBase = m.positions.length / 3;
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const prev = inner[(k - 1 + n) % n]!;
    const next = inner[(k + 1) % n]!;
    // Clockwise tangent (tx, ty); inward normal toward hole centre is (ty, -tx)? Check at top (k=0):
    // prev=(-dx, top), next=(+dx, top) -> tx > 0, ty = 0 -> inward normal is (0, -1) = (ty, -tx)!
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1;
    const nx = ty / tl;
    const ny = -tx / tl;
    const [ix, iy] = inner[k]!;
    m.positions.push(ix, iy, halfZ, ix, iy, -halfZ);
    m.normals.push(nx, ny, 0, nx, ny, 0);
    m.uvs.push(i / n, 1, i / n, 0);
  }
  for (let i = 0; i < n; i++) {
    const f0 = tunnelBase + i * 2;
    const b0 = f0 + 1;
    const f1 = f0 + 2;
    const b1 = f0 + 3;
    m.indices.push(f0, b0, f1, b0, b1, f1);
  }

  // 4. Outer 4 cell box sides (+X, -X, +Y, -Y): 16 verts, 24 indices
  const sides: { n: [number, number, number]; p: [number, number, number][] }[] = [
    { n: [1, 0, 0], p: [[hw, 0, halfZ], [hw, 0, -halfZ], [hw, cellHeight, -halfZ], [hw, cellHeight, halfZ]] },
    { n: [-1, 0, 0], p: [[-hw, 0, -halfZ], [-hw, 0, halfZ], [-hw, cellHeight, halfZ], [-hw, cellHeight, -halfZ]] },
    { n: [0, 1, 0], p: [[-hw, cellHeight, halfZ], [hw, cellHeight, halfZ], [hw, cellHeight, -halfZ], [-hw, cellHeight, -halfZ]] },
    { n: [0, -1, 0], p: [[-hw, 0, -halfZ], [hw, 0, -halfZ], [hw, 0, halfZ], [-hw, 0, halfZ]] }
  ];
  for (const s of sides) {
    const base = m.positions.length / 3;
    for (const [px, py, pz] of s.p) {
      m.positions.push(px, py, pz);
      m.normals.push(...s.n);
    }
    m.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return m;
}

/**
 * 3D bevelled shape collar (circle / square / triangle) around the cutout opening, centred on the origin.
 * Four concentric profile rings (`z in [-0.04, RIM_DEPTH]`) give specular bevel highlights on outer slope,
 * crown ridge, and inner tunnel lip; all 3 shapes share exact vertex count (192) and index array (864).
 */
export function rimMesh(shapeIndex: number): MeshData {
  const m = empty();
  const n = RIM_SEGMENTS;
  const rMidOuter = RIM_OUTER - 0.04;
  const rMidInner = RIM_INNER + 0.03;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const prev = outlinePoint(shapeIndex, (i - 1 + n) / n, 1);
    const next = outlinePoint(shapeIndex, (i + 1) / n, 1);
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1;
    // Clockwise tangent (tx, ty): outward radial normal is (-ty, tx), inward radial normal is (ty, -tx).
    const outX = -ty / tl;
    const outY = tx / tl;

    const [p0x, p0y] = outlinePoint(shapeIndex, t, RIM_OUTER);
    const [p1x, p1y] = outlinePoint(shapeIndex, t, rMidOuter);
    const [p2x, p2y] = outlinePoint(shapeIndex, t, rMidInner);
    const [p3x, p3y] = outlinePoint(shapeIndex, t, RIM_INNER);

    const nOutL = Math.hypot(outX * 0.72, outY * 0.72, 0.7) || 1;
    const nCrnL = Math.hypot(outX * 0.12, outY * 0.12, 1) || 1;
    const nInL = Math.hypot(-outX * 0.75, -outY * 0.75, 0.66) || 1;

    m.positions.push(
      p0x, p0y, 0,
      p1x, p1y, RIM_DEPTH,
      p2x, p2y, RIM_DEPTH,
      p3x, p3y, -0.04
    );
    m.normals.push(
      (outX * 0.72) / nOutL, (outY * 0.72) / nOutL, 0.7 / nOutL,
      (outX * 0.12) / nCrnL, (outY * 0.12) / nCrnL, 1 / nCrnL,
      (-outX * 0.12) / nCrnL, (-outY * 0.12) / nCrnL, 1 / nCrnL,
      (-outX * 0.75) / nInL, (-outY * 0.75) / nInL, 0.66 / nInL
    );
    m.uvs.push(t, 1, t, 0.68, t, 0.32, t, 0);
  }
  for (let i = 0; i < n; i++) {
    const cur = i * 4;
    const nxt = ((i + 1) % n) * 4;
    for (let ring = 0; ring < 3; ring++) {
      const a = cur + ring;
      const b = cur + ring + 1;
      const c = nxt + ring;
      const d = nxt + ring + 1;
      m.indices.push(a, b, c, b, d, c);
    }
  }
  return m;
}

function tokenSurfacePoint(u: number, v: number, variant: number): [number, number, number] {
  const r = TOKEN_DIMS.radius;
  const sinV = Math.sin(v * Math.PI);
  const cosV = Math.cos(v * Math.PI);
  const az = u * Math.PI * 2;
  const ux = -Math.cos(az) * sinV;
  const uy = cosV;
  const uz = Math.sin(az) * sinV;

  if (variant === 1) {
    // Wildcard: 5-point star medallion in XY, coin-slimmed in Z.
    const polar = Math.atan2(ux, uy);
    const xyR = Math.hypot(ux, uy);
    const star = 1 + 0.22 * Math.pow(xyR, 1.5) * Math.cos(5 * polar);
    return [r * ux * star, r * uy * star, r * uz * 0.56];
  }
  if (variant === 2) {
    // Shield: hexagonal domed buckler crest with raised front/back boss.
    const polar = Math.atan2(ux, uy);
    const xyR = Math.hypot(ux, uy);
    const hex = 1 + 0.08 * Math.pow(xyR, 2) * Math.cos(6 * polar);
    const boss = 1 + 0.24 * Math.pow(Math.abs(uz), 2);
    return [r * ux * hex, r * uy * hex, r * uz * 0.48 * boss];
  }
  if (variant === 3) {
    // x2: faceted 4-point diamond twin-crystal.
    const p = 1.42;
    const norm = Math.pow(Math.pow(Math.abs(ux), p) + Math.pow(Math.abs(uy), p) + Math.pow(Math.abs(uz), p), 1 / p) || 1;
    return [(r * ux * 0.94) / norm, (r * uy) / norm, (r * uz * 0.72) / norm];
  }
  // Morph (0): tri-lobed octahedral crystal with gyroscopic equatorial ridge.
  const p = 1.55;
  const norm = Math.pow(Math.pow(Math.abs(ux), p) + Math.pow(Math.abs(uy), p) + Math.pow(Math.abs(uz), p), 1 / p) || 1;
  const gyro = 1 + 0.07 * Math.pow(sinV, 3) * Math.cos(3 * az);
  return [(r * ux * gyro) / norm, (r * uy) / norm, (r * uz * gyro) / norm];
}

/**
 * Sculpted 3D pickup medallion (`0` morph crystal, `1` wildcard star, `2` shield crest, `3` x2 diamond).
 * All four share exact `(width + 1) * (height + 1)` vertices and index topology for 1-draw-call `Batch` swaps.
 */
export function tokenMesh(variant = 0): MeshData {
  const { width, height } = TOKEN_DIMS;
  const m = sphereMesh(TOKEN_DIMS.radius, width, height);
  const du = 1e-3;
  const dv = 1e-3;
  let k = 0;
  for (let iy = 0; iy <= height; iy++) {
    const v = iy / height;
    for (let ix = 0; ix <= width; ix++) {
      const u = ix / width;
      const [px, py, pz] = tokenSurfacePoint(u, v, variant);
      m.positions[k] = px;
      m.positions[k + 1] = py;
      m.positions[k + 2] = pz;
      if (iy === 0) {
        m.normals[k] = 0; m.normals[k + 1] = 1; m.normals[k + 2] = 0;
      } else if (iy === height) {
        m.normals[k] = 0; m.normals[k + 1] = -1; m.normals[k + 2] = 0;
      } else {
        const pu = tokenSurfacePoint(u + du, v, variant);
        const mu = tokenSurfacePoint(u - du, v, variant);
        const pv = tokenSurfacePoint(u, Math.min(1 - 1e-4, v + dv), variant);
        const mv = tokenSurfacePoint(u, Math.max(1e-4, v - dv), variant);
        const tux = pu[0] - mu[0], tuy = pu[1] - mu[1], tuz = pu[2] - mu[2];
        const tvx = pv[0] - mv[0], tvy = pv[1] - mv[1], tvz = pv[2] - mv[2];
        // On sphereMesh: u goes +Z then +X (azimuth), v goes +Y to -Y; outward normal is tv x tu.
        const nx = tvy * tuz - tvz * tuy;
        const ny = tvz * tux - tvx * tuz;
        const nz = tvx * tuy - tvy * tux;
        const nl = Math.hypot(nx, ny, nz) || 1;
        m.normals[k] = nx / nl;
        m.normals[k + 1] = ny / nl;
        m.normals[k + 2] = nz / nl;
      }
      k += 3;
    }
  }
  return m;
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
