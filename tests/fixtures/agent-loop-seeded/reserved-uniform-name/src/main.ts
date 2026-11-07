import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

// uTime is owned by the shader prelude; declaring it as a uniform makes material.custom reject the spec.
const pulse = material.custom({
  glsl: {
    fragment: /* glsl */ `
out vec4 outColor;
void main() { outColor = vec4(0.9, 0.3 + 0.5 * sin(uTime), 0.3, 1.0); }`
  },
  uniforms: { uTime: { type: "f32", value: 0 } }
});

async function main(): Promise<void> {
  const app = createAuraApp("#app", {
  scene: scene({ background: "#1b2230" })
    .add(lights.directional({ position: [4, 6, 3], intensity: 2.5 }))
    .add(primitives.sphere({ name: "pulse", material: pulse }).position(0, 0.8, 0).scale(2))
    .camera(camera.orbit({ target: [0, 0.5, 0], distance: 8, fov: 40 }))
});
  await app.ready();
}
void main();
