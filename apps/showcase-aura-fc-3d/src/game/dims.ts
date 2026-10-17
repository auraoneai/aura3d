// Aura FC 3D — pitch dimensions + movement constants.
// Shared by sim.ts / ai.ts / scene.ts / rigs (kept import-cycle free).

export const PITCH_HX = 26;        // half length, goal line to goal line
export const PITCH_HZ = 17;        // half width, touchline to touchline
export const GOAL_HALF_W = 3.0;    // goal mouth half-width
export const GOAL_H = 2.3;         // crossbar height
export const GOAL_DEPTH = 2.2;
export const BOX_DEPTH = 7.5;      // penalty area depth
export const BOX_HALF_W = 8.5;
export const PEN_X = PITCH_HX - 7; // penalty spot
export const CIRCLE_R = 4.5;
export const BALL_R = 0.16;

export const HALF_LEN = 90;        // seconds per half (arcade)
export const ET_LEN = 45;          // golden-goal extra time
export const RUN_SPEED = 4.6;
export const SPRINT_SPEED = 6.4;
export const GK_SPEED = 3.9;
export const ACCEL = 9.5;          // velocity approach rate
export const TRAP_R = 0.72;        // control radius
export const TRAP_H = 1.35;        // max first-touch height
export const KICK_R = 0.85;        // foot contact radius
export const SLIDE_TIME = 0.55;
export const SLIDE_SPEED = 8.2;
export const KEEPER_REACH = 1.05;
