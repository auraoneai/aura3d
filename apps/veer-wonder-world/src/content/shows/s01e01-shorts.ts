// Three 9:16 vertical Shorts cut from S01E01 — "Welcome to Wonder World!" (PRD 09 E.9).
// Each Short runs ~36-42 seconds, includes a Dora-style PAUSE beat (`pauseMs: 2500`), and reuses
// `s01e01.*` voice keys so zero duplicate TTS synthesis budget is spent.

import type { ShowSpec } from "../../types.js";

export const s01e01ShortSheru = {
  kind: "show",
  id: "s01e01-short-sheru",
  code: "s01e01s1",
  version: 1,
  band: "toddler",
  aspect: "9:16",
  parentShowId: "s01e01-welcome-to-wonder-world",
  calendarWeek: 1,
  titleKey: "s01e01s1.title",
  host: "momo",
  targetWords: ["ball", "look"],
  supportWords: ["one", "red", "duck", "sponge", "where"],
  pauseMs: 2500,
  estimatedDurationSec: 38,
  offlinePlayKey: "s01e01s1.offlinePlay",
  caregiverBridgeKey: "s01e01s1.caregiverBridge",
  chapters: [{ segmentId: "sh1-sheru", titleKey: "s01e01s1.ch.main", atSec: 0 }],
  youtube: {
    title: "Silly Sheru! 🐶 Red Ball Fetch | Wonder World #Shorts",
    description: [
      "Momo asks Sheru for a red ball, and silly Sheru brings a duck and a sponge first! Point to the ball during the pause.",
      "",
      "For ages 1-4, best watched together. Watch the full Welcome Party episode on Wonder World!"
    ].join("\n"),
    thumbnailBeatId: "sh1-duck",
    thumbnailOffsetMs: 500,
    thumbnailTitle: "Silly Sheru!",
    playlist: "Wonder World Shorts"
  },
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:antigravity (owner instruction 2026-11-13)",
    date: "2026-11-13"
  },
  segments: [
    {
      id: "sh1-sheru",
      template: "shortMoment",
      world: "meadow",
      music: "meadowBed",
      transitionIn: "none",
      cast: [
        { id: "momo", at: "center" },
        { id: "sheru", at: "left" }
      ],
      props: [
        { id: "rubberDuck", asset: "duck", at: "offRight", hidden: true },
        { id: "sponge", asset: "sponge", at: "offRight", hidden: true },
        { id: "ball", asset: "ball", at: "offRight", hidden: true, tint: "#e84a3c" }
      ],
      beats: [
        {
          id: "sh1-ask",
          kind: "greeting",
          camera: "medium",
          stage: [
            { do: "music", bed: "meadowBed" },
            { do: "face", actor: "momo", toward: "sheru" },
            { do: "sfx", sound: "woofDouble" },
            { do: "gesture", actor: "sheru", gesture: "wag", loop: true }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s2-ask-sheru.1" }],
          holdMs: 1800
        },
        {
          id: "sh1-duck",
          kind: "event",
          stage: [
            { do: "exit", actor: "sheru", to: "offRight", style: "run" },
            { do: "enter", actor: "sheru", at: "left", from: "offRight", style: "run" },
            { do: "show", actor: "rubberDuck" },
            { do: "carry", actor: "sheru", item: "rubberDuck" },
            { do: "sfx", sound: "quack" },
            { do: "sfx", sound: "yip" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s2-fetch-duck.1" },
            { speaker: "momo", key: "s01e01.s2-fetch-duck.2" }
          ],
          words: [{ wordId: "duck", objectId: "rubberDuck" }],
          holdMs: 1800
        },
        {
          id: "sh1-sponge",
          kind: "event",
          stage: [
            { do: "carry", actor: "sheru", item: null },
            { do: "hide", actor: "rubberDuck" },
            { do: "exit", actor: "sheru", to: "offRight", style: "run" },
            { do: "enter", actor: "sheru", at: "left", from: "offRight", style: "run" },
            { do: "show", actor: "sponge" },
            { do: "carry", actor: "sheru", item: "sponge" },
            { do: "sfx", sound: "arf" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s2-fetch-sponge.1" },
            { speaker: "momo", key: "s01e01.s2-fetch-sponge.2" }
          ],
          words: [
            { wordId: "sponge", objectId: "sponge" },
            { wordId: "look", objectId: "momo" }
          ],
          holdMs: 1800
        },
        {
          id: "sh1-ball",
          kind: "model",
          stage: [
            { do: "carry", actor: "sheru", item: null },
            { do: "hide", actor: "sponge" },
            { do: "exit", actor: "sheru", to: "offRight", style: "run" },
            { do: "enter", actor: "sheru", at: "left", from: "offRight", style: "run" },
            { do: "show", actor: "ball" },
            { do: "move", actor: "ball", to: "front", style: "roll" },
            { do: "sfx", sound: "woof" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s2-ball-arrives.1" }],
          words: [{ wordId: "look", objectId: "ball" }],
          holdMs: 1600
        },
        {
          id: "sh1-pause",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "wait" },
            { do: "object", target: "ball", action: "glow" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s2-pause-1.1" }],
          words: [
            { wordId: "where", objectId: "ball" },
            { wordId: "ball", objectId: "ball" }
          ],
          holdMs: 1600,
          input: { type: "tap", targets: ["ball", "sheru"] },
          waitMs: 5000,
          pauseMs: 2500,
          pauseCaptionKey: "s01e01.pause.1",
          response: {
            stage: [
              { do: "object", target: "ball", action: "bounce" },
              { do: "sfx", sound: "boing" },
              { do: "gesture", actor: "momo", gesture: "cheer" },
              { do: "gesture", actor: "sheru", gesture: "wag" }
            ],
            lines: [
              { speaker: "momo", key: "s01e01.s2-pause-1.2" },
              { speaker: "momo", key: "s01e01.s2-pause-1.3" }
            ],
            holdMs: 1800
          }
        },
        {
          id: "sh1-count",
          kind: "outro",
          stage: [
            { do: "object", target: "ball", action: "bounce" },
            { do: "gesture", actor: "momo", gesture: "point" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s2-count-1.1" }],
          words: [
            { wordId: "one", objectId: "ball" },
            { wordId: "red", objectId: "ball" },
            { wordId: "ball", objectId: "ball" }
          ],
          holdMs: 1800
        }
      ]
    }
  ]
} satisfies ShowSpec;

export const s01e01ShortLulu = {
  kind: "show",
  id: "s01e01-short-lulu",
  code: "s01e01s2",
  version: 1,
  band: "toddler",
  aspect: "9:16",
  parentShowId: "s01e01-welcome-to-wonder-world",
  calendarWeek: 1,
  titleKey: "s01e01s2.title",
  host: "lulu",
  targetWords: ["stomp", "stop"],
  supportWords: ["go", "clap", "boom", "dance"],
  pauseMs: 2500,
  estimatedDurationSec: 42,
  offlinePlayKey: "s01e01s2.offlinePlay",
  caregiverBridgeKey: "s01e01s2.caregiverBridge",
  chapters: [{ segmentId: "sh2-lulu", titleKey: "s01e01s2.ch.main", atSec: 0 }],
  youtube: {
    title: "Lulu is Always Late! 🦕 Stomp & Freeze Song | Wonder World #Shorts",
    description: [
      "Stomp along with Lulu and play the Go and Stop freeze dance! Can you freeze before Lulu does?",
      "",
      "For ages 1-4, best watched together. Calm movement play from Wonder World."
    ].join("\n"),
    thumbnailBeatId: "sh2-boom",
    thumbnailOffsetMs: 400,
    thumbnailTitle: "Stomp & Freeze!",
    playlist: "Wonder World Shorts"
  },
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:antigravity (owner instruction 2026-11-13)",
    date: "2026-11-13"
  },
  segments: [
    {
      id: "sh2-lulu",
      template: "shortMoment",
      world: "music-garden",
      music: "gardenBed",
      transitionIn: "none",
      cast: [
        { id: "lulu", at: "center" },
        { id: "momo", at: "left" },
        { id: "sheru", at: "frontLeft" }
      ],
      props: [
        { id: "drum", asset: "drum", at: "right" },
        { id: "stone", asset: "stompStone", at: "front" }
      ],
      beats: [
        {
          id: "sh2-boom",
          kind: "greeting",
          camera: "medium",
          stage: [
            { do: "music", bed: "gardenBed" },
            { do: "object", target: "drum", action: "shake" },
            { do: "sfx", sound: "drum" },
            { do: "gesture", actor: "lulu", gesture: "stomp" },
            { do: "sfx", sound: "stomp" }
          ],
          lines: [
            { speaker: "lulu", key: "s01e01.s4-boom.1" },
            { speaker: "lulu", key: "s01e01.s4-boom.2" }
          ],
          words: [
            { wordId: "boom", objectId: "drum" },
            { wordId: "stomp", objectId: "lulu" }
          ],
          holdMs: 1800
        },
        {
          id: "sh2-stomp-pause",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "gesture", actor: "lulu", gesture: "wait" },
            { do: "object", target: "drum", action: "glow" }
          ],
          lines: [{ speaker: "lulu", key: "s01e01.s4-pause-3.1" }],
          words: [{ wordId: "stomp", objectId: "lulu" }],
          holdMs: 1600,
          input: { type: "tap", targets: ["lulu", "drum"] },
          waitMs: 5000,
          pauseMs: 2500,
          pauseCaptionKey: "s01e01.pause.3",
          response: {
            stage: [
              { do: "gesture", actor: "lulu", gesture: "stomp" },
              { do: "sfx", sound: "stomp" },
              { do: "object", target: "stone", action: "glow" },
              { do: "gesture", actor: "momo", gesture: "cheer" }
            ],
            lines: [{ speaker: "lulu", key: "s01e01.s4-pause-3.2" }],
            holdMs: 1800
          }
        },
        {
          id: "sh2-song",
          kind: "song",
          camera: "wide",
          stage: [
            { do: "gesture", actor: "lulu", gesture: "dance", loop: true },
            {
              do: "song",
              song: "goStop",
              performers: ["momo", "sheru"],
              cues: [
                { line: 0, stage: [{ do: "sfx", sound: "clap" }] },
                { line: 1, stage: [{ do: "sfx", sound: "stomp" }] },
                { line: 2, stage: [{ do: "object", target: "drum", action: "shake" }] },
                {
                  line: 3,
                  offsetMs: 600,
                  stage: [{ do: "gesture", actor: "lulu", gesture: "freeze" }]
                }
              ]
            }
          ],
          lines: [],
          words: [
            { wordId: "go", objectId: "momo" },
            { wordId: "stop", objectId: "lulu" }
          ],
          holdMs: 11000
        },
        {
          id: "sh2-late-outro",
          kind: "outro",
          stage: [
            { do: "gesture", actor: "lulu", gesture: "happy" },
            { do: "gesture", actor: "sheru", gesture: "wag" },
            { do: "sfx", sound: "giggle" }
          ],
          lines: [
            { speaker: "lulu", key: "s01e01.s4-late-freeze.1" },
            { speaker: "momo", key: "s01e01.s4-late-freeze.2" }
          ],
          words: [{ wordId: "stop", objectId: "lulu" }],
          holdMs: 1800
        }
      ]
    }
  ]
} satisfies ShowSpec;

export const s01e01ShortPeeko = {
  kind: "show",
  id: "s01e01-short-peeko",
  code: "s01e01s3",
  version: 1,
  band: "toddler",
  aspect: "9:16",
  parentShowId: "s01e01-welcome-to-wonder-world",
  calendarWeek: 1,
  titleKey: "s01e01s3.title",
  host: "peeko",
  targetWords: ["where", "peekaboo"],
  supportWords: ["box", "hat", "under"],
  pauseMs: 2500,
  estimatedDurationSec: 36,
  offlinePlayKey: "s01e01s3.offlinePlay",
  caregiverBridgeKey: "s01e01s3.caregiverBridge",
  chapters: [{ segmentId: "sh3-peeko", titleKey: "s01e01s3.ch.main", atSec: 0 }],
  youtube: {
    title: "Where's Peeko? 🐣 Tiny Box Peekaboo | Wonder World #Shorts",
    description: [
      "Peeko thinks nobody can see behind a tiny toy box, and then Momo hides under a hat! Play peekaboo together.",
      "",
      "For ages 1-4, best watched together. Gentle peekaboo play from Wonder World."
    ].join("\n"),
    thumbnailBeatId: "sh3-hiding",
    thumbnailOffsetMs: 400,
    thumbnailTitle: "Peekaboo!",
    playlist: "Wonder World Shorts"
  },
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:antigravity (owner instruction 2026-11-13)",
    date: "2026-11-13"
  },
  segments: [
    {
      id: "sh3-peeko",
      template: "shortMoment",
      world: "peekaboo-barn",
      music: "barnBed",
      transitionIn: "none",
      cast: [
        { id: "momo", at: "left" },
        { id: "peeko", at: "right" }
      ],
      props: [
        { id: "toyBox", asset: "toyBox", at: "right", size: 0.35 },
        { id: "hat", asset: "hat", at: "offTop", hidden: true }
      ],
      beats: [
        {
          id: "sh3-arrive",
          kind: "greeting",
          camera: "wide",
          stage: [
            { do: "music", bed: "barnBed" },
            { do: "gesture", actor: "peeko", gesture: "hide" },
            { do: "sfx", sound: "rustle" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s5-arrive.1" }],
          words: [{ wordId: "where", objectId: "peeko" }],
          holdMs: 1600
        },
        {
          id: "sh3-hiding",
          kind: "hook",
          stage: [
            { do: "gesture", actor: "peeko", gesture: "peek" },
            { do: "sfx", sound: "giggle" }
          ],
          lines: [{ speaker: "peeko", key: "s01e01.s5-hiding.1" }],
          holdMs: 1800
        },
        {
          id: "sh3-pop",
          kind: "event",
          camera: "close",
          stage: [
            { do: "gesture", actor: "peeko", gesture: "hop" },
            { do: "sfx", sound: "boing" }
          ],
          lines: [
            { speaker: "peeko", key: "s01e01.s5-pause-5.3" },
            { speaker: "momo", key: "s01e01.s5-game-ask.1" }
          ],
          words: [
            { wordId: "peekaboo", objectId: "peeko" },
            { wordId: "box", objectId: "toyBox" }
          ],
          holdMs: 1800
        },
        {
          id: "sh3-hat",
          kind: "event",
          stage: [
            { do: "show", actor: "hat" },
            { do: "enter", actor: "hat", at: "left", from: "offTop", style: "float" },
            { do: "object", target: "hat", action: "fall" },
            { do: "gesture", actor: "momo", gesture: "hide" },
            { do: "sfx", sound: "boing" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s5-hat-drop.1" }],
          words: [{ wordId: "where", objectId: "momo" }],
          holdMs: 1600
        },
        {
          id: "sh3-hat-pause",
          kind: "invite",
          stage: [
            { do: "face", actor: "peeko", toward: "viewer" },
            { do: "gesture", actor: "peeko", gesture: "wait" },
            { do: "object", target: "hat", action: "glow" }
          ],
          lines: [{ speaker: "peeko", key: "s01e01.s5-pause-6.1" }],
          words: [
            { wordId: "under", objectId: "hat" },
            { wordId: "hat", objectId: "hat" },
            { wordId: "peekaboo", objectId: "momo" }
          ],
          holdMs: 1600,
          input: { type: "tap", targets: ["hat", "momo"] },
          waitMs: 5000,
          pauseMs: 2500,
          pauseCaptionKey: "s01e01.pause.6",
          response: {
            stage: [
              { do: "object", target: "hat", action: "rise" },
              { do: "gesture", actor: "momo", gesture: "peek" },
              { do: "sfx", sound: "giggle" }
            ],
            lines: [
              { speaker: "peeko", key: "s01e01.s5-pause-6.2" },
              { speaker: "momo", key: "s01e01.s5-pause-6.3" }
            ],
            holdMs: 1800
          }
        },
        {
          id: "sh3-outro",
          kind: "outro",
          stage: [
            { do: "gesture", actor: "peeko", gesture: "wave" },
            { do: "gesture", actor: "momo", gesture: "wave" }
          ],
          lines: [{ speaker: "peeko", key: "s01e01.s8-byes.3" }],
          words: [{ wordId: "peekaboo", objectId: "peeko" }],
          holdMs: 1800
        }
      ]
    }
  ]
} satisfies ShowSpec;

export const S01E01_SHORTS: readonly ShowSpec[] = [
  s01e01ShortSheru,
  s01e01ShortLulu,
  s01e01ShortPeeko
];

export const shows: readonly ShowSpec[] = S01E01_SHORTS;
