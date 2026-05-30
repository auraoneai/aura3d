import { camera, createAuraApp, interactions, lights, prefabs, scene } from "@aura3d/engine";

import "./style.css";

createAuraApp("#app", {
  scene: scene()
    .background("#10151f")
    .addMany(prefabs.materialSwatches())
    .add(lights.studio({ intensity: 1.3 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.0, target: [0, 0.55, 0] }))
});
