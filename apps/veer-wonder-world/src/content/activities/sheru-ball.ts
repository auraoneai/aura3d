// G03 — Sheru's Ball Game (P1 activity, golden slice; PRD 05 section 3, task
// G03). Sheru and Momo play fetch in Momo Meadow. Each round: Momo says
// "Ready..." and waits; a tap on the ball (or the wait running out) rolls it
// ("Go, ball!"); Sheru runs after it ("Go, Sheru, go!"), carries it back
// ("Sheru has the ball!") and drops it; Momo asks "More ball?". Three fetches
// at most (roundLimit 3); "All done" ends the game at any moment. Sheru only
// barks; nothing listens to or scores speech.
// Words: ball, go, more (core) with hi, look, woof, roll, thank you, bye, all done.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "sheru-ball",
  number: 3,
  version: 1,
  phase: "P1",
  titleKey: "g03.title",
  world: "meadow",
  host: "sheru",
  // Momo starts on his mark (a core spot, in view on every screen), so his
  // face and wave are visible while he says "Hi!". An entrance from offLeft
  // takes longer than the greeting line, which would play off-screen.
  cast: [
    { id: "momo", at: "left" },
    { id: "sheru", at: "center" }
  ],
  props: [{ id: "ball", asset: "ball", at: "front", tint: "#E4574B", size: 0.45 }],
  targetWords: ["ball", "go", "more"],
  supportWords: ["hi", "look", "woof", "roll", "thank-you", "bye", "all-done"],
  music: "meadowBed",
  offlinePlayKey: "g03.offline",
  caregiverBridgeKey: "g03.bridge",
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
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [
        { speaker: "momo", key: "g03.hello.1" },
        { speaker: "momo", key: "g03.hello.2" }
      ],
      words: [
        { wordId: "hi", objectId: "momo" },
        { wordId: "hi", objectId: "sheru" }
      ],
      holdMs: 1000
    },
    {
      id: "woof",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "woof" },
        { do: "gesture", actor: "sheru", gesture: "bark" },
        { do: "object", target: "ball", action: "bounce" },
        { do: "face", actor: "momo", toward: "ball" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "woof" },
        { do: "gesture", actor: "sheru", gesture: "bark" },
        { do: "object", target: "ball", action: "glow" },
        { do: "face", actor: "momo", toward: "ball" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "g03.woof.1" },
        { speaker: "momo", key: "g03.woof.2" }
      ],
      words: [
        { wordId: "woof", objectId: "sheru" },
        { wordId: "look", objectId: "ball" },
        { wordId: "ball", objectId: "ball" }
      ],
      holdMs: 1500
    }
  ],
  round: [
    {
      id: "roll",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "sheru", toward: "ball" },
        { do: "gesture", actor: "sheru", gesture: "look" },
        { do: "object", target: "ball", action: "glow" }
      ],
      lines: [{ speaker: "momo", key: "g03.roll.1" }],
      words: [
        { wordId: "go", objectId: "ball" },
        { wordId: "roll", objectId: "ball" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["ball"] },
      waitMs: 5000,
      caregiverPromptKey: "g03.tip.1",
      response: {
        stage: [
          { do: "move", actor: "ball", to: "farRight", style: "roll" },
          { do: "object", target: "ball", action: "roll" },
          { do: "face", actor: "momo", toward: "ball" }
        ],
        lines: [
          { speaker: "momo", key: "g03.roll.2" },
          { speaker: "narrator", key: "g03.roll.3" }
        ],
        holdMs: 800
      }
    },
    {
      id: "fetch",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "move", actor: "sheru", to: "farRight", style: "run" },
        { do: "face", actor: "sheru", toward: "ball" },
        { do: "sfx", sound: "woof" },
        { do: "gesture", actor: "momo", gesture: "cheer" }
      ],
      reducedMotionStage: [
        { do: "move", actor: "sheru", to: "farRight", style: "walk" },
        { do: "face", actor: "sheru", toward: "ball" },
        { do: "sfx", sound: "woof" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [{ speaker: "momo", key: "g03.fetch.1" }],
      words: [{ wordId: "go", objectId: "sheru" }],
      holdMs: 2000
    },
    {
      id: "back",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "carry", actor: "sheru", item: "ball" },
        { do: "move", actor: "sheru", to: "center", style: "walk" },
        // Without this Sheru keeps facing the ball he now carries, whose resting
        // spot is still farRight, so he would turn away for "Hi, Sheru!"; facing
        // the viewer also sets the ball down in front of him in the next beat.
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "face", actor: "momo", toward: "sheru" }
      ],
      lines: [
        { speaker: "momo", key: "g03.back.1" },
        { speaker: "momo", key: "g03.back.2" }
      ],
      words: [
        { wordId: "ball", objectId: "ball" },
        { wordId: "hi", objectId: "sheru" }
      ],
      holdMs: 1000
    },
    {
      id: "more",
      kind: "repeat",
      camera: "wide",
      stage: [
        // Sheru sets the ball down and it rolls to the front spot, where every
        // round starts: clear of Sheru as a tap target, and the next roll to
        // farRight does not pass through him.
        { do: "carry", actor: "sheru", item: null },
        { do: "move", actor: "ball", to: "front", style: "roll" },
        { do: "gesture", actor: "sheru", gesture: "sit" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "object", target: "ball", action: "glow" }
      ],
      lines: [{ speaker: "momo", key: "g03.more.1" }],
      words: [
        { wordId: "more", objectId: "ball" },
        { wordId: "ball", objectId: "ball" }
      ],
      holdMs: 800,
      input: { type: "more-or-done", targets: ["ball"] },
      waitMs: 5000,
      caregiverPromptKey: "g03.tip.2",
      response: {
        stage: [{ do: "gesture", actor: "momo", gesture: "nod" }],
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
        { do: "sfx", sound: "woof" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "face", actor: "momo", toward: "sheru" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "g03.thanks.1" },
        { speaker: "narrator", key: "g03.thanks.2" }
      ],
      words: [{ wordId: "thank-you", objectId: "sheru" }],
      holdMs: 1500
    },
    {
      id: "bye",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "gesture", actor: "sheru", gesture: "sit" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "g03.bye.1" },
        { speaker: "momo", key: "g03.bye.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "sheru" }
      ],
      holdMs: 3000
    }
  ]
};
