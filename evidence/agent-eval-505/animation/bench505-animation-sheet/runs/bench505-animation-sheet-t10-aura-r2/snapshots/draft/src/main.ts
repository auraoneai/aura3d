import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const PERIOD = 2; // seconds per full gait cycle
const BODY_Y = 0.85; // body height above ground
const L1 = 1.0; // femur length
const L2 = 1.3; // tibia length
const STRIDE = 0.32; // half stride length along the walking direction (+X)
const LIFT = 0.45; // foot lift height during swing
const FOOT_Y = 0.05; // foot centre height when planted

type Kids = Parameters<typeof group>[1];
const J = (id: string, position: [number, number, number], kids: Kids) =>
  group(id, kids, { position }).runtime({ id, mutable: true });

const shell = material.pbr({ color: "#2d2420", roughness: 0.45, metallic: 0.1 });
const shellLight = material.pbr({ color: "#5a3a28", roughness: 0.5, metallic: 0.1 });
const legMat = material.pbr({ color: "#3a2c24", roughness: 0.5, metallic: 0.1 });
const jointMat = material.pbr({ color: "#c9772f", roughness: 0.4 });
const eyeMat = material.pbr({ color: "#e8e8e8", roughness: 0.2 });

// Leg layout: hip x/z offsets on the body, and planted-foot rest position (body frame).
const HIP_X = [0.34, 0.12, -0.1, -0.32];
const FOOT_X = [1.05, 0.6, -0.4, -1.0];
const FOOT_Z = [1.5, 1.8, 1.8, 1.55];
// Alternating gait: leg index parity combined with side picks the diagonal group.
const legs: { id: string; side: number; i: number; hx: number; hz: number; fx: number; fz: number; offset: number }[] = [];
for (const side of [1, -1]) {
  for (let i = 0; i < 4; i += 1) {
    legs.push({
      id: `${side > 0 ? "r" : "l"}${i}`,
      side,
      i,
      hx: HIP_X[i]!,
      hz: side * 0.24,
      fx: FOOT_X[i]!,
      fz: side * FOOT_Z[i]!,
      offset: (i + (side > 0 ? 0 : 1)) % 2 === 0 ? 0 : 0.5
    });
  }
}

const segment = (name: string, len: number, r: number) =>
  primitives
    .capsule({ name, size: [r * 2, len, r * 2], material: legMat })
    .rotate(0, 0, Math.PI / 2)
    .position(len / 2, 0, 0);

const legNode = (l: (typeof legs)[number]) =>
  J(`yaw-${l.id}`, [l.hx, -0.05, l.hz], [
    primitives.sphere({ name: `hip-ball-${l.id}`, size: 0.2, material: jointMat }),
    J(`hip-${l.id}`, [0, 0, 0], [
      segment(`femur-${l.id}`, L1, 0.07),
      J(`knee-${l.id}`, [L1, 0, 0], [
        primitives.sphere({ name: `knee-ball-${l.id}`, size: 0.17, material: jointMat }),
        segment(`tibia-${l.id}`, L2, 0.05),
        primitives.sphere({ name: `foot-${l.id}`, size: 0.11, material: jointMat }).position(L2, 0, 0)
      ])
    ])
  ]);

const spider = J("spider", [0, BODY_Y, 0], [
  primitives.sphere({ name: "abdomen", size: 1, material: shell }).scale([1.15, 0.8, 0.9]).position(-0.62, 0.12, 0),
  primitives.sphere({ name: "abdomen-spot", size: 1, material: shellLight }).scale([0.5, 0.2, 0.4]).position(-0.62, 0.5, 0),
  primitives.sphere({ name: "thorax", size: 1, material: shell }).scale([0.8, 0.5, 0.6]).position(0.12, 0.02, 0),
  primitives.sphere({ name: "head", size: 1, material: shellLight }).scale([0.38, 0.34, 0.4]).position(0.62, 0.05, 0),
  primitives.sphere({ name: "eye-l", size: 0.1, material: eyeMat }).position(0.8, 0.14, -0.1),
  primitives.sphere({ name: "eye-r", size: 0.1, material: eyeMat }).position(0.8, 0.14, 0.1),
  primitives.sphere({ name: "eye-l2", size: 0.06, material: eyeMat }).position(0.78, 0.25, -0.06),
  primitives.sphere({ name: "eye-r2", size: 0.06, material: eyeMat }).position(0.78, 0.25, 0.06),
  ...legs.map(legNode)
]);

const sc = scene({ background: "#d9dde2" })
  .camera(camera.perspective({ position: [5.2, 3.6, 5.6], target: [0, 0.55, 0], fov: 40, near: 0.1, far: 100 }))
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#f4f6fa", groundColor: "#a9adb3", intensity: 0.9 }))
  .add(lights.directional({ position: [4, 8, 3], target: [0, 0, 0], intensity: 2.6, shadow: true }))
  .add(effects.fog({ color: "#d9dde2", density: 0.012 }))
  .add(primitives.plane({ name: "ground", size: [80, 1, 80], material: material.pbr({ color: "#e4e6e9", roughness: 0.95 }) }))
  .add(spider);

const app = createAuraApp("#app", { scene: sc });

const smooth = (x: number): number => x * x * (3 - 2 * x);

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const cyc = (t / PERIOD) * Math.PI * 2;
  // Two steps per cycle (one per diagonal group): bob at twice the gait frequency.
  const bodyY = BODY_Y + 0.045 * Math.cos(2 * cyc);
  app.nodes.require("spider").setPosition(0, bodyY, 0).setRotation(0.02 * Math.sin(cyc), 0, 0.015 * Math.cos(cyc));

  for (const l of legs) {
    const q = (((t / PERIOD + l.offset) % 1) + 1) % 1;
    let footX: number;
    let lift = 0;
    if (q < 0.5) {
      // stance: foot stays on the ground, sliding backward relative to the body
      footX = l.fx + STRIDE * (1 - 2 * (q / 0.5));
    } else {
      // swing: lift, move forward, plant
      const w = (q - 0.5) / 0.5;
      footX = l.fx + STRIDE * (-1 + 2 * smooth(w));
      lift = LIFT * Math.sin(Math.PI * w);
    }
    const dx = footX - l.hx;
    const dz = l.fz - l.hz;
    const dy = FOOT_Y + lift - (bodyY - 0.05);
    const r = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dz, dx);
    const d = Math.min(Math.max(Math.hypot(r, dy), Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.01);
    const beta = Math.atan2(dy, r);
    const alpha = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const gamma = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
    app.nodes.require(`yaw-${l.id}`).setRotation(0, yaw, 0);
    app.nodes.require(`hip-${l.id}`).setRotation(0, 0, beta + alpha);
    app.nodes.require(`knee-${l.id}`).setRotation(0, 0, -(Math.PI - gamma));
  }
});

await app.ready();
window.__EVAL_READY__ = true;
