import {
  camera, effects, environments, game, geometry, lights, material, model, scene, type AuraVec3
} from "@aura3d/engine";
import { assets } from "./aura-assets";

// An automotive photo stage with an uninterrupted floor-to-wall sweep.
// Broad bounce light reveals the pigment. The two diffusers shape the roof and flank.
export const lightSetups = {
  daylight: {
    key: { position: [2.5, 7, 4] as AuraVec3, color: "#f2e9df", intensity: 0.52 },
    rim: { position: [-3.4, 4.3, -3.5] as AuraVec3, color: "#cbd7e2", intensity: 0.68 },
    side: { position: [3.8, 3.4, 0.15] as AuraVec3, color: "#eee2d8", intensity: 1.32 }
  },
  tungsten: {
    key: { position: [-3.2, 4.8, 3.9] as AuraVec3, color: "#ffbb83", intensity: 0.83 },
    rim: { position: [3.9, 3.7, -3.2] as AuraVec3, color: "#e5d5be", intensity: 0.77 },
    side: { position: [3.35, 3.5, -1.2] as AuraVec3, color: "#efae82", intensity: 1.07 }
  }
};
export const views = {
  body: { yaw: 1.13, pitch: 0.105, target: [0, 0.56, 0] as AuraVec3, width: 5.1 },
  wheel: { yaw: 1.39, pitch: 0.11, target: [0.96, 0.38, 1.375] as AuraVec3, width: 1.65 }
};
export const fov = 25;
export function eye(yaw: number, pitch: number, distance: number, target: AuraVec3): AuraVec3 {
  const span = distance * Math.cos(pitch);
  return [target[0] + Math.sin(yaw) * span, target[1] + Math.sin(pitch) * distance, target[2] + Math.cos(yaw) * span];
}

// A single concave mesh avoids the visible joint between separate floor and wall planes.
function studioSweep() {
  const rings = [[0.001, -0.006, 0], [5, -0.006, 0]];
  for (let step = 1; step <= 20; step++) {
    const angle = step * Math.PI / 40;
    rings.push([5 + 3 * Math.sin(angle), 3 * (1 - Math.cos(angle)) - 0.006, angle]);
  }
  rings.push([8, 9, Math.PI / 2]);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const segments = 96;
  rings.forEach(([radius, height, slope], ring) => {
    for (let i = 0; i <= segments; i++) {
      const a = 2 * Math.PI * i / segments;
      const x = Math.sin(a), z = Math.cos(a);
      positions.push(radius * x, height, radius * z);
      normals.push(-Math.sin(slope) * x, Math.cos(slope), -Math.sin(slope) * z);
      if (ring && i) {
        const p = ring * (segments + 1) + i;
        indices.push(p - segments - 2, p - 1, p, p - segments - 2, p, p - segments - 1);
      }
    }
  });
  return geometry.custom(geometry.define({ positions: Float32Array.from(positions), normals: Float32Array.from(normals),
    indices: Uint16Array.from(indices) }), {
    name: "seamless graphite cyclorama", material: material.pbr({ color: "#222529", roughness: 0.96, metalness: 0 }),
    receiveShadow: true, castShadow: false
  });
}

export function buildStudio(position: AuraVec3) {
  const target = views.body.target;
  return scene().background("#222b33")
    .camera(camera.perspective({ position, target, fov, near: 0.035, far: 75 }))
    .add(environments.hdri({ name: "photography studio", texture: assets.studio, intensity: 0.31, rotation: 1.12, background: false }))
    .add(lights.hemisphere({ name: "studio bounce", skyColor: "#ded9d4", groundColor: "#75666a", intensity: 0.88 }))
    .add(studioSweep())
    .add(lights.key({ name: "studio key", target, shadow: { filter: "pcss", lightSize: 0.82, softness: 2, bias: 0.002, intensity: 0.88 }, ...lightSetups.daylight.key }).runtime(game.runtimeNode("key")))
    .add(lights.rectArea({ name: "rear diffusion panel", width: 5.8, height: 2.2, target, ...lightSetups.daylight.rim }).runtime(game.runtimeNode("rim")))
    .add(lights.rectArea({ name: "long side softbox", target, width: 6.8, height: 2.7,
      ...lightSetups.daylight.side }).runtime(game.runtimeNode("side")))
    .add(lights.spot({ name: "backdrop wash", position: [-2, 3, -2.5], target: [-4.8, 1, -5.5],
      angle: 0.95, penumbra: 0.95, distance: 11, color: "#bbc4d0", intensity: 7 }))
    .add(model(assets.coupe, { name: "Vesper GT", scaleMode: "world", castShadow: true, receiveShadow: true }))
    .add(effects.contactShadows({ length: 0.23, intensity: 0.75, steps: 8 }))
    .add(effects.antiAlias({ mode: "fxaa" }));
}
