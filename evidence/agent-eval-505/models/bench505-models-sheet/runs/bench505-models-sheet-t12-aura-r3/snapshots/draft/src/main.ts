import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, sky, geometry, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; branchCount: number; foliageClumpCount: number; seed: number };
  }
}

type V3 = [number, number, number];
const SEED = 20240611;

// ---------- seeded random ----------
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- vector helpers ----------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const perpTo = (d: V3): V3 => norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));

// ---------- mound ----------
const MOUND_R = 8;
const moundY = (r: number): number => Math.max(0, -0.9 + 1.5 * Math.sqrt(Math.max(0, 1 - (r / MOUND_R) ** 2)));

// ---------- tree generation ----------
interface Branch {
  level: number;
  pts: V3[];
  dirs: V3[];
  radii: number[];
  length: number;
  color: V3;
  sides: number;
}

const TRUNK_H = 5.5;
const trunkRadius = (t: number): number => {
  const h = t * TRUNK_H;
  return (0.7 - 0.36 * Math.pow(t, 0.8)) * (1 + 0.8 * Math.exp(-h / 0.6));
};

function buildTree(seed: number): { branches: Branch[]; tips: { pos: V3; dir: V3; level: number }[]; trunk: Branch; limbs: Branch[] } {
  const rand = makeRng(seed);
  const range = (a: number, b: number): number => a + (b - a) * rand();
  const branches: Branch[] = [];
  const tips: { pos: V3; dir: V3; level: number }[] = [];

  const grow = (
    start: V3, dir: V3, length: number, radiusAt: (t: number) => number, level: number,
    steps: number, tropism: number, wobble: number, color: V3, sides: number
  ): Branch => {
    const pts: V3[] = [], dirs: V3[] = [], radii: number[] = [];
    let p = start, d = norm(dir);
    const step = length / steps;
    for (let i = 0; i <= steps; i += 1) {
      pts.push(p);
      dirs.push(d);
      radii.push(radiusAt(i / steps));
      d = norm([d[0] + (rand() - 0.5) * wobble, d[1] + tropism + (rand() - 0.5) * wobble * 0.6, d[2] + (rand() - 0.5) * wobble]);
      p = add(p, mul(d, step));
    }
    const b: Branch = { level, pts, dirs, radii, length, color, sides };
    branches.push(b);
    return b;
  };

  const child = (parent: Branch, t: number, azimuth: number, angle: number, lenScale: number, level: number, up: number): Branch => {
    const steps = parent.pts.length - 1;
    const idx = Math.max(1, Math.min(steps - 1, Math.round(t * steps)));
    const pd = parent.dirs[idx]!;
    const u = perpTo(pd), v = cross(pd, u);
    let dir = add(mul(pd, Math.cos(angle)), mul(add(mul(u, Math.cos(azimuth)), mul(v, Math.sin(azimuth))), Math.sin(angle)));
    dir = norm(add(dir, [0, up, 0]));
    const r0 = parent.radii[idx]! * 0.72;
    const r1 = Math.max(0.012, r0 * 0.28);
    const len = parent.length * lenScale * range(0.85, 1.15);
    const base = level === 2 ? [0.4, 0.28, 0.18] : [0.46, 0.33, 0.21];
    const col: V3 = [base[0]! * range(0.9, 1.1), base[1]! * range(0.9, 1.1), base[2]! * range(0.9, 1.1)];
    return grow(parent.pts[idx]!, dir, len, (s) => r0 + (r1 - r0) * s, level, level === 2 ? 6 : 4, level === 2 ? 0.06 : 0.1, 0.3, col, 6);
  };

  // trunk (slightly leaning, buried a bit in the mound)
  const trunk = grow([0, 0.1, 0], [range(-0.05, 0.05), 1, range(-0.05, 0.05)], TRUNK_H, trunkRadius, 0, 18, 0.0, 0.07, [0.3, 0.2, 0.13], 12);

  // surface roots
  const rootCount = 7;
  for (let k = 0; k < rootCount; k += 1) {
    const a = (k / rootCount) * Math.PI * 2 + range(-0.25, 0.25);
    const reach = range(3.0, 4.0);
    const r0 = range(0.4, 0.55);
    const steps = 8;
    const pts: V3[] = [], dirs: V3[] = [], radii: number[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const s = i / steps;
      const ang = a + Math.sin(s * 5 + k) * 0.18;
      const r = 0.2 + s * reach;
      const rad = Math.max(0.05, r0 * (1 - s) * (1 - s) + 0.05);
      const hump = 0.45 * (1 - s) * (1 - s);
      pts.push([Math.cos(ang) * r, moundY(r) + rad * 0.35 + hump - (s > 0.85 ? 0.1 : 0), Math.sin(ang) * r]);
      radii.push(rad);
    }
    for (let i = 0; i <= steps; i += 1) {
      const n = pts[Math.min(steps, i + 1)]!, p = pts[Math.max(0, i - 1)]!;
      dirs.push(norm(sub(n, p)));
    }
    branches.push({ level: 0, pts, dirs, radii, length: reach, color: [0.28, 0.19, 0.12], sides: 8 });
  }

  // major limbs
  const limbs: Branch[] = [];
  const limbCount = 5;
  const az0 = range(0, Math.PI * 2);
  for (let k = 0; k < limbCount; k += 1) {
    const t = 0.55 + (k / (limbCount - 1)) * 0.4;
    const idx = Math.round(t * 18);
    const a = az0 + k * 2.4 + range(-0.3, 0.3);
    const phi = range(0.95, 1.25);
    const dir: V3 = [Math.sin(phi) * Math.cos(a), Math.cos(phi), Math.sin(phi) * Math.sin(a)];
    const r0 = trunk.radii[idx]! * 0.7;
    const r1 = r0 * 0.3;
    limbs.push(grow(trunk.pts[idx]!, dir, range(3.8, 4.8), (s) => r0 + (r1 - r0) * s, 1, 8, 0.07, 0.25, [0.34, 0.23, 0.15], 8));
  }
  // leader
  {
    const r0 = trunk.radii[18]! * 0.95;
    limbs.push(grow(trunk.pts[18]!, [range(-0.15, 0.15), 1, range(-0.15, 0.15)], 3.2, (s) => r0 + (r0 * 0.3 - r0) * s, 1, 8, 0.0, 0.25, [0.34, 0.23, 0.15], 8));
  }

  // secondary branches and twigs
  const level2: Branch[] = [];
  for (const limb of limbs) {
    const baseAz = range(0, Math.PI * 2);
    [0.35, 0.6, 0.85].forEach((t, i) => {
      level2.push(child(limb, t, baseAz + i * 2.1 + range(-0.4, 0.4), range(0.55, 0.9), 0.5, 2, 0.15));
    });
  }
  const level3: Branch[] = [];
  for (const b of level2) {
    const baseAz = range(0, Math.PI * 2);
    [0.5, 0.9].forEach((t, i) => {
      level3.push(child(b, t, baseAz + i * 2.6, range(0.5, 0.9), 0.62, 3, 0.2));
    });
  }

  for (const b of [...limbs, ...level2, ...level3]) {
    tips.push({ pos: b.pts[b.pts.length - 1]!, dir: b.dirs[b.dirs.length - 1]!, level: b.level });
  }
  return { branches, tips, trunk, limbs };
}

