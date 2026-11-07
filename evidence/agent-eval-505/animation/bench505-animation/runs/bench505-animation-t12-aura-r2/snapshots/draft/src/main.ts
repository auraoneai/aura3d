import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type Vec3 = [number, number, number];

// ---- Flight parameters -------------------------------------------------------------------------
const LOOP_SECONDS = 8; // one lap; also an exact multiple of the flap period
const RADIUS = 6;
const HEIGHT = 3.2;
const FLAP_HZ = 2; // 16 flaps per lap, so the loop closes with no jump
const BANK = -0.32; // radians about the forward (+Z) axis; negative lowers the inside (left, +X) wing
const CAM_RADIUS = 12;
const CAM_HEIGHT = 5;
const CAM_LAG = 0.5; // radians behind the bird along the outer circle

const TAU = Math.PI * 2;

interface BirdPose {
  position: Vec3;
  yaw: number;
  inner: number; // inner wing flap angle (positive raises the left wing tip)
  outer: number; // outer wing angle relative to the inner segment
}

function birdPose(t: number): BirdPose {
  const theta = (TAU * t) / LOOP_SECONDS;
  const phase = TAU * FLAP_HZ * t;
  const bob = -0.08 * Math.sin(phase - 0.3); // body is highest around the bottom of the downstroke
  return {
    position: [RADIUS * Math.sin(theta), HEIGHT + bob, RADIUS * Math.cos(theta)],
    yaw: theta + Math.PI / 2, // local +Z points along the direction of travel
    inner: 0.12 + 0.5 * Math.sin(phase),
    outer: 0.12 + 0.45 * Math.sin(phase - 0.8) // lags the inner segment so the wing bends
  };
}

function cameraPose(t: number): { position: Vec3; target: Vec3 } {
  const theta = (TAU * t) / LOOP_SECONDS;
  const b = birdPose(t).position;
  const a = theta - CAM_LAG;
  return {
    position: [CAM_RADIUS * Math.sin(a), CAM_HEIGHT, CAM_RADIUS * Math.cos(a)],
    target: [b[0], HEIGHT - 0.2, b[2]]
  };
}

// ---- Materials ---------------------------------------------------------------------------------
const bodyMat = material.pbr({ color: "#f2c14e", roughness: 0.7 });
const headMat = material.pbr({ color: "#f6d56b", roughness: 0.7 });
const beakMat = material.pbr({ color: "#ee7b30", roughness: 0.6 });
const eyeWhite = material.pbr({ color: "#ffffff", roughness: 0.4 });
const eyeDark = material.pbr({ color: "#111111", roughness: 0.3 });
const wingInnerMat = material.pbr({ color: "#e0533d", roughness: 0.75 });
const wingOuterMat = material.pbr({ color: "#b73a31", roughness: 0.75 });
const featherMats = [
  material.pbr({ color: "#3b8ea5", roughness: 0.75 }),
  material.pbr({ color: "#e0533d", roughness: 0.75 })
];

// ---- Bird --------------------------------------------------------------------------------------
const p0 = birdPose(0);

// side = +1: left wing (+X), side = -1: right wing (-X). Segments extend outward from their hinge.
const wing = (side: 1 | -1) => {
  const name = side === 1 ? "left" : "right";
  return group(`${name}-shoulder`, [
    primitives.box({ name: `${name}-wing-inner`, size: [0.7, 0.04, 0.46], material: wingInnerMat }).position(side * 0.35, 0, 0),
    group(`${name}-elbow`, [
      primitives.box({ name: `${name}-wing-outer`, size: [0.7, 0.03, 0.34], material: wingOuterMat }).position(side * 0.35, 0, -0.04),
      primitives.box({ name: `${name}-wing-tip`, size: [0.2, 0.025, 0.2], material: wingOuterMat }).position(side * 0.78, 0, -0.1)
    ], { position: [side * 0.7, 0, 0], rotation: [0, 0, side * p0.outer] }).runtime({ id: `${name}-elbow`, mutable: true })
  ], { position: [side * 0.28, 0.06, 0.05], rotation: [0, 0, side * p0.inner] }).runtime({ id: `${name}-shoulder`, mutable: true });
};

const FEATHER_ANGLES = [-0.55, -0.28, 0, 0.28, 0.55];
const tail = group(
  "tail",
  FEATHER_ANGLES.map((angle, i) =>
    group(`tail-feather-${i}`, [
      primitives.box({ name: `tail-feather-box-${i}`, size: [0.13, 0.025, 0.6], material: featherMats[i % 2] as (typeof featherMats)[number] }).position(0, 0, -0.3)
    ], { rotation: [0, angle, 0] })
  ),
  { position: [0, 0.02, -0.5], rotation: [0.12, 0, 0] }
);

