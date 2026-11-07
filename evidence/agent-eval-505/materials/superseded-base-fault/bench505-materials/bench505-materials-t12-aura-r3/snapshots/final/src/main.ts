import { camera, createAuraApp, effects, environments, geometry, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { materials: string[]; cameraAzimuthDeg: number };
    __EVAL_READY__?: boolean;
  }
}

type Vec3 = [number, number, number];

/* ------------------------------------------------------------------ */
/* Mesh helpers                                                        */
/* ------------------------------------------------------------------ */

interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  colors?: Float32Array;
  indices: number[];
}

/** Flip every triangle if the first non-degenerate one winds against its vertex normal. */
const fixWinding = (m: Mesh): void => {
  const { positions: p, normals: n, indices: ix } = m;
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const e1: Vec3 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const e2: Vec3 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.hypot(cx, cy, cz) < 1e-9) continue;
    const dot = cx * (n[a] + n[b] + n[c]) + cy * (n[a + 1] + n[b + 1] + n[c + 1]) + cz * (n[a + 2] + n[b + 2] + n[c + 2]);
    if (Math.abs(dot) < 1e-9) continue;
    if (dot < 0) {
      for (let k = 0; k + 2 < ix.length; k += 3) {
        const tmp = ix[k + 1];
        ix[k + 1] = ix[k + 2];
        ix[k + 2] = tmp;
      }
    }
    return;
  }
};

const boundsOf = (p: Float32Array): { min: Vec3; max: Vec3 } => {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  }
  return { min, max };
};

const toSpec = (m: Mesh) => {
  fixWinding(m);
  const bounds = boundsOf(m.positions);
  return m.colors
    ? geometry.define({ positions: m.positions, normals: m.normals, colors: m.colors, indices: m.indices, bounds })
    : geometry.define({ positions: m.positions, normals: m.normals, indices: m.indices, bounds });
};

/* ------------------------------------------------------------------ */
/* Procedural Carrara marble (3D value noise, turbulence-warped veins) */
/* ------------------------------------------------------------------ */

const hash3 = (x: number, y: number, z: number): number => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const vnoise = (x: number, y: number, z: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  const x00 = l(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), ux);
  const x10 = l(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), ux);
  const x01 = l(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), ux);
  const x11 = l(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), ux);
  return l(l(x00, x10, uy), l(x01, x11, uy), uz);
};

