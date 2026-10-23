/**
 * Tiny mesh builder for the port's merged scenery: every vertex carries a tint, a wind sway
 * amount, a phase, a surface-kind id (picks the procedural material in `PROP_FRAGMENT`) and
 * a metre-scaled `uv` so the procedural patterns keep a constant texel size on every surface.
 */
export type Rgb = readonly [number, number, number];

export interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  tint: number[];
  sway: number[];
  phase: number[];
  kind: number[];
  limb: number[];
}

export const newMesh = (): Mesh => ({ positions: [], normals: [], uvs: [], indices: [], tint: [], sway: [], phase: [], kind: [], limb: [] });

export const KIND = { leaf: 0, bark: 1, wood: 2, plaster: 3, roof: 4, stone: 5, deck: 6, glass: 7, gold: 8, cloth: 9, skin: 10, paint: 11 } as const;

export interface Vertex {
  p: readonly [number, number, number];
  n: readonly [number, number, number];
  uv: readonly [number, number];
  color: Rgb;
  sway?: number;
  phase?: number;
  kind: number;
  limb?: number;
}

export function pushVertex(m: Mesh, v: Vertex): number {
  const i = m.positions.length / 3;
  const len = Math.hypot(v.n[0], v.n[1], v.n[2]) || 1;
  m.positions.push(v.p[0], v.p[1], v.p[2]);
  m.normals.push(v.n[0] / len, v.n[1] / len, v.n[2] / len);
  m.uvs.push(v.uv[0], v.uv[1]);
  m.tint.push(v.color[0], v.color[1], v.color[2]);
  m.sway.push(v.sway ?? 0);
  m.phase.push(v.phase ?? 0);
  m.kind.push(v.kind);
  m.limb.push(v.limb ?? 0);
  return i;
}

export const lin = (hex: string): Rgb => {
  const c = (i: number): number => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [c(0), c(1), c(2)];
};

export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleRgb = (a: Rgb, s: number): Rgb => [a[0] * s, a[1] * s, a[2] * s];

type V3 = readonly [number, number, number];
const rotY = (x: number, z: number, yaw: number): [number, number] => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
};

export interface Common {
  kind: number;
  color: Rgb;
  /** top colour for vertical gradients (defaults to `color`) */
  colorTop?: Rgb;
  sway?: number;
  phase?: number;
  limb?: number;
  /** vertex colour jitter (multiplies by 1 ± jitter) */
  jitter?: number;
  rand?: () => number;
}

const shade = (c: Rgb, j: number, rand: (() => number) | undefined): Rgb => {
  if (!j || !rand) return c;
  const f = 1 + (rand() * 2 - 1) * j;
  return [c[0] * f, c[1] * f, c[2] * f];
};

/** Y-axis cylinder or cone frustum with an optional jagged rim (pine skirts) and flat or smooth shading. */
export function addCylinder(
  m: Mesh,
  o: Common & { x: number; y: number; z: number; r0: number; r1: number; h: number; seg?: number; cap?: boolean; jag?: number; lean?: V3; swayByHeight?: boolean; upNormal?: number; uvScale?: number }
): void {
  const seg = o.seg ?? 10;
  const rand = o.rand;
  const jag = o.jag ?? 0;
  const top = o.colorTop ?? o.color;
  const lean = o.lean ?? [0, 0, 0];
  const slope = (o.r0 - o.r1) / Math.max(1e-6, o.h);
  const up = o.upNormal ?? 0;
  const ring: { b: number; t: number }[] = [];
  const uvs = o.uvScale ?? 1;
  const jit: number[] = [];
  for (let i = 0; i < seg; i++) jit.push(jag ? 1 + (rand ? rand() * 2 - 1 : i % 2 ? 1 : -1) * jag : 1);
  jit.push(jit[0]!);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const jr = jit[i]!;
    const n: V3 = [ca, slope + up, sa];
    const base = pushVertex(m, {
      p: [o.x + ca * o.r0 * jr, o.y, o.z + sa * o.r0 * jr], n, uv: [(a * o.r0) * uvs, 0], color: shade(o.color, o.jitter ?? 0, rand), kind: o.kind, phase: o.phase, limb: o.limb
    });
    const topV = pushVertex(m, {
      p: [o.x + lean[0] + ca * o.r1 * jr, o.y + o.h + lean[1], o.z + lean[2] + sa * o.r1 * jr], n, uv: [(a * o.r1) * uvs, o.h * uvs], color: shade(top, o.jitter ?? 0, rand), kind: o.kind,
      sway: o.sway ?? 0, phase: o.phase, limb: o.limb
    });
    ring.push({ b: base, t: topV });
  }
  for (let i = 0; i < seg; i++) {
    const a = ring[i]!, b = ring[i + 1]!;
    m.indices.push(a.b, b.b, a.t, a.t, b.b, b.t);
  }
  if (o.cap) {
    const c = pushVertex(m, { p: [o.x + lean[0], o.y + o.h + lean[1], o.z + lean[2]], n: [0, 1, 0], uv: [0, 0], color: top, kind: o.kind, sway: o.sway, phase: o.phase, limb: o.limb });
    for (let i = 0; i < seg; i++) {
      const a = ring[i]!, b = ring[i + 1]!;
      m.indices.push(c, b.t, a.t);
    }
  }
}

