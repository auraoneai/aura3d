// E14 — The Lost Teddy Adventure (P2, PRD 05 E14, task H09). Hosts: Momo +
// Peeko.
//
// Teddy plays hide and seek: while Momo and Peeko cover their eyes, Teddy
// hops from his chair into the basket, so the child knows where he is and
// can point. Teddy's chair is empty; Peeko looks under the table, Momo looks
// behind the cushion, the basket wiggles and giggles, and Teddy is found in
// the basket. The child can tap each hiding place (table, cushion, basket);
// the narrator names each place as it is searched, and every wait ends by
// itself. Suspense stays gentle: Teddy is playing, never lost or sad, and the
// story ends with a hug and Teddy back at his chair. Once found, Teddy hops
// out of the basket to stand beside Momo before the hug, so the carry only
// lifts him into Momo's arms (a carry is instant; it never pulls him across
// the room). Every hiding place and speaker sits on a spot that stays in view
// on narrow portrait screens.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "lost-teddy-adventure",
  number: 14,
  version: 1,
  phase: "P2",
  titleKey: "e14.title",
  world: "home-nook",
  host: "momo",
  cast: [
    { id: "momo", at: "offLeft" },
    { id: "peeko", at: "offLeft" }
  ],
  props: [
    { id: "chair", asset: "chair", at: "frontRight", size: 0.7 },
    { id: "teddy", asset: "teddy", at: "frontRight", size: 0.55 },
    { id: "table", asset: "table", at: "back", size: 0.6 },
    { id: "cushion", asset: "cushion", at: "center", size: 0.3 },
    { id: "basket", asset: "picnicBasket", at: "front", size: 0.45 }
  ],
  targetWords: ["teddy", "look", "find"],
  supportWords: ["where", "under", "behind", "in", "there", "oh", "hi", "bye", "all-done"],
  music: "homeBed",
  offlinePlayKey: "e14.offline",
  caregiverBridgeKey: "e14.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 123,
  beats: [
    {
      id: "greeting",
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
        { speaker: "momo", key: "e14.greeting.1" },
        { speaker: "peeko", key: "e14.greeting.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 2500
    },
    {
      id: "meet-teddy",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "teddy" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "face", actor: "peeko", toward: "teddy" },
        { do: "object", target: "teddy", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e14.meet-teddy.1" },
        { speaker: "peeko", key: "e14.meet-teddy.2" }
      ],
      words: [{ wordId: "teddy", objectId: "teddy" }],
      holdMs: 2500
    },
    {
      id: "cover-eyes",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "hide" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "hide" }
      ],
      lines: [
        { speaker: "momo", key: "e14.cover-eyes.1" },
        { speaker: "narrator", key: "e14.cover-eyes.2" }
      ],
      holdMs: 2000
    },
    {
      id: "teddy-hides",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "move", actor: "teddy", to: "front", style: "hop" },
        { do: "sfx", sound: "rustle" }
      ],
      reducedMotionStage: [
        { do: "move", actor: "teddy", to: "front", style: "slide" },
        { do: "sfx", sound: "rustle" }
      ],
      lines: [
        { speaker: "narrator", key: "e14.teddy-hides.1" },
        { speaker: "narrator", key: "e14.teddy-hides.2" }
      ],
      words: [
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "in", objectId: "basket" }
      ],
      holdMs: 3000
    },
    {
      id: "empty-chair",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "hide", actor: "teddy" },
        { do: "face", actor: "momo", toward: "chair" },
        { do: "gesture", actor: "momo", gesture: "look" },
        { do: "face", actor: "peeko", toward: "chair" },
        { do: "gesture", actor: "peeko", gesture: "peek" }
      ],
      lines: [
        { speaker: "momo", key: "e14.empty-chair.1" },
        { speaker: "momo", key: "e14.empty-chair.2" },
        { speaker: "peeko", key: "e14.empty-chair.3" }
      ],
      words: [
        { wordId: "oh", objectId: "momo" },
        { wordId: "where", objectId: "chair" }
      ],
      holdMs: 2500,
      caregiverPromptKey: "e14.tip.1"
    },
    {
      id: "under-table",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "face", actor: "peeko", toward: "table" }
      ],
      lines: [
        { speaker: "momo", key: "e14.under-table.1" },
        { speaker: "momo", key: "e14.under-table.2" }
      ],
      words: [
        { wordId: "look", objectId: "momo" },
        { wordId: "under", objectId: "table" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["table"] },
      waitMs: 5000,
      caregiverPromptKey: "e14.tip.2",
      response: {
        stage: [
          { do: "move", actor: "peeko", to: "back", style: "walk" },
          { do: "gesture", actor: "peeko", gesture: "peek" },
          { do: "face", actor: "momo", toward: "table" }
        ],
        lines: [
          { speaker: "narrator", key: "e14.under-table.3" },
          { speaker: "peeko", key: "e14.under-table.4" }
        ],
        holdMs: 2500
      }
    },
    {
      id: "peeko-back",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "move", actor: "peeko", to: "frontLeft", style: "hop" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "shrug" },
        { do: "face", actor: "peeko", toward: "cushion" },
        { do: "gesture", actor: "peeko", gesture: "point" }
      ],
      reducedMotionStage: [
        { do: "move", actor: "peeko", to: "frontLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "shrug" },
        { do: "face", actor: "peeko", toward: "cushion" },
        { do: "gesture", actor: "peeko", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e14.peeko-back.1" },
        { speaker: "peeko", key: "e14.peeko-back.2" }
      ],
      words: [
        { wordId: "where", objectId: "momo" },
        { wordId: "look", objectId: "peeko" },
        { wordId: "there", objectId: "cushion" }
      ],
      holdMs: 2500
    },
    {
      id: "behind-cushion",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [{ speaker: "momo", key: "e14.behind-cushion.1" }],
      words: [{ wordId: "behind", objectId: "cushion" }],
      holdMs: 500,
      input: { type: "tap", targets: ["cushion"] },
      waitMs: 5000,
      caregiverPromptKey: "e14.tip.2",
      response: {
        stage: [
          { do: "face", actor: "momo", toward: "cushion" },
          { do: "gesture", actor: "momo", gesture: "look" },
          { do: "object", target: "cushion", action: "wobble" }
        ],
        lines: [
          { speaker: "narrator", key: "e14.behind-cushion.2" },
          { speaker: "momo", key: "e14.behind-cushion.3" }
        ],
        holdMs: 2500
      }
    },
    {
      id: "giggle-hint",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "object", target: "basket", action: "wobble" },
        { do: "sfx", sound: "giggle" },
        { do: "face", actor: "momo", toward: "basket" },
        { do: "face", actor: "peeko", toward: "basket" }
      ],
      lines: [
        { speaker: "narrator", key: "e14.giggle-hint.1" },
        { speaker: "peeko", key: "e14.giggle-hint.2" },
        { speaker: "momo", key: "e14.giggle-hint.3" }
      ],
      words: [
        { wordId: "oh", objectId: "peeko" },
        { wordId: "in", objectId: "basket" }
      ],
      holdMs: 2500
    },
    {
      id: "in-basket",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "gesture", actor: "peeko", gesture: "look" }
      ],
      lines: [{ speaker: "momo", key: "e14.in-basket.1" }],
      words: [{ wordId: "find", objectId: "momo" }],
      holdMs: 500,
      input: { type: "tap", targets: ["basket"] },
      waitMs: 5000,
      caregiverPromptKey: "e14.tip.1",
      response: {
        stage: [
          { do: "show", actor: "teddy" },
          { do: "object", target: "teddy", action: "bounce" },
          { do: "sfx", sound: "ding" },
          { do: "face", actor: "momo", toward: "teddy" },
          { do: "face", actor: "peeko", toward: "teddy" }
        ],
        lines: [{ speaker: "narrator", key: "e14.in-basket.2" }],
        holdMs: 2500
      }
    },
    {
      id: "found",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "gesture", actor: "momo", gesture: "cheer" },
        { do: "gesture", actor: "peeko", gesture: "hop" },
        { do: "move", actor: "teddy", to: "left", style: "hop" }
      ],
      reducedMotionStage: [
        { do: "gesture", actor: "momo", gesture: "nod" },
        { do: "gesture", actor: "peeko", gesture: "nod" },
        { do: "move", actor: "teddy", to: "left", style: "slide" }
      ],
      lines: [
        { speaker: "momo", key: "e14.found.1" },
        { speaker: "narrator", key: "e14.found.2" },
        { speaker: "peeko", key: "e14.found.3" }
      ],
      words: [
        { wordId: "find", objectId: "teddy" },
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "there", objectId: "teddy" }
      ],
      holdMs: 2500
    },
    {
      id: "hug",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "teddy" },
        { do: "carry", actor: "momo", item: "teddy" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e14.hug.1" },
        { speaker: "narrator", key: "e14.hug.2" },
        { speaker: "peeko", key: "e14.hug.3" }
      ],
      words: [{ wordId: "teddy", objectId: "teddy" }],
      holdMs: 2500
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "hello" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "dance", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "hello" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" }
      ],
      lines: [],
      holdMs: 10500
    },
    {
      id: "back-home",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "carry", actor: "momo", item: null },
        { do: "move", actor: "teddy", to: "frontRight", style: "hop" },
        { do: "face", actor: "momo", toward: "teddy" }
      ],
      reducedMotionStage: [
        { do: "carry", actor: "momo", item: null },
        { do: "move", actor: "teddy", to: "frontRight", style: "slide" },
        { do: "face", actor: "momo", toward: "teddy" }
      ],
      lines: [
        { speaker: "narrator", key: "e14.back-home.1" },
        { speaker: "momo", key: "e14.back-home.2" }
      ],
      words: [
        { wordId: "there", objectId: "teddy" },
        { wordId: "teddy", objectId: "teddy" }
      ],
      holdMs: 2500
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "object", target: "teddy", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e14.outro.1" },
        { speaker: "peeko", key: "e14.outro.2" },
        { speaker: "momo", key: "e14.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "teddy" }
      ],
      holdMs: 5500
    }
  ]
};
