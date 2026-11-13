/**
 * Exact-dimension mesh generators for Splat (the engine's unit primitives are sized by `size`, which
 * makes a capsule of radius 0.46 and a 6.24 m bar ambiguous). Each returns plain arrays; `world.ts` turns
 * them into `geometry.dynamic` specs.
 */

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

const empty = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

/** UV-sphere of `radius` with `widthSegments` x `heightSegments`, unrotated (poles on +/-Y). */
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

/** Closed cylinder (`radiusTop`, `radiusBottom`, `height`, `radial` segments). */
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

/** Closed cone (`radius`, `height`, `radial` segments) translated by `dy`. */
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
 * Smooth surface of revolution around +Y from `[r, y]` profile samples (`radial` segments, optional Z ellipse scale).
 * Computes analytical profile-tangent normals so lathed bulbous drips and collars shade without facet creases.
 */
function revolveProfileMesh(profile: readonly (readonly [number, number])[], radial: number, scaleZ = 1): MeshData {
  const m = empty();
  const n = profile.length;
  const row = radial + 1;
  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i]!;
    const [rPrev, yPrev] = profile[Math.max(0, i - 1)]!;
    const [rNext, yNext] = profile[Math.min(n - 1, i + 1)]!;
    const dr = rNext - rPrev;
    const dy = yNext - yPrev;
    // Outward normal for a top-to-bottom or bottom-to-top profile: radial component opposes |dy|, vertical follows dr sign
    const signDir = yNext <= yPrev ? -1 : 1;
    const nrRaw = Math.abs(dy) || (r === 0 ? 0 : 1);
    const nyRaw = r === 0 ? (i === 0 ? (yPrev >= yNext ? 1 : -1) : y >= yPrev ? 1 : -1) : -signDir * dr;
    for (let k = 0; k <= radial; k++) {
      const u = k / radial;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      m.positions.push(ca * r, y, sa * r * scaleZ);
      if (r <= 1e-6) {
        m.normals.push(0, nyRaw >= 0 ? 1 : -1, 0);
      } else {
        const nx = ca * nrRaw;
        const ny = nyRaw;
        const nz = (sa * nrRaw) / Math.max(0.25, scaleZ);
        const inv = 1 / Math.hypot(nx, ny, nz);
        m.normals.push(nx * inv, ny * inv, nz * inv);
      }
      m.uvs.push(u, i / Math.max(1, n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * row + k, b = a + 1, c = (i + 1) * row + k, d = c + 1;
      m.indices.push(a, c, b, b, c, d);
    }
  }
  return m;
}

/**
 * High-segment carnival gate arch frame (32-radial posts & crossbar + turned post base plinths & shoulder collars),
 * matching the exact x/y/z bounding envelope of the classic gate while eliminating low-poly silhouette facets.
 */
export function carnivalGateFrameParts(): MeshData[] {
  const post = capsuleMesh(0.46, 4, 32, 14);
  const bar = capsuleMesh(0.52, 6.24, 32, 14);
  const collarRing = revolveProfileMesh(
    [
      [0.44, 0],
      [0.5, 0.07],
      [0.5, 0.21],
      [0.44, 0.28]
    ],
    32
  );
  // Posts and collars keep wobble weight uv.y = 0 so only the liquid drips sway under the bar
  for (let v = 1; v < collarRing.uvs.length; v += 2) collarRing.uvs[v] = 0;
  return [
    transformMesh(post, { tx: -2.66, ty: 2.46 }),
    transformMesh(post, { tx: 2.66, ty: 2.46 }),
    transformMesh(collarRing, { tx: -2.66, ty: 0.34 }),
    transformMesh(collarRing, { tx: 2.66, ty: 0.34 }),
    transformMesh(collarRing, { tx: -2.66, ty: 4.08 }),
    transformMesh(collarRing, { tx: 2.66, ty: 4.08 }),
    transformMesh(bar, { rz: Math.PI / 2, ty: 4.92 })
  ];
}

/**
 * GU47 CR-M3 plump bulbous liquid-paint drips & scalloped meniscus bridge hanging from the gate bar
 * (gate space before the 0.32 group scale: bar centre y 4.92, radius 0.52, inner post faces at x +/-2.2).
 * Each drip flares into the bar with a curved liquid meniscus fillet, narrows through a glossy waist, and swells
 * into a smooth 24-segment rounded teardrop droplet tip. `uv` carries (phase, weight): weight 0 on the bar, 1 at the
 * droplet tip, read by the CR-AN1 wobble vertex shader.
 */
