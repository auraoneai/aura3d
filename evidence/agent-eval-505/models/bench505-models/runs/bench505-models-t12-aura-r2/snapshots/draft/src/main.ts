import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  instances,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { ready: boolean; branchCount: number; foliageClumpCount: number; seed: number };
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];
type RGB = [number, number, number];

// ---------------------------------------------------------------- parameters
const query = new URLSearchParams(window.location.search);
const seedParam = query.get("seed");
const SEED = seedParam !== null && seedParam !== "" && Number.isFinite(Number(seedParam)) ? Number(seedParam) >>> 0 : 20240612;
const SEASON: "autumn" | "summer" = query.get("season") === "summer" ? "summer" : "autumn";

// ---------------------------------------------------------------- math helpers
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l < 1e-9 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
const hex = (h: string): RGB => {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
};
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const shadeRgb = (c: RGB, k: number): RGB => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

// ---------------------------------------------------------------- mesh accumulator (vertex colours are written as linear)
class Mesh {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  min: V3 = [Infinity, Infinity, Infinity];
  max: V3 = [-Infinity, -Infinity, -Infinity];
  maxHoriz = 0;
  get count(): number {
    return this.pos.length / 3;
  }
  vertex(p: V3, n: V3, c: RGB): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(toLinear(c[0]), toLinear(c[1]), toLinear(c[2]), 1);
    for (let k = 0; k < 3; k += 1) {
      if (p[k] < this.min[k]) this.min[k] = p[k];
      if (p[k] > this.max[k]) this.max[k] = p[k];
    }
    this.maxHoriz = Math.max(this.maxHoriz, Math.hypot(p[0], p[2]));
    return this.count - 1;
  }
  spec() {
    const pad = 0.05;
    return geometry.define({
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nor),
      colors: new Float32Array(this.col),
      indices: this.idx,
      bounds: {
        min: [this.min[0] - pad, this.min[1] - pad, this.min[2] - pad],
        max: [this.max[0] + pad, this.max[1] + pad, this.max[2] + pad]
      }
    });
  }
}

