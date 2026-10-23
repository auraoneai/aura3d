/**
 * Static town geometry and its painted textures: merged meshes with metric UVs (terraced townhouses with gable roofs, a clock
 * tower, a stone arch, a cobbled plaza) and canvas textures (plaster facade with shuttered windows and its emissive window map,
 * roof tiles, cobbles, ashlar stone, a clock face). Everything is generated in code; nothing is loaded or copied from the original.
 */
import { geometry, texture } from "@aura3d/engine";

export type V3 = readonly [number, number, number];
type UV = readonly [number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class MeshData {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  get vertexCount(): number { return this.positions.length / 3; }
  get triangleCount(): number { return this.indices.length / 3; }

  /** A planar polygon (3 or 4 points); winding is flipped as needed so the face points along `outward`. */
  face(points: readonly V3[], outward: V3, uvs: readonly UV[]): void {
    let order = points.map((_, i) => i);
    const n0 = cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!));
    if (dot(n0, outward) < 0) order = order.reverse();
    const n = norm(dot(n0, outward) < 0 ? [-n0[0], -n0[1], -n0[2]] : n0);
    const base = this.vertexCount;
    for (const i of order) { this.positions.push(...points[i]!); this.normals.push(...n); this.uvs.push(...uvs[i]!); }
    for (let k = 1; k < points.length - 1; k++) this.indices.push(base, base + k, base + k + 1);
  }

  toGeometry() {
    return geometry.dynamic({ positions: Float32Array.from(this.positions), normals: Float32Array.from(this.normals), uvs: Float32Array.from(this.uvs), indices: Uint32Array.from(this.indices) });
  }
}

const rot = (yaw: number) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (cx: number, cz: number, lx: number, lz: number): [number, number] => [cx + lx * c + lz * s, cz - lx * s + lz * c]; };

export interface WallOptions { readonly uTile?: number; readonly vTile?: number; readonly uOffset?: number; readonly gables?: boolean }

/** Four wall faces of a box standing on `y0`; UVs are metric (one texture tile = `uTile` x `vTile` metres, wrapped). Gable triangles go on the x ends when `gables` is set. */
export function wallBox(m: MeshData, cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, o: WallOptions = {}, rise = 0): void {
  const uT = o.uTile ?? 8, vT = o.vTile ?? 6.4, u0 = o.uOffset ?? 0;
  const at = rot(yaw);
  const corner = (lx: number, lz: number, y: number): V3 => { const [x, z] = at(cx, cz, lx, lz); return [x, y, z]; };
  const out = (lx: number, lz: number): V3 => { const [x, z] = at(0, 0, lx, lz); return [x, 0, z]; };
  const sides: { a: [number, number]; b: [number, number]; n: [number, number]; len: number }[] = [
    { a: [-w / 2, d / 2], b: [w / 2, d / 2], n: [0, 1], len: w },
    { a: [w / 2, -d / 2], b: [-w / 2, -d / 2], n: [0, -1], len: w },
    { a: [w / 2, d / 2], b: [w / 2, -d / 2], n: [1, 0], len: d },
    { a: [-w / 2, -d / 2], b: [-w / 2, d / 2], n: [-1, 0], len: d }
  ];
  sides.forEach((s, k) => {
    const ua = u0 + k * 0.37, ub = ua + s.len / uT;
    m.face([corner(s.a[0], s.a[1], y0), corner(s.b[0], s.b[1], y0), corner(s.b[0], s.b[1], y0 + h), corner(s.a[0], s.a[1], y0 + h)], out(s.n[0], s.n[1]), [[ua, y0 / vT], [ub, y0 / vT], [ub, (y0 + h) / vT], [ua, (y0 + h) / vT]]);
  });
  if (o.gables && rise > 0) {
    for (const sgn of [1, -1]) {
      const z0 = -d / 2, z1 = d / 2;
      m.face([corner(sgn * w / 2, z0, y0 + h), corner(sgn * w / 2, z1, y0 + h), corner(sgn * w / 2, 0, y0 + h + rise)], out(sgn, 0), [[u0, (y0 + h) / vT], [u0 + d / uT, (y0 + h) / vT], [u0 + d / uT / 2, (y0 + h + rise) / vT]]);
    }
  }
}

