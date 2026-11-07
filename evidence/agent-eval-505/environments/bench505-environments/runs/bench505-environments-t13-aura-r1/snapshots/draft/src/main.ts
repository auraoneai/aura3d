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
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------- helpers
let seed = 424242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const addv = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulv = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

/** Euler rotation (engine order ZYX = Rz·Ry·Rx, here z = 0) that turns the +Y axis onto `dir`. */
const aimY = (dir: V3): V3 => [Math.acos(clamp(dir[1], -1, 1)), Math.atan2(dir[0], dir[2]), 0];

// ---------------------------------------------------------------- sea water palette
const WATER_FOG = "#0f6a7c";

// ---------------------------------------------------------------- sandy seabed
const SAND_SIZE = 90;
const SAND_CELLS = 240;

const ripple = (x: number, z: number): number => {
  const u = x * 0.93 + z * 0.36 + 1.3 * Math.sin(z * 0.21 + x * 0.07);
  return 0.07 * Math.sin(u * 3.4);
};
const groundY = (x: number, z: number): number =>
  0.3 * Math.sin(x * 0.09 + 0.6) * Math.cos(z * 0.07) - 0.0012 * (x * x + z * z) + ripple(x, z);

function buildSand() {
  const n = SAND_CELLS;
  const positions = new Float32Array((n + 1) * (n + 1) * 3);
  const normals = new Float32Array(positions.length);
  const colors = new Float32Array((n + 1) * (n + 1) * 4);
  const indices: number[] = [];
  const e = 0.06;
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      const v = j * (n + 1) + i;
      const x = (i / n - 0.5) * SAND_SIZE;
      const z = (j / n - 0.5) * SAND_SIZE;
      const h = groundY(x, z);
      positions.set([x, h, z], v * 3);
      const nx = groundY(x - e, z) - groundY(x + e, z);
      const nz = groundY(x, z - e) - groundY(x, z + e);
      const len = Math.hypot(nx, 2 * e, nz);
      normals.set([nx / len, (2 * e) / len, nz / len], v * 3);
      const crest = 0.5 + 0.5 * (ripple(x, z) / 0.07);
      const speck = 0.96 + 0.04 * Math.sin(x * 7.3) * Math.sin(z * 6.1);
      const k = (0.8 + 0.2 * crest) * speck;
      colors.set([0.8 * k, 0.69 * k, 0.46 * k, 1], v * 4);
      if (i < n && j < n) indices.push(v, v + n + 1, v + 1, v + 1, v + n + 1, v + n + 2);
    }
  }
  return geometry.define({
    positions,
    normals,
    colors,
    indices,
    bounds: { min: [-SAND_SIZE / 2, -6, -SAND_SIZE / 2], max: [SAND_SIZE / 2, 3, SAND_SIZE / 2] }
  });
}

// ---------------------------------------------------------------- static reef (instanced primitives)
interface Batch {
  t: AuraTransformSpec[];
  c: string[];
}
const cylB: Batch = { t: [], c: [] };
const sphB: Batch = { t: [], c: [] }; // small, low poly spheres (tips, bumps)
const bigB: Batch = { t: [], c: [] }; // domes and rocks, smoother
const coralSpots: Array<[number, number, number]> = [];

function addCyl(base: V3, dir: V3, len: number, rad: number, color: string): void {
  const d = norm(dir);
  const mid = addv(base, mulv(d, len / 2));
  cylB.t.push({ position: mid, rotation: aimY(d), scale: [rad * 2, len, rad * 2] });
  cylB.c.push(color);
}
function addSph(p: V3, dia: number, color: string): void {
  sphB.t.push({ position: p, scale: dia });
  sphB.c.push(color);
}
function addBig(p: V3, scale: V3, yaw: number, color: string): void {
  bigB.t.push({ position: p, rotation: [0, yaw, 0], scale });
  bigB.c.push(color);
}

