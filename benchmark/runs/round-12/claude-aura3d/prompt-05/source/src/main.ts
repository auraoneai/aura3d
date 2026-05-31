import {
  camera,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene
} from "@aura3d/engine";

// Prompt 05 — 3D Data Visualization.
// prefabs.dataBars3D({ grid: 6 }) supplies the 6x6 (36) bar grid with
// random animated heights, color-by-height shading, axis rails + readable
// label chips, base shadows, a selected-metric callout, and hover-highlight
// metadata. One Aura app is created once (no per-frame dispose/recreate).
createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(prefabs.dataBars3D({ grid: 6 }))
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.4, target: [0, 0.9, 0] }))
});
