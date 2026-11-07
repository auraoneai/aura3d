import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";
import { record } from "../../hook";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const wood = material.pbr({ color: "#7a4725", roughness: 0.55 });
const darkWood = material.pbr({ color: "#4e2b14", roughness: 0.5 });
const interior = material.pbr({ color: "#5c3a1e", roughness: 0.85 });
const brass = material.pbr({ color: "#d1a647", metallic: 0.85, roughness: 0.32 });
const dialMat = material.pbr({ color: "#f2e8cd", roughness: 0.8 });
const ink = material.pbr({ color: "#1c140e", roughness: 0.6 });
const red = material.pbr({ color: "#b3261e", roughness: 0.5 });
const glass = material.pbr({ color: "#cfe6f2", roughness: 0.05, opacity: 0.12 });
const leadWeight = material.pbr({ color: "#8f8566", metallic: 0.7, roughness: 0.4 });
const wallMat = material.pbr({ color: "#8a6a4c", roughness: 0.95 });
const wainscot = material.pbr({ color: "#5b3d27", roughness: 0.8 });
const floorMat = material.pbr({ color: "#4a2d19", roughness: 0.6 });

// ---------------------------------------------------------------------------
// Dimensions (metres). Clock front faces +z, floor at y = 0.
// ---------------------------------------------------------------------------
const HOOD_FRONT = 0.2; // z of the hood front face
const DIAL_Z = 0.205;
const PIVOT_Y = 1.18; // pendulum suspension point
const ROD_LEN = 0.64;
const WEIGHT_X = 0.15;
const WEIGHT_TOP_Y = 0.95;
const WEIGHT_RANGE = 0.25; // distance the weights sink before they are rewound
const WEIGHT_SPEED = 0.002; // m/s
const SWING = 0.17; // pendulum amplitude, radians
const TEETH = 15;

// ---------------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------------
const caseParts = [
  primitives.box({ name: "plinth", size: [0.62, 0.18, 0.42], material: darkWood }).position(0, 0.09, 0),
  primitives.box({ name: "plinth-trim", size: [0.56, 0.04, 0.38], material: wood }).position(0, 0.2, 0),
  // trunk: back, sides, lower front board, top rail
  primitives.box({ name: "trunk-back", size: [0.5, 1.05, 0.03], material: interior }).position(0, 0.725, -0.165),
  primitives.box({ name: "trunk-left", size: [0.06, 1.05, 0.36], material: wood }).position(-0.22, 0.725, 0),
  primitives.box({ name: "trunk-right", size: [0.06, 1.05, 0.36], material: wood }).position(0.22, 0.725, 0),
  primitives.box({ name: "trunk-lower-board", size: [0.5, 0.2, 0.03], material: wood }).position(0, 0.3, 0.165),
  primitives.box({ name: "trunk-lower-panel", size: [0.3, 0.12, 0.012], material: darkWood }).position(0, 0.3, 0.184),
  primitives.box({ name: "trunk-top-rail", size: [0.5, 0.1, 0.03], material: wood }).position(0, 1.2, 0.165),
  primitives.box({ name: "trunk-floor", size: [0.4, 0.02, 0.3], material: darkWood }).position(0, 0.41, 0),
  // glass-like opening
  primitives.box({ name: "glass", size: [0.4, 0.74, 0.006], material: glass, castShadow: false }).position(0, 0.78, 0.178),
  primitives.box({ name: "frame-left", size: [0.016, 0.76, 0.02], material: brass }).position(-0.204, 0.78, 0.178),
  primitives.box({ name: "frame-right", size: [0.016, 0.76, 0.02], material: brass }).position(0.204, 0.78, 0.178),
  primitives.box({ name: "frame-top", size: [0.4, 0.016, 0.02], material: brass }).position(0, 1.158, 0.178),
  primitives.box({ name: "frame-bottom", size: [0.4, 0.016, 0.02], material: brass }).position(0, 0.402, 0.178),
  // hood (solid box holding the dial) and crown
  primitives.box({ name: "hood", size: [0.6, 0.72, 0.4], material: wood }).position(0, 1.61, 0),
  primitives.box({ name: "hood-trim-low", size: [0.64, 0.04, 0.44], material: darkWood }).position(0, 1.27, 0),
  primitives.box({ name: "hood-trim-high", size: [0.66, 0.05, 0.46], material: darkWood }).position(0, 1.985, 0),
  primitives.box({ name: "hood-cap", size: [0.5, 0.05, 0.36], material: wood }).position(0, 2.035, 0),
  primitives.sphere({ name: "finial", size: 0.06, material: brass }).position(0, 2.09, 0),
  // dial
  primitives.cylinder({ name: "dial-bezel", size: [0.52, 0.012, 0.52], material: brass }).position(0, 1.61, 0.2).rotate(Math.PI / 2, 0, 0),
  primitives.cylinder({ name: "dial", size: [0.48, 0.012, 0.48], material: dialMat }).position(0, 1.61, DIAL_Z).rotate(Math.PI / 2, 0, 0)
];

