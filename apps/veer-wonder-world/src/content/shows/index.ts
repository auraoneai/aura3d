// Multi-segment Wonder World shows and 9:16 Shorts registry (PRD 09 B3.3, E.3, E.9, B.8, P2).

import type { ShowSpec } from "../../types.js";
import { S01E01_SHORTS } from "./s01e01-shorts.js";
import { s01e01WelcomeToWonderWorld } from "./s01e01-welcome-to-wonder-world.js";
import { shorts as S01E02_SHORTS } from "./s01e02-hello-and-bye-bye-wave-shorts.js";
import { show as s01e02HelloAndByeByeWave } from "./s01e02-hello-and-bye-bye-wave.js";
import { shorts as S01E03_SHORTS } from "./s01e03-more-bubbles-please-shorts.js";
import { show as s01e03MoreBubblesPlease } from "./s01e03-more-bubbles-please.js";
import { shorts as S01E04_SHORTS } from "./s01e04-roll-the-ball-again-shorts.js";
import { show as s01e04RollTheBallAgain } from "./s01e04-roll-the-ball-again.js";
import { shorts as S01E05_SHORTS } from "./s01e05-open-the-surprise-box-shorts.js";
import { show as s01e05OpenTheSurpriseBox } from "./s01e05-open-the-surprise-box.js";
import { s01e06MeetTikoTurtle } from "./s01e06-meet-tiko-turtle.js";

export const SHOWS: readonly ShowSpec[] = [
  s01e01WelcomeToWonderWorld,
  ...S01E01_SHORTS,
  s01e02HelloAndByeByeWave,
  ...S01E02_SHORTS,
  s01e03MoreBubblesPlease,
  ...S01E03_SHORTS,
  s01e04RollTheBallAgain,
  ...S01E04_SHORTS,
  s01e05OpenTheSurpriseBox,
  ...S01E05_SHORTS,
  s01e06MeetTikoTurtle
];

const SHOW_MAP = new Map<string, ShowSpec>();

export function showById(id: string): ShowSpec | undefined {
  if (SHOW_MAP.size === 0 && SHOWS.length > 0) {
    for (const s of SHOWS) {
      SHOW_MAP.set(s.id, s);
      SHOW_MAP.set(s.code, s);
    }
  }
  return SHOW_MAP.get(id);
}
