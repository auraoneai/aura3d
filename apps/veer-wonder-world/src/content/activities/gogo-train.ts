// G02 — Go-Go Train (P1 activity, PRD 05 section 3, task G02). GoGo the toy
// train hosts at GoGo Station. Peeko and Teddy wait on the platform. Each
// round: a tap on either passenger (or the wait running out) and both hop in
// ("In!"); "Ready..." then a tap on GoGo and the train sets off round the loop
// ("Go!", "Bye-bye, GoGo!"); GoGo curves round the back of the loop and a tap
// brings it to a gentle stop at the station ("Stop!"); the passengers hop out
// ("Out!") and GoGo asks "Ride again?". The whole circuit stays in view (right,
// back, then home), one slow loop per round, no racing, at most three rounds,
// and every wait ends by itself. The response to a tap does not depend on which
// passenger was tapped (the content contract has one response per beat), so
// both passengers always board together.
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
  props: [{ id: "teddy", asset: "teddy", at: "frontRight", size: 0.5 }],
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
  intro: [
    {
      id: "arrive",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "stationBed" },
        { do: "sfx", sound: "chugga" },
        { do: "enter", actor: "gogo", at: "center", from: "offLeft", style: "drive" },
        { do: "object", target: "gogo", action: "go" },
        { do: "face", actor: "peeko", toward: "gogo" }
      ],
      // The narrator speaks while GoGo drives in from off-screen; GoGo's own
      // "Hi!" comes second, once GoGo is in view (a character speaks only when
      // visible). Keys keep their recorded audio, so .2 plays before .1.
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
        // "stop" halts any move still in progress (src/scenes/motion.ts), so it
        // comes before the move: GoGo always ends at the platform, even when the
        // arrival was skipped or its lines ran shorter than the drive in.
        { do: "object", target: "gogo", action: "stop" },
        { do: "move", actor: "gogo", to: "center", style: "drive" },
        { do: "sfx", sound: "ding" },
        { do: "face", actor: "gogo", toward: "viewer" },
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
        { do: "face", actor: "gogo", toward: "viewer" },
        { do: "face", actor: "peeko", toward: "gogo" }
      ],
      lines: [{ speaker: "gogo", key: "g02.board.1" }],
      words: [{ wordId: "in", objectId: "gogo" }],
      holdMs: 800,
      input: { type: "tap", targets: ["peeko", "teddy"] },
      waitMs: 5000,
      caregiverPromptKey: "g02.tip.1",
      response: {
        stage: [
          { do: "move", actor: "peeko", to: "center", style: "hop" },
          { do: "move", actor: "teddy", to: "center", style: "hop" }
        ],
        lines: [
          { speaker: "narrator", key: "g02.board.2" },
          { speaker: "narrator", key: "g02.board.3" }
        ],
        holdMs: 1200
      }
    },
    {
      id: "go",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "hide", actor: "peeko" },
        { do: "hide", actor: "teddy" },
        { do: "object", target: "gogo", action: "close" },
        { do: "face", actor: "gogo", toward: "viewer" }
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
          { do: "move", actor: "gogo", to: "farRight", style: "drive" }
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
        { do: "move", actor: "gogo", to: "back", style: "drive" },
        { do: "object", target: "gogo", action: "go" },
        { do: "sfx", sound: "chugga" }
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
          // Brake first (the chugging ends), then glide home and come to rest at
          // the station. In the other order "stop" would cancel the move home and
          // leave GoGo at the back of the loop.
          { do: "object", target: "gogo", action: "stop" },
          { do: "move", actor: "gogo", to: "center", style: "drive" },
          { do: "sfx", sound: "ding" }
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
        { do: "enter", actor: "peeko", at: "frontLeft", from: "center", style: "hop" },
        { do: "enter", actor: "teddy", at: "frontRight", from: "center", style: "hop" },
        { do: "face", actor: "gogo", toward: "viewer" }
      ],
      reducedMotionStage: [
        { do: "object", target: "gogo", action: "open" },
        { do: "enter", actor: "peeko", at: "frontLeft", from: "center", style: "walk" },
        { do: "enter", actor: "teddy", at: "frontRight", from: "center", style: "walk" },
        { do: "face", actor: "gogo", toward: "viewer" }
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
        { do: "face", actor: "gogo", toward: "viewer" },
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
