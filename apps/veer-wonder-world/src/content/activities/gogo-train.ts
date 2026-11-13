// G02 — Go-Go Train (P1 activity, PRD 05 section 3, task G02). GoGo the toy
// train hosts on the railway track (`z = -1.6`: `backLeft`, `back`, `backRight`)
// at GoGo Station, facing right along the rails. Peeko and Teddy wait on the
// front platform spots. Each round: a tap on either passenger (or the wait
// running out) opens the carriage and both board ("In!"); "Ready..." then a tap
// on GoGo and the train chugs rightward along the track ("Go!", "Bye-bye,
// GoGo!"); a tap brings it to a gentle stop at the station ("Stop!"); the
// passengers step out ("Out!") and GoGo asks "Ride again?". Rounds 2 and 3
// cleanly reset the train and passengers to their starting spots.
// Words: go, stop, in (core) with bye, hi, train, out, again, thank you, all done.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "gogo-train",
  number: 2,
  version: 1,
  phase: "P1",
  titleKey: "g02.title",
  world: "station",
  host: "gogo",
  cast: [
    { id: "gogo", at: "offLeft" },
    { id: "peeko", at: "frontLeft" }
  ],
  props: [
    { id: "gogoCarriage", asset: "gogoCarriage", at: "offLeft", size: 0.7 },
    { id: "teddy", asset: "teddy", at: "frontRight", size: 0.5 }
  ],
  targetWords: ["go", "stop", "in"],
  supportWords: ["bye", "hi", "train", "out", "again", "thank-you", "all-done"],
  music: "stationBed",
  offlinePlayKey: "g02.offline",
  caregiverBridgeKey: "g02.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  options: { allowTap: true, dragAlternative: "tap", microphoneRequired: false },
  roundLimit: 3,
  roundVariants: [
    {
      setupStage: [
        { do: "carry", actor: "gogoCarriage", item: null },
        { do: "move", actor: "peeko", to: "frontLeft", style: "walk" },
        { do: "move", actor: "teddy", to: "frontRight", style: "slide" },
        { do: "object", target: "gogo", action: "glow" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      reducedMotionSetupStage: [
        { do: "carry", actor: "gogoCarriage", item: null },
        { do: "move", actor: "peeko", to: "frontLeft", style: "walk" },
        { do: "move", actor: "teddy", to: "frontRight", style: "slide" },
        { do: "object", target: "gogo", action: "glow" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ]
    },
    {
      setupStage: [
        { do: "carry", actor: "gogoCarriage", item: null },
        { do: "enter", actor: "gogoCarriage", at: "backLeft", from: "offLeft", style: "drive" },
        { do: "enter", actor: "gogo", at: "back", from: "backLeft", style: "drive" },
        { do: "move", actor: "peeko", to: "frontLeft", style: "hop" },
        { do: "move", actor: "teddy", to: "frontRight", style: "slide" },
        { do: "sfx", sound: "whistle" },
        { do: "gesture", actor: "peeko", gesture: "hop" },
        { do: "object", target: "teddy", action: "wobble" }
      ],
      reducedMotionSetupStage: [
        { do: "carry", actor: "gogoCarriage", item: null },
        { do: "enter", actor: "gogoCarriage", at: "backLeft", from: "offLeft", style: "drive" },
        { do: "enter", actor: "gogo", at: "back", from: "backLeft", style: "drive" },
        { do: "move", actor: "peeko", to: "frontLeft", style: "walk" },
        { do: "move", actor: "teddy", to: "frontRight", style: "slide" },
        { do: "sfx", sound: "whistle" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "object", target: "teddy", action: "glow" }
      ]
    },
    {
      setupStage: [
        { do: "carry", actor: "gogoCarriage", item: null },
        { do: "enter", actor: "gogoCarriage", at: "backLeft", from: "offLeft", style: "drive" },
        { do: "enter", actor: "gogo", at: "back", from: "backLeft", style: "drive" },
        { do: "move", actor: "peeko", to: "frontLeft", style: "hop" },
        { do: "move", actor: "teddy", to: "frontRight", style: "slide" },
        { do: "sfx", sound: "ding" },
        { do: "gesture", actor: "peeko", gesture: "cheer" },
        { do: "object", target: "gogoCarriage", action: "wobble" }
      ],
      reducedMotionSetupStage: [
        { do: "carry", actor: "gogoCarriage", item: null },
        { do: "enter", actor: "gogoCarriage", at: "backLeft", from: "offLeft", style: "drive" },
        { do: "enter", actor: "gogo", at: "back", from: "backLeft", style: "drive" },
        { do: "move", actor: "peeko", to: "frontLeft", style: "walk" },
        { do: "move", actor: "teddy", to: "frontRight", style: "slide" },
        { do: "sfx", sound: "ding" },
        { do: "gesture", actor: "peeko", gesture: "happy" },
        { do: "object", target: "gogoCarriage", action: "glow" }
      ]
    }
  ],
  intro: [
    {
      id: "arrive",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "stationBed" },
        { do: "sfx", sound: "chugga" },
        { do: "enter", actor: "gogoCarriage", at: "backLeft", from: "offLeft", style: "drive" },
        { do: "enter", actor: "gogo", at: "back", from: "offLeft", style: "drive" },
        { do: "object", target: "gogo", action: "go" },
        { do: "face", actor: "peeko", toward: "gogo" }
      ],
      lines: [
        { speaker: "narrator", key: "g02.arrive.2" },
        { speaker: "gogo", key: "g02.arrive.1" }
      ],
      words: [
        { wordId: "hi", objectId: "gogo" },
        { wordId: "train", objectId: "gogo" }
      ],
      holdMs: 1000
    },
    {
      id: "platform",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "object", target: "gogo", action: "stop" },
        { do: "move", actor: "gogoCarriage", to: "backLeft", style: "drive" },
        { do: "move", actor: "gogo", to: "back", style: "drive" },
        { do: "sfx", sound: "ding" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "peeko", key: "g02.platform.1" },
        { speaker: "peeko", key: "g02.platform.2" }
      ],
      words: [{ wordId: "hi", objectId: "peeko" }],
      holdMs: 1500
    }
  ],
  round: [
    {
      id: "board",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "object", target: "gogo", action: "open" },
        { do: "object", target: "gogoCarriage", action: "open" },
        { do: "face", actor: "peeko", toward: "gogoCarriage" }
      ],
      lines: [{ speaker: "gogo", key: "g02.board.1" }],
      words: [{ wordId: "in", objectId: "gogo" }],
      holdMs: 800,
      input: { type: "tap", targets: ["peeko", "teddy"] },
      waitMs: 5000,
      caregiverPromptKey: "g02.tip.1",
      response: {
        stage: [
          { do: "object", target: "gogoCarriage", action: "open" },
          { do: "move", actor: "peeko", to: "backLeft", style: "hop" },
          { do: "move", actor: "teddy", to: "backLeft", style: "slide" },
          { do: "carry", actor: "gogoCarriage", item: "teddy" },
          { do: "gesture", actor: "peeko", gesture: "happy" }
        ],
        lines: [
          { speaker: "narrator", key: "g02.board.2" },
          { speaker: "narrator", key: "g02.board.3" }
        ],
        holdMs: 1200
      },
      responseByTarget: {
        peeko: {
          stage: [
            { do: "object", target: "gogoCarriage", action: "open" },
            { do: "sfx", sound: "tweet" },
            { do: "move", actor: "peeko", to: "backLeft", style: "hop" },
            { do: "gesture", actor: "peeko", gesture: "cheer" },
            { do: "move", actor: "teddy", to: "backLeft", style: "slide" },
            { do: "carry", actor: "gogoCarriage", item: "teddy" }
          ]
        },
        teddy: {
          stage: [
            { do: "object", target: "gogoCarriage", action: "open" },
            { do: "sfx", sound: "whistle" },
            { do: "object", target: "teddy", action: "bounce" },
            { do: "move", actor: "teddy", to: "backLeft", style: "slide" },
            { do: "carry", actor: "gogoCarriage", item: "teddy" },
            { do: "move", actor: "peeko", to: "backLeft", style: "hop" },
            { do: "gesture", actor: "peeko", gesture: "happy" }
          ]
        }
      }
    },
    {
      id: "go",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "object", target: "gogo", action: "close" },
        { do: "object", target: "gogoCarriage", action: "close" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [{ speaker: "gogo", key: "g02.go.1" }],
      words: [
        { wordId: "go", objectId: "gogo" },
        { wordId: "bye", objectId: "gogo" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["gogo"] },
      waitMs: 5000,
      caregiverPromptKey: "g02.tip.2",
      response: {
        stage: [
          { do: "object", target: "gogo", action: "go" },
          { do: "sfx", sound: "chugga" },
          { do: "move", actor: "gogo", to: "backRight", style: "drive" },
          { do: "move", actor: "gogoCarriage", to: "back", style: "drive" },
          { do: "move", actor: "peeko", to: "back", style: "drive" },
          { do: "gesture", actor: "peeko", gesture: "cheer" }
        ],
        lines: [
          { speaker: "gogo", key: "g02.go.2" },
          { speaker: "narrator", key: "g02.go.3" }
        ],
        holdMs: 1000
      }
    },
    {
      id: "stop",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "object", target: "gogo", action: "go" },
        { do: "sfx", sound: "chugga" },
        { do: "gesture", actor: "peeko", gesture: "happy" }
      ],
      lines: [
        { speaker: "narrator", key: "g02.stop.1" },
        { speaker: "gogo", key: "g02.stop.2" }
      ],
      words: [{ wordId: "stop", objectId: "gogo" }],
      holdMs: 800,
      input: { type: "tap", targets: ["gogo"] },
      waitMs: 5000,
      caregiverPromptKey: "g02.tip.2",
      response: {
        stage: [
          { do: "object", target: "gogo", action: "stop" },
          { do: "sfx", sound: "ding" },
          { do: "gesture", actor: "peeko", gesture: "wave" }
        ],
        lines: [
          { speaker: "gogo", key: "g02.stop.3" },
          { speaker: "narrator", key: "g02.stop.4" }
        ],
        holdMs: 1200
      }
    },
    {
      id: "more",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "object", target: "gogo", action: "open" },
        { do: "object", target: "gogoCarriage", action: "open" },
        { do: "carry", actor: "gogoCarriage", item: null },
        { do: "move", actor: "peeko", to: "frontLeft", style: "hop" },
        { do: "move", actor: "teddy", to: "frontRight", style: "hop" },
        { do: "gesture", actor: "peeko", gesture: "happy" }
      ],
      reducedMotionStage: [
        { do: "object", target: "gogo", action: "open" },
        { do: "object", target: "gogoCarriage", action: "open" },
        { do: "carry", actor: "gogoCarriage", item: null },
        { do: "move", actor: "peeko", to: "frontLeft", style: "walk" },
        { do: "move", actor: "teddy", to: "frontRight", style: "walk" },
        { do: "gesture", actor: "peeko", gesture: "nod" }
      ],
      lines: [
        { speaker: "narrator", key: "g02.more.1" },
        { speaker: "gogo", key: "g02.more.2" }
      ],
      words: [
        { wordId: "out", objectId: "peeko" },
        { wordId: "again", objectId: "gogo" }
      ],
      holdMs: 800,
      input: { type: "more-or-done", targets: ["gogo"] },
      waitMs: 5000,
      caregiverPromptKey: "g02.tip.3",
      response: {
        stage: [{ do: "gesture", actor: "gogo", gesture: "nod" }],
        lines: [],
        holdMs: 500
      }
    }
  ],
  outro: [
    {
      id: "thanks",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "object", target: "gogo", action: "close" },
        { do: "object", target: "gogoCarriage", action: "close" },
        { do: "face", actor: "peeko", toward: "gogo" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "peeko", key: "g02.thanks.1" },
        { speaker: "narrator", key: "g02.thanks.2" }
      ],
      words: [{ wordId: "thank-you", objectId: "gogo" }],
      holdMs: 1500
    },
    {
      id: "bye",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "gogo", gesture: "happy" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "gogo", key: "g02.bye.1" },
        { speaker: "peeko", key: "g02.bye.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "gogo" },
        { wordId: "bye", objectId: "gogo" }
      ],
      holdMs: 3000
    }
  ]
};
