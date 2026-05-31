import { camera, createAuraApp, effects, prefabs, scene, timeline } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 32 }))
    .add(effects.fog({ density: 0.14, color: "#07111f" }))
    .add(effects.bloom({ intensity: 0.55 }))
    .camera(
      camera.dolly({
        from: [0, 0.36, 1.6],
        to: [0, 0.36, -4.4],
        target: [0, 0.28, -5.8],
        fov: 54,
        seconds: 8
      })
    )
    .timeline(timeline.loop({ seconds: 8 }))
});
