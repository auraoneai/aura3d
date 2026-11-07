import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

// Motion probe for the "uTime-only" case: a custom shader whose ONLY motion is the built-in clock.
// Deliberately no `.runtime(...)`, no `app.onFrame(...)`, no timeline, no animated camera, so the scene declares no motion
// of its own. Before the frame-loop fix this drew exactly one frame and froze (frame difference 0.000); after it the loop
// keeps drawing and the colour cycles. A visible lit scene is required: a black frame proves nothing (diff 0 for any build).
console.log("probe-start");
const clock = material.custom({
  glsl: {
    fragment: /* glsl */ `
out vec4 outColor;
void main() {
  float wave = 0.5 + 0.5 * sin(uTime);
  outColor = vec4(wave, 0.35 + 0.3 * wave, 1.0 - wave, 1.0);
}`
  }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#101820" })
    .add(lights.directional({ position: [4, 6, 8], target: [0, 0, 0], intensity: 2 }))
    .add(primitives.box({ name: "clock-panel", size: [30, 18, 0.2], material: clock }))
    .camera(camera.perspective({ position: [0, 0, 14], target: [0, 0, 0], fov: 50, near: 0.5, far: 100 }))
});
console.log("probe-created");
// No top-level await: a bundled entry chunk that is still evaluating cannot be re-entered by the engine's own
// dynamic imports (TemporalHistory, ShaderLibrary), so `await app.ready()` at module top level can deadlock the mount.
app.ready().then(
  () => { document.body.dataset.aura3dReady ??= "true"; console.log("probe-ready"); },
  (error: unknown) => { document.body.dataset.aura3dReady = "failed"; console.error("probe-failed", String(error), (error as Error)?.stack ?? ""); }
);
