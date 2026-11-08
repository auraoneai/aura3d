import { camera, createAuraApp, effects, environments, group, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
    __EVAL_READY__?: boolean;
  }
}

type Kid = Parameters<typeof group>[1][number];
type V3 = [number, number, number];

let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- materials ----------
const wood = (color: string) => material.pbr({ color, roughness: 0.85 });
const oak = wood("#7d5630");
const oakDark = wood("#5f4122");
const oakLight = wood("#9a6e41");
const iron = material.pbr({ color: "#2c2c30", metallic: 0.75, roughness: 0.45 });
const white = material.pbr({ color: "#ffffff", roughness: 1 });

let counter = 0;
const nm = (p: string): string => `${p}${counter++}`;
const box = (size: V3, pos: V3, mat = oak, rot: V3 = [0, 0, 0]): Kid =>
  primitives.box({ name: nm("box"), size, material: mat }).position(...pos).rotate(...rot);
const cyl = (size: V3, pos: V3, mat = oak, rot: V3 = [0, 0, 0]): Kid =>
  primitives.cylinder({ name: nm("cyl"), size, material: mat }).position(...pos).rotate(...rot);
const ball = (size: V3, pos: V3, mat = iron): Kid =>
  primitives.sphere({ name: nm("ball"), size: 1, material: mat }).position(...pos).scale(size);

const parts: Kid[] = [];
const HALF_PI = Math.PI / 2;

// ---------- bed: planks ----------
const PLANKS = 10;
const plankW = 0.14;
for (let i = 0; i < PLANKS; i += 1) {
  const len = 1.96 + rand() * 0.1;
  const x = (i - (PLANKS - 1) / 2) * (plankW + 0.004);
  const col = `hsl(${26 + Math.floor(rand() * 10)}, ${38 + Math.floor(rand() * 10)}%, ${28 + Math.floor(rand() * 14)}%)`;
  parts.push(box([plankW, 0.05, len], [x, 0.975 + (rand() - 0.5) * 0.006, (rand() - 0.5) * 0.06], wood(col), [0, (rand() - 0.5) * 0.03, 0]));
}
// iron straps across the floor
for (const z of [-0.6, 0.6]) parts.push(box([1.46, 0.012, 0.07], [0, 1.004, z], iron));
// runners under the floor
for (const s of [-1, 1]) parts.push(box([0.09, 0.09, 2.04], [s * 0.6, 0.905, 0], oakDark));
// ---------- axle and blocks ----------
const AXLE_Z = 0.1, WHEEL_Y = 0.62;
parts.push(cyl([0.09, 2.3, 0.09], [0, WHEEL_Y, AXLE_Z], oakDark, [0, 0, HALF_PI]));
for (const s of [-1, 1]) {
  parts.push(box([0.12, 0.2, 0.16], [s * 0.6, 0.76, AXLE_Z], oakDark));
  parts.push(box([0.14, 0.02, 0.2], [s * 0.6, 0.86, AXLE_Z], iron));
}
// ---------- posts, rails, bolts ----------
const POST_X = 0.69, POST_Z = 0.93;
const railYs = [1.12, 1.32, 1.52];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  parts.push(box([0.07, 0.65, 0.07], [sx * POST_X, 1.3, sz * POST_Z], oakLight));
  for (const y of railYs) parts.push(ball([0.04, 0.04, 0.04], [sx * (POST_X + 0.036), y, sz * POST_Z]));
}
for (const sx of [-1, 1]) for (const y of railYs) {
  parts.push(box([0.04, 0.07, 1.86], [sx * POST_X, y, 0], oak));
}
for (const sz of [-1, 1]) for (const y of [1.2, 1.46]) {
  parts.push(box([1.38, 0.06, 0.04], [0, y, sz * POST_Z], oak));
}
// ---------- push handles (rear is -Z) ----------
for (const s of [-1, 1]) {
  parts.push(box([0.07, 0.07, 1.8], [s * 0.6, 1.0, -1.75], oakLight, [0.12, 0, 0]));
  parts.push(box([0.085, 0.085, 0.14], [s * 0.6, 1.1, -2.62], iron, [0.12, 0, 0]));
}
parts.push(box([1.2, 0.05, 0.05], [0, 0.96, -1.5], oakDark));
// ---------- front prop legs ----------
parts.push(box([1.3, 0.07, 0.07], [0, 0.88, 1.02], oakDark));
for (const s of [-1, 1]) {
  parts.push(box([0.07, 0.92, 0.07], [s * 0.5, 0.46, 1.17], oakLight, [-0.27, 0, 0]));
  parts.push(box([0.1, 0.03, 0.12], [s * 0.5, 0.015, 1.3], iron));
}

