import { camera, createAuraApp, environments, group, instances, lights, material, primitives, scene } from "@aura3d/engine";

// Flapping paper bird on a circular, banked flight path. Everything is built from primitives.
// Bird local frame: +z forward, +y up, +x left. Every joint is a group with a single-axis rotation.

const RADIUS = 6; // flight circle radius (world units)
const HEIGHT = 3.6; // constant flight height
const LOOP_SECONDS = 8; // one lap; 2 flaps/s gives exactly 16 flaps per lap, so the loop is seamless
const FLAPS_PER_SECOND = 2;
const BANK = 0.38; // radians, positive banks to the right (centre of the circle is on the right)
const CAM_RADIUS = 13; // camera orbits outside the flight circle
const CAM_HEIGHT = 5.6;
const CAM_LAG = 0.55; // radians behind the bird along the circle

const TAU = Math.PI * 2;

const paper = (color: string) => material.pbr({ color, roughness: 0.85, metallic: 0 });
const cream = paper("#f6efe0");
const coral = paper("#f2705a");
const coralDark = paper("#d9503d");
const teal = paper("#2fa4a0");
const tealDark = paper("#1f7f7c");
const sun = paper("#ffb938");
const white = paper("#ffffff");
const ink = paper("#1b1b24");

// --- bird ---------------------------------------------------------------------------------------------------------

const wing = (side: "l" | "r") => {
  const s = side === "l" ? 1 : -1; // left wing extends toward +x
  return group(`${side}-wing`, [
    primitives.box({ name: `${side}-wing-inner`, size: [0.85, 0.04, 0.75], material: teal }).position(0.425 * s, 0, 0),
    group(`${side}-wing-outer`, [
      primitives.box({ name: `${side}-wing-outer-panel`, size: [0.8, 0.035, 0.55], material: tealDark }).position(0.4 * s, 0, -0.05)
    ], { position: [0.85 * s, 0, 0] }).runtime({ id: `${side}-wing-outer`, mutable: true })
  ], { position: [0.28 * s, 0.08, 0.05] }).runtime({ id: `${side}-wing`, mutable: true });
};

const feathers = [-0.56, -0.28, 0, 0.28, 0.56].map((yaw, i) =>
  group(`feather-${i}`, [
    primitives.box({
      name: `feather-panel-${i}`,
      size: [0.14, 0.03, 0.62],
      material: i % 2 === 0 ? coral : coralDark
    }).position(0, 0, -0.31)
  ], { rotation: [0, yaw, 0] })
);

const bird = group("bird", [
  group("bird-bank", [
    primitives.sphere({ name: "body", size: [0.62, 0.6, 1.4], material: cream }),
    primitives.sphere({ name: "belly", size: [0.5, 0.36, 1.0], material: sun }).position(0, -0.17, 0.05),
    primitives.sphere({ name: "head", size: 0.5, material: cream }).position(0, 0.3, 0.72),
    primitives.cone({ name: "beak", size: [0.2, 0.42, 0.2], material: sun }).position(0, 0.26, 1.18).rotate(Math.PI / 2, 0, 0),
    primitives.sphere({ name: "eye-l", size: 0.13, material: white }).position(0.165, 0.38, 0.9),
    primitives.sphere({ name: "eye-r", size: 0.13, material: white }).position(-0.165, 0.38, 0.9),
    primitives.sphere({ name: "pupil-l", size: 0.07, material: ink }).position(0.19, 0.39, 0.95),
    primitives.sphere({ name: "pupil-r", size: 0.07, material: ink }).position(-0.19, 0.39, 0.95),
    group("tail", feathers, { position: [0, 0.02, -0.6] }),
    wing("l"),
    wing("r")
  ]).runtime({ id: "bird-bank", mutable: true })
]).runtime({ id: "bird", mutable: true });

// --- world --------------------------------------------------------------------------------------------------------

type Tree = { x: number; z: number; s: number };
const trees: Tree[] = [
  { x: 0, z: 0, s: 1.0 },
  { x: -2.3, z: 1.6, s: 0.7 },
  { x: 2.0, z: 2.4, s: 0.8 },
  { x: 1.8, z: -2.6, s: 0.6 },
  { x: 9.5, z: 1.5, s: 1.1 },
  { x: -8.4, z: 4.6, s: 1.0 },
  { x: -3.0, z: -9.2, s: 1.2 },
  { x: 4.2, z: 8.8, s: 0.9 },
  { x: 16, z: -6, s: 1.6 },
  { x: -15, z: -9, s: 1.5 },
  { x: -17, z: 7, s: 1.7 },
  { x: 7, z: 17, s: 1.5 },
  { x: -6, z: -18, s: 1.6 },
  { x: 14, z: 13, s: 1.4 },
  { x: -11, z: 15, s: 1.3 },
  { x: 18, z: 4, s: 1.4 },
  { x: 2, z: -17, s: 1.3 }
];
const greens = ["#2f8a4a", "#3a9a52", "#287a42", "#44a85a"];

