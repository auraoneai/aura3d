import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

const wood = material.pbr({ color: "#6b3d1e", roughness: 0.55 });
const darkWood = material.pbr({ color: "#4a2812", roughness: 0.6 });
const interior = material.pbr({ color: "#7a4a24", roughness: 0.9 });
const brass = material.pbr({ color: "#d9a93c", metallic: 0.8, roughness: 0.3 });
const cream = material.pbr({ color: "#f2e8cf", roughness: 0.8 });
const ink = material.pbr({ color: "#1c1510", roughness: 0.6 });
const red = material.pbr({ color: "#b3201a", roughness: 0.5 });
const iron = material.pbr({ color: "#3a3a3e", metallic: 0.7, roughness: 0.4 });
const glass = material.pbr({ color: "#d8ecff", roughness: 0.05, opacity: 0.12 });

const HEAD_Y = 4.1; // clock face centre
const PIVOT_Y = 3.2;
const ROD = 1.8;
const AMP = 0.3;

const box = (name: string, size: V3, pos: V3, mat = wood) => primitives.box({ name, size, material: mat }).position(...pos);
// cylinder whose axis points along z (towards the viewer)
const disc = (name: string, d: number, thick: number, pos: V3, mat = wood) =>
  primitives.cylinder({ name, size: [d, thick, d], material: mat }).position(...pos).rotate(Math.PI / 2, 0, 0);

const J = (id: string, position: V3, kids: Parameters<typeof group>[1]) =>
  group(id, kids, { position }).runtime({ id, mutable: true });

