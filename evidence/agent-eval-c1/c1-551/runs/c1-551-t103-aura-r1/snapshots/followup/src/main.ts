import { camera, createAuraApp, effects, geometry, lights, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { flying: boolean; cameraX: number; cameraY: number; cameraZ: number };
  }
}

/* ------------------------------------------------------------------ */
/* Periodic canyon heightfield (period P along z so the flythrough loops) */
/* ------------------------------------------------------------------ */
const P = 160; // canyon period in metres
const NX = 129; // grid columns, x = X0 .. X0 + NX - 1
const X0 = -64;
const ZS = -40; // first mesh row (world z)
const NZV = 300; // mesh rows
const TAU = Math.PI * 2;
const A = TAU / P;

type V3 = [number, number, number];

const mod = (a: number, n: number): number => ((a % n) + n) % n;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function hash(i: number, j: number, seed: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, s: number, seed: number): number {
  const per = Math.round(P / s);
  const fx = x / s;
  const fz = z / s;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = smooth(0, 1, fx - ix);
  const tz = smooth(0, 1, fz - iz);
  const a = hash(ix, mod(iz, per), seed);
  const b = hash(ix + 1, mod(iz, per), seed);
  const c = hash(ix, mod(iz + 1, per), seed);
  const d = hash(ix + 1, mod(iz + 1, per), seed);
  return mix(mix(a, b, tx), mix(c, d, tx), tz);
}
function fbm(x: number, z: number, seed: number): number {
  return (
    0.5 * vnoise(x, z, 20, seed) +
    0.25 * vnoise(x, z, 10, seed + 7) +
    0.15 * vnoise(x, z, 5, seed + 13) +
    0.1 * vnoise(x, z, 2.5, seed + 29)
  );
}

const center = (z: number): number => 12 * Math.sin(A * z + 0.4) + 4.5 * Math.sin(3 * A * z + 1.3);
const halfW = (z: number): number => 9 + 2.5 * Math.sin(2 * A * z + 0.5) + 1.2 * Math.sin(5 * A * z + 2);
const camDrift = (z: number): number => 3.4 * Math.sin(3 * A * z + 0.8) + 1.6 * Math.sin(7 * A * z + 2.1);
const camX = (z: number): number => center(z) + camDrift(z);

function terrainHeight(x: number, z: number): number {
  const c = center(z);
  const w = halfW(z);
  const dd = Math.abs(x - c) + 2.6 * (fbm(x, z, 1) - 0.5);
  const u = Math.max(0, dd - w);
  const hmod = 1 + 0.22 * Math.sin(2 * A * z + 1.0) + 0.1 * Math.sin(7 * A * z);
  let raw = ((46 * u) / (u + 15)) * hmod + 3.5 * (1 - Math.exp(-u / 2.2));
  raw += 10 * (fbm(x, z, 2) - 0.5) * smooth(0, 25, u);
  const L = 4.2;
  const s = Math.max(0, raw / L + 0.8 * (fbm(x, z, 3) - 0.5));
  const fl = Math.floor(s);
  const step = smooth(0.4, 0.95, s - fl);
  let h = 0.7 * (fl + step) * L + 0.3 * raw;
  const wallMask = 1 - smooth(0, 5, u);
  h += 0.5 * (fbm(x, z, 4) - 0.5) * wallMask;
  const r = c + 2.8 * Math.sin(2 * A * z + 2.0);
  const ch = Math.exp(-(((x - r) / 2.6) ** 2));
  h -= 0.6 * ch * wallMask;
  return h;
}

