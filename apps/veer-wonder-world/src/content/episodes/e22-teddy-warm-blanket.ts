// E22 — Teddy's Warm Blanket (P2 bedtime episode).
// Cosy tuck-in routine in the Moonlit Nursery with Momo and Sheru: fluffing the
// pillow (`cushion`), placing Teddy on the bed, and spreading the warm blanket.
// Sheru never speaks lines and reacts only with gentle puppy sounds and gestures.
import type { EpisodeSpec, SongCue } from "../../types.js";

const WARM_BLANKET_CUES: readonly SongCue[] = [
  { line: 0, stage: [{ do: "object", target: "blanket", action: "wobble" }] },
  { line: 2, stage: [{ do: "object", target: "cushion", action: "wobble" }] },
  { line: 4, stage: [{ do: "object", target: "nightlight", action: "glow" }] }
];

const TEDDY_GOODNIGHT_CUES: readonly SongCue[] = [
  { line: 0, stage: [{ do: "object", target: "teddy", action: "wobble" }] },
  { line: 2, stage: [{ do: "object", target: "cushion", action: "wobble" }] },
  { line: 3, stage: [{ do: "object", target: "bed", action: "wobble" }] },
  { line: 5, stage: [{ do: "object", target: "blanket", action: "glow" }] }
];

