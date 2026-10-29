// Lumi Learning Cloud (PRD 04 D13): a soft periwinkle cloud floor (the white
// cloud banks read against it) under a pastel sky, a gentle rainbow and a few
// blank floating cards in the distance. The letters, numbers and shapes
// themselves are story props (letterB, letterA, pastries, balloons), each tied
// to a visible object and action.

import type { WorldDefinition } from "./worlds.js";

export const learningCloud: WorldDefinition = {
  id: "learning-cloud",
  workingTitle: "Lumi Learning Cloud",
  ground: { color: "#B3BDEB", size: 70 },
  musicBed: "cloudBed",
  dressing: [
    // Pastel sky wall far behind (stays bright: a faint self-light, no glare).
    { kind: "primitive", shape: "box", color: "#AFCBEE", size: [90, 40, 0.2], at: [0, 14, -26], roughness: 1, emissive: { color: "#AFCBEE", intensity: 0.15 } },
    // A soft pastel rainbow, half below the cloud floor. Unit torus: band
    // 0.385-0.475 of the scale, so each scale is about 0.81 of the previous one
    // (bands meet without overlapping) and the inner bands sit a little nearer,
    // so no two bands share a depth (no z-fighting shimmer).
    { kind: "primitive", shape: "torus", color: "#F49AC0", size: [12, 12, 0.5], at: [0, -1.0, -14] },
    { kind: "primitive", shape: "torus", color: "#F8D36A", size: [9.7, 9.7, 0.5], at: [0, -1.0, -13.9] },
    { kind: "primitive", shape: "torus", color: "#8EC5EE", size: [7.85, 7.85, 0.5], at: [0, -1.0, -13.8] },
    // Puffy cloud banks at the edges (one draw call).
    {
      kind: "instances",
      shape: "sphere",
      name: "cloud-banks",
      roughness: 1,
      items: [
        { at: [-3.5, 0.25, -2.7], size: [1.6, 0.8, 1.2], color: "#FFFFFF" },
        { at: [3.7, 0.3, -2.9], size: [1.8, 0.9, 1.3], color: "#F6F2FF" },
        { at: [-4.7, 0.2, -0.6], size: [1.4, 0.7, 1.1], color: "#F6F2FF" },
        { at: [4.9, 0.2, -0.4], size: [1.5, 0.7, 1.1], color: "#FFFFFF" },
        { at: [-5.7, 0.35, -4.7], size: [2.2, 1.1, 1.6], color: "#FFFFFF" },
        { at: [5.9, 0.35, -5.1], size: [2.4, 1.2, 1.7], color: "#F6F2FF" },
        { at: [-2.5, 0.2, -4.3], size: [1.5, 0.6, 1.1], color: "#F6F2FF" },
        { at: [2.3, 0.2, -4.5], size: [1.4, 0.6, 1.0], color: "#FFFFFF" }
      ]
    },
    // Blank floating cards (no text: letters are story props).
    { kind: "primitive", shape: "box", color: "#F9C6D9", size: [0.95, 1.2, 0.08], at: [-3.3, 3.0, -5.2], rotation: [0, 0.25, 0.08], roughness: 0.7 },
    { kind: "primitive", shape: "box", color: "#C6E3F9", size: [0.95, 1.2, 0.08], at: [3.2, 3.3, -5.6], rotation: [0, -0.25, -0.06], roughness: 0.7 },
    { kind: "primitive", shape: "box", color: "#FBE6A6", size: [0.95, 1.2, 0.08], at: [0.2, 4.3, -7.4], rotation: [0, 0, 0.05], roughness: 0.7 },
    // Cloud models drifting in the distance.
    { kind: "model", key: "cloud", at: [-4.8, 2.6, -7.5], heightM: 1.4, castShadow: false },
    { kind: "model", key: "cloud", at: [5.2, 3.2, -8.5], heightM: 1.7, castShadow: false },
    { kind: "model", key: "cloud", at: [-1.2, 5.2, -12], heightM: 1.6, castShadow: false }
  ]
};
