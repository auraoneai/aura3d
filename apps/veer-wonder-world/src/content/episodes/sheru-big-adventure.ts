// E17 — Sheru's Big Adventure (P1, golden episode; PRD 05 section 4).
//
// A red ball rolls into the meadow. Momo names it, says "Ready..." and waits,
// then "Go!": the ball rolls and Sheru fetches it, brings it back, and the
// friends play "more" before the original "Ball Rolls" song and a calm goodbye.
//
// The beat list is exactly the golden list: greet, hook, model, invite, event,
// repeat, song, outro. Stage actions run at the start of a step, so each
// motion of one actor lives in its own step: Sheru walks up to the ball to
// nose it (model), the ball rolls away, back to where it came from, in the
// invite response, Sheru runs to it in the event beat, carries it back at the
// start of the repeat beat, nudges it to Momo in the repeat response, watches
// the song roll along the front, and trots over to it in the outro.
//
// Ball motion is always a `move` with the roll style (it rolls as it travels).
// It is never paired with an `object ... roll` in the same step: the stage
// treats that as a second, 1 m roll that replaces the move's destination.
// Every spot the ball uses stays inside the framings on portrait phones, and
// no roll crosses where a character stands.
//
// Sheru never speaks (his speaker voice does not exist; barks are the "woof"
// sound effect). Every wait ends by itself and nothing listens to or scores
// speech. The ball is the only tap target.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "sheru-big-adventure",
  number: 17,
  version: 1,
  phase: "P1",
  titleKey: "e17.title",
  world: "meadow",
  host: "sheru",
  cast: [
    { id: "momo", at: "offLeft" },
    { id: "sheru", at: "center" }
  ],
  props: [{ id: "ball", asset: "ball", at: "backRight", size: 0.4 }],
  targetWords: ["ball", "go", "more"],
  supportWords: ["hi", "dog", "look", "roll", "red", "thank-you", "all-done", "bye"],
  music: "meadowBed",
  offlinePlayKey: "e17.offline",
  caregiverBridgeKey: "e17.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 133,
  beats: [
    {
      // 1. Momo waves "Hi!"; Sheru sits nearby; the ball rests at the back of the meadow.
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "meadowBed" },
        { do: "enter", actor: "momo", at: "left", from: "offLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "sheru", gesture: "sit" }
      ],
      lines: [
        { speaker: "momo", key: "e17.greet.1" },
        { speaker: "momo", key: "e17.greet.2" },
        { speaker: "narrator", key: "e17.greet.3" }
      ],
      words: [
        { wordId: "hi", objectId: "momo" },
        { wordId: "hi", objectId: "sheru" },
        { wordId: "dog", objectId: "sheru" }
      ],
      holdMs: 5000
    },
    {
      // 2. The ball rolls slowly into view; Sheru follows it with his eyes.
      id: "hook",
      kind: "hook",
      stage: [
        { do: "move", actor: "ball", to: "right", style: "roll" },
        { do: "face", actor: "sheru", toward: "ball" },
        { do: "gesture", actor: "sheru", gesture: "look" },
        { do: "face", actor: "momo", toward: "ball" }
      ],
      lines: [
        { speaker: "narrator", key: "e17.hook.1" },
        { speaker: "momo", key: "e17.hook.2" },
        { speaker: "narrator", key: "e17.hook.3" },
        { speaker: "momo", key: "e17.hook.4" }
      ],
      words: [
        { wordId: "ball", objectId: "ball" },
        { wordId: "look", objectId: "ball" },
        { wordId: "roll", objectId: "ball" }
      ],
      holdMs: 7500
    },
    {
      // 3. Momo points: "Ball." Sheru walks up to the ball and noses it (the stage
      // stops him beside it), sniffing while it is named. The camera holds still
      // for the whole beat.
      id: "model",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "move", actor: "sheru", to: "right", style: "walk" },
        { do: "face", actor: "sheru", toward: "ball" },
        { do: "gesture", actor: "sheru", gesture: "sniff", loop: true }
      ],
      lines: [
        { speaker: "momo", key: "e17.model.1" },
        { speaker: "narrator", key: "e17.model.2" },
        { speaker: "momo", key: "e17.model.3" },
        { speaker: "narrator", key: "e17.model.4" }
      ],
      words: [
        { wordId: "ball", objectId: "ball" },
        { wordId: "red", objectId: "ball" }
      ],
      holdMs: 7000
    },
    {
      // 4. "Ready..." and a calm pause; the ball glows softly as the one big target.
      // Tap, parent confirm or the quiet timeout all play the same response.
      id: "invite",
      kind: "invite",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" },
        { do: "object", target: "ball", action: "glow" },
        { do: "gesture", actor: "sheru", gesture: "wag" }
      ],
      lines: [{ speaker: "momo", key: "e17.invite.1" }],
      holdMs: 2000,
      input: { type: "tap", targets: ["ball"] },
      waitMs: 5000,
      caregiverPromptKey: "e17.tip.1",
      response: {
        stage: [
          { do: "move", actor: "ball", to: "backRight", style: "roll" },
          { do: "face", actor: "momo", toward: "ball" }
        ],
        lines: [{ speaker: "momo", key: "e17.invite.2" }],
        holdMs: 3500
      },
      words: [{ wordId: "go", objectId: "ball" }]
    },
    {
      // 5. Sheru goes after the ball and finds it: he runs to the ball's spot and
      // the stage stops him right beside it.
      id: "event",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "sfx", sound: "woof" },
        { do: "move", actor: "sheru", to: "backRight", style: "run" },
        { do: "face", actor: "sheru", toward: "ball" },
        { do: "gesture", actor: "momo", gesture: "cheer" }
      ],
      reducedMotionStage: [
        { do: "sfx", sound: "woof" },
        { do: "move", actor: "sheru", to: "backRight", style: "walk" },
        { do: "face", actor: "sheru", toward: "ball" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "narrator", key: "e17.event.1" },
        { speaker: "momo", key: "e17.event.2" },
        { speaker: "momo", key: "e17.event.3" },
        { speaker: "narrator", key: "e17.event.4" }
      ],
      words: [
        { wordId: "go", objectId: "sheru" },
        { wordId: "ball", objectId: "ball" }
      ],
      holdMs: 6500
    },
    {
      // 6. Sheru brings the ball back; "More ball?" and another calm pause.
      // Silence moves on just the same: Sheru nudges the ball to Momo. He faces
      // the viewer once he is back (not the spot the ball was picked up from),
      // so the ball he puts down lands in front of him.
      id: "repeat",
      kind: "repeat",
      stage: [
        { do: "carry", actor: "sheru", item: "ball" },
        { do: "move", actor: "sheru", to: "center", style: "walk" },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      lines: [
        { speaker: "narrator", key: "e17.repeat.1" },
        { speaker: "momo", key: "e17.repeat.2" },
        { speaker: "momo", key: "e17.repeat.3" }
      ],
      holdMs: 3000,
      input: { type: "tap", targets: ["ball"] },
      waitMs: 5000,
      caregiverPromptKey: "e17.tip.2",
      response: {
        stage: [
          { do: "carry", actor: "sheru", item: null },
          { do: "gesture", actor: "sheru", gesture: "sniff" },
          { do: "move", actor: "ball", to: "frontLeft", style: "roll" },
          { do: "gesture", actor: "momo", gesture: "cheer" }
        ],
        lines: [
          { speaker: "momo", key: "e17.repeat.4" },
          { speaker: "narrator", key: "e17.repeat.5" }
        ],
        holdMs: 3500
      },
      words: [
        { wordId: "ball", objectId: "ball" },
        { wordId: "thank-you", objectId: "sheru" },
        { wordId: "more", objectId: "ball" }
      ]
    },
    {
      // 7. The original "Ball Rolls" song: Momo rolls the ball along the front of
      // the meadow while Sheru, wagging, follows it with his eyes (the roll
      // passes in front of him, never through him).
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "ballRolls" },
        { do: "move", actor: "ball", to: "frontRight", style: "roll" },
        { do: "face", actor: "sheru", toward: "ball" },
        { do: "gesture", actor: "sheru", gesture: "wag", loop: true },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "ballRolls" },
        { do: "move", actor: "ball", to: "frontRight", style: "roll" },
        { do: "face", actor: "sheru", toward: "ball" },
        { do: "gesture", actor: "momo", gesture: "sway" }
      ],
      lines: [],
      holdMs: 18000
    },
    {
      // 8. Calm goodbye: Sheru trots over to his ball and turns to wave with his
      // tail, Momo waves. No next episode.
      id: "outro",
      kind: "outro",
      stage: [
        { do: "music", bed: null },
        { do: "move", actor: "sheru", to: "frontRight", style: "walk" },
        { do: "face", actor: "sheru", toward: "viewer" },
        { do: "gesture", actor: "sheru", gesture: "wag" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e17.outro.1" },
        { speaker: "momo", key: "e17.outro.2" },
        { speaker: "narrator", key: "e17.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "sheru" },
        { wordId: "ball", objectId: "ball" },
        { wordId: "roll", objectId: "ball" }
      ],
      holdMs: 7000
    }
  ]
};
