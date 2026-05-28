import { camera, createAuraApp, interactions, lights, material, primitives, scene, timeline } from "@aura3d/engine";

createAuraApp("#app", {
  diagnostics: { overlay: true, performancePanel: true },
  scene: scene()
    .background("#071015")
    .add(primitives.plane({ name: "arena", material: material.pbr({ color: "#1f3b44", roughness: 0.8 }) }).scale([4, 1, 4]))
    .add(primitives.sphere({ name: "player", material: material.emissive({ color: "#c4f35a", emissive: "#c4f35a" }) }).position(-0.8, 0.4, 0).scale(0.65))
    .add(primitives.box({ name: "goal", material: material.pbr({ color: "#ff8a4c", metallic: 0.1 }) }).position(1.1, 0.35, -0.5).scale(0.5))
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.keyboard({ target: "player" }))
    .camera(camera.follow({ targetNode: "player", distance: 5, target: [0, 0.6, 0] }))
    .timeline(timeline.loop({ seconds: 6 }))
});
