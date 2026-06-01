import {
  camera,
  createAuraApp,
  interactions,
  lights,
  material,
  prefabs,
  scene,
  shadows
} from "@aura3d/engine";

// Prompt 07 — Material Lab (Recipe 07, hard-prompt gate).
// prefabs.materialSwatches() emits five distinct spheres: mirror metal,
// transparent glass, matte rubber, glowing emissive, and layered glossy
// clearcoat. Studio lighting + contact shadow + the prefab's environment
// give highlights, soft shadows, and reflections. Orbit controls enabled.
createAuraApp("#app", {
  scene: scene()
    .background("#10151f")
    .addMany(prefabs.materialSwatches())
    .add(shadows.contact({ footprint: [5.6, 1.2], opacity: 0.22 }))
    .add(lights.studio({ intensity: 1.55 }))
    .add(interactions.orbit())
    .camera(camera.materials())
});

console.log(material.labParameters().map((entry) => entry.name));
