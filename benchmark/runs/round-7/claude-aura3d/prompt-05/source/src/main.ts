import {
  camera,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene
} from "@aura3d/engine";

// Prompt 05: 3D Data Visualization
// A 6x6 grid (36) of bars with animated random heights, color-by-height,
// hover-highlight, an orbit camera, and axis labels. Built procedurally with
// the dedicated `prefabs.dataBars3D` helper per the Aura3D data-viz recipe.
createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(prefabs.dataBars3D({ grid: 6 }))
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.4, target: [0, 0.9, 0] }))
});
