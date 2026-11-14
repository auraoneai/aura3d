// Generated 9:16 Shorts cut from s01e04-roll-the-ball-again by tools/write-show.ts (PRD 09 B.4, E.9).
// Zero type assertions, zero network calls, zero child data.

import type { ShowSpec } from "../../types.js";

export const shorts: readonly ShowSpec[] = [
  {
    "kind": "show",
    "id": "s01e04-short-1-words",
    "code": "s01e04s1",
    "version": 1,
    "band": "little",
    "aspect": "9:16",
    "parentShowId": "s01e04-roll-the-ball-again",
    "calendarWeek": 4,
    "titleKey": "s01e04s1.title",
    "host": "gogo",
    "targetWords": [
      "ball"
    ],
    "supportWords": [
      "again",
      "go",
      "stop"
    ],
    "pauseMs": 3000,
    "estimatedDurationSec": 42,
    "endCardSec": 2,
    "offlinePlayKey": "s01e04s1.offline",
    "caregiverBridgeKey": "s01e04s1.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e04s1.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "station",
        "music": null,
        "transitionIn": "none",
        "cast": [
          {
            "id": "momo",
            "at": "left"
          },
          {
            "id": "gogo",
            "at": "right"
          },
          {
            "id": "sheru",
            "at": "frontLeft"
          }
        ],
        "props": [
          {
            "id": "station",
            "asset": "station",
            "at": "back"
          },
          {
            "id": "bench",
            "asset": "bench",
            "at": "farLeft"
          },
          {
            "id": "ball",
            "asset": "ball",
            "at": "center",
            "tint": "#d62f2f"
          },
          {
            "id": "cushion",
            "asset": "cushion",
            "at": "offLeft"
          },
          {
            "id": "butterfly",
            "asset": "butterfly",
            "at": "highRight"
          }
        ],
        "beats": [
          {
            "id": "b1-w2",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "exit",
                "actor": "sheru",
                "to": "offLeft",
                "style": "run"
              },
              {
                "do": "enter",
                "actor": "sheru",
                "at": "frontLeft",
                "from": "offLeft",
                "style": "walk"
              },
              {
                "do": "carry",
                "actor": "sheru",
                "item": "cushion"
              },
              {
                "do": "sfx",
                "sound": "woof"
              }
            ],
            "lines": [
              {
                "speaker": "narrator",
                "key": "s01e04s1.b1-w2.1"
              }
            ],
            "holdMs": 6313
          },
          {
            "id": "b2-w3",
            "kind": "invite",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "surprise"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e04s1.b2-w3.1"
              },
              {
                "speaker": "momo",
                "key": "s01e04s1.b2-w3.2"
              }
            ],
            "holdMs": 900,
            "input": {
              "type": "tap",
              "targets": [
                "gogo"
              ]
            },
            "pauseMs": 3000,
            "pauseCaptionKey": "s01e04s1.b2-w3.pause",
            "response": {
              "stage": [
                {
                  "do": "object",
                  "target": "ball",
                  "action": "bounce"
                },
                {
                  "do": "sfx",
                  "sound": "ding"
                },
                {
                  "do": "gesture",
                  "actor": "momo",
                  "gesture": "cheer"
                },
                {
                  "do": "gesture",
                  "actor": "sheru",
                  "gesture": "wag"
                }
              ],
              "lines": [
                {
                  "speaker": "momo",
                  "key": "s01e04s1.b2-w3.r1"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-w4",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "carry",
                "actor": "sheru",
                "item": null
              },
              {
                "do": "sfx",
                "sound": "woofSoft"
              },
              {
                "do": "gesture",
                "actor": "sheru",
                "gesture": "wag"
              }
            ],
            "lines": [
              {
                "speaker": "gogo",
                "key": "s01e04s1.b3-w4.1"
              }
            ],
            "holdMs": 5313
          },
          {
            "id": "b-outro",
            "kind": "outro",
            "camera": "medium",
            "stage": [
              {
                "do": "show",
                "actor": "gogo"
              },
              {
                "do": "enter",
                "actor": "gogo",
                "at": "center"
              },
              {
                "do": "face",
                "actor": "gogo",
                "toward": "viewer"
              },
              {
                "do": "gesture",
                "actor": "gogo",
                "gesture": "wave"
              }
            ],
            "lines": [
              {
                "speaker": "gogo",
                "key": "s01e04s1.b-outro.1"
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
                  "gogo"
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
    "id": "s01e04-short-2-song",
    "code": "s01e04s2",
    "version": 1,
    "band": "little",
    "aspect": "9:16",
    "parentShowId": "s01e04-roll-the-ball-again",
    "calendarWeek": 4,
    "titleKey": "s01e04s2.title",
    "host": "momo",
    "targetWords": [
      "roll"
    ],
    "supportWords": [
      "again",
      "go",
      "stop"
    ],
    "pauseMs": 3000,
    "estimatedDurationSec": 39,
    "endCardSec": 2,
    "offlinePlayKey": "s01e04s2.offline",
    "caregiverBridgeKey": "s01e04s2.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e04s2.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "station",
        "music": null,
        "transitionIn": "none",
        "cast": [
          {
            "id": "momo",
            "at": "left"
          },
          {
            "id": "gogo",
            "at": "right"
          },
          {
            "id": "sheru",
            "at": "frontLeft"
          }
        ],
        "props": [
          {
            "id": "station",
            "asset": "station",
            "at": "back"
          },
          {
            "id": "bench",
            "asset": "bench",
            "at": "farLeft"
          },
          {
            "id": "ball",
            "asset": "ball",
            "at": "center",
            "tint": "#d62f2f"
          }
        ],
        "beats": [
          {
            "id": "b1-sb2",
            "kind": "model",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "sway"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e04s2.b1-sb2.1"
              }
            ],
            "holdMs": 3313
          },
          {
            "id": "b2-sb3",
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
                "key": "s01e04s2.b2-sb3.1"
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
            "pauseCaptionKey": "s01e04s2.b2-sb3.pause",
            "response": {
              "stage": [
                {
                  "do": "gesture",
                  "actor": "momo",
                  "gesture": "cheer"
                },
                {
                  "do": "gesture",
                  "actor": "gogo",
                  "gesture": "sway"
                },
                {
                  "do": "sfx",
                  "sound": "sparkle"
                }
              ],
              "lines": [
                {
                  "speaker": "momo",
                  "key": "s01e04s2.b2-sb3.r1"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-sb4",
            "kind": "model",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "gogo",
                "gesture": "sway"
              },
              {
                "do": "gesture",
                "actor": "gogo",
                "gesture": "freeze"
              }
            ],
            "lines": [
              {
                "speaker": "gogo",
                "key": "s01e04s2.b3-sb4.1"
              },
              {
                "speaker": "momo",
                "key": "s01e04s2.b3-sb4.2"
              }
            ],
            "holdMs": 4313
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
                "key": "s01e04s2.b-outro.1"
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
    "id": "s01e04-short-3-surprise",
    "code": "s01e04s3",
    "version": 1,
    "band": "little",
    "aspect": "9:16",
    "parentShowId": "s01e04-roll-the-ball-again",
    "calendarWeek": 4,
    "titleKey": "s01e04s3.title",
    "host": "momo",
    "targetWords": [
      "ball"
    ],
    "supportWords": [
      "again",
      "go",
      "stop"
    ],
    "pauseMs": 3000,
    "estimatedDurationSec": 41,
    "endCardSec": 2,
    "offlinePlayKey": "s01e04s3.offline",
    "caregiverBridgeKey": "s01e04s3.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e04s3.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "station",
        "music": null,
        "transitionIn": "none",
        "cast": [
          {
            "id": "momo",
            "at": "left"
          },
          {
            "id": "gogo",
            "at": "right"
          },
          {
            "id": "sheru",
            "at": "backRight"
          }
        ],
        "props": [
          {
            "id": "station",
            "asset": "station",
            "at": "back"
          },
          {
            "id": "bench",
            "asset": "bench",
            "at": "farLeft"
          },
          {
            "id": "bush",
            "asset": "bush",
            "at": "backRight"
          },
          {
            "id": "ball",
            "asset": "ball",
            "at": "backRight",
            "tint": "#d62f2f"
          },
          {
            "id": "butterfly",
            "asset": "butterfly",
            "at": "highRight"
          }
        ],
        "beats": [
          {
            "id": "b1-su2",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "sfx",
                "sound": "rustle"
              },
              {
                "do": "object",
                "target": "bush",
                "action": "wobble"
              }
            ],
            "lines": [
              {
                "speaker": "narrator",
                "key": "s01e04s3.b1-su2.1"
              }
            ],
            "holdMs": 6313
          },
          {
            "id": "b2-su3",
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
                "key": "s01e04s3.b2-su3.1"
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
            "pauseCaptionKey": "s01e04s3.b2-su3.pause",
            "response": {
              "stage": [
                {
                  "do": "show",
                  "actor": "sheru"
                },
                {
                  "do": "gesture",
                  "actor": "sheru",
                  "gesture": "peek"
                },
                {
                  "do": "sfx",
                  "sound": "woofSoft"
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
                  "key": "s01e04s3.b2-su3.r1"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-su4",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "carry",
                "actor": "sheru",
                "item": "ball"
              },
              {
                "do": "move",
                "actor": "sheru",
                "to": "frontLeft",
                "style": "walk"
              },
              {
                "do": "sfx",
                "sound": "woofDouble"
              },
              {
                "do": "gesture",
                "actor": "sheru",
                "gesture": "happy"
              }
            ],
            "lines": [
              {
                "speaker": "gogo",
                "key": "s01e04s3.b3-su4.1"
              }
            ],
            "holdMs": 5313
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
                "key": "s01e04s3.b-outro.1"
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
  }
];
