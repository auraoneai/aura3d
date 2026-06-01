import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  interactions,
  lights,
  material,
  prefabs,
  scene,
  shadows
} from "@aura3d/engine";

const materialLabScene = scene()
  .background("#10151f")
  .addMany(prefabs.materialSwatches())
  .add(shadows.contact({ footprint: [5.6, 1.2], opacity: 0.22 }))
  .add(lights.studio({ intensity: 1.55 }))
  .add(interactions.orbit())
  .camera(camera.materials());

console.log(material.labParameters().map((entry) => entry.name));
console.log(collectAuraSceneEvidence(materialLabScene));

createAuraApp("#app", {
  scene: materialLabScene
});
