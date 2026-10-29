// E19 — Momo's Day (P2). One short day in the Home Nook in three clear scenes:
// the morning sun rises in the toy bedroom, Momo wakes up, washes sticky hands
// at the sink (and dries them), eats a banana, brushes his teeth (a short
// variant scene), sings the original routine song, and goes to bed while
// Lumi, the soft night star, says goodnight.
//
// Each core scene has one tap: the sink (water), the banana (food) and the
// bed. Watching without touching plays the same day. The ending is calm and
// final: the music stops, Momo sleeps, Lumi waves, and nothing plays next (no
// bedtime autoplay). The sun's and Lumi's glows are soft and never flash.
//
// Staging: the sink stands on a spot every framing keeps in view (portrait
// phones included), so the tap target is always on screen; Momo stops beside
// it. He turns to the viewer while drying, so the towel he puts down lands in
// front of him rather than in the sink. The sun appears low in the back
// corner by the window and floats up (`rise`). The toothbrush appears in
// Momo's hand (shown, then carried) and goes with him to the sink; he keeps
// it through the song and sets it down there before bed. The song touches one
// object per lyric line, and on "The moon is up" the sun sinks and fades
// (the night beat hides it too, so the night never keeps a sun).
import type { EpisodeSpec, SongCue } from "../../types.js";

