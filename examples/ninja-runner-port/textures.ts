/**
 * Procedural surface textures painted into plain RGBA buffers (cobbles, packed earth, scale roof tiles, deck planks,
 * grass, plaster, bark, leaves). Each painter is deterministic, tiles on both axes and returns a height field next to the
 * colour, so the world can upload the colour as the base-colour map and a normal map derived from the height. No DOM
 * here: `world.ts` copies the buffers into canvases.
 */
import { seededRandom } from "./sim";

export interface Raster { readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray; readonly heightField: Float32Array }
type Rgb = readonly [number, number, number];

const hexRgb = (hex: string): Rgb => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number): number => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise with `period` lattice cells across the unit square. */
function noise(u: number, v: number, period: number, seed: number): number {
  const x = u * period, y = v * period;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const p = (i: number, j: number): number => hash(((i % period) + period) % period, ((j % period) + period) % period, seed);
  const a = p(xi, yi), b = p(xi + 1, yi), c = p(xi, yi + 1), d = p(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(u: number, v: number, base: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += noise(u, v, base << o, seed + o * 17) * amp; norm += amp; amp *= 0.5; }
  return sum / norm;
}

function raster(width: number, height: number, paint: (x: number, y: number, set: (c: Rgb, h: number) => void) => void): Raster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const heightField = new Float32Array(width * height);
  let index = 0;
  const set = (c: Rgb, h: number): void => {
    rgba[index * 4] = c[0]; rgba[index * 4 + 1] = c[1]; rgba[index * 4 + 2] = c[2]; rgba[index * 4 + 3] = 255;
    heightField[index] = h;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { index = y * width + x; paint(x, y, set); }
  return { width, height, rgba, heightField };
}

/** Tangent-space normal map (RGBA) from a height field, wrapping at the edges. */
export function normalFromHeight(r: Raster, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(r.width * r.height * 4);
  const at = (x: number, y: number): number => r.heightField[((y + r.height) % r.height) * r.width + ((x + r.width) % r.width)]!;
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * r.width + x) * 4;
    out[i] = (-dx / l * 0.5 + 0.5) * 255; out[i + 1] = (dy / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}

const STONES = ["#b5a78a", "#a99b80", "#bfb294", "#9e9279", "#b8ad98", "#a39d8c"].map(hexRgb);
const MORTAR = hexRgb("#4f4636");

/** Irregular rounded cobblestones in staggered courses, mortar between. */
export function paintCobble(size = 512, seed = 1): Raster {
  const rand = seededRandom(seed * 7919 + 13);
  const rows = 7;
  const heights = Array.from({ length: rows }, () => 0.8 + rand() * 0.45);
  const total = heights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const courses = heights.map((h) => {
    const y0 = (acc / total) * size; acc += h; const y1 = (acc / total) * size;
    const n = 4 + Math.floor(rand() * 2);
    const widths = Array.from({ length: n }, () => 0.7 + rand() * 0.6);
    const sum = widths.reduce((a, b) => a + b, 0);
    let wa = 0;
    const stones = widths.map((w) => { const x0 = (wa / sum) * size; wa += w; return { x0, x1: (wa / sum) * size, tone: STONES[Math.floor(rand() * STONES.length)]!, k: 0.86 + rand() * 0.26, dome: 0.6 + rand() * 0.6 }; });
    return { y0, y1, shift: rand() * size, stones };
  });
  return raster(size, size, (x, y, set) => {
    const course = courses.find((c) => y >= c.y0 && y < c.y1) ?? courses[courses.length - 1]!;
    const xs = (x - course.shift + size * 4) % size;
    const stone = course.stones.find((s) => xs >= s.x0 && xs < s.x1) ?? course.stones[course.stones.length - 1]!;
    const w = stone.x1 - stone.x0, h = course.y1 - course.y0;
    const u = xs - stone.x0 - w / 2, v = y - course.y0 - h / 2;
    const radius = Math.min(w, h) * 0.3;
    const dx = Math.max(Math.abs(u) - (w / 2 - radius), 0), dy = Math.max(Math.abs(v) - (h / 2 - radius), 0);
    const dist = radius - Math.hypot(dx, dy);
    if (dist < 2.2) { const g = hash(x, y, seed); set(mix(MORTAR, [90, 82, 66], g), 0); return; }
    const bevel = smoothstep(2.2, 12, dist);
    const grain = 0.92 + hash(x, y, seed + 5) * 0.12 + (fbm(x / size, y / size, 16, 2, seed) - 0.5) * 0.18;
    const tone = mix(stone.tone, [255, 250, 240], (1 - bevel) * 0.06);
    const shade = (0.68 + 0.32 * bevel) * stone.k * grain;
    set([tone[0] * shade, tone[1] * shade, tone[2] * shade], bevel * stone.dome * 3 + (hash(x, y, seed + 9) - 0.5) * 0.2);
  });
}

/** Packed earth with leaf litter and pebbles. */
export function paintDirt(size = 256, seed = 2): Raster {
  const dark = hexRgb("#4f4128"), light = hexRgb("#8a7650"), leaf = [hexRgb("#7d6a35"), hexRgb("#8a5a2a"), hexRgb("#5d6a30")];
  return raster(size, size, (x, y, set) => {
    const u = x / size, v = y / size;
    const n = fbm(u, v, 6, 4, seed);
    let c = mix(dark, light, smoothstep(0.25, 0.8, n));
    let h = n * 1.2;
    const speck = hash(x, y, seed + 3);
    if (speck > 0.985) { c = mix(c, hexRgb("#b3a88c"), 0.7); h += 0.8; }
    const litter = noise(u, v, 24, seed + 11);
    if (litter > 0.82) { c = mix(c, leaf[Math.floor(hash(Math.floor(x / 5), Math.floor(y / 5), seed) * 3) % 3]!, 0.55); h += 0.15; }
    set(c, h);
  });
}

/** Overlapping scale roof tiles (fish-scale pattern) with a dark rim where tiles overlap. */
export function paintTiles(size = 256, seed = 3, tone = "#527c70"): Raster {
  const base = hexRgb(tone);
  const columns = 8, tw = size / columns, th = tw * 0.5, radius = tw * 0.66;
  return raster(size, size, (x, y, set) => {
    const row0 = Math.floor(y / th);
    for (let j = row0 + 2; j >= row0 - 1; j--) {
      const off = (((j % 2) + 2) % 2) * 0.5;
      const cy = j * th;
      for (let i = Math.floor(x / tw) - 1; i <= Math.floor(x / tw) + 1; i++) {
        const cx = (i + 0.5 + off) * tw;
        const d = Math.hypot(x - cx, y - cy) / radius;
        if (d > 1 || y < cy - radius * 0.2) continue;
        const wrapped = ((i % columns) + columns) % columns;
        const wj = ((j % (size / th)) + size / th) % (size / th);
        const k = 0.85 + hash(wrapped, wj, seed) * 0.3;
        const dome = 1 - d * d;
        const rim = smoothstep(0.78, 1, d);
        const lit = 0.7 + 0.5 * clamp01((cy + radius * 0.9 - y) / (radius * 1.6));
        const c = mix(base, [20, 30, 26], rim * 0.65);
        set([c[0] * k * lit, c[1] * k * lit, c[2] * k * lit], dome * 2.2);
        return;
      }
    }
    set(mix(base, [10, 14, 12], 0.7), 0);
  });
}

/** Deck planks running along u: two butt joints per board row, grain and dark gaps. */
export function paintPlanks(size = 256, seed = 4): Raster {
  const woods = ["#8a6a45", "#7a5c3b", "#9a7a50", "#6f5436"].map(hexRgb);
  const boards = 8, bh = size / boards;
  return raster(size, size, (x, y, set) => {
    const row = Math.floor(y / bh), local = (y - row * bh) / bh;
    const joint = hash(row, 1, seed) * size;
    const rel = (x - joint + size * 2) % size;
    const piece = rel < size / 2 ? 0 : 1;
    const wood = woods[Math.floor(hash(row, piece + 3, seed) * woods.length) % woods.length]!;
    const grain = noise(x / size, y / size, 3, seed) * 0.5 + noise(x / size, y / size * 4, 20, seed + 2) * 0.5;
    if (local < 0.06 || rel < 1.5 || Math.abs(rel - size / 2) < 1.5) { set([28, 20, 12], 0); return; }
    const k = 0.78 + grain * 0.4;
    set([wood[0] * k, wood[1] * k, wood[2] * k], 0.6 + grain * 0.3 - (local > 0.94 ? 0.4 : 0));
  });
}

/** Mottled grass with lighter blade flecks. */
export function paintGrass(size = 256, seed = 5): Raster {
  const a = hexRgb("#5d8a3e"), b = hexRgb("#86ae55"), c = hexRgb("#486b30");
  return raster(size, size, (x, y, set) => {
    const u = x / size, v = y / size;
    const n = fbm(u, v, 5, 4, seed);
    let col = mix(c, mix(a, b, smoothstep(0.3, 0.75, n)), smoothstep(0.1, 0.5, n));
    const blade = hash(x, y, seed + 1);
    if (blade > 0.92) col = mix(col, b, 0.5);
    else if (blade < 0.05) col = mix(col, c, 0.5);
    set(col, n * 0.8 + blade * 0.1);
  });
}

/** Warm plaster for single-wrap faces: low-frequency mottling, faint streaking and a dirtier foot (v near 0); not seamless in v. */
export function paintPlaster(size = 256, seed = 6): Raster {
  const base = hexRgb("#f4ecda");
  return raster(size, size, (x, y, set) => {
    const u = x / size, v = 1 - y / size;
    const n = fbm(u, v, 4, 4, seed);
    const streak = noise(u, v, 24, seed + 4) * 0.5 + noise(u * 3, v / 5, 6, seed + 7) * 0.5;
    const foot = 1 - 0.14 * (1 - smoothstep(0, 0.14, v));
    const k = (0.9 + n * 0.14 - (1 - streak) * 0.05) * foot * (0.97 + hash(x, y, seed) * 0.05);
    set([base[0] * k, base[1] * k, base[2] * k * 0.98], n * 0.5 + hash(x, y, seed + 2) * 0.1);
  });
}

/** Vertical bark streaks (neutral grey: the instance colour supplies the hue). */
export function paintBark(size = 128, seed = 7): Raster {
  const dark = hexRgb("#6a6a6a"), light = hexRgb("#d6d6d6");
  return raster(size, size, (x, y, set) => {
    const u = x / size, v = y / size;
    const ridge = noise(u, v, 10, seed) * 0.6 + noise(u, v * 0.5, 20, seed + 3) * 0.4;
    const t = smoothstep(0.25, 0.8, ridge);
    set(mix(dark, light, t), ridge * 1.4);
  });
}

/** Foliage: overlapping leaf dabs in neutral greys (the instance colour supplies the hue). */
export function paintLeaf(size = 256, seed = 8): Raster {
  const rand = seededRandom(seed * 31 + 5);
  const palette = ["#8a8a8a", "#a8a8a8", "#c8c8c8", "#ececec", "#585858"].map(hexRgb);
  const field = new Float32Array(size * size);
  const colour = new Array<Rgb>(size * size).fill(palette[4]!);
  for (let n = 0; n < 900; n++) {
    const cx = rand() * size, cy = rand() * size, r = 5 + rand() * 7, tone = palette[Math.floor(rand() * 4)]!;
    const k = 0.85 + rand() * 0.3;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx / 1.4, dy) / r;
      if (d > 1) continue;
      const x = (Math.floor(cx + dx) + size) % size, y = (Math.floor(cy + dy) + size) % size;
      const i = y * size + x;
      const shade = k * (0.75 + 0.3 * (1 - d));
      colour[i] = [tone[0] * shade, tone[1] * shade, tone[2] * shade];
      field[i] = 1 - d * 0.6;
    }
  }
  return raster(size, size, (x, y, set) => { const i = y * size + x; set(colour[i]!, field[i]!); });
}
