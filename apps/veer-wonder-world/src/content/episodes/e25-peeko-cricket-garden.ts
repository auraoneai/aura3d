// E25 — Peeko's Cricket Garden (P2 bedtime episode).
// Evening falls in the Music Garden as Peeko and Lumi watch sleepy flowers close
// their petals, listen to the wound music box, and sing `cricketHush`.
import type { EpisodeSpec, SongCue } from "../../types.js";

const CRICKET_HUSH_CUES: readonly SongCue[] = [
  { line: 0, stage: [{ do: "object", target: "flowerOne", action: "close" }] },
  { line: 1, stage: [{ do: "object", target: "flowerTwo", action: "close" }] },
  { line: 2, stage: [{ do: "object", target: "nightlight", action: "glow" }] },
  { line: 4, stage: [{ do: "object", target: "musicBox", action: "spin" }] }
];

export const E25_PEEKO_CRICKET_GARDEN: EpisodeSpec = {
  kind: "episode",
  id: "peeko-cricket-garden",
  number: 25,
  version: 1,
  phase: "P2",
  sleepCategory: "bedtime",
  titleKey: "e25.title",
  world: "music-garden",
  host: "peeko",
  cast: [
    { id: "peeko", at: "left" },
    { id: "lumi", at: "highRight" }
  ],
  props: [
    { id: "flowerOne", asset: "flower", at: "frontLeft", size: 0.45 },
    { id: "flowerTwo", asset: "flower", at: "frontRight", size: 0.45 },
    { id: "cushion", asset: "cushion", at: "center", size: 0.38 },
    { id: "musicBox", asset: "musicBox", at: "right", size: 0.35 },
    { id: "nightlight", asset: "nightlight", at: "backRight", size: 0.35 }
  ],
  targetWords: ["night", "hush", "close"],
  supportWords: ["hello", "flower", "soft", "quiet", "sleep", "look"],
  music: "gardenBed",
  offlinePlayKey: "e25.offline",
  caregiverBridgeKey: "e25.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:gemini-carbon-4",
    date: "2026-11-11"
  },
  estimatedDurationSec: 160,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "gardenBed" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "gesture", actor: "lumi", gesture: "twinkle" },
        { do: "object", target: "nightlight", action: "glow" }
      ],
      lines: [
        { speaker: "peeko", key: "e25.greet.1" },
        { speaker: "lumi", key: "e25.greet.2" }
      ],
      words: [
        { wordId: "hello", objectId: "peeko" },
        { wordId: "night", objectId: "nightlight" },
        { wordId: "hush", objectId: "lumi" },
        { wordId: "quiet", objectId: "peeko" }
      ],
      holdMs: 7500
    },
    {
      id: "petals-hook",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "face", actor: "peeko", toward: "flowerOne" },
        { do: "object", target: "flowerOne", action: "close" },
        { do: "sfx", sound: "rustle" },
        { do: "gesture", actor: "peeko", gesture: "look" }
      ],
      lines: [
        { speaker: "narrator", key: "e25.petals-hook.1" },
        { speaker: "peeko", key: "e25.petals-hook.2" }
      ],
      words: [
        { wordId: "look", objectId: "flowerOne" },
        { wordId: "flower", objectId: "flowerOne" },
        { wordId: "close", objectId: "flowerOne" },
        { wordId: "night", objectId: "nightlight" }
      ],
      holdMs: 7500
    },
    {
      id: "flower-invite",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "nod" }
      ],
      lines: [{ speaker: "peeko", key: "e25.flower-invite.1" }],
      holdMs: 2500,
      input: { type: "tap", targets: ["flowerOne", "flowerTwo"] },
      waitMs: 6000,
      caregiverPromptKey: "e25.tip.1",
      response: {
        stage: [
          { do: "object", target: "flowerTwo", action: "close" },
          { do: "sfx", sound: "rustle" },
          { do: "gesture", actor: "lumi", gesture: "glow" },
          { do: "gesture", actor: "peeko", gesture: "sway" }
        ],
        lines: [
          { speaker: "lumi", key: "e25.flower-invite.2" },
          { speaker: "narrator", key: "e25.flower-invite.3" }
        ],
        holdMs: 6500
      },
      responseByTarget: {
        flowerOne: {
          stage: [
            { do: "object", target: "flowerOne", action: "wobble" },
            { do: "object", target: "flowerTwo", action: "close" },
            { do: "sfx", sound: "rustle" }
          ]
        },
        flowerTwo: {
          stage: [
            { do: "object", target: "flowerTwo", action: "close" },
            { do: "sfx", sound: "rustle" },
            { do: "gesture", actor: "peeko", gesture: "sway" }
          ]
        }
      },
      words: [
        { wordId: "flower", objectId: "flowerTwo" },
        { wordId: "close", objectId: "flowerTwo" },
        { wordId: "hush", objectId: "lumi" },
        { wordId: "night", objectId: "nightlight" }
      ]
    },
    {
      id: "garden-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "song", song: "cricketHush", performers: ["peeko", "lumi"], cues: CRICKET_HUSH_CUES }
      ],
      lines: [],
      holdMs: 40500
    },
    {
      id: "musicbox-model",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "move", actor: "peeko", to: "center", style: "walk" },
        { do: "face", actor: "peeko", toward: "musicBox" },
        { do: "object", target: "musicBox", action: "spin" },
        { do: "sfx", sound: "ding" }
      ],
      lines: [
        { speaker: "peeko", key: "e25.musicbox-model.1" },
        { speaker: "lumi", key: "e25.musicbox-model.2" }
      ],
      words: [
        { wordId: "hush", objectId: "musicBox" },
        { wordId: "night", objectId: "nightlight" },
        { wordId: "close", objectId: "peeko" }
      ],
      holdMs: 7500
    },
    {
      id: "lantern-invite",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "object", target: "nightlight", action: "glow" }
      ],
      lines: [{ speaker: "lumi", key: "e25.lantern-invite.1" }],
      holdMs: 2500,
      input: { type: "tap", targets: ["musicBox", "nightlight"] },
      waitMs: 6000,
      caregiverPromptKey: "e25.tip.2",
      response: {
        stage: [
          { do: "object", target: "musicBox", action: "wobble" },
          { do: "object", target: "nightlight", action: "glow" },
          { do: "sfx", sound: "yawn" },
          { do: "gesture", actor: "peeko", gesture: "yawn" }
        ],
        lines: [
          { speaker: "peeko", key: "e25.lantern-invite.2" },
          { speaker: "narrator", key: "e25.lantern-invite.3" }
        ],
        holdMs: 7000
      },
      responseByTarget: {
        musicBox: {
          stage: [
            { do: "object", target: "musicBox", action: "spin" },
            { do: "sfx", sound: "ding" },
            { do: "gesture", actor: "peeko", gesture: "rock" }
          ]
        },
        nightlight: {
          stage: [
            { do: "object", target: "nightlight", action: "glow" },
            { do: "gesture", actor: "lumi", gesture: "twinkle" },
            { do: "gesture", actor: "peeko", gesture: "sway" }
          ]
        }
      },
      words: [
        { wordId: "hush", objectId: "musicBox" },
        { wordId: "close", objectId: "peeko" },
        { wordId: "soft", objectId: "cushion" },
        { wordId: "sleep", objectId: "cushion" }
      ]
    },
    {
      id: "settle",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "gesture", actor: "peeko", gesture: "rock" },
        { do: "gesture", actor: "lumi", gesture: "sway" }
      ],
      lines: [
        { speaker: "lumi", key: "e25.settle.1" },
        { speaker: "narrator", key: "e25.settle.2" }
      ],
      words: [
        { wordId: "night", objectId: "lumi" },
        { wordId: "close", objectId: "flowerOne" },
        { wordId: "hush", objectId: "peeko" }
      ],
      holdMs: 8500
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "object", target: "nightlight", action: "glow" },
        { do: "gesture", actor: "peeko", gesture: "sleep", loop: true },
        { do: "gesture", actor: "lumi", gesture: "sleep", loop: true }
      ],
      lines: [
        { speaker: "narrator", key: "e25.outro.1" },
        { speaker: "narrator", key: "e25.outro.2" }
      ],
      words: [
        { wordId: "close", objectId: "peeko" },
        { wordId: "night", objectId: "nightlight" },
        { wordId: "hush", objectId: "lumi" },
        { wordId: "sleep", objectId: "peeko" }
      ],
      holdMs: 9500
    }
  ]
};

export const episode: EpisodeSpec = E25_PEEKO_CRICKET_GARDEN;
