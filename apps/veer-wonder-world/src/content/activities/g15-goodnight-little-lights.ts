// G15 — Goodnight, Little Lights (P2 bedtime activity, SleepingBaby-Songs-Games.PRD).
// Momo and Lumi wind down in the warm evening Home Nook (`sleepCategory: "bedtime"`
// shifts the room to amber evening light). Across up to three calm rounds, a tap
// on the bedside nightlight or toy house — or resting through the 6 s wait —
// gently closes shutters and settles lights to a soft sleep glow, followed by
// "Moon Lullaby" in the outro.
import type { ActivitySpec } from "../../types.js";

export const G15_GOODNIGHT_LITTLE_LIGHTS: ActivitySpec = {
  kind: "activity",
  id: "goodnight-little-lights",
  number: 15,
  version: 1,
  phase: "P2",
  sleepCategory: "bedtime",
  titleKey: "g15.title",
  world: "home-nook",
  host: "momo",
  cast: [
    { id: "momo", at: "right" },
    { id: "lumi", at: "highLeft" }
  ],
  props: [
    { id: "nightlight", asset: "nightlight", at: "frontLeft", size: 0.45 },
    { id: "house", asset: "house", at: "center", size: 0.9 },
    { id: "bed", asset: "bed", at: "backRight", size: 0.78 },
    { id: "teddy", asset: "teddy", at: "frontRight", size: 0.52 },
    { id: "moon", asset: "moon", at: "highRight", size: 0.75 }
  ],
  targetWords: ["close", "night", "hush"],
  supportWords: ["hello", "look", "moon", "bed", "teddy", "quiet", "soft", "sleep", "more", "all-done"],
  music: "homeBed",
  offlinePlayKey: "g15.offline",
  caregiverBridgeKey: "g15.bridge",
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
      setupStage: [
        { do: "move", actor: "momo", to: "right", style: "walk" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ]
    },
    {
      setupStage: [
        { do: "move", actor: "teddy", to: "backRight", style: "slide" },
        { do: "move", actor: "momo", to: "right", style: "walk" },
        { do: "sfx", sound: "yawn" }
      ],
      beatOverrides: {
        "dim-light": {
          lines: [{ speaker: "momo", key: "g15.dim-light.11" }],
          response: {
            stage: [
              { do: "object", target: "house", action: "close" },
              { do: "object", target: "nightlight", action: "stop" },
              { do: "sfx", sound: "pianoDown" },
              { do: "gesture", actor: "momo", gesture: "sway" }
            ],
            lines: [
              { speaker: "momo", key: "g15.dim-light.r11" },
              { speaker: "lumi", key: "g15.dim-light.r12" }
            ],
            holdMs: 1400
          },
          responseByTarget: {
            nightlight: {
              stage: [
                { do: "object", target: "nightlight", action: "stop" },
                { do: "object", target: "house", action: "close" },
                { do: "sfx", sound: "pianoDown" },
                { do: "gesture", actor: "momo", gesture: "sway" }
              ]
            },
            house: {
              stage: [
                { do: "object", target: "house", action: "close" },
                { do: "object", target: "nightlight", action: "stop" },
                { do: "sfx", sound: "doorOpen" },
                { do: "gesture", actor: "lumi", gesture: "glow" }
              ]
            }
          }
        }
      }
    },
    {
      setupStage: [
        { do: "move", actor: "teddy", to: "backRight", style: "slide" },
        { do: "move", actor: "momo", to: "right", style: "walk" },
        { do: "gesture", actor: "lumi", gesture: "twinkle" }
      ],
      beatOverrides: {
        "dim-light": {
          lines: [{ speaker: "lumi", key: "g15.dim-light.21" }],
          response: {
            stage: [
              { do: "object", target: "nightlight", action: "stop" },
              { do: "object", target: "house", action: "close" },
              { do: "sfx", sound: "sparkle" },
              { do: "gesture", actor: "lumi", gesture: "float" }
            ],
            lines: [
              { speaker: "lumi", key: "g15.dim-light.r21" },
              { speaker: "momo", key: "g15.dim-light.r22" }
            ],
            holdMs: 1400
          },
          responseByTarget: {
            nightlight: {
              stage: [
                { do: "object", target: "nightlight", action: "stop" },
                { do: "object", target: "house", action: "close" },
                { do: "sfx", sound: "sparkle" },
                { do: "gesture", actor: "lumi", gesture: "float" }
              ]
            },
            house: {
              stage: [
                { do: "object", target: "house", action: "close" },
                { do: "object", target: "nightlight", action: "stop" },
                { do: "sfx", sound: "sparkle" },
                { do: "gesture", actor: "lumi", gesture: "float" }
              ]
            }
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
        { do: "music", bed: "homeBed" },
        { do: "object", target: "moon", action: "glow" },
        { do: "object", target: "nightlight", action: "glow" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      lines: [
        { speaker: "momo", key: "g15.hello.1" },
        { speaker: "lumi", key: "g15.hello.2" }
      ],
      words: [
        { wordId: "hello", objectId: "momo" },
        { wordId: "night", objectId: "moon" },
        { wordId: "moon", objectId: "moon" },
        { wordId: "quiet", objectId: "lumi" }
      ],
      holdMs: 1400
    },
    {
      id: "lights-hook",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "object", target: "house", action: "glow" },
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "momo", gesture: "yawn" },
        { do: "face", actor: "momo", toward: "nightlight" }
      ],
      lines: [
        { speaker: "momo", key: "g15.lights-hook.1" },
        { speaker: "narrator", key: "g15.lights-hook.2" }
      ],
      words: [
        { wordId: "look", objectId: "nightlight" },
        { wordId: "hush", objectId: "momo" },
        { wordId: "sleep", objectId: "bed" }
      ],
      holdMs: 1500
    }
  ],
  round: [
    {
      id: "dim-light",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "object", target: "nightlight", action: "glow" },
        { do: "object", target: "house", action: "open" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [{ speaker: "momo", key: "g15.dim-light.1" }],
      words: [
        { wordId: "close", objectId: "house" },
        { wordId: "night", objectId: "nightlight" }
      ],
      holdMs: 1000,
      input: { type: "tap", targets: ["nightlight", "house"] },
      waitMs: 6000,
      caregiverPromptKey: "g15.tip.1",
      response: {
        stage: [
          { do: "object", target: "house", action: "close" },
          { do: "object", target: "nightlight", action: "stop" },
          { do: "sfx", sound: "pianoDown" },
          { do: "gesture", actor: "lumi", gesture: "twinkle" },
          { do: "gesture", actor: "momo", gesture: "nod" }
        ],
        lines: [
          { speaker: "momo", key: "g15.dim-light.r1" },
          { speaker: "lumi", key: "g15.dim-light.r2" }
        ],
        holdMs: 1400
      },
      responseByTarget: {
        nightlight: {
          stage: [
            { do: "object", target: "nightlight", action: "stop" },
            { do: "object", target: "house", action: "close" },
            { do: "sfx", sound: "pianoDown" },
            { do: "gesture", actor: "momo", gesture: "nod" }
          ]
        },
        house: {
          stage: [
            { do: "object", target: "house", action: "close" },
            { do: "object", target: "nightlight", action: "stop" },
            { do: "sfx", sound: "doorOpen" },
            { do: "gesture", actor: "lumi", gesture: "glow" }
          ]
        }
      }
    },
    {
      id: "whisper-hush",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "yawn" },
        { do: "face", actor: "momo", toward: "teddy" },
        { do: "gesture", actor: "momo", gesture: "rock" },
        { do: "object", target: "teddy", action: "wobble" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "yawn" },
        { do: "face", actor: "momo", toward: "teddy" },
        { do: "gesture", actor: "momo", gesture: "sway" },
        { do: "object", target: "teddy", action: "glow" }
      ],
      lines: [
        { speaker: "lumi", key: "g15.whisper-hush.1" },
        { speaker: "narrator", key: "g15.whisper-hush.2" }
      ],
      words: [
        { wordId: "hush", objectId: "lumi" },
        { wordId: "soft", objectId: "teddy" },
        { wordId: "close", objectId: "momo" },
        { wordId: "night", objectId: "moon" }
      ],
      holdMs: 1400
    },
    {
      id: "more",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway" }
      ],
      lines: [{ speaker: "momo", key: "g15.more.1" }],
      words: [
        { wordId: "night", objectId: "nightlight" },
        { wordId: "more", objectId: "house" }
      ],
      holdMs: 800,
      input: { type: "more-or-done", targets: ["nightlight", "house"] },
      waitMs: 6000,
      caregiverPromptKey: "g15.tip.2",
      response: {
        stage: [{ do: "gesture", actor: "momo", gesture: "nod" }],
        lines: [],
        holdMs: 600
      },
      responseByTarget: {
        nightlight: {
          stage: [
            { do: "object", target: "nightlight", action: "glow" },
            { do: "gesture", actor: "momo", gesture: "nod" }
          ]
        },
        house: {
          stage: [
            { do: "object", target: "house", action: "wobble" },
            { do: "gesture", actor: "lumi", gesture: "nod" }
          ]
        }
      }
    }
  ],
  outro: [
    {
      id: "moon-lullaby",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "move", actor: "momo", to: "right", style: "walk" },
        { do: "song", song: "lullaby", performers: ["lumi"] },
        { do: "gesture", actor: "momo", gesture: "sleep", loop: true },
        { do: "gesture", actor: "lumi", gesture: "sway", loop: true }
      ],
      reducedMotionStage: [
        { do: "move", actor: "momo", to: "right", style: "walk" },
        { do: "song", song: "lullaby", performers: ["lumi"] },
        { do: "gesture", actor: "momo", gesture: "sleep" },
        { do: "gesture", actor: "lumi", gesture: "sway" }
      ],
      lines: [],
      words: [
        { wordId: "moon", objectId: "moon" },
        { wordId: "bed", objectId: "bed" },
        { wordId: "sleep", objectId: "momo" }
      ],
      holdMs: 24500
    },
    {
      id: "goodnight",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "gesture", actor: "momo", gesture: "sleep", loop: true },
        { do: "gesture", actor: "lumi", gesture: "sleep", loop: true }
      ],
      lines: [
        { speaker: "narrator", key: "g15.goodnight.1" },
        { speaker: "narrator", key: "g15.goodnight.2" }
      ],
      words: [
        { wordId: "close", objectId: "house" },
        { wordId: "all-done", objectId: "lumi" },
        { wordId: "hush", objectId: "lumi" },
        { wordId: "night", objectId: "moon" }
      ],
      holdMs: 4000
    }
  ]
};

export const activity: ActivitySpec = G15_GOODNIGHT_LITTLE_LIGHTS;
