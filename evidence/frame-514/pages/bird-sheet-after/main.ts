import { camera, createAuraApp, group, lights, material, primitives, scene } from "@aura3d/engine";
import { record } from "../../hook";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

const LOOP = 8; // seconds per lap
const RADIUS = 6;
const HEIGHT = 3.2;
const FLAP_HZ = 2;
const BANK = 0.42;

const mat = (color: string, roughness = 0.85) => material.pbr({ color, roughness });
const bodyMat = mat("#e8573c");
const bellyMat = mat("#f7e3c4");
const wingInMat = mat("#f4c542");
const wingOutMat = mat("#e0842b");
const tailMats = ["#2f6fb3", "#3d86cf", "#2f6fb3", "#3d86cf", "#2f6fb3"].map((c) => mat(c));
const beakMat = mat("#ff9f1c", 0.6);
const eyeMat = mat("#101010", 0.3);

const J = (id: string, position: V3, kids: Parameters<typeof group>[1]) =>
  group(id, kids, { position }).runtime({ id, mutable: true });

// Wing: side = +1 (left, +x) or -1 (right, -x). Segments extend along the side axis.
const wing = (side: 1 | -1, name: string) =>
  J(`${name}-in`, [0.28 * side, 0.08, 0.05], [
    primitives.box({ name: `${name}-inner`, size: [0.9, 0.04, 0.55], material: wingInMat }).position(0.45 * side, 0, 0),
    J(`${name}-out`, [0.9 * side, 0, 0], [
      primitives.box({ name: `${name}-outer`, size: [0.85, 0.035, 0.4], material: wingOutMat }).position(0.425 * side, 0, -0.05)
    ])
  ]);

const feathers = [-0.56, -0.28, 0, 0.28, 0.56].map((a, i) => {
  const len = 0.7 - Math.abs(a) * 0.3;
  return primitives
    .box({ name: `feather${i}`, size: [0.13, 0.03, len], material: tailMats[i]! })
    .position(-Math.sin(a) * (len / 2), 0.02, -0.5 - Math.cos(a) * (len / 2))
    .rotate(0, a, 0);
});

const bird = J("yaw", [RADIUS, HEIGHT, 0], [
  J("bank", [0, 0, 0], [
    J("bob", [0, 0, 0], [
      primitives.sphere({ name: "body", size: [0.62, 0.58, 1.2], material: bodyMat }),
      primitives.sphere({ name: "belly", size: [0.5, 0.36, 0.9], material: bellyMat }).position(0, -0.12, 0.05),
      primitives.sphere({ name: "head", size: 0.42, material: bodyMat }).position(0, 0.24, 0.62),
      primitives.cone({ name: "beak", size: [0.14, 0.3, 0.14], material: beakMat }).position(0, 0.2, 0.96).rotate(Math.PI / 2, 0, 0),
      primitives.sphere({ name: "eye-l", size: 0.09, material: eyeMat }).position(0.16, 0.32, 0.78),
      primitives.sphere({ name: "eye-r", size: 0.09, material: eyeMat }).position(-0.16, 0.32, 0.78),
      ...feathers,
      wing(1, "wl"),
      wing(-1, "wr")
    ])
  ])
]);

// Ground and props
let sc = scene({ background: "#a9d4f0" })
  .camera(camera.frame(bird, { fill: 0.5, azimuth: Math.PI / 2 + 0.55, elevation: 0.34, fov: 50 }))
  .add(lights.hemisphere({ skyColor: "#d6ecff", groundColor: "#6b8a4a", intensity: 1.0 }))
  .add(lights.directional({ position: [9, 15, 7], target: [0, 0, 0], intensity: 3, shadow: true }))
  .add(primitives.cylinder({ name: "ground", size: [44, 0.2, 44], material: mat("#6fa34a", 1) }).position(0, -0.1, 0));