function grow(base: V3, dir: V3, len: number, rad: number, depth: number, color: string, tip: string): void {
  addCyl(base, dir, len, rad, color);
  const end = addv(base, mulv(norm(dir), len));
  if (depth === 0) {
    addSph(end, rad * 2.5, tip);
    return;
  }
  addSph(end, rad * 1.9, color);
  const n = rand() < 0.4 ? 3 : 2;
  for (let i = 0; i < n; i += 1) {
    const nd = norm([dir[0] + between(-0.85, 0.85), Math.max(dir[1], 0.3) + 0.25, dir[2] + between(-0.85, 0.85)]);
    grow(end, nd, len * 0.76, rad * 0.74, depth - 1, color, tip);
  }
}

function branching(x: number, z: number, scale: number, color: string, tip: string): void {
  coralSpots.push([x, z, 1.0 * scale]);
  const base: V3 = [x, groundY(x, z) - 0.05, z];
  const trunks = 4 + Math.floor(rand() * 2);
  for (let k = 0; k < trunks; k += 1) {
    const a = (k / trunks) * Math.PI * 2 + rand();
    grow(base, norm([Math.sin(a) * 0.5, 1, Math.cos(a) * 0.5]), 0.52 * scale, 0.075 * scale, 3, color, tip);
  }
}

function brain(x: number, z: number, d: number, color: string, ridge: string): void {
  coralSpots.push([x, z, d * 0.6]);
  const gy = groundY(x, z);
  const a = d / 2;
  const b = d * 0.36;
  const cy = gy + 0.02;
  addBig([x, cy, z], [d, d * 0.72, d], 0, color);
  for (let l = 0; l < 9; l += 1) {
    const phi0 = (l / 9) * Math.PI * 2;
    for (let s = 0; s <= 15; s += 1) {
      const th = 0.12 + (s / 15) * 1.3;
      const ph = phi0 + 0.55 * Math.sin(th * 5 + l * 1.3);
      const p: V3 = [
        x + a * 1.01 * Math.sin(th) * Math.cos(ph),
        cy + b * 1.01 * Math.cos(th),
        z + a * 1.01 * Math.sin(th) * Math.sin(ph)
      ];
      addSph(p, d * 0.13, ridge);
    }
  }
}

function fan(x: number, z: number, facing: number, size: number, color: string, rim: string): void {
  coralSpots.push([x, z, size * 0.7]);
  const base: V3 = [x, groundY(x, z) - 0.05, z];
  addCyl(base, [0, 1, 0], 0.32, 0.06, rim);
  const origin = addv(base, [0, 0.3, 0]);
  const side: V3 = [Math.cos(facing), 0, Math.sin(facing)];
  const ribs = 15;
  const ring: V3[][] = [[], [], []];
  const radii = [0.45, 0.72, 1.0];
  for (let i = 0; i < ribs; i += 1) {
    const a = -1.05 + (i * 2.1) / (ribs - 1);
    const dir = norm([side[0] * Math.sin(a), Math.cos(a), side[2] * Math.sin(a)]);
    addCyl(origin, dir, size, 0.022, color);
    radii.forEach((r, j) => {
      const p = addv(origin, mulv(dir, size * r));
      ring[j].push(p);
      addSph(p, 0.075, rim);
    });
  }
  for (let j = 0; j < 3; j += 1) {
    for (let i = 0; i < ribs - 1; i += 1) {
      const p = ring[j][i];
      const q = ring[j][i + 1];
      const d: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      addCyl(p, d, Math.hypot(d[0], d[1], d[2]), 0.012, color);
    }
  }
}

function tubes(x: number, z: number, count: number, color: string, dark: string): void {
  coralSpots.push([x, z, 0.8]);
  for (let k = 0; k < count; k += 1) {
    const ox = between(-0.4, 0.4);
    const oz = between(-0.4, 0.4);
    const px = x + ox;
    const pz = z + oz;
    const h = between(0.5, 1.4);
    const r = between(0.08, 0.13);
    const dir = norm([between(-0.15, 0.15) + ox * 0.3, 1, between(-0.15, 0.15) + oz * 0.3]);
    const base: V3 = [px, groundY(px, pz) - 0.05, pz];
    addCyl(base, dir, h, r, color);
    addCyl(addv(base, mulv(dir, h - 0.02)), dir, 0.06, r * 0.78, dark);
  }
}

