// E26 — Drifting Dream Clouds (P2 bedtime episode).
// Lumi, Momo, and Peeko float softly on the Starlight Cloud with `sleepyClouds`
// and the pure instrumental `moonMusicBox`, drifting into quiet dreams.
import type { EpisodeSpec, SongCue } from "../../types.js";

const SLEEPY_CLOUDS_CUES: readonly SongCue[] = [
  { line: 0, stage: [{ do: "object", target: "cloudOne", action: "wobble" }] },
  { line: 2, stage: [{ do: "object", target: "cloudTwo", action: "glow" }] },
  { line: 3, stage: [{ do: "object", target: "moon", action: "glow" }] },
  { line: 5, stage: [{ do: "object", target: "blanket", action: "wobble" }] }
];

export const E26_DRIFTING_DREAM_CLOUDS: EpisodeSpec = {
  kind: "episode",
  id: "drifting-dream-clouds",
  number: 26,
  version: 1,
  phase: "P2",
  sleepCategory: "bedtime",
  titleKey: "e26.title",
  world: "starlight-cloud",
  host: "lumi",
  cast: [
    { id: "lumi", at: "highLeft" },
    { id: "momo", at: "left" },
    { id: "peeko", at: "right" }
  ],
  props: [
    { id: "cloudOne", asset: "sleepyCloud", at: "backLeft", size: 0.52 },
    { id: "cloudTwo", asset: "sleepyCloud", at: "backRight", size: 0.56 },
    { id: "cribMobile", asset: "cribMobile", at: "high", size: 0.55 },
    { id: "moon", asset: "moon", at: "highRight", size: 0.7 },
    { id: "blanket", asset: "blanket", at: "center", size: 0.22 }
  ],
  targetWords: ["cloud", "dream", "soft"],
  supportWords: ["hello", "moon", "blanket", "sleep", "quiet", "hush", "night"],
  music: "starlightBed",
  offlinePlayKey: "e26.offline",
  caregiverBridgeKey: "e26.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:gemini-carbon-4",
    date: "2026-11-11"
  },
  estimatedDurationSec: 175,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "starlightBed" },
        { do: "object", target: "cloudOne", action: "up" },
        { do: "object", target: "cloudTwo", action: "up" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "twinkle" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "object", target: "moon", action: "glow" }
      ],
      lines: [
        { speaker: "lumi", key: "e26.greet.1" },
        { speaker: "momo", key: "e26.greet.2" }
      ],
      words: [
        { wordId: "hello", objectId: "lumi" },
        { wordId: "soft", objectId: "cloudOne" },
        { wordId: "cloud", objectId: "cloudOne" }
      ],
      holdMs: 3500
    },
    {
      id: "cloud-hook",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "object", target: "cribMobile", action: "spin" },
        { do: "gesture", actor: "peeko", gesture: "sway" },
        { do: "object", target: "cloudOne", action: "glow" }
      ],
      lines: [
        { speaker: "peeko", key: "e26.cloud-hook.1" },
        { speaker: "narrator", key: "e26.cloud-hook.2" }
      ],
      words: [
        { wordId: "dream", objectId: "cribMobile" },
        { wordId: "moon", objectId: "moon" },
        { wordId: "soft", objectId: "cloudTwo" },
        { wordId: "cloud", objectId: "cloudTwo" }
      ],
      holdMs: 3500
    },
    {
      id: "cloud-invite",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      lines: [{ speaker: "lumi", key: "e26.cloud-invite.1" }],
      holdMs: 1500,
      input: { type: "tap", targets: ["cloudOne", "cloudTwo"] },
      waitMs: 6000,
      caregiverPromptKey: "e26.tip.1",
      response: {
        stage: [
          { do: "object", target: "cloudOne", action: "wobble" },
          { do: "object", target: "cloudTwo", action: "glow" },
          { do: "sfx", sound: "sparkle" },
          { do: "gesture", actor: "momo", gesture: "rock" },
          { do: "gesture", actor: "peeko", gesture: "sway" }
        ],
        lines: [
          { speaker: "momo", key: "e26.cloud-invite.2" },
          { speaker: "peeko", key: "e26.cloud-invite.3" }
        ],
        holdMs: 3500
      },
      responseByTarget: {
        cloudOne: {
          stage: [
            { do: "object", target: "cloudOne", action: "wobble" },
            { do: "sfx", sound: "sparkle" },
            { do: "gesture", actor: "momo", gesture: "rock" }
          ]
        },
        cloudTwo: {
          stage: [
            { do: "object", target: "cloudTwo", action: "wobble" },
            { do: "sfx", sound: "sparkle" },
            { do: "gesture", actor: "peeko", gesture: "sway" }
          ]
        }
      },
      words: [
        { wordId: "soft", objectId: "cloudOne" },
        { wordId: "cloud", objectId: "cloudOne" },
        { wordId: "dream", objectId: "cloudTwo" }
      ]
    },
    {
      id: "clouds-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "song", song: "sleepyClouds", performers: ["lumi", "momo", "peeko"], cues: SLEEPY_CLOUDS_CUES }
      ],
      lines: [],
      holdMs: 42500
    },
    {
      id: "blanket-invite",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "momo", gesture: "yawn" },
        { do: "gesture", actor: "peeko", gesture: "yawn" },
        { do: "object", target: "blanket", action: "glow" }
      ],
      lines: [{ speaker: "lumi", key: "e26.blanket-invite.1" }],
      holdMs: 1500,
      input: { type: "tap", targets: ["blanket", "cribMobile"] },
      waitMs: 6000,
      caregiverPromptKey: "e26.tip.2",
      response: {
        stage: [
          { do: "object", target: "blanket", action: "wobble" },
          { do: "object", target: "cribMobile", action: "spin" },
          { do: "gesture", actor: "lumi", gesture: "twinkle" },
          { do: "gesture", actor: "momo", gesture: "sway" }
        ],
        lines: [
          { speaker: "narrator", key: "e26.blanket-invite.2" },
          { speaker: "lumi", key: "e26.blanket-invite.3" }
        ],
        holdMs: 3500
      },
      responseByTarget: {
        blanket: {
          stage: [
            { do: "object", target: "blanket", action: "wobble" },
            { do: "gesture", actor: "momo", gesture: "rock" },
            { do: "gesture", actor: "peeko", gesture: "rock" }
          ]
        },
        cribMobile: {
          stage: [
            { do: "object", target: "cribMobile", action: "spin" },
            { do: "sfx", sound: "sparkle" },
            { do: "gesture", actor: "lumi", gesture: "twinkle" }
          ]
        }
      },
      words: [
        { wordId: "soft", objectId: "blanket" },
        { wordId: "blanket", objectId: "blanket" },
        { wordId: "cloud", objectId: "cloudOne" },
        { wordId: "dream", objectId: "cribMobile" },
        { wordId: "hush", objectId: "lumi" }
      ]
    },
    {
      id: "musicbox-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "object", target: "moon", action: "glow" },
        { do: "gesture", actor: "momo", gesture: "rock", loop: true },
        { do: "gesture", actor: "peeko", gesture: "sway", loop: true },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true },
        { do: "song", song: "moonMusicBox", performers: [] }
      ],
      lines: [],
      holdMs: 50500
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "object", target: "moon", action: "glow" },
        { do: "gesture", actor: "lumi", gesture: "sleep", loop: true },
        { do: "gesture", actor: "momo", gesture: "sleep", loop: true },
        { do: "gesture", actor: "peeko", gesture: "sleep", loop: true }
      ],
      lines: [
        { speaker: "narrator", key: "e26.outro.1" },
        { speaker: "narrator", key: "e26.outro.2" },
        { speaker: "narrator", key: "e26.outro.3" }
      ],
      words: [
        { wordId: "soft", objectId: "cloudOne" },
        { wordId: "cloud", objectId: "cloudTwo" },
        { wordId: "dream", objectId: "lumi" },
        { wordId: "sleep", objectId: "momo" },
        { wordId: "night", objectId: "moon" }
      ],
      holdMs: 6500
    }
  ]
};

export const episode: EpisodeSpec = E26_DRIFTING_DREAM_CLOUDS;
