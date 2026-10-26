import {
  handBounceBallXZ, handBounceBallY, handBounceContactWeight, handBounceCycle, resolveHandBounceConfig
} from "@aura3d/engine/game";

export const BALL_R = 0.13;

/** The Hoops dribble is the library hand-bounce kit with its default (Aura Hoops) profile. */
export const HOOPS_BOUNCE = resolveHandBounceConfig({ ballRadius: BALL_R });

export const DRIB_RIDE_END = HOOPS_BOUNCE.phases.rideEnd;
export const DRIB_PALM_TURN = HOOPS_BOUNCE.phases.palmTurn;
export const DRIB_FLOOR_AT = HOOPS_BOUNCE.phases.floorAt;
export const DRIB_CATCH_FROM = HOOPS_BOUNCE.phases.catchFrom;
export const DRIB_BALL_GAP = HOOPS_BOUNCE.ballGap;
export const DRIB_FLOOR_Y = HOOPS_BOUNCE.floorBallY;
export const DRIB_CYCLE_STAND = HOOPS_BOUNCE.standing.period;
export const DRIB_CYCLE_RUN = HOOPS_BOUNCE.running.period;
export const DRIB_SHOULDER_FALLBACK = 1.5; // world shoulder Y (standing) before sockets resolve
export const DRIB_PALM_TOP = HOOPS_BOUNCE.standing.palmTop;
export const DRIB_PALM_PUSH = HOOPS_BOUNCE.standing.palmPush;
export const DRIB_ARM_REACH = HOOPS_BOUNCE.armReach;
export const DRIB_PALM_TOP_RUN = HOOPS_BOUNCE.running.palmTop;
export const DRIB_PALM_PUSH_RUN = HOOPS_BOUNCE.running.palmPush;

export const dribbleCycleY = (t: number, shoulderY: number, moving = false) => handBounceCycle(HOOPS_BOUNCE, t, shoulderY, moving);
export const dribbleBallY = (t: number, palmY: number, releaseY: number, catchY: number) => handBounceBallY(HOOPS_BOUNCE, t, palmY, releaseY, catchY);
export const dribbleContactWeight = (phase: number) => handBounceContactWeight(HOOPS_BOUNCE, phase);
export const dribbleBallXZ = (
  palm: readonly [number, number, number], holder: { x: number; z: number; vx: number; vz: number }, phase: number
) => handBounceBallXZ(HOOPS_BOUNCE, palm, holder, phase);
