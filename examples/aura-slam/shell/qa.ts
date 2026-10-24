import { installQaHooks, type InstalledQaHooks, type QaHookApp } from "@aura3d/engine";
import { GRAVITY, METRES_PER_UNIT, NET_HEIGHT, type MatchState, type Side } from "../contract";
import { outFeedbackView, speedometerView } from "../ui/hud";
import { pointLabel } from "../ui/format";
import { scoreboardState } from "../ui/scoreboard";
import { serveAttemptOf, lastServeOf } from "../ui/serveFeedback";
import { summarizeMatch, type MatchResultsModel } from "../ui/results";
import { SHOT_DEFAULTS, type ShotConstants, type HudState, type MenuSettings, type ScoreboardNames, type SlamEngine } from "../ui/types";
import { themeFor } from "../ui/venues";

export interface SlamQaDeps {
  ready: () => boolean;
  state: () => MatchState;
  /** Run `n` fixed steps (input applies to the first) and present once. */
  stepFrames: (n: number, input?: { side?: Side } & Record<string, unknown>) => void;
  reset: (seed?: number) => void;
  begin: () => void;
  app: () => QaHookApp | null | undefined;
  renderText: () => string;
  advanceTime: (ms: number) => void;
  togglePause: () => void;
  /** Starts the offline match; optional settings pick difficulty and venue exactly (the replay specs use it). */
  startOffline: (settings?: Partial<MenuSettings>) => void;
  getEngine: () => SlamEngine;
  routeHealth?: () => unknown;
  nodeCount?: () => number;
  traceRow: () => unknown;
  target?: Record<string, unknown>;
}

/** Install `window.__AURA_AURA_SLAM__` plus the original page's hooks so the live capture harness keeps working. */
export function installSlamQa(deps: SlamQaDeps): InstalledQaHooks<MatchState, Record<string, unknown>> {
  const target = deps.target ?? (globalThis as unknown as Record<string, unknown>);
  const installed = installQaHooks<MatchState, Record<string, unknown>>("aura-slam", {
    ready: deps.ready, state: deps.state, stepFrames: deps.stepFrames, reset: deps.reset, begin: deps.begin, app: deps.app,
    traceRow: deps.traceRow, routeHealth: deps.routeHealth, nodeCount: deps.nodeCount, target
  });
  target.render_game_to_text = deps.renderText;
  target.advanceTime = deps.advanceTime;
  target.__TOP_TENNIS_CONTROL__ = { getState: deps.state, getEngine: deps.getEngine, startOffline: deps.startOffline, togglePause: deps.togglePause };
  return installed;
}
