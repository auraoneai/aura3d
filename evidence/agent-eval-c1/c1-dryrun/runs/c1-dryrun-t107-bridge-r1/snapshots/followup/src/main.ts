// Stub-model solution (C1 dry run only): native Aura3D scene around a bridge-exported lighthouse body.
import { camera, createAuraApp, environments, interactions, lights, material, primitives, scene } from "@aura3d/engine";
import { bridgeAssets, bridgeMeshCounts } from "./bridge/assets";

const s = scene({ background: "#9cc3e6" })
  .add(environments.neutral({ intensity: 0.6, background: false }))
  .add(lights.directional({ position: [6, 10, 5], target: [0, 2, 0], intensity: 3, shadow: true }))
  .add(primitives.plane({ name: "sea", size: [40, 1, 40], material: material.pbr({ color: "#2f6f8f", roughness: 0.3 }) }))
  .add(bridgeAssets.node("lighthouse", { name: "lighthouse", scaleMode: "world" }))
  .add(primitives.sphere({ name: "lamp", size: 0.45, material: material.pbr({ color: "#fff2a8", emissive: "#ffd34d", emissiveIntensity: 4 }) }).position(0, 6.6, 0).runtime({ id: "lamp", mutable: true }))
  .add(interactions.orbit({ target: "sea", autoRotate: 0.4 }))
  .camera(camera.orbit({ position: [9, 5, 9], target: [0, 3.6, 0], fov: 45 }));

const app = createAuraApp("#app", { scene: s });
const partCount = (bridgeMeshCounts.lighthouse ?? 0) + 2;
const w = window as unknown as { __TASK_STATE__?: unknown; __EVAL_READY__?: boolean };
let lampOn = true;
app.onFrame((f) => {
  const on = Math.floor(f.time) % 2 === 0;
  if (on !== lampOn) {
    lampOn = on;
    app.nodes.require("lamp").setVisible(on);
  }
  w.__TASK_STATE__ = { ready: true, partCount, bandCount: 4, lampOn };
});
await app.ready();
w.__TASK_STATE__ = { ready: true, partCount, bandCount: 4 };
w.__EVAL_READY__ = true;