/** Sweeps a ring along a path (parallel-transport frame) to build a tapered tube, closed with a domed tip. */
function addTube(
  m: Mesh,
  path: V3[],
  sides: number,
  radius: (t: number, dir: V3, p: V3) => number,
  color: (t: number, dir: V3, p: V3) => RGB
): void {
  const n = path.length;
  const tans = path.map((_, i) => norm(sub(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)])));
  let nrm = norm(cross(tans[0], Math.abs(tans[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const base = m.count;
  let lastRing: number[] = [];
  let lastT: V3 = tans[n - 1];
  let lastR = 0;
  for (let i = 0; i < n; i += 1) {
    const T = tans[i];
    if (i > 0) nrm = norm(sub(nrm, mul(T, dot(nrm, T))));
    const bin = cross(T, nrm);
    const t = i / (n - 1);
    lastRing = [];
    for (let j = 0; j < sides; j += 1) {
      const th = (j / sides) * Math.PI * 2;
      const dir = add(mul(nrm, Math.cos(th)), mul(bin, Math.sin(th)));
      const r = radius(t, dir, path[i]);
      lastR = r;
      lastRing.push(m.vertex(add(path[i], mul(dir, r)), dir, color(t, dir, path[i])));
    }
    lastT = T;
  }
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = base + i * sides + j;
      const b = base + i * sides + ((j + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      m.idx.push(a, b, c, b, d, c);
    }
  }
  // domed end cap with its own vertices so the shading is smooth
  const tip = path[n - 1];
  const capColor = color(1, lastT, tip);
  const centre = m.vertex(add(tip, mul(lastT, lastR * 0.6)), lastT, capColor);
  const ring = lastRing.map((vi) => {
    const p: V3 = [m.pos[vi * 3], m.pos[vi * 3 + 1], m.pos[vi * 3 + 2]];
    const radial = norm(sub(p, tip));
    return m.vertex(p, norm(add(mul(radial, 0.6), mul(lastT, 0.8))), capColor);
  });
  for (let j = 0; j < sides; j += 1) m.idx.push(centre, ring[j], ring[(j + 1) % sides]);
}

/** Lumpy ellipsoid used for leaf clump lobes. */
function addBlob(m: Mesh, c: V3, rad: number, squash: number, rng: () => number, tones: RGB[], toneIdx: number): void {
  const lat = 7;
  const lon = 10;
  const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const toneA = tones[toneIdx % tones.length];
  const toneB = tones[(toneIdx + 1) % tones.length];
  const base = m.count;
  for (let i = 0; i <= lat; i += 1) {
    const phi = (Math.PI * i) / lat;
    for (let j = 0; j < lon; j += 1) {
      const th = (Math.PI * 2 * j) / lon;
      const n: V3 = [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
      const k = 1 + 0.16 * Math.sin(n[0] * 3.1 + ph[0]) * Math.sin(n[1] * 2.7 + ph[1]) + 0.1 * Math.sin(n[2] * 4.3 + ph[2]);
      const p: V3 = [c[0] + n[0] * rad * k, c[1] + n[1] * rad * k * squash, c[2] + n[2] * rad * k];
      const patch = 0.5 + 0.5 * Math.sin(n[0] * 5 + n[2] * 3 + ph[1]);
      const tone = mixRgb(toneA, toneB, patch * 0.4);
      const light = 0.66 + 0.46 * (0.5 + 0.5 * n[1]) + 0.05 * Math.sin(n[2] * 7 + ph[0]);
      m.vertex(p, n, shadeRgb(tone, light));
    }
  }
  for (let i = 0; i < lat; i += 1) {
    for (let j = 0; j < lon; j += 1) {
      const a = base + i * lon + j;
      const cc = base + i * lon + ((j + 1) % lon);
      const b = base + (i + 1) * lon + j;
      const d = base + (i + 1) * lon + ((j + 1) % lon);
      m.idx.push(a, cc, b, b, cc, d);
    }
  }
}

// ---------------------------------------------------------------- ground
const MOUND_R = 8.5;
const H0 = 1.0; // mound height at the trunk
const moundH = (x: number, z: number): number => {
  const r = Math.hypot(x, z) / MOUND_R;
  if (r >= 1) return 0;
  return Math.pow(1 - r * r, 1.5) * H0 + 0.04 * Math.sin(x * 1.3) * Math.cos(z * 1.1) * (1 - r);
};
const GRASS_RIM = hex(SEASON === "autumn" ? "#6f8f3a" : "#4f8f34");
const GRASS_TOP = hex(SEASON === "autumn" ? "#98ad46" : "#74b03f");
const SOIL = hex("#5c4630");

function buildMound(): Mesh {
  const m = new Mesh();
  const cells = 84;
  const half = 9;
  for (let j = 0; j <= cells; j += 1) {
    for (let i = 0; i <= cells; i += 1) {
      const x = (i / cells - 0.5) * half * 2;
      const z = (j / cells - 0.5) * half * 2;
      const h = moundH(x, z);
      const e = 0.15;
      const nx = moundH(x - e, z) - moundH(x + e, z);
      const nz = moundH(x, z - e) - moundH(x, z + e);
      const l = Math.hypot(nx, 2 * e, nz);
      const r = Math.hypot(x, z) / MOUND_R;
      const top = smooth(1 - r * 1.1);
      const patch = 0.5 + 0.5 * Math.sin(x * 0.9 + 1.2) * Math.sin(z * 1.1 - 0.4);
      let c = mixRgb(GRASS_RIM, GRASS_TOP, top);
      c = shadeRgb(c, 0.92 + 0.14 * patch * top);
      c = mixRgb(c, SOIL, 0.55 * (1 - smooth(Math.hypot(x, z) / 1.9)));
      m.vertex([x, h, z], [nx / l, (2 * e) / l, nz / l], c);
    }
  }
  const stride = cells + 1;
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      const v = j * stride + i;
      m.idx.push(v, v + stride, v + 1, v + 1, v + stride, v + stride + 1);
    }
  }
  return m;
}

// ---------------------------------------------------------------- tree generation (seeded)
interface Branch {
  name: string;
  level: 0 | 1 | 2 | 3; // 0 trunk, 1 major limb, 2 branch, 3 twig
  pts: V3[];
  r0: number;
  r1: number;
}
interface Clump {
  pos: V3;
  radius: number;
}

const pointAt = (b: Branch, t: number): V3 => {
  const f = Math.min(Math.max(t, 0), 1) * (b.pts.length - 1);
  const i = Math.min(Math.floor(f), b.pts.length - 2);
  const u = f - i;
  return add(mul(b.pts[i], 1 - u), mul(b.pts[i + 1], u));
};
const dirAt = (b: Branch, t: number): V3 => {
  const f = Math.min(Math.max(t, 0), 1) * (b.pts.length - 1);
  const i = Math.min(Math.floor(f), b.pts.length - 2);
  return norm(sub(b.pts[i + 1], b.pts[i]));
};
const radiusAt = (b: Branch, t: number): number => lerp(b.r0, b.r1, t);
const UP: V3 = [0, 1, 0];

function growPath(rng: () => number, start: V3, dir: V3, length: number, segs: number, upBias: number, wobble: number): V3[] {
  const pts: V3[] = [start];
  let d = norm(dir);
  let p = start;
  const step = length / segs;
  for (let s = 0; s < segs; s += 1) {
    d = norm(add(d, [(rng() - 0.5) * wobble, (rng() - 0.5) * wobble * 0.6 + upBias, (rng() - 0.5) * wobble]));
    p = add(p, mul(d, step));
    pts.push(p);
  }
  return pts;
}

function childDir(parent: Branch, t: number, alpha: number, beta: number, upPull: number): V3 {
  const d = dirAt(parent, t);
  let p1 = cross(d, UP);
  if (Math.hypot(p1[0], p1[1], p1[2]) < 0.1) p1 = cross(d, [1, 0, 0]);
  p1 = norm(p1);
  const p2 = cross(d, p1);
  const out = add(add(mul(d, Math.cos(alpha)), mul(p1, Math.sin(alpha) * Math.cos(beta))), mul(p2, Math.sin(alpha) * Math.sin(beta)));
  return norm(add(out, [0, upPull, 0]));
}

const TRUNK_LEN = 5.6;
const ROOT_COUNT = 7;
const AZ0 = 0.5; // initial camera azimuth; the knot hole faces it

function generateTree(seed: number) {
  const rng = mulberry32(seed);
  const branches: Branch[] = [];
  const clumps: Clump[] = [];
  const roots: Branch[] = [];

  // trunk: gentle S-curve, buried 0.3 below the mound top
  const p1 = rng() * 6.28;
  const p2 = rng() * 6.28;
  const trunkPts: V3[] = [];
  const trunkSegs = 24;
  for (let i = 0; i <= trunkSegs; i += 1) {
    const u = i / trunkSegs;
    trunkPts.push([0.45 * u * Math.sin(u * 2.6 + p1), H0 - 0.3 + u * TRUNK_LEN, 0.35 * u * Math.sin(u * 2.2 + p2)]);
  }
  const trunk: Branch = { name: "trunk", level: 0, pts: trunkPts, r0: 0.6, r1: 0.24 };
  branches.push(trunk);
  clumps.push({ pos: add(trunkPts[trunkSegs], [0.1, 0.5, 0]), radius: 1.5 });
  clumps.push({ pos: add(trunkPts[trunkSegs - 3], [-0.9, 0.6, 0.5]), radius: 1.3 });

  // major limbs fanning round the trunk at the golden angle; limb 0 is the near-horizontal swing limb
  const limbU = [0.4, 0.5, 0.58, 0.66, 0.74, 0.83, 0.92];
  const limbs: Branch[] = [];
  const swingAz = AZ0 - Math.PI / 2;
  for (let k = 0; k < limbU.length; k += 1) {
    const u = limbU[k];
    const az = swingAz + k * 2.399 + (k === 0 ? 0 : (rng() - 0.5) * 0.3);
    const elev = k === 0 ? 0.16 : k < 3 ? 0.3 + rng() * 0.2 : k < 5 ? 0.6 + rng() * 0.2 : 0.95 + rng() * 0.15;
    const len = k === 0 ? 3.9 : (3.7 - 1.9 * u) * (0.9 + rng() * 0.2);
    const dir: V3 = [Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)];
    const start = pointAt(trunk, u);
    const pts = growPath(rng, start, dir, len, 6, k === 0 ? 0.03 : k < 3 ? 0.07 : 0.03, k === 0 ? 0.08 : 0.22);
    const r0 = radiusAt(trunk, u) * 0.68;
    const limb: Branch = { name: `limb-${k}`, level: 1, pts, r0, r1: r0 * 0.22 };
    limbs.push(limb);
    branches.push(limb);
    const end = pts[pts.length - 1];
    clumps.push({ pos: add(end, [0, 0.2, 0]), radius: 1.0 + rng() * 0.35 });
  }

  // second-level branches and twigs
  let subIndex = 0;
  let twigIndex = 0;
  for (const limb of limbs) {
    const limbLen = Math.hypot(...sub(limb.pts[limb.pts.length - 1], limb.pts[0]));
    for (let j = 0; j < 3; j += 1) {
      const t = [0.36, 0.62, 0.86][j] + (rng() - 0.5) * 0.08;
      const dir = childDir(limb, t, 0.6 + rng() * 0.35, j * 2.1 + rng() * 0.8 + subIndex, 0.35);
      const len = limbLen * (0.46 - 0.08 * j + rng() * 0.1);
      const pts = growPath(rng, pointAt(limb, t), dir, len, 5, 0.06, 0.3);
      const r0 = radiusAt(limb, t) * 0.62;
      const sub2: Branch = { name: `branch-${subIndex}`, level: 2, pts, r0, r1: r0 * 0.25 };
      subIndex += 1;
      branches.push(sub2);
      clumps.push({ pos: add(pts[pts.length - 1], [0, 0.1, 0]), radius: 0.8 + rng() * 0.4 });
      for (let q = 0; q < 2; q += 1) {
        const tt = [0.45, 0.8][q] + (rng() - 0.5) * 0.1;
        const tdir = childDir(sub2, tt, 0.5 + rng() * 0.4, q * 3.1 + rng() * 1.2 + twigIndex, 0.3);
        const tlen = 0.8 + rng() * 0.5;
        const tpts = growPath(rng, pointAt(sub2, tt), tdir, tlen, 4, 0.05, 0.35);
        const tr0 = radiusAt(sub2, tt) * 0.6;
        const twig: Branch = { name: `twig-${twigIndex}`, level: 3, pts: tpts, r0: tr0, r1: 0.02 };
        twigIndex += 1;
        branches.push(twig);
        clumps.push({ pos: add(tpts[tpts.length - 1], [0, 0.05, 0]), radius: 0.58 + rng() * 0.45 });
      }
    }
  }

  // surface roots, aligned with the lobes of the trunk flare
  const rootPhase = rng() * 6.28;
  for (let k = 0; k < ROOT_COUNT; k += 1) {
    const a0 = rootPhase + (k * Math.PI * 2) / ROOT_COUNT + (rng() - 0.5) * 0.08;
    const length = 2.0 + rng() * 1.1;
    const rr0 = 0.4 + rng() * 0.12;
    const wig = rng() * 6;
    const pts: V3[] = [];
    const segs = 9;
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      const a = a0 + 0.25 * Math.sin(t * 3 + wig);
      const R = 0.8 + length * Math.pow(t, 0.95);
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      const r = rr0 * (1 - Math.pow(t, 0.8)) + 0.05;
      const lift = 1.4 * Math.pow(1 - t, 1.2) - 0.9 * t * t;
      pts.push([x, moundH(x, z) + r * lift, z]);
    }
    roots.push({ name: `root-${k}`, level: 1, pts, r0: rr0 + 0.05, r1: 0.05 });
  }
  return { rng, branches, clumps, roots, rootPhase, limbs, trunk };
}

