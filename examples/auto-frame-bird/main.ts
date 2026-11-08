// N4 framing and shadows by default (benchmark 505 cause E, animation-3 bird).
// The 5.0.2 agents hand-placed a chase camera ~7.5 units outside the circle and the bird came out small. Here no
// camera position is written: the first frame uses `camera.auto({ subject: "bird" })`, then every frame
// `camera.framePose(box, { azimuth, elevation, fill })` solves the chase pose from the bird's own bounds at its current
// position, so the bird keeps the same share of the frame all the way round the loop. `lights.key` casts the bird's
// shadow onto the ground disc by default (primitives receive shadows by default).
import { camera, createAuraApp, environments, group, lights, material, measureFrameFill, primitives, scene, type AuraNodeInput } from "@aura3d/engine";

type V3 = [number, number, number];
const LOOP = 8, RADIUS = 6, HEIGHT = 3.2, FLAP_HZ = 2, BANK = 0.42, FILL = 0.45;

const mat = (color: string, roughness = 0.85) => material.pbr({ color, roughness });
const J = (id: string, position: V3, kids: readonly AuraNodeInput[]) => group(id, kids, { position }).runtime({ id, mutable: true });

const wing = (side: 1 | -1, name: string) =>
  J(`${name}-in`, [0.28 * side, 0.08, 0.05], [
    primitives.box({ name: `${name}-inner`, size: [0.9, 0.04, 0.55], material: mat("#f4c542") }).position(0.45 * side, 0, 0),
    J(`${name}-out`, [0.9 * side, 0, 0], [
      primitives.box({ name: `${name}-outer`, size: [0.85, 0.035, 0.4], material: mat("#e0842b") }).position(0.425 * side, 0, -0.05)
    ])
  ]);

const feathers = [-0.56, -0.28, 0, 0.28, 0.56].map((a, i) => {
  const len = 0.7 - Math.abs(a) * 0.3;
  return primitives.box({ name: `feather ${i}`, size: [0.13, 0.03, len], material: mat(i % 2 ? "#3d86cf" : "#2f6fb3") })
    .position(-Math.sin(a) * (len / 2), 0.02, -0.5 - Math.cos(a) * (len / 2)).rotate(0, a, 0);
});

const birdParts = (): AuraNodeInput[] => [
  J("bank", [0, 0, 0], [
    J("bob", [0, 0, 0], [
      primitives.sphere({ name: "body", size: [0.62, 0.58, 1.2], material: mat("#e8573c") }),
      primitives.sphere({ name: "belly", size: [0.5, 0.36, 0.9], material: mat("#f7e3c4") }).position(0, -0.12, 0.05),
      primitives.sphere({ name: "head", size: 0.42, material: mat("#e8573c") }).position(0, 0.24, 0.62),
      primitives.cone({ name: "beak", size: [0.14, 0.3, 0.14], material: mat("#ff9f1c", 0.6) }).position(0, 0.2, 0.96).rotate(Math.PI / 2, 0, 0),
      primitives.sphere({ name: "eye l", size: 0.09, material: mat("#101010", 0.3) }).position(0.16, 0.32, 0.78),
      primitives.sphere({ name: "eye r", size: 0.09, material: mat("#101010", 0.3) }).position(-0.16, 0.32, 0.78),
      ...feathers,
      wing(1, "wl"),
      wing(-1, "wr")
    ])
  ])
];

// The bird's body box (beak to tail; the flapping wings are left out so the size does not pulse) at the origin,
// made rotation-safe for yaw and bank: a cube of the largest half-extent.
const local = camera.worldBounds(group("bird probe", birdParts()), { exclude: (node) => /^w[lr]-/.test(node.name ?? "") });
const half = Math.max(...[0, 1, 2].map((i) => (local.max[i]! - local.min[i]!) / 2));
const boxAt = (p: V3) => ({ min: [p[0] - half, p[1] - half, p[2] - half] as V3, max: [p[0] + half, p[1] + half, p[2] + half] as V3 });

let stage = scene({ background: "#a9d4f0" })
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#d6ecff", groundColor: "#6b8a4a", intensity: 0.6 }))
  .add(lights.key({ position: [6, 14, 5] }))
  .add(primitives.cylinder({ name: "ground", size: [44, 0.2, 44], material: mat("#6fa34a", 1) }).position(0, -0.1, 0));
// Props for scale: inside the flight circle, and beyond the chase camera's ring so none comes between camera and bird.
const trees: V3[] = [[0, 0, 1.3], [2.2, 1.6, 0.9], [-2, 1.8, 1.0], [1.2, -2.4, 0.8], [17, 4, 1.4], [-16, 8, 1.6], [10, -15, 1.3], [-9, -16, 1.5], [4, 18, 1.2]];
trees.forEach(([x, z, s], i) => {
  stage = stage
    .add(primitives.cylinder({ name: `trunk ${i}`, size: [0.35 * s, 1.2 * s, 0.35 * s], material: mat("#6b4a2b") }).position(x, 0.6 * s, z))
    .add(primitives.cone({ name: `crown ${i}`, size: [1.8 * s, 3.2 * s, 1.8 * s], material: mat(i % 2 ? "#2f7d3c" : "#3a8f45") }).position(x, 2.8 * s, z));
});
stage = stage.add(J("bird", [RADIUS, HEIGHT, 0], birdParts())).camera(camera.auto({ subject: "bird", fill: FILL }));

const app = createAuraApp("#app", { scene: stage });

let lastFill = 0;
const place = (t: number): void => {
  const theta = (t / LOOP) * Math.PI * 2;
  const w = FLAP_HZ * Math.PI * 2 * t;
  const n = (id: string) => app.nodes.require(id);
  const at: V3 = [RADIUS * Math.cos(theta), HEIGHT, RADIUS * Math.sin(theta)];
  n("bird").setPosition(...at).setRotation(0, -theta, 0);
  n("bank").setRotation(0, 0, BANK);
  n("bob").setPosition(0, 0.1 * Math.sin(w + Math.PI / 2), 0);
  const inner = 0.12 + 0.6 * Math.sin(w), outer = 0.15 + 0.55 * Math.sin(w - 0.9);
  n("wl-in").setRotation(0, 0, inner);
  n("wl-out").setRotation(0, 0, outer);
  n("wr-in").setRotation(0, 0, -inner);
  n("wr-out").setRotation(0, 0, -outer);
  // Chase: look from outside the circle, a little behind the bird. Azimuth is measured from +Z toward +X.
  const outward = theta - 0.5;
  const canvas = document.querySelector<HTMLCanvasElement>("#app");
  const aspect = canvas && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9;
  const pose = camera.framePose(boxAt(at), { azimuth: Math.PI / 2 - outward, elevation: 0.32, fill: FILL, aspect });
  app.camera?.setPose({ position: pose.position, target: pose.target, fov: pose.fov }, { cut: true });
  lastFill = measureFrameFill(boxAt(at), pose, aspect);
};

app.onFrame((f) => place(f.time % LOOP));
await app.ready();
place(0);
// Evidence: the fill the solved chase pose gives the bird's body box (read live: it holds every frame).
(window as unknown as { __AURA_AUTO_FRAME__?: unknown }).__AURA_AUTO_FRAME__ = { requestedFill: FILL, get fill() { return lastFill; }, get camera() { return app.camera?.presented() ?? app.scene.camera; } };