/** Noise-displaced ellipsoid for crowns, bushes, rocks and clouds of leaves. */
export function addBlob(
  m: Mesh,
  o: Common & { x: number; y: number; z: number; rx: number; ry: number; rz: number; rings?: number; seg?: number; bump?: number; upNormal?: number; flat?: number; swayByHeight?: boolean; uvScale?: number }
): void {
  const rings = o.rings ?? 6, seg = o.seg ?? 10;
  const rand = o.rand ?? (() => 0.5);
  const bump = o.bump ?? 0.12;
  const top = o.colorTop ?? o.color;
  const up = o.upNormal ?? 0.35;
  const idx: number[][] = [];
  const bumps: number[] = [];
  for (let k = 0; k < (rings + 1) * (seg + 1); k++) bumps.push(1 + (rand() * 2 - 1) * bump);
  for (let j = 0; j <= rings; j++) {
    const row: number[] = [];
    const pol = (j / rings) * Math.PI;
    const sp = Math.sin(pol), cp = Math.cos(pol);
    for (let i = 0; i <= seg; i++) {
      const az = (i / seg) * Math.PI * 2;
      const b = i === seg ? bumps[j * (seg + 1)]! : bumps[j * (seg + 1) + i]!;
      const dx = Math.cos(az) * sp, dz = Math.sin(az) * sp, dy = cp;
      const t = (dy + 1) * 0.5;
      const sw = (o.sway ?? 0) * (o.swayByHeight === false ? 1 : 0.4 + 0.6 * t);
      row.push(pushVertex(m, {
        p: [o.x + dx * o.rx * b, o.y + dy * o.ry * b, o.z + dz * o.rz * b],
        n: [dx / o.rx, dy / o.ry + up, dz / o.rz],
        uv: [az * 1.5 * (o.uvScale ?? 1), t * 2 * (o.uvScale ?? 1)],
        color: shade([o.color[0] + (top[0] - o.color[0]) * t, o.color[1] + (top[1] - o.color[1]) * t, o.color[2] + (top[2] - o.color[2]) * t], o.jitter ?? 0, rand),
        kind: o.kind, sway: sw, phase: o.phase, limb: o.limb
      }));
    }
    idx.push(row);
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = idx[j]![i]!, b = idx[j]![i + 1]!, c = idx[j + 1]![i]!, d = idx[j + 1]![i + 1]!;
      m.indices.push(a, c, b, b, c, d);
    }
  }
}