/** Gable roof with the ridge along the box's local x axis; slopes face +/- z; metric UVs (one tile = 4 m). */
export function gableRoof(m: MeshData, cx: number, y0: number, cz: number, w: number, d: number, rise: number, yaw: number, overhang = 0.7): void {
  const at = rot(yaw);
  const p = (lx: number, lz: number, y: number): V3 => { const [x, z] = at(cx, cz, lx, lz); return [x, y, z]; };
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const slope = Math.hypot(hd, rise * (hd / (d / 2)));
  const ridgeY = y0 + rise * (hd / (d / 2));
  const lenU = (2 * hw) / 4, lenV = slope / 4;
  for (const sgn of [1, -1]) {
    const [nx, nz] = at(0, 0, 0, sgn);
    m.face([p(-hw, sgn * hd, y0 - 0.15), p(hw, sgn * hd, y0 - 0.15), p(hw, 0, ridgeY), p(-hw, 0, ridgeY)], [nx * rise * 0.5, hd, nz * rise * 0.5], [[0, 0], [lenU, 0], [lenU, lenV], [0, lenV]]);
  }
}

/** Four-sided pyramid roof over a square footprint. */
export function pyramidRoof(m: MeshData, cx: number, y0: number, cz: number, side: number, rise: number, yaw: number, overhang = 0.8): void {
  const at = rot(yaw);
  const p = (lx: number, lz: number, y: number): V3 => { const [x, z] = at(cx, cz, lx, lz); return [x, y, z]; };
  const h = side / 2 + overhang;
  const apex = p(0, 0, y0 + rise);
  const base: V3[] = [p(-h, h, y0), p(h, h, y0), p(h, -h, y0), p(-h, -h, y0)];
  const slope = Math.hypot(h, rise) / 4, len = (2 * h) / 4;
  for (let i = 0; i < 4; i++) {
    const a = base[i]!, b = base[(i + 1) % 4]!;
    const mid: V3 = [(a[0] + b[0]) / 2 - cx, 0.3, (a[2] + b[2]) / 2 - cz];
    m.face([a, b, apex], mid, [[0, 0], [len, 0], [len / 2, slope]]);
  }
}

/** A flat disc facing up with metric UVs (one tile = `tile` metres). */
export function groundDisc(m: MeshData, cx: number, y: number, cz: number, radius: number, tile: number, segments = 28): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0: V3 = [cx + Math.cos(a0) * radius, y, cz + Math.sin(a0) * radius], p1: V3 = [cx + Math.cos(a1) * radius, y, cz + Math.sin(a1) * radius], c: V3 = [cx, y, cz];
    m.face([c, p0, p1], [0, 1, 0], [[cx / tile, cz / tile], [p0[0] / tile, p0[2] / tile], [p1[0] / tile, p1[2] / tile]]);
  }
}

