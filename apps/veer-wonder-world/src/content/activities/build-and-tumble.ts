// G08 — Build and Tumble (P2 activity, PRD 05 section 3, task I05). Lumi
// conjures three big blocks in the Learning Cloud and the tower grows one
// block at a time; a tap on the tower makes it tumble gently ("Uh-oh! Down!").
//
// Counting is one-to-one (PRD 01 section 3.3, PRD 05 G08): each number is
// spoken in its own line, in the same beat that shows its block, with exactly
// that many blocks visible. Responses never change which blocks are visible.
// The first round beat resets the tower (blocks two and three hide, block one
// is stacked again), so every round counts one, two, three from the start.
//
// Stage contract used here: `object ... stack` places a block on top of the
// blocks already stacked at its spot; `object ... topple` tips it over gently
// and leaves it visible on the floor.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "build-and-tumble",
  number: 8,
  version: 1,
  phase: "P2",
  titleKey: "g08.title",
  world: "learning-cloud",
  host: "lumi",
  cast: [{ id: "lumi", at: "offTop" }],
  props: [
    { id: "block-1", asset: "toyBlock", at: "center", hidden: true, tint: "#E8504A", size: 0.45 },
    { id: "block-2", asset: "toyBlock", at: "center", hidden: true, tint: "#4A8FE8", size: 0.45 },
    { id: "block-3", asset: "toyBlock", at: "center", hidden: true, tint: "#F2C94C", size: 0.45 }
  ],
  targetWords: ["block", "up", "down"],
  supportWords: ["one", "two", "three", "more", "again", "look", "uh-oh", "hello", "bye", "all-done"],
  music: "cloudBed",
  offlinePlayKey: "g08.offline",
  caregiverBridgeKey: "g08.bridge",
  numberConcept: { countMin: 1, countMax: 3, countedObjectIds: ["block-1", "block-2", "block-3"] },
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
        { do: "music", bed: "cloudBed" },
        { do: "enter", actor: "lumi", at: "highLeft", from: "offTop", style: "float" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "wave" }
      ],
      lines: [
        { speaker: "lumi", key: "g08.hello.1" },
        { speaker: "lumi", key: "g08.hello.2" }
      ],
      words: [{ wordId: "hello", objectId: "lumi" }],
      holdMs: 1000
    }
  ],
  round: [
    {
      id: "one",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "hide", actor: "block-2" },
        { do: "hide", actor: "block-3" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "show", actor: "block-1" },
        { do: "object", target: "block-1", action: "stack" },
        { do: "sfx", sound: "clack" }
      ],
      lines: [
        { speaker: "lumi", key: "g08.one.1" },
        { speaker: "lumi", key: "g08.one.2" },
        { speaker: "lumi", key: "g08.one.3" }
      ],
      words: [
        { wordId: "look", objectId: "block-1" },
        { wordId: "one", objectId: "block-1" },
        { wordId: "block", objectId: "block-1" },
        { wordId: "more", objectId: "block-1" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["block-1"] },
      waitMs: 5000,
      caregiverPromptKey: "g08.tip.1",
      response: {
        stage: [
          { do: "gesture", actor: "lumi", gesture: "glow" },
          { do: "sfx", sound: "sparkle" }
        ],
        lines: [{ speaker: "lumi", key: "g08.one.4" }],
        holdMs: 600
      }
    },
    {
      id: "two",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "show", actor: "block-2" },
        { do: "object", target: "block-2", action: "stack" },
        { do: "sfx", sound: "clack" }
      ],
      lines: [
        { speaker: "lumi", key: "g08.two.1" },
        { speaker: "lumi", key: "g08.two.2" },
        { speaker: "lumi", key: "g08.two.3" }
      ],
      words: [
        { wordId: "up", objectId: "block-2" },
        { wordId: "two", objectId: "block-2" },
        { wordId: "block", objectId: "block-2" },
        { wordId: "more", objectId: "block-2" }
      ],
      holdMs: 800,
      input: { type: "tap", targets: ["block-1", "block-2"] },
      waitMs: 5000,
      caregiverPromptKey: "g08.tip.1",
      response: {
        stage: [
          { do: "gesture", actor: "lumi", gesture: "glow" },
          { do: "sfx", sound: "sparkle" }
        ],
        lines: [{ speaker: "lumi", key: "g08.two.4" }],
        holdMs: 600
      }
    },
    {
      id: "three",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "show", actor: "block-3" },
        { do: "object", target: "block-3", action: "stack" },
        { do: "sfx", sound: "clack" }
      ],
      lines: [
        { speaker: "lumi", key: "g08.three.1" },
        { speaker: "lumi", key: "g08.three.2" },
        { speaker: "lumi", key: "g08.three.3" }
      ],
      words: [
        { wordId: "up", objectId: "block-3" },
        { wordId: "three", objectId: "block-3" },
        { wordId: "block", objectId: "block-3" },
        { wordId: "uh-oh", objectId: "block-3" },
        { wordId: "down", objectId: "block-3" }
      ],
      holdMs: 1000,
      input: { type: "tap", targets: ["block-2", "block-3"] },
      waitMs: 5000,
      caregiverPromptKey: "g08.tip.2",
      response: {
        stage: [
          { do: "object", target: "block-3", action: "topple" },
          { do: "object", target: "block-2", action: "topple" },
          { do: "object", target: "block-1", action: "topple" },
          { do: "sfx", sound: "tumble" },
          { do: "gesture", actor: "lumi", gesture: "happy" }
        ],
        lines: [
          { speaker: "lumi", key: "g08.three.4" },
          { speaker: "narrator", key: "g08.three.5" }
        ],
        holdMs: 1500
      }
    },
    {
      id: "again",
      kind: "repeat",
      camera: "medium",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "float" }
      ],
      lines: [{ speaker: "lumi", key: "g08.again.1" }],
      words: [{ wordId: "again", objectId: "lumi" }],
      holdMs: 600,
      input: { type: "more-or-done", targets: ["block-1", "block-2"] },
      waitMs: 5000,
      caregiverPromptKey: "g08.tip.3",
      response: {
        stage: [{ do: "gesture", actor: "lumi", gesture: "nod" }],
        lines: [],
        holdMs: 600
      }
    }
  ],
  outro: [
    {
      id: "real",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "object", target: "block-1", action: "wobble" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      lines: [{ speaker: "lumi", key: "g08.real.1" }],
      words: [{ wordId: "block", objectId: "block-1" }],
      holdMs: 1000
    },
    {
      id: "bye",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "wave" }
      ],
      lines: [
        { speaker: "lumi", key: "g08.bye.1" },
        { speaker: "lumi", key: "g08.bye.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "lumi" },
        { wordId: "bye", objectId: "lumi" }
      ],
      holdMs: 2500
    }
  ]
};
