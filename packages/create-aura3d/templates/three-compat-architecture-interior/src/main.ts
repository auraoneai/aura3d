// Three-compat architecture interior: a small room built from boxes,
// authored entirely through the public @aura3d/engine scene API.
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

const plaster = material.pbr({ color: "#cfd6e2", roughness: 0.85 });
const oakFloor = material.pbr({ color: "#8a6f52", roughness: 0.6 });
const walnut = material.pbr({ color: "#5b4231", roughness: 0.5 });

createAuraApp("#app", {
  scene: scene()
    .background("#10141c")
    .camera(camera.orbit({ target: [0, 1.1, 0], distance: 7 }))
    .add(primitives.box({ name: "floor slab", size: [6, 0.12, 6], position: [0, -0.06, 0], material: oakFloor, receiveShadow: true }))
    .add(primitives.box({ name: "back wall", size: [6, 2.8, 0.12], position: [0, 1.4, -3], material: plaster, receiveShadow: true }))
    .add(primitives.box({ name: "side wall", size: [0.12, 2.8, 6], position: [-3, 1.4, 0], material: plaster, receiveShadow: true }))
    .add(primitives.box({ name: "window header", size: [2.4, 0.5, 0.12], position: [1.2, 2.55, -3.01], material: plaster }))
    .add(primitives.box({ name: "table top", size: [1.8, 0.08, 0.9], position: [0.5, 0.74, -0.8], material: walnut, castShadow: true }))
    .add(primitives.box({ name: "table leg front", size: [0.08, 0.7, 0.08], position: [-0.3, 0.35, -0.45], material: walnut, castShadow: true }))
    .add(primitives.box({ name: "table leg back", size: [0.08, 0.7, 0.08], position: [1.3, 0.35, -1.15], material: walnut, castShadow: true }))
    .add(primitives.box({ name: "sofa seat", size: [2, 0.45, 0.9], position: [-1.8, 0.23, 1.3], material: material.pbr({ color: "#41506b", roughness: 0.78 }), castShadow: true }))
    .add(primitives.box({ name: "sofa backrest", size: [2, 0.6, 0.18], position: [-1.8, 0.75, 1.66], material: material.pbr({ color: "#36435a", roughness: 0.78 }), castShadow: true }))
    .add(primitives.cylinder({ name: "floor lamp pole", size: [0.06, 1.6, 0.06], position: [2.3, 0.8, 1.8], material: material.metal({ color: "#9aa3ad" }), castShadow: true }))
    .add(primitives.sphere({ name: "floor lamp shade", size: 0.32, position: [2.3, 1.7, 1.8], material: material.emissive({ color: "#ffe7b8", emissive: "#ffd28a", emissiveIntensity: 0.8 }) }))
    .add(lights.ambient({ intensity: 0.35 }))
    .add(lights.directional({ name: "window sun", position: [4, 5, 3], intensity: 1.4 }))
    .add(lights.point({ name: "lamp fill", position: [2.3, 1.7, 1.8], intensity: 1.1, color: "#ffd9a0" }))
});
