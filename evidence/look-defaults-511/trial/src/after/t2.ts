import {
  camera,
  createAuraApp,
  looks,
  environments,
  instances,
  interactions,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Deterministic PRNG (LCG, fixed seed): same forest every load.
let seed = 20240607;
const rand = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const FOREST_RADIUS = 62;

const trunks: AuraTransformSpec[] = [];
const trunkColors: string[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREE_COUNT; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 0.8 + rand() * 0.9;
  const trunkH = 1.6 * s;
  const canopyH = 4 * s;
  // Unit shapes are centred on their position; scale sets the size.
  trunks.push({ position: [x, trunkH / 2, z], scale: [0.34 * s, trunkH, 0.34 * s] });
  trunkColors.push(`hsl(${22 + Math.floor(rand() * 12)}, 40%, ${22 + Math.floor(rand() * 14)}%)`);
  canopies.push({ position: [x, trunkH + canopyH / 2 - 0.2, z], scale: [2.4 * s, canopyH, 2.4 * s] });
  canopyColors.push(`hsl(${85 + Math.floor(rand() * 60)}, ${45 + Math.floor(rand() * 25)}%, ${22 + Math.floor(rand() * 20)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCK_COUNT; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const s = 0.5 + rand() * 1.1;
  rocks.push({
    position: [Math.cos(a) * r, 0.28 * s, Math.sin(a) * r],
    rotation: [0, rand() * Math.PI * 2, 0],
    scale: [1.3 * s, 0.8 * s, 1.0 * s]
  });
  const l = 30 + Math.floor(rand() * 35);
  rockColors.push(`hsl(${20 + Math.floor(rand() * 30)}, ${5 + Math.floor(rand() * 12)}%, ${l}%)`);
}

const FOG = "#b9cbd9";

const app = createAuraApp("#app", {
  scene: scene({ background: FOG })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 0.9 }))
    .add(
      lights.directional({
        name: "sun",
        position: [70, 110, 50],
        target: [0, 0, 0],
        intensity: 3,
        shadow: { mapSize: 4096, fit: { center: [0, 0, 0], extent: 80, depth: 260 } }
      })
    )
    .add(looks.fogForExtent({ color: FOG, extent: 260, haze: 0.4, mode: "exp2" }))
    .add(
      primitives.plane({
        name: "ground",
        size: [190, 1, 190],
        material: material.pbr({ color: "#5e7a3e", roughness: 1 }),
        castShadow: false
      })
    )
    .add(
      instances.cylinder({
        name: "trunks",
        transforms: trunks,
        colors: trunkColors,
        material: material.pbr({ color: "#ffffff", roughness: 0.95 }),
        params: { radialSegments: 6 }
      })
    )
    .add(
      instances.cone({
        name: "canopies",
        transforms: canopies,
        colors: canopyColors,
        material: material.pbr({ color: "#ffffff", roughness: 0.9 }),
        params: { radialSegments: 8 }
      })
    )
    .add(
      instances.sphere({
        name: "rocks",
        transforms: rocks,
        colors: rockColors,
        material: material.pbr({ color: "#ffffff", roughness: 0.95 })
      })
    )
    .add(interactions.orbit({ target: [0, 2, 0], autoRotate: 0.08 }))
    .camera(camera.orbit({ position: [0, 78, 112], target: [0, 2, 0], fov: 45, near: 5, far: 500 }))
});

let signalled = false;
app.onFrame(() => {
  if (!signalled) {
    signalled = true;
    window.__EVAL_READY__ = true;
  }
});
await app.ready();
