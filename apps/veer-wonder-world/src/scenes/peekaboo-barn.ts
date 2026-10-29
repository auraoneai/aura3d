// Peeko Peekaboo Barn (PRD 04 D12): a friendly red barn behind the play area,
// a low fence and hay bales. The big doors and hiding places a story opens are
// story props (door, bush), so reveals stay gentle and predictable.

import type { WorldDefinition } from "./worlds.js";

const FENCE_POSTS = [2.2, 3.0, 3.8, 4.6, 5.4];

export const peekabooBarn: WorldDefinition = {
  id: "peekaboo-barn",
  workingTitle: "Peeko Peekaboo Barn",
  ground: { color: "#CFE5A6", size: 70 },
  musicBed: "barnBed",
  dressing: [
    { kind: "primitive", shape: "sphere", color: "#B9D98E", size: [18, 5, 10], at: [-9, -1.4, -15] },
    { kind: "primitive", shape: "sphere", color: "#C4DF9C", size: [20, 5.4, 11], at: [9.5, -1.6, -16] },
    { kind: "model", key: "barn", at: [0, 0, -6.4], heightM: 3.4 },
    // Low fence on both sides of the barn (posts and rails, two draw calls).
    {
      kind: "instances",
      shape: "box",
      name: "fence-posts",
      items: [...FENCE_POSTS, ...FENCE_POSTS.map((x) => -x)].map((x) => ({ at: [x, 0.35, -3.8] as const, size: [0.12, 0.7, 0.12] as const, color: "#E9D4AE" })),
      castShadow: true
    },
    {
      kind: "instances",
      shape: "box",
      name: "fence-rails",
      items: [
        { at: [3.8, 0.34, -3.8], size: [3.4, 0.08, 0.06], color: "#E9D4AE" },
        { at: [3.8, 0.58, -3.8], size: [3.4, 0.08, 0.06], color: "#E9D4AE" },
        { at: [-3.8, 0.34, -3.8], size: [3.4, 0.08, 0.06], color: "#E9D4AE" },
        { at: [-3.8, 0.58, -3.8], size: [3.4, 0.08, 0.06], color: "#E9D4AE" }
      ]
    },
    // Round hay bales lying on their sides.
    {
      kind: "instances",
      shape: "cylinder",
      name: "hay",
      items: [
        { at: [-4.3, 0.36, -2.6], size: [0.72, 1.1, 0.72], rotation: [0, 0, Math.PI / 2], color: "#EBCB75" },
        { at: [4.5, 0.36, -2.4], size: [0.72, 1.1, 0.72], rotation: [0, 0, Math.PI / 2], color: "#E6C46C" },
        { at: [-5.1, 0.36, -1.5], size: [0.72, 1.1, 0.72], rotation: [0, 0, Math.PI / 2], color: "#EFD283" }
      ],
      castShadow: true
    },
    { kind: "model", key: "bush", at: [-5.6, 0, -4.4], heightM: 0.9 },
    { kind: "model", key: "bush", at: [5.8, 0, -4.6], heightM: 0.85 },
    { kind: "model", key: "tree", at: [-6.8, 0, -8.6], heightM: 3.2 },
    { kind: "model", key: "tree", at: [7.0, 0, -9.0], heightM: 3.0 },
    { kind: "model", key: "cloud", at: [-4.8, 6.4, -17], heightM: 1.6, castShadow: false },
    { kind: "model", key: "cloud", at: [5.4, 6.8, -19], heightM: 1.9, castShadow: false }
  ]
};
