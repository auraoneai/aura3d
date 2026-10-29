/// <reference types="node" />
// J05 (PRD 04): unique ids, every reference, rights, finite story graphs and
// translations. The real catalog must pass the content lint with no problems;
// synthetic stories show that each lint rule catches its failure.
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ActivitySpec, BeatSpec, EpisodeSpec, LocalePack, StorySpec } from "../../../src/types.js";
import { ACTIVITIES, ENABLED_LOCALES, EPISODES, LOCALE_PACKS, STORIES, localePack, storyByCode, storyById, storyCode } from "../../../src/content/catalog.js";
import {
  ACTIVITY_SLUGS,
  BANNED_PHRASES,
  EPISODE_SLUGS,
  REQUIRED_UI_KEYS,
  estimateStoryMs,
  validateCatalog,
  validateLibraries,
  validateStory
} from "../../../src/content/schema.js";
import { PRD_SONG_LYRICS, SONGS, SONG_IDS, songLengthSec } from "../../../src/content/songs.js";
import { SFX } from "../../../src/content/sfx.js";
import { MUSIC_BEDS } from "../../../src/content/music.js";
import { WORDS, WORD_IDS, wordSpoken } from "../../../src/content/words.js";
import { lettersNamedIn } from "../../../src/content/letters.js";
import { EN_PARTS, en, mergeLocaleParts } from "../../../src/localization/en/index.js";
import { PA_STATUS, pa } from "../../../src/localization/pa.js";
import { AUDIO_MANIFEST } from "../../../src/audio-manifest.js";

/**
 * The child's name, never written in source: it is the prefix of the app's
 * working folder name (`<name>-wonder-world`), as in tests/unit/privacy and
 * tools/validate-content-entry.ts. The lint gets it through `guardNames`.
 */
const WORKING_SUFFIX = "-wonder-world";
const APP_FOLDER = basename(resolve(dirname(fileURLToPath(import.meta.url)), "../../.."));
const GUARD_NAMES: readonly string[] =
  APP_FOLDER.endsWith(WORKING_SUFFIX) && APP_FOLDER.length > WORKING_SUFFIX.length ? [APP_FOLDER.slice(0, -WORKING_SUFFIX.length)] : [];

/** Asserts that one of the messages contains `fragment`, showing them all on failure. */
function expectProblem(errors: readonly string[], fragment: string): void {
  expect(errors.join("\n")).toContain(fragment);
}

/** Simulates content that arrived as data and may break the static types. */
function untrusted<T>(value: T): StorySpec {
  return JSON.parse(JSON.stringify(value));
}

const REVIEW = { language: "approved", rights: "approved", reviewer: "agent:test", date: "2026-10-29" } as const;

const baseLocale: LocalePack = {
  locale: "en",
  lines: {
    "e01.greet.1": "Hi! Hi, friend!",
    "e01.hook.1": "A ball! Look at the ball.",
    "e01.invite.1": "Ready...",
    "e01.invite.r1": "Go! Go, ball!",
    "e01.fetch.1": "Sheru brings the ball back.",
    "e01.repeat.1": "More ball?",
    "e01.outro.1": "All done!",
    "e01.outro.2": "Bye, Sheru."
  },
  strings: {
    "e01.title": "Test Ball Day",
    "e01.offline": "Roll a real ball back and forth.",
    "e01.bridge": "Sit facing your child and roll a soft ball.",
    "e01.tip.1": "Wait a moment for a look or a reach."
  }
};

const baseBeats: readonly BeatSpec[] = [
  {
    id: "hello-song",
    kind: "greeting",
    camera: "wide",
    stage: [{ do: "music", bed: "meadowBed" }, { do: "song", song: "hello" }, { do: "gesture", actor: "momo", gesture: "wave" }],
    lines: [],
    holdMs: 10500
  },
  {
    id: "greet",
    kind: "greeting",
    stage: [{ do: "face", actor: "momo", toward: "viewer" }],
    lines: [{ speaker: "momo", key: "e01.greet.1" }],
    words: [{ wordId: "hi", objectId: "momo" }],
    holdMs: 9000
  },
  {
    id: "hook",
    kind: "hook",
    stage: [{ do: "object", target: "ball", action: "roll" }],
    lines: [{ speaker: "momo", key: "e01.hook.1" }],
    words: [{ wordId: "ball", objectId: "ball" }],
    holdMs: 20000
  },
  {
    id: "invite",
    kind: "invite",
    stage: [{ do: "face", actor: "momo", toward: "viewer" }],
    lines: [{ speaker: "momo", key: "e01.invite.1" }],
    holdMs: 1000,
    input: { type: "tap", targets: ["ball"] },
    waitMs: 5000,
    caregiverPromptKey: "e01.tip.1",
    response: {
      stage: [{ do: "move", actor: "ball", to: "farLeft", style: "roll" }, { do: "sfx", sound: "woof" }],
      lines: [{ speaker: "momo", key: "e01.invite.r1" }],
      holdMs: 2000
    },
    words: [{ wordId: "go", objectId: "ball" }]
  },
  {
    id: "fetch",
    kind: "event",
    stage: [{ do: "carry", actor: "sheru", item: "ball" }, { do: "move", actor: "sheru", to: "center", style: "run" }],
    reducedMotionStage: [{ do: "carry", actor: "sheru", item: "ball" }, { do: "move", actor: "sheru", to: "center", style: "walk" }],
    lines: [{ speaker: "narrator", key: "e01.fetch.1" }],
    words: [{ wordId: "ball", objectId: "ball" }],
    holdMs: 20000
  },
  {
    id: "repeat",
    kind: "repeat",
    stage: [{ do: "carry", actor: "sheru", item: null }],
    lines: [{ speaker: "momo", key: "e01.repeat.1" }],
    words: [{ wordId: "more", objectId: "ball" }],
    holdMs: 20000
  },
  {
    id: "song",
    kind: "song",
    stage: [{ do: "song", song: "ballRolls" }, { do: "gesture", actor: "momo", gesture: "sway", loop: true }],
    reducedMotionStage: [{ do: "song", song: "ballRolls" }],
    lines: [],
    holdMs: 17000
  },
  {
    id: "outro",
    kind: "outro",
    stage: [{ do: "music", bed: null }, { do: "gesture", actor: "momo", gesture: "wave" }],
    lines: [
      { speaker: "momo", key: "e01.outro.1" },
      { speaker: "momo", key: "e01.outro.2" }
    ],
    words: [
      { wordId: "all-done", objectId: "momo" },
      { wordId: "bye", objectId: "sheru" }
    ],
    holdMs: 5000
  }
];

