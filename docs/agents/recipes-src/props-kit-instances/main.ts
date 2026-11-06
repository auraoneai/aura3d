import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

// A stylised village from unit primitives: rocks, pine trees and houses are each ONE instanced draw (colour per instance).
let seed = 20261105; // seeded RNG: the same layout on every load
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
const trunks: AuraTransformSpec[] = [];
const pines: AuraTransformSpec[] = [];
const pineColors: string[] = [];
const walls: AuraTransformSpec[] = [];
const roofs: AuraTransformSpec[] = [];
const wallColors: string[] = [];
const roofColors: string[] = [];

for (let i = 0; i < 70; i += 1) { // rocks: squashed spheres, tilted, grey with a little variation
  const a = rand() * Math.PI * 2, r = between(6, 34), s = between(0.3, 1.1);
  rocks.push({ position: [Math.cos(a) * r, s * 0.25, Math.sin(a) * r], rotation: [0, rand() * 6, 0], scale: [s * 1.5, s * 0.9, s * 1.2] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 22)}%)`);
}
for (let i = 0; i < 110; i += 1) { // pines on a ring around the village, two cones per tree for a layered crown
  const a = rand() * Math.PI * 2, r = between(15, 40), s = between(0.7, 1.3);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  trunks.push({ position: [x, 0.6 * s, z], scale: [0.3 * s, 1.2 * s, 0.3 * s] });
  pines.push({ position: [x, 2.1 * s, z], scale: [2 * s, 3 * s, 2 * s] }, { position: [x, 3.4 * s, z], scale: [1.4 * s, 2.4 * s, 1.4 * s] });
  const crown = `hsl(${135 + Math.floor(rand() * 25)}, 45%, ${20 + Math.floor(rand() * 12)}%)`;
  pineColors.push(crown, crown);
}
for (let gx = -2; gx <= 2; gx += 1) for (let gz = -2; gz <= 2; gz += 1) { // 5x5 plots, some left empty
  if (Math.abs(gx) + Math.abs(gz) > 3 || rand() < 0.25) continue;
  const w = between(2.2, 3.2), h = between(1.8, 3), d = between(2.2, 3.4);
  const x = gx * 5 + between(-0.6, 0.6), z = gz * 5 + between(-0.6, 0.6), yaw = between(-0.25, 0.25);
  walls.push({ position: [x, h / 2, z], rotation: [0, yaw, 0], scale: [w, h, d] });
  roofs.push({ position: [x, h + 0.75, z], rotation: [0, yaw + Math.PI / 4, 0], scale: [Math.max(w, d) * 1.05, 1.5, Math.max(w, d) * 1.05] });
  wallColors.push(`hsl(${30 + Math.floor(rand() * 20)}, 35%, ${68 + Math.floor(rand() * 14)}%)`);
  roofColors.push(`hsl(${5 + Math.floor(rand() * 15)}, 55%, ${34 + Math.floor(rand() * 10)}%)`);
}

const white = material.pbr({ color: "#ffffff", roughness: 0.9 }); // instance colours multiply this base colour once
const app = createAuraApp("#app", {
  scene: scene({ background: "#b9d3e6" })
    .add(environments.neutral({ intensity: 0.45, background: false }))
    .add(lights.hemisphere({ skyColor: "#dbe9ff", groundColor: "#5b5a3a", intensity: 0.35 }))
    .add(lights.directional({ name: "sun", position: [28, 40, 18], target: [0, 0, 0], intensity: 2.2, color: "#fff0d8", shadow: true }))
    .add(effects.fog({ color: "#b9d3e6", density: 0.004 }))
    .add(primitives.plane({ name: "ground", size: [120, 1, 120], material: material.pbr({ color: "#6f8f4c", roughness: 1 }) }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "pines", transforms: pines, colors: pineColors, material: white, params: { radialSegments: 8 } }))
    .add(instances.box({ name: "walls", transforms: walls, colors: wallColors, material: white }))
    .add(instances.cone({ name: "roofs", transforms: roofs, colors: roofColors, material: white, params: { radialSegments: 4 } }))
    .camera(camera.perspective({ position: [26, 21, 30], target: [0, 1.5, 0], fov: 42, near: 1, far: 300 }))
});
await app.ready();