function table(x: number, z: number, radius: number, color: string): void {
  coralSpots.push([x, z, radius]);
  const base: V3 = [x, groundY(x, z) - 0.05, z];
  addCyl(base, [0.05, 1, 0.02], 0.55, 0.12, color);
  addCyl(addv(base, [0.03, 0.55, 0.01]), [0.1, 1, 0.05], 0.12, radius, color);
  addCyl(addv(base, [0.03, 0.62, 0.01]), [0.1, 1, 0.05], 0.05, radius * 0.7, "#a8ecd0");
}

// Branching colonies
branching(-2.6, 1.6, 1.0, "#ff7a45", "#ffd1a8");
branching(1.9, -2.3, 1.1, "#ff6fa5", "#ffd0e4");
branching(3.7, 1.2, 0.9, "#f4d03f", "#fff3a8");
branching(-1.0, -3.6, 1.0, "#ff4d4d", "#ffb3a8");
branching(0.2, 0.5, 1.15, "#ff9a3c", "#ffe0a0");
branching(-4.8, -1.6, 0.85, "#c77dff", "#ecd0ff");
// Brain corals
brain(-0.9, 2.7, 1.7, "#7fbf5a", "#b6e07c");
brain(2.7, 2.9, 1.25, "#d98fa0", "#f2c0cc");
brain(-3.8, -0.4, 1.9, "#b5a642", "#ddd070");
// Fans
fan(-4.3, 2.6, 0.5, 1.5, "#b04aa8", "#e6a0e0");
fan(4.2, -1.8, 2.3, 1.6, "#ee5a38", "#ffb090");
fan(-2.0, -1.7, 1.1, 1.3, "#8a5cf0", "#cbb4ff");
// Tubes
tubes(1.2, 4.0, 8, "#7a4fd1", "#25103c");
tubes(-3.2, 3.9, 7, "#f2c230", "#4a3208");
tubes(5.0, -3.2, 7, "#ff8f6b", "#4a1a10");
// Table coral
table(-0.3, -1.3, 0.9, "#58c4a0");
table(5.4, 0.6, 0.7, "#4fa3d8");

// Rocks scattered around the reef
for (let i = 0; i < 18; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = between(2.5, 9);
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = between(0.35, 1.0);
  const g = 0.4 + rand() * 0.1;
  const tone = `rgb(${Math.round(g * 220)}, ${Math.round(g * 205)}, ${Math.round(g * 190)})`;
  addBig([x, groundY(x, z) + s * 0.1, z], [s * 1.5, s * 0.8, s * 1.2], rand() * 6, tone);
}

// ---------------------------------------------------------------- swaying seaweed and anemones
interface Strand {
  x: number;
  y: number;
  z: number;
  h: number;
  w: number;
  ph: number;
  psi: number;
}
const SEGS = 6;
const strandsA: Strand[] = [];
const strandsB: Strand[] = [];
for (let i = 0; i < 70; i += 1) {
  let x = 0;
  let z = 0;
  for (let tries = 0; tries < 20; tries += 1) {
    const a = rand() * Math.PI * 2;
    const r = between(1.5, 9.5);
    x = Math.cos(a) * r;
    z = Math.sin(a) * r;
    if (!coralSpots.some(([cx, cz, cr]) => Math.hypot(cx - x, cz - z) < cr + 0.3)) break;
  }
  const s: Strand = {
    x,
    y: groundY(x, z) - 0.05,
    z,
    h: between(1.1, 2.5),
    w: between(0.12, 0.2),
    ph: rand() * 6.28,
    psi: rand() * 6.28
  };
  (i % 2 === 0 ? strandsA : strandsB).push(s);
}

