// E18 — Who's at the Door? (P2). Momo and Peeko are at home in the Home Nook.
// A soft doorbell rings and familiar cartoon friends visit: Lulu first, then
// (on the child's turn) Sheru. Everyone sings hello, then the visitors wave
// bye and leave gently through the door.
//
// Privacy: generic friends only. No family names, voices, photos or "Mama/
// Papa" lines; nothing here can be personalised. No camera, no microphone.
// Safety: the bell is soft and gets its own beat with no lines, so the ring is
// heard on its own; doors open slowly, and every visitor is a familiar friend.
// Visitors wait hidden in the doorway (same spot as the door) until it opens.
// Sheru never speaks: he comes in with a woof, sniffs Peeko (a soft sniffing
// sound) and leaves with a tiny happy "aroo", one bark-bank sound at a time.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "whos-at-the-door",
  number: 18,
  version: 1,
  phase: "P2",
  titleKey: "e18.title",
  world: "home-nook",
  host: "peeko",
  cast: [
    { id: "momo", at: "offLeft" },
    { id: "peeko", at: "offLeft" },
    { id: "lulu", at: "back", hidden: true },
    { id: "sheru", at: "back", hidden: true }
  ],
  props: [{ id: "door", asset: "door", at: "back", size: 1.6 }],
  targetWords: ["hi", "bye"],
  supportWords: ["door", "open", "hello", "woof", "wave", "out", "all-done"],
  music: "homeBed",
  offlinePlayKey: "e18.offline",
  caregiverBridgeKey: "e18.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 124,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "homeBed" },
        { do: "enter", actor: "momo", at: "left", from: "offLeft", style: "walk" },
        { do: "enter", actor: "peeko", at: "frontLeft", from: "offLeft", style: "hop" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      reducedMotionStage: [
        { do: "music", bed: "homeBed" },
        { do: "enter", actor: "momo", at: "left", from: "offLeft", style: "walk" },
        { do: "enter", actor: "peeko", at: "frontLeft", from: "offLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e18.greet.1" },
        { speaker: "peeko", key: "e18.greet.2" }
      ],
      words: [
        { wordId: "hi", objectId: "momo" },
        { wordId: "hi", objectId: "peeko" }
      ],
      holdMs: 5000
    },
    {
      // A soft doorbell, heard on its own; the door wiggles gently.
      id: "bell",
      kind: "hook",
      stage: [
        { do: "sfx", sound: "doorbell" },
        { do: "object", target: "door", action: "wobble" },
        { do: "face", actor: "momo", toward: "door" },
        { do: "face", actor: "peeko", toward: "door" }
      ],
      lines: [],
      holdMs: 4500
    },
    {
      id: "who",
      kind: "hook",
      stage: [
        { do: "gesture", actor: "peeko", gesture: "peek" },
        { do: "move", actor: "momo", to: "backLeft", style: "walk" }
      ],
      lines: [
        { speaker: "narrator", key: "e18.who.1" },
        { speaker: "momo", key: "e18.who.2" },
        { speaker: "peeko", key: "e18.who.3" },
        { speaker: "narrator", key: "e18.who.4" }
      ],
      words: [{ wordId: "door", objectId: "door" }],
      holdMs: 4500
    },
    {
      // First visitor: the door opens slowly and Lulu is standing there.
      id: "open-lulu",
      kind: "model",
      stage: [
        { do: "object", target: "door", action: "open" },
        { do: "sfx", sound: "doorOpen" },
        { do: "show", actor: "lulu" },
        { do: "face", actor: "lulu", toward: "momo" },
        { do: "gesture", actor: "lulu", gesture: "wave" }
      ],
      lines: [
        { speaker: "narrator", key: "e18.open-lulu.1" },
        { speaker: "lulu", key: "e18.open-lulu.2" },
        { speaker: "momo", key: "e18.open-lulu.3" }
      ],
      words: [
        { wordId: "door", objectId: "door" },
        { wordId: "hello", objectId: "lulu" },
        { wordId: "hi", objectId: "lulu" }
      ],
      holdMs: 4500
    },
    {
      id: "lulu-in",
      kind: "event",
      stage: [
        { do: "move", actor: "lulu", to: "right", style: "walk" },
        { do: "move", actor: "momo", to: "left", style: "walk" },
        { do: "face", actor: "peeko", toward: "lulu" }
      ],
      lines: [
        { speaker: "narrator", key: "e18.lulu-in.1" },
        { speaker: "peeko", key: "e18.lulu-in.2" }
      ],
      words: [{ wordId: "hi", objectId: "lulu" }],
      holdMs: 4000
    },
    {
      id: "lulu-hi",
      kind: "event",
      stage: [
        { do: "object", target: "door", action: "close" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" }
      ],
      lines: [
        { speaker: "lulu", key: "e18.lulu-hi.1" },
        { speaker: "narrator", key: "e18.lulu-hi.2" }
      ],
      words: [
        { wordId: "hi", objectId: "peeko" },
        { wordId: "door", objectId: "door" }
      ],
      holdMs: 4000
    },
    {
      // The bell again, heard on its own.
      id: "bell-2",
      kind: "event",
      stage: [
        { do: "sfx", sound: "doorbell" },
        { do: "object", target: "door", action: "wobble" },
        { do: "face", actor: "momo", toward: "door" },
        { do: "face", actor: "peeko", toward: "door" },
        { do: "face", actor: "lulu", toward: "door" }
      ],
      lines: [],
      holdMs: 4500
    },
    {
      // Child turn: tap the door (or the caregiver confirms). Silence opens it too.
      id: "door-invite",
      kind: "invite",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" },
        { do: "object", target: "door", action: "glow" }
      ],
      lines: [
        { speaker: "momo", key: "e18.door-invite.1" },
        { speaker: "peeko", key: "e18.door-invite.2" }
      ],
      holdMs: 1500,
      input: { type: "tap", targets: ["door"] },
      waitMs: 5000,
      caregiverPromptKey: "e18.tip.1",
      response: {
        stage: [
          { do: "object", target: "door", action: "open" },
          { do: "sfx", sound: "doorOpen" },
          { do: "show", actor: "sheru" },
          { do: "gesture", actor: "sheru", gesture: "wag" }
        ],
        lines: [
          { speaker: "narrator", key: "e18.door-invite.3" },
          { speaker: "momo", key: "e18.door-invite.4" }
        ],
        holdMs: 2500
      },
      words: [
        { wordId: "door", objectId: "door" },
        { wordId: "open", objectId: "door" }
      ]
    },
    {
      // Sheru trots in to say hi to Peeko (the stage stops him right beside her,
      // so the sniff that follows reaches her).
      id: "sheru-in",
      kind: "event",
      stage: [
        { do: "sfx", sound: "woof" },
        { do: "move", actor: "sheru", to: "frontLeft", style: "walk" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "face", actor: "peeko", toward: "sheru" }
      ],
      lines: [
        { speaker: "narrator", key: "e18.sheru-in.1" },
        { speaker: "peeko", key: "e18.sheru-in.2" }
      ],
      words: [
        { wordId: "woof", objectId: "sheru" },
        { wordId: "hi", objectId: "sheru" }
      ],
      holdMs: 4000
    },
    {
      // Gentle humour: Sheru sniffs Peeko (a soft sniffing sound), who giggles.
      id: "sniff",
      kind: "event",
      stage: [
        { do: "sfx", sound: "sniffs" },
        { do: "object", target: "door", action: "close" },
        { do: "face", actor: "sheru", toward: "peeko" },
        { do: "gesture", actor: "sheru", gesture: "sniff" },
        { do: "gesture", actor: "peeko", gesture: "happy" }
      ],
      lines: [
        { speaker: "narrator", key: "e18.sniff.1" },
        { speaker: "peeko", key: "e18.sniff.2" },
        { speaker: "momo", key: "e18.sniff.3" }
      ],
      words: [{ wordId: "hello", objectId: "momo" }],
      holdMs: 3500
    },
    {
      // All four friends are on stage, so all four are the song's default
      // performers: they wave on "Hello, hello," hop on "hi, hi, hi!" (a nod
      // in reduced motion) and wave on "Wave hello, friend!" (Sheru waves
      // with his tail). No looping gesture of the beat's own fights them.
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "hello" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "face", actor: "sheru", toward: "viewer" }
      ],
      lines: [],
      holdMs: 12000
    },
    {
      // Child turn: wave bye to a visitor. Any tap (or none) gets the same goodbye.
      id: "bye-invite",
      kind: "invite",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "face", actor: "sheru", toward: "viewer" }
      ],
      lines: [
        { speaker: "narrator", key: "e18.bye-invite.1" },
        { speaker: "momo", key: "e18.bye-invite.2" }
      ],
      holdMs: 1500,
      input: { type: "tap", targets: ["lulu", "sheru"] },
      waitMs: 5000,
      caregiverPromptKey: "e18.tip.2",
      response: {
        stage: [
          { do: "gesture", actor: "lulu", gesture: "wave" },
          { do: "gesture", actor: "sheru", gesture: "wag" },
          { do: "gesture", actor: "momo", gesture: "wave" },
          { do: "gesture", actor: "peeko", gesture: "wave" }
        ],
        lines: [
          { speaker: "lulu", key: "e18.bye-invite.3" },
          { speaker: "momo", key: "e18.bye-invite.4" }
        ],
        holdMs: 2500
      },
      words: [
        { wordId: "wave", objectId: "momo" },
        { wordId: "bye", objectId: "momo" },
        { wordId: "bye", objectId: "lulu" },
        { wordId: "bye", objectId: "sheru" }
      ]
    },
    {
      // The visitors walk slowly back out through the open door, Sheru with a
      // tiny happy "aroo" goodbye. Sheru goes first into the doorway and Lulu
      // stops beside him on the right, away from the door's hinge side, so
      // nobody walks into the open door.
      id: "leave",
      kind: "event",
      stage: [
        { do: "sfx", sound: "aroo" },
        { do: "object", target: "door", action: "open" },
        { do: "move", actor: "sheru", to: "back", style: "walk" },
        { do: "move", actor: "lulu", to: "back", style: "walk" },
        { do: "face", actor: "peeko", toward: "door" }
      ],
      lines: [
        { speaker: "narrator", key: "e18.leave.1" },
        { speaker: "peeko", key: "e18.leave.2" }
      ],
      words: [
        { wordId: "out", objectId: "door" },
        { wordId: "door", objectId: "door" },
        { wordId: "bye", objectId: "peeko" }
      ],
      holdMs: 4500
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "hide", actor: "lulu" },
        { do: "hide", actor: "sheru" },
        { do: "object", target: "door", action: "close" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e18.outro.1" },
        { speaker: "peeko", key: "e18.outro.2" },
        { speaker: "momo", key: "e18.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "peeko" }
      ],
      holdMs: 6000
    }
  ]
};
