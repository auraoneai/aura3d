import {
  camera,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene
} from "@aura3d/engine";

// Prompt 07: Material Lab
// Five spheres with metal, glass, rubber, emissive, and clearcoat materials
// under controlled studio lighting with an environment map and orbit controls.
// prefabs.materialSwatches() supplies the five distinct material classes
// (mirror metal, transparent glass, matte rubber, glowing emissive, glossy
// clearcoat) plus reflection/contrast cues; lights.studio() drives the
// controlled studio lighting and environment reflections.
createAuraApp("#app", {
  scene: scene()
    .background("#10151f")
    .addMany(prefabs.materialSwatches())
    .add(lights.studio({ intensity: 1.55 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [0, 1.55, 8.35], target: [0, 0.82, -0.72], fov: 42 }))
});
