import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bannedPhrasesIn,
  estimateShowMs,
  familyNamesIn,
  validateShow
} from "../../../src/content/schema.js";
import { isWordId } from "../../../src/content/words.js";
import {
  S01E01_SHORTS,
  s01e01ShortLulu,
  s01e01ShortPeeko,
  s01e01ShortSheru
} from "../../../src/content/shows/s01e01-shorts.js";
import { s01e01WelcomeToWonderWorld } from "../../../src/content/shows/s01e01-welcome-to-wonder-world.js";
import { s01e06MeetTikoTurtle } from "../../../src/content/shows/s01e06-meet-tiko-turtle.js";
import { en } from "../../../src/localization/en/index.js";
import { EN_S01E01_SHORTS } from "../../../src/localization/en/shows/s01e01-shorts.js";
import { EN_S01E01 } from "../../../src/localization/en/shows/s01e01-welcome-to-wonder-world.js";
import { EN_S01E06 } from "../../../src/localization/en/shows/s01e06-meet-tiko-turtle.js";
import {
  ES_S01E01_DUB,
  HI_S01E01_DUB,
  MULTILANG_SHOW_PACKS,
  PA_S01E01_DUB,
  getMultilangShowPack,
  type MultilangShowLocale
} from "../../../src/localization/multilang-shows.js";
import type { BeatSpec, LineRef, ShowSpec, StageAction } from "../../../src/types.js";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CHILD_GUARD = basename(APP_ROOT).split("-")[0]?.trim().toLowerCase() ?? "";
const GUARD_NAMES: readonly string[] = CHILD_GUARD ? [CHILD_GUARD] : [];

const EN_WITH_SHOWS = en;

const ALL_AUTHORED_SHOWS: readonly ShowSpec[] = [
  s01e01WelcomeToWonderWorld,
  ...S01E01_SHORTS,
  s01e06MeetTikoTurtle
];

function collectShowBeats(show: ShowSpec): BeatSpec[] {
  return show.segments.flatMap((seg) => [...seg.beats]);
}

function collectShowLines(show: ShowSpec): LineRef[] {
  const out: LineRef[] = [];
  for (const beat of collectShowBeats(show)) {
    out.push(...beat.lines);
    if (beat.response) out.push(...beat.response.lines);
    if (beat.responseByTarget) {
      for (const branch of Object.values(beat.responseByTarget)) {
        if (branch?.lines) out.push(...branch.lines);
      }
    }
  }
  return out;
}

function collectShowActions(show: ShowSpec): StageAction[] {
  const out: StageAction[] = [];
  for (const beat of collectShowBeats(show)) {
    out.push(...beat.stage, ...(beat.reducedMotionStage ?? []), ...(beat.response?.stage ?? []));
  }
  return out;
}

