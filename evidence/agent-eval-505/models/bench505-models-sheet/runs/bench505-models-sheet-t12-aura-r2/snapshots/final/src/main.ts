import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; branchCount: number; foliageClumpCount: number; seed: number };
  }
}

type V3 = [number, number, number];
type Q4 = [number, number, number, number];

const SEED = 7421;
const season = new URLSearchParams(window.location.search).get("season") === "autumn" ? "autumn" : "summer";

const PALETTES = {
  summer: {
    foliage: ["#2f6a2c", "#3f7d2a", "#5a9a34", "#7bb23e"],
    fallen: ["#6fa23a", "#8ab84a", "#c8b23a", "#a8742a"],
    grass: "#5f9a3a"
  },
  autumn: {
    foliage: ["#b8321c", "#d9701c", "#e8a722", "#9a5a1c"],
    fallen: ["#b8321c", "#d9701c", "#e8a722", "#8a4a1a"],
    grass: "#7d8a3a"
  }
} as const;
const palette = PALETTES[season];

// Seeded RNG (mulberry32): same seed gives the same tree.
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
const rand = makeRng(SEED);
const range = (a: number, b: number): number => a + (b - a) * rand();

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const along = (p: V3, d: V3, t: number): V3 => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];

// Rotation taking +Y onto direction d.
function quatFromUp(d: V3): Q4 {
  const x = d[2], y = 0, z = -d[0], w = 1 + d[1];
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

const moundY = (x: number, z: number): number => {
  const q = 1 - (x * x + z * z) / 64;
  return q > 0 ? -1.5 + 1.5 * Math.sqrt(q) : -1.5;
};

const barkDark = material.pbr({ color: "#5a3e27", roughness: 1 });
const barkMid = material.pbr({ color: "#68482c", roughness: 1 });
const barkLight = material.pbr({ color: "#7a5a38", roughness: 1 });
const leafMats = palette.foliage.map((c) => material.pbr({ color: c, roughness: 0.85 }));

interface Branch {
  start: V3;
  dir: V3;
  len: number;
  r0: number;
  r1: number;
  level: number;
}
const branches: Branch[] = [];
const clumpTips: V3[] = [];

function addBranch(start: V3, dir: V3, len: number, r0: number, r1: number, level: number): Branch {
  const b: Branch = { start, dir: norm(dir), len, r0, r1, level };
  branches.push(b);
  return b;
}

// --- Trunk: three stacked, slightly leaning segments ---
const trunkDirs: V3[] = [
  norm([range(-0.05, 0.05), 1, range(-0.05, 0.05)]),
  norm([range(-0.14, -0.04), 1, range(0.02, 0.1)]),
  norm([range(0.04, 0.14), 1, range(-0.1, -0.02)])
];
const trunkLens = [2.4, 1.9, 1.6];
const trunkRadii = [1.1, 0.85, 0.65, 0.5];
const trunkSegs: { start: V3; end: V3 }[] = [];
{
  let p: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const d = trunkDirs[i]!;
    addBranch(p, d, trunkLens[i]!, trunkRadii[i]!, trunkRadii[i + 1]!, 0);
    const e = along(p, d, trunkLens[i]!);
    trunkSegs.push({ start: p, end: e });
    p = e;
  }
}
const trunkTop = trunkSegs[2]!.end;
function trunkPoint(h: number): V3 {
  for (const s of trunkSegs) {
    if (h >= s.start[1] && h <= s.end[1]) {
      const t = (h - s.start[1]) / (s.end[1] - s.start[1]);
      return [s.start[0] + (s.end[0] - s.start[0]) * t, h, s.start[2] + (s.end[2] - s.start[2]) * t];
    }
  }
  return trunkTop;
}

