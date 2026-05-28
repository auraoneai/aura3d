import { camera, createAuraApp, effects, interactions, lights, material, model, primitives, scene, timeline } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: scene()
    .background("#02040a")
    .add(primitives.plane({ name: "rainy alley back wall", material: material.emissive({ color: "#03070e", emissive: "#050b13" }) }).position(0, 1.06, -2.55).rotate(1.5708, 0, 0).scale([6.25, 1, 3.1]))
    .add(primitives.plane({ name: "black wet asphalt", material: material.pbr({ color: "#03070c", roughness: 0.08, metallic: 0.5 }) }).position(0, -0.07, -0.55).scale([7.0, 1, 5.9]))
    .add(primitives.box({ name: "left alley slab", material: material.pbr({ color: "#03060b", roughness: 0.46, metallic: 0.1 }) }).position(-2.9, 0.9, -0.95).rotate(0, 0.18, 0).scale([0.42, 2.25, 3.25]))
    .add(primitives.box({ name: "right alley slab", material: material.pbr({ color: "#03050a", roughness: 0.46, metallic: 0.1 }) }).position(2.95, 0.92, -1.05).rotate(0, -0.16, 0).scale([0.42, 2.35, 3.15]))
    .add(primitives.box({ name: "cyan neon sign", material: material.emissive({ color: "#32ddff", emissive: "#32ddff" }) }).position(-2.22, 1.35, -1.55).rotate(0.05, 0, -0.24).scale([0.055, 1.48, 0.12]))
    .add(primitives.box({ name: "short cyan practical", material: material.emissive({ color: "#63eaff", emissive: "#63eaff" }) }).position(-1.82, 0.74, -1.85).rotate(0.05, 0, 0.12).scale([0.045, 0.76, 0.12]))
    .add(primitives.sphere({ name: "warm street practical", material: material.emissive({ color: "#ffbd68", emissive: "#ffbd68" }) }).position(1.86, 0.78, -1.28).scale(0.34))
    .add(primitives.box({ name: "amber wet reflection", material: material.emissive({ color: "#b36d39", emissive: "#c77f45" }) }).position(1.62, -0.005, -0.42).rotate(0, -0.08, 0).scale([0.86, 0.035, 0.24]))
    .add(primitives.box({ name: "cyan wet reflection", material: material.emissive({ color: "#1a6d86", emissive: "#2398b7" }) }).position(-1.22, -0.005, -0.34).rotate(0, 0.16, 0).scale([0.72, 0.03, 0.18]))
    .add(model(assets.hero, { material: material.pbr({ color: "#94a8b8", roughness: 0.24, metallic: 0.56 }) }).position(-0.08, 0.02, -0.86).rotate(-0.08, -0.74, 0.02).scale(1.42))
    .add(lights.ambient({ intensity: 0.07, color: "#839dc6" }))
    .add(lights.point({ name: "hard cyan rim", position: [-2.35, 2.65, 0.85], color: "#38d6ff", intensity: 3.25 }))
    .add(lights.point({ name: "warm practical key", position: [2.35, 1.7, -0.25], color: "#ffd08a", intensity: 1.6 }))
    .add(lights.point({ name: "low floor bounce", position: [0.1, 0.45, 1.1], color: "#7edfff", intensity: 0.62 }))
    .add(effects.rain({ intensity: 0.46, color: "#c3e6ff" }))
    .add(effects.fog({ density: 0.08, color: "#32435a" }))
    .add(effects.bloom({ intensity: 0.36, color: "#6edfff" }))
    .add(interactions.orbit())
    .camera(camera.dolly({ from: [0.5, 1.05, 4.65], to: [0.08, 0.86, 3.45], target: [-0.08, 0.52, -0.86], seconds: 8 }))
    .timeline(timeline.loop({ seconds: 8 }))
});
