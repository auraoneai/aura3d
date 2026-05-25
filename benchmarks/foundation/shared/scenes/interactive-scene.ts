import type { V3ComparisonScene } from "./scene-types";

export const interactiveComparisonScene: V3ComparisonScene = {
  id: "interactive",
  title: "Interactive Scene",
  intent: "Animated two-object orbit scene at a fixed comparison timestamp.",
  animated: true,
  objects: [
    { label: "orbit-a", geometry: "sphere", color: [0.95, 0.62, 0.18], metallic: 0.25, roughness: 0.36, position: [0.75, 0, 0.18], scale: [0.46, 0.46, 0.46] },
    { label: "orbit-b", geometry: "cube", color: [0.2, 0.48, 0.92], metallic: 0.1, roughness: 0.44, position: [-0.75, 0, -0.18], scale: [0.62, 0.62, 0.62] }
  ]
};
