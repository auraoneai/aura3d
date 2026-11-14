// S01E01 — "Welcome to Wonder World!" (PRD 09 Part E, Band 2 toddler 16:9 launch episode).
// Momo throws a welcome party for a new friend (the viewer) and gathers five party things
// across the island: 1 ball (Sheru), 2 train ride (GoGo), 3 song (Lulu), 4 peekaboo game (Peeko),
// and 5 stars + learning preview (Lumi), celebrating at Home Nook before a calm Starlight Cloud close.

import type { ShowSpec } from "../../types.js";

export const s01e01WelcomeToWonderWorld = {
  kind: "show",
  id: "s01e01-welcome-to-wonder-world",
  code: "s01e01",
  version: 1,
  band: "toddler",
  aspect: "16:9",
  calendarWeek: 1,
  titleKey: "s01e01.title",
  host: "momo",
  targetWords: ["hello", "ball", "go"],
  supportWords: [
    "stop",
    "one",
    "two",
    "three",
    "where",
    "bye",
    "uh-oh",
    "look",
    "more",
    "boom",
    "peekaboo",
    "star",
    "cake",
    "sleep",
    "all-done",
    "wave",
    "sponge",
    "duck",
    "hat",
    "box",
    "apple",
    "block",
    "b",
    "cow",
    "moo",
    "drum",
    "moon",
    "red",
    "behind",
    "under",
    "stomp",
    "clap",
    "dance",
    "train",
    "butterfly",
    "balloon",
    "thank-you",
    "dream"
  ],
  pauseMs: 2500,
  estimatedDurationSec: 600,
  endCardSec: 6,
  offlinePlayKey: "s01e01.offlinePlay",
  caregiverBridgeKey: "s01e01.caregiverBridge",
  chapters: [
    { segmentId: "s1-cold-open", titleKey: "s01e01.ch.theme", atSec: 0 },
    { segmentId: "s2-sheru-ball", titleKey: "s01e01.ch.sheru", atSec: 50 },
    { segmentId: "s3-gogo-train", titleKey: "s01e01.ch.gogo", atSec: 125 },
    { segmentId: "s4-lulu-beat", titleKey: "s01e01.ch.lulu", atSec: 205 },
    { segmentId: "s5-peeko-barn", titleKey: "s01e01.ch.peeko", atSec: 295 },
    { segmentId: "s6-lumi-preview", titleKey: "s01e01.ch.lumi", atSec: 375 },
    { segmentId: "s7-welcome-party", titleKey: "s01e01.ch.party", atSec: 470 },
    { segmentId: "s8a-byes", titleKey: "s01e01.ch.goodnight", atSec: 555 }
  ],
  youtube: {
    title: "Welcome to Wonder World! 🎈 Count to 5 Party for Kids",
    description: [
      "Momo is throwing a welcome party for a new friend: you! Count to five with Sheru, GoGo, Lulu, Peeko and Lumi, sing along, play peekaboo, and get a peek at everything we will learn together in Wonder World.",
      "",
      "For ages 1-4, best watched together. At each pause, wait for your little one, then answer together. Any answer is a good answer.",
      "",
      "0:00 Wonder World song",
      "0:50 Sheru finds a ball (1)",
      "2:05 GoGo's train ride (2)",
      "3:25 Lulu's stomp and freeze song (3)",
      "4:55 Peekaboo with Peeko (4)",
      "6:15 Lumi's look-what-I-found (5)",
      "7:50 The welcome party",
      "9:15 Bye-bye and goodnight",
      "",
      "Play this story together in the Wonder World app: <app URL>",
      "Calm pacing, no flashing, no startling sounds. Made with care by a parent for their little one."
    ].join("\n"),
    thumbnailBeatId: "s7-welcome",
    thumbnailOffsetMs: 600,
    thumbnailTitle: "Hello, friend!",
    playlist: "Start here: Wonder World"
  },
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:antigravity (owner instruction 2026-11-13)",
    date: "2026-11-13"
  },
  segments: [
    // Segment 1 — Cold open & Wonder World theme
    {
      id: "s1-cold-open",
      template: "coldOpen",
      world: "meadow",
      music: "meadowBed",
      transitionIn: "none",
      then: "s2-sheru-ball",
      cast: [
        { id: "momo", at: "center" },
        { id: "lulu", at: "left" },
        { id: "peeko", at: "right" },
        { id: "lumi", at: "highRight" },
        { id: "gogo", at: "offLeft" },
        { id: "sheru", at: "frontLeft" }
      ],
      props: [
        { id: "flower", asset: "flower", at: "backLeft" },
        { id: "tree", asset: "tree", at: "back" },
        { id: "bush", asset: "bush", at: "farRight" }
      ],
      beats: [
        {
          id: "s1-island",
          kind: "greeting",
          camera: "high",
          stage: [
            { do: "music", bed: "meadowBed" },
            { do: "gesture", actor: "lumi", gesture: "float", loop: true },
            { do: "object", target: "flower", action: "bloom" }
          ],
          lines: [
            { speaker: "narrator", key: "s01e01.s1-island.1" },
            { speaker: "narrator", key: "s01e01.s1-island.2" }
          ],
          holdMs: 3850
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
                {
                  line: 0,
                  stage: [
                    { do: "enter", actor: "gogo", at: "farLeft", from: "offLeft", style: "drive" },
                    { do: "sfx", sound: "whistle" }
                  ]
                },
                {
                  line: 2,
                  stage: [{ do: "gesture", actor: "sheru", gesture: "wag" }]
                },
                {
                  line: 4,
                  stage: [{ do: "object", target: "flower", action: "bloom" }]
                },
                {
                  line: 5,
                  offsetMs: 600,
                  stage: [{ do: "gesture", actor: "lulu", gesture: "wave" }]
                }
              ]
            }
          ],
          lines: [],
          holdMs: 12000
        },
        {
          id: "s1-late-lulu",
          kind: "event",
          camera: "medium",
          stage: [
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "face", actor: "momo", toward: "lulu" },
            { do: "gesture", actor: "momo", gesture: "happy" }
          ],
          lines: [
            { speaker: "lulu", key: "s01e01.s1-late-lulu.1" },
            { speaker: "momo", key: "s01e01.s1-late-lulu.2" }
          ],
          words: [
            { wordId: "hello", objectId: "lulu" },
            { wordId: "wave", objectId: "lulu" }
          ],
          holdMs: 3650
        },
        {
          id: "s1-big-news",
          kind: "outro",
          stage: [
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "wave" },
            { do: "gesture", actor: "momo", gesture: "point" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s1-big-news.1" },
            { speaker: "momo", key: "s01e01.s1-big-news.2" },
            { speaker: "momo", key: "s01e01.s1-big-news.3" }
          ],
          holdMs: 3850
        }
      ]
    },

    // Segment 2 — Sheru's three-fetch physical comedy gag & PAUSE 1
    {
      id: "s2-sheru-ball",
      template: "wordGame",
      world: "meadow",
      music: "meadowBed",
      transitionIn: "cut",
      then: "s3-gogo-train",
      cast: [
        { id: "momo", at: "center" },
        { id: "sheru", at: "left" }
      ],
      props: [
        { id: "rubberDuck", asset: "duck", at: "offRight", hidden: true },
        { id: "sponge", asset: "sponge", at: "offRight", hidden: true },
        { id: "ball", asset: "ball", at: "offRight", hidden: true, tint: "#e84a3c" },
        { id: "toyBox", asset: "toyBox", at: "back" }
      ],
      beats: [
        {
          id: "s2-five-things",
          kind: "greeting",
          camera: "medium",
          stage: [
            { do: "music", bed: "meadowBed" },
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "shrug" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s2-five-things.1" },
            { speaker: "momo", key: "s01e01.s2-five-things.2" }
          ],
          words: [{ wordId: "uh-oh", objectId: "momo" }],
          holdMs: 3650
        },
        {
          id: "s2-ask-sheru",
          kind: "hook",
          camera: "wide",
          stage: [
            { do: "face", actor: "momo", toward: "sheru" },
            { do: "sfx", sound: "woofDouble" },
            { do: "gesture", actor: "sheru", gesture: "wag", loop: true }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s2-ask-sheru.1" }],
          holdMs: 3450
        },
        {
          id: "s2-fetch-duck",
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
          holdMs: 3850
        },
        {
          id: "s2-fetch-sponge",
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
          holdMs: 3850
        },
        {
          id: "s2-ball-arrives",
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
          holdMs: 3250
        },
        {
          id: "s2-pause-1",
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
          holdMs: 2450,
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
            holdMs: 3450
          }
        },
        {
          id: "s2-count-1",
          kind: "repeat",
          stage: [
            { do: "object", target: "ball", action: "bounce" },
            { do: "gesture", actor: "momo", gesture: "point" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s2-count-1.1" },
            { speaker: "narrator", key: "s01e01.s2-count-1.2" }
          ],
          words: [
            { wordId: "one", objectId: "ball" },
            { wordId: "red", objectId: "ball" },
            { wordId: "ball", objectId: "ball" }
          ],
          holdMs: 3850
        },
        {
          id: "s2-next",
          kind: "outro",
          stage: [
            { do: "gesture", actor: "momo", gesture: "look" },
            { do: "sfx", sound: "whistle" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s2-next.1" }],
          words: [{ wordId: "train", objectId: "momo" }],
          holdMs: 3450
        }
      ]
    },

    // Segment 3 — Ready... Go! with GoGo & PAUSE 2
    {
      id: "s3-gogo-train",
      template: "arrival",
      world: "station",
      music: "stationBed",
      transitionIn: "cut",
      then: "s4-lulu-beat",
      cast: [
        { id: "gogo", at: "offLeft" },
        { id: "momo", at: "front" },
        { id: "sheru", at: "frontRight" }
      ],
      props: [
        { id: "carriage1", asset: "gogoCarriage", at: "left" },
        { id: "carriage2", asset: "gogoCarriage", at: "farLeft" },
        { id: "carriage3", asset: "gogoCarriage", at: "backLeft" },
        { id: "stationHouse", asset: "station", at: "back" },
        { id: "tunnel", asset: "tunnel", at: "farRight" },
        { id: "butterfly", asset: "butterfly", at: "offTop", hidden: true }
      ],
      beats: [
        {
          id: "s3-arrive",
          kind: "greeting",
          camera: "wide",
          stage: [
            { do: "music", bed: "stationBed" },
            { do: "enter", actor: "gogo", at: "left", from: "offLeft", style: "drive" },
            { do: "sfx", sound: "chugga" },
            { do: "sfx", sound: "whistle" }
          ],
          lines: [
            { speaker: "gogo", key: "s01e01.s3-arrive.1" },
            { speaker: "momo", key: "s01e01.s3-arrive.2" },
            { speaker: "gogo", key: "s01e01.s3-arrive.3" }
          ],
          words: [
            { wordId: "hello", objectId: "gogo" },
            { wordId: "train", objectId: "gogo" }
          ],
          holdMs: 3650
        },
        {
          id: "s3-count-carriages",
          kind: "model",
          camera: "left",
          stage: [
            { do: "object", target: "carriage1", action: "wobble" },
            { do: "object", target: "carriage2", action: "wobble" },
            { do: "object", target: "carriage3", action: "wobble" },
            { do: "sfx", sound: "clack" }
          ],
          lines: [
            { speaker: "gogo", key: "s01e01.s3-count-carriages.1" },
            { speaker: "gogo", key: "s01e01.s3-count-carriages.2" },
            { speaker: "momo", key: "s01e01.s3-count-carriages.3" }
          ],
          words: [
            { wordId: "one", objectId: "carriage1" },
            { wordId: "two", objectId: "carriage2" },
            { wordId: "three", objectId: "carriage3" }
          ],
          holdMs: 4050
        },
        {
          id: "s3-board",
          kind: "event",
          camera: "medium",
          stage: [
            { do: "ride", actor: "momo", on: "carriage1" },
            { do: "gesture", actor: "momo", gesture: "wave" },
            { do: "gesture", actor: "sheru", gesture: "wag" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s3-board.1" }],
          holdMs: 3250
        },
        {
          id: "s3-pause-2",
          kind: "invite",
          stage: [
            { do: "face", actor: "gogo", toward: "viewer" },
            { do: "gesture", actor: "gogo", gesture: "wait" },
            { do: "object", target: "carriage1", action: "glow" }
          ],
          lines: [{ speaker: "gogo", key: "s01e01.s3-pause-2.1" }],
          words: [{ wordId: "go", objectId: "gogo" }],
          holdMs: 2450,
          input: { type: "tap", targets: ["gogo", "carriage1"] },
          waitMs: 5000,
          pauseMs: 3000,
          pauseCaptionKey: "s01e01.pause.2",
          response: {
            stage: [
              { do: "sfx", sound: "whistle" },
              { do: "move", actor: "gogo", to: "center", style: "drive" },
              { do: "move", actor: "carriage1", to: "left", style: "drive" },
              { do: "move", actor: "sheru", to: "right", style: "run" },
              { do: "sfx", sound: "chugga" }
            ],
            lines: [
              { speaker: "gogo", key: "s01e01.s3-pause-2.2" },
              { speaker: "narrator", key: "s01e01.s3-pause-2.3" }
            ],
            holdMs: 3450
          }
        },
        {
          id: "s3-butterfly",
          kind: "event",
          stage: [
            { do: "show", actor: "butterfly" },
            { do: "enter", actor: "butterfly", at: "center", from: "offTop", style: "fly" },
            { do: "gesture", actor: "gogo", gesture: "freeze" },
            { do: "sfx", sound: "ding" }
          ],
          lines: [
            { speaker: "gogo", key: "s01e01.s3-butterfly.1" },
            { speaker: "momo", key: "s01e01.s3-butterfly.2" }
          ],
          words: [
            { wordId: "stop", objectId: "gogo" },
            { wordId: "butterfly", objectId: "butterfly" }
          ],
          holdMs: 4050
        },
        {
          id: "s3-song",
          kind: "song",
          camera: "wide",
          stage: [
            { do: "exit", actor: "butterfly", to: "offTop", style: "fly" },
            {
              do: "song",
              song: "trainSong",
              performers: ["gogo", "momo", "sheru"],
              cues: [
                {
                  line: 2,
                  stage: [
                    { do: "move", actor: "gogo", to: "right", style: "drive" },
                    { do: "sfx", sound: "chugga" }
                  ]
                },
                {
                  line: 4,
                  stage: [{ do: "gesture", actor: "gogo", gesture: "freeze" }]
                }
              ]
            }
          ],
          lines: [],
          words: [{ wordId: "go", objectId: "gogo" }],
          holdMs: 11500
        },
        {
          id: "s3-count-2",
          kind: "repeat",
          camera: "close",
          stage: [
            { do: "ride", actor: "momo", on: null },
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "point" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s3-count-2.1" }],
          holdMs: 3650
        },
        {
          id: "s3-depart",
          kind: "outro",
          camera: "wide",
          stage: [
            { do: "sfx", sound: "whistle" },
            { do: "gesture", actor: "gogo", gesture: "wave" }
          ],
          lines: [{ speaker: "gogo", key: "s01e01.s3-depart.1" }],
          holdMs: 3250
        }
      ]
    },

    // Segment 4 — Lulu's Boom-Boom Beat & PAUSE 3 + PAUSE 4
    {
      id: "s4-lulu-beat",
      template: "songBreak",
      world: "music-garden",
      music: "gardenBed",
      transitionIn: "train",
      then: "s5-peeko-barn",
      cast: [
        { id: "lulu", at: "center" },
        { id: "momo", at: "left" },
        { id: "sheru", at: "frontLeft" }
      ],
      props: [
        { id: "drum", asset: "drum", at: "right" },
        { id: "piano", asset: "toyPiano", at: "back" },
        { id: "stone1", asset: "stompStone", at: "frontLeft" },
        { id: "stone2", asset: "stompStone", at: "front" },
        { id: "stone3", asset: "stompStone", at: "frontRight" }
      ],
      beats: [
        {
          id: "s4-hi",
          kind: "greeting",
          stage: [
            { do: "music", bed: "gardenBed" },
            { do: "gesture", actor: "lulu", gesture: "dance", loop: true },
            { do: "gesture", actor: "momo", gesture: "wave" }
          ],
          lines: [
            { speaker: "lulu", key: "s01e01.s4-hi.1" },
            { speaker: "momo", key: "s01e01.s4-hi.2" }
          ],
          words: [{ wordId: "hello", objectId: "lulu" }],
          holdMs: 3450
        },
        {
          id: "s4-boom",
          kind: "model",
          camera: "medium",
          stage: [
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
          holdMs: 3650
        },
        {
          id: "s4-pause-3",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "gesture", actor: "lulu", gesture: "wait" },
            { do: "object", target: "drum", action: "glow" }
          ],
          lines: [{ speaker: "lulu", key: "s01e01.s4-pause-3.1" }],
          words: [{ wordId: "stomp", objectId: "lulu" }],
          holdMs: 2450,
          input: { type: "tap", targets: ["lulu", "drum"] },
          waitMs: 5000,
          pauseMs: 3000,
          pauseCaptionKey: "s01e01.pause.3",
          response: {
            stage: [
              { do: "gesture", actor: "lulu", gesture: "stomp" },
              { do: "sfx", sound: "stomp" },
              { do: "object", target: "stone2", action: "glow" },
              { do: "gesture", actor: "momo", gesture: "cheer" }
            ],
            lines: [{ speaker: "lulu", key: "s01e01.s4-pause-3.2" }],
            holdMs: 3250
          }
        },
        {
          id: "s4-late-clap",
          kind: "event",
          camera: "wide",
          stage: [
            { do: "gesture", actor: "momo", gesture: "clap" },
            { do: "sfx", sound: "clap" },
            { do: "gesture", actor: "lulu", gesture: "clap" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s4-late-clap.1" },
            { speaker: "lulu", key: "s01e01.s4-late-clap.2" }
          ],
          words: [{ wordId: "clap", objectId: "momo" }],
          holdMs: 3650
        },
        {
          id: "s4-song",
          kind: "song",
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
          holdMs: 11500
        },
        {
          id: "s4-late-freeze",
          kind: "event",
          stage: [
            { do: "gesture", actor: "lulu", gesture: "happy" },
            { do: "gesture", actor: "sheru", gesture: "wag" },
            { do: "sfx", sound: "giggle" }
          ],
          lines: [
            { speaker: "lulu", key: "s01e01.s4-late-freeze.1" },
            { speaker: "momo", key: "s01e01.s4-late-freeze.2" }
          ],
          holdMs: 3450
        },
        {
          id: "s4-pause-4",
          kind: "invite",
          stage: [
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "gesture", actor: "lulu", gesture: "wait" },
            { do: "gesture", actor: "momo", gesture: "wait" }
          ],
          lines: [{ speaker: "lulu", key: "s01e01.s4-pause-4.1" }],
          words: [
            { wordId: "dance", objectId: "lulu" },
            { wordId: "stop", objectId: "lulu" }
          ],
          holdMs: 2450,
          input: { type: "tap", targets: ["lulu", "momo"] },
          waitMs: 5000,
          pauseMs: 2500,
          pauseCaptionKey: "s01e01.pause.4",
          response: {
            stage: [
              { do: "gesture", actor: "lulu", gesture: "freeze" },
              { do: "gesture", actor: "momo", gesture: "freeze" },
              { do: "sfx", sound: "tada" }
            ],
            lines: [{ speaker: "lulu", key: "s01e01.s4-pause-4.2" }],
            holdMs: 3250
          }
        },
        {
          id: "s4-count-3",
          kind: "repeat",
          camera: "close",
          stage: [
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "point" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s4-count-3.1" }],
          holdMs: 3650
        },
        {
          id: "s4-next",
          kind: "outro",
          camera: "wide",
          stage: [
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "sfx", sound: "woofSoft" }
          ],
          lines: [{ speaker: "lulu", key: "s01e01.s4-next.1" }],
          holdMs: 3250
        }
      ]
    },

    // Segment 5 — Peekaboo with Peeko & PAUSE 5 + PAUSE 6
    {
      id: "s5-peeko-barn",
      template: "surprise",
      world: "peekaboo-barn",
      music: "barnBed",
      transitionIn: "cut",
      then: "s6-lumi-preview",
      cast: [
        { id: "momo", at: "left" },
        { id: "peeko", at: "right" }
      ],
      props: [
        { id: "barn", asset: "barn", at: "back" },
        { id: "door", asset: "door", at: "backLeft" },
        { id: "toyBox", asset: "toyBox", at: "right", size: 0.35 },
        { id: "hat", asset: "hat", at: "offTop", hidden: true }
      ],
      beats: [
        {
          id: "s5-arrive",
          kind: "greeting",
          camera: "wide",
          stage: [
            { do: "music", bed: "barnBed" },
            { do: "gesture", actor: "peeko", gesture: "hide" },
            { do: "sfx", sound: "rustle" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s5-arrive.1" }],
          words: [{ wordId: "where", objectId: "peeko" }],
          holdMs: 3450
        },
        {
          id: "s5-hiding",
          kind: "hook",
          stage: [
            { do: "gesture", actor: "peeko", gesture: "peek" },
            { do: "sfx", sound: "giggle" }
          ],
          lines: [{ speaker: "peeko", key: "s01e01.s5-hiding.1" }],
          holdMs: 3450
        },
        {
          id: "s5-pause-5",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "wait" },
            { do: "object", target: "toyBox", action: "glow" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s5-pause-5.1" }],
          words: [
            { wordId: "behind", objectId: "toyBox" },
            { wordId: "box", objectId: "toyBox" },
            { wordId: "peekaboo", objectId: "peeko" }
          ],
          holdMs: 2450,
          input: { type: "tap", targets: ["toyBox", "peeko"] },
          waitMs: 5000,
          pauseMs: 3000,
          pauseCaptionKey: "s01e01.pause.5",
          response: {
            stage: [
              { do: "gesture", actor: "peeko", gesture: "hop" },
              { do: "sfx", sound: "boing" },
              { do: "gesture", actor: "momo", gesture: "happy" }
            ],
            lines: [
              { speaker: "momo", key: "s01e01.s5-pause-5.2" },
              { speaker: "peeko", key: "s01e01.s5-pause-5.3" }
            ],
            holdMs: 3450
          }
        },
        {
          id: "s5-game-ask",
          kind: "model",
          camera: "medium",
          stage: [
            { do: "face", actor: "momo", toward: "peeko" },
            { do: "face", actor: "peeko", toward: "momo" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s5-game-ask.1" },
            { speaker: "peeko", key: "s01e01.s5-game-ask.2" }
          ],
          holdMs: 3450
        },
        {
          id: "s5-song",
          kind: "song",
          camera: "wide",
          stage: [
            {
              do: "song",
              song: "peekaboo",
              performers: ["peeko", "momo"],
              cues: [
                {
                  line: 2,
                  stage: [
                    { do: "object", target: "door", action: "open" },
                    { do: "sfx", sound: "doorOpen" }
                  ]
                },
                {
                  line: 4,
                  stage: [{ do: "gesture", actor: "peeko", gesture: "hide" }]
                }
              ]
            }
          ],
          lines: [],
          holdMs: 11500
        },
        {
          id: "s5-hat-drop",
          kind: "event",
          stage: [
            { do: "show", actor: "hat" },
            { do: "enter", actor: "hat", at: "left", from: "offTop", style: "float" },
            { do: "object", target: "hat", action: "fall" },
            { do: "gesture", actor: "momo", gesture: "hide" },
            { do: "sfx", sound: "boing" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s5-hat-drop.1" }],
          holdMs: 3250
        },
        {
          id: "s5-pause-6",
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
          holdMs: 2450,
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
            holdMs: 3450
          }
        },
        {
          id: "s5-count-4",
          kind: "repeat",
          camera: "medium",
          stage: [
            { do: "hide", actor: "hat" },
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "point" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s5-count-4.1" }],
          holdMs: 3650
        },
        {
          id: "s5-next",
          kind: "outro",
          camera: "wide",
          stage: [
            { do: "gesture", actor: "peeko", gesture: "point" },
            { do: "sfx", sound: "tweet" }
          ],
          lines: [{ speaker: "peeko", key: "s01e01.s5-next.1" }],
          words: [{ wordId: "more", objectId: "peeko" }],
          holdMs: 3250
        }
      ]
    },

    // Segment 6 — Lumi's Look-What-I-Found preview parade & PAUSE 7
    {
      id: "s6-lumi-preview",
      template: "wordGame",
      world: "learning-cloud",
      music: "cloudBed",
      transitionIn: "fade",
      then: "s7-welcome-party",
      cast: [
        { id: "lumi", at: "offTop" },
        { id: "momo", at: "left" },
        { id: "peeko", at: "right" }
      ],
      props: [
        { id: "apple", asset: "apple", at: "center", hidden: true },
        { id: "ball", asset: "ball", at: "frontRight", hidden: true, tint: "#e84a3c" },
        { id: "block1", asset: "toyBlock", at: "frontLeft", hidden: true, tint: "#e84a3c" },
        { id: "block2", asset: "toyBlock", at: "front", hidden: true, tint: "#3b82f6" },
        { id: "block3", asset: "toyBlock", at: "frontRight", hidden: true, tint: "#eab308" },
        { id: "letterB", asset: "letterB", at: "center", hidden: true },
        { id: "cow", asset: "cow", at: "center", hidden: true },
        { id: "drum", asset: "drum", at: "center", hidden: true },
        { id: "moon", asset: "moon", at: "highRight", hidden: true }
      ],
      beats: [
        {
          id: "s6-hi",
          kind: "greeting",
          camera: "wide",
          stage: [
            { do: "music", bed: "cloudBed" },
            { do: "enter", actor: "lumi", at: "high", from: "offTop", style: "float" },
            { do: "gesture", actor: "lumi", gesture: "glow" }
          ],
          lines: [
            { speaker: "lumi", key: "s01e01.s6-hi.1" },
            { speaker: "momo", key: "s01e01.s6-hi.2" }
          ],
          holdMs: 3450
        },
        {
          id: "s6-stars",
          kind: "hook",
          stage: [
            { do: "gesture", actor: "lumi", gesture: "twinkle" },
            { do: "sfx", sound: "sparkle" },
            { do: "gesture", actor: "momo", gesture: "cheer" }
          ],
          lines: [
            { speaker: "lumi", key: "s01e01.s6-stars.1" },
            { speaker: "momo", key: "s01e01.s6-stars.2" }
          ],
          words: [{ wordId: "star", objectId: "lumi" }],
          holdMs: 3650
        },
        {
          id: "s6-apple",
          kind: "model",
          camera: "close",
          stage: [
            { do: "show", actor: "apple" },
            { do: "show", actor: "ball" },
            { do: "object", target: "apple", action: "rise" },
            { do: "gesture", actor: "lumi", gesture: "point" }
          ],
          lines: [
            { speaker: "lumi", key: "s01e01.s6-apple.1" },
            { speaker: "momo", key: "s01e01.s6-apple.2" },
            { speaker: "lumi", key: "s01e01.s6-apple.3" }
          ],
          words: [
            { wordId: "apple", objectId: "apple" },
            { wordId: "red", objectId: "apple" }
          ],
          holdMs: 3650
        },
        {
          id: "s6-colours-song",
          kind: "song",
          camera: "wide",
          stage: [
            {
              do: "song",
              song: "colours",
              performers: ["lumi", "momo", "peeko"],
              cues: [
                { line: 0, stage: [{ do: "object", target: "ball", action: "bounce" }] },
                { line: 4, stage: [{ do: "object", target: "apple", action: "wobble" }] }
              ]
            }
          ],
          lines: [],
          holdMs: 11500
        },
        {
          id: "s6-blocks",
          kind: "model",
          camera: "medium",
          stage: [
            { do: "hide", actor: "apple" },
            { do: "hide", actor: "ball" },
            { do: "show", actor: "block1" },
            { do: "show", actor: "block2" },
            { do: "show", actor: "block3" },
            { do: "object", target: "block1", action: "stack" },
            { do: "object", target: "block2", action: "stack" },
            { do: "object", target: "block3", action: "stack" },
            { do: "sfx", sound: "clack" }
          ],
          lines: [{ speaker: "lumi", key: "s01e01.s6-blocks.1" }],
          words: [{ wordId: "block", objectId: "block1" }],
          holdMs: 3250
        },
        {
          id: "s6-pause-7",
          kind: "invite",
          stage: [
            { do: "face", actor: "lumi", toward: "viewer" },
            { do: "gesture", actor: "lumi", gesture: "wait" },
            { do: "object", target: "block1", action: "glow" },
            { do: "object", target: "block2", action: "glow" },
            { do: "object", target: "block3", action: "glow" }
          ],
          lines: [{ speaker: "lumi", key: "s01e01.s6-pause-7.1" }],
          words: [
            { wordId: "one", objectId: "block1" },
            { wordId: "two", objectId: "block2" },
            { wordId: "three", objectId: "block3" }
          ],
          holdMs: 2450,
          input: { type: "tap", targets: ["block1", "block2"] },
          waitMs: 5000,
          pauseMs: 2500,
          pauseCaptionKey: "s01e01.pause.7",
          response: {
            stage: [
              { do: "object", target: "block3", action: "topple" },
              { do: "sfx", sound: "tumble" },
              { do: "gesture", actor: "momo", gesture: "surprise" }
            ],
            lines: [
              { speaker: "lumi", key: "s01e01.s6-pause-7.2" },
              { speaker: "momo", key: "s01e01.s6-pause-7.3" }
            ],
            holdMs: 3450
          }
        },
        {
          id: "s6-letter",
          kind: "model",
          stage: [
            { do: "hide", actor: "block1" },
            { do: "hide", actor: "block2" },
            { do: "hide", actor: "block3" },
            { do: "show", actor: "letterB" },
            { do: "show", actor: "ball" },
            { do: "object", target: "letterB", action: "wobble" },
            { do: "object", target: "ball", action: "bounce" }
          ],
          lines: [
            { speaker: "lumi", key: "s01e01.s6-letter.1" },
            { speaker: "lumi", key: "s01e01.s6-letter.2" }
          ],
          words: [
            { wordId: "b", objectId: "letterB" },
            { wordId: "ball", objectId: "ball" }
          ],
          holdMs: 3850
        },
        {
          id: "s6-cow",
          kind: "model",
          camera: "medium",
          stage: [
            { do: "hide", actor: "letterB" },
            { do: "hide", actor: "ball" },
            { do: "show", actor: "cow" },
            { do: "object", target: "cow", action: "wobble" },
            { do: "sfx", sound: "moo" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s6-cow.1" },
            { speaker: "lumi", key: "s01e01.s6-cow.2" }
          ],
          words: [
            { wordId: "cow", objectId: "cow" },
            { wordId: "moo", objectId: "cow" }
          ],
          holdMs: 3450
        },
        {
          id: "s6-drum-moon",
          kind: "model",
          camera: "wide",
          stage: [
            { do: "hide", actor: "cow" },
            { do: "show", actor: "drum" },
            { do: "object", target: "drum", action: "shake" },
            { do: "sfx", sound: "drum" },
            { do: "show", actor: "moon" },
            { do: "object", target: "moon", action: "glow" }
          ],
          lines: [
            { speaker: "lumi", key: "s01e01.s6-drum-moon.1" },
            { speaker: "lumi", key: "s01e01.s6-drum-moon.2" }
          ],
          words: [
            { wordId: "drum", objectId: "drum" },
            { wordId: "moon", objectId: "moon" }
          ],
          holdMs: 3850
        },
        {
          id: "s6-count-5",
          kind: "outro",
          stage: [
            { do: "hide", actor: "drum" },
            { do: "hide", actor: "moon" },
            { do: "gesture", actor: "lumi", gesture: "twinkle" },
            { do: "sfx", sound: "sparkle" },
            { do: "gesture", actor: "momo", gesture: "cheer" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s6-count-5.1" },
            { speaker: "peeko", key: "s01e01.s6-count-5.2" }
          ],
          holdMs: 3450
        }
      ]
    },

    // Segment 7 — The Welcome Party at Home Nook & PAUSE 8
    {
      id: "s7-welcome-party",
      template: "tryAtHome",
      world: "home-nook",
      music: "homeBed",
      transitionIn: "fade",
      then: "s8a-byes",
      cast: [
        { id: "momo", at: "center" },
        { id: "lulu", at: "left" },
        { id: "peeko", at: "right" },
        { id: "lumi", at: "highLeft" },
        { id: "sheru", at: "frontLeft" },
        { id: "gogo", at: "farRight" }
      ],
      props: [
        { id: "table", asset: "table", at: "back" },
        { id: "cake", asset: "cake", at: "back" },
        { id: "balloon1", asset: "balloon", at: "highRight", tint: "#e84a3c" },
        { id: "balloon2", asset: "balloon", at: "backLeft", tint: "#3b82f6" },
        { id: "balloon3", asset: "balloon", at: "backRight", tint: "#eab308" },
        { id: "partyHat", asset: "partyHat", at: "center", size: 0.28 },
        { id: "ball", asset: "ball", at: "front", tint: "#e84a3c" },
        { id: "carriage", asset: "gogoCarriage", at: "farRight" },
        { id: "drum", asset: "drum", at: "left" },
        { id: "sponge", asset: "sponge", at: "offLeft", hidden: true }
      ],
      beats: [
        {
          id: "s7-welcome",
          kind: "greeting",
          camera: "wide",
          stage: [
            { do: "music", bed: "homeBed" },
            { do: "object", target: "balloon1", action: "rise" },
            { do: "object", target: "balloon2", action: "rise" },
            { do: "object", target: "balloon3", action: "rise" },
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "face", actor: "peeko", toward: "viewer" },
            { do: "face", actor: "lumi", toward: "viewer" },
            { do: "face", actor: "sheru", toward: "viewer" },
            { do: "face", actor: "gogo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "wave" },
            { do: "sfx", sound: "tada" }
          ],
          lines: [
            { speaker: "narrator", key: "s01e01.s7-welcome.1" },
            { speaker: "momo", key: "s01e01.s7-welcome.2" }
          ],
          words: [{ wordId: "look", objectId: "cake" }],
          holdMs: 3850
        },
        {
          id: "s7-recap-1-3",
          kind: "repeat",
          stage: [
            { do: "object", target: "ball", action: "bounce" },
            { do: "object", target: "carriage", action: "wobble" },
            { do: "sfx", sound: "whistle" },
            { do: "object", target: "drum", action: "shake" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s7-recap-1-3.1" },
            { speaker: "gogo", key: "s01e01.s7-recap-1-3.2" },
            { speaker: "lulu", key: "s01e01.s7-recap-1-3.3" }
          ],
          words: [{ wordId: "ball", objectId: "ball" }],
          holdMs: 3850
        },
        {
          id: "s7-recap-4-5",
          kind: "repeat",
          stage: [
            { do: "gesture", actor: "peeko", gesture: "peek" },
            { do: "gesture", actor: "lumi", gesture: "twinkle" },
            { do: "sfx", sound: "sparkle" }
          ],
          lines: [
            { speaker: "peeko", key: "s01e01.s7-recap-4-5.1" },
            { speaker: "lumi", key: "s01e01.s7-recap-4-5.2" }
          ],
          holdMs: 3650
        },
        {
          id: "s7-pause-8",
          kind: "invite",
          stage: [
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "wait" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s7-pause-8.1" }],
          words: [
            { wordId: "wave", objectId: "momo" },
            { wordId: "hello", objectId: "momo" }
          ],
          holdMs: 2450,
          input: { type: "tap", targets: ["momo", "lulu"] },
          waitMs: 5000,
          pauseMs: 2500,
          pauseCaptionKey: "s01e01.pause.8",
          response: {
            stage: [
              { do: "gesture", actor: "momo", gesture: "wave" },
              { do: "gesture", actor: "lulu", gesture: "wave" },
              { do: "gesture", actor: "peeko", gesture: "wave" },
              { do: "gesture", actor: "gogo", gesture: "nod" },
              { do: "gesture", actor: "sheru", gesture: "wag" }
            ],
            lines: [{ speaker: "momo", key: "s01e01.s7-pause-8.2" }],
            holdMs: 3450
          }
        },
        {
          id: "s7-sponge-callback",
          kind: "event",
          camera: "medium",
          stage: [
            { do: "show", actor: "sponge" },
            { do: "enter", actor: "sponge", at: "frontLeft", from: "offLeft", style: "slide" },
            { do: "carry", actor: "sheru", item: "sponge" },
            { do: "sfx", sound: "woofDouble" },
            { do: "gesture", actor: "sheru", gesture: "wag" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s7-sponge-callback.1" },
            { speaker: "lulu", key: "s01e01.s7-sponge-callback.2" }
          ],
          words: [{ wordId: "sponge", objectId: "sponge" }],
          holdMs: 3850
        },
        {
          id: "s7-hello-song",
          kind: "song",
          camera: "wide",
          stage: [
            { do: "carry", actor: "sheru", item: null },
            {
              do: "song",
              song: "hello",
              performers: ["momo", "lulu", "sheru", "gogo", "lumi", "peeko"],
              cues: [
                { line: 0, stage: [{ do: "gesture", actor: "sheru", gesture: "wag" }] },
                {
                  line: 2,
                  stage: [
                    { do: "object", target: "balloon1", action: "bounce" },
                    { do: "object", target: "balloon2", action: "bounce" }
                  ]
                }
              ]
            }
          ],
          lines: [],
          holdMs: 10500
        },
        {
          id: "s7-thanks",
          kind: "outro",
          stage: [
            { do: "gesture", actor: "momo", gesture: "bow" },
            { do: "gesture", actor: "gogo", gesture: "happy" }
          ],
          lines: [
            { speaker: "momo", key: "s01e01.s7-thanks.1" },
            { speaker: "gogo", key: "s01e01.s7-thanks.2" }
          ],
          words: [{ wordId: "thank-you", objectId: "momo" }],
          holdMs: 3650
        }
      ]
    },

    // Segment 8a — Calm yawn, allDone song & character goodbyes in Home Nook
    {
      id: "s8a-byes",
      template: "goodbye",
      world: "home-nook",
      music: null,
      transitionIn: "cut",
      then: "s8b-stars",
      cast: [
        { id: "momo", at: "center" },
        { id: "lulu", at: "left" },
        { id: "peeko", at: "right" },
        { id: "lumi", at: "highLeft" },
        { id: "sheru", at: "frontLeft" },
        { id: "gogo", at: "farRight" }
      ],
      props: [
        { id: "table", asset: "table", at: "back" },
        { id: "cake", asset: "cake", at: "back" },
        { id: "balloon1", asset: "balloon", at: "highRight", tint: "#e84a3c" },
        { id: "balloon2", asset: "balloon", at: "backLeft", tint: "#3b82f6" },
        { id: "ball", asset: "ball", at: "front", tint: "#e84a3c" }
      ],
      beats: [
        {
          id: "s8-yawn",
          kind: "greeting",
          camera: "wide",
          stage: [
            { do: "music", bed: null },
            { do: "gesture", actor: "momo", gesture: "yawn" },
            { do: "sfx", sound: "yawn" },
            { do: "object", target: "balloon1", action: "down" },
            { do: "object", target: "balloon2", action: "down" }
          ],
          lines: [{ speaker: "momo", key: "s01e01.s8-yawn.1" }],
          holdMs: 3650
        },
        {
          id: "s8-alldone",
          kind: "song",
          stage: [
            {
              do: "song",
              song: "allDone",
              performers: ["momo", "lulu", "sheru", "gogo", "lumi", "peeko"]
            }
          ],
          lines: [],
          words: [
            { wordId: "all-done", objectId: "momo" },
            { wordId: "bye", objectId: "momo" }
          ],
          holdMs: 10500
        },
        {
          id: "s8-byes",
          kind: "outro",
          camera: "medium",
          stage: [
            { do: "gesture", actor: "gogo", gesture: "wave" },
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "gesture", actor: "peeko", gesture: "wave" },
            { do: "gesture", actor: "sheru", gesture: "wag" },
            { do: "sfx", sound: "aroo" }
          ],
          lines: [
            { speaker: "gogo", key: "s01e01.s8-byes.1" },
            { speaker: "lulu", key: "s01e01.s8-byes.2" },
            { speaker: "peeko", key: "s01e01.s8-byes.3" },
            { speaker: "momo", key: "s01e01.s8-byes.4" }
          ],
          words: [{ wordId: "bye", objectId: "gogo" }],
          holdMs: 4050
        }
      ]
    },

    // Segment 8b — Soft fade into Starlight Cloud & Lumi's calm starlightHum close
    {
      id: "s8b-stars",
      template: "goodbye",
      world: "starlight-cloud",
      music: "starlightBed",
      transitionIn: "fade",
      cast: [{ id: "lumi", at: "high" }],
      props: [
        { id: "moon", asset: "moon", at: "highLeft" },
        { id: "cloud1", asset: "sleepyCloud", at: "left" },
        { id: "cloud2", asset: "sleepyCloud", at: "right" }
      ],
      beats: [
        {
          id: "s8-goodnight",
          kind: "greeting",
          camera: "high",
          stage: [
            { do: "music", bed: "starlightBed" },
            { do: "face", actor: "lumi", toward: "viewer" },
            { do: "gesture", actor: "lumi", gesture: "glow" },
            { do: "object", target: "moon", action: "glow" }
          ],
          lines: [
            { speaker: "lumi", key: "s01e01.s8-goodnight.1" },
            { speaker: "lumi", key: "s01e01.s8-goodnight.2" }
          ],
          words: [
            { wordId: "star", objectId: "lumi" },
            { wordId: "sleep", objectId: "lumi" },
            { wordId: "dream", objectId: "lumi" }
          ],
          holdMs: 4250
        },
        {
          id: "s8-starlight-hum",
          kind: "outro",
          stage: [
            { do: "song", song: "starlightHum", performers: ["lumi"] },
            { do: "gesture", actor: "lumi", gesture: "twinkle", loop: true }
          ],
          lines: [],
          holdMs: 12000
        }
      ]
    }
  ]
} satisfies ShowSpec;

export const show: ShowSpec = s01e01WelcomeToWonderWorld;
