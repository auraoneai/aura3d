import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

// Grandfather clock built from boxes, cylinders and spheres. Units are metres, +z faces the camera.
const wood = material.pbr({ color: "#7a4322", roughness: 0.5, metallic: 0.02 });
const darkWood = material.pbr({ color: "#4e2711", roughness: 0.45, metallic: 0.02 });
const velvet = material.pbr({ color: "#6a1d17", roughness: 0.9 });
const brass = material.pbr({ color: "#d4a63c", roughness: 0.3, metallic: 0.85 });
const iron = material.pbr({ color: "#3a3835", roughness: 0.45, metallic: 0.6 });
const glass = material.pbr({ color: "#cfe6f2", roughness: 0.05, opacity: 0.12, transparent: true });
const faceMat = material.pbr({ color: "#f1e6c8", roughness: 0.7 });
const ink = material.pbr({ color: "#1a1410", roughness: 0.6 });
const red = material.pbr({ color: "#b3231b", roughness: 0.5 });
const wallMat = material.pbr({ color: "#8c6a52", roughness: 0.95 });
const floorMat = material.pbr({ color: "#5a3a24", roughness: 0.6 });

const HALF_PI = Math.PI / 2;
const FACE_Y = 1.9;
const FACE_FRONT = 0.26;
const PIVOT_Y = 1.38;

// Hour marks: 12 small ticks on a ring, larger at 12, 3, 6, 9.
const marks = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const major = i % 3 === 0;
  const r = major ? 0.265 : 0.275;
  return primitives
    .box({ name: `mark-${i}`, size: major ? [0.03, 0.08, 0.01] : [0.016, 0.05, 0.01], material: ink, castShadow: false })
    .position(Math.sin(a) * r, FACE_Y + Math.cos(a) * r, FACE_FRONT + 0.006)
    .rotate(0, 0, -a);
});

// A hand points up (+y) from its pivot at the face centre; rotating the group about z sweeps it clockwise for negative angles.
const hand = (id: string, z: number, length: number, tail: number, width: number, mat: typeof ink) =>
  group(id, [
    primitives
      .box({ name: `${id}-blade`, size: [width, length + tail, 0.006], material: mat, castShadow: false })
      .position(0, (length - tail) / 2, 0)
  ], { position: [0, FACE_Y, z] }).runtime({ id, mutable: true });

// Hanging weight: chain runs up into the hood, so it stays attached as the weight sinks.
const weight = (id: string, x: number) =>
  group(id, [
    primitives.cylinder({ name: `${id}-body`, size: [0.09, 0.28, 0.09], material: iron }),
    primitives.sphere({ name: `${id}-cap`, size: [0.09, 0.05, 0.09], material: brass }).position(0, 0.15, 0),
    primitives.cylinder({ name: `${id}-chain`, size: [0.008, 1.0, 0.008], material: brass, castShadow: false }).position(0, 0.64, 0)
  ], { position: [x, 1.01, -0.12] }).runtime({ id, mutable: true });

const pendulum = group("pendulum", [
  primitives.box({ name: "pendulum-rod", size: [0.014, 0.8, 0.008], material: brass }).position(0, -0.4, 0),
  primitives.sphere({ name: "pendulum-bob", size: [0.2, 0.2, 0.045], material: brass }).position(0, -0.82, 0),
  primitives.sphere({ name: "pendulum-bob-core", size: [0.07, 0.07, 0.06], material: darkWood }).position(0, -0.82, 0),
  primitives.sphere({ name: "pendulum-pin", size: 0.03, material: brass }).position(0, 0, 0)
], { position: [0, PIVOT_Y, 0.02] }).runtime({ id: "pendulum", mutable: true });

