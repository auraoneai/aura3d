// Lulu (PRD 04 D02): rounded mint baby dinosaur, the rhythm leader. Lulu is a
// procedural matte-clay and felt joint rig (`MODEL_INFO.lulu.procedural === true`)
// whose head, arms, feet, tail, eyelids, jaw, and cheeks dance, clap, stomp,
// and freeze deterministically via `sampleCharacterSubParts`.

import type { CharacterDefinition } from "./character-registry.js";
import { gestureMotion, proc } from "../scenes/motion.js";

export const LULU: CharacterDefinition = {
  id: "lulu",
  modelKey: "lulu",
  displayNameKey: "ui.speaker.lulu",
  color: "#7ED6AE",
  voice: "lulu",
  speaks: true,
  articulatedParts: ["body", "head", "armL", "armR", "footL", "footR", "tail", "eyelidL", "eyelidR", "jaw", "cheekPuff"],
  clipCandidates: {
    idle: ["idle"],
    talk: ["talk"],
    wave: ["wave"],
    happy: ["happyJump", "cheer"],
    cheer: ["cheer", "happyJump"],
    dance: ["dance", "funnyDance", "jazzHands"],
    hop: ["hop", "happyJump"],
    sway: ["sway"],
    clap: ["clap", "jazzHands"],
    stomp: ["stomp", "walk"],
    freeze: ["idle"]
  },
  locomotionClips: {
    walk: ["walk"],
    run: ["run", "walk"],
    hop: ["hop", "walk"],
    slide: ["walk"]
  },
  gestures: {
    clap: gestureMotion([proc("dip", 1.8, 0.07, 3)]),
    stomp: gestureMotion([proc("dip", 1.6, 0.12, 2), proc("hop", 1.6, 0.06, 2)]),
    dance: gestureMotion([proc("rock", 2.4, 0.15, 3), proc("hop", 2.4, 0.08, 4)]),
    sway: gestureMotion([proc("rock", 2.4, 0.12)]),
    cheer: gestureMotion([proc("hop", 1.5, 0.22, 2), proc("rock", 1.5, 0.06, 2)])
  },
  idleMotion: gestureMotion([proc("pulse", 2.8, 0.012)]),
  talkStrength: 0.04,
  carryOffset: [0, 0.5, 0.4],
  defaultStyle: "walk"
};
