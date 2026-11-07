import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const steel = material.pbr({ color: "#b9c1ce", metallic: 0.55, roughness: 0.38 });
const dark = material.pbr({ color: "#2a2e39", metallic: 0.6, roughness: 0.5 });
const glow = material.emissive({ color: "#8fefff", emissive: "#46dcff", emissiveIntensity: 2.4 });

// A limb segment hangs down from its joint: capsule centred half its length below the pivot.
const segment = (name: string, length: number, radius: number, mat = steel) =>
  primitives.capsule({ name, size: [radius * 2, length, radius * 2], material: mat }).position(0, -length / 2, 0);

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
  scene: scene({ background: "#050609" })
    .add(environments.neutral({ intensity: 0.22, background: false }))
    .add(lights.directional({ name: "key", position: [2.5, 5, 4], target: [0, 1, 0], intensity: 3.4, color: "#ffe9cf", shadow: true }))
    .add(lights.directional({ name: "rim-magenta", position: [-4, 2.8, -3.5], target: [0, 1, 0], intensity: 4, color: "#ff2f9a" }))
    .add(lights.directional({ name: "rim-cyan", position: [4, 2.8, -3.5], target: [0, 1, 0], intensity: 3, color: "#2fb8ff" }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#3a3d48", roughness: 0.85 }), receiveShadow: true }))
    .add(robot)
    .camera(camera.perspective({ position: [0, 1.15, 5], target: [0, 1.0, 0], fov: 40 }))
});

const node = (id: string) => app.nodes.require(id);

let t = 0;
app.onFrame((frame) => {
  t += frame.dt;
  const breathe = Math.sin(t * 1.6);
  const shift = Math.sin(t * 0.6);
  node("hips").setPosition(0.03 * shift, 1.0 + 0.012 * breathe, 0);
  node("hips").setRotation(0, 0.05 * shift, 0.025 * shift);
  node("chest").setRotation(0.03 * breathe, 0.1 * Math.sin(t * 0.7), -0.03 * shift);
  node("head").setRotation(-0.04 * breathe, 0.35 * Math.sin(t * 0.5), 0.05 * Math.sin(t * 0.4));
  node("l-shoulder").setRotation(0.12 * Math.sin(t * 0.9), 0, 0.1 + 0.03 * breathe);
  node("r-shoulder").setRotation(-0.12 * Math.sin(t * 0.9 + 0.6), 0, -0.1 - 0.03 * breathe);
  node("l-elbow").setRotation(-0.3 - 0.08 * Math.sin(t * 1.1), 0, 0);
  node("r-elbow").setRotation(-0.3 - 0.08 * Math.sin(t * 1.1 + 1), 0, 0);
  node("l-hip").setRotation(0.02 * shift, 0, -0.03 * shift);
  node("r-hip").setRotation(-0.02 * shift, 0, -0.03 * shift);
  node("l-knee").setRotation(0.03 + 0.02 * Math.max(0, -shift), 0, 0);
  node("r-knee").setRotation(0.03 + 0.02 * Math.max(0, shift), 0, 0);
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
