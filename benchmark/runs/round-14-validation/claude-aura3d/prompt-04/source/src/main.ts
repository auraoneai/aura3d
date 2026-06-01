import { camera, createAuraApp, effects, prefabs, scene, timeline } from "@aura3d/engine";

// Prompt 04: Neon Tunnel Flythrough.
// Recipe 04 shape: procedural neon tube with emissive ring segments, a dolly
// flythrough camera, and a looping timeline. Bloom postprocess and fog falloff
// are added explicitly because the prompt names them as required evidence.
createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 24 }))
    .add(effects.fog({ density: 0.16, color: "#0a1230" }))
    .add(effects.bloom({ intensity: 0.55 }))
    .camera(camera.neon())
    .timeline(timeline.loop({ seconds: 8 }))
});
