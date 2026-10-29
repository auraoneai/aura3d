// G05 — Teddy's Snack Picnic (P2 activity, PRD 05 section 3, task I02). Momo
// hosts a pretend picnic in the Home Nook for Teddy, a toy bear prop. Each
// round: Momo points to the apple on the plate ("An apple! For Teddy?"); a tap
// on the apple or on Teddy (or the wait running out) slides it over to Teddy,
// who pretends to eat ("Teddy eats the apple." "Mmm!"); then the same with a
// banana; then "More for Teddy?". Pretend eating only: the food goes back to
// its place, nobody has to eat anything, and Teddy ends by being "all done"
// (no feeding pressure, no body talk). Tapping the food and tapping Teddy lead
// to the same offer, so either target is always the right answer. At most
// three rounds.
// Words: apple, banana, eat (core) with more, all done, teddy, hi, uh-oh,
// picnic, mmm, thank you, bye.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "teddy-snack-picnic",
  number: 5,
  version: 1,
  phase: "P2",
  titleKey: "g05.title",
  world: "home-nook",
  host: "momo",
  // Momo starts on his mark (a core spot, in view on every screen), so his
  // face and wave are visible while he says "Hi!". An entrance from offLeft
  // takes longer than the greeting line, which would play off-screen.
  cast: [{ id: "momo", at: "left" }],
  props: [
    { id: "teddy", asset: "teddy", at: "center", size: 0.6 },
    { id: "plate", asset: "plate", at: "front", size: 0.1 },
    // Back right: the foods hop from here to the front without passing through
    // Teddy (moves are straight lines; from backLeft the banana's path to
    // frontRight crosses Teddy at center).
    { id: "basket", asset: "picnicBasket", at: "backRight", size: 0.45 },
    { id: "apple", asset: "apple", at: "front", hidden: true, size: 0.35 },
    { id: "banana", asset: "banana", at: "frontRight", hidden: true, size: 0.35 }
  ],
  targetWords: ["apple", "banana", "eat"],
  supportWords: ["more", "all-done", "teddy", "hi", "uh-oh", "picnic", "mmm", "thank-you", "bye"],
  music: "homeBed",
  offlinePlayKey: "g05.offline",
  caregiverBridgeKey: "g05.bridge",
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
        { speaker: "momo", key: "g05.hello.1" },
        { speaker: "momo", key: "g05.hello.2" }
      ],
      words: [
        { wordId: "hi", objectId: "momo" },
        { wordId: "teddy", objectId: "teddy" }
      ],
      holdMs: 1000
    },
    {
      id: "picnic",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "rumble" },
        { do: "object", target: "teddy", action: "wobble" },
        { do: "face", actor: "momo", toward: "teddy" },
        { do: "object", target: "basket", action: "open" },
        { do: "enter", actor: "apple", at: "front", from: "backRight", style: "hop" },
        { do: "enter", actor: "banana", at: "frontRight", from: "backRight", style: "hop" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "rumble" },
        { do: "face", actor: "momo", toward: "teddy" },
        { do: "object", target: "basket", action: "open" },
        { do: "enter", actor: "apple", at: "front", from: "backRight", style: "slide" },
        { do: "enter", actor: "banana", at: "frontRight", from: "backRight", style: "slide" }
      ],
      lines: [
        { speaker: "momo", key: "g05.picnic.1" },
        { speaker: "momo", key: "g05.picnic.2" }
      ],
      words: [
        { wordId: "uh-oh", objectId: "teddy" },
        { wordId: "picnic", objectId: "basket" }
      ],
      holdMs: 1500
    }
  ],
  round: [
    {
      id: "apple",
      kind: "invite",
      camera: "wide",
      // Momo points and the apple glows on its plate; the offer slides it from
      // the plate to Teddy. (Carrying it would snap it across the stage into
      // Momo's hands, and setting it down in front of Momo would slide it
      // through his body on the way to Teddy.)
      stage: [
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "apple", action: "glow" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      lines: [
        { speaker: "momo", key: "g05.apple.1" },
        { speaker: "momo", key: "g05.apple.2" }
      ],
      words: [
        { wordId: "apple", objectId: "apple" },
        { wordId: "eat", objectId: "teddy" },
        { wordId: "mmm", objectId: "teddy" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["apple", "teddy"] },
      waitMs: 5000,
      caregiverPromptKey: "g05.tip.1",
      response: {
        stage: [
          { do: "move", actor: "apple", to: "center", style: "slide" },
          { do: "face", actor: "momo", toward: "teddy" },
          { do: "object", target: "teddy", action: "wobble" },
          { do: "sfx", sound: "munch" }
        ],
        lines: [
          { speaker: "narrator", key: "g05.apple.3" },
          { speaker: "momo", key: "g05.apple.4" }
        ],
        holdMs: 1200
      }
    },
    {
      id: "banana",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "move", actor: "apple", to: "front", style: "slide" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "banana", action: "glow" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      lines: [
        { speaker: "momo", key: "g05.banana.1" },
        { speaker: "momo", key: "g05.banana.2" }
      ],
      words: [
        { wordId: "banana", objectId: "banana" },
        { wordId: "eat", objectId: "teddy" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["banana", "teddy"] },
      waitMs: 5000,
      caregiverPromptKey: "g05.tip.1",
      response: {
        stage: [
          { do: "move", actor: "banana", to: "center", style: "slide" },
          { do: "face", actor: "momo", toward: "teddy" },
          { do: "object", target: "teddy", action: "wobble" },
          { do: "sfx", sound: "munch" }
        ],
        lines: [
          { speaker: "narrator", key: "g05.banana.3" },
          { speaker: "momo", key: "g05.banana.4" }
        ],
        holdMs: 1200
      }
    },
    {
      id: "more",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "move", actor: "banana", to: "frontRight", style: "slide" },
        { do: "object", target: "teddy", action: "bounce" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      reducedMotionStage: [
        { do: "move", actor: "banana", to: "frontRight", style: "slide" },
        { do: "object", target: "teddy", action: "glow" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      lines: [{ speaker: "momo", key: "g05.more.1" }],
      words: [
        { wordId: "more", objectId: "teddy" },
        { wordId: "teddy", objectId: "teddy" }
      ],
      holdMs: 800,
      input: { type: "more-or-done", targets: ["teddy"] },
      waitMs: 5000,
      caregiverPromptKey: "g05.tip.2",
      response: {
        stage: [{ do: "gesture", actor: "momo", gesture: "nod" }],
        lines: [],
        holdMs: 500
      }
    }
  ],
  outro: [
    {
      id: "full",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "object", target: "teddy", action: "wobble" },
        { do: "face", actor: "momo", toward: "teddy" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "g05.full.1" },
        { speaker: "momo", key: "g05.full.2" },
        { speaker: "narrator", key: "g05.full.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "teddy" },
        { wordId: "thank-you", objectId: "teddy" }
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
        { speaker: "momo", key: "g05.bye.1" },
        { speaker: "momo", key: "g05.bye.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "teddy" }
      ],
      holdMs: 3000
    }
  ]
};
