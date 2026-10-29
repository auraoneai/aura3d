// E08 — Where's Sheru? (P2, PRD 05 E08 / 04 H04). Momo and Sheru play hide
// and seek at home. A soft woof comes from under the table, but Momo looks
// under the box, then under the bench, before the child's turn leads him to
// the table: "There! There is Sheru!" In the second round the child watches
// Sheru go back under the table while Momo hides his eyes, then shows Momo
// where. (The table, not the bench: the stage stands an actor at a surface's
// own spot, and only the table top is higher than Sheru, so he fits under it
// with his head peeking out instead of poking through the bench seat.)
// Then Sheru plays on with the open toy box: he hops in it ("in") and steps
// out behind it, his head showing over the top ("behind"), for a peekaboo.
//
// Layout: the toy box stands front left and the bench back left, so both
// stay in view on portrait phones (farLeft does not), and the spot right
// behind the box (left) is free for Sheru. Momo looks under the box from
// beside it and at the bench from the middle. Sheru hops along the front row
// into the box and steps back behind it, so he never crosses Momo.
//
// Six-beat blueprint (PRD 01 section 5): greeting (hello song, then hi), hook
// ("Where is Sheru?" and the woof), explore (under the box, under the bench:
// two attempts), child turns (the table; then the table again, where Sheru
// stays in view), resolution (Sheru comes out, in and behind the box, a
// peekaboo) + the allDone song, natural ending. The allDone song is used
// rather than "peekaboo" because the peekaboo lyrics sing about a door and
// this scene has none; Momo and Sheru perform it (sway, then wave bye-bye).
//
// Gentle and predictable by design: the woof always comes from where Sheru
// is, the child is never told a spot is wrong (Momo's own looks find nothing,
// the child's turn always leads to Sheru), reveals are slow, Sheru only barks,
// and every wait continues by itself. Sheru's reactions come from his bark
// bank (a soft woof from under the table, a woof, a happy double woof when he
// is found, a yip from the box), one at a time, in beats without speech.
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
    { id: "bench", asset: "bench", at: "backLeft", size: 0.75 },
    { id: "box", asset: "toyBox", at: "frontLeft", size: 0.6 }
  ],
  targetWords: ["where", "under", "there"],
  supportWords: ["look", "box", "woof", "again", "out", "in", "behind", "peekaboo", "hi", "bye", "all-done"],
  music: "homeBed",
  offlinePlayKey: "e08.offline",
  caregiverBridgeKey: "e08.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 125,
  beats: [
    {
      id: "hello",
      kind: "greeting",
      camera: "wide",
      // Momo walks in during the hello song and performs it (named, since he is
      // still off stage when it starts).
      stage: [
        { do: "music", bed: "homeBed" },
        { do: "song", song: "hello", performers: ["momo"] },
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
      holdMs: 2000
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
      holdMs: 3000
    },
    {
      // The hook (05 E08): a soft woof from beneath the table.
      id: "woof",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "woofSoft" },
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
      // Momo steps over to stand beside the box (front, just right of it) and
      // lifts it to look under it. Not behind it: the raised box would hide
      // his face while he talks.
      id: "box",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "move", actor: "momo", to: "front", style: "walk" },
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
      holdMs: 2500
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
      holdMs: 2500
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
      holdMs: 3000
    },
    {
      // Found: a happy double woof.
      id: "sheru-woof",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "woofDouble" },
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
      holdMs: 2500
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
      holdMs: 2000
    },
    {
      // "In": Sheru hops along the front row, in front of Momo, into the open
      // toy box, where his head shows over the top.
      id: "in-box",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "move", actor: "sheru", to: "frontLeft", style: "hop" },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "face", actor: "momo", toward: "box" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      reducedMotionStage: [
        { do: "move", actor: "sheru", to: "frontLeft", style: "walk" },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "face", actor: "momo", toward: "box" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "narrator", key: "e08.in-box.1" },
        { speaker: "momo", key: "e08.in-box.2" }
      ],
      words: [
        { wordId: "in", objectId: "box" },
        { wordId: "box", objectId: "box" }
      ],
      holdMs: 1000
    },
    {
      // A happy yip from inside the box, which wiggles; no speech over it.
      id: "box-yip",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "yip" },
        { do: "object", target: "box", action: "wobble" },
        { do: "gesture", actor: "sheru", gesture: "happy" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "yip" },
        { do: "object", target: "box", action: "wobble" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [],
      holdMs: 1500
    },
    {
      // "Behind": Sheru steps back out of the box to the spot right behind it;
      // the box hides his legs and body, and his head shows over the top.
      id: "behind-box",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "move", actor: "sheru", to: "left", style: "walk" },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "face", actor: "momo", toward: "box" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "narrator", key: "e08.behind-box.1" },
        { speaker: "momo", key: "e08.behind-box.2" }
      ],
      words: [{ wordId: "behind", objectId: "box" }],
      holdMs: 1000
    },
    {
      // Peekaboo: Sheru pops up from behind the box.
      id: "peekaboo",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "peek" },
        { do: "gesture", actor: "sheru", gesture: "hop" }
      ],
      lines: [{ speaker: "momo", key: "e08.peekaboo.1" }],
      words: [{ wordId: "peekaboo", objectId: "momo" }],
      holdMs: 2000,
      caregiverPromptKey: "e08.tip.3"
    },
    {
      // Momo and Sheru are the song's default performers: they sway, then wave
      // bye-bye on "time to wave bye-bye" and "bye-bye for now" (Sheru waves
      // with his tail). No looping gesture of the beat's own fights them.
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "allDone" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "sheru", toward: "viewer" }
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
