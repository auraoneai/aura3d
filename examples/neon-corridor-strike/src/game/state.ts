export type FpsStatus = "playing" | "won" | "lost";

export interface FpsRunState {
  status: FpsStatus;
  hp: number;
  ammo: number;
  reserve: number;
  score: number;
  kills: number;
  shotsFired: number;
  hits: number;
  reloads: number;
  pickups: number;
  resets: number;
  paused: boolean;
  pointerLockRequested: number;
  pointerLockActive: boolean;
  ignoreFireUntil: number;
  lmbHeld: boolean;
  fireHeld: boolean;
  fireQueued: boolean;
  yaw: number;
  pitch: number;
  grounded: boolean;
  sprinting: boolean;
  objective: string;
  killed: string[];
  collected: string[];
  exitReached: boolean;
  lastHitName: string;
  spawnGuard: number;
}

export const MAX_HP = 100;
export const MAG_SIZE = 12;
export const START_RESERVE = 24;
export const WALK_Y = 0.9;
export const PLAYER_START = [0, WALK_Y, 9] as const;
export const EYE_HEIGHT = 1.45;
export const LOOK_AHEAD = 0.35;

export function createInitialState(): FpsRunState {
  return {
    status: "playing",
    hp: MAX_HP,
    ammo: MAG_SIZE,
    reserve: START_RESERVE,
    score: 0,
    kills: 0,
    shotsFired: 0,
    hits: 0,
    reloads: 0,
    pickups: 0,
    resets: 0,
    paused: false,
    pointerLockRequested: 0,
    pointerLockActive: false,
    ignoreFireUntil: 0,
    lmbHeld: false,
    fireHeld: false,
    fireQueued: false,
    yaw: 0,
    pitch: 0,
    grounded: true,
    sprinting: false,
    objective: "Clear the corridor or reach the exit",
    killed: [],
    collected: [],
    exitReached: false,
    lastHitName: "",
    spawnGuard: 8
  };
}

export function lookDirection(yaw: number, pitch: number): readonly [number, number, number] {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

export function rightDirection(yaw: number): readonly [number, number, number] {
  return [Math.cos(yaw), 0, -Math.sin(yaw)];
}
