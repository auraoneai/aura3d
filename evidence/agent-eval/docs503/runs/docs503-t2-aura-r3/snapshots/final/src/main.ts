import {
  createAuraApp,
  effects,
  instances,
  interactions,
  camera,
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

const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const RADIUS = 75;

// Fixed-seed LCG: the same forest on every load.
let seed = 20240607;
const rand = (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREE_COUNT; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 0.8 + rand() * 0.8;
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 3.2 * s, z], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${95 + Math.floor(rand() * 50)}, ${45 + Math.floor(rand() * 20)}%, ${22 + Math.floor(rand() * 18)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCK_COUNT; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = RADIUS * Math.sqrt(rand());
  const s = 0.4 + rand() * 1.0;
  rocks.push({
    position: [Math.cos(a) * r, 0.3 * s, Math.sin(a) * r],
    rotation: [0, rand() * Math.PI * 2, 0],
    scale: [s * (0.8 + rand() * 0.6), s * 0.6, s * (0.8 + rand() * 0.6)]
  });
  rockColors.push(`hsl(${25 + Math.floor(rand() * 30)}, ${4 + Math.floor(rand() * 10)}%, ${32 + Math.floor(rand() * 30)}%)`);
}

const FOG = "#b4c8d8";

const app = createAuraApp("#app", {
  scene: scene({ background: FOG })
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
    .add(lights.directional({ name: "sun", position: [90, 130, 60], target: [0, 0, 0], intensity: 3, shadow: true }))
    .add(effects.fog({ mode: "exp", color: FOG, density: 0.004 }))
    .add(primitives.plane({ name: "ground", size: [260, 1, 260], material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }))
    .add(
      instances.cylinder({
        name: "trunks",
        transforms: trunks,
        material: material.pbr({ color: "#5a3d24", roughness: 0.95 }),
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
    .camera(
      camera.orbit({
        position: [0, 85, 125],
        target: [0, 2, 0],
        fov: 45,
        near: 5,
        far: 500,
        autoRotate: 0.08
      })
    )
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
