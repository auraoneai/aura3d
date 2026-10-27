/**
 * Render-only architecture for Silt & Signal: the original's 800 box colliders become cliff faces, weathered
 * limestone with arcades, cornices and windows, and plastered houses with hipped tile roofs. Everything here is
 * pure mesh data; every vertex stays inside (or within 0.5 m of) the collider box it dresses, so physics and replay
 * are untouched. UVs are in metres, so textures keep one density on a 4 m or a 90 m wall.
 */
import type { MeshData, Wall } from "./terrain";
import { fbm } from "./terrain";

export interface ColoredMesh extends MeshData { colors: number[] }
type V3 = readonly [number, number, number];
type Rgb = readonly [number, number, number];

const newMesh = (): ColoredMesh => ({ positions: [], normals: [], uvs: [], colors: [], indices: [] });
const hash01 = (a: number, b: number, c = 0): number => {
  let h = Math.imul(Math.floor(a * 7.13) | 0, 374761393) + Math.imul(Math.floor(b * 3.77) | 0, 668265263) + Math.imul(c, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function pushVertex(m: ColoredMesh, p: V3, n: V3, uv: readonly [number, number], c: Rgb): number {
  const i = m.positions.length / 3;
  m.positions.push(p[0], p[1], p[2]);
  m.normals.push(n[0], n[1], n[2]);
  m.uvs.push(uv[0], uv[1]);
  m.colors.push(c[0], c[1], c[2], 1);
  return i;
}

interface GridFace {
  /** bottom-left corner as seen from outside, u to the right, v up; normal = u x v */
  readonly o: V3; readonly u: V3; readonly v: V3;
  readonly w: number; readonly h: number; readonly n: V3;
  readonly uSeg: number; readonly vSeg: number;
  readonly tile: number; readonly uvOffset: readonly [number, number];
  readonly color: (s: number, t: number, p: V3) => Rgb;
  readonly displace?: (s: number, t: number, p: V3) => number;
}

function gridFace(m: ColoredMesh, f: GridFace): void {
  const base = m.positions.length / 3;
  for (let j = 0; j <= f.vSeg; j++) {
    for (let i = 0; i <= f.uSeg; i++) {
      const s = i / f.uSeg, t = j / f.vSeg;
      let p: V3 = [f.o[0] + f.u[0] * f.w * s + f.v[0] * f.h * t, f.o[1] + f.u[1] * f.w * s + f.v[1] * f.h * t, f.o[2] + f.u[2] * f.w * s + f.v[2] * f.h * t];
      if (f.displace) { const d = f.displace(s, t, p); p = [p[0] - f.n[0] * d, p[1] - f.n[1] * d, p[2] - f.n[2] * d]; }
      pushVertex(m, p, f.n, [f.uvOffset[0] + (f.w * s) / f.tile, f.uvOffset[1] + (f.h * t) / f.tile], f.color(s, t, p));
    }
  }
  const row = f.uSeg + 1;
  for (let j = 0; j < f.vSeg; j++) {
    for (let i = 0; i < f.uSeg; i++) {
      const a = base + j * row + i;
      m.indices.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
    }
  }
}

/** The four vertical sides of an axis-aligned box plus its top, in world metres. */
function boxFaces(m: ColoredMesh, cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, opts: {
  readonly tile: number; readonly seg: number; readonly seed: number;
  readonly color: (face: number, s: number, y: number, p: V3) => Rgb;
  readonly displace?: (face: number, s: number, t: number, p: V3) => number;
  readonly top?: Rgb | null;
}): void {
  const up: V3 = [0, 1, 0];
  const sides: readonly { n: V3; len: number; cx: number; cz: number }[] = [
    { n: [1, 0, 0], len: hz * 2, cx: cx + hx, cz },
    { n: [-1, 0, 0], len: hz * 2, cx: cx - hx, cz },
    { n: [0, 0, 1], len: hx * 2, cx, cz: cz + hz },
    { n: [0, 0, -1], len: hx * 2, cx, cz: cz - hz }
  ];
  sides.forEach((side, face) => {
    const u = cross(up, side.n);
    const o: V3 = [side.cx - u[0] * side.len / 2, y0, side.cz - u[2] * side.len / 2];
    gridFace(m, {
      o, u, v: up, w: side.len, h: y1 - y0, n: side.n,
      uSeg: Math.max(1, Math.ceil(side.len / opts.seg)), vSeg: Math.max(1, Math.ceil((y1 - y0) / opts.seg)),
      tile: opts.tile, uvOffset: [hash01(opts.seed, face) * 7, hash01(face, opts.seed) * 7],
      color: (s, t, p) => opts.color(face, s, p[1], p),
      ...(opts.displace ? { displace: (s: number, t: number, p: V3) => opts.displace!(face, s, t, p) } : {})
    });
  });
  if (opts.top) {
    gridFace(m, {
      o: [cx - hx, y1, cz + hz], u: [1, 0, 0], v: [0, 0, -1], w: hx * 2, h: hz * 2, n: up, uSeg: 1, vSeg: 1,
      tile: opts.tile, uvOffset: [hash01(opts.seed, 9) * 7, hash01(9, opts.seed) * 7], color: () => opts.top!
    });
  }
}

const LIMESTONE: readonly Rgb[] = [[1.30, 1.16, 0.92], [1.22, 1.04, 0.78], [1.20, 0.96, 0.80], [1.12, 1.06, 0.92], [1.26, 1.08, 0.84]];
const PLASTER: readonly Rgb[] = [[0.95, 0.84, 0.66], [0.90, 0.66, 0.50], [0.78, 0.82, 0.78], [0.93, 0.78, 0.55], [0.86, 0.60, 0.46]];
const WINDOW_DARK: Rgb = [0.10, 0.085, 0.075];
const FRAME: Rgb = [0.97, 0.92, 0.82];

function weather(base: Rgb, wall: Wall, y: number, along: number, face: number): Rgb {
  const rise = y - wall.bottom;
  const grime = 0.62 + 0.38 * smooth(0, 6, rise);
  const bleach = 1 + 0.07 * smooth(0.55, 1, rise / Math.max(8, wall.top - wall.bottom));
  const streak = 0.9 + 0.13 * fbm(along * 0.35 + face * 11 + wall.x * 0.01, y * 0.04 + wall.z * 0.01, 3);
  return scale(base, grime * bleach * streak);
}

/** Flat dark rectangle for the untextured plaster houses (their material has no vertex colours). */
function darkQuad(m: ColoredMesh, centre: V3, u: V3, n: V3, w: number, h: number, lift: number): void {
  const o: V3 = [centre[0] - u[0] * w / 2 + n[0] * lift, centre[1] - h / 2, centre[2] - u[2] * w / 2 + n[2] * lift];
  gridFace(m, { o, u, v: [0, 1, 0], w, h, n, uSeg: 1, vSeg: 1, tile: 4, uvOffset: [0, 0], color: () => WINDOW_DARK });
}

/** Dark recessed rectangle with a pale frame, offset outward by `lift` metres so it never z-fights the wall. */
function windowQuad(m: ColoredMesh, centre: V3, u: V3, n: V3, w: number, h: number, lift: number): void {
  const v: V3 = [0, 1, 0];
  const add = (cw: number, ch: number, off: number, color: Rgb): void => {
    const o: V3 = [centre[0] - u[0] * cw / 2 - 0 + n[0] * off, centre[1] - ch / 2, centre[2] - u[2] * cw / 2 + n[2] * off];
    gridFace(m, { o, u, v, w: cw, h: ch, n, uSeg: 1, vSeg: 1, tile: 4, uvOffset: [0.3, 0.3], color: () => color });
  };
  add(w + 0.5, h + 0.5, lift, FRAME);
  add(w, h, lift + 0.03, WINDOW_DARK);
}

function archRelief(m: ColoredMesh, centre: V3, u: V3, n: V3, w: number, h: number, lift: number): void {
  const segs = 10, r = w / 2, spring = Math.max(0, h - r);
  const pt = (x: number, y: number, off: number): V3 => [centre[0] + u[0] * x + n[0] * off, centre[1] + y, centre[2] + u[2] * x + n[2] * off];
  const arch = (rr: number, off: number, color: Rgb, ringInner?: number): void => {
    const ring: V3[] = [];
    for (let i = 0; i <= segs; i++) { const a = Math.PI - (i / segs) * Math.PI; ring.push(pt(Math.cos(a) * rr, spring + Math.sin(a) * rr, off)); }
    if (ringInner === undefined) {
      const c = pushVertex(m, pt(0, spring * 0.5, off), n, [0.5, 0.5], color);
      const bl = pushVertex(m, pt(-rr, 0, off), n, [0, 0], color), br = pushVertex(m, pt(rr, 0, off), n, [1, 0], color);
      const ids = ring.map((p, i) => pushVertex(m, p, n, [i / segs, 1], color));
      // body: rectangle below the spring line plus the half-disc, as a fan about the centre (orientation u x up = n)
      m.indices.push(c, bl, br);
      m.indices.push(c, br, ids[segs]!);
      for (let i = segs; i > 0; i--) m.indices.push(c, ids[i]!, ids[i - 1]!);
      m.indices.push(c, ids[0]!, bl);
    } else {
      const inner: V3[] = [];
      for (let i = 0; i <= segs; i++) { const a = Math.PI - (i / segs) * Math.PI; inner.push(pt(Math.cos(a) * ringInner, spring + Math.sin(a) * ringInner, off)); }
      const o = ring.map((p, i) => pushVertex(m, p, n, [i / segs, 1], color));
      const q = inner.map((p, i) => pushVertex(m, p, n, [i / segs, 0], color));
      for (let i = 0; i < segs; i++) m.indices.push(q[i]!, q[i + 1]!, o[i + 1]!, q[i]!, o[i + 1]!, o[i]!);
    }
  };
  arch(r + 0.55, lift, FRAME, r);
  arch(r, lift + 0.03, WINDOW_DARK);
}

const isAqueduct = (w: Wall): boolean => {
  const long = Math.max(w.halfX, w.halfZ) * 2, thin = Math.min(w.halfX, w.halfZ) * 2, h = w.top - w.bottom;
  return long >= 18 && thin <= 8 && h >= 9 && h <= 70;
};

export interface ArchitectureMeshes { readonly cliff: ColoredMesh; readonly stone: ColoredMesh; readonly plaster: readonly ColoredMesh[]; readonly roofs: ColoredMesh; readonly dark: ColoredMesh; readonly plasterHues: readonly Rgb[] }

export function buildArchitecture(walls: readonly Wall[]): ArchitectureMeshes {
  const cliff = newMesh(), stone = newMesh(), roofs = newMesh(), dark = newMesh();
  const plasterMeshes = PLASTER.map(() => newMesh());
  let windows = 0;
  for (const w of walls) {
    const seed = Math.floor(w.x * 13 + w.z * 7);
    const h = w.top - w.bottom;
    if (w.kind === "cliff") {
      const sand: Rgb = [1.15, 0.95, 0.74], deep: Rgb = [0.8, 0.64, 0.5], moss: Rgb = [0.75, 0.8, 0.52];
      boxFaces(cliff, w.x, w.z, w.halfX, w.halfZ, w.bottom, w.top, {
        tile: 14, seg: 7, seed, top: moss,
        color: (face, s, y) => {
          const band = 0.5 + 0.5 * Math.sin(y * 0.55 + fbm(s * 9 + face, y * 0.03, 2) * 6);
          const c = mix(deep, sand, 0.35 + 0.5 * band);
          return scale(c, 0.6 + 0.4 * smooth(w.bottom, w.bottom + 18, y));
        },
        displace: (face, s, t, p) => {
          const edge = Math.min(s, 1 - s, t * h / 8);
          if (edge <= 0 || t >= 0.999) return 0;
          const ledge = Math.floor((p[1] - w.bottom) / 5) * 0.12;
          return Math.min(1.3, (fbm(p[0] * 0.045 + face, p[2] * 0.045 + p[1] * 0.03, 3) * 1.1 + ledge) * smooth(0, 0.08, edge));
        }
      });
      continue;
    }
    if (w.kind === "plaster") {
      const hueIndex = Math.floor(hash01(w.x, w.z) * PLASTER.length);
      const hue = PLASTER[hueIndex]!;
      const plaster = plasterMeshes[hueIndex]!;
      const eave = Math.min(1.9, h * 0.32);
      const bodyTop = w.top - eave;
      boxFaces(plaster, w.x, w.z, w.halfX, w.halfZ, w.bottom, bodyTop, {
        tile: 6, seg: 6, seed, top: null,
        color: (face, s, y, p) => weather(hue, w, y, face % 2 ? p[0] : p[2], face)
      });
      const roofColor: Rgb = mix([0.62, 0.30, 0.20], [0.74, 0.40, 0.26], hash01(w.z, w.x));
      const inset = 0.28;
      const x0 = w.halfX + 0.45, z0 = w.halfZ + 0.45, x1 = Math.max(0.2, w.halfX * inset), z1 = Math.max(0.2, w.halfZ * inset);
      const corners: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const lowRing = corners.map(([sx, sz]) => [w.x + sx * x0, bodyTop - 0.1, w.z + sz * z0] as V3);
      const highRing = corners.map(([sx, sz]) => [w.x + sx * x1, w.top, w.z + sz * z1] as V3);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const a = lowRing[i]!, b = lowRing[j]!, c = highRing[j]!, d = highRing[i]!;
        const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        const nn = cross(e1, e2);
        const len = Math.hypot(nn[0], nn[1], nn[2]) || 1;
        const n: V3 = [nn[0] / len, nn[1] / len, nn[2] / len];
        const mid: V3 = [(a[0] + b[0] + c[0] + d[0]) / 4, 0, (a[2] + b[2] + c[2] + d[2]) / 4];
        const flip = (mid[0] - w.x) * n[0] + (mid[2] - w.z) * n[2] < 0 ? -1 : 1;
        const nrm: V3 = [n[0] * flip, n[1] * flip, n[2] * flip];
        const ia = pushVertex(roofs, a, nrm, [0, 0], roofColor), ib = pushVertex(roofs, b, nrm, [Math.hypot(e1[0], e1[2]) / 3, 0], roofColor);
        const ic = pushVertex(roofs, c, nrm, [Math.hypot(e1[0], e1[2]) / 3 * 0.5, Math.hypot(e2[0], e2[1], e2[2]) / 3], roofColor);
        const id = pushVertex(roofs, d, nrm, [Math.hypot(e1[0], e1[2]) / 3 * 0.5, Math.hypot(e2[0], e2[1], e2[2]) / 3], roofColor);
        if (flip > 0) roofs.indices.push(ia, ib, ic, ia, ic, id); else roofs.indices.push(ia, ic, ib, ia, id, ic);
      }
      // windows and one door on the long faces
      const longX = w.halfX >= w.halfZ;
      for (const sign of [1, -1]) {
        const n: V3 = longX ? [0, 0, sign] : [sign, 0, 0];
        const u = cross([0, 1, 0], n);
        const faceLen = (longX ? w.halfX : w.halfZ) * 2;
        const off = longX ? w.halfZ : w.halfX;
        const count = Math.floor((faceLen - 1.2) / 3);
        for (let k = 0; k < count && windows < 5200; k++) {
          const t = (k + 0.5) / count - 0.5;
          const centre: V3 = [w.x + (longX ? t * faceLen : 0) + n[0] * off, w.bottom + Math.min(3.4, (bodyTop - w.bottom) * 0.58), w.z + (longX ? 0 : t * faceLen) + n[2] * off];
          const door = sign > 0 && k === Math.floor(count / 2);
          darkQuad(dark, door ? [centre[0], w.bottom + 1.2, centre[2]] : centre, u, n, door ? 1.3 : 1.0, door ? 2.4 : 1.4, 0.05);
          windows++;
        }
      }
      continue;
    }
    // stone: aqueduct arcades and building masses
    const hue = LIMESTONE[Math.floor(hash01(w.x, w.z, 3) * LIMESTONE.length)]!;
    const aqueduct = isAqueduct(w);
    const plinthH = h >= 6 ? 1.3 : 0;
    boxFaces(stone, w.x, w.z, w.halfX, w.halfZ, w.bottom, w.top, {
      tile: 4.5, seg: 8, seed, top: scale(hue, 1.08),
      color: (face, s, y, p) => weather(hue, w, y, face % 2 ? p[0] : p[2], face)
    });
    if (h >= 6) {
      const trim = scale(hue, 1.06);
      boxFaces(stone, w.x, w.z, w.halfX + 0.3, w.halfZ + 0.3, w.top - 0.8, w.top + 0.0, { tile: 3, seg: 12, seed: seed + 1, top: null, color: () => trim });
      boxFaces(stone, w.x, w.z, w.halfX + 0.25, w.halfZ + 0.25, w.bottom, w.bottom + plinthH, { tile: 3, seg: 12, seed: seed + 2, top: null, color: () => scale(hue, 0.7) });
    }
    if (h < 8) continue;
    const baseY = Math.max(w.bottom, 0);
    const sides: readonly { n: V3; len: number; off: number }[] = [
      { n: [1, 0, 0], len: w.halfZ * 2, off: w.halfX }, { n: [-1, 0, 0], len: w.halfZ * 2, off: w.halfX },
      { n: [0, 0, 1], len: w.halfX * 2, off: w.halfZ }, { n: [0, 0, -1], len: w.halfX * 2, off: w.halfZ }
    ];
    for (const side of sides) {
      const u = cross([0, 1, 0], side.n);
      if (side.len < 8 || Math.min(w.halfX, w.halfZ) * 2 < 5) continue;
      const faceCentre = (t: number, y: number): V3 => [w.x + (side.n[0] ? side.n[0] * side.off : u[0] * t), y, w.z + (side.n[2] ? side.n[2] * side.off : u[2] * t)];
      if (aqueduct) {
        if (side.len < 14) continue;
        const archW = 6.4, step = 9;
        const count = Math.floor((side.len - 3) / step);
        const archH = Math.min(14, (w.top - baseY) * 0.6);
        for (let k = 0; k < count && windows < 5200; k++) {
          const t = (k + 0.5 - count / 2) * step;
          archRelief(stone, faceCentre(t, baseY + 1.3), u, side.n, archW, archH, 0.06);
          windows++;
        }
      } else {
        const cols = Math.floor((side.len - 2) / 7);
        const rows = Math.min(10, Math.floor((w.top - baseY - 5) / 8));
        for (let r = 0; r < rows && windows < 5200; r++) {
          for (let c = 0; c < cols; c++) {
            const t = (c + 0.5 - cols / 2) * 7;
            const y = baseY + 5 + r * 8;
            windowQuad(stone, faceCentre(t, y), u, side.n, 2.4, 3.6, 0.06);
            windows++;
          }
        }
      }
    }
  }
  return { cliff, stone, plaster: plasterMeshes, roofs, dark, plasterHues: PLASTER };
}

/** Per-vertex multipliers on the grass texture: dry silt patches, darker damp hollows, soft noise. */
export function terrainColors(positions: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    const dry = smooth(0.46, 0.64, fbm(x * 0.0065 + 11.3, z * 0.0065 - 4.1, 4));
    const fine = 0.92 + 0.16 * fbm(x * 0.05, z * 0.05, 3);
    const silt: Rgb = [2.05, 1.72, 1.2], green: Rgb = [1.0, 1.04, 0.9];
    const c = scale(mix(green, silt, dry * 0.8), fine * (0.9 + 0.1 * smooth(-1, 6, y)));
    out.push(c[0], c[1], c[2], 1);
  }
  return out;
}

