import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";
import type { SceneHandle } from "../../shared/glue";

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const app = createAuraApp(canvas, { autoStart: false, scene: scene()
    .camera(camera.perspective({ fov: 50, position: [2, 2, 4], target: [0, 0.5, 0] }))
    .add(lights.ambient({ intensity: 1 }))
    .add(primitives.box({ material: material.pbr({ color: "#d86a3a" }) }).runtime({ id: "cube" })) });
  await app.ready();
  const cube = app.nodes.require("cube");
  let yaw = 0;
  return { frame(dt) { yaw += dt; cube.setRotation(0, yaw, 0); app.step(dt); } };
}
