import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  diagnostics: { overlay: true },
  scene: scene()
    .background("#101314")
    .add(primitives.sphere({ name: "matte", material: material.pbr({ color: "#bfc8d8", roughness: 0.86, metallic: 0 }) }).position(-1.3, 0.5, 0))
    .add(primitives.sphere({ name: "metal", material: material.pbr({ color: "#d3dde8", roughness: 0.28, metallic: 0.9 }) }).position(0, 0.5, 0))
    .add(primitives.sphere({ name: "emissive", material: material.emissive({ color: "#ff4fd8", emissive: "#ff4fd8" }) }).position(1.3, 0.5, 0))
    .add(lights.ambient({ intensity: 0.22 }))
    .add(lights.directional({ position: [2, 4, 3], intensity: 1.7 }))
    .add(lights.point({ position: [-2, 1.8, 1.5], color: "#38d6ff", intensity: 1.8 }))
    .camera(camera.orbit({ distance: 4.5 }))
});