const draft: EpisodeSpec = {
  kind: "episode",
  id: "test-ball-day",
  number: 1,
  version: 1,
  phase: "P1",
  titleKey: "e01.title",
  world: "meadow",
  host: "momo",
  cast: [
    { id: "momo", at: "left" },
    { id: "sheru", at: "right" }
  ],
  props: [
    { id: "ball", asset: "ball", at: "center", size: 0.4, tint: "#E4574B" },
    { id: "bush", asset: "bush", at: "backLeft" }
  ],
  targetWords: ["ball", "go", "more"],
  supportWords: ["hi", "bye", "all-done"],
  music: "meadowBed",
  offlinePlayKey: "e01.offline",
  caregiverBridgeKey: "e01.bridge",
  review: REVIEW,
  estimatedDurationSec: 120,
  beats: baseBeats
};

/** The synthetic episode, with its declared length set to the computed estimate. */
const base: EpisodeSpec = { ...draft, estimatedDurationSec: Math.round(estimateStoryMs(draft, baseLocale) / 1000) };

function editBeat(story: EpisodeSpec, id: string, edit: (beat: BeatSpec) => BeatSpec): EpisodeSpec {
  return { ...story, beats: story.beats.map((beat) => (beat.id === id ? edit(beat) : beat)) };
}

function withLines(lines: Readonly<Record<string, string>>): LocalePack {
  return { ...baseLocale, lines: { ...baseLocale.lines, ...lines } };
}

const activityLocale: LocalePack = {
  locale: "en",
  lines: {
    "g01.hello.1": "Hi! Bubbles are coming.",
    "g01.blow.1": "A bubble! A big bubble.",
    "g01.blow.r1": "Pop!",
    "g01.more.1": "More bubbles?",
    "g01.bye.1": "All done. Bye-bye!"
  },
  strings: {
    "g01.title": "Test Bubbles",
    "g01.offline": "Blow real bubbles together.",
    "g01.bridge": "Blow bubbles slowly and wait before each one."
  }
};

const baseActivity: ActivitySpec = {
  kind: "activity",
  id: "test-bubbles",
  number: 1,
  version: 1,
  phase: "P1",
  titleKey: "g01.title",
  world: "meadow",
  host: "momo",
  cast: [{ id: "momo", at: "left" }],
  props: [{ id: "bubble", asset: "bubble", at: "center", hidden: true }],
  targetWords: ["bubble", "pop", "more"],
  supportWords: ["hi", "bye"],
  offlinePlayKey: "g01.offline",
  caregiverBridgeKey: "g01.bridge",
  review: REVIEW,
  roundLimit: 3,
  options: { allowTap: true, dragAlternative: "tap", microphoneRequired: false },
  intro: [
    { id: "hello", kind: "greeting", stage: [{ do: "gesture", actor: "momo", gesture: "wave" }], lines: [{ speaker: "momo", key: "g01.hello.1" }], words: [{ wordId: "hi", objectId: "momo" }], holdMs: 1000 }
  ],
  round: [
    {
      id: "blow",
      kind: "invite",
      stage: [{ do: "show", actor: "bubble" }, { do: "sfx", sound: "bubbleBlow" }],
      lines: [{ speaker: "momo", key: "g01.blow.1" }],
      words: [
        { wordId: "bubble", objectId: "bubble" },
        { wordId: "pop", objectId: "bubble" }
      ],
      holdMs: 500,
      input: { type: "tap", targets: ["bubble"] },
      response: { stage: [{ do: "object", target: "bubble", action: "pop" }, { do: "sfx", sound: "pop" }], lines: [{ speaker: "momo", key: "g01.blow.r1" }], holdMs: 1000 }
    },
    {
      id: "more",
      kind: "repeat",
      stage: [],
      lines: [{ speaker: "momo", key: "g01.more.1" }],
      words: [{ wordId: "more", objectId: "momo" }],
      holdMs: 500,
      input: { type: "more-or-done", targets: ["momo"] }
    }
  ],
  outro: [
    { id: "bye", kind: "outro", stage: [{ do: "gesture", actor: "momo", gesture: "wave" }], lines: [{ speaker: "momo", key: "g01.bye.1" }], words: [{ wordId: "bye", objectId: "momo" }], holdMs: 2000 }
  ]
};

