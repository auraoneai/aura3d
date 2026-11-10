// Native Aura3D source for the bridged "clock" asset (written once by `import_three`, edited by hand).
// The static case, dial, room and lights come from recipes/clock.mjs; the moving parts are native nodes
// so main.ts can drive them every frame.
import { createAuraApp, groups, material, primitives, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { clockBackground, clockCamera, clockLights, clockModel, clockOutput } from "./clock.bridge";

export const DIAL_Z = 0.365;
export const DIAL_Y = 2.95;
export const PENDULUM_PIVOT_Y = 2.2;
export const WEIGHT_START_Y = 1.5;

const inkMat = material.pbr({ color: "#1b1410", roughness: 0.6 });
const redMat = material.pbr({ color: "#a3201a", roughness: 0.5 });
const brassMat = material.pbr({ color: "#c9a24a", roughness: 0.3, metallic: 0.8 });
const darkBrassMat = material.pbr({ color: "#8e6d25", roughness: 0.3, metallic: 0.8 });
const chainMat = material.pbr({ color: "#6a6a6a", roughness: 0.4, metallic: 0.8 });

const hand = (name: string, z: number, parts: Array<[number, number, number, number, typeof inkMat]>) =>
  groups.create(
    name,
    parts.map(([w, len, d, cy, mat], i) =>
      primitives.box({ name: `${name}-part-${i}`, size: [w, len, d], material: mat }).position(0, cy, 0)
    ),
    { position: [0, DIAL_Y, z] }
  ).runtime({ id: name, mutable: true });

const weight = (id: string, x: number) =>
  groups.create(
    id,
    [
      primitives.cylinder({ name: `${id}-chain`, size: [0.02, 1.3, 0.02], material: chainMat }).position(0, 0.85, 0),
      primitives.cylinder({ name: `${id}-body`, size: [0.18, 0.36, 0.18], params: { radialSegments: 24 }, material: brassMat }).position(0, 0, 0),
      primitives.cylinder({ name: `${id}-cap`, size: [0.2, 0.03, 0.2], params: { radialSegments: 24 }, material: darkBrassMat }).position(0, 0.195, 0)
    ],
    { position: [x, WEIGHT_START_Y, 0.05] }
  ).runtime({ id, mutable: true });

export function createClockScene(): AuraSceneBuilder {
  const stage = scene(clockBackground ? { background: clockBackground } : {})
    .add(clockModel())
    .addMany(clockLights())
    .add(hand("hour-hand", DIAL_Z + 0.02, [[0.05, 0.24, 0.012, 0.1, inkMat], [0.05, 0.05, 0.012, -0.04, inkMat]]))
    .add(hand("minute-hand", DIAL_Z + 0.035, [[0.03, 0.36, 0.012, 0.15, inkMat], [0.03, 0.08, 0.012, -0.06, inkMat]]))
    .add(hand("second-hand", DIAL_Z + 0.05, [[0.012, 0.4, 0.008, 0.14, redMat], [0.012, 0.1, 0.008, -0.08, redMat]]))
    .add(primitives.cylinder({ name: "hub", size: [0.06, 0.02, 0.06], material: brassMat }).position(0, DIAL_Y, DIAL_Z + 0.065).rotation(Math.PI / 2, 0, 0))
    .add(
      groups.create(
        "pendulum",
        [
          primitives.box({ name: "pendulum-rod", size: [0.02, 1.35, 0.01], material: brassMat }).position(0, -0.675, 0),
          primitives.sphere({ name: "pendulum-bob", size: [0.34, 0.34, 0.05], material: brassMat }).position(0, -1.35, 0),
          primitives.sphere({ name: "pendulum-pivot", size: 0.06, material: brassMat })
        ],
        { position: [0, PENDULUM_PIVOT_Y, 0] }
      ).runtime({ id: "pendulum", mutable: true })
    )
    .add(weight("weight-l", -0.4))
    .add(weight("weight-r", 0.4));
  return clockCamera ? stage.camera(clockCamera) : stage;
}

export function mountClock(selector = "#app") {
  return createAuraApp(selector, { scene: createClockScene(), output: clockOutput });
}
