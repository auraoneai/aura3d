// Candy-red car-paint coupe on a turntable in a dark showroom.
// Geometry and base materials come from recipes/showroom.mjs (bridged); environment, lights, camera and motion are native.
import { camera, createAuraApp, effects, environments, lights, scene } from "@aura3d/engine";
import { showroomModel, showroomOutput } from "./three-bridge/showroom.bridge";

const SPEED_DEG_PER_SEC = 20;

type TaskState = { turntableAngleDeg: number; paintFinish: "clearcoat" };
const state: TaskState = { turntableAngleDeg: 0, paintFinish: "clearcoat" };
const w = window as unknown as { __TASK_STATE__?: TaskState; __EVAL_READY__?: boolean };
w.__TASK_STATE__ = state;

const stage = scene({ background: "#040508" })
  .add(environments.studio({ preset: "softbox", intensity: 1.15, background: false, rotation: 0.4 }))
  .add(showroomModel({
    materialOverrides: [
      { target: "floor", envMapIntensity: 0.04, clearcoat: 0, roughness: 0.12, opacity: 0.9 },
      { target: "paint", envMapIntensity: 1.2 }
    ]
  }).runtime({ id: "showroom", mutable: true }))
  // Long soft-box strips: overhead, and one each side.
  .add(lights.rect({ name: "strip top", position: [0, 6.5, 0.5], target: [0, 0.8, 0], width: 9, height: 0.7, intensity: 14, color: "#fff4e8" }))
  .add(lights.rect({ name: "strip left", position: [-6.5, 3.2, 1.5], target: [0, 0.8, 0], width: 8, height: 0.6, intensity: 10, color: "#ffffff" }))
  .add(lights.rect({ name: "strip right", position: [6.5, 3.4, -2.5], target: [0, 0.8, 0], width: 8, height: 0.6, intensity: 10, color: "#ffffff" }))
  // Faint cool rim from behind.
  .add(lights.directional({ name: "rim", position: [-3, 3, -7], intensity: 1.6, color: "#9fc4ff" }))
  .add(effects.bloom({ intensity: 0.25, threshold: 1.1, radius: 0.4 }))
  .camera(camera.perspective({ position: [4.9, 1.9, 6.9], target: [0, 0.7, 0], fov: 33 }));

const app = createAuraApp("#app", { scene: stage, output: showroomOutput });

let first = true;
app.onFrame((frame) => {
  state.turntableAngleDeg += frame.dt * SPEED_DEG_PER_SEC;
  app.nodes.require("showroom").setRotation(0, (state.turntableAngleDeg * Math.PI) / 180, 0);
  if (first) {
    first = false;
    requestAnimationFrame(() => { w.__EVAL_READY__ = true; });
  }
});

void app.ready().catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