function seaweedTransforms(strands: Strand[], t: number): AuraTransformSpec[] {
  const out: AuraTransformSpec[] = [];
  for (const s of strands) {
    let p: V3 = [s.x, s.y, s.z];
    const segLen = s.h / SEGS;
    const psi = s.psi + 0.6 * Math.sin(t * 0.45 + s.ph);
    for (let k = 0; k < SEGS; k += 1) {
      const f = k / SEGS;
      const phi = 0.1 + 0.5 * f * (0.55 + 0.45 * Math.sin(t * 0.9 + s.ph)) + 0.14 * Math.sin(t * 1.7 + s.ph + k * 0.8) * (0.3 + f);
      const dir: V3 = [Math.sin(phi) * Math.sin(psi), Math.cos(phi), Math.sin(phi) * Math.cos(psi)];
      out.push({
        position: addv(p, mulv(dir, segLen * 0.5)),
        rotation: [phi, psi, 0],
        scale: [s.w * (1 - f * 0.55), segLen * 1.12, s.w * 0.28]
      });
      p = addv(p, mulv(dir, segLen));
    }
  }
  return out;
}

interface Anemone {
  x: number;
  y: number;
  z: number;
  ph: number;
}
const anemones: Anemone[] = [
  [-1.6, 3.9],
  [2.4, 0.2],
  [-2.4, -3.1],
  [4.1, 3.9],
  [0.3, -5.0]
].map(([x, z]) => ({ x, y: groundY(x, z), z, ph: rand() * 6.28 }));
const TENT = 20;
// anemone bases (static)
for (const a of anemones) {
  addCyl([a.x, a.y - 0.05, a.z], [0, 1, 0], 0.28, 0.2, "#b02a66");
  addCyl([a.x, a.y + 0.2, a.z], [0, 1, 0], 0.06, 0.26, "#e0508f");
}

function anemoneTransforms(t: number): AuraTransformSpec[] {
  const out: AuraTransformSpec[] = [];
  for (const a of anemones) {
    for (let i = 0; i < TENT; i += 1) {
      const psi = (i / TENT) * Math.PI * 2 + a.ph;
      const ring = i % 2 === 0 ? 0.13 : 0.06;
      const base: V3 = [a.x + Math.sin(psi) * ring, a.y + 0.24, a.z + Math.cos(psi) * ring];
      const w = t * 1.5 + a.ph + i * 0.9;
      const phi1 = 0.3 + 0.12 * Math.sin(w);
      const phi2 = phi1 + 0.45 + 0.2 * Math.sin(w * 0.8 + 1.0);
      const d1: V3 = [Math.sin(phi1) * Math.sin(psi), Math.cos(phi1), Math.sin(phi1) * Math.cos(psi)];
      const d2: V3 = [Math.sin(phi2) * Math.sin(psi), Math.cos(phi2), Math.sin(phi2) * Math.cos(psi)];
      const l1 = 0.3;
      const l2 = 0.28;
      out.push({ position: addv(base, mulv(d1, l1 / 2)), rotation: [phi1, psi, 0], scale: [0.045, l1, 0.045] });
      const mid = addv(base, mulv(d1, l1));
      out.push({ position: addv(mid, mulv(d2, l2 / 2)), rotation: [phi2, psi, 0], scale: [0.035, l2, 0.035] });
    }
  }
  return out;
}

// ---------------------------------------------------------------- fish
interface FishDef {
  off: V3; // school offset (along, side, up)
  ph: number;
  len: number;
}
interface FishGroupDef {
  id: string;
  fish: FishDef[];
  shape: [number, number]; // body height and thickness relative to length
  body: string;
  fin: string;
  school: boolean;
  path?: { cx: number; cz: number; rx: number; rz: number; y: number; ya: number; speed: number; phase: number; dir: number };
}

