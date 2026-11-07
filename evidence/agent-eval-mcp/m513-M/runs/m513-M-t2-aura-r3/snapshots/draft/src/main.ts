import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Seeded RNG: the same forest on every load.
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();

const TREES = 8000;
const ROCKS = 2000;
const FOREST_RADIUS = 52;

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREES; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = between(0.8, 1.5);
  trunks.push({ position: [x, 0.7 * s, z], scale: [0.35 * s, 1.4 * s, 0.35 * s] });
  canopies.push({ position: [x, 1.2 * s + 1.7 * s, z], rotation: [0, rand() * 6.28, 0], scale: [2.2 * s, 3.4 * s, 2.2 * s] });
  canopyColors.push(`hsl(${Math.floor(between(85, 150))}, ${Math.floor(between(40, 65))}%, ${Math.floor(between(20, 38))}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCKS; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const s = between(0.3, 0.9);
  rocks.push({
    position: [Math.cos(a) * r, s * 0.25, Math.sin(a) * r],
    rotation: [0, rand() * 6.28, 0],
    scale: [s * between(1.1, 1.7), s * 0.8, s * between(1, 1.4)]
  });
  rockColors.push(`hsl(${Math.floor(between(15, 45))}, ${Math.floor(between(3, 12))}%, ${Math.floor(between(30, 62))}%)`);
}

const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
const FOG = "#b9d3e6";

const app = createAuraApp("#app", {
  scene: scene({ background: FOG })
    .add(environments.neutral({ intensity: 0.45, background: false }))
    .add(lights.hemisphere({ skyColor: "#dbe9ff", groundColor: "#5b5a3a", intensity: 0.4 }))
    .add(lights.directional({ name: "sun", position: [45, 70, 30], target: [0, 0, 0], intensity: 2.4, color: "#fff0d8", shadow: true }))
    .add(effects.fog({ color: FOG, density: 0.005, mode: "exponential" }))
    .add(primitives.plane({ name: "ground", size: [140, 1, 140], material: material.pbr({ color: "#6f8f4c", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 8 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
    .camera(camera.perspective({ position: [0, 62, 95], target: [0, 0, 0], fov: 48, near: 1, far: 500 }))
});

const RADIUS = 100;
const HEIGHT = 62;
let angle = 0;
let flagged = false;
app.onFrame((frame) => {
  angle += frame.dt * 0.12;
  app.camera?.setPose({
    position: [Math.sin(angle) * RADIUS, HEIGHT, Math.cos(angle) * RADIUS],
    target: [0, 0, 0]
  });
  if (!flagged) {
    flagged = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
