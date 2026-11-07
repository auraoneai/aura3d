// Procedural canyon terrain. Everything is periodic in z with period L so the
// flythrough can loop seamlessly.

export const L = 320; // tile length along z (metres)
export const X = 160; // tile width along x
const P = (2 * Math.PI) / L;

function hash2(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Value noise in [0,1], periodic in z with period L. L/cs must be an integer. */
export function vnoise(x: number, z: number, cs: number): number {
  const gx = x / cs;
  const gz = z / cs;
  const pz = Math.round(L / cs);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = fade(gx - ix);
  const fz = fade(gz - iz);
  const z0 = ((iz % pz) + pz) % pz;
  const z1 = (z0 + 1) % pz;
  const a = hash2(ix, z0);
  const b = hash2(ix + 1, z0);
  const c = hash2(ix, z1);
  const d = hash2(ix + 1, z1);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fz;
}

export function fbm(x: number, z: number, cs: number, oct: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let c = cs;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x + i * 17.3, z + i * 9.1, c);
    norm += amp;
    amp *= 0.5;
    c *= 0.5;
  }
  return sum / norm;
}

export function centerX(z: number): number {
  return 12 * Math.sin(3 * P * z + 0.4) + 3.5 * Math.sin(5 * P * z + 1.3);
}

export function halfWidth(z: number): number {
  return 11 + 2.5 * Math.sin(2 * P * z + 0.5) + 1.0 * Math.sin(7 * P * z + 2);
}

/** Horizontal distance past the canyon wall base (0 on the floor). */
export function wallDist(x: number, z: number): number {
  const c = centerX(z);
  const warp = 5 * (fbm(x, z, 20, 3) - 0.5) + 1.6 * (vnoise(x, z, 5) - 0.5);
  const u = Math.abs(x - c) + warp - halfWidth(z);
  return u > 0 ? u : 0;
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const TIER = 5.5;

export function heightAt(x: number, z: number): number {
  const u = wallDist(x, z);
  const c = centerX(z);
  const dch = x - (c + 2.2 * Math.sin(9 * P * z));
  let h =
    (fbm(x, z, 20, 3) - 0.5) * 0.9 +
    (vnoise(x, z, 2.5) - 0.5) * 0.14 +
    (vnoise(x, z, 0.625) - 0.5) * 0.04 -
    0.35 * Math.exp(-(dch * dch) / 8);
  if (u > 0) {
    const hmax = 34 + 22 * fbm(x, z, 40, 3);
    const h0 = hmax * (1 - Math.exp(-u / 8));
    const shift = 6 * (fbm(x, z, 10, 2) - 0.5) * Math.min(u / 3, 1);
    const tt = Math.max((h0 + shift) / TIER, 0);
    const fl = Math.floor(tt);
    const fr = tt - fl;
    h += (fl + smoothstep(0.35, 1, fr)) * TIER;
    h += (fbm(x, z, 2.5, 3) - 0.5) * 1.8 * Math.min(u / 3, 1);
    h += 1.0 * (1 - Math.exp(-u / 2.5));
  }
  return h;
}

// Sandstone strata palette (sRGB, 0..1).
const PAL: ReadonlyArray<readonly [number, number, number]> = [
  [0.8, 0.55, 0.35],
  [0.7, 0.33, 0.2],
  [0.58, 0.27, 0.19],
  [0.85, 0.66, 0.45],
  [0.5, 0.22, 0.17],
  [0.72, 0.45, 0.3],
];

export function strataColor(
  band: number,
  out: [number, number, number],
): [number, number, number] {
  const i = Math.floor(band);
  const f = smoothstep(0.75, 1, band - i);
  const a = PAL[Math.floor(hash2(i, 7) * PAL.length) % PAL.length];
  const b = PAL[Math.floor(hash2(i + 1, 7) * PAL.length) % PAL.length];
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}

const SAND: readonly [number, number, number] = [0.78, 0.6, 0.42];
const GRAVEL: readonly [number, number, number] = [0.6, 0.5, 0.43];

export interface TerrainData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export function buildTerrain(nx: number, nz: number): TerrainData {
  const dx = X / nx;
  const dz = L / nz;
  const w = nx + 3;
  const hs = new Float32Array(w * (nz + 3));
  for (let j = -1; j <= nz + 1; j++) {
    for (let i = -1; i <= nx + 1; i++) {
      hs[(j + 1) * w + (i + 1)] = heightAt(-X / 2 + i * dx, j * dz);
    }
  }
  const count = (nx + 1) * (nz + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const tmp: [number, number, number] = [0, 0, 0];
  let v = 0;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++, v++) {
      const x = -X / 2 + i * dx;
      const z = j * dz;
      const k = (j + 1) * w + (i + 1);
      const h = hs[k];
      const gx = (hs[k + 1] - hs[k - 1]) / (2 * dx);
      const gz = (hs[k + w] - hs[k - w]) / (2 * dz);
      const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      const ny = inv;
      positions[v * 3] = x;
      positions[v * 3 + 1] = h;
      positions[v * 3 + 2] = z;
      normals[v * 3] = -gx * inv;
      normals[v * 3 + 1] = ny;
      normals[v * 3 + 2] = -gz * inv;
      uvs[v * 2] = (x + X / 2) / X;
      uvs[v * 2 + 1] = z / L;

      // colour
      const band = h * 0.3 + 2.2 * fbm(x, z, 20, 2) + 0.35 * vnoise(x, z, 1.25);
      strataColor(band, tmp);
      const u = wallDist(x, z);
      const flat = smoothstep(0.7, 0.95, ny);
      let sandMix = flat * (u > 0 ? 0.7 : 1);
      if (u > 0) sandMix *= 1 - smoothstep(30, 50, h);
      const c = centerX(z);
      const dch = x - (c + 2.2 * Math.sin(9 * P * z));
      const gr = Math.exp(-(dch * dch) / 10) * (u > 0 ? 0 : 0.6);
      const lum = 0.92 + 0.16 * vnoise(x, z, 1.25);
      for (let q = 0; q < 3; q++) {
        let col = tmp[q] + (SAND[q] - tmp[q]) * sandMix;
        col = col + (GRAVEL[q] - col) * gr;
        col *= lum;
        colors[v * 3 + q] = Math.pow(Math.min(Math.max(col, 0), 1), 2.2);
      }
    }
  }
  const indices = new Uint32Array(nx * nz * 6);
  let n = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      indices[n++] = a;
      indices[n++] = c;
      indices[n++] = b;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = d;
    }
  }
  return { positions, normals, colors, uvs, indices };
}