/** Axis-aligned-then-yawed box with per-face normals and metre uvs. */
export function addBox(m: Mesh, o: Common & { x: number; y: number; z: number; w: number; h: number; d: number; yaw?: number; tiltZ?: number; uvScale?: number }): void {
  const yaw = o.yaw ?? 0;
  const hw = o.w / 2, hh = o.h / 2, hd = o.d / 2;
  const faces: { n: V3; c: V3[]; uv: [number, number][] }[] = [
    { n: [0, 0, 1], c: [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]], uv: [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]] },
    { n: [0, 0, -1], c: [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]], uv: [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]] },
    { n: [1, 0, 0], c: [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]], uv: [[0, 0], [o.d, 0], [o.d, o.h], [0, o.h]] },
    { n: [-1, 0, 0], c: [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]], uv: [[0, 0], [o.d, 0], [o.d, o.h], [0, o.h]] },
    { n: [0, 1, 0], c: [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]], uv: [[0, 0], [o.w, 0], [o.w, o.d], [0, o.d]] },
    { n: [0, -1, 0], c: [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]], uv: [[0, 0], [o.w, 0], [o.w, o.d], [0, o.d]] }
  ];
  const us = o.uvScale ?? 1;
  const top = o.colorTop ?? o.color;
  for (const f of faces) {
    const ids: number[] = [];
    f.c.forEach((c, k) => {
      const [rx, rz] = rotY(c[0], c[2], yaw);
      const tilt = o.tiltZ ?? 0;
      const ty = c[1] * Math.cos(tilt) + rx * Math.sin(tilt);
      const tx = rx * Math.cos(tilt) - c[1] * Math.sin(tilt);
      const [nx, nz] = rotY(f.n[0], f.n[2], yaw);
      const t = c[1] > 0 ? 1 : 0;
      ids.push(pushVertex(m, {
        p: [o.x + tx, o.y + ty, o.z + rz], n: [nx, f.n[1], nz], uv: [f.uv[k]![0] * us, f.uv[k]![1] * us],
        color: shade([o.color[0] + (top[0] - o.color[0]) * t, o.color[1] + (top[1] - o.color[1]) * t, o.color[2] + (top[2] - o.color[2]) * t], o.jitter ?? 0, o.rand),
        kind: o.kind, sway: o.sway, phase: o.phase, limb: o.limb
      }));
    });
    m.indices.push(ids[0]!, ids[1]!, ids[2]!, ids[0]!, ids[2]!, ids[3]!);
  }
}

/** Gabled roof: ridge along local x, `w` long, `d` deep at the eaves, rising `h`. */
export function addGable(m: Mesh, o: Common & { x: number; y: number; z: number; w: number; d: number; h: number; yaw?: number; overhang?: number; gableKind?: number; gableColor?: Rgb }): void {
  const yaw = o.yaw ?? 0;
  const hw = o.w / 2 + (o.overhang ?? 0.3), hd = o.d / 2 + (o.overhang ?? 0.3);
  const slopeLen = Math.hypot(hd, o.h);
  const place = (lx: number, ly: number, lz: number): [number, number, number] => {
    const [rx, rz] = rotY(lx, lz, yaw);
    return [o.x + rx, o.y + ly, o.z + rz];
  };
  const dirN = (lx: number, ly: number, lz: number): [number, number, number] => {
    const [rx, rz] = rotY(lx, lz, yaw);
    return [rx, ly, rz];
  };
  for (const side of [1, -1] as const) {
    const nrm = dirN(0, hd, side * o.h);
    const a = pushVertex(m, { p: place(-hw, 0, side * hd), n: nrm, uv: [0, 0], color: o.color, kind: o.kind });
    const b = pushVertex(m, { p: place(hw, 0, side * hd), n: nrm, uv: [hw * 2, 0], color: o.color, kind: o.kind });
    const c = pushVertex(m, { p: place(hw, o.h, 0), n: nrm, uv: [hw * 2, slopeLen], color: o.colorTop ?? o.color, kind: o.kind });
    const d = pushVertex(m, { p: place(-hw, o.h, 0), n: nrm, uv: [0, slopeLen], color: o.colorTop ?? o.color, kind: o.kind });
    if (side === 1) m.indices.push(a, b, c, a, c, d);
    else m.indices.push(a, c, b, a, d, c);
  }
  const gk = o.gableKind ?? KIND.plaster;
  const gc = o.gableColor ?? o.color;
  const hb = o.h * (1 - o.d / 2 / hd);
  for (const end of [1, -1] as const) {
    const nrm = dirN(end, 0, 0);
    const wx = end * (o.w / 2);
    const ring: [number, number, number][] = [place(wx, 0, -o.d / 2), place(wx, 0, o.d / 2), place(wx, hb, o.d / 2), place(wx, o.h, 0), place(wx, hb, -o.d / 2)];
    const uvp: [number, number][] = [[0, 0], [o.d, 0], [o.d, hb], [o.d / 2, o.h], [0, hb]];
    const ids = ring.map((p, k) => pushVertex(m, { p, n: nrm, uv: uvp[k]!, color: gc, kind: gk }));
    for (let k = 1; k < ids.length - 1; k++) {
      if (end === 1) m.indices.push(ids[0]!, ids[k + 1]!, ids[k]!);
      else m.indices.push(ids[0]!, ids[k]!, ids[k + 1]!);
    }
  }
}

