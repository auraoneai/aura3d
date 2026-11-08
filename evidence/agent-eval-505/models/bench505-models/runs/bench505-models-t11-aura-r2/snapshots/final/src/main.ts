import { camera, createAuraApp, effects, environments, group, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

// Procedural medieval hand-cart. Everything is built from primitives; no external files.
// Cart axes: +Z is the front (prop stand), -Z is the rear (push handles), X is the axle direction, Y is up.

type V3 = [number, number, number];
type Mat = ReturnType<typeof material.pbr>;
type Kind = "box" | "cylinder" | "sphere" | "cone";

let seed = 70311;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();

const hsl = (h: number, s: number, l: number): string => {
  const sat = s / 100, lig = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number): number => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (v: number): string => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
};

const wood = (h: number, s: number, l: number, rough = 0.85): Mat => material.pbr({ color: hsl(h, s, l), roughness: rough, metallic: 0 });
const randomWood = (): Mat => wood(between(24, 34), between(34, 46), between(30, 44));
const iron = material.pbr({ color: "#3b3e44", roughness: 0.5, metallic: 0.7 });
const ironLight = material.pbr({ color: "#575b62", roughness: 0.42, metallic: 0.75 });

const part = (kind: Kind, name: string, size: V3, pos: V3, mat: Mat, rot: V3 = [0, 0, 0], radial = 12) =>
  primitives[kind]({
    name, size, material: mat, castShadow: true, receiveShadow: true,
    ...(kind === "cylinder" || kind === "cone" ? { params: { radialSegments: radial } } : {})
  }).position(pos[0], pos[1], pos[2]).rotate(rot[0], rot[1], rot[2]);

// ---------------------------------------------------------------- wheels
const AXLE_Y = 0.48;
const AXLE_Z = 0.05;
const WHEEL_X = 0.77;
const SPOKES_PER_WHEEL = 12;
const wheelCount = 2;

const makeWheel = (side: "l" | "r", x: number) => {
  const kids = [];
  // hub: wooden nave with swelling in the middle, iron bands on both ends, iron cap on the outer face
  kids.push(part("cylinder", `${side}-hub-barrel`, [0.15, 0.17, 0.15], [0, 0, 0], wood(26, 40, 28), [0, 0, Math.PI / 2]));
  kids.push(part("cylinder", `${side}-hub-nave`, [0.2, 0.07, 0.2], [0, 0, 0], wood(28, 38, 32), [0, 0, Math.PI / 2]));
  for (const dx of [-0.07, 0.07]) {
    kids.push(part("cylinder", `${side}-hub-band-${dx > 0 ? "out" : "in"}`, [0.17, 0.03, 0.17], [dx, 0, 0], iron, [0, 0, Math.PI / 2], 16));
  }
  kids.push(part("cylinder", `${side}-hub-cap`, [0.09, 0.02, 0.09], [(x > 0 ? 1 : -1) * 0.09, 0, 0], ironLight, [0, 0, Math.PI / 2], 16));
  // spokes: radial wooden rods between the hub and the rim
  for (let k = 0; k < SPOKES_PER_WHEEL; k += 1) {
    const a = (k / SPOKES_PER_WHEEL) * Math.PI * 2;
    const r = 0.255;
    kids.push(part("cylinder", `${side}-spoke-${k}`, [0.045, 0.35, 0.045], [0, r * Math.cos(a), r * Math.sin(a)], randomWood(), [a, 0, 0], 8));
  }
  // rim: 16 wooden felloe segments, an iron tyre of 16 plates, studs over the tyre joints
  const segs = 16;
  for (let k = 0; k < segs; k += 1) {
    const a = (k / segs) * Math.PI * 2;
    kids.push(part("box", `${side}-felloe-${k}`, [0.07, 0.05, 0.2], [0, 0.435 * Math.cos(a), 0.435 * Math.sin(a)], randomWood(), [a, 0, 0]));
    kids.push(part("box", `${side}-tyre-${k}`, [0.088, 0.022, 0.2], [0, 0.47 * Math.cos(a), 0.47 * Math.sin(a)], iron, [a, 0, 0]));
    const b = a + Math.PI / segs;
    kids.push(part("sphere", `${side}-stud-${k}`, [0.03, 0.03, 0.03], [0, 0.482 * Math.cos(b), 0.482 * Math.sin(b)], ironLight, [0, 0, 0], 8));
  }
  return group(`${side}-wheel`, kids, { position: [x, AXLE_Y, AXLE_Z] }).runtime({ id: `${side}-wheel`, mutable: true });
};

