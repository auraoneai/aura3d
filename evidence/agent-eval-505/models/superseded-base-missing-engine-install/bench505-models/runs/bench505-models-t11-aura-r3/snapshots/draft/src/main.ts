import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

// Procedural medieval hand-cart. Cart space: +Z is the front (prop leg), -Z is the rear (handles), X is across the axle, Y is up.
// All geometry comes from primitives; there are no model, texture or image files.

type Vec3 = [number, number, number];
type Child = Parameters<typeof group>[1][number];

let seed = 1337;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();
const woodTone = (h: number, s: number, l: number, jitter: number): string =>
  `hsl(${Math.round(h + between(-4, 4))}, ${Math.round(s + between(-6, 6))}%, ${Math.round(l + between(-jitter, jitter))}%)`;

const wood = (h: number, s: number, l: number, jitter: number) =>
  material.pbr({ color: woodTone(h, s, l, jitter), roughness: 0.88, metallic: 0 });
const iron = material.pbr({ color: "#3a3b40", metallic: 0.85, roughness: 0.48 });
const darkWood = material.pbr({ color: "#5a3c22", roughness: 0.9 });
const burlap = (): ReturnType<typeof material.pbr> => material.pbr({ color: woodTone(38, 38, 62, 6), roughness: 1 });
const rope = material.pbr({ color: "#4a3520", roughness: 1 });

type Kind = "box" | "cylinder" | "sphere" | "cone";
const part = (
  kind: Kind,
  name: string,
  size: Vec3,
  pos: Vec3,
  mat: ReturnType<typeof material.pbr>,
  rot?: Vec3
): Child => {
  const b = primitives[kind]({ name, size, material: mat }).position(pos[0], pos[1], pos[2]);
  return rot ? b.rotate(rot[0], rot[1], rot[2]) : b;
};

const HALF_PI = Math.PI / 2;

// ---------- bed: floor planks ----------
const bed: Child[] = [];
const FLOOR_Y = 0.78;
const PLANK_COUNT = 10;
for (let i = 0; i < PLANK_COUNT; i += 1) {
  const len = 1.7 + between(-0.07, 0.07);
  const x = (i - (PLANK_COUNT - 1) / 2) * 0.125;
  bed.push(part("box", `bed-plank-${i}`, [0.12, 0.04, len], [x, FLOOR_Y + between(-0.004, 0.004), between(-0.03, 0.03)], wood(32, 42, 46, 8), [between(-0.012, 0.012), between(-0.018, 0.018), between(-0.012, 0.012)]));
}
// cross bearers under the floor
for (const z of [-0.55, 0.55]) bed.push(part("box", `bearer-${z}`, [1.2, 0.05, 0.09], [0, 0.735, z], darkWood));

// ---------- corner posts, side/end boards ----------
const px = 0.65;
const pz = 0.85;
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    const tag = `${sx > 0 ? "r" : "l"}${sz > 0 ? "f" : "b"}`;
    bed.push(part("box", `post-${tag}`, [0.07, 0.64, 0.07], [sx * px, 1.06, sz * pz], wood(28, 40, 34, 4)));
    bed.push(part("box", `post-band-low-${tag}`, [0.088, 0.045, 0.088], [sx * px, 0.84, sz * pz], iron));
    bed.push(part("box", `post-band-high-${tag}`, [0.088, 0.045, 0.088], [sx * px, 1.3, sz * pz], iron));
  }
}
const boardY = [0.88, 1.07, 1.26];
const boardH = [0.15, 0.15, 0.12];
boardY.forEach((y, k) => {
  for (const sx of [-1, 1]) {
    bed.push(part("box", `side-rail-${sx > 0 ? "r" : "l"}${k}`, [0.04, boardH[k], 1.7 + between(-0.04, 0.04)], [sx * (px + 0.01), y + between(-0.004, 0.004), between(-0.02, 0.02)], wood(30, 40, 42, 8), [0, between(-0.006, 0.006), between(-0.01, 0.01)]));
  }
  for (const sz of [-1, 1]) {
    bed.push(part("box", `end-rail-${sz > 0 ? "f" : "b"}${k}`, [1.3 + between(-0.03, 0.03), boardH[k], 0.04], [between(-0.02, 0.02), y + between(-0.004, 0.004), sz * (pz + 0.01)], wood(30, 40, 44, 8), [0, 0, between(-0.01, 0.01)]));
  }
});
// iron straps and bolts on the end boards
for (const sz of [-1, 1]) {
  for (const x of [-0.4, 0.4]) {
    bed.push(part("box", `strap-${sz}-${x}`, [0.05, 0.5, 0.012], [x, 1.07, sz * (pz + 0.04)], iron));
    for (const y of [0.88, 1.26]) bed.push(part("sphere", `bolt-${sz}-${x}-${y}`, [0.032, 0.032, 0.032], [x, y, sz * (pz + 0.05)], iron));
  }
}

