import { camera, createAuraApp, effects, lights, prefabs, scene, timeline } from "@aura3d/engine";

// Prompt 04: Neon Tunnel Flythrough.
// Recipe: docs/agents/benchmark-recipes.md "04 Neon Tunnel".
// Procedural tube geometry with emissive segments comes from prefabs.neonTunnel.
// Bloom + fog falloff are layered explicitly so the required glow and depth
// falloff read clearly in the flythrough screenshot. The dolly camera plus a
// looping timeline animate the view through the tunnel interior.
createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 18 }))
    .add(effects.fog({ density: 0.16 }))
    .add(effects.bloom({ intensity: 0.55 }))
    .add(lights.point({ position: [0, 0.45, 0], color: "#38d6ff", intensity: 1.6 }))
    .camera(camera.dolly({ from: [0, 0.45, 2.7], to: [0, 0.45, -2.8], target: [0, 0.45, -2.6], seconds: 8 }))
    .timeline(timeline.loop({ seconds: 8 }))
});
