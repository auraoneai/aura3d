// Sheru (PRD 04 D03): an original cartoon puppy with gentle floppy ears. Not
// rigged: every gesture is procedural (walk bob, tail-style wag as a yaw
// wiggle, sniff bob, happy hops, squash-stretch reactions). Sheru never speaks
// words; the bark is a sound effect ("woof"), and setTalking only adds a small
// pulse while it plays. Carried items (the ball) ride at the mouth.

import type { CharacterDefinition } from "./character-registry.js";
import { gestureMotion, proc } from "../scenes/motion.js";

export const SHERU: CharacterDefinition = {
  id: "sheru",
  modelKey: "sheru",
  displayNameKey: "ui.speaker.sheru",
  color: "#EAD3A8",
  voice: "sheru",
  speaks: false,
  articulatedParts: ["body", "head", "earL", "earR", "tail", "legFL", "legFR", "legBL", "legBR", "eyelidL", "eyelidR", "jaw"],
  clipCandidates: {},
  locomotionClips: {},
  gestures: {
    // Steady body while Sheru's tail wags joyfully at 5.5 Hz (±0.48 rad) in sub-parts.
    wag: gestureMotion([proc("wag", 1.2, 0.04, 3), proc("bob", 1.2, 0.018, 3)]),
    happy: gestureMotion([proc("hop", 1.4, 0.12, 2), proc("wag", 1.4, 0.06, 4)]),
    cheer: gestureMotion([proc("hop", 1.4, 0.14, 2), proc("wag", 1.4, 0.07, 4)]),
    bark: gestureMotion([proc("squash", 0.35, 0.1), proc("hop", 0.35, 0.05)]),
    sniff: gestureMotion([proc("lean", 1.4, 0.18), proc("bob", 1.4, 0.022, 5)]),
    sit: gestureMotion([proc("duck", 1.0, 0.16), proc("lean", 1.0, -0.1)], { hold: true }),
    wave: gestureMotion([proc("wag", 1.4, 0.06, 3), proc("hop", 1.4, 0.06, 1)]),
    look: gestureMotion([proc("turn", 2.0, 0.42)]),
    dance: gestureMotion([proc("hop", 2.2, 0.1, 3), proc("wag", 2.2, 0.08, 5)]),
    talk: gestureMotion([proc("squash", 0.6, 0.05, 2)], { durationSec: 0.6 }),
    // Surprised like a puppy (07 B20): ears-up stretch, a small hop and a head tilt, then back.
    surprise: gestureMotion([proc("stretch", 0.8, 0.08), proc("hop", 0.8, 0.05), proc("tilt", 0.8, 0.12)]),
    // Waits like a dog: settles into a small sit, looking up, and holds it.
    wait: gestureMotion([proc("duck", 1.0, 0.1), proc("lean", 1.0, -0.08)], { hold: true })
  },
  idleMotion: gestureMotion([proc("pulse", 2.4, 0.014)]),
  talkStrength: 0.05,
  carryOffset: [0, 0.68, 0.72],
  defaultStyle: "walk"
};
