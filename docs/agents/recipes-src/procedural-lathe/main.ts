import { camera, createAuraApp, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";
import { latheGeometry, path2d } from "@aura3d/engine/procedural";

// Surfaces of revolution from a 2D profile. `path2d` samples lines, quadratic/cubic Beziers and arcs into [radius, y]
// pairs; `latheGeometry` revolves them with analytic normals: smooth across gentle turns, hard across sharp ones.
const vase = latheGeometry({
  profile: path2d().moveTo(0, 0).lineTo(0.4, 0).cubicTo(1.0, 0.1, 1.0, 0.95, 0.55, 1.35).cubicTo(0.3, 1.65, 0.34, 1.85, 0.5, 2.2).lineTo(0.4, 2.2).lineTo(0, 2.1).points({ curveSegments: 20 }),
  segments: 64
});
const goblet = latheGeometry({
  profile: path2d().moveTo(0, 0).lineTo(0.55, 0).quadTo(0.6, 0.12, 0.12, 0.25).lineTo(0.09, 1.0).quadTo(0.1, 1.2, 0.55, 1.5).quadTo(0.7, 1.9, 0.6, 2.0).lineTo(0, 1.55).points({ curveSegments: 14 }),
  segments: 64
});
const pawn = latheGeometry({
  profile: path2d().moveTo(0, 0).lineTo(0.62, 0).quadTo(0.66, 0.16, 0.5, 0.24).quadTo(0.28, 0.4, 0.2, 0.9).lineTo(0.36, 0.92).lineTo(0.36, 1.0).lineTo(0.2, 1.06)
    .arc(0, 1.36, 0.3, -0.84, Math.PI / 2).points({ curveSegments: 10 }), // the arc joins the collar with a straight edge, then closes on the axis
  segments: 64
});
const column = latheGeometry({
  profile: [[0, 0], [0.75, 0], [0.75, 0.12], [0.55, 0.16], [0.55, 0.3], [0.42, 0.34], [0.38, 0.4], [0.36, 2.3], [0.42, 2.38], [0.55, 2.44], [0.55, 2.55], [0.8, 2.6], [0.8, 2.78], [0, 2.78]],
  segments: 40
});

const plinth = (x: number, spec: ReturnType<typeof latheGeometry>, color: string, metallic = 0.1, roughness = 0.35, scale = 1) =>
  geometry.custom(spec, { name: `piece-${x}`, material: material.pbr({ color, metallic, roughness }) }).position(x, 0.18, 0).scale(scale);

const app = createAuraApp("#app", {
  scene: scene({ background: "#1a1c22" })
    .add(environments.neutral({ intensity: 0.8, background: false }))
    .add(lights.directional({ name: "key", position: [4, 7, 5], target: [0, 1, 0], intensity: 2.4, color: "#ffe9cf", shadow: true }))
    .add(lights.directional({ name: "rim", position: [-5, 4, -4], target: [0, 1, 0], intensity: 1.6, color: "#8fb4ff" }))
    .add(primitives.plane({ name: "floor", size: [24, 1, 12], material: material.pbr({ color: "#2a2d36", roughness: 0.85 }) }))
    .add(primitives.box({ name: "shelf", size: [11.5, 0.18, 2.4], material: material.pbr({ color: "#3b3f4a", roughness: 0.6 }) }).position(0, 0.09, 0))
    .add(plinth(-4.2, column, "#d9d3c6", 0, 0.7))
    .add(plinth(-1.8, vase, "#2f6f8f", 0.2, 0.18))
    .add(plinth(0.8, goblet, "#d4af37", 0.9, 0.22))
    .add(plinth(3.2, pawn, "#e8e4da", 0, 0.3, 1.4))
    .camera(camera.perspective({ position: [0.4, 2.8, 9.2], target: [0, 1.3, 0], fov: 38 }))
});
await app.ready();
