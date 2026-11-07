import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type Vec3 = [number, number, number];

const PERIOD = 2; // seconds per full gait cycle
const BODY_H = 1.25; // body centre height above ground
const HIP_R = 0.5; // hip distance from body centre
const L1 = 1.5; // upper segment length
const L2 = 2.1; // lower segment length
const REACH = 2.1; // horizontal hip-to-foot distance
const FOOT_Y = 0.08;
const LIFT = 0.85;
const SWING_FRAC = 0.45;
const SWING_AMP = (15 * Math.PI) / 180;
const BOB = 0.05;

const bodyMat = material.pbr({ color: "#3a2a24", roughness: 0.55, metallic: 0.1 });
const legMat = material.pbr({ color: "#5b4437", roughness: 0.5, metallic: 0.1 });
const jointMat = material.pbr({ color: "#c0562a", roughness: 0.4, metallic: 0.1 });
const eyeMat = material.pbr({ color: "#f2f2f2", roughness: 0.2 });
const pupilMat = material.pbr({ color: "#050505", roughness: 0.2 });

let k = 0;
const nm = (p: string): string => `${p}${k++}`;

const segment = (len: number, r: number) =>
  primitives
    .capsule({ name: nm("seg"), size: [r * 2, len + r * 2, r * 2], material: legMat })
    .position(len / 2, 0, 0)
    .rotate(0, 0, -Math.PI / 2);

const ball = (d: number, pos: Vec3, mat = jointMat) => primitives.sphere({ name: nm("ball"), size: d, material: mat }).position(...pos);

// Leg frame: local +X points outward from the hip. Yaw group swings, "up" group elevates, "knee" group bends.
const legNode = (i: number, pos: Vec3) =>
  group(
    `leg${i}`,
    [
      group(`leg${i}-up`, [ball(0.34, [0, 0, 0]), segment(L1, 0.1), group(`leg${i}-knee`, [ball(0.3, [0, 0, 0]), segment(L2, 0.07)], { position: [L1, 0, 0] }).runtime({ id: `leg${i}-knee`, mutable: true })], {
        position: [0, 0, 0]
      }).runtime({ id: `leg${i}-up`, mutable: true })
    ],
    { position: pos }
  ).runtime({ id: `leg${i}`, mutable: true });

// Right-side base directions (radians in XZ plane, angle from +X toward +Z; +Z is forward), front to back.
const BASE = [(58 * Math.PI) / 180, (20 * Math.PI) / 180, (-18 * Math.PI) / 180, (-52 * Math.PI) / 180];

interface LegInfo {
  id: number;
  base: number;
  left: boolean;
  offset: number;
}
const legs: LegInfo[] = [];
for (let side = 0; side < 2; side += 1) {
  for (let i = 0; i < 4; i += 1) {
    legs.push({ id: side * 4 + i, base: BASE[i]!, left: side === 1, offset: ((i + side) % 2) * 0.5 });
  }
}

const hipPos = (l: LegInfo): Vec3 => {
  const th = l.left ? Math.PI - l.base : l.base;
  return [Math.cos(th) * HIP_R, BODY_H, Math.sin(th) * HIP_R];
};

const body = group(
  "body",
  [
    primitives.sphere({ name: "abdomen", size: [1.9, 1.6, 2.5], material: bodyMat }).position(0, 0.2, -1.45),
    primitives.sphere({ name: "thorax", size: [1.3, 0.95, 1.5], material: bodyMat }).position(0, 0, 0),
    primitives.sphere({ name: "head", size: [0.85, 0.7, 0.75], material: bodyMat }).position(0, 0.05, 0.85),
    primitives.sphere({ name: "stripe", size: [0.5, 0.35, 0.9], material: jointMat }).position(0, 0.95, -1.35),
    ball(0.26, [-0.2, 0.2, 1.17], eyeMat),
    ball(0.26, [0.2, 0.2, 1.17], eyeMat),
    ball(0.13, [-0.2, 0.2, 1.3], pupilMat),
    ball(0.13, [0.2, 0.2, 1.3], pupilMat),
    ball(0.16, [-0.38, 0.0, 1.1], eyeMat),
    ball(0.16, [0.38, 0.0, 1.1], eyeMat)
  ],
  { position: [0, BODY_H, 0] }
).runtime({ id: "body", mutable: true });

let sc = scene({ background: "#d8dbe0" })
  .camera(camera.perspective({ position: [7.5, 5.8, 8.5], target: [0, 1.0, -0.2], fov: 40, near: 0.5, far: 100 }))
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffffff", groundColor: "#9a9ea6", intensity: 0.9 }))
  .add(lights.directional({ position: [5, 10, 6], target: [0, 0, 0], intensity: 2.6, shadow: true }))
  .add(lights.directional({ position: [-6, 5, -4], target: [0, 0, 0], intensity: 0.7, color: "#dfe8ff" }))
  .add(primitives.plane({ name: "ground", size: [60, 1, 60], material: material.pbr({ color: "#e9eaed", roughness: 0.95 }) }))
  .add(body);
for (const l of legs) sc = sc.add(legNode(l.id, hipPos(l)));

const app = createAuraApp("#app", { scene: sc });

const TWO_PI = Math.PI * 2;
let t = 0;

app.onFrame((f) => {
  t += f.dt;
  const cyc = (t / PERIOD) % 1;
  // two bobs per cycle (one per diagonal step)
  const bob = BOB * Math.sin(TWO_PI * 2 * cyc);
  const hipY = BODY_H + bob;
  app.nodes.require("body").setPosition(0, hipY, 0);

  for (const l of legs) {
    const phase = (cyc + l.offset) % 1;
    let s: number; // -1 back .. +1 forward
    let lift = 0;
    if (phase < SWING_FRAC) {
      const u = phase / SWING_FRAC;
      s = -Math.cos(Math.PI * u);
      lift = Math.sin(Math.PI * u);
    } else {
      const u = (phase - SWING_FRAC) / (1 - SWING_FRAC);
      s = 1 - 2 * u;
    }
    const th = l.base + s * SWING_AMP;
    const yaw = l.left ? -(Math.PI - th) : -th;
    const hip = hipPos(l);
    const footY = FOOT_Y + lift * LIFT;
    const reach = REACH - 0.25 * lift;
    const dy = footY - hipY;
    const D = Math.min(Math.hypot(reach, dy), L1 + L2 - 0.01);
    const alpha = Math.atan2(dy, reach);
    const cosA = Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
    const a = alpha + Math.acos(cosA);
    const b = Math.atan2(dy - L1 * Math.sin(a), reach - L1 * Math.cos(a));
    app.nodes.require(`leg${l.id}`).setPosition(hip[0], hipY, hip[2]);
    app.nodes.require(`leg${l.id}`).setRotation(0, yaw, 0);
    app.nodes.require(`leg${l.id}-up`).setRotation(0, 0, a);
    app.nodes.require(`leg${l.id}-knee`).setRotation(0, 0, b - a);
  }
});

await app.ready();
window.__EVAL_READY__ = true;
