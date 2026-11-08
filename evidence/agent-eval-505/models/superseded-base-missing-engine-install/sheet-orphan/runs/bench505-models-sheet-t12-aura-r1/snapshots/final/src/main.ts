import { camera, createAuraApp, effects, group, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; branchCount: number; foliageClumpCount: number; seed: number };
  }
}

type V3 = [number, number, number];
type Kid = Parameters<typeof group>[1][number];

const SEED = 20240611;
let rs = SEED >>> 0;
const rand = (): number => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

const add3 = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const randUnit = (): V3 => norm([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]);

// Mound: flattened sphere of diameter 14, height 4, centred at y = -1.2 (top at 0.8).
const moundY = (r: number): number => -1.2 + 2 * Math.sqrt(Math.max(0, 1 - (r / 7) ** 2));

// ---- materials
const bark = material.pbr({ color: "#6b4a32", roughness: 0.95 });
const barkLight = material.pbr({ color: "#85603f", roughness: 0.95 });
const hollowMat = material.pbr({ color: "#140b06", roughness: 1 });
const grassMat = material.pbr({ color: "#6f9c3a", roughness: 1 });
const groundMat = material.pbr({ color: "#4f7430", roughness: 1 });
const ropeMat = material.pbr({ color: "#c9a96a", roughness: 0.9 });
const plankMat = material.pbr({ color: "#8a5a34", roughness: 0.8 });
const capMat = material.pbr({ color: "#c93a2b", roughness: 0.6 });
const stemMat = material.pbr({ color: "#efe4cc", roughness: 0.8 });
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
const palette = ["#b8401c", "#d9731f", "#e0a82a", "#8c9a2c", "#4f8a2e", "#c85a22"];
const leafMats = palette.map((c) => material.pbr({ color: c, roughness: 0.85 }));

const nodes: Kid[] = [];
let branchCount = 0;
let clumpCount = 0;
let nid = 0;

// A cylinder from `a` along unit `dir`. Yaw group (about Y) holds a pitch group (about X), so the Euler order never matters.
const segment = (a: V3, dir: V3, len: number, r0: number, r1: number, mat = bark): V3 => {
  const id = nid++;
  const r = (r0 + r1) / 2;
  const pitch = Math.acos(Math.max(-1, Math.min(1, dir[1])));
  const yaw = Math.atan2(dir[0], dir[2]);
  const cyl = primitives.cylinder({ name: `seg-${id}`, size: [r * 2, len, r * 2], material: mat, params: { radialSegments: 10 } }).position(0, len / 2, 0);
  const inner = group(`pitch-${id}`, [cyl], { position: [0, 0, 0] }).rotate(pitch, 0, 0);
  nodes.push(group(`yaw-${id}`, [inner], { position: a }).rotate(0, yaw, 0));
  const end = add3(a, dir, len);
  nodes.push(primitives.sphere({ name: `joint-${id}`, size: r * 2, material: mat }).position(end[0], end[1], end[2]));
  return end;
};

const clump = (at: V3): void => {
  const id = clumpCount++;
  const s = range(1.5, 2.8);
  const t = Math.floor(rand() * leafMats.length);
  const t2 = (t + 1 + Math.floor(rand() * 2)) % leafMats.length;
  const p: V3 = add3(at, randUnit(), 0.25);
  nodes.push(
    group(`clump-${id}`, [
      primitives.sphere({ name: `clump-${id}-core`, size: [s, s * 0.82, s], material: leafMats[t]! }),
      primitives.sphere({ name: `clump-${id}-lobe`, size: [s * 0.62, s * 0.5, s * 0.62], material: leafMats[t2]! }).position(s * 0.3, s * 0.2, -s * 0.2)
    ], { position: p })
  );
};

const nextDir = (parent: V3, follow: number): V3 => norm(add3(add3([0, 0, 0], parent, follow), add3(randUnit(), [0, 0.25, 0], 1), 0.75));

const grow = (start: V3, dir: V3, level: 2 | 3, flip: boolean): void => {
  const len = level === 2 ? range(1.5, 1.9) : range(0.95, 1.25);
  const r0 = level === 2 ? 0.15 : 0.09;
  const r1 = level === 2 ? 0.09 : 0.04;
  const d = level === 3 ? norm([dir[0], dir[1] - 0.12, dir[2]]) : dir;
  const end = segment(start, d, len, r0, r1, level === 2 ? bark : barkLight);
  branchCount += 1;
  if (level === 2) {
    grow(end, nextDir(d, flip ? 0.7 : 1.1), 3, false);
    grow(end, nextDir(d, 0.4), 3, true);
  } else {
    clump(end);
  }
};

