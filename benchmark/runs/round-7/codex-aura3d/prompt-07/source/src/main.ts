import {
  camera,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene
} from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#10151f")
    .addMany(prefabs.materialSwatches())
    .add(lights.studio({ intensity: 1.3 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [0, 1.45, 7.8], target: [0, 0.72, -0.72], fov: 42 }))
});
