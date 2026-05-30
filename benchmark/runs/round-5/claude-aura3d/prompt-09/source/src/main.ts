import { camera, createAuraApp, lights, prefabs, scene, timeline } from "@aura3d/engine";
import "./style.css";

createAuraApp("#app", {
  scene: scene()
    .background("#08111f")
    .addMany(prefabs.primitiveHumanoid())
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.orbit({ distance: 4.6, target: [0, 0.75, -0.55] }))
    .timeline(timeline.loop({ seconds: 4 }))
});
