import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

// effects.fog does not read particleCount (the engine reports OPTION_IGNORED at runtime). The author expects a particle mist.
async function main(): Promise<void> {
  const app = createAuraApp("#app", {
  scene: scene({ background: "#1b2230" })
    .add(lights.directional({ position: [4, 6, 3], intensity: 2.5 }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#7b8494", roughness: 0.8 }), receiveShadow: true }))
    .add(primitives.sphere({ name: "ball", material: material.pbr({ color: "#e5484d" }) }).position(0, 0.8, 0))
    .add(effects.fog({ color: "#1b2230", density: 0.02, particleCount: 500 }))
    .camera(camera.orbit({ target: [0, 0.5, 0], distance: 8, fov: 40 }))
});
  await app.ready();
}
void main();