/** The routine song's cues, one object per lyric line (the same with reduced motion: no bounce, no travel). */
const ROUTINE_CUES: readonly SongCue[] = [
  { line: 0, stage: [{ do: "object", target: "sun", action: "glow" }] },
  { line: 1, stage: [{ do: "object", target: "sink", action: "wash" }] },
  { line: 2, stage: [{ do: "object", target: "plate", action: "wobble" }] },
  { line: 3, stage: [{ do: "object", target: "toothbrush", action: "wobble" }] },
  { line: 4, stage: [{ do: "object", target: "sun", action: "down" }] },
  { line: 5, stage: [{ do: "hide", actor: "sun" }] }
];

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "momos-day",
  number: 19,
  version: 1,
  phase: "P2",
  titleKey: "e19.title",
  world: "home-nook",
  host: "momo",
  cast: [
    { id: "momo", at: "backRight" },
    { id: "lumi", at: "highRight", hidden: true }
  ],
  props: [
    { id: "bed", asset: "bed", at: "backRight", size: 0.7 },
    { id: "sink", asset: "sink", at: "left", size: 0.9 },
    { id: "towel", asset: "towel", at: "frontLeft", size: 0.2 },
    { id: "plate", asset: "plate", at: "front", size: 0.08 },
    { id: "banana", asset: "banana", at: "front", size: 0.3 },
    // Rises from the back corner by the window: in view in every framing, clear of the sink, bed and Lumi.
    { id: "sun", asset: "sun", at: "backLeft", hidden: true, size: 0.7 },
    // Shown straight into Momo's hand, so it waits off stage until then.
    { id: "toothbrush", asset: "toothbrush", at: "offLeft", hidden: true, size: 0.3 }
  ],
  targetWords: ["wash", "eat", "sleep"],
  supportWords: ["sun", "wake", "hi", "look", "hands", "uh-oh", "water", "dry", "tummy", "banana", "more", "mmm", "brush", "hello", "bed", "all-done", "bye"],
  music: "homeBed",
  offlinePlayKey: "e19.offline",
  caregiverBridgeKey: "e19.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 131,
  beats: [
    {
      // Morning (PRD 05 E19 hook): the toy sun rises in the bedroom while Momo still sleeps.
      id: "sunrise",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "homeBed" },
        { do: "gesture", actor: "momo", gesture: "sleep" },
        { do: "show", actor: "sun" },
        { do: "object", target: "sun", action: "rise" }
      ],
      lines: [{ speaker: "narrator", key: "e19.sunrise.1" }],
      words: [
        { wordId: "look", objectId: "sun" },
        { wordId: "sun", objectId: "sun" }
      ],
      holdMs: 1500
    },
    {
      // Momo wakes up in bed.
      id: "greet",
      kind: "greeting",
      camera: "wide",
      stage: [{ do: "gesture", actor: "momo", gesture: "wake" }],
      lines: [{ speaker: "narrator", key: "e19.greet.1" }],
      words: [{ wordId: "wake", objectId: "momo" }],
      holdMs: 2500
    },
    {
      id: "hi",
      kind: "greeting",
      stage: [
        { do: "move", actor: "momo", to: "center", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e19.hi.1" },
        { speaker: "momo", key: "e19.hi.2" }
      ],
      words: [{ wordId: "hi", objectId: "momo" }],
      holdMs: 3000
    },
    {
      // The first need: sticky hands. Momo heads to the sink.
      id: "hook",
      kind: "hook",
      stage: [
        { do: "gesture", actor: "momo", gesture: "look" },
        { do: "move", actor: "momo", to: "left", style: "walk" }
      ],
      lines: [
        { speaker: "momo", key: "e19.hook.1" },
        { speaker: "momo", key: "e19.hook.2" },
        { speaker: "narrator", key: "e19.hook.3" }
      ],
      words: [
        { wordId: "look", objectId: "momo" },
        { wordId: "hands", objectId: "momo" },
        { wordId: "uh-oh", objectId: "momo" }
      ],
      holdMs: 3500
    },
    {
      // Wash, attempt 1: the water runs and Momo washes.
      id: "wash-model",
      kind: "model",
      camera: "left",
      stage: [
        { do: "face", actor: "momo", toward: "sink" },
        { do: "object", target: "sink", action: "wash" },
        { do: "sfx", sound: "splash" },
        { do: "gesture", actor: "momo", gesture: "clap" }
      ],
      lines: [
        { speaker: "narrator", key: "e19.wash-model.1" },
        { speaker: "momo", key: "e19.wash-model.2" }
      ],
      words: [
        { wordId: "water", objectId: "sink" },
        { wordId: "wash", objectId: "momo" }
      ],
      holdMs: 3000
    },
    {
      // Wash, child turn: tap the sink for more water. Silence washes too.
      id: "wash-invite",
      kind: "invite",
      stage: [
        { do: "object", target: "sink", action: "stop" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [{ speaker: "momo", key: "e19.wash-invite.1" }],
      holdMs: 1500,
      input: { type: "tap", targets: ["sink"] },
      waitMs: 5000,
      caregiverPromptKey: "e19.tip.1",
      response: {
        stage: [
          { do: "face", actor: "momo", toward: "sink" },
          { do: "object", target: "sink", action: "wash" },
          { do: "sfx", sound: "splash" },
          { do: "gesture", actor: "momo", gesture: "clap" }
        ],
        lines: [
          { speaker: "momo", key: "e19.wash-invite.2" },
          { speaker: "narrator", key: "e19.wash-invite.3" }
        ],
        holdMs: 2500
      },
      words: [
        { wordId: "water", objectId: "sink" },
        { wordId: "wash", objectId: "momo" },
        { wordId: "hands", objectId: "momo" }
      ]
    },
    {
      id: "dry",
      kind: "event",
      stage: [
        { do: "object", target: "sink", action: "stop" },
        { do: "gesture", actor: "momo", gesture: "pickUp" },
        { do: "carry", actor: "momo", item: "towel" },
        { do: "object", target: "towel", action: "dry" },
        { do: "face", actor: "momo", toward: "viewer" }
      ],
      lines: [
        { speaker: "narrator", key: "e19.dry.1" },
        { speaker: "momo", key: "e19.dry.2" }
      ],
      words: [{ wordId: "dry", objectId: "towel" }],
      holdMs: 3000
    },
    {
      // The second need: a rumbling tummy. Momo puts the towel down and goes to the food.
      id: "tummy",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "carry", actor: "momo", item: null },
        { do: "move", actor: "momo", to: "center", style: "walk" },
        { do: "sfx", sound: "rumble" }
      ],
      lines: [
        { speaker: "narrator", key: "e19.tummy.1" },
        { speaker: "momo", key: "e19.tummy.2" }
      ],
      words: [{ wordId: "tummy", objectId: "momo" }],
      holdMs: 2500
    },
    {
      // Eat, attempt 1: Momo takes a bite of the banana.
      id: "eat-model",
      kind: "model",
      stage: [
        { do: "face", actor: "momo", toward: "banana" },
        { do: "object", target: "banana", action: "bounce" },
        { do: "gesture", actor: "momo", gesture: "eat" }
      ],
      lines: [
        { speaker: "narrator", key: "e19.eat-model.1" },
        { speaker: "momo", key: "e19.eat-model.2" }
      ],
      words: [
        { wordId: "banana", objectId: "banana" },
        { wordId: "eat", objectId: "banana" },
        { wordId: "mmm", objectId: "momo" }
      ],
      holdMs: 2500
    },
    {
      // Eat, child turn: tap the banana. Silence gives Momo the next bite too.
      id: "eat-invite",
      kind: "invite",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [{ speaker: "momo", key: "e19.eat-invite.1" }],
      holdMs: 1500,
      input: { type: "tap", targets: ["banana"] },
      waitMs: 5000,
      caregiverPromptKey: "e19.tip.2",
      response: {
        stage: [
          { do: "face", actor: "momo", toward: "banana" },
          { do: "gesture", actor: "momo", gesture: "eat" },
          { do: "sfx", sound: "munch" },
          { do: "object", target: "banana", action: "eat" }
        ],
        lines: [
          { speaker: "momo", key: "e19.eat-invite.2" },
          { speaker: "narrator", key: "e19.eat-invite.3" }
        ],
        holdMs: 2500
      },
      words: [
        { wordId: "more", objectId: "banana" },
        { wordId: "eat", objectId: "banana" },
        { wordId: "mmm", objectId: "momo" },
        { wordId: "tummy", objectId: "momo" }
      ]
    },
    {
      // Brush (a variant routine): the toothbrush appears in Momo's hand and he carries it to the sink.
      id: "toothbrush",
      kind: "event",
      camera: "left",
      stage: [
        { do: "gesture", actor: "momo", gesture: "pickUp" },
        { do: "show", actor: "toothbrush" },
        { do: "carry", actor: "momo", item: "toothbrush" },
        { do: "move", actor: "momo", to: "left", style: "walk" }
      ],
      lines: [{ speaker: "narrator", key: "e19.toothbrush.1" }],
      holdMs: 1500
    },
    {
      // Gentle brushing: Momo sways a little and the toothbrush wiggles side to side in his hand.
      id: "brush",
      kind: "model",
      camera: "left",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway" },
        { do: "object", target: "toothbrush", action: "wobble" }
      ],
      lines: [
        { speaker: "momo", key: "e19.brush.1" },
        { speaker: "narrator", key: "e19.brush.2" }
      ],
      words: [{ wordId: "brush", objectId: "toothbrush" }],
      holdMs: 2500,
      caregiverPromptKey: "e19.tip.4"
    },
    {
      id: "song",
      kind: "song",
      camera: "wide",
      stage: [
        { do: "song", song: "routine", cues: ROUTINE_CUES },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true }
      ],
      reducedMotionStage: [
        { do: "song", song: "routine", cues: ROUTINE_CUES },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway" }
      ],
      lines: [],
      holdMs: 18000
    },
    {
      // Night: the music rests, the sun is gone, Lumi appears softly over the bed,
      // and Momo sets the toothbrush down by the sink and walks to bed.
      id: "sleepy",
      kind: "model",
      stage: [
        { do: "music", bed: null },
        { do: "sfx", sound: "yawn" },
        { do: "hide", actor: "sun" },
        { do: "show", actor: "lumi" },
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "carry", actor: "momo", item: null },
        { do: "move", actor: "momo", to: "backRight", style: "walk" }
      ],
      lines: [
        { speaker: "narrator", key: "e19.sleepy.1" },
        { speaker: "lumi", key: "e19.sleepy.2" },
        { speaker: "narrator", key: "e19.sleepy.3" }
      ],
      words: [
        { wordId: "hello", objectId: "lumi" },
        { wordId: "look", objectId: "bed" },
        { wordId: "bed", objectId: "bed" }
      ],
      holdMs: 3000
    },
    {
      // Sleep, child turn: tap the bed. Silence tucks Momo in too.
      id: "sleep-invite",
      kind: "invite",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [{ speaker: "momo", key: "e19.sleep-invite.1" }],
      holdMs: 1500,
      input: { type: "tap", targets: ["bed"] },
      waitMs: 5000,
      caregiverPromptKey: "e19.tip.3",
      response: {
        stage: [{ do: "gesture", actor: "momo", gesture: "sleep", loop: true }],
        lines: [
          { speaker: "momo", key: "e19.sleep-invite.2" },
          { speaker: "narrator", key: "e19.sleep-invite.3" }
        ],
        holdMs: 3000
      },
      words: [
        { wordId: "bed", objectId: "bed" },
        { wordId: "sleep", objectId: "momo" }
      ]
    },
    {
      // Calm, final goodbye from Lumi while Momo sleeps. Nothing plays next.
      id: "outro",
      kind: "outro",
      stage: [
        { do: "face", actor: "lumi", toward: "viewer" },
        { do: "gesture", actor: "lumi", gesture: "wave" }
      ],
      lines: [
        { speaker: "lumi", key: "e19.outro.1" },
        { speaker: "lumi", key: "e19.outro.2" },
        { speaker: "lumi", key: "e19.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "lumi" },
        { wordId: "sleep", objectId: "momo" },
        { wordId: "bye", objectId: "lumi" }
      ],
      holdMs: 5000
    }
  ]
};
