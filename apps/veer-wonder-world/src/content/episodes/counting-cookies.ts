// E05 — Momo's Counting Cookies (P1). Momo's tummy rumbles and his plate is
// empty. Lulu brings a basket and puts out cookies one at a time; each number
// is spoken in its own beat, in the same beat the new cookie appears, so the
// visible cookie count always equals the spoken number (1, 2, 3). Number words
// are only spoken in those three beats. After the counting song Momo asks,
// eats one cookie gently and says thank you, then shares. Momo is an original
// purple creature: no imitation of any existing cookie-eating character, its
// catchphrases, voice or eating style. Song beats carry no lines.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "counting-cookies",
  number: 5,
  version: 1,
  phase: "P1",
  titleKey: "e05.title",
  world: "home-nook",
  host: "momo",
  cast: [
    { id: "momo", at: "offLeft" },
    { id: "lulu", at: "offRight" }
  ],
  props: [
    { id: "plate", asset: "plate", at: "front", size: 0.1 },
    { id: "basket", asset: "picnicBasket", at: "farRight", size: 0.5 },
    { id: "cookie-1", asset: "cookie", at: "frontLeft", hidden: true, size: 0.25 },
    { id: "cookie-2", asset: "cookie", at: "front", hidden: true, size: 0.25 },
    { id: "cookie-3", asset: "cookie", at: "frontRight", hidden: true, size: 0.25 }
  ],
  targetWords: ["one", "two", "three", "cookie"],
  supportWords: ["hi", "tummy", "plate", "uh-oh", "more", "eat", "mmm", "thank-you", "all-done", "bye"],
  music: "homeBed",
  offlinePlayKey: "e05.offline",
  caregiverBridgeKey: "e05.bridge",
  numberConcept: { countMin: 1, countMax: 3, countedObjectIds: ["cookie-1", "cookie-2", "cookie-3"] },
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 130,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "homeBed" },
        { do: "enter", actor: "momo", at: "left", from: "offLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e05.greet.1" },
        { speaker: "narrator", key: "e05.greet.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 3800
    },
    {
      id: "hook",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "rumble" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "narrator", key: "e05.hook.1" },
        { speaker: "momo", key: "e05.hook.2" },
        { speaker: "momo", key: "e05.hook.3" }
      ],
      words: [{ wordId: "tummy", objectId: "momo" }],
      holdMs: 3800
    },
    {
      id: "plate",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "plate" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "plate", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e05.plate.1" },
        { speaker: "momo", key: "e05.plate.2" }
      ],
      words: [
        { wordId: "plate", objectId: "plate" },
        { wordId: "uh-oh", objectId: "momo" }
      ],
      holdMs: 3800
    },
    {
      id: "lulu",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "enter", actor: "lulu", at: "right", from: "offRight", style: "walk" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "face", actor: "momo", toward: "lulu" }
      ],
      lines: [
        { speaker: "lulu", key: "e05.lulu.1" },
        { speaker: "momo", key: "e05.lulu.2" }
      ],
      words: [{ wordId: "hi", objectId: "lulu" }],
      holdMs: 3800
    },
    {
      id: "count-one",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lulu", gesture: "pickUp" },
        { do: "show", actor: "cookie-1" },
        { do: "object", target: "cookie-1", action: "bounce" },
        { do: "face", actor: "momo", toward: "cookie-1" }
      ],
      lines: [
        { speaker: "narrator", key: "e05.count-one.1" },
        { speaker: "momo", key: "e05.count-one.2" }
      ],
      words: [
        { wordId: "one", objectId: "cookie-1" },
        { wordId: "cookie", objectId: "cookie-1" }
      ],
      holdMs: 4300
    },
    {
      id: "count-two",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lulu", gesture: "pickUp" },
        { do: "show", actor: "cookie-2" },
        { do: "object", target: "cookie-2", action: "bounce" },
        { do: "face", actor: "momo", toward: "cookie-2" }
      ],
      lines: [
        { speaker: "narrator", key: "e05.count-two.1" },
        { speaker: "momo", key: "e05.count-two.2" }
      ],
      words: [{ wordId: "two", objectId: "cookie-2" }],
      holdMs: 4300
    },
    {
      id: "turn",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "point" },
        { do: "object", target: "basket", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e05.turn.1" },
        { speaker: "lulu", key: "e05.turn.2" }
      ],
      words: [{ wordId: "more", objectId: "basket" }],
      holdMs: 3300,
      input: { type: "tap", targets: ["basket", "lulu"] },
      waitMs: 5000,
      caregiverPromptKey: "e05.tip.1",
      response: {
        stage: [
          { do: "gesture", actor: "lulu", gesture: "pickUp" },
          { do: "object", target: "basket", action: "wobble" },
          { do: "sfx", sound: "rustle" }
        ],
        lines: [{ speaker: "lulu", key: "e05.turn.3" }],
        holdMs: 3300
      }
    },
    {
      id: "count-three",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "show", actor: "cookie-3" },
        { do: "object", target: "cookie-3", action: "bounce" },
        { do: "face", actor: "momo", toward: "cookie-3" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "narrator", key: "e05.count-three.1" },
        { speaker: "momo", key: "e05.count-three.2" }
      ],
      words: [{ wordId: "three", objectId: "cookie-3" }],
      holdMs: 4300
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "countToThree" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "dance", loop: true },
        { do: "gesture", actor: "lulu", gesture: "dance", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "countToThree" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "gesture", actor: "lulu", gesture: "sway", loop: true }
      ],
      lines: [],
      holdMs: 18000
    },
    {
      id: "eat",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "object", target: "cookie-3", action: "glow" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [{ speaker: "momo", key: "e05.eat.1" }],
      words: [
        { wordId: "eat", objectId: "momo" },
        { wordId: "cookie", objectId: "cookie-3" }
      ],
      holdMs: 3300,
      input: { type: "tap", targets: ["cookie-3", "momo"] },
      waitMs: 5000,
      caregiverPromptKey: "e05.tip.2",
      response: {
        stage: [
          { do: "carry", actor: "momo", item: "cookie-3" },
          { do: "gesture", actor: "momo", gesture: "eat" },
          { do: "sfx", sound: "munch" }
        ],
        lines: [
          { speaker: "narrator", key: "e05.eat.2" },
          { speaker: "momo", key: "e05.eat.3" }
        ],
        holdMs: 3800
      }
    },
    {
      id: "share",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "hide", actor: "cookie-3" },
        { do: "carry", actor: "momo", item: null },
        { do: "face", actor: "momo", toward: "lulu" },
        { do: "gesture", actor: "momo", gesture: "pickUp" },
        { do: "carry", actor: "lulu", item: "cookie-2" },
        { do: "gesture", actor: "lulu", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e05.share.1" },
        { speaker: "lulu", key: "e05.share.2" }
      ],
      words: [
        { wordId: "cookie", objectId: "cookie-2" },
        { wordId: "thank-you", objectId: "lulu" }
      ],
      holdMs: 3300
    },
    {
      id: "lulu-eats",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lulu", gesture: "eat" },
        { do: "sfx", sound: "munch" }
      ],
      lines: [
        { speaker: "narrator", key: "e05.lulu-eats.1" },
        { speaker: "lulu", key: "e05.lulu-eats.2" }
      ],
      words: [{ wordId: "mmm", objectId: "lulu" }],
      holdMs: 3800
    },
    {
      id: "for-you",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "hide", actor: "cookie-2" },
        { do: "carry", actor: "lulu", item: null },
        { do: "object", target: "cookie-1", action: "glow" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e05.for-you.1" },
        { speaker: "narrator", key: "e05.for-you.2" }
      ],
      words: [
        { wordId: "cookie", objectId: "cookie-1" },
        { wordId: "mmm", objectId: "momo" }
      ],
      holdMs: 4800,
      caregiverPromptKey: "e05.tip.3"
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e05.outro.1" },
        { speaker: "lulu", key: "e05.outro.2" },
        { speaker: "narrator", key: "e05.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "lulu" }
      ],
      holdMs: 6300
    }
  ]
};
