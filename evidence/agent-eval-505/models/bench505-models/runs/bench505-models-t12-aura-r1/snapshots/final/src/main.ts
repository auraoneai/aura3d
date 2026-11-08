import {
  camera,
  createAuraApp,
  environments,
  geometry,
  instances,
  interactions,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { ready: boolean; branchCount: number; foliageClumpCount: number; seed: number };
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Seeded randomness and tiny vector helpers
// ---------------------------------------------------------------------------
type V3 = [number, number, number];

const SEED = 20240611;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const range = (lo: number, hi: number): number => lo + (hi - lo) * rand();

const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const vnorm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Palettes (season via ?season=autumn|summer|spring, default autumn)
// ---------------------------------------------------------------------------
const PALETTES: Record<string, string[]> = {
  autumn: ["#d98a1f", "#e6ae2e", "#c4512a", "#a3ae3c", "#6f9a2f", "#b8381f"],
  summer: ["#3f8a2f", "#58a53a", "#2f6f2a", "#7bbf45", "#4c9a3c"],
  spring: ["#8fcf5a", "#f2b6c9", "#b4e07a", "#e98fb0", "#6fb84a"]
};
const seasonParam = new URLSearchParams(window.location.search).get("season") ?? "autumn";
const palette: string[] = PALETTES[seasonParam] ?? PALETTES.autumn!;

// ---------------------------------------------------------------------------
// Terrain: a small grassy mound
// ---------------------------------------------------------------------------
const MOUND_R = 4.8;
const MOUND_H = 0.7;
const moundHeight = (r: number): number => (r >= MOUND_R ? 0 : MOUND_H * Math.pow(1 - (r / MOUND_R) ** 2, 1.5));

function buildMound() {
  const rings = 18;
  const segs = 56;
  const positions = new Float32Array((rings + 1) * segs * 3);
  const indices: number[] = [];
  for (let i = 0; i <= rings; i += 1) {
    const r = (i / rings) * MOUND_R;
    for (let j = 0; j < segs; j += 1) {
      const a = (j / segs) * Math.PI * 2;
      const k = (i * segs + j) * 3;
      positions[k] = Math.cos(a) * r;
      positions[k + 1] = moundHeight(r);
      positions[k + 2] = Math.sin(a) * r;
    }
  }
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < segs; j += 1) {
      const j2 = (j + 1) % segs;
      const A = i * segs + j;
      const B = i * segs + j2;
      const C = (i + 1) * segs + j;
      const D = (i + 1) * segs + j2;
      indices.push(A, B, C, B, D, C);
    }
  }
  const normals = geometry.computeNormals({ positions, indices });
  return geometry.define({ positions, normals, indices, bounds: geometry.computeBounds({ positions }) });
}

// ---------------------------------------------------------------------------
// Mesh builder: tapered tubes along polylines (parallel-transport frames)
// ---------------------------------------------------------------------------
class MeshBuf {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly idx: number[] = [];

