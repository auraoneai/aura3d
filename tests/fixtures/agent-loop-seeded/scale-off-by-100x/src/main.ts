import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

// The crate was authored in centimetres and scaled 100x to "fix" it: it now fills the world.
async function main(): Promise<void> {
  const app = createAuraApp("#app", {
  scene: scene({ background: "#1b2230" })
    .add(lights.directional({ position: [4, 6, 3], intensity: 2.5 }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#7b8494", roughness: 0.8 }), receiveShadow: true }))
    .add(primitives.box({ name: "crate", material: material.pbr({ color: "#c08a4b", roughness: 0.7 }) }).position(0, 0.5, 0).scale(100))
    .camera(camera.perspective({ position: [6, 4, 8], target: [0, 0.5, 0], fov: 40 }))
});
  await app.ready();
}
void main();