const H = new Float32Array(NX * P);
for (let iz = 0; iz < P; iz += 1) {
  for (let ix = 0; ix < NX; ix += 1) H[iz * NX + ix] = terrainHeight(X0 + ix, iz);
}
function gridH(ix: number, iz: number): number {
  return H[mod(iz, P) * NX + clamp(ix, 0, NX - 1)];
}
function sampleH(x: number, z: number): number {
  const fx = clamp(x - X0, 0, NX - 1.001);
  const ix = Math.floor(fx);
  const tx = fx - ix;
  const fz = z;
  const iz = Math.floor(fz);
  const tz = fz - iz;
  return mix(mix(gridH(ix, iz), gridH(ix + 1, iz), tx), mix(gridH(ix, iz + 1), gridH(ix + 1, iz + 1), tx), tz);
}

/* ------------------------------------------------------------------ */
/* Lighting bake                                                        */
/* ------------------------------------------------------------------ */
const SUN_EL = (12 * Math.PI) / 180;
const SUN_AZ = (22 * Math.PI) / 180;
const SUN: V3 = [Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), Math.cos(SUN_AZ) * Math.cos(SUN_EL)];
const SUN_COL: V3 = [1.0, 0.5, 0.22];

interface Occluder {
  c: V3;
  r: V3;
  density: number;
}
const occluders: Occluder[] = [];

function occlusion(o: V3, skip: number): number {
  let lit = 1;
  for (let k = 0; k < occluders.length; k += 1) {
    if (k === skip) continue;
    const e = occluders[k];
    const dx = e.c[0] - o[0];
    const dz = e.c[2] - o[2];
    if (dx * dx + dz * dz > 90 * 90) continue;
    const qx = (o[0] - e.c[0]) / e.r[0];
    const qy = (o[1] - e.c[1]) / e.r[1];
    const qz = (o[2] - e.c[2]) / e.r[2];
    const ddx = SUN[0] / e.r[0];
    const ddy = SUN[1] / e.r[1];
    const ddz = SUN[2] / e.r[2];
    const dd = ddx * ddx + ddy * ddy + ddz * ddz;
    const tt = -(qx * ddx + qy * ddy + qz * ddz) / dd;
    if (tt < 0) continue;
    const px = qx + ddx * tt;
    const py = qy + ddy * tt;
    const pz = qz + ddz * tt;
    const dist = Math.sqrt(px * px + py * py + pz * pz);
    lit *= 1 - e.density * (1 - smooth(0.5, 1.15, dist));
  }
  return lit;
}

function terrainShadow(x: number, y: number, z: number): number {
  let m = 10;
  let t = 0.9;
  while (t < 150) {
    const py = y + SUN[1] * t;
    if (py > 72) break;
    const px = x + SUN[0] * t;
    if (px < X0 + 1 || px > X0 + NX - 2) break;
    const hh = sampleH(px, z + SUN[2] * t);
    m = Math.min(m, (py - hh) / (0.12 * t + 1.4));
    t += Math.max(0.8, t * 0.06);
  }
  return smooth(-0.8, 0.9, m);
}

const DIRS: Array<[number, number]> = [];
for (let k = 0; k < 8; k += 1) DIRS.push([Math.cos((k * TAU) / 8), Math.sin((k * TAU) / 8)]);
function skyVisibility(x: number, y: number, z: number): number {
  let sum = 0;
  for (const [dx, dz] of DIRS) {
    let best = 0;
    for (const d of [2, 5, 10, 20, 36]) {
      const hh = sampleH(x + dx * d, z + dz * d);
      best = Math.max(best, Math.atan2(hh - y, d));
    }
    sum += Math.sin(best);
  }
  return clamp(1 - sum / 8, 0, 1);
}

function hexToLin(hex: string): V3 {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2)) as V3;
}

const SKY_AMB: V3 = [0.5, 0.3, 0.36];
const BOUNCE: V3 = [0.8, 0.38, 0.2];
const GAIN = 1.0;
const encode = (v: number): number => Math.pow(clamp(v, 0, 1), 1 / 2.2);

