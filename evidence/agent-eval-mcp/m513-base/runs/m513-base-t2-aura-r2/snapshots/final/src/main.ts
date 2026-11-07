import {
  camera,
  createAuraApp,
  effects,
  instances,
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
const FOREST_RADIUS = 70;
const FOG_COLOR = "#b4c8d8";

// Fixed-seed LCG: the same forest on every load.
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREE_COUNT; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 0.8 + rand() * 0.8;
  const yaw = rand() * Math.PI * 2;
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s], rotation: [0, yaw, 0] });
  canopies.push({ position: [x, 1.3 * s + 2 * s, z], scale: [2.4 * s, 4 * s, 2.4 * s], rotation: [0, yaw, 0] });
  canopyColors.push(`hsl(${95 + Math.floor(rand() * 50)}, ${45 + Math.floor(rand() * 25)}%, ${22 + Math.floor(rand() * 18)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCK_COUNT; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const s = 0.4 + rand() * 0.9;
  rocks.push({
    position: [Math.cos(a) * r, 0.25 * s, Math.sin(a) * r],
    scale: [s * (0.9 + rand() * 0.5), s * 0.6, s * (0.9 + rand() * 0.5)],
    rotation: [0, rand() * Math.PI * 2, 0]
  });
  rockColors.push(`hsl(${20 + Math.floor(rand() * 30)}, ${4 + Math.floor(rand() * 12)}%, ${35 + Math.floor(rand() * 30)}%)`);
}

const app = createAuraApp("#app", {
  scene: scene({ background: FOG_COLOR })
    .camera(
      camera.orbit({
        position: [0, 80, 125],
        target: [0, 2, 0],
        fov: 45,
        near: 20,
        far: 450,
        autoRotate: 0.08
      })
    )
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
    .add(
      lights.directional({
        name: "sun",
        position: [90, 130, 60],
        target: [0, 0, 0],
        intensity: 3,
        shadow: { mapSize: 4096 }
      })
    )
    .add(effects.fog({ color: FOG_COLOR, density: 0.0045 }))
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
});

let announced = false;
app.onFrame(() => {
  if (!announced) {
    announced = true;
    window.__EVAL_READY__ = true;
  }
});
await app.ready();