// ---------- wheels ----------
const SPOKES = 10, FELLOES = 12;
function wheel(id: string, side: number): Kid {
  const kids: Kid[] = [];
  kids.push(cyl([0.2, 0.24, 0.2], [0, 0, 0], oakDark, [0, 0, HALF_PI]));
  for (const o of [-0.08, 0.08]) kids.push(cyl([0.24, 0.035, 0.24], [o, 0, 0], iron, [0, 0, HALF_PI]));
  kids.push(ball([0.09, 0.09, 0.09], [side * 0.13, 0, 0]));
  for (let i = 0; i < SPOKES; i += 1) {
    const a = (i / SPOKES) * Math.PI * 2, m = 0.33;
    kids.push(box([0.05, 0.46, 0.06], [0, Math.cos(a) * m, Math.sin(a) * m], oakLight, [a, 0, 0]));
  }
  const seg = 2 * 0.57 * Math.tan(Math.PI / FELLOES);
  for (let i = 0; i < FELLOES; i += 1) {
    const a = ((i + 0.5) / FELLOES) * Math.PI * 2;
    kids.push(box([0.1, 0.08, seg + 0.02], [0, Math.cos(a) * 0.57, Math.sin(a) * 0.57], oak, [a, 0, 0]));
    kids.push(box([0.115, 0.022, seg + 0.01], [0, Math.cos(a) * 0.607, Math.sin(a) * 0.607], iron, [a, 0, 0]));
    if (i % 2 === 0) kids.push(ball([0.035, 0.035, 0.035], [side * 0.058, Math.cos(a) * 0.62, Math.sin(a) * 0.62]));
  }
  return group(id, kids, { position: [side * 0.9, WHEEL_Y, AXLE_Z] }).runtime({ id, mutable: true });
}

// ---------- load ----------
function barrel(x: number, z: number): void {
  parts.push(cyl([0.5, 0.7, 0.5], [x, 1.35, z], oakLight));
  parts.push(cyl([0.56, 0.5, 0.56], [x, 1.35, z], oak));
  for (const dy of [-0.27, -0.1, 0.1, 0.27]) parts.push(cyl([dy === -0.27 || dy === 0.27 ? 0.52 : 0.575, 0.035, dy === -0.27 || dy === 0.27 ? 0.52 : 0.575], [x, 1.35 + dy, z], iron));
  parts.push(cyl([0.44, 0.02, 0.44], [x, 1.705, z], oakDark));
}
barrel(-0.4, 0.55);
barrel(0.4, 0.6);

function crate(x: number, y: number, z: number, s: number, yaw: number): void {
  parts.push(box([s, s * 0.85, s], [x, y, z], oakLight, [0, yaw, 0]));
  for (const dy of [-0.4, 0.4]) parts.push(box([s + 0.02, s * 0.1, s + 0.02], [x, y + dy * s * 0.85, z], oakDark, [0, yaw, 0]));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const c = Math.cos(yaw), sn = Math.sin(yaw), ox = dx * s * 0.5, oz = dz * s * 0.5;
    parts.push(box([0.05, s * 0.85 + 0.02, 0.05], [x + ox * c + oz * sn, y, z - ox * sn + oz * c], oakDark, [0, yaw, 0]));
  }
}
crate(-0.38, 1.22, 0.0, 0.46, 0.08);
crate(0.38, 1.22, 0.02, 0.46, -0.1);
crate(-0.36, 1.6, 0.0, 0.34, 0.3);