const fbm = (x: number, y: number, z: number, octaves: number): number => {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * vnoise(x * f, y * f, z * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const vein = (s: number, sharp: number): number => Math.pow(Math.max(0, 1 - Math.abs(Math.sin(s))), sharp);

const marble = (x: number, y: number, z: number): [number, number, number, number] => {
  const cloud = fbm(x * 0.85 + 3.1, y * 0.85 + 1.7, z * 0.85, 4);
  const warp = (fbm(x * 1.6, y * 1.6 + 5.3, z * 1.6 + 2.2, 5) - 0.5) * 2;
  const warp2 = (fbm(x * 3.1 + 7.7, y * 3.1, z * 3.1 + 1.3, 4) - 0.5) * 2;

  // main diagonal veins, warped by turbulence, fading in and out along their length
  const m1 = smooth(0.38, 0.62, fbm(x * 0.55 + 9.2, y * 0.55 + 4.1, z * 0.55, 3));
  const v1 = vein((x * 1.15 + y * 1.9 + z * 0.8) * 3.0 + warp * 5.2 + warp2 * 1.2, 10) * m1;
  // second, thinner family running across the first
  const m2 = smooth(0.42, 0.7, fbm(x * 0.7 + 1.1, y * 0.7 + 8.8, z * 0.7 + 3.3, 3));
  const v2 = vein((-x * 0.9 + y * 1.2 + z * 2.2) * 4.6 + warp * 6.5 + 2.0, 22) * m2 * 0.7;
  // hairline cracks
  const m3 = smooth(0.45, 0.75, fbm(x * 1.3 + 5.5, y * 1.3, z * 1.3 + 9.1, 3));
  const v3 = vein((x * 1.7 - y * 0.6 + z * 1.3) * 11 + fbm(x * 5, y * 5, z * 5, 3) * 9, 34) * m3 * 0.42;

  const veins = Math.min(1, v1 * 0.92 + v2 * 0.8 + v3);
  const haze = smooth(0.52, 0.85, cloud) * 0.075 + smooth(0.45, 0.2, cloud) * 0.02;
  const tone = 0.9 - haze + (fbm(x * 9, y * 9, z * 9, 2) - 0.5) * 0.025;
  const grey = 0.4 + 0.12 * warp2;
  const v = tone * (1 - veins) + grey * veins;
  return [v + 0.012, v + 0.004, v - 0.012, 1];
};

/** A box whose six faces are tessellated finely enough to carry the marble pattern as vertex colours. */
const marbleBox = (size: Vec3, center: Vec3, cell = 0.035): Mesh => {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let k = 0; k < 3; k += 1) {
    for (const sg of [-1, 1]) {
      const a = (k + 1) % 3, b = (k + 2) % 3;
      const na = Math.max(2, Math.ceil(size[a] / cell));
      const nb = Math.max(2, Math.ceil(size[b] / cell));
      const base = positions.length / 3;
      for (let j = 0; j <= nb; j += 1) {
        for (let i = 0; i <= na; i += 1) {
          const p: Vec3 = [0, 0, 0];
          p[k] = center[k] + (sg * size[k]) / 2;
          p[a] = center[a] + (i / na - 0.5) * size[a];
          p[b] = center[b] + (j / nb - 0.5) * size[b];
          const n: Vec3 = [0, 0, 0];
          n[k] = sg;
          positions.push(p[0], p[1], p[2]);
          normals.push(n[0], n[1], n[2]);
          colors.push(...marble(p[0], p[1], p[2]));
        }
      }
      for (let j = 0; j < nb; j += 1) {
        for (let i = 0; i < na; i += 1) {
          const v = base + j * (na + 1) + i;
          indices.push(v, v + na + 1, v + 1, v + 1, v + na + 1, v + na + 2);
        }
      }
    }
  }
  const mesh: Mesh = {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices
  };
  // Faces were built with arbitrary orientation; make every triangle wind outward individually.
  const p = mesh.positions, n = mesh.normals;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const e1: Vec3 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const e2: Vec3 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const d = (e1[1] * e2[2] - e1[2] * e2[1]) * n[a] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[a + 1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[a + 2];
    if (d < 0) {
      const tmp = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = tmp;
    }
  }
  return mesh;
};

/* ------------------------------------------------------------------ */
/* Lathe (revolved profile) and swept tube                             */
/* ------------------------------------------------------------------ */

type P2 = [number, number];

/** Uniform Catmull-Rom through control points, `sub` samples per span. */
const spline = (pts: P2[], sub: number): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < sub; s += 1) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};

const lathe = (profile: P2[], segments: number): Mesh => {
  const rows = profile.length;
  const positions = new Float32Array(rows * (segments + 1) * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    const prev = profile[Math.max(0, j - 1)], next = profile[Math.min(rows - 1, j + 1)];
    let tr = next[0] - prev[0], ty = next[1] - prev[1];
    const len = Math.hypot(tr, ty) || 1;
    tr /= len;
    ty /= len;
    const nr = ty, ny = -tr; // outward when the profile is walked upward
    for (let i = 0; i <= segments; i += 1) {
      const phi = (i / segments) * Math.PI * 2;
      const c = Math.cos(phi), s = Math.sin(phi);
      const v = (j * (segments + 1) + i) * 3;
      positions[v] = profile[j][0] * c;
      positions[v + 1] = profile[j][1];
      positions[v + 2] = profile[j][0] * s;
      normals[v] = nr * c;
      normals[v + 1] = ny;
      normals[v + 2] = nr * s;
      if (j < rows - 1 && i < segments) {
        const q = j * (segments + 1) + i;
        indices.push(q, q + segments + 1, q + 1, q + 1, q + segments + 1, q + segments + 2);
      }
    }
  }
  return { positions, normals, indices };
};

