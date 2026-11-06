import { camera, createAuraApp, effects, instances, interactions, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

let seed = 20240607; // fixed seed: same forest on every load
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const TREES = 8000;
const ROCKS = 2000;
const RADIUS = 70;

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREES; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 0.8 + rand() * 0.8;
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 1.3 * s + 2, z], rotation: [0, rand() * 6.28, 0], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${95 + Math.floor(rand() * 50)}, ${45 + Math.floor(rand() * 20)}%, ${20 + Math.floor(rand() * 20)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCKS; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = RADIUS * Math.sqrt(rand());
  const s = 0.3 + rand() * 0.7;
  rocks.push({
    position: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r],
    rotation: [0, rand() * 6.28, 0],
    scale: [s * 1.4, s * 0.9, s * 1.1]
  });
  rockColors.push(`hsl(${20 + Math.floor(rand() * 30)}, ${3 + Math.floor(rand() * 10)}%, ${35 + Math.floor(rand() * 28)}%)`);
}

const FOG = "#b4c8d8";

const app = createAuraApp("#app", {
  scene: scene({ background: FOG })
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
    .add(lights.directional({ name: "sun", position: [90, 130, 60], target: [0, 0, 0], intensity: 3, color: "#fff0d8", shadow: true }))
    .add(effects.fog({ color: FOG, density: 0.004 }))
    .add(primitives.plane({ name: "ground", size: [260, 1, 260], material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 8 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .add(interactions.orbit({ target: [0, 2, 0], position: [0, 75, 115], autoRotate: 0.08 }))
    .camera(camera.orbit({ position: [0, 75, 115], target: [0, 2, 0], fov: 45 }))
});

let first = true;
app.onFrame(() => {
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});
await app.ready();
