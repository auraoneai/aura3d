import { camera, createAuraApp, group, looks, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Walking spider built only from primitives. Every joint is a `group` whose origin is the pivot.
// Leg chain: hip (static yaw) > swing (yaw, forward/back) > lift (pitch, raise) > femur + knee (pitch) > tibia.
// Each joint rotates about a single axis, so Euler order never matters.

const PERIOD = 2; // seconds per full gait cycle (loop length)
const BODY_Y = 0.5; // body height above the ground
const SWING = 0.3; // forward/back sweep half-angle (rad)
const LIFT = 0.15; // extra hip pitch while a leg is in the air (rad)
const KNEE_FLEX = 0.32; // extra knee extension while a leg is in the air (rad)

const FEMUR_LEN = 0.55;
const TIBIA_LEN = 0.95;
const FEMUR_PITCH = (40 * Math.PI) / 180; // femur direction = (0, cos, sin): rises outward at 50 deg
const TIBIA_PITCH = (155 * Math.PI) / 180; // tibia direction points down and outward

const shell = material.pbr({ color: "#3b2a25", roughness: 0.45, metallic: 0.05 });
const legMat = material.pbr({ color: "#4d3b31", roughness: 0.5, metallic: 0.05 });
const jointMat = material.pbr({ color: "#d0702c", roughness: 0.4, metallic: 0.05 });
const spotMat = material.pbr({ color: "#e8a23a", roughness: 0.4 });
const eyeMat = material.pbr({ color: "#0b0b0d", roughness: 0.12, metallic: 0.2 });
const floorMat = material.pbr({ color: "#d8d9dd", roughness: 0.92, metallic: 0 });

const segment = (name: string, length: number, radius: number, mat = legMat) =>
  primitives.capsule({ name, size: [radius * 2, length, radius * 2], material: mat, castShadow: true }).position(0, length / 2, 0);

const ball = (name: string, d: number, mat = jointMat) =>
  primitives.sphere({ name, size: d, material: mat, castShadow: true });

interface LegSpec {
  readonly id: string;
  readonly side: 1 | -1; // +1 = +x side
  readonly index: number; // 0 front .. 3 back
}

const legAngles = [28, 62, 102, 142].map((d) => (d * Math.PI) / 180);
const legs: LegSpec[] = [];
for (const side of [1, -1] as const) {
  for (let index = 0; index < 4; index++) {
    legs.push({ id: `leg-${side > 0 ? "r" : "l"}${index}`, side, index });
  }
}

const buildLeg = (leg: LegSpec) => {
  const phi = (legAngles[leg.index] ?? 0) * leg.side;
  const kneePos: [number, number, number] = [0, FEMUR_LEN * Math.cos(FEMUR_PITCH), FEMUR_LEN * Math.sin(FEMUR_PITCH)];
  return group(`${leg.id}-hip`, [
    group(`${leg.id}-swing`, [
      group(`${leg.id}-lift`, [
        ball(`${leg.id}-coxa`, 0.15),
        group(`${leg.id}-femur`, [segment(`${leg.id}-femur-seg`, FEMUR_LEN, 0.048)], { rotation: [FEMUR_PITCH, 0, 0] }),
        group(`${leg.id}-knee`, [
          ball(`${leg.id}-knee-ball`, 0.115),
          group(`${leg.id}-tibia`, [
            segment(`${leg.id}-tibia-seg`, TIBIA_LEN, 0.032),
            ball(`${leg.id}-foot`, 0.075).position(0, TIBIA_LEN, 0)
          ], { rotation: [TIBIA_PITCH, 0, 0] })
        ], { position: kneePos }).runtime({ id: `${leg.id}-knee`, mutable: true })
      ]).runtime({ id: `${leg.id}-lift`, mutable: true })
    ]).runtime({ id: `${leg.id}-swing`, mutable: true })
  ], { position: [0.3 * Math.sin(phi), 0, 0.22 * Math.cos(phi)], rotation: [0, phi, 0] });
};

const body = group("spider-body", [
  primitives.sphere({ name: "cephalothorax", size: [0.72, 0.5, 0.82], material: shell, castShadow: true }).position(0, 0.02, 0.15),
  primitives.sphere({ name: "abdomen", size: [0.92, 0.82, 1.2], material: shell, castShadow: true }).position(0, 0.12, -0.72),
  primitives.sphere({ name: "spot-a", size: [0.3, 0.1, 0.22], material: spotMat }).position(0, 0.52, -0.5),
  primitives.sphere({ name: "spot-b", size: [0.24, 0.1, 0.2], material: spotMat }).position(0, 0.53, -0.82),
  primitives.sphere({ name: "spot-c", size: [0.17, 0.09, 0.16], material: spotMat }).position(0, 0.45, -1.14),
  primitives.sphere({ name: "eye-l1", size: 0.1, material: eyeMat }).position(-0.12, 0.17, 0.52),
  primitives.sphere({ name: "eye-r1", size: 0.1, material: eyeMat }).position(0.12, 0.17, 0.52),
  primitives.sphere({ name: "eye-l2", size: 0.07, material: eyeMat }).position(-0.24, 0.13, 0.42),
  primitives.sphere({ name: "eye-r2", size: 0.07, material: eyeMat }).position(0.24, 0.13, 0.42),
  primitives.capsule({ name: "fang-l", size: [0.07, 0.2, 0.07], material: jointMat, castShadow: true }).position(-0.1, -0.1, 0.55),
  primitives.capsule({ name: "fang-r", size: [0.07, 0.2, 0.07], material: jointMat, castShadow: true }).position(0.1, -0.1, 0.55),
  ...legs.map(buildLeg)
], { position: [0, BODY_Y, 0] }).runtime({ id: "spider-body", mutable: true });

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio"))
    .add(primitives.plane({ name: "floor", size: [16, 1, 16], material: floorMat, receiveShadow: true }))
    .add(body)
    .camera(camera.perspective({ position: [3.6, 2.7, 4.4], target: [0, 0.4, -0.15], fov: 36 })),
  ...looks.appOptions("product-studio")
});

