import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

// The key light has shadow on and the objects cast, but every surface is a material.custom node, and custom materials only
// receive the sun shadow when the spec sets receiveShadow: true. No shadow is ever drawn.
const floorMaterial = material.custom({ glsl: { fragment: /* glsl */ `
out vec4 outColor;
void main() { outColor = vec4(0.48, 0.52, 0.58, 1.0); }` } });
const ballMaterial = material.custom({ glsl: { fragment: /* glsl */ `
out vec4 outColor;
void main() { outColor = vec4(0.9, 0.28, 0.3, 1.0); }` } });
const blockMaterial = material.custom({ glsl: { fragment: /* glsl */ `
out vec4 outColor;
void main() { outColor = vec4(0.29, 0.62, 1.0, 1.0); }` } });

async function main(): Promise<void> {
  const app = createAuraApp("#app", {
  scene: scene({ background: "#1b2230" })
    .add(lights.directional({ position: [4, 6, 3], target: [0, 0, 0], intensity: 2.5, shadow: true }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: floorMaterial }))
    .add(primitives.sphere({ name: "ball", material: ballMaterial, castShadow: true }).position(0, 0.8, 0))
    .add(primitives.box({ name: "block", material: blockMaterial, castShadow: true }).position(2.2, 0.5, 0.4))
    .camera(camera.orbit({ target: [0, 0.5, 0], distance: 8, fov: 40 }))
});
  await app.ready();
}
void main();
