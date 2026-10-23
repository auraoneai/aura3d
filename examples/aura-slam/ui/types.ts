import type {
  CreateMatchEngine, Difficulty, InputFrame, MatchEngine, MatchState, ScoreState, ServeAttempt, ShotPreset, Side
} from "../contract";

/** Fields the HUD reads on top of the contract's `MatchState` (the source engine exposes them at the top level). */
export interface HudExtras { energy?: number; powerDeniedUntil?: number }
export type HudState = Readonly<MatchState> & HudExtras;

export interface ScoreboardNames { player: string; ai: string }

/** Practice (smash lab) block, read verbatim from the source's `state.practice`. */
export interface PracticeView {
  streak: number; smashes: number; completed: number; perfect: number; bestSpeed: number; lastResult?: string; currentSmash?: unknown;
}

/** Out-feedback block (`state.outFeedback`): simulation seconds remaining and total duration. */
export interface OutFeedbackBlock { remaining: number; duration: number }

/** Serve attempt fields the serve card reads in addition to the contract's `ServeAttempt`. */
export interface ServeAttemptView extends ServeAttempt {
  launchSpeedKph?: number; faultReason?: string; timing?: string; quality?: number; lockedAim?: { x: number; y: number };
  number: 1 | 2; pointWinner?: Side;
}

export interface ServeFeedback {
  netRisk?: boolean; powerLongRisk?: boolean; swingCue?: "late" | "ready" | string; showPressCue?: boolean; swipe?: boolean;
}

/** Engine surface the shell uses beyond the contract's `MatchEngine` (all present on the source engine's public return). */
export interface SlamEngine extends MatchEngine {
  requestSwing(side: Side, eventTime?: number, forcePower?: boolean): void;
  captureAim?(): void;
  getServeFeedback(lookahead?: number): ServeFeedback | null;
  getServeGeometry?(side: Side): { minX: number; maxX: number };
  level?(...args: unknown[]): { humanReach: number };
  readonly capabilities?: Readonly<Record<string, unknown>>;
  readonly SERVE?: Readonly<{ windup: number; doubleTapWindow: number; [k: string]: unknown }>;
  readonly SHOT?: Readonly<ShotConstants>;
}
export type CreateSlamEngine = (options?: Parameters<CreateMatchEngine>[0]) => SlamEngine;

export interface ShotConstants {
  aimWindow: number; contactOpens: number; doubleTapWindow: number; energyMax: number; powerCost: number; recoveryPerSecond: number; recoveryDelay: number;
}
/** Shot source constants (match-engine.js `SHOT`); the shell falls back to these when the engine does not expose them. */
export const SHOT_DEFAULTS: Readonly<ShotConstants> = Object.freeze({
  aimWindow: 0.18, contactOpens: 0.16, doubleTapWindow: 0.22, energyMax: 100, powerCost: 38, recoveryPerSecond: 6, recoveryDelay: 1
});

export interface MenuSettings { venue: string; difficulty: Difficulty }
export type { Difficulty, InputFrame, ScoreState, ShotPreset, Side };
