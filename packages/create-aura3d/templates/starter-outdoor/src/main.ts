// Starter: outdoor scene. A rolling valley with a lake at golden hour: one heightfield mesh coloured by height,
// a glossy water plane, instanced typed trees and rocks seated on the terrain, and the `golden-hour` look
// (warm low sun with full shadows, sky, haze and grade as one unit).
// Change the height function, the palette and the scatter; keep the look and the structure.
import { camera, createAuraApp, geometry, instances, interactions, looks, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "golden-hour" as const;
const CELLS = 140; // quads per side
const SIZE = 90; // metres per side
const WATER_Y = 0.2;

// Height in metres: a valley floor with a lake basin, hills rising toward the back and sides.
const height = (x: number, z: number): number => {
  const basin = -3.4 * Math.exp(-((x - 4) ** 2 + (z - 6) ** 2) / 140);
  const hills = 2.6 * Math.sin(x * 0.09 + 0.7) * Math.cos(z * 0.07) + 1.1 * Math.sin(x * 0.23 + z * 0.17) + 0.35 * Math.sin(x * 0.61) * Math.sin(z * 0.53);
  const ridge = Math.max(0, -z - 6) * 0.22 + Math.max(0, Math.abs(x) - 22) * 0.18;
  return 1.2 + hills * 0.7 + ridge + basin;
};
// Linear RGBA by height: wet sand at the shore, two greens, dry grass, rock on the high ridge.
const shade = (h: number): [number, number, number, number] =>
  h < WATER_Y + 0.12 ? [0.42, 0.34, 0.22, 1] : h < 2.4 ? [0.12, 0.26, 0.06, 1] : h < 4.2 ? [0.2, 0.32, 0.08, 1] : h < 6.5 ? [0.38, 0.33, 0.16, 1] : [0.32, 0.29, 0.26, 1];

const positions = new Float32Array((CELLS + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const colors = new Float32Array((CELLS + 1) ** 2 * 4);
const indices: number[] = [];
for (let j = 0; j <= CELLS; j += 1) for (let i = 0; i <= CELLS; i += 1) {
  const v = j * (CELLS + 1) + i;
  const x = (i / CELLS - 0.5) * SIZE;
  const z = (j / CELLS - 0.5) * SIZE;
  const h = height(x, z);
  positions.set([x, h, z], v * 3);
  const e = 0.2; // central differences give a smooth normal
  const nx = height(x - e, z) - height(x + e, z);
  const nz = height(x, z - e) - height(x, z + e);
  const len = Math.hypot(nx, 2 * e, nz);
  normals.set([nx / len, (2 * e) / len, nz / len], v * 3);
  colors.set(shade(h), v * 4);
  if (i < CELLS && j < CELLS) indices.push(v, v + CELLS + 1, v + 1, v + 1, v + CELLS + 1, v + CELLS + 2);
}

// Seeded scatter (same layout on every load) of trees and rocks on dry, gentle ground.
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trees: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
while (trees.length < 110) {
  const x = (rand() - 0.5) * SIZE * 0.9, z = (rand() - 0.5) * SIZE * 0.9, h = height(x, z);
  if (h < WATER_Y + 0.6 || Math.hypot(x - 8, z - 34) < 16) continue; // keep the shore and the foreground clear
  const s = 0.9 + rand() * 0.9;
  trees.push({ position: [x, h - 0.05, z], rotation: [0, rand() * 6.28, 0], scale: [s, s * (0.9 + rand() * 0.3), s] });
}
while (rocks.length < 28) {
  const x = (rand() - 0.5) * SIZE * 0.8, z = (rand() - 0.5) * SIZE * 0.8, h = height(x, z);
  if (h < WATER_Y) continue;
  const s = 0.8 + rand() * 1.2;
  rocks.push({ position: [x, h - 0.1 * s, z], rotation: [0, rand() * 6.28, 0], scale: [s, s * 0.7, s] });
}

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID, { sun: { elevationDeg: 16, azimuthDeg: 235 }, exposureEv: -0.7, fogDensityScale: 0.1, grade: { contrast: 1.15, saturation: 1.2 } }))
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 14, SIZE / 2] } }),
      { name: "terrain", material: material.pbr({ color: "#ffffff", roughness: 0.95 }), receiveShadow: true }
    ))
    .add(primitives.plane({ name: "lake", size: [SIZE, 1, SIZE], material: material.pbr({ color: "#1b5f7a", roughness: 0.18, metallic: 0, opacity: 0.88 }), castShadow: false }).position(0, WATER_Y, 0))
    .add(instances.model(assets.tree, { name: "trees", transforms: trees, targetHeight: 3.2, castShadow: true }))
    .add(instances.model(assets.rocks, { name: "rocks", transforms: rocks, targetHeight: 1, castShadow: true, receiveShadow: true }))
    .add(interactions.orbit({ target: "terrain" }))
    .camera(camera.orbit({ position: [12, 12, 42], target: [0, 1.5, 0], fov: 46, near: 0.3, far: 400 })),
  ...looks.appOptions(LOOK_ID)
});

(window as unknown as { __AURA3D_STARTER__?: unknown }).__AURA3D_STARTER__ = {
  starter: "outdoor",
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { procedural: "heightfield terrain and lake", typed: [assets.tree.url, assets.rocks.url], trees: trees.length, rocks: rocks.length }
};

void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
