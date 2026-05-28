import { camera, createAuraApp, effects, interactions, lights, material, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true },
  scene: scene()
    .background("#070a0f")
    .add(primitives.plane({ material: material.pbr({ color: "#0d1116", roughness: 0.24, metallic: 0.14 }) }).position(0, -0.1, -0.88).rotate(-1.5708, 0, 0).scale([6.4, 1, 4.1]))
    .add(primitives.plane({ material: material.pbr({ color: "#131c25", roughness: 0.58, metallic: 0.02 }) }).position(0, 0.98, -2.12).scale([6.2, 1, 2.3]))
    .add(primitives.plane({ material: material.pbr({ color: "#090e13", roughness: 0.7, metallic: 0 }) }).position(-2.55, 0.76, -0.96).rotate(0, 1.5708, 0).scale([3.8, 1, 2.0]))
    .add(primitives.plane({ material: material.pbr({ color: "#101820", roughness: 0.7, metallic: 0 }) }).position(2.55, 0.76, -0.96).rotate(0, -1.5708, 0).scale([3.8, 1, 2.0]))
    .add(primitives.box({ material: material.pbr({ color: "#202b32", roughness: 0.5, metallic: 0.04 }) }).position(0, 0.04, -0.9).scale([3.3, 0.08, 0.68]))
    .add(primitives.sphere({ material: material.pbr({ color: "#cbd5df", roughness: 0.9, metallic: 0 }) }).position(-1.15, 0.42, -0.78).scale(0.38))
    .add(primitives.sphere({ material: material.pbr({ color: "#dce8f4", roughness: 0.18, metallic: 0.94 }) }).position(-0.38, 0.42, -0.82).scale(0.38))
    .add(primitives.sphere({ material: material.emissive({ color: "#351329", emissive: "#ff4fd8" }) }).position(0.4, 0.42, -0.82).scale(0.38))
    .add(primitives.sphere({ material: material.emissive({ color: "#071923", emissive: "#63e5ff" }) }).position(1.06, 0.42, -0.78).scale(0.34))
    .add(primitives.sphere({ material: material.emissive({ color: "#3a2108", emissive: "#ffd08a" }) }).position(1.74, 0.42, -0.82).scale(0.28))
    .add(primitives.box({ material: material.emissive({ color: "#071923", emissive: "#63e5ff" }) }).position(-2.18, 0.7, -1.12).scale([0.08, 1.05, 0.08]))
    .add(primitives.box({ material: material.emissive({ color: "#241308", emissive: "#ffd08a" }) }).position(2.18, 0.7, -1.12).scale([0.08, 1.05, 0.08]))
    .add(lights.ambient({ intensity: 0.16 }))
    .add(lights.directional({ position: [1.4, 3.1, 2.6], intensity: 1.25, color: "#f7fbff" }))
    .add(lights.point({ position: [-2.2, 1.6, 1.1], color: "#63e5ff", intensity: 2.4 }))
    .add(lights.point({ position: [2.1, 1.55, 1.0], color: "#ffd08a", intensity: 2.0 }))
    .add(effects.bloom({ intensity: 0.26 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [0.08, 0.92, 3.45], target: [0, 0.36, -0.86], fov: 38 }))
});
