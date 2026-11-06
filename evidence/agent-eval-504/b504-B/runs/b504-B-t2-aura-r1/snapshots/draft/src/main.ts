import { camera, createAuraApp, effects, instances, interactions, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const FOREST_RADIUS = 70;
const FOG_COLOR = "#b4c8d8";

// Seeded LCG: the same forest on every load.
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();
const scatter = (): { x: number; z: number } => {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
};

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREE_COUNT; i += 1) {
  const { x, z } = scatter();
  const s = between(0.8, 1.6);
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 1.3 * s + 2 * s, z], rotation: [0, rand() * Math.PI * 2, 0], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${95 + Math.floor(rand() * 50)}, ${45 + Math.floor(rand() * 25)}%, ${20 + Math.floor(rand() * 18)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCK_COUNT; i += 1) {
  const { x, z } = scatter();
  const s = between(0.4, 1.3);
  rocks.push({
    position: [x, s * 0.3, z],
    rotation: [0, rand() * Math.PI * 2, 0],
    scale: [s * between(1, 1.6), s * between(0.6, 1), s * between(1, 1.5)]
  });
  rockColors.push(`hsl(${20 + Math.floor(rand() * 30)}, ${4 + Math.floor(rand() * 10)}%, ${32 + Math.floor(rand() * 30)}%)`);
}

const white = material.pbr({ color: "#ffffff", roughness: 0.9 }); // instance colours multiply this

const app = createAuraApp("#app", {
  scene: scene({ background: FOG_COLOR })
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
    .add(
      lights.directional({
        name: "sun",
        position: [90, 130, 60],
        target: [0, 0, 0],
        intensity: 3,
        color: "#fff1d8",
        shadow: { mapSize: 4096, filter: "pcf", cascades: 1, fit: { center: [0, 0, 0], extent: 85, depth: 300 } }
      })
    )
    .add(effects.fog({ color: FOG_COLOR, density: 0.0028 }))
    .add(primitives.plane({ name: "ground", size: [300, 1, 300], material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 8 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
    .add(interactions.orbit({ target: [0, 2, 0], position: [0, 85, 120], autoRotate: 0.08 }))
    .camera(camera.orbit({ position: [0, 85, 120], target: [0, 2, 0], fov: 45, near: 5, far: 600 }))
});

let first = true;
app.onFrame(() => {
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});
await app.ready();
