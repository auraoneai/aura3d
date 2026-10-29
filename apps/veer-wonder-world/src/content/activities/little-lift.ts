// G07 — The Little Lift (P2 activity, PRD 05 section 3, task I04). Peeko hosts
// in the Home Nook. A tap on Teddy sends him into a toy lift; each round he
// rides up one floor ("Going up?"), the door opens ("Ding! Open!"), then he
// rides down one floor ("Going down?") and the door opens again. One level per
// tap; every wait ends by itself, so the lift moves whether or not the child
// taps. Words: in, out, up, down, open (core: up, down, open).
// No trapping or fear: the door always opens, Teddy wobbles hello from inside,
// and the outro brings him out before "All done".
//
// Stage contract used here: Teddy moves to the lift's spot (the lift is a
// container, so he stands inside it); `object teddy up` / `down` raise and
// lower him by one lift floor. The lift tower itself never moves, so the
// lines say what is seen: "Teddy goes up", not "the lift goes up".
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "little-lift",
  number: 7,
  version: 1,
  phase: "P2",
  titleKey: "g07.title",
  world: "home-nook",
  host: "peeko",
  cast: [{ id: "peeko", at: "offRight" }],
  props: [
    { id: "lift", asset: "lift", at: "center", size: 1.8 },
    { id: "teddy", asset: "teddy", at: "left", size: 0.6 }
  ],
  targetWords: ["up", "down", "open"],
  supportWords: ["in", "out", "lift", "teddy", "look", "hi", "peekaboo", "again", "bye", "all-done"],
  music: "homeBed",
  offlinePlayKey: "g07.offline",
  caregiverBridgeKey: "g07.bridge",
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
        { do: "enter", actor: "peeko", at: "right", from: "offRight", style: "hop" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "object", target: "lift", action: "wobble" }
      ],
      reducedMotionStage: [
        { do: "music", bed: "homeBed" },
        { do: "enter", actor: "peeko", at: "right", from: "offRight", style: "walk" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "object", target: "lift", action: "glow" }
      ],
      lines: [
        { speaker: "peeko", key: "g07.hello.1" },
        { speaker: "peeko", key: "g07.hello.2" }
      ],
      words: [
        { wordId: "hi", objectId: "peeko" },
        { wordId: "look", objectId: "lift" },
        { wordId: "lift", objectId: "lift" }
      ],
      holdMs: 1500
    },
    {
      id: "in",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "object", target: "lift", action: "open" },
        { do: "sfx", sound: "doorOpen" },
        { do: "object", target: "teddy", action: "bounce" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "point" }
      ],
      reducedMotionStage: [
        { do: "object", target: "lift", action: "open" },
        { do: "sfx", sound: "doorOpen" },
        { do: "object", target: "teddy", action: "wobble" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "point" }
      ],
      lines: [
        { speaker: "narrator", key: "g07.in.1" },
        { speaker: "peeko", key: "g07.in.2" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["teddy"] },
      waitMs: 5000,
      caregiverPromptKey: "g07.tip.1",
      response: {
        stage: [
          { do: "move", actor: "teddy", to: "center", style: "slide" },
          { do: "face", actor: "peeko", toward: "lift" }
        ],
        lines: [
          { speaker: "narrator", key: "g07.in.3" },
          { speaker: "peeko", key: "g07.in.4" }
        ],
        holdMs: 1200
      },
      words: [
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "in", objectId: "teddy" },
        { wordId: "lift", objectId: "lift" }
      ]
    }
  ],
  round: [
    {
      id: "up",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "object", target: "lift", action: "close" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "point" }
      ],
      lines: [{ speaker: "peeko", key: "g07.up.1" }],
      holdMs: 800,
      input: { type: "tap", targets: ["lift", "teddy"] },
      waitMs: 5000,
      caregiverPromptKey: "g07.tip.2",
      response: {
        stage: [
          { do: "sfx", sound: "pianoUp" },
          { do: "object", target: "teddy", action: "up" },
          { do: "face", actor: "peeko", toward: "teddy" }
        ],
        lines: [
          { speaker: "peeko", key: "g07.up.2" },
          { speaker: "narrator", key: "g07.up.3" }
        ],
        holdMs: 1000
      },
      words: [{ wordId: "up", objectId: "teddy" }]
    },
    {
      id: "top",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "ding" },
        { do: "object", target: "lift", action: "open" },
        { do: "object", target: "teddy", action: "wobble" },
        { do: "gesture", actor: "peeko", gesture: "peek" }
      ],
      lines: [
        { speaker: "peeko", key: "g07.top.1" },
        { speaker: "peeko", key: "g07.top.2" }
      ],
      words: [
        { wordId: "open", objectId: "lift" },
        { wordId: "peekaboo", objectId: "teddy" }
      ],
      holdMs: 1500
    },
    {
      id: "down",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "object", target: "lift", action: "close" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "point" }
      ],
      lines: [{ speaker: "peeko", key: "g07.down.1" }],
      holdMs: 800,
      input: { type: "tap", targets: ["lift", "teddy"] },
      waitMs: 5000,
      caregiverPromptKey: "g07.tip.2",
      response: {
        stage: [
          { do: "sfx", sound: "pianoDown" },
          { do: "object", target: "teddy", action: "down" },
          { do: "face", actor: "peeko", toward: "teddy" }
        ],
        lines: [
          { speaker: "peeko", key: "g07.down.2" },
          { speaker: "narrator", key: "g07.down.3" }
        ],
        holdMs: 1000
      },
      words: [{ wordId: "down", objectId: "teddy" }]
    },
    {
      id: "again",
      kind: "repeat",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "ding" },
        { do: "object", target: "lift", action: "open" },
        { do: "object", target: "teddy", action: "bounce" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "happy" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "ding" },
        { do: "object", target: "lift", action: "open" },
        { do: "object", target: "teddy", action: "wobble" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "nod" }
      ],
      lines: [
        { speaker: "peeko", key: "g07.again.1" },
        { speaker: "peeko", key: "g07.again.2" }
      ],
      words: [
        { wordId: "open", objectId: "lift" },
        { wordId: "hi", objectId: "teddy" },
        { wordId: "again", objectId: "teddy" }
      ],
      holdMs: 600,
      input: { type: "more-or-done", targets: ["lift", "teddy"] },
      waitMs: 5000,
      caregiverPromptKey: "g07.tip.3",
      response: {
        stage: [{ do: "gesture", actor: "peeko", gesture: "nod" }],
        lines: [],
        holdMs: 600
      }
    }
  ],
  outro: [
    {
      id: "out",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "move", actor: "teddy", to: "left", style: "hop" },
        { do: "face", actor: "peeko", toward: "teddy" },
        { do: "gesture", actor: "peeko", gesture: "happy" }
      ],
      reducedMotionStage: [
        { do: "move", actor: "teddy", to: "left", style: "slide" },
        { do: "face", actor: "peeko", toward: "teddy" },
        { do: "gesture", actor: "peeko", gesture: "nod" }
      ],
      lines: [
        { speaker: "narrator", key: "g07.out.1" },
        { speaker: "peeko", key: "g07.out.2" }
      ],
      words: [{ wordId: "out", objectId: "teddy" }],
      holdMs: 1200
    },
    {
      id: "bye",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "object", target: "lift", action: "close" },
        { do: "object", target: "teddy", action: "wobble" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "peeko", key: "g07.bye.1" },
        { speaker: "peeko", key: "g07.bye.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "peeko" },
        { wordId: "bye", objectId: "teddy" }
      ],
      holdMs: 2500
    }
  ]
};
