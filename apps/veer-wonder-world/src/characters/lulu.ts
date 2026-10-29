// Lulu (PRD 04 D02): rounded mint baby dinosaur, the rhythm leader. Lulu moves
// procedurally (dance sway, stomp hop, clap pulses, freeze): the Meshy rig was
// tried on Lulu and rejected (`aura3d assets validate --skin` failed in every
// clip; MASTER-PROMPT section 3.6, MODEL_INFO.lulu has rigged: false and no
// clips). The clip names below (idle, walk, run, dance, hop, cheer, wave, talk,
// sway, jazzHands, happyJump, funnyDance) are candidates for a later rig: a
// clip plays only when MODEL_INFO lists it, so today a clap is a soft
// three-beat dip, a stomp marches in place and a freeze holds still.

import type { CharacterDefinition } from "./character-registry.js";
import { gestureMotion, proc } from "../scenes/motion.js";

export const LULU: CharacterDefinition = {
  id: "lulu",
  modelKey: "lulu",
  displayNameKey: "ui.speaker.lulu",
  color: "#7ED6AE",
  voice: "lulu",
  speaks: true,
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
