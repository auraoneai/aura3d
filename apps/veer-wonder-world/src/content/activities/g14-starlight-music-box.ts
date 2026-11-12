// G14 — Starlight Music Box (P2 bedtime activity, SleepingBaby-Songs-Games.PRD).
// Lumi and Momo share a hushed Moonlit Nursery evening. Tapping the wound music
// box or the overhead crib mobile — or simply watching through the 6 s wait —
// opens the lid and turns the felt stars while Momo gently rocks Teddy. The
// outro plays the 48 s instrumental "Silver Moon Music Box" once before rest.
import type { ActivitySpec } from "../../types.js";

export const G14_STARLIGHT_MUSIC_BOX: ActivitySpec = {
  kind: "activity",
  id: "starlight-music-box",
  number: 14,
  version: 1,
  phase: "P2",
  sleepCategory: "bedtime",
  titleKey: "g14.title",
  world: "moonlit-nursery",
  host: "lumi",
  cast: [
    { id: "lumi", at: "highLeft" },
    { id: "momo", at: "right" }
  ],
  props: [
    { id: "musicBox", asset: "musicBox", at: "center", size: 0.45 },
    { id: "cribMobile", asset: "cribMobile", at: "high", size: 0.75 },
    { id: "moon", asset: "moon", at: "highRight", size: 0.75 },
    { id: "cradle", asset: "cradle", at: "left", size: 0.65 },
    { id: "teddy", asset: "teddy", at: "frontRight", size: 0.55 }
  ],
  targetWords: ["star", "moon", "quiet"],
  supportWords: ["hello", "look", "teddy", "open", "close", "slow", "soft", "hush", "sleep", "more", "all-done"],
  music: "nurseryBed",
  offlinePlayKey: "g14.offline",
  caregiverBridgeKey: "g14.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:gemini-carbon-4",
    date: "2026-11-11"
  },
  options: { allowTap: true, dragAlternative: "tap", microphoneRequired: false },
  roundLimit: 3,
  roundVariants: [
    {
      setupStage: [{ do: "gesture", actor: "lumi", gesture: "twinkle" }]
    },
    {
      setupStage: [
        { do: "move", actor: "teddy", to: "left", style: "slide" },
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "momo", gesture: "yawn" }
      ],
      beatOverrides: {
        chime: {
          lines: [{ speaker: "lumi", key: "g14.chime.11" }],
          response: {
            stage: [
              { do: "object", target: "musicBox", action: "open" },
              { do: "object", target: "cribMobile", action: "spin" },
              { do: "sfx", sound: "pianoUp" },
              { do: "gesture", actor: "momo", gesture: "rock" },
              { do: "object", target: "cradle", action: "wobble" }
            ],
            lines: [
              { speaker: "lumi", key: "g14.chime.r11" },
              { speaker: "momo", key: "g14.chime.r12" }
            ],
            holdMs: 1500
          }
        }
      }
    },
    {
      setupStage: [
        { do: "sfx", sound: "ding" },
        { do: "gesture", actor: "lumi", gesture: "float" }
      ],
      reducedMotionSetupStage: [
        { do: "sfx", sound: "ding" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      beatOverrides: {
        chime: {
          lines: [{ speaker: "lumi", key: "g14.chime.21" }],
          response: {
            stage: [
              { do: "object", target: "musicBox", action: "open" },
              { do: "object", target: "cribMobile", action: "spin" },
              { do: "sfx", sound: "ding" },
              { do: "gesture", actor: "momo", gesture: "sway" }
            ],
            lines: [
              { speaker: "lumi", key: "g14.chime.r21" },
              { speaker: "narrator", key: "g14.chime.r22" }
            ],
            holdMs: 1500
          }
        }
      }
    }
  ],
  intro: [
    {
      id: "hello",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "nurseryBed" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "twinkle" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "object", target: "moon", action: "glow" }
      ],
      lines: [
        { speaker: "lumi", key: "g14.hello.1" },
        { speaker: "lumi", key: "g14.hello.2" }
      ],
      words: [
        { wordId: "hello", objectId: "lumi" },
        { wordId: "look", objectId: "moon" },
        { wordId: "moon", objectId: "moon" },
        { wordId: "quiet", objectId: "lumi" }
      ],
      holdMs: 1400
    },
    {
      id: "box-intro",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "object", target: "musicBox", action: "glow" },
        { do: "object", target: "cribMobile", action: "spin" },
        { do: "sfx", sound: "sparkle" },
        { do: "face", actor: "momo", toward: "musicBox" }
      ],
      reducedMotionStage: [
        { do: "object", target: "musicBox", action: "glow" },
        { do: "object", target: "cribMobile", action: "glow" },
        { do: "sfx", sound: "sparkle" },
        { do: "face", actor: "momo", toward: "musicBox" }
      ],
      lines: [
        { speaker: "momo", key: "g14.box-intro.1" },
        { speaker: "lumi", key: "g14.box-intro.2" }
      ],
      words: [
        { wordId: "star", objectId: "cribMobile" },
        { wordId: "open", objectId: "musicBox" },
        { wordId: "quiet", objectId: "musicBox" }
      ],
      holdMs: 1500
    }
  ],
  round: [
    {
      id: "chime",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "object", target: "musicBox", action: "close" },
        { do: "object", target: "musicBox", action: "glow" },
        { do: "object", target: "cribMobile", action: "glow" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "twinkle" }
      ],
      lines: [{ speaker: "lumi", key: "g14.chime.1" }],
      words: [
        { wordId: "star", objectId: "cribMobile" },
        { wordId: "soft", objectId: "cribMobile" }
      ],
      holdMs: 1000,
      input: { type: "tap", targets: ["musicBox", "cribMobile"] },
      waitMs: 6000,
      caregiverPromptKey: "g14.tip.1",
      response: {
        stage: [
          { do: "object", target: "musicBox", action: "open" },
          { do: "object", target: "cribMobile", action: "spin" },
          { do: "sfx", sound: "sparkle" },
          { do: "gesture", actor: "momo", gesture: "rock" },
          { do: "object", target: "teddy", action: "wobble" }
        ],
        lines: [
          { speaker: "lumi", key: "g14.chime.r1" },
          { speaker: "momo", key: "g14.chime.r2" }
        ],
        holdMs: 1500
      },
      responseByTarget: {
        musicBox: {
          stage: [
            { do: "object", target: "musicBox", action: "open" },
            { do: "sfx", sound: "pianoUp" },
            { do: "object", target: "cribMobile", action: "spin" },
            { do: "gesture", actor: "momo", gesture: "rock" }
          ]
        },
        cribMobile: {
          stage: [
            { do: "object", target: "cribMobile", action: "spin" },
            { do: "object", target: "musicBox", action: "open" },
            { do: "sfx", sound: "sparkle" },
            { do: "gesture", actor: "lumi", gesture: "twinkle" },
            { do: "gesture", actor: "momo", gesture: "rock" }
          ]
        }
      }
    },
    {
      id: "rock-teddy",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "object", target: "moon", action: "glow" },
        { do: "sfx", sound: "pianoDown" },
        { do: "face", actor: "momo", toward: "cradle" },
        { do: "gesture", actor: "momo", gesture: "rock" },
        { do: "object", target: "cradle", action: "wobble" }
      ],
      reducedMotionStage: [
        { do: "object", target: "moon", action: "glow" },
        { do: "sfx", sound: "pianoDown" },
        { do: "face", actor: "momo", toward: "cradle" },
        { do: "gesture", actor: "momo", gesture: "sway" },
        { do: "object", target: "cradle", action: "glow" }
      ],
      lines: [
        { speaker: "momo", key: "g14.rock-teddy.1" },
        { speaker: "narrator", key: "g14.rock-teddy.2" }
      ],
      words: [
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "moon", objectId: "moon" },
        { wordId: "slow", objectId: "cradle" },
        { wordId: "quiet", objectId: "musicBox" },
        { wordId: "hush", objectId: "lumi" }
      ],
      holdMs: 1500
    },
    {
      id: "more",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "object", target: "musicBox", action: "close" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      lines: [{ speaker: "lumi", key: "g14.more.1" }],
      words: [
        { wordId: "more", objectId: "musicBox" },
        { wordId: "quiet", objectId: "musicBox" },
        { wordId: "star", objectId: "cribMobile" }
      ],
      holdMs: 800,
      input: { type: "more-or-done", targets: ["musicBox", "cribMobile"] },
      waitMs: 6000,
      caregiverPromptKey: "g14.tip.2",
      response: {
        stage: [{ do: "gesture", actor: "lumi", gesture: "nod" }],
        lines: [],
        holdMs: 600
      },
      responseByTarget: {
        musicBox: {
          stage: [
            { do: "object", target: "musicBox", action: "glow" },
            { do: "gesture", actor: "lumi", gesture: "nod" }
          ]
        },
        cribMobile: {
          stage: [
            { do: "object", target: "cribMobile", action: "wobble" },
            { do: "gesture", actor: "lumi", gesture: "twinkle" }
          ]
        }
      }
    }
  ],
  outro: [
    {
      id: "music-box-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "object", target: "musicBox", action: "open" },
        { do: "song", song: "moonMusicBox" },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true },
        { do: "gesture", actor: "momo", gesture: "sleep", loop: true }
      ],
      reducedMotionStage: [
        { do: "object", target: "musicBox", action: "open" },
        { do: "song", song: "moonMusicBox" },
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "gesture", actor: "momo", gesture: "sleep" }
      ],
      lines: [],
      holdMs: 51000
    },
    {
      id: "goodnight",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "object", target: "musicBox", action: "close" },
        { do: "gesture", actor: "lumi", gesture: "sleep", loop: true },
        { do: "gesture", actor: "momo", gesture: "sleep", loop: true }
      ],
      lines: [
        { speaker: "narrator", key: "g14.goodnight.1" },
        { speaker: "narrator", key: "g14.goodnight.2" }
      ],
      words: [
        { wordId: "close", objectId: "musicBox" },
        { wordId: "moon", objectId: "moon" },
        { wordId: "star", objectId: "cribMobile" },
        { wordId: "all-done", objectId: "lumi" },
        { wordId: "quiet", objectId: "lumi" },
        { wordId: "sleep", objectId: "momo" }
      ],
      holdMs: 4000
    }
  ]
};

export const activity: ActivitySpec = G14_STARLIGHT_MUSIC_BOX;
