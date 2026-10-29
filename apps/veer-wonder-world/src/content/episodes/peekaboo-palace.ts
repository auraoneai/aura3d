// E02 — The Peekaboo Palace (P1). Peeko the chick plays peekaboo with Momo.
// Two big doors: Peeko waits behind one, a duck behind the other. No startle:
// a door always wiggles first, opens slowly, and the friend inside waves. Only
// one door is a tap target at a time, and each door opens by itself when
// nobody taps. Song beats carry no lines so speech never overlaps the song.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "peekaboo-palace",
  number: 2,
  version: 1,
  phase: "P1",
  titleKey: "e02.title",
  world: "peekaboo-barn",
  host: "peeko",
  cast: [
    { id: "momo", at: "offLeft" },
    { id: "peeko", at: "backRight", hidden: true }
  ],
  props: [
    { id: "door-left", asset: "door", at: "left", size: 1.6 },
    { id: "door-right", asset: "door", at: "right", size: 1.6 },
    { id: "duck", asset: "duck", at: "backLeft", hidden: true, size: 0.5 }
  ],
  targetWords: ["open", "hi", "bye"],
  supportWords: ["door", "chick", "duck", "quack", "hands", "peekaboo", "all-done"],
  music: "barnBed",
  offlinePlayKey: "e02.offline",
  caregiverBridgeKey: "e02.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 131,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "barnBed" },
        { do: "enter", actor: "momo", at: "center", from: "offLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e02.greet.1" },
        { speaker: "narrator", key: "e02.greet.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 4100
    },
    {
      id: "hook",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "object", target: "door-right", action: "wobble" },
        { do: "sfx", sound: "rustle" },
        { do: "face", actor: "momo", toward: "door-right" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "narrator", key: "e02.hook.1" },
        { speaker: "momo", key: "e02.hook.2" },
        { speaker: "momo", key: "e02.hook.3" }
      ],
      words: [{ wordId: "door", objectId: "door-right" }],
      holdMs: 4600
    },
    {
      id: "open-right",
      kind: "model",
      camera: "right",
      stage: [
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "door-right", action: "open" },
        { do: "sfx", sound: "doorOpen" },
        { do: "show", actor: "peeko" },
        { do: "move", actor: "peeko", to: "frontRight", style: "hop" },
        { do: "gesture", actor: "peeko", gesture: "peek" }
      ],
      reducedMotionStage: [
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "door-right", action: "open" },
        { do: "sfx", sound: "doorOpen" },
        { do: "show", actor: "peeko" },
        { do: "move", actor: "peeko", to: "frontRight", style: "walk" },
        { do: "gesture", actor: "peeko", gesture: "peek" }
      ],
      lines: [
        { speaker: "narrator", key: "e02.open-right.1" },
        { speaker: "peeko", key: "e02.open-right.2" },
        { speaker: "momo", key: "e02.open-right.3" }
      ],
      words: [
        { wordId: "open", objectId: "door-right" },
        { wordId: "hi", objectId: "peeko" }
      ],
      holdMs: 4600
    },
    {
      id: "peeko-wave",
      kind: "event",
      camera: "right",
      stage: [
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "face", actor: "momo", toward: "peeko" }
      ],
      lines: [
        { speaker: "peeko", key: "e02.peeko-wave.1" },
        { speaker: "narrator", key: "e02.peeko-wave.2" }
      ],
      words: [
        { wordId: "hi", objectId: "peeko" },
        { wordId: "chick", objectId: "peeko" }
      ],
      holdMs: 4600
    },
    {
      id: "peeko-hide",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "move", actor: "peeko", to: "backRight", style: "hop" },
        { do: "gesture", actor: "peeko", gesture: "hide" },
        { do: "object", target: "door-right", action: "close" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      reducedMotionStage: [
        { do: "move", actor: "peeko", to: "backRight", style: "walk" },
        { do: "gesture", actor: "peeko", gesture: "hide" },
        { do: "object", target: "door-right", action: "close" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e02.peeko-hide.1" },
        { speaker: "narrator", key: "e02.peeko-hide.2" }
      ],
      words: [{ wordId: "bye", objectId: "peeko" }],
      holdMs: 4600
    },
    {
      id: "turn-left",
      kind: "invite",
      camera: "left",
      stage: [
        { do: "hide", actor: "peeko" },
        { do: "object", target: "door-left", action: "wobble" },
        { do: "sfx", sound: "quack" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e02.turn-left.1" },
        { speaker: "momo", key: "e02.turn-left.2" }
      ],
      words: [{ wordId: "open", objectId: "door-left" }],
      holdMs: 3600,
      input: { type: "tap", targets: ["door-left"] },
      waitMs: 5000,
      caregiverPromptKey: "e02.tip.1",
      response: {
        stage: [
          { do: "object", target: "door-left", action: "open" },
          { do: "sfx", sound: "doorOpen" },
          { do: "show", actor: "duck" },
          { do: "move", actor: "duck", to: "frontLeft", style: "walk" },
          { do: "face", actor: "momo", toward: "duck" }
        ],
        lines: [
          { speaker: "narrator", key: "e02.turn-left.3" },
          { speaker: "momo", key: "e02.turn-left.4" }
        ],
        holdMs: 4600
      }
    },
    {
      id: "duck",
      kind: "event",
      camera: "left",
      stage: [
        { do: "show", actor: "duck" },
        { do: "sfx", sound: "quack" },
        { do: "object", target: "duck", action: "bounce" },
        { do: "face", actor: "momo", toward: "duck" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "narrator", key: "e02.duck.1" },
        { speaker: "momo", key: "e02.duck.2" }
      ],
      words: [
        { wordId: "duck", objectId: "duck" },
        { wordId: "quack", objectId: "duck" }
      ],
      holdMs: 4600
    },
    {
      id: "turn-right",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "object", target: "door-right", action: "wobble" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "nod" }
      ],
      lines: [
        { speaker: "momo", key: "e02.turn-right.1" },
        { speaker: "momo", key: "e02.turn-right.2" }
      ],
      words: [{ wordId: "open", objectId: "door-right" }],
      holdMs: 3600,
      input: { type: "tap", targets: ["door-right"] },
      waitMs: 5000,
      caregiverPromptKey: "e02.tip.2",
      response: {
        stage: [
          { do: "object", target: "door-right", action: "open" },
          { do: "sfx", sound: "doorOpen" },
          { do: "show", actor: "peeko" },
          { do: "gesture", actor: "peeko", gesture: "peek" },
          { do: "face", actor: "momo", toward: "peeko" }
        ],
        lines: [
          { speaker: "peeko", key: "e02.turn-right.3" },
          { speaker: "momo", key: "e02.turn-right.4" }
        ],
        holdMs: 4600
      }
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "show", actor: "peeko" },
        { do: "song", song: "peekaboo" },
        { do: "move", actor: "peeko", to: "frontRight", style: "hop" },
        { do: "gesture", actor: "peeko", gesture: "dance", loop: true },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "object", target: "duck", action: "bounce" }
      ],
      reducedMotionStage: [
        { do: "show", actor: "peeko" },
        { do: "song", song: "peekaboo" },
        { do: "move", actor: "peeko", to: "frontRight", style: "walk" },
        { do: "gesture", actor: "peeko", gesture: "sway", loop: true },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true }
      ],
      lines: [],
      holdMs: 18000
    },
    {
      id: "hands",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "hide" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "hide" }
      ],
      lines: [{ speaker: "momo", key: "e02.hands.1" }],
      words: [{ wordId: "hands", objectId: "momo" }],
      holdMs: 4100,
      caregiverPromptKey: "e02.tip.3"
    },
    {
      id: "peek",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "momo", gesture: "peek" },
        { do: "gesture", actor: "peeko", gesture: "peek" }
      ],
      lines: [
        { speaker: "momo", key: "e02.peek.1" },
        { speaker: "peeko", key: "e02.peek.2" }
      ],
      words: [
        { wordId: "peekaboo", objectId: "momo" },
        { wordId: "hi", objectId: "peeko" }
      ],
      holdMs: 4600,
      caregiverPromptKey: "e02.tip.3"
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e02.outro.1" },
        { speaker: "peeko", key: "e02.outro.2" },
        { speaker: "momo", key: "e02.outro.3" },
        { speaker: "narrator", key: "e02.outro.4" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "peeko" }
      ],
      holdMs: 6600
    }
  ]
};
