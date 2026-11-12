// E23 — Three Sleepy Sheep (P2 bedtime counting episode).
// Lulu and Lumi count three fluffy sheep (`sheepOne`, `sheepTwo`, `sheepThree`)
// arriving one at a time on the Starlight Cloud before singing `countingSheepSong`.
import type { EpisodeSpec, SongCue } from "../../types.js";

const COUNTING_SHEEP_CUES: readonly SongCue[] = [
  { line: 0, stage: [{ do: "object", target: "sheepOne", action: "wobble" }] },
  { line: 1, stage: [{ do: "object", target: "sheepTwo", action: "wobble" }] },
  { line: 2, stage: [{ do: "object", target: "sheepThree", action: "wobble" }] },
  { line: 4, stage: [{ do: "sfx", sound: "baa" }] },
  { line: 5, stage: [{ do: "object", target: "moon", action: "glow" }] }
];

export const E23_THREE_SLEEPY_SHEEP: EpisodeSpec = {
  kind: "episode",
  id: "three-sleepy-sheep",
  number: 23,
  version: 1,
  phase: "P2",
  sleepCategory: "bedtime",
  titleKey: "e23.title",
  world: "starlight-cloud",
  host: "lulu",
  cast: [
    { id: "lulu", at: "frontLeft" },
    { id: "lumi", at: "highLeft" }
  ],
  props: [
    { id: "sheepOne", asset: "sheep", at: "left", hidden: true, size: 0.55 },
    { id: "sheepTwo", asset: "sheep", at: "center", hidden: true, size: 0.55 },
    { id: "sheepThree", asset: "sheep", at: "right", hidden: true, size: 0.55 },
    { id: "cloudOne", asset: "sleepyCloud", at: "backLeft", size: 0.7 },
    { id: "cloudTwo", asset: "sleepyCloud", at: "backRight", size: 0.7 },
    { id: "moon", asset: "moon", at: "highRight", size: 0.7 }
  ],
  targetWords: ["one", "two", "three", "sheep"],
  supportWords: ["hello", "look", "cloud", "baa", "soft", "sleep", "hush", "night"],
  numberConcept: {
    countMin: 1,
    countMax: 3,
    countedObjectIds: ["sheepOne", "sheepTwo", "sheepThree"]
  },
  music: "starlightBed",
  offlinePlayKey: "e23.offline",
  caregiverBridgeKey: "e23.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:gemini-carbon-4",
    date: "2026-11-11"
  },
  estimatedDurationSec: 168,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "starlightBed" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "gesture", actor: "lumi", gesture: "twinkle" },
        { do: "object", target: "moon", action: "glow" }
      ],
      lines: [
        { speaker: "lulu", key: "e23.greet.1" },
        { speaker: "lumi", key: "e23.greet.2" }
      ],
      words: [
        { wordId: "hello", objectId: "lulu" },
        { wordId: "cloud", objectId: "cloudOne" },
        { wordId: "night", objectId: "moon" }
      ],
      holdMs: 6500
    },
    {
      id: "count-one",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "enter", actor: "sheepOne", at: "left", from: "offLeft", style: "walk" },
        { do: "sfx", sound: "baa" },
        { do: "face", actor: "lulu", toward: "sheepOne" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [
        { speaker: "lulu", key: "e23.count-one.1" },
        { speaker: "narrator", key: "e23.count-one.2" }
      ],
      words: [
        { wordId: "look", objectId: "sheepOne" },
        { wordId: "one", objectId: "sheepOne" },
        { wordId: "sheep", objectId: "sheepOne" }
      ],
      holdMs: 7500
    },
    {
      id: "invite-one",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      lines: [{ speaker: "lulu", key: "e23.invite-one.1" }],
      holdMs: 2500,
      input: { type: "tap", targets: ["sheepOne", "cloudOne"] },
      waitMs: 6000,
      caregiverPromptKey: "e23.tip.1",
      response: {
        stage: [
          { do: "object", target: "sheepOne", action: "wobble" },
          { do: "sfx", sound: "baa" },
          { do: "gesture", actor: "lulu", gesture: "nod" }
        ],
        lines: [
          { speaker: "lumi", key: "e23.invite-one.2" },
          { speaker: "narrator", key: "e23.invite-one.3" }
        ],
        holdMs: 6000
      },
      responseByTarget: {
        sheepOne: {
          stage: [
            { do: "object", target: "sheepOne", action: "wobble" },
            { do: "sfx", sound: "baa" },
            { do: "gesture", actor: "lulu", gesture: "sway" }
          ]
        },
        cloudOne: {
          stage: [
            { do: "object", target: "cloudOne", action: "glow" },
            { do: "object", target: "sheepOne", action: "wobble" },
            { do: "sfx", sound: "baa" }
          ]
        }
      },
      words: [
        { wordId: "one", objectId: "sheepOne" },
        { wordId: "sheep", objectId: "sheepOne" },
        { wordId: "baa", objectId: "sheepOne" },
        { wordId: "soft", objectId: "sheepOne" }
      ]
    },
    {
      id: "count-two",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "enter", actor: "sheepTwo", at: "center", from: "offRight", style: "walk" },
        { do: "sfx", sound: "baa" },
        { do: "face", actor: "lulu", toward: "sheepTwo" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [
        { speaker: "lulu", key: "e23.count-two.1" },
        { speaker: "lumi", key: "e23.count-two.2" }
      ],
      words: [
        { wordId: "two", objectId: "sheepTwo" },
        { wordId: "sheep", objectId: "sheepTwo" },
        { wordId: "soft", objectId: "sheepTwo" }
      ],
      holdMs: 7500
    },
    {
      id: "count-three",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "enter", actor: "sheepThree", at: "right", from: "offRight", style: "walk" },
        { do: "sfx", sound: "baa" },
        { do: "face", actor: "lulu", toward: "sheepThree" },
        { do: "gesture", actor: "lulu", gesture: "point" },
        { do: "gesture", actor: "lumi", gesture: "twinkle" }
      ],
      lines: [
        { speaker: "lulu", key: "e23.count-three.1" },
        { speaker: "narrator", key: "e23.count-three.2" }
      ],
      words: [
        { wordId: "three", objectId: "sheepThree" },
        { wordId: "sheep", objectId: "sheepThree" },
        { wordId: "cloud", objectId: "cloudTwo" }
      ],
      holdMs: 7500
    },
    {
      id: "invite-three",
      kind: "invite",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "sway" }
      ],
      lines: [{ speaker: "lumi", key: "e23.invite-three.1" }],
      holdMs: 2500,
      input: { type: "tap", targets: ["sheepTwo", "sheepThree"] },
      waitMs: 6000,
      caregiverPromptKey: "e23.tip.2",
      response: {
        stage: [
          { do: "object", target: "sheepTwo", action: "wobble" },
          { do: "object", target: "sheepThree", action: "wobble" },
          { do: "sfx", sound: "yawn" },
          { do: "gesture", actor: "lulu", gesture: "yawn" }
        ],
        lines: [
          { speaker: "lulu", key: "e23.invite-three.2" },
          { speaker: "narrator", key: "e23.invite-three.3" }
        ],
        holdMs: 6000
      },
      responseByTarget: {
        sheepTwo: {
          stage: [
            { do: "object", target: "sheepTwo", action: "wobble" },
            { do: "sfx", sound: "baa" },
            { do: "gesture", actor: "lulu", gesture: "rock" }
          ]
        },
        sheepThree: {
          stage: [
            { do: "object", target: "sheepThree", action: "wobble" },
            { do: "sfx", sound: "baa" },
            { do: "gesture", actor: "lumi", gesture: "twinkle" }
          ]
        }
      },
      words: [
        { wordId: "three", objectId: "sheepThree" },
        { wordId: "sheep", objectId: "sheepTwo" },
        { wordId: "hush", objectId: "lulu" },
        { wordId: "sleep", objectId: "sheepThree" }
      ]
    },
    {
      id: "sheep-song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "song", song: "countingSheepSong", performers: ["lulu", "lumi"], cues: COUNTING_SHEEP_CUES }
      ],
      lines: [],
      holdMs: 39500
    },
    {
      id: "settle",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "yawn" },
        { do: "gesture", actor: "lulu", gesture: "rock" },
        { do: "gesture", actor: "lumi", gesture: "sway" },
        { do: "object", target: "moon", action: "glow" }
      ],
      lines: [
        { speaker: "lumi", key: "e23.settle.1" },
        { speaker: "lulu", key: "e23.settle.2" }
      ],
      words: [
        { wordId: "three", objectId: "sheepThree" },
        { wordId: "sheep", objectId: "sheepOne" },
        { wordId: "cloud", objectId: "cloudOne" },
        { wordId: "night", objectId: "moon" }
      ],
      holdMs: 8500
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "object", target: "moon", action: "glow" },
        { do: "gesture", actor: "lulu", gesture: "sleep", loop: true },
        { do: "gesture", actor: "lumi", gesture: "sleep", loop: true }
      ],
      lines: [
        { speaker: "narrator", key: "e23.outro.1" },
        { speaker: "narrator", key: "e23.outro.2" },
        { speaker: "narrator", key: "e23.outro.3" }
      ],
      words: [
        { wordId: "three", objectId: "sheepThree" },
        { wordId: "sheep", objectId: "sheepThree" },
        { wordId: "sleep", objectId: "lulu" },
        { wordId: "hush", objectId: "lumi" }
      ],
      holdMs: 9000
    }
  ]
};

export const episode: EpisodeSpec = E23_THREE_SLEEPY_SHEEP;
