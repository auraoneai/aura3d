// Momo Meadow (PRD 04 D08): soft grass, bubble flowers, friendly hills and a
// few round trees, with the play area left clear for the ball, the bubbles and
// fetch. Everything here is scenery; the ball and bubbles are story props.

import type { WorldDefinition } from "./worlds.js";

export const meadow: WorldDefinition = {
  id: "meadow",
  workingTitle: "Momo Meadow",
  ground: { color: "#AEDB90", size: 70 },
  musicBed: "meadowBed",
  dressing: [
    // Friendly hills on the horizon.
    { kind: "primitive", shape: "sphere", color: "#9ACD7E", size: [18, 5, 10], at: [-8, -1.4, -14] },
    { kind: "primitive", shape: "sphere", color: "#A6D58C", size: [20, 5.6, 11], at: [9, -1.6, -16] },
    { kind: "primitive", shape: "sphere", color: "#B5DD99", size: [14, 3.4, 8], at: [0.5, -1.2, -12] },
    // Round trees well behind and beside the play area.
    { kind: "model", key: "tree", at: [-4.6, 0, -4.8], heightM: 2.6 },
    { kind: "model", key: "tree", at: [5.0, 0, -5.6], heightM: 2.9 },
    { kind: "model", key: "tree", at: [-7.6, 0, -8.6], heightM: 3.2 },
    { kind: "model", key: "tree", at: [7.8, 0, -9.2], heightM: 3.0 },
    // Bushes framing the sides.
    { kind: "model", key: "bush", at: [-3.5, 0, -2.9], heightM: 0.75 },
    { kind: "model", key: "bush", at: [3.7, 0, -3.1], heightM: 0.85 },
    { kind: "model", key: "bush", at: [-5.6, 0, -1.2], heightM: 0.9 },
    { kind: "model", key: "bush", at: [5.8, 0, -1.6], heightM: 0.8 },
    // Bubble flowers.
    { kind: "model", key: "flower", at: [-2.75, 0, -3.5], heightM: 0.7 },
    { kind: "model", key: "flower", at: [2.65, 0, -3.7], heightM: 0.65 },
    // Soft clouds far up in the sky.
    { kind: "model", key: "cloud", at: [-5, 6.0, -16], heightM: 1.6, castShadow: false },
    { kind: "model", key: "cloud", at: [4.6, 6.6, -18], heightM: 1.9, castShadow: false },
    // Grass tufts at the edges (one draw call).
    {
      kind: "instances",
      shape: "sphere",
      name: "tufts",
      items: [
        { at: [-3.4, 0.04, 0.9], size: [0.55, 0.16, 0.42], color: "#96CC7A" },
        { at: [3.5, 0.04, 0.6], size: [0.5, 0.15, 0.4], color: "#9DD083" },
        { at: [-4.1, 0.04, -0.7], size: [0.6, 0.17, 0.45], color: "#9DD083" },
        { at: [4.2, 0.04, -0.9], size: [0.55, 0.16, 0.42], color: "#96CC7A" },
        { at: [-4.6, 0.04, 1.8], size: [0.5, 0.15, 0.4], color: "#A3D489" },
        { at: [4.7, 0.04, 1.5], size: [0.6, 0.16, 0.44], color: "#A3D489" }
      ]
    }
  ]
};
