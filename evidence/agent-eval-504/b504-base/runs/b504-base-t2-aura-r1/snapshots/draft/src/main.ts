import { createAuraApp, effects, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREES = 8000;
const ROCKS = 2000;
const FOREST_RADIUS = 70;
const FOG_COLOR = "#b4c8d8";

// Fixed-seed LCG: the same forest on every load.
let seed = 20240607;
const rand = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREES; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 0.8 + rand() * 0.8;
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 1.3 * s + 2, z], rotation: [0, rand() * Math.PI * 2, 0], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${95 + Math.floor(rand() * 50)}, ${45 + Math.floor(rand() * 20)}%, ${22 + Math.floor(rand() * 18)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCKS; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const s = 0.4 + rand() * 0.9;
  rocks.push({
    position: [Math.cos(a) * r, 0.25 * s, Math.sin(a) * r],
    rotation: [0, rand() * Math.PI * 2, 0],
    scale: [s * (1 + rand() * 0.6), s * 0.65, s * (1 + rand() * 0.6)]
  });
  rockColors.push(`hsl(${20 + Math.floor(rand() * 30)}, ${4 + Math.floor(rand() * 10)}%, ${34 + Math.floor(rand() * 26)}%)`);
}

const CAM_RADIUS = 125;
const CAM_HEIGHT = 68;
const CAM_TARGET: [number, number, number] = [0, 2, 0];
const camPos = (t: number): [number, number, number] => [Math.sin(t) * CAM_RADIUS, CAM_HEIGHT, Math.cos(t) * CAM_RADIUS];

const app = createAuraApp("#app", {
  scene: scene({
    background: FOG_COLOR,
    camera: { mode: "perspective", position: camPos(0), target: CAM_TARGET, fov: 45, near: 10, far: 450 }
  })
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
    .add(
      lights.directional({
        name: "sun",
        position: [90, 130, 60],
        target: [0, 0, 0],
        intensity: 3,
        shadow: { mapSize: 4096, fit: { center: [0, 0, 0], extent: 90, depth: 300 } }
      })
    )
    .add(effects.fog({ color: FOG_COLOR, mode: "exp", density: 0.004 }))
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

let angle = 0;
let firstFrame = true;
app.onFrame((frame) => {
  angle += frame.dt * 0.12;
  app.camera?.setPose({ position: camPos(angle), target: CAM_TARGET });
  if (firstFrame) {
    firstFrame = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
