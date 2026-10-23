import type { CreateMatchEngine, MatchEngine } from "../contract/modules";
import type { MatchState, Side } from "../contract/sim";
import { appearance } from "./appearance";
import { engineModule } from "./engine";
import { physics } from "./physics";
import { roster } from "./roster";
import { strokes } from "./strokes";

/** The simulation wired to the typed physics and stroke modules. `sim/` never imports the DOM or the engine package. */
const module = engineModule(physics, strokes, roster, appearance);

/** `TennisEngine.create`: one factory for the whole pure simulation (rules, serve, AI, swipe shots). */
export const createMatchEngine: CreateMatchEngine = module.create;
/** Perspective helper used by online play and the tour screens: the same snapshot seen from `side`. */
export const viewMatch = (snapshot: MatchState, side: Side): MatchState => module.view(snapshot, side);
export type { MatchEngine };
export { SERVE, SHOT } from "./serve";
export { MATCH_RULES } from "../contract/sim";
export { pointLabel } from "./scoring";
