// E11 — Number Balloon Rescue (P2, PRD 05 E11, task H06). Hosts: Lulu + Lumi.
//
// Lulu shows her balloons one at a time (one, two, three), a breeze floats
// them up into the sky, Lulu hops (too high) and calls Lumi, and the balloons
// come back down one at a time. The child can tap the second and third
// balloon to bring it down; each one also comes down by itself when nobody
// taps. Counting is strictly one-to-one in both passes: every spoken number
// has its own line while exactly that many balloons are visible (the balloons
// leave the frame before the rescue count starts). Lumi waits up high and each
// returning balloon appears beside her, so the balloon the child taps stays in
// view on narrow portrait screens. The balloons land on back, right and front,
// spots that never overlap on screen from the fixed camera, so every counted
// balloon reads as its own object (a balloon at center would hide behind the
// front one). Up/down are modelled with the balloons and with Lulu's hop and
// bow. Nothing listens to or scores speech; silence always completes the story.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "number-balloon-rescue",
  number: 11,
  version: 1,
  phase: "P2",
  titleKey: "e11.title",
  world: "meadow",
  host: "lulu",
  cast: [
    { id: "lulu", at: "offLeft" },
    { id: "lumi", at: "offTop" }
  ],
  props: [
    { id: "balloon-1", asset: "balloon", at: "back", hidden: true, size: 0.6 },
    { id: "balloon-2", asset: "balloon", at: "right", hidden: true, size: 0.6 },
    { id: "balloon-3", asset: "balloon", at: "front", hidden: true, size: 0.6 }
  ],
  targetWords: ["one", "two", "three", "down"],
  supportWords: ["up", "balloon", "help", "uh-oh", "look", "thank-you", "hi", "hello", "bye", "all-done"],
  music: "meadowBed",
  offlinePlayKey: "e11.offline",
  caregiverBridgeKey: "e11.bridge",
  numberConcept: { countMin: 1, countMax: 3, countedObjectIds: ["balloon-1", "balloon-2", "balloon-3"] },
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 140,
  beats: [
    {
      id: "greeting",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "meadowBed" },
        { do: "enter", actor: "lulu", at: "left", from: "offLeft", style: "walk" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" }
      ],
      lines: [
        { speaker: "lulu", key: "e11.greeting.1" },
        { speaker: "lulu", key: "e11.greeting.2" }
      ],
      words: [{ wordId: "hi", objectId: "lulu" }],
      holdMs: 2500
    },
    {
      id: "balloon-one",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "show", actor: "balloon-1" },
        { do: "object", target: "balloon-1", action: "wobble" },
        { do: "sfx", sound: "boing" },
        { do: "face", actor: "lulu", toward: "balloon-1" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [{ speaker: "lulu", key: "e11.balloon-one.1" }],
      words: [
        { wordId: "balloon", objectId: "balloon-1" },
        { wordId: "one", objectId: "balloon-1" }
      ],
      holdMs: 2500,
      caregiverPromptKey: "e11.tip.2"
    },
    {
      id: "balloon-two",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "show", actor: "balloon-2" },
        { do: "object", target: "balloon-2", action: "wobble" },
        { do: "sfx", sound: "boing" },
        { do: "face", actor: "lulu", toward: "balloon-2" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [{ speaker: "lulu", key: "e11.balloon-two.1" }],
      words: [{ wordId: "two", objectId: "balloon-2" }],
      holdMs: 2500,
      caregiverPromptKey: "e11.tip.2"
    },
    {
      id: "balloon-three",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "show", actor: "balloon-3" },
        { do: "object", target: "balloon-3", action: "wobble" },
        { do: "sfx", sound: "boing" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "happy" }
      ],
      lines: [{ speaker: "lulu", key: "e11.balloon-three.1" }],
      words: [{ wordId: "three", objectId: "balloon-3" }],
      holdMs: 3000,
      caregiverPromptKey: "e11.tip.2"
    },
    {
      id: "breeze",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "whoosh" },
        { do: "move", actor: "balloon-1", to: "high", style: "float" },
        { do: "move", actor: "balloon-2", to: "highRight", style: "float" },
        { do: "move", actor: "balloon-3", to: "highLeft", style: "float" },
        { do: "face", actor: "lulu", toward: "balloon-2" },
        { do: "gesture", actor: "lulu", gesture: "look" }
      ],
      lines: [
        { speaker: "narrator", key: "e11.breeze.1" },
        { speaker: "narrator", key: "e11.breeze.2" },
        { speaker: "lulu", key: "e11.breeze.3" }
      ],
      words: [{ wordId: "up", objectId: "balloon-2" }],
      holdMs: 2000
    },
    {
      id: "float-away",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "exit", actor: "balloon-1", to: "offTop", style: "float" },
        { do: "exit", actor: "balloon-2", to: "offTop", style: "float" },
        { do: "exit", actor: "balloon-3", to: "offTop", style: "float" },
        { do: "gesture", actor: "lulu", gesture: "look" }
      ],
      lines: [
        { speaker: "lulu", key: "e11.float-away.1" },
        { speaker: "narrator", key: "e11.float-away.2" }
      ],
      words: [{ wordId: "uh-oh", objectId: "lulu" }],
      holdMs: 2500
    },
    {
      id: "hop",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "hop" },
        { do: "sfx", sound: "boing" }
      ],
      reducedMotionStage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [
        { speaker: "lulu", key: "e11.hop.1" },
        { speaker: "lulu", key: "e11.hop.2" }
      ],
      words: [{ wordId: "up", objectId: "lulu" }],
      holdMs: 2000
    },
    {
      id: "call-lumi",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "enter", actor: "lumi", at: "high", from: "offTop", style: "float" },
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "sfx", sound: "sparkle" }
      ],
      lines: [
        { speaker: "lulu", key: "e11.call-lumi.1" },
        { speaker: "lumi", key: "e11.call-lumi.2" }
      ],
      words: [
        { wordId: "help", objectId: "lumi" },
        { wordId: "hello", objectId: "lumi" }
      ],
      holdMs: 2000
    },
    {
      id: "count-one",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "sfx", sound: "sparkle" },
        { do: "enter", actor: "balloon-1", at: "back", from: "offTop", style: "float" },
        { do: "face", actor: "lulu", toward: "balloon-1" }
      ],
      lines: [
        { speaker: "lumi", key: "e11.count-one.1" },
        { speaker: "narrator", key: "e11.count-one.2" },
        { speaker: "lulu", key: "e11.count-one.3" }
      ],
      words: [
        { wordId: "down", objectId: "balloon-1" },
        { wordId: "one", objectId: "balloon-1" }
      ],
      holdMs: 3000,
      caregiverPromptKey: "e11.tip.2"
    },
    {
      id: "turn-two",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "enter", actor: "balloon-2", at: "high", from: "offTop", style: "float" },
        { do: "gesture", actor: "lumi", gesture: "point" },
        { do: "face", actor: "lulu", toward: "viewer" }
      ],
      lines: [
        { speaker: "lulu", key: "e11.turn-two.1" },
        { speaker: "lumi", key: "e11.turn-two.2" }
      ],
      words: [
        { wordId: "look", objectId: "balloon-2" },
        { wordId: "up", objectId: "balloon-2" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["balloon-2"] },
      waitMs: 5000,
      caregiverPromptKey: "e11.tip.1",
      response: {
        stage: [
          { do: "move", actor: "balloon-2", to: "right", style: "float" },
          { do: "face", actor: "lulu", toward: "balloon-2" },
          { do: "gesture", actor: "lulu", gesture: "happy" }
        ],
        lines: [{ speaker: "narrator", key: "e11.turn-two.3" }],
        holdMs: 2200
      }
    },
    {
      id: "count-two",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "object", target: "balloon-2", action: "wobble" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [{ speaker: "lulu", key: "e11.count-two.1" }],
      words: [
        { wordId: "two", objectId: "balloon-2" },
        { wordId: "down", objectId: "balloon-2" }
      ],
      holdMs: 3000,
      caregiverPromptKey: "e11.tip.2"
    },
    {
      id: "turn-three",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "enter", actor: "balloon-3", at: "high", from: "offTop", style: "float" },
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [
        { speaker: "lulu", key: "e11.turn-three.1" },
        { speaker: "lumi", key: "e11.turn-three.2" }
      ],
      words: [{ wordId: "balloon", objectId: "balloon-3" }],
      holdMs: 500,
      input: { type: "tap", targets: ["balloon-3"] },
      waitMs: 5000,
      caregiverPromptKey: "e11.tip.1",
      response: {
        stage: [
          { do: "move", actor: "balloon-3", to: "front", style: "float" },
          { do: "sfx", sound: "ding" },
          { do: "face", actor: "lulu", toward: "balloon-3" },
          { do: "gesture", actor: "lulu", gesture: "happy" }
        ],
        lines: [{ speaker: "narrator", key: "e11.turn-three.3" }],
        holdMs: 2200
      }
    },
    {
      id: "count-three",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "object", target: "balloon-3", action: "wobble" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "happy" }
      ],
      lines: [{ speaker: "lulu", key: "e11.count-three.1" }],
      words: [
        { wordId: "three", objectId: "balloon-3" },
        { wordId: "down", objectId: "balloon-3" }
      ],
      holdMs: 3000,
      caregiverPromptKey: "e11.tip.2"
    },
    {
      id: "all-down",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "object", target: "balloon-1", action: "wobble" },
        { do: "object", target: "balloon-2", action: "wobble" },
        { do: "object", target: "balloon-3", action: "wobble" },
        { do: "face", actor: "lulu", toward: "lumi" },
        { do: "gesture", actor: "lulu", gesture: "happy" }
      ],
      lines: [
        { speaker: "lumi", key: "e11.all-down.1" },
        { speaker: "lulu", key: "e11.all-down.2" },
        { speaker: "lumi", key: "e11.all-down.3" },
        { speaker: "lulu", key: "e11.all-down.4" }
      ],
      words: [
        { wordId: "down", objectId: "balloon-2" },
        { wordId: "thank-you", objectId: "lulu" }
      ],
      holdMs: 2000
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "countToThree" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "dance", loop: true },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true },
        { do: "object", target: "balloon-1", action: "bounce" },
        { do: "object", target: "balloon-2", action: "bounce" },
        { do: "object", target: "balloon-3", action: "bounce" }
      ],
      reducedMotionStage: [
        { do: "song", song: "countToThree" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "sway", loop: true },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true }
      ],
      lines: [],
      holdMs: 16500
    },
    {
      id: "up-again",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "object", target: "balloon-1", action: "up" },
        { do: "object", target: "balloon-2", action: "up" },
        { do: "object", target: "balloon-3", action: "up" },
        { do: "gesture", actor: "lulu", gesture: "hop" }
      ],
      reducedMotionStage: [
        { do: "object", target: "balloon-1", action: "up" },
        { do: "object", target: "balloon-2", action: "up" },
        { do: "object", target: "balloon-3", action: "up" },
        { do: "gesture", actor: "lulu", gesture: "nod" }
      ],
      lines: [{ speaker: "lulu", key: "e11.up-again.1" }],
      words: [{ wordId: "up", objectId: "balloon-2" }],
      holdMs: 2000,
      caregiverPromptKey: "e11.tip.3"
    },
    {
      id: "down-again",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "object", target: "balloon-1", action: "down" },
        { do: "object", target: "balloon-2", action: "down" },
        { do: "object", target: "balloon-3", action: "down" },
        { do: "gesture", actor: "lulu", gesture: "bow" }
      ],
      lines: [
        { speaker: "lulu", key: "e11.down-again.1" },
        { speaker: "narrator", key: "e11.down-again.2" }
      ],
      words: [{ wordId: "down", objectId: "balloon-2" }],
      holdMs: 2500,
      caregiverPromptKey: "e11.tip.3"
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "gesture", actor: "lumi", gesture: "wave" }
      ],
      lines: [
        { speaker: "lulu", key: "e11.outro.1" },
        { speaker: "lulu", key: "e11.outro.2" },
        { speaker: "lumi", key: "e11.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "lulu" },
        { wordId: "bye", objectId: "balloon-2" }
      ],
      holdMs: 5000
    }
  ]
};
