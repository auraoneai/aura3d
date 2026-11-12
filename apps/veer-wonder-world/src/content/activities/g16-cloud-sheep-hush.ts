// G16 — Cloud Sheep Hush (P2 bedtime activity, SleepingBaby-Songs-Games.PRD).
// Lulu and Lumi host on the dusk-plum Starlight Cloud with fluffy sheep and
// lavender sleepyCloud pillows. Kept free of counting words so drowsy babies
// simply watch or tap a wooly sheep as it floats onto a soft cloud, yawns, and
// drifts into slow breathing through the 52 s instrumental "Starlight Cradle Music".
import type { ActivitySpec } from "../../types.js";

export const G16_CLOUD_SHEEP_HUSH: ActivitySpec = {
  kind: "activity",
  id: "cloud-sheep-hush",
  number: 16,
  version: 1,
  phase: "P2",
  sleepCategory: "bedtime",
  titleKey: "g16.title",
  world: "starlight-cloud",
  host: "lulu",
  cast: [
    { id: "lulu", at: "right" },
    { id: "lumi", at: "high" }
  ],
  props: [
    { id: "sheepOne", asset: "sheep", at: "left", size: 0.6 },
    { id: "sheepTwo", asset: "sheep", at: "center", size: 0.6 },
    { id: "cloudOne", asset: "sleepyCloud", at: "frontLeft", size: 0.55 },
    { id: "cloudTwo", asset: "sleepyCloud", at: "front", size: 0.55 },
    { id: "blanket", asset: "blanket", at: "frontRight", size: 0.5 }
  ],
  targetWords: ["sheep", "soft", "cloud"],
  supportWords: ["hello", "look", "baa", "blanket", "quiet", "hush", "slow", "sleep", "more", "all-done"],
  music: "starlightBed",
  offlinePlayKey: "g16.offline",
  caregiverBridgeKey: "g16.bridge",
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
        { do: "sfx", sound: "baa" },
        { do: "gesture", actor: "lulu", gesture: "sway" }
      ],
      beatOverrides: {
        "float-sheep": {
          lines: [{ speaker: "lulu", key: "g16.float-sheep.11" }],
          response: {
            stage: [
              { do: "move", actor: "sheepTwo", to: "front", style: "float" },
              { do: "move", actor: "blanket", to: "front", style: "slide" },
              { do: "sfx", sound: "rustle" },
              { do: "object", target: "cloudTwo", action: "glow" },
              { do: "gesture", actor: "lulu", gesture: "rock" }
            ],
            lines: [
              { speaker: "lulu", key: "g16.float-sheep.r11" },
              { speaker: "lumi", key: "g16.float-sheep.r12" }
            ],
            holdMs: 1500
          }
        }
      }
    },
    {
      setupStage: [
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "lumi", gesture: "float" }
      ],
      reducedMotionSetupStage: [
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      beatOverrides: {
        "float-sheep": {
          lines: [{ speaker: "lumi", key: "g16.float-sheep.21" }],
          response: {
            stage: [
              { do: "object", target: "cloudOne", action: "glow" },
              { do: "object", target: "cloudTwo", action: "glow" },
              { do: "sfx", sound: "sparkle" },
              { do: "gesture", actor: "lulu", gesture: "sway" }
            ],
            lines: [
              { speaker: "lumi", key: "g16.float-sheep.r21" },
              { speaker: "narrator", key: "g16.float-sheep.r22" }
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
        { do: "music", bed: "starlightBed" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "gesture", actor: "lumi", gesture: "twinkle" }
      ],
      lines: [
        { speaker: "lulu", key: "g16.hello.1" },
        { speaker: "lumi", key: "g16.hello.2" }
      ],
      words: [
        { wordId: "hello", objectId: "lulu" },
        { wordId: "soft", objectId: "cloudOne" },
        { wordId: "cloud", objectId: "cloudOne" }
      ],
      holdMs: 1400
    },
    {
      id: "fluffy-hook",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "baa" },
        { do: "object", target: "sheepOne", action: "wobble" },
        { do: "object", target: "cloudOne", action: "glow" },
        { do: "face", actor: "lulu", toward: "sheepOne" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "baa" },
        { do: "object", target: "sheepOne", action: "glow" },
        { do: "object", target: "cloudOne", action: "glow" },
        { do: "face", actor: "lulu", toward: "sheepOne" }
      ],
      lines: [
        { speaker: "lulu", key: "g16.fluffy-hook.1" },
        { speaker: "narrator", key: "g16.fluffy-hook.2" }
      ],
      words: [
        { wordId: "look", objectId: "sheepOne" },
        { wordId: "sheep", objectId: "sheepOne" },
        { wordId: "soft", objectId: "cloudOne" },
        { wordId: "cloud", objectId: "cloudTwo" }
      ],
      holdMs: 1500
    }
  ],
  round: [
    {
      id: "float-sheep",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "object", target: "sheepOne", action: "glow" },
        { do: "object", target: "sheepTwo", action: "glow" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "sway" }
      ],
      lines: [{ speaker: "lulu", key: "g16.float-sheep.1" }],
      words: [
        { wordId: "soft", objectId: "sheepOne" },
        { wordId: "sheep", objectId: "sheepOne" },
        { wordId: "cloud", objectId: "cloudOne" }
      ],
      holdMs: 1000,
      input: { type: "tap", targets: ["sheepOne", "sheepTwo"] },
      waitMs: 6000,
      caregiverPromptKey: "g16.tip.1",
      response: {
        stage: [
          { do: "move", actor: "sheepOne", to: "frontLeft", style: "float" },
          { do: "sfx", sound: "baa" },
          { do: "object", target: "cloudOne", action: "glow" },
          { do: "gesture", actor: "lulu", gesture: "rock" }
        ],
        lines: [
          { speaker: "lulu", key: "g16.float-sheep.r1" },
          { speaker: "narrator", key: "g16.float-sheep.r2" }
        ],
        holdMs: 1500
      },
      responseByTarget: {
        sheepOne: {
          stage: [
            { do: "move", actor: "sheepOne", to: "frontLeft", style: "float" },
            { do: "sfx", sound: "baa" },
            { do: "object", target: "cloudOne", action: "glow" },
            { do: "gesture", actor: "lulu", gesture: "rock" }
          ]
        },
        sheepTwo: {
          stage: [
            { do: "move", actor: "sheepTwo", to: "front", style: "float" },
            { do: "sfx", sound: "baa" },
            { do: "object", target: "cloudTwo", action: "glow" },
            { do: "gesture", actor: "lumi", gesture: "twinkle" }
          ]
        }
      }
    },
    {
      id: "sheep-yawn",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "lulu", gesture: "yawn" },
        { do: "gesture", actor: "lumi", gesture: "float" },
        { do: "object", target: "blanket", action: "wobble" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "lulu", gesture: "yawn" },
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "object", target: "blanket", action: "glow" }
      ],
      lines: [
        { speaker: "lumi", key: "g16.sheep-yawn.1" },
        { speaker: "narrator", key: "g16.sheep-yawn.2" }
      ],
      words: [
        { wordId: "hush", objectId: "lumi" },
        { wordId: "blanket", objectId: "blanket" },
        { wordId: "quiet", objectId: "lumi" },
        { wordId: "slow", objectId: "sheepOne" },
        { wordId: "soft", objectId: "cloudTwo" },
        { wordId: "cloud", objectId: "cloudTwo" }
      ],
      holdMs: 1500
    },
    {
      id: "more",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "sway" }
      ],
      lines: [{ speaker: "lulu", key: "g16.more.1" }],
      words: [
        { wordId: "more", objectId: "cloudOne" },
        { wordId: "soft", objectId: "sheepTwo" },
        { wordId: "sheep", objectId: "sheepTwo" },
        { wordId: "cloud", objectId: "cloudOne" }
      ],
      holdMs: 800,
      input: { type: "more-or-done", targets: ["cloudOne", "cloudTwo"] },
      waitMs: 6000,
      caregiverPromptKey: "g16.tip.2",
      response: {
        stage: [{ do: "gesture", actor: "lulu", gesture: "nod" }],
        lines: [],
        holdMs: 600
      },
      responseByTarget: {
        cloudOne: {
          stage: [
            { do: "object", target: "cloudOne", action: "glow" },
            { do: "gesture", actor: "lulu", gesture: "nod" }
          ]
        },
        cloudTwo: {
          stage: [
            { do: "object", target: "cloudTwo", action: "glow" },
            { do: "gesture", actor: "lumi", gesture: "nod" }
          ]
        }
      }
    }
  ],
  outro: [
    {
      id: "starlight-cradle",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "starlightHum" },
        { do: "gesture", actor: "lulu", gesture: "sleep", loop: true },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "starlightHum" },
        { do: "gesture", actor: "lulu", gesture: "sleep" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      lines: [],
      holdMs: 55000
    },
    {
      id: "goodnight",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "gesture", actor: "lulu", gesture: "sleep", loop: true },
        { do: "gesture", actor: "lumi", gesture: "sleep", loop: true }
      ],
      lines: [
        { speaker: "narrator", key: "g16.goodnight.1" },
        { speaker: "narrator", key: "g16.goodnight.2" }
      ],
      words: [
        { wordId: "soft", objectId: "sheepOne" },
        { wordId: "sheep", objectId: "sheepOne" },
        { wordId: "cloud", objectId: "cloudOne" },
        { wordId: "all-done", objectId: "lulu" },
        { wordId: "sleep", objectId: "lulu" }
      ],
      holdMs: 4000
    }
  ]
};

export const activity: ActivitySpec = G16_CLOUD_SHEEP_HUSH;
