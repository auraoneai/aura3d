import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const steel = material.pbr({ color: "#b9c1ce", metallic: 0.55, roughness: 0.38 });
const dark = material.pbr({ color: "#2a2e39", metallic: 0.6, roughness: 0.5 });
const eyeMat = material.emissive({ color: "#103040", emissive: "#40e0ff", emissiveIntensity: 3 });
const floorMat = material.pbr({ color: "#2b2d35", metallic: 0.1, roughness: 0.6 });

let k = 0;
const limb = (len: number, r: number) =>
  primitives.capsule({ name: `limb${k++}`, size: [r * 2, len, r * 2], material: steel }).position(0, -len / 2, 0);
const J = (id: string, position: [number, number, number], kids: Parameters<typeof group>[1]) =>
  group(id, kids, { position }).runtime({ id, mutable: true });
const foot = () =>
  primitives.box({ name: `foot${k++}`, size: [0.12, 0.1, 0.24], material: dark }).position(0, -0.47, 0.04);
const joint = (r: number) => primitives.sphere({ name: `joint${k++}`, size: r * 2, material: dark });

const sc = scene({ background: "#05060a" })
  .camera(camera.perspective({ position: [0.7, 1.25, 5.4], target: [0, 1, 0], fov: 36 }))
  .add(environments.neutral({ intensity: 0.15, background: false }))
  .add(lights.directional({ name: "key", position: [2.8, 4.6, 3.2], target: [0, 1, 0], intensity: 5.5, color: "#fff1dc", shadow: true }))
  .add(lights.directional({ name: "rim", position: [-3.5, 2.6, -3.5], target: [0, 1, 0], intensity: 6, color: "#ff2fa8" }))
  .add(lights.directional({ name: "rim2", position: [3.5, 2.2, -3.2], target: [0, 1, 0], intensity: 3, color: "#2f7bff" }))
  .add(primitives.plane({ name: "floor", size: [16, 1, 16], material: floorMat, castShadow: false, receiveShadow: true }))
  .add(
    J("hips", [0, 1, 0], [
      primitives.box({ name: "pelvis", size: [0.34, 0.16, 0.2], material: dark }),
      J("l-hip", [-0.1, 0, 0], [joint(0.075), limb(0.46, 0.07), J("l-knee", [0, -0.47, 0], [joint(0.065), limb(0.44, 0.06), foot()])]),
      J("r-hip", [0.1, 0, 0], [joint(0.075), limb(0.46, 0.07), J("r-knee", [0, -0.47, 0], [joint(0.065), limb(0.44, 0.06), foot()])]),
      J("chest", [0, 0.1, 0], [
        primitives.box({ name: "torso", size: [0.46, 0.5, 0.25], material: steel }).position(0, 0.3, 0),
        primitives.box({ name: "core", size: [0.14, 0.14, 0.02], material: eyeMat }).position(0, 0.34, 0.13),
        primitives.cylinder({ name: "neck", size: [0.08, 0.1, 0.08], material: dark }).position(0, 0.58, 0),
        J("head", [0, 0.58, 0], [
          primitives.sphere({ name: "skull", size: 0.26, material: steel }).position(0, 0.2, 0),
          primitives.box({ name: "eye-l", size: [0.05, 0.03, 0.02], material: eyeMat }).position(-0.05, 0.22, 0.12),
          primitives.box({ name: "eye-r", size: [0.05, 0.03, 0.02], material: eyeMat }).position(0.05, 0.22, 0.12)
        ]),
        J("l-shoulder", [-0.31, 0.5, 0], [joint(0.07), limb(0.34, 0.055), J("l-elbow", [0, -0.36, 0], [joint(0.055), limb(0.32, 0.048)])]),
        J("r-shoulder", [0.31, 0.5, 0], [joint(0.07), limb(0.34, 0.055), J("r-elbow", [0, -0.36, 0], [joint(0.055), limb(0.32, 0.048)])])
      ])
    ])
  )
  .add(effects.bloom({ intensity: 0.5, threshold: 0.8, radius: 0.5 }));

const app = createAuraApp("#app", { scene: sc });

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const b = Math.sin(t * 1.6);
  const w = Math.sin(t * 0.7);
  const n = (id: string) => app.nodes.require(id);
  n("hips").setPosition(0.03 * w, 1 + 0.012 * b - 0.01 * Math.abs(w), 0);
  n("hips").setRotation(0, 0.05 * w, 0.025 * w);
  n("chest").setRotation(0.03 * b, 0.1 * w, -0.03 * w);
  n("head").setRotation(-0.04 * b, 0.35 * Math.sin(t * 0.5), 0.04 * Math.sin(t * 0.37));
  n("l-shoulder").setRotation(0.05 * b + 0.08 * w, 0, 0.1 + 0.03 * b);
  n("r-shoulder").setRotation(0.05 * b - 0.08 * w, 0, -0.1 - 0.03 * b);
  n("l-elbow").setRotation(-0.25 - 0.05 * b, 0, 0);
  n("r-elbow").setRotation(-0.25 - 0.05 * b, 0, 0);
  n("l-hip").setRotation(0, 0, -0.03 * w);
  n("r-hip").setRotation(0, 0, -0.03 * w);
  n("l-knee").setRotation(0.04 + 0.03 * Math.max(0, w), 0, 0);
  n("r-knee").setRotation(0.04 + 0.03 * Math.max(0, -w), 0, 0);
});

await app.ready();
window.__EVAL_READY__ = true;
