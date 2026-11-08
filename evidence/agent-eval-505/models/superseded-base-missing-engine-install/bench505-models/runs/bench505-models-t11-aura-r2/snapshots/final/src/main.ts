import {
  camera, createAuraApp, environments, effects, group, instances, lights, material, primitives, scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
  }
}

type V3 = [number, number, number];
type Mat = ReturnType<typeof material.pbr>;
type Child = Parameters<typeof group>[1][number];

// ---------- seeded randomness and colour helpers ----------
let seed = 90210;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();

const hsl = (h: number, s: number, l: number): string => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const wood = (h: number, s: number, l: number, rough = 0.88): Mat => material.pbr({ color: hsl(h, s, l), roughness: rough });
const randomWood = (): Mat => wood(between(24, 34), between(30, 46), between(26, 42));

const iron = material.pbr({ color: "#3a3c41", metallic: 0.85, roughness: 0.46 });
const ironDark = material.pbr({ color: "#2a2b2f", metallic: 0.8, roughness: 0.55 });
const wheelWood = wood(28, 40, 30);
const frameWood = wood(27, 34, 26);
const postWood = wood(26, 36, 23);
const white = material.pbr({ color: "#ffffff", roughness: 0.95 });

// ---------- tiny builders ----------
let counter = 0;
const nm = (base: string): string => `${base}-${counter++}`;

const bx = (base: string, size: V3, pos: V3, mat: Mat, rot?: V3): Child => {
  const b = primitives.box({ name: nm(base), size, material: mat }).position(pos[0], pos[1], pos[2]);
  return rot ? b.rotate(rot[0], rot[1], rot[2]) : b;
};
const ball = (base: string, size: V3 | number, pos: V3, mat: Mat): Child =>
  primitives.sphere({ name: nm(base), size, material: mat }).position(pos[0], pos[1], pos[2]);
/** Cylinder whose axis is Z (wheel hubs, axle). */
const cylZ = (base: string, dia: number, len: number, pos: V3, mat: Mat): Child =>
  primitives.cylinder({ name: nm(base), size: [dia, len, dia], material: mat }).position(pos[0], pos[1], pos[2]).rotate(Math.PI / 2, 0, 0);
const cylY = (base: string, dia: number, len: number, pos: V3, mat: Mat): Child =>
  primitives.cylinder({ name: nm(base), size: [dia, len, dia], material: mat }).position(pos[0], pos[1], pos[2]);

// ---------- wheel ----------
const WHEEL_R = 0.55;
const AXLE_Y = WHEEL_R;
const WHEEL_Z = 0.7;
const SPOKES_PER_WHEEL = 12;
const FELLOES = 16;

