import { camera, createAuraApp, effects, environments, group, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
    __EVAL_READY__?: boolean;
  }
}

// Seeded RNG so the cart looks the same on every load.
let seed = 77123;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();

type Vec3 = [number, number, number];
let uid = 0;
const nm = (base: string): string => `${base}-${(uid += 1)}`;

const wood = (h: number, s: number, l: number, rough = 0.85) => material.pbr({ color: `hsl(${h}, ${s}%, ${l}%)`, roughness: rough });
const iron = material.pbr({ color: "#2e2f33", metallic: 0.75, roughness: 0.5 });
const darkIron = material.pbr({ color: "#232427", metallic: 0.7, roughness: 0.6 });

const box = (base: string, size: Vec3, position: Vec3, mat: ReturnType<typeof wood>, rotation: Vec3 = [0, 0, 0]) =>
  primitives.box({ name: nm(base), size, position, rotation, material: mat });
const cyl = (base: string, size: Vec3, position: Vec3, mat: ReturnType<typeof wood>, rotation: Vec3 = [0, 0, 0]) =>
  primitives.cylinder({ name: nm(base), size, position, rotation, material: mat, params: { radialSegments: 16 } });

const HALF_PI = Math.PI / 2;

// ---------- Bed: floor planks ----------
const FLOOR_Y = 0.775;
const PLANK_COUNT_FLOOR = 9;
const bedParts: ReturnType<typeof box>[] = [];
let plankCount = 0;
for (let i = 0; i < PLANK_COUNT_FLOOR; i += 1) {
  const len = 1.92 + between(-0.05, 0.05);
  const w = 0.118 + between(-0.006, 0.006);
  bedParts.push(box("floor-plank", [len, 0.05, w], [between(-0.03, 0.03), FLOOR_Y + between(-0.004, 0.004), (i - 4) * 0.125], wood(between(24, 34), between(38, 50), between(30, 42)), [between(-0.01, 0.01), between(-0.012, 0.012), between(-0.008, 0.008)]));
  plankCount += 1;
}

// ---------- Bed: side planks (2 per side), end planks, posts, rails ----------
const sidePlankYs = [0.93, 1.11];
for (const sz of [-1, 1]) {
  sidePlankYs.forEach((y, k) => {
    const len = 1.9 + between(-0.04, 0.04);
    bedParts.push(box("side-plank", [len, 0.165, 0.035], [between(-0.02, 0.02), y + between(-0.004, 0.004), sz * 0.665], wood(between(22, 32), between(36, 48), between(28 + k * 3, 40)), [0, 0, between(-0.01, 0.01)]));
    plankCount += 1;
  });
}
for (const sx of [-1, 1]) {
  bedParts.push(box("end-plank", [0.035, 0.2, 1.2 + between(-0.03, 0.03)], [sx * 0.995, 0.93, 0], wood(between(24, 32), between(38, 48), between(30, 40)), [between(-0.01, 0.01), 0, 0]));
  plankCount += 1;
}

const postMat = wood(26, 40, 26);
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  bedParts.push(box("corner-post", [0.085, 0.72, 0.085], [sx * 0.98, 1.14, sz * 0.615], postMat));
  // iron band round each post
  bedParts.push(box("post-band", [0.105, 0.04, 0.105], [sx * 0.98, 0.97, sz * 0.615], iron));
}
// two cross rails per side (long sides) and per end
const railMat = wood(30, 38, 34);
for (const sz of [-1, 1]) for (const y of [1.3, 1.46]) {
  bedParts.push(box("side-rail", [2.0, 0.05, 0.05], [0, y, sz * 0.615], railMat, [0, 0, between(-0.006, 0.006)]));
}
for (const sx of [-1, 1]) for (const y of [1.3, 1.46]) {
  bedParts.push(box("end-rail", [0.05, 0.05, 1.24], [sx * 0.98, y, 0], railMat));
}