describe("the real catalog (PRD 04 C02, J05, J14)", () => {
  it("lists the canonical 20 episodes, then the 12 activities", () => {
    expect(EPISODES.map((story) => story.id)).toEqual([...EPISODE_SLUGS]);
    expect(ACTIVITIES.map((story) => story.id)).toEqual([...ACTIVITY_SLUGS]);
    expect(EPISODES.map((story) => story.number)).toEqual(EPISODE_SLUGS.map((_, index) => index + 1));
    expect(ACTIVITIES.map((story) => story.number)).toEqual(ACTIVITY_SLUGS.map((_, index) => index + 1));
    expect(STORIES).toEqual([...EPISODES, ...ACTIVITIES]);
    expect(EPISODES.every((story) => story.kind === "episode")).toBe(true);
    expect(ACTIVITIES.every((story) => story.kind === "activity")).toBe(true);
  });

  it("finds stories by id and code", () => {
    const e17 = storyById("sheru-big-adventure");
    expect(e17 && storyCode(e17)).toBe("e17");
    const g03 = storyById("sheru-ball");
    expect(g03 && storyCode(g03)).toBe("g03");
    expect(storyByCode("e05")?.id).toBe("counting-cookies");
    expect(storyByCode("g12")?.id).toBe("find-my-real-toy");
    expect(storyById("no-such-story")).toBeUndefined();
  });

  it("marks exactly E01, E02, E05, E06, E09, E17 and G01-G03 as the P1 pilot", () => {
    const p1 = STORIES.filter((story) => story.phase === "P1").map((story) => storyCode(story));
    expect(p1.sort()).toEqual(["e01", "e02", "e05", "e06", "e09", "e17", "g01", "g02", "g03"]);
  });

  it("passes the content lint with no problems", () => {
    expect(validateCatalog(STORIES, en, { guardNames: GUARD_NAMES })).toEqual([]);
  });

  it("passes with the generated audio manifest (recorded audio is required once any line is recorded)", () => {
    const requireAudio = Object.keys(AUDIO_MANIFEST.lines).length > 0;
    expect(validateCatalog(STORIES, en, { audio: AUDIO_MANIFEST, requireAudio, guardNames: GUARD_NAMES })).toEqual([]);
  });

  it("keeps every story approved for language and rights", () => {
    for (const story of STORIES) {
      expect(story.review.language).toBe("approved");
      expect(story.review.rights).toBe("approved");
      expect(story.review.reviewer.length).toBeGreaterThan(0);
    }
  });
});

describe("locale packs (PRD 04 C07, C08)", () => {
  it("defines every UI string the app looks up, with its placeholders", () => {
    const missing = REQUIRED_UI_KEYS.filter((key) => (en.strings[key] ?? "").trim() === "");
    expect(missing).toEqual([]);
    expect(en.strings["ui.parent.seconds"]).toContain("{s}");
    expect(en.strings["ui.parent.wordsCount"]).toContain("{n}");
    expect(en.strings["ui.parent.wordsCount"]).toContain("{max}");
    expect(en.strings["ui.start.title"]).toBe("Wonder World");
    expect(en.strings["ui.note.start"]).toBe("Play alongside your child when you can. All activities work by touch; speaking isn't required.");
    expect(en.strings["ui.note.safety"]).toContain("not therapy");
    expect(en.strings["ui.note.privacy"]).toContain("No account, no microphone, nothing leaves this device");
  });

  it("keeps every locale file to its own keys", () => {
    const codes = new Map(STORIES.map((story) => [story.id, storyCode(story)]));
    expect(EN_PARTS).toHaveLength(STORIES.length + 1);
    for (const part of EN_PARTS) {
      const slug = part.source.split("/").pop() ?? "";
      const prefix = part.source === "ui" ? "ui." : `${codes.get(slug) ?? "missing"}.`;
      const keys = [...Object.keys(part.lines ?? {}), ...Object.keys(part.strings ?? {})];
      expect(keys.filter((key) => !key.startsWith(prefix)), part.source).toEqual([]);
    }
  });

  it("treats a duplicate key as an error, naming every clash", () => {
    expect(() =>
      mergeLocaleParts("en", [
        { source: "a", lines: { "e01.hook.1": "Ball!" } },
        { source: "b", lines: { "e01.hook.1": "Ball again!" } }
      ])
    ).toThrow(/duplicate key.*e01\.hook\.1 in b \(lines\) and a \(lines\)/);
    expect(() => mergeLocaleParts("en", [{ source: "a", lines: { "e01.title": "x" }, strings: { "e01.title": "y" } }])).toThrow(/e01\.title/);
    const merged = mergeLocaleParts("en", [{ source: "a", lines: { "e01.hook.1": "Ball!" } }, { source: "b", strings: { "e01.title": "T" } }]);
    expect(merged).toEqual({ locale: "en", lines: { "e01.hook.1": "Ball!" }, strings: { "e01.title": "T" } });
  });

  it("keeps the Punjabi pack empty and disabled until native review", () => {
    expect(PA_STATUS.enabled).toBe(false);
    expect(pa.locale).toBe("pa");
    expect(Object.keys(pa.lines)).toEqual([]);
    expect(Object.keys(pa.strings)).toEqual([]);
    expect(ENABLED_LOCALES).toEqual(["en"]);
    expect(Object.keys(LOCALE_PACKS)).toEqual(["en"]);
    expect(localePack("pa")).toBeUndefined();
    expect(localePack("en")).toBe(en);
  });
});