const buildWheel = (id: string, z: number): Child => {
  const parts: Child[] = [];
  const outward = Math.sign(z);
  // hub (nave) with iron bands
  parts.push(cylZ("hub", 0.2, 0.3, [0, 0, 0], wheelWood));
  parts.push(ball("hub-belly", [0.25, 0.25, 0.2], [0, 0, 0], wheelWood));
  for (const dz of [-0.11, 0.11]) parts.push(cylZ("hub-band", 0.235, 0.04, [0, 0, dz], iron));
  parts.push(cylZ("axle-cap", 0.1, 0.05, [0, 0, outward * 0.16], iron));
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(ball("hub-bolt", 0.026, [Math.cos(a) * 0.118, Math.sin(a) * 0.118, outward * 0.132], iron));
  }
  // spokes
  const inner = 0.1;
  const outer = 0.47;
  const spokeLen = outer - inner + 0.04;
  for (let i = 0; i < SPOKES_PER_WHEEL; i += 1) {
    const a = (i / SPOKES_PER_WHEEL) * Math.PI * 2 + 0.07;
    const mid = (inner + outer) / 2;
    parts.push(bx("spoke", [spokeLen, between(0.044, 0.054), 0.046], [Math.cos(a) * mid, Math.sin(a) * mid, 0], wheelWood, [0, 0, a]));
  }
  // felloes (wooden rim segments) and iron tyre segments
  for (let i = 0; i < FELLOES; i += 1) {
    const a = (i / FELLOES) * Math.PI * 2;
    const rf = 0.49;
    const lenF = 2 * rf * Math.sin(Math.PI / FELLOES) * 1.04;
    parts.push(bx("felloe", [lenF, 0.07, 0.11], [Math.cos(a) * rf, Math.sin(a) * rf, 0], wheelWood, [0, 0, a + Math.PI / 2]));
    const rt = 0.535;
    const lenT = 2 * rt * Math.sin(Math.PI / FELLOES) * 1.03;
    parts.push(bx("tyre", [lenT, 0.03, 0.125], [Math.cos(a) * rt, Math.sin(a) * rt, 0], iron, [0, 0, a + Math.PI / 2 + 0.01]));
    const an = a + Math.PI / FELLOES;
    parts.push(ball("tyre-nail", 0.03, [Math.cos(an) * 0.55, Math.sin(an) * 0.55, 0.035], ironDark));
    parts.push(ball("tyre-nail", 0.03, [Math.cos(an) * 0.55, Math.sin(an) * 0.55, -0.035], ironDark));
  }
  return group(id, parts, { position: [0, AXLE_Y, z] }).runtime({ id, mutable: true });
};

// ---------- cart body ----------
const BED_Y = 0.74; // top of floor planks
const planks: Child[] = [];
let plankCount = 0;
const plank = (base: string, size: V3, pos: V3, rot: V3): void => {
  planks.push(bx(base, size, pos, randomWood(), rot));
  plankCount += 1;
};

// floor: 9 boards across the length, each a little different
for (let i = 0; i < 9; i += 1) {
  plank("floor-plank", [between(0.172, 0.186), 0.04, 0.92 + between(-0.025, 0.025)],
    [-0.76 + i * 0.19 + between(-0.004, 0.004), BED_Y - 0.02 + between(-0.003, 0.003), between(-0.012, 0.012)],
    [0, between(-0.02, 0.02), between(-0.012, 0.012)]);
}
// long sides: 3 boards each, outside the corner posts
for (const sz of [-1, 1]) {
  for (let j = 0; j < 3; j += 1) {
    plank("side-board", [1.74 + between(-0.05, 0.03), 0.15, 0.03],
      [between(-0.02, 0.02), BED_Y + 0.1 + j * 0.17, sz * 0.47], [0, between(-0.01, 0.01), between(-0.012, 0.012)]);
  }
}
// short sides (front and rear): 3 boards each, inside the posts
for (const sx of [-1, 1]) {
  for (let j = 0; j < 3; j += 1) {
    plank("end-board", [0.03, 0.15, 0.77 + between(-0.015, 0.0)],
      [sx * 0.77, BED_Y + 0.1 + j * 0.17, between(-0.01, 0.01)], [between(-0.012, 0.012), 0, between(-0.01, 0.01)]);
  }
}