function sack(x: number, y: number, z: number, color: string, w = 0.5, h = 0.5): void {
  const m = material.pbr({ color, roughness: 1 });
  parts.push(ball([w, h, w * 0.85], [x, y, z], m));
  parts.push(primitives.cone({ name: nm("tie"), size: [0.14, 0.16, 0.14], material: m }).position(x, y + h * 0.5, z));
  parts.push(cyl([0.075, 0.025, 0.075], [x, y + h * 0.5 - 0.03, z], oakDark));
}
sack(-0.33, 1.25, -0.6, "#c8b283");
sack(0.33, 1.25, -0.62, "#b9a577");
sack(0.0, 1.66, -0.6, "#d1bd8f", 0.48, 0.5);
sack(0.02, 1.25, -0.2, "#bfae80", 0.4, 0.44);

// ---------- scene ----------
let sc = scene({ background: "#e6d3ab" })
  .camera(camera.orbit({ position: [4.6, 2.9, 4.9], target: [0, 0.95, -0.5], fov: 40, near: 0.1, far: 120, autoRotate: 0.2 }))
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffe8c4", groundColor: "#6b4f33", intensity: 0.9 }))
  .add(lights.directional({ position: [6, 9, 4], target: [0, 0.5, -0.3], intensity: 3, color: "#ffd9a0", shadow: true }))
  .add(effects.fog({ color: "#e6d3ab", density: 0.012 }))
  .add(primitives.plane({ name: "ground", size: [40, 1, 40], material: material.pbr({ color: "#7a5a3a", roughness: 1 }) }));

for (const p of parts) sc = sc.add(p);
sc = sc.add(wheel("wheelL", -1)).add(wheel("wheelR", 1));

// dirt patches and stones
const patches: AuraTransformSpec[] = [], patchColors: string[] = [];
const stones: AuraTransformSpec[] = [], stoneColors: string[] = [];
for (let i = 0; i < 16; i += 1) {
  const a = rand() * 6.283, r = 1 + rand() * 9, d = 0.8 + rand() * 1.8;
  patches.push({ position: [Math.cos(a) * r, 0.004 + i * 0.0004, Math.sin(a) * r], scale: [d, 0.01, d] });
  patchColors.push(`hsl(${25 + Math.floor(rand() * 8)}, ${25 + Math.floor(rand() * 15)}%, ${28 + Math.floor(rand() * 14)}%)`);
}
while (stones.length < 16) {
  const a = rand() * 6.283, r = 1.6 + rand() * 7;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (Math.abs(x) < 1.6 && z > -3 && z < 1.7) continue;
  const s = 0.12 + rand() * 0.3;
  stones.push({ position: [x, s * 0.22, z], rotation: [0, rand() * 6, 0], scale: [s, s * 0.6, s * (0.8 + rand() * 0.4)] });
  stoneColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 25)}%)`);
}
sc = sc.add(instances.cylinder({ name: "patches", transforms: patches, colors: patchColors, material: white, params: { radialSegments: 16 } }))
  .add(instances.sphere({ name: "stones", transforms: stones, colors: stoneColors, material: white }));

const app = createAuraApp("#app", { scene: sc });
let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const a = t * 0.6;
  app.nodes.require("wheelL").setRotation(a, 0, 0);
  app.nodes.require("wheelR").setRotation(a, 0, 0);
});
await app.ready();
window.__TASK_STATE__ = { ready: true, wheelCount: 2, spokeCount: 2 * SPOKES, plankCount: PLANKS };
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
