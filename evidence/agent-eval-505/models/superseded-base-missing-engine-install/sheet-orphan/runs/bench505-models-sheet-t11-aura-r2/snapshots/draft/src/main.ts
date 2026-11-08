import { camera, createAuraApp, effects, environments, group, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
  }
}

type V3 = [number, number, number];

let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const wood = (h = 28, s = 38, l = 36) => material.pbr({ color: `hsl(${h + rand() * 6}, ${s}%, ${l + rand() * 8}%)`, roughness: 0.85 });
const darkWood = material.pbr({ color: "#5e4126", roughness: 0.9 });
const iron = material.pbr({ color: "#4b4e55", metallic: 0.55, roughness: 0.5 });
const burlap = (i: number) => material.pbr({ color: `hsl(${38 + i * 3}, 38%, ${52 + i * 3}%)`, roughness: 1 });

let uid = 0;
const nm = (p: string) => `${p}${uid++}`;
const box = (size: V3, pos: V3, mat: ReturnType<typeof wood>, rot: V3 = [0, 0, 0]) =>
  primitives.box({ name: nm("box"), size, material: mat }).position(...pos).rotate(...rot);
const cyl = (size: V3, pos: V3, mat: ReturnType<typeof wood>, rot: V3 = [0, 0, 0]) =>
  primitives.cylinder({ name: nm("cyl"), size, material: mat }).position(...pos).rotate(...rot);
const ball = (size: V3, pos: V3, mat: ReturnType<typeof wood>, rot: V3 = [0, 0, 0]) =>
  primitives.sphere({ name: nm("ball"), size, material: mat }).position(...pos).rotate(...rot);

