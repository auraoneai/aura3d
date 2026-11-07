import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Walking spider built only from primitives, with a joint hierarchy per leg:
// root (static yaw) > yaw joint > pitch joint (hip) > knee joint. Each frame a
// foot target is computed in body space and solved with analytic IK, so planted
// feet stay on the ground while the body bobs.
// ---------------------------------------------------------------------------

const PERIOD = 2; // seconds per full gait cycle (seamless loop)
const BODY_H = 0.78; // rest height of the body centre above the ground
const HIP_Y = -0.05; // hip height relative to the body centre
const FEMUR = 0.95;
const TIBIA = 1.45;
const STRIDE = 0.42; // half stride length along the body's forward axis (+z)
const LIFT = 0.5; // peak foot lift while swinging
const FOOT_R = 0.05;
const BOB = 0.035;

const bodyMat = material.pbr({ color: "#2c2320", roughness: 0.45, metallic: 0.1 });
const legMat = material.pbr({ color: "#3b2c25", roughness: 0.5, metallic: 0.1 });
const jointMat = material.pbr({ color: "#d9792b", roughness: 0.4, metallic: 0.1 });
const eyeMat = material.pbr({ color: "#0b0b0d", roughness: 0.1, metallic: 0.3 });
const fangMat = material.pbr({ color: "#e8dcc8", roughness: 0.5 });
const marking = material.pbr({ color: "#d9792b", roughness: 0.5 });

interface LegSpec {
  readonly id: string;
  readonly hip: readonly [number, number, number];
  readonly dir: readonly [number, number]; // horizontal outward direction (x, z), normalised
  readonly reach: number; // horizontal hip-to-foot distance at rest
  readonly yaw: number; // static yaw of the leg root
  readonly phaseOffset: number; // 0 or 0.5: which diagonal the leg belongs to
}

const rows: ReadonlyArray<{ z: number; dir: readonly [number, number]; reach: number }> = [
  { z: 0.5, dir: [0.55, 0.835], reach: 1.35 },
  { z: 0.3, dir: [0.95, 0.31], reach: 1.6 },
  { z: 0.1, dir: [0.95, -0.31], reach: 1.65 },
  { z: -0.1, dir: [0.6, -0.8], reach: 1.7 }
];

const legs: LegSpec[] = [];
rows.forEach((row, i) => {
  for (const side of [1, -1] as const) {
    const len = Math.hypot(row.dir[0], row.dir[1]);
    const dx = (row.dir[0] / len) * side;
    const dz = row.dir[1] / len;
    legs.push({
      id: `${side === 1 ? "r" : "l"}${i}`,
      hip: [0.28 * side, HIP_Y, row.z],
      dir: [dx, dz],
      reach: row.reach,
      yaw: Math.atan2(-dz, dx),
      // Diagonal pairs move together: (right, row 0), (left, row 1), (right, row 2), (left, row 3) vs the rest.
      phaseOffset: (i + (side === 1 ? 0 : 1)) % 2 === 0 ? 0 : 0.5
    });
  }
});

// A cylinder lying along the local +x axis, starting at the joint origin.
const bone = (name: string, length: number, thickness: number, mat: typeof legMat) =>
  primitives
    .cylinder({ name, size: [thickness, length, thickness], material: mat })
    .rotate(0, 0, Math.PI / 2)
    .position(length / 2, 0, 0);

const buildLeg = (leg: LegSpec) =>
  group(
    `${leg.id}-root`,
    [
      group(
        `${leg.id}-yaw`,
        [
          primitives.sphere({ name: `${leg.id}-coxa`, size: 0.2, material: jointMat }),
          group(
            `${leg.id}-hip`,
            [
              bone(`${leg.id}-femur`, FEMUR, 0.12, legMat),
              group(
                `${leg.id}-knee`,
                [
                  primitives.sphere({ name: `${leg.id}-knee-ball`, size: 0.17, material: jointMat }),
                  bone(`${leg.id}-tibia`, TIBIA, 0.075, legMat),
                  primitives.sphere({ name: `${leg.id}-foot`, size: FOOT_R * 2, material: bodyMat }).position(TIBIA, 0, 0)
                ],
                { position: [FEMUR, 0, 0] }
              ).runtime({ id: `${leg.id}-knee`, mutable: true })
            ],
            { position: [0, 0, 0] }
          ).runtime({ id: `${leg.id}-hip`, mutable: true })
        ],
        { position: [0, 0, 0] }
      ).runtime({ id: `${leg.id}-yaw`, mutable: true })
    ],
    { position: [leg.hip[0], leg.hip[1], leg.hip[2]] }
  ).rotate(0, leg.yaw, 0);

// Abdomen ellipsoid: centre (0, 0.2, -0.85), radii (0.52, 0.45, 0.68). Spots sit on its upper surface.
const abdomenSpots = [-0.35, 0, 0.35].map((dz, i) => {
  const k = 1 - (dz / 0.68) ** 2;
  const y = 0.2 + 0.45 * Math.sqrt(Math.max(0, k)) - 0.015;
  const w = 0.2 - Math.abs(dz) * 0.2;
  return primitives.sphere({ name: `spot-${i}`, size: [w, 0.07, w + 0.06], material: marking }).position(0, y, -0.85 + dz);
});