// ---------------------------------------------------------------- bed
let plankCount = 0;
const planks: ReturnType<typeof part>[] = [];
const FLOOR_TOP = 0.78;
const addPlank = (name: string, size: V3, pos: V3, yaw = 0) => {
  plankCount += 1;
  planks.push(part("box", `plank-${name}`, size, pos, randomWood(), [0, yaw, 0]));
};

// floor: 9 boards along Z with a little variation in length, offset, tone and yaw
for (let i = 0; i < 9; i += 1) {
  const len = between(1.74, 1.84);
  const x = -0.48 + i * 0.12;
  addPlank(`floor-${i}`, [0.113, 0.04, len], [x, FLOOR_TOP - 0.02 + between(-0.003, 0.003), between(-0.03, 0.03)], between(-0.012, 0.012));
}
// side walls: 2 boards per long side; end walls: 2 boards each
const WALL_BOARDS_Y = [0.89, 1.01];
for (const sx of [-1, 1]) {
  WALL_BOARDS_Y.forEach((y, j) => addPlank(`side-${sx > 0 ? "r" : "l"}${j}`, [0.03, 0.11, between(1.78, 1.82)], [sx * 0.575, y + between(-0.004, 0.004), between(-0.015, 0.015)], between(-0.01, 0.01)));
}
for (const sz of [-1, 1]) {
  WALL_BOARDS_Y.forEach((y, j) => addPlank(`${sz > 0 ? "front" : "back"}-${j}`, [between(1.04, 1.06), 0.11, 0.03], [between(-0.01, 0.01), y + between(-0.004, 0.004), sz * 0.89], between(-0.01, 0.01)));
}

const frame = [];
const postMat = wood(25, 38, 26);
// corner posts, iron bands and bolts
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const px = sx * 0.56, pz = sz * 0.9;
  frame.push(part("box", `post-${sx}-${sz}`, [0.07, 0.56, 0.07], [px, 1.06, pz], postMat));
  for (const by of [0.9, 1.2]) frame.push(part("box", `post-band-${sx}-${sz}-${by}`, [0.082, 0.03, 0.082], [px, by, pz], iron));
}
// rails: 2 per side (upper and top), round poles on the long sides, square on the ends
const railMat = wood(27, 36, 34);
for (const sx of [-1, 1]) for (const [j, ry] of [1.13, 1.27].entries()) {
  frame.push(part("cylinder", `rail-side-${sx}-${j}`, [0.045, 1.9, 0.045], [sx * 0.56, ry, 0], railMat, [Math.PI / 2, 0, 0], 8));
}
for (const sz of [-1, 1]) for (const [j, ry] of [1.13, 1.27].entries()) {
  frame.push(part("cylinder", `rail-end-${sz}-${j}`, [0.045, 1.14, 0.045], [0, ry, sz * 0.9], railMat, [0, 0, Math.PI / 2], 8));
}
// bolts through the side boards at each post
for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of WALL_BOARDS_Y) {
  frame.push(part("sphere", `bolt-${sx}-${sz}-${y}`, [0.032, 0.032, 0.032], [sx * 0.593, y, sz * 0.82], ironLight, [0, 0, 0], 8));
}

// undercarriage: cross bearers, push handles, axle, axle beam
const under = [];
const bearerMat = wood(24, 36, 24);
for (const bz of [0.98, 0.75, -0.75]) under.push(part("box", `bearer-${bz}`, [1.4, 0.07, 0.09], [0, 0.71, bz], bearerMat));
const handleY = (z: number): number => 0.695 + 0.03 * (0.9 - z);
const handleMat = wood(30, 34, 38);
for (const sx of [-1, 1]) {
  const x = sx * 0.645;
  under.push(part("cylinder", `handle-${sx > 0 ? "r" : "l"}`, [0.06, 3.1, 0.06], [x, handleY(-0.55), -0.55], handleMat, [Math.PI / 2 + 0.03, 0, 0], 10));
  under.push(part("sphere", `handle-grip-${sx}`, [0.075, 0.075, 0.09], [x, handleY(-2.1), -2.1], handleMat, [0, 0, 0], 10));
  for (const cz of [0.98, 0.75, -0.75]) {
    under.push(part("box", `handle-clamp-${sx}-${cz}`, [0.08, 0.1, 0.045], [x, handleY(cz) + 0.01, cz], iron));
  }
}
under.push(part("cylinder", "handle-tie", [0.04, 1.29, 0.04], [0, handleY(-1.6), -1.6], handleMat, [0, 0, Math.PI / 2], 8));
// axle, beam on the axle and end caps with linchpins
under.push(part("cylinder", "axle", [0.07, 1.78, 0.07], [0, AXLE_Y, AXLE_Z], iron, [0, 0, Math.PI / 2], 12));
under.push(part("box", "axle-beam", [1.3, 0.16, 0.13], [0, 0.61, AXLE_Z], bearerMat));
for (const sx of [-1, 1]) {
  under.push(part("cylinder", `axle-cap-${sx}`, [0.09, 0.03, 0.09], [sx * 0.9, AXLE_Y, AXLE_Z], ironLight, [0, 0, Math.PI / 2], 12));
  under.push(part("box", `axle-strap-${sx}`, [0.04, 0.2, 0.15], [sx * 0.5, 0.61, AXLE_Z], iron));
}
// front prop stand: two splayed legs, a cross brace and feet
const standMat = wood(24, 34, 28);
for (const sx of [-1, 1]) {
  under.push(part("cylinder", `stand-leg-${sx}`, [0.065, 0.74, 0.065], [sx * 0.45, 0.335, 1.07], standMat, [-0.2, 0, 0], 10));
  under.push(part("box", `stand-foot-${sx}`, [0.11, 0.04, 0.16], [sx * 0.45, 0.02, 1.15], iron));
}
under.push(part("cylinder", "stand-brace", [0.04, 0.9, 0.04], [0, 0.3, 1.075], standMat, [0, 0, Math.PI / 2], 8));