const frame: Child[] = [];
// corner posts with iron bands
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    frame.push(bx("post", [0.07, 0.56, 0.07], [sx * 0.82, BED_Y + 0.26, sz * 0.42], postWood));
    frame.push(bx("post-band", [0.086, 0.035, 0.086], [sx * 0.82, BED_Y + 0.5, sz * 0.42], iron));
    frame.push(bx("post-band", [0.086, 0.035, 0.086], [sx * 0.82, BED_Y + 0.06, sz * 0.42], iron));
  }
}
// two cross rails on every side
for (const sz of [-1, 1]) {
  for (const h of [0.19, 0.4]) frame.push(bx("rail-long", [1.57, 0.045, 0.04], [0, BED_Y + h, sz * 0.365], frameWood));
}
for (const sx of [-1, 1]) {
  for (const h of [0.19, 0.4]) frame.push(bx("rail-end", [0.04, 0.045, 0.9], [sx * 0.875, BED_Y + h, 0], frameWood));
}
// iron straps and bolts on the long sides
for (const sz of [-1, 1]) {
  for (const x of [-0.45, 0.0, 0.45]) {
    frame.push(bx("strap", [0.05, 0.5, 0.012], [x, BED_Y + 0.26, sz * 0.49], iron));
    frame.push(ball("strap-bolt", 0.03, [x, BED_Y + 0.12, sz * 0.5], ironDark));
    frame.push(ball("strap-bolt", 0.03, [x, BED_Y + 0.4, sz * 0.5], ironDark));
  }
}
// under-frame: two long beams, cross beams, axle, axle blocks
const BEAM_Y = 0.665;
for (const sz of [-1, 1]) {
  frame.push(bx("beam", [1.84, 0.07, 0.08], [0, BEAM_Y, sz * 0.36], frameWood));
  frame.push(bx("axle-block", [0.22, 0.1, 0.13], [0, 0.6, sz * 0.36], frameWood));
  frame.push(bx("axle-strap", [0.05, 0.2, 0.15], [0.1, 0.62, sz * 0.36], iron));
  frame.push(bx("axle-strap", [0.05, 0.2, 0.15], [-0.1, 0.62, sz * 0.36], iron));
}
frame.push(bx("cross-beam", [0.08, 0.06, 0.9], [0.82, BEAM_Y, 0], frameWood));
frame.push(bx("cross-beam", [0.08, 0.06, 0.9], [-0.82, BEAM_Y, 0], frameWood));
frame.push(cylZ("axle", 0.07, 1.78, [0, AXLE_Y, 0], ironDark));

// push handles: rise towards the rear
const rise = 0.14;
const run = 1.45;
const tilt = -Math.atan2(rise, run);
const handleLen = Math.hypot(run, rise);
for (const sz of [-1, 1]) {
  frame.push(bx("handle", [handleLen + 0.02, 0.06, 0.07], [-0.85 - run / 2, BEAM_Y + rise / 2, sz * 0.36], frameWood, [0, 0, tilt]));
  frame.push(primitives.cylinder({ name: nm("grip"), size: [0.06, 0.34, 0.06], material: wood(30, 30, 20) })
    .position(-2.12, BEAM_Y + (2.12 - 0.85) * (rise / run), sz * 0.36).rotate(0, 0, Math.PI / 2 + tilt));
  frame.push(bx("handle-strap", [0.05, 0.1, 0.1], [-0.92, BEAM_Y, sz * 0.36], iron));
  frame.push(bx("handle-strap", [0.05, 0.1, 0.1], [-1.5, BEAM_Y + (1.5 - 0.85) * (rise / run), sz * 0.36], iron, [0, 0, tilt]));
}
frame.push(bx("handle-rail", [0.05, 0.05, 0.72], [-1.7, BEAM_Y + (1.7 - 0.85) * (rise / run), 0], frameWood));

// front prop stand: two legs with a brace and foot blocks
for (const sz of [-1, 1]) {
  frame.push(bx("prop-leg", [0.065, 0.68, 0.065], [0.92, 0.33, sz * 0.3], frameWood, [0, 0, 0.12]));
  frame.push(bx("prop-foot", [0.14, 0.04, 0.11], [0.97, 0.02, sz * 0.3], postWood));
  frame.push(bx("prop-strap", [0.09, 0.05, 0.09], [0.9, 0.6, sz * 0.3], iron));
}
frame.push(bx("prop-brace", [0.05, 0.05, 0.6], [0.94, 0.3, 0], frameWood));

// ---------- load ----------
const load: Child[] = [];

