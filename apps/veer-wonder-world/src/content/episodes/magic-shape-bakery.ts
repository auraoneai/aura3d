// E12 — The Magic Shape Bakery (P2, PRD 05 E12, task H07). Hosts: Momo + Lumi.
//
// Lumi's magic turns Momo's dough into three big pastry shapes, one at a
// time: a circle that bounces, a square and a pointy triangle. Each shape is
// named while it appears or moves, then matched with a familiar object (a
// round plate, a square block, and Momo's cone party hat on the table for the
// triangle, "like a hat" as the song sings). Shapes are told apart by their
// silhouettes and by what they do, never by colour or text: all three
// pastries share one golden colour. The child can tap a shape to make it
// wobble (no timed matching, no quiz); every wait ends by itself. The recap
// names each shape while that shape alone bounces, then the "shapes" song
// plays: on each of its first three lines that line's pastry bounces and its
// object glows (the party hat on "Triangle, triangle, like a hat."), then Momo
// pretends to eat the circle. The pastries are flat biscuits lying on the
// floor, so the whole episode uses the fixed "high" framing: from the "wide"
// camera their tops (the shapes) are seen almost edge-on (about 64 x 18 px on
// a phone), from "high" about twice as tall, and the cast, plate, block, table
// and hat all stay in frame.
import type { EpisodeSpec } from "../../types.js";