describe("songs, sound effects, music beds and words", () => {
  it("pass the library checks", () => {
    expect(validateLibraries(en, GUARD_NAMES)).toEqual([]);
  });

  it("sing the two PRD songs word for word", () => {
    expect(SONGS.goStop.lyrics).toEqual(["Clap, clap, clap with me.", "One, two, three!", "Go, go, go!", "Now ... stop!"]);
    expect(SONGS.ballRolls.lyrics).toEqual(["Ball, ball, rolling ball", "Here it comes, and there it goes", "Stop, ball, stop", "Let's roll it once more!"]);
    expect(SONGS.goStop.lyrics).toEqual([...PRD_SONG_LYRICS.goStop]);
  });

  it("keep hello and all-done short (8-15 s) and every other song 15-30 s, with one motion per line", () => {
    for (const id of SONG_IDS) {
      const song = SONGS[id];
      const seconds = songLengthSec(song);
      if (id === "hello" || id === "allDone") expect(seconds, id).toBeGreaterThanOrEqual(8);
      else expect(seconds, id).toBeGreaterThanOrEqual(15);
      expect(seconds, id).toBeLessThanOrEqual(id === "hello" || id === "allDone" ? 15 : 30);
      expect(song.motions, id).toHaveLength(song.lyrics.length);
      expect(song.style, id).toContain(`${song.bpm} bpm`);
      expect(song.vocal, id).toBe("sung");
    }
  });

  it("use an original birthday song and one letter (B, for E03) in the letter song", () => {
    expect(SONGS.birthday.lyrics.join(" ")).not.toMatch(/happy\s+birthday/i);
    expect([...new Set(SONGS.abc.lyrics.flatMap((lyric) => lettersNamedIn(lyric)))]).toEqual(["B"]);
    for (const story of STORIES) {
      const plays = (story.kind === "episode" ? story.beats : [...story.intro, ...story.round, ...story.outro]).some((beat) =>
        beat.stage.some((action) => action.do === "song" && action.song === "abc")
      );
      if (plays) expect(story.letterConcept?.letter, story.id).toBe("B");
    }
  });

  it("names only the story's own letter in its songs and lines", () => {
    const withAbc = editBeat(base, "song", (beat) => ({ ...beat, stage: [{ do: "song", song: "abc" }], reducedMotionStage: [{ do: "song", song: "abc" }] }));
    expectProblem(validateStory(withAbc, baseLocale), 'song "abc" names the letter B, but the story has no letterConcept');
    expect(lettersNamedIn("A ball! Look at the ball.")).toEqual([]);
    expect(lettersNamedIn("Here is A, big A.")).toEqual(["A"]);
    expect(lettersNamedIn("B for ball, and the letter M.")).toEqual(["B", "M"]);
    const lineLetter = validateStory(base, withLines({ "e01.hook.1": "A ball! B is for ball." }));
    expectProblem(lineLetter, 'line e01.hook.1 "A ball! B is for ball." names the letter B, but the story has no letterConcept');
  });

  it("hear a word and its inflections, never a different word that starts the same way", () => {
    expect(wordSpoken("ball", "Balls! Two balls.")).toBe(true);
    expect(wordSpoken("ball", "A red balloon.")).toBe(false);
    expect(wordSpoken("bell", "A rumbly belly.")).toBe(false);
    expect(wordSpoken("moo", "The moon is up.")).toBe(false);
    expect(wordSpoken("moo", "Mooo!")).toBe(true);
    expect(wordSpoken("car", "The carriage opens.")).toBe(false);
    expect(wordSpoken("pop", "It popped!")).toBe(true);
    expect(wordSpoken("dance", "Lulu is dancing.")).toBe(true);
    expect(wordSpoken("close", "The door closed.")).toBe(true);
    expect(wordSpoken("teddy", "Two teddies.")).toBe(true);
    // A letter word counts only when the letter is named, never the article "a".
    expect(wordSpoken("a", "A ball!")).toBe(false);
    expect(wordSpoken("a", "This letter is A.")).toBe(true);
    expect(wordSpoken("b", "B-b-ball.")).toBe(false);
    expect(wordSpoken("b", "B. Bee.")).toBe(true);
    expectProblem(validateStory(base, withLines({ "e01.hook.1": "A balloon! Look at the balloon." })), 'beat "hook": names the word "ball" but none of its lines say it');
  });

  it("keep effects soft and short and beds calm, quiet instrumental loops", () => {
    for (const [id, sfx] of Object.entries(SFX)) {
      expect(sfx.prompt, id).toMatch(/soft|gentle/);
      expect(sfx.durationSec, id).toBeGreaterThanOrEqual(0.5);
      expect(sfx.durationSec, id).toBeLessThanOrEqual(3);
      expect(sfx.gain, id).toBeGreaterThan(0);
      expect(sfx.gain, id).toBeLessThanOrEqual(0.6);
    }
    for (const [id, bed] of Object.entries(MUSIC_BEDS)) {
      for (const word of ["calm", "quiet", "instrumental", "loop"]) expect(bed.prompt, id).toContain(word);
    }
  });

  it("list exactly the allowed vocabulary, each word with a category, model phrase and offline prompt", () => {
    const allowed =
      "more, again, help, go, stop, up, down, open, close, pop, roll, hi, hello, bye, thank-you, my-turn, your-turn, all-done, ball, dog, car, train, book, teddy, bear, eat, drink, wash, brush, sleep, wake, woof, moo, quack, baa, neigh, tweet, beep, boom, apple, banana, cookie, cake, hat, bird, butterfly, water, flower, hand, hands, foot, feet, nose, tummy, door, box, bed, moon, big, small, in, out, wet, dry, fast, slow, on, under, behind, red, blue, yellow, green, one, two, three, b, a, bubble, look, find, where, there, blow, circle, square, triangle, clap, stomp, dance, ah, oh, mmm, uh-oh, block, drum, lift, star, chick, cow, sheep, duck, horse, robot, mirror, sun, cloud, balloon, bell, plate, picnic, sponge, towel, wave, peekaboo";
    expect([...WORD_IDS]).toEqual(allowed.split(", "));
    for (const id of WORD_IDS) {
      const word = WORDS[id];
      expect(word.model.length, id).toBeGreaterThan(0);
      expect(word.offline.length, id).toBeGreaterThan(0);
      expect(wordSpoken(id, word.model), id).toBe(true);
    }
  });
});

