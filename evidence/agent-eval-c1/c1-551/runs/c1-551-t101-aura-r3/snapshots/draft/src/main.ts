import { camera, createAuraApp, group, looks, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const PERIOD = 2; // seconds per full gait cycle

// Leg geometry: hip -> femur (L1) rising outward -> knee -> tibia (L2) angled steeply down to the ground.
const L1 = 0.9;
const L2 = 1.3;
const A1 = 0.6; // femur absolute pitch (rad, up)
const A2 = -1.1; // tibia absolute pitch (rad, down)
const FOOT_REACH = L1 * Math.cos(A1) + L2 * Math.cos(A2);
const HIP_HEIGHT = -(L1 * Math.sin(A1) + L2 * Math.sin(A2)) + 0.06; // hip height above ground (foot tip clears the floor by its radius)
const SWING = 0.3; // yaw amplitude (rad) of the foot around its hip
const LIFT = 0.5; // extra hip pitch while a foot is in the air
const BOB = 0.03;

const bodyMat = material.pbr({ color: "#5a2f2a", roughness: 0.55 });
const abdomenMat = material.pbr({ color: "#3d2220", roughness: 0.5 });
const markMat = material.pbr({ color: "#d9a441", roughness: 0.5 });
const legMat = material.pbr({ color: "#2d2a33", roughness: 0.5 });
const jointMat = material.pbr({ color: "#d9a441", roughness: 0.4 });
const eyeMat = material.pbr({ color: "#f4f1e8", roughness: 0.2 });
const pupilMat = material.pbr({ color: "#101014", roughness: 0.2 });
const fangMat = material.pbr({ color: "#e8dcc8", roughness: 0.4 });

const HALF_PI = Math.PI / 2;
const deg = (d: number) => (d * Math.PI) / 180;

interface LegSpec {
  readonly id: number;
  readonly angle: number; // base yaw around Y; direction (cos a, 0, -sin a). Spider faces +Z.
  readonly pos: readonly [number, number, number];
  readonly forward: number; // sign of the yaw delta that moves the foot toward +Z
  readonly phase: number; // 0 or 0.5, diagonal group
}

const legs: LegSpec[] = [];
const rightAngles = [-58, -22, 20, 56];
const leftAngles = [238, 202, 160, 124];
const hipZ = [0.42, 0.22, 0.02, -0.18];
for (let side = 0; side < 2; side += 1) {
  for (let i = 0; i < 4; i += 1) {
    const angle = deg((side === 0 ? rightAngles : leftAngles)[i]!);
    const x = side === 0 ? 0.3 : -0.3;
    legs.push({
      id: side * 4 + i,
      angle,
      pos: [x, 0, hipZ[i]!],
      forward: -Math.sign(Math.cos(angle)),
      phase: (i + side) % 2 === 0 ? 0 : 0.5
    });
  }
}

const buildLeg = (leg: LegSpec) =>
  group(
    `yaw-${leg.id}`,
    [
      group(
        `lift-${leg.id}`,
        [
          primitives.sphere({ name: `hip-ball-${leg.id}`, size: 0.2, material: jointMat }),
          primitives
            .cylinder({ name: `femur-${leg.id}`, size: [0.12, L1, 0.12], material: legMat })
            .rotation(0, 0, HALF_PI)
            .position(L1 / 2, 0, 0),
          group(
            `knee-${leg.id}`,
            [
              primitives.sphere({ name: `knee-ball-${leg.id}`, size: 0.17, material: jointMat }),
              primitives
                .cylinder({ name: `tibia-${leg.id}`, size: [0.085, L2, 0.085], material: legMat })
                .rotation(0, 0, HALF_PI)
                .position(L2 / 2, 0, 0),
              primitives.sphere({ name: `foot-${leg.id}`, size: 0.1, material: jointMat }).position(L2, 0, 0)
            ],
            { position: [L1, 0, 0] }
          ).runtime({ id: `knee-${leg.id}`, mutable: true })
        ],
        { rotation: [0, 0, A1] }
      ).runtime({ id: `lift-${leg.id}`, mutable: true })
    ],
    { position: [leg.pos[0], leg.pos[1], leg.pos[2]], rotation: [0, leg.angle, 0] }
  ).runtime({ id: `yaw-${leg.id}`, mutable: true });

const eye = (name: string, x: number, y: number, z: number, s: number) => [
  primitives.sphere({ name: `${name}-white`, size: s, material: eyeMat }).position(x, y, z),
  primitives.sphere({ name: `${name}-pupil`, size: s * 0.55, material: pupilMat }).position(x * 1.04, y + s * 0.02, z + s * 0.32)
];

const spider = group("spider", [
  group(
    "body",
    [
      // cephalothorax
      primitives.sphere({ name: "cephalothorax", size: [0.75, 0.5, 0.85], material: bodyMat }).position(0, 0.02, 0.22),
      primitives.sphere({ name: "head", size: [0.45, 0.38, 0.4], material: bodyMat }).position(0, 0.06, 0.66),
      // abdomen
      primitives.sphere({ name: "abdomen", size: [1.0, 0.85, 1.35], material: abdomenMat }).position(0, 0.18, -0.68),
      primitives.sphere({ name: "mark-a", size: [0.3, 0.1, 0.4], material: markMat }).position(0, 0.6, -0.65),
      primitives.sphere({ name: "mark-b", size: [0.18, 0.08, 0.25], material: markMat }).position(0, 0.55, -1.05),
      // eyes
      ...eye("eye-l", -0.1, 0.17, 0.82, 0.12),
      ...eye("eye-r", 0.1, 0.17, 0.82, 0.12),
      ...eye("eye-l2", -0.18, 0.1, 0.78, 0.08),
      ...eye("eye-r2", 0.18, 0.1, 0.78, 0.08),
      // fangs
      primitives.cone({ name: "fang-l", size: [0.07, 0.2, 0.07], material: fangMat }).rotation(Math.PI, 0, 0).position(-0.1, -0.08, 0.84),
      primitives.cone({ name: "fang-r", size: [0.07, 0.2, 0.07], material: fangMat }).rotation(Math.PI, 0, 0).position(0.1, -0.08, 0.84),
      ...legs.map(buildLeg)
    ],
    { position: [0, HIP_HEIGHT, 0] }
  ).runtime({ id: "body", mutable: true })
]);

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio", { exposureEv: -0.8 }))
    .add(
      primitives.plane({
        name: "floor",
        size: [14, 1, 14],
        material: material.pbr({ color: "#d6d8dd", roughness: 0.9 })
      })
    )
    .add(spider)
    .camera(camera.auto({ fill: 0.8, elevation: 0.55, azimuth: 0.6 })),
  ...looks.appOptions("product-studio")
});

