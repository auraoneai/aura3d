// G01 — Bubble Garden (P1 activity, PRD 05 section 3, task G01). Momo hosts in
// Momo Meadow. In the intro Momo blows one first bubble that floats near him
// for the whole activity. Each round: a tap on the wand (or the wait running
// out) makes two more big, slow bubbles ("More bubbles!"), a tap on either one
// pops both softly ("Pop! Pop!"), and Momo asks "More bubbles?" with the first
// bubble still in view. No precision is needed and nothing is scored; every
// wait ends by itself. At most three rounds, then the first bubble pops, Momo
// says "All done!" and the offline card suggests real bubbles.
// Words: bubble, pop, more (core) with hi, look, big, blow, bye, all done.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "bubble-garden",
  number: 1,
  version: 1,
  phase: "P1",
  titleKey: "g01.title",
  world: "meadow",
  host: "momo",
  // Momo starts on his mark (a core spot, in view on every screen), so his
  // face and wave are visible while he says "Hi!". An entrance from offLeft
  // takes longer than the greeting line, which would play off-screen.
  cast: [{ id: "momo", at: "left" }],
  props: [
    { id: "wand", asset: "bubbleWand", at: "frontLeft", size: 0.6 },
    { id: "bubble1", asset: "bubble", at: "highLeft", hidden: true, tint: "#CDEBFF", size: 0.45 },
    { id: "bubble2", asset: "bubble", at: "center", hidden: true, tint: "#FFE0F2", size: 0.6 },
    { id: "bubble3", asset: "bubble", at: "right", hidden: true, tint: "#DDF7E3", size: 0.6 },
    { id: "flowerLeft", asset: "flower", at: "backLeft", size: 0.9 },
    { id: "flowerRight", asset: "flower", at: "backRight", size: 0.9 }
  ],
  targetWords: ["bubble", "pop", "more"],
  supportWords: ["hi", "look", "big", "blow", "bye", "all-done"],
  music: "meadowBed",
  offlinePlayKey: "g01.offline",
  caregiverBridgeKey: "g01.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  options: { allowTap: true, dragAlternative: "tap", microphoneRequired: false },
  roundLimit: 3,
  intro: [
    {
      id: "hello",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "meadowBed" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "g01.hello.1" },
        { speaker: "momo", key: "g01.hello.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 1500
    },
    {
      id: "first-bubble",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "gesture", actor: "momo", gesture: "pickUp" },
        { do: "carry", actor: "momo", item: "wand" },
        { do: "sfx", sound: "bubbleBlow" },
        { do: "enter", actor: "bubble1", at: "highLeft", from: "left", style: "float" },
        { do: "face", actor: "momo", toward: "bubble1" }
      ],
      lines: [
        { speaker: "momo", key: "g01.first-bubble.1" },
        { speaker: "narrator", key: "g01.first-bubble.2" }
      ],
      words: [
        { wordId: "look", objectId: "bubble1" },
        { wordId: "bubble", objectId: "bubble1" },
        { wordId: "big", objectId: "bubble1" }
      ],
      holdMs: 2000
    }
  ],
  round: [
    {
      id: "blow",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "object", target: "wand", action: "glow" }
      ],
      lines: [{ speaker: "momo", key: "g01.blow.1" }],
      words: [
        { wordId: "blow", objectId: "wand" },
        { wordId: "more", objectId: "wand" },
        { wordId: "bubble", objectId: "bubble1" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["wand"] },
      waitMs: 5000,
      caregiverPromptKey: "g01.tip.1",
      response: {
        stage: [
          { do: "sfx", sound: "bubbleBlow" },
          { do: "enter", actor: "bubble2", at: "center", from: "left", style: "float" },
          { do: "enter", actor: "bubble3", at: "right", from: "left", style: "float" },
          { do: "face", actor: "momo", toward: "bubble2" }
        ],
        lines: [
          { speaker: "momo", key: "g01.blow.2" },
          { speaker: "narrator", key: "g01.blow.3" }
        ],
        holdMs: 1500
      }
    },
    {
      id: "pop",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [{ speaker: "momo", key: "g01.pop.1" }],
      words: [{ wordId: "pop", objectId: "bubble2" }],
      holdMs: 800,
      input: { type: "tap", targets: ["bubble2", "bubble3"] },
      waitMs: 5000,
      caregiverPromptKey: "g01.tip.2",
      response: {
        stage: [
          { do: "object", target: "bubble2", action: "pop" },
          { do: "object", target: "bubble3", action: "pop" },
          { do: "sfx", sound: "pop" },
          { do: "gesture", actor: "momo", gesture: "happy" }
        ],
        lines: [
          { speaker: "momo", key: "g01.pop.2" },
          { speaker: "narrator", key: "g01.pop.3" }
        ],
        holdMs: 1200
      }
    },
    {
      id: "more",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "hide", actor: "bubble2" },
        { do: "hide", actor: "bubble3" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "object", target: "wand", action: "glow" },
        { do: "object", target: "bubble1", action: "wobble" }
      ],
      lines: [{ speaker: "momo", key: "g01.more.1" }],
      words: [
        { wordId: "more", objectId: "wand" },
        { wordId: "bubble", objectId: "bubble1" }
      ],
      holdMs: 800,
      input: { type: "more-or-done", targets: ["wand"] },
      waitMs: 5000,
      caregiverPromptKey: "g01.tip.3",
      response: {
        stage: [{ do: "gesture", actor: "momo", gesture: "nod" }],
        lines: [],
        holdMs: 500
      }
    }
  ],
  outro: [
    {
      id: "last-pop",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "bubble1" },
        { do: "object", target: "bubble1", action: "pop" },
        { do: "sfx", sound: "pop" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "g01.last-pop.1" },
        { speaker: "narrator", key: "g01.last-pop.2" }
      ],
      words: [
        { wordId: "pop", objectId: "bubble1" },
        { wordId: "bye", objectId: "bubble1" }
      ],
      holdMs: 1500
    },
    {
      id: "bye",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "hide", actor: "bubble1" },
        { do: "music", bed: null },
        { do: "carry", actor: "momo", item: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "g01.bye.1" },
        { speaker: "momo", key: "g01.bye.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "momo" }
      ],
      holdMs: 3000
    }
  ]
};
