/**
 * Ballistics for Rooftop Buckets.
 *
 * The launch vector is solved analytically so charge/aim map onto a readable arc,
 * but everything after release runs on the canonical Rapier-backed world in
 * `hoop-sim.ts`: Rapier owns the ball transform, rim/backboard/ground/defender
 * contacts come from solver collision events, and the basket is a sensor the ball
 * must physically travel down through. `BallState` is a read model that rendering
 * follows; it is no longer an integration authority.
 */
import { type ShotSpot, COURT_BOUNDS, RIM_DIMENSIONS } from "./court";
import { type HoopState, type ShotResult } from "./rim";
import { BALL_RADIUS, createHoopSimulation, type HoopSimulation } from "./hoop-sim";

export const GRAVITY = -9.81;

/** Fixed solver step. Gameplay never advances with a variable browser delta. */
const FIXED_STEP = 1 / 60;
/** Safety ceiling only: a ball is otherwise settled by sleep/speed/bounds, not by a timer. */
const FLIGHT_TIMEOUT_SECONDS = 4;
const SETTLE_SPEED = 1.1;
/** Below rim height the ball is loose; it only needs to be slow near the floor. */
const SETTLE_HEIGHT = 1.2;
const SETTLE_DWELL_SECONDS = 0.35;
/**
 * Once the shot's outcome is physically decided the possession should end promptly,
 * otherwise a made basket spends seconds bouncing on the asphalt before the next
 * spot loads. Outcome + dwell is the game-feel ceiling; the timer is only a backstop.
 */
const DECIDED_DWELL_SECONDS = 1.1;
const DECIDED_SPEED = 3.2;
/**
 * A ball that has fallen this far back under the rim plane without scoring cannot score
 * any more this possession, so the outcome is physically decided even if it never
 * touched iron. Without this a long brick keeps bouncing on the asphalt for seconds and
 * stalls the next spot.
 */
const OUTCOME_SUNK_MARGIN = 0.35;
/** A suspended tab must not repay its whole absence in solver steps. */
const MAX_CATCH_UP_SECONDS = 0.1;

let sim: HoopSimulation | null = null;
let stepAccumulator = 0;
function hoopSim(): HoopSimulation {
  if (!sim) sim = createHoopSimulation({ defenderEnabled: true });
  return sim;
}

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
  /** True once the solved launch vector has been handed to the solver. */
  launched: boolean;
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
  hoopSim().placeBall(spot.x, 1.8, spot.z);
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
    launched: false,
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

let previewSim: HoopSimulation | null = null;

/**
 * Bounded no-contact preview, produced by the same solver that flies the ball so the
 * on-screen guide cannot drift from the real arc. It makes no promise after the first
 * rim/board contact.
 */
export function predictFirstFlight(
  spot: ShotSpot,
  power: number,
  aimPitch: number,
  hoop: HoopState,
  frames = 96,
  stride = 4,
  dt = 1 / 60
): readonly PredictedFlightPoint[] {
  // The same world definition the ball actually flies through, so the guide cannot
  // disagree with the solver over CCD substep decisions.
  if (!previewSim) previewSim = createHoopSimulation({ defenderEnabled: false });
  const velocity = calculateLaunchVelocity(spot, power, aimPitch, hoop);
  const speed = Math.hypot(velocity.vx, velocity.vy, velocity.vz);
  previewSim.placeBall(spot.x, 1.8, spot.z);
  previewSim.launch([velocity.vx, velocity.vy, velocity.vz], Math.min(9, speed * 1.4));
  const points: PredictedFlightPoint[] = [{ frame: 0, x: spot.x, y: 1.8, z: spot.z }];
  let position = previewSim.readBall().position;
  for (let frame = 1; frame <= frames; frame += 1) {
    previewSim.step(dt);
    position = previewSim.readBall().position;
    const [x, y, z] = position;
    if (frame % stride === 0) points.push({ frame, x, y, z });
    const startedInFront = spot.z >= hoop.z;
    if ((startedInFront && z <= hoop.z) || (!startedInFront && z >= hoop.z)) break;
  }
  return points;
}

/**
 * Advances the Rapier-backed hoop world and publishes the solver's truth.
 *
 * `dt` is accumulated into fixed 1/60 steps so a slow browser frame cannot change
 * the simulation outcome, and a suspended tab cannot produce one giant catch-up
 * step. Nothing here integrates position by hand.
 */
