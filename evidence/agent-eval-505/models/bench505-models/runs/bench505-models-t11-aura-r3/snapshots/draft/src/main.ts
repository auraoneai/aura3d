import {
  camera,
  createAuraApp,
  effects,
  environments,
  group,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraNodeInput,
  type AuraTransformSpec
} from "@aura3d/engine";

type Vec3 = [number, number, number];

declare global {
  interface Window {
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
    __EVAL_READY__?: boolean;
  }
}

// Seeded RNG: the same cart on every load.
let seed = 70211;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- materials ----------
const wood = (h: number, s: number, l: number, roughness = 0.88) =>
  material.pbr({ color: `hsl(${h}, ${s}%, ${l}%)`, roughness, metallic: 0 });
const iron = material.pbr({ color: "#3a3d42", metallic: 0.75, roughness: 0.42 });
const darkWood = wood(26, 34, 22);
const oakWood = wood(30, 38, 34);
const burlapA = material.pbr({ color: "#b99b66", roughness: 1 });
const burlapB = material.pbr({ color: "#a8895a", roughness: 1 });
const burlapC = material.pbr({ color: "#c4aa78", roughness: 1 });
const ropeMat = material.pbr({ color: "#6b5233", roughness: 1 });

// ---------- small builders ----------
const box = (name: string, size: Vec3, position: Vec3, mat = oakWood, rotation: Vec3 = [0, 0, 0]): AuraNodeInput =>
  primitives.box({ name, size, position, rotation, material: mat });

const cyl = (name: string, dia: number, length: number, position: Vec3, mat = iron, rotation: Vec3 = [0, 0, 0]): AuraNodeInput =>
  primitives.cylinder({ name, size: [dia, length, dia], position, rotation, material: mat });

const ball = (name: string, dia: number, position: Vec3, mat = iron): AuraNodeInput =>
  primitives.sphere({ name, size: dia, position, material: mat });

// ---------- geometry constants (metres; cart long axis = X, axle along Z) ----------
const FLOOR_Y = 0.72; // top of the bed planks
const AXLE_X = -0.15;
const WHEEL_R = 0.5575;
const AXLE_Y = WHEEL_R;
const WHEEL_Z = 0.76;
const SPOKES_PER_WHEEL = 12;

const parts: AuraNodeInput[] = [];

// ---------- bed: floor planks ----------
const PLANK_COUNT = 10;
const PLANK_W = 0.118;
for (let i = 0; i < PLANK_COUNT; i += 1) {
  const len = 2.1 + (rand() - 0.5) * 0.14;
  const z = (i - (PLANK_COUNT - 1) / 2) * (PLANK_W + 0.003);
  const x = (rand() - 0.5) * 0.06;
  const y = 0.7 + (rand() - 0.5) * 0.008;
  const yaw = (rand() - 0.5) * 0.025;
  const mat = wood(24 + rand() * 12, 34 + rand() * 10, 29 + rand() * 12);
  parts.push(box(`plank-${i}`, [len, 0.04, PLANK_W], [x, y, z], mat, [0, yaw, 0]));
}

// ---------- frame: runners, handles, bearers ----------
for (const s of [-1, 1]) {
  parts.push(box(`runner-${s}`, [2.25, 0.07, 0.07], [0.025, 0.65, 0.5 * s], darkWood));
  // push handle: front point (-0.6, 0.65) rising to the rear point (-2.7, 0.82)
  const hx0 = -0.6, hy0 = 0.65, hx1 = -2.7, hy1 = 0.82;
  const hlen = Math.hypot(hx1 - hx0, hy1 - hy0);
  const hang = -Math.atan2(hy1 - hy0, hx0 - hx1);
  parts.push(box(`handle-${s}`, [hlen, 0.066, 0.066], [(hx0 + hx1) / 2, (hy0 + hy1) / 2, 0.5 * s], oakWood, [0, 0, hang]));
  // thicker grip at the rear end
  const gx = -2.45;
  const gy = hy0 + (hx0 - gx) * ((hy1 - hy0) / (hx0 - hx1));
  parts.push(box(`grip-${s}`, [0.5, 0.082, 0.082], [gx, gy, 0.5 * s], darkWood, [0, 0, hang]));
  parts.push(box(`handle-cap-${s}`, [0.025, 0.09, 0.09], [-2.71, hy1 - 0.005, 0.5 * s], iron, [0, 0, hang]));
  // iron strap where handle meets runner
  parts.push(box(`handle-strap-${s}`, [0.05, 0.085, 0.085], [-0.75, 0.655, 0.5 * s], iron));
  // axle bearer block between runner and wheel hub
  parts.push(box(`bearer-${s}`, [0.22, 0.07, 0.14], [AXLE_X, 0.615, 0.5 * s], darkWood));
}
parts.push(box("handle-brace", [0.06, 0.06, 1.0], [-1.8, 0.747, 0], darkWood));
parts.push(box("handle-brace-2", [0.05, 0.05, 1.0], [-2.3, 0.78, 0], darkWood));