export const episode: EpisodeSpec = {
  kind: "episode",
  id: "magic-shape-bakery",
  number: 12,
  version: 1,
  phase: "P2",
  titleKey: "e12.title",
  world: "home-nook",
  host: "momo",
  cast: [
    { id: "momo", at: "offLeft" },
    { id: "lumi", at: "offTop" }
  ],
  props: [
    { id: "table", asset: "table", at: "backLeft", size: 0.6 },
    { id: "pastry-circle", asset: "pastryCircle", at: "frontLeft", hidden: true, size: 0.16 },
    { id: "pastry-square", asset: "pastrySquare", at: "frontRight", hidden: true, size: 0.16 },
    { id: "pastry-triangle", asset: "pastryTriangle", at: "front", hidden: true, size: 0.16 },
    { id: "plate", asset: "plate", at: "left", hidden: true },
    { id: "block", asset: "toyBlock", at: "right", hidden: true },
    // A cone party hat (a triangle seen from the side), on the table: a small prop on a surface's spot rests on top.
    { id: "party-hat", asset: "partyHat", at: "backLeft", hidden: true, size: 0.35 }
  ],
  targetWords: ["circle", "square", "triangle"],
  supportWords: ["look", "oh", "mmm", "plate", "block", "hat", "more", "eat", "hi", "hello", "bye", "all-done"],
  music: "homeBed",
  offlinePlayKey: "e12.offline",
  caregiverBridgeKey: "e12.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  estimatedDurationSec: 131,
  beats: [
    {
      id: "greeting",
      kind: "greeting",
      camera: "high",
      stage: [
        { do: "music", bed: "homeBed" },
        { do: "enter", actor: "momo", at: "center", from: "offLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e12.greeting.1" },
        { speaker: "momo", key: "e12.greeting.2" }
      ],
      words: [
        { wordId: "hi", objectId: "momo" },
        { wordId: "mmm", objectId: "momo" }
      ],
      holdMs: 2000
    },
    {
      id: "lumi-arrives",
      kind: "hook",
      camera: "high",
      stage: [
        { do: "enter", actor: "lumi", at: "high", from: "offTop", style: "float" },
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "sfx", sound: "sparkle" },
        { do: "face", actor: "momo", toward: "lumi" }
      ],
      lines: [
        { speaker: "lumi", key: "e12.lumi-arrives.1" },
        { speaker: "momo", key: "e12.lumi-arrives.2" }
      ],
      words: [{ wordId: "hello", objectId: "lumi" }],
      holdMs: 1500
    },
    {
      id: "circle",
      kind: "hook",
      camera: "high",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "sfx", sound: "sparkle" },
        { do: "show", actor: "pastry-circle" },
        { do: "object", target: "pastry-circle", action: "grow" },
        { do: "face", actor: "momo", toward: "pastry-circle" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [
        { speaker: "narrator", key: "e12.circle.1" },
        { speaker: "lumi", key: "e12.circle.2" }
      ],
      words: [
        { wordId: "look", objectId: "pastry-circle" },
        { wordId: "circle", objectId: "pastry-circle" }
      ],
      holdMs: 2500
    },
    {
      id: "bounce",
      kind: "event",
      camera: "high",
      stage: [
        { do: "object", target: "pastry-circle", action: "bounce" },
        { do: "sfx", sound: "boing" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      reducedMotionStage: [
        { do: "object", target: "pastry-circle", action: "wobble" },
        { do: "sfx", sound: "boing" },
        { do: "gesture", actor: "momo", gesture: "nod" }
      ],
      lines: [
        { speaker: "momo", key: "e12.bounce.1" },
        { speaker: "momo", key: "e12.bounce.2" }
      ],
      words: [
        { wordId: "oh", objectId: "momo" },
        { wordId: "circle", objectId: "pastry-circle" }
      ],
      holdMs: 2000
    },
    {
      id: "circle-plate",
      kind: "model",
      camera: "high",
      stage: [
        { do: "show", actor: "plate" },
        { do: "object", target: "plate", action: "wobble" },
        { do: "face", actor: "momo", toward: "plate" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e12.circle-plate.1" },
        { speaker: "lumi", key: "e12.circle-plate.2" }
      ],
      words: [
        { wordId: "plate", objectId: "plate" },
        { wordId: "circle", objectId: "plate" }
      ],
      holdMs: 2500,
      caregiverPromptKey: "e12.tip.3"
    },
    {
      id: "square",
      kind: "model",
      camera: "high",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "sfx", sound: "sparkle" },
        { do: "show", actor: "pastry-square" },
        { do: "object", target: "pastry-square", action: "grow" },
        { do: "face", actor: "momo", toward: "pastry-square" }
      ],
      lines: [
        { speaker: "lumi", key: "e12.square.1" },
        { speaker: "narrator", key: "e12.square.2" },
        { speaker: "momo", key: "e12.square.3" }
      ],
      words: [
        { wordId: "more", objectId: "lumi" },
        { wordId: "square", objectId: "pastry-square" }
      ],
      holdMs: 2500
    },
    {
      id: "square-block",
      kind: "model",
      camera: "high",
      stage: [
        { do: "show", actor: "block" },
        { do: "object", target: "block", action: "wobble" },
        { do: "face", actor: "momo", toward: "block" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e12.square-block.1" },
        { speaker: "lumi", key: "e12.square-block.2" }
      ],
      words: [
        { wordId: "block", objectId: "block" },
        { wordId: "square", objectId: "block" }
      ],
      holdMs: 2500
    },
    {
      id: "turn-wobble",
      kind: "invite",
      camera: "high",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" },
        { do: "gesture", actor: "lumi", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e12.turn-wobble.1" },
        { speaker: "momo", key: "e12.turn-wobble.2" }
      ],
      words: [
        { wordId: "circle", objectId: "pastry-circle" },
        { wordId: "square", objectId: "pastry-square" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["pastry-circle", "pastry-square"] },
      waitMs: 5000,
      caregiverPromptKey: "e12.tip.1",
      response: {
        stage: [
          { do: "object", target: "pastry-circle", action: "wobble" },
          { do: "object", target: "pastry-square", action: "wobble" },
          { do: "sfx", sound: "giggle" },
          { do: "gesture", actor: "momo", gesture: "happy" }
        ],
        lines: [
          { speaker: "narrator", key: "e12.turn-wobble.3" },
          { speaker: "momo", key: "e12.turn-wobble.4" }
        ],
        holdMs: 2000
      }
    },
    {
      id: "triangle",
      kind: "model",
      camera: "high",
      stage: [
        { do: "gesture", actor: "lumi", gesture: "glow" },
        { do: "sfx", sound: "sparkle" },
        { do: "show", actor: "pastry-triangle" },
        { do: "object", target: "pastry-triangle", action: "grow" },
        { do: "face", actor: "momo", toward: "pastry-triangle" }
      ],
      lines: [
        { speaker: "lumi", key: "e12.triangle.1" },
        { speaker: "narrator", key: "e12.triangle.2" },
        { speaker: "momo", key: "e12.triangle.3" }
      ],
      words: [{ wordId: "triangle", objectId: "pastry-triangle" }],
      holdMs: 2500
    },
    {
      id: "pointy",
      kind: "model",
      camera: "high",
      stage: [
        { do: "gesture", actor: "momo", gesture: "point" },
        { do: "object", target: "pastry-triangle", action: "glow" }
      ],
      lines: [
        { speaker: "momo", key: "e12.pointy.1" },
        { speaker: "lumi", key: "e12.pointy.2" }
      ],
      words: [{ wordId: "triangle", objectId: "pastry-triangle" }],
      holdMs: 2000,
      caregiverPromptKey: "e12.tip.2"
    },
    {
      // The familiar object for the triangle, as the plate and the block are for the others.
      id: "triangle-hat",
      kind: "model",
      camera: "high",
      stage: [
        { do: "show", actor: "party-hat" },
        { do: "object", target: "party-hat", action: "wobble" },
        { do: "face", actor: "momo", toward: "party-hat" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [
        { speaker: "momo", key: "e12.triangle-hat.1" },
        { speaker: "lumi", key: "e12.triangle-hat.2" }
      ],
      words: [
        { wordId: "hat", objectId: "party-hat" },
        { wordId: "triangle", objectId: "party-hat" }
      ],
      holdMs: 2500
    },
    {
      id: "turn-triangle",
      kind: "invite",
      camera: "high",
      stage: [
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "look" }
      ],
      lines: [{ speaker: "momo", key: "e12.turn-triangle.1" }],
      words: [{ wordId: "triangle", objectId: "pastry-triangle" }],
      holdMs: 500,
      input: { type: "tap", targets: ["pastry-triangle"] },
      waitMs: 5000,
      caregiverPromptKey: "e12.tip.1",
      response: {
        stage: [
          { do: "object", target: "pastry-triangle", action: "wobble" },
          { do: "sfx", sound: "boing" },
          { do: "gesture", actor: "momo", gesture: "happy" }
        ],
        lines: [
          { speaker: "narrator", key: "e12.turn-triangle.2" },
          { speaker: "momo", key: "e12.turn-triangle.3" }
        ],
        holdMs: 2000
      }
    },
    {
      id: "recap-circle",
      kind: "repeat",
      camera: "high",
      stage: [
        { do: "object", target: "pastry-circle", action: "bounce" },
        { do: "face", actor: "momo", toward: "pastry-circle" }
      ],
      reducedMotionStage: [
        { do: "object", target: "pastry-circle", action: "wobble" },
        { do: "face", actor: "momo", toward: "pastry-circle" }
      ],
      lines: [{ speaker: "lumi", key: "e12.recap-circle.1" }],
      words: [{ wordId: "circle", objectId: "pastry-circle" }],
      holdMs: 1500
    },
    {
      id: "recap-square",
      kind: "repeat",
      camera: "high",
      stage: [
        { do: "object", target: "pastry-square", action: "bounce" },
        { do: "face", actor: "momo", toward: "pastry-square" }
      ],
      reducedMotionStage: [
        { do: "object", target: "pastry-square", action: "wobble" },
        { do: "face", actor: "momo", toward: "pastry-square" }
      ],
      lines: [{ speaker: "lumi", key: "e12.recap-square.1" }],
      words: [{ wordId: "square", objectId: "pastry-square" }],
      holdMs: 1500
    },
    {
      id: "recap-triangle",
      kind: "repeat",
      camera: "high",
      stage: [
        { do: "object", target: "pastry-triangle", action: "bounce" },
        { do: "face", actor: "momo", toward: "pastry-triangle" }
      ],
      reducedMotionStage: [
        { do: "object", target: "pastry-triangle", action: "wobble" },
        { do: "face", actor: "momo", toward: "pastry-triangle" }
      ],
      lines: [
        { speaker: "lumi", key: "e12.recap-triangle.1" },
        { speaker: "momo", key: "e12.recap-triangle.2" }
      ],
      words: [{ wordId: "triangle", objectId: "pastry-triangle" }],
      holdMs: 1500
    },
    {
      // Lyric lines 0-2 pair a pastry with its object ("round like a plate",
      // "like a block", "like a hat"): the pastry bounces and the object glows
      // as the line starts; line 3 ("Circle, square, triangle,") bounces all
      // three. Reduced motion wobbles the pastries instead of bouncing them.
      id: "song",
      kind: "song",
      camera: "high",
      stage: [
        {
          do: "song",
          song: "shapes",
          cues: [
            { line: 0, stage: [{ do: "object", target: "pastry-circle", action: "bounce" }, { do: "object", target: "plate", action: "glow" }] },
            { line: 1, stage: [{ do: "object", target: "pastry-square", action: "bounce" }, { do: "object", target: "block", action: "glow" }] },
            {
              line: 2,
              stage: [
                { do: "show", actor: "party-hat" },
                { do: "object", target: "pastry-triangle", action: "bounce" },
                { do: "object", target: "party-hat", action: "glow" }
              ]
            },
            {
              line: 3,
              stage: [
                { do: "object", target: "pastry-circle", action: "bounce" },
                { do: "object", target: "pastry-square", action: "bounce" },
                { do: "object", target: "pastry-triangle", action: "bounce" }
              ]
            }
          ]
        },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "dance", loop: true },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true }
      ],
      reducedMotionStage: [
        {
          do: "song",
          song: "shapes",
          cues: [
            { line: 0, stage: [{ do: "object", target: "pastry-circle", action: "wobble" }, { do: "object", target: "plate", action: "glow" }] },
            { line: 1, stage: [{ do: "object", target: "pastry-square", action: "wobble" }, { do: "object", target: "block", action: "glow" }] },
            {
              line: 2,
              stage: [
                { do: "show", actor: "party-hat" },
                { do: "object", target: "pastry-triangle", action: "wobble" },
                { do: "object", target: "party-hat", action: "glow" }
              ]
            },
            {
              line: 3,
              stage: [
                { do: "object", target: "pastry-circle", action: "wobble" },
                { do: "object", target: "pastry-square", action: "wobble" },
                { do: "object", target: "pastry-triangle", action: "wobble" }
              ]
            }
          ]
        },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "sway", loop: true },
        { do: "gesture", actor: "lumi", gesture: "float", loop: true }
      ],
      lines: [],
      holdMs: 17500
    },
    {
      id: "taste",
      kind: "event",
      camera: "high",
      stage: [
        { do: "face", actor: "momo", toward: "pastry-circle" },
        { do: "gesture", actor: "momo", gesture: "eat" },
        { do: "object", target: "pastry-circle", action: "eat" },
        { do: "sfx", sound: "munch" }
      ],
      lines: [
        { speaker: "momo", key: "e12.taste.1" },
        { speaker: "narrator", key: "e12.taste.2" },
        { speaker: "lumi", key: "e12.taste.3" }
      ],
      words: [
        { wordId: "eat", objectId: "momo" },
        { wordId: "mmm", objectId: "momo" }
      ],
      holdMs: 2500
    },
    {
      id: "outro",
      kind: "outro",
      camera: "high",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "gesture", actor: "lumi", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "e12.outro.1" },
        { speaker: "momo", key: "e12.outro.2" },
        { speaker: "lumi", key: "e12.outro.3" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "lumi" }
      ],
      holdMs: 5000
    }
  ]
};
