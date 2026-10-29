// E01 — Momo's Magic Mouth (P1). Momo finds a toy mirror, says "Oh!" to his
// reflection, then makes three silly faces, one sound per beat: "ah", "oh",
// "mmm". The models have no mouth morphs, so each face is carried by a body
// gesture plus the talking pulse; nothing claims lip sync or shows mouth
// anatomy. Faces and sounds are play only: nothing listens, scores or rewards
// accuracy, and every turn continues by itself. Song beats carry no lines so
// speech never overlaps the song.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "momo-magic-mouth",
  number: 1,
  version: 1,
  phase: "P1",
  titleKey: "e01.title",
  world: "home-nook",
  host: "momo",
  cast: [{ id: "momo", at: "offLeft" }],
  props: [
    { id: "mirror", asset: "mirror", at: "right", hidden: true, size: 1 },
    { id: "cushion", asset: "cushion", at: "backLeft", size: 0.3 }
  ],
  targetWords: ["ah", "oh", "mmm"],
  supportWords: ["hi", "mirror", "more", "bye", "all-done"],
  music: "homeBed",
  offlinePlayKey: "e01.offline",
  caregiverBridgeKey: "e01.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 130,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "homeBed" },
        { do: "enter", actor: "momo", at: "left", from: "offLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e01.greet.1" },
        { speaker: "narrator", key: "e01.greet.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 3900
    },
    {
      id: "hook",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "show", actor: "mirror" },
        { do: "object", target: "mirror", action: "glow" },
        { do: "move", actor: "momo", to: "center", style: "walk" },
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "narrator", key: "e01.hook.1" },
        { speaker: "momo", key: "e01.hook.2" },
        { speaker: "narrator", key: "e01.hook.3" }
      ],
      words: [
        { wordId: "mirror", objectId: "mirror" },
        { wordId: "oh", objectId: "momo" }
      ],
      holdMs: 4400
    },
    {
      id: "hello-mirror",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "object", target: "mirror", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e01.hello-mirror.1" },
        { speaker: "narrator", key: "e01.hello-mirror.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 4400
    },
    {
      id: "face-ah",
      kind: "model",
      camera: "close",
      stage: [
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "cheer" }
      ],
      reducedMotionStage: [
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e01.face-ah.1" },
        { speaker: "narrator", key: "e01.face-ah.2" },
        { speaker: "momo", key: "e01.face-ah.3" }
      ],
      words: [{ wordId: "ah", objectId: "momo" }],
      holdMs: 4400
    },
    {
      id: "face-oh",
      kind: "model",
      camera: "close",
      stage: [
        { do: "gesture", actor: "momo", gesture: "hop" },
        { do: "object", target: "mirror", action: "wobble" }
      ],
      reducedMotionStage: [
        { do: "gesture", actor: "momo", gesture: "look" },
        { do: "object", target: "mirror", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e01.face-oh.1" },
        { speaker: "narrator", key: "e01.face-oh.2" },
        { speaker: "momo", key: "e01.face-oh.3" }
      ],
      words: [{ wordId: "oh", objectId: "momo" }],
      holdMs: 4400
    },
    {
      id: "face-mmm",
      kind: "model",
      camera: "close",
      stage: [
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "sway" }
      ],
      lines: [
        { speaker: "momo", key: "e01.face-mmm.1" },
        { speaker: "narrator", key: "e01.face-mmm.2" },
        { speaker: "momo", key: "e01.face-mmm.3" }
      ],
      words: [{ wordId: "mmm", objectId: "momo" }],
      holdMs: 4400
    },
    {
      id: "turn",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "mirror", action: "glow" }
      ],
      lines: [
        { speaker: "momo", key: "e01.turn.1" },
        { speaker: "momo", key: "e01.turn.2" }
      ],
      holdMs: 3400,
      input: { type: "tap", targets: ["mirror", "momo"] },
      waitMs: 5000,
      caregiverPromptKey: "e01.tip.1",
      response: {
        stage: [
          { do: "object", target: "mirror", action: "wobble" },
          { do: "sfx", sound: "sparkle" },
          { do: "face", actor: "momo", toward: "mirror" },
          { do: "gesture", actor: "momo", gesture: "mirror" }
        ],
        lines: [
          { speaker: "narrator", key: "e01.turn.3" },
          { speaker: "momo", key: "e01.turn.4" }
        ],
        holdMs: 4400
      }
    },
    {
      id: "more",
      kind: "repeat",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "nod" }
      ],
      lines: [{ speaker: "momo", key: "e01.more.1" }],
      words: [{ wordId: "more", objectId: "momo" }],
      holdMs: 3400,
      input: { type: "tap", targets: ["mirror", "momo"] },
      waitMs: 5000,
      caregiverPromptKey: "e01.tip.2",
      response: {
        stage: [
          { do: "face", actor: "momo", toward: "mirror" },
          { do: "gesture", actor: "momo", gesture: "happy" },
          { do: "sfx", sound: "giggle" }
        ],
        lines: [
          { speaker: "momo", key: "e01.more.2" },
          { speaker: "narrator", key: "e01.more.3" }
        ],
        holdMs: 4400
      }
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "song", song: "faceSong" },
        { do: "gesture", actor: "momo", gesture: "dance", loop: true }
      ],
      reducedMotionStage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "song", song: "faceSong" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true }
      ],
      lines: [],
      holdMs: 18000
    },
    {
      id: "calm",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "yawn" },
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "sway" }
      ],
      lines: [
        { speaker: "momo", key: "e01.calm.1" },
        { speaker: "narrator", key: "e01.calm.2" },
        { speaker: "momo", key: "e01.calm.3" }
      ],
      words: [
        { wordId: "ah", objectId: "momo" },
        { wordId: "mmm", objectId: "momo" }
      ],
      holdMs: 4900,
      caregiverPromptKey: "e01.tip.3"
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e01.outro.1" },
        { speaker: "momo", key: "e01.outro.2" },
        { speaker: "narrator", key: "e01.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "momo" }
      ],
      holdMs: 6400
    }
  ]
};