// ---------- chassis: handles, axle, prop leg ----------
const chassis: Child[] = [];
const slope = 0.1; // handles rise toward the rear
const handleLen = 2.95;
const handleCz = -0.425;
const handleY = 0.62 + (0.1 - handleCz) * slope;
for (const sx of [-1, 1]) {
  const tag = sx > 0 ? "r" : "l";
  chassis.push(part("box", `handle-${tag}`, [0.065, 0.065, handleLen], [sx * 0.5, handleY, handleCz], wood(30, 38, 40, 3), [slope, 0, 0]));
  // rounded grip at the rear end
  const gz = handleCz - handleLen / 2 + 0.2;
  chassis.push(part("cylinder", `grip-${tag}`, [0.085, 0.4, 0.085], [sx * 0.5, 0.62 + (0.1 - gz) * slope, gz], darkWood, [HALF_PI - slope, 0, 0]));
  chassis.push(part("box", `handle-band-${tag}`, [0.08, 0.08, 0.03], [sx * 0.5, 0.62 + (0.1 - 0.85) * slope, 0.85], iron, [slope, 0, 0]));
}
chassis.push(part("box", "handle-brace", [1.06, 0.05, 0.06], [0, 0.62 + (0.1 + 1.45) * slope, -1.45], wood(28, 38, 34, 3)));
chassis.push(part("box", "front-stretcher", [1.06, 0.06, 0.07], [0, 0.62 + (0.1 - 1.0) * slope, 1.0], wood(28, 38, 34, 3)));
// axle
chassis.push(part("cylinder", "axle", [0.09, 2.14, 0.09], [0, 0.62, 0.1], darkWood, [0, 0, HALF_PI]));
for (const sx of [-1, 1]) {
  chassis.push(part("cylinder", `axle-washer-${sx}`, [0.15, 0.02, 0.15], [sx * 1.0, 0.62, 0.1], iron, [0, 0, HALF_PI]));
  chassis.push(part("sphere", `axle-cap-${sx}`, [0.09, 0.09, 0.09], [sx * 1.07, 0.62, 0.1], iron));
  chassis.push(part("box", `axle-bracket-${sx}`, [0.1, 0.06, 0.2], [sx * 0.5, 0.68, 0.1], iron));
}
// front prop leg: two legs joined by a cross bar, resting on the ground
const legTop = 0.62 + (0.1 - 1.0) * slope;
for (const sx of [-1, 1]) {
  const h = legTop;
  chassis.push(part("box", `prop-leg-${sx}`, [0.06, h, 0.06], [sx * 0.45, h / 2, 1.0], wood(28, 38, 32, 3)));
  chassis.push(part("box", `prop-foot-${sx}`, [0.12, 0.04, 0.16], [sx * 0.45, 0.02, 1.02], darkWood));
}
chassis.push(part("box", "prop-crossbar", [0.9, 0.05, 0.05], [0, 0.26, 1.0], wood(28, 38, 32, 3)));

// ---------- wheels ----------
const WHEEL_R = 0.62;
const SPOKES = 12;
const WHEEL_X = 0.86;
const wheelParts = (side: "l" | "r"): Child[] => {
  const w: Child[] = [];
  w.push(part("cylinder", `hub-${side}`, [0.2, 0.26, 0.2], [0, 0, 0], wood(26, 38, 30, 2), [0, 0, HALF_PI]));
  for (const dx of [-0.1, 0.1]) w.push(part("cylinder", `hub-band-${side}-${dx}`, [0.23, 0.035, 0.23], [dx, 0, 0], iron, [0, 0, HALF_PI]));
  w.push(part("cylinder", `hub-band-mid-${side}`, [0.215, 0.03, 0.215], [0, 0, 0], iron, [0, 0, HALF_PI]));
  for (let i = 0; i < SPOKES; i += 1) {
    const a = (i / SPOKES) * Math.PI * 2;
    const r = 0.31;
    w.push(part("cylinder", `spoke-${side}-${i}`, [0.05, 0.46, 0.05], [0, Math.cos(a) * r, Math.sin(a) * r], wood(30, 40, 42, 4), [a, 0, 0]));
  }
  const FELLOES = 12;
  for (let i = 0; i < FELLOES; i += 1) {
    const a = ((i + 0.5) / FELLOES) * Math.PI * 2;
    const rf = 0.57;
    w.push(part("box", `felloe-${side}-${i}`, [0.09, 0.075, 0.325], [0, Math.cos(a) * rf, Math.sin(a) * rf], wood(30, 40, 38, 4), [a, 0, 0]));
    const rt = 0.61;
    w.push(part("box", `tyre-${side}-${i}`, [0.1, 0.022, 0.31], [0, Math.cos(a) * rt, Math.sin(a) * rt], iron, [a, 0, 0]));
    // nails through the tyre
    w.push(part("sphere", `tyre-nail-${side}-${i}`, [0.028, 0.028, 0.028], [0.04, Math.cos(a) * 0.622, Math.sin(a) * 0.622], iron));
  }
  return w;
};
const wheelL = group("wheel-l", wheelParts("l"), { position: [-WHEEL_X, WHEEL_R, 0.1] }).runtime({ id: "wheel-l", mutable: true });
const wheelR = group("wheel-r", wheelParts("r"), { position: [WHEEL_X, WHEEL_R, 0.1] }).runtime({ id: "wheel-r", mutable: true });

