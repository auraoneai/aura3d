// Stub-model solution (C1 dry run only): a fixed Aura3D lighthouse, not an agent output.
import { camera, createAuraApp, environments, interactions, lights, material, primitives, scene } from "@aura3d/engine";

const parts = [];
const BANDS = 4;
const s = scene({ background: "#9cc3e6" })
  .add(environments.neutral({ intensity: 0.6, background: false }))
  .add(lights.directional({ position: [6, 10, 5], target: [0, 2, 0], intensity: 3, shadow: true }))
  .add(primitives.plane({ name: "sea", size: [40, 1, 40], material: material.pbr({ color: "#2f6f8f", roughness: 0.3 }) }));
parts.push("sea");
for (let i = 0; i < 6; i += 1) {
  const a = (i / 6) * Math.PI * 2;
  s.add(primitives.sphere({ name: `rock${i}`, size: 1.4 + (i % 3) * 0.3, material: material.pbr({ color: "#6b6660", roughness: 0.9 }) }).position(Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.6));
  parts.push(`rock${i}`);
}
for (let b = 0; b < BANDS; b += 1) {
  const r = 0.9 - b * 0.1;
  s.add(primitives.cylinder({ name: `band${b}`, size: [r * 2, 1.2, r * 2], material: material.pbr({ color: b % 2 ? "#ffffff" : "#c8302c", roughness: 0.6 }) }).position(0, 1.2 + b * 1.2, 0));
  parts.push(`band${b}`);
}
s.add(primitives.cylinder({ name: "gallery", size: [1.8, 0.15, 1.8], material: material.pbr({ color: "#333333", metallic: 0.6, roughness: 0.4 }) }).position(0, 6.05, 0));
s.add(primitives.cylinder({ name: "lantern", size: [1.0, 0.9, 1.0], material: material.pbr({ color: "#bfe6ff", roughness: 0.05, metallic: 0.1 }) }).position(0, 6.6, 0));
s.add(primitives.sphere({ name: "lamp", size: 0.45, material: material.pbr({ color: "#fff2a8", emissive: "#ffd34d", emissiveIntensity: 4 }) }).position(0, 6.6, 0).runtime({ id: "lamp", mutable: true }));
s.add(primitives.cone({ name: "roof", size: [1.3, 0.8, 1.3], material: material.pbr({ color: "#222222", roughness: 0.5 }) }).position(0, 7.45, 0));
s.add(primitives.sphere({ name: "finial", size: 0.18, material: material.pbr({ color: "#d4af37", metallic: 1, roughness: 0.3 }) }).position(0, 7.95, 0));
s.add(primitives.box({ name: "door", size: [0.5, 0.8, 0.1], material: material.pbr({ color: "#5a3a22" }) }).position(0, 1.0, 0.9));
for (let w = 0; w < 4; w += 1) {
  const a = w * 1.3;
  s.add(primitives.box({ name: `window${w}`, size: [0.22, 0.3, 0.06], material: material.pbr({ color: "#1d2733" }) }).position(Math.sin(a) * 0.8, 2.2 + w * 1.0, Math.cos(a) * 0.8));
  parts.push(`window${w}`);
}
s.add(primitives.box({ name: "cottage", size: [1.6, 1.0, 1.2], material: material.pbr({ color: "#efe6d2" }) }).position(2.6, 0.9, 0.6));
s.add(primitives.cone({ name: "cottageRoof", size: [1.4, 0.7, 1.4], material: material.pbr({ color: "#7a2f22" }) }).position(2.6, 1.75, 0.6));
parts.push("gallery", "lantern", "lamp", "roof", "finial", "door", "cottage", "cottageRoof");
s.add(interactions.orbit({ target: "band0", autoRotate: 0.4 }));
s.camera(camera.orbit({ position: [9, 5, 9], target: [0, 3.6, 0], fov: 45 }));

const app = createAuraApp("#app", { scene: s });
const w = window as unknown as { __TASK_STATE__?: unknown; __EVAL_READY__?: boolean };
let lampOn = true;
app.onFrame((f) => {
  const on = Math.floor(f.time) % 2 === 0;
  if (on !== lampOn) {
    lampOn = on;
    app.nodes.require("lamp").setVisible(on);
  }
  w.__TASK_STATE__ = { ready: true, partCount: parts.length, bandCount: BANDS, lampOn };
});
await app.ready();
w.__TASK_STATE__ = { ready: true, partCount: parts.length, bandCount: BANDS };
w.__EVAL_READY__ = true;
