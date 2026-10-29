// E20 — The Little Story Machine (P2). In Lumi's Learning Cloud a magic story
// box opens and three everyday toys come out: Teddy, a ball and a car. The box
// then tells two tiny, preapproved stories, each made of two familiar nouns and
// one action:
//   Story A: "Teddy has a ball. The ball rolls."   (teddy, ball, roll)
//   Story B: "Teddy is in the car. The car goes."  (teddy, car, go)
// Every word is authored here and reviewed; nothing is generated at runtime and
// there is no live or LLM dialogue. The child's "choice" between two toys never
// changes the story: both toys are in it, and silence plays it the same way.
//
// Staging: ball motion is a `move` with the roll style only (an extra
// `object ... roll` in the same step would replace the move's destination).
// Teddy gets into the car with `carry` (the car carries him, sitting in it),
// so he rides along when the car goes; the stage would otherwise stop him
// beside the car. The car stops when the song starts, so it does not keep
// running to the end. Lumi, a star, floats down from the sky and stays up high
// on the right, so the car's drive to the far right passes under her.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "little-story-machine",
  number: 20,
  version: 1,
  phase: "P2",
  titleKey: "e20.title",
  world: "learning-cloud",
  host: "momo",
  cast: [
    { id: "momo", at: "offLeft" },
    { id: "lumi", at: "offTop" }
  ],
  props: [
    { id: "box", asset: "storyBox", at: "center", size: 0.6 },
    { id: "teddy", asset: "teddy", at: "center", hidden: true, size: 0.5 },
    { id: "ball", asset: "ball", at: "center", hidden: true, size: 0.4 },
    { id: "car", asset: "car", at: "center", hidden: true, size: 0.5 }
  ],
  targetWords: ["teddy", "ball", "roll"],
  supportWords: ["hi", "hello", "look", "box", "in", "open", "out", "car", "beep", "go", "all-done", "bye"],
  music: "cloudBed",
  offlinePlayKey: "e20.offline",
  caregiverBridgeKey: "e20.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 124,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "cloudBed" },
        { do: "enter", actor: "momo", at: "left", from: "offLeft", style: "walk" },
        { do: "enter", actor: "lumi", at: "highRight", from: "offTop", style: "float" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "lumi", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e20.greet.1" },
        { speaker: "lumi", key: "e20.greet.2" }
      ],
      words: [
        { wordId: "hi", objectId: "momo" },
        { wordId: "hello", objectId: "lumi" },
        { wordId: "look", objectId: "box" }
      ],
      holdMs: 4500
    },
    {
      // The one concrete thing: a magic story box that wiggles gently.
      id: "hook",
      kind: "hook",
      stage: [
        { do: "object", target: "box", action: "wobble" },
        { do: "sfx", sound: "sparkle" },
        { do: "face", actor: "momo", toward: "box" },
        { do: "face", actor: "lumi", toward: "box" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      lines: [
        { speaker: "narrator", key: "e20.hook.1" },
        { speaker: "lumi", key: "e20.hook.2" },
        { speaker: "momo", key: "e20.hook.3" }
      ],
      words: [
        { wordId: "box", objectId: "box" },
        { wordId: "in", objectId: "box" }
      ],
      holdMs: 4500
    },
    {
      id: "open",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "object", target: "box", action: "open" },
        { do: "gesture", actor: "lumi", gesture: "float" }
      ],
      lines: [
        { speaker: "lumi", key: "e20.open.1" },
        { speaker: "narrator", key: "e20.open.2" }
      ],
      words: [
        { wordId: "open", objectId: "box" },
        { wordId: "box", objectId: "box" }
      ],
      holdMs: 4000
    },
    {
      // Toy 1 hops out of the box.
      id: "toy-teddy",
      kind: "model",
      stage: [
        { do: "show", actor: "teddy" },
        { do: "move", actor: "teddy", to: "frontLeft", style: "hop" },
        { do: "face", actor: "momo", toward: "teddy" }
      ],
      lines: [
        { speaker: "narrator", key: "e20.toy-teddy.1" },
        { speaker: "momo", key: "e20.toy-teddy.2" }
      ],
      words: [
        { wordId: "out", objectId: "teddy" },
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "hi", objectId: "teddy" }
      ],
      holdMs: 4000
    },
    {
      // Toy 2 rolls out of the box.
      id: "toy-ball",
      kind: "model",
      stage: [
        { do: "show", actor: "ball" },
        { do: "move", actor: "ball", to: "front", style: "roll" },
        { do: "face", actor: "lumi", toward: "ball" }
      ],
      lines: [
        { speaker: "narrator", key: "e20.toy-ball.1" },
        { speaker: "momo", key: "e20.toy-ball.2" }
      ],
      words: [
        { wordId: "out", objectId: "ball" },
        { wordId: "ball", objectId: "ball" }
      ],
      holdMs: 4000
    },
    {
      // Toy 3 drives out of the box.
      id: "toy-car",
      kind: "model",
      stage: [
        { do: "show", actor: "car" },
        { do: "move", actor: "car", to: "frontRight", style: "drive" },
        { do: "sfx", sound: "beep" },
        { do: "face", actor: "lumi", toward: "car" }
      ],
      lines: [
        { speaker: "narrator", key: "e20.toy-car.1" },
        { speaker: "lumi", key: "e20.toy-car.2" }
      ],
      words: [
        { wordId: "out", objectId: "car" },
        { wordId: "car", objectId: "car" },
        { wordId: "beep", objectId: "car" }
      ],
      holdMs: 4000
    },
    {
      // Story A, child turn: tap Teddy or the ball (or wait). Both are in the story.
      id: "pick-1",
      kind: "invite",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" },
        { do: "gesture", actor: "lumi", gesture: "glow" }
      ],
      lines: [
        { speaker: "lumi", key: "e20.pick-1.1" },
        { speaker: "momo", key: "e20.pick-1.2" }
      ],
      holdMs: 2500,
      input: { type: "tap", targets: ["teddy", "ball"] },
      waitMs: 5000,
      caregiverPromptKey: "e20.tip.1",
      response: {
        stage: [
          { do: "object", target: "box", action: "glow" },
          { do: "sfx", sound: "sparkle" },
          { do: "move", actor: "ball", to: "frontLeft", style: "roll" },
          { do: "face", actor: "momo", toward: "teddy" }
        ],
        lines: [
          { speaker: "narrator", key: "e20.pick-1.3" },
          { speaker: "momo", key: "e20.pick-1.4" }
        ],
        holdMs: 3000
      },
      words: [
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "ball", objectId: "ball" }
      ]
    },
    {
      // Story A, the action: the ball rolls away from Teddy along the front and
      // stops beside the car.
      id: "story-a",
      kind: "event",
      stage: [
        { do: "move", actor: "ball", to: "frontRight", style: "roll" },
        { do: "face", actor: "momo", toward: "ball" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "narrator", key: "e20.story-a.1" },
        { speaker: "momo", key: "e20.story-a.2" },
        { speaker: "lumi", key: "e20.story-a.3" }
      ],
      words: [
        { wordId: "ball", objectId: "ball" },
        { wordId: "roll", objectId: "ball" }
      ],
      holdMs: 4500
    },
    {
      // Story B, child turn: tap the car or Teddy (or wait). Both are in the
      // story. With a sparkle from the story box, Teddy pops into the car.
      id: "pick-2",
      kind: "invite",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      lines: [
        { speaker: "lumi", key: "e20.pick-2.1" },
        { speaker: "momo", key: "e20.pick-2.2" }
      ],
      holdMs: 2500,
      input: { type: "tap", targets: ["car", "teddy"] },
      waitMs: 5000,
      caregiverPromptKey: "e20.tip.2",
      response: {
        stage: [
          { do: "object", target: "box", action: "glow" },
          { do: "sfx", sound: "sparkle" },
          { do: "carry", actor: "car", item: "teddy" },
          { do: "face", actor: "momo", toward: "car" }
        ],
        lines: [
          { speaker: "narrator", key: "e20.pick-2.3" },
          { speaker: "momo", key: "e20.pick-2.4" }
        ],
        holdMs: 3000
      },
      words: [
        { wordId: "car", objectId: "car" },
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "in", objectId: "car" }
      ]
    },
    {
      // Story B, the action: the car drives off with Teddy riding in it (he is
      // carried by the car, so he goes wherever it goes).
      id: "story-b",
      kind: "event",
      stage: [
        { do: "move", actor: "car", to: "farRight", style: "drive" },
        { do: "object", target: "car", action: "go" },
        { do: "face", actor: "momo", toward: "car" }
      ],
      lines: [
        { speaker: "narrator", key: "e20.story-b.1" },
        { speaker: "momo", key: "e20.story-b.2" },
        { speaker: "lumi", key: "e20.story-b.3" }
      ],
      words: [
        { wordId: "car", objectId: "car" },
        { wordId: "go", objectId: "car" },
        { wordId: "beep", objectId: "car" }
      ],
      holdMs: 5000
    },
    {
      // Resolution: the original "Ball Rolls" song while the ball rolls once more,
      // back along the front; the car has parked and stops running.
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "ballRolls" },
        { do: "object", target: "car", action: "stop" },
        { do: "move", actor: "ball", to: "frontLeft", style: "roll" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "ballRolls" },
        { do: "object", target: "car", action: "stop" },
        { do: "move", actor: "ball", to: "frontLeft", style: "roll" },
        { do: "gesture", actor: "momo", gesture: "sway" }
      ],
      lines: [],
      holdMs: 17500
    },
    {
      id: "outro",
      kind: "outro",
      stage: [
        { do: "music", bed: null },
        { do: "object", target: "box", action: "close" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "lumi", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e20.outro.1" },
        { speaker: "lumi", key: "e20.outro.2" },
        { speaker: "momo", key: "e20.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "lumi" }
      ],
      holdMs: 6000
    }
  ]
};
