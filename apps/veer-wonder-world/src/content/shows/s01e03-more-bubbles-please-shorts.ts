// Generated 9:16 Shorts cut from s01e03-more-bubbles-please by tools/write-show.ts (PRD 09 B.4, E.9).
// Zero type assertions, zero network calls, zero child data.

import type { ShowSpec } from "../../types.js";

export const shorts: readonly ShowSpec[] = [
  {
    "kind": "show",
    "id": "s01e03-short-1-words",
    "code": "s01e03s1",
    "version": 1,
    "band": "little",
    "aspect": "9:16",
    "parentShowId": "s01e03-more-bubbles-please",
    "calendarWeek": 3,
    "titleKey": "s01e03s1.title",
    "host": "momo",
    "targetWords": [
      "bubble"
    ],
    "supportWords": [
      "pop",
      "again",
      "up"
    ],
    "pauseMs": 3000,
    "estimatedDurationSec": 50,
    "endCardSec": 2,
    "offlinePlayKey": "s01e03s1.offline",
    "caregiverBridgeKey": "s01e03s1.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e03s1.ch.s1",
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
            "id": "momo",
            "at": "center"
          },
          {
            "id": "sheru",
            "at": "offRight"
          },
          {
            "id": "lumi",
            "at": "offTop"
          }
        ],
        "props": [
          {
            "id": "sponge",
            "asset": "sponge",
            "at": "frontLeft"
          },
          {
            "id": "bubbleWand",
            "asset": "bubbleWand",
            "at": "frontRight"
          },
          {
            "id": "bubble",
            "asset": "bubble",
            "at": "high"
          }
        ],
        "beats": [
          {
            "id": "b1-s4-b2",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "enter",
                "actor": "sheru",
                "at": "left",
                "from": "offLeft",
                "style": "hop"
              },
              {
                "do": "show",
                "actor": "sponge"
              },
              {
                "do": "carry",
                "actor": "sheru",
                "item": "sponge"
              },
              {
                "do": "sfx",
                "sound": "squeak"
              },
              {
                "do": "gesture",
                "actor": "sheru",
                "gesture": "happy"
              }
            ],
            "lines": [
              {
                "speaker": "narrator",
                "key": "s01e03s1.b1-s4-b2.1"
              },
              {
                "speaker": "momo",
                "key": "s01e03s1.b1-s4-b2.2"
              }
            ],
            "holdMs": 10102
          },
          {
            "id": "b2-s4-b3",
            "kind": "invite",
            "camera": "close",
            "stage": [
              {
                "do": "camera",
                "preset": "close"
              },
              {
                "do": "enter",
                "actor": "lumi",
                "at": "highRight",
                "from": "offTop",
                "style": "float"
              },
              {
                "do": "show",
                "actor": "bubbleWand"
              },
              {
                "do": "carry",
                "actor": "lumi",
                "item": "bubbleWand"
              },
              {
                "do": "sfx",
                "sound": "sparkle"
              }
            ],
            "lines": [
              {
                "speaker": "lumi",
                "key": "s01e03s1.b2-s4-b3.1"
              },
              {
                "speaker": "momo",
                "key": "s01e03s1.b2-s4-b3.2"
              }
            ],
            "holdMs": 4102,
            "input": {
              "type": "tap",
              "targets": [
                "lumi"
              ]
            },
            "pauseMs": 3000,
            "pauseCaptionKey": "s01e03s1.b2-s4-b3.pause",
            "response": {
              "stage": [
                {
                  "do": "object",
                  "target": "bubbleWand",
                  "action": "glow"
                },
                {
                  "do": "gesture",
                  "actor": "lumi",
                  "gesture": "twinkle"
                }
              ],
              "lines": [
                {
                  "speaker": "lumi",
                  "key": "s01e03s1.b2-s4-b3.r1"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-s4-b4",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "carry",
                "actor": "sheru",
                "item": null
              },
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "happy"
              },
              {
                "do": "sfx",
                "sound": "bubbleBlow"
              },
              {
                "do": "show",
                "actor": "bubble"
              },
              {
                "do": "object",
                "target": "bubble",
                "action": "rise"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e03s1.b3-s4-b4.1"
              },
              {
                "speaker": "momo",
                "key": "s01e03s1.b3-s4-b4.2"
              }
            ],
            "holdMs": 10102
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
                "key": "s01e03s1.b-outro.1"
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
    "id": "s01e03-short-2-song",
    "code": "s01e03s2",
    "version": 1,
    "band": "little",
    "aspect": "9:16",
    "parentShowId": "s01e03-more-bubbles-please",
    "calendarWeek": 3,
    "titleKey": "s01e03s2.title",
    "host": "momo",
    "targetWords": [
      "bubble"
    ],
    "supportWords": [
      "pop",
      "again",
      "up"
    ],
    "pauseMs": 3000,
    "estimatedDurationSec": 45,
    "endCardSec": 2,
    "offlinePlayKey": "s01e03s2.offline",
    "caregiverBridgeKey": "s01e03s2.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e03s2.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "music-garden",
        "music": null,
        "transitionIn": "none",
        "cast": [
          {
            "id": "momo",
            "at": "center"
          },
          {
            "id": "sheru",
            "at": "offLeft"
          },
          {
            "id": "lumi",
            "at": "offTop"
          }
        ],
        "props": [],
        "beats": [
          {
            "id": "b1-s5-b2",
            "kind": "model",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "point"
              },
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "clap"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e03s2.b1-s5-b2.1"
              },
              {
                "speaker": "momo",
                "key": "s01e03s2.b1-s5-b2.2"
              }
            ],
            "holdMs": 10102
          },
          {
            "id": "b2-s5-b3",
            "kind": "invite",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "wait"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e03s2.b2-s5-b3.1"
              }
            ],
            "holdMs": 4102,
            "input": {
              "type": "tap",
              "targets": [
                "momo"
              ]
            },
            "pauseMs": 3000,
            "pauseCaptionKey": "s01e03s2.b2-s5-b3.pause",
            "response": {
              "stage": [
                {
                  "do": "gesture",
                  "actor": "momo",
                  "gesture": "clap"
                },
                {
                  "do": "sfx",
                  "sound": "pop"
                }
              ],
              "lines": [
                {
                  "speaker": "momo",
                  "key": "s01e03s2.b2-s5-b3.r1"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-s5-b4",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "enter",
                "actor": "lumi",
                "at": "right"
              },
              {
                "do": "gesture",
                "actor": "lumi",
                "gesture": "glow"
              },
              {
                "do": "gesture",
                "actor": "sheru",
                "gesture": "wag"
              }
            ],
            "lines": [
              {
                "speaker": "lumi",
                "key": "s01e03s2.b3-s5-b4.1"
              },
              {
                "speaker": "momo",
                "key": "s01e03s2.b3-s5-b4.2"
              }
            ],
            "holdMs": 8102
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
                "key": "s01e03s2.b-outro.1"
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
    "id": "s01e03-short-3-surprise",
    "code": "s01e03s3",
    "version": 1,
    "band": "little",
    "aspect": "9:16",
    "parentShowId": "s01e03-more-bubbles-please",
    "calendarWeek": 3,
    "titleKey": "s01e03s3.title",
    "host": "momo",
    "targetWords": [
      "more"
    ],
    "supportWords": [
      "pop",
      "again",
      "up"
    ],
    "pauseMs": 3000,
    "estimatedDurationSec": 48,
    "endCardSec": 2,
    "offlinePlayKey": "s01e03s3.offline",
    "caregiverBridgeKey": "s01e03s3.bridge",
    "chapters": [
      {
        "segmentId": "s1",
        "titleKey": "s01e03s3.ch.s1",
        "atSec": 0
      }
    ],
    "segments": [
      {
        "id": "s1",
        "template": "shortMoment",
        "world": "music-garden",
        "music": null,
        "transitionIn": "none",
        "cast": [
          {
            "id": "momo",
            "at": "center"
          },
          {
            "id": "sheru",
            "at": "offLeft"
          },
          {
            "id": "lumi",
            "at": "offRight"
          }
        ],
        "props": [
          {
            "id": "bush",
            "asset": "bush",
            "at": "backRight"
          },
          {
            "id": "bubble",
            "asset": "bubble",
            "at": "high"
          }
        ],
        "beats": [
          {
            "id": "b1-s6-b1",
            "kind": "hook",
            "camera": "medium",
            "stage": [
              {
                "do": "camera",
                "preset": "medium"
              },
              {
                "do": "enter",
                "actor": "momo",
                "at": "center",
                "from": "offLeft",
                "style": "walk"
              },
              {
                "do": "enter",
                "actor": "sheru",
                "at": "left",
                "from": "offLeft",
                "style": "hop"
              },
              {
                "do": "enter",
                "actor": "lumi",
                "at": "backRight",
                "from": "offRight",
                "style": "float"
              },
              {
                "do": "show",
                "actor": "bush"
              },
              {
                "do": "sfx",
                "sound": "rustle"
              },
              {
                "do": "gesture",
                "actor": "lumi",
                "gesture": "peek"
              },
              {
                "do": "gesture",
                "actor": "sheru",
                "gesture": "look"
              }
            ],
            "lines": [
              {
                "speaker": "narrator",
                "key": "s01e03s3.b1-s6-b1.1"
              },
              {
                "speaker": "momo",
                "key": "s01e03s3.b1-s6-b1.2"
              }
            ],
            "holdMs": 8102
          },
          {
            "id": "b2-s6-b2",
            "kind": "invite",
            "camera": "medium",
            "stage": [
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "look"
              },
              {
                "do": "gesture",
                "actor": "lumi",
                "gesture": "peek"
              }
            ],
            "lines": [
              {
                "speaker": "momo",
                "key": "s01e03s3.b2-s6-b2.1"
              }
            ],
            "holdMs": 5102,
            "input": {
              "type": "tap",
              "targets": [
                "lumi"
              ]
            },
            "pauseMs": 3000,
            "pauseCaptionKey": "s01e03s3.b2-s6-b2.pause",
            "response": {
              "stage": [
                {
                  "do": "sfx",
                  "sound": "sparkle"
                },
                {
                  "do": "gesture",
                  "actor": "lumi",
                  "gesture": "glow"
                },
                {
                  "do": "show",
                  "actor": "bubble"
                },
                {
                  "do": "object",
                  "target": "bubble",
                  "action": "grow"
                }
              ],
              "lines": [
                {
                  "speaker": "lumi",
                  "key": "s01e03s3.b2-s6-b2.r1"
                }
              ],
              "holdMs": 800
            }
          },
          {
            "id": "b3-s6-b3",
            "kind": "event",
            "camera": "medium",
            "stage": [
              {
                "do": "move",
                "actor": "lumi",
                "to": "right",
                "style": "float"
              },
              {
                "do": "sfx",
                "sound": "tada"
              },
              {
                "do": "gesture",
                "actor": "momo",
                "gesture": "surprise"
              },
              {
                "do": "gesture",
                "actor": "sheru",
                "gesture": "hop"
              }
            ],
            "lines": [
              {
                "speaker": "lumi",
                "key": "s01e03s3.b3-s6-b3.1"
              },
              {
                "speaker": "momo",
                "key": "s01e03s3.b3-s6-b3.2"
              }
            ],
            "holdMs": 10102
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
                "key": "s01e03s3.b-outro.1"
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