// --- Major limbs, sub-branches, twigs ---
const LIMBS = 6;
let swingLimb: Branch | null = null;
let swingAzimuth = 0;
for (let i = 0; i < LIMBS; i += 1) {
  const azimuth = i === 0 ? 0.55 : i * 2.4 + range(-0.2, 0.2);
  const elev = i === 0 ? 1.25 : 1.15 - i * 0.11 + range(-0.08, 0.08);
  const h = 3.4 + i * 0.44;
  const dir = norm([Math.sin(elev) * Math.sin(azimuth), Math.cos(elev), Math.sin(elev) * Math.cos(azimuth)]);
  const len = (i === 0 ? 4.2 : 3.5 - i * 0.12) + range(0, 0.5);
  const limb = addBranch(trunkPoint(h), dir, len, 0.44 - i * 0.02, 0.2, 1);
  if (i === 0) {
    swingLimb = limb;
    swingAzimuth = azimuth;
  }
  const side0 = norm(cross([0, 1, 0], limb.dir));
  const subs = [0.5, 0.78, 1.0];
  subs.forEach((frac, k) => {
    const from = along(limb.start, limb.dir, limb.len * frac);
    const s = (k % 2 === 0 ? 1 : -1) * (k === 2 ? 0.45 : 0.9);
    const d: V3 = norm([
      limb.dir[0] * 0.8 + side0[0] * s + range(-0.15, 0.15),
      limb.dir[1] * 0.8 + 0.4 + range(-0.1, 0.1),
      limb.dir[2] * 0.8 + side0[2] * s + range(-0.15, 0.15)
    ]);
    const sub = addBranch(from, d, range(2.0, 2.8), 0.2 - k * 0.015, 0.09, 2);
    const side1 = norm(cross([0, 1, 0], sub.dir));
    [0.55, 1.0].forEach((f2, m) => {
      const from2 = along(sub.start, sub.dir, sub.len * f2);
      const s2 = (m === 0 ? 1 : -1) * range(0.5, 0.9) * (k % 2 === 0 ? 1 : -1);
      const d2: V3 = norm([
        sub.dir[0] * 0.8 + side1[0] * s2,
        sub.dir[1] * 0.8 + 0.3 + range(-0.1, 0.2),
        sub.dir[2] * 0.8 + side1[2] * s2
      ]);
      const twig = addBranch(from2, d2, range(1.3, 1.8), 0.09, 0.035, 3);
      clumpTips.push(along(twig.start, twig.dir, twig.len));
    });
  });
}

let sc = scene({ background: "#bcd8ee" })
  .camera(camera.orbit({ position: [0, 8, 27], target: [0, 4.8, 0], fov: 40, near: 1, far: 300, autoRotate: 0.12 }))
  .add(sky.gradient({ zenith: "#4a86c8", horizon: "#cfe4f2", ground: "#b9cfa8" }))
  .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.0 }))
  .add(lights.directional({ name: "sun", position: [9, 16, 7], target: [0, 2, 0], intensity: 3.2, shadow: { mapSize: 2048 } }))
  .add(effects.fog({ color: "#cfe4f2", density: 0.0035 }))
  .add(primitives.plane({ name: "ground", size: [300, 1, 300], material: material.pbr({ color: "#4b7a32", roughness: 1 }) }).position(0, -1.5, 0))
  .add(
    primitives.sphere({
      name: "mound",
      size: [16, 3, 16],
      material: material.pbr({ color: palette.grass, roughness: 1 }),
      params: { widthSegments: 48, heightSegments: 24 }
    }).position(0, -1.5, 0)
  );

// Branch meshes
branches.forEach((b, i) => {
  const dm = b.r0 * 2;
  const ratio = Math.max(0.05, Math.round((b.r1 / b.r0) * 20) / 20);
  const mid = along(b.start, b.dir, b.len / 2);
  const mat = b.level === 0 ? barkDark : b.level === 1 ? barkMid : barkLight;
  sc = sc.add(
    primitives.cylinder({
      name: `branch-${i}`,
      size: [dm, b.len, dm],
      material: mat,
      quaternion: quatFromUp(b.dir),
      params: { radialSegments: b.level >= 3 ? 7 : 14, radiusTop: 0.5 * ratio, radiusBottom: 0.5 }
    }).position(mid[0], mid[1], mid[2])
  );
});

// Trunk base flare and surface roots
sc = sc.add(
  primitives.cylinder({
    name: "trunk-flare",
    size: [3.0, 1.3, 3.0],
    material: barkDark,
    params: { radialSegments: 20, radiusTop: 0.5 * (2.1 / 3.0), radiusBottom: 0.5 }
  }).position(0, 0.25, 0)
);
let rootCount = 0;
const addRoot = (azimuth: number, startR: number, startY: number, horiz: number, down: number, len: number, r0: number, r1: number): void => {
  const d = norm([Math.cos(azimuth) * horiz, down, Math.sin(azimuth) * horiz]);
  const start: V3 = [Math.cos(azimuth) * startR, startY, Math.sin(azimuth) * startR];
  const mid = along(start, d, len / 2);
  const ratio = Math.max(0.05, Math.round((r1 / r0) * 20) / 20);
  sc = sc.add(
    primitives.cylinder({
      name: `root-${rootCount++}`,
      size: [r0 * 2, len, r0 * 2],
      material: barkDark,
      quaternion: quatFromUp(d),
      params: { radialSegments: 10, radiusTop: 0.5 * ratio, radiusBottom: 0.5 }
    }).position(mid[0], mid[1], mid[2])
  );
};
for (let i = 0; i < 7; i += 1) {
  const a = (i / 7) * Math.PI * 2 + range(-0.15, 0.15);
  addRoot(a, 0.7, 1.0, 0.85, -0.5, range(2.9, 3.4), 0.45, 0.12);
  addRoot(a + Math.PI / 7, 0.9, 0.6, 0.95, -0.3, range(2.0, 2.6), 0.3, 0.08);
}

