// G04 — Peekaboo Animal Barn (P2 activity, PRD 05 section 3, task I01). Peeko
// hosts at the Peekaboo Barn. One big door; three different animals behind it.
// Each round: "Open the door?" and a tap on the door (or the wait running out)
// opens it slowly ("Open!") and a cow, seen through the doorway, walks out to
// the left; the next beat names her and her sound ("A cow! Hi, cow!", "The cow
// says moo.") while the door closes; then the same for a duck (to the right)
// and a horse (stays in the doorway): three reveals. Peeko asks "More
// peekaboo?"; the animals walk back inside and the door closes. Reveals are
// slow and friendly: no jump, no loud sound, no surprise cut. At most three
// rounds; the outro opens the door and brings the animals out to wave bye.
// Words: open, hi (core) with peekaboo, look, door, big, cow/moo, duck/quack,
// horse/neigh, again, more, bye, all done.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "peekaboo-animal-barn",
  number: 4,
  version: 1,
  phase: "P2",
  titleKey: "g04.title",
  world: "peekaboo-barn",
  host: "peeko",
  // Peeko starts on the mark (a core spot, in view on every screen), so Peeko
  // is visible while saying "Peekaboo! Hi, friend!" ("hi" is a target word).
  // An entrance from offLeft takes longer than the line, which would play
  // off-screen.
  cast: [{ id: "peeko", at: "frontLeft" }],
  props: [
    { id: "door", asset: "door", at: "center", size: 1.6 },
    { id: "cow", asset: "cow", at: "back", hidden: true, size: 0.9 },
    { id: "duck", asset: "duck", at: "back", hidden: true, size: 0.45 },
    { id: "horse", asset: "horse", at: "back", hidden: true, size: 1 }
  ],
  targetWords: ["open", "hi"],
  supportWords: [
    "peekaboo", "look", "door", "big", "cow", "moo", "duck", "quack", "horse", "neigh",
    "again", "more", "bye", "all-done"
  ],
  music: "barnBed",
  offlinePlayKey: "g04.offline",
  caregiverBridgeKey: "g04.bridge",
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
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "peeko", key: "g04.hello.1" },
        { speaker: "peeko", key: "g04.hello.2" }
      ],
      words: [
        { wordId: "peekaboo", objectId: "peeko" },
        { wordId: "hi", objectId: "peeko" }
      ],
      holdMs: 1000
    },
    {
      id: "door",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "object", target: "door", action: "wobble" },
        { do: "sfx", sound: "rustle" },
        { do: "face", actor: "peeko", toward: "door" },
        { do: "gesture", actor: "peeko", gesture: "look" }
      ],
      reducedMotionStage: [
        { do: "object", target: "door", action: "glow" },
        { do: "sfx", sound: "rustle" },
        { do: "face", actor: "peeko", toward: "door" },
        { do: "gesture", actor: "peeko", gesture: "look" }
      ],
      lines: [
        { speaker: "peeko", key: "g04.door.1" },
        { speaker: "peeko", key: "g04.door.2" }
      ],
      words: [
        { wordId: "look", objectId: "door" },
        { wordId: "big", objectId: "door" },
        { wordId: "door", objectId: "door" }
      ],
      holdMs: 1500
    }
  ],
  round: [
    {
      id: "cow",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "hide", actor: "cow" },
        { do: "hide", actor: "duck" },
        { do: "hide", actor: "horse" },
        { do: "object", target: "door", action: "close" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "point" }
      ],
      lines: [{ speaker: "peeko", key: "g04.cow.1" }],
      words: [{ wordId: "open", objectId: "door" }],
      holdMs: 800,
      input: { type: "tap", targets: ["door"] },
      waitMs: 5000,
      caregiverPromptKey: "g04.tip.1",
      response: {
        // The door swings open on its left hinge (src/scenes/motion.ts) and the
        // cow, seen through the doorway, walks out to her place while it opens.
        // She never crosses the door's sweep while it closes in the next beat.
        stage: [
          { do: "object", target: "door", action: "open" },
          { do: "enter", actor: "cow", at: "left", from: "back", style: "walk" },
          { do: "face", actor: "peeko", toward: "door" }
        ],
        lines: [{ speaker: "peeko", key: "g04.cow.2" }],
        holdMs: 1200
      }
    },
    {
      id: "duck",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "moo" },
        { do: "object", target: "door", action: "close" },
        { do: "face", actor: "peeko", toward: "cow" }
      ],
      lines: [
        { speaker: "narrator", key: "g04.duck.1" },
        { speaker: "narrator", key: "g04.duck.2" },
        { speaker: "peeko", key: "g04.duck.3" }
      ],
      words: [
        { wordId: "cow", objectId: "cow" },
        { wordId: "hi", objectId: "cow" },
        { wordId: "moo", objectId: "cow" },
        { wordId: "open", objectId: "door" },
        { wordId: "again", objectId: "door" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["door"] },
      waitMs: 5000,
      caregiverPromptKey: "g04.tip.1",
      response: {
        stage: [
          { do: "object", target: "door", action: "open" },
          { do: "enter", actor: "duck", at: "right", from: "back", style: "walk" },
          { do: "face", actor: "peeko", toward: "door" }
        ],
        lines: [{ speaker: "peeko", key: "g04.duck.4" }],
        holdMs: 1200
      }
    },
    {
      id: "horse",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "quack" },
        { do: "object", target: "door", action: "close" },
        { do: "face", actor: "peeko", toward: "duck" }
      ],
      lines: [
        { speaker: "narrator", key: "g04.horse.1" },
        { speaker: "narrator", key: "g04.horse.2" },
        { speaker: "peeko", key: "g04.horse.3" }
      ],
      words: [
        { wordId: "duck", objectId: "duck" },
        { wordId: "hi", objectId: "duck" },
        { wordId: "quack", objectId: "duck" },
        { wordId: "open", objectId: "door" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["door"] },
      waitMs: 5000,
      caregiverPromptKey: "g04.tip.1",
      response: {
        stage: [
          { do: "object", target: "door", action: "open" },
          { do: "enter", actor: "horse", at: "center", from: "back", style: "walk" },
          { do: "face", actor: "peeko", toward: "door" }
        ],
        lines: [{ speaker: "peeko", key: "g04.horse.4" }],
        holdMs: 1200
      }
    },
    {
      id: "more",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "neigh" },
        { do: "object", target: "horse", action: "wobble" },
        { do: "face", actor: "peeko", toward: "horse" }
      ],
      lines: [
        { speaker: "narrator", key: "g04.more.1" },
        { speaker: "narrator", key: "g04.more.2" },
        { speaker: "peeko", key: "g04.more.3" }
      ],
      words: [
        { wordId: "horse", objectId: "horse" },
        { wordId: "hi", objectId: "horse" },
        { wordId: "neigh", objectId: "horse" },
        { wordId: "more", objectId: "door" },
        { wordId: "peekaboo", objectId: "peeko" }
      ],
      holdMs: 800,
      input: { type: "more-or-done", targets: ["door"] },
      waitMs: 5000,
      caregiverPromptKey: "g04.tip.2",
      response: {
        // Plays for "more" and for "done" alike: the animals walk back inside
        // (an exit to "back" ends in a soft shrink behind the door) and the door
        // closes, so the next round, or the goodbye that opens it again, starts
        // from a closed door with nobody in view.
        stage: [
          { do: "exit", actor: "cow", to: "back", style: "walk" },
          { do: "exit", actor: "duck", to: "back", style: "walk" },
          { do: "exit", actor: "horse", to: "back", style: "walk" },
          { do: "object", target: "door", action: "close" },
          { do: "gesture", actor: "peeko", gesture: "peek" }
        ],
        lines: [],
        holdMs: 1800
      }
    }
  ],
  outro: [
    {
      id: "goodbye",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "object", target: "door", action: "open" },
        { do: "enter", actor: "cow", at: "left", from: "back", style: "walk" },
        { do: "enter", actor: "duck", at: "right", from: "back", style: "walk" },
        { do: "enter", actor: "horse", at: "center", from: "back", style: "walk" },
        { do: "face", actor: "peeko", toward: "viewer" }
      ],
      lines: [
        { speaker: "peeko", key: "g04.goodbye.1" },
        { speaker: "narrator", key: "g04.goodbye.2" }
      ],
      words: [
        { wordId: "bye", objectId: "cow" },
        { wordId: "bye", objectId: "duck" },
        { wordId: "bye", objectId: "horse" }
      ],
      holdMs: 1500
    },
    {
      id: "bye",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "peeko", key: "g04.bye.1" },
        { speaker: "peeko", key: "g04.bye.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "peeko" },
        { wordId: "bye", objectId: "peeko" }
      ],
      holdMs: 3000
    }
  ]
};