export function stepBall(ball: BallState, hoop: HoopState, dt: number): { ball: BallState; events: BallUpdateEvents } {
  const events: BallUpdateEvents = {
    clankedRim: false,
    thuddedBoard: false,
    swishedNet: false,
    scored: false,
    settled: false
  };

  const world = hoopSim();

  if (!ball.inFlight) {
    // Parked: keep the solver body under the shooter's current spot so the ball
    // never drifts away from where the route thinks it is.
    world.placeBall(ball.x, ball.y, ball.z);
    stepAccumulator = 0;
    return { ball, events };
  }

  let { launched } = ball;
  if (!launched) {
    // Backspin proportional to release speed; the solver resolves the resulting
    // rim and board behaviour instead of a hand-written bounce.
    const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
    world.launch([ball.vx, ball.vy, ball.vz], Math.min(9, speed * 1.4));
    launched = true;
    stepAccumulator = 0;
  }

  if (hoop.defenderActive) world.setDefender(hoop.defenderX, hoop.defenderY, hoop.defenderZ);
  else world.setDefender(0, -50, 0);

  // A true fixed-timestep accumulator: the solver only ever advances in exact
  // 1/60 increments, so 30 fps, 144 fps, and a throttled tab all replay the same
  // shot. Leftover time carries to the next frame instead of being rounded away.
  stepAccumulator = Math.min(stepAccumulator + dt, MAX_CATCH_UP_SECONDS);
  let iterations = 0;
  let hitRim = ball.hitRim;
  let hitBoard = ball.hitBoard;
  let hitDefender = ball.hitDefender;
  let hitGround = false;
  let hasScored = ball.hasScored;
  let result = ball.result;
  let rimSequence = ball.rimSequence;
  let settleDwell = (ball as unknown as { settleDwell?: number }).settleDwell ?? 0;
  let lastImpactSpeed = 0;

  while (stepAccumulator >= FIXED_STEP && iterations < 8) {
    stepAccumulator -= FIXED_STEP;
    iterations += 1;
    const facts = world.step(FIXED_STEP);
    lastImpactSpeed = facts.lastImpactSpeed;

    if (facts.rim && !hitRim) { hitRim = true; events.clankedRim = true; }
    if (facts.backboard && !hitBoard) { hitBoard = true; events.thuddedBoard = true; }
    if (facts.ground) hitGround = true;
    if (facts.defender && !hitDefender) {
      hitDefender = true;
      result = "blocked";
    }
    if (facts.scored && !hasScored) {
      hasScored = true;
      rimSequence = "scored";
      events.scored = true;
      if (!hitRim && !hitBoard) { result = "swish"; events.swishedNet = true; }
      else if (hitBoard) { result = "bank"; }
      else { result = "rim-in"; }
    }
  }

  const pose = world.readBall();
  const [x, y, z] = pose.position;
  const [vx, vy, vz] = pose.velocity;
  const flightTimer = ball.flightTimer + dt;

  const distanceToRim = Math.hypot(x - hoop.x, z - hoop.z);
  if (rimSequence === "outside" && vy < 0 && y > hoop.y && distanceToRim < RIM_DIMENSIONS.radius - 0.03) {
    rimSequence = "entered-above";
  }

  const speed = pose.speed;
  const outOfBounds =
    x < COURT_BOUNDS.minX - 2 || x > COURT_BOUNDS.maxX + 2 ||
    z < COURT_BOUNDS.minZ - 2 || z > COURT_BOUNDS.maxZ + 2 ||
    y < COURT_BOUNDS.groundY - 3;

  // Settle on physical rest (solver sleep, or sustained low speed near the floor),
  // on leaving the court, or on the documented safety ceiling.
  const cannotScoreAnymore = !hasScored && y < hoop.y - OUTCOME_SUNK_MARGIN && flightTimer > 0.4;
  const outcomeDecided = hasScored || hitDefender || cannotScoreAnymore || (hitGround && (hitRim || hitBoard));
  if (pose.sleeping || (speed < SETTLE_SPEED && y < SETTLE_HEIGHT)) settleDwell += dt;
  else if (outcomeDecided && y < hoop.y && speed < DECIDED_SPEED) settleDwell += dt;
  else settleDwell = 0;

  let settled = false;
  const dwellRequired = hasScored || hitDefender || cannotScoreAnymore
    ? SETTLE_DWELL_SECONDS
    : outcomeDecided ? DECIDED_DWELL_SECONDS : SETTLE_DWELL_SECONDS;
  if (settleDwell >= dwellRequired || outOfBounds || flightTimer >= FLIGHT_TIMEOUT_SECONDS) {
    settled = true;
    events.settled = true;
    if (!hasScored && !result) result = hitRim ? "rim-out" : hitBoard ? "rim-out" : "brick";
  }

  const next: BallState = {
    ...ball,
    x, y, z,
    vx, vy, vz,
    prevX: ball.x, prevY: ball.y, prevZ: ball.z,
    launched,
    hasScored, hitRim, hitBoard, hitDefender,
    result, rimSequence,
    flightTimer,
    settled,
    inFlight: !settled,
  };
  (next as unknown as { settleDwell: number }).settleDwell = settleDwell;
  (next as unknown as { lastImpactSpeed: number }).lastImpactSpeed = lastImpactSpeed;
  return { ball: next, events };
}

/** Rapier transform for the rendering layer to follow. */
export function readBallPose(): { position: readonly [number, number, number]; rotation: readonly [number, number, number, number] } {
  const pose = hoopSim().readBall();
  return { position: pose.position, rotation: pose.rotation };
}

/** Solver-side contact truth for evidence publishing. */
export function readShotContactState() {
  return hoopSim().shotState();
}

/** Live Rapier body census, published in route evidence so the claim cannot drift. */
export function readHoopBodyCount(): number {
  return hoopSim().bodyCount();
}

/** Re-parks the solver body when the route resets without a fresh BallState. */
export function syncBallToRoute(ball: BallState): void {
  if (ball.inFlight) return;
  hoopSim().placeBall(ball.x, ball.y, ball.z);
}
