import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREES = 8000;
const ROCKS = 2000;
const FOREST_RADIUS = 46;

// Deterministic RNG (LCG): same forest on every load.
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();
const disk = (): [number, number] => {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  return [Math.cos(a) * r, Math.sin(a) * r];
};

const trunks: AuraTransformSpec[] = [];
const trunkColors: string[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREES; i += 1) {
  const [x, z] = disk();
  const s = between(0.7, 1.5);
  trunks.push({ position: [x, 0.6 * s, z], scale: [0.3 * s, 1.2 * s, 0.3 * s] });
  trunkColors.push(`hsl(${20 + Math.floor(rand() * 12)}, 40%, ${22 + Math.floor(rand() * 12)}%)`);
  canopies.push({ position: [x, 2.4 * s, z], rotation: [0, rand() * Math.PI * 2, 0], scale: [2 * s, 3.2 * s, 2 * s] });
  canopyColors.push(`hsl(${85 + Math.floor(rand() * 70)}, ${40 + Math.floor(rand() * 25)}%, ${20 + Math.floor(rand() * 18)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCKS; i += 1) {
  const [x, z] = disk();
  const s = between(0.3, 1.0);
  rocks.push({ position: [x, s * 0.2, z], rotation: [0, rand() * Math.PI * 2, 0], scale: [s * 1.5, s * 0.9, s * 1.2] });
  rockColors.push(`hsl(${20 + Math.floor(rand() * 30)}, ${4 + Math.floor(rand() * 10)}%, ${34 + Math.floor(rand() * 26)}%)`);
}

const white = material.pbr({ color: "#ffffff", roughness: 0.9 }); // instance colours multiply this
const FOG = "#b9d3e6";

const app = createAuraApp("#app", {
  scene: scene({ background: FOG })
    .add(environments.neutral({ intensity: 0.45, background: false }))
    .add(lights.hemisphere({ skyColor: "#dbe9ff", groundColor: "#5b5a3a", intensity: 0.35 }))
    .add(
      lights.directional({
        name: "sun",
        position: [45, 60, 30],
        target: [0, 0, 0],
        intensity: 2.4,
        color: "#fff0d8",
        shadow: { mapSize: 4096, fit: { center: [0, 0, 0], extent: 60, depth: 140 } }
      })
    )
    .add(effects.fog({ mode: "exp", color: FOG, density: 0.006 }))
    .add(primitives.plane({ name: "ground", size: [160, 1, 160], material: material.pbr({ color: "#6f8f4c", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, colors: trunkColors, material: white, params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 7 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
    .camera(camera.perspective({ position: [0, 58, 92], target: [0, 0, 0], fov: 45, near: 1, far: 400 }))
});

let angle = 0;
let first = true;
app.onFrame((frame) => {
  angle += frame.dt * 0.12; // slow orbit
  const r = 100;
  app.camera?.setPose({
    position: [Math.sin(angle) * r, 58, Math.cos(angle) * r],
    target: [0, 0, 0]
  });
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
