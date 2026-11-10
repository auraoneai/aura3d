// Native Aura3D source for the bridged "clock" asset (written once by `aura3d import-three`, edit freely).
// The bridged GLB holds the case, face, hour marks, glass, room and the looping pendulum clip.
// The hands and the two weights are native nodes beside it, driven per frame from src/main.ts.
import { createAuraApp, material, primitives, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { clockBackground, clockCamera, clockLights, clockModel, clockOutput } from "./clock.bridge";

export const FACE_CENTER = { x: 0, y: 2.45 } as const;
export const FACE_Z = 0.255;
export const WEIGHT_X = [-0.22, 0.22] as const;
export const WEIGHT_Z = -0.12;
export const WEIGHT_START_Y = 1.45;
export const WEIGHT_MIN_Y = 0.82;
export const CHAIN_LENGTH = 1.2;

export interface HandSpec {
  readonly id: string;
  readonly length: number;
  readonly tail: number;
  readonly width: number;
  readonly z: number;
  readonly color: string;
}
export const HANDS: readonly HandSpec[] = [
  { id: "hour-hand", length: 0.17, tail: 0.03, width: 0.036, z: FACE_Z + 0.02, color: "#1b1410" },
  { id: "minute-hand", length: 0.275, tail: 0.04, width: 0.024, z: FACE_Z + 0.027, color: "#1b1410" },
  { id: "second-hand", length: 0.3, tail: 0.07, width: 0.009, z: FACE_Z + 0.034, color: "#b01c1c" }
];

export function createClockScene(): AuraSceneBuilder {
  const stage = scene(clockBackground ? { background: clockBackground } : {})
    .add(clockModel().runtime({ id: "clock" }).animate({ clip: "pendulum_swing", loop: true }))
    .addMany(clockLights());

  for (const h of HANDS) {
    const total = h.length + h.tail;
    stage.add(
      primitives.box({ name: h.id, size: [h.width, total, 0.008], material: material.pbr({ color: h.color, roughness: 0.6 }) })
        .position(FACE_CENTER.x, FACE_CENTER.y + (h.length - h.tail) / 2, h.z)
        .runtime({ id: h.id, mutable: true })
    );
  }
  stage.add(
    primitives.cylinder({ name: "hub", size: [0.045, 0.02, 0.045], material: material.pbr({ color: "#d9a93a", roughness: 0.3, metallic: 0.9 }) })
      .position(FACE_CENTER.x, FACE_CENTER.y, FACE_Z + 0.045)
      .rotation(Math.PI / 2, 0, 0)
  );

  WEIGHT_X.forEach((x, i) => {
    stage.add(
      primitives.cylinder({ name: `weight-${i}`, size: [0.14, 0.4, 0.14], material: material.pbr({ color: "#2a2a2e", roughness: 0.4, metallic: 0.7 }) })
        .position(x, WEIGHT_START_Y, WEIGHT_Z).runtime({ id: `weight-${i}`, mutable: true })
    );
    stage.add(
      primitives.cylinder({ name: `weight-cap-${i}`, size: [0.145, 0.03, 0.145], material: material.pbr({ color: "#d9a93a", roughness: 0.3, metallic: 0.9 }) })
        .position(x, WEIGHT_START_Y + 0.2, WEIGHT_Z).runtime({ id: `weight-cap-${i}`, mutable: true })
    );
    stage.add(
      primitives.cylinder({ name: `chain-${i}`, size: [0.012, CHAIN_LENGTH, 0.012], material: material.pbr({ color: "#d9a93a", roughness: 0.3, metallic: 0.9 }) })
        .position(x, WEIGHT_START_Y + 0.2 + CHAIN_LENGTH / 2, WEIGHT_Z).runtime({ id: `chain-${i}`, mutable: true })
    );
  });

  return clockCamera ? stage.camera(clockCamera) : stage;
}

export function mountClock(selector = "#app") {
  return createAuraApp(selector, { scene: createClockScene(), output: clockOutput });
}
