import { openClear } from "./open-clear";
import { spotClear } from "./spot-clear";
import { pressure } from "./pressure";
import { pressureClear } from "./pressure-clear";
import { fire } from "./fire";
import { miss } from "./miss";
import { buzzer } from "./buzzer";
import { goldMiss } from "./gold-miss";
import { goldWin } from "./gold-win";

export const rooftopScenarios = {
  "open-clear": openClear,
  "spot-clear": spotClear,
  pressure,
  "pressure-clear": pressureClear,
  fire,
  miss,
  buzzer,
  "gold-miss": goldMiss,
  "gold-win": goldWin
} as const;