export const GATE_DRIPS: readonly { readonly x: number; readonly length: number; readonly radius: number }[] = [
  { x: -1.68, length: 0.98, radius: 0.21 },
  { x: -0.84, length: 0.62, radius: 0.17 },
  { x: 0.02, length: 1.16, radius: 0.23 },
  { x: 0.88, length: 0.72, radius: 0.18 },
  { x: 1.64, length: 0.9, radius: 0.2 }
];
const DRIP_TOP = 4.68;

export function gateDripMesh(): MeshData {
  const parts: MeshData[] = [];

  // Continuous scalloped liquid-enamel meniscus coating the underside of the crossbar between the posts
  const spanSteps = 32;
  const arcSteps = 12;
  const valence = empty();
  const vStride = arcSteps + 1;
  for (let ix = 0; ix <= spanSteps; ix++) {
    const u = ix / spanSteps;
    const x = -2.08 + u * 4.16;
    let pool = 0.12;
    for (const d of GATE_DRIPS) {
      const dist = (x - d.x) / (d.radius * 2.4);
      pool += 0.11 * Math.exp(-dist * dist);
    }
    const endTaper = Math.sin(u * Math.PI);
    const depthY = pool * (0.45 + 0.55 * endTaper);
    const halfZ = 0.28 * (0.55 + 0.45 * endTaper);
    for (let ia = 0; ia <= arcSteps; ia++) {
      const v = ia / arcSteps;
      const ang = v * Math.PI;
      const cz = Math.cos(ang);
      const sy = Math.sin(ang);
      const py = 4.54 - sy * depthY;
      const pz = cz * halfZ;
      const ny = -sy;
      const nz = cz;
      const inv = 1 / Math.hypot(ny, nz);
      valence.positions.push(x, py, pz);
      valence.normals.push(0, ny * inv, nz * inv);
      valence.uvs.push((u * 0.73 + 0.07) % 1, Math.min(0.28, Math.max(0, (DRIP_TOP - py) / 1.4)));
    }
  }
  for (let ix = 0; ix < spanSteps; ix++) {
    for (let ia = 0; ia < arcSteps; ia++) {
      const a = ix * vStride + ia, b = a + 1, c = (ix + 1) * vStride + ia, d = c + 1;
      valence.indices.push(a, b, c, b, d, c);
    }
  }
  parts.push(valence);

  // Plump 24-segment lathed teardrop droplets with flared top meniscus fillets & spherical bottom tips
  const profileSamples = 22;
  for (let i = 0; i < GATE_DRIPS.length; i++) {
    const d = GATE_DRIPS[i]!;
    const reach = d.length + d.radius * 0.95;
    const profile: [number, number][] = [];
    for (let s = 0; s <= profileSamples; s++) {
      const t = s / profileSamples;
      const y = DRIP_TOP - t * reach;
      let r: number;
      if (t === 0) {
        r = 0;
      } else if (t < 0.2) {
        // Flared meniscus bridge curving seamlessly out of the crossbar underside
        const k = 1 - t / 0.2;
        r = d.radius * (0.58 + 1.05 * k * k);
      } else if (t < 0.58) {
        // Stretched glossy liquid neck into swelling droplet belly
        const u = (t - 0.2) / 0.38;
        r = d.radius * (0.58 - 0.1 * Math.sin(u * Math.PI) + 0.5 * u * u);
      } else if (t < 1) {
        // Plump rounded teardrop bulb closing smoothly to a spherical tip at t = 1
        const u = (t - 0.58) / 0.42;
        const bulb = Math.sqrt(Math.max(0, 1 - u * u));
        r = d.radius * 1.08 * bulb;
      } else {
        r = 0;
      }
      profile.push([r, y]);
    }
    const drop = transformMesh(revolveProfileMesh(profile, 24, 0.82), { tx: d.x });
    const phase = (i * 0.31 + 0.11) % 1;
    for (let v = 0; v < drop.positions.length / 3; v++) {
      const y = drop.positions[v * 3 + 1] as number;
      drop.uvs[v * 2] = phase;
      drop.uvs[v * 2 + 1] = Math.min(1, Math.max(0, (DRIP_TOP - y) / reach));
    }
    parts.push(drop);
  }
  return mergeMeshes(parts);
}

/**
 * Smooth bevelled continuous extruded curb rail along local Z (`[-1, 1]`), unit-normalised so adjacent
 * 1 m road segments lock into a continuous wet-lacquer studio bumper rather than discrete beads.
 */
