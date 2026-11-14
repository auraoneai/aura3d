/// <reference types="node" />
// Unit tests for WP09 (Season 1 52-week calendar, AGE_BANDS, schema ShowSpec & validate-show 9 gates),
// WP10 (Kiro Prism Writers' Room + bounded repair loop + 3-Short 9:16 cutter), and
// WP20 (Punjabi/Spanish/Hindi broadcast dubbing packs + static companion episode pages).

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { STORIES } from "../../../src/content/catalog.js";
import {
  AGE_BANDS,
  BANTER_BIBLE,
  BANNED_EFFICACY_CLAIMS,
  LONG_SHOW_SEGMENT_ORDER,
  SEASON_1_CALENDAR,
  SEGMENT_TEMPLATES,
  SHORT_SPEC,
  bannedEfficacyClaimsIn,
  calendarBriefByCode,
  calendarBriefForWeek,
  checkSafetyFacts
} from "../../../src/content/calendar.js";
import {
  CHARACTER_IDS,
  REQUIRED_UI_KEYS,
  SPEAKER_IDS,
  UI_PLACEHOLDERS,
  familyNamesIn,
  validateCatalogDetailed,
  validateLibraries,
  validateShow,
  validateShowMessages
} from "../../../src/content/schema.js";
import { SONGS } from "../../../src/content/songs.js";
import { en } from "../../../src/localization/en/index.js";
import { es, ES_STATUS, esShowLocale } from "../../../src/localization/es.js";
import { hi, HI_STATUS, hiShowLocale } from "../../../src/localization/hi.js";
import {
  PA_SHOW_PACK,
  PA_SHOW_STATUS,
  PA_STATUS,
  mergeShowLocale,
  pa,
  paShowLocale
} from "../../../src/localization/pa.js";
import type { LocalePack, ShowSegmentSpec, ShowSpec } from "../../../src/types.js";
import {
  SHOW_GATE_NAMES,
  buildShowSrt,
  countSpokenWords,
  defaultGuardNames,
  runShowValidation
} from "../../../tools/validate-show.js";
import {
  MAX_REPAIR_PASSES,
  buildWritersRoomSystemPrompt,
  buildWritersRoomUserPrompt,
  cutShortsFromShow,
  normalizeShowTimings,
  writeShowFromBrief,
  type ChatMessage
} from "../../../tools/write-show.js";

interface GenEpisodePagesModule {
  readonly formatChapterTime: (sec: number) => string;
  readonly generateEpisodePages: (opts: {
    readonly shows: readonly ShowSpec[];
    readonly locale: LocalePack;
    readonly distDir: string;
  }) => string[];
  readonly renderEpisodePageHtml: (show: ShowSpec, locale: LocalePack) => string;
}

const genEpisodePagesUrl = pathToFileURL(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../tools/gen-episode-pages.mjs")
).href;

