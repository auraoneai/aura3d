import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];
const HALF_PI = Math.PI / 2;

const wood = material.pbr({ color: "#6b3f1f", roughness: 0.55 });
const darkWood = material.pbr({ color: "#4a2a14", roughness: 0.6 });
const interior = material.pbr({ color: "#2a1608", roughness: 0.9 });
const brass = material.pbr({ color: "#d4a63c", metallic: 0.85, roughness: 0.3 });
const faceMat = material.pbr({ color: "#f3ead2", roughness: 0.8 });
const ink = material.pbr({ color: "#1a1410", roughness: 0.5 });
const redInk = material.pbr({ color: "#b3201a", roughness: 0.5 });
const glass = material.pbr({ color: "#cfe6f0", roughness: 0.05, opacity: 0.14 });
const iron = material.pbr({ color: "#3a3a3e", metallic: 0.7, roughness: 0.4 });

let sc = scene({ background: "#120a06" })
  .camera(camera.perspective({ position: [0, 3.2, 9], target: [0, 2.3, 0], fov: 40, near: 0.5, far: 80 }))
  .add(environments.neutral({ intensity: 0.28, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffd9a8", groundColor: "#4a2c14", intensity: 0.5 }))
  .add(lights.directional({ position: [3, 7, 9], target: [0, 2.2, 0], intensity: 1.6, color: "#ffc98a", shadow: true }))
  .add(lights.point({ name: "inner-glow", position: [0, 2.0, 0.2], intensity: 5, color: "#ff9d42" }))
  .add(lights.point({ name: "face-glow", position: [0, 4.2, 1.6], intensity: 6, color: "#ffc27a" }))
  // floor and wall
  .add(primitives.plane({ name: "floor", size: [30, 1, 30], material: material.pbr({ color: "#7a5230", roughness: 0.6 }) }))
  .add(primitives.plane({ name: "wall", size: [30, 1, 14], material: material.pbr({ color: "#8c6a52", roughness: 0.95 }) }).position(0, 6, -0.7).rotate(HALF_PI, 0, 0))
  .add(primitives.box({ name: "skirting", size: [30, 0.4, 0.1], material: darkWood }).position(0, 0.2, -0.65))
  // case: base, sides, back, hood, crown
  .add(primitives.box({ name: "base", size: [1.9, 0.5, 1.0], material: darkWood }).position(0, 0.25, 0))
  .add(primitives.box({ name: "base-trim", size: [2.0, 0.1, 1.1], material: wood }).position(0, 0.55, 0))
  .add(primitives.box({ name: "side-l", size: [0.1, 2.5, 0.8], material: wood }).position(-0.75, 1.85, 0))
  .add(primitives.box({ name: "side-r", size: [0.1, 2.5, 0.8], material: wood }).position(0.75, 1.85, 0))
  .add(primitives.box({ name: "back", size: [1.6, 2.5, 0.05], material: interior }).position(0, 1.85, -0.375))
  .add(primitives.box({ name: "trunk-floor", size: [1.6, 0.06, 0.8], material: interior }).position(0, 0.63, 0))
  .add(primitives.box({ name: "stile-l", size: [0.16, 2.5, 0.06], material: wood }).position(-0.67, 1.85, 0.385))
  .add(primitives.box({ name: "stile-r", size: [0.16, 2.5, 0.06], material: wood }).position(0.67, 1.85, 0.385))
  .add(primitives.box({ name: "rail-top", size: [1.5, 0.12, 0.06], material: wood }).position(0, 3.04, 0.385))
  .add(primitives.box({ name: "rail-bottom", size: [1.5, 0.12, 0.06], material: wood }).position(0, 0.72, 0.385))
  .add(primitives.box({ name: "glass", size: [1.2, 2.2, 0.02], material: glass, castShadow: false }).position(0, 1.88, 0.41))
  .add(primitives.box({ name: "hood", size: [1.7, 1.55, 0.8], material: wood }).position(0, 3.875, 0))
  .add(primitives.box({ name: "crown", size: [1.95, 0.14, 0.95], material: darkWood }).position(0, 4.72, 0))
  .add(primitives.box({ name: "crown-top", size: [1.75, 0.1, 0.85], material: wood }).position(0, 4.84, 0))
  .add(primitives.box({ name: "hood-band", size: [1.85, 0.1, 0.9], material: darkWood }).position(0, 3.05, 0));

// round face with bezel
const FACE_Y = 3.9;
sc = sc
  .add(primitives.cylinder({ name: "bezel", size: [1.32, 0.05, 1.32], material: brass }).position(0, FACE_Y, 0.41).rotate(HALF_PI, 0, 0))
  .add(primitives.cylinder({ name: "face", size: [1.2, 0.05, 1.2], material: faceMat }).position(0, FACE_Y, 0.43).rotate(HALF_PI, 0, 0));

// 12 hour marks
for (let i = 0; i < 12; i += 1) {
  const a = (i / 12) * Math.PI * 2;
  const major = i % 3 === 0;
  const r = major ? 0.48 : 0.5;
  const len = major ? 0.14 : 0.09;
  const w = major ? 0.05 : 0.03;
  sc = sc.add(
    primitives.box({ name: `mark${i}`, size: [w, len, 0.02], material: ink })
      .position(Math.sin(a) * r, FACE_Y + Math.cos(a) * r, 0.465)
      .rotate(0, 0, -a)
  );
}

// hands: groups pivot on the face centre
const hand = (id: string, length: number, width: number, z: number, mat: typeof ink, tail: number): ReturnType<typeof group> =>
  group(
    id,
    [
      primitives.box({ name: `${id}-blade`, size: [width, length + tail, 0.015], material: mat }).position(0, (length - tail) / 2, 0)
    ],
    { position: [0, FACE_Y, z] as V3 }
  ).runtime({ id, mutable: true });

sc = sc
  .add(hand("hour-hand", 0.3, 0.06, 0.475, ink, 0.05))
  .add(hand("minute-hand", 0.45, 0.04, 0.49, ink, 0.07))
  .add(hand("second-hand", 0.5, 0.015, 0.505, redInk, 0.12))
  .add(primitives.cylinder({ name: "hand-cap", size: [0.09, 0.04, 0.09], material: brass }).position(0, FACE_Y, 0.52).rotate(HALF_PI, 0, 0));

// pendulum: pivot group swings, rod + bob below
const PIVOT_Y = 2.95;
const ROD = 1.8;
sc = sc
  .add(primitives.box({ name: "pivot-bracket", size: [0.12, 0.06, 0.06], material: iron }).position(0, PIVOT_Y + 0.03, 0.05))
  .add(
    group(
      "pendulum",
      [
        primitives.box({ name: "rod", size: [0.035, ROD, 0.02], material: brass }).position(0, -ROD / 2, 0),
        primitives.cylinder({ name: "bob", size: [0.56, 0.08, 0.56], material: brass }).position(0, -ROD, 0).rotate(HALF_PI, 0, 0),
        primitives.cylinder({ name: "bob-boss", size: [0.2, 0.12, 0.2], material: material.pbr({ color: "#f0cc6a", metallic: 0.9, roughness: 0.2 }) }).position(0, -ROD, 0).rotate(HALF_PI, 0, 0)
      ],
      { position: [0, PIVOT_Y, 0.05] as V3 }
    ).runtime({ id: "pendulum", mutable: true })
  );

// hanging weights (chain extends up behind the hood)
const WEIGHT_START: Record<string, number> = { "weight-l": 2.0, "weight-r": 1.7 };
const weight = (id: string, x: number): ReturnType<typeof group> =>
  group(
    id,
    [
      primitives.cylinder({ name: `${id}-body`, size: [0.2, 0.5, 0.2], material: iron }),
      primitives.cylinder({ name: `${id}-cap`, size: [0.08, 0.08, 0.08], material: brass }).position(0, 0.29, 0),
      primitives.box({ name: `${id}-chain`, size: [0.02, 1.6, 0.02], material: brass }).position(0, 1.05, 0)
    ],
    { position: [x, WEIGHT_START[id] ?? 2, -0.15] as V3 }
  ).runtime({ id, mutable: true });

sc = sc.add(weight("weight-l", -0.5)).add(weight("weight-r", 0.5));

const app = createAuraApp("#app", { scene: sc });

const AMPLITUDE = 0.17; // radians
const SINK_SPEED = 0.01; // world units per second
const start = performance.now();

app.onFrame(() => {
  const now = new Date();
  const ms = now.getMilliseconds();
  const sec = now.getSeconds();
  const min = now.getMinutes();
  const hr = now.getHours() % 12;

  // period 2 s, sinusoidal: slowest at the extremes, crosses centre on the second
  const epoch = now.getTime() / 1000;
  app.nodes.require("pendulum").setRotation(0, 0, AMPLITUDE * Math.sin(Math.PI * epoch));

  // one discrete tick per second, no sweep
  void ms;
  app.nodes.require("second-hand").setRotation(0, 0, -(sec * 6 * Math.PI) / 180);
  app.nodes.require("minute-hand").setRotation(0, 0, -(((min + sec / 60) * 6) * Math.PI) / 180);
  app.nodes.require("hour-hand").setRotation(0, 0, -((((hr + min / 60) * 30)) * Math.PI) / 180);

  const sink = Math.min(0.9, ((performance.now() - start) / 1000) * SINK_SPEED);
  app.nodes.require("weight-l").setPosition(-0.5, (WEIGHT_START["weight-l"] ?? 2) - sink, -0.15);
  app.nodes.require("weight-r").setPosition(0.5, (WEIGHT_START["weight-r"] ?? 1.7) - sink, -0.15);
});

await app.ready();
window.__EVAL_READY__ = true;
