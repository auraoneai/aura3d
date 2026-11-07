import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Seeded RNG: the same forest on every load.
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

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
  const s = 0.8 + rand() * 0.9;
  trunks.push({ position: [x, 0.9 * s, z], scale: [0.4 * s, 1.8 * s, 0.4 * s] });
  canopies.push({ position: [x, 1.6 * s + 2.2 * s, z], rotation: [0, rand() * Math.PI * 2, 0], scale: [2.6 * s, 4.4 * s, 2.6 * s] });
  canopyColors.push(`hsl(${95 + Math.floor(rand() * 50)}, ${45 + Math.floor(rand() * 25)}%, ${20 + Math.floor(rand() * 18)}%)`);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCKS; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = RADIUS * Math.sqrt(rand());
  const s = 0.4 + rand() * 0.9;
  rocks.push({
    position: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r],
    rotation: [0, rand() * Math.PI * 2, 0],
    scale: [s * 1.5, s * 0.9, s * 1.2],
  });
  rockColors.push(`hsl(${20 + Math.floor(rand() * 30)}, ${4 + Math.floor(rand() * 10)}%, ${35 + Math.floor(rand() * 30)}%)`);
}

const white = material.pbr({ color: "#ffffff", roughness: 0.92 });

const app = createAuraApp("#app", {
  scene: scene({ background: "#b4c8d8" })
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.0 }))
    .add(
      lights.directional({
        name: "sun",
        position: [70, 110, 50],
        target: [0, 0, 0],
        intensity: 3,
        color: "#fff1d8",
        shadow: { fit: { center: [0, 0, 0], extent: 75, depth: 200 } },
      }),
    )
    .add(effects.fog({ color: "#b4c8d8", density: 0.006 }))
    .add(primitives.plane({ name: "ground", size: [220, 1, 220], material: material.pbr({ color: "#5e7a3e", roughness: 1 }), castShadow: false, receiveShadow: true }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 }, castShadow: true, receiveShadow: true }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 8 }, castShadow: true, receiveShadow: true }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white, castShadow: true, receiveShadow: true }))
    .camera(camera.orbit({ position: [0, 62, 100], target: [0, 3, 0], fov: 45, near: 5, far: 500, autoRotate: 0.12 })),
});

await app.ready();

let flagged = false;
app.onFrame(() => {
  if (!flagged) {
    flagged = true;
    // onFrame runs before the draw: flag once that frame has been presented.
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