/** Builds a realistic, valid 8-segment toddler ShowSpec (~610s, 6 PAUSEs, Tiko, ride, offsetMs) and its locale part. */
function makeValidLongShowFixture(code = "s01e06", id = "s01e06-tiko-count-party"): {
  readonly show: ShowSpec;
  readonly lines: Record<string, string>;
  readonly strings: Record<string, string>;
  readonly locale: LocalePack;
} {
  const lines: Record<string, string> = {
    [`${code}.s1-open.1`]: "Hello, friend! Welcome back to Wonder World!",
    [`${code}.s1-open.2`]: "Today we are counting party blocks!",
    [`${code}.s2-late.1`]: "Boom, boom! Oops, I waved late!",
    [`${code}.s2-late.2`]: "Hi, Lulu! Ready for block party fun?",
    [`${code}.s3-goal.1`]: "Look! Tiko brought bright blocks today!",
    [`${code}.s3-goal.2`]: "Tap, tap! Let's count blocks, friend!",
    [`${code}.s3-pause1.1`]: "Can you spot one red block?",
    [`${code}.s3-pause1.r1`]: "One! Yes, one bright red block!",
    [`${code}.s4-wrong.1`]: "Sheru brought a soft sponge! Silly Sheru!",
    [`${code}.s4-sheru.1`]: "Woof! Woof!",
    [`${code}.s4-pause2.1`]: "Hmm, is a sponge a block?",
    [`${code}.s4-pause2.r1`]: "That's a sponge! Here comes our block!",
    [`${code}.s4-right.1`]: "Two blocks! Tiko stacks one, two!",
    [`${code}.s4-pause3.1`]: "How many blocks are stacked now?",
    [`${code}.s4-pause3.r1`]: "Two! One, two blocks together!",
    [`${code}.s5-train.1`]: "Choo-choo! All aboard for Music Garden!",
    [`${code}.s5-ride.1`]: "Go! GoGo gives Momo a smooth ride!",
    [`${code}.s5-pause4.1`]: "Ready, steady... time to go!",
    [`${code}.s5-pause4.r1`]: "Go! Off we go with Lulu!",
    [`${code}.s6-hide.1`]: "Peeko is hiding behind three blocks!",
    [`${code}.s6-pause5.1`]: "Where is Peeko hiding right now?",
    [`${code}.s6-pause5.r1`]: "Peekaboo! Three, four blocks and Peeko!",
    [`${code}.s6-lumi.1`]: "Five! Lumi shines on five party blocks!",
    [`${code}.s7-recap.1`]: "Let's count together: one, two, three, four, five!",
    [`${code}.s7-pause6.1`]: "How many party blocks did we stack?",
    [`${code}.s7-pause6.r1`]: "Five! Five party blocks, friend! Thank you!",
    [`${code}.s8-bye.1`]: "Bye-bye, friend! Thank you for counting blocks!",
    [`${code}.s8-bye.2`]: "Sweet dreams, friends. See you soon."
  };

  const strings: Record<string, string> = {
    [`${code}.title`]: "Tiko's Five Block Party",
    [`${code}.offline`]: "All done! Stack five soft blocks or cups together on the rug and count each one.",
    [`${code}.bridge`]: "At each pause, wait for your child to point or answer, then count together.",
    [`${code}.ch.s1`]: "Hello, Friend!",
    [`${code}.ch.s2`]: "Wonder World Theme",
    [`${code}.ch.s3`]: "Meet Tiko's Blocks",
    [`${code}.ch.s4`]: "Sheru's Sponge Surprise",
    [`${code}.ch.s5`]: "GoGo Ride & Freeze Song",
    [`${code}.ch.s6`]: "Peeko & Lumi Count to Five",
    [`${code}.ch.s7`]: "Five Block Party Recap",
    [`${code}.ch.s8`]: "All Done & Goodnight",
    [`${code}.s3-pause1.pause`]: "pause: point to the block",
    [`${code}.s4-pause2.pause`]: "pause: shake your head or smile",
    [`${code}.s4-pause3.pause`]: "pause: hold up two fingers",
    [`${code}.s5-pause4.pause`]: 'pause: say "go!" together',
    [`${code}.s6-pause5.pause`]: "pause: point to Peeko",
    [`${code}.s7-pause6.pause`]: "pause: count to five together"
  };

  const segments: readonly ShowSegmentSpec[] = [
    {
      id: "s1",
      template: "coldOpen",
      world: "meadow",
      music: "meadowBed",
      transitionIn: "none",
      cast: [
        { id: "momo", at: "center" },
        { id: "tiko", at: "right" }
      ],
      props: [{ id: "block1", asset: "toyBlock", at: "front" }],
      beats: [
        {
          id: "s1-open",
          kind: "greeting",
          camera: "medium",
          stage: [
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "wave" },
            { do: "gesture", actor: "tiko", gesture: "hop" }
          ],
          lines: [
            { speaker: "momo", key: `${code}.s1-open.1` },
            { speaker: "momo", key: `${code}.s1-open.2` }
          ],
          holdMs: 18000
        }
      ]
    },
    {
      id: "s2",
      template: "theme",
      world: "meadow",
      music: "meadowBed",
      transitionIn: "cut",
      cast: [
        { id: "momo", at: "center" },
        { id: "lulu", at: "left" },
        { id: "tiko", at: "right" },
        { id: "sheru", at: "frontLeft" }
      ],
      props: [{ id: "flower", asset: "flower", at: "backLeft" }],
      beats: [
        {
          id: "s2-theme",
          kind: "song",
          camera: "wide",
          stage: [
            {
              do: "song",
              song: "wonderTheme",
              performers: ["momo", "lulu", "tiko"],
              cues: [
                { line: 2, offsetMs: 0, stage: [{ do: "gesture", actor: "momo", gesture: "wave" }] },
                { line: 2, offsetMs: 600, stage: [{ do: "gesture", actor: "lulu", gesture: "wave" }] }
              ]
            }
          ],
          lines: [],
          holdMs: 24000
        },
        {
          id: "s2-late",
          kind: "event",
          camera: "medium",
          stage: [{ do: "gesture", actor: "lulu", gesture: "happy" }],
          lines: [
            { speaker: "lulu", key: `${code}.s2-late.1` },
            { speaker: "momo", key: `${code}.s2-late.2` }
          ],
          holdMs: 16000
        }
      ]
    },
    {
      id: "s3",
      template: "arrival",
      world: "home-nook",
      music: "homeBed",
      transitionIn: "cut",
      cast: [
        { id: "momo", at: "left" },
        { id: "tiko", at: "center" }
      ],
      props: [{ id: "block1", asset: "toyBlock", at: "front", tint: "#e85d5d" }],
      beats: [
        {
          id: "s3-goal",
          kind: "model",
          camera: "medium",
          stage: [
            { do: "object", target: "block1", action: "bounce" },
            { do: "gesture", actor: "tiko", gesture: "clap" }
          ],
          lines: [
            { speaker: "momo", key: `${code}.s3-goal.1` },
            { speaker: "tiko", key: `${code}.s3-goal.2` }
          ],
          words: [{ wordId: "block", objectId: "block1" }],
          holdMs: 20000
        },
        {
          id: "s3-pause1",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "tiko", toward: "viewer" },
            { do: "gesture", actor: "tiko", gesture: "wait" },
            { do: "object", target: "block1", action: "glow" }
          ],
          lines: [{ speaker: "tiko", key: `${code}.s3-pause1.1` }],
          holdMs: 14000,
          input: { type: "tap", targets: ["block1"] },
          pauseMs: 2600,
          pauseCaptionKey: `${code}.s3-pause1.pause`,
          response: {
            stage: [{ do: "gesture", actor: "tiko", gesture: "cheer" }],
            lines: [{ speaker: "tiko", key: `${code}.s3-pause1.r1` }],
            holdMs: 16000
          }
        }
      ]
    },
    {
      id: "s4",
      template: "wordGame",
      world: "meadow",
      music: "meadowBed",
      transitionIn: "train",
      cast: [
        { id: "momo", at: "center" },
        { id: "tiko", at: "right" },
        { id: "sheru", at: "left" }
      ],
      props: [
        { id: "sponge", asset: "sponge", at: "frontLeft" },
        { id: "block2", asset: "toyBlock", at: "frontRight" }
      ],
      beats: [
        {
          id: "s4-wrong",
          kind: "event",
          camera: "wide",
          stage: [
            { do: "carry", actor: "sheru", item: "sponge" },
            { do: "sfx", sound: "woofDouble" },
            { do: "gesture", actor: "sheru", gesture: "wag", loop: true }
          ],
          lines: [
            { speaker: "momo", key: `${code}.s4-wrong.1` },
            { speaker: "sheru", key: `${code}.s4-sheru.1` }
          ],
          holdMs: 18000
        },
        {
          id: "s4-pause2",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "wait" },
            { do: "object", target: "sponge", action: "glow" }
          ],
          lines: [{ speaker: "momo", key: `${code}.s4-pause2.1` }],
          holdMs: 12000,
          input: { type: "tap", targets: ["sponge"] },
          pauseMs: 2500,
          pauseCaptionKey: `${code}.s4-pause2.pause`,
          response: {
            stage: [
              { do: "carry", actor: "sheru", item: null },
              { do: "carry", actor: "sheru", item: "block2" }
            ],
            lines: [{ speaker: "momo", key: `${code}.s4-pause2.r1` }],
            holdMs: 14000
          }
        },
        {
          id: "s4-right",
          kind: "model",
          camera: "medium",
          stage: [{ do: "object", target: "block2", action: "stack" }],
          lines: [{ speaker: "tiko", key: `${code}.s4-right.1` }],
          holdMs: 16000
        },
        {
          id: "s4-pause3",
          kind: "invite",
          camera: "medium",
          stage: [
            { do: "gesture", actor: "tiko", gesture: "wait" },
            { do: "object", target: "block2", action: "glow" }
          ],
          lines: [{ speaker: "tiko", key: `${code}.s4-pause3.1` }],
          holdMs: 12000,
          input: { type: "tap", targets: ["block2"] },
          pauseMs: 2800,
          pauseCaptionKey: `${code}.s4-pause3.pause`,
          response: {
            stage: [{ do: "gesture", actor: "momo", gesture: "cheer" }],
            lines: [{ speaker: "tiko", key: `${code}.s4-pause3.r1` }],
            holdMs: 14000
          }
        }
      ]
    },
    {
      id: "s5",
      template: "songBreak",
      world: "music-garden",
      music: "gardenBed",
      transitionIn: "train",
      cast: [
        { id: "gogo", at: "left" },
        { id: "momo", at: "offLeft" },
        { id: "lulu", at: "center" }
      ],
      props: [
        { id: "car1", asset: "gogoCarriage", at: "left" },
        { id: "drum", asset: "drum", at: "right" }
      ],
      beats: [
        {
          id: "s5-train",
          kind: "event",
          camera: "wide",
          stage: [
            { do: "ride", actor: "momo", on: "car1" },
            { do: "sfx", sound: "whistle" }
          ],
          lines: [
            { speaker: "gogo", key: `${code}.s5-train.1` },
            { speaker: "momo", key: `${code}.s5-ride.1` }
          ],
          holdMs: 18000
        },
        {
          id: "s5-pause4",
          kind: "invite",
          camera: "medium",
          stage: [
            { do: "face", actor: "gogo", toward: "viewer" },
            { do: "gesture", actor: "gogo", gesture: "wait" }
          ],
          lines: [{ speaker: "gogo", key: `${code}.s5-pause4.1` }],
          holdMs: 12000,
          input: { type: "tap", targets: ["gogo"] },
          pauseMs: 2500,
          pauseCaptionKey: `${code}.s5-pause4.pause`,
          response: {
            stage: [{ do: "gesture", actor: "lulu", gesture: "dance" }],
            lines: [{ speaker: "gogo", key: `${code}.s5-pause4.r1` }],
            holdMs: 14000
          }
        },
        {
          id: "s5-song",
          kind: "song",
          camera: "wide",
          stage: [
            {
              do: "song",
              song: "goStop",
              performers: ["lulu", "gogo"],
              cues: [
                { line: 3, offsetMs: 0, stage: [{ do: "gesture", actor: "gogo", gesture: "freeze" }] },
                { line: 3, offsetMs: 600, stage: [{ do: "gesture", actor: "lulu", gesture: "freeze" }] }
              ]
            }
          ],
          lines: [],
          holdMs: 24000
        }
      ]
    },
    {
      id: "s6",
      template: "surprise",
      world: "learning-cloud",
      music: "cloudBed",
      transitionIn: "fade",
      cast: [
        { id: "peeko", at: "right" },
        { id: "lumi", at: "high" },
        { id: "tiko", at: "left" }
      ],
      props: [{ id: "block3", asset: "toyBlock", at: "center" }],
      beats: [
        {
          id: "s6-hide",
          kind: "hook",
          camera: "medium",
          stage: [
            { do: "gesture", actor: "peeko", gesture: "peek" },
            { do: "sfx", sound: "giggle" }
          ],
          lines: [{ speaker: "tiko", key: `${code}.s6-hide.1` }],
          holdMs: 16000
        },
        {
          id: "s6-pause5",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "gesture", actor: "tiko", gesture: "wait" },
            { do: "object", target: "block3", action: "glow" }
          ],
          lines: [{ speaker: "tiko", key: `${code}.s6-pause5.1` }],
          holdMs: 12000,
          input: { type: "tap", targets: ["peeko"] },
          pauseMs: 2600,
          pauseCaptionKey: `${code}.s6-pause5.pause`,
          response: {
            stage: [{ do: "gesture", actor: "peeko", gesture: "hop" }],
            lines: [{ speaker: "peeko", key: `${code}.s6-pause5.r1` }],
            holdMs: 14000
          }
        },
        {
          id: "s6-lumi",
          kind: "model",
          camera: "wide",
          stage: [{ do: "gesture", actor: "lumi", gesture: "twinkle" }],
          lines: [{ speaker: "lumi", key: `${code}.s6-lumi.1` }],
          holdMs: 18000
        }
      ]
    },
    {
      id: "s7",
      template: "tryAtHome",
      world: "home-nook",
      music: "homeBed",
      transitionIn: "train",
      cast: [
        { id: "momo", at: "center" },
        { id: "tiko", at: "right" },
        { id: "lulu", at: "left" }
      ],
      props: [{ id: "block5", asset: "toyBlock", at: "front" }],
      beats: [
        {
          id: "s7-recap",
          kind: "repeat",
          camera: "wide",
          stage: [{ do: "object", target: "block5", action: "stack" }],
          lines: [{ speaker: "momo", key: `${code}.s7-recap.1` }],
          holdMs: 18000
        },
        {
          id: "s7-pause6",
          kind: "invite",
          camera: "close",
          stage: [
            { do: "face", actor: "momo", toward: "viewer" },
            { do: "gesture", actor: "momo", gesture: "wait" }
          ],
          lines: [{ speaker: "momo", key: `${code}.s7-pause6.1` }],
          holdMs: 14000,
          input: { type: "tap", targets: ["block5"] },
          pauseMs: 3000,
          pauseCaptionKey: `${code}.s7-pause6.pause`,
          response: {
            stage: [{ do: "gesture", actor: "momo", gesture: "cheer" }],
            lines: [{ speaker: "momo", key: `${code}.s7-pause6.r1` }],
            holdMs: 18000
          }
        }
      ]
    },
    {
      id: "s8",
      template: "goodbye",
      world: "starlight-cloud",
      music: "starlightBed",
      transitionIn: "fade",
      cast: [
        { id: "momo", at: "center" },
        { id: "lumi", at: "high" },
        { id: "tiko", at: "right" }
      ],
      props: [{ id: "moon", asset: "moon", at: "back" }],
      beats: [
        {
          id: "s8-alldone",
          kind: "song",
          camera: "wide",
          stage: [{ do: "song", song: "allDone", performers: ["momo", "tiko"] }],
          lines: [],
          holdMs: 16000
        },
        {
          id: "s8-bye",
          kind: "outro",
          camera: "medium",
          stage: [
            { do: "gesture", actor: "momo", gesture: "wave" },
            { do: "song", song: "starlightHum", performers: ["lumi"] }
          ],
          lines: [
            { speaker: "momo", key: `${code}.s8-bye.1` },
            { speaker: "lumi", key: `${code}.s8-bye.2` }
          ],
          holdMs: 20000
        }
      ]
    }
  ];

  const baseShow: ShowSpec = {
    kind: "show",
    id,
    code,
    version: 1,
    band: "toddler",
    calendarWeek: 6,
    titleKey: `${code}.title`,
    host: "momo",
    targetWords: ["block", "one", "two", "five", "party"],
    supportWords: ["three", "four", "go", "friend"],
    pauseMs: 2500,
    estimatedDurationSec: 605,
    endCardSec: 6,
    offlinePlayKey: `${code}.offline`,
    caregiverBridgeKey: `${code}.bridge`,
    chapters: segments.map((s) => ({ segmentId: s.id, titleKey: `${code}.ch.${s.id}` })),
    segments,
    youtube: {
      title: "Tiko's Five Block Party | Wonder World",
      description:
        "Count to five party blocks with Momo, Tiko, Sheru, GoGo, Lulu, Peeko and Lumi! For ages 1-4, best watched together. Play in the app: <app URL>",
      thumbnailBeatId: "s7-recap",
      thumbnailTitle: "Count to 5!"
    },
    review: {
      language: "approved",
      rights: "approved",
      reviewer: "unit-test-reviewer",
      date: "2026-11-13"
    }
  };

  const locale = mergeShowLocale(en, { lines, strings });
  const normalized = normalizeShowTimings(baseShow, locale);
  return { show: normalized, lines, strings, locale };
}

