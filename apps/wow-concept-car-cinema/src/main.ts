import { applyCarConceptMaterialStability, carConceptMaterialRenderStateOverrides } from "@aura3d/engine/assets";
import { loadGltfScene } from "@aura3d/engine/renderer";
import { startProductScene } from "../../wow-common/src/product-scene";

void startProductScene({
  id: "wow-concept-car-cinema",
  async loadModel(viewport) {
    const car = await loadGltfScene({
      url: "/fixtures/threejs-parity/assets/vehicles/car-concept.glb",
      assetId: "car-concept",
      assetName: "Concept Car",
      viewport,
      materialRenderStateOverrides: carConceptMaterialRenderStateOverrides("current-routes-flagship")
    });
    for (const paint of car.resources.materialLibrary.values()) {
      applyCarConceptMaterialStability(paint, {
        materialKey: paint.name,
        profile: "cinematic",
        roughnessScale: 0.74,
        metallicScale: 1.18,
        clearcoatBoost: 0.16
      });
    }
    return car;
  },
  lighting: { intensity: 0.54, reflection: 0.32, specular: 0.012, rotation: 0.15 },
  background: true,
  orbit: { yaw: -0.38, pitch: -0.08, zoom: 0.82, radiansPerSecond: 0.17 }
});