// ---------------------------------------------------------------- build the scene content
const tree = generateTree(SEED);
const rng = tree.rng;
const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];

const woodMat = material.pbr({ color: "#ffffff", roughness: 0.93 });
const BARK = hex("#6a4a33");
const BARK_LIGHT = hex("#8a6a48");
const MOSS = hex("#5d6b34");

let maxY = 0;
let maxHoriz = 0;
const track = (m: Mesh): void => {
  maxY = Math.max(maxY, m.max[1]);
  maxHoriz = Math.max(maxHoriz, m.maxHoriz);
};

for (const b of tree.branches) {
  const m = new Mesh();
  const sides = b.level === 0 ? 18 : b.level === 1 ? 10 : b.level === 2 ? 7 : 5;
  const base = b.level === 3 ? BARK_LIGHT : b.level === 2 ? mixRgb(BARK, BARK_LIGHT, 0.5) : BARK;
  addTube(
    m,
    b.pts,
    sides,
    (t, dir, p) => {
      let r = radiusAt(b, t);
      if (b.level === 0) {
        const s = Math.max(0, p[1] - H0);
        const phi = Math.atan2(dir[2], dir[0]);
        const flare = 1 + 1.15 * Math.exp(-s * 2.4);
        const lobes = 1 + 0.22 * Math.cos(ROOT_COUNT * (phi - tree.rootPhase)) * Math.exp(-s * 1.4);
        r *= flare * lobes * (1 + 0.03 * Math.sin(13 * phi + s * 1.3));
      }
      return r;
    },
    (t, dir, p) => {
      const phi = Math.atan2(dir[2], dir[0]);
      const ridge = 0.86 + 0.22 * (0.5 + 0.5 * Math.sin(11 * phi + p[1] * 1.7 + t * 4));
      let c = shadeRgb(base, ridge);
      if (b.level === 0) c = mixRgb(c, MOSS, 0.45 * (1 - smooth((p[1] - H0) / 1.2)));
      return c;
    }
  );
  track(m);
  nodes.push(geometry.custom(m.spec(), { name: `branch-${b.name}`, material: woodMat, castShadow: true, receiveShadow: true }));
}
for (const b of tree.roots) {
  const m = new Mesh();
  addTube(
    m,
    b.pts,
    8,
    (t) => radiusAt(b, t),
    (t, dir) => {
      const ridge = 0.86 + 0.2 * (0.5 + 0.5 * Math.sin(9 * Math.atan2(dir[2], dir[0]) + t * 6));
      return mixRgb(shadeRgb(BARK, ridge), MOSS, 0.3 * (1 - t));
    }
  );
  track(m);
  nodes.push(geometry.custom(m.spec(), { name: `branch-${b.name}`, material: woodMat, castShadow: true, receiveShadow: true }));
}

