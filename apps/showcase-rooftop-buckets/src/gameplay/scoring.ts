/** Deterministic five-heat session, score, streak, and clock state. */
import { type ShotResult } from "./rim";

export const HEAT_CONFIG = [
  { heat: 1, target: 6, duration: 45, shotClock: 8, name: "Open Heat", objective: "Score 6 points", requiredSpotIds: [] },
  { heat: 2, target: 3, duration: 45, shotClock: 8, name: "Three-Spot Heat", objective: "Make from left, center, and right", requiredSpotIds: [1, 2, 3] },
  { heat: 3, target: 6, duration: 35, shotClock: 6, name: "Pressure Heat", objective: "Score 6 through a telegraphed contest", requiredSpotIds: [] },
  { heat: 4, target: 3, duration: 35, shotClock: 6, name: "Fire Heat", objective: "Make three consecutive shots", requiredSpotIds: [] },
  { heat: 5, target: 1, duration: 12, shotClock: 12, name: "Gold-Ball Finale", objective: "Sink the single gold ball", requiredSpotIds: [] }
] as const;

export const HEAT_COUNT = HEAT_CONFIG.length;
export const SHOT_CLOCK_DURATION = HEAT_CONFIG[0].shotClock;

export interface GameScoreState {
  heat: number;
  score: number;
  target: number;
  streak: number;
  onFire: boolean;
  fireAchieved: boolean;
  possession: number;
  makes: number;
  misses: number;
  madeSpotIds: readonly number[];
  goldAttempted: boolean;
  goldMade: boolean;
  shotClock: number;
  heatTimer: number;
  state: "playing" | "paused" | "heat-cleared" | "game-over" | "victory";
  lastShotResult: ShotResult | null;
  lastPointsEarned: number;
}

export function heatConfig(heat: number) {
  return HEAT_CONFIG[Math.max(0, Math.min(HEAT_COUNT - 1, heat - 1))]!;
}

export function initialScoreState(heat = 1): GameScoreState {
  const config = heatConfig(heat);
  return {
    heat: config.heat,
    score: 0,
    target: config.target,
    streak: 0,
    onFire: false,
    fireAchieved: false,
    possession: 1,
    makes: 0,
    misses: 0,
    madeSpotIds: [],
    goldAttempted: false,
    goldMade: false,
    shotClock: config.shotClock,
    heatTimer: config.duration,
    state: "playing",
    lastShotResult: null,
    lastPointsEarned: 0
  };
}

export function advanceHeat(currentState: GameScoreState): GameScoreState {
  if (currentState.heat >= HEAT_COUNT) return { ...currentState, state: "victory" };
  return initialScoreState(currentState.heat + 1);
}

export interface ShotScoreEvent {
  pointsEarned: number;
  isFireIgnited: boolean;
  isClockViolation: boolean;
  isHeatCleared: boolean;
  isGameOver: boolean;
  isGoldWin: boolean;
}

function emptyEvent(): ShotScoreEvent {
  return { pointsEarned: 0, isFireIgnited: false, isClockViolation: false, isHeatCleared: false, isGameOver: false, isGoldWin: false };
}

function objectiveComplete(state: GameScoreState): boolean {
  const config = heatConfig(state.heat);
  if (state.heat === 2) return config.requiredSpotIds.every((id) => state.madeSpotIds.includes(id));
  if (state.heat === 4) return state.fireAchieved;
  if (state.heat === 5) return state.goldMade;
  return state.score >= config.target;
}

export function recordShotOutcome(
  currentState: GameScoreState,
  outcome: ShotResult,
  spotPoints: 2 | 3,
  isGold: boolean,
  spotId?: number
): { state: GameScoreState; event: ShotScoreEvent } {
  if (currentState.state !== "playing") return { state: currentState, event: emptyEvent() };
  const isMake = outcome === "swish" || outcome === "rim-in" || outcome === "bank";
  const nextStreak = isMake ? currentState.streak + 1 : 0;
  const nextOnFire = nextStreak >= 3;
  const isFireIgnited = !currentState.onFire && nextOnFire;
  const pointsEarned = isMake ? spotPoints * (currentState.onFire ? 2 : 1) * (isGold ? 2 : 1) : 0;
  const madeSpotIds = isMake && spotId !== undefined && !currentState.madeSpotIds.includes(spotId)
    ? [...currentState.madeSpotIds, spotId].sort((a, b) => a - b)
    : currentState.madeSpotIds;
  const goldAttempted = currentState.goldAttempted || (currentState.heat === 5 && isGold);
  const goldMade = currentState.goldMade || (currentState.heat === 5 && isGold && isMake);
  let next: GameScoreState = {
    ...currentState,
    score: currentState.score + pointsEarned,
    streak: nextStreak,
    onFire: nextOnFire,
    fireAchieved: currentState.fireAchieved || nextOnFire,
    possession: currentState.possession + 1,
    makes: currentState.makes + (isMake ? 1 : 0),
    misses: currentState.misses + (isMake ? 0 : 1),
    madeSpotIds,
    goldAttempted,
    goldMade,
    shotClock: heatConfig(currentState.heat).shotClock,
    lastShotResult: outcome,
    lastPointsEarned: pointsEarned
  };
  const complete = objectiveComplete(next);
  let isHeatCleared = false;
  let isGameOver = false;
  let isGoldWin = false;
  if (currentState.heat === 5 && goldAttempted) {
    next = { ...next, state: goldMade ? "victory" : "game-over" };
    isGoldWin = goldMade;
    isGameOver = !goldMade;
  } else if (complete) {
    next = { ...next, state: "heat-cleared" };
    isHeatCleared = true;
  }
  return { state: next, event: { pointsEarned, isFireIgnited, isClockViolation: false, isHeatCleared, isGameOver, isGoldWin } };
}

export function updateClocks(
  currentState: GameScoreState,
  dt: number,
  isBallInFlight = false
): { state: GameScoreState; event: ShotScoreEvent } {
  if (currentState.state !== "playing") return { state: currentState, event: emptyEvent() };
  const config = heatConfig(currentState.heat);
  let shotClock = isBallInFlight ? currentState.shotClock : currentState.shotClock - dt;
  let heatTimer = currentState.heatTimer - dt;
  let next = currentState;
  let event = emptyEvent();
  if (shotClock <= 0) {
    const finale = currentState.heat === 5;
    next = {
      ...next,
      shotClock: config.shotClock,
      streak: 0,
      onFire: false,
      misses: next.misses + 1,
      possession: next.possession + 1,
      goldAttempted: finale || next.goldAttempted,
      state: finale ? "game-over" : next.state,
      lastShotResult: "violation"
    };
    shotClock = config.shotClock;
    event = { ...event, isClockViolation: true, isGameOver: finale };
  }
  if (heatTimer <= 0) {
    heatTimer = 0;
    const complete = objectiveComplete(next);
    const victory = next.heat === 5 && complete;
    next = { ...next, state: victory ? "victory" : complete ? "heat-cleared" : "game-over" };
    event = { ...event, isHeatCleared: complete && !victory, isGameOver: !complete, isGoldWin: victory };
  }
  return { state: { ...next, shotClock: Math.max(0, shotClock), heatTimer: Math.max(0, heatTimer) }, event };
}