// ---------- tube mesh ----------
function tubeGeometry(branches: Branch[]) {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const b of branches) {
    const n = b.pts.length, S = b.sides;
    const base = pos.length / 3;
    const t0 = b.dirs[0]!;
    let u = perpTo(t0);
    for (let i = 0; i < n; i += 1) {
      const p = b.pts[i]!;
      const tan = norm(sub(b.pts[Math.min(n - 1, i + 1)]!, b.pts[Math.max(0, i - 1)]!));
      u = norm(sub(u, mul(tan, dot(u, tan))));
      const v = cross(tan, u);
      const shade = 1 - 0.25 * (i / (n - 1)) * (b.level === 0 ? 0 : 0.5);
      for (let k = 0; k < S; k += 1) {
        const a = (k / S) * Math.PI * 2;
        const rd = add(mul(u, Math.cos(a)), mul(v, Math.sin(a)));
        const q = add(p, mul(rd, b.radii[i]!));
        pos.push(q[0], q[1], q[2]);
        nor.push(rd[0], rd[1], rd[2]);
        const g = k % 2 === 0 ? 1 : 0.93;
        col.push(b.color[0] * shade * g, b.color[1] * shade * g, b.color[2] * shade * g, 1);
        for (let c = 0; c < 3; c += 1) {
          min[c] = Math.min(min[c]!, q[c]!);
          max[c] = Math.max(max[c]!, q[c]!);
        }
      }
    }
    for (let i = 0; i < n - 1; i += 1) {
      for (let k = 0; k < S; k += 1) {
        const k2 = (k + 1) % S;
        const a = base + i * S + k, c = base + i * S + k2, bb = base + (i + 1) * S + k, d = base + (i + 1) * S + k2;
        idx.push(a, c, bb, c, d, bb);
      }
    }
  }
  return geometry.define({
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: idx,
    bounds: { min, max }
  });
}

// ---------- build scene ----------
const tree = buildTree(SEED);
const rand = makeRng(SEED + 7);
const range = (a: number, b: number): number => a + (b - a) * rand();

let sc = scene({ background: "#bcd9ee" })
  .camera(camera.orbit({ position: [0, 6.5, 28], target: [0, 5.2, 0], fov: 40, near: 1, far: 220, autoRotate: 0.15 }))
  .add(sky.gradient({ zenith: "#5e9fd8", horizon: "#d6e8f2" }))
  .add(lights.hemisphere({ skyColor: "#cfe3f7", groundColor: "#6a7f45", intensity: 1.0 }))
  .add(lights.directional({ position: [11, 18, 8], target: [0, 2, 0], intensity: 3.2, color: "#fff1d6", shadow: true }))
  .add(effects.fog({ color: "#d6e8f2", density: 0.004 }))
  .add(primitives.plane({ name: "ground", size: [120, 1, 120], material: material.pbr({ color: "#4f8a38", roughness: 1 }) }))
  .add(primitives.sphere({ name: "mound", size: [MOUND_R * 2, 3, MOUND_R * 2], material: material.pbr({ color: "#68a542", roughness: 1 }) }).position(0, -0.9, 0));