// foliage clumps: each one is a single mesh made of 3 to 4 lumpy lobes
const TONES: RGB[] =
  SEASON === "autumn"
    ? ["#d9531e", "#e88b1c", "#f0b52f", "#b3301f", "#9aa332"].map(hex)
    : ["#2f7a35", "#4c9c41", "#6dba4d", "#25622e", "#8bc858"].map(hex);
const leafMat = material.pbr({ color: "#ffffff", roughness: 0.82 });
tree.clumps.forEach((c, i) => {
  const m = new Mesh();
  const toneIdx = Math.floor(rng() * TONES.length);
  addBlob(m, c.pos, c.radius, 0.82, rng, TONES, toneIdx);
  const lobes = 2 + Math.floor(rng() * 2);
  for (let l = 0; l < lobes; l += 1) {
    const a = rng() * Math.PI * 2;
    const rr = c.radius * (0.55 + rng() * 0.2);
    const off: V3 = [Math.cos(a) * c.radius * 0.6, (rng() - 0.55) * c.radius * 0.45, Math.sin(a) * c.radius * 0.6];
    addBlob(m, add(c.pos, off), rr, 0.85, rng, TONES, toneIdx + (rng() < 0.5 ? 1 : 0));
  }
  track(m);
  nodes.push(geometry.custom(m.spec(), { name: `foliage-clump-${i}`, material: leafMat, castShadow: true, receiveShadow: true }));
});