// ---------- cargo ----------
const cargo: Child[] = [];
const BED_TOP = FLOOR_Y + 0.02;

const barrel = (name: string, x: number, z: number, yaw: number) => {
  const wm = wood(30, 42, 36, 3);
  const h = 0.56;
  const cy = BED_TOP + h / 2;
  const parts: Child[] = [
    part("cylinder", `${name}-mid`, [0.46, 0.3, 0.46], [0, 0, 0], wm),
    part("cylinder", `${name}-upper`, [0.4, 0.14, 0.4], [0, 0.22, 0], wm),
    part("cylinder", `${name}-lower`, [0.4, 0.14, 0.4], [0, -0.22, 0], wm),
    part("cylinder", `${name}-lid`, [0.37, 0.02, 0.37], [0, h / 2 - 0.005, 0], wood(34, 40, 48, 2)),
    part("cylinder", `${name}-hoop-top`, [0.415, 0.035, 0.415], [0, 0.24, 0], iron),
    part("cylinder", `${name}-hoop-bot`, [0.415, 0.035, 0.415], [0, -0.24, 0], iron),
    part("cylinder", `${name}-hoop-mid-a`, [0.475, 0.035, 0.475], [0, 0.08, 0], iron),
    part("cylinder", `${name}-hoop-mid-b`, [0.475, 0.035, 0.475], [0, -0.08, 0], iron)
  ];
  return group(name, parts, { position: [x, cy, z] }).rotate(0, yaw, 0);
};
cargo.push(barrel("barrel-a", -0.3, -0.5, 0.2));
cargo.push(barrel("barrel-b", 0.32, -0.55, 0.9));

const crate = (name: string, size: Vec3, pos: Vec3, yaw: number, tone: number) => {
  const [w, h, d] = size;
  const body = wood(34, 38, tone, 4);
  const batten = material.pbr({ color: woodTone(30, 36, tone - 12, 3), roughness: 0.9 });
  const parts: Child[] = [part("box", `${name}-body`, size, [0, 0, 0], body)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(part("box", `${name}-post-${sx}${sz}`, [0.045, h + 0.02, 0.045], [sx * (w / 2 - 0.01), 0, sz * (d / 2 - 0.01)], batten));
  }
  parts.push(part("box", `${name}-lid-frame`, [w + 0.02, 0.035, d + 0.02], [0, h / 2, 0], batten));
  parts.push(part("box", `${name}-brace-front`, [w * 0.9, 0.05, 0.015], [0, 0, d / 2 + 0.004], batten, [0, 0, 0.18]));
  parts.push(part("box", `${name}-brace-side`, [0.015, 0.05, d * 0.9], [w / 2 + 0.004, 0, 0], batten, [0.18, 0, 0]));
  return group(name, parts, { position: pos }).rotate(0, yaw, 0);
};
cargo.push(crate("crate-a", [0.5, 0.32, 0.44], [0.02, BED_TOP + 0.16, 0.42], 0.08, 48));
cargo.push(crate("crate-b", [0.34, 0.26, 0.3], [0.04, BED_TOP + 0.32 + 0.13, 0.4], -0.35, 52));