/** A semicircular arch spanning the track (local x lateral, local z along the track) with its pillars; stone UVs. */
export function stoneArch(m: MeshData, cx: number, y0: number, cz: number, yaw: number, inner: number, thick: number, depth: number, pillarH: number): void {
  const at = rot(yaw);
  const P = (lx: number, lz: number, y: number): V3 => { const [x, z] = at(cx, cz, lx, lz); return [x, y, z]; };
  const O = (lx: number, ly: number, lz: number): V3 => { const [x, z] = at(0, 0, lx, lz); return [x, ly, z]; };
  const seg = 18, spring = y0 + pillarH, outer = inner + thick, hd = depth / 2;
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
    const ix0 = Math.cos(a0) * inner, iy0 = Math.sin(a0) * inner, ix1 = Math.cos(a1) * inner, iy1 = Math.sin(a1) * inner;
    const ox0 = Math.cos(a0) * outer, oy0 = Math.sin(a0) * outer, ox1 = Math.cos(a1) * outer, oy1 = Math.sin(a1) * outer;
    const u0 = (a0 * outer) / 4, u1 = (a1 * outer) / 4, v = depth / 4;
    const mid = (a0 + a1) / 2;
    m.face([P(ox0, -hd, spring + oy0), P(ox1, -hd, spring + oy1), P(ox1, hd, spring + oy1), P(ox0, hd, spring + oy0)], O(Math.cos(mid), Math.sin(mid), 0), [[u0, 0], [u1, 0], [u1, v], [u0, v]]);
    m.face([P(ix0, -hd, spring + iy0), P(ix1, -hd, spring + iy1), P(ix1, hd, spring + iy1), P(ix0, hd, spring + iy0)], O(-Math.cos(mid), -Math.sin(mid), 0), [[u0, 0], [u1, 0], [u1, v], [u0, v]]);
    for (const sgn of [1, -1]) {
      m.face([P(ix0, sgn * hd, spring + iy0), P(ox0, sgn * hd, spring + oy0), P(ox1, sgn * hd, spring + oy1), P(ix1, sgn * hd, spring + iy1)], O(0, 0, sgn), [[ix0 / 4, iy0 / 4], [ox0 / 4, oy0 / 4], [ox1 / 4, oy1 / 4], [ix1 / 4, iy1 / 4]]);
    }
  }
  for (const sgn of [1, -1]) {
    const lx = sgn * (inner + thick / 2);
    const [x, z] = at(cx, cz, lx, 0);
    wallBox(m, x, y0, z, thick, pillarH, depth, yaw, { uTile: 4, vTile: 4 });
  }
}

/** Axis-aligned box (all six faces, flat UVs) centred at `c`. */
export function boxAt(m: MeshData, c: V3, size: V3): void {
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const P = (sx: number, sy: number, sz: number): V3 => [c[0] + sx * hx, c[1] + sy * hy, c[2] + sz * hz];
  const uv: UV[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  m.face([P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], [0, 0, 1], uv);
  m.face([P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)], [0, 0, -1], uv);
  m.face([P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)], [1, 0, 0], uv);
  m.face([P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)], [-1, 0, 0], uv);
  m.face([P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)], [0, 1, 0], uv);
  m.face([P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], [0, -1, 0], uv);
}

/** A cylinder whose axis runs along x (a wheel): radius `r`, length `len`. */
export function cylinderX(m: MeshData, c: V3, r: number, len: number, seg = 12): void {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (x: number, a: number): V3 => [c[0] + x, c[1] + Math.cos(a) * r, c[2] + Math.sin(a) * r];
    const mid = (a0 + a1) / 2;
    m.face([p(-len / 2, a0), p(len / 2, a0), p(len / 2, a1), p(-len / 2, a1)], [0, Math.cos(mid), Math.sin(mid)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    m.face([[c[0] + len / 2, c[1], c[2]], p(len / 2, a0), p(len / 2, a1)], [1, 0, 0], [[0.5, 0.5], [0, 0], [1, 0]]);
    m.face([[c[0] - len / 2, c[1], c[2]], p(-len / 2, a0), p(-len / 2, a1)], [-1, 0, 0], [[0.5, 0.5], [0, 0], [1, 0]]);
  }
}

/** A half-elliptic roof dome along z: width `w` at y = `baseY`, rising `h`, length `len`, with end caps. */
export function roofDome(m: MeshData, baseY: number, w: number, h: number, len: number, seg = 10): void {
  const pt = (a: number, z: number): V3 => [Math.cos(a) * (w / 2), baseY + Math.sin(a) * h, z];
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg), mid = (a0 + a1) / 2;
    m.face([pt(a0, -len / 2), pt(a0, len / 2), pt(a1, len / 2), pt(a1, -len / 2)], [Math.cos(mid) / (w / 2), Math.sin(mid) / h, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    m.face([[0, baseY, len / 2], pt(a0, len / 2), pt(a1, len / 2)], [0, 0, 1], [[0.5, 0], [0, 1], [1, 1]]);
    m.face([[0, baseY, -len / 2], pt(a0, -len / 2), pt(a1, -len / 2)], [0, 0, -1], [[0.5, 0], [0, 1], [1, 1]]);
  }
}

/* ------------------------------------------------------------------ painted textures */

function canvas(size: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return { c, g: c.getContext("2d")! };
}
function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => ((s = (s * 48271) % 2147483647) - 1) / 2147483646; }
const shade = (base: number[], k: number): string => `rgb(${base.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(",")})`;

