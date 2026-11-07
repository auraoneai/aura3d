import { camera, createAuraApp, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";
import { catmullRomCurve, sweepGeometry } from "@aura3d/engine/procedural";

// Sweeps a profile along a spline with rotation-minimising frames: pipes, ropes, rails, planks and roots, with
// variable radius, hard or smooth profile edges, twist, closed loops and capped ends.
const knotPoints = Array.from({ length: 64 }, (_, i) => {
  const t = (i / 64) * Math.PI * 2; // trefoil knot
  return [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)] as const;
});
const knot = sweepGeometry({ path: catmullRomCurve(knotPoints.map(([x, y, z]) => [x * 0.55, y * 0.55 + 1.9, z * 0.55] as const), { closed: true }), steps: 320, radius: 0.17, radialSegments: 20 });

const root = sweepGeometry({
  path: [[-5.4, 0.1, 1.2], [-5.0, 0.7, 0.5], [-4.2, 1.0, 0.8], [-3.4, 0.5, 0.2], [-2.9, 0.1, -0.4]],
  steps: 80, radius: (t) => 0.34 * (1 - t) ** 0.8 + 0.03, radialSegments: 16
});

const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
const twisted = sweepGeometry({ path: [[3.4, 0.1, 0], [3.4, 3.4, 0]], steps: 90, radius: 0.34, profile: square, twist: Math.PI * 2.5 });

const spring = sweepGeometry({
  path: catmullRomCurve(Array.from({ length: 80 }, (_, i) => [5.6 + Math.cos(i * 0.5) * 0.55, 0.15 + i * 0.045, Math.sin(i * 0.5) * 0.55] as const)),
  steps: 300, radius: 0.06, radialSegments: 10
});

const mat = (color: string, metallic: number, roughness: number) => material.pbr({ color, metallic, roughness });
const app = createAuraApp("#app", {
  scene: scene({ background: "#14171d" })
    .add(environments.neutral({ intensity: 0.8, background: false }))
    .add(lights.directional({ name: "key", position: [5, 8, 6], target: [0, 1.5, 0], intensity: 2.6, color: "#ffeed8", shadow: true }))
    .add(lights.directional({ name: "rim", position: [-6, 4, -5], target: [0, 1.5, 0], intensity: 1.6, color: "#7fb4ff" }))
    .add(primitives.plane({ name: "floor", size: [30, 1, 14], material: mat("#232630", 0, 0.9) }))
    .add(geometry.custom(knot, { name: "knot", material: mat("#e9a23b", 0.85, 0.22) }))
    .add(geometry.custom(root, { name: "root", material: mat("#6d5640", 0, 0.8) }))
    .add(geometry.custom(twisted, { name: "twisted-beam", material: mat("#5fa8d3", 0.6, 0.3) }))
    .add(geometry.custom(spring, { name: "spring", material: mat("#c9ced6", 0.95, 0.25) }))
    .camera(camera.perspective({ position: [0.6, 3.4, 11], target: [0.4, 1.7, 0], fov: 40 }))
});
await app.ready();
