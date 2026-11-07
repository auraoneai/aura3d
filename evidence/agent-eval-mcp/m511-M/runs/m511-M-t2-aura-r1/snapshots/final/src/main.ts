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
const FOREST_RADIUS = 62;

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < TREES; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = between(0.8, 1.6);
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 1.3 * s + 2 * s, z], rotation: [0, rand() * 6.28, 0], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${95 + Math.floor(rand() * 50)}, ${40 + Math.floor(rand() * 25)}%, ${22 + Math.floor(rand() * 18)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCKS; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const s = between(0.35, 1.1);
  rocks.push({
    position: [Math.cos(a) * r, s * 0.25, Math.sin(a) * r],
    rotation: [0, rand() * 6.28, 0],
    scale: [s * 1.4, s * 0.9, s * 1.2],
  });
  rockColors.push(`hsl(${20 + Math.floor(rand() * 25)}, ${4 + Math.floor(rand() * 8)}%, ${35 + Math.floor(rand() * 28)}%)`);
}

const fogColor = "#b4c8d8";
const white = material.pbr({ color: "#ffffff", roughness: 0.9 }); // instance colours multiply this

const ORBIT_RADIUS = 88;
const ORBIT_HEIGHT = 58;
const TARGET: [number, number, number] = [0, 2, 0];

const app = createAuraApp("#app", {
  scene: scene({ background: fogColor })
    .add(environments.neutral({ intensity: 0.4, background: false }))
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 0.7 }))
    .add(
      lights.directional({
        name: "sun",
        position: [70, 100, 45],
        target: [0, 0, 0],
        intensity: 2.8,
        color: "#fff0d8",
        shadow: { mapSize: 4096, fit: { center: [0, 0, 0], extent: 75, depth: 200 }, cascades: 1 },
      }),
    )
    .add(effects.fog({ mode: "exp", color: fogColor, density: 0.004 }))
    .add(primitives.plane({ name: "ground", size: [220, 1, 220], material: material.pbr({ color: "#6f8f4c", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 8 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
    .camera(camera.perspective({ position: [ORBIT_RADIUS, ORBIT_HEIGHT, 0], target: TARGET, fov: 45, near: 5, far: 500 })),
});

let angle = 0;
let first = true;
app.onFrame((frame) => {
  angle += frame.dt * 0.12; // slow orbit
  app.camera?.setPose(
    { position: [Math.cos(angle) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.sin(angle) * ORBIT_RADIUS], target: TARGET },
    { cut: true },
  );
  if (first) {
    first = false;
    // The engine draws this frame right after the callbacks; flag readiness once it has presented.
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
  }
});

await app.ready();
