import { camera, createAuraApp, effects, prefabs, scene, timeline } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 22 }))
    .add(effects.fog({ density: 0.055 }))
    .add(effects.bloom({ intensity: 0.62 }))
    .camera(camera.dolly({ from: [0, 0.45, 2.7], to: [0, 0.45, -2.8], target: [0, 0.45, -2.6], seconds: 8 }))
    .timeline(timeline.loop({ seconds: 8 }))
});