const head = group("head", [
  primitives.sphere({ name: "skull", size: 0.42, material: headMat }),
  primitives.cone({ name: "beak", size: [0.14, 0.3, 0.14], material: beakMat }).position(0, -0.04, 0.3).rotate(Math.PI / 2, 0, 0),
  primitives.sphere({ name: "eye-l", size: 0.1, material: eyeWhite }).position(0.12, 0.07, 0.17),
  primitives.sphere({ name: "eye-r", size: 0.1, material: eyeWhite }).position(-0.12, 0.07, 0.17),
  primitives.sphere({ name: "pupil-l", size: 0.05, material: eyeDark }).position(0.135, 0.075, 0.205),
  primitives.sphere({ name: "pupil-r", size: 0.05, material: eyeDark }).position(-0.135, 0.075, 0.205)
], { position: [0, 0.22, 0.55] });

const bird = group("bird-path", [
  group("bird-bank", [
    primitives.sphere({ name: "body", size: [0.6, 0.55, 1.1], material: bodyMat }),
    head,
    tail,
    wing(1),
    wing(-1)
  ], { rotation: [0, 0, BANK] })
], { position: p0.position, rotation: [0, p0.yaw, 0] }).runtime({ id: "bird-path", mutable: true });

// ---- World -------------------------------------------------------------------------------------
const trunkMat = material.pbr({ color: "#7a5230", roughness: 0.95 });
const leafMats = [
  material.pbr({ color: "#2f7d3a", roughness: 0.9 }),
  material.pbr({ color: "#3f9148", roughness: 0.9 })
];
const rockMat = material.pbr({ color: "#8d8f94", roughness: 1 });

const treeSpots: Array<[number, number, number]> = [
  // x, z, scale
  [0, 0, 1.0],
  [-2.2, 1.2, 0.8],
  [1.8, -1.6, 0.7],
  [15, 2, 1.3],
  [-14, 8, 1.1],
  [9, -16, 1.4],
  [-8, -16, 1.2],
  [-17, -4, 1.0],
  [17, 10, 1.0],
  [2, 18, 1.2],
  [-12, 16, 1.0]
];

const props = treeSpots.flatMap(([x, z, s], i) => [
  primitives.cylinder({ name: `trunk-${i}`, size: [0.35 * s, 1.2 * s, 0.35 * s], material: trunkMat }).position(x, 0.6 * s, z),
  primitives.cone({ name: `crown-low-${i}`, size: [1.8 * s, 2.4 * s, 1.8 * s], material: leafMats[i % 2] as (typeof leafMats)[number] }).position(x, 2.4 * s, z),
  primitives.cone({ name: `crown-high-${i}`, size: [1.3 * s, 1.8 * s, 1.3 * s], material: leafMats[(i + 1) % 2] as (typeof leafMats)[number] }).position(x, 3.5 * s, z)
]);

const rocks = [
  primitives.sphere({ name: "rock-0", size: [1.2, 0.8, 1.0], material: rockMat }).position(4, 0.2, -9),
  primitives.sphere({ name: "rock-1", size: [0.8, 0.6, 0.7], material: rockMat }).position(-5, 0.15, 10),
  primitives.sphere({ name: "rock-2", size: [1.0, 0.7, 0.9], material: rockMat }).position(12, 0.2, -6)
];

const c0 = cameraPose(0);

const stage = scene({ background: "#a9d3f0" })
  .add(environments.neutral({ intensity: 0.6, background: false }))
  .add(lights.hemisphere({ skyColor: "#cfe6ff", groundColor: "#6d8a4a", intensity: 0.7 }))
  .add(
    lights.directional({
      name: "sun",
      position: [9, 16, 7],
      target: [0, 0, 0],
      intensity: 3,
      color: "#fff3dc",
      shadow: { mapSize: 2048, fit: { center: [0, 0, 0], extent: 24, depth: 60 } }
    })
  )
  .add(primitives.cylinder({ name: "ground", size: [48, 0.2, 48], material: material.pbr({ color: "#7aa653", roughness: 1 }), castShadow: false }).position(0, -0.1, 0))
  .addMany(props)
  .addMany(rocks)
  .add(bird)
  .camera(camera.perspective({ position: c0.position, target: c0.target, fov: 45 }));

const app = createAuraApp("#app", { scene: stage });

// ---- Animation ---------------------------------------------------------------------------------
const startMs = performance.now();

function update(t: number): void {
  const p = birdPose(t);
  app.nodes.require("bird-path").setPosition(p.position[0], p.position[1], p.position[2]).setRotation(0, p.yaw, 0);
  app.nodes.require("left-shoulder").setRotation(0, 0, p.inner);
  app.nodes.require("right-shoulder").setRotation(0, 0, -p.inner);
  app.nodes.require("left-elbow").setRotation(0, 0, p.outer);
  app.nodes.require("right-elbow").setRotation(0, 0, -p.outer);

  const c = cameraPose(t);
  app.camera?.setPose({ position: c.position, target: c.target }, { cut: true });
}

app.onFrame(() => {
  update(((performance.now() - startMs) / 1000) % LOOP_SECONDS);
});

await app.ready();
update(0);
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