// knot hole on the trunk, facing the starting camera
{
  const t = (1.75 + 0.3) / TRUNK_LEN;
  const c = pointAt(tree.trunk, t);
  const out: V3 = [Math.sin(AZ0), 0, Math.cos(AZ0)];
  const r = radiusAt(tree.trunk, t);
  const rim = add(c, mul(out, r * 0.86));
  const hole = add(c, mul(out, r * 0.93));
  nodes.push(
    primitives.sphere({ name: "knot-rim", position: rim, rotation: [0, AZ0, 0], scale: [0.78, 1.02, 0.3], material: material.pbr({ color: "#8c6a45", roughness: 0.95 }), castShadow: false })
  );
  nodes.push(
    primitives.sphere({ name: "trunk-hollow", position: hole, rotation: [0, AZ0, 0], scale: [0.5, 0.74, 0.3], material: material.pbr({ color: "#1b110a", roughness: 1 }), castShadow: false })
  );
}

// rope swing hanging from the near-horizontal limb
{
  const limb = tree.limbs[0];
  const P = pointAt(limb, 0.64);
  const d = dirAt(limb, 0.64);
  let perp = norm(cross([d[0], 0, d[2]], UP));
  if (Math.hypot(perp[0], perp[2]) < 0.1) perp = [1, 0, 0];
  const seatY = moundH(P[0], P[2]) + 0.95;
  const topY = P[1] - radiusAt(limb, 0.64) * 0.7;
  const ropeLen = Math.max(1.2, topY - seatY);
  const ropeMat = material.pbr({ color: "#cdaa6d", roughness: 1 });
  const yaw = Math.atan2(-perp[2], perp[0]);
  for (const side of [-1, 1]) {
    const x = P[0] + perp[0] * 0.27 * side;
    const z = P[2] + perp[2] * 0.27 * side;
    nodes.push(primitives.cylinder({ name: `rope-${side < 0 ? "a" : "b"}`, position: [x, topY - ropeLen / 2, z], scale: [0.07, ropeLen, 0.07], material: ropeMat, castShadow: true }));
  }
  nodes.push(
    primitives.box({ name: "swing-seat", position: [P[0], seatY - 0.03, P[2]], rotation: [0, yaw, 0], scale: [0.7, 0.07, 0.26], material: material.pbr({ color: "#8a5a33", roughness: 0.9 }), castShadow: true })
  );
}

