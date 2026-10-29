// E09 — Baby Animal Orchestra (P1, PRD 05 E09 / 04 F03). Peeko the chick
// starts a concert in Lulu's music garden. A cow, a sheep and a duck arrive
// one at a time, each carrying a tiny instrument, and each animal sound is
// heard on its own before Lulu names it. The band keeps a slow drum and
// shaker rhythm, the child gives the cow and the duck a turn, and Sheru joins
// last with a woof before the animal band song.
//
// Six-beat blueprint (PRD 01 section 5): greeting (hello song, then hi), hook
// (Peeko starts the concert; the animals arrive), explore (moo, baa, quack,
// then the slow rhythm), child turns (tap the cow; tap the duck), resolution +
// song (Sheru's woof, animalBand), natural ending.
//
// No animal sounds overlap: every animal sound plays in a beat with no speech
// and no other sound, then a voice names it and leaves a short pause. Song
// beats carry no lines. Each invite has one target so the sound always
// matches the animal that was tapped; silence plays it too.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "baby-animal-orchestra",
  number: 9,
  version: 1,
  phase: "P1",
  titleKey: "e09.title",
  world: "music-garden",
  host: "lulu",
  cast: [
    { id: "lulu", at: "offRight" },
    { id: "peeko", at: "offRight" },
    { id: "sheru", at: "offRight" }
  ],
  props: [
    { id: "cow", asset: "cow", at: "offLeft", size: 0.9 },
    { id: "sheep", asset: "sheep", at: "offRight", size: 0.7 },
    { id: "duck", asset: "duck", at: "offLeft", size: 0.55 },
    { id: "cow-drum", asset: "drum", at: "offLeft", size: 0.3 },
    { id: "sheep-shaker", asset: "shaker", at: "offRight", size: 0.25 },
    { id: "duck-piano", asset: "toyPiano", at: "offLeft", size: 0.3 }
  ],
  targetWords: ["moo", "baa", "quack", "woof"],
  supportWords: ["cow", "sheep", "duck", "dog", "chick", "boom", "peekaboo", "look", "your-turn", "hi", "bye", "all-done"],
  music: "gardenBed",
  offlinePlayKey: "e09.offline",
  caregiverBridgeKey: "e09.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 144,
  beats: [
    {
      id: "hello",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "gardenBed" },
        { do: "song", song: "hello" },
        { do: "enter", actor: "lulu", at: "center", from: "offRight", style: "walk" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" }
      ],
      lines: [],
      holdMs: 11000
    },
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "happy" }
      ],
      lines: [
        { speaker: "lulu", key: "e09.greet.1" },
        { speaker: "lulu", key: "e09.greet.2" }
      ],
      words: [{ wordId: "hi", objectId: "lulu" }],
      holdMs: 1000
    },
    {
      id: "peeko",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "enter", actor: "peeko", at: "frontRight", from: "offRight", style: "hop" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "face", actor: "lulu", toward: "peeko" }
      ],
      reducedMotionStage: [
        { do: "enter", actor: "peeko", at: "frontRight", from: "offRight", style: "walk" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "face", actor: "lulu", toward: "peeko" }
      ],
      lines: [
        { speaker: "peeko", key: "e09.peeko.1" },
        { speaker: "lulu", key: "e09.peeko.2" },
        { speaker: "peeko", key: "e09.peeko.3" }
      ],
      words: [
        { wordId: "peekaboo", objectId: "peeko" },
        { wordId: "hi", objectId: "peeko" },
        { wordId: "chick", objectId: "peeko" }
      ],
      holdMs: 1000
    },
    {
      id: "cow",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "carry", actor: "cow", item: "cow-drum" },
        { do: "move", actor: "cow", to: "left", style: "walk" },
        { do: "face", actor: "lulu", toward: "cow" }
      ],
      lines: [{ speaker: "narrator", key: "e09.cow.1" }],
      words: [{ wordId: "cow", objectId: "cow" }],
      holdMs: 1200
    },
    {
      id: "moo",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "moo" },
        { do: "object", target: "cow", action: "bounce" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "moo" },
        { do: "object", target: "cow", action: "wobble" }
      ],
      lines: [],
      holdMs: 2000
    },
    {
      id: "cow-says",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "cow" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [{ speaker: "lulu", key: "e09.cow-says.1" }],
      words: [
        { wordId: "moo", objectId: "cow" },
        { wordId: "cow", objectId: "cow" }
      ],
      holdMs: 1500
    },
    {
      id: "sheep",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "carry", actor: "sheep", item: "sheep-shaker" },
        { do: "move", actor: "sheep", to: "right", style: "walk" },
        { do: "face", actor: "lulu", toward: "sheep" }
      ],
      lines: [{ speaker: "narrator", key: "e09.sheep.1" }],
      words: [{ wordId: "sheep", objectId: "sheep" }],
      holdMs: 1200
    },
    {
      id: "baa",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "baa" },
        { do: "object", target: "sheep", action: "bounce" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "baa" },
        { do: "object", target: "sheep", action: "wobble" }
      ],
      lines: [],
      holdMs: 2000
    },
    {
      id: "sheep-says",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "sheep" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [{ speaker: "lulu", key: "e09.sheep-says.1" }],
      words: [
        { wordId: "baa", objectId: "sheep" },
        { wordId: "sheep", objectId: "sheep" }
      ],
      holdMs: 1500
    },
    {
      id: "duck",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "carry", actor: "duck", item: "duck-piano" },
        { do: "move", actor: "duck", to: "frontLeft", style: "walk" },
        { do: "face", actor: "lulu", toward: "duck" }
      ],
      lines: [{ speaker: "narrator", key: "e09.duck.1" }],
      words: [{ wordId: "duck", objectId: "duck" }],
      holdMs: 1200
    },
    {
      id: "quack",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "quack" },
        { do: "object", target: "duck", action: "bounce" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "quack" },
        { do: "object", target: "duck", action: "wobble" }
      ],
      lines: [],
      holdMs: 2000
    },
    {
      id: "duck-says",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "duck" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [{ speaker: "lulu", key: "e09.duck-says.1" }],
      words: [
        { wordId: "quack", objectId: "duck" },
        { wordId: "duck", objectId: "duck" }
      ],
      holdMs: 1500
    },
    {
      id: "ready",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "point" },
        { do: "face", actor: "lulu", toward: "viewer" }
      ],
      lines: [
        { speaker: "peeko", key: "e09.ready.1" },
        { speaker: "lulu", key: "e09.ready.2" }
      ],
      holdMs: 1000
    },
    {
      id: "rhythm",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "drum" },
        { do: "object", target: "cow", action: "wobble" },
        { do: "gesture", actor: "lulu", gesture: "sway", loop: true }
      ],
      lines: [{ speaker: "lulu", key: "e09.rhythm.1" }],
      words: [{ wordId: "boom", objectId: "cow" }],
      holdMs: 2000
    },
    {
      id: "rhythm-2",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "shaker" },
        { do: "object", target: "sheep", action: "wobble" }
      ],
      lines: [{ speaker: "lulu", key: "e09.rhythm-2.1" }],
      holdMs: 1500
    },
    {
      id: "invite-cow",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "point" },
        { do: "object", target: "cow", action: "glow" }
      ],
      lines: [{ speaker: "lulu", key: "e09.invite-cow.1" }],
      words: [
        { wordId: "cow", objectId: "cow" },
        { wordId: "your-turn", objectId: "cow" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["cow"] },
      waitMs: 5000,
      caregiverPromptKey: "e09.tip.1",
      response: {
        stage: [
          { do: "sfx", sound: "moo" },
          { do: "object", target: "cow", action: "bounce" }
        ],
        lines: [],
        holdMs: 2000
      }
    },
    {
      id: "cow-again",
      kind: "repeat",
      camera: "medium",
      stage: [{ do: "gesture", actor: "lulu", gesture: "happy" }],
      lines: [{ speaker: "narrator", key: "e09.cow-again.1" }],
      words: [{ wordId: "moo", objectId: "cow" }],
      holdMs: 1500
    },
    {
      id: "invite-duck",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "point" },
        { do: "object", target: "duck", action: "glow" }
      ],
      lines: [{ speaker: "lulu", key: "e09.invite-duck.1" }],
      words: [
        { wordId: "duck", objectId: "duck" },
        { wordId: "your-turn", objectId: "duck" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["duck"] },
      waitMs: 5000,
      caregiverPromptKey: "e09.tip.2",
      response: {
        stage: [
          { do: "sfx", sound: "quack" },
          { do: "object", target: "duck", action: "bounce" }
        ],
        lines: [],
        holdMs: 2000
      }
    },
    {
      id: "duck-again",
      kind: "repeat",
      camera: "medium",
      stage: [{ do: "gesture", actor: "lulu", gesture: "happy" }],
      lines: [{ speaker: "narrator", key: "e09.duck-again.1" }],
      words: [{ wordId: "quack", objectId: "duck" }],
      holdMs: 1500
    },
    {
      id: "sheru",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "enter", actor: "sheru", at: "farRight", from: "offRight", style: "walk" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "face", actor: "peeko", toward: "sheru" },
        { do: "face", actor: "lulu", toward: "sheru" }
      ],
      lines: [
        { speaker: "peeko", key: "e09.sheru.1" },
        { speaker: "lulu", key: "e09.sheru.2" }
      ],
      words: [
        { wordId: "look", objectId: "sheru" },
        { wordId: "hi", objectId: "sheru" }
      ],
      holdMs: 1000
    },
    {
      id: "woof",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "woof" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [],
      holdMs: 1800
    },
    {
      id: "sheru-says",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "sheru" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [
        { speaker: "lulu", key: "e09.sheru-says.1" },
        { speaker: "narrator", key: "e09.sheru-says.2" }
      ],
      words: [
        { wordId: "woof", objectId: "sheru" },
        { wordId: "dog", objectId: "sheru" }
      ],
      holdMs: 1000
    },
    {
      id: "song-intro",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "cheer" }
      ],
      lines: [{ speaker: "lulu", key: "e09.song-intro.1" }],
      words: [
        { wordId: "moo", objectId: "cow" },
        { wordId: "baa", objectId: "sheep" },
        { wordId: "quack", objectId: "duck" },
        { wordId: "woof", objectId: "sheru" }
      ],
      holdMs: 500
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "animalBand" },
        { do: "gesture", actor: "lulu", gesture: "dance", loop: true },
        { do: "gesture", actor: "peeko", gesture: "dance", loop: true },
        { do: "gesture", actor: "sheru", gesture: "wag", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "animalBand" },
        { do: "gesture", actor: "lulu", gesture: "sway", loop: true },
        { do: "gesture", actor: "peeko", gesture: "sway", loop: true }
      ],
      lines: [],
      holdMs: 17000,
      caregiverPromptKey: "e09.tip.3"
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [
        { speaker: "lulu", key: "e09.outro.1" },
        { speaker: "peeko", key: "e09.outro.2" },
        { speaker: "narrator", key: "e09.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "lulu" },
        { wordId: "bye", objectId: "peeko" }
      ],
      holdMs: 3000
    }
  ]
};