const sack = (name: string, x: number, y: number, z: number, yaw: number, s: number, upright: boolean) => {
  const mat = burlap();
  const body: Vec3 = upright ? [0.44 * s, 0.52 * s, 0.36 * s] : [0.56 * s, 0.34 * s, 0.38 * s];
  const parts: Child[] = [part("sphere", `${name}-body`, body, [0, 0, 0], mat)];
  if (upright) {
    parts.push(part("sphere", `${name}-neck`, [0.14 * s, 0.14 * s, 0.14 * s], [0, 0.29 * s, 0], mat));
    parts.push(part("cylinder", `${name}-tie`, [0.11 * s, 0.03, 0.11 * s], [0, 0.22 * s, 0], rope));
    parts.push(part("cone", `${name}-top`, [0.12 * s, 0.1 * s, 0.12 * s], [0, 0.37 * s, 0], mat));
  } else {
    parts.push(part("sphere", `${name}-neck`, [0.13 * s, 0.13 * s, 0.13 * s], [0.3 * s, 0, 0], mat));
    parts.push(part("cylinder", `${name}-tie`, [0.1 * s, 0.03, 0.1 * s], [0.24 * s, 0, 0], rope, [0, 0, HALF_PI]));
  }
  return group(name, parts, { position: [x, y, z] }).rotate(0, yaw, 0);
};
cargo.push(sack("sack-a", -0.4, BED_TOP + 0.25, 0.42, 0.5, 1, true));
cargo.push(sack("sack-b", 0.42, BED_TOP + 0.24, 0.3, -0.7, 0.95, true));
cargo.push(sack("sack-c", 0.02, BED_TOP + 0.56 + 0.17, -0.52, 0.3, 1, false));
cargo.push(sack("sack-d", -0.42, BED_TOP + 0.2, -0.05, 1.2, 0.85, true));

// ---------- assemble the cart (turntable root) ----------
const cartBody = group("cart-body", [...bed, ...chassis, wheelL, wheelR, ...cargo], { position: [0, 0, 0.35] });
const cart = group("cart", [cartBody], { position: [0, 0, 0] }).runtime({ id: "cart", mutable: true });

// ---------- ground and stones ----------
const ground: Child[] = [primitives.plane({ name: "ground", size: [80, 1, 80], material: material.pbr({ color: "#8a6a47", roughness: 1 }) })];
const patchTones = ["#7a5b3b", "#957551", "#6f5336", "#9a7c58", "#80623f", "#8e6e4a", "#745738"];
patchTones.forEach((c, i) => {
  const a = (i / patchTones.length) * Math.PI * 2 + 0.4;
  const r = between(1.2, 5.5);
  ground.push(primitives.cylinder({ name: `dirt-patch-${i}`, size: [between(1.6, 3.2), 0.01, between(1.4, 2.8)], material: material.pbr({ color: c, roughness: 1 }), castShadow: false }).position(Math.cos(a) * r, 0.005, Math.sin(a) * r).rotate(0, between(0, 3), 0));
});
const stones: Child[] = [];
for (let i = 0; i < 16; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = between(2.4, 7);
  const s = between(0.14, 0.5);
  const g = Math.round(between(40, 58));
  stones.push(primitives.sphere({
    name: `stone-${i}`,
    size: [s * 1.4, s * 0.85, s * 1.1],
    material: material.pbr({ color: `hsl(${Math.round(between(26, 38))}, 8%, ${g}%)`, roughness: 0.95 })
  }).position(Math.cos(a) * r, s * 0.3, Math.sin(a) * r).rotate(0, rand() * 6, 0));
}

const app = createAuraApp("#app", {
  scene: scene({ background: "#e3cfa8" })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.hemisphere({ skyColor: "#ffe6c0", groundColor: "#6b4a2a", intensity: 0.45 }))
    .add(lights.directional({ name: "sun", position: [-5, 7, 6], target: [0, 0.7, 0], intensity: 2.6, color: "#ffd9a0", shadow: true }))
    .add(lights.directional({ name: "fill", position: [6, 3, -4], target: [0, 0.7, 0], intensity: 0.5, color: "#ffc58a" }))
    .add(effects.fog({ color: "#e3cfa8", density: 0.012 }))
    .addMany(ground)
    .addMany(stones)
    .add(cart)
    .camera(camera.perspective({ position: [3.9, 2.7, 4.6], target: [0, 0.75, 0], fov: 38, near: 0.1, far: 200 }))
});

const wheelCount = 2;
const spokeCount = wheelCount * SPOKES;
let turn = 0.5;
let spin = 0;
let signalled = false;
const signal = (): void => {
  if (signalled) return;
  signalled = true;
  const w = window as unknown as Record<string, unknown>;
  w.__TASK_STATE__ = { ready: true, wheelCount, spokeCount, plankCount: PLANK_COUNT };
  w.__EVAL_READY__ = true;
};

app.onFrame((frame) => {
  turn += frame.dt * 0.3;
  spin += frame.dt * 0.6;
  app.nodes.require("cart").setRotation(0, turn, 0);
  app.nodes.require("wheel-l").setRotation(spin, 0, 0);
  app.nodes.require("wheel-r").setRotation(spin, 0, 0);
  requestAnimationFrame(signal); // runs after this frame has been drawn
});

await app.ready();
