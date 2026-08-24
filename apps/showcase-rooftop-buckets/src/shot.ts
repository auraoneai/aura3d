/**
 * Ballistics, charge-and-release trajectory calculation, and dynamic ball flight for Rooftop Buckets.
 */
import { type ShotSpot, COURT_BOUNDS, RIM_DIMENSIONS } from "./court";
import { type HoopState, type ShotResult, testHoopCollision, RESTITUTION } from "./rim";

export const GRAVITY = -9.81;

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  inFlight: boolean;
  settled: boolean;
  flightTimer: number;
  hasScored: boolean;
  hitRim: boolean;
  hitBoard: boolean;
  hitDefender: boolean;
  result: ShotResult | null;
  isGold: boolean;
  rimSequence: "outside" | "entered-above" | "scored";
}

export function createBallAtSpot(spot: ShotSpot, isGold = false): BallState {
  return {
    x: spot.x,
    y: 1.8, // Ball held at chest/release height
    z: spot.z,
    vx: 0,
    vy: 0,
    vz: 0,
    prevX: spot.x,
    prevY: 1.8,
    prevZ: spot.z,
    inFlight: false,
    settled: false,
    flightTimer: 0,
    hasScored: false,
    hitRim: false,
    hitBoard: false,
    hitDefender: false,
    result: null,
    isGold,
    rimSequence: "outside"
  };
}

/**
 * Calculates initial ballistic launch vector based on spot, power ratio [0, 1], and fine aim pitch [-1, 1].
 */
export function calculateLaunchVelocity(
  spot: ShotSpot,
  power: number,
  aimPitch: number,
  hoop: HoopState
): { vx: number; vy: number; vz: number } {
  const dx = hoop.x - spot.x;
  const dz = hoop.z - spot.z;
  const horizDist = Math.hypot(dx, dz) || 1.0;

  // Power deviation from sweet zone determines distance over/undershoot
  const powerDelta = power - spot.sweetPower;
  const distanceError = powerDelta * 3.2; // in meters

  const targetX = hoop.x + distanceError * (dx / horizDist) + hoop.contestAimOffset;
  const targetZ = hoop.z + distanceError * (dz / horizDist);
  const targetY = hoop.y;

  const y0 = 1.8; // Release height
  // Apex height scales with distance for natural shooting arc
  const arcHeightBonus = Math.max(0.6, horizDist * 0.18);
  const apexY = Math.max(targetY + 0.4, targetY + arcHeightBonus + aimPitch * 0.35);

  const vy = Math.sqrt(Math.max(0.1, -2 * GRAVITY * (apexY - y0)));
  const tUp = vy / -GRAVITY;
  const tDown = Math.sqrt(Math.max(0.01, (2 * (apexY - targetY)) / -GRAVITY));
  const totalTime = Math.max(0.5, tUp + tDown);

  const vx = (targetX - spot.x) / totalTime;
  const vz = (targetZ - spot.z) / totalTime;

  return { vx, vy, vz };
}

export interface BallUpdateEvents {
  clankedRim: boolean;
  thuddedBoard: boolean;
  swishedNet: boolean;
  scored: boolean;
  settled: boolean;
}

