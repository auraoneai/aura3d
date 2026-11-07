import { camera, createAuraApp, group, looks, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------------------------
// Spider built only from primitives. Every leg is a chain of joint groups:
//   yaw group (turns the leg around the vertical axis) -> hip group (femur) -> knee group (tibia).
// Each group rotates about a single axis, so Euler order never matters. A segment hangs down
// from its joint (-Y); a rotation about Z by theta points it toward (sin theta, -cos theta).
// The leg tips follow a gait path in body space and a two-link IK turns that into joint angles.
// ---------------------------------------------------------------------------------------------

const PERIOD = 2; // seconds per full gait cycle (loops seamlessly)
const BODY_HEIGHT = 0.62; // body centre above the ground
const L1 = 0.65; // femur length
const L2 = 1.0; // tibia length
const STRIDE = 0.26; // half stroke of a foot along the body axis
const LIFT = 0.3; // foot lift during swing
const BOB = 0.035; // body bob amplitude

const bodyMat = material.pbr({ color: "#2b2623", roughness: 0.55, metallic: 0.1 });
const markMat = material.pbr({ color: "#c2541d", roughness: 0.5, metallic: 0.05 });
const legMat = material.pbr({ color: "#3a322d", roughness: 0.6, metallic: 0.1 });
const jointMat = material.pbr({ color: "#c2541d", roughness: 0.5, metallic: 0.05 });
const eyeMat = material.pbr({ color: "#f4f1ea", roughness: 0.2, metallic: 0 });
const floorMat = material.pbr({ color: "#d9dadd", roughness: 0.95, metallic: 0 });

interface LegSpec {
  readonly id: string;
  readonly side: 1 | -1; // +1 = +X (spider's left when facing +Z)
  readonly hip: readonly [number, number]; // hip x, z in body space
  readonly rest: readonly [number, number]; // rest foot x, z in body space
  readonly phase: number; // 0 or 0.5: diagonal gait group
}

const rows: ReadonlyArray<{ hipZ: number; footZ: number }> = [
  { hipZ: 0.32, footZ: 0.85 },
  { hipZ: 0.16, footZ: 0.38 },
  { hipZ: 0.0, footZ: -0.2 },
  { hipZ: -0.16, footZ: -0.72 }
];

const legs: LegSpec[] = [];
for (const side of [1, -1] as const) {
  rows.forEach((row, i) => {
    // Diagonal pairs move together: (side +, row even) and (side -, row odd) share a phase.
    const diagonalA = (side === 1) === (i % 2 === 0);
    legs.push({
      id: `leg-${side === 1 ? "l" : "r"}${i}`,
      side,
      hip: [side * 0.2, row.hipZ],
      rest: [side * 1.0, row.footZ],
      phase: diagonalA ? 0 : 0.5
    });
  });
}

const segment = (name: string, length: number, radius: number) =>
  primitives
    .capsule({ name, size: [radius * 2, length, radius * 2], material: legMat, castShadow: true })
    .position(0, -length / 2, 0);

const buildLeg = (leg: LegSpec) =>
  group(
    `${leg.id}-yaw`,
    [
      group(
        `${leg.id}-hip`,
        [
          primitives.sphere({ name: `${leg.id}-hip-ball`, size: 0.17, material: jointMat, castShadow: true }),
          segment(`${leg.id}-femur`, L1, 0.045),
          group(
            `${leg.id}-knee`,
            [
              primitives.sphere({ name: `${leg.id}-knee-ball`, size: 0.14, material: jointMat, castShadow: true }),
              segment(`${leg.id}-tibia`, L2, 0.032),
              primitives.sphere({ name: `${leg.id}-foot`, size: 0.07, material: bodyMat, castShadow: true }).position(0, -L2, 0)
            ],
            { position: [0, -L1, 0] }
          ).runtime({ id: `${leg.id}-knee`, mutable: true })
        ]
      ).runtime({ id: `${leg.id}-hip`, mutable: true })
    ],
    { position: [leg.hip[0], 0, leg.hip[1]] }
  ).runtime({ id: `${leg.id}-yaw`, mutable: true });

const eye = (name: string, x: number, y: number, z: number, size: number) =>
  primitives.sphere({ name, size, material: eyeMat, castShadow: true }).position(x, y, z);

const spider = group(
  "spider",
  [
    // Body: abdomen, cephalothorax, head plate, eyes, fangs.
    primitives.sphere({ name: "abdomen", size: [0.8, 0.68, 1.0], material: bodyMat, castShadow: true }).position(0, 0.04, -0.62),
    primitives.sphere({ name: "abdomen-mark", size: [0.5, 0.3, 0.55], material: markMat, castShadow: true }).position(0, 0.26, -0.62),
    primitives.sphere({ name: "thorax", size: [0.58, 0.42, 0.62], material: bodyMat, castShadow: true }).position(0, 0, 0.1),
    primitives.sphere({ name: "head", size: [0.38, 0.32, 0.34], material: legMat, castShadow: true }).position(0, 0.02, 0.45),
    eye("eye-l", 0.09, 0.1, 0.6, 0.09),
    eye("eye-r", -0.09, 0.1, 0.6, 0.09),
    eye("eye-l2", 0.17, 0.06, 0.55, 0.06),
    eye("eye-r2", -0.17, 0.06, 0.55, 0.06),
    primitives.cone({ name: "fang-l", size: [0.05, 0.16, 0.05], material: markMat, castShadow: true }).position(0.07, -0.12, 0.62),
    primitives.cone({ name: "fang-r", size: [0.05, 0.16, 0.05], material: markMat, castShadow: true }).position(-0.07, -0.12, 0.62),
    ...legs.map(buildLeg)
  ],
  { position: [0, BODY_HEIGHT, 0] }
).runtime({ id: "spider", mutable: true });

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio"))
    .add(primitives.plane({ name: "ground", size: [40, 1, 40], material: floorMat, receiveShadow: true }))
    .add(spider)
    .camera(camera.perspective({ position: [3.2, 2.5, 4.0], target: [0, 0.4, 0], fov: 38 })),
  ...looks.appOptions("product-studio")
});

