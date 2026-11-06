import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

// A campfire with no sprite art: three effects.particles emitters (flames, smoke, sparks) that use the engine's
// built-in sprite atlas ("flame-loop", "smoke-a", "spark-streak"), logs and stones from primitives, a warm point light.
const stones: AuraTransformSpec[] = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return { position: [Math.cos(a) * 1.05, 0.12, Math.sin(a) * 1.05], rotation: [0, a, 0], scale: [0.42, 0.26, 0.34] };
});
const wood = material.pbr({ color: "#4a3020", roughness: 0.95 });

const app = createAuraApp("#app", {
  scene: scene({ background: "#07090f" })
    .add(environments.neutral({ intensity: 0.12, background: false }))
    .add(lights.directional({ name: "moon", position: [-8, 10, -6], target: [0, 0, 0], intensity: 0.7, color: "#6f8fe0", shadow: true }))
    .add(lights.point({ name: "firelight", position: [0, 1.0, 0], intensity: 26, color: "#ff9a3c", distance: 14, decay: 2, shadow: false }))
    .add(primitives.plane({ name: "ground", size: [30, 1, 30], material: material.pbr({ color: "#2a2f24", roughness: 1 }) }))
    .add(instances.sphere({ name: "stones", transforms: stones, material: material.pbr({ color: "#6b6b70", roughness: 0.95 }) }))
    .add(primitives.cylinder({ name: "log-a", size: [0.24, 1.6, 0.24], material: wood }).position(0, 0.2, 0).rotate(0, 0.6, Math.PI / 2 - 0.12))
    .add(primitives.cylinder({ name: "log-b", size: [0.24, 1.6, 0.24], material: wood }).position(0, 0.2, 0).rotate(0, -0.7, Math.PI / 2 + 0.12))
    .add(effects.particles({ // `color` is the base tint; lifetimeColorRamp walks it over each particle's life
      name: "flames", position: [0, 0.25, 0], shape: "disc", shapeSize: 0.3, rate: 70, maxParticles: 220, lifetime: [0.6, 1.1],
      speed: [0.9, 1.7], size: [0.22, 0.5], gravity: 0, drag: 0.3, blend: "additive", intensity: 1.4, seed: 11, color: "#ff8a2a",
      sizeOverLife: [0.6, 1, 0.3], alphaOverLife: [0, 1, 0.7, 0], lifetimeColorRamp: ["#fff2b0", "#ff9b2e", "#8a1c05"]
    }))
    .add(effects.particles({
      name: "smoke", position: [0, 1.3, 0], shape: "disc", shapeSize: 0.25, rate: 14, maxParticles: 90, lifetime: [2.4, 3.8],
      speed: [0.5, 0.9], size: [0.4, 1.3], gravity: 0, drag: 0.15, wind: [0.25, 0, 0.05], blend: "alpha", intensity: 0.5, seed: 12, color: "#55545a",
      alphaOverLife: [0, 0.6, 0.4, 0], lifetimeColorRamp: ["#6e625a", "#2b2c30"]
    }))
    .add(effects.particles({
      name: "sparks", position: [0, 0.6, 0], shape: "cone", coneAngleDeg: 28, rate: 20, maxParticles: 80, lifetime: [0.8, 1.7],
      speed: [2, 4.5], size: [0.05, 0.1], gravity: 3, sprite: "spark-streak", blend: "additive", intensity: 3, seed: 13, color: "#ffb347",
      stretch: { mode: "velocity", factor: 0.12 }, lifetimeColorRamp: ["#fff0b0", "#ff5a12"]
    }))
    .camera(camera.perspective({ position: [3.6, 1.9, 4.6], target: [0, 1.1, 0], fov: 44, near: 0.1, far: 80 }))
});
await app.ready();
