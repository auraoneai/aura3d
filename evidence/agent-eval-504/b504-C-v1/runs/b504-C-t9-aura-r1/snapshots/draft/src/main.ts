import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const steel = material.pbr({ color: "#b9c1ce", metallic: 0.55, roughness: 0.38 });
const dark = material.pbr({ color: "#2a2e39", metallic: 0.6, roughness: 0.5 });
const glow = material.emissive({ color: "#8fefff", emissive: "#46dcff", emissiveIntensity: 2.4 });

const segment = (name: string, length: number, radius: number) =>
  primitives.capsule({ name, size: [radius * 2, length, radius * 2], material: steel }).position(0, -length / 2, 0);

const arm = (side: "l" | "r", x: number) =>
  group(`${side}-shoulder`, [
    primitives.sphere({ name: `${side}-shoulder-ball`, size: 0.2, material: dark }),
    segment(`${side}-upper-arm`, 0.34, 0.055),
    group(`${side}-elbow`, [
      primitives.sphere({ name: `${side}-elbow-ball`, size: 0.13, material: dark }),
      segment(`${side}-forearm`, 0.32, 0.048),
      primitives.sphere({ name: `${side}-hand`, size: 0.12, material: dark }).position(0, -0.37, 0)
    ], { position: [0, -0.36, 0] }).runtime({ id: `${side}-elbow`, mutable: true })
  ], { position: [x, 0.5, 0] }).runtime({ id: `${side}-shoulder`, mutable: true });

const leg = (side: "l" | "r", x: number) =>
  group(`${side}-hip`, [
    segment(`${side}-thigh`, 0.46, 0.07),
    group(`${side}-knee`, [
      primitives.sphere({ name: `${side}-knee-ball`, size: 0.15, material: dark }),
      segment(`${side}-shin`, 0.44, 0.06),
      primitives.box({ name: `${side}-foot`, size: [0.14, 0.07, 0.26], material: dark }).position(0, -0.48, 0.05)
    ], { position: [0, -0.47, 0] }).runtime({ id: `${side}-knee`, mutable: true })
  ], { position: [x, -0.03, 0] }).runtime({ id: `${side}-hip`, mutable: true });

const robot = group("robot", [
  group("hips", [
    primitives.box({ name: "pelvis", size: [0.34, 0.16, 0.2], material: dark }),
    leg("l", -0.1),
    leg("r", 0.1),
    group("chest", [
      primitives.box({ name: "torso", size: [0.46, 0.5, 0.25], material: steel }).position(0, 0.3, 0),
      primitives.box({ name: "core", size: [0.12, 0.12, 0.02], material: glow }).position(0, 0.32, 0.13),
      group("head", [
        primitives.cylinder({ name: "neck", size: [0.08, 0.1, 0.08], material: dark }).position(0, 0.04, 0),
        primitives.sphere({ name: "skull", size: 0.26, material: steel }).position(0, 0.2, 0),
        primitives.box({ name: "visor", size: [0.2, 0.05, 0.03], material: glow }).position(0, 0.21, 0.115)
      ], { position: [0, 0.58, 0] }).runtime({ id: "head", mutable: true }),
      arm("l", -0.31),
      arm("r", 0.31)
    ], { position: [0, 0.1, 0] }).runtime({ id: "chest", mutable: true })
  ], { position: [0, 1.0, 0] }).runtime({ id: "hips", mutable: true })
]);

const app = createAuraApp("#app", {
  scene: scene({ background: "#05060a" })
    .add(environments.neutral({ intensity: 0.15, background: false }))
    .add(lights.directional({ name: "key", position: [3.5, 5, 3.5], target: [0, 1, 0], intensity: 4.5, color: "#fff0dc", shadow: true }))
    .add(lights.directional({ name: "rim", position: [-3.5, 2.6, -3.5], target: [0, 1, 0], intensity: 5, color: "#ff2fa8" }))
    .add(lights.directional({ name: "rim2", position: [3.5, 2.6, -3.5], target: [0, 1, 0], intensity: 3, color: "#2fa8ff" }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#2a2d36", roughness: 0.8 }) }))
    .add(robot)
    .add(effects.bloom({ intensity: 0.4, threshold: 0.8, radius: 0.5 }))
    .camera(camera.perspective({ position: [0, 1.25, 5.4], target: [0, 1, 0], fov: 36 }))
});

let t = 0;
let ready = false;
app.onFrame((frame) => {
  t += frame.dt;
  const n = (id: string) => app.nodes.require(id);
  const b = Math.sin(t * 1.6);
  const w = Math.sin(t * 0.7);
  n("hips").setPosition(0.03 * w, 1.0 + 0.012 * b, 0);
  n("hips").setRotation(0, 0, -0.025 * w);
  n("chest").setRotation(0.03 * b, 0.1 * Math.sin(t * 0.7 + 0.5), 0.02 * w);
  n("head").setRotation(-0.04 * b, 0.35 * Math.sin(t * 0.5), 0.04 * Math.sin(t * 0.9));
  n("l-shoulder").setRotation(0.05 * b + 0.06 * Math.sin(t * 0.8), 0, 0.1 + 0.03 * b);
  n("r-shoulder").setRotation(-0.05 * b + 0.06 * Math.sin(t * 0.8 + 1.5), 0, -0.1 - 0.03 * b);
  n("l-elbow").setRotation(-0.25 - 0.05 * b - 0.05 * Math.sin(t * 0.8), 0, 0);
  n("r-elbow").setRotation(-0.25 - 0.05 * b - 0.05 * Math.sin(t * 0.8 + 1.5), 0, 0);
  n("l-hip").setRotation(0, 0, 0.025 * w);
  n("r-hip").setRotation(0, 0, 0.025 * w);
  n("l-knee").setRotation(0.04 + 0.03 * Math.max(0, w), 0, 0);
  n("r-knee").setRotation(0.04 + 0.03 * Math.max(0, -w), 0, 0);
  if (!ready) {
    ready = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
await app.ready();
