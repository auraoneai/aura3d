import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const FOREST_RADIUS = 58;
const FOG_COLOR = "#b4c8d8";

// Fixed seed: same forest on every load.
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (lo: number, hi: number): number => lo + rand() * (hi - lo);

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREE_COUNT; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = between(0.8, 1.6);
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 1.3 * s + 2 * s, z], scale: [2.4 * s, 4 * s, 2.4 * s], rotation: [0, rand() * Math.PI * 2, 0] });
  canopyColors.push(`hsl(${Math.floor(between(85, 150))}, ${Math.floor(between(40, 65))}%, ${Math.floor(between(20, 40))}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCK_COUNT; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const s = between(0.4, 1.3);
  rocks.push({
    position: [Math.cos(a) * r, 0.3 * s, Math.sin(a) * r],
    scale: [s * between(0.9, 1.5), s * between(0.5, 0.8), s * between(0.9, 1.5)],
    rotation: [0, rand() * Math.PI * 2, 0]
  });
  rockColors.push(`hsl(${Math.floor(between(20, 50))}, ${Math.floor(between(0, 12))}%, ${Math.floor(between(32, 62))}%)`);
}

const app = createAuraApp("#app", {
  scene: scene({ background: FOG_COLOR })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.0 }))
    .add(lights.directional({ name: "sun", position: [70, 100, 45], target: [0, 0, 0], intensity: 3, shadow: true }))
    .add(effects.fog({ mode: "exp", color: FOG_COLOR, density: 0.0035 }))
    .add(primitives.plane({ name: "ground", size: [170, 1, 170], material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 8 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .camera(camera.orbit({ position: [0, 52, 92], target: [0, 2, 0], fov: 45, near: 5, far: 400, autoRotate: 0.08 }))
});

let marked = false;
app.onFrame(() => {
  if (!marked) {
    marked = true;
    window.__EVAL_READY__ = true;
  }
});
await app.ready();