let sc = scene({ background: "#d8c49f" })
  .camera(camera.orbit({ position: [3.8, 2.5, 4.6], target: [0, 0.85, -0.3], fov: 40, near: 0.1, far: 120, autoRotate: 0.22 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffe9c8", groundColor: "#7a5a3a", intensity: 0.9 }))
  .add(lights.directional({ name: "sun", position: [5, 7, 3.5], target: [0, 0.6, 0], intensity: 3.2, color: "#ffd9a6", shadow: true }))
  .add(effects.fog({ color: "#d8c49f", density: 0.02 }))
  .add(primitives.plane({ name: "ground", size: [80, 1, 80], material: material.pbr({ color: "#7b5c3d", roughness: 1 }) }));

// ---- ground stones ----
const stones: AuraTransformSpec[] = [];
const stoneColors: string[] = [];
const stoneList: Array<[number, number, number]> = [
  [1.9, 0.9, 0.22], [2.4, -0.8, 0.14], [-2.0, 1.1, 0.18], [-1.7, -1.2, 0.26], [0.2, 2.2, 0.16],
  [1.6, -2.6, 0.2], [-0.9, -3.0, 0.13], [-2.8, -0.1, 0.12], [3.0, 2.0, 0.3], [-3.0, 2.4, 0.24], [0.9, 3.3, 0.12]
];
for (const [x, z, s] of stoneList) {
  stones.push({ position: [x, s * 0.25, z], rotation: [rand() * 0.5, rand() * 6, rand() * 0.5], scale: [s * 2, s * 1.2, s * 1.7] });
  stoneColors.push(`hsl(${30 + Math.floor(rand() * 15)}, 6%, ${38 + Math.floor(rand() * 22)}%)`);
}
sc = sc.add(instances.sphere({ name: "stones", transforms: stones, colors: stoneColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }));

// ---- bed floor planks ----
const FLOOR_Y = 0.85;
const TOP_Y = FLOOR_Y + 0.02;
const PLANKS = 9;
const bed: ReturnType<typeof box>[] = [];
let plankCount = 0;
for (let i = 0; i < PLANKS; i += 1) {
  const len = 1.8 + (rand() - 0.5) * 0.12;
  const x = -0.6 + (i + 0.5) * (1.2 / PLANKS);
  bed.push(box([1.2 / PLANKS - 0.012, 0.04, len], [x, FLOOR_Y + (rand() - 0.5) * 0.008, (rand() - 0.5) * 0.04], wood(), [0, (rand() - 0.5) * 0.025, 0]));
  plankCount += 1;
}
// low side and end boards
for (const sx of [-1, 1]) {
  bed.push(box([0.03, 0.16, 1.74 + rand() * 0.04], [sx * 0.595, 0.95, 0], wood(26, 36, 33)));
  plankCount += 1;
}
for (const sz of [-1, 1]) {
  bed.push(box([1.14, 0.16, 0.03], [0, 0.95, sz * 0.895], wood(26, 36, 33)));
  plankCount += 1;
}
sc = sc.add(group("bed", bed));

// ---- frame: posts, rails, runners, handles, prop ----
const frame: ReturnType<typeof box>[] = [];
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    frame.push(box([0.07, 0.72, 0.07], [sx * 0.6, 1.19, sz * 0.9], darkWood));
    frame.push(box([0.09, 0.05, 0.09], [sx * 0.6, 0.98, sz * 0.9], iron)); // iron strap on post
    frame.push(ball([0.035, 0.035, 0.035], [sx * 0.6 + sx * 0.04, 1.3, sz * 0.9], iron)); // bolt
  }
}
for (const y of [1.12, 1.44]) {
  for (const sx of [-1, 1]) frame.push(box([0.035, 0.06, 1.83], [sx * 0.64, y, 0], wood(24, 34, 30)));
  for (const sz of [-1, 1]) frame.push(box([1.27, 0.06, 0.035], [0, y + 0.0, sz * 0.94], wood(24, 34, 30)));
}
for (const sx of [-1, 1]) {
  frame.push(box([0.07, 0.07, 2.1], [sx * 0.45, 0.795, 0.05], darkWood)); // runner
  const a = 0.085;
  frame.push(box([0.065, 0.065, 1.42], [sx * 0.45, 0.858, -1.5], darkWood, [a, 0, 0])); // handle
  frame.push(box([0.075, 0.075, 0.06], [sx * 0.45, 0.92, -2.18], iron, [a, 0, 0])); // handle end cap
  frame.push(box([0.09, 0.09, 0.05], [sx * 0.45, 0.8, -0.9], iron)); // strap joining handle
  frame.push(box([0.1, 0.14, 0.16], [sx * 0.45, 0.68, 0.1], darkWood)); // axle block
  frame.push(box([0.11, 0.05, 0.05], [sx * 0.45, 0.8, 0.6], iron)); // strap
  frame.push(box([0.07, 0.72, 0.07], [sx * 0.45, 0.36, 1.03], darkWood, [-0.1, 0, 0])); // prop leg
  frame.push(box([0.09, 0.03, 0.09], [sx * 0.45, 0.02, 1.07], darkWood)); // foot
}
frame.push(box([0.9, 0.05, 0.05], [0, 0.4, 1.02], darkWood)); // prop cross-bar
frame.push(box([1.0, 0.05, 0.06], [0, 0.8, -0.85], darkWood)); // rear cross-bearer
frame.push(box([1.0, 0.05, 0.06], [0, 0.8, 1.05], darkWood)); // front cross-bearer
// iron straps across the floor
for (const z of [-0.55, 0.65]) frame.push(box([1.2, 0.012, 0.05], [0, TOP_Y + 0.005, z], iron));
sc = sc.add(group("frame", frame));

// ---- axle and wheels ----
const WZ = 0.1;
const WY = 0.6;
const R = 0.54;
const SPOKES = 12;
const FELLOES = 16;
sc = sc.add(cyl([0.07, 1.9, 0.07], [0, WY, WZ], darkWood, [0, 0, Math.PI / 2]));

const wheel = (id: string, sx: number) => {
  const kids: ReturnType<typeof box>[] = [];
  kids.push(cyl([0.18, 0.22, 0.18], [0, 0, 0], darkWood, [0, 0, Math.PI / 2])); // hub
  for (const dx of [-0.085, 0.085]) kids.push(cyl([0.215, 0.035, 0.215], [dx, 0, 0], iron, [0, 0, Math.PI / 2])); // iron hub bands
  kids.push(cyl([0.07, 0.04, 0.07], [sx * 0.125, 0, 0], iron, [0, 0, Math.PI / 2])); // axle cap
  for (let i = 0; i < SPOKES; i += 1) {
    const th = (i / SPOKES) * Math.PI * 2;
    const r = (0.09 + R - 0.02) / 2;
    kids.push(box([0.05, R - 0.09 + 0.02, 0.04], [0, Math.cos(th) * r, Math.sin(th) * r], wood(30, 40, 40), [th, 0, 0]));
  }
  const seg = 2 * R * Math.sin(Math.PI / FELLOES) + 0.02;
  for (let i = 0; i < FELLOES; i += 1) {
    const th = ((i + 0.5) / FELLOES) * Math.PI * 2;
    kids.push(box([0.09, seg, 0.07], [0, Math.cos(th) * R, Math.sin(th) * R], wood(26, 36, 34), [th + Math.PI / 2, 0, 0]));
    kids.push(box([0.075, seg, 0.02], [0, Math.cos(th) * (R + 0.045), Math.sin(th) * (R + 0.045)], iron, [th + Math.PI / 2, 0, 0]));
  }
  return group(id, kids, { position: [sx * 0.8, WY, WZ] }).runtime({ id, mutable: true });
};
sc = sc.add(wheel("wheel-l", -1)).add(wheel("wheel-r", 1));

// ---- cargo ----
// barrels
for (const [x, z] of [[-0.3, -0.55], [0.3, -0.6]] as Array<[number, number]>) {
  const y = TOP_Y + 0.26;
  const kids = [
    cyl([0.5, 0.52, 0.5], [0, 0, 0], wood(22, 45, 32)),
    cyl([0.56, 0.03, 0.56], [0, 0, 0], iron),
    cyl([0.52, 0.03, 0.52], [0, 0.19, 0], iron),
    cyl([0.52, 0.03, 0.52], [0, -0.19, 0], iron),
    cyl([0.46, 0.02, 0.46], [0, 0.265, 0], darkWood)
  ];
  sc = sc.add(group(nm("barrel"), kids, { position: [x, y, z] }));
}
// sacks
const sack = (pos: V3, rot: V3, i: number) => {
  const m = burlap(i);
  return group(nm("sack"), [
    ball([0.42, 0.42, 0.36], [0, 0, 0], m),
    ball([0.26, 0.2, 0.24], [0, 0.2, 0], m),
    ball([0.1, 0.09, 0.1], [0, 0.31, 0], material.pbr({ color: "#7a6238", roughness: 1 }))
  ], { position: pos, rotation: rot });
};
sc = sc.add(sack([-0.28, TOP_Y + 0.2, -0.02], [0, 0.4, 0], 0))
  .add(sack([0.27, TOP_Y + 0.2, 0.0], [0, -0.3, 0], 1))
  .add(sack([0.0, TOP_Y + 0.5, -0.05], [0.1, 1.1, 0.15], 2));
// crates
const crate = (pos: V3, s: number, yaw: number) => {
  const m = wood(30, 38, 42);
  const kids: ReturnType<typeof box>[] = [box([s, s, s], [0, 0, 0], m)];
  const e = s / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kids.push(box([0.05, s + 0.02, 0.05], [sx * e, 0, sz * e], darkWood));
  for (const sy of [-1, 1]) {
    kids.push(box([s + 0.02, 0.04, 0.05], [0, sy * e, e], darkWood));
    kids.push(box([s + 0.02, 0.04, 0.05], [0, sy * e, -e], darkWood));
    kids.push(box([0.05, 0.04, s + 0.02], [e, sy * e, 0], darkWood));
    kids.push(box([0.05, 0.04, s + 0.02], [-e, sy * e, 0], darkWood));
  }
  kids.push(box([0.04, s * 0.9, 0.012], [0, 0, e + 0.006], darkWood, [0, 0, 0.7]));
  return group(nm("crate"), kids, { position: pos, rotation: [0, yaw, 0] });
};
sc = sc.add(crate([-0.3, TOP_Y + 0.2, 0.5], 0.4, 0.15))
  .add(crate([0.3, TOP_Y + 0.19, 0.52], 0.38, -0.2))
  .add(crate([0.3, TOP_Y + 0.38 + 0.13, 0.5], 0.26, 0.5));

const app = createAuraApp("#app", { scene: sc });
let angle = 0;
app.onFrame((f) => {
  angle += f.dt * 0.6;
  app.nodes.require("wheel-l").setRotation(angle, 0, 0);
  app.nodes.require("wheel-r").setRotation(angle, 0, 0);
});
await app.ready();
window.__EVAL_READY__ = true;
window.__TASK_STATE__ = { ready: true, wheelCount: 2, spokeCount: SPOKES * 2, plankCount };
