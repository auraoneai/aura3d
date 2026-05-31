import { camera, createAuraApp, effects, prefabs, scene, timeline } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 26 }))
    .add(effects.fog({ density: 0.1 }))
    .add(effects.bloom({ intensity: 0.58 }))
    .camera(
      camera.dolly({
        from: [0, 0.45, 3.1],
        to: [0, 0.45, -3.2],
        target: [0, 0.45, -2.9],
        seconds: 8
      })
    )
    .timeline(timeline.loop({ seconds: 8 }))
});
