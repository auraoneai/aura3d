import { camera, createAuraApp, effects, interactions, lights, material, primitives, scene, timeline } from "@aura3d/engine";

createAuraApp("#app", {
  diagnostics: { overlay: true, performancePanel: true },
  scene: scene()
    .background("#061018")
    .add(primitives.plane({ name: "raised arena floor", material: material.pbr({ color: "#17343d", roughness: 0.62, metallic: 0.08 }) }).position(0, -0.08, -0.35).scale([5.4, 1, 3.8]))
    .add(primitives.box({ name: "north wall", material: material.pbr({ color: "#275462", roughness: 0.5 }) }).position(0, 0.22, -2.15).scale([5.5, 0.42, 0.18]))
    .add(primitives.box({ name: "south wall", material: material.pbr({ color: "#223d48", roughness: 0.5 }) }).position(0, 0.22, 1.45).scale([5.5, 0.42, 0.18]))
    .add(primitives.box({ name: "left wall", material: material.pbr({ color: "#203f4b", roughness: 0.5 }) }).position(-2.65, 0.22, -0.35).scale([0.18, 0.42, 3.7]))
    .add(primitives.box({ name: "right wall", material: material.pbr({ color: "#203f4b", roughness: 0.5 }) }).position(2.65, 0.22, -0.35).scale([0.18, 0.42, 3.7]))
    .add(primitives.sphere({ name: "player", material: material.emissive({ color: "#c4f35a", emissive: "#c4f35a" }) }).position(-1.45, 0.42, 0.55).scale(0.5))
    .add(primitives.box({ name: "player trail", material: material.emissive({ color: "#4fd7ff", emissive: "#4fd7ff" }) }).position(-1.96, 0.11, 0.55).scale([0.72, 0.08, 0.18]))
    .add(primitives.box({ name: "moving block hazard", material: material.pbr({ color: "#ff5f6a", roughness: 0.35, metallic: 0.12 }) }).position(-0.2, 0.32, -0.2).rotate(0, 0.55, 0).scale([0.72, 0.5, 0.32]))
    .add(primitives.sphere({ name: "coin 1", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(-0.35, 0.45, 0.78).scale(0.38))
    .add(primitives.sphere({ name: "coin 2", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(0.55, 0.45, 0.24).scale(0.38))
    .add(primitives.sphere({ name: "coin 3", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(1.15, 0.45, -0.58).scale(0.38))
    .add(primitives.box({ name: "goal portal left", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(1.72, 0.48, -1.18).scale([0.14, 0.9, 0.18]))
    .add(primitives.box({ name: "goal portal right", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(2.12, 0.48, -1.18).scale([0.14, 0.9, 0.18]))
    .add(primitives.box({ name: "goal portal top", material: material.emissive({ color: "#ffbd68", emissive: "#ffbd68" }) }).position(1.92, 0.93, -1.18).scale([0.52, 0.12, 0.18]))
    .add(lights.ambient({ intensity: 0.18, color: "#9af0ff" }))
    .add(lights.point({ name: "arena key", position: [-1.4, 2.1, 1.6], color: "#8ef6ff", intensity: 2.0 }))
    .add(lights.point({ name: "goal glow", position: [2.0, 1.1, -1.2], color: "#ff9d5c", intensity: 1.8 }))
    .add(effects.bloom({ intensity: 0.24, color: "#9af0ff" }))
    .add(interactions.keyboard({ target: "player" }))
    .camera(camera.perspective({ position: [0, 3.15, 4.9], target: [0, 0.2, -0.35], fov: 42 }))
    .timeline(timeline.loop({ seconds: 6 }))
});
