// The Wonder World catalog (PRD 04 C02; PRD 05 sections 2-3).
//
// An explicit, finite manifest: the 20 episodes in canonical order, then the
// 12 activities. Every entry is imported statically, so missing content fails
// the build, and every story's type requires approved language and rights
// review, so unapproved content cannot be listed. validateCatalog
// (schema.ts) checks the rest. The menu shows exactly this list: no
// recommendations, no "up next", no autoplay.
//
// Locales: only English is enabled. The Punjabi pack (src/localization/pa.ts)
// stays disabled until native review (PRD 04 C08); this catalog never lists it.

import type { ActivitySpec, EpisodeSpec, LocalePack, StorySpec } from "../types.js";
import { en } from "../localization/en/index.js";
import { storyCode } from "./schema.js";

import { episode as e01 } from "./episodes/momo-magic-mouth.js";
import { episode as e02 } from "./episodes/peekaboo-palace.js";
import { episode as e03 } from "./episodes/alphabet-zoo.js";
import { episode as e04 } from "./episodes/gogo-abc-train.js";
import { episode as e05 } from "./episodes/counting-cookies.js";
import { episode as e06 } from "./episodes/lulu-dino-dance.js";
import { episode as e07 } from "./episodes/magic-colour-machine.js";
import { episode as e08 } from "./episodes/wheres-sheru.js";
import { episode as e09 } from "./episodes/baby-animal-orchestra.js";
import { episode as e10 } from "./episodes/momos-hungry-belly.js";
import { episode as e11 } from "./episodes/number-balloon-rescue.js";
import { episode as e12 } from "./episodes/magic-shape-bakery.js";
import { episode as e13 } from "./episodes/silly-robot-factory.js";
import { episode as e14 } from "./episodes/lost-teddy-adventure.js";
import { episode as e15 } from "./episodes/momo-bubble-universe.js";
import { episode as e16 } from "./episodes/little-birthday-party.js";
import { episode as e17 } from "./episodes/sheru-big-adventure.js";
import { episode as e18 } from "./episodes/whos-at-the-door.js";
import { episode as e19 } from "./episodes/momos-day.js";
import { episode as e20 } from "./episodes/little-story-machine.js";
import { episode as e21 } from "./episodes/e21-lumi-moonlit-lullaby.js";
import { episode as e22 } from "./episodes/e22-teddy-warm-blanket.js";
import { episode as e23 } from "./episodes/e23-three-sleepy-sheep.js";
import { episode as e24 } from "./episodes/e24-gogo-quiet-night-train.js";
import { episode as e25 } from "./episodes/e25-peeko-cricket-garden.js";
import { episode as e26 } from "./episodes/e26-drifting-dream-clouds.js";

import { activity as g01 } from "./activities/bubble-garden.js";
import { activity as g02 } from "./activities/gogo-train.js";
import { activity as g03 } from "./activities/sheru-ball.js";
import { activity as g04 } from "./activities/peekaboo-animal-barn.js";
import { activity as g05 } from "./activities/teddy-snack-picnic.js";
import { activity as g06 } from "./activities/splashy-car-wash.js";
import { activity as g07 } from "./activities/little-lift.js";
import { activity as g08 } from "./activities/build-and-tumble.js";
import { activity as g09 } from "./activities/family-doorbells.js";
import { activity as g10 } from "./activities/bears-little-band.js";
import { activity as g11 } from "./activities/magic-sound-garden.js";
import { activity as g12 } from "./activities/find-my-real-toy.js";
import { activity as g13 } from "./activities/g13-tuck-in-friends.js";
import { activity as g14 } from "./activities/g14-starlight-music-box.js";
import { activity as g15 } from "./activities/g15-goodnight-little-lights.js";
import { activity as g16 } from "./activities/g16-cloud-sheep-hush.js";

export { storyCode };

/** Episodes 1-26 in canonical order. */
export const EPISODES: readonly EpisodeSpec[] = [
  e01, e02, e03, e04, e05, e06, e07, e08, e09, e10, e11, e12, e13, e14, e15, e16, e17, e18, e19, e20,
  e21, e22, e23, e24, e25, e26
];

/** Activities 1-16 in canonical order. */
export const ACTIVITIES: readonly ActivitySpec[] = [
  g01, g02, g03, g04, g05, g06, g07, g08, g09, g10, g11, g12,
  g13, g14, g15, g16
];

/** Every story: episodes 1-26, then activities 1-16. */
export const STORIES: readonly StorySpec[] = [...EPISODES, ...ACTIVITIES];

/** Bedtime stories and calm baby-sleep games (`sleepCategory === "bedtime"` plus E19 `momos-day`). */
export const SLEEP_STORIES: readonly StorySpec[] = STORIES.filter(
  (story) => story.sleepCategory === "bedtime" || story.id === "momos-day"
);

const BY_ID: ReadonlyMap<string, StorySpec> = new Map(STORIES.map((story) => [story.id, story]));
const BY_CODE: ReadonlyMap<string, StorySpec> = new Map(STORIES.map((story) => [storyCode(story), story]));

/** The story with this slug, or undefined. */
export function storyById(id: string): StorySpec | undefined {
  return BY_ID.get(id);
}

/** The story with this code (`e17`, `g03`), or undefined. */
export function storyByCode(code: string): StorySpec | undefined {
  return BY_CODE.get(code);
}

/** Locales a family can choose today. Punjabi is not listed until native review (PRD 04 C08). */
export const ENABLED_LOCALES: readonly string[] = ["en"];

/** Locale packs by code; only enabled packs appear here. */
export const LOCALE_PACKS: Readonly<Record<string, LocalePack>> = { en };

/** The pack for an enabled locale, or undefined (callers fall back to English). */
export function localePack(code: string): LocalePack | undefined {
  return ENABLED_LOCALES.includes(code) ? LOCALE_PACKS[code] : undefined;
}