function makeSchool(id: string, n: number, body: string, fin: string, front: number): FishGroupDef {
  const fish: FishDef[] = [];
  for (let i = 0; i < n; i += 1) {
    fish.push({
      off: [between(-1.4, 1.4) + front, between(-1.0, 1.0), between(-0.55, 0.55)],
      ph: rand() * 6.28,
      len: between(0.36, 0.5)
    });
  }
  return { id, fish, shape: [0.4, 0.2], body, fin, school: true };
}

const fishGroups: FishGroupDef[] = [
  makeSchool("school-a", 14, "#ffd23f", "#ff9f1c", 0.3),
  makeSchool("school-b", 12, "#4fb3ff", "#bfe6ff", -0.3),
  makeSchool("school-c", 12, "#ff8a3d", "#ffd0a0", 0),
  {
    id: "solo-angel",
    fish: [{ off: [0, 0, 0], ph: 0.4, len: 1.1 }],
    shape: [0.62, 0.16],
    body: "#f6c04a",
    fin: "#2d6cdf",
    school: false,
    path: { cx: 0.5, cz: -0.3, rx: 3.7, rz: 3.0, y: 2.5, ya: 0.35, speed: 0.17, phase: 1.2, dir: 1 }
  },
  {
    id: "solo-parrot",
    fish: [{ off: [0, 0, 0], ph: 2.1, len: 1.5 }],
    shape: [0.36, 0.2],
    body: "#2ec4b6",
    fin: "#ff7aa8",
    school: false,
    path: { cx: -0.6, cz: 0.4, rx: 7.4, rz: 5.6, y: 1.6, ya: 0.45, speed: 0.1, phase: 3.9, dir: -1 }
  },
  {
    id: "solo-grouper",
    fish: [{ off: [0, 0, 0], ph: 4.0, len: 1.3 }],
    shape: [0.4, 0.22],
    body: "#d1495b",
    fin: "#7a1f2b",
    school: false,
    path: { cx: 1.5, cz: 1.0, rx: 6.2, rz: 4.4, y: 1.2, ya: 0.3, speed: 0.13, phase: 0.2, dir: 1 }
  }
];

const schoolCenter = (t: number): V3 => {
  const a = t * 0.23;
  return [5.3 * Math.cos(a) + 0.8 * Math.sin(a * 2.3), 1.9 + 0.55 * Math.sin(t * 0.31), 4.3 * Math.sin(a)];
};

function fishPosition(g: FishGroupDef, f: FishDef, t: number): V3 {
  if (g.school || !g.path) {
    const c = schoolCenter(t);
    const c2 = schoolCenter(t + 0.1);
    const fl = Math.hypot(c2[0] - c[0], c2[2] - c[2]) || 1;
    const fx = (c2[0] - c[0]) / fl;
    const fz = (c2[2] - c[2]) / fl;
    const breathe = 1 + 0.2 * Math.sin(t * 0.6 + f.ph);
    const along = f.off[0] * breathe + 0.35 * Math.sin(t * 1.3 + f.ph * 2);
    const side = f.off[1] * breathe + 0.2 * Math.sin(t * 1.1 + f.ph);
    const up = f.off[2] + 0.12 * Math.sin(t * 0.9 + f.ph * 3);
    return [c[0] + fx * along - fz * side, c[1] + up, c[2] + fz * along + fx * side];
  }
  const p = g.path;
  const a = p.dir * p.speed * t + p.phase;
  return [p.cx + p.rx * Math.cos(a), p.y + p.ya * Math.sin(a * 1.7 + f.ph), p.cz + p.rz * Math.sin(a)];
}

const fwd = (yaw: number, d: number): V3 => [d * Math.cos(yaw), 0, -d * Math.sin(yaw)];

