// Letters (PRD 04 C04; PRD 01 section 3.3; PRD 05 E03/E04).
//
// A letter has a NAME ("B" is called "bee") and a SOUND (B stands for /b/,
// the sound at the start of "ball"). Wonder World always keeps the two apart:
// "B. Bee." then "B says b-b-ball." (the /b/ of ball, as grown-up text writes
// it). Never "B says bee". One letter per episode, always tied to a real
// object; no fast symbol runs and no letter quizzes.
//
// `soundForms` are the ways a text may write the sound: the phonics notation
// ("/b/") in grown-up text (tips, the caregiver bridge) or a stretched start of
// the example word ("b-b-ball"). A spoken line uses only the stretched start:
// its text is what text-to-speech reads (tools/gen-audio.ts) and what the
// caption shows, and text-to-speech reads "/b/", a bare "b" or a bare "a" as
// the letter NAME. The content lint rejects phonics notation in spoken lines.
//
// Every letter name is listed (the alphabet is extensible to 26); a letter is
// used in a story only once its sound entry below has been reviewed.

import type { WordId } from "./words.js";

export const ALPHABET = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"
] as const;

export type LetterId = (typeof ALPHABET)[number];

/** How each letter is named aloud (American English). */
export const LETTER_NAMES: Readonly<Record<LetterId, string>> = {
  A: "ay", B: "bee", C: "see", D: "dee", E: "ee", F: "ef", G: "jee", H: "aitch", I: "eye",
  J: "jay", K: "kay", L: "el", M: "em", N: "en", O: "oh", P: "pee", Q: "cue", R: "ar",
  S: "ess", T: "tee", U: "you", V: "vee", W: "double-you", X: "ex", Y: "why", Z: "zee"
};

export interface LetterReview {
  readonly status: "approved";
  readonly reviewer: string;
  readonly date: string;
}

export interface LetterInfo {
  readonly letter: LetterId;
  readonly lower: string;
  /** The letter's name, spelled as it is said ("bee"). */
  readonly name: string;
  /** Phonics notation for the sound, as captions show it ("/b/"). */
  readonly sound: string;
  /** IPA for the sound ("/æ/" for the short a in apple). */
  readonly ipa: string;
  /** Plain description for grown-ups. */
  readonly soundDescription: string;
  /** Accepted ways for a line to write the sound (never the bare letter). */
  readonly soundForms: readonly string[];
  /** Example words that START WITH THE SOUND (not only the spelling). First is the featured object. */
  readonly examples: readonly string[];
  /** Vocabulary id for the letter, when stories may target it. */
  readonly wordId: WordId | null;
  readonly review: LetterReview;
}

const REVIEW: LetterReview = {
  status: "approved",
  reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
  date: "2026-10-29"
};

/**
 * Reviewed letters. B (E03) and A (E04) are in the catalog; M and P are the
 * other pilot examples of PRD 01 section 4.2, ready for later episodes.
 */
export const LETTERS: Readonly<Partial<Record<LetterId, LetterInfo>>> = {
  B: {
    letter: "B",
    lower: "b",
    name: LETTER_NAMES.B,
    sound: "/b/",
    ipa: "/b/",
    soundDescription: "the /b/ sound at the start of ball (lips together, then a short pop)",
    soundForms: ["/b/", "b-b-b"],
    examples: ["ball", "bear", "book", "bubble", "banana", "bird", "bed", "box", "boom", "balloon", "bell", "block"],
    wordId: "b",
    review: REVIEW
  },
  A: {
    letter: "A",
    lower: "a",
    name: LETTER_NAMES.A,
    sound: "/a/",
    ipa: "/æ/",
    soundDescription: "the short /a/ sound at the start of apple (not the letter name ay)",
    soundForms: ["/a/", "/æ/", "a-a-a"],
    examples: ["apple", "ant", "alligator"],
    wordId: "a",
    review: REVIEW
  },
  M: {
    letter: "M",
    lower: "m",
    name: LETTER_NAMES.M,
    sound: "/m/",
    ipa: "/m/",
    soundDescription: "the humming /m/ sound at the start of moon",
    soundForms: ["/m/", "m-m-m", "mmm"],
    examples: ["moon", "moo", "more", "mirror"],
    wordId: null,
    review: REVIEW
  },
  P: {
    letter: "P",
    lower: "p",
    name: LETTER_NAMES.P,
    sound: "/p/",
    ipa: "/p/",
    soundDescription: "the soft popping /p/ sound at the start of pop",
    soundForms: ["/p/", "p-p-p"],
    examples: ["pop", "picnic", "plate", "peekaboo"],
    wordId: null,
    review: REVIEW
  }
};

const LETTER_SET: ReadonlySet<string> = new Set<string>(ALPHABET);

