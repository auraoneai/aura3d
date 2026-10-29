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
  clipCandidates: {},
  locomotionClips: {},
  gestures: {
    wag: gestureMotion([proc("wag", 1.2, 0.28, 3), proc("bob", 1.2, 0.02, 3)]),
    happy: gestureMotion([proc("hop", 1.4, 0.12, 2), proc("wag", 1.4, 0.22, 4)]),
    cheer: gestureMotion([proc("hop", 1.4, 0.14, 2), proc("wag", 1.4, 0.24, 4)]),
    bark: gestureMotion([proc("squash", 0.35, 0.1), proc("hop", 0.35, 0.05)]),
    sniff: gestureMotion([proc("lean", 1.4, 0.25), proc("bob", 1.4, 0.025, 5)]),
    sit: gestureMotion([proc("duck", 1.0, 0.18), proc("lean", 1.0, -0.12)], { hold: true }),
    wave: gestureMotion([proc("wag", 1.4, 0.24, 3), proc("hop", 1.4, 0.06, 1)]),
    look: gestureMotion([proc("turn", 2.0, 0.5)]),
    dance: gestureMotion([proc("hop", 2.2, 0.1, 3), proc("wag", 2.2, 0.25, 5)]),
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
