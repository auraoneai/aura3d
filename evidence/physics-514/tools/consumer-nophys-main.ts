import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";
const app = createAuraApp("#app", { scene: scene({ background: "#101418" })
  .add(lights.directional({ position: [4, 6, 3], target: [0, 0, 0], intensity: 3 }))
  .add(primitives.box({ name: "crate", material: material.pbr({ color: "#c8ccd4" }) }))
  .camera(camera.perspective({ position: [3, 2, 5], target: [0, 0.5, 0], fov: 45 })) });
await app.ready();
