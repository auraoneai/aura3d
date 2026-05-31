import { camera, createAuraApp, prefabs, scene, timeline } from "@aura3d/engine";

// Recipe 04 Neon Tunnel: the prefab supplies octagonal emissive rings,
// diagonal braces, perspective floor rails, glossy reflections, fog, bloom,
// sparks, and ambient particles. The dolly camera + looped timeline animate
// the camera through the tube so the screenshot reads as a flythrough.
createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 18 }))
    .camera(
      camera.dolly({
        from: [0, 0.45, 2.7],
        to: [0, 0.45, -2.8],
        target: [0, 0.45, -2.6],
        seconds: 8
      })
    )
    .timeline(timeline.loop({ seconds: 8 }))
});
