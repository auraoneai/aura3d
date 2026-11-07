import { camera, createAuraApp, effects, group, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];
type Kids = Parameters<typeof group>[1];

const LOOP = 8; // seconds per lap
const RADIUS = 6;
const HEIGHT = 4;
const FLAP_HZ = 2;
const TAU = Math.PI * 2;
const SKY = "#bfd9ee";

const paperWhite = material.pbr({ color: "#f4f1e8", roughness: 0.85 });
const paperRed = material.pbr({ color: "#e4553f", roughness: 0.85 });
const paperYellow = material.pbr({ color: "#f4b942", roughness: 0.85 });
const paperBlue = material.pbr({ color: "#3f7fc4", roughness: 0.85 });
const beakMat = material.pbr({ color: "#ff9a1f", roughness: 0.7 });
const eyeMat = material.pbr({ color: "#15161a", roughness: 0.4 });

const J = (id: string, position: V3, kids: Kids, rotation?: V3) =>
  group(id, kids, rotation ? { position, rotation } : { position }).runtime({ id, mutable: true });
const S = (id: string, position: V3, kids: Kids, rotation?: V3) =>
  group(id, kids, rotation ? { position, rotation } : { position });

// One wing: shoulder joint -> inner segment -> elbow joint -> outer segment.
const wing = (side: 1 | -1, name: string) =>
  J(`${name}-shoulder`, [side * 0.3, 0.12, 0.05], [
    primitives.box({ name: `${name}-inner`, size: [1.0, 0.05, 0.8], material: side > 0 ? paperRed : paperRed }).position(side * 0.5, 0, 0),
    J(`${name}-elbow`, [side * 1.0, 0, 0], [
      primitives.box({ name: `${name}-outer`, size: [0.95, 0.04, 0.55], material: paperYellow }).position(side * 0.475, 0, -0.1),
      primitives.box({ name: `${name}-tip`, size: [0.35, 0.035, 0.3], material: paperBlue }).position(side * 1.1, 0, -0.18)
    ])
  ]);

const feather = (i: number) =>
  S(`feather${i}`, [0, 0.04, -0.75], [
    primitives.box({ name: `feather${i}-blade`, size: [0.14, 0.03, 0.75], material: i % 2 === 0 ? paperBlue : paperYellow }).position(0, 0, -0.37)
  ], [0, (i - 2) * 0.28, 0]);

const bird = J("bird", [RADIUS, HEIGHT, 0], [
  J("bank", [0, 0, 0], [
    J("body", [0, 0, 0], [
      primitives.sphere({ name: "torso", size: [0.8, 0.7, 1.7], material: paperWhite }),
      primitives.sphere({ name: "head", size: 0.5, material: paperWhite }).position(0, 0.3, 0.85),
      primitives.cone({ name: "beak", size: [0.2, 0.45, 0.2], material: beakMat }).position(0, 0.27, 1.28).rotate(Math.PI / 2, 0, 0),
      primitives.sphere({ name: "eye-l", size: 0.1, material: eyeMat }).position(0.2, 0.38, 1.0),
      primitives.sphere({ name: "eye-r", size: 0.1, material: eyeMat }).position(-0.2, 0.38, 1.0),
      S("tail", [0, 0, 0], [0, 1, 2, 3, 4].map(feather)),
      wing(1, "wr"),
      wing(-1, "wl")
    ])
  ])
]);

// Static scenery: trees as cone canopies on cylinder trunks.
const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const treeSpots: Array<[number, number, number]> = [
  [0, 0, 1.3], [-1.5, 1, 0.9], [13, 0.3, 1.2], [14, 1.4, 1.0], [12, 2.3, 1.3], [15, 3.3, 1.1], [13, 4.2, 1.4],
  [16, 5.1, 1.0], [12.5, 5.9, 1.2], [17, 0.9, 1.3], [18, 2.0, 1.1], [17, 3.9, 1.2], [19, 4.9, 1.4], [18, 6.0, 1.0]
];
for (const [r, a, s] of treeSpots) {
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  trunks.push({ position: [x, 0.4 * s, z], scale: [0.3 * s, 0.8 * s, 0.3 * s] });
  canopies.push({ position: [x, 0.8 * s + 1.1 * s, z], scale: [1.6 * s, 2.2 * s, 1.6 * s] });
}

const sc = scene({ background: SKY })
  .camera(camera.follow({
    targetNode: "bird",
    target: [RADIUS, HEIGHT, 0],
    offset: [8, 3.5, -5],
    offsetMode: "target-yaw",
    fov: 50,
    near: 0.1,
    far: 200,
    smoothing: 0.1
  }))
  .add(lights.hemisphere({ skyColor: "#dcecfa", groundColor: "#6f8a4c", intensity: 1.0 }))
  .add(lights.directional({ position: [10, 20, 8], target: [0, 0, 0], intensity: 3, shadow: true }))
  .add(effects.fog({ color: SKY, density: 0.004 }))
  .add(primitives.cylinder({ name: "ground", size: [46, 0.2, 46], material: material.pbr({ color: "#6e9a4a", roughness: 1 }) }).position(0, -0.1, 0))
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6a4a2c", roughness: 1 }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, material: material.pbr({ color: "#2f6b3a", roughness: 0.9 }), params: { radialSegments: 8 } }))
  .add(bird);

const app = createAuraApp("#app", { scene: sc });

let t = 0;
app.onFrame((f) => {
  t = (t + f.dt) % LOOP;
  const a = (t / LOOP) * TAU;
  const ph = t * FLAP_HZ * TAU;
  const n = (id: string) => app.nodes.require(id);

  // Circular path; heading follows the tangent (local +Z is forward).
  n("bird").setPosition(Math.cos(a) * RADIUS, HEIGHT, Math.sin(a) * RADIUS);
  n("bird").setRotation(0, -a, 0);
  // Bank toward the circle centre (local -X side dips).
  n("bank").setRotation(0, 0, 0.38 + 0.03 * Math.sin(ph));
  // Body rises and falls with the flap.
  n("body").setPosition(0, 0.12 * Math.sin(ph + Math.PI / 2), 0);

  const inner = 0.6 * Math.sin(ph);
  const outer = 0.55 * Math.sin(ph - 0.8);
  n("wr-shoulder").setRotation(0, 0, inner);
  n("wl-shoulder").setRotation(0, 0, -inner);
  n("wr-elbow").setRotation(0, 0, outer);
  n("wl-elbow").setRotation(0, 0, -outer);
});

await app.ready();
window.__EVAL_READY__ = true;