describe("WP09: Season 1 52-week curriculum calendar, AGE_BANDS, and banter/safety tables", () => {
  it("defines AGE_BANDS and SEGMENT_TEMPLATES matching PRD 09 C.1 and C.3", () => {
    expect(AGE_BANDS.little.maxWordsPerLine).toBe(6);
    expect(AGE_BANDS.little.maxCutsPerMin).toBe(3);
    expect(AGE_BANDS.little.minPauseMs).toBe(3000);
    expect(AGE_BANDS.little.durationSec).toEqual([480, 600]);
    expect(AGE_BANDS.little.targetWordRange).toEqual([1, 2]);

    expect(AGE_BANDS.toddler.maxWordsPerLine).toBe(9);
    expect(AGE_BANDS.toddler.maxCutsPerMin).toBe(4);
    expect(AGE_BANDS.toddler.minPauseMs).toBe(2500);
    expect(AGE_BANDS.toddler.durationSec).toEqual([570, 720]);
    expect(AGE_BANDS.toddler.targetWordRange).toEqual([2, 4]);

    expect(AGE_BANDS.preschool.maxWordsPerLine).toBe(12);
    expect(AGE_BANDS.preschool.maxCutsPerMin).toBe(6);
    expect(AGE_BANDS.preschool.minPauseMs).toBe(2000);
    expect(AGE_BANDS.preschool.durationSec).toEqual([600, 840]);
    expect(AGE_BANDS.preschool.targetWordRange).toEqual([3, 5]);

    expect(SHORT_SPEC.durationSec).toEqual([20, 60]);
    expect(SHORT_SPEC.minPauses).toBe(1);
    expect(SHORT_SPEC.maxWordsPerLine("toddler")).toBe(9);

    expect(Object.keys(SEGMENT_TEMPLATES)).toEqual([
      "coldOpen",
      "theme",
      "arrival",
      "wordGame",
      "songBreak",
      "surprise",
      "tryAtHome",
      "goodbye",
      "shortMoment"
    ]);
    expect(LONG_SHOW_SEGMENT_ORDER).toHaveLength(8);
  });

  it("defines all 52 weekly EpisodeBriefs with closed cast/worlds/songs, curriculum arcs, and Tiko", () => {
    expect(SEASON_1_CALENDAR).toHaveLength(52);
    const seenCodes = new Set<string>();
    const seenSlugs = new Set<string>();
    let tikoAppearances = 0;

    SEASON_1_CALENDAR.forEach((brief, idx) => {
      const expectedWeek = idx + 1;
      const expectedCode = `s01e${String(expectedWeek).padStart(2, "0")}`;
      expect(brief.week).toBe(expectedWeek);
      expect(brief.code).toBe(expectedCode);
      expect(seenCodes.has(brief.code)).toBe(false);
      expect(seenSlugs.has(brief.slug)).toBe(false);
      seenCodes.add(brief.code);
      seenSlugs.add(brief.slug);

      expect(calendarBriefForWeek(expectedWeek)).toBe(brief);
      expect(calendarBriefByCode(expectedCode)).toBe(brief);

      expect(CHARACTER_IDS).toContain(brief.host);
      expect(brief.host).not.toBe("sheru");
      expect(brief.coStars.length).toBeGreaterThanOrEqual(1);
      for (const co of brief.coStars) expect(CHARACTER_IDS).toContain(co);
      if (brief.host === "tiko" || brief.coStars.includes("tiko")) tikoAppearances += 1;

      expect(brief.worlds.length).toBeGreaterThanOrEqual(2);
      expect(Object.prototype.hasOwnProperty.call(SONGS, brief.song)).toBe(true);
      expect(brief.targetWords.length).toBeGreaterThanOrEqual(1);
      expect(brief.supportWords.length).toBeGreaterThanOrEqual(1);

      // Curriculum arc schedule per PRD 09 C.2.
      if (expectedWeek === 1) expect(brief.arc).toBe("launch");
      else if (expectedWeek <= 8) expect(brief.arc).toBe("first-words");
      else if (expectedWeek <= 16) expect(brief.arc).toBe("sounds-animals");
      else if (expectedWeek <= 24) expect(brief.arc).toBe("body-routine");
      else if (expectedWeek <= 32) expect(brief.arc).toBe("concepts-positions");
      else if (expectedWeek <= 40) expect(brief.arc).toBe("numbers-shapes");
      else if (expectedWeek <= 46) expect(brief.arc).toBe("letters");
      else {
        expect(brief.arc).toBe("sleep-calm");
        expect(brief.sleepCategory).toBe("bedtime");
      }

      for (const text of [brief.title, brief.comedyHook, brief.summary]) {
        expect(bannedEfficacyClaimsIn(text), `week ${expectedWeek}`).toEqual([]);
        expect(checkSafetyFacts(text), `week ${expectedWeek}`).toEqual([]);
      }
    });

    // Week 6 introduces Tiko, and Tiko stars/co-stars across multiple counting/shape weeks.
    const week6 = calendarBriefForWeek(6);
    expect(week6?.host === "tiko" || week6?.coStars.includes("tiko")).toBe(true);
    expect(tikoAppearances).toBeGreaterThanOrEqual(6);
  });

  it("includes BANTER_BIBLE for all 7 cast members + narrator and flags banned claims & safety hazards", () => {
    expect(Object.keys(BANTER_BIBLE)).toEqual([
      "momo",
      "lulu",
      "sheru",
      "gogo",
      "peeko",
      "lumi",
      "tiko",
      "narrator"
    ]);
    expect(BANTER_BIBLE.sheru.speaks).toBe(false);
    expect(BANTER_BIBLE.tiko.speaks).toBe(true);
    expect(BANNED_EFFICACY_CLAIMS).toContain("teaches your child to talk");
    expect(BANNED_EFFICACY_CLAIMS).toContain("subscribe");
    expect(bannedEfficacyClaimsIn("This clinically proven video teaches your child to talk!")).toEqual([
      "teaches your child to talk",
      "clinically proven"
    ]);
    expect(checkSafetyFacts("Look at that scary monster!").length).toBeGreaterThan(0);
    expect(checkSafetyFacts("Give whole grapes and honey to a baby.").length).toBeGreaterThanOrEqual(2);
    expect(checkSafetyFacts("Let's cross the street alone!").length).toBeGreaterThan(0);
    expect(checkSafetyFacts("Splash in the bathtub!", { context: "offline" }).length).toBeGreaterThan(0);
    expect(
      checkSafetyFacts("Splash in the bathtub together with a grown-up right beside you.", { context: "offline" })
    ).toEqual([]);
  });
});