// ---------- Undercarriage: beams, handles, front leg ----------
const beamMat = wood(24, 36, 24);
const frame: ReturnType<typeof box>[] = [];
for (const sz of [-1, 1]) {
  frame.push(box("beam", [2.0, 0.09, 0.09], [0, 0.705, sz * 0.43], beamMat));
  // long push handle, rising slightly toward the rear (-x)
  frame.push(box("handle", [1.95, 0.065, 0.075], [-1.55, 0.75, sz * 0.43], wood(32, 34, 36, 0.7), [0, 0, -0.05]));
  frame.push(cyl("handle-grip", [0.085, 0.3, 0.085], [-2.48, 0.78, sz * 0.43], wood(30, 30, 20, 0.7), [0, 0, HALF_PI - 0.05]));
  frame.push(box("handle-strap", [0.05, 0.1, 0.1], [-0.86, 0.74, sz * 0.43], iron));
}
frame.push(box("handle-crossbar", [0.05, 0.05, 0.9], [-2.0, 0.77, 0], beamMat));
frame.push(box("front-crossbeam", [0.09, 0.09, 1.0], [0.9, 0.705, 0], beamMat));
frame.push(box("rear-crossbeam", [0.09, 0.09, 1.0], [-0.9, 0.705, 0], beamMat));
// front prop leg with foot, and a diagonal brace
frame.push(box("front-leg", [0.075, 0.78, 0.075], [1.03, 0.38, 0], wood(28, 38, 30), [0, 0, 0.15]));
frame.push(box("front-foot", [0.16, 0.05, 0.22], [1.1, 0.025, 0], darkIron));
frame.push(box("front-leg-band", [0.1, 0.04, 0.1], [0.99, 0.6, 0], iron, [0, 0, 0.15]));
frame.push(box("leg-brace", [0.04, 0.42, 0.04], [0.93, 0.5, 0], beamMat, [0, 0, -0.5]));

// axle with iron blocks and end pins
const AXLE_X = 0.08;
const AXLE_Y = 0.62;
const WHEEL_Z = 0.8;
frame.push(cyl("axle", [0.08, 1.96, 0.08], [AXLE_X, AXLE_Y, 0], wood(22, 30, 20), [HALF_PI, 0, 0]));
for (const sz of [-1, 1]) {
  frame.push(box("axle-bracket", [0.14, 0.05, 0.12], [AXLE_X, 0.665, sz * 0.43], iron));
  frame.push(cyl("axle-pin", [0.05, 0.05, 0.05], [AXLE_X, AXLE_Y, sz * 0.94], iron, [HALF_PI, 0, 0]));
}

// ---------- Iron straps and bolts on the bed ----------
const fittings: ReturnType<typeof box>[] = [];
for (const sz of [-1, 1]) for (const x of [-0.65, 0.0, 0.65]) {
  fittings.push(box("strap", [0.07, 0.4, 0.014], [x, 1.02, sz * 0.69], iron));
  for (const y of [0.87, 1.0, 1.17]) {
    fittings.push(primitives.sphere({ name: nm("bolt"), size: 0.036, position: [x, y, sz * 0.7], material: darkIron }));
  }
}
for (const x of [-0.6, 0.6]) {
  fittings.push(box("floor-strap", [0.06, 0.02, 1.24], [x, 0.745, 0], iron));
}

// ---------- Wheels ----------
const SPOKES = 10;
const FELLOES = 16;
const RIM_R = 0.575;
const buildWheel = (side: "l" | "r", z: number) => {
  const parts: ReturnType<typeof box>[] = [];
  const felloeMat = wood(28, 38, 30);
  const felloeLen = 2 * RIM_R * Math.tan(Math.PI / FELLOES) + 0.03;
  for (let i = 0; i < FELLOES; i += 1) {
    const phi = (i / FELLOES) * Math.PI * 2;
    parts.push(box("felloe", [0.075, felloeLen, 0.1], [Math.cos(phi) * RIM_R, Math.sin(phi) * RIM_R, 0], i % 2 ? felloeMat : wood(26, 36, 27), [0, 0, phi]));
    // iron tyre segment
    parts.push(box("tyre", [0.022, felloeLen, 0.112], [Math.cos(phi) * (RIM_R + 0.045), Math.sin(phi) * (RIM_R + 0.045), 0], iron, [0, 0, phi]));
  }
  for (let i = 0; i < SPOKES; i += 1) {
    const th = (i / SPOKES) * Math.PI * 2 + 0.12;
    const r = 0.3;
    parts.push(box("spoke", [0.05, 0.5, 0.045], [-Math.sin(th) * r, Math.cos(th) * r, 0], wood(between(30, 36), 36, between(36, 44)), [0, 0, th]));
  }
  parts.push(cyl("hub", [0.15, 0.2, 0.15], [0, 0, 0], wood(24, 36, 24), [HALF_PI, 0, 0]));
  parts.push(cyl("hub-belly", [0.2, 0.1, 0.2], [0, 0, 0], wood(24, 36, 26), [HALF_PI, 0, 0]));
  for (const dz of [-0.085, 0.085]) {
    parts.push(cyl("hub-band", [0.175, 0.03, 0.175], [0, 0, dz], iron, [HALF_PI, 0, 0]));
  }
  parts.push(cyl("hub-cap", [0.07, 0.03, 0.07], [0, 0, side === "l" ? -0.11 : 0.11], darkIron, [HALF_PI, 0, 0]));
  for (let i = 0; i < 4; i += 1) { // nails on the hub band
    const a = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(primitives.sphere({ name: nm("hub-bolt"), size: 0.026, position: [Math.cos(a) * 0.088, Math.sin(a) * 0.088, side === "l" ? -0.1 : 0.1], material: darkIron }));
  }
  return group(`wheel-${side}`, parts, { position: [AXLE_X, AXLE_Y, z] }).runtime({ id: `wheel-${side}`, mutable: true });
};

