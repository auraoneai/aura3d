// N4 framing and shadows by default (benchmark 505 cause E, animation-2 clock).
// The 5.0.2 agent hand-placed `camera.perspective({ position: [0, 1.42, 3.8], fov: 40 })` and the case came out small
// with dead wall around it. Here nothing places the camera: `camera.auto({ subject: "clock" })` solves the pose from
// the clock's drawn bounds so the case fills 80% of the frame height; the floor, wall and rug stay in shot without
// setting the size. `lights.key` casts a shadow by default (with a depth bias that keeps the wall free of acne);
// primitives receive shadows by default, so the floor and wall show it.
import { camera, createAuraApp, environments, group, lights, material, measureFrameFill, primitives, scene } from "@aura3d/engine";

const wood = material.pbr({ color: "#6b3a1f", roughness: 0.55 });
const darkWood = material.pbr({ color: "#3f2111", roughness: 0.6 });
const brass = material.pbr({ color: "#c9a046", metallic: 1, roughness: 0.32 });
const face = material.pbr({ color: "#f3ead6", roughness: 0.7 });
const ink = material.pbr({ color: "#1b1712", roughness: 0.5 });
const glass = material.pbr({ color: "#bcd3e0", roughness: 0.08, opacity: 0.18 });

const FACE_Y = 1.78;
const marks = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const long = i % 3 === 0;
  return primitives.box({ name: `mark ${i}`, size: [long ? 0.025 : 0.016, long ? 0.07 : 0.045, 0.01], material: ink })
    .position(Math.sin(a) * 0.19, FACE_Y + Math.cos(a) * 0.19, 0.214).rotate(0, 0, -a);
});
// Hands pivot at the face centre: each is a group at the centre holding a bar offset up by half its length.
const hand = (id: string, length: number, width: number, z: number, mat = ink) =>
  group(id, [primitives.box({ name: `${id} bar`, size: [width, length, 0.008], material: mat }).position(0, length / 2 - 0.02, 0)], { position: [0, FACE_Y, z] })
    .runtime({ id, mutable: true });

const clock = group("clock", [
  primitives.box({ name: "plinth", size: [0.66, 0.16, 0.42], material: darkWood }).position(0, 0.08, 0),
  primitives.box({ name: "trunk", size: [0.52, 1.36, 0.34], material: wood }).position(0, 0.84, 0),
  primitives.box({ name: "trunk recess", size: [0.32, 1.0, 0.01], material: darkWood }).position(0, 0.84, 0.172),
  primitives.box({ name: "trunk window", size: [0.32, 1.0, 0.01], material: glass }).position(0, 0.84, 0.215),
  primitives.box({ name: "hood", size: [0.6, 0.56, 0.4], material: wood }).position(0, 1.8, 0),
  primitives.box({ name: "crown", size: [0.68, 0.08, 0.44], material: darkWood }).position(0, 2.12, 0),
  primitives.cylinder({ name: "face rim", size: [0.5, 0.02, 0.5], material: brass }).position(0, FACE_Y, 0.196).rotate(Math.PI / 2, 0, 0),
  primitives.cylinder({ name: "face", size: [0.46, 0.02, 0.46], material: face }).position(0, FACE_Y, 0.2).rotate(Math.PI / 2, 0, 0),
  ...marks,
  hand("hour", 0.12, 0.022, 0.218),
  hand("minute", 0.17, 0.014, 0.222),
  hand("second", 0.18, 0.006, 0.226, brass),
  // Pendulum: pivots below the face, rod and bob hang from it behind the trunk window.
  group("pendulum", [
    primitives.box({ name: "rod", size: [0.012, 0.72, 0.012], material: brass }).position(0, -0.36, 0),
    primitives.cylinder({ name: "bob", size: [0.16, 0.025, 0.16], material: brass }).position(0, -0.74, 0).rotate(Math.PI / 2, 0, 0)
  ], { position: [0, 1.32, 0.19] }).runtime({ id: "pendulum", mutable: true }),
  group("weight left", [primitives.cylinder({ name: "weight left body", size: [0.05, 0.2, 0.05], material: brass })], { position: [-0.1, 1.15, 0.19] }).runtime({ id: "weight left", mutable: true }),
  group("weight right", [primitives.cylinder({ name: "weight right body", size: [0.05, 0.2, 0.05], material: brass })], { position: [0.1, 1.15, 0.19] }).runtime({ id: "weight right", mutable: true })
], { position: [0, 0, -0.6] });

const app = createAuraApp("#app", {
  scene: scene({ background: "#2a1d14" })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.key({ position: [2.2, 3.6, 2.4], target: [0, 1, -0.6], color: "#ffd9a8" }))
    .add(primitives.plane({ name: "floor", size: [10, 1, 10], material: material.pbr({ color: "#7a5236", roughness: 0.8 }) }))
    .add(primitives.box({ name: "back wall", size: [10, 4, 0.1], material: material.pbr({ color: "#b89a78", roughness: 0.9 }) }).position(0, 2, -0.85))
    .add(primitives.box({ name: "rug", size: [1.6, 0.01, 1.0], material: material.pbr({ color: "#7d2a2a", roughness: 1 }) }).position(0, 0.005, -0.25))
    .add(clock)
    .camera(camera.auto({ subject: "clock", angle: "front", fill: 0.8 }))
});

const start = Date.now();
app.onFrame((f) => {
  // Pendulum: 2 s period, cosine easing slowest at the extremes.
  app.nodes.require("pendulum").setRotation(0, 0, 0.16 * Math.cos(f.time * Math.PI));
  const now = new Date(start + f.time * 1000);
  const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
  app.nodes.require("second").setRotation(0, 0, -(s / 60) * Math.PI * 2);
  app.nodes.require("minute").setRotation(0, 0, -(m / 60) * Math.PI * 2);
  app.nodes.require("hour").setRotation(0, 0, -(h / 12) * Math.PI * 2);
  const sink = Math.min(0.3, f.time * 0.002);
  app.nodes.require("weight left").setPosition(-0.1, 1.15 - sink, 0.19);
  app.nodes.require("weight right").setPosition(0.1, 1.15 - sink * 0.7, 0.19);
});

await app.ready();
// Evidence: the fill the mounted camera actually gives the clock, measured on the canvas aspect.
const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const cam = app.scene.camera;
const fill = measureFrameFill(camera.worldBounds(clock), { position: cam.position!, target: cam.target!, fov: cam.fov! }, canvas.clientWidth / canvas.clientHeight);
(window as unknown as { __AURA_AUTO_FRAME__?: unknown }).__AURA_AUTO_FRAME__ = { requestedFill: 0.8, fill, camera: cam };