// ---------------------------------------------------------------- cargo
const sackColors = ["#c9b48a", "#b9a47a", "#d4c39b", "#bfa97d"];
const sack = (name: string, pos: V3, size: V3, yaw: number, tint: string) => {
  const cloth = material.pbr({ color: tint, roughness: 1, metallic: 0 });
  const rope = material.pbr({ color: "#6b4f2e", roughness: 0.95, metallic: 0 });
  return group(name, [
    part("sphere", `${name}-body`, size, [0, 0, 0], cloth, [0, 0, 0], 16),
    part("sphere", `${name}-neck`, [size[0] * 0.38, size[1] * 0.3, size[2] * 0.38], [0, size[1] * 0.5, 0], cloth, [0, 0, 0], 12),
    part("cylinder", `${name}-tie`, [size[0] * 0.3, 0.025, size[2] * 0.3], [0, size[1] * 0.42, 0], rope, [0, 0, 0], 10)
  ], { position: pos, rotation: [0, yaw, 0] });
};

const barrel = (name: string, pos: V3, yaw: number) => {
  const stave = wood(26, 42, 27);
  const lid = wood(30, 36, 36);
  const parts = [
    part("cylinder", `${name}-mid`, [0.4, 0.3, 0.4], [0, 0, 0], stave, [0, 0, 0], 16),
    part("cylinder", `${name}-top`, [0.35, 0.13, 0.35], [0, 0.215, 0], stave, [0, 0, 0], 16),
    part("cylinder", `${name}-bottom`, [0.35, 0.13, 0.35], [0, -0.215, 0], stave, [0, 0, 0], 16),
    part("cylinder", `${name}-lid`, [0.31, 0.012, 0.31], [0, 0.282, 0], lid, [0, 0, 0], 16)
  ];
  for (const y of [-0.1, 0.1]) parts.push(part("cylinder", `${name}-hoop-mid-${y}`, [0.41, 0.03, 0.41], [0, y, 0], iron, [0, 0, 0], 16));
  for (const y of [-0.25, 0.25]) parts.push(part("cylinder", `${name}-hoop-end-${y}`, [0.36, 0.03, 0.36], [0, y, 0], iron, [0, 0, 0], 16));
  return group(name, parts, { position: pos, rotation: [0, yaw, 0] });
};

const crate = (name: string, pos: V3, size: V3, yaw: number, tone: number) => {
  const body = wood(33, 40, tone);
  const batten = wood(28, 36, tone - 9);
  const [w, h, d] = size;
  const parts = [part("box", `${name}-body`, size, [0, 0, 0], body)];
  for (const y of [-(h / 2 - 0.05), h / 2 - 0.05]) parts.push(part("box", `${name}-band-${y > 0 ? "top" : "bottom"}`, [w + 0.02, 0.06, d + 0.02], [0, y, 0], batten));
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
    parts.push(part("box", `${name}-post-${cx}-${cz}`, [0.05, h + 0.01, 0.05], [cx * (w / 2 - 0.012), 0, cz * (d / 2 - 0.012)], batten));
  }
  return group(name, parts, { position: pos, rotation: [0, yaw, 0] });
};

