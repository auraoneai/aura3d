import { camera, createAuraApp, group, looks, material, primitives, scene } from "@aura3d/engine";

// Walking spider built only from primitives. Every leg is a chain of groups (hip yaw -> femur -> knee),
// each rotating about a single axis, driven from one looping clock with a 2 s period.
const LOOK_ID = "product-studio" as const;
const PERIOD = 2;
const DEG = Math.PI / 180;

const bodyMat = material.pbr({ color: "#3a2a24", roughness: 0.55, metallic: 0.1 });
const abdomenMat = material.pbr({ color: "#5a3a2c", roughness: 0.5, metallic: 0.1 });
const legMat = material.pbr({ color: "#2b2522", roughness: 0.5, metallic: 0.15 });
const jointMat = material.pbr({ color: "#c0562f", roughness: 0.4, metallic: 0.1 });
const eyeMat = material.pbr({ color: "#f4f1e8", roughness: 0.2, metallic: 0 });

const FEMUR = 1.0;
const TIBIA = 1.6;
const FEMUR_ELEV = 55 * DEG; // femur rises from the hip
const TIBIA_DROP = 65 * DEG; // tibia points down at this angle below horizontal (stance)
const BODY_Y = 0.68;
const HIP_R = 0.42;

// Leg segment along local +X, starting at the joint.
const segment = (name: string, length: number, radius: number) =>
  primitives.capsule({ name, size: [radius * 2, length, radius * 2], material: legMat, castShadow: true })
    .position(length / 2, 0, 0).rotate(0, 0, Math.PI / 2);

interface LegDef { id: string; side: 1 | -1; hipZ: number; baseAngle: number; group: 0 | 1 }
const ZS = [0.4, 0.14, -0.14, -0.4];
const ANGLES = [52, 20, -18, -50].map((d) => d * DEG);
const legs: LegDef[] = [];
for (const side of [1, -1] as const) {
  for (let i = 0; i < 4; i += 1) {
    // Diagonal pairs: front-right with rear-left etc. move together.
    const grp = ((i + (side === 1 ? 0 : 1)) % 2) as 0 | 1;
    legs.push({ id: `${side === 1 ? "r" : "l"}${i}`, side, hipZ: ZS[i]!, baseAngle: ANGLES[i]!, group: grp });
  }
}

// Heading angle `a` is measured from +X (right) toward +Z (front); the hip group's yaw maps local +X onto it.
const yawFor = (side: 1 | -1, a: number): number => (side === 1 ? -a : Math.PI - a);

const buildLeg = (leg: LegDef) =>
  group(`${leg.id}-hip`, [
    primitives.sphere({ name: `${leg.id}-hip-ball`, size: 0.26, material: jointMat, castShadow: true }),
    group(`${leg.id}-femur`, [
      segment(`${leg.id}-femur-seg`, FEMUR, 0.11),
      group(`${leg.id}-knee`, [
        primitives.sphere({ name: `${leg.id}-knee-ball`, size: 0.28, material: jointMat, castShadow: true }),
        segment(`${leg.id}-tibia-seg`, TIBIA, 0.075),
        primitives.sphere({ name: `${leg.id}-foot`, size: 0.15, material: jointMat, castShadow: true }).position(TIBIA, 0, 0)
      ], { position: [FEMUR, 0, 0], rotation: [0, 0, -(FEMUR_ELEV + TIBIA_DROP)] }).runtime({ id: `${leg.id}-knee`, mutable: true })
    ], { rotation: [0, 0, FEMUR_ELEV] }).runtime({ id: `${leg.id}-femur`, mutable: true })
  ], {
    position: [leg.side * HIP_R * Math.cos(leg.baseAngle) * 0.6 + 0, 0, leg.hipZ],
    rotation: [0, yawFor(leg.side, leg.baseAngle), 0]
  }).runtime({ id: `${leg.id}-hip`, mutable: true });

