import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREES = 8000;
const ROCKS = 2000;
const RADIUS = 70;

// Seeded RNG: the same forest on every load.
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();
const int = (a: number, b: number): number => Math.floor(between(a, b + 1));

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREES; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = between(0.8, 1.6);
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 1.3 * s + 2, z], rotation: [0, rand() * 6.28, 0], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${int(85, 145)}, ${int(40, 65)}%, ${int(20, 40)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCKS; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = RADIUS * Math.sqrt(rand());
  const s = between(0.3, 1.0);
  rocks.push({
    position: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r],
    rotation: [0, rand() * 6.28, 0],
    scale: [s * 1.4, s * 0.9, s * 1.1],
  });
  rockColors.push(`hsl(${int(20, 45)}, ${int(3, 14)}%, ${int(35, 62)}%)`);
}

const white = material.pbr({ color: "#ffffff", roughness: 0.9 }); // instance colours multiply this

const app = createAuraApp("#app", {
  scene: scene({ background: "#b4c8d8" })
    .camera(camera.orbit({ position: [0, 85, 130], target: [0, 2, 0], fov: 45, near: 20, far: 450, autoRotate: 0.12 }))
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
    .add(lights.directional({ name: "sun", position: [90, 130, 60], target: [0, 0, 0], intensity: 3, shadow: true }))
    .add(effects.fog({ mode: "exp", color: "#b4c8d8", density: 0.0045 }))
    .add(primitives.plane({ name: "ground", size: [260, 1, 260], material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 8 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white })),
});

let flagged = false;
app.onFrame(() => {
  if (!flagged) {
    flagged = true;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
