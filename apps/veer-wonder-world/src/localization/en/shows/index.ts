// English show locale parts barrel (PRD 09 E.3, E.9, B.8, P2).

import type { LocalePart } from "../index.js";
import { EN_S01E01_SHORTS } from "./s01e01-shorts.js";
import { EN_S01E01 } from "./s01e01-welcome-to-wonder-world.js";
import { parts as EN_S01E02_SHORTS } from "./s01e02-hello-and-bye-bye-wave-shorts.js";
import { part as EN_S01E02 } from "./s01e02-hello-and-bye-bye-wave.js";
import { parts as EN_S01E03_SHORTS } from "./s01e03-more-bubbles-please-shorts.js";
import { part as EN_S01E03 } from "./s01e03-more-bubbles-please.js";
import { parts as EN_S01E04_SHORTS } from "./s01e04-roll-the-ball-again-shorts.js";
import { part as EN_S01E04 } from "./s01e04-roll-the-ball-again.js";
import { parts as EN_S01E05_SHORTS } from "./s01e05-open-the-surprise-box-shorts.js";
import { part as EN_S01E05 } from "./s01e05-open-the-surprise-box.js";
import { EN_S01E06 } from "./s01e06-meet-tiko-turtle.js";

export const EN_SHOW_PARTS: readonly LocalePart[] = [
  EN_S01E01,
  EN_S01E01_SHORTS,
  EN_S01E02,
  ...EN_S01E02_SHORTS,
  EN_S01E03,
  ...EN_S01E03_SHORTS,
  EN_S01E04,
  ...EN_S01E04_SHORTS,
  EN_S01E05,
  ...EN_S01E05_SHORTS,
  EN_S01E06
];
