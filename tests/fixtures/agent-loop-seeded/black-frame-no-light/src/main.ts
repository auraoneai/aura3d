import { camera, createAuraApp, material, primitives, scene } from "@aura3d/engine";

// A hand-written lit shader whose light direction uniform is never set (it defaults to zero), on a black background:
// every surface computes albedo * max(dot(n, 0), 0) = 0, so the frame is black. The engine's own lights are not involved.
const lit = (r: number, g: number, b: number) => material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vNormal;
void main() {
  vNormal = normal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vNormal;
out vec4 outColor;
void main() {
  float lambert = max(dot(normalize(vNormal), lightDir), 0.0);
  outColor = vec4(vec3(${r}, ${g}, ${b}) * lambert, 1.0);
}`
  },
  uniforms: { lightDir: { type: "vec3", value: [0, 0, 0] } }
});

async function main(): Promise<void> {
  const app = createAuraApp("#app", {
  scene: scene({ background: "#000000" })
    .add(primitives.sphere({ name: "ball", material: lit(0.9, 0.28, 0.3) }).position(0, 0.6, 0).scale(1.6))
    .add(primitives.box({ name: "block", material: lit(0.29, 0.62, 1.0) }).position(2, 0.5, 0))
    .camera(camera.orbit({ target: [0, 0.5, 0], distance: 7, fov: 40 }))
});
  await app.ready();
}
void main();
