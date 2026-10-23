import { GRAVITY } from "../contract/units";
import type { Difficulty } from "../contract/sim";

/** Shot-input windows and the power meter (match-engine.js `SHOT`). */
export const SHOT = Object.freeze({ aimWindow: 0.18, contactOpens: 0.16, doubleTapWindow: 0.22, energyMax: 100, powerCost: 38, recoveryPerSecond: 6, recoveryDelay: 1 });

/** Original toss geometry; its apex is tied to the physical constants. */
export const TOSS_START_Z = 0.32;
export const TOSS_VELOCITY = 2.6;
export const TOSS_APEX_Z = TOSS_START_Z + TOSS_VELOCITY ** 2 / (2 * GRAVITY);

/** Serve geometry, timing windows and error model (match-engine.js `SERVE`). */
export const SERVE = Object.freeze({
  version: 1, windup: 0.24, doubleTapWindow: 0.22, tossStartZ: TOSS_START_Z, apexZ: TOSS_APEX_Z,
  apexHeightMetres: TOSS_APEX_Z * 2.177, tossVelocity: TOSS_VELOCITY,
  aimSpeedMetres: 5, minimumDepth: 0, defaultDepth: 0.46, powerDepthMetres: 0.5, powerKph: 20,
  timingWindow: 0.25, secondPace: 0.88, firstClearanceMetres: 0.08, secondClearanceMetres: 0.16,
  errorWidthMetres: 2.8, errorDepthMetres: 4.5, returnReachMetres: 0.255 * 5.018, returnContactHalfWindow: 0.035,
});

export interface ServeCpuProfile {
  readonly runSpeedMetres: number; readonly reaction: readonly [number, number]; readonly observe: number; readonly error: number;
  readonly bias: number; readonly history: number; readonly block: number; readonly returnSD: number; readonly returnPitch: number;
  readonly pace: number; readonly power: number; readonly margin: readonly [number, number]; readonly secondMargin: number;
  readonly firstSD: number; readonly secondSD: number;
}
/** CPU serving and return-reading tuning per difficulty (match-engine.js `SERVE_CPU`). */
export const SERVE_CPU: Readonly<Record<Difficulty, ServeCpuProfile>> = Object.freeze({
  beginner: { runSpeedMetres: 5.9, reaction: [0.08, 0.14], observe: 0.1, error: 0.3, bias: 0, history: 0, block: 0.14, returnSD: 0.024, returnPitch: 6, pace: 0.85, power: 0.1, margin: [0.45, 0.7], secondMargin: 1, firstSD: 0.095, secondSD: 0.065 },
  club: { runSpeedMetres: 6.1, reaction: [0.08, 0.135], observe: 0.08, error: 0.2, bias: 0.15, history: 0, block: 0.12, returnSD: 0.023, returnPitch: 3, pace: 0.92, power: 0.25, margin: [0.35, 0.6], secondMargin: 0.9, firstSD: 0.085, secondSD: 0.06 },
  ace: { runSpeedMetres: 6.3, reaction: [0.075, 0.125], observe: 0.06, error: 0.12, bias: 0.3, history: 4, block: 0.1, returnSD: 0.022, returnPitch: 1.2, pace: 0.95, power: 0.45, margin: [0.2, 0.45], secondMargin: 0.8, firstSD: 0.07, secondSD: 0.056 },
  pro: { runSpeedMetres: 6.3, reaction: [0.075, 0.125], observe: 0.06, error: 0.12, bias: 0.3, history: 4, block: 0.1, returnSD: 0.022, returnPitch: 1.2, pace: 0.95, power: 0.45, margin: [0.2, 0.45], secondMargin: 0.8, firstSD: 0.07, secondSD: 0.056 },
  legend: { runSpeedMetres: 6.4, reaction: [0.07, 0.115], observe: 0.04, error: 0.08, bias: 0.45, history: 10, block: 0.08, returnSD: 0.02, returnPitch: 1.1, pace: 0.97, power: 0.6, margin: [0.15, 0.4], secondMargin: 0.75, firstSD: 0.06, secondSD: 0.056 },
});

export interface ServeStats {
  attempts: number; firstAttempts: number; firstIn: number; secondAttempts: number; secondIn: number; faults: number; doubleFaults: number;
  lets: number; aces: number; unreturned: number; returnsMade: number; returnErrors: number; weakReturns: number; pointsPlayed: number; pointsWon: number;
  speedTotal: number; speedCount: number; fastest: number; powerAttempts: number; powerIn: number;
  firstSpeedTotal: number; firstSpeedCount: number; secondSpeedTotal: number; secondSpeedCount: number;
}
export const makeServeStats = (): ServeStats => ({
  attempts: 0, firstAttempts: 0, firstIn: 0, secondAttempts: 0, secondIn: 0, faults: 0, doubleFaults: 0,
  lets: 0, aces: 0, unreturned: 0, returnsMade: 0, returnErrors: 0, weakReturns: 0, pointsPlayed: 0, pointsWon: 0,
  speedTotal: 0, speedCount: 0, fastest: 0, powerAttempts: 0, powerIn: 0,
  firstSpeedTotal: 0, firstSpeedCount: 0, secondSpeedTotal: 0, secondSpeedCount: 0,
});

export interface ServeReturnProfile { readonly width: number; readonly depth: number; readonly speed: number; readonly clearance: number; readonly comfortKph: number; readonly attackKph: number }
/** How the CPU returns a serve per difficulty (match-engine.js `SERVE_RETURN`). */
export const SERVE_RETURN: Readonly<Record<Difficulty, ServeReturnProfile>> = {
  beginner: { width: 0.28, depth: 0.79, speed: 16.5, clearance: 0.11, comfortKph: 90, attackKph: 105 },
  club: { width: 0.34, depth: 0.82, speed: 18.5, clearance: 0.095, comfortKph: 100, attackKph: 115 },
  ace: { width: 0.43, depth: 0.85, speed: 20, clearance: 0.085, comfortKph: 108, attackKph: 122 },
  pro: { width: 0.46, depth: 0.86, speed: 20.5, clearance: 0.08, comfortKph: 110, attackKph: 125 },
  legend: { width: 0.5, depth: 0.89, speed: 22, clearance: 0.075, comfortKph: 115, attackKph: 130 },
};

/** Distance from the net in court units (baseline = 1); leaves a safe middle zone (match-engine.js `PRO_POSITION`). */
export const PRO_POSITION = Object.freeze({ deepOutWithin: 0.4, longTarget: 1.1 });
export const SINGLES_X = 0.82;
