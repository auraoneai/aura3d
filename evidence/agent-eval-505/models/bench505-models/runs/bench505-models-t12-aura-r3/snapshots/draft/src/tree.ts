// Seeded procedural tree layout. Pure data: no engine imports. Same seed gives the same tree.

export type V3 = [number, number, number];

export type BranchKind = "trunk" | "root" | "limb" | "branch" | "twig";

export interface Branch {
  kind: BranchKind;
  level: number; // 0 trunk and roots, 1 major limb, 2 branch, 3 twig
  pts: V3[];
  radii: number[];
}

export interface Clump {
  position: V3;
  scale: V3;
  rotationY: number;
  tone: number; // 0 (dark) .. 1 (light)
}

export interface Sample {
  p: V3;
  r: number;
  dir: V3;
}

export interface TreeLayout {
  seed: number;
  branches: Branch[];
  clumps: Clump[];
  swing: { limb: Sample; azimuth: number };
  birdhouse: { limb: Sample; azimuth: number };
  knot: { center: V3; radius: number; azimuth: number };
  rootAzimuths: number[];
  top: number;
  reach: number;
}

export const MOUND_HEIGHT = 1.0;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ground height of the grassy mound at (x, z). */
export function moundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const dome = 1 - smoothstep(2.2, 8.5, r);
  const bumps = 0.05 * Math.sin(x * 0.9 + 0.7) * Math.sin(z * 0.8 - 0.4) + 0.03 * Math.sin(x * 2.1 + z * 1.7);
  return MOUND_HEIGHT * dome + bumps * dome;
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

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const UP: V3 = [0, 1, 0];

/** Direction at `elevation` radians from vertical, heading along `azimuth` (0 = +z, pi/2 = +x). */
const dirFrom = (azimuth: number, elevation: number): V3 => [
  Math.sin(elevation) * Math.sin(azimuth),
  Math.cos(elevation),
  Math.sin(elevation) * Math.cos(azimuth)
];

export function sample(b: Branch, t: number): Sample {
  const n = b.pts.length - 1;
  const f = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const k = f - i;
  const a = b.pts[i];
  const c = b.pts[i + 1];
  const p: V3 = [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k];
  const r = b.radii[i] + (b.radii[i + 1] - b.radii[i]) * k;
  return { p, r, dir: norm([c[0] - a[0], c[1] - a[1], c[2] - a[2]]) };
}

interface GrowOptions {
  wander: number;
  up: number;
}

function grow(rng: () => number, start: V3, dir: V3, length: number, segs: number, o: GrowOptions): V3[] {
  const pts: V3[] = [start];
  let d = norm(dir);
  let p = start;
  const step = length / segs;
  for (let i = 0; i < segs; i += 1) {
    d = norm([
      d[0] + (rng() - 0.5) * 2 * o.wander,
      d[1] + (rng() - 0.5) * 1.4 * o.wander + o.up,
      d[2] + (rng() - 0.5) * 2 * o.wander
    ]);
    p = add(p, mul(d, step));
    pts.push(p);
  }
  return pts;
}

/** Radius profile: tapers r0 -> r1 along the branch, with a collar flare at the base. */
function taper(n: number, r0: number, r1: number, flare: number, decay: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    out.push((r0 + (r1 - r0) * Math.pow(t, 0.85)) * (1 + flare * Math.exp(-t * decay)));
  }
  return out;
}

