import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

// Grandfather clock built from boxes, cylinders and spheres only. The clock faces +z; the camera looks down -z.
const wood = material.pbr({ color: "#6b3a1c", roughness: 0.55 });
const darkWood = material.pbr({ color: "#4a2610", roughness: 0.6 });
const interior = material.pbr({ color: "#24120a", roughness: 0.9 });
const brass = material.pbr({ color: "#d4a63a", metallic: 0.8, roughness: 0.3 });
const faceMat = material.pbr({ color: "#f3e8cc", roughness: 0.8 });
const ink = material.pbr({ color: "#1a1410", roughness: 0.6 });
const red = material.pbr({ color: "#b3201a", roughness: 0.5 });
const glass = material.pbr({ color: "#cfe6ee", roughness: 0.05, opacity: 0.14, transparent: true });
const wallMat = material.pbr({ color: "#a98a62", roughness: 0.95 });
const floorMat = material.pbr({ color: "#5a3a22", roughness: 0.7 });

const FACE_Y = 2.0;
const PIVOT_Y = 1.42;
const TAU = Math.PI * 2;

// Clock case
const caseParts = [
  primitives.box({ name: "plinth", size: [0.95, 0.2, 0.62], material: darkWood }).position(0, 0.1, 0),
  primitives.box({ name: "plinth-top", size: [0.8, 0.05, 0.54], material: wood }).position(0, 0.225, 0),
  primitives.box({ name: "trunk-back", size: [0.7, 1.3, 0.04], material: interior }).position(0, 0.85, -0.23),
  primitives.box({ name: "trunk-left", size: [0.06, 1.3, 0.5], material: wood }).position(-0.32, 0.85, 0),
  primitives.box({ name: "trunk-right", size: [0.06, 1.3, 0.5], material: wood }).position(0.32, 0.85, 0),
  primitives.box({ name: "trunk-rail-low", size: [0.7, 0.15, 0.04], material: wood }).position(0, 0.275, 0.23),
  primitives.box({ name: "trunk-rail-high", size: [0.7, 0.1, 0.04], material: wood }).position(0, 1.45, 0.23),
  primitives.box({ name: "glass", size: [0.58, 1.05, 0.01], material: glass, castShadow: false }).position(0, 0.875, 0.245),
  primitives.box({ name: "collar", size: [0.86, 0.06, 0.58], material: darkWood }).position(0, 1.53, 0),
  primitives.box({ name: "hood", size: [0.9, 0.94, 0.55], material: wood }).position(0, 2.03, 0),
  primitives.box({ name: "cap", size: [1.0, 0.1, 0.64], material: darkWood }).position(0, 2.55, 0),
  primitives.box({ name: "cap-top", size: [0.8, 0.08, 0.5], material: wood }).position(0, 2.64, 0),
  primitives.sphere({ name: "finial", size: 0.1, material: brass }).position(0, 2.73, 0)
];

// Dial: bezel, face, hour marks
const dial = [
  primitives.cylinder({ name: "bezel", size: [0.82, 0.04, 0.82], material: brass }).rotate(Math.PI / 2, 0, 0).position(0, FACE_Y, 0.28),
  primitives.cylinder({ name: "face", size: [0.72, 0.03, 0.72], material: faceMat }).rotate(Math.PI / 2, 0, 0).position(0, FACE_Y, 0.29)
];
for (let i = 0; i < 12; i += 1) {
  const a = (i / 12) * TAU;
  const major = i % 3 === 0;
  const r = major ? 0.29 : 0.30;
  dial.push(
    primitives
      .box({ name: `mark-${i}`, size: major ? [0.035, 0.09, 0.01] : [0.02, 0.055, 0.01], material: ink })
      .rotate(0, 0, -a)
      .position(Math.sin(a) * r, FACE_Y + Math.cos(a) * r, 0.31)
  );
}

// Hands: each group pivots at the dial centre; children point up (+y) at angle 0.
const hand = (id: string, z: number, parts: ReturnType<typeof primitives.box>[]) =>
  group(id, parts, { position: [0, FACE_Y, z] }).runtime({ id, mutable: true });

const hands = [
  hand("hour-hand", 0.314, [
    primitives.box({ name: "hour-blade", size: [0.04, 0.18, 0.008], material: ink }).position(0, 0.09, 0),
    primitives.box({ name: "hour-tail", size: [0.03, 0.05, 0.008], material: ink }).position(0, -0.025, 0)
  ]),
  hand("minute-hand", 0.324, [
    primitives.box({ name: "minute-blade", size: [0.026, 0.27, 0.008], material: ink }).position(0, 0.135, 0),
    primitives.box({ name: "minute-tail", size: [0.02, 0.06, 0.008], material: ink }).position(0, -0.03, 0)
  ]),
  hand("second-hand", 0.334, [
    primitives.box({ name: "second-blade", size: [0.01, 0.31, 0.006], material: red }).position(0, 0.155, 0),
    primitives.box({ name: "second-tail", size: [0.016, 0.08, 0.006], material: red }).position(0, -0.04, 0)
  ])
];
const hub = primitives.sphere({ name: "hub", size: 0.05, material: brass }).position(0, FACE_Y, 0.338);