const spider = group("spider", [
  primitives.sphere({ name: "thorax", size: [0.95, 0.6, 1.2], material: bodyMat, castShadow: true }).position(0, 0, 0.25),
  primitives.sphere({ name: "head", size: [0.55, 0.45, 0.5], material: bodyMat, castShadow: true }).position(0, 0.05, 0.85),
  primitives.sphere({ name: "abdomen", size: [1.15, 0.95, 1.5], material: abdomenMat, castShadow: true }).position(0, 0.15, -0.85),
  primitives.sphere({ name: "eye-l", size: 0.14, material: eyeMat }).position(-0.14, 0.18, 1.07),
  primitives.sphere({ name: "eye-r", size: 0.14, material: eyeMat }).position(0.14, 0.18, 1.07),
  primitives.sphere({ name: "eye-l2", size: 0.09, material: eyeMat }).position(-0.26, 0.1, 1.0),
  primitives.sphere({ name: "eye-r2", size: 0.09, material: eyeMat }).position(0.26, 0.1, 1.0),
  ...legs.map(buildLeg)
], { position: [0, BODY_Y, 0] }).runtime({ id: "spider", mutable: true });

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID, { exposureEv: -0.8 }))
    .add(primitives.plane({ name: "floor", size: [24, 1, 24], material: material.pbr({ color: "#d4d6da", roughness: 0.9 }), receiveShadow: true }))
    .add(spider)
    .camera(camera.perspective({ position: [3.9, 3.0, 4.6], target: [0, 0.5, 0], fov: 36 })),
  ...looks.appOptions(LOOK_ID)
});

const smooth = (x: number): number => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const SWING_ARC = 20 * DEG; // half-range of the stride in heading angle
const LIFT_FEMUR = 22 * DEG;
const LIFT_TIBIA = 30 * DEG;

const nodes = {
  spider: app.nodes.require("spider"),
  legs: legs.map((leg) => ({
    leg,
    hip: app.nodes.require(`${leg.id}-hip`),
    femur: app.nodes.require(`${leg.id}-femur`),
    knee: app.nodes.require(`${leg.id}-knee`)
  }))
};

const pose = (clock: number): void => {
  const cycle = (clock / PERIOD) % 1;
  // Two diagonal steps per period: body dips as feet plant and rises mid-swing.
  const bob = 0.05 * Math.cos(cycle * Math.PI * 4);
  nodes.spider.setPosition(0, BODY_Y + bob, 0).setRotation(0, 0, 0.012 * Math.sin(cycle * Math.PI * 2));
  for (const { leg, hip, femur, knee } of nodes.legs) {
    const u = (cycle + leg.group * 0.5) % 1;
    let stride: number; // -1 (rear) .. +1 (front)
    let lift = 0;
    if (u < 0.5) {
      const k = u / 0.5;
      stride = -1 + 2 * smooth(k); // swing forward
      lift = Math.sin(k * Math.PI);
    } else {
      stride = 1 - 2 * ((u - 0.5) / 0.5); // planted, foot slides back
    }
    const a = leg.baseAngle + stride * SWING_ARC;
    hip.setPosition(leg.side * HIP_R * Math.cos(leg.baseAngle) * 0.6, 0, leg.hipZ).setRotation(0, yawFor(leg.side, a), 0);
    const elev = FEMUR_ELEV + lift * LIFT_FEMUR;
    const tibiaDrop = TIBIA_DROP - lift * LIFT_TIBIA;
    femur.setRotation(0, 0, elev);
    knee.setRotation(0, 0, -(elev + tibiaDrop));
  }
};

let clock = 0;
let ready = false;
const taskState = { walking: true };
(window as unknown as { __TASK_STATE__?: { walking: boolean } }).__TASK_STATE__ = taskState;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (!e.repeat) taskState.walking = !taskState.walking;
  }
});
app.onFrame((frame) => {
  if (taskState.walking) clock += frame.dt;
  pose(clock);
  if (!ready) {
    ready = true;
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
});
void app.ready();