let sc = scene({ background: "#1a1008" })
  .camera(camera.perspective({ position: [0, 3.5, 9.8], target: [0, 2.7, 0], fov: 40, near: 0.5, far: 60 }))
  .add(environments.neutral({ intensity: 0.25, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffd9a8", groundColor: "#5a3318", intensity: 0.7 }))
  .add(lights.directional({ position: [-4, 8, 8], target: [0, 2, 0], intensity: 1.6, color: "#ffc98a", shadow: true }))
  .add(lights.point({ name: "inner-glow", position: [0, 2.4, 0.2], intensity: 6, color: "#ff9d3c" }))
  .add(lights.point({ name: "face-glow", position: [0, 4.6, 2.2], intensity: 5, color: "#ffc27a" }))
  // floor and wall
  .add(primitives.plane({ name: "floor", size: [30, 1, 20], material: material.pbr({ color: "#7d5430", roughness: 0.5 }) }).position(0, 0, 4))
  .add(primitives.plane({ name: "wall", size: [30, 1, 14], material: material.pbr({ color: "#b99468", roughness: 0.95 }) }).position(0, 7, -0.6).rotate(Math.PI / 2, 0, 0))
  .add(box("baseboard", [30, 0.4, 0.1], [0, 0.2, -0.55], darkWood))
  // case: plinth, sides, back, rails, head, cap
  .add(box("plinth", [2.3, 0.5, 1.1], [0, 0.25, 0], darkWood))
  .add(box("plinth-top", [2.15, 0.1, 1.0], [0, 0.55, 0], wood))
  .add(box("side-l", [0.2, 2.8, 0.9], [-0.9, 1.95, 0]))
  .add(box("side-r", [0.2, 2.8, 0.9], [0.9, 1.95, 0]))
  .add(box("back", [1.8, 2.8, 0.06], [0, 1.95, -0.42], interior))
  .add(box("rail-low", [1.8, 0.3, 0.08], [0, 0.75, 0.41]))
  .add(box("rail-high", [1.8, 0.1, 0.08], [0, 3.25, 0.41]))
  .add(box("head", [2.0, 1.6, 0.9], [0, HEAD_Y, 0]))
  .add(box("cap", [2.25, 0.18, 1.05], [0, 5.0, 0], darkWood))
  .add(box("cap-top", [1.9, 0.12, 0.85], [0, 5.14, 0], darkWood))
  .add(box("glass", [1.6, 2.4, 0.02], [0, 2.0, 0.44], glass).scale([1, 1, 1]))
  // clock face
  .add(disc("bezel", 1.6, 0.04, [0, HEAD_Y, 0.46], brass))
  .add(disc("face", 1.4, 0.04, [0, HEAD_Y, 0.48], cream));

for (let i = 0; i < 12; i += 1) {
  const a = (i * Math.PI) / 6;
  const major = i % 3 === 0;
  const r = major ? 0.55 : 0.58;
  const len = major ? 0.16 : 0.1;
  sc = sc.add(
    primitives
      .box({ name: `mark-${i}`, size: [major ? 0.05 : 0.03, len, 0.015], material: ink })
      .position(Math.sin(a) * r, HEAD_Y + Math.cos(a) * r, 0.51)
      .rotate(0, 0, -a)
  );
}

const hand = (id: string, z: number, w: number, len: number, tail: number, mat: typeof ink) =>
  J(id, [0, HEAD_Y, z], [
    primitives.box({ name: `${id}-blade`, size: [w, len + tail, 0.012], material: mat }).position(0, (len - tail) / 2, 0)
  ]);

sc = sc
  .add(hand("hour-hand", 0.52, 0.07, 0.34, 0.06, ink))
  .add(hand("minute-hand", 0.535, 0.045, 0.55, 0.08, ink))
  .add(hand("second-hand", 0.55, 0.014, 0.6, 0.12, red))
  .add(primitives.sphere({ name: "hub", size: 0.1, material: brass }).position(0, HEAD_Y, 0.57));

// pendulum behind glass
sc = sc.add(
  J("pendulum", [0, PIVOT_Y, 0.05], [
    primitives.sphere({ name: "pivot", size: 0.08, material: brass }),
    primitives.box({ name: "rod", size: [0.04, ROD, 0.02], material: brass }).position(0, -ROD / 2, 0),
    primitives.cylinder({ name: "bob", size: [0.46, 0.08, 0.46], material: brass }).position(0, -ROD, 0).rotate(Math.PI / 2, 0, 0),
    primitives.cylinder({ name: "bob-core", size: [0.2, 0.12, 0.2], material: material.pbr({ color: "#a8761c", metallic: 0.8, roughness: 0.35 }) })
      .position(0, -ROD, 0.02)
      .rotate(Math.PI / 2, 0, 0)
  ])
);

// hanging weights with chains running up into the head
const W_TOP = 2.7;
const weight = (id: string, x: number) =>
  J(id, [x, W_TOP, -0.22], [
    primitives.cylinder({ name: `${id}-body`, size: [0.3, 0.7, 0.3], material: iron }).position(0, -0.35, 0),
    primitives.cylinder({ name: `${id}-cap`, size: [0.12, 0.1, 0.12], material: brass }).position(0, 0.04, 0),
    primitives.box({ name: `${id}-chain`, size: [0.02, 1.9, 0.02], material: brass }).position(0, 1.0, 0)
  ]);
sc = sc.add(weight("weight-l", -0.58)).add(weight("weight-r", 0.58));

const app = createAuraApp("#app", { scene: sc });

const DEG = Math.PI / 180;
app.onFrame(() => {
  const now = new Date();
  const ms = now.getTime() / 1000;
  const s = now.getSeconds();
  const m = now.getMinutes();
  const h = now.getHours() % 12;

  // sinusoidal swing: period 2 s, slowest at the extremes
  const swing = AMP * Math.sin((ms * Math.PI * 2) / 2);
  app.nodes.require("pendulum").setRotation(0, 0, swing);

  // second hand ticks once per second
  app.nodes.require("second-hand").setRotation(0, 0, -s * 6 * DEG);
  app.nodes.require("minute-hand").setRotation(0, 0, -(m + s / 60) * 6 * DEG);
  app.nodes.require("hour-hand").setRotation(0, 0, -(h + m / 60 + s / 3600) * 30 * DEG);

  // weights sink slowly (0.01 units/s), wrapping back as if wound
  const drop = (ms * 0.01) % 0.9;
  app.nodes.require("weight-l").setPosition(-0.58, W_TOP - drop, -0.22);
  app.nodes.require("weight-r").setPosition(0.58, W_TOP - drop * 0.9, -0.22);
});

await app.ready();
window.__EVAL_READY__ = true;
