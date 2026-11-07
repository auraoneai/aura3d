import { camera, createAuraApp, effects, instances, interactions, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

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
const RADIUS = 62;

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
  canopies.push({ position: [x, 1.3 * s + 2 * s, z], scale: [2.4 * s, 4 * s, 2.4 * s], rotation: [0, rand() * 6.28, 0] });
  canopyColors.push(`hsl(${Math.floor(between(85, 150))}, ${Math.floor(between(40, 65))}%, ${Math.floor(between(20, 40))}%)`);
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
    scale: [s * 1.4, s * 0.9, s * 1.1]
  });
  rockColors.push(`hsl(${Math.floor(between(20, 50))}, ${Math.floor(between(3, 12))}%, ${Math.floor(between(35, 62))}%)`);
}

const FOG = "#b4c8d8";

const app = createAuraApp("#app", {
  scene: scene({ background: FOG })
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
    .add(
      lights.directional({
        name: "sun",
        position: [60, 90, 40],
        target: [0, 0, 0],
        intensity: 3,
        color: "#fff1d8",
        shadow: { mapSize: 4096, fit: { center: [0, 0, 0], extent: 75, depth: 200 } }
      })
    )
    .add(effects.fog({ color: FOG, density: 0.004 }))
    .add(primitives.plane({ name: "ground", size: [200, 1, 200], material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 8 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 1 }) }))
    .add(interactions.orbit({ target: [0, 2, 0], position: [0, 75, 105], autoRotate: 0.12 }))
    .camera(camera.orbit({ position: [0, 75, 105], target: [0, 2, 0], fov: 45 }))
});

let frames = 0;
app.onFrame(() => {
  frames += 1;
});

await app.ready();
const waitForFrame = (): void => {
  if (frames > 0) {
    window.__EVAL_READY__ = true;
  } else {
    requestAnimationFrame(waitForFrame);
  }
};
requestAnimationFrame(waitForFrame);