// 12 hour marks
const DIAL_CY = 1.61;
const marks = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  const major = i % 3 === 0;
  const r = major ? 0.185 : 0.195;
  const len = major ? 0.06 : 0.04;
  const w = major ? 0.022 : 0.014;
  return primitives
    .box({ name: `hour-mark-${i + 1}`, size: [w, len, 0.006], material: ink })
    .position(Math.sin(a) * r, DIAL_CY + Math.cos(a) * r, DIAL_Z + 0.008)
    .rotate(0, 0, -a);
});

// Hands: each is a group pivoting at the dial centre.
const hand = (name: string, id: string, z: number, length: number, tail: number, width: number, mat: typeof ink) =>
  group(name, [
    primitives.box({ name: `${name}-blade`, size: [width, length + tail, 0.005], material: mat }).position(0, (length - tail) / 2, 0)
  ], { position: [0, DIAL_CY, z] }).runtime({ id, mutable: true });

const hands = [
  hand("hour-hand", "hour-hand", DIAL_Z + 0.014, 0.115, 0.02, 0.024, ink),
  hand("minute-hand", "minute-hand", DIAL_Z + 0.02, 0.175, 0.025, 0.016, ink),
  hand("second-hand", "second-hand", DIAL_Z + 0.026, 0.19, 0.05, 0.006, red),
  primitives.cylinder({ name: "hand-cap", size: [0.03, 0.012, 0.03], material: brass }).position(0, DIAL_CY, DIAL_Z + 0.032).rotate(Math.PI / 2, 0, 0)
];

// ---------------------------------------------------------------------------
// Pendulum, escapement and weights (inside the trunk)
// ---------------------------------------------------------------------------
const pendulum = group("pendulum", [
  primitives.box({ name: "pendulum-rod", size: [0.012, ROD_LEN, 0.01], material: brass }).position(0, -ROD_LEN / 2, 0),
  primitives.sphere({ name: "pendulum-pivot", size: 0.03, material: brass }),
  primitives.cylinder({ name: "pendulum-bob", size: [0.17, 0.028, 0.17], material: brass }).position(0, -ROD_LEN - 0.04, 0).rotate(Math.PI / 2, 0, 0),
  primitives.cylinder({ name: "pendulum-bob-core", size: [0.07, 0.034, 0.07], material: material.pbr({ color: "#8b6a22", metallic: 0.8, roughness: 0.35 }) }).position(0, -ROD_LEN - 0.04, 0).rotate(Math.PI / 2, 0, 0)
], { position: [0, PIVOT_Y, 0.02] }).runtime({ id: "pendulum", mutable: true });

const wheelTeeth = Array.from({ length: TEETH }, (_, i) => {
  const a = (i * 2 * Math.PI) / TEETH;
  return primitives
    .box({ name: `escape-tooth-${i}`, size: [0.012, 0.022, 0.008], material: brass })
    .position(Math.sin(a) * 0.05, Math.cos(a) * 0.05, 0)
    .rotate(0, 0, -a);
});
const escapeWheel = group("escape-wheel", [
  primitives.cylinder({ name: "escape-wheel-disc", size: [0.09, 0.006, 0.09], material: brass }).rotate(Math.PI / 2, 0, 0),
  primitives.box({ name: "escape-spoke-a", size: [0.09, 0.008, 0.006], material: brass }),
  primitives.box({ name: "escape-spoke-b", size: [0.008, 0.09, 0.006], material: brass }),
  ...wheelTeeth
], { position: [0, 1.04, -0.1] }).runtime({ id: "escape-wheel", mutable: true });

const anchor = group("escape-anchor", [
  primitives.box({ name: "anchor-arm", size: [0.1, 0.012, 0.008], material: brass }),
  primitives.box({ name: "anchor-pallet-left", size: [0.014, 0.04, 0.008], material: brass }).position(-0.045, -0.02, 0),
  primitives.box({ name: "anchor-pallet-right", size: [0.014, 0.04, 0.008], material: brass }).position(0.045, -0.02, 0),
  primitives.sphere({ name: "anchor-pivot", size: 0.02, material: ink })
], { position: [0, 1.115, -0.1] }).runtime({ id: "escape-anchor", mutable: true });

