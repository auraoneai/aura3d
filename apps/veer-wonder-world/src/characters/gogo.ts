// GoGo (PRD 04 D06): a chunky red toy train with a friendly face. Not rigged:
// it departs and brakes with eased drive moves along the track, chugs gently
// while "going" (object action go/stop), bobs when it talks, and turns fully to
// face its direction of travel. Passengers ride on top (carry).

import type { CharacterDefinition } from "./character-registry.js";
import { gestureMotion, proc } from "../scenes/motion.js";

export const GOGO: CharacterDefinition = {
  id: "gogo",
  modelKey: "gogo",
  displayNameKey: "ui.speaker.gogo",
  color: "#E2483D",
  voice: "gogo",
  speaks: true,
  clipCandidates: {},
  locomotionClips: {},
  gestures: {
    wave: gestureMotion([proc("rock", 1.6, 0.06, 2)]),
    happy: gestureMotion([proc("hop", 1.2, 0.08, 2)]),
    cheer: gestureMotion([proc("hop", 1.4, 0.1, 2)]),
    dance: gestureMotion([proc("rock", 2.4, 0.07, 3), proc("bob", 2.4, 0.03, 4)]),
    hop: gestureMotion([proc("hop", 0.7, 0.1)]),
    nod: gestureMotion([proc("nod", 1.0, 0.08, 2)]),
    look: gestureMotion([proc("turn", 2.0, 0.3)]),
    bow: gestureMotion([proc("bow", 1.4, 0.12)]),
    // Surprised it never jumps or stretches (07 B20): it rocks back on its springs with a little puff. Its happy,
    // cheer and hop gestures are small bounces on the springs.
    surprise: gestureMotion([proc("lean", 0.8, -0.05), proc("pulse", 0.8, 0.04)]),
    // Waiting: it settles on its springs and holds still, like a train at the platform.
    wait: gestureMotion([proc("duck", 1.0, 0.04)], { hold: true })
  },
  idleMotion: null,
  talkStrength: 0.03,
  carryOffset: [0, 0.98, -0.12],
  defaultStyle: "drive"
};
