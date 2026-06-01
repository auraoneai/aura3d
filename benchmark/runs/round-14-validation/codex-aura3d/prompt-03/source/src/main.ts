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
    .camera(camera.solar())
    .timeline(timeline.loop({ seconds: 10 }))
});
