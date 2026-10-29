// Lumi (PRD 04 D05): a warm yellow star who conjures concrete objects. Not
// rigged: a gentle float at rest, a spin-in when conjuring, and a soft glow
// halo that rises and falls slowly (never flashing; reduced motion keeps the
// halo steady and drops the float).

import type { CharacterDefinition } from "./character-registry.js";
import { gestureMotion, proc } from "../scenes/motion.js";

export const LUMI: CharacterDefinition = {
  id: "lumi",
  modelKey: "lumi",
  displayNameKey: "ui.speaker.lumi",
  color: "#FFD34D",
  voice: "lumi",
  speaks: true,
  clipCandidates: {},
  locomotionClips: {},
  gestures: {
    glow: gestureMotion([proc("pulse", 2.4, 0.06)], { halo: true }),
    happy: gestureMotion([proc("spin", 1.8, 1), proc("float", 1.8, 0.08)]),
    cheer: gestureMotion([proc("spin", 1.6, 1), proc("hop", 1.6, 0.12)]),
    dance: gestureMotion([proc("rock", 2.4, 0.16, 2), proc("float", 2.4, 0.08, 2)]),
    wave: gestureMotion([proc("rock", 1.6, 0.14, 2)]),
    float: gestureMotion([proc("float", 3.0, 0.12)]),
    point: gestureMotion([proc("tilt", 1.4, 0.18)]),
    hop: gestureMotion([proc("hop", 0.8, 0.14)]),
    look: gestureMotion([proc("turn", 2.0, 0.4)])
  },
  idleMotion: gestureMotion([proc("float", 2.6, 0.07)]),
  talkStrength: 0.05,
  carryOffset: [0, -0.2, 0.2],
  defaultStyle: "float"
};