// Gait: legs on opposite diagonals share a phase; the two groups are half a cycle apart.
// Within a cycle a leg swings forward and lifts for the first half, then plants and sweeps back for the second half.
const poseLeg = (leg: LegSpec, u: number): { swing: number; lift: number } => {
  const diagonal = (leg.index + (leg.side > 0 ? 0 : 1)) % 2;
  const p = (u + diagonal * 0.5) % 1;
  if (p < 0.5) {
    const q = p * 2;
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * q);
    return { swing: -SWING + 2 * SWING * eased, lift: Math.sin(Math.PI * q) };
  }
  const q = (p - 0.5) * 2;
  return { swing: SWING - 2 * SWING * q, lift: 0 };
};

type Handle = ReturnType<typeof app.nodes.require>;
interface LegHandles { readonly leg: LegSpec; readonly swing: Handle; readonly lift: Handle; readonly knee: Handle }
let handles: LegHandles[] | undefined;
let bodyHandle: Handle | undefined;
let time = 0;

const update = (): void => {
  if (!handles || !bodyHandle) {
    bodyHandle = app.nodes.require("spider-body");
    handles = legs.map((leg) => ({
      leg,
      swing: app.nodes.require(`${leg.id}-swing`),
      lift: app.nodes.require(`${leg.id}-lift`),
      knee: app.nodes.require(`${leg.id}-knee`)
    }));
  }
  const u = (time % PERIOD) / PERIOD;
  for (const h of handles) {
    const pose = poseLeg(h.leg, u);
    h.swing.setRotation(0, -h.leg.side * pose.swing, 0);
    h.lift.setRotation(-LIFT * pose.lift, 0, 0);
    h.knee.setRotation(-KNEE_FLEX * pose.lift, 0, 0);
  }
  // Two steps per cycle, so the body bobs twice per period.
  bodyHandle.setPosition(0, BODY_Y + 0.022 * Math.cos(4 * Math.PI * u), 0);
  bodyHandle.setRotation(0, 0, 0.025 * Math.sin(2 * Math.PI * u));
};

app.onFrame((frame) => {
  time += Math.min(frame.dt, 0.1);
  update();
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
