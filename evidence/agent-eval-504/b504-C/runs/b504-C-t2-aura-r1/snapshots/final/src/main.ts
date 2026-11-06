import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Seeded LCG: the same forest on every load.
let seed = 20240607;
const rand = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

const TREES = 8000;
const ROCKS = 2000;
const RADIUS = 85;

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREES; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 1.1 + rand() * 0.9;
  trunks.push({ position: [x, 0.9 * s, z], scale: [0.4 * s, 1.8 * s, 0.4 * s] });
  canopies.push({ position: [x, 1.4 * s + 2.2 * s, z], rotation: [0, rand() * Math.PI * 2, 0], scale: [2.6 * s, 4.4 * s, 2.6 * s] });
  canopyColors.push(`hsl(${95 + Math.floor(rand() * 50)}, ${45 + Math.floor(rand() * 25)}%, ${20 + Math.floor(rand() * 18)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCKS; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = RADIUS * Math.sqrt(rand());
  const s = 0.5 + rand() * 1.1;
  rocks.push({
    position: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r],
    rotation: [rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6],
    scale: [s * (1 + rand() * 0.6), s * 0.7, s * (1 + rand() * 0.6)]
  });
  const l = 38 + Math.floor(rand() * 32);
  rockColors.push(`hsl(${20 + Math.floor(rand() * 30)}, ${Math.floor(rand() * 12)}%, ${l}%)`);
}

const sc = scene({ background: "#b4c8d8" })
  .camera(camera.orbit({ position: [0, 85, 130], target: [0, 2, 0], fov: 45, near: 20, far: 450, autoRotate: 0.12 }))
  .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
  .add(lights.directional({ name: "sun", position: [90, 130, 60], target: [0, 0, 0], intensity: 3, shadow: true }))
  .add(effects.fog({ color: "#b4c8d8", density: 0.0045, mode: "exp2" }))
  .add(primitives.plane({ name: "ground", size: [260, 1, 260], receiveShadow: true, material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }))
  .add(instances.cylinder({ name: "trunks", transforms: trunks, castShadow: true, receiveShadow: true, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, castShadow: true, receiveShadow: true, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 8 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, castShadow: true, receiveShadow: true, material: material.pbr({ color: "#ffffff", roughness: 1 }) }));

const app = createAuraApp("#app", { scene: sc });
await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
