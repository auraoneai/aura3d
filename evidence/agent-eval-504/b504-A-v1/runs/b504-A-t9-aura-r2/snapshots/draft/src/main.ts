import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const steel = material.pbr({ color: "#b9c1ce", metallic: 0.55, roughness: 0.38 });
const dark = material.pbr({ color: "#2a2e39", metallic: 0.6, roughness: 0.5 });
const eyeMat = material.emissive({ color: "#10303a", emissive: "#33e6ff", emissiveIntensity: 2.5 });

let k = 0;
const limb = (len: number, r: number) =>
  primitives.capsule({ name: `limb${k++}`, size: [r * 2, len, r * 2], material: steel }).position(0, -len / 2, 0);
const J = (id: string, position: [number, number, number], kids: Parameters<typeof group>[1]) =>
  group(id, kids, { position }).runtime({ id, mutable: true });
const foot = () => primitives.box({ name: `foot${k++}`, size: [0.14, 0.07, 0.26], material: dark }).position(0, -0.44, 0.04);
const hand = () => primitives.sphere({ name: `hand${k++}`, size: 0.11, material: dark }).position(0, -0.33, 0);

let sc = scene({ background: "#05060a" })
  .camera(camera.perspective({ position: [0, 1.3, 5.4], target: [0, 1.02, 0], fov: 36, near: 0.1, far: 50 }))
  .add(environments.neutral({ intensity: 0.15, background: false }))
  .add(lights.directional({ name: "key", position: [2.8, 4.2, 3.2], target: [0, 1, 0], intensity: 5, shadow: true }))
  .add(lights.directional({ name: "rim", position: [-3.5, 2.6, -3.5], target: [0, 1, 0], intensity: 5, color: "#ff2fa8" }))
  .add(lights.directional({ name: "rim2", position: [3.5, 2.2, -3.5], target: [0, 1, 0], intensity: 2.5, color: "#2f7bff" }))
  .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#2b2f3a", metallic: 0.2, roughness: 0.6 }) }));

sc = sc.add(
  J("hips", [0, 1, 0], [
    primitives.box({ name: "pelvis", size: [0.34, 0.16, 0.2], material: dark }),
    J("l-hip", [-0.1, 0, 0], [limb(0.46, 0.07), J("l-knee", [0, -0.47, 0], [limb(0.44, 0.06), foot()])]),
    J("r-hip", [0.1, 0, 0], [limb(0.46, 0.07), J("r-knee", [0, -0.47, 0], [limb(0.44, 0.06), foot()])]),
    J("chest", [0, 0.1, 0], [
      primitives.box({ name: "torso", size: [0.46, 0.5, 0.25], material: steel }).position(0, 0.3, 0),
      primitives.box({ name: "core", size: [0.14, 0.14, 0.02], material: eyeMat }).position(0, 0.34, 0.135),
      J("head", [0, 0.58, 0], [
        primitives.sphere({ name: "skull", size: 0.26, material: steel }).position(0, 0.2, 0),
        primitives.box({ name: "eye-l", size: [0.05, 0.03, 0.03], material: eyeMat }).position(-0.05, 0.22, 0.115),
        primitives.box({ name: "eye-r", size: [0.05, 0.03, 0.03], material: eyeMat }).position(0.05, 0.22, 0.115)
      ]),
      J("l-shoulder", [-0.31, 0.5, 0], [limb(0.34, 0.055), J("l-elbow", [0, -0.36, 0], [limb(0.32, 0.048), hand()])]),
      J("r-shoulder", [0.31, 0.5, 0], [limb(0.34, 0.055), J("r-elbow", [0, -0.36, 0], [limb(0.32, 0.048), hand()])])
    ])
  ])
);

sc = sc.add(effects.bloom({ intensity: 0.5, threshold: 0.8, radius: 0.5 }));

const app = createAuraApp("#app", { scene: sc });
let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const b = Math.sin(t * 1.6);
  const w = Math.sin(t * 0.7);
  const n = (id: string) => app.nodes.require(id);
  n("hips").setPosition(0.025 * w, 1 + 0.012 * b, 0);
  n("hips").setRotation(0, 0.05 * w, 0.02 * w);
  n("chest").setRotation(0.03 * b, 0.1 * w, 0);
  n("head").setRotation(-0.04 * b, 0.35 * Math.sin(t * 0.5), 0.05 * Math.sin(t * 0.9));
  n("l-shoulder").setRotation(0.05 * b, 0, 0.1 + 0.03 * b);
  n("r-shoulder").setRotation(-0.05 * b, 0, -0.1 - 0.03 * b);
  n("l-elbow").setRotation(-0.25 - 0.05 * b, 0, 0);
  n("r-elbow").setRotation(-0.25 - 0.05 * b, 0, 0);
  n("l-hip").setRotation(0.02 * w, 0, -0.03 * w);
  n("r-hip").setRotation(-0.02 * w, 0, -0.03 * w);
  n("l-knee").setRotation(0.04 + 0.03 * Math.max(0, w), 0, 0);
  n("r-knee").setRotation(0.04 + 0.03 * Math.max(0, -w), 0, 0);
});
await app.ready();
window.__EVAL_READY__ = true;