/** One tile = 8 m x 6.4 m: two bays by two storeys (ground floor: arched door + window; upper: two shuttered windows). v=1 is the top of the canvas. */
function paintFacade(emissive: boolean): HTMLCanvasElement {
  const { c, g } = canvas(512);
  const r = rng(emissive ? 91 : 17);
  g.fillStyle = emissive ? "#000" : "#fbf5ea";
  g.fillRect(0, 0, 512, 512);
  if (!emissive) {
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "120,100,80" : "255,255,255"},${0.03 + r() * 0.05})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3); }
    g.fillStyle = "rgba(90,70,55,0.35)"; g.fillRect(0, 252, 512, 4); g.fillRect(0, 0, 512, 5); g.fillRect(0, 508, 512, 4);
  }
  const window = (cx: number, cy: number, lit: boolean, shutters: boolean) => {
    const w = 76, h = 118;
    if (emissive) { if (lit) { g.fillStyle = r() < 0.5 ? "#ffd58a" : "#ffe9b8"; g.fillRect(cx - w / 2, cy - h / 2, w, h); } return; }
    g.fillStyle = "#e9dfcb"; g.fillRect(cx - w / 2 - 8, cy - h / 2 - 8, w + 16, h + 16);
    const grd = g.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2); grd.addColorStop(0, "#5f7b8c"); grd.addColorStop(1, "#27333f");
    g.fillStyle = grd; g.fillRect(cx - w / 2, cy - h / 2, w, h);
    g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(cx - w / 2 + 6, cy - h / 2 + 6, 14, h - 12);
    g.fillStyle = "#d9cdb4"; g.fillRect(cx - 2, cy - h / 2, 4, h); g.fillRect(cx - w / 2, cy - 2, w, 4);
    g.fillStyle = "#cdbf9f"; g.fillRect(cx - w / 2 - 12, cy + h / 2 + 6, w + 24, 8);
    if (shutters) for (const sx of [-1, 1]) {
      const x = sx < 0 ? cx - w / 2 - 8 - 34 : cx + w / 2 + 8;
      g.fillStyle = "#2f6a5c"; g.fillRect(x, cy - h / 2 - 8, 34, h + 16);
      g.fillStyle = "rgba(0,0,0,0.22)"; for (let k = 0; k < 8; k++) g.fillRect(x + 3, cy - h / 2 - 2 + k * 15, 28, 3);
    }
  };
  /* upper storey (canvas top half): two bays */
  window(128, 128, r() < 0.6, true); window(384, 128, r() < 0.6, true);
  /* ground storey: arched door in bay A, window in bay B */
  if (emissive) { if (r() < 0.8) window(384, 384, true, false); }
  else {
    g.fillStyle = "#e9dfcb"; g.beginPath(); g.moveTo(66, 508); g.lineTo(66, 350); g.arc(128, 350, 62, Math.PI, 0); g.lineTo(190, 508); g.fill();
    g.fillStyle = "#5a3a28"; g.beginPath(); g.moveTo(80, 508); g.lineTo(80, 352); g.arc(128, 352, 48, Math.PI, 0); g.lineTo(176, 508); g.fill();
    g.fillStyle = "rgba(0,0,0,0.25)"; for (let k = 0; k < 6; k++) g.fillRect(84 + k * 15, 340, 3, 168);
    g.fillStyle = "#d8b45a"; g.beginPath(); g.arc(162, 440, 5, 0, 7); g.fill();
    window(384, 384, true, true);
  }
  return c;
}

