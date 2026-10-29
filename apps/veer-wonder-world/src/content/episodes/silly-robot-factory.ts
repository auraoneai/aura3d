// E13 — The Silly Robot Factory (P2, PRD 05 E13, task H08). Hosts: Momo +
// an original baby toy robot (the `robot` prop, voiced as speaker "robot").
//
// A baby robot hops out of Momo's toy box, then a hat hops out onto the floor
// in front of the box (until then the hat waits inside, below the rim and out
// of sight, so it appears only when it is named). The robot puts the hat down
// by its feet ("Hat on my feet!"), looks puzzled, then giggles. Momo helps fix
// one mix-up at a time: the hat goes back up to the robot (the child can tap
// the hat to help; `carry` with the robot as carrier, which the stage draws on
// top of a carrying prop, so the hat sits on its head), the robot tries to clap
// with its feet, then learns that hands clap and wave and feet stomp. Body
// words are said while the matching action is on screen (Momo claps and waves
// his hands, stomps his feet); the child can join each one by tapping or by
// clapping and stomping along. The robot stays in one piece: no disassembly,
// no scolding, no "wrong" choices; every wait ends by itself.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "silly-robot-factory",
  number: 13,
  version: 1,
  phase: "P2",
  titleKey: "e13.title",
  world: "home-nook",
  host: "momo",
  cast: [{ id: "momo", at: "offLeft" }],
  props: [
    { id: "toy-box", asset: "toyBox", at: "right", size: 0.6 },
    { id: "robot", asset: "robot", at: "right", hidden: true, size: 0.8 },
    { id: "hat", asset: "hat", at: "right", hidden: true, size: 0.25 }
  ],
  targetWords: ["hat", "feet", "hands"],
  supportWords: ["help", "robot", "beep", "clap", "stomp", "wave", "box", "uh-oh", "thank-you", "hi", "hello", "bye", "all-done"],
  music: "homeBed",
  offlinePlayKey: "e13.offline",
  caregiverBridgeKey: "e13.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 144,
  beats: [
    {
      id: "greeting",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "homeBed" },
        { do: "enter", actor: "momo", at: "left", from: "offLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e13.greeting.1" },
        { speaker: "momo", key: "e13.greeting.2" }
      ],
      words: [
        { wordId: "hi", objectId: "momo" },
        { wordId: "box", objectId: "toy-box" }
      ],
      holdMs: 1200
    },
    {
      id: "robot-pops",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "object", target: "toy-box", action: "open" },
        { do: "sfx", sound: "beep" },
        { do: "enter", actor: "robot", at: "center", from: "right", style: "hop" },
        { do: "face", actor: "momo", toward: "robot" }
      ],
      reducedMotionStage: [
        { do: "object", target: "toy-box", action: "open" },
        { do: "sfx", sound: "beep" },
        { do: "enter", actor: "robot", at: "center", from: "right", style: "slide" },
        { do: "face", actor: "momo", toward: "robot" }
      ],
      lines: [
        { speaker: "narrator", key: "e13.robot-pops.1" },
        { speaker: "robot", key: "e13.robot-pops.2" }
      ],
      words: [
        { wordId: "robot", objectId: "robot" },
        { wordId: "beep", objectId: "robot" },
        { wordId: "hello", objectId: "robot" }
      ],
      holdMs: 1200
    },
    {
      id: "hat",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "enter", actor: "hat", at: "frontRight", from: "right", style: "hop" },
        { do: "face", actor: "robot", toward: "hat" },
        { do: "face", actor: "momo", toward: "hat" }
      ],
      reducedMotionStage: [
        { do: "enter", actor: "hat", at: "frontRight", from: "right", style: "slide" },
        { do: "face", actor: "robot", toward: "hat" },
        { do: "face", actor: "momo", toward: "hat" }
      ],
      lines: [
        { speaker: "robot", key: "e13.hat.1" },
        { speaker: "robot", key: "e13.hat.2" }
      ],
      words: [{ wordId: "hat", objectId: "hat" }],
      holdMs: 1000
    },
    {
      id: "hat-on-feet",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "move", actor: "hat", to: "center", style: "hop" },
        { do: "object", target: "robot", action: "wobble" },
        { do: "face", actor: "robot", toward: "viewer" }
      ],
      reducedMotionStage: [
        { do: "move", actor: "hat", to: "center", style: "slide" },
        { do: "face", actor: "robot", toward: "viewer" }
      ],
      lines: [
        { speaker: "robot", key: "e13.hat-on-feet.1" },
        { speaker: "narrator", key: "e13.hat-on-feet.2" }
      ],
      words: [
        { wordId: "uh-oh", objectId: "robot" },
        { wordId: "feet", objectId: "robot" },
        { wordId: "hat", objectId: "hat" }
      ],
      holdMs: 1200,
      caregiverPromptKey: "e13.tip.3"
    },
    {
      id: "giggle",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "giggle" },
        { do: "object", target: "robot", action: "bounce" },
        { do: "face", actor: "momo", toward: "robot" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "giggle" },
        { do: "object", target: "robot", action: "wobble" },
        { do: "face", actor: "momo", toward: "robot" },
        { do: "gesture", actor: "momo", gesture: "nod" }
      ],
      lines: [
        { speaker: "momo", key: "e13.giggle.1" },
        { speaker: "momo", key: "e13.giggle.2" }
      ],
      words: [{ wordId: "hat", objectId: "hat" }],
      holdMs: 1200
    },
    {
      id: "help-hat",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e13.help-hat.1" },
        { speaker: "momo", key: "e13.help-hat.2" }
      ],
      words: [
        { wordId: "help", objectId: "momo" },
        { wordId: "hat", objectId: "hat" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["hat"] },
      waitMs: 5000,
      caregiverPromptKey: "e13.tip.1",
      response: {
        stage: [
          { do: "carry", actor: "robot", item: "hat" },
          { do: "sfx", sound: "ding" },
          { do: "face", actor: "momo", toward: "robot" },
          { do: "gesture", actor: "momo", gesture: "happy" }
        ],
        lines: [
          { speaker: "narrator", key: "e13.help-hat.3" },
          { speaker: "robot", key: "e13.help-hat.4" }
        ],
        holdMs: 1500
      }
    },
    {
      id: "clap-feet",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "face", actor: "robot", toward: "viewer" },
        { do: "object", target: "robot", action: "bounce" },
        { do: "sfx", sound: "stomp" }
      ],
      reducedMotionStage: [
        { do: "face", actor: "robot", toward: "viewer" },
        { do: "object", target: "robot", action: "wobble" },
        { do: "sfx", sound: "stomp" }
      ],
      lines: [
        { speaker: "robot", key: "e13.clap-feet.1" },
        { speaker: "narrator", key: "e13.clap-feet.2" }
      ],
      words: [
        { wordId: "feet", objectId: "robot" },
        { wordId: "stomp", objectId: "robot" }
      ],
      holdMs: 1200
    },
    {
      id: "hands-model",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "robot" },
        { do: "gesture", actor: "momo", gesture: "clap" },
        { do: "sfx", sound: "clap" }
      ],
      lines: [
        { speaker: "momo", key: "e13.hands-model.1" },
        { speaker: "momo", key: "e13.hands-model.2" }
      ],
      words: [
        { wordId: "hands", objectId: "momo" },
        { wordId: "clap", objectId: "momo" }
      ],
      holdMs: 1200,
      caregiverPromptKey: "e13.tip.2"
    },
    {
      id: "robot-claps",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "face", actor: "robot", toward: "momo" },
        { do: "object", target: "robot", action: "wobble" },
        { do: "sfx", sound: "clap" }
      ],
      lines: [
        { speaker: "robot", key: "e13.robot-claps.1" },
        { speaker: "narrator", key: "e13.robot-claps.2" }
      ],
      words: [
        { wordId: "hands", objectId: "robot" },
        { wordId: "clap", objectId: "robot" }
      ],
      holdMs: 1200
    },
    {
      id: "turn-clap",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "robot", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [{ speaker: "momo", key: "e13.turn-clap.1" }],
      words: [{ wordId: "hands", objectId: "momo" }],
      holdMs: 500,
      input: { type: "tap", targets: ["robot", "momo"] },
      waitMs: 5000,
      caregiverPromptKey: "e13.tip.2",
      response: {
        stage: [
          { do: "gesture", actor: "momo", gesture: "clap" },
          { do: "object", target: "robot", action: "wobble" },
          { do: "sfx", sound: "clap" }
        ],
        lines: [{ speaker: "narrator", key: "e13.turn-clap.2" }],
        holdMs: 1500
      }
    },
    {
      id: "wave-hands",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "face", actor: "robot", toward: "viewer" },
        { do: "object", target: "robot", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e13.wave-hands.1" },
        { speaker: "robot", key: "e13.wave-hands.2" }
      ],
      words: [
        { wordId: "hands", objectId: "momo" },
        { wordId: "wave", objectId: "momo" }
      ],
      holdMs: 1200
    },
    {
      id: "feet-stomp",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "gesture", actor: "momo", gesture: "stomp" },
        { do: "sfx", sound: "stomp" },
        { do: "object", target: "robot", action: "bounce" }
      ],
      reducedMotionStage: [
        { do: "gesture", actor: "momo", gesture: "stomp" },
        { do: "sfx", sound: "stomp" },
        { do: "object", target: "robot", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e13.feet-stomp.1" },
        { speaker: "robot", key: "e13.feet-stomp.2" }
      ],
      words: [
        { wordId: "feet", objectId: "momo" },
        { wordId: "stomp", objectId: "momo" }
      ],
      holdMs: 1200
    },
    {
      id: "turn-stomp",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [{ speaker: "momo", key: "e13.turn-stomp.1" }],
      words: [{ wordId: "feet", objectId: "robot" }],
      holdMs: 500,
      input: { type: "tap", targets: ["robot", "momo"] },
      waitMs: 5000,
      caregiverPromptKey: "e13.tip.2",
      response: {
        stage: [
          { do: "gesture", actor: "momo", gesture: "stomp" },
          { do: "object", target: "robot", action: "wobble" },
          { do: "sfx", sound: "stomp" }
        ],
        lines: [{ speaker: "narrator", key: "e13.turn-stomp.2" }],
        holdMs: 1500
      }
    },
    {
      id: "all-fixed",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "ding" },
        { do: "object", target: "robot", action: "wobble" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "narrator", key: "e13.all-fixed.1" },
        { speaker: "robot", key: "e13.all-fixed.2" },
        { speaker: "momo", key: "e13.all-fixed.3" }
      ],
      words: [
        { wordId: "hat", objectId: "hat" },
        { wordId: "help", objectId: "momo" },
        { wordId: "thank-you", objectId: "robot" }
      ],
      holdMs: 800
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "goStop" },
        { do: "gesture", actor: "momo", gesture: "dance", loop: true },
        { do: "object", target: "robot", action: "bounce" }
      ],
      reducedMotionStage: [
        { do: "song", song: "goStop" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true }
      ],
      lines: [],
      holdMs: 16500
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "robot", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "object", target: "robot", action: "wobble" },
        { do: "sfx", sound: "beep" }
      ],
      lines: [
        { speaker: "momo", key: "e13.outro.1" },
        { speaker: "robot", key: "e13.outro.2" },
        { speaker: "momo", key: "e13.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "robot" }
      ],
      holdMs: 3500
    }
  ]
};
