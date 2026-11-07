import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const PERIOD = 2; // seconds per full gait cycle
const BODY_Y = 0.85;
const FEMUR = 1.1;
const TIBIA = 1.7;
const ELEV = 0.7; // femur rest elevation (rad)
const DROP = 1.1; // tibia rest downward angle (rad)
const SWING = 0.3; // fore/aft swing amplitude (rad)
const LIFT = 0.55; // lift amplitude (rad)

const skin = material.pbr({ color: "#4b3329", roughness: 0.55, metallic: 0.05 });
const legMat = material.pbr({ color: "#6a4535", roughness: 0.5, metallic: 0.05 });
const jointMat = material.pbr({ color: "#2d1e18", roughness: 0.4, metallic: 0.1 });
const eyeMat = material.pbr({ color: "#e8f2ff", roughness: 0.15 });
const markMat = material.pbr({ color: "#c0392b", roughness: 0.5 });

type Kids = Parameters<typeof group>[1];
const J = (id: string, position: [number, number, number], kids: Kids) =>
  group(id, kids, { position }).runtime({ id, mutable: true });

const seg = (name: string, len: number, r: number) =>
  primitives
    .capsule({ name, size: [r * 2, len, r * 2], material: legMat })
    .position(len / 2, 0, 0)
    .rotate(0, 0, -Math.PI / 2);

const angles = [1.05, 0.4, -0.3, -0.95]; // leg direction from the sideways axis, positive = forward
const zOff = [0.28, 0.1, -0.1, -0.28];

interface Leg {
  id: string;
  side: number;
  base: number;
  group: number; // 0 or 1: diagonal group
}
const legs: Leg[] = [];
const legNodes: ReturnType<typeof J>[] = [];
for (let s = 0; s < 2; s += 1) {
  for (let j = 0; j < 4; j += 1) {
    const side = s === 0 ? 1 : -1;
    const id = `leg-${s}-${j}`;
    // diagonal pairs: (right,0)(left,1)(right,2)(left,3) vs the others
    const grp = (s + j) % 2;
    legs.push({ id, side, base: angles[j]!, group: grp });
    legNodes.push(
      J(`${id}-yaw`, [side * 0.42, -0.05, 0.5 + zOff[j]!], [
        J(`${id}-lift`, [0, 0, 0], [
          primitives.sphere({ name: `${id}-hip`, size: 0.2, material: jointMat }),
          seg(`${id}-femur`, FEMUR, 0.07),
          J(`${id}-knee`, [FEMUR, 0, 0], [
            primitives.sphere({ name: `${id}-kneeball`, size: 0.17, material: jointMat }),
            seg(`${id}-tibia`, TIBIA, 0.055)
          ])
        ])
      ])
    );
  }
}

const eyes = [-0.13, 0.13].flatMap((x, i) => [
  primitives.sphere({ name: `eye-a${i}`, size: 0.17, material: eyeMat }).position(x, 0.2, 1.0),
  primitives.sphere({ name: `eye-b${i}`, size: 0.09, material: eyeMat }).position(x * 2.1, 0.12, 0.93)
]);

const spider = J("body", [0, BODY_Y, 0], [
  primitives.sphere({ name: "thorax", size: [1.0, 0.7, 1.1], material: skin }).position(0, 0, 0.5),
  primitives.sphere({ name: "head", size: [0.6, 0.45, 0.5], material: skin }).position(0, 0.04, 0.98),
  primitives.sphere({ name: "abdomen", size: [1.5, 1.2, 1.8], material: skin }).position(0, 0.15, -0.75),
  primitives.sphere({ name: "mark", size: [0.45, 0.2, 0.6], material: markMat }).position(0, 0.7, -0.75),
  primitives.cone({ name: "fang-l", size: [0.1, 0.25, 0.1], material: jointMat }).position(-0.12, -0.18, 1.15).rotate(Math.PI, 0, 0),
  primitives.cone({ name: "fang-r", size: [0.1, 0.25, 0.1], material: jointMat }).position(0.12, -0.18, 1.15).rotate(Math.PI, 0, 0),
  ...eyes,
  ...legNodes
]);

const sc = scene({ background: "#d5d8dd" })
  .camera(camera.perspective({ position: [6.2, 4.6, 7.2], target: [0, 0.75, 0.2], fov: 38, near: 0.5, far: 80 }))
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#f2f5fa", groundColor: "#a8a8ad", intensity: 0.9 }))
  .add(lights.directional({ position: [4, 9, 5], target: [0, 0, 0], intensity: 2.8, shadow: true }))
  .add(lights.directional({ position: [-6, 4, -3], target: [0, 0, 0], intensity: 0.7, color: "#dfe8ff" }))
  .add(primitives.plane({ name: "ground", size: [40, 1, 40], material: material.pbr({ color: "#eceaea", roughness: 1 }) }))
  .add(spider);

const app = createAuraApp("#app", { scene: sc });

const smooth = (x: number): number => x * x * (3 - 2 * x);
let t = 0;

app.onFrame((f) => {
  t += f.dt;
  const cyc = (t / PERIOD) % 1;
  const n = (id: string) => app.nodes.require(id);

  // two steps per cycle: bob once per step, lowest at mid-stance changeover
  const bob = Math.sin(cyc * Math.PI * 4);
  n("body").setPosition(0, BODY_Y + 0.05 * bob, 0);
  n("body").setRotation(0.015 * bob, 0.02 * Math.sin(cyc * Math.PI * 2), 0.02 * Math.sin(cyc * Math.PI * 2));

  for (const leg of legs) {
    const u = (cyc + leg.group * 0.5) % 1;
    let sw: number;
    let lift = 0;
    if (u < 0.5) {
      const s = u / 0.5; // swing phase: foot in the air, moves forward
      sw = -SWING + 2 * SWING * smooth(s);
      lift = Math.sin(Math.PI * s);
    } else {
      const s = (u - 0.5) / 0.5; // stance phase: foot planted, body moves over it
      sw = SWING - 2 * SWING * s;
    }
    const a = leg.base + sw;
    const dir = leg.side > 0 ? a : Math.PI - a; // angle of leg in XZ plane, measured from +X toward +Z
    n(`${leg.id}-yaw`).setRotation(0, -dir, 0);
    const lam = LIFT * lift;
    n(`${leg.id}-lift`).setRotation(0, 0, ELEV + lam);
    n(`${leg.id}-knee`).setRotation(0, 0, -(ELEV + DROP) - 0.7 * lam);
  }
});

await app.ready();
window.__EVAL_READY__ = true;
