import { camera, createAuraApp, effects, interactions, lights, material, model, primitives, scene, timeline } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: scene()
    .background("#050712")
    .add(primitives.plane({ name: "storm wall", material: material.emissive({ color: "#111c31", emissive: "#1b4f7a" }) }).position(0, 1.04, -2.25).rotate(1.5708, 0, 0).scale([5.8, 1, 3.0]))
    .add(primitives.plane({ name: "wet mirror floor", material: material.pbr({ color: "#172533", roughness: 0.16, metallic: 0.34 }) }).position(0, -0.05, -0.55).scale([6.0, 1, 5.6]))
    .add(primitives.box({ name: "cyan light slash", material: material.emissive({ color: "#43d9ff", emissive: "#43d9ff" }) }).position(-2.0, 1.32, -1.65).rotate(0.05, 0, -0.28).scale([0.05, 1.35, 0.12]))
    .add(primitives.sphere({ name: "amber practical", material: material.emissive({ color: "#ffbd68", emissive: "#ffbd68" }) }).position(1.85, 0.72, -1.28).scale(0.34))
    .add(primitives.box({ name: "amber floor reflection", material: material.emissive({ color: "#ad6f3b", emissive: "#ad6f3b" }) }).position(1.7, 0.0, -0.62).scale([0.72, 0.035, 0.28]))
    .add(model(assets.hero).position(-0.12, 0.0, -0.95).rotate(-0.1, -0.66, 0.03).scale(1.12))
    .add(lights.ambient({ intensity: 0.16, color: "#9db7df" }))
    .add(lights.point({ name: "cyan-rim", position: [-2.3, 2.55, 0.9], color: "#38d6ff", intensity: 2.8 }))
    .add(lights.point({ name: "warm-practical", position: [2.4, 1.65, -0.35], color: "#ffd08a", intensity: 1.4 }))
    .add(effects.rain({ intensity: 0.34, color: "#b9dcff" }))
    .add(effects.fog({ density: 0.13, color: "#6f89b6" }))
    .add(effects.bloom({ intensity: 0.28, color: "#6edfff" }))
    .add(interactions.orbit())
    .camera(camera.dolly({ from: [0.46, 1.08, 5.25], to: [0.06, 0.92, 3.85], target: [-0.1, 0.5, -0.95], seconds: 8 }))
    .timeline(timeline.loop({ seconds: 8 }))
});
