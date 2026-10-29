// E06 — Lulu's Dino Dance Party (P1, PRD 05 E06 / 04 F05). Lulu hears the big
// garden drum, claps, stomps and plays a gentle go / stop freeze dance; Momo
// joins in. The music bed is the dance: it starts on "go" and stops on "stop".
//
// Six-beat blueprint (PRD 01 section 5): greeting (hello song, then hi),
// hook (the drum, two slow steps, a look to the viewer), explore (clap, stomp,
// "Ready... go!", "Stop!", then again with Momo), child turn (tap the giant
// drum to start, then to stop the dance; both continue by themselves),
// resolution and the "Go / Stop with Lulu" song (goStop), natural ending.
//
// Rules held here: sounds that carry meaning (the drum) play in a beat without
// speech so nothing overlaps; song beats carry no lines; "Ready..." has its own
// beat so the pause before "go" is visible; no number words are spoken (the
// song lyrics live in src/content/songs.ts); nothing listens to or scores the
// child, and silence always completes the story.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "lulu-dino-dance",
  number: 6,
  version: 1,
  phase: "P1",
  titleKey: "e06.title",
  world: "music-garden",
  host: "lulu",
  cast: [
    { id: "lulu", at: "offRight" },
    { id: "momo", at: "offRight" }
  ],
  // The giant drum stands front right: Lulu dances at left and Momo joins at
  // center, so the drum never hides either of them (it is 0.8 m tall).
  props: [{ id: "drum", asset: "drum", at: "frontRight", size: 0.8 }],
  targetWords: ["clap", "go", "stop"],
  supportWords: ["stomp", "dance", "drum", "boom", "hands", "feet", "hi", "your-turn", "uh-oh", "thank-you", "wave", "bye", "all-done"],
  music: "gardenBed",
  offlinePlayKey: "e06.offline",
  caregiverBridgeKey: "e06.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 157,
  beats: [
    {
      id: "hello",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "gardenBed" },
        { do: "song", song: "hello" },
        { do: "enter", actor: "lulu", at: "center", from: "offRight", style: "walk" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" }
      ],
      lines: [],
      holdMs: 11000
    },
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "happy" }
      ],
      lines: [
        { speaker: "lulu", key: "e06.greet.1" },
        { speaker: "narrator", key: "e06.greet.2" }
      ],
      words: [{ wordId: "hi", objectId: "lulu" }],
      holdMs: 1000
    },
    {
      id: "boom",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "drum" },
        { do: "object", target: "drum", action: "bounce" },
        { do: "face", actor: "lulu", toward: "drum" },
        { do: "gesture", actor: "lulu", gesture: "look" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "drum" },
        { do: "object", target: "drum", action: "glow" },
        { do: "face", actor: "lulu", toward: "drum" },
        { do: "gesture", actor: "lulu", gesture: "look" }
      ],
      lines: [],
      holdMs: 1500
    },
    {
      id: "drum",
      kind: "hook",
      camera: "medium",
      stage: [{ do: "gesture", actor: "lulu", gesture: "point" }],
      lines: [
        { speaker: "lulu", key: "e06.drum.1" },
        { speaker: "narrator", key: "e06.drum.2" }
      ],
      words: [
        { wordId: "boom", objectId: "drum" },
        { wordId: "drum", objectId: "drum" }
      ],
      holdMs: 1500
    },
    {
      id: "steps",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "move", actor: "lulu", to: "left", style: "walk" },
        { do: "face", actor: "lulu", toward: "viewer" }
      ],
      lines: [
        { speaker: "lulu", key: "e06.steps.1" },
        { speaker: "lulu", key: "e06.steps.2" }
      ],
      holdMs: 1500
    },
    {
      id: "clap",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lulu", gesture: "clap" },
        { do: "sfx", sound: "clap" }
      ],
      lines: [
        { speaker: "lulu", key: "e06.clap.1" },
        { speaker: "narrator", key: "e06.clap.2" }
      ],
      words: [
        { wordId: "clap", objectId: "lulu" },
        { wordId: "hands", objectId: "lulu" }
      ],
      holdMs: 2000
    },
    {
      id: "stomp",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lulu", gesture: "stomp" },
        { do: "sfx", sound: "stomp" }
      ],
      lines: [
        { speaker: "lulu", key: "e06.stomp.1" },
        { speaker: "narrator", key: "e06.stomp.2" }
      ],
      words: [
        { wordId: "stomp", objectId: "lulu" },
        { wordId: "feet", objectId: "lulu" }
      ],
      holdMs: 2000
    },
    {
      id: "ready",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "idle" }
      ],
      lines: [{ speaker: "lulu", key: "e06.ready.1" }],
      holdMs: 1500
    },
    {
      id: "go",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "music", bed: "gardenBed" },
        { do: "gesture", actor: "lulu", gesture: "dance", loop: true }
      ],
      reducedMotionStage: [
        { do: "music", bed: "gardenBed" },
        { do: "gesture", actor: "lulu", gesture: "sway", loop: true }
      ],
      lines: [
        { speaker: "lulu", key: "e06.go.1" },
        { speaker: "narrator", key: "e06.go.2" }
      ],
      words: [
        { wordId: "go", objectId: "lulu" },
        { wordId: "dance", objectId: "lulu" }
      ],
      holdMs: 2500
    },
    {
      id: "stop",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "gesture", actor: "lulu", gesture: "freeze" }
      ],
      lines: [
        { speaker: "lulu", key: "e06.stop.1" },
        { speaker: "narrator", key: "e06.stop.2" }
      ],
      words: [{ wordId: "stop", objectId: "lulu" }],
      holdMs: 2500
    },
    {
      id: "momo",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "enter", actor: "momo", at: "center", from: "offRight", style: "walk" },
        { do: "face", actor: "momo", toward: "lulu" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "face", actor: "lulu", toward: "momo" },
        { do: "gesture", actor: "lulu", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e06.momo.1" },
        { speaker: "lulu", key: "e06.momo.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 1000
    },
    {
      id: "ready-2",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "idle" },
        { do: "gesture", actor: "momo", gesture: "idle" }
      ],
      lines: [
        { speaker: "lulu", key: "e06.ready-2.1" },
        { speaker: "momo", key: "e06.ready-2.2" }
      ],
      holdMs: 1200
    },
    {
      id: "go-2",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "music", bed: "gardenBed" },
        { do: "gesture", actor: "lulu", gesture: "dance", loop: true },
        { do: "gesture", actor: "momo", gesture: "dance", loop: true }
      ],
      reducedMotionStage: [
        { do: "music", bed: "gardenBed" },
        { do: "gesture", actor: "lulu", gesture: "sway", loop: true },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true }
      ],
      lines: [
        { speaker: "lulu", key: "e06.go-2.1" },
        { speaker: "narrator", key: "e06.go-2.2" }
      ],
      words: [
        { wordId: "go", objectId: "momo" },
        { wordId: "dance", objectId: "momo" }
      ],
      holdMs: 2500
    },
    {
      id: "stop-2",
      kind: "repeat",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "gesture", actor: "lulu", gesture: "freeze" },
        { do: "gesture", actor: "momo", gesture: "freeze" }
      ],
      lines: [
        { speaker: "lulu", key: "e06.stop-2.1" },
        { speaker: "momo", key: "e06.stop-2.2" }
      ],
      words: [
        { wordId: "stop", objectId: "lulu" },
        { wordId: "uh-oh", objectId: "momo" }
      ],
      holdMs: 2000
    },
    {
      id: "invite-go",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "point" },
        { do: "object", target: "drum", action: "glow" }
      ],
      lines: [{ speaker: "lulu", key: "e06.invite-go.1" }],
      words: [
        { wordId: "your-turn", objectId: "drum" },
        { wordId: "go", objectId: "lulu" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["drum"] },
      waitMs: 5000,
      caregiverPromptKey: "e06.tip.1",
      response: {
        stage: [
          { do: "sfx", sound: "drum" },
          { do: "object", target: "drum", action: "bounce" },
          { do: "music", bed: "gardenBed" },
          { do: "gesture", actor: "lulu", gesture: "dance", loop: true },
          { do: "gesture", actor: "momo", gesture: "dance", loop: true }
        ],
        lines: [
          { speaker: "lulu", key: "e06.invite-go.2" },
          { speaker: "narrator", key: "e06.invite-go.3" }
        ],
        holdMs: 2500
      }
    },
    {
      id: "invite-stop",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "music", bed: "gardenBed" },
        { do: "gesture", actor: "lulu", gesture: "dance", loop: true },
        { do: "gesture", actor: "momo", gesture: "dance", loop: true },
        { do: "object", target: "drum", action: "glow" }
      ],
      reducedMotionStage: [
        { do: "music", bed: "gardenBed" },
        { do: "gesture", actor: "lulu", gesture: "sway", loop: true },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "object", target: "drum", action: "glow" }
      ],
      lines: [{ speaker: "lulu", key: "e06.invite-stop.1" }],
      words: [
        { wordId: "dance", objectId: "lulu" },
        { wordId: "stop", objectId: "lulu" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["drum"] },
      waitMs: 5000,
      caregiverPromptKey: "e06.tip.2",
      response: {
        stage: [
          { do: "sfx", sound: "drum" },
          { do: "music", bed: null },
          { do: "gesture", actor: "lulu", gesture: "freeze" },
          { do: "gesture", actor: "momo", gesture: "freeze" }
        ],
        lines: [
          { speaker: "lulu", key: "e06.invite-stop.2" },
          { speaker: "narrator", key: "e06.invite-stop.3" }
        ],
        holdMs: 2500
      }
    },
    {
      id: "song-intro",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "gesture", actor: "lulu", gesture: "happy" },
        { do: "gesture", actor: "momo", gesture: "cheer" }
      ],
      lines: [{ speaker: "lulu", key: "e06.song-intro.1" }],
      words: [{ wordId: "dance", objectId: "lulu" }],
      holdMs: 500
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "goStop" },
        { do: "gesture", actor: "lulu", gesture: "dance", loop: true },
        { do: "gesture", actor: "momo", gesture: "clap", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "goStop" },
        { do: "gesture", actor: "lulu", gesture: "sway", loop: true },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true }
      ],
      lines: [],
      holdMs: 17000,
      caregiverPromptKey: "e06.tip.3"
    },
    {
      id: "rest",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "music", bed: "gardenBed" },
        { do: "gesture", actor: "lulu", gesture: "clap" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "momo", key: "e06.rest.1" },
        { speaker: "lulu", key: "e06.rest.2" }
      ],
      words: [
        { wordId: "clap", objectId: "lulu" },
        { wordId: "thank-you", objectId: "lulu" }
      ],
      holdMs: 1500
    },
    {
      id: "outro",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "lulu", key: "e06.outro.1" },
        { speaker: "momo", key: "e06.outro.2" },
        { speaker: "narrator", key: "e06.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "lulu" },
        { wordId: "bye", objectId: "momo" },
        { wordId: "wave", objectId: "momo" }
      ],
      holdMs: 3000
    }
  ]
};