/** Surface of revolution from `[radius, y]` profile points (bell, hull ends, finials). */
export function addLathe(m: Mesh, o: Common & { x: number; y: number; z: number; profile: readonly (readonly [number, number])[]; seg?: number; yaw?: number; scale?: number }): void {
  const seg = o.seg ?? 14;
  const s = o.scale ?? 1;
  const rows: number[][] = [];
  const top = o.colorTop ?? o.color;
  const ymax = Math.max(...o.profile.map((p) => p[1])), ymin = Math.min(...o.profile.map((p) => p[1]));
  o.profile.forEach(([r, y], k) => {
    const row: number[] = [];
    const prev = o.profile[Math.max(0, k - 1)]!, next = o.profile[Math.min(o.profile.length - 1, k + 1)]!;
    const dr = next[0] - prev[0], dy = next[1] - prev[1];
    const t = (y - ymin) / Math.max(1e-6, ymax - ymin);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      row.push(pushVertex(m, {
        p: [o.x + ca * r * s, o.y + y * s, o.z + sa * r * s], n: [ca * dy, -dr, sa * dy], uv: [a * r * s, y * s],
        color: [o.color[0] + (top[0] - o.color[0]) * t, o.color[1] + (top[1] - o.color[1]) * t, o.color[2] + (top[2] - o.color[2]) * t],
        kind: o.kind, sway: o.sway, phase: o.phase, limb: o.limb
      }));
    }
    rows.push(row);
  });
  for (let k = 0; k < rows.length - 1; k++) {
    for (let i = 0; i < seg; i++) {
      const a = rows[k]![i]!, b = rows[k]![i + 1]!, c = rows[k + 1]![i]!, d = rows[k + 1]![i + 1]!;
      m.indices.push(a, b, c, b, d, c);
    }
  }
}

/** Free quad (cloth, sails, planks seen edge-on). Corners are wound counter-clockwise from the front. */
export function addQuad(m: Mesh, o: Common & { p: [V3, V3, V3, V3]; uv?: [number, number][] }): void {
  const [a, b, c, d] = o.p;
  const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const uv = o.uv ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
  const top = o.colorTop ?? o.color;
  const ids = o.p.map((p, k) => pushVertex(m, { p, n, uv: uv[k]! as [number, number], color: k >= 2 ? top : o.color, kind: o.kind, sway: o.sway, phase: o.phase, limb: o.limb }));
  m.indices.push(ids[0]!, ids[1]!, ids[2]!, ids[0]!, ids[2]!, ids[3]!);
}

export function toGeometryInput(m: Mesh, withLimb = false, withWind = true): {
  positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array;
  attributes: Record<string, { itemSize: 1 | 3; data: Float32Array }>;
} {
  // a declared attribute the shader never reads is optimised out by the GLSL compiler, and the renderer then
  // skips the whole draw, so every mesh carries exactly the attributes its program uses
  const attributes: Record<string, { itemSize: 1 | 3; data: Float32Array }> = {
    tint: { itemSize: 3, data: Float32Array.from(m.tint) },
    kind: { itemSize: 1, data: Float32Array.from(m.kind) }
  };
  if (withWind) {
    attributes.sway = { itemSize: 1, data: Float32Array.from(m.sway) };
    attributes.phase = { itemSize: 1, data: Float32Array.from(m.phase) };
  }
  if (withLimb) attributes.limb = { itemSize: 1, data: Float32Array.from(m.limb) };
  return { positions: Float32Array.from(m.positions), normals: Float32Array.from(m.normals), uvs: Float32Array.from(m.uvs), indices: Uint32Array.from(m.indices), attributes };
}
