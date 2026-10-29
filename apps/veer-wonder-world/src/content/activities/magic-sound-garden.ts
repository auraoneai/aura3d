// G11 — Magic Sound Garden (P2 activity, tap version; PRD 05 section 3, task
// I08). Momo says hello to two closed flower buds in the meadow; a tap (or a
// short wait) makes each one open with its own soft, fun sound: a "boing" and
// a "pop". Words: hello, open, flower. No animal sounds here: a flower that
// tweets would pair a bird's sound with the wrong source (PRD 01 section 4.1).
//
// Tap only. This activity never listens: no microphone, no sound detection and
// no speech recognition (the optional sound-presence version is P3 and stays
// off). A sound the child makes is welcome but never measured or required.
//
// Opening is a model swap: the bud hides and the open flower shows (with a
// bloom) at the same spot. The first round beat closes both flowers again so
// every round starts with two buds; the outro closes them for the night.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "magic-sound-garden",
  number: 11,
  version: 1,
  phase: "P2",
  titleKey: "g11.title",
  world: "meadow",
  host: "momo",
  cast: [{ id: "momo", at: "offLeft" }],
  props: [
    { id: "bud-1", asset: "flowerBud", at: "left", size: 0.8 },
    { id: "flower-1", asset: "flower", at: "left", hidden: true, size: 0.9 },
    { id: "bud-2", asset: "flowerBud", at: "right", tint: "#C9A7F2", size: 0.8 },
    { id: "flower-2", asset: "flower", at: "right", hidden: true, tint: "#C9A7F2", size: 0.9 }
  ],
  targetWords: ["hello", "open", "flower"],
  supportWords: ["hi", "look", "close", "pop", "again", "bye", "all-done"],
  music: "meadowBed",
  offlinePlayKey: "g11.offline",
  caregiverBridgeKey: "g11.bridge",
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
        { do: "enter", actor: "momo", at: "center", from: "offLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "g11.hello.1" },
        { speaker: "momo", key: "g11.hello.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 1200
    },
    {
      id: "garden",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "object", target: "bud-1", action: "wobble" },
        { do: "object", target: "bud-2", action: "wobble" },
        { do: "sfx", sound: "sparkle" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "momo", key: "g11.garden.1" },
        { speaker: "narrator", key: "g11.garden.2" }
      ],
      words: [
        { wordId: "look", objectId: "bud-1" },
        { wordId: "flower", objectId: "bud-2" },
        { wordId: "close", objectId: "bud-1" }
      ],
      holdMs: 1200
    }
  ],
  round: [
    {
      id: "hello-one",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "hide", actor: "flower-1" },
        { do: "hide", actor: "flower-2" },
        { do: "show", actor: "bud-1" },
        { do: "show", actor: "bud-2" },
        { do: "face", actor: "momo", toward: "bud-1" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "bud-1", action: "wobble" }
      ],
      lines: [{ speaker: "momo", key: "g11.hello-one.1" }],
      words: [
        { wordId: "hello", objectId: "bud-1" },
        { wordId: "flower", objectId: "bud-1" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["bud-1"] },
      waitMs: 5000,
      caregiverPromptKey: "g11.tip.1",
      response: {
        stage: [
          { do: "object", target: "bud-1", action: "wobble" },
          { do: "sfx", sound: "rustle" }
        ],
        lines: [],
        holdMs: 600
      }
    },
    {
      id: "open-one",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "hide", actor: "bud-1" },
        { do: "show", actor: "flower-1" },
        { do: "object", target: "flower-1", action: "bloom" },
        { do: "sfx", sound: "boing" },
        { do: "face", actor: "momo", toward: "flower-1" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "g11.open-one.1" },
        { speaker: "narrator", key: "g11.open-one.2" }
      ],
      words: [
        { wordId: "open", objectId: "flower-1" },
        { wordId: "flower", objectId: "flower-1" }
      ],
      holdMs: 1200
    },
    {
      id: "hello-two",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "bud-2" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "bud-2", action: "wobble" }
      ],
      lines: [{ speaker: "momo", key: "g11.hello-two.1" }],
      words: [
        { wordId: "hello", objectId: "bud-2" },
        { wordId: "flower", objectId: "bud-2" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["bud-2"] },
      waitMs: 5000,
      caregiverPromptKey: "g11.tip.1",
      response: {
        stage: [
          { do: "object", target: "bud-2", action: "wobble" },
          { do: "sfx", sound: "rustle" }
        ],
        lines: [],
        holdMs: 600
      }
    },
    {
      id: "open-two",
      kind: "repeat",
      camera: "medium",
      stage: [
        { do: "hide", actor: "bud-2" },
        { do: "show", actor: "flower-2" },
        { do: "object", target: "flower-2", action: "bloom" },
        { do: "sfx", sound: "pop" },
        { do: "object", target: "flower-1", action: "wobble" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "cheer" }
      ],
      reducedMotionStage: [
        { do: "hide", actor: "bud-2" },
        { do: "show", actor: "flower-2" },
        { do: "object", target: "flower-2", action: "bloom" },
        { do: "sfx", sound: "pop" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "g11.open-two.1" },
        { speaker: "momo", key: "g11.open-two.2" },
        { speaker: "momo", key: "g11.open-two.3" }
      ],
      words: [
        { wordId: "pop", objectId: "flower-2" },
        { wordId: "open", objectId: "flower-2" },
        { wordId: "hello", objectId: "flower-2" },
        { wordId: "flower", objectId: "flower-2" },
        { wordId: "again", objectId: "momo" }
      ],
      holdMs: 600,
      input: { type: "more-or-done", targets: ["flower-1", "flower-2"] },
      waitMs: 5000,
      caregiverPromptKey: "g11.tip.2",
      response: {
        stage: [{ do: "gesture", actor: "momo", gesture: "nod" }],
        lines: [],
        holdMs: 600
      }
    }
  ],
  outro: [
    {
      id: "hands",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "happy" },
        { do: "object", target: "flower-1", action: "wobble" },
        { do: "object", target: "flower-2", action: "wobble" }
      ],
      lines: [{ speaker: "momo", key: "g11.hands.1" }],
      holdMs: 1500
    },
    {
      id: "all-done",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "hide", actor: "flower-1" },
        { do: "hide", actor: "flower-2" },
        { do: "show", actor: "bud-1" },
        { do: "show", actor: "bud-2" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "narrator", key: "g11.all-done.1" },
        { speaker: "momo", key: "g11.all-done.2" },
        { speaker: "momo", key: "g11.all-done.3" }
      ],
      words: [
        { wordId: "close", objectId: "bud-1" },
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "bud-2" }
      ],
      holdMs: 2500
    }
  ]
};