// ---------- Cargo ----------
const FLOOR_TOP = FLOOR_Y + 0.025;
const cargo: ReturnType<typeof box>[] = [];
const sackColors = ["#b9a07a", "#a88f68", "#c4ad87"];
const sack = (x: number, y: number, z: number, w: number, h: number, d: number, yaw: number, col: string, tilt: Vec3 = [0, 0, 0]) => {
  cargo.push(primitives.sphere({ name: nm("sack"), size: [w, h, d], position: [x, y + h / 2, z], rotation: [tilt[0], yaw, tilt[2]], material: material.pbr({ color: col, roughness: 1 }) }));
  cargo.push(primitives.cone({ name: nm("sack-neck"), size: [w * 0.4, h * 0.3, d * 0.4], position: [x, y + h * 0.98, z], rotation: [0, yaw, 0], material: material.pbr({ color: col, roughness: 1 }) }));
  cargo.push(cyl("sack-tie", [w * 0.2, 0.025, d * 0.2], [x, y + h * 0.9, z], wood(30, 40, 22)));
};
const barrel = (x: number, z: number, r: number, h: number) => {
  const m = wood(28, 42, 30);
  cargo.push(cyl("barrel", [r * 2, h, r * 2], [x, FLOOR_TOP + h / 2, z], m));
  cargo.push(cyl("barrel-belly", [r * 2.14, h * 0.5, r * 2.14], [x, FLOOR_TOP + h / 2, z], m));
  for (const f of [0.14, 0.34, 0.66, 0.86]) {
    const belly = f > 0.3 && f < 0.7 ? 2.17 : 2.04;
    cargo.push(cyl("barrel-hoop", [r * belly, 0.025, r * belly], [x, FLOOR_TOP + h * f, z], iron));
  }
  cargo.push(cyl("barrel-lid", [r * 1.8, 0.012, r * 1.8], [x, FLOOR_TOP + h + 0.004, z], wood(34, 30, 38)));
};
const crate = (x: number, y: number, z: number, w: number, h: number, d: number, yaw: number) => {
  const m = wood(between(30, 36), 34, between(40, 48));
  const slat = wood(28, 34, 30);
  cargo.push(box("crate", [w, h, d], [x, y + h / 2, z], m, [0, yaw, 0]));
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // corner battens, rotated with the crate
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const ox = lx * w / 2, oz = lz * d / 2;
    cargo.push(box("crate-batten", [0.05, h + 0.01, 0.05], [x + ox * c + oz * s, y + h / 2, z - ox * s + oz * c], slat, [0, yaw, 0]));
  }
  // top slat across the lid
  cargo.push(box("crate-lid-slat", [w * 0.9, 0.02, 0.07], [x, y + h + 0.005, z], slat, [0, yaw, 0]));
};