const smooth = (u: number) => u * u * (3 - 2 * u);

const pose = (time: number) => {
  const cycle = time / PERIOD;
  const bob = BOB * Math.sin(cycle * Math.PI * 4);
  app.nodes.require("body").setPosition(0, HIP_HEIGHT + bob, 0);
  for (const leg of legs) {
    let p = (cycle + leg.phase) % 1;
    if (p < 0) p += 1;
    const swingFrac = 0.45;
    let yawOffset: number;
    let lift = 0;
    if (p < swingFrac) {
      // swing: foot rises, travels forward, and comes down
      const u = p / swingFrac;
      yawOffset = (-1 + 2 * smooth(u)) * SWING;
      lift = Math.sin(u * Math.PI) * LIFT;
    } else {
      // stance: foot planted, body appears to move forward over it
      const u = (p - swingFrac) / (1 - swingFrac);
      yawOffset = (1 - 2 * u) * SWING;
    }
    // keep planted feet on the floor while the body bobs
    const comp = -bob / FOOT_REACH;
    app.nodes.require(`yaw-${leg.id}`).setRotation(0, leg.angle + leg.forward * yawOffset, 0);
    app.nodes.require(`lift-${leg.id}`).setRotation(0, 0, A1 + lift + comp);
    app.nodes.require(`knee-${leg.id}`).setRotation(0, 0, A2 - A1 - lift * 0.5 - comp);
  }
};

let ready = false;
app.onFrame((f) => {
  pose(f.time);
  if (!ready) {
    ready = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
void app.ready();
