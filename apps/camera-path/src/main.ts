import { camera, createAuraApp, effects, lights, material, primitives, scene, timeline } from "@aura3d/engine";

createAuraApp("#app", {
  diagnostics: { overlay: true },
  scene: scene()
    .background("#070b12")
    .add(primitives.box({ name: "start", material: material.pbr({ color: "#38d6ff", metallic: 0.1 }) }).position(-1, 0.5, 0))
    .add(primitives.box({ name: "finish", material: material.pbr({ color: "#ffd08a", metallic: 0.1 }) }).position(1, 0.5, -1))
    .add(lights.studio({ intensity: 1.2 }))
    .add(effects.bloom({ intensity: 0.36 }))
    .camera(camera.dolly({ from: [0, 1.5, 5], to: [0.8, 1.1, 2.2], target: [0, 0.7, -0.4], seconds: 6 }))
    .timeline(timeline.loop({ seconds: 6 }))
});
