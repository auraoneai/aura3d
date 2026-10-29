// E01 — Momo's Magic Mouth (P1). Momo finds a toy mirror and sees himself in
// it: the stage draws Mirror Momo in the glass, a small mirror image that
// plays every gesture Momo plays. He says a surprised "Oh!", then makes three
// silly faces at the mirror, one per beat, each paired with its sound once:
// a big "Ah!", a surprised "Oh!" and a happy humming "Mmm.", while Mirror Momo
// does the same.
//
// The models have no mouth or face animation (02 section 2), so each "face"
// is a body pose (a big bouncy cheer, the quick `surprise` stretch, a calm
// sway) plus the talking pulse and the reflection; no line names a mouth
// shape, nothing claims lip sync, and no mouth anatomy is shown. Faces and
// sounds are play only: nothing listens, scores or rewards accuracy, and every
// turn continues by itself.
//
// Staging: the mirror stands front right, facing us, so its glass and Mirror
// Momo stay in view on portrait phones; Momo stands at the center and turns
// three-quarter toward it for the faces. The face beats use the medium
// framing (the close one cuts the mirror off on most screens). The face song
// pairs its sung sounds with the same poses through its lyric-line cues
// (07 B20). Song beats carry no lines, so speech never overlaps the song.
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
    { id: "mirror", asset: "mirror", at: "frontRight", hidden: true, size: 1 },
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
  estimatedDurationSec: 129,
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
      // The mirror appears with a soft glow and Momo walks over to it.
      id: "find",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "show", actor: "mirror" },
        { do: "object", target: "mirror", action: "glow" },
        { do: "move", actor: "momo", to: "center", style: "walk" },
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [{ speaker: "narrator", key: "e01.find.1" }],
      words: [{ wordId: "mirror", objectId: "mirror" }],
      holdMs: 1500
    },
    {
      // The hook (05 E01): in front of the mirror, Momo sees himself and makes a
      // surprised "Oh!" (the `surprise` pose; Mirror Momo is surprised too).
      // Its lines are e01.hook.2 and e01.hook.3: e01.hook.1 moved to "find".
      id: "hook",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "surprise" }
      ],
      lines: [
        { speaker: "momo", key: "e01.hook.2" },
        { speaker: "narrator", key: "e01.hook.3" }
      ],
      words: [
        { wordId: "oh", objectId: "momo" },
        { wordId: "mirror", objectId: "mirror" }
      ],
      holdMs: 2900
    },
    {
      id: "hello-mirror",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e01.hello-mirror.1" },
        { speaker: "narrator", key: "e01.hello-mirror.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 4400
    },
    {
      // Face 1, "Ah!": a big, bouncy, open pose (a slow big stretch in reduced
      // motion). The sound is said once, as the pose starts.
      id: "face-ah",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "cheer" }
      ],
      reducedMotionStage: [
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "wake" }
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
      // Face 2, "Oh!": the quick surprised stretch and little hop.
      id: "face-oh",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "mirror" },
        { do: "gesture", actor: "momo", gesture: "surprise" }
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
      // Face 3, "Mmm.": a calm, happy, humming sway.
      id: "face-mmm",
      kind: "model",
      camera: "medium",
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
      // Momo turns to the child, leans in a little and waits (the `wait` pose).
      id: "turn",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wait" },
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
      // The face song: each sung sound gets its face's pose, at the mirror, so
      // Mirror Momo sings along ("Ah" the big cheer, "Oh" the surprise, "Mmm"
      // the sway); "you and me" turns to the child, "look and see" back to
      // the mirror, and the last "ah, oh, mmm!" is a wiggly silly-faces dance.
      // The cues set every gesture (performers: none).
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        {
          do: "song",
          song: "faceSong",
          performers: [],
          cues: [
            { line: 0, stage: [{ do: "face", actor: "momo", toward: "mirror" }, { do: "gesture", actor: "momo", gesture: "cheer" }] },
            { line: 1, stage: [{ do: "gesture", actor: "momo", gesture: "surprise" }] },
            { line: 2, stage: [{ do: "gesture", actor: "momo", gesture: "sway" }] },
            { line: 3, stage: [{ do: "face", actor: "momo", toward: "viewer" }, { do: "gesture", actor: "momo", gesture: "point" }] },
            { line: 4, stage: [{ do: "face", actor: "momo", toward: "mirror" }, { do: "gesture", actor: "momo", gesture: "look" }] },
            { line: 5, stage: [{ do: "gesture", actor: "momo", gesture: "mirror" }] }
          ]
        }
      ],
      reducedMotionStage: [
        {
          do: "song",
          song: "faceSong",
          performers: [],
          cues: [
            { line: 0, stage: [{ do: "face", actor: "momo", toward: "mirror" }, { do: "gesture", actor: "momo", gesture: "wake" }] },
            { line: 1, stage: [{ do: "gesture", actor: "momo", gesture: "surprise" }] },
            { line: 2, stage: [{ do: "gesture", actor: "momo", gesture: "sway" }] },
            { line: 3, stage: [{ do: "face", actor: "momo", toward: "viewer" }, { do: "gesture", actor: "momo", gesture: "point" }] },
            { line: 4, stage: [{ do: "face", actor: "momo", toward: "mirror" }, { do: "gesture", actor: "momo", gesture: "look" }] },
            { line: 5, stage: [{ do: "gesture", actor: "momo", gesture: "mirror" }] }
          ]
        }
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
