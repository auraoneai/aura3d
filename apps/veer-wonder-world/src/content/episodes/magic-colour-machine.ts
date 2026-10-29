// E07 — The Magic Colour Machine (P2, PRD 05 E07 / 04 H03). Momo's plain ball
// rolls into Lumi's colour machine and comes out red. Lumi's ball goes in next
// (the child's tap, or the wait, starts the machine) and comes out blue. The
// child then picks the red or the blue ball and both bounce; Momo and Lumi
// swap balls and sing the colours song.
//
// Six-beat blueprint (PRD 01 section 5): greeting (hello song, then hi), hook
// (the machine, the ball rolls in), explore (red, then blue: two attempts),
// child turns (start the machine; choose a ball), resolution + song
// (colours), natural ending.
//
// Colour is never the only cue: each ball comes out on its owner's side (red
// by Momo, blue by Lumi), and every colour is spoken while its ball is shown,
// again as each ball rolls over when the friends swap balls. The machine
// works with a soft wobble, a gentle glow and a sparkle sound, never a flash.
// A tap on either ball is a good answer; the caregiver tip asks the adult to
// name the colour the child picked. Nothing is timed, quizzed or scored.
//
// Stage note: the colour change uses the "tint" object action. Both balls
// start plain (#F2EEE6) and are tinted red (#E4574B) and blue (#3B7DD8) while
// hidden inside the machine.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "magic-colour-machine",
  number: 7,
  version: 1,
  phase: "P2",
  titleKey: "e07.title",
  world: "learning-cloud",
  host: "momo",
  cast: [
    { id: "momo", at: "offLeft" },
    { id: "lumi", at: "offTop" }
  ],
  props: [
    { id: "machine", asset: "colourMachine", at: "back", size: 1.6 },
    { id: "red-ball", asset: "ball", at: "offLeft", tint: "#F2EEE6", size: 0.4 },
    { id: "blue-ball", asset: "ball", at: "right", hidden: true, tint: "#F2EEE6", size: 0.4 }
  ],
  targetWords: ["red", "blue", "ball"],
  supportWords: ["look", "roll", "in", "uh-oh", "hi", "hello", "your-turn", "thank-you", "bye", "all-done"],
  music: "cloudBed",
  offlinePlayKey: "e07.offline",
  caregiverBridgeKey: "e07.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 134,
  beats: [
    {
      id: "hello",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "cloudBed" },
        { do: "song", song: "hello" },
        { do: "enter", actor: "momo", at: "left", from: "offLeft", style: "walk" },
        { do: "enter", actor: "lumi", at: "highRight", from: "offTop", style: "float" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [],
      holdMs: 11000
    },
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "wave" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e07.greet.1" },
        { speaker: "lumi", key: "e07.greet.2" }
      ],
      words: [
        { wordId: "hi", objectId: "momo" },
        { wordId: "hello", objectId: "lumi" }
      ],
      holdMs: 1000
    },
    {
      id: "found",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "object", target: "machine", action: "glow" },
        { do: "sfx", sound: "sparkle" },
        { do: "gesture", actor: "lumi", gesture: "point" },
        { do: "face", actor: "momo", toward: "machine" }
      ],
      lines: [
        { speaker: "lumi", key: "e07.found.1" },
        { speaker: "narrator", key: "e07.found.2" }
      ],
      words: [{ wordId: "look", objectId: "machine" }],
      holdMs: 1500
    },
    {
      id: "ball-rolls",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "move", actor: "red-ball", to: "center", style: "roll" },
        { do: "face", actor: "momo", toward: "red-ball" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "momo", key: "e07.ball-rolls.1" },
        { speaker: "narrator", key: "e07.ball-rolls.2" }
      ],
      words: [
        { wordId: "uh-oh", objectId: "momo" },
        { wordId: "ball", objectId: "red-ball" },
        { wordId: "roll", objectId: "red-ball" }
      ],
      holdMs: 1000
    },
    {
      id: "ball-in",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "move", actor: "red-ball", to: "back", style: "roll" },
        { do: "face", actor: "momo", toward: "machine" }
      ],
      lines: [{ speaker: "narrator", key: "e07.ball-in.1" }],
      words: [
        { wordId: "in", objectId: "red-ball" },
        { wordId: "ball", objectId: "red-ball" }
      ],
      holdMs: 1000
    },
    {
      id: "whirr",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "hide", actor: "red-ball" },
        { do: "object", target: "red-ball", action: "tint", tint: "#E4574B" },
        { do: "object", target: "machine", action: "wobble" },
        { do: "sfx", sound: "sparkle" },
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      reducedMotionStage: [
        { do: "hide", actor: "red-ball" },
        { do: "object", target: "red-ball", action: "tint", tint: "#E4574B" },
        { do: "object", target: "machine", action: "glow" },
        { do: "sfx", sound: "sparkle" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "narrator", key: "e07.whirr.1" },
        { speaker: "momo", key: "e07.whirr.2" }
      ],
      holdMs: 1500
    },
    {
      id: "red",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "object", target: "red-ball", action: "tint", tint: "#E4574B" },
        { do: "show", actor: "red-ball" },
        { do: "move", actor: "red-ball", to: "frontLeft", style: "roll" },
        { do: "sfx", sound: "ding" },
        { do: "gesture", actor: "lumi", gesture: "point" },
        { do: "face", actor: "momo", toward: "red-ball" }
      ],
      lines: [
        { speaker: "lumi", key: "e07.red.1" },
        { speaker: "narrator", key: "e07.red.2" },
        { speaker: "momo", key: "e07.red.3" }
      ],
      words: [
        { wordId: "red", objectId: "red-ball" },
        { wordId: "ball", objectId: "red-ball" }
      ],
      holdMs: 2000
    },
    {
      id: "lumi-ball",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "sfx", sound: "sparkle" },
        { do: "show", actor: "blue-ball" },
        { do: "face", actor: "momo", toward: "blue-ball" }
      ],
      lines: [{ speaker: "lumi", key: "e07.lumi-ball.1" }],
      words: [{ wordId: "ball", objectId: "blue-ball" }],
      holdMs: 1000
    },
    {
      id: "lumi-ball-in",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "move", actor: "blue-ball", to: "back", style: "roll" },
        { do: "face", actor: "momo", toward: "machine" }
      ],
      lines: [
        { speaker: "lumi", key: "e07.lumi-ball-in.1" },
        { speaker: "narrator", key: "e07.lumi-ball-in.2" }
      ],
      words: [
        { wordId: "roll", objectId: "blue-ball" },
        { wordId: "in", objectId: "blue-ball" },
        { wordId: "ball", objectId: "blue-ball" }
      ],
      holdMs: 1000
    },
    {
      id: "invite-machine",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "hide", actor: "blue-ball" },
        { do: "object", target: "blue-ball", action: "tint", tint: "#3B7DD8" },
        { do: "object", target: "machine", action: "glow" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [{ speaker: "momo", key: "e07.invite-machine.1" }],
      words: [{ wordId: "your-turn", objectId: "machine" }],
      holdMs: 500,
      input: { type: "tap", targets: ["machine"] },
      waitMs: 5000,
      caregiverPromptKey: "e07.tip.1",
      response: {
        stage: [
          { do: "object", target: "machine", action: "wobble" },
          { do: "sfx", sound: "sparkle" },
          { do: "gesture", actor: "lumi", gesture: "glow" },
          { do: "face", actor: "momo", toward: "machine" }
        ],
        lines: [{ speaker: "narrator", key: "e07.invite-machine.2" }],
        holdMs: 1000
      }
    },
    {
      id: "blue",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "object", target: "blue-ball", action: "tint", tint: "#3B7DD8" },
        { do: "show", actor: "blue-ball" },
        { do: "move", actor: "blue-ball", to: "frontRight", style: "roll" },
        { do: "sfx", sound: "ding" },
        { do: "gesture", actor: "momo", gesture: "happy" },
        { do: "face", actor: "lumi", toward: "blue-ball" }
      ],
      lines: [
        { speaker: "lumi", key: "e07.blue.1" },
        { speaker: "narrator", key: "e07.blue.2" },
        { speaker: "lumi", key: "e07.blue.3" }
      ],
      words: [
        { wordId: "blue", objectId: "blue-ball" },
        { wordId: "ball", objectId: "blue-ball" }
      ],
      holdMs: 2000
    },
    {
      id: "both",
      kind: "repeat",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "red-ball" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "face", actor: "lumi", toward: "blue-ball" },
        { do: "gesture", actor: "lumi", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e07.both.1" },
        { speaker: "lumi", key: "e07.both.2" }
      ],
      words: [
        { wordId: "red", objectId: "red-ball" },
        { wordId: "blue", objectId: "blue-ball" },
        { wordId: "ball", objectId: "red-ball" }
      ],
      holdMs: 1500
    },
    {
      id: "invite-choose",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "object", target: "red-ball", action: "glow" },
        { do: "object", target: "blue-ball", action: "glow" }
      ],
      lines: [{ speaker: "momo", key: "e07.invite-choose.1" }],
      words: [
        { wordId: "red", objectId: "red-ball" },
        { wordId: "blue", objectId: "blue-ball" },
        { wordId: "ball", objectId: "blue-ball" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["red-ball", "blue-ball"] },
      waitMs: 5000,
      caregiverPromptKey: "e07.tip.2",
      response: {
        stage: [
          { do: "object", target: "red-ball", action: "bounce" },
          { do: "object", target: "blue-ball", action: "bounce" },
          { do: "sfx", sound: "boing" },
          { do: "gesture", actor: "momo", gesture: "cheer" }
        ],
        lines: [{ speaker: "narrator", key: "e07.invite-choose.2" }],
        holdMs: 1500
      }
    },
    {
      id: "play-red",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "move", actor: "red-ball", to: "right", style: "roll" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "face", actor: "lumi", toward: "red-ball" }
      ],
      lines: [{ speaker: "momo", key: "e07.play-red.1" }],
      words: [
        { wordId: "red", objectId: "red-ball" },
        { wordId: "ball", objectId: "red-ball" }
      ],
      holdMs: 1000
    },
    {
      id: "play-blue",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "move", actor: "blue-ball", to: "frontLeft", style: "roll" },
        { do: "gesture", actor: "lumi", gesture: "happy" },
        { do: "face", actor: "momo", toward: "blue-ball" }
      ],
      lines: [{ speaker: "lumi", key: "e07.play-blue.1" }],
      words: [
        { wordId: "thank-you", objectId: "lumi" },
        { wordId: "blue", objectId: "blue-ball" },
        { wordId: "ball", objectId: "blue-ball" }
      ],
      holdMs: 1500
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "colours" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "dance", loop: true },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "colours" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true }
      ],
      lines: [],
      holdMs: 17000,
      caregiverPromptKey: "e07.tip.3"
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "lumi", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e07.outro.1" },
        { speaker: "lumi", key: "e07.outro.2" },
        { speaker: "momo", key: "e07.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "lumi" },
        { wordId: "red", objectId: "red-ball" },
        { wordId: "blue", objectId: "blue-ball" },
        { wordId: "ball", objectId: "red-ball" }
      ],
      holdMs: 3000
    }
  ]
};
