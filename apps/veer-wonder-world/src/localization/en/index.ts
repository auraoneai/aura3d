// The English locale pack (PRD 04 C07; PRD 03 section 7).
//
// Merges the 32 story locale files (src/localization/en/{episodes,activities})
// and the UI strings (ui.ts) into one LocalePack. Each key must be defined
// exactly once across all files and across lines and strings: a duplicate is a
// content error and stops the import with a message naming every clash.

import type { LocalePack } from "../../types.js";
import * as ui from "./ui.js";

import * as e01 from "./episodes/momo-magic-mouth.js";
import * as e02 from "./episodes/peekaboo-palace.js";
import * as e03 from "./episodes/alphabet-zoo.js";
import * as e04 from "./episodes/gogo-abc-train.js";
import * as e05 from "./episodes/counting-cookies.js";
import * as e06 from "./episodes/lulu-dino-dance.js";
import * as e07 from "./episodes/magic-colour-machine.js";
import * as e08 from "./episodes/wheres-sheru.js";
import * as e09 from "./episodes/baby-animal-orchestra.js";
import * as e10 from "./episodes/momos-hungry-belly.js";
import * as e11 from "./episodes/number-balloon-rescue.js";
import * as e12 from "./episodes/magic-shape-bakery.js";
import * as e13 from "./episodes/silly-robot-factory.js";
import * as e14 from "./episodes/lost-teddy-adventure.js";
import * as e15 from "./episodes/momo-bubble-universe.js";
import * as e16 from "./episodes/little-birthday-party.js";
import * as e17 from "./episodes/sheru-big-adventure.js";
import * as e18 from "./episodes/whos-at-the-door.js";
import * as e19 from "./episodes/momos-day.js";
import * as e20 from "./episodes/little-story-machine.js";

import * as g01 from "./activities/bubble-garden.js";
import * as g02 from "./activities/gogo-train.js";
import * as g03 from "./activities/sheru-ball.js";
import * as g04 from "./activities/peekaboo-animal-barn.js";
import * as g05 from "./activities/teddy-snack-picnic.js";
import * as g06 from "./activities/splashy-car-wash.js";
import * as g07 from "./activities/little-lift.js";
import * as g08 from "./activities/build-and-tumble.js";
import * as g09 from "./activities/family-doorbells.js";
import * as g10 from "./activities/bears-little-band.js";
import * as g11 from "./activities/magic-sound-garden.js";
import * as g12 from "./activities/find-my-real-toy.js";

/** One locale source file: its spoken lines and its strings. */
export interface LocalePart {
  readonly source: string;
  readonly lines?: Readonly<Record<string, string>>;
  readonly strings?: Readonly<Record<string, string>>;
}

/**
 * Merges locale parts into one pack. Throws when any key is defined twice
 * (in two files, or as both a line and a string), listing every clash.
 */
export function mergeLocaleParts(locale: string, parts: readonly LocalePart[]): LocalePack {
  const lines: Record<string, string> = {};
  const strings: Record<string, string> = {};
  const owner = new Map<string, string>();
  const clashes: string[] = [];
  const add = (target: Record<string, string>, table: "lines" | "strings", source: string, entries: Readonly<Record<string, string>>): void => {
    for (const [key, text] of Object.entries(entries)) {
      const where = `${source} (${table})`;
      const previous = owner.get(key);
      if (previous !== undefined) {
        clashes.push(`${key} in ${where} and ${previous}`);
        continue;
      }
      owner.set(key, where);
      target[key] = text;
    }
  };
  for (const part of parts) {
    add(lines, "lines", part.source, part.lines ?? {});
    add(strings, "strings", part.source, part.strings ?? {});
  }
  if (clashes.length > 0) {
    throw new Error(`${locale} locale: ${clashes.length} duplicate key${clashes.length === 1 ? "" : "s"}: ${clashes.join("; ")}`);
  }
  return { locale, lines, strings };
}

/** The English sources, story files in canonical order, then the UI strings. */
export const EN_PARTS: readonly LocalePart[] = [
  { source: "episodes/momo-magic-mouth", lines: e01.lines, strings: e01.strings },
  { source: "episodes/peekaboo-palace", lines: e02.lines, strings: e02.strings },
  { source: "episodes/alphabet-zoo", lines: e03.lines, strings: e03.strings },
  { source: "episodes/gogo-abc-train", lines: e04.lines, strings: e04.strings },
  { source: "episodes/counting-cookies", lines: e05.lines, strings: e05.strings },
  { source: "episodes/lulu-dino-dance", lines: e06.lines, strings: e06.strings },
  { source: "episodes/magic-colour-machine", lines: e07.lines, strings: e07.strings },
  { source: "episodes/wheres-sheru", lines: e08.lines, strings: e08.strings },
  { source: "episodes/baby-animal-orchestra", lines: e09.lines, strings: e09.strings },
  { source: "episodes/momos-hungry-belly", lines: e10.lines, strings: e10.strings },
  { source: "episodes/number-balloon-rescue", lines: e11.lines, strings: e11.strings },
  { source: "episodes/magic-shape-bakery", lines: e12.lines, strings: e12.strings },
  { source: "episodes/silly-robot-factory", lines: e13.lines, strings: e13.strings },
  { source: "episodes/lost-teddy-adventure", lines: e14.lines, strings: e14.strings },
  { source: "episodes/momo-bubble-universe", lines: e15.lines, strings: e15.strings },
  { source: "episodes/little-birthday-party", lines: e16.lines, strings: e16.strings },
  { source: "episodes/sheru-big-adventure", lines: e17.lines, strings: e17.strings },
  { source: "episodes/whos-at-the-door", lines: e18.lines, strings: e18.strings },
  { source: "episodes/momos-day", lines: e19.lines, strings: e19.strings },
  { source: "episodes/little-story-machine", lines: e20.lines, strings: e20.strings },
  { source: "activities/bubble-garden", lines: g01.lines, strings: g01.strings },
  { source: "activities/gogo-train", lines: g02.lines, strings: g02.strings },
  { source: "activities/sheru-ball", lines: g03.lines, strings: g03.strings },
  { source: "activities/peekaboo-animal-barn", lines: g04.lines, strings: g04.strings },
  { source: "activities/teddy-snack-picnic", lines: g05.lines, strings: g05.strings },
  { source: "activities/splashy-car-wash", lines: g06.lines, strings: g06.strings },
  { source: "activities/little-lift", lines: g07.lines, strings: g07.strings },
  { source: "activities/build-and-tumble", lines: g08.lines, strings: g08.strings },
  { source: "activities/family-doorbells", lines: g09.lines, strings: g09.strings },
  { source: "activities/bears-little-band", lines: g10.lines, strings: g10.strings },
  { source: "activities/magic-sound-garden", lines: g11.lines, strings: g11.strings },
  { source: "activities/find-my-real-toy", lines: g12.lines, strings: g12.strings },
  { source: "ui", lines: ui.lines, strings: ui.strings }
];

/** The English pack: every story line and string plus the UI strings. */
export const en: LocalePack = mergeLocaleParts("en", EN_PARTS);
