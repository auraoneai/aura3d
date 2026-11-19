// Aura FC 3D — pitch dimensions + movement constants.
// Shared by sim.ts / ai.ts / scene.ts / rigs (kept import-cycle free).

export const PITCH_HX = 30;        // half length, goal line to goal line (goals at x = ±30)
export const PITCH_HZ = 18;        // half width, touchline to touchline
export const GOAL_HALF_W = 3.8;    // goal mouth half-width
export const GOAL_H = 2.85;        // crossbar height
export const GOAL_DEPTH = 2.6;
export const BOX_DEPTH = 7.5;      // penalty area depth
export const BOX_HALF_W = 8.5;
export const PEN_X = PITCH_HX - 7; // penalty spot
export const CIRCLE_R = 4.5;
export const BALL_R = 0.16;        // sim radius — physics contact
export const BALL_VIS_R = 0.21;    // rendered radius — 0.42 m ball so it reads at gameplay camera; keep the node lifted to stay tangent to the grass

export const HALF_LEN = 90;        // seconds per half (arcade)
export const ET_LEN = 45;          // golden-goal extra time
export const RUN_SPEED = 4.8;
export const SPRINT_SPEED = 6.6;
export const GK_SPEED = 4.1;
export const ACCEL = 16.0;         // velocity approach rate
export const TRAP_R = 0.82;        // control radius
export const TRAP_H = 1.45;        // max first-touch height
export const KICK_R = 0.92;        // foot contact radius
export const SLIDE_TIME = 0.55;
export const SLIDE_SPEED = 8.2;
export const KEEPER_REACH = 1.15;
/** Half-width of the gap left open in each Favela cage end wall for the goal mouth (m). */
export const CAGE_GOAL_GAP = GOAL_HALF_W + 0.2;

/* ---- solid colliders, sized from what is drawn (nothing may visibly pass through anything) ---- */
/** Goal-frame tube radius (m): the procedural posts and crossbar (proceduralModels buildFifaGoalFrameNode). */
export const POST_R = 0.064;
/** Post axis |x|: the post's front face is flush with the goal line. */
export const POST_X = PITCH_HX + POST_R;
/** Post axis |z|: the post's outer face is flush with the mouth edge. */
export const POST_Z = GOAL_HALF_W - POST_R;
/** Crossbar axis height: the bar's top is at GOAL_H. */
export const BAR_Y = GOAL_H - POST_R;
/** Ball-centre contact distance from a post or bar axis: drawn post radius + drawn ball radius. */
export const FRAME_HIT_R = POST_R + BALL_VIS_R;
/** Player body radius for player↔player and player↔structure contact (m). */
export const PLAYER_R = 0.3;
/** Minimum centre distance between two players (m). */
export const PLAYER_MIN_SEP = PLAYER_R * 2;
/** Favela cage: inner faces of the end and side walls, wall thickness and the top of the rail (scene.ts draws these). */
export const CAGE_INNER_X = PITCH_HX + 0.2;
export const CAGE_INNER_Z = PITCH_HZ + 0.2;
export const CAGE_WALL_T = 0.3;
export const CAGE_WALL_H = 1.5;
export const CAGE_RAIL_H = 0.08;
export const CAGE_TOP = CAGE_WALL_H + CAGE_RAIL_H + 0.01;
