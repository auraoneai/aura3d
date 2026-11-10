import { texture } from "@aura3d/engine";

type RGB = [number, number, number];
type Tex = ReturnType<typeof texture.data>;

const W = 256;
const H = 128;

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mixc = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Seeded 3D value noise: samples a direction on the sphere so textures wrap without a seam. */
function makeNoise(seed: number): (x: number, y: number, z: number) => number {
  const hash = (ix: number, iy: number, iz: number): number => {
    let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967295;
  };
  return (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
    const l = (a: number, b: number, t: number): number => a + (b - a) * t;
    return l(
      l(l(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), l(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy),
      l(l(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), l(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy),
      fz
    );
  };
}

function fbm(noise: (x: number, y: number, z: number) => number, x: number, y: number, z: number, oct = 4): number {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i += 1) {
    sum += noise(x * f, y * f, z * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

function build(fn: (dir: V, lat: number, u: number, v: number) => RGB): Tex {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const v = (y + 0.5) / H;
    const lat = (0.5 - v) * Math.PI;
    for (let x = 0; x < W; x += 1) {
      const u = (x + 0.5) / W;
      const lon = u * Math.PI * 2;
      const dir: V = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
      const c = fn(dir, lat, u, v);
      const o = (y * W + x) * 4;
      data[o] = Math.max(0, Math.min(255, c[0]));
      data[o + 1] = Math.max(0, Math.min(255, c[1]));
      data[o + 2] = Math.max(0, Math.min(255, c[2]));
      data[o + 3] = 255;
    }
  }
  return texture.data({ width: W, height: H, data, format: "rgba8", colorSpace: "srgb" });
}

type V = [number, number, number];

export function makeRockyTexture(seed: number, light: string, dark: string, freq: number, caps: boolean): Tex {
  const n = makeNoise(seed);
  const a = hex(light), b = hex(dark);
  return build((d, lat) => {
    const big = fbm(n, d[0] * freq, d[1] * freq, d[2] * freq, 5);
    const fine = fbm(n, d[0] * freq * 5 + 9, d[1] * freq * 5, d[2] * freq * 5, 3);
    let c = mixc(b, a, smooth(Math.min(1, Math.max(0, (big - 0.3) * 2.2))));
    c = mixc(c, mixc(b, a, fine), 0.3);
    if (caps) {
      const k = smooth(Math.min(1, Math.max(0, (Math.abs(lat) - 1.25) * 6)));
      c = mixc(c, [240, 244, 250], k);
    }
    return c;
  });
}

export function makeBandedTexture(seed: number, palette: string[], bands: number, turbulence: number): Tex {
  const n = makeNoise(seed);
  const cols = palette.map(hex);
  return build((d, lat) => {
    const warp = (fbm(n, d[0] * 2.5, d[1] * 1.2, d[2] * 2.5, 4) - 0.5) * turbulence * 2.2;
    const t = (Math.sin(lat * bands + warp * 3) * 0.5 + 0.5) * (cols.length - 1);
    const i = Math.min(cols.length - 2, Math.floor(t));
    let c = mixc(cols[i]!, cols[i + 1]!, smooth(t - i));
    const grain = fbm(n, d[0] * 14, d[1] * 14, d[2] * 14, 2) - 0.5;
    c = [c[0] * (1 + grain * 0.18), c[1] * (1 + grain * 0.18), c[2] * (1 + grain * 0.18)];
    return c;
  });
}

export function makeEarthTexture(seed: number): Tex {
  const n = makeNoise(seed);
  const deep = hex("#12427f"), shallow = hex("#2a7bc0"), grass = hex("#3f8f4a"), dry = hex("#9a8a52"), ice = hex("#f2f6fb");
  return build((d, lat) => {
    const h = fbm(n, d[0] * 2.2 + 3, d[1] * 2.2, d[2] * 2.2, 5);
    let c: RGB;
    if (h > 0.53) {
      const dryness = Math.min(1, Math.max(0, (Math.abs(Math.sin(lat)) < 0.35 ? 0.6 : 0.2) + (h - 0.53) * 3));
      c = mixc(grass, dry, dryness);
    } else {
      c = mixc(deep, shallow, smooth(Math.min(1, Math.max(0, (h - 0.35) * 5))));
    }
    const cloud = fbm(n, d[0] * 4 + 20, d[1] * 6, d[2] * 4, 4);
    c = mixc(c, [255, 255, 255], Math.max(0, cloud - 0.55) * 1.8);
    const cap = smooth(Math.min(1, Math.max(0, (Math.abs(lat) - 1.18) * 7)));
    return mixc(c, ice, cap);
  });
}

export function makeSunTexture(seed: number): Tex {
  const n = makeNoise(seed);
  const hot = hex("#fff2b0"), mid = hex("#ffb52e"), cool = hex("#e8691a");
  return build((d) => {
    const g = fbm(n, d[0] * 5, d[1] * 5, d[2] * 5, 5);
    const spots = fbm(n, d[0] * 12 + 7, d[1] * 12, d[2] * 12, 2);
    let c = g < 0.5 ? mixc(cool, mid, g * 2) : mixc(mid, hot, (g - 0.5) * 2);
    c = mixc(c, cool, Math.max(0, spots - 0.62) * 2);
    return c;
  });
}

/** Radial alpha strip for Saturn's ring: u runs from the inner to the outer edge. */
export function makeRingTexture(seed: number): Tex {
  const n = makeNoise(seed);
  const RW = 128, RH = 4;
  const data = new Uint8Array(RW * RH * 4);
  const base = hex("#d8c595"), pale = hex("#f0e4c4"), dark = hex("#8f7d56");
  for (let x = 0; x < RW; x += 1) {
    const u = (x + 0.5) / RW;
    const band = fbm(n, u * 30, 1.3, 2.1, 3);
    const gap = u > 0.62 && u < 0.68 ? 0.05 : 1; // Cassini-like division
    const edge = smooth(Math.min(1, u * 10)) * smooth(Math.min(1, (1 - u) * 8));
    const alpha = Math.min(1, (0.25 + band * 1.1) * gap * edge) * (u < 0.28 ? 0.45 : 1);
    const c = mixc(mixc(dark, base, band), pale, Math.max(0, band - 0.6));
    for (let y = 0; y < RH; y += 1) {
      const o = (y * RW + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = Math.round(alpha * 255);
    }
  }
  return texture.data({ width: RW, height: RH, data, format: "rgba8", colorSpace: "srgb" });
}
