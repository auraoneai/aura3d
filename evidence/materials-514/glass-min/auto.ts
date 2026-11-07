// Same scene as before.ts with NO environments.* node: the shipped studio-material default (auto softbox probe, background off).
// Expected to render identically to before.ts.
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

const stage = scene()
  .add(lights.directional({ name: "key", position: [3, 6, 4], target: [0, 0.6, 0], intensity: 2.2, shadow: { mapSize: 1024 } }))
  .add(primitives.plane({ name: "floor", size: [12, 1, 12], material: material.pbr({ color: "#8a8f96", roughness: 0.8 }), receiveShadow: true }))
  .add(primitives.sphere({ name: "glass", size: 1.5, material: material.studioGlass({ tint: "#b5e4f5" }), castShadow: true }).position(-1, 0.75, 0))
  .add(primitives.sphere({ name: "steel", size: 1.5, material: material.studioMetal({ roughness: 0.2 }), castShadow: true }).position(1, 0.75, 0))
  .camera(camera.perspective({ position: [0, 1.8, 6], target: [0, 0.7, 0], fov: 38 }));

const app = createAuraApp("#app", { scene: stage });
void app.ready().then(() => { window.__EVAL_READY__ = true; });
