import { camera, createAuraApp, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const steel = material.pbr({ color: "#c3cad6", metallic: 0.6, roughness: 0.35 });
const dark = material.pbr({ color: "#2b2f3a", metallic: 0.6, roughness: 0.5 });
const glow = material.emissive({ color: "#8fefff", emissive: "#46dcff", emissiveIntensity: 2.4 });

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
    primitives.sphere({ name: `${side}-hip-ball`, size: 0.16, material: dark }),
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
    .add(lights.ambient({ color: "#1a2030", intensity: 0.25 }))
    .add(lights.directional({ name: "key", position: [3, 5.5, 4], target: [0, 1, 0], intensity: 4.5, color: "#fff0dc", shadow: true }))
    .add(lights.directional({ name: "rim-cyan", position: [-4, 3, -4], target: [0, 1, 0], intensity: 5, color: "#27c8ff" }))
    .add(lights.directional({ name: "rim-magenta", position: [4, 2.5, -4], target: [0, 1, 0], intensity: 3.5, color: "#ff2d95" }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#3a3f4c", roughness: 0.75 }) }))
    .add(robot)
    .camera(camera.perspective({ position: [1.4, 1.3, 5.2], target: [0, 1.0, 0], fov: 38 }))
});

let t = 0;
app.onFrame((frame) => {
  t += frame.dt;
  const breathe = Math.sin(t * 1.6);
  const shift = Math.sin(t * 0.6); // slow weight shift between feet
  const n = (id: string) => app.nodes.require(id);

  n("hips").setPosition(0.035 * shift, 1.0 + 0.012 * breathe - 0.01 * Math.abs(shift), 0);
  n("hips").setRotation(0, 0.05 * shift, 0.03 * shift);
  n("chest").setRotation(0.03 * breathe, 0.1 * Math.sin(t * 0.7), -0.03 * shift);
  n("head").setRotation(-0.04 * breathe, 0.4 * Math.sin(t * 0.5), 0.05 * Math.sin(t * 0.8));
  n("l-shoulder").setRotation(0.1 * Math.sin(t * 0.9), 0, 0.1 + 0.04 * breathe);
  n("r-shoulder").setRotation(-0.1 * Math.sin(t * 0.9 + 0.5), 0, -0.1 - 0.04 * breathe);
  n("l-elbow").setRotation(-0.3 - 0.08 * breathe, 0, 0);
  n("r-elbow").setRotation(-0.3 - 0.08 * Math.sin(t * 1.6 + 0.6), 0, 0);
  n("l-hip").setRotation(0, 0, 0.04 * shift);
  n("r-hip").setRotation(0, 0, 0.04 * shift);
  n("l-knee").setRotation(0.03 + 0.04 * Math.max(0, -shift), 0, 0);
  n("r-knee").setRotation(0.03 + 0.04 * Math.max(0, shift), 0, 0);
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
