// E24 — GoGo's Quiet Night Train (P2 bedtime episode).
// GoGo glides into the evening Station with Peeko, carrying sleepy Teddy under a
// warm blanket while `dreamBoatSong` plays softly beneath the silver moon.
import type { EpisodeSpec, SongCue } from "../../types.js";

const DREAM_BOAT_CUES: readonly SongCue[] = [
  { line: 0, stage: [{ do: "gesture", actor: "carriage", gesture: "rock" }] },
  { line: 1, stage: [{ do: "object", target: "moon", action: "glow" }] },
  { line: 3, stage: [{ do: "object", target: "blanket", action: "wobble" }] },
  { line: 5, stage: [{ do: "object", target: "teddy", action: "wobble" }] }
];

export const E24_GOGO_QUIET_NIGHT_TRAIN: EpisodeSpec = {
  kind: "episode",
  id: "gogo-quiet-night-train",
  number: 24,
  version: 1,
  phase: "P2",
  sleepCategory: "bedtime",
  titleKey: "e24.title",
  world: "station",
  host: "gogo",
  cast: [
    { id: "gogo", at: "backLeft" },
    { id: "peeko", at: "frontRight" }
  ],
  props: [
    { id: "carriage", asset: "gogoCarriage", at: "offLeft", size: 0.68 },
    { id: "teddy", asset: "teddy", at: "center", size: 0.36 },
    { id: "blanket", asset: "blanket", at: "frontLeft", size: 0.22 },
    { id: "moon", asset: "moon", at: "highRight", size: 0.7 }
  ],
  targetWords: ["slow", "quiet", "sleep"],
  supportWords: ["hello", "train", "teddy", "blanket", "moon", "hush", "night", "stop"],
  music: "stationBed",
  offlinePlayKey: "e24.offline",
  caregiverBridgeKey: "e24.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:gemini-carbon-4",
    date: "2026-11-11"
  },
  estimatedDurationSec: 162,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "stationBed" },
        { do: "sfx", sound: "chugga" },
        { do: "move", actor: "gogo", to: "back", style: "drive" },
        { do: "enter", actor: "carriage", at: "backLeft", from: "offLeft", style: "drive" },
        { do: "face", actor: "carriage", toward: "gogo" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "wave" },
        { do: "object", target: "moon", action: "glow" }
      ],
      lines: [
        { speaker: "gogo", key: "e24.greet.1" },
        { speaker: "peeko", key: "e24.greet.2" }
      ],
      words: [
        { wordId: "hello", objectId: "gogo" },
        { wordId: "slow", objectId: "gogo" },
        { wordId: "night", objectId: "moon" },
        { wordId: "quiet", objectId: "peeko" }
      ],
      holdMs: 7000
    },
    {
      id: "carriage-hook",
      kind: "hook",
      camera: "wide",
      stage: [
        { do: "object", target: "carriage", action: "open" },
        { do: "carry", actor: "carriage", item: "teddy" },
        { do: "carry", actor: "teddy", item: "blanket" },
        { do: "face", actor: "peeko", toward: "carriage" },
        { do: "gesture", actor: "gogo", gesture: "sway" }
      ],
      lines: [
        { speaker: "narrator", key: "e24.carriage-hook.1" },
        { speaker: "gogo", key: "e24.carriage-hook.2" }
      ],
      words: [
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "blanket", objectId: "blanket" },
        { wordId: "slow", objectId: "gogo" },
        { wordId: "quiet", objectId: "carriage" }
      ],
      holdMs: 7500
    },
    {
      id: "slow-invite",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "carriage", toward: "gogo" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "gesture", actor: "peeko", gesture: "nod" }
      ],
      lines: [{ speaker: "gogo", key: "e24.slow-invite.1" }],
      holdMs: 2500,
      input: { type: "tap", targets: ["gogo", "carriage"] },
      waitMs: 6000,
      caregiverPromptKey: "e24.tip.1",
      response: {
        stage: [
          { do: "sfx", sound: "chugga" },
          { do: "gesture", actor: "carriage", gesture: "rock" },
          { do: "gesture", actor: "gogo", gesture: "rock" },
          { do: "gesture", actor: "peeko", gesture: "sway" }
        ],
        lines: [
          { speaker: "peeko", key: "e24.slow-invite.2" },
          { speaker: "narrator", key: "e24.slow-invite.3" }
        ],
        holdMs: 6500
      },
      responseByTarget: {
        gogo: {
          stage: [
            { do: "sfx", sound: "chugga" },
            { do: "gesture", actor: "gogo", gesture: "rock" },
            { do: "gesture", actor: "carriage", gesture: "sway" }
          ]
        },
        carriage: {
          stage: [
            { do: "gesture", actor: "carriage", gesture: "rock" },
            { do: "object", target: "teddy", action: "wobble" },
            { do: "gesture", actor: "peeko", gesture: "sway" }
          ]
        }
      },
      words: [
        { wordId: "slow", objectId: "gogo" },
        { wordId: "quiet", objectId: "carriage" },
        { wordId: "moon", objectId: "moon" },
        { wordId: "train", objectId: "gogo" }
      ]
    },
    {
      id: "dream-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "face", actor: "carriage", toward: "gogo" },
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "song", song: "dreamBoatSong", performers: ["gogo", "peeko"], cues: DREAM_BOAT_CUES }
      ],
      lines: [],
      holdMs: 44500
    },
    {
      id: "station-stop",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "object", target: "carriage", action: "stop" },
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "peeko", gesture: "yawn" },
        { do: "gesture", actor: "gogo", gesture: "nod" }
      ],
      lines: [
        { speaker: "gogo", key: "e24.station-stop.1" },
        { speaker: "peeko", key: "e24.station-stop.2" }
      ],
      words: [
        { wordId: "slow", objectId: "gogo" },
        { wordId: "stop", objectId: "carriage" },
        { wordId: "quiet", objectId: "peeko" },
        { wordId: "sleep", objectId: "teddy" }
      ],
      holdMs: 7500
    },
    {
      id: "sleep-invite",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "peeko", toward: "viewer" },
        { do: "object", target: "blanket", action: "glow" }
      ],
      lines: [{ speaker: "peeko", key: "e24.sleep-invite.1" }],
      holdMs: 2500,
      input: { type: "tap", targets: ["blanket", "moon"] },
      waitMs: 6000,
      caregiverPromptKey: "e24.tip.2",
      response: {
        stage: [
          { do: "object", target: "blanket", action: "wobble" },
          { do: "object", target: "moon", action: "glow" },
          { do: "gesture", actor: "peeko", gesture: "rock" },
          { do: "gesture", actor: "gogo", gesture: "sway" }
        ],
        lines: [
          { speaker: "gogo", key: "e24.sleep-invite.2" },
          { speaker: "narrator", key: "e24.sleep-invite.3" }
        ],
        holdMs: 6500
      },
      responseByTarget: {
        blanket: {
          stage: [
            { do: "object", target: "blanket", action: "wobble" },
            { do: "gesture", actor: "peeko", gesture: "rock" },
            { do: "gesture", actor: "gogo", gesture: "sway" }
          ]
        },
        moon: {
          stage: [
            { do: "object", target: "moon", action: "glow" },
            { do: "sfx", sound: "sparkle" },
            { do: "gesture", actor: "peeko", gesture: "rock" }
          ]
        }
      },
      words: [
        { wordId: "blanket", objectId: "blanket" },
        { wordId: "hush", objectId: "gogo" },
        { wordId: "quiet", objectId: "gogo" },
        { wordId: "sleep", objectId: "peeko" },
        { wordId: "train", objectId: "gogo" }
      ]
    },
    {
      id: "settle",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "object", target: "moon", action: "glow" },
        { do: "gesture", actor: "gogo", gesture: "yawn" },
        { do: "gesture", actor: "peeko", gesture: "sit" }
      ],
      lines: [
        { speaker: "narrator", key: "e24.settle.1" },
        { speaker: "gogo", key: "e24.settle.2" }
      ],
      words: [
        { wordId: "slow", objectId: "gogo" },
        { wordId: "quiet", objectId: "gogo" },
        { wordId: "moon", objectId: "moon" },
        { wordId: "sleep", objectId: "gogo" }
      ],
      holdMs: 8000
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "object", target: "moon", action: "glow" },
        { do: "gesture", actor: "gogo", gesture: "sleep", loop: true },
        { do: "gesture", actor: "peeko", gesture: "sleep", loop: true }
      ],
      lines: [
        { speaker: "narrator", key: "e24.outro.1" },
        { speaker: "narrator", key: "e24.outro.2" }
      ],
      words: [
        { wordId: "quiet", objectId: "gogo" },
        { wordId: "sleep", objectId: "peeko" },
        { wordId: "hush", objectId: "gogo" },
        { wordId: "night", objectId: "moon" }
      ],
      holdMs: 9000
    }
  ]
};

export const episode: EpisodeSpec = E24_GOGO_QUIET_NIGHT_TRAIN;
