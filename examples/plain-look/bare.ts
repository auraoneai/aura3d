// Bare scene (N2 + N3): geometry only, no lights, environment, look or output. The engine adds the cold-start hero
// stage over the structured room and renders through the plain output. The crate's lit front face should read close to
// its authored #b5532f. `?a3d-plain-look=0` renders the ACES cold-start look for comparison.
import { camera, createAuraApp, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const sc = scene({ background: "#20232b" })
  .camera(camera.perspective({ position: [2.6, 1.9, 3.4], target: [0, 0.35, 0], fov: 45 }))
  .add(primitives.box({ name: "crate", size: 1, material: material.pbr({ color: "#b5532f", roughness: 0.7 }) }).position(-0.35, 0.5, 0))
  .add(primitives.sphere({ name: "ball", size: 0.5, material: material.pbr({ color: "#2f6fb5", roughness: 0.25 }) }).position(0.75, 0.25, 0.55))
  .add(primitives.sphere({ name: "steel", size: 0.6, material: material.pbr({ color: "#c8ccd2", metallic: 1, roughness: 0.3 }) }).position(0.85, 0.3, -0.6));

const app = createAuraApp("#app", { scene: sc });
(window as unknown as { __auraApp?: unknown }).__auraApp = app;
void app.ready().then(() => {
  window.__EVAL_READY__ = true;
});
