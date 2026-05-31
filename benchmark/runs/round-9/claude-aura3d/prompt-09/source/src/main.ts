import { camera, createAuraApp, lights, prefabs, scene, timeline } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#08111f")
    .addMany(prefabs.primitiveHumanoid())
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.perspective({ position: [1.2, 1.55, 3.4], target: [0, 0.82, -0.55], fov: 42 }))
    .timeline(timeline.loop({ seconds: 4 }))
});
