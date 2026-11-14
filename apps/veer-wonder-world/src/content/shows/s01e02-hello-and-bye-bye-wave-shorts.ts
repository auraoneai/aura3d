// Generated 9:16 Shorts cut from s01e02-hello-and-bye-bye-wave by tools/write-show.ts (PRD 09 B.4, E.9).
// Zero type assertions, zero network calls, zero child data.

import type { ShowSpec } from "../../types.js";

export const shorts: readonly ShowSpec[] = [
  {
    "kind": "show",
    "id": "s01e02-short-1-wordgame",
    "code": "s01e02s1",
    "version": 1,
    "band": "little",
    "aspect": "9:16",
    "parentShowId": "s01e02-hello-and-bye-bye-wave",
    "calendarWeek": 2,
    "titleKey": "s01e02s1.title",
    "host": "momo",
    "targetWords": [
      "hi"
    ],
    "supportWords": [
      "hello",
      "wave",
      "door"
    ],
    "pauseMs": 3000,
    "estimatedDurationSec": 40,
    "endCardSec": 2,
    "offlinePlayKey": "s01e02s1.offline",
    "caregiverBridgeKey": "s01e02s1.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e02s1.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "peekaboo-barn",
        "music": "barnBed",
        "transitionIn": "none",
        "cast": [
          {
            "id": "momo",
            "at": "center"
          },
          {
            "id": "lulu",
            "at": "right"
          },
          {
            "id": "peeko",
            "at": "offRight",
            "hidden": true
          }
        ],
        "props": [
          {
            "id": "barn1",
            "asset": "barn",
            "at": "back"
          },
          {
            "id": "door2",
            "asset": "door",
            "at": "center"
          },
          {
            "id": "cow1",
            "asset": "cow",
            "at": "right"
          },
          {
            "id": "drum1",
            "asset": "drum",
            "at": "left"
          }
        ],
        "beats": [
          {
            "id": "b1-s4-guess",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "shrug"
              },
              {
                "do": "move",
                "actor": "lulu",
                "to": "frontRight",
                "style": "hop"
              },
              {
                "do": "gesture",
                "actor": "lulu",
                "gesture": "wave"
              },
              {
                "do": "object",
                "target": "cow1",
                "action": "wobble"
              },
              {
                "do": "sfx",
                "sound": "moo"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e02s1.b1-s4-guess.1"
              },
              {
                "speaker": "lulu",
                "key": "s01e02s1.b1-s4-guess.2"
              },
              {
                "speaker": "momo",
                "key": "s01e02s1.b1-s4-guess.3"
              }
            ],
            "holdMs": 1076
          },
          {
            "id": "b2-s4-find",
            "kind": "invite",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "look"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e02s1.b2-s4-find.1"
              }
            ],
            "holdMs": 900,
            "input": {
              "type": "tap",
              "targets": [
                "momo"
              ]
            },
            "pauseMs": 3000,
            "pauseCaptionKey": "s01e02s1.b2-s4-find.pause",
            "response": {
              "stage": [
                {
                  "do": "gesture",
                  "actor": "momo",
                  "gesture": "point"
                },
                {
                  "do": "object",
                  "target": "door2",
                  "action": "glow"
                },
                {
                  "do": "move",
                  "actor": "lulu",
                  "to": "frontLeft",
                  "style": "hop"
                }
              ],
              "lines": [
                {
                  "speaker": "momo",
                  "key": "s01e02s1.b2-s4-find.r1"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-s4-knock",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "sfx",
                "sound": "clack"
              },
              {
                "do": "sfx",
                "sound": "clack"
              },
              {
                "do": "object",
                "target": "door2",
                "action": "open"
              },
              {
                "do": "sfx",
                "sound": "doorOpen"
              },
              {
                "do": "enter",
                "actor": "peeko",
                "at": "back",
                "from": "backLeft",
                "style": "hop"
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
                "key": "s01e02s1.b3-s4-knock.1"
              },
              {
                "speaker": "peeko",
                "key": "s01e02s1.b3-s4-knock.2"
              }
            ],
            "holdMs": 3076
          },
          {
            "id": "b-outro",
            "kind": "outro",
            "camera": "medium",
            "stage": [
              {
                "do": "show",
                "actor": "momo"
              },
              {
                "do": "enter",
                "actor": "momo",
                "at": "center"
              },
              {
                "do": "face",
                "actor": "momo",
                "toward": "viewer"
              },
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "wave"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e02s1.b-outro.1"
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
                  "momo"
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
    "id": "s01e02-short-2-songbreak",
    "code": "s01e02s2",
    "version": 1,
    "band": "little",
    "aspect": "9:16",
    "parentShowId": "s01e02-hello-and-bye-bye-wave",
    "calendarWeek": 2,
    "titleKey": "s01e02s2.title",
    "host": "momo",
    "targetWords": [
      "hi"
    ],
    "supportWords": [
      "hello",
      "wave",
      "door"
    ],
    "pauseMs": 3000,
    "estimatedDurationSec": 42,
    "endCardSec": 2,
    "offlinePlayKey": "s01e02s2.offline",
    "caregiverBridgeKey": "s01e02s2.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e02s2.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "peekaboo-barn",
        "music": "barnBed",
        "transitionIn": "none",
        "cast": [
          {
            "id": "momo",
            "at": "center"
          },
          {
            "id": "lulu",
            "at": "right"
          },
          {
            "id": "peeko",
            "at": "offRight",
            "hidden": true
          }
        ],
        "props": [
          {
            "id": "barn1",
            "asset": "barn",
            "at": "back"
          },
          {
            "id": "bench1",
            "asset": "bench",
            "at": "farRight"
          }
        ],
        "beats": [
          {
            "id": "b1-s5-model",
            "kind": "model",
            "camera": "medium",
            "stage": [
              {
                "do": "enter",
                "actor": "lulu",
                "at": "right"
              },
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "wave"
              },
              {
                "do": "gesture",
                "actor": "lulu",
                "gesture": "wave"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e02s2.b1-s5-model.1"
              },
              {
                "speaker": "lulu",
                "key": "s01e02s2.b1-s5-model.2"
              }
            ],
            "holdMs": 3076
          },
          {
            "id": "b2-s5-turn",
            "kind": "invite",
            "camera": "medium",
            "stage": [
              {
                "do": "face",
                "actor": "momo",
                "toward": "viewer"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e02s2.b2-s5-turn.1"
              }
            ],
            "holdMs": 900,
            "input": {
              "type": "tap",
              "targets": [
                "momo"
              ]
            },
            "pauseMs": 3000,
            "pauseCaptionKey": "s01e02s2.b2-s5-turn.pause",
            "response": {
              "stage": [
                {
                  "do": "gesture",
                  "actor": "lulu",
                  "gesture": "wave"
                },
                {
                  "do": "gesture",
                  "actor": "momo",
                  "gesture": "cheer"
                }
              ],
              "lines": [
                {
                  "speaker": "lulu",
                  "key": "s01e02s2.b2-s5-turn.r1"
                },
                {
                  "speaker": "momo",
                  "key": "s01e02s2.b2-s5-turn.r2"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-s5-bye-model",
            "kind": "model",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "wave"
              },
              {
                "do": "gesture",
                "actor": "lulu",
                "gesture": "wave"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e02s2.b3-s5-bye-model.1"
              },
              {
                "speaker": "lulu",
                "key": "s01e02s2.b3-s5-bye-model.2"
              }
            ],
            "holdMs": 3076
          },
          {
            "id": "b-outro",
            "kind": "outro",
            "camera": "medium",
            "stage": [
              {
                "do": "show",
                "actor": "momo"
              },
              {
                "do": "enter",
                "actor": "momo",
                "at": "center"
              },
              {
                "do": "face",
                "actor": "momo",
                "toward": "viewer"
              },
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "wave"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e02s2.b-outro.1"
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
                  "momo"
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
    "id": "s01e02-short-3-surprise",
    "code": "s01e02s3",
    "version": 1,
    "band": "little",
    "aspect": "9:16",
    "parentShowId": "s01e02-hello-and-bye-bye-wave",
    "calendarWeek": 2,
    "titleKey": "s01e02s3.title",
    "host": "momo",
    "targetWords": [
      "hi"
    ],
    "supportWords": [
      "hello",
      "wave",
      "door"
    ],
    "pauseMs": 3000,
    "estimatedDurationSec": 45,
    "endCardSec": 2,
    "offlinePlayKey": "s01e02s3.offline",
    "caregiverBridgeKey": "s01e02s3.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e02s3.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "peekaboo-barn",
        "music": "barnBed",
        "transitionIn": "none",
        "cast": [
          {
            "id": "momo",
            "at": "center"
          },
          {
            "id": "lulu",
            "at": "right"
          },
          {
            "id": "peeko",
            "at": "offRight",
            "hidden": true
          }
        ],
        "props": [
          {
            "id": "barn1",
            "asset": "barn",
            "at": "back"
          },
          {
            "id": "door2",
            "asset": "door",
            "at": "center"
          },
          {
            "id": "bush1",
            "asset": "bush",
            "at": "backLeft"
          },
          {
            "id": "teddy1",
            "asset": "teddy",
            "at": "frontRight"
          }
        ],
        "beats": [
          {
            "id": "b1-s6-rustle",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "enter",
                "actor": "lulu",
                "at": "right"
              },
              {
                "do": "sfx",
                "sound": "rustle"
              },
              {
                "do": "object",
                "target": "bush1",
                "action": "wobble"
              },
              {
                "do": "gesture",
                "actor": "lulu",
                "gesture": "look"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e02s3.b1-s6-rustle.1"
              },
              {
                "speaker": "lulu",
                "key": "s01e02s3.b1-s6-rustle.2"
              }
            ],
            "holdMs": 2076
          },
          {
            "id": "b2-s6-spot",
            "kind": "invite",
            "camera": "close",
            "stage": [
              {
                "do": "camera",
                "preset": "close"
              },
              {
                "do": "enter",
                "actor": "peeko",
                "at": "backLeft",
                "from": "offLeft",
                "style": "slide"
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
                "key": "s01e02s3.b2-s6-spot.1"
              }
            ],
            "holdMs": 900,
            "input": {
              "type": "tap",
              "targets": [
                "peeko"
              ]
            },
            "pauseMs": 3000,
            "pauseCaptionKey": "s01e02s3.b2-s6-spot.pause",
            "response": {
              "stage": [
                {
                  "do": "gesture",
                  "actor": "peeko",
                  "gesture": "happy"
                },
                {
                  "do": "gesture",
                  "actor": "momo",
                  "gesture": "cheer"
                }
              ],
              "lines": [
                {
                  "speaker": "peeko",
                  "key": "s01e02s3.b2-s6-spot.r1"
                },
                {
                  "speaker": "momo",
                  "key": "s01e02s3.b2-s6-spot.r2"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-s6-proper",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "move",
                "actor": "peeko",
                "to": "back",
                "style": "hop"
              },
              {
                "do": "object",
                "target": "door2",
                "action": "open"
              },
              {
                "do": "sfx",
                "sound": "doorOpen"
              },
              {
                "do": "gesture",
                "actor": "peeko",
                "gesture": "peek"
              },
              {
                "do": "gesture",
                "actor": "lulu",
                "gesture": "wave"
              },
              {
                "do": "sfx",
                "sound": "giggle"
              }
            ],
            "lines": [
              {
                "speaker": "peeko",
                "key": "s01e02s3.b3-s6-proper.1"
              },
              {
                "speaker": "lulu",
                "key": "s01e02s3.b3-s6-proper.2"
              },
              {
                "speaker": "momo",
                "key": "s01e02s3.b3-s6-proper.3"
              },
              {
                "speaker": "lulu",
                "key": "s01e02s3.b3-s6-proper.4"
              }
            ],
            "holdMs": 3076
          },
          {
            "id": "b-outro",
            "kind": "outro",
            "camera": "medium",
            "stage": [
              {
                "do": "show",
                "actor": "momo"
              },
              {
                "do": "enter",
                "actor": "momo",
                "at": "center"
              },
              {
                "do": "face",
                "actor": "momo",
                "toward": "viewer"
              },
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "wave"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e02s3.b-outro.1"
              }
            ],
            "holdMs": 1200
          },
          {
            "id": "b-sting",
            "kind": "song",
            "camera": "medium",
            "stage": [
              {
                "do": "song",
                "song": "wonderThemeShort",
                "performers": [
                  "momo"
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
  }
];
