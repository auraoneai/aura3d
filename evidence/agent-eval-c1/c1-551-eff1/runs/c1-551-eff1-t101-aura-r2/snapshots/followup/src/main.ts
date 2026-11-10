import { camera, createAuraApp, group, looks, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { walking: boolean };
  }
}

const PERIOD = 2; // seconds per full gait cycle (loops seamlessly)
const BODY_H = 0.92; // body centre height above the ground
const HIP_R = 0.3; // hip joint offset from body centre
const L1 = 0.9; // upper leg segment length
const L2 = 1.35; // lower leg segment length
const STRIDE = 0.26; // yaw swing half-amplitude (radians)
const LIFT = 0.38; // foot lift height

const bodyMat = material.pbr({ color: "#3b2a24", roughness: 0.55, metallic: 0.05 });
const abdomenMat = material.pbr({ color: "#5a3a2c", roughness: 0.5, metallic: 0.05 });
const stripeMat = material.pbr({ color: "#d9892b", roughness: 0.5 });
const legMat = material.pbr({ color: "#2b2623", roughness: 0.45, metallic: 0.1 });
const jointMat = material.pbr({ color: "#d9892b", roughness: 0.4 });
const eyeMat = material.pbr({ color: "#f4f1ea", roughness: 0.2 });
const pupilMat = material.pbr({ color: "#0b0b0d", roughness: 0.2 });

// Legs are indexed 0..3 front to back on each side. Diagonal pairs share a phase.
interface LegSpec {
  id: string;
  right: boolean;
  psi0: number; // base yaw of the right-side mirror
  reach: number; // horizontal foot distance from the body centre
  phase: number;
}
const BASE = [-0.95, -0.36, 0.3, 0.88];
const REACH = [1.45, 1.7, 1.7, 1.5];
const legs: LegSpec[] = [];
for (let i = 0; i < 4; i += 1) {
  legs.push({ id: `r${i}`, right: true, psi0: BASE[i]!, reach: REACH[i]!, phase: i % 2 === 0 ? 0 : 0.5 });
  legs.push({ id: `l${i}`, right: false, psi0: BASE[i]!, reach: REACH[i]!, phase: i % 2 === 0 ? 0.5 : 0 });
}

// A limb segment along local +X from its joint.
const segment = (name: string, length: number, radius: number) =>
  primitives
    .capsule({ name, size: [radius * 2, length, radius * 2], material: legMat })
    .position(length / 2, 0, 0)
    .rotate(0, 0, -Math.PI / 2);

const buildLeg = (spec: LegSpec) =>
  group(`${spec.id}-yaw`, [
    group(`${spec.id}-hip`, [
      primitives.sphere({ name: `${spec.id}-hip-ball`, size: 0.2, material: jointMat }),
      segment(`${spec.id}-upper`, L1, 0.065),
      group(`${spec.id}-knee`, [
        primitives.sphere({ name: `${spec.id}-knee-ball`, size: 0.17, material: jointMat }),
        segment(`${spec.id}-lower`, L2, 0.045),
        primitives.sphere({ name: `${spec.id}-foot`, size: 0.1, material: pupilMat }).position(L2, 0, 0)
      ], { position: [L1, 0, 0] }).runtime({ id: `${spec.id}-knee`, mutable: true })
    ], { position: [HIP_R, 0, 0] }).runtime({ id: `${spec.id}-hip`, mutable: true })
  ]).runtime({ id: `${spec.id}-yaw`, mutable: true });

const eye = (x: number, y: number, z: number, s: number) => [
  primitives.sphere({ name: "eye", size: s, material: eyeMat }).position(x, y, z),
  primitives.sphere({ name: "pupil", size: s * 0.55, material: pupilMat }).position(x * 1.04, y + s * 0.02, z + s * 0.33)
];

