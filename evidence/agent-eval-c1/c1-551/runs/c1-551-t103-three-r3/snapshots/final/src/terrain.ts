// Procedural canyon terrain. Everything is periodic in z with period P so the
// camera can loop forever. Terrain is described in canyon-relative coordinates
// (u = lateral offset from the winding centre line, z = along the canyon).

export const P = 512;
export const TAU = Math.PI * 2;

// Unit vector pointing toward the sun (low, ahead and to the side).
const sl = Math.hypot(0.55, 0.2, 0.81);
export const SUN: [number, number, number] = [0.55 / sl, 0.2 / sl, 0.81 / sl];

export const U_MAX = 75;

function hash2(i: number, j: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Value noise, periodic in z with `pz` cells.
function vn(x: number, z: number, pz: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const z0 = ((zi % pz) + pz) % pz;
  const z1 = (z0 + 1) % pz;
  const o = seed * 1000;
  const a = hash2(xi, z0 + o);
  const b = hash2(xi + 1, z0 + o);
  const c = hash2(xi, z1 + o);
  const d = hash2(xi + 1, z1 + o);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function sstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function wrapZ(z: number): number {
  return ((z % P) + P) % P;
}

/** x of the canyon centre line at z. */
export function cl(z: number): number {
  const a = (TAU * z) / P;
  return 16 * Math.sin(2 * a) + 4.5 * Math.sin(5 * a + 1) + 1.2 * Math.sin(9 * a + 2);
}

export function clSlope(z: number): number {
  const a = (TAU * z) / P;
  return (32 * Math.cos(2 * a) + 22.5 * Math.cos(5 * a + 1) + 10.8 * Math.cos(9 * a + 2)) * (TAU / P);
}

/** Lateral drift of the camera relative to the centre line. */
export function camU(z: number): number {
  const a = (TAU * z) / P;
  return 3.2 * Math.sin(7 * a + 0.5) + 1.4 * Math.sin(13 * a + 2);
}

function floorH(u: number, z: number): number {
  const f = (vn(u / 16, z / 16, 32, 1) - 0.5) * 0.9 + (vn(u / 4, z / 4, 128, 2) - 0.5) * 0.25;
  const a = (TAU * z) / P;
  const rc = 4 * Math.sin(6 * a + 0.7) + 2 * Math.sin(11 * a);
  const q = (u - rc) / 3.2;
  return f - 0.8 * Math.exp(-q * q);
}

export function height(u: number, zIn: number): number {
  const z = wrapZ(zIn);
  const a = (TAU * z) / P;
  const right = u >= 0;
  const w = right
    ? 15 + 3.5 * Math.sin(3 * a + 2) + 2 * Math.sin(7 * a)
    : 15 + 3.5 * Math.sin(3 * a + 4) + 2 * Math.sin(8 * a + 1);
  const au = Math.abs(u);
  const dd = au + (vn(u / 16, z / 16, 32, 3) - 0.5) * 8 + (vn(u / 8, z / 8, 64, 4) - 0.5) * 2.5;
  const t = dd - w;
  const h = floorH(u, z);
  if (t <= 0) return h;

  const rim = 20 + 16 * vn(au / 32 + (right ? 0 : 11.5), z / 32, 16, 5);
  const r = Math.min(t / 16, 1);
  let hp = rim * (1 - Math.pow(1 - r, 2.2));

  // sandstone terraces: flat ledges separated by steep risers
  const step = 3 + 1.8 * vn(0.5, z / 64, 8, 6);
  const s = hp / step;
  const fl = Math.floor(s);
  const ss = sstep(0.4, 1, s - fl);
  hp = hp * 0.2 + (fl + ss) * step * 0.8;

  // rolling mesa top
  hp += (t > 16 ? (t - 16) * 0.05 : 0);
  hp += (vn(au / 16 + 3, z / 16, 32, 9) - 0.5) * 8 * sstep(10, 22, t);

  // surface roughness
  hp += ((vn(u / 4, z / 4, 128, 7) - 0.5) * 1.4 + (vn(u / 2, z / 2, 256, 8) - 0.5) * 0.6) * Math.min(1, t / 3);
  return h + hp;
}

// ---- raster copy of the height field, used for sun shadow ray marching ----
const GN = P;
const GU = U_MAX * 2 + 1;
let grid: Float32Array | null = null;

function buildGrid(): Float32Array {
  const g = new Float32Array(GU * GN);
  for (let k = 0; k < GN; k++) {
    for (let i = 0; i < GU; i++) {
      g[k * GU + i] = height(i - U_MAX, k);
    }
  }
  return g;
}

function sampleGrid(u: number, z: number): number {
  const g = grid as Float32Array;
  const uu = Math.min(GU - 1.001, Math.max(0, u + U_MAX));
  const zz = wrapZ(z);
  const i = Math.floor(uu);
  const k = Math.floor(zz);
  const fu = uu - i;
  const fz = zz - k;
  const k1 = (k + 1) % GN;
  const a = g[k * GU + i];
  const b = g[k * GU + i + 1];
  const c = g[k1 * GU + i];
  const d = g[k1 * GU + i + 1];
  return a + (b - a) * fu + (c - a) * fz + (a - b - c + d) * fu * fz;
}

/** Soft sun visibility (0 = shadowed, 1 = lit) for a world-space point. */
export function sunShadow(x: number, y: number, z: number): number {
  if (!grid) grid = buildGrid();
  let res = 1;
  let s = 0;
  let stepLen = 0.5;
  for (let i = 0; i < 56; i++) {
    s += stepLen;
    stepLen *= 1.07;
    const pz = z + SUN[2] * s;
    const py = y + SUN[1] * s;
    if (py > 75) break;
    const px = x + SUN[0] * s;
    const hh = sampleGrid(px - cl(pz), pz);
    const d = (py - hh) / (0.07 * s + 0.3);
    if (d < res) res = d;
    if (res <= 0) return 0;
  }
  const t = Math.min(1, Math.max(0, res));
  return t * t * (3 - 2 * t);
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
