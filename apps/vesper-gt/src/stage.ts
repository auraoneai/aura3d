import {
  camera, effects, environments, game, geometry, lights, material, model, scene, type AuraVec3
} from "@aura3d/engine";
import { assets } from "./aura-assets";

// An automotive photo stage with an uninterrupted floor-to-wall sweep.
// Cool daylight on the garnet body, with long ceiling and side-strip reflections.
export const lightSetups = {
  daylight: {
    key: { position: [3.8, 6, 4] as AuraVec3, color: "#fff4e7", intensity: 2 },
    rim: { position: [-2.8, 3.2, -3.5] as AuraVec3, color: "#bedcff", intensity: 1.8 }
  },
  tungsten: {
    key: { position: [-2.7, 3.2, 4.6] as AuraVec3, color: "#ffc28a", intensity: 2.65 },
    rim: { position: [3.7, 2.8, -3.2] as AuraVec3, color: "#fff0da", intensity: 1.55 }
  }
};
export const views = {
  body: { yaw: 0.94, pitch: 0.21, target: [0, 0.58, 0] as AuraVec3, width: 5.55 },
  wheel: { yaw: 1.39, pitch: 0.11, target: [0.84, 0.40, 0.90] as AuraVec3, width: 1.65 }
};
export const fov = 29;
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
    name: "seamless graphite cyclorama", material: material.pbr({ color: "#424b53", roughness: 0.77, metalness: 0.05 }),
    receiveShadow: true, castShadow: false
  });
}

export function buildStudio(position: AuraVec3) {
  const target = views.body.target;
  return scene().background("#222b33")
    .camera(camera.perspective({ position, target, fov, near: 0.035, far: 75 }))
    .add(environments.hdri({ name: "photography studio", texture: assets.studio, intensity: 0.85, rotation: 1.12, background: false }))
    .add(studioSweep())
    .add(lights.key({ name: "studio key", target, ...lightSetups.daylight.key }).runtime(game.runtimeNode("key")))
    .add(lights.directional({ name: "rear rim", target, ...lightSetups.daylight.rim }).runtime(game.runtimeNode("rim")))
    .add(lights.rectArea({ name: "overhead strip bank", position: [2, 3.5, 0], target, width: 5.5, height: 0.6,
      color: "#fff4e9", intensity: 3 }))
    .add(lights.rectArea({ name: "side strip bank", position: [3.1, 1.2, 0.3], target, width: 4.5, height: 0.28,
      color: "#dce6ff", intensity: 1.6 }))
    .add(lights.spot({ name: "backdrop wash", position: [-2, 3, -2.5], target: [-4.8, 1, -5.5],
      angle: 0.95, penumbra: 0.95, distance: 11, color: "#b8c8dd", intensity: 18 }))
    .add(model(assets.coupe, { name: "Vesper GT", scaleMode: "world", castShadow: true, receiveShadow: true }))
    .add(effects.contactShadows({ length: 0.23, intensity: 0.75, steps: 8 }))
    .add(effects.antiAlias({ mode: "fxaa" }));
}
