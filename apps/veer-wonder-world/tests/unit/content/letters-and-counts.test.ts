// J06 (PRD 04): letter names and sounds are never equated, and spoken counts
// match one-to-one the visible counted objects (PRD 01 section 3.3, PRD 06
// QA-E07/QA-E08). Runs on the real E03/E04 letter episodes and the
// E05/E11/E16/G08 counting stories, plus synthetic failures.
import { describe, expect, it } from "vitest";
import type { BeatSpec, EpisodeSpec, LocalePack, StageAction, StorySpec } from "../../../src/types.js";
import { ALPHABET, LETTERS, LETTER_NAMES, checkLetterTexts, equatesNameAndSound, mentionsName, mentionsSound } from "../../../src/content/letters.js";
import { COUNT_SEQUENCES, countSequenceFor, spokenNumbers } from "../../../src/content/numbers.js";
import { OFF_SPOTS, checkCounting, checkLetterConcept, storyCode } from "../../../src/content/schema.js";
import { wordSpoken } from "../../../src/content/words.js";
import { episode as alphabetZoo } from "../../../src/content/episodes/alphabet-zoo.js";
import { episode as gogoAbcTrain } from "../../../src/content/episodes/gogo-abc-train.js";
import { episode as countingCookies } from "../../../src/content/episodes/counting-cookies.js";
import { episode as numberBalloonRescue } from "../../../src/content/episodes/number-balloon-rescue.js";
import { episode as littleBirthdayParty } from "../../../src/content/episodes/little-birthday-party.js";
import { activity as buildAndTumble } from "../../../src/content/activities/build-and-tumble.js";
import * as alphabetZooText from "../../../src/localization/en/episodes/alphabet-zoo.js";
import * as gogoAbcTrainText from "../../../src/localization/en/episodes/gogo-abc-train.js";
import * as countingCookiesText from "../../../src/localization/en/episodes/counting-cookies.js";
import * as numberBalloonRescueText from "../../../src/localization/en/episodes/number-balloon-rescue.js";
import * as littleBirthdayPartyText from "../../../src/localization/en/episodes/little-birthday-party.js";
import * as buildAndTumbleText from "../../../src/localization/en/activities/build-and-tumble.js";

function pack(text: { readonly lines: Record<string, string>; readonly strings: Record<string, string> }): LocalePack {
  return { locale: "en", lines: text.lines, strings: text.strings };
}

function beatsOf(story: StorySpec, rounds = 1): BeatSpec[] {
  if (story.kind === "episode") return [...story.beats];
  const out: BeatSpec[] = [...story.intro];
  for (let r = 0; r < rounds; r += 1) out.push(...story.round);
  return [...out, ...story.outro];
}