// ---- trunk: five joints, stepwise taper, vertical start so the hollow sits on a known surface
const trunkY = [0.5, 1.6, 2.7, 3.7, 4.5];
const trunkR = [0.98, 0.82, 0.68, 0.55, 0.42];
const trunkPts: V3[] = [[0, 0.5, 0]];
const trunkDirs: V3[] = [[0, 1, 0], [0.04, 1, 0.02], [0.1, 1, -0.03], [0.14, 1, 0.05]];
for (let i = 0; i < 4; i += 1) {
  const prev = trunkPts[i]!;
  const d = norm(trunkDirs[i]!);
  const len = trunkY[i + 1]! - trunkY[i]!;
  trunkPts.push(segment(prev, d, len, trunkR[i]!, trunkR[i + 1]!));
  branchCount += 1;
}

// ---- root flare: cone at the base plus surface roots
nodes.push(primitives.cone({ name: "trunk-flare", size: [3.5, 1.5, 3.5], material: bark, params: { radialSegments: 14 } }).position(0, 1.0, 0));
const rootCount = 8;
for (let i = 0; i < rootCount; i += 1) {
  const a = (i / rootCount) * Math.PI * 2 + range(-0.2, 0.2);
  const d1 = norm([Math.cos(a) * 0.9, -0.35, Math.sin(a) * 0.9]);
  const start: V3 = [Math.cos(a) * 0.6, 1.15, Math.sin(a) * 0.6];
  const m = segment(start, d1, range(1.3, 1.7), 0.34, 0.24);
  const a2 = a + range(-0.3, 0.3);
  segment(m, norm([Math.cos(a2) * 0.9, -0.3, Math.sin(a2) * 0.9]), range(1.0, 1.4), 0.24, 0.12);
}

// ---- limbs
const limbs = [
  { j: 2, az: 0.6, el: 15 }, { j: 2, az: 2.7, el: 30 }, { j: 2, az: 4.8, el: 35 },
  { j: 3, az: 1.7, el: 45 }, { j: 3, az: 3.7, el: 42 }, { j: 3, az: 5.6, el: 48 },
  { j: 4, az: 0.9, el: 62 }, { j: 4, az: 3.2, el: 65 }, { j: 4, az: 5.3, el: 60 }
];
const swingHolder: Array<{ from: V3; to: V3; r: number }> = [];
limbs.forEach((l, idx) => {
  const az = l.az + range(-0.15, 0.15);
  const el = (l.el * Math.PI) / 180;
  const dir0: V3 = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
  const segLen = (3.6 - (l.el / 90) * 1.2) / 2;
  const base = trunkPts[l.j]!;
  const rBase = 0.36 - (l.j - 2) * 0.03;
  const mid = segment(base, dir0, segLen, rBase, rBase * 0.78);
  branchCount += 1;
  if (idx === 0) swingHolder.push({ from: base, to: mid, r: rBase * 0.78 });
  const dir1 = norm([dir0[0] + range(-0.2, 0.2), dir0[1] + 0.12, dir0[2] + range(-0.2, 0.2)]);
  const tip = segment(mid, dir1, segLen, rBase * 0.78, rBase * 0.5);
  branchCount += 1;
  grow(mid, nextDir(dir0, 0.6), 2, true);
  grow(tip, nextDir(dir1, 1.2), 2, false);
  grow(tip, nextDir(dir1, 0.5), 2, true);
});
// crown top
const top = trunkPts[4]!;
clump(add3(top, [0, 1.2, 0]));
clump(add3(top, [1.0, 0.7, 0.6]));
clump(add3(top, [-0.9, 0.8, -0.5]));

// ---- trunk details: hollow with a lip, and a knot
const hy = 1.75;
nodes.push(primitives.sphere({ name: "hollow", size: [0.62, 0.86, 0.5], material: hollowMat }).position(0.02, hy, 0.74));
for (let i = 0; i < 10; i += 1) {
  const a = (i / 10) * Math.PI * 2;
  nodes.push(primitives.sphere({ name: `hollow-lip-${i}`, size: 0.2, material: barkLight }).position(0.02 + Math.cos(a) * 0.37, hy + Math.sin(a) * 0.5, 0.76));
}
nodes.push(primitives.sphere({ name: "knot", size: [0.5, 0.5, 0.4], material: barkLight }).position(-0.62, 2.7, 0.42));
nodes.push(primitives.sphere({ name: "knot-eye", size: [0.2, 0.2, 0.15], material: hollowMat }).position(-0.65, 2.7, 0.6));