function fishTransforms(g: FishGroupDef, t: number) {
  const body: AuraTransformSpec[] = [];
  const tail: AuraTransformSpec[] = [];
  const dorsal: AuraTransformSpec[] = [];
  const [hr, tr] = g.shape;
  for (const f of g.fish) {
    const p = fishPosition(g, f, t);
    const q = fishPosition(g, f, t + 0.08);
    const yaw = Math.atan2(-(q[2] - p[2]), q[0] - p[0]);
    const L = f.len;
    const wag = 0.55 * Math.sin(t * (g.school ? 9 : 5.5) + f.ph);
    body.push({ position: p, rotation: [0, yaw, 0], scale: [L, L * hr, L * tr] });
    const tp = addv(addv(p, fwd(yaw, -0.5 * L)), fwd(yaw + wag, -0.15 * L));
    tail.push({ position: tp, rotation: [0, yaw + wag, 0], scale: [0.28 * L, L * hr * 1.5, L * 0.035] });
    dorsal.push({
      position: addv(addv(p, fwd(yaw, -0.06 * L)), [0, L * hr * 0.52, 0]),
      rotation: [0, yaw, 0],
      scale: [0.42 * L, L * hr * 0.4, L * 0.03]
    });
  }
  return { body, tail, dorsal };
}

// ---------------------------------------------------------------- bubbles and drifting particles
const BUBBLES = 48;
const WATER_TOP = 7.5;
const vents: Array<[number, number]> = [
  [-2.6, 1.6],
  [1.9, -2.4],
  [3.7, 1.0],
  [-0.8, 3.0]
];
interface Bubble {
  x: number;
  z: number;
  y0: number;
  speed: number;
  size: number;
  ph: number;
}
const bubbles: Bubble[] = [];
for (let i = 0; i < BUBBLES; i += 1) {
  const v = vents[i % vents.length];
  bubbles.push({
    x: v[0] + between(-0.4, 0.4),
    z: v[1] + between(-0.4, 0.4),
    y0: rand() * WATER_TOP,
    speed: between(0.3, 0.55),
    size: between(0.05, 0.12),
    ph: rand() * 6.28
  });
}
function bubbleTransforms(t: number): AuraTransformSpec[] {
  return bubbles.map((b) => {
    const rise = (b.y0 + t * b.speed) % WATER_TOP;
    const y = 0.2 + rise;
    const grow = 0.7 + 0.5 * (rise / WATER_TOP);
    return {
      position: [b.x + 0.15 * Math.sin(t * 1.7 + b.ph) * (0.3 + rise * 0.1), y, b.z + 0.15 * Math.cos(t * 1.3 + b.ph) * (0.3 + rise * 0.1)],
      scale: b.size * grow
    };
  });
}

const MOTES = 80;
interface Mote {
  x: number;
  y: number;
  z: number;
  ph: number;
  size: number;
}
const motes: Mote[] = [];
for (let i = 0; i < MOTES; i += 1) {
  motes.push({ x: between(-10, 10), y: between(0.3, 6), z: between(-10, 10), ph: rand() * 6.28, size: between(0.025, 0.05) });
}
function moteTransforms(t: number): AuraTransformSpec[] {
  return motes.map((m) => ({
    position: [
      m.x + 0.6 * Math.sin(t * 0.21 + m.ph),
      0.3 + ((m.y - 0.3 + t * 0.07) % 5.7),
      m.z + 0.6 * Math.cos(t * 0.17 + m.ph * 1.3)
    ],
    scale: m.size
  }));
}