const trees: Array<[number, number, number]> = [
  [0, 0, 1.3],
  [2.2, 1.6, 0.9],
  [-2, 1.8, 1.0],
  [18, 2, 1.2],
  [-17, 6, 1.4],
  [12, -15, 1.1],
  [-8, -17, 1.3],
  [4, 18, 1.0],
  [-14, 12, 1.2],
  [16, 11, 0.9]
];
trees.forEach(([x, z, s], i) => {
  sc = sc
    .add(primitives.cylinder({ name: `trunk${i}`, size: [0.35 * s, 1.2 * s, 0.35 * s], material: mat("#6b4a2b") }).position(x, 0.6 * s, z))
    .add(primitives.cone({ name: `crown${i}`, size: [1.8 * s, 3.2 * s, 1.8 * s], material: mat(i % 2 ? "#2f7d3c" : "#3a8f45") }).position(x, 1.2 * s + 1.6 * s, z));
});
[[-5, -4, 0.5], [7.5, -9, 0.7], [-10, 3, 0.6]].forEach(([x, z, s], i) => {
  sc = sc.add(primitives.sphere({ name: `rock${i}`, size: [s! * 1.4, s! * 0.8, s! * 1.1], material: mat("#8c8c86", 1) }).position(x!, s! * 0.3, z!));
});
sc = sc.add(bird);

const app = createAuraApp("#app", { scene: sc });

// The bird's world box, rotation-invariant in X/Z, at its current lap angle (camera.worldBounds is the framing bounds).
const spawnBox = camera.worldBounds(bird);
const halfBox = [(spawnBox.max[0] - spawnBox.min[0]) / 2, (spawnBox.max[1] - spawnBox.min[1]) / 2, (spawnBox.max[2] - spawnBox.min[2]) / 2] as const;
const halfXZ = Math.max(halfBox[0], halfBox[2]);
const birdBoundsAt = (theta: number) => {
  const cx = RADIUS * Math.cos(theta), cz = RADIUS * Math.sin(theta), cy = (spawnBox.min[1] + spawnBox.max[1]) / 2;
  return { min: [cx - halfXZ, cy - halfBox[1], cz - halfXZ] as [number, number, number], max: [cx + halfXZ, cy + halfBox[1], cz + halfXZ] as [number, number, number] };
};
let lastPose = { position: [13, 5.5, -6] as [number, number, number], target: [RADIUS, HEIGHT, 0] as [number, number, number], fov: 50 };
record(() => birdBoundsAt((t / LOOP) * Math.PI * 2), () => lastPose);

let t = 0;
const place = (): void => {
  const theta = (t / LOOP) * Math.PI * 2;
  const w = FLAP_HZ * Math.PI * 2 * t;
  const n = (id: string) => app.nodes.require(id);

  n("yaw").setPosition(RADIUS * Math.cos(theta), HEIGHT, RADIUS * Math.sin(theta));
  n("yaw").setRotation(0, -theta, 0);
  n("bank").setRotation(0, 0, BANK);
  n("bob").setPosition(0, 0.1 * Math.sin(w + Math.PI / 2), 0);

  const inner = 0.12 + 0.6 * Math.sin(w);
  const outer = 0.15 + 0.55 * Math.sin(w - 0.9);
  n("wl-in").setRotation(0, 0, inner);
  n("wl-out").setRotation(0, 0, outer);
  n("wr-in").setRotation(0, 0, -inner);
  n("wr-out").setRotation(0, 0, -outer);

  // Chase camera: outside the circle, slightly behind the bird along its path.
  const camAngle = theta - 0.55;
  const framed = camera.framePose(birdBoundsAt(theta), { fill: 0.5, azimuth: Math.PI / 2 - camAngle, elevation: 0.34, fov: 50 });
  lastPose = { position: framed.position, target: framed.target, fov: 50 };
  app.camera?.setPose({ position: framed.position, target: framed.target }, { cut: true });
};

app.onFrame((f) => {
  t = (t + Math.min(f.dt, 0.1)) % LOOP;
  place();
});

await app.ready();
place();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