/** Cubic Bezier in the XY plane swept with a circular section (the trophy handles). */
const handle = (side: 1 | -1, p: [P2, P2, P2, P2], radius: (t: number) => number, along: number, around: number): Mesh => {
  const positions = new Float32Array((along + 1) * (around + 1) * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  const at = (t: number): P2 => {
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [
      w[0] * p[0][0] + w[1] * p[1][0] + w[2] * p[2][0] + w[3] * p[3][0],
      w[0] * p[0][1] + w[1] * p[1][1] + w[2] * p[2][1] + w[3] * p[3][1]
    ];
  };
  for (let j = 0; j <= along; j += 1) {
    const t = j / along;
    const a = at(Math.max(0, t - 0.002)), b = at(Math.min(1, t + 0.002)), c = at(t);
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty, ny = tx; // in-plane normal; the out-of-plane axis is Z
    const r = radius(t);
    for (let i = 0; i <= around; i += 1) {
      const phi = (i / around) * Math.PI * 2;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const v = (j * (around + 1) + i) * 3;
      const dx = nx * cp, dy = ny * cp, dz = sp;
      positions[v] = side * (c[0] + r * dx);
      positions[v + 1] = c[1] + r * dy;
      positions[v + 2] = r * dz;
      normals[v] = side * dx;
      normals[v + 1] = dy;
      normals[v + 2] = dz;
      if (j < along && i < around) {
        const q = j * (around + 1) + i;
        indices.push(q, q + around + 1, q + 1, q + 1, q + around + 1, q + around + 2);
      }
    }
  }
  return { positions, normals, indices };
};

/* ------------------------------------------------------------------ */
/* Trophy geometry                                                     */
/* ------------------------------------------------------------------ */

const trophyControl: P2[] = [
  [0.44, 0.0], [0.44, 0.03], [0.4, 0.07], [0.3, 0.11], [0.19, 0.15], [0.12, 0.22], [0.095, 0.32], [0.1, 0.38],
  [0.16, 0.44], [0.19, 0.5], [0.16, 0.56], [0.1, 0.62], [0.085, 0.7], [0.11, 0.78], [0.2, 0.88], [0.32, 1.0],
  [0.42, 1.12], [0.48, 1.24], [0.495, 1.3], [0.49, 1.335], [0.475, 1.342], [0.46, 1.32], [0.45, 1.2], [0.4, 1.05],
  [0.3, 0.93], [0.16, 0.86], [0.0, 0.84]
];
const trophyProfile = spline(trophyControl, 14);
const topIndex = trophyProfile.reduce((best, p, i) => (p[1] > trophyProfile[best][1] ? i : best), 0);
const outerProfile = trophyProfile.slice(0, topIndex + 1);

/** Outer radius of the trophy body at height y. */
const outerRadius = (y: number): number => {
  for (let i = 1; i < outerProfile.length; i += 1) {
    const a = outerProfile[i - 1], b = outerProfile[i];
    if (y >= a[1] && y <= b[1] && b[1] > a[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  }
  return outerProfile[outerProfile.length - 1][0];
};

/** Raised band hugging the body between y0 and y1, with fine engraved grooves cut into it. */
const band = (y0: number, y1: number, lift: number, grooves: number[]): P2[] => {
  const n = 64;
  const ramp = 0.012;
  const out: P2[] = [];
  for (let i = 0; i <= n; i += 1) {
    const y = y0 + ((y1 - y0) * i) / n;
    const edge = Math.min(1, Math.min((y - y0) / ramp, (y1 - y) / ramp));
    let cut = 0;
    for (const g of grooves) cut = Math.max(cut, Math.max(0, 1 - Math.abs(y - g) / 0.006));
    out.push([outerRadius(y) + lift * edge * (1 - 0.8 * cut), y]);
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

const marbleMat = material.physical({ color: "#ffffff", metallic: 0, roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.06 });
const goldMat = material.physical({ color: "#ffc43d", metallic: 1, roughness: 0.1, clearcoat: 0.25, clearcoatRoughness: 0.05 });
const darkGoldMat = material.physical({ color: "#8c6420", metallic: 1, roughness: 0.42 });
const darkStoneMat = material.physical({ color: "#0b0b0d", metallic: 0, roughness: 0.16, clearcoat: 0.9, clearcoatRoughness: 0.04 });
const floorMat = material.physical({ color: "#241914", metallic: 0, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.12 });
const wallMat = material.pbr({ color: "#30231b", roughness: 0.85 });
const frameMat = material.pbr({ color: "#0d0a08", roughness: 0.6 });
const windowMat = material.emissive({ color: "#dce9ff", emissive: "#cfe0ff", emissiveIntensity: 3.2 });
const lampMat = material.emissive({ color: "#ffc27a", emissive: "#ffa850", emissiveIntensity: 3.6 });

/* ------------------------------------------------------------------ */
/* Pedestal and trophy                                                 */
/* ------------------------------------------------------------------ */

const STEP1_H = 0.28, STEP2_H = 0.28, COLUMN_H = 1.0, CAP_H = 0.14;
const PEDESTAL_TOP = STEP1_H + STEP2_H + COLUMN_H + CAP_H; // 1.70
const BASE_H = 0.2;
const TROPHY_Y = PEDESTAL_TOP + BASE_H;

const pedestalBlocks: Array<{ name: string; size: Vec3; y: number }> = [
  { name: "pedestal-step-1", size: [2.6, STEP1_H, 2.6], y: 0 },
  { name: "pedestal-step-2", size: [2.0, STEP2_H, 2.0], y: STEP1_H },
  { name: "pedestal-column", size: [1.45, COLUMN_H, 1.45], y: STEP1_H + STEP2_H },
  { name: "pedestal-cap", size: [1.8, CAP_H, 1.8], y: STEP1_H + STEP2_H + COLUMN_H }
];

const pedestal = pedestalBlocks.map((b) =>
  geometry.custom(toSpec(marbleBox(b.size, [0, b.y + b.size[1] / 2, 0])), { name: b.name, material: marbleMat, castShadow: true, receiveShadow: true })
);

const cupBand = band(1.0, 1.1, 0.014, [1.033, 1.067]);
const collarBand = band(0.27, 0.31, 0.012, [0.29]);

const handles = ([1, -1] as const).map((side) =>
  geometry.custom(
    toSpec(handle(side, [[0.4, 1.18], [0.98, 1.3], [0.95, 0.7], [0.15, 0.85]], (t) => 0.03 + 0.013 * Math.sin(Math.PI * t), 72, 20)),
    { name: side > 0 ? "trophy-handle-right" : "trophy-handle-left", material: goldMat, castShadow: true }
  )
);

const trophy = group("trophy", [
  // black polished stone base with a thin gold plate on its front face
  primitives.box({ name: "trophy-base", size: [1.1, BASE_H - 0.04, 1.1], material: darkStoneMat }).position(0, (BASE_H - 0.04) / 2 - BASE_H, 0),
  primitives.box({ name: "trophy-base-top", size: [0.94, 0.04, 0.94], material: darkStoneMat }).position(0, -0.02, 0),
  primitives.box({ name: "trophy-plate", size: [0.56, 0.085, 0.012], material: goldMat }).position(0, -0.12, 0.556),
  // cup, stem and foot: one revolved profile
  geometry.custom(toSpec(lathe(trophyProfile, 96)), { name: "trophy-cup", material: goldMat, castShadow: true }),
  // darker, rougher engraved band and collar
  geometry.custom(toSpec(lathe(cupBand, 96)), { name: "trophy-band", material: darkGoldMat, castShadow: false }),
  geometry.custom(toSpec(lathe(collarBand, 64)), { name: "trophy-collar", material: darkGoldMat, castShadow: false }),
  // two swept handles
  ...handles
], { position: [0, TROPHY_Y, 0] });

const stage = group("stage", [...pedestal, trophy]).runtime({ id: "stage", mutable: true });

/* ------------------------------------------------------------------ */
/* Gallery room (also what the gold and marble reflect)                */
/* ------------------------------------------------------------------ */

const ROOM = { x0: -8, x1: 8, z0: -6.5, z1: 9, h: 7, t: 0.3 };
const roomW = ROOM.x1 - ROOM.x0, roomD = ROOM.z1 - ROOM.z0;
const roomMidZ = (ROOM.z0 + ROOM.z1) / 2;
const shell = (name: string, size: Vec3, pos: Vec3, mat = wallMat) =>
  primitives.box({ name, size, material: mat, castShadow: false, receiveShadow: true }).position(...pos);

const room = [
  shell("floor", [roomW, 0.4, roomD], [0, -0.2, roomMidZ], floorMat),
  shell("ceiling", [roomW, ROOM.t, roomD], [0, ROOM.h + ROOM.t / 2, roomMidZ]),
  shell("wall-back", [roomW, ROOM.h, ROOM.t], [0, ROOM.h / 2, ROOM.z0 - ROOM.t / 2]),
  shell("wall-front", [roomW, ROOM.h, ROOM.t], [0, ROOM.h / 2, ROOM.z1 + ROOM.t / 2]),
  shell("wall-left", [ROOM.t, ROOM.h, roomD], [ROOM.x0 - ROOM.t / 2, ROOM.h / 2, roomMidZ]),
  shell("wall-right", [ROOM.t, ROOM.h, roomD], [ROOM.x1 + ROOM.t / 2, ROOM.h / 2, roomMidZ])
];

// Tall windows with mullions: bright panels for the metal to reflect.
const windows: Array<ReturnType<typeof primitives.box>> = [];
const addWindow = (id: string, centre: Vec3, along: "x" | "z", w: number, h: number): void => {
  // `a` runs along the wall, `b` is vertical, `c` points into the room.
  const size = (a: number, b: number, c: number): Vec3 => (along === "x" ? [a, b, c] : [c, b, a]);
  const offset = (a: number, b: number, c: number): Vec3 =>
    along === "x" ? [centre[0] + a, centre[1] + b, centre[2] + c] : [centre[0] + c, centre[1] + b, centre[2] + a];
  const part = (name: string, s: Vec3, o: Vec3, mat: typeof windowMat): void => {
    windows.push(primitives.box({ name: `${id}-${name}`, size: s, material: mat, castShadow: false }).position(...o));
  };
  part("glass", size(w, h, 0.08), offset(0, 0, 0), windowMat);
  part("mullion-v", size(0.07, h, 0.05), offset(0, 0, 0.05), frameMat);
  part("mullion-h1", size(w, 0.07, 0.05), offset(0, h * 0.17, 0.05), frameMat);
  part("mullion-h2", size(w, 0.07, 0.05), offset(0, -h * 0.17, 0.05), frameMat);
  part("frame-l", size(0.12, h + 0.12, 0.06), offset(-w / 2, 0, 0.05), frameMat);
  part("frame-r", size(0.12, h + 0.12, 0.06), offset(w / 2, 0, 0.05), frameMat);
  part("frame-t", size(w + 0.24, 0.12, 0.06), offset(0, h / 2, 0.05), frameMat);
  part("frame-b", size(w + 0.24, 0.12, 0.06), offset(0, -h / 2, 0.05), frameMat);
};
// Back wall: two windows flanking the trophy, the centre stays dark.
addWindow("win-back-l", [-4.6, 3.6, ROOM.z0 + 0.05], "x", 1.7, 3.8);
addWindow("win-back-r", [4.6, 3.6, ROOM.z0 + 0.05], "x", 1.7, 3.8);
// Left wall: two windows.
addWindow("win-left-a", [ROOM.x0 + 0.05, 3.6, -2.5], "z", 1.7, 3.8);
addWindow("win-left-b", [ROOM.x0 + 0.05, 3.6, 3.2], "z", 1.7, 3.8);

// Warm lamps on stands and a ceiling panel.
const lamps = [
  primitives.cylinder({ name: "lamp-stand-l", size: [0.07, 2.4, 0.07], material: frameMat, castShadow: false }).position(-5.8, 1.2, -4.6),
  primitives.sphere({ name: "lamp-globe-l", size: 0.55, material: lampMat, castShadow: false }).position(-5.8, 2.65, -4.6),
  primitives.cylinder({ name: "lamp-stand-r", size: [0.07, 2.4, 0.07], material: frameMat, castShadow: false }).position(5.8, 1.2, -3.2),
  primitives.sphere({ name: "lamp-globe-r", size: 0.55, material: lampMat, castShadow: false }).position(5.8, 2.65, -3.2),
  primitives.box({ name: "ceiling-panel", size: [3.4, 0.06, 1.1], material: lampMat, castShadow: false }).position(0, ROOM.h - 0.03, -2.2),
  primitives.sphere({ name: "lamp-globe-far", size: 0.4, material: lampMat, castShadow: false }).position(6.2, 4.6, -5.9)
];

/* ------------------------------------------------------------------ */
/* Camera: slow +/-15 degree orbit around the trophy                   */
/* ------------------------------------------------------------------ */

const ORBIT_RADIUS = 7.6;
const CAM_Y = 2.4;
const CAM_TARGET: Vec3 = [0, 1.65, 0];
const CAM_FOV = 35;
const AMPLITUDE_DEG = 15;
const OMEGA = (Math.PI * 2) / 22; // 22 s per full back-and-forth
const PHASE = 0.6;
const azimuthAt = (seconds: number): number => AMPLITUDE_DEG * Math.sin(seconds * OMEGA + PHASE);
const cameraPosition = (azDeg: number): Vec3 => {
  const a = (azDeg * Math.PI) / 180;
  return [CAM_TARGET[0] + ORBIT_RADIUS * Math.sin(a), CAM_Y, CAM_TARGET[2] + ORBIT_RADIUS * Math.cos(a)];
};

const app = createAuraApp("#app", {
  scene: scene({ background: "#0c0807" })
    // Procedural environment: the room itself (dark walls, bright windows and lamps) captured once into a probe.
    .add(environments.capture({ name: "gallery-probe", position: [0, 4.6, 1.0], resolution: 256, update: "once", include: "all", intensity: 1.1, background: false }))
    .add(lights.hemisphere({ skyColor: "#3a2a20", groundColor: "#120d0a", intensity: 0.22 }))
    // Key: one warm spotlight above and in front, soft edge, shadow falls behind the pedestal.
    .add(lights.spot({
      name: "key", position: [1.6, 6.4, 5.6], target: [0, 1.7, 0], angle: 0.4, penumbra: 0.85,
      distance: 26, decay: 2, intensity: 120, color: "#ffd7a0", shadow: true
    }))
    // Faint cool fill from the left and a subtle warm rim from behind.
    .add(lights.directional({ name: "fill", position: [-6, 3.5, 6], target: [0, 1.6, 0], intensity: 0.35, color: "#8fb2ff" }))
    .add(lights.point({ name: "rim", position: [-2.4, 3.8, -2.8], intensity: 9, distance: 9, color: "#ffe2b8" }))
    .addMany(room)
    .addMany(windows)
    .addMany(lamps)
    .add(stage)
    .add(effects.bloom({ intensity: 0.4, threshold: 0.9, radius: 0.5 }))
    .camera(camera.perspective({ position: cameraPosition(azimuthAt(0)), target: CAM_TARGET, fov: CAM_FOV, near: 0.1, far: 80 }))
});

/* ------------------------------------------------------------------ */
/* Per-frame update                                                    */
/* ------------------------------------------------------------------ */

interface PoseController {
  setPose?: (pose: { position: Vec3; target: Vec3; fov?: number }) => void;
}

let useStageFallback = false;
const t0 = performance.now();

const publish = (az: number): void => {
  window.__TASK_STATE__ = { materials: ["marble", "gold", "darkstone"], cameraAzimuthDeg: az };
};
publish(azimuthAt(0));

const update = (): void => {
  const az = azimuthAt((performance.now() - t0) / 1000);
  const controller = app.camera as unknown as PoseController | undefined;
  if (!useStageFallback) {
    try {
      if (controller && typeof controller.setPose === "function") {
        controller.setPose({ position: cameraPosition(az), target: CAM_TARGET, fov: CAM_FOV });
      } else {
        useStageFallback = true;
      }
    } catch {
      useStageFallback = true;
    }
  }
  if (useStageFallback) {
    // No runtime camera control available: turn the stage the opposite way instead.
    app.nodes.require("stage").setRotation(0, (-az * Math.PI) / 180, 0);
  }
  publish(az);
};

app.onFrame(update);
await app.ready();
update();
await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
window.__EVAL_READY__ = true;