export function isLetterId(value: string): value is LetterId {
  return LETTER_SET.has(value);
}

/** The reviewed entry for a letter, or undefined when it is not reviewed yet. */
export function letterInfo(letter: string): LetterInfo | undefined {
  return isLetterId(letter) ? LETTERS[letter] : undefined;
}

/** Lowercase tokens; slashes and hyphens kept so "/b/" and "b-b-ball" survive. */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .split(/[^a-z0-9/\-\u00e6']+/)
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token.length > 0);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Capital letters `text` names as letters: "Here is B,", "B for ball",
 * "the letter A", "A is for apple". The article in "A ball" and the pronoun
 * "I" are not letters.
 */
export function lettersNamedIn(text: string): LetterId[] {
  const found = new Set<LetterId>();
  const patterns = [
    /\b([A-HJ-Z])\b(?=\s*(?:[,.!?;:]|$)|\s+(?:for|is|says)\b)/g,
    /\b(?:letter|big|little)\s+([A-HJ-Z])\b/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const letter = match[1];
      if (letter !== undefined && isLetterId(letter)) found.add(letter);
    }
  }
  return [...found].sort();
}

/** True when `text` contains one of the letter's sound forms. */
export function mentionsSound(info: LetterInfo, text: string): boolean {
  const lower = text.toLowerCase();
  return info.soundForms.some((form) => lower.includes(form.toLowerCase()));
}

/**
 * True when `text` names the letter: its spelled name ("bee", "ay") or the
 * capital letter used as a letter ("B.", "B says", "the letter A"). The
 * article in "A ball" and the stretched sound in "B-b-ball" do not name it.
 */
export function namesLetter(letter: string, text: string): boolean {
  if (!isLetterId(letter)) return false;
  return tokens(text).includes(LETTER_NAMES[letter]) || lettersNamedIn(text).includes(letter);
}

/** True when `text` names the letter (see `namesLetter`). */
export function mentionsName(info: LetterInfo, text: string): boolean {
  return namesLetter(info.letter, text);
}

/**
 * Phrases that would make the letter name stand for the sound, e.g.
 * "B says bee", "B goes b.", "the sound is ay", "B sounds like bee",
 * "makes the sound bee". A stretched word start ("B says b-b-ball") is fine.
 */
export function equatesNameAndSound(info: LetterInfo, text: string): boolean {
  const name = escapeRegExp(info.name);
  const lower = escapeRegExp(info.lower);
  const patterns = [
    new RegExp(`\\b(?:says|goes)\\s+(?:the\\s+)?(?:letter\\s+)?${name}\\b`, "i"),
    new RegExp(`\\b(?:says|goes)\\s+${lower}(?=\\s*(?:[,.!?;:]|$))`, "i"),
    new RegExp(`\\bsounds?\\s+(?:is\\s+|of\\s+|like\\s+)?${name}\\b`, "i"),
    new RegExp(`\\bmakes\\s+(?:the\\s+|a\\s+)?(?:sound\\s+)?${name}\\b`, "i")
  ];
  return patterns.some((pattern) => pattern.test(text));
}

/** True when `text` contains one of the letter's example words (plurals count). */
export function mentionsExample(info: LetterInfo, text: string): boolean {
  const list = tokens(text);
  return info.examples.some((example) => list.some((token) => token === example || token === `${example}s` || token.endsWith(`-${example}`)));
}

/**
 * Checks the three texts of a letter concept: the name line names the letter
 * and carries no sound form; the sound line carries a sound form and never
 * equates name and sound; the example line names an example word.
 */
export function checkLetterTexts(
  info: LetterInfo,
  texts: { readonly name: string; readonly sound: string; readonly example: string }
): string[] {
  const errors: string[] = [];
  const tag = `letter ${info.letter}`;
  if (!mentionsName(info, texts.name)) errors.push(`${tag}: the name text "${texts.name}" does not name the letter ("${info.letter}" or "${info.name}")`);
  if (mentionsSound(info, texts.name)) errors.push(`${tag}: the name text "${texts.name}" mixes in the sound ${info.sound}; keep the name and the sound in separate lines`);
  if (!mentionsSound(info, texts.sound)) {
    errors.push(`${tag}: the sound text "${texts.sound}" does not model the sound (use one of ${info.soundForms.map((f) => `"${f}"`).join(", ")})`);
  }
  if (equatesNameAndSound(info, texts.sound)) errors.push(`${tag}: the sound text "${texts.sound}" equates the letter name with its sound`);
  if (equatesNameAndSound(info, texts.name)) errors.push(`${tag}: the name text "${texts.name}" equates the letter name with its sound`);
  if (!mentionsExample(info, texts.example)) {
    errors.push(`${tag}: the example text "${texts.example}" names none of the example words (${info.examples.join(", ")})`);
  }
  return errors;
}
