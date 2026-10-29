// G12 — Find My Real Toy (P2 activity, PRD 05 section 3, task I09). In the
// Peekaboo Barn, Sheru sniffs a toy box and finds a ball, then a teddy. Then
// the story pauses for the real world: "Your turn! Find a toy near you." Sheru
// sits and waits (a long, calm hold) while the child and caregiver look for a
// real toy; a tap on Sheru (or the grown-up confirm) carries on, and so does
// the wait ending by itself. Words: find, there, ball (plus teddy).
//
// No camera, no object recognition and no claims about what the child did:
// nothing says "you found it". Lines only describe Sheru and the toys on
// screen, or invite. Sheru never speaks; the narrator tells the story, and his
// reactions are bark-bank sounds, one at a time: a playful arf hello, a soft
// sniffing as he finds the ball ("Sniff, sniff... a ball!"), a woof with
// "Woof! Toys are fun to find.", a little huff as the toys go back in the
// box, and a soft woof goodbye.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "find-my-real-toy",
  number: 12,
  version: 1,
  phase: "P2",
  titleKey: "g12.title",
  world: "peekaboo-barn",
  host: "sheru",
  cast: [{ id: "sheru", at: "offRight" }],
  props: [
    { id: "toy-box", asset: "toyBox", at: "left", size: 0.6 },
    { id: "ball", asset: "ball", at: "frontLeft", hidden: true, tint: "#E4574B", size: 0.35 },
    { id: "teddy", asset: "teddy", at: "backLeft", hidden: true, size: 0.55 }
  ],
  targetWords: ["find", "there", "ball"],
  supportWords: ["teddy", "box", "look", "your-turn", "woof", "hi", "bye", "all-done"],
  music: "barnBed",
  offlinePlayKey: "g12.offline",
  caregiverBridgeKey: "g12.bridge",
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
        { do: "music", bed: "barnBed" },
        { do: "enter", actor: "sheru", at: "center", from: "offRight", style: "walk" },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "sfx", sound: "arf" }
      ],
      lines: [
        { speaker: "narrator", key: "g12.hello.1" },
        { speaker: "narrator", key: "g12.hello.2" }
      ],
      words: [
        { wordId: "hi", objectId: "sheru" },
        { wordId: "find", objectId: "sheru" }
      ],
      holdMs: 1200
    },
    {
      id: "box",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "face", actor: "sheru", toward: "toy-box" },
        { do: "gesture", actor: "sheru", gesture: "look" },
        { do: "object", target: "toy-box", action: "wobble" }
      ],
      lines: [
        { speaker: "narrator", key: "g12.box.1" },
        { speaker: "narrator", key: "g12.box.2" }
      ],
      words: [
        { wordId: "look", objectId: "toy-box" },
        { wordId: "box", objectId: "toy-box" }
      ],
      holdMs: 1000
    }
  ],
  round: [
    {
      id: "ball",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "hide", actor: "teddy" },
        { do: "face", actor: "sheru", toward: "toy-box" },
        { do: "gesture", actor: "sheru", gesture: "sniff" },
        { do: "show", actor: "ball" },
        { do: "object", target: "ball", action: "bounce" },
        { do: "sfx", sound: "sniffs" }
      ],
      reducedMotionStage: [
        { do: "hide", actor: "teddy" },
        { do: "face", actor: "sheru", toward: "toy-box" },
        { do: "gesture", actor: "sheru", gesture: "sniff" },
        { do: "show", actor: "ball" },
        { do: "object", target: "ball", action: "wobble" },
        { do: "sfx", sound: "sniffs" }
      ],
      lines: [
        { speaker: "narrator", key: "g12.ball.1" },
        { speaker: "narrator", key: "g12.ball.2" }
      ],
      words: [
        { wordId: "ball", objectId: "ball" },
        { wordId: "there", objectId: "ball" }
      ],
      holdMs: 1200
    },
    {
      id: "teddy",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "sheru", gesture: "sniff" },
        { do: "show", actor: "teddy" },
        { do: "object", target: "teddy", action: "bounce" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      reducedMotionStage: [
        { do: "gesture", actor: "sheru", gesture: "sniff" },
        { do: "show", actor: "teddy" },
        { do: "object", target: "teddy", action: "wobble" }
      ],
      lines: [
        { speaker: "narrator", key: "g12.teddy.1" },
        { speaker: "narrator", key: "g12.teddy.2" }
      ],
      words: [
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "there", objectId: "teddy" }
      ],
      holdMs: 1200
    },
    {
      id: "your-turn",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "gesture", actor: "sheru", gesture: "sit" }
      ],
      lines: [
        { speaker: "narrator", key: "g12.your-turn.1" },
        { speaker: "narrator", key: "g12.your-turn.2" }
      ],
      words: [
        { wordId: "your-turn", objectId: "sheru" },
        { wordId: "find", objectId: "sheru" },
        { wordId: "woof", objectId: "sheru" }
      ],
      // A calm real-world search pause before the tap wait begins.
      holdMs: 12000,
      input: { type: "tap", targets: ["sheru"] },
      waitMs: 5000,
      caregiverPromptKey: "g12.tip.1",
      response: {
        stage: [
          { do: "gesture", actor: "sheru", gesture: "wag" },
          { do: "sfx", sound: "woof" }
        ],
        lines: [{ speaker: "narrator", key: "g12.your-turn.3" }],
        holdMs: 1200
      }
    },
    {
      id: "again",
      kind: "repeat",
      camera: "medium",
      stage: [
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [{ speaker: "narrator", key: "g12.again.1" }],
      words: [{ wordId: "find", objectId: "sheru" }],
      holdMs: 600,
      input: { type: "more-or-done", targets: ["sheru"] },
      waitMs: 5000,
      caregiverPromptKey: "g12.tip.2",
      response: {
        stage: [
          { do: "sfx", sound: "huff" },
          { do: "hide", actor: "ball" },
          { do: "hide", actor: "teddy" },
          { do: "object", target: "toy-box", action: "wobble" },
          { do: "gesture", actor: "sheru", gesture: "sit" }
        ],
        lines: [{ speaker: "narrator", key: "g12.again.2" }],
        holdMs: 800
      }
    }
  ],
  outro: [
    {
      id: "real",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [{ speaker: "narrator", key: "g12.real.1" }],
      holdMs: 1200
    },
    {
      id: "all-done",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "gesture", actor: "sheru", gesture: "wave" },
        { do: "sfx", sound: "woofSoft" }
      ],
      lines: [
        { speaker: "narrator", key: "g12.all-done.1" },
        { speaker: "narrator", key: "g12.all-done.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "sheru" },
        { wordId: "bye", objectId: "sheru" }
      ],
      holdMs: 2500
    }
  ]
};