// ---------------------------------------------------------------- shaders
const causticShader = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
float cell(vec2 p, float t) {
  float a = sin(p.x * 1.1 + t * 0.8 + 1.7 * sin(p.y * 0.7 + t * 0.5));
  float b = sin(p.y * 1.3 - t * 0.7 + 1.7 * sin(p.x * 0.9 - t * 0.6));
  float c = sin((p.x + p.y) * 0.8 + t * 0.4 + 1.4 * sin((p.x - p.y) * 1.2 - t * 0.55));
  float w1 = 1.0 - abs(a);
  float w2 = 1.0 - abs(b);
  float w3 = 1.0 - abs(c);
  float m = pow(w1, 10.0) + pow(w2, 10.0) + pow(w3, 10.0);
  return clamp(m, 0.0, 1.0);
}
void main() {
  vec2 p = vWorld.xz * 1.9;
  float k = cell(p, uTime * 0.9) + 0.6 * cell(p * 1.7 + vec2(3.1, 1.7), uTime * 1.2);
  float d = length(vWorld.xz);
  float fade = 1.0 - smoothstep(9.0, 26.0, d);
  float a = clamp(k, 0.0, 1.0) * fade * 0.5;
  outColor = vec4(vec3(0.6, 1.0, 0.9), a);
}`
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  fog: false
});

const rayShader = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
out vec4 outColor;
void main() {
  float e = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265);
  e = e * e;
  float h = clamp((vWorld.y + 0.5) / 7.5, 0.0, 1.0);
  float shimmer = 0.7 + 0.3 * sin(vWorld.x * 2.3 + vWorld.z * 1.7 + uTime * 0.6);
  float a = e * h * h * shimmer * 0.2;
  outColor = vec4(vec3(0.6, 1.0, 0.9), a);
}`
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double",
  fog: false
});

// ---------------------------------------------------------------- scene
const sandGeometry = buildSand();
const whiteMatte = (roughness: number) => material.pbr({ color: "#ffffff", roughness });

const rayNodes = [];
for (let i = 0; i < 9; i += 1) {
  const w = between(1.4, 3.4);
  rayNodes.push(
    primitives
      .plane({
        name: `ray-${i}`,
        size: [w, 1, 9],
        material: rayShader,
        castShadow: false,
        receiveShadow: false,
        position: [between(-8, 8), 3.5, between(-8, 8)],
        rotation: [Math.PI / 2, rand() * Math.PI, 0.16]
      })
  );
}

const CAM_RADIUS = 10.5;
const camPose = (t: number): { position: V3; target: V3 } => {
  const a = t * 0.09;
  const r = CAM_RADIUS + 0.7 * Math.sin(t * 0.13);
  const h = 3.0 + 0.3 * Math.sin(t * 0.55);
  return { position: [r * Math.sin(a), h, r * Math.cos(a)], target: [0, 1.0 + 0.08 * Math.sin(t * 0.37), 0] };
};
const pose0 = camPose(0);

