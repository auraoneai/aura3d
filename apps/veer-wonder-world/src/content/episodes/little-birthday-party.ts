// E16 — The Little Birthday Party (P2). Lulu and Momo throw a pretend party for
// Teddy in the music garden. They decorate with balloons, counted one at a time
// (each spoken number has exactly that many balloons in view), light the cake's
// one pretend candle ("One candle!", a second use of the target word "one"),
// sing the original "birthday" tune (never "Happy Birthday") while it
// glows, and blow it out: Lulu first, then it relights by itself (a silly
// candle), then the child's turn. Then a pretend bite.
//
// Staging: each balloon appears on the ground and floats up (a `move`, so it
// ends at its high spot inside every framing; `rise` would lift a balloon that
// already sits on a high spot out of the frame). The paths stay clear of Lulu
// and Momo. Lulu leans in toward the cake (`bow`) as she blows. The candle's
// flame is its own small prop on the cake's spot: the cake model has no flame
// and is a surface whose rest height is its candle top, so the flame sits on
// the candle. `show` lights it and `hide` blows it out; the song glows it on
// "a pretend light glows".
//
// Safety: the candle is a toy candle with a soft pretend glow; nothing invites
// play with real flames, and the caregiver bridge says so. Blowing is a tap or
// a caregiver's pretend blow: there is no microphone and nothing is scored.
// Counting lines are the only lines that count balloons; "One candle!" names
// the one candle in view.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "little-birthday-party",
  number: 16,
  version: 1,
  phase: "P2",
  titleKey: "e16.title",
  world: "music-garden",
  host: "lulu",
  cast: [
    { id: "lulu", at: "offLeft" },
    { id: "momo", at: "offRight" }
  ],
  props: [
    // The cake model ends at its candle top (no modelled flame); 0.42 m keeps its earlier look.
    { id: "cake", asset: "cake", at: "center", size: 0.42 },
    // The pretend flame rests on the candle (a small prop on the cake's spot); unlit until the candle beat.
    { id: "flame", asset: "candleFlame", at: "center", hidden: true, size: 0.08 },
    { id: "teddy", asset: "teddy", at: "back", size: 0.55 },
    { id: "balloon1", asset: "balloon", at: "backLeft", hidden: true, size: 0.6 },
    { id: "balloon2", asset: "balloon", at: "backRight", hidden: true, size: 0.6 },
    { id: "balloon3", asset: "balloon", at: "front", hidden: true, size: 0.6 }
  ],
  targetWords: ["cake", "one", "blow"],
  supportWords: ["two", "three", "balloon", "up", "teddy", "hi", "hello", "look", "out", "uh-oh", "mmm", "all-done", "bye"],
  music: "gardenBed",
  offlinePlayKey: "e16.offline",
  caregiverBridgeKey: "e16.bridge",
  numberConcept: { countMin: 1, countMax: 3, countedObjectIds: ["balloon1", "balloon2", "balloon3"] },
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 128,
  beats: [
    {
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "gardenBed" },
        { do: "enter", actor: "lulu", at: "left", from: "offLeft", style: "walk" },
        { do: "enter", actor: "momo", at: "right", from: "offRight", style: "walk" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "lulu", key: "e16.greet.1" },
        { speaker: "momo", key: "e16.greet.2" }
      ],
      words: [
        { wordId: "hi", objectId: "lulu" },
        { wordId: "hello", objectId: "momo" }
      ],
      holdMs: 3500
    },
    {
      // The one concrete thing: a little cake in the middle of the garden.
      id: "hook",
      kind: "hook",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "cake" },
        { do: "face", actor: "momo", toward: "cake" },
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "cake", action: "wobble" }
      ],
      lines: [
        { speaker: "narrator", key: "e16.hook.1" },
        { speaker: "momo", key: "e16.hook.2" }
      ],
      words: [
        { wordId: "look", objectId: "cake" },
        { wordId: "cake", objectId: "cake" }
      ],
      holdMs: 4000
    },
    {
      // Who the party is for: Teddy, sitting behind the cake.
      id: "teddy",
      kind: "hook",
      stage: [
        { do: "face", actor: "lulu", toward: "teddy" },
        { do: "gesture", actor: "lulu", gesture: "point" },
        { do: "object", target: "teddy", action: "bounce" }
      ],
      lines: [
        { speaker: "narrator", key: "e16.teddy.1" },
        { speaker: "momo", key: "e16.teddy.2" },
        { speaker: "lulu", key: "e16.teddy.3" }
      ],
      words: [
        { wordId: "teddy", objectId: "teddy" },
        { wordId: "hi", objectId: "teddy" },
        { wordId: "cake", objectId: "cake" }
      ],
      holdMs: 3500
    },
    {
      // Counting 1: exactly one balloon is in view when "One" is spoken.
      id: "count-one",
      kind: "model",
      camera: "wide",
      stage: [
        { do: "show", actor: "balloon1" },
        { do: "move", actor: "balloon1", to: "highLeft", style: "float" },
        { do: "face", actor: "lulu", toward: "balloon1" },
        { do: "gesture", actor: "lulu", gesture: "point" }
      ],
      lines: [
        { speaker: "lulu", key: "e16.count-one.1" },
        { speaker: "momo", key: "e16.count-one.2" }
      ],
      words: [
        { wordId: "one", objectId: "balloon1" },
        { wordId: "balloon", objectId: "balloon1" },
        { wordId: "up", objectId: "balloon1" }
      ],
      holdMs: 3000
    },
    {
      // Counting 2: the second balloon appears in the same beat as "Two".
      id: "count-two",
      kind: "model",
      stage: [
        { do: "show", actor: "balloon2" },
        { do: "move", actor: "balloon2", to: "highRight", style: "float" },
        { do: "face", actor: "momo", toward: "balloon2" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e16.count-two.1" },
        { speaker: "lulu", key: "e16.count-two.2" }
      ],
      words: [
        { wordId: "two", objectId: "balloon2" },
        { wordId: "up", objectId: "balloon2" }
      ],
      holdMs: 3000
    },
    {
      // Counting 3 (child turn): the third balloon waits low and close, in front
      // of the cake; a tap, a parent confirm or the quiet timeout lets it float
      // up between the other two.
      id: "count-three",
      kind: "invite",
      stage: [
        { do: "show", actor: "balloon3" },
        { do: "face", actor: "lulu", toward: "balloon3" },
        { do: "gesture", actor: "lulu", gesture: "point" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      lines: [
        { speaker: "momo", key: "e16.count-three.1" },
        { speaker: "lulu", key: "e16.count-three.2" }
      ],
      holdMs: 1500,
      input: { type: "tap", targets: ["balloon3"] },
      waitMs: 5000,
      caregiverPromptKey: "e16.tip.1",
      response: {
        stage: [
          { do: "move", actor: "balloon3", to: "high", style: "float" },
          { do: "gesture", actor: "lulu", gesture: "happy" }
        ],
        lines: [
          { speaker: "momo", key: "e16.count-three.3" },
          { speaker: "lulu", key: "e16.count-three.4" }
        ],
        holdMs: 3000
      },
      words: [
        { wordId: "balloon", objectId: "balloon3" },
        { wordId: "up", objectId: "balloon3" },
        { wordId: "three", objectId: "balloon3" }
      ]
    },
    {
      // The cake's one toy candle lights with a soft pretend glow (never a flash).
      id: "candle",
      kind: "model",
      camera: "medium",
      stage: [
        { do: "show", actor: "flame" },
        { do: "sfx", sound: "sparkle" },
        { do: "object", target: "flame", action: "glow" },
        { do: "face", actor: "lulu", toward: "cake" },
        { do: "face", actor: "momo", toward: "cake" }
      ],
      lines: [
        { speaker: "narrator", key: "e16.candle.1" },
        { speaker: "lulu", key: "e16.candle.2" }
      ],
      words: [{ wordId: "look", objectId: "flame" }],
      holdMs: 2000
    },
    {
      // Resolution song while the pretend candle glows, as at a real party: the
      // original birthday tune (its words invite a gentle pretend blow), then the
      // blowing. The flame glows on "a pretend light glows" (lyric line 1).
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "birthday", cues: [{ line: 1, stage: [{ do: "object", target: "flame", action: "glow" }] }] },
        { do: "object", target: "cake", action: "glow" },
        { do: "gesture", actor: "lulu", gesture: "dance", loop: true },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "object", target: "teddy", action: "bounce" }
      ],
      reducedMotionStage: [
        { do: "song", song: "birthday", cues: [{ line: 1, stage: [{ do: "object", target: "flame", action: "glow" }] }] },
        { do: "object", target: "cake", action: "glow" },
        { do: "gesture", actor: "lulu", gesture: "sway" },
        { do: "gesture", actor: "momo", gesture: "sway" }
      ],
      lines: [],
      holdMs: 19000
    },
    {
      // First attempt: Lulu leans in and blows (the target word "blow" is
      // shown, not just heard) and the pretend flame goes out.
      id: "blow-model",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "sfx", sound: "blow" },
        { do: "hide", actor: "flame" },
        { do: "gesture", actor: "lulu", gesture: "bow" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      lines: [
        { speaker: "lulu", key: "e16.blow-model.1" },
        { speaker: "momo", key: "e16.blow-model.2" }
      ],
      words: [
        { wordId: "blow", objectId: "cake" },
        { wordId: "out", objectId: "cake" }
      ],
      holdMs: 2500
    },
    {
      // Gentle surprise: the silly pretend candle lights again by itself.
      id: "relight",
      kind: "event",
      stage: [
        { do: "show", actor: "flame" },
        { do: "sfx", sound: "sparkle" },
        { do: "object", target: "flame", action: "glow" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "surprise" }
      ],
      lines: [
        { speaker: "momo", key: "e16.relight.1" },
        { speaker: "lulu", key: "e16.relight.2" }
      ],
      words: [{ wordId: "uh-oh", objectId: "cake" }],
      holdMs: 2500
    },
    {
      // Second attempt (child turn): tap the cake or blow a pretend candle
      // together. The lit flame glows as the turn is offered and goes out after it.
      id: "blow-invite",
      kind: "invite",
      stage: [
        { do: "object", target: "flame", action: "glow" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "look" },
        { do: "face", actor: "momo", toward: "cake" }
      ],
      lines: [{ speaker: "lulu", key: "e16.blow-invite.1" }],
      holdMs: 1500,
      input: { type: "tap", targets: ["cake"] },
      waitMs: 5000,
      caregiverPromptKey: "e16.tip.2",
      response: {
        stage: [
          { do: "sfx", sound: "blow" },
          { do: "hide", actor: "flame" },
          { do: "gesture", actor: "lulu", gesture: "cheer" },
          { do: "gesture", actor: "momo", gesture: "cheer" }
        ],
        lines: [
          { speaker: "momo", key: "e16.blow-invite.2" },
          { speaker: "lulu", key: "e16.blow-invite.3" }
        ],
        holdMs: 2000
      },
      words: [
        { wordId: "blow", objectId: "cake" },
        { wordId: "out", objectId: "cake" },
        { wordId: "teddy", objectId: "teddy" }
      ]
    },
    {
      // A pretend bite: the toy cake stays whole (no "eat" object action, which uses an object up).
      id: "eat",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "face", actor: "momo", toward: "cake" },
        { do: "gesture", actor: "momo", gesture: "eat" },
        { do: "sfx", sound: "munch" }
      ],
      lines: [
        { speaker: "momo", key: "e16.eat.1" },
        { speaker: "lulu", key: "e16.eat.2" }
      ],
      words: [
        { wordId: "mmm", objectId: "momo" },
        { wordId: "cake", objectId: "cake" },
        { wordId: "teddy", objectId: "teddy" }
      ],
      holdMs: 3000
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
        { speaker: "lulu", key: "e16.outro.1" },
        { speaker: "momo", key: "e16.outro.2" },
        { speaker: "lulu", key: "e16.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "lulu" },
        { wordId: "bye", objectId: "momo" },
        { wordId: "teddy", objectId: "teddy" }
      ],
      holdMs: 4500
    }
  ]
};