function paintRoof(): HTMLCanvasElement {
  const { c, g } = canvas(256);
  const r = rng(5);
  g.fillStyle = "#cfc5bb"; g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const x = col * 32 + (row % 2) * 16, y = row * 32;
    const k = 0.82 + r() * 0.2;
    g.fillStyle = shade([232, 222, 212], k); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30, y); g.lineTo(x + 30, y + 22); g.quadraticCurveTo(x + 15, y + 40, x, y + 22); g.fill();
    g.strokeStyle = "rgba(60,40,30,0.35)"; g.lineWidth = 2; g.stroke();
  }
  return c;
}

function paintCobble(): HTMLCanvasElement {
  const { c, g } = canvas(512);
  const r = rng(23);
  g.fillStyle = "#4a4338"; g.fillRect(0, 0, 512, 512);
  const rows = 12, rh = 512 / rows;
  for (let row = 0; row < rows; row++) {
    let x = -(row % 2) * 20 - r() * 20;
    while (x < 512) {
      const w = 36 + r() * 30, k = 0.78 + r() * 0.36;
      g.fillStyle = shade([150, 140, 118], k);
      g.fillRect(x + 2, row * rh + 2, w - 4, rh - 4);
      g.fillStyle = "rgba(255,255,255,0.1)"; g.fillRect(x + 3, row * rh + 3, w - 8, 3);
      g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(x + 3, row * rh + rh - 7, w - 8, 3);
      x += w;
    }
  }
  return c;
}

function paintStone(): HTMLCanvasElement {
  const { c, g } = canvas(256);
  const r = rng(41);
  g.fillStyle = "#8b8068"; g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    let x = -(row % 2) * 24;
    while (x < 256) {
      const w = 40 + r() * 28, k = 0.88 + r() * 0.2;
      g.fillStyle = shade([221, 205, 168], k); g.fillRect(x + 1.5, row * 32 + 1.5, w - 3, 29);
      x += w;
    }
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(80,60,40,${0.03 + r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  return c;
}

function paintClock(): HTMLCanvasElement {
  const { c, g } = canvas(256);
  g.fillStyle = "#d9ccaa"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#6e5a3c"; g.beginPath(); g.arc(128, 128, 108, 0, 7); g.fill();
  g.fillStyle = "#fbf6e8"; g.beginPath(); g.arc(128, 128, 98, 0, 7); g.fill();
  g.strokeStyle = "#2c2a26"; g.lineWidth = 6;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.sin(a) * 80, 128 - Math.cos(a) * 80); g.lineTo(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92); g.stroke(); }
  g.lineWidth = 9; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(2.3) * 52, 128 - Math.cos(2.3) * 52); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(0.2) * 78, 128 - Math.cos(0.2) * 78); g.stroke();
  return c;
}

export interface TownTextures {
  facade: ReturnType<typeof texture.canvas>;
  facadeEmissive: ReturnType<typeof texture.canvas>;
  roof: ReturnType<typeof texture.canvas>;
  cobble: ReturnType<typeof texture.canvas>;
  stone: ReturnType<typeof texture.canvas>;
  clock: ReturnType<typeof texture.canvas>;
}

const repeating = <T extends { wrapS: string; wrapT: string }>(t: T): T => { t.wrapS = "repeat"; t.wrapT = "repeat"; return t; };

/** Null outside a browser (the node unit tests build the scene with flat colours instead). */
export function makeTownTextures(): TownTextures | null {
  if (typeof document === "undefined") return null;
  const mk = (cv: HTMLCanvasElement, repeat = true) => { const t = texture.canvas({ canvas: cv, colorSpace: "srgb" }); return repeat ? (repeating(t as never) as typeof t) : t; };
  return { facade: mk(paintFacade(false)), facadeEmissive: mk(paintFacade(true)), roof: mk(paintRoof()), cobble: mk(paintCobble()), stone: mk(paintStone()), clock: mk(paintClock(), false) };
}