// ground: mound mesh, wide plane that fades into the horizon fog, grass tufts, fallen leaves, mushrooms
const moundMesh = buildMound();
nodes.push(geometry.custom(moundMesh.spec(), { name: "mound", material: material.pbr({ color: "#ffffff", roughness: 1 }), castShadow: false, receiveShadow: true }));
const rimCss = `#${GRASS_RIM.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
nodes.push(primitives.plane({ name: "ground", position: [0, -0.01, 0], size: [900, 1, 900], material: material.pbr({ color: rimCss, roughness: 1 }), castShadow: false, receiveShadow: true }));

const diceRng = mulberry32(SEED ^ 0x9e3779b9); // separate stream so ground dressing never shifts the tree
const pickRing = (rMin: number, rMax: number): [number, number] => {
  const a = diceRng() * Math.PI * 2;
  const r = rMin + (rMax - rMin) * Math.sqrt(diceRng());
  return [Math.cos(a) * r, Math.sin(a) * r];
};

const tufts: AuraTransformSpec[] = [];
const tuftColors: string[] = [];
const grassCss = SEASON === "autumn" ? ["#7f9a35", "#a2b04a", "#b9a944", "#6d8c33"] : ["#4f9a35", "#6cb340", "#3f8630", "#86c24d"];
for (let i = 0; i < 280; i += 1) {
  const [x, z] = pickRing(0.9, 8.1);
  const s = 0.6 + diceRng() * 0.8;
  tufts.push({ position: [x, moundH(x, z) + 0.17 * s, z], rotation: [(diceRng() - 0.5) * 0.5, diceRng() * 6.28, (diceRng() - 0.5) * 0.5], scale: [0.07, 0.38 * s, 0.07] });
  tuftColors.push(grassCss[Math.floor(diceRng() * grassCss.length)]);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.95 });
nodes.push(instances.cone({ name: "grass-tufts", transforms: tufts, colors: tuftColors, material: white, params: { radialSegments: 4 }, castShadow: false }));

const fallen: AuraTransformSpec[] = [];
const fallenColors: string[] = [];
const fallenCss = SEASON === "autumn" ? ["#d9531e", "#e88b1c", "#f0b52f", "#b3301f"] : ["#4c9c41", "#6dba4d", "#8bc858", "#3f8630"];
for (let i = 0; i < 40; i += 1) {
  const [x, z] = pickRing(1.4, 7.4);
  const s = 0.7 + diceRng() * 0.7;
  fallen.push({ position: [x, moundH(x, z) + 0.035, z], rotation: [(diceRng() - 0.5) * 0.3, diceRng() * 6.28, (diceRng() - 0.5) * 0.3], scale: [0.26 * s, 0.025, 0.16 * s] });
  fallenColors.push(fallenCss[Math.floor(diceRng() * fallenCss.length)]);
}
nodes.push(instances.sphere({ name: "fallen-leaves", transforms: fallen, colors: fallenColors, material: white, castShadow: false }));

const stems: AuraTransformSpec[] = [];
const caps: AuraTransformSpec[] = [];
const capColors: string[] = [];
const shroomSpots: [number, number, number][] = [
  [AZ0 + 0.45, 3.5, 1.0],
  [AZ0 + 0.7, 3.8, 0.7],
  [AZ0 + 0.3, 3.9, 0.55],
  [AZ0 + 3.4, 3.6, 0.9],
  [AZ0 + 4.2, 3.3, 0.75]
];
for (const [a, r, s] of shroomSpots) {
  const x = Math.sin(a) * r;
  const z = Math.cos(a) * r;
  const g = moundH(x, z);
  stems.push({ position: [x, g + 0.15 * s, z], scale: [0.1 * s, 0.32 * s, 0.1 * s] });
  caps.push({ position: [x, g + 0.31 * s, z], scale: [0.4 * s, 0.22 * s, 0.4 * s] });
  capColors.push(s > 0.8 ? "#c7352b" : "#d9652f");
}
nodes.push(instances.cylinder({ name: "mushroom-stems", transforms: stems, material: material.pbr({ color: "#efe3cc", roughness: 0.9 }), params: { radialSegments: 8 } }));
nodes.push(instances.sphere({ name: "mushroom-caps", transforms: caps, colors: capColors, material: white }));

// ---------------------------------------------------------------- camera framing from the generated geometry
const vFov = 40;
const elev = 0.16;
const targetY = maxY / 2;
const halfH = maxY / 2;
const dist = ((halfH * Math.cos(elev) + maxHoriz * Math.sin(elev)) / Math.tan((vFov / 2) * (Math.PI / 180)) + maxHoriz * 0.6) * 1.06;
const target: V3 = [0, targetY, 0];
const camPos: V3 = [Math.sin(AZ0) * Math.cos(elev) * dist, targetY + Math.sin(elev) * dist, Math.cos(AZ0) * Math.cos(elev) * dist];

const horizon = SEASON === "autumn" ? "#f6dfc2" : "#d7ecf5";
const zenith = SEASON === "autumn" ? "#5f9bd8" : "#4a8fdc";

const stage = scene({ background: horizon })
  .add(sky.gradient({ zenith, horizon, ground: horizon, horizonGlow: 0.4 }))
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.hemisphere({ skyColor: "#cfe2ff", groundColor: "#6b5a2e", intensity: 0.55 }))
  .add(
    lights.directional({
      name: "key",
      position: [-9, 13, 7],
      target: [0, 3, 0],
      intensity: 3.1,
      color: SEASON === "autumn" ? "#ffe0b0" : "#fff2d8",
      shadow: true
    })
  )
  .add(effects.fog({ color: horizon, density: 0.006 }))
  .addMany(nodes)
  .camera(camera.orbit({ position: camPos, target, fov: vFov, near: 0.5, far: 1500, autoRotate: 0.12 }));

async function main(): Promise<void> {
  const app = createAuraApp("#app", { scene: stage });
  await app.ready();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  window.__EVAL_READY__ = true;
  window.__TASK_STATE__ = {
    ready: true,
    branchCount: tree.branches.length,
    foliageClumpCount: tree.clumps.length,
    seed: SEED
  };
}

void main();