// Foliage clumps
const clumpSpecs: { pos: V3; size: V3; tone: number }[] = [];
clumpTips.forEach((tip) => {
  const s = range(2.0, 3.4);
  clumpSpecs.push({ pos: [tip[0], tip[1] + 0.25, tip[2]], size: [s, s * range(0.7, 0.9), s * range(0.9, 1.1)], tone: Math.floor(rand() * leafMats.length) });
});
{
  const s = 3.2;
  clumpSpecs.push({ pos: [trunkTop[0], trunkTop[1] + 1.2, trunkTop[2]], size: [s, s * 0.8, s], tone: 3 });
}
clumpSpecs.forEach((c, i) => {
  sc = sc.add(
    primitives.sphere({
      name: `clump-${i}`,
      size: c.size,
      material: leafMats[c.tone]!,
      params: { widthSegments: 16, heightSegments: 10 }
    }).position(c.pos[0], c.pos[1], c.pos[2])
  );
});

// Trunk hollow and knot (faces +z at start)
sc = sc
  .add(primitives.sphere({ name: "hollow-rim", size: [1.0, 1.25, 0.5], material: barkLight }).position(0.02, 1.7, 0.72))
  .add(primitives.sphere({ name: "hollow", size: [0.62, 0.85, 0.4], material: material.pbr({ color: "#150d07", roughness: 1 }) }).position(0.02, 1.68, 0.82))
  .add(primitives.sphere({ name: "knot", size: [0.4, 0.4, 0.3], material: barkLight }).position(-0.55, 2.3, 0.72));

// Rope swing from the first limb
if (swingLimb !== null) {
  const p = along(swingLimb.start, swingLimb.dir, swingLimb.len * 0.7);
  const seatY = moundY(p[0], p[2]) + 1.0;
  const top = p[1] - 0.2;
  const ropeLen = top - seatY;
  const perp: V3 = [Math.cos(swingAzimuth), 0, -Math.sin(swingAzimuth)];
  const ropeMat = material.pbr({ color: "#b89a62", roughness: 1 });
  for (const sgn of [-1, 1]) {
    sc = sc.add(
      primitives.cylinder({ name: `rope-${sgn}`, size: [0.06, ropeLen, 0.06], material: ropeMat, params: { radialSegments: 6 } })
        .position(p[0] + perp[0] * 0.3 * sgn, seatY + ropeLen / 2, p[2] + perp[2] * 0.3 * sgn)
    );
  }
  sc = sc.add(
    primitives.box({ name: "swing-seat", size: [0.85, 0.08, 0.28], material: material.pbr({ color: "#8b5e34", roughness: 0.9 }) })
      .position(p[0], seatY, p[2])
      .rotate(0, swingAzimuth, 0)
  );
}

// Mushrooms
const mushrooms: [number, number, number][] = [
  [2.0, 3.0, 1.0],
  [2.6, 2.6, 0.7],
  [1.5, 3.4, 0.55]
];
mushrooms.forEach(([x, z, s], i) => {
  const y = moundY(x, z);
  sc = sc
    .add(primitives.cylinder({ name: `stem-${i}`, size: [0.16 * s, 0.4 * s, 0.16 * s], material: material.pbr({ color: "#efe6d2", roughness: 0.9 }), params: { radialSegments: 10 } }).position(x, y + 0.18 * s, z))
    .add(primitives.sphere({ name: `cap-${i}`, size: [0.55 * s, 0.32 * s, 0.55 * s], material: material.pbr({ color: "#c8352b", roughness: 0.7 }) }).position(x, y + 0.42 * s, z));
});

// Fallen leaves
const leafT: AuraTransformSpec[] = [];
const leafC: string[] = [];
for (let i = 0; i < 28; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = 1.8 + Math.sqrt(rand()) * 4.8;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  leafT.push({ position: [x, moundY(x, z) + 0.03, z], rotation: [0, rand() * 6.28, 0], scale: [0.34, 0.04, 0.2] });
  leafC.push(palette.fallen[Math.floor(rand() * palette.fallen.length)]!);
}
sc = sc.add(instances.sphere({ name: "fallen-leaves", transforms: leafT, colors: leafC, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), castShadow: false }));

const app = createAuraApp("#app", { scene: sc });
await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
  window.__TASK_STATE__ = { ready: true, branchCount: branches.length, foliageClumpCount: clumpSpecs.length, seed: SEED };
});
