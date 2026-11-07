import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";
import type { AuraVec3 } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---- Flight parameters -------------------------------------------------------------------------
const RADIUS = 6; // flight circle radius (world units)
const HEIGHT = 3.2; // constant flight height
const LOOP_SECONDS = 8; // one full lap
const FLAP_HZ = 2; // 16 flaps per lap, so the loop closes with no jump
const BANK = 0.38; // roll into the turn (radians)
const CAM_RADIUS = 11.5; // chase camera stays outside the circle
const CAM_HEIGHT = 5.2;
const CAM_LAG = 0.55; // camera trails the bird by this angle (radians)

// ---- Materials ---------------------------------------------------------------------------------
const paper = (color: string) => material.pbr({ color, roughness: 0.85, metallic: 0 });
const bodyMat = paper("#f2ede2");
const headMat = paper("#f6f1e6");
const innerWingMat = paper("#4f9be0");
const outerWingMat = paper("#2f6fc0");
const tailMat = paper("#e2644b");
const beakMat = paper("#ffb52e");
const eyeMat = paper("#15171c");

// ---- Bird --------------------------------------------------------------------------------------
// Local frame: +Z forward, +Y up, +X is the bird's left. Joints are groups whose origin is the pivot.
const wing = (side: "l" | "r") => {
  const s = side === "l" ? 1 : -1;
  return group(`${side}-shoulder`, [
    primitives.box({ name: `${side}-inner-wing`, size: [0.9, 0.04, 0.56], material: innerWingMat, castShadow: true }).position(s * 0.45, 0, 0),
    group(`${side}-wrist`, [
      primitives.box({ name: `${side}-outer-wing`, size: [0.85, 0.03, 0.4], material: outerWingMat, castShadow: true }).position(s * 0.42, 0, -0.06)
    ], { position: [s * 0.9, 0, 0] }).runtime({ id: `${side}-wrist`, mutable: true })
  ], { position: [s * 0.22, 0.08, 0.02] }).runtime({ id: `${side}-shoulder`, mutable: true });
};

const FEATHERS = 5;
const feathers = Array.from({ length: FEATHERS }, (_, i) => {
  const spread = (i - (FEATHERS - 1) / 2) * 0.26;
  return group(`feather-pivot-${i}`, [
    primitives.box({ name: `feather-${i}`, size: [0.12, 0.025, 0.55], material: tailMat, castShadow: true }).position(0, 0, -0.27)
  ], { rotation: [0, spread, 0] });
});

const bird = group("bird", [
  group("bird-bank", [
    primitives.sphere({ name: "body", size: [0.56, 0.5, 1.1], material: bodyMat, castShadow: true }),
    group("head", [
      primitives.sphere({ name: "head-ball", size: 0.38, material: headMat, castShadow: true }),
      primitives.cone({ name: "beak", size: [0.14, 0.3, 0.14], material: beakMat, castShadow: true })
        .rotate(Math.PI / 2, 0, 0)
        .position(0, -0.02, 0.28),
      primitives.sphere({ name: "eye-l", size: 0.08, material: eyeMat }).position(0.14, 0.07, 0.14),
      primitives.sphere({ name: "eye-r", size: 0.08, material: eyeMat }).position(-0.14, 0.07, 0.14)
    ], { position: [0, 0.16, 0.56] }),
    group("tail", feathers, { position: [0, 0.02, -0.5], rotation: [0.12, 0, 0] }),
    wing("l"),
    wing("r")
  ]).runtime({ id: "bird-bank", mutable: true })
], { position: [RADIUS, HEIGHT, 0] }).runtime({ id: "bird", mutable: true });

// ---- World -------------------------------------------------------------------------------------
const trunkMat = paper("#7a5232");
const leafMats = [paper("#3f8f4a"), paper("#2f7a3f"), paper("#4c9c52")];

const tree = (i: number, x: number, z: number, h: number) => {
  const leaf = leafMats[i % leafMats.length];
  return group(`tree-${i}`, [
    primitives.cylinder({ name: `trunk-${i}`, size: [0.3 * h, 0.8 * h, 0.3 * h], material: trunkMat, castShadow: true, receiveShadow: true }).position(0, 0.4 * h, 0),
    primitives.cone({ name: `crown-low-${i}`, size: [1.5 * h, 1.4 * h, 1.5 * h], material: leaf, castShadow: true, receiveShadow: true }).position(0, 1.3 * h, 0),
    primitives.cone({ name: `crown-high-${i}`, size: [1.1 * h, 1.1 * h, 1.1 * h], material: leaf, castShadow: true, receiveShadow: true }).position(0, 2.0 * h, 0)
  ], { position: [x, 0, z] });
};