const clock = group("clock", [
  // base
  primitives.box({ name: "plinth", size: [0.92, 0.25, 0.6], material: darkWood }).position(0, 0.125, 0),
  primitives.box({ name: "plinth-trim", size: [0.8, 0.03, 0.54], material: wood }).position(0, 0.265, 0),
  // trunk: back, sides, bottom board, front frame, glass
  primitives.box({ name: "trunk-back", size: [0.7, 1.2, 0.03], material: velvet }).position(0, 0.85, -0.235),
  primitives.box({ name: "trunk-left", size: [0.07, 1.2, 0.5], material: wood }).position(-0.315, 0.85, 0),
  primitives.box({ name: "trunk-right", size: [0.07, 1.2, 0.5], material: wood }).position(0.315, 0.85, 0),
  primitives.box({ name: "trunk-floor", size: [0.7, 0.04, 0.5], material: darkWood }).position(0, 0.29, 0),
  primitives.box({ name: "frame-left", size: [0.09, 1.2, 0.03], material: darkWood }).position(-0.305, 0.85, 0.235),
  primitives.box({ name: "frame-right", size: [0.09, 1.2, 0.03], material: darkWood }).position(0.305, 0.85, 0.235),
  primitives.box({ name: "frame-bottom", size: [0.7, 0.1, 0.03], material: darkWood }).position(0, 0.3, 0.235),
  primitives.box({ name: "frame-top", size: [0.7, 0.06, 0.03], material: darkWood }).position(0, 1.42, 0.235),
  primitives.box({ name: "glass", size: [0.52, 1.04, 0.008], material: glass, castShadow: false, receiveShadow: false }).position(0, 0.87, 0.248),
  // hood
  primitives.box({ name: "hood", size: [0.88, 0.9, 0.5], material: wood }).position(0, 1.9, 0),
  primitives.box({ name: "hood-base-trim", size: [0.94, 0.04, 0.54], material: darkWood }).position(0, 1.45, 0),
  primitives.box({ name: "crown", size: [0.98, 0.07, 0.56], material: darkWood }).position(0, 2.385, 0),
  primitives.box({ name: "cap", size: [0.84, 0.08, 0.46], material: wood }).position(0, 2.46, 0),
  primitives.sphere({ name: "finial", size: 0.08, material: brass }).position(0, 2.54, 0),
  // face
  primitives.cylinder({ name: "bezel", size: [0.76, 0.012, 0.76], material: brass }).position(0, FACE_Y, 0.252).rotate(HALF_PI, 0, 0),
  primitives.cylinder({ name: "face", size: [0.68, 0.012, 0.68], material: faceMat }).position(0, FACE_Y, 0.256).rotate(HALF_PI, 0, 0),
  ...marks,
  hand("hour-hand", 0.27, 0.15, 0.03, 0.028, ink),
  hand("minute-hand", 0.277, 0.24, 0.04, 0.018, ink),
  hand("second-hand", 0.284, 0.27, 0.06, 0.007, red),
  primitives.sphere({ name: "hub", size: 0.04, material: brass }).position(0, FACE_Y, 0.29),
  // internals
  pendulum,
  weight("weight-left", -0.2),
  weight("weight-right", 0.2)
]);

const app = createAuraApp("#app", {
  scene: scene({ background: "#2a1c14" })
    .add(environments.neutral({ intensity: 0.45, background: false }))
    .add(lights.hemisphere({ skyColor: "#ffd9a8", groundColor: "#4a2e1c", intensity: 0.35 }))
    .add(lights.directional({ name: "key", position: [-2.5, 4, 4], target: [0, 1.2, 0], intensity: 1.6, color: "#ffc88a", shadow: true }))
    .add(lights.point({ name: "face-lamp", position: [0, 2.9, 1.6], intensity: 7, distance: 7, color: "#ffb870" }))
    .add(lights.point({ name: "interior-glow", position: [0, 1.0, 0.12], intensity: 4, distance: 2, color: "#ff9d4a" }))
    .add(primitives.box({ name: "floor", size: [9, 0.1, 7], material: floorMat }).position(0, -0.05, 2.5))
    .add(primitives.box({ name: "wall", size: [9, 5, 0.1], material: wallMat }).position(0, 2.5, -0.35))
    .add(primitives.box({ name: "baseboard", size: [9, 0.2, 0.06], material: darkWood }).position(0, 0.1, -0.27))
    .add(clock)
    .camera(camera.perspective({ position: [0, 1.65, 4.9], target: [0, 1.25, 0], fov: 40 }))
});

const PENDULUM_AMPLITUDE = 0.18; // radians
const PENDULUM_PERIOD = 2; // seconds per full left-right cycle
const SINK_RATE = 0.005; // metres per second
const SINK_CYCLE = 90; // seconds before the weights are wound back up
const t0 = performance.now();
let ready = false;

app.onFrame(() => {
  const t = (performance.now() - t0) / 1000;

  // Sinusoidal swing: angular velocity is zero at the extremes, so motion is slowest there.
  app.nodes.require("pendulum").setRotation(0, 0, PENDULUM_AMPLITUDE * Math.sin((2 * Math.PI * t) / PENDULUM_PERIOD));

  const now = new Date();
  const seconds = now.getSeconds(); // whole seconds only: one tick per second
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  app.nodes.require("second-hand").setRotation(0, 0, -(seconds / 60) * Math.PI * 2);
  app.nodes.require("minute-hand").setRotation(0, 0, -(minutes / 60) * Math.PI * 2);
  app.nodes.require("hour-hand").setRotation(0, 0, -(hours / 12) * Math.PI * 2);

  const sink = SINK_RATE * (t % SINK_CYCLE);
  app.nodes.require("weight-left").setPosition(-0.2, 1.01 - sink, -0.12);
  app.nodes.require("weight-right").setPosition(0.2, 1.01 - sink * 0.85, -0.12);

  if (!ready) {
    ready = true;
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
});

await app.ready();
