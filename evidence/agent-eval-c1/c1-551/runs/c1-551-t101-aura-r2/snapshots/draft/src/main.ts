// Walking spider built only from primitives and group joints. One clock drives all joints; period 2 s.
import { camera, createAuraApp, group, looks, material, primitives, scene } from "@aura3d/engine";

const LOOK_ID = "product-studio" as const;
const PERIOD = 2; // seconds per full gait cycle
const TAU = Math.PI * 2;

const bodyMat = material.pbr({ color: "#3a2a24", roughness: 0.55, metallic: 0.05 });
const abdomenMat = material.pbr({ color: "#5a3a2a", roughness: 0.6, metallic: 0.05 });
const legMat = material.pbr({ color: "#2b2420", roughness: 0.5, metallic: 0.1 });
const jointMat = material.pbr({ color: "#c8562a", roughness: 0.45 });
const eyeMat = material.pbr({ color: "#f2f2ee", roughness: 0.2 });
const pupilMat = material.pbr({ color: "#0a0a0a", roughness: 0.2 });
const markMat = material.pbr({ color: "#d9a441", roughness: 0.5 });

const UPPER = 0.75;
const LOWER = 1.1;
const HIP_Y = 0.78;
const UPPER_ANGLE = 1.9; // rad about local z: segment hangs down at 0, points outward and up here
const LOWER_ANGLE = -1.5; // relative to the upper segment: folds the lower segment back down

// Segment hangs along -y from its joint.
const segment = (name: string, length: number, radius: number) =>
  primitives.capsule({ name, size: [radius * 2, length, radius * 2], material: legMat, castShadow: true }).position(0, -length / 2, 0);

// Hip hierarchy: yaw (swing about vertical) > lift (rotation about z) > knee.
const leg = (id: string, x: number, z: number) =>
  group(`${id}-yaw`, [
    group(`${id}-lift`, [
      primitives.sphere({ name: `${id}-hip-ball`, size: 0.2, material: jointMat, castShadow: true }),
      segment(`${id}-upper`, UPPER, 0.055),
      group(`${id}-knee`, [
        primitives.sphere({ name: `${id}-knee-ball`, size: 0.17, material: jointMat, castShadow: true }),
        segment(`${id}-lower`, LOWER, 0.04),
        primitives.sphere({ name: `${id}-foot`, size: 0.09, material: jointMat, castShadow: true }).position(0, -LOWER, 0)
      ], { position: [0, -UPPER, 0] }).runtime({ id: `${id}-knee`, mutable: true })
    ]).runtime({ id: `${id}-lift`, mutable: true })
  ], { position: [x, HIP_Y, z] }).runtime({ id: `${id}-yaw`, mutable: true });

interface LegDef { id: string; side: 1 | -1; base: number; group: 0 | 1; x: number; z: number }

// Base yaw (rad): negative points toward +z (the spider's front) on the right side.
const BASES = [-0.95, -0.3, 0.3, 0.85];
const ZS = [0.5, 0.28, 0.06, -0.16];
const legs: LegDef[] = [];
for (let k = 0; k < 4; k += 1) {
  for (const side of [1, -1] as const) {
    legs.push({
      id: `${side === 1 ? "r" : "l"}${k}`,
      side,
      base: BASES[k]!,
      // Diagonal pairs: right-front with left-second with right-third with left-rear, and the opposite set.
      group: ((k + (side === 1 ? 0 : 1)) % 2) as 0 | 1,
      x: side * 0.24,
      z: ZS[k]!
    });
  }
}

const eye = (x: number, y: number, z: number, s: number) => [
  primitives.sphere({ name: `eye-${x}-${y}`, size: s, material: eyeMat }).position(x, y, z),
  primitives.sphere({ name: `pupil-${x}-${y}`, size: s * 0.55, material: pupilMat }).position(x * 1.05, y + s * 0.02, z + s * 0.32)
];

const spider = group("spider", [
  group("body", [
    primitives.sphere({ name: "cephalothorax", size: [0.62, 0.42, 0.9], material: bodyMat, castShadow: true }).position(0, HIP_Y + 0.02, 0.2),
    primitives.sphere({ name: "head", size: [0.4, 0.3, 0.3], material: bodyMat, castShadow: true }).position(0, HIP_Y + 0.05, 0.68),
    primitives.sphere({ name: "abdomen", size: [0.85, 0.7, 1.15], material: abdomenMat, castShadow: true }).position(0, HIP_Y + 0.12, -0.7),
    primitives.sphere({ name: "mark-a", size: [0.22, 0.12, 0.34], material: markMat }).position(0, HIP_Y + 0.46, -0.62),
    primitives.sphere({ name: "mark-b", size: [0.14, 0.1, 0.22], material: markMat }).position(0, HIP_Y + 0.4, -1.0),
    ...eye(-0.09, HIP_Y + 0.15, 0.8, 0.12),
    ...eye(0.09, HIP_Y + 0.15, 0.8, 0.12),
    ...eye(-0.17, HIP_Y + 0.08, 0.76, 0.07),
    ...eye(0.17, HIP_Y + 0.08, 0.76, 0.07),
    primitives.cone({ name: "fang-l", size: [0.05, 0.14, 0.05], material: jointMat }).position(-0.07, HIP_Y - 0.06, 0.83).rotation(Math.PI, 0, 0),
    primitives.cone({ name: "fang-r", size: [0.05, 0.14, 0.05], material: jointMat }).position(0.07, HIP_Y - 0.06, 0.83).rotation(Math.PI, 0, 0),
    ...legs.map((l) => leg(l.id, l.x, l.z))
  ]).runtime({ id: "body", mutable: true })
]);

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID, { exposureEv: -0.6 }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#d4d6da", roughness: 0.92 }), receiveShadow: true }))
    .add(spider)
    .camera(camera.auto({ subject: "spider", fill: 0.78, fov: 36, elevation: 0.5, padding: 0.05 })),
  ...looks.appOptions(LOOK_ID)
});

const smooth = (u: number) => u * u * (3 - 2 * u);
const SWING = 0.45; // fraction of the cycle spent in the air
const YAW_AMP = 0.3; // rad of fore/aft sweep

app.onFrame((frame) => {
  const t = frame.time;
  const cycle = (t / PERIOD) % 1;

  // Two footfalls per cycle: the body dips as each diagonal set plants.
  const bob = Math.cos(cycle * TAU * 2);
  app.nodes.require("body").setPosition(0, 0.03 + 0.025 * bob, 0).setRotation(0.012 * Math.sin(cycle * TAU * 2), 0, 0.02 * Math.sin(cycle * TAU));

  for (const l of legs) {
    const p = (cycle + l.group * 0.5) % 1;
    let w: number; // fore/aft position, +1 fully forward
    let lift = 0;
    if (p < SWING) {
      const u = p / SWING;
      w = -1 + 2 * smooth(u);
      lift = Math.sin(u * Math.PI);
    } else {
      const u = (p - SWING) / (1 - SWING);
      w = 1 - 2 * u;
    }
    const yaw = l.side === 1 ? l.base - YAW_AMP * w : Math.PI - l.base + YAW_AMP * w;
    app.nodes.require(`${l.id}-yaw`).setRotation(0, yaw, 0);
    app.nodes.require(`${l.id}-lift`).setRotation(0, 0, UPPER_ANGLE + 0.5 * lift);
    app.nodes.require(`${l.id}-knee`).setRotation(0, 0, LOWER_ANGLE - 0.25 * lift);
  }
});

void app.ready().then(() => {
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
});
