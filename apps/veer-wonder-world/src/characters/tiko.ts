// Tiko (PRD 09 B.8 / C.4): gentle sea-green little turtle, the unhurried
// counter and careful observer on the Learning Cloud. Tiko is a sculpted
// multi-craft procedural joint rig (`MODEL_INFO.tiko.procedural === true`)
// with a patterned hexagonal scute shell, cosy felt neckerchief, articulated
// head, eyelids, jaw, rosy cheeks, front flipper-arms, sturdy hind feet, and
// wagging little tail. Tiko never snaps or hides from fear—only cosy peekaboo.

import type { CharacterDefinition } from "./character-registry.js";
import { gestureMotion, proc } from "../scenes/motion.js";

export const TIKO: CharacterDefinition = {
  id: "tiko",
  modelKey: "tiko",
  displayNameKey: "ui.speaker.tiko",
  color: "#5bbf9a",
  voice: "tiko",
  speaks: true,
  articulatedParts: [
    "body",
    "head",
    "eyelidL",
    "eyelidR",
    "jaw",
    "cheekPuff",
    "armL",
    "armR",
    "footL",
    "footR",
    "tail"
  ],
  clipCandidates: {},
  locomotionClips: {},
  gestures: {
    nod: gestureMotion([proc("nod", 1.2, 0.14, 2)]),
    point: gestureMotion([proc("lean", 1.5, 0.14), proc("turn", 1.5, 0.1)]),
    look: gestureMotion([proc("turn", 2.2, 0.36), proc("lean", 2.2, 0.08)]),
    wave: gestureMotion([proc("rock", 1.8, 0.08, 2), proc("bob", 1.8, 0.025, 2)]),
    peek: gestureMotion([proc("peek", 1.5, 0.18), proc("nod", 1.5, 0.08, 1)]),
    hide: gestureMotion([proc("duck", 1.0, 0.44)], { hold: true }),
    happy: gestureMotion([proc("hop", 1.4, 0.12, 2), proc("wag", 1.4, 0.05, 3)]),
    cheer: gestureMotion([proc("hop", 1.5, 0.14, 2), proc("rock", 1.5, 0.06, 2)]),
    clap: gestureMotion([proc("dip", 1.8, 0.055, 3)]),
    sway: gestureMotion([proc("rock", 2.6, 0.09)]),
    dance: gestureMotion([proc("rock", 2.4, 0.12, 3), proc("bob", 2.4, 0.045, 4)]),
    // Calm curious turtle surprise: rises slightly with a gentle head tilt, then settles back to neutral.
    surprise: gestureMotion([proc("stretch", 0.85, 0.08), proc("tilt", 0.85, 0.08)]),
    // Unhurried observer wait: leans forward attentively with a soft tilt and holds still.
    wait: gestureMotion([proc("lean", 1.0, 0.08), proc("tilt", 1.0, 0.05)], { hold: true })
  },
  idleMotion: gestureMotion([proc("pulse", 3.4, 0.011)]),
  talkStrength: 0.035,
  carryOffset: [0, 0.42, 0.48],
  defaultStyle: "walk"
};
