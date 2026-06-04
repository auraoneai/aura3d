import { camera, createAuraApp, effects, interactions, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true },
  scene: scene()
    .background("#08111f")
    .add(primitives.plane({ material: material.pbr({ color: "#0e151d", roughness: 0.34, metallic: 0.05 }) }).position(0, -0.08, -0.74).rotate(-1.5708, 0, 0).scale([5.6, 1, 3.6]))
    .add(primitives.plane({ material: material.pbr({ color: "#14202c", roughness: 0.62, metallic: 0 }) }).position(0, 1.14, -1.9).scale([5.6, 1, 2.2]))
    .add(primitives.plane({ material: material.pbr({ color: "#0b1118", roughness: 0.72, metallic: 0 }) }).position(-2.25, 0.82, -0.9).rotate(0, 1.5708, 0).scale([3.4, 1, 2.1]))
    .add(primitives.plane({ material: material.pbr({ color: "#111a22", roughness: 0.72, metallic: 0 }) }).position(2.25, 0.82, -0.9).rotate(0, -1.5708, 0).scale([3.4, 1, 2.1]))
    .add(primitives.box({ material: material.emissive({ color: "#0f2433", emissive: "#42dcff" }) }).position(-1.62, 0.82, -1.62).scale([0.06, 0.72, 0.06]))
    .add(primitives.box({ material: material.emissive({ color: "#2e2114", emissive: "#ffd18a" }) }).position(1.56, 0.78, -1.48).scale([0.06, 0.58, 0.06]))
    .add(primitives.box({ material: material.pbr({ color: "#283d4b", roughness: 0.48, metallic: 0.18 }) }).position(-0.52, 0.0, -0.72).scale([1.1, 0.08, 0.78]))
    .add(model(assets.robot, { name: "typed GLB robot" }).position(-0.5, 0.04, -0.7).rotate(0, 0.58, 0).scale(0.74))
    .add(primitives.sphere({ material: material.emissive({ color: "#07151c", emissive: "#7eeaff" }) }).position(0.94, 0.34, -0.86).scale(0.12))
    .add(primitives.sphere({ material: material.emissive({ color: "#241806", emissive: "#ffd166" }) }).position(1.2, 0.65, -1.14).scale(0.08))
    .add(lights.ambient({ intensity: 0.18 }))
    .add(lights.point({ position: [-1.6, 1.8, 1.6], color: "#7eeaff", intensity: 2.7 }))
    .add(lights.point({ position: [1.9, 1.45, 0.8], color: "#ffd18a", intensity: 1.9 }))
    .add(lights.directional({ position: [0.4, 3.2, 2.8], intensity: 1.0 }))
    .add(effects.bloom({ intensity: 0.16 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [0.06, 1.02, 3.42], target: [-0.24, 0.58, -0.78], fov: 34 }))
});
