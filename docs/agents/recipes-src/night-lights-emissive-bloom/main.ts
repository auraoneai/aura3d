import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

// A night street: lantern posts with real point lights, glowing windows, a moon, fog and bloom.
// Emissive materials only look like light sources when bloom and fog give them a halo and depth.
const lampSpots: Array<[number, number]> = [[-4, 6], [-4, -2], [-4, -10], [4, 2], [4, -6], [4, -14]];
const warmWindows: AuraTransformSpec[] = [];
const coolWindows: AuraTransformSpec[] = [];
const towers: AuraTransformSpec[] = [];
let seed = 99;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

for (const side of [-1, 1]) for (let i = 0; i < 6; i += 1) {
  const x = side * 9.5, z = 8 - i * 6.5, h = 6 + rand() * 7;
  towers.push({ position: [x, h / 2, z], scale: [4.6, h, 5] });
  for (let row = 0; row < Math.floor(h / 1.6); row += 1) for (let col = 0; col < 2; col += 1) {
    if (rand() < 0.35) continue; // dark windows
    (rand() < 0.7 ? warmWindows : coolWindows).push({ position: [x - side * 2.33, 1.2 + row * 1.5, z - 1.1 + col * 2.2], scale: [0.04, 0.7, 0.9] });
  }
}

const stage = scene({ background: "#05070d" })
  .add(environments.neutral({ intensity: 0.25, background: false }))
  .add(lights.directional({ name: "moonlight", position: [-10, 16, -10], target: [0, 0, -4], intensity: 1.1, color: "#7d9bff", shadow: true }))
  .add(primitives.plane({ name: "street", size: [24, 1, 60], material: material.pbr({ color: "#1b1e26", roughness: 0.35, metallic: 0.2 }) }).position(0, 0, -6))
  .add(instances.box({ name: "towers", transforms: towers, material: material.pbr({ color: "#262b36", roughness: 0.9 }) }))
  .add(instances.box({ name: "windows-warm", transforms: warmWindows, material: material.emissive({ color: "#ffcf7a", emissive: "#ffb84d", emissiveIntensity: 1.6 }) })) // emissive colour comes from the material, not from instance colours
  .add(instances.box({ name: "windows-cool", transforms: coolWindows, material: material.emissive({ color: "#9fd2ff", emissive: "#6fb8ff", emissiveIntensity: 1.6 }) }))
  .add(primitives.sphere({ name: "moon", size: 3, material: material.emissive({ color: "#dfe8ff", emissive: "#dfe8ff", emissiveIntensity: 2.5 }) }).position(-16, 26, -42))
  .add(effects.fog({ color: "#0a1020", density: 0.028 }))
  .add(effects.bloom({ intensity: 1, threshold: 0.6, radius: 0.6 }))
  .camera(camera.perspective({ position: [0, 3.2, 14], target: [0, 3.6, -12], fov: 46, near: 0.2, far: 160 }));

for (const [i, [x, z]] of lampSpots.entries()) {
  stage.add(primitives.cylinder({ name: `post-${i}`, size: [0.12, 3.4, 0.12], material: material.pbr({ color: "#15171c", metallic: 0.6, roughness: 0.5 }) }).position(x, 1.7, z));
  stage.add(primitives.sphere({ name: `lantern-${i}`, size: 0.42, material: material.emissive({ color: "#ffd9a0", emissive: "#ffb85c", emissiveIntensity: 4 }) }).position(x, 3.5, z));
  stage.add(lights.point({ name: `lamp-${i}`, position: [x, 3.4, z], intensity: 14, color: "#ffb866", distance: 12, decay: 2, shadow: false }));
}

const app = createAuraApp("#app", { scene: stage });
void app.ready();