// ---- rope swing hanging from the first limb
const sw = swingHolder[0];
if (sw) {
  const p: V3 = [sw.from[0] + (sw.to[0] - sw.from[0]) * 0.92, sw.from[1] + (sw.to[1] - sw.from[1]) * 0.92 - sw.r, sw.from[2] + (sw.to[2] - sw.from[2]) * 0.92];
  const hd = norm([sw.to[0] - sw.from[0], 0, sw.to[2] - sw.from[2]]);
  const u: V3 = [-hd[2], 0, hd[0]];
  const seatY = moundY(Math.hypot(p[0], p[2])) + 0.9;
  const ropeLen = p[1] - seatY;
  const yaw = Math.atan2(-u[2], u[0]);
  nodes.push(
    group("swing", [
      primitives.cylinder({ name: "rope-a", size: [0.05, ropeLen, 0.05], material: ropeMat }).position(u[0] * 0.32, -ropeLen / 2, u[2] * 0.32),
      primitives.cylinder({ name: "rope-b", size: [0.05, ropeLen, 0.05], material: ropeMat }).position(-u[0] * 0.32, -ropeLen / 2, -u[2] * 0.32),
      primitives.box({ name: "seat", size: [0.9, 0.09, 0.28], material: plankMat }).position(0, -ropeLen - 0.04, 0).rotate(0, yaw, 0)
    ], { position: p }).runtime({ id: "swing", mutable: true })
  );
}

// ---- ground: mound, fallen leaves, mushrooms
const leafT: AuraTransformSpec[] = [];
const leafC: string[] = [];
for (let i = 0; i < 80; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = 1.4 + Math.sqrt(rand()) * 3.4;
  leafT.push({ position: [Math.cos(a) * r, moundY(r) + 0.03, Math.sin(a) * r], rotation: [0, rand() * 6.28, 0], scale: [range(0.22, 0.4), 0.04, range(0.14, 0.26)] });
  leafC.push(palette[Math.floor(rand() * palette.length)]!);
}
const mushrooms: Kid[] = [];
const spots: Array<[number, number, number]> = [[1.6, 1.9, 1], [2.1, 1.4, 0.75], [-1.9, 1.7, 0.85], [0.4, 2.7, 0.65]];
spots.forEach(([x, z, s], i) => {
  const y = moundY(Math.hypot(x, z));
  mushrooms.push(
    group(`mushroom-${i}`, [
      primitives.cylinder({ name: `mushroom-${i}-stem`, size: [0.1 * s, 0.26 * s, 0.1 * s], material: stemMat }).position(0, 0.1 * s, 0),
      primitives.sphere({ name: `mushroom-${i}-cap`, size: [0.34 * s, 0.17 * s, 0.34 * s], material: capMat }).position(0, 0.26 * s, 0)
    ], { position: [x, y, z] })
  );
});

let sc = scene({ background: "#f0d9b0" })
  .camera(camera.orbit({ position: [0, 6.5, 21], target: [0, 4.4, 0], fov: 40, near: 1, far: 200, autoRotate: 0.15 }))
  .add(sky.gradient({ zenith: "#4f88c8", horizon: "#f6dfb8", ground: "#8aa05a", horizonGlow: 0.4 }))
  .add(lights.hemisphere({ skyColor: "#cfe0f6", groundColor: "#7b6a3a", intensity: 0.9 }))
  .add(lights.directional({ name: "key", position: [9, 15, 7], target: [0, 2, 0], intensity: 3.2, color: "#fff0d6", shadow: true }))
  .add(effects.fog({ color: "#f0d9b0", density: 0.004 }))
  .add(primitives.plane({ name: "ground", size: [120, 1, 120], material: groundMat, castShadow: false }))
  .add(primitives.sphere({ name: "mound", size: [14, 4, 14], material: grassMat }).position(0, -1.2, 0));

for (const n of nodes) sc = sc.add(n);
for (const m of mushrooms) sc = sc.add(m);
sc = sc.add(instances.sphere({ name: "fallen-leaves", transforms: leafT, colors: leafC, material: white }));

const app = createAuraApp("#app", { scene: sc });
let t = 0;
app.onFrame((f: { dt: number }) => {
  t += f.dt;
  app.nodes.require("swing").setRotation(0.1 * Math.sin(t * 1.3), 0, 0.07 * Math.sin(t * 1.1));
});
await app.ready();

requestAnimationFrame(() => {
  window.__TASK_STATE__ = { ready: true, branchCount, foliageClumpCount: clumpCount, seed: SEED };
  window.__EVAL_READY__ = true;
});