// ---------- axle ----------
parts.push(cyl("axle", 0.08, 1.9, [AXLE_X, AXLE_Y, 0], darkWood, [Math.PI / 2, 0, 0]));
for (const s of [-1, 1]) {
  parts.push(cyl(`linchpin-${s}`, 0.03, 0.12, [AXLE_X, AXLE_Y, 0.91 * s], iron, [Math.PI / 2, 0, 0]));
}

// ---------- front prop stand ----------
parts.push(box("front-beam", [0.08, 0.07, 1.1], [1.1, 0.65, 0], darkWood));
for (const s of [-1, 1]) {
  parts.push(box(`leg-${s}`, [0.06, 0.66, 0.06], [1.175, 0.32, 0.4 * s], oakWood, [0, 0, 0.23]));
  parts.push(box(`leg-strap-${s}`, [0.085, 0.04, 0.085], [1.11, 0.62, 0.4 * s], iron));
}
parts.push(box("leg-foot-bar", [0.06, 0.04, 0.95], [1.25, 0.02, 0], darkWood));

// ---------- corner posts, rails ----------
const POST_X = 0.98;
const POST_Z = 0.58;
const POST_H = 0.62;
const POST_CY = FLOOR_Y + POST_H / 2;
let postIndex = 0;
for (const px of [-POST_X, POST_X]) {
  for (const pz of [-POST_Z, POST_Z]) {
    parts.push(box(`post-${postIndex}`, [0.07, POST_H, 0.07], [px, POST_CY, pz], oakWood));
    for (const y of [0.9, 1.24]) {
      parts.push(box(`post-band-${postIndex}-${y}`, [0.084, 0.045, 0.084], [px, y, pz], iron));
    }
    postIndex += 1;
  }
}
const LONG_RAILS = [0.88, 1.06, 1.24];
for (const s of [-1, 1]) {
  LONG_RAILS.forEach((y, k) => {
    const len = 2.08 + (rand() - 0.5) * 0.04;
    parts.push(box(`long-rail-${s}-${k}`, [len, 0.07, 0.035], [(rand() - 0.5) * 0.02, y, 0.635 * s], wood(26 + rand() * 8, 36, 30 + rand() * 8), [0, 0, (rand() - 0.5) * 0.01]));
    // bolts through rail and post
    for (const px of [-POST_X, POST_X]) {
      parts.push(ball(`bolt-${s}-${k}-${px}`, 0.032, [px, y, 0.655 * s]));
    }
  });
}
const END_RAILS = [0.92, 1.14];
for (const s of [-1, 1]) {
  END_RAILS.forEach((y, k) => {
    parts.push(box(`end-rail-${s}-${k}`, [0.035, 0.07, 1.3], [1.035 * s, y, 0], wood(25 + rand() * 8, 36, 28 + rand() * 8)));
    for (const pz of [-POST_Z, POST_Z]) {
      parts.push(ball(`end-bolt-${s}-${k}-${pz}`, 0.03, [1.058 * s, y, pz]));
    }
  });
}
// iron straps across the floor
for (const x of [-0.85, 0.85]) {
  parts.push(box(`floor-strap-${x}`, [0.06, 0.012, 1.26], [x, 0.724, 0], iron));
  for (const z of [-0.5, -0.25, 0, 0.25, 0.5]) {
    parts.push(ball(`strap-bolt-${x}-${z}`, 0.026, [x, 0.73, z]));
  }
}

