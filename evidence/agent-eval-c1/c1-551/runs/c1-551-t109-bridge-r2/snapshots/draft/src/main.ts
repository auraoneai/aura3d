import { camera, createAuraApp, environments, lights, scene } from "@aura3d/engine";
import { carpaintLights, carpaintModel, carpaintOutput } from "./three-bridge/carpaint.bridge";

const SPEED_DEG_PER_SEC = 20;

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

const stage = scene({ background: "#05060a" })
  .add(environments.studio({ preset: "softbox", intensity: 1.0, background: false }))
  // Long soft-box strips: two overhead, one low on each side.
  .add(lights.rect({ name: "strip top left", position: [-2.2, 4.2, 1.2], target: [0, 0.6, 0], width: 0.7, height: 7, intensity: 12, color: "#fff4ea" }))
  .add(lights.rect({ name: "strip top right", position: [2.4, 4.2, -1.0], target: [0, 0.6, 0], width: 0.7, height: 7, intensity: 12, color: "#ffffff" }))
  .add(lights.rect({ name: "strip side", position: [-5.5, 2.2, -1.5], target: [0, 0.6, 0], width: 0.5, height: 5, intensity: 10, color: "#f3f6ff" }))
  // Faint cool rim from behind.
  .add(lights.directional({ name: "rim", position: [-1, 3, -6], target: [0, 0.8, 0], intensity: 1.4, color: "#9fc4ff" }))
  .add(carpaintModel().runtime({ id: "turntable", mutable: true }))
  .addMany(carpaintLights())
  .camera(camera.perspective({ position: [5.6, 1.7, 6.0], target: [0, 0.55, 0], fov: 30, near: 0.1, far: 100 }));

const app = createAuraApp("#app", { scene: stage, output: carpaintOutput });

let angleDeg = 0;
let first = true;
app.onFrame((frame) => {
  angleDeg += frame.dt * SPEED_DEG_PER_SEC;
  app.nodes.require("turntable").setRotation(0, (angleDeg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
