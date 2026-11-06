import { camera, createAuraApp, environments, interactions, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const sc = scene({ background: "#2b2b2b" })
  .camera(camera.orbit({ position: [3.2, 2.2, 4.2], target: [0, 0, 0], fov: 40, near: 0.1, far: 100 }))
  .add(environments.neutral({ intensity: 0.8, background: false }))
  .add(lights.hemisphere({ skyColor: "#c8d4ff", groundColor: "#3a3a3a", intensity: 0.5 }))
  .add(lights.directional({ position: [4, 6, 5], target: [0, 0, 0], intensity: 3.2 }))
  .add(lights.directional({ position: [-5, 2, -3], target: [0, 0, 0], intensity: 1.2, color: "#9bb7ff" }))
  .add(
    primitives
      .box({
        name: "cube",
        size: [1.4, 1.4, 1.4],
        material: material.pbr({ color: "#c98a4b", metallic: 0.9, roughness: 0.35 })
      })
      .runtime({ id: "cube", mutable: true })
  )
  .add(interactions.orbit({ target: "cube" }));

const app = createAuraApp("#app", { scene: sc });

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  app.nodes.require("cube").setRotation(t * 0.4, t * 0.8, 0);
});

await app.ready();
window.__EVAL_READY__ = true;
