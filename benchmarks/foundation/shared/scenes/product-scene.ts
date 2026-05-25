import type { V3ComparisonScene } from "./scene-types";

export const productComparisonScene: V3ComparisonScene = {
  id: "product",
  title: "Product Scene",
  intent: "Catalog-style product composition with multiple object parts, PBR materials, and a front three-quarter camera.",
  objects: [
    { label: "product-body", geometry: "cube", color: [0.2, 0.42, 0.85], metallic: 0.18, roughness: 0.38, position: [0, 0, 0], scale: [1.55, 0.72, 0.42] },
    { label: "product-lens", geometry: "cylinder", color: [0.05, 0.07, 0.09], metallic: 0.6, roughness: 0.22, position: [0, 0, 0.46], scale: [0.44, 0.44, 0.22] },
    { label: "product-control", geometry: "sphere", color: [0.9, 0.58, 0.18], metallic: 0.35, roughness: 0.3, position: [0.88, 0.44, 0.08], scale: [0.24, 0.24, 0.24] }
  ]
};
