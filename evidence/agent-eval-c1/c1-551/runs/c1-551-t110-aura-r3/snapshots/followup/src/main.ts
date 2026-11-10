import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { lightsOn: boolean; pendulumAngleDeg: number };
  }
}

const wood = material.pbr({ color: "#6b3a1c", roughness: 0.55, metallic: 0.05 });
const woodDark = material.pbr({ color: "#4a2711", roughness: 0.6 });
const woodInner = material.pbr({ color: "#2b1810", roughness: 0.9 });
const brass = material.pbr({ color: "#d4a847", roughness: 0.3, metallic: 0.9 });
const dialMat = material.pbr({ color: "#f4ecd6", roughness: 0.8 });
const ink = material.pbr({ color: "#1a1410", roughness: 0.6 });
const red = material.pbr({ color: "#b3201a", roughness: 0.5 });
const glass = material.pbr({ color: "#cfe6ee", roughness: 0.05, opacity: 0.14, alphaMode: "blend", depthWrite: false });
const wallMat = material.pbr({ color: "#b9976d", roughness: 0.95 });
const floorMat = material.pbr({ color: "#5a3a22", roughness: 0.6 });
const trim = material.pbr({ color: "#3d2514", roughness: 0.6 });

const FACE_Y = 1.98;
const FACE_Z = 0.26;
const PIVOT_Y = 1.5;
const AMP = 0.15; // radians
const WEIGHT_X = 0.3;
const WEIGHT_TOP_START = 1.3;
const WEIGHT_H = 0.22;

// Case
const caseParts = group("case", [
  primitives.box({ name: "plinth", size: [1.12, 0.25, 0.62], material: woodDark }).position(0, 0.125, 0),
  primitives.box({ name: "bottom-rail", size: [0.9, 0.15, 0.5], material: wood }).position(0, 0.325, 0),
  primitives.box({ name: "side-l", size: [0.1, 1.3, 0.5], material: wood }).position(-0.45, 0.9, 0),
  primitives.box({ name: "side-r", size: [0.1, 1.3, 0.5], material: wood }).position(0.45, 0.9, 0),
  primitives.box({ name: "back", size: [0.8, 1.3, 0.04], material: woodInner }).position(0, 0.9, -0.23),
  primitives.box({ name: "hood", size: [1.0, 0.85, 0.5], material: wood }).position(0, 1.975, 0),
  primitives.box({ name: "crown", size: [1.12, 0.1, 0.6], material: woodDark }).position(0, 2.45, 0),
  primitives.box({ name: "crown-top", size: [0.9, 0.08, 0.5], material: wood }).position(0, 2.54, 0),
  primitives.sphere({ name: "finial", size: 0.12, material: brass }).position(0, 2.64, 0),
  primitives.box({ name: "glass", size: [0.8, 1.15, 0.01], material: glass, castShadow: false, receiveShadow: false }).position(0, 0.975, 0.24)
]);

// Dial
const marks = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const big = i % 3 === 0;
  const r = 0.285;
  return primitives.box({
    name: `mark-${i + 1}`,
    size: big ? [0.032, 0.09, 0.01] : [0.02, 0.06, 0.01],
    material: ink
  }).position(Math.sin(a) * r, FACE_Y + Math.cos(a) * r, FACE_Z + 0.02).rotation(0, 0, -a);
});

const dial = group("dial", [
  primitives.cylinder({ name: "bezel", size: [0.8, 0.03, 0.8], material: brass }).position(0, FACE_Y, FACE_Z).rotation(Math.PI / 2, 0, 0),
  primitives.cylinder({ name: "face", size: [0.7, 0.03, 0.7], material: dialMat }).position(0, FACE_Y, FACE_Z + 0.008).rotation(Math.PI / 2, 0, 0),
  ...marks
]);

const hand = (id: string, z: number, len: number, w: number, mat: typeof ink, tail = 0.04) =>
  group(id, [
    primitives.box({ name: `${id}-blade`, size: [w, len + tail, 0.008], material: mat }).position(0, (len - tail) / 2, 0)
  ]).position(0, FACE_Y, z).runtime({ id, mutable: true });


// Pendulum
const pendulum = group("pendulum", [
  primitives.box({ name: "rod", size: [0.016, 0.8, 0.012], material: brass }).position(0, -0.4, 0),
  primitives.sphere({ name: "bob", size: [0.28, 0.28, 0.07], material: brass }).position(0, -0.86, 0),
  primitives.sphere({ name: "bob-boss", size: 0.06, material: wood }).position(0, -0.86, 0.04)
]).position(0, PIVOT_Y, 0.04).runtime({ id: "pendulum", mutable: true });

// Weights with cords (cords run up behind the opaque hood)
const weight = (id: string, x: number, z: number) =>
  group(id, [
    primitives.cylinder({ name: `${id}-body`, size: [0.08, WEIGHT_H, 0.08], material: brass }).position(0, -WEIGHT_H / 2, 0),
    primitives.cylinder({ name: `${id}-cord`, size: [0.006, 1.0, 0.006], material: ink }).position(0, 0.5, 0)
  ]).position(x, WEIGHT_TOP_START, z).runtime({ id, mutable: true });

