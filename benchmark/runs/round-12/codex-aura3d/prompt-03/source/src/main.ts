import {
  camera,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene,
  timeline
} from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.solarSystem({ labels: "attached", orbitSegments: 24, starCount: 42 }))
    .add(lights.studio({ intensity: 0.85 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [0, 4.15, 6.45], target: [0, 0.16, 0], fov: 45 }))
    .timeline(timeline.loop({ seconds: 10 }))
});
