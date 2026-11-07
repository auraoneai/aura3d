import { createAuraApp, effects, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const FOREST_RADIUS = 70;
const FOG_COLOR = "#b4c8d8";

// mulberry32: fixed seed, same forest on every load
let state = 0x5eed1234;
const rand = (): number => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREE_COUNT; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 0.8 + rand() * 0.8;
  // unit shapes: scale sets the size
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 1.3 * s + 2, z], rotation: [0, rand() * Math.PI * 2, 0], scale: [2.4 * s, 4 * s, 2.4 * s] });
  const hue = 85 + Math.floor(rand() * 60);
  const sat = 40 + Math.floor(rand() * 25);
  const light = 22 + Math.floor(rand() * 20);
  canopyColors.push(`hsl(${hue}, ${sat}%, ${light}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCK_COUNT; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const s = 0.4 + rand() * 1.0;
  rocks.push({
    position: [Math.cos(a) * r, 0.25 * s, Math.sin(a) * r],
    rotation: [0, rand() * Math.PI * 2, 0],
    scale: [s * (0.9 + rand() * 0.6), s * (0.6 + rand() * 0.4), s * (0.9 + rand() * 0.6)]
  });
  const hue = 20 + Math.floor(rand() * 30);
  const sat = Math.floor(rand() * 14);
  const light = 38 + Math.floor(rand() * 28);
  rockColors.push(`hsl(${hue}, ${sat}%, ${light}%)`);
}

const CAM_RADIUS = 112;
const CAM_HEIGHT = 76;
const CAM_TARGET: [number, number, number] = [0, 2, 0];

const app = createAuraApp("#app", {
  scene: scene({
    background: FOG_COLOR,
    camera: { mode: "perspective", position: [0, CAM_HEIGHT, CAM_RADIUS], target: CAM_TARGET, fov: 45, near: 20, far: 450 }
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
    .add(effects.fog({ mode: "exp", color: FOG_COLOR, density: 0.004 }))
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
app.onFrame((frame) => {
  angle += frame.dt * 0.12; // slow orbit, one lap in about 52 s
  app.camera?.setPose({
    position: [Math.sin(angle) * CAM_RADIUS, CAM_HEIGHT, Math.cos(angle) * CAM_RADIUS],
    target: CAM_TARGET
  }, { cut: true });
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  });
});
