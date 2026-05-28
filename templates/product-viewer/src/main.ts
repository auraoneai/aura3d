import { camera, createAuraApp, effects, interactions, lights, material, model, primitives, scene, timeline } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: scene()
    .background("#070b10")
    .add(primitives.plane({ name: "charcoal sweep backdrop", material: material.emissive({ color: "#111923", emissive: "#182433" }) }).position(0, 1.02, -2.2).rotate(1.5708, 0, 0).scale([5.4, 1, 2.75]))
    .add(primitives.plane({ name: "matte graphite product table", material: material.pbr({ color: "#242c31", roughness: 0.48, metallic: 0.06 }) }).position(0, -0.06, -0.55).scale([4.8, 1, 3.25]))
    .add(primitives.box({ name: "left vertical softbox", material: material.emissive({ color: "#eef6ff", emissive: "#eef6ff" }) }).position(-1.9, 0.86, -0.92).rotate(0, 0.22, 0).scale([0.08, 1.24, 1.58]))
    .add(primitives.box({ name: "right cool flag", material: material.emissive({ color: "#35506c", emissive: "#4d708f" }) }).position(1.98, 0.75, -1.05).rotate(0, -0.18, 0).scale([0.08, 0.95, 1.38]))
    .add(primitives.box({ name: "warm table reflection", material: material.emissive({ color: "#7a5a39", emissive: "#9f7145" }) }).position(0.72, -0.01, 0.36).rotate(0, -0.12, 0).scale([1.1, 0.03, 0.18]))
    .add(model(assets.product).position(0, 0.02, -0.68).rotate(-0.12, -0.42, 0.02).scale(0.96))
    .add(lights.ambient({ intensity: 0.28, color: "#e8f1ff" }))
    .add(lights.point({ name: "large cool softbox", position: [-2.2, 2.45, 2.25], color: "#eef6ff", intensity: 2.75 }))
    .add(lights.point({ name: "front product fill", position: [0.35, 1.25, 2.2], color: "#f7fbff", intensity: 1.8 }))
    .add(lights.point({ name: "warm product rim", position: [2.1, 1.72, 0.15], color: "#ffd09a", intensity: 1.22 }))
    .add(effects.bloom({ intensity: 0.18, color: "#cfefff" }))
    .add(interactions.orbit())
    .camera(camera.dolly({ from: [0.22, 1.12, 4.55], to: [0.05, 1.0, 3.55], target: [0, 0.58, -0.68], seconds: 7 }))
    .timeline(timeline.loop({ seconds: 7 }))
});
