import { camera, createAuraApp, environments, interactions, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const app = createAuraApp("#app", {
  scene: scene({ background: "#2b2b2e" })
    .add(environments.neutral({ intensity: 1, background: false }))
    .add(lights.directional({ name: "key", position: [4, 5, 4], target: [0, 0, 0], intensity: 3, shadow: true }))
    .add(lights.directional({ name: "fill", position: [-5, 2, 3], target: [0, 0, 0], intensity: 1.2, color: "#9db8ff" }))
    .add(
      primitives
        .box({ name: "cube", material: material.pbr({ color: "#c8ccd4", metallic: 0.9, roughness: 0.38 }) })
        .runtime({ id: "cube", mutable: true })
    )
    .add(interactions.orbit({ target: "cube" }))
    .camera(camera.orbit({ position: [2.8, 1.9, 3.4], target: [0, 0, 0], fov: 40 }))
});

let angle = 0;
let frames = 0;
app.onFrame((frame) => {
  angle += frame.dt * 0.8;
  app.nodes.require("cube").setRotation(angle * 0.45, angle, 0);
  frames += 1;
  if (frames === 2) window.__EVAL_READY__ = true;
});

await app.ready();