const foliage = instances.cone({
  name: "tree-foliage",
  material: material.pbr({ color: "#ffffff", roughness: 0.9 }),
  castShadow: true,
  receiveShadow: true,
  transforms: trees.map((t) => ({ position: [t.x, (0.7 + 1.1) * t.s, t.z] as [number, number, number], scale: [1.9 * t.s, 2.8 * t.s, 1.9 * t.s] as [number, number, number] })),
  colors: trees.map((_, i) => greens[i % greens.length] ?? "#2f8a4a")
});

const trunks = instances.cylinder({
  name: "tree-trunks",
  material: material.pbr({ color: "#7a5230", roughness: 0.95 }),
  castShadow: true,
  receiveShadow: true,
  transforms: trees.map((t) => ({ position: [t.x, 0.35 * t.s, t.z] as [number, number, number], scale: [0.3 * t.s, 0.7 * t.s, 0.3 * t.s] as [number, number, number] }))
});

const birdAt = (t: number) => {
  const theta = (t / LOOP_SECONDS) * TAU;
  return { x: RADIUS * Math.cos(theta), z: RADIUS * Math.sin(theta), theta };
};
const cameraAt = (t: number) => {
  const b = birdAt(t);
  const c = b.theta - CAM_LAG;
  return {
    position: [CAM_RADIUS * Math.cos(c), CAM_HEIGHT, CAM_RADIUS * Math.sin(c)] as [number, number, number],
    target: [b.x, HEIGHT, b.z] as [number, number, number]
  };
};

const start = cameraAt(0);
const app = createAuraApp("#app", {
  scene: scene({ background: "#bfe1f7" })
    .add(environments.neutral({ intensity: 0.85, background: false }))
    .add(lights.directional({
      name: "sun",
      position: [9, 15, 7],
      target: [0, 0, 0],
      intensity: 2.6,
      color: "#fff1d6",
      shadow: { mapSize: 2048, filter: "pcf", fit: { center: [0, 0, 0], extent: 22, depth: 50 } }
    }))
    .add(primitives.cylinder({
      name: "ground",
      size: [46, 0.2, 46],
      material: material.pbr({ color: "#8cc572", roughness: 0.95 }),
      receiveShadow: true,
      castShadow: false
    }).position(0, -0.1, 0))
    .add(foliage)
    .add(trunks)
    .add(bird)
    .camera(camera.perspective({ position: start.position, target: start.target, fov: 48, near: 0.3, far: 200 }))
});

const update = (t: number) => {
  const time = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  const phase = TAU * FLAPS_PER_SECOND * time;
  const b = birdAt(time);

  // Direction of travel is (-sin θ, cos θ); a yaw ψ maps local +z to (sin ψ, cos ψ), so ψ = -θ.
  app.nodes.require("bird").setPosition(b.x, HEIGHT, b.z).setRotation(0, -b.theta, 0);

  // Body rises on the downstroke and sinks on the upstroke.
  const bob = -0.1 * Math.sin(phase);
  const bank = app.nodes.require("bird-bank");
  bank.setPosition(0, bob, 0).setRotation(0, 0, BANK);

  // Inner wing swings about the shoulder; the outer segment trails by a phase lag so the wing bends.
  const inner = 0.6 * Math.sin(phase);
  const outer = 0.5 * Math.sin(phase - 0.8);
  app.nodes.require("l-wing").setRotation(0, 0, inner);
  app.nodes.require("r-wing").setRotation(0, 0, -inner);
  app.nodes.require("l-wing-outer").setRotation(0, 0, outer);
  app.nodes.require("r-wing-outer").setRotation(0, 0, -outer);

  const cam = cameraAt(time);
  app.camera?.setPose({ position: cam.position, target: cam.target });
};

let t0 = performance.now();
let mounted = false;
app.onFrame(() => {
  if (mounted) update((performance.now() - t0) / 1000);
});

await app.ready();
t0 = performance.now();
mounted = true;
update(0);

const flags = window as unknown as { __EVAL_READY__?: boolean };
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    flags.__EVAL_READY__ = true;
  });
});
