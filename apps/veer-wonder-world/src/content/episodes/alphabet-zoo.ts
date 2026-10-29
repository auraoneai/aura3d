// E03 — The Alphabet Zoo (P2). Lumi and Peeko meet one letter: a big friendly
// B wiggles, the little zoo gate opens, and a ball and a bear come out. Once
// the B is named, a little b floats up beside it ("Big B, little b.": one
// clear uppercase and lowercase letter, PRD 05 section 1); both share the
// center spot, so they stand side by side, capital first. The letter name and
// the letter sound are always separate lines ("B. Bee." / "B says b-b-ball."),
// each spoken while its object is on screen. The child may tap the ball, then
// the bear, to make each one act; there is no letter quiz and every turn plays
// on its own. Song beats carry no lines so speech never overlaps the song.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "alphabet-zoo",
  number: 3,
  version: 1,
  phase: "P2",
  titleKey: "e03.title",
  world: "learning-cloud",
  host: "lumi",
  cast: [
    { id: "lumi", at: "offTop" },
    { id: "peeko", at: "offLeft" }
  ],
  props: [
    { id: "letter-b", asset: "letterB", at: "center", hidden: true, size: 0.9 },
    { id: "letter-b-lower", asset: "letterBLower", at: "center", hidden: true, size: 0.6 },
    { id: "gate", asset: "door", at: "backRight", size: 1.2 },
    { id: "ball", asset: "ball", at: "backRight", hidden: true, size: 0.45 },
    { id: "bear", asset: "teddy", at: "backRight", hidden: true, size: 0.6 }
  ],
  targetWords: ["b", "ball", "bear"],
  supportWords: ["hello", "hi", "look", "open", "roll", "all-done", "bye"],
  music: "cloudBed",
  offlinePlayKey: "e03.offline",
  caregiverBridgeKey: "e03.bridge",
  letterConcept: {
    letter: "B",
    letterNameKey: "e03.letter.2",
    phonemeCueKey: "e03.ball-sound.1",
    exampleWordKey: "e03.ball.1"
  },
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 136,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "cloudBed" },
        { do: "enter", actor: "lumi", at: "highLeft", from: "offTop", style: "float" },
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "enter", actor: "peeko", at: "frontLeft", from: "offLeft", style: "hop" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      reducedMotionStage: [
        { do: "music", bed: "cloudBed" },
        { do: "enter", actor: "lumi", at: "highLeft", from: "offTop", style: "float" },
        { do: "enter", actor: "peeko", at: "frontLeft", from: "offLeft", style: "walk" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "lumi", key: "e03.greet.1" },
        { speaker: "peeko", key: "e03.greet.2" }
      ],
      words: [
        { wordId: "hello", objectId: "lumi" },
        { wordId: "hi", objectId: "peeko" }
      ],
      holdMs: 3700
    },
    {
      id: "hook",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "show", actor: "letter-b" },
        { do: "object", target: "letter-b", action: "rise" },
        { do: "gesture", actor: "lumi", gesture: "point" },
        { do: "face", actor: "peeko", toward: "letter-b" }
      ],
      lines: [
        { speaker: "lumi", key: "e03.hook.1" },
        { speaker: "peeko", key: "e03.hook.2" }
      ],
      words: [{ wordId: "look", objectId: "letter-b" }],
      holdMs: 4200
    },
    {
      id: "gate",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "object", target: "letter-b", action: "wobble" },
        { do: "object", target: "gate", action: "open" },
        { do: "sfx", sound: "doorOpen" },
        { do: "face", actor: "peeko", toward: "gate" }
      ],
      lines: [
        { speaker: "narrator", key: "e03.gate.1" },
        { speaker: "peeko", key: "e03.gate.2" }
      ],
      words: [{ wordId: "open", objectId: "gate" }],
      holdMs: 4200
    },
    {
      id: "letter",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "object", target: "letter-b", action: "glow" },
        { do: "face", actor: "peeko", toward: "letter-b" }
      ],
      lines: [
        { speaker: "lumi", key: "e03.letter.1" },
        { speaker: "narrator", key: "e03.letter.2" },
        { speaker: "peeko", key: "e03.letter.3" }
      ],
      words: [{ wordId: "b", objectId: "letter-b" }],
      holdMs: 4200
    },
    {
      // The lowercase b floats up to stand beside the risen capital (both
      // `rise` to the same height). It is named with its capital, never quizzed.
      id: "little-b",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "show", actor: "letter-b-lower" },
        { do: "object", target: "letter-b-lower", action: "rise" },
        { do: "gesture", actor: "lumi", gesture: "point" },
        { do: "face", actor: "peeko", toward: "letter-b-lower" }
      ],
      lines: [
        { speaker: "lumi", key: "e03.little-b.1" },
        { speaker: "peeko", key: "e03.little-b.2" }
      ],
      words: [{ wordId: "b", objectId: "letter-b-lower" }],
      holdMs: 3700,
      caregiverPromptKey: "e03.tip.4"
    },
    {
      id: "ball",
      kind: "model",
      camera: "right",
      stage: [
        { do: "show", actor: "ball" },
        { do: "move", actor: "ball", to: "frontRight", style: "roll" },
        { do: "object", target: "ball", action: "roll" },
        { do: "face", actor: "peeko", toward: "ball" }
      ],
      lines: [
        { speaker: "narrator", key: "e03.ball.1" },
        { speaker: "peeko", key: "e03.ball.2" }
      ],
      words: [
        { wordId: "ball", objectId: "ball" },
        { wordId: "roll", objectId: "ball" }
      ],
      holdMs: 3700
    },
    {
      id: "ball-sound",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "point" },
        { do: "object", target: "letter-b", action: "glow" },
        { do: "object", target: "ball", action: "bounce" }
      ],
      lines: [
        { speaker: "lumi", key: "e03.ball-sound.1" },
        { speaker: "narrator", key: "e03.ball-sound.2" }
      ],
      words: [
        { wordId: "b", objectId: "letter-b" },
        { wordId: "ball", objectId: "ball" }
      ],
      holdMs: 4200
    },
    {
      id: "bear",
      kind: "model",
      camera: "right",
      stage: [
        { do: "show", actor: "bear" },
        { do: "move", actor: "bear", to: "right", style: "walk" },
        { do: "face", actor: "peeko", toward: "bear" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "narrator", key: "e03.bear.1" },
        { speaker: "peeko", key: "e03.bear.2" },
        { speaker: "lumi", key: "e03.bear.3" }
      ],
      words: [{ wordId: "bear", objectId: "bear" }],
      holdMs: 3700
    },
    {
      id: "bear-sound",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "point" },
        { do: "object", target: "letter-b", action: "glow" },
        { do: "object", target: "bear", action: "wobble" }
      ],
      lines: [
        { speaker: "lumi", key: "e03.bear-sound.1" },
        { speaker: "narrator", key: "e03.bear-sound.2" }
      ],
      words: [
        { wordId: "b", objectId: "letter-b" },
        { wordId: "bear", objectId: "bear" }
      ],
      holdMs: 4200
    },
    {
      id: "turn-ball",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "object", target: "ball", action: "glow" },
        { do: "gesture", actor: "peeko", gesture: "point" }
      ],
      lines: [{ speaker: "lumi", key: "e03.turn-ball.1" }],
      words: [{ wordId: "ball", objectId: "ball" }],
      holdMs: 3200,
      input: { type: "tap", targets: ["ball"] },
      waitMs: 5000,
      caregiverPromptKey: "e03.tip.1",
      response: {
        stage: [
          { do: "move", actor: "ball", to: "front", style: "roll" },
          { do: "object", target: "ball", action: "roll" },
          { do: "face", actor: "peeko", toward: "ball" },
          { do: "gesture", actor: "peeko", gesture: "happy" }
        ],
        lines: [
          { speaker: "narrator", key: "e03.turn-ball.2" },
          { speaker: "peeko", key: "e03.turn-ball.3" }
        ],
        holdMs: 4200
      }
    },
    {
      id: "turn-bear",
      kind: "repeat",
      camera: "medium",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "object", target: "bear", action: "glow" },
        { do: "face", actor: "peeko", toward: "bear" }
      ],
      lines: [{ speaker: "lumi", key: "e03.turn-bear.1" }],
      words: [{ wordId: "bear", objectId: "bear" }],
      holdMs: 3200,
      input: { type: "tap", targets: ["bear"] },
      waitMs: 5000,
      caregiverPromptKey: "e03.tip.2",
      response: {
        stage: [
          { do: "object", target: "bear", action: "bounce" },
          { do: "sfx", sound: "giggle" },
          { do: "gesture", actor: "peeko", gesture: "happy" }
        ],
        lines: [
          { speaker: "narrator", key: "e03.turn-bear.2" },
          { speaker: "peeko", key: "e03.turn-bear.3" }
        ],
        holdMs: 4200
      }
    },
    {
      // The letter song "abc" (src/content/songs.ts), written and recorded for
      // this episode: it names one letter, B, with the ball and the bear on
      // screen ("Here is B, big B, B for ball, B for bear"). It names the
      // letter only; the spoken lines model the sound. The glowing B is the one
      // focal action. The recording is 17.0 s; the 18 s hold covers it.
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "abc" },
        { do: "object", target: "letter-b", action: "glow" },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true },
        { do: "gesture", actor: "peeko", gesture: "dance", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "abc" },
        { do: "object", target: "letter-b", action: "glow" },
        { do: "gesture", actor: "peeko", gesture: "sway", loop: true }
      ],
      lines: [],
      holdMs: 18000
    },
    {
      id: "recap",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "point" },
        { do: "object", target: "letter-b", action: "glow" },
        { do: "object", target: "ball", action: "bounce" },
        { do: "object", target: "bear", action: "wobble" },
        { do: "face", actor: "peeko", toward: "viewer" }
      ],
      lines: [
        { speaker: "lumi", key: "e03.recap.1" },
        { speaker: "peeko", key: "e03.recap.2" }
      ],
      words: [
        { wordId: "ball", objectId: "ball" },
        { wordId: "bear", objectId: "bear" }
      ],
      holdMs: 4700,
      caregiverPromptKey: "e03.tip.3"
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "object", target: "gate", action: "close" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "wave" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "lumi", key: "e03.outro.1" },
        { speaker: "peeko", key: "e03.outro.2" },
        { speaker: "narrator", key: "e03.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "lumi" },
        { wordId: "bye", objectId: "peeko" }
      ],
      holdMs: 6200
    }
  ]
};