/** A ring of distant dunes and mesas that gives the horizon a silhouette; vertex colours fade into the haze. */
export function farDunes(cx: number, cz: number, innerR: number, outerR: number, haze: Rgb): ColoredMesh {
  const m = newMesh();
  const A = 160, R = 6;
  for (let r = 0; r <= R; r++) {
    for (let a = 0; a <= A; a++) {
      const t = r / R, ang = (a / A) * Math.PI * 2;
      const rad = innerR + (outerR - innerR) * t;
      const x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad;
      const ridge = fbm(Math.cos(ang) * 3 + 20, Math.sin(ang) * 3 + 5, 4);
      const mesa = smooth(0.58, 0.64, fbm(Math.cos(ang) * 6 + 3, Math.sin(ang) * 6 - 8, 3)) * 90;
      const height = (r === 0 ? -20 : 25 + ridge * 190 * Math.sin(Math.min(1, t * 2.2) * Math.PI / 2) + mesa * smooth(0.1, 0.5, t)) - (r === R ? 40 : 0);
      const c = mix([0.74, 0.58, 0.44], haze, 0.55 + 0.4 * t);
      pushVertex(m, [x, height, z], [0, 1, 0], [x / 120, z / 120], scale(c, 0.85 + 0.25 * ridge));
    }
  }
  const row = A + 1;
  for (let r = 0; r < R; r++) for (let a = 0; a < A; a++) { const i = r * row + a; m.indices.push(i, i + row, i + 1, i + 1, i + row, i + row + 1); }
  // smooth normals from the height field
  const P = m.positions, N = new Array<number>(P.length).fill(0);
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!];
    const e1: V3 = [P[b * 3]! - P[a * 3]!, P[b * 3 + 1]! - P[a * 3 + 1]!, P[b * 3 + 2]! - P[a * 3 + 2]!];
    const e2: V3 = [P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!];
    const n = cross(e1, e2);
    for (const v of [a, b, c]) { N[v * 3] = N[v * 3]! + n[0]; N[v * 3 + 1] = N[v * 3 + 1]! + n[1]; N[v * 3 + 2] = N[v * 3 + 2]! + n[2]; }
  }
  for (let v = 0; v < N.length; v += 3) {
    let nx = N[v]!, ny = N[v + 1]!, nz = N[v + 2]!;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    m.normals[v] = nx / l; m.normals[v + 1] = ny / l; m.normals[v + 2] = nz / l;
  }
  // winding: make triangles face up
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!];
    const e1: V3 = [P[b * 3]! - P[a * 3]!, P[b * 3 + 1]! - P[a * 3 + 1]!, P[b * 3 + 2]! - P[a * 3 + 2]!];
    const e2: V3 = [P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!];
    if (cross(e1, e2)[1] < 0) { m.indices[i + 1] = c; m.indices[i + 2] = b; }
  }
  return m;
}