export function curbRailMesh(archSteps = 20): MeshData {
  const m = empty();
  const profile: { x: number; y: number; nx: number; ny: number; u: number }[] = [];
  for (let i = 0; i <= archSteps; i++) {
    const u = i / archSteps;
    const a = Math.PI * (1 - u);
    const x = Math.cos(a);
    const y = -0.35 + 1.15 * Math.sin(a);
    const nx = Math.cos(a);
    const ny = Math.max(0.15, Math.sin(a));
    const inv = 1 / Math.hypot(nx, ny);
    profile.push({ x, y, nx: nx * inv, ny: ny * inv, u });
  }
  for (const [z, v] of [[1, 1], [-1, 0]] as const) {
    for (const p of profile) {
      m.positions.push(p.x, p.y, z);
      m.normals.push(p.nx, p.ny, 0);
      m.uvs.push(p.u, v);
    }
  }
  const stride = profile.length;
  for (let i = 0; i < archSteps; i++) {
    const a = i, b = i + 1, c = stride + i, d = stride + i + 1;
    m.indices.push(a, c, b, b, c, d);
  }
  return m;
}

/**
 * Sculpted bevelled forward-pointing (`-Z`) lacquer speed chevron / centre-lane guide marker for carnival road segments.
 */
export function trackChevronMesh(): MeshData {
  const m = empty();
  // 6-vertex chevron footprint in XZ (`-Z` nose at z = -0.68, swept wings at x = ±0.26, notched tail)
  const outer: readonly [number, number][] = [
    [0, -0.68],
    [0.26, -0.14],
    [0.18, 0.56],
    [0, 0.24],
    [-0.18, 0.56],
    [-0.26, -0.14]
  ];
  const inner: readonly [number, number][] = outer.map(([x, z]) => [x * 0.68, z * 0.84]);
  const n = outer.length;
  const hTop = 0.036;
  // Crowned centre vertex
  m.positions.push(0, hTop + 0.008, -0.12);
  m.normals.push(0, 1, 0);
  m.uvs.push(0.5, 0.5);
  for (let i = 0; i < n; i++) {
    const [ix, iz] = inner[i]!;
    m.positions.push(ix, hTop, iz);
    m.normals.push(0, 1, 0);
    m.uvs.push(0.5 + ix, 0.5 + iz * 0.5);
  }
  for (let i = 0; i < n; i++) {
    const [ox, oz] = outer[i]!;
    const [nx0, nz0] = outer[(i + 1) % n]!;
    const dx = nx0 - ox, dz = nz0 - oz;
    const sx = dz, sz = -dx;
    const inv = 1 / Math.hypot(sx, 0.9, sz);
    m.positions.push(ox, 0.002, oz);
    m.normals.push(sx * inv, 0.9 * inv, sz * inv);
    m.uvs.push(0.5 + ox, 0.5 + oz * 0.5);
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    // Top cap fan
    m.indices.push(0, 1 + i, 1 + next);
    // Bevelled skirt quad
    const a = 1 + i, b = 1 + next, c = 1 + n + i, d = 1 + n + next;
    m.indices.push(a, c, b, b, c, d);
  }
  return m;
}

/**
 * Translucent pigment gate curtain spanning the interior opening of a 0.32-scaled gate arch
 * (`x` in `[-0.70, 0.70]`, `y` in `[0.02, 1.44]`). Subdivided smooth sheet (`16 x 8` quads) with a gentle
 * meniscus bow so all live gates still batch into one draw call with silky highlights.
 */
export function gateCurtainMesh(): MeshData {
  const m = empty();
  const cols = 16, rows = 8;
  const x0 = -0.7, x1 = 0.7, y0 = 0.02, y1 = 1.44;
  for (let iy = 0; iy <= rows; iy++) {
    const v = iy / rows;
    const y = y0 + (y1 - y0) * v;
    for (let ix = 0; ix <= cols; ix++) {
      const u = ix / cols;
      const x = x0 + (x1 - x0) * u;
      const bow = 0.024 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      const nx = -0.05 * Math.cos(u * Math.PI) * Math.sin(v * Math.PI);
      const inv = 1 / Math.hypot(nx, 1);
      m.positions.push(x, y, bow);
      m.normals.push(nx * inv, 0, inv);
      m.uvs.push(u, v);
    }
  }
  const stride = cols + 1;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const a = iy * stride + ix, b = a + 1, c = (iy + 1) * stride + ix, d = c + 1;
      m.indices.push(a, b, c, b, d, c);
    }
  }
  return m;
}