const hangingWeight = (side: "left" | "right", x: number) =>
  group(`weight-${side}`, [
    primitives.cylinder({ name: `weight-${side}-body`, size: [0.07, 0.2, 0.07], material: leadWeight }),
    primitives.cylinder({ name: `weight-${side}-cap`, size: [0.05, 0.02, 0.05], material: brass }).position(0, 0.11, 0),
    primitives.box({ name: `weight-${side}-chain`, size: [0.008, 0.75, 0.008], material: brass }).position(0, 0.12 + 0.375, 0)
  ], { position: [x, WEIGHT_TOP_Y, -0.04] }).runtime({ id: `weight-${side}`, mutable: true });

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------
const room = [
  primitives.box({ name: "floor", size: [10, 0.1, 7], material: floorMat }).position(0, -0.05, 1.5),
  primitives.box({ name: "wall", size: [10, 4.5, 0.1], material: wallMat }).position(0, 2.25, -0.3),
  primitives.box({ name: "wainscot", size: [10, 0.9, 0.04], material: wainscot }).position(0, 0.45, -0.23),
  primitives.box({ name: "chair-rail", size: [10, 0.05, 0.06], material: darkWood }).position(0, 0.92, -0.22),
  primitives.box({ name: "baseboard", size: [10, 0.14, 0.07], material: darkWood }).position(0, 0.07, -0.2)
];

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const stage = scene({ background: "#24160d" })
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffd9a8", groundColor: "#4a2d19", intensity: 0.35 }))
  .add(lights.directional({ name: "key", position: [1.8, 3.2, 3.5], target: [0, 1, 0], intensity: 1.6, color: "#ffd2a0", shadow: true }))
  .add(lights.point({ name: "lamp-trunk", position: [0, 0.85, 0.1], intensity: 3.5, distance: 2.2, color: "#ffb45e" }))
  .add(lights.point({ name: "lamp-room", position: [-1.2, 1.9, 1.6], intensity: 5, distance: 6, color: "#ffc27a" }))
  .add(lights.point({ name: "lamp-dial", position: [0, 1.75, 0.7], intensity: 2.5, distance: 2.5, color: "#ffd9a0" }))
  .addMany(room)
  .addMany(caseParts)
  .addMany(marks)
  .addMany(hands)
  .add(pendulum)
  .add(escapeWheel)
  .add(anchor)
  .add(hangingWeight("left", -WEIGHT_X))
  .add(hangingWeight("right", WEIGHT_X))
  .camera(camera.frame(caseParts, { fill: 0.85, angle: "front", fov: 40 }));

const app = createAuraApp("#app", { scene: stage });
const cam514 = stage.toJSON().camera;
record(() => camera.worldBounds(caseParts), () => ({ position: cam514.position!, target: cam514.target!, fov: cam514.fov! }));

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;

function update(): void {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const s = now.getSeconds(); // integer: the second hand ticks once per second
  const m = now.getMinutes();
  const h = now.getHours() % 12;

  const secAngle = (s / 60) * TAU;
  const minAngle = ((m + s / 60) / 60) * TAU;
  const hourAngle = ((h + m / 60 + s / 3600) / 12) * TAU;
  app.nodes.require("second-hand").setRotation(0, 0, -secAngle);
  app.nodes.require("minute-hand").setRotation(0, 0, -minAngle);
  app.nodes.require("hour-hand").setRotation(0, 0, -hourAngle);

  // Period 2 s. Sinusoidal angle: slowest at the extremes, fastest through the centre.
  const swing = SWING * Math.sin(Math.PI * (nowMs / 1000));
  app.nodes.require("pendulum").setRotation(0, 0, swing);

  // Escapement: the wheel advances one tooth step per second, the anchor rocks with the pendulum.
  const ticks = Math.floor(nowMs / 1000);
  app.nodes.require("escape-wheel").setRotation(0, 0, -(ticks % TEETH) * (TAU / TEETH));
  app.nodes.require("escape-anchor").setRotation(0, 0, swing * 0.35);

  // Weights sink very slowly, then are rewound.
  const sink = ((performance.now() / 1000) * WEIGHT_SPEED) % WEIGHT_RANGE;
  app.nodes.require("weight-left").setPosition(-WEIGHT_X, WEIGHT_TOP_Y - sink, -0.04);
  app.nodes.require("weight-right").setPosition(WEIGHT_X, WEIGHT_TOP_Y - sink * 0.9, -0.04);
}

app.onFrame(() => {
  update();
});

await app.ready();
update();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