function buildScene() {
  let s = scene({ background: WATER_FOG })
    .add(
      sky.gradient({
        zenith: "#2fb0bd",
        horizon: WATER_FOG,
        ground: WATER_FOG,
        name: "water-column",
        affectsFog: false
      })
    )
    .add(environments.neutral({ intensity: 0.3, background: false }))
    .add(lights.hemisphere({ skyColor: "#52c8d2", groundColor: "#1f7a72", intensity: 0.8 }))
    .add(lights.directional({ name: "sun", position: [4, 16, 3], target: [0, 0, 0], intensity: 2.4, color: "#d2fff0", shadow: true }))
    .add(effects.fog({ color: WATER_FOG, density: 0.045 }))
    .add(geometry.custom(sandGeometry, { name: "sand", material: whiteMatte(1), castShadow: false }))
    .add(geometry.custom(sandGeometry, { name: "caustics", material: causticShader, castShadow: false, receiveShadow: false, position: [0, 0.035, 0] }))
    .add(
      instances.cylinder({
        name: "coral-cyl",
        transforms: cylB.t,
        colors: cylB.c,
        material: whiteMatte(0.7),
        params: { radialSegments: 8 }
      })
    )
    .add(
      instances.sphere({
        name: "coral-sph",
        transforms: sphB.t,
        colors: sphB.c,
        material: whiteMatte(0.65),
        params: { widthSegments: 8, heightSegments: 6 }
      })
    )
    .add(
      instances.sphere({
        name: "coral-big",
        transforms: bigB.t,
        colors: bigB.c,
        material: whiteMatte(0.85),
        params: { widthSegments: 24, heightSegments: 14 }
      })
    );

  // seaweed and anemones
  s = s
    .add(
      instances
        .cylinder({
          name: "kelp-a",
          transforms: seaweedTransforms(strandsA, 0),
          material: material.pbr({ color: "#2f9e5a", roughness: 0.6 }),
          params: { radialSegments: 6 }
        })
        .runtime({ id: "kelp-a", mutable: true })
    )
    .add(
      instances
        .cylinder({
          name: "kelp-b",
          transforms: seaweedTransforms(strandsB, 0),
          material: material.pbr({ color: "#8fb83c", roughness: 0.6 }),
          params: { radialSegments: 6 }
        })
        .runtime({ id: "kelp-b", mutable: true })
    )
    .add(
      instances
        .cylinder({
          name: "anemone",
          transforms: anemoneTransforms(0),
          material: material.pbr({ color: "#ff5fae", roughness: 0.5, emissive: "#a01860", emissiveIntensity: 0.4 }),
          params: { radialSegments: 6 }
        })
        .runtime({ id: "anemone", mutable: true })
    );

  // fish
  for (const g of fishGroups) {
    const parts = fishTransforms(g, 0);
    s = s
      .add(
        instances
          .sphere({
            name: `${g.id}-body`,
            transforms: parts.body,
            material: material.pbr({ color: g.body, roughness: 0.35, metallic: 0.2 }),
            params: { widthSegments: 14, heightSegments: 8 }
          })
          .runtime({ id: `${g.id}-body`, mutable: true })
      )
      .add(
        instances
          .box({ name: `${g.id}-tail`, transforms: parts.tail, material: material.pbr({ color: g.fin, roughness: 0.5 }) })
          .runtime({ id: `${g.id}-tail`, mutable: true })
      )
      .add(
        instances
          .box({ name: `${g.id}-dorsal`, transforms: parts.dorsal, material: material.pbr({ color: g.fin, roughness: 0.5 }) })
          .runtime({ id: `${g.id}-dorsal`, mutable: true })
      );
  }

  // bubbles and motes
  s = s
    .add(
      instances
        .sphere({
          name: "bubbles",
          transforms: bubbleTransforms(0),
          material: material.pbr({ color: "#e6fbff", roughness: 0.05, opacity: 0.5, emissive: "#9fe8f0", emissiveIntensity: 0.35 }),
          params: { widthSegments: 10, heightSegments: 8 },
          castShadow: false
        })
        .runtime({ id: "bubbles", mutable: true })
    )
    .add(
      instances
        .sphere({
          name: "motes",
          transforms: moteTransforms(0),
          material: material.pbr({ color: "#d6f5ee", roughness: 1, opacity: 0.6, emissive: "#8fd8d0", emissiveIntensity: 0.4 }),
          params: { widthSegments: 5, heightSegments: 4 },
          castShadow: false
        })
        .runtime({ id: "motes", mutable: true })
    );

  for (const r of rayNodes) s = s.add(r);

  return s.camera(camera.perspective({ position: pose0.position, target: pose0.target, fov: 58, near: 0.1, far: 220 }));
}

async function main(): Promise<void> {
  const app = createAuraApp("#app", { scene: buildScene(), resize: false });

  let time = 0;
  app.onFrame((frame) => {
    const dt = clamp(frame.dt, 0, 0.1);
    time += dt;
    const t = time;

    const cp = camPose(t);
    app.camera?.setPose({ position: cp.position, target: cp.target });

    app.nodes.require("kelp-a").setInstances(seaweedTransforms(strandsA, t));
    app.nodes.require("kelp-b").setInstances(seaweedTransforms(strandsB, t));
    app.nodes.require("anemone").setInstances(anemoneTransforms(t));

    for (const g of fishGroups) {
      const parts = fishTransforms(g, t);
      app.nodes.require(`${g.id}-body`).setInstances(parts.body);
      app.nodes.require(`${g.id}-tail`).setInstances(parts.tail);
      app.nodes.require(`${g.id}-dorsal`).setInstances(parts.dorsal);
    }

    app.nodes.require("bubbles").setInstances(bubbleTransforms(t));
    app.nodes.require("motes").setInstances(moteTransforms(t));
  });

  await app.ready();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  });
}

void main();
