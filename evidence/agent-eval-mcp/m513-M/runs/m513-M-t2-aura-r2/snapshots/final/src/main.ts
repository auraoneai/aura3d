import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREES = 8000;
const ROCKS = 2000;
const FOREST_RADIUS = 58;

// Seeded RNG: identical forest on every load.
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];

for (let i = 0; i < TREES; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = between(0.8, 1.6);
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 1.3 * s + 2 * s, z], rotation: [0, rand() * 6.28, 0], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${Math.floor(between(85, 150))}, ${Math.floor(between(40, 65))}%, ${Math.floor(between(20, 38))}%)`);
}

for (let i = 0; i < ROCKS; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const s = between(0.3, 0.9);
  rocks.push({
    position: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r],
    rotation: [0, rand() * 6.28, 0],
    scale: [s * 1.4, s * 0.9, s * 1.1],
  });
  rockColors.push(`hsl(${Math.floor(between(20, 50))}, ${Math.floor(between(3, 12))}%, ${Math.floor(between(34, 62))}%)`);
}

const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
const SKY = "#b4c8d8";

const app = createAuraApp("#app", {
  scene: scene({ background: SKY })
    .add(environments.neutral({ intensity: 0.45, background: false }))
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 0.5 }))
    .add(lights.directional({ name: "sun", position: [60, 90, 40], target: [0, 0, 0], intensity: 2.6, color: "#fff0d8", shadow: true }))
    .add(effects.fog({ color: SKY, density: 0.0035 }))
    .add(primitives.plane({ name: "ground", size: [240, 1, 240], material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 8 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
    .camera(camera.perspective({ position: [0, 60, 105], target: [0, 0, 0], fov: 45, near: 5, far: 500 })),
});

const RADIUS = 105;
const HEIGHT = 60;
let angle = 0;
let first = true;

app.onFrame((frame) => {
  angle += frame.dt * 0.12; // slow orbit
  app.camera?.setPose(
    { position: [Math.sin(angle) * RADIUS, HEIGHT, Math.cos(angle) * RADIUS], target: [0, 0, 0] },
    { cut: true },
  );
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