const smooth = (x: number) => x * x * (3 - 2 * x);

const pose = (time: number) => {
  const cycle = time / PERIOD;
  // Two steps per cycle (one per diagonal group), so the body bobs at twice the gait rate.
  const bodyY = BODY_HEIGHT + BOB * Math.cos(cycle * Math.PI * 4);
  app.nodes.require("spider").setPosition(0, bodyY, 0);

  for (const leg of legs) {
    const u = (((cycle + leg.phase) % 1) + 1) % 1;
    let z: number;
    let lift: number;
    if (u < 0.5) {
      // swing: foot leaves the ground, moves forward, plants again
      const w = u / 0.5;
      z = -STRIDE + 2 * STRIDE * smooth(w);
      lift = Math.sin(Math.PI * w) * LIFT;
    } else {
      // stance: foot stays planted while the body moves forward over it
      const w = (u - 0.5) / 0.5;
      z = STRIDE - 2 * STRIDE * w;
      lift = 0;
    }

    // Foot target relative to the hip (hip is at body origin height).
    const dx = leg.rest[0] - leg.hip[0];
    const dz = leg.rest[1] + z - leg.hip[1];
    const r = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dz, dx);
    const h = -bodyY + lift; // ground is at world y = 0

    // Two-link IK in the leg plane, knee pointing up.
    const maxReach = L1 + L2 - 0.001;
    const minReach = Math.abs(L1 - L2) + 0.001;
    const d = Math.min(maxReach, Math.max(minReach, Math.hypot(r, h)));
    const phi = Math.atan2(r, -h);
    const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    const alpha = Math.acos(Math.min(1, Math.max(-1, cosA)));
    const theta1 = phi + alpha;
    const kx = L1 * Math.sin(theta1);
    const ky = -L1 * Math.cos(theta1);
    const theta2 = Math.atan2(r - kx, -(h - ky)) - theta1;

    app.nodes.require(`${leg.id}-yaw`).setRotation(0, yaw, 0);
    app.nodes.require(`${leg.id}-hip`).setRotation(0, 0, theta1);
    app.nodes.require(`${leg.id}-knee`).setRotation(0, 0, theta2);
  }
};

let t = 0;
app.onFrame((frame) => {
  t += Math.min(frame.dt, 0.1);
  pose(t);
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
