import { arcadeKart } from "./arcadeKart";
import { carSoccer } from "./carSoccer";
import { fighting } from "./fighting";
import { racketSports } from "./racketSports";

export * from "./arcadeKart";
export * from "./carSoccer";
export * from "./fighting";
export * from "./racketSports";
export * from "./racketAthleteRig";

export const gameKits = {
  fighting,
  arcadeKart,
  carSoccer,
  racketSports
} as const;

