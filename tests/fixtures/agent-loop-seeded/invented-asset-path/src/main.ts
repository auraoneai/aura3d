import { camera, createAuraApp, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

// The robot entry in src/aura-assets.ts was written by hand; no such file exists under public/.
async function main(): Promise<void> {
  const app = createAuraApp("#app", {
  scene: scene({ background: "#1b2230" })
    .add(lights.directional({ position: [4, 6, 3], intensity: 2.5 }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#7b8494", roughness: 0.8 }), receiveShadow: true }))
    .add(model(assets.robot, { name: "robot" }))
    .camera(camera.orbit({ target: [0, 1, 0], distance: 6, fov: 40 }))
});
  await app.ready();
}
void main();