const body = group(
  "body",
  [
    primitives.sphere({ name: "cephalothorax", size: [0.85, 0.52, 0.95], material: bodyMat }).position(0, 0, 0.25),
    primitives.sphere({ name: "pedicel", size: 0.25, material: legMat }).position(0, 0.06, -0.25),
    primitives.sphere({ name: "abdomen", size: [1.04, 0.9, 1.36], material: bodyMat }).position(0, 0.2, -0.85),
    ...abdomenSpots,
    primitives.sphere({ name: "eye-l", size: 0.12, material: eyeMat }).position(-0.12, 0.17, 0.66),
    primitives.sphere({ name: "eye-r", size: 0.12, material: eyeMat }).position(0.12, 0.17, 0.66),
    primitives.sphere({ name: "eye-l2", size: 0.08, material: eyeMat }).position(-0.26, 0.15, 0.55),
    primitives.sphere({ name: "eye-r2", size: 0.08, material: eyeMat }).position(0.26, 0.15, 0.55),
    primitives.cone({ name: "fang-l", size: [0.07, 0.2, 0.07], material: fangMat }).rotate(Math.PI, 0, 0).position(-0.1, -0.2, 0.7),
    primitives.cone({ name: "fang-r", size: [0.07, 0.2, 0.07], material: fangMat }).rotate(Math.PI, 0, 0).position(0.1, -0.2, 0.7),
    primitives.sphere({ name: "palp-l", size: 0.11, material: jointMat }).position(-0.22, -0.12, 0.72),
    primitives.sphere({ name: "palp-r", size: 0.11, material: jointMat }).position(0.22, -0.12, 0.72),
    ...legs.map(buildLeg)
  ],
  { position: [0, BODY_H, 0] }
).runtime({ id: "body", mutable: true });

const BG = "#d8dbe0";

const app = createAuraApp("#app", {
  scene: scene({ background: BG })
    .add(environments.neutral({ intensity: 0.9, background: false }))
    .add(lights.hemisphere({ skyColor: "#f4f6fa", groundColor: "#9a9ca2", intensity: 0.7 }))
    .add(lights.directional({ name: "key", position: [4, 8, 4.5], target: [0, 0, 0], intensity: 2.6, color: "#fff4e6", shadow: true }))
    .add(lights.directional({ name: "fill", position: [-6, 3, 2], target: [0, 0.5, 0], intensity: 0.9, color: "#cfdcff" }))
    .add(lights.directional({ name: "rim", position: [-3, 4, -6], target: [0, 0.5, 0], intensity: 1.0, color: "#ffffff" }))
    .add(primitives.plane({ name: "ground", size: [160, 1, 160], material: material.pbr({ color: "#d2d5da", roughness: 0.95 }), receiveShadow: true, castShadow: false }))
    .add(body)
    .camera(camera.perspective({ position: [5.2, 4.6, 6.4], target: [0, 0.55, -0.1], fov: 40 }))
});

const smooth = (x: number): number => x * x * (3 - 2 * x);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

function pose(t: number): void {
  const cycle = t / PERIOD;
  const bob = -BOB * Math.cos(4 * Math.PI * cycle); // lowest when diagonals hand over, two dips per cycle
  const bodyY = BODY_H + bob;
  app.nodes.require("body").setPosition(0, bodyY, 0);

  for (const leg of legs) {
    let u = (cycle + leg.phaseOffset) % 1;
    if (u < 0) u += 1;

    let s: number;
    let lift = 0;
    if (u < 0.5) {
      const q = u / 0.5; // swing: lift, move forward, plant
      s = -STRIDE + 2 * STRIDE * smooth(q);
      lift = LIFT * Math.sin(Math.PI * q);
    } else {
      const q = (u - 0.5) / 0.5; // stance: foot stays planted, body moves forward relative to it
      s = STRIDE - 2 * STRIDE * q;
    }

    // Foot target relative to the hip, in body axes.
    const wx = leg.dir[0] * leg.reach;
    const wz = leg.dir[1] * leg.reach + s;
    const wy = FOOT_R - bodyY - leg.hip[1] + lift;

    // Into the leg root frame (rotated by the static yaw about y).
    const c = Math.cos(leg.yaw);
    const sn = Math.sin(leg.yaw);
    const lx = c * wx - sn * wz;
    const lz = sn * wx + c * wz;

    const yawJoint = Math.atan2(-lz, lx);
    const r = Math.hypot(lx, lz);
    const dist = clamp(Math.hypot(r, wy), Math.abs(FEMUR - TIBIA) + 0.02, FEMUR + TIBIA - 0.02);
    const cosK = clamp((dist * dist - FEMUR * FEMUR - TIBIA * TIBIA) / (2 * FEMUR * TIBIA), -1, 1);
    const knee = -Math.acos(cosK); // knee bends downward
    const hip = Math.atan2(wy, r) - Math.atan2(TIBIA * Math.sin(knee), FEMUR + TIBIA * Math.cos(knee));

    app.nodes.require(`${leg.id}-yaw`).setRotation(0, yawJoint, 0);
    app.nodes.require(`${leg.id}-hip`).setRotation(0, 0, hip);
    app.nodes.require(`${leg.id}-knee`).setRotation(0, 0, knee);
  }
}

const start = performance.now();
let signalled = false;
app.onFrame(() => {
  pose((performance.now() - start) / 1000);
  if (!signalled) {
    signalled = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
