// Numbers and counting (PRD 04 C05; PRD 01 section 3.3; PRD 06 QA-E08).
//
// Counting starts at one and stops at three. Every spoken number goes with
// exactly one visible object of the counted set: "One cookie" while one cookie
// is on the table, "Two" when the second one is there. 1-5 and 1-10 come only
// after separate content review, so any number above three in a spoken line or
// a song is a content error.
//
// The checks that simulate a story (which counted objects are visible when a
// line is spoken) live in schema.ts (`checkCounting`); this module holds the
// counting data and the text parsing they use.

import type { WordId } from "./words.js";

export const COUNT_MIN = 1;
export const COUNT_MAX = 3;

/** The vocabulary ids of the counting words, in order. */
export const COUNT_WORD_IDS = ["one", "two", "three"] as const satisfies readonly WordId[];

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100, thousand: 1000
};

/** "one" is not a count after these words ("a blue one", "this one", "no one"). */
const ONE_AS_PRONOUN_AFTER: ReadonlySet<string> = new Set([
  "a", "an", "the", "this", "that", "which", "each", "every", "another", "other", "any", "no", "some",
  "big", "small", "little", "tiny", "new", "last", "next", "first", "same", "best", "good", "silly", "funny",
  "red", "blue", "yellow", "green", "pink", "purple", "orange", "white", "brown", "round", "square", "by"
]);

/** "one" is not a count before these words ("one more", "one by one", "one of them"). */
const ONE_AS_PHRASE_BEFORE: ReadonlySet<string> = new Set(["more", "by", "at", "of", "another", "day", "last"]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/**
 * The numbers a line speaks as counts, in order. Number words and digits
 * count; "one more", "one by one" and pronoun uses of "one" ("a blue one")
 * do not.
 */
export function spokenNumbers(text: string): number[] {
  const list = tokens(text);
  const out: number[] = [];
  list.forEach((token, index) => {
    let value: number | undefined;
    if (/^\d+$/.test(token)) value = Number(token);
    else value = NUMBER_WORDS[token];
    if (value === undefined) return;
    if (token === "one") {
      const before = list[index - 1];
      const after = list[index + 1];
      if (before !== undefined && ONE_AS_PRONOUN_AFTER.has(before)) return;
      if (after !== undefined && ONE_AS_PHRASE_BEFORE.has(after)) return;
    }
    out.push(value);
  });
  return out;
}

/** The highest count a line speaks, or 0 when it speaks none. */
export function highestSpokenNumber(text: string): number {
  return spokenNumbers(text).reduce((max, value) => Math.max(max, value), 0);
}

/** Every count in `text` above COUNT_MAX (counting stops at three). */
export function countsAboveLimit(text: string): number[] {
  return spokenNumbers(text).filter((value) => value > COUNT_MAX);
}

/**
 * The stories that count, and what they count. Each story's
 * `numberConcept.countedObjectIds` lists the props in counting order; the
 * counted props are one kind of object and the noun is the vocabulary word
 * the lines use for them.
 */
export interface CountSequence {
  readonly storyId: string;
  readonly code: string;
  /** The counted object, as a vocabulary word. */
  readonly noun: WordId;
  /** The counts the story walks through, always 1, 2, 3. */
  readonly counts: readonly [1, 2, 3];
  readonly how: string;
}

export const COUNT_SEQUENCES: readonly CountSequence[] = [
  {
    storyId: "counting-cookies",
    code: "e05",
    noun: "cookie",
    counts: [1, 2, 3],
    how: "Momo places the cookies on the plate one at a time and counts each as it appears; when he pretends to eat one, the line names only the cookies still on the plate."
  },
  {
    storyId: "number-balloon-rescue",
    code: "e11",
    noun: "balloon",
    counts: [1, 2, 3],
    how: "Three balloons float up; each is brought down in order and counted as it lands, then the three are counted again with one wiggle per number."
  },
  {
    storyId: "little-birthday-party",
    code: "e16",
    noun: "balloon",
    counts: [1, 2, 3],
    how: "Three party decorations (balloons) appear one at a time around the toy cake, each counted as it appears; the candle stays pretend."
  },
  {
    storyId: "build-and-tumble",
    code: "g08",
    noun: "block",
    counts: [1, 2, 3],
    how: "Each round places up to three big blocks; a number is spoken only when its block becomes visible, then the tower tumbles gently."
  }
];

/** The count sequence of a story, if it is one of the counting stories. */
export function countSequenceFor(storyId: string): CountSequence | undefined {
  return COUNT_SEQUENCES.find((sequence) => sequence.storyId === storyId);
}
