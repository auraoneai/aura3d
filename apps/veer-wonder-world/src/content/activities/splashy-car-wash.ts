// G06 — Splashy Car Wash (P2 activity, PRD 05 section 3, task I03). Momo washes
// a friendly toy car by the sink in the Home Nook. Each round has three calm
// taps, one per step: the sink ("Splash! The car is wet."), the sponge or the
// car ("Wash, wash, wash!") and the towel or the car ("The car is dry."). Every
// wait ends by itself; the sponge and towel snap back into place on their own;
// one tap is one gentle wash, so there is no frantic scrubbing and nothing to
// win. Momo then asks "Wash again?". At most three rounds.
// Words: wash, wet, dry (core) with car, water, sponge, towel, beep, again, hi,
// bye, all done.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "splashy-car-wash",
  number: 6,
  version: 1,
  phase: "P2",
  titleKey: "g06.title",
  world: "home-nook",
  host: "momo",
  // Momo starts on his mark (a core spot, in view on every screen), so his
  // face and wave are visible while he says "Hi!". An entrance from offLeft
  // takes longer than the greeting line, which would play off-screen.
  cast: [{ id: "momo", at: "left" }],
  props: [
    { id: "car", asset: "car", at: "center", hidden: true, size: 0.6 },
    // Back right, clear of the car's drive in from offRight to center (moves
    // are straight lines; at "right" the car would drive through the sink).
    { id: "sink", asset: "sink", at: "backRight", size: 0.9 },
    // Fitted heights: the sponge is twice and the towel three times as wide as
    // tall (src/scenes/stand-ins.ts), so 0.2 m gives a 0.4 m sponge and a 0.6 m
    // towel that Momo can hold (at 0.3 the towel was wider than Momo and the
    // car). Tap areas do not depend on this: the stage inflates every target.
    // The towel lives at "front": Momo sets it down beside the car, and its
    // slide home to frontRight would cross the car.
    { id: "sponge", asset: "sponge", at: "frontLeft", size: 0.2 },
    { id: "towel", asset: "towel", at: "front", size: 0.2 }
  ],
  targetWords: ["wash", "wet", "dry"],
  supportWords: ["car", "water", "sponge", "towel", "beep", "again", "hi", "bye", "all-done"],
  music: "homeBed",
  offlinePlayKey: "g06.offline",
  caregiverBridgeKey: "g06.bridge",
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
        { do: "music", bed: "homeBed" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "g06.hello.1" },
        { speaker: "momo", key: "g06.hello.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 1000
    },
    {
      id: "car",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "enter", actor: "car", at: "center", from: "offRight", style: "drive" },
        { do: "sfx", sound: "beep" },
        { do: "face", actor: "momo", toward: "car" }
      ],
      lines: [
        { speaker: "narrator", key: "g06.car.1" },
        { speaker: "momo", key: "g06.car.2" }
      ],
      words: [
        { wordId: "car", objectId: "car" },
        { wordId: "wash", objectId: "car" }
      ],
      holdMs: 1500
    }
  ],
  round: [
    {
      id: "water",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "sink", action: "glow" }
      ],
      lines: [{ speaker: "momo", key: "g06.water.1" }],
      words: [
        { wordId: "water", objectId: "sink" },
        { wordId: "wet", objectId: "car" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["sink"] },
      waitMs: 5000,
      caregiverPromptKey: "g06.tip.1",
      response: {
        stage: [
          { do: "object", target: "sink", action: "open" },
          { do: "sfx", sound: "splash" },
          { do: "object", target: "car", action: "wobble" },
          { do: "face", actor: "momo", toward: "car" }
        ],
        lines: [
          { speaker: "narrator", key: "g06.water.2" },
          { speaker: "momo", key: "g06.water.3" }
        ],
        holdMs: 1200
      }
    },
    {
      id: "wash",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "object", target: "sink", action: "close" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "object", target: "sponge", action: "glow" }
      ],
      lines: [{ speaker: "momo", key: "g06.wash.1" }],
      words: [
        { wordId: "sponge", objectId: "sponge" },
        { wordId: "wash", objectId: "car" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["sponge", "car"] },
      waitMs: 5000,
      caregiverPromptKey: "g06.tip.2",
      response: {
        stage: [
          { do: "gesture", actor: "momo", gesture: "pickUp" },
          { do: "carry", actor: "momo", item: "sponge" },
          { do: "face", actor: "momo", toward: "car" },
          { do: "object", target: "car", action: "wash" },
          { do: "sfx", sound: "squeak" }
        ],
        lines: [
          { speaker: "momo", key: "g06.wash.2" },
          { speaker: "narrator", key: "g06.wash.3" }
        ],
        holdMs: 1200
      }
    },
    {
      id: "dry",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "carry", actor: "momo", item: null },
        { do: "move", actor: "sponge", to: "frontLeft", style: "slide" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "object", target: "towel", action: "glow" }
      ],
      lines: [{ speaker: "momo", key: "g06.dry.1" }],
      words: [
        { wordId: "towel", objectId: "towel" },
        { wordId: "dry", objectId: "car" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["towel", "car"] },
      waitMs: 5000,
      caregiverPromptKey: "g06.tip.2",
      response: {
        stage: [
          { do: "gesture", actor: "momo", gesture: "pickUp" },
          { do: "carry", actor: "momo", item: "towel" },
          { do: "face", actor: "momo", toward: "car" },
          { do: "object", target: "car", action: "dry" },
          { do: "sfx", sound: "rustle" }
        ],
        lines: [
          { speaker: "momo", key: "g06.dry.2" },
          { speaker: "narrator", key: "g06.dry.3" }
        ],
        holdMs: 1200
      }
    },
    {
      id: "more",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "carry", actor: "momo", item: null },
        { do: "move", actor: "towel", to: "front", style: "slide" },
        { do: "object", target: "car", action: "bounce" },
        { do: "sfx", sound: "beep" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      reducedMotionStage: [
        { do: "carry", actor: "momo", item: null },
        { do: "move", actor: "towel", to: "front", style: "slide" },
        { do: "object", target: "car", action: "glow" },
        { do: "sfx", sound: "beep" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      lines: [
        { speaker: "momo", key: "g06.more.1" },
        { speaker: "momo", key: "g06.more.2" }
      ],
      words: [
        { wordId: "beep", objectId: "car" },
        { wordId: "car", objectId: "car" },
        { wordId: "wash", objectId: "car" },
        { wordId: "again", objectId: "car" }
      ],
      holdMs: 800,
      input: { type: "more-or-done", targets: ["car"] },
      waitMs: 5000,
      caregiverPromptKey: "g06.tip.3",
      response: {
        stage: [{ do: "gesture", actor: "momo", gesture: "nod" }],
        lines: [],
        holdMs: 500
      }
    }
  ],
  outro: [
    {
      id: "shine",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "object", target: "car", action: "glow" },
        { do: "face", actor: "momo", toward: "car" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "g06.shine.1" },
        { speaker: "narrator", key: "g06.shine.2" }
      ],
      words: [
        { wordId: "dry", objectId: "car" },
        { wordId: "car", objectId: "car" }
      ],
      holdMs: 1500
    },
    {
      id: "bye",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "g06.bye.1" },
        { speaker: "momo", key: "g06.bye.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "car" }
      ],
      holdMs: 3000
    }
  ]
};
