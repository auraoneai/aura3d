// Home Nook (PRD 04 D10): a generic, non-identifying toy room for routines,
// picnics, doorbells and bedtime. Warm floor, a soft rug, cream walls with one
// window, a shelf and a lamp. No photos, names or family details anywhere:
// beds, sinks, tables, doors and food are story props.

import type { WorldDefinition } from "./worlds.js";

export const homeNook: WorldDefinition = {
  id: "home-nook",
  workingTitle: "Home Nook",
  ground: { color: "#D6B07E", size: 40 },
  musicBed: "homeBed",
  dressing: [
    // Walls tall and long enough that every framing (portrait included) stays inside the room.
    { kind: "primitive", shape: "box", color: "#F7E9D6", size: [14, 8, 0.2], at: [0, 4, -3.5], roughness: 0.95 },
    { kind: "primitive", shape: "box", color: "#F3E2CB", size: [0.2, 8, 15.5], at: [-6.3, 4, 4.25], roughness: 0.95 },
    { kind: "primitive", shape: "box", color: "#F3E2CB", size: [0.2, 8, 15.5], at: [6.3, 4, 4.25], roughness: 0.95 },
    { kind: "primitive", shape: "box", color: "#E6CBA6", size: [14, 0.16, 0.06], at: [0, 0.08, -3.38] },
    // A soft oval rug under the play area.
    { kind: "primitive", shape: "cylinder", color: "#EE9F8C", size: [3.8, 0.02, 2.8], at: [0, 0.012, 0.15], roughness: 1 },
    // Window with curtains (daylight, no glare).
    { kind: "primitive", shape: "box", color: "#FFFFFF", size: [1.9, 1.5, 0.05], at: [-2.7, 2.5, -3.38] },
    { kind: "primitive", shape: "box", color: "#BFE3F7", size: [1.6, 1.2, 0.04], at: [-2.7, 2.5, -3.35], emissive: { color: "#DFF1FF", intensity: 0.35 } },
    { kind: "primitive", shape: "box", color: "#F6C6A8", size: [0.35, 1.7, 0.05], at: [-3.8, 2.45, -3.32] },
    { kind: "primitive", shape: "box", color: "#F6C6A8", size: [0.35, 1.7, 0.05], at: [-1.6, 2.45, -3.32] },
    // A blank picture frame (a simple sky, no people).
    { kind: "primitive", shape: "box", color: "#FFFFFF", size: [1.0, 0.75, 0.04], at: [0.5, 2.7, -3.38] },
    { kind: "primitive", shape: "box", color: "#BFE0F2", size: [0.8, 0.55, 0.05], at: [0.5, 2.7, -3.36] },
    // Shelf with three toys.
    { kind: "primitive", shape: "box", color: "#D9B482", size: [1.4, 0.08, 0.36], at: [2.9, 1.75, -3.28] },
    {
      kind: "instances",
      shape: "box",
      name: "shelf-toys",
      items: [
        { at: [2.5, 1.92, -3.28], size: [0.25, 0.25, 0.25], color: "#F4B6C8" },
        { at: [2.9, 1.9, -3.28], size: [0.22, 0.22, 0.22], color: "#A6DDB3" }
      ]
    },
    { kind: "primitive", shape: "sphere", color: "#F2C94C", size: [0.24, 0.24, 0.24], at: [3.3, 1.91, -3.28] },
    // A warm floor lamp (gentle self-light, never flashing).
    { kind: "primitive", shape: "cylinder", color: "#D2AD78", size: [0.06, 1.3, 0.06], at: [4.7, 0.65, -2.5] },
    { kind: "primitive", shape: "cylinder", color: "#FFE3B0", size: [0.55, 0.42, 0.55], at: [4.7, 1.45, -2.5], emissive: { color: "#FFE3B0", intensity: 0.35 } },
    // A potted plant in the corner.
    { kind: "primitive", shape: "cylinder", color: "#E57B6B", size: [0.6, 0.45, 0.6], at: [-4.9, 0.225, -2.6], castShadow: true },
    { kind: "model", key: "bush", at: [-4.9, 0.45, -2.6], heightM: 0.9 }
  ]
};
