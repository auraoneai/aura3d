import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

// Animated water written with the prelude's uTime. Nothing in the project drives time, so the surface never moves.
const water = material.custom({
  glsl: {
    fragment: /* glsl */ `
out vec4 outColor;
void main() {
  float wave = 0.5 + 0.5 * sin(gl_FragCoord.x * 0.04 + gl_FragCoord.y * 0.03 + uTime * 3.0);
  outColor = vec4(0.05, 0.25 + 0.4 * wave, 0.6 + 0.3 * wave, 1.0);
}`
  }
});

async function main(): Promise<void> {
  const app = createAuraApp("#app", {
  scene: scene({ background: "#102030" })
    .add(lights.directional({ position: [4, 6, 3], intensity: 2.5 }))
    .add(primitives.plane({ name: "water", size: [10, 1, 10], material: water }))
    .camera(camera.perspective({ position: [0, 7, 7], target: [0, 0, 0], fov: 45 }))
});
  await app.ready();
}
void main();
