import {
  camera, effects, environments, game, instances, lights, material, model, primitives, scene,
  type AuraTransformSpec, type AuraVec3
} from "@aura3d/engine";
import { assets } from "./aura-assets";

export const target: AuraVec3 = [0, 1.26, 0];
export const ringNames = ["GimbalOuter", "GimbalMiddle", "GimbalInner"] as const;
const parts = ["AzimuthPedestal", "MeridianFork", ...ringNames, "PrismCore"];
const pivot: AuraVec3 = [0, 1.4, 0];
const brass = material.pbr({ color: "#a78b53", metalness: 0.8, roughness: 0.34 });
const slate = material.pbr({ color: "#203132", metalness: 0.26, roughness: 0.52 });
const ceramic = material.pbr({ color: "#132424", metalness: 0.48, roughness: 0.28 });
const points = material.emissive({ color: "#bbc5ab", emissive: "#aad4c8", emissiveIntensity: 0.65 });

export function cameraPosition(yaw: number, pitch: number, distance: number): AuraVec3 {
  const span = Math.cos(pitch) * distance;
  return [span * Math.sin(yaw), target[1] + Math.sin(pitch) * distance, span * Math.cos(yaw)];
}

// The three gimbals share the same GLB and physical bearing. Expose each as a
// separate Aura3D runtime node so the sighting control can move it independently.
export function buildObservatory(eye: AuraVec3) {
  const stage = scene().background("#17282b")
    .camera(camera.perspective({ position: eye, target, fov: 36, near: 0.05, far: 70 }))
    .add(environments.hdri({ name: "studio reflections", texture: assets.studio, intensity: 0.92, rotation: 0.48, background: false }))
    .add(lights.key({ name: "large warm key", position: [-3, 5, 3.5], target, color: "#ffddb0", intensity: 2.5 }).runtime(game.runtimeNode("key")))
    .add(lights.directional({ name: "cool rim", position: [3, 2.5, -2.8], target, color: "#78d8d9", intensity: 1.8 }).runtime(game.runtimeNode("rim")))
    .add(lights.directional({ name: "soft frontal fill", position: [1, 1.8, 4], target, color: "#d2e6e2", intensity: 0.65 }))
    .add(lights.point({ name: "prism reflection", position: [0, 1.55, 0.36], color: "#66e8d5", intensity: 1.6, distance: 2 }))
    .add(effects.cinematicBloom({ name: "crystal highlights", intensity: 0.14, threshold: 1.06, radius: 2 }))
    .add(effects.antiAlias({ mode: "fxaa" }))
    .add(model(assets.instrument, { name: "fixed instrument", hiddenNodeNames: ringNames, scaleMode: "world", castShadow: true, receiveShadow: true }))
    .add(primitives.box({ name: "observatory floor", size: [40, 0.08, 40], material: slate }).position(0, -0.27, 0))
    .add(primitives.cylinder({ name: "lacquered dial platform", size: [3.18, 0.18, 3.18], params: { radialSegments: 128 }, material: ceramic }).position(0, -0.14, 0))
    .add(primitives.cylinder({ name: "turned metal edge", size: [3.20, 0.023, 3.20], params: { radialSegments: 128 }, material: brass }).position(0, -0.072, 0))
    .add(primitives.cylinder({ name: "engraved dial face", size: [3.19, 0.054, 3.19], params: { radialSegments: 128 }, material: slate }).position(0, -0.03, 0));
  for (const name of ringNames) {
    stage.add(model(assets.instrument, {
      name, hiddenNodeNames: parts.filter((part) => part !== name), scaleMode: "world", pivot,
      nodeTransforms: { [name]: { rotation: [0, 0, 0] } }, castShadow: true, receiveShadow: true
    }).runtime(game.runtimeNode(name)));
  }

  // Twelve long divisions and 84 short divisions are a single instanced draw.
  const marks: AuraTransformSpec[] = Array.from({ length: 96 }, (_, i) => {
    const a = i * Math.PI / 48;
    const long = i % 8 === 0;
    const r = long ? 1.445 : 1.48;
    return { position: [r * Math.sin(a), 0.002, r * Math.cos(a)], rotation: [0, a, 0],
      scale: [long ? 0.024 : 0.013, 0.008, long ? 0.19 : 0.085] };
  });
  stage.add(instances.box({ name: "graduated azimuth dial", material: brass, transforms: marks, castShadow: false }));
  for (const r of [1.29, 1.55]) {
    stage.add(primitives.torus({ name: `dial engraving ${r}`, params: { tube: 0.0017, radialSegments: 128, tubularSegments: 8 },
      material: brass, castShadow: false }).position(0, 0.001, 0).rotate(Math.PI / 2, 0, 0).scale(r / 0.43));
  }

  // A deterministic star atlas sits well behind the object. Its parallax
  // reveals camera motion without introducing a texture or a second renderer.
  const stars: AuraTransformSpec[] = Array.from({ length: 112 }, (_, i) => {
    const a = i * 2.39996323;
    const r = 8.5 + 2 * Math.sin(i * 1.73);
    const size = i % 9 === 0 ? 0.025 : 0.014;
    return { position: [Math.cos(a) * r, 0.75 + ((i * 139) % 127) / 18, Math.sin(a) * r], scale: size };
  });
  stage.add(instances.box({ name: "celestial reference stars", material: points, transforms: stars, castShadow: false }));
  return stage;
}