export interface PredictedFlightPoint {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The exact authored free-flight integrator shared by prediction and flight. */
export function integrateFreeFlight(
  state: Pick<BallState, "x" | "y" | "z" | "vx" | "vy" | "vz">,
  dt: number
): Pick<BallState, "x" | "y" | "z" | "vx" | "vy" | "vz"> {
  return {
    x: state.x + state.vx * dt,
    y: state.y + state.vy * dt,
    z: state.z + state.vz * dt,
    vx: state.vx,
    vy: state.vy + GRAVITY * dt,
    vz: state.vz
  };
}

/** Bounded no-contact preview; it makes no promise after the first rim/board contact. */
export function predictFirstFlight(
  spot: ShotSpot,
  power: number,
  aimPitch: number,
  hoop: HoopState,
  frames = 96,
  stride = 4,
  dt = 1 / 60
): readonly PredictedFlightPoint[] {
  const velocity = calculateLaunchVelocity(spot, power, aimPitch, hoop);
  let state = { x: spot.x, y: 1.8, z: spot.z, ...velocity };
  const points: PredictedFlightPoint[] = [{ frame: 0, x: state.x, y: state.y, z: state.z }];
  for (let frame = 1; frame <= frames; frame += 1) {
    state = integrateFreeFlight(state, dt);
    if (frame % stride === 0) points.push({ frame, x: state.x, y: state.y, z: state.z });
    const startedInFront = spot.z >= hoop.z;
    if ((startedInFront && state.z <= hoop.z) || (!startedInFront && state.z >= hoop.z)) break;
  }
  return points;
}

/**
 * Steps the ball physics forward by dt seconds.
 */
export function stepBall(ball: BallState, hoop: HoopState, dt: number): { ball: BallState; events: BallUpdateEvents } {
  const events: BallUpdateEvents = {
    clankedRim: false,
    thuddedBoard: false,
    swishedNet: false,
    scored: false,
    settled: false
  };

  if (!ball.inFlight) {
    return { ball, events };
  }

  const prevX = ball.x;
  const prevY = ball.y;
  const prevZ = ball.z;

  const integrated = integrateFreeFlight(ball, dt);
  let { x, y, z, vx, vy, vz } = integrated;

  let hasScored = ball.hasScored;
  let hitRim = ball.hitRim;
  let hitBoard = ball.hitBoard;
  let hitDefender = ball.hitDefender;
  let result = ball.result;
  let rimSequence = ball.rimSequence;
  let flightTimer = ball.flightTimer + dt;

  const distanceToRim = Math.hypot(x - hoop.x, z - hoop.z);
  if (rimSequence === "outside" && vy < 0 && y > hoop.y && distanceToRim < RIM_DIMENSIONS.radius - 0.03) {
    rimSequence = "entered-above";
  }

  // 1. Test Rim, Backboard, Sensor & Defender
  const col = testHoopCollision(
    { x, y, z },
    { x: prevX, y: prevY, z: prevZ },
    { vx, vy, vz },
    hoop,
    0.12,
    rimSequence === "entered-above"
  );

  if (col.hitDefender && !hitDefender) {
    hitDefender = true;
    result = "blocked";
  }

  if (col.hitBoard && !hitBoard) {
    hitBoard = true;
    events.thuddedBoard = true;
  }

  if (col.hitRim && !hitRim) {
    hitRim = true;
    events.clankedRim = true;
  }

  if (col.scored && !hasScored) {
    hasScored = true;
    rimSequence = "scored";
    events.scored = true;
    if (!hitRim && !hitBoard) {
      result = "swish";
      events.swishedNet = true;
    } else if (hitBoard) {
      result = "bank";
    } else {
      result = "rim-in";
    }
  }

  vx = col.reboundVx;
  vy = col.reboundVy;
  vz = col.reboundVz;

  // 2. Ground Collision (asphalt court)
  const ballRadius = 0.12;
  if (y <= COURT_BOUNDS.groundY + ballRadius) {
    y = COURT_BOUNDS.groundY + ballRadius;
    if (Math.abs(vy) > 0.5) {
      vy = -vy * RESTITUTION.ground;
      vx *= 0.85; // Ground roll friction
      vz *= 0.85;
    } else {
      vy = 0;
      vx *= 0.7;
      vz *= 0.7;
    }
  }

  // 3. Settle or Out of Bounds
  let settled = false;
  if (flightTimer >= 2.5 || (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1 && Math.abs(vz) < 0.1 && y <= ballRadius + 0.05)) {
    settled = true;
    events.settled = true;
    if (!hasScored && !result) {
      result = hitRim ? "rim-out" : "brick";
    }
  }

  return {
    ball: {
      ...ball,
      x,
      y,
      z,
      vx,
      vy,
      vz,
      prevX,
      prevY,
      prevZ,
      hasScored,
      hitRim,
      hitBoard,
      hitDefender,
      result,
      rimSequence,
      flightTimer,
      settled,
      inFlight: !settled
    },
    events
  };
}
