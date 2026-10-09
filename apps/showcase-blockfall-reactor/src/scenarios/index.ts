import type { GameScenario } from "@aura3d/engine";
import {
  playScenario, singleClearScenario, quadScenario,
  levelUpScenario, dangerScenario, gameOverScenario
} from "./acceptance";
import { attractEnterScenario, attractExitScenario } from "../legacy/attract";
import { rotationTrapScenario } from "./rotation-trap";

export const blockfallScenarios: Readonly<Record<string, GameScenario>> = {
  "play": playScenario,
  "single-clear": singleClearScenario,
  "quad": quadScenario,
  "level-up": levelUpScenario,
  "danger": dangerScenario,
  "game-over": gameOverScenario,
  "rotation-trap": rotationTrapScenario,
  "attract-enter": attractEnterScenario,
  "attract-exit": attractExitScenario
};
