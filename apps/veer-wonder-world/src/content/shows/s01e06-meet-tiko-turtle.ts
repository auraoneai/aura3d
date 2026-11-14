// S01E06 — "Meet Tiko the Counting Turtle!" (PRD 09 B.8 new-character onboarding episode).
// Momo introduces Tiko ("tiko", the gentle sea-green counting turtle) across Meadow -> Learning Cloud
// -> Music Garden -> Home Nook, contrasting Lulu's fast zoom with Tiko's calm "Slow and steady!" counting.

import type { ShowSpec } from "../../types.js";

export const s01e06MeetTikoTurtle = {
  kind: "show",
  id: "s01e06-meet-tiko-turtle",
  code: "s01e06",
  version: 1,
  band: "toddler",
  aspect: "16:9",
  calendarWeek: 6,
  titleKey: "s01e06.title",
  host: "momo",
  targetWords: ["one", "two", "three"],
  supportWords: ["slow", "fast", "circle", "square", "triangle", "look"],
  pauseMs: 2500,
  estimatedDurationSec: 595,
  endCardSec: 6,
  offlinePlayKey: "s01e06.offlinePlay",
  caregiverBridgeKey: "s01e06.caregiverBridge",
  chapters: [
    { segmentId: "s1-meadow-tiko", titleKey: "s01e06.ch.meadow", atSec: 0 },
    { segmentId: "s2-cloud-shapes", titleKey: "s01e06.ch.cloud", atSec: 150 },
    { segmentId: "s3-garden-rhythm", titleKey: "s01e06.ch.garden", atSec: 315 },
    { segmentId: "s4-home-snack", titleKey: "s01e06.ch.home", atSec: 465 }
  ],
  youtube: {
    title: "Meet Tiko the Counting Turtle! 🐢 Count 1 2 3 & Shapes",
    description: [
      "Momo and friends welcome Tiko, a gentle sea-green turtle who loves counting one, two, three and looking closely! Watch Lulu zoom fast while Tiko goes slow and steady to spot a hiding triangle.",
      "",
      "For ages 1-4, best watched together. Pause with your little one to wave, count to three, and trace shapes.",
      "",
      "0:00 Meeting Tiko in the Meadow",
      "2:30 Fast Lulu and the hiding triangle",
      "5:15 Three slow turtle steps",
      "7:45 Three cookies at Home Nook",
      "",
      "Play together in the Wonder World app: <app URL>",
      "Calm pacing, no flashing, no startling sounds. Made with care by a parent for their little one."
    ].join("\n"),
    thumbnailBeatId: "s1-meet",
    thumbnailOffsetMs: 500,
    thumbnailTitle: "Meet Tiko! 1 2 3",
    playlist: "Counting with Friends"
  },
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:antigravity (owner instruction 2026-11-13)",
    date: "2026-11-13"
  },
  segments: [
    // Segment 1 — Meadow: Meeting Tiko & counting three flowers
    {
      id: "s1-meadow-tiko",
      template: "coldOpen",
      world: "meadow",
      music: "meadowBed",
      transitionIn: "none",
      then: "s2-cloud-shapes",
      cast: [
        { id: "momo", at: "center" },
        { id: "sheru", at: "frontLeft" },
        { id: "lulu", at: "left" },
        { id: "peeko", at: "backRight" },
        { id: "lumi", at: "highRight" },
        { id: "gogo", at: "farLeft" },
        { id: "tiko", at: "offRight" }
      ],
      props: [
        { id: "flower1", asset: "flower", at: "frontLeft" },
        { id: "flower2", asset: "flower", at: "front" },
        { id: "flower3", asset: "flower", at: "frontRight" },
        { id: "tree", asset: "tree", at: "back" }
      ],
      beats: [
        {
          id: "s1-open",
          kind: "greeting",
          camera: "high",
          stage: [
            { do: "music", bed: "meadowBed" },
            { do: "gesture", actor: "lumi", gesture: "float", loop: true },
            { do: "gesture", actor: "momo", gesture: "wave" }
          ],
          lines: [
            { speaker: "narrator", key: "s01e06.s1-open.1" },
            { speaker: "narrator", key: "s01e06.s1-open.2" }
          ],
          holdMs: 7550
        },
        {
          id: "s1-theme",
          kind: "song",
          camera: "wide",
          stage: [
            {
              do: "song",
              song: "wonderTheme",
              performers: ["momo", "lulu", "sheru", "gogo", "lumi", "peeko"],
              cues: [
                { line: 2, stage: [{ do: "gesture", actor: "sheru", gesture: "wag" }] },
                { line: 4, stage: [{ do: "object", target: "flower1", action: "bloom" }] }
              ]
            }
          ],
          lines: [],
          holdMs: 12000
        },
        {
          id: "s1-shell",
          kind: "hook",
          camera: "right",
          stage: [
            { do: "enter", actor: "tiko", at: "farRight", from: "offRight", style: "walk" },
            { do: "face", actor: "momo", toward: "tiko" },
            { do: "sfx", sound: "sniffs" }
          ],
          lines: [
            { speaker: "momo", key: "s01e06.s1-shell.1" },
            { speaker: "narrator", key: "s01e06.s1-shell.2" },
            { speaker: "momo", key: "s01e06.s1-shell.3" }
          ],
          words: [
            { wordId: "look", objectId: "tiko" },
            { wordId: "slow", objectId: "tiko" }
          ],
          holdMs: 7750
        },
        {
          id: "s1-meet",
          kind: "greeting",
          camera: "medium",
          stage: [
            { do: "move", actor: "tiko", to: "right", style: "walk" },
            { do: "face", actor: "tiko", toward: "viewer" },
            { do: "gesture", actor: "tiko", gesture: "wave" },
            { do: "gesture", actor: "momo", gesture: "happy" }
          ],
          lines: [
            { speaker: "momo", key: "s01e06.s1-meet.1" },
            { speaker: "tiko", key: "s01e06.s1-meet.2" },
            { speaker: "momo", key: "s01e06.s1-meet.3" }
          ],
          words: [{ wordId: "slow", objectId: "tiko" }],
          holdMs: 7950
        },
        {
          id: "s1-pause-1",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "wait" },
            { do: "face", actor: "tiko", toward: "viewer" }
          ],
          lines: [{ speaker: "momo", key: "s01e06.s1-pause-1.1" }],
          words: [{ wordId: "look", objectId: "flower1" }],
          holdMs: 4150,
          input: { type: "tap", targets: ["tiko", "momo"] },
          waitMs: 5000,
          pauseMs: 2500,
          pauseCaptionKey: "s01e06.pause.1",
          response: {
            stage: [
              { do: "gesture", actor: "tiko", gesture: "nod" },
              { do: "gesture", actor: "tiko", gesture: "wave" },
              { do: "sfx", sound: "ding" }
            ],
            lines: [
              { speaker: "tiko", key: "s01e06.s1-pause-1.2" },
              { speaker: "narrator", key: "s01e06.s1-pause-1.3" }
            ],
            holdMs: 6350
          }
        },
        {
          id: "s1-flowers",
          kind: "model",
          camera: "wide",
          stage: [
            { do: "object", target: "flower1", action: "bloom" },
            { do: "object", target: "flower2", action: "bloom" },
            { do: "object", target: "flower3", action: "bloom" },
            { do: "gesture", actor: "tiko", gesture: "point" }
          ],
          lines: [
            { speaker: "momo", key: "s01e06.s1-flowers.1" },
            { speaker: "tiko", key: "s01e06.s1-flowers.2" },
            { speaker: "narrator", key: "s01e06.s1-flowers.3" }
          ],
          words: [
            { wordId: "look", objectId: "tiko" },
            { wordId: "one", objectId: "flower1" },
            { wordId: "two", objectId: "flower2" },
            { wordId: "three", objectId: "flower3" }
          ],
          holdMs: 7750
        },
        {
          id: "s1-pause-2",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "tiko", toward: "viewer" },
            { do: "gesture", actor: "tiko", gesture: "wait" },
            { do: "object", target: "flower1", action: "glow" },
            { do: "object", target: "flower2", action: "glow" },
            { do: "object", target: "flower3", action: "glow" }
          ],
          lines: [{ speaker: "momo", key: "s01e06.s1-pause-2.1" }],
          words: [
            { wordId: "one", objectId: "flower1" },
            { wordId: "two", objectId: "flower2" },
            { wordId: "three", objectId: "flower3" },
            { wordId: "slow", objectId: "tiko" }
          ],
          holdMs: 4150,
          input: { type: "tap", targets: ["flower1", "tiko"] },
          waitMs: 5000,
          pauseMs: 3000,
          pauseCaptionKey: "s01e06.pause.2",
          response: {
            stage: [
              { do: "object", target: "flower1", action: "wobble" },
              { do: "object", target: "flower2", action: "wobble" },
              { do: "object", target: "flower3", action: "wobble" },
              { do: "sfx", sound: "sparkle" },
              { do: "gesture", actor: "momo", gesture: "cheer" }
            ],
            lines: [
              { speaker: "momo", key: "s01e06.s1-pause-2.2" },
              { speaker: "momo", key: "s01e06.s1-pause-2.3" }
            ],
            holdMs: 7550
          }
        },
        {
          id: "s1-proud",
          kind: "repeat",
          camera: "medium",
          stage: [
            { do: "gesture", actor: "sheru", gesture: "wag" },
            { do: "sfx", sound: "woofSoft" },
            { do: "gesture", actor: "tiko", gesture: "happy" }
          ],
          lines: [
            { speaker: "narrator", key: "s01e06.s1-proud.1" },
            { speaker: "momo", key: "s01e06.s1-proud.2" }
          ],
          words: [{ wordId: "slow", objectId: "tiko" }],
          holdMs: 7350
        },
        {
          id: "s1-next",
          kind: "outro",
          camera: "wide",
          stage: [
            { do: "gesture", actor: "momo", gesture: "point" },
            { do: "gesture", actor: "tiko", gesture: "nod" }
          ],
          lines: [{ speaker: "momo", key: "s01e06.s1-next.1" }],
          holdMs: 7150
        }
      ]
    },

    // Segment 2 — Learning Cloud: Fast Lulu vs Slow Tiko spotting the hiding triangle
    {
      id: "s2-cloud-shapes",
      template: "wordGame",
      world: "learning-cloud",
      music: "cloudBed",
      transitionIn: "fade",
      then: "s3-garden-rhythm",
      cast: [
        { id: "lumi", at: "high" },
        { id: "momo", at: "left" },
        { id: "lulu", at: "farLeft" },
        { id: "tiko", at: "right" }
      ],
      props: [
        { id: "circlePastry", asset: "pastryCircle", at: "frontLeft" },
        { id: "squarePastry", asset: "pastrySquare", at: "front" },
        { id: "trianglePastry", asset: "pastryTriangle", at: "backRight", hidden: true },
        { id: "cloud", asset: "cloud", at: "backRight" }
      ],
      beats: [
        {
          id: "s2-hi",
          kind: "greeting",
          camera: "wide",
          stage: [
            { do: "music", bed: "cloudBed" },
            { do: "gesture", actor: "lumi", gesture: "glow" },
            { do: "move", actor: "lulu", to: "center", style: "run" },
            { do: "sfx", sound: "whoosh" }
          ],
          lines: [
            { speaker: "lumi", key: "s01e06.s2-hi.1" },
            { speaker: "lulu", key: "s01e06.s2-hi.2" },
            { speaker: "momo", key: "s01e06.s2-hi.3" }
          ],
          words: [{ wordId: "fast", objectId: "lulu" }],
          holdMs: 7550
        },
        {
          id: "s2-pastry",
          kind: "model",
          camera: "medium",
          stage: [
            { do: "object", target: "circlePastry", action: "wobble" },
            { do: "object", target: "squarePastry", action: "wobble" },
            { do: "gesture", actor: "lumi", gesture: "point" }
          ],
          lines: [
            { speaker: "lumi", key: "s01e06.s2-pastry.1" },
            { speaker: "lumi", key: "s01e06.s2-pastry.2" }
          ],
          words: [
            { wordId: "look", objectId: "circlePastry" },
            { wordId: "circle", objectId: "circlePastry" },
            { wordId: "square", objectId: "squarePastry" }
          ],
          holdMs: 7550
        },
        {
          id: "s2-zoom",
          kind: "event",
          camera: "wide",
          stage: [
            { do: "move", actor: "lulu", to: "farLeft", style: "run" },
            { do: "sfx", sound: "whoosh" },
            { do: "gesture", actor: "momo", gesture: "shrug" },
            { do: "face", actor: "tiko", toward: "lulu" }
          ],
          lines: [
            { speaker: "lulu", key: "s01e06.s2-zoom.1" },
            { speaker: "momo", key: "s01e06.s2-zoom.2" },
            { speaker: "tiko", key: "s01e06.s2-zoom.3" }
          ],
          words: [
            { wordId: "fast", objectId: "lulu" },
            { wordId: "one", objectId: "circlePastry" },
            { wordId: "two", objectId: "squarePastry" }
          ],
          holdMs: 7950
        },
        {
          id: "s2-look",
          kind: "hook",
          camera: "right",
          stage: [
            { do: "move", actor: "tiko", to: "center", style: "walk" },
            { do: "show", actor: "trianglePastry" },
            { do: "gesture", actor: "tiko", gesture: "look" }
          ],
          lines: [
            { speaker: "tiko", key: "s01e06.s2-look.1" },
            { speaker: "momo", key: "s01e06.s2-look.2" },
            { speaker: "lumi", key: "s01e06.s2-look.3" }
          ],
          words: [
            { wordId: "slow", objectId: "tiko" },
            { wordId: "look", objectId: "tiko" }
          ],
          holdMs: 7750
        },
        {
          id: "s2-pause-3",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "tiko", toward: "viewer" },
            { do: "gesture", actor: "tiko", gesture: "wait" },
            { do: "object", target: "trianglePastry", action: "glow" }
          ],
          lines: [{ speaker: "momo", key: "s01e06.s2-pause-3.1" }],
          words: [
            { wordId: "triangle", objectId: "trianglePastry" },
            { wordId: "square", objectId: "squarePastry" },
            { wordId: "slow", objectId: "tiko" }
          ],
          holdMs: 4150,
          input: { type: "tap", targets: ["trianglePastry", "tiko"] },
          waitMs: 5000,
          pauseMs: 3000,
          pauseCaptionKey: "s01e06.pause.3",
          response: {
            stage: [
              { do: "move", actor: "trianglePastry", to: "frontRight", style: "slide" },
              { do: "object", target: "trianglePastry", action: "bounce" },
              { do: "sfx", sound: "tada" },
              { do: "gesture", actor: "lulu", gesture: "cheer" }
            ],
            lines: [
              { speaker: "tiko", key: "s01e06.s2-pause-3.2" },
              { speaker: "lulu", key: "s01e06.s2-pause-3.3" }
            ],
            holdMs: 6550
          }
        },
        {
          id: "s2-count-shapes",
          kind: "repeat",
          camera: "medium",
          stage: [
            { do: "object", target: "circlePastry", action: "glow" },
            { do: "object", target: "squarePastry", action: "glow" },
            { do: "object", target: "trianglePastry", action: "glow" },
            { do: "gesture", actor: "tiko", gesture: "point" }
          ],
          lines: [
            { speaker: "momo", key: "s01e06.s2-count-shapes.1" },
            { speaker: "lumi", key: "s01e06.s2-count-shapes.2" }
          ],
          words: [
            { wordId: "one", objectId: "circlePastry" },
            { wordId: "two", objectId: "squarePastry" },
            { wordId: "three", objectId: "trianglePastry" },
            { wordId: "circle", objectId: "circlePastry" },
            { wordId: "square", objectId: "squarePastry" },
            { wordId: "triangle", objectId: "trianglePastry" }
          ],
          holdMs: 7550
        },
        {
          id: "s2-shapes-song",
          kind: "song",
          camera: "wide",
          stage: [
            {
              do: "song",
              song: "shapes",
              performers: ["lumi", "momo", "lulu", "tiko"],
              cues: [
                { line: 0, stage: [{ do: "object", target: "circlePastry", action: "wobble" }] },
                { line: 1, stage: [{ do: "object", target: "squarePastry", action: "wobble" }] },
                { line: 2, stage: [{ do: "object", target: "trianglePastry", action: "wobble" }] }
              ]
            }
          ],
          lines: [],
          words: [
            { wordId: "circle", objectId: "circlePastry" },
            { wordId: "square", objectId: "squarePastry" },
            { wordId: "triangle", objectId: "trianglePastry" }
          ],
          holdMs: 12000
        },
        {
          id: "s2-lulu-try",
          kind: "event",
          camera: "medium",
          stage: [
            { do: "gesture", actor: "lulu", gesture: "happy" },
            { do: "gesture", actor: "tiko", gesture: "nod" }
          ],
          lines: [
            { speaker: "lulu", key: "s01e06.s2-lulu-try.1" },
            { speaker: "momo", key: "s01e06.s2-lulu-try.2" }
          ],
          words: [
            { wordId: "slow", objectId: "tiko" },
            { wordId: "three", objectId: "trianglePastry" }
          ],
          holdMs: 7350
        },
        {
          id: "s2-pause-4",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "lumi", toward: "viewer" },
            { do: "gesture", actor: "lumi", gesture: "wait" },
            { do: "object", target: "circlePastry", action: "glow" }
          ],
          lines: [{ speaker: "lumi", key: "s01e06.s2-pause-4.1" }],
          words: [{ wordId: "circle", objectId: "circlePastry" }],
          holdMs: 4150,
          input: { type: "tap", targets: ["circlePastry", "tiko"] },
          waitMs: 5000,
          pauseMs: 2500,
          pauseCaptionKey: "s01e06.pause.4",
          response: {
            stage: [
              { do: "object", target: "circlePastry", action: "spin" },
              { do: "gesture", actor: "tiko", gesture: "happy" },
              { do: "sfx", sound: "sparkle" }
            ],
            lines: [
              { speaker: "momo", key: "s01e06.s2-pause-4.2" },
              { speaker: "momo", key: "s01e06.s2-pause-4.3" }
            ],
            holdMs: 6350
          }
        },
        {
          id: "s2-next",
          kind: "outro",
          camera: "wide",
          stage: [
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "gesture", actor: "tiko", gesture: "wave" }
          ],
          lines: [{ speaker: "lulu", key: "s01e06.s2-next.1" }],
          holdMs: 7150
        }
      ]
    },

    // Segment 3 — Music Garden: Fast Lulu vs Tiko's slow steady 1-2-3 rhythm
    {
      id: "s3-garden-rhythm",
      template: "songBreak",
      world: "music-garden",
      music: "gardenBed",
      transitionIn: "cut",
      then: "s4-home-snack",
      cast: [
        { id: "lulu", at: "left" },
        { id: "momo", at: "center" },
        { id: "tiko", at: "right" },
        { id: "sheru", at: "backLeft" }
      ],
      props: [
        { id: "drum", asset: "drum", at: "farRight" },
        { id: "stone1", asset: "stompStone", at: "frontLeft" },
        { id: "stone2", asset: "stompStone", at: "front" },
        { id: "stone3", asset: "stompStone", at: "frontRight" }
      ],
      beats: [
        {
          id: "s3-arrive",
          kind: "greeting",
          camera: "wide",
          stage: [
            { do: "music", bed: "gardenBed" },
            { do: "object", target: "drum", action: "shake" },
            { do: "sfx", sound: "drum" }
          ],
          lines: [
            { speaker: "lulu", key: "s01e06.s3-arrive.1" },
            { speaker: "momo", key: "s01e06.s3-arrive.2" },
            { speaker: "momo", key: "s01e06.s3-arrive.3" }
          ],
          words: [
            { wordId: "look", objectId: "stone1" },
            { wordId: "one", objectId: "stone1" },
            { wordId: "two", objectId: "stone2" },
            { wordId: "three", objectId: "stone3" }
          ],
          holdMs: 7550
        },
        {
          id: "s3-fast-lulu",
          kind: "event",
          camera: "medium",
          stage: [
            { do: "move", actor: "lulu", to: "farLeft", style: "hop" },
            { do: "sfx", sound: "boing" },
            { do: "gesture", actor: "lulu", gesture: "happy" }
          ],
          lines: [
            { speaker: "lulu", key: "s01e06.s3-fast-lulu.1" },
            { speaker: "lulu", key: "s01e06.s3-fast-lulu.2" },
            { speaker: "momo", key: "s01e06.s3-fast-lulu.3" }
          ],
          words: [
            { wordId: "fast", objectId: "lulu" },
            { wordId: "one", objectId: "stone1" },
            { wordId: "two", objectId: "stone2" },
            { wordId: "three", objectId: "stone3" }
          ],
          holdMs: 7750
        },
        {
          id: "s3-stones",
          kind: "model",
          camera: "right",
          stage: [
            { do: "move", actor: "tiko", to: "frontLeft", style: "walk" },
            { do: "object", target: "stone1", action: "glow" },
            { do: "gesture", actor: "tiko", gesture: "nod" }
          ],
          lines: [
            { speaker: "momo", key: "s01e06.s3-stones.1" },
            { speaker: "tiko", key: "s01e06.s3-stones.2" }
          ],
          words: [{ wordId: "slow", objectId: "tiko" }],
          holdMs: 7550
        },
        {
          id: "s3-pause-5",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "tiko", toward: "viewer" },
            { do: "gesture", actor: "tiko", gesture: "wait" },
            { do: "object", target: "stone2", action: "glow" },
            { do: "object", target: "stone3", action: "glow" }
          ],
          lines: [{ speaker: "momo", key: "s01e06.s3-pause-5.1" }],
          words: [
            { wordId: "slow", objectId: "tiko" },
            { wordId: "one", objectId: "stone1" },
            { wordId: "two", objectId: "stone2" },
            { wordId: "three", objectId: "stone3" }
          ],
          holdMs: 4150,
          input: { type: "tap", targets: ["stone3", "tiko"] },
          waitMs: 5000,
          pauseMs: 3000,
          pauseCaptionKey: "s01e06.pause.5",
          response: {
            stage: [
              { do: "move", actor: "tiko", to: "frontRight", style: "walk" },
              { do: "sfx", sound: "stomp" },
              { do: "gesture", actor: "lulu", gesture: "cheer" }
            ],
            lines: [
              { speaker: "tiko", key: "s01e06.s3-pause-5.2" },
              { speaker: "lulu", key: "s01e06.s3-pause-5.3" }
            ],
            holdMs: 6550
          }
        },
        {
          id: "s3-count-song",
          kind: "song",
          camera: "wide",
          stage: [
            {
              do: "song",
              song: "countToThree",
              performers: ["tiko", "momo", "lulu", "sheru"],
              cues: [
                { line: 0, stage: [{ do: "object", target: "stone1", action: "glow" }] },
                { line: 1, stage: [{ do: "object", target: "stone2", action: "glow" }] },
                { line: 2, stage: [{ do: "object", target: "stone3", action: "glow" }] }
              ]
            }
          ],
          lines: [],
          words: [
            { wordId: "one", objectId: "stone1" },
            { wordId: "two", objectId: "stone2" },
            { wordId: "three", objectId: "stone3" }
          ],
          holdMs: 12000
        },
        {
          id: "s3-drum-turn",
          kind: "model",
          camera: "medium",
          stage: [
            { do: "face", actor: "tiko", toward: "drum" },
            { do: "object", target: "drum", action: "glow" }
          ],
          lines: [
            { speaker: "momo", key: "s01e06.s3-drum-turn.1" },
            { speaker: "narrator", key: "s01e06.s3-drum-turn.2" }
          ],
          words: [
            { wordId: "three", objectId: "drum" },
            { wordId: "slow", objectId: "tiko" }
          ],
          holdMs: 7350
        },
        {
          id: "s3-pause-6",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "tiko", toward: "viewer" },
            { do: "gesture", actor: "tiko", gesture: "wait" },
            { do: "object", target: "drum", action: "glow" }
          ],
          lines: [{ speaker: "momo", key: "s01e06.s3-pause-6.1" }],
          words: [
            { wordId: "one", objectId: "stone1" },
            { wordId: "two", objectId: "stone2" },
            { wordId: "three", objectId: "stone3" },
            { wordId: "slow", objectId: "tiko" }
          ],
          holdMs: 4150,
          input: { type: "tap", targets: ["drum", "tiko"] },
          waitMs: 5000,
          pauseMs: 2500,
          pauseCaptionKey: "s01e06.pause.6",
          response: {
            stage: [
              { do: "object", target: "drum", action: "shake" },
              { do: "sfx", sound: "drum" },
              { do: "gesture", actor: "lulu", gesture: "sway" },
              { do: "gesture", actor: "tiko", gesture: "sway" }
            ],
            lines: [
              { speaker: "tiko", key: "s01e06.s3-pause-6.2" },
              { speaker: "lulu", key: "s01e06.s3-pause-6.3" }
            ],
            holdMs: 6550
          }
        },
        {
          id: "s3-gostop-song",
          kind: "song",
          camera: "wide",
          stage: [
            {
              do: "song",
              song: "goStop",
              performers: ["lulu", "momo", "tiko", "sheru"],
              cues: [
                { line: 0, stage: [{ do: "sfx", sound: "clap" }] },
                { line: 3, stage: [{ do: "gesture", actor: "tiko", gesture: "freeze" }] }
              ]
            }
          ],
          lines: [],
          holdMs: 11500
        },
        {
          id: "s3-dance-after",
          kind: "repeat",
          stage: [
            { do: "gesture", actor: "momo", gesture: "happy" },
            { do: "gesture", actor: "sheru", gesture: "wag" }
          ],
          lines: [{ speaker: "momo", key: "s01e06.s3-dance-after.1" }],
          words: [
            { wordId: "fast", objectId: "lulu" },
            { wordId: "slow", objectId: "tiko" }
          ],
          holdMs: 7150
        },
        {
          id: "s3-next",
          kind: "outro",
          camera: "wide",
          stage: [{ do: "gesture", actor: "momo", gesture: "wave" }],
          lines: [{ speaker: "momo", key: "s01e06.s3-next.1" }],
          holdMs: 7150
        }
      ]
    },

    // Segment 4 — Home Nook: Welcome snack for Tiko & calm goodbye
    {
      id: "s4-home-snack",
      template: "goodbye",
      world: "home-nook",
      music: "homeBed",
      transitionIn: "fade",
      cast: [
        { id: "momo", at: "center" },
        { id: "tiko", at: "right" },
        { id: "lulu", at: "left" },
        { id: "peeko", at: "farRight" },
        { id: "lumi", at: "highLeft" },
        { id: "sheru", at: "frontLeft" }
      ],
      props: [
        { id: "table", asset: "table", at: "back" },
        { id: "plate", asset: "plate", at: "front" },
        { id: "cookie1", asset: "cookie", at: "frontLeft" },
        { id: "cookie2", asset: "cookie", at: "front" },
        { id: "cookie3", asset: "cookie", at: "frontRight" },
        { id: "balloon1", asset: "balloon", at: "highRight", tint: "#2dd4bf" }
      ],
      beats: [
        {
          id: "s4-welcome",
          kind: "greeting",
          camera: "wide",
          stage: [
            { do: "music", bed: "homeBed" },
            { do: "object", target: "balloon1", action: "rise" },
            { do: "gesture", actor: "peeko", gesture: "wave" },
            { do: "sfx", sound: "tada" }
          ],
          lines: [
            { speaker: "momo", key: "s01e06.s4-welcome.1" },
            { speaker: "peeko", key: "s01e06.s4-welcome.2" }
          ],
          words: [{ wordId: "look", objectId: "table" }],
          holdMs: 7550
        },
        {
          id: "s4-hello-song",
          kind: "song",
          camera: "wide",
          stage: [
            {
              do: "song",
              song: "hello",
              performers: ["momo", "tiko", "lulu", "peeko", "lumi", "sheru"]
            }
          ],
          lines: [],
          holdMs: 10500
        },
        {
          id: "s4-plate",
          kind: "model",
          camera: "medium",
          stage: [
            { do: "object", target: "plate", action: "glow" },
            { do: "gesture", actor: "momo", gesture: "point" }
          ],
          lines: [
            { speaker: "momo", key: "s01e06.s4-plate.1" },
            { speaker: "lumi", key: "s01e06.s4-plate.2" }
          ],
          words: [
            { wordId: "circle", objectId: "plate" },
            { wordId: "square", objectId: "table" }
          ],
          holdMs: 7550
        },
        {
          id: "s4-cookies",
          kind: "model",
          camera: "close",
          stage: [
            { do: "face", actor: "tiko", toward: "plate" },
            { do: "gesture", actor: "tiko", gesture: "point" }
          ],
          lines: [
            { speaker: "momo", key: "s01e06.s4-cookies.1" },
            { speaker: "tiko", key: "s01e06.s4-cookies.2" }
          ],
          words: [
            { wordId: "look", objectId: "tiko" },
            { wordId: "one", objectId: "cookie1" },
            { wordId: "two", objectId: "cookie2" },
            { wordId: "three", objectId: "cookie3" }
          ],
          holdMs: 7750
        },
        {
          id: "s4-pause-7",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "tiko", toward: "viewer" },
            { do: "gesture", actor: "tiko", gesture: "wait" },
            { do: "object", target: "cookie1", action: "glow" },
            { do: "object", target: "cookie2", action: "glow" },
            { do: "object", target: "cookie3", action: "glow" }
          ],
          lines: [{ speaker: "momo", key: "s01e06.s4-pause-7.1" }],
          words: [
            { wordId: "one", objectId: "cookie1" },
            { wordId: "two", objectId: "cookie2" },
            { wordId: "three", objectId: "cookie3" }
          ],
          holdMs: 4150,
          input: { type: "tap", targets: ["cookie1", "tiko"] },
          waitMs: 5000,
          pauseMs: 2500,
          pauseCaptionKey: "s01e06.pause.7",
          response: {
            stage: [
              { do: "object", target: "cookie1", action: "wobble" },
              { do: "object", target: "cookie2", action: "wobble" },
              { do: "object", target: "cookie3", action: "wobble" },
              { do: "sfx", sound: "munch" },
              { do: "gesture", actor: "tiko", gesture: "happy" }
            ],
            lines: [
              { speaker: "momo", key: "s01e06.s4-pause-7.2" },
              { speaker: "momo", key: "s01e06.s4-pause-7.3" }
            ],
            holdMs: 6550
          }
        },
        {
          id: "s4-share",
          kind: "repeat",
          camera: "medium",
          stage: [
            { do: "gesture", actor: "lulu", gesture: "happy" },
            { do: "gesture", actor: "tiko", gesture: "nod" },
            { do: "gesture", actor: "sheru", gesture: "wag" }
          ],
          lines: [
            { speaker: "lulu", key: "s01e06.s4-share.1" },
            { speaker: "momo", key: "s01e06.s4-share.2" }
          ],
          words: [
            { wordId: "fast", objectId: "lulu" },
            { wordId: "slow", objectId: "tiko" },
            { wordId: "one", objectId: "cookie1" },
            { wordId: "two", objectId: "cookie2" },
            { wordId: "three", objectId: "cookie3" }
          ],
          holdMs: 7550
        },
        {
          id: "s4-rest",
          kind: "event",
          camera: "wide",
          stage: [
            { do: "music", bed: null },
            { do: "gesture", actor: "momo", gesture: "sway" },
            { do: "gesture", actor: "tiko", gesture: "sway" }
          ],
          lines: [
            { speaker: "lumi", key: "s01e06.s4-rest.1" },
            { speaker: "narrator", key: "s01e06.s4-rest.2" }
          ],
          holdMs: 7350
        },
        {
          id: "s4-alldone",
          kind: "song",
          camera: "wide",
          stage: [
            {
              do: "song",
              song: "allDone",
              performers: ["momo", "tiko", "lulu", "peeko", "lumi", "sheru"]
            }
          ],
          lines: [],
          holdMs: 10500
        },
        {
          id: "s4-bye",
          kind: "outro",
          camera: "medium",
          stage: [
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "face", actor: "tiko", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "wave" },
            { do: "gesture", actor: "tiko", gesture: "wave" },
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "gesture", actor: "peeko", gesture: "wave" },
            { do: "sfx", sound: "woofSoft" }
          ],
          lines: [
            { speaker: "momo", key: "s01e06.s4-bye.1" },
            { speaker: "tiko", key: "s01e06.s4-bye.2" },
            { speaker: "lumi", key: "s01e06.s4-bye.3" }
          ],
          words: [
            { wordId: "slow", objectId: "tiko" },
            { wordId: "one", objectId: "cookie1" },
            { wordId: "two", objectId: "cookie2" },
            { wordId: "three", objectId: "cookie3" }
          ],
          holdMs: 7950
        }
      ]
    }
  ]
} satisfies ShowSpec;

export const show: ShowSpec = s01e06MeetTikoTurtle;