  tube(points: V3[], radii: number[], segs: number, lobe?: (angle: number, ring: number) => number): void {
    const base = this.pos.length / 3;
    const n = points.length;
    const t0 = vnorm(vsub(points[1]!, points[0]!));
    const ref: V3 = Math.abs(t0[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let N = vnorm(vcross(t0, ref));
    let lastT: V3 = t0;
    for (let i = 0; i < n; i += 1) {
      const T = vnorm(vsub(points[Math.min(i + 1, n - 1)]!, points[Math.max(i - 1, 0)]!));
      N = vnorm(vsub(N, vmul(T, vdot(N, T))));
      const B = vcross(T, N);
      lastT = T;
      for (let s = 0; s < segs; s += 1) {
        const a = (s / segs) * Math.PI * 2;
        const d = vadd(vmul(N, Math.cos(a)), vmul(B, Math.sin(a)));
        const r = radii[i]! * (lobe ? lobe(a, i) : 1);
        const p = vadd(points[i]!, vmul(d, r));
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(d[0], d[1], d[2]);
      }
    }
    for (let i = 0; i < n - 1; i += 1) {
      for (let s = 0; s < segs; s += 1) {
        const s2 = (s + 1) % segs;
        const v0 = base + i * segs + s;
        const v1 = base + i * segs + s2;
        const c = base + (i + 1) * segs + s;
        const d = base + (i + 1) * segs + s2;
        this.idx.push(v0, v1, c, v1, d, c);
      }
    }
    // closing apex
    const apex = vadd(points[n - 1]!, vmul(lastT, radii[n - 1]! * 0.6));
    const apexIndex = this.pos.length / 3;
    this.pos.push(apex[0], apex[1], apex[2]);
    this.nor.push(lastT[0], lastT[1], lastT[2]);
    const lastRing = base + (n - 1) * segs;
    for (let s = 0; s < segs; s += 1) {
      this.idx.push(lastRing + s, lastRing + ((s + 1) % segs), apexIndex);
    }
  }

  toGeometry() {
    const positions = new Float32Array(this.pos);
    return geometry.define({
      positions,
      normals: new Float32Array(this.nor),
      indices: this.idx,
      bounds: geometry.computeBounds({ positions })
    });
  }
}

// ---------------------------------------------------------------------------
// Seeded branch generator
// ---------------------------------------------------------------------------
interface Branch {
  level: number;
  pts: V3[];
  radii: number[];
  length: number;
}

const BASE_Y = moundHeight(0);
const branches: Branch[] = [];

function grow(start: V3, dir: V3, length: number, us: number[], bend: number, up: number): V3[] {
  const pts: V3[] = [start];
  let d = vnorm(dir);
  let p = start;
  for (let i = 1; i < us.length; i += 1) {
    const step = (us[i]! - us[i - 1]!) * length;
    const jitter: V3 = [(rand() - 0.5) * bend, (rand() - 0.5) * bend * 0.6, (rand() - 0.5) * bend];
    d = vnorm(vadd(vadd(d, jitter), [0, up, 0]));
    p = vadd(p, vmul(d, step));
    pts.push(p);
  }
  return pts;
}

function makeBranch(level: number, start: V3, dir: V3, length: number, r0: number, r1: number, n: number): Branch {
  const us: number[] = [];
  for (let i = 0; i <= n; i += 1) us.push(level === 0 ? Math.pow(i / n, 1.6) : i / n);
  const bend = level === 0 ? 0.14 : level === 1 ? 0.2 : 0.3;
  const up = level === 0 ? 0.01 : level === 1 ? 0.05 : 0.08;
  const pts = grow(start, dir, length, us, bend, up);
  const radii = us.map((u) => {
    if (level === 0) return lerp(r0, r1, u) + 0.5 * Math.exp(-(u * length) / 0.34);
    return Math.max(0.022, lerp(r0, r1, Math.pow(u, 0.85)));
  });
  const branch: Branch = { level, pts, radii, length };
  branches.push(branch);
  return branch;
}

function perpBasis(t: V3): [V3, V3] {
  const ref: V3 = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const p1 = vnorm(vcross(t, ref));
  const p2 = vcross(t, p1);
  return [p1, p2];
}

function childOf(parent: Branch, u: number, azimuth: number, theta: number, upBias: number) {
  const n = parent.pts.length - 1;
  const k = clamp(Math.round(u * n), 1, n);
  const t = vnorm(vsub(parent.pts[Math.min(k + 1, n)]!, parent.pts[Math.max(k - 1, 0)]!));
  const [p1, p2] = perpBasis(t);
  const side = vadd(vmul(p1, Math.cos(azimuth)), vmul(p2, Math.sin(azimuth)));
  let dir = vadd(vmul(t, Math.cos(theta)), vmul(side, Math.sin(theta)));
  dir = vnorm(vadd(dir, [0, upBias, 0]));
  return { start: parent.pts[k]!, dir, radius: parent.radii[k]! };
}

// Level 0: trunk
const trunkLength = 3.1;
const trunk = makeBranch(0, [0, BASE_Y - 0.25, 0], [range(-0.06, 0.06), 1, range(-0.06, 0.06)], trunkLength, 0.5, 0.27, 16);

// Level 1: major limbs fanning around the trunk
const GOLDEN = 2.399963;
const limbCount = 8;
const limbs: Branch[] = [];
{
  const phase = range(0, Math.PI * 2);
  for (let i = 0; i < limbCount; i += 1) {
    const u = lerp(0.42, 1.0, i / (limbCount - 1));
    const az = phase + i * GOLDEN + range(-0.25, 0.25);
    const theta = lerp(1.15, 0.5, u) + range(-0.12, 0.12);
    const c = childOf(trunk, u, az, theta, 0.05);
    const len = 2.5 * range(0.85, 1.15) * (1.1 - 0.35 * u);
    limbs.push(makeBranch(1, c.start, c.dir, len, c.radius * 0.64, c.radius * 0.64 * 0.38, 9));
  }
}

// Level 2 and 3
const tips: { pos: V3; level: number }[] = [];
for (const limb of limbs) {
  const count = rand() < 0.5 ? 2 : 3;
  const phase = range(0, Math.PI * 2);
  for (let c = 0; c < count; c += 1) {
    const u = lerp(0.4, 0.92, (c + rand() * 0.5) / count);
    const az = phase + (c / count) * Math.PI * 2 + range(-0.4, 0.4);
    const ch = childOf(limb, u, az, range(0.55, 0.95), 0.16);
    const len = limb.length * range(0.5, 0.65);
    const l2 = makeBranch(2, ch.start, ch.dir, len, ch.radius * 0.62, ch.radius * 0.62 * 0.4, 6);
    const twigPhase = range(0, Math.PI * 2);
    for (let t = 0; t < 2; t += 1) {
      const tu = lerp(0.5, 1.0, (t + rand() * 0.4) / 2);
      const taz = twigPhase + t * Math.PI + range(-0.5, 0.5);
      const tc = childOf(l2, tu, taz, range(0.5, 0.9), 0.2);
      const l3 = makeBranch(3, tc.start, tc.dir, l2.length * range(0.55, 0.7), tc.radius * 0.6, 0.02, 4);
      tips.push({ pos: l3.pts[l3.pts.length - 1]!, level: 3 });
    }
    tips.push({ pos: l2.pts[l2.pts.length - 1]!, level: 2 });
  }
  tips.push({ pos: limb.pts[limb.pts.length - 1]!, level: 1 });
}

const branchCount = branches.length;

// ---------------------------------------------------------------------------
// Bark meshes: trunk + limbs + surface roots, and a lighter twig mesh
// ---------------------------------------------------------------------------
const bark = new MeshBuf();
const twigs = new MeshBuf();
const lobePhase = range(0, Math.PI * 2);
const trunkBaseY = trunk.pts[0]![1];
bark.tube(trunk.pts, trunk.radii, 14, (a, i) => {
  const h = trunk.pts[i]![1] - trunkBaseY;
  return 1 + 0.2 * Math.exp(-h / 0.8) * Math.cos(5 * a + lobePhase) + 0.06 * Math.exp(-h / 1.2) * Math.cos(3 * a + 1.3);
});
for (const b of branches) {
  if (b.level === 0) continue;
  const segs = b.level === 1 ? 9 : b.level === 2 ? 6 : 5;
  (b.level >= 2 ? twigs : bark).tube(b.pts, b.radii, segs);
}

// Surface roots flaring out of the trunk base and diving into the mound
const rootCount = 7;
{
  const rootPhase = range(0, Math.PI * 2);
  for (let i = 0; i < rootCount; i += 1) {
    const a0 = rootPhase + (i / rootCount) * Math.PI * 2 + range(-0.2, 0.2);
    const reach = range(1.7, 2.3);
    const wob = range(0.2, 0.5);
    const pts: V3[] = [];
    const radii: number[] = [];
    const steps = 9;
    for (let s = 0; s <= steps; s += 1) {
      const f = s / steps;
      const r = 0.15 + reach * Math.pow(f, 0.9);
      const ang = a0 + wob * Math.sin(f * 3 + i);
      const rad = lerp(0.3, 0.05, Math.pow(f, 0.8));
      const y = moundHeight(r) + rad * (0.35 - 0.6 * f) + 0.5 * Math.pow(1 - f, 2.2);
      pts.push([Math.cos(ang) * r, y, Math.sin(ang) * r]);
      radii.push(rad);
    }
    bark.tube(pts, radii, 7);
  }
}

// ---------------------------------------------------------------------------
// Foliage clumps hanging on branch ends
// ---------------------------------------------------------------------------
interface Clump {
  pos: V3;
  radius: number;
}
const clumps: Clump[] = [];
const foliageTransforms: AuraTransformSpec[] = [];
const foliageColors: string[] = [];
for (const tip of tips) {
  const radius = tip.level === 3 ? range(0.5, 0.85) : tip.level === 2 ? range(0.7, 1.05) : range(0.85, 1.15);
  const center: V3 = [tip.pos[0], tip.pos[1] + 0.12, tip.pos[2]];
  clumps.push({ pos: center, radius });
  const ci = Math.floor(rand() * palette.length);
  foliageTransforms.push({ position: center, scale: [radius * 2, radius * 1.65, radius * 2] });
  foliageColors.push(palette[ci]!);
  for (let s = 0; s < 2; s += 1) {
    const az = rand() * Math.PI * 2;
    const el = range(-0.2, 0.9);
    const sr = radius * range(0.55, 0.75);
    const off: V3 = [
      Math.cos(az) * Math.cos(el) * radius * 0.75,
      Math.sin(el) * radius * 0.6,
      Math.sin(az) * Math.cos(el) * radius * 0.75
    ];
    foliageTransforms.push({ position: vadd(center, off), scale: [sr * 2, sr * 1.65, sr * 2] });
    foliageColors.push(palette[(ci + 1 + Math.floor(rand() * (palette.length - 1))) % palette.length]!);
  }
}
const foliageClumpCount = clumps.length;

// ---------------------------------------------------------------------------
// Ground details: fallen leaves, grass tufts
// ---------------------------------------------------------------------------
const leafTransforms: AuraTransformSpec[] = [];
const leafColors: string[] = [];
for (let i = 0; i < 34; i += 1) {
  const r = range(1.3, 4.3);
  const a = rand() * Math.PI * 2;
  leafTransforms.push({
    position: [Math.cos(a) * r, moundHeight(r) + 0.03, Math.sin(a) * r],
    rotation: [range(-0.15, 0.15), rand() * Math.PI * 2, range(-0.15, 0.15)],
    scale: [range(0.16, 0.26), 0.025, range(0.1, 0.17)]
  });
  leafColors.push(palette[Math.floor(rand() * palette.length)]!);
}

const tuftTransforms: AuraTransformSpec[] = [];
const tuftColors: string[] = [];
const grassTones = ["#4f8a2b", "#6aa83a", "#3f7a28", "#86b848"];
for (let i = 0; i < 110; i += 1) {
  const r = 1.9 + 3.2 * Math.sqrt(rand());
  const a = rand() * Math.PI * 2;
  const h = range(0.16, 0.34);
  tuftTransforms.push({
    position: [Math.cos(a) * r, moundHeight(r) + h * 0.4, Math.sin(a) * r],
    rotation: [range(-0.25, 0.25), 0, range(-0.25, 0.25)],
    scale: [0.07, h, 0.07]
  });
  tuftColors.push(grassTones[Math.floor(rand() * grassTones.length)]!);
}

// ---------------------------------------------------------------------------
// Trunk lookup for details on its surface
// ---------------------------------------------------------------------------
function trunkAt(y: number): { c: V3; r: number } {
  const p = trunk.pts;
  for (let i = 0; i < p.length - 1; i += 1) {
    const a = p[i]!;
    const b = p[i + 1]!;
    if (y >= a[1] && y <= b[1]) {
      const t = (y - a[1]) / Math.max(1e-6, b[1] - a[1]);
      return {
        c: [lerp(a[0], b[0], t), y, lerp(a[2], b[2], t)],
        r: lerp(trunk.radii[i]!, trunk.radii[i + 1]!, t)
      };
    }
  }
  const last = p.length - 1;
  return { c: p[last]!, r: trunk.radii[last]! };
}

// ---------------------------------------------------------------------------
// Rope swing from the most horizontal major limb
// ---------------------------------------------------------------------------
let swingLimb = limbs[0]!;
let swingScore = -Infinity;
for (const limb of limbs) {
  const k = Math.round(limb.pts.length * 0.55);
  const a = limb.pts[Math.max(0, k - 1)]!;
  const b = limb.pts[Math.min(limb.pts.length - 1, k + 1)]!;
  const d = vnorm(vsub(b, a));
  const score = -Math.abs(d[1]) * 2 - Math.abs(limb.pts[k]![1] - 3.4) * 0.3 - (Math.hypot(limb.pts[k]![0], limb.pts[k]![2]) < 1.2 ? 1 : 0);
  if (score > swingScore) {
    swingScore = score;
    swingLimb = limb;
  }
}
const swingIndex = Math.round(swingLimb.pts.length * 0.55);
const swingPoint = swingLimb.pts[swingIndex]!;
const swingRadius = swingLimb.radii[swingIndex]!;
const swingGround = moundHeight(Math.hypot(swingPoint[0], swingPoint[2]));
const ropeTop = swingPoint[1] - swingRadius * 0.8;
const ropeLen = clamp(ropeTop - (swingGround + 1.0), 0.9, 2.6);

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const barkMat = material.pbr({ color: "#6b4a30", roughness: 0.95, doubleSided: true });
const twigMat = material.pbr({ color: "#7d5a3a", roughness: 0.95, doubleSided: true });
const leafMat = material.pbr({ color: "#ffffff", roughness: 0.85 });

const focus: V3 = [0, 3.7, 0];

let stage = scene({ background: "#a9cdea" })
  .add(sky.gradient({ zenith: "#3f86d6", horizon: "#cfe6f5", ground: "#9fc08a", exponent: 0.8, name: "sky" }))
  .add(environments.neutral({ intensity: 0.75, background: false }))
  .add(lights.hemisphere({ skyColor: "#bcd7ff", groundColor: "#6b7f48", intensity: 0.7 }))
  .add(
    lights.directional({
      name: "key",
      position: [4.5, 11, 3.5],
      target: [0, 2, 0],
      intensity: 3.2,
      color: "#fff0d6",
      shadow: { mapSize: 2048, filter: "pcf", cascades: 1, fit: { center: [0, 2, 0], extent: 10, depth: 40 } }
    })
  )
  .add(
    primitives.plane({
      name: "ground",
      size: [80, 1, 80],
      position: [0, -0.01, 0],
      material: material.pbr({ color: "#5d8f36", roughness: 1 }),
      castShadow: false,
      receiveShadow: true
    })
  )
  .add(
    geometry.custom(buildMound(), {
      name: "mound",
      material: material.pbr({ color: "#6fa83a", roughness: 1, doubleSided: true }),
      castShadow: false,
      receiveShadow: true
    })
  )
  .add(geometry.custom(bark.toGeometry(), { name: "bark", material: barkMat, castShadow: true, receiveShadow: true }))
  .add(geometry.custom(twigs.toGeometry(), { name: "twigs", material: twigMat, castShadow: true, receiveShadow: true }))
  .add(
    instances.sphere({
      name: "foliage",
      transforms: foliageTransforms,
      colors: foliageColors,
      material: leafMat,
      castShadow: true,
      receiveShadow: true,
      params: { widthSegments: 12, heightSegments: 9 }
    })
  )
  .add(
    instances.sphere({
      name: "fallen-leaves",
      transforms: leafTransforms,
      colors: leafColors,
      material: leafMat,
      castShadow: false,
      receiveShadow: true,
      params: { widthSegments: 8, heightSegments: 5 }
    })
  )
  .add(
    instances.cone({
      name: "grass-tufts",
      transforms: tuftTransforms,
      colors: tuftColors,
      material: leafMat,
      castShadow: false,
      receiveShadow: true,
      params: { radialSegments: 5 }
    })
  );

// Hollow on the trunk, facing the start camera
{
  const dir = vnorm([0.2, 0, 1]);
  const t = trunkAt(BASE_Y + 0.85);
  const yaw = Math.atan2(dir[0], dir[2]);
  const rim = vadd(t.c, vmul(dir, t.r * 0.9));
  const hole = vadd(t.c, vmul(dir, t.r * 0.99));
  stage = stage
    .add(primitives.sphere({ name: "hollow-rim", size: [0.66, 0.88, 0.3], position: rim, rotation: [0, yaw, 0], material: material.pbr({ color: "#4a3220", roughness: 1 }), castShadow: true }))
    .add(primitives.sphere({ name: "hollow", size: [0.44, 0.66, 0.14], position: hole, rotation: [0, yaw, 0], material: material.pbr({ color: "#0e0804", roughness: 1 }), castShadow: false }));
}
// Knot higher up on another side
{
  const dir = vnorm([-0.8, 0, 0.6]);
  const t = trunkAt(BASE_Y + 1.7);
  const yaw = Math.atan2(dir[0], dir[2]);
  stage = stage
    .add(primitives.sphere({ name: "knot", size: [0.34, 0.3, 0.3], position: vadd(t.c, vmul(dir, t.r * 0.95)), rotation: [0, yaw, 0], material: material.pbr({ color: "#5a3d26", roughness: 1 }), castShadow: true }))
    .add(primitives.sphere({ name: "knot-eye", size: [0.14, 0.14, 0.1], position: vadd(t.c, vmul(dir, t.r * 0.95 + 0.14)), rotation: [0, yaw, 0], material: material.pbr({ color: "#1a0f08", roughness: 1 }), castShadow: false }));
}

// Mushrooms
{
  const spots: Array<[number, number, number]> = [
    [2.3, 1.15, 1],
    [2.6, 1.4, 0.7],
    [2.1, 0.75, 0.8]
  ];
  spots.forEach(([r, a, s], i) => {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = moundHeight(r);
    const stemH = 0.2 * s;
    stage = stage
      .add(primitives.cylinder({ name: `mushroom-stem-${i}`, size: [0.07 * s + 0.03, stemH, 0.07 * s + 0.03], position: [x, y + stemH / 2 - 0.01, z], material: material.pbr({ color: "#efe4cc", roughness: 0.8 }), castShadow: true }))
      .add(primitives.sphere({ name: `mushroom-cap-${i}`, size: [0.3 * s, 0.17 * s, 0.3 * s], position: [x, y + stemH, z], material: material.pbr({ color: "#c8372d", roughness: 0.6 }), castShadow: true }));
  });
}

// Rope swing
{
  const ropeMat = material.pbr({ color: "#cdb98c", roughness: 1 });
  const seatY = ropeTop - ropeLen;
  for (const dx of [-0.17, 0.17]) {
    stage = stage.add(
      primitives.cylinder({ name: `rope-${dx < 0 ? "l" : "r"}`, size: [0.04, ropeLen, 0.04], position: [swingPoint[0] + dx, ropeTop - ropeLen / 2, swingPoint[2]], material: ropeMat, castShadow: true })
    );
  }
  stage = stage.add(
    primitives.box({ name: "swing-seat", size: [0.5, 0.06, 0.2], position: [swingPoint[0], seatY - 0.02, swingPoint[2]], material: material.pbr({ color: "#a9733b", roughness: 0.9 }), castShadow: true })
  );
}

stage = stage
  .add(interactions.orbit({ target: focus, position: [0, 4.6, 14.5], autoRotate: 0.12 }))
  .camera(camera.orbit({ position: [0, 4.6, 14.5], target: focus, fov: 40 }));

const app = createAuraApp("#app", { scene: stage, resize: false });

let marked = false;
function markReady(): void {
  if (marked) return;
  marked = true;
  window.__TASK_STATE__ = { ready: true, branchCount, foliageClumpCount, seed: SEED };
  window.__EVAL_READY__ = true;
}

void app.ready().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(markReady));
});
