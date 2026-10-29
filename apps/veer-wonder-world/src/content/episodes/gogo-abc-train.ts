// E04 — GoGo's ABC Train (P2). GoGo pulls into the station with one letter
// carriage. The big A glows, the carriage opens, and an apple rolls gently
// down to Lulu and Peeko. One featured letter only: the name ("A. Ay.") and
// the sound ("A says a-a-apple.") are separate lines, each spoken while its
// object is on screen. The child may tap the train for "go"; GoGo goes by
// itself when nobody taps, and the friends who speak during a departure stay
// on the platform. Song beats carry no lines so speech never overlaps the song.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "gogo-abc-train",
  number: 4,
  version: 1,
  phase: "P2",
  titleKey: "e04.title",
  world: "station",
  host: "gogo",
  cast: [
    { id: "gogo", at: "offLeft" },
    { id: "lulu", at: "frontLeft" },
    { id: "peeko", at: "frontRight" }
  ],
  props: [
    { id: "carriage", asset: "gogoCarriage", at: "offLeft", size: 0.7 },
    { id: "letter-a", asset: "letterA", at: "highLeft", hidden: true, size: 0.7 },
    { id: "apple", asset: "apple", at: "left", hidden: true, size: 0.35 },
    { id: "tunnel", asset: "tunnel", at: "farRight", size: 1.8 }
  ],
  targetWords: ["a", "apple", "go"],
  supportWords: ["hi", "train", "look", "open", "roll", "stop", "in", "again", "all-done", "bye"],
  music: "stationBed",
  offlinePlayKey: "e04.offline",
  caregiverBridgeKey: "e04.bridge",
  letterConcept: {
    letter: "A",
    letterNameKey: "e04.letter.2",
    phonemeCueKey: "e04.a-sound.1",
    exampleWordKey: "e04.open.2"
  },
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
        { do: "music", bed: "stationBed" },
        { do: "sfx", sound: "chugga" },
        { do: "enter", actor: "gogo", at: "center", from: "offLeft", style: "drive" },
        { do: "enter", actor: "carriage", at: "left", from: "offLeft", style: "drive" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "gogo", key: "e04.greet.1" },
        { speaker: "peeko", key: "e04.greet.2" }
      ],
      words: [
        { wordId: "hi", objectId: "gogo" },
        { wordId: "train", objectId: "gogo" }
      ],
      holdMs: 3900
    },
    {
      id: "hook",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "object", target: "gogo", action: "stop" },
        { do: "show", actor: "letter-a" },
        { do: "object", target: "letter-a", action: "glow" },
        { do: "object", target: "carriage", action: "glow" },
        { do: "face", actor: "lulu", toward: "carriage" },
        { do: "face", actor: "peeko", toward: "carriage" }
      ],
      lines: [
        { speaker: "gogo", key: "e04.hook.1" },
        { speaker: "lulu", key: "e04.hook.2" }
      ],
      words: [{ wordId: "look", objectId: "carriage" }],
      holdMs: 4400
    },
    {
      id: "letter",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "object", target: "letter-a", action: "glow" },
        { do: "gesture", actor: "gogo", gesture: "nod" },
        { do: "face", actor: "peeko", toward: "letter-a" }
      ],
      lines: [
        { speaker: "gogo", key: "e04.letter.1" },
        { speaker: "narrator", key: "e04.letter.2" },
        { speaker: "peeko", key: "e04.letter.3" }
      ],
      words: [{ wordId: "a", objectId: "letter-a" }],
      holdMs: 4400
    },
    {
      id: "open",
      kind: "model",
      camera: "left",
      stage: [
        { do: "object", target: "carriage", action: "open" },
        { do: "sfx", sound: "sparkle" },
        { do: "show", actor: "apple" },
        { do: "object", target: "apple", action: "bounce" }
      ],
      lines: [
        { speaker: "narrator", key: "e04.open.1" },
        { speaker: "gogo", key: "e04.open.2" }
      ],
      words: [
        { wordId: "open", objectId: "carriage" },
        { wordId: "apple", objectId: "apple" }
      ],
      holdMs: 4400
    },
    {
      id: "roll",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "move", actor: "apple", to: "front", style: "roll" },
        { do: "object", target: "apple", action: "roll" },
        { do: "face", actor: "lulu", toward: "apple" },
        { do: "face", actor: "peeko", toward: "apple" }
      ],
      lines: [
        { speaker: "narrator", key: "e04.roll.1" },
        { speaker: "peeko", key: "e04.roll.2" },
        { speaker: "lulu", key: "e04.roll.3" }
      ],
      words: [
        { wordId: "apple", objectId: "apple" },
        { wordId: "roll", objectId: "apple" }
      ],
      holdMs: 3900
    },
    {
      id: "a-sound",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "object", target: "letter-a", action: "glow" },
        { do: "object", target: "apple", action: "bounce" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [
        { speaker: "gogo", key: "e04.a-sound.1" },
        { speaker: "narrator", key: "e04.a-sound.2" }
      ],
      words: [
        { wordId: "a", objectId: "letter-a" },
        { wordId: "apple", objectId: "apple" }
      ],
      holdMs: 4400
    },
    {
      id: "invite",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "gogo", toward: "viewer" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [
        { speaker: "gogo", key: "e04.invite.1" },
        { speaker: "lulu", key: "e04.invite.2" }
      ],
      words: [{ wordId: "go", objectId: "gogo" }],
      holdMs: 3400,
      input: { type: "tap", targets: ["gogo", "carriage"] },
      waitMs: 5000,
      caregiverPromptKey: "e04.tip.1",
      response: {
        stage: [
          { do: "object", target: "gogo", action: "go" },
          { do: "sfx", sound: "chugga" },
          { do: "exit", actor: "gogo", to: "offRight", style: "drive" },
          { do: "exit", actor: "carriage", to: "offRight", style: "drive" },
          { do: "exit", actor: "letter-a", to: "offRight", style: "drive" },
          { do: "gesture", actor: "lulu", gesture: "wave" }
        ],
        lines: [
          { speaker: "lulu", key: "e04.invite.3" },
          { speaker: "narrator", key: "e04.invite.4" }
        ],
        holdMs: 4400
      }
    },
    {
      id: "back",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "enter", actor: "gogo", at: "center", from: "offLeft", style: "drive" },
        { do: "enter", actor: "carriage", at: "left", from: "offLeft", style: "drive" },
        { do: "enter", actor: "letter-a", at: "highLeft", from: "offLeft", style: "drive" },
        { do: "object", target: "gogo", action: "stop" },
        { do: "sfx", sound: "whistle" }
      ],
      lines: [
        { speaker: "narrator", key: "e04.back.1" },
        { speaker: "gogo", key: "e04.back.2" }
      ],
      words: [{ wordId: "stop", objectId: "gogo" }],
      holdMs: 3900
    },
    {
      id: "ask",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "face", actor: "peeko", toward: "gogo" },
        { do: "face", actor: "gogo", toward: "peeko" }
      ],
      lines: [
        { speaker: "peeko", key: "e04.ask.1" },
        { speaker: "gogo", key: "e04.ask.2" }
      ],
      holdMs: 2900
    },
    {
      id: "hop-in",
      kind: "event",
      camera: "left",
      stage: [{ do: "move", actor: "peeko", to: "left", style: "hop" }],
      reducedMotionStage: [{ do: "move", actor: "peeko", to: "left", style: "walk" }],
      lines: [{ speaker: "narrator", key: "e04.hop-in.1" }],
      words: [{ wordId: "in", objectId: "carriage" }],
      holdMs: 3900
    },
    {
      id: "again",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "face", actor: "gogo", toward: "viewer" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [
        { speaker: "lulu", key: "e04.again.1" },
        { speaker: "gogo", key: "e04.again.2" }
      ],
      words: [
        { wordId: "again", objectId: "gogo" },
        { wordId: "go", objectId: "gogo" }
      ],
      holdMs: 3400,
      input: { type: "tap", targets: ["gogo", "carriage"] },
      waitMs: 5000,
      caregiverPromptKey: "e04.tip.2",
      response: {
        stage: [
          { do: "object", target: "gogo", action: "go" },
          { do: "sfx", sound: "chugga" },
          { do: "exit", actor: "gogo", to: "offRight", style: "drive" },
          { do: "exit", actor: "carriage", to: "offRight", style: "drive" },
          { do: "exit", actor: "letter-a", to: "offRight", style: "drive" },
          { do: "exit", actor: "peeko", to: "offRight", style: "drive" },
          { do: "gesture", actor: "lulu", gesture: "wave" }
        ],
        lines: [
          { speaker: "lulu", key: "e04.again.3" },
          { speaker: "narrator", key: "e04.again.4" }
        ],
        holdMs: 4400
      }
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "trainSong" },
        { do: "enter", actor: "gogo", at: "center", from: "offLeft", style: "drive" },
        { do: "enter", actor: "carriage", at: "left", from: "offLeft", style: "drive" },
        { do: "enter", actor: "letter-a", at: "highLeft", from: "offLeft", style: "drive" },
        { do: "enter", actor: "peeko", at: "left", from: "offLeft", style: "drive" },
        { do: "gesture", actor: "lulu", gesture: "dance", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "trainSong" },
        { do: "enter", actor: "gogo", at: "center", from: "offLeft", style: "drive" },
        { do: "enter", actor: "carriage", at: "left", from: "offLeft", style: "drive" },
        { do: "enter", actor: "letter-a", at: "highLeft", from: "offLeft", style: "drive" },
        { do: "enter", actor: "peeko", at: "left", from: "offLeft", style: "drive" },
        { do: "gesture", actor: "lulu", gesture: "sway", loop: true }
      ],
      lines: [],
      holdMs: 18000
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "object", target: "gogo", action: "stop" },
        { do: "face", actor: "gogo", toward: "viewer" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "gesture", actor: "lulu", gesture: "wave" }
      ],
      lines: [
        { speaker: "gogo", key: "e04.outro.1" },
        { speaker: "peeko", key: "e04.outro.2" },
        { speaker: "lulu", key: "e04.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "gogo" },
        { wordId: "bye", objectId: "gogo" }
      ],
      holdMs: 6400
    }
  ]
};
