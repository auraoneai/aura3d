// G09 — Family Doorbells (P2 activity, PRD 05 section 3, task I06). Momo is at
// home in the Home Nook. A tap on the door rings a soft doorbell, the door
// opens slowly and a friend (Lulu, one of the cast) waves hi, dances a little
// and waves bye. Words: hi, bye, door.
//
// Privacy (PRD 01 section 8, MASTER-PROMPT section 6): generic friends only.
// No family names, voices, photos or relationship words appear in this file or
// its locale text; the visitor is always a Wonder World character. Any private
// family pack stays out of the repository and out of the public build.
// No startle: the bell is soft, the door wiggles before it opens and the
// friend is already waving when it appears. She never vanishes in plain view:
// after "bye" she walks back through the doorway at `back`, the door closes
// once the threshold clears, and she is hidden behind it.
import type { ActivitySpec } from "../../types.js";

export const activity: ActivitySpec = {
  kind: "activity",
  id: "family-doorbells",
  number: 9,
  version: 1,
  phase: "P2",
  titleKey: "g09.title",
  world: "home-nook",
  host: "momo",
  cast: [
    { id: "momo", at: "offLeft" },
    { id: "lulu", at: "back", hidden: true },
    { id: "peeko", at: "back", hidden: true },
    { id: "sheru", at: "back", hidden: true }
  ],
  props: [{ id: "door", asset: "door", at: "back", size: 1.6 }],
  targetWords: ["hi", "bye", "door"],
  supportWords: ["open", "close", "dance", "again", "wave", "all-done"],
  music: "homeBed",
  offlinePlayKey: "g09.offline",
  caregiverBridgeKey: "g09.bridge",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  },
  options: { allowTap: true, dragAlternative: "tap", microphoneRequired: false },
  roundLimit: 3,
  roundVariants: [
    {
      beatOverrides: {
        open: {
          stage: [
            { do: "object", target: "door", action: "open" },
            { do: "sfx", sound: "doorOpen" },
            { do: "enter", actor: "lulu", at: "center", from: "back", style: "walk" },
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "face", actor: "momo", toward: "lulu" }
          ],
          reducedMotionStage: [
            { do: "object", target: "door", action: "open" },
            { do: "sfx", sound: "doorOpen" },
            { do: "enter", actor: "lulu", at: "center", from: "back", style: "walk" },
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "face", actor: "momo", toward: "lulu" }
          ]
        },
        dance: {
          stage: [
            { do: "gesture", actor: "lulu", gesture: "dance" },
            { do: "gesture", actor: "momo", gesture: "happy" }
          ],
          reducedMotionStage: [
            { do: "gesture", actor: "lulu", gesture: "sway" },
            { do: "gesture", actor: "momo", gesture: "nod" }
          ]
        }
      }
    },
    {
      beatOverrides: {
        open: {
          stage: [
            { do: "object", target: "door", action: "open" },
            { do: "sfx", sound: "doorOpen" },
            { do: "enter", actor: "lulu", at: "right", from: "back", style: "walk" },
            { do: "enter", actor: "peeko", at: "center", from: "back", style: "hop" },
            { do: "sfx", sound: "tweet" },
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "face", actor: "peeko", toward: "viewer" },
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "gesture", actor: "peeko", gesture: "happy" },
            { do: "face", actor: "momo", toward: "peeko" }
          ],
          reducedMotionStage: [
            { do: "object", target: "door", action: "open" },
            { do: "sfx", sound: "doorOpen" },
            { do: "enter", actor: "lulu", at: "right", from: "back", style: "walk" },
            { do: "enter", actor: "peeko", at: "center", from: "back", style: "walk" },
            { do: "sfx", sound: "tweet" },
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "face", actor: "peeko", toward: "viewer" },
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "gesture", actor: "peeko", gesture: "wave" },
            { do: "face", actor: "momo", toward: "peeko" }
          ]
        },
        dance: {
          stage: [
            { do: "gesture", actor: "peeko", gesture: "dance" },
            { do: "sfx", sound: "tweet" },
            { do: "gesture", actor: "lulu", gesture: "dance" },
            { do: "gesture", actor: "momo", gesture: "cheer" }
          ],
          reducedMotionStage: [
            { do: "gesture", actor: "peeko", gesture: "sway" },
            { do: "sfx", sound: "tweet" },
            { do: "gesture", actor: "lulu", gesture: "sway" },
            { do: "gesture", actor: "momo", gesture: "nod" }
          ]
        },
        bye: {
          stage: [
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "face", actor: "peeko", toward: "viewer" },
            { do: "gesture", actor: "peeko", gesture: "wave" },
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "gesture", actor: "momo", gesture: "wave" }
          ],
          response: {
            stage: [
              { do: "move", actor: "peeko", to: "back", style: "walk" },
              { do: "move", actor: "lulu", to: "back", style: "walk" },
              { do: "object", target: "door", action: "close" },
              { do: "gesture", actor: "momo", gesture: "nod" }
            ],
            lines: [],
            holdMs: 2400
          },
          responseByTarget: {
            door: {
              stage: [
                { do: "move", actor: "peeko", to: "back", style: "walk" },
                { do: "move", actor: "lulu", to: "back", style: "walk" },
                { do: "object", target: "door", action: "close" },
                { do: "gesture", actor: "momo", gesture: "nod" }
              ]
            },
            lulu: {
              stage: [
                { do: "gesture", actor: "lulu", gesture: "bow" },
                { do: "move", actor: "peeko", to: "back", style: "walk" },
                { do: "move", actor: "lulu", to: "back", style: "walk" },
                { do: "object", target: "door", action: "close" },
                { do: "gesture", actor: "momo", gesture: "happy" }
              ]
            }
          }
        }
      }
    },
    {
      beatOverrides: {
        open: {
          stage: [
            { do: "object", target: "door", action: "open" },
            { do: "sfx", sound: "doorOpen" },
            { do: "enter", actor: "lulu", at: "right", from: "back", style: "walk" },
            { do: "enter", actor: "sheru", at: "center", from: "back", style: "walk" },
            { do: "sfx", sound: "woof" },
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "face", actor: "sheru", toward: "viewer" },
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "gesture", actor: "sheru", gesture: "wag" },
            { do: "face", actor: "momo", toward: "sheru" }
          ],
          reducedMotionStage: [
            { do: "object", target: "door", action: "open" },
            { do: "sfx", sound: "doorOpen" },
            { do: "enter", actor: "lulu", at: "right", from: "back", style: "walk" },
            { do: "enter", actor: "sheru", at: "center", from: "back", style: "walk" },
            { do: "sfx", sound: "woof" },
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "face", actor: "sheru", toward: "viewer" },
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "gesture", actor: "sheru", gesture: "wag" },
            { do: "face", actor: "momo", toward: "sheru" }
          ]
        },
        dance: {
          stage: [
            { do: "gesture", actor: "sheru", gesture: "wag" },
            { do: "sfx", sound: "woofSoft" },
            { do: "gesture", actor: "lulu", gesture: "dance" },
            { do: "gesture", actor: "momo", gesture: "happy" }
          ],
          reducedMotionStage: [
            { do: "gesture", actor: "sheru", gesture: "wag" },
            { do: "sfx", sound: "woofSoft" },
            { do: "gesture", actor: "lulu", gesture: "sway" },
            { do: "gesture", actor: "momo", gesture: "nod" }
          ]
        },
        bye: {
          stage: [
            { do: "face", actor: "lulu", toward: "viewer" },
            { do: "face", actor: "sheru", toward: "viewer" },
            { do: "gesture", actor: "sheru", gesture: "wag" },
            { do: "gesture", actor: "lulu", gesture: "wave" },
            { do: "gesture", actor: "momo", gesture: "wave" }
          ],
          response: {
            stage: [
              { do: "move", actor: "sheru", to: "back", style: "walk" },
              { do: "move", actor: "lulu", to: "back", style: "walk" },
              { do: "object", target: "door", action: "close" },
              { do: "gesture", actor: "momo", gesture: "nod" }
            ],
            lines: [],
            holdMs: 2400
          },
          responseByTarget: {
            door: {
              stage: [
                { do: "move", actor: "sheru", to: "back", style: "walk" },
                { do: "move", actor: "lulu", to: "back", style: "walk" },
                { do: "object", target: "door", action: "close" },
                { do: "gesture", actor: "momo", gesture: "nod" }
              ]
            },
            lulu: {
              stage: [
                { do: "gesture", actor: "lulu", gesture: "bow" },
                { do: "move", actor: "sheru", to: "back", style: "walk" },
                { do: "move", actor: "lulu", to: "back", style: "walk" },
                { do: "object", target: "door", action: "close" },
                { do: "gesture", actor: "momo", gesture: "happy" }
              ]
            }
          }
        }
      }
    }
  ],
  intro: [
    {
      id: "hello",
      kind: "greeting",
      camera: "wide",
      stage: [
        { do: "music", bed: "homeBed" },
        { do: "enter", actor: "momo", at: "frontLeft", from: "offLeft", style: "walk" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" },
        { do: "object", target: "door", action: "glow" }
      ],
      lines: [
        { speaker: "momo", key: "g09.hello.1" },
        { speaker: "momo", key: "g09.hello.2" }
      ],
      words: [
        { wordId: "hi", objectId: "momo" },
        { wordId: "door", objectId: "door" }
      ],
      holdMs: 1500
    }
  ],
  round: [
    {
      id: "ring",
      kind: "invite",
      camera: "medium",
      stage: [
        { do: "hide", actor: "lulu" },
        { do: "hide", actor: "peeko" },
        { do: "hide", actor: "sheru" },
        { do: "object", target: "door", action: "close" },
        { do: "object", target: "door", action: "wobble" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      reducedMotionStage: [
        { do: "hide", actor: "lulu" },
        { do: "hide", actor: "peeko" },
        { do: "hide", actor: "sheru" },
        { do: "object", target: "door", action: "close" },
        { do: "object", target: "door", action: "glow" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "point" }
      ],
      lines: [{ speaker: "momo", key: "g09.ring.1" }],
      holdMs: 800,
      input: { type: "tap", targets: ["door"] },
      waitMs: 5000,
      caregiverPromptKey: "g09.tip.1",
      response: {
        stage: [
          { do: "sfx", sound: "doorbell" },
          { do: "object", target: "door", action: "ring" },
          { do: "face", actor: "momo", toward: "door" }
        ],
        lines: [{ speaker: "momo", key: "g09.ring.2" }],
        holdMs: 800
      },
      words: [{ wordId: "door", objectId: "door" }]
    },
    {
      id: "open",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "object", target: "door", action: "open" },
        { do: "sfx", sound: "doorOpen" },
        { do: "enter", actor: "lulu", at: "center", from: "back", style: "walk" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "face", actor: "momo", toward: "lulu" }
      ],
      reducedMotionStage: [
        { do: "object", target: "door", action: "open" },
        { do: "sfx", sound: "doorOpen" },
        { do: "enter", actor: "lulu", at: "center", from: "back", style: "walk" },
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "face", actor: "momo", toward: "lulu" }
      ],
      lines: [
        { speaker: "narrator", key: "g09.open.1" },
        { speaker: "momo", key: "g09.open.2" },
        { speaker: "lulu", key: "g09.open.3" }
      ],
      words: [
        { wordId: "open", objectId: "door" },
        { wordId: "hi", objectId: "lulu" }
      ],
      holdMs: 1000,
      caregiverPromptKey: "g09.tip.2"
    },
    {
      id: "dance",
      kind: "event",
      camera: "medium",
      stage: [
        { do: "gesture", actor: "lulu", gesture: "dance" },
        { do: "gesture", actor: "momo", gesture: "happy" }
      ],
      reducedMotionStage: [
        { do: "gesture", actor: "lulu", gesture: "sway" },
        { do: "gesture", actor: "momo", gesture: "nod" }
      ],
      lines: [
        { speaker: "lulu", key: "g09.dance.1" },
        { speaker: "narrator", key: "g09.dance.2" }
      ],
      words: [{ wordId: "dance", objectId: "lulu" }],
      holdMs: 1500
    },
    {
      id: "bye",
      kind: "repeat",
      camera: "medium",
      stage: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "lulu", key: "g09.bye.1" },
        { speaker: "momo", key: "g09.bye.2" },
        { speaker: "momo", key: "g09.bye.3" }
      ],
      words: [
        { wordId: "bye", objectId: "lulu" },
        { wordId: "again", objectId: "momo" }
      ],
      holdMs: 600,
      input: { type: "more-or-done", targets: ["door", "lulu"] },
      waitMs: 5000,
      caregiverPromptKey: "g09.tip.2",
      response: {
        stage: [
          { do: "move", actor: "lulu", to: "back", style: "walk" },
          { do: "object", target: "door", action: "close" },
          { do: "gesture", actor: "momo", gesture: "nod" }
        ],
        lines: [],
        holdMs: 2400
      },
      responseByTarget: {
        door: {
          stage: [
            { do: "move", actor: "lulu", to: "back", style: "walk" },
            { do: "object", target: "door", action: "close" },
            { do: "gesture", actor: "momo", gesture: "nod" }
          ]
        },
        lulu: {
          stage: [
            { do: "gesture", actor: "lulu", gesture: "bow" },
            { do: "move", actor: "lulu", to: "back", style: "walk" },
            { do: "object", target: "door", action: "close" },
            { do: "gesture", actor: "momo", gesture: "happy" }
          ]
        }
      }
    }
  ],
  outro: [
    {
      id: "close",
      kind: "event",
      camera: "wide",
      stage: [
        { do: "hide", actor: "lulu" },
        { do: "hide", actor: "peeko" },
        { do: "hide", actor: "sheru" },
        { do: "object", target: "door", action: "close" },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "narrator", key: "g09.close.1" },
        { speaker: "momo", key: "g09.close.2" }
      ],
      words: [
        { wordId: "close", objectId: "door" },
        { wordId: "wave", objectId: "momo" },
        { wordId: "hi", objectId: "momo" }
      ],
      holdMs: 1500
    },
    {
      id: "all-done",
      kind: "outro",
      camera: "wide",
      stage: [
        { do: "music", bed: null },
        { do: "face", actor: "momo", toward: "viewer" },
        { do: "gesture", actor: "momo", gesture: "wave" }
      ],
      lines: [
        { speaker: "momo", key: "g09.all-done.1" },
        { speaker: "momo", key: "g09.all-done.2" }
      ],
      words: [
        { wordId: "all-done", objectId: "momo" },
        { wordId: "bye", objectId: "momo" }
      ],
      holdMs: 2500
    }
  ]
};