// ---------- wheels ----------
let spokeTotal = 0;
const makeWheel = (side: -1 | 1): AuraNodeInput => {
  const kids: AuraNodeInput[] = [];
  const tag = side < 0 ? "l" : "r";
  // hub, iron bands, cap and bolts
  kids.push(cyl(`hub-${tag}`, 0.17, 0.2, [0, 0, 0], wood(24, 36, 26), [Math.PI / 2, 0, 0]));
  for (const dz of [-0.075, 0.075]) {
    kids.push(cyl(`hub-band-${tag}-${dz}`, 0.2, 0.03, [0, 0, dz], iron, [Math.PI / 2, 0, 0]));
  }
  kids.push(cyl(`hub-cap-${tag}`, 0.1, 0.03, [0, 0, 0.105 * side], iron, [Math.PI / 2, 0, 0]));
  for (let b = 0; b < 6; b += 1) {
    const a = (b / 6) * Math.PI * 2;
    kids.push(ball(`hub-bolt-${tag}-${b}`, 0.026, [Math.cos(a) * 0.072, Math.sin(a) * 0.072, 0.122 * side]));
  }
  // spokes
  for (let k = 0; k < SPOKES_PER_WHEEL; k += 1) {
    const a = (k / SPOKES_PER_WHEEL) * Math.PI * 2 + 0.1;
    const r = 0.28;
    kids.push(box(`spoke-${tag}-${k}`, [0.42, 0.048, 0.042], [Math.cos(a) * r, Math.sin(a) * r, 0], oakWood, [0, 0, a]));
    spokeTotal += 1;
  }
  // wooden felloes (rim segments)
  const FELLOES = 12;
  for (let k = 0; k < FELLOES; k += 1) {
    const a = (k / FELLOES) * Math.PI * 2 + 0.1 + Math.PI / FELLOES;
    const r = 0.495;
    kids.push(box(`felloe-${tag}-${k}`, [0.07, 0.285, 0.09], [Math.cos(a) * r, Math.sin(a) * r, 0], wood(26 + rand() * 6, 36, 27 + rand() * 6), [0, 0, a]));
  }
  // iron tyre segments
  const TYRE = 18;
  for (let k = 0; k < TYRE; k += 1) {
    const a = (k / TYRE) * Math.PI * 2;
    const r = 0.545;
    kids.push(box(`tyre-${tag}-${k}`, [0.025, 0.2, 0.105], [Math.cos(a) * r, Math.sin(a) * r, 0], iron, [0, 0, a]));
  }
  // tyre nails
  for (let k = 0; k < 9; k += 1) {
    const a = (k / 9) * Math.PI * 2 + 0.2;
    kids.push(ball(`tyre-nail-${tag}-${k}`, 0.028, [Math.cos(a) * 0.558, Math.sin(a) * 0.558, 0]));
  }
  return group(`wheel-${tag}`, kids, { position: [AXLE_X, AXLE_Y, WHEEL_Z * side] }).runtime({ id: `wheel-${tag}`, mutable: true });
};
parts.push(makeWheel(-1), makeWheel(1));

// ---------- cargo ----------
const sack = (name: string, pos: Vec3, yaw: number, w: number, h: number, mat = burlapA): AuraNodeInput =>
  group(name, [
    primitives.sphere({ name: `${name}-body`, size: [w, h, w * 0.82], position: [0, h / 2, 0], material: mat }),
    primitives.cone({ name: `${name}-neck`, size: [w * 0.34, h * 0.3, w * 0.3], position: [0, h * 0.92, 0], material: mat }),
    primitives.sphere({ name: `${name}-tie`, size: [w * 0.22, 0.04, w * 0.22], position: [0, h * 0.84, 0], material: ropeMat })
  ], { position: pos, rotation: [0, yaw, 0] });

const barrel = (name: string, pos: Vec3): AuraNodeInput => {
  const stave = wood(28, 40, 30);
  return group(name, [
    cyl(`${name}-low`, 0.4, 0.2, [0, 0.1, 0], stave),
    cyl(`${name}-mid`, 0.46, 0.22, [0, 0.3, 0], stave),
    cyl(`${name}-top`, 0.4, 0.2, [0, 0.5, 0], stave),
    cyl(`${name}-hoop-a`, 0.415, 0.03, [0, 0.05, 0], iron),
    cyl(`${name}-hoop-b`, 0.472, 0.03, [0, 0.21, 0], iron),
    cyl(`${name}-hoop-c`, 0.472, 0.03, [0, 0.39, 0], iron),
    cyl(`${name}-hoop-d`, 0.415, 0.03, [0, 0.55, 0], iron),
    cyl(`${name}-lid`, 0.37, 0.02, [0, 0.601, 0], darkWood)
  ], { position: pos });
};

const crate = (name: string, pos: Vec3, s: number, yaw: number, mat = wood(33, 40, 40)): AuraNodeInput => {
  const kids: AuraNodeInput[] = [box(`${name}-body`, [s, s, s], [0, s / 2, 0], mat)];
  const o = s / 2 - 0.0225;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kids.push(box(`${name}-post-${sx}-${sz}`, [0.05, s + 0.01, 0.05], [o * sx, s / 2, o * sz], darkWood));
    }
  }
  for (const sy of [0.04, s - 0.04]) {
    kids.push(box(`${name}-band-x-${sy}`, [s + 0.01, 0.045, s + 0.01], [0, sy, 0], darkWood));
  }
  return group(name, kids, { position: pos, rotation: [0, yaw, 0] });
};

