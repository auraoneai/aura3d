import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const steel = material.pbr({ color: "#b9c1ce", metallic: 0.55, roughness: 0.38 });
const dark = material.pbr({ color: "#2a2e39", metallic: 0.6, roughness: 0.5 });
const glow = material.emissive({ color: "#8fefff", emissive: "#46dcff", emissiveIntensity: 2.4 });

// Joint: a group whose origin is the pivot.
const J = (id: string, position: [number, number, number], kids: Parameters<typeof group>[1]) =>
  group(id, kids, { position }).runtime({ id, mutable: true });

const segment = (name: string, length: number, radius: number) =>
  primitives.capsule({ name, size: [radius * 2, length, radius * 2], material: steel, castShadow: true }).position(0, -length / 2, 0);
const ball = (name: string, size: number) =>
  primitives.sphere({ name, size, material: dark, castShadow: true });

const arm = (side: "l" | "r", x: number) =>
  J(`${side}-shoulder`, [x, 0.5, 0], [
    ball(`${side}-shoulder-ball`, 0.2),
    segment(`${side}-upper-arm`, 0.34, 0.055),
    J(`${side}-elbow`, [0, -0.36, 0], [
      ball(`${side}-elbow-ball`, 0.13),
      segment(`${side}-forearm`, 0.32, 0.048),
      ball(`${side}-hand`, 0.12).position(0, -0.37, 0)
    ])
  ]);

const leg = (side: "l" | "r", x: number) =>
  J(`${side}-hip`, [x, -0.03, 0], [
    segment(`${side}-thigh`, 0.46, 0.07),
    J(`${side}-knee`, [0, -0.47, 0], [
      ball(`${side}-knee-ball`, 0.15),
      segment(`${side}-shin`, 0.44, 0.06),
      primitives.box({ name: `${side}-foot`, size: [0.14, 0.07, 0.26], material: dark, castShadow: true }).position(0, -0.48, 0.05)
    ])
  ]);

const robot = group("robot", [
  J("hips", [0, 1.0, 0], [
    primitives.box({ name: "pelvis", size: [0.34, 0.16, 0.2], material: dark, castShadow: true }),
    leg("l", -0.1),
    leg("r", 0.1),
    J("chest", [0, 0.1, 0], [
      primitives.box({ name: "torso", size: [0.46, 0.5, 0.25], material: steel, castShadow: true }).position(0, 0.3, 0),
      primitives.box({ name: "core", size: [0.12, 0.12, 0.02], material: glow }).position(0, 0.32, 0.13),
      J("head", [0, 0.58, 0], [
        primitives.cylinder({ name: "neck", size: [0.08, 0.1, 0.08], material: dark, castShadow: true }).position(0, 0.04, 0),
        primitives.sphere({ name: "skull", size: 0.26, material: steel, castShadow: true }).position(0, 0.2, 0),
        primitives.box({ name: "visor", size: [0.2, 0.05, 0.03], material: glow }).position(0, 0.21, 0.115)
      ]),
      arm("l", -0.31),
      arm("r", 0.31)
    ])
  ])
]);

const app = createAuraApp("#app", {
  scene: scene({ background: "#05060a" })
    .add(environments.neutral({ intensity: 0.15, background: false }))
    .add(lights.directional({ name: "key", position: [3, 5, 3.5], target: [0, 1, 0], intensity: 4.5, color: "#fff0dc", shadow: true }))
    .add(lights.directional({ name: "rim", position: [-3.5, 2.6, -3.5], target: [0, 1, 0], intensity: 5, color: "#ff2fa8" }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#2a2d36", roughness: 0.85 }), receiveShadow: true }))
    .add(robot)
    .camera(camera.perspective({ position: [0, 1.15, 5.6], target: [0, 1, 0], fov: 36 }))
});

let t = 0;
let ready = false;
app.onFrame((frame) => {
  t += frame.dt;
  const n = (id: string) => app.nodes.require(id);
  const breathe = Math.sin(t * 1.6);
  const sway = Math.sin(t * 0.7);
  n("hips").setPosition(0.025 * sway, 1.0 + 0.012 * breathe, 0);
  n("hips").setRotation(0, 0.05 * sway, 0.03 * sway);
  n("chest").setRotation(0.03 * breathe, 0.1 * Math.sin(t * 0.7 + 0.8), -0.03 * sway);
  n("head").setRotation(-0.04 * breathe, 0.35 * Math.sin(t * 0.5), 0.05 * Math.sin(t * 0.9));
  n("l-shoulder").setRotation(0.05 * breathe + 0.08 * Math.sin(t * 0.8), 0, 0.1 + 0.03 * breathe);
  n("r-shoulder").setRotation(-0.05 * breathe + 0.08 * Math.sin(t * 0.8 + 1.5), 0, -0.1 - 0.03 * breathe);
  n("l-elbow").setRotation(-0.25 - 0.08 * Math.sin(t * 0.8 + 0.5), 0, 0);
  n("r-elbow").setRotation(-0.25 - 0.08 * Math.sin(t * 0.8 + 2.0), 0, 0);
  // Weight shift: legs counter the hip sway.
  n("l-hip").setRotation(0, 0, -0.03 * sway);
  n("r-hip").setRotation(0, 0, -0.03 * sway);
  n("l-knee").setRotation(0.04 + 0.03 * Math.max(0, sway), 0, 0);
  n("r-knee").setRotation(0.04 + 0.03 * Math.max(0, -sway), 0, 0);
  if (!ready) {
    ready = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
await app.ready();