const clock = group("clock", [
  caseParts,
  dial,
  primitives.sphere({ name: "hub", size: 0.04, material: brass }).position(0, FACE_Y, FACE_Z + 0.055)
]);

const app = createAuraApp("#app", {
  scene: scene({ background: "#1a110a" })
    .add(environments.neutral({ intensity: 0.3, background: false }))
    .add(lights.hemisphere({ intensity: 0.35, skyColor: "#ffd9a8" }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "key", position: [2.5, 4.5, 5], target: [0, 1.2, 0], intensity: 2.0, color: "#ffc98a", shadow: true }).runtime({ id: "key", mutable: true }))
    .add(lights.point({ name: "interior", position: [0, 1.0, 0.1], intensity: 2.2, color: "#ffb25a", distance: 3 }).runtime({ id: "interior", mutable: true }))
    .add(lights.point({ name: "dial-glow", position: [0, 2.1, 0.9], intensity: 3, color: "#ffd09a", distance: 4 }).runtime({ id: "dial-glow", mutable: true }))
    .add(primitives.plane({ name: "floor", size: [9, 1, 7], material: floorMat }).position(0, 0, 0.2))
    .add(primitives.plane({ name: "wall", size: [9, 1, 4.2], material: wallMat }).position(0, 2.1, -0.4).rotation(Math.PI / 2, 0, 0))
    .add(primitives.box({ name: "baseboard", size: [9, 0.18, 0.05], material: trim }).position(0, 0.09, -0.37))
    .add(clock)
    .add(hand("hour-hand", FACE_Z + 0.03, 0.17, 0.036, ink))
    .add(hand("minute-hand", FACE_Z + 0.04, 0.26, 0.024, ink))
    .add(hand("second-hand", FACE_Z + 0.05, 0.27, 0.009, red, 0.07))
    .add(pendulum)
    .add(weight("weight-l", -WEIGHT_X, -0.1))
    .add(weight("weight-r", WEIGHT_X, -0.1))
    .camera(camera.perspective({ position: [0, 1.7, 5.4], target: [0, 1.3, 0], fov: 36 }))
});

const START = performance.now();

// Lighting presets: warm room vs dim night (dial glow stays so the face is readable).
const LOOKS = {
  on: {
    hemi: { intensity: 0.35, color: "#ffd9a8" },
    key: { intensity: 2.0, color: "#ffc98a" },
    interior: { intensity: 2.2, color: "#ffb25a" },
    "dial-glow": { intensity: 3, color: "#ffd09a" }
  },
  off: {
    hemi: { intensity: 0.06, color: "#5a70a8" },
    key: { intensity: 0.3, color: "#6f86c0" },
    interior: { intensity: 0.9, color: "#ff9a40" },
    "dial-glow": { intensity: 2.4, color: "#ffd8a8" }
  }
} as const;

const state = { lightsOn: true, pendulumAngleDeg: 0 };
window.__TASK_STATE__ = state;

function applyLook(on: boolean): void {
  const look = on ? LOOKS.on : LOOKS.off;
  for (const id of Object.keys(look) as (keyof typeof look)[]) {
    const node = app.nodes.require(id);
    node.setIntensity?.(look[id].intensity);
    node.setColor?.(look[id].color);
  }
}

const button = document.createElement("button");
button.id = "lights-toggle";
button.type = "button";
button.textContent = "Lights off";
button.style.cssText = "display:block;margin:8px;padding:6px 14px;font:inherit;cursor:pointer;";
button.addEventListener("click", () => {
  state.lightsOn = !state.lightsOn;
  button.textContent = state.lightsOn ? "Lights off" : "Lights on";
  applyLook(state.lightsOn);
});
document.body.appendChild(button);

app.onFrame(() => {
  const now = new Date();
  const s = now.getSeconds();
  const m = now.getMinutes();
  const h = now.getHours() % 12;

  // Hands rotate clockwise seen from the front (-z rotation).
  const secAngle = (s / 60) * Math.PI * 2; // one discrete tick per second
  const minAngle = ((m + s / 60) / 60) * Math.PI * 2;
  const hourAngle = ((h + m / 60 + s / 3600) / 12) * Math.PI * 2;
  app.nodes.require("second-hand").setRotation(0, 0, -secAngle);
  app.nodes.require("minute-hand").setRotation(0, 0, -minAngle);
  app.nodes.require("hour-hand").setRotation(0, 0, -hourAngle);

  // Period 2 s: cosine easing, slowest at the extremes, extremes land on whole seconds.
  const t = now.getTime() / 1000;
  const theta = AMP * Math.cos(Math.PI * t);
  app.nodes.require("pendulum").setRotation(0, 0, theta);
  state.pendulumAngleDeg = (theta * 180) / Math.PI;

  // Weights sink slowly, then are "wound" back up after a long run.
  const travel = (((performance.now() - START) / 1000) * 0.005) % 0.6;
  const y = WEIGHT_TOP_START - travel;
  app.nodes.require("weight-l").setPosition(-WEIGHT_X, y, -0.1);
  app.nodes.require("weight-r").setPosition(WEIGHT_X, y - 0.04, -0.1);
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
