import { camera, createAuraApp, effects, environments, group, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
  }
}

type V3 = [number, number, number];
type Kid = NonNullable<Parameters<typeof group>[1]>[number];

// ---------- helpers ----------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

let uid = 0;
const nm = (p: string): string => `${p}-${uid++}`;

const PI = Math.PI;
const iron = material.pbr({ color: "#2b2d31", metallic: 0.75, roughness: 0.42 });
const ironWorn = material.pbr({ color: "#3b3d40", metallic: 0.7, roughness: 0.55 });
const woodDark = material.pbr({ color: "#5a3c22", roughness: 0.9 });
const woodMid = material.pbr({ color: "#7a5732", roughness: 0.88 });

const woodTones = [
  "#8a6339", "#7c5a33", "#94703f", "#6f4f2c", "#85613a", "#9b7746", "#735230", "#8f6a3d"
].map((c) => material.pbr({ color: c, roughness: 0.88 }));
const wood = (): ReturnType<typeof material.pbr> => woodTones[Math.floor(rand() * woodTones.length)]!;

const box = (name: string, size: V3, position: V3, mat: ReturnType<typeof material.pbr>, rotation: V3 = [0, 0, 0]) =>
  primitives.box({ name: nm(name), size, position, rotation, material: mat });
const cyl = (name: string, size: V3, position: V3, mat: ReturnType<typeof material.pbr>, rotation: V3 = [0, 0, 0]) =>
  primitives.cylinder({ name: nm(name), size, position, rotation, material: mat, params: { radialSegments: 20 } });
const ball = (name: string, size: V3, position: V3, mat: ReturnType<typeof material.pbr>, rotation: V3 = [0, 0, 0]) =>
  primitives.sphere({ name: nm(name), size, position, rotation, material: mat });

