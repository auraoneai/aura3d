// GoGo Station (PRD 04 D11): one straight run of track along the back row of
// spots, a little station with its platform on the right and a grassy tunnel
// on the left that GoGo can drive into (offLeft). Passengers are story props,
// so counting stays one visible object per number.

import type { WorldDefinition } from "./worlds.js";

const SLEEPERS: number[] = [];
for (let x = -10.2; x <= 10.21; x += 0.6) SLEEPERS.push(Math.round(x * 100) / 100);

/** The track runs along z = TRACK_Z, under the back spots. */
export const TRACK_Z = -1.6;

export const station: WorldDefinition = {
  id: "station",
  workingTitle: "GoGo Station",
  ground: { color: "#BEDDAE", size: 70 },
  musicBed: "stationBed",
  dressing: [
    { kind: "primitive", shape: "sphere", color: "#A9D39A", size: [18, 5, 10], at: [-8.5, -1.4, -15] },
    { kind: "primitive", shape: "sphere", color: "#B6DAA5", size: [20, 5.6, 11], at: [9, -1.6, -16] },
    // Track: two rails and the sleepers (two draw calls).
    {
      kind: "instances",
      shape: "box",
      name: "rails",
      items: [
        { at: [0, 0.07, TRACK_Z + 0.22], size: [22, 0.06, 0.07], color: "#9AA6BC" },
        { at: [0, 0.07, TRACK_Z - 0.22], size: [22, 0.06, 0.07], color: "#9AA6BC" }
      ],
      roughness: 0.45
    },
    {
      kind: "instances",
      shape: "box",
      name: "sleepers",
      items: SLEEPERS.map((x) => ({ at: [x, 0.025, TRACK_Z] as const, size: [0.16, 0.05, 0.86] as const, color: "#C9A27A" }))
    },
    // Station and its platform on the right.
    { kind: "primitive", shape: "box", color: "#F0E2C2", size: [5.0, 0.24, 1.3], at: [3.4, 0.12, -2.75] },
    { kind: "model", key: "station", at: [3.6, 0, -4.0], heightM: 2.6 },
    // Grassy tunnel on the left, its arch facing along the track.
    { kind: "model", key: "tunnel", at: [-5.8, 0, TRACK_Z], heightM: 1.8, yaw: Math.PI / 2 },
    { kind: "model", key: "bush", at: [-3.6, 0, -3.7], heightM: 0.8 },
    { kind: "model", key: "bush", at: [6.6, 0, -3.2], heightM: 0.8 },
    { kind: "model", key: "tree", at: [-6.5, 0, -7.0], heightM: 3.0 },
    { kind: "model", key: "tree", at: [7.6, 0, -8.0], heightM: 2.8 },
    { kind: "model", key: "cloud", at: [-3.8, 6.2, -16], heightM: 1.6, castShadow: false },
    { kind: "model", key: "cloud", at: [5.6, 6.6, -18], heightM: 1.8, castShadow: false }
  ]
};