// wood (trunk, roots, limbs, twigs) as one tapered tube mesh
sc = sc.add(geometry.custom(tubeGeometry(tree.branches), { name: "tree-wood", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }));

// foliage clumps
const greens = ["#2f6b2a", "#4a8a2e", "#6aa339", "#3b7d46", "#8ab53f"];
const leafMats = greens.map((c) => material.pbr({ color: c, roughness: 0.85 }));
let clumpCount = 0;
for (const tip of tree.tips) {
  const big = tip.level === 3 ? 1 : tip.level === 2 ? 0.8 : 0.7;
  const w = range(1.5, 2.6) * (0.85 + 0.15 * big);
  const h = w * range(0.7, 0.9);
  const c = add(tip.pos, add(mul(tip.dir, 0.35), [range(-0.2, 0.2), 0.3, range(-0.2, 0.2)]));
  const m = leafMats[Math.floor(rand() * leafMats.length)]!;
  sc = sc.add(primitives.sphere({ name: `clump-${clumpCount}`, size: [w, h, w], material: m }).position(c[0], c[1], c[2]));
  clumpCount += 1;
}

// knot / hollow on the trunk
{
  const tr = tree.trunk;
  const i = tr.pts.findIndex((p) => p[1] > 1.9);
  const p = tr.pts[i]!, r = tr.radii[i]!;
  sc = sc
    .add(primitives.sphere({ name: "knot-rim", size: [0.95, 1.2, 0.5], material: material.pbr({ color: "#5b3d26", roughness: 1 }) }).position(p[0], p[1], p[2] + r * 0.88))
    .add(primitives.sphere({ name: "hollow", size: [0.6, 0.85, 0.4], material: material.pbr({ color: "#140a05", roughness: 1 }) }).position(p[0], p[1] - 0.03, p[2] + r * 0.88 + 0.12));
}

// rope swing from the lowest major limb
{
  const cand = tree.limbs.slice(0, 5).reduce((a, b) => (a.pts[0]![1] < b.pts[0]![1] ? a : b));
  const idx = Math.round(cand.pts.length * 0.5) - 1;
  const p = cand.pts[idx]!, d = cand.dirs[idx]!;
  const perp = norm([-d[2], 0, d[0]]);
  const off = cand.radii[idx]! + 0.04;
  const seatY = moundY(Math.hypot(p[0], p[2])) + 1.1;
  const L = Math.max(1, p[1] - seatY);
  const rope = material.pbr({ color: "#b89a62", roughness: 1 });
  for (const s of [-1, 1]) {
    sc = sc.add(primitives.cylinder({ name: `rope-${s}`, size: [0.06, L, 0.06], material: rope }).position(p[0] + perp[0] * off * s, seatY + L / 2, p[2] + perp[2] * off * s));
  }
  sc = sc.add(primitives.cylinder({ name: "swing-seat", size: [0.9, 0.1, 0.9], material: material.pbr({ color: "#8a5a32", roughness: 0.8 }) }).position(p[0], seatY, p[2]));
}

// mushrooms
[[2.5, 2.2, 1], [-2.8, 2.6, 0.8], [3.4, -1.4, 0.65]].forEach(([x, z, s], i) => {
  const y = moundY(Math.hypot(x!, z!));
  sc = sc
    .add(primitives.cylinder({ name: `mushroom-stem-${i}`, size: [0.13 * s!, 0.36 * s!, 0.13 * s!], material: material.pbr({ color: "#efe6d2", roughness: 0.8 }) }).position(x!, y + 0.16 * s!, z!))
    .add(primitives.sphere({ name: `mushroom-cap-${i}`, size: [0.56 * s!, 0.3 * s!, 0.56 * s!], material: material.pbr({ color: "#c8382e", roughness: 0.6 }) }).position(x!, y + 0.38 * s!, z!));
});

// fallen leaves
{
  const leaves: AuraTransformSpec[] = [], leafColors: string[] = [];
  const autumn = ["#d9822b", "#c4492a", "#e0b030", "#8a9a2e", "#b5651d"];
  for (let i = 0; i < 40; i += 1) {
    const a = rand() * Math.PI * 2, r = 1.8 + rand() * 5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    leaves.push({ position: [x, moundY(r) + 0.03, z], rotation: [0, rand() * 6.28, 0], scale: [0.32, 0.03, 0.2] });
    leafColors.push(autumn[Math.floor(rand() * autumn.length)]!);
  }
  sc = sc.add(instances.box({ name: "fallen-leaves", transforms: leaves, colors: leafColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), castShadow: false }));
}

const app = createAuraApp("#app", { scene: sc });
await app.ready();

requestAnimationFrame(() => {
  window.__TASK_STATE__ = { ready: true, branchCount: tree.branches.length, foliageClumpCount: clumpCount, seed: SEED };
  window.__EVAL_READY__ = true;
});