crate(-0.3, FLOOR_TOP, -0.27, 0.52, 0.42, 0.5, 0.12);
crate(-0.28, FLOOR_TOP, 0.29, 0.46, 0.36, 0.46, -0.1);
crate(-0.3, FLOOR_TOP + 0.42, -0.25, 0.32, 0.28, 0.3, 0.45);
sack(0.24, FLOOR_TOP, -0.02, 0.46, 0.56, 0.4, 0.3, sackColors[0] ?? "#b9a07a");
sack(0.2, FLOOR_TOP + 0.5, 0.05, 0.4, 0.4, 0.36, -0.5, sackColors[2] ?? "#c4ad87", [0.12, 0, 0.08]);
sack(-0.75, FLOOR_TOP, 0.05, 0.38, 0.4, 0.5, 1.2, sackColors[1] ?? "#a88f68", [0, 0, 0.1]);
sack(-0.72, FLOOR_TOP + 0.38, -0.1, 0.34, 0.34, 0.4, 0.4, sackColors[0] ?? "#b9a07a");
barrel(0.7, -0.26, 0.2, 0.55);
barrel(0.72, 0.27, 0.19, 0.5);

// ---------- Ground: dirt, mounds, stones ----------
const stones: AuraTransformSpec[] = [];
const stoneColors: string[] = [];
const mounds: AuraTransformSpec[] = [];
const moundColors: string[] = [];
for (let i = 0; i < 26; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = i < 8 ? between(2.9, 4.5) : between(3.5, 12);
  const s = i < 8 ? between(0.1, 0.3) : between(0.12, 0.55);
  stones.push({ position: [Math.cos(a) * r, s * 0.22, Math.sin(a) * r], rotation: [between(-0.2, 0.2), rand() * 6, between(-0.2, 0.2)], scale: [s * between(1.1, 1.7), s * 0.7, s * between(0.9, 1.4)] });
  stoneColors.push(`hsl(${between(25, 40)}, ${between(5, 12)}%, ${between(40, 62)}%)`);
}
for (let i = 0; i < 40; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = between(2.4, 16);
  const s = between(0.5, 1.8);
  mounds.push({ position: [Math.cos(a) * r, 0.0, Math.sin(a) * r], rotation: [0, rand() * 6, 0], scale: [s * 1.6, 0.07, s * 1.2] });
  moundColors.push(`hsl(${between(24, 34)}, ${between(28, 40)}%, ${between(26, 44)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 1 });

// ---------- Scene ----------
const cart = group("cart", [
  group("cart-body", [
    ...bedParts,
    ...frame,
    ...fittings,
    ...cargo,
    buildWheel("l", -WHEEL_Z),
    buildWheel("r", WHEEL_Z)
  ], { position: [0.6, 0, 0] })
], { position: [0, 0, 0] }).runtime({ id: "cart", mutable: true });

const app = createAuraApp("#app", {
  scene: scene({ background: "#d9c7a0" })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.hemisphere({ skyColor: "#ffe6bd", groundColor: "#6b4a2c", intensity: 0.45 }))
    .add(lights.directional({ name: "sun", position: [6, 7, 4], target: [0, 0.6, 0], intensity: 2.6, color: "#ffd9a3", shadow: true }))
    .add(lights.directional({ name: "fill", position: [-5, 3, -4], target: [0, 0.6, 0], intensity: 0.5, color: "#b9c8ff" }))
    .add(effects.contactShadows())
    .add(effects.fog({ color: "#d9c7a0", density: 0.01 }))
    .add(primitives.plane({ name: "ground", size: [120, 1, 120], material: material.pbr({ color: "#7a5a3a", roughness: 1 }) }))
    .add(instances.sphere({ name: "dirt-mounds", transforms: mounds, colors: moundColors, material: white, castShadow: false }))
    .add(instances.sphere({ name: "stones", transforms: stones, colors: stoneColors, material: white }))
    .add(cart)
    .camera(camera.perspective({ position: [5.4, 3.5, 6.2], target: [0, 0.75, 0], fov: 40, near: 0.1, far: 300 }))
});

let t = 0;
app.onFrame((frame: { dt: number }) => {
  t += frame.dt;
  const spin = t * 0.5;
  app.nodes.require("wheel-l").setRotation(0, 0, -spin);
  app.nodes.require("wheel-r").setRotation(0, 0, -spin);
  app.nodes.require("cart").setRotation(0, 0.55 + t * 0.12, 0);
});

await app.ready();

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__TASK_STATE__ = { ready: true, wheelCount: 2, spokeCount: SPOKES * 2, plankCount };
    window.__EVAL_READY__ = true;
  });
});