const cargo = [
  crate("crate-a", [-0.25, FLOOR_TOP + 0.16, -0.55], [0.44, 0.32, 0.44], 0.12, 42),
  crate("crate-b", [0.27, FLOOR_TOP + 0.14, -0.6], [0.4, 0.28, 0.4], -0.18, 37),
  crate("crate-c", [-0.25, FLOOR_TOP + 0.32 + 0.11, -0.55], [0.3, 0.22, 0.3], 0.55, 45),
  barrel("barrel-a", [0.27, FLOOR_TOP + 0.28, 0.05], 0.3),
  barrel("barrel-b", [-0.28, FLOOR_TOP + 0.28, 0.15], -0.5),
  sack("sack-a", [-0.2, FLOOR_TOP + 0.19, 0.62], [0.42, 0.4, 0.34], 0.4, sackColors[0]!),
  sack("sack-b", [0.22, FLOOR_TOP + 0.19, 0.66], [0.4, 0.38, 0.34], -0.3, sackColors[1]!),
  sack("sack-c", [0.0, FLOOR_TOP + 0.5, 0.58], [0.4, 0.36, 0.32], 0.9, sackColors[2]!),
  sack("sack-d", [-0.02, FLOOR_TOP + 0.15, 0.38], [0.36, 0.3, 0.3], 0.2, sackColors[3]!)
];

const cart = group("cart", [
  group("cart-offset", [
    ...planks, ...frame, ...under, makeWheel("l", -WHEEL_X), makeWheel("r", WHEEL_X), ...cargo
  ], { position: [0, 0, 0.45] })
]).runtime({ id: "cart", mutable: true });

// ---------------------------------------------------------------- ground
const white = material.pbr({ color: "#ffffff", roughness: 1, metallic: 0 });
const patches: AuraTransformSpec[] = [];
const patchColors: string[] = [];
for (let i = 0; i < 40; i += 1) {
  const a = rand() * Math.PI * 2, r = between(0, 9), d = between(0.8, 2.6);
  patches.push({ position: [Math.cos(a) * r, 0.006 + i * 0.0003, Math.sin(a) * r], scale: [d, 0.01, d * between(0.7, 1.2)], rotation: [0, rand() * 3, 0] });
  patchColors.push(hsl(between(24, 36), between(22, 38), between(28, 46)));
}
const stones: AuraTransformSpec[] = [];
const stoneColors: string[] = [];
for (let i = 0; i < 18; i += 1) {
  const a = rand() * Math.PI * 2, r = between(2.3, 7), s = between(0.1, 0.32);
  stones.push({ position: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r], rotation: [0, rand() * 6, 0], scale: [s * 1.5, s * 0.85, s * 1.15] });
  stoneColors.push(hsl(between(28, 40), between(4, 12), between(34, 56)));
}

const app = createAuraApp("#app", {
  scene: scene({ background: "#d9ccb0" })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.hemisphere({ skyColor: "#e3ecf7", groundColor: "#7a5a38", intensity: 0.45 }))
    .add(lights.directional({
      name: "sun", position: [5, 7.5, 3.5], target: [0, 0.6, 0], intensity: 2.6, color: "#ffd9a6",
      shadow: { filter: "pcf", softness: 1.6, mapSize: 2048, bias: 0.0005, normalBias: 0.02 }
    }))
    .add(effects.fog({ color: "#d9ccb0", density: 0.014 }))
    .add(primitives.plane({ name: "ground", size: [120, 1, 120], material: material.pbr({ color: "#7b5c3c", roughness: 1, metallic: 0 }), receiveShadow: true }))
    .add(instances.cylinder({ name: "dirt-patches", transforms: patches, colors: patchColors, material: white, receiveShadow: true, castShadow: false, params: { radialSegments: 20 } }))
    .add(instances.sphere({ name: "stones", transforms: stones, colors: stoneColors, material: white, castShadow: true, receiveShadow: true }))
    .add(cart)
    .camera(camera.perspective({ position: [3.7, 2.5, 4.5], target: [0, 0.68, 0], fov: 40, near: 0.1, far: 150 }))
});

const spokeCount = SPOKES_PER_WHEEL * wheelCount;
let t = 0;
app.onFrame((frame) => {
  t += frame.dt;
  const spin = t * 0.45;
  app.nodes.require("l-wheel").setRotation(spin, 0, 0);
  app.nodes.require("r-wheel").setRotation(spin, 0, 0);
  app.nodes.require("cart").setRotation(0, t * 0.14, 0);
});

await app.ready();
requestAnimationFrame(() => {
  const w = window as unknown as Record<string, unknown>;
  w.__TASK_STATE__ = { ready: true, wheelCount, spokeCount, plankCount };
  w.__EVAL_READY__ = true;
});