describe("WP09: schema.ts ShowSpec support & tools/validate-show.ts 9 static gates", () => {
  it("registers tiko, wonderThemeShort [8..15s], ride visibility, SongCue.offsetMs, and show locale prefixes", () => {
    expect(CHARACTER_IDS).toContain("tiko");
    expect(SPEAKER_IDS).toContain("tiko");
    expect(validateLibraries(en)).toEqual([]);

    // Show locale keys (`s01e01.*`, `s01e01s1.*`) coexist cleanly with the 42 stories in `validateCatalogDetailed`.
    const augmentedEn = mergeShowLocale(en, {
      lines: { "s01e01.s1-island.1": "Far away, there is an island." },
      strings: { "s01e01.title": "Welcome to Wonder World!", "s01e01s1.title": "Silly Sheru!" }
    });
    const catReport = validateCatalogDetailed(STORIES, augmentedEn);
    expect(catReport.catalog).toEqual([]);
  });

  it("passes validateShow and all 9 runShowValidation gates on a valid toddler long show", () => {
    const { show, locale } = makeValidLongShowFixture();
    expect(validateShowMessages(show, locale)).toEqual([]);

    const report = runShowValidation(show, locale);
    expect(report.ok, report.repairPromptHints.join("\n")).toBe(true);
    for (const gate of SHOW_GATE_NAMES) {
      expect(report.gates[gate].ok, `gate ${gate}: ${report.gates[gate].errors.join("; ")}`).toBe(true);
    }
    expect(report.stats.pauseCount).toBe(6);
    expect(report.stats.computedDurationSec).toBeGreaterThanOrEqual(570);
    expect(report.stats.computedDurationSec).toBeLessThanOrEqual(720);
    expect(report.srtPreview).toContain("[pause:");
  });

  it("allows counting to 5 in toddler/preschool shows while capping little band at 3", () => {
    const { show, locale } = makeValidLongShowFixture();
    expect(validateShowMessages(show, locale)).toEqual([]);

    const littleShow: ShowSpec = { ...show, band: "little" };
    const littleErrors = validateShowMessages(littleShow, locale);
    expect(littleErrors.some((msg) => msg.includes("counts to 4") || msg.includes("counts to 5"))).toBe(true);
  });

  it("enforces ride carrier visibility and SongCue.offsetMs bounds in validateShow", () => {
    const { show, locale } = makeValidLongShowFixture();
    // In s5-train, momo starts at offLeft and rides car1 (at left), so momo is visible when speaking!
    // If car1 is moved to offRight instead, momo is off-stage when speaking s5-ride.1!
    const brokenSegs = show.segments.map((seg) =>
      seg.id === "s5"
        ? {
            ...seg,
            props: seg.props.map((p) => (p.id === "car1" ? { ...p, at: "offRight" as const } : p))
          }
        : seg
    );
    const offStageIssues = validateShow({ ...show, segments: brokenSegs }, locale);
    expect(offStageIssues.some((i) => i.category === "visibility" && i.message.includes("momo speaks"))).toBe(true);

    // SongCue.offsetMs > 10000 fails schema.
    const badOffsetSegs = show.segments.map((seg) =>
      seg.id === "s2"
        ? {
            ...seg,
            beats: seg.beats.map((b) =>
              b.id === "s2-theme"
                ? {
                    ...b,
                    stage: [
                      {
                        do: "song" as const,
                        song: "wonderTheme" as const,
                        cues: [{ line: 0, offsetMs: 15000, stage: [{ do: "gesture" as const, actor: "momo", gesture: "wave" as const }] }]
                      }
                    ]
                  }
                : b
            )
          }
        : seg
    );
    const offsetErrors = validateShowMessages({ ...show, segments: badOffsetSegs }, locale);
    expect(offsetErrors.some((e) => e.includes("offsetMs"))).toBe(true);
  });

  it("catches failures across each of the 9 B.6 gates independently", () => {
    const base = makeValidLongShowFixture();

    // 1. schema gate: bad chapter segmentId.
    const badChapterShow: ShowSpec = {
      ...base.show,
      chapters: [...base.show.chapters, { segmentId: "non-existent", titleKey: `${base.show.code}.ch.s1` }]
    };
    const rSchema = runShowValidation(badChapterShow, base.locale);
    expect(rSchema.gates.schema.ok).toBe(false);

    // 2. language gate: spoken word count ignores ellipses/brackets, catches > 9 words in toddler.
    expect(countSpokenWords("It's called… Wonder World!")).toBe(4);
    expect(countSpokenWords("[yawn] One... two... three!")).toBe(3);
    const overLongLocale = mergeShowLocale(base.locale, {
      lines: {
        [`${base.show.code}.s1-open.1`]:
          "Hello there wonderful little friend welcome back to our sunny island today!"
      }
    });
    const rLang = runShowValidation(base.show, overLongLocale);
    expect(rLang.gates.language.ok).toBe(false);

    // 3. banter gate: Sheru speaking real English words, or host missing from goodbye.
    const talkingSheruLocale = mergeShowLocale(base.locale, {
      lines: { [`${base.show.code}.s4-sheru.1`]: "Hello Momo, I found the sponge!" }
    });
    const rBanterSheru = runShowValidation(base.show, talkingSheruLocale);
    expect(rBanterSheru.gates.banter.ok).toBe(false);

    const silentHostClosingShow: ShowSpec = {
      ...base.show,
      segments: base.show.segments.map((seg) =>
        seg.id === "s7" || seg.id === "s8"
          ? {
              ...seg,
              beats: seg.beats.map((b) => ({
                ...b,
                lines: b.lines.map((l) => (l.speaker === "momo" ? { ...l, speaker: "narrator" as const } : l)),
                ...(b.response
                  ? {
                      response: {
                        ...b.response,
                        lines: b.response.lines.map((l) =>
                          l.speaker === "momo" ? { ...l, speaker: "narrator" as const } : l
                        )
                      }
                    }
                  : {})
              }))
            }
          : seg
      )
    };
    const rBanterHost = runShowValidation(silentHostClosingShow, base.locale);
    expect(rBanterHost.gates.banter.ok).toBe(false);

    // 4. pacing gate: fewer than 6 PAUSE beats or pauseMs < minPauseMs.
    const tooFewPausesShow: ShowSpec = {
      ...base.show,
      segments: base.show.segments.map((seg) => ({
        ...seg,
        beats: seg.beats.map((b) =>
          b.kind === "invite"
            ? {
                id: b.id,
                kind: "model" as const,
                camera: b.camera,
                stage: b.stage,
                lines: b.lines,
                holdMs: b.holdMs
              }
            : b
        )
      }))
    };
    const rPacing = runShowValidation(tooFewPausesShow, base.locale);
    expect(rPacing.gates.pacing.ok).toBe(false);

    // 5. privacy gate: external URL, subscribe CTA, or dynamically derived guard name.
    const guard = defaultGuardNames()[0] ?? "mommy";
    const leakyLocale = mergeShowLocale(base.locale, {
      strings: {
        [`${base.show.code}.offline`]: `Visit https://example.com and subscribe with ${guard}!`
      }
    });
    const rPrivacy = runShowValidation(base.show, leakyLocale);
    expect(rPrivacy.gates.privacy.ok).toBe(false);

    // 6. rights gate: pending reviewer or free-tier audio provenance.
    const tmpProvDir = mkdtempSync(join(tmpdir(), "ww-prov-"));
    try {
      writeFileSync(
        join(tmpProvDir, "songs.json"),
        JSON.stringify({ wonderTheme: { provider: "elevenlabs", tier: "free" } }),
        "utf8"
      );
      const rRights = runShowValidation(
        { ...base.show, review: { ...base.show.review, reviewer: "pending-human" } },
        base.locale,
        { provenanceDir: tmpProvDir }
      );
      expect(rRights.gates.rights.ok).toBe(false);
      expect(rRights.gates.rights.errors.some((e) => e.includes("free"))).toBe(true);
    } finally {
      rmSync(tmpProvDir, { recursive: true, force: true });
    }

    // 7. captions gate: buildShowSrt produces monotonic timestamps and [pause: ...] cues.
    const builtSrt = buildShowSrt(base.show, base.locale);
    expect(builtSrt.cues.filter((c) => c.kind === "pause")).toHaveLength(6);
    for (let i = 1; i < builtSrt.cues.length; i += 1) {
      expect(builtSrt.cues[i]!.startMs).toBeGreaterThanOrEqual(builtSrt.cues[i - 1]!.endMs);
    }

    // 8. originality gate: rejects >= 25% duplicate overlap with another show, but exempts Short's parentShowId.
    const cloneShow: ShowSpec = { ...base.show, id: "s01e07-clone", code: "s01e07" };
    const rOrigFail = runShowValidation(cloneShow, base.locale, { catalogShows: [base.show] });
    expect(rOrigFail.gates.originality.ok).toBe(false);

    // 9. safetyFacts gate: banned efficacy claims and unsafe toddler instructions.
    const unsafeYoutubeShow: ShowSpec = {
      ...base.show,
      youtube: {
        title: "Speech Therapy Video That Teaches Your Child to Talk!",
        description: "Clinically proven smart baby IQ booster! Feed whole grapes!",
        thumbnailBeatId: "s7-recap",
        thumbnailTitle: "Smart Baby!"
      }
    };
    const rSafety = runShowValidation(unsafeYoutubeShow, base.locale);
    expect(rSafety.gates.safetyFacts.ok).toBe(false);
  });
});

