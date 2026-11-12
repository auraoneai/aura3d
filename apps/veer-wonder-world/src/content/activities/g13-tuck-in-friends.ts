// G13 — Tuck In Friends (P2 bedtime activity, SleepingBaby-Songs-Games.PRD).
// Momo hosts in the warm Moonlit Nursery with Sheru (who never speaks lines)
// and Peeko. Across up to three unhurried wind-down rounds, a tap on the cozy
// blanket or bed — or simply resting through the 6 s wait — gently tucks Teddy,
// Sheru and Peeko in for the night, then plays "Snug Under the Blanket" once
// in the outro before everyone settles into slow sleep breathing.
import type { ActivitySpec } from "../../types.js";

export const G13_TUCK_IN_FRIENDS: ActivitySpec = {
  kind: "activity",
  id: "tuck-in-friends",
  number: 13,
  version: 1,
  phase: "P2",
  sleepCategory: "bedtime",
  titleKey: "g13.title",
  world: "moonlit-nursery",
  host: "momo",
  cast: [
    { id: "momo", at: "left" },
    { id: "sheru", at: "right" },
    { id: "peeko", at: "frontRight" }
  ],
  props: [
    { id: "bed", asset: "bed", at: "center", size: 0.7 },
    { id: "cradle", asset: "cradle", at: "backLeft", size: 0.65 },
    { id: "teddy", asset: "teddy", at: "front", size: 0.55 },
    { id: "blanket", asset: "blanket", at: "frontLeft", size: 0.5 },
    { id: "nightlight", asset: "nightlight", at: "backRight", size: 0.45 }
  ],
  targetWords: ["blanket", "bed", "sleep"],
  supportWords: ["hello", "teddy", "woof", "soft", "hush", "night", "more", "all-done"],
  music: "nurseryBed",
  offlinePlayKey: "g13.offline",
  caregiverBridgeKey: "g13.bridge",
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
      setupStage: [{ do: "gesture", actor: "momo", gesture: "sway" }]
    },
    {
      setupStage: [
        { do: "move", actor: "blanket", to: "frontLeft", style: "slide" },
        { do: "sfx", sound: "woofSoft" },
        { do: "gesture", actor: "sheru", gesture: "yawn" }
      ],
      beatOverrides: {
        tuck: {
          stage: [
            { do: "face", actor: "momo", toward: "sheru" },
            { do: "sfx", sound: "woofSoft" },
            { do: "gesture", actor: "sheru", gesture: "yawn" },
            { do: "object", target: "blanket", action: "glow" }
          ],
          lines: [
            { speaker: "momo", key: "g13.tuck.11" },
            { speaker: "momo", key: "g13.tuck.12" }
          ],
          response: {
            stage: [
              { do: "move", actor: "sheru", to: "center", style: "walk" },
              { do: "move", actor: "blanket", to: "center", style: "slide" },
              { do: "sfx", sound: "rustle" },
              { do: "gesture", actor: "sheru", gesture: "sleep", loop: true },
              { do: "gesture", actor: "momo", gesture: "nod" }
            ],
            lines: [
              { speaker: "momo", key: "g13.tuck.r11" },
              { speaker: "narrator", key: "g13.tuck.r12" }
            ],
            holdMs: 1400
          },
          responseByTarget: {
            blanket: {
              stage: [
                { do: "object", target: "blanket", action: "wobble" },
                { do: "move", actor: "sheru", to: "center", style: "walk" },
                { do: "move", actor: "blanket", to: "center", style: "slide" },
                { do: "sfx", sound: "rustle" },
                { do: "gesture", actor: "sheru", gesture: "sleep", loop: true }
              ]
            },
            bed: {
              stage: [
                { do: "object", target: "bed", action: "glow" },
                { do: "move", actor: "sheru", to: "center", style: "walk" },
                { do: "move", actor: "blanket", to: "center", style: "slide" },
                { do: "sfx", sound: "woofSoft" },
                { do: "gesture", actor: "sheru", gesture: "sleep", loop: true }
              ]
            }
          }
        }
      }
    },
    {
      setupStage: [
        { do: "move", actor: "blanket", to: "frontLeft", style: "slide" },
        { do: "sfx", sound: "tweet" },
        { do: "gesture", actor: "peeko", gesture: "yawn" }
      ],
      beatOverrides: {
        tuck: {
          stage: [
            { do: "face", actor: "momo", toward: "peeko" },
            { do: "sfx", sound: "tweet" },
            { do: "gesture", actor: "peeko", gesture: "yawn" },
            { do: "object", target: "cradle", action: "glow" },
            { do: "object", target: "blanket", action: "glow" }
          ],
          lines: [
            { speaker: "peeko", key: "g13.tuck.21" },
            { speaker: "momo", key: "g13.tuck.22" }
          ],
          response: {
            stage: [
              { do: "move", actor: "peeko", to: "backLeft", style: "walk" },
              { do: "move", actor: "blanket", to: "backLeft", style: "slide" },
              { do: "sfx", sound: "rustle" },
              { do: "gesture", actor: "peeko", gesture: "sleep", loop: true },
              { do: "gesture", actor: "momo", gesture: "rock" }
            ],
            lines: [
              { speaker: "momo", key: "g13.tuck.r21" },
              { speaker: "peeko", key: "g13.tuck.r22" }
            ],
            holdMs: 1400
          },
          responseByTarget: {
            blanket: {
              stage: [
                { do: "object", target: "blanket", action: "wobble" },
                { do: "move", actor: "peeko", to: "backLeft", style: "walk" },
                { do: "move", actor: "blanket", to: "backLeft", style: "slide" },
                { do: "sfx", sound: "rustle" },
                { do: "gesture", actor: "peeko", gesture: "sleep", loop: true }
              ]
            },
            bed: {
              stage: [
                { do: "object", target: "cradle", action: "glow" },
                { do: "move", actor: "peeko", to: "backLeft", style: "walk" },
                { do: "move", actor: "blanket", to: "backLeft", style: "slide" },
                { do: "sfx", sound: "tweet" },
                { do: "gesture", actor: "peeko", gesture: "sleep", loop: true }
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
        { do: "music", bed: "nurseryBed" },
        { do: "object", target: "nightlight", action: "glow" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "peeko", gesture: "sway" }
      ],
      lines: [
        { speaker: "momo", key: "g13.hello.1" },
        { speaker: "momo", key: "g13.hello.2" }
      ],
      words: [
        { wordId: "hello", objectId: "momo" },
        { wordId: "night", objectId: "nightlight" }
      ],
      holdMs: 1400
    },
    {
      id: "cozy-room",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "momo", gesture: "yawn" },
        { do: "object", target: "bed", action: "glow" },
        { do: "object", target: "blanket", action: "wobble" },
        { do: "face", actor: "momo", toward: "bed" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "momo", gesture: "yawn" },
        { do: "object", target: "bed", action: "glow" },
        { do: "object", target: "blanket", action: "glow" },
        { do: "face", actor: "momo", toward: "bed" }
      ],
      lines: [
        { speaker: "narrator", key: "g13.cozy-room.1" },
        { speaker: "momo", key: "g13.cozy-room.2" }
      ],
      words: [
        { wordId: "soft", objectId: "bed" },
        { wordId: "bed", objectId: "bed" },
        { wordId: "blanket", objectId: "blanket" },
        { wordId: "sleep", objectId: "momo" }
      ],
      holdMs: 1600
    }
  ],
  round: [
    {
      id: "tuck",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "teddy" },
        { do: "object", target: "teddy", action: "wobble" },
        { do: "object", target: "blanket", action: "glow" },
        { do: "sfx", sound: "yawn" }
      ],
      reducedMotionStage: [
        { do: "face", actor: "momo", toward: "teddy" },
        { do: "object", target: "teddy", action: "glow" },
        { do: "object", target: "blanket", action: "glow" },
        { do: "sfx", sound: "yawn" }
      ],
      lines: [
        { speaker: "momo", key: "g13.tuck.1" },
        { speaker: "momo", key: "g13.tuck.2" }
      ],
      words: [
        { wordId: "bed", objectId: "bed" },
        { wordId: "blanket", objectId: "blanket" }
      ],
      holdMs: 1000,
      input: { type: "tap", targets: ["blanket", "bed"] },
      waitMs: 6000,
      caregiverPromptKey: "g13.tip.1",
      response: {
        stage: [
          { do: "move", actor: "teddy", to: "center", style: "slide" },
          { do: "move", actor: "blanket", to: "center", style: "slide" },
          { do: "sfx", sound: "rustle" },
          { do: "gesture", actor: "momo", gesture: "rock" }
        ],
        lines: [
          { speaker: "momo", key: "g13.tuck.r1" },
          { speaker: "narrator", key: "g13.tuck.r2" }
        ],
        holdMs: 1400
      },
      responseByTarget: {
        blanket: {
          stage: [
            { do: "object", target: "blanket", action: "wobble" },
            { do: "move", actor: "teddy", to: "center", style: "slide" },
            { do: "move", actor: "blanket", to: "center", style: "slide" },
            { do: "sfx", sound: "rustle" },
            { do: "gesture", actor: "momo", gesture: "rock" }
          ]
        },
        bed: {
          stage: [
            { do: "object", target: "bed", action: "glow" },
            { do: "move", actor: "teddy", to: "center", style: "slide" },
            { do: "move", actor: "blanket", to: "center", style: "slide" },
            { do: "sfx", sound: "rustle" },
            { do: "gesture", actor: "momo", gesture: "nod" }
          ]
        }
      }
    },
    {
      id: "hush",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "momo", gesture: "rock" },
        { do: "object", target: "nightlight", action: "glow" }
      ],
      lines: [
        { speaker: "momo", key: "g13.hush.1" },
        { speaker: "narrator", key: "g13.hush.2" }
      ],
      words: [
        { wordId: "hush", objectId: "momo" },
        { wordId: "sleep", objectId: "bed" },
        { wordId: "soft", objectId: "blanket" }
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
      lines: [{ speaker: "momo", key: "g13.more.1" }],
      words: [
        { wordId: "more", objectId: "momo" },
        { wordId: "sleep", objectId: "bed" }
      ],
      holdMs: 800,
      input: { type: "more-or-done", targets: ["blanket", "bed"] },
      waitMs: 6000,
      caregiverPromptKey: "g13.tip.2",
      response: {
        stage: [{ do: "gesture", actor: "momo", gesture: "nod" }],
        lines: [],
        holdMs: 600
      },
      responseByTarget: {
        blanket: {
          stage: [
            { do: "object", target: "blanket", action: "wobble" },
            { do: "gesture", actor: "momo", gesture: "nod" }
          ]
        },
        bed: {
          stage: [
            { do: "object", target: "bed", action: "glow" },
            { do: "gesture", actor: "momo", gesture: "nod" }
          ]
        }
      }
    }
  ],
  outro: [
    {
      id: "blanket-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "warmBlanketSong", performers: ["momo"] },
        { do: "gesture", actor: "sheru", gesture: "sleep", loop: true },
        { do: "gesture", actor: "peeko", gesture: "sleep", loop: true },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "warmBlanketSong", performers: ["momo"] },
        { do: "gesture", actor: "sheru", gesture: "sleep" },
        { do: "gesture", actor: "peeko", gesture: "sleep" },
        { do: "gesture", actor: "momo", gesture: "sway" }
      ],
      lines: [],
      words: [
        { wordId: "blanket", objectId: "blanket" },
        { wordId: "sleep", objectId: "momo" }
      ],
      holdMs: 39000
    },
    {
      id: "goodnight",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sleep", loop: true },
        { do: "gesture", actor: "sheru", gesture: "sleep", loop: true },
        { do: "gesture", actor: "peeko", gesture: "sleep", loop: true }
      ],
      lines: [
        { speaker: "narrator", key: "g13.goodnight.1" },
        { speaker: "narrator", key: "g13.goodnight.2" }
      ],
      words: [
        { wordId: "bed", objectId: "bed" },
        { wordId: "all-done", objectId: "momo" },
        { wordId: "sleep", objectId: "momo" }
      ],
      holdMs: 4000
    }
  ]
};

export const activity: ActivitySpec = G13_TUCK_IN_FRIENDS;
