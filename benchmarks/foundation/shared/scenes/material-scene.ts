import type { V3ComparisonScene } from "./scene-types";

export const materialComparisonScene: V3ComparisonScene = {
  id: "material",
  title: "Material Scene",
  intent: "Three material samples under the same studio intent: polished metal, matte product plastic, and colored rough material.",
  objects: [
    { label: "polished-metal", geometry: "sphere", color: [0.86, 0.82, 0.72], metallic: 1, roughness: 0.18, position: [-1.15, 0, 0], scale: [0.62, 0.62, 0.62] },
    { label: "matte-polymer", geometry: "sphere", color: [0.22, 0.55, 0.9], metallic: 0, roughness: 0.58, position: [0, 0, 0], scale: [0.62, 0.62, 0.62] },
    { label: "rough-accent", geometry: "cube", color: [0.9, 0.28, 0.16], metallic: 0.25, roughness: 0.72, position: [1.15, 0, 0], scale: [0.72, 0.72, 0.72] }
  ]
};
