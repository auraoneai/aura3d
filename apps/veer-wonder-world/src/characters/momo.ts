// Momo (PRD 04 D01): small fuzzy purple monster, the warm host. Momo is a
// procedural needle-felted joint rig (`MODEL_INFO.momo.procedural === true`)
// whose head, arms, feet, eyelids, jaw, and rosy cheeks move deterministically
// via `sampleCharacterSubParts` and the calm gesture envelopes below. Momo
// points and waits rather than asking question after question.

import type { CharacterDefinition } from "./character-registry.js";
import { gestureMotion, proc } from "../scenes/motion.js";

export const MOMO: CharacterDefinition = {
  id: "momo",
  modelKey: "momo",
  displayNameKey: "ui.speaker.momo",
  color: "#8E6CD8",
  voice: "momo",
  speaks: true,
  articulatedParts: ["body", "head", "armL", "armR", "footL", "footR", "eyelidL", "eyelidR", "jaw", "cheekPuff"],
  clipCandidates: {
    idle: ["idle"],
    talk: ["talk"],
    wave: ["wave"],
    happy: ["happyJump", "cheer"],
    cheer: ["cheer", "happyJump"],
    dance: ["dance", "jazzHands", "sway"],
    hop: ["hop", "happyJump"],
    look: ["lookAround"],
    sleep: ["sleep"],
    eat: ["eat", "drink"],
    wake: ["wakeUp"],
    sway: ["sway"],
    mirror: ["mirror"],
    pickUp: ["pickUp"],
    shrug: ["shrug"],
    clap: ["clap", "jazzHands"],
    freeze: ["idle"]
  },
  locomotionClips: {
    walk: ["walk"],
    run: ["run", "walk"],
    hop: ["walk"],
    slide: ["walk"]
  },
  gestures: {
    wave: gestureMotion([proc("rock", 1.8, 0.1, 2), proc("bob", 1.8, 0.03, 2)]),
    point: gestureMotion([proc("lean", 1.5, 0.18), proc("turn", 1.5, 0.12)]),
    happy: gestureMotion([proc("hop", 1.3, 0.18, 2)]),
    dance: gestureMotion([proc("rock", 2.4, 0.16, 3), proc("bob", 2.4, 0.06, 4)]),
    mirror: gestureMotion([proc("turn", 2.0, 0.3, 2), proc("squash", 2.0, 0.05, 2)]),
    eat: gestureMotion([proc("chomp", 1.6, 0.12, 3)]),
    // Surprised "Oh!": rises tall with a small lean back and a tiny hop, then settles (07 B20).
    surprise: gestureMotion([proc("stretch", 0.9, 0.1), proc("lean", 0.9, -0.08), proc("hop", 0.9, 0.05)]),
    // Waits for the child: leans in with a curious little tilt and holds it (D01: points and waits).
    wait: gestureMotion([proc("lean", 1.0, 0.1), proc("tilt", 1.0, 0.07)], { hold: true })
  },
  idleMotion: gestureMotion([proc("pulse", 3.0, 0.012)]),
  talkStrength: 0.04,
  carryOffset: [0, 0.42, 0.46],
  defaultStyle: "walk"
};