const spider = group("spider", [
  group("body", [
    primitives.sphere({ name: "cephalothorax", size: [0.95, 0.65, 1.1], material: bodyMat }).position(0, 0, 0.1),
    primitives.sphere({ name: "abdomen", size: [1.25, 1.1, 1.5], material: abdomenMat }).position(0, 0.12, -0.95),
    primitives.sphere({ name: "stripe-a", size: [0.5, 0.2, 0.5], material: stripeMat }).position(0, 0.66, -0.9),
    primitives.sphere({ name: "stripe-b", size: [0.4, 0.17, 0.4], material: stripeMat }).position(0, 0.58, -1.35),
    primitives.sphere({ name: "head", size: [0.55, 0.45, 0.45], material: bodyMat }).position(0, 0.02, 0.68),
    primitives.cone({ name: "fang-l", size: [0.09, 0.22, 0.09], material: stripeMat }).position(-0.12, -0.25, 0.92).rotate(Math.PI, 0, 0),
    primitives.cone({ name: "fang-r", size: [0.09, 0.22, 0.09], material: stripeMat }).position(0.12, -0.25, 0.92).rotate(Math.PI, 0, 0),
    ...eye(-0.13, 0.17, 0.86, 0.13),
    ...eye(0.13, 0.17, 0.86, 0.13),
    ...eye(-0.27, 0.12, 0.78, 0.09),
    ...eye(0.27, 0.12, 0.78, 0.09),
    ...legs.map(buildLeg)
  ], { position: [0, BODY_H, 0] }).runtime({ id: "body", mutable: true })
]);

const ground = primitives.plane({
  name: "floor",
  size: [24, 1, 24],
  material: material.pbr({ color: "#d9dbe0", roughness: 0.95 })
});

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio", { exposureEv: -0.8 }))
    .add(ground)
    .add(spider)
    .camera(camera.perspective({ position: [3.7, 3.0, 4.5], target: [0.25, 0.45, 0], fov: 38 })),
  ...looks.appOptions("product-studio")
});

const smooth = (x: number): number => x * x * (3 - 2 * x);

// Two-bone IK in the leg plane. Hip at the origin, target (x, y). Knee bends upward.
// Returns [upper angle, knee relative angle] as rotations about the local Z axis.
const solveLeg = (x: number, y: number): [number, number] => {
  const d = Math.min(Math.hypot(x, y), L1 + L2 - 0.005);
  const beta = Math.atan2(y, x);
  const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const a = beta + alpha;
  const kx = L1 * Math.cos(a);
  const ky = L1 * Math.sin(a);
  const lower = Math.atan2(y - ky, x - kx);
  return [a, lower - a];
};

const update = (time: number): void => {
  const cycle = time / PERIOD;
  // Two steps per cycle (one per diagonal group): body dips as legs change over.
  const bob = 0.035 * Math.cos(cycle * Math.PI * 4);
  const h = BODY_H + bob;
  app.nodes.require("body").setPosition(0, h, 0).setRotation(0, 0, 0.012 * Math.sin(cycle * Math.PI * 2));

  for (const leg of legs) {
    const u = (((cycle + leg.phase) % 1) + 1) % 1;
    let swing: number; // forward displacement, -1 (back) .. 1 (front)
    let lift = 0;
    if (u < 0.5) {
      const w = u / 0.5; // swing phase: lift, move forward, plant
      swing = -1 + 2 * smooth(w);
      lift = LIFT * Math.sin(Math.PI * w);
    } else {
      const w = (u - 0.5) / 0.5; // stance phase: foot drags backwards on the ground
      swing = 1 - 2 * w;
    }
    const psiRight = leg.psi0 - STRIDE * swing;
    const psi = leg.right ? psiRight : Math.PI - psiRight;
    const [upper, knee] = solveLeg(leg.reach - HIP_R, -h + lift + 0.05);
    app.nodes.require(`${leg.id}-yaw`).setRotation(0, psi, 0);
    app.nodes.require(`${leg.id}-hip`).setRotation(0, 0, upper);
    app.nodes.require(`${leg.id}-knee`).setRotation(0, 0, knee);
  }
};

const state = { walking: true };
window.__TASK_STATE__ = state;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (!e.repeat) {
      state.walking = !state.walking;
    }
  }
});

// Animation clock advances only while walking, so pausing freezes the pose and resuming continues from it.
let animTime = 0;
update(0);
let first = true;
app.onFrame((f) => {
  if (state.walking) {
    animTime += f.dt;
    update(animTime);
  }
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});
void app.ready();
