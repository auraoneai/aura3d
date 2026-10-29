// Lulu Music Garden (PRD 04 D09): a quiet stomp-and-clap stage. Oversized
// toy piano keys lie along the back, pastel stomp stones make a path behind the
// play area, and flowers and bushes keep the edges soft. Drums and other
// instruments are story props, so the background stays calm.

import type { WorldDefinition } from "./worlds.js";

const WHITE_KEYS = [-2.5, -2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0, 2.5];
const BLACK_KEYS = [-2.25, -1.75, -0.75, -0.25, 0.25, 1.25, 1.75];

export const musicGarden: WorldDefinition = {
  id: "music-garden",
  workingTitle: "Lulu Music Garden",
  ground: { color: "#B7E3C8", size: 70 },
  musicBed: "gardenBed",
  dressing: [
    { kind: "primitive", shape: "sphere", color: "#A3D8B4", size: [16, 4.4, 9], at: [-8, -1.2, -14] },
    { kind: "primitive", shape: "sphere", color: "#BCE5C8", size: [18, 5, 10], at: [8.5, -1.4, -15] },
    // Giant toy piano keys along the back (two draw calls).
    {
      kind: "instances",
      shape: "box",
      name: "piano-white",
      items: WHITE_KEYS.map((x) => ({ at: [x, 0.11, -4.6] as const, size: [0.46, 0.22, 1.3] as const, color: "#FBF8F2" })),
      roughness: 0.5
    },
    {
      kind: "instances",
      shape: "box",
      name: "piano-black",
      items: BLACK_KEYS.map((x) => ({ at: [x, 0.17, -4.85] as const, size: [0.26, 0.3, 0.8] as const, color: "#4A4658" })),
      roughness: 0.5
    },
    // Pastel stomp stones in a row behind the play area.
    { kind: "model", key: "stompStone", at: [-3.0, 0, -3.4], heightM: 0.14, tint: "#CDB8F2", castShadow: false },
    { kind: "model", key: "stompStone", at: [-1.5, 0, -3.5], heightM: 0.14, tint: "#F9C9A7", castShadow: false },
    { kind: "model", key: "stompStone", at: [0, 0, -3.4], heightM: 0.14, tint: "#A9D4F2", castShadow: false },
    { kind: "model", key: "stompStone", at: [1.5, 0, -3.5], heightM: 0.14, tint: "#F7E39A", castShadow: false },
    { kind: "model", key: "stompStone", at: [3.0, 0, -3.4], heightM: 0.14, tint: "#A6E3C4", castShadow: false },
    // Flowers and bushes at the edges.
    { kind: "model", key: "flower", at: [-3.7, 0, -2.5], heightM: 0.8 },
    { kind: "model", key: "flower", at: [3.6, 0, -2.3], heightM: 0.75 },
    { kind: "model", key: "flowerBud", at: [-4.5, 0, -3.3], heightM: 0.7 },
    { kind: "model", key: "bush", at: [-5.3, 0, -1.8], heightM: 0.85 },
    { kind: "model", key: "bush", at: [5.5, 0, -2.1], heightM: 0.8 },
    { kind: "model", key: "tree", at: [-6.8, 0, -7.5], heightM: 3.0 },
    { kind: "model", key: "tree", at: [6.6, 0, -8.0], heightM: 2.8 },
    { kind: "model", key: "cloud", at: [-4.4, 6.3, -17], heightM: 1.7, castShadow: false },
    { kind: "model", key: "cloud", at: [5.0, 6.0, -15], heightM: 1.5, castShadow: false }
  ]
};