// ---------- scene ----------
let sc = scene({ background: "#e3d2b0" })
  .camera(camera.orbit({ position: [3.9, 2.6, 4.7], target: [0, 0.75, -0.4], fov: 40, near: 0.1, far: 120, autoRotate: 0.16 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#fff1d6", groundColor: "#7a5a38", intensity: 0.9 }))
  .add(
    lights.directional({
      name: "sun",
      position: [5.5, 7, 4],
      target: [0, 0.5, -0.3],
      intensity: 3.1,
      color: "#ffd9a2",
      shadow: { filter: "pcf", softness: 2.5, mapSize: 2048, bias: -0.0004, normalBias: 0.02, fit: { center: [0, 0.5, -0.3], extent: 4.5, depth: 20 } }
    })
  )
  .add(effects.fog({ color: "#e3d2b0", density: 0.012 }))
  .add(primitives.plane({ name: "ground", size: [60, 1, 60], material: material.pbr({ color: "#8a6a47", roughness: 1 }) }));

// dirt patches
const patches: AuraTransformSpec[] = [];
const patchColors: string[] = [];
for (let i = 0; i < 70; i += 1) {
  const a = rand() * 6.283, r = 1 + 11 * Math.sqrt(rand()), s = range(0.6, 2.4);
  patches.push({ position: [Math.cos(a) * r, 0, Math.sin(a) * r], rotation: [0, rand() * 6, 0], scale: [s, 0.03, s * range(0.6, 1)] });
  patchColors.push(`hsl(${range(24, 34).toFixed(0)}, ${range(28, 40).toFixed(0)}%, ${range(30, 46).toFixed(0)}%)`);
}
sc = sc.add(instances.sphere({ name: "dirt-patches", transforms: patches, colors: patchColors, material: material.pbr({ color: "#ffffff", roughness: 1 }), castShadow: false }));

// stones
const stones: AuraTransformSpec[] = [];
const stoneColors: string[] = [];
const addStone = (x: number, z: number, s: number): void => {
  stones.push({ position: [x, s * 0.2, z], rotation: [range(-0.2, 0.2), rand() * 6, range(-0.2, 0.2)], scale: [s, s * 0.6, s * range(0.8, 1.2)] });
  stoneColors.push(`hsl(${range(25, 40).toFixed(0)}, ${range(4, 10).toFixed(0)}%, ${range(36, 58).toFixed(0)}%)`);
};
addStone(1.55, 1.15, 0.28);
addStone(-1.5, -0.9, 0.22);
addStone(1.2, -2.4, 0.3);
let placed = 0;
while (placed < 14) {
  const a = rand() * 6.283, r = 2 + 6 * Math.sqrt(rand());
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (Math.abs(x) < 1.5 && z > -2.5 && z < 1.7) continue;
  addStone(x, z, range(0.1, 0.4));
  placed += 1;
}
sc = sc.add(instances.sphere({ name: "stones", transforms: stones, colors: stoneColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }));

// ---------- cart ----------
const cart: Kid[] = [];
const BED_Y = 0.76; // floor plank centre
const FLOOR_TOP = BED_Y + 0.025;
const AXLE_Y = 0.56;
const AXLE_Z = 0.1;

// floor planks (8, running front to back)
let plankCount = 0;
for (let i = 0; i < 8; i += 1) {
  const len = 1.82 + range(-0.05, 0.05);
  const zc = range(-0.03, 0.03);
  cart.push(box("floor-plank", [0.14, 0.05, len], [-0.518 + i * 0.148, BED_Y + range(-0.004, 0.004), zc], wood(), [0, range(-0.02, 0.02), range(-0.012, 0.012)]));
  plankCount += 1;
}

// side walls (2 planks each) and end walls (2 planks each)
for (const sx of [-1, 1]) {
  for (let k = 0; k < 2; k += 1) {
    const len = 1.74 + range(-0.04, 0.04);
    cart.push(box("side-plank", [0.04, 0.13, len], [sx * 0.575, 0.86 + k * 0.135, range(-0.02, 0.02)], wood(), [range(-0.012, 0.012), 0, 0]));
    plankCount += 1;
  }
}
for (const sz of [-1, 1]) {
  for (let k = 0; k < 2; k += 1) {
    const len = 1.06 + range(-0.03, 0.03);
    cart.push(box("end-plank", [len, 0.13, 0.04], [range(-0.015, 0.015), 0.86 + k * 0.135, sz * 0.895], wood(), [0, range(-0.015, 0.015), range(-0.012, 0.012)]));
    plankCount += 1;
  }
}

// corner posts and cross rails
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    cart.push(box("corner-post", [0.08, 0.66, 0.08], [sx * 0.6, 1.05, sz * 0.9], woodDark));
    cart.push(box("post-cap", [0.095, 0.03, 0.095], [sx * 0.6, 1.395, sz * 0.9], iron));
  }
  // two rails per side wall
  for (const ry of [1.13, 1.32]) {
    cart.push(box("side-rail", [0.04, 0.05, 1.9], [sx * 0.65, ry, 0], woodMid));
  }
}
for (const sz of [-1, 1]) {
  for (const ry of [1.13, 1.32]) {
    cart.push(box("end-rail", [1.3, 0.05, 0.04], [0, ry, sz * 0.95], woodMid));
  }
}
// mid stakes
for (const sx of [-1, 1]) {
  cart.push(box("stake", [0.05, 0.6, 0.05], [sx * 0.6, 1.08, 0], woodDark));
}

// iron straps and bolts on side walls
for (const sx of [-1, 1]) {
  for (const sz of [-0.5, 0.5]) {
    cart.push(box("strap", [0.012, 0.3, 0.06], [sx * 0.603, 0.925, sz], ironWorn));
    for (const by of [0.83, 1.02]) cart.push(ball("bolt", [0.035, 0.035, 0.035], [sx * 0.612, by, sz], iron));
  }
}
// iron corner straps on end walls
for (const sz of [-1, 1]) {
  for (const sx of [-0.3, 0.3]) {
    cart.push(box("strap", [0.06, 0.3, 0.012], [sx, 0.925, sz * 0.918], ironWorn));
    for (const by of [0.83, 1.02]) cart.push(ball("bolt", [0.035, 0.035, 0.035], [sx, by, sz * 0.926], iron));
  }
}

// frame: runners that extend rearwards into push handles
for (const sx of [-1, 1]) {
  cart.push(box("runner", [0.08, 0.1, 2.3], [sx * 0.45, 0.68, 0.15], woodMid));
  // handle: round pole sloping slightly upward toward the rear
  cart.push(cyl("handle", [0.075, 1.2, 0.075], [sx * 0.45, 0.73, -1.55], woodMid, [-PI / 2 + 0.09, 0, 0]));
  cart.push(cyl("handle-grip", [0.09, 0.28, 0.09], [sx * 0.45, 0.78, -2.05], woodDark, [-PI / 2 + 0.09, 0, 0]));
  cart.push(cyl("handle-ferrule", [0.095, 0.03, 0.095], [sx * 0.45, 0.775, -1.91], iron, [-PI / 2 + 0.09, 0, 0]));
  // axle bearing block
  cart.push(box("bearing", [0.14, 0.07, 0.2], [sx * 0.45, 0.6, AXLE_Z], woodDark));
  cart.push(box("bearing-strap", [0.15, 0.012, 0.03], [sx * 0.45, 0.636, AXLE_Z], iron));
}
cart.push(box("cross-bar", [0.9, 0.06, 0.07], [0, 0.69, 0.82], woodMid));
cart.push(box("cross-bar", [0.9, 0.06, 0.07], [0, 0.69, -0.8], woodMid));
cart.push(box("handle-brace", [0.9, 0.05, 0.06], [0, 0.72, -1.3], woodMid));

// axle
cart.push(cyl("axle", [0.08, 1.9, 0.08], [0, AXLE_Y, AXLE_Z], ironWorn, [0, 0, PI / 2]));
for (const sx of [-1, 1]) {
  cart.push(cyl("axle-cap", [0.1, 0.03, 0.1], [sx * 0.94, AXLE_Y, AXLE_Z], iron, [0, 0, PI / 2]));
  cart.push(box("linchpin", [0.015, 0.1, 0.02], [sx * 0.915, AXLE_Y, AXLE_Z], iron));
}

// front prop stand: two legs with feet and a crossbar
for (const sx of [-1, 1]) {
  cart.push(box("prop-leg", [0.07, 0.68, 0.07], [sx * 0.4, 0.34, 1.18], woodDark, [0.05, 0, 0]));
  cart.push(box("prop-foot", [0.12, 0.05, 0.22], [sx * 0.4, 0.025, 1.2], woodMid));
  cart.push(box("prop-collar", [0.095, 0.04, 0.095], [sx * 0.4, 0.62, 1.17], iron));
}
cart.push(box("prop-bar", [0.8, 0.05, 0.05], [0, 0.3, 1.19], woodMid));

// wheels
let spokeCount = 0;
const SPOKES = 10;
const FELLOES = 14;
const RIM_R = 0.5;
const makeWheel = (id: string, x: number) => {
  const kids: Kid[] = [];
  kids.push(cyl("hub", [0.17, 0.22, 0.17], [0, 0, 0], woodDark, [0, 0, PI / 2]));
  for (const bx of [-0.085, 0.085]) {
    kids.push(cyl("hub-band", [0.2, 0.035, 0.2], [bx, 0, 0], iron, [0, 0, PI / 2]));
  }
  kids.push(cyl("hub-nut", [0.1, 0.03, 0.1], [x < 0 ? -0.115 : 0.115, 0, 0], iron, [0, 0, PI / 2]));
  for (let i = 0; i < SPOKES; i += 1) {
    const a = (i / SPOKES) * PI * 2;
    kids.push(group(nm("spoke-pivot"), [box("spoke", [0.045, 0.43, 0.05], [0, 0.29, 0], wood())], { rotation: [a, 0, 0] }));
    spokeCount += 1;
  }
  for (let i = 0; i < FELLOES; i += 1) {
    const a = ((i + 0.5) / FELLOES) * PI * 2;
    kids.push(group(nm("felloe-pivot"), [box("felloe", [0.1, 0.07, 0.24], [0, RIM_R, 0], wood())], { rotation: [a, 0, 0] }));
  }
  for (let i = 0; i < FELLOES; i += 1) {
    const a = (i / FELLOES) * PI * 2;
    kids.push(group(nm("tyre-pivot"), [box("tyre", [0.075, 0.022, 0.235], [0, RIM_R + 0.045, 0], iron)], { rotation: [a, 0, 0] }));
    kids.push(group(nm("nail-pivot"), [ball("tyre-nail", [0.03, 0.03, 0.03], [0, RIM_R + 0.057, 0], ironWorn)], { rotation: [a + 0.1, 0, 0] }));
  }
  return group(id, kids, { position: [x, AXLE_Y, AXLE_Z] }).runtime({ id, mutable: true });
};
cart.push(makeWheel("wheel-left", -0.8));
cart.push(makeWheel("wheel-right", 0.8));

// ---------- load ----------
const sackMat = (c: string) => material.pbr({ color: c, roughness: 1 });
const sack = (x: number, z: number, h: number, c: string, yaw: number): void => {
  const m = sackMat(c);
  const y0 = FLOOR_TOP;
  const w = 0.36, d = 0.3;
  cart.push(ball("sack-base", [w * 1.05, h * 0.5, d * 1.08], [x, y0 + h * 0.25, z], m, [0, yaw, 0]));
  cart.push(ball("sack-body", [w, h * 0.85, d], [x, y0 + h * 0.5, z], m, [0, yaw, 0]));
  cart.push(cyl("sack-neck", [0.1, 0.09, 0.1], [x, y0 + h * 0.93, z], m));
  cart.push(ball("sack-top", [0.12, 0.1, 0.12], [x + 0.01, y0 + h * 1.0, z], m));
  cart.push(cyl("sack-tie", [0.115, 0.018, 0.115], [x, y0 + h * 0.9, z], woodDark));
};
sack(-0.32, 0.66, 0.46, "#b79d6c", 0.3);
sack(0.04, 0.68, 0.42, "#a68c5e", -0.4);
sack(0.38, 0.66, 0.48, "#c4ab7c", 0.15);

const barrel = (x: number, z: number, s: number): number => {
  const bm = material.pbr({ color: "#6b4a2a", roughness: 0.85 });
  const h = 0.5 * s;
  const y = FLOOR_TOP + h / 2;
  cart.push(cyl("barrel-body", [0.38 * s, h, 0.38 * s], [x, y, z], bm));
  cart.push(cyl("barrel-belly", [0.44 * s, h * 0.55, 0.44 * s], [x, y, z], bm));
  cart.push(cyl("barrel-lid", [0.34 * s, 0.012, 0.34 * s], [x, y + h / 2 + 0.003, z], woodMid));
  for (const hy of [-0.4, -0.18, 0.18, 0.4]) {
    const wid = Math.abs(hy) > 0.3 ? 0.385 : 0.445;
    cart.push(cyl("barrel-hoop", [wid * s, 0.035, wid * s], [x, y + hy * h, z], iron));
  }
  return FLOOR_TOP + h;
};
const topA = barrel(-0.25, -0.58, 1);
barrel(0.28, -0.58, 0.95);
// sack lying across the barrels
cart.push(ball("sack-lying", [0.62, 0.26, 0.34], [0.02, topA + 0.1, -0.58], sackMat("#b09560"), [0, 0.25, 0.05]));
cart.push(ball("sack-lying-knot", [0.1, 0.1, 0.1], [0.33, topA + 0.1, -0.5], sackMat("#b09560")));

const crate = (x: number, z: number, w: number, h: number, d: number, yaw: number, baseY: number): number => {
  const cm = material.pbr({ color: "#a07c4a", roughness: 0.9 });
  const y = baseY + h / 2;
  const inner: Kid[] = [box("crate-body", [w, h, d], [0, 0, 0], cm)];
  // slats on all four sides as horizontal boards + corner battens
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) inner.push(box("crate-batten", [0.045, h + 0.012, 0.045], [sx * (w / 2), 0, sz * (d / 2)], woodDark));
  for (const sy of [-1, 1]) {
    inner.push(box("crate-edge", [w + 0.01, 0.04, d + 0.01], [0, sy * (h / 2 - 0.02), 0], woodDark));
  }
  inner.push(box("crate-gap-a", [w + 0.004, 0.012, d + 0.004], [0, 0, 0], woodDark));
  return (cart.push(group(nm("crate"), inner, { position: [x, y, z], rotation: [0, yaw, 0] })), baseY + h);
};
const c1Top = crate(-0.27, 0.12, 0.44, 0.38, 0.4, 0.2, FLOOR_TOP);
crate(0.28, 0.14, 0.38, 0.3, 0.4, -0.15, FLOOR_TOP);
crate(-0.27, 0.12, 0.26, 0.22, 0.26, 0.6, c1Top);

for (const part of cart) sc = sc.add(part);

// ---------- run ----------
const app = createAuraApp("#app", { scene: sc });
let spin = 0;
app.onFrame((f) => {
  spin += f.dt * 0.6;
  app.nodes.require("wheel-left").setRotation(spin, 0, 0);
  app.nodes.require("wheel-right").setRotation(spin, 0, 0);
});
await app.ready();
window.__EVAL_READY__ = true;
window.__TASK_STATE__ = { ready: true, wheelCount: 2, spokeCount, plankCount };
