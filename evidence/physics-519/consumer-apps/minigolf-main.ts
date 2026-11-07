import { camera, createAuraApp, lights, prefabs, scene } from "@aura3d/engine";
const app = createAuraApp("#app", { scene: scene({ background: "#101418" })
  .add(lights.directional({ position: [4, 6, 3], target: [0, 0, 0], intensity: 3 }))
  .add(...prefabs.miniGolfHole())
  .camera(camera.perspective({ position: [0, 4.5, 4.5], target: [0, 0, -0.4], fov: 45 })) });
await app.ready();
