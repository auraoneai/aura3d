import { camera, createAuraApp, group, lights, looks, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const LOOK_ID = "interior-warm" as const;
const PI = Math.PI;

// Materials
const wood = material.pbr({ color: "#7a4a26", roughness: 0.55 });
const woodDark = material.pbr({ color: "#4e2d16", roughness: 0.6 });
const woodInner = material.pbr({ color: "#2a1a10", roughness: 0.9 });
const brass = material.pbr({ color: "#d4a63c", metallic: 0.9, roughness: 0.3 });
const faceMat = material.pbr({ color: "#f1e6c8", roughness: 0.8 });
const ink = material.pbr({ color: "#1c1712", roughness: 0.7 });
const redMat = material.pbr({ color: "#b3261e", roughness: 0.5 });
const glassMat = material.pbr({ color: "#cfe6ee", opacity: 0.06, alphaMode: "blend", roughness: 0.05, depthWrite: false });
const wallMat = material.pbr({ color: "#c9ab82", roughness: 0.95 });
const floorMat = material.pbr({ color: "#6b4a30", roughness: 0.6 });

const box = (name: string, size: [number, number, number], pos: [number, number, number], mat = wood) =>
  primitives.box({ name, size, material: mat, castShadow: true, receiveShadow: true }).position(pos[0], pos[1], pos[2]);

// Layout (clock faces +z, floor at y = 0)
const FACE_Y = 3.25;
const PIVOT_Y = 2.35;
const ROD_LEN = 1.5;
const CORD_TOP = 2.3;

// Hour marks
const marks = Array.from({ length: 12 }, (_, i) => {
  const a = (i * PI) / 6;
  const r = 0.4;
  const quarter = i % 3 === 0;
  return primitives
    .box({ name: `hour-mark-${i}`, size: [quarter ? 0.055 : 0.035, quarter ? 0.15 : 0.09, 0.02], material: ink })
    .position(Math.sin(a) * r, FACE_Y + Math.cos(a) * r, 0.335)
    .rotation(0, 0, -a);
});

const hand = (id: string, z: number, len: number, w: number, mat: typeof ink, tail = 0.08) =>
  group(
    id,
    [primitives.box({ name: `${id}-blade`, size: [w, len + tail, 0.014], material: mat }).position(0, (len - tail) / 2, 0)],
    { position: [0, FACE_Y, z] }
  ).runtime({ id, mutable: true });

const weight = (id: string, x: number) =>
  group(
    id,
    [
      primitives.cylinder({ name: `${id}-body`, size: [0.15, 0.45, 0.15], material: brass, castShadow: true }),
      primitives.sphere({ name: `${id}-hook`, size: 0.05, material: brass }).position(0, 0.24, 0)
    ],
    { position: [x, 1.75, -0.12] }
  ).runtime({ id, mutable: true });

const cord = (id: string, x: number) =>
  primitives.cylinder({ name: id, size: [0.012, 1, 0.012], material: ink }).position(x, 2.0, -0.12).runtime({ id, mutable: true });

const pendulum = group(
  "pendulum",
  [
    primitives.box({ name: "rod", size: [0.03, ROD_LEN, 0.012], material: brass }).position(0, -ROD_LEN / 2, 0),
    primitives.cylinder({ name: "bob", size: [0.46, 0.05, 0.46], material: brass, castShadow: true }).rotation(PI / 2, 0, 0).position(0, -ROD_LEN, 0),
    primitives.cylinder({ name: "bob-core", size: [0.26, 0.07, 0.26], material: wood }).rotation(PI / 2, 0, 0).position(0, -ROD_LEN, 0),
    primitives.sphere({ name: "pivot-ball", size: 0.07, material: brass })
  ],
  { position: [0, PIVOT_Y, 0.05] }
).runtime({ id: "pendulum", mutable: true });

const clock = group("clock", [
  // Plinth and feet
  box("plinth", [1.5, 0.4, 0.8], [0, 0.2, 0], woodDark),
  box("plinth-cap", [1.4, 0.06, 0.7], [0, 0.43, 0], wood),
  // Trunk: sides, back, rails
  box("trunk-left", [0.1, 2.1, 0.6], [-0.55, 1.5, 0]),
  box("trunk-right", [0.1, 2.1, 0.6], [0.55, 1.5, 0]),
  box("trunk-back", [1.2, 2.1, 0.04], [0, 1.5, -0.28], woodInner),
  box("trunk-rail-bottom", [1.0, 0.14, 0.06], [0, 0.53, 0.27], wood),
  box("trunk-rail-top", [1.0, 0.14, 0.06], [0, 2.47, 0.27], wood),
  primitives.box({ name: "glass", size: [1.0, 1.86, 0.01], material: glassMat }).position(0, 1.5, 0.3),
  // Hood
  box("hood", [1.3, 1.5, 0.64], [0, FACE_Y, 0]),
  box("hood-base", [1.42, 0.1, 0.72], [0, 2.55, 0], woodDark),
  box("hood-cap", [1.42, 0.12, 0.72], [0, 4.06, 0], woodDark),
  box("hood-crown", [1.1, 0.1, 0.55], [0, 4.17, 0], wood),
  primitives.sphere({ name: "finial", size: 0.14, material: brass }).position(0, 4.3, 0),
  // Dial
  primitives.cylinder({ name: "bezel", size: [1.14, 0.03, 1.14], material: brass }).rotation(PI / 2, 0, 0).position(0, FACE_Y, 0.325),
  primitives.cylinder({ name: "face", size: [1.04, 0.03, 1.04], material: faceMat }).rotation(PI / 2, 0, 0).position(0, FACE_Y, 0.335),
  ...marks,
  hand("hour-hand", 0.35, 0.27, 0.05, ink),
  hand("minute-hand", 0.365, 0.4, 0.035, ink),
  hand("second-hand", 0.38, 0.42, 0.014, redMat, 0.1),
  primitives.sphere({ name: "hub", size: 0.07, material: brass }).position(0, FACE_Y, 0.39),
  // Movement
  pendulum,
  cord("cord-left", -0.4),
  cord("cord-right", 0.4),
  weight("weight-left", -0.4),
  weight("weight-right", 0.4),
  primitives.cylinder({ name: "pulley-left", size: [0.08, 0.04, 0.08], material: brass }).rotation(PI / 2, 0, 0).position(-0.4, CORD_TOP, -0.12),
  primitives.cylinder({ name: "pulley-right", size: [0.08, 0.04, 0.08], material: brass }).rotation(PI / 2, 0, 0).position(0.4, CORD_TOP, -0.12)
]);

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID, { exposureEv: -0.3 }))
    .add(primitives.plane({ name: "floor", size: [16, 1, 16], material: floorMat, receiveShadow: true }))
    .add(primitives.box({ name: "wall", size: [16, 9, 0.2], material: wallMat, receiveShadow: true }).position(0, 4.5, -0.55))
    .add(primitives.box({ name: "baseboard", size: [16, 0.35, 0.06], material: woodDark, receiveShadow: true }).position(0, 0.175, -0.42))
    .add(lights.point({ name: "case-lamp", position: [0, 1.9, 0.2], intensity: 2.5, distance: 3.5, color: "#ffb866" }))
    .add(lights.point({ name: "face-lamp", position: [0.5, 3.6, 1.6], intensity: 6, distance: 5, color: "#ffc47a" }))
    .add(clock)
    .camera(camera.perspective({ position: [0, 2.7, 6.6], target: [0, 2.15, 0], fov: 40 })),
  ...looks.appOptions(LOOK_ID)
});