// Pendulum, pivoting at the top of the trunk
const pendulum = group(
  "pendulum",
  [
    primitives.box({ name: "rod", size: [0.016, 0.8, 0.012], material: brass }).position(0, -0.4, 0),
    primitives.cylinder({ name: "bob", size: [0.26, 0.04, 0.26], material: brass }).rotate(Math.PI / 2, 0, 0).position(0, -0.82, 0),
    primitives.cylinder({ name: "bob-boss", size: [0.12, 0.05, 0.12], material: material.pbr({ color: "#f0c860", metallic: 0.9, roughness: 0.2 }) }).rotate(Math.PI / 2, 0, 0).position(0, -0.82, 0.01)
  ],
  { position: [0, PIVOT_Y, 0.05] }
).runtime({ id: "pendulum", mutable: true });

// Hanging weights with chains, behind the pendulum plane
const weightX = [-0.19, 0.19];
const WEIGHT_TOP_START = 1.05;
const WEIGHT_RANGE = 0.5;
const SINK_RATE = 0.006; // scene units per second
const weightParts = weightX.flatMap((x, i) => [
  primitives.box({ name: `chain-${i}`, size: [0.008, 1, 0.008], material: brass }).position(x, 1.2, -0.12).runtime({ id: `chain-${i}`, mutable: true }),
  primitives.cylinder({ name: `weight-${i}`, size: [0.11, 0.24, 0.11], material: material.pbr({ color: "#8a8f96", metallic: 0.7, roughness: 0.4 }) }).position(x, 0.9, -0.12).runtime({ id: `weight-${i}`, mutable: true })
]);

// Room
const room = [
  primitives.box({ name: "wall", size: [9, 5, 0.1], material: wallMat }).position(0, 2.4, -0.6),
  primitives.box({ name: "floor", size: [9, 0.1, 6], material: floorMat }).position(0, -0.05, 1.8),
  primitives.box({ name: "skirting", size: [9, 0.16, 0.04], material: darkWood }).position(0, 0.08, -0.53)
];

const app = createAuraApp("#app", {
  scene: scene({ background: "#1d130c" })
    .add(environments.neutral({ intensity: 0.45, background: false }))
    .add(lights.hemisphere({ skyColor: "#ffe2b8", groundColor: "#5a3a22", intensity: 0.5 }))
    .add(lights.directional({ name: "key", position: [2.5, 4.5, 5], target: [0, 1.3, 0], intensity: 2.2, color: "#ffcf96", shadow: true }))
    .add(lights.point({ name: "lamp", position: [-2, 2.6, 2.2], intensity: 10, distance: 12, color: "#ffb068" }))
    .add(lights.point({ name: "case-glow", position: [0, 1.0, 0.15], intensity: 1.5, distance: 1.5, color: "#ffc27a" }))
    .addMany(room)
    .addMany(caseParts)
    .addMany(dial)
    .addMany(hands)
    .add(hub)
    .add(pendulum)
    .addMany(weightParts)
    .camera(camera.perspective({ position: [0, 1.75, 5.6], target: [0, 1.35, 0], fov: 42 }))
});

const SWING_AMPLITUDE = 0.2; // radians
const startMs = Date.now();

app.onFrame(() => {
  const nowMs = Date.now();
  const now = new Date(nowMs);

  // Period 2 s, sinusoidal: slowest at the extremes. Extremes fall on whole seconds, the same instant the second hand ticks.
  const swing = -SWING_AMPLITUDE * Math.cos(Math.PI * (nowMs / 1000));
  app.nodes.require("pendulum").setRotation(0, 0, swing);

  const seconds = now.getSeconds();
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  app.nodes.require("second-hand").setRotation(0, 0, -(seconds / 60) * TAU);
  app.nodes.require("minute-hand").setRotation(0, 0, -(minutes / 60) * TAU);
  app.nodes.require("hour-hand").setRotation(0, 0, -(hours / 12) * TAU);

  // Weights sink slowly, then are "wound" back up at the end of their travel.
  const sunk = (((nowMs - startMs) / 1000) * SINK_RATE) % WEIGHT_RANGE;
  const top = WEIGHT_TOP_START - sunk;
  for (let i = 0; i < weightX.length; i += 1) {
    const x = weightX[i] as number;
    const chainLength = PIVOT_Y - top;
    app.nodes.require(`chain-${i}`).setPosition(x, (PIVOT_Y + top) / 2, -0.12).setScale([1, chainLength, 1]);
    app.nodes.require(`weight-${i}`).setPosition(x, top - 0.12, -0.12);
  }
});

await app.ready();
requestAnimationFrame(() => {
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
});
