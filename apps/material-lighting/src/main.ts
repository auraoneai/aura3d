import { camera, createAuraApp, effects, interactions, lights, material, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true },
  scene: scene()
    .background("#070a0f")
    .add(primitives.plane({ material: material.pbr({ color: "#0d1116", roughness: 0.24, metallic: 0.14 }) }).position(0, -0.1, -0.88).rotate(-1.5708, 0, 0).scale([6.4, 1, 4.1]))
    .add(primitives.plane({ material: material.pbr({ color: "#131c25", roughness: 0.58, metallic: 0.02 }) }).position(0, 0.98, -2.12).scale([6.2, 1, 2.3]))
    .add(primitives.plane({ material: material.pbr({ color: "#090e13", roughness: 0.7, metallic: 0 }) }).position(-2.55, 0.76, -0.96).rotate(0, 1.5708, 0).scale([3.8, 1, 2.0]))
    .add(primitives.plane({ material: material.pbr({ color: "#101820", roughness: 0.7, metallic: 0 }) }).position(2.55, 0.76, -0.96).rotate(0, -1.5708, 0).scale([3.8, 1, 2.0]))
    .add(primitives.box({ name: "material sample plinth", material: material.pbr({ color: "#334653", roughness: 0.42, metallic: 0.08 }) }).position(0, 0.04, -0.9).scale([3.3, 0.08, 0.68]))
    .add(primitives.sphere({ name: "neutral emissive sample", material: material.emissive({ color: "#e8edf2", emissive: "#e8edf2", emissiveIntensity: 0.42 }) }).position(-1.08, 0.54, -0.76).scale(0.68))
    .add(primitives.sphere({ name: "brushed metal sample", material: material.pbr({ color: "#a9c1d2", roughness: 0.3, metallic: 0.58 }) }).position(-0.36, 0.49, -0.82).scale(0.56))
    .add(primitives.sphere({ name: "magenta emissive sample", material: material.emissive({ color: "#ff00b8", emissive: "#ff00b8", emissiveIntensity: 0.5 }) }).position(0.38, 0.54, -0.78).scale(0.63))
    .add(primitives.sphere({ name: "cyan emissive sample", material: material.emissive({ color: "#00bfff", emissive: "#00d8ff", emissiveIntensity: 0.65 }) }).position(1.06, 0.49, -0.78).scale(0.48))
    .add(primitives.sphere({ name: "amber emissive sample", material: material.emissive({ color: "#ff9f00", emissive: "#ffb000", emissiveIntensity: 0.55 }) }).position(1.62, 0.46, -0.82).scale(0.42))
    .add(primitives.box({ name: "cyan studio light bar", material: material.emissive({ color: "#00bfff", emissive: "#00d8ff", emissiveIntensity: 0.65 }) }).position(-2.18, 0.7, -1.12).scale([0.08, 1.05, 0.08]))
    .add(primitives.box({ name: "amber studio light bar", material: material.emissive({ color: "#ff9f00", emissive: "#ffb000", emissiveIntensity: 0.55 }) }).position(2.18, 0.7, -1.12).scale([0.08, 1.05, 0.08]))
    .add(lights.ambient({ intensity: 0.24 }))
    .add(lights.directional({ position: [1.4, 3.1, 2.6], intensity: 1.25, color: "#f7fbff" }))
    .add(lights.point({ position: [-2.2, 1.6, 1.1], color: "#63e5ff", intensity: 2.4 }))
    .add(lights.point({ position: [2.1, 1.55, 1.0], color: "#ffd08a", intensity: 2.0 }))
    .add(effects.bloom({ intensity: 0.26 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [0.08, 0.92, 3.45], target: [0, 0.36, -0.86], fov: 38 }))
});