/** Final baked colour for a surface point. */
function lightSurface(albedo: V3, n: V3, shadow: number, skyVis: number): V3 {
  const ndl = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
  const up = 0.5 + 0.5 * n[1];
  const bounce = clamp(1 - skyVis, 0, 1) * (1 - 0.4 * n[1]);
  const out: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k += 1) {
    const direct = SUN_COL[k] * ndl * shadow * 2.3;
    const amb = SKY_AMB[k] * (0.35 + 0.65 * up) * (0.25 + 0.75 * skyVis) * 1.4 + BOUNCE[k] * bounce * 0.55;
    out[k] = encode(albedo[k] * (direct + amb) * GAIN);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Albedo palettes                                                      */
/* ------------------------------------------------------------------ */
const STRATA = ["#c4673a", "#d9854c", "#b04a2c", "#e1a068", "#8f3b26", "#cf7a47", "#e8b384", "#a65535", "#6e3226", "#d89060"].map(hexToLin);
const SAND = hexToLin("#eaa060");
const BED = hexToLin("#d9b088");
const DUST = hexToLin("#e0b68c");

function albedoAt(x: number, z: number, h: number, slope: number): V3 {
  const band = Math.floor(h / 1.7 + 3 * (vnoise(x, z, 5, 41) - 0.5) + 0.6 * (vnoise(x, z, 2.5, 43) - 0.5));
  const base = STRATA[Math.floor(hash(band, 5, 3) * STRATA.length) % STRATA.length];
  const speck = (0.9 + 0.2 * hash(Math.round(x * 2), Math.round(z * 2), 9)) * (0.92 + 0.16 * vnoise(x, z, 2.5, 61));
  const out: V3 = [base[0] * speck, base[1] * speck, base[2] * speck];
  // gentle vertical streaks on cliff faces
  const streak = 0.95 + 0.1 * vnoise(x * 3, z * 0.4, 5, 51);
  const wall = smooth(0.25, 0.9, slope);
  for (let k = 0; k < 3; k += 1) out[k] *= mix(1, streak, wall);
  // sand on treads and the canyon floor
  const flat = 1 - smooth(0.12, 0.5, slope);
  const floorMix = (1 - smooth(1.2, 4.0, h)) * 0.9;
  const dust = Math.max(flat * 0.3, floorMix);
  const c = center(z);
  const r = c + 2.8 * Math.sin(2 * A * z + 2.0);
  const bed = Math.exp(-(((x - r) / 3.2) ** 2)) * (1 - smooth(0.5, 3, h));
  for (let k = 0; k < 3; k += 1) {
    let v = mix(out[k], mix(SAND[k], DUST[k], flat), dust);
    v = mix(v, BED[k] * speck, bed * 0.8);
    out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Scatter boulders and dead shrubs (positions first, shadows baked in) */
/* ------------------------------------------------------------------ */
let seedState = 1337;
const rnd = (): number => {
  seedState = (Math.imul(seedState, 1664525) + 1013904223) | 0;
  return ((seedState >>> 0) % 1000003) / 1000003;
};

interface Boulder {
  p: V3;
  r: V3;
  yaw: number;
  seed: number;
}
interface Shrub {
  p: V3;
  scale: number;
  seed: number;
}
const boulderBase: Boulder[] = [];
const shrubBase: Shrub[] = [];

function floorSpot(): { x: number; z: number } | undefined {
  for (let tries = 0; tries < 30; tries += 1) {
    const z = rnd() * P;
    const side = rnd() < 0.5 ? -1 : 1;
    const off = 4.4 + rnd() * (halfW(z) - 2.4);
    const x = center(z) + side * off;
    if (Math.abs(x - camX(z)) < 3.6) continue;
    if (sampleH(x, z) > 1.4) continue;
    return { x, z };
  }
  return undefined;
}
for (let i = 0; i < 42; i += 1) {
  const s = floorSpot();
  if (!s) continue;
  const big = rnd() < 0.25;
  const size = big ? 1.6 + rnd() * 1.4 : 0.5 + rnd() * 0.9;
  const rx = size * (0.9 + rnd() * 0.5);
  const rz = size * (0.9 + rnd() * 0.5);
  const ry = size * (0.55 + rnd() * 0.3);
  boulderBase.push({ p: [s.x, sampleH(s.x, s.z) + ry * 0.35, s.z], r: [rx, ry, rz], yaw: rnd() * TAU, seed: i + 100 });
}
for (let i = 0; i < 34; i += 1) {
  const s = floorSpot();
  if (!s) continue;
  shrubBase.push({ p: [s.x, sampleH(s.x, s.z) - 0.04, s.z], scale: 0.7 + rnd() * 0.8, seed: i + 500 });
}

const COPIES = [-1, 0, 1];
const boulders: Boulder[] = [];
const shrubs: Shrub[] = [];
for (const k of COPIES) {
  for (const b of boulderBase) {
    const z = b.p[2] + k * P;
    if (z < ZS - 5 || z > ZS + NZV + 5) continue;
    boulders.push({ ...b, p: [b.p[0], b.p[1], z] });
  }
  for (const s of shrubBase) {
    const z = s.p[2] + k * P;
    if (z < ZS - 5 || z > ZS + NZV + 5) continue;
    shrubs.push({ ...s, p: [s.p[0], s.p[1], z] });
  }
}
// occluders used to shadow the ground: boulders (solid) and shrubs (light blobs)
const boulderOcc: number[] = [];
for (const b of boulders) {
  boulderOcc.push(occluders.length);
  occluders.push({ c: b.p, r: [b.r[0] * 0.95, b.r[1] * 0.95, b.r[2] * 0.95], density: 0.97 });
}
for (const s of shrubs) {
  occluders.push({ c: [s.p[0], s.p[1] + 0.45 * s.scale, s.p[2]], r: [0.55 * s.scale, 0.45 * s.scale, 0.55 * s.scale], density: 0.45 });
}
// ground occluders for periodic wrap (rays from grid cells reach +z across the period seam)
const baseCount = occluders.length;
for (const k of [1]) {
  for (let i = 0; i < baseCount; i += 1) {
    const o = occluders[i];
    occluders.push({ c: [o.c[0], o.c[1], o.c[2] + k * P], r: o.r, density: o.density });
  }
}

/* ------------------------------------------------------------------ */
/* Terrain grid colours                                                 */
/* ------------------------------------------------------------------ */
const CELL_COL = new Float32Array(NX * P * 3);
const CELL_SKYVIS = new Float32Array(NX * P);
const CELL_N = new Float32Array(NX * P * 3);
let SH = new Float32Array(NX * P);
for (let iz = 0; iz < P; iz += 1) {
  for (let ix = 0; ix < NX; ix += 1) {
    const x = X0 + ix;
    const y = gridH(ix, iz);
    SH[iz * NX + ix] = terrainShadow(x, y + 0.05, iz) * occlusion([x, y + 0.1, iz], -1);
  }
}
for (let pass = 0; pass < 3; pass += 1) {
  const nxt = new Float32Array(NX * P);
  for (let iz = 0; iz < P; iz += 1) {
    for (let ix = 0; ix < NX; ix += 1) {
      let sum = 0;
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          sum += SH[mod(iz + dz, P) * NX + clamp(ix + dx, 0, NX - 1)];
        }
      }
      nxt[iz * NX + ix] = sum / 9;
    }
  }
  SH = nxt;
}
for (let iz = 0; iz < P; iz += 1) {
  for (let ix = 0; ix < NX; ix += 1) {
    const x = X0 + ix;
    const z = iz;
    const y = gridH(ix, iz);
    const nx = gridH(ix - 1, iz) - gridH(ix + 1, iz);
    const nz = gridH(ix, iz - 1) - gridH(ix, iz + 1);
    const len = Math.hypot(nx, 2, nz);
    const n: V3 = [nx / len, 2 / len, nz / len];
    const slope = 1 - n[1];
    const sv = skyVisibility(x, y, z);
    const shadow = SH[iz * NX + ix];
    const alb = albedoAt(x, z, y, slope);
    const col = lightSurface(alb, n, shadow, sv);
    const idx = iz * NX + ix;
    CELL_COL.set(col, idx * 3);
    CELL_N.set(n, idx * 3);
    CELL_SKYVIS[idx] = sv;
  }
}

/* ------------------------------------------------------------------ */
/* Mesh builders                                                        */
/* ------------------------------------------------------------------ */
interface MeshData {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}
const newMesh = (): MeshData => ({ positions: [], normals: [], colors: [], indices: [] });

function toGeometry(m: MeshData) {
  const positions = new Float32Array(m.positions);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  return geometry.define({
    positions,
    normals: new Float32Array(m.normals),
    colors: new Float32Array(m.colors),
    indices: m.indices,
    bounds: { min, max }
  });
}

// terrain
const terrain = newMesh();
for (let j = 0; j < NZV; j += 1) {
  for (let i = 0; i < NX; i += 1) {
    const z = ZS + j;
    const iz = mod(z, P);
    const idx = iz * NX + i;
    terrain.positions.push(X0 + i, H[idx], z);
    terrain.normals.push(CELL_N[idx * 3], CELL_N[idx * 3 + 1], CELL_N[idx * 3 + 2]);
    terrain.colors.push(CELL_COL[idx * 3], CELL_COL[idx * 3 + 1], CELL_COL[idx * 3 + 2], 1);
  }
}
for (let j = 0; j < NZV - 1; j += 1) {
  for (let i = 0; i < NX - 1; i += 1) {
    const v = j * NX + i;
    terrain.indices.push(v, v + NX, v + 1, v + 1, v + NX, v + NX + 1);
  }
}

function propLight(albedo: V3, n: V3, p: V3, skip: number): V3 {
  const shadow = terrainShadow(p[0], p[1] + 0.05, p[2]) * occlusion(p, skip);
  const sv = clamp(skyVisibility(p[0], sampleH(p[0], mod(p[2], P)), mod(p[2], P)) * (0.55 + 0.45 * (0.5 + 0.5 * n[1])) + 0.05, 0, 1);
  return lightSurface(albedo, n, shadow, sv);
}

// boulders: faceted displaced spheres
const rocks = newMesh();
const RINGS = 7;
const SEGS = 11;
boulders.forEach((b, bi) => {
  const grid: V3[] = [];
  const cy = Math.cos(b.yaw);
  const sy = Math.sin(b.yaw);
  for (let r = 0; r <= RINGS; r += 1) {
    const th = (r / RINGS) * Math.PI;
    for (let s = 0; s < SEGS; s += 1) {
      const ph = (s / SEGS) * TAU;
      const disp = 1 + 0.28 * (hash(r, s, b.seed) - 0.5) * (r === 0 || r === RINGS ? 0 : 1);
      let lx = Math.sin(th) * Math.cos(ph) * b.r[0] * disp;
      const ly = Math.cos(th) * b.r[1] * disp;
      let lz = Math.sin(th) * Math.sin(ph) * b.r[2] * disp;
      const rx = lx * cy - lz * sy;
      const rz = lx * sy + lz * cy;
      lx = rx;
      lz = rz;
      grid.push([b.p[0] + lx, b.p[1] + ly, b.p[2] + lz]);
    }
  }
  const at = (r: number, s: number): V3 => grid[r * SEGS + (s % SEGS)];
  const tri = (a: V3, bb: V3, c: V3): void => {
    const ux = bb[0] - a[0];
    const uy = bb[1] - a[1];
    const uz = bb[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const cen: V3 = [(a[0] + bb[0] + c[0]) / 3, (a[1] + bb[1] + c[1]) / 3, (a[2] + bb[2] + c[2]) / 3];
    const alb = albedoAt(cen[0], cen[2], cen[1] * 1.6 + 2 + hash(bi, 1, 5) * 4, 0.35);
    const dark = 0.62 + 0.25 * hash(Math.round(cen[0] * 7), Math.round(cen[1] * 7), bi);
    const col = propLight([alb[0] * dark, alb[1] * dark, alb[2] * dark], [nx, ny, nz], cen, boulderOcc[bi]);
    const base = rocks.positions.length / 3;
    for (const p of [a, bb, c]) {
      rocks.positions.push(p[0], p[1], p[2]);
      rocks.normals.push(nx, ny, nz);
      rocks.colors.push(col[0], col[1], col[2], 1);
    }
    rocks.indices.push(base, base + 1, base + 2);
  };
  for (let r = 0; r < RINGS; r += 1) {
    for (let s = 0; s < SEGS; s += 1) {
      const p00 = at(r, s);
      const p01 = at(r, s + 1);
      const p10 = at(r + 1, s);
      const p11 = at(r + 1, s + 1);
      // winding chosen so normals face outward (checked with the vertex normal sign below)
      tri(p00, p01, p10);
      tri(p01, p11, p10);
    }
  }
});

// dead shrubs: tapered five-sided branches
const twigs = newMesh();
const WOOD = hexToLin("#6b584a");
function prism(p0: V3, p1: V3, r0: number, r1: number): void {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const dz = p1[2] - p0[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  const d: V3 = [dx / l, dy / l, dz / l];
  const ref: V3 = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let ax = d[1] * ref[2] - d[2] * ref[1];
  let ay = d[2] * ref[0] - d[0] * ref[2];
  let az = d[0] * ref[1] - d[1] * ref[0];
  const al = Math.hypot(ax, ay, az) || 1;
  ax /= al;
  ay /= al;
  az /= al;
  const bx = d[1] * az - d[2] * ay;
  const by = d[2] * ax - d[0] * az;
  const bz = d[0] * ay - d[1] * ax;
  const base = twigs.positions.length / 3;
  const SIDES = 5;
  for (let ring = 0; ring < 2; ring += 1) {
    const p = ring === 0 ? p0 : p1;
    const rad = ring === 0 ? r0 : r1;
    for (let s = 0; s < SIDES; s += 1) {
      const a = (s / SIDES) * TAU;
      const nx = Math.cos(a) * ax + Math.sin(a) * bx;
      const ny = Math.cos(a) * ay + Math.sin(a) * by;
      const nz = Math.cos(a) * az + Math.sin(a) * bz;
      twigs.positions.push(p[0] + nx * rad, p[1] + ny * rad, p[2] + nz * rad);
      twigs.normals.push(nx, ny, nz);
      const col = propLight(WOOD, [nx, ny, nz], [p[0], p[1] + 0.1, p[2]], -1);
      twigs.colors.push(col[0], col[1], col[2], 1);
    }
  }
  for (let s = 0; s < SIDES; s += 1) {
    const s2 = (s + 1) % SIDES;
    twigs.indices.push(base + s, base + s2, base + SIDES + s, base + s2, base + SIDES + s2, base + SIDES + s);
  }
}
function branch(p: V3, dir: V3, len: number, r: number, depth: number, seed: number): void {
  const end: V3 = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
  prism(p, end, r, r * 0.62);
  if (depth <= 0) return;
  for (let k = 0; k < 2; k += 1) {
    const jx = (hash(seed, k, 1) - 0.5) * 1.3;
    const jy = (hash(seed, k, 2) - 0.2) * 0.8;
    const jz = (hash(seed, k, 3) - 0.5) * 1.3;
    const nd: V3 = [dir[0] + jx, dir[1] + jy, dir[2] + jz];
    const nl = Math.hypot(nd[0], nd[1], nd[2]) || 1;
    branch(end, [nd[0] / nl, nd[1] / nl, nd[2] / nl], len * 0.72, r * 0.6, depth - 1, seed * 3 + k + 1);
  }
}
shrubs.forEach((s) => {
  const stems = 4;
  for (let k = 0; k < stems; k += 1) {
    const az = hash(s.seed, k, 7) * TAU;
    const lean = 0.5 + hash(s.seed, k, 8) * 0.7;
    const dir: V3 = [Math.sin(lean) * Math.cos(az), Math.cos(lean), Math.sin(lean) * Math.sin(az)];
    branch(s.p, dir, 0.55 * s.scale, 0.035 * s.scale, 2, s.seed * 11 + k);
  }
});

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */
const terrainMat = material.pbr({ color: "#ffffff", roughness: 1, metallic: 0 });

const app = createAuraApp("#app", {
  scene: scene({ background: "#c46a6a" })
    .add(
      sky.gradient({
        zenith: "#232a73",
        horizon: "#ff9a62",
        ground: "#7a4a4a",
        exponent: 2.2,
        horizonGlow: 0.9,
        sun: { elevationDeg: 12, azimuthDeg: 22, intensity: 1, color: "#ffb070", discSize: 1.4 },
        bands: [
          { elevationDeg: 2, widthDeg: 7, color: "#ff8a3a", intensity: 0.9 },
          { elevationDeg: 7, widthDeg: 9, color: "#ff4f8f", intensity: 0.55 },
          { elevationDeg: 16, widthDeg: 14, color: "#8a4fd0", intensity: 0.3 }
        ]
      })
    )
    .add(lights.ambient({ intensity: 1, color: "#ffffff" }))
    .add(geometry.custom(toGeometry(terrain), { name: "canyon", material: terrainMat }))
    .add(geometry.custom(toGeometry(rocks), { name: "boulders", material: terrainMat }))
    .add(geometry.custom(toGeometry(twigs), { name: "shrubs", material: terrainMat }))
    .add(effects.fog({ color: "#d98a86", density: 0.0027, mode: "exp2", affectsBackground: false }))
    .add(effects.bloom({ intensity: 0.35, threshold: 0.8, radius: 0.5 }))
    .camera(camera.perspective({ position: [0, 2, 0], target: [0, 3, 20], fov: 58, near: 0.2, far: 420 }))
});

const SPEED = 3.6;
let lastZ = -1;
function poseAt(time: number) {
  const z = mod(time * SPEED, P);
  const x = camX(z);
  const y = 1.8 + 0.5 * sampleH(x, z);
  const zt = z + 24;
  const tx = 0.5 * center(zt) + 0.5 * camX(zt);
  const ty = y + 3.4 + 0.8 * Math.sin(0.35 * time);
  const wrapped = z < lastZ;
  lastZ = z;
  return { z, wrapped, position: [x, y, z] as V3, target: [tx, ty, zt] as V3 };
}

const taskState = { flying: true, cameraX: 0, cameraY: 0, cameraZ: 0 };
window.__TASK_STATE__ = taskState;

const toggle = document.createElement("button");
toggle.id = "toggle-flythrough";
toggle.type = "button";
toggle.textContent = "Pause flythrough";
toggle.style.cssText = "display:block;margin:8px;padding:6px 12px;font:13px system-ui,sans-serif;";
toggle.addEventListener("click", () => {
  taskState.flying = !taskState.flying;
  toggle.textContent = taskState.flying ? "Pause flythrough" : "Resume flythrough";
});
document.body.appendChild(toggle);

let flightTime = 0;
app.onFrame((f) => {
  if (taskState.flying) flightTime += f.dt;
  const p = poseAt(flightTime);
  app.camera?.setPose({ position: p.position, target: p.target, up: [0, 1, 0], roll: 0.012 * Math.sin(0.5 * flightTime) }, { cut: true });
  taskState.cameraX = p.position[0];
  taskState.cameraY = p.position[1];
  taskState.cameraZ = p.position[2];
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
});
void app.ready();