const sackTones = [hsl(38, 38, 62), hsl(35, 34, 56), hsl(40, 40, 66), hsl(33, 30, 52)];
const sack = (base: string, pos: V3, size: V3, yaw: number, tone: number): Child => {
  const m = material.pbr({ color: sackTones[tone % sackTones.length] ?? "#c8b48a", roughness: 0.97 });
  const rope = wood(32, 28, 30, 0.95);
  const [w, h, d] = size;
  return group(nm(base), [
    ball("sack-body", [w, h, d], [0, 0, 0], m),
    ball("sack-belly", [w * 1.06, h * 0.55, d * 1.06], [0, -h * 0.16, 0], m),
    cylY("sack-neck", w * 0.3, h * 0.28, [0, h * 0.5, 0], m),
    ball("sack-top", [w * 0.4, h * 0.2, d * 0.4], [0.015, h * 0.68, 0], m),
    cylY("sack-tie", w * 0.34, h * 0.05, [0, h * 0.42, 0], rope)
  ], { position: pos }).rotate(0, yaw, 0);
};

const crate = (base: string, pos: V3, s: number, yaw: number): Child => {
  const body = wood(between(30, 36), 34, between(40, 46));
  const batten = wood(30, 32, 33);
  const parts: Child[] = [bx("crate-body", [s, s, s], [0, 0, 0], body)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(bx("crate-corner", [0.04, s + 0.012, 0.04], [sx * s * 0.5, 0, sz * s * 0.5], batten));
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(bx("crate-rim", [s + 0.012, 0.04, 0.04], [0, sy * s * 0.5, sz * s * 0.5], batten));
    for (const sx of [-1, 1]) parts.push(bx("crate-rim", [0.04, 0.04, s + 0.012], [sx * s * 0.5, sy * s * 0.5, 0], batten));
  }
  for (const sz of [-1, 1]) parts.push(bx("crate-brace", [s * 1.3, 0.035, 0.012], [0, 0, sz * (s / 2 + 0.003)], batten, [0, 0, 0.78]));
  for (const sx of [-1, 1]) parts.push(bx("crate-brace", [0.012, 0.035, s * 1.3], [sx * (s / 2 + 0.003), 0, 0], batten, [0.78, 0, 0]));
  return group(nm(base), parts, { position: pos }).rotate(0, yaw, 0);
};

const barrel = (base: string, pos: V3): Child => {
  const stave = wood(28, 40, 34);
  const parts: Child[] = [
    cylY("barrel-end", 0.31, 0.46, [0, 0, 0], stave),
    cylY("barrel-belly", 0.345, 0.26, [0, 0, 0], stave),
    cylY("barrel-belly", 0.33, 0.36, [0, 0, 0], stave),
    cylY("barrel-lid", 0.29, 0.015, [0, 0.232, 0], wood(30, 34, 42))
  ];
  for (const y of [-0.18, -0.09, 0.09, 0.18]) {
    const r = Math.abs(y) > 0.15 ? 0.325 : 0.352;
    parts.push(cylY("barrel-hoop", r, 0.028, [0, y, 0], iron));
  }
  return group(nm(base), parts, { position: pos });
};

const FLOOR_TOP = BED_Y;
load.push(barrel("barrel", [0.52, FLOOR_TOP + 0.23, -0.18]));
load.push(barrel("barrel", [0.5, FLOOR_TOP + 0.23, 0.18]));
load.push(crate("crate", [-0.02, FLOOR_TOP + 0.17, -0.17], 0.34, 0.08));
load.push(crate("crate", [0.02, FLOOR_TOP + 0.15, 0.19], 0.3, -0.12));
load.push(crate("crate", [-0.04, FLOOR_TOP + 0.34 + 0.12, -0.16], 0.24, 0.42));
load.push(sack("sack", [-0.5, FLOOR_TOP + 0.18, -0.17], [0.34, 0.36, 0.3], 0.3, 0));
load.push(sack("sack", [-0.5, FLOOR_TOP + 0.17, 0.17], [0.34, 0.34, 0.3], -0.2, 1));
load.push(sack("sack", [-0.46, FLOOR_TOP + 0.5, 0.0], [0.32, 0.3, 0.3], 0.6, 2));
// a sack lying across the two barrels
load.push(
  group(nm("sack-lying"), [sack("sack", [0, 0, 0], [0.3, 0.28, 0.3], 0, 3)], { position: [0.5, FLOOR_TOP + 0.46 + 0.13, 0.0] })
    .rotate(Math.PI / 2, 0, 0.1)
);

