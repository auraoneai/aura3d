// English locale strings for the three 9:16 Shorts cut from S01E01 (PRD 09 E.9).
// All spoken lines reuse `s01e01.*` keys from `s01e01-welcome-to-wonder-world.ts` so zero duplicate TTS quota is used
// and `mergeLocaleParts` encounters zero duplicate line keys.

import type { LocalePart } from "../index.js";

export const lines: Readonly<Record<string, string>> = {};

export const strings: Readonly<Record<string, string>> = {
  // Short 1 — Silly Sheru!
  "s01e01s1.title": "Silly Sheru!",
  "s01e01s1.offlinePlay":
    "Play a silly fetch game together: hold up a sock or a spoon first, laugh together, then roll a real ball.",
  "s01e01s1.caregiverBridge":
    "Pause when Momo asks where the red ball is and let your child point, smile, or name the ball.",
  "s01e01s1.ch.main": "Sheru finds the red ball",

  // Short 2 — Lulu is always late!
  "s01e01s2.title": "Lulu is Always Late!",
  "s01e01s2.offlinePlay":
    "Stomp slowly around the room together, then freeze like statues whenever someone whispers \"stop!\"",
  "s01e01s2.caregiverBridge":
    "Stomp along during the pause and laugh gently when Lulu freezes one beat late.",
  "s01e01s2.ch.main": "Stomp and freeze with Lulu",

  // Short 3 — Where's Peeko?
  "s01e01s3.title": "Where's Peeko?",
  "s01e01s3.offlinePlay":
    "Hide a favourite plush toy behind a small box or under a hat and play a gentle game of peekaboo.",
  "s01e01s3.caregiverBridge":
    "Wait at the pause before lifting the hat together and saying \"Peekaboo!\"",
  "s01e01s3.ch.main": "Peekaboo behind the box and hat"
};

export const EN_S01E01_SHORTS: LocalePart = {
  source: "shows/s01e01-shorts",
  lines,
  strings
};
