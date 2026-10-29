// E10 — Momo's Hungry Belly (P2, PRD 05 E10 / 04 H05). Momo's tummy rumbles
// on a sunny picnic day. He opens the picnic basket, finds an apple and a
// banana, points, names each one and takes a pretend bite. The child picks a
// food for Momo, he has a little more, and then he stops because his tummy is
// happy: "All done!"
//
// Six-beat blueprint (PRD 01 section 5): greeting (hello song, then hi), hook
// (the rumble, the basket), explore (apple, then banana: two attempts), child
// turns (apple or banana; more?), resolution + song (a happy tummy, allDone),
// natural ending.
//
// Food is pretend toy food and stays whole (no object is eaten away); every
// bite is Momo's own pretend bite. Momo stops when he feels full, nobody is
// told to eat, and nothing mentions body size or shape. Either food is a good
// pick and the caregiver tip asks the adult to name the child's choice.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "momos-hungry-belly",
  number: 10,
  version: 1,
  phase: "P2",
  titleKey: "e10.title",
  world: "meadow",
  host: "momo",
  cast: [{ id: "momo", at: "offLeft" }],
  // The apple and the banana wait hidden inside the basket (a container on the
  // same spot) and hop out to either side when Momo finds them.
  props: [
    { id: "basket", asset: "picnicBasket", at: "front", size: 0.5 },
    { id: "apple", asset: "apple", at: "front", hidden: true, size: 0.38 },
    { id: "banana", asset: "banana", at: "front", hidden: true, size: 0.38 }
  ],
  targetWords: ["apple", "banana", "eat"],
  supportWords: ["tummy", "picnic", "open", "mmm", "more", "thank-you", "hi", "bye", "all-done"],
  music: "meadowBed",
  offlinePlayKey: "e10.offline",
  caregiverBridgeKey: "e10.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 129,
  beats: [
    {
      id: "hello",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "meadowBed" },
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
        { speaker: "momo", key: "e10.greet.1" },
        { speaker: "narrator", key: "e10.greet.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 1500
    },
    {
      id: "rumble",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "rumble" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [],
      holdMs: 2000
    },
    {
      id: "tummy",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "shrug" }
      ],
      lines: [
        { speaker: "momo", key: "e10.tummy.1" },
        { speaker: "momo", key: "e10.tummy.2" }
      ],
      words: [{ wordId: "tummy", objectId: "momo" }],
      holdMs: 1500
    },
    {
      id: "basket",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "basket" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "basket", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e10.basket.1" },
        { speaker: "momo", key: "e10.basket.2" }
      ],
      words: [{ wordId: "picnic", objectId: "basket" }],
      holdMs: 1500
    },
    {
      id: "sniff",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "basket" },
        { do: "gesture", actor: "momo", gesture: "sniff" }
      ],
      lines: [
        { speaker: "momo", key: "e10.sniff.1" },
        { speaker: "momo", key: "e10.sniff.2" }
      ],
      holdMs: 1000
    },
    {
      id: "open",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "object", target: "basket", action: "open" },
        { do: "sfx", sound: "rustle" },
        { do: "gesture", actor: "momo", gesture: "pickUp" }
      ],
      lines: [
        { speaker: "narrator", key: "e10.open.1" },
        { speaker: "momo", key: "e10.open.2" }
      ],
      words: [{ wordId: "open", objectId: "basket" }],
      holdMs: 1500
    },
    {
      id: "apple",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "show", actor: "apple" },
        { do: "move", actor: "apple", to: "frontLeft", style: "hop" },
        { do: "move", actor: "momo", to: "left", style: "walk" },
        { do: "face", actor: "momo", toward: "apple" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e10.apple.1" },
        { speaker: "narrator", key: "e10.apple.2" }
      ],
      words: [{ wordId: "apple", objectId: "apple" }],
      holdMs: 1500
    },
    {
      id: "eat-apple",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "apple" },
        { do: "gesture", actor: "momo", gesture: "eat" },
        { do: "sfx", sound: "munch" }
      ],
      lines: [
        { speaker: "narrator", key: "e10.eat-apple.1" },
        { speaker: "momo", key: "e10.eat-apple.2" }
      ],
      words: [
        { wordId: "eat", objectId: "momo" },
        { wordId: "mmm", objectId: "momo" },
        { wordId: "apple", objectId: "apple" }
      ],
      holdMs: 1500
    },
    {
      id: "banana",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "show", actor: "banana" },
        { do: "move", actor: "banana", to: "frontRight", style: "hop" },
        { do: "move", actor: "momo", to: "right", style: "walk" },
        { do: "face", actor: "momo", toward: "banana" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e10.banana.1" },
        { speaker: "narrator", key: "e10.banana.2" }
      ],
      words: [{ wordId: "banana", objectId: "banana" }],
      holdMs: 1500
    },
    {
      id: "eat-banana",
      kind: "repeat",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "banana" },
        { do: "gesture", actor: "momo", gesture: "eat" },
        { do: "sfx", sound: "munch" }
      ],
      lines: [
        { speaker: "narrator", key: "e10.eat-banana.1" },
        { speaker: "momo", key: "e10.eat-banana.2" }
      ],
      words: [
        { wordId: "eat", objectId: "momo" },
        { wordId: "mmm", objectId: "momo" },
        { wordId: "banana", objectId: "banana" }
      ],
      holdMs: 1500
    },
    {
      id: "yum",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [{ speaker: "momo", key: "e10.yum.1" }],
      words: [{ wordId: "tummy", objectId: "momo" }],
      holdMs: 1000
    },
    {
      id: "both",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "move", actor: "momo", to: "center", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [{ speaker: "momo", key: "e10.both.1" }],
      words: [
        { wordId: "apple", objectId: "apple" },
        { wordId: "banana", objectId: "banana" }
      ],
      holdMs: 1500
    },
    {
      id: "invite",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "show", actor: "apple" },
        { do: "show", actor: "banana" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "object", target: "apple", action: "glow" },
        { do: "object", target: "banana", action: "glow" }
      ],
      lines: [{ speaker: "momo", key: "e10.invite.1" }],
      words: [
        { wordId: "apple", objectId: "apple" },
        { wordId: "banana", objectId: "banana" },
        { wordId: "eat", objectId: "momo" },
        { wordId: "thank-you", objectId: "momo" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["apple", "banana"] },
      waitMs: 5000,
      caregiverPromptKey: "e10.tip.1",
      response: {
        stage: [
          { do: "gesture", actor: "momo", gesture: "eat" },
          { do: "sfx", sound: "munch" }
        ],
        lines: [
          { speaker: "momo", key: "e10.invite.2" },
          { speaker: "narrator", key: "e10.invite.3" }
        ],
        holdMs: 1500
      }
    },
    {
      id: "more",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" },
        { do: "object", target: "apple", action: "glow" },
        { do: "object", target: "banana", action: "glow" }
      ],
      lines: [{ speaker: "momo", key: "e10.more.1" }],
      words: [
        { wordId: "more", objectId: "momo" },
        { wordId: "mmm", objectId: "momo" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["apple", "banana"] },
      waitMs: 5000,
      caregiverPromptKey: "e10.tip.2",
      response: {
        stage: [
          { do: "gesture", actor: "momo", gesture: "eat" },
          { do: "sfx", sound: "munch" }
        ],
        lines: [{ speaker: "momo", key: "e10.more.2" }],
        holdMs: 1000
      }
    },
    {
      id: "full",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e10.full.1" },
        { speaker: "narrator", key: "e10.full.2" }
      ],
      words: [{ wordId: "tummy", objectId: "momo" }],
      holdMs: 1500,
      caregiverPromptKey: "e10.tip.3"
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "allDone" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true }
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
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e10.outro.1" },
        { speaker: "momo", key: "e10.outro.2" },
        { speaker: "narrator", key: "e10.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "momo" },
        { wordId: "apple", objectId: "apple" },
        { wordId: "banana", objectId: "banana" }
      ],
      holdMs: 3500
    }
  ]
};