const treeSpots: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 1.2],
  [-2, 1.5, 0.8],
  [1.8, -1.6, 0.9],
  [9, 2, 1.0],
  [8, -5, 0.9],
  [-8.5, 4, 1.1],
  [-7, -6.5, 1.0],
  [3, 9, 1.2],
  [-3, -9, 1.1],
  [15, 6, 1.5],
  [-15, -3, 1.4],
  [4, -15, 1.6],
  [-9, 14, 1.5]
];

const rocks = [
  primitives.sphere({ name: "rock-1", size: [1.0, 0.6, 0.8], material: paper("#8d9096"), castShadow: true, receiveShadow: true }).position(4.2, 0.15, 3.6),
  primitives.sphere({ name: "rock-2", size: [0.7, 0.4, 0.6], material: paper("#9a9da3"), castShadow: true, receiveShadow: true }).position(-4.6, 0.1, -3.2)
];

// ---- Motion ------------------------------------------------------------------------------------
interface Pose {
  readonly birdPos: AuraVec3;
  readonly camPos: AuraVec3;
}

const poseAt = (t: number): Pose => {
  const a = (2 * Math.PI * t) / LOOP_SECONDS;
  const phase = 2 * Math.PI * FLAP_HZ * t;
  const bob = -0.09 * Math.cos(phase - 0.3);
  const ca = a - CAM_LAG;
  return {
    birdPos: [RADIUS * Math.cos(a), HEIGHT + bob, RADIUS * Math.sin(a)],
    camPos: [CAM_RADIUS * Math.cos(ca), CAM_HEIGHT, CAM_RADIUS * Math.sin(ca)]
  };
};

const initial = poseAt(0);

const app = createAuraApp("#app", {
  scene: scene({ background: "#a8d8f0" })
    .add(environments.neutral({ intensity: 0.85, background: false }))
    .add(
      lights.directional({
        name: "sun",
        position: [9, 15, 7],
        target: [0, 0, 0],
        intensity: 2.6,
        color: "#fff3dc",
        shadow: { mapSize: 2048, filter: "pcf", softness: 1.5, fit: { center: [0, 0, 0], extent: 20, depth: 60 } }
      })
    )
    .add(primitives.cylinder({ name: "ground", size: [44, 0.2, 44], material: paper("#7fb069"), receiveShadow: true }).position(0, -0.1, 0))
    .add(primitives.cylinder({ name: "meadow", size: [13.4, 0.02, 13.4], material: paper("#93c47d"), receiveShadow: true }).position(0, 0.005, 0))
    .addMany(treeSpots.map(([x, z, h], i) => tree(i, x, z, h)))
    .addMany(rocks)
    .add(bird)
    .camera(camera.perspective({ position: initial.camPos, target: initial.birdPos, fov: 48, near: 0.3, far: 200 }))
});

let time = 0;
const update = (dt: number): void => {
  time = (time + Math.min(Math.max(dt, 0), 0.1)) % LOOP_SECONDS;
  const a = (2 * Math.PI * time) / LOOP_SECONDS;
  const phase = 2 * Math.PI * FLAP_HZ * time;
  const pose = poseAt(time);

  // Face the direction of travel (tangent) and bank into the turn (toward the circle centre).
  const nodes = app.nodes;
  nodes.require("bird").setPosition(pose.birdPos[0], pose.birdPos[1], pose.birdPos[2]).setRotation(0, -a, 0);
  nodes.require("bird-bank").setRotation(0, 0, BANK);

  // Flap: inner segment drives, outer segment lags a little in phase and bends relative to the inner.
  const inner = 0.12 + 0.6 * Math.sin(phase);
  const outer = 0.55 * Math.sin(phase - 0.9);
  nodes.require("l-shoulder").setRotation(0, 0, inner);
  nodes.require("r-shoulder").setRotation(0, 0, -inner);
  nodes.require("l-wrist").setRotation(0, 0, outer);
  nodes.require("r-wrist").setRotation(0, 0, -outer);

  // Chase camera outside the circle, always looking at the bird.
  app.camera?.setPose({ position: pose.camPos, target: pose.birdPos, up: [0, 1, 0] }, { cut: true });
};

app.onFrame((frame) => update(frame.dt));
await app.ready();
update(0);
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