describe("letters: the name and the sound stay apart (PRD 04 C04)", () => {
  it("names B 'bee' with the sound /b/, and A 'ay' with the short /a/ of apple", () => {
    expect(LETTERS.B?.name).toBe("bee");
    expect(LETTERS.B?.sound).toBe("/b/");
    expect(LETTERS.B?.examples[0]).toBe("ball");
    expect(LETTERS.A?.name).toBe("ay");
    expect(LETTERS.A?.sound).toBe("/a/");
    expect(LETTERS.A?.ipa).toBe("/æ/");
    expect(LETTERS.A?.examples[0]).toBe("apple");
  });

  it("never lets a letter's name double as its sound", () => {
    for (const letter of ALPHABET) {
      const info = LETTERS[letter];
      if (!info) continue;
      expect(info.name, letter).toBe(LETTER_NAMES[letter]);
      expect(info.sound, letter).not.toBe(info.name);
      expect(info.soundForms, letter).toContain(info.sound);
      for (const form of info.soundForms) {
        expect(form.toLowerCase(), letter).not.toBe(info.name);
        expect(form.toLowerCase(), letter).not.toBe(info.lower);
      }
      for (const example of info.examples) expect(example.startsWith(info.lower), `${letter}: ${example}`).toBe(true);
    }
  });

  it("names all 26 letters, each with its own name", () => {
    expect(ALPHABET).toHaveLength(26);
    expect(new Set(Object.values(LETTER_NAMES)).size).toBe(26);
  });

  it("accepts lines that keep the name and the sound apart", () => {
    const b = LETTERS.B;
    const a = LETTERS.A;
    if (!b || !a) throw new Error("letters B and A must be reviewed");
    expect(checkLetterTexts(b, { name: "B. Bee.", sound: "B says /b/, like ball.", example: "A ball!" })).toEqual([]);
    expect(checkLetterTexts(b, { name: "This letter is B.", sound: "B says b-b-ball.", example: "Here comes a bear." })).toEqual([]);
    expect(checkLetterTexts(a, { name: "A. Ay.", sound: "A says a-a-apple.", example: "An apple!" })).toEqual([]);
  });

  it("rejects lines that equate the name with the sound or mix them", () => {
    const b = LETTERS.B;
    const a = LETTERS.A;
    if (!b || !a) throw new Error("letters B and A must be reviewed");
    expect(equatesNameAndSound(b, "B says bee, like ball.")).toBe(true);
    expect(equatesNameAndSound(b, "B says b.")).toBe(true);
    expect(equatesNameAndSound(b, "The sound is bee.")).toBe(true);
    expect(equatesNameAndSound(a, "A says a, like apple.")).toBe(true);
    expect(equatesNameAndSound(a, "A says ay.")).toBe(true);
    expect(equatesNameAndSound(b, "B says b-b-ball.")).toBe(false);
    expect(equatesNameAndSound(a, "A says /a/, like apple.")).toBe(false);
    expect(checkLetterTexts(b, { name: "B. Bee.", sound: "B says bee, like ball.", example: "A ball!" }).join("\n")).toContain("equates the letter name with its sound");
    expect(checkLetterTexts(b, { name: "B. Bee. /b/", sound: "B says /b/.", example: "A ball!" }).join("\n")).toContain("mixes in the sound");
    expect(checkLetterTexts(b, { name: "B. Bee.", sound: "B is for ball.", example: "A ball!" }).join("\n")).toContain("does not model the sound");
    expect(checkLetterTexts(b, { name: "Look!", sound: "B says /b/.", example: "A ball!" }).join("\n")).toContain("does not name the letter");
    expect(checkLetterTexts(b, { name: "B. Bee.", sound: "B says /b/.", example: "Look at that!" }).join("\n")).toContain("names none of the example words");
    expect(equatesNameAndSound(b, "B sounds like bee.")).toBe(true);
    expect(equatesNameAndSound(b, "B goes bee!")).toBe(true);
    expect(equatesNameAndSound(a, "A goes a.")).toBe(true);
  });

  it("does not take the article 'a' or a stretched sound for the letter name", () => {
    const b = LETTERS.B;
    const a = LETTERS.A;
    if (!b || !a) throw new Error("letters B and A must be reviewed");
    expect(mentionsName(a, "A ball rolls.")).toBe(false);
    expect(mentionsName(a, "This letter is A.")).toBe(true);
    expect(mentionsName(a, "A. Ay.")).toBe(true);
    expect(mentionsName(b, "B-b-ball.")).toBe(false);
    expect(mentionsName(b, "Here is B, big B.")).toBe(true);
    expect(checkLetterTexts(a, { name: "A ball rolls.", sound: "A says a-a-apple.", example: "An apple!" }).join("\n")).toContain("does not name the letter");
  });

  it("features B in E03 and A in E04, one letter each, with name and sound apart", () => {
    const cases: readonly [EpisodeSpec, LocalePack, string, string][] = [
      [alphabetZoo, pack(alphabetZooText), "B", "b"],
      [gogoAbcTrain, pack(gogoAbcTrainText), "A", "a"]
    ];
    for (const [story, locale, letter, wordId] of cases) {
      const concept = story.letterConcept;
      expect(concept?.letter, story.id).toBe(letter);
      if (!concept) continue;
      const info = LETTERS[letter === "B" ? "B" : "A"];
      if (!info) throw new Error(`letter ${letter} must be reviewed`);
      const name = locale.lines[concept.letterNameKey] ?? locale.strings[concept.letterNameKey] ?? "";
      const sound = locale.lines[concept.phonemeCueKey] ?? locale.strings[concept.phonemeCueKey] ?? "";
      expect(mentionsName(info, name), `${story.id} name "${name}"`).toBe(true);
      expect(mentionsSound(info, name), `${story.id} name "${name}"`).toBe(false);
      expect(mentionsSound(info, sound), `${story.id} sound "${sound}"`).toBe(true);
      expect(equatesNameAndSound(info, sound), `${story.id} sound "${sound}"`).toBe(false);
      expect([...story.targetWords, ...story.supportWords], story.id).toContain(wordId);
      const otherLetter = wordId === "b" ? "a" : "b";
      expect([...story.targetWords, ...story.supportWords], story.id).not.toContain(otherLetter);
      expect(checkLetterConcept(story, locale), story.id).toEqual([]);
    }
  });
});

