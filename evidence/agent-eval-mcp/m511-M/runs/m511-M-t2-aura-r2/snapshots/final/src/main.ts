import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

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
const RADIUS = 60;

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
  canopies.push({ position: [x, 1.3 * s + 2 * s, z], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${Math.floor(between(85, 150))}, ${Math.floor(between(40, 65))}%, ${Math.floor(between(22, 40))}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCKS; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = RADIUS * Math.sqrt(rand());
  const s = between(0.3, 0.9);
  rocks.push({
    position: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r],
    rotation: [0, rand() * Math.PI * 2, 0],
    scale: [s * 1.5, s * 0.9, s * 1.2],
  });
  rockColors.push(`hsl(${Math.floor(between(20, 45))}, ${Math.floor(between(4, 14))}%, ${Math.floor(between(32, 62))}%)`);
}

const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
const SKY = "#b4c8d8";

const app = createAuraApp("#app", {
  scene: scene({ background: SKY })
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
    .add(lights.directional({ name: "sun", position: [60, 90, 40], target: [0, 0, 0], intensity: 3, color: "#fff0d8", shadow: true }))
    .add(effects.fog({ color: SKY, density: 0.003, mode: "exp" }))
    .add(primitives.plane({ name: "ground", size: [220, 1, 220], material: material.pbr({ color: "#5f7f40", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 8 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
    .camera(camera.orbit({ position: [0, 62, 105], target: [0, 0, 0], fov: 45, near: 5, far: 500 })),
});

let angle = 0;
const ORBIT_RADIUS = 105;
const ORBIT_HEIGHT = 62;
let ready = false;
app.onFrame((frame) => {
  angle += frame.dt * 0.1; // slow orbit: about one lap per minute
  app.camera?.setPose(
    { position: [Math.sin(angle) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.cos(angle) * ORBIT_RADIUS], target: [0, 0, 0] },
    { cut: true },
  );
  if (!ready) {
    ready = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
await app.ready();