parts.push(sack("sack-1", [-0.62, FLOOR_Y, -0.26], 0.4, 0.52, 0.5, burlapA));
parts.push(sack("sack-2", [-0.6, FLOOR_Y, 0.28], -0.3, 0.5, 0.46, burlapB));
parts.push(sack("sack-3", [-0.1, FLOOR_Y, -0.32], 1.0, 0.48, 0.44, burlapC));
parts.push(sack("sack-4", [-0.6, FLOOR_Y + 0.4, 0.0], 0.8, 0.46, 0.42, burlapC));
parts.push(barrel("barrel-1", [0.7, FLOOR_Y, 0.26]));
parts.push(crate("crate-1", [0.4, FLOOR_Y, -0.28], 0.4, 0.12));
parts.push(crate("crate-2", [0.12, FLOOR_Y, 0.3], 0.34, -0.2, wood(30, 36, 36)));
parts.push(crate("crate-3", [0.4, FLOOR_Y + 0.4, -0.28], 0.28, 0.45, wood(36, 38, 44)));
// a coil of rope on the floor, lashed beside the barrel
parts.push(cyl("rope-coil", 0.3, 0.07, [0.78, FLOOR_Y + 0.035, -0.32], ropeMat));

// Shift so the cart's centre sits on the turntable axis.
const cart = group("cart", [group("cart-body", parts, { position: [0.7, 0, 0] })]).runtime({ id: "cart", mutable: true });

// ---------- ground and stones ----------
const patches: AuraTransformSpec[] = [];
const patchColors: string[] = [];
for (let i = 0; i < 18; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = 1 + rand() * 11;
  const d = 1 + rand() * 2.2;
  patches.push({ position: [Math.cos(a) * r, 0.006, Math.sin(a) * r], scale: [d, 0.01, d * (0.6 + rand() * 0.5)], rotation: [0, rand() * 3, 0] });
  patchColors.push(`hsl(${26 + Math.floor(rand() * 8)}, ${28 + Math.floor(rand() * 10)}%, ${28 + Math.floor(rand() * 14)}%)`);
}

const stones: AuraTransformSpec[] = [];
const stoneColors: string[] = [];
for (let i = 0; i < 16; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = 3.3 + rand() * 7;
  const s = 0.1 + rand() * rand() * 0.45;
  stones.push({
    position: [Math.cos(a) * r, s * 0.18, Math.sin(a) * r],
    scale: [s * (1 + rand() * 0.5), s * (0.55 + rand() * 0.3), s * (0.9 + rand() * 0.4)],
    rotation: [0, rand() * 3, 0]
  });
  const g = 38 + Math.floor(rand() * 18);
  stoneColors.push(`hsl(${30 + Math.floor(rand() * 15)}, 6%, ${g}%)`);
}

const app = createAuraApp("#app", {
  resize: false,
  scene: scene({ background: "#d8c29b", camera: { mode: "perspective", position: [5.6, 3.3, 5.4], target: [0, 0.75, 0], fov: 38, near: 0.1, far: 120 } })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.hemisphere({ skyColor: "#ffe9c8", groundColor: "#6e4d2c", intensity: 0.55 }))
    .add(lights.directional({
      name: "sun",
      position: [6, 8.5, 3.5],
      target: [0, 0.5, 0],
      intensity: 3.1,
      color: "#ffd9a6",
      shadow: { filter: "pcf", softness: 2, mapSize: 2048, intensity: 0.85 }
    }))
    .add(lights.directional({ name: "fill", position: [-5, 3, -4], target: [0, 0.5, 0], intensity: 0.6, color: "#c9d6ff" }))
    .add(effects.fog({ color: "#d8c29b", density: 0.014 }))
    .add(primitives.plane({ name: "ground", size: [80, 1, 80], material: material.pbr({ color: "#7d5e3d", roughness: 1 }), castShadow: false }))
    .add(instances.cylinder({ name: "dirt-patches", transforms: patches, colors: patchColors, material: material.pbr({ color: "#ffffff", roughness: 1 }), castShadow: false, params: { radialSegments: 16 } }))
    .add(instances.sphere({ name: "stones", transforms: stones, colors: stoneColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .add(cart)
});

let t = 0;
app.onFrame((frame) => {
  t += frame.dt;
  app.nodes.require("cart").setRotation(0, t * 0.3, 0);
  const spin = -t * 0.9;
  app.nodes.require("wheel-l").setRotation(0, 0, spin);
  app.nodes.require("wheel-r").setRotation(0, 0, spin);
});

await app.ready();
requestAnimationFrame(() => {
  window.__TASK_STATE__ = { ready: true, wheelCount: 2, spokeCount: spokeTotal, plankCount: PLANK_COUNT };
  window.__EVAL_READY__ = true;
});
