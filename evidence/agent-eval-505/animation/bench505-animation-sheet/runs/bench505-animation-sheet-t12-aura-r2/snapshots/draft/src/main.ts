import { camera, createAuraApp, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

const RADIUS = 6;
const HEIGHT = 4;
const LOOP = 8; // seconds per lap
const FLAP_HZ = 2;
const TAU = Math.PI * 2;

// Camera chase pose: outside the circle, trailing slightly behind the bird.
const CAM_RADIUS = 13.5;
const CAM_HEIGHT = 6;
const CAM_LAG = 0.55; // radians behind the bird
const camPose = (theta: number): { position: V3; target: V3 } => {
  const a = theta - CAM_LAG;
  return {
    position: [Math.cos(a) * CAM_RADIUS, CAM_HEIGHT, Math.sin(a) * CAM_RADIUS],
    target: [Math.cos(theta) * RADIUS, HEIGHT, Math.sin(theta) * RADIUS]
  };
};
const start = camPose(0);

const J = (id: string, position: V3, kids: Parameters<typeof group>[1], rotation: V3 = [0, 0, 0]) =>
  group(id, kids, { position, rotation }).runtime({ id, mutable: true });

const bodyMat = material.pbr({ color: "#e8523f", roughness: 0.7 });
const headMat = material.pbr({ color: "#f2a33a", roughness: 0.7 });
const beakMat = material.pbr({ color: "#ffd23a", roughness: 0.6 });
const eyeMat = material.pbr({ color: "#101010", roughness: 0.3 });
const innerMat = material.pbr({ color: "#3b7fd6", roughness: 0.8 });
const outerMat = material.pbr({ color: "#7cc0f2", roughness: 0.8 });
const featherMats = ["#d94a8c", "#e8523f", "#f2a33a", "#e8523f", "#d94a8c"].map((c) =>
  material.pbr({ color: c, roughness: 0.8 })
);

// Wing: inner segment hinged at the shoulder, outer segment hinged at the inner tip.
const wing = (side: 1 | -1, tag: string) =>
  J(`wing-in-${tag}`, [side * 0.2, 0.05, 0], [
    primitives.box({ name: `wing-in-box-${tag}`, size: [0.7, 0.05, 0.5], material: innerMat }).position(side * 0.35, 0, 0),
    J(`wing-out-${tag}`, [side * 0.7, 0, 0], [
      primitives.box({ name: `wing-out-box-${tag}`, size: [0.6, 0.04, 0.38], material: outerMat }).position(side * 0.3, 0, -0.04)
    ])
  ]);

const feathers = [-0.5, -0.25, 0, 0.25, 0.5].map((a, i) =>
  group(`feather-${i}`, [
    primitives.box({ name: `feather-box-${i}`, size: [0.1, 0.03, 0.5], material: featherMats[i]! }).position(0, 0, -0.27)
  ], { position: [0, 0.02, -0.38], rotation: [0, a, 0] })
);

const bird = J("bird-pos", [RADIUS, HEIGHT, 0], [
  J("bird-bank", [0, 0, 0], [
    primitives.sphere({ name: "body", size: [0.5, 0.45, 0.95], material: bodyMat }),
    primitives.sphere({ name: "head", size: 0.34, material: headMat }).position(0, 0.2, 0.5),
    primitives.cone({ name: "beak", size: [0.12, 0.28, 0.12], material: beakMat }).position(0, 0.18, 0.78).rotate(Math.PI / 2, 0, 0),
    primitives.sphere({ name: "eye-l", size: 0.08, material: eyeMat }).position(-0.12, 0.27, 0.63),
    primitives.sphere({ name: "eye-r", size: 0.08, material: eyeMat }).position(0.12, 0.27, 0.63),
    ...feathers,
    wing(-1, "l"),
    wing(1, "r")
  ])
]);

// Static props.
const trunkMat = material.pbr({ color: "#6b4a2b", roughness: 1 });
const leafMat = material.pbr({ color: "#2f7d3a", roughness: 0.9 });
const trees: ReturnType<typeof primitives.cone>[] = [];
const treeSpots: Array<[number, number, number]> = [
  [0, 0, 1.2], [20, 4, 1.3], [-18, 9, 1.1], [-8, -19, 1.4], [10, -18, 1.2],
  [-22, -6, 1.0], [4, 21, 1.3], [-12, 17, 1.1], [22, -9, 1.0], [-2.5, 1.8, 0.7]
];
const props = treeSpots.flatMap(([x, z, s], i) => [
  primitives.cylinder({ name: `trunk-${i}`, size: [0.3 * s, 1.0 * s, 0.3 * s], material: trunkMat }).position(x, 0.5 * s, z),
  primitives.cone({ name: `crown-${i}`, size: [1.8 * s, 2.6 * s, 1.8 * s], material: leafMat }).position(x, 1.0 * s + 1.3 * s, z)
]);
void trees;

const sc = scene({ background: "#a9d3f2" })
  .camera(camera.perspective({ position: start.position, target: start.target, fov: 50, near: 0.5, far: 200 }))
  .add(lights.hemisphere({ skyColor: "#d6ebff", groundColor: "#6a8a4a", intensity: 1.0 }))
  .add(lights.directional({ position: [10, 18, 8], target: [0, 0, 0], intensity: 3, shadow: true }))
  .add(primitives.cylinder({ name: "ground", size: [48, 0.2, 48], material: material.pbr({ color: "#6fa64a", roughness: 1 }) }).position(0, -0.1, 0))
  .addMany(props)
  .add(bird);

const app = createAuraApp("#app", { scene: sc });

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const theta = ((t % LOOP) / LOOP) * TAU;
  const phase = TAU * FLAP_HZ * t;
  const n = (id: string) => app.nodes.require(id);

  // Path, heading (+Z local forward -> tangent) and bank into the turn.
  const bob = -0.1 * Math.cos(phase);
  n("bird-pos").setPosition(Math.cos(theta) * RADIUS, HEIGHT + bob, Math.sin(theta) * RADIUS);
  n("bird-pos").setRotation(0, -theta, 0);
  n("bird-bank").setRotation(0, 0, 0.4);

  // Wings: outer segment lags the inner one by a phase offset.
  const inner = 0.65 * Math.sin(phase);
  const outer = 0.55 * Math.sin(phase - 0.8);
  n("wing-in-r").setRotation(0, 0, inner);
  n("wing-out-r").setRotation(0, 0, outer);
  n("wing-in-l").setRotation(0, 0, -inner);
  n("wing-out-l").setRotation(0, 0, -outer);

  const c = camPose(theta);
  app.camera?.setPose({ position: c.position, target: c.target }, { cut: true });
});

await app.ready();
window.__EVAL_READY__ = true;
