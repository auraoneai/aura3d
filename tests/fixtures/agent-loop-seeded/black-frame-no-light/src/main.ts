import { camera, createAuraApp, material, primitives, scene } from "@aura3d/engine";

// Metal materials on a black background with no light and no environment reflect nothing: the frame stays black.
async function main(): Promise<void> {
  const app = createAuraApp("#app", {
  scene: scene({ background: "#000000" })
    .add(primitives.sphere({ name: "ball", material: material.metal({ color: "#e5484d", roughness: 0.3 }) }).position(0, 0.6, 0).scale(1.6))
    .add(primitives.box({ name: "block", material: material.metal({ color: "#4a9eff", roughness: 0.3 }) }).position(2, 0.5, 0))
    .camera(camera.orbit({ target: [0, 0.5, 0], distance: 7, fov: 40 }))
});
  await app.ready();
}
void main();