export const E22_TEDDY_WARM_BLANKET: EpisodeSpec = {
  kind: "episode",
  id: "teddy-warm-blanket",
  number: 22,
  version: 1,
  phase: "P2",
  sleepCategory: "bedtime",
  titleKey: "e22.title",
  world: "moonlit-nursery",
  host: "momo",
  cast: [
    { id: "momo", at: "left" },
    { id: "sheru", at: "frontLeft" }
  ],
  props: [
    { id: "bed", asset: "bed", at: "center", size: 0.75 },
    { id: "cushion", asset: "cushion", at: "back", size: 0.35 },
    { id: "teddy", asset: "teddy", at: "right", size: 0.4 },
    { id: "blanket", asset: "blanket", at: "frontRight", size: 0.55 },
    { id: "nightlight", asset: "nightlight", at: "farRight", size: 0.35 }
  ],
  targetWords: ["blanket", "pillow", "bed"],
  supportWords: ["hello", "teddy", "soft", "sleep", "night", "hush"],
  music: "nurseryBed",
  offlinePlayKey: "e22.offline",
  caregiverBridgeKey: "e22.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:gemini-carbon-4",
    date: "2026-11-11"
  },
  estimatedDurationSec: 166,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "nurseryBed" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "sfx", sound: "woofSoft" },
        { do: "object", target: "nightlight", action: "glow" }
      ],
      lines: [
        { speaker: "momo", key: "e22.greet.1" },
        { speaker: "narrator", key: "e22.greet.2" }
      ],
      words: [
        { wordId: "hello", objectId: "momo" },
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "bed", objectId: "bed" }
      ],
      holdMs: 4000
    },
    {
      id: "pillow-hook",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "move", actor: "cushion", to: "center", style: "slide" },
        { do: "face", actor: "momo", toward: "cushion" },
        { do: "gesture", actor: "momo", gesture: "nod" },
        { do: "sfx", sound: "huff" },
        { do: "gesture", actor: "sheru", gesture: "sit" }
      ],
      lines: [
        { speaker: "momo", key: "e22.pillow-hook.1" },
        { speaker: "narrator", key: "e22.pillow-hook.2" }
      ],
      words: [
        { wordId: "soft", objectId: "cushion" },
        { wordId: "pillow", objectId: "cushion" },
        { wordId: "bed", objectId: "bed" }
      ],
      holdMs: 4000
    },
    {
      id: "pillow-invite",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "move", actor: "teddy", to: "center", style: "slide" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [{ speaker: "momo", key: "e22.pillow-invite.1" }],
      holdMs: 2000,
      input: { type: "tap", targets: ["cushion", "bed"] },
      waitMs: 6000,
      caregiverPromptKey: "e22.tip.1",
      response: {
        stage: [
          { do: "object", target: "cushion", action: "wobble" },
          { do: "object", target: "bed", action: "wobble" },
          { do: "sfx", sound: "yawn" },
          { do: "gesture", actor: "sheru", gesture: "yawn" }
        ],
        lines: [
          { speaker: "momo", key: "e22.pillow-invite.2" },
          { speaker: "narrator", key: "e22.pillow-invite.3" }
        ],
        holdMs: 4000
      },
      responseByTarget: {
        cushion: {
          stage: [
            { do: "object", target: "cushion", action: "wobble" },
            { do: "sfx", sound: "yawn" },
            { do: "gesture", actor: "momo", gesture: "nod" }
          ]
        },
        bed: {
          stage: [
            { do: "object", target: "bed", action: "wobble" },
            { do: "sfx", sound: "woofSoft" },
            { do: "gesture", actor: "sheru", gesture: "wag" }
          ]
        }
      },
      words: [
        { wordId: "pillow", objectId: "cushion" },
        { wordId: "bed", objectId: "bed" },
        { wordId: "teddy", objectId: "teddy" }
      ]
    },
    {
      id: "blanket-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "move", actor: "blanket", to: "center", style: "slide" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "song", song: "warmBlanketSong", performers: ["momo", "sheru"], cues: WARM_BLANKET_CUES }
      ],
      lines: [],
      holdMs: 39000
    },
    {
      id: "blanket-model",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "blanket" },
        { do: "object", target: "blanket", action: "glow" },
        { do: "gesture", actor: "momo", gesture: "rock" },
        { do: "sfx", sound: "woofSoft" }
      ],
      lines: [
        { speaker: "momo", key: "e22.blanket-model.1" },
        { speaker: "narrator", key: "e22.blanket-model.2" }
      ],
      words: [
        { wordId: "blanket", objectId: "blanket" },
        { wordId: "soft", objectId: "blanket" },
        { wordId: "bed", objectId: "bed" }
      ],
      holdMs: 4000
    },
    {
      id: "blanket-invite",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "sheru", gesture: "look" }
      ],
      lines: [{ speaker: "momo", key: "e22.blanket-invite.1" }],
      holdMs: 2000,
      input: { type: "tap", targets: ["blanket", "teddy"] },
      waitMs: 6000,
      caregiverPromptKey: "e22.tip.2",
      response: {
        stage: [
          { do: "object", target: "blanket", action: "wobble" },
          { do: "object", target: "nightlight", action: "glow" },
          { do: "gesture", actor: "momo", gesture: "sway" },
          { do: "sfx", sound: "huff" }
        ],
        lines: [
          { speaker: "momo", key: "e22.blanket-invite.2" },
          { speaker: "narrator", key: "e22.blanket-invite.3" }
        ],
        holdMs: 4000
      },
      responseByTarget: {
        blanket: {
          stage: [
            { do: "object", target: "blanket", action: "wobble" },
            { do: "gesture", actor: "momo", gesture: "rock" },
            { do: "sfx", sound: "huff" }
          ]
        },
        teddy: {
          stage: [
            { do: "object", target: "teddy", action: "wobble" },
            { do: "object", target: "blanket", action: "glow" },
            { do: "gesture", actor: "momo", gesture: "sway" }
          ]
        }
      },
      words: [
        { wordId: "blanket", objectId: "blanket" },
        { wordId: "pillow", objectId: "cushion" },
        { wordId: "bed", objectId: "bed" },
        { wordId: "hush", objectId: "momo" }
      ]
    },
    {
      id: "goodnight-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "song", song: "teddyGoodnight", performers: ["momo", "sheru"], cues: TEDDY_GOODNIGHT_CUES }
      ],
      lines: [],
      holdMs: 39000
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "object", target: "nightlight", action: "glow" },
        { do: "gesture", actor: "momo", gesture: "sleep", loop: true },
        { do: "gesture", actor: "sheru", gesture: "sleep", loop: true }
      ],
      lines: [
        { speaker: "narrator", key: "e22.outro.1" },
        { speaker: "narrator", key: "e22.outro.2" },
        { speaker: "narrator", key: "e22.outro.3" }
      ],
      words: [
        { wordId: "blanket", objectId: "blanket" },
        { wordId: "pillow", objectId: "cushion" },
        { wordId: "bed", objectId: "bed" },
        { wordId: "sleep", objectId: "momo" },
        { wordId: "night", objectId: "nightlight" }
      ],
      holdMs: 7000
    }
  ]
};

export const episode: EpisodeSpec = E22_TEDDY_WARM_BLANKET;
