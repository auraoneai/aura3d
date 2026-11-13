// E21 — Lumi's Moonlit Lullaby (P2 bedtime episode).
// Gentle wind-down in the Moonlit Nursery with Lumi and Momo: the golden moon
// rises, the starlight mobile turns softly, Teddy settles into the cradle, and
// two hushed lullabies (`lullaby` and `twinkleRest`) guide everyone to sleep.
import type { EpisodeSpec, SongCue } from "../../types.js";

const LULLABY_CUES: readonly SongCue[] = [
  { line: 0, stage: [{ do: "object", target: "moon", action: "glow" }] },
  { line: 2, stage: [{ do: "object", target: "cradle", action: "wobble" }] },
  { line: 4, stage: [{ do: "object", target: "nightlight", action: "glow" }] }
];

const TWINKLE_REST_CUES: readonly SongCue[] = [
  { line: 0, stage: [{ do: "gesture", actor: "lumi", gesture: "twinkle" }] },
  { line: 1, stage: [{ do: "object", target: "cribMobile", action: "spin" }] },
  { line: 3, stage: [{ do: "object", target: "cradle", action: "wobble" }] },
  { line: 5, stage: [{ do: "object", target: "nightlight", action: "glow" }] }
];

export const E21_LUMI_MOONLIT_LULLABY: EpisodeSpec = {
  kind: "episode",
  id: "lumi-moonlit-lullaby",
  number: 21,
  version: 1,
  phase: "P2",
  sleepCategory: "bedtime",
  titleKey: "e21.title",
  world: "moonlit-nursery",
  host: "lumi",
  cast: [
    { id: "lumi", at: "highLeft" },
    { id: "momo", at: "frontLeft" }
  ],
  props: [
    { id: "cradle", asset: "cradle", at: "left", size: 0.78 },
    { id: "teddy", asset: "teddy", at: "left", size: 0.36 },
    { id: "nightlight", asset: "nightlight", at: "frontRight", size: 0.35 },
    { id: "moon", asset: "moon", at: "highRight", hidden: true, size: 0.7 },
    { id: "cribMobile", asset: "cribMobile", at: "high", size: 0.55 }
  ],
  targetWords: ["moon", "star", "sleep"],
  supportWords: ["hello", "look", "teddy", "night", "hush", "soft", "quiet"],
  music: "nurseryBed",
  offlinePlayKey: "e21.offline",
  caregiverBridgeKey: "e21.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:gemini-carbon-4",
    date: "2026-11-11"
  },
  estimatedDurationSec: 158,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "nurseryBed" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "wave" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "object", target: "nightlight", action: "glow" }
      ],
      lines: [
        { speaker: "lumi", key: "e21.greet.1" },
        { speaker: "momo", key: "e21.greet.2" }
      ],
      words: [
        { wordId: "hello", objectId: "lumi" },
        { wordId: "star", objectId: "lumi" },
        { wordId: "night", objectId: "nightlight" },
        { wordId: "quiet", objectId: "momo" }
      ],
      holdMs: 4000
    },
    {
      id: "moon-rise",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "show", actor: "moon" },
        { do: "object", target: "moon", action: "glow" },
        { do: "gesture", actor: "moon", gesture: "float", loop: true },
        { do: "face", actor: "momo", toward: "moon" },
        { do: "gesture", actor: "lumi", gesture: "twinkle" }
      ],
      lines: [
        { speaker: "narrator", key: "e21.moon-rise.1" },
        { speaker: "lumi", key: "e21.moon-rise.2" }
      ],
      words: [
        { wordId: "look", objectId: "moon" },
        { wordId: "moon", objectId: "moon" },
        { wordId: "soft", objectId: "moon" },
        { wordId: "star", objectId: "lumi" }
      ],
      holdMs: 4500
    },
    {
      id: "mobile-invite",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "object", target: "cribMobile", action: "spin" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [{ speaker: "lumi", key: "e21.mobile-invite.1" }],
      holdMs: 2000,
      input: { type: "tap", targets: ["lumi", "cribMobile"] },
      waitMs: 6000,
      caregiverPromptKey: "e21.tip.1",
      response: {
        stage: [
          { do: "sfx", sound: "sparkle" },
          { do: "gesture", actor: "lumi", gesture: "twinkle" },
          { do: "object", target: "cribMobile", action: "spin" },
          { do: "object", target: "moon", action: "glow" }
        ],
        lines: [
          { speaker: "lumi", key: "e21.mobile-invite.2" },
          { speaker: "narrator", key: "e21.mobile-invite.3" }
        ],
        holdMs: 4000
      },
      responseByTarget: {
        lumi: {
          stage: [
            { do: "sfx", sound: "sparkle" },
            { do: "gesture", actor: "lumi", gesture: "twinkle" },
            { do: "object", target: "moon", action: "glow" }
          ]
        },
        cribMobile: {
          stage: [
            { do: "object", target: "cribMobile", action: "spin" },
            { do: "sfx", sound: "sparkle" },
            { do: "gesture", actor: "lumi", gesture: "glow" }
          ]
        }
      },
      words: [
        { wordId: "star", objectId: "lumi" },
        { wordId: "moon", objectId: "moon" },
        { wordId: "soft", objectId: "cribMobile" }
      ]
    },
    {
      id: "first-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "song", song: "lullaby", performers: ["lumi", "momo"], cues: LULLABY_CUES }
      ],
      lines: [],
      holdMs: 25000
    },
    {
      id: "cradle-model",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "teddy" },
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "momo", gesture: "yawn" },
        { do: "object", target: "cradle", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e21.cradle-model.1" },
        { speaker: "narrator", key: "e21.cradle-model.2" }
      ],
      words: [
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "sleep", objectId: "teddy" }
      ],
      holdMs: 4500
    },
    {
      id: "cradle-invite",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      lines: [{ speaker: "lumi", key: "e21.cradle-invite.1" }],
      holdMs: 2000,
      input: { type: "tap", targets: ["cradle", "nightlight"] },
      waitMs: 6000,
      caregiverPromptKey: "e21.tip.2",
      response: {
        stage: [
          { do: "object", target: "cradle", action: "wobble" },
          { do: "object", target: "nightlight", action: "glow" },
          { do: "gesture", actor: "momo", gesture: "rock" }
        ],
        lines: [
          { speaker: "momo", key: "e21.cradle-invite.2" },
          { speaker: "lumi", key: "e21.cradle-invite.3" }
        ],
        holdMs: 4500
      },
      responseByTarget: {
        cradle: {
          stage: [
            { do: "object", target: "cradle", action: "wobble" },
            { do: "gesture", actor: "momo", gesture: "rock" },
            { do: "gesture", actor: "lumi", gesture: "sway" }
          ]
        },
        nightlight: {
          stage: [
            { do: "object", target: "nightlight", action: "glow" },
            { do: "object", target: "cradle", action: "wobble" },
            { do: "gesture", actor: "momo", gesture: "rock" }
          ]
        }
      },
      words: [
        { wordId: "hush", objectId: "momo" },
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "sleep", objectId: "cradle" },
        { wordId: "moon", objectId: "moon" }
      ]
    },
    {
      id: "second-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "song", song: "twinkleRest", performers: ["lumi", "momo"], cues: TWINKLE_REST_CUES }
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
        { do: "gesture", actor: "lumi", gesture: "sleep", loop: true }
      ],
      lines: [
        { speaker: "narrator", key: "e21.outro.1" },
        { speaker: "narrator", key: "e21.outro.2" },
        { speaker: "narrator", key: "e21.outro.3" }
      ],
      words: [
        { wordId: "hush", objectId: "lumi" },
        { wordId: "moon", objectId: "moon" },
        { wordId: "star", objectId: "lumi" },
        { wordId: "sleep", objectId: "momo" }
      ],
      holdMs: 8000
    }
  ]
};

export const episode: EpisodeSpec = E21_LUMI_MOONLIT_LULLABY;