describe("numbers: spoken counts match visible objects (PRD 04 C05, QA-E08)", () => {
  it("reads counts, not phrases or pronouns", () => {
    expect(spokenNumbers("One, two, three!")).toEqual([1, 2, 3]);
    expect(spokenNumbers("One more balloon.")).toEqual([]);
    expect(spokenNumbers("Two! A blue one.")).toEqual([2]);
    expect(spokenNumbers("One by one.")).toEqual([]);
    expect(spokenNumbers("No one is sad.")).toEqual([]);
    expect(spokenNumbers("Four balls")).toEqual([4]);
    expect(spokenNumbers("3 cookies")).toEqual([3]);
    expect(spokenNumbers("Fifteen balloons and thirty blocks.")).toEqual([15, 30]);
  });

  const COUNTING: readonly [StorySpec, LocalePack][] = [
    [countingCookies, pack(countingCookiesText)],
    [numberBalloonRescue, pack(numberBalloonRescueText)],
    [littleBirthdayParty, pack(littleBirthdayPartyText)],
    [buildAndTumble, pack(buildAndTumbleText)]
  ];

  it("lists E05, E11, E16 and G08 as the counting stories", () => {
    expect(COUNT_SEQUENCES.map((sequence) => sequence.code)).toEqual(["e05", "e11", "e16", "g08"]);
    for (const [story] of COUNTING) expect(countSequenceFor(story.id)?.code).toBe(storyCode(story));
  });

  it.each(COUNTING.map(([story, locale]): [string, StorySpec, LocalePack] => [storyCode(story), story, locale]))(
    "%s counts three objects of one kind, one visible object per spoken number",
    (_code, story, locale) => {
      const concept = story.numberConcept;
      expect(concept, story.id).toBeDefined();
      if (!concept) return;
      expect([concept.countMin, concept.countMax]).toEqual([1, 3]);
      expect(concept.countedObjectIds).toHaveLength(3);
      const props = concept.countedObjectIds.map((id) => story.props.find((prop) => prop.id === id));
      expect(props.every((prop) => prop !== undefined), story.id).toBe(true);
      expect(new Set(props.map((prop) => prop?.asset)).size, story.id).toBe(1);

      const sequence = countSequenceFor(story.id);
      expect(sequence, story.id).toBeDefined();
      const allLines = beatsOf(story).flatMap((beat) => [...beat.lines, ...(beat.response?.lines ?? [])]).map((line) => locale.lines[line.key] ?? "");
      if (sequence) expect(allLines.some((text) => wordSpoken(sequence.noun, text)), `${story.id} says "${sequence.noun}"`).toBe(true);

      // Independent walk: visible counted objects whenever a number is spoken.
      const off = new Set<string>(OFF_SPOTS);
      const rounds = story.kind === "activity" ? story.roundLimit : 1;
      for (let played = 1; played <= rounds; played += 1) {
        const visible = new Map<string, boolean>();
        for (const id of concept.countedObjectIds) {
          const prop = story.props.find((p) => p.id === id);
          visible.set(id, prop !== undefined && prop.hidden !== true && !off.has(prop.at));
        }
        const apply = (actions: readonly StageAction[]): void => {
          for (const action of actions) {
            if ((action.do === "show" || action.do === "enter") && visible.has(action.actor)) visible.set(action.actor, action.do === "show" || !off.has(action.at));
            if (action.do === "hide" && visible.has(action.actor)) visible.set(action.actor, false);
            if (action.do === "exit" && visible.has(action.actor)) visible.set(action.actor, false);
            if (action.do === "move" && visible.has(action.actor) && off.has(action.to)) visible.set(action.actor, false);
            if (action.do === "object" && visible.has(action.target) && (action.action === "pop" || action.action === "eat")) visible.set(action.target, false);
          }
        };
        const spoken = new Set<number>();
        const check = (key: string): void => {
          const text = locale.lines[key] ?? "";
          for (const n of spokenNumbers(text)) {
            spoken.add(n);
            const shown = [...visible.values()].filter(Boolean).length;
            expect(n, `${story.id} "${text}"`).toBeLessThanOrEqual(3);
            expect(shown, `${story.id} "${text}" says ${n}`).toBeGreaterThanOrEqual(n);
          }
        };
        for (const beat of beatsOf(story, played)) {
          apply(beat.stage);
          for (const line of beat.lines) check(line.key);
          if (beat.response) {
            apply(beat.response.stage);
            for (const line of beat.response.lines) check(line.key);
          }
        }
        expect([...spoken].sort(), `${story.id} counts one, two, three`).toEqual(expect.arrayContaining([1, 2, 3]));
      }

      expect(checkCounting(story, locale)).toEqual([]);
    }
  );

  // A small synthetic counting story: three cookies appear one at a time.
  const cookieLocale: LocalePack = {
    locale: "en",
    lines: {
      "e05.one.1": "One cookie.",
      "e05.two.1": "Two cookies.",
      "e05.three.1": "Three cookies!",
      "e05.eat.1": "Mmm. Two cookies left."
    },
    strings: {}
  };
  const show = (id: string): StageAction => ({ do: "show", actor: id });
  const cookieBeats: readonly BeatSpec[] = [
    { id: "one", kind: "model", stage: [show("cookie-1")], lines: [{ speaker: "momo", key: "e05.one.1" }], words: [{ wordId: "one", objectId: "cookie-1" }], holdMs: 1000 },
    { id: "two", kind: "model", stage: [show("cookie-2")], lines: [{ speaker: "momo", key: "e05.two.1" }], words: [{ wordId: "two", objectId: "cookie-2" }], holdMs: 1000 },
    { id: "three", kind: "model", stage: [show("cookie-3")], lines: [{ speaker: "momo", key: "e05.three.1" }], words: [{ wordId: "three", objectId: "cookie-3" }], holdMs: 1000 },
    { id: "eat", kind: "event", stage: [{ do: "object", target: "cookie-3", action: "eat" }], lines: [{ speaker: "momo", key: "e05.eat.1" }], holdMs: 1000 }
  ];
  const cookies: EpisodeSpec = {
    ...countingCookies,
    props: [
      { id: "cookie-1", asset: "cookie", at: "left", hidden: true },
      { id: "cookie-2", asset: "cookie", at: "center", hidden: true },
      { id: "cookie-3", asset: "cookie", at: "right", hidden: true }
    ],
    numberConcept: { countMin: 1, countMax: 3, countedObjectIds: ["cookie-1", "cookie-2", "cookie-3"] },
    beats: cookieBeats
  };
  const withText = (key: string, text: string): LocalePack => ({ ...cookieLocale, lines: { ...cookieLocale.lines, [key]: text } });

  it("accepts a count that adds one visible cookie per number", () => {
    expect(checkCounting(cookies, cookieLocale)).toEqual([]);
  });

  it("rejects a number spoken before its object is visible", () => {
    const errors = checkCounting(cookies, withText("e05.two.1", "Three cookies!"));
    expect(errors.join("\n")).toContain('says 3 but only 2 counted objects are visible');
  });

  it("rejects a count-up that names the wrong number for what just appeared", () => {
    const errors = checkCounting(cookies, withText("e05.three.1", "Two cookies."));
    expect(errors.join("\n")).toContain("says 2 while 3 counted objects are visible after one appeared");
  });

  it("counts an eaten cookie as gone", () => {
    const errors = checkCounting(cookies, withText("e05.eat.1", "Mmm. Three cookies."));
    expect(errors.join("\n")).toContain("says 3 but only 2 counted objects are visible");
  });

  it("rejects mixed objects, missing number words and counting songs ahead of the objects", () => {
    const mixed = { ...cookies, props: cookies.props.map((prop) => (prop.id === "cookie-3" ? { ...prop, asset: "apple" as const } : prop)) };
    expect(checkCounting(mixed, cookieLocale).join("\n")).toContain("counts different kinds of objects");
    const noThree = { ...cookies, beats: cookieBeats.map((beat) => (beat.id === "three" ? { ...beat, words: [] } : beat)) };
    expect(checkCounting(noThree, cookieLocale).join("\n")).toContain('no beat names "three"');
    const earlySong = { ...cookies, beats: [{ id: "song", kind: "song" as const, stage: [{ do: "song" as const, song: "countToThree" as const }], lines: [], holdMs: 17000 }, ...cookieBeats] };
    expect(checkCounting(earlySong, cookieLocale).join("\n")).toContain('song "countToThree" counts to 3 but only 0 counted objects are visible');
  });

  it("requires a numberConcept when a story teaches counting", () => {
    const { numberConcept: _drop, ...rest } = cookies;
    expect(checkCounting(rest, cookieLocale).join("\n")).toContain("needs a numberConcept");
  });
});
