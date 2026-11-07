import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

// The hero object is scaled up to 20 units across; the orbit camera starts 4 units from its centre, i.e. inside it.
async function main(): Promise<void> {
  const app = createAuraApp("#app", {
  scene: scene({ background: "#1b2230" })
    .add(lights.directional({ position: [4, 6, 3], intensity: 2.5 }))
    .add(primitives.sphere({ name: "hero", material: material.pbr({ color: "#e5484d", roughness: 0.5 }) }).scale(20))
    .camera(camera.orbit({ target: [0, 0, 0], distance: 4, fov: 40 }))
});
  await app.ready();
}
void main();