const AMPLITUDE = 0.16; // radians
const WEIGHT_START = 1.75;
const WEIGHT_TRAVEL = 0.8;
const WEIGHT_SPEED = 0.012; // units per second

const update = (): void => {
  const now = new Date();
  const ms = now.getTime();
  const sec = ms / 1000;

  // Period 2 s, sinusoidal: slowest at the extremes.
  const theta = AMPLITUDE * Math.sin(PI * sec);
  app.nodes.require("pendulum").setRotation(0, 0, theta);

  // Hands (clockwise = negative rotation about z when viewed from +z)
  const seconds = now.getSeconds();
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  app.nodes.require("second-hand").setRotation(0, 0, -(seconds / 60) * 2 * PI);
  app.nodes.require("minute-hand").setRotation(0, 0, -(minutes / 60) * 2 * PI);
  app.nodes.require("hour-hand").setRotation(0, 0, -(hours / 12) * 2 * PI);

  // Weights sink slowly, then are "wound" back up.
  const drop = (sec * WEIGHT_SPEED) % WEIGHT_TRAVEL;
  const wy = WEIGHT_START - drop;
  const wy2 = WEIGHT_START - ((sec * WEIGHT_SPEED * 0.5 + 0.3) % WEIGHT_TRAVEL);
  const place = (weightId: string, cordId: string, x: number, y: number): void => {
    app.nodes.require(weightId).setPosition(x, y, -0.12);
    const top = y + 0.25;
    const len = CORD_TOP - top;
    app.nodes.require(cordId).setPosition(x, top + len / 2, -0.12).setScale([1, len, 1]);
  };
  place("weight-left", "cord-left", -0.4, wy);
  place("weight-right", "cord-right", 0.4, wy2);
};

let ready = false;
app.onFrame(() => {
  update();
  if (!ready) {
    ready = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
void app.ready();
