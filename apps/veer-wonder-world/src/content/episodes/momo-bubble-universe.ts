// E15 — Momo's Bubble Universe (P2, PRD 05 E15, task H10). Host: Momo.
//
// Momo blows a big bubble from his wand; it floats out and a tiny friend
// appears inside it (each animal waits hidden on its bubble's spot and is
// shown once the clear bubble is there, so it is seen inside before the pop).
// The bubble pops softly, the tiny animal stays where the bubble was, and Momo
// names it and its sound. Exactly three bubbles, each with a different animal
// (duck, bird, cow), then "no more bubbles" and a finite ending: there is no
// endless tapping loop. The child can ask for more by
// tapping the wand (or Momo) and can pop the second and third bubble; each one
// also pops by itself when nobody taps. Bubbles are scene meshes (runtime
// particle effects stay off). This is a separate episode from the Bubble
// Garden activity (G01). Every tap target and speaker uses a spot that stays
// in view on narrow portrait screens.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "momo-bubble-universe",
  number: 15,
  version: 1,
  phase: "P2",
  titleKey: "e15.title",
  world: "meadow",
  host: "momo",
  cast: [{ id: "momo", at: "offLeft" }],
  props: [
    { id: "wand", asset: "bubbleWand", at: "offLeft", hidden: true, size: 0.5 },
    { id: "bubble-1", asset: "bubble", at: "offLeft", hidden: true, size: 0.9 },
    { id: "bubble-2", asset: "bubble", at: "offLeft", hidden: true, size: 0.9 },
    { id: "bubble-3", asset: "bubble", at: "offLeft", hidden: true, size: 0.9 },
    { id: "duck", asset: "duck", at: "center", hidden: true, size: 0.3 },
    { id: "bird", asset: "bird", at: "right", hidden: true, size: 0.25 },
    { id: "cow", asset: "cow", at: "frontRight", hidden: true, size: 0.35 }
  ],
  targetWords: ["bubble", "pop", "more"],
  supportWords: ["blow", "look", "duck", "quack", "bird", "tweet", "up", "cow", "moo", "again", "hi", "bye", "all-done"],
  music: "meadowBed",
  offlinePlayKey: "e15.offline",
  caregiverBridgeKey: "e15.bridge",
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
        { do: "enter", actor: "momo", at: "left", from: "offLeft", style: "walk" },
        { do: "show", actor: "wand" },
        { do: "carry", actor: "momo", item: "wand" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e15.greeting.1" },
        { speaker: "momo", key: "e15.greeting.2" }
      ],
      words: [
        { wordId: "hi", objectId: "momo" },
        { wordId: "look", objectId: "wand" }
      ],
      holdMs: 2000
    },
    {
      id: "blow-1",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "bubbleBlow" },
        { do: "enter", actor: "bubble-1", at: "center", from: "left", style: "float" },
        { do: "face", actor: "momo", toward: "bubble-1" }
      ],
      lines: [
        { speaker: "narrator", key: "e15.blow-1.1" },
        { speaker: "momo", key: "e15.blow-1.2" }
      ],
      words: [
        { wordId: "blow", objectId: "wand" },
        { wordId: "bubble", objectId: "bubble-1" }
      ],
      holdMs: 2500
    },
    {
      id: "inside-1",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "object", target: "bubble-1", action: "wobble" },
        { do: "show", actor: "duck" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "momo", key: "e15.inside-1.1" },
        { speaker: "narrator", key: "e15.inside-1.2" },
        { speaker: "momo", key: "e15.inside-1.3" }
      ],
      words: [
        { wordId: "look", objectId: "bubble-1" },
        { wordId: "bubble", objectId: "bubble-1" }
      ],
      holdMs: 2500
    },
    {
      id: "pop-1",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "bubble-1", action: "pop" },
        { do: "sfx", sound: "pop" },
        { do: "object", target: "duck", action: "bounce" }
      ],
      reducedMotionStage: [
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "bubble-1", action: "pop" },
        { do: "sfx", sound: "pop" },
        { do: "object", target: "duck", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e15.pop-1.1" },
        { speaker: "momo", key: "e15.pop-1.2" }
      ],
      words: [
        { wordId: "pop", objectId: "bubble-1" },
        { wordId: "duck", objectId: "duck" }
      ],
      holdMs: 2000
    },
    {
      id: "duck",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "quack" },
        { do: "object", target: "duck", action: "wobble" },
        { do: "face", actor: "momo", toward: "duck" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e15.duck.1" },
        { speaker: "narrator", key: "e15.duck.2" }
      ],
      words: [
        { wordId: "quack", objectId: "duck" },
        { wordId: "duck", objectId: "duck" }
      ],
      holdMs: 2000
    },
    {
      id: "duck-walk",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "move", actor: "duck", to: "frontLeft", style: "walk" },
        { do: "sfx", sound: "quack" },
        { do: "face", actor: "momo", toward: "duck" }
      ],
      lines: [
        { speaker: "narrator", key: "e15.duck-walk.1" },
        { speaker: "momo", key: "e15.duck-walk.2" }
      ],
      words: [{ wordId: "duck", objectId: "duck" }],
      holdMs: 2000
    },
    {
      id: "more-1",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [{ speaker: "momo", key: "e15.more-1.1" }],
      words: [{ wordId: "more", objectId: "wand" }],
      holdMs: 500,
      input: { type: "tap", targets: ["wand", "momo"] },
      waitMs: 5000,
      caregiverPromptKey: "e15.tip.1",
      response: {
        stage: [
          { do: "sfx", sound: "bubbleBlow" },
          { do: "enter", actor: "bubble-2", at: "right", from: "left", style: "float" },
          { do: "face", actor: "momo", toward: "bubble-2" },
          { do: "gesture", actor: "momo", gesture: "happy" }
        ],
        lines: [{ speaker: "momo", key: "e15.more-1.2" }],
        holdMs: 2500
      }
    },
    {
      id: "pop-2",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "object", target: "bubble-2", action: "wobble" },
        { do: "show", actor: "bird" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      lines: [
        { speaker: "narrator", key: "e15.pop-2.1" },
        { speaker: "momo", key: "e15.pop-2.2" }
      ],
      words: [
        { wordId: "look", objectId: "bubble-2" },
        { wordId: "pop", objectId: "bubble-2" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["bubble-2"] },
      waitMs: 5000,
      caregiverPromptKey: "e15.tip.2",
      response: {
        stage: [
          { do: "object", target: "bubble-2", action: "pop" },
          { do: "sfx", sound: "pop" },
          { do: "face", actor: "momo", toward: "bird" }
        ],
        lines: [{ speaker: "momo", key: "e15.pop-2.3" }],
        holdMs: 2500
      }
    },
    {
      id: "bird",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "tweet" },
        { do: "move", actor: "bird", to: "high", style: "fly" },
        { do: "face", actor: "momo", toward: "bird" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "tweet" },
        { do: "move", actor: "bird", to: "high", style: "float" },
        { do: "face", actor: "momo", toward: "bird" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "momo", key: "e15.bird.1" },
        { speaker: "narrator", key: "e15.bird.2" }
      ],
      words: [
        { wordId: "bird", objectId: "bird" },
        { wordId: "tweet", objectId: "bird" },
        { wordId: "up", objectId: "bird" }
      ],
      holdMs: 2000
    },
    {
      id: "more-2",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e15.more-2.1" },
        { speaker: "momo", key: "e15.more-2.2" }
      ],
      words: [
        { wordId: "more", objectId: "wand" },
        { wordId: "blow", objectId: "momo" }
      ],
      holdMs: 1500,
      caregiverPromptKey: "e15.tip.1"
    },
    {
      id: "blow-3",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "bubbleBlow" },
        { do: "enter", actor: "bubble-3", at: "frontRight", from: "left", style: "float" },
        { do: "face", actor: "momo", toward: "bubble-3" }
      ],
      lines: [{ speaker: "narrator", key: "e15.blow-3.1" }],
      words: [
        { wordId: "blow", objectId: "wand" },
        { wordId: "again", objectId: "wand" },
        { wordId: "bubble", objectId: "bubble-3" }
      ],
      holdMs: 2500
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "bubbleSong" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "dance", loop: true },
        { do: "object", target: "bubble-3", action: "wobble" },
        { do: "object", target: "duck", action: "bounce" },
        { do: "object", target: "bird", action: "wobble" }
      ],
      reducedMotionStage: [
        { do: "song", song: "bubbleSong" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true }
      ],
      lines: [],
      holdMs: 16500
    },
    {
      id: "pop-3",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "object", target: "bubble-3", action: "wobble" },
        { do: "show", actor: "cow" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      lines: [
        { speaker: "narrator", key: "e15.pop-3.1" },
        { speaker: "momo", key: "e15.pop-3.2" }
      ],
      words: [
        { wordId: "bubble", objectId: "bubble-3" },
        { wordId: "pop", objectId: "bubble-3" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["bubble-3"] },
      waitMs: 5000,
      caregiverPromptKey: "e15.tip.2",
      response: {
        stage: [
          { do: "object", target: "bubble-3", action: "pop" },
          { do: "sfx", sound: "pop" },
          { do: "face", actor: "momo", toward: "cow" }
        ],
        lines: [{ speaker: "momo", key: "e15.pop-3.3" }],
        holdMs: 2500
      }
    },
    {
      id: "cow",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "moo" },
        { do: "object", target: "cow", action: "bounce" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "moo" },
        { do: "object", target: "cow", action: "wobble" },
        { do: "gesture", actor: "momo", gesture: "nod" }
      ],
      lines: [
        { speaker: "momo", key: "e15.cow.1" },
        { speaker: "narrator", key: "e15.cow.2" },
        { speaker: "momo", key: "e15.cow.3" }
      ],
      words: [
        { wordId: "cow", objectId: "cow" },
        { wordId: "moo", objectId: "cow" }
      ],
      holdMs: 2000
    },
    {
      id: "all-popped",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "shrug" }
      ],
      lines: [{ speaker: "momo", key: "e15.all-popped.1" }],
      words: [{ wordId: "more", objectId: "wand" }],
      holdMs: 2000
    },
    {
      id: "pretend-pop",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "sfx", sound: "pop" }
      ],
      lines: [
        { speaker: "momo", key: "e15.pretend-pop.1" },
        { speaker: "momo", key: "e15.pretend-pop.2" }
      ],
      words: [{ wordId: "pop", objectId: "momo" }],
      holdMs: 1500,
      caregiverPromptKey: "e15.tip.2"
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "object", target: "duck", action: "wobble" },
        { do: "object", target: "cow", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e15.outro.1" },
        { speaker: "momo", key: "e15.outro.2" },
        { speaker: "momo", key: "e15.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "duck" }
      ],
      holdMs: 5000
    }
  ]
};
