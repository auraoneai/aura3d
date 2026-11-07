import { camera, createAuraApp, material, primitives, scene } from "@aura3d/engine";

// Motion probe for the "uTime-only" case: a custom shader whose ONLY motion is the built-in clock.
// Deliberately no `.runtime(...)`, no `app.onFrame(...)`, no timeline, no animated camera, so the scene declares no motion
// of its own. Before the 5.1 frame-loop fix this drew exactly one frame and froze (frame difference 0.000); after it
// the loop keeps drawing and the colour cycles. A static scene (no uTime) must still draw once.
const clock = material.custom({
  glsl: {
    fragment: /* glsl */ `
out vec4 outColor;
void main() {
  float wave = 0.5 + 0.5 * sin(uTime * 2.0);
  outColor = vec4(wave, 0.35 + 0.3 * wave, 1.0 - wave, 1.0);
}`
  }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#101820" })
    .add(primitives.box({ name: "clock-panel", size: [40, 24, 0.2], material: clock }))
    .camera(camera.perspective({ position: [0, 0, 20], target: [0, 0, 0], fov: 50, near: 0.5, far: 100 }))
});
try {
  await app.ready();
  console.log("probe-ready");
} catch (error) {
  console.error("probe-failed", error);
}