describe("WP10: tools/write-show.ts Writers' Room, bounded repair loop, and 3-Short 9:16 cutter", () => {
  it("builds closed-vocabulary prompts, repairs a flawed draft within <= 2 passes, and cuts 3 valid Shorts", async () => {
    const brief = calendarBriefForWeek(6)!;
    const sysPrompt = buildWritersRoomSystemPrompt(brief);
    const userPrompt = buildWritersRoomUserPrompt(brief);
    expect(sysPrompt).toContain("WorldId");
    expect(sysPrompt).toContain("tiko");
    expect(sysPrompt).toContain("sheru");
    expect(userPrompt).toContain(brief.code);

    const good = makeValidLongShowFixture(brief.code, brief.slug);
    const flawedLines: Record<string, string> = {
      ...good.lines,
      [`${brief.code}.s1-open.1`]:
        "Hello wonderful little friend today this clinically proven speech therapy show has way too many words!"
    };

    const seenCalls: ChatMessage[][] = [];
    const outRoot = mkdtempSync(join(tmpdir(), "ww-writer-"));
    try {
      const result = await writeShowFromBrief({
        brief,
        cutShorts: true,
        outRootDir: outRoot,
        prismCall: async (msgs) => {
          seenCalls.push([...msgs]);
          if (seenCalls.length === 1) {
            return JSON.stringify({ show: good.show, lines: flawedLines, strings: good.strings });
          }
          return JSON.stringify({ show: good.show, lines: good.lines, strings: good.strings });
        }
      });

      expect(seenCalls).toHaveLength(2);
      expect(result.repairPassesUsed).toBe(1);
      expect(result.validation.ok).toBe(true);
      expect(result.filesWritten).toHaveLength(4);

      // Zero casts (` as `) and zero URLs in rendered TypeScript modules.
      for (const modCode of [
        result.renderedModules.showTs,
        result.renderedModules.showLocaleTs,
        result.renderedModules.shortsTs ?? "",
        result.renderedModules.shortsLocaleTs ?? ""
      ]) {
        expect(modCode).not.toMatch(/\bas\s+[A-Z]/);
        expect(modCode).not.toMatch(/https?:\/\//i);
      }

      // 3 cut Shorts are 9:16, <= 55s, linked via parentShowId, and pass all 9 validation gates!
      expect(result.shorts).toHaveLength(3);
      for (const shortBundle of result.shorts) {
        expect(shortBundle.show.aspect).toBe("9:16");
        expect(shortBundle.show.parentShowId).toBe(result.show.id);
        expect(shortBundle.show.estimatedDurationSec).toBeLessThanOrEqual(55);
        const shortLocale = mergeShowLocale(en, {
          lines: shortBundle.lines,
          strings: shortBundle.strings
        });
        const shortReport = runShowValidation(shortBundle.show, shortLocale, {
          catalogShows: [result.show]
        });
        expect(shortReport.ok, shortReport.repairPromptHints.join("\n")).toBe(true);
      }
    } finally {
      rmSync(outRoot, { recursive: true, force: true });
    }
  });

  it("caps repair passes strictly at MAX_REPAIR_PASSES = 2 (max 3 total Prism calls)", async () => {
    expect(MAX_REPAIR_PASSES).toBe(2);
    const brief = calendarBriefForWeek(6)!;
    let callCount = 0;

    await expect(
      writeShowFromBrief({
        brief,
        dryRun: true,
        prismCall: async () => {
          callCount += 1;
          return "not valid json at all";
        }
      })
    ).rejects.toThrow(/after 2 repair passes/);

    expect(callCount).toBe(1 + MAX_REPAIR_PASSES);
  });

  it("cuts 3 standalone 9:16 Shorts directly from a ShowSpec", () => {
    const { show, locale } = makeValidLongShowFixture();
    const shorts = cutShortsFromShow(show, locale);
    expect(shorts).toHaveLength(3);
    expect(shorts.map((s) => s.sourceTemplate)).toEqual(["wordGame", "songBreak", "surprise"]);
  });
});

describe("WP20: Multi-language dubbing packs (pa, es, hi) and tools/gen-episode-pages.mjs", () => {
  it("preserves PA_STATUS=false for the 42-story catalog while enabling PA/ES/HI broadcast show packs", () => {
    expect(PA_STATUS.enabled).toBe(false);
    expect(Object.keys(pa.lines)).toEqual([]);
    expect(Object.keys(pa.strings)).toEqual([]);

    expect(PA_SHOW_STATUS.enabled).toBe(true);
    expect(ES_STATUS.enabled).toBe(true);
    expect(HI_STATUS.enabled).toBe(true);

    const guardNames = defaultGuardNames();
    for (const pack of [PA_SHOW_PACK, paShowLocale(), es, esShowLocale(), hi, hiShowLocale()]) {
      for (const key of REQUIRED_UI_KEYS) {
        expect((pack.strings[key] ?? "").trim().length, `${pack.locale} missing ${key}`).toBeGreaterThan(0);
      }
      for (const [key, placeholders] of Object.entries(UI_PLACEHOLDERS)) {
        for (const ph of placeholders) {
          expect(pack.strings[key], `${pack.locale} ${key}`).toContain(ph);
        }
      }
      for (const [k, text] of [...Object.entries(pack.strings), ...Object.entries(pack.lines)]) {
        expect(familyNamesIn(text, guardNames), `${pack.locale} ${k}`).toEqual([]);
        expect(/https?:\/\//i.test(text), `${pack.locale} ${k} URL`).toBe(false);
      }
    }
  });

  it("validates the s01e01-short-sheru pilot Short cleanly across pa, es, and hi dubbing packs", () => {
    const sheruShort: ShowSpec = {
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
      targetWords: ["ball", "one"],
      supportWords: ["sponge", "friend"],
      pauseMs: 2500,
      estimatedDurationSec: 34,
      offlinePlayKey: "s01e01s1.offline",
      caregiverBridgeKey: "s01e01s1.bridge",
      chapters: [{ segmentId: "s1", titleKey: "s01e01s1.ch.s1", atSec: 0 }],
      segments: [
        {
          id: "s1",
          template: "shortMoment",
          world: "meadow",
          music: "meadowBed",
          transitionIn: "none",
          cast: [
            { id: "momo", at: "center" },
            { id: "sheru", at: "left" }
          ],
          props: [
            { id: "sponge", asset: "sponge", at: "frontLeft" },
            { id: "bubbleWand", asset: "bubbleWand", at: "backLeft" },
            { id: "ball", asset: "ball", at: "frontRight" }
          ],
          beats: [
            {
              id: "hook",
              kind: "hook",
              camera: "wide",
              stage: [{ do: "sfx", sound: "woofDouble" }],
              lines: [
                { speaker: "momo", key: "s01e01s1.hook.1" },
                { speaker: "momo", key: "s01e01s1.wrong-1.1" }
              ],
              holdMs: 3500
            },
            {
              id: "pause-1",
              kind: "invite",
              camera: "close",
              stage: [
                { do: "face", actor: "momo", toward: "viewer" },
                { do: "gesture", actor: "momo", gesture: "wait" },
                { do: "object", target: "sponge", action: "glow" }
              ],
              lines: [{ speaker: "momo", key: "s01e01s1.pause-1.1" }],
              holdMs: 2000,
              input: { type: "tap", targets: ["sponge"] },
              pauseMs: 2500,
              pauseCaptionKey: "s01e01s1.pause.1",
              response: {
                stage: [{ do: "gesture", actor: "momo", gesture: "happy" }],
                lines: [{ speaker: "momo", key: "s01e01s1.pause-1.r1" }],
                holdMs: 2200
              }
            },
            {
              id: "payoff",
              kind: "repeat",
              camera: "medium",
              stage: [
                { do: "carry", actor: "sheru", item: "ball" },
                { do: "gesture", actor: "momo", gesture: "cheer" }
              ],
              lines: [
                { speaker: "momo", key: "s01e01s1.wrong-2.1" },
                { speaker: "momo", key: "s01e01s1.right.1" },
                { speaker: "momo", key: "s01e01s1.count-1.1" }
              ],
              holdMs: 3500
            },
            {
              id: "outro",
              kind: "outro",
              camera: "medium",
              stage: [{ do: "gesture", actor: "momo", gesture: "wave" }],
              lines: [{ speaker: "momo", key: "s01e01s1.outro.1" }],
              holdMs: 2500
            }
          ]
        }
      ],
      review: {
        language: "approved",
        rights: "approved",
        reviewer: "p4-dubbing-reviewer",
        date: "2026-11-13"
      }
    };

    for (const pack of [paShowLocale(), esShowLocale(), hiShowLocale()]) {
      const report = runShowValidation(sheruShort, pack);
      expect(report.ok, `${pack.locale}: ${report.repairPromptHints.join("; ")}`).toBe(true);
    }
  });

  it("generates static companion episode pages with noindex, zero scripts, and zero external URLs", async () => {
    const {
      formatChapterTime,
      generateEpisodePages,
      renderEpisodePageHtml
    }: GenEpisodePagesModule = await import(genEpisodePagesUrl);
    expect(formatChapterTime(0)).toBe("0:00");
    expect(formatChapterTime(125)).toBe("2:05");

    const { show, locale } = makeValidLongShowFixture();
    const tmpDist = mkdtempSync(join(tmpdir(), "ww-ep-pages-"));
    try {
      mkdirSync(tmpDist, { recursive: true });
      const written = generateEpisodePages({ shows: [show], locale, distDir: tmpDist });
      expect(written).toHaveLength(1);

      const html = readFileSync(written[0]!, "utf8");
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html).toContain('<meta name="referrer" content="no-referrer">');
      expect(html).toContain("Tiko&#39;s Five Block Party");
      expect(html).toContain("Stack five soft blocks");
      expect(html).toContain("At each pause, wait for your child");
      expect(html).toContain("Meet Tiko&#39;s Blocks");
      expect(html).toContain(`href="../../?show=${encodeURIComponent(show.id)}"`);
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/https?:\/\//i);
      expect(html).not.toMatch(/cookie|gtag|analytics|localStorage/i);

      // Also verify direct renderEpisodePageHtml in Punjabi.
      const paHtml = renderEpisodePageHtml(show, mergeShowLocale(paShowLocale(), { strings: locale.strings }));
      expect(paHtml).toContain('lang="pa"');
      expect(paHtml).toContain('content="noindex, nofollow"');
    } finally {
      rmSync(tmpDist, { recursive: true, force: true });
    }
  });
});