function collectUsedStringKeys(show: ShowSpec): Set<string> {
  const keys = new Set<string>([show.titleKey, show.offlinePlayKey, show.caregiverBridgeKey]);
  for (const ch of show.chapters) keys.add(ch.titleKey);
  for (const seg of show.segments) {
    if (seg.titleKey) keys.add(seg.titleKey);
    for (const beat of seg.beats) {
      if (beat.pauseCaptionKey) keys.add(beat.pauseCaptionKey);
      if (beat.caregiverPromptKey) keys.add(beat.caregiverPromptKey);
    }
  }
  return keys;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

describe("WP11 S01E01, E.9 Shorts, WP07 Tiko intro & P4 multilang shows", () => {
  it("merges English show parts cleanly and validates all 5 ShowSpecs with zero schema issues", () => {
    for (const show of ALL_AUTHORED_SHOWS) {
      const issues = validateShow(show, EN_WITH_SHOWS, { guardNames: GUARD_NAMES });
      expect(issues, `${show.id} validation issues`).toEqual([]);
    }
  });

  it("has zero orphan English line or string keys across EN_S01E01, EN_S01E01_SHORTS, and EN_S01E06", () => {
    const usedLineKeys = new Set<string>(ALL_AUTHORED_SHOWS.flatMap((show) => collectShowLines(show).map((l) => l.key)));
    const usedStringKeys = new Set<string>(ALL_AUTHORED_SHOWS.flatMap((show) => [...collectUsedStringKeys(show)]));

    for (const part of [EN_S01E01, EN_S01E01_SHORTS, EN_S01E06]) {
      for (const key of Object.keys(part.lines ?? {})) {
        expect(usedLineKeys.has(key), `orphan line key ${key}`).toBe(true);
      }
      for (const key of Object.keys(part.strings ?? {})) {
        expect(usedStringKeys.has(key), `orphan string key ${key}`).toBe(true);
      }
    }
  });

  it("enforces <= 9 words per spoken line, valid WordIds, and strict child-safety & privacy guards", () => {
    for (const part of [EN_S01E01, EN_S01E06, PA_S01E01_DUB, ES_S01E01_DUB, HI_S01E01_DUB]) {
      for (const [key, text] of Object.entries(part.lines ?? {})) {
        expect(countWords(text), `${key} ("${text}") exceeds 9 words`).toBeLessThanOrEqual(9);
        expect(bannedPhrasesIn(text), `${key} banned phrases`).toEqual([]);
        expect(familyNamesIn(text, GUARD_NAMES), `${key} family/child names`).toEqual([]);
        expect(/\bpip\b/i.test(text), `${key} retired name pip`).toBe(false);
        expect(/https?:\/\//i.test(text), `${key} external url`).toBe(false);
      }
      for (const [key, text] of Object.entries(part.strings ?? {})) {
        expect(bannedPhrasesIn(text), `${key} banned phrases`).toEqual([]);
        expect(familyNamesIn(text, GUARD_NAMES), `${key} family/child names`).toEqual([]);
        expect(/\bpip\b/i.test(text), `${key} retired name pip`).toBe(false);
        expect(/https?:\/\//i.test(text), `${key} external url`).toBe(false);
      }
    }

    for (const show of ALL_AUTHORED_SHOWS) {
      for (const w of [...show.targetWords, ...show.supportWords]) {
        expect(isWordId(w), `${show.id} invalid WordId "${w}"`).toBe(true);
      }
      for (const line of collectShowLines(show)) {
        expect(line.speaker, `${show.id} line ${line.key} must not synthesize Sheru`).not.toBe("sheru");
      }
      for (const beat of collectShowBeats(show)) {
        expect(beat.holdMs, `${show.id} beat ${beat.id} holdMs`).toBeGreaterThanOrEqual(0);
        expect(beat.holdMs, `${show.id} beat ${beat.id} holdMs <= 12000`).toBeLessThanOrEqual(12000);
        if (beat.response) {
          expect(beat.response.holdMs).toBeGreaterThanOrEqual(0);
          expect(beat.response.holdMs).toBeLessThanOrEqual(12000);
        }
      }
      if (show.youtube) {
        const ytBlob = `${show.youtube.title}\n${show.youtube.description}\n${show.youtube.thumbnailTitle}`;
        expect(bannedPhrasesIn(ytBlob), `${show.id} youtube banned`).toEqual([]);
        expect(familyNamesIn(ytBlob, GUARD_NAMES), `${show.id} youtube family/child`).toEqual([]);
        expect(/https?:\/\//i.test(ytBlob), `${show.id} youtube url`).toBe(false);
      }
    }
  });

  it("authors S01E01 with E.3's full 8-part island arc, 8 PAUSEs, 8 songs, ride/late-freeze cues, and 9:30-12:00 runtime", () => {
    const show = s01e01WelcomeToWonderWorld;
    expect(show.id).toBe("s01e01-welcome-to-wonder-world");
    expect(show.code).toBe("s01e01");
    expect(show.band).toBe("toddler");
    expect(show.aspect).toBe("16:9");
    expect(show.host).toBe("momo");
    expect(show.endCardSec).toBe(6);

    const worlds = show.segments.map((s) => s.world);
    expect(worlds).toEqual([
      "meadow",
      "meadow",
      "station",
      "music-garden",
      "peekaboo-barn",
      "learning-cloud",
      "home-nook",
      "home-nook",
      "starlight-cloud"
    ]);

    const pauses = collectShowBeats(show).filter((b) => b.kind === "invite");
    expect(pauses).toHaveLength(8);
    for (const pauseBeat of pauses) {
      expect(pauseBeat.pauseMs ?? show.pauseMs).toBeGreaterThanOrEqual(2500);
      expect(pauseBeat.pauseCaptionKey).toBeTruthy();
      expect(EN_WITH_SHOWS.strings[pauseBeat.pauseCaptionKey ?? ""]).toMatch(/^\[pause:/);
    }

    const actions = collectShowActions(show);
    const songs = actions.filter((a) => a.do === "song").map((a) => a.song);
    expect(songs).toEqual([
      "wonderTheme",
      "trainSong",
      "goStop",
      "peekaboo",
      "colours",
      "hello",
      "allDone",
      "starlightHum"
    ]);

    const hasMomoRide = actions.some((a) => a.do === "ride" && a.actor === "momo" && a.on === "carriage1");
    expect(hasMomoRide).toBe(true);

    const goStopAction = actions.find((a) => a.do === "song" && a.song === "goStop");
    expect(goStopAction?.do === "song" && goStopAction.cues).toContainEqual({
      line: 3,
      offsetMs: 600,
      stage: [{ do: "gesture", actor: "lulu", gesture: "freeze" }]
    });

    expect(show.youtube?.title).toBe("Welcome to Wonder World! 🎈 Count to 5 Party for Kids");
    expect(show.youtube?.thumbnailTitle).toBe("Hello, friend!");
    expect(show.youtube?.thumbnailBeatId).toBe("s7-welcome");
    expect(show.chapters).toHaveLength(8);

    const uniqueLineCount = Object.keys(EN_S01E01.lines ?? {}).length;
    expect(uniqueLineCount).toBeGreaterThanOrEqual(85);
    expect(uniqueLineCount).toBeLessThanOrEqual(105);

    const runtimeSec = estimateShowMs(show, EN_WITH_SHOWS) / 1000;
    expect(runtimeSec).toBeGreaterThanOrEqual(585);
    expect(runtimeSec).toBeLessThanOrEqual(720);
  });

  it("cuts three 9:16 Shorts from S01E01 with PAUSE beats and zero duplicate TTS line keys", () => {
    expect(S01E01_SHORTS).toHaveLength(3);
    expect(Object.keys(EN_S01E01_SHORTS.lines ?? {})).toHaveLength(0);

    expect(s01e01ShortSheru.id).toBe("s01e01-short-sheru");
    expect(s01e01ShortLulu.id).toBe("s01e01-short-lulu");
    expect(s01e01ShortPeeko.id).toBe("s01e01-short-peeko");

    for (const shortShow of S01E01_SHORTS) {
      expect(shortShow.aspect).toBe("9:16");
      expect(shortShow.parentShowId).toBe("s01e01-welcome-to-wonder-world");
      expect(shortShow.estimatedDurationSec).toBeGreaterThanOrEqual(30);
      expect(shortShow.estimatedDurationSec).toBeLessThanOrEqual(60);

      const pauses = collectShowBeats(shortShow).filter((b) => b.kind === "invite");
      expect(pauses.length).toBeGreaterThanOrEqual(1);
      for (const p of pauses) {
        expect(p.pauseMs ?? shortShow.pauseMs).toBeGreaterThanOrEqual(2500);
      }

      for (const line of collectShowLines(shortShow)) {
        expect(line.key.startsWith("s01e01.")).toBe(true);
        expect((EN_S01E01.lines ?? {})[line.key]).toBeTruthy();
      }

      const estSec = estimateShowMs(shortShow, EN_WITH_SHOWS) / 1000;
      expect(estSec).toBeGreaterThanOrEqual(30);
      expect(estSec).toBeLessThanOrEqual(60);
    }
  });

  it("introduces Tiko in s01e06-meet-tiko-turtle with 10-12 Tiko lines, catchphrases, >= 6 PAUSEs, and 9:30-12:00 runtime", () => {
    const show = s01e06MeetTikoTurtle;
    expect(show.id).toBe("s01e06-meet-tiko-turtle");
    expect(show.code).toBe("s01e06");
    expect(show.band).toBe("toddler");
    expect(show.aspect).toBe("16:9");
    expect(show.host).toBe("momo");
    expect(show.targetWords).toEqual(["one", "two", "three"]);
    expect(show.supportWords).toEqual(["slow", "fast", "circle", "square", "triangle", "look"]);

    expect(show.segments.map((s) => s.world)).toEqual([
      "meadow",
      "learning-cloud",
      "music-garden",
      "home-nook"
    ]);

    for (const seg of show.segments) {
      expect(seg.cast.some((c) => c.id === "tiko"), `tiko in ${seg.id}`).toBe(true);
    }

    const tikoLines = collectShowLines(show).filter((l) => l.speaker === "tiko");
    expect(tikoLines.length).toBeGreaterThanOrEqual(10);
    expect(tikoLines.length).toBeLessThanOrEqual(12);

    const tikoCorpus = tikoLines.map((l) => EN_WITH_SHOWS.lines[l.key] ?? "").join(" ");
    expect(tikoCorpus).toContain("Slow and steady!");
    expect(tikoCorpus).toContain("Let's look closely.");
    expect(tikoCorpus).toContain("One... two... three!");

    const pauses = collectShowBeats(show).filter((b) => b.kind === "invite");
    expect(pauses.length).toBeGreaterThanOrEqual(6);
    for (const p of pauses) {
      expect(p.pauseMs ?? show.pauseMs).toBeGreaterThanOrEqual(2500);
    }

    const songs = collectShowActions(show).filter((a) => a.do === "song").map((a) => a.song);
    expect(songs).toContain("shapes");
    expect(songs).toContain("countToThree");
    expect(songs).toContain("allDone");

    const runtimeSec = estimateShowMs(show, EN_WITH_SHOWS) / 1000;
    expect(runtimeSec).toBeGreaterThanOrEqual(580);
    expect(runtimeSec).toBeLessThanOrEqual(720);
  });

  it("resolves 100% of s01e01-short-sheru & S01E01 Segment 1+2 keys in pa, es, and hi", () => {
    const locales: readonly MultilangShowLocale[] = ["pa", "es", "hi"];
    const fullShow: ShowSpec = s01e01WelcomeToWonderWorld;
    const seg1And2Lines = fullShow.segments
      .slice(0, 2)
      .flatMap((seg) => seg.beats.flatMap((b) => [...b.lines, ...(b.response?.lines ?? [])]));

    for (const loc of locales) {
      const pack = getMultilangShowPack(loc);
      expect(pack).toBe(MULTILANG_SHOW_PACKS[loc]);
      expect(pack.locale).toBe(loc);

      const issues = validateShow(s01e01ShortSheru, pack, { guardNames: GUARD_NAMES });
      expect(issues, `${loc} validateShow issues`).toEqual([]);

      for (const line of collectShowLines(s01e01ShortSheru)) {
        expect(pack.lines[line.key]?.trim().length ?? 0, `${loc} missing line ${line.key}`).toBeGreaterThan(0);
      }
      for (const key of collectUsedStringKeys(s01e01ShortSheru)) {
        expect(pack.strings[key]?.trim().length ?? 0, `${loc} missing string ${key}`).toBeGreaterThan(0);
      }
      for (const line of seg1And2Lines) {
        expect(pack.lines[line.key]?.trim().length ?? 0, `${loc} missing seg1+2 line ${line.key}`).toBeGreaterThan(0);
      }
    }
  });
});
