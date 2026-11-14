// Generated 9:16 Shorts cut from s01e05-open-the-surprise-box by tools/write-show.ts (PRD 09 B.4, E.9).
// Zero type assertions, zero network calls, zero child data.

import type { ShowSpec } from "../../types.js";

export const shorts: readonly ShowSpec[] = [
  {
    "kind": "show",
    "id": "s01e05-short-1-wordgame",
    "code": "s01e05s1",
    "version": 1,
    "band": "toddler",
    "aspect": "9:16",
    "parentShowId": "s01e05-open-the-surprise-box",
    "calendarWeek": 5,
    "titleKey": "s01e05s1.title",
    "host": "peeko",
    "targetWords": [
      "box"
    ],
    "supportWords": [
      "teddy",
      "look",
      "uh-oh"
    ],
    "pauseMs": 2500,
    "estimatedDurationSec": 45,
    "endCardSec": 2,
    "offlinePlayKey": "s01e05s1.offline",
    "caregiverBridgeKey": "s01e05s1.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e05s1.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "peekaboo-barn",
        "music": null,
        "transitionIn": "none",
        "cast": [
          {
            "id": "peeko",
            "at": "center"
          },
          {
            "id": "momo",
            "at": "offLeft"
          },
          {
            "id": "sheru",
            "at": "offRight"
          }
        ],
        "props": [
          {
            "id": "barn",
            "asset": "barn",
            "at": "back"
          },
          {
            "id": "boxRed",
            "asset": "toyBox",
            "at": "frontLeft",
            "tint": "#e5484d"
          },
          {
            "id": "boxBlue",
            "asset": "toyBox",
            "at": "front",
            "tint": "#3b82f6"
          },
          {
            "id": "boxGreen",
            "asset": "toyBox",
            "at": "frontRight",
            "tint": "#3fb950",
            "size": 0.7
          },
          {
            "id": "teddy",
            "asset": "teddy",
            "at": "frontLeft",
            "hidden": true
          },
          {
            "id": "ball",
            "asset": "ball",
            "at": "front",
            "hidden": true
          },
          {
            "id": "cow",
            "asset": "cow",
            "at": "highLeft",
            "hidden": true
          },
          {
            "id": "sponge",
            "asset": "sponge",
            "at": "offRight",
            "hidden": true
          }
        ],
        "beats": [
          {
            "id": "b1-s4-cow",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "enter",
                "actor": "momo",
                "at": "right"
              },
              {
                "do": "show",
                "actor": "cow"
              },
              {
                "do": "sfx",
                "sound": "moo"
              },
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "surprise"
              },
              {
                "do": "sfx",
                "sound": "giggle"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e05s1.b1-s4-cow.1"
              },
              {
                "speaker": "peeko",
                "key": "s01e05s1.b1-s4-cow.2"
              }
            ],
            "holdMs": 8433
          },
          {
            "id": "b2-s4-guess",
            "kind": "invite",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "peeko",
                "gesture": "point"
              }
            ],
            "lines": [
              {
                "speaker": "peeko",
                "key": "s01e05s1.b2-s4-guess.1"
              }
            ],
            "holdMs": 1433,
            "input": {
              "type": "tap",
              "targets": [
                "peeko"
              ]
            },
            "pauseMs": 2500,
            "pauseCaptionKey": "s01e05s1.b2-s4-guess.pause",
            "response": {
              "stage": [
                {
                  "do": "hide",
                  "actor": "cow"
                },
                {
                  "do": "object",
                  "target": "boxBlue",
                  "action": "open"
                },
                {
                  "do": "sfx",
                  "sound": "pop"
                },
                {
                  "do": "show",
                  "actor": "ball"
                }
              ],
              "lines": [
                {
                  "speaker": "peeko",
                  "key": "s01e05s1.b2-s4-guess.r1"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-s4-ball",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "object",
                "target": "ball",
                "action": "bounce"
              },
              {
                "do": "sfx",
                "sound": "boing"
              },
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "cheer"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e05s1.b3-s4-ball.1"
              },
              {
                "speaker": "peeko",
                "key": "s01e05s1.b3-s4-ball.2"
              }
            ],
            "holdMs": 7933
          },
          {
            "id": "b-outro",
            "kind": "outro",
            "camera": "medium",
            "stage": [
              {
                "do": "show",
                "actor": "peeko"
              },
              {
                "do": "enter",
                "actor": "peeko",
                "at": "center"
              },
              {
                "do": "face",
                "actor": "peeko",
                "toward": "viewer"
              },
              {
                "do": "gesture",
                "actor": "peeko",
                "gesture": "wave"
              }
            ],
            "lines": [
              {
                "speaker": "peeko",
                "key": "s01e05s1.b-outro.1"
              }
            ],
            "holdMs": 1200
          }
        ]
      }
    ],
    "review": {
      "language": "approved",
      "rights": "approved",
      "reviewer": "writers-room-verified",
      "date": "2026-11-13"
    }
  },
  {
    "kind": "show",
    "id": "s01e05-short-2-songbreak",
    "code": "s01e05s2",
    "version": 1,
    "band": "toddler",
    "aspect": "9:16",
    "parentShowId": "s01e05-open-the-surprise-box",
    "calendarWeek": 5,
    "titleKey": "s01e05s2.title",
    "host": "peeko",
    "targetWords": [
      "open"
    ],
    "supportWords": [
      "teddy",
      "look",
      "uh-oh"
    ],
    "pauseMs": 2500,
    "estimatedDurationSec": 46,
    "endCardSec": 2,
    "offlinePlayKey": "s01e05s2.offline",
    "caregiverBridgeKey": "s01e05s2.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e05s2.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "meadow",
        "music": null,
        "transitionIn": "none",
        "cast": [
          {
            "id": "peeko",
            "at": "center"
          },
          {
            "id": "momo",
            "at": "offLeft"
          },
          {
            "id": "sheru",
            "at": "offRight"
          }
        ],
        "props": [
          {
            "id": "tree",
            "asset": "tree",
            "at": "farLeft"
          },
          {
            "id": "flower",
            "asset": "flower",
            "at": "left"
          },
          {
            "id": "bush",
            "asset": "bush",
            "at": "backRight"
          },
          {
            "id": "boxGreen",
            "asset": "toyBox",
            "at": "front",
            "tint": "#3fb950",
            "size": 0.7
          }
        ],
        "beats": [
          {
            "id": "b1-s5-peek",
            "kind": "model",
            "camera": "medium",
            "stage": [
              {
                "do": "enter",
                "actor": "momo",
                "at": "right"
              },
              {
                "do": "object",
                "target": "boxGreen",
                "action": "open"
              },
              {
                "do": "sfx",
                "sound": "pop"
              },
              {
                "do": "gesture",
                "actor": "peeko",
                "gesture": "peek"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e05s2.b1-s5-peek.1"
              }
            ],
            "holdMs": 3933
          },
          {
            "id": "b2-s5-turn",
            "kind": "invite",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "point"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e05s2.b2-s5-turn.1"
              }
            ],
            "holdMs": 1433,
            "input": {
              "type": "tap",
              "targets": [
                "peeko"
              ]
            },
            "pauseMs": 2500,
            "pauseCaptionKey": "s01e05s2.b2-s5-turn.pause",
            "response": {
              "stage": [
                {
                  "do": "gesture",
                  "actor": "peeko",
                  "gesture": "peek"
                },
                {
                  "do": "sfx",
                  "sound": "ding"
                }
              ],
              "lines": [
                {
                  "speaker": "peeko",
                  "key": "s01e05s2.b2-s5-turn.r1"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-s5-song",
            "kind": "song",
            "camera": "medium",
            "stage": [
              {
                "do": "music",
                "bed": null
              },
              {
                "do": "camera",
                "preset": "medium"
              },
              {
                "do": "song",
                "song": "peekaboo",
                "performers": [
                  "peeko",
                  "momo",
                  "sheru"
                ]
              }
            ],
            "lines": [],
            "holdMs": 16000
          },
          {
            "id": "b-outro",
            "kind": "outro",
            "camera": "medium",
            "stage": [
              {
                "do": "show",
                "actor": "peeko"
              },
              {
                "do": "enter",
                "actor": "peeko",
                "at": "center"
              },
              {
                "do": "face",
                "actor": "peeko",
                "toward": "viewer"
              },
              {
                "do": "gesture",
                "actor": "peeko",
                "gesture": "wave"
              }
            ],
            "lines": [
              {
                "speaker": "peeko",
                "key": "s01e05s2.b-outro.1"
              }
            ],
            "holdMs": 1200
          },
          {
            "id": "b-sting",
            "kind": "song",
            "camera": "wide",
            "stage": [
              {
                "do": "song",
                "song": "wonderThemeShort",
                "performers": [
                  "peeko"
                ]
              }
            ],
            "lines": [],
            "holdMs": 8000
          }
        ]
      }
    ],
    "review": {
      "language": "approved",
      "rights": "approved",
      "reviewer": "writers-room-verified",
      "date": "2026-11-13"
    }
  },
  {
    "kind": "show",
    "id": "s01e05-short-3-surprise",
    "code": "s01e05s3",
    "version": 1,
    "band": "toddler",
    "aspect": "9:16",
    "parentShowId": "s01e05-open-the-surprise-box",
    "calendarWeek": 5,
    "titleKey": "s01e05s3.title",
    "host": "peeko",
    "targetWords": [
      "open"
    ],
    "supportWords": [
      "teddy",
      "look",
      "uh-oh"
    ],
    "pauseMs": 2500,
    "estimatedDurationSec": 44,
    "endCardSec": 2,
    "offlinePlayKey": "s01e05s3.offline",
    "caregiverBridgeKey": "s01e05s3.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e05s3.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "meadow",
        "music": null,
        "transitionIn": "none",
        "cast": [
          {
            "id": "peeko",
            "at": "center"
          },
          {
            "id": "momo",
            "at": "offLeft"
          },
          {
            "id": "sheru",
            "at": "offRight"
          }
        ],
        "props": [
          {
            "id": "tree",
            "asset": "tree",
            "at": "farLeft"
          },
          {
            "id": "bush",
            "asset": "bush",
            "at": "backRight"
          },
          {
            "id": "boxGreen",
            "asset": "toyBox",
            "at": "back",
            "tint": "#3fb950",
            "size": 0.7
          },
          {
            "id": "duck",
            "asset": "duck",
            "at": "back",
            "hidden": true
          }
        ],
        "beats": [
          {
            "id": "b1-s6-rustle",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "music",
                "bed": "meadowBed"
              },
              {
                "do": "camera",
                "preset": "medium"
              },
              {
                "do": "enter",
                "actor": "momo",
                "at": "left",
                "from": "offLeft",
                "style": "walk"
              },
              {
                "do": "enter",
                "actor": "sheru",
                "at": "right",
                "from": "offRight",
                "style": "walk"
              },
              {
                "do": "enter",
                "actor": "peeko",
                "at": "back",
                "from": "backRight",
                "style": "walk"
              },
              {
                "do": "gesture",
                "actor": "peeko",
                "gesture": "hide"
              },
              {
                "do": "sfx",
                "sound": "rustle"
              },
              {
                "do": "object",
                "target": "boxGreen",
                "action": "wobble"
              },
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "look"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e05s3.b1-s6-rustle.1"
              },
              {
                "speaker": "momo",
                "key": "s01e05s3.b1-s6-rustle.2"
              }
            ],
            "holdMs": 8933
          },
          {
            "id": "b2-s6-spot",
            "kind": "invite",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "point"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e05s3.b2-s6-spot.1"
              }
            ],
            "holdMs": 1433,
            "input": {
              "type": "tap",
              "targets": [
                "sheru"
              ]
            },
            "pauseMs": 2500,
            "pauseCaptionKey": "s01e05s3.b2-s6-spot.pause",
            "response": {
              "stage": [
                {
                  "do": "gesture",
                  "actor": "sheru",
                  "gesture": "sniff"
                },
                {
                  "do": "sfx",
                  "sound": "sniffs"
                }
              ],
              "lines": [
                {
                  "speaker": "momo",
                  "key": "s01e05s3.b2-s6-spot.r1"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-s6-feather",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "sfx",
                "sound": "giggle"
              },
              {
                "do": "gesture",
                "actor": "peeko",
                "gesture": "peek"
              },
              {
                "do": "sfx",
                "sound": "woofSoft"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e05s3.b3-s6-feather.1"
              },
              {
                "speaker": "peeko",
                "key": "s01e05s3.b3-s6-feather.2"
              }
            ],
            "holdMs": 8433
          },
          {
            "id": "b-outro",
            "kind": "outro",
            "camera": "medium",
            "stage": [
              {
                "do": "show",
                "actor": "peeko"
              },
              {
                "do": "enter",
                "actor": "peeko",
                "at": "center"
              },
              {
                "do": "face",
                "actor": "peeko",
                "toward": "viewer"
              },
              {
                "do": "gesture",
                "actor": "peeko",
                "gesture": "wave"
              }
            ],
            "lines": [
              {
                "speaker": "peeko",
                "key": "s01e05s3.b-outro.1"
              }
            ],
            "holdMs": 1200
          }
        ]
      }
    ],
    "review": {
      "language": "approved",
      "rights": "approved",
      "reviewer": "writers-room-verified",
      "date": "2026-11-13"
    }
  }
];