const cartBody = group("cart-body", [
  ...planks,
  ...frame,
  ...load,
  buildWheel("wheel-l", -WHEEL_Z),
  buildWheel("wheel-r", WHEEL_Z)
], { position: [0.65, 0, 0] });
const cart = group("cart", [cartBody], { position: [0, 0, 0] }).runtime({ id: "cart", mutable: true });

// ---------- ground ----------
const patches: AuraTransformSpec[] = [];
const patchColors: string[] = [];
for (let i = 0; i < 26; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = between(0, 14);
  patches.push({
    position: [Math.cos(a) * r, 0.0, Math.sin(a) * r],
    rotation: [0, rand() * 6, 0],
    scale: [between(1.2, 3.6), 0.05, between(1, 2.6)]
  });
  patchColors.push(hsl(between(26, 36), between(28, 40), between(36, 52)));
}
const stones: AuraTransformSpec[] = [];
const stoneColors: string[] = [];
const addStone = (x: number, z: number, s: number): void => {
  stones.push({
    position: [x, s * 0.22, z],
    rotation: [between(-0.2, 0.2), rand() * 6, between(-0.2, 0.2)],
    scale: [s * between(1.1, 1.6), s * between(0.7, 1), s * between(0.9, 1.3)]
  });
  stoneColors.push(hsl(between(24, 40), between(4, 10), between(40, 62)));
};
for (let i = 0; i < 16; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = between(2.4, 7.5);
  addStone(Math.cos(a) * r, Math.sin(a) * r, between(0.14, 0.42));
}
for (let i = 0; i < 40; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = between(2.2, 9);
  addStone(Math.cos(a) * r, Math.sin(a) * r, between(0.04, 0.09));
}

const FOG = "#ead3ae";
const app = createAuraApp("#app", {
  scene: scene({ background: FOG })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.hemisphere({ skyColor: "#ffe7c2", groundColor: "#6b4a2c", intensity: 0.55 }))
    .add(lights.directional({ name: "sun", position: [5.5, 7.5, 4.5], target: [0, 0.5, 0], intensity: 2.7, color: "#ffd8a6", shadow: true }))
    .add(lights.directional({ name: "fill", position: [-5, 3, -3], target: [0, 0.5, 0], intensity: 0.5, color: "#c9d6ff" }))
    .add(effects.fog({ color: FOG, density: 0.012 }))
    .add(primitives.plane({ name: "ground", size: [160, 1, 160], material: material.pbr({ color: "#8c6b46", roughness: 1 }) }))
    .add(instances.sphere({ name: "dirt-patches", transforms: patches, colors: patchColors, material: white, castShadow: false }))
    .add(instances.sphere({ name: "stones", transforms: stones, colors: stoneColors, material: white }))
    .add(cart)
    .camera(camera.perspective({ position: [4.3, 2.7, 5.2], target: [0, 0.75, 0], fov: 38, near: 0.1, far: 300 }))
});

let yaw = 0.55;
let spin = 0;
app.onFrame((frame) => {
  const dt = Math.min(frame.dt, 0.1);
  yaw += dt * 0.22;
  spin += dt * 0.6;
  app.nodes.require("cart").setRotation(0, yaw, 0);
  app.nodes.require("wheel-l").setRotation(0, 0, -spin);
  app.nodes.require("wheel-r").setRotation(0, 0, -spin);
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
    window.__TASK_STATE__ = {
      ready: true,
      wheelCount: 2,
      spokeCount: SPOKES_PER_WHEEL * 2,
      plankCount
    };
  });
});