describe("the content lint catches each rule (synthetic stories)", () => {
  it("accepts the synthetic episode and activity", () => {
    expect(base.estimatedDurationSec).toBeGreaterThanOrEqual(120);
    expect(validateStory(base, baseLocale)).toEqual([]);
    expect(validateStory(baseActivity, activityLocale)).toEqual([]);
  });

  it("rejects duplicate ids", () => {
    const story = editBeat(base, "hook", (beat) => ({ ...beat, id: "greet" }));
    expectProblem(validateStory(story, baseLocale), 'beat id "greet" is used twice');
    const props = { ...base, props: [...base.props, { id: "momo", asset: "teddy" as const, at: "front" as const }] };
    expectProblem(validateStory(props, baseLocale), 'prop id "momo" is used twice');
    const catalog = validateCatalog([base, { ...base, number: 2 }], baseLocale, { complete: false });
    expectProblem(catalog, 'story id "test-ball-day" is used by 2 stories');
  });

  it("rejects line and string keys missing from the locale", () => {
    const { ["e01.hook.1"]: _hook, ...lines } = baseLocale.lines;
    expectProblem(validateStory(base, { ...baseLocale, lines }), "line e01.hook.1 has no text in the en locale");
    for (const key of ["e01.title", "e01.offline", "e01.bridge", "e01.tip.1"]) {
      const strings = Object.fromEntries(Object.entries(baseLocale.strings).filter(([k]) => k !== key));
      expectProblem(validateStory(base, { ...baseLocale, strings }), key);
    }
  });

  it("rejects keys that break the e01-e20 / g01-g12 scheme and unused locale entries", () => {
    const story = editBeat(base, "hook", (beat) => ({ ...beat, lines: [{ speaker: "momo", key: "hook.1" }] }));
    expectProblem(validateStory(story, withLines({ "hook.1": "A ball!" })), 'line key "hook.1" must look like "e01.hook.<n>"');
    expectProblem(validateStory(base, withLines({ "e01.hook.9": "Extra" })), "locale line e01.hook.9 is never spoken");
    expectProblem(validateStory({ ...base, titleKey: "e01.name" }, baseLocale), 'titleKey "e01.name" must be "e01.title"');
  });

  it("rejects too many or too few target words, and words outside the vocabulary", () => {
    expectProblem(validateStory({ ...base, targetWords: ["ball", "go", "more", "hi"], supportWords: ["bye", "all-done"] }, baseLocale), "targetWords has 4 words");
    expectProblem(validateStory({ ...base, targetWords: [] }, baseLocale), "targetWords has 0 words");
    expectProblem(validateStory({ ...base, targetWords: ["ball", "go", "zebra"] }, baseLocale), '"zebra" is not in the allowed vocabulary');
    const beatWord = editBeat(base, "hook", (beat) => ({ ...beat, words: [{ wordId: "football", objectId: "ball" }] }));
    expectProblem(validateStory(beatWord, baseLocale), 'word "football" is not in the allowed vocabulary');
  });

  it("allows four target words only for counting and animal-sound clusters", () => {
    const errors = validateStory({ ...base, targetWords: ["moo", "baa", "quack", "woof"] }, baseLocale);
    expect(errors.join("\n")).not.toContain("targetWords has 4 words");
  });

  it("rejects a target word that no beat names with an existing, visible object", () => {
    const unnamed = editBeat(base, "repeat", (beat) => ({ ...beat, words: [] }));
    expectProblem(validateStory(unnamed, baseLocale), 'target word "more" is never named');
    const ghost = editBeat(base, "hook", (beat) => ({ ...beat, words: [{ wordId: "ball", objectId: "kite" }] }));
    expectProblem(validateStory(ghost, baseLocale), 'points at "kite", which is not a cast or prop id');
    const hidden = { ...base, props: base.props.map((prop) => (prop.id === "bush" ? { ...prop, hidden: true } : prop)) };
    const bushWord = editBeat(hidden, "hook", (beat) => ({ ...beat, words: [{ wordId: "ball", objectId: "ball" }, { wordId: "look", objectId: "bush" }] }));
    expectProblem(validateStory(bushWord, baseLocale), '"bush" is not visible during the beat');
    const unspoken = editBeat(base, "hook", (beat) => ({ ...beat, words: [{ wordId: "ball", objectId: "ball" }, { wordId: "red", objectId: "ball" }] }));
    expectProblem(validateStory(unspoken, baseLocale), 'names the word "red" but none of its lines say it');
  });

  it("requires an invite beat with input, a greeting first and an outro last", () => {
    const noInvite = editBeat(base, "invite", (beat) => ({ ...beat, kind: "event" }));
    expectProblem(validateStory(noInvite, baseLocale), "there is no invite beat with input");
    const noOutro = editBeat(base, "outro", (beat) => ({ ...beat, kind: "event" }));
    expectProblem(validateStory(noOutro, baseLocale), "the final beat must be an outro");
    const noGreeting = editBeat(base, "hello-song", (beat) => ({ ...beat, kind: "hook" }));
    expectProblem(validateStory(noGreeting, baseLocale), "an episode opens with a greeting beat");
    const waitingEnd = editBeat(base, "outro", (beat) => ({ ...beat, input: { type: "tap", targets: ["momo"] } }));
    expectProblem(validateStory(waitingEnd, baseLocale), "the final beat must not wait for input");
  });

  it("rejects stage actions on unknown actors and targets", () => {
    const story = editBeat(base, "hook", (beat) => ({
      ...beat,
      stage: [
        { do: "object", target: "kite", action: "roll" },
        { do: "gesture", actor: "lulu", gesture: "wave" },
        { do: "face", actor: "momo", toward: "moon" },
        { do: "carry", actor: "sheru", item: "momo" }
      ]
    }));
    const errors = validateStory(story, baseLocale);
    expectProblem(errors, 'object target "kite" is not a cast or prop id');
    expectProblem(errors, 'gesture actor "lulu" is not a cast or prop id');
    expectProblem(errors, 'face target "moon" is not "viewer" or a cast or prop id');
    expectProblem(errors, 'carried item "momo" is not a prop id');
  });

  it("allows at most two existing, visible tap targets", () => {
    const three = editBeat(base, "invite", (beat) => ({ ...beat, input: { type: "tap", targets: ["ball", "momo", "sheru"] } }));
    expectProblem(validateStory(three, baseLocale), "input lists 3 tap targets; at most 2");
    const unknown = editBeat(base, "invite", (beat) => ({ ...beat, input: { type: "tap", targets: ["kite"] } }));
    expectProblem(validateStory(unknown, baseLocale), 'tap target "kite" is not a cast or prop id');
    const hiddenBall = { ...base, props: base.props.map((prop) => (prop.id === "ball" ? { ...prop, hidden: true } : prop)) };
    expectProblem(validateStory(hiddenBall, baseLocale), 'tap target "ball" is not visible');
  });

  it("requires approved language and rights review", () => {
    const errors = validateStory(untrusted({ ...base, review: { ...REVIEW, language: "pending", rights: "draft" } }), baseLocale);
    expectProblem(errors, 'review.language is "pending"');
    expectProblem(errors, 'review.rights is "draft"');
  });

  it("keeps episodes 120-240 s and within 25% of the computed length", () => {
    expectProblem(validateStory({ ...base, estimatedDurationSec: 300 }, baseLocale), "estimatedDurationSec 300 must be 120-240 s");
    const far = Math.round(base.estimatedDurationSec * 0.6);
    expectProblem(validateStory({ ...base, estimatedDurationSec: far }, baseLocale), `estimatedDurationSec ${far} is more than 25% away`);
  });

  it("rejects every banned phrase", () => {
    const samples: Record<string, string> = {
      "say it": "Ball! Say it!",
      "repeat after me": "Repeat after me: ball.",
      wrong: "Oops, wrong ball.",
      "try again": "Try again!",
      "good job saying": "Good job saying ball!",
      "try harder": "Try harder!"
    };
    for (const phrase of ["say it", "repeat after me", "wrong", "try again", "good job saying", "try harder"]) {
      expect(BANNED_PHRASES).toContain(phrase);
      const errors = validateStory(base, withLines({ "e01.repeat.1": `More ball? ${samples[phrase] ?? ""}` }));
      expectProblem(errors, `uses the banned phrase "${phrase}"`);
    }
    const strings = { ...baseLocale.strings, "e01.offline": "Roll a ball. Try again if it goes wrong." };
    expectProblem(validateStory(base, { ...baseLocale, strings }), 'uses the banned phrase "try again"');
  });

  it("rejects family names and the child's name in default lines", () => {
    for (const name of ["Mama", "Papa"]) {
      const errors = validateStory(base, withLines({ "e01.outro.2": `Bye, Sheru. Bye, ${name}.` }));
      expectProblem(errors, `uses the family or child name "${name.toLowerCase()}"`);
    }
    // The child's name is not in the shipped list: the caller passes it as a guard name.
    expect(GUARD_NAMES).toHaveLength(1);
    for (const name of GUARD_NAMES) {
      const capitalised = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      const line = withLines({ "e01.outro.2": `Bye, Sheru. Bye, ${capitalised}.` });
      expectProblem(validateStory(base, line, { guardNames: GUARD_NAMES }), `uses the family or child name "${name}"`);
      const ui = { ...baseLocale, strings: { ...baseLocale.strings, "ui.pause": `Hi ${capitalised}` } };
      expectProblem(validateCatalog([base], ui, { complete: false, guardNames: GUARD_NAMES }), `UI string ui.pause uses the family or child name "${name}"`);
    }
    expectProblem(validateStory(base, withLines({ "e01.outro.2": "Bye, Sheru. Bye, Pip." })), 'says "Pip"; the chick is Peeko');
  });

  it("rejects songs, sound effects and music beds that do not exist", () => {
    const story = untrusted({
      ...base,
      beats: base.beats.map((beat) =>
        beat.id === "hook"
          ? { ...beat, stage: [{ do: "song", song: "happyBirthday" }, { do: "sfx", sound: "roar" }, { do: "music", bed: "forestBed" }] }
          : beat
      )
    });
    const errors = validateStory(story, baseLocale);
    expectProblem(errors, 'song "happyBirthday" does not exist');
    expectProblem(errors, 'sound effect "roar" does not exist');
    expectProblem(errors, 'music bed "forestBed" does not exist');
  });

  it("checks a song's performers and line cues (07 B20)", () => {
    const withSong = (song: Record<string, unknown>): StorySpec =>
      untrusted(editBeat(base, "song", (beat) => ({ ...beat, stage: beat.stage.map((action) => (action.do === "song" ? { ...action, ...song } : action)) })));
    const cue = (line: number, stage: readonly unknown[]): Record<string, unknown> => ({ line, stage });
    expect(validateStory(withSong({ performers: ["momo"], cues: [cue(1, [{ do: "sfx", sound: "woof" }])] }), baseLocale)).toEqual([]);
    expectProblem(validateStory(withSong({ performers: ["lulu"] }), baseLocale), 'song performer "lulu" is not in the cast');
    expectProblem(validateStory(withSong({ cues: [cue(4, [])] }), baseLocale), 'song "ballRolls" cue line 4 is outside its 4 lyric lines');
    expectProblem(validateStory(withSong({ cues: [cue(1, []), cue(1, [])] }), baseLocale), 'song "ballRolls" has two cues for line 1');
    expectProblem(validateStory(withSong({ cues: [cue(2, [{ do: "song", song: "hello" }])] }), baseLocale), "cue line 2 starts another song");
    expectProblem(validateStory(withSong({ cues: [cue(0, [{ do: "sfx", sound: "roar" }])] }), baseLocale), 'song cue 0: sound effect "roar" does not exist');
  });

  it("never lets a song play under speech or get cut off", () => {
    const underSpeech = editBeat(base, "greet", (beat) => ({ ...beat, stage: [...beat.stage, { do: "song", song: "goStop" }] }));
    expectProblem(validateStory(underSpeech, baseLocale), "would play under the beat's own spoken lines");
    const tooShort = editBeat(base, "song", (beat) => ({ ...beat, holdMs: 9000 }));
    expectProblem(validateStory(tooShort, baseLocale), 'song "ballRolls" (16 s) is still playing when the next line starts');
  });

  it("keeps Sheru's voice to barks and every speaker on stage", () => {
    const sheru = editBeat(base, "repeat", (beat) => ({ ...beat, lines: [{ speaker: "sheru", key: "e01.repeat.1" }] }));
    expectProblem(validateStory(sheru, baseLocale), "given to Sheru, who never speaks");
    const lulu = editBeat(base, "repeat", (beat) => ({ ...beat, lines: [{ speaker: "lulu", key: "e01.repeat.1" }] }));
    expectProblem(validateStory(lulu, baseLocale), 'spoken by "lulu", who is not in the cast');
  });

  it("keeps lines short and counting at three or below", () => {
    expectProblem(validateStory(base, withLines({ "e01.hook.1": "A ball! Look at the ball rolling over the grass and down the little hill." })), "keep lines to 12 or fewer");
    expectProblem(validateStory(base, withLines({ "e01.hook.1": "A ball! Four balls! Five balls!" })), "counts to 4; counting stops at 3");
    expectProblem(validateStory(base, withLines({ "e01.hook.1": "A ball! Fifteen balls!" })), "counts to 15; counting stops at 3");
  });

  it("keeps phonics notation out of spoken lines (text-to-speech reads /b/ as the letter name)", () => {
    expectProblem(validateStory(base, withLines({ "e01.hook.1": "A ball! /b/, ball." })), "writes a sound in phonics notation");
    const tip = { ...baseLocale, strings: { ...baseLocale.strings, "e01.tip.1": "Stretch the first sound, /b/, as you roll the ball." } };
    expect(validateStory(base, tip)).toEqual([]);
  });

  it("keeps a speaking character on stage", () => {
    const leaves = editBeat(base, "repeat", (beat) => ({ ...beat, stage: [...beat.stage, { do: "exit", actor: "momo", to: "offLeft" }] }));
    expectProblem(validateStory(leaves, baseLocale), "momo speaks line e01.repeat.1 while off stage");
    const hidden = { ...base, cast: base.cast.map((member) => (member.id === "momo" ? { ...member, hidden: true } : member)) };
    expectProblem(validateStory(hidden, baseLocale), "momo speaks line e01.greet.1 while off stage");
  });

  it("moves a carried item with its carrier", () => {
    const carried: EpisodeSpec = {
      ...base,
      props: [...base.props, { id: "wand", asset: "bubbleWand", at: "offLeft", hidden: true }],
      beats: base.beats.map((beat) =>
        beat.id === "hook"
          ? { ...beat, stage: [...beat.stage, { do: "show", actor: "wand" }, { do: "carry", actor: "momo", item: "wand" }], words: [...(beat.words ?? []), { wordId: "look", objectId: "wand" }] }
          : beat
      )
    };
    expect(validateStory(carried, baseLocale)).toEqual([]);
    const carrierLeaves = editBeat(carried, "hook", (beat) => ({ ...beat, stage: [...beat.stage, { do: "exit", actor: "momo", to: "offLeft" }] }));
    expectProblem(validateStory(carrierLeaves, baseLocale), 'names "look" with "wand", but "wand" is not visible during the beat');
  });

  it("links every target word to its story in the PRD core-word tables", () => {
    const swapped = STORIES.map((story) => (story.id === "sheru-big-adventure" ? { ...story, targetWords: [...story.targetWords.slice(0, 2), "cake"] } : story));
    expectProblem(validateCatalog(swapped, en), 'e17 targets "cake", but words.ts does not link "cake" to e17');
  });

  it("keeps reduced motion to the same stage and the same music", () => {
    const vanish = editBeat(base, "fetch", (beat) => ({ ...beat, reducedMotionStage: [{ do: "hide", actor: "ball" }] }));
    expectProblem(validateStory(vanish, baseLocale), "reducedMotionStage changes what is on stage");
    const silent = editBeat(base, "song", (beat) => ({ ...beat, reducedMotionStage: [] }));
    expectProblem(validateStory(silent, baseLocale), "reducedMotionStage changes the songs or music");
  });

  it("keeps more-or-done to the last round beat of an activity", () => {
    const episode = editBeat(base, "invite", (beat) => ({ ...beat, input: { type: "more-or-done", targets: ["ball"] } }));
    expectProblem(validateStory(episode, baseLocale), '"more-or-done" belongs to activity rounds only');
    const noMore = { ...baseActivity, round: baseActivity.round.map((beat) => (beat.id === "more" ? { ...beat, input: { type: "tap" as const, targets: ["momo"] } } : beat)) };
    expectProblem(validateStory(noMore, activityLocale), 'the last round beat "more" must wait with input "more-or-done"');
    const early = { ...baseActivity, intro: baseActivity.intro.map((beat) => ({ ...beat, input: { type: "more-or-done" as const, targets: ["momo"] } })) };
    expectProblem(validateStory(early, activityLocale), '"more-or-done" is only for the last round beat');
  });

  it("keeps activities finite, tap-only and repeatable round after round", () => {
    expectProblem(validateStory({ ...baseActivity, roundLimit: 0 }, activityLocale), "roundLimit 0 must be a whole number from 1 to 5");
    expectProblem(validateStory({ ...baseActivity, roundLimit: 50 }, activityLocale), "roundLimit 50 must be a whole number from 1 to 5");
    const mic = untrusted({ ...baseActivity, options: { allowTap: true, dragAlternative: "tap", microphoneRequired: true } });
    expectProblem(validateStory(mic, activityLocale), "microphoneRequired: false");
    const noReshow = {
      ...baseActivity,
      round: baseActivity.round.map((beat) => (beat.id === "blow" ? { ...beat, stage: [{ do: "sfx" as const, sound: "bubbleBlow" as const }] } : beat))
    };
    expectProblem(validateStory({ ...noReshow, props: [{ id: "bubble", asset: "bubble", at: "center" }] }, activityLocale), 'tap target "bubble" is not visible');
  });

  it("requires recorded audio for every line, song, effect and bed when asked", () => {
    const empty = { lines: {}, sfx: {}, songs: {}, beds: {} };
    const errors = validateStory(base, baseLocale, { audio: empty, requireAudio: true });
    expectProblem(errors, "no recorded audio for line e01.hook.1");
    expectProblem(errors, "no recorded audio for song ballRolls");
    expectProblem(errors, "no recorded audio for sound effect woof");
    expectProblem(errors, "no recorded audio for music bed meadowBed");
  });

  it("checks the catalog shape, line-key ownership and stray locale keys", () => {
    const missing = validateCatalog([base], baseLocale);
    expectProblem(missing, "catalog: e02 (peekaboo-palace) is missing from the catalog");
    expectProblem(missing, 'catalog: e01 has id "test-ball-day"; the canonical slug is "momo-magic-mouth"');
    const stray = validateCatalog([base], { ...baseLocale, strings: { ...baseLocale.strings, "x.hello": "Hello" } }, { complete: false });
    expectProblem(stray, "locale strings key x.hello belongs to no story or UI namespace");
    const uiWords = validateCatalog([base], { ...baseLocale, strings: { ...baseLocale.strings, "ui.pause": "Wrong button" } }, { complete: false });
    expectProblem(uiWords, 'UI string ui.pause uses the banned phrase "wrong"');
    const shared = { ...base, id: "test-copy", number: 2, titleKey: "e02.title", offlinePlayKey: "e02.offline", caregiverBridgeKey: "e02.bridge" };
    expectProblem(validateCatalog([base, shared], baseLocale, { complete: false }), "line key e01.greet.1 is used by both e01 and e02");
  });
});
