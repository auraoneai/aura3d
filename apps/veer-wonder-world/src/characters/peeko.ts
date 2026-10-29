// Peeko (PRD 04 D04): a round little chick who loves
// peekaboo. Not rigged: hops, hides (ducks down and stays low until the next
// gesture), pops back up, flaps its tiny wings with a width pulse and talks
// with a soft squash pulse. Never frightening: no sudden jumps at the viewer.

import type { CharacterDefinition } from "./character-registry.js";
import { gestureMotion, proc } from "../scenes/motion.js";

export const PEEKO: CharacterDefinition = {
  id: "peeko",
  modelKey: "peeko",
  displayNameKey: "ui.speaker.peeko",
  color: "#FFE15A",
  voice: "peeko",
  speaks: true,
  clipCandidates: {},
  locomotionClips: {},
  gestures: {
    hop: gestureMotion([proc("hop", 0.7, 0.18)]),
    wave: gestureMotion([proc("flap", 1.4, 0.22, 3), proc("hop", 1.4, 0.05, 1)]),
    happy: gestureMotion([proc("hop", 1.4, 0.16, 2), proc("flap", 1.4, 0.18, 4)]),
    cheer: gestureMotion([proc("hop", 1.4, 0.18, 2), proc("flap", 1.4, 0.2, 4)]),
    hide: gestureMotion([proc("duck", 0.9, 0.55)], { hold: true }),
    peek: gestureMotion([proc("hop", 1.0, 0.14), proc("peek", 1.0, 0.12)]),
    dance: gestureMotion([proc("hop", 2.2, 0.1, 4), proc("rock", 2.2, 0.12, 2)]),
    talk: gestureMotion([proc("squash", 0.6, 0.06, 2)], { durationSec: 0.6 })
  },
  idleMotion: gestureMotion([proc("pulse", 2.2, 0.015)]),
  talkStrength: 0.05,
  carryOffset: [0, 0.3, 0.6],
  defaultStyle: "hop"
};