export function buildTree(seed: number): TreeLayout {
  const rng = mulberry32(seed);
  const between = (a: number, b: number): number => a + (b - a) * rng();
  const branches: Branch[] = [];
  const clumps: Clump[] = [];

  // Trunk: a slightly leaning leader that flares strongly at the base.
  const baseY = moundHeight(0, 0) - 0.35;
  const trunkLen = 4.4;
  const trunkSegs = 12;
  const trunk: Branch = {
    kind: "trunk",
    level: 0,
    pts: grow(rng, [0, baseY, 0], [between(-0.1, 0.1), 1, between(-0.1, 0.1)], trunkLen, trunkSegs, { wander: 0.05, up: 0.02 }),
    radii: taper(trunkSegs, 0.56, 0.2, 0.75, 12)
  };
  branches.push(trunk);

  // Surface roots: radiate from the flare, swell over the mound surface and dive under at the tips.
  const rootAzimuths: number[] = [];
  const rootCount = 6;
  for (let i = 0; i < rootCount; i += 1) {
    const az = 0.9 + (i * Math.PI * 2) / rootCount + between(-0.12, 0.12);
    rootAzimuths.push(az);
    const length = between(1.9, 2.5);
    const segs = 9;
    const r0 = between(0.28, 0.36);
    const radii: number[] = [];
    const pts: V3[] = [];
    const phase = between(0, 6);
    for (let j = 0; j <= segs; j += 1) {
      const s = j / segs;
      const r = r0 * Math.pow(1 - s, 1.1) + 0.05;
      const a = az + Math.sin(s * 3 + phase) * 0.12;
      const d = 0.3 + length * s;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      const y = j === 0 ? moundHeight(x, z) + 0.1 : moundHeight(x, z) + r * 0.45 - s * s * 0.22;
      pts.push([x, y, z]);
      radii.push(r);
    }
    branches.push({ kind: "root", level: 0, pts, radii });
  }

  // Major limbs. Limb 0 carries the rope swing, limb 1 the bird house.
  const limbCount = 7;
  const limbs: Branch[] = [];
  let az = 0;
  for (let i = 0; i < limbCount; i += 1) {
    const t = 0.5 + 0.45 * (i / (limbCount - 1));
    const at = sample(trunk, t);
    az = i === 0 ? 0.9 : i === 1 ? -1.1 : az + 2.4 + between(-0.3, 0.3);
    const elevation = ((i === 0 ? 78 : i === 1 ? 64 : 58 - i * 5) * Math.PI) / 180;
    const length = i === 0 ? 3.0 : i === 1 ? 2.8 : 2.8 - 0.1 * i + between(0, 0.4);
    const segs = 9;
    const start = at.p;
    const limb: Branch = {
      kind: "limb",
      level: 1,
      pts: grow(rng, start, dirFrom(az, elevation), length, segs, { wander: i < 2 ? 0.035 : 0.07, up: i < 2 ? 0.02 : 0.035 }),
      radii: taper(segs, at.r * 0.62, 0.07, 0.3, 9)
    };
    limbs.push(limb);
    branches.push(limb);
  }

  const swing = { limb: sample(limbs[0], 0.58), azimuth: 0.9 };
  const birdhouse = { limb: sample(limbs[1], 0.55), azimuth: -1.1 };

  const addClump = (end: V3, base: number): void => {
    const s = base * between(0.8, 1.2);
    clumps.push({
      position: [end[0] + between(-0.15, 0.15), end[1] + 0.25 + between(0, 0.2), end[2] + between(-0.15, 0.15)],
      scale: [s * between(1.0, 1.2), s * between(0.78, 0.95), s * between(1.0, 1.2)],
      rotationY: between(0, Math.PI * 2),
      tone: 0
    });
  };

  // Level 2 branches off each limb, level 3 twigs off those.
  for (let li = 0; li < limbs.length; li += 1) {
    const limb = limbs[li];
    const ts = li < 2 ? [0.68, 0.82, 0.94] : [0.35, 0.62, 0.88];
    for (let k = 0; k < ts.length; k += 1) {
      const at = sample(limb, ts[k]);
      const side = norm(cross(at.dir, UP));
      const sign = k % 2 === 0 ? 1 : -1;
      const dir = norm(add(add(at.dir, mul(side, sign * between(0.6, 1.0))), mul(UP, between(0.35, 0.7))));
      const segs = 6;
      const branch: Branch = {
        kind: "branch",
        level: 2,
        pts: grow(rng, at.p, dir, between(1.1, 1.6), segs, { wander: 0.08, up: 0.05 }),
        radii: taper(segs, Math.max(at.r * 0.5, 0.04), 0.025, 0.2, 8)
      };
      branches.push(branch);

      const tw = [0.45, 0.75];
      for (let m = 0; m < tw.length; m += 1) {
        const bt = sample(branch, tw[m]);
        const bside = norm(cross(bt.dir, UP));
        const bsign = (k + m) % 2 === 0 ? 1 : -1;
        const tdir = norm(add(add(bt.dir, mul(bside, bsign * between(0.6, 1.0))), mul(UP, between(0.15, 0.45))));
        const tsegs = 4;
        const twig: Branch = {
          kind: "twig",
          level: 3,
          pts: grow(rng, bt.p, tdir, between(0.6, 0.9), tsegs, { wander: 0.1, up: 0.04 }),
          radii: taper(tsegs, Math.max(bt.r * 0.5, 0.02), 0.008, 0.15, 6)
        };
        branches.push(twig);
        addClump(twig.pts[tsegs], between(0.85, 1.2));
      }
      if (rng() < 0.55) addClump(branch.pts[segs], between(0.9, 1.25));
    }
    addClump(limb.pts[limb.pts.length - 1], between(1.0, 1.3));
  }
  addClump(trunk.pts[trunkSegs], 1.2);

  // Tone: lighter toward the top of the crown, with random variation.
  let top = 0;
  let reach = 0;
  for (const b of branches) for (const p of b.pts) top = Math.max(top, p[1]);
  const lowY = Math.min(...clumps.map((c) => c.position[1]));
  const highY = Math.max(...clumps.map((c) => c.position[1]));
  for (const c of clumps) {
    const h = (c.position[1] - lowY) / Math.max(highY - lowY, 0.001);
    c.tone = Math.min(1, Math.max(0, h * 0.65 + rng() * 0.45 - 0.05));
    top = Math.max(top, c.position[1] + c.scale[1]);
    reach = Math.max(reach, Math.hypot(c.position[0], c.position[2]) + Math.max(c.scale[0], c.scale[2]));
  }

  const knotAt = sample(trunk, 0.2);
  return {
    seed,
    branches,
    clumps,
    swing,
    birdhouse,
    knot: { center: knotAt.p, radius: knotAt.r, azimuth: 0.15 },
    rootAzimuths,
    top,
    reach
  };
}
