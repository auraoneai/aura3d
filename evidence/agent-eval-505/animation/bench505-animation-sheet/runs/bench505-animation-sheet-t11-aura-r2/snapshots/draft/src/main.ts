import { camera, createAuraApp, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

const wood = material.pbr({ color: "#7a4524", roughness: 0.55 });
const darkWood = material.pbr({ color: "#4a2713", roughness: 0.6 });
const interior = material.pbr({ color: "#5a3a20", roughness: 0.8 });
const brass = material.pbr({ color: "#d4a640", metallic: 0.85, roughness: 0.3 });
const faceMat = material.pbr({ color: "#f3e8c9", roughness: 0.8 });
const ink = material.pbr({ color: "#1c1612", roughness: 0.6 });
const red = material.pbr({ color: "#b01818", roughness: 0.5 });
const glassMat = material.pbr({ color: "#cfe6ff", roughness: 0.05, opacity: 0.1 });
const wallMat = material.pbr({ color: "#b49a78", roughness: 0.95 });
const floorMat = material.pbr({ color: "#6e4a2c", roughness: 0.5 });

const PIVOT_Y = 2.3;
const FACE_Y = 3.05;
const CHAIN_TOP = 2.2;
const WEIGHT_H = 0.45;

const marks = [];
for (let i = 0; i < 12; i += 1) {
  const a = (i / 12) * Math.PI * 2;
  const major = i % 3 === 0;
  const r = 0.34;
  marks.push(
    primitives
      .box({ name: `mark${i}`, size: [major ? 0.04 : 0.025, major ? 0.1 : 0.07, 0.01], material: ink })
      .position(Math.sin(a) * r, Math.cos(a) * r, 0.01)
      .rotate(0, 0, -a)
  );
}

const hand = (id: string, len: number, w: number, z: number, mat: typeof ink) =>
  group(
    id,
    [
      primitives.box({ name: `${id}-bar`, size: [w, len, 0.008], material: mat }).position(0, len / 2 - len * 0.1, z),
    ],
    { position: [0, FACE_Y, 0.25] as V3 }
  ).runtime({ id, mutable: true });

const chain = (id: string, x: number) =>
  primitives
    .box({ name: id, size: [0.012, 1, 0.012], material: brass })
    .position(x, 1.7, -0.1)
    .runtime({ id, mutable: true });

const weight = (id: string, x: number) =>
  primitives
    .cylinder({ name: id, size: [0.13, WEIGHT_H, 0.13], material: brass })
    .position(x, 1.8 - WEIGHT_H / 2, -0.1)
    .runtime({ id, mutable: true });

let sc = scene({ background: "#2a1c12" })
  .camera(camera.perspective({ position: [0, 2.4, 6.6], target: [0, 1.9, 0], fov: 45, near: 0.5, far: 60 }))
  .add(lights.hemisphere({ skyColor: "#ffd9a8", groundColor: "#5a3a20", intensity: 0.45 }))
  .add(lights.directional({ position: [3, 5, 5], target: [0, 1.8, 0], intensity: 1.6, color: "#ffc98a", shadow: true }))
  .add(lights.point({ position: [0, 1.6, 0.35], intensity: 4, color: "#ffb45e" }))
  .add(lights.point({ position: [0, 3.1, 1.6], intensity: 3, color: "#ffcf94" }))
  // wall and floor
  .add(primitives.plane({ name: "wall", size: [16, 1, 8], material: wallMat }).position(0, 3.5, -0.8).rotate(Math.PI / 2, 0, 0))
  .add(primitives.plane({ name: "floor", size: [16, 1, 10], material: floorMat }).position(0, 0, 4))
  // case
  .add(primitives.box({ name: "plinth", size: [1.6, 0.3, 0.7], material: darkWood }).position(0, 0.15, 0))
  .add(primitives.box({ name: "back", size: [1.4, 3.3, 0.05], material: interior }).position(0, 1.95, -0.225))
  .add(primitives.box({ name: "side-l", size: [0.1, 3.3, 0.5], material: wood }).position(-0.65, 1.95, 0))
  .add(primitives.box({ name: "side-r", size: [0.1, 3.3, 0.5], material: wood }).position(0.65, 1.95, 0))
  .add(primitives.box({ name: "top", size: [1.4, 0.05, 0.5], material: wood }).position(0, 3.575, 0))
  .add(primitives.box({ name: "cornice", size: [1.6, 0.12, 0.65], material: darkWood }).position(0, 3.66, 0.03))
  .add(primitives.box({ name: "inner-floor", size: [1.2, 0.05, 0.4], material: darkWood }).position(0, 0.325, 0))
  .add(primitives.box({ name: "front-bottom", size: [1.2, 0.4, 0.05], material: wood }).position(0, 0.5, 0.225))
  .add(primitives.box({ name: "front-rail", size: [1.2, 0.1, 0.05], material: darkWood }).position(0, 2.45, 0.225))
  .add(primitives.box({ name: "stile-l", size: [0.1, 1.7, 0.05], material: darkWood }).position(-0.55, 1.55, 0.225))
  .add(primitives.box({ name: "stile-r", size: [0.1, 1.7, 0.05], material: darkWood }).position(0.55, 1.55, 0.225))
  .add(primitives.box({ name: "front-hood", size: [1.2, 1.1, 0.05], material: wood }).position(0, FACE_Y, 0.225))
  // face
  .add(primitives.cylinder({ name: "bezel", size: [0.96, 0.012, 0.96], material: brass }).position(0, FACE_Y, 0.254).rotate(Math.PI / 2, 0, 0))
  .add(primitives.cylinder({ name: "face", size: [0.88, 0.012, 0.88], material: faceMat }).position(0, FACE_Y, 0.26).rotate(Math.PI / 2, 0, 0))
  .add(group("marks", marks, { position: [0, FACE_Y, 0.26] as V3 }))
  .add(hand("hour-hand", 0.2, 0.034, 0.02, ink))
  .add(hand("minute-hand", 0.31, 0.024, 0.03, ink))
  .add(hand("second-hand", 0.35, 0.01, 0.04, red))
  .add(primitives.sphere({ name: "hub", size: 0.05, material: brass }).position(0, FACE_Y, 0.31))
  // glass-like opening
  .add(primitives.box({ name: "glass", size: [1.0, 1.7, 0.01], material: glassMat, castShadow: false }).position(0, 1.55, 0.24))
  // pendulum
  .add(
    group(
      "pendulum",
      [
        primitives.box({ name: "rod", size: [0.02, 1.4, 0.015], material: brass }).position(0, -0.7, 0),
        primitives.cylinder({ name: "bob", size: [0.32, 0.05, 0.32], material: brass }).position(0, -1.4, 0).rotate(Math.PI / 2, 0, 0),
        primitives.sphere({ name: "bob-boss", size: 0.08, material: wood }).position(0, -1.4, 0.03),
      ],
      { position: [0, PIVOT_Y, 0.05] as V3 }
    ).runtime({ id: "pendulum", mutable: true })
  )
  .add(primitives.sphere({ name: "pivot", size: 0.05, material: brass }).position(0, PIVOT_Y, 0.05))
  // weights
  .add(chain("chain-l", -0.3))
  .add(chain("chain-r", 0.3))
  .add(weight("weight-l", -0.3))
  .add(weight("weight-r", 0.3));

const app = createAuraApp("#app", { scene: sc });

const startMs = performance.now();
const weightTravel = 0.9;

app.onFrame(() => {
  const nowMs = performance.now();
  const t = (nowMs - startMs) / 1000;

  // pendulum: period 2 s, sinusoidal (slowest at the extremes)
  const swing = 0.2 * Math.sin(Math.PI * t);
  app.nodes.require("pendulum").setRotation(0, 0, swing);

  // clock hands from real local time
  const d = new Date();
  const s = d.getSeconds();
  const m = d.getMinutes() + s / 60;
  const h = (d.getHours() % 12) + m / 60;
  app.nodes.require("second-hand").setRotation(0, 0, -(s / 60) * Math.PI * 2);
  app.nodes.require("minute-hand").setRotation(0, 0, -(m / 60) * Math.PI * 2);
  app.nodes.require("hour-hand").setRotation(0, 0, -(h / 12) * Math.PI * 2);

  // weights sinking very slowly
  const sink = (rate: number): number => Math.min(weightTravel, t * rate);
  const place = (wid: string, cid: string, x: number, drop: number) => {
    const top = 1.8 - drop;
    const len = CHAIN_TOP - top;
    app.nodes.require(wid).setPosition(x, top - WEIGHT_H / 2, -0.1);
    app.nodes.require(cid).setPosition(x, top + len / 2, -0.1).setScale([0.012, len, 0.012]);
  };
  place("weight-l", "chain-l", -0.3, sink(0.004));
  place("weight-r", "chain-r", 0.3, sink(0.003));
});

await app.ready();
window.__EVAL_READY__ = true;
