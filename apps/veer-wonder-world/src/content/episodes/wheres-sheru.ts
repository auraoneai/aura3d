// E08 — Where's Sheru? (P2, PRD 05 E08 / 04 H04). Momo and Sheru play hide
// and seek at home. A soft woof comes from under the table, but Momo looks
// under the box, then under the bench, before the child's turn leads him to
// the table: "There! There is Sheru!" In the second round the child watches
// Sheru go back under the table while Momo hides his eyes, then shows Momo
// where. (The table, not the bench: the stage stands an actor at a surface's
// own spot, and only the table top is higher than Sheru, so he fits under it
// with his head peeking out instead of poking through the bench seat.)
//
// Six-beat blueprint (PRD 01 section 5): greeting (hello song, then hi), hook
// ("Where is Sheru?" and the woof), explore (under the box, under the bench:
// two attempts), child turns (the table; then the table again, where Sheru
// stays in view), resolution (Sheru comes out, a peekaboo) + the allDone song, natural
// ending. The allDone song is used rather than "peekaboo" because the
// peekaboo lyrics sing about a door and this scene has none.
//
// Gentle and predictable by design: the woof always comes from where Sheru
// is, the child is never told a spot is wrong (Momo's own looks find nothing,
// the child's turn always leads to Sheru), reveals are slow, Sheru only barks,
// and every wait continues by itself. Woofs play in beats without speech.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "wheres-sheru",
  number: 8,
  version: 1,
  phase: "P2",
  titleKey: "e08.title",
  world: "home-nook",
  host: "sheru",
  cast: [
    { id: "momo", at: "offLeft" },
    { id: "sheru", at: "right", hidden: true }
  ],
  props: [
    { id: "table", asset: "table", at: "right", size: 0.85 },
    { id: "bench", asset: "bench", at: "left", size: 0.75 },
    { id: "box", asset: "toyBox", at: "farLeft", size: 0.6 }
  ],
  targetWords: ["where", "under", "there"],
  supportWords: ["look", "box", "woof", "again", "out", "peekaboo", "hi", "bye", "all-done"],
  music: "homeBed",
  offlinePlayKey: "e08.offline",
  caregiverBridgeKey: "e08.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 127,
  beats: [
    {
      id: "hello",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "homeBed" },
        { do: "song", song: "hello" },
        { do: "enter", actor: "momo", at: "center", from: "offLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [],
      holdMs: 11000
    },
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e08.greet.1" },
        { speaker: "momo", key: "e08.greet.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 1000
    },
    {
      id: "where",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "momo", key: "e08.where.1" },
        { speaker: "momo", key: "e08.where.2" }
      ],
      words: [{ wordId: "where", objectId: "momo" }],
      holdMs: 2000
    },
    {
      id: "woof",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "woof" },
        { do: "object", target: "table", action: "wobble" }
      ],
      lines: [],
      holdMs: 1500
    },
    {
      id: "clue",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "box" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e08.clue.1" },
        { speaker: "momo", key: "e08.clue.2" }
      ],
      words: [
        { wordId: "woof", objectId: "table" },
        { wordId: "under", objectId: "box" }
      ],
      holdMs: 1500
    },
    {
      id: "box",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "move", actor: "momo", to: "frontLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "box" },
        { do: "object", target: "box", action: "up" },
        { do: "gesture", actor: "momo", gesture: "peek" }
      ],
      lines: [
        { speaker: "narrator", key: "e08.box.1" },
        { speaker: "momo", key: "e08.box.2" }
      ],
      words: [
        { wordId: "look", objectId: "box" },
        { wordId: "under", objectId: "box" },
        { wordId: "box", objectId: "box" }
      ],
      holdMs: 1500
    },
    {
      id: "bench",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "object", target: "box", action: "down" },
        { do: "move", actor: "momo", to: "center", style: "walk" },
        { do: "face", actor: "momo", toward: "bench" },
        { do: "gesture", actor: "momo", gesture: "peek" }
      ],
      lines: [
        { speaker: "momo", key: "e08.bench.1" },
        { speaker: "narrator", key: "e08.bench.2" }
      ],
      words: [{ wordId: "under", objectId: "bench" }],
      holdMs: 1500
    },
    {
      id: "woof-2",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "woof" },
        { do: "object", target: "table", action: "wobble" },
        { do: "gesture", actor: "momo", gesture: "freeze" }
      ],
      lines: [],
      holdMs: 1500
    },
    {
      id: "invite",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "shrug" },
        { do: "object", target: "table", action: "glow" }
      ],
      lines: [{ speaker: "momo", key: "e08.invite.1" }],
      words: [
        { wordId: "where", objectId: "momo" },
        { wordId: "under", objectId: "table" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["table"] },
      waitMs: 5000,
      caregiverPromptKey: "e08.tip.1",
      response: {
        stage: [
          { do: "face", actor: "momo", toward: "table" },
          { do: "gesture", actor: "momo", gesture: "point" },
          { do: "object", target: "table", action: "wobble" }
        ],
        lines: [{ speaker: "momo", key: "e08.invite.2" }],
        holdMs: 1000
      }
    },
    {
      id: "found",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "show", actor: "sheru" },
        { do: "move", actor: "sheru", to: "frontRight", style: "hop" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "face", actor: "momo", toward: "sheru" },
        { do: "gesture", actor: "momo", gesture: "cheer" }
      ],
      reducedMotionStage: [
        { do: "show", actor: "sheru" },
        { do: "move", actor: "sheru", to: "frontRight", style: "walk" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "face", actor: "momo", toward: "sheru" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e08.found.1" },
        { speaker: "narrator", key: "e08.found.2" }
      ],
      words: [
        { wordId: "there", objectId: "sheru" },
        { wordId: "under", objectId: "table" }
      ],
      holdMs: 2000
    },
    {
      id: "sheru-woof",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "woof" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [],
      holdMs: 1500
    },
    {
      id: "hi-sheru",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "sheru", toward: "momo" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e08.hi-sheru.1" },
        { speaker: "narrator", key: "e08.hi-sheru.2" }
      ],
      words: [{ wordId: "hi", objectId: "sheru" }],
      holdMs: 1500
    },
    {
      id: "eyes",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "hide" }
      ],
      lines: [
        { speaker: "momo", key: "e08.eyes.1" },
        { speaker: "narrator", key: "e08.eyes.2" }
      ],
      words: [{ wordId: "again", objectId: "momo" }],
      holdMs: 1500
    },
    {
      id: "sneak",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "move", actor: "sheru", to: "right", style: "walk" },
        { do: "face", actor: "sheru", toward: "viewer" }
      ],
      lines: [
        { speaker: "narrator", key: "e08.sneak.1" },
        { speaker: "momo", key: "e08.sneak.2" }
      ],
      words: [{ wordId: "under", objectId: "table" }],
      holdMs: 1500
    },
    {
      id: "invite-2",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" },
        { do: "object", target: "table", action: "glow" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [{ speaker: "momo", key: "e08.invite-2.1" }],
      words: [
        { wordId: "where", objectId: "momo" },
        { wordId: "there", objectId: "sheru" },
        { wordId: "under", objectId: "table" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["sheru", "table"] },
      waitMs: 5000,
      caregiverPromptKey: "e08.tip.2",
      response: {
        stage: [
          { do: "face", actor: "momo", toward: "sheru" },
          { do: "gesture", actor: "momo", gesture: "point" },
          { do: "gesture", actor: "sheru", gesture: "wag" }
        ],
        lines: [{ speaker: "momo", key: "e08.invite-2.2" }],
        holdMs: 1500
      }
    },
    {
      id: "come",
      kind: "event",
      camera: "wide",
      // Straight out from under the table to frontRight. Not front: there
      // Sheru would stand right in front of Momo (center) and hide him for
      // the peekaboo, the song and the outro.
      stage: [
        { do: "move", actor: "sheru", to: "frontRight", style: "hop" },
        { do: "face", actor: "momo", toward: "sheru" },
        { do: "gesture", actor: "momo", gesture: "cheer" }
      ],
      reducedMotionStage: [
        { do: "move", actor: "sheru", to: "frontRight", style: "walk" },
        { do: "face", actor: "momo", toward: "sheru" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "narrator", key: "e08.come.1" },
        { speaker: "momo", key: "e08.come.2" }
      ],
      words: [
        { wordId: "out", objectId: "sheru" },
        { wordId: "there", objectId: "sheru" }
      ],
      holdMs: 1000
    },
    {
      id: "peekaboo",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "peek" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [{ speaker: "momo", key: "e08.peekaboo.1" }],
      words: [{ wordId: "peekaboo", objectId: "momo" }],
      holdMs: 1000,
      caregiverPromptKey: "e08.tip.3"
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "allDone" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "gesture", actor: "sheru", gesture: "wag", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "allDone" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [],
      holdMs: 11000
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [
        { speaker: "momo", key: "e08.outro.1" },
        { speaker: "momo", key: "e08.outro.2" },
        { speaker: "narrator", key: "e08.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "sheru" }
      ],
      holdMs: 3000
    }
  ]
};
