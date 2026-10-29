// G10 — Bear's Little Band (P2 activity, PRD 05 section 3, task I07). Lulu
// leads a tiny band in the Music Garden with Bear (a teddy prop that never
// speaks). Each round is one gentle turn each: "Your turn!" (tap the drum,
// boom), Bear's turn (his shaker answers) and Lulu's turn ("My turn! Clap,
// clap!"). Words: my turn, your turn, boom, clap.
//
// No cacophony: only one instrument sounds per beat, a turn takes one tap (the
// director ignores further taps until the next turn), and there is no music
// bed under the band so every sound stays soft and separate.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "bears-little-band",
  number: 10,
  version: 1,
  phase: "P2",
  titleKey: "g10.title",
  world: "music-garden",
  host: "lulu",
  cast: [{ id: "lulu", at: "offLeft" }],
  props: [
    { id: "drum", asset: "drum", at: "center", size: 0.7 },
    { id: "bear", asset: "teddy", at: "right", size: 0.6 },
    { id: "shaker", asset: "shaker", at: "frontRight", size: 0.35 }
  ],
  targetWords: ["my-turn", "your-turn", "boom"],
  supportWords: ["clap", "drum", "bear", "more", "look", "hi", "bye", "all-done"],
  offlinePlayKey: "g10.offline",
  caregiverBridgeKey: "g10.bridge",
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
        { do: "enter", actor: "lulu", at: "left", from: "offLeft", style: "walk" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "object", target: "bear", action: "wobble" }
      ],
      lines: [
        { speaker: "lulu", key: "g10.hello.1" },
        { speaker: "lulu", key: "g10.hello.2" }
      ],
      words: [
        { wordId: "hi", objectId: "lulu" },
        { wordId: "bear", objectId: "bear" }
      ],
      holdMs: 1200
    },
    {
      id: "drum",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "drum" },
        { do: "gesture", actor: "lulu", gesture: "point" },
        { do: "object", target: "drum", action: "bounce" },
        { do: "sfx", sound: "drum" }
      ],
      reducedMotionStage: [
        { do: "face", actor: "lulu", toward: "drum" },
        { do: "gesture", actor: "lulu", gesture: "point" },
        { do: "object", target: "drum", action: "wobble" },
        { do: "sfx", sound: "drum" }
      ],
      lines: [
        { speaker: "lulu", key: "g10.drum.1" },
        { speaker: "lulu", key: "g10.drum.2" }
      ],
      words: [
        { wordId: "look", objectId: "drum" },
        { wordId: "drum", objectId: "drum" },
        { wordId: "boom", objectId: "drum" }
      ],
      holdMs: 1200
    }
  ],
  round: [
    {
      id: "your-turn",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "point" },
        { do: "object", target: "drum", action: "glow" }
      ],
      lines: [{ speaker: "lulu", key: "g10.your-turn.1" }],
      holdMs: 800,
      input: { type: "tap", targets: ["drum"] },
      waitMs: 5000,
      caregiverPromptKey: "g10.tip.1",
      response: {
        stage: [
          { do: "object", target: "drum", action: "bounce" },
          { do: "sfx", sound: "drum" },
          { do: "gesture", actor: "lulu", gesture: "happy" }
        ],
        lines: [
          { speaker: "lulu", key: "g10.your-turn.2" },
          { speaker: "narrator", key: "g10.your-turn.3" }
        ],
        holdMs: 1000
      },
      words: [
        { wordId: "your-turn", objectId: "drum" },
        { wordId: "boom", objectId: "drum" },
        { wordId: "drum", objectId: "drum" }
      ]
    },
    {
      id: "bear-turn",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "bear" },
        { do: "object", target: "bear", action: "bounce" },
        { do: "object", target: "shaker", action: "shake" },
        { do: "sfx", sound: "shaker" }
      ],
      reducedMotionStage: [
        { do: "face", actor: "lulu", toward: "bear" },
        { do: "object", target: "bear", action: "wobble" },
        { do: "object", target: "shaker", action: "wobble" },
        { do: "sfx", sound: "shaker" }
      ],
      lines: [
        { speaker: "lulu", key: "g10.bear-turn.1" },
        { speaker: "narrator", key: "g10.bear-turn.2" }
      ],
      words: [{ wordId: "bear", objectId: "bear" }],
      holdMs: 1200
    },
    {
      id: "my-turn",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "clap" },
        { do: "sfx", sound: "clap" }
      ],
      lines: [
        { speaker: "lulu", key: "g10.my-turn.1" },
        { speaker: "lulu", key: "g10.my-turn.2" }
      ],
      words: [
        { wordId: "my-turn", objectId: "lulu" },
        { wordId: "clap", objectId: "lulu" }
      ],
      holdMs: 1200
    },
    {
      id: "again",
      kind: "repeat",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "sway" },
        { do: "object", target: "bear", action: "wobble" }
      ],
      lines: [{ speaker: "lulu", key: "g10.again.1" }],
      words: [{ wordId: "more", objectId: "lulu" }],
      holdMs: 600,
      input: { type: "more-or-done", targets: ["drum", "bear"] },
      waitMs: 5000,
      caregiverPromptKey: "g10.tip.2",
      response: {
        stage: [{ do: "gesture", actor: "lulu", gesture: "nod" }],
        lines: [],
        holdMs: 600
      }
    }
  ],
  outro: [
    {
      id: "home",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "nod" }
      ],
      lines: [{ speaker: "lulu", key: "g10.home.1" }],
      words: [
        { wordId: "my-turn", objectId: "lulu" },
        { wordId: "your-turn", objectId: "lulu" }
      ],
      holdMs: 1200
    },
    {
      id: "all-done",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "object", target: "bear", action: "wobble" }
      ],
      lines: [
        { speaker: "lulu", key: "g10.all-done.1" },
        { speaker: "lulu", key: "g10.all-done.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "lulu" },
        { wordId: "bye", objectId: "bear" }
      ],
      holdMs: 2500
    }
  ]
};
